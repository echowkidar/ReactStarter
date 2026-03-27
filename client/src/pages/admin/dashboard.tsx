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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";
import { FileCheck, LogOut, Eye, Download, Search, Users, Loader2, CheckCircle, XCircle, Trash2, RotateCcw, FileImage, Ticket, Megaphone, ArrowRightLeft, Settings, Phone, AlertCircle } from "lucide-react";
import { AttendanceReport, Department } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Label, BarChart, Bar, Legend } from 'recharts';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

  const handleEmailResponse = (data: any) => {
    if (data?.emailStatus === 'failed') {
      if (data?.emailError === 'wrong_email') {
        toast({ variant: "destructive", title: "Email Not Sent", description: "Department has a wrong email ID configured. Notification not sent." });
      } else {
        toast({ variant: "destructive", title: "Email Warning", description: "Email not sent." });
      }
    } else if (data?.emailStatus === 'sent') {
      toast({ title: "Email Sent", description: "Notification email sent to department successfully." });
    }
  };

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
  const getDisplayName = (email: string, name: string) => {
    if (!email) return name || "Admin";

    if (email === "admin@amu.ac.in") {
      return "Super Administrator";
    } else if (email === "salary@amu.ac.in") {
      return "Salary Officer";
    } else {
      // If it's another email, show name if available, else first part of the email capitalized
      if (name && name !== "Admin") return name;
      return email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
    }
  };

  const adminInfo = JSON.parse(localStorage.getItem("admin") || "{}");
  const adminName = getDisplayName(adminInfo.email, adminInfo.name);
  const adminEmail = adminInfo.email || "";

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
    },
    refetchInterval: 120000,
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
    refetchInterval: 120000,
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
    refetchInterval: 120000,
  });

  // Fetch active users count (refresh every 10 seconds)
  const { data: activeUsersStats = { total: 0, departments: 0, admins: 0, users: [] } } = useQuery<{
    total: number;
    departments: number;
    admins: number;
    users: { type: string, name: string, lastSeen: string, loginTime: string }[];
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

  // Fetch department employee stats for current month
  interface DeptEmployeeStats {
    departmentId: number;
    totalActive: number;
    reported: number;
    missing: number;
    disabled: number;
  }
  const { data: deptStats = [] } = useQuery<DeptEmployeeStats[]>({
    queryKey: ["/api/admin/department-employee-stats", apiMonth, filterYear],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/department-employee-stats?month=${apiMonth}&year=${filterYear}`);
      return response.json();
    },
    refetchInterval: 120000,
  });

  // Fetch export status for current month to show popup if data is exported
  const { data: exportStatus } = useQuery<{ latestExportDate: string | null; exportedCount: number }>({
    queryKey: ["/api/admin/attendance/export-status", apiMonth, filterYear],
    queryFn: async () => {
      const url = `/api/admin/attendance/export-status?month=${apiMonth}&year=${filterYear}`;
      const response = await apiRequest("GET", url);
      return response.json();
    },
  });

  const [showExportPopup, setShowExportPopup] = useState(true); // initially true, auto-hides if no data

  // Calculate previous month/year for comparison
  const prevApiMonth = apiMonth === 1 ? 12 : apiMonth - 1;
  const prevFilterYear = apiMonth === 1 ? filterYear - 1 : filterYear;

  // Fetch previous month's department employee stats for comparison
  const { data: prevDeptStats = [] } = useQuery<DeptEmployeeStats[]>({
    queryKey: ["/api/admin/department-employee-stats", prevApiMonth, prevFilterYear],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/department-employee-stats?month=${prevApiMonth}&year=${prevFilterYear}`);
      return response.json();
    },
    refetchInterval: 120000,
  });

  // Sum reported employees from the previous month
  const prevMonthReported = useMemo(() => {
    return prevDeptStats.reduce((sum, s) => sum + (s.reported || 0), 0);
  }, [prevDeptStats]);

  // Get previous month name for display
  const prevMonthName = useMemo(() => {
    return new Date(prevFilterYear, prevApiMonth - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [prevApiMonth, prevFilterYear]);

  const deptStatsMap = useMemo(() => {
    const map = new Map<number, DeptEmployeeStats>();
    deptStats.forEach(s => map.set(s.departmentId, s));
    return map;
  }, [deptStats]);

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
  const [revertConfirmReport, setRevertConfirmReport] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Delete feature state
  const [reportToDelete, setReportToDelete] = useState<ReportWithDepartment | null>(null);
  const [deleteStage, setDeleteStage] = useState<1 | 2>(1);

  // Active Users Popup state
  const [activeUsersPopup, setActiveUsersPopup] = useState<{ open: boolean; type: 'department' | 'admin' }>({ open: false, type: 'department' });

  // Format active duration
  const formatActiveDuration = (lastSeen: string | Date, loginTime?: string | Date) => {
    const ls = new Date(loginTime || lastSeen).getTime();
    const now = new Date().getTime();
    const diffMs = now - ls;
    const diffMins = Math.floor(diffMs / 60000);

    // If somehow loginTime is in the future or very recent
    if (diffMins < 1) return "Just now";

    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      if (diffHours === 1) return "1h ago";
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "1d ago";
    return `${diffDays}d ago`;
  };

  // Department stats expand/popup state
  const [expandedDeptId, setExpandedDeptId] = useState<number | null>(null);
  const [employeePopup, setEmployeePopup] = useState<{
    open: boolean;
    departmentId: number;
    departmentName: string;
    category: string;
    categoryLabel: string;
  } | null>(null);
  const [popupSearch, setPopupSearch] = useState("");
  const [popupShowConfirmed, setPopupShowConfirmed] = useState(false);

  // localStorage for confirmed missing employees (shared with missing-employees page)
  const missingStorageKey = `missing_confirmed_${filterYear}_${apiMonth}`;
  const [missingConfirmedIds, setMissingConfirmedIds] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`missing_confirmed_${new Date().getFullYear()}_${new Date().getMonth() + 1}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const toggleMissingConfirm = (empId: number) => {
    setMissingConfirmedIds(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      localStorage.setItem(missingStorageKey, JSON.stringify([...next]));
      return next;
    });
  };

  // Lazy-fetch employee list for popup
  const { data: popupEmployees = [], isLoading: popupLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/department-employees", employeePopup?.departmentId, employeePopup?.category, apiMonth, filterYear],
    queryFn: async () => {
      if (!employeePopup) return [];
      const response = await apiRequest("GET",
        `/api/admin/department-employees?departmentId=${employeePopup.departmentId}&category=${employeePopup.category}&month=${apiMonth}&year=${filterYear}`);
      return response.json();
    },
    enabled: !!employeePopup?.open,
  });

  // Filter popup employees by search and confirmed status (for missing category)
  const filteredPopupEmployees = useMemo(() => {
    let result = popupEmployees;
    if (employeePopup?.category === 'missing' && !popupShowConfirmed) {
      result = result.filter((e: any) => !missingConfirmedIds.has(e.id));
    }
    if (popupSearch) {
      const s = popupSearch.toLowerCase();
      result = result.filter((e: any) =>
        e.name?.toLowerCase().includes(s) ||
        e.epid?.toLowerCase().includes(s) ||
        e.designation?.toLowerCase().includes(s) ||
        e.salary_register_no?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [popupEmployees, popupSearch, employeePopup?.category, missingConfirmedIds, popupShowConfirmed]);


  // Accept cancellation mutation
  const acceptCancellation = useMutation({
    mutationFn: async (reportId: number) => {
      const res = await apiRequest("POST", `/api/attendance/${reportId}/accept-cancel`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({
        title: "Cancellation Accepted",
        description: "Report cancelled successfully. Entries have been deleted.",
      });
      if (data) handleEmailResponse(data);
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
      const res = await apiRequest("POST", `/api/attendance/${id}/revert-to-draft`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({
        title: "Success",
        description: "Report reverted to draft successfully"
      });
      if (data) handleEmailResponse(data);
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

  // Calculate Dashboard Stats (Selected Month)
  const stats = useMemo(() => {
    const currentYear = filterYear;
    const currentMonth = apiMonth; // 1-indexed, matches selected filter

    // Create a map of dept stats for easy lookup FIRST
    const statsMap = new Map<number, DeptEmployeeStats>();
    deptStats.forEach(s => statsMap.set(s.departmentId, s));

    // Filter relevant departments based on ACTIVE employees
    // We use deptStats.totalActive as the source of truth because d.employeeCount includes disabled employees
    const relevantDepts = departments.filter(d => {
      const st = statsMap.get(d.id);
      // If we have stats, use the active count. If not, fallback to the static count (though stats should exist)
      return st ? st.totalActive > 0 : (Number(d.employeeCount) || 0) > 0;
    });
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
    // Intersection with RELEVANT departments
    const sentCount = relevantDepts.filter(d => sentDeptIds.has(d.id)).length;

    // Processed: Submitted or Draft, but NOT in Sent (Received) list
    const processedReports = currentReports.filter(r =>
      (r.status === 'submitted' || r.status === 'draft')
    );
    // Specifically split processed into Submitted and Draft for calculation logic
    const submittedReports = currentReports.filter(r => r.status === 'submitted');
    const draftReports = currentReports.filter(r => r.status === 'draft');

    const processedDeptIds = new Set(processedReports.map(r => r.departmentId));
    const submittedDeptIds = new Set(submittedReports.map(r => r.departmentId));
    const draftDeptIds = new Set(draftReports.map(r => r.departmentId));

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
      notProcessed: notProcessedCount,
    };

    const requests = {
      cancellation: currentReports.filter(r => r.status === 'cancel_requested').length,
      recall: currentReports.filter(r => r.status === 'recall_requested').length,
    };

    // Calculate Bar Chart Data
    let totalReceived = 0;
    let totalProcessed = 0;
    let totalMissing = 0;
    let totalEmployees = 0; // Will be sum of ACTIVE employees

    relevantDepts.forEach(dept => {
      const st = statsMap.get(dept.id);

      // Use active count for total employees
      const activeCount = st ? st.totalActive : (dept.employeeCount || 0);
      totalEmployees += activeCount;

      if (!st) {
        // Fallback if no stats
        totalMissing += activeCount;
        return;
      }

      const isSent = sentDeptIds.has(dept.id);
      const isSubmitted = submittedDeptIds.has(dept.id) && !isSent;
      const isDraft = draftDeptIds.has(dept.id) && !isSent;

      if (isSent) {
        // Sent: Received = reported, Missing = missing
        totalReceived += st.reported;
        totalMissing += st.missing;
      } else if (isSubmitted) {
        // Submitted (Processed): Processed = reported, Missing = missing
        totalProcessed += st.reported;
        totalMissing += st.missing;
      } else if (isDraft) {
        // Draft (Processed): Treat ALL active employees as processed
        totalProcessed += st.totalActive;
        // Missing stays 0 for this dept
      } else {
        // Not Processed / Cancelled (Not Processed)
        // Entire department is missing
        totalMissing += st.totalActive;
      }
    });

    const barData = [
      { name: 'Received', value: totalReceived, color: '#16a34a' },
      { name: 'Processed', value: totalProcessed, color: '#d97706' },
      { name: 'Missing', value: totalMissing, color: '#ef4444' }
    ];

    return { totalRelevant, totalEmployees, sentCount, processedCount, notProcessedCount, breakdown, requests, barData };
  }, [departments, reports, deptStats, apiMonth, filterYear]);

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
    localStorage.removeItem("admin");
    localStorage.removeItem("adminType");
    localStorage.removeItem("adminEmail");
    localStorage.removeItem("adminUsername");
    localStorage.removeItem("adminSessionToken");
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
            {/* Global Attendance Indicator */}
            <div
              className={`w-3 h-3 rounded-full mr-2 shadow-sm border border-white ring-1 ring-gray-100 ${isAllEnabled ? 'bg-green-500' : 'bg-red-500'}`}
              title={isAllEnabled ? "Attendance Enabled for All Departments" : "Attendance Restrictions Active"}
            />
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden md:inline">Download Excel</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadExcel}>
                  📋 Attendance Reports
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  try {
                    const response = await apiRequest('GET', `/api/admin/all-missing-employees?month=${apiMonth}&year=${filterYear}`);
                    const employees = await response.json();
                    if (!employees || employees.length === 0) {
                      toast({ title: 'No data', description: 'No missing employees found for current month', variant: 'destructive' });
                      return;
                    }
                    const headers = ['Department', 'EPID', 'Name', 'Designation', 'Status', 'Term Expiry', 'Salary Asst.', 'Reg. No.'];
                    const rows = employees.map((emp: any) => [
                      emp.department_name || '',
                      emp.epid || '',
                      emp.name || '',
                      emp.designation || '',
                      emp.employment_status || '',
                      emp.term_expiry || '',
                      emp.salary_asstt || '',
                      emp.salary_register_no || ''
                    ]);
                    const csvContent = [
                      headers.join(','),
                      ...rows.map((row: string[]) => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                    ].join('\n');
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.setAttribute('href', url);
                    const monthName = new Date(filterYear, filterMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    link.setAttribute('download', `Missing_Employees_${monthName}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    toast({ title: 'Downloaded', description: `Exported ${employees.length} missing employees to CSV` });
                  } catch (error) {
                    console.error('Error downloading missing employees:', error);
                    toast({ title: 'Error', description: 'Failed to download missing employees', variant: 'destructive' });
                  }
                }}>
                  ⚠️ Missing Employees ({new Date(filterYear, filterMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/admin/documents")}
              className="flex items-center gap-1"
            >
              <FileImage className="h-4 w-4" />
              <span className="hidden md:inline">Documents</span>
            </Button>
            {(() => {
              const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
              if (adminData.userCode === 'VEW') return null;
              return (
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
              );
            })()}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                if (adminData.userCode === 'VEW') {
                  toast({
                    variant: "destructive",
                    title: "Access Denied",
                    description: "You do not have permission to manage notices.",
                  });
                  return;
                }
                setLocation("/admin/notices");
              }}
              className={`flex items-center gap-1 ${JSON.parse(localStorage.getItem("admin") || "{}").userCode === 'VEW'
                ? 'bg-blue-400 hover:bg-blue-400 cursor-not-allowed opacity-80'
                : 'bg-blue-600 hover:bg-blue-700'
                }`}
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
            {canManageEmployees && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/admin/department-contacts")}
                className="flex items-center gap-1"
              >
                <Phone className="h-4 w-4" />
                <span className="hidden lg:inline">Contacts</span>
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
        {/* Dashboard Stats - 3x1 Grid Layout (Modified) */}
        {/* Row 1: Attendance Report Status + Status Breakdown + Transfer Requests */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-3 mb-4">
          <div className="lg:col-span-6 bg-white rounded-lg border shadow-sm flex overflow-hidden">
            {/* Departments Partition */}
            <div className="flex-1 flex border-r border-gray-100">
              {/* Vertical Label Strip */}
              <div className="w-10 bg-gray-100 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-gray-400 uppercase rotate-180 text-center leading-tight tracking-wide" style={{ writingMode: 'vertical-lr' }}>
                  DEPARTMENTS<br />STATUS
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 flex items-center justify-center px-2 py-2 gap-6">
                {/* Vertical Stats */}
                <div className="flex flex-col gap-2 items-center min-w-[70px]">
                  <div className="text-center leading-tight">
                    <div className="text-4xl font-extrabold text-green-600 leading-none">{stats.sentCount}</div>
                    <div className="text-xs text-gray-500 font-semibold mt-1">Received</div>
                  </div>
                  <div className="text-center leading-tight">
                    <div className="text-4xl font-extrabold text-amber-600 leading-none">{stats.processedCount}</div>
                    <div className="text-xs text-gray-500 font-semibold mt-1">Processed</div>
                  </div>
                  <div className="text-center leading-tight">
                    <div className="text-4xl font-extrabold text-red-500 leading-none">{stats.notProcessedCount}</div>
                    <div className="text-xs text-gray-500 font-semibold mt-1">Missing</div>
                  </div>
                </div>

                {/* Donut Chart */}
                <div className="h-[160px] w-[160px] relative">
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
                        innerRadius={55}
                        outerRadius={75}
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
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-4xl font-extrabold text-gray-900 leading-none">
                        {stats.sentCount + stats.processedCount}
                      </span>
                      <span className="text-base text-gray-500 font-semibold leading-none mt-1">
                        / {stats.totalRelevant}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Employees Partition */}
            <div className="flex-1 flex flex-col bg-slate-50">
              {/* Top: Horizontal Stacked Progress Bar */}
              <div className="flex items-center px-2 pt-2">
                <div className="w-10 shrink-0"></div>
                <div className="flex-1">
                  <div className="flex w-full h-5 rounded-full overflow-hidden shadow-inner bg-gray-200" title={`Received: ${stats.barData[0]?.value || 0} | Processed: ${stats.barData[1]?.value || 0} | Missing: ${stats.barData[2]?.value || 0} | ${prevMonthName}: ${prevMonthReported}`}>
                    {(() => {
                      const received = stats.barData[0]?.value || 0;
                      const processed = stats.barData[1]?.value || 0;
                      const missing = stats.barData[2]?.value || 0;
                      const total = stats.totalEmployees || 1;
                      const prevPct = (prevMonthReported / (total > prevMonthReported ? total : prevMonthReported + 1)) * 100;
                      const recPct = (received / total) * 100;
                      const procPct = (processed / total) * 100;
                      const missPct = (missing / total) * 100;
                      return (
                        <>
                          {received > 0 && (
                            <div className="flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${Math.max(recPct, 3)}%`, backgroundColor: '#16a34a' }} title={`Received: ${received}`}>
                              {received}
                            </div>
                          )}
                          {processed > 0 && (
                            <div className="flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${Math.max(procPct, 3)}%`, backgroundColor: '#d97706' }} title={`Processed: ${processed}`}>
                              {processed}
                            </div>
                          )}
                          {missing > 0 && (
                            <div className="flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${Math.max(missPct, 4)}%`, backgroundColor: '#ef4444' }} title={`Missing: ${missing}`}>
                              {missing}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {/* Previous month bar below */}
                  <div className="flex w-full h-4 rounded-full overflow-hidden shadow-inner bg-gray-200 mt-1" title={`${prevMonthName}: ${prevMonthReported} reported`}>
                    {prevMonthReported > 0 && (
                      <div className="flex items-center justify-center text-[8px] font-bold text-white" style={{ width: `${Math.max((prevMonthReported / (stats.totalEmployees || 1)) * 100, 4)}%`, backgroundColor: '#3b82f6' }} title={`${prevMonthName}: ${prevMonthReported}`}>
                        {prevMonthReported} ({prevMonthName})
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom: Bar Chart + Total */}
              <div className="flex-1 flex items-center min-h-[130px]">
                {/* Vertical Label Strip */}
                <div className="w-10 bg-gray-100 flex items-center justify-center shrink-0 self-stretch">
                  <span className="text-[8px] font-bold text-gray-400 uppercase rotate-180 text-center leading-tight tracking-tight" style={{ writingMode: 'vertical-lr' }}>
                    EMPLOYEES' ATTENDANCE<br />REPORTS STATUS
                  </span>
                </div>

                <div className="flex-1 flex items-center p-2">
                  <div className="flex-1" style={{ height: '110px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...stats.barData, { name: prevMonthName, value: prevMonthReported, color: '#3b82f6' }]} barSize={24} barCategoryGap="5%">
                        <XAxis dataKey="name" fontSize={9} tickLine={false} axisLine={false} interval={0} dy={5} />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                          cursor={{ fill: 'transparent' }}
                        />
                        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                          {
                            [...stats.barData, { name: prevMonthName, value: prevMonthReported, color: '#3b82f6' }].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))
                          }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex flex-col justify-center items-center w-20 border-l border-gray-100 ml-2 h-4/5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Total</span>
                    <span className="text-xl font-bold text-gray-700">{stats.totalEmployees}</span>
                    <div className="text-[8px] text-gray-400 text-center mt-1 leading-tight">Active<br />Staff</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-3 rounded-lg border shadow-sm flex flex-col justify-center">
            <h3 className="text-sm font-medium text-gray-500 mb-1.5">Status Breakdown</h3>
            <div className="grid grid-cols-1 gap-1">
              <div onClick={() => setStatusFilter(prev => prev === 'submitted' ? 'all' : 'submitted')} className={`px-2 py-0.5 bg-blue-50 rounded border border-blue-100 flex items-center justify-between cursor-pointer hover:bg-blue-100 transition-colors ${statusFilter === 'submitted' ? 'ring-2 ring-blue-400' : ''}`}>
                <span className="text-[9px] uppercase tracking-wider text-blue-600 font-semibold">Submitted</span>
                <span className="text-base font-bold text-blue-700">{stats.breakdown.submitted}</span>
              </div>
              <div onClick={() => setStatusFilter(prev => prev === 'draft' ? 'all' : 'draft')} className={`px-2 py-0.5 bg-yellow-50 rounded border border-yellow-100 flex items-center justify-between cursor-pointer hover:bg-yellow-100 transition-colors ${statusFilter === 'draft' ? 'ring-2 ring-yellow-400' : ''}`}>
                <span className="text-[9px] uppercase tracking-wider text-yellow-600 font-semibold">Draft</span>
                <span className="text-base font-bold text-yellow-700">{stats.breakdown.draft}</span>
              </div>
              <div onClick={() => setStatusFilter(prev => prev === 'cancelled' ? 'all' : 'cancelled')} className={`px-2 py-0.5 bg-red-50 rounded border border-red-100 flex items-center justify-between cursor-pointer hover:bg-red-100 transition-colors ${statusFilter === 'cancelled' ? 'ring-2 ring-red-400' : ''}`}>
                <span className="text-[9px] uppercase tracking-wider text-red-600 font-semibold">Cancelled</span>
                <span className="text-base font-bold text-red-700">{stats.breakdown.cancelled}</span>
              </div>
              <div onClick={() => setStatusFilter(prev => prev === 'not_received' ? 'all' : 'not_received')} className={`px-2 py-0.5 bg-gray-50 rounded border border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors ${statusFilter === 'not_received' ? 'ring-2 ring-gray-400' : ''}`}>
                <span className="text-[9px] uppercase tracking-wider text-gray-600 font-semibold">Not Processed</span>
                <span className="text-base font-bold text-gray-700">{stats.breakdown.notProcessed}</span>
              </div>
            </div>
          </div>

          {/* Transfer Requests Card */}
          <div className="lg:col-span-2 bg-white p-3 rounded-lg border shadow-sm border-l-4 border-l-orange-500 flex flex-col justify-center">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-sm font-medium text-gray-500">Transfer Requests</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/transfer-requests")} className="h-5 w-5 p-0 rounded-full">
                <ArrowRightLeft className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="px-3 py-1.5 bg-orange-50 rounded border border-orange-100 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wider text-orange-600 font-semibold">Transfers</span>
                <span className="text-lg font-bold text-orange-700">{transferStats.pendingTransfer}</span>
              </div>
              <div className="px-3 py-1.5 bg-indigo-50 rounded border border-indigo-100 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wider text-indigo-600 font-semibold">Releases</span>
                <span className="text-lg font-bold text-indigo-700">{transferStats.pendingRelease}</span>
              </div>
              <div className="px-3 py-1.5 bg-green-50 rounded border border-green-100 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wider text-green-600 font-semibold">Done</span>
                <span className="text-lg font-bold text-green-700">{transferStats.resolved}</span>
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
                  <div
                    className="text-center py-1 px-0.5 bg-white/70 rounded border border-purple-100 cursor-pointer hover:bg-purple-50 transition-colors"
                    onClick={() => setActiveUsersPopup({ open: true, type: 'department' })}
                  >
                    <p className="text-sm font-bold text-blue-600 leading-none">{activeUsersStats.departments}</p>
                    <p className="text-[7px] uppercase tracking-wider text-blue-500 font-semibold">Depts</p>
                  </div>
                  <div
                    className="text-center py-1 px-0.5 bg-white/70 rounded border border-purple-100 cursor-pointer hover:bg-purple-50 transition-colors"
                    onClick={() => setActiveUsersPopup({ open: true, type: 'admin' })}
                  >
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
              {(() => {
                const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                if (adminData.userCode === 'VEW') return null;
                return (
                  <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/tickets")} className="text-[9px] h-4 px-1">
                    View
                  </Button>
                );
              })()}
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
                {(() => {
                  const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                  const isSuperOrAll = adminData.role === 'superadmin' || (adminData.role === 'salary' && adminData.userCode === 'ALL');
                  const isDealingAssistant = adminData.role === 'salary' && adminData.userCode !== 'ALL' && adminData.userCode !== 'VEW';

                  if (!isSuperOrAll && !isDealingAssistant) return (
                    <>
                      <p className="text-lg font-bold text-gray-400 leading-none">-</p>
                      <p className="text-[7px] uppercase text-gray-400 font-medium">Pending Requests</p>
                    </>
                  );

                  // Calculate pending requests meant for this user
                  let pendingCount = 0;
                  if (isSuperOrAll) {
                    pendingCount = stats.requests.cancellation + stats.requests.recall;
                  } else if (isDealingAssistant) {
                    // Count only requests from departments assigned to this dealing assistant
                    pendingCount = reports?.filter(r =>
                      (r.status === 'cancel_requested' || r.status === 'recall_requested') &&
                      (r.department as any)?.dealingAssistantCode === adminData.userCode
                    ).length || 0;
                  }

                  return (
                    <>
                      <p className="text-lg font-bold text-orange-700 leading-none">{pendingCount}</p>
                      <p className="text-[7px] uppercase text-orange-600 font-medium">Pending Requests</p>
                    </>
                  );
                })()}
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
                      {(() => {
                        const deptName = report.department?.name || dept?.name || "N/A";
                        const deptId = report.departmentId;
                        const st = deptStatsMap.get(deptId);
                        const isExpanded = expandedDeptId === report.id;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{deptName}</span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className="text-xs font-semibold text-green-600 cursor-pointer hover:underline"
                                title={`Employees in this report (${(report as any).employeeCount ?? 0}). Click to view all ${st?.reported ?? 0} reported for the month.`}
                                onClick={() => setEmployeePopup({
                                  open: true,
                                  departmentId: deptId,
                                  departmentName: deptName,
                                  category: 'reported',
                                  categoryLabel: 'Attendance Reported (Month)'
                                })}
                              >
                                {(report as any).employeeCount ?? st?.reported ?? '—'} Reported
                              </span>
                              <button
                                className="text-xs text-muted-foreground hover:text-foreground transition-transform"
                                style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                                onClick={() => setExpandedDeptId(isExpanded ? null : report.id)}
                                title="Show more stats"
                              >
                                ▶
                              </button>
                            </div>
                            {isExpanded && st && (
                              <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 animate-in slide-in-from-top-1 duration-200">
                                <span
                                  className="text-[11px] text-blue-600 cursor-pointer hover:underline"
                                  onClick={() => setEmployeePopup({
                                    open: true,
                                    departmentId: deptId,
                                    departmentName: deptName,
                                    category: 'active',
                                    categoryLabel: 'Active Employees'
                                  })}
                                >
                                  🟢 {st.totalActive} Active
                                </span>
                                <span
                                  className="text-[11px] text-orange-600 cursor-pointer hover:underline"
                                  onClick={() => setEmployeePopup({
                                    open: true,
                                    departmentId: deptId,
                                    departmentName: deptName,
                                    category: 'missing',
                                    categoryLabel: 'Missing Attendance'
                                  })}
                                >
                                  ⚠️ {st.missing} Missing
                                </span>
                                <span
                                  className="text-[11px] text-red-600 cursor-pointer hover:underline"
                                  onClick={() => setEmployeePopup({
                                    open: true,
                                    departmentId: deptId,
                                    departmentName: deptName,
                                    category: 'disabled',
                                    categoryLabel: 'Disabled Employees'
                                  })}
                                >
                                  🔴 {st.disabled} Disabled
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
                              const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                              if (adminData.userCode === 'VEW') {
                                toast({
                                  variant: "destructive",
                                  title: "Access Denied",
                                  description: "You do not have permission to view documents."
                                });
                                return;
                              }
                              setSelectedReport(report.id);
                              setShowPdfPreview(true);
                            }}
                            className={`flex items-center gap-2 ${JSON.parse(localStorage.getItem("admin") || "{}").userCode === 'VEW'
                              ? 'cursor-not-allowed opacity-50'
                              : ''
                              }`}
                          >
                            <Download className="h-4 w-4" />
                            View PDF
                          </Button>
                        )}
                        {/* View Details button - hidden for cancelled or not_received reports */}
                        {report.status !== "cancelled" && report.status !== "not_received" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                              const isSuperOrAll = adminData.role === 'superadmin' || (adminData.role === 'salary' && adminData.userCode === 'ALL');
                              const isVEW = adminData.userCode === 'VEW';
                              const isAssignedToMe = adminData.role === 'salary' && (report.department as any)?.dealingAssistantCode === adminData.userCode;

                              if (isVEW) {
                                toast({
                                  variant: "destructive",
                                  title: "Access Denied",
                                  description: "You do not have permission to view report details."
                                });
                                return;
                              }

                              if (isSuperOrAll || isAssignedToMe) {
                                setLocation(`/admin/reports/${report.id}`);
                              } else {
                                toast({
                                  variant: "destructive",
                                  title: "Access Denied",
                                  description: "You are not assigned to this department's reports."
                                });
                              }
                            }}
                            className="flex items-center gap-2"
                          >
                            <Eye className="h-4 w-4" />
                            View Details
                          </Button>
                        )}
                        {/* Accept Cancellation button for cancel_requested status */}
                        {(() => {
                          const adminData = JSON.parse(localStorage.getItem("admin") || "{}");

                          // Check if department is assigned to this specific dealing assistant
                          const isAssignedToMe = adminData.role === 'salary' &&
                            (report.department as any)?.dealingAssistantCode === adminData.userCode;

                          // 'ALL' user code is equivalent to super_admin for these tasks
                          const canManageRequests = adminData.role === 'superadmin' ||
                            (adminData.role === 'salary' && adminData.userCode === 'ALL') ||
                            isAssignedToMe;

                          if (!canManageRequests) return null;

                          return (
                            <>
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
                                  className={report.status === "recall_requested"
                                    ? "text-yellow-600 border-yellow-300 hover:bg-yellow-50"
                                    : "text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"}
                                  onClick={() => setRevertConfirmReport(report.id)}
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
                            </>
                          );
                        })()}

                        {/* Status indicator for cancelled reports */}
                        {report.status === "cancelled" && (
                          <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" />
                            Cancelled
                          </span>
                        )}

                      </div>
                      {/* Delete Action - restricted to super admin and only for processed reports */}
                      {adminType === "super" && report.status !== "not_received" && (
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

        {/* Revert to Draft / Approve Recall Confirmation Dialog */}
        <AlertDialog open={revertConfirmReport !== null} onOpenChange={(open) => !open && setRevertConfirmReport(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will revert the attendance report back to <strong>Draft</strong> status.
                The department will need to finalize and submit it again.
                This action is usually only needed if there was an error in the original submission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => {
                  if (revertConfirmReport) {
                    revertToDraft.mutate(revertConfirmReport);
                    setRevertConfirmReport(null);
                  }
                }}
              >
                Confirm Revert
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
        {/* Employee List Popup */}
        <Dialog open={!!employeePopup?.open} onOpenChange={(open) => { if (!open) { setEmployeePopup(null); setPopupSearch(''); setPopupShowConfirmed(false); } }}>
          <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">
                {employeePopup?.departmentName}
              </DialogTitle>
              <DialogDescription>
                {employeePopup?.categoryLabel} — {new Date(filterYear, filterMonth).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
              </DialogDescription>
            </DialogHeader>
            {popupLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : popupEmployees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No employees found in this category.</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3 flex-1">
                    <Input
                      placeholder="Search name, EPID, designation..."
                      value={popupSearch}
                      onChange={(e) => setPopupSearch(e.target.value)}
                      className="max-w-[250px] h-8 text-sm"
                    />
                    {employeePopup?.category === 'missing' && (
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id="popupShowConfirmed"
                          checked={popupShowConfirmed}
                          onCheckedChange={(c) => setPopupShowConfirmed(c === true)}
                        />
                        <label htmlFor="popupShowConfirmed" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                          Show confirmed ({missingConfirmedIds.size})
                        </label>
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground whitespace-nowrap">{filteredPopupEmployees.length} employee(s)</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={() => {
                      const isReported = employeePopup?.category === 'reported';
                      const headers = ['EPID', 'Name', 'Designation', 'Status', 'Term Expiry', 'Salary Asst.', 'Reg. No.'];
                      if (isReported) headers.push('Days');

                      const rows = filteredPopupEmployees.map((emp: any) => {
                        const row = [
                          emp.epid || '',
                          emp.name || '',
                          emp.designation || '',
                          emp.employment_status || '',
                          emp.term_expiry || '',
                          emp.salary_asstt || '',
                          emp.salary_register_no || ''
                        ];
                        if (isReported) row.push(String(emp.days_count || 0));
                        return row;
                      });

                      const csvContent = [
                        headers.join(','),
                        ...rows.map((row: string[]) => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                      ].join('\n');

                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.setAttribute('href', url);
                      link.setAttribute('download', `${employeePopup?.departmentName}_${employeePopup?.category}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);

                      toast({ title: 'Downloaded', description: `Exported ${filteredPopupEmployees.length} employees to CSV` });
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {employeePopup?.category === 'missing' && <TableHead className="w-[40px]"></TableHead>}
                        <TableHead className="w-[70px]">EPID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Term Expiry</TableHead>
                        <TableHead>Salary Asst.</TableHead>
                        <TableHead>Reg. No.</TableHead>
                        {employeePopup?.category === 'reported' && <TableHead className="w-[60px]">Days</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPopupEmployees.map((emp: any) => {
                        const isConfirmed = missingConfirmedIds.has(emp.id);
                        return (
                          <TableRow key={emp.id} className={employeePopup?.category === 'missing' && isConfirmed ? 'opacity-50 bg-muted/30' : ''}>
                            {employeePopup?.category === 'missing' && (
                              <TableCell>
                                <Checkbox
                                  checked={isConfirmed}
                                  onCheckedChange={() => toggleMissingConfirm(emp.id)}
                                  title={isConfirmed ? 'Unmark' : 'Confirm — hide from list'}
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-mono text-sm">{emp.epid || '—'}</TableCell>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell className="text-sm">{emp.designation || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={emp.employment_status === 'Permanent' ? 'default' : 'secondary'} className="text-xs">
                                {emp.employment_status || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{emp.term_expiry || '—'}</TableCell>
                            <TableCell className="text-sm">{emp.salary_asstt || '—'}</TableCell>
                            <TableCell className="text-sm">{emp.salary_register_no || '—'}</TableCell>
                            {employeePopup?.category === 'reported' && (
                              <TableCell className="text-sm font-semibold text-center">{emp.days_count || 0}</TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Active Users Dialog */}
        <Dialog open={activeUsersPopup.open} onOpenChange={(open) => setActiveUsersPopup(prev => ({ ...prev, open }))}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Active {activeUsersPopup.type === 'department' ? 'Departments' : 'Admins'}
              </DialogTitle>
              <DialogDescription>
                Live list of currently active {activeUsersPopup.type === 'department' ? 'departments' : 'admin users'}.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              {activeUsersStats.users?.filter(u => u.type === activeUsersPopup.type).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active {activeUsersPopup.type === 'department' ? 'departments' : 'admins'} found.
                </div>
              ) : (
                activeUsersStats.users?.filter(u => u.type === activeUsersPopup.type).map((user, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 border rounded-md hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${activeUsersPopup.type === 'department' ? 'bg-blue-100' : 'bg-indigo-100'}`}>
                        <Users className={`h-4 w-4 ${activeUsersPopup.type === 'department' ? 'text-blue-600' : 'text-indigo-600'}`} />
                      </div>
                      <span className="font-medium">{user.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatActiveDuration(user.lastSeen, user.loginTime)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Oracle Export Notification Popup */}
        <Dialog open={showExportPopup && !!exportStatus?.latestExportDate} onOpenChange={setShowExportPopup}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <AlertCircle className="h-5 w-5" />
                Oracle Export Notification
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700">
                Attendance data for this month has been exported for Oracle on :
              </p>
              <p className="text-xl font-semibold text-green-600 mt-2 text-center bg-green-50 p-3 rounded-lg border border-green-100">
                {exportStatus?.latestExportDate ? (() => {
                  const d = new Date(exportStatus.latestExportDate);
                  const dateStr = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
                  let hours = d.getHours();
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  hours = hours % 12;
                  hours = hours ? hours : 12; // the hour '0' should be '12'
                  const minutes = d.getMinutes().toString().padStart(2, '0');
                  const timeStr = `${hours}:${minutes} ${ampm}`;
                  return `${dateStr} at ${timeStr}`;
                })() : ""}
              </p>
              <p className="text-sm text-gray-500 mt-4 text-center">
                Total {exportStatus?.exportedCount} records have been exported.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowExportPopup(false)} className="w-full bg-green-600 hover:bg-green-700">
                OK, Got it
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div >
    </div >
  );
}