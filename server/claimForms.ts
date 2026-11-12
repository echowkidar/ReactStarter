// Online claim forms (NPA, HRA — later PCA, Conveyance, CEA).
// ─────────────────────────────────────────────────────────────────────────────
// Three groups of routes:
//   /api/public/forms/*                      the employee, without a login
//       (Permanent ID + date of joining; a short "claimant" session after that)
//   /api/departments/:departmentId/claim-forms/*   the department that certifies
//       (prints, uploads the signed scan with dispatch no. / date, or returns it)
//   /api/admin/claim-forms/*                 the Salary Section
//       (sees a claim only after the department uploaded the signed form)
// Rules of the forms themselves are in shared/claimForms.ts, prints in claimPdf.ts.
//
// The public routes are open in the /api gate (auth.ts → "/api/public/"), so every
// one of them checks the claimant session here. Nothing here reads Oracle: employee
// data comes from the app's own tables (kept current by the Oracle sync).
import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionAdmin, sessionDepartmentId, sessionStaff, regenerateKeeping, saveSession } from "./auth";
import { rateLimit, safeUploadName } from "./security";
import { notify } from "./notify";
import { buildClaimPdf, claimPrintCode, claimPrintRef } from "./claimPdf";
import { ceaRates } from "./ceaSettings";
import {
  CLAIM_DATA_SCHEMAS, CLAIM_FORM_DEFS, CLAIM_FORM_TYPES, CLAIM_STATUS_HELP, CLAIM_STATUS_LABELS,
  DEFAULT_CONVEYANCE_RATES, DEPARTMENT_ACTIONABLE, EMPLOYEE_EDITABLE, PCA_STATUSES, appointmentKey, claimableHalfYears,
  claimableQuarters, conveyanceAmounts, formatClaimDate, halfYearLabel, halfYearRange, isClaimFormType, monthLabel,
  quarterLabel, quarterMonths, CEA_APPROVALS, ceaApprovalFor, ceaChildAmounts, ceaClaimableSessions,
  ceaEligibleChildren, sessionRange, type CeaChild, type FamilyChild,
  type ClaimForm, type ClaimFormType, type ClaimSnapshot, type ClaimStatus, type ConveyanceRate, type PcaCategory,
} from "@shared/claimForms";

declare module "express-session" {
  interface SessionData {
    // Employee who proved who they are on the public forms page (employees.id)
    claimEmployeeId?: number;
    claimAt?: number;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLAIM_UPLOAD_DIR = path.join(__dirname, "../uploads/claims");
const CLAIMANT_IDLE_MS = 30 * 60 * 1000;
const MAX_WRONG_TRIES = 5;
const NOT_ELIGIBLE = "You cannot fill this form online. Please contact your Department and the Salary Section.";
const ADMIN_VISIBLE: ClaimStatus[] = ["sent", "returned_department", "accepted", "processed", "rejected"];

// ── Small helpers ────────────────────────────────────────────────────────────

const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const clientIp = (req: Request) => String(req.ip || req.socket.remoteAddress || "unknown");
const isIsoDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

let enabledCache: { at: number; value: boolean } | null = null;
export async function claimFormsEnabled(): Promise<boolean> {
  if (enabledCache && Date.now() - enabledCache.at < 10_000) return enabledCache.value;
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = 'claim_forms_enabled'`);
  const value = String((r.rows[0] as any)?.value || "false") === "true";
  enabledCache = { at: Date.now(), value };
  return value;
}

/** Same Cloudflare check as the login pages; skipped when no key is configured (local testing) */
async function captchaOk(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || typeof token !== "string") return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    return !!((await r.json()) as any).success;
  } catch (error) {
    console.error("[ClaimForms] captcha check failed:", error);
    return false;
  }
}

// Wrong tries are counted per Permanent ID + network, in the same table as the logins
const tryKey = (epid: string, req: Request) => `claim|${epid}|${clientIp(req)}`;
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
  if (!r.rows.length) {
    await db.execute(sql`INSERT INTO login_attempts (identifier, attempt_count, last_attempt_at) VALUES (${key}, 1, NOW())`);
  }
}
const clearTries = (key: string) => db.execute(sql`DELETE FROM login_attempts WHERE identifier = ${key}`);

// ── Reading claims ───────────────────────────────────────────────────────────

/** A TIMESTAMPTZ column as ISO text in UTC ("…Z"); only ever called with fixed column names */
function utc(column: string) {
  return sql.raw(`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);
}

const CLAIM_COLUMNS = sql`
  c.id, c.form_type AS "formType", c.ref_no AS "refNo", c.revision, c.employee_id AS "employeeId", c.epid,
  c.department_id AS "departmentId", c.period_key AS "periodKey", c.period_label AS "periodLabel", c.status,
  c.data, c.snapshot, c.dispatch_no AS "dispatchNo", c.dispatch_date::text AS "dispatchDate", c.ai_check AS "aiCheck",
  c.return_reason AS "returnReason", c.returned_by AS "returnedBy", c.decided_by AS "decidedBy",
  c.processed_month AS "processedMonth", ${utc("c.created_at")} AS "createdAt", ${utc("c.updated_at")} AS "updatedAt",
  ${utc("c.submitted_at")} AS "submittedAt", ${utc("c.sent_at")} AS "sentAt", ${utc("c.decided_at")} AS "decidedAt"`;

function toClaim(row: any): ClaimForm {
  const iso = (v: any) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
  return {
    ...row,
    id: Number(row.id),
    revision: Number(row.revision),
    employeeId: Number(row.employeeId),
    departmentId: Number(row.departmentId),
    data: typeof row.data === "string" ? JSON.parse(row.data) : row.data || {},
    snapshot: typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot || {},
    aiCheck: typeof row.aiCheck === "string" ? JSON.parse(row.aiCheck) : row.aiCheck || null,
    createdAt: iso(row.createdAt)!, updatedAt: iso(row.updatedAt)!,
    submittedAt: iso(row.submittedAt), sentAt: iso(row.sentAt), decidedAt: iso(row.decidedAt),
  };
}

async function getClaim(id: number): Promise<ClaimForm | null> {
  if (!Number.isFinite(id)) return null;
  const r = await db.execute(sql`SELECT ${CLAIM_COLUMNS} FROM claim_forms c WHERE c.id = ${id}`);
  return r.rows[0] ? toClaim(r.rows[0]) : null;
}

async function withDetail(claim: ClaimForm): Promise<ClaimForm> {
  const files = (await db.execute(sql`
    SELECT id, kind, file_url AS "fileUrl", revision, uploaded_by AS "uploadedBy", is_current AS "isCurrent", ${utc("created_at")} AS "createdAt"
    FROM claim_form_files WHERE claim_id = ${claim.id} ORDER BY id DESC`)).rows as any[];
  const events = (await db.execute(sql`
    SELECT id, action, from_status AS "fromStatus", to_status AS "toStatus", actor_type AS "actorType",
           actor_name AS "actorName", remarks, ${utc("created_at")} AS "createdAt"
    FROM claim_form_events WHERE claim_id = ${claim.id} ORDER BY id`)).rows as any[];
  return {
    ...claim,
    files: files.map((f) => ({ ...f, id: Number(f.id), revision: Number(f.revision) })),
    events: events.map((e) => ({ ...e, id: Number(e.id) })),
    hasUndertaking: files.some((f) => f.kind === "undertaking" && f.isCurrent && Number(f.revision) === claim.revision),
  };
}

/** What the employee may see of a claim: no file addresses (they have no login to open them) */
function forEmployee(claim: ClaimForm): ClaimForm {
  return {
    ...claim,
    aiCheck: null,
    files: claim.files?.map((f) => ({ ...f, fileUrl: "" })),
    events: claim.events?.map((e) => ({ ...e, actorName: e.actorType === "employee" ? e.actorName : e.actorType === "admin" ? "Salary Section" : "Department" })),
  };
}

type Actor = { type: "employee" | "department" | "staff" | "admin" | "system"; name: string };

async function logEvent(req: Request | null, claimId: number, action: string, from: string | null, to: string | null, actor: Actor, remarks?: string | null) {
  await db.execute(sql`
    INSERT INTO claim_form_events (claim_id, action, from_status, to_status, actor_type, actor_name, remarks, ip)
    VALUES (${claimId}, ${action}, ${from}, ${to}, ${actor.type}, ${actor.name}, ${remarks || null}, ${req ? clientIp(req) : null})`);
}

/**
 * Move a claim from one of `from` to `to` — in one statement, so two people acting
 * at the same moment cannot both succeed. Returns the claim, or null if its status
 * had already changed.
 */
async function move(claimId: number, from: ClaimStatus[], to: ClaimStatus, extra: ReturnType<typeof sql>[] = []): Promise<ClaimForm | null> {
  const sets = [sql`status = ${to}`, sql`updated_at = NOW()`, ...extra];
  const r = await db.execute(sql`
    UPDATE claim_forms SET ${sql.join(sets, sql`, `)}
    WHERE id = ${claimId} AND status IN (${sql.join(from.map((s) => sql`${s}`), sql`, `)})
    RETURNING id`);
  return r.rows.length ? getClaim(claimId) : null;
}

// ── Employee (claimant) ──────────────────────────────────────────────────────

type EmployeeRow = {
  id: number; epid: string; name: string; designation: string; department_id: number; pay_level: string | null;
  salary_register_no: string | null; salary_asstt: string | null; is_active: string; bank_account: string | null;
  bank_name: string | null; bank_code: string | null; joining_date: string | null; payroll_joining_date: string | null;
  conveyance_flag: string | null; vacation_code: string | null;
  employment_status: string | null; payroll_confirm_date: string | null;
  department_name: string | null; hod_title: string | null; host_department_id: number | null;
  host_department_name: string | null; host_hod_title: string | null;
};

const EMPLOYEE_SELECT = sql`
  SELECT e.id, e.epid, e.name, e.designation, e.department_id, e.pay_level, e.salary_register_no, e.salary_asstt,
         e.is_active, e.bank_account, e.bank_name, e.bank_code, e.conveyance_flag, e.vacation_code,
         e.employment_status, e.payroll_confirm_date::text AS payroll_confirm_date,
         e.joining_date::text AS joining_date, e.payroll_joining_date::text AS payroll_joining_date,
         d.name AS department_name, d.hod_title,
         h.id AS host_department_id, h.name AS host_department_name, h.hod_title AS host_hod_title
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN LATERAL (
    SELECT r.host_department_id FROM reporting_employees r
    WHERE r.employee_id = e.id AND r.status = 'active' ORDER BY r.id DESC LIMIT 1
  ) rep ON true
  LEFT JOIN departments h ON h.id = rep.host_department_id`;

async function employeeById(id: number): Promise<EmployeeRow | null> {
  const r = await db.execute(sql`${EMPLOYEE_SELECT} WHERE e.id = ${id}`);
  return (r.rows[0] as any) || null;
}

/** A real date of joining (placeholders and typing mistakes do not count) */
function realDate(v: string | null): string | null {
  if (!v || !isIsoDate(v)) return null;
  const year = Number(v.slice(0, 4));
  return year >= 1950 && year <= new Date().getFullYear() ? v : null;
}

/** Paid by separate cheque: these employees do not use the online forms */
function separateCheque(e: EmployeeRow): boolean {
  return clean(e.bank_code).toUpperCase() === "SP" || /separate\s+cheque/i.test(clean(e.bank_name));
}

/** The department that certifies: where the employee's attendance comes from */
function certifyingDepartment(e: EmployeeRow): { id: number; name: string; hodTitle: string | null } {
  if (e.host_department_id) return { id: Number(e.host_department_id), name: clean(e.host_department_name), hodTitle: e.host_hod_title };
  return { id: Number(e.department_id), name: clean(e.department_name), hodTitle: e.hod_title };
}

function employeeSummary(e: EmployeeRow) {
  const dept = certifyingDepartment(e);
  return {
    name: e.name, epid: e.epid, designation: e.designation, departmentName: dept.name,
    payLevel: e.pay_level, joiningDate: realDate(e.payroll_joining_date) || realDate(e.joining_date),
  };
}

function snapshotOf(e: EmployeeRow): ClaimSnapshot {
  const dept = certifyingDepartment(e);
  return {
    name: clean(e.name), epid: clean(e.epid), designation: clean(e.designation), departmentName: dept.name,
    payLevel: e.pay_level, salaryRegisterNo: e.salary_register_no, dealingAssistant: clean(e.salary_asstt).toUpperCase() || null,
    hodTitle: dept.hodTitle,
  };
}

/** The identified employee of this request, or null (also ends an idle claimant session) */
async function claimant(req: Request): Promise<EmployeeRow | null> {
  const id = req.session?.claimEmployeeId;
  if (!id) return null;
  if (!req.session.claimAt || Date.now() - req.session.claimAt > CLAIMANT_IDLE_MS) {
    delete req.session.claimEmployeeId;
    delete req.session.claimAt;
    return null;
  }
  const e = await employeeById(id);
  if (!e || e.is_active !== "active") return null;
  req.session.claimAt = Date.now();
  return e;
}

async function claimsOfEmployee(employeeId: number): Promise<ClaimForm[]> {
  const r = await db.execute(sql`SELECT ${CLAIM_COLUMNS} FROM claim_forms c WHERE c.employee_id = ${employeeId} ORDER BY c.id DESC`);
  return Promise.all(r.rows.map(toClaim).map(async (c) => forEmployee(await withDetail(c))));
}

// ── Conveyance allowance: rates, eligibility, periods already paid ──────────

/** Rates of the conveyance allowance (admin-editable, each from a month onwards) */
async function conveyanceRates(): Promise<ConveyanceRate[]> {
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = 'conveyance_rates'`);
  try {
    const list = JSON.parse(String((r.rows[0] as any)?.value || "[]"));
    const ok = (Array.isArray(list) ? list : []).filter((x: any) =>
      /^\d{4}-(0[1-9]|1[0-2])$/.test(String(x?.from)) && Number(x?.amount) > 0 && Number(x?.daPercent) >= 0)
      .map((x: any) => ({
        from: String(x.from), amount: Number(x.amount), daPercent: Number(x.daPercent),
        // rates saved before two-wheeler rates existed: the payroll's two-wheeler rate
        twoWheeler: Number(x.twoWheeler) > 0 ? Number(x.twoWheeler) : 1080,
      }));
    return ok.length ? ok : DEFAULT_CONVEYANCE_RATES;
  } catch {
    return DEFAULT_CONVEYANCE_RATES;
  }
}

/** Marked in the payroll master as entitled to the conveyance allowance */
function conveyanceEligible(e: EmployeeRow): boolean {
  return ["Y", "YES", "1", "T"].includes(clean(e.conveyance_flag).toUpperCase());
}

/** Months ("YYYY-MM") for which conveyance allowance was already paid through the payroll */
async function conveyancePaidMonths(epid: string, months: string[]): Promise<string[]> {
  if (!months.length) return [];
  const rows = (await db.execute(sql`
    SELECT period_from::text AS f, COALESCE(period_to, period_from)::text AS t
    FROM conveyance_paid WHERE epid = ${epid}`)).rows as any[];
  return months.filter((m) => rows.some((r) => String(r.f).slice(0, 7) <= m && String(r.t).slice(0, 7) >= m));
}

// ── Patient Care Allowance: PCA departments, who may claim, payroll of the months before ──

/** Departments (ids) whose employees may claim PCA — chosen by the Salary Section */
async function pcaDepartmentIds(): Promise<number[]> {
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = 'pca_departments'`);
  try {
    const list = JSON.parse(String((r.rows[0] as any)?.value || "[]"));
    return (Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite);
  } catch {
    return [];
  }
}

/** Why this employee cannot claim PCA, or null when they can */
async function pcaBlocked(e: EmployeeRow): Promise<string | null> {
  if (!PCA_STATUSES.includes(clean(e.employment_status))) {
    return "The PCA claim form is not applicable for temporary staff. Please contact your Department and the Salary Section.";
  }
  if (!(await pcaDepartmentIds()).includes(certifyingDepartment(e).id)) return NOT_ELIGIBLE;
  return null;
}

/**
 * The six months before a half-year in the copied paybill: was PCA drawn, and did
 * the department change? Decides whether the claim continues one, is new, or is a
 * transfer case. "unknown" when there is no paybill row for those months at all.
 */
async function pcaCategory(epid: string, period: string, saysTransferred: boolean): Promise<{ category: PcaCategory; monthsDrawn: number }> {
  const [startDay] = halfYearRange(period);
  const start = new Date(`${startDay}T00:00:00Z`);
  const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 6, 1));
  const key = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  let rows: any[] = [];
  try {
    rows = (await db.execute(sql`
      SELECT yr_no, mth_no, MAX(COALESCE(pat_care, 0)) AS pca, MAX(deptt) AS deptt
      FROM paybill_history
      WHERE TRIM(ecode) = ${epid} AND sal_code = 1
        AND (yr_no * 12 + mth_no - 1) >= ${key(from)} AND (yr_no * 12 + mth_no - 1) < ${key(start)}
      GROUP BY yr_no, mth_no`)).rows as any[];
  } catch (error) {
    console.warn("[ClaimForms] paybill history not read for PCA:", (error as any)?.message || error);
  }
  if (!rows.length) return { category: saysTransferred ? "transfer" : "unknown", monthsDrawn: 0 };
  const monthsDrawn = rows.filter((r) => Number(r.pca) > 0).length;
  const departments = new Set(rows.map((r) => clean(r.deptt)).filter(Boolean));
  if (saysTransferred || departments.size > 1) return { category: "transfer", monthsDrawn };
  return { category: monthsDrawn > 0 ? "continuing" : "new", monthsDrawn };
}

// ── Children Education Allowance: children, schools, CEA already paid ─────────

const SCHOOL_NOT_RECOGNISED = "As per the Directorate of School Education (DSE), this school is not recognised. Please contact the school or the DSE.";

/** Sons and daughters of the employee in the payroll's family details */
async function familyChildren(epid: string): Promise<FamilyChild[]> {
  const rows = (await db.execute(sql`
    SELECT name, dob::text AS dob, relation FROM payroll_children
    WHERE epid = ${epid} AND relation IN ('S', 'D') ORDER BY dob, name`)).rows as any[];
  return rows.filter((r) => r.dob).map((r) => ({
    key: `${r.dob}|${clean(r.name).toUpperCase()}`, name: clean(r.name), dob: String(r.dob), relation: r.relation,
  }));
}

/** CEA already paid through the payroll (and claims filled here), by child (date of birth) */
async function ceaHistory(epid: string, employeeId: number, exceptClaimId = 0) {
  const paid = (await db.execute(sql`
    SELECT dob::text AS dob, session, class_name FROM cea_paid WHERE epid = ${epid} AND dob IS NOT NULL`)).rows as any[];
  const filed = (await db.execute(sql`
    SELECT data, ref_no FROM claim_forms
    WHERE employee_id = ${employeeId} AND form_type = 'cea' AND id <> ${exceptClaimId}
      AND status NOT IN ('rejected', 'cancelled')`)).rows as any[];
  const items: Array<{ dob: string; session: string; className: string; source: string }> = paid.map((p) => ({
    dob: String(p.dob), session: clean(p.session), className: clean(p.class_name), source: "payroll",
  }));
  for (const f of filed) {
    const d = typeof f.data === "string" ? JSON.parse(f.data) : f.data;
    for (const c of d?.children || []) items.push({ dob: c.dob, session: d.session, className: c.className, source: f.ref_no });
  }
  return items;
}

/** The session just before "2025-2026" */
const previousSession = (s: string) => `${Number(s.slice(0, 4)) - 1}-${Number(s.slice(0, 4))}`;

async function checkCea(data: Record<string, any>, e: EmployeeRow, exceptClaimId: number): Promise<Checked> {
  const session = String(data.session);
  if (!ceaClaimableSessions(todayIst()).includes(session)) return { error: "This session cannot be claimed here. Please contact the Salary Section." };
  if (data.spouseEmployment !== "none" && !clean(data.spouseDetails)) {
    return { error: "Please give the designation and office of your spouse." };
  }
  const family = await familyChildren(e.epid);
  if (!family.length) {
    return { error: "The names of your children are not in your service book record. Please first get them entered in the Service Book and inform the Salary Section, so that they can be verified.", status: 403 };
  }
  const eligible = ceaEligibleChildren(family);
  const keys = data.children.map((c: any) => c.childKey);
  if (new Set(keys).size !== keys.length) return { error: "A child is listed twice." };

  const rates = await ceaRates();
  const history = await ceaHistory(e.epid, Number(e.id), exceptClaimId);
  const children: CeaChild[] = [];
  for (const input of data.children) {
    const child = family.find((c) => c.key === input.childKey);
    if (!child) return { error: "One of the children is not in your service book record. Please contact the Salary Section." };
    if (!eligible.some((c) => c.key === child.key)) {
      return { error: `${child.name} is not one of your two eldest children (or twins of the second birth), so CEA cannot be claimed for this child.` };
    }
    const school = (await db.execute(sql`
      SELECT name, place, location, status, is_active FROM cea_schools WHERE id = ${input.schoolId}`)).rows[0] as any;
    if (!school || !school.is_active) return { error: `Please choose the school of ${child.name} from the list.` };
    if (school.status !== "recognised") return { error: `${clean(school.name)}: ${SCHOOL_NOT_RECOGNISED}` };
    if (input.disabled && (!clean(input.disabilityNature) || !input.disabilityCertDate || !(Number(input.disabilityPercent) > 0))) {
      return { error: `For ${child.name}, please give the nature of the disability, the date of the certificate and the percentage.` };
    }
    if (input.hostel && !(Number(input.hostelDistanceKm) > 0)) {
      return { error: `For ${child.name}, please give the distance of the hostel from your residence.` };
    }
    const already = history.find((h) => h.dob === child.dob && h.session === session);
    if (already) {
      return { error: `CEA for ${child.name} for the session ${session} has already been ${already.source === "payroll" ? "paid" : `claimed (${already.source})`}.` };
    }
    const before = history.find((h) => h.dob === child.dob && h.session === previousSession(session));
    const repeatsClass = !!before && !!before.className && before.className === input.className;
    if (repeatsClass && !input.repeatReason) {
      return { error: `${child.name} was in class ${input.className} in the session before too. Please choose the reason (failed, or failed and changed school) and upload the marksheet.` };
    }
    const worked = ceaChildAmounts(session, rates, { hostel: !!input.hostel, disabled: !!input.disabled });
    if (worked.missing.length) {
      return { error: `The CEA rate for the session ${session} has not been entered yet. Please contact the Salary Section.` };
    }
    children.push({
      ...input,
      repeatReason: repeatsClass ? input.repeatReason : (input.repeatReason || ""),
      name: child.name, dob: child.dob, relation: child.relation,
      schoolName: clean(school.place) ? `${clean(school.name)}, ${clean(school.place)}` : clean(school.name),
      schoolLocation: school.location,
      repeatsClass, cea: worked.cea, hostelAmount: worked.hostel, amount: worked.cea + worked.hostel,
    });
  }
  const total = children.reduce((s, c) => s + c.amount, 0);
  const received = Number(data.amountAlreadyReceived) || 0;
  return {
    data: {
      session, spouseEmployment: data.spouseEmployment, spouseName: clean(data.spouseName), spouseDetails: clean(data.spouseDetails),
      amountAlreadyReceived: received, children, total, payable: Math.max(0, total - received),
      approval: ceaApprovalFor(session, todayIst()), declared: true,
    },
    periodKey: `s:${session}`, periodLabel: `Session ${session}`,
  };
}

/** Uploads a CEA claim needs before it can be submitted, and which of them are missing */
function ceaUploadsMissing(claim: ClaimForm): string[] {
  const have = new Set((claim.files || []).filter((f) => f.isCurrent && Number(f.revision) === claim.revision).map((f) => f.kind));
  const missing: string[] = [];
  (claim.data.children || []).forEach((c: any, i: number) => {
    if (!have.has(`school_certificate_${i}`)) missing.push(`the certificate of the school (Annexure B) for ${c.name}`);
    if (c.repeatReason && !have.has(`marksheet_${i}`)) missing.push(`the marksheet of ${c.name}`);
  });
  return missing;
}

type Checked = { data?: Record<string, any>; periodKey?: string; periodLabel?: string; error?: string; status?: number };

/**
 * Checks the filled data of a form against the rules of that form. Returns the clean
 * data (amounts are always worked out here, never taken from the browser) and what
 * the claim is for (its period), or an error message.
 */
async function checkData(formType: ClaimFormType, raw: unknown, e: EmployeeRow, exceptClaimId = 0): Promise<Checked> {
  const parsed = CLAIM_DATA_SCHEMAS[formType].safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Please fill the form completely" };
  const data = parsed.data as Record<string, any>;
  if (formType === "cea") return checkCea(data, e, exceptClaimId);
  const joined = [realDate(e.payroll_joining_date), realDate(e.joining_date)].filter(Boolean).sort()[0] as string | undefined;

  if (formType === "conveyance") {
    if (!conveyanceEligible(e)) return { error: NOT_ELIGIBLE, status: 403 };
    const quarter = String(data.quarter);
    if (!claimableQuarters(todayIst(), 6).includes(quarter)) {
      return { error: "This quarter cannot be claimed here: it is either not over yet or too old." };
    }
    const months = quarterMonths(quarter);
    if (data.months.some((m: any, i: number) => m.month !== months[i])) return { error: "The months do not belong to the chosen quarter." };
    const worked = conveyanceAmounts(data.months, await conveyanceRates(), data.vehicleType);
    if (worked.eligibleMonths === 0) {
      return { error: "No month of this quarter qualifies (more than twenty visits are needed in a month, with no vacation and not more than 15 days of leave)." };
    }
    const counted = worked.months.filter((m) => m.amount > 0).map((m) => m.month);
    const early = joined ? counted.find((m) => m < joined.slice(0, 7)) : undefined;
    if (early) return { error: `${monthLabel(early)} is before your date of joining and cannot be claimed.` };
    const paid = await conveyancePaidMonths(e.epid, counted);
    if (paid.length) {
      return { error: `Conveyance allowance for ${paid.map(monthLabel).join(", ")} has already been paid. If this is not correct, please contact the Salary Section.` };
    }
    return {
      data: {
        quarter, address: data.address, vehicleType: data.vehicleType,
        vehicleRegNo: String(data.vehicleRegNo).toUpperCase().replace(/\s+/g, " "),
        months: worked.months, eligibleMonths: worked.eligibleMonths,
        amount: worked.amount, da: worked.da, payable: worked.payable, declared: true,
      },
      periodKey: `q:${quarter}`, periodLabel: quarterLabel(quarter),
    };
  }

  if (formType === "pca") {
    const blocked = await pcaBlocked(e);
    if (blocked) return { error: blocked, status: 403 };
    const period = String(data.period);
    if (!claimableHalfYears(todayIst()).includes(period)) return { error: "This period cannot be claimed now." };
    const [, periodEnd] = halfYearRange(period);
    const joining = String(data.joiningDate);
    if (Number.isNaN(Date.parse(joining)) || joining > periodEnd) return { error: "The date of joining cannot be after the period claimed." };
    if (joined && joining < joined) return { error: "The date of joining here cannot be before your date of joining the University." };
    const transferFrom = clean(data.transferFrom);
    const transferDate = clean(data.transferDate);
    if (!!transferFrom !== !!transferDate) return { error: "For a transfer, enter both the previous department / office and the date." };
    if (transferDate && transferDate > todayIst()) return { error: "The date of transfer cannot be in the future." };
    const standing = await pcaCategory(e.epid, period, !!transferFrom);
    return {
      data: {
        period, confirmation: data.confirmation, joiningDate: joining, joiningSession: data.joiningSession,
        transferFrom, transferDate, category: standing.category, monthsDrawn: standing.monthsDrawn, declared: true,
      },
      periodKey: `h:${period}`, periodLabel: halfYearLabel(period),
    };
  }

  // NPA / HRA: once for each appointment
  const wef = String(data.wefDate);
  if (Number.isNaN(Date.parse(wef))) return { error: "Please choose a valid date" };
  // "With effect from" cannot be before the employee joined, nor far in the future
  if (joined && wef < joined) return { error: "The date \"With Effect From\" cannot be before your date of joining." };
  const limit = new Date(Date.now() + 62 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (wef > limit) return { error: "The date \"With Effect From\" is too far in the future." };
  return { data, periodKey: appointmentKey(e.designation), periodLabel: clean(e.designation) };
}

// ── AI check of the signed scan (same OCR service as the signed attendance report) ──

type AiCheck = {
  configured: boolean; checkedAt: string; qualityOk: boolean | null; refFound: boolean | null; otherRef: string | null;
  dispatchNoFound: boolean | null; dispatchDateFound: boolean | null; message: string | null;
};

async function aiCheckSignedForm(file: Express.Multer.File, claim: ClaimForm): Promise<AiCheck> {
  const result: AiCheck = {
    configured: false, checkedAt: new Date().toISOString(), qualityOk: null, refFound: null, otherRef: null,
    dispatchNoFound: null, dispatchDateFound: null, message: null,
  };
  const url = process.env.OCR_API_URL;
  const token = process.env.OCR_API_TOKEN;
  if (!url || !token || token === "CHANGE_ME") return result;
  result.configured = true;
  try {
    const form = new FormData();
    form.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "claim.pdf");
    const upstream = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form as any });
    if (!upstream.ok) {
      result.message = "The checking service did not answer. The scan was not checked.";
      return result;
    }
    const data: any = await upstream.json();
    const message = String(data.message || "").toLowerCase();
    // The service was trained on attendance reports and calls other papers a "wrong document":
    // that is not a quality problem. Only real image problems count here.
    const imageProblem = /blurr|dark|blank|low resolution|landscape|unreadable/.test(message);
    result.qualityOk = !(data.quality_acceptable === false && imageProblem);
    result.dispatchNoFound = data.dispatch_number_found ?? null;
    result.dispatchDateFound = data.dispatch_date_found ?? null;

    // Is this the print of THIS claim (and of its latest revision)? O/0 and I/1 are often mixed up by OCR.
    const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
    const textRead = squash(`${data.region_ocr_text || ""} ${data.text || ""} ${data.transaction_id_extracted || ""}`);
    if (textRead.length > 20) {
      const wanted = [squash(claimPrintRef(claim.refNo, claim.revision)), squash(claimPrintCode(claim.refNo, claim.revision))];
      result.refFound = wanted.some((w) => textRead.includes(w));
      if (!result.refFound) {
        const other = new RegExp(`${squash(CLAIM_FORM_DEFS[claim.formType].code)}20\\d{2}\\d{6}R\\d+`).exec(textRead);
        result.otherRef = other ? other[0] : null;
      }
    }
    result.message = imageProblem ? String(data.message || "The scan is not clear.") : null;
  } catch (error: any) {
    console.error("[ClaimForms] AI check failed:", error?.message || error);
    result.message = "The checking service could not be reached. The scan was not checked.";
  }
  return result;
}

// ── Uploads ──────────────────────────────────────────────────────────────────

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)),
});

/** The file really is a PDF / JPEG / PNG (first bytes), whatever its name says */
function realFileType(buffer: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (buffer.length < 8) return null;
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

async function saveClaimFile(claim: ClaimForm, kind: string, file: Express.Multer.File, uploadedBy: string): Promise<string> {
  const mimetype = realFileType(file.buffer);
  if (!mimetype) throw Object.assign(new Error("Only PDF, JPG or PNG files can be uploaded."), { status: 400 });
  await fs.promises.mkdir(CLAIM_UPLOAD_DIR, { recursive: true });
  const name = safeUploadName(`${claim.formType}-${kind}-${claim.id}`, { mimetype, originalname: "" });
  await fs.promises.writeFile(path.join(CLAIM_UPLOAD_DIR, name), file.buffer);
  const fileUrl = `/uploads/claims/${name}`;
  await db.execute(sql`UPDATE claim_form_files SET is_current = false WHERE claim_id = ${claim.id} AND kind = ${kind}`);
  await db.execute(sql`
    INSERT INTO claim_form_files (claim_id, kind, file_url, revision, uploaded_by)
    VALUES (${claim.id}, ${kind}, ${fileUrl}, ${claim.revision}, ${uploadedBy})`);
  return fileUrl;
}

function sendPdf(res: Response, claim: ClaimForm, bytes: Uint8Array) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${claim.refNo.replace(/[^A-Za-z0-9]+/g, "-")}-R${claim.revision}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(Buffer.from(bytes));
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, _next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error: any) {
    if (error?.status && error.status < 500) return res.status(error.status).json({ message: error.message });
    console.error("[ClaimForms]", req.method, req.path, error);
    if (!res.headersSent) res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerClaimFormRoutes(app: Express) {
  // ═══ Employee (no login) ═══════════════════════════════════════════════════
  app.use("/api/public/forms/identify",
    rateLimit({ windowMs: 15 * 60_000, max: 20, message: "Too many attempts from this network. Please wait 15 minutes." }));
  app.use("/api/public/forms/track", rateLimit({ windowMs: 15 * 60_000, max: 30 }));
  app.use("/api/public/forms", rateLimit({ windowMs: 60_000, max: 120 }));

  // Everything public is closed while the forms are switched off
  app.use("/api/public/forms", async (req, res, next) => {
    try {
      if (req.path === "/config" || (await claimFormsEnabled())) return next();
      res.status(403).json({ message: "Online forms are not open at present.", code: "FORMS_CLOSED" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/forms/config", wrap(async (_req, res) => {
    res.json({
      enabled: await claimFormsEnabled(),
      forms: CLAIM_FORM_TYPES.map((t) => {
        const d = CLAIM_FORM_DEFS[t];
        return { type: d.type, title: d.title, shortTitle: d.shortTitle, description: d.description, needsUndertaking: d.needsUndertaking };
      }),
    });
  }));

  // Permanent ID + date of joining (or, where no date of joining is on record, the
  // last four digits of the salary account). The answer never says which part was wrong.
  app.post("/api/public/forms/identify", wrap(async (req, res) => {
    const epid = clean(req.body?.epid);
    const joiningDate = clean(req.body?.joiningDate);
    const accountLast4 = clean(req.body?.accountLast4).replace(/\D/g, "");
    if (!/^\d{5}$/.test(epid)) return res.status(400).json({ message: "Permanent ID Number must be 5 digits." });
    if (!isIsoDate(joiningDate) && accountLast4.length !== 4) {
      return res.status(400).json({ message: "Please enter your date of joining." });
    }
    if (!(await captchaOk(req.body?.turnstileToken, clientIp(req)))) {
      return res.status(400).json({ message: "Security check failed. Please try again." });
    }
    const key = tryKey(epid, req);
    const minutes = await lockedMinutes(key);
    if (minutes > 0) return res.status(429).json({ message: `Too many wrong attempts. Please try again after ${minutes} minutes.` });

    const row = (await db.execute(sql`${EMPLOYEE_SELECT} WHERE e.epid = ${epid} AND e.is_active = 'active' ORDER BY e.id LIMIT 1`)).rows[0] as any as EmployeeRow | undefined;
    let ok = false;
    if (row) {
      const dates = [realDate(row.payroll_joining_date), realDate(row.joining_date)].filter(Boolean);
      if (dates.length) {
        ok = isIsoDate(joiningDate) && dates.includes(joiningDate);
      } else {
        // no date of joining on record: last four digits of the salary account
        const account = clean(row.bank_account).replace(/\D/g, "");
        ok = accountLast4.length === 4 && account.length >= 4 && account.slice(-4) === accountLast4;
      }
    }
    if (!row || !ok) {
      await wrongTry(key);
      return res.status(401).json({ message: "These details do not match our records. Please check and try again, or contact your Department." });
    }
    await clearTries(key);
    if (separateCheque(row)) return res.status(403).json({ message: NOT_ELIGIBLE, code: "NOT_ELIGIBLE" });

    await regenerateKeeping(req);
    req.session.claimEmployeeId = Number(row.id);
    req.session.claimAt = Date.now();
    await saveSession(req);
    res.json({ employee: employeeSummary(row), claims: await claimsOfEmployee(Number(row.id)) });
  }));

  app.get("/api/public/forms/me", wrap(async (req, res) => {
    const e = await claimant(req);
    if (!e) return res.status(401).json({ message: "Please enter your details again.", code: "CLAIMANT_REQUIRED" });
    res.json({ employee: employeeSummary(e), claims: await claimsOfEmployee(Number(e.id)) });
  }));

  app.post("/api/public/forms/logout", wrap(async (req, res) => {
    delete req.session.claimEmployeeId;
    delete req.session.claimAt;
    await saveSession(req);
    res.json({ ok: true });
  }));

  // Status by reference number (no session): only the status, nothing personal
  app.post("/api/public/forms/track", wrap(async (req, res) => {
    const refNo = clean(req.body?.refNo).toUpperCase().replace(/\/R\d+$/, "");
    const epid = clean(req.body?.epid);
    const r = await db.execute(sql`
      SELECT form_type, status, ${utc("updated_at")} AS updated_at FROM claim_forms WHERE UPPER(ref_no) = ${refNo} AND epid = ${epid}`);
    const row = r.rows[0] as any;
    if (!row) return res.status(404).json({ message: "No form found with this reference number and Permanent ID." });
    const status = row.status as ClaimStatus;
    res.json({
      refNo, form: CLAIM_FORM_DEFS[row.form_type as ClaimFormType]?.title || row.form_type,
      status, statusLabel: CLAIM_STATUS_LABELS[status], help: CLAIM_STATUS_HELP[status], updatedAt: row.updated_at,
    });
  }));

  // What the Conveyance Allowance Bill needs to know: entitled or not, the quarters that
  // can be claimed (and which are already claimed or paid), the rate, last used details.
  app.get("/api/public/forms/conveyance", wrap(async (req, res) => {
    const e = await claimant(req);
    if (!e) return res.status(401).json({ message: "Please enter your details again.", code: "CLAIMANT_REQUIRED" });
    if (!conveyanceEligible(e)) return res.json({ eligible: false, message: NOT_ELIGIBLE });
    const quarters = claimableQuarters(todayIst(), 6);
    const mine = (await db.execute(sql`
      SELECT period_key, ref_no, status, data FROM claim_forms
      WHERE employee_id = ${e.id} AND form_type = 'conveyance' ORDER BY id DESC`)).rows as any[];
    const live = mine.filter((c) => !["rejected", "cancelled"].includes(c.status));
    const paid = await conveyancePaidMonths(e.epid, quarters.flatMap(quarterMonths));
    const last = mine[0] ? (typeof mine[0].data === "string" ? JSON.parse(mine[0].data) : mine[0].data) : null;
    res.json({
      eligible: true,
      rates: await conveyanceRates(),
      vacationStaff: !!clean(e.vacation_code) && !["N", "NO", "0"].includes(clean(e.vacation_code).toUpperCase()),
      quarters: quarters.map((q) => ({
        start: q, label: quarterLabel(q), months: quarterMonths(q),
        claimedRef: live.find((c) => c.period_key === `q:${q}`)?.ref_no || null,
        paidMonths: quarterMonths(q).filter((m) => paid.includes(m)),
      })),
      last: last ? { address: last.address, vehicleType: last.vehicleType, vehicleRegNo: last.vehicleRegNo } : null,
    });
  }));

  // What the PCA claim form needs to know: may this employee claim, for which periods,
  // and what is already on record (date of confirmation, last entered date of joining).
  app.get("/api/public/forms/pca", wrap(async (req, res) => {
    const e = await claimant(req);
    if (!e) return res.status(401).json({ message: "Please enter your details again.", code: "CLAIMANT_REQUIRED" });
    const blocked = await pcaBlocked(e);
    if (blocked) return res.json({ eligible: false, message: blocked });
    const mine = (await db.execute(sql`
      SELECT period_key, ref_no, status, data FROM claim_forms
      WHERE employee_id = ${e.id} AND form_type = 'pca' ORDER BY id DESC`)).rows as any[];
    const live = mine.filter((c) => !["rejected", "cancelled"].includes(c.status));
    const last = mine[0] ? (typeof mine[0].data === "string" ? JSON.parse(mine[0].data) : mine[0].data) : null;
    res.json({
      eligible: true,
      periods: claimableHalfYears(todayIst()).map((p) => ({
        key: p, label: halfYearLabel(p), claimedRef: live.find((c) => c.period_key === `h:${p}`)?.ref_no || null,
      })),
      confirmation: last?.confirmation || (realDate(e.payroll_confirm_date) ? formatClaimDate(e.payroll_confirm_date) : ""),
      employmentStatus: clean(e.employment_status),
      last: last ? { joiningDate: last.joiningDate, joiningSession: last.joiningSession } : null,
    });
  }));

  // What the CEA form needs: the children (and which can be claimed for), sessions,
  // schools, whether rates are entered, spouse details on record.
  app.get("/api/public/forms/cea", wrap(async (req, res) => {
    const e = await claimant(req);
    if (!e) return res.status(401).json({ message: "Please enter your details again.", code: "CLAIMANT_REQUIRED" });
    const family = await familyChildren(e.epid);
    if (!family.length) {
      return res.json({
        eligible: false,
        message: "The names of your children are not in your service book record. Please first get them entered in the Service Book and inform the Salary Section, so that they can be verified.",
      });
    }
    const eligible = ceaEligibleChildren(family);
    const today = todayIst();
    const rates = await ceaRates();
    const mine = (await db.execute(sql`
      SELECT period_key, ref_no FROM claim_forms
      WHERE employee_id = ${e.id} AND form_type = 'cea' AND status NOT IN ('rejected', 'cancelled')`)).rows as any[];
    const history = await ceaHistory(e.epid, Number(e.id));
    const schools = (await db.execute(sql`
      SELECT id, name, place, location, status FROM cea_schools WHERE is_active = true ORDER BY LOWER(name)`)).rows as any[];
    const spouse = (await db.execute(sql`SELECT name, designation, organisation FROM payroll_spouse WHERE epid = ${e.epid}`)).rows[0] as any;
    res.json({
      eligible: true,
      children: family.map((c) => ({
        ...c, eligible: eligible.some((x) => x.key === c.key),
        history: history.filter((h) => h.dob === c.dob).map((h) => ({ session: h.session, className: h.className })),
      })),
      sessions: ceaClaimableSessions(today).map((s) => {
        const [from, to] = sessionRange(s);
        return {
          session: s,
          claimedRef: mine.find((m) => m.period_key === `s:${s}`)?.ref_no || null,
          approval: CEA_APPROVALS[ceaApprovalFor(s, today)],
          ratesEntered: ceaChildAmounts(s, rates, { hostel: false, disabled: false }).missing.length === 0,
          from, to,
        };
      }),
      schools: schools.map((s) => ({
        id: Number(s.id), name: clean(s.place) ? `${s.name}, ${s.place}` : s.name, location: s.location,
        recognised: s.status === "recognised",
      })),
      notRecognisedMessage: SCHOOL_NOT_RECOGNISED,
      spouse: spouse ? { name: spouse.name || "", details: [spouse.designation, spouse.organisation].filter(Boolean).join(", ") } : null,
    });
  }));

  /** The claimant's own claim (404 for anyone else's) */
  const ownClaim = async (req: Request, res: Response): Promise<{ e: EmployeeRow; claim: ClaimForm } | null> => {
    const e = await claimant(req);
    if (!e) { res.status(401).json({ message: "Please enter your details again.", code: "CLAIMANT_REQUIRED" }); return null; }
    const claim = await getClaim(Number(req.params.id));
    if (!claim || claim.employeeId !== Number(e.id)) { res.status(404).json({ message: "Form not found." }); return null; }
    return { e, claim };
  };
  const employeeActor = (e: EmployeeRow): Actor => ({ type: "employee", name: `${e.name} (${e.epid})` });

  // Start a form (kept as a draft until it is submitted)
  app.post("/api/public/forms/claims", wrap(async (req, res) => {
    const e = await claimant(req);
    if (!e) return res.status(401).json({ message: "Please enter your details again.", code: "CLAIMANT_REQUIRED" });
    const formType = req.body?.formType;
    if (!isClaimFormType(formType)) return res.status(400).json({ message: "Unknown form." });
    if (separateCheque(e)) return res.status(403).json({ message: NOT_ELIGIBLE, code: "NOT_ELIGIBLE" });
    const checked = await checkData(formType, req.body?.data, e);
    if (checked.error) return res.status(checked.status || 400).json({ message: checked.error, code: checked.status === 403 ? "NOT_ELIGIBLE" : undefined });

    const def = CLAIM_FORM_DEFS[formType];
    const dept = certifyingDepartment(e);
    const periodKey = checked.periodKey!;
    const already = formType === "conveyance"
      ? `You have already filled the Conveyance Allowance Bill for ${checked.periodLabel}.`
      : formType === "pca"
      ? `You have already filled the PCA claim form for ${checked.periodLabel}.`
      : formType === "cea"
      ? `You have already filled the CEA claim for the session ${String(checked.data?.session || "")}. Add all children to that one form.`
      : `You have already filled the ${def.shortTitle} form for your present appointment (${e.designation}). A new form is needed only on a fresh appointment.`;
    const existing = (await db.execute(sql`
      SELECT ref_no, status FROM claim_forms
      WHERE employee_id = ${e.id} AND form_type = ${formType} AND period_key = ${periodKey}
        AND status NOT IN ('rejected', 'cancelled') LIMIT 1`)).rows[0] as any;
    if (existing) {
      return res.status(409).json({ message: `${already} Reference: ${existing.ref_no}.` });
    }
    let id: number;
    try {
      const ins = await db.execute(sql`
        INSERT INTO claim_forms (form_type, employee_id, epid, department_id, period_key, period_label, status, data, snapshot)
        VALUES (${formType}, ${e.id}, ${e.epid}, ${dept.id}, ${periodKey}, ${checked.periodLabel || null}, 'draft',
                ${JSON.stringify(checked.data)}::jsonb, ${JSON.stringify(snapshotOf(e))}::jsonb)
        RETURNING id`);
      id = Number((ins.rows[0] as any).id);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: already });
      throw error;
    }
    const refNo = `${def.code}/${new Date().getFullYear()}/${String(id).padStart(6, "0")}`;
    await db.execute(sql`UPDATE claim_forms SET ref_no = ${refNo} WHERE id = ${id}`);
    await logEvent(req, id, "created", null, "draft", employeeActor(e));
    res.status(201).json(forEmployee(await withDetail((await getClaim(id))!)));
  }));

  // Change a draft (or a form returned for correction). A change makes a new revision:
  // papers printed or signed before it no longer belong to the form.
  app.put("/api/public/forms/claims/:id", wrap(async (req, res) => {
    const own = await ownClaim(req, res);
    if (!own) return;
    const { e, claim } = own;
    if (!EMPLOYEE_EDITABLE.includes(claim.status)) return res.status(409).json({ message: "This form can no longer be changed." });
    const checked = await checkData(claim.formType, req.body?.data, e, claim.id);
    if (checked.error) return res.status(checked.status || 400).json({ message: checked.error });
    // what the claim is for (the quarter) stays as it is: another quarter is another form
    if (claim.formType === "conveyance" && checked.periodKey !== claim.periodKey) {
      return res.status(400).json({ message: "The quarter of a bill cannot be changed. Please fill a new bill for the other quarter." });
    }
    if (claim.formType === "cea" && checked.periodKey !== claim.periodKey) {
      return res.status(400).json({ message: "The session of a claim cannot be changed. Please fill a new form for the other session." });
    }
    if (claim.formType === "pca" && checked.periodKey !== claim.periodKey) {
      return res.status(400).json({ message: "The period of a claim cannot be changed. Please fill a new form for the other period." });
    }
    if (JSON.stringify(checked.data) === JSON.stringify(claim.data)) return res.json(forEmployee(await withDetail(claim)));
    const r = await db.execute(sql`
      UPDATE claim_forms SET data = ${JSON.stringify(checked.data)}::jsonb, revision = revision + 1, updated_at = NOW()
      WHERE id = ${claim.id} AND status IN ('draft', 'returned_employee') RETURNING id`);
    if (!r.rows.length) return res.status(409).json({ message: "This form can no longer be changed." });
    await db.execute(sql`UPDATE claim_form_files SET is_current = false WHERE claim_id = ${claim.id}`);
    await logEvent(req, claim.id, "edited", claim.status, claim.status, employeeActor(e), `Revision ${claim.revision + 1}`);
    res.json(forEmployee(await withDetail((await getClaim(claim.id))!)));
  }));

  app.get("/api/public/forms/claims/:id/pdf", wrap(async (req, res) => {
    const own = await ownClaim(req, res);
    if (!own) return;
    if (own.claim.status === "cancelled") return res.status(409).json({ message: "This form was cancelled." });
    sendPdf(res, own.claim, await buildClaimPdf(own.claim));
  }));

  // CEA uploads: the school's certificate (Annexure B) of each child, and the marksheet
  // of a child who repeats a class. ?kind=school_certificate_0 / marksheet_1 …
  app.post("/api/public/forms/claims/:id/files", memoryUpload.single("file"), wrap(async (req, res) => {
    const own = await ownClaim(req, res);
    if (!own) return;
    const { e, claim } = own;
    if (claim.formType !== "cea") return res.status(400).json({ message: "This form has no such upload." });
    if (!EMPLOYEE_EDITABLE.includes(claim.status)) return res.status(409).json({ message: "This form can no longer be changed." });
    const kind = clean(req.query.kind);
    const m = /^(school_certificate|marksheet)_(\d)$/.exec(kind);
    const child = m ? (claim.data.children || [])[Number(m[2])] : null;
    if (!m || !child) return res.status(400).json({ message: "Unknown upload." });
    if (m[1] === "marksheet" && !child.repeatReason) return res.status(400).json({ message: "A marksheet is needed only for a child who repeats a class." });
    if (!req.file) return res.status(400).json({ message: "Please choose the file (PDF, JPG or PNG, up to 10 MB)." });
    await saveClaimFile(claim, kind, req.file, employeeActor(e).name);
    await logEvent(req, claim.id, m[1] === "marksheet" ? "marksheet_uploaded" : "school_certificate_uploaded", claim.status, claim.status,
      employeeActor(e), child.name);
    res.json(forEmployee(await withDetail((await getClaim(claim.id))!)));
  }));

  // Signed undertaking (NPA): needed before the form can be submitted
  app.post("/api/public/forms/claims/:id/undertaking", memoryUpload.single("file"), wrap(async (req, res) => {
    const own = await ownClaim(req, res);
    if (!own) return;
    const { e, claim } = own;
    if (!CLAIM_FORM_DEFS[claim.formType].needsUndertaking) return res.status(400).json({ message: "This form has no undertaking." });
    if (!EMPLOYEE_EDITABLE.includes(claim.status)) return res.status(409).json({ message: "This form can no longer be changed." });
    if (!req.file) return res.status(400).json({ message: "Please choose the signed undertaking (PDF, JPG or PNG, up to 10 MB)." });
    await saveClaimFile(claim, "undertaking", req.file, employeeActor(e).name);
    await logEvent(req, claim.id, "undertaking_uploaded", claim.status, claim.status, employeeActor(e));
    res.json(forEmployee(await withDetail((await getClaim(claim.id))!)));
  }));

  app.post("/api/public/forms/claims/:id/submit", wrap(async (req, res) => {
    const own = await ownClaim(req, res);
    if (!own) return;
    const { e, claim } = own;
    if (!EMPLOYEE_EDITABLE.includes(claim.status)) return res.status(409).json({ message: "This form has already been submitted." });
    const def = CLAIM_FORM_DEFS[claim.formType];
    if (def.needsSchoolCertificate) {
      const missing = ceaUploadsMissing(await withDetail(claim));
      if (missing.length) return res.status(400).json({ message: `Please upload ${missing.join(" and ")} before submitting.` });
    }
    if (def.needsUndertaking && !(await withDetail(claim)).hasUndertaking) {
      return res.status(400).json({ message: "Please upload the undertaking signed by you and counter-signed by the Chairman before submitting." });
    }
    const moved = await move(claim.id, EMPLOYEE_EDITABLE, "submitted", [sql`submitted_at = NOW()`, sql`return_reason = NULL`, sql`returned_by = NULL`]);
    if (!moved) return res.status(409).json({ message: "This form has already been submitted." });
    await logEvent(req, claim.id, "submitted", claim.status, "submitted", employeeActor(e));
    await notify("claim.submitted", [{ kind: "department", departmentId: claim.departmentId }], {
      title: `${def.shortTitle} claim form submitted`,
      text: `${e.name} (${e.epid}) has submitted the ${def.shortTitle} claim form ${claim.refNo}. After the signed form is received, upload it with the dispatch number and date.`,
      link: "/dashboard/forms",
    });
    res.json(forEmployee(await withDetail(moved)));
  }));

  // Withdraw a form the Salary Section has not received yet
  app.post("/api/public/forms/claims/:id/cancel", wrap(async (req, res) => {
    const own = await ownClaim(req, res);
    if (!own) return;
    const moved = await move(own.claim.id, ["draft", "submitted", "returned_employee"], "cancelled");
    if (!moved) return res.status(409).json({ message: "This form has already been sent to the Salary Section and cannot be cancelled here." });
    await logEvent(req, own.claim.id, "cancelled", own.claim.status, "cancelled", employeeActor(own.e));
    res.json(forEmployee(await withDetail(moved)));
  }));

  // ═══ Department ════════════════════════════════════════════════════════════
  // The department id in the address is checked by the /api gate (own department only).

  const departmentActor = async (req: Request, departmentId: number): Promise<Actor> => {
    const admin = await sessionAdmin(req);
    if (admin) return { type: "admin", name: admin.name || admin.email };
    await sessionDepartmentId(req);
    const staff = sessionStaff(req);
    if (staff) return { type: "staff", name: staff.name };
    const d = (await db.execute(sql`SELECT name FROM departments WHERE id = ${departmentId}`)).rows[0] as any;
    return { type: "department", name: d?.name || `Department ${departmentId}` };
  };

  const departmentClaim = async (req: Request, res: Response): Promise<ClaimForm | null> => {
    const claim = await getClaim(Number(req.params.claimId));
    // drafts belong to the employee alone
    if (!claim || claim.departmentId !== Number(req.params.departmentId) || claim.status === "draft") {
      res.status(404).json({ message: "Form not found." });
      return null;
    }
    return claim;
  };

  // All forms of the department's employees (submitted and later): inbox and history
  app.get("/api/departments/:departmentId/claim-forms", wrap(async (req, res) => {
    const departmentId = Number(req.params.departmentId);
    const r = await db.execute(sql`
      SELECT ${CLAIM_COLUMNS} FROM claim_forms c
      WHERE c.department_id = ${departmentId} AND c.status <> 'draft'
      ORDER BY c.id DESC LIMIT 2000`);
    res.json(r.rows.map(toClaim));
  }));

  app.get("/api/departments/:departmentId/claim-forms/count", wrap(async (req, res) => {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM claim_forms
      WHERE department_id = ${Number(req.params.departmentId)} AND status IN ('submitted', 'returned_department')`);
    res.json({ pending: Number((r.rows[0] as any).n), enabled: await claimFormsEnabled() });
  }));

  app.get("/api/departments/:departmentId/claim-forms/:claimId", wrap(async (req, res) => {
    const claim = await departmentClaim(req, res);
    if (claim) res.json(await withDetail(claim));
  }));

  app.get("/api/departments/:departmentId/claim-forms/:claimId/pdf", wrap(async (req, res) => {
    const claim = await departmentClaim(req, res);
    if (claim) sendPdf(res, claim, await buildClaimPdf(claim));
  }));

  // Upload the signed form with the dispatch number and date → goes to the Salary Section
  app.post("/api/departments/:departmentId/claim-forms/:claimId/upload", memoryUpload.single("file"), wrap(async (req, res) => {
    const claim = await departmentClaim(req, res);
    if (!claim) return;
    if (!DEPARTMENT_ACTIONABLE.includes(claim.status)) return res.status(409).json({ message: "This form is not waiting for the signed copy." });
    const dispatchNo = clean(req.body?.dispatchNo).slice(0, 60);
    const dispatchDate = clean(req.body?.dispatchDate);
    if (!dispatchNo) return res.status(400).json({ message: "Please enter the dispatch number written on the form." });
    if (!isIsoDate(dispatchDate) || dispatchDate > todayIst()) return res.status(400).json({ message: "Please enter the dispatch date written on the form (not a future date)." });
    if (claim.submittedAt && dispatchDate < claim.submittedAt.slice(0, 10) && claim.status === "submitted") {
      // a form cannot have been dispatched before the employee submitted it (one day of slack for time zones)
      const dayBefore = new Date(Date.parse(claim.submittedAt) - 24 * 3600 * 1000).toISOString().slice(0, 10);
      if (dispatchDate < dayBefore) return res.status(400).json({ message: "The dispatch date is before the date on which the form was submitted." });
    }
    if (!req.file) return res.status(400).json({ message: "Please choose the scanned signed form (PDF, JPG or PNG, up to 10 MB)." });
    if (!realFileType(req.file.buffer)) return res.status(400).json({ message: "Only PDF, JPG or PNG files can be uploaded." });

    const ai = await aiCheckSignedForm(req.file, claim);
    if (ai.qualityOk === false) {
      return res.status(422).json({ message: ai.message || "The scan is not clear. Please scan the form again.", aiCheck: ai });
    }
    if (ai.otherRef) {
      return res.status(422).json({ message: "This scan seems to be of a different form (or an older print of this form). Please upload the latest signed print.", aiCheck: ai });
    }
    // The reference could not be read: the department must confirm it is the right paper
    if (ai.configured && ai.refFound === false && String(req.body?.confirm) !== "true") {
      return res.status(409).json({
        message: `The reference ${claimPrintRef(claim.refNo, claim.revision)} could not be read on the scan. If this is the correct signed form, confirm and upload again.`,
        code: "CONFIRM_NEEDED", aiCheck: ai,
      });
    }

    const actor = await departmentActor(req, claim.departmentId);
    const moved = await move(claim.id, DEPARTMENT_ACTIONABLE, "sent", [
      sql`sent_at = NOW()`, sql`dispatch_no = ${dispatchNo}`, sql`dispatch_date = ${dispatchDate}::date`,
      sql`ai_check = ${JSON.stringify(ai)}::jsonb`, sql`return_reason = NULL`, sql`returned_by = NULL`,
    ]);
    if (!moved) return res.status(409).json({ message: "This form is not waiting for the signed copy." });
    await saveClaimFile(claim, "signed_form", req.file, actor.name);
    await logEvent(req, claim.id, "signed_form_uploaded", claim.status, "sent", actor, `D. No. ${dispatchNo}, dated ${formatClaimDate(dispatchDate)}`);
    res.json(await withDetail(moved));
  }));

  // Something on the form itself is wrong: back to the employee for correction
  app.post("/api/departments/:departmentId/claim-forms/:claimId/return", wrap(async (req, res) => {
    const claim = await departmentClaim(req, res);
    if (!claim) return;
    const reason = clean(req.body?.reason).slice(0, 500);
    if (reason.length < 5) return res.status(400).json({ message: "Please write the reason for returning the form." });
    const actor = await departmentActor(req, claim.departmentId);
    const moved = await move(claim.id, DEPARTMENT_ACTIONABLE, "returned_employee", [sql`return_reason = ${reason}`, sql`returned_by = ${actor.name}`]);
    if (!moved) return res.status(409).json({ message: "This form cannot be returned now." });
    await logEvent(req, claim.id, "returned_to_employee", claim.status, "returned_employee", actor, reason);
    res.json(await withDetail(moved));
  }));

  // ═══ Salary Section (admin) ════════════════════════════════════════════════
  // /api/admin/* is admin-only in the /api gate; view-only admins cannot write there.

  const isSuper = (admin: any) => ["super", "super_admin", "superadmin"].includes(admin?.role) || admin?.email === "admin@amu.ac.in";
  /** A dealing assistant acts on the claims of their own employees; super admins on all */
  const mayDecide = (admin: any, dealingAssistant: string | null): boolean => {
    if (isSuper(admin)) return true;
    const code = clean(admin?.userCode).toUpperCase();
    return !!code && code !== "ALL" && code !== "VEW" && code === clean(dealingAssistant).toUpperCase();
  };

  const adminClaim = async (req: Request, res: Response, write: boolean): Promise<{ claim: ClaimForm; admin: any; dealingAssistant: string | null } | null> => {
    const admin = await sessionAdmin(req);
    const claim = await getClaim(Number(req.params.id));
    if (!claim || !ADMIN_VISIBLE.includes(claim.status)) { res.status(404).json({ message: "Form not found." }); return null; }
    const e = (await db.execute(sql`SELECT salary_asstt FROM employees WHERE id = ${claim.employeeId}`)).rows[0] as any;
    const dealingAssistant = clean(e?.salary_asstt).toUpperCase() || claim.snapshot.dealingAssistant || null;
    if (write && !mayDecide(admin, dealingAssistant)) {
      res.status(403).json({ message: "Only the dealing assistant of this employee (or a super admin) can do this." });
      return null;
    }
    return { claim, admin, dealingAssistant };
  };
  const adminActor = (admin: any): Actor => ({ type: "admin", name: admin?.name || admin?.email || "Admin" });

  app.get("/api/admin/claim-forms", wrap(async (_req, res) => {
    const r = await db.execute(sql`
      SELECT ${CLAIM_COLUMNS}, UPPER(TRIM(COALESCE(e.salary_asstt, ''))) AS "currentDealingAssistant", d.name AS "currentDepartmentName"
      FROM claim_forms c
      LEFT JOIN employees e ON e.id = c.employee_id
      LEFT JOIN departments d ON d.id = c.department_id
      WHERE c.status IN (${sql.join(ADMIN_VISIBLE.map((s) => sql`${s}`), sql`, `)})
      ORDER BY c.sent_at DESC NULLS LAST, c.id DESC LIMIT 5000`);
    res.json(r.rows.map((row: any) => ({ ...toClaim(row), currentDealingAssistant: row.currentDealingAssistant || null })));
  }));

  app.get("/api/admin/claim-forms/settings", wrap(async (_req, res) => {
    const counts = (await db.execute(sql`SELECT status, COUNT(*)::int AS n FROM claim_forms GROUP BY status`)).rows as any[];
    res.json({ enabled: await claimFormsEnabled(), counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
  }));

  // Open / close the forms for employees (super admin)
  app.post("/api/admin/claim-forms/settings", wrap(async (req, res) => {
    const admin = await sessionAdmin(req);
    if (!isSuper(admin)) return res.status(403).json({ message: "Only a super admin can open or close the forms." });
    const enabled = req.body?.enabled === true;
    await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES ('claim_forms_enabled', ${String(enabled)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    enabledCache = null;
    res.json({ enabled });
  }));

  // Rate of the conveyance allowance and the DA on it, each from a month onwards
  app.get("/api/admin/claim-forms/conveyance-rates", wrap(async (_req, res) => {
    res.json({ rates: await conveyanceRates() });
  }));
  app.post("/api/admin/claim-forms/conveyance-rates", wrap(async (req, res) => {
    const admin = await sessionAdmin(req);
    if (!isSuper(admin)) return res.status(403).json({ message: "Only a super admin can change the rates." });
    const list = Array.isArray(req.body?.rates) ? req.body.rates : [];
    const rates: ConveyanceRate[] = [];
    for (const x of list) {
      const from = clean(x?.from), amount = Number(x?.amount), twoWheeler = Number(x?.twoWheeler), daPercent = Number(x?.daPercent);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(from) || !(amount > 0 && amount < 1_000_000) || !(twoWheeler > 0 && twoWheeler < 1_000_000)
          || !(daPercent >= 0 && daPercent <= 1000)) {
        return res.status(400).json({ message: "Each rate needs a month, an amount and a DA percentage." });
      }
      rates.push({ from, amount: Math.round(amount), twoWheeler: Math.round(twoWheeler), daPercent });
    }
    if (!rates.length) return res.status(400).json({ message: "At least one rate is needed." });
    if (new Set(rates.map((r) => r.from)).size !== rates.length) return res.status(400).json({ message: "Two rates start in the same month." });
    rates.sort((a, b) => a.from.localeCompare(b.from));
    await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES ('conveyance_rates', ${JSON.stringify(rates)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    res.json({ rates });
  }));

  // Departments whose employees may claim PCA
  app.get("/api/admin/claim-forms/pca-departments", wrap(async (_req, res) => {
    const departments = (await db.execute(sql`SELECT id, name FROM departments ORDER BY name`)).rows as any[];
    res.json({ selected: await pcaDepartmentIds(), departments: departments.map((d) => ({ id: Number(d.id), name: d.name })) });
  }));
  app.post("/api/admin/claim-forms/pca-departments", wrap(async (req, res) => {
    const admin = await sessionAdmin(req);
    if (!isSuper(admin)) return res.status(403).json({ message: "Only a super admin can change the PCA departments." });
    const ids = Array.from(new Set((Array.isArray(req.body?.selected) ? req.body.selected : []).map(Number).filter(Number.isFinite)));
    await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES ('pca_departments', ${JSON.stringify(ids)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    res.json({ selected: ids });
  }));

  app.get("/api/admin/claim-forms/:id", wrap(async (req, res) => {
    const found = await adminClaim(req, res, false);
    if (!found) return;
    res.json({ ...(await withDetail(found.claim)), currentDealingAssistant: found.dealingAssistant, mayDecide: mayDecide(found.admin, found.dealingAssistant) });
  }));

  app.get("/api/admin/claim-forms/:id/pdf", wrap(async (req, res) => {
    const found = await adminClaim(req, res, false);
    if (found) sendPdf(res, found.claim, await buildClaimPdf(found.claim));
  }));

  // Objection: back to the department (which uploads again, or returns it to the employee)
  app.post("/api/admin/claim-forms/:id/return", wrap(async (req, res) => {
    const found = await adminClaim(req, res, true);
    if (!found) return;
    const reason = clean(req.body?.reason).slice(0, 500);
    if (reason.length < 5) return res.status(400).json({ message: "Please write the objection." });
    const actor = adminActor(found.admin);
    const moved = await move(found.claim.id, ["sent", "accepted"], "returned_department", [sql`return_reason = ${reason}`, sql`returned_by = ${actor.name}`]);
    if (!moved) return res.status(409).json({ message: "This form cannot be returned now." });
    await logEvent(req, moved.id, "returned_to_department", found.claim.status, "returned_department", actor, reason);
    const def = CLAIM_FORM_DEFS[moved.formType];
    await notify("claim.returned_department", [{ kind: "department", departmentId: moved.departmentId }], {
      title: `${def.shortTitle} claim form returned`,
      text: `The Salary Section has returned the ${def.shortTitle} claim form ${moved.refNo} of ${moved.snapshot.name} (${moved.epid}). Objection: ${reason}`,
      link: "/dashboard/forms",
    });
    res.json(await withDetail(moved));
  }));

  app.post("/api/admin/claim-forms/:id/accept", wrap(async (req, res) => {
    const found = await adminClaim(req, res, true);
    if (!found) return;
    const actor = adminActor(found.admin);
    const moved = await move(found.claim.id, ["sent"], "accepted", [sql`decided_at = NOW()`, sql`decided_by = ${actor.name}`]);
    if (!moved) return res.status(409).json({ message: "This form cannot be accepted now." });
    await logEvent(req, moved.id, "accepted", "sent", "accepted", actor);
    res.json(await withDetail(moved));
  }));

  // Given effect in the payroll (the payroll itself is updated by the dealing assistant, not by this app)
  app.post("/api/admin/claim-forms/:id/process", wrap(async (req, res) => {
    const found = await adminClaim(req, res, true);
    if (!found) return;
    const month = clean(req.body?.month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ message: "Please choose the paybill month." });
    const actor = adminActor(found.admin);
    const moved = await move(found.claim.id, ["sent", "accepted"], "processed",
      [sql`decided_at = NOW()`, sql`decided_by = ${actor.name}`, sql`processed_month = ${month}`]);
    if (!moved) return res.status(409).json({ message: "This form cannot be marked as processed now." });
    await logEvent(req, moved.id, "processed", found.claim.status, "processed", actor, `Paybill month ${month}`);
    res.json(await withDetail(moved));
  }));

  app.post("/api/admin/claim-forms/:id/reject", wrap(async (req, res) => {
    const found = await adminClaim(req, res, true);
    if (!found) return;
    const reason = clean(req.body?.reason).slice(0, 500);
    if (reason.length < 5) return res.status(400).json({ message: "Please write the reason for rejection." });
    const actor = adminActor(found.admin);
    const moved = await move(found.claim.id, ["sent", "accepted"], "rejected",
      [sql`decided_at = NOW()`, sql`decided_by = ${actor.name}`, sql`return_reason = ${reason}`, sql`returned_by = ${actor.name}`]);
    if (!moved) return res.status(409).json({ message: "This form cannot be rejected now." });
    await logEvent(req, moved.id, "rejected", found.claim.status, "rejected", actor, reason);
    res.json(await withDetail(moved));
  }));
}
