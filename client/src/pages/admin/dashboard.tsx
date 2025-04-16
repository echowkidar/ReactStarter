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
import { FileCheck, LogOut, Eye, Download, Search, Users } from "lucide-react";
import { AttendanceReport, Department } from "@shared/schema";
import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MultiSelect, Option } from "@/components/ui/multi-select";

type ReportWithDepartment = AttendanceReport & {
  department?: Department;
};

type SortConfig = {
  key: keyof ReportWithDepartment | "";
  direction: "asc" | "desc";
};

const PdfPreview = ({ pdfUrl }: { pdfUrl: string }) => {
  return (
    <div className="space-y-6">
      <div className="w-full h-[600px] border rounded-lg overflow-hidden">
        <object data={pdfUrl} type="application/pdf" className="w-full h-full">
          <p>
            Unable to display PDF.{" "}
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              Click here to download
            </a>
          </p>
        </object>
      </div>
    </div>
  );
};

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { data: reports, isLoading } = useQuery<ReportWithDepartment[]>({
    queryKey: ["/api/admin/attendance"],
  });
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "receiptNo", direction: "desc" });
  const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);

  useEffect(() => {
    // Check if user is salary admin
    const adminType = localStorage.getItem("adminType");
    setIsSalaryAdmin(adminType === "salary");
  }, []);

  // Format date helper function
  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Get unique months from reports
  const availableMonths = useMemo(() => {
    if (!reports) return [];
    const uniqueMonths = new Set();
    reports.forEach(report => {
      const date = new Date(report.year, report.month - 1);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      uniqueMonths.add(monthKey);
    });
    return Array.from(uniqueMonths).map(monthKey => {
      const [year, month] = (monthKey as string).split('-');
      return {
        value: monthKey as string,
        label: new Date(parseInt(year), parseInt(month)).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long'
        })
      };
    }).sort((a, b) => b.value.localeCompare(a.value)); // Sort in descending order
  }, [reports]);

  // Get unique departments from reports
  const availableDepartments = useMemo(() => {
    if (!reports) return [];
    
    const uniqueDepartments = new Map<string, Department>();
    
    reports.forEach(report => {
      if (report.department && report.department.id) {
        uniqueDepartments.set(report.department.id.toString(), report.department);
      }
    });
    
    return Array.from(uniqueDepartments.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reports]);

  const handleSort = (key: keyof ReportWithDepartment) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const filteredAndSortedReports = useMemo(() => {
    if (!reports) return [];

    let filtered = reports.filter(report => {
      const searchLower = searchTerm.toLowerCase();
      
      // Format dates for searching
      const receiptDateFormatted = report.receiptDate ? formatDate(report.receiptDate) : "";
      const despatchDateFormatted = report.despatchDate ? formatDate(report.despatchDate) : "";
      
      // Format month for searching
      const monthFormatted = new Date(report.year, report.month - 1).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      }).toLowerCase();
      
      const matchesSearch = 
        report.department?.name?.toLowerCase().includes(searchLower) ||
        report.receiptNo?.toString().includes(searchLower) ||
        report.transactionId?.toLowerCase().includes(searchLower) ||
        receiptDateFormatted.toLowerCase().includes(searchLower) ||
        monthFormatted.includes(searchLower) ||
        (report.despatchNo?.toLowerCase() || "").includes(searchLower) ||
        despatchDateFormatted.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === "all" || report.status === statusFilter;

      // Add month filtering
      const matchesMonth = monthFilter === "all" || 
        `${report.year}-${report.month - 1}` === monthFilter;
        
      // Add department filtering
      const matchesDepartment = departmentFilter.length === 0 || 
        (report.department && departmentFilter.includes(report.department.id.toString()));

      return matchesSearch && matchesStatus && matchesMonth && matchesDepartment;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof ReportWithDepartment];
        let bValue: any = b[sortConfig.key as keyof ReportWithDepartment];

        if (sortConfig.key === "department") {
          aValue = a.department?.name || "";
          bValue = b.department?.name || "";
        }

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        // Convert to strings for safe comparison
        const aString = String(aValue);
        const bString = String(bValue);

        const comparison = aString < bString ? -1 : aString > bString ? 1 : 0;
        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  }, [reports, searchTerm, statusFilter, monthFilter, departmentFilter, sortConfig]);

  const handleLogout = () => {
    // Clear admin data from localStorage
    localStorage.removeItem("adminType");
    setLocation("/admin/login");
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
              <FileCheck className="h-4 w-4 mr-2" />
              Salary Section
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setLocation("/admin/attendance-reports")}
              className="flex items-center gap-2"
            >
              <FileCheck className="h-4 w-4" />
              Detailed View
            </Button>
            {isSalaryAdmin && (
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/employees")}
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Manage Employees
              </Button>
            )}
            {!isSalaryAdmin && (
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/users")}
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                User Management
              </Button>
            )}
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
              placeholder="Search by department, receipt no. or transaction ID..."
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
              {availableMonths.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
          <MultiSelect
            options={availableDepartments.map(dept => ({
              label: dept.name,
              value: dept.id.toString()
            }))}
            selected={departmentFilter}
            onChange={(values) => {
              setDepartmentFilter(values);
            }}
            placeholder="Filter by department"
            className="w-[240px]"
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort("receiptNo")}
                >
                  Receipt No.
                  {sortConfig.key === "receiptNo" && (
                    <span className="ml-2">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort("receiptDate")}
                >
                  Receipt Date
                  {sortConfig.key === "receiptDate" && (
                    <span className="ml-2">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort("month")}
                >
                  Month
                  {sortConfig.key === "month" && (
                    <span className="ml-2">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort("department")}
                >
                  Department
                  {sortConfig.key === "department" && (
                    <span className="ml-2">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </TableHead>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Despatch No.</TableHead>
                <TableHead>Despatch Date</TableHead>
                <TableHead 
                  className="cursor-pointer"
                  onClick={() => handleSort("status")}
                >
                  Status
                  {sortConfig.key === "status" && (
                    <span className="ml-2">
                      {sortConfig.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedReports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>{report.receiptNo || "-"}</TableCell>
                  <TableCell>{formatDate(report.receiptDate)}</TableCell>
                  <TableCell>
                    {new Date(report.year, report.month - 1).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                      }
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {report.department?.name || "N/A"}
                  </TableCell>
                  <TableCell>
                    {report.status === "draft"
                      ? "*****"
                      : report.transactionId || "Not generated"}
                  </TableCell>
                  <TableCell>{report.despatchNo || "-"}</TableCell>
                  <TableCell>{formatDate(report.despatchDate)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={report.status === "submitted" ? "default" : "secondary"}
                    >
                      {report.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {report.fileUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedReport(report.id);
                            setShowPdfPreview(true);
                          }}
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          View PDF
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/admin/reports/${report.id}`)}
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        View Details
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Dialog open={showPdfPreview} onOpenChange={setShowPdfPreview}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>View Report PDF</DialogTitle>
              <DialogDescription>
                Review the submitted report PDF.
              </DialogDescription>
            </DialogHeader>
            {selectedReport &&
              reports?.find((r) => r.id === selectedReport)?.fileUrl && (
                <PdfPreview
                  pdfUrl={reports.find((r) => r.id === selectedReport)!.fileUrl!}
                />
              )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}