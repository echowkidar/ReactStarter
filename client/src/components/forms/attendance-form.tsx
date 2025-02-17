import { useState } from "react";
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
import { Loader2, Plus, X } from "lucide-react";
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
    periods: z.array(z.object({
      fromDate: z.string(),
      toDate: z.string(),
      days: z.number().min(0).max(31),
      remarks: z.string().optional(),
    })).min(1),
  })).min(1, "At least one employee entry is required"),
});

type AttendanceFormData = z.infer<typeof attendanceSchema>;

interface AttendanceFormProps {
  onSubmit: (data: AttendanceFormData) => Promise<void>;
  isLoading?: boolean;
}

export default function AttendanceForm({ onSubmit, isLoading }: AttendanceFormProps) {
  const department = getCurrentDepartment();
  const [includedEmployees, setIncludedEmployees] = useState<Set<number>>(new Set());

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

  // Calculate period dates
  const selectedMonth = parseInt(form.watch("month"));
  const selectedYear = parseInt(form.watch("year"));
  const defaultStartDate = new Date(selectedYear, selectedMonth - 1, 1);
  const defaultEndDate = new Date(selectedYear, selectedMonth, 0);

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const calculateDays = (fromDate: string, toDate: string) => {
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // Update entries when employees data is loaded or included employees change
  React.useEffect(() => {
    if (employees.length > 0) {
      const entries = employees
        .filter((employee: any) => includedEmployees.has(employee.id))
        .map((employee: any) => ({
          employeeId: employee.id,
          periods: [{
            fromDate: formatDate(defaultStartDate),
            toDate: formatDate(defaultEndDate),
            days: calculateDays(formatDate(defaultStartDate), formatDate(defaultEndDate)),
            remarks: "",
          }],
        }));

      form.setValue("entries", entries);
    }
  }, [employees, includedEmployees, form, selectedMonth, selectedYear]);

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

  const addPeriod = (employeeId: number) => {
    const entries = form.getValues("entries");
    const entryIndex = entries.findIndex(entry => entry.employeeId === employeeId);

    if (entryIndex !== -1) {
      const newEntries = [...entries];
      newEntries[entryIndex].periods.push({
        fromDate: formatDate(defaultStartDate),
        toDate: formatDate(defaultEndDate),
        days: calculateDays(formatDate(defaultStartDate), formatDate(defaultEndDate)),
        remarks: "",
      });
      form.setValue("entries", newEntries);
    }
  };

  const removePeriod = (employeeId: number, periodIndex: number) => {
    const entries = form.getValues("entries");
    const entryIndex = entries.findIndex(entry => entry.employeeId === employeeId);

    if (entryIndex !== -1 && entries[entryIndex].periods.length > 1) {
      const newEntries = [...entries];
      newEntries[entryIndex].periods.splice(periodIndex, 1);
      form.setValue("entries", newEntries);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        periods: entry.periods.map(period => ({
                          ...period,
                          days: Math.min(period.days, daysInNewMonth),
                        }))
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
                        periods: entry.periods.map(period => ({
                          ...period,
                          days: Math.min(period.days, daysInNewMonth),
                        }))
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
                <TableHead>Attendance Periods</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee: any) => (
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
                  <TableCell>
                    <div className="space-y-2">
                      {form.getValues("entries")
                        .find(entry => entry.employeeId === employee.id)
                        ?.periods.map((period, periodIndex) => (
                          <div key={periodIndex} className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={period.fromDate}
                              onChange={(e) => {
                                const entries = form.getValues("entries");
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                if (entryIndex !== -1) {
                                  const newEntries = [...entries];
                                  newEntries[entryIndex].periods[periodIndex].fromDate = e.target.value;
                                  newEntries[entryIndex].periods[periodIndex].days = 
                                    calculateDays(e.target.value, period.toDate);
                                  form.setValue("entries", newEntries);
                                }
                              }}
                              disabled={isLoading || !includedEmployees.has(employee.id)}
                            />
                            <Input
                              type="date"
                              value={period.toDate}
                              onChange={(e) => {
                                const entries = form.getValues("entries");
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                if (entryIndex !== -1) {
                                  const newEntries = [...entries];
                                  newEntries[entryIndex].periods[periodIndex].toDate = e.target.value;
                                  newEntries[entryIndex].periods[periodIndex].days = 
                                    calculateDays(period.fromDate, e.target.value);
                                  form.setValue("entries", newEntries);
                                }
                              }}
                              disabled={isLoading || !includedEmployees.has(employee.id)}
                            />
                            <div className="w-20 text-center">
                              {period.days} days
                            </div>
                            <Input
                              placeholder="Remarks"
                              value={period.remarks}
                              onChange={(e) => {
                                const entries = form.getValues("entries");
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                if (entryIndex !== -1) {
                                  const newEntries = [...entries];
                                  newEntries[entryIndex].periods[periodIndex].remarks = e.target.value;
                                  form.setValue("entries", newEntries);
                                }
                              }}
                              disabled={isLoading || !includedEmployees.has(employee.id)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removePeriod(employee.id, periodIndex)}
                              disabled={isLoading || !includedEmployees.has(employee.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      {includedEmployees.has(employee.id) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addPeriod(employee.id)}
                          disabled={isLoading}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Period
                        </Button>
                      )}
                    </div>
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