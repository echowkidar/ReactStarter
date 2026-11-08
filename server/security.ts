// Security helpers: response headers, a small rate limiter, safe upload file
// names and the login check for /uploads.
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionAdmin, sessionDepartmentId } from "./auth";

// ── Headers ──────────────────────────────────────────────────────────────────
// No full script CSP yet (the app loads Turnstile, Google fonts, OpenCV, a local
// scanner websocket…); these directives are safe for all pages.
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=15552000");
  res.removeHeader("X-Powered-By");
  next();
}

// ── Rate limiting (in memory, per client IP) ─────────────────────────────────
export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, Math.min(opts.windowMs, 60_000)).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.resetAt <= now) {
      h = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, h);
    }
    h.count++;
    if (h.count > opts.max) {
      const retry = Math.ceil((h.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ message: opts.message || "Too many requests. Please wait a few minutes and try again." });
    }
    next();
  };
}

// ── Upload file names ────────────────────────────────────────────────────────
// The extension comes from the (checked) file type, never from the user's file
// name, so nothing uploaded can be stored as .html/.svg/.js and run in the browser.
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export function safeExtension(file: { mimetype: string; originalname: string }): string {
  const byType = EXT_BY_MIME[String(file.mimetype || "").toLowerCase()];
  if (byType) return byType;
  // Some scanners send PDFs as application/octet-stream
  if (/\.pdf$/i.test(file.originalname || "")) return ".pdf";
  return ".bin";
}

export function safeUploadName(prefix: string, file: { mimetype: string; originalname: string }): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExtension(file)}`;
}

// ── /uploads ─────────────────────────────────────────────────────────────────
const INLINE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"]);
const EMPLOYEE_DOC_COLS = ["pan_card_url", "bank_proof_url", "aadhar_card_url", "office_memo_url", "joining_report_url", "term_extension_url"];

const likeSuffix = (rel: string) => "%/uploads/" + rel.replace(/[\\%_]/g, (c) => "\\" + c);

type FileInfo = { isPublic: boolean; employeeDepts: number[] };
const infoCache = new Map<string, { at: number; info: FileInfo }>();

async function fileInfo(rel: string): Promise<FileInfo> {
  const cached = infoCache.get(rel);
  if (cached && Date.now() - cached.at < 60_000) return cached.info;
  const like = likeSuffix(rel);
  // Login-page downloads and notice pictures (also shown in e-mails) are public
  const pub = (await db.execute(sql`
    SELECT 1 FROM useful_downloads WHERE file_url LIKE ${like} OR thumbnail_url LIKE ${like}
    UNION ALL SELECT 1 FROM notices WHERE image_url LIKE ${like}
    LIMIT 1`)).rows.length > 0;
  const empWhere = sql.join(EMPLOYEE_DOC_COLS.map((c) => sql`${sql.raw(c)} LIKE ${like}`), sql` OR `);
  const emp = (await db.execute(sql`SELECT DISTINCT department_id FROM employees WHERE ${empWhere}`)).rows as any[];
  const info = { isPublic: pub, employeeDepts: emp.map((r) => Number(r.department_id)) };
  infoCache.set(rel, { at: Date.now(), info });
  if (infoCache.size > 5000) infoCache.clear();
  return info;
}

/** 401 for a file: a short page when opened in a browser tab, JSON for the app */
function loginNeeded(req: Request, res: Response) {
  res.status(401);
  if (req.accepts(["html", "json"]) === "html") {
    res.removeHeader("Content-Disposition");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    return res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login required</title><style>body{font-family:system-ui,Arial,sans-serif;background:#f8fafc;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08);padding:28px 32px;max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;font-size:14px}a{display:inline-block;margin:6px;padding:8px 14px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-size:14px}</style></head>
<body><div class="box"><h1>Login required</h1><p>This file can only be opened by a logged-in user who is allowed to see it. Please log in on this site and open the file again.</p>
<a href="/admin/login">Admin login</a><a href="/">Department login</a></div></body></html>`);
  }
  return res.json({ message: "Please log in again", code: "AUTH_REQUIRED" });
}

/**
 * Departments that are party to the dak this file belongs to (sender, receiving office,
 * recipients). Empty list = not (yet) linked to a dak, e.g. a scan before saving.
 * Not cached: forwarding changes the parties.
 */
async function dakFileDepartments(rel: string): Promise<number[]> {
  const like = likeSuffix(rel);
  const docs = (await db.execute(sql`
    SELECT DISTINCT x.id, x.sender_department_id AS sender, x.ai_extracted_data->>'_receivedByDepartmentId' AS rcv
    FROM dispatch_documents x
    WHERE x.file_url LIKE ${like} OR x.ai_extracted_data->>'_originalFileUrl' LIKE ${like}
       OR EXISTS (SELECT 1 FROM dispatch_attachments a WHERE a.dispatch_id = x.id AND a.file_url LIKE ${like})`)).rows as any[];
  if (docs.length === 0) return [];
  const ids = docs.map((d) => Number(d.id));
  const recips = (await db.execute(sql`SELECT DISTINCT department_id FROM dispatch_recipients
    WHERE department_id IS NOT NULL AND dispatch_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)).rows as any[];
  const set = new Set<number>();
  for (const d of docs) {
    if (Number(d.sender) > 0) set.add(Number(d.sender));
    if (d.rcv) set.add(Number(d.rcv));
  }
  for (const r of recips) set.add(Number(r.department_id));
  return Array.from(set);
}

/**
 * Who may open a file under /uploads:
 *   admins → everything;
 *   anyone → login-page downloads and notice pictures;
 *   LPC files → admins only;
 *   employee documents (PAN, Aadhaar, bank…) → only that employee's department;
 *   dak files → only departments that are party to that dak;
 *   other files (tickets, reports…) → any logged-in user.
 * Also: files are never run as web pages (nosniff, sandbox, download for other types).
 */
export async function uploadsGuard(req: Request, res: Response, next: NextFunction) {
  let rel: string;
  try {
    rel = decodeURIComponent(req.path).replace(/^\/+/, "");
  } catch {
    return res.status(400).end();
  }
  if (!rel || rel.includes("..") || rel.includes("\\") || rel.includes("\0")) return res.status(400).end();

  const ext = path.extname(rel).toLowerCase();
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Never kept by Cloudflare / shared caches: access is checked per person
  res.setHeader("Cache-Control", "private, no-store");
  if (!INLINE_EXT.has(ext)) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Disposition", "attachment");
  }

  try {
    if (await sessionAdmin(req)) return next();
    const isLpc = rel.startsWith("lpc/");
    const info = isLpc ? { isPublic: false, employeeDepts: [] } : await fileInfo(rel);
    const dakDepts = rel.startsWith("dispatch/") ? await dakFileDepartments(rel) : null;
    if (info.isPublic) return next();
    const deptId = await sessionDepartmentId(req);
    if (!deptId) return loginNeeded(req, res);
    if (isLpc) return res.status(403).json({ message: "You are not allowed to access this", code: "FORBIDDEN" });
    if (info.employeeDepts.length && !info.employeeDepts.includes(deptId)) {
      return res.status(403).json({ message: "You are not allowed to access this", code: "FORBIDDEN" });
    }
    // Dak files (incl. confidential ones): only the sender and the recipients
    if (dakDepts && dakDepts.length && !dakDepts.includes(deptId)) {
      return res.status(403).json({ message: "You are not allowed to access this", code: "FORBIDDEN" });
    }
    next();
  } catch (error) {
    console.error("[Uploads] access check failed:", error);
    res.status(500).end();
  }
}
