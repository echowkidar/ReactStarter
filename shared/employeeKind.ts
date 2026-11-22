/**
 * Two kinds of employees, told apart by the EPID:
 *  - numeric EPID (e.g. 24600, 00125): regular staff, salary made by the Salary Section.
 *  - letter EPID (1 letter + 4 digits, e.g. R0001, S0055): wage / fund staff whose salary is
 *    made by the Accounts, Bill or Students Section. They are always on a term.
 * Each kind has its own employment statuses and dealing assistants. Used by forms and server.
 */

export const REGULAR_STATUSES = [
  "Permanent",
  "Probation",
  "Temporary",
  "Court Case",
  "Compensation",
  "Till Further Order",
] as const;

export const FUND_STATUSES = [
  "Revolving Fund",
  "Bill",
  "Student Fund",
  "Kishanganj",
  "Murshidabad",
  "Malappuram",
  "Other Fund",
] as const;

export const ALL_STATUSES = [...REGULAR_STATUSES, ...FUND_STATUSES] as const;

/** Dealing assistants used only for letter-EPID employees (section codes) */
export const FUND_DEALING_ASSISTANTS = [
  { value: "ACC", label: "ACC - Accounts Section" },
  { value: "BIL", label: "BIL - Bill Section" },
  { value: "STU", label: "STU - Students Section" },
  { value: "OTH", label: "OTH - Others" },
] as const;
export const FUND_DEALING_ASSISTANT_CODES: string[] = FUND_DEALING_ASSISTANTS.map((d) => d.value);

/** EPID starts with a letter (R0001) → wage / fund employee */
export function isLetterEpid(epid: string | null | undefined): boolean {
  return /^[A-Za-z]/.test(String(epid ?? "").trim());
}

/** Accepted EPID formats: 5 digits, or 1 letter + 4 digits */
export function isValidEpid(epid: string | null | undefined): boolean {
  const e = String(epid ?? "").trim();
  return /^\d{5}$/.test(e) || /^[A-Za-z]\d{4}$/.test(e);
}
export const EPID_FORMAT_MESSAGE = "EPID must be 5 digits (e.g. 24600) or 1 letter + 4 digits (e.g. R0001)";

export function statusesForEpid(epid: string | null | undefined): readonly string[] {
  return isLetterEpid(epid) ? FUND_STATUSES : REGULAR_STATUSES;
}

/** Term Expiry is shown for letter EPIDs (always) and for Temporary / Probation */
export function showsTermExpiry(epid: string | null | undefined, status: string | null | undefined): boolean {
  return isLetterEpid(epid) || status === "Temporary" || status === "Probation";
}

/** Statuses that carry a term (used where only the status is known, e.g. report tables) */
export function isTermedStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "temporary" || s === "probation" || FUND_STATUSES.some((f) => f.toLowerCase() === s);
}

/** Term Expiry must be filled for letter EPIDs */
export function requiresTermExpiry(epid: string | null | undefined): boolean {
  return isLetterEpid(epid);
}

/** Is this dealing assistant code allowed for this EPID kind? (blank is not judged here) */
export function dealingAssistantAllowed(epid: string | null | undefined, code: string | null | undefined): boolean {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return true;
  return isLetterEpid(epid) ? FUND_DEALING_ASSISTANT_CODES.includes(c) : !FUND_DEALING_ASSISTANT_CODES.includes(c);
}

/** Filter a dealing-assistant option list (value = code) for this EPID kind */
export function dealingAssistantOptionsFor<T extends { value: string }>(
  epid: string | null | undefined,
  regular: readonly T[],
): { value: string; label: string }[] {
  if (isLetterEpid(epid)) return FUND_DEALING_ASSISTANTS.map((d) => ({ ...d }));
  return regular.filter((o) => !FUND_DEALING_ASSISTANT_CODES.includes(o.value)) as any;
}

/** Case-insensitive match of a status to its canonical spelling (null if unknown) */
export function canonicalStatus(val: string | null | undefined): string | null {
  const v = String(val ?? "").trim().toLowerCase();
  return (ALL_STATUSES as readonly string[]).find((s) => s.toLowerCase() === v) ?? null;
}

/**
 * Server check of the EPID-kind rules. `rec` is the employee as it will be saved;
 * `changed` names the fields being set now (on create: all). Fields that are not
 * changing are not judged, so old records can still be edited in other ways.
 * Returns an error message, or null when fine.
 */
export function employeeKindError(
  rec: { epid?: any; employmentStatus?: any; salary_asstt?: any; termExpiry?: any },
  changed: (field: "epid" | "employmentStatus" | "salary_asstt" | "termExpiry") => boolean,
): string | null {
  const epid = String(rec.epid ?? "").trim();
  if (changed("epid") && !isValidEpid(epid)) return EPID_FORMAT_MESSAGE;
  const letter = isLetterEpid(epid);
  if (changed("epid") || changed("employmentStatus")) {
    const st = canonicalStatus(rec.employmentStatus);
    if (!st || !statusesForEpid(epid).includes(st)) {
      return letter
        ? `Employment Status for an EPID starting with a letter must be one of: ${FUND_STATUSES.join(", ")}`
        : `Employment Status must be one of: ${REGULAR_STATUSES.join(", ")}`;
    }
  }
  if ((changed("epid") || changed("salary_asstt")) && !dealingAssistantAllowed(epid, rec.salary_asstt)) {
    return letter
      ? `Dealing Assistant for an EPID starting with a letter must be one of: ${FUND_DEALING_ASSISTANT_CODES.join(", ")}`
      : `Dealing Assistant ${String(rec.salary_asstt).toUpperCase()} is only for EPIDs starting with a letter`;
  }
  if (letter && (changed("epid") || changed("employmentStatus") || changed("termExpiry"))) {
    if (!String(rec.termExpiry ?? "").trim()) return "Term Expiry date is required for an EPID starting with a letter";
  }
  return null;
}
