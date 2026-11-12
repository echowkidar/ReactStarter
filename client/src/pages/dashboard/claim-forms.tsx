// Claim forms of the department's employees.
// An employee fills the form online and hands over the signed print. The department
// gets it signed by the Chairman / Head, writes the dispatch number and date on it and
// uploads the scan here — only then does it reach the Salary Section.
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Loader2, Printer, Undo2, Upload } from "lucide-react";
import { ClaimStatusBadge, EVENT_LABELS } from "@/pages/claim-forms";
import {
  CEA_REPEAT_REASONS, CLAIM_FORM_DEFS, CONVEYANCE_MONTH_REASONS, DEPARTMENT_ACTIONABLE, HRA_OPTIONS, PCA_CATEGORIES, SPOUSE_EMPLOYMENT, claimSummary, formatClaimDate, localToday, monthLabel,
  type CeaChild, type ClaimForm, type ClaimStatus,
} from "@shared/claimForms";

/** What an uploaded file is, in words (CEA: the school certificate / marksheet of a child) */
function fileLabel(claim: ClaimForm, kind: string): string {
  if (kind === "undertaking") return "Signed undertaking";
  const m = /^(school_certificate|marksheet)_(\d+)$/.exec(kind);
  if (m) {
    const name = (claim.data.children || [])[Number(m[2])]?.name;
    return `${m[1] === "marksheet" ? "Marksheet" : "School certificate"}${name ? ` – ${name}` : ""}`;
  }
  return "Signed form";
}

const TABS: Array<{ key: string; label: string; statuses: ClaimStatus[] }> = [
  { key: "waiting", label: "Waiting for signed form", statuses: ["submitted", "returned_department"] },
  { key: "sent", label: "Sent to Salary Section", statuses: ["sent", "accepted"] },
  { key: "done", label: "Processed", statuses: ["processed"] },
  { key: "other", label: "Returned / closed", statuses: ["returned_employee", "rejected", "cancelled"] },
];

const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function DepartmentClaimForms() {
  const department = getCurrentDepartment();
  const [tab, setTab] = useState("waiting");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const listKey = [`/api/departments/${department?.id}/claim-forms`];

  const { data: claims = [], isLoading } = useQuery<ClaimForm[]>({
    queryKey: listKey,
    queryFn: async () => (await apiRequest("GET", listKey[0])).json(),
    enabled: !!department?.id,
    refetchInterval: 60_000,
  });

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, claims.filter((c) => t.statuses.includes(c.status)).length])), [claims]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statuses = TABS.find((t) => t.key === tab)!.statuses;
    return claims.filter((c) => (q
      ? `${c.refNo} ${c.snapshot.name} ${c.epid} ${c.snapshot.designation}`.toLowerCase().includes(q)
      : statuses.includes(c.status)));
  }, [claims, tab, search]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Claim Forms</h1>
          <p className="text-sm text-slate-600">NPA, HRA, PCA, Conveyance Allowance and CEA forms filled online by your employees. After the signed form is received, upload it with the dispatch number and date.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                  <span className={`ml-2 rounded-full px-1.5 text-xs ${t.key === "waiting" && counts[t.key] ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"}`}>{counts[t.key]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID or reference (all forms)" className="w-72 ml-auto" aria-label="Search claim forms" />
        </div>

        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>For</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Dispatch</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>}
              {!isLoading && shown.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No forms here.</TableCell></TableRow>}
              {shown.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setOpenId(c.id); }}>
                  <TableCell className="font-mono text-xs">{c.refNo}</TableCell>
                  <TableCell>{CLAIM_FORM_DEFS[c.formType]?.shortTitle}</TableCell>
                  <TableCell><span className="font-medium">{c.snapshot.name}</span><span className="text-xs text-slate-500 block">ID {c.epid}</span></TableCell>
                  <TableCell>{c.snapshot.designation}</TableCell>
                  <TableCell>{claimSummary(c)}</TableCell>
                  <TableCell className="text-xs">{dateTime(c.submittedAt)}</TableCell>
                  <TableCell className="text-xs">{c.dispatchNo ? `${c.dispatchNo} / ${formatClaimDate(c.dispatchDate)}` : "—"}</TableCell>
                  <TableCell><ClaimStatusBadge status={c.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {openId !== null && department && (
        <ClaimDialog departmentId={department.id} claimId={openId} onClose={() => setOpenId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: listKey })} />
      )}
    </DashboardLayout>
  );
}

function ClaimDialog({ departmentId, claimId, onClose, onChanged }: { departmentId: number; claimId: number; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast();
  const base = `/api/departments/${departmentId}/claim-forms/${claimId}`;
  const { data: claim, refetch } = useQuery<ClaimForm>({
    queryKey: [base],
    queryFn: async () => (await apiRequest("GET", base)).json(),
  });
  const [mode, setMode] = useState<"view" | "upload" | "return">("view");
  const [dispatchNo, setDispatchNo] = useState("");
  const [dispatchDate, setDispatchDate] = useState(localToday());
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const done = async (message: string) => {
    toast({ title: message });
    setMode("view");
    setError("");
    await refetch();
    onChanged();
  };

  // The signed scan goes through the same automatic check as a signed attendance report
  const upload = async (confirmed: boolean) => {
    if (!file) { setError("Please choose the scanned signed form."); return; }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("dispatchNo", dispatchNo);
      body.append("dispatchDate", dispatchDate);
      if (confirmed) body.append("confirm", "true");
      const res = await fetch(`${base}/upload`, { method: "POST", body, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfirmText("");
        await done("Signed form sent to the Salary Section");
      } else if (data.code === "CONFIRM_NEEDED") {
        setConfirmText(data.message);
      } else {
        setConfirmText("");
        setError(data.message || "Upload failed. Please try again.");
      }
    } catch {
      setError("Upload failed. Please check the connection and try again.");
    }
    setBusy(false);
  };

  const sendBack = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("POST", `${base}/return`, { reason });
      setReason("");
      await done("Form returned to the employee");
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  const actionable = !!claim && DEPARTMENT_ACTIONABLE.includes(claim.status);
  const currentFiles = (claim?.files || []).filter((f) => f.isCurrent);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            {claim ? CLAIM_FORM_DEFS[claim.formType].title : "Claim form"}
            {claim && <ClaimStatusBadge status={claim.status} />}
          </DialogTitle>
        </DialogHeader>
        {!claim ? <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div> : (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded border bg-slate-50 px-3 py-2">
              <dt className="text-slate-500">Reference</dt><dd className="font-mono">{claim.refNo} (print R{claim.revision})</dd>
              <dt className="text-slate-500">Name</dt><dd className="font-medium">{claim.snapshot.name}</dd>
              <dt className="text-slate-500">ID No.</dt><dd>{claim.epid}</dd>
              <dt className="text-slate-500">Designation</dt><dd>{claim.snapshot.designation}</dd>
              {claim.formType === "cea" ? (
                <>
                  <dt className="text-slate-500">Session</dt><dd className="font-medium">{claim.data.session}</dd>
                  <dt className="text-slate-500">Spouse</dt>
                  <dd>{SPOUSE_EMPLOYMENT[claim.data.spouseEmployment as keyof typeof SPOUSE_EMPLOYMENT] || "—"}{claim.data.spouseName ? `, ${claim.data.spouseName}` : ""}{claim.data.spouseDetails ? ` (${claim.data.spouseDetails})` : ""}</dd>
                  {((claim.data.children || []) as CeaChild[]).map((c, i) => (
                    <div key={i} className="col-span-2 rounded border bg-white px-3 py-2 space-y-0.5">
                      <p className="font-medium">{c.name} <span className="font-normal text-slate-500">· born {formatClaimDate(c.dob)}</span></p>
                      <p>Class {c.className} · {c.schoolName}{c.schoolLocation === "outside" ? " (outside Aligarh)" : ""} · {c.result === "failed" ? "Failed" : "Passed"}</p>
                      {c.hostel && <p>Hostel: {c.hostelDistanceKm} km from residence</p>}
                      {c.disabled && <p>Disability: {c.disabilityNature}, {c.disabilityPercent}% (certificate dated {formatClaimDate(c.disabilityCertDate)})</p>}
                      {c.repeatsClass && (
                        <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                          Same class as the session before — {CEA_REPEAT_REASONS[c.repeatReason as keyof typeof CEA_REPEAT_REASONS] || "no reason given"}; marksheet uploaded
                        </p>
                      )}
                      <p className="font-medium">Amount: Rs. {Number(c.amount || 0).toLocaleString("en-IN")}</p>
                    </div>
                  ))}
                  <dt className="text-slate-500">Total Amount Claimed</dt><dd className="font-medium">Rs. {Number(claim.data.total || 0).toLocaleString("en-IN")}</dd>
                  {Number(claim.data.amountAlreadyReceived) > 0 && (
                    <>
                      <dt className="text-slate-500">Already received</dt><dd>Rs. {Number(claim.data.amountAlreadyReceived).toLocaleString("en-IN")}</dd>
                      <dt className="text-slate-500">Payable</dt><dd className="font-medium">Rs. {Number(claim.data.payable || 0).toLocaleString("en-IN")}</dd>
                    </>
                  )}
                </>
              ) : claim.formType === "pca" ? (
                <>
                  <dt className="text-slate-500">Period</dt><dd className="font-medium">{claimSummary(claim)}</dd>
                  <dt className="text-slate-500">Confirmation / probation</dt><dd>{claim.data.confirmation}</dd>
                  <dt className="text-slate-500">Date of joining</dt><dd>{formatClaimDate(claim.data.joiningDate)} ({claim.data.joiningSession})</dd>
                  {claim.data.transferFrom && <><dt className="text-slate-500">Transferred from</dt><dd>{claim.data.transferFrom}, {formatClaimDate(claim.data.transferDate)}</dd></>}
                  <dt className="text-slate-500">Against the paybill</dt><dd>{PCA_CATEGORIES[claim.data.category as keyof typeof PCA_CATEGORIES] || "—"}</dd>
                </>
              ) : claim.formType === "conveyance" ? (
                <>
                  <dt className="text-slate-500">Period</dt><dd>{claimSummary(claim)}</dd>
                  <dt className="text-slate-500">Vehicle</dt><dd>{claim.data.vehicleType}, {claim.data.vehicleRegNo}</dd>
                  <dt className="text-slate-500">Address</dt><dd>{claim.data.address}</dd>
                  <dt className="text-slate-500">Months</dt>
                  <dd>{(claim.data.months || []).map((m: any) => `${monthLabel(m.month).split(" ")[0]}: ${m.amount > 0 ? `${m.visits} visits` : CONVEYANCE_MONTH_REASONS[m.reason as keyof typeof CONVEYANCE_MONTH_REASONS] || "not claimed"}`).join(" · ")}</dd>
                  <dt className="text-slate-500">Amount of Claim</dt><dd className="font-medium">Rs. {Number(claim.data.amount || 0).toLocaleString("en-IN")}</dd>
                </>
              ) : (
                <><dt className="text-slate-500">With effect from</dt><dd>{formatClaimDate(claim.data.wefDate)}</dd></>
              )}
              {claim.formType === "hra" && <><dt className="text-slate-500">Certified</dt><dd>{HRA_OPTIONS[claim.data.option as keyof typeof HRA_OPTIONS]}</dd></>}
              {claim.dispatchNo && <><dt className="text-slate-500">Dispatch</dt><dd>{claim.dispatchNo}, dated {formatClaimDate(claim.dispatchDate)}</dd></>}
            </dl>

            {claim.status === "returned_department" && (
              <div role="alert" className="rounded border border-orange-200 bg-orange-50 px-3 py-2 text-orange-900">
                <p className="font-medium">Returned by the Salary Section ({claim.returnedBy})</p>
                <p>Objection: {claim.returnReason}</p>
                <p className="mt-1">Upload the corrected signed form again, or return the form to the employee if the form itself must be changed.</p>
              </div>
            )}
            {["returned_employee", "rejected"].includes(claim.status) && claim.returnReason && (
              <p className="rounded border bg-slate-50 px-3 py-2">Reason: {claim.returnReason}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`${base}/pdf`} target="_blank" rel="noopener"><Printer className="h-4 w-4 mr-1" /> Print form</a>
              </Button>
              {currentFiles.map((f) => (
                <Button key={f.id} asChild variant="outline" size="sm">
                  <a href={f.fileUrl} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4 mr-1" /> {fileLabel(claim, f.kind)}</a>
                </Button>
              ))}
              {actionable && mode === "view" && (
                <>
                  <Button size="sm" onClick={() => { setMode("upload"); setError(""); }}><Upload className="h-4 w-4 mr-1" /> Upload signed form</Button>
                  <Button size="sm" variant="outline" onClick={() => { setMode("return"); setError(""); }}><Undo2 className="h-4 w-4 mr-1" /> Return to employee</Button>
                </>
              )}
            </div>

            {mode === "upload" && (
              <div className="rounded border p-3 space-y-3">
                <p className="font-medium">Upload the signed form</p>
                <p className="text-slate-600">The form must be signed by the employee and by the Chairman / Head (with seal), with the dispatch number and date written on it{claim.formType === "pca" ? " (D.No. and Dated at the top), and countersigned by the CMS / CMO" : " (in the box at the foot of the page)"}.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="dno">Dispatch number (D. No.)</Label>
                    <Input id="dno" value={dispatchNo} onChange={(e) => setDispatchNo(e.target.value)} maxLength={60} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ddate">Dispatch date (D. Date)</Label>
                    <Input id="ddate" type="date" value={dispatchDate} max={localToday()} onChange={(e) => setDispatchDate(e.target.value)} />
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); setConfirmText(""); setError(""); }} />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Choose scan</Button>
                  <span className="text-slate-600 truncate">{file ? file.name : "PDF, JPG or PNG, up to 10 MB"}</span>
                </div>
                {confirmText && (
                  <div role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 space-y-2">
                    <p>{confirmText}</p>
                    <Button size="sm" disabled={busy} onClick={() => upload(true)}>Yes, this is the correct form — upload</Button>
                  </div>
                )}
                {error && <p role="alert" className="text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <Button disabled={busy || !file || !dispatchNo.trim() || !dispatchDate} onClick={() => upload(false)}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Check and send to Salary Section
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setMode("view")}>Cancel</Button>
                </div>
              </div>
            )}

            {mode === "return" && (
              <div className="rounded border p-3 space-y-3">
                <Label htmlFor="reason">Why is the form returned to the employee?</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
                <p className="text-slate-600">The employee will correct the form and print and sign it again.</p>
                {error && <p role="alert" className="text-red-700">{error}</p>}
                <div className="flex gap-2">
                  <Button disabled={busy || reason.trim().length < 5} onClick={sendBack}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Return to employee
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setMode("view")}>Cancel</Button>
                </div>
              </div>
            )}

            <div>
              <p className="font-medium mb-1">History</p>
              <ul className="text-xs text-slate-600 space-y-0.5">
                {(claim.events || []).map((e) => (
                  <li key={e.id}>{dateTime(e.createdAt)} — {EVENT_LABELS[e.action] || e.action} · {e.actorName}{e.remarks ? ` · ${e.remarks}` : ""}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
