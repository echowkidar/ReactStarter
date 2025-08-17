import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { getPayLevelOrder } from "@/lib/pay-levels";
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
  console.log("formatDateForInput input:", dateStr);
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) {
    console.error("Invalid date string:", dateStr);
    return "";
  }
  
  try {
    const [day, month, year] = dateStr.split('-').map(Number);
    const result = `20${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    console.log("formatDateForInput output:", result);
    return result;
  } catch (error) {
    console.error("Error formatting date for input:", error, dateStr);
    return "";
  }
};

// Utility function to convert YYYY-MM-DD to DD-MM-YY
const formatDateFromInput = (dateStr: string): string => {
  console.log("formatDateFromInput input:", dateStr);
  try {
    const date = new Date(dateStr);
    const result = formatDateForDisplay(date);
    console.log("formatDateFromInput output:", result);
    return result;
  } catch (error) {
    console.error("Error formatting date from input:", error, dateStr);
    return "";
  }
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

// Add the formatTermExpiry function
const formatTermExpiry = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "-";
  
  try {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    
    return `${day}-${month}-${year}`;
  } catch (error) {
    console.error("Error formatting term expiry date:", error);
    return dateStr;
  }
};

export default function AttendanceForm({ onSubmit, isLoading, reportId, initialData }: AttendanceFormProps) {
  const department = getCurrentDepartment();
  const [includedEmployees, setIncludedEmployees] = useState<Set<number>>(new Set());

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: [`/api/departments/${department?.id}/employees`],
    select: (data: any) => {
      // Filter only active employees and sort by Pay Level (descending) then EPID (ascending)
      return [...data]
        .filter((employee: any) => employee.isActive === "active")
        .sort((a, b) => {
          // First sort by pay level (higher levels first)
          const payLevelA = getPayLevelOrder(a.payLevel || "L-0");
          const payLevelB = getPayLevelOrder(b.payLevel || "L-0");
          
          if (payLevelA !== payLevelB) {
            return payLevelB - payLevelA; // Descending order (higher pay levels first)
          }
          
          // If pay levels are the same, sort by EPID in ascending order
          if (!a.epid) return 1;
          if (!b.epid) return -1;
          return a.epid.localeCompare(b.epid);
        });
    },
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
    const currentEntries = form.getValues("entries") || [];
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

  // Add a function to select/deselect all employees
  const toggleAllEmployees = () => {
    if (includedEmployees.size === employees.length) {
      // Deselect all
      setIncludedEmployees(new Set());
      form.setValue("entries", []);
    } else {
      // Select all
      const allEmployeeIds = new Set(employees.map((employee: any) => employee.id));
      setIncludedEmployees(allEmployeeIds);
      
      // Initialize entries for all employees
      const allEntries = employees.map((employee: any) => ({
        employeeId: employee.id,
        periods: [{
          fromDate: formatDateForDisplay(defaultStartDate),
          toDate: formatDateForDisplay(defaultEndDate),
          days: calculateDays(formatDateForDisplay(defaultStartDate), formatDateForDisplay(defaultEndDate)),
          remarks: "",
        }],
      }));
      
      form.setValue("entries", allEntries);
    }
  };

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

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <div className="flex flex-col items-center">
                    <Checkbox
                      checked={includedEmployees.size === employees.length && employees.length > 0}
                      onCheckedChange={toggleAllEmployees}
                      disabled={isLoading}
                    />
                    <span className="text-xs mt-1">All</span>
                  </div>
                </TableHead>
                <TableHead className="w-[60px]">S.No.</TableHead>
                <TableHead className="w-[80px]">EPID</TableHead>
                <TableHead className="w-[120px]">Name</TableHead>
                <TableHead className="w-[120px]">Designation</TableHead>
                <TableHead className="w-[120px]">Term_Expiry</TableHead>
                <TableHead className="w-[100px]">Reg No.</TableHead>
                <TableHead className="min-w-[500px] px-0">
                  <div className="text-left mb-2">Attendance Periods</div>
                  <div className="grid grid-cols-11 gap-2 text-xs font-normal">
                    <div className="col-span-3">From Date</div>
                    <div className="col-span-3">To Date</div>
                    <div className="col-span-1 text-center">Days</div>
                    <div className="col-span-3">Remarks</div>
                    <div className="col-span-1 text-center">Action</div>
                  </div>
                </TableHead>
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
                  <TableCell className="whitespace-nowrap">
                    {includedEmployees.has(employee.id) ? 
                      Array.from(includedEmployees)
                        .filter(id => includedEmployees.has(id))
                        .sort((a, b) => {
                          const empA = employees.find((e: any) => e.id === a);
                          const empB = employees.find((e: any) => e.id === b);
                          return empA?.epid?.localeCompare(empB?.epid || '') || 0;
                        })
                        .indexOf(employee.id) + 1 
                      : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{employee.epid}</TableCell>
                  <TableCell className="whitespace-nowrap">{employee.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{employee.designation}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatTermExpiry(employee.termExpiry)}</TableCell>
                  <TableCell className="whitespace-nowrap">{employee.salaryRegisterNo || '-'}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {form.getValues("entries")
                        ?.find(entry => entry.employeeId === employee.id)
                        ?.periods?.map((period, periodIndex) => (
                          <div key={periodIndex} className="border p-1.5 rounded-md bg-slate-50 dark:bg-slate-900">
                            <div className="grid grid-cols-11 gap-2 items-center">
                              <div className="col-span-3">
                                <input
                                  type="date"
                                  className="w-full p-2 border rounded-md"
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
                              </div>

                              <div className="col-span-3">
                                <input
                                  type="date"
                                  className="w-full p-2 border rounded-md"
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
                              </div>

                              <div className="col-span-1 text-center">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 border rounded-md text-center">
                                  {period.days}
                                </div>
                              </div>

                              <div className="col-span-3">
                                <input
                                  type="text"
                                  placeholder="Enter remarks"
                                  className="w-full p-2 border rounded-md"
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
                              </div>

                              <div className="col-span-1 flex justify-center">
                                <button
                                  type="button"
                                  className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-md flex items-center justify-center h-10 w-10"
                                  onClick={() => removePeriod(employee.id, periodIndex)}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      {includedEmployees.has(employee.id) && (
                        <button
                          type="button"
                          className="w-full mt-1 h-10 border rounded-md bg-white hover:bg-gray-50 flex items-center justify-center"
                          onClick={() => addPeriod(employee.id)}
                          disabled={isLoading}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <button
          type="submit"
          className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading || includedEmployees.size === 0}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
              Saving...
            </>
          ) : (
            "Create Report"
          )}
        </button>
      </form>
    </Form>
  );
}