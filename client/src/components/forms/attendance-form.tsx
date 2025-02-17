import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import React from 'react';

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const attendanceSchema = z.object({
  month: z.string().min(1),
  year: z.string().min(1),
  entries: z.array(z.object({
    employeeId: z.number(),
    days: z.number().min(0).max(31),
    remarks: z.string().optional(),
  })).min(1, "At least one employee entry is required"),
});

type AttendanceFormData = z.infer<typeof attendanceSchema>;

interface AttendanceFormProps {
  onSubmit: (data: AttendanceFormData) => Promise<void>;
  isLoading?: boolean;
}

export default function AttendanceForm({ onSubmit, isLoading }: AttendanceFormProps) {
  const department = getCurrentDepartment();
  const [includedEmployees, setIncludedEmployees] = React.useState<Set<number>>(new Set());

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: [`/api/departments/${department?.id}/employees`],
    select: (data: any) => data || [],
  });

  const form = useForm<AttendanceFormData>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: {
      month: String(new Date().getMonth() + 1),
      year: String(currentYear),
      entries: [],
    },
  });

  // Update entries when employees data is loaded or included employees change
  React.useEffect(() => {
    if (employees.length > 0) {
      const currentMonth = parseInt(form.getValues("month"));
      const currentYear = parseInt(form.getValues("year"));
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

      const entries = employees
        .filter((employee: any) => includedEmployees.has(employee.id))
        .map((employee: any) => ({
          employeeId: employee.id,
          days: daysInMonth,
          remarks: "",
        }));

      form.setValue("entries", entries);
    }
  }, [employees, includedEmployees, form]);

  if (loadingEmployees) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const selectedMonth = parseInt(form.watch("month"));
  const selectedYear = parseInt(form.watch("year"));
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  const handleSubmit = async (data: AttendanceFormData) => {
    // Validate and clean up the data before submission
    const cleanData = {
      ...data,
      entries: data.entries.map(entry => ({
        employeeId: entry.employeeId,
        days: Math.min(Math.max(0, entry.days), daysInMonth),
        remarks: entry.remarks || "",
      })),
    };
    await onSubmit(cleanData);
  };

  const toggleEmployee = (employeeId: number) => {
    setIncludedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="month"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Month</FormLabel>
                <Select
                  disabled={isLoading}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const daysInNewMonth = new Date(selectedYear, parseInt(value) - 1, 0).getDate();
                    const currentEntries = form.getValues("entries");
                    form.setValue(
                      "entries",
                      currentEntries.map((entry) => ({
                        ...entry,
                        days: Math.min(entry.days, daysInNewMonth),
                      }))
                    );
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {months.map((month, index) => (
                      <SelectItem key={month} value={String(index + 1)}>
                        {month}
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
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year</FormLabel>
                <Select
                  disabled={isLoading}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const daysInNewMonth = new Date(parseInt(value), selectedMonth - 1, 0).getDate();
                    const currentEntries = form.getValues("entries");
                    form.setValue(
                      "entries",
                      currentEntries.map((entry) => ({
                        ...entry,
                        days: Math.min(entry.days, daysInNewMonth),
                      }))
                    );
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Include</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Days Present (max: {daysInMonth})</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee: any, index: number) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <Checkbox
                      checked={includedEmployees.has(employee.id)}
                      onCheckedChange={() => toggleEmployee(employee.id)}
                      disabled={isLoading}
                    />
                  </TableCell>
                  <TableCell>{employee.employeeId}</TableCell>
                  <TableCell>{employee.name}</TableCell>
                  <TableCell>{employee.designation}</TableCell>
                  <TableCell className="w-32">
                    <Input
                      type="number"
                      min={0}
                      max={daysInMonth}
                      defaultValue={daysInMonth}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 0;
                        const entries = form.getValues("entries");
                        const newEntries = [...entries];
                        const entryIndex = newEntries.findIndex(entry => entry.employeeId === employee.id);

                        if (entryIndex !== -1) {
                          newEntries[entryIndex] = {
                            employeeId: employee.id,
                            days: Math.min(Math.max(0, value), daysInMonth),
                            remarks: newEntries[entryIndex].remarks || "",
                          };
                          form.setValue("entries", newEntries);
                        }
                      }}
                      disabled={isLoading || !includedEmployees.has(employee.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      onChange={(e) => {
                        const entries = form.getValues("entries");
                        const newEntries = [...entries];
                        const entryIndex = newEntries.findIndex(entry => entry.employeeId === employee.id);

                        if (entryIndex !== -1) {
                          newEntries[entryIndex] = {
                            employeeId: employee.id,
                            days: newEntries[entryIndex].days,
                            remarks: e.target.value,
                          };
                          form.setValue("entries", newEntries);
                        }
                      }}
                      disabled={isLoading || !includedEmployees.has(employee.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading || includedEmployees.size === 0}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Create Report"
          )}
        </Button>
      </form>
    </Form>
  );
}