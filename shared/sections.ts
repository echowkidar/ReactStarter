/**
 * Sections that make salaries / wages, and which attendance they handle.
 *  - salary:   regular staff (numeric EPID) — reports of type 'regular' and 'reporting'.
 *  - accounts / bill / students: staff paid from Revolving Funds or Other Similar Funds (letter EPID) — reports of type 'fund',
 *    split by the employee's dealing assistant code (accounts also handles OTH).
 * A section login is an admin with role "salary" and user code ACC, BIL or STU.
 */

export type SectionKey = "salary" | "accounts" | "bill" | "students";

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "salary", label: "Salary Section" },
  { key: "accounts", label: "Accounts Section" },
  { key: "bill", label: "Bill Section" },
  { key: "students", label: "Students Section" },
];

export const FUND_REPORT_TYPE = "fund";
export const FUND_REPORT_LABEL = "Revolving Funds or Other Similar Funds";

const CODES: Record<Exclude<SectionKey, "salary">, string[]> = {
  accounts: ["ACC", "OTH"],
  bill: ["BIL"],
  students: ["STU"],
};

/** Dealing assistant codes of a fund section (empty for salary = not limited by these codes) */
export function sectionCodes(section: SectionKey): string[] {
  return section === "salary" ? [] : CODES[section];
}

/** The section a section-login admin belongs to (by user code); everyone else → salary */
export function sectionOfAdmin(userCode: string | null | undefined): SectionKey {
  const c = String(userCode ?? "").trim().toUpperCase();
  if (c === "ACC") return "accounts";
  if (c === "BIL") return "bill";
  if (c === "STU") return "students";
  return "salary";
}

export function isSectionLoginCode(userCode: string | null | undefined): boolean {
  return sectionOfAdmin(userCode) !== "salary";
}

/** Codes this admin user code may act on as a dealing assistant (ACC also covers OTH) */
export function codesForUserCode(userCode: string | null | undefined): string[] {
  const s = sectionOfAdmin(userCode);
  const c = String(userCode ?? "").trim().toUpperCase();
  return s === "salary" ? (c ? [c] : []) : sectionCodes(s);
}

export function isFundReport(reportType: string | null | undefined): boolean {
  return reportType === FUND_REPORT_TYPE;
}

/** Does a report of this type belong to this section's view? */
export function reportInSection(reportType: string | null | undefined, section: SectionKey): boolean {
  return section === "salary" ? !isFundReport(reportType) : isFundReport(reportType);
}

/**
 * The month a fund section (Accounts / Bill / Students) is working on. Wages of month M are due
 * with the attendance by the last day of M and paid by the 7th of M+1, so the sections work on
 * the PREVIOUS month after the month changes; the new month is shown from its last
 * FUND_NEW_MONTH_FROM_LAST days, when its attendance starts arriving.
 */
export const FUND_NEW_MONTH_FROM_LAST = 5;
export function fundWorkMonth(today: Date = new Date()): { month: number; year: number } {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const d = today.getDate() > last - FUND_NEW_MONTH_FROM_LAST
    ? new Date(today.getFullYear(), today.getMonth(), 1)
    : new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

/** Default month of a section's screens: Salary = the current month, fund sections = fundWorkMonth() */
export function defaultMonthOfSection(section: SectionKey, today: Date = new Date()): { month: number; year: number } {
  return section === "salary" ? { month: today.getMonth() + 1, year: today.getFullYear() } : fundWorkMonth(today);
}

/** Pages that belong to one side only: Payroll = fund sections, LPC / Claim Forms = Salary Section */
export function pageFitsSection(path: string, section: SectionKey): boolean {
  if (path.startsWith("/admin/payroll")) return section !== "salary";
  if (path.startsWith("/admin/lpc") || path.startsWith("/admin/claim-forms")) return section === "salary";
  return true;
}

export function sectionLabel(section: SectionKey): string {
  return SECTIONS.find((s) => s.key === section)?.label ?? "Salary Section";
}
