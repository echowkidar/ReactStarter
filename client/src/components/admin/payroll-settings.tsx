// Wages payroll settings: daily wage rates, EPF / ESI / MAS rates and the payment heads.
// Rates are changed by the Super Admin only; section logins see them read-only.
import { useEffect, useState } from "react";
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
import { Loader2, Pencil, X } from "lucide-react";
import {
  WAGE_CATEGORIES, WAGE_CATEGORY_LABELS,
  type StatutorySet, type WageRateSet,
} from "@shared/wagePayroll";

export type PayrollHead = { departmentId: number; departmentName: string; employees: number; headName: string; paymentCode: string };

export const sectionQuery = (section: string) => `section=${encodeURIComponent(section)}`;

type Props = { open: boolean; onOpenChange: (o: boolean) => void; section: string; isSuper: boolean };

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

export function PayrollSettingsDialog({ open, onOpenChange, section, isSuper }: Props) {
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
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Payroll settings</DialogTitle></DialogHeader>
        {!data ? <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div> : (
          <Tabs defaultValue="wage">
            <TabsList>
              <TabsTrigger value="wage">Wage rates</TabsTrigger>
              <TabsTrigger value="stat">EPF / ESI / MAS</TabsTrigger>
              <TabsTrigger value="heads">Payment heads</TabsTrigger>
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

            <TabsContent value="heads"><HeadsList section={section} /></TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Payment heads ────────────────────────────────────────────────────────────

function HeadsList({ section }: { section: string }) {
  const url = `/api/admin/payroll/heads`;
  const { data, isLoading } = useQuery<PayrollHead[]>({
    queryKey: [url, section],
    queryFn: async () => (await apiRequest("GET", `${url}?${sectionQuery(section)}`)).json(),
  });
  const [editing, setEditing] = useState<PayrollHead | null>(null);
  if (isLoading) return <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div>;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">The payment head and code printed on each department's roll.</p>
      <Table>
        <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">Staff</TableHead><TableHead>Payment head</TableHead><TableHead>Code</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(data || []).map((h) => (
            <TableRow key={h.departmentId}>
              <TableCell>{h.departmentName}</TableCell>
              <TableCell className="text-right">{h.employees}</TableCell>
              <TableCell>{h.headName || <span className="text-slate-400">Not set</span>}</TableCell>
              <TableCell className="font-mono">{h.paymentCode || "—"}</TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(h)} aria-label={`Edit head of ${h.departmentName}`}><Pencil className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
          {!data?.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-500">No departments with staff in this section.</TableCell></TableRow>}
        </TableBody>
      </Table>
      {editing && <HeadDialog head={editing} section={section} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Small dialog to set a department's payment head + code (PUT /heads/:id) */
export function HeadDialog({ head, section, onClose, onSaved }: {
  head: { departmentId: number; departmentName: string; headName: string; paymentCode: string };
  section: string; onClose: () => void; onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [headName, setHeadName] = useState(head.headName);
  const [code, setCode] = useState(head.paymentCode);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await apiRequest("PUT", `/api/admin/payroll/heads/${head.departmentId}`, { headName, paymentCode: code, section });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll/heads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll/month"] });
      toast({ title: "Payment head saved" });
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Payment head – {head.departmentName}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label>Payment head</Label><Input value={headName} maxLength={150} onChange={(e) => setHeadName(e.target.value)} /></div>
          <div><Label>Payment code</Label><Input value={code} maxLength={20} placeholder="e.g. 4DE09665" onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
