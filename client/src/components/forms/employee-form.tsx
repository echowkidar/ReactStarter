import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { SearchableSelect, ComboboxOption } from "@/components/ui/searchable-select";
import { fieldShown } from "@shared/fieldVisibility";
import { ALL_STATUSES, statusesForEpid, isValidEpid, isLetterEpid, EPID_FORMAT_MESSAGE, showsTermExpiry, requiresTermExpiry, dealingAssistantAllowed, dealingAssistantOptionsFor } from "@shared/employeeKind";
import { PAY_LEVELS } from "@/lib/pay-levels";
import { Loader2, AlertCircle } from "lucide-react";
import { compressImageToWebP, isImageFile } from "@/lib/image-utils";
import { useState, useEffect, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { WAGE_CATEGORIES, WAGE_CATEGORY_LABELS, categoryFromDesignation } from "@shared/wagePayroll";

// Import master data for designations
import designationsData from "@/lib/designations.json";
import salaryAssistantsData from "@/lib/salary-assistants.json";
import { getCurrentDepartment } from "@/lib/auth";

// Prepare options for searchable selects
const designationOptions: ComboboxOption[] = designationsData.map((d: string) => ({ value: d, label: d }));
const salaryAssistantOptions: ComboboxOption[] = salaryAssistantsData as ComboboxOption[];

// ── Wages payroll fields (letter EPIDs only) — shared with the Edit and Admin forms ──
export type PayrollValue = {
  wageCategory: string;
  wageMonthlyFixed: string;
  epfApplicable: boolean;
  uanNo: string;
  esiApplicable: boolean;
  esiNo: string;
  esiCovered: boolean;
  masApplicable: boolean;
  fundCode: string;
  bankName: string;
  bankBranch: string;
  ifsc: string;
  fatherName: string;
  address: string;
  mobileNo: string;
  personalEmail: string;
};

/** Keys that belong to the payroll block only (removed for numeric EPIDs). bankName / ifsc are normal fields too, so they are not listed. */
export const PAYROLL_ONLY_KEYS = ["wageCategory", "wageMonthlyFixed", "epfApplicable", "uanNo", "esiApplicable", "esiNo", "esiCovered", "masApplicable", "fundCode", "bankBranch", "fatherName", "address", "mobileNo", "personalEmail"] as const;

export const EMPTY_PAYROLL: PayrollValue = {
  wageCategory: "", wageMonthlyFixed: "", epfApplicable: false, uanNo: "", esiApplicable: false, esiNo: "", esiCovered: false, masApplicable: false,
  fundCode: "", bankName: "", bankBranch: "", ifsc: "",
  fatherName: "", address: "", mobileNo: "", personalEmail: "",
};

/** Read the payroll values from a stored employee row (camelCase or snake_case) */
export function payrollFromEmployee(emp: any): PayrollValue {
  const pick = (a: string, b: string) => emp?.[a] ?? emp?.[b];
  const flag = (v: any) => v === true || v === "true" || v === 1 || v === "1";
  return {
    wageCategory: String(pick("wageCategory", "wage_category") ?? ""),
    wageMonthlyFixed: (() => { const n = Number(pick("wageMonthlyFixed", "wage_monthly_fixed")); return Number.isFinite(n) && n > 0 ? String(n) : ""; })(),
    epfApplicable: flag(pick("epfApplicable", "epf_applicable")),
    uanNo: String(pick("uanNo", "uan_no") ?? ""),
    esiApplicable: flag(pick("esiApplicable", "esi_applicable")),
    esiNo: String(pick("esiNo", "esi_no") ?? ""),
    esiCovered: flag(pick("esiCovered", "esi_covered")),
    masApplicable: flag(pick("masApplicable", "mas_applicable")),
    fundCode: String(pick("fundCode", "fund_code") ?? ""),
    bankName: String(pick("bankName", "bank_name") ?? ""),
    bankBranch: String(pick("bankBranch", "bank_branch") ?? ""),
    ifsc: String(pick("ifsc", "ifsc") ?? ""),
    fatherName: String(pick("fatherName", "father_name") ?? ""),
    address: String(pick("address", "address") ?? ""),
    mobileNo: String(pick("mobileNo", "mobile_no") ?? ""),
    personalEmail: String(pick("personalEmail", "personal_email") ?? ""),
  };
}

/** Client-side check; returns field -> message (empty object when fine) */
export function validatePayroll(v: PayrollValue): Partial<Record<keyof PayrollValue, string>> {
  const e: Partial<Record<keyof PayrollValue, string>> = {};
  if (!v.wageCategory) e.wageCategory = "Wage Category is required";
  if (v.wageMonthlyFixed.trim() && !(Number(v.wageMonthlyFixed) >= 1 && Number(v.wageMonthlyFixed) <= 1000000)) e.wageMonthlyFixed = "Monthly fixed wages must be an amount from 1 to 10,00,000";
  if (v.epfApplicable && v.uanNo.trim() && !/^\d{12}$/.test(v.uanNo.trim())) e.uanNo = "UAN must be 12 digits";
  if (v.esiApplicable && v.esiNo.trim() && !/^\d{10}$/.test(v.esiNo.trim())) e.esiNo = "ESI number must be 10 digits";
  if (v.fundCode.trim() && !/^[A-Za-z0-9]{3,20}$/.test(v.fundCode.trim())) e.fundCode = "Payment Code must be 3-20 letters/digits";
  if (v.ifsc.trim() && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc.trim().toUpperCase())) e.ifsc = "IFSC must look like SBIN0001234";
  if (v.mobileNo.trim() && !/^[6-9]\d{9}$/.test(v.mobileNo.trim())) e.mobileNo = "Mobile No. must be 10 digits starting with 6-9";
  if (v.personalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.personalEmail.trim())) e.personalEmail = "Enter a valid e-mail address";
  return e;
}

/** The values to send with the form */
export function payrollPayload(v: PayrollValue) {
  return {
    wageCategory: v.wageCategory,
    wageMonthlyFixed: v.wageMonthlyFixed.trim(),
    epfApplicable: v.epfApplicable,
    uanNo: v.epfApplicable ? v.uanNo.trim() : "",
    esiApplicable: v.esiApplicable,
    esiNo: v.esiApplicable ? v.esiNo.trim() : "",
    esiCovered: v.esiApplicable ? v.esiCovered : false,
    masApplicable: v.masApplicable,
    fundCode: v.fundCode.trim().toUpperCase(),
    bankName: v.bankName.trim(),
    bankBranch: v.bankBranch.trim(),
    ifsc: v.ifsc.trim().toUpperCase(),
    fatherName: v.fatherName.trim().toUpperCase() || null,
    address: v.address.trim() || null,
    mobileNo: v.mobileNo.trim() || null,
    personalEmail: v.personalEmail.trim().toLowerCase() || null,
  };
}

export function WagePayrollFields({ value, onChange, errors = {}, disabled, designation, departmentId, fundsUrl, bankAccountSlot }: {
  /** The form's own Bank Account input + Bank Account Proof upload, shown with the other bank details */
  bankAccountSlot?: ReactNode;
  value: PayrollValue;
  onChange: (patch: Partial<PayrollValue>) => void;
  errors?: Partial<Record<keyof PayrollValue, string>>;
  disabled?: boolean;
  designation?: string;
  /** App department id (departments.id) used to load the department's funds */
  departmentId?: number | string | null;
  /** Admin form: its department list uses department-list ids, so funds come from this URL instead */
  fundsUrl?: string | null;
}) {
  const deptId = departmentId ? Number(departmentId) : 0;
  const url = fundsUrl ?? (deptId > 0 ? `/api/departments/${deptId}/funds` : null);
  const { data: funds, isSuccess: fundsLoaded } = useQuery<{ paymentCode: string; fundName: string; headName?: string }[]>({
    queryKey: [url ?? "no-funds"],
    enabled: !!url,
  });
  const fundList = Array.isArray(funds) ? funds : [];
  const onlyFund = fundList.length === 1 ? fundList[0] : null;
  useEffect(() => {
    if (onlyFund && !value.fundCode) onChange({ fundCode: onlyFund.paymentCode });
  }, [onlyFund?.paymentCode, value.fundCode]);

  // Suggest the category from the designation while none has been picked
  useEffect(() => {
    if (!value.wageCategory) {
      const c = categoryFromDesignation(designation);
      if (c) onChange({ wageCategory: c });
    }
  }, [designation, value.wageCategory]);

  const digits = (s: string, n: number) => s.replace(/\D/g, "").slice(0, n);
  const inputCls = "bg-white dark:bg-slate-800";
  const errCls = "text-red-500 dark:text-red-400 text-xs mt-1";
  return (
    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg" data-testid="wage-payroll-block">
      <h3 className="text-md font-medium mb-4 text-slate-700 dark:text-slate-200 border-b dark:border-slate-700 pb-2">Wages payroll</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-200">Wage Category <span className="text-red-500">*</span></label>
          <Select disabled={disabled} value={value.wageCategory || undefined} onValueChange={(v) => onChange({ wageCategory: v })}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Select category..." /></SelectTrigger>
            <SelectContent>
              {WAGE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{WAGE_CATEGORY_LABELS[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          {errors.wageCategory && <p className={errCls}>{errors.wageCategory}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-200">Monthly fixed wages (₹)</label>
          <Input type="number" min={0} step={1} value={value.wageMonthlyFixed} disabled={disabled} className={inputCls}
            placeholder="Leave empty for daily rate" data-testid="input-wage-monthly-fixed"
            onChange={(e) => onChange({ wageMonthlyFixed: e.target.value })} />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Only for staff on a fixed monthly amount. Full month = full amount; fewer days are paid pro rata.</p>
          {errors.wageMonthlyFixed && <p className={errCls}>{errors.wageMonthlyFixed}</p>}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-200">Fund (Payment Code)</label>
          {fundList.length > 0 ? (
            <>
              <Select disabled={disabled} value={value.fundCode || undefined} onValueChange={(v) => onChange({ fundCode: v })}>
                <SelectTrigger className={inputCls}><SelectValue placeholder="Select fund..." /></SelectTrigger>
                <SelectContent>
                  {fundList.map((f) => <SelectItem key={f.paymentCode} value={f.paymentCode}>{f.fundName} — {f.paymentCode}</SelectItem>)}
                  {value.fundCode && !fundList.some((f) => f.paymentCode === value.fundCode) && (
                    <SelectItem value={value.fundCode}>{value.fundCode}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {onlyFund && <p className="text-xs text-muted-foreground mt-1">Only fund of this department.</p>}
            </>
          ) : (
            <>
              <Input value={value.fundCode} maxLength={20} disabled={disabled} className={inputCls} placeholder="e.g. 4DE09665"
                onChange={(e) => onChange({ fundCode: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() })} />
              {(deptId > 0 && fundsLoaded) && (
                <p className="text-xs text-muted-foreground mt-1">No fund imported for this department yet (Payroll → Settings → Funds).</p>
              )}
            </>
          )}
          {errors.fundCode && <p className={errCls}>{errors.fundCode}</p>}
        </div>
        <div className="flex items-center gap-3 sm:pt-6">
          <Switch id="payroll-mas" checked={value.masApplicable} disabled={disabled} onCheckedChange={(v) => onChange({ masApplicable: v })} />
          <label htmlFor="payroll-mas" className="text-sm text-slate-700 dark:text-slate-200">MAS member — ₹125 per month</label>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch id="payroll-epf" checked={value.epfApplicable} disabled={disabled} onCheckedChange={(v) => onChange({ epfApplicable: v })} />
            <label htmlFor="payroll-epf" className="text-sm font-medium text-slate-700 dark:text-slate-200">EPF applies</label>
          </div>
          {value.epfApplicable && (
            <div>
              <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">UAN (12 digits)</label>
              <Input value={value.uanNo} inputMode="numeric" maxLength={12} disabled={disabled} className={inputCls}
                onChange={(e) => onChange({ uanNo: digits(e.target.value, 12) })} />
              <p className="text-xs text-muted-foreground mt-1">Needed for the EPF return.</p>
              {errors.uanNo && <p className={errCls}>{errors.uanNo}</p>}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch id="payroll-esi" checked={value.esiApplicable} disabled={disabled} onCheckedChange={(v) => onChange({ esiApplicable: v })} />
            <label htmlFor="payroll-esi" className="text-sm font-medium text-slate-700 dark:text-slate-200">ESI applies</label>
          </div>
          {value.esiApplicable && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">ESI number (10 digits)</label>
                <Input value={value.esiNo} inputMode="numeric" maxLength={10} disabled={disabled} className={inputCls}
                  onChange={(e) => onChange({ esiNo: digits(e.target.value, 10) })} />
                {errors.esiNo && <p className={errCls}>{errors.esiNo}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="payroll-esi-covered" checked={value.esiCovered} disabled={disabled}
                  onCheckedChange={(v) => onChange({ esiCovered: v === true })} />
                <label htmlFor="payroll-esi-covered" className="text-sm text-slate-700 dark:text-slate-200">Already covered in current ESI period</label>
              </div>
            </div>
          )}
        </div>
        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t dark:border-slate-700 pt-4">
          <p className="sm:col-span-3 -mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Bank details (wages are paid into this account)</p>
          {bankAccountSlot && <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">{bankAccountSlot}</div>}
          <div>
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">Bank Name</label>
            <Input value={value.bankName} maxLength={100} disabled={disabled} className={inputCls}
              onChange={(e) => onChange({ bankName: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">Bank Branch</label>
            <Input value={value.bankBranch} maxLength={100} disabled={disabled} className={inputCls}
              onChange={(e) => onChange({ bankBranch: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">IFSC</label>
            <Input value={value.ifsc} maxLength={11} disabled={disabled} className={`${inputCls} uppercase`}
              onChange={(e) => onChange({ ifsc: e.target.value.toUpperCase() })} />
            {errors.ifsc && <p className={errCls}>{errors.ifsc}</p>}
          </div>
        </div>
        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t dark:border-slate-700 pt-4" data-testid="wage-personal-details">
          <p className="sm:col-span-2 -mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Personal details</p>
          <div>
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">Father's Name</label>
            <Input value={value.fatherName} maxLength={100} disabled={disabled} className={`${inputCls} uppercase`}
              onChange={(e) => onChange({ fatherName: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">Mobile No.</label>
            <Input value={value.mobileNo} inputMode="numeric" maxLength={10} disabled={disabled} className={inputCls}
              onChange={(e) => onChange({ mobileNo: digits(e.target.value, 10) })} />
            {errors.mobileNo && <p className={errCls}>{errors.mobileNo}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">Address</label>
            <Textarea value={value.address} maxLength={500} rows={2} disabled={disabled} className={inputCls}
              onChange={(e) => onChange({ address: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1 text-slate-700 dark:text-slate-200">E-mail</label>
            <Input type="email" value={value.personalEmail} maxLength={150} disabled={disabled} className={inputCls}
              onChange={(e) => onChange({ personalEmail: e.target.value })} />
            {errors.personalEmail && <p className={errCls}>{errors.personalEmail}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

const employeeSchema = z.object({
  epid: z.string().min(1, "EPID is required"),
  name: z.string().min(1, "Name is required"),
  panNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  aadharCard: z.string().optional(),
  bankName: z.string().max(100).optional(),
  ifsc: z.string().max(11, "IFSC is 11 characters").optional(),
  employeeCategory: z.enum(["", "Teaching", "Non-Teaching"]).optional(),
  designation: z.string().min(1, "Designation is required"),

  employmentStatus: z.string().refine((v) => v === "" || (ALL_STATUSES as readonly string[]).includes(v), "Invalid status"),
  payLevel: z.enum(PAY_LEVELS),
  termExpiry: z.string().optional(),
  officeMemoNo: z.string().min(1, "Office Memo No. is required"),
  joiningDate: z.string().min(1, "Joining Date is required"),
  joiningShift: z.enum(["FN", "AN"]),
  salaryRegisterNo: z.string().min(1, "Salary Register No. is required"),
  salary_asstt: z.string().min(1, "Salary Assistant is required"),
  // Wages payroll (letter EPIDs only)
  wageCategory: z.string().optional(),
  wageMonthlyFixed: z.string().optional(),
  epfApplicable: z.boolean().optional(),
  uanNo: z.string().optional(),
  esiApplicable: z.boolean().optional(),
  esiNo: z.string().optional(),
  esiCovered: z.boolean().optional(),
  masApplicable: z.boolean().optional(),
  fundCode: z.string().optional(),
  bankBranch: z.string().optional(),
  fatherName: z.string().max(100).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  mobileNo: z.string().optional().nullable(),
  personalEmail: z.string().optional().nullable(),
  // Document fields
  panCardDoc: z.string().optional(),
  bankAccountDoc: z.string().optional(),
  aadharCardDoc: z.string().optional(),
  officeMemoDoc: z.string().optional(),
  joiningReportDoc: z.string().optional(),
  termExtensionDoc: z.string().optional(),
}).superRefine((d, ctx) => {
  if (!isValidEpid(d.epid)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["epid"], message: EPID_FORMAT_MESSAGE });
  }
  if (!d.employmentStatus) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["employmentStatus"], message: "Employment Status is required" });
  } else if (!statusesForEpid(d.epid).includes(d.employmentStatus)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["employmentStatus"], message: "Select a status that matches this EPID" });
  }
  if (requiresTermExpiry(d.epid) && !String(d.termExpiry ?? "").trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["termExpiry"], message: "Term Expiry date is required" });
  }
  if (!dealingAssistantAllowed(d.epid, d.salary_asstt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["salary_asstt"], message: "This Salary Assistant is not allowed for this EPID" });
  }
  if (isLetterEpid(d.epid)) {
    const pe = validatePayroll({ ...EMPTY_PAYROLL, ...(d as any), uanNo: d.uanNo ?? "", esiNo: d.esiNo ?? "", wageCategory: d.wageCategory ?? "", wageMonthlyFixed: d.wageMonthlyFixed ?? "", fundCode: d.fundCode ?? "", bankName: d.bankName ?? "", bankBranch: d.bankBranch ?? "", ifsc: d.ifsc ?? "", fatherName: d.fatherName ?? "", address: d.address ?? "", mobileNo: d.mobileNo ?? "", personalEmail: d.personalEmail ?? "" });
    for (const [k, m] of Object.entries(pe)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: m as string });
  }
});

interface EmployeeFormProps {
  onSubmit: (data: z.infer<typeof employeeSchema>) => Promise<void>;
  isLoading?: boolean;
}

export default function EmployeeForm({ onSubmit, isLoading }: EmployeeFormProps) {
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [duplicateEmployee, setDuplicateEmployee] = useState<{ name: string; departmentName: string } | null>(null);

  // Fetch field visibility settings
  const { data: fieldSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
  });

  const department = getCurrentDepartment();
  
  // Fetch all salary registers dynamically
  const { data: registers } = useQuery<{id: number; value: string; label: string; departmentId: number | null}[]>({
    queryKey: ["/api/salary-registers"],
  });

  const registerNoOptions: ComboboxOption[] = registers 
    ? registers.map(r => ({ value: r.value, label: r.label }))
    : [];
  const showCategory = fieldSettings?.show_employee_category_field === "true";

  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      epid: "",
      name: "",
      panNumber: "",
      bankAccount: "",
      aadharCard: "",
      bankName: "",
      ifsc: "",
      employeeCategory: "",
      designation: "",
      employmentStatus: "Permanent",
      payLevel: "L-0",
      termExpiry: "",
      officeMemoNo: "",
      joiningDate: "",
      joiningShift: "FN",
      salaryRegisterNo: "",
      salary_asstt: "",
      wageCategory: "",
      wageMonthlyFixed: "",
      epfApplicable: false,
      uanNo: "",
      esiApplicable: false,
      esiNo: "",
      esiCovered: false,
      masApplicable: false,
      fundCode: "",
      bankBranch: "",
      fatherName: "",
      address: "",
      mobileNo: "",
      personalEmail: "",
      panCardDoc: "",
      bankAccountDoc: "",
      aadharCardDoc: "",
      officeMemoDoc: "",
      joiningReportDoc: "",
      termExtensionDoc: "",
    },
  });

  // Handle the form submission, catching specific errors
  const handleFormSubmit = async (data: z.infer<typeof employeeSchema>) => {
    try {
      const out: any = { ...data };
      if (isLetterEpid(data.epid)) {
        Object.assign(out, payrollPayload({ ...EMPTY_PAYROLL, ...(data as any), wageCategory: data.wageCategory ?? "", wageMonthlyFixed: data.wageMonthlyFixed ?? "", uanNo: data.uanNo ?? "", esiNo: data.esiNo ?? "", fundCode: data.fundCode ?? "", bankName: data.bankName ?? "", bankBranch: data.bankBranch ?? "", ifsc: data.ifsc ?? "", fatherName: data.fatherName ?? "", address: data.address ?? "", mobileNo: data.mobileNo ?? "", personalEmail: data.personalEmail ?? "" }));
      } else {
        for (const k of PAYROLL_ONLY_KEYS) delete out[k]; // payroll is for letter EPIDs only
      }
      await onSubmit(out);
    } catch (error) {
      if (error instanceof Error && error.message.includes("EPID already exists")) {
        form.setError("epid", {
          type: "manual",
          message: "An employee with this EPID already exists. Please use a unique EPID."
        });
      } else {
        // Handle other errors or re-throw if needed
        console.error("Error submitting employee form:", error);
        // Optionally show a generic error toast or message
      }
    }
  };

  // Handle file compression and validation
  const handleFileChange = async (file: File | null, fieldName: string) => {
    // Clear any previous errors for this field
    setFileErrors(prev => ({ ...prev, [fieldName]: "" }));

    if (!file) {
      form.setValue(fieldName as any, "");
      return;
    }

    // Validate that it's an image
    if (!isImageFile(file)) {
      setFileErrors(prev => ({ ...prev, [fieldName]: "Only image files are allowed" }));
      return;
    }

    try {
      // Compress the image to WebP format
      const result = await compressImageToWebP(file);

      // Log the conversion to verify WebP format

      // Set the field value with the WebP image URL
      form.setValue(fieldName as any, result.url);
    } catch (error) {
      console.error(`Error processing ${fieldName}:`, error);
      setFileErrors(prev => ({ ...prev, [fieldName]: "Failed to process image" }));
    }
  };

  // Duplicate EPID Check
  const watchedEpid = form.watch("epid");
  // Salary Section staff and Revolving Funds staff (letter Employee ID) have their own switches
  const showPan = fieldShown(fieldSettings, "pan", watchedEpid);
  const showBank = fieldShown(fieldSettings, "bank", watchedEpid);
  const showAadhar = fieldShown(fieldSettings, "aadhar", watchedEpid);
  const watchedStatus = form.watch("employmentStatus");
  const statusOptions = statusesForEpid(watchedEpid);
  const assistantOptions: ComboboxOption[] = dealingAssistantOptionsFor(watchedEpid, salaryAssistantOptions);

  // When the EPID kind changes, drop a status / dealing assistant that no longer fits
  useEffect(() => {
    const st = form.getValues("employmentStatus");
    if (!statusesForEpid(watchedEpid).includes(st)) {
      form.setValue("employmentStatus", isLetterEpid(watchedEpid) ? "" : "Permanent");
    }
    if (!dealingAssistantAllowed(watchedEpid, form.getValues("salary_asstt"))) {
      form.setValue("salary_asstt", "");
    }
  }, [watchedEpid]);

  useEffect(() => {
    const checkEpid = async () => {
      if (!watchedEpid || watchedEpid.trim() === "") {
        setDuplicateEmployee(null);
        return;
      }

      try {
        const res = await fetch(`/api/employees/check-epid?epid=${encodeURIComponent(watchedEpid)}`);
        const data = await res.json();
        if (data.exists) {
          setDuplicateEmployee(data.employee);
        } else {
          setDuplicateEmployee(null);
        }
      } catch (error) {
        console.error("Failed to check EPID:", error);
      }
    };

    const timer = setTimeout(checkEpid, 500);
    return () => clearTimeout(timer);
  }, [watchedEpid]);

  // Bank Account + its proof (proof optional) — shown together with the other bank details
  const bankAccountInput = (
    <FormField
      control={form.control}
      name="bankAccount"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Bank Account</FormLabel>
          <FormControl>
            <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  const bankProofUpload = (
    <FormField
      control={form.control}
      name="bankAccountDoc"
      render={({ field }) => (
        <FormItem>
          <FileUpload
            label="Bank Account Proof (optional)"
            name="bankAccountDoc"
            value={field.value}
            onChange={(file) => handleFileChange(file, "bankAccountDoc")}
            disabled={isLoading}
            onlyImages={true}
            errorMessage={fileErrors.bankAccountDoc}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
        <div className="space-y-8">
          {/* Basic Information Section */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-6 text-primary">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                name="epid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EPID</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isLoading}
                        className="bg-white dark:bg-slate-800"
                        maxLength={5}
                        onChange={(e) => {
                          // 5 digits, or 1 letter followed by 4 digits
                          let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                          if (/^[A-Z]/.test(v)) v = v[0] + v.slice(1).replace(/\D/g, '');
                          else v = v.replace(/\D/g, '');
                          field.onChange(v.slice(0, 5));
                        }}
                      />
                    </FormControl>
                    {duplicateEmployee && (
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800 animate-in fade-in slide-in-from-top-1">
                        <div className="font-semibold flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          Employee Already Exists
                        </div>
                        <div className="mt-2 text-xs space-y-1 pl-6">
                          <p>Name: <span className="font-medium">{duplicateEmployee.name}</span></p>
                          <p>Department: <span className="font-medium">{duplicateEmployee.departmentName}</span></p>
                          <div className="pt-2 text-amber-700">
                            To add this employee to your department:
                            <ol className="list-decimal ml-4 mt-1 space-y-1">
                              <li>Close this form.</li>
                              <li>Go to <strong>Global Search</strong>.</li>
                              <li>Search by EPID: <strong>{watchedEpid}</strong>.</li>
                              <li>Click <strong>Request Release / Transfer</strong>.</li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="designation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={designationOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select designation..."
                        searchPlaceholder="Search designation..."
                        emptyMessage="No designation found."
                        className="bg-white dark:bg-slate-800"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="employmentStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Status</FormLabel>
                    <Select
                      disabled={isLoading}
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white dark:bg-slate-800">
                          <SelectValue placeholder="Select status..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="payLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pay Level</FormLabel>
                    <Select
                      disabled={isLoading}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white dark:bg-slate-800">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAY_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showsTermExpiry(watchedEpid, watchedStatus) && (
                <FormField
                  control={form.control}
                  name="termExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Term Expiry Date{requiresTermExpiry(watchedEpid) && <span className="text-red-500"> *</span>}</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" disabled={isLoading} className="bg-white dark:bg-slate-800" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          {/* Wages payroll (letter EPIDs only) */}
          {isLetterEpid(watchedEpid) && (
            <WagePayrollFields
              value={{
                wageCategory: form.watch("wageCategory") ?? "",
                wageMonthlyFixed: form.watch("wageMonthlyFixed") ?? "",
                epfApplicable: !!form.watch("epfApplicable"),
                uanNo: form.watch("uanNo") ?? "",
                esiApplicable: !!form.watch("esiApplicable"),
                esiNo: form.watch("esiNo") ?? "",
                esiCovered: !!form.watch("esiCovered"),
                masApplicable: !!form.watch("masApplicable"),
                fundCode: form.watch("fundCode") ?? "",
                bankName: form.watch("bankName") ?? "",
                bankBranch: form.watch("bankBranch") ?? "",
                ifsc: form.watch("ifsc") ?? "",
                fatherName: form.watch("fatherName") ?? "",
                address: form.watch("address") ?? "",
                mobileNo: form.watch("mobileNo") ?? "",
                personalEmail: form.watch("personalEmail") ?? "",
              }}
              onChange={(patch) => {
                for (const [k, v] of Object.entries(patch)) form.setValue(k as any, v as any, { shouldValidate: form.formState.isSubmitted });
              }}
              errors={{
                wageCategory: form.formState.errors.wageCategory?.message,
                wageMonthlyFixed: form.formState.errors.wageMonthlyFixed?.message,
                uanNo: form.formState.errors.uanNo?.message,
                esiNo: form.formState.errors.esiNo?.message,
                fundCode: form.formState.errors.fundCode?.message,
                ifsc: form.formState.errors.ifsc?.message,
                mobileNo: form.formState.errors.mobileNo?.message,
                personalEmail: form.formState.errors.personalEmail?.message,
              }}
              disabled={isLoading}
              designation={form.watch("designation")}
              departmentId={department?.id}
              bankAccountSlot={showBank ? <>{bankAccountInput}{bankProofUpload}</> : undefined}
            />
          )}

          {/* Identification Details Section */}
          {(showPan || (showBank && !isLetterEpid(watchedEpid)) || showAadhar || showCategory) && (
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-6 text-primary">Identification Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {showPan && (
                  <FormField
                    control={form.control}
                    name="panNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PAN Number</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {/* Regular staff: all bank details together (wage staff have them under Wages payroll) */}
                {showBank && !isLetterEpid(watchedEpid) && <>{bankAccountInput}{bankProofUpload}</>}
                {showBank && !isLetterEpid(watchedEpid) && (
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {showBank && !isLetterEpid(watchedEpid) && (
                  <FormField
                    control={form.control}
                    name="ifsc"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IFSC <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={11} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            disabled={isLoading} className="bg-white dark:bg-slate-800" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {showAadhar && (
                  <FormField
                    control={form.control}
                    name="aadharCard"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Adhar Number</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {showCategory && (
                  <FormField
                    control={form.control}
                    name="employeeCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee Category <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                        <Select disabled={isLoading} onValueChange={(v) => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                          <FormControl>
                            <SelectTrigger className="bg-white dark:bg-slate-800">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Not set</SelectItem>
                            <SelectItem value="Teaching">Teaching</SelectItem>
                            <SelectItem value="Non-Teaching">Non-Teaching</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>
          )}

          {/* Office Details Section */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-6 text-primary">Office Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="officeMemoNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Office Memo No.</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joiningDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Joining Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" disabled={isLoading} className="bg-white dark:bg-slate-800" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joiningShift"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Joining Shift</FormLabel>
                    <Select
                      disabled={isLoading}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white dark:bg-slate-800">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FN">FN</SelectItem>
                        <SelectItem value="AN">AN</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salaryRegisterNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Register No.</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={registerNoOptions}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Select register no..."
                        searchPlaceholder="Search register no..."
                        emptyMessage="No register number found."
                        className="bg-white dark:bg-slate-800"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salary_asstt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Assistant <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={assistantOptions}
                        value={field.value || ""}
                        onValueChange={field.onChange}
                        placeholder="Select salary assistant..."
                        searchPlaceholder="Search salary assistant..."
                        emptyMessage="No salary assistant found."
                        className="bg-white dark:bg-slate-800"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>


          {/* Document Upload Section */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-6 text-primary">Document Upload</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {showPan && (
                <FormField
                  control={form.control}
                  name="panCardDoc"
                  render={({ field }) => (
                    <FormItem>
                      <FileUpload
                        label="PAN Card"
                        name="panCardDoc"
                        value={field.value}
                        onChange={(file) => handleFileChange(file, "panCardDoc")}
                        disabled={isLoading}
                        onlyImages={true}
                        errorMessage={fileErrors.panCardDoc}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {showAadhar && (
                <FormField
                  control={form.control}
                  name="aadharCardDoc"
                  render={({ field }) => (
                    <FormItem>
                      <FileUpload
                        label="Adhar Number"
                        name="aadharCardDoc"
                        value={field.value}
                        onChange={(file) => handleFileChange(file, "aadharCardDoc")}
                        disabled={isLoading}
                        onlyImages={true}
                        errorMessage={fileErrors.aadharCardDoc}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="officeMemoDoc"
                render={({ field }) => (
                  <FormItem>
                    <FileUpload
                      label="Office Memo"
                      name="officeMemoDoc"
                      value={field.value}
                      onChange={(file) => handleFileChange(file, "officeMemoDoc")}
                      disabled={isLoading}
                      onlyImages={true}
                      errorMessage={fileErrors.officeMemoDoc}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joiningReportDoc"
                render={({ field }) => (
                  <FormItem>
                    <FileUpload
                      label="Joining Report"
                      name="joiningReportDoc"
                      value={field.value}
                      onChange={(file) => handleFileChange(file, "joiningReportDoc")}
                      disabled={isLoading}
                      onlyImages={true}
                      errorMessage={fileErrors.joiningReportDoc}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showsTermExpiry(watchedEpid, watchedStatus) && (
                  <FormField
                    control={form.control}
                    name="termExtensionDoc"
                    render={({ field }) => (
                      <FormItem>
                        <FileUpload
                          label="Term Extension Office Memo"
                          name="termExtensionDoc"
                          value={field.value}
                          onChange={(file) => handleFileChange(file, "termExtensionDoc")}
                          disabled={isLoading}
                          onlyImages={true}
                          errorMessage={fileErrors.termExtensionDoc}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
            </div>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Employee"
          )}
        </Button>
      </form>
    </Form>
  );
}