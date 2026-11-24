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

export function sectionLabel(section: SectionKey): string {
  return SECTIONS.find((s) => s.key === section)?.label ?? "Salary Section";
}
