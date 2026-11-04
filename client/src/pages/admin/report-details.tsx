import { useQuery, useMutation } from "@tanstack/react-query";
import { getReportPrefix } from "@shared/reportKind";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { AttendanceReport } from "@shared/schema";
import AdminHeader from "@/components/layout/admin-header";
import { ReportDetailsView } from "@/pages/dashboard/report-details";

// Admin: /admin/reports/:id
// Shows and prints the report exactly like the department does (same component),
// plus the Admin correction "Mark as Main / Supplementary".
export default function ReportDetails() {
  const [, params] = useRoute("/admin/reports/:id");
  const reportId = params?.id;
  const { toast } = useToast();

  const { data: report } = useQuery<AttendanceReport>({
    queryKey: [`/api/admin/attendance/${reportId}`],
    enabled: !!reportId,
  });

  // All reports of this department → needed to label old reports (no stored kind)
  const { data: deptReports } = useQuery<AttendanceReport[]>({
    queryKey: [`/api/departments/${report?.departmentId}/attendance`],
    enabled: !!report?.departmentId,
  });
  const reportPrefix = report && deptReports ? getReportPrefix(report as any, deptReports as any) : '';

  const adminInfo = (() => { try { return JSON.parse(localStorage.getItem("admin") || "{}"); } catch { return {}; } })();
  const canChangeKind = adminInfo?.userCode !== 'VEW';

  // Admin correction: Main ↔ Supplementary
  const changeKind = useMutation({
    mutationFn: async (reportKind: 'main' | 'supplementary') => {
      const res = await apiRequest("PATCH", `/api/admin/attendance/${reportId}/report-kind`, { reportKind });
      return res.json();
    },
    onSuccess: (_data, reportKind) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/attendance/${reportId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${report?.departmentId}/attendance`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
      toast({ title: "Report updated", description: `Report marked as ${reportKind === 'main' ? 'Main' : 'Supplementary'} Attendance Report.` });
    },
    onError: (error: any) => {
      toast({ title: "Could not change report type", description: error?.message || "Failed", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <div className="no-print">
        <AdminHeader />
      </div>
      <div className="px-6 flex-1">
        <ReportDetailsView
          reportId={reportId}
          onClose={() => window.history.back()}
          extraActions={canChangeKind && report && deptReports ? (
            <Button
              variant="outline"
              className="print:hidden border-purple-300 text-purple-800 hover:bg-purple-50"
              disabled={changeKind.isPending}
              title="Correct whether this is the Main or a Supplementary attendance report of the month"
              onClick={() => changeKind.mutate(reportPrefix === 'Supplementary ' ? 'main' : 'supplementary')}
            >
              {reportPrefix === 'Supplementary ' ? 'Mark as Main Report' : 'Mark as Supplementary'}
            </Button>
          ) : null}
        />
      </div>
    </div>
  );
}
