// Wages payroll for Revolving Funds or Other Similar Funds staff — Accounts, Bill and Students sections (and the Super Admin
// looking at one of them). Month view → roll editor. Rules: shared/wagePayroll.ts.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AdminHeader from "@/components/layout/admin-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, Info, Landmark, Loader2, Pencil, Printer, ReceiptText, Settings } from "lucide-react";
import { getAdminAccess, useAdminSection } from "@/lib/admin-access";
import { sectionLabel } from "@shared/sections";
import { calculateLine, WAGE_CATEGORY_LABELS, type StatutorySet, type WageCategory } from "@shared/wagePayroll";
import { PayrollSettingsDialog, sectionQuery } from "@/components/admin/payroll-settings";

const API = "/api/admin/payroll";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const inr = (n: number | string | null | undefined) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
const num = (n: number | string | null | undefined) => (Number(n) || 0).toLocaleString("en-IN");

type Totals = Record<string, number>;
type Warning = { code: string; text: string; block?: boolean };
type Line = Record<string, any> & { id: number; warnings: Warning[] };
type MonthDept = {
  departmentId: number; departmentName: string; staff: number; fundCode: string; fundName: string; headName: string; paymentCode: string;
  attendance: "received" | "pending" | "none";
  roll: { id: number; status: "draft" | "finalised" | "passed"; totals: Totals | null; pageNo: string | null } | null;
};
type RollDetail = {
  roll: Record<string, any>;
  lines: Line[];
  blocking: boolean;
  noAttendance: Array<{ epid: string; name: string }>;
  history: Array<{ action: string; detail: string | null; by_user: string; at: string }>;
};

function defaultMonth() {
  const t = new Date();
  if (t.getDate() <= 10) t.setMonth(t.getMonth() - 1, 1);
  return { month: t.getMonth() + 1, year: t.getFullYear() };
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  finalised: { label: "Finalised", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  passed: { label: "Passed", cls: "bg-green-100 text-green-800 border-green-200" },
};
const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant="outline" className={STATUS_BADGE[status]?.cls}>{STATUS_BADGE[status]?.label || status}</Badge>
);

export default function AdminPayroll() {
  const section = useAdminSection();
  const access = getAdminAccess();
  const isSuper = access.isSuperAdmin && !access.isSalaryAdmin;
  const [rollId, setRollId] = useState<number | null>(() => {
    const v = Number(new URLSearchParams(window.location.search).get("roll"));
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const [ym, setYm] = useState(defaultMonth);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"wage" | "funds">("wage");
  const openSettings = (tab: "wage" | "funds") => { setSettingsTab(tab); setSettingsOpen(true); };

  const openRoll = (id: number | null) => {
    setRollId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("roll", String(id)); else url.searchParams.delete("roll");
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Wages Payroll</h1>
            {section !== "salary" && <p className="text-sm text-slate-600">{sectionLabel(section)}</p>}
          </div>
          {section !== "salary" && (
            <Button variant="outline" size="sm" onClick={() => openSettings("wage")}><Settings className="h-4 w-4 mr-2" /> Settings</Button>
          )}
        </div>

        {section === "salary" ? (
          <Card><CardContent className="py-8 text-center text-slate-600">Choose Accounts, Bill or Students section from the header.</CardContent></Card>
        ) : rollId ? (
          <RollEditor key={`${section}-${rollId}`} id={rollId} section={section} onBack={() => openRoll(null)} />
        ) : (
          <MonthView section={section} ym={ym} setYm={setYm} onOpen={openRoll} onFunds={() => openSettings("funds")} />
        )}
      </main>
      {section !== "salary" && (
        <PayrollSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} section={section} isSuper={isSuper} initialTab={settingsTab} />
      )}
    </div>
  );
}

// ── Month view ───────────────────────────────────────────────────────────────

const deptKey = (d: { departmentId: number; fundCode: string }) => `${d.departmentId}|${d.fundCode}`;

function MonthView({ section, ym, setYm, onOpen, onFunds }: {
  section: string; ym: { month: number; year: number }; setYm: (v: { month: number; year: number }) => void; onOpen: (id: number) => void;
  onFunds: () => void;
}) {
  const { toast } = useToast();
  const [creating, setCreating] = useState<string | null>(null);
  const key = [`${API}/month`, section, ym.month, ym.year];
  const { data, isLoading } = useQuery<{ departments: MonthDept[] }>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `${API}/month?month=${ym.month}&year=${ym.year}&${sectionQuery(section)}`)).json(),
  });
  const depts = data?.departments || [];

  const prepare = async (d: MonthDept) => {
    setCreating(deptKey(d));
    try {
      const res = await apiRequest("POST", `${API}/rolls`, { departmentId: d.departmentId, fundCode: d.fundCode, month: ym.month, year: ym.year, section });
      const { id } = await res.json();
      queryClient.invalidateQueries({ queryKey: [`${API}/month`] });
      onOpen(id);
    } catch (e: any) {
      toast({ title: "Roll not prepared", description: e.message, variant: "destructive" });
    }
    setCreating(null);
  };

  const summary = useMemo(() => {
    const s = { passed: 0, finalised: 0, draft: 0, none: 0, gross: 0, net: 0, employer: 0 };
    for (const d of depts) {
      if (!d.roll) { s.none++; continue; }
      s[d.roll.status]++;
      const t = d.roll.totals || {};
      s.gross += Number(t.gross) || 0;
      s.net += Number(t.net) || 0;
      s.employer += (Number(t.er_epf_total) || 0) + (Number(t.er_esi) || 0);
    }
    return s;
  }, [depts]);

  const years = [ym.year - 1, ym.year, ym.year + 1];

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Month</Label>
          <Select value={String(ym.month)} onValueChange={(v) => setYm({ ...ym, month: Number(v) })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Year</Label>
          <Select value={String(ym.year)} onValueChange={(v) => setYm({ ...ym, year: Number(v) })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Stat label="Passed" value={summary.passed} />
        <Stat label="Finalised" value={summary.finalised} />
        <Stat label="Draft" value={summary.draft} />
        <Stat label="Not prepared" value={summary.none} />
        <Stat label="Total gross" value={inr(summary.gross)} />
        <Stat label="Total net" value={inr(summary.net)} />
        <Stat label="Employer EPF + ESI" value={inr(summary.employer)} />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department / fund <button type="button" className="ml-2 text-blue-700 dark:text-blue-400 underline text-xs font-normal" onClick={onFunds}>Funds</button></TableHead>
                <TableHead className="text-right">Staff</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Roll</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></TableCell></TableRow>}
              {!isLoading && depts.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No departments with wage staff in this section.</TableCell></TableRow>}
              {depts.map((d) => (
                <TableRow key={deptKey(d)}>
                  <TableCell>
                    <div className="font-medium">{d.departmentName}</div>
                    {d.fundCode ? (
                      <div className="text-xs text-slate-500">{d.fundName} <span className="font-mono">{d.paymentCode || d.fundCode}</span></div>
                    ) : (
                      <div className="text-xs text-amber-700 dark:text-amber-400">Fund not set <span className="text-slate-500">— set the Payment Code in the employee record</span></div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{d.staff}</TableCell>
                  <TableCell><AttendanceBadge value={d.attendance} /></TableCell>
                  <TableCell>{d.roll ? <StatusBadge status={d.roll.status} /> : <span className="text-slate-400">Not prepared</span>}</TableCell>
                  <TableCell className="text-right">{d.roll?.totals ? num(d.roll.totals.employees) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.roll?.totals ? inr(d.roll.totals.gross) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.roll?.totals ? inr(d.roll.totals.net) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {d.roll ? (
                      <Button size="sm" variant="outline" onClick={() => onOpen(d.roll!.id)}>Open</Button>
                    ) : d.attendance === "received" ? (
                      <Button size="sm" disabled={creating === deptKey(d)} onClick={() => prepare(d)}>
                        {creating === deptKey(d) &&<Loader2 className="h-4 w-4 mr-2 animate-spin" />} Prepare roll
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MonthlyFiles section={section} ym={ym} />
    </>
  );
}

// ── Monthly files (bank sheet, EPF ECR, ESI sheet, liability) ────────────────

type ExportSummary = {
  rolls: Record<string, number>;
  employees: number;
  totals: Totals;
  epfMembers: number;
  esiMembers: number;
  missingUan: Array<{ epid: string; name: string }>;
  missingEsiNo: Array<{ epid: string; name: string }>;
  missingBank: Array<{ epid: string; name: string }>;
};

function MonthlyFiles({ section, ym }: { section: string; ym: { month: number; year: number } }) {
  const [openList, setOpenList] = useState<string | null>(null);
  const { data, isLoading } = useQuery<ExportSummary>({
    queryKey: [`${API}/exports/summary`, section, ym.month, ym.year],
    queryFn: async () => (await apiRequest("GET", `${API}/exports/summary?month=${ym.month}&year=${ym.year}&${sectionQuery(section)}`)).json(),
  });
  const passed = data?.rolls?.passed || 0;
  const t = data?.totals || {};
  const fileUrl = (name: string) => `${API}/exports/${name}?month=${ym.month}&year=${ym.year}&${sectionQuery(section)}`;
  // Rolls of any status this month (the Pay Register lists them all, with their status)
  const anyRoll = Object.values(data?.rolls || {}).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
  const files = [
    { name: "bank.xlsx", label: "Bank payment sheet", icon: Landmark },
    { name: "ecr.txt", label: "EPF ECR (.txt)", icon: FileText },
    { name: "esi.xlsx", label: "ESI sheet", icon: FileSpreadsheet },
    { name: "liability.xlsx", label: "Employer liability", icon: FileSpreadsheet },
  ];
  const lists = [
    { key: "uan", title: "Missing UAN", rows: data?.missingUan || [] },
    { key: "esi", title: "Missing ESI number", rows: data?.missingEsiNo || [] },
    { key: "bank", title: "Missing bank account / IFSC", rows: data?.missingBank || [] },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h2 className="font-semibold">Monthly files — {MONTHS[ym.month - 1]} {ym.year}</h2>
          <p className="text-xs text-slate-500">The Pay Register lists every roll of the month with its status; the bank, EPF, ESI and liability files include only rolls passed for payment.</p>
        </div>

        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : data && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <span>Rolls:</span>
              <StatusBadge status="passed" /> <b>{data.rolls.passed || 0}</b>
              <StatusBadge status="finalised" /> <b>{data.rolls.finalised || 0}</b>
              <StatusBadge status="draft" /> <b>{data.rolls.draft || 0}</b>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <Stat label="Employees (passed)" value={num(data.employees)} />
              <Stat label="Total gross" value={inr(t.gross)} />
              <Stat label="Total net" value={inr(t.net)} />
              <Stat label="Employee EPF" value={inr(t.epf)} />
              <Stat label="Employee ESI" value={inr(t.esi)} />
              <Stat label="Employee MAS" value={inr(t.mas)} />
              <Stat label="Employer EPF" value={inr(t.er_epf_total)} />
              <Stat label="Employer ESI" value={inr(t.er_esi)} />
              <Stat label="EPF members" value={num(data.epfMembers)} />
              <Stat label="ESI members" value={num(data.esiMembers)} />
            </div>

            <div className="space-y-2">
              {lists.map((l) => l.rows.length > 0 && (
                <div key={l.key} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <button type="button" aria-expanded={openList === l.key} onClick={() => setOpenList(openList === l.key ? null : l.key)}
                    className="flex items-center gap-1 text-sm font-medium text-amber-900">
                    {openList === l.key ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <AlertTriangle className="h-4 w-4" /> {l.title} ({l.rows.length})
                  </button>
                  {openList === l.key && (
                    <ul className="mt-2 text-sm columns-1 md:columns-3">
                      {l.rows.map((e) => <li key={e.epid}><span className="font-mono">{e.epid}</span> {e.name}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={isLoading || anyRoll === 0}
            title="Every employee with Basic, VDA, Gross, EPF, ESI, MAS, total deductions, net payable and employer's share, with totals and a summary per fund (all rolls of the month)"
            onClick={() => window.open(fileUrl("register.xlsx"), "_blank", "noopener")}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Pay Register (deductions &amp; payments)
          </Button>
          {files.map((f) => (
            <Button key={f.name} variant="outline" disabled={isLoading || passed === 0}
              onClick={() => window.open(fileUrl(f.name), "_blank", "noopener")}>
              <f.icon className="h-4 w-4 mr-2" /> {f.label}
            </Button>
          ))}
        </div>
        {!isLoading && passed === 0 && <p className="text-sm text-slate-500">No roll has been passed for payment this month, so there is nothing to download yet.</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </CardContent></Card>
  );
}

function AttendanceBadge({ value }: { value: MonthDept["attendance"] }) {
  if (value === "received") return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Received</Badge>;
  if (value === "pending") return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
  return <Badge variant="outline" className="bg-slate-100 text-slate-600">Not received</Badge>;
}

// ── Roll editor ──────────────────────────────────────────────────────────────

const todayIso = () => new Date().toISOString().slice(0, 10);
const longDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
};

function RollEditor({ id, section, onBack }: { id: number; section: string; onBack: () => void }) {
  const { toast } = useToast();
  const url = `${API}/rolls/${id}`;
  const key = [url, section];
  const { data, isLoading, error, refetch } = useQuery<RollDetail>({
    queryKey: key,
    queryFn: async () => (await apiRequest("GET", `${url}?${sectionQuery(section)}`)).json(),
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<"rebuild" | "delete" | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [headOpen, setHeadOpen] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { if (data) setLines(data.lines); }, [data]);

  if (isLoading) return <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin inline text-slate-400" /></div>;
  if (error || !data) return (
    <Card><CardContent className="py-8 text-center space-y-3">
      <p className="text-red-700">{(error as Error)?.message || "Roll not found."}</p>
      <Button variant="outline" onClick={onBack}>Back</Button>
    </CardContent></Card>
  );

  const roll = data.roll;
  const rates = roll.rates as { statutory: StatutorySet };
  const draft = roll.status === "draft";
  const blocking = lines.some((l) => l.warnings?.some((w) => w.block));
  const headMissing = !roll.head_name || !roll.payment_code;
  const sum = (k: string) => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);

  const fail = (title: string) => (e: any) => toast({ title, description: e.message, variant: "destructive" });
  const body = (extra: object = {}) => ({ ...extra, section });
  const reload = async () => {
    queryClient.invalidateQueries({ queryKey: [`${API}/month`] });
    await refetch();
  };
  const act = async (name: string, fn: () => Promise<unknown>, okTitle: string) => {
    setBusy(name);
    try { await fn(); toast({ title: okTitle }); await reload(); }
    catch (e: any) { fail("Not done")(e); }
    setBusy("");
  };

  const musterUrl = `${API}/rolls/${id}/muster.pdf?${sectionQuery(section)}`;
  const slipsUrl = `${API}/rolls/${id}/slips.pdf?${sectionQuery(section)}`;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h2 className="text-lg font-semibold">{roll.department_name}{roll.fund_code ? <span className="text-sm font-normal text-slate-600 dark:text-slate-400"> · {roll.fund_code}</span> : null}</h2>
          <span className="text-slate-600">{MONTHS[roll.month - 1]} {roll.year} · {roll.sectionLabel}</span>
          <StatusBadge status={roll.status} />
        </div>

        <Card><CardContent className="p-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-slate-500">Payment head: </span>
            {roll.head_name ? <b>{roll.head_name}</b> : <span className="text-red-700">not set</span>}
            <span className="text-slate-500"> · Code: </span>
            {roll.payment_code ? <b className="font-mono">{roll.payment_code}</b> : <span className="text-red-700">not set</span>}
            {draft && <button type="button" className="ml-2 text-blue-700 underline text-xs" onClick={() => setHeadOpen(true)}><Pencil className="h-3 w-3 inline mr-1" />Edit head / code for this roll</button>}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 ml-auto">
            <span>Employees <b>{lines.length}</b></span>
            <span>Gross <b>{inr(sum("gross"))}</b></span>
            <span>Deductions <b>{inr(sum("epf") + sum("esi") + sum("mas"))}</b></span>
            <span>Net <b>{inr(sum("net"))}</b></span>
          </div>
        </CardContent></Card>

        {roll.status === "passed" && (
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Passed for payment on {longDate(roll.passed_on)}, Page No. {roll.page_no}
          </p>
        )}

        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>S.No.</TableHead><TableHead>EPID</TableHead><TableHead>Name</TableHead><TableHead>Designation</TableHead>
                <TableHead>Category</TableHead><TableHead className="text-right">Rate / day</TableHead><TableHead>Days</TableHead>
                <TableHead className="text-right">Gross</TableHead><TableHead>EPF</TableHead><TableHead>ESI</TableHead><TableHead>MAS</TableHead>
                <TableHead className="text-right">Net</TableHead><TableHead>Checks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <LineRow key={l.id} line={l} editable={draft} statutory={rates.statutory} rollId={id} section={section}
                  slipUrl={`${slipsUrl}&line=${l.id}`}
                  onSaved={(u) => setLines((all) => all.map((x) => (x.id === u.id ? { ...x, ...u } : x)))}
                  onError={fail("Not saved")} />
              ))}
              {lines.length === 0 && <TableRow><TableCell colSpan={13} className="text-center py-6 text-slate-500">No employees on this roll.</TableCell></TableRow>}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={6}>Total ({lines.length})</TableCell>
                <TableCell>{num(sum("days"))}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(sum("gross"))}</TableCell>
                <TableCell className="tabular-nums">{inr(sum("epf"))}</TableCell>
                <TableCell className="tabular-nums">{inr(sum("esi"))}</TableCell>
                <TableCell className="tabular-nums">{inr(sum("mas"))}</TableCell>
                <TableCell className="text-right tabular-nums">{inr(sum("net"))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent></Card>

        <div className="flex flex-wrap items-center gap-2">
          {draft && (
            <>
              <Button variant="outline" disabled={!!busy} onClick={() => setConfirm("rebuild")}>Rebuild from attendance</Button>
              <Button disabled={!!busy || blocking || headMissing || lines.length === 0}
                onClick={() => act("finalise", () => apiRequest("POST", `${url}/finalise`, body()), "Roll finalised")}>
                {busy === "finalise" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Finalise
              </Button>
              <Button variant="outline" className="text-red-700" disabled={!!busy} onClick={() => setConfirm("delete")}>Delete roll</Button>
              {(blocking || headMissing) && (
                <span className="text-sm text-red-700">
                  {headMissing ? "Enter the payment head and code first. " : ""}{blocking ? "Fix the rows marked in red under Checks." : ""}
                </span>
              )}
            </>
          )}
          {roll.status === "finalised" && (
            <>
              <Button variant="outline" onClick={() => setReopenOpen(true)}>Reopen</Button>
              <Button onClick={() => setPassOpen(true)}>Pass for payment</Button>
            </>
          )}
          {roll.status !== "draft" && (
            <>
              <Button variant="outline" onClick={() => window.open(musterUrl, "_blank", "noopener")}><Printer className="h-4 w-4 mr-2" /> Print Muster Roll</Button>
              <Button variant="outline" onClick={() => window.open(`${musterUrl}&download=1`, "_blank", "noopener")}><Download className="h-4 w-4 mr-2" /> Download</Button>
            </>
          )}
          {lines.length > 0 && (
            <>
              <Button variant="outline" onClick={() => window.open(slipsUrl, "_blank", "noopener")}><ReceiptText className="h-4 w-4 mr-2" /> Pay slips (PDF)</Button>
              <Button variant="outline" onClick={() => window.open(`${API}/rolls/${id}/register.xlsx?${sectionQuery(section)}`, "_blank", "noopener")}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Pay Register (Excel)
              </Button>
            </>
          )}
        </div>

        <Collapse title={`Staff without attendance this month (${data.noAttendance.length})`} open={showMissing} onToggle={() => setShowMissing((v) => !v)}>
          {data.noAttendance.length === 0 ? <p className="text-slate-500 text-sm">None.</p> : (
            <ul className="text-sm columns-1 md:columns-3">
              {data.noAttendance.map((e) => <li key={e.epid}><span className="font-mono">{e.epid}</span> {e.name}</li>)}
            </ul>
          )}
        </Collapse>
        <Collapse title={`History (${data.history.length})`} open={showHistory} onToggle={() => setShowHistory((v) => !v)}>
          <ul className="text-sm space-y-1">
            {data.history.map((h, i) => (
              <li key={i}>
                <span className="text-slate-500">{new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>{" "}
                <b className="capitalize">{h.action}</b> by {h.by_user}{h.detail ? ` — ${h.detail}` : ""}
              </li>
            ))}
          </ul>
        </Collapse>
      </div>

      {headOpen && (
        <RollHeadDialog rollUrl={url} section={section} headName={roll.head_name || ""} paymentCode={roll.payment_code || ""}
          onClose={() => setHeadOpen(false)} onSaved={reload} />
      )}
      {reopenOpen && <ReasonDialog onClose={() => setReopenOpen(false)} onSubmit={(reason) => act("reopen", () => apiRequest("POST", `${url}/reopen`, body({ reason })), "Roll reopened").then(() => setReopenOpen(false))} />}
      {passOpen && <PassDialog onClose={() => setPassOpen(false)} onSubmit={(pageNo, passedOn) => act("pass", () => apiRequest("POST", `${url}/pass`, body({ pageNo, passedOn })), "Roll passed for payment").then(() => setPassOpen(false))} />}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? "Delete this roll?" : "Rebuild from attendance?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete" ? "The draft roll and all its lines will be deleted." : "The roll is made again from the attendance and employee records. Manual changes (days, reasons, EPF / ESI / MAS switches) are lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const c = confirm;
              setConfirm(null);
              if (c === "rebuild") act("rebuild", () => apiRequest("POST", `${url}/rebuild`, body()), "Roll rebuilt");
              if (c === "delete") {
                setBusy("delete");
                apiRequest("DELETE", `${url}?${sectionQuery(section)}`)
                  .then(() => { queryClient.invalidateQueries({ queryKey: [`${API}/month`] }); toast({ title: "Roll deleted" }); onBack(); })
                  .catch(fail("Not deleted"))
                  .finally(() => setBusy(""));
              }
            }}>{confirm === "delete" ? "Delete" : "Rebuild"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function Collapse({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Card><CardContent className="p-3">
      <button type="button" onClick={onToggle} className="flex items-center gap-1 text-sm font-medium" aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </CardContent></Card>
  );
}

// ── One line of the roll ─────────────────────────────────────────────────────

function LineRow({ line, editable, statutory, rollId, section, slipUrl, onSaved, onError }: {
  line: Line; editable: boolean; statutory: StatutorySet; rollId: number; section: string; slipUrl: string;
  onSaved: (l: Line) => void; onError: (e: any) => void;
}) {
  const [days, setDays] = useState(String(line.days));
  const [reason, setReason] = useState(line.adjust_reason || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDays(String(line.days)); setReason(line.adjust_reason || ""); }, [line.days, line.adjust_reason]);

  // Instant preview from the inputs while the save is in flight
  const flags = { epf: !!line.epf_on, esi: !!line.esi_on, esiCovered: !!line.esi_covered, mas: !!line.mas_on };
  const preview = (over: Partial<typeof flags> & { days?: number } = {}) =>
    calculateLine({ basic: Number(line.basic), vda: Number(line.vda), days: over.days ?? (Number(days) || 0), ...flags, ...over }, statutory);
  const shown = saving || Number(days) !== Number(line.days) ? preview() : null;
  const gross = shown ? shown.gross : Number(line.gross);
  const epf = shown ? shown.epf : Number(line.epf);
  const esi = shown ? shown.esi : Number(line.esi);
  const mas = shown ? shown.mas : Number(line.mas);
  const net = shown ? shown.net : Number(line.net);

  const differs = Number(days) !== Number(line.attendance_days ?? line.days);

  const patch = async (change: Record<string, unknown>, optimistic: Partial<Line>) => {
    setSaving(true);
    const prev = line;
    onSaved({ ...line, ...optimistic });
    try {
      const res = await apiRequest("PATCH", `${API}/rolls/${rollId}/lines/${line.id}`, { ...change, section });
      const updated = await res.json();
      onSaved({ ...line, ...updated, id: line.id });
      queryClient.invalidateQueries({ queryKey: [`${API}/month`] });
    } catch (e) {
      onSaved(prev);
      onError(e);
    }
    setSaving(false);
  };

  const saveDays = () => {
    const d = Math.round(Number(days));
    if (!Number.isFinite(d) || d < 0) { setDays(String(line.days)); return; }
    if (d === Number(line.days) && reason.trim() === String(line.adjust_reason || "").trim()) return;
    const p = calculateLine({ basic: Number(line.basic), vda: Number(line.vda), days: d, ...flags }, statutory);
    patch({ days: d, adjustReason: reason }, { days: d, adjust_reason: reason, gross: p.gross, epf: p.epf, esi: p.esi, mas: p.mas, net: p.net });
  };
  const toggle = (field: "epfOn" | "esiOn" | "esiCovered" | "masOn", col: string, v: boolean) => {
    const f = { ...flags, epf: field === "epfOn" ? v : flags.epf, esi: field === "esiOn" ? v : flags.esi, esiCovered: field === "esiCovered" ? v : flags.esiCovered, mas: field === "masOn" ? v : flags.mas };
    const p = calculateLine({ basic: Number(line.basic), vda: Number(line.vda), days: Number(line.days), ...f }, statutory);
    patch({ [field]: v }, { [col]: v, gross: p.gross, epf: p.epf, esi: p.esi, mas: p.mas, net: p.net });
  };

  const warnings = line.warnings || [];
  const rate = (Number(line.basic) || 0) + (Number(line.vda) || 0);

  return (
    <TableRow className={warnings.some((w) => w.block) ? "bg-red-50" : undefined}>
      <TableCell>{line.sno}</TableCell>
      <TableCell className="font-mono">{line.epid}</TableCell>
      <TableCell className="whitespace-nowrap">{line.name}</TableCell>
      <TableCell className="text-xs">{line.designation}</TableCell>
      <TableCell className="text-xs">{line.category ? WAGE_CATEGORY_LABELS[line.category as WageCategory] || line.category : <span className="text-red-700">Missing</span>}</TableCell>
      <TableCell className="text-right tabular-nums">{inr(rate)}</TableCell>
      <TableCell className="min-w-[110px]">
        {editable ? (
          <div className="space-y-1">
            <Input type="number" min={0} max={31} className="h-8 w-20" value={days} aria-label={`Days for ${line.epid}`}
              onChange={(e) => setDays(e.target.value)} onBlur={saveDays} />
            {differs && (
              <>
                <div className="text-[11px] text-slate-500">Attendance: {line.attendance_days}</div>
                <Input className="h-8 w-40" placeholder="Reason" value={reason} aria-label={`Reason for ${line.epid}`}
                  onChange={(e) => setReason(e.target.value)} onBlur={saveDays} />
              </>
            )}
          </div>
        ) : (
          <div>{line.days}{Number(line.days) !== Number(line.attendance_days ?? line.days) && <div className="text-[11px] text-slate-500">Attendance: {line.attendance_days}{line.adjust_reason ? ` · ${line.adjust_reason}` : ""}</div>}</div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{inr(gross)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={!!line.epf_on} disabled={!editable} onCheckedChange={(v) => toggle("epfOn", "epf_on", v)} aria-label={`EPF for ${line.epid}`} />
          <span className="tabular-nums">{inr(epf)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={!!line.esi_on} disabled={!editable} onCheckedChange={(v) => toggle("esiOn", "esi_on", v)} aria-label={`ESI for ${line.epid}`} />
          <span className="tabular-nums">{inr(esi)}</span>
        </div>
        {!!line.esi_on && (
          <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={!!line.esi_covered} disabled={!editable} onChange={(e) => toggle("esiCovered", "esi_covered", e.target.checked)} /> covered
          </label>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={!!line.mas_on} disabled={!editable} onCheckedChange={(v) => toggle("masOn", "mas_on", v)} aria-label={`MAS for ${line.epid}`} />
          <span className="tabular-nums">{inr(mas)}</span>
        </div>
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{inr(net)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`Pay slip of ${line.epid}`} className="text-slate-500 hover:text-blue-700"
                onClick={() => window.open(slipUrl, "_blank", "noopener")}>
                <ReceiptText className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Pay slip (PDF)</TooltipContent>
          </Tooltip>
          {warnings.map((w) => (
            <Tooltip key={w.code}>
              <TooltipTrigger asChild>
                <span tabIndex={0} aria-label={w.text} className={w.block ? "text-red-600" : "text-amber-600"}>
                  {w.block ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                </span>
              </TooltipTrigger>
              <TooltipContent>{w.text}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Small dialogs ────────────────────────────────────────────────────────────

function RollHeadDialog({ rollUrl, section, headName, paymentCode, onClose, onSaved }: {
  rollUrl: string; section: string; headName: string; paymentCode: string; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [h, setH] = useState(headName);
  const [c, setC] = useState(paymentCode);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await apiRequest("PATCH", rollUrl, { headName: h, paymentCode: c, section });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Payment head and code</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label>Payment head</Label><Input value={h} maxLength={150} onChange={(e) => setH(e.target.value)} /></div>
          <div><Label>Payment code</Label><Input value={c} maxLength={20} onChange={(e) => setC(e.target.value.toUpperCase())} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reopen the roll</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label>Reason for reopening</Label><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>Reopen</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PassDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (pageNo: string, passedOn: string) => void }) {
  const [pageNo, setPageNo] = useState("");
  const [date, setDate] = useState(todayIso());
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pass for payment</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">After this the roll cannot be changed.</p>
          <div><Label>Page No.</Label><Input value={pageNo} maxLength={30} onChange={(e) => setPageNo(e.target.value)} /></div>
          <div><Label>Date of passing</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!pageNo.trim() || !date} onClick={() => onSubmit(pageNo.trim(), date)}>Pass for payment</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
