// E-Files: paperless files of a department — noting, movement, correspondence (dak),
// Draft for Approval → issued as outward letter, closing and the record room.
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCurrentDepartment, getCurrentStaff, isDeptSupervisor } from "@/lib/auth";
import Sidebar from "@/components/layout/sidebar";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  FolderOpen, Plus, Loader2, ArrowLeft, Send, FileText, Paperclip, PenLine, CheckCircle2, Undo2,
  Lock, Archive, Clock, Search, X, Building2, Printer,
} from "lucide-react";

const CATEGORY: Record<string, string> = {
  A: "A — keep permanently (microfilm)",
  B: "B — keep permanently",
  C: "C — keep 10 years",
  D: "D — keep 5 years",
};
const STATUS_TABS: [string, string][] = [
  ["open", "Open"], ["closed", "Closed"], ["due", "Due for review"], ["archived", "Record room"], ["weeded", "Weeded"], ["all", "All"],
];
const MODES: Record<string, string> = {
  electronic: "Electronic only", by_hand: "By hand", peon_book: "Peon book",
  registered_post: "Registered post", speed_post: "Speed post", courier: "Courier", email: "E-mail",
};
const DRAFT_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800",
  returned: "bg-red-100 text-red-700", issued: "bg-blue-100 text-blue-800",
};
const ENTRY_LABEL: Record<string, string> = {
  opened: "File opened", movement: "Sent", approval: "Approved", returned: "Returned",
  issued: "Issued", closed: "Closed", reopened: "Reopened", record: "Record room",
};

export default function EFiles() {
  const department = getCurrentDepartment();
  const staff = getCurrentStaff();
  const supervisor = isDeptSupervisor();
  const { toast } = useToast();
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [fileId, setFileId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newFile, setNewFile] = useState({ fileNumber: "", subject: "", category: "C" });

  const listKey = `/api/departments/${department?.id}/efiles?status=${tab}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`;
  const { data: files = [], isLoading } = useQuery<any[]>({ queryKey: [listKey], enabled: !!department?.id && !fileId });

  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/departments/${department!.id}/efiles`, newFile)).json(),
    onSuccess: (r: any) => {
      toast({ title: "File opened" });
      setShowNew(false);
      setNewFile({ fileNumber: "", subject: "", category: "C" });
      queryClient.invalidateQueries({ predicate: (qq) => String(qq.queryKey[0]).includes("/efiles") });
      setFileId(r.id);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (!department) return null;

  return (
    <div className="flex h-screen">
      <Sidebar className="hidden md:flex md:w-64 md:flex-col border-r" />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-4 pt-16 md:p-6 max-w-7xl mx-auto">
          {fileId ? (
            <FileView departmentId={department.id} fileId={fileId} supervisor={supervisor} myStaffId={staff?.id ?? null}
              onBack={() => { setFileId(null); queryClient.invalidateQueries({ queryKey: [listKey] }); }} />
          ) : (
            <>
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <FolderOpen className="h-6 w-6 text-amber-600" /> E-Files
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">Noting, file movement, correspondence and approved letters — without paper.</p>
                </div>
                <Button onClick={() => setShowNew(true)} className="bg-amber-600 hover:bg-amber-700">
                  <Plus className="h-4 w-4 mr-2" /> Open New File
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                {STATUS_TABS.map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setTab(v)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${tab === v ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                    {l}
                  </button>
                ))}
                <div className="relative ml-auto w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input className="pl-9 h-9" placeholder="File no. or subject" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              </div>

              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  {isLoading ? (
                    <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>
                  ) : files.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 text-sm">
                      {tab === "due" ? "No closed file is due for review." : "No files here yet."}
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 border-b text-left text-gray-600">
                        <th className="px-4 py-2.5">File No.</th><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5">Cat.</th>
                        <th className="px-4 py-2.5">With</th><th className="px-4 py-2.5">Notes / Papers</th><th className="px-4 py-2.5">Last activity</th>
                        <th className="px-4 py-2.5">Status</th></tr></thead>
                      <tbody>
                        {files.map((f) => (
                          <tr key={f.id} className="border-b last:border-b-0 hover:bg-amber-50/50 cursor-pointer" onClick={() => setFileId(f.id)}>
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-amber-800">{f.fileNumber}</td>
                            <td className="px-4 py-2.5"><div className="truncate max-w-[380px]" title={f.subject}>{f.subject}</div>
                              {f.openDrafts > 0 && <span className="text-[10px] text-amber-700">{f.openDrafts} draft(s) open</span>}</td>
                            <td className="px-4 py-2.5">{f.category}</td>
                            <td className="px-4 py-2.5 text-xs">{f.holderName || "-"}</td>
                            <td className="px-4 py-2.5 text-xs">{f.notes} / {f.papers}</td>
                            <td className="px-4 py-2.5 text-xs">{f.lastActivity ? format(new Date(f.lastActivity), "dd MMM yyyy") : "-"}</td>
                            <td className="px-4 py-2.5 text-xs capitalize">
                              {f.status}{f.retentionUntil && f.status !== "open" && <div className="text-[10px] text-gray-500">keep till {f.retentionUntil}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Open New File</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">File number *</Label>
                <Input value={newFile.fileNumber} onChange={(e) => setNewFile((f) => ({ ...f, fileNumber: e.target.value }))} placeholder="e.g. SS/Estt/12/2026" />
              </div>
              <div>
                <Label className="text-xs">Subject *</Label>
                <Input value={newFile.subject} onChange={(e) => setNewFile((f) => ({ ...f, subject: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Record category</Label>
                <Select value={newFile.category} onValueChange={(v) => setNewFile((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CATEGORY).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={!newFile.fileNumber.trim() || !newFile.subject.trim() || create.isPending} onClick={() => create.mutate()}>
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Open File
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

// ─── One file ────────────────────────────────────────────────────────────
function FileView({ departmentId, fileId, supervisor, myStaffId, onBack }: {
  departmentId: number; fileId: number; supervisor: boolean; myStaffId: number | null; onBack: () => void;
}) {
  const { toast } = useToast();
  const base = `/api/departments/${departmentId}/efiles/${fileId}`;
  const { data: file, isLoading } = useQuery<any>({ queryKey: [base] });
  const { data: staffLogins = [] } = useQuery<any[]>({ queryKey: [`/api/departments/${departmentId}/staff?active=1`] });
  const { data: departments = [] } = useQuery<any[]>({ queryKey: ["/api/departments?registeredOnly=true"] });
  const { data: inbox = [] } = useQuery<any[]>({ queryKey: [`/api/dispatch/inbox/${departmentId}`, "all"],
    queryFn: async () => (await fetch(`/api/dispatch/inbox/${departmentId}`, { credentials: "include" })).json() });

  const [note, setNote] = useState("");
  const [attachNo, setAttachNo] = useState("");
  const [move, setMove] = useState<{ open: boolean; to: string; remarks: string }>({ open: false, to: "", remarks: "" });
  const [draft, setDraft] = useState<{ open: boolean; id: number | null; subject: string; body: string; recipients: any[]; replyTo: string }>(
    { open: false, id: null, subject: "", body: "", recipients: [], replyTo: "" });
  const [decision, setDecision] = useState<{ id: number | null; kind: "approve" | "return"; remarks: string }>({ id: null, kind: "approve", remarks: "" });
  const [issue, setIssue] = useState<{ id: number | null; mode: string; trackingNo: string; postage: string; sendEmail: boolean }>(
    { id: null, mode: "electronic", trackingNo: "", postage: "", sendEmail: true });
  const [closeBox, setCloseBox] = useState<{ open: boolean; kind: "close" | "reopen" | "archive" | "extend" | "weed"; remarks: string; years: string }>(
    { open: false, kind: "close", remarks: "", years: "2" });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [base] });
    queryClient.invalidateQueries({ predicate: (qq) => String(qq.queryKey[0]).includes("/efiles") });
  };
  const act = useMutation({
    mutationFn: async (a: { method: string; url: string; body?: any }) => (await apiRequest(a.method, a.url, a.body ?? {})).json(),
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const run = (method: string, url: string, body: any, done: string, after?: (r: any) => void) =>
    act.mutate({ method, url, body }, { onSuccess: (r) => { toast({ title: done }); refresh(); after?.(r); } });

  const notesSide = useMemo(() => (file?.entries || []).filter((e: any) => e.kind !== "correspondence" && e.kind !== "draft"), [file]);
  const papers = useMemo(() => (file?.entries || []).filter((e: any) => e.kind === "correspondence"), [file]);
  const drafts = useMemo(() => (file?.entries || []).filter((e: any) => e.kind === "draft").reverse(), [file]);
  const replyCandidates = inbox.filter((d: any) => d.inwardNumber && d.receivedAt && !["disposed", "forwarded", "returned", "withdrawn", "cancelled"].includes(d.recipientStatus));
  const isOpen = file?.status === "open";

  if (isLoading || !file) return <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>;

  const printNoting = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(file.fileNumber)}</title>
      <style>body{font-family:"Times New Roman",serif;font-size:12pt;margin:20mm}h1{font-size:14pt;text-align:center}
      .e{margin:10px 0;border-bottom:1px dotted #999;padding-bottom:6px}.m{color:#555;font-size:10pt}</style></head><body>
      <h1>NOTING — File No. ${esc(file.fileNumber)}</h1><p><b>Subject:</b> ${esc(file.subject)}</p>
      ${notesSide.map((e: any) => `<div class="e">${e.paraNo ? `<b>${e.paraNo}.</b> ` : `<i>${esc(ENTRY_LABEL[e.kind] || e.kind)}${e.toName ? ` to ${esc(e.toName)}` : ""}:</i> `}${esc(e.body || "").replace(/\n/g, "<br/>")}
        <div class="m">${esc(e.byName)} · ${new Date(e.createdAt).toLocaleString("en-IN")}</div></div>`).join("")}
      <script>setTimeout(function(){window.print()},300)</script></body></html>`);
    w.document.close();
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-3"><ArrowLeft className="h-4 w-4 mr-1" /> All files</Button>
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-sm font-bold text-amber-800">{file.fileNumber}</div>
            <div className="text-lg font-semibold">{file.subject}</div>
            <div className="text-xs text-gray-500 mt-1">
              Category {file.category} · <span className="capitalize">{file.status}</span>
              {file.holderName && <> · with <strong>{file.holderName}</strong></>}
              {file.retentionUntil && <> · keep till {file.retentionUntil}</>}
              {file.recordRemarks && <> · {file.recordRemarks}</>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={printNoting}><Printer className="h-4 w-4 mr-1" /> Print noting</Button>
            {isOpen && <Button size="sm" variant="outline" onClick={() => setMove({ open: true, to: "", remarks: "" })}><Send className="h-4 w-4 mr-1" /> Send / put up</Button>}
            {isOpen && supervisor && <Button size="sm" variant="outline" onClick={() => setCloseBox({ open: true, kind: "close", remarks: "", years: "2" })}><Lock className="h-4 w-4 mr-1" /> Close file</Button>}
            {!isOpen && file.status !== "weeded" && supervisor && (
              <>
                <Button size="sm" variant="outline" onClick={() => setCloseBox({ open: true, kind: "reopen", remarks: "", years: "2" })}>Reopen</Button>
                {file.status === "closed" && <Button size="sm" variant="outline" onClick={() => setCloseBox({ open: true, kind: "archive", remarks: "", years: "2" })}><Archive className="h-4 w-4 mr-1" /> To record room</Button>}
                {file.retentionUntil && <Button size="sm" variant="outline" onClick={() => setCloseBox({ open: true, kind: "extend", remarks: "", years: "2" })}><Clock className="h-4 w-4 mr-1" /> Keep longer</Button>}
                {file.retentionUntil && file.retentionUntil <= format(new Date(), "yyyy-MM-dd") && (
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => setCloseBox({ open: true, kind: "weed", remarks: "", years: "2" })}>Weed out</Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Noting side */}
        <Card>
          <CardContent className="p-4">
            <p className="font-semibold text-sm mb-3 flex items-center gap-1.5"><PenLine className="h-4 w-4 text-amber-600" /> Noting</p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {notesSide.map((e: any) => (
                <div key={e.id} className={`rounded-lg p-2.5 text-sm ${e.kind === "note" ? "bg-green-50 border border-green-100" : "bg-gray-50 text-gray-600"}`}>
                  {e.kind === "note" ? (
                    <div className="whitespace-pre-wrap">{e.paraNo ? <strong className="mr-1">{e.paraNo}.</strong> : null}{e.body}</div>
                  ) : (
                    <div className="text-xs">{e.kind === "opened" ? <strong>{e.body}</strong> : <><strong>{ENTRY_LABEL[e.kind] || e.kind}</strong>{e.toName ? ` to ${e.toName}` : ""}{e.body ? ` — ${e.body}` : ""}</>}</div>
                  )}
                  <div className="text-[11px] text-gray-500 mt-1">{e.byName} · {format(new Date(e.createdAt), "dd MMM yyyy, HH:mm")}</div>
                </div>
              ))}
            </div>
            {isOpen && (
              <div className="mt-3 space-y-2">
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write the next para of the note…" />
                <Button size="sm" disabled={!note.trim() || act.isPending}
                  onClick={() => run("POST", `${base}/notes`, { body: note }, "Note added", () => setNote(""))}>Add note</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Correspondence side */}
          <Card>
            <CardContent className="p-4">
              <p className="font-semibold text-sm mb-3 flex items-center gap-1.5"><Paperclip className="h-4 w-4 text-blue-600" /> Correspondence</p>
              {papers.length === 0 && <p className="text-sm text-gray-500">No dak on this file yet.</p>}
              <div className="space-y-1.5">
                {papers.map((e: any, i: number) => (
                  <div key={e.id} className="flex items-start gap-2 text-sm bg-blue-50/50 rounded px-2 py-1.5">
                    <span className="text-xs text-gray-400 w-6">C/{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate" title={e.dak?.subject}>{e.dak?.subject}</div>
                      <div className="text-[11px] text-gray-500">
                        {e.dak?.inwardNumber ? `R.No. ${e.dak.inwardNumber}` : ""}{e.dak?.outwardNumber ? `Outward ${e.dak.outwardNumber}` : ""} · {e.dak?.sender}
                      </div>
                    </div>
                    {e.dak?.fileUrl && <a href={e.dak.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600"><FileText className="h-4 w-4" /></a>}
                  </div>
                ))}
              </div>
              {isOpen && (
                <div className="flex gap-2 mt-3">
                  <Input className="h-9" placeholder="R.No. or Outward No. to place on file" value={attachNo} onChange={(e) => setAttachNo(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={!attachNo.trim() || act.isPending}
                    onClick={() => run("POST", `${base}/attach`, { number: attachNo.trim() }, "Placed on file", () => setAttachNo(""))}>Place</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Drafts for approval */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm flex items-center gap-1.5"><FileText className="h-4 w-4 text-purple-600" /> Drafts for approval</p>
                {isOpen && <Button size="sm" variant="outline" onClick={() => setDraft({ open: true, id: null, subject: "", body: "", recipients: [], replyTo: "" })}><Plus className="h-4 w-4 mr-1" /> New draft</Button>}
              </div>
              {drafts.length === 0 && <p className="text-sm text-gray-500">No drafts.</p>}
              <div className="space-y-2">
                {drafts.map((d: any) => (
                  <div key={d.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm truncate">{d.draftMeta?.subject}</div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${DRAFT_BADGE[d.draftStatus] || "bg-gray-100"}`}>{d.draftStatus}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">To: {(d.draftMeta?.recipients || []).map((r: any) => r.name).join(", ")}
                      {d.draftMeta?.outwardNumber && <> · Outward No. <strong>{d.draftMeta.outwardNumber}</strong></>}</div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap mt-2 max-h-28 overflow-y-auto bg-gray-50 rounded p-2">{d.body}</div>
                    <div className="text-[11px] text-gray-400 mt-1">{d.byName} · {format(new Date(d.createdAt), "dd MMM yyyy")}{d.draftMeta?.approvedBy && ` · approved by ${d.draftMeta.approvedBy}`}</div>
                    {isOpen && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {["pending", "returned"].includes(d.draftStatus) && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft({
                            open: true, id: d.id, subject: d.draftMeta?.subject || "", body: d.body || "",
                            recipients: d.draftMeta?.recipients || [], replyTo: d.draftMeta?.inReplyToRecipientId ? String(d.draftMeta.inReplyToRecipientId) : "" })}>
                            <PenLine className="h-3.5 w-3.5 mr-1" /> Revise
                          </Button>
                        )}
                        {d.draftStatus === "pending" && supervisor && (
                          <>
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => setDecision({ id: d.id, kind: "approve", remarks: "" })}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDecision({ id: d.id, kind: "return", remarks: "" })}>
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Return
                            </Button>
                          </>
                        )}
                        {d.draftStatus === "approved" && (
                          <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => setIssue({ id: d.id, mode: "electronic", trackingNo: "", postage: "", sendEmail: true })}>
                            <Send className="h-3.5 w-3.5 mr-1" /> Issue letter
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send / put up */}
      <Dialog open={move.open} onOpenChange={(o) => setMove((m) => ({ ...m, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Send / put up the file</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={move.to} onValueChange={(v) => setMove((m) => ({ ...m, to: v }))}>
              <SelectTrigger><SelectValue placeholder="Send to…" /></SelectTrigger>
              <SelectContent>
                {staffLogins.filter((s: any) => s.id !== myStaffId).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.roleLabel})</SelectItem>)}
              </SelectContent>
            </Select>
            {staffLogins.length === 0 && <p className="text-xs text-gray-500">Add staff logins first (Staff Logins page).</p>}
            <Textarea rows={2} placeholder="Remarks (optional)" value={move.remarks} onChange={(e) => setMove((m) => ({ ...m, remarks: e.target.value }))} />
            <Button className="w-full" disabled={!move.to || act.isPending}
              onClick={() => run("POST", `${base}/move`, { toStaffId: Number(move.to), remarks: move.remarks }, "File sent", () => setMove({ open: false, to: "", remarks: "" }))}>Send</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New / revise draft */}
      <Dialog open={draft.open} onOpenChange={(o) => setDraft((d) => ({ ...d, open: o }))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.id ? "Revise draft" : "Draft for Approval"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Addressees *</Label>
              <SearchableSelect
                options={departments.filter((d: any) => d.id !== departmentId).map((d: any) => ({ value: String(d.id), label: d.name }))}
                value=""
                onValueChange={(v) => {
                  const d = departments.find((x: any) => String(x.id) === v);
                  if (d && !draft.recipients.some((r) => r.id === d.id)) setDraft((s) => ({ ...s, recipients: [...s.recipients, { type: "department", id: d.id, name: d.name }] }));
                }}
                placeholder="Add a department…" searchPlaceholder="Search department…" emptyMessage="Not found"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {draft.recipients.map((r) => (
                  <span key={r.id} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <Building2 className="h-3 w-3" />{r.name}
                    <button onClick={() => setDraft((s) => ({ ...s, recipients: s.recipients.filter((x) => x.id !== r.id) }))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Subject *</Label>
              <Input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} />
            </div>
            {!draft.id && (
              <div>
                <Label className="text-xs">In reply to (optional)</Label>
                <Select value={draft.replyTo || "none"} onValueChange={(v) => setDraft((d) => ({ ...d, replyTo: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Not a reply" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not a reply</SelectItem>
                    {replyCandidates.map((d: any) => <SelectItem key={d.recipientId} value={String(d.recipientId)}>{d.inwardNumber} — {String(d.subject).slice(0, 50)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Text of the letter *</Label>
              <Textarea rows={10} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                placeholder={"Sir/Madam,\n\nWith reference to …\n\n…"} />
              <p className="text-[11px] text-gray-400 mt-1">On issue, a letter PDF is made with the outward number, date and a QR verification stamp.</p>
            </div>
            <Button className="w-full" disabled={!draft.subject.trim() || !draft.body.trim() || draft.recipients.length === 0 || act.isPending}
              onClick={() => draft.id
                ? run("PATCH", `${base}/drafts/${draft.id}`, { subject: draft.subject, body: draft.body, recipients: draft.recipients }, "Draft revised", () => setDraft((d) => ({ ...d, open: false })))
                : run("POST", `${base}/drafts`, { subject: draft.subject, body: draft.body, recipients: draft.recipients, inReplyToRecipientId: draft.replyTo || null }, "Draft put up", () => setDraft((d) => ({ ...d, open: false })))}>
              {draft.id ? "Save and put up again" : "Put up for approval"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve / return */}
      <Dialog open={!!decision.id} onOpenChange={(o) => !o && setDecision({ id: null, kind: "approve", remarks: "" })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{decision.kind === "approve" ? "Approve draft" : "Return draft"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea rows={2} placeholder={decision.kind === "approve" ? "Remarks (optional)" : "What should be changed? (required)"}
              value={decision.remarks} onChange={(e) => setDecision((d) => ({ ...d, remarks: e.target.value }))} />
            <Button className="w-full" disabled={(decision.kind === "return" && !decision.remarks.trim()) || act.isPending}
              onClick={() => run("POST", `${base}/drafts/${decision.id}/decision`, { decision: decision.kind, remarks: decision.remarks },
                decision.kind === "approve" ? "Draft approved" : "Draft returned", () => setDecision({ id: null, kind: "approve", remarks: "" }))}>
              {decision.kind === "approve" ? "Approve" : "Return"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Issue approved draft */}
      <Dialog open={!!issue.id} onOpenChange={(o) => !o && setIssue((s) => ({ ...s, id: null }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Issue letter</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Mode of dispatch</Label>
              <Select value={issue.mode} onValueChange={(v) => setIssue((s) => ({ ...s, mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MODES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {["registered_post", "speed_post", "courier"].includes(issue.mode) && (
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Tracking no." value={issue.trackingNo} onChange={(e) => setIssue((s) => ({ ...s, trackingNo: e.target.value }))} />
                <Input type="number" min="0" placeholder="Postage Rs." value={issue.postage} onChange={(e) => setIssue((s) => ({ ...s, postage: e.target.value }))} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={issue.sendEmail} onCheckedChange={(v) => setIssue((s) => ({ ...s, sendEmail: v }))} />
              <Label className="text-xs">E-mail the addressees</Label>
            </div>
            <Button className="w-full" disabled={act.isPending}
              onClick={() => run("POST", `${base}/drafts/${issue.id}/dispatch`, {
                dispatchMode: issue.mode, postalTrackingNo: issue.trackingNo || null, postageAmount: issue.postage || null, sendEmail: issue.sendEmail,
              }, "Letter issued", (r) => { setIssue((s) => ({ ...s, id: null })); toast({ title: `Outward No. ${r.outwardNumber}` }); })}>
              {act.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Issue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close / reopen / record room */}
      <Dialog open={closeBox.open} onOpenChange={(o) => setCloseBox((c) => ({ ...c, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{{ close: "Close file", reopen: "Reopen file", archive: "Send to record room", extend: "Keep longer", weed: "Weed out file" }[closeBox.kind]}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {closeBox.kind === "close" && <p className="text-xs text-gray-500">{CATEGORY[file.category]}. The retention date is set from today.</p>}
            {closeBox.kind === "weed" && <p className="text-xs text-red-600">The file is marked as destroyed. Record the weeding order.</p>}
            {closeBox.kind === "extend" && (
              <div><Label className="text-xs">More years</Label>
                <Input type="number" min="1" max="50" value={closeBox.years} onChange={(e) => setCloseBox((c) => ({ ...c, years: e.target.value }))} /></div>
            )}
            <Textarea rows={2} placeholder={["reopen", "extend", "weed"].includes(closeBox.kind) ? "Reason (required)" : "Remarks (optional)"}
              value={closeBox.remarks} onChange={(e) => setCloseBox((c) => ({ ...c, remarks: e.target.value }))} />
            <Button className="w-full" disabled={act.isPending || (["reopen", "extend", "weed"].includes(closeBox.kind) && !closeBox.remarks.trim())}
              onClick={() => {
                const done = () => setCloseBox((c) => ({ ...c, open: false }));
                if (closeBox.kind === "close") run("POST", `${base}/close`, { remarks: closeBox.remarks }, "File closed", done);
                else if (closeBox.kind === "reopen") run("POST", `${base}/reopen`, { remarks: closeBox.remarks }, "File reopened", done);
                else run("POST", `${base}/record`, { action: closeBox.kind, remarks: closeBox.remarks, years: Number(closeBox.years) }, "Done", done);
              }}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
