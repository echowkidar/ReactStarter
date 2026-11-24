import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { SearchableSelect, ComboboxOption } from "@/components/ui/searchable-select";
import { ALL_STATUSES, statusesForEpid, isValidEpid, isLetterEpid, EPID_FORMAT_MESSAGE, showsTermExpiry, requiresTermExpiry, dealingAssistantAllowed, dealingAssistantOptionsFor } from "@shared/employeeKind";
import { PAY_LEVELS } from "@/lib/pay-levels";
import { Loader2, AlertCircle } from "lucide-react";
import { compressImageToWebP, isImageFile } from "@/lib/image-utils";
import { useState, useEffect } from "react";
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
  epfApplicable: boolean;
  uanNo: string;
  esiApplicable: boolean;
  esiNo: string;
  esiCovered: boolean;
  masApplicable: boolean;
};

export const EMPTY_PAYROLL: PayrollValue = {
  wageCategory: "", epfApplicable: false, uanNo: "", esiApplicable: false, esiNo: "", esiCovered: false, masApplicable: false,
};

/** Read the payroll values from a stored employee row (camelCase or snake_case) */
export function payrollFromEmployee(emp: any): PayrollValue {
  const pick = (a: string, b: string) => emp?.[a] ?? emp?.[b];
  const flag = (v: any) => v === true || v === "true" || v === 1 || v === "1";
  return {
    wageCategory: String(pick("wageCategory", "wage_category") ?? ""),
    epfApplicable: flag(pick("epfApplicable", "epf_applicable")),
    uanNo: String(pick("uanNo", "uan_no") ?? ""),
    esiApplicable: flag(pick("esiApplicable", "esi_applicable")),
    esiNo: String(pick("esiNo", "esi_no") ?? ""),
    esiCovered: flag(pick("esiCovered", "esi_covered")),
    masApplicable: flag(pick("masApplicable", "mas_applicable")),
  };
}

/** Client-side check; returns field -> message (empty object when fine) */
export function validatePayroll(v: PayrollValue): Partial<Record<keyof PayrollValue, string>> {
  const e: Partial<Record<keyof PayrollValue, string>> = {};
  if (!v.wageCategory) e.wageCategory = "Wage Category is required";
  if (v.epfApplicable && v.uanNo.trim() && !/^\d{12}$/.test(v.uanNo.trim())) e.uanNo = "UAN must be 12 digits";
  if (v.esiApplicable && v.esiNo.trim() && !/^\d{10}$/.test(v.esiNo.trim())) e.esiNo = "ESI number must be 10 digits";
  return e;
}

/** The values to send with the form */
export function payrollPayload(v: PayrollValue) {
  return {
    wageCategory: v.wageCategory,
    epfApplicable: v.epfApplicable,
    uanNo: v.epfApplicable ? v.uanNo.trim() : "",
    esiApplicable: v.esiApplicable,
    esiNo: v.esiApplicable ? v.esiNo.trim() : "",
    esiCovered: v.esiApplicable ? v.esiCovered : false,
    masApplicable: v.masApplicable,
  };
}

export function WagePayrollFields({ value, onChange, errors = {}, disabled, designation }: {
  value: PayrollValue;
  onChange: (patch: Partial<PayrollValue>) => void;
  errors?: Partial<Record<keyof PayrollValue, string>>;
  disabled?: boolean;
  designation?: string;
}) {
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
  epfApplicable: z.boolean().optional(),
  uanNo: z.string().optional(),
  esiApplicable: z.boolean().optional(),
  esiNo: z.string().optional(),
  esiCovered: z.boolean().optional(),
  masApplicable: z.boolean().optional(),
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
    const pe = validatePayroll({ ...EMPTY_PAYROLL, ...(d as any), uanNo: d.uanNo ?? "", esiNo: d.esiNo ?? "", wageCategory: d.wageCategory ?? "" });
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
  const showPan = fieldSettings?.show_pan_field !== "false";
  const showBank = fieldSettings?.show_bank_field !== "false";
  const showAadhar = fieldSettings?.show_aadhar_field !== "false";
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
      epfApplicable: false,
      uanNo: "",
      esiApplicable: false,
      esiNo: "",
      esiCovered: false,
      masApplicable: false,
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
        Object.assign(out, payrollPayload({ ...EMPTY_PAYROLL, ...(data as any), wageCategory: data.wageCategory ?? "", uanNo: data.uanNo ?? "", esiNo: data.esiNo ?? "" }));
      } else {
        for (const k of Object.keys(EMPTY_PAYROLL)) delete out[k]; // payroll is for letter EPIDs only
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
                epfApplicable: !!form.watch("epfApplicable"),
                uanNo: form.watch("uanNo") ?? "",
                esiApplicable: !!form.watch("esiApplicable"),
                esiNo: form.watch("esiNo") ?? "",
                esiCovered: !!form.watch("esiCovered"),
                masApplicable: !!form.watch("masApplicable"),
              }}
              onChange={(patch) => {
                for (const [k, v] of Object.entries(patch)) form.setValue(k as any, v as any, { shouldValidate: form.formState.isSubmitted });
              }}
              errors={{
                wageCategory: form.formState.errors.wageCategory?.message,
                uanNo: form.formState.errors.uanNo?.message,
                esiNo: form.formState.errors.esiNo?.message,
              }}
              disabled={isLoading}
              designation={form.watch("designation")}
            />
          )}

          {/* Identification Details Section */}
          {(showPan || showBank || showAadhar || showCategory) && (
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
                {showBank && (
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
                {showBank && (
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
                {showBank && (
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
              {showBank && (
                <FormField
                  control={form.control}
                  name="bankAccountDoc"
                  render={({ field }) => (
                    <FormItem>
                      <FileUpload
                        label="Bank Account Proof"
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