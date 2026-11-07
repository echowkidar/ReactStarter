// Paybill History — a copy of Oracle T_PAYBILL_HIST + T_PAYBILL_HIST_ARCHIVE
// (22 columns) in table paybill_history, with search, and two jobs:
//
//   "Add new months"  copies every month Oracle has that is not here yet
//                     (the first time: all ~200 months, year by year).
//   "Check changes"   compares each month's Oracle fingerprint (row count +
//                     ORA_HASH sum) with the one stored when it was copied; only
//                     months that differ are read again and compared row by row.
//                     The result is a REPORT; nothing changes here until the
//                     super admin presses Apply.
//
// Oracle is only ever READ, through the read-only oracle-sync container (all its
// SQL is fixed SELECTs, see oracle-sync/queries.py). This file writes only to the
// app's own Postgres tables paybill_history / paybill_months / paybill_runs /
// paybill_changes, and never touches employees or any other app data.
//
// Oracle has no unique key for these rows (an employee can have two rows in one
// bill, for two pay periods), so a row is identified by
// src + year + month + sal_code + ecode + line_no, line_no being the row's
// position among that employee's rows of that bill, ordered by pay period.
import type { Express, Request } from "express";
import crypto from "crypto";
import { sql, type SQL } from "drizzle-orm";
import type { PoolClient } from "pg";
import { db, pool } from "./db";
import { requireSettingsUnlock } from "./settingsPin";
import { callService, isoTime } from "./oracleSync";

// ── Columns ──────────────────────────────────────────────────────────────────
const KEY_COLS = ["src", "yr_no", "mth_no", "sal_code", "ecode", "line_no"] as const;
/** The compared / stored data columns (the 22 Oracle columns minus the 4 in the key) */
export const DATA_COLS = [
  "cat_code", "emp_cat", "desig_code", "deptt", "basic_sal", "npa", "da", "hra", "ta", "pat_care",
  "nursing", "annual", "d_ast", "full_pay_fdate", "full_pay_tdate", "sal_no", "grade_pay", "sal_flag",
] as const;
const NUM_COLS = new Set(["basic_sal", "npa", "da", "hra", "ta", "pat_care", "nursing", "annual", "grade_pay"]);
const DATE_COLS = new Set(["full_pay_fdate", "full_pay_tdate"]);
const INSERT_COLS = [...KEY_COLS, ...DATA_COLS];

type Val = string | number | null;
export type PbRow = {
  src: string; yr_no: number; mth_no: number; sal_code: number; ecode: string; line_no: number;
  row_hash: string;
} & Record<string, Val>;
type Fingerprint = { src: string; year: number; month: number; rows: number; hash: string };

const YEAR_FETCH_MS = 10 * 60_000;
const SAL_TYPES: Record<number, string> = { 1: "Regular", 2: "Supplementary 2", 3: "Supplementary 3", 4: "Code 4", 5: "Code 5" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;
const monthKey = (src: string, y: number, m: number) => `${src}|${y}|${m}`;

/** Same value whether it comes from Oracle (JSON) or Postgres (text / numeric strings) */
function norm(col: string, v: unknown): Val {
  if (v === null || v === undefined) return null;
  if (NUM_COLS.has(col)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  return DATE_COLS.has(col) ? s.slice(0, 10) : s;
}

const hashOf = (r: Record<string, Val>) =>
  crypto.createHash("md5").update(JSON.stringify(DATA_COLS.map((c) => r[c] ?? null))).digest("hex");

/** Oracle reply (columns + row arrays) → rows with line numbers and hashes */
function toRows(src: string, columns: string[], arrays: unknown[][]): PbRow[] {
  const idx = (c: string) => columns.indexOf(c);
  const pos = Object.fromEntries(["yr_no", "mth_no", "sal_code", "ecode", ...DATA_COLS].map((c) => [c, idx(c)]));
  for (const [c, i] of Object.entries(pos)) if (i < 0) throw new Error(`Oracle reply has no column ${c}`);
  const rows = arrays.map((a) => {
    const r: any = {
      src, yr_no: Number(a[pos.yr_no]), mth_no: Number(a[pos.mth_no]), sal_code: Number(a[pos.sal_code]),
      ecode: String(a[pos.ecode] ?? "").trim(),
    };
    for (const c of DATA_COLS) r[c] = norm(c, a[pos[c]]);
    r.row_hash = hashOf(r);
    return r as PbRow;
  });
  // line_no: position among the same employee's rows in the same bill
  const groups = new Map<string, PbRow[]>();
  for (const r of rows) {
    const k = `${r.yr_no}|${r.mth_no}|${r.sal_code}|${r.ecode}`;
    (groups.get(k) || groups.set(k, []).get(k)!).push(r);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => String(a.full_pay_fdate ?? "").localeCompare(String(b.full_pay_fdate ?? "")) ||
      String(a.full_pay_tdate ?? "").localeCompare(String(b.full_pay_tdate ?? "")) ||
      a.row_hash.localeCompare(b.row_hash));
    g.forEach((r, i) => { r.line_no = i + 1; });
  }
  return rows;
}

const rowKey = (r: { sal_code: number; ecode: string; line_no: number }) => `${r.sal_code}|${r.ecode}|${r.line_no}`;

/** Months m1..m2 of one year from Oracle (rows + those months' fingerprints) */
async function fetchMonths(src: string, year: number, m1: number, m2: number) {
  const r = await callService(`/paybill/rows?src=${src}&yr=${year}&m1=${m1}&m2=${m2}`, YEAR_FETCH_MS);
  return { rows: toRows(src, r.columns, r.rows), months: r.months as Fingerprint[] };
}

/** Postgres rows of one month, normalised like Oracle's */
async function loadMonth(src: string, y: number, m: number): Promise<PbRow[]> {
  const r = await db.execute(sql`
    SELECT src, yr_no, mth_no, sal_code, ecode, line_no, cat_code, emp_cat, desig_code, deptt,
           basic_sal::text AS basic_sal, npa::text AS npa, da::text AS da, hra::text AS hra, ta::text AS ta,
           pat_care::text AS pat_care, nursing::text AS nursing, annual::text AS annual, d_ast,
           to_char(full_pay_fdate, 'YYYY-MM-DD') AS full_pay_fdate, to_char(full_pay_tdate, 'YYYY-MM-DD') AS full_pay_tdate,
           sal_no, grade_pay::text AS grade_pay, sal_flag
    FROM paybill_history WHERE yr_no = ${y} AND mth_no = ${m} AND src = ${src}`);
  return (r.rows as any[]).map((x) => {
    const o: any = {
      src: x.src.trim(), yr_no: Number(x.yr_no), mth_no: Number(x.mth_no), sal_code: Number(x.sal_code),
      ecode: x.ecode, line_no: Number(x.line_no),
    };
    for (const c of DATA_COLS) o[c] = norm(c, x[c]);
    o.row_hash = hashOf(o); // from the stored values themselves, so any difference shows up
    return o as PbRow;
  });
}

async function insertRows(client: PoolClient, rows: PbRow[]) {
  const n = INSERT_COLS.length;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const params: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      for (const c of INSERT_COLS) params.push((r as any)[c] ?? null);
      return `(${INSERT_COLS.map((_, k) => `$${j * n + k + 1}`).join(",")})`;
    });
    await client.query(`INSERT INTO paybill_history (${INSERT_COLS.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
}

/** Replace whole months with Oracle's rows and remember their fingerprints (one transaction) */
async function replaceMonths(months: Array<{ fp: Fingerprint; rows: PbRow[] }>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { fp, rows } of months) {
      await client.query("DELETE FROM paybill_history WHERE yr_no = $2 AND mth_no = $3 AND src = $1", [fp.src, fp.year, fp.month]);
      await insertRows(client, rows);
      await client.query(`
        INSERT INTO paybill_months (src, yr_no, mth_no, row_count, ora_hash, synced_at) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (src, yr_no, mth_no) DO UPDATE SET row_count = EXCLUDED.row_count, ora_hash = EXCLUDED.ora_hash, synced_at = NOW()`,
        [fp.src, fp.year, fp.month, fp.rows, fp.hash]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ── Background jobs (one at a time) ─────────────────────────────────────────
type Job = { runId: number; kind: "new" | "check"; step: string; done: number; total: number; startedAt: string };
let job: Job | null = null;
let optionsCache: { at: number; data: any } | null = null;
/** Search totals per filter set; emptied whenever the copied data changes */
const totalsCache = new Map<string, any>();
const dataChanged = () => { optionsCache = null; totalsCache.clear(); };

async function startRun(kind: "new" | "check", email: string) {
  const r = await db.execute(sql`
    INSERT INTO paybill_runs (kind, status, created_by) VALUES (${kind}, 'running', ${email}) RETURNING id`);
  return Number((r.rows[0] as any).id);
}
async function finishRun(runId: number, status: string, summary: unknown, error?: string) {
  await db.execute(sql`
    UPDATE paybill_runs SET status = ${status}, summary = ${JSON.stringify(summary)}::jsonb, error = ${error ?? null},
           finished_at = NOW() WHERE id = ${runId}`);
}

async function storedFingerprints() {
  const r = await db.execute(sql`SELECT src, yr_no, mth_no, row_count, ora_hash FROM paybill_months`);
  return new Map((r.rows as any[]).map((x) => [monthKey(x.src.trim(), x.yr_no, x.mth_no),
    { src: x.src.trim(), year: Number(x.yr_no), month: Number(x.mth_no), rows: Number(x.row_count), hash: String(x.ora_hash) }]));
}

/**
 * Batches of at most 3 consecutive months of one table and year: each batch is one
 * Oracle read. Small batches keep memory low (a whole year is ~1.4 lakh rows).
 */
function batches(list: Fingerprint[]) {
  const sorted = [...list].sort((a, b) => a.src.localeCompare(b.src) || a.year - b.year || a.month - b.month);
  const out: Array<{ src: string; year: number; m1: number; m2: number; months: Set<number> }> = [];
  for (const f of sorted) {
    const last = out[out.length - 1];
    if (last && last.src === f.src && last.year === f.year && f.month === last.m2 + 1 && f.month - last.m1 < 3) {
      last.m2 = f.month; last.months.add(f.month);
    } else {
      out.push({ src: f.src, year: f.year, m1: f.month, m2: f.month, months: new Set([f.month]) });
    }
  }
  return out.sort((a, b) => a.year - b.year || a.m1 - b.m1 || a.src.localeCompare(b.src));
}
const batchLabel = (b: { src: string; year: number; m1: number; m2: number }) =>
  `${MONTHS[b.m1 - 1]}${b.m2 > b.m1 ? `–${MONTHS[b.m2 - 1]}` : ""} ${b.year}${b.src === "A" ? " (archive)" : ""}`;

/** "Add new months": copy every Oracle month that is not here yet */
async function runNewMonths(runId: number) {
  job!.step = "Reading the month list from Oracle…";
  const fps: Fingerprint[] = (await callService("/paybill/fingerprints", YEAR_FETCH_MS)).months;
  const have = await storedFingerprints();
  const missing = fps.filter((f) => !have.has(monthKey(f.src, f.year, f.month)));
  const groups = batches(missing);
  job!.total = groups.length;
  const added: string[] = [];
  let rowCount = 0;
  for (const g of groups) {
    job!.step = `Copying ${batchLabel(g)}…`;
    const { rows, months } = await fetchMonths(g.src, g.year, g.m1, g.m2);
    const parts = months.filter((f) => g.months.has(f.month)).map((fp) => ({
      fp, rows: rows.filter((r) => r.mth_no === fp.month),
    }));
    await replaceMonths(parts); // each batch is saved on its own: an interrupted copy carries on next time
    for (const p of parts) { added.push(`${monthLabel(p.fp.year, p.fp.month)}${p.fp.src === "A" ? " (archive)" : ""}`); rowCount += p.rows.length; }
    job!.done++;
  }
  dataChanged();
  await finishRun(runId, "done", { months: added.length, rows: rowCount, added });
}

/** "Check changes": find what Oracle changed in months already copied → report */
async function runCheck(runId: number) {
  job!.step = "Reading the month list from Oracle…";
  const fps: Fingerprint[] = (await callService("/paybill/fingerprints", YEAR_FETCH_MS)).months;
  const oracle = new Map(fps.map((f) => [monthKey(f.src, f.year, f.month), f]));
  const have = await storedFingerprints();
  const differing: Fingerprint[] = [];
  const gone: Fingerprint[] = [];
  for (const [k, h] of have) {
    const o = oracle.get(k);
    if (!o) gone.push(h);
    else if (o.rows !== h.rows || o.hash !== h.hash) differing.push(o);
  }
  const newMonths = fps.filter((f) => !have.has(monthKey(f.src, f.year, f.month))).length;

  type Change = { src: string; yr_no: number; mth_no: number; sal_code: number; ecode: string; line_no: number;
    kind: "added" | "removed" | "changed"; fields: any[] | null; new_row: PbRow | null };
  const changes: Change[] = [];
  const monthsSummary: any[] = [];
  const quietMonths: Fingerprint[] = []; // fingerprint differs but no stored value does (e.g. spaces)

  const compare = (fp: Fingerprint, oRows: PbRow[], aRows: PbRow[]) => {
    const app = new Map(aRows.map((r) => [rowKey(r), r]));
    const ora = new Map(oRows.map((r) => [rowKey(r), r]));
    let n = 0;
    for (const [k, o] of ora) {
      const a = app.get(k);
      if (!a) { changes.push({ ...pick(o), kind: "added", fields: null, new_row: o }); n++; continue; }
      if (a.row_hash !== o.row_hash) {
        const fields = DATA_COLS.filter((c) => (a[c] ?? null) !== (o[c] ?? null)).map((c) => ({ field: c, old: a[c] ?? null, new: o[c] ?? null }));
        if (fields.length) { changes.push({ ...pick(o), kind: "changed", fields, new_row: o }); n++; }
      }
    }
    for (const [k, a] of app) if (!ora.has(k)) { changes.push({ ...pick(a), kind: "removed", fields: null, new_row: null }); n++; }
    const old = have.get(monthKey(fp.src, fp.year, fp.month))!;
    monthsSummary.push({ src: fp.src, year: fp.year, month: fp.month, oldRows: old.rows, oldHash: old.hash, rows: fp.rows, hash: fp.hash, changes: n });
    if (!n) quietMonths.push(fp);
  };

  const groups = batches(differing);
  job!.total = groups.length + (gone.length ? 1 : 0);
  for (const g of groups) {
    job!.step = `Comparing ${batchLabel(g)}…`;
    const { rows, months } = await fetchMonths(g.src, g.year, g.m1, g.m2);
    for (const fp of months.filter((f) => g.months.has(f.month))) {
      compare(fp, rows.filter((r) => r.mth_no === fp.month), await loadMonth(fp.src, fp.year, fp.month));
    }
    job!.done++;
  }
  for (const h of gone) compare({ ...h, rows: 0, hash: "0" }, [], await loadMonth(h.src, h.year, h.month));
  if (gone.length) job!.done++;

  // Months whose fingerprint moved without any stored value changing: just remember the new fingerprint
  if (quietMonths.length) {
    for (const fp of quietMonths) {
      await db.execute(sql`UPDATE paybill_months SET row_count = ${fp.rows}, ora_hash = ${fp.hash}, synced_at = NOW()
        WHERE src = ${fp.src} AND yr_no = ${fp.year} AND mth_no = ${fp.month}`);
    }
  }

  job!.step = "Saving the report…";
  for (let i = 0; i < changes.length; i += 500) {
    const chunk = changes.slice(i, i + 500);
    await db.execute(sql`
      INSERT INTO paybill_changes (run_id, src, yr_no, mth_no, sal_code, ecode, line_no, kind, fields, new_row)
      VALUES ${sql.join(chunk.map((c) => sql`(${runId}, ${c.src}, ${c.yr_no}, ${c.mth_no}, ${c.sal_code}, ${c.ecode}, ${c.line_no},
        ${c.kind}, ${c.fields ? JSON.stringify(c.fields) : null}::jsonb, ${c.new_row ? JSON.stringify(c.new_row) : null}::jsonb)`), sql`, `)}`);
  }
  const count = (k: string) => changes.filter((c) => c.kind === k).length;
  const summary = {
    monthsChecked: fps.length, monthsDiffering: monthsSummary.filter((m) => m.changes > 0).length,
    added: count("added"), removed: count("removed"), changed: count("changed"),
    employees: new Set(changes.map((c) => c.ecode)).size, newMonths,
    months: monthsSummary.filter((m) => m.changes > 0),
  };
  await finishRun(runId, changes.length ? "report" : "done", summary);
}
const pick = (r: PbRow) => ({ src: r.src, yr_no: r.yr_no, mth_no: r.mth_no, sal_code: r.sal_code, ecode: r.ecode, line_no: r.line_no });

function startJob(kind: "new" | "check", email: string, work: (runId: number) => Promise<void>) {
  return (async () => {
    const runId = await startRun(kind, email);
    job = { runId, kind, step: "Starting…", done: 0, total: 0, startedAt: new Date().toISOString() };
    work(runId)
      .catch(async (e) => {
        console.error(`[Paybill] ${kind} run #${runId} failed:`, e);
        await finishRun(runId, "failed", {}, e?.message || String(e)).catch(() => {});
      })
      .finally(() => { job = null; });
    return runId;
  })();
}

// ── Search helpers ──────────────────────────────────────────────────────────
const ymOf = (s: unknown) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s || ""));
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function whereFor(q: Record<string, unknown>): SQL {
  const parts: SQL[] = [];
  const text = str(q.q);
  if (text) {
    if (/^\d{5,}$/.test(text)) parts.push(sql`p.ecode = ${text}`); // a full ECODE: index lookup
    else if (/^\d+$/.test(text)) parts.push(sql`p.ecode LIKE ${text + "%"}`);
    else parts.push(sql`p.ecode IN (SELECT epid FROM employees WHERE name ILIKE ${"%" + text.replace(/[\\%_]/g, (c) => "\\" + c) + "%"})`);
  }
  const from = ymOf(q.from), to = ymOf(q.to);
  if (from) parts.push(sql`(p.yr_no, p.mth_no) >= (${Math.floor(from / 100)}::smallint, ${from % 100}::smallint)`);
  if (to) parts.push(sql`(p.yr_no, p.mth_no) <= (${Math.floor(to / 100)}::smallint, ${to % 100}::smallint)`);
  const eq = (col: string, v: unknown) => { const s = str(v); if (s) parts.push(sql`${sql.raw("p." + col)} = ${s}`); };
  const salCode = Number(q.salCode);
  if (Number.isInteger(salCode) && salCode > 0) parts.push(sql`p.sal_code = ${salCode}`);
  eq("d_ast", q.dAst); eq("deptt", q.deptt); eq("desig_code", q.desig); eq("emp_cat", q.empCat); eq("sal_no", q.salNo);
  return parts.length ? sql`WHERE ${sql.join(parts, sql` AND `)}` : sql``;
}

const SORTS: Record<string, string> = {
  period_desc: "p.yr_no DESC, p.mth_no DESC, p.ecode, p.sal_code, p.line_no",
  period_asc: "p.yr_no, p.mth_no, p.ecode, p.sal_code, p.line_no",
  ecode: "p.ecode, p.yr_no DESC, p.mth_no DESC, p.sal_code, p.line_no",
  dast: "p.d_ast, p.yr_no DESC, p.mth_no DESC, p.ecode, p.sal_code, p.line_no",
  basic_desc: "p.basic_sal DESC NULLS LAST, p.yr_no DESC, p.mth_no DESC, p.ecode",
};

/** Designation names (latest Oracle employee snapshot) and department names (app) */
let lookupCache: { at: number; desig: Record<string, string>; dept: Record<string, string> } | null = null;
async function lookups() {
  if (lookupCache && Date.now() - lookupCache.at < 10 * 60_000) return lookupCache;
  const desig: Record<string, string> = {};
  const dept: Record<string, string> = {};
  try {
    const s = await db.execute(sql`
      SELECT DISTINCT x->>'desig_code' AS code, x->>'desig_name' AS name
      FROM oracle_snapshots, jsonb_array_elements(rows::jsonb) x
      WHERE id = (SELECT MAX(id) FROM oracle_snapshots) AND x->>'desig_name' IS NOT NULL`);
    for (const r of s.rows as any[]) if (r.code) desig[r.code] = r.name;
  } catch { /* no snapshot yet */ }
  try {
    const d = await db.execute(sql`SELECT dn.dept_code, d.name FROM department_names dn JOIN departments d ON d.id = dn.id WHERE dn.dept_code IS NOT NULL`);
    for (const r of d.rows as any[]) dept[String(r.dept_code).trim().toUpperCase()] = r.name;
  } catch { /* ignore */ }
  lookupCache = { at: Date.now(), desig, dept };
  return lookupCache;
}

const ROW_SELECT = sql`
  p.src, p.yr_no, p.mth_no, p.sal_code, p.ecode, p.line_no, p.cat_code, p.emp_cat, p.desig_code, p.deptt,
  p.basic_sal::float8 AS basic_sal, p.npa::float8 AS npa, p.da::float8 AS da, p.hra::float8 AS hra, p.ta::float8 AS ta,
  p.pat_care::float8 AS pat_care, p.nursing::float8 AS nursing, p.annual::float8 AS annual, p.d_ast,
  to_char(p.full_pay_fdate, 'YYYY-MM-DD') AS full_pay_fdate, to_char(p.full_pay_tdate, 'YYYY-MM-DD') AS full_pay_tdate,
  p.sal_no, p.grade_pay::float8 AS grade_pay, p.sal_flag,
  (SELECT e.name FROM employees e WHERE e.epid = p.ecode LIMIT 1) AS name`;

const adminEmail = (req: Request) => String((req as any).adminUser?.email || "unknown");

export function registerPaybillRoutes(app: Express, verifyAdminSession: any) {
  const guard = [verifyAdminSession, requireSettingsUnlock];

  // A run still "running" after a restart was cut off
  db.execute(sql`UPDATE paybill_runs SET status = 'failed', error = 'Interrupted (the app restarted)', finished_at = NOW()
    WHERE status = 'running'`).catch(() => {});

  app.get("/api/admin/paybill/status", ...guard, async (_req, res) => {
    try {
      const s = (await db.execute(sql`
        SELECT (SELECT COUNT(*) FROM paybill_months)::int AS months,
               (SELECT COALESCE(SUM(row_count), 0) FROM paybill_months)::int AS rows,
               (SELECT MIN(yr_no * 100 + mth_no) FROM paybill_months)::int AS first_ym,
               (SELECT MAX(yr_no * 100 + mth_no) FROM paybill_months)::int AS last_ym,
               (SELECT ${isoTime("MAX(synced_at)")} FROM paybill_months) AS last_sync`)).rows[0] as any;
      const runs = (await db.execute(sql`
        SELECT id, kind, status, ${isoTime("created_at")} AS created_at, created_by, ${isoTime("finished_at")} AS finished_at,
               summary, error, ${isoTime("applied_at")} AS applied_at, applied_by
        FROM paybill_runs ORDER BY id DESC LIMIT 20`)).rows;
      res.json({ job, stats: s, runs });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Could not read the paybill status" });
    }
  });

  app.post("/api/admin/paybill/new-months", ...guard, async (req, res) => {
    if (job) return res.status(409).json({ message: "Another paybill job is running. Wait for it to finish." });
    try {
      res.json({ runId: await startJob("new", adminEmail(req), runNewMonths) });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Could not start" });
    }
  });

  app.post("/api/admin/paybill/check", ...guard, async (req, res) => {
    if (job) return res.status(409).json({ message: "Another paybill job is running. Wait for it to finish." });
    try {
      const months = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM paybill_months`)).rows[0] as any;
      if (!months.n) return res.status(400).json({ message: "Nothing copied yet. Press “Add new months” first." });
      res.json({ runId: await startJob("check", adminEmail(req), runCheck) });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Could not start" });
    }
  });

  // Apply a check's report to the copy (only if the copy has not changed since)
  app.post("/api/admin/paybill/runs/:id/apply", ...guard, async (req, res) => {
    if (job) return res.status(409).json({ message: "A paybill job is running. Wait for it to finish." });
    const runId = Number(req.params.id);
    const email = adminEmail(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const run = (await client.query("SELECT id, kind, status, summary FROM paybill_runs WHERE id = $1 FOR UPDATE", [runId])).rows[0];
      if (!run) throw Object.assign(new Error("Run not found"), { status: 404 });
      if (run.kind !== "check" || run.status !== "report") throw Object.assign(new Error("Only a check with a report can be applied, once"), { status: 409 });
      const newer = (await client.query("SELECT 1 FROM paybill_runs WHERE id > $1 AND kind = 'check' AND status IN ('report','applied','done') LIMIT 1", [runId])).rows.length;
      if (newer) throw Object.assign(new Error("A newer check exists — apply that one instead"), { status: 409 });
      const months: any[] = run.summary?.months || [];
      for (const m of months) {
        const cur = (await client.query("SELECT row_count, ora_hash FROM paybill_months WHERE src = $1 AND yr_no = $2 AND mth_no = $3", [m.src, m.year, m.month])).rows[0];
        if (!cur || Number(cur.row_count) !== Number(m.oldRows) || String(cur.ora_hash) !== String(m.oldHash)) {
          throw Object.assign(new Error(`${monthLabel(m.year, m.month)} was changed here after this check. Run the check again.`), { status: 409 });
        }
      }
      const changes = (await client.query(
        "SELECT kind, src, yr_no, mth_no, sal_code, ecode, line_no, new_row FROM paybill_changes WHERE run_id = $1 ORDER BY id", [runId])).rows;
      const added: PbRow[] = [];
      for (const c of changes) {
        const key = [c.src.trim(), c.yr_no, c.mth_no, c.sal_code, c.ecode, c.line_no];
        if (c.kind === "removed" || c.kind === "changed") {
          await client.query("DELETE FROM paybill_history WHERE yr_no = $2 AND mth_no = $3 AND src = $1 AND sal_code = $4 AND ecode = $5 AND line_no = $6", key);
        }
        if (c.kind === "added" || c.kind === "changed") added.push(c.new_row);
      }
      await insertRows(client, added);
      for (const m of months) {
        if (m.rows === 0) {
          await client.query("DELETE FROM paybill_months WHERE src = $1 AND yr_no = $2 AND mth_no = $3", [m.src, m.year, m.month]);
        } else {
          await client.query("UPDATE paybill_months SET row_count = $4, ora_hash = $5, synced_at = NOW() WHERE src = $1 AND yr_no = $2 AND mth_no = $3",
            [m.src, m.year, m.month, m.rows, m.hash]);
        }
      }
      await client.query("UPDATE paybill_runs SET status = 'applied', applied_at = NOW(), applied_by = $2 WHERE id = $1", [runId, email]);
      await client.query("COMMIT");
      dataChanged();
      res.json({ ok: true, rows: changes.length });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[Paybill] apply failed:", e);
      res.status(e.status || 500).json({ message: e.message || "Apply failed — nothing was changed" });
    } finally {
      client.release();
    }
  });

  // What one check found
  app.get("/api/admin/paybill/runs/:id/changes", ...guard, async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const page = Math.max(0, Number(q.page) || 0);
    const size = Math.min(500, Math.max(10, Number(q.pageSize) || 100));
    const parts: SQL[] = [sql`c.run_id = ${Number(req.params.id)}`];
    if (str(q.ecode)) parts.push(sql`c.ecode LIKE ${str(q.ecode) + "%"}`);
    if (["added", "removed", "changed"].includes(str(q.kind))) parts.push(sql`c.kind = ${str(q.kind)}`);
    if (str(q.field)) parts.push(sql`c.fields @> ${JSON.stringify([{ field: str(q.field) }])}::jsonb`);
    const where = sql.join(parts, sql` AND `);
    try {
      const total = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM paybill_changes c WHERE ${where}`)).rows[0] as any;
      const rows = (await db.execute(sql`
        SELECT c.id, c.kind, c.src, c.yr_no, c.mth_no, c.sal_code, c.ecode, c.line_no, c.fields,
               (SELECT e.name FROM employees e WHERE e.epid = c.ecode LIMIT 1) AS name
        FROM paybill_changes c WHERE ${where}
        ORDER BY c.ecode, c.yr_no, c.mth_no, c.sal_code, c.line_no
        LIMIT ${size} OFFSET ${page * size}`)).rows;
      res.json({ total: total.n, rows });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Could not load the changes" });
    }
  });

  // Filter choices (worked out once, until the data changes)
  app.get("/api/admin/paybill/options", ...guard, async (_req, res) => {
    try {
      if (!optionsCache) {
        const col = async (c: string) => ((await db.execute(sql`
          SELECT ${sql.raw(c)} AS v, COUNT(*)::int AS n FROM paybill_history WHERE ${sql.raw(c)} IS NOT NULL
          GROUP BY ${sql.raw(c)} ORDER BY 1`)).rows as any[]).map((r) => ({ value: String(r.v), count: r.n }));
        const [dAst, deptt, desig, salNo, empCat, salCode] = await Promise.all(
          ["d_ast", "deptt", "desig_code", "sal_no", "emp_cat", "sal_code"].map(col));
        optionsCache = { at: Date.now(), data: { dAst, deptt, desig, salNo, empCat, salCode } };
      }
      const lk = await lookups();
      res.json({ ...optionsCache.data, desigNames: lk.desig, deptNames: lk.dept, salTypes: SAL_TYPES });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Could not load the filters" });
    }
  });

  // Search: rows for the filters, one page (or up to 100 000 for Excel)
  app.get("/api/admin/paybill/rows", ...guard, async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const exporting = q.export === "1";
    const size = exporting ? 100_000 : Math.min(500, Math.max(10, Number(q.pageSize) || 50));
    const page = exporting ? 0 : Math.max(0, Number(q.page) || 0);
    const where = whereFor(q);
    const order = sql.raw(SORTS[str(q.sort)] || SORTS.period_desc);
    try {
      // Totals depend only on the filters: worked out once per filter set (paging is then instant)
      const tKey = JSON.stringify(["q", "from", "to", "salCode", "dAst", "deptt", "desig", "empCat", "salNo"].map((k) => str(q[k])));
      let totals = totalsCache.get(tKey);
      if (!totals) {
        totals = (await db.execute(sql`
          SELECT COUNT(*)::int AS n, COUNT(DISTINCT p.ecode)::int AS employees,
                 SUM(p.basic_sal)::float8 AS basic_sal, SUM(p.da)::float8 AS da, SUM(p.hra)::float8 AS hra,
                 SUM(p.ta)::float8 AS ta, SUM(p.npa)::float8 AS npa
          FROM paybill_history p ${where}`)).rows[0] as any;
        if (totalsCache.size > 200) totalsCache.clear();
        totalsCache.set(tKey, totals);
      }
      if (exporting && totals.n > size) {
        return res.status(400).json({ message: `${totals.n.toLocaleString("en-IN")} rows match — narrow the filters to 1,00,000 rows or fewer for Excel.` });
      }
      const rows = (await db.execute(sql`
        SELECT ${ROW_SELECT} FROM paybill_history p ${where}
        ORDER BY ${order} LIMIT ${size} OFFSET ${page * size}`)).rows;
      res.json({ total: totals.n, employees: totals.employees, totals, rows });
    } catch (e: any) {
      console.error("[Paybill] search failed:", e);
      res.status(500).json({ message: e.message || "Search failed" });
    }
  });

  // One employee, every month
  app.get("/api/admin/paybill/employee/:ecode", ...guard, async (req, res) => {
    const ecode = String(req.params.ecode).trim();
    try {
      const rows = (await db.execute(sql`
        SELECT ${ROW_SELECT} FROM paybill_history p WHERE p.ecode = ${ecode}
        ORDER BY p.yr_no, p.mth_no, p.sal_code, p.line_no`)).rows;
      const changes = (await db.execute(sql`
        SELECT c.run_id, c.kind, c.yr_no, c.mth_no, c.sal_code, c.line_no, c.fields, r.status, ${isoTime("r.created_at")} AS created_at
        FROM paybill_changes c JOIN paybill_runs r ON r.id = c.run_id
        WHERE c.ecode = ${ecode} ORDER BY c.id DESC LIMIT 200`)).rows;
      res.json({ ecode, rows, changes });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Could not load the employee" });
    }
  });
}
