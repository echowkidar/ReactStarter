// Import of wage / fund staff (letter EPIDs, e.g. R0001) from an Excel sheet by the
// Accounts, Bill or Students section (or the Super Admin choosing a section).
// Columns (the browser reads the sheet and sends the rows): EPID, Name, Department code,
// Designation code, Employment Status, Term Expiry.
//  • Dealing assistant comes from the section: Accounts → ACC, Bill → BIL, Students → STU.
//  • An EPID already in the app is skipped (reported), never changed.
//  • Department code → a department registered in the app (department code list).
//  • Designation code → designation name from the latest payroll snapshot (Oracle sync);
//    a full designation name is also accepted.
//  • Joining date is not in the sheet but cannot be empty: the import date is stored and
//    a remark asks the department to correct it.
// dryRun = check only (preview); otherwise valid rows are created, invalid ones reported.
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionAdmin } from "./auth";
import { FUND_STATUSES, canonicalStatus, employeeKindError, isLetterEpid } from "../shared/employeeKind";
import { sectionOfAdmin, sectionLabel, type SectionKey } from "../shared/sections";

const MAX_ROWS = 2000;
const SECTION_CODE: Record<Exclude<SectionKey, "salary">, string> = { accounts: "ACC", bill: "BIL", students: "STU" };

type InRow = { epid?: any; name?: any; departmentCode?: any; designationCode?: any; employmentStatus?: any; termExpiry?: any };
type OutRow = {
  row: number; epid: string; name: string; ok: boolean; error?: string;
  departmentId?: number; departmentName?: string; designation?: string; employmentStatus?: string; termExpiry?: string; created?: boolean;
};

const clean = (v: any) => String(v ?? "").replace(/\s+/g, " ").trim();

/** yyyy-mm-dd, dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy (also 2-digit years) → yyyy-mm-dd, else null */
export function parseImportDate(v: any): string | null {
  const s = clean(v);
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else {
    r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function designationLookup(): Promise<{ byCode: Map<string, string>; names: Set<string> }> {
  const byCode = new Map<string, string>();
  const names = new Set<string>();
  try {
    const s = await db.execute(sql`
      SELECT DISTINCT x->>'desig_code' AS code, x->>'desig_name' AS name
      FROM oracle_snapshots, jsonb_array_elements(rows::jsonb) x
      WHERE id = (SELECT MAX(id) FROM oracle_snapshots) AND x->>'desig_name' IS NOT NULL`);
    for (const r of s.rows as any[]) {
      if (r.code) byCode.set(clean(r.code).toUpperCase(), clean(r.name).toUpperCase());
      if (r.name) names.add(clean(r.name).toUpperCase());
    }
  } catch { /* no snapshot yet */ }
  const e = await db.execute(sql`SELECT DISTINCT UPPER(TRIM(designation)) AS d FROM employees WHERE designation IS NOT NULL`);
  for (const r of e.rows as any[]) if (r.d) names.add(clean(r.d));
  return { byCode, names };
}

async function departmentLookup(): Promise<Map<string, { id: number; name: string }>> {
  // department code list → the department registered in the app (same name)
  const r = await db.execute(sql`
    SELECT UPPER(TRIM(dn.dept_code)) AS code, d.id, d.name
    FROM department_names dn
    JOIN departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(dn.dept_name))
    WHERE dn.dept_code IS NOT NULL
    ORDER BY d.id`);
  const map = new Map<string, { id: number; name: string }>();
  for (const row of r.rows as any[]) if (!map.has(row.code)) map.set(row.code, { id: Number(row.id), name: row.name });
  return map;
}

function fmt(d: string) { return d.split("-").reverse().join("-"); }

export function registerFundEmployeeImportRoutes(app: Express) {
  app.post("/api/admin/fund-employees/import", async (req: Request, res: Response) => {
    try {
      const admin = await sessionAdmin(req);
      const role = String(admin?.role ?? "");
      const code = String(admin?.userCode ?? "").toUpperCase();
      let section: SectionKey = "salary";
      if (["salary", "salary_admin"].includes(role)) section = sectionOfAdmin(code);
      else if (["super", "super_admin", "superadmin"].includes(role) && code !== "VEW") {
        const s = String(req.body?.section ?? "");
        if (s === "accounts" || s === "bill" || s === "students") section = s;
      }
      if (section === "salary") {
        return res.status(403).json({ message: "Only the Accounts, Bill or Students section (or the Super Admin in a section view) can import these employees." });
      }
      const dealingAssistant = SECTION_CODE[section];

      const rows: InRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!rows.length) return res.status(400).json({ message: "The file has no rows." });
      if (rows.length > MAX_ROWS) return res.status(400).json({ message: `At most ${MAX_ROWS} rows can be imported at once.` });
      const dryRun = req.body?.dryRun !== false;

      const [desig, depts, existing] = await Promise.all([
        designationLookup(),
        departmentLookup(),
        db.execute(sql`SELECT e.epid, e.name, d.name AS dept FROM employees e LEFT JOIN departments d ON d.id = e.department_id`),
      ]);
      const existingByEpid = new Map((existing.rows as any[]).map((r) => [clean(r.epid).toUpperCase(), r]));
      const seen = new Set<string>();
      const today = new Date().toISOString().slice(0, 10);

      const results: OutRow[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        const epid = clean(r.epid).toUpperCase();
        const name = clean(r.name).toUpperCase();
        const out: OutRow = { row: i + 2, epid, name, ok: false }; // row 1 = headings
        const fail = (error: string) => { out.error = error; results.push(out); };

        if (!epid) { fail("EPID is empty"); continue; }
        if (!isLetterEpid(epid)) { fail("EPID must start with a letter (e.g. R0001)"); continue; }
        if (seen.has(epid)) { fail("Same EPID appears twice in the file"); continue; }
        seen.add(epid);
        const ex = existingByEpid.get(epid);
        if (ex) { fail(`Already in the app: ${ex.name}${ex.dept ? `, ${ex.dept}` : ""} (skipped)`); continue; }
        if (!name) { fail("Name is empty"); continue; }

        const dCode = clean(r.departmentCode).toUpperCase();
        const dept = depts.get(dCode);
        if (!dCode) { fail("Department code is empty"); continue; }
        if (!dept) { fail(`Department code ${dCode} is not a registered department in the app`); continue; }
        out.departmentId = dept.id;
        out.departmentName = dept.name;

        const gCode = clean(r.designationCode).toUpperCase();
        if (!gCode) { fail("Designation code is empty"); continue; }
        const designation = desig.byCode.get(gCode) ?? (desig.names.has(gCode) ? gCode : null);
        if (!designation) { fail(`Designation code ${gCode} not found`); continue; }
        out.designation = designation;

        const status = canonicalStatus(r.employmentStatus);
        if (!status || !(FUND_STATUSES as readonly string[]).includes(status)) {
          fail(`Employment Status must be one of: ${FUND_STATUSES.join(", ")}`); continue;
        }
        out.employmentStatus = status;

        const term = parseImportDate(r.termExpiry);
        if (!term) { fail("Term Expiry date is missing or not a valid date (use DD-MM-YYYY)"); continue; }
        out.termExpiry = term;

        const kindErr = employeeKindError({ epid, employmentStatus: status, salary_asstt: dealingAssistant, termExpiry: term }, () => true);
        if (kindErr) { fail(kindErr); continue; }

        out.ok = true;
        results.push(out);
      }

      let created = 0;
      if (!dryRun) {
        const by = admin?.name || admin?.email || sectionLabel(section);
        const remark = `Imported by ${sectionLabel(section)} on ${fmt(today)} — joining date to be updated`;
        await db.transaction(async (tx) => {
          for (const o of results) {
            if (!o.ok) continue;
            const deptId = o.departmentId!;
            const ins = await tx.execute(sql`
              INSERT INTO employees (department_id, epid, name, pan_number, bank_account, aadhar_card, designation,
                employment_status, pay_level, term_expiry, joining_date, salary_register_no, office_memo_no,
                joining_shift, salary_asstt, is_active, remarks)
              SELECT ${deptId}, ${o.epid}, ${o.name}, '', '', '', ${o.designation}, ${o.employmentStatus}, 'L-0',
                ${o.termExpiry}, ${today}, '', '', 'FN', ${dealingAssistant}, 'active', ${remark}
              WHERE NOT EXISTS (SELECT 1 FROM employees WHERE UPPER(TRIM(epid)) = ${o.epid})
              RETURNING id`);
            if (ins.rows.length) { o.created = true; created++; }
            else { o.ok = false; o.error = "Already in the app (skipped)"; }
          }
        });
        console.log(`[FundImport] ${by}: ${created} employee(s) imported for ${sectionLabel(section)}`);
      }

      res.json({
        section, dealingAssistant, dryRun,
        total: results.length, valid: results.filter((r) => r.ok).length, created,
        results,
      });
    } catch (e: any) {
      console.error("[FundImport]", e);
      res.status(500).json({ message: "Import failed. Nothing was saved." });
    }
  });
}
