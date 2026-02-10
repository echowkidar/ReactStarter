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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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

const parseDateFromDisplay = (dateStr: string): Date => {
  const [day, month, year] = dateStr.split('-').map(Number);
  return new Date(2000 + year, month - 1, day);
};

const attendanceSchema = z.object({
  month: z.string().min(1),
  year: z.string().min(1),
  entries: z.array(z.object({
    employeeId: z.number(),
    periods: z.array(z.object({
      fromDate: z.string(),
      toDate: z.string(),
      days: z.number().min(0).max(365),
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
  const [includeExcluded, setIncludeExcluded] = useState(false); // Mode: With Break
  const [includeExcludedFull, setIncludeExcludedFull] = useState(false); // Mode: Full Month

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

  const isGuestTeacher = (empId: number) => {
    const emp = employees.find((e: any) => e.id === empId);
    return emp?.designation?.toUpperCase() === 'GUEST TEACHER';
  };

  // Check if two date ranges overlap (dates in DD-MM-YY format)
  const doPeriodsOverlap = (
    from1: string, to1: string,
    from2: string, to2: string
  ): boolean => {
    const start1 = parseDateFromDisplay(from1);
    const end1 = parseDateFromDisplay(to1);
    const start2 = parseDateFromDisplay(from2);
    const end2 = parseDateFromDisplay(to2);
    return start1 <= end2 && start2 <= end1;
  };

  // Check if a period overlaps with any existing period for an employee (excluding a specific index)
  const hasOverlap = (
    employeeId: number,
    fromDate: string,
    toDate: string,
    excludeIndex?: number
  ): boolean => {
    const entries = form.getValues("entries") || [];
    const entry = entries.find(e => e.employeeId === employeeId);
    if (!entry) return false;
    return entry.periods.some((p, idx) => {
      if (idx === excludeIndex) return false;
      return doPeriodsOverlap(fromDate, toDate, p.fromDate, p.toDate);
    });
  };



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
        const fromDateStr = formatDateForDisplay(defaultStartDate);
        const toDateStr = formatDateForDisplay(defaultEndDate);
        form.setValue("entries", [
          ...currentEntries,
          {
            employeeId,
            periods: [{
              fromDate: fromDateStr,
              toDate: toDateStr,
              days: isGuestTeacher(employeeId) ? 0 : calculateDays(fromDateStr, toDateStr),
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

    const fromDateStr = formatDateForDisplay(defaultStartDate);
    const toDateStr = formatDateForDisplay(defaultEndDate);


    const newPeriod = {
      fromDate: fromDateStr,
      toDate: toDateStr,
      days: isGuestTeacher(employeeId) ? 0 : calculateDays(fromDateStr, toDateStr),
      remarks: "",
    };

    const newEntries = [...currentEntries];
    newEntries[entryIndex] = {
      ...newEntries[entryIndex],
      periods: [...newEntries[entryIndex].periods, newPeriod],
    };

    form.setValue("entries", newEntries, { shouldDirty: true });
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
      form.setValue("entries", newEntries, { shouldDirty: true });
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
            days: isGuestTeacher(entry.employeeId) ? (period.days || 0) : calculateDays(period.fromDate, period.toDate),
            remarks: period.remarks || ''
          }))
        }))
      };

      form.reset(formattedData);
    }
  }, [initialData, form]);

  // Designations to exclude from "All" selection (Daily Wage employees with breaks)
  const excludedDesignations = [
    "DAILY WAGE (SEMI-SKILLED)",
    "DAILY WAGE (CLERICAL/SKILLED)",
    "DAILY WAGE (UN-SKILLED)"
  ];

  // Filter employees eligible for "All" selection
  const eligibleEmployees = employees.filter(
    (emp: any) => includeExcluded || includeExcludedFull || !excludedDesignations.includes(emp.designation?.toUpperCase())
  );

  // Add a function to select/deselect all eligible employees (excludes Daily Wage)
  const toggleAllEmployees = () => {
    const eligibleIds = new Set(eligibleEmployees.map((emp: any) => emp.id));
    const currentEligibleSelected = [...includedEmployees].filter(id => eligibleIds.has(id));

    if (currentEligibleSelected.length === eligibleEmployees.length && eligibleEmployees.length > 0) {
      // Deselect all eligible (keep manually selected Daily Wage employees)
      const dailyWageSelected = [...includedEmployees].filter(id => !eligibleIds.has(id));
      setIncludedEmployees(new Set(dailyWageSelected));

      // Remove only eligible employee entries
      const currentEntries = form.getValues("entries") || [];
      form.setValue("entries", currentEntries.filter(entry => !eligibleIds.has(entry.employeeId)));
    } else {
      // Select all eligible employees (keep existing Daily Wage selections)
      const newIncluded = new Set([...includedEmployees, ...eligibleEmployees.map((emp: any) => emp.id)]);
      setIncludedEmployees(newIncluded);

      // Initialize entries for newly added eligible employees
      const currentEntries = form.getValues("entries") || [];
      const existingIds = new Set(currentEntries.map(e => e.employeeId));

      const newEntries = eligibleEmployees
        .filter((emp: any) => !existingIds.has(emp.id))
        .map((employee: any) => {
          // Check if excluded designation (Daily Wage)
          const isExcluded = excludedDesignations.includes(employee.designation?.toUpperCase());
          let endDate = defaultEndDate;

          if (isExcluded) {
            // One day before month end for Daily Wagers
            endDate = new Date(defaultEndDate);
            endDate.setDate(endDate.getDate() - 1);
          }

          const fromStr = formatDateForDisplay(defaultStartDate);
          const toStr = formatDateForDisplay(endDate);
          return {
            employeeId: employee.id,
            periods: [{
              fromDate: fromStr,
              toDate: toStr,
              days: employee.designation?.toUpperCase() === 'GUEST TEACHER' ? 0 : calculateDays(fromStr, toStr),
              remarks: "",
            }],
          };
        });

      form.setValue("entries", [...currentEntries, ...newEntries]);
    }
  };

  if (loadingEmployees) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Logic for Mixed State Visuals
  const formEntries = form.getValues("entries") || [];
  const excludedEmployeesForMixed = employees.filter(
    (emp: any) => excludedDesignations.includes(emp.designation?.toUpperCase())
  );
  const selectedExcludedIds = excludedEmployeesForMixed
    .map((emp: any) => emp.id)
    .filter((id: number) => includedEmployees.has(id));

  let isBreakMixed = false;
  let isFullMixed = false;

  if (selectedExcludedIds.length > 0) {
    const selectedEntries = formEntries.filter(e => selectedExcludedIds.includes(e.employeeId));

    const allHaveBreak = selectedEntries.every(entry => {
      const period = entry.periods[0];
      if (!period?.toDate) return false;
      const endDate = parseDateFromDisplay(period.toDate);
      const breakDate = new Date(defaultEndDate);
      breakDate.setDate(breakDate.getDate() - 1);
      return endDate.getDate() === breakDate.getDate();
    });

    const allHaveFull = selectedEntries.every(entry => {
      const period = entry.periods[0];
      if (!period?.toDate) return false;
      const endDate = parseDateFromDisplay(period.toDate);
      return endDate.getDate() === defaultEndDate.getDate();
    });

    if (includeExcluded && !allHaveBreak) isBreakMixed = true;
    if (includeExcludedFull && !allHaveFull) isFullMixed = true;
  }


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        // Check for overlapping periods before submitting
        const overlapErrors: string[] = [];
        for (const entry of data.entries) {
          const emp = employees.find((e: any) => e.id === entry.employeeId);
          const empName = emp?.name || `Employee #${entry.employeeId}`;
          for (let i = 0; i < entry.periods.length; i++) {
            for (let j = i + 1; j < entry.periods.length; j++) {
              if (doPeriodsOverlap(
                entry.periods[i].fromDate, entry.periods[i].toDate,
                entry.periods[j].fromDate, entry.periods[j].toDate
              )) {
                overlapErrors.push(
                  `${empName}: Period ${i + 1} (${entry.periods[i].fromDate} to ${entry.periods[i].toDate}) overlaps with Period ${j + 1} (${entry.periods[j].fromDate} to ${entry.periods[j].toDate})`
                );
              }
            }
          }
        }
        if (overlapErrors.length > 0) {
          alert('Overlapping periods found! Please fix before submitting:\n\n' + overlapErrors.join('\n'));
          return;
        }

        // Check GUEST TEACHER has non-zero days
        const guestErrors: string[] = [];
        for (const entry of data.entries) {
          const emp = employees.find((e: any) => e.id === entry.employeeId);
          if (emp?.designation?.toUpperCase() === 'GUEST TEACHER') {
            for (let i = 0; i < entry.periods.length; i++) {
              if (!entry.periods[i].days || entry.periods[i].days === 0) {
                guestErrors.push(`${emp.name}: Period has 0. Please fill Total Periods or untick from list to exclude from the attendance report.`);
              }
            }
          }
        }
        if (guestErrors.length > 0) {
          alert('Guest Teacher total periods cannot be 0:\n\n' + guestErrors.join('\n'));
          return;
        }

        onSubmit(data);
      })} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="month"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Month</FormLabel>
                <FormControl>
                  <Input
                    value={months[parseInt(field.value) - 1]}
                    readOnly
                    disabled
                    className="opacity-100 bg-muted"
                  />
                </FormControl>
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
                <FormControl>
                  <Input
                    value={field.value}
                    readOnly
                    disabled
                    className="opacity-100 bg-muted"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-2 mb-2">
          <div className={`flex items-center space-x-2 ${isBreakMixed ? 'opacity-50' : ''}`} title={isBreakMixed ? "Some Daily Wagers have manually modified periods" : ""}>
            <Checkbox
              id="include-excluded"
              checked={includeExcluded}
              onCheckedChange={(checked) => {

                const isChecked = checked as boolean;
                setIncludeExcluded(isChecked);
                if (isChecked) setIncludeExcludedFull(false);

                const targetMode = isChecked ? 'break' : 'none';

                // Logic to update rows based on mode
                // 1. Identify "Regular" employees
                const regularEmployees = employees.filter(
                  (emp: any) => !excludedDesignations.includes(emp.designation?.toUpperCase())
                );

                // 2. Check if all regular employees are currently selected
                const allRegularsSelected = regularEmployees.length > 0 &&
                  regularEmployees.every((emp: any) => includedEmployees.has(emp.id));

                // 3. Identify daily wagers
                const excludedEmployees = employees.filter(
                  (emp: any) => excludedDesignations.includes(emp.designation?.toUpperCase())
                );
                const excludedIds = excludedEmployees.map((emp: any) => emp.id);

                if (targetMode === 'none') {
                  // Remove daily wagers
                  setIncludedEmployees(prev => {
                    const next = new Set(prev);
                    excludedIds.forEach((id: number) => next.delete(id));
                    return next;
                  });
                  const currentEntries = form.getValues("entries") || [];
                  form.setValue("entries", currentEntries.filter(entry => !excludedIds.includes(entry.employeeId)));
                } else if (allRegularsSelected) {
                  // Add daily wagers with correct date
                  setIncludedEmployees(prev => {
                    const next = new Set(prev);
                    excludedIds.forEach((id: number) => next.add(id));
                    return next;
                  });

                  const currentEntries = form.getValues("entries") || [];
                  // Remove existing daily wager entries first to update date, or just add missing
                  // Better to remove and re-add to ensure date is correct
                  const cleanEntries = currentEntries.filter(entry => !excludedIds.includes(entry.employeeId));

                  const newEntries = excludedEmployees.map((employee: any) => {
                    let endDate = defaultEndDate;
                    if (targetMode === 'break') {
                      endDate = new Date(defaultEndDate);
                      endDate.setDate(endDate.getDate() - 1);
                    }

                    return {
                      employeeId: employee.id,
                      periods: [{
                        fromDate: formatDateForDisplay(defaultStartDate),
                        toDate: formatDateForDisplay(endDate),
                        days: calculateDays(formatDateForDisplay(defaultStartDate), formatDateForDisplay(endDate)),
                        remarks: "",
                      }],
                    };
                  });

                  form.setValue("entries", [...cleanEntries, ...newEntries]);
                }
              }}
            />
            <label
              htmlFor="include-excluded"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Include Unselected (Daily Wagers etc. with One Day Break) in 'All' option
            </label>
          </div>

          <div className={`flex items-center space-x-2 ${isFullMixed ? 'opacity-50' : ''}`} title={isFullMixed ? "Some Daily Wagers have manually modified periods" : ""}>
            <Checkbox
              id="include-excluded-full"
              checked={includeExcludedFull}
              onCheckedChange={(checked) => {
                const isChecked = checked as boolean;
                setIncludeExcludedFull(isChecked);
                if (isChecked) setIncludeExcluded(false);

                const targetMode = isChecked ? 'full' : 'none';

                // Logic to update rows based on mode (Duplicated for simplicity/independence context)
                const regularEmployees = employees.filter(
                  (emp: any) => !excludedDesignations.includes(emp.designation?.toUpperCase())
                );

                const allRegularsSelected = regularEmployees.length > 0 &&
                  regularEmployees.every((emp: any) => includedEmployees.has(emp.id));

                const excludedEmployees = employees.filter(
                  (emp: any) => excludedDesignations.includes(emp.designation?.toUpperCase())
                );
                const excludedIds = excludedEmployees.map((emp: any) => emp.id);

                if (targetMode === 'none') {
                  setIncludedEmployees(prev => {
                    const next = new Set(prev);
                    excludedIds.forEach((id: number) => next.delete(id));
                    return next;
                  });
                  const currentEntries = form.getValues("entries") || [];
                  form.setValue("entries", currentEntries.filter(entry => !excludedIds.includes(entry.employeeId)));
                } else if (allRegularsSelected) {
                  setIncludedEmployees(prev => {
                    const next = new Set(prev);
                    excludedIds.forEach((id: number) => next.add(id));
                    return next;
                  });

                  const currentEntries = form.getValues("entries") || [];
                  const cleanEntries = currentEntries.filter(entry => !excludedIds.includes(entry.employeeId));

                  const newEntries = excludedEmployees.map((employee: any) => {
                    let endDate = defaultEndDate;
                    // Full mode -> defaultEndDate

                    return {
                      employeeId: employee.id,
                      periods: [{
                        fromDate: formatDateForDisplay(defaultStartDate),
                        toDate: formatDateForDisplay(endDate),
                        days: calculateDays(formatDateForDisplay(defaultStartDate), formatDateForDisplay(endDate)),
                        remarks: "",
                      }],
                    };
                  });

                  form.setValue("entries", [...cleanEntries, ...newEntries]);
                }
              }}
            />
            <label
              htmlFor="include-excluded-full"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Include Unselected (Daily Wagers etc. with Full Month) in 'All' option
            </label>
          </div>
        </div>



        <div className="rounded-md border overflow-x-auto">
          <Table style={{ minWidth: '1100px' }}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] px-2">
                  <div className="flex flex-col items-center">
                    <Checkbox
                      checked={eligibleEmployees.length > 0 &&
                        eligibleEmployees.every((emp: any) => includedEmployees.has(emp.id))}
                      onCheckedChange={toggleAllEmployees}
                      disabled={isLoading}
                    />
                    <span className="text-xs mt-1">All</span>
                  </div>
                </TableHead>
                <TableHead className="w-[40px] px-1">S.No.</TableHead>
                <TableHead className="w-[60px] px-1">EPID</TableHead>
                <TableHead className="w-[150px] px-2">Name</TableHead>
                <TableHead className="w-[180px] px-2">Designation</TableHead>
                <TableHead className="w-[70px] px-1">Expiry</TableHead>
                <TableHead className="w-[80px] px-1">Reg No.</TableHead>
                <TableHead className="px-2" style={{ minWidth: '450px' }}>
                  <div className="text-left mb-2">Attendance Periods</div>
                  <div className="grid grid-cols-[105px_105px_60px_1fr_30px] gap-1 text-xs font-normal">
                    <div>From Date</div>
                    <div>To Date</div>
                    <div className="text-center">Days</div>
                    <div>Remarks</div>
                    <div className="text-center">X</div>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {employees.map((employee: any) => (
                <TableRow key={employee.id}>
                  <TableCell className="px-2">
                    <Checkbox
                      checked={includedEmployees.has(employee.id)}
                      onCheckedChange={() => toggleEmployee(employee.id)}
                      disabled={isLoading}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-1">
                    {includedEmployees.has(employee.id) ?
                      employees
                        .filter((e: any) => includedEmployees.has(e.id))
                        .findIndex((e: any) => e.id === employee.id) + 1
                      : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-1">{employee.epid}</TableCell>
                  <TableCell className="px-2">{employee.name}</TableCell>
                  <TableCell className="px-2">{employee.designation}</TableCell>
                  <TableCell className="whitespace-nowrap px-1">{formatTermExpiry(employee.termExpiry)}</TableCell>
                  <TableCell className="whitespace-nowrap px-1">{employee.salaryRegisterNo || '-'}</TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      {form.getValues("entries")
                        ?.find(entry => entry.employeeId === employee.id)
                        ?.periods?.map((period, periodIndex) => (
                          <div key={periodIndex} className="border p-1 rounded-md bg-slate-50 dark:bg-slate-900">
                            {excludedDesignations.includes(employee.designation?.toUpperCase()) && (
                              <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                                <Switch
                                  checked={(() => {
                                    // Check if current end date is One Day Less
                                    if (!period.toDate) return false;
                                    const currentEndDate = parseDateFromDisplay(period.toDate);
                                    const monthEndDate = defaultEndDate;

                                    // If currentEndDate is day before month end -> IT IS "One Day Break" mode -> Checked
                                    // If currentEndDate is month end -> Full Month -> Unchecked

                                    // Are we in break mode?
                                    // currentEndDate == monthEndDate - 1 day
                                    const breakDate = new Date(monthEndDate);
                                    breakDate.setDate(breakDate.getDate() - 1);

                                    return currentEndDate.getDate() === breakDate.getDate();
                                  })()}
                                  onCheckedChange={(checked) => {
                                    const currentEntries = form.getValues("entries");
                                    const entryIndex = currentEntries.findIndex(e => e.employeeId === employee.id);
                                    if (entryIndex === -1) return;

                                    const updatedEntries = [...currentEntries];
                                    const currentEntry = { ...updatedEntries[entryIndex] };
                                    const updatedPeriods = [...currentEntry.periods];

                                    let newEndDate = defaultEndDate;
                                    if (checked) {
                                      // Enable Break Mode: End Date = Month End - 1
                                      newEndDate = new Date(defaultEndDate);
                                      newEndDate.setDate(newEndDate.getDate() - 1);
                                    }
                                    // else Disable Break Mode: End Date = Month End

                                    updatedPeriods[periodIndex] = {
                                      ...updatedPeriods[periodIndex],
                                      toDate: formatDateForDisplay(newEndDate),
                                      days: calculateDays(updatedPeriods[periodIndex].fromDate, formatDateForDisplay(newEndDate))
                                    };

                                    currentEntry.periods = updatedPeriods;
                                    updatedEntries[entryIndex] = currentEntry;
                                    form.setValue("entries", updatedEntries);
                                  }}
                                />
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 cursor-default">
                                  One Day Break
                                </Badge>
                              </div>
                            )}
                            <div className="grid grid-cols-[105px_105px_60px_1fr_30px] gap-1 items-center">

                              <div>
                                <input
                                  type="date"
                                  className="w-full p-1 text-sm border rounded-md"
                                  value={formatDateForInput(period.fromDate)}
                                  onChange={(e) => {
                                    const entries = form.getValues("entries");
                                    const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                    if (entryIndex !== -1) {
                                      const newEntries = [...entries];
                                      const newFromDate = formatDateFromInput(e.target.value);

                                      // Create deep copy of the entry and periods
                                      newEntries[entryIndex] = {
                                        ...newEntries[entryIndex],
                                        periods: [...newEntries[entryIndex].periods]
                                      };

                                      newEntries[entryIndex].periods[periodIndex] = {
                                        ...newEntries[entryIndex].periods[periodIndex],
                                        fromDate: newFromDate,
                                        days: isGuestTeacher(employee.id) ? newEntries[entryIndex].periods[periodIndex].days : calculateDays(newFromDate, period.toDate)
                                      };


                                      form.setValue("entries", newEntries, { shouldDirty: true });
                                    }
                                  }}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                />
                              </div>

                              <div>
                                <input
                                  type="date"
                                  className="w-full p-1 text-sm border rounded-md"
                                  value={formatDateForInput(period.toDate)}
                                  onChange={(e) => {
                                    const entries = form.getValues("entries");
                                    const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                    if (entryIndex !== -1) {
                                      const newEntries = [...entries];
                                      const newToDate = formatDateFromInput(e.target.value);

                                      // Create deep copy of the entry and periods
                                      newEntries[entryIndex] = {
                                        ...newEntries[entryIndex],
                                        periods: [...newEntries[entryIndex].periods]
                                      };

                                      newEntries[entryIndex].periods[periodIndex] = {
                                        ...newEntries[entryIndex].periods[periodIndex],
                                        toDate: newToDate,
                                        days: isGuestTeacher(employee.id) ? newEntries[entryIndex].periods[periodIndex].days : calculateDays(period.fromDate, newToDate)
                                      };


                                      form.setValue("entries", newEntries, { shouldDirty: true });
                                    }
                                  }}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                />
                              </div>

                              <div className="text-center">
                                {isGuestTeacher(employee.id) ? (
                                  <div className="flex flex-col items-center">
                                    <span className="text-[9px] text-orange-600 font-medium leading-tight">Fill Total Periods</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="365"
                                      className="w-full p-1 text-sm border border-orange-300 rounded-md text-center bg-orange-50 dark:bg-orange-900/30"
                                      value={period.days || ''}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const entries = form.getValues("entries");
                                        const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                        if (entryIndex !== -1) {
                                          const newEntries = [...entries];
                                          newEntries[entryIndex] = {
                                            ...newEntries[entryIndex],
                                            periods: [...newEntries[entryIndex].periods]
                                          };
                                          newEntries[entryIndex].periods[periodIndex] = {
                                            ...newEntries[entryIndex].periods[periodIndex],
                                            days: parseInt(e.target.value) || 0
                                          };
                                          form.setValue("entries", newEntries, { shouldDirty: true });
                                        }
                                      }}
                                      disabled={isLoading || !includedEmployees.has(employee.id)}
                                    />
                                  </div>
                                ) : (
                                  <div className="p-1 bg-blue-50 dark:bg-blue-900/30 border rounded-md text-center text-sm">
                                    {period.days}
                                  </div>
                                )}
                              </div>

                              <div>
                                <input
                                  type="text"
                                  placeholder="Remarks"
                                  className="w-full p-1 text-sm border rounded-md"
                                  value={period.remarks}
                                  onChange={(e) => {
                                    const entries = form.getValues("entries");
                                    const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                    if (entryIndex !== -1) {
                                      const newEntries = [...entries];

                                      // Create deep copy of the entry and periods
                                      newEntries[entryIndex] = {
                                        ...newEntries[entryIndex],
                                        periods: [...newEntries[entryIndex].periods]
                                      };

                                      newEntries[entryIndex].periods[periodIndex] = {
                                        ...newEntries[entryIndex].periods[periodIndex],
                                        remarks: e.target.value
                                      };

                                      form.setValue("entries", newEntries, { shouldDirty: true });
                                    }
                                  }}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                />
                              </div>

                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  className="p-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-md flex items-center justify-center h-7 w-7"
                                  onClick={() => removePeriod(employee.id, periodIndex)}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>

                        ))}
                      {includedEmployees.has(employee.id) && (
                        <button
                          type="button"
                          className="w-full mt-1 h-7 text-sm border rounded-md bg-white hover:bg-gray-50 flex items-center justify-center"
                          onClick={() => addPeriod(employee.id)}
                          disabled={isLoading}
                        >
                          <Plus className="h-3 w-3 mr-1" />
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
            initialData ? "Update Report" : "Create Report"
          )}
        </button>
      </form >
    </Form >
  );
}
