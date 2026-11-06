// Which employee fields are shown to users — ONE place for the rules.
// ─────────────────────────────────────────────────────────────────────────────
// Settings (app_settings) can hide PAN, bank details, Aadhar and employee
// category. A hidden field is:
//   • blanked in every employee list/search the app sends out, and
//   • NEVER overwritten by an edit — forms receive the blank value, so without
//     this an edit would wipe the real value (for example data synced from Oracle).
import { sql } from "drizzle-orm";
import { db } from "./db";

export type FieldVisibility = {
  pan: boolean;
  bank: boolean;      // bank account + bank name + IFSC + bank proof
  aadhar: boolean;
  category: boolean;  // Teaching / Non-Teaching
};

// Fields that belong to each setting. `blank` is what users get when hidden.
const GROUPS: Record<keyof FieldVisibility, Array<{ field: string; blank: "" | null }>> = {
  pan: [{ field: "panNumber", blank: "" }, { field: "panCardUrl", blank: null }],
  bank: [
    { field: "bankAccount", blank: "" },
    { field: "bankName", blank: null },
    { field: "ifsc", blank: null },
    { field: "bankProofUrl", blank: null },
  ],
  aadhar: [{ field: "aadharCard", blank: "" }, { field: "aadharCardUrl", blank: null }],
  category: [{ field: "employeeCategory", blank: null }],
};

// Everything hidden — used when settings cannot be read
export const ALL_HIDDEN: FieldVisibility = { pan: false, bank: false, aadhar: false, category: false };

export async function getFieldVisibility(): Promise<FieldVisibility> {
  const r = await db.execute(sql`SELECT key, value FROM app_settings`);
  const s: Record<string, string> = {};
  for (const row of r.rows as any[]) s[row.key] = row.value;
  return {
    pan: s.show_pan_field !== "false",
    bank: s.show_bank_field !== "false",
    aadhar: s.show_aadhar_field !== "false",
    // new field: hidden unless switched on
    category: s.show_employee_category_field === "true",
  };
}

/** Blank the hidden fields of one employee before it is sent to a user */
export function maskEmployee<T extends Record<string, any>>(emp: T, vis: FieldVisibility): T {
  const out: Record<string, any> = { ...emp };
  for (const key of Object.keys(GROUPS) as Array<keyof FieldVisibility>) {
    if (vis[key]) continue;
    for (const { field, blank } of GROUPS[key]) out[field] = blank;
  }
  return out as T;
}

/**
 * Drop hidden fields from an edit so the stored values stay as they are.
 * Also tidies the optional Oracle-backed fields: blank → null, IFSC upper case,
 * and an unknown employee category is not saved.
 */
export function stripHiddenUpdates<T extends Record<string, any>>(updates: T, vis: FieldVisibility): T {
  const out: Record<string, any> = { ...updates };
  for (const key of Object.keys(GROUPS) as Array<keyof FieldVisibility>) {
    if (vis[key]) continue;
    for (const { field } of GROUPS[key]) delete out[field];
  }
  for (const f of ["bankName", "ifsc", "employeeCategory"]) {
    if (f in out) out[f] = typeof out[f] === "string" && out[f].trim() ? out[f].trim() : null;
  }
  if (typeof out.ifsc === "string") out.ifsc = out.ifsc.toUpperCase().slice(0, 11);
  if ("employeeCategory" in out && out.employeeCategory !== null &&
      !["Teaching", "Non-Teaching"].includes(out.employeeCategory)) delete out.employeeCategory;
  // Oracle-only fields are written by the Oracle sync, never through an edit form
  delete out.oracleEmpStatus; delete out.salGroup; delete out.oracleSyncedAt;
  return out as T;
}
