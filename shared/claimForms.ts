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

export const CLAIM_FORM_TYPES = ["npa", "hra", "pca", "conveyance", "cea"] as const;
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
  /** Each child needs the school's certificate (Annexure B) uploaded before the form can be submitted */
  needsSchoolCertificate?: boolean;
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
  pca: {
    type: "pca", code: "PCA",
    title: "H.P.C.A. / P.C.A. Claim Form",
    shortTitle: "PCA",
    description: "Hospital Patient Care Allowance / Patient Care Allowance. To be filled twice a year, for January to June and for July to December. Not for temporary staff.",
    needsUndertaking: false,
  },
  cea: {
    type: "cea", code: "CEA",
    title: "Children Education Allowance / Hostel Subsidy",
    shortTitle: "CEA",
    description: "Reimbursement of Children Education Allowance / Hostel Subsidy for an academic session, for your two eldest children (three if the second birth gave twins).",
    needsUndertaking: false,
    needsSchoolCertificate: true,
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

/** Types of vehicle as in the payroll's conveyance entry */
export const CONVEYANCE_VEHICLES = ["Four wheeler", "Two wheeler"] as const;
export type ConveyanceVehicle = (typeof CONVEYANCE_VEHICLES)[number];
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
  amount: number;      // rupees per month, four wheeler
  twoWheeler: number;  // rupees per month, two wheeler
  daPercent: number;   // dearness allowance on it, added by the Salary Section
}
export const DEFAULT_CONVEYANCE_RATES: ConveyanceRate[] = [{ from: "2000-01", amount: 3300, twoWheeler: 1080, daPercent: 103 }];

/** The monthly amount of a rate for a vehicle */
export function conveyanceRateAmount(rate: ConveyanceRate, vehicle: string): number {
  return vehicle === "Two wheeler" ? Number(rate.twoWheeler ?? 1080) : rate.amount;
}

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
  vehicle: string,
) {
  const rows: ConveyanceMonth[] = months.map((x) => {
    const counts = !x.reason && x.visits > 20;
    const rate = conveyanceRateFor(rates, x.month);
    const amount = counts ? conveyanceRateAmount(rate, vehicle) : 0;
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

// ── Patient Care Allowance (HPCA / PCA) ──────────────────────────────────────
// Claimed twice a year, for January–June and for July–December ("this claim form
// should be submitted twice a year i.e. in January and July"). Not for temporary
// staff; only employees of departments marked as PCA departments by the Salary Section.

/** "2026-1" = January to June 2026, "2026-2" = July to December 2026 */
export function isHalfYear(key: string): boolean {
  return /^\d{4}-[12]$/.test(key);
}

export function halfYearLabel(key: string): string {
  if (!isHalfYear(key)) return "";
  const [year, half] = key.split("-");
  return half === "1" ? `January to June ${year}` : `July to December ${year}`;
}

/** First and last day: ["2026-07-01", "2026-12-31"] */
export function halfYearRange(key: string): [string, string] {
  const [year, half] = key.split("-");
  return half === "1" ? [`${year}-01-01`, `${year}-06-30`] : [`${year}-07-01`, `${year}-12-31`];
}

/**
 * Half-years a PCA claim can be filled for on `today` ("YYYY-MM-DD"), newest first:
 * the next one (only in June / December, just before it starts), the present one and
 * the one before it (a late claim).
 */
export function claimableHalfYears(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const present = m <= 6 ? `${y}-1` : `${y}-2`;
  const before = m <= 6 ? `${y - 1}-2` : `${y}-1`;
  const next = m <= 6 ? `${y}-2` : `${y + 1}-1`;
  return [...(m === 6 || m === 12 ? [next] : []), present, before];
}

/** How the claim stands against the payroll of the six months before it */
export const PCA_CATEGORIES = {
  continuing: "Continuing (PCA drawn in the previous six months)",
  new: "New claim (no PCA in the previous six months)",
  transfer: "Transfer case (department changed in the previous six months)",
  unknown: "Not checked (no paybill data for the previous six months)",
} as const;
export type PcaCategory = keyof typeof PCA_CATEGORIES;

/** Employment statuses that may claim PCA (confirmed, or on probation) */
export const PCA_STATUSES = ["Permanent", "Probation"];

export const pcaDataSchema = z.object({
  period: z.string().refine(isHalfYear, "Please choose the period"),
  confirmation: z.string().trim().min(3, "Please enter the date of confirmation or the term of probation").max(60),
  joiningDate: isoDate,
  joiningSession: z.enum(["FN", "AN"], { errorMap: () => ({ message: "Please choose forenoon or afternoon" }) }),
  transferFrom: z.string().trim().max(80).optional().default(""),
  transferDate: z.union([isoDate, z.literal("")]).optional().default(""),
  declared: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration" }) }),
});
export type PcaData = z.infer<typeof pcaDataSchema>;

// ── Children Education Allowance (CEA) / Hostel Subsidy ──────────────────────
// One claim per employee and academic session (April to March, e.g. "2025-2026"),
// for the two eldest surviving children (three when the second birth gave twins).
// Children come from the family details of the payroll (service book): a child who
// is not there cannot be claimed for. Schools come from the Salary Section's list;
// only schools that the Directorate of School Education found recognised are
// accepted. Each child needs the school's certificate (Annexure B) uploaded before
// the form can be submitted. Amounts are worked out from the CEA rates entered by
// the Salary Section for the dates of the session.

/** Classes as written in the payroll's CEA records */
export const CEA_CLASSES = ["Pre-Nur", "Nursery", "L.K.G.", "U.K.G.", "Prep.", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Dip. I", "Dip. II"] as const;

export const SPOUSE_EMPLOYMENT = {
  none: "Not employed",
  central: "Central Govt.",
  psu: "PSU",
  state: "State Govt.",
  other: "Other",
} as const;
export type SpouseEmployment = keyof typeof SPOUSE_EMPLOYMENT;

/** Why a child is in the same class as in the session before (flagged; marksheet needed) */
export const CEA_REPEAT_REASONS = {
  failed: "Failed in the previous session",
  failed_changed_school: "Failed in the previous session and changed school",
} as const;
export type CeaRepeatReason = keyof typeof CEA_REPEAT_REASONS;

/** Approval needed for a claim that is filled late */
export const CEA_APPROVALS = {
  none: "",
  finance_officer: "This claim is two years old: approval of the Finance Officer is required.",
  vice_chancellor: "This claim is more than two years old: approval of the Vice Chancellor is required.",
} as const;
export type CeaApproval = keyof typeof CEA_APPROVALS;

/** "2025-2026" */
export function isSession(s: string): boolean {
  const m = /^(\d{4})-(\d{4})$/.exec(s);
  return !!m && Number(m[2]) === Number(m[1]) + 1;
}

/** Session in which a day falls (sessions run April to March) */
export function sessionOf(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** First and last day of a session: ["2025-04-01", "2026-03-31"] */
export function sessionRange(session: string): [string, string] {
  const start = Number(session.slice(0, 4));
  return [`${start}-04-01`, `${start + 1}-03-31`];
}

/** The twelve months of a session, "YYYY-MM" */
export function sessionMonths(session: string): string[] {
  const start = Number(session.slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => {
    const m = 4 + i;
    return m <= 12 ? `${start}-${String(m).padStart(2, "0")}` : `${start + 1}-${String(m - 12).padStart(2, "0")}`;
  });
}

/** How old a session is against today: 0 = present, 1 = last, 2 = two years old … */
export function sessionAge(session: string, today: string): number {
  return Number(sessionOf(today).slice(0, 4)) - Number(session.slice(0, 4));
}

/** The present and last sessions need no approval; two years old: Finance Officer; older: Vice Chancellor */
export function ceaApprovalFor(session: string, today: string): CeaApproval {
  const age = sessionAge(session, today);
  if (age <= 1) return "none";
  return age === 2 ? "finance_officer" : "vice_chancellor";
}

/** Sessions that can be claimed, newest first (present one and `back` before it) */
export function ceaClaimableSessions(today: string, back = 5): string[] {
  const start = Number(sessionOf(today).slice(0, 4));
  return Array.from({ length: back + 1 }, (_, i) => `${start - i}-${start - i + 1}`);
}

export interface CeaRate {
  from: string;   // "YYYY-MM-DD"
  to: string;     // "" = until further orders
  cea: number;    // per child per month
  hostel: number; // per child per month
  disabled: number; // CEA per month for a child with disability
}

export function ceaRateOn(rates: CeaRate[], day: string): CeaRate | null {
  return rates.find((r) => r.from <= day && (!r.to || r.to >= day)) || null;
}

/** A child of the employee as recorded in the payroll's family details */
export interface FamilyChild {
  key: string;        // stable key: date of birth + name, e.g. "2012-05-04|AYESHA"
  name: string;
  dob: string;        // "YYYY-MM-DD"
  relation: "S" | "D";
}

/**
 * The children CEA can be claimed for: the two eldest; when the second birth gave
 * twins (or more), all children of that birth. Children of a birth are those with
 * the same date of birth.
 */
export function ceaEligibleChildren(children: FamilyChild[]): FamilyChild[] {
  const sorted = [...children].filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.dob)).sort((a, b) => a.dob.localeCompare(b.dob));
  const births: FamilyChild[][] = [];
  for (const c of sorted) {
    const last = births[births.length - 1];
    if (last && last[0].dob === c.dob) last.push(c);
    else births.push([c]);
  }
  if (!births.length) return [];
  if (births[0].length >= 2) return births[0];        // twins at the first birth
  return [...births[0], ...(births[1] || [])];         // eldest + the whole second birth
}

/** What the employee fills for one child */
export const ceaChildSchema = z.object({
  childKey: z.string().min(3).max(80),
  className: z.enum(CEA_CLASSES, { errorMap: () => ({ message: "Please choose the class of each child" }) }),
  schoolId: z.coerce.number().int().positive({ message: "Please choose the school of each child" }),
  result: z.enum(["passed", "failed"]).default("passed"),
  hostel: z.boolean().default(false),
  hostelDistanceKm: z.coerce.number().min(0).max(5000).optional().default(0),
  disabled: z.boolean().default(false),
  disabilityNature: z.string().trim().max(80).optional().default(""),
  disabilityCertDate: z.union([isoDate, z.literal("")]).optional().default(""),
  disabilityPercent: z.coerce.number().min(0).max(100).optional().default(0),
  repeatReason: z.enum(["", "failed", "failed_changed_school"]).optional().default(""),
});
export type CeaChildInput = z.infer<typeof ceaChildSchema>;

export const ceaDataSchema = z.object({
  session: z.string().refine(isSession, "Please choose the academic session"),
  spouseEmployment: z.enum(["none", "central", "psu", "state", "other"], { errorMap: () => ({ message: "Please say whether your spouse is employed" }) }),
  spouseName: z.string().trim().max(80).optional().default(""),
  spouseDetails: z.string().trim().max(200).optional().default(""),   // designation, office, B.U. / PID
  amountAlreadyReceived: z.coerce.number().min(0).max(10_000_000).optional().default(0),
  children: z.array(ceaChildSchema).min(1, "Please choose at least one child").max(4),
  declared: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration" }) }),
});
export type CeaDataInput = z.infer<typeof ceaDataSchema>;

/** One child of a CEA claim as stored (filled data + what the server worked out) */
export interface CeaChild extends CeaChildInput {
  name: string;
  dob: string;
  relation: "S" | "D";
  schoolName: string;
  schoolLocation: string;
  repeatsClass: boolean;   // same class as in the session before (flag for the dealing assistant)
  cea: number;             // allowance for the session
  hostelAmount: number;    // hostel subsidy for the session
  amount: number;          // cea + hostelAmount
}

/** Amounts of one child for a session: each month at the rate in force on its first day */
export function ceaChildAmounts(session: string, rates: CeaRate[], child: { hostel: boolean; disabled: boolean }) {
  let cea = 0, hostel = 0;
  const missing: string[] = [];
  for (const month of sessionMonths(session)) {
    const rate = ceaRateOn(rates, `${month}-01`);
    if (!rate) { missing.push(month); continue; }
    cea += child.disabled && rate.disabled > 0 ? rate.disabled : rate.cea;
    if (child.hostel) hostel += rate.hostel;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { cea: round(cea), hostel: round(hostel), missing };
}

export const CLAIM_DATA_SCHEMAS: Record<ClaimFormType, z.ZodTypeAny> = {
  npa: npaDataSchema,
  hra: hraDataSchema,
  pca: pcaDataSchema,
  conveyance: conveyanceDataSchema,
  cea: ceaDataSchema,
};

/** One line that says what a claim is for, for lists: "W.e.f. 01-10-2026" / "June 2026 to August 2026" */
export function claimSummary(claim: { formType: ClaimFormType; data: Record<string, any> }): string {
  if (claim.formType === "conveyance") return quarterLabel(String(claim.data.quarter || ""));
  if (claim.formType === "pca") return halfYearLabel(String(claim.data.period || ""));
  if (claim.formType === "cea") return `Session ${String(claim.data.session || "")}`;
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
