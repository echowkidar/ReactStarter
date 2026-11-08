// Login sessions for admins and departments.
// ─────────────────────────────────────────────────────────────────────────────
// After a correct login the server keeps a session (table `user_sessions`) and
// the browser gets an httpOnly cookie. Every /api request is checked here:
//   • public routes (login, password reset, LPC verify, external API…) pass;
//   • everything else needs a logged-in admin or department;
//   • a department can only reach its own data (department id in the URL,
//     its own attendance reports, its own employees, its own mailbox);
//   • /api/admin/* is for admins (plus a few read routes department pages use).
// A session ends when the password is changed (same as the old token did).
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";

declare module "express-session" {
  interface SessionData {
    adminId?: number;
    adminPwFp?: string;
    departmentId?: number;
    deptPwFp?: string;
    // Staff login inside a department (department_staff.id)
    staffId?: number;
    staffPwFp?: string;
  }
}

export const SESSION_COOKIE = "amu.sid";
const SESSION_HOURS = 12;

/** Short fingerprint of the stored password: a password change ends old sessions */
export function passwordFingerprint(password: unknown): string {
  return crypto.createHash("sha256").update(String(password ?? "")).digest("hex").slice(0, 32);
}

/** SESSION_SECRET from the environment, else one random secret kept in the database */
async function sessionSecret(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (fromEnv) console.warn("[Auth] SESSION_SECRET is shorter than 32 characters — using the stored secret instead");
  await db.execute(sql`CREATE TABLE IF NOT EXISTS app_secrets (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  await db.execute(sql`INSERT INTO app_secrets (key, value)
    VALUES ('session_secret', ${crypto.randomBytes(48).toString("hex")}) ON CONFLICT (key) DO NOTHING`);
  const row = (await db.execute(sql`SELECT value FROM app_secrets WHERE key = 'session_secret'`)).rows[0] as any;
  return String(row.value);
}

/** Cookie sessions. Must be registered before any /api route. */
export async function setupSessions(app: Express) {
  // Behind the tunnel / reverse proxy: lets `secure: "auto"` see https and req.ip the client
  app.set("trust proxy", 1);
  const PgStore = connectPgSimple(session);
  app.use(session({
    name: SESSION_COOKIE,
    secret: await sessionSecret(),
    store: new PgStore({ pool, tableName: "user_sessions", createTableIfMissing: true, pruneSessionInterval: 15 * 60 }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
    },
  }));
  // Logins made before the shared-domain cookie: give them the shared domain too
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const domain = cookieDomainFor(req);
    if (domain && req.session && (req.session.adminId || req.session.departmentId) && req.session.cookie.domain !== domain) {
      req.session.cookie.domain = domain;
    }
    next();
  });
}

/**
 * Cookie domain shared by "www.<site>" and "<site>": the site is reachable on both,
 * while stored file links use one of them. Without this, a login made on www is not
 * sent to links without www (and the other way round). No domain for localhost / IPs.
 */
export function cookieDomainFor(req: Request): string | undefined {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  const host = String(req.hostname || "").toLowerCase();
  if (!host || host === "localhost" || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return undefined;
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Start a fresh session id at login (no session fixation), keeping the other role's login */
export function regenerateKeeping(req: Request): Promise<void> {
  const keep = {
    adminId: req.session.adminId, adminPwFp: req.session.adminPwFp,
    departmentId: req.session.departmentId, deptPwFp: req.session.deptPwFp,
    staffId: req.session.staffId, staffPwFp: req.session.staffPwFp,
  };
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      Object.assign(req.session, keep);
      const domain = cookieDomainFor(req);
      if (domain) req.session.cookie.domain = domain;
      resolve();
    });
  });
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

/** The logged-in admin (row from `admins`), or null. Ends the admin login if the password changed. */
export async function sessionAdmin(req: Request): Promise<any | null> {
  if ((req as any).adminUser) return (req as any).adminUser;
  const id = req.session?.adminId;
  if (!id) return null;
  const admin = (await db.execute(sql`SELECT id, email, password, role, user_code AS "userCode", name
    FROM admins WHERE id = ${id}`)).rows[0] as any;
  if (!admin || passwordFingerprint(admin.password) !== req.session.adminPwFp) {
    delete req.session.adminId;
    delete req.session.adminPwFp;
    return null;
  }
  (req as any).adminUser = admin;
  return admin;
}

/** Staff person of this request (after sessionDepartmentId ran), or null */
export function sessionStaff(req: Request): { id: number; name: string; role: string; departmentId: number; email: string } | null {
  return (req as any).sessionStaff || null;
}

function endDepartmentLogin(req: Request) {
  delete req.session.departmentId;
  delete req.session.deptPwFp;
  delete req.session.staffId;
  delete req.session.staffPwFp;
}

/** The logged-in department id, or null. Ends the department login if the password changed. */
export async function sessionDepartmentId(req: Request): Promise<number | null> {
  if ((req as any).sessionDepartmentId) return (req as any).sessionDepartmentId;
  const id = req.session?.departmentId;
  if (!id) return null;
  // Staff login: the person must still be active, in this department, with the same password
  if (req.session.staffId) {
    const staff = (await db.execute(sql`SELECT id, name, role, email, department_id, password_hash, is_active
      FROM department_staff WHERE id = ${req.session.staffId}`)).rows[0] as any;
    if (!staff || !staff.is_active || Number(staff.department_id) !== Number(id)
        || passwordFingerprint(staff.password_hash) !== req.session.staffPwFp) {
      endDepartmentLogin(req);
      return null;
    }
    (req as any).sessionStaff = { id: Number(staff.id), name: staff.name, role: staff.role, departmentId: Number(id), email: staff.email };
    (req as any).sessionDepartmentId = Number(id);
    return Number(id);
  }
  const dept = (await db.execute(sql`SELECT id, password FROM departments WHERE id = ${id}`)).rows[0] as any;
  if (!dept || passwordFingerprint(dept.password) !== req.session.deptPwFp) {
    endDepartmentLogin(req);
    return null;
  }
  (req as any).sessionDepartmentId = Number(dept.id);
  return Number(dept.id);
}

function unauthorized(res: Response, message = "Please log in again") {
  return res.status(401).json({ message, code: "AUTH_REQUIRED" });
}
function forbidden(res: Response, message = "You are not allowed to access this") {
  return res.status(403).json({ message, code: "FORBIDDEN" });
}

/** Admin-only routes. Same checks as before (view-only VEW cannot write), now from the session. */
export async function verifyAdminSession(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await sessionAdmin(req);
    if (!admin) return unauthorized(res, "Unauthorized: please log in as admin");

    const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
    // Exception: nasir may mark exports even though the account is view-only
    const isNasirExporting = admin.email === "nasir@amu.ac.in" && (
      (req.path === "/api/admin/attendance/mark-exported" && req.method === "POST") ||
      (req.path === "/api/admin/attendance/bulk-export-date" && req.method === "PATCH") ||
      (/^\/api\/admin\/attendance\/entry\/\d+\/exported$/.test(req.path) && req.method === "POST")
    );
    if (admin.userCode === "VEW" && writeMethods.includes(req.method) && !isNasirExporting) {
      return forbidden(res, "Forbidden: View-only access");
    }
    next();
  } catch (error) {
    console.error("[Auth] admin check failed:", error);
    return unauthorized(res, "Unauthorized: Token validation failed");
  }
}

// ── The /api gate ────────────────────────────────────────────────────────────

/** Open without login (they check their own secrets / are part of logging in) */
function isPublic(req: Request): boolean {
  const p = req.path;
  if (p.startsWith("/api/auth/")) return true;               // login, logout, reset, session
  if (p.startsWith("/api/public/")) return true;             // LPC verify, scanner helper
  if (p.startsWith("/api/external/")) return true;           // checked by the API key
  if (p === "/api/heartbeat/logout") return true;            // sent while logging out
  if (p === "/api/visitors/track") return true;              // login page visit counter
  if (p === "/api/chat-webhook") return true;                // help chat on the login page
  if (req.method === "GET" && (p === "/api/downloads" || /^\/api\/downloads\/\d+\/access$/.test(p))) return true; // login page
  if (req.method === "GET" && p === "/api/department-names") return true; // registration form
  return false;
}

/** /api/admin/* routes that department pages also use (read the settings, their own report…) */
const DEPT_ALLOWED_ADMIN = [
  { method: "GET", re: /^\/api\/admin\/settings$/ },
  { method: "GET", re: /^\/api\/admin\/attendance\/\d+$/ },   // own report, checked below
  { method: "PATCH", re: /^\/api\/admin\/employees\/reorder$/ }, // own employees, checked below
];

/** Admin actions that live outside /api/admin/ — never for departments */
const ADMIN_ONLY_OUTSIDE_ADMIN = [
  { method: "PATCH", re: /^\/api\/departments\/\d+\/(?:attendance-permit|supplementary-permit|reporting-permit)$/ },
  { method: "POST", re: /^\/api\/notices$/ },
  { method: "DELETE", re: /^\/api\/notices\/\d+$/ },
  { method: "PATCH", re: /^\/api\/tickets\/\d+$/ },
  { method: "GET", re: /^\/api\/tickets\/stats$/ },          // all departments' ticket counts
  { method: "GET", re: /^\/api\/notices$/ },                 // every notice (departments use their own list)
  { method: "GET", re: /^\/api\/dispatch\/all-dispatches$/ }, // every dispatch
];

/** One row exists? (ownership checks) */
async function exists(query: ReturnType<typeof sql>): Promise<boolean> {
  return (await db.execute(query)).rows.length > 0;
}

/** Ownership of records addressed by their own id (dispatch, tickets, documents, notices, …) */
async function recordOwnershipOk(req: Request, p: string, deptId: number): Promise<boolean> {
  const write = req.method !== "GET";
  let m: RegExpExecArray | null;

  // Dispatch: sender or one of the recipients
  if ((m = /^\/api\/dispatch\/(\d+)(?:\/|$)/.exec(p))) {
    const id = Number(m[1]);
    if (!(await exists(sql`SELECT 1 FROM dispatch_documents WHERE id = ${id} AND sender_department_id = ${deptId}
        UNION ALL SELECT 1 FROM dispatch_recipients WHERE dispatch_id = ${id} AND department_id = ${deptId} LIMIT 1`))) return false;
  }
  // Dispatch actions name the acting department in the body/query: must be this one
  if (p.startsWith("/api/dispatch")) {
    for (const v of [req.body?.departmentId, req.query?.departmentId]) {
      if (v !== undefined && v !== null && v !== "" && Number(v) !== deptId) return false;
    }
  }
  // Dispatch groups: everyone may read; only the creating department may change its own groups
  if ((m = /^\/api\/dispatch-groups\/(\d+)(?:\/|$)/.exec(p)) && write) {
    if (!(await exists(sql`SELECT 1 FROM department_groups WHERE id = ${Number(m[1])}
        AND created_by_department_id = ${deptId} AND COALESCE(is_system, false) = false`))) return false;
  }
  if (p === "/api/dispatch-groups" && req.method === "POST" && Number(req.body?.createdByDepartmentId) !== deptId) return false;
  // External contacts: shared ones + own; only own may be changed
  if ((m = /^\/api\/external-contacts\/(\d+)$/.exec(p)) && write) {
    if (!(await exists(sql`SELECT 1 FROM external_contacts WHERE id = ${Number(m[1])} AND created_by_department_id = ${deptId}`))) return false;
  }
  if (p === "/api/external-contacts") {
    if (req.method === "POST" && Number(req.body?.createdByDepartmentId) !== deptId) return false;
    if (req.method === "GET" && req.query?.departmentId && Number(req.query.departmentId) !== deptId) return false;
  }

  // Tickets: own only (view, reply)
  if ((m = /^\/api\/tickets\/(\d+)(?:\/|$)/.exec(p))) {
    if (!(await exists(sql`SELECT 1 FROM tickets WHERE id = ${Number(m[1])} AND department_id = ${deptId}`))) return false;
  }
  // Documents register: departments see the shared list; only own entries may be changed
  if ((m = /^\/api\/documents\/(\d+)$/.exec(p)) && write) {
    if (!(await exists(sql`SELECT 1 FROM documents WHERE id = ${Number(m[1])} AND department_id = ${deptId}`))) return false;
  }
  // Notices: global ones, or ones sent to this department
  if ((m = /^\/api\/notices\/(\d+)$/.exec(p))) {
    const id = Number(m[1]);
    if (!(await exists(sql`SELECT 1 FROM notices WHERE id = ${id} AND is_global = true
        UNION ALL SELECT 1 FROM notice_recipients WHERE notice_id = ${id} AND department_id = ${deptId} LIMIT 1`))) return false;
  }
  // Employee history / transfer info: own employee, a transfer with this department, or reporting here
  if ((m = /^\/api\/employees\/(\d+)\/(?:history|transfer-request|latest-rejected-transfer)$/.exec(p))) {
    const id = Number(m[1]);
    if (!(await exists(sql`SELECT 1 FROM employees WHERE id = ${id} AND department_id = ${deptId}
        UNION ALL SELECT 1 FROM transfer_requests WHERE employee_id = ${id} AND (from_department_id = ${deptId} OR to_department_id = ${deptId})
        UNION ALL SELECT 1 FROM reporting_employees WHERE employee_id = ${id} AND host_department_id = ${deptId} LIMIT 1`))) return false;
  }
  // Employee groups of a department: the group must be that department's
  if ((m = /^\/api\/departments\/\d+\/groups\/(\d+)(?:\/|$)/.exec(p))) {
    if (!(await exists(sql`SELECT 1 FROM employee_groups WHERE id = ${Number(m[1])} AND department_id = ${deptId}`))) return false;
  }
  return true;
}

/**
 * For upload (multipart) routes, whose form fields are only readable after multer:
 * a logged-in department may only act for itself (field = its department id).
 */
export function requireBodyDepartment(field: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (await sessionAdmin(req)) return next();
      const deptId = await sessionDepartmentId(req);
      if (!deptId) return unauthorized(res);
      if (Number(req.body?.[field]) !== deptId) return forbidden(res);
      next();
    } catch (error) {
      console.error("[Auth] department field check failed:", error);
      res.status(500).json({ message: "Could not check the login" });
    }
  };
}

/** Writes a view-only (VEW) admin may still make outside /api/admin (own mailbox, presence) */
const VEW_WRITE_ALLOWED = [/^\/api\/heartbeat$/, /^\/api\/email\//, /^\/api\/user-email$/];

/** URL patterns whose number is a department id */
const DEPT_ID_IN_PATH = [
  /^\/api\/departments\/(\d+)(?:\/|$)/,
  /^\/api\/dispatch\/(?:outbox|inbox|inbox-count|next-inward-number|next-outward-number|stats|search|my|reports|registers|acknowledgements)\/(\d+)(?:\/|$)/,
  /^\/api\/live\/department\/(\d+)(?:\/|$)/,
];

async function reportDepartment(reportId: number): Promise<number | null> {
  const r = (await db.execute(sql`SELECT department_id FROM attendance_reports WHERE id = ${reportId}`)).rows[0] as any;
  return r ? Number(r.department_id) : null;
}
async function employeeDepartments(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = (await db.execute(sql`SELECT DISTINCT department_id FROM employees
    WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)).rows as any[];
  return rows.map((r) => Number(r.department_id));
}

/** Department may use this request? (admins skip this) */
async function departmentMayAccess(req: Request, deptId: number): Promise<boolean> {
  const p = req.path;

  if (p.startsWith("/api/admin/")) {
    if (!DEPT_ALLOWED_ADMIN.some((r) => r.method === req.method && r.re.test(p))) return false;
  }
  if (ADMIN_ONLY_OUTSIDE_ADMIN.some((r) => r.method === req.method && r.re.test(p))) return false;

  for (const re of DEPT_ID_IN_PATH) {
    const m = re.exec(p);
    if (m && Number(m[1]) !== deptId) return false;
  }

  if (!(await recordOwnershipOk(req, p, deptId))) return false;

  // Attendance reports: /api/attendance/:id… and /api/admin/attendance/:id
  const rep = /^\/api\/(?:admin\/)?attendance\/(\d+)(?:\/|$)/.exec(p);
  if (rep) {
    const owner = await reportDepartment(Number(rep[1]));
    if (owner !== null && owner !== deptId) return false;
  }

  // Changing an employee: /api/employees/:id (PATCH/PUT/DELETE)
  const emp = /^\/api\/employees\/(\d+)$/.exec(p);
  if (emp && req.method !== "GET") {
    const owners = await employeeDepartments([Number(emp[1])]);
    if (owners.length && owners[0] !== deptId) return false;
  }

  // Reordering employees: all of them must be this department's
  if (p === "/api/admin/employees/reorder") {
    const ids = Array.isArray(req.body?.updates) ? req.body.updates.map((u: any) => Number(u?.id)).filter(Number.isFinite) : [];
    const owners = await employeeDepartments(ids);
    if (owners.some((d) => d !== deptId)) return false;
  }

  // Mailbox and mail settings: only the department's own account
  if (p.startsWith("/api/email/") || p === "/api/user-email") {
    const src = { ...(req.query || {}), ...(req.body || {}) } as any;
    if (src.userType !== undefined || src.userId !== undefined) {
      if (String(src.userType) !== "department" || String(src.userId) !== String(deptId)) return false;
    }
  }
  return true;
}

/** Mailbox for an admin: only their own (userId is the admin's email) */
function adminMayAccess(req: Request, admin: any): boolean {
  const p = req.path;
  if (p.startsWith("/api/email/") || p === "/api/user-email") {
    const src = { ...(req.query || {}), ...(req.body || {}) } as any;
    if (String(src.userType) === "admin" && String(src.userId) !== String(admin.email)) return false;
  }
  return true;
}

export async function apiAuthGate(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) return next();
  if (isPublic(req)) return next();
  try {
    const admin = await sessionAdmin(req);
    if (admin) {
      if (!adminMayAccess(req, admin)) return forbidden(res);
      // /api/admin/* keeps the view-only (VEW) write block for every admin route
      if (req.path.startsWith("/api/admin/")) return verifyAdminSession(req, res, next);
      // View-only (VEW) admins cannot change anything elsewhere either
      if (admin.userCode === "VEW" && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
          && !VEW_WRITE_ALLOWED.some((re) => re.test(req.path))) {
        return forbidden(res, "Forbidden: View-only access");
      }
      return next();
    }
    const deptId = await sessionDepartmentId(req);
    if (deptId) {
      if (!(await departmentMayAccess(req, deptId))) return forbidden(res);
      return next();
    }
    return unauthorized(res);
  } catch (error) {
    console.error("[Auth] gate error:", error);
    return res.status(500).json({ message: "Could not check the login" });
  }
}
