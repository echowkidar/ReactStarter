import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { employmentStatuses, bankNames } from "@/lib/departments";
import { Loader2 } from "lucide-react";

const employeeSchema = z.object({
  epid: z.string().min(1, "EPID is required"),
  name: z.string().min(1, "Name is required"),
  panNumber: z.string().min(1, "PAN Number is required"),
  bankAccount: z.string().min(1, "Bank Account is required"),
  bankName: z.enum(bankNames, { message: "Bank Name is required" }),
  aadharCard: z.string().min(1, "Adhar Number is required"),
  designation: z.string().min(1, "Designation is required"),
  employmentStatus: z.enum(employmentStatuses),
  termExpiry: z.string().optional(),
  officeMemoNo: z.string().min(1, "Office Memo No. is required"),
  joiningDate: z.string().min(1, "Joining Date is required"),
  joiningShift: z.enum(["FN", "AN"]),
  salaryRegisterNo: z.string().min(1, "Salary Register No. is required"),
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
  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      epid: "",
      name: "",
      panNumber: "",
      bankAccount: "",
      bankName: "State Bank",
      aadharCard: "",
      designation: "",
      employmentStatus: "Permanent",
      termExpiry: "",
      officeMemoNo: "",
      joiningDate: "",
      joiningShift: "FN",
      salaryRegisterNo: "",
      panCardDoc: "",
      bankAccountDoc: "",
      aadharCardDoc: "",
      officeMemoDoc: "",
      joiningReportDoc: "",
      termExtensionDoc: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
        <div className="space-y-8">
          {/* Basic Information Section */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-6 text-primary">Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="epid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EPID</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
                    </FormControl>
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
                      <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
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
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
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
                        {bankNames.map((bank) => (
                          <SelectItem key={bank} value={bank}>
                            {bank}
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
                      <Input {...field} disabled={isLoading} className="bg-white dark:bg-slate-800" />
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
                      onChange={(file) => {
                        if (file) {
                          field.onChange(URL.createObjectURL(file));
                        } else {
                          field.onChange("");
                        }
                      }}
                      disabled={isLoading}
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
                      onChange={(file) => {
                        if (file) {
                          field.onChange(URL.createObjectURL(file));
                        } else {
                          field.onChange("");
                        }
                      }}
                      disabled={isLoading}
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
                      onChange={(file) => {
                        if (file) {
                          field.onChange(URL.createObjectURL(file));
                        } else {
                          field.onChange("");
                        }
                      }}
                      disabled={isLoading}
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
                      onChange={(file) => {
                        if (file) {
                          field.onChange(URL.createObjectURL(file));
                        } else {
                          field.onChange("");
                        }
                      }}
                      disabled={isLoading}
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
                      onChange={(file) => {
                        if (file) {
                          field.onChange(URL.createObjectURL(file));
                        } else {
                          field.onChange("");
                        }
                      }}
                      disabled={isLoading}
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
                        onChange={(file) => {
                          if (file) {
                            field.onChange(URL.createObjectURL(file));
                          } else {
                            field.onChange("");
                          }
                        }}
                        disabled={isLoading}
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