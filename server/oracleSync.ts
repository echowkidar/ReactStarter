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
  computeDiff, newEmployeeValues, FIELD_BY_NAME, FIELDS,
  type AppEmployee, type OracleRow,
} from "./oracleSyncDiff";

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

class ServiceError extends Error {
  constructor(message: string, public offline = false) { super(message); }
}

// Plain node:http (not fetch): every failure ends up in this promise and can
// never take the app process down.
function callService(path: string, timeoutMs: number): Promise<any> {
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
    SELECT id, fetched_at, fetched_by, paybill_year, paybill_month, row_count
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
    res.json({ service, snapshot: await latestSnapshotMeta() });
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
      res.json({ ok: true, id: Number((ins.rows[0] as any).id), oracleRows: rows.length, kept: kept.length });
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
      const [employees, depts] = await Promise.all([loadEmployees(), loadDepartments()]);
      const diff = computeDiff(snap.rows, employees, depts.byCode, snap.paybill);
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
      const [employees, depts] = await Promise.all([loadEmployees(), loadDepartments()]);
      const diff = computeDiff(snap.rows, employees, depts.byCode, snap.paybill);
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
          if (column !== "__created") {
            await tx.execute(sql`
              INSERT INTO employee_history (employee_id, action, field, previous_value, changed_by, changed_by_role)
              VALUES (${employeeId}, ${action}, ${HISTORY_FIELD[column] || column}, ${oldV ?? ""}, ${email}, 'oracle_sync')`);
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
              INSERT INTO employee_history (employee_id, action, field, previous_value, changed_by, changed_by_role)
              VALUES (${newId}, 'oracle_sync', 'created', '', ${email}, 'oracle_sync')`);
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

  app.get("/api/admin/oracle-sync/runs", ...guard, async (_req, res) => {
    const r = await db.execute(sql`
      SELECT r.id, r.created_at, r.created_by, r.summary, r.undone_at, r.undone_by, r.undo_summary,
             (SELECT COUNT(*) FROM oracle_sync_changes c WHERE c.run_id = r.id)::int AS change_count
      FROM oracle_sync_runs r ORDER BY r.id DESC LIMIT 30`);
    res.json(r.rows);
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
          await tx.execute(sql`
            INSERT INTO employee_history (employee_id, action, field, previous_value, changed_by, changed_by_role)
            VALUES (${c.employee_id}, 'oracle_sync_undo', ${HISTORY_FIELD[c.field] || c.field}, ${c.new_value ?? ""}, ${email}, 'oracle_sync')`);
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
