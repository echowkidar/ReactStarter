// Wages payroll for wage / fund staff (letter EPIDs) — Accounts, Bill and Students sections.
// Calculation rules: shared/wagePayroll.ts. Data: wage_rolls / wage_roll_lines / wage_roll_log /
// fund_payment_heads (server/migrations.ts) and the new employee columns.
//
// Who may use it:
//  • a section login (role salary, code ACC / BIL / STU) — only its own section; the section is
//    taken from the login, never from the request
//  • the Super Admin — any fund section, named in the request (?section= or body.section)
//  • nobody else (Salary Section, view-only, departments) → 403
//
// Roll life cycle: draft (editable) → finalised (locked, Muster Roll printed) → passed (page no.
// entered; final, wage slips visible to the employee). A finalised roll can be reopened to draft
// with a reason; a passed roll never changes.
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionAdmin, sessionDepartmentId } from "./auth";
import { sectionOfAdmin, sectionCodes, sectionLabel, type SectionKey } from "../shared/sections";
import {
  calculateLine, categoryFromDesignation, inForceOn, monthStart, sortSets,
  validateStatutory, validateWageRates, DEFAULT_STATUTORY, DEFAULT_WAGE_RATES, WAGE_CATEGORIES,
  type StatutorySet, type WageCategory, type WageRateSet,
} from "../shared/wagePayroll";

import { createRequire } from "module";
import { PDFDocument } from "@cantoo/pdf-lib";
import { buildMusterRollPdf, buildWageSlipPdf } from "./wagePayrollPdf";
import { slipOfLine, sendPdf } from "./wageSlipPublic";

const XLSX: any = createRequire(import.meta.url)("xlsx");

/** Workbook from [sheet name, rows] pairs, sent as a download */
function sendXlsx(res: Response, sheets: [string, Record<string, unknown>[]][], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "No data for this month" }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buf);
}

/** ECR member name: capitals, letters / spaces / dots only, max 85 */
const ecrName = (n: unknown) => String(n ?? "").toUpperCase().replace(/[^A-Z .]/g, " ").replace(/\s+/g, " ").trim().slice(0, 85);
const isoDate = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "").slice(0, 10));
const nowIst = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

type FundSection = Exclude<SectionKey, "salary">;
const FUND_SECTIONS: FundSection[] = ["accounts", "bill", "students"];
const LETTER = sql`e.epid ~ '^[A-Za-z]'`;

// ── Settings (app_settings) ────────────────────────────────────────────────

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = ${key}`);
  const raw = (r.rows[0] as any)?.value;
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
async function writeSetting(key: string, value: unknown) {
  await db.execute(sql`
    INSERT INTO app_settings (key, value) VALUES (${key}, ${JSON.stringify(value)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
}
export const wageRates = () => readSetting<WageRateSet[]>("wage_rates", DEFAULT_WAGE_RATES);
export const statutoryRates = () => readSetting<StatutorySet[]>("wage_statutory", DEFAULT_STATUTORY);

// ── Who is asking ──────────────────────────────────────────────────────────

type Actor = { section: FundSection; name: string; isSuper: boolean };
const isSuperRole = (a: any) => ["super", "super_admin", "superadmin"].includes(a?.role) && String(a?.userCode ?? "").toUpperCase() !== "VEW";

/** The acting admin and the section they work on, or null after sending 403 */
async function actor(req: Request, res: Response, wanted?: unknown): Promise<Actor | null> {
  const a = await sessionAdmin(req).catch(() => null);
  const name = String(a?.name || a?.email || "admin");
  if (a && ["salary", "salary_admin"].includes(a.role)) {
    const s = sectionOfAdmin(a.userCode);
    if (s !== "salary") return { section: s, name, isSuper: false };
  } else if (isSuperRole(a)) {
    const s = String(wanted ?? "");
    if ((FUND_SECTIONS as string[]).includes(s)) return { section: s as FundSection, name, isSuper: true };
    res.status(400).json({ message: "Choose the Accounts, Bill or Students section first." });
    return null;
  }
  res.status(403).json({ message: "Payroll is only for the Accounts, Bill and Students sections and the Super Admin." });
  return null;
}
async function superOnly(req: Request, res: Response): Promise<boolean> {
  const a = await sessionAdmin(req).catch(() => null);
  if (isSuperRole(a)) return true;
  res.status(403).json({ message: "Only the Super Admin can change payroll rates." });
  return false;
}

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => {
    console.error("[WagePayroll]", e);
    if (!res.headersSent) res.status(500).json({ message: "Something went wrong. Nothing was saved." });
  });

const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const validMonth = (m: number, y: number) => m >= 1 && m <= 12 && y >= 2020 && y <= 2100;
const daysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate();
const codesSql = (s: FundSection) => sql.join(sectionCodes(s).map((c) => sql`${c}`), sql`, `);

// ── Attendance → days per employee for a wage month ───────────────────────

/** "DD-MM-YY" / "DD-MM-YYYY" / "YYYY-MM-DD" → [day, month, year] */
function parseDate(s: string): [number, number, number] | null {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (m) { const y = +m[3]; return [+m[1], +m[2], y < 100 ? 2000 + y : y]; }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return [+m[3], +m[2], +m[1]];
  return null;
}

/**
 * Days worked in the wage month per employee, from the department's received (sent)
 * Wages / Fund Staff reports. Periods are counted in the month their From date falls in
 * (periods are split at month starts when saved, so a period never spans two months).
 */
async function attendanceDays(departmentId: number, month: number, year: number): Promise<Map<number, number>> {
  const r = await db.execute(sql`
    SELECT ae.employee_id, ae.periods, ae.days, ae.from_date
    FROM attendance_entries ae
    JOIN attendance_reports ar ON ar.id = ae.report_id
    WHERE ar.department_id = ${departmentId}
      AND COALESCE(ar.report_type, 'regular') = 'fund'
      AND ar.status IN ('sent', 'cancel_requested')`);
  const days = new Map<number, number>();
  for (const row of r.rows as any[]) {
    let periods: any[] = [];
    try { periods = JSON.parse(row.periods || "[]"); } catch { periods = []; }
    if (!Array.isArray(periods) || periods.length === 0) periods = [{ fromDate: row.from_date, days: row.days }];
    for (const p of periods) {
      const d = parseDate(p?.fromDate);
      if (!d || d[1] !== month || d[2] !== year) continue;
      const n = Number(p?.days) || 0;
      if (n > 0) days.set(Number(row.employee_id), (days.get(Number(row.employee_id)) || 0) + n);
    }
  }
  return days;
}

// ── Roll building ──────────────────────────────────────────────────────────

type RatesSnapshot = { wage: WageRateSet; statutory: StatutorySet };

async function ratesFor(month: number, year: number): Promise<RatesSnapshot> {
  const date = monthStart(month, year);
  return {
    wage: inForceOn(await wageRates(), date) ?? DEFAULT_WAGE_RATES[0],
    statutory: inForceOn(await statutoryRates(), date) ?? DEFAULT_STATUTORY[0],
  };
}

type LineRow = Record<string, any>;

/** Compute the money columns of a line from its inputs and the roll's rates */
function computeLine(line: LineRow, rates: RatesSnapshot): LineRow {
  const r = calculateLine({
    basic: Number(line.basic), vda: Number(line.vda), days: Number(line.days),
    epf: !!line.epf_on, esi: !!line.esi_on, esiCovered: !!line.esi_covered, mas: !!line.mas_on,
  }, rates.statutory);
  return {
    ...line,
    gross: r.gross, epf_base: r.epfBase, epf: r.epf, esi_base: r.esiBase, esi: r.esi, mas: r.mas, net: r.net,
    er_eps: r.erEps, er_epf: r.erEpf, er_edli: r.erEdli, er_admin: r.erAdmin, er_epf_total: r.erEpfTotal, er_esi: r.erEsi,
  };
}

function rateOf(category: string | null, rates: RatesSnapshot) {
  if (!category || !(WAGE_CATEGORIES as readonly string[]).includes(category)) return { basic: 0, vda: 0 };
  return rates.wage[category as WageCategory];
}

/** Lines for a roll from the current attendance and employee records */
async function buildLines(departmentId: number, section: FundSection, month: number, year: number, rates: RatesSnapshot) {
  const days = await attendanceDays(departmentId, month, year);
  const ids = [...days.keys()];
  if (!ids.length) return [];
  const emps = await db.execute(sql`
    SELECT e.* FROM employees e
    WHERE e.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      AND ${LETTER}
      AND UPPER(TRIM(COALESCE(e.salary_asstt, ''))) IN (${codesSql(section)})
    ORDER BY e.sort_order, e.epid`);
  return (emps.rows as any[]).map((e, i) => {
    const category = e.wage_category || categoryFromDesignation(e.designation);
    const rate = rateOf(category, rates);
    const d = days.get(Number(e.id)) || 0;
    return computeLine({
      employee_id: Number(e.id), sno: i + 1, epid: e.epid, name: e.name, designation: e.designation,
      category, basic: rate.basic, vda: rate.vda, days: d, attendance_days: d, adjust_reason: null,
      epf_on: e.epf_applicable === true, esi_on: e.esi_applicable === true, esi_covered: e.esi_covered === true,
      mas_on: e.mas_applicable === true,
      uan_no: e.uan_no || null, esi_no: e.esi_no || null,
      bank_account: e.bank_account || null, bank_name: e.bank_name || null, ifsc: e.ifsc || null,
    }, rates);
  });
}

async function insertLines(tx: any, rollId: number, lines: LineRow[]) {
  for (const l of lines) {
    await tx.execute(sql`
      INSERT INTO wage_roll_lines (roll_id, employee_id, sno, epid, name, designation, category, basic, vda, days,
        attendance_days, adjust_reason, epf_on, esi_on, esi_covered, mas_on, gross, epf_base, epf, esi_base, esi, mas, net,
        er_eps, er_epf, er_edli, er_admin, er_epf_total, er_esi, uan_no, esi_no, bank_account, bank_name, ifsc)
      VALUES (${rollId}, ${l.employee_id}, ${l.sno}, ${l.epid}, ${l.name}, ${l.designation}, ${l.category}, ${l.basic}, ${l.vda},
        ${l.days}, ${l.attendance_days}, ${l.adjust_reason}, ${l.epf_on}, ${l.esi_on}, ${l.esi_covered}, ${l.mas_on},
        ${l.gross}, ${l.epf_base}, ${l.epf}, ${l.esi_base}, ${l.esi}, ${l.mas}, ${l.net},
        ${l.er_eps}, ${l.er_epf}, ${l.er_edli}, ${l.er_admin}, ${l.er_epf_total}, ${l.er_esi},
        ${l.uan_no}, ${l.esi_no}, ${l.bank_account}, ${l.bank_name}, ${l.ifsc})`);
  }
}

const TOTAL_KEYS = ["days", "gross", "epf", "esi", "mas", "net", "er_epf_total", "er_esi", "er_eps", "er_epf", "er_edli", "er_admin"] as const;
function totalsOf(lines: LineRow[]) {
  const t: Record<string, number> = { employees: lines.length };
  for (const k of TOTAL_KEYS) t[k] = lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  return t;
}
async function saveTotals(tx: any, rollId: number) {
  const r = await tx.execute(sql`SELECT * FROM wage_roll_lines WHERE roll_id = ${rollId}`);
  await tx.execute(sql`UPDATE wage_rolls SET totals = ${JSON.stringify(totalsOf(r.rows as any[]))}::jsonb WHERE id = ${rollId}`);
}
async function log(tx: any, rollId: number, action: string, by: string, detail?: string) {
  await tx.execute(sql`INSERT INTO wage_roll_log (roll_id, action, detail, by_user) VALUES (${rollId}, ${action}, ${detail ?? null}, ${by})`);
}

/** Checks shown on the roll. `block` ones stop Finalise. */
function lineWarnings(l: LineRow, month: number, year: number, rates: RatesSnapshot) {
  const w: { code: string; text: string; block?: boolean }[] = [];
  if (!l.category) w.push({ code: "no_category", text: "Wage category missing — set it in the employee record", block: true });
  if (Number(l.days) > daysInMonth(month, year)) w.push({ code: "too_many_days", text: "More days than the month has", block: true });
  if (Number(l.days) !== Number(l.attendance_days ?? l.days) && !String(l.adjust_reason || "").trim())
    w.push({ code: "no_reason", text: "Days differ from the attendance — give a reason", block: true });
  if (l.epf_on && !l.uan_no) w.push({ code: "no_uan", text: "EPF applies but the UAN is missing" });
  if (l.esi_on && !l.esi_no) w.push({ code: "no_esi_no", text: "ESI applies but the ESI number is missing" });
  if (l.esi_on && !l.esi_covered && Number(l.gross) > rates.statutory.esiCeiling)
    w.push({ code: "esi_above_ceiling", text: `Gross above ₹${rates.statutory.esiCeiling} — ESI not deducted (tick "covered" if still covered)` });
  if (!l.bank_account) w.push({ code: "no_bank", text: "Bank account missing" });
  else if (!l.ifsc) w.push({ code: "no_ifsc", text: "IFSC missing" });
  return w;
}

async function loadRoll(id: number) {
  const r = await db.execute(sql`
    SELECT w.*, d.name AS department_name FROM wage_rolls w LEFT JOIN departments d ON d.id = w.department_id
    WHERE w.id = ${id}`);
  return (r.rows[0] as any) || null;
}

/** The roll, if this actor may see it (sends 403/404 otherwise) */
async function rollFor(req: Request, res: Response): Promise<{ roll: any; who: Actor } | null> {
  const id = int(req.params.id);
  const roll = Number.isInteger(id) ? await loadRoll(id) : null;
  if (!roll) { res.status(404).json({ message: "Roll not found" }); return null; }
  const who = await actor(req, res, roll.section);
  if (!who) return null;
  if (who.section !== roll.section) { res.status(403).json({ message: `This roll belongs to the ${sectionLabel(roll.section)}.` }); return null; }
  return { roll, who };
}

// ── Routes ─────────────────────────────────────────────────────────────────

/**
 * Muster Roll figures of a department's Revolving Funds attendance report (report_type 'fund'),
 * for the department's own print (Finance Officer's circular: the department submits the
 * Muster Roll / Wages Calculation Sheet). One block per section (payment head).
 * Same calculation as the section's payroll roll; nothing is saved.
 */
export async function musterOfReport(reportId: number) {
  const rep = (await db.execute(sql`
    SELECT ar.id, ar.department_id, ar.month, ar.year, COALESCE(ar.report_type, 'regular') AS report_type, d.name AS department_name
    FROM attendance_reports ar LEFT JOIN departments d ON d.id = ar.department_id WHERE ar.id = ${reportId}`)).rows[0] as any;
  if (!rep || rep.report_type !== "fund") return null;
  const entries = (await db.execute(sql`
    SELECT ae.employee_id, ae.periods, ae.days FROM attendance_entries ae WHERE ae.report_id = ${reportId} ORDER BY ae.id`)).rows as any[];
  const days = new Map<number, number>();
  for (const row of entries) {
    let periods: any[] = [];
    try { periods = JSON.parse(row.periods || "[]"); } catch { periods = []; }
    const n = Array.isArray(periods) && periods.length ? periods.reduce((s, p) => s + (Number(p?.days) || 0), 0) : Number(row.days) || 0;
    days.set(Number(row.employee_id), (days.get(Number(row.employee_id)) || 0) + n);
  }
  const ids = [...days.keys()];
  const rates = await ratesFor(Number(rep.month), Number(rep.year));
  const emps = ids.length ? (await db.execute(sql`
    SELECT e.* FROM employees e WHERE e.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    ORDER BY e.sort_order, e.epid`)).rows as any[] : [];
  const heads = (await db.execute(sql`SELECT section, head_name, payment_code FROM fund_payment_heads WHERE department_id = ${rep.department_id}`)).rows as any[];
  const blocks = new Map<string, any>();
  for (const e of emps) {
    const section = sectionOfAdmin(String(e.salary_asstt || "").trim().toUpperCase() === "OTH" ? "ACC" : e.salary_asstt);
    const key = section === "salary" ? "unassigned" : section;
    const category = e.wage_category || categoryFromDesignation(e.designation);
    const rate = rateOf(category, rates);
    const line = computeLine({
      epid: e.epid, name: e.name, designation: e.designation, category, basic: rate.basic, vda: rate.vda,
      days: days.get(Number(e.id)) || 0, epf_on: e.epf_applicable === true, esi_on: e.esi_applicable === true,
      esi_covered: e.esi_covered === true, mas_on: e.mas_applicable === true,
    }, rates);
    const h = heads.find((x) => x.section === key);
    const b = blocks.get(key) || {
      section: key, sectionLabel: key === "unassigned" ? "Section not set" : sectionLabel(key as FundSection),
      headName: h?.head_name || "", paymentCode: h?.payment_code || "", lines: [] as any[],
    };
    b.lines.push({
      sno: b.lines.length + 1, epid: line.epid, name: line.name, designation: line.designation,
      category, basic: Number(line.basic), vda: Number(line.vda), days: line.days,
      gross: line.gross, epf: line.epf, esi: line.esi, mas: line.mas, net: line.net,
      missingCategory: !category,
    });
    blocks.set(key, b);
  }
  const out = [...blocks.values()].map((b) => ({ ...b, totals: totalsOf(b.lines) }));
  return {
    reportId: rep.id, departmentId: Number(rep.department_id), departmentName: rep.department_name,
    month: Number(rep.month), year: Number(rep.year), blocks: out,
  };
}

export function registerWagePayrollRoutes(app: Express) {
  const base = "/api/admin/payroll";

  // Muster Roll figures of a Revolving Funds attendance report: the department that owns it, or any admin
  app.get("/api/attendance/:reportId/muster", wrap(async (req, res) => {
    const reportId = int(req.params.reportId);
    if (!Number.isInteger(reportId)) return res.status(400).json({ message: "Invalid report" });
    const data = await musterOfReport(reportId);
    if (!data) return res.status(404).json({ message: "Not a Revolving Funds attendance report" });
    const admin = await sessionAdmin(req).catch(() => null);
    const deptId = admin ? null : await sessionDepartmentId(req).catch(() => null);
    if (!admin && deptId !== data.departmentId) return res.status(403).json({ message: "Not your report" });
    res.json(data);
  }));

  // Settings: wage rates + EPF / ESI / MAS. Read: any payroll user. Change: Super Admin.
  app.get(`${base}/settings`, wrap(async (req, res) => {
    if (!(await actor(req, res, req.query.section ?? "accounts"))) return;
    res.json({ wageRates: sortSets(await wageRates()), statutory: sortSets(await statutoryRates()) });
  }));
  app.put(`${base}/settings/wage-rates`, wrap(async (req, res) => {
    if (!(await superOnly(req, res))) return;
    const sets = req.body?.sets;
    const err = validateWageRates(sets);
    if (err) return res.status(400).json({ message: err });
    await writeSetting("wage_rates", sortSets(sets));
    res.json({ wageRates: sortSets(sets) });
  }));
  app.put(`${base}/settings/statutory`, wrap(async (req, res) => {
    if (!(await superOnly(req, res))) return;
    const sets = req.body?.sets;
    const err = validateStatutory(sets);
    if (err) return res.status(400).json({ message: err });
    await writeSetting("wage_statutory", sortSets(sets));
    res.json({ statutory: sortSets(sets) });
  }));

  // Payment heads: departments that have this section's wage staff, with their head + code
  app.get(`${base}/heads`, wrap(async (req, res) => {
    const who = await actor(req, res, req.query.section);
    if (!who) return;
    const r = await db.execute(sql`
      SELECT d.id AS department_id, d.name AS department_name, h.head_name, h.payment_code,
             COUNT(e.id)::int AS employees
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id AND e.is_active = 'active' AND ${LETTER}
        AND UPPER(TRIM(COALESCE(e.salary_asstt, ''))) IN (${codesSql(who.section)})
      LEFT JOIN fund_payment_heads h ON h.department_id = d.id AND h.section = ${who.section}
      GROUP BY d.id, d.name, h.head_name, h.payment_code
      HAVING COUNT(e.id) > 0 OR MAX(h.id) IS NOT NULL
      ORDER BY d.name`);
    res.json((r.rows as any[]).map((x) => ({
      departmentId: Number(x.department_id), departmentName: x.department_name, employees: x.employees,
      headName: x.head_name || "", paymentCode: x.payment_code || "",
    })));
  }));
  app.put(`${base}/heads/:departmentId`, wrap(async (req, res) => {
    const who = await actor(req, res, req.body?.section);
    if (!who) return;
    const departmentId = int(req.params.departmentId);
    const headName = String(req.body?.headName ?? "").replace(/\s+/g, " ").trim();
    const paymentCode = String(req.body?.paymentCode ?? "").replace(/\s+/g, "").toUpperCase();
    if (!Number.isInteger(departmentId)) return res.status(400).json({ message: "Invalid department" });
    if (!headName || headName.length > 150) return res.status(400).json({ message: "Enter the payment head (up to 150 characters)." });
    if (!/^[A-Z0-9/-]{1,20}$/.test(paymentCode)) return res.status(400).json({ message: "Enter the payment code (letters / digits, e.g. 4DE09665)." });
    await db.execute(sql`
      INSERT INTO fund_payment_heads (department_id, section, head_name, payment_code, updated_by, updated_at)
      VALUES (${departmentId}, ${who.section}, ${headName}, ${paymentCode}, ${who.name}, NOW())
      ON CONFLICT (department_id, section)
      DO UPDATE SET head_name = EXCLUDED.head_name, payment_code = EXCLUDED.payment_code,
                    updated_by = EXCLUDED.updated_by, updated_at = NOW()`);
    res.json({ departmentId, headName, paymentCode });
  }));

  // Month overview: departments with this section's wage staff or attendance, and their roll
  app.get(`${base}/month`, wrap(async (req, res) => {
    const who = await actor(req, res, req.query.section);
    if (!who) return;
    const month = int(req.query.month), year = int(req.query.year);
    if (!validMonth(month, year)) return res.status(400).json({ message: "Choose a month" });
    const depts = await db.execute(sql`
      SELECT d.id, d.name, COUNT(e.id)::int AS staff, h.head_name, h.payment_code
      FROM departments d
      JOIN employees e ON e.department_id = d.id AND e.is_active = 'active' AND ${LETTER}
        AND UPPER(TRIM(COALESCE(e.salary_asstt, ''))) IN (${codesSql(who.section)})
      LEFT JOIN fund_payment_heads h ON h.department_id = d.id AND h.section = ${who.section}
      GROUP BY d.id, d.name, h.head_name, h.payment_code`);
    const reports = await db.execute(sql`
      SELECT ar.department_id, COUNT(*)::int AS n,
             BOOL_OR(ar.status IN ('sent','cancel_requested')) AS received,
             BOOL_OR(ar.status IN ('draft','submitted')) AS pending
      FROM attendance_reports ar
      WHERE COALESCE(ar.report_type, 'regular') = 'fund' AND ar.month = ${month} AND ar.year = ${year}
        AND ar.status <> 'cancelled'
      GROUP BY ar.department_id`);
    const rolls = await db.execute(sql`
      SELECT id, department_id, status, totals, page_no FROM wage_rolls
      WHERE section = ${who.section} AND month = ${month} AND year = ${year} AND kind = 'main'`);
    const repBy = new Map((reports.rows as any[]).map((r) => [Number(r.department_id), r]));
    const rollBy = new Map((rolls.rows as any[]).map((r) => [Number(r.department_id), r]));
    const ids = new Set<number>([...(depts.rows as any[]).map((d) => Number(d.id)), ...rollBy.keys()]);
    const names = new Map((depts.rows as any[]).map((d) => [Number(d.id), d]));
    const missingNames = [...ids].filter((i) => !names.has(i));
    if (missingNames.length) {
      const extra = await db.execute(sql`SELECT id, name FROM departments WHERE id IN (${sql.join(missingNames.map((i) => sql`${i}`), sql`, `)})`);
      for (const d of extra.rows as any[]) names.set(Number(d.id), { ...d, staff: 0 });
    }
    const out = [...ids].map((id) => {
      const d: any = names.get(id) || {};
      const rep: any = repBy.get(id);
      const roll: any = rollBy.get(id);
      return {
        departmentId: id, departmentName: d.name || `Department ${id}`, staff: Number(d.staff || 0),
        headName: d.head_name || "", paymentCode: d.payment_code || "",
        attendance: rep ? (rep.received ? "received" : rep.pending ? "pending" : "none") : "none",
        roll: roll ? { id: Number(roll.id), status: roll.status, totals: roll.totals, pageNo: roll.page_no } : null,
      };
    }).sort((a, b) => a.departmentName.localeCompare(b.departmentName));
    res.json({ section: who.section, month, year, departments: out });
  }));

  // Create a draft roll from the received attendance
  app.post(`${base}/rolls`, wrap(async (req, res) => {
    const who = await actor(req, res, req.body?.section);
    if (!who) return;
    const departmentId = int(req.body?.departmentId), month = int(req.body?.month), year = int(req.body?.year);
    if (!Number.isInteger(departmentId) || !validMonth(month, year)) return res.status(400).json({ message: "Choose the department and month" });
    const exists = await db.execute(sql`
      SELECT id FROM wage_rolls WHERE department_id = ${departmentId} AND section = ${who.section}
        AND month = ${month} AND year = ${year} AND kind = 'main'`);
    if (exists.rows.length) return res.status(409).json({ message: "A roll for this department and month already exists.", id: Number((exists.rows[0] as any).id) });
    const rates = await ratesFor(month, year);
    const lines = await buildLines(departmentId, who.section, month, year, rates);
    if (!lines.length) return res.status(400).json({ message: "No received Revolving Funds or Other Similar Funds attendance for this section's employees in this month." });
    const head = await db.execute(sql`SELECT head_name, payment_code FROM fund_payment_heads WHERE department_id = ${departmentId} AND section = ${who.section}`);
    const h: any = head.rows[0] || {};
    let id = 0;
    await db.transaction(async (tx) => {
      const ins = await tx.execute(sql`
        INSERT INTO wage_rolls (department_id, section, month, year, kind, status, head_name, payment_code, rates, created_by)
        VALUES (${departmentId}, ${who.section}, ${month}, ${year}, 'main', 'draft', ${h.head_name ?? null}, ${h.payment_code ?? null},
          ${JSON.stringify(rates)}::jsonb, ${who.name})
        RETURNING id`);
      id = Number((ins.rows[0] as any).id);
      await insertLines(tx, id, lines);
      await saveTotals(tx, id);
      await log(tx, id, "created", who.name, `${lines.length} employee(s)`);
    });
    res.status(201).json({ id });
  }));

  // One roll with its lines, checks and history
  app.get(`${base}/rolls/:id`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll } = got;
    const lines = (await db.execute(sql`SELECT * FROM wage_roll_lines WHERE roll_id = ${roll.id} ORDER BY sno, id`)).rows as any[];
    const history = (await db.execute(sql`SELECT action, detail, by_user, at FROM wage_roll_log WHERE roll_id = ${roll.id} ORDER BY id`)).rows;
    const rates: RatesSnapshot = roll.rates;
    // Section staff of the department with no attendance this month (information only)
    const noAttendance = await db.execute(sql`
      SELECT e.epid, e.name FROM employees e
      WHERE e.department_id = ${roll.department_id} AND e.is_active = 'active' AND ${LETTER}
        AND UPPER(TRIM(COALESCE(e.salary_asstt, ''))) IN (${codesSql(roll.section)})
        AND e.id NOT IN (SELECT employee_id FROM wage_roll_lines WHERE roll_id = ${roll.id})
      ORDER BY e.epid`);
    const withChecks = lines.map((l) => ({ ...l, warnings: lineWarnings(l, roll.month, roll.year, rates) }));
    res.json({
      roll: { ...roll, sectionLabel: sectionLabel(roll.section) },
      lines: withChecks,
      blocking: withChecks.some((l) => l.warnings.some((w: any) => w.block)),
      noAttendance: noAttendance.rows,
      history,
    });
  }));

  // Edit one line (draft only): days (+ reason), EPF / ESI / covered / MAS for this month
  app.patch(`${base}/rolls/:id/lines/:lineId`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll, who } = got;
    if (roll.status !== "draft") return res.status(409).json({ message: "Only a draft roll can be changed. Reopen it first." });
    const lineId = int(req.params.lineId);
    const cur = (await db.execute(sql`SELECT * FROM wage_roll_lines WHERE id = ${lineId} AND roll_id = ${roll.id}`)).rows[0] as any;
    if (!cur) return res.status(404).json({ message: "Line not found" });
    const b = req.body || {};
    const next: LineRow = { ...cur };
    const changes: string[] = [];
    if (b.days !== undefined) {
      const d = int(b.days);
      if (!Number.isInteger(d) || d < 0 || d > daysInMonth(roll.month, roll.year)) return res.status(400).json({ message: `Days must be 0 to ${daysInMonth(roll.month, roll.year)}` });
      if (d !== Number(cur.days)) changes.push(`days ${cur.days} → ${d}`);
      next.days = d;
    }
    if (b.adjustReason !== undefined) {
      next.adjust_reason = String(b.adjustReason ?? "").trim().slice(0, 200) || null;
      if ((next.adjust_reason || "") !== (cur.adjust_reason || "")) changes.push(`reason "${next.adjust_reason || ""}"`);
    }
    for (const [k, col] of [["epfOn", "epf_on"], ["esiOn", "esi_on"], ["esiCovered", "esi_covered"], ["masOn", "mas_on"]] as const) {
      if (b[k] !== undefined) {
        const v = b[k] === true;
        if (v !== cur[col]) changes.push(`${k} ${v ? "on" : "off"}`);
        next[col] = v;
      }
    }
    const calc = computeLine(next, roll.rates);
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE wage_roll_lines SET days = ${calc.days}, adjust_reason = ${calc.adjust_reason},
          epf_on = ${calc.epf_on}, esi_on = ${calc.esi_on}, esi_covered = ${calc.esi_covered}, mas_on = ${calc.mas_on},
          gross = ${calc.gross}, epf_base = ${calc.epf_base}, epf = ${calc.epf}, esi_base = ${calc.esi_base}, esi = ${calc.esi},
          mas = ${calc.mas}, net = ${calc.net}, er_eps = ${calc.er_eps}, er_epf = ${calc.er_epf}, er_edli = ${calc.er_edli},
          er_admin = ${calc.er_admin}, er_epf_total = ${calc.er_epf_total}, er_esi = ${calc.er_esi}
        WHERE id = ${lineId}`);
      await saveTotals(tx, roll.id);
      if (changes.length) await log(tx, roll.id, "line", who.name, `${cur.epid}: ${changes.join(", ")}${calc.adjust_reason ? ` (${calc.adjust_reason})` : ""}`);
    });
    res.json({ ...calc, warnings: lineWarnings(calc, roll.month, roll.year, roll.rates) });
  }));

  // Head / code on the roll (draft only)
  app.patch(`${base}/rolls/:id`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll, who } = got;
    if (roll.status !== "draft") return res.status(409).json({ message: "Only a draft roll can be changed." });
    const headName = String(req.body?.headName ?? roll.head_name ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
    const paymentCode = String(req.body?.paymentCode ?? roll.payment_code ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 20);
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE wage_rolls SET head_name = ${headName || null}, payment_code = ${paymentCode || null} WHERE id = ${roll.id}`);
      await log(tx, roll.id, "head", who.name, `${headName} / ${paymentCode}`);
    });
    res.json({ headName, paymentCode });
  }));

  // Rebuild a draft from the current attendance, employee records and rates
  app.post(`${base}/rolls/:id/rebuild`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll, who } = got;
    if (roll.status !== "draft") return res.status(409).json({ message: "Only a draft roll can be rebuilt." });
    const rates = await ratesFor(roll.month, roll.year);
    const lines = await buildLines(roll.department_id, roll.section, roll.month, roll.year, rates);
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM wage_roll_lines WHERE roll_id = ${roll.id}`);
      await tx.execute(sql`UPDATE wage_rolls SET rates = ${JSON.stringify(rates)}::jsonb WHERE id = ${roll.id}`);
      await insertLines(tx, roll.id, lines);
      await saveTotals(tx, roll.id);
      await log(tx, roll.id, "rebuilt", who.name, `${lines.length} employee(s)`);
    });
    res.json({ id: roll.id, employees: lines.length });
  }));

  // Finalise (draft → finalised): no blocking checks, head + code present
  app.post(`${base}/rolls/:id/finalise`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll, who } = got;
    if (roll.status !== "draft") return res.status(409).json({ message: "Only a draft roll can be finalised." });
    if (!roll.head_name || !roll.payment_code) return res.status(400).json({ message: "Enter the payment head and payment code first." });
    const lines = (await db.execute(sql`SELECT * FROM wage_roll_lines WHERE roll_id = ${roll.id}`)).rows as any[];
    if (!lines.length) return res.status(400).json({ message: "The roll has no employees." });
    const bad = lines.filter((l) => lineWarnings(l, roll.month, roll.year, roll.rates).some((w) => w.block));
    if (bad.length) return res.status(400).json({ message: `Fix the marked rows first: ${bad.map((l) => l.epid).join(", ")}` });
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE wage_rolls SET status = 'finalised', finalised_by = ${who.name}, finalised_at = NOW() WHERE id = ${roll.id} AND status = 'draft'`);
      await log(tx, roll.id, "finalised", who.name);
    });
    res.json({ id: roll.id, status: "finalised" });
  }));

  // Reopen (finalised → draft) with a reason
  app.post(`${base}/rolls/:id/reopen`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll, who } = got;
    if (roll.status !== "finalised") return res.status(409).json({ message: "Only a finalised (not yet passed) roll can be reopened." });
    const reason = String(req.body?.reason ?? "").trim().slice(0, 200);
    if (!reason) return res.status(400).json({ message: "Give the reason for reopening." });
    await db.transaction(async (tx) => {
      await tx.execute(sql`UPDATE wage_rolls SET status = 'draft', finalised_by = NULL, finalised_at = NULL WHERE id = ${roll.id} AND status = 'finalised'`);
      await log(tx, roll.id, "reopened", who.name, reason);
    });
    res.json({ id: roll.id, status: "draft" });
  }));

  // Passed for payment (finalised → passed): page number + date. Final.
  app.post(`${base}/rolls/:id/pass`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll, who } = got;
    if (roll.status !== "finalised") return res.status(409).json({ message: "Finalise the roll before passing it." });
    const pageNo = String(req.body?.pageNo ?? "").trim().slice(0, 30);
    const passedOn = String(req.body?.passedOn ?? "").trim();
    if (!pageNo) return res.status(400).json({ message: "Enter the page number." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(passedOn)) return res.status(400).json({ message: "Enter the date of passing." });
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE wage_rolls SET status = 'passed', page_no = ${pageNo}, passed_on = ${passedOn}, passed_by = ${who.name}, passed_at = NOW()
        WHERE id = ${roll.id} AND status = 'finalised'`);
      await log(tx, roll.id, "passed", who.name, `Page ${pageNo}, ${passedOn}`);
    });
    res.json({ id: roll.id, status: "passed" });
  }));

  // ── Prints ────────────────────────────────────────────────────────────────
  // Muster Roll (prescribed format) — any status; a draft prints with a DRAFT watermark
  app.get(`${base}/rolls/:id/muster.pdf`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll } = got;
    const lines = (await db.execute(sql`SELECT * FROM wage_roll_lines WHERE roll_id = ${roll.id} ORDER BY sno, id`)).rows as any[];
    const bytes = await buildMusterRollPdf({
      departmentName: roll.department_name || "", sectionLabel: sectionLabel(roll.section),
      month: roll.month, year: roll.year, headName: roll.head_name || "", paymentCode: roll.payment_code || "",
      status: roll.status, pageNo: roll.page_no, passedOn: roll.passed_on ? isoDate(roll.passed_on) : null,
      printedAt: nowIst(), totals: { ...totalsOf(lines) } as any,
    }, lines.map((l) => ({
      sno: l.sno, epid: l.epid, name: l.name, designation: l.designation, basic: Number(l.basic), vda: Number(l.vda),
      days: Number(l.days), gross: l.gross, epf: l.epf, esi: l.esi, mas: l.mas, net: l.net,
    })));
    sendPdf(res, bytes, `muster-roll-${roll.payment_code || roll.id}-${roll.year}-${String(roll.month).padStart(2, "0")}.pdf`, req.query.download === "1");
  }));

  // Wage slips of a roll (all lines, one page each), or one line
  app.get(`${base}/rolls/:id/slips.pdf`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll } = got;
    const ids = (await db.execute(sql`SELECT id FROM wage_roll_lines WHERE roll_id = ${roll.id} ORDER BY sno, id`)).rows as any[];
    const onlyLine = req.query.line ? int(req.query.line) : null;
    const lineIds = onlyLine ? ids.map((r) => Number(r.id)).filter((i) => i === onlyLine) : ids.map((r) => Number(r.id));
    if (!lineIds.length) return res.status(404).json({ message: "No pay slips in this roll." });
    const merged = await PDFDocument.create();
    for (const lid of lineIds) {
      const slip = await slipOfLine(lid);
      if (!slip) continue;
      const one = await PDFDocument.load(await buildWageSlipPdf(slip));
      for (const p of await merged.copyPages(one, one.getPageIndices())) merged.addPage(p);
    }
    sendPdf(res, await merged.save(), `wage-slips-${roll.payment_code || roll.id}-${roll.year}-${String(roll.month).padStart(2, "0")}.pdf`, req.query.download === "1");
  }));

  // ── Monthly section files (passed rolls of the month) ────────────────────
  const monthLines = async (section: FundSection, month: number, year: number) => (await db.execute(sql`
    SELECT l.*, w.head_name, w.payment_code, w.status, w.page_no, d.name AS department_name
    FROM wage_roll_lines l
    JOIN wage_rolls w ON w.id = l.roll_id
    LEFT JOIN departments d ON d.id = w.department_id
    WHERE w.section = ${section} AND w.month = ${month} AND w.year = ${year} AND w.status = 'passed'
    ORDER BY d.name, l.sno, l.id`)).rows as any[];

  const monthArgs = async (req: Request, res: Response) => {
    const who = await actor(req, res, req.query.section);
    if (!who) return null;
    const month = int(req.query.month), year = int(req.query.year);
    if (!validMonth(month, year)) { res.status(400).json({ message: "Choose a month" }); return null; }
    return { who, month, year, tag: `${sectionLabel(who.section).split(" ")[0].toLowerCase()}-${year}-${String(month).padStart(2, "0")}` };
  };

  // What the files will contain, and what is missing (shown before downloading)
  app.get(`${base}/exports/summary`, wrap(async (req, res) => {
    const a = await monthArgs(req, res);
    if (!a) return;
    const lines = await monthLines(a.who.section, a.month, a.year);
    const rolls = await db.execute(sql`
      SELECT status, COUNT(*)::int AS n FROM wage_rolls
      WHERE section = ${a.who.section} AND month = ${a.month} AND year = ${a.year} GROUP BY status`);
    res.json({
      rolls: Object.fromEntries((rolls.rows as any[]).map((r) => [r.status, r.n])),
      employees: lines.length, totals: totalsOf(lines),
      epfMembers: lines.filter((l) => l.epf_on && l.epf > 0).length,
      esiMembers: lines.filter((l) => l.esi_on && l.esi > 0).length,
      missingUan: lines.filter((l) => l.epf_on && l.epf > 0 && !l.uan_no).map((l) => ({ epid: l.epid, name: l.name })),
      missingEsiNo: lines.filter((l) => l.esi_on && l.esi > 0 && !l.esi_no).map((l) => ({ epid: l.epid, name: l.name })),
      missingBank: lines.filter((l) => !l.bank_account || !l.ifsc).map((l) => ({ epid: l.epid, name: l.name })),
    });
  }));

  // Bank payment sheet (net payable, bank-wise)
  app.get(`${base}/exports/bank.xlsx`, wrap(async (req, res) => {
    const a = await monthArgs(req, res);
    if (!a) return;
    const lines = await monthLines(a.who.section, a.month, a.year);
    const rows = lines.map((l, i) => ({
      "S.No.": i + 1, "Department": l.department_name, "Payment Head": l.head_name, "Payment Code": l.payment_code,
      "Emp ID": l.epid, "Name": l.name, "Bank Name": l.bank_name || "", "Account No.": l.bank_account || "",
      "IFSC": l.ifsc || "", "Net Payable (Rs.)": Number(l.net),
    }));
    sendXlsx(res, [["Bank payment", rows]], `bank-payment-${a.tag}.xlsx`);
  }));

  // EPF ECR (EPFO Unified Portal text format, one member per line)
  app.get(`${base}/exports/ecr.txt`, wrap(async (req, res) => {
    const a = await monthArgs(req, res);
    if (!a) return;
    const lines = (await monthLines(a.who.section, a.month, a.year)).filter((l) => l.epf_on && l.epf > 0 && l.uan_no);
    const dim = daysInMonth(a.month, a.year);
    // Several rolls of the same member in a month → one ECR line
    const byUan = new Map<string, any>();
    for (const l of lines) {
      const k = String(l.uan_no);
      const p = byUan.get(k) || { uan: k, name: l.name, gross: 0, epfWages: 0, epf: 0, eps: 0, diff: 0, days: 0 };
      p.gross += Number(l.gross); p.epfWages += Number(l.epf_base); p.epf += Number(l.epf);
      p.eps += Number(l.er_eps); p.diff += Number(l.er_epf); p.days += Number(l.days);
      byUan.set(k, p);
    }
    const text = [...byUan.values()].map((p) => [
      p.uan, ecrName(p.name), p.gross, p.epfWages, p.epfWages, p.epfWages, p.epf, p.eps, p.diff,
      Math.max(0, dim - Math.min(dim, p.days)), 0,
    ].join("#~#")).join("\r\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ecr-${a.tag}.txt"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(text);
  }));

  // ESI monthly contribution sheet (for the ESIC portal upload)
  app.get(`${base}/exports/esi.xlsx`, wrap(async (req, res) => {
    const a = await monthArgs(req, res);
    if (!a) return;
    const lines = (await monthLines(a.who.section, a.month, a.year)).filter((l) => l.esi_on && l.esi > 0);
    const rows = lines.map((l) => ({
      "IP Number": l.esi_no || "", "IP Name": l.name, "No. of Days": Number(l.days), "Total Monthly Wages": Number(l.esi_base),
      "Reason Code for Zero Working Days": Number(l.days) > 0 ? "" : 0, "Last Working Day": "",
      "Employee Contribution (Rs.)": Number(l.esi), "Employer Contribution (Rs.)": Number(l.er_esi),
      "Emp ID": l.epid, "Department": l.department_name,
    }));
    sendXlsx(res, [["ESI contribution", rows]], `esi-${a.tag}.xlsx`);
  }));

  // Employer's liability per payment head (what each fund must hold) + member detail
  app.get(`${base}/exports/liability.xlsx`, wrap(async (req, res) => {
    const a = await monthArgs(req, res);
    if (!a) return;
    const lines = await monthLines(a.who.section, a.month, a.year);
    const heads = new Map<string, any>();
    for (const l of lines) {
      const k = `${l.department_name}|${l.head_name}|${l.payment_code}`;
      const h = heads.get(k) || { "Department": l.department_name, "Payment Head": l.head_name, "Payment Code": l.payment_code,
        "Employees": 0, "Gross": 0, "EPF (employee)": 0, "ESI (employee)": 0, "MAS": 0, "Net Payable": 0,
        "EPF employer - EPS 8.33%": 0, "EPF employer - EPF 3.67%": 0, "EDLI 0.5%": 0, "EPF admin 0.5%": 0,
        "Employer EPF total": 0, "Employer ESI": 0, "Total from fund (Net + employee dues + employer share)": 0 };
      h["Employees"] += 1; h["Gross"] += +l.gross; h["EPF (employee)"] += +l.epf; h["ESI (employee)"] += +l.esi; h["MAS"] += +l.mas;
      h["Net Payable"] += +l.net; h["EPF employer - EPS 8.33%"] += +l.er_eps; h["EPF employer - EPF 3.67%"] += +l.er_epf;
      h["EDLI 0.5%"] += +l.er_edli; h["EPF admin 0.5%"] += +l.er_admin; h["Employer EPF total"] += +l.er_epf_total; h["Employer ESI"] += +l.er_esi;
      h["Total from fund (Net + employee dues + employer share)"] += +l.gross + +l.er_epf_total + +l.er_esi;
      heads.set(k, h);
    }
    const detail = lines.map((l) => ({
      "Department": l.department_name, "Payment Code": l.payment_code, "Emp ID": l.epid, "Name": l.name, "Days": +l.days,
      "Gross": +l.gross, "EPF": +l.epf, "ESI": +l.esi, "MAS": +l.mas, "Net": +l.net,
      "Employer EPF": +l.er_epf_total, "Employer ESI": +l.er_esi, "UAN": l.uan_no || "", "ESI No.": l.esi_no || "",
    }));
    sendXlsx(res, [["By payment head", [...heads.values()]], ["Employees", detail]], `employer-liability-${a.tag}.xlsx`);
  }));

  // Delete a draft roll
  app.delete(`${base}/rolls/:id`, wrap(async (req, res) => {
    const got = await rollFor(req, res);
    if (!got) return;
    const { roll, who } = got;
    if (roll.status !== "draft") return res.status(409).json({ message: "Only a draft roll can be deleted." });
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM wage_rolls WHERE id = ${roll.id} AND status = 'draft'`);
      await log(tx, roll.id, "deleted", who.name);
    });
    res.json({ ok: true });
  }));
}
