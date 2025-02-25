import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { employmentStatuses } from "@/lib/departments";
import { Loader2 } from "lucide-react";

const employeeSchema = z.object({
  epid: z.string().min(1, "EPID is required"),
  name: z.string().min(1, "Name is required"),
  panNumber: z.string().min(1, "PAN Number is required"),
  bankAccount: z.string().min(1, "Bank Account is required"),
  aadharCard: z.string().min(1, "Aadhar Card is required"),
  designation: z.string().min(1, "Designation is required"),
  employmentStatus: z.enum(employmentStatuses),
  termExpiry: z.string().optional(),
  officeMemoNo: z.string().min(1, "Office Memo No. is required"),
  joiningDate: z.string().min(1, "Joining Date is required"),
  joiningShift: z.enum(["FN", "AN"]),
  salaryRegisterNo: z.string().min(1, "Salary Register No. is required"),
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
      aadharCard: "",
      designation: "",
      employmentStatus: "Permanent",
      termExpiry: "",
      officeMemoNo: "",
      joiningDate: "",
      joiningShift: "FN",
      salaryRegisterNo: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="epid"
            render={({ field }) => (
              <FormItem>
                <FormLabel>EPID</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isLoading} />
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
                  <Input {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="panNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PAN Number</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isLoading} />
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
                  <Input {...field} disabled={isLoading} />
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
                <FormLabel>Aadhar Card</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isLoading} />
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
                  <Input {...field} disabled={isLoading} />
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
                    <SelectTrigger>
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
          {form.watch("employmentStatus") !== "Permanent" && (
            <FormField
              control={form.control}
              name="termExpiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Term Expiry Date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" disabled={isLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="officeMemoNo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Office Memo No.</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isLoading} />
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
                  <Input {...field} type="date" disabled={isLoading} />
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
                    <SelectTrigger>
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
                  <Input {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
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