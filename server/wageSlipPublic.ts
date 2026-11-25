// Public wage slips for wage / fund staff (letter EPIDs), opened from the login page
// without an account. The employee proves who they are with the EPID plus the date of
// joining OR the full bank account number; then sees only their own slips of PASSED rolls.
// Same protections as the public claim forms: captcha, per-network rate limit, lockout after
// 5 wrong tries per EPID + network, one answer whichever detail was wrong, 30-minute idle end.
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { regenerateKeeping, saveSession } from "./auth";
import { rateLimit } from "./security";
import { WAGE_CATEGORY_LABELS, type WageCategory } from "../shared/wagePayroll";
import { sectionLabel } from "../shared/sections";
import { buildWageSlipPdf, type WageSlip } from "./wagePayrollPdf";

declare module "express-session" {
  interface SessionData {
    slipEmployeeId?: number;   // employees.id of the identified wage employee
    slipAt?: number;
  }
}

const IDLE_MS = 30 * 60 * 1000;
const MAX_WRONG_TRIES = 5;
const NO_MATCH = "These details do not match our records. Please check and try again, or contact your Department.";
const PLACEHOLDER_JOINING = /joining date to be updated/i; // set by the Excel import

const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const clientIp = (req: Request) => String(req.ip || req.socket.remoteAddress || "unknown");
const isIsoDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const digits = (v: unknown) => clean(v).replace(/\D/g, "");
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function captchaOk(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // local testing
  if (!token || typeof token !== "string") return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    return !!((await r.json()) as any).success;
  } catch (error) {
    console.error("[WageSlip] captcha check failed:", error);
    return false;
  }
}

const tryKey = (epid: string, req: Request) => `wageslip|${epid}|${clientIp(req)}`;
async function lockedMinutes(key: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())) / 60)::int AS minutes
    FROM login_attempts WHERE identifier = ${key} AND locked_until > NOW()`);
  return Number((r.rows[0] as any)?.minutes || 0);
}
async function wrongTry(key: string): Promise<void> {
  const r = await db.execute(sql`
    UPDATE login_attempts SET attempt_count = attempt_count + 1, last_attempt_at = NOW(),
      locked_until = CASE WHEN attempt_count + 1 >= ${MAX_WRONG_TRIES} THEN NOW() + INTERVAL '30 minutes' ELSE NULL END
    WHERE identifier = ${key} RETURNING id`);
  if (!r.rows.length) await db.execute(sql`INSERT INTO login_attempts (identifier, attempt_count, last_attempt_at) VALUES (${key}, 1, NOW())`);
}
const clearTries = (key: string) => db.execute(sql`DELETE FROM login_attempts WHERE identifier = ${key}`);

/** A real date of joining (not the import placeholder, not a typing mistake) */
function realJoining(e: any): string | null {
  const v = clean(e.joining_date);
  if (!isIsoDate(v) || PLACEHOLDER_JOINING.test(clean(e.remarks))) return null;
  const y = Number(v.slice(0, 4));
  return y >= 1950 && y <= new Date().getFullYear() ? v : null;
}

async function identified(req: Request): Promise<any | null> {
  const id = req.session?.slipEmployeeId;
  if (!id) return null;
  if (!req.session.slipAt || Date.now() - req.session.slipAt > IDLE_MS) {
    delete req.session.slipEmployeeId;
    delete req.session.slipAt;
    return null;
  }
  req.session.slipAt = Date.now();
  const r = await db.execute(sql`
    SELECT e.id, e.epid, e.name, e.designation, d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ${id}`);
  return (r.rows[0] as any) || null;
}

const maskAccount = (a: unknown) => { const d = digits(a); return d ? `${"X".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : null; };

/** Slip data of one line of a PASSED roll (also used by the admin side) */
export async function slipOfLine(lineId: number, employeeId?: number): Promise<WageSlip | null> {
  const r = await db.execute(sql`
    SELECT l.*, w.month, w.year, w.head_name, w.payment_code, w.page_no, w.passed_on::text AS passed_on, w.status,
           w.section, d.name AS department_name,
           e.salary_asstt, e.pan_number, e.salary_register_no, e.pay_level,
           c.cheque_no, c.cheque_date::text AS cheque_date
    FROM wage_roll_lines l
    JOIN wage_rolls w ON w.id = l.roll_id
    LEFT JOIN departments d ON d.id = w.department_id
    LEFT JOIN employees e ON e.id = l.employee_id
    LEFT JOIN wage_cheques c ON c.section = w.section AND c.month = w.month AND c.year = w.year
      AND c.payment_code = UPPER(TRIM(COALESCE(w.payment_code, ''))) AND c.ifsc = UPPER(TRIM(COALESCE(l.ifsc, '')))
    WHERE l.id = ${lineId} ${employeeId ? sql`AND l.employee_id = ${employeeId} AND w.status = 'passed' AND ${RELEASED}` : sql``}`);
  const l = r.rows[0] as any;
  if (!l) return null;
  return {
    epid: l.epid, name: l.name, designation: l.designation, departmentName: l.department_name || "",
    month: Number(l.month), year: Number(l.year),
    category: WAGE_CATEGORY_LABELS[l.category as WageCategory] || clean(l.category),
    basic: Number(l.basic), vda: Number(l.vda), days: Number(l.days),
    gross: Number(l.gross), epf: Number(l.epf), esi: Number(l.esi), mas: Number(l.mas),
    totalDeductions: Number(l.epf) + Number(l.esi) + Number(l.mas), net: Number(l.net),
    erEpf: Number(l.er_epf_total), erEsi: Number(l.er_esi),
    uanNo: l.uan_no, esiNo: l.esi_no, bankName: l.bank_name, bankAccountMasked: maskAccount(l.bank_account), ifsc: l.ifsc,
    headName: l.head_name, paymentCode: l.payment_code, pageNo: l.page_no, passedOn: l.passed_on,
    generatedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    // payroll-style slip header / right column
    dealingCode: clean(l.salary_asstt).toUpperCase() || null,
    sectionLabel: sectionLabel(l.section) || null,
    panNumber: clean(l.pan_number) || null,
    salaryRegisterNo: clean(l.salary_register_no) || null,
    payLevel: clean(l.pay_level) || null,
    bankAccount: digits(l.bank_account) || null,
    chequeNo: l.cheque_no || null,
    chequeDate: l.cheque_date || null,          // YYYY-MM-DD
  };
}

/** The month's pay slips were released by the section (SQL condition on wage_rolls w) */
const RELEASED = sql`EXISTS (SELECT 1 FROM wage_slip_release r WHERE r.section = w.section AND r.month = w.month AND r.year = w.year)`;

export function sendPdf(res: Response, bytes: Uint8Array, filename: string, download = false) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.-]+/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(bytes));
}

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => {
    console.error("[WageSlip]", e);
    if (!res.headersSent) res.status(500).json({ message: "Something went wrong. Please try again." });
  });

export function registerWageSlipPublicRoutes(app: Express) {
  const base = "/api/public/wage-slip";
  app.use(`${base}/identify`, rateLimit({ windowMs: 15 * 60_000, max: 20, message: "Too many attempts from this network. Please wait 15 minutes." }));
  app.use(base, rateLimit({ windowMs: 60_000, max: 120 }));

  // EPID + date of joining, or EPID + full bank account number
  app.post(`${base}/identify`, wrap(async (req, res) => {
    const epid = clean(req.body?.epid).toUpperCase();
    const joiningDate = clean(req.body?.joiningDate);
    const account = digits(req.body?.bankAccount);
    if (!/^[A-Z]\d{4}$/.test(epid)) return res.status(400).json({ message: "Enter your Employee ID (e.g. R0001)." });
    if (!isIsoDate(joiningDate) && account.length < 6) {
      return res.status(400).json({ message: "Enter your date of joining or your bank account number." });
    }
    if (!(await captchaOk(req.body?.turnstileToken, clientIp(req)))) {
      return res.status(400).json({ message: "Security check failed. Please try again." });
    }
    const key = tryKey(epid, req);
    const minutes = await lockedMinutes(key);
    if (minutes > 0) return res.status(429).json({ message: `Too many wrong attempts. Please try again after ${minutes} minutes.` });

    const e = (await db.execute(sql`
      SELECT id, epid, joining_date::text AS joining_date, bank_account, remarks
      FROM employees WHERE UPPER(TRIM(epid)) = ${epid} ORDER BY (is_active = 'active') DESC, id LIMIT 1`)).rows[0] as any;
    let ok = false;
    if (e) {
      const doj = realJoining(e);
      const acc = digits(e.bank_account);
      ok = (isIsoDate(joiningDate) && !!doj && doj === joiningDate) || (account.length >= 6 && acc.length >= 6 && acc === account);
    }
    if (!e || !ok) {
      await wrongTry(key);
      return res.status(401).json({ message: NO_MATCH });
    }
    await clearTries(key);
    await regenerateKeeping(req);
    req.session.slipEmployeeId = Number(e.id);
    req.session.slipAt = Date.now();
    await saveSession(req);
    res.json({ ok: true });
  }));

  // Who is identified + the months with a passed wage slip
  app.get(`${base}/me`, wrap(async (req, res) => {
    const e = await identified(req);
    if (!e) return res.status(401).json({ message: "Please identify yourself again.", code: "SLIP_REQUIRED" });
    const r = await db.execute(sql`
      SELECT l.id AS line_id, w.month, w.year, l.net, l.days, d.name AS department_name
      FROM wage_roll_lines l JOIN wage_rolls w ON w.id = l.roll_id LEFT JOIN departments d ON d.id = w.department_id
      WHERE l.employee_id = ${e.id} AND w.status = 'passed' AND ${RELEASED}
      ORDER BY w.year DESC, w.month DESC, l.id DESC`);
    res.json({
      employee: { epid: e.epid, name: e.name, designation: e.designation, departmentName: e.department_name },
      slips: (r.rows as any[]).map((s) => ({
        lineId: Number(s.line_id), month: Number(s.month), year: Number(s.year),
        label: `${MONTHS[Number(s.month)]} ${s.year}`, net: Number(s.net), days: Number(s.days), departmentName: s.department_name,
      })),
    });
  }));

  // One slip (JSON for the screen / print) and as PDF
  app.get(`${base}/slip/:lineId`, wrap(async (req, res) => {
    const e = await identified(req);
    if (!e) return res.status(401).json({ message: "Please identify yourself again.", code: "SLIP_REQUIRED" });
    const slip = await slipOfLine(Number(req.params.lineId), Number(e.id));
    if (!slip) return res.status(404).json({ message: "Pay slip not found." });
    res.json(slip);
  }));
  app.get(`${base}/slip/:lineId/pdf`, wrap(async (req, res) => {
    const e = await identified(req);
    if (!e) return res.status(401).json({ message: "Please identify yourself again.", code: "SLIP_REQUIRED" });
    const slip = await slipOfLine(Number(req.params.lineId), Number(e.id));
    if (!slip) return res.status(404).json({ message: "Pay slip not found." });
    const bytes = await buildWageSlipPdf(slip);
    sendPdf(res, bytes, `wage-slip-${slip.epid}-${slip.year}-${String(slip.month).padStart(2, "0")}.pdf`, req.query.download === "1");
  }));

  app.post(`${base}/logout`, wrap(async (req, res) => {
    delete req.session.slipEmployeeId;
    delete req.session.slipAt;
    await saveSession(req);
    res.json({ ok: true });
  }));
}
