import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, CalendarPlus, FileSignature, Scissors, Clock, LocateFixed, UserMinus } from "lucide-react";

// Reasons a department can give when the term cannot be updated right now.
// The chosen reason is written into the Remarks of the employee's attendance row.
export const TERM_BYPASS_REASONS = [
  "Extension order awaited",
  "Fresh appointment order awaited",
  "Documents under process",
] as const;

export interface TermIssue {
  employee: any;
  serial: number;           // S.No. in the attendance report being created
  kind: "missing" | "short";
  expiryDisplay: string;    // DD-MM-YY ("" when missing)
  periodTo: string;         // last To Date of the employee's periods (DD-MM-YY)
  canTrim: boolean;         // some attendance falls on/before the term expiry
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: TermIssue[];
  departmentId?: number;
  onEmployeeUpdated: () => Promise<void>;
  onTrim: (employeeId: number) => void;
  onBypass: (employeeId: number, reason: string) => void;
  onUntick: (employeeId: number) => void;
  onLocate: (employeeId: number) => void;
}

const uploadFile = async (file: File): Promise<string> => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("File upload failed");
  const json = await res.json();
  return json.imageUrl;
};

export function TermCheckDialog({ open, onOpenChange, issues, departmentId, onEmployeeUpdated, onTrim, onBypass, onUntick, onLocate }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Term Check — {issues.length} employee{issues.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            The term of these employees ends before their attendance period (or is not entered).
            Update the term here, or choose why it cannot be updated yet — the reason is written in the Remarks.
          </DialogDescription>
        </DialogHeader>

        {issues.length === 0 ? (
          <div className="py-8 text-center text-green-700 font-medium">All terms are in order. ✓</div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <TermIssueCard
                key={issue.employee.id}
                issue={issue}
                departmentId={departmentId}
                onEmployeeUpdated={onEmployeeUpdated}
                onTrim={onTrim}
                onBypass={onBypass}
                onUntick={onUntick}
                onLocate={(id) => { onOpenChange(false); onLocate(id); }}
              />
            ))}
          </div>
        )}
        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Mode = null | "extend" | "fresh" | "bypass";

function TermIssueCard({ issue, departmentId, onEmployeeUpdated, onTrim, onBypass, onUntick, onLocate }: {
  issue: TermIssue;
  departmentId?: number;
  onEmployeeUpdated: () => Promise<void>;
  onTrim: (id: number) => void;
  onBypass: (id: number, reason: string) => void;
  onUntick: (id: number) => void;
  onLocate: (id: number) => void;
}) {
  const emp = issue.employee;
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Extend / Fresh appointment fields
  const [termExpiry, setTermExpiry] = useState("");
  const [extensionFile, setExtensionFile] = useState<File | null>(null);
  const [memoNo, setMemoNo] = useState("");
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const [joiningDate, setJoiningDate] = useState("");
  const [joiningFile, setJoiningFile] = useState<File | null>(null);
  // Bypass
  const [reason, setReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState("");

  const save = async () => {
    setError("");
    if (!departmentId) { setError("Department not found."); return; }
    if (!termExpiry) { setError("Please enter the new Term Expiry date."); return; }
    if (mode === "fresh" && (!memoNo.trim() || !joiningDate)) {
      setError("Office Memo No. and Joining Date are required for a fresh appointment."); return;
    }
    setSaving(true);
    try {
      const updates: Record<string, any> = { termExpiry };
      if (mode === "extend" && extensionFile) updates.termExtensionUrl = await uploadFile(extensionFile);
      if (mode === "fresh") {
        updates.officeMemoNo = memoNo.trim();
        updates.joiningDate = joiningDate;
        if (memoFile) updates.officeMemoUrl = await uploadFile(memoFile);
        if (joiningFile) updates.joiningReportUrl = await uploadFile(joiningFile);
      }
      const res = await fetch(`/api/departments/${departmentId}/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try { const j = JSON.parse(text); msg = j.details || j.message || text; } catch { /* plain text */ }
        throw new Error(msg || `Error ${res.status}`);
      }
      await onEmployeeUpdated();
      setMode(null);
    } catch (e: any) {
      setError(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const applyBypass = () => {
    const r = reason === "other" ? otherReason.trim() : reason;
    if (!r) { setError("Please choose a reason."); return; }
    onBypass(emp.id, r);
  };

  const fileInput = (label: string, onChange: (f: File | null) => void) => (
    <div>
      <Label className="text-xs">{label} <span className="text-muted-foreground">(optional)</span></Label>
      <Input type="file" accept="image/*,application/pdf" className="h-9 text-xs"
        onChange={(e) => onChange(e.target.files?.[0] || null)} />
    </div>
  );

  const ModeButton = ({ m, icon: Icon, label }: { m: Mode; icon: any; label: string }) => (
    <Button type="button" size="sm" variant={mode === m ? "default" : "outline"} className="h-8 text-xs"
      onClick={() => { setError(""); setMode(mode === m ? null : m); }}>
      <Icon className="h-3.5 w-3.5 mr-1" />{label}
    </Button>
  );

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="min-w-[2.25rem] h-9 rounded-md bg-red-600 text-white flex items-center justify-center font-bold"
            title="S.No. in this attendance report">
            {issue.serial}
          </div>
          <div>
            <div className="font-semibold">{emp.name} <span className="text-muted-foreground font-normal">· EPID {emp.epid || "-"}</span></div>
            <div className="text-xs text-muted-foreground">{emp.designation} · {emp.employmentStatus}</div>
            <div className="text-xs mt-1">
              {issue.kind === "missing"
                ? <span className="text-red-700 font-semibold">Term Expiry not entered</span>
                : <>Term upto <span className="text-red-700 font-semibold">{issue.expiryDisplay}</span>, attendance upto <span className="font-semibold">{issue.periodTo}</span></>}
            </div>
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onLocate(emp.id)}>
          <LocateFixed className="h-3.5 w-3.5 mr-1" />Show in report
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <ModeButton m="extend" icon={CalendarPlus} label="Extend Term" />
        <ModeButton m="fresh" icon={FileSignature} label="Fresh Appointment" />
        {issue.kind === "short" && issue.canTrim && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs"
            title={`Set the To Date to ${issue.expiryDisplay}`} onClick={() => onTrim(emp.id)}>
            <Scissors className="h-3.5 w-3.5 mr-1" />Attendance upto {issue.expiryDisplay}
          </Button>
        )}
        <ModeButton m="bypass" icon={Clock} label="Order / Documents awaited" />
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-red-700" onClick={() => onUntick(emp.id)}>
          <UserMinus className="h-3.5 w-3.5 mr-1" />Remove from report
        </Button>
      </div>

      {(mode === "extend" || mode === "fresh") && (
        <div className="mt-3 rounded-md border bg-white p-3 grid gap-3 sm:grid-cols-2">
          {mode === "fresh" && (
            <>
              <div>
                <Label className="text-xs">Office Memo No. (appointment order)</Label>
                <Input className="h-9" value={memoNo} onChange={(e) => setMemoNo(e.target.value)} />
              </div>
              {fileInput("Appointment order", setMemoFile)}
              <div>
                <Label className="text-xs">Joining Date</Label>
                <Input type="date" className="h-9" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
              </div>
              {fileInput("Joining report", setJoiningFile)}
            </>
          )}
          <div>
            <Label className="text-xs">New Term Expiry Date</Label>
            <Input type="date" className="h-9" value={termExpiry} onChange={(e) => setTermExpiry(e.target.value)} />
          </div>
          {mode === "extend" && fileInput("Term extension letter", setExtensionFile)}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save to employee record
            </Button>
          </div>
        </div>
      )}

      {mode === "bypass" && (
        <div className="mt-3 rounded-md border bg-white p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {[...TERM_BYPASS_REASONS, "other"].map((r) => (
              <label key={r} className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${reason === r ? "border-blue-600 bg-blue-50 text-blue-800" : ""}`}>
                <input type="radio" className="sr-only" checked={reason === r} onChange={() => { setReason(r); setError(""); }} />
                {r === "other" ? "Other…" : r}
              </label>
            ))}
          </div>
          {reason === "other" && (
            <Input className="h-9" placeholder="Write the reason" value={otherReason} maxLength={80}
              onChange={(e) => setOtherReason(e.target.value)} />
          )}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={applyBypass}>Write in Remarks &amp; continue</Button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}
