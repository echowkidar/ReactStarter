// Wages / Fund Staff attendance report (attendance_reports.report_type = 'fund').
// Holds a department's letter-EPID employees (R0001…), whose wages are made by the
// Accounts, Bill and Students sections. Rules:
//  • The Super Admin opens / closes the report for all departments (app setting
//    fund_report_open). No 15th-day deadline applies.
//  • Only departments with active letter-EPID employees may create one.
//  • A supplementary fund report needs the one-time permit departments.allow_fund_supplementary,
//    granted by a section login or the Super Admin, and used up once the report is created.
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionAdmin } from "./auth";
import { isSectionLoginCode, sectionOfAdmin, sectionLabel } from "../shared/sections";

const OPEN_KEY = "fund_report_open";
const LETTER_EPID_SQL = sql`e.epid ~ '^[A-Za-z]'`;

export async function isFundReportOpen(): Promise<boolean> {
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = ${OPEN_KEY}`);
  return String((r.rows[0] as any)?.value ?? "false") === "true";
}

export async function fundStaffCount(departmentId: number): Promise<number> {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM employees e
    WHERE e.department_id = ${departmentId} AND e.is_active = 'active' AND ${LETTER_EPID_SQL}`);
  return Number((r.rows[0] as any)?.n ?? 0);
}

/**
 * For e-mails about a report: null when it is not a Wages / Fund Staff report, else the sections
 * that receive it ("Accounts Section and Bill Section"), from its employees' dealing assistants.
 */
export async function fundReportRecipients(reportId: number | string | undefined): Promise<string | null> {
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = (await db.execute(sql`SELECT COALESCE(report_type, 'regular') AS t FROM attendance_reports WHERE id = ${id}`)).rows[0] as any;
  if (!r || r.t !== "fund") return null;
  const codes = (await db.execute(sql`
    SELECT DISTINCT UPPER(TRIM(COALESCE(e.salary_asstt, ''))) AS c
    FROM attendance_entries ae JOIN employees e ON e.id = ae.employee_id WHERE ae.report_id = ${id}`)).rows.map((x: any) => x.c);
  const labels = [...new Set(codes.map((c: string) => sectionOfAdmin(c === "OTH" ? "ACC" : c)).filter((s) => s !== "salary"))]
    .map((s) => sectionLabel(s));
  return labels.length ? labels.join(" and ") : "Accounts / Bill / Students Section";
}

export async function fundSupplementaryAllowed(departmentId: number): Promise<boolean> {
  const r = await db.execute(sql`SELECT allow_fund_supplementary FROM departments WHERE id = ${departmentId}`);
  return (r.rows[0] as any)?.allow_fund_supplementary === true;
}

export async function useUpFundSupplementary(departmentId: number): Promise<void> {
  await db.execute(sql`UPDATE departments SET allow_fund_supplementary = false WHERE id = ${departmentId}`);
}

const isSuperAdmin = (a: any) =>
  !!a && ["super", "super_admin", "superadmin"].includes(a.role) && String(a.userCode ?? "").toUpperCase() !== "VEW";
const isSectionAdmin = (a: any) =>
  !!a && ["salary", "salary_admin"].includes(a.role) && isSectionLoginCode(a.userCode);

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) =>
  fn(req, res).catch((e) => {
    console.error("[FundReports]", e);
    res.status(500).json({ message: "Something went wrong" });
  });

export function registerFundReportRoutes(app: Express) {
  // Window state + departments that have letter-EPID staff (admin dashboard)
  app.get("/api/admin/fund-report-status", wrap(async (_req, res) => {
    const rows = await db.execute(sql`
      SELECT d.id, d.name, COALESCE(d.allow_fund_supplementary, false) AS allow, COUNT(e.id)::int AS n
      FROM departments d
      JOIN employees e ON e.department_id = d.id AND e.is_active = 'active' AND ${LETTER_EPID_SQL}
      GROUP BY d.id, d.name, d.allow_fund_supplementary
      ORDER BY d.name`);
    res.json({
      open: await isFundReportOpen(),
      departments: (rows.rows as any[]).map((r) => ({
        id: Number(r.id), name: r.name, fundStaffCount: Number(r.n), allowFundSupplementary: r.allow === true,
      })),
    });
  }));

  // Open / close the Wages / Fund Staff report for all departments — Super Admin only
  app.patch("/api/admin/fund-report-open", wrap(async (req, res) => {
    const admin = await sessionAdmin(req);
    if (!isSuperAdmin(admin)) return res.status(403).json({ message: "Only the Super Admin can open or close this report." });
    const open = req.body?.open === true;
    await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES (${OPEN_KEY}, ${String(open)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    res.json({ open });
  }));

  // One-time supplementary permit for a department — Super Admin or a section login
  app.patch("/api/departments/:id/fund-supplementary-permit", wrap(async (req, res) => {
    const admin = await sessionAdmin(req);
    if (!isSuperAdmin(admin) && !isSectionAdmin(admin)) {
      return res.status(403).json({ message: "Only the Super Admin or a section login can allow this." });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid department" });
    const allowed = req.body?.allowed === true;
    const r = await db.execute(sql`UPDATE departments SET allow_fund_supplementary = ${allowed} WHERE id = ${id} RETURNING id`);
    if (!r.rows.length) return res.status(404).json({ message: "Department not found" });
    res.json({ id, allowFundSupplementary: allowed });
  }));
}
