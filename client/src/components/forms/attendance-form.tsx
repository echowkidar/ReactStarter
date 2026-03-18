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
import { Loader2, Plus, X, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) {
    console.error("Invalid date string:", dateStr);
    return "";
  }

  try {
    const [day, month, year] = dateStr.split('-').map(Number);
    const result = `20${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return result;
  } catch (error) {
    console.error("Error formatting date for input:", error, dateStr);
    return "";
  }
};

// Utility function to convert YYYY-MM-DD to DD-MM-YY
const formatDateFromInput = (dateStr: string): string => {

  try {
    const date = new Date(dateStr);
    const result = formatDateForDisplay(date);
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

const shiftPeriodMonth = (fromDateStr: string, direction: number, limitMonth: number, limitYear: number) => {
  const [fDay, fMonth, fYear] = fromDateStr.split('-').map(Number);
  const currentFDate = new Date(2000 + fYear, fMonth - 1, 1);

  const targetDate = new Date(currentFDate.getFullYear(), currentFDate.getMonth() + direction, 1);

  if (direction > 0) {
    if (targetDate.getFullYear() > limitYear || (targetDate.getFullYear() === limitYear && targetDate.getMonth() + 1 > limitMonth)) {
      return null;
    }
  }

  return {
    fromDate: formatDateForDisplay(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)),
    toDate: formatDateForDisplay(new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0))
  };
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
  isSupplementary?: boolean;
  departmentId?: number;
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

export default function AttendanceForm({ onSubmit, isLoading, reportId, initialData, isSupplementary, departmentId: propDepartmentId }: AttendanceFormProps) {
  const currentDept = getCurrentDepartment();
  const departmentId = propDepartmentId || currentDept?.id;
  const { toast } = useToast();

  // Fetch all historically sent/submitted periods for overlapping check
  // Response now includes departmentName, month, year for informative error messages
  const { data: reportedPeriods = {} } = useQuery<Record<number, Array<{
    fromDate: string,
    toDate: string,
    reportId: number,
    departmentName?: string,
    month?: number,
    year?: number
  }>>>({
    queryKey: [`/api/departments/${departmentId}/attendance/reported-periods`],
    enabled: !!departmentId,
  });

  // Check if a period overlaps with any historically sent period for an employee
  const checkReportedOverlap = (
    employeeId: number,
    fromDate: string,
    toDate: string,
    currentReportId?: string | null
  ): { hasOverlap: boolean, message?: string } => {
    if (!fromDate || !toDate) return { hasOverlap: false };
    const empPeriods = reportedPeriods[employeeId] || [];

    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    for (const rp of empPeriods) {
      if (currentReportId && rp.reportId === Number(currentReportId)) {
        continue;
      }
      if (doPeriodsOverlap(fromDate, toDate, rp.fromDate, rp.toDate)) {
        const deptInfo = rp.departmentName ? ` by "${rp.departmentName}"` : '';
        const monthInfo = (rp.month && rp.year)
          ? ` in ${monthNames[rp.month]} ${rp.year}`
          : '';
        return {
          hasOverlap: true,
          message: `Attendance for ${rp.fromDate} to ${rp.toDate} was already sent${deptInfo}${monthInfo}. This period cannot be included again.`
        };
      }
    }
    return { hasOverlap: false };
  };

  const handleFormSubmit = async (data: AttendanceFormData) => {
    // Check for overlaps before submitting
    for (const entry of data.entries) {
      if (!includedEmployees.has(entry.employeeId)) continue;

      for (const period of entry.periods) {
        const overlap = checkReportedOverlap(entry.employeeId, period.fromDate, period.toDate, reportId);
        if (overlap.hasOverlap) {
          const empName = rawEmployees.find((e: any) => e.id === entry.employeeId)?.name || 'Employee';
          toast({
            title: "Overlapping Period Detected",
            description: `${empName}: ${overlap.message}`,
            variant: "destructive",
          });
          return; // Block submission
        }
      }
    }

    // No overlaps, proceed with original submission
    await onSubmit(data);
  };

  const [includedEmployees, setIncludedEmployees] = useState<Set<number>>(new Set());
  const [includeExcluded, setIncludeExcluded] = useState(false); // Mode: With Break
  const [includeExcludedFull, setIncludeExcludedFull] = useState(false); // Mode: Full Month
  const [reportedEmployeeIds, setReportedEmployeeIds] = useState<Set<number>>(new Set());

  // Watch month/year to update reported employees list
  const selectedMonth = parseInt(initialData?.month || String(new Date().getMonth() + 1));
  const selectedYear = parseInt(initialData?.year || String(currentYear));

  // Calculate first and last day of selected month
  const defaultStartDate = new Date(selectedYear, selectedMonth - 1, 1);
  const defaultEndDate = new Date(selectedYear, selectedMonth, 0);

  const maxDateForInput = `${defaultEndDate.getFullYear()}-${String(defaultEndDate.getMonth() + 1).padStart(2, '0')}-${String(defaultEndDate.getDate()).padStart(2, '0')}`;

  // Calculate first and last day of previous month for guest teachers/faculty
  let prevMonth = selectedMonth - 1;
  let prevYear = selectedYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevMonthStartDate = new Date(prevYear, prevMonth - 1, 1);
  const prevMonthEndDate = new Date(prevYear, prevMonth, 0);

  // Create form first so we can watch values
  const form = useForm<AttendanceFormData>({
    resolver: zodResolver(attendanceSchema),
    defaultValues: initialData || {
      month: String(selectedMonth),
      year: String(selectedYear),
      entries: [{
        employeeId: 0,
        periods: [{
          fromDate: formatDateForDisplay(new Date(selectedYear, selectedMonth - 1, 1)),
          toDate: formatDateForDisplay(new Date(selectedYear, selectedMonth, 0)),
          days: calculateDays(
            formatDateForDisplay(new Date(selectedYear, selectedMonth - 1, 1)),
            formatDateForDisplay(new Date(selectedYear, selectedMonth, 0))
          ),
          remarks: ""
        }],
      }],
    },
  });

  const watchMonth = form.watch("month");
  const watchYear = form.watch("year");

  // Fetch employees who are already in a report for this month/year
  useEffect(() => {
    const fetchReportedEmployees = async () => {
      if (!departmentId) {
        setReportedEmployeeIds(new Set());
        return;
      }

      try {
        const res = await fetch(`/api/departments/${departmentId}/attendance/reported-employees?month=${watchMonth}&year=${watchYear}`);
        if (res.ok) {
          const ids = await res.json();

          setReportedEmployeeIds(new Set(ids));
        }
      } catch (e) {
        console.error("Error fetching reported employees:", e);
      }
    };

    fetchReportedEmployees();
  }, [isSupplementary, departmentId, watchMonth, watchYear]);

  const { data: rawEmployees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: [`/api/departments/${departmentId}/employees`],
    enabled: !!departmentId,
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

          // [NEW] Sort by sortOrder (ascending)
          if (a.sortOrder !== b.sortOrder) {
            return (a.sortOrder || 0) - (b.sortOrder || 0);
          }

          // If pay levels are the same, sort by EPID in ascending order
          if (!a.epid) return 1;
          if (!b.epid) return -1;
          return a.epid.localeCompare(b.epid);
        });
    },
  });

  // Filter out employees who already have attendance sent/submitted for this month
  const employees = React.useMemo(() => {
    const initiallySelectedIds = new Set((initialData?.entries || []).map((entry: any) => entry.employeeId));

    // Combine rawEmployees with employees from initialData to prevent missing transferred employees
    const allEmployeesMap = new Map();
    rawEmployees.forEach((e: any) => allEmployeesMap.set(e.id, e));

    (initialData?.entries || []).forEach((entry: any) => {
      if (entry.employee && !allEmployeesMap.has(entry.employeeId)) {
        allEmployeesMap.set(entry.employeeId, entry.employee);
      }
    });

    const combinedRawEmployees = Array.from(allEmployeesMap.values());

    return combinedRawEmployees.filter((e: any) => {
      // If the employee is part of the initial data (e.g. we are editing this draft), they SHOULD be visible
      if (initiallySelectedIds.has(e.id)) {
        return true;
      }
      // Otherwise, hide them if they are in another reported document
      return !reportedEmployeeIds.has(e.id);
    });
  }, [rawEmployees, reportedEmployeeIds, initialData]);

  const isGuestTeacher = (empId: number) => {
    const emp = employees.find((e: any) => e.id === empId);
    const designation = emp?.designation?.toUpperCase();
    return designation === 'GUEST TEACHER' || designation === 'GUEST FACULTY';
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



  const hadFullMonthPreviousMonth = (employeeId: number): boolean => {
    const prevStartDate = formatDateForDisplay(prevMonthStartDate);
    const prevEndDate = formatDateForDisplay(prevMonthEndDate);
    const empReportedPeriods = reportedPeriods[employeeId] || [];

    return empReportedPeriods.some(rp => {
      const isFullMonthStr = rp.fromDate === prevStartDate && rp.toDate === prevEndDate;
      if (isFullMonthStr) return true;
      if (!rp.fromDate || !rp.toDate) return false;
      const days = calculateDays(rp.fromDate, rp.toDate);
      const totalDaysInPrevMonth = prevMonthEndDate.getDate();
      return days === totalDaysInPrevMonth &&
        rp.fromDate.endsWith(`${String(prevMonth).padStart(2, '0')}-${String(prevYear).slice(-2)}`);
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
        const isGuest = isGuestTeacher(employeeId);
        const emp = employees.find((e: any) => e.id === employeeId);
        const isExcluded = emp && excludedDesignations.includes(emp.designation?.toUpperCase());

        const fromDateStr = formatDateForDisplay(isGuest ? prevMonthStartDate : defaultStartDate);

        let initialEndDate = isGuest ? prevMonthEndDate : defaultEndDate;
        if (isExcluded && hadFullMonthPreviousMonth(employeeId)) {
          // Auto apply One Day Break if previous month was full
          initialEndDate = new Date(defaultEndDate);
          initialEndDate.setDate(initialEndDate.getDate() - 1);
        }

        const toDateStr = formatDateForDisplay(initialEndDate);

        form.setValue("entries", [
          ...currentEntries,
          {
            employeeId,
            periods: [{
              fromDate: fromDateStr,
              toDate: toDateStr,
              days: isGuest ? 0 : calculateDays(fromDateStr, toDateStr),
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

    const isGuest = isGuestTeacher(employeeId);
    const fromDateStr = formatDateForDisplay(isGuest ? prevMonthStartDate : defaultStartDate);
    const toDateStr = formatDateForDisplay(isGuest ? prevMonthEndDate : defaultEndDate);


    const newPeriod = {
      fromDate: fromDateStr,
      toDate: toDateStr,
      days: isGuest ? 0 : calculateDays(fromDateStr, toDateStr),
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

  const handleDateChangeWithSplit = (
    employeeId: number,
    entryIndex: number,
    periodIndex: number,
    newFromStr: string,
    newToStr: string
  ) => {
    const entries = form.getValues("entries");
    const newEntries = [...entries];
    const employee = employees.find((e: any) => e.id === employeeId);
    if (!employee) return;

    const isExcluded = excludedDesignations.includes(employee.designation?.toUpperCase());
    const totalDays = calculateDays(newFromStr, newToStr);

    if (isExcluded && totalDays > 56) {
      alert("Period exceeds 56 days. The system will automatically split it with 1-day breaks (56-Day Rule).");

      const generatedPeriods = [];
      let remainingDays = totalDays;
      let currentStart = parseDateFromDisplay(newFromStr);
      const finalEnd = parseDateFromDisplay(newToStr);

      while (remainingDays > 56) {
        const pEnd = new Date(currentStart);
        pEnd.setDate(pEnd.getDate() + 55); // 56 days inclusive

        generatedPeriods.push({
          fromDate: formatDateForDisplay(currentStart),
          toDate: formatDateForDisplay(pEnd),
          days: 56,
          remarks: "",
        });

        // Skip 1 day (break)
        currentStart = new Date(pEnd);
        currentStart.setDate(currentStart.getDate() + 2);

        if (currentStart <= finalEnd) {
          remainingDays = Math.ceil((finalEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        } else {
          remainingDays = 0;
        }
      }

      if (remainingDays > 0) {
        generatedPeriods.push({
          fromDate: formatDateForDisplay(currentStart),
          toDate: formatDateForDisplay(finalEnd),
          days: remainingDays,
          remarks: "",
        });
      }

      // Replace the current period with the generated ones
      const currentPeriods = [...newEntries[entryIndex].periods];
      currentPeriods.splice(periodIndex, 1, ...generatedPeriods);

      newEntries[entryIndex] = {
        ...newEntries[entryIndex],
        periods: currentPeriods
      };
    } else {
      // Normal update
      newEntries[entryIndex] = {
        ...newEntries[entryIndex],
        periods: [...newEntries[entryIndex].periods]
      };
      newEntries[entryIndex].periods[periodIndex] = {
        ...newEntries[entryIndex].periods[periodIndex],
        fromDate: newFromStr,
        toDate: newToStr,
        days: isGuestTeacher(employeeId) ? newEntries[entryIndex].periods[periodIndex].days : totalDays
      };
    }

    form.setValue("entries", newEntries, { shouldDirty: true });
  };

  // Remove employee entries when unselected
  useEffect(() => {
    const currentEntries = form.getValues("entries") || [];
    const filteredEntries = currentEntries.filter(entry => includedEmployees.has(entry.employeeId));
    form.setValue("entries", filteredEntries);
  }, [includedEmployees, form]);

  // Update the useEffect for initialData
  useEffect(() => {
    if (initialData?.entries && employees.length > 0) {
      // Set included employees
      const employeeIds = new Set(initialData.entries.map(entry => entry.employeeId));
      setIncludedEmployees(employeeIds);

      // Update form with initial data, ensuring periods are properly set
      const formattedData = {
        ...initialData,
        entries: initialData.entries.map(entry => {
          const isGuest = isGuestTeacher(entry.employeeId);
          return {
            employeeId: entry.employeeId,
            periods: entry.periods.map(period => ({
              fromDate: period.fromDate,
              toDate: period.toDate,
              days: isGuest ? (period.days || 0) : calculateDays(period.fromDate, period.toDate),
              remarks: period.remarks || ''
            }))
          };
        })
      };

      form.reset(formattedData);
    }
  }, [initialData, form, employees.length]);

  // Designations to exclude from "All" selection (Daily Wage employees with breaks)
  const excludedDesignations = [
    "DAILY WAGE (SEMI-SKILLED)",
    "DAILY WAGE (CLERICAL/SKILLED)",
    "DAILY WAGE (UN-SKILLED)",
    "DAILY WAGER (FIXED)"
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

      const employeesToAdd = eligibleEmployees.filter((emp: any) => !existingIds.has(emp.id));

      let forceFullMonth = false;
      if (includeExcludedFull) {
        const violators = employeesToAdd.filter((emp: any) =>
          excludedDesignations.includes(emp.designation?.toUpperCase()) &&
          hadFullMonthPreviousMonth(emp.id)
        );
        if (violators.length > 0) {
          forceFullMonth = window.confirm(`Some daily wagers (${violators.length}) had full attendance last month.\nAccording to the 56-days rule, a 1-day break is mandatory for them.\nDo you still want to force full month attendance?`);
        } else {
          forceFullMonth = true;
        }
      }

      const newEntries = employeesToAdd.map((employee: any) => {
        // Check if excluded designation (Daily Wage)
        const isExcluded = excludedDesignations.includes(employee.designation?.toUpperCase());
        const isGuest = employee.designation?.toUpperCase() === 'GUEST TEACHER' || employee.designation?.toUpperCase() === 'GUEST FACULTY';

        let startDate = isGuest ? prevMonthStartDate : defaultStartDate;
        let endDate = isGuest ? prevMonthEndDate : defaultEndDate;

        if (isExcluded) {
          if (includeExcludedFull) {
            // Full month requested
            if (!forceFullMonth && hadFullMonthPreviousMonth(employee.id)) {
              endDate = new Date(defaultEndDate);
              endDate.setDate(endDate.getDate() - 1);
            }
          } else if (includeExcluded) {
            // One Day break requested for all daily wagers
            endDate = new Date(defaultEndDate);
            endDate.setDate(endDate.getDate() - 1);
          } else {
            // Default behavior (neither box checked but manually eligible?)
            if (hadFullMonthPreviousMonth(employee.id)) {
              endDate = new Date(defaultEndDate);
              endDate.setDate(endDate.getDate() - 1);
            }
          }
        }

        const fromStr = formatDateForDisplay(startDate);
        const toStr = formatDateForDisplay(endDate);
        return {
          employeeId: employee.id,
          periods: [{
            fromDate: fromStr,
            toDate: toStr,
            days: isGuest ? 0 : calculateDays(fromStr, toStr),
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


        // Check GUEST TEACHER/FACULTY has non-zero days
        const guestErrors: string[] = [];
        for (const entry of data.entries) {
          const emp = employees.find((e: any) => e.id === entry.employeeId);
          const designation = emp?.designation?.toUpperCase();
          if (designation === 'GUEST TEACHER' || designation === 'GUEST FACULTY') {
            for (let i = 0; i < entry.periods.length; i++) {
              if (!entry.periods[i].days || entry.periods[i].days === 0) {
                guestErrors.push(`${emp.name}: Period has 0. Please fill Total Periods or untick from list to exclude from the attendance report.`);
              }
            }
          }
        }
        if (guestErrors.length > 0) {
          alert('Guest Teacher/Faculty total periods cannot be 0:\n\n' + guestErrors.join('\n'));
          return;
        }

        handleFormSubmit(data);
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
                  let forceFullMonth = false;
                  const violators = excludedEmployees.filter((emp: any) => hadFullMonthPreviousMonth(emp.id));

                  if (violators.length > 0) {
                    forceFullMonth = window.confirm(`Some daily wagers (${violators.length}) had full attendance last month.\nAccording to the 56-days rule, a 1-day break is mandatory for them.\nDo you still want to force full month attendance?`);
                  } else {
                    forceFullMonth = true;
                  }

                  setIncludedEmployees(prev => {
                    const next = new Set(prev);
                    excludedIds.forEach((id: number) => next.add(id));
                    return next;
                  });

                  const currentEntries = form.getValues("entries") || [];
                  const cleanEntries = currentEntries.filter(entry => !excludedIds.includes(entry.employeeId));

                  const newEntries = excludedEmployees.map((employee: any) => {
                    let endDate = defaultEndDate;
                    // IF forceFullMonth is false, we enforce the break on violators
                    if (!forceFullMonth && hadFullMonthPreviousMonth(employee.id)) {
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
              htmlFor="include-excluded-full"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Include Unselected (Daily Wagers etc. with Full Month) in 'All' option
            </label>
          </div>
        </div>



        <div className="rounded-md border overflow-x-auto shadow-sm">
          <Table style={{ minWidth: '1100px' }}>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-[40px] px-2 bg-green-50 border-r border-green-200">
                  <div className="flex flex-col items-center justify-center py-1">
                    <Checkbox
                      checked={eligibleEmployees.length > 0 &&
                        eligibleEmployees.every((emp: any) => includedEmployees.has(emp.id))}
                      onCheckedChange={toggleAllEmployees}
                      disabled={isLoading}
                      className="h-5 w-5 border-green-600 data-[state=checked]:bg-green-600"
                    />
                    <span className="text-xs mt-1 font-bold text-green-700">All</span>
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
                                    if (!checked && hadFullMonthPreviousMonth(employee.id)) {
                                      const confirmOff = window.confirm("This employee had full attendance (no break) last month. According to the 56-days rule, a 1-day break is mandatory this month. Do you still want to give full month attendance?");
                                      if (!confirmOff) return;
                                    }

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
                            <div className="grid grid-cols-[30px_105px_105px_30px_60px_1fr_30px] gap-1 items-center">

                              <div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    const shifted = shiftPeriodMonth(period.fromDate, -1, selectedMonth, selectedYear);
                                    if (shifted) {
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
                                          fromDate: shifted.fromDate,
                                          toDate: shifted.toDate,
                                          days: isGuestTeacher(employee.id) ? newEntries[entryIndex].periods[periodIndex].days : calculateDays(shifted.fromDate, shifted.toDate)
                                        };
                                        form.setValue("entries", newEntries, { shouldDirty: true });
                                      }
                                    }
                                  }}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                >
                                  <ChevronsLeft className="h-4 w-4" />
                                </Button>
                              </div>

                              <div>
                                <input
                                  type="date"
                                  max={maxDateForInput}
                                  className="w-full p-1 text-sm border rounded-md"
                                  value={formatDateForInput(period.fromDate)}
                                  onChange={(e) => {
                                    const entries = form.getValues("entries");
                                    const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                    if (entryIndex !== -1) {
                                      const newFromDate = formatDateFromInput(e.target.value);
                                      handleDateChangeWithSplit(employee.id, entryIndex, periodIndex, newFromDate, period.toDate);
                                    }
                                  }}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                />
                              </div>

                              <div>
                                <input
                                  type="date"
                                  max={maxDateForInput}
                                  className="w-full p-1 text-sm border rounded-md"
                                  value={formatDateForInput(period.toDate)}
                                  onChange={(e) => {
                                    const entries = form.getValues("entries");
                                    const entryIndex = entries.findIndex(entry => entry.employeeId === employee.id);
                                    if (entryIndex !== -1) {
                                      const newToDate = formatDateFromInput(e.target.value);
                                      handleDateChangeWithSplit(employee.id, entryIndex, periodIndex, period.fromDate, newToDate);
                                    }
                                  }}
                                  disabled={isLoading || !includedEmployees.has(employee.id)}
                                />
                              </div>

                              <div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    const shifted = shiftPeriodMonth(period.fromDate, 1, selectedMonth, selectedYear);
                                    if (shifted) {
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
                                          fromDate: shifted.fromDate,
                                          toDate: shifted.toDate,
                                          days: isGuestTeacher(employee.id) ? newEntries[entryIndex].periods[periodIndex].days : calculateDays(shifted.fromDate, shifted.toDate)
                                        };
                                        form.setValue("entries", newEntries, { shouldDirty: true });
                                      }
                                    }
                                  }}
                                  disabled={
                                    isLoading ||
                                    !includedEmployees.has(employee.id) ||
                                    (() => {
                                      const [fDay, fMonth, fYear] = period.fromDate.split('-').map(Number);
                                      const currentFDate = new Date(2000 + fYear, fMonth - 1, 1);
                                      const targetDate = new Date(currentFDate.getFullYear(), currentFDate.getMonth() + 1, 1);
                                      return targetDate.getFullYear() > selectedYear || (targetDate.getFullYear() === selectedYear && targetDate.getMonth() + 1 > selectedMonth);
                                    })()
                                  }
                                >
                                  <ChevronsRight className="h-4 w-4" />
                                </Button>
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

                            {/* Overlap Warning Inline */}
                            {(() => {
                              if (!includedEmployees.has(employee.id)) return null;
                              const overlapState = checkReportedOverlap(employee.id, period.fromDate, period.toDate, reportId);
                              if (overlapState.hasOverlap) {
                                return (
                                  <div className="text-destructive text-[11px] mt-1 font-medium text-center bg-red-50 p-1 rounded-sm">
                                    Warning: {overlapState.message}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>

                        ))}

                      {isGuestTeacher(employee.id) && includedEmployees.has(employee.id) && (
                        <div className="text-[11px] font-bold text-center mt-1 pb-1">
                          ** Original Bill must be sent to Salary Section **
                        </div>
                      )}

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
