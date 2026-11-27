// Which identification fields show in employee forms — shared by the server and the forms.
// Settings (app_settings, Super Admin → Settings → Employee Form Field Visibility):
//   show_pan_field / show_bank_field / show_aadhar_field           — Salary Section (regular) staff
//   show_fund_pan_field / show_fund_bank_field / show_fund_aadhar_field — Revolving Funds staff
//                                                                     (Employee ID starting with a letter)
// A fund-staff switch that was never set follows the regular one, except the bank account,
// which is shown for fund staff by default (their wages are paid into it).

export type VisField = "pan" | "bank" | "aadhar";

const REGULAR: Record<VisField, string> = { pan: "show_pan_field", bank: "show_bank_field", aadhar: "show_aadhar_field" };
export const FUND_KEY: Record<VisField, string> = { pan: "show_fund_pan_field", bank: "show_fund_bank_field", aadhar: "show_fund_aadhar_field" };

const letterEpid = (epid: unknown) => /^[A-Za-z]/.test(String(epid ?? "").trim());

/** Is this field shown for an employee with this Employee ID? (no / empty ID = regular staff) */
export function fieldShown(settings: Record<string, string> | null | undefined, field: VisField, epid?: string | null): boolean {
  const s = settings || {};
  if (letterEpid(epid)) {
    const v = s[FUND_KEY[field]];
    if (v === "true") return true;
    if (v === "false") return false;
    if (field === "bank") return true;
  }
  return s[REGULAR[field]] !== "false";
}
