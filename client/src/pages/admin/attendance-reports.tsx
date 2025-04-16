import { useQuery } from "@tanstack/react-query";
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
import { LogOut, Users, Eye, Search, ArrowLeft, FileDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";

type AttendanceEntry = {
  id: number;
  reportId: number;
  employeeId: number;
  days: number;
  fromDate: string;
  toDate: string;
  periods: string;
  remarks: string;
  employee?: {
    id: number;
    departmentId: number;
    name: string;
    employeeId?: string; // This would be EPID
    epid?: string;       // Handle both field names
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
  entries?: AttendanceEntry[];
};

export default function AttendanceReports() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [salaryRegisterFilter, setSalaryRegisterFilter] = useState<string[]>([]);
  const [salaryAssistantFilter, setSalaryAssistantFilter] = useState<string[]>([]);
  const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    // Check if user is salary admin
    const adminType = localStorage.getItem("adminType");
    setIsSalaryAdmin(adminType === "salary");
  }, []);

  // Fetch all attendance reports with status "sent"
  const { data: reports = [], isLoading } = useQuery<AttendanceReport[]>({
    queryKey: ["/api/admin/attendance"],
    select: (data) => data.filter(report => report.status === "sent"),
  });

  // Add this debug log to see the entire reports data
  console.log("Reports data:", JSON.stringify(reports, null, 2));

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
            console.log("Employee data in attendance report:", entry.employee);
            console.log("Employee data keys:", Object.keys(entry.employee));
            
            // First try direct access, then fall back to empty string
            const salaryAssttValue = entry.employee.salary_asstt !== undefined ? 
              String(entry.employee.salary_asstt) : 
              (typeof entry.employee === 'object' && 'salary_asstt' in entry.employee) ? 
                String(entry.employee.salary_asstt) : 
                "";
                
            console.log("Employee salary_asstt value:", salaryAssttValue);
            
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

  // Get unique months for the filter
  const availableMonths = useMemo(() => {
    const uniqueMonths = new Set(allEntries.map(entry => entry.month));
    return Array.from(uniqueMonths).sort();
  }, [allEntries]);

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
    
    // Apply department filter when calculating available months and salary registers
    let departmentFilteredEntries = result;
    if (departmentFilter.length > 0) {
      departmentFilteredEntries = result.filter(
        entry => departmentFilter.includes(entry.departmentId.toString())
      );
    }
    
    // Apply month filter when calculating available departments and salary registers
    let monthFilteredEntries = result;
    if (monthFilter.length > 0) {
      monthFilteredEntries = result.filter(
        entry => monthFilter.includes(entry.month)
      );
    }
    
    // Apply salary register filter when calculating available departments and months
    let salaryRegisterFilteredEntries = result;
    if (salaryRegisterFilter.length > 0) {
      salaryRegisterFilteredEntries = result.filter(
        entry => salaryRegisterFilter.includes(entry.salaryRegisterNo)
      );
    }
    
    // Apply salary assistant filter when calculating available departments, months, and registers
    let salaryAssistantFilteredEntries = result;
    if (salaryAssistantFilter.length > 0) {
      salaryAssistantFilteredEntries = result.filter(
        entry => salaryAssistantFilter.includes(entry.salaryAsstt)
      );
    }
    
    // Get available departments based on other filters
    const filteredForDepartments = 
      monthFilter.length > 0 ? monthFilteredEntries : 
      salaryRegisterFilter.length > 0 ? salaryRegisterFilteredEntries :
      salaryAssistantFilter.length > 0 ? salaryAssistantFilteredEntries : result;
    const deptIds = new Set(filteredForDepartments.map(entry => entry.departmentId.toString()));
    
    // Get available months based on other filters
    const filteredForMonths = 
      departmentFilter.length > 0 ? departmentFilteredEntries : 
      salaryRegisterFilter.length > 0 ? salaryRegisterFilteredEntries :
      salaryAssistantFilter.length > 0 ? salaryAssistantFilteredEntries : result;
    const months = new Set(filteredForMonths.map(entry => entry.month));
    
    // Get available salary registers based on other filters
    const filteredForSalaryRegisters = 
      departmentFilter.length > 0 ? departmentFilteredEntries : 
      monthFilter.length > 0 ? monthFilteredEntries :
      salaryAssistantFilter.length > 0 ? salaryAssistantFilteredEntries : result;
    const salaryRegisters = new Set(filteredForSalaryRegisters.map(entry => entry.salaryRegisterNo));
    
    // Get available salary assistants based on other filters
    const filteredForSalaryAssistants = 
      departmentFilter.length > 0 ? departmentFilteredEntries : 
      monthFilter.length > 0 ? monthFilteredEntries :
      salaryRegisterFilter.length > 0 ? salaryRegisterFilteredEntries : result;
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
  }, [filteredEntries]);

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
    const worksheet = XLSX.utils.json_to_sheet(processedEntries.map(entry => ({
      "Month": entry.month,
      "Department": entry.departmentName,
      "Employee ID": entry.employeeId,
      "Employee Name": entry.employeeName,
      "Designation": entry.designation,
      "Salary Assistant": entry.salaryAsstt,
      "Salary Register No": entry.salaryRegisterNo,
      "Period": entry.period,
      "Days": entry.days,
      "Remarks": entry.remarks
    })));

    // Set column widths for better readability
    const columnWidths = [
      { wch: 15 }, // Month
      { wch: 25 }, // Department
      { wch: 15 }, // Employee ID
      { wch: 20 }, // Employee Name
      { wch: 20 }, // Designation
      { wch: 20 }, // Salary Assistant
      { wch: 15 }, // Salary Register No
      { wch: 25 }, // Period
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
                  options={filteredMonths.map(month => ({
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
                    <TableHead>Month</TableHead>
                    <TableHead>Department Name</TableHead>
                    <TableHead>Employee ID</TableHead>
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
                        <TableCell>{entry.showMonth ? entry.month : ""}</TableCell>
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/admin/reports/${entry.reportId}`)}
                            className="flex items-center gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            View Report
                          </Button>
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