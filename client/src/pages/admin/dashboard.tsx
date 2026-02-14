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
import { FileCheck, LogOut, Eye, Download, Search, Users, Loader2, CheckCircle, XCircle, Trash2, RotateCcw, FileImage, Ticket, Megaphone, ArrowRightLeft, Settings } from "lucide-react";
import { AttendanceReport, Department } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Label } from 'recharts';

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
  // Normalize URL to use current origin - handles domain migration and relative paths
  const normalizedUrl = (() => {
    if (!pdfUrl) return '';

    // If it's an absolute URL with old domain, extract path and use current origin
    if (pdfUrl.includes('amu.echowkidar.in')) {
      const urlPath = pdfUrl.replace(/https?:\/\/amu\.echowkidar\.in/, '');
      return `${window.location.origin}${urlPath}`;
    }

    // If it's a relative path starting with /
    if (pdfUrl.startsWith('/')) {
      return `${window.location.origin}${pdfUrl}`;
    }

    // If it starts with http but not current origin, try to extract and use path
    if (pdfUrl.startsWith('http') && !pdfUrl.startsWith(window.location.origin)) {
      try {
        const url = new URL(pdfUrl);
        return `${window.location.origin}${url.pathname}`;
      } catch {
        return pdfUrl;
      }
    }

    return pdfUrl;
  })();

  return (
    <div className="space-y-6">
      <div className="w-full h-[600px] border rounded-lg overflow-hidden">
        <object data={normalizedUrl} type="application/pdf" className="w-full h-full">
          <p>
            Unable to display PDF.{" "}
            <a href={normalizedUrl} target="_blank" rel="noopener noreferrer">
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

  // Default to current month
  const [monthFilter, setMonthFilter] = useState<string>(`${new Date().getFullYear()}-${new Date().getMonth()}`);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "receiptNo", direction: "desc" });
  const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);
  const [canManageEmployees, setCanManageEmployees] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Send heartbeat for admin user tracking
  const adminName = localStorage.getItem("adminUsername") || "Admin";
  const adminEmail = localStorage.getItem("adminEmail") || "";
  useHeartbeat({
    type: 'admin',
    name: adminName,
    email: adminEmail
  });

  // Parse month filter for API query
  const [filterYear, filterMonth] = (monthFilter || `${new Date().getFullYear()}-${new Date().getMonth()}`).split('-').map(Number);

  // API expects 1-based month
  const apiMonth = filterMonth + 1;

  const { data: reports, isLoading } = useQuery<ReportWithDepartment[]>({
    queryKey: ["/api/admin/attendance", apiMonth, filterYear],
    queryFn: async () => {
      // Add query params if filter is set
      const url = `/api/admin/attendance?month=${apiMonth}&year=${filterYear}`;
      const response = await apiRequest("GET", url);
      return response.json();
    }
  });

  // Fetch departments with permit status (Super Admin only)
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

  // Fetch active users count (refresh every 10 seconds)
  const { data: activeUsersStats = { total: 0, departments: 0, admins: 0 } } = useQuery<{
    total: number;
    departments: number;
    admins: number;
  }>({
    queryKey: ["/api/admin/active-users"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/active-users");
      return response.json();
    },
    refetchInterval: 120000, // Refresh every 2 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Active Users Graph Data
  const [activeUsersPeriod, setActiveUsersPeriod] = useState<string>("6h");
  const { data: activeUsersHistory = [] } = useQuery<{ timestamp: string; count: number }[]>({
    queryKey: ["/api/admin/active-users/history", activeUsersPeriod],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/active-users/history?period=${activeUsersPeriod}`);
      return response.json();
    },
    refetchInterval: 120000, // Refresh graph data every 2 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fetch visitor analytics stats
  interface VisitorMonthStats {
    year: number;
    month: number;
    uniqueVisitors: number;
    totalVisits: number;
    uniqueIPs: number;
  }
  const { data: visitorStats } = useQuery<{
    currentMonth: VisitorMonthStats;
    previousMonth: VisitorMonthStats;
  }>({
    queryKey: ["/api/admin/visitor-stats"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/visitor-stats");
      return response.json();
    },
    refetchInterval: 120000, // Refresh every 2 minutes
  });

  // Fetch transfer stats
  const { data: transferStats = { pendingTransfer: 0, pendingRelease: 0, resolved: 0 } } = useQuery<{
    pendingTransfer: number;
    pendingRelease: number;
    resolved: number;
  }>({
    queryKey: ["/api/admin/transfer-stats"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/transfer-stats");
      return response.json();
    },
    refetchInterval: 120000, // Refresh every 2 minutes
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
      queryClient.invalidateQueries({ queryKey: ["/api/departments?showAll=true"] });
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



    // Filter reports for current month
    const currentReports = reports?.filter(r => r.year === currentYear && r.month === currentMonth) || [];

    // Sent (Received): Must have Receipt No AND NOT Cancelled
    const sentReports = currentReports.filter(r =>
      r.receiptNo && r.receiptNo > 0 &&
      r.status !== 'cancelled'
    );
    // Unique departments that have sent
    const sentDeptIds = new Set(sentReports.map(r => r.departmentId));
    // Intersection with RELEVANT departments (in case a dept with 0 employees sent one?)
    const sentCount = relevantDepts.filter(d => sentDeptIds.has(d.id)).length;

    // Processed: Submitted or Draft, but NOT in Sent (Received) list
    const processedReports = currentReports.filter(r =>
      (r.status === 'submitted' || r.status === 'draft')
    );
    const processedDeptIds = new Set(processedReports.map(r => r.departmentId));

    // Departments that are Processed but NOT Sent (Received)
    const processedCount = relevantDepts.filter(d =>
      !sentDeptIds.has(d.id) && processedDeptIds.has(d.id)
    ).length;

    // Not Processed: Total - (Received + Processed)
    const notProcessedCount = totalRelevant - sentCount - processedCount;

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

    return { totalRelevant, sentCount, processedCount, notProcessedCount, breakdown, requests };
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

        // Use numerical comparison for receiptNo
        if (sortConfig.key === "receiptNo") {
          const aNum = Number(aValue) || 0;
          const bNum = Number(bValue) || 0;
          const comparison = aNum - bNum;
          return sortConfig.direction === "asc" ? comparison : -comparison;
        }

        // Convert to strings for other fields
        const aString = String(aValue);
        const bString = String(bValue);

        const comparison = aString < bString ? -1 : aString > bString ? 1 : 0;
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      return 0;
    });

    return filtered;
  }, [reports, searchTerm, statusFilter, monthFilter, departmentFilter, sortConfig, departments]);

  const handleLogout = () => {
    // Send logout signal to remove from active users
    const sessionId = sessionStorage.getItem('heartbeat_session_id');
    if (sessionId) {
      const data = JSON.stringify({ sessionId });
      const blob = new Blob([data], { type: 'application/json' });
      try {
        navigator.sendBeacon('/api/heartbeat/logout', blob);
      } catch {
        fetch('/api/heartbeat/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true
        }).catch(() => { });
      }
      sessionStorage.removeItem('heartbeat_session_id');
    }

    // Clear admin data from localStorage
    localStorage.removeItem("adminType");
    localStorage.removeItem("adminEmail");
    localStorage.removeItem("adminUsername");
    setLocation("/admin/login");
  };

  // Download Excel (CSV format) for reports
  const handleDownloadExcel = () => {
    if (!reports || reports.length === 0) {
      toast({ title: "No data", description: "No reports to export", variant: "destructive" });
      return;
    }

    // Create CSV header
    const headers = [
      "Receipt No.",
      "Receipt Date",
      "Month",
      "Year",
      "Department",
      "Transaction ID",
      "Despatch No.",
      "Despatch Date",
      "Status",
      "Created At"
    ];

    // Create CSV rows
    const monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    const rows = reports.map((report: ReportWithDepartment) => {
      const dept = departments.find(d => d.id === report.departmentId);
      return [
        report.receiptNo || "",
        report.receiptDate ? new Date(report.receiptDate).toLocaleDateString() : "",
        monthNames[report.month - 1] || "",
        report.year || "",
        dept?.name || `Department ${report.departmentId}`,
        report.transactionId || "",
        report.despatchNo || "",
        report.despatchDate ? new Date(report.despatchDate).toLocaleDateString() : "",
        report.status || "",
        report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ""
      ];
    });

    // Combine header and rows
    const csvContent = [
      headers.join(","),
      ...rows.map((row: (string | number)[]) => row.map((cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const today = new Date();
    link.setAttribute("download", `attendance_reports_${today.getFullYear()}_${today.getMonth() + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Downloaded", description: `Exported ${reports.length} reports to CSV` });
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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/admin/attendance-reports")}
              className="flex items-center gap-1"
            >
              <FileCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Detailed View</span>
            </Button>
            {!isSalaryAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/admin/users")}
                className="flex items-center gap-1"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">User Management</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadExcel}
              className="flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Download Excel</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/admin/documents")}
              className="flex items-center gap-1"
            >
              <FileImage className="h-4 w-4" />
              <span className="hidden md:inline">Documents</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/admin/tickets")}
              className="flex items-center gap-1"
            >
              <Ticket className="h-4 w-4" />
              <span className="hidden md:inline">Tickets</span>
              {ticketStats.open > 0 && (
                <Badge className="ml-1 bg-red-500 text-white text-xs">{ticketStats.open}</Badge>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setLocation("/admin/notices")}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700"
            >
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Notice</span>
            </Button>
            {canManageEmployees && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/admin/employees")}
                className="flex items-center gap-1"
              >
                <Users className="h-4 w-4" />
                <span className="hidden lg:inline">Employees</span>
              </Button>
            )}
            {isSuperAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/admin/settings")}
                className="flex items-center gap-1"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>


        {/* Dashboard Stats - 2x2 Grid Layout */}
        {/* Row 1: Attendance Report Status + Status Breakdown */}
        {/* Dashboard Stats - 3x1 Grid Layout (Modified) */}
        {/* Row 1: Attendance Report Status + Status Breakdown + Transfer Requests */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col justify-between h-full">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Attendance Report Status (Current Month)</h3>
            <div className="flex items-center justify-between flex-1">
              <div className="flex items-center gap-8 pl-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{stats.sentCount}</p>
                  <p className="text-[11px] uppercase tracking-wider text-green-700 font-semibold">Received</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-amber-600">{stats.processedCount}</p>
                  <p className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">Processed</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-500">{stats.notProcessedCount}</p>
                  <p className="text-[11px] uppercase tracking-wider text-red-600 font-semibold">Not Processed</p>
                </div>
              </div>

              <div className="h-[120px] w-[120px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Received', value: stats.sentCount, color: '#16a34a' },
                        { name: 'Processed', value: stats.processedCount, color: '#d97706' },
                        { name: 'Not Processed', value: stats.notProcessedCount, color: '#ef4444' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={55}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {
                        [
                          { name: 'Received', value: stats.sentCount, color: '#16a34a' },
                          { name: 'Processed', value: stats.processedCount, color: '#d97706' },
                          { name: 'Not Processed', value: stats.notProcessedCount, color: '#ef4444' }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))
                      }
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [value, name]}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Custom center label for (Received + Processed) / Total */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-gray-900 leading-none">
                      {stats.sentCount + stats.processedCount}
                    </span>
                    <span className="text-xs text-gray-500 font-medium leading-none mt-1">
                      / {stats.totalRelevant}
                    </span>
                  </div>
                </div>
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

          {/* Transfer Requests Card - Moved to top row */}
          <div className="bg-white p-4 rounded-lg border shadow-sm border-l-4 border-l-orange-500">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Transfer Requests</h3>
                <p className="text-xs text-muted-foreground">Manage employee transfers</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/transfer-requests")} className="h-6 w-6 p-0 rounded-full">
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center p-2 bg-orange-50 rounded border border-orange-100">
                <p className="text-xl font-bold text-orange-700">{transferStats.pendingTransfer}</p>
                <p className="text-[9px] uppercase tracking-wider text-orange-600 font-semibold">Transfers</p>
              </div>
              <div className="text-center p-2 bg-indigo-50 rounded border border-indigo-100">
                <p className="text-xl font-bold text-indigo-700">{transferStats.pendingRelease}</p>
                <p className="text-[9px] uppercase tracking-wider text-indigo-600 font-semibold">Releases</p>
              </div>
              <div className="text-center p-2 bg-green-50 rounded border border-green-100">
                <p className="text-xl font-bold text-green-700">{transferStats.resolved}</p>
                <p className="text-[9px] uppercase tracking-wider text-green-600 font-semibold">Done (Mo)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Active Users, Visitor Stats, Tickets, Pending Actions - 4 column grid */}
        {/* Row 2: Active Users, Visitor Stats, Tickets, Pending Actions - 12 column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 mb-4">
          {/* Live Active Users */}
          {/* Live Active Users - Expanded with Graph */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-6 bg-gradient-to-br from-purple-50 to-indigo-50 p-2 rounded-lg border border-purple-200 shadow-sm flex gap-3 h-[160px]">

            {/* Sidebar: Header + Stats + Controls */}
            <div className="flex flex-col justify-between w-32 shrink-0 border-r border-purple-100 pr-2">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 bg-purple-100 rounded-full">
                    <Users className="h-3.5 w-3.5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-[11px] font-bold text-purple-800 leading-tight">Active Users</h3>
                    <p className="text-[8px] text-purple-600">Live • Auto-refresh</p>
                  </div>
                </div>

                {/* Compact Stats Grid */}
                <div className="grid grid-cols-2 gap-1 mt-2">
                  <div className="text-center py-1 px-1 bg-white/70 rounded border border-purple-100 shadow-sm col-span-2">
                    <p className="text-xl font-bold text-purple-700 leading-none">{activeUsersStats.total}</p>
                    <p className="text-[8px] uppercase tracking-wider text-purple-600 font-semibold">Total</p>
                  </div>
                  <div className="text-center py-1 px-0.5 bg-white/70 rounded border border-purple-100">
                    <p className="text-sm font-bold text-blue-600 leading-none">{activeUsersStats.departments}</p>
                    <p className="text-[7px] uppercase tracking-wider text-blue-500 font-semibold">Depts</p>
                  </div>
                  <div className="text-center py-1 px-0.5 bg-white/70 rounded border border-purple-100">
                    <p className="text-sm font-bold text-indigo-600 leading-none">{activeUsersStats.admins}</p>
                    <p className="text-[7px] uppercase tracking-wider text-indigo-500 font-semibold">Admins</p>
                  </div>
                </div>
              </div>

              {/* Time Period Selector - Compact */}
              <Select value={activeUsersPeriod} onValueChange={setActiveUsersPeriod}>
                <SelectTrigger className="w-full h-6 text-[10px] bg-white/80 border-purple-200 px-2 min-h-0">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="6h">6 Hours</SelectItem>
                  <SelectItem value="24h">24 Hours</SelectItem>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="current_month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Graph Area */}
            <div className="flex-1 min-w-0 h-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={activeUsersHistory?.map(d => ({ ...d, timestamp: new Date(d.timestamp).getTime() })) || []}
                  margin={{ top: 5, right: 0, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={(() => {
                      // Calculate domain based on DATA, not just "now", to prevent the "blank gap"
                      // Use the latest data point as the "end" time, or fallback to now if empty
                      const data = activeUsersHistory?.map(d => ({ ...d, timestamp: new Date(d.timestamp).getTime() })) || [];
                      const latestDataTime = data.length > 0 ? Math.max(...data.map(d => d.timestamp)) : Date.now();

                      // However, if we only use latestDataTime, the graph stops. 
                      // But the user likes "updates with heartbeat". 
                      // If we use Date.now(), we get a gap.
                      // So we use latestDataTime. This means the time axis "stalls" until next update.
                      const endTime = latestDataTime;

                      let start = endTime - 6 * 60 * 60 * 1000; // default 6h
                      if (activeUsersPeriod === '1h') start = endTime - 1 * 60 * 60 * 1000;
                      if (activeUsersPeriod === '6h') start = endTime - 6 * 60 * 60 * 1000;
                      if (activeUsersPeriod === '24h') start = endTime - 24 * 60 * 60 * 1000;
                      if (activeUsersPeriod === '7d') start = endTime - 7 * 24 * 60 * 60 * 1000;
                      if (activeUsersPeriod === 'current_month') {
                        const d = new Date();
                        d.setDate(1); d.setHours(0, 0, 0, 0);
                        start = d.getTime();
                      }
                      return [start, endTime];
                    })()}
                    scale="time"
                    tick={{ fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return activeUsersPeriod === '1h' || activeUsersPeriod === '6h' || activeUsersPeriod === '24h'
                        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false })
                        : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
                    }}
                    minTickGap={30}
                  />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    width={45}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    labelFormatter={(val) => new Date(val).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    contentStyle={{ fontSize: '11px', borderRadius: '6px', padding: '4px 8px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#8884d8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Visitors - Current Month */}
          {/* Visitors - Current Month */}
          {/* Visitors - Current Month - Compact Height */}
          <div className="col-span-1 lg:col-span-2 bg-gradient-to-br from-teal-50 to-cyan-50 p-2 rounded-lg border border-teal-200 shadow-sm h-[160px] flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1 bg-teal-100 rounded-full">
                <Eye className="h-3.5 w-3.5 text-teal-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] font-semibold text-teal-800 truncate">Visitors - Current</h3>
                <p className="text-[8px] text-teal-600 truncate">
                  {visitorStats?.currentMonth?.month ? new Date(2000, visitorStats.currentMonth.month - 1).toLocaleString('default', { month: 'short' }) : '...'} {visitorStats?.currentMonth?.year || ''}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 justify-center">
              <div className="flex bg-white/70 rounded border border-teal-100 items-center justify-between px-2 py-1">
                <p className="text-[9px] uppercase tracking-wider text-teal-600 font-semibold">Unique</p>
                <p className="text-base font-bold text-teal-700">{visitorStats?.currentMonth?.uniqueVisitors || 0}</p>
              </div>
              <div className="flex bg-white/70 rounded border border-teal-100 items-center justify-between px-2 py-1">
                <p className="text-[9px] uppercase tracking-wider text-cyan-500 font-semibold">Visits</p>
                <p className="text-base font-bold text-cyan-600">{visitorStats?.currentMonth?.totalVisits || 0}</p>
              </div>
              <div className="flex bg-white/70 rounded border border-teal-100 items-center justify-between px-2 py-1">
                <p className="text-[9px] uppercase tracking-wider text-blue-500 font-semibold">IPs</p>
                <p className="text-base font-bold text-blue-600">{visitorStats?.currentMonth?.uniqueIPs || 0}</p>
              </div>
            </div>
          </div>

          {/* Visitors - Previous Month - Compact Height */}
          <div className="col-span-1 lg:col-span-2 bg-gradient-to-br from-slate-50 to-gray-50 p-2 rounded-lg border border-slate-200 shadow-sm h-[160px] flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1 bg-slate-100 rounded-full">
                <Eye className="h-3.5 w-3.5 text-slate-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[11px] font-semibold text-slate-800 truncate">Visitors - Previous</h3>
                <p className="text-[8px] text-slate-600 truncate">
                  {visitorStats?.previousMonth?.month ? new Date(2000, visitorStats.previousMonth.month - 1).toLocaleString('default', { month: 'short' }) : '...'} {visitorStats?.previousMonth?.year || ''}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 justify-center">
              <div className="flex bg-white/70 rounded border border-slate-100 items-center justify-between px-2 py-1">
                <p className="text-[9px] uppercase tracking-wider text-slate-600 font-semibold">Unique</p>
                <p className="text-base font-bold text-slate-700">{visitorStats?.previousMonth?.uniqueVisitors || 0}</p>
              </div>
              <div className="flex bg-white/70 rounded border border-slate-100 items-center justify-between px-2 py-1">
                <p className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Visits</p>
                <p className="text-base font-bold text-gray-600">{visitorStats?.previousMonth?.totalVisits || 0}</p>
              </div>
              <div className="flex bg-white/70 rounded border border-slate-100 items-center justify-between px-2 py-1">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">IPs</p>
                <p className="text-base font-bold text-slate-600">{visitorStats?.previousMonth?.uniqueIPs || 0}</p>
              </div>
            </div>
          </div>

          {/* Support Tickets + Pending Actions - Compact Height */}
          <div className="col-span-1 lg:col-span-2 bg-white p-2 rounded-lg border shadow-sm h-[160px] flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-[11px] font-semibold text-gray-700">Tickets/Actions</h3>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/tickets")} className="text-[9px] h-4 px-1">
                View
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-1 flex-1 content-center">
              <div className="text-center py-1 bg-blue-50 rounded border border-blue-100">
                <p className="text-lg font-bold text-blue-700 leading-none">{ticketStats.open}</p>
                <p className="text-[7px] uppercase text-blue-600 font-medium">Open</p>
              </div>
              <div className="text-center py-1 bg-green-50 rounded border border-green-100">
                <p className="text-lg font-bold text-green-700 leading-none">{ticketStats.resolved}</p>
                <p className="text-[7px] uppercase text-green-600 font-medium">Done</p>
              </div>
              <div className="text-center py-1 bg-orange-50 rounded border border-orange-100 col-span-2">
                <p className="text-lg font-bold text-orange-700 leading-none">{stats.requests.cancellation + stats.requests.recall}</p>
                <p className="text-[7px] uppercase text-orange-600 font-medium">Pending Requests</p>
              </div>
              <div className="hidden">
                <p>{stats.requests.cancellation}</p>
                <p>{stats.requests.recall}</p>
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
              <SelectItem value="not_received">Not Processed</SelectItem>
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
                <TableHead>Department Name</TableHead>
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
              {filteredAndSortedReports.map((report) => {
                // Find department to get employeeCount (works for both regular and virtual reports)
                const dept = departments.find(d => d.id === report.departmentId);
                const employeeCount = dept?.employeeCount || 0;

                return (
                  <TableRow key={report.id}>
                    <TableCell>{report.receiptNo || "-"}</TableCell>
                    <TableCell>{report.receiptDate ? formatDate(report.receiptDate) : "-"}</TableCell>
                    <TableCell>
                      {new Date(report.year, report.month - 1).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                        }
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{report.department?.name || dept?.name || "N/A"}</span>
                        <span className="text-xs text-muted-foreground">{employeeCount} Employees</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {report.status === "draft"
                        ? "*****"
                        : report.transactionId || "Not generated"}
                    </TableCell>
                    <TableCell>{report.despatchNo || "-"}</TableCell>
                    <TableCell>{report.despatchDate ? formatDate(report.despatchDate) : "-"}</TableCell>
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
                        {report.status === "not_received" ? "Not Processed" :
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
                        {/* Revert to Draft button (Recall or manual revert) - Manual revert Super Admin only, Recall approval all admins */}
                        {((report.status === "submitted" && isSuperAdmin) || report.status === "recall_requested") && (
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
                );
              })}
            </TableBody>
          </Table>
        </div >
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
      </div >
    </div >
  );
}