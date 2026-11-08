// Dak (receive / dispatch) core: register numbers, who-is-acting, SLA due dates,
// creating an outward dispatch (also used by e-file drafts), reply linking,
// QR verification stamp, background OCR and e-file correspondence links.
import type { Request } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { sql, eq, and, desc, asc, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  departments,
  dispatchDocuments,
  dispatchRecipients,
  dispatchTracking,
  departmentGroupMembers,
  externalContacts,
} from "../shared/schema";
import { deptActor } from "./dakStaff";
import { sessionAdmin } from "./auth";
import { notify } from "./notify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DAK_UPLOAD_DIR = path.join(__dirname, "../uploads/dispatch");
if (!fs.existsSync(DAK_UPLOAD_DIR)) fs.mkdirSync(DAK_UPLOAD_DIR, { recursive: true });

// ─── Statuses / constants ─────────────────────────────────────────────────
/** A department's dak row is "closed" in these states (no further action there) */
export const CLOSED_STATUSES = ["disposed", "forwarded", "returned", "withdrawn", "cancelled"];
export const CLOSED_SQL = sql.raw(`('${CLOSED_STATUSES.join("','")}')`);
export const DISPOSAL_TYPES = ["Filed", "Replied", "Action completed", "Noted (no action needed)", "Sent to other office", "Other"];
export const DISPATCH_MODES: Record<string, string> = {
  electronic: "Electronic only",
  by_hand: "By hand",
  peon_book: "Peon book",
  registered_post: "Registered post",
  speed_post: "Speed post",
  courier: "Courier",
  email: "E-mail",
};
/** Days allowed for action, by priority (default "action by" date) */
export const SLA_DAYS: Record<string, number> = { immediate: 1, urgent: 3, normal: 7 };

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function slaDueDate(priority: unknown, from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + (SLA_DAYS[String(priority)] ?? SLA_DAYS.normal));
  return ymd(d);
}

export const isoDateOrNull = (value: unknown): string | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value) : null;

export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function publicBaseUrl(): string {
  return String(process.env.BASE_URL || process.env.APP_URL || "https://salarysection.com").replace(/\/+$/, "");
}

// ─── Register numbers ─────────────────────────────────────────────────────
// Per department, per financial year (April–March): highest number used + 1,
// written as "12/SSFAD/2026-27". A per-register database lock prevents duplicates.
export type SqlRunner = { execute: (query: any) => Promise<any> };

export function generateShortName(name: string): string {
  const skipWords = new Set(["of", "the", "and", "&", "in", "for", "to", "a", "an", "f/o"]);
  return name
    .replace(/[()[\],]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !skipWords.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function fyBounds(at: Date) {
  const y = at.getMonth() >= 3 ? at.getFullYear() : at.getFullYear() - 1;
  return { start: new Date(y, 3, 1), end: new Date(y + 1, 3, 1) };
}

/** "2026-27" */
export function fyLabel(at: Date): string {
  const y = at.getMonth() >= 3 ? at.getFullYear() : at.getFullYear() - 1;
  return `${y}-${pad((y + 1) % 100)}`;
}

export function leadingNumber(value: unknown): number {
  const m = /^\s*(\d+)/.exec(String(value ?? ""));
  return m ? Number(m[1]) : 0;
}

export const normalizeNo = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");

async function departmentShortName(runner: SqlRunner, departmentId: number): Promise<string> {
  const row = (await runner.execute(sql`SELECT name FROM departments WHERE id = ${departmentId}`)).rows[0] as any;
  return generateShortName(row?.name || "DEPT") || "DEPT";
}

export async function lockRegister(tx: SqlRunner, kind: "in" | "out", departmentId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dak-${kind}-${departmentId}`}))`);
}

export async function usedInwardNumbers(runner: SqlRunner, departmentId: number, at: Date): Promise<string[]> {
  const { start, end } = fyBounds(at);
  const rows = (await runner.execute(sql`
    SELECT COALESCE(r.inward_number, d.inward_number) AS n
    FROM dispatch_recipients r JOIN dispatch_documents d ON d.id = r.dispatch_id
    WHERE r.department_id = ${departmentId}
      AND r.received_at >= ${start.toISOString()} AND r.received_at < ${end.toISOString()}`)).rows as any[];
  return rows.map((r) => r.n).filter(Boolean);
}

export async function nextInwardNumber(runner: SqlRunner, departmentId: number, at: Date): Promise<string> {
  const used = await usedInwardNumbers(runner, departmentId, at);
  const next = used.reduce((max, n) => Math.max(max, leadingNumber(n)), 0) + 1;
  return `${next}/${await departmentShortName(runner, departmentId)}/${fyLabel(at)}`;
}

export async function nextOutwardNumber(runner: SqlRunner, departmentId: number, at: Date): Promise<string> {
  const { start, end } = fyBounds(at);
  const rows = (await runner.execute(sql`
    SELECT outward_number AS n FROM dispatch_documents
    WHERE sender_department_id = ${departmentId} AND outward_number IS NOT NULL
      AND created_at >= ${start.toISOString()} AND created_at < ${end.toISOString()}`)).rows as any[];
  const next = rows.reduce((max, r) => Math.max(max, leadingNumber(r.n)), 0) + 1;
  return `${next}/${await departmentShortName(runner, departmentId)}/${fyLabel(at)}`;
}

/** Receipt moment: the chosen receipt date (YYYY-MM-DD) at the current time, never in the future */
export function receiptMoment(dateStr: unknown): Date {
  const now = new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ""));
  if (!m) return now;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), now.getHours(), now.getMinutes(), now.getSeconds());
  return isNaN(at.getTime()) || at > now ? now : at;
}

/** This department's own (latest) recipient row of a dispatch */
export async function myRecipientRow(dispatchId: number, departmentId: number) {
  const [row] = await db
    .select()
    .from(dispatchRecipients)
    .where(and(eq(dispatchRecipients.dispatchId, dispatchId), eq(dispatchRecipients.departmentId, departmentId)))
    .orderBy(desc(dispatchRecipients.id))
    .limit(1);
  return row;
}

// ─── Who is acting ────────────────────────────────────────────────────────
export type Actor = {
  departmentId: number;
  departmentName: string;
  staffId: number | null;
  staffName: string | null;
  role: string;
  isSupervisor: boolean;
  /** Recorded in tracking: "Name (Role), Department" */
  label: string;
};

/** The person/department doing this request (session), else an admin, else the body's department */
export async function who(req: Request, fallbackDepartmentId?: unknown, fallbackName?: unknown): Promise<Actor> {
  const actor = await deptActor(req);
  if (actor) return actor;
  const departmentId = Number(fallbackDepartmentId) || 0;
  let departmentName = String(fallbackName || "");
  if (!departmentName && departmentId) {
    const row = (await db.execute(sql`SELECT name FROM departments WHERE id = ${departmentId}`)).rows[0] as any;
    departmentName = row?.name || "";
  }
  const admin = await sessionAdmin(req);
  return {
    departmentId,
    departmentName: departmentName || "Department",
    staffId: null,
    staffName: admin ? (admin.name || admin.email) : null,
    role: admin ? "admin" : "department",
    isSupervisor: true,
    label: admin ? `${admin.name || admin.email} (Admin)` : (departmentName || "Department"),
  };
}

export async function track(entry: {
  dispatchId: number; action: string; actor: Actor; details: string; recipientDepartmentId?: number | null;
}, runner: any = db) {
  await runner.insert(dispatchTracking).values({
    dispatchId: entry.dispatchId,
    action: entry.action,
    actionByDepartmentId: entry.actor.departmentId || null,
    actionByName: entry.actor.label,
    actionByStaffId: entry.actor.staffId,
    details: entry.details,
    recipientDepartmentId: entry.recipientDepartmentId ?? null,
  });
}

/** All recipient rows of these dispatches, with department / external contact names (3 queries) */
export async function recipientsWithNames(dispatchIds: number[]) {
  if (dispatchIds.length === 0) return [];
  const rows = await db.select().from(dispatchRecipients)
    .where(inArray(dispatchRecipients.dispatchId, dispatchIds)).orderBy(asc(dispatchRecipients.id));
  const deptIds = Array.from(new Set(rows.map((r) => r.departmentId).filter((x): x is number => !!x)));
  const extIds = Array.from(new Set(rows.map((r) => r.externalContactId).filter((x): x is number => !!x)));
  const depts = deptIds.length
    ? await db.select({ id: departments.id, name: departments.name, email: departments.email }).from(departments).where(inArray(departments.id, deptIds))
    : [];
  const exts = extIds.length
    ? await db.select({ id: externalContacts.id, name: externalContacts.name, email: externalContacts.email }).from(externalContacts).where(inArray(externalContacts.id, extIds))
    : [];
  return rows.map((r) => {
    const d = r.departmentId ? depts.find((x) => x.id === r.departmentId) : undefined;
    const e = r.externalContactId ? exts.find((x) => x.id === r.externalContactId) : undefined;
    return { ...r, name: d?.name || e?.name || (r.recipientType === "external" ? "Unknown External" : "Unknown"), email: d?.email || e?.email || null };
  });
}

// ─── Inbox item shape (recipient row + document) ──────────────────────────
type RecipientRow = typeof dispatchRecipients.$inferSelect;
type DocumentRow = typeof dispatchDocuments.$inferSelect;

export function toInboxItem(r: RecipientRow, d: DocumentRow) {
  const extra = (d.aiExtractedData as any) || {};
  const { ocrText: _ocr, ...doc } = d;
  return {
    ...doc,
    subject: d.isConfidential ? (extra._actualSubject || "CONFIDENTIAL") : d.subject,
    inwardNumber: r.inwardNumber || d.inwardNumber,
    recipientStatus: r.status,
    recipientId: r.id,
    receivedAt: r.receivedAt,
    readAt: r.readAt,
    markedToStaff: r.markedToStaff,
    markedStaffIds: r.markedStaffIds,
    markedBy: r.markedBy,
    markedAt: r.markedAt,
    staffRemarks: r.staffRemarks,
    actionDueDate: r.actionDueDate,
    acknowledgedAt: r.acknowledgedAt,
    acknowledgedBy: r.acknowledgedBy,
    disposedAt: r.disposedAt,
    disposalType: r.disposalType,
    disposalRemarks: r.disposalRemarks,
    fileNumber: r.fileNumber,
    emailSent: r.emailSent,
    isPhysicalReceive: extra._physicalReceive === true,
  };
}

// ─── E-file correspondence link ───────────────────────────────────────────
/** Put a dak on an e-file (correspondence side). Returns the file number, or null if not allowed. */
export async function linkDakToFile(efileId: number, dispatchId: number, actor: Actor, note: string, runner: SqlRunner = db): Promise<string | null> {
  const file = (await runner.execute(sql`SELECT id, file_number, department_id, status FROM efiles WHERE id = ${efileId}`)).rows[0] as any;
  if (!file || Number(file.department_id) !== actor.departmentId || file.status !== "open") return null;
  const already = (await runner.execute(sql`SELECT 1 FROM efile_entries WHERE efile_id = ${efileId} AND kind = 'correspondence' AND dispatch_id = ${dispatchId} LIMIT 1`)).rows.length > 0;
  if (!already) {
    await runner.execute(sql`INSERT INTO efile_entries (efile_id, kind, body, dispatch_id, by_staff_id, by_name)
      VALUES (${efileId}, 'correspondence', ${note}, ${dispatchId}, ${actor.staffId}, ${actor.label})`);
  }
  return file.file_number;
}

// ─── QR verification stamp on outward documents ───────────────────────────
const ascii = (s: unknown) => String(s ?? "").replace(/[^\x20-\x7E]/g, "?");

/**
 * Give an outward document a public verification link (QR) and a SHA-256 of the
 * final file. PDFs/images are turned into a PDF with a small QR stamp at the
 * bottom of page 1 (the original file is kept). Never throws.
 */
export async function stampOutwardDocument(dispatchId: number): Promise<void> {
  try {
    const [doc] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
    if (!doc) return;
    const token = doc.verifyToken || crypto.randomBytes(16).toString("base64url");
    const url = `${publicBaseUrl()}/dak/verify/${token}`;
    const m = /^\/uploads\/dispatch\/([A-Za-z0-9._-]+)$/.exec(doc.fileUrl || "");
    const local = m ? path.join(DAK_UPLOAD_DIR, m[1]) : null;
    if (!local || !fs.existsSync(local)) {
      await db.update(dispatchDocuments).set({ verifyToken: token }).where(eq(dispatchDocuments.id, dispatchId));
      return;
    }
    const original = fs.readFileSync(local);
    let finalBytes: Buffer = original;
    let finalUrl = doc.fileUrl;
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const isPdf = doc.fileType === "pdf" || /\.pdf$/i.test(local) || original.subarray(0, 4).toString() === "%PDF";
      let pdf: any;
      if (isPdf) {
        pdf = await PDFDocument.load(original, { ignoreEncryption: true });
      } else {
        pdf = await PDFDocument.create();
        let img: any;
        if (original[0] === 0xff && original[1] === 0xd8) img = await pdf.embedJpg(original);
        else if (original[0] === 0x89 && original[1] === 0x50) img = await pdf.embedPng(original);
        else {
          const sharp = (await import("sharp")).default;
          img = await pdf.embedPng(await sharp(original).png().toBuffer());
        }
        const page = pdf.addPage([595, 842]);
        const scale = Math.min(555 / img.width, 742 / img.height);
        page.drawImage(img, { x: (595 - img.width * scale) / 2, y: 80 + (742 - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
      }
      // @ts-ignore qrcode ships without type declarations
      const QR: any = await import("qrcode");
      const qrPng: Buffer = await (QR.toBuffer ?? QR.default.toBuffer)(url, { margin: 1, width: 180 });
      const qr = await pdf.embedPng(qrPng);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const page = pdf.getPage(0);
      const { width } = page.getSize();
      page.drawRectangle({ x: 16, y: 10, width: Math.min(width - 32, 420), height: 60, color: rgb(1, 1, 1), opacity: 0.92, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      page.drawImage(qr, { x: 20, y: 13, width: 54, height: 54 });
      const dated = doc.createdAt ? new Date(doc.createdAt) : new Date();
      page.drawText(ascii(`Outward No. ${doc.outwardNumber || "-"}   Dated ${pad(dated.getDate())}-${pad(dated.getMonth() + 1)}-${dated.getFullYear()}`), { x: 82, y: 52, size: 8.5, font: bold });
      page.drawText(ascii(`Issued by: ${doc.senderName}`).slice(0, 80), { x: 82, y: 39, size: 7.5, font });
      page.drawText(ascii(`Verify: ${url}`).slice(0, 95), { x: 82, y: 26, size: 7, font, color: rgb(0.1, 0.2, 0.6) });
      page.drawText("Scan the QR code to check this document on the university system.", { x: 82, y: 15, size: 6.5, font, color: rgb(0.35, 0.35, 0.35) });
      finalBytes = Buffer.from(await pdf.save());
      const name = m![1].replace(/\.[^.]+$/, "") + "-verified.pdf";
      fs.writeFileSync(path.join(DAK_UPLOAD_DIR, name), finalBytes);
      finalUrl = `/uploads/dispatch/${name}`;
    } catch (stampErr) {
      console.error("[Dak] QR stamp failed, keeping the original file:", stampErr);
    }
    const sha = crypto.createHash("sha256").update(finalBytes).digest("hex");
    await db.update(dispatchDocuments).set({
      verifyToken: token,
      fileSha256: sha,
      fileUrl: finalUrl,
      fileType: finalUrl !== doc.fileUrl ? "pdf" : doc.fileType,
      aiExtractedData: { ...((doc.aiExtractedData as any) || {}), ...(finalUrl !== doc.fileUrl ? { _originalFileUrl: doc.fileUrl } : {}) },
    }).where(eq(dispatchDocuments.id, dispatchId));
  } catch (error) {
    console.error("[Dak] verification setup failed:", error);
  }
}

// ─── Letter PDF for an approved draft (e-file DFA) ────────────────────────
function wrapLines(text: string, font: any, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    let line = "";
    for (const word of ascii(para).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildLetterPdf(p: {
  departmentName: string; outwardNumber: string; to: string[]; subject: string; body: string; signatory: string;
}): Promise<{ fileUrl: string; fileType: string }> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  let page = pdf.addPage([595, 842]);
  let y = 800;
  const write = (text: string, f = font, size = 11.5, x = 60) => {
    if (y < 110) { page = pdf.addPage([595, 842]); y = 800; }
    page.drawText(text, { x, y, size, font: f });
    y -= size + 5;
  };
  const center = (text: string, f: any, size: number) => {
    const w = f.widthOfTextAtSize(ascii(text), size);
    page.drawText(ascii(text), { x: (595 - w) / 2, y, size, font: f });
    y -= size + 6;
  };
  center("ALIGARH MUSLIM UNIVERSITY", bold, 15);
  center(p.departmentName, bold, 12);
  y -= 6;
  const now = new Date();
  write(ascii(`No. ${p.outwardNumber}`), bold);
  write(ascii(`Dated: ${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`));
  y -= 8;
  write("To,");
  for (const t of p.to) for (const l of wrapLines(t, font, 11.5, 440)) write(l, font, 11.5, 80);
  y -= 8;
  for (const l of wrapLines(`Subject: ${p.subject}`, bold, 11.5, 475)) write(l, bold);
  y -= 6;
  for (const para of String(p.body || "").split(/\n\s*\n|\r?\n/)) {
    for (const l of wrapLines(para, font, 11.5, 475)) write(l);
    y -= 6;
  }
  y -= 24;
  for (const l of wrapLines(p.signatory, bold, 11.5, 220)) write(l, bold, 11.5, 340);
  const name = `dfa-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(DAK_UPLOAD_DIR, name), Buffer.from(await pdf.save()));
  return { fileUrl: `/uploads/dispatch/${name}`, fileType: "pdf" };
}

// ─── Background OCR (searchable text of scanned documents) ────────────────
const ocrJobs: Array<() => Promise<void>> = [];
let ocrRunning = false;

/** Text layer of a PDF (computer-made letters have one; scans usually do not) */
async function pdfText(localPath: string): Promise<string> {
  try {
    // @ts-ignore legacy build has no type declarations
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(localPath)), useSystemFonts: true, isEvalSupported: false }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      text += " " + content.items.map((it: any) => it.str || "").join(" ");
    }
    await doc.destroy();
    return text.replace(/\s+/g, " ").trim();
  } catch (e: any) {
    console.error("[Dak OCR] PDF text layer could not be read:", e?.message || e);
    return "";
  }
}

async function ocrFile(localPath: string, isPdf: boolean): Promise<string> {
  let images: Buffer[] = [];
  if (isPdf) {
    // Typed PDFs: use their text directly (fast, exact); only scans need image OCR
    const layer = await pdfText(localPath);
    if (layer.replace(/Verify:.*$/i, "").length >= 40) return layer.slice(0, 30000);
    const mod: any = await import("pdf-img-convert");
    const convert = mod.convert ?? mod.default?.convert;
    let pages: any[] = [];
    try { pages = await convert(localPath, { page_numbers: [1, 2, 3], scale: 2 }); }
    catch { pages = await convert(localPath, { page_numbers: [1], scale: 2 }); }
    images = pages.map((p: any) => Buffer.from(p));
  } else {
    images = [fs.readFileSync(localPath)];
  }
  const T: any = await import("tesseract.js");
  const recognize = T.recognize ?? T.default?.recognize;
  let text = "";
  for (const img of images) {
    const { data } = await recognize(img, "eng", { logger: () => {} });
    text += ` ${data?.text || ""}`;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 30000);
}

/** Read the text of a dak file (or attachment) in the background, one job at a time */
export function queueOcr(target: { kind: "document" | "attachment"; id: number; fileUrl: string | null | undefined }) {
  if (process.env.DAK_OCR === "off") return;
  const m = /^\/uploads\/dispatch\/([A-Za-z0-9._-]+)$/.exec(target.fileUrl || "");
  if (!m) return;
  const local = path.join(DAK_UPLOAD_DIR, m[1]);
  ocrJobs.push(async () => {
    if (!fs.existsSync(local)) return;
    const text = await ocrFile(local, /\.pdf$/i.test(local));
    if (!text) return;
    if (target.kind === "document") await db.execute(sql`UPDATE dispatch_documents SET ocr_text = ${text} WHERE id = ${target.id}`);
    else await db.execute(sql`UPDATE dispatch_attachments SET ocr_text = ${text} WHERE id = ${target.id}`);
  });
  if (!ocrRunning) {
    ocrRunning = true;
    (async () => {
      while (ocrJobs.length) {
        const job = ocrJobs.shift()!;
        try { await job(); } catch (e: any) { console.error("[Dak OCR] failed:", e?.message || e); }
      }
      ocrRunning = false;
    })();
  }
}

// ─── Create an outward dispatch ───────────────────────────────────────────
export type OutwardInput = {
  actor: Actor;
  senderDepartmentId: number;
  senderName: string;
  documentType: string;
  subject: string;
  dispatchNumber?: string | null;
  dispatchDate?: string | null;
  referenceNumber?: string | null;
  isConfidential?: boolean;
  priority?: string;
  aiExtractedData?: any;
  aiConfidence?: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
  recipients: Array<{ type: string; id: number }>;
  sendEmail?: boolean;
  dispatchMode?: string | null;
  postalTrackingNo?: string | null;
  postageAmount?: string | number | null;
  inReplyToRecipientId?: number | null;
  efileId?: number | null;
  /** Build the file once the outward number is known (e-file drafts) */
  buildFile?: (outwardNumber: string) => Promise<{ fileUrl: string; fileType: string }>;
};

export class DakError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function createOutwardDispatch(p: OutwardInput) {
  const senderId = p.senderDepartmentId;
  const mode = p.dispatchMode && DISPATCH_MODES[p.dispatchMode] ? p.dispatchMode : "electronic";
  const postage = p.postageAmount !== undefined && p.postageAmount !== null && String(p.postageAmount).trim() !== ""
    ? Number(p.postageAmount) : null;
  if (postage !== null && (!Number.isFinite(postage) || postage < 0)) throw new DakError(400, "Postage must be a positive amount");

  // Reply link: must be this department's own inward dak
  let replyRow: RecipientRow | undefined;
  if (p.inReplyToRecipientId) {
    [replyRow] = await db.select().from(dispatchRecipients).where(eq(dispatchRecipients.id, Number(p.inReplyToRecipientId)));
    if (!replyRow || replyRow.departmentId !== senderId) throw new DakError(400, "The dak you reply to is not in your inbox");
  }
  if (p.efileId) {
    const file = (await db.execute(sql`SELECT department_id, status FROM efiles WHERE id = ${p.efileId}`)).rows[0] as any;
    if (!file || Number(file.department_id) !== senderId || file.status !== "open") throw new DakError(400, "The e-file is not an open file of your department");
  }

  let fileUrl = p.fileUrl || "";
  if (fileUrl && !/^\/uploads\/dispatch\/[A-Za-z0-9._-]+$/.test(fileUrl)) fileUrl = "";
  const confidential = !!p.isConfidential;

  const { dispatch, outwardNumber } = await db.transaction(async (tx) => {
    await lockRegister(tx, "out", senderId);
    const outwardNumber = await nextOutwardNumber(tx, senderId, new Date());
    const [dispatch] = await tx.insert(dispatchDocuments).values({
      senderDepartmentId: senderId,
      senderName: p.senderName,
      documentType: p.documentType,
      subject: confidential ? "CONFIDENTIAL" : p.subject,
      dispatchNumber: p.dispatchNumber || null,
      dispatchDate: isoDateOrNull(p.dispatchDate),
      referenceNumber: p.referenceNumber || null,
      outwardNumber,
      fileUrl,
      fileType: p.fileType || "image",
      isConfidential: confidential,
      priority: p.priority || "normal",
      aiExtractedData: { ...(p.aiExtractedData || {}), _actualSubject: p.subject },
      aiConfidence: p.aiConfidence || null,
      dispatchMode: mode,
      postalTrackingNo: p.postalTrackingNo || null,
      postageAmount: postage === null ? null : postage.toFixed(2),
      inReplyToDispatchId: replyRow ? replyRow.dispatchId : null,
      inReplyToRecipientId: replyRow ? replyRow.id : null,
      efileId: p.efileId || null,
    }).returning();
    return { dispatch, outwardNumber };
  });

  if (p.buildFile) {
    const built = await p.buildFile(outwardNumber);
    await db.update(dispatchDocuments).set({ fileUrl: built.fileUrl, fileType: built.fileType }).where(eq(dispatchDocuments.id, dispatch.id));
    dispatch.fileUrl = built.fileUrl;
    dispatch.fileType = built.fileType;
  }

  // Recipients (groups expanded, duplicates and the sender removed)
  const parsed: Array<{ type: string; id: number }> = [];
  for (const r of p.recipients || []) {
    if (r.type === "group") {
      const members = await db.select({ departmentId: departmentGroupMembers.departmentId })
        .from(departmentGroupMembers).where(eq(departmentGroupMembers.groupId, Number(r.id)));
      for (const m of members) if (m.departmentId !== senderId) parsed.push({ type: "department", id: m.departmentId });
    } else if ((r.type === "department" || r.type === "external") && Number.isFinite(Number(r.id))) {
      if (!(r.type === "department" && Number(r.id) === senderId)) parsed.push({ type: r.type, id: Number(r.id) });
    }
  }
  const seen = new Set<string>();
  const recipients = parsed.filter((r) => { const k = `${r.type}-${r.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (recipients.length > 0) {
    await db.insert(dispatchRecipients).values(recipients.map((r) => ({
      dispatchId: dispatch.id,
      recipientType: r.type,
      departmentId: r.type === "department" ? r.id : null,
      externalContactId: r.type === "external" ? r.id : null,
      status: "dispatched" as const,
    })));
  }

  // In-app / SMS / WhatsApp to the recipient departments (e-mail: "Send email" tick box below)
  const deptIds = recipients.filter((r) => r.type === "department").map((r) => r.id);
  if (deptIds.length) {
    void notify("dak.incoming", deptIds.map((id) => ({ kind: "department" as const, departmentId: id })), {
      title: `New dak from ${p.senderName}`,
      text: `${p.documentType} ${outwardNumber}: ${confidential ? "CONFIDENTIAL" : p.subject}`,
      link: "/dashboard/dispatch",
    });
  }

  await track({
    dispatchId: dispatch.id, action: "created", actor: p.actor,
    details: `Dispatched to ${recipients.length} recipient(s). Outward No: ${outwardNumber}. Mode: ${DISPATCH_MODES[mode]}${p.postalTrackingNo ? ` (${p.postalTrackingNo})` : ""}`,
  });

  // Reply: the inward dak is answered → disposed as "Replied"
  if (replyRow) {
    if (replyRow.receivedAt && !CLOSED_STATUSES.includes(replyRow.status)) {
      await db.update(dispatchRecipients).set({
        status: "disposed", disposedAt: new Date(), disposalType: "Replied",
        disposalRemarks: `Reply sent vide Outward No. ${outwardNumber}`, disposedBy: p.actor.label,
      }).where(eq(dispatchRecipients.id, replyRow.id));
    }
    await track({
      dispatchId: replyRow.dispatchId, action: "replied", actor: p.actor,
      details: `Replied vide Outward No. ${outwardNumber}`, recipientDepartmentId: senderId,
    });
  }
  if (p.efileId) await linkDakToFile(p.efileId, dispatch.id, p.actor, `Outward No. ${outwardNumber} issued`);

  // QR verification stamp, then searchable text
  await stampOutwardDocument(dispatch.id);
  const [final] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatch.id));
  queueOcr({ kind: "document", id: dispatch.id, fileUrl: ((final?.aiExtractedData as any)?._originalFileUrl) || final?.fileUrl });

  if (p.sendEmail) await sendDispatchEmails(final || dispatch, recipients.filter((r) => r.type === "department").map((r) => r.id), p.actor, p.subject);

  return { dispatch: { ...(final || dispatch), subject: p.subject }, outwardNumber, recipientCount: recipients.length };
}

/** E-mail the recipient departments about a dispatch (also used for forwards) */
export async function sendDispatchEmails(doc: DocumentRow, departmentIds: number[], actor: Actor, actualSubject?: string) {
  if (departmentIds.length === 0) return;
  try {
    const { sendDispatchNotificationEmail } = await import("./emailService");
    const [sender] = await db.select({ email: departments.email }).from(departments).where(eq(departments.id, actor.departmentId || doc.senderDepartmentId));
    let sent = 0;
    for (const id of departmentIds) {
      const [dept] = await db.select({ email: departments.email }).from(departments).where(eq(departments.id, id));
      if (!dept?.email || dept.email.includes("example.com") || dept.email.includes("placeholder")) continue;
      const result = await sendDispatchNotificationEmail(
        dept.email,
        doc.isConfidential ? "CONFIDENTIAL" : (actualSubject || (doc.aiExtractedData as any)?._actualSubject || doc.subject),
        actor.departmentName || doc.senderName,
        doc.documentType,
        doc.outwardNumber || doc.dispatchNumber || "",
        doc.isConfidential,
        doc.fileUrl,
        sender?.email,
      );
      if (result.success) {
        sent++;
        await db.update(dispatchRecipients).set({ emailSent: true, emailSentAt: new Date() })
          .where(and(eq(dispatchRecipients.dispatchId, doc.id), eq(dispatchRecipients.departmentId, id)));
      }
    }
    await track({ dispatchId: doc.id, action: "email_sent", actor, details: sent > 0 ? `Email notifications sent to ${sent} recipient(s)` : "Email notifications failed to send" });
  } catch (error) {
    console.error("[Dak] e-mail notification error:", error);
  }
}
