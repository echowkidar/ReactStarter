// ─────────────────────────────────────────────────────────────────────────────
// Live updates for department users
// ─────────────────────────────────────────────────────────────────────────────
// Department pages open one Server-Sent-Events connection:
//     GET /api/live/department/:id
// Whenever a request changes data (POST/PUT/PATCH/DELETE answered with 2xx) the
// departments affected by it are worked out and a small "change" signal is sent
// to just those departments. The signal carries NO data — the page simply
// re-fetches what it shows (see client/src/hooks/useDepartmentLiveUpdates.ts).
//
// Safety:
//  • Purely additive: nothing here changes how any existing request is handled.
//    All lookups run AFTER the response has been sent; every error is swallowed.
//  • When no department is connected, the middleware does nothing at all.
//  • Ping every 25 s keeps Cloudflare / proxies from closing the idle stream.
//  • The stream is never gzip-compressed (compression would buffer it).

import type { Express, Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";

const clients = new Map<number, Set<Response>>();
const PING_MS = 25_000;
const MAX_PER_DEPARTMENT = 50; // safety cap (many tabs/phones of one department)

export const LIVE_PATH_PREFIX = "/api/live/";

function clientCount(): number {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}

function send(res: Response, event: string, data: unknown) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    /* connection already gone — cleaned up on 'close' */
  }
}

function broadcast(departmentIds: Iterable<number>, payload: Record<string, unknown>) {
  for (const id of departmentIds) {
    const set = clients.get(id);
    if (!set || set.size === 0) continue;
    for (const res of set) send(res, "change", payload);
  }
}

function broadcastAll(payload: Record<string, unknown>) {
  broadcast(Array.from(clients.keys()), payload);
}

export function registerLiveUpdateStream(app: Express) {
  app.get("/api/live/department/:id", (req: Request, res: Response) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({ message: "Invalid department" });
    }

    let set = clients.get(departmentId);
    if (!set) {
      set = new Set();
      clients.set(departmentId, set);
    }
    if (set.size >= MAX_PER_DEPARTMENT) {
      // Drop the oldest connection instead of refusing the new one
      const oldest = set.values().next().value as Response | undefined;
      if (oldest) {
        set.delete(oldest);
        try { oldest.end(); } catch { /* ignore */ }
      }
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    // no-transform: compression and proxies must not buffer/alter the stream
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    req.socket.setKeepAlive?.(true);
    req.socket.setTimeout?.(0);

    // Reconnect after 5 s if the connection drops
    res.write(`retry: 5000\n`);
    send(res, "ready", { departmentId, t: Date.now() });
    set.add(res);

    const ping = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch { /* ignore */ }
    }, PING_MS);

    const cleanup = () => {
      clearInterval(ping);
      const s = clients.get(departmentId);
      if (s) {
        s.delete(res);
        if (s.size === 0) clients.delete(departmentId);
      }
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
  });
}

// ── Working out which departments a request affected ─────────────────────────

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Requests that never change department-visible data
const IGNORED_PREFIXES = [
  "/api/live/",
  "/api/admin/settings-pin",        // PIN checks change no shown data
  "/api/admin/oracle-sync/fetch",   // only stores an Oracle snapshot
  "/api/admin/oracle-sync/config",  // sync page settings only
  "/api/admin/oracle-sync/hidden",  // rows hidden on the sync page only
  "/api/admin/paybill",             // paybill history copy — not shown to departments
  "/api/heartbeat",
  "/api/visitors",
  "/api/auth",
  "/api/ocr-validate",
  "/api/upload",
  "/api/email",
  "/api/user-email",
  "/api/chat-webhook",
  "/api/admin/preferences",
  "/api/admin/lpc",
  "/api/admin/reset-login-lock",
  "/api/dispatch",
  "/api/admin/attendance/mark-exported",
  "/api/admin/attendance/bulk-export-date",
  "/api/admin/attendance/entry/", // Oracle export date — not shown to departments
];

// Changes that every department sees (field settings, notices, global permits…)
const GLOBAL_PREFIXES = [
  "/api/admin/settings",
  "/api/admin/attendance-toggle-all",
  "/api/notices",
  "/api/admin/salary-registers",
  "/api/admin/seed-salary-registers",
  "/api/admin/downloads",
  "/api/admin/oracle-sync/apply",   // may change many employees in many departments
  "/api/admin/oracle-sync/runs",    // undo
];

export interface ParsedChange {
  global: boolean;
  departmentIds: number[];
  employeeIds: number[];
  employeeEpids: string[];
  reportIds: number[];
  entryIds: number[];
  transferRequestIds: number[];
  reportingIds: number[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Pure: read IDs from the URL path and the request body. Exported for tests. */
export function parseChange(path: string, body: any): ParsedChange {
  const out: ParsedChange = {
    global: GLOBAL_PREFIXES.some((p) => path.startsWith(p)),
    departmentIds: [], employeeIds: [], employeeEpids: [], reportIds: [],
    entryIds: [], transferRequestIds: [], reportingIds: [],
  };
  const add = (arr: number[], v: unknown) => { const n = num(v); if (n !== null && !arr.includes(n)) arr.push(n); };
  let m: RegExpMatchArray | null;

  if ((m = path.match(/^\/api\/departments\/(\d+)(?:\/|$)/))) add(out.departmentIds, m[1]);
  // /api/employees/:id, /api/departments/:d/employees/:id, …/employees/:id/transfer, /remarks
  if ((m = path.match(/\/employees\/(\d+)(?:\/|$)/))) add(out.employeeIds, m[1]);
  if ((m = path.match(/^\/api\/external\/employees\/([^/]+)/))) out.employeeEpids.push(decodeURIComponent(m[1]));
  if ((m = path.match(/^\/api\/attendance\/entries\/(\d+)(?:\/|$)/))) add(out.entryIds, m[1]);
  else if ((m = path.match(/^\/api\/attendance\/(\d+)(?:\/|$)/))) add(out.reportIds, m[1]);
  if ((m = path.match(/^\/api\/admin\/attendance\/(\d+)(?:\/|$)/))) add(out.reportIds, m[1]);
  if ((m = path.match(/\/transfer-requests\/(\d+)(?:\/|$)/))) add(out.transferRequestIds, m[1]);
  if ((m = path.match(/\/reporting-employees\/(\d+)(?:\/|$)/))) add(out.reportingIds, m[1]);

  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const k of ["departmentId", "toDepartmentId", "fromDepartmentId", "targetDepartmentId", "hostDepartmentId", "parentDepartmentId"]) {
      add(out.departmentIds, body[k]);
    }
    add(out.employeeIds, body.employeeId);
    if (Array.isArray(body.entryIds)) body.entryIds.slice(0, 500).forEach((v: unknown) => add(out.entryIds, v));
    if (typeof body.epid === "string" && path.startsWith("/api/external/")) out.employeeEpids.push(body.epid);
  }
  return out;
}

async function rowsToIds(query: ReturnType<typeof sql>): Promise<number[]> {
  const r = await db.execute(query);
  const ids: number[] = [];
  for (const row of r.rows as any[]) {
    for (const v of Object.values(row)) {
      const n = num(v);
      if (n !== null && !ids.includes(n)) ids.push(n);
    }
  }
  return ids;
}

const list = (ids: number[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

async function departmentsOfEmployees(ids: number[], epids: string[]): Promise<number[]> {
  const out: number[] = [];
  if (ids.length) out.push(...await rowsToIds(sql`SELECT department_id FROM employees WHERE id IN (${list(ids)})`));
  if (epids.length) {
    out.push(...await rowsToIds(sql`SELECT department_id FROM employees WHERE epid IN (${sql.join(epids.map((e) => sql`${e}`), sql`, `)})`));
  }
  return out;
}

async function resolveAfter(c: ParsedChange): Promise<number[]> {
  const depts = new Set<number>(c.departmentIds);
  const addAll = (ids: number[]) => ids.forEach((i) => depts.add(i));

  addAll(await departmentsOfEmployees(c.employeeIds, c.employeeEpids));
  if (c.reportIds.length) {
    addAll(await rowsToIds(sql`SELECT department_id FROM attendance_reports WHERE id IN (${list(c.reportIds)})`));
  }
  if (c.entryIds.length) {
    addAll(await rowsToIds(sql`
      SELECT ar.department_id FROM attendance_entries ae
      JOIN attendance_reports ar ON ar.id = ae.report_id
      WHERE ae.id IN (${list(c.entryIds)})`));
  }
  if (c.transferRequestIds.length) {
    addAll(await rowsToIds(sql`SELECT from_department_id, to_department_id FROM transfer_requests WHERE id IN (${list(c.transferRequestIds)})`));
  }
  if (c.reportingIds.length) {
    try {
      addAll(await rowsToIds(sql`SELECT host_department_id, parent_department_id FROM reporting_employees WHERE id IN (${list(c.reportingIds)})`));
    } catch { /* table may not exist on older databases */ }
  }
  return Array.from(depts);
}

/**
 * Express middleware: after a successful data-changing request, signal the
 * affected departments. Must be registered AFTER the body parsers and BEFORE
 * the API routes.
 */
export function liveChangeMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING.has(req.method) || !req.path.startsWith("/api/")) return next();
  if (IGNORED_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  if (clientCount() === 0) return next();

  // Employees can move between departments (transfer, admin edit) → remember the
  // department they were in BEFORE the request, so both old and new departments update.
  const early = parseChange(req.path, req.body);
  const before = early.employeeIds.length || early.employeeEpids.length
    ? departmentsOfEmployees(early.employeeIds, early.employeeEpids).catch(() => [] as number[])
    : Promise.resolve([] as number[]);

  before.then((beforeDepts) => {
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      setImmediate(async () => {
        try {
          // Re-parse: multipart bodies (multer) are only available after the handler ran
          const c = parseChange(req.path, req.body);
          if (c.global) {
            broadcastAll({ t: Date.now(), scope: "all" });
            return;
          }
          const after = await resolveAfter(c);
          const targets = new Set<number>([...beforeDepts, ...after]);
          if (targets.size === 0) return;
          broadcast(targets, {
            t: Date.now(),
            employeeIds: c.employeeIds,
            reportIds: c.reportIds,
          });
        } catch (err) {
          console.error("[LiveUpdates] could not resolve departments:", err);
        }
      });
    });
    next();
  });
}
