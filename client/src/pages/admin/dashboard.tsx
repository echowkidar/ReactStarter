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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";
import { FileCheck, LogOut, Eye, Download, Search, Users, Loader2, CheckCircle, XCircle, Trash2, RotateCcw, FileImage, Ticket, Megaphone } from "lucide-react";
import { AttendanceReport, Department } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  const { toast } = useToast();
  const [adminType, setAdminType] = useState<string>("super");

  useEffect(() => {
    const storedType = localStorage.getItem("adminType");
    if (storedType) {
      setAdminType(storedType);
    }
  }, []);

  const { data: reports, isLoading } = useQuery<ReportWithDepartment[]>({
    queryKey: ["/api/admin/attendance"],
  });

  // Fetch departments with permit status (Super Admin only)
  interface DepartmentWithPermit {
    id: number;
    name: string;
    attendancePermitted: boolean;
    employeeCount: number;
  }
  const { data: departments = [] } = useQuery<DepartmentWithPermit[]>({
    queryKey: ["/api/departments?registeredOnly=true"],
    select: (data: any[]) => data.map(d => ({
      id: d.id,
      name: d.name,
      attendancePermitted: d.attendancePermitted !== false,
      employeeCount: d.employeeCount || 0
    })),
  });

  // Fetch ticket stats
  const { data: ticketStats = { open: 0, inProgress: 0, resolved: 0, closed: 0 } } = useQuery<{
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
  }>({
    queryKey: ["/api/tickets/stats"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/tickets/stats");
      return response.json();
    },
  });

  // Calculate status for UI
  const totalDepts = departments.length;
  const enabledDepts = departments.filter(d => d.attendancePermitted);
  const disabledDepts = departments.filter(d => !d.attendancePermitted);
  const enabledCount = enabledDepts.length;
  const disabledCount = disabledDepts.length;
  const isAllEnabled = totalDepts > 0 && enabledCount === totalDepts;
  const isAllDisabled = totalDepts > 0 && enabledCount === 0;

  // Determine which list to show (minority)
  const shownList = enabledCount <= disabledCount ? enabledDepts : disabledDepts;
  const shownCount = shownList.length;
  const shownLabel = enabledCount <= disabledCount ? "Currently Enabled" : "Currently Disabled";


  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Delete feature state
  const [reportToDelete, setReportToDelete] = useState<ReportWithDepartment | null>(null);
  const [deleteStage, setDeleteStage] = useState<1 | 2>(1);

  // Default to current month
  const [monthFilter, setMonthFilter] = useState<string>(`${new Date().getFullYear()}-${new Date().getMonth()}`);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "receiptNo", direction: "desc" });
  const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);
  const [canManageEmployees, setCanManageEmployees] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

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

  const revertToDraft = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/attendance/${id}/revert-to-draft`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({
        title: "Success",
        description: "Report reverted to draft successfully"
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to revert report"
      });
    }
  });

  const deleteReport = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/attendance/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] }); // Update charts/counts
      toast({ title: "Success", description: "Report deleted successfully" });
      setReportToDelete(null);
      setDeleteStage(1);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete report. Please try again.", variant: "destructive" });
    }
  });

  // Global attendance toggle mutation (Super Admin only)
  const globalToggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("PATCH", "/api/admin/attendance-toggle-all", { enabled });
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments?registeredOnly=true"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({
        title: enabled ? "Attendance Enabled" : "Attendance Disabled",
        description: enabled
          ? "All departments can now submit attendance reports"
          : "All departments are blocked from submitting attendance reports",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to toggle attendance",
      });
    },
  });

  // Per-department permit toggle mutation (Super Admin only)
  const toggleDeptPermit = useMutation({
    mutationFn: async ({ deptId, permitted }: { deptId: number; permitted: boolean }) => {
      await apiRequest("PATCH", `/api/departments/${deptId}/attendance-permit`, { permitted });
    },
    onSuccess: (_, { permitted }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({
        title: permitted ? "Department Enabled" : "Department Disabled",
        description: permitted
          ? "This department can now submit attendance reports"
          : "This department is blocked from submitting attendance reports",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update department permission",
      });
    },
  });

  useEffect(() => {
    // Check user type
    const adminType = localStorage.getItem("adminType");
    setIsSalaryAdmin(adminType === "salary");
    setCanManageEmployees(adminType === "salary" || adminType === "super");
    setIsSuperAdmin(adminType === "super");

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

    // Ensure current month is always available
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    uniqueMonths.add(currentMonthKey);

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

  // Calculate Dashboard Stats (Current Month)
  const stats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

    const relevantDepts = departments.filter(d => (Number(d.employeeCount) || 0) > 0);
    const totalRelevant = relevantDepts.length;

    // Debug log
    console.log('Dashboard Stats Debug:', {
      totalDepts: departments.length,
      relevantDepts: totalRelevant,
      sampleDept: departments.slice(0, 1).map(d => ({ name: d.name, count: d.employeeCount }))
    });

    // Filter reports for current month
    const currentReports = reports?.filter(r => r.year === currentYear && r.month === currentMonth) || [];

    // Sent (Received): Must have Receipt No AND NOT Cancelled
    const sentReports = currentReports.filter(r =>
      (Number(r.receiptNo) > 0 || (typeof r.receiptNo === 'string' && r.receiptNo.length > 0)) &&
      r.status !== 'cancelled'
    );
    // Unique departments that have sent
    const sentDeptIds = new Set(sentReports.map(r => r.departmentId));
    // Intersection with RELEVANT departments (in case a dept with 0 employees sent one?)
    const sentCount = relevantDepts.filter(d => sentDeptIds.has(d.id)).length;

    const notSentCount = totalRelevant - sentCount;

    // Breakdown
    const breakdown = {
      submitted: currentReports.filter(r => r.status === 'submitted').length,
      draft: currentReports.filter(r => r.status === 'draft').length,
      cancelled: currentReports.filter(r => r.status === 'cancelled').length,
    };

    const requests = {
      cancellation: currentReports.filter(r => r.status === 'cancel_requested').length,
      recall: currentReports.filter(r => r.status === 'recall_requested').length,
    };

    return { totalRelevant, sentCount, notSentCount, breakdown, requests };
  }, [departments, reports]);

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

    // Handle "not_received" special filter
    if (statusFilter === "not_received" && monthFilter !== "all") {
      const [yearStr, monthIndexStr] = monthFilter.split('-');
      const targetYear = parseInt(yearStr);
      const targetMonth = parseInt(monthIndexStr) + 1; // 1-indexed for comparison

      // Find departments that have employees (>0) AND NO report for this month
      // AND are permitted (optional, but requested: 'departments with >0 employees')
      const missingDepts = departments.filter(dept => {
        if (!dept.employeeCount || dept.employeeCount === 0) return false;

        // Check if report exists
        const hasReport = reports.some(r =>
          r.departmentId === dept.id &&
          r.year === targetYear &&
          r.month === targetMonth &&
          r.status !== 'cancelled' // If cancelled, maybe they need to resubmit? Treat as not received? Or stick to 'sent'? User said "report status me sent nahi hai"
        );

        // If hasReport is true, we exclude it. We want missing ones.
        return !hasReport;
      });

      // Search term filtering for virtual list
      const searchLower = searchTerm.toLowerCase();

      const virtualReports = missingDepts
        .filter(dept => dept.name.toLowerCase().includes(searchLower))
        .map(dept => ({
          id: -dept.id, // Negative ID to indicate virtual
          departmentId: dept.id,
          department: { id: dept.id, name: dept.name, code: null },
          receiptNo: null,
          receiptDate: null,
          month: targetMonth,
          year: targetYear,
          transactionId: "-",
          despatchNo: "-",
          despatchDate: null,
          status: "not_received",
          // Add other required fields with dummy values
          createdAt: new Date(),
          fileUrl: null
        } as any)); // Type casting for convenience

      return virtualReports;
    }

    // Priority Sorting: Pending requests always on top
    filtered.sort((a, b) => {
      const aPending = a.status === 'cancel_requested' || a.status === 'recall_requested';
      const bPending = b.status === 'cancel_requested' || b.status === 'recall_requested';

      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      // Secondary Sorting: User selection or default
      if (sortConfig.key) {
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
      }

      return 0;
    });

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
              onClick={() => alert("Download Excel functionality to be implemented.")}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/admin/documents")}
              className="flex items-center gap-2"
            >
              <FileImage className="h-4 w-4" />
              Document Gallery
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/admin/tickets")}
              className="flex items-center gap-2"
            >
              <Ticket className="h-4 w-4" />
              Support Tickets
              {ticketStats.open > 0 && (
                <Badge className="ml-1 bg-red-500 text-white text-xs">{ticketStats.open}</Badge>
              )}
            </Button>
            <Button
              variant="default"
              onClick={() => setLocation("/admin/notices")}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Megaphone className="h-4 w-4" />
              Send Notice
            </Button>
            {canManageEmployees && (
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
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>


        {/* Dashboard Stats - 2x2 Grid Layout */}
        {/* Row 1: Attendance Report Status + Status Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Attendance Report Status (Current Month)</h3>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-3xl font-bold text-green-600">{stats.sentCount}</p>
                  <p className="text-[11px] uppercase tracking-wider text-green-700 font-semibold">Received</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-red-500">{stats.notSentCount}</p>
                  <p className="text-[11px] uppercase tracking-wider text-red-600 font-semibold">Not Received</p>
                </div>
              </div>
              <div className="ml-auto bg-gray-50 p-3 rounded-md text-right">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Total Departments</p>
                <p className="text-sm font-semibold">{stats.totalRelevant}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Status Breakdown</h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 bg-blue-50 rounded border border-blue-100">
                <p className="text-xl font-bold text-blue-700">{stats.breakdown.submitted}</p>
                <p className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold">Submitted</p>
              </div>
              <div className="p-2 bg-yellow-50 rounded border border-yellow-100">
                <p className="text-xl font-bold text-yellow-700">{stats.breakdown.draft}</p>
                <p className="text-[10px] uppercase tracking-wider text-yellow-600 font-semibold">Draft</p>
              </div>
              <div className="p-2 bg-red-50 rounded border border-red-100">
                <p className="text-xl font-bold text-red-700">{stats.breakdown.cancelled}</p>
                <p className="text-[10px] uppercase tracking-wider text-red-600 font-semibold">Cancelled</p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Support Tickets + Pending Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Support Tickets Stats */}
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-500">Support Tickets</h3>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/tickets")} className="text-xs">
                View All →
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 bg-blue-50 rounded border border-blue-100">
                <p className="text-xl font-bold text-blue-700">{ticketStats.open}</p>
                <p className="text-[10px] uppercase tracking-wider text-blue-600 font-semibold">Open</p>
              </div>
              <div className="p-2 bg-yellow-50 rounded border border-yellow-100">
                <p className="text-xl font-bold text-yellow-700">{ticketStats.inProgress}</p>
                <p className="text-[10px] uppercase tracking-wider text-yellow-600 font-semibold">In Progress</p>
              </div>
              <div className="p-2 bg-green-50 rounded border border-green-100">
                <p className="text-xl font-bold text-green-700">{ticketStats.resolved}</p>
                <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Resolved</p>
              </div>
              <div className="p-2 bg-gray-50 rounded border border-gray-100">
                <p className="text-xl font-bold text-gray-700">{ticketStats.closed}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Closed</p>
              </div>
            </div>
          </div>

          {/* Pending Actions */}
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Pending Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center justify-center p-3 bg-orange-50 rounded border border-orange-100">
                <p className="text-2xl font-bold text-orange-700">{stats.requests.cancellation}</p>
                <p className="text-[11px] uppercase tracking-wider text-orange-600 font-semibold text-center">Cancel Requests</p>
              </div>
              <div className="flex flex-col items-center justify-center p-3 bg-yellow-50 rounded border border-yellow-100">
                <p className="text-2xl font-bold text-yellow-700">{stats.requests.recall}</p>
                <p className="text-[11px] uppercase tracking-wider text-yellow-600 font-semibold text-center">Recall Requests</p>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Control Panel - Super Admin Only */}
        {isSuperAdmin && (
          <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">🎛️</span>
                <div>
                  <h3 className="font-semibold text-purple-800">Attendance Submission Control</h3>
                  <p className="text-sm text-purple-600">Enable or disable attendance report creation for ALL departments</p>
                  {!isAllEnabled && !isAllDisabled && shownCount > 0 && (
                    <div className="mt-2 text-xs text-purple-700 bg-purple-100 p-2 rounded border border-purple-200">
                      <strong>{shownLabel} ({shownCount}): </strong>
                      {shownCount > 10
                        ? `${shownList.slice(0, 10).map(d => d.name).join(", ")} and ${shownCount - 10} others`
                        : shownList.map(d => d.name).join(", ")
                      }
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => globalToggle.mutate(true)}
                  disabled={globalToggle.isPending || isAllEnabled}
                >
                  {globalToggle.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Enable All
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => globalToggle.mutate(false)}
                  disabled={globalToggle.isPending || isAllDisabled}
                >
                  {globalToggle.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Disable All
                </Button>
              </div>
            </div>
          </div>
        )}



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
              <SelectItem value="not_received">Not Received</SelectItem>
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
                      variant={
                        report.status === "submitted" || report.status === "sent" ? "default" :
                          report.status === "cancelled" || report.status === "not_received" ? "destructive" :
                            report.status === "recall_requested" ? "outline" :
                              "secondary"
                      }
                      className={report.status === "recall_requested" ? "text-yellow-600 border-yellow-300" : ""}
                    >
                      {report.status === "not_received" ? "Not Received" :
                        report.status === "recall_requested" ? "Recall Requested" :
                          report.status.charAt(0).toUpperCase() + report.status.slice(1)}
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
                      {/* View Details button - hidden for cancelled reports */}
                      {report.status !== "cancelled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/admin/reports/${report.id}`)}
                          className="flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          View Details
                        </Button>
                      )}
                      {/* Accept Cancellation button for cancel_requested status */}
                      {report.status === "cancel_requested" && (
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => acceptCancellation.mutate(report.id)}
                          disabled={acceptCancellation.isPending}
                        >
                          {acceptCancellation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          )}
                          Accept Cancel
                        </Button>
                      )}
                      {/* Revert to Draft button (Recall or manual revert) */}
                      {(report.status === "submitted" || report.status === "recall_requested") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className={report.status === "recall_requested" ? "text-yellow-600 border-yellow-300 hover:bg-yellow-50" : ""}
                          onClick={() => revertToDraft.mutate(report.id)}
                          disabled={revertToDraft.isPending}
                          title={report.status === "recall_requested" ? "Approve Recall Request" : "Revert to Draft"}
                        >
                          {revertToDraft.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4 mr-1" />
                          )}
                          {report.status === "recall_requested" ? "Approve Recall" : "Revert Draft"}
                        </Button>
                      )}
                      {/* Status indicator for cancelled reports */}
                      {report.status === "cancelled" && (
                        <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          Cancelled
                        </span>
                      )}

                    </div>
                    {/* Delete Action - restricted to super admin */}
                    {adminType === "super" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-1"
                        onClick={() => {
                          setReportToDelete(report);
                          setDeleteStage(1);
                        }}
                        title="Delete Report"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}


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

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{deleteStage === 1 ? "Delete Attendance Report" : "Final Confirmation"}</DialogTitle>
              <DialogDescription>
                {deleteStage === 1
                  ? "Warning: You are about to delete an attendance report. This will permanently remove the report, all its entries, and any uploaded files."
                  : "Are you absolutely sure? This action cannot be undone."
                }
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setReportToDelete(null)}>Cancel</Button>
              {deleteStage === 1 ? (
                <Button variant="destructive" onClick={() => setDeleteStage(2)}>Next</Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => reportToDelete && deleteReport.mutate(reportToDelete.id)}
                  disabled={deleteReport.isPending}
                >
                  {deleteReport.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : "Permanently Delete"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div >
  );
}