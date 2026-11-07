// Paybill History — the app's copy of Oracle T_PAYBILL_HIST + T_PAYBILL_HIST_ARCHIVE.
// Server side: server/paybillSync.ts. Reached from Settings → Sync; needs the Settings PIN.
// Oracle is only read (through the read-only oracle-sync container).
import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AdminHeader from "@/components/layout/admin-header";
import { SettingsPinGate } from "@/components/admin/settings-pin-gate";
import { SyncTabs } from "@/components/admin/sync-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Database, DownloadCloud, Loader2, SearchCheck, FileSpreadsheet, X, CheckCircle2, CircleAlert, History,
} from "lucide-react";
import salaryAssistants from "@/lib/salary-assistants.json";

// ── Types ────────────────────────────────────────────────────────────────────
type Row = {
  src: string; yr_no: number; mth_no: number; sal_code: number; ecode: string; line_no: number; name: string | null;
  cat_code: string | null; emp_cat: string | null; desig_code: string | null; deptt: string | null;
  basic_sal: number | null; npa: number | null; da: number | null; hra: number | null; ta: number | null;
  pat_care: number | null; nursing: number | null; annual: number | null; d_ast: string | null;
  full_pay_fdate: string | null; full_pay_tdate: string | null; sal_no: string | null; grade_pay: number | null; sal_flag: string | null;
};
type Run = {
  id: number; kind: "new" | "check"; status: "running" | "done" | "report" | "applied" | "failed";
  created_at: string; created_by: string; finished_at: string | null; error: string | null;
  applied_at: string | null; applied_by: string | null; summary: any;
};
type Status = {
  job: { runId: number; kind: string; step: string; done: number; total: number; startedAt: string } | null;
  stats: { months: number; rows: number; first_ym: number | null; last_ym: number | null; last_sync: string | null };
  runs: Run[];
};
type Opt = { value: string; count: number };
type Options = {
  dAst: Opt[]; deptt: Opt[]; desig: Opt[]; salNo: Opt[]; empCat: Opt[]; salCode: Opt[];
  desigNames: Record<string, string>; deptNames: Record<string, string>; salTypes: Record<string, string>;
};
type SearchResult = { total: number; employees: number; totals: Record<string, number | null>; rows: Row[] };
type Change = {
  id: number; kind: "added" | "removed" | "changed"; src: string; yr_no: number; mth_no: number; sal_code: number;
  ecode: string; line_no: number; name: string | null; fields: Array<{ field: string; old: any; new: any }> | null;
};

// ── Labels and formatting ────────────────────────────────────────────────────
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymLabel = (ym: number | null) => (ym ? `${MONTHS[(ym % 100) - 1]} ${Math.floor(ym / 100)}` : "—");
const monthOf = (r: { yr_no: number; mth_no: number }) => `${MONTHS[r.mth_no - 1]} ${r.yr_no}`;
const fmtWhen = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
const fmtDate = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("-") : "");
const money = (v: number | null | undefined) => (v === null || v === undefined ? "" : Number(v).toLocaleString("en-IN"));
const DAST_NAME = new Map((salaryAssistants as Array<{ value: string; label: string }>).map((a) => [a.value, a.label]));
const CAT_NAME: Record<string, string> = { P: "Teaching", Q: "Non-Teaching" };

const FIELD_LABELS: Record<string, string> = {
  cat_code: "Cat code", emp_cat: "Category", desig_code: "Designation", deptt: "Department", basic_sal: "Basic",
  npa: "NPA", da: "DA", hra: "HRA", ta: "TA", pat_care: "Patient care", nursing: "Nursing", annual: "Annual",
  d_ast: "D.Ast", full_pay_fdate: "Full pay from", full_pay_tdate: "Full pay to", sal_no: "Register",
  grade_pay: "Grade pay", sal_flag: "Sal flag",
};
const AMOUNT_COLS = ["basic_sal", "npa", "da", "hra", "ta", "pat_care", "nursing", "annual", "grade_pay"] as const;
const COMPARE_COLS = ["desig_code", "deptt", "d_ast", "sal_no", "emp_cat", ...AMOUNT_COLS] as const;
const valueOf = (field: string, v: any) =>
  v === null || v === undefined || v === "" ? "—" : field.endsWith("date") ? fmtDate(String(v)) :
    (AMOUNT_COLS as readonly string[]).includes(field) ? money(Number(v)) : String(v);

const PAGE_SIZES = [50, 100, 200, 500];
const SORTS = [
  { value: "period_desc", label: "Newest month first" },
  { value: "period_asc", label: "Oldest month first" },
  { value: "ecode", label: "ECODE" },
  { value: "dast", label: "Dealing assistant" },
  { value: "basic_desc", label: "Basic (high → low)" },
];
type Filters = {
  q: string; from: string; to: string; salCode: string; dAst: string; deptt: string; desig: string;
  empCat: string; salNo: string; sort: string;
};
const NO_FILTERS: Filters = { q: "", from: "", to: "", salCode: "", dAst: "", deptt: "", desig: "", empCat: "", salNo: "", sort: "period_desc" };

// Filters and page are kept for this browser tab (a reload comes back to the same place)
const VIEW_KEY = "paybillView";
function loadView(): { filters: Filters; page: number; pageSize: number; tab: "search" | "changes" | "runs" } {
  try {
    const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "{}");
    return {
      filters: { ...NO_FILTERS, ...(v.filters || {}) },
      page: Number.isInteger(v.page) ? v.page : 0,
      pageSize: PAGE_SIZES.includes(v.pageSize) ? v.pageSize : 50,
      tab: ["search", "changes", "runs"].includes(v.tab) ? v.tab : "search",
    };
  } catch {
    return { filters: NO_FILTERS, page: 0, pageSize: 50, tab: "search" };
  }
}

const queryString = (f: Filters, extra: Record<string, string | number>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
};

export default function PaybillHistoryPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen flex flex-col">
      <AdminHeader />
      <div className="p-4 sm:p-6 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="h-6 w-6" /> Sync</h1>
          <Button variant="outline" onClick={() => setLocation("/admin/settings")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Settings
          </Button>
        </div>
        <SettingsPinGate>
          <SyncTabs />
          <PaybillHistory />
        </SettingsPinGate>
      </div>
    </div>
  );
}

function PaybillHistory() {
  const { toast } = useToast();
  const [v0] = useState(loadView);
  const [tab, setTab] = useState(v0.tab);
  const [filters, setFilters] = useState<Filters>(v0.filters);
  const [searchText, setSearchText] = useState(v0.filters.q);
  const [page, setPage] = useState(v0.page);
  const [pageSize, setPageSize] = useState(v0.pageSize);
  const [employee, setEmployee] = useState<string | null>(null);
  const [reportRun, setReportRun] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);

  // While a job runs, ask for its progress every 2 s
  const status = useQuery<Status>({
    queryKey: ["/api/admin/paybill/status"],
    refetchInterval: (q) => (q.state.data?.job ? 2000 : false),
  });
  const job = status.data?.job || null;
  const stats = status.data?.stats;
  const runs = status.data?.runs || [];
  const hasData = !!stats?.months;

  // When a job ends: refresh what depends on the data
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (job) { setWasRunning(true); return; }
    if (!wasRunning) return;
    setWasRunning(false);
    const last = runs[0];
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/paybill/") && q.queryKey[0] !== "/api/admin/paybill/status" });
    if (last?.status === "failed") toast({ variant: "destructive", title: "The job failed", description: last.error || "" });
    else if (last?.kind === "new") toast({ title: "New months added", description: `${last.summary?.months || 0} months, ${(last.summary?.rows || 0).toLocaleString("en-IN")} rows` });
    else if (last?.kind === "check") {
      if (last.status === "report") { setReportRun(last.id); setTab("changes"); toast({ title: "Oracle has changes", description: "See the report and press Apply to take them over." }); }
      else toast({ title: "No changes in Oracle", description: "The copy matches Oracle." });
    }
  }, [job, wasRunning, runs, toast]);

  // Search box: wait until typing stops
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === searchText.trim() ? f : { ...f, q: searchText.trim() })), 400);
    return () => clearTimeout(t);
  }, [searchText]);
  const setFilter = (k: keyof Filters, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(0); };
  useEffect(() => { setPage(0); }, [filters.q]);

  useEffect(() => {
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ filters, page, pageSize, tab })); } catch { /* ignore */ }
  }, [filters, page, pageSize, tab]);

  const options = useQuery<Options>({ queryKey: ["/api/admin/paybill/options"], enabled: hasData, staleTime: Infinity });
  const searchUrl = `/api/admin/paybill/rows?${queryString(filters, { page, pageSize })}`;
  const search = useQuery<SearchResult>({ queryKey: [searchUrl], enabled: hasData && tab === "search", placeholderData: (p) => p });
  const result = search.data;
  const pages = Math.max(1, Math.ceil((result?.total || 0) / pageSize));

  const o = options.data;
  const desigName = (c: string | null) => (c ? o?.desigNames?.[c] || c : "");
  const deptName = (c: string | null) => (c ? o?.deptNames?.[c.toUpperCase()] || c : "");
  const salType = (c: number) => o?.salTypes?.[String(c)] || `Code ${c}`;

  const start = async (kind: "new-months" | "check") => {
    setBusy(true);
    try {
      await apiRequest("POST", `/api/admin/paybill/${kind}`, {});
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/paybill/status"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not start", description: e.message });
    } finally { setBusy(false); }
  };

  const apply = (run: Run) => setConfirm({
    title: `Apply check #${run.id}?`,
    text: `${(run.summary?.changed || 0).toLocaleString("en-IN")} changed, ${(run.summary?.added || 0).toLocaleString("en-IN")} added and ${(run.summary?.removed || 0).toLocaleString("en-IN")} removed rows will be taken over from Oracle into the app's copy. Oracle itself is not touched.`,
    run: async () => {
      setBusy(true);
      try {
        const r = await (await apiRequest("POST", `/api/admin/paybill/runs/${run.id}/apply`, {})).json();
        toast({ title: "Applied", description: `${r.rows.toLocaleString("en-IN")} rows updated in the copy.` });
        await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/paybill/") });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Could not apply", description: e.message });
      } finally { setBusy(false); }
    },
  });

  const downloadExcel = async () => {
    setBusy(true);
    try {
      const r: SearchResult = await (await apiRequest("GET", `/api/admin/paybill/rows?${queryString(filters, { export: 1 })}`)).json();
      if (!r.rows.length) { toast({ title: "Nothing to download" }); return; }
      const data = r.rows.map((x) => ({
        Month: monthOf(x), "Salary type": salType(x.sal_code), ECODE: x.ecode, Name: x.name || "",
        Designation: desigName(x.desig_code), "Desig code": x.desig_code || "", Department: deptName(x.deptt), "Dept code": x.deptt || "",
        "D.Ast": x.d_ast || "", Register: x.sal_no || "", Category: CAT_NAME[x.emp_cat || ""] || x.emp_cat || "", "Cat code": x.cat_code || "",
        "Full pay from": fmtDate(x.full_pay_fdate), "Full pay to": fmtDate(x.full_pay_tdate),
        Basic: x.basic_sal, NPA: x.npa, DA: x.da, HRA: x.hra, TA: x.ta, "Patient care": x.pat_care, Nursing: x.nursing,
        Annual: x.annual, "Grade pay": x.grade_pay, "Sal flag": x.sal_flag || "", Table: x.src === "A" ? "Archive" : "Hist",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = Object.keys(data[0]).map((k) => ({ wch: Math.min(30, Math.max(8, k.length + 2)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Paybill");
      const n = new Date();
      XLSX.writeFile(wb, `paybill-${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}.xlsx`);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not download", description: e.message });
    } finally { setBusy(false); }
  };

  const openReport = runs.find((r) => r.kind === "check" && r.status === "report");
  const anyFilter = Object.entries(filters).some(([k, v]) => k !== "sort" && v);

  const sel = (k: keyof Filters, label: string, list: Opt[] | undefined, name?: (v: string) => string) => (
    <select value={filters[k]} onChange={(e) => setFilter(k, e.target.value)} aria-label={label}
      className="h-9 rounded-md border px-2 text-sm bg-white max-w-[220px]">
      <option value="">{label}</option>
      {(list || []).map((x) => <option key={x.value} value={x.value}>{name ? name(x.value) : x.value} ({x.count.toLocaleString("en-IN")})</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      {/* Status + buttons */}
      <Card>
        <CardContent className="pt-6 flex flex-col lg:flex-row gap-4 lg:items-center">
          <div className="flex-1 space-y-1 text-sm">
            {status.isLoading ? <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : hasData ? (
              <>
                <div className="font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />
                  {stats!.rows.toLocaleString("en-IN")} paybill rows · {stats!.months} months · {ymLabel(stats!.first_ym)} – {ymLabel(stats!.last_ym)}
                </div>
                <p className="text-muted-foreground">Copied from Oracle T_PAYBILL_HIST and T_PAYBILL_HIST_ARCHIVE · last copy {fmtWhen(stats!.last_sync)}. Oracle is only read, never changed.</p>
              </>
            ) : (
              <>
                <div className="font-medium flex items-center gap-2"><CircleAlert className="h-4 w-4 text-amber-600" /> No paybill data copied yet</div>
                <p className="text-muted-foreground">Start the oracle-sync container in Portainer and press “Add new months”. The first copy brings all months (about 20 lakh rows) and takes a few minutes.</p>
              </>
            )}
            {job && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-primary"><Loader2 className="h-4 w-4 animate-spin" /> {job.step}</div>
                {job.total > 0 && (
                  <div className="h-2 w-full max-w-md rounded bg-slate-200 overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((job.done / job.total) * 100)}%` }} />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">You can keep using the page; it carries on in the background.</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => start("check")} disabled={!!job || busy || !hasData}
              title="Compare every copied month with Oracle and report what changed">
              <SearchCheck className="h-4 w-4 mr-2" /> Check changes
            </Button>
            <Button onClick={() => start("new-months")} disabled={!!job || busy}
              title="Copy the months Oracle has that are not here yet">
              <DownloadCloud className="h-4 w-4 mr-2" /> Add new months
            </Button>
          </div>
        </CardContent>
      </Card>

      {openReport && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
            <div className="flex-1">
              <b>Oracle has changes</b> (check #{openReport.id}, {fmtWhen(openReport.created_at)}):{" "}
              {openReport.summary.changed} changed, {openReport.summary.added} added, {openReport.summary.removed} removed rows ·{" "}
              {openReport.summary.employees} employees · {openReport.summary.monthsDiffering} months. The copy is not changed until you apply.
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setReportRun(openReport.id); setTab("changes"); }}>View report</Button>
              <Button size="sm" onClick={() => apply(openReport)} disabled={busy || !!job}>Apply</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inner tabs */}
      <div className="flex gap-1 border-b">
        {([["search", "Search"], ["changes", "Changes"], ["runs", "Runs"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "search" && hasData && (
        <>
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Input placeholder="ECODE or name" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full sm:w-56" />
                <label className="flex items-center gap-1 text-sm text-muted-foreground">From
                  <Input type="month" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} className="w-40" aria-label="From month" />
                </label>
                <label className="flex items-center gap-1 text-sm text-muted-foreground">To
                  <Input type="month" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} className="w-40" aria-label="To month" />
                </label>
                {sel("salCode", "All salary types", o?.salCode, (v) => salType(Number(v)))}
                {sel("dAst", "All dealing assistants", o?.dAst, (v) => DAST_NAME.get(v) || v)}
                {sel("deptt", "All departments", o?.deptt, (v) => { const n = deptName(v); return n === v ? v : `${n} (${v})`; })}
                {sel("desig", "All designations", o?.desig, (v) => { const n = desigName(v); return n === v ? v : `${n} (${v})`; })}
                {sel("empCat", "Teaching / Non-Teaching", o?.empCat, (v) => CAT_NAME[v] || v)}
                {sel("salNo", "All registers", o?.salNo)}
                <select value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)} aria-label="Sort" className="h-9 rounded-md border px-2 text-sm bg-white">
                  {SORTS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
                </select>
                {anyFilter && (
                  <Button size="sm" variant="ghost" onClick={() => { setFilters(NO_FILTERS); setSearchText(""); setPage(0); }}>
                    <X className="h-4 w-4 mr-1" /> Clear filters
                  </Button>
                )}
                <Button size="sm" variant="outline" className="ml-auto" onClick={downloadExcel} disabled={busy || !result?.total}>
                  {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />} Download Excel
                </Button>
              </div>
              {result && (
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span><b className="text-foreground">{result.total.toLocaleString("en-IN")}</b> rows · {result.employees.toLocaleString("en-IN")} employees</span>
                  {(["basic_sal", "da", "hra", "ta", "npa"] as const).map((k) => result.totals[k] ? (
                    <span key={k}>{FIELD_LABELS[k]} ₹{money(result.totals[k])}</span>
                  ) : null)}
                  {search.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2">Month</th><th className="p-2">Employee</th><th className="p-2">Designation · Department</th>
                    <th className="p-2">D.Ast · Register</th><th className="p-2">Full pay</th>
                    <th className="p-2 text-right">Basic</th><th className="p-2 text-right">NPA</th><th className="p-2 text-right">DA</th>
                    <th className="p-2 text-right">HRA</th><th className="p-2 text-right">TA</th><th className="p-2 text-right">Other</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.rows.map((r) => {
                    const other = [["Pat", r.pat_care], ["Nurs", r.nursing], ["Ann", r.annual], ["GP", r.grade_pay]].filter(([, v]) => v);
                    return (
                      <tr key={`${r.src}${r.yr_no}${r.mth_no}${r.sal_code}${r.ecode}${r.line_no}`} className="border-t align-top hover:bg-slate-50">
                        <td className="p-2 whitespace-nowrap">
                          <div className="font-medium">{monthOf(r)}</div>
                          {r.sal_code !== 1 && <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700">{salType(r.sal_code)}</Badge>}
                        </td>
                        <td className="p-2 min-w-[160px]">
                          <button type="button" className="font-medium text-primary hover:underline text-left" onClick={() => setEmployee(r.ecode)}>
                            {r.ecode}{r.name ? ` · ${r.name}` : ""}
                          </button>
                          {r.emp_cat && <div className="text-xs text-muted-foreground">{CAT_NAME[r.emp_cat] || r.emp_cat}</div>}
                        </td>
                        <td className="p-2 text-xs min-w-[160px]">
                          <div>{desigName(r.desig_code)}</div><div className="text-muted-foreground">{deptName(r.deptt)}</div>
                        </td>
                        <td className="p-2 text-xs whitespace-nowrap"><div>{r.d_ast}</div><div className="text-muted-foreground">{r.sal_no}</div></td>
                        <td className="p-2 text-xs whitespace-nowrap">{fmtDate(r.full_pay_fdate)}{r.full_pay_tdate ? ` – ${fmtDate(r.full_pay_tdate)}` : ""}</td>
                        <td className="p-2 text-right tabular-nums">{money(r.basic_sal)}</td>
                        <td className="p-2 text-right tabular-nums">{money(r.npa)}</td>
                        <td className="p-2 text-right tabular-nums">{money(r.da)}</td>
                        <td className="p-2 text-right tabular-nums">{money(r.hra)}</td>
                        <td className="p-2 text-right tabular-nums">{money(r.ta)}</td>
                        <td className="p-2 text-right text-xs whitespace-nowrap">{other.map(([l, v]) => <div key={String(l)}>{l} {money(v as number)}</div>)}</td>
                      </tr>
                    );
                  })}
                  {result && !result.rows.length && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Nothing found.</td></tr>}
                  {!result && search.isLoading && <tr><td colSpan={11} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span>Page {page + 1} of {pages.toLocaleString("en-IN")}</span>
            <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} aria-label="Rows per page"
              className="h-9 rounded-md border px-2 text-sm bg-white ml-2">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
            </select>
          </div>
        </>
      )}
      {tab === "search" && !hasData && !status.isLoading && (
        <p className="text-sm text-muted-foreground">Nothing to search yet — press “Add new months” first.</p>
      )}

      {tab === "changes" && (
        <ChangesTab runs={runs} runId={reportRun} setRunId={setReportRun} onEmployee={setEmployee}
          onApply={apply} busy={busy || !!job} salType={salType} />
      )}

      {tab === "runs" && <RunsTab runs={runs} onReport={(id) => { setReportRun(id); setTab("changes"); }} />}

      {employee && (
        <EmployeeDialog ecode={employee} onClose={() => setEmployee(null)} desigName={desigName} deptName={deptName} salType={salType} />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const c = confirm; setConfirm(null); c?.run(); }}>Yes, apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Changes found by a check ────────────────────────────────────────────────
function ChangesTab({ runs, runId, setRunId, onEmployee, onApply, busy, salType }: {
  runs: Run[]; runId: number | null; setRunId: (id: number) => void; onEmployee: (e: string) => void;
  onApply: (r: Run) => void; busy: boolean; salType: (c: number) => string;
}) {
  const checks = runs.filter((r) => r.kind === "check" && (r.status === "report" || r.status === "applied"));
  const current = checks.find((r) => r.id === runId) || checks[0];
  const [ecode, setEcode] = useState("");
  const [kind, setKind] = useState("");
  const [field, setField] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [current?.id, ecode, kind, field]);
  const url = current ? `/api/admin/paybill/runs/${current.id}/changes?${new URLSearchParams({ ecode, kind, field, page: String(page), pageSize: "100" })}` : "";
  const q = useQuery<{ total: number; rows: Change[] }>({ queryKey: [url], enabled: !!current, placeholderData: (p) => p });
  const pages = Math.max(1, Math.ceil((q.data?.total || 0) / 100));

  if (!checks.length) return <p className="text-sm text-muted-foreground">No changes found yet. “Check changes” compares the copy with Oracle and lists here what Oracle changed.</p>;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={current?.id} onChange={(e) => setRunId(Number(e.target.value))} aria-label="Check" className="h-9 rounded-md border px-2 text-sm bg-white">
              {checks.map((r) => <option key={r.id} value={r.id}>Check #{r.id} · {fmtWhen(r.created_at)} · {r.status === "report" ? "not applied yet" : "applied"}</option>)}
            </select>
            <Input placeholder="ECODE" value={ecode} onChange={(e) => setEcode(e.target.value.trim())} className="w-32" />
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" className="h-9 rounded-md border px-2 text-sm bg-white">
              <option value="">Changed / added / removed</option>
              <option value="changed">Changed</option><option value="added">Added in Oracle</option><option value="removed">Removed in Oracle</option>
            </select>
            <select value={field} onChange={(e) => setField(e.target.value)} aria-label="Field" className="h-9 rounded-md border px-2 text-sm bg-white">
              <option value="">All fields</option>
              {Object.entries(FIELD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {current?.status === "report" && (
              <Button size="sm" className="ml-auto" onClick={() => onApply(current)} disabled={busy}>Apply check #{current.id}</Button>
            )}
          </div>
          {current && (
            <p className="text-sm text-muted-foreground">
              {current.summary.changed} changed, {current.summary.added} added, {current.summary.removed} removed rows ·{" "}
              {current.summary.employees} employees · months: {(current.summary.months || []).map((m: any) => `${MONTHS[m.month - 1]} ${m.year}`).join(", ")}
              {current.status === "applied" && <> · applied {fmtWhen(current.applied_at)} by {current.applied_by}</>}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">Employee</th><th className="p-2">Month</th><th className="p-2">What</th><th className="p-2">Previous → Oracle now</th></tr>
            </thead>
            <tbody>
              {q.data?.rows.map((c) => (
                <tr key={c.id} className="border-t align-top">
                  <td className="p-2"><button type="button" className="font-medium text-primary hover:underline text-left" onClick={() => onEmployee(c.ecode)}>{c.ecode}{c.name ? ` · ${c.name}` : ""}</button></td>
                  <td className="p-2 whitespace-nowrap">{monthOf(c)}{c.sal_code !== 1 ? ` · ${salType(c.sal_code)}` : ""}{c.line_no > 1 ? ` · row ${c.line_no}` : ""}</td>
                  <td className="p-2">
                    <Badge variant="outline" className={c.kind === "added" ? "border-green-300 text-green-700" : c.kind === "removed" ? "border-red-300 text-red-700" : "border-amber-300 text-amber-700"}>
                      {c.kind === "added" ? "Added in Oracle" : c.kind === "removed" ? "Removed in Oracle" : "Changed"}
                    </Badge>
                  </td>
                  <td className="p-2 text-xs">
                    {c.fields?.map((f) => (
                      <div key={f.field}>
                        <span className="text-muted-foreground">{FIELD_LABELS[f.field] || f.field}: </span>
                        <span className="line-through decoration-red-400 text-red-700">{valueOf(f.field, f.old)}</span> →{" "}
                        <span className="font-medium text-green-800">{valueOf(f.field, f.new)}</span>
                      </div>
                    ))}
                    {!c.fields && <span className="text-muted-foreground">whole row</span>}
                  </td>
                </tr>
              ))}
              {q.data && !q.data.rows.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nothing here.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {page + 1} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ── Every button press ──────────────────────────────────────────────────────
function RunsTab({ runs, onReport }: { runs: Run[]; onReport: (id: number) => void }) {
  if (!runs.length) return <p className="text-sm text-muted-foreground">Nothing run yet.</p>;
  const STATUS: Record<string, string> = {
    running: "Running", done: "Done", report: "Changes found — not applied", applied: "Changes applied", failed: "Failed",
  };
  return (
    <Card>
      <CardContent className="pt-6 space-y-2 text-sm">
        {runs.map((r) => (
          <div key={r.id} className="border rounded-md p-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1">
              <div className="font-medium">#{r.id} · {r.kind === "new" ? "Add new months" : "Check changes"} · {fmtWhen(r.created_at)} · {r.created_by}</div>
              <div className={`text-xs ${r.status === "failed" ? "text-red-700" : "text-muted-foreground"}`}>
                {STATUS[r.status] || r.status}
                {r.kind === "new" && r.status === "done" && <> · {r.summary.months} months, {(r.summary.rows || 0).toLocaleString("en-IN")} rows{r.summary.months ? ` (${(r.summary.added || []).slice(0, 6).join(", ")}${r.summary.added?.length > 6 ? " …" : ""})` : ""}</>}
                {r.kind === "check" && (r.status === "done" || r.status === "report" || r.status === "applied") && <> · {r.summary.monthsChecked} months checked, {r.summary.changed} changed, {r.summary.added} added, {r.summary.removed} removed{r.summary.newMonths ? ` · ${r.summary.newMonths} new months not copied yet` : ""}</>}
                {r.status === "applied" && <> · applied {fmtWhen(r.applied_at)} by {r.applied_by}</>}
                {r.error && <> · {r.error}</>}
              </div>
            </div>
            {r.kind === "check" && (r.status === "report" || r.status === "applied") && (
              <Button size="sm" variant="outline" onClick={() => onReport(r.id)}>View changes</Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── One employee, every month ───────────────────────────────────────────────
function EmployeeDialog({ ecode, onClose, desigName, deptName, salType }: {
  ecode: string; onClose: () => void; desigName: (c: string | null) => string; deptName: (c: string | null) => string; salType: (c: number) => string;
}) {
  const q = useQuery<{ rows: Row[]; changes: any[] }>({ queryKey: [`/api/admin/paybill/employee/${encodeURIComponent(ecode)}`] });
  const rows = q.data?.rows || [];
  const name = rows.find((r) => r.name)?.name;
  // Newest first; a value is highlighted when it differs from the previous regular bill
  const shown = useMemo(() => {
    let prev: Row | null = null;
    const out = rows.map((r) => {
      const changed = new Set<string>();
      if (r.sal_code === 1 && prev) for (const c of COMPARE_COLS) if ((r as any)[c] !== (prev as any)[c]) changed.add(c);
      if (r.sal_code === 1) prev = r;
      return { r, changed };
    });
    return out.reverse();
  }, [rows]);
  const cell = (x: { r: Row; changed: Set<string> }, c: string, content: React.ReactNode, right = false) => (
    <td className={`p-1.5 ${right ? "text-right tabular-nums" : ""} ${x.changed.has(c) ? "bg-amber-100 font-medium" : ""}`}>{content}</td>
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5" /> {ecode}{name ? ` · ${name}` : ""}</DialogTitle>
          <DialogDescription>
            {rows.length.toLocaleString("en-IN")} paybill rows{rows.length ? `, ${monthOf(rows[0])} – ${monthOf(rows[rows.length - 1])}` : ""}.
            Yellow = different from the previous regular salary.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {q.isLoading ? <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white text-left text-muted-foreground">
                <tr>
                  <th className="p-1.5">Month</th><th className="p-1.5">Designation</th><th className="p-1.5">Department</th>
                  <th className="p-1.5">D.Ast</th><th className="p-1.5">Register</th><th className="p-1.5">Full pay</th>
                  <th className="p-1.5 text-right">Basic</th><th className="p-1.5 text-right">NPA</th><th className="p-1.5 text-right">DA</th>
                  <th className="p-1.5 text-right">HRA</th><th className="p-1.5 text-right">TA</th><th className="p-1.5 text-right">Pat</th>
                  <th className="p-1.5 text-right">Nurs</th><th className="p-1.5 text-right">Ann</th><th className="p-1.5 text-right">GP</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => {
                  const r = x.r;
                  return (
                    <tr key={`${r.src}${r.yr_no}${r.mth_no}${r.sal_code}${r.line_no}`} className={`border-t ${r.sal_code !== 1 ? "bg-violet-50/60" : ""}`}>
                      <td className="p-1.5 whitespace-nowrap font-medium">{monthOf(r)}{r.sal_code !== 1 ? <span className="text-violet-700"> · {salType(r.sal_code)}</span> : ""}</td>
                      {cell(x, "desig_code", desigName(r.desig_code))}
                      {cell(x, "deptt", deptName(r.deptt))}
                      {cell(x, "d_ast", r.d_ast)}
                      {cell(x, "sal_no", r.sal_no)}
                      <td className="p-1.5 whitespace-nowrap">{fmtDate(r.full_pay_fdate)}{r.full_pay_tdate ? ` – ${fmtDate(r.full_pay_tdate)}` : ""}</td>
                      {AMOUNT_COLS.map((c) => <React.Fragment key={c}>{cell(x, c, money((r as any)[c]), true)}</React.Fragment>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!!q.data?.changes?.length && (
            <div className="mt-4">
              <h3 className="font-semibold text-sm mb-1">Changes Oracle made later (found by checks)</h3>
              <ul className="text-xs space-y-1">
                {q.data.changes.map((c: any, i: number) => (
                  <li key={i}>
                    <b>{MONTHS[c.mth_no - 1]} {c.yr_no}</b> · check #{c.run_id} ({c.status === "applied" ? "applied" : "not applied"}) ·{" "}
                    {c.kind === "changed" ? (c.fields || []).map((f: any) => `${FIELD_LABELS[f.field] || f.field}: ${valueOf(f.field, f.old)} → ${valueOf(f.field, f.new)}`).join("; ")
                      : c.kind === "added" ? "row added in Oracle" : "row removed in Oracle"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
