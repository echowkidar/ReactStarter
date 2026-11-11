// Claim forms received by the Salary Section.
// A form appears here only after its department uploaded the signed scan with the
// dispatch number and date. Each dealing assistant acts on their own employees' forms.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AdminHeader from "@/components/layout/admin-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Check, CheckCheck, ExternalLink, Loader2, Printer, Undo2, X } from "lucide-react";
import { getAdminAccess } from "@/lib/admin-access";
import { ClaimStatusBadge, EVENT_LABELS } from "@/pages/claim-forms";
import {
  CLAIM_FORM_DEFS, CLAIM_FORM_TYPES, CLAIM_STATUS_LABELS, HRA_OPTIONS, formatClaimDate, localToday,
  type ClaimForm, type ClaimStatus,
} from "@shared/claimForms";

const LIST_KEY = ["/api/admin/claim-forms"];
const SETTINGS_KEY = ["/api/admin/claim-forms/settings"];
const STATUS_FILTERS: ClaimStatus[] = ["sent", "accepted", "returned_department", "processed", "rejected"];
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

function ownCode(): string {
  try {
    const admin = JSON.parse(localStorage.getItem("admin") || "{}");
    const code = String(admin.userCode || "").toUpperCase();
    return admin.role === "salary" && code && code !== "ALL" && code !== "VEW" ? code : "";
  } catch {
    return "";
  }
}

export default function AdminClaimForms() {
  const { toast } = useToast();
  const access = getAdminAccess();
  const [status, setStatus] = useState<string>("sent");
  const [formType, setFormType] = useState<string>("all");
  const [assistant, setAssistant] = useState<string>(ownCode() || "all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: claims = [], isLoading } = useQuery<ClaimForm[]>({
    queryKey: LIST_KEY,
    queryFn: async () => (await apiRequest("GET", LIST_KEY[0])).json(),
    refetchInterval: 60_000,
  });
  const { data: settings } = useQuery<{ enabled: boolean }>({
    queryKey: SETTINGS_KEY,
    queryFn: async () => (await apiRequest("GET", SETTINGS_KEY[0])).json(),
  });

  const assistants = useMemo(
    () => Array.from(new Set(claims.map((c) => c.currentDealingAssistant || "").filter(Boolean))).sort(),
    [claims]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return claims.filter((c) =>
      (status === "all" || c.status === status) &&
      (formType === "all" || c.formType === formType) &&
      (assistant === "all" || (assistant === "none" ? !c.currentDealingAssistant : c.currentDealingAssistant === assistant)) &&
      (!q || `${c.refNo} ${c.snapshot.name} ${c.epid} ${c.currentDepartmentName || ""} ${c.dispatchNo || ""}`.toLowerCase().includes(q)));
  }, [claims, status, formType, assistant, search]);

  const count = (s: ClaimStatus) => claims.filter((c) => c.status === s && (assistant === "all" || c.currentDealingAssistant === assistant)).length;

  const setOpen = async (enabled: boolean) => {
    try {
      await apiRequest("POST", SETTINGS_KEY[0], { enabled });
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast({ title: enabled ? "Forms are now open for employees" : "Forms are now closed for employees" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[260px]">
            <h1 className="text-2xl font-semibold">Claim Forms</h1>
            <p className="text-sm text-slate-600">NPA and HRA forms, signed and uploaded by the departments.</p>
          </div>
          {settings && (
            <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
              <Switch checked={settings.enabled} disabled={!access.settings} onCheckedChange={setOpen} aria-label="Forms open for employees" />
              <span>{settings.enabled ? "Open for employees" : "Closed for employees"}</span>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{CLAIM_STATUS_LABELS[s]} ({count(s)})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Form</Label>
            <Select value={formType} onValueChange={setFormType}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {CLAIM_FORM_TYPES.map((t) => <SelectItem key={t} value={t}>{CLAIM_FORM_DEFS[t].shortTitle}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dealing assistant</Label>
            <Select value={assistant} onValueChange={setAssistant}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {Array.from(new Set([...assistants, ...(ownCode() ? [ownCode()] : [])])).sort().map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                <SelectItem value="none">Not assigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, department, reference, D. No." className="w-80 ml-auto" aria-label="Search claim forms" />
        </div>

        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>D. Asst.</TableHead>
                <TableHead>With effect from</TableHead>
                <TableHead>Dispatch</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></TableCell></TableRow>}
              {!isLoading && shown.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-500">No forms match these filters.</TableCell></TableRow>}
              {shown.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setOpenId(c.id); }}>
                  <TableCell className="font-mono text-xs">{c.refNo}</TableCell>
                  <TableCell>{CLAIM_FORM_DEFS[c.formType]?.shortTitle}</TableCell>
                  <TableCell><span className="font-medium">{c.snapshot.name}</span><span className="text-xs text-slate-500 block">ID {c.epid} · {c.snapshot.designation}</span></TableCell>
                  <TableCell>{c.currentDepartmentName || c.snapshot.departmentName}</TableCell>
                  <TableCell>{c.currentDealingAssistant || "—"}</TableCell>
                  <TableCell>{formatClaimDate(c.data.wefDate)}</TableCell>
                  <TableCell className="text-xs">{c.dispatchNo} / {formatClaimDate(c.dispatchDate)}</TableCell>
                  <TableCell className="text-xs">{dateTime(c.sentAt)}</TableCell>
                  <TableCell><ClaimStatusBadge status={c.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      {openId !== null && (
        <AdminClaimDialog claimId={openId} onClose={() => setOpenId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: LIST_KEY })} />
      )}
    </div>
  );
}

type Detail = ClaimForm & { mayDecide: boolean };

function AdminClaimDialog({ claimId, onClose, onChanged }: { claimId: number; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const base = `/api/admin/claim-forms/${claimId}`;
  const { data: claim, refetch } = useQuery<Detail>({
    queryKey: [base],
    queryFn: async () => (await apiRequest("GET", base)).json(),
  });
  const [mode, setMode] = useState<"view" | "return" | "reject" | "process">("view");
  const [reason, setReason] = useState("");
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (path: string, body: unknown, message: string) => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("POST", `${base}/${path}`, body ?? {});
      toast({ title: message });
      setMode("view");
      setReason("");
      await refetch();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const files = (claim?.files || []).filter((f) => f.isCurrent);
  const signed = files.find((f) => f.kind === "signed_form");
  const ai = claim?.aiCheck;
  const canAct = !!claim?.mayDecide && ["sent", "accepted"].includes(claim.status);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            {claim ? CLAIM_FORM_DEFS[claim.formType].title : "Claim form"}
            {claim && <ClaimStatusBadge status={claim.status} />}
          </DialogTitle>
        </DialogHeader>
        {!claim ? <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div> : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 text-sm">
            <div className="space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded border bg-slate-50 px-3 py-2">
                <dt className="text-slate-500">Reference</dt><dd className="font-mono">{claim.refNo} (print R{claim.revision})</dd>
                <dt className="text-slate-500">Name</dt><dd className="font-medium">{claim.snapshot.name}</dd>
                <dt className="text-slate-500">ID No.</dt><dd>{claim.epid}</dd>
                <dt className="text-slate-500">Designation</dt><dd>{claim.snapshot.designation}</dd>
                <dt className="text-slate-500">Department</dt><dd>{claim.snapshot.departmentName}</dd>
                <dt className="text-slate-500">Register No.</dt><dd>{claim.snapshot.salaryRegisterNo || "—"}</dd>
                <dt className="text-slate-500">Dealing assistant</dt><dd>{claim.currentDealingAssistant || "Not assigned"}</dd>
                <dt className="text-slate-500">With effect from</dt><dd className="font-medium">{formatClaimDate(claim.data.wefDate)}</dd>
                {claim.formType === "hra" && <><dt className="text-slate-500">Certified</dt><dd>{HRA_OPTIONS[claim.data.option as keyof typeof HRA_OPTIONS]}</dd></>}
                <dt className="text-slate-500">Dispatch</dt><dd>{claim.dispatchNo}, dated {formatClaimDate(claim.dispatchDate)}</dd>
                {claim.processedMonth && <><dt className="text-slate-500">Paybill month</dt><dd>{claim.processedMonth}</dd></>}
              </dl>

              {ai && (
                <div className="rounded border px-3 py-2">
                  <p className="font-medium">Automatic check of the scan</p>
                  {!ai.configured ? <p className="text-slate-600">The checking service is not set up; the scan was not checked.</p> : (
                    <ul className="text-slate-700 mt-1 space-y-0.5">
                      <li>Reference on the scan: {ai.refFound === true ? "matched" : ai.refFound === false ? "could not be read (department confirmed)" : "not checked"}</li>
                      <li>Dispatch number written: {ai.dispatchNoFound === true ? "yes" : ai.dispatchNoFound === false ? "not found" : "not checked"}</li>
                      <li>Dispatch date written: {ai.dispatchDateFound === true ? "yes" : ai.dispatchDateFound === false ? "not found" : "not checked"}</li>
                      {ai.message && <li>{ai.message}</li>}
                    </ul>
                  )}
                </div>
              )}

              {["returned_department", "rejected"].includes(claim.status) && claim.returnReason && (
                <p className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900">
                  {claim.status === "rejected" ? "Rejected" : "Returned to department"} by {claim.returnedBy}: {claim.returnReason}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><a href={`${base}/pdf`} target="_blank" rel="noopener"><Printer className="h-4 w-4 mr-1" /> Form as filled</a></Button>
                {files.map((f) => (
                  <Button key={f.id} asChild variant="outline" size="sm">
                    <a href={f.fileUrl} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4 mr-1" /> {f.kind === "undertaking" ? "Signed undertaking" : "Signed form"}</a>
                  </Button>
                ))}
              </div>

              {canAct && mode === "view" && (
                <div className="flex flex-wrap gap-2">
                  {claim.status === "sent" && <Button size="sm" disabled={busy} onClick={() => act("accept", null, "Form accepted")}><Check className="h-4 w-4 mr-1" /> Accept</Button>}
                  <Button size="sm" variant={claim.status === "accepted" ? "default" : "outline"} onClick={() => setMode("process")}><CheckCheck className="h-4 w-4 mr-1" /> Mark as processed</Button>
                  <Button size="sm" variant="outline" onClick={() => setMode("return")}><Undo2 className="h-4 w-4 mr-1" /> Return to department</Button>
                  <Button size="sm" variant="outline" className="text-red-700" onClick={() => setMode("reject")}><X className="h-4 w-4 mr-1" /> Reject</Button>
                </div>
              )}
              {!claim.mayDecide && ["sent", "accepted"].includes(claim.status) && (
                <p className="text-slate-500">Only the dealing assistant of this employee (or a super admin) can act on this form.</p>
              )}

              {(mode === "return" || mode === "reject") && (
                <div className="rounded border p-3 space-y-3">
                  <Label htmlFor="admin-reason">{mode === "return" ? "Objection (the department will see this)" : "Reason for rejection"}</Label>
                  <Textarea id="admin-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
                  {error && <p role="alert" className="text-red-700">{error}</p>}
                  <div className="flex gap-2">
                    <Button disabled={busy || reason.trim().length < 5}
                      onClick={() => act(mode, { reason }, mode === "return" ? "Form returned to the department" : "Form rejected")}>
                      {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {mode === "return" ? "Return to department" : "Reject"}
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => setMode("view")}>Cancel</Button>
                  </div>
                </div>
              )}
              {mode === "process" && (
                <div className="rounded border p-3 space-y-3">
                  <Label htmlFor="month">Paybill month in which it was given effect</Label>
                  <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
                  <p className="text-slate-600">The payroll itself is updated by you in the payroll system; this only records it here.</p>
                  {error && <p role="alert" className="text-red-700">{error}</p>}
                  <div className="flex gap-2">
                    <Button disabled={busy || !month} onClick={() => act("process", { month }, "Marked as processed")}>
                      {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Mark as processed
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => setMode("view")}>Cancel</Button>
                  </div>
                </div>
              )}
              {mode === "view" && error && <p role="alert" className="text-red-700">{error}</p>}

              <div>
                <p className="font-medium mb-1">History</p>
                <ul className="text-xs text-slate-600 space-y-0.5">
                  {(claim.events || []).map((e) => (
                    <li key={e.id}>{dateTime(e.createdAt)} — {EVENT_LABELS[e.action] || e.action} · {e.actorName}{e.remarks ? ` · ${e.remarks}` : ""}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="min-h-[60vh] rounded border bg-slate-100 overflow-hidden">
              {!signed ? <p className="p-4 text-slate-500">No signed form on record.</p>
                : /\.pdf$/i.test(signed.fileUrl)
                  ? <object data={signed.fileUrl} type="application/pdf" className="w-full h-[75vh]" aria-label="Signed form"><p className="p-4">The signed form cannot be shown here. <a className="underline" href={signed.fileUrl} target="_blank" rel="noopener">Open it</a>.</p></object>
                  : <img src={signed.fileUrl} alt="Signed form" className="w-full" />}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
