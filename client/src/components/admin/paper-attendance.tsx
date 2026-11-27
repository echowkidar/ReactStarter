// Paper attendance (Wages / Fund Staff): a section enters the attendance a department sent on paper —
// for one department by a form, or for one or many departments from an Excel file — and uploads the scan now or later.
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { sectionQuery } from "@/components/admin/payroll-settings";

const API = "/api/admin/payroll";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MAX_ROWS = 5000;
const pad = (n: number) => String(n).padStart(2, "0");

type YM = { month: number; year: number };
export type PaperReport = {
  id: number; departmentId: number; departmentName: string; scanUrl: string | null; enteredBy: string; enteredAt: string | null;
  letterNo: string | null; letterDate: string | null; employees: number; days: number;
};
type DeptSummary = { departmentId: number; departmentName: string; employees: number; days: number };
type PaperRow = { epid: string; from: string; to: string; days?: string | number; row?: number };

class PaperError extends Error {
  errors: string[]; departments: DeptSummary[];
  constructor(message: string, errors: string[] = [], departments: DeptSummary[] = []) {
    super(message); this.errors = errors; this.departments = departments;
  }
}

const invalidatePaper = () => {
  queryClient.invalidateQueries({ queryKey: [`${API}/month`] });
  queryClient.invalidateQueries({ queryKey: [`${API}/paper`] });
};

/** Paper entries of the month for this section (used by the month list). */
export function usePaperList(section: string, ym: YM) {
  return useQuery<{ reports: PaperReport[] }>({
    queryKey: [`${API}/paper`, section, ym.month, ym.year],
    queryFn: async () => (await apiRequest("GET", `${API}/paper?month=${ym.month}&year=${ym.year}&${sectionQuery(section)}`)).json(),
  });
}

async function readJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return {}; }
}

/** multipart POST (save or dry run); throws PaperError with the server's error list */
async function postPaper(data: Record<string, unknown>, scan?: File | null): Promise<{ ok: boolean; departments: DeptSummary[]; reportIds?: number[] }> {
  const fd = new FormData();
  fd.append("data", JSON.stringify(data));
  if (scan) fd.append("scan", scan);
  const res = await fetch(`${API}/paper`, { method: "POST", body: fd, credentials: "include" });
  const j = await readJson(res);
  if (!res.ok) throw new PaperError(j.message || `Failed (${res.status})`, Array.isArray(j.errors) ? j.errors : [], j.departments || []);
  return j;
}

function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-800 dark:text-red-300">
      <p className="font-medium mb-1">Nothing was saved. Please correct the following:</p>
      <ul className="list-disc pl-5 space-y-0.5 max-h-48 overflow-auto">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  );
}

// ── Row badges + actions for the month list ──────────────────────────────────

export function PaperBadges({ report, paper }: { report?: PaperReport; paper: { id: number; scan: boolean } | null }) {
  if (!paper) return null;
  const scanUrl = report?.scanUrl || null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200">Paper</Badge>
      {!paper.scan && <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Scan pending</Badge>}
      {paper.scan && scanUrl && (
        <a href={scanUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 underline">
          View scan <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export function PaperActions({ section, ym, departmentId, departmentName, attendance, online, hasRoll, paper }: {
  section: string; ym: YM; departmentId: number; departmentName: string;
  attendance: string; online: boolean; hasRoll: boolean; paper: { id: number; scan: boolean } | null;
}) {
  const { toast } = useToast();
  const [entryOpen, setEntryOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canEnter = attendance !== "received" && !online && !hasRoll && !paper;

  const uploadScan = async (file: File) => {
    if (!paper) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("scan", file);
      const res = await fetch(`${API}/paper/${paper.id}/scan?${sectionQuery(section)}`, { method: "POST", body: fd, credentials: "include" });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j.message || `Upload failed (${res.status})`);
      toast({ title: "Scan uploaded", description: departmentName });
      invalidatePaper();
    } catch (e: any) {
      toast({ title: "Scan not uploaded", description: e.message, variant: "destructive" });
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async () => {
    if (!paper) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/paper/${paper.id}?${sectionQuery(section)}`, { method: "DELETE", credentials: "include" });
      const j = await readJson(res);
      if (!res.ok) throw new Error(j.message || `Delete failed (${res.status})`);
      toast({ title: "Paper attendance deleted", description: departmentName });
      invalidatePaper();
    } catch (e: any) {
      toast({ title: "Not deleted", description: e.message, variant: "destructive" });
    }
    setBusy(false);
    setConfirmDel(false);
  };

  if (!canEnter && !paper) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {canEnter && (
        <>
          <Button size="sm" variant="outline" onClick={() => setEntryOpen(true)}>Enter paper attendance</Button>
          {entryOpen && (
            <PaperEntryDialog open={entryOpen} onOpenChange={setEntryOpen} section={section} ym={ym}
              departmentId={departmentId} departmentName={departmentName} />
          )}
        </>
      )}
      {paper && (
        <>
          {!paper.scan && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Upload scan
              </Button>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadScan(f); }} />
            </>
          )}
          {!hasRoll && (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label="Delete paper attendance" disabled={busy} onClick={() => setConfirmDel(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete paper attendance?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Delete the paper attendance of {departmentName} for {MONTHS[ym.month - 1]} {ym.year}? The scanned copy is deleted too.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={(e) => { e.preventDefault(); remove(); }}>
                      {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Entry form (one department) ──────────────────────────────────────────────

type Period = { from: string; to: string; days: string };
type Staff = { id: number; epid: string; name: string; designation: string | null };

const lastDay = (ym: YM) => new Date(ym.year, ym.month, 0).getDate();
const isoDay = (ym: YM, d: number) => `${ym.year}-${pad(ym.month)}-${pad(d)}`;
const spanOf = (p: Period) => {
  if (!p.from || !p.to) return 0;
  const a = Number(p.from.slice(8, 10)), b = Number(p.to.slice(8, 10));
  return b >= a ? b - a + 1 : 0;
};
const emptyPeriod = (): Period => ({ from: "", to: "", days: "" });

export function PaperEntryDialog({ open, onOpenChange, section, ym, departmentId, departmentName }: {
  open: boolean; onOpenChange: (o: boolean) => void; section: string; ym: YM; departmentId: number; departmentName: string;
}) {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<Record<string, Period[]>>({});
  const [letterNo, setLetterNo] = useState("");
  const [letterDate, setLetterDate] = useState("");
  const [scan, setScan] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const minD = isoDay(ym, 1), maxD = isoDay(ym, lastDay(ym));

  const { data, isLoading, error } = useQuery<{ department: { id: number; name: string }; staff: Staff[] }>({
    queryKey: [`${API}/paper/department`, section, departmentId, ym.month, ym.year],
    queryFn: async () => (await apiRequest("GET", `${API}/paper/department/${departmentId}?month=${ym.month}&year=${ym.year}&${sectionQuery(section)}`)).json(),
    enabled: open,
  });
  const staff = data?.staff || [];
  const get = (epid: string) => periods[epid] || [emptyPeriod()];

  const setPeriod = (epid: string, i: number, patch: Partial<Period>, fromDates = false) => {
    setPeriods((prev) => {
      const list = [...(prev[epid] || [emptyPeriod()])];
      let p = { ...list[i], ...patch };
      if (fromDates) { const s = spanOf(p); p = { ...p, days: s ? String(s) : "" }; }
      list[i] = p;
      return { ...prev, [epid]: list };
    });
  };
  const addPeriod = (epid: string) => setPeriods((prev) => ({ ...prev, [epid]: [...(prev[epid] || [emptyPeriod()]), emptyPeriod()] }));
  const removePeriod = (epid: string, i: number) => setPeriods((prev) => {
    const list = (prev[epid] || [emptyPeriod()]).filter((_, k) => k !== i);
    return { ...prev, [epid]: list.length ? list : [emptyPeriod()] };
  });
  const fillAll = () => {
    const full = lastDay(ym);
    const next: Record<string, Period[]> = {};
    staff.forEach((s) => { next[s.epid] = [{ from: minD, to: maxD, days: String(full) }]; });
    setPeriods(next);
  };

  const reset = () => { setPeriods({}); setLetterNo(""); setLetterDate(""); setScan(null); setErrors([]); };

  const save = async () => {
    const rows: PaperRow[] = [];
    for (const s of staff) {
      for (const p of get(s.epid)) {
        if (!p.from && !p.to) continue;
        rows.push({ epid: s.epid, from: p.from, to: p.to, days: p.days });
      }
    }
    if (!rows.length) { setErrors(["Enter the dates of at least one employee."]); return; }
    // quick client check: days within the period
    const local: string[] = [];
    for (const s of staff) {
      for (const p of get(s.epid)) {
        if (!p.from && !p.to) continue;
        if (!p.from || !p.to) { local.push(`${s.epid} (${s.name}): enter both From and To dates.`); continue; }
        const span = spanOf(p), d = Number(p.days);
        if (!span) local.push(`${s.epid} (${s.name}): From date is after To date.`);
        else if (!Number.isInteger(d) || d < 1 || d > span) local.push(`${s.epid} (${s.name}): Days must be a whole number from 1 to ${span}.`);
      }
    }
    if (local.length) { setErrors(local); return; }
    setErrors([]); setSaving(true);
    try {
      await postPaper({
        section, month: ym.month, year: ym.year, departmentId, rows,
        letterNo: letterNo.trim() || undefined, letterDate: letterDate || undefined,
      }, scan);
      toast({ title: "Paper attendance saved", description: `${departmentName} — ${MONTHS[ym.month - 1]} ${ym.year}` });
      invalidatePaper();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      setErrors(e instanceof PaperError && e.errors.length ? e.errors : [e.message]);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto px-4">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Paper attendance — {departmentName}</DialogTitle>
          <DialogDescription>
            {MONTHS[ym.month - 1]} {ym.year}. Enter the From and To dates of each employee (several periods if needed). Employees with empty dates are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Department letter No.</Label>
            <Input className="w-48" value={letterNo} maxLength={60} onChange={(e) => setLetterNo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Letter date</Label>
            <Input className="w-44" type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} />
          </div>
          <div className="grow min-w-[260px]">
            <Label className="text-xs">Scanned paper copy (PDF / JPG / PNG, optional — can be uploaded later)</Label>
            <Input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setScan(e.target.files?.[0] || null)} />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!staff.length} onClick={fillAll}>Fill full month for all</Button>
        </div>

        {isLoading && <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div>}
        {error && <p className="text-sm text-red-700 dark:text-red-400">{(error as Error).message}</p>}
        {!isLoading && !error && staff.length === 0 && (
          <p className="text-sm text-slate-500 py-4 text-center">This department has no active staff of this section.</p>
        )}

        {staff.length > 0 && (
          <div className="max-h-[50vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>EPID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Periods (From, To, Days)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => {
                  const list = get(s.epid);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs align-top pt-4">{s.epid}</TableCell>
                      <TableCell className="align-top pt-4">{s.name}</TableCell>
                      <TableCell className="align-top pt-4 text-xs text-slate-600 dark:text-slate-400">{s.designation || ""}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {list.map((p, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-1">
                              <Input type="date" className="h-8 w-36" min={minD} max={maxD} aria-label={`From date of ${s.epid}`}
                                value={p.from} onChange={(e) => setPeriod(s.epid, i, { from: e.target.value, to: p.to && p.to < e.target.value ? e.target.value : p.to }, true)} />
                              <Input type="date" className="h-8 w-36" min={p.from || minD} max={maxD} aria-label={`To date of ${s.epid}`}
                                value={p.to} onChange={(e) => setPeriod(s.epid, i, { to: e.target.value }, true)} />
                              <Input type="number" className="h-8 w-20" min={1} max={spanOf(p) || 31} placeholder="Days" aria-label={`Days of ${s.epid}`}
                                value={p.days} onChange={(e) => setPeriod(s.epid, i, { days: e.target.value })} />
                              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Remove period" onClick={() => removePeriod(s.epid, i)}>
                                <X className="h-4 w-4" />
                              </Button>
                              {i === list.length - 1 && (
                                <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => addPeriod(s.epid)}>
                                  <Plus className="h-3 w-3 mr-1" /> period
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <ErrorList errors={errors} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || staff.length === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Excel import (one or many departments) ───────────────────────────────────

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES = {
  epid: ["employeeid", "epid", "empid"],
  from: ["from", "fromdate"],
  to: ["to", "todate"],
  days: ["days", "noofdays", "numberofdays"],
} as const;

function cellValue(v: any): string | number {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number") return v;
  return String(v ?? "").trim();
}

function downloadTemplate(ym: YM) {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Employee ID", "From Date", "To Date", "Days"],
    ["R0001", `01-${pad(ym.month)}-${ym.year}`, `15-${pad(ym.month)}-${ym.year}`, 15],
  ]);
  ws["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
  const help = XLSX.utils.aoa_to_sheet([
    ["Notes"],
    ["One row per period of attendance."],
    ["Use several rows for several periods of the same employee."],
    [`Dates as DD-MM-YYYY, within the chosen month (${MONTHS[ym.month - 1]} ${ym.year}).`],
    ["Days is optional: if empty, all days of the period are counted."],
    ["The department is taken from the employee record."],
    ["Only this section's staff can be entered."],
  ]);
  help["!cols"] = [{ wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.utils.book_append_sheet(wb, help, "Help");
  XLSX.writeFile(wb, "paper-attendance-template.xlsx");
}

export function PaperImportDialog({ open, onOpenChange, section, ym }: {
  open: boolean; onOpenChange: (o: boolean) => void; section: string; ym: YM;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PaperRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [letterNo, setLetterNo] = useState("");
  const [letterDate, setLetterDate] = useState("");
  const [summary, setSummary] = useState<DeptSummary[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const reset = () => {
    setRows([]); setFileName(""); setSummary([]); setErrors([]); setChecked(false); setDone(null);
    setLetterNo(""); setLetterDate("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const payload = (rs: PaperRow[], dryRun: boolean) => ({
    section, month: ym.month, year: ym.year, rows: rs, dryRun,
    letterNo: letterNo.trim() || undefined, letterDate: letterDate || undefined,
  });

  const check = async (rs: PaperRow[]) => {
    setBusy(true); setErrors([]); setSummary([]); setChecked(false);
    try {
      const r = await postPaper(payload(rs, true));
      setSummary(r.departments); setChecked(true);
    } catch (e: any) {
      if (e instanceof PaperError) { setErrors(e.errors.length ? e.errors : [e.message]); setSummary(e.departments); }
      else setErrors([e.message]);
    }
    setBusy(false);
  };

  const handleFile = async (file: File) => {
    setDone(null); setRows([]); setSummary([]); setErrors([]); setChecked(false); setFileName(file.name);
    const parsed: PaperRow[] = [];
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      if (!data.length) { toast({ title: "Empty file", description: "The file has no rows.", variant: "destructive" }); return; }
      const head = (data[0] || []).map(norm);
      const col = (k: keyof typeof ALIASES) => head.findIndex((h) => (ALIASES[k] as readonly string[]).includes(h));
      const idx = { epid: col("epid"), from: col("from"), to: col("to"), days: col("days") };
      const missing = [idx.epid < 0 && "Employee ID", idx.from < 0 && "From Date", idx.to < 0 && "To Date"].filter(Boolean);
      if (missing.length) {
        toast({ title: "Column missing", description: `Missing column(s): ${missing.join(", ")}`, variant: "destructive" });
        return;
      }
      data.slice(1).forEach((r, i) => {
        const o: PaperRow = {
          epid: String(cellValue(r[idx.epid])), from: cellValue(r[idx.from]) as any, to: cellValue(r[idx.to]) as any,
          days: idx.days >= 0 ? cellValue(r[idx.days]) : "", row: i + 2,
        };
        if (!o.epid && !o.from && !o.to && o.days === "") return;
        parsed.push(o);
      });
    } catch {
      toast({ title: "Could not read the file", description: "Use an .xlsx, .xls or .csv file.", variant: "destructive" });
      return;
    }
    if (!parsed.length) { toast({ title: "No data", description: "The file has no data rows.", variant: "destructive" }); return; }
    if (parsed.length > MAX_ROWS) {
      toast({ title: "Too many rows", description: `At most ${MAX_ROWS} rows can be imported at once.`, variant: "destructive" });
      return;
    }
    setRows(parsed);
    await check(parsed);
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await postPaper(payload(rows, false));
      setDone(r.departments.length);
      setSummary(r.departments);
      invalidatePaper();
      toast({ title: "Paper attendance saved", description: `${r.departments.length} departments` });
    } catch (e: any) {
      setChecked(false);
      if (e instanceof PaperError) { setErrors(e.errors.length ? e.errors : [e.message]); setSummary(e.departments); }
      else setErrors([e.message]);
    }
    setBusy(false);
  };

  const totalDays = summary.reduce((n, d) => n + d.days, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto px-4">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Import paper attendance (Excel)</DialogTitle>
          <DialogDescription>
            {MONTHS[ym.month - 1]} {ym.year}. One file can cover one or many departments; the department is taken from each employee's record.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-sm space-y-1">
          <p>Columns: <b>Employee ID, From Date, To Date, Days</b> (Days is optional — empty means all days of the period).</p>
          <p>One row per period; use several rows for several periods of the same employee. Dates as DD-MM-YYYY within the month above.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Department letter No. (optional)</Label>
            <Input className="w-48" value={letterNo} maxLength={60} disabled={done !== null}
              onChange={(e) => { setLetterNo(e.target.value); setChecked(false); }} />
          </div>
          <div>
            <Label className="text-xs">Letter date (optional)</Label>
            <Input className="w-44" type="date" value={letterDate} disabled={done !== null}
              onChange={(e) => { setLetterDate(e.target.value); setChecked(false); }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => downloadTemplate(ym)}>
            <Download className="w-4 h-4 mr-2" /> Download template
          </Button>
          <Button type="button" variant="outline" disabled={busy || done !== null} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> Choose file
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {fileName && <span className="text-sm text-muted-foreground">{fileName} ({rows.length} rows)</span>}
          {rows.length > 0 && !checked && !busy && done === null && (
            <Button type="button" size="sm" variant="secondary" onClick={() => check(rows)}>Check again</Button>
          )}
        </div>

        {busy && <p className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 inline animate-spin mr-1" /> Please wait...</p>}

        <ErrorList errors={errors} />

        {summary.length > 0 && errors.length === 0 && (
          <div className="border rounded-md overflow-auto max-h-[40vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Total days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((d) => (
                  <TableRow key={d.departmentId}>
                    <TableCell>{d.departmentName}</TableCell>
                    <TableCell className="text-right">{d.employees}</TableCell>
                    <TableCell className="text-right">{d.days}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">{summary.length} departments</TableCell>
                  <TableCell className="text-right font-medium">{summary.reduce((n, d) => n + d.employees, 0)}</TableCell>
                  <TableCell className="text-right font-medium">{totalDays}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        {done !== null && (
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            Saved for {done} departments. Upload each department's scanned copy from its row in the month list.
          </p>
        )}

        <DialogFooter>
          {done !== null ? (
            <Button type="button" onClick={() => { reset(); onOpenChange(false); }}>OK</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button type="button" disabled={busy || !checked || errors.length > 0 || summary.length === 0} onClick={doImport}>
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
