// Oracle Sync — compare app employees with the payroll master and update them.
// ─────────────────────────────────────────────────────────────────────────────
// The Oracle connection lives ONLY in the separate `oracle-sync` container
// (oracle-sync/), which is normally stopped. This file:
//   1. asks that container for a snapshot of M_EMP_MAST and stores it here
//      (table oracle_snapshots) — after that the container can be stopped,
//   2. compares the snapshot with `employees` (rules in oracleSyncDiff.ts),
//   3. applies the updates the super admin picks, in one transaction, writing
//      employee_history and oracle_sync_changes so a whole run can be undone.
// Nothing here ever writes to Oracle — the container cannot.
//
// Every route: admin login + super admin + Settings PIN unlock.
import type { Express, Request } from "express";
import http from "http";
import zlib from "zlib";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { requireSettingsUnlock } from "./settingsPin";
import {
  computeDiff, newEmployeeValues, normaliseConfig, FIELD_BY_NAME, FIELDS, PAY_RELEASE_FLAGS,
  type AppEmployee, type OracleRow, type SyncConfig,
} from "./oracleSyncDiff";

const CONFIG_KEY = "oracle_sync_config";

async function loadConfig(): Promise<SyncConfig> {
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = ${CONFIG_KEY}`);
  const raw = (r.rows[0] as any)?.value;
  try { return normaliseConfig(raw ? JSON.parse(raw) : null); } catch { return normaliseConfig(null); }
}

const HIDDEN_KEY = "oracle_sync_hidden";
const HIDE_TABS = new Set(["changes", "fills", "disable", "enable", "new", "missing"]);
type Hidden = Record<string, { sig: string; at: string }>;

async function loadHidden(): Promise<Hidden> {
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = ${HIDDEN_KEY}`);
  const raw = (r.rows[0] as any)?.value;
  try { const v = raw ? JSON.parse(raw) : {}; return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

/**
 * A TIMESTAMP column (no time zone, written with NOW() in the database's own zone)
 * as an ISO time in UTC ("…Z"). Raw db.execute returns such columns as bare text
 * like "2026-11-07 19:55", which the browser would wrongly read as Indian time.
 * Only call with fixed column names.
 */
export const isoTime = (column: string) =>
  sql.raw(`to_char((${column}) AT TIME ZONE current_setting('TimeZone') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

const SERVICE_URL = () => (process.env.ORACLE_SYNC_URL || "http://oracle-sync:8000").replace(/\/+$/, "");
const KEEP_SNAPSHOTS = 3;
const MAX_ITEMS = 12000;
const APP_STATUSES = ["Permanent", "Probation", "Temporary", "Court Case", "Compensation", "Till Further Order"];

// Columns an Oracle sync may change (and an undo may put back) — nothing else
const STATUS_COLUMNS = ["is_active", "disable_reason", "disable_wef_date"];
const UPDATABLE = new Set([...FIELDS.map((f) => f.column), ...STATUS_COLUMNS]);
const DATE_COLUMNS = new Set(["term_expiry", "disable_wef_date"]);
const QUIET_COLUMNS = new Set(FIELDS.filter((f) => f.quiet).map((f) => f.column));
const HISTORY_FIELD: Record<string, string> = {
  ...Object.fromEntries(FIELDS.map((f) => [f.column, f.field])),
  is_active: "isActive", disable_reason: "disableReason", disable_wef_date: "disableWefDate",
};

export class ServiceError extends Error {
  constructor(message: string, public offline = false) { super(message); }
}

// Plain node:http (not fetch): every failure ends up in this promise and can
// never take the app process down.
export function callService(path: string, timeoutMs: number): Promise<any> {
  const key = process.env.ORACLE_SYNC_KEY;
  if (!key) return Promise.reject(new ServiceError("ORACLE_SYNC_KEY is not set in the app stack"));
  return new Promise((resolve, reject) => {
    let url: URL;
    try { url = new URL(SERVICE_URL() + path); } catch { return reject(new ServiceError("ORACLE_SYNC_URL is not a valid address")); }
    const req = http.get(url, { headers: { "X-Sync-Key": key, "Accept-Encoding": "gzip" }, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("error", (e) => reject(new ServiceError(`Oracle sync container: ${e.message}`)));
      res.on("end", () => {
        try {
          let buf = Buffer.concat(chunks);
          if (res.headers["content-encoding"] === "gzip") buf = zlib.gunzipSync(buf);
          const body = buf.length ? JSON.parse(buf.toString("utf8")) : {};
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) return reject(new ServiceError(body?.message || `Oracle sync container error ${status}`));
          resolve(body);
        } catch (e: any) {
          reject(new ServiceError(`Bad reply from the Oracle sync container: ${e.message}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })));
    req.on("error", (e: any) => {
      const code = e?.code;
      if (["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH"].includes(code)) {
        return reject(new ServiceError("The Oracle sync container is stopped. Start it in Portainer.", true));
      }
      if (code === "ETIMEOUT") return reject(new ServiceError("The Oracle sync container did not answer in time."));
      reject(new ServiceError(`Could not reach the Oracle sync container (${code || e?.message})`, true));
    });
  });
}

const adminEmail = (req: Request) => String((req as any).adminUser?.email || "unknown");

async function latestSnapshotMeta() {
  const r = await db.execute(sql`
    SELECT id, ${isoTime("fetched_at")} AS fetched_at, fetched_by, paybill_year, paybill_month, row_count
    FROM oracle_snapshots ORDER BY id DESC LIMIT 1`);
  const s = r.rows[0] as any;
  return s ? {
    id: Number(s.id), fetchedAt: s.fetched_at, fetchedBy: s.fetched_by,
    paybill: { year: s.paybill_year, month: s.paybill_month }, rowCount: Number(s.row_count),
  } : null;
}

async function loadSnapshot(id: number) {
  const r = await db.execute(sql`
    SELECT id, paybill_year, paybill_month, rows FROM oracle_snapshots WHERE id = ${id}`);
  const s = r.rows[0] as any;
  if (!s) return null;
  return {
    id: Number(s.id),
    paybill: { year: s.paybill_year as number | null, month: s.paybill_month as number | null },
    rows: (typeof s.rows === "string" ? JSON.parse(s.rows) : s.rows) as OracleRow[],
  };
}

async function loadEmployees(): Promise<(AppEmployee & Record<string, any>)[]> {
  const r = await db.execute(sql`
    SELECT e.id, e.epid, e.name, e.designation, e.salary_register_no, e.salary_asstt,
           e.term_expiry::text AS term_expiry, e.employment_status, e.pay_level,
           e.pan_number, e.bank_account, e.aadhar_card, e.bank_name, e.ifsc,
           e.employee_category, e.oracle_emp_status, e.sal_group, e.is_active,
           e.disable_reason, e.disable_wef_date::text AS disable_wef_date,
           e.department_id, dn.dept_code, d.name AS department_name
    FROM employees e
    LEFT JOIN department_names dn ON dn.id = e.department_id
    LEFT JOIN departments d ON d.id = e.department_id`);
  return r.rows as any;
}

async function loadDepartments() {
  const r = await db.execute(sql`
    SELECT d.id, d.name, dn.dept_code FROM departments d
    LEFT JOIN department_names dn ON dn.id = d.id ORDER BY d.name`);
  const rows = r.rows as any[];
  const byCode = new Map<string, { id: number; name: string }>();
  for (const x of rows) if (x.dept_code) byCode.set(String(x.dept_code).trim().toUpperCase(), { id: Number(x.id), name: x.name });
  return { list: rows.map((x) => ({ id: Number(x.id), name: x.name, code: x.dept_code })), byCode };
}

const textOf = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const setExpr = (column: string, value: string | null) => {
  if (!UPDATABLE.has(column) && !["department_id"].includes(column)) throw new Error(`Column not allowed: ${column}`);
  if (value === null) return sql`${sql.raw(column)} = NULL`;
  return DATE_COLUMNS.has(column) ? sql`${sql.raw(column)} = ${value}::date` : sql`${sql.raw(column)} = ${value}`;
};

/**
 * What the online claim forms have from the payroll master: for how many active
 * employees, and when it was last refreshed. Shown on the Sync page, because these
 * values are not part of the reviewed differences (they refresh on every fetch).
 */
async function claimDetailsSummary() {
  try {
    const r = (await db.execute(sql`
      SELECT COUNT(*) FILTER (WHERE payroll_flags_at IS NOT NULL)::int AS refreshed,
             COUNT(*) FILTER (WHERE payroll_joining_date IS NOT NULL)::int AS joining,
             COUNT(*) FILTER (WHERE UPPER(COALESCE(conveyance_flag, '')) = 'Y')::int AS conveyance,
             COUNT(*)::int AS active,
             ${isoTime("MAX(payroll_flags_at) AT TIME ZONE current_setting('TimeZone')")} AS refreshed_at
      FROM employees WHERE is_active = 'active'`)).rows[0] as any;
    const paid = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM conveyance_paid`)).rows[0] as any;
    const kids = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM payroll_children`)).rows[0] as any;
    const cea = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM cea_paid`)).rows[0] as any;
    return {
      childrenRows: Number(kids.n), ceaPaidRows: Number(cea.n),
      active: Number(r.active), refreshed: Number(r.refreshed), withJoiningDate: Number(r.joining),
      conveyanceEntitled: Number(r.conveyance), refreshedAt: r.refreshed_at || null, conveyancePaidRows: Number(paid.n),
    };
  } catch (error) {
    console.error("[OracleSync] claim details summary failed:", error);
    return null;
  }
}

/**
 * Payroll-master values the online claim forms read (eligibility flags, joining and
 * confirmation dates, spouse, bank code). They live in their own employee columns,
 * are not part of the reviewed differences and are simply refreshed on every fetch,
 * so a flag changed in payroll is known here after the next fetch. No other column
 * of an employee is touched. Rows from an older sync container (without these
 * values) are skipped, so nothing is ever blanked by accident.
 */
export async function refreshPayrollFlags(rows: OracleRow[]): Promise<number> {
  const flag = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v).trim().toUpperCase();
    return s || null;
  };
  const day = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v).trim().slice(0, 10);
    const year = Number(s.slice(0, 4));
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && year >= 1950 && year <= 2100 ? s : null;
  };
  const list = rows
    .filter((o) => "con_flg" in o)
    .map((o) => ({
      epid: String(o.ecode).trim(),
      joining: day(o.date_of_join),
      confirm: day(o.confirm_date),
      con: flag(o.con_flg),
      hra: flag(o.hra_flg),
      pca: flag(o.pca_flg),
      npa: flag(o.medico),
      vac: flag(o.vacation_code),
      spouse: flag(o.wife_ecode),
      bank: flag(o.bank_code),
    }));
  let updated = 0;
  for (let i = 0; i < list.length; i += 2000) {
    const r = await db.execute(sql`
      UPDATE employees e SET
        payroll_joining_date = x.joining::date,
        payroll_confirm_date = x.confirm::date,
        conveyance_flag = x.con, hra_flag = x.hra, pca_flag = x.pca, npa_flag = x.npa,
        vacation_code = x.vac, spouse_epid = x.spouse, bank_code = x.bank,
        payroll_flags_at = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(list.slice(i, i + 2000))}::jsonb)
        AS x(epid text, joining text, confirm text, con text, hra text, pca text, npa text, vac text, spouse text, bank text)
      WHERE e.epid = x.epid`);
    updated += Number((r as any).rowCount || 0);
  }
  return updated;
}

/**
 * Copy of the conveyance allowance periods already paid through the payroll
 * (table conveyance_paid). Replaced as a whole on every fetch, in one transaction.
 */
export async function refreshConveyancePaid(): Promise<number> {
  const reply = await callService("/conveyance-paid", 120_000);
  const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
  const list = (Array.isArray(reply?.rows) ? reply.rows : [])
    .map((r: any) => ({
      epid: String(r.ecode || "").trim(),
      from: day(r.period_from),
      to: day(r.period_to),
      amount: r.amt === null || r.amt === undefined ? null : Number(r.amt),
      vehicle: r.type_of_veh === null || r.type_of_veh === undefined ? null : String(r.type_of_veh),
    }))
    .filter((r: any) => r.epid && r.from);
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM conveyance_paid`);
    for (let i = 0; i < list.length; i += 2000) {
      await tx.execute(sql`
        INSERT INTO conveyance_paid (epid, period_from, period_to, amount, vehicle_type)
        SELECT x.epid, x."from"::date, x."to"::date, x.amount, x.vehicle
        FROM jsonb_to_recordset(${JSON.stringify(list.slice(i, i + 2000))}::jsonb)
          AS x(epid text, "from" text, "to" text, amount numeric, vehicle text)`);
    }
  });
  return list.length;
}

const cleanText = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s || null;
};
const cleanDay = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v).trim().slice(0, 10);
  const year = Number(s.slice(0, 4));
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && year >= 1950 && year <= 2100 ? s : null;
};

/** Copy of the sons and daughters in the family details (table payroll_children). Replaced as a whole. */
export async function refreshFamilyChildren(): Promise<number> {
  const reply = await callService("/family-children", 120_000);
  const list = (Array.isArray(reply?.rows) ? reply.rows : [])
    .map((r: any) => ({
      epid: String(r.ecode || "").trim(),
      name: cleanText(r.person_name),
      dob: cleanDay(r.dob),
      relation: cleanText(r.relation_with_emp),
      sex: cleanText(r.sex),
    }))
    .filter((r: any) => r.epid && r.name && r.relation);
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM payroll_children`);
    for (let i = 0; i < list.length; i += 2000) {
      await tx.execute(sql`
        INSERT INTO payroll_children (epid, name, dob, relation, sex)
        SELECT x.epid, x.name, x.dob::date, x.relation, x.sex
        FROM jsonb_to_recordset(${JSON.stringify(list.slice(i, i + 2000))}::jsonb)
          AS x(epid text, name text, dob text, relation text, sex text)`);
    }
  });
  return list.length;
}

/** Copy of the Children Education Allowance already paid (table cea_paid). Replaced as a whole. */
export async function refreshCeaPaid(): Promise<number> {
  const reply = await callService("/cea-paid", 120_000);
  const list = (Array.isArray(reply?.rows) ? reply.rows : [])
    .map((r: any) => ({
      epid: String(r.ecode || "").trim(),
      child: cleanText(r.cname),
      dob: cleanDay(r.dob),
      session: cleanText(r.asession),
      cls: cleanText(r.class),
      amount: r.cx_amt === null || r.cx_amt === undefined || r.cx_amt === "" || !Number.isFinite(Number(r.cx_amt)) ? null : Number(r.cx_amt),
      fy: cleanText(r.financial_year),
    }))
    .filter((r: any) => r.epid);
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM cea_paid`);
    for (let i = 0; i < list.length; i += 2000) {
      await tx.execute(sql`
        INSERT INTO cea_paid (epid, child_name, dob, session, class_name, amount, financial_year)
        SELECT x.epid, x.child, x.dob::date, x.session, x.cls, x.amount, x.fy
        FROM jsonb_to_recordset(${JSON.stringify(list.slice(i, i + 2000))}::jsonb)
          AS x(epid text, child text, dob text, session text, cls text, amount numeric, fy text)`);
    }
  });
  return list.length;
}

/** Copy of the spouse employment details (table payroll_spouse), first row per employee. Replaced as a whole. */
export async function refreshSpouse(): Promise<number> {
  const reply = await callService("/spouse", 120_000);
  const list = (Array.isArray(reply?.rows) ? reply.rows : [])
    .map((r: any) => ({
      epid: String(r.ecode || "").trim(),
      name: cleanText(r.sname),
      desig: cleanText(r.desig),
      org: cleanText(r.comp),
    }))
    .filter((r: any) => r.epid);
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM payroll_spouse`);
    for (let i = 0; i < list.length; i += 2000) {
      await tx.execute(sql`
        INSERT INTO payroll_spouse (epid, name, designation, organisation)
        SELECT x.epid, x.name, x.desig, x.org
        FROM jsonb_to_recordset(${JSON.stringify(list.slice(i, i + 2000))}::jsonb)
          AS x(epid text, name text, desig text, org text)
        ON CONFLICT (epid) DO NOTHING`);
    }
  });
  return list.length;
}

export function registerOracleSyncRoutes(app: Express, verifyAdminSession: any) {
  const guard = [verifyAdminSession, requireSettingsUnlock];

  // Is the container running? What snapshot do we have?
  app.get("/api/admin/oracle-sync/status", ...guard, async (_req, res) => {
    let service: any;
    try {
      const h = await callService("/health", 15_000);
      service = { online: true, oracleVersion: h.oracleVersion, latestPaybill: h.latestPaybill };
    } catch (e: any) {
      service = { online: false, error: e.message, stopped: !!e.offline };
    }
    res.json({ service, snapshot: await latestSnapshotMeta(), claimDetails: await claimDetailsSummary() });
  });

  // Read the payroll master through the container and keep a copy here
  app.post("/api/admin/oracle-sync/fetch", ...guard, async (req, res) => {
    try {
      const snap = await callService("/snapshot", 180_000);
      const rows: OracleRow[] = Array.isArray(snap.rows) ? snap.rows : [];
      if (!rows.length) return res.status(502).json({ message: "Oracle returned no employees" });
      // Keep only rows that matter: employees in the app, or paid / pay-released in Oracle
      const epids = new Set((await db.execute(sql`SELECT epid FROM employees`)).rows.map((r: any) => String(r.epid).trim()));
      const kept = rows.filter((o) => epids.has(String(o.ecode).trim()) || o.paid_last_month === 1 || o.pay_release_flag === "Y");
      const ins = await db.execute(sql`
        INSERT INTO oracle_snapshots (fetched_by, paybill_year, paybill_month, row_count, rows)
        VALUES (${adminEmail(req)}, ${snap.paybill?.year ?? null}, ${snap.paybill?.month ?? null}, ${kept.length},
                ${JSON.stringify(kept)}::jsonb)
        RETURNING id`);
      await db.execute(sql`
        DELETE FROM oracle_snapshots WHERE id NOT IN (SELECT id FROM oracle_snapshots ORDER BY id DESC LIMIT ${KEEP_SNAPSHOTS})`);
      // Payroll values used by the online claim forms: refreshed on every fetch
      let payrollFlags = 0;
      try {
        payrollFlags = await refreshPayrollFlags(kept);
      } catch (flagError) {
        console.error("[OracleSync] payroll flags not refreshed:", flagError);
      }
      // Conveyance allowance already paid: so a paid period cannot be claimed again online
      let conveyancePaid: number | null = null;
      try {
        conveyancePaid = await refreshConveyancePaid();
      } catch (paidError: any) {
        // an older sync container has no such endpoint: the existing copy is kept
        console.warn("[OracleSync] paid conveyance periods not refreshed:", paidError?.message || paidError);
      }
      // Children, CEA payments and spouse details for the Children Education Allowance form
      let familyChildren: number | null = null;
      let ceaPaid: number | null = null;
      let spouse: number | null = null;
      try {
        familyChildren = await refreshFamilyChildren();
      } catch (e2: any) {
        console.warn("[OracleSync] family details of children not refreshed:", e2?.message || e2);
      }
      try {
        ceaPaid = await refreshCeaPaid();
      } catch (e3: any) {
        console.warn("[OracleSync] CEA payments not refreshed:", e3?.message || e3);
      }
      try {
        spouse = await refreshSpouse();
      } catch (e4: any) {
        console.warn("[OracleSync] spouse details not refreshed:", e4?.message || e4);
      }
      res.json({ ok: true, id: Number((ins.rows[0] as any).id), oracleRows: rows.length, kept: kept.length, payrollFlags, conveyancePaid, familyChildren, ceaPaid, spouse });
    } catch (e: any) {
      console.error("[OracleSync] fetch failed:", e);
      res.status(e instanceof ServiceError ? 503 : 500).json({ message: e.message || "Fetch failed" });
    }
  });

  // Differences between the latest snapshot and the app
  app.get("/api/admin/oracle-sync/diff", ...guard, async (_req, res) => {
    try {
      const meta = await latestSnapshotMeta();
      if (!meta) return res.json({ snapshot: null, items: [], counts: null, departments: [] });
      const snap = (await loadSnapshot(meta.id))!;
      const [employees, depts, config] = await Promise.all([loadEmployees(), loadDepartments(), loadConfig()]);
      const diff = computeDiff(snap.rows, employees, depts.byCode, snap.paybill, config);
      res.json({
        snapshot: meta, ...diff, departments: depts.list,
        fields: FIELDS.map((f) => ({ field: f.field, label: f.label, sensitive: !!f.sensitive, quiet: !!f.quiet })),
      });
    } catch (e: any) {
      console.error("[OracleSync] diff failed:", e);
      res.status(500).json({ message: e.message || "Could not compare" });
    }
  });

  /**
   * Apply chosen updates. Body:
   *  { snapshotId, items: [{ epid, fields?: string[], status?: "disable"|"enable",
   *                          create?: { departmentId, employmentStatus } }] }
   * Values always come from the stored snapshot, never from the browser.
   */
  app.post("/api/admin/oracle-sync/apply", ...guard, async (req, res) => {
    const email = adminEmail(req);
    try {
      const { snapshotId, items } = req.body || {};
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: "Nothing selected" });
      if (items.length > MAX_ITEMS) return res.status(400).json({ message: "Too many items" });
      const meta = await latestSnapshotMeta();
      if (!meta || meta.id !== Number(snapshotId)) {
        return res.status(409).json({ message: "A newer Oracle snapshot exists. Reload the page." });
      }
      const snap = (await loadSnapshot(meta.id))!;
      const [employees, depts, config] = await Promise.all([loadEmployees(), loadDepartments(), loadConfig()]);
      const diff = computeDiff(snap.rows, employees, depts.byCode, snap.paybill, config);
      const diffByEpid = new Map(diff.items.map((i) => [i.epid, i]));
      const empById = new Map(employees.map((e) => [e.id, e]));
      const oracleByEcode = new Map(snap.rows.map((o) => [String(o.ecode).trim(), o]));
      const deptIds = new Set(depts.list.map((d) => d.id));
      const today = new Date().toISOString().slice(0, 10);

      const result = await db.transaction(async (tx) => {
        const run = await tx.execute(sql`
          INSERT INTO oracle_sync_runs (snapshot_id, created_by, summary) VALUES (${meta.id}, ${email}, '{}'::jsonb)
          RETURNING id`);
        const runId = Number((run.rows[0] as any).id);
        const summary = { employeesUpdated: 0, fieldsChanged: 0, disabled: 0, enabled: 0, created: 0, skipped: [] as string[] };

        const record = async (employeeId: number, epid: string, column: string, oldV: string | null, newV: string | null, action = "oracle_sync") => {
          await tx.execute(sql`
            INSERT INTO oracle_sync_changes (run_id, employee_id, epid, field, old_value, new_value)
            VALUES (${runId}, ${employeeId}, ${epid}, ${column}, ${oldV}, ${newV})`);
          // Employee history: real changes only (not Oracle-only bookkeeping fields)
          if (column !== "__created" && !QUIET_COLUMNS.has(column)) {
            await tx.execute(sql`
              INSERT INTO employee_history (employee_id, action, field, previous_value, new_value, changed_by, changed_by_role)
              VALUES (${employeeId}, ${action}, ${HISTORY_FIELD[column] || column}, ${oldV ?? ""}, ${newV ?? ""}, ${email}, 'oracle_sync')`);
          }
        };

        for (const it of items) {
          const epid = String(it?.epid || "").trim();
          const d = diffByEpid.get(epid);
          if (!d) { summary.skipped.push(`${epid}: no difference any more`); continue; }

          if (d.kind === "existing" && d.employeeId) {
            const emp = empById.get(d.employeeId)!;
            const wanted = new Set<string>(Array.isArray(it.fields) ? it.fields.map(String) : []);
            const sets: Array<{ column: string; value: string | null }> = [];
            const wantsStatus = it.status && d.status && it.status === d.status.action;
            for (const c of d.changes) {
              // Oracle status / salary group ride along with any other update of the row
              if (wanted.has(c.field) || (c.quiet && (wanted.size > 0 || wantsStatus))) {
                const def = FIELD_BY_NAME.get(c.field)!;
                sets.push({ column: def.column, value: c.oracle });
              }
            }
            if (wantsStatus) {
              if (d.status!.action === "disable") {
                sets.push({ column: "is_active", value: "inactive" });
                if (d.status!.disableReason) sets.push({ column: "disable_reason", value: d.status!.disableReason });
                if (d.status!.wefDate) sets.push({ column: "disable_wef_date", value: d.status!.wefDate });
              } else {
                sets.push({ column: "is_active", value: "active" });
              }
            }
            if (!sets.length) { summary.skipped.push(`${epid}: nothing chosen`); continue; }

            const parts = sets.map((s) => setExpr(s.column, s.value));
            const extra = wantsStatus && d.status!.action === "disable"
              ? [sql`disabled_at = NOW()`, sql`disabled_by = ${"Oracle sync: " + email}`] : [];
            await tx.execute(sql`
              UPDATE employees SET ${sql.join([...parts, ...extra, sql`oracle_synced_at = NOW()`], sql`, `)}
              WHERE id = ${emp.id}`);
            for (const s of sets) await record(emp.id, epid, s.column, textOf(emp[s.column]), s.value);
            summary.employeesUpdated++;
            summary.fieldsChanged += sets.filter((s) => !STATUS_COLUMNS.includes(s.column) && !QUIET_COLUMNS.has(s.column)).length;
            if (wantsStatus) d.status!.action === "disable" ? summary.disabled++ : summary.enabled++;
            continue;
          }

          if (d.kind === "new" && it.create) {
            const o = oracleByEcode.get(epid)!;
            const departmentId = Number(it.create.departmentId);
            const status = String(it.create.employmentStatus || d.suggestedEmploymentStatus || "");
            if (!deptIds.has(departmentId)) { summary.skipped.push(`${epid}: choose a department`); continue; }
            if (!APP_STATUSES.includes(status)) { summary.skipped.push(`${epid}: choose an employment status`); continue; }
            const exists = await tx.execute(sql`SELECT 1 FROM employees WHERE epid = ${epid} LIMIT 1`);
            if (exists.rows.length) { summary.skipped.push(`${epid}: already exists`); continue; }
            const v = newEmployeeValues(o, departmentId, status, today);
            const ins = await tx.execute(sql`
              INSERT INTO employees (department_id, epid, name, designation, employment_status, pay_level, term_expiry,
                joining_date, salary_register_no, office_memo_no, joining_shift, salary_asstt, pan_number, bank_account,
                aadhar_card, bank_name, ifsc, employee_category, oracle_emp_status, sal_group, is_active, oracle_synced_at,
                remarks)
              VALUES (${v.department_id}, ${v.epid}, ${v.name}, ${v.designation}, ${v.employment_status}, ${v.pay_level},
                ${v.term_expiry}::date, ${v.joining_date}::date, ${v.salary_register_no}, ${v.office_memo_no}, ${v.joining_shift},
                ${v.salary_asstt}, ${v.pan_number}, ${v.bank_account}, ${v.aadhar_card}, ${v.bank_name}, ${v.ifsc},
                ${v.employee_category}, ${v.oracle_emp_status}, ${v.sal_group}, 'active', NOW(),
                ${"Added from Oracle payroll master by " + email})
              RETURNING id`);
            const newId = Number((ins.rows[0] as any).id);
            await record(newId, epid, "__created", null, epid);
            await tx.execute(sql`
              INSERT INTO employee_history (employee_id, action, field, previous_value, new_value, changed_by, changed_by_role)
              VALUES (${newId}, 'oracle_sync', 'created', '', 'Added from Oracle payroll master', ${email}, 'oracle_sync')`);
            summary.created++;
            continue;
          }
          summary.skipped.push(`${epid}: nothing to do`);
        }

        await tx.execute(sql`UPDATE oracle_sync_runs SET summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${runId}`);
        return { runId, ...summary };
      });

      res.json({ ok: true, ...result });
    } catch (e: any) {
      console.error("[OracleSync] apply failed:", e);
      res.status(500).json({ message: `Nothing was changed: ${e.message || "update failed"}` });
    }
  });

  // What to compare and which Oracle pay release flags agree with "active"
  app.get("/api/admin/oracle-sync/config", ...guard, async (_req, res) => {
    res.json({
      config: await loadConfig(),
      fields: FIELDS.filter((f) => !f.quiet).map((f) => ({ field: f.field, label: f.label })),
      payReleaseFlags: PAY_RELEASE_FLAGS,
    });
  });

  app.put("/api/admin/oracle-sync/config", ...guard, async (req, res) => {
    try {
      const config = normaliseConfig(req.body?.config);
      await db.execute(sql`
        INSERT INTO app_settings (key, value) VALUES (${CONFIG_KEY}, ${JSON.stringify(config)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
      res.json({ ok: true, config });
    } catch (e: any) {
      console.error("[OracleSync] save config failed:", e);
      res.status(500).json({ message: "Could not save the configuration" });
    }
  });

  app.get("/api/admin/oracle-sync/runs", ...guard, async (_req, res) => {
    const r = await db.execute(sql`
      SELECT r.id, ${isoTime("r.created_at")} AS created_at, r.created_by, r.summary,
             ${isoTime("r.undone_at")} AS undone_at, r.undone_by, r.undo_summary,
             (SELECT COUNT(*) FROM oracle_sync_changes c WHERE c.run_id = r.id)::int AS change_count
      FROM oracle_sync_runs r ORDER BY r.id DESC LIMIT 30`);
    res.json(r.rows);
  });

  // What one run changed: employee, field, previous → new
  app.get("/api/admin/oracle-sync/runs/:id/changes", ...guard, async (req, res) => {
    try {
      const r = await db.execute(sql`
        SELECT c.id, c.epid, COALESCE(e.name, '') AS name, c.field AS "column", c.old_value, c.new_value
        FROM oracle_sync_changes c LEFT JOIN employees e ON e.id = c.employee_id
        WHERE c.run_id = ${Number(req.params.id)}
        ORDER BY c.epid, c.id`);
      res.json((r.rows as any[])
        .filter((c) => !QUIET_COLUMNS.has(c.column))
        .map((c) => ({
          id: c.id, epid: c.epid, name: c.name,
          field: c.column === "__created" ? "created" : HISTORY_FIELD[c.column] || c.column,
          oldValue: c.old_value, newValue: c.new_value,
        })));
    } catch (e: any) {
      console.error("[OracleSync] run changes failed:", e);
      res.status(500).json({ message: "Could not load the changes of this run" });
    }
  });

  // Rows the super admin chose to hide from the lists. Each entry remembers what
  // the row looked like ("sig"); if Oracle later shows something different the
  // row comes back by itself.
  app.get("/api/admin/oracle-sync/hidden", ...guard, async (_req, res) => {
    res.json(await loadHidden());
  });

  app.put("/api/admin/oracle-sync/hidden", ...guard, async (req, res) => {
    try {
      const add = Array.isArray(req.body?.add) ? req.body.add : [];
      const remove = Array.isArray(req.body?.remove) ? req.body.remove.map(String) : [];
      if (add.length + remove.length > MAX_ITEMS) return res.status(400).json({ message: "Too many items" });
      const hidden = await loadHidden();
      const at = new Date().toISOString();
      for (const a of add) {
        const tab = String(a?.tab || ""), epid = String(a?.epid || "").trim(), sig = String(a?.sig || "");
        if (!HIDE_TABS.has(tab) || !epid || sig.length > 4000) continue;
        hidden[`${tab}|${epid}`] = { sig, at };
      }
      for (const k of remove) delete hidden[k];
      await db.execute(sql`
        INSERT INTO app_settings (key, value) VALUES (${HIDDEN_KEY}, ${JSON.stringify(hidden)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
      res.json(hidden);
    } catch (e: any) {
      console.error("[OracleSync] save hidden failed:", e);
      res.status(500).json({ message: "Could not save" });
    }
  });

  // Put back everything one run changed — but only values nobody has changed since
  app.post("/api/admin/oracle-sync/runs/:id/undo", ...guard, async (req, res) => {
    const email = adminEmail(req);
    const runId = Number(req.params.id);
    try {
      const result = await db.transaction(async (tx) => {
        const run = (await tx.execute(sql`SELECT id, undone_at FROM oracle_sync_runs WHERE id = ${runId} FOR UPDATE`)).rows[0] as any;
        if (!run) throw Object.assign(new Error("Run not found"), { status: 404 });
        if (run.undone_at) throw Object.assign(new Error("This run was already undone"), { status: 409 });
        const changes = (await tx.execute(sql`
          SELECT id, employee_id, epid, field, old_value, new_value FROM oracle_sync_changes
          WHERE run_id = ${runId} ORDER BY id DESC`)).rows as any[];
        const out = { restored: 0, removed: 0, keptBecauseChanged: [] as string[] };
        for (const c of changes) {
          if (c.field === "__created") {
            const used = await tx.execute(sql`SELECT 1 FROM attendance_entries WHERE employee_id = ${c.employee_id} LIMIT 1`);
            if (used.rows.length) { out.keptBecauseChanged.push(`${c.epid}: has attendance, not removed`); continue; }
            await tx.execute(sql`DELETE FROM employee_history WHERE employee_id = ${c.employee_id}`);
            await tx.execute(sql`DELETE FROM employees WHERE id = ${c.employee_id}`);
            out.removed++;
            continue;
          }
          if (!UPDATABLE.has(c.field)) continue;
          const cur = (await tx.execute(sql`
            SELECT ${sql.raw(c.field)}::text AS v FROM employees WHERE id = ${c.employee_id}`)).rows[0] as any;
          if (!cur) continue;
          if (textOf(cur.v) !== textOf(c.new_value)) {
            out.keptBecauseChanged.push(`${c.epid}: ${HISTORY_FIELD[c.field] || c.field} changed since`);
            continue;
          }
          await tx.execute(sql`UPDATE employees SET ${setExpr(c.field, textOf(c.old_value))} WHERE id = ${c.employee_id}`);
          if (!QUIET_COLUMNS.has(c.field)) {
            await tx.execute(sql`
              INSERT INTO employee_history (employee_id, action, field, previous_value, new_value, changed_by, changed_by_role)
              VALUES (${c.employee_id}, 'oracle_sync_undo', ${HISTORY_FIELD[c.field] || c.field}, ${c.new_value ?? ""}, ${c.old_value ?? ""}, ${email}, 'oracle_sync')`);
          }
          out.restored++;
        }
        await tx.execute(sql`
          UPDATE oracle_sync_runs SET undone_at = NOW(), undone_by = ${email}, undo_summary = ${JSON.stringify(out)}::jsonb
          WHERE id = ${runId}`);
        return out;
      });
      res.json({ ok: true, ...result });
    } catch (e: any) {
      console.error("[OracleSync] undo failed:", e);
      res.status(e.status || 500).json({ message: e.message || "Undo failed" });
    }
  });
}
