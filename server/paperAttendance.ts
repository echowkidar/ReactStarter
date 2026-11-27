// Wages / Fund Staff attendance received ON PAPER, entered by a section (Accounts / Bill / Students)
// or the Super Admin, for the section's own letter-EPID staff:
//  - one department by a form, or one or many departments at once from an Excel sheet
//    (rows: EPID, From, To, Days — several rows for several periods of the same employee);
//  - the scanned paper copy is uploaded with the entry or later, per department;
//  - it is saved as that department's received ("sent") Wages / Fund Staff attendance, marked
//    "entered from paper", so the payroll roll, Muster Roll and pay slips work as for online reports.
// A department that has started or sent its own online report for the month is not entered again,
// and the same employee can never be in two received reports of the month.
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";
import { db } from "./db";
import { actor, codesSql, LETTER, type Actor } from "./wagePayroll";
import { sectionLabel, sectionCodes } from "../shared/sections";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN_DIR = path.join(__dirname, "../uploads/paper-attendance");
const SCAN_URL = "/uploads/paper-attendance";
if (!fs.existsSync(SCAN_DIR)) fs.mkdirSync(SCAN_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const base = "/api/admin/payroll/paper";
const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const validMonth = (m: number, y: number) => m >= 1 && m <= 12 && y >= 2020 && y <= 2100;
const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => {
    console.error("[PaperAttendance]", e);
    if (!res.headersSent) res.status(500).json({ message: "Something went wrong. Nothing was saved." });
  });

/** "YYYY-MM-DD", "DD-MM-YYYY", "DD/MM/YYYY", "DD-MM-YY", "DD.MM.YYYY" or an Excel day number → [d, m, y] */
function parseDay(v: unknown): [number, number, number] | null {
  if (typeof v === "number" && v > 20000 && v < 80000) { // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400000));
    return [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear()];
  }
  const t = String(v ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let p: [number, number, number] | null = m ? [+m[3], +m[2], +m[1]] : null;
  if (!p) {
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (m) p = [+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]];
  }
  if (!p) return null;
  const d = new Date(p[2], p[1] - 1, p[0]);
  return d.getFullYear() === p[2] && d.getMonth() === p[1] - 1 && d.getDate() === p[0] ? p : null;
}
const ddmmyy = ([d, m, y]: [number, number, number]) => `${pad(d)}-${pad(m)}-${String(y).slice(-2)}`;

/** The scanned copy: PDF, JPG or PNG (checked by content, not by name) → saved file URL */
function saveScan(file: Express.Multer.File | undefined): { url?: string; error?: string } {
  if (!file) return {};
  const b = file.buffer;
  const ext = b.slice(0, 4).toString("latin1") === "%PDF" ? ".pdf"
    : b[0] === 0xff && b[1] === 0xd8 ? ".jpg"
    : b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? ".png" : null;
  if (!ext) return { error: "The scanned copy must be a PDF, JPG or PNG file." };
  const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(SCAN_DIR, name), b);
  return { url: `${SCAN_URL}/${name}` };
}
function removeScan(url: string | null | undefined) {
  if (!url || !url.startsWith(`${SCAN_URL}/`)) return;
  const f = path.join(SCAN_DIR, path.basename(url));
  try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* keep going */ }
}

type InRow = { epid?: unknown; from?: unknown; to?: unknown; days?: unknown; row?: number };
type Period = { from: [number, number, number]; to: [number, number, number]; days: number };

/**
 * Checks rows for one month and groups them per department / employee.
 * `onlyDepartmentId` limits the rows to one department (form entry).
 */
async function checkRows(who: Actor, month: number, year: number, rows: InRow[], onlyDepartmentId?: number) {
  const errors: string[] = [];
  const last = new Date(year, month, 0).getDate();
  const where = (r: InRow, i: number) => (r.row ? `Row ${r.row}` : `Line ${i + 1}`);
  const epids = [...new Set(rows.map((r) => String(r.epid ?? "").trim().toUpperCase()).filter(Boolean))];
  const emps = epids.length ? (await db.execute(sql`
    SELECT e.id, e.epid, e.name, e.department_id, e.designation, e.employment_status, e.pay_level, e.is_active,
           UPPER(TRIM(COALESCE(e.salary_asstt, ''))) AS code, d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE UPPER(e.epid) IN (${sql.join(epids.map((x) => sql`${x}`), sql`, `)}) AND ${LETTER}`)).rows as any[] : [];
  const codes = new Set<string>(sectionCodes(who.section));
  const byEpid = new Map(emps.map((e) => [String(e.epid).toUpperCase(), e]));

  const per = new Map<number, { emp: any; periods: Period[] }>();
  rows.forEach((r, i) => {
    const epid = String(r.epid ?? "").trim().toUpperCase();
    if (!epid && !r.from && !r.to) return; // blank line
    const e = byEpid.get(epid);
    if (!epid) return errors.push(`${where(r, i)}: Employee ID is missing.`);
    if (!e) return errors.push(`${where(r, i)}: ${epid} is not a Revolving Funds or Other Similar Funds employee.`);
    if (!codes.has(e.code)) return errors.push(`${where(r, i)}: ${epid} (${e.name}) is not ${sectionLabel(who.section)} staff.`);
    if (String(e.is_active || "active").toLowerCase() !== "active") return errors.push(`${where(r, i)}: ${epid} (${e.name}) is not active.`);
    if (onlyDepartmentId && Number(e.department_id) !== onlyDepartmentId) return errors.push(`${where(r, i)}: ${epid} is not of this department.`);
    const f = parseDay(r.from), t = parseDay(r.to);
    if (!f || !t) return errors.push(`${where(r, i)}: ${epid} — From and To must be dates (DD-MM-YYYY).`);
    if (f[1] !== month || f[2] !== year || t[1] !== month || t[2] !== year)
      return errors.push(`${where(r, i)}: ${epid} — the dates must be within ${MONTHS[month]} ${year}.`);
    if (f[0] > t[0]) return errors.push(`${where(r, i)}: ${epid} — From date is after To date.`);
    const span = t[0] - f[0] + 1;
    const rawDays = String(r.days ?? "").trim();
    const days = rawDays === "" ? span : Number(rawDays);
    if (!Number.isInteger(days) || days < 1 || days > span)
      return errors.push(`${where(r, i)}: ${epid} — Days must be a whole number from 1 to ${span} for this period.`);
    const p = per.get(Number(e.id)) || { emp: e, periods: [] };
    for (const q of p.periods) {
      if (f[0] <= q.to[0] && q.from[0] <= t[0]) return errors.push(`${where(r, i)}: ${epid} — this period overlaps another period of the same employee.`);
    }
    p.periods.push({ from: f, to: t, days });
    per.set(Number(e.id), p);
  });
  for (const p of per.values()) {
    const total = p.periods.reduce((n, x) => n + x.days, 0);
    if (total > last) errors.push(`${p.emp.epid} (${p.emp.name}): ${total} days is more than the ${last} days of the month.`);
  }

  // Per department: no online report of the month, no earlier paper entry of this section,
  // and no employee already in a received report of the month
  const depts = new Map<number, { departmentId: number; departmentName: string; employees: { emp: any; periods: Period[] }[] }>();
  for (const p of per.values()) {
    const id = Number(p.emp.department_id);
    const d = depts.get(id) || { departmentId: id, departmentName: p.emp.department_name || `Department ${id}`, employees: [] as { emp: any; periods: Period[] }[] };
    d.employees.push(p);
    depts.set(id, d);
  }
  for (const d of depts.values()) {
    const reps = (await db.execute(sql`
      SELECT id, status, entry_source, entered_section FROM attendance_reports
      WHERE department_id = ${d.departmentId} AND month = ${month} AND year = ${year}
        AND COALESCE(report_type, 'regular') = 'fund' AND status <> 'cancelled'`)).rows as any[];
    const online = reps.find((r) => r.entry_source !== "paper");
    if (online) {
      errors.push(`${d.departmentName}: the department has ${online.status === "draft" ? "started" : "sent"} its own online attendance for ${MONTHS[month]} ${year}. Use that report${online.status === "draft" ? ", or ask the department to delete its draft" : ""}.`);
      continue;
    }
    if (reps.some((r) => r.entry_source === "paper" && r.entered_section === who.section)) {
      errors.push(`${d.departmentName}: paper attendance of ${MONTHS[month]} ${year} is already entered for the ${sectionLabel(who.section)}. Delete it first to enter it again.`);
      continue;
    }
    const ids = d.employees.map((x) => Number(x.emp.id));
    const dup = (await db.execute(sql`
      SELECT DISTINCT e.epid FROM attendance_entries ae
      JOIN attendance_reports ar ON ar.id = ae.report_id JOIN employees e ON e.id = ae.employee_id
      WHERE ae.employee_id IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})
        AND ar.month = ${month} AND ar.year = ${year} AND COALESCE(ar.report_type, 'regular') = 'fund'
        AND ar.status <> 'cancelled'`)).rows as any[];
    if (dup.length) errors.push(`${d.departmentName}: attendance of ${dup.map((x) => x.epid).join(", ")} for ${MONTHS[month]} ${year} is already in another report.`);
  }
  return { errors, departments: [...depts.values()] };
}

/** Section staff of a department (form entry), with the paper / online report state of the month */
async function departmentState(who: Actor, departmentId: number, month: number, year: number) {
  const dept = (await db.execute(sql`SELECT id, name FROM departments WHERE id = ${departmentId}`)).rows[0] as any;
  const staff = (await db.execute(sql`
    SELECT e.id, e.epid, e.name, e.designation FROM employees e
    WHERE e.department_id = ${departmentId} AND e.is_active = 'active' AND ${LETTER}
      AND UPPER(TRIM(COALESCE(e.salary_asstt, ''))) IN (${codesSql(who.section)})
    ORDER BY e.sort_order, e.epid`)).rows;
  return { department: dept ? { id: Number(dept.id), name: dept.name } : null, staff };
}

export function registerPaperAttendanceRoutes(app: Express) {
  // Paper entries of the month for this section (with scan state)
  app.get(base, wrap(async (req, res) => {
    const who = await actor(req, res, req.query.section);
    if (!who) return;
    const month = int(req.query.month), year = int(req.query.year);
    if (!validMonth(month, year)) return res.status(400).json({ message: "Choose a month" });
    const r = (await db.execute(sql`
      SELECT ar.id, ar.department_id, d.name AS department_name, ar.file_url, ar.entered_by, ar.finalized_at,
             ar.despatch_no, ar.despatch_date::text AS despatch_date,
             COUNT(DISTINCT ae.employee_id)::int AS employees, COALESCE(SUM(ae.days), 0)::int AS days
      FROM attendance_reports ar LEFT JOIN departments d ON d.id = ar.department_id
      LEFT JOIN attendance_entries ae ON ae.report_id = ar.id
      WHERE ar.entry_source = 'paper' AND ar.entered_section = ${who.section}
        AND ar.month = ${month} AND ar.year = ${year} AND ar.status <> 'cancelled'
      GROUP BY ar.id, d.name ORDER BY d.name`)).rows as any[];
    res.json({
      reports: r.map((x) => ({
        id: Number(x.id), departmentId: Number(x.department_id), departmentName: x.department_name || "",
        scanUrl: x.file_url || null, enteredBy: x.entered_by, enteredAt: x.finalized_at,
        letterNo: x.despatch_no || null, letterDate: x.despatch_date || null,
        employees: Number(x.employees), days: Number(x.days),
      })),
    });
  }));

  // Form: the department's section staff
  app.get(`${base}/department/:departmentId`, wrap(async (req, res) => {
    const who = await actor(req, res, req.query.section);
    if (!who) return;
    const departmentId = int(req.params.departmentId);
    const month = int(req.query.month), year = int(req.query.year);
    if (!Number.isInteger(departmentId) || !validMonth(month, year)) return res.status(400).json({ message: "Choose the department and month" });
    const st = await departmentState(who, departmentId, month, year);
    if (!st.department) return res.status(404).json({ message: "Department not found" });
    res.json(st);
  }));

  // Save (or only check, with dryRun) paper attendance of one department (form) or of many (Excel).
  // multipart: field "data" = JSON { month, year, departmentId?, letterNo?, letterDate?, dryRun?, rows: [{ epid, from, to, days?, row? }] },
  // optional file "scan" (only with one department).
  app.post(base, upload.single("scan"), wrap(async (req, res) => {
    let body: any;
    try { body = typeof req.body?.data === "string" ? JSON.parse(req.body.data) : req.body; } catch { return res.status(400).json({ message: "Invalid data" }); }
    const who = await actor(req, res, body?.section ?? req.query.section);
    if (!who) return;
    const month = int(body?.month), year = int(body?.year);
    if (!validMonth(month, year)) return res.status(400).json({ message: "Choose a month" });
    const rows: InRow[] = Array.isArray(body?.rows) ? body.rows.slice(0, 5000) : [];
    const onlyDept = body?.departmentId ? int(body.departmentId) : undefined;
    if (onlyDept !== undefined && !Number.isInteger(onlyDept)) return res.status(400).json({ message: "Choose the department" });
    const checked = await checkRows(who, month, year, rows, onlyDept);
    if (!checked.departments.length && !checked.errors.length) checked.errors.push("Enter the attendance of at least one employee.");
    if (req.file && checked.departments.length > 1) checked.errors.push("A scanned copy can be attached when one department is entered; upload the others' copies afterwards.");
    const letterNo = String(body?.letterNo ?? "").trim().slice(0, 60) || null;
    const ld = body?.letterDate ? parseDay(body.letterDate) : null;
    if (body?.letterDate && !ld) checked.errors.push("Letter date is not a valid date.");
    const summary = checked.departments.map((d) => ({
      departmentId: d.departmentId, departmentName: d.departmentName, employees: d.employees.length,
      days: d.employees.reduce((n, x) => n + x.periods.reduce((m, p) => m + p.days, 0), 0),
    }));
    if (checked.errors.length) return res.status(400).json({ message: checked.errors[0], errors: checked.errors, departments: summary });
    if (body?.dryRun) return res.json({ ok: true, departments: summary });

    const scan = saveScan(req.file);
    if (scan.error) return res.status(400).json({ message: scan.error });
    const created: number[] = [];
    try {
      await db.transaction(async (tx) => {
        for (const d of checked.departments) {
          const rep = (await tx.execute(sql`
            INSERT INTO attendance_reports (department_id, month, year, status, report_type, report_kind, transaction_id,
              receipt_date, finalized_at, despatch_no, despatch_date, file_url, entry_source, entered_by, entered_section)
            VALUES (${d.departmentId}, ${month}, ${year}, 'sent', 'fund', 'main', ${"P" + crypto.randomBytes(4).toString("hex").toUpperCase()},
              NOW(), NOW(), ${letterNo}, ${ld ? `${ld[2]}-${pad(ld[1])}-${pad(ld[0])}` : null}, ${scan.url ?? null},
              'paper', ${who.name}, ${who.section})
            RETURNING id`)).rows[0] as any;
          for (const x of d.employees) {
            for (const p of x.periods.sort((a, b) => a.from[0] - b.from[0])) {
              const period = { fromDate: ddmmyy(p.from), toDate: ddmmyy(p.to), days: p.days };
              await tx.execute(sql`
                INSERT INTO attendance_entries (report_id, employee_id, department_id, days, from_date, to_date, periods, remarks,
                  designation_at_report, employment_status_at_report, pay_level_at_report)
                VALUES (${rep.id}, ${x.emp.id}, ${d.departmentId}, ${p.days}, ${period.fromDate}, ${period.toDate},
                  ${JSON.stringify([period])}, 'Entered from paper attendance',
                  ${x.emp.designation ?? null}, ${x.emp.employment_status ?? null}, ${x.emp.pay_level ?? null})`);
            }
          }
          created.push(Number(rep.id));
        }
      });
    } catch (e) {
      removeScan(scan.url);
      throw e;
    }
    console.log(`[PaperAttendance] ${who.name} (${who.section}) entered ${MONTHS[month]} ${year} paper attendance: reports ${created.join(", ")}`);
    res.json({ ok: true, reportIds: created, departments: summary });
  }));

  // Upload / replace the scanned paper copy of one entry
  app.post(`${base}/:id/scan`, upload.single("scan"), wrap(async (req, res) => {
    const rep = await paperReport(req, res);
    if (!rep) return;
    const scan = saveScan(req.file);
    if (scan.error || !scan.url) return res.status(400).json({ message: scan.error || "Choose the scanned copy (PDF, JPG or PNG)." });
    await db.execute(sql`UPDATE attendance_reports SET file_url = ${scan.url} WHERE id = ${rep.id}`);
    removeScan(rep.file_url);
    res.json({ ok: true, scanUrl: scan.url });
  }));

  // Delete a paper entry (only while no roll of the section uses it)
  app.delete(`${base}/:id`, wrap(async (req, res) => {
    const rep = await paperReport(req, res);
    if (!rep) return;
    const roll = (await db.execute(sql`
      SELECT 1 FROM wage_rolls WHERE department_id = ${rep.department_id} AND section = ${rep.entered_section}
        AND month = ${rep.month} AND year = ${rep.year} LIMIT 1`)).rows[0];
    if (roll) return res.status(409).json({ message: "A payroll roll of this department and month exists. Delete the draft roll first." });
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM attendance_entries WHERE report_id = ${rep.id}`);
      await tx.execute(sql`DELETE FROM attendance_reports WHERE id = ${rep.id}`);
    });
    removeScan(rep.file_url);
    res.json({ ok: true });
  }));
}

/** A paper entry of this actor's section (sends 403 / 404 otherwise) */
async function paperReport(req: Request, res: Response) {
  const id = int(req.params.id);
  const rep = Number.isInteger(id) ? (await db.execute(sql`
    SELECT * FROM attendance_reports WHERE id = ${id} AND entry_source = 'paper' AND status <> 'cancelled'`)).rows[0] as any : null;
  if (!rep) { res.status(404).json({ message: "Paper attendance not found" }); return null; }
  const who = await actor(req, res, rep.entered_section);
  if (!who) return null;
  if (who.section !== rep.entered_section) { res.status(403).json({ message: `This entry belongs to the ${sectionLabel(rep.entered_section)}.` }); return null; }
  return rep;
}

/** For the department's online report: is this employee's month already entered from paper? */
export async function paperEntryOf(employeeId: number, month: number, year: number): Promise<string | null> {
  const r = (await db.execute(sql`
    SELECT ar.entered_section FROM attendance_entries ae JOIN attendance_reports ar ON ar.id = ae.report_id
    WHERE ae.employee_id = ${employeeId} AND ar.month = ${month} AND ar.year = ${year}
      AND ar.entry_source = 'paper' AND ar.status <> 'cancelled' LIMIT 1`)).rows[0] as any;
  return r ? sectionLabel(r.entered_section) : null;
}
