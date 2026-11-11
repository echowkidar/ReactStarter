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

export const CLAIM_FORM_TYPES = ["npa", "hra"] as const;
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

export const CLAIM_DATA_SCHEMAS: Record<ClaimFormType, z.ZodTypeAny> = {
  npa: npaDataSchema,
  hra: hraDataSchema,
};

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
