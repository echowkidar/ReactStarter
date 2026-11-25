/**
 * Wages payroll for wage / fund staff (letter EPIDs, e.g. R0001).
 * Rules: Finance Officer's circular D.No.1073/FO/A/cs dated 06.11.2026 and the legal opinion
 * of 28.10.2026 (EPF / ESI on enhanced daily wages w.e.f. 01.11.2026).
 *
 *  Gross   = (Basic + VDA per day) × days worked
 *  EPF     = 12% of min(Gross, EPF ceiling)            — employee, when EPF applies
 *            employer 13% (EPS 8.33% + EPF 3.67% + EDLI 0.5% + admin 0.5%)
 *  ESI     = 0.75% of Gross                            — employee, when ESI applies and Gross
 *            employer 3.25%                              ≤ ceiling (or already covered this period)
 *  MAS     = fixed amount                              — when the employee is a MAS member
 *  Net     = Gross − EPF − ESI − MAS
 *
 * All money is worked out in paise with integer arithmetic, so 12% of ₹17,600 is exactly
 * ₹2,112 (no floating-point surprises), then rounded to whole rupees by the chosen rule.
 * Pure functions only: used by the server (to save) and the browser (live preview).
 */

export const WAGE_CATEGORIES = ["clerical_skilled", "semi_skilled", "unskilled"] as const;
export type WageCategory = (typeof WAGE_CATEGORIES)[number];

export const WAGE_CATEGORY_LABELS: Record<WageCategory, string> = {
  clerical_skilled: "Clerical / Skilled",
  semi_skilled: "Semi-skilled",
  unskilled: "Unskilled",
};

export type DayRate = { basic: number; vda: number };

/** Daily rates per category, in force from `from` (YYYY-MM-DD) onwards */
export type WageRateSet = { from: string } & Record<WageCategory, DayRate>;

export type Rounding = "up" | "nearest";

/** EPF / ESI / MAS rates and ceilings, in force from `from` (YYYY-MM-DD) onwards */
export type StatutorySet = {
  from: string;
  epfEmployeePct: number;   // 12
  epsPct: number;           // 8.33  (employer → pension)
  epfEmployerPct: number;   // 3.67  (employer → EPF account)
  edliPct: number;          // 0.5
  epfAdminPct: number;      // 0.5
  epfCeiling: number;       // 25000 (Basic + DA per month)
  esiEmployeePct: number;   // 0.75
  esiEmployerPct: number;   // 3.25
  esiCeiling: number;       // 21000 (gross per month)
  masAmount: number;        // 125
  rounding: Rounding;       // "up" = next whole rupee (as in the Accounts Section sheet)
};

export const DEFAULT_WAGE_RATES: WageRateSet[] = [{
  from: "2026-11-01",
  clerical_skilled: { basic: 579, vda: 354 },
  semi_skilled: { basic: 494, vda: 300 },
  unskilled: { basic: 437, vda: 267 },
}];

export const DEFAULT_STATUTORY: StatutorySet[] = [{
  from: "2026-11-01",
  epfEmployeePct: 12, epsPct: 8.33, epfEmployerPct: 3.67, edliPct: 0.5, epfAdminPct: 0.5,
  epfCeiling: 25000,
  esiEmployeePct: 0.75, esiEmployerPct: 3.25, esiCeiling: 21000,
  masAmount: 125,
  rounding: "up",
}];

/** The set in force on a date (latest `from` ≤ date); the earliest set when none is yet in force */
export function inForceOn<T extends { from: string }>(sets: readonly T[], date: string): T | null {
  const sorted = [...sets].sort((a, b) => a.from.localeCompare(b.from));
  let found: T | null = null;
  for (const s of sorted) if (s.from <= date) found = s;
  return found ?? sorted[0] ?? null;
}

/** First day of a wage month as YYYY-MM-DD (month 1–12) */
export function monthStart(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Guess the wage category from a designation ("DAILY WAGE (UN-SKILLED)" → unskilled) */
export function categoryFromDesignation(designation: string | null | undefined): WageCategory | null {
  const d = String(designation ?? "").toUpperCase().replace(/[\s\-_]+/g, "");
  if (!d) return null;
  if (d.includes("UNSKILLED")) return "unskilled";
  if (d.includes("SEMISKILLED")) return "semi_skilled";
  if (d.includes("SKILLED") || d.includes("CLERICAL")) return "clerical_skilled";
  return null;
}

// ── Money helpers (paise, integers) ─────────────────────────────────────────

const toPaise = (rupees: number) => Math.round(Number(rupees || 0) * 100);
/** Percent as an integer of 1/100th percent: 8.33% → 833 */
const pctBp = (pct: number) => Math.round(Number(pct || 0) * 100);

/** pct of an amount in paise, rounded to whole rupees by the rule */
function pctRupees(amountPaise: number, pct: number, rounding: Rounding): number {
  // amountPaise × bp / 10000 = paise; / 100 = rupees  →  divide by 1,000,000
  const n = amountPaise * pctBp(pct);
  const D = 1_000_000;
  const q = Math.floor(n / D);
  const r = n - q * D;
  if (rounding === "up") return r > 0 ? q + 1 : q;
  return r * 2 >= D ? q + 1 : q; // nearest, .5 up
}

/** Whole rupees from paise by the rule */
function rupees(paise: number, rounding: Rounding): number {
  const q = Math.floor(paise / 100);
  const r = paise - q * 100;
  if (rounding === "up") return r > 0 ? q + 1 : q;
  return r >= 50 ? q + 1 : q;
}

// ── Line calculation ───────────────────────────────────────────────────────

export type LineInput = {
  basic: number;              // per day
  vda: number;                // per day
  days: number;
  epf: boolean;               // EPF applies to this employee (this month)
  esi: boolean;               // ESI applies
  esiCovered?: boolean;       // already covered in the current ESI contribution period
  mas: boolean;               // MAS member
};

export type LineResult = {
  ratePerDay: number;
  gross: number;
  epfBase: number;            // EPF wages (capped)
  epf: number;                // employee EPF
  esiBase: number;            // ESI wages (0 when ESI does not apply)
  esi: number;                // employee ESI
  mas: number;
  totalDeductions: number;
  net: number;
  // employer's share (University's liability, met from the fund)
  erEps: number;              // 8.33%
  erEpf: number;              // 12% − EPS (to the EPF account)
  erEdli: number;
  erAdmin: number;
  erEpfTotal: number;         // ~13%, rounded once on the total (as in the sheet)
  erEsi: number;
  esiAboveCeiling: boolean;   // gross > ESI ceiling (ESI applied only because covered)
};

export function calculateLine(input: LineInput, s: StatutorySet): LineResult {
  const days = Math.max(0, Number(input.days) || 0);
  const ratePaise = toPaise(input.basic) + toPaise(input.vda);
  const grossPaise = ratePaise * days;
  const gross = rupees(grossPaise, s.rounding);
  const grossP = gross * 100;

  let epfBase = 0, epf = 0, erEps = 0, erEpf = 0, erEdli = 0, erAdmin = 0, erEpfTotal = 0;
  if (input.epf && gross > 0) {
    epfBase = Math.min(gross, s.epfCeiling);
    const baseP = epfBase * 100;
    epf = pctRupees(baseP, s.epfEmployeePct, s.rounding);
    erEps = pctRupees(baseP, s.epsPct, s.rounding);
    const erTwelve = pctRupees(baseP, s.epsPct + s.epfEmployerPct, s.rounding);
    erEpf = Math.max(0, erTwelve - erEps);
    erEdli = pctRupees(baseP, s.edliPct, s.rounding);
    erAdmin = pctRupees(baseP, s.epfAdminPct, s.rounding);
    erEpfTotal = pctRupees(baseP, s.epsPct + s.epfEmployerPct + s.edliPct + s.epfAdminPct, s.rounding);
  }

  const esiAboveCeiling = gross > s.esiCeiling;
  let esiBase = 0, esi = 0, erEsi = 0;
  if (input.esi && gross > 0 && (!esiAboveCeiling || input.esiCovered)) {
    esiBase = gross;
    esi = pctRupees(grossP, s.esiEmployeePct, s.rounding);
    erEsi = pctRupees(grossP, s.esiEmployerPct, s.rounding);
  }

  const mas = input.mas && gross > 0 ? Math.round(s.masAmount) : 0;
  const totalDeductions = epf + esi + mas;
  return {
    ratePerDay: ratePaise / 100,
    gross, epfBase, epf, esiBase, esi, mas, totalDeductions,
    net: gross - totalDeductions,
    erEps, erEpf, erEdli, erAdmin, erEpfTotal, erEsi,
    esiAboveCeiling: input.esi && esiAboveCeiling,
  };
}

// ── Validation of settings (server side) ───────────────────────────────────

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function validateWageRates(sets: unknown): string | null {
  if (!Array.isArray(sets) || sets.length === 0) return "Add at least one set of rates.";
  const seen = new Set<string>();
  for (const s of sets as any[]) {
    if (!isDate(s?.from)) return "Every rate set needs a From date.";
    if (seen.has(s.from)) return `Two rate sets start on ${s.from}.`;
    seen.add(s.from);
    for (const c of WAGE_CATEGORIES) {
      if (!num(s?.[c]?.basic) || !num(s?.[c]?.vda)) return `${WAGE_CATEGORY_LABELS[c]}: Basic and VDA must be numbers (from ${s.from}).`;
      if (s[c].basic + s[c].vda <= 0) return `${WAGE_CATEGORY_LABELS[c]}: rate per day cannot be 0 (from ${s.from}).`;
    }
  }
  return null;
}

export function validateStatutory(sets: unknown): string | null {
  if (!Array.isArray(sets) || sets.length === 0) return "Add at least one set of EPF / ESI rates.";
  const seen = new Set<string>();
  const keys: (keyof StatutorySet)[] = ["epfEmployeePct", "epsPct", "epfEmployerPct", "edliPct", "epfAdminPct",
    "epfCeiling", "esiEmployeePct", "esiEmployerPct", "esiCeiling", "masAmount"];
  for (const s of sets as any[]) {
    if (!isDate(s?.from)) return "Every set needs a From date.";
    if (seen.has(s.from)) return `Two sets start on ${s.from}.`;
    seen.add(s.from);
    for (const k of keys) if (!num(s?.[k])) return `${String(k)} must be a number (from ${s.from}).`;
    if (s.epfEmployeePct > 100 || s.esiEmployeePct > 100) return "A percentage cannot be above 100.";
    if (s.rounding !== "up" && s.rounding !== "nearest") return "Rounding must be 'up' or 'nearest'.";
  }
  return null;
}

// ── Employee payroll fields (forms send FormData strings) ──────────────────

export const PAYROLL_EMPLOYEE_FIELDS = ["wageCategory", "epfApplicable", "uanNo", "esiApplicable", "esiNo", "esiCovered", "masApplicable", "fundCode"] as const;

/** "true" / "on" / "1" → true, "false" / "0" → false, "" / null → null */
export function toFlag(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "on" || v === "1" || v === 1) return true;
  if (v === false || v === "false" || v === "0" || v === 0) return false;
  return null;
}

/**
 * Normalise the payroll fields present in an employee create / update body (in place).
 * For a numeric EPID they are cleared (payroll is only for letter EPIDs).
 * Returns an error message for a bad UAN / ESI number / category, else null.
 */
export function normalizePayrollFields(body: Record<string, any>, letterEpid: boolean): string | null {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  if (!letterEpid) {
    for (const k of PAYROLL_EMPLOYEE_FIELDS) if (has(k)) body[k] = null;
    return null;
  }
  for (const k of ["epfApplicable", "esiApplicable", "esiCovered", "masApplicable"]) if (has(k)) body[k] = toFlag(body[k]);
  if (has("wageCategory")) {
    const c = String(body.wageCategory ?? "").trim();
    if (c && !(WAGE_CATEGORIES as readonly string[]).includes(c)) return "Wage category must be Clerical / Skilled, Semi-skilled or Unskilled";
    body.wageCategory = c || null;
  }
  if (has("uanNo")) {
    const u = String(body.uanNo ?? "").replace(/\s+/g, "");
    if (u && !/^\d{12}$/.test(u)) return "UAN must be 12 digits";
    body.uanNo = u || null;
  }
  if (has("esiNo")) {
    const e = String(body.esiNo ?? "").replace(/\s+/g, "");
    if (e && !/^\d{10}$/.test(e)) return "ESI number (IP number) must be 10 digits";
    body.esiNo = e || null;
  }
  if (has("fundCode")) {
    const f = String(body.fundCode ?? "").replace(/\s+/g, "").toUpperCase();
    if (f && !/^[A-Z0-9/-]{3,20}$/.test(f)) return "Payment Code of the fund is not valid";
    body.fundCode = f || null;
  }
  if (has("bankBranch")) body.bankBranch = String(body.bankBranch ?? "").replace(/\s+/g, " ").trim().slice(0, 100) || null;
  // IFSC: normalised only (old records may hold odd values; the forms and the import check the format)
  if (has("ifsc")) body.ifsc = String(body.ifsc ?? "").replace(/\s+/g, "").toUpperCase() || null;
  return null;
}

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** "Yes" / "Y" / "True" / "1" → true, "No" / "N" / "False" / "0" → false, empty → null (Excel import) */
export function yesNo(v: unknown): boolean | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["yes", "y", "true", "1", "on", "haan", "ha"].includes(s)) return true;
  if (["no", "n", "false", "0", "off", "nahi"].includes(s)) return false;
  return null;
}

/** Default printed Payment Head of a fund */
export const defaultHeadName = (fundName: string) => `Revolving Fund of ${String(fundName || "").trim()}`;

/** Clean a list of sets, sorted by From date */
export function sortSets<T extends { from: string }>(sets: T[]): T[] {
  return [...sets].sort((a, b) => a.from.localeCompare(b.from));
}
