// Main vs Supplementary attendance reports
// ─────────────────────────────────────────────────────────────────────────────
// A report's kind is now stored in attendance_reports.report_kind:
//   'main'          → the department's Main Attendance Report for the month
//   'supplementary' → a Supplementary Attendance Report (a few employees)
//   NULL            → old report created before this feature; its label is derived
//                     exactly as before (any earlier non-cancelled report of the same
//                     month & type → "Supplementary", earlier cancelled → "Revised").
//
// A department may send Supplementary reports BEFORE its Main report without
// locking the Main report. Only one non-cancelled Main report may exist per
// department / month / report type ('regular' | 'reporting').

export type ReportKind = 'main' | 'supplementary';

type ReportLike = {
  id: number;
  departmentId?: number | null;
  month: number;
  year: number;
  status: string;
  reportType?: string | null;
  reportKind?: string | null;
};

const typeOf = (r: ReportLike) => r.reportType || 'regular';

// Same department (when known) + month + year + report type.
// The department check matters where reports of ALL departments are in one list.
const sameGroup = (a: ReportLike, b: ReportLike) =>
  (a.departmentId == null || b.departmentId == null || a.departmentId === b.departmentId) &&
  a.month === b.month && a.year === b.year && typeOf(a) === typeOf(b);

/** Normalise any incoming value to a valid kind ('main' unless explicitly 'supplementary'). */
export function normaliseReportKind(value: unknown): ReportKind {
  return value === 'supplementary' ? 'supplementary' : 'main';
}

/** Does this (non-cancelled) report count as the Main report of its month? Old reports (NULL) do. */
export function countsAsMain(r: ReportLike): boolean {
  return r.status !== 'cancelled' && r.reportKind !== 'supplementary';
}

/** The non-cancelled Main report of a department for month/year/type, if any. */
export function findMainReport<T extends ReportLike>(
  reports: T[] | undefined | null,
  month: number,
  year: number,
  reportType: string = 'regular',
): T | undefined {
  return (reports || []).find(
    (r) => r.month === month && r.year === year && typeOf(r) === reportType && countsAsMain(r),
  );
}

/** Title prefix shown on screen / print / Excel: 'Supplementary ', 'Revised ' or ''. */
export function getReportPrefix(
  report: ReportLike | undefined | null,
  allReports?: ReportLike[] | null,
): 'Supplementary ' | 'Revised ' | '' {
  if (!report) return '';
  if (report.reportKind === 'supplementary') return 'Supplementary ';

  const earlier = (allReports || []).filter((r) => sameGroup(r, report) && r.id < report.id);

  if (report.reportKind === 'main') {
    // A Main report that replaces an earlier cancelled Main report is "Revised"
    const replacesCancelledMain = earlier.some(
      (r) => r.status === 'cancelled' && r.reportKind !== 'supplementary',
    );
    return replacesCancelledMain ? 'Revised ' : '';
  }

  // Old report (no stored kind) → previous behaviour, unchanged
  if (earlier.some((r) => r.status !== 'cancelled')) return 'Supplementary ';
  if (earlier.some((r) => r.status === 'cancelled')) return 'Revised ';
  return '';
}
