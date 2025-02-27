import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { employmentStatuses } from "@/lib/departments";
import { insertEmployeeSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function EditEmployeeForm({ employee, isOpen, onClose, onSuccess }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    resolver: zodResolver(insertEmployeeSchema),
    defaultValues: {
      epid: employee.epid,
      name: employee.name,
      designation: employee.designation,
      employmentStatus: employee.employmentStatus,
      panNumber: employee.panNumber,
      bankAccount: employee.bankAccount,
      aadharCard: employee.aadharCard,
      officeMemoNo: employee.officeMemoNo,
      joiningDate: employee.joiningDate,
      joiningShift: employee.joiningShift,
      salaryRegisterNo: employee.salaryRegisterNo,
      departmentId: employee.departmentId,
    }
  });

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);
      const formData = new FormData();
      
      // Append file fields if files are selected
      if (form.watch("panCardDoc")?.[0]) {
        formData.append("panCardDoc", form.watch("panCardDoc")[0]);
      }
      if (form.watch("bankAccountDoc")?.[0]) {
        formData.append("bankAccountDoc", form.watch("bankAccountDoc")[0]);
      }
      if (form.watch("aadharCardDoc")?.[0]) {
        formData.append("aadharCardDoc", form.watch("aadharCardDoc")[0]);
      }
      if (form.watch("officeMemoDoc")?.[0]) {
        formData.append("officeMemoDoc", form.watch("officeMemoDoc")[0]);
      }
      if (form.watch("joiningReportDoc")?.[0]) {
        formData.append("joiningReportDoc", form.watch("joiningReportDoc")[0]);
      }

      // Append other form data
      Object.entries(data).forEach(([key, value]) => {
        if (key.endsWith("Doc")) return; // Skip file fields
        formData.append(key, value);
      });

      // Preserve existing document URLs
      formData.append("panCardUrl", employee.panCardUrl || "");
      formData.append("bankProofUrl", employee.bankProofUrl || "");
      formData.append("aadharCardUrl", employee.aadharCardUrl || "");
      formData.append("officeMemoUrl", employee.officeMemoUrl || "");
      formData.append("joiningReportUrl", employee.joiningReportUrl || "");

      await apiRequest(`/api/employees/${employee.id}`, {
        method: "PATCH",
        body: formData,
      });

      toast({
        title: "Success",
        description: "Employee updated successfully",
      });

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error updating employee:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update employee",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="epid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EPID</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                      <Input {...field} />
                    </FormControl>
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
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="employmentStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employmentStatuses.map(status => (
                          <SelectItem key={status} value={status.toLowerCase()}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {/* Document upload fields */}
              <FormField
                control={form.control}
                name="panCardDoc"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>PAN Card</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                        {employee.panCardUrl && (
                          <a href={employee.panCardUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                            View existing document
                          </a>
                        )}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bankAccountDoc"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Bank Account Proof</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                        {employee.bankProofUrl && (
                          <a href={employee.bankProofUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                            View existing document
                          </a>
                        )}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aadharCardDoc"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Aadhar Card</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                        {employee.aadharCardUrl && (
                          <a href={employee.aadharCardUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                            View existing document
                          </a>
                        )}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="officeMemoDoc"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Office Memo</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                        {employee.officeMemoUrl && (
                          <a href={employee.officeMemoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                            View existing document
                          </a>
                        )}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="joiningReportDoc"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Joining Report</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                        {employee.joiningReportUrl && (
                          <a href={employee.joiningReportUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600">
                            View existing document
                          </a>
                        )}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Updating..." : "Update Employee"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
