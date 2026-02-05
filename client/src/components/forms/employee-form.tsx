import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { SearchableSelect, ComboboxOption } from "@/components/ui/searchable-select";
import { employmentStatuses } from "@/lib/departments";
import { PAY_LEVELS } from "@/lib/pay-levels";
import { Loader2, AlertCircle } from "lucide-react";
import { compressImageToWebP, isImageFile } from "@/lib/image-utils";
import { useState, useEffect } from "react";

// Import master data for designations and register numbers
import designationsData from "@/lib/designations.json";
import registerNosData from "@/lib/register-nos.json";
import salaryAssistantsData from "@/lib/salary-assistants.json";

// Prepare options for searchable selects
const designationOptions: ComboboxOption[] = designationsData.map((d: string) => ({ value: d, label: d }));
const registerNoOptions: ComboboxOption[] = registerNosData as ComboboxOption[];
const salaryAssistantOptions: ComboboxOption[] = salaryAssistantsData as ComboboxOption[];

const employeeSchema = z.object({
  epid: z.string().min(1, "EPID is required"),
  name: z.string().min(1, "Name is required"),
  panNumber: z.string().optional(),
  bankAccount: z.string().min(1, "Bank Account is required"),
  aadharCard: z.string().optional(),
  designation: z.string().min(1, "Designation is required"),

  employmentStatus: z.enum(employmentStatuses),
  payLevel: z.enum(PAY_LEVELS),
  termExpiry: z.string().optional(),
  officeMemoNo: z.string().min(1, "Office Memo No. is required"),
  joiningDate: z.string().min(1, "Joining Date is required"),
  joiningShift: z.enum(["FN", "AN"]),
  salaryRegisterNo: z.string().min(1, "Salary Register No. is required"),
  salary_asstt: z.string().optional(),
  // Document fields
  panCardDoc: z.string().optional(),
  bankAccountDoc: z.string().optional(),
  aadharCardDoc: z.string().optional(),
  officeMemoDoc: z.string().optional(),
  joiningReportDoc: z.string().optional(),
  termExtensionDoc: z.string().optional(),
});

interface EmployeeFormProps {
  onSubmit: (data: z.infer<typeof employeeSchema>) => Promise<void>;
  isLoading?: boolean;
}

export default function EmployeeForm({ onSubmit, isLoading }: EmployeeFormProps) {
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [duplicateEmployee, setDuplicateEmployee] = useState<{ name: string; departmentName: string } | null>(null);

  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      epid: "",
      name: "",
      panNumber: "",
      bankAccount: "",
      aadharCard: "",
      designation: "",
      employmentStatus: "Permanent",
      payLevel: "L-0",
      termExpiry: "",
      officeMemoNo: "",
      joiningDate: "",
      joiningShift: "FN",
      salaryRegisterNo: "",
      salary_asstt: "",
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
      await onSubmit(data);
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
      console.log(`Converted ${file.name} to WebP: ${result.fileName}`);
      console.log(`Blob type: ${result.blob.type}`);

      // Set the field value with the WebP image URL
      form.setValue(fieldName as any, result.url);
    } catch (error) {
      console.error(`Error processing ${fieldName}:`, error);
      setFileErrors(prev => ({ ...prev, [fieldName]: "Failed to process image" }));
    }
  };

  // Duplicate EPID Check
  const watchedEpid = form.watch("epid");

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
                          const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                          field.onChange(value);
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
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white dark:bg-slate-800">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employmentStatuses.map((status) => (
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
              {(form.watch("employmentStatus") === "Probation" || form.watch("employmentStatus") === "Temporary") && (
                <FormField
                  control={form.control}
                  name="termExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Term Expiry Date</FormLabel>
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

          {/* Identification Details Section */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-6 text-primary">Identification Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
            </div>
          </div>

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
                    <FormLabel>Salary Assistant</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={salaryAssistantOptions}
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
              {(form.watch("employmentStatus") === "Probation" ||
                form.watch("employmentStatus") === "Temporary") && (
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