// Oracle payroll master  ↔  app employees: what differs and what to do about it.
// ─────────────────────────────────────────────────────────────────────────────
// Pure functions only (no database access) so the same rules are used to show
// the differences and, again on the server, to apply them — the browser only
// says WHICH employees/fields to update, never the values.
//
// Rules agreed with the salary section:
//  • ECODE (Oracle) = epid (app) is the key.
//  • An empty Oracle value never clears an app value.
//  • Department is never changed from Oracle (app departments are the accurate
//    ones); Oracle's posting code is shown for reference and used only to
//    suggest a department for a NEW employee.
//  • An active employee is suggested for disabling only when no regular salary
//    was made in the latest paybill month AND Oracle says blocked / pay release
//    N / term expired / retired.

export type OracleRow = {
  ecode: string;
  emp_name: string | null;
  desig_code: string | null;
  desig_name: string | null;
  sal_no: string | null;
  d_ast: string | null;
  term_app: string | null;
  pay_release_flag: string | null;
  emp_status: string | null;
  emp_cat: string | null;
  posting: string | null;
  pan_no: string | null;
  acct_no: string | null;
  aadhar: string | null;
  bank_code: string | null;
  bank_name: string | null;
  ifsc: string | null;
  date_of_join: string | null;
  retire_date: string | null;
  actual_retire_date: string | null;
  salgroup: string | null;
  suspend: string | null;
  pay_grade: string | null;
  order_no: string | null;
  paid_last_month: number;
};

export type AppEmployee = {
  id: number;
  epid: string;
  name: string;
  designation: string | null;
  salary_register_no: string | null;
  salary_asstt: string | null;
  term_expiry: string | null;
  employment_status: string | null;
  pay_level: string | null;
  pan_number: string | null;
  bank_account: string | null;
  aadhar_card: string | null;
  bank_name: string | null;
  ifsc: string | null;
  employee_category: string | null;
  oracle_emp_status: string | null;
  sal_group: string | null;
  is_active: string;
  department_id: number;
  dept_code: string | null;
  department_name: string | null;
};

export type FieldChange = {
  field: string;
  label: string;
  app: string | null;
  oracle: string;
  /** shown ticked; unticked ones are information the admin may still apply */
  suggested: boolean;
  sensitive?: boolean;
  /** Oracle-only bookkeeping, applied silently together with other updates */
  quiet?: boolean;
  /** the app value is empty — this only fills it in */
  fill?: boolean;
};

export type StatusSuggestion = {
  action: "disable" | "enable";
  suggested: boolean;
  reasons: string[];
  disableReason?: string | null; // retire / term_complete (app values)
  wefDate?: string | null;
};

export type DiffItem = {
  epid: string;
  kind: "existing" | "new" | "missing";
  employeeId: number | null;
  name: string;
  oracleName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  deptCode: string | null;
  posting: string | null;
  appDAst: string | null;
  oracleDAst: string | null;
  register: string | null;
  isActive: string | null;
  oracle: {
    payRelease: string | null;
    empStatus: string | null;
    empStatusLabel: string | null;
    empCat: string | null;
    termApp: string | null;
    paidLastMonth: boolean;
    salGroup: string | null;
  } | null;
  changes: FieldChange[];
  status: StatusSuggestion | null;
  /** NEW employees: department suggested from Oracle's posting code */
  suggestedDepartmentId?: number | null;
  suggestedEmploymentStatus?: string | null;
};

// ── Mappings ────────────────────────────────────────────────────────────────

/** Oracle EMP_STATUS → app employment status (null = no app value; shown only) */
export const EMP_STATUS: Record<string, { label: string; app: string | null }> = {
  C: { label: "Confirm", app: "Permanent" },
  T: { label: "Temporary", app: "Temporary" },
  P: { label: "Probation", app: "Probation" },
  X: { label: "Court Case", app: "Court Case" },
  Y: { label: "Compensate", app: "Compensation" },
  O: { label: "Till Further Order", app: "Till Further Order" },
  Q: { label: "Probation/Conf.Req.", app: null },
  D: { label: "Confirm / Temporary", app: null },
};

/** Oracle PAY_GRADE → app pay level. L0007→L-7, AL014→AL-14, AL13A→L-13A, L0051→L-0 */
export function mapPayLevel(grade: string | null): string | null {
  const g = (grade || "").trim().toUpperCase();
  if (!g) return null;
  if (g === "L0051") return "L-0";
  if (g === "AL13A") return "L-13A";
  let m = g.match(/^L00(\d{2})$/);
  if (m) { const n = Number(m[1]); return n >= 1 && n <= 14 ? `L-${n}` : null; }
  m = g.match(/^AL0(\d{2})$/);
  if (m) { const n = Number(m[1]); return [10, 11, 12, 14].includes(n) ? `AL-${n}` : null; }
  return null;
}

const CATEGORY: Record<string, string> = { P: "Teaching", Q: "Non-Teaching" };

// ── Comparison helpers ─────────────────────────────────────────────────────

const clean = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const loose = (v: unknown) => clean(v).toUpperCase().replace(/[^A-Z0-9]/g, ""); // ignore case, spaces, dots
const upper = (v: unknown) => clean(v).toUpperCase().replace(/\s+/g, " ");
const digits = (v: unknown) => clean(v).replace(/\s+/g, "");

type FieldDef = {
  field: string;          // name used by the API / employee object
  column: string;         // employees table column (whitelist for updates)
  label: string;
  oracle: (o: OracleRow) => string | null;
  app: (a: AppEmployee) => string | null;
  same?: (app: string, oracle: string) => boolean;
  sensitive?: boolean;
  quiet?: boolean;
  date?: boolean;
};

export const FIELDS: FieldDef[] = [
  { field: "name", column: "name", label: "Name",
    oracle: (o) => clean(o.emp_name) || null, app: (a) => a.name,
    same: (x, y) => loose(x) === loose(y) },
  { field: "designation", column: "designation", label: "Designation",
    oracle: (o) => clean(o.desig_name) || null, app: (a) => a.designation,
    same: (x, y) => loose(x) === loose(y) },
  { field: "salaryRegisterNo", column: "salary_register_no", label: "Register No",
    oracle: (o) => upper(o.sal_no) || null, app: (a) => a.salary_register_no,
    same: (x, y) => upper(x) === upper(y) },
  { field: "salary_asstt", column: "salary_asstt", label: "Dealing Assistant",
    oracle: (o) => upper(o.d_ast) || null, app: (a) => a.salary_asstt,
    same: (x, y) => upper(x) === upper(y) },
  { field: "termExpiry", column: "term_expiry", label: "Term Expiry", date: true,
    oracle: (o) => clean(o.term_app) || null, app: (a) => a.term_expiry },
  { field: "employmentStatus", column: "employment_status", label: "Employment Status",
    oracle: (o) => EMP_STATUS[clean(o.emp_status)]?.app ?? null, app: (a) => a.employment_status },
  { field: "payLevel", column: "pay_level", label: "Pay Level",
    oracle: (o) => mapPayLevel(o.pay_grade), app: (a) => a.pay_level },
  { field: "panNumber", column: "pan_number", label: "PAN", sensitive: true,
    oracle: (o) => upper(o.pan_no).replace(/\s/g, "") || null, app: (a) => a.pan_number,
    same: (x, y) => upper(x).replace(/\s/g, "") === upper(y).replace(/\s/g, "") },
  { field: "bankAccount", column: "bank_account", label: "Bank Account", sensitive: true,
    oracle: (o) => digits(o.acct_no) || null, app: (a) => a.bank_account,
    same: (x, y) => digits(x) === digits(y) },
  { field: "aadharCard", column: "aadhar_card", label: "Aadhar", sensitive: true,
    oracle: (o) => digits(o.aadhar) || null, app: (a) => a.aadhar_card,
    same: (x, y) => digits(x) === digits(y) },
  { field: "bankName", column: "bank_name", label: "Bank Name",
    oracle: (o) => clean(o.bank_name) || null, app: (a) => a.bank_name,
    same: (x, y) => upper(x) === upper(y) },
  { field: "ifsc", column: "ifsc", label: "IFSC",
    oracle: (o) => upper(o.ifsc) || null, app: (a) => a.ifsc },
  { field: "employeeCategory", column: "employee_category", label: "Category",
    oracle: (o) => CATEGORY[clean(o.emp_cat)] ?? null, app: (a) => a.employee_category },
  { field: "oracleEmpStatus", column: "oracle_emp_status", label: "Oracle Status", quiet: true,
    oracle: (o) => clean(o.emp_status) || null, app: (a) => a.oracle_emp_status },
  { field: "salGroup", column: "sal_group", label: "Salary Group", quiet: true,
    oracle: (o) => clean(o.salgroup) || null, app: (a) => a.sal_group },
];

export const FIELD_BY_NAME = new Map(FIELDS.map((f) => [f.field, f]));

/** A year outside 1950–2100 is a typing mistake (e.g. 22026) */
export function isBadDate(d: string | null): boolean {
  if (!d) return false;
  const y = Number(String(d).slice(0, 4));
  return !(String(d).length >= 10 && y >= 1950 && y <= 2100);
}

const fmt = (d: string | null) => (d ? d.split("-").reverse().join("-") : "");

function statusFor(a: AppEmployee | null, o: OracleRow, today: string, monthLabel: string): StatusSuggestion | null {
  const paid = o.paid_last_month === 1;
  const release = clean(o.pay_release_flag);
  const term = clean(o.term_app) || null;
  const retire = clean(o.actual_retire_date) || clean(o.retire_date) || null;
  const termExpired = !!term && term < today;
  const retired = !!retire && retire < today;

  if (!a) return null;
  if (a.is_active === "active") {
    if (paid) return null;
    const reasons: string[] = [`No regular salary in ${monthLabel}`];
    if (release === "B") reasons.push("Oracle: pay BLOCKED");
    if (release === "N") reasons.push("Oracle: pay release N");
    if (termExpired) reasons.push(`Term expired ${fmt(term)}`);
    if (retired) reasons.push(`Retired ${fmt(retire)}`);
    const strong = reasons.length > 1;
    return {
      action: "disable",
      suggested: strong,
      reasons,
      disableReason: retired ? "retire" : termExpired ? "term_complete" : null,
      wefDate: retired ? retire : termExpired ? term : null,
    };
  }
  // inactive in app but paid in Oracle
  if (paid && release === "Y") {
    return { action: "enable", suggested: true, reasons: [`Regular salary made in ${monthLabel}`, "Oracle: pay release Y"] };
  }
  return null;
}

export type DiffResult = {
  items: DiffItem[];
  counts: {
    changes: number;      // employees with a real difference (app value ≠ Oracle value)
    fills: number;        // employees whose empty app fields Oracle can fill
    disable: number; enable: number; newEmployees: number; missing: number; badDates: number;
    quietOnly: number;    // only Oracle status / salary group to store
  };
};

export function computeDiff(
  oracleRows: OracleRow[],
  employees: AppEmployee[],
  deptByCode: Map<string, { id: number; name: string }>,
  paybill: { year: number | null; month: number | null },
  today = new Date().toISOString().slice(0, 10),
): DiffResult {
  const monthLabel = paybill.month && paybill.year
    ? new Date(Date.UTC(paybill.year, paybill.month - 1, 1)).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
    : "the latest paybill";
  const byEcode = new Map(oracleRows.map((o) => [clean(o.ecode), o]));
  const appEpids = new Set<string>();
  const items: DiffItem[] = [];
  const counts = { changes: 0, fills: 0, disable: 0, enable: 0, newEmployees: 0, missing: 0, badDates: 0, quietOnly: 0 };

  const oracleSummary = (o: OracleRow) => ({
    payRelease: clean(o.pay_release_flag) || null,
    empStatus: clean(o.emp_status) || null,
    empStatusLabel: EMP_STATUS[clean(o.emp_status)]?.label ?? null,
    empCat: CATEGORY[clean(o.emp_cat)] ?? null,
    termApp: clean(o.term_app) || null,
    paidLastMonth: o.paid_last_month === 1,
    salGroup: clean(o.salgroup) || null,
  });

  for (const a of employees) {
    const epid = clean(a.epid);
    appEpids.add(epid);
    const o = byEcode.get(epid);
    if (!o) {
      if (a.is_active === "active") {
        counts.missing++;
        items.push({
          epid, kind: "missing", employeeId: a.id, name: a.name, oracleName: null,
          departmentId: a.department_id, departmentName: a.department_name, deptCode: a.dept_code, posting: null,
          appDAst: a.salary_asstt, oracleDAst: null, register: a.salary_register_no, isActive: a.is_active,
          oracle: null, changes: [], status: null,
        });
      }
      continue;
    }

    const status = statusFor(a, o, today, monthLabel);
    // Field differences only for employees who are (or should become) active
    const compare = a.is_active === "active" || status?.action === "enable";
    const changes: FieldChange[] = [];
    if (compare) {
      for (const f of FIELDS) {
        const ov = f.oracle(o);
        if (!ov) continue; // empty Oracle value never clears app data
        const av = f.app(a);
        const same = av !== null && av !== undefined && clean(av) !== "" &&
          (f.same ? f.same(clean(av), ov) : clean(av) === ov);
        if (same) continue;
        let suggested = true;
        if (f.field === "termExpiry" && isBadDate(ov)) suggested = false;
        changes.push({
          field: f.field, label: f.label, app: clean(av) || null, oracle: ov, suggested,
          sensitive: f.sensitive, quiet: f.quiet, fill: !clean(av),
        });
      }
    }
    if (compare && isBadDate(a.term_expiry)) counts.badDates++;
    const visible = changes.filter((c) => !c.quiet);
    if (visible.some((c) => !c.fill)) counts.changes++;
    else if (visible.length) counts.fills++;
    else if (changes.length && !status) counts.quietOnly++;
    if (status?.action === "disable") counts.disable++;
    if (status?.action === "enable") counts.enable++;
    if (!changes.length && !status) continue;

    items.push({
      epid, kind: "existing", employeeId: a.id, name: a.name, oracleName: clean(o.emp_name) || null,
      departmentId: a.department_id, departmentName: a.department_name, deptCode: a.dept_code,
      posting: clean(o.posting) || null, appDAst: a.salary_asstt, oracleDAst: clean(o.d_ast) || null,
      register: a.salary_register_no, isActive: a.is_active, oracle: oracleSummary(o), changes, status,
    });
  }

  // Paid in the latest month but not in the app → new employee
  for (const o of oracleRows) {
    const ecode = clean(o.ecode);
    if (appEpids.has(ecode) || o.paid_last_month !== 1) continue;
    counts.newEmployees++;
    const dept = deptByCode.get(upper(o.posting));
    items.push({
      epid: ecode, kind: "new", employeeId: null, name: clean(o.emp_name), oracleName: clean(o.emp_name),
      departmentId: null, departmentName: dept?.name ?? null, deptCode: null, posting: clean(o.posting) || null,
      appDAst: null, oracleDAst: clean(o.d_ast) || null, register: upper(o.sal_no) || null, isActive: null,
      oracle: oracleSummary(o),
      changes: FIELDS.filter((f) => !f.quiet).flatMap((f) => {
        const v = f.oracle(o);
        return v ? [{ field: f.field, label: f.label, app: null, oracle: v, suggested: true, sensitive: f.sensitive }] : [];
      }),
      status: null,
      suggestedDepartmentId: dept?.id ?? null,
      suggestedEmploymentStatus: EMP_STATUS[clean(o.emp_status)]?.app ?? null,
    });
  }

  return { items, counts };
}

/** Values for a NEW employee row, from Oracle (department/status chosen by the admin) */
export function newEmployeeValues(o: OracleRow, departmentId: number, employmentStatus: string, today: string) {
  return {
    department_id: departmentId,
    epid: clean(o.ecode),
    name: clean(o.emp_name),
    designation: clean(o.desig_name),
    employment_status: employmentStatus,
    pay_level: mapPayLevel(o.pay_grade) || "L-0",
    term_expiry: clean(o.term_app) && !isBadDate(clean(o.term_app)) ? clean(o.term_app) : null,
    joining_date: clean(o.date_of_join) || today,
    salary_register_no: upper(o.sal_no),
    office_memo_no: clean(o.order_no),
    joining_shift: "FN",
    salary_asstt: upper(o.d_ast) || null,
    pan_number: upper(o.pan_no).replace(/\s/g, ""),
    bank_account: digits(o.acct_no),
    aadhar_card: digits(o.aadhar),
    bank_name: clean(o.bank_name) || null,
    ifsc: upper(o.ifsc) || null,
    employee_category: CATEGORY[clean(o.emp_cat)] ?? null,
    oracle_emp_status: clean(o.emp_status) || null,
    sal_group: clean(o.salgroup) || null,
  };
}
