// Children Education Allowance — what the Salary Section keeps for it:
//   • the rates, each for a span of dates (from – to),
//   • the list of schools (with what the Directorate of School Education said
//     about their recognition).
// The CEA claim form itself reads these; they are edited on the admin Claim Forms page.
// Registered BEFORE the claim-form routes, so "/api/admin/claim-forms/cea-…" is not
// taken for a claim id.
import type { Express, Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionAdmin } from "./auth";
import { type CeaRate, ceaRateOn } from "@shared/claimForms";
export { type CeaRate, ceaRateOn };

const isDay = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(String(v)));
const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const isSuper = (admin: any) => ["super", "super_admin", "superadmin"].includes(admin?.role) || admin?.email === "admin@amu.ac.in";

export async function ceaRates(): Promise<CeaRate[]> {
  const r = await db.execute(sql`SELECT value FROM app_settings WHERE key = 'cea_rates'`);
  try {
    const list = JSON.parse(String((r.rows[0] as any)?.value || "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, _next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error: any) {
    console.error("[CEA settings]", req.method, req.path, error);
    if (!res.headersSent) res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

const SCHOOL_COLUMNS = sql`id, name, place, location, status, dse_reference AS "dseReference", session, is_active AS "isActive"`;
const LOCATIONS = ["aligarh", "outside"];
const STATUSES = ["recognised", "not_recognised", "unknown"];

function schoolFrom(body: any): { value?: Record<string, any>; error?: string } {
  const name = clean(body?.name).replace(/\s+/g, " ");
  if (name.length < 4 || name.length > 150) return { error: "Please enter the name of the school." };
  const location = clean(body?.location);
  if (!LOCATIONS.includes(location)) return { error: "Please choose whether the school is in Aligarh or outside." };
  const status = clean(body?.status) || "unknown";
  if (!STATUSES.includes(status)) return { error: "Unknown recognition status." };
  return {
    value: {
      name, location, status,
      place: clean(body?.place).slice(0, 100),
      dseReference: clean(body?.dseReference).slice(0, 120),
      session: clean(body?.session).slice(0, 20),
      isActive: body?.isActive !== false,
    },
  };
}

export function registerCeaSettingsRoutes(app: Express) {
  // ── Rates ──────────────────────────────────────────────────────────────────
  app.get("/api/admin/claim-forms/cea-rates", wrap(async (_req, res) => {
    res.json({ rates: await ceaRates() });
  }));

  app.post("/api/admin/claim-forms/cea-rates", wrap(async (req, res) => {
    if (!isSuper(await sessionAdmin(req))) return res.status(403).json({ message: "Only a super admin can change the rates." });
    const list = Array.isArray(req.body?.rates) ? req.body.rates : [];
    const rates: CeaRate[] = [];
    for (const x of list) {
      const from = clean(x?.from), to = clean(x?.to);
      const cea = Number(x?.cea), hostel = Number(x?.hostel), disabled = Number(x?.disabled);
      if (!isDay(from)) return res.status(400).json({ message: "Each rate needs a From date." });
      if (to && (!isDay(to) || to < from)) return res.status(400).json({ message: "A To date cannot be before its From date." });
      for (const n of [cea, hostel, disabled]) {
        if (!(n >= 0 && n < 10_000_000)) return res.status(400).json({ message: "Please enter the three amounts of each rate (0 if not applicable)." });
      }
      if (!(cea > 0)) return res.status(400).json({ message: "The CEA amount of a rate cannot be zero." });
      const round = (n: number) => Math.round(n * 100) / 100;
      rates.push({ from, to, cea: round(cea), hostel: round(hostel), disabled: round(disabled) });
    }
    rates.sort((a, b) => a.from.localeCompare(b.from));
    // spans must not overlap; only the last one may be open-ended
    for (let i = 0; i < rates.length - 1; i++) {
      if (!rates[i].to) return res.status(400).json({ message: "Only the latest rate can be left without a To date." });
      if (rates[i].to >= rates[i + 1].from) return res.status(400).json({ message: "Two rates overlap. Each date can have only one rate." });
    }
    await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES ('cea_rates', ${JSON.stringify(rates)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    res.json({ rates });
  }));

  // ── Schools ────────────────────────────────────────────────────────────────
  app.get("/api/admin/claim-forms/cea-schools", wrap(async (_req, res) => {
    const r = await db.execute(sql`SELECT ${SCHOOL_COLUMNS} FROM cea_schools ORDER BY LOWER(name)`);
    res.json(r.rows);
  }));

  app.post("/api/admin/claim-forms/cea-schools", wrap(async (req, res) => {
    const { value: v, error } = schoolFrom(req.body);
    if (!v) return res.status(400).json({ message: error });
    const same = await db.execute(sql`
      SELECT 1 FROM cea_schools WHERE location = ${v.location}
        AND regexp_replace(LOWER(name), '[^a-z0-9]', '', 'g') = regexp_replace(LOWER(${v.name}), '[^a-z0-9]', '', 'g') LIMIT 1`);
    if (same.rows.length) return res.status(409).json({ message: "This school is already in the list." });
    const admin = await sessionAdmin(req);
    const r = await db.execute(sql`
      INSERT INTO cea_schools (name, place, location, status, dse_reference, session, is_active, updated_by)
      VALUES (${v.name}, ${v.place}, ${v.location}, ${v.status}, ${v.dseReference}, ${v.session}, ${v.isActive}, ${admin?.email || "admin"})
      RETURNING ${SCHOOL_COLUMNS}`);
    res.status(201).json(r.rows[0]);
  }));

  app.put("/api/admin/claim-forms/cea-schools/:schoolId", wrap(async (req, res) => {
    const id = Number(req.params.schoolId);
    const { value: v, error } = schoolFrom(req.body);
    if (!v) return res.status(400).json({ message: error });
    const admin = await sessionAdmin(req);
    const r = await db.execute(sql`
      UPDATE cea_schools SET name = ${v.name}, place = ${v.place}, location = ${v.location}, status = ${v.status},
        dse_reference = ${v.dseReference}, session = ${v.session}, is_active = ${v.isActive},
        updated_by = ${admin?.email || "admin"}, updated_at = NOW()
      WHERE id = ${Number.isFinite(id) ? id : -1}
      RETURNING ${SCHOOL_COLUMNS}`);
    if (!r.rows.length) return res.status(404).json({ message: "School not found." });
    res.json(r.rows[0]);
  }));
}
