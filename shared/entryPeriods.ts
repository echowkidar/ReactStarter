// One attendance_entries row per period
// ─────────────────────────────────────────────────────────────────────────────
// Reports saved from now on store every period of an employee in its OWN row
// (its `periods` JSON then holds just that one period). This lets the admin keep
// noting, "verified" and "exported to Oracle" separately for each period.
//
// Older reports keep one row per employee with several periods in `periods`.
// Both kinds are read the same way: department-facing screens (edit form,
// report details, print) join the rows of an employee back together with
// groupEntriesByEmployee(), so they look exactly as before.
//
// A period that starts before the report month and runs into it is saved as two
// periods: the earlier part and the report-month part (splitPeriodAtMonthStart),
// so the earlier part can be paid in a mid-month supplementary payment and the
// report-month part at the month end.

export type PeriodLike = { fromDate: string; toDate: string; days?: number; remarks?: string; [k: string]: any };

const pad = (n: number) => String(n).padStart(2, "0");

/** "DD-MM-YY" or "DD-MM-YYYY" → day number (UTC days since epoch), or null. */
export function periodDateToDayNumber(dateStr: string): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [d, m, yRaw] = parts;
  const y = yRaw < 100 ? 2000 + yRaw : yRaw;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** day number → "DD-MM-YY" (the format stored in the periods JSON) */
function dayNumberToPeriodDate(dayNo: number): string {
  const dt = new Date(dayNo * 86400000);
  return `${pad(dt.getUTCDate())}-${pad(dt.getUTCMonth() + 1)}-${String(dt.getUTCFullYear()).slice(-2)}`;
}

/** Calendar days in a period, both ends included (same as the attendance form). */
export function calendarDays(fromDate: string, toDate: string): number | null {
  const a = periodDateToDayNumber(fromDate);
  const b = periodDateToDayNumber(toDate);
  if (a == null || b == null || b < a) return null;
  return b - a + 1;
}

/**
 * Split a period that starts before the report month and ends in (or after) it:
 *   16-07-26 to 31-10-26 (108), report October 2026
 *   → 16-07-26 to 30-09-26 (77) + 01-10-26 to 31-10-26 (31)
 * Only when its days are the calendar days of the period (days the form calculates
 * itself). Hand-entered days (Guest Teacher / Faculty) can't be divided, so such a
 * period is returned unchanged. Remarks stay on both parts.
 */
export function splitPeriodAtMonthStart<P extends PeriodLike>(period: P, month: number, year: number): P[] {
  const from = periodDateToDayNumber(period.fromDate);
  const to = periodDateToDayNumber(period.toDate);
  if (from == null || to == null || to < from) return [period];
  if (!month || !year) return [period];

  const monthStart = Math.round(Date.UTC(year, month - 1, 1) / 86400000);
  if (!(from < monthStart && to >= monthStart)) return [period];
  if (Number(period.days) !== to - from + 1) return [period];

  const earlier = { ...period, toDate: dayNumberToPeriodDate(monthStart - 1), days: monthStart - from };
  const current = { ...period, fromDate: dayNumberToPeriodDate(monthStart), days: to - monthStart + 1 };
  return [earlier, current];
}

/** Guest Teacher / Guest Faculty enter their days by hand → never split. */
export function isHandEnteredDaysDesignation(designation?: string | null): boolean {
  const d = String(designation || "").trim().toUpperCase();
  return d === "GUEST TEACHER" || d === "GUEST FACULTY";
}

const parsePeriods = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
};

/**
 * Join the rows of the same employee (same report) into one entry, for screens
 * that show one line per employee (edit form, report details, print, Excel).
 * Old one-row-per-employee data passes through unchanged.
 * Employee order = order of the employee's first row; periods inside an employee
 * follow row id. `periods` keeps the type it came in (JSON string or array).
 * The joined entry also carries `entryIds` (all row ids of that employee).
 */
export function groupEntriesByEmployee<E extends { id?: number; employeeId?: number; periods?: any; [k: string]: any }>(entries: E[] | null | undefined): (E & { entryIds: number[] })[] {
  const list = Array.isArray(entries) ? entries : [];
  const groups = new Map<string, E[]>();
  for (const e of list) {
    const key = `${(e as any).reportId ?? ""}|${e.employeeId ?? ""}|${(e as any).reportingEmployeeId ?? ""}`;
    const g = groups.get(key);
    if (g) g.push(e); else groups.set(key, [e]);
  }

  const out: (E & { entryIds: number[] })[] = [];
  for (const rows of groups.values()) {
    if (rows.length === 1) {
      out.push({ ...rows[0], entryIds: rows[0].id != null ? [rows[0].id] : [] });
      continue;
    }
    const sorted = [...rows].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const first = sorted[0];
    const periods = sorted.flatMap(r => parsePeriods(r.periods));
    const last = periods[periods.length - 1];
    out.push({
      ...first,
      periods: typeof first.periods === "string" ? JSON.stringify(periods) : periods,
      days: periods.reduce((s, p) => s + (Number(p?.days) || 0), 0),
      fromDate: periods[0]?.fromDate ?? (first as any).fromDate,
      toDate: last?.toDate ?? (first as any).toDate,
      remarks: periods.map(p => p?.remarks).filter(Boolean).join("; "),
      entryIds: sorted.map(r => r.id).filter((id): id is number => id != null),
    });
  }
  return out;
}
