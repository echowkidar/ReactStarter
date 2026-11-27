// Employee history: search every month's payroll of one section (by employee, account, UAN, ESI, department, head of account).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, FileText, Loader2, Search, SquareArrowOutUpRight } from "lucide-react";
import { sectionQuery } from "@/components/admin/payroll-settings";

const API = "/api/admin/payroll";
const ALL = "__all";
const NO_FUND = "__none";
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const inr = (n: number | string | null | undefined) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
const num = (n: number | string | null | undefined) => (Number(n) || 0).toLocaleString("en-IN");
const dmy = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("-") : "");

async function downloadFile(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { msg = (await res.json()).message || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const cd = res.headers.get("Content-Disposition") || "";
  const name = decodeURIComponent((cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] || url.split("/").pop()?.split("?")[0] || "download"));
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return name;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  finalised: { label: "Finalised", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  passed: { label: "Passed", cls: "bg-green-100 text-green-800 border-green-200" },
};

type HistoryOptions = {
  departments: { id: number; name: string }[];
  heads: { paymentCode: string; headName: string | null; departmentId: number }[];
};
type Row = {
  lineId: number; rollId: number; month: number; year: number; status: "draft" | "finalised" | "passed"; released: boolean;
  pageNo: string | number | null; passedOn: string | null; departmentName: string; paymentCode: string; headName: string | null;
  epid: string; name: string; designation: string | null; category: string | null; days: number | string | null;
  gross: number; epf: number; esi: number; mas: number; deductions: number; net: number; employerEpf: number; employerEsi: number;
  uanNo: string | null; esiNo: string | null; bankAccount: string | null; bankName: string | null; ifsc: string | null;
  chequeNo: string | null; chequeDate: string | null;
};
type HistoryResult = {
  page: number; pageSize: number;
  totals: { lines: number; employees: number; gross: number; deductions: number; net: number; employer: number };
  rows: Row[];
};

const FIELDS: [string, string][] = [
  ["all", "All fields"], ["epid", "Employee ID"], ["name", "Name"], ["account", "Account No."], ["uan", "UAN (EPF)"], ["esi", "ESI No."],
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function PayrollHistory({ section, onOpenRoll }: { section: string; onOpenRoll: (rollId: number) => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [field, setField] = useState("all");
  const [departmentId, setDepartmentId] = useState(ALL);
  const [head, setHead] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data: options } = useQuery<HistoryOptions>({
    queryKey: [`${API}/history/options`, section],
    queryFn: async () => (await apiRequest("GET", `${API}/history/options?${sectionQuery(section)}`)).json(),
  });

  const headOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const h of options?.heads || []) {
      if (departmentId !== ALL && String(h.departmentId) !== departmentId) continue;
      const value = h.paymentCode === "" ? NO_FUND : h.paymentCode;
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ value, label: h.paymentCode === "" ? "Fund not set" : h.headName ? `${h.paymentCode} — ${h.headName}` : h.paymentCode });
    }
    return out;
  }, [options, departmentId]);

  // Reset the head if it no longer fits the chosen department
  useEffect(() => {
    if (head !== ALL && options && !headOptions.some((h) => h.value === head)) setHead(ALL);
  }, [headOptions, head, options]);

  const params = (withPage: boolean) => {
    const p = new URLSearchParams();
    p.set("section", section);
    if (debouncedQ) p.set("q", debouncedQ);
    if (field !== "all") p.set("field", field);
    if (departmentId !== ALL) p.set("departmentId", departmentId);
    if (head !== ALL) p.set("paymentCode", head === NO_FUND ? "-" : head);
    if (status !== ALL) p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (withPage) p.set("page", String(page));
    return p.toString();
  };
  const qs = params(true);

  const { data, isLoading, isFetching } = useQuery<HistoryResult>({
    queryKey: [`${API}/history`, section, debouncedQ, field, departmentId, head, status, from, to, page],
    queryFn: async () => (await apiRequest("GET", `${API}/history?${qs}`)).json(),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows || [];
  const t = data?.totals;
  const pageSize = data?.pageSize || 50;
  const total = t?.lines || 0;
  const startN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endN = Math.min(total, (page - 1) * pageSize + rows.length);

  const setF = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const clear = () => {
    setQ(""); setDebouncedQ(""); setField("all"); setDepartmentId(ALL); setHead(ALL); setStatus(ALL); setFrom(""); setTo(""); setPage(1);
  };
  const download = async () => {
    setDownloading(true);
    try { toast({ title: "Downloaded", description: await downloadFile(`${API}/history.xlsx?${params(false)}`) }); }
    catch (e: any) { toast({ title: "Not downloaded", description: e.message, variant: "destructive" }); }
    setDownloading(false);
  };
  const openSlip = (r: Row) =>
    window.open(`${API}/rolls/${r.rollId}/slips.pdf?${sectionQuery(section)}&line=${r.lineId}`, "_blank", "noopener");

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <h2 className="font-semibold">Employee history</h2>
          <p className="text-xs text-slate-500">Search every month's payroll of this section by employee, account, UAN or ESI number, department or head of account.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="EPID, name, account no., UAN or ESI no." />
            </div>
          </div>
          <div>
            <Label className="text-xs">Search in</Label>
            <Select value={field} onValueChange={setF(setField)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FIELDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setF(setStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="finalised">Finalised</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Select value={departmentId} onValueChange={setF(setDepartmentId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {(options?.departments || []).map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Head of account</Label>
            <Select value={head} onValueChange={setF(setHead)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All heads</SelectItem>
                {headOptions.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From month</Label>
            <Input type="month" value={from} onChange={(e) => setF(setFrom)(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To month</Label>
            <Input type="month" value={to} onChange={(e) => setF(setTo)(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={clear}>Clear</Button>
          <Button variant="outline" size="sm" disabled={downloading || total === 0} onClick={download}>
            {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />} Download Excel
          </Button>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400 self-center" />}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Stat label="Records" value={num(t?.lines)} />
          <Stat label="Employees" value={num(t?.employees)} />
          <Stat label="Gross" value={inr(t?.gross)} />
          <Stat label="Deductions" value={inr(t?.deductions)} />
          <Stat label="Net paid" value={inr(t?.net)} />
          <Stat label="Employer EPF + ESI" value={inr(t?.employer)} />
        </div>

        <div className="rounded-md border overflow-auto max-h-[70vh]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white">
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department / Head</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Cheque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={11} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-500">No records match these filters.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.lineId}>
                  <TableCell className="whitespace-nowrap">{MONTHS_SHORT[r.month - 1]} {r.year}</TableCell>
                  <TableCell>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.epid}{r.designation ? ` · ${r.designation}` : ""}</div>
                  </TableCell>
                  <TableCell>
                    <div>{r.departmentName}</div>
                    <div className="text-xs text-slate-500 font-mono">{r.paymentCode || "Fund not set"}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.days ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.gross)}</TableCell>
                  <TableCell className="text-right tabular-nums" title={`EPF ${num(r.epf)} · ESI ${num(r.esi)} · MAS ${num(r.mas)}`}>{inr(r.deductions)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{inr(r.net)}</TableCell>
                  <TableCell>
                    {r.bankAccount || r.bankName ? (
                      <>
                        <div>{r.bankName || "—"}</div>
                        <div className="text-xs text-slate-500">{r.bankAccount}{r.ifsc ? ` · ${r.ifsc}` : ""}</div>
                      </>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.chequeNo ? <>{r.chequeNo}{r.chequeDate && <div className="text-xs text-slate-500">{dmy(r.chequeDate)}</div>}</> : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[r.status]?.cls}>{STATUS_BADGE[r.status]?.label || r.status}</Badge>
                    {r.status === "passed" && (r.released
                      ? <div className="text-xs text-green-700">Slip released</div>
                      : <div className="text-xs text-amber-700">Slip not released</div>)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Open roll" aria-label="Open roll" onClick={() => onOpenRoll(r.rollId)}>
                      <SquareArrowOutUpRight className="h-4 w-4" />
                    </Button>
                    {r.status === "passed" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Pay slip" aria-label="Pay slip" onClick={() => openSlip(r)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">Showing {num(startN)}–{num(endN)} of {num(total)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
