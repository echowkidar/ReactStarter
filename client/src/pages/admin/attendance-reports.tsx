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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import Loading from "@/components/layout/loading";
import AdminHeader from "@/components/layout/admin-header";
import { LogOut, Users, Eye, Edit, Search, ArrowLeft, FileDown, ChevronLeft, ChevronRight, Loader2, XCircle, CheckCircle, FileText, Check, Pin, ChevronDown, Filter, CalendarIcon, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ArrowUpDown } from "lucide-react";
import * as XLSX from "xlsx";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import salaryAssistants from "@/lib/salary-assistants.json";

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
  adminNoting?: string;
  admin_noting?: string;
  exported_to_oracle_at?: string;
  exportedToOracleAt?: string;
  employee?: {
    id: number;
    departmentId: number;
    name: string;
    employeeId?: string;
    epid?: string;
    designation: string;
    salaryRegisterNo: string;
    salary_asstt?: string;
    remarks?: string;
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

// NotingCell component for inline noting with auto-save and permanent remarks dialog
function NotingCell({
  entryId,
  employeeDbId,
  adminNoting,
  employeeRemarks,
  monthFilter,
  toast,
}: {
  entryId: number;
  employeeDbId: number;
  adminNoting: string;
  employeeRemarks: string;
  monthFilter: string[];
  toast: any;
}) {
  const [notingValue, setNotingValue] = useState(adminNoting);
  const [permRemarks, setPermRemarks] = useState(employeeRemarks);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permDialogValue, setPermDialogValue] = useState(employeeRemarks);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPerm, setIsSavingPerm] = useState(false);
  const lastSavedRef = useRef(adminNoting);
  const lastSavedPermRef = useRef(employeeRemarks);

  // Sync with prop changes (e.g. after refetch)
  useEffect(() => {
    setNotingValue(adminNoting);
    lastSavedRef.current = adminNoting;
  }, [adminNoting]);

  useEffect(() => {
    setPermRemarks(employeeRemarks);
    setPermDialogValue(employeeRemarks);
    lastSavedPermRef.current = employeeRemarks;
  }, [employeeRemarks]);

  // Auto-save monthly noting on blur
  const handleNotingBlur = useCallback(async () => {
    const trimmed = notingValue.trim();
    if (trimmed === lastSavedRef.current) return; // No change
    setIsSaving(true);
    try {
      await apiRequest('PATCH', `/api/attendance/entries/${entryId}/noting`, { noting: trimmed || null });
      lastSavedRef.current = trimmed;
      // Silently update cache without full refetch
      queryClient.setQueryData(["/api/admin/attendance", monthFilter], (old: any) => {
        if (!old) return old;
        return old.map((report: any) => ({
          ...report,
          entries: report.entries?.map((entry: any) =>
            entry.id === entryId ? { ...entry, admin_noting: trimmed || null } : entry
          ),
        }));
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save noting",
      });
      // Revert on error
      setNotingValue(lastSavedRef.current);
    } finally {
      setIsSaving(false);
    }
  }, [notingValue, entryId, monthFilter, toast]);

  // Save permanent remarks on dialog save
  const handlePermSave = useCallback(async () => {
    const trimmed = permDialogValue.trim();
    if (trimmed === lastSavedPermRef.current) {
      setPermDialogOpen(false);
      return;
    }
    setIsSavingPerm(true);
    try {
      await apiRequest('PATCH', `/api/employees/${employeeDbId}/remarks`, { remarks: trimmed || null });
      lastSavedPermRef.current = trimmed;
      setPermRemarks(trimmed);
      // Update employee remarks in cache
      queryClient.setQueryData(["/api/admin/attendance", monthFilter], (old: any) => {
        if (!old) return old;
        return old.map((report: any) => ({
          ...report,
          entries: report.entries?.map((entry: any) =>
            entry.employee?.id === employeeDbId
              ? { ...entry, employee: { ...entry.employee, remarks: trimmed || null } }
              : entry
          ),
        }));
      });
      toast({
        title: "Saved",
        description: "Permanent remark updated",
      });
      setPermDialogOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update permanent remark",
      });
    } finally {
      setIsSavingPerm(false);
    }
  }, [permDialogValue, employeeDbId, monthFilter, toast]);

  const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
  const isViewOnly = adminData.userCode === 'VEW';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={notingValue}
          onChange={(e) => setNotingValue(e.target.value)}
          onBlur={handleNotingBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={isViewOnly}
          placeholder="Add note..."
          className={`w-full text-xs px-1.5 py-1 border rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 ${isSaving ? 'opacity-50' : ''
            } ${isViewOnly ? 'cursor-not-allowed opacity-50 bg-gray-50' : ''}`}
          title={isViewOnly ? 'View Only' : 'Type and click away to auto-save'}
        />
        <button
          type="button"
          onClick={() => {
            if (isViewOnly) {
              toast({
                variant: "destructive",
                title: "Access Denied",
                description: "You do not have permission to edit remarks."
              });
              return;
            }
            setPermDialogValue(permRemarks);
            setPermDialogOpen(true);
          }}
          className={`flex-shrink-0 p-1 rounded hover:bg-orange-50 transition-colors ${permRemarks ? 'text-orange-600' : 'text-gray-400 hover:text-orange-500'
            } ${isViewOnly ? 'cursor-not-allowed opacity-50' : ''}`}
          title={permRemarks ? `Permanent: ${permRemarks}` : 'Add permanent remark'}
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      </div>
      {permRemarks && (
        <p className="text-[10px] text-muted-foreground/60 leading-tight truncate max-w-[160px]" title={permRemarks}>
          📌 {permRemarks}
        </p>
      )}

      {/* Permanent Remarks Dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">Permanent Remark</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              This remark will appear on every future month's report for this employee.
              It is also visible in the Edit Employee form.
            </p>
            <textarea
              value={permDialogValue}
              onChange={(e) => setPermDialogValue(e.target.value)}
              rows={3}
              className="w-full text-sm px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none"
              placeholder="Enter permanent remark..."
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handlePermSave}
              disabled={isSavingPerm}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isSavingPerm ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Permanent'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AttendanceReports() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
  const [designationFilter, setDesignationFilter] = useState<string[]>([]);
  const [analysisFilter, setAnalysisFilter] = useState<string[]>([]);
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");
  const [exportFilter, setExportFilter] = useState<"all" | "exported" | "not_exported">("all");
  const [skipExported, setSkipExported] = useState(true); // default: checked — skip already-exported rows on export
  const [isSalaryAdmin, setIsSalaryAdmin] = useState(false);

  // Permission checks for Export button and date editing
  const adminData = useMemo(() => JSON.parse(localStorage.getItem("admin") || "{}"), []);
  const adminEmail = localStorage.getItem("adminEmail") || adminData.email || "";
  const isSuperAdmin = adminData.role === "super" || adminEmail === "admin@amu.ac.in";
  const canExport = isSuperAdmin || adminEmail === "salary@amu.ac.in" || adminEmail === "nasir@amu.ac.in";
  // Nasir (Salary Admin) ke liye Skip Exported checkbox aur Month dropdown non-editable
  const isNasirAdmin = adminEmail === "nasir@amu.ac.in";

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
    const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
    const userCode = adminData.userCode;

    if (adminType === "salary") {
      if (userCode && userCode !== "ALL" && userCode !== "VEW") {
        setIsSalaryAdmin(true);
        setSalaryAssistantFilter([userCode]);
      } else {
        // If userCode is ALL or VEW, treat as super admin for filtering purposes (don't restrict)
        setIsSalaryAdmin(false);
      }
    }
  }, []);

  // Parse current month/year from monthFilter for export-status API
  const { apiMonth, filterYear } = useMemo(() => {
    const selectedMonth = Array.isArray(monthFilter) && monthFilter.length > 0 ? monthFilter[0] : null;
    if (selectedMonth) {
      const [monthName, yearStr] = selectedMonth.split(' ');
      if (monthName && yearStr) {
        const monthDate = new Date(`${monthName} 1, 2000`);
        return { apiMonth: (monthDate.getMonth() + 1).toString(), filterYear: yearStr };
      }
    }
    return { apiMonth: null, filterYear: null };
  }, [monthFilter]);

  // Fetch export status for current month (for button color)
  const { data: exportStatus } = useQuery<{ latestExportDate: string | null; exportedCount: number }>({
    queryKey: ["/api/admin/attendance/export-status", apiMonth, filterYear],
    queryFn: async () => {
      let url = "/api/admin/attendance/export-status";
      if (apiMonth && filterYear) {
        url += `?month=${apiMonth}&year=${filterYear}`;
      }
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!apiMonth && !!filterYear,
  });

  const hasExportedData = (exportStatus?.exportedCount || 0) > 0;

  // Mark entries as exported mutation
  const markExported = useMutation({
    mutationFn: async (entryIds: number[]) => {
      const res = await apiRequest('POST', '/api/admin/attendance/mark-exported', { entryIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance/export-status"] });
      toast({ title: "Export Recorded", description: "Records marked as exported to Oracle." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to mark entries as exported." });
    },
  });

  // Update export date mutation (super admin only)
  const updateExportDate = useMutation({
    mutationFn: async ({ entryId, exportDate }: { entryId: number; exportDate: string | null }) => {
      const res = await apiRequest('PATCH', `/api/admin/attendance/entry/${entryId}/export-date`, { exportDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance/export-status"] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update export date." });
    },
  });

  // ---- Bulk Export Date Reset/Update ----
  const [bulkExportDialogOpen, setBulkExportDialogOpen] = useState(false);
  const [selectedTargetDates, setSelectedTargetDates] = useState<Set<string | null>>(new Set());
  const [bulkResetMode, setBulkResetMode] = useState(false);
  const [bulkNewDate, setBulkNewDate] = useState(() => {
    // Use LOCAL date (not UTC) to avoid timezone offset shifting the date
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Today's date string (LOCAL date) for Nasir restriction
  // Must use local date — not toISOString() which gives UTC and can be a different day in IST
  const todayDateStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // Fetch distinct export dates for selected month — lazy (only when dialog open)
  const { data: exportDatesData = [], isLoading: isLoadingExportDates } = useQuery<{ exportDate: string | null; count: number }[]>({
    queryKey: ["/api/admin/attendance/export-dates", apiMonth, filterYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/attendance/export-dates?month=${apiMonth}&year=${filterYear}`);
      return res.json();
    },
    enabled: bulkExportDialogOpen && !!apiMonth && !!filterYear,
  });

  const bulkUpdateExportDate = useMutation({
    mutationFn: async ({ month, year, targetDates, newExportDate }: {
      month: number; year: number;
      targetDates: (string | null)[];
      newExportDate: string | null;
    }) => {
      const res = await apiRequest('PATCH', '/api/admin/attendance/bulk-export-date', {
        month, year, targetDates, newExportDate,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to bulk update export dates');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance/export-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance/export-dates"] });
      toast({ title: "Export Dates Updated", description: `${data.updatedCount} entries updated successfully.` });
      setBulkExportDialogOpen(false);
      setSelectedTargetDates(new Set());
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to bulk update export dates." });
    },
  });

  const toggleTargetDate = (date: string | null) => {
    setSelectedTargetDates(prev => {
      const next = new Set(prev);
      const key = date === null ? null : date;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBulkExportUpdate = () => {
    if (!apiMonth || !filterYear || selectedTargetDates.size === 0) return;
    const targetDates = Array.from(selectedTargetDates);
    const newExportDate = bulkResetMode ? null : new Date(bulkNewDate + 'T00:00:00').toISOString();
    bulkUpdateExportDate.mutate({
      month: parseInt(apiMonth),
      year: parseInt(filterYear),
      targetDates,
      newExportDate,
    });
  };
  // ---- End Bulk Export Date ----

  // ---- Replace Signed Report (Super Admin only) ----
  const [replaceReportId, setReplaceReportId] = useState<number | null>(null);
  const [replaceOldFileUrl, setReplaceOldFileUrl] = useState<string>('');
  const [isReplacing, setIsReplacing] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const handleReplaceReport = async () => {
    const file = replaceFileInputRef.current?.files?.[0];
    if (!file || !replaceReportId) return;
    setIsReplacing(true);
    try {
      // 1. Upload new file
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('File upload failed');
      const uploadData = await uploadRes.json();
      const newFileUrl: string = uploadData.fileUrl || uploadData.imageUrl || '';
      if (!newFileUrl) throw new Error('Server did not return a file URL');

      // 2. Update DB with new fileUrl only — all other fields remain untouched
      const patchRes = await fetch(`/api/attendance/${replaceReportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: newFileUrl }),
      });
      if (!patchRes.ok) throw new Error('Failed to update report record');

      // 3. Delete old physical file from server after successful DB update
      if (replaceOldFileUrl) {
        await fetch('/api/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: replaceOldFileUrl }),
        }).catch(() => {}); // non-fatal if old file already missing
      }

      // 4. Refresh table
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({ title: 'File Replaced', description: 'The signed report has been replaced successfully.' });
      setReplaceReportId(null);
      setReplaceOldFileUrl('');
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Replace Failed', description: err.message || 'An error occurred.' });
    } finally {
      setIsReplacing(false);
    }
  };
  // ---- End Replace Signed Report ----

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

  const { data: missingEmployees = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/all-missing-employees", apiMonth, filterYear],
    queryFn: async () => {
      if (!apiMonth || !filterYear) return [];
      const response = await apiRequest("GET", `/api/admin/all-missing-employees?month=${apiMonth}&year=${filterYear}`);
      return response.json();
    },
    enabled: !!apiMonth && !!filterYear
  });

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
      monthNum: number;
      yearNum: number;
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
      adminNoting: string;
      employeeRemarks: string;
      employeeDbId: number;
      exportedToOracleAt: string | null;
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
                  monthNum: report.month,
                  yearNum: report.year,
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
                  adminNoting: entry.admin_noting || entry.adminNoting || "",
                  employeeRemarks: entry.employee?.remarks || "",
                  employeeDbId: entry.employee?.id || 0,
                  verified: entry.verified || false,
                  exportedToOracleAt: entry.exported_to_oracle_at || entry.exportedToOracleAt || null,
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

  // Get unique designations for the filter
  const availableDesignations = useMemo(() => {
    const uniqueDesignations = new Set<string>();
    allEntries.forEach(entry => {
      if (entry.designation && entry.designation.trim() !== '') {
        uniqueDesignations.add(entry.designation);
      }
    });
    return Array.from(uniqueDesignations).sort();
  }, [allEntries]);

  // Calculate filtered departments, months, and salary registers based on current filters
  const {
    filteredDepartments,
    filteredMonths,
    filteredSalaryRegisters,
    filteredSalaryAssistants,
    filteredDesignations
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
          entry.remarks.toLowerCase().includes(lowerSearchTerm) ||
          (entry.adminNoting || "").toLowerCase().includes(lowerSearchTerm) ||
          (entry.employeeRemarks || "").toLowerCase().includes(lowerSearchTerm)
      );
    }

    // --- Helper to filter by everything EXCEPT the target criteria ---
    const filterBy = (entries: typeof allEntries, excludeType: 'dept' | 'month' | 'register' | 'assistant' | 'designation') => {
      let temp = entries;
      if (excludeType !== 'dept' && departmentFilter.length > 0) temp = temp.filter(e => departmentFilter.includes(e.departmentId.toString()));
      if (excludeType !== 'month' && monthFilter.length > 0) temp = temp.filter(e => monthFilter.includes(e.month));
      if (excludeType !== 'register' && salaryRegisterFilter.length > 0) temp = temp.filter(e => salaryRegisterFilter.includes(e.salaryRegisterNo));
      if (excludeType !== 'assistant' && salaryAssistantFilter.length > 0) temp = temp.filter(e => salaryAssistantFilter.includes(e.salaryAsstt));
      if (excludeType !== 'designation' && designationFilter.length > 0) temp = temp.filter(e => designationFilter.includes(e.designation));
      return temp;
    };

    const filteredForDepartments = filterBy(result, 'dept');
    const deptIds = new Set(filteredForDepartments.map(entry => entry.departmentId.toString()));

    const filteredForMonths = filterBy(result, 'month');
    const months = new Set(filteredForMonths.map(entry => entry.month));

    const filteredForRegister = filterBy(result, 'register');
    const registers = new Set(filteredForRegister.map(entry => entry.salaryRegisterNo));

    const filteredForAssistant = filterBy(result, 'assistant');
    const assistants = new Set(filteredForAssistant.map(entry => entry.salaryAsstt).filter(v => v && v.trim() !== ''));

    const filteredForDesignation = filterBy(result, 'designation');
    const designations = new Set(filteredForDesignation.map(entry => entry.designation).filter(v => v && v.trim() !== ''));

    return {
      filteredDepartments: availableDepartments.filter(dept => deptIds.has(dept.id.toString())),
      filteredMonths: Array.from(months).sort(),
      filteredSalaryRegisters: Array.from(registers).sort(),
      filteredSalaryAssistants: Array.from(assistants).sort(),
      filteredDesignations: Array.from(designations).sort()
    };
  }, [allEntries, searchTerm, departmentFilter, monthFilter, salaryRegisterFilter, salaryAssistantFilter, designationFilter, availableDepartments]);

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
          entry.remarks.toLowerCase().includes(lowerSearchTerm) ||
          (entry.adminNoting || "").toLowerCase().includes(lowerSearchTerm) ||
          (entry.employeeRemarks || "").toLowerCase().includes(lowerSearchTerm)
      );
    }

    // Apply basic filters
    if (departmentFilter.length > 0) result = result.filter(entry => departmentFilter.includes(entry.departmentId.toString()));
    if (monthFilter.length > 0) result = result.filter(entry => monthFilter.includes(entry.month));
    if (salaryRegisterFilter.length > 0) result = result.filter(entry => salaryRegisterFilter.includes(entry.salaryRegisterNo));
    if (salaryAssistantFilter.length > 0) result = result.filter(entry => salaryAssistantFilter.includes(entry.salaryAsstt));
    if (designationFilter.length > 0) result = result.filter(entry => designationFilter.includes(entry.designation));

    if (analysisFilter.length > 0) {
      const wantsMissing = analysisFilter.includes("missing_employees");
      const wantsMultiple = analysisFilter.includes("multiple_entries");
      const wantsFull = analysisFilter.includes("full_month");
      const wantsPartial = analysisFilter.includes("partial_month");
      const wantsDailyWagerFull = analysisFilter.includes("daily_wager_full_month");
      const wantsInternFull = analysisFilter.includes("intern_full_month");
      const excludeGuests = analysisFilter.includes("exclude_guests");

      // First, filter out Guest Teachers if requested
      if (excludeGuests) {
        result = result.filter(e => {
          const desig = (e.designation || "").toUpperCase();
          return desig !== "GUEST TEACHER" && desig !== "GUEST FACULTY";
        });
      }

      // 1. Pre-calculate employee counts for "Multiple Entries"
      const empCounts = new Map<string, number>();
      if (wantsMultiple) {
        result.forEach(e => {
          empCounts.set(e.employeeId, (empCounts.get(e.employeeId) || 0) + 1);
        });
      }

      // 2. Filter existing entries
      let filteredResult: typeof result = [];

      // Determine which employees match the criteria
      const employeeIdsToIncludeAll = new Set<string>();
      // Use combination of entryId and period string to uniquely identify a period
      const specificUniqueKeysToInclude = new Set<string>();

      result.forEach(entry => {
        let isMultiple = false;
        let isPartial = false;
        let isFull = false;

        if (wantsMultiple && (empCounts.get(entry.employeeId) || 0) > 1) {
          isMultiple = true;
        }

        if (wantsFull || wantsPartial || wantsDailyWagerFull || wantsInternFull) {
          const parts = entry.period.split(" to ");
          if (parts.length === 2) {
            const [startStr, endStr] = parts;
            const parseYY = (str: string) => {
              const [d, m, y] = str.split('-').map(Number);
              const fullYear = y < 100 ? 2000 + y : y;
              return new Date(fullYear, m - 1, d);
            };
            const startDate = parseYY(startStr);
            const endDate = parseYY(endStr);
            const daysInMonth = new Date(entry.yearNum, entry.monthNum, 0).getDate();
            const expectedStart = new Date(entry.yearNum, entry.monthNum - 1, 1);
            const expectedEnd = new Date(entry.yearNum, entry.monthNum - 1, daysInMonth);

            const isFullMonth =
              startDate.getTime() === expectedStart.getTime() &&
              endDate.getTime() === expectedEnd.getTime();

            if (wantsFull && isFullMonth) isFull = true;
            if (wantsPartial && !isFullMonth) isPartial = true;

            // Daily Wager Full Month: check if designation contains "DAILY WAGE" and period is full month
            if (wantsDailyWagerFull && isFullMonth) {
              const desig = (entry.designation || "").toUpperCase();
              if (desig.includes("DAILY WAGE")) {
                employeeIdsToIncludeAll.add(entry.employeeId);
              }
            }
            // Intern Full Month: check if designation contains "INTERN" and period is full month
            if (wantsInternFull && isFullMonth) {
              const desig = (entry.designation || "").toUpperCase();
              if (desig.includes("INTERN")) {
                employeeIdsToIncludeAll.add(entry.employeeId);
              }
            }
          } else if (wantsPartial) {
            isPartial = true;
          }
        }

        // Grouping behavior for Partial & Multiple
        if (isMultiple || isPartial) {
          employeeIdsToIncludeAll.add(entry.employeeId);
        }
        // Specific entry inclusion for Full Month (unique to the exact parsed period)
        if (isFull) {
          specificUniqueKeysToInclude.add(`${entry.entryId}-${entry.period}`);
        }
      });

      // Include all entries for employees that matched the grouping criteria, OR specific full entries
      if (wantsMultiple || wantsFull || wantsPartial || wantsDailyWagerFull || wantsInternFull) {
        filteredResult = result.filter(entry =>
          employeeIdsToIncludeAll.has(entry.employeeId) || specificUniqueKeysToInclude.has(`${entry.entryId}-${entry.period}`)
        );
      } else {
        // If none of those three were selected, then filteredResult starts as empty
        // (but might be populated by missing employees below)
        filteredResult = [];
      }

      // 3. If "wants missing", we map missing employees into synthetic entries and append
      // Notice that if ONLY missing employees is selected, existing entries are filtered out unless they match other stuff
      if (wantsMissing) {
        // Find which month string we are currently filtering for
        const selectedMonthStr = monthFilter.length > 0 ? monthFilter[0] : "";
        const mParts = selectedMonthStr.split(' ');
        const mMonthNum = mParts[0] ? new Date(`${mParts[0]} 1, 2000`).getMonth() + 1 : 1;
        const mYearNum = mParts[1] ? parseInt(mParts[1]) : new Date().getFullYear();

        const missingSynthetic = missingEmployees.map(emp => ({
          month: selectedMonthStr,
          monthNum: mMonthNum,
          yearNum: mYearNum,
          departmentName: emp.department_name || "Unknown",
          employeeId: emp.epid || "",
          employeeName: emp.name || "",
          designation: emp.designation || "",
          salaryAsstt: emp.salary_asstt || "",
          salaryRegisterNo: emp.salary_register_no || "",
          period: "MISSING",
          days: 0,
          remarks: "Missing Attendance",
          reportId: 0, // Synthetic
          departmentId: 0, // Fallback
          entryId: -emp.id, // Negative ID for synthetic
          verified: false,
          adminNoting: "",
          employeeRemarks: "",
          employeeDbId: emp.id,
          exportedToOracleAt: null,
        }));

        // Apply basic filters to these missing employees too, so they respect department/search filtering
        let filteredMissing = missingSynthetic;
        if (searchTerm) {
          const lowerSearchTerm = searchTerm.toLowerCase();
          filteredMissing = filteredMissing.filter(e =>
            e.employeeId.toLowerCase().includes(lowerSearchTerm) ||
            e.employeeName.toLowerCase().includes(lowerSearchTerm) ||
            e.departmentName.toLowerCase().includes(lowerSearchTerm) ||
            e.designation.toLowerCase().includes(lowerSearchTerm) ||
            e.remarks.toLowerCase().includes(lowerSearchTerm)
          );
        }
        if (excludeGuests) {
          filteredMissing = filteredMissing.filter(e => {
            const desig = (e.designation || "").toUpperCase();
            return desig !== "GUEST TEACHER" && desig !== "GUEST FACULTY";
          });
        }
        if (departmentFilter.length > 0) {
          // missing employees don't have departmentId readily mapped to the same IDs as reports, but we can filter by exact name if needed,
          // or we just skip department filtering for missing if we can't match IDs reliably.
          // Wait, the department filter uses IDs (stringly typed). Because missing employees only have `department_name`, we can map it via `availableDepartments`.
          const matchIds = departmentFilter.map(Number);
          filteredMissing = filteredMissing.filter(e => {
            const deptObj = departments.find(ad => ad.name === e.departmentName);
            return deptObj && matchIds.includes(deptObj.id);
          });
        }
        if (salaryRegisterFilter.length > 0) filteredMissing = filteredMissing.filter(e => salaryRegisterFilter.includes(e.salaryRegisterNo));
        if (salaryAssistantFilter.length > 0) filteredMissing = filteredMissing.filter(e => salaryAssistantFilter.includes(e.salaryAsstt));
        if (designationFilter.length > 0) filteredMissing = filteredMissing.filter(e => designationFilter.includes(e.designation));

        // Append missing ones to the result.
        // If other filters were active (e.g. wantMultiple AND wantsMissing), we union them.
        filteredResult = [...filteredResult, ...filteredMissing];
      } else {
        // Ensure if ONLY basic filters are selected, we don't accidentally wipe results
        if (!wantsMultiple && !wantsFull && !wantsPartial && !wantsDailyWagerFull && !wantsInternFull) {
          filteredResult = result;
        }
      }

      result = filteredResult;
    }

    if (verifiedFilter !== "all") {
      result = result.filter(entry => {
        if (verifiedFilter === "verified") return entry.verified === true;
        if (verifiedFilter === "unverified") return entry.verified !== true;
        return true;
      });
    }

    if (exportFilter !== "all") {
      result = result.filter(entry => {
        const isExported = !!entry.exportedToOracleAt;
        if (exportFilter === "exported") return isExported;
        if (exportFilter === "not_exported") return !isExported;
        return true;
      });
    }

    return result;
  }, [allEntries, missingEmployees, departments, searchTerm, departmentFilter, monthFilter, salaryRegisterFilter, salaryAssistantFilter, designationFilter, analysisFilter, verifiedFilter, exportFilter]);

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

      // If sorting by Noting is active
      if (sortConfig && sortConfig.key === 'noting') {
        const hasNoteA = !!(a.adminNoting || a.employeeRemarks);
        const hasNoteB = !!(b.adminNoting || b.employeeRemarks);

        // Both have notes or both don't have notes, fallback to default sorting
        if (hasNoteA === hasNoteB) {
          // Fallback Default sorting: Department -> Month -> Employee Name
          const deptCompare = a.departmentName.localeCompare(b.departmentName);
          if (deptCompare !== 0) return sortConfig.direction === 'asc' ? deptCompare : -deptCompare;

          const monthCompare = a.month.localeCompare(b.month);
          if (monthCompare !== 0) return sortConfig.direction === 'asc' ? monthCompare : -monthCompare;

          const nameCompare = a.employeeName.localeCompare(b.employeeName);
          return sortConfig.direction === 'asc' ? nameCompare : -nameCompare;
        }

        // One has a note, the other doesn't. 
        // In 'asc' (first click), we want notes to appear at the TOP (so hasNote should be "less than" no note)
        // In 'desc', we want notes to appear at the BOTTOM
        if (sortConfig.direction === 'asc') {
          return hasNoteA ? -1 : 1;
        } else {
          return hasNoteA ? 1 : -1;
        }
      }

      // If sorting by Remarks is active
      if (sortConfig && sortConfig.key === 'remarks') {
        const remarksA = a.remarks || "";
        const remarksB = b.remarks || "";

        const hasRemarkA = remarksA.trim() !== '' && remarksA.trim() !== '-';
        const hasRemarkB = remarksB.trim() !== '' && remarksB.trim() !== '-';

        if (hasRemarkA !== hasRemarkB) {
          if (sortConfig.direction === 'asc') {
            return hasRemarkA ? -1 : 1;
          } else {
            return hasRemarkA ? 1 : -1;
          }
        }

        if (hasRemarkA && hasRemarkB) {
          const remarkCompare = remarksA.localeCompare(remarksB);
          if (remarkCompare !== 0) {
            return sortConfig.direction === 'asc' ? remarkCompare : -remarkCompare;
          }
        }

        const deptCompare = a.departmentName.localeCompare(b.departmentName);
        if (deptCompare !== 0) return sortConfig.direction === 'asc' ? deptCompare : -deptCompare;

        const monthCompare = a.month.localeCompare(b.month);
        if (monthCompare !== 0) return sortConfig.direction === 'asc' ? monthCompare : -monthCompare;

        const nameCompare = a.employeeName.localeCompare(b.employeeName);
        return sortConfig.direction === 'asc' ? nameCompare : -nameCompare;
      }

      // If sorting by Export to Oracle on is active
      if (sortConfig && sortConfig.key === 'exportedAt') {
        const dateA = a.exportedToOracleAt ? new Date(a.exportedToOracleAt).getTime() : 0;
        const dateB = b.exportedToOracleAt ? new Date(b.exportedToOracleAt).getTime() : 0;
        const hasA = !!a.exportedToOracleAt;
        const hasB = !!b.exportedToOracleAt;

        if (hasA !== hasB) {
          return sortConfig.direction === 'asc' ? (hasA ? -1 : 1) : (hasA ? 1 : -1);
        }
        if (hasA && hasB) {
          const comp = dateA - dateB;
          if (comp !== 0) return sortConfig.direction === 'asc' ? comp : -comp;
        }

        const deptCompare = a.departmentName.localeCompare(b.departmentName);
        if (deptCompare !== 0) return sortConfig.direction === 'asc' ? deptCompare : -deptCompare;
        return a.employeeName.localeCompare(b.employeeName);
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
    localStorage.removeItem("admin");
    localStorage.removeItem("adminType");
    localStorage.removeItem("adminEmail");
    localStorage.removeItem("adminUsername");
    localStorage.removeItem("adminSessionToken");
    setLocation("/admin/login");
  };

  // Function to handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Helper to filter out Daily Wage employees when they are missing, for export purposes ONLY
  // Also skips already-exported entries when skipExported checkbox is checked
  const entriesToExport = useMemo(() => {
    return processedEntries.filter(entry => {
      if (entry.period === "MISSING") {
        const desig = (entry.designation || "").toUpperCase();
        if (desig.includes("DAILY WAGE")) {
          return false;
        }
      }
      // Skip rows that already have an export date if checkbox is enabled
      if (skipExported && entry.exportedToOracleAt) {
        return false;
      }
      return true;
    });
  }, [processedEntries, skipExported]);

  // Function to download filtered entries as Excel
  const downloadExcel = () => {
    // Create a worksheet from the filtered entries
    const worksheet = XLSX.utils.json_to_sheet(entriesToExport.map(entry => {
      // Split period string "DD-MM-YYYY to DD-MM-YYYY"
      const [fromStr, toStr] = entry.period.split(" to ");

      const convertToMMDDYYYY = (dateStr: string) => {
        if (!dateStr) return "";
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          // Assuming input is DD-MM-YYYY
          return `${parts[1]}-${parts[0]}-${parts[2]}`;
        }
        return dateStr;
      };

      return {
        "Month": entry.month,
        "Department": entry.departmentName,
        "Employee ID": entry.employeeId,
        "Employee Name": entry.employeeName,
        "Designation": entry.designation,
        "Salary Assistant": entry.salaryAsstt,
        "Salary Register No": entry.salaryRegisterNo,
        "Period From": convertToMMDDYYYY(fromStr),
        "Period To": convertToMMDDYYYY(toStr),
        "Days": entry.days,
        "Remarks": entry.remarks,
        "Admin Noting": entry.adminNoting || "",
        "Permanent Remark": entry.employeeRemarks || ""
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
      { wch: 25 }, // Remarks
      { wch: 25 }, // Admin Noting
      { wch: 25 }  // Permanent Remark
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

  // Oracle T_ATTEND Excel export — matches export.xls format (Excel serial dates or string)
  const exportOracleXlsx = () => {
    // Convert DD-MM-YY date string to MM-DD-YYYY
    const formatDateHyphen = (dateStr: string): string => {
      if (!dateStr) return "";
      const parts = dateStr.trim().split("-");
      if (parts.length === 0) return "";
      // Match DD-MM-YYYY or DD-MM-YY
      if (parts.length === 3) {
        const d = parts[0].padStart(2, "0");
        const m = parts[1].padStart(2, "0");
        let y = parts[2];
        if (y.length === 2) y = `20${y}`;
        return `${m}-${d}-${y}`;
      }
      return "";
    };

    // CTL column order (same as export.xls)
    const headers = [
      'NAME', 'NP', 'NFDATE', 'NTDATE', 'FP', 'FFDATE', 'FTDATE', 'HP', 'HFDATE', 'HTDATE',
      'FDAYS', 'HDAYS', 'NDAYS', 'DEPT', 'ECODE', 'D_AST', 'REMARK1', 'PF', 'MONTH', 'YEAR',
      'RECFLAG', 'DUES', 'SAL_TYPE', 'BRK_DAYS', 'SINGLE_FLAG', 'PAY_RELEASE_FLAG',
      'BRK_DAYS_FR', 'BRK_DAYS_TO', 'TERM_APP', 'OLD_DESIG', 'OLD_BASIC'
    ];

    const dataRows = entriesToExport.map(entry => {
      let ffdate = "";
      let ftdate = "";
      let nfdate = "";
      let ntdate = "";

      if (entry.period !== "MISSING") {
        const [fromStr, toStr] = entry.period.split(" to ");
        ffdate = formatDateHyphen(fromStr || "");
        ftdate = formatDateHyphen(toStr || "");
      } else {
        const m = entry.monthNum.toString().padStart(2, "0");
        const y = entry.yearNum.toString();
        const lastDay = new Date(entry.yearNum, entry.monthNum, 0).getDate().toString().padStart(2, "0");
        nfdate = `${m}-01-${y}`;
        ntdate = `${m}-${lastDay}-${y}`;
      }

      // Map salary assistant code to name
      let saName = entry.salaryAsstt;
      if (saName) {
        const saObj = salaryAssistants.find(s => s.value === saName);
        if (saObj && saObj.label.includes(" - ")) {
          saName = saObj.label.split(" - ")[1];
        }
      }
      saName = (saName || "").substring(0, 20);

      const np = (nfdate && ntdate) ? "NP" : "";
      const fp = (ffdate && ftdate) ? "FP" : "";
      const remarks = (entry.remarks || "").substring(0, 30);

      return [
        entry.employeeName,  // NAME (0)
        np,                  // NP (1)
        nfdate,              // NFDATE (2)
        ntdate,              // NTDATE (3)
        fp,                  // FP (4)
        ffdate,              // FFDATE (5)
        ftdate,              // FTDATE (6)
        "",                  // HP (7)
        "",                  // HFDATE (8)
        "",                  // HTDATE (9)
        entry.days,          // FDAYS (10)
        0,                   // HDAYS (11)
        null,                // NDAYS (12)
        "",                  // DEPT (13)
        entry.employeeId,    // ECODE (14)
        saName,              // D_AST (15)
        remarks,             // REMARK1 (16)
        null,                // PF (17)
        entry.monthNum,      // MONTH (18)
        entry.yearNum,       // YEAR (19)
        "0",                 // RECFLAG (20)
        "",                  // DUES (21)
        1,                   // SAL_TYPE (22)
        null,                // BRK_DAYS (23)
        "N",                 // SINGLE_FLAG (24)
        "Y",                 // PAY_RELEASE_FLAG (25)
        "",                  // BRK_DAYS_FR (26)
        "",                  // BRK_DAYS_TO (27)
        "",                  // TERM_APP (28)
        "",                  // OLD_DESIG (29)
        null,                // OLD_BASIC (30)
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

    // Date format for the workbook (user wants ddmmyyyy strings)
    // No specific Excel date marking needed if they are strings.
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    // Just ensure names and order are exactly what's requested.

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ATTENDANCE');

    let fileName = 'ATTENDANCE';
    if (monthFilter.length > 0) fileName += `_${monthFilter[0].replace(/\s+/g, '_')}`;
    XLSX.writeFile(wb, `${fileName}.xls`, { bookType: 'xls' });

    // Mark all visible entries as exported
    const entryIds = [...new Set(entriesToExport.map(e => e.entryId).filter(id => id > 0))];
    if (entryIds.length > 0) {
      markExported.mutate(entryIds);
    }
  };

  // Oracle T_ATTEND format export — semicolon CSV matching T_ATTEND.ctl
  const exportOracleExcel = () => {
    // Oracle date format: MM/DD/YYYY HH24:MI:SS
    const toOracleDate = (dateStr: string): string => {
      if (!dateStr) return "";
      const parts = dateStr.trim().split("-");
      if (parts.length === 3) {
        const d = parts[0].padStart(2, "0");
        const m = parts[1].padStart(2, "0");
        let y = parts[2];
        if (y.length === 2) y = `20${y}`;
        return `${d}-${m}-${y}`; // dd-mm-yyyy
      }
      return "";
    };

    // Escape a value for semicolon CSV: wrap in quotes
    const q = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined || val === "") return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    };
    const num = (val: number | null | undefined): string => {
      if (val === null || val === undefined) return "";
      return String(val);
    };

    // CTL column order (31 columns)
    const lines: string[] = entriesToExport.map(entry => {
      let ffdate = 'NULL';
      let ftdate = 'NULL';
      let nfdate = 'NULL';
      let ntdate = 'NULL';

      // Map salary assistant code to name
      let saName = entry.salaryAsstt;
      if (saName) {
        const saObj = salaryAssistants.find(s => s.value === saName);
        if (saObj && saObj.label.includes(' - ')) {
          saName = saObj.label.split(' - ')[1];
        }
      }
      saName = (saName || "").substring(0, 20);

      if (entry.period !== "MISSING") {
        const [fromStr, toStr] = entry.period.split(" to ");
        ffdate = toOracleDate(fromStr || "");
        ftdate = toOracleDate(toStr || "");
      } else {
        const m = entry.monthNum.toString().padStart(2, "0");
        const y = entry.yearNum.toString();
        const lastDay = new Date(entry.yearNum, entry.monthNum, 0).getDate().toString().padStart(2, "0");
        nfdate = `01-${m}-${y}`;
        ntdate = `${lastDay}-${m}-${y}`;
      }

      const np = (nfdate && ntdate) ? "NP" : "";
      const fp = (ffdate && ftdate) ? "FP" : "";
      const remarks = (entry.remarks || "").substring(0, 30);

      return [
        q(entry.employeeName), // 0: NAME
        q(np),                 // 1: NP
        nfdate === "" ? '""' : q(nfdate), // 2: NFDATE
        ntdate === "" ? '""' : q(ntdate), // 3: NTDATE
        q(fp),                 // 4: FP
        ffdate === "" ? '""' : q(ffdate), // 5: FFDATE
        ftdate === "" ? '""' : q(ftdate), // 6: FTDATE
        q(""),                 // 7: HP
        '""',                  // 8: HFDATE
        '""',                  // 9: HTDATE
        num(entry.days),       // 10: FDAYS
        "0",                   // 11: HDAYS
        '""',                  // 12: NDAYS
        q(""),                 // 13: DEPT
        q(entry.employeeId),   // 14: ECODE
        q(saName),             // 15: D_AST
        q(remarks),            // 16: REMARK1
        '""',                  // 17: PF
        num(entry.monthNum),   // 18: MONTH
        num(entry.yearNum),    // 19: YEAR
        q("0"),                // 20: RECFLAG
        '""',                  // 21: DUES
        "1",                   // 22: SAL_TYPE
        '""',                  // 23: BRK_DAYS
        q("N"),                // 24: SINGLE_FLAG
        q("Y"),                // 25: PAY_RELEASE_FLAG
        '""',                  // 26: BRK_DAYS_FR
        '""',                  // 27: BRK_DAYS_TO
        '""',                  // 28: TERM_APP
        q(""),                 // 29: OLD_DESIG
        '""',                  // 30: OLD_BASIC
      ].join(";");
    });

    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let fileName = 'ATTENDANCE';
    if (monthFilter.length > 0) fileName += `_${monthFilter[0].replace(/\s+/g, '_')}`;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Mark all visible entries as exported
    const entryIds = [...new Set(entriesToExport.map(e => e.entryId).filter(id => id > 0))];
    if (entryIds.length > 0) {
      markExported.mutate(entryIds);
    }
  };

  const [isBulkVerifying, setIsBulkVerifying] = useState(false);

  const handleBulkVerify = async () => {
    const unverifiedEntries = paginatedEntries.filter(e => !e.verified && e.entryId > 0);

    if (unverifiedEntries.length === 0) {
      toast({ title: "Info", description: "All displayed records are already verified." });
      return;
    }

    const confirm = window.confirm("Are you sure you want to verify attendance for all filtered employees? This action cannot be undone.");
    if (!confirm) return;

    setIsBulkVerifying(true);
    let successCount = 0;

    try {
      for (const entry of unverifiedEntries) {
        await toggleVerify.mutateAsync(entry.entryId);
        successCount++;
      }
      toast({ title: "Success", description: `Successfully verified ${successCount} records.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "An error occurred during bulk verification." });
    } finally {
      setIsBulkVerifying(false);
    }
  };

  const allVerifiedOnPage = paginatedEntries.length > 0 && paginatedEntries.every(e => e.verified);

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
                {canExport && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant={hasExportedData ? "default" : "outline"}
                        className={`flex items-center gap-2 ${hasExportedData
                          ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                          : 'text-blue-700 border-blue-200 hover:bg-blue-50'
                          }`}
                      >
                        <FileDown className="h-4 w-4" />
                        Export
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={exportOracleXlsx} className="cursor-pointer">
                        <FileDown className="h-4 w-4 mr-2 text-green-600" />
                        Export as Excel (.xls)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={exportOracleExcel} className="cursor-pointer">
                        <FileDown className="h-4 w-4 mr-2 text-blue-600" />
                        Export as CSV
                      </DropdownMenuItem>
                      {apiMonth && filterYear && (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedTargetDates(new Set());
                            setBulkResetMode(false);
                            setBulkNewDate((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
                            setBulkExportDialogOpen(true);
                          }}
                          className="cursor-pointer"
                        >
                          <RefreshCw className="h-4 w-4 mr-2 text-orange-500" />
                          Reset / Update Export Date
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  variant="outline"
                  onClick={() => setLocation("/admin/missing-employees")}
                  className="flex items-center gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                >
                  <XCircle className="h-4 w-4" />
                  Missing Employees
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

            <div className="flex flex-col md:flex-row flex-wrap gap-4 mb-6">
              <div className="relative flex-1 min-w-[300px]">
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
                    if (!isNasirAdmin) {
                      setMonthFilter(values);
                      setCurrentPage(1); // Reset to first page on filter change
                    }
                  }}
                  placeholder="Filter by month"
                  className="min-w-[180px]"
                  disabled={isNasirAdmin}
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
                  disabled={isSalaryAdmin}
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
              <div className="w-full md:w-64">
                <MultiSelect
                  options={filteredDesignations.map(d => ({
                    label: d,
                    value: d
                  }))}
                  selected={designationFilter}
                  onChange={(values) => {
                    setDesignationFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Filter by designation"
                  className="min-w-[180px]"
                />
              </div>
              <div className="w-full md:w-64">
                <MultiSelect
                  options={[
                    {
                      label: "Missing Employees",
                      value: "missing_employees",
                      className: "bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/90 hover:text-emerald-900",
                      selectedClassName: "bg-emerald-100 text-emerald-950 font-medium",
                      badgeClassName: "bg-emerald-50 text-emerald-800 border-emerald-200"
                    },
                    {
                      label: "Partial/Excess Period",
                      value: "partial_month",
                      className: "bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/90 hover:text-emerald-900",
                      selectedClassName: "bg-emerald-100 text-emerald-950 font-medium",
                      badgeClassName: "bg-emerald-50 text-emerald-800 border-emerald-200"
                    },
                    {
                      label: "Include D/W Full Month",
                      value: "daily_wager_full_month",
                      className: "bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/90 hover:text-emerald-900",
                      selectedClassName: "bg-emerald-100 text-emerald-950 font-medium",
                      badgeClassName: "bg-emerald-50 text-emerald-800 border-emerald-200"
                    },
                    {
                      label: "Include Intern Full Month",
                      value: "intern_full_month",
                      className: "bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/90 hover:text-emerald-900",
                      selectedClassName: "bg-emerald-100 text-emerald-950 font-medium",
                      badgeClassName: "bg-emerald-50 text-emerald-800 border-emerald-200"
                    },
                    {
                      label: "Exclude Guest Teachers",
                      value: "exclude_guests",
                      className: "bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/90 hover:text-emerald-900",
                      selectedClassName: "bg-emerald-100 text-emerald-950 font-medium",
                      badgeClassName: "bg-emerald-50 text-emerald-800 border-emerald-200"
                    },
                    {
                      label: "Multiple Entries",
                      value: "multiple_entries",
                      className: "bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100/90 hover:text-indigo-900",
                      selectedClassName: "bg-indigo-100 text-indigo-950 font-medium",
                      badgeClassName: "bg-indigo-50 text-indigo-800 border-indigo-200"
                    },
                    {
                      label: "Full Month Period",
                      value: "full_month",
                      className: "bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100/90 hover:text-indigo-900",
                      selectedClassName: "bg-indigo-100 text-indigo-950 font-medium",
                      badgeClassName: "bg-indigo-50 text-indigo-800 border-indigo-200"
                    },
                  ]}
                  selected={analysisFilter}
                  onChange={(values) => {
                    setAnalysisFilter(values);
                    setCurrentPage(1); // Reset to first page on filter change
                  }}
                  placeholder="Entry Analysis"
                  className="min-w-[180px]"
                  hideSelectAll={true}
                />
              </div>
              {/* Skip Already Exported checkbox — shown only to users who can export */}
              {canExport && (
                <div className="flex items-center gap-2 self-center px-1">
                  <input
                    id="skip-exported-checkbox"
                    type="checkbox"
                    className={`h-4 w-4 accent-green-600 ${!isSuperAdmin ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                    checked={skipExported}
                    disabled={!isSuperAdmin}
                    onChange={(e) => {
                      if (isSuperAdmin) setSkipExported(e.target.checked);
                    }}
                    title={!isSuperAdmin ? 'Only Super Admin can change this option' : ''}
                  />
                  <label
                    htmlFor="skip-exported-checkbox"
                    className={`text-sm font-medium select-none whitespace-nowrap text-muted-foreground ${!isSuperAdmin ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    Skip Already Exported
                  </label>
                </div>
              )}
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
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('remarks')}
                    >
                      <div className="flex items-center gap-1">
                        Remarks
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="min-w-[180px] cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('noting')}
                    >
                      <div className="flex items-center gap-1">
                        Noting
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[170px]">
                      <div className="flex items-center justify-between">
                        <div
                          className="cursor-pointer hover:bg-muted/50 flex items-center gap-1"
                          onClick={() => handleSort('exportedAt')}
                        >
                          Export to Oracle
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="-mr-3 h-8 w-8 p-0" title="Filter by Export Status">
                              <Filter className={`h-4 w-4 ${exportFilter !== 'all' ? 'text-green-600 fill-green-100' : ''}`} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setExportFilter('all')}>
                              <div className="flex items-center">
                                {exportFilter === 'all' && <Check className="mr-2 h-4 w-4" />}
                                <span className={exportFilter !== 'all' ? 'ml-6' : ''}>All</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setExportFilter('exported')}>
                              <div className="flex items-center text-green-600">
                                {exportFilter === 'exported' && <Check className="mr-2 h-4 w-4" />}
                                <span className={exportFilter !== 'exported' ? 'ml-6' : ''}>Exported</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setExportFilter('not_exported')}>
                              <div className="flex items-center text-gray-600">
                                {exportFilter === 'not_exported' && <Check className="mr-2 h-4 w-4" />}
                                <span className={exportFilter !== 'not_exported' ? 'ml-6' : ''}>Not Exported</span>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[140px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {salaryRegisterFilter.length > 0 && (
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-green-600"
                              title="Verify all on this page"
                              disabled={isBulkVerifying || allVerifiedOnPage}
                              checked={allVerifiedOnPage}
                              onChange={() => {
                                if (!allVerifiedOnPage) handleBulkVerify();
                              }}
                            />
                          )}
                          <span>Actions</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="-mr-3 h-8 w-8 p-0" title="Filter by Verification Status">
                              <Filter className={`h-4 w-4 ${verifiedFilter !== 'all' ? 'text-orange-600 fill-orange-100' : ''}`} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setVerifiedFilter('all')}>
                              <div className="flex items-center">
                                {verifiedFilter === 'all' && <Check className="mr-2 h-4 w-4" />}
                                <span className={verifiedFilter !== 'all' ? 'ml-6' : ''}>All</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setVerifiedFilter('verified')}>
                              <div className="flex items-center text-green-600">
                                {verifiedFilter === 'verified' && <Check className="mr-2 h-4 w-4" />}
                                <span className={verifiedFilter !== 'verified' ? 'ml-6' : ''}>Verified</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setVerifiedFilter('unverified')}>
                              <div className="flex items-center text-orange-600">
                                {verifiedFilter === 'unverified' && <Check className="mr-2 h-4 w-4" />}
                                <span className={verifiedFilter !== 'unverified' ? 'ml-6' : ''}>Pending Verification</span>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8">
                        {searchTerm || departmentFilter.length > 0 || monthFilter.length > 0 || salaryRegisterFilter.length > 0
                          ? "No attendance entries found matching your search criteria."
                          : "No attendance entries found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedEntries.map((entry, index) => (
                      <TableRow key={index} className={entry.exportedToOracleAt ? 'bg-green-50' : ''}>
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
                          <NotingCell
                            entryId={entry.entryId}
                            employeeDbId={(entry as any).employeeDbId}
                            adminNoting={(entry as any).adminNoting || ""}
                            employeeRemarks={(entry as any).employeeRemarks || ""}
                            monthFilter={monthFilter}
                            toast={toast}
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.exportedToOracleAt ? (() => {
                            // Strip trailing 'Z' before parsing — PostgreSQL TIMESTAMP WITHOUT TIME ZONE
                            // is stored in server local time (IST) but pg driver adds 'Z' suffix,
                            // wrongly implying UTC. Parsing without Z treats it as local time correctly.
                            const rawTs = entry.exportedToOracleAt!;
                            const localStr = rawTs.endsWith('Z') ? rawTs.slice(0, -1) : rawTs;
                            const d = new Date(localStr);
                            const formatted = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear().toString().slice(-2)}`;
                            if (isSuperAdmin) {
                              return (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="text-green-700 font-medium hover:underline cursor-pointer flex items-center gap-1" title="Click to edit date">
                                      {formatted}
                                      <CalendarIcon className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={d}
                                      onSelect={(date) => {
                                        if (date) {
                                          updateExportDate.mutate({ entryId: entry.entryId, exportDate: date.toISOString() });
                                        }
                                      }}
                                      initialFocus
                                    />
                                    <div className="p-2 border-t bg-slate-50">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-8"
                                        onClick={() => updateExportDate.mutate({ entryId: entry.entryId, exportDate: null })}
                                      >
                                        Remove Date
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              );
                            }
                            return <span className="text-green-700 font-medium">{formatted}</span>;
                          })() : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
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
                            {JSON.parse(localStorage.getItem("admin") || "{}").role !== 'salary' && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setLocation(`/admin/reports/${entry.reportId}/edit`)}
                                title="Edit Report"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {entry.fileUrl && (
                              <Button
                                variant="outline"
                                size="icon"
                                className={`h-8 w-8 ${JSON.parse(localStorage.getItem("admin") || "{}").userCode === 'VEW'
                                  ? 'cursor-not-allowed opacity-50 bg-gray-50'
                                  : ''
                                  }`}
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
                            {isSuperAdmin && entry.fileUrl && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-orange-600 border-orange-200 hover:bg-orange-50"
                                onClick={() => {
                                  setReplaceReportId(entry.reportId);
                                  setReplaceOldFileUrl(entry.fileUrl!);
                                  if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
                                }}
                                title="Replace Signed Report (Super Admin)"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                                if (adminData.userCode === 'VEW') {
                                  toast({
                                    variant: "destructive",
                                    title: "Access Denied",
                                    description: "You do not have permission to verify entries."
                                  });
                                  return;
                                }
                                // Restricted for Salary Admin "ALL" as well
                                if (adminData.role === 'salary' && adminData.userCode === 'ALL') {
                                  toast({
                                    variant: "destructive",
                                    title: "Access Denied",
                                    description: "Global Salary Admin cannot verify individual entries."
                                  });
                                  return;
                                }
                                toggleVerify.mutate(entry.entryId);
                              }}
                              className={`h-6 w-6 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${entry.verified
                                ? 'bg-green-500 border-green-500'
                                : (() => {
                                  const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                                  if (adminData.userCode === 'VEW' || (adminData.role === 'salary' && adminData.userCode === 'ALL')) {
                                    return 'border-gray-200 cursor-not-allowed opacity-50';
                                  }
                                  return 'border-gray-300 hover:border-green-400';
                                })()
                                }`}
                              title={(() => {
                                const adminData = JSON.parse(localStorage.getItem("admin") || "{}");
                                if (adminData.userCode === 'VEW') return 'View Only';
                                if (adminData.role === 'salary' && adminData.userCode === 'ALL') return 'View Only (Global Admin)';
                                return entry.verified ? 'Verified ✓' : 'Mark as Verified';
                              })()}
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

      {/* Replace Signed Report Dialog — Super Admin only */}
      <Dialog open={replaceReportId !== null} onOpenChange={(open) => { if (!open) { setReplaceReportId(null); setReplaceOldFileUrl(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-orange-600" />
              Replace Signed Report
            </DialogTitle>
            <DialogDescription>
              Upload a new signed attendance report to replace the existing file. The old file will be permanently deleted from the server. All other report data (status, despatch details, transaction ID) will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <strong>Note:</strong> This action is irreversible. The previous file will be permanently removed.
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Replacement File</label>
              <input
                ref={replaceFileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 border border-input rounded-md p-1 cursor-pointer"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isReplacing}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleReplaceReport}
              disabled={isReplacing}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isReplacing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Replacing...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" /> Replace File</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Export Date Dialog */}
      <Dialog open={bulkExportDialogOpen} onOpenChange={(open) => { if (!open) setBulkExportDialogOpen(false); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-orange-500" />
              Bulk Update Export to Oracle Date
            </DialogTitle>
            <DialogDescription>
              Selectively update the export date for entries of the selected month.
            </DialogDescription>
          </DialogHeader>

          {/* Month info */}
          <div className="text-sm text-muted-foreground">
            Month: <span className="font-semibold text-foreground">{monthFilter[0] || '—'}</span>
          </div>

          {/* Section 1: Select target dates */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Select entries to update:</p>
            {isLoadingExportDates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading export dates...
              </div>
            ) : exportDatesData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No export data found for this month.</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {exportDatesData.map(({ exportDate, count }) => {
                  // For Nasir: only today's date is enabled; blank entries disabled
                  const isEnabled = isNasirAdmin
                    ? exportDate !== null && exportDate === todayDateStr
                    : true;
                  const isChecked = selectedTargetDates.has(exportDate);

                  // Format date for display: "2026-05-13" → "13-05-26"
                  const displayDate = exportDate
                    ? (() => {
                        const [y, m, d] = exportDate.split('-');
                        return `${d}-${m}-${y.slice(2)}`;
                      })()
                    : null;

                  return (
                    <label
                      key={exportDate ?? '__null__'}
                      className={`flex items-center gap-3 p-2 rounded-md border transition-colors ${
                        isEnabled
                          ? 'cursor-pointer hover:bg-muted/50'
                          : 'cursor-not-allowed opacity-40 bg-gray-50'
                      } ${isChecked && isEnabled ? 'border-orange-300 bg-orange-50' : 'border-border'}`}
                    >
                      <input
                        type="checkbox"
                        disabled={!isEnabled}
                        checked={isChecked}
                        onChange={() => isEnabled && toggleTargetDate(exportDate)}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <span className="text-sm flex-1">
                        {displayDate
                          ? <><span className="font-medium">Exported on: {displayDate}</span><span className="text-muted-foreground ml-2">({count} {count === 1 ? 'entry' : 'entries'})</span></>
                          : <><span className="font-medium">No export date (blank)</span><span className="text-muted-foreground ml-2">({count} {count === 1 ? 'entry' : 'entries'})</span></>}
                      </span>
                      {!isEnabled && isNasirAdmin && (
                        <span className="text-xs text-gray-400 ml-auto">(locked)</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nasir notice */}
          {isNasirAdmin && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
              ⚠️ You can only update entries exported on today's date ({(() => { const [y,m,d] = todayDateStr.split('-'); return `${d}-${m}-${y.slice(2)}`; })()}).
            </div>
          )}

          {/* Section 2: New value */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Set new value:</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  checked={!bulkResetMode}
                  onChange={() => setBulkResetMode(false)}
                  className="accent-orange-500"
                />
                Set a specific date
              </label>
              {!bulkResetMode && (
                <input
                  type="date"
                  value={bulkNewDate}
                  onChange={(e) => setBulkNewDate(e.target.value)}
                  className="w-full text-sm px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 ml-6"
                />
              )}
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  checked={bulkResetMode}
                  onChange={() => setBulkResetMode(true)}
                  className="accent-orange-500"
                />
                Reset / Clear (set to blank)
              </label>
            </div>
          </div>

          {/* Warning */}
          <div className="p-2 bg-slate-50 border rounded-md text-xs text-muted-foreground">
            ⚠️ Only entries with the selected export dates above will be updated. All other entries remain unchanged.
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleBulkExportUpdate}
              disabled={selectedTargetDates.size === 0 || bulkUpdateExportDate.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {bulkUpdateExportDate.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Updating...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Update Selected Entries</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 