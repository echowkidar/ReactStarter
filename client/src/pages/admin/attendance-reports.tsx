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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";
import { LogOut, Users, Eye, Search, ArrowLeft, FileDown } from "lucide-react";
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
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [salaryRegisterFilter, setSalaryRegisterFilter] = useState("all");
  const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);

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

  // Filter entries based on search and filters
  const filteredEntries = useMemo(() => {
    return allEntries.filter(entry => {
      const matchesSearch = 
        entry.month.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.departmentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.designation.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.salaryRegisterNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.remarks.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesDepartment = departmentFilter === "all" || 
        entry.departmentId.toString() === departmentFilter;
      
      const matchesMonth = monthFilter === "all" || 
        entry.month === monthFilter;
      
      const matchesSalaryRegister = salaryRegisterFilter === "all" || 
        entry.salaryRegisterNo === salaryRegisterFilter;
      
      return matchesSearch && matchesDepartment && matchesMonth && matchesSalaryRegister;
    });
  }, [allEntries, searchTerm, departmentFilter, monthFilter, salaryRegisterFilter]);

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

  const handleLogout = () => {
    // Clear admin data from localStorage
    localStorage.removeItem("adminType");
    setLocation("/admin/login");
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
    if (departmentFilter !== "all") {
      const dept = availableDepartments.find(d => d.id.toString() === departmentFilter);
      if (dept) fileName += `_${dept.name.replace(/\s+/g, '_')}`;
    }
    if (monthFilter !== "all") {
      fileName += `_${monthFilter.replace(/\s+/g, '_')}`;
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

        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by department, employee, designation, or remarks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select
            value={monthFilter}
            onValueChange={setMonthFilter}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {availableMonths.map((month) => (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={departmentFilter}
            onValueChange={setDepartmentFilter}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {availableDepartments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id.toString()}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={salaryRegisterFilter}
            onValueChange={setSalaryRegisterFilter}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by salary register" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Salary Registers</SelectItem>
              {availableSalaryRegisters.map((register) => (
                <SelectItem key={register} value={register}>
                  {register}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
              {processedEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8">
                    No attendance entries found
                  </TableCell>
                </TableRow>
              ) : (
                processedEntries.map((entry, index) => (
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
      </div>
    </div>
  );
} 