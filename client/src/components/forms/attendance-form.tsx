import React, { useState, useEffect } from "react";
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

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

// Utility function to format date to DD-MM-YY
const formatDateForDisplay = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
};

// Utility function to convert DD-MM-YY to YYYY-MM-DD for input type="date"
const formatDateForInput = (dateStr: string): string => {
  const [day, month, year] = dateStr.split('-').map(Number);
  return `20${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

// Utility function to convert YYYY-MM-DD to DD-MM-YY
const formatDateFromInput = (dateStr: string): string => {
  const date = new Date(dateStr);
  return formatDateForDisplay(date);
};

const calculateDays = (fromDate: string, toDate: string): number => {
  // Parse DD-MM-YY format
  const [fromDay, fromMonth, fromYear] = fromDate.split('-').map(Number);
  const [toDay, toMonth, toYear] = toDate.split('-').map(Number);

  const start = new Date(2000 + fromYear, fromMonth - 1, fromDay);
  const end = new Date(2000 + toYear, toMonth - 1, toDay);

  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

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
  reportId?: string | null;
  initialData?: {
    month: string;
    year: string;
    entries: Array<{
      employeeId: number;
      periods: Array<{
        fromDate: string;
        toDate: string;
        days: number;
        remarks?: string;
      }>;
    }>;
  };
}

export default function AttendanceForm({ onSubmit, isLoading, reportId, initialData }: AttendanceFormProps) {
  const department = getCurrentDepartment();
  const [includedEmployees, setIncludedEmployees] = useState<Set<number>>(new Set());

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: [`/api/departments/${department?.id}/employees`],
    select: (data: any) => data || [],
  });

  const selectedMonth = parseInt(initialData?.month || String(new Date().getMonth() + 1));
  const selectedYear = parseInt(initialData?.year || String(currentYear));

  // Calculate first and last day of selected month
  const defaultStartDate = new Date(selectedYear, selectedMonth - 1, 1);
  const defaultEndDate = new Date(selectedYear, selectedMonth, 0);


  const form = useForm<AttendanceFormData>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: initialData || {
      month: String(selectedMonth),
      year: String(selectedYear),
      entries: [{
        employeeId: 0,
        periods: [{
          fromDate: formatDateForDisplay(defaultStartDate),
          toDate: formatDateForDisplay(defaultEndDate),
          days: calculateDays(
            formatDateForDisplay(defaultStartDate),
            formatDateForDisplay(defaultEndDate)
          ),
          remarks: ""
        }],
      }],
    },
  });

  const toggleEmployee = (employeeId: number) => {
    setIncludedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
        // Remove employee entries when unchecked
        const currentEntries = form.getValues("entries") || [];
        form.setValue("entries", currentEntries.filter(entry => entry.employeeId !== employeeId));
      } else {
        next.add(employeeId);
        // Initialize entry when adding employee
        const currentEntries = form.getValues("entries") || [];
        form.setValue("entries", [
          ...currentEntries,
          {
            employeeId,
            periods: [{
              fromDate: formatDateForDisplay(defaultStartDate),
              toDate: formatDateForDisplay(defaultEndDate),
              days: calculateDays(formatDateForDisplay(defaultStartDate), formatDateForDisplay(defaultEndDate)),
              remarks: "",
            }],
          },
        ]);
      }
      return next;
    });
  };

  const addPeriod = (employeeId: number) => {
    const currentEntries = [...form.getValues("entries")] || [];
    const entryIndex = currentEntries.findIndex(entry => entry.employeeId === employeeId);

    if (entryIndex === -1) return;

    const newPeriod = {
      fromDate: formatDateForDisplay(defaultStartDate),
      toDate: formatDateForDisplay(defaultEndDate),
      days: calculateDays(formatDateForDisplay(defaultStartDate), formatDateForDisplay(defaultEndDate)),
      remarks: "",
    };

    const updatedPeriods = [...currentEntries[entryIndex].periods, newPeriod];
    currentEntries[entryIndex] = {
      ...currentEntries[entryIndex],
      periods: updatedPeriods,
    };

    form.setValue("entries", currentEntries, { shouldDirty: true });
    form.trigger("entries");
  };

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name?.includes('entries')) {
        form.trigger('entries');
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const removePeriod = (employeeId: number, periodIndex: number) => {
    const currentEntries = form.getValues("entries");
    const entryIndex = currentEntries.findIndex(entry => entry.employeeId === employeeId);

    if (entryIndex !== -1 && currentEntries[entryIndex].periods.length > 1) {
      const newEntries = [...currentEntries];
      newEntries[entryIndex] = {
        ...newEntries[entryIndex],
        periods: newEntries[entryIndex].periods.filter((_, index) => index !== periodIndex),
      };
      form.setValue("entries", newEntries);
    }
  };

  // Remove employee entries when unselected
  useEffect(() => {
    const currentEntries = form.getValues("entries") || [];
    const filteredEntries = currentEntries.filter(entry => includedEmployees.has(entry.employeeId));
    form.setValue("entries", filteredEntries);
  }, [includedEmployees, form]);

  // Update the useEffect for initialData
  useEffect(() => {
    if (initialData?.entries) {
      // Set included employees
      const employeeIds = new Set(initialData.entries.map(entry => entry.employeeId));
      setIncludedEmployees(employeeIds);

      // Update form with initial data, ensuring periods are properly set
      const formattedData = {
        ...initialData,
        entries: initialData.entries.map(entry => ({
          employeeId: entry.employeeId,
          periods: entry.periods.map(period => ({
            fromDate: period.fromDate,
            toDate: period.toDate,
            days: calculateDays(period.fromDate, period.toDate),
            remarks: period.remarks || ''
          }))
        }))
      };

      form.reset(formattedData);
    }
  }, [initialData, form]);

  if (loadingEmployees) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

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
                  onValueChange={field.onChange}
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
                  onValueChange={field.onChange}
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
                <TableHead>EPID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Reg No.</TableHead>
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
                  <TableCell>{employee.salaryRegisterNo || '-'}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {form.getValues("entries")
                        ?.find(entry => entry.employeeId === employee.id)
                        ?.periods?.map((period, periodIndex) => (
                          <div key={periodIndex} className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={formatDateForInput(period.fromDate)}
                              onChange={(e) => {
                                const entries = form.getValues("entries");
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                if (entryIndex !== -1) {
                                  const newEntries = [...entries];
                                  const newFromDate = formatDateFromInput(e.target.value);
                                  newEntries[entryIndex].periods[periodIndex].fromDate = newFromDate;
                                  newEntries[entryIndex].periods[periodIndex].days =
                                    calculateDays(newFromDate, period.toDate);
                                  form.setValue("entries", newEntries);
                                }
                              }}
                              disabled={isLoading || !includedEmployees.has(employee.id)}
                            />
                            <Input
                              type="date"
                              value={formatDateForInput(period.toDate)}
                              onChange={(e) => {
                                const entries = form.getValues("entries");
                                const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                if (entryIndex !== -1) {
                                  const newEntries = [...entries];
                                  const newToDate = formatDateFromInput(e.target.value);
                                  newEntries[entryIndex].periods[periodIndex].toDate = newToDate;
                                  newEntries[entryIndex].periods[periodIndex].days =
                                    calculateDays(period.fromDate, newToDate);
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