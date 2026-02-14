import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";
import { LogOut, Users, Eye, Search, ArrowLeft, FileDown, ChevronLeft, ChevronRight, Loader2, XCircle, CheckCircle, FileText, Check } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { ArrowUpDown } from "lucide-react";
import * as XLSX from "xlsx";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AttendanceEntry = {
  id: number;
  reportId: number;
  employeeId: number;
  days: number;
  fromDate: string;
  toDate: string;
  periods: string;
  remarks: string;
  verified?: boolean;
  employee?: {
    id: number;
    departmentId: number;
    name: string;
    employeeId?: string;
    epid?: string;
    designation: string;
    salaryRegisterNo: string;
    salary_asstt?: string;
  };
};

type AttendanceReport = {
  id: number;
  departmentId: number;
  department?: {
    id: number;
    name: string;
  };
  month: number;
  year: number;
  status: string;
  receiptNo?: number;
  receiptDate?: string;
  fileUrl?: string;
  entries?: AttendanceEntry[];
};

export default function AttendanceReports() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  // Fetch available months from backend
  const { data: dbMonths = [] } = useQuery<{ month: number; year: number }[]>({
    queryKey: ["/api/admin/attendance/months"],
  });

  // Format backend months to "Month Year" strings
  const availableMonthStrings = useMemo(() => {
    return dbMonths.map(m => {
      const date = new Date(m.year, m.month - 1);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    });
  }, [dbMonths]);

  // Initialize with current month
  const [monthFilter, setMonthFilter] = useState<string[]>(() => {
    const now = new Date();
    // Default to current month even if not in database yet (it will just show empty)
    // Or we could default to the latest available month from dbMonths if we waited for it
    // But for better UX (instant render), let's default to actual current month
    const current = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return [current];
  });
  const [salaryRegisterFilter, setSalaryRegisterFilter] = useState<string[]>([]);
  const [salaryAssistantFilter, setSalaryAssistantFilter] = useState<string[]>([]);
  const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);
  const { toast } = useToast();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Toggle verification mutation with optimistic update
  const toggleVerify = useMutation({
    mutationFn: async (entryId: number) => {
      await apiRequest('PATCH', `/api/attendance/entries/${entryId}/toggle-verify`);
    },
    onMutate: async (entryId: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/admin/attendance", monthFilter] });
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(["/api/admin/attendance", monthFilter]);
      // Optimistically update the cache
      queryClient.setQueryData(["/api/admin/attendance", monthFilter], (old: any) => {
        if (!old) return old;
        return old.map((report: any) => ({
          ...report,
          entries: report.entries?.map((entry: any) =>
            entry.id === entryId ? { ...entry, verified: !entry.verified } : entry
          ),
        }));
      });
      return { previousData };
    },
    onError: (_err, _entryId, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["/api/admin/attendance", monthFilter], context.previousData);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure data consistency
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
    }
  });

  useEffect(() => {
    // Check if user is salary admin
    const adminType = localStorage.getItem("adminType");
    setIsSalaryAdmin(adminType === "salary");
  }, []);

  // Fetch attendance reports - filtered by month/year if selected
  const { data: reports = [], isLoading } = useQuery<AttendanceReport[]>({
    queryKey: ["/api/admin/attendance", monthFilter],
    queryFn: async ({ queryKey }) => {
      const [, filters] = queryKey;
      let url = "/api/admin/attendance";

      // We only support single month filter for the API optimization
      // If multiple selected (UI allows it), we might just fetch all or fetch for the first one
      // For now, let's take the first one if available
      const selectedMonth = Array.isArray(filters) && filters.length > 0 ? filters[0] : null;

      if (selectedMonth) {
        const [monthName, yearStr] = selectedMonth.split(' ');
        if (monthName && yearStr) {
          // Parse month name to number (0-11) -> (1-12)
          const monthDate = new Date(`${monthName} 1, 2000`);
          const monthNum = monthDate.getMonth() + 1;
          url += `?month=${monthNum}&year=${yearStr}`;
        }
      }

      const res = await apiRequest("GET", url);
      return res.json();
    },
    select: (data) => data.filter(report =>
      report.status === "sent" ||
      report.status === "cancel_requested"
    ),
  });

  // Accept cancellation mutation
  const acceptCancellation = useMutation({
    mutationFn: async (reportId: number) => {
      await apiRequest("POST", `/api/attendance/${reportId}/accept-cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({
        title: "Cancellation Accepted",
        description: "Report cancelled successfully. Entries have been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to accept cancellation",
      });
    },
  });

  // Sorting state for Employee ID
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Fetch all departments for the filter
  const { data: departments = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/departments"],
  });


  // Calculate all entries from sent reports with employee details
  const allEntries = useMemo(() => {
    const entries: Array<{
      month: string;
      departmentName: string;
      employeeId: string;
      employeeName: string;
      designation: string;
      salaryAsstt: string;
      salaryRegisterNo: string;
      period: string;
      days: number;
      remarks: string;
      reportId: number;
      departmentId: number;
      fileUrl?: string;
      entryId: number;
      verified: boolean;
    }> = [];

    reports.forEach(report => {
      if (report.entries && report.department) {
        // Format month and year
        const date = new Date(report.year, report.month - 1);
        const monthYear = date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long'
        });

        report.entries.forEach(entry => {
          if (entry.employee) {
            // First try direct access, then fall back to empty string
            const salaryAssttValue = entry.employee.salary_asstt !== undefined ?
              String(entry.employee.salary_asstt) :
              (typeof entry.employee === 'object' && 'salary_asstt' in entry.employee) ?
                String(entry.employee.salary_asstt) :
                "";

            try {
              const periods = JSON.parse(entry.periods);
              periods.forEach((period: any) => {
                entries.push({
                  month: monthYear,
                  departmentName: report.department?.name || "Unknown",
                  employeeId: entry.employee?.epid || entry.employee?.employeeId || "",
                  employeeName: entry.employee?.name || "",
                  designation: entry.employee?.designation || "",
                  salaryAsstt: salaryAssttValue,
                  salaryRegisterNo: entry.employee?.salaryRegisterNo || "",
                  period: `${period.fromDate} to ${period.toDate}`,
                  days: period.days,
                  remarks: period.remarks || "",
                  reportId: report.id,
                  departmentId: report.departmentId,
                  fileUrl: report.fileUrl || undefined,
                  entryId: entry.id,
                  verified: entry.verified || false,
                });
              });
            } catch (error) {
              console.error("Error parsing periods:", error);
            }
          }
        });
      }
    });

    return entries;
  }, [reports]);

  // Use filtered months from backend instead of calculating from all entries
  // But strictly speaking, the MultiSelect expects options.
  // We can merge backend available months with what's currently selected to ensure options exist
  // We ALSO include months from the loaded reports as a fallback/supplement
  const availableMonths = useMemo(() => {
    const reportMonths = allEntries.map(entry => entry.month);
    // Return unique set of available strings
    return Array.from(new Set([...availableMonthStrings, ...monthFilter, ...reportMonths])).sort();
  }, [availableMonthStrings, monthFilter, allEntries]);

  // Get unique departments for the filter (only from sent reports)
  const availableDepartments = useMemo(() => {
    const uniqueDepartments = new Map();
    allEntries.forEach(entry => {
      if (!uniqueDepartments.has(entry.departmentId)) {
        uniqueDepartments.set(entry.departmentId, {
          id: entry.departmentId,
          name: entry.departmentName
        });
      }
    });
    return Array.from(uniqueDepartments.values());
  }, [allEntries]);

  // Get unique salary register numbers for the filter
  const availableSalaryRegisters = useMemo(() => {
    const uniqueRegisters = new Set(allEntries.map(entry => entry.salaryRegisterNo));
    return Array.from(uniqueRegisters).sort();
  }, [allEntries]);

  // Get unique salary assistants for the filter
  const availableSalaryAssistants = useMemo(() => {
    const uniqueAssistants = new Set<string>();
    allEntries.forEach(entry => {
      if (entry.salaryAsstt && entry.salaryAsstt.trim() !== '') {
        uniqueAssistants.add(entry.salaryAsstt);
      }
    });
    return Array.from(uniqueAssistants).sort();
  }, [allEntries]);

  // Calculate filtered departments, months, and salary registers based on current filters
  const {
    filteredDepartments,
    filteredMonths,
    filteredSalaryRegisters,
    filteredSalaryAssistants
  } = useMemo(() => {
    // Start with a filtered set of entries based on search term
    let result = [...allEntries];

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      result = result.filter(
        entry =>
          entry.employeeId.toLowerCase().includes(lowerSearchTerm) ||
          entry.employeeName.toLowerCase().includes(lowerSearchTerm) ||
          entry.departmentName.toLowerCase().includes(lowerSearchTerm) ||
          entry.designation.toLowerCase().includes(lowerSearchTerm) ||
          entry.remarks.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // --- Helper to filter by everything EXCEPT the target criteria ---

    // Get available departments: apply Month + Register + Assistant filters
    let filteredForDepartments = result;
    if (monthFilter.length > 0) {
      filteredForDepartments = filteredForDepartments.filter(entry => monthFilter.includes(entry.month));
    }
    if (salaryRegisterFilter.length > 0) {
      filteredForDepartments = filteredForDepartments.filter(entry => salaryRegisterFilter.includes(entry.salaryRegisterNo));
    }
    if (salaryAssistantFilter.length > 0) {
      filteredForDepartments = filteredForDepartments.filter(entry => salaryAssistantFilter.includes(entry.salaryAsstt));
    }
    const deptIds = new Set(filteredForDepartments.map(entry => entry.departmentId.toString()));


    // Get available months: apply Dept + Register + Assistant filters
    let filteredForMonths = result;
    if (departmentFilter.length > 0) {
      filteredForMonths = filteredForMonths.filter(entry => departmentFilter.includes(entry.departmentId.toString()));
    }
    if (salaryRegisterFilter.length > 0) {
      filteredForMonths = filteredForMonths.filter(entry => salaryRegisterFilter.includes(entry.salaryRegisterNo));
    }
    if (salaryAssistantFilter.length > 0) {
      filteredForMonths = filteredForMonths.filter(entry => salaryAssistantFilter.includes(entry.salaryAsstt));
    }
    const months = new Set(filteredForMonths.map(entry => entry.month));


    // Get available salary registers: apply Dept + Month + Assistant filters
    let filteredForSalaryRegisters = result;
    if (departmentFilter.length > 0) {
      filteredForSalaryRegisters = filteredForSalaryRegisters.filter(entry => departmentFilter.includes(entry.departmentId.toString()));
    }
    if (monthFilter.length > 0) {
      filteredForSalaryRegisters = filteredForSalaryRegisters.filter(entry => monthFilter.includes(entry.month));
    }
    if (salaryAssistantFilter.length > 0) {
      filteredForSalaryRegisters = filteredForSalaryRegisters.filter(entry => salaryAssistantFilter.includes(entry.salaryAsstt));
    }
    const salaryRegisters = new Set(filteredForSalaryRegisters.map(entry => entry.salaryRegisterNo));


    // Get available salary assistants: apply Dept + Month + Register filters
    let filteredForSalaryAssistants = result;
    if (departmentFilter.length > 0) {
      filteredForSalaryAssistants = filteredForSalaryAssistants.filter(entry => departmentFilter.includes(entry.departmentId.toString()));
    }
    if (monthFilter.length > 0) {
      filteredForSalaryAssistants = filteredForSalaryAssistants.filter(entry => monthFilter.includes(entry.month));
    }
    if (salaryRegisterFilter.length > 0) {
      filteredForSalaryAssistants = filteredForSalaryAssistants.filter(entry => salaryRegisterFilter.includes(entry.salaryRegisterNo));
    }
    const salaryAssistants = new Set(
      filteredForSalaryAssistants
        .map(entry => entry.salaryAsstt)
        .filter(value => value && value.trim() !== '')
    );

    return {
      filteredDepartments: availableDepartments.filter(dept =>
        (monthFilter.length === 0 && salaryRegisterFilter.length === 0 && salaryAssistantFilter.length === 0) ||
        deptIds.has(dept.id.toString())
      ),
      filteredMonths: Array.from(months).sort(),
      filteredSalaryRegisters: Array.from(salaryRegisters).sort(),
      filteredSalaryAssistants: Array.from(salaryAssistants).sort()
    };
  }, [allEntries, searchTerm, departmentFilter, monthFilter, salaryRegisterFilter, salaryAssistantFilter, availableDepartments]);

  // Filter entries based on all criteria
  const filteredEntries = useMemo(() => {
    let result = [...allEntries];

    // Apply search filter
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      result = result.filter(
        entry =>
          entry.employeeId.toLowerCase().includes(lowerSearchTerm) ||
          entry.employeeName.toLowerCase().includes(lowerSearchTerm) ||
          entry.departmentName.toLowerCase().includes(lowerSearchTerm) ||
          entry.designation.toLowerCase().includes(lowerSearchTerm) ||
          entry.remarks.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // Apply department filter
    if (departmentFilter.length > 0) {
      result = result.filter(entry => departmentFilter.includes(entry.departmentId.toString()));
    }

    // Apply month filter
    if (monthFilter.length > 0) {
      result = result.filter(entry => monthFilter.includes(entry.month));
    }

    // Apply salary register filter
    if (salaryRegisterFilter.length > 0) {
      result = result.filter(entry => salaryRegisterFilter.includes(entry.salaryRegisterNo));
    }

    // Apply salary assistant filter
    if (salaryAssistantFilter.length > 0) {
      result = result.filter(entry => salaryAssistantFilter.includes(entry.salaryAsstt));
    }

    return result;
  }, [allEntries, searchTerm, departmentFilter, monthFilter, salaryRegisterFilter, salaryAssistantFilter]);

  // Process entries to show department name only once
  const processedEntries = useMemo(() => {
    // Sort entries by department first to group them together
    const sorted = [...filteredEntries].sort((a, b) => {
      // If sorting by Employee ID is active
      if (sortConfig && sortConfig.key === 'employeeId') {
        const empIdA = a.employeeId || "";
        const empIdB = b.employeeId || "";

        // Try numeric comparison first if both are numbers
        const numA = parseInt(empIdA);
        const numB = parseInt(empIdB);

        let comparison = 0;
        if (!isNaN(numA) && !isNaN(numB)) {
          comparison = numA - numB;
        } else {
          comparison = empIdA.localeCompare(empIdB);
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }

      // Default sorting: Department -> Month -> Employee Name
      // First sort by department name
      const deptCompare = a.departmentName.localeCompare(b.departmentName);
      if (deptCompare !== 0) return deptCompare;

      // If same department, sort by month
      const monthCompare = a.month.localeCompare(b.month);
      if (monthCompare !== 0) return monthCompare;

      // Further sort by employee name
      return a.employeeName.localeCompare(b.employeeName);
    });

    // Mark entries to indicate if department name should be shown
    let currentDeptId: number | null = null;
    let currentMonth: string | null = null;

    return sorted.map((entry, index) => {
      const isFirstDeptEntry = entry.departmentId !== currentDeptId;

      // Reset current month when department changes
      if (isFirstDeptEntry) {
        currentMonth = null;
      }

      const isFirstMonthEntry = isFirstDeptEntry || entry.month !== currentMonth;

      currentDeptId = entry.departmentId;
      currentMonth = entry.month;

      return {
        ...entry,
        showDepartment: isFirstDeptEntry,
        showMonth: isFirstMonthEntry
      };
    });
  }, [filteredEntries, sortConfig]);

  // Paginate processed entries
  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return processedEntries.slice(startIndex, startIndex + pageSize);
  }, [processedEntries, currentPage, pageSize]);

  // Calculate total pages
  const totalPages = Math.ceil(processedEntries.length / pageSize);

  const handleLogout = () => {
    // Clear admin data from localStorage
    localStorage.removeItem("adminType");
    setLocation("/admin/login");
  };

  // Function to handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Function to download filtered entries as Excel
  const downloadExcel = () => {
    // Create a worksheet from the filtered entries
    const worksheet = XLSX.utils.json_to_sheet(processedEntries.map(entry => {
      // Split period string "DD-MM-YY to DD-MM-YY"
      const [fromStr, toStr] = entry.period.split(" to ");

      return {
        "Month": entry.month,
        "Department": entry.departmentName,
        "Employee ID": entry.employeeId,
        "Employee Name": entry.employeeName,
        "Designation": entry.designation,
        "Salary Assistant": entry.salaryAsstt,
        "Salary Register No": entry.salaryRegisterNo,
        "Period From": fromStr || "",
        "Period To": toStr || "",
        "Days": entry.days,
        "Remarks": entry.remarks
      };
    }));

    // Set column widths for better readability
    const columnWidths = [
      // { wch: 15 }, // Month - removed from UI but kept in Excel? User only said "dashboard se month ke column ki zarurat nahi"
      // Let's keep it in Excel for record keeping, but if strictly want to remove, we can.
      // Usually reports need dates. I will leave it in Excel for now as it doesn't hurt.
      { wch: 15 }, // Month
      { wch: 25 }, // Department
      { wch: 15 }, // Employee ID
      { wch: 20 }, // Employee Name
      { wch: 20 }, // Designation
      { wch: 20 }, // Salary Assistant
      { wch: 15 }, // Salary Register No
      { wch: 15 }, // Period From
      { wch: 15 }, // Period To
      { wch: 8 },  // Days
      { wch: 25 }  // Remarks
    ];
    worksheet['!cols'] = columnWidths;

    // Create a workbook with the worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");

    // Generate file name with filters applied
    let fileName = "Attendance_Report";
    if (departmentFilter.length > 0) {
      // Try to find department names
      const deptNames = departmentFilter.map(id => {
        const dept = availableDepartments.find(d => d.id.toString() === id);
        return dept ? dept.name.replace(/\s+/g, '_') : id;
      });
      fileName += `_${deptNames.join('_')}`;
    }
    if (monthFilter.length > 0) {
      fileName += `_${monthFilter.join('_').replace(/\s+/g, '_')}`;
    }
    fileName += ".xlsx";

    // Download the file
    XLSX.writeFile(workbook, fileName);
  };

  if (isLoading) return <Loading />;

  return (
    <div className="min-h-screen flex flex-col">
      <AdminHeader />
      <div className="p-6 flex-1">
        <Card className="w-full">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold">Attendance Reports</h1>
                <Badge variant="outline" className="text-lg">
                  Received
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={downloadExcel}
                  className="flex items-center gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Download Excel
                </Button>
                {!isSalaryAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/admin/employees")}
                    className="flex items-center gap-2"
                  >
                    <Users className="h-4 w-4" />
                    Manage Employees
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setLocation("/admin/dashboard")}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>

            {/* Pending Cancellation Requests Section */}
            {reports.filter(r => r.status === "cancel_requested").length > 0 && (
              <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h2 className="text-lg font-semibold text-orange-800 mb-3 flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  Pending Cancellation Requests ({reports.filter(r => r.status === "cancel_requested").length})
                </h2>
                <div className="space-y-2">
                  {reports.filter(r => r.status === "cancel_requested").map(report => (
                    <div key={report.id} className="flex items-center justify-between bg-white p-3 rounded border">
                      <div>
                        <span className="font-medium">{report.department?.name || `Department ${report.departmentId}`}</span>
                        <span className="text-muted-foreground mx-2">-</span>
                        <span className="text-sm">
                          {new Date(report.year, report.month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                        </span>
                        <span className="text-muted-foreground mx-2">|</span>
                        <span className="text-sm text-muted-foreground">Receipt: #{report.receiptNo}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/admin/reports/${report.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => acceptCancellation.mutate(report.id)}
                          disabled={acceptCancellation.isPending}
                        >
                          {acceptCancellation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          )}
                          Accept Cancellation
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by department, employee, designation, or remarks..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1); // Reset to first page on search
                  }}
                  className="pl-8"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={availableMonths.map(month => ({
                    label: month,
                    value: month
                  }))}
                  selected={monthFilter}
                  onChange={(values) => {
                    setMonthFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by month"
                  className="min-w-[180px]"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={filteredDepartments.map(dept => ({
                    label: dept.name,
                    value: dept.id.toString()
                  }))}
                  selected={departmentFilter}
                  onChange={(values) => {
                    setDepartmentFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by department"
                  className="min-w-[180px]"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={filteredSalaryAssistants.map(assistant => ({
                    label: assistant,
                    value: assistant
                  }))}
                  selected={salaryAssistantFilter}
                  onChange={(values) => {
                    setSalaryAssistantFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by salary assistant"
                  className="min-w-[180px]"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={filteredSalaryRegisters.map(register => ({
                    label: register,
                    value: register
                  }))}
                  selected={salaryRegisterFilter}
                  onChange={(values) => {
                    setSalaryRegisterFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by salary register"
                  className="min-w-[180px]"
                />
              </div>
            </div>

            {/* Top pagination */}
            {!isLoading && processedEntries.length > 0 && (
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, processedEntries.length)} of {processedEntries.length} entries
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Month column removed as per request */}
                    <TableHead>Department Name</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('employeeId')}
                    >
                      <div className="flex items-center gap-1">
                        Employee ID
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Salary Assistant</TableHead>
                    <TableHead>Salary Register No</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">
                        {searchTerm || departmentFilter.length > 0 || monthFilter.length > 0 || salaryRegisterFilter.length > 0
                          ? "No attendance entries found matching your search criteria."
                          : "No attendance entries found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedEntries.map((entry, index) => (
                      <TableRow key={index}>
                        {/* <TableCell>{entry.showMonth ? entry.month : ""}</TableCell> */}
                        <TableCell className="font-medium">
                          {entry.showDepartment ? entry.departmentName : ""}
                        </TableCell>
                        <TableCell>{entry.employeeId}</TableCell>
                        <TableCell>{entry.employeeName}</TableCell>
                        <TableCell>{entry.designation}</TableCell>
                        <TableCell>{entry.salaryAsstt}</TableCell>
                        <TableCell>{entry.salaryRegisterNo}</TableCell>
                        <TableCell>{entry.period}</TableCell>
                        <TableCell>{entry.days}</TableCell>
                        <TableCell>{entry.remarks || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setLocation(`/admin/reports/${entry.reportId}`)}
                              title="View Report Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {entry.fileUrl && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  let url = entry.fileUrl!;
                                  // Normalize URL - handle old domain migration
                                  if (url.includes('amu.echowkidar.in')) {
                                    const urlPath = url.replace(/https?:\/\/amu\.echowkidar\.in/, '');
                                    url = `${window.location.origin}${urlPath}`;
                                  } else if (url.startsWith('/')) {
                                    url = `${window.location.origin}${url}`;
                                  }
                                  window.open(url, '_blank');
                                }}
                                title="View Signed Report"
                              >
                                <FileText className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleVerify.mutate(entry.entryId)}
                              className={`h-6 w-6 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${entry.verified
                                ? 'bg-green-500 border-green-500'
                                : 'border-gray-300 hover:border-green-400'
                                }`}
                              title={entry.verified ? 'Verified ✓' : 'Mark as Verified'}
                            >
                              {entry.verified && (
                                <Check className="h-4 w-4 text-white" />
                              )}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Bottom pagination */}
            {!isLoading && processedEntries.length > 0 && (
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, processedEntries.length)} of {processedEntries.length} entries
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 