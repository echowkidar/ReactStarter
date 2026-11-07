// Oracle Sync — compare employees with the Oracle payroll master and update them.
// Server side: server/oracleSync.ts (+ rules in server/oracleSyncDiff.ts).
// Reached from Settings; needs the Settings PIN (SettingsPinGate).
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AdminHeader from "@/components/layout/admin-header";
import { SettingsPinGate } from "@/components/admin/settings-pin-gate";
import { SyncTabs } from "@/components/admin/sync-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Database, RefreshCw, DownloadCloud, Loader2, Undo2, Eye, EyeOff, CircleAlert, CheckCircle2,
  SlidersHorizontal, FileSpreadsheet, ChevronDown, ChevronUp, X,
} from "lucide-react";
import salaryAssistants from "@/lib/salary-assistants.json";

// ── Types (same shape as server/oracleSyncDiff.ts) ──────────────────────────
type FieldChange = {
  field: string; label: string; app: string | null; oracle: string;
  suggested: boolean; sensitive?: boolean; quiet?: boolean; fill?: boolean;
};
type DiffItem = {
  epid: string; kind: "existing" | "new" | "missing"; employeeId: number | null;
  name: string; oracleName: string | null; departmentId: number | null; departmentName: string | null;
  deptCode: string | null; posting: string | null; appDAst: string | null; oracleDAst: string | null;
  register: string | null; isActive: string | null;
  oracle: {
    payRelease: string | null; empStatus: string | null; empStatusLabel: string | null; empCat: string | null;
    termApp: string | null; paidLastMonth: boolean; salGroup: string | null;
  } | null;
  changes: FieldChange[];
  status: { action: "disable" | "enable"; suggested: boolean; reasons: string[] } | null;
  suggestedDepartmentId?: number | null;
  suggestedEmploymentStatus?: string | null;
};
type Counts = {
  changes: number; fills: number; disable: number; enable: number;
  newEmployees: number; missing: number; badDates: number; quietOnly: number;
};
type Snapshot = { id: number; fetchedAt: string; fetchedBy: string; paybill: { year: number; month: number }; rowCount: number };
type DiffResponse = {
  snapshot: Snapshot | null; items: DiffItem[]; counts: Counts | null;
  departments: Array<{ id: number; name: string; code: string | null }>;
  fields?: Array<{ field: string; label: string; sensitive: boolean; quiet: boolean }>;
};
type StatusResponse = {
  service: { online: boolean; oracleVersion?: string; latestPaybill?: { year: number; month: number }; error?: string; stopped?: boolean };
  snapshot: Snapshot | null;
};
type Run = {
  id: number; created_at: string; created_by: string; change_count: number;
  summary: { employeesUpdated: number; fieldsChanged: number; disabled: number; enabled: number; created: number; skipped: string[] };
  undone_at: string | null; undone_by: string | null;
  undo_summary: { restored: number; removed: number; keptBecauseChanged: string[] } | null;
};

type RunChange = { id: number; epid: string; name: string; field: string; oldValue: string | null; newValue: string | null };
/** Rows hidden from the lists: "tab|epid" → what the row looked like when hidden */
type Hidden = Record<string, { sig: string; at: string }>;

type SyncConfig = {
  fields: Record<string, boolean>;
  activeFlags: string[];
  paidMeansActive: boolean;
  termExpiredMeansInactive: boolean;
  showNoSalaryOnly: boolean;
};
type ConfigResponse = {
  config: SyncConfig;
  fields: Array<{ field: string; label: string }>;
  payReleaseFlags: Record<string, string>;
};

type Tab = "changes" | "fills" | "disable" | "enable" | "new" | "missing";
const TABS: Array<{ key: Tab; label: string; hint: string; tone: string }> = [
  { key: "changes", label: "Differences", hint: "App value differs from Oracle", tone: "text-amber-700" },
  { key: "fills", label: "Fill empty fields", hint: "Only empty app fields, Oracle has them", tone: "text-sky-700" },
  { key: "disable", label: "Should be disabled", hint: "Active here, no salary in Oracle", tone: "text-red-700" },
  { key: "enable", label: "Should be active", hint: "Inactive here, salary made in Oracle", tone: "text-green-700" },
  { key: "new", label: "New employees", hint: "Salary made in Oracle, not in the app", tone: "text-violet-700" },
  { key: "missing", label: "Not in Oracle", hint: "Active here, ECODE not in Oracle", tone: "text-slate-700" },
];
const APP_STATUSES = ["Permanent", "Probation", "Temporary", "Court Case", "Compensation", "Till Further Order"];
const PAGE_SIZES = [50, 100, 200, 500];
const NO_HIDDEN: Hidden = {};
const STATUS_LABELS: Record<string, string> = {
  isActive: "Status", disableReason: "Disable reason", disableWefDate: "Disable w.e.f.", created: "Employee",
};
const DAST_NAME = new Map((salaryAssistants as Array<{ value: string; label: string }>).map((a) => [a.value, a.label]));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split("-").reverse().join("-") : d || "");
const fmtWhen = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const mask = (v: string | null, show: boolean) => (!v ? "" : show || v.length <= 4 ? v : "•••• " + v.slice(-4));
const shown = (c: FieldChange, v: string | null, showSensitive: boolean) =>
  c.sensitive ? mask(v, showSensitive) : c.field === "termExpiry" ? fmtDate(v) : v || "";

/**
 * Changes shown for an employee — always ALL of them together (differences and
 * empty fields to fill), so one Update brings the whole employee in line.
 * Differences tab: employees with at least one real difference.
 * Fill empty fields tab: employees whose only changes are empty app fields.
 * The field filter picks employees that have a change in that field.
 * (Oracle-only bookkeeping fields are never shown.)
 */
function changesFor(item: DiffItem, tab: Tab, fieldFilter: string): FieldChange[] {
  if (tab !== "changes" && tab !== "fills") return [];
  const visible = item.changes.filter((c) => !c.quiet);
  const hasDifference = visible.some((c) => !c.fill);
  if (tab === "changes" ? !hasDifference : hasDifference) return [];
  if (fieldFilter && !visible.some((c) => c.field === fieldFilter)) return [];
  return visible;
}

/**
 * What a row looks like on a tab. A hidden row stays hidden only while this is
 * unchanged — new Oracle data (or an edit in the app) brings it back.
 */
function sigFor(i: DiffItem, tab: Tab): string {
  if (tab === "changes" || tab === "fills") {
    return changesFor(i, tab, "").map((c) => `${c.field}=${c.app ?? ""}>${c.oracle}`).join("|");
  }
  if (tab === "disable" || tab === "enable") {
    return [tab, i.isActive, i.oracle?.payRelease, i.oracle?.empStatus, i.oracle?.termApp?.slice(0, 10)].join("|");
  }
  return tab;
}

const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};
/** expired / valid / none — for the Term filter */
const termState = (i: DiffItem, today: string) =>
  !i.oracle?.termApp ? "none" : i.oracle.termApp.slice(0, 10) < today ? "expired" : "valid";

function inTab(item: DiffItem, tab: Tab, fieldFilter: string): boolean {
  switch (tab) {
    case "changes": case "fills": return item.kind === "existing" && changesFor(item, tab, fieldFilter).length > 0;
    case "disable": return item.status?.action === "disable";
    case "enable": return item.status?.action === "enable";
    case "new": return item.kind === "new";
    case "missing": return item.kind === "missing";
  }
}

export default function OracleSyncPage() {
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
          <OracleSync />
        </SettingsPinGate>
      </div>
    </div>
  );
}

// The view (tab, filters, page) is kept for this browser tab, so a reload or a
// trip to another page comes back to the same place.
const VIEW_KEY = "syncPageView";
function loadView(): Record<string, any> {
  try { const v = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

function OracleSync() {
  const { toast } = useToast();
  const [v0] = useState(loadView);
  const str = (k: string, d = "") => (typeof v0[k] === "string" ? v0[k] : d);
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === v0.tab) ? v0.tab : "changes");
  const [search, setSearch] = useState(str("search"));
  const [dAst, setDAst] = useState(str("dAst"));
  const [fieldFilter, setFieldFilter] = useState(str("fieldFilter"));
  const [sortBy, setSortBy] = useState<"dast" | "register" | "department" | "epid" | "name">(
    ["dast", "register", "department", "epid", "name"].includes(v0.sortBy) ? v0.sortBy : "dast");
  const [page, setPage] = useState<number>(Number.isInteger(v0.page) && v0.page >= 0 ? v0.page : 0);
  const [showSensitive, setShowSensitive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fieldChoice, setFieldChoice] = useState<Record<string, boolean>>({});
  const [newChoice, setNewChoice] = useState<Record<string, { departmentId?: number; status?: string }>>({});
  const [busy, setBusy] = useState<"" | "fetch" | "apply" | "undo">("");
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => Promise<void> } | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES.includes(v0.pageSize) ? v0.pageSize : 50);
  // Filters from the badges under each employee
  const [statusF, setStatusF] = useState(str("statusF"));
  const [releaseF, setReleaseF] = useState(str("releaseF"));
  const [paidF, setPaidF] = useState<"" | "yes" | "no">(v0.paidF === "yes" || v0.paidF === "no" ? v0.paidF : "");
  const [termF, setTermF] = useState(str("termF")); // "" | expired | valid | none | yyyy-mm-dd
  const [showHidden, setShowHidden] = useState(false);
  const [openRun, setOpenRun] = useState<number | null>(null);

  const status = useQuery<StatusResponse>({ queryKey: ["/api/admin/oracle-sync/status"], staleTime: 0 });
  const diff = useQuery<DiffResponse>({ queryKey: ["/api/admin/oracle-sync/diff"], staleTime: Infinity });
  const runs = useQuery<Run[]>({ queryKey: ["/api/admin/oracle-sync/runs"], staleTime: 0 });
  const hiddenQ = useQuery<Hidden>({ queryKey: ["/api/admin/oracle-sync/hidden"], staleTime: Infinity });
  const hidden = hiddenQ.data ?? NO_HIDDEN;

  const items = diff.data?.items || [];
  const counts = diff.data?.counts;
  const departments = diff.data?.departments || [];
  const snapshot = diff.data?.snapshot || null;
  const today = todayStr();

  const isHidden = (i: DiffItem, t: Tab) => hidden[`${t}|${i.epid}`]?.sig === sigFor(i, t);

  // Reset selection when the view changes (not on the first render: the saved
  // view, page included, is put back as it was)
  const viewKey = JSON.stringify([tab, search, dAst, fieldFilter, sortBy, statusF, releaseF, paidF, termF, showHidden, pageSize]);
  const prevView = useRef<string | null>(null);
  const prevSnap = useRef<number | undefined>(undefined);
  const prevTab = useRef<Tab>(tab);
  useEffect(() => {
    const viewChanged = prevView.current !== null && prevView.current !== viewKey;
    // the snapshot first arriving is not a change; a newer fetch is
    const snapChanged = prevSnap.current !== undefined && snapshot?.id !== prevSnap.current;
    prevView.current = viewKey;
    if (snapshot?.id !== undefined) prevSnap.current = snapshot.id;
    if (viewChanged || snapChanged) { setSelected(new Set()); setPage(0); }
  }, [viewKey, snapshot?.id]);
  // Hidden view and term date are per tab
  useEffect(() => {
    if (prevTab.current === tab) return;
    prevTab.current = tab;
    setShowHidden(false); setTermF((t) => (/^\d/.test(t) ? "" : t));
  }, [tab]);
  // Remember the view for this browser tab
  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify({
        tab, search, dAst, fieldFilter, sortBy, page, pageSize, statusF, releaseF, paidF, termF,
      }));
    } catch { /* ignore */ }
  }, [tab, search, dAst, fieldFilter, sortBy, page, pageSize, statusF, releaseF, paidF, termF]);

  // Tile numbers: employees each tab lists (same rule as the tab itself, hidden rows left out)
  const tabCounts = useMemo(() => {
    const out = {} as Record<Tab, number>;
    for (const t of TABS) out[t.key] = items.filter((i) => inTab(i, t.key, "") && !isHidden(i, t.key)).length;
    return out;
  }, [items, hidden]);

  // Choices for the badge filters, from the rows of this tab
  const badgeOptions = useMemo(() => {
    const st = new Map<string, number>(), rel = new Map<string, number>(), terms = new Map<string, number>();
    for (const i of items) {
      if (!i.oracle || !inTab(i, tab, "")) continue;
      const s = i.oracle.empStatusLabel || i.oracle.empStatus || "?";
      st.set(s, (st.get(s) || 0) + 1);
      const r = i.oracle.payRelease || "?";
      rel.set(r, (rel.get(r) || 0) + 1);
      if (i.oracle.termApp) { const d = i.oracle.termApp.slice(0, 10); terms.set(d, (terms.get(d) || 0) + 1); }
    }
    return {
      statuses: [...st.entries()].sort(),
      releases: [...rel.entries()].sort(),
      terms: [...terms.entries()].sort(),
    };
  }, [items, tab]);
  const badgeFilters = !!(statusF || releaseF || paidF || termF);
  const clearBadgeFilters = () => { setStatusF(""); setReleaseF(""); setPaidF(""); setTermF(""); };

  const dAstOptions = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) { if (i.appDAst) s.add(i.appDAst); if (i.oracleDAst) s.add(i.oracleDAst); }
    return [...s].sort();
  }, [items]);

  const fieldOptions = useMemo(() => {
    const s = new Map<string, string>();
    for (const i of items) for (const c of i.changes) if (!c.quiet) s.set(c.field, c.label);
    return [...s.entries()];
  }, [items]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((i) => inTab(i, tab, fieldFilter) &&
      isHidden(i, tab) === showHidden &&
      (!dAst || (i.appDAst || i.oracleDAst) === dAst) &&
      (!statusF || (i.oracle?.empStatusLabel || i.oracle?.empStatus || "?") === statusF) &&
      (!releaseF || (i.oracle?.payRelease || "?") === releaseF) &&
      (!paidF || (!!i.oracle && i.oracle.paidLastMonth === (paidF === "yes"))) &&
      (!termF || (/^\d/.test(termF) ? i.oracle?.termApp?.slice(0, 10) === termF : termState(i, today) === termF)) &&
      (!q || i.epid.includes(q) || i.name.toLowerCase().includes(q) || (i.oracleName || "").toLowerCase().includes(q) ||
        (i.register || "").toLowerCase().includes(q) || (i.departmentName || "").toLowerCase().includes(q)));
    const key = (i: DiffItem) => {
      switch (sortBy) {
        case "dast": return `${i.appDAst || i.oracleDAst || "~"}|${i.register || ""}|${i.epid}`;
        case "register": return `${i.register || "~"}|${i.epid}`;
        case "department": return `${i.departmentName || i.posting || "~"}|${i.epid}`;
        case "name": return `${i.name}|${i.epid}`;
        default: return i.epid;
      }
    };
    return list.sort((a, b) => key(a).localeCompare(key(b)));
  }, [items, tab, search, dAst, fieldFilter, sortBy, statusF, releaseF, paidF, termF, showHidden, hidden, today]);

  // Hidden rows of this tab (with the other filters ignored) — for the "Show hidden" button
  const hiddenInTab = useMemo(() => items.filter((i) => inTab(i, tab, "") && isHidden(i, tab)).length, [items, tab, hidden]);
  // Last hidden row brought back → back to the normal list
  useEffect(() => { if (showHidden && hiddenInTab === 0) setShowHidden(false); }, [showHidden, hiddenInTab]);

  const pageRows = rows.slice(page * pageSize, page * pageSize + pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));

  const isChecked = (epid: string, c: FieldChange) => fieldChoice[`${epid}|${c.field}`] ?? c.suggested;
  const newOf = (i: DiffItem) => ({
    departmentId: newChoice[i.epid]?.departmentId ?? i.suggestedDepartmentId ?? undefined,
    status: newChoice[i.epid]?.status ?? i.suggestedEmploymentStatus ?? undefined,
  });

  /** What the server is asked to do for one row of the current tab (null = nothing chosen) */
  const payloadFor = (i: DiffItem): any | null => {
    if (tab === "changes" || tab === "fills") {
      const fields = changesFor(i, tab, fieldFilter).filter((c) => isChecked(i.epid, c)).map((c) => c.field);
      return fields.length ? { epid: i.epid, fields } : null;
    }
    if (tab === "disable" || tab === "enable") return { epid: i.epid, status: tab };
    if (tab === "new") {
      const n = newOf(i);
      return n.departmentId && n.status ? { epid: i.epid, create: { departmentId: n.departmentId, employmentStatus: n.status } } : null;
    }
    return null;
  };

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/oracle-sync/status"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/oracle-sync/diff"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/oracle-sync/runs"] }),
    ]);
  };

  const fetchFromOracle = async () => {
    setBusy("fetch");
    try {
      const r = await (await apiRequest("POST", "/api/admin/oracle-sync/fetch")).json();
      toast({ title: "Oracle data fetched", description: `${r.kept.toLocaleString()} of ${r.oracleRows.toLocaleString()} payroll rows kept. You can stop the container now.` });
      setFieldChoice({}); setNewChoice({});
      await refreshAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not fetch", description: e.message });
    } finally { setBusy(""); }
  };

  const apply = async (list: any[]) => {
    if (!snapshot || !list.length) return;
    setBusy("apply");
    try {
      const r = await (await apiRequest("POST", "/api/admin/oracle-sync/apply", { snapshotId: snapshot.id, items: list })).json();
      const parts = [
        r.employeesUpdated && `${r.employeesUpdated} employees updated (${r.fieldsChanged} fields)`,
        r.disabled && `${r.disabled} disabled`, r.enabled && `${r.enabled} made active`, r.created && `${r.created} added`,
        r.skipped?.length && `${r.skipped.length} skipped`,
      ].filter(Boolean);
      toast({ title: `Sync run #${r.runId} saved`, description: parts.join(", ") || "Nothing changed" });
      setSelected(new Set());
      await refreshAll();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Update failed", description: e.message });
    } finally { setBusy(""); }
  };

  const askApply = (list: any[], what: string) => {
    if (!list.length) {
      toast({ variant: "destructive", title: "Nothing to update", description: tab === "new" ? "Choose department and status." : "No field is ticked." });
      return;
    }
    setConfirm({
      title: "Update from Oracle?",
      text: `${what}. Every change is written to the employee history and this run can be undone below.`,
      run: () => apply(list),
    });
  };

  const undo = (run: Run) => setConfirm({
    title: `Undo sync run #${run.id}?`,
    text: `Puts back ${run.change_count} values changed by this run. Values changed again since then are kept. Employees added by this run are removed if they have no attendance yet.`,
    run: async () => {
      setBusy("undo");
      try {
        const r = await (await apiRequest("POST", `/api/admin/oracle-sync/runs/${run.id}/undo`)).json();
        toast({ title: `Run #${run.id} undone`, description: `${r.restored} values restored, ${r.removed} added employees removed, ${r.keptBecauseChanged.length} kept` });
        await refreshAll();
      } catch (e: any) {
        toast({ variant: "destructive", title: "Undo failed", description: e.message });
      } finally { setBusy(""); }
    },
  });

  /** Download the list shown now (this tab + filters, all pages) as an Excel file */
  const downloadExcel = () => {
    const tabLabel = TABS.find((t) => t.key === tab)!.label;
    const month = snapshot ? `${MONTHS[snapshot.paybill.month - 1]} ${snapshot.paybill.year}` : "";
    const base = (i: DiffItem): Record<string, string> => ({
      ECODE: i.epid,
      Name: i.name,
      "Oracle Name": i.oracleName || "",
      Department: i.departmentName || "",
      "Oracle Posting": i.posting || "",
      "D.Ast (App)": i.appDAst || "",
      "D.Ast (Oracle)": i.oracleDAst || "",
      "Register No": i.register || "",
      "Status (App)": i.isActive || "",
      "Pay Release (Oracle)": i.oracle?.payRelease || "",
      "Emp Status (Oracle)": i.oracle?.empStatusLabel || i.oracle?.empStatus || "",
      "Term (Oracle)": fmtDate(i.oracle?.termApp || null),
      [`Paid ${month}`]: i.oracle ? (i.oracle.paidLastMonth ? "Yes" : "No") : "",
    });
    let data: Record<string, string>[] = [];
    if (tab === "changes" || tab === "fills") {
      for (const i of rows) for (const c of changesFor(i, tab, fieldFilter)) {
        data.push({
          ...base(i), Field: c.label,
          "App Value": String(shown(c, c.app, showSensitive)), "Oracle Value": String(shown(c, c.oracle, showSensitive)),
          Suggested: c.suggested ? "Yes" : "Check",
        });
      }
    } else if (tab === "disable" || tab === "enable") {
      data = rows.map((i) => ({ ...base(i), Reasons: (i.status?.reasons || []).join("; "), Suggested: i.status?.suggested ? "Yes" : "Check" }));
    } else if (tab === "new") {
      data = rows.map((i) => {
        const v = (f: string) => { const c = i.changes.find((x) => x.field === f); return c ? String(shown(c, c.oracle, showSensitive)) : ""; };
        return {
          ...base(i), "Suggested Department": departments.find((d) => d.id === i.suggestedDepartmentId)?.name || "",
          Designation: v("designation"), "Pay Level": v("payLevel"), "Term Expiry": v("termExpiry"),
          "Employment Status": i.suggestedEmploymentStatus || "", Category: v("employeeCategory"),
          PAN: v("panNumber"), "Bank Account": v("bankAccount"), "Bank Name": v("bankName"), IFSC: v("ifsc"), Aadhar: v("aadharCard"),
        };
      });
    } else {
      data = rows.map(base);
    }
    if (!data.length) { toast({ title: "Nothing to download" }); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map((k) => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tabLabel.slice(0, 31));
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `sync-${tab}${dAst ? "-" + dAst : ""}-${stamp}.xlsx`);
  };

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.epid));
  const toggleRow = (epid: string, on: boolean) => setSelected((s) => { const n = new Set(s); on ? n.add(epid) : n.delete(epid); return n; });
  const selectedPayload = rows.filter((r) => selected.has(r.epid)).map(payloadFor).filter(Boolean);

  const svc = status.data?.service;
  const latest = svc?.latestPaybill;
  const actionTab = tab !== "missing";

  /** Hide rows from this tab (or bring them back). Saved on the server, so it lasts. */
  const setRowsHidden = async (list: DiffItem[], hide: boolean) => {
    if (!list.length) return;
    try {
      const body = hide
        ? { add: list.map((i) => ({ tab, epid: i.epid, sig: sigFor(i, tab) })) }
        : { remove: list.map((i) => `${tab}|${i.epid}`) };
      const r = await (await apiRequest("PUT", "/api/admin/oracle-sync/hidden", body)).json();
      queryClient.setQueryData(["/api/admin/oracle-sync/hidden"], r);
      setSelected(new Set());
      toast({
        title: hide ? `${list.length} hidden` : `${list.length} shown again`,
        description: hide ? "They come back by themselves if Oracle or the app shows something different." : undefined,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save", description: e.message });
    }
  };
  const selectedRows = rows.filter((r) => selected.has(r.epid));

  const actionBar = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{rows.length.toLocaleString()} employees{showHidden ? " (hidden)" : ""}</span>
      <Button size="sm" variant="outline" onClick={() => setSelected(new Set(rows.map((r) => r.epid)))} disabled={!rows.length}>
        Select all {rows.length.toLocaleString()}
      </Button>
      {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!selected.size || !!busy} onClick={() => setRowsHidden(selectedRows, !showHidden)}>
          {showHidden ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
          {showHidden ? "Unhide" : "Hide"} {selected.size} selected
        </Button>
        {actionTab && !showHidden && (
          <Button size="sm" disabled={!selected.size || !!busy}
            onClick={() => askApply(selectedPayload, `${selectedPayload.length} selected employees will be ${tab === "disable" ? "disabled" : tab === "enable" ? "made active" : tab === "new" ? "added" : "updated with the ticked fields"}`)}>
            {busy === "apply" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tab === "disable" ? "Disable" : tab === "enable" ? "Make active" : tab === "new" ? "Add" : "Update"} {selected.size} selected
          </Button>
        )}
      </div>
    </div>
  );

  const fieldLabels = useMemo(() => {
    const m = new Map<string, string>(Object.entries(STATUS_LABELS));
    for (const f of diff.data?.fields || []) m.set(f.field, f.label);
    return m;
  }, [diff.data]);
  const sensitiveFields = useMemo(() => new Set((diff.data?.fields || []).filter((f) => f.sensitive).map((f) => f.field)), [diff.data]);

  return (
    <div className="space-y-4">
      {/* Connection + snapshot */}
      <Card>
        <CardContent className="pt-6 flex flex-col lg:flex-row gap-4 lg:items-center">
          <div className="flex-1 space-y-1 text-sm">
            <div className="flex items-center gap-2 font-medium">
              {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                svc?.online ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
              {status.isLoading ? "Checking the Oracle sync container…" :
                svc?.online ? `Oracle connected (${svc.oracleVersion}) · latest paybill ${latest ? `${MONTHS[latest.month - 1]} ${latest.year}` : "—"}` :
                  "Oracle sync container is not running"}
            </div>
            {!status.isLoading && !svc?.online && (
              <p className="text-muted-foreground">
                {svc?.stopped ? "Portainer → Containers → attendance-oracle-sync → Start, then press Refresh." : svc?.error}
              </p>
            )}
            <p className="text-muted-foreground">
              {snapshot
                ? <>Comparing with Oracle data of <b>{fmtWhen(snapshot.fetchedAt)}</b> (by {snapshot.fetchedBy}, paybill {MONTHS[snapshot.paybill.month - 1]} {snapshot.paybill.year}, {snapshot.rowCount.toLocaleString()} rows).
                  {svc?.online && " The container can be stopped now — the data is kept here."}</>
                : "No Oracle data yet. Start the container and press “Fetch from Oracle”."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${status.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={fetchFromOracle} disabled={!svc?.online || !!busy}>
              {busy === "fetch" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
              Fetch from Oracle
            </Button>
          </div>
        </CardContent>
      </Card>

      {diff.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Comparing…</div>}
      {diff.error && <p className="text-sm text-red-600">{(diff.error as Error).message}</p>}

      {counts && (
        <>
          {/* Category tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`rounded-lg border p-3 text-left transition-colors ${tab === t.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-white hover:bg-slate-50"}`}>
                <div className={`text-2xl font-semibold tabular-nums ${t.tone}`}>{tabCounts[t.key].toLocaleString()}</div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </button>
            ))}
          </div>
          {counts.badDates > 0 && (
            <p className="text-sm text-amber-700">{counts.badDates} employees have a wrong term expiry year in the app (e.g. 22026) — see Differences → Term Expiry.</p>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Input placeholder="Search ECODE, name, register, department" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-72" />
                <select value={dAst} onChange={(e) => setDAst(e.target.value)} className="h-10 rounded-md border px-2 text-sm bg-white" aria-label="Dealing assistant">
                  <option value="">All dealing assistants</option>
                  {dAstOptions.map((d) => <option key={d} value={d}>{DAST_NAME.get(d) || d}</option>)}
                </select>
                {(tab === "changes" || tab === "fills") && (
                  <select value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)} className="h-10 rounded-md border px-2 text-sm bg-white" aria-label="Field">
                    <option value="">All fields</option>
                    {fieldOptions.map(([f, l]) => <option key={f} value={f}>{l}</option>)}
                  </select>
                )}
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-10 rounded-md border px-2 text-sm bg-white" aria-label="Sort">
                  <option value="dast">Sort: Dealing assistant</option>
                  <option value="register">Sort: Register no</option>
                  <option value="department">Sort: Department</option>
                  <option value="epid">Sort: ECODE</option>
                  <option value="name">Sort: Name</option>
                </select>
                <Button variant="ghost" size="sm" onClick={() => setShowSensitive((v) => !v)}>
                  {showSensitive ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  {showSensitive ? "Hide" : "Show"} PAN / bank / Aadhar
                </Button>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={downloadExcel} disabled={!rows.length}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Download Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4 mr-1" /> Configure
                  </Button>
                </div>
              </div>
              {tab !== "missing" && (
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="h-9 rounded-md border px-2 text-sm bg-white" aria-label="Oracle employee status">
                    <option value="">All emp status</option>
                    {badgeOptions.statuses.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
                  </select>
                  <select value={releaseF} onChange={(e) => setReleaseF(e.target.value)} className="h-9 rounded-md border px-2 text-sm bg-white" aria-label="Pay release">
                    <option value="">All pay release</option>
                    {badgeOptions.releases.map(([s, n]) => <option key={s} value={s}>Pay release {s} ({n})</option>)}
                  </select>
                  <select value={paidF} onChange={(e) => setPaidF(e.target.value as any)} className="h-9 rounded-md border px-2 text-sm bg-white" aria-label="Paid">
                    <option value="">Paid / not paid</option>
                    <option value="yes">Paid {snapshot ? MONTHS[snapshot.paybill.month - 1] : ""}</option>
                    <option value="no">Not paid {snapshot ? MONTHS[snapshot.paybill.month - 1] : ""}</option>
                  </select>
                  <select value={termF} onChange={(e) => setTermF(e.target.value)} className="h-9 rounded-md border px-2 text-sm bg-white" aria-label="Term">
                    <option value="">All terms</option>
                    <option value="expired">Term expired</option>
                    <option value="valid">Term not expired</option>
                    <option value="none">No term</option>
                    {badgeOptions.terms.length > 0 && (
                      <optgroup label="Term on">
                        {badgeOptions.terms.map(([d, n]) => <option key={d} value={d}>{fmtDate(d)} ({n})</option>)}
                      </optgroup>
                    )}
                  </select>
                  {badgeFilters && (
                    <Button size="sm" variant="ghost" onClick={clearBadgeFilters}><X className="h-4 w-4 mr-1" /> Clear filters</Button>
                  )}
                  {(hiddenInTab > 0 || showHidden) && (
                    <Button size="sm" variant={showHidden ? "secondary" : "ghost"} className="ml-auto" onClick={() => setShowHidden((v) => !v)}>
                      {showHidden ? "Back to the list" : `Show hidden (${hiddenInTab.toLocaleString()})`}
                    </Button>
                  )}
                </div>
              )}
              {tab === "missing" && (hiddenInTab > 0 || showHidden) && (
                <div className="flex">
                  <Button size="sm" variant={showHidden ? "secondary" : "ghost"} className="ml-auto" onClick={() => setShowHidden((v) => !v)}>
                    {showHidden ? "Back to the list" : `Show hidden (${hiddenInTab.toLocaleString()})`}
                  </Button>
                </div>
              )}
              {actionBar}
            </CardContent>
          </Card>

          {/* Rows */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 w-8">
                      <Checkbox checked={allOnPageSelected} aria-label="Select page"
                        onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => v ? n.add(r.epid) : n.delete(r.epid)); return n; })} />
                    </th>
                    <th className="p-2">Employee</th>
                    <th className="p-2">D.Ast · Register</th>
                    <th className="p-2">{tab === "new" ? "Add with" : tab === "changes" || tab === "fills" ? "App → Oracle" : "Why"}</th>
                    <th className="p-2 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((i) => (
                    <tr key={i.epid} className="border-t align-top">
                      <td className="p-2"><Checkbox checked={selected.has(i.epid)} onCheckedChange={(v) => toggleRow(i.epid, !!v)} aria-label={`Select ${i.epid}`} /></td>
                      <td className="p-2 min-w-[200px]">
                        <div className="font-medium">{i.epid} · {i.name}</div>
                        {i.oracleName && i.oracleName !== i.name && tab !== "new" && <div className="text-xs text-muted-foreground">Oracle: {i.oracleName}</div>}
                        <div className="text-xs text-muted-foreground">
                          {i.departmentName || "—"}{i.posting ? ` · Oracle posting ${i.posting}` : ""}
                          {i.isActive && i.isActive !== "active" ? " · inactive" : ""}
                        </div>
                        {i.oracle && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <button type="button" title="Show only this status" onClick={() => setStatusF(i.oracle!.empStatusLabel || i.oracle!.empStatus || "?")}>
                              <Badge variant="outline" className="text-[10px] hover:bg-slate-100">{i.oracle.empStatusLabel || i.oracle.empStatus || "?"}</Badge>
                            </button>
                            <button type="button" title="Show only this pay release" onClick={() => setReleaseF(i.oracle!.payRelease || "?")}>
                              <Badge variant="outline" className={`text-[10px] hover:bg-slate-100 ${i.oracle.payRelease === "Y" ? "" : "border-red-300 text-red-700"}`}>Pay release {i.oracle.payRelease || "?"}</Badge>
                            </button>
                            <button type="button" title="Show only these" onClick={() => setPaidF(i.oracle!.paidLastMonth ? "yes" : "no")}>
                              <Badge variant="outline" className={`text-[10px] hover:bg-slate-100 ${i.oracle.paidLastMonth ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}`}>
                                {i.oracle.paidLastMonth ? "Paid" : "Not paid"} {snapshot ? MONTHS[snapshot.paybill.month - 1] : ""}
                              </Badge>
                            </button>
                            {i.oracle.termApp && (
                              <button type="button" title="Show only this term date" onClick={() => setTermF(i.oracle!.termApp!.slice(0, 10))}>
                                <Badge variant="outline" className={`text-[10px] hover:bg-slate-100 ${termState(i, today) === "expired" ? "border-red-300 text-red-700" : ""}`}>Term {fmtDate(i.oracle.termApp)}</Badge>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <div>{i.appDAst || "—"}{i.oracleDAst && i.oracleDAst !== i.appDAst ? <span className="text-muted-foreground"> (Oracle {i.oracleDAst})</span> : ""}</div>
                        <div className="text-xs text-muted-foreground">{i.register || ""}</div>
                      </td>
                      <td className="p-2 min-w-[280px]">
                        {(tab === "changes" || tab === "fills") && (
                          <div className="space-y-1">
                            {changesFor(i, tab, fieldFilter).map((c) => (
                              <label key={c.field} className={`flex items-start gap-2 cursor-pointer rounded px-1 ${fieldFilter === c.field ? "bg-amber-50" : ""}`}>
                                <Checkbox className="mt-0.5" checked={isChecked(i.epid, c)}
                                  onCheckedChange={(v) => setFieldChoice((m) => ({ ...m, [`${i.epid}|${c.field}`]: !!v }))} />
                                <span>
                                  <span className="text-muted-foreground">{c.label}: </span>
                                  {c.app !== null
                                    ? <><span className="line-through decoration-red-400">{shown(c, c.app, showSensitive)}</span> → </>
                                    : <span className="text-xs text-sky-700">(empty) → </span>}
                                  <span className="font-medium text-green-800">{shown(c, c.oracle, showSensitive)}</span>
                                  {!c.suggested && <span className="text-xs text-amber-700"> (check)</span>}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                        {(tab === "disable" || tab === "enable") && (
                          <ul className="list-disc pl-4 text-xs">
                            {i.status?.reasons.map((r) => <li key={r}>{r}</li>)}
                            {tab === "disable" && !i.status?.suggested && <li className="text-amber-700">Only “no salary” — check before disabling</li>}
                          </ul>
                        )}
                        {tab === "new" && (
                          <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">
                              {i.changes.filter((c) => ["designation", "salaryRegisterNo", "payLevel", "termExpiry"].includes(c.field))
                                .map((c) => `${c.label}: ${shown(c, c.oracle, true)}`).join(" · ")}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <select className="h-8 rounded border px-1 text-xs bg-white max-w-[220px]" aria-label="Department"
                                value={newOf(i).departmentId ?? ""}
                                onChange={(e) => setNewChoice((m) => ({ ...m, [i.epid]: { ...m[i.epid], departmentId: Number(e.target.value) || undefined } }))}>
                                <option value="">Department…</option>
                                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ""}</option>)}
                              </select>
                              <select className="h-8 rounded border px-1 text-xs bg-white" aria-label="Employment status"
                                value={newOf(i).status ?? ""}
                                onChange={(e) => setNewChoice((m) => ({ ...m, [i.epid]: { ...m[i.epid], status: e.target.value || undefined } }))}>
                                <option value="">Status…</option>
                                {APP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                        {tab === "missing" && <span className="text-xs text-muted-foreground">ECODE {i.epid} is not in the Oracle employee master — check the ECODE.</span>}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-col gap-1 items-stretch">
                          {actionTab && !showHidden && (
                            <Button size="sm" variant="outline" disabled={!!busy}
                              onClick={() => { const p = payloadFor(i); askApply(p ? [p] : [], `${i.epid} · ${i.name}`); }}>
                              {tab === "disable" ? "Disable" : tab === "enable" ? "Activate" : tab === "new" ? "Add" : "Update"}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={!!busy}
                            title={showHidden ? "Show in the list again" : "Remove from the list (nothing is changed)"}
                            onClick={() => setRowsHidden([i], !showHidden)}>
                            {showHidden ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                            {showHidden ? "Unhide" : "Hide"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pageRows.length && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nothing here.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              {actionBar}
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {page + 1} of {pages}</span>
                <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-9 rounded-md border px-2 text-sm bg-white ml-2" aria-label="Rows per page">
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
                </select>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Run history */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Sync runs</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!runs.data?.length && <p className="text-muted-foreground">No updates made yet.</p>}
          {runs.data?.map((r) => (
            <div key={r.id} className="border rounded-md p-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1">
                <div className="font-medium">#{r.id} · {fmtWhen(r.created_at)} · {r.created_by}</div>
                <div className="text-xs text-muted-foreground">
                  {r.summary.employeesUpdated} updated ({r.summary.fieldsChanged} fields), {r.summary.disabled} disabled,
                  {" "}{r.summary.enabled} made active, {r.summary.created} added{r.summary.skipped?.length ? `, ${r.summary.skipped.length} skipped` : ""}
                  {r.undone_at && <> · <span className="text-red-700">undone {fmtWhen(r.undone_at)} by {r.undone_by}</span></>}
                </div>
                {r.undo_summary?.keptBecauseChanged?.length ? (
                  <div className="text-xs text-amber-700">Kept on undo: {r.undo_summary.keptBecauseChanged.slice(0, 5).join("; ")}{r.undo_summary.keptBecauseChanged.length > 5 ? " …" : ""}</div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpenRun((o) => (o === r.id ? null : r.id))} aria-expanded={openRun === r.id}>
                  {openRun === r.id ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />} Details
                </Button>
                {!r.undone_at && (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => undo(r)}>
                    <Undo2 className="h-4 w-4 mr-1" /> Undo
                  </Button>
                )}
              </div>
            </div>
            {openRun === r.id && (
              <RunDetails runId={r.id} labels={fieldLabels} sensitive={sensitiveFields} showSensitive={showSensitive} />
            )}
            </div>
          ))}
        </CardContent>
      </Card>

      <ConfigDialog open={configOpen} onClose={() => setConfigOpen(false)}
        onSaved={async () => { setFieldChoice({}); await queryClient.invalidateQueries({ queryKey: ["/api/admin/oracle-sync/diff"] }); }} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const c = confirm; setConfirm(null); c?.run(); }}>Yes, go ahead</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── What one sync run changed ───────────────────────────────────────────────
function RunDetails({ runId, labels, sensitive, showSensitive }: {
  runId: number; labels: Map<string, string>; sensitive: Set<string>; showSensitive: boolean;
}) {
  const q = useQuery<RunChange[]>({ queryKey: [`/api/admin/oracle-sync/runs/${runId}/changes`], staleTime: 0 });
  const val = (field: string, v: string | null) => {
    if (v === null || v === "") return <span className="text-muted-foreground italic">—</span>;
    if (sensitive.has(field)) return mask(v, showSensitive);
    if (field === "isActive") return v === "active" ? "Active" : "Inactive";
    return fmtDate(v);
  };
  if (q.isLoading) return <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>;
  if (q.error) return <p className="mt-2 text-xs text-red-600">{(q.error as Error).message}</p>;
  const list = q.data || [];
  if (!list.length) return <p className="mt-2 text-xs text-muted-foreground">No field changes recorded.</p>;
  return (
    <div className="mt-2 max-h-96 overflow-auto border-t">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground sticky top-0 bg-white">
          <tr><th className="p-1.5">ECODE · Name</th><th className="p-1.5">Field</th><th className="p-1.5">Previous → New</th></tr>
        </thead>
        <tbody>
          {list.map((c, n) => {
            const first = n === 0 || list[n - 1].epid !== c.epid;
            return (
              <tr key={c.id} className={first ? "border-t" : ""}>
                <td className="p-1.5 font-medium whitespace-nowrap">{first ? `${c.epid} · ${c.name}` : ""}</td>
                <td className="p-1.5">{labels.get(c.field) || c.field}</td>
                <td className="p-1.5">
                  {c.field === "created" ? <span className="text-green-800">Added from Oracle</span> : (
                    <>
                      <span className="text-red-700 line-through decoration-red-300">{val(c.field, c.oldValue)}</span>
                      {" → "}
                      <span className="text-green-800 font-medium">{val(c.field, c.newValue)}</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Configuration dialog ────────────────────────────────────────────────────
function ConfigDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { toast } = useToast();
  const q = useQuery<ConfigResponse>({ queryKey: ["/api/admin/oracle-sync/config"], enabled: open, staleTime: 0 });
  const [cfg, setCfg] = useState<SyncConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open && q.data) setCfg(q.data.config); }, [open, q.data]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/admin/oracle-sync/config", { config: cfg });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/oracle-sync/config"] });
      await onSaved();
      toast({ title: "Configuration saved", description: "The comparison has been worked out again." });
      onClose();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save", description: e.message });
    } finally { setSaving(false); }
  };

  const flagToggle = (f: string, on: boolean) =>
    setCfg((c) => c && ({ ...c, activeFlags: on ? Array.from(new Set([...c.activeFlags, f])) : c.activeFlags.filter((x) => x !== f) }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync configuration</DialogTitle>
          <DialogDescription>Decide what is compared and when Oracle and the app are taken to agree.</DialogDescription>
        </DialogHeader>
        {!cfg || !q.data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-6 text-sm">
            <section className="space-y-2">
              <h3 className="font-semibold">Active / inactive</h3>
              <p className="text-muted-foreground">Oracle pay release values that agree with <b>active</b> in the app. The others mean the employee should be inactive.</p>
              <div className="flex flex-wrap gap-4">
                {Object.entries(q.data.payReleaseFlags).map(([f, label]) => (
                  <label key={f} className="flex items-center gap-2">
                    <Checkbox checked={cfg.activeFlags.includes(f)} onCheckedChange={(v) => flagToggle(f, !!v)} />
                    {f} – {label}
                  </label>
                ))}
              </div>
              <label className="flex items-center justify-between gap-4 border rounded-md p-2">
                <span>A regular salary in the latest paybill month means <b>active</b> (even if the pay release flag says otherwise)</span>
                <Switch checked={cfg.paidMeansActive} onCheckedChange={(v) => setCfg({ ...cfg, paidMeansActive: v })} />
              </label>
              <label className="flex items-center justify-between gap-4 border rounded-md p-2">
                <span>An expired term (TERM_APP) means <b>inactive</b></span>
                <Switch checked={cfg.termExpiredMeansInactive} onCheckedChange={(v) => setCfg({ ...cfg, termExpiredMeansInactive: v })} />
              </label>
              <label className="flex items-center justify-between gap-4 border rounded-md p-2">
                <span>Also list active employees whose only sign is “no salary in the latest month”</span>
                <Switch checked={cfg.showNoSalaryOnly} onCheckedChange={(v) => setCfg({ ...cfg, showNoSalaryOnly: v })} />
              </label>
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">Fields to compare</h3>
              <p className="text-muted-foreground">Switched-off fields are not shown in Differences / Fill empty fields and are never updated.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {q.data.fields.map((f) => (
                  <label key={f.field} className="flex items-center gap-2">
                    <Checkbox checked={cfg.fields[f.field] !== false}
                      onCheckedChange={(v) => setCfg({ ...cfg, fields: { ...cfg.fields, [f.field]: !!v } })} />
                    {f.label}
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!cfg || saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
