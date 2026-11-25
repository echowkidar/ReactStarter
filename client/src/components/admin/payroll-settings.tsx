// Wages payroll settings: daily wage rates, EPF / ESI / MAS rates and the funds (Payment Codes).
// Rates are changed by the Super Admin only; section logins see them read-only.
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Loader2, Pencil, Plus, Upload, X } from "lucide-react";
import {
  WAGE_CATEGORIES, WAGE_CATEGORY_LABELS,
  type StatutorySet, type WageRateSet,
} from "@shared/wagePayroll";

export const sectionQuery = (section: string) => `section=${encodeURIComponent(section)}`;

type Props = { open: boolean; onOpenChange: (o: boolean) => void; section: string; isSuper: boolean; initialTab?: "wage" | "stat" | "funds" };

const SETTINGS_URL = "/api/admin/payroll/settings";
const today = () => new Date().toISOString().slice(0, 10);

type WageRow = { from: string } & Record<(typeof WAGE_CATEGORIES)[number], { basic: string; vda: string }>;
type StatRow = Record<keyof StatutorySet, string>;

const STAT_FIELDS: Array<[Exclude<keyof StatutorySet, "from" | "rounding">, string]> = [
  ["epfEmployeePct", "EPF employee %"], ["epsPct", "EPS % (employer)"], ["epfEmployerPct", "EPF % (employer)"],
  ["edliPct", "EDLI %"], ["epfAdminPct", "EPF admin %"], ["epfCeiling", "EPF ceiling (₹ / month)"],
  ["esiEmployeePct", "ESI employee %"], ["esiEmployerPct", "ESI employer %"], ["esiCeiling", "ESI ceiling (₹ / month)"],
  ["masAmount", "MAS (₹)"],
];

export function PayrollSettingsDialog({ open, onOpenChange, section, isSuper, initialTab }: Props) {
  const { toast } = useToast();
  const { data } = useQuery<{ wageRates: WageRateSet[]; statutory: StatutorySet[] }>({
    queryKey: [SETTINGS_URL, section],
    queryFn: async () => (await apiRequest("GET", `${SETTINGS_URL}?${sectionQuery(section)}`)).json(),
    enabled: open,
  });
  const [wage, setWage] = useState<WageRow[]>([]);
  const [stat, setStat] = useState<StatRow[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!data) return;
    setWage(data.wageRates.map((s) => ({
      from: s.from,
      ...(Object.fromEntries(WAGE_CATEGORIES.map((c) => [c, { basic: String(s[c].basic), vda: String(s[c].vda) }])) as any),
    })));
    setStat(data.statutory.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)])) as StatRow));
  }, [data]);

  const fail = (e: any) => toast({ title: "Not saved", description: e.message, variant: "destructive" });

  const saveWage = async () => {
    setBusy("wage");
    try {
      const sets = wage.map((r) => ({
        from: r.from,
        ...Object.fromEntries(WAGE_CATEGORIES.map((c) => [c, { basic: Number(r[c].basic), vda: Number(r[c].vda) }])),
      }));
      await apiRequest("PUT", `${SETTINGS_URL}/wage-rates`, { sets, section });
      queryClient.invalidateQueries({ queryKey: [SETTINGS_URL] });
      toast({ title: "Wage rates saved" });
    } catch (e) { fail(e); }
    setBusy("");
  };
  const saveStat = async () => {
    setBusy("stat");
    try {
      const sets = stat.map((r) => ({
        from: r.from, rounding: r.rounding,
        ...Object.fromEntries(STAT_FIELDS.map(([k]) => [k, Number(r[k])])),
      }));
      await apiRequest("PUT", `${SETTINGS_URL}/statutory`, { sets, section });
      queryClient.invalidateQueries({ queryKey: [SETTINGS_URL] });
      toast({ title: "EPF / ESI / MAS rates saved" });
    } catch (e) { fail(e); }
    setBusy("");
  };

  const readOnlyNote = !isSuper && (
    <p className="text-xs text-slate-500">Only the Super Admin can change these rates. A roll uses the rates in force for its month.</p>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Payroll settings</DialogTitle></DialogHeader>
        {!data ? <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div> : (
          <Tabs defaultValue={initialTab || "wage"} key={initialTab || "wage"}>
            <TabsList>
              <TabsTrigger value="wage">Wage rates</TabsTrigger>
              <TabsTrigger value="stat">EPF / ESI / MAS</TabsTrigger>
              <TabsTrigger value="funds">Funds (Payment Codes)</TabsTrigger>
            </TabsList>

            <TabsContent value="wage" className="space-y-3 text-sm">
              <p className="text-slate-600">Daily rates per category. Each set applies from its date until the next set starts.</p>
              {wage.map((r, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-xs">From date</Label>
                      <Input type="date" value={r.from} disabled={!isSuper} onChange={(e) => setWage((all) => all.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
                    </div>
                    {isSuper && (
                      <Button variant="ghost" size="sm" disabled={wage.length === 1} aria-label={`Remove rate set ${i + 1}`} onClick={() => setWage((all) => all.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                    )}
                  </div>
                  <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 items-center">
                    <span /><Label className="text-xs">Basic / day</Label><Label className="text-xs">VDA / day</Label><Label className="text-xs">Rate / day</Label>
                    {WAGE_CATEGORIES.map((c) => (
                      <div key={c} className="contents">
                        <span className="font-medium">{WAGE_CATEGORY_LABELS[c]}</span>
                        <Input type="number" min={0} step="0.01" value={r[c].basic} disabled={!isSuper} aria-label={`${WAGE_CATEGORY_LABELS[c]} basic`}
                          onChange={(e) => setWage((all) => all.map((x, j) => (j === i ? { ...x, [c]: { ...x[c], basic: e.target.value } } : x)))} />
                        <Input type="number" min={0} step="0.01" value={r[c].vda} disabled={!isSuper} aria-label={`${WAGE_CATEGORY_LABELS[c]} VDA`}
                          onChange={(e) => setWage((all) => all.map((x, j) => (j === i ? { ...x, [c]: { ...x[c], vda: e.target.value } } : x)))} />
                        <span className="tabular-nums">₹{((Number(r[c].basic) || 0) + (Number(r[c].vda) || 0)).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {isSuper ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setWage((all) => [...all, { ...(JSON.parse(JSON.stringify(all[all.length - 1] || {})) as WageRow), from: today() }])}>Add a rate set</Button>
                  <Button size="sm" disabled={busy === "wage"} onClick={saveWage}>{busy === "wage" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
                </div>
              ) : readOnlyNote}
            </TabsContent>

            <TabsContent value="stat" className="space-y-3 text-sm">
              <p className="text-slate-600">EPF, ESI and MAS rates and ceilings. Each set applies from its date until the next set starts.</p>
              {stat.map((r, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-xs">From date</Label>
                      <Input type="date" value={r.from} disabled={!isSuper} onChange={(e) => setStat((all) => all.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
                    </div>
                    <div>
                      <Label className="text-xs">Rounding</Label>
                      <Select value={r.rounding} disabled={!isSuper} onValueChange={(v) => setStat((all) => all.map((x, j) => (j === i ? { ...x, rounding: v } : x)))}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="up">Up (next rupee)</SelectItem>
                          <SelectItem value="nearest">Nearest rupee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {isSuper && (
                      <Button variant="ghost" size="sm" disabled={stat.length === 1} aria-label={`Remove rate set ${i + 1}`} onClick={() => setStat((all) => all.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {STAT_FIELDS.map(([k, label]) => (
                      <div key={k}>
                        <Label className="text-xs">{label}</Label>
                        <Input type="number" min={0} step="0.01" value={r[k]} disabled={!isSuper}
                          onChange={(e) => setStat((all) => all.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {isSuper ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStat((all) => [...all, { ...(all[all.length - 1] || ({} as StatRow)), from: today() }])}>Add a rate set</Button>
                  <Button size="sm" disabled={busy === "stat"} onClick={saveStat}>{busy === "stat" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
                </div>
              ) : readOnlyNote}
            </TabsContent>

            <TabsContent value="funds"><FundsList section={section} /></TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Funds (Payment Codes) ────────────────────────────────────────────────────

type Fund = {
  id: number; deptCode: string; fundName: string; paymentCode: string; headName: string; isActive: boolean;
  departmentId: number | null; departmentName: string | null; employees: number; updatedBy: string | null;
};
type FundImportRow = { row: number; deptCode: string; fundName: string; paymentCode: string; departmentName: string | null; status: "new" | "update" | "same" | "skip" | "error"; error?: string };
type FundImportResult = { dryRun: boolean; total: number; new: number; update: number; same: number; skip: number; errors: number; notInApp: number; results: FundImportRow[] };

const FUNDS_URL = "/api/admin/payroll/funds";
const normHead = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const FUND_COLS: Record<"deptCode" | "fundName" | "paymentCode", string[]> = {
  deptCode: ["dept", "deptcode", "departmentcode"],
  fundName: ["deptname", "departmentname", "fundname", "fund"],
  paymentCode: ["deptcodeno", "paymentcode", "code"],
};

function errMsg(e: any, fallback: string) {
  let msg = String(e?.message || fallback);
  const m = msg.match(/\{.*\}/s);
  if (m) { try { msg = JSON.parse(m[0]).message || msg; } catch { /* keep */ } }
  return msg;
}

function FundsList({ section }: { section: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Fund[]>({
    queryKey: [FUNDS_URL, section],
    queryFn: async () => (await apiRequest("GET", `${FUNDS_URL}?${sectionQuery(section)}`)).json(),
  });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Fund | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const q = search.trim().toLowerCase();
  const rows = (data || []).filter((f) => !q || [f.deptCode, f.departmentName, f.fundName, f.paymentCode, f.headName].some((v) => String(v ?? "").toLowerCase().includes(q)));

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600 dark:text-slate-400">
        Staff paid from Revolving Funds or Other Similar Funds are paid per fund. Each fund has its own Payment Code and a department can have several funds.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Search department, fund or code" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search funds" />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}><Upload className="h-4 w-4 mr-2" /> Import from Excel</Button>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-2" /> Add fund</Button>
        </div>
      </div>
      {isLoading ? <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div> : (
        <div className="max-h-[50vh] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dept code</TableHead><TableHead>Department</TableHead><TableHead>Fund name</TableHead>
                <TableHead>Payment Code</TableHead><TableHead>Payment Head (printed)</TableHead>
                <TableHead className="text-right">Staff</TableHead><TableHead>Active</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => (
                <TableRow key={f.id} className={f.isActive ? undefined : "opacity-60"}>
                  <TableCell className="font-mono">{f.deptCode}</TableCell>
                  <TableCell>{f.departmentName || <span className="text-slate-400">not in app</span>}</TableCell>
                  <TableCell>{f.fundName}</TableCell>
                  <TableCell className="font-mono">{f.paymentCode}</TableCell>
                  <TableCell>{f.headName}</TableCell>
                  <TableCell className="text-right">{f.employees}</TableCell>
                  <TableCell>{f.isActive ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(f)} aria-label={`Edit fund ${f.paymentCode}`}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-500">{data?.length ? "No fund matches the search." : "No funds yet. Import the Accounts Section's department list or add a fund."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && <FundDialog fund={editing} section={section} onClose={() => setEditing(null)} />}
      {adding && <FundDialog fund={null} section={section} onClose={() => setAdding(false)} />}
      {importing && <FundImport section={section} onClose={() => setImporting(false)} onDone={(n) => toast({ title: "Funds imported", description: `${n} funds added or updated` })} />}
    </div>
  );
}

function FundDialog({ fund, section, onClose }: { fund: Fund | null; section: string; onClose: () => void }) {
  const { toast } = useToast();
  const [deptCode, setDeptCode] = useState(fund?.deptCode || "");
  const [fundName, setFundName] = useState(fund?.fundName || "");
  const [paymentCode, setPaymentCode] = useState(fund?.paymentCode || "");
  const [headName, setHeadName] = useState(fund?.headName || "");
  const [isActive, setIsActive] = useState(fund?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await apiRequest("PUT", FUNDS_URL, {
        deptCode: deptCode.trim().toUpperCase(), fundName: fundName.trim(), paymentCode: paymentCode.replace(/\s+/g, "").toUpperCase(),
        headName: headName.trim() || `Revolving Fund of ${fundName.trim()}`, isActive, section,
      });
      queryClient.invalidateQueries({ queryKey: [FUNDS_URL] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll/month"] });
      toast({ title: "Fund saved" });
      onClose();
    } catch (e: any) {
      toast({ title: "Not saved", description: errMsg(e, "Not saved"), variant: "destructive" });
    }
    setBusy(false);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{fund ? `Fund – ${fund.paymentCode}` : "Add fund"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label>Department code</Label><Input value={deptCode} maxLength={10} disabled={!!fund} placeholder="e.g. MED" onChange={(e) => setDeptCode(e.target.value.toUpperCase())} /></div>
          <div><Label>Fund name</Label><Input value={fundName} maxLength={150} onChange={(e) => setFundName(e.target.value)} /></div>
          <div><Label>Payment Code</Label><Input value={paymentCode} maxLength={20} disabled={!!fund} placeholder="e.g. 4DE09645" onChange={(e) => setPaymentCode(e.target.value.toUpperCase())} /></div>
          <div>
            <Label>Payment Head (printed){!fund && " – optional"}</Label>
            <Input value={headName} maxLength={150} placeholder={fundName ? `Revolving Fund of ${fundName}` : "Revolving Fund of <fund name>"} onChange={(e) => setHeadName(e.target.value)} />
          </div>
          {fund && <label className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /> Active</label>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !deptCode.trim() || !fundName.trim() || !paymentCode.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FundImport({ section, onClose, onDone }: { section: string; onClose: () => void; onDone: (n: number) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Array<{ deptCode: string; fundName: string; paymentCode: string }>>([]);
  const [fileName, setFileName] = useState("");
  const [res, setRes] = useState<FundImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (payload: typeof rows, dryRun: boolean) => {
    try {
      return (await (await apiRequest("POST", `${FUNDS_URL}/import`, { rows: payload, dryRun, section })).json()) as FundImportResult;
    } catch (e: any) {
      toast({ title: "Import failed", description: errMsg(e, "Import failed"), variant: "destructive" });
      return null;
    }
  };

  const handleFile = async (file: File) => {
    setRes(null); setRows([]); setFileName(file.name);
    const parsed: typeof rows = [];
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const data: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
      const head = (data[0] || []).map(normHead);
      const idx: Record<string, number> = {};
      const missing: string[] = [];
      for (const k of Object.keys(FUND_COLS) as Array<keyof typeof FUND_COLS>) {
        const i = head.findIndex((h) => FUND_COLS[k].includes(h));
        if (i < 0) missing.push(k === "deptCode" ? "DEPT" : k === "fundName" ? "DEPT_NAME" : "DEPT_CODE_NO"); else idx[k] = i;
      }
      if (missing.length) { toast({ title: "Column missing", description: `Missing column(s): ${missing.join(", ")}`, variant: "destructive" }); return; }
      for (const r of data.slice(1)) {
        const o = { deptCode: String(r[idx.deptCode] ?? "").trim(), fundName: String(r[idx.fundName] ?? "").trim(), paymentCode: String(r[idx.paymentCode] ?? "").trim() };
        if (o.deptCode || o.fundName || o.paymentCode) parsed.push(o);
      }
    } catch {
      toast({ title: "Could not read the file", description: "Use an .xlsx, .xls or .csv file.", variant: "destructive" });
      return;
    }
    if (!parsed.length) { toast({ title: "No data", description: "The file has no data rows.", variant: "destructive" }); return; }
    setRows(parsed);
    setBusy(true);
    const r = await call(parsed, true);
    setBusy(false);
    if (r) setRes(r);
  };

  const importable = res ? res.new + res.update : 0;
  const doImport = async () => {
    setBusy(true);
    const r = await call(rows, false);
    setBusy(false);
    if (!r) return;
    queryClient.invalidateQueries({ queryKey: [FUNDS_URL] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll/month"] });
    onDone(r.new + r.update);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import funds from Excel</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Use the Accounts Section's department list. Columns: DEPT (department code), DEPT_NAME (fund name) and DEPT_CODE_NO (Payment Code). Rows without a Payment Code are ignored.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" /> Choose file</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {fileName && <span className="text-slate-500">{fileName}</span>}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          {res && (
            <>
              <div className="flex flex-wrap gap-4">
                <span>New: <b>{res.new}</b></span>
                <span>Changed: <b>{res.update}</b></span>
                <span>Unchanged: <b>{res.same}</b></span>
                <span className="text-red-700 dark:text-red-400">Errors: <b>{res.errors}</b></span>
                <span className="text-amber-700 dark:text-amber-400">Not in app: <b>{res.notInApp}</b></span>
              </div>
              {res.notInApp > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Not in app: the department code was not found in the app's department list. The fund is still saved and links automatically when the department is added.
                </p>
              )}
              <div className="max-h-[40vh] overflow-auto border rounded-md">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Dept code</TableHead><TableHead>Fund name</TableHead><TableHead>Payment Code</TableHead><TableHead>Department</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {res.results.filter((r) => r.status !== "skip").map((r) => (
                      <TableRow key={r.row}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell className="font-mono">{r.deptCode}</TableCell>
                        <TableCell>{r.fundName}</TableCell>
                        <TableCell className="font-mono">{r.paymentCode}</TableCell>
                        <TableCell>{r.departmentName || <span className="text-amber-700 dark:text-amber-400">not in app</span>}</TableCell>
                        <TableCell>
                          {r.status === "error" ? <span className="text-red-700 dark:text-red-400">{r.error}</span>
                            : r.status === "new" ? <span className="text-green-700 dark:text-green-400">New</span>
                            : r.status === "update" ? <span className="text-blue-700 dark:text-blue-400">Changed</span>
                            : <span className="text-slate-500">Unchanged</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || importable === 0} onClick={doImport}>Import {importable} funds</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
