// MIS report of a department's dak + printable registers (inward, despatch, peon book).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { printInwardRegister, printDespatchRegister, printPeonBook } from "./dak-print";

const ROLE: Record<string, string> = { hod: "HOD", section_officer: "Section Officer", dealing_assistant: "Dealing Assistant", diary_clerk: "Diary Clerk" };

function fyStart(): string {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
}

export default function DakReports({ departmentId, departmentName }: { departmentId: number; departmentName: string }) {
  const { toast } = useToast();
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [printing, setPrinting] = useState<string | null>(null);

  const url = `/api/dispatch/reports/${departmentId}?from=${from}&to=${to}`;
  const { data, isLoading } = useQuery<any>({ queryKey: [url], enabled: !!departmentId && !!from && !!to });

  const print = async (kind: "inward" | "outward" | "peon") => {
    setPrinting(kind);
    try {
      const res = await fetch(`/api/dispatch/registers/${departmentId}?kind=${kind}&from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Could not load the register");
      const reg = await res.json();
      if (kind === "inward") printInwardRegister(departmentName, reg);
      else if (kind === "outward") printDespatchRegister(departmentName, reg);
      else printPeonBook(departmentName, reg);
    } catch (e: any) {
      toast({ title: "Print failed", description: e.message, variant: "destructive" });
    } finally {
      setPrinting(null);
    }
  };

  const age = data?.age || {};
  const disposal = data?.disposal || {};
  const inTimePct = disposal.count ? Math.round((Number(disposal.inTime || 0) / Number(disposal.count)) * 100) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => print("inward")} disabled={!!printing}>
              {printing === "inward" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />} Inward Register
            </Button>
            <Button variant="outline" size="sm" onClick={() => print("outward")} disabled={!!printing}>
              {printing === "outward" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />} Despatch Register
            </Button>
            <Button variant="outline" size="sm" onClick={() => print("peon")} disabled={!!printing}>
              {printing === "peon" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />} Peon Book
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Pending action now" value={age.total ?? 0} />
            <Stat label="Overdue now" value={age.overdue ?? 0} tone="red" />
            <Stat label="Disposed in period" value={disposal.count ?? 0} tone="green" />
            <Stat label="Average days to dispose" value={disposal.avgDays ?? "-"}
              sub={inTimePct !== null ? `${inTimePct}% within the 'action by' date` : undefined} />
          </div>

          <Section title="Pending dak by age (days since receipt)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-600 border-b"><th className="py-1.5">0–7</th><th>8–15</th><th>16–30</th><th>More than 30</th></tr></thead>
              <tbody><tr className="font-semibold"><td className="py-1.5">{age.d0_7 ?? 0}</td><td>{age.d8_15 ?? 0}</td><td>{age.d16_30 ?? 0}</td><td className={(age.d30plus ?? 0) > 0 ? "text-red-600" : ""}>{age.d30plus ?? 0}</td></tr></tbody>
            </table>
          </Section>

          <Section title="Staff-wise pendency">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-600 border-b">
                <th className="py-1.5">Staff</th><th>Role</th><th className="text-right">Pending</th><th className="text-right">Not acknowledged</th>
                <th className="text-right">Overdue</th><th className="text-right">Disposed in period</th></tr></thead>
              <tbody>
                {data.byStaff.map((s: any) => (
                  <tr key={s.id} className={`border-b last:border-b-0 ${s.isActive ? "" : "text-gray-400"}`}>
                    <td className="py-1.5">{s.name}</td><td>{ROLE[s.role] || s.role}</td>
                    <td className="text-right">{s.pending}</td><td className="text-right">{s.notAcknowledged}</td>
                    <td className={`text-right ${s.overdue > 0 ? "text-red-600 font-semibold" : ""}`}>{s.overdue}</td>
                    <td className="text-right">{s.disposed}</td>
                  </tr>
                ))}
                {data.unassigned.map((u: any) => (
                  <tr key={`u-${u.name}`} className="border-b last:border-b-0 text-gray-600">
                    <td className="py-1.5 italic">{u.name}</td><td>—</td><td className="text-right">{u.pending}</td><td className="text-right">—</td>
                    <td className={`text-right ${u.overdue > 0 ? "text-red-600 font-semibold" : ""}`}>{u.overdue}</td><td className="text-right">—</td>
                  </tr>
                ))}
                {data.byStaff.length === 0 && data.unassigned.length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-gray-500">No pending dak.</td></tr>
                )}
              </tbody>
            </table>
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Month-wise">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-600 border-b"><th className="py-1.5">Month</th><th className="text-right">Received</th><th className="text-right">Disposed</th><th className="text-right">Dispatched</th></tr></thead>
                <tbody>
                  {data.monthly.map((m: any) => (
                    <tr key={m.month} className="border-b last:border-b-0">
                      <td className="py-1.5">{format(new Date(`${m.month}-01T00:00:00`), "MMM yyyy")}</td>
                      <td className="text-right">{m.received}</td><td className="text-right">{m.disposed}</td><td className="text-right">{m.dispatched}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <div className="space-y-4">
              <Section title="Received by type">
                <SimpleCounts rows={data.byType} empty="Nothing received in this period." />
              </Section>
              <Section title="How dak was disposed">
                <SimpleCounts rows={data.byDisposal} empty="Nothing disposed in this period." />
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: any; sub?: string; tone?: "red" | "green" }) {
  const color = tone === "red" ? "text-red-700" : tone === "green" ? "text-green-700" : "text-gray-900";
  return (
    <Card><CardContent className="p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </CardContent></Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><BarChart3 className="h-4 w-4 text-blue-600" />{title}</p>
      {children}
    </CardContent></Card>
  );
}

function SimpleCounts({ rows, empty }: { rows: { type: string; count: number }[]; empty: string }) {
  if (!rows?.length) return <p className="text-sm text-gray-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.type || "-"} className="flex items-center gap-2 text-sm">
          <span className="w-44 truncate" title={r.type}>{r.type || "-"}</span>
          <div className="flex-1 bg-gray-100 rounded h-2"><div className="bg-blue-500 h-2 rounded" style={{ width: `${(r.count / max) * 100}%` }} /></div>
          <span className="w-8 text-right tabular-nums">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
