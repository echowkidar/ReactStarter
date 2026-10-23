// ─────────────────────────────────────────────────────────────────────────────
// Reporting Employees (Admin Non Teaching)
//
// An employee who was relieved/transferred but did not join the new department
// reports to a "host" department (Admin Non Teaching) until posted elsewhere.
// The employee is NOT transferred: employees.department_id stays unchanged.
// A row in `reporting_employees` (an "attachment") gives the host department the
// right to send attendance for the days inside the attachment window
// [from_date, to_date or open], through a separate report_type = 'reporting'.
//
// SAFETY: Everything here is only active for departments whose
// `allow_reporting_employees` flag is true, or for employees that have at least
// one attachment row. For every other department/employee, behaviour is
// unchanged. All guards fail OPEN for regular reports (if the new table is
// missing for any reason, existing flows keep working).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { DbStorage } from "./dbStorage";

export type Attachment = {
  id: number;
  employeeId: number;
  hostDepartmentId: number;
  parentDepartmentId: number;
  fromDate: string;       // YYYY-MM-DD
  toDate: string | null;  // YYYY-MM-DD | null (open)
  orderNo: string | null;
  orderDate: string | null;
  remarks: string | null;
  status: string;
  closeReason: string | null;
  createdBy: string;
  createdAt: Date | null;
  closedBy: string | null;
  closedAt: Date | null;
};

// ── Date helpers (timezone-safe: plain day numbers) ──────────────────────────
const OPEN_END = Number.MAX_SAFE_INTEGER;
const dayNum = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 864e5);

/** 'YYYY-MM-DD' -> day number */
export function isoToDay(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const n = dayNum(y, mo, d);
  // reject impossible dates like 2026-02-31
  const back = new Date(n * 864e5);
  if (back.getUTCDate() !== d) return null;
  return n;
}

/** 'DD-MM-YY' (attendance period format) -> day number */
export function ddmmyyToDay(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const p = s.split("-").map(Number);
  if (p.length !== 3 || p.some(isNaN)) return null;
  const [d, m, y] = p;
  return dayNum(y < 100 ? 2000 + y : y, m, d);
}

/** day number -> 'DD-MM-YY' */
export function dayToDDMMYY(n: number): string {
  const dt = new Date(n * 864e5);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(dt.getUTCDate())}-${pad(dt.getUTCMonth() + 1)}-${String(dt.getUTCFullYear()).slice(-2)}`;
}

/** day number -> 'YYYY-MM-DD' */
export function dayToIso(n: number): string {
  return new Date(n * 864e5).toISOString().slice(0, 10);
}

/** Today in India (IST), as day number */
function todayDay(): number {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return dayNum(ist.getUTCFullYear(), ist.getUTCMonth() + 1, ist.getUTCDate());
}

const windowEnd = (a: Attachment) => (a.toDate ? (isoToDay(a.toDate) as number) : OPEN_END);
const windowStart = (a: Attachment) => isoToDay(a.fromDate) as number;

// ── Data access ──────────────────────────────────────────────────────────────
const SELECT_COLS = sql`
  id, employee_id, host_department_id, parent_department_id,
  to_char(from_date, 'YYYY-MM-DD') AS from_date,
  to_char(to_date, 'YYYY-MM-DD') AS to_date,
  order_no, to_char(order_date, 'YYYY-MM-DD') AS order_date, remarks,
  status, close_reason, created_by, created_at, closed_by, closed_at`;

function mapRow(r: any): Attachment {
  return {
    id: Number(r.id),
    employeeId: Number(r.employee_id),
    hostDepartmentId: Number(r.host_department_id),
    parentDepartmentId: Number(r.parent_department_id),
    fromDate: r.from_date,
    toDate: r.to_date || null,
    orderNo: r.order_no ?? null,
    orderDate: r.order_date ?? null,
    remarks: r.remarks ?? null,
    status: r.status,
    closeReason: r.close_reason ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at ?? null,
    closedBy: r.closed_by ?? null,
    closedAt: r.closed_at ?? null,
  };
}

export async function getAttachmentsForEmployees(employeeIds: number[]): Promise<Attachment[]> {
  const ids = [...new Set(employeeIds.filter((x) => Number.isFinite(x)))];
  if (ids.length === 0) return [];
  const res = await db.execute(sql`
    SELECT ${SELECT_COLS} FROM reporting_employees
    WHERE employee_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    ORDER BY from_date`);
  return (res.rows as any[]).map(mapRow);
}

async function getAttachment(id: number): Promise<Attachment | null> {
  const res = await db.execute(sql`SELECT ${SELECT_COLS} FROM reporting_employees WHERE id = ${id}`);
  return res.rows.length ? mapRow(res.rows[0]) : null;
}

/** Map employeeId -> active attachment (for badges in lists) */
export async function getActiveAttachmentMap(employeeIds: number[]): Promise<Map<number, Attachment>> {
  const map = new Map<number, Attachment>();
  const all = await getAttachmentsForEmployees(employeeIds);
  for (const a of all) if (a.status === "active") map.set(a.employeeId, a);
  return map;
}

/** Non-cancelled attendance periods of an employee, optionally only from other departments */
async function getEmployeePeriods(employeeId: number): Promise<Array<{
  reportId: number; departmentId: number; departmentName: string; status: string;
  month: number; year: number; reportType: string; from: number; to: number; fromStr: string; toStr: string;
}>> {
  const res = await db.execute(sql`
    SELECT ae.periods, ar.id AS report_id, ar.department_id, ar.status, ar.month, ar.year,
           COALESCE(ar.report_type, 'regular') AS report_type, d.name AS department_name
    FROM attendance_entries ae
    JOIN attendance_reports ar ON ae.report_id = ar.id
    LEFT JOIN departments d ON d.id = ar.department_id
    WHERE ae.employee_id = ${employeeId} AND ar.status <> 'cancelled'`);
  const out: any[] = [];
  for (const row of res.rows as any[]) {
    let periods: any[] = [];
    try { periods = typeof row.periods === "string" ? JSON.parse(row.periods) : row.periods || []; } catch { continue; }
    if (!Array.isArray(periods)) continue;
    for (const p of periods) {
      const f = ddmmyyToDay(p?.fromDate), t = ddmmyyToDay(p?.toDate);
      if (f == null || t == null) continue;
      out.push({
        reportId: Number(row.report_id), departmentId: Number(row.department_id),
        departmentName: row.department_name || "Unknown", status: row.status,
        month: Number(row.month), year: Number(row.year), reportType: row.report_type,
        from: f, to: t, fromStr: p.fromDate, toStr: p.toDate,
      });
    }
  }
  return out;
}

async function getDeptName(deptId: number): Promise<string> {
  const r = await db.execute(sql`SELECT name FROM departments WHERE id = ${deptId}`);
  return (r.rows[0] as any)?.name || "Unknown Department";
}

/** First run of days in [from, to] not covered by any of `covered` (inclusive day numbers) */
export function firstUncoveredGap(from: number, to: number, covered: Array<{ from: number; to: number }>): { from: number; to: number } | null {
  const sorted = covered.filter((c) => c.to >= from && c.from <= to).sort((a, b) => a.from - b.from);
  let cur = from;
  for (const c of sorted) {
    if (c.from > cur) return { from: cur, to: Math.min(to, c.from - 1) };
    cur = Math.max(cur, c.to + 1);
    if (cur > to) return null;
  }
  return cur <= to ? { from: cur, to } : null;
}

// ── Guard used by POST /api/attendance/:reportId/entries and on submit ──────
export type GuardResult =
  | { ok: true; reportingEmployeeId: number | null }
  | { ok: false; status: number; message: string };

/**
 * Validates one employee's periods for a report against reporting attachments.
 *  - Regular report from any department: days inside another department's
 *    attachment window are blocked (they belong to the host).
 *  - Regular report from the host for a non-staff attached employee: blocked
 *    (must use the Reporting Employees report).
 *  - Reporting report: every period must lie fully inside one of this host's
 *    attachment windows.
 * Employees without attachments + regular reports => unchanged behaviour.
 */
export async function checkReportingGuard(params: {
  employeeId: number;
  reportDepartmentId: number;
  reportType: string;
  periods: Array<{ fromDate: string; toDate: string }>;
}): Promise<GuardResult> {
  const { employeeId, reportDepartmentId, periods } = params;
  const reportType = params.reportType === "reporting" ? "reporting" : "regular";

  let attachments: Attachment[] = [];
  try {
    attachments = await getAttachmentsForEmployees([employeeId]);
  } catch (e) {
    // Table missing / DB hiccup: never break regular attendance.
    console.error("[ReportingGuard] attachment lookup failed:", e);
    if (reportType === "reporting") {
      return { ok: false, status: 500, message: "Could not verify reporting employee details. Please try again." };
    }
    return { ok: true, reportingEmployeeId: null };
  }

  if (attachments.length === 0) {
    if (reportType === "reporting") {
      return { ok: false, status: 400, message: `Employee #${employeeId} is not marked as a reporting employee of this department.` };
    }
    return { ok: true, reportingEmployeeId: null };
  }

  let matchedAttachmentId: number | null = null;
  let employeeDepartmentId: number | null | undefined = undefined; // loaded lazily

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const pf = ddmmyyToDay(p.fromDate), pt = ddmmyyToDay(p.toDate);
    if (pf == null || pt == null) continue; // format errors are reported by the existing validation

    if (reportType === "reporting") {
      const inside = attachments.find(
        (a) => a.hostDepartmentId === reportDepartmentId && pf >= windowStart(a) && pt <= windowEnd(a)
      );
      if (!inside) {
        const own = attachments.filter((a) => a.hostDepartmentId === reportDepartmentId);
        const desc = own.length
          ? own.map((a) => `${dayToDDMMYY(windowStart(a))} to ${a.toDate ? dayToDDMMYY(windowEnd(a)) : "till date"}`).join(", ")
          : "none";
        return {
          ok: false, status: 400,
          message: `Period ${i + 1} (${p.fromDate} to ${p.toDate}) is outside the reporting period of this employee (${desc}).`,
        };
      }
      if (matchedAttachmentId == null) matchedAttachmentId = inside.id;
      continue;
    }

    // Regular report
    for (const a of attachments) {
      const overlaps = pf <= windowEnd(a) && pt >= windowStart(a);
      if (!overlaps) continue;
      if (a.hostDepartmentId !== reportDepartmentId) {
        const hostName = await getDeptName(a.hostDepartmentId);
        return {
          ok: false, status: 409,
          message: `This employee is reporting at "${hostName}" from ${dayToDDMMYY(windowStart(a))}${a.toDate ? ` to ${dayToDDMMYY(windowEnd(a))}` : ""}. Attendance for period ${p.fromDate} to ${p.toDate} will be sent by "${hostName}". Please keep this employee's period before ${dayToDDMMYY(windowStart(a))}${a.toDate ? ` or after ${dayToDDMMYY(windowEnd(a))}` : ""}.`,
        };
      }
      if (employeeDepartmentId === undefined) {
        const er = await db.execute(sql`SELECT department_id FROM employees WHERE id = ${employeeId}`);
        employeeDepartmentId = er.rows.length ? Number((er.rows[0] as any).department_id) : null;
      }
      if (employeeDepartmentId !== reportDepartmentId) {
        return {
          ok: false, status: 400,
          message: `This employee is a reporting employee (not on your staff). Please include him/her in the "Reporting Employees" attendance report instead.`,
        };
      }
    }
  }

  return { ok: true, reportingEmployeeId: reportType === "reporting" ? matchedAttachmentId : null };
}

/**
 * Re-validates all entries of a report (used when a report is submitted), so a
 * draft created before an attachment existed cannot slip through.
 * Only does real work if some employee of the report has an attachment.
 */
export async function validateReportEntries(reportId: number): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const rep = await db.execute(sql`
      SELECT id, department_id, COALESCE(report_type, 'regular') AS report_type
      FROM attendance_reports WHERE id = ${reportId}`);
    const report = rep.rows[0] as any;
    if (!report) return { ok: true };

    const rows = await db.execute(sql`
      SELECT ae.employee_id, ae.periods, e.name, e.epid
      FROM attendance_entries ae
      LEFT JOIN employees e ON e.id = ae.employee_id
      WHERE ae.report_id = ${reportId}
        AND (ae.employee_id IN (SELECT employee_id FROM reporting_employees) OR ${report.report_type} = 'reporting')`);

    for (const r of rows.rows as any[]) {
      let periods: any[] = [];
      try { periods = typeof r.periods === "string" ? JSON.parse(r.periods) : r.periods || []; } catch { periods = []; }
      const g = await checkReportingGuard({
        employeeId: Number(r.employee_id),
        reportDepartmentId: Number(report.department_id),
        reportType: report.report_type,
        periods: Array.isArray(periods) ? periods : [],
      });
      if (!g.ok) return { ok: false, message: `${r.name || "Employee"} (${r.epid || r.employee_id}): ${g.message}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[ReportingGuard] validateReportEntries failed:", e);
    // Fail open only for regular reports; reporting reports need the table anyway.
    return { ok: true };
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerReportingEmployeeRoutes(
  app: Express,
  storage: DbStorage,
  verifyAdminSession: (req: any, res: any, next: any) => any
) {
  const getHost = async (req: any, res: any) => {
    const deptId = Number(req.params.departmentId);
    if (!Number.isFinite(deptId)) { res.status(400).json({ message: "Invalid department" }); return null; }
    const dept = await storage.getDepartment(deptId);
    if (!dept) { res.status(404).json({ message: "Department not found" }); return null; }
    if (!(dept as any).allowReportingEmployees) {
      res.status(403).json({ message: "Reporting employees are not enabled for this department" });
      return null;
    }
    return dept;
  };

  const enrich = async (list: Attachment[]) => {
    if (list.length === 0) return [];
    const empIds = [...new Set(list.map((a) => a.employeeId))];
    const deptIds = [...new Set(list.flatMap((a) => [a.parentDepartmentId, a.hostDepartmentId]))];
    const emps = await db.execute(sql`
      SELECT id, epid, name, designation, employment_status, pay_level, term_expiry, salary_register_no,
             salary_asstt, is_active, department_id, sort_order, joining_shift, transfer_status
      FROM employees WHERE id IN (${sql.join(empIds.map((i) => sql`${i}`), sql`, `)})`);
    const depts = await db.execute(sql`
      SELECT id, name FROM departments WHERE id IN (${sql.join(deptIds.map((i) => sql`${i}`), sql`, `)})`);
    const empMap = new Map((emps.rows as any[]).map((e) => [Number(e.id), e]));
    const deptMap = new Map((depts.rows as any[]).map((d) => [Number(d.id), d.name as string]));
    const curDeptIds = [...new Set((emps.rows as any[]).map((e) => Number(e.department_id)))].filter((x) => !deptMap.has(x));
    if (curDeptIds.length) {
      const more = await db.execute(sql`SELECT id, name FROM departments WHERE id IN (${sql.join(curDeptIds.map((i) => sql`${i}`), sql`, `)})`);
      for (const d of more.rows as any[]) deptMap.set(Number(d.id), d.name);
    }
    return list.map((a) => {
      const e = empMap.get(a.employeeId) || {};
      const currentDeptId = e.department_id != null ? Number(e.department_id) : null;
      let needsClose: string | null = null;
      if (a.status === "active") {
        if (e.is_active && e.is_active !== "active") needsClose = "Employee has been disabled";
        else if (currentDeptId != null && currentDeptId !== a.parentDepartmentId)
          needsClose = `Employee is now posted in "${deptMap.get(currentDeptId) || "another department"}"`;
      }
      return {
        ...a,
        parentDepartmentName: deptMap.get(a.parentDepartmentId) || "Unknown",
        hostDepartmentName: deptMap.get(a.hostDepartmentId) || "Unknown",
        currentDepartmentName: currentDeptId != null ? deptMap.get(currentDeptId) || "Unknown" : null,
        needsClose,
        employee: {
          id: a.employeeId,
          epid: e.epid, name: e.name, designation: e.designation,
          employmentStatus: e.employment_status, payLevel: e.pay_level, termExpiry: e.term_expiry,
          salaryRegisterNo: e.salary_register_no, salary_asstt: e.salary_asstt, isActive: e.is_active,
          departmentId: currentDeptId, sortOrder: e.sort_order ?? 0, joiningShift: e.joining_shift,
          transferStatus: e.transfer_status,
        },
      };
    });
  };

  // List (Employees page "Reporting" tab)
  app.get("/api/departments/:departmentId/reporting-employees", async (req, res) => {
    try {
      const host = await getHost(req, res); if (!host) return;
      const status = String(req.query.status || "active");
      const rows = await db.execute(sql`
        SELECT ${SELECT_COLS} FROM reporting_employees
        WHERE host_department_id = ${host.id}
          AND (${status} = 'all' OR status = ${status})
        ORDER BY status, from_date DESC`);
      res.json(await enrich((rows.rows as any[]).map(mapRow)));
    } catch (e) {
      console.error("Error listing reporting employees:", e);
      res.status(500).json({ message: "Failed to fetch reporting employees" });
    }
  });

  // For the attendance form of a given month
  app.get("/api/departments/:departmentId/reporting-employees/for-month", async (req, res) => {
    try {
      const host = await getHost(req, res); if (!host) return;
      const month = Number(req.query.month), year = Number(req.query.year);
      if (!month || !year) return res.status(400).json({ message: "month and year are required" });
      const monthStart = dayNum(year, month, 1);
      const monthEnd = dayNum(year, month + 1, 1) - 1;
      // Active attachments started on/before month end, plus relieved ones that still have
      // days whose attendance has NOT been prepared yet (arrears). A relieved record whose
      // whole window is already covered by this department's reports is not listed.
      const rows = await db.execute(sql`
        SELECT ${SELECT_COLS} FROM reporting_employees
        WHERE host_department_id = ${host.id}
          AND from_date <= ${dayToIso(monthEnd)}::date
          AND (status = 'active' OR to_date >= ${dayToIso(monthStart - 366)}::date)
        ORDER BY from_date`);
      const attachments = (rows.rows as any[]).map(mapRow);
      const coverCache = new Map<number, Array<{ from: number; to: number }>>();
      const hostCover = async (employeeId: number) => {
        if (!coverCache.has(employeeId)) {
          const periods = await getEmployeePeriods(employeeId);
          coverCache.set(employeeId, periods
            .filter((p) => p.departmentId === host.id && p.reportType === "reporting")
            .map((p) => ({ from: p.from, to: p.to })));
        }
        return coverCache.get(employeeId)!;
      };
      const out: any[] = [];
      for (const a of attachments) {
        const ws = windowStart(a), we = Math.min(windowEnd(a), monthEnd);
        if (we < ws) continue;
        let defFrom: number, defTo: number;
        if (a.status === "active") {
          defFrom = Math.max(ws, monthStart);
          defTo = we;
          if (defFrom > defTo) { defFrom = Math.max(ws, we - 30); }
        } else {
          const gap = firstUncoveredGap(ws, we, await hostCover(a.employeeId));
          if (!gap) continue; // everything already prepared/sent for this relieved record
          // default stays inside the selected month when the gap reaches into it;
          // earlier pending days remain selectable (allowed range starts at the reporting date)
          defFrom = gap.to >= monthStart ? Math.max(gap.from, monthStart) : gap.from;
          defTo = gap.to;
        }
        out.push({
          ...a,
          allowedFrom: dayToDDMMYY(ws),
          allowedTo: dayToDDMMYY(we),
          defaultFrom: dayToDDMMYY(defFrom),
          defaultTo: dayToDDMMYY(defTo),
        });
      }
      res.json(await enrich(out)); // enrich keeps all fields of each item and adds names
    } catch (e) {
      console.error("Error fetching reporting employees for month:", e);
      res.status(500).json({ message: "Failed to fetch reporting employees" });
    }
  });

  // Attach (from Global Search)
  app.post("/api/departments/:departmentId/reporting-employees", async (req, res) => {
    try {
      const host = await getHost(req, res); if (!host) return;
      const { employeeId, fromDate, orderNo, orderDate, remarks } = req.body || {};
      const empId = Number(employeeId);
      const from = isoToDay(fromDate);
      if (!empId) return res.status(400).json({ message: "Employee is required" });
      if (from == null) return res.status(400).json({ message: "Valid reporting date is required" });
      if (from > todayDay()) return res.status(400).json({ message: "Reporting date cannot be in the future" });
      if (!orderNo || !String(orderNo).trim()) return res.status(400).json({ message: "Order / Letter No. is required" });
      if (orderDate && isoToDay(orderDate) == null) return res.status(400).json({ message: "Invalid order date" });

      const employee = await storage.getEmployee(empId);
      if (!employee) return res.status(404).json({ message: "Employee not found" });
      if (employee.isActive !== "active") return res.status(400).json({ message: "Disabled employees cannot be marked as reporting" });
      if (employee.departmentId === host.id) return res.status(400).json({ message: "This employee is already on your staff" });

      const existing = await getAttachmentsForEmployees([empId]);
      const active = existing.find((a) => a.status === "active");
      if (active) {
        const n = await getDeptName(active.hostDepartmentId);
        return res.status(400).json({ message: `Employee is already reporting at "${n}" since ${dayToDDMMYY(windowStart(active))}` });
      }
      const clash = existing.find((a) => from <= windowEnd(a));
      if (clash) {
        const clashHost = await getDeptName(clash.hostDepartmentId);
        return res.status(400).json({
          message: `This employee already has a relieved reporting record at "${clashHost}" for ${dayToDDMMYY(windowStart(clash))} to ${clash.toDate ? dayToDDMMYY(windowEnd(clash)) : "till date"}, which overlaps the new reporting date. Choose a date after ${clash.toDate ? dayToDDMMYY(windowEnd(clash)) : "it"}, or — if that record is wrong — open Employees → Reporting Employees → Relieved and use "Reopen" or "Delete" there.`,
        });
      }

      // Rule 4: other departments must not already have attendance on/after the reporting date
      const periods = await getEmployeePeriods(empId);
      const conflict = periods.find((p) => p.departmentId !== host.id && p.to >= from);
      if (conflict) {
        return res.status(409).json({
          message: `"${conflict.departmentName}" has already included this employee for ${conflict.fromStr} to ${conflict.toStr} (report status: ${conflict.status}). Reporting date must be after ${conflict.toStr}, or that department must first correct its report.`,
        });
      }

      const created = await db.execute(sql`
        INSERT INTO reporting_employees
          (employee_id, host_department_id, parent_department_id, from_date, order_no, order_date, remarks, status, created_by)
        VALUES (${empId}, ${host.id}, ${employee.departmentId}, ${dayToIso(from)}::date, ${String(orderNo).trim()},
                ${orderDate ? dayToIso(isoToDay(orderDate) as number) : null}::date, ${remarks || null}, 'active', ${host.email})
        RETURNING id`);
      const newId = Number((created.rows[0] as any).id);

      await storage.logEmployeeChange(
        empId, "reporting_attach", "reporting",
        `Marked as reporting employee at ${host.name} w.e.f. ${dayToDDMMYY(from)} (Order: ${String(orderNo).trim()})`,
        host.email, "department", host.id
      );

      const att = await getAttachment(newId);
      res.status(201).json(att ? (await enrich([att]))[0] : { id: newId });
    } catch (e: any) {
      if (String(e?.message || "").includes("uq_reporting_active_emp")) {
        return res.status(400).json({ message: "Employee already has an active reporting record" });
      }
      console.error("Error attaching reporting employee:", e);
      res.status(500).json({ message: "Failed to mark reporting employee" });
    }
  });

  // Edit order details / reporting date
  app.patch("/api/departments/:departmentId/reporting-employees/:rid", async (req, res) => {
    try {
      const host = await getHost(req, res); if (!host) return;
      const att = await getAttachment(Number(req.params.rid));
      if (!att || att.hostDepartmentId !== host.id) return res.status(404).json({ message: "Reporting record not found" });
      const { fromDate, orderNo, orderDate, remarks } = req.body || {};

      let newFrom = windowStart(att);
      if (fromDate !== undefined && fromDate !== att.fromDate) {
        const f = isoToDay(fromDate);
        if (f == null) return res.status(400).json({ message: "Invalid reporting date" });
        if (f > todayDay()) return res.status(400).json({ message: "Reporting date cannot be in the future" });
        if (att.toDate && f > windowEnd(att)) return res.status(400).json({ message: "Reporting date cannot be after relieved date" });
        const periods = await getEmployeePeriods(att.employeeId);
        if (periods.some((p) => p.departmentId === host.id && p.reportType === "reporting")) {
          return res.status(400).json({ message: "Reporting date cannot be changed after attendance has been prepared for this employee" });
        }
        const conflict = periods.find((p) => p.departmentId !== host.id && p.to >= f && p.from <= windowEnd(att));
        if (conflict) {
          return res.status(409).json({ message: `"${conflict.departmentName}" has already included this employee for ${conflict.fromStr} to ${conflict.toStr}.` });
        }
        const others = (await getAttachmentsForEmployees([att.employeeId])).filter((a) => a.id !== att.id);
        if (others.some((a) => f <= windowEnd(a) && windowEnd(att) >= windowStart(a))) {
          return res.status(400).json({ message: "Reporting date overlaps another reporting period of this employee" });
        }
        newFrom = f;
      }
      if (orderNo !== undefined && !String(orderNo).trim()) return res.status(400).json({ message: "Order / Letter No. is required" });
      if (orderDate && isoToDay(orderDate) == null) return res.status(400).json({ message: "Invalid order date" });

      await db.execute(sql`
        UPDATE reporting_employees SET
          from_date = ${dayToIso(newFrom)}::date,
          order_no = ${orderNo !== undefined ? String(orderNo).trim() : att.orderNo},
          order_date = ${orderDate !== undefined ? (orderDate ? dayToIso(isoToDay(orderDate) as number) : null) : att.orderDate}::date,
          remarks = ${remarks !== undefined ? remarks || null : att.remarks}
        WHERE id = ${att.id}`);

      if (newFrom !== windowStart(att)) {
        await storage.logEmployeeChange(att.employeeId, "reporting_update", "reporting.fromDate",
          `Reporting date changed ${dayToDDMMYY(windowStart(att))} → ${dayToDDMMYY(newFrom)}`, host.email, "department", host.id);
      }
      const updated = await getAttachment(att.id);
      res.json(updated ? (await enrich([updated]))[0] : null);
    } catch (e) {
      console.error("Error updating reporting employee:", e);
      res.status(500).json({ message: "Failed to update reporting record" });
    }
  });

  // Close (relieved / joined elsewhere)
  app.post("/api/departments/:departmentId/reporting-employees/:rid/close", async (req, res) => {
    try {
      const host = await getHost(req, res); if (!host) return;
      const att = await getAttachment(Number(req.params.rid));
      if (!att || att.hostDepartmentId !== host.id) return res.status(404).json({ message: "Reporting record not found" });
      if (att.status !== "active") return res.status(400).json({ message: "This reporting record is already closed" });
      const { toDate, closeReason } = req.body || {};
      const t = isoToDay(toDate);
      if (t == null) return res.status(400).json({ message: "Valid relieved date is required" });
      if (t < windowStart(att)) return res.status(400).json({ message: "Relieved date cannot be before reporting date" });
      const allowedReasons = ["joined_other_dept", "transfer_cancelled", "disabled", "other"];
      if (!allowedReasons.includes(closeReason)) return res.status(400).json({ message: "Please select a reason" });

      const periods = await getEmployeePeriods(att.employeeId);
      const lastHost = periods.filter((p) => p.departmentId === host.id && p.reportType === "reporting")
        .reduce((m, p) => Math.max(m, p.to), -Infinity);
      if (Number.isFinite(lastHost) && t < lastHost) {
        return res.status(400).json({ message: `Attendance up to ${dayToDDMMYY(lastHost)} is already prepared/sent for this employee. Relieved date cannot be before that.` });
      }

      await db.execute(sql`
        UPDATE reporting_employees SET status = 'closed', to_date = ${dayToIso(t)}::date,
          close_reason = ${closeReason}, closed_by = ${host.email}, closed_at = NOW()
        WHERE id = ${att.id} AND status = 'active'`);
      await storage.logEmployeeChange(att.employeeId, "reporting_close", "reporting",
        `Relieved from ${host.name} (reporting) on ${dayToDDMMYY(t)} — reason: ${closeReason}`, host.email, "department", host.id);
      const updated = await getAttachment(att.id);
      res.json(updated ? (await enrich([updated]))[0] : null);
    } catch (e) {
      console.error("Error closing reporting employee:", e);
      res.status(500).json({ message: "Failed to close reporting record" });
    }
  });

  // Reopen a relieved record (undo "Relieve" done by mistake)
  app.post("/api/departments/:departmentId/reporting-employees/:rid/reopen", async (req, res) => {
    try {
      const host = await getHost(req, res); if (!host) return;
      const att = await getAttachment(Number(req.params.rid));
      if (!att || att.hostDepartmentId !== host.id) return res.status(404).json({ message: "Reporting record not found" });
      if (att.status === "active") return res.status(400).json({ message: "This reporting record is already active" });

      const all = await getAttachmentsForEmployees([att.employeeId]);
      const otherActive = all.find((a) => a.id !== att.id && a.status === "active");
      if (otherActive) {
        const n = await getDeptName(otherActive.hostDepartmentId);
        return res.status(400).json({ message: `Employee already has an active reporting record at "${n}" (since ${dayToDDMMYY(windowStart(otherActive))}).` });
      }
      const later = all.find((a) => a.id !== att.id && windowStart(a) > windowStart(att));
      if (later) {
        return res.status(400).json({ message: `A later reporting record (from ${dayToDDMMYY(windowStart(later))}) exists for this employee, so this one cannot be reopened.` });
      }
      const employee = await storage.getEmployee(att.employeeId);
      if (!employee || employee.isActive !== "active") {
        return res.status(400).json({ message: "Employee is disabled, so the reporting record cannot be reopened." });
      }
      // Days after the relieved date must not already be reported by another department
      const relievedOn = windowEnd(att);
      const periods = await getEmployeePeriods(att.employeeId);
      const conflict = periods.find((p) => p.departmentId !== host.id && p.to > relievedOn);
      if (conflict) {
        return res.status(409).json({
          message: `"${conflict.departmentName}" has already included this employee for ${conflict.fromStr} to ${conflict.toStr} (report status: ${conflict.status}), so reporting cannot be reopened after ${dayToDDMMYY(relievedOn)}.`,
        });
      }

      await db.execute(sql`
        UPDATE reporting_employees SET status = 'active', to_date = NULL, close_reason = NULL, closed_by = NULL, closed_at = NULL
        WHERE id = ${att.id} AND status <> 'active'`);
      await storage.logEmployeeChange(att.employeeId, "reporting_reopen", "reporting",
        `Reporting at ${host.name} reopened (was relieved on ${dayToDDMMYY(relievedOn)})`, host.email, "department", host.id);
      const updated = await getAttachment(att.id);
      res.json(updated ? (await enrich([updated]))[0] : null);
    } catch (e: any) {
      if (String(e?.message || "").includes("uq_reporting_active_emp")) {
        return res.status(400).json({ message: "Employee already has an active reporting record" });
      }
      console.error("Error reopening reporting employee:", e);
      res.status(500).json({ message: "Failed to reopen reporting record" });
    }
  });

  // Delete (only when created by mistake and no attendance prepared)
  app.delete("/api/departments/:departmentId/reporting-employees/:rid", async (req, res) => {
    try {
      const host = await getHost(req, res); if (!host) return;
      const att = await getAttachment(Number(req.params.rid));
      if (!att || att.hostDepartmentId !== host.id) return res.status(404).json({ message: "Reporting record not found" });
      const used = await db.execute(sql`
        SELECT 1 FROM attendance_entries ae JOIN attendance_reports ar ON ar.id = ae.report_id
        WHERE ae.reporting_employee_id = ${att.id} AND ar.status <> 'cancelled' LIMIT 1`);
      if (used.rows.length) {
        return res.status(400).json({ message: "Attendance has already been prepared for this record. Close it instead of deleting." });
      }
      await db.execute(sql`DELETE FROM reporting_employees WHERE id = ${att.id}`);
      await storage.logEmployeeChange(att.employeeId, "reporting_delete", "reporting",
        `Reporting record (w.e.f. ${dayToDDMMYY(windowStart(att))}) deleted by ${host.name}`, host.email, "department", host.id);
      res.json({ message: "Deleted" });
    } catch (e) {
      console.error("Error deleting reporting employee:", e);
      res.status(500).json({ message: "Failed to delete reporting record" });
    }
  });

  // Salary section (read-only list)
  app.get("/api/admin/reporting-employees", verifyAdminSession, async (req, res) => {
    try {
      const status = String(req.query.status || "all");
      const rows = await db.execute(sql`
        SELECT ${SELECT_COLS} FROM reporting_employees
        WHERE (${status} = 'all' OR status = ${status})
        ORDER BY status, from_date DESC`);
      res.json(await enrich((rows.rows as any[]).map(mapRow)));
    } catch (e) {
      console.error("Error listing reporting employees (admin):", e);
      res.status(500).json({ message: "Failed to fetch reporting employees" });
    }
  });

  // Super admin: enable/disable feature for a department
  app.patch("/api/departments/:id/reporting-permit", verifyAdminSession, async (req, res) => {
    try {
      const deptId = Number(req.params.id);
      const allowed = req.body?.allowed === true;
      await db.execute(sql`UPDATE departments SET allow_reporting_employees = ${allowed} WHERE id = ${deptId}`);
      res.json({ id: deptId, allowReportingEmployees: allowed });
    } catch (e) {
      console.error("Error updating reporting permission:", e);
      res.status(500).json({ message: "Failed to update reporting permission" });
    }
  });
}
