// Online claim forms — the rules shared by the server and the pages.
// ─────────────────────────────────────────────────────────────────────────────
// An employee fills a form without a login (Permanent ID + date of joining),
// prints it, signs it and hands it to the department. The department gets it
// signed by the Chairman / Head, writes the dispatch number and date on it and
// uploads the scan. Only then does the Salary Section see it.
//
//   draft → submitted → sent → accepted → processed
//             ↑  ↓         ↓
//   returned_employee   returned_department
import { z } from "zod";

export const CLAIM_FORM_TYPES = ["npa", "hra", "conveyance"] as const;
export type ClaimFormType = (typeof CLAIM_FORM_TYPES)[number];

export const CLAIM_STATUSES = [
  "draft", "submitted", "sent", "returned_department", "returned_employee",
  "accepted", "processed", "rejected", "cancelled",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: "Draft",
  submitted: "Submitted to department",
  sent: "Sent to Salary Section",
  returned_department: "Returned to department",
  returned_employee: "Returned to employee",
  accepted: "Accepted",
  processed: "Processed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** What the status means for the employee, in one line */
export const CLAIM_STATUS_HELP: Record<ClaimStatus, string> = {
  draft: "Not submitted yet.",
  submitted: "Print the form, sign it and hand it to your department.",
  sent: "Your department has sent the signed form to the Salary Section.",
  returned_department: "The Salary Section has returned the form to your department.",
  returned_employee: "Your department has returned the form to you for correction.",
  accepted: "The Salary Section has accepted the form.",
  processed: "The claim has been given effect in the payroll.",
  rejected: "The claim was rejected.",
  cancelled: "The claim was cancelled.",
};

/** Statuses in which the employee may still change the form */
export const EMPLOYEE_EDITABLE: ClaimStatus[] = ["draft", "returned_employee"];
/** Statuses in which the department uploads the signed form (or returns it to the employee) */
export const DEPARTMENT_ACTIONABLE: ClaimStatus[] = ["submitted", "returned_department"];
/** A claim in one of these no longer blocks a new one for the same period */
export const CLAIM_DEAD: ClaimStatus[] = ["rejected", "cancelled"];

export interface ClaimFormDef {
  type: ClaimFormType;
  code: string;                 // used in the reference number
  title: string;
  shortTitle: string;
  description: string;
  /** A signed undertaking must be uploaded by the employee before the form can be submitted */
  needsUndertaking: boolean;
}

export const CLAIM_FORM_DEFS: Record<ClaimFormType, ClaimFormDef> = {
  npa: {
    type: "npa", code: "NPA",
    title: "Certificate of N.P.A. Claim",
    shortTitle: "NPA",
    description: "Non-Practising Allowance. To be filled once for each appointment (for example on becoming Senior Resident or Assistant Professor).",
    needsUndertaking: true,
  },
  hra: {
    type: "hra", code: "HRA",
    title: "Certificate of H.R.A. Claim",
    shortTitle: "HRA",
    description: "House Rent Allowance. To be filled once for each appointment.",
    needsUndertaking: false,
  },
  conveyance: {
    type: "conveyance", code: "CA",
    title: "Conveyance Allowance Bill",
    shortTitle: "Conveyance",
    description: "For three months at a time, starting from March each year. Several quarters can be claimed together.",
    needsUndertaking: false,
  },
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date");

export const HRA_OPTIONS = {
  rented: "I am living in a rented accommodation",
  rent_contribution: "I am incurring some expenditure on rent / contributory towards Rent of rented accommodation.",
  own_house: "I am living in my own house /house owned by my spouse and I am paying / contributing towards house or property tax or maintenance of house.",
} as const;
export type HraOption = keyof typeof HRA_OPTIONS;

export const npaDataSchema = z.object({
  wefDate: isoDate,
  /** The four statements of the certificate and the refund clause were read and agreed */
  declared: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration" }) }),
});
export const hraDataSchema = z.object({
  wefDate: isoDate,
  option: z.enum(["rented", "rent_contribution", "own_house"], { errorMap: () => ({ message: "Please choose one option" }) }),
  declared: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration" }) }),
});

export type NpaData = z.infer<typeof npaDataSchema>;
export type HraData = z.infer<typeof hraDataSchema>;

// ── Conveyance Allowance ─────────────────────────────────────────────────────
// Claimed for a quarter (March–May, June–August, September–November,
// December–February), after the quarter is over. Each month counts only if the
// conditions certified on the bill hold for it: more than twenty visits, leave of
// not more than 15 days, and not a vacation month.

export const CONVEYANCE_VEHICLES = ["Car", "Scooter / Motor Cycle"] as const;
/** A month does not count when the employee marks it with one of these */
export const CONVEYANCE_MONTH_REASONS = {
  vacation: "On vacation",
  leave: "Leave for more than 15 days",
  visits: "Twenty visits or fewer",
} as const;
export type ConveyanceMonthReason = keyof typeof CONVEYANCE_MONTH_REASONS;

/** Rate of the allowance from a month onwards (the latest one that has started applies) */
export interface ConveyanceRate {
  from: string;        // "YYYY-MM"
  amount: number;      // rupees per month
  daPercent: number;   // dearness allowance on it, added by the Salary Section
}
export const DEFAULT_CONVEYANCE_RATES: ConveyanceRate[] = [{ from: "2000-01", amount: 3300, daPercent: 103 }];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const yearMonth = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`; // m = 1..12

/** "2026-06" → "June 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${y}`;
}

/** The three months of the quarter that starts in `start` ("YYYY-MM", month 3 / 6 / 9 / 12) */
export function quarterMonths(start: string): string[] {
  const [y, m] = start.split("-").map(Number);
  return [0, 1, 2].map((i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return yearMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  });
}

export function isQuarterStart(start: string): boolean {
  return /^\d{4}-(03|06|09|12)$/.test(start);
}

/** First and last day of a quarter: ["2026-06-01", "2026-08-31"] */
export function quarterRange(start: string): [string, string] {
  const months = quarterMonths(start);
  const [y, m] = months[2].split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${months[0]}-01`, `${months[2]}-${String(lastDay).padStart(2, "0")}`];
}

/** "June 2026 to August 2026" */
export function quarterLabel(start: string): string {
  if (!isQuarterStart(start)) return "";
  const months = quarterMonths(start);
  return `${monthLabel(months[0])} to ${monthLabel(months[2])}`;
}

/**
 * Quarters that are over on `today` ("YYYY-MM-DD"), newest first — the ones that can be claimed.
 * `count` limits how far back a claim may go.
 */
export function claimableQuarters(today: string, count = 6): string[] {
  const [ty, tm] = today.split("-").map(Number);
  const out: string[] = [];
  let y = ty, m = tm;
  for (let guard = 0; guard < 60 && out.length < count; guard++) {
    const start = yearMonth(y, m);
    if (isQuarterStart(start) && quarterRange(start)[1] < today) out.push(start);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** The rate that applies in a month */
export function conveyanceRateFor(rates: ConveyanceRate[], ym: string): ConveyanceRate {
  const sorted = [...rates].sort((a, b) => a.from.localeCompare(b.from));
  let found = sorted[0] || DEFAULT_CONVEYANCE_RATES[0];
  for (const r of sorted) if (r.from <= ym) found = r;
  return found;
}

export interface ConveyanceMonth {
  month: string;                          // "YYYY-MM"
  visits: number;                         // visits outside duty hours in that month
  reason: ConveyanceMonthReason | null;   // why the month does not count (null = it counts)
  amount: number;                         // allowance for the month (0 when it does not count)
  da: number;                             // dearness allowance on it
}

/** Amounts of a quarter from what the employee entered — always worked out again on the server */
export function conveyanceAmounts(
  months: Array<{ month: string; visits: number; reason: ConveyanceMonthReason | null }>,
  rates: ConveyanceRate[],
) {
  const rows: ConveyanceMonth[] = months.map((x) => {
    const counts = !x.reason && x.visits > 20;
    const rate = conveyanceRateFor(rates, x.month);
    const amount = counts ? rate.amount : 0;
    return {
      month: x.month, visits: x.visits,
      reason: counts ? null : x.reason || "visits",
      amount, da: Math.round((amount * rate.daPercent) / 100),
    };
  });
  const amount = rows.reduce((sum, r) => sum + r.amount, 0);
  const da = rows.reduce((sum, r) => sum + r.da, 0);
  return { months: rows, eligibleMonths: rows.filter((r) => r.amount > 0).length, amount, da, payable: amount + da };
}

export const conveyanceDataSchema = z.object({
  quarter: z.string().refine(isQuarterStart, "Please choose the quarter"),
  address: z.string().trim().min(5, "Please enter your local residential address").max(120),
  vehicleType: z.enum(CONVEYANCE_VEHICLES, { errorMap: () => ({ message: "Please choose the type of vehicle" }) }),
  vehicleRegNo: z.string().trim().min(4, "Please enter the registration number of the vehicle").max(20),
  months: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    visits: z.coerce.number().int().min(0).max(200),
    reason: z.enum(["vacation", "leave", "visits"]).nullable(),
  })).length(3),
  declared: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration" }) }),
});
export type ConveyanceData = z.infer<typeof conveyanceDataSchema>;

export const CLAIM_DATA_SCHEMAS: Record<ClaimFormType, z.ZodTypeAny> = {
  npa: npaDataSchema,
  hra: hraDataSchema,
  conveyance: conveyanceDataSchema,
};

/** One line that says what a claim is for, for lists: "W.e.f. 01-10-2026" / "June 2026 to August 2026" */
export function claimSummary(claim: { formType: ClaimFormType; data: Record<string, any> }): string {
  if (claim.formType === "conveyance") return quarterLabel(String(claim.data.quarter || ""));
  return `W.e.f. ${formatClaimDate(claim.data.wefDate)}`;
}

export function isClaimFormType(v: unknown): v is ClaimFormType {
  return typeof v === "string" && (CLAIM_FORM_TYPES as readonly string[]).includes(v);
}

/** Employee details as they were when the form was filled (later changes do not alter the form) */
export interface ClaimSnapshot {
  name: string;
  epid: string;
  designation: string;
  departmentName: string;
  payLevel: string | null;
  salaryRegisterNo: string | null;
  dealingAssistant: string | null;
  hodTitle: string | null;
}

export interface ClaimFile {
  id: number;
  kind: string;
  fileUrl: string;
  revision: number;
  uploadedBy: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface ClaimEvent {
  id: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorType: string;
  actorName: string;
  remarks: string | null;
  createdAt: string;
}

export interface ClaimForm {
  id: number;
  formType: ClaimFormType;
  refNo: string;
  revision: number;
  employeeId: number;
  epid: string;
  departmentId: number;
  periodKey: string;
  periodLabel: string | null;
  status: ClaimStatus;
  data: Record<string, any>;
  snapshot: ClaimSnapshot;
  dispatchNo: string | null;
  dispatchDate: string | null;
  aiCheck: Record<string, any> | null;
  returnReason: string | null;
  returnedBy: string | null;
  decidedBy: string | null;
  processedMonth: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  // only on detail reads
  files?: ClaimFile[];
  events?: ClaimEvent[];
  hasUndertaking?: boolean;
  // only on admin / department lists
  currentDealingAssistant?: string | null;
  currentDepartmentName?: string | null;
}

/** "2026-11-11" → "11-11-2026" */
export function formatClaimDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Loose key of a designation: "Senior Resident" and "SENIOR  RESIDENT." are the same appointment */
export function appointmentKey(designation: string | null | undefined): string {
  return "appt:" + String(designation || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/** Today's date on this computer as "YYYY-MM-DD" (not the UTC date, which is a day behind in India until 5:30 am) */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
