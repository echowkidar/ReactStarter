// Reporting Employees panel — shown on the Employees page of a host department
// (e.g. Admin Non Teaching) where `allowReportingEmployees` is enabled.
// These employees are NOT on the department's staff; they only report here
// until they join their new department.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmployeeHistoryModal } from "@/components/modals/employee-history-modal";
import { History, Pencil, LogOut, Trash2, Loader2, AlertTriangle } from "lucide-react";

export interface ReportingRecord {
  id: number;
  employeeId: number;
  hostDepartmentId: number;
  parentDepartmentId: number;
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
  employee: { id: number; epid: string; name: string; designation: string; payLevel?: string };
}

const fmt = (iso?: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${(y || "").slice(-2)}`;
};

const CLOSE_REASONS: Record<string, string> = {
  joined_other_dept: "Joined another department",
  transfer_cancelled: "Transfer cancelled / returned to parent department",
  disabled: "Retired / resigned / disabled",
  other: "Other",
};

export function ReportingEmployeesPanel({ departmentId }: { departmentId: number }) {
  const { toast } = useToast();
  const [statusView, setStatusView] = useState<string>("active");
  const listKey = [`/api/departments/${departmentId}/reporting-employees?status=${statusView}`];

  const { data: records = [], isLoading } = useQuery<ReportingRecord[]>({
    queryKey: listKey,
    enabled: !!departmentId,
  });

  const [editing, setEditing] = useState<ReportingRecord | null>(null);
  const [editForm, setEditForm] = useState({ fromDate: "", orderNo: "", orderDate: "", remarks: "" });
  const [closing, setClosing] = useState<ReportingRecord | null>(null);
  const [closeForm, setCloseForm] = useState({ toDate: "", closeReason: "" });
  const [historyFor, setHistoryFor] = useState<ReportingRecord | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/api/departments/${departmentId}/reporting-employees`) });
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/departments/${departmentId}/reporting-employees/${editing!.id}`, editForm);
      return res.json();
    },
    onSuccess: () => { toast({ title: "Updated" }); setEditing(null); refresh(); },
    onError: (e) => toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/departments/${departmentId}/reporting-employees/${closing!.id}/close`, closeForm);
      return res.json();
    },
    onSuccess: () => { toast({ title: "Reporting closed", description: `${closing?.employee.name} relieved on ${fmt(closeForm.toDate)}` }); setClosing(null); refresh(); },
    onError: (e) => toast({ title: "Could not close", description: (e as Error).message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (r: ReportingRecord) => {
      const res = await apiRequest("DELETE", `/api/departments/${departmentId}/reporting-employees/${r.id}`);
      return res.json();
    },
    onSuccess: () => { toast({ title: "Reporting record deleted" }); refresh(); },
    onError: (e) => toast({ title: "Could not delete", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3 mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Reporting Employees</h2>
          <p className="text-sm text-muted-foreground">
            Not on your staff. Add them from Global Search; send their attendance through the separate Reporting Employees report.
          </p>
        </div>
        <ToggleGroup type="single" value={statusView} onValueChange={(v) => v && setStatusView(v)}>
          <ToggleGroupItem value="active" className="data-[state=on]:bg-amber-100 data-[state=on]:text-amber-800">Reporting</ToggleGroupItem>
          <ToggleGroupItem value="closed" className="data-[state=on]:bg-slate-200">Relieved</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>EPID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Parent Department</TableHead>
              <TableHead>Reporting From</TableHead>
              <TableHead>Relieved On</TableHead>
              <TableHead>Order No.</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin inline" /></TableCell></TableRow>
            ) : records.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground">No {statusView === "active" ? "reporting" : "relieved"} employees.</TableCell></TableRow>
            ) : records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.employee.epid}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.employee.name}</div>
                  {r.needsClose && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-red-700">
                      <AlertTriangle className="h-3 w-3" /> {r.needsClose} — please close this reporting record
                    </div>
                  )}
                </TableCell>
                <TableCell>{r.employee.designation}</TableCell>
                <TableCell>{r.parentDepartmentName}</TableCell>
                <TableCell>{fmt(r.fromDate)}</TableCell>
                <TableCell>{r.toDate ? fmt(r.toDate) : <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">Reporting</Badge>}</TableCell>
                <TableCell className="text-xs">{r.orderNo || "-"}{r.orderDate ? ` dt. ${fmt(r.orderDate)}` : ""}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" title="History" onClick={() => setHistoryFor(r)}><History className="h-4 w-4" /></Button>
                    {r.status === "active" && (
                      <>
                        <Button size="icon" variant="outline" title="Edit" onClick={() => { setEditing(r); setEditForm({ fromDate: r.fromDate, orderNo: r.orderNo || "", orderDate: r.orderDate || "", remarks: r.remarks || "" }); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-amber-700 border-amber-200" onClick={() => { setClosing(r); setCloseForm({ toDate: "", closeReason: "" }); }}>
                          <LogOut className="h-4 w-4 mr-1" /> Relieve
                        </Button>
                        <Button size="icon" variant="outline" title="Delete (only if created by mistake)" className="text-red-600"
                          onClick={() => { if (window.confirm(`Delete reporting record of ${r.employee.name}? Use this only if it was created by mistake.`)) deleteMutation.mutate(r); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Reporting Details — {editing?.employee.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Reporting Date</label>
              <Input type="date" value={editForm.fromDate} onChange={(e) => setEditForm(f => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Order / Letter No. *</label>
              <Input value={editForm.orderNo} onChange={(e) => setEditForm(f => ({ ...f, orderNo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Order / Letter Date</label>
              <Input type="date" value={editForm.orderDate} onChange={(e) => setEditForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Remarks</label>
              <Textarea value={editForm.remarks} onChange={(e) => setEditForm(f => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={editMutation.isPending || !editForm.orderNo.trim() || !editForm.fromDate} onClick={() => editMutation.mutate()}>
              {editMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close / Relieve */}
      <Dialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Relieve Reporting Employee — {closing?.employee.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Reporting since {fmt(closing?.fromDate)}. After the relieved date, your department will not be able to send this employee's attendance.
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium">Relieved On (last day of reporting) *</label>
              <Input type="date" value={closeForm.toDate} min={closing?.fromDate} onChange={(e) => setCloseForm(f => ({ ...f, toDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason *</label>
              <Select value={closeForm.closeReason} onValueChange={(v) => setCloseForm(f => ({ ...f, closeReason: v }))}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLOSE_REASONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Cancel</Button>
            <Button disabled={closeMutation.isPending || !closeForm.toDate || !closeForm.closeReason} onClick={() => closeMutation.mutate()}>
              {closeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Relieve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyFor && (
        <EmployeeHistoryModal
          isOpen={!!historyFor}
          onClose={() => setHistoryFor(null)}
          employeeId={historyFor.employeeId}
          employeeName={historyFor.employee.name}
        />
      )}
    </div>
  );
}
