// Salary section (admin) view of Reporting Employees — employees who report at a
// host department (e.g. Admin Non Teaching) without being transferred there.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2, AlertTriangle, Search } from "lucide-react";

export interface AdminReportingRecord {
  id: number;
  employeeId: number;
  hostDepartmentName: string;
  parentDepartmentName: string;
  currentDepartmentName: string | null;
  fromDate: string;
  toDate: string | null;
  orderNo: string | null;
  orderDate: string | null;
  remarks: string | null;
  status: string;
  closeReason: string | null;
  needsClose: string | null;
  employee: { epid: string; name: string; designation: string; salaryRegisterNo?: string };
}

const fmt = (iso?: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${(y || "").slice(-2)}`;
};

const REASONS: Record<string, string> = {
  joined_other_dept: "Joined another dept",
  transfer_cancelled: "Transfer cancelled",
  disabled: "Retired / resigned",
  other: "Other",
};

export function useAdminReportingEmployees() {
  return useQuery<AdminReportingRecord[]>({
    queryKey: ["/api/admin/reporting-employees?status=all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/reporting-employees?status=all");
      return res.json();
    },
    refetchInterval: 120000,
  });
}

export function ReportingEmployeesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: records = [], isLoading } = useAdminReportingEmployees();
  const [view, setView] = useState<string>("active");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return records
      .filter((r) => (view === "all" ? true : view === "attention" ? !!r.needsClose : r.status === view))
      .filter((r) => !s ||
        r.employee?.epid?.toLowerCase().includes(s) ||
        r.employee?.name?.toLowerCase().includes(s) ||
        r.parentDepartmentName?.toLowerCase().includes(s) ||
        r.hostDepartmentName?.toLowerCase().includes(s));
  }, [records, view, q]);

  const count = (v: string) => records.filter((r) => (v === "attention" ? !!r.needsClose : r.status === v)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reporting Employees</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Employees reporting at a department (e.g. Admin Non Teaching) without transfer. Their attendance comes in that department's
            separate "Reporting Employees" report.
          </p>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)}>
            <ToggleGroupItem value="active" className="data-[state=on]:bg-amber-100 data-[state=on]:text-amber-800">Reporting ({count("active")})</ToggleGroupItem>
            <ToggleGroupItem value="attention" className="data-[state=on]:bg-red-100 data-[state=on]:text-red-800">Close pending ({count("attention")})</ToggleGroupItem>
            <ToggleGroupItem value="closed" className="data-[state=on]:bg-slate-200">Relieved ({count("closed")})</ToggleGroupItem>
            <ToggleGroupItem value="all">All ({records.length})</ToggleGroupItem>
          </ToggleGroup>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="EPID, name or department" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div className="overflow-auto flex-grow rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EPID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Parent Department</TableHead>
                <TableHead>Reporting At</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Relieved On</TableHead>
                <TableHead>Order No.</TableHead>
                <TableHead>Reg. No.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No records</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.employee?.epid}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.employee?.name}</div>
                    {r.needsClose && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-red-700">
                        <AlertTriangle className="h-3 w-3" /> {r.needsClose} — reporting not closed yet
                      </div>
                    )}
                    {r.remarks && <div className="text-xs text-muted-foreground mt-0.5">{r.remarks}</div>}
                  </TableCell>
                  <TableCell>{r.employee?.designation}</TableCell>
                  <TableCell>{r.parentDepartmentName}</TableCell>
                  <TableCell>{r.hostDepartmentName}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmt(r.fromDate)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.toDate ? (
                      <>
                        {fmt(r.toDate)}
                        {r.closeReason && <div className="text-xs text-muted-foreground">{REASONS[r.closeReason] || r.closeReason}</div>}
                      </>
                    ) : (
                      <span className="inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">Reporting</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{r.orderNo || "-"}{r.orderDate ? ` dt. ${fmt(r.orderDate)}` : ""}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.employee?.salaryRegisterNo || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
