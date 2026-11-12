// Children Education Allowance — what the Salary Section keeps for it
// (opened from the admin Claim Forms page):
//   • CEA rates, each for a span of dates (from – to),
//   • the list of schools, with what the Directorate of School Education said.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { formatClaimDate, localToday } from "@shared/claimForms";

type CeaRate = { from: string; to: string; cea: number; hostel: number; disabled: number };
type RateRow = { from: string; to: string; cea: string; hostel: string; disabled: string };
const money = (n: number) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

// ── Rates ────────────────────────────────────────────────────────────────────

export function CeaRates({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const key = ["/api/admin/claim-forms/cea-rates"];
  const { data } = useQuery<{ rates: CeaRate[] }>({ queryKey: key, queryFn: async () => (await apiRequest("GET", key[0])).json() });
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RateRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rates = data?.rates || [];
  const today = localToday();
  const current = rates.find((r) => r.from <= today && (!r.to || r.to >= today));

  const start = () => {
    setRows(rates.map((r) => ({ from: r.from, to: r.to || "", cea: String(r.cea), hostel: String(r.hostel), disabled: String(r.disabled) })));
    setError("");
    setOpen(true);
  };
  const change = (i: number, patch: Partial<RateRow>) => setRows((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("POST", key[0], {
        rates: rows.map((r) => ({ from: r.from, to: r.to, cea: Number(r.cea), hostel: Number(r.hostel || 0), disabled: Number(r.disabled || 0) })),
      });
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: "CEA rates saved" });
      setOpen(false);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" onClick={start} className="rounded-lg border bg-white px-3 py-2 text-sm text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <span className="block text-xs text-slate-500">CEA rates</span>
        <span className={`font-medium ${current ? "" : "text-amber-700"}`}>
          {current ? `${money(current.cea)} a month per child` : rates.length ? "No rate for today" : "Not entered yet"}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Children Education Allowance — rates</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              Each rate applies from its From date to its To date. Leave the To date of the latest rate empty: it then applies until a new rate is added.
              Amounts are per child, per month. Two rates cannot cover the same date.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-x-2 border-spacing-y-1">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="font-normal">From date</th>
                    <th className="font-normal">To date</th>
                    <th className="font-normal">CEA (Rs. a month)</th>
                    <th className="font-normal">Hostel subsidy (Rs. a month)</th>
                    <th className="font-normal">CEA, child with disability</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><Input type="date" value={r.from} disabled={!canEdit} aria-label={`Rate ${i + 1}: from date`} onChange={(e) => change(i, { from: e.target.value })} /></td>
                      <td><Input type="date" value={r.to} disabled={!canEdit} aria-label={`Rate ${i + 1}: to date`} onChange={(e) => change(i, { to: e.target.value })} /></td>
                      <td><Input type="number" min={0} step="0.01" value={r.cea} disabled={!canEdit} aria-label={`Rate ${i + 1}: CEA a month`} onChange={(e) => change(i, { cea: e.target.value })} /></td>
                      <td><Input type="number" min={0} step="0.01" value={r.hostel} disabled={!canEdit} aria-label={`Rate ${i + 1}: hostel subsidy a month`} onChange={(e) => change(i, { hostel: e.target.value })} /></td>
                      <td><Input type="number" min={0} step="0.01" value={r.disabled} disabled={!canEdit} aria-label={`Rate ${i + 1}: CEA for a child with disability`} onChange={(e) => change(i, { disabled: e.target.value })} /></td>
                      <td><Button variant="ghost" size="sm" disabled={!canEdit} aria-label={`Remove rate ${i + 1}`} onClick={() => setRows((all) => all.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="py-3 text-slate-500">No rate has been entered yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {rows.some((r) => Number(r.cea) > 0) && (
              <p className="text-slate-600">
                For a full year: {rows.filter((r) => Number(r.cea) > 0).map((r) => `${formatClaimDate(r.from) || "?"} onwards ${money(Number(r.cea) * 12)}`).join(" · ")}
              </p>
            )}
            {error && <p role="alert" className="text-red-700">{error}</p>}
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setRows((all) => [...all, { from: "", to: "", cea: "", hostel: "", disabled: "" }])}><Plus className="h-4 w-4 mr-1" /> Add a rate</Button>
                <Button size="sm" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
              </div>
            ) : <p className="text-slate-500">Only a super admin can change the rates.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Schools ──────────────────────────────────────────────────────────────────

type School = { id: number; name: string; place: string; location: string; status: string; dseReference: string; session: string; isActive: boolean };
const STATUS_LABELS: Record<string, string> = { recognised: "Recognised", not_recognised: "Not recognised", unknown: "Not verified yet" };
const LOCATION_LABELS: Record<string, string> = { aligarh: "Aligarh", outside: "Outside Aligarh" };
const EMPTY: Omit<School, "id"> = { name: "", place: "", location: "aligarh", status: "unknown", dseReference: "", session: "", isActive: true };

export function CeaSchools({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const key = ["/api/admin/claim-forms/cea-schools"];
  const { data: schools = [] } = useQuery<School[]>({ queryKey: key, queryFn: async () => (await apiRequest("GET", key[0])).json() });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<(Omit<School, "id"> & { id?: number }) | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter((s) =>
      (!q || `${s.name} ${s.place}`.toLowerCase().includes(q)) &&
      (filter === "all" || (filter === "inactive" ? !s.isActive : filter === "aligarh" || filter === "outside" ? s.location === filter : s.status === filter)));
  }, [schools, search, filter]);
  const active = schools.filter((s) => s.isActive).length;

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      if (editing.id) await apiRequest("PUT", `${key[0]}/${editing.id}`, editing);
      else await apiRequest("POST", key[0], editing);
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: editing.id ? "School saved" : "School added" });
      setEditing(null);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setEditing(null); setSearch(""); setFilter("all"); }}
        className="rounded-lg border bg-white px-3 py-2 text-sm text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <span className="block text-xs text-slate-500">CEA schools</span>
        <span className="font-medium">{active.toLocaleString("en-IN")} school{active === 1 ? "" : "s"}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Children Education Allowance — schools</DialogTitle></DialogHeader>
          {editing ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="school-name">Name of the school</Label>
                  <Input id="school-name" value={editing.name} maxLength={150} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-place">Place (optional)</Label>
                  <Input id="school-place" value={editing.place} maxLength={100} onChange={(e) => setEditing({ ...editing, place: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-location">Where</Label>
                  <select id="school-location" value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {Object.entries(LOCATION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-status">Recognition (Directorate of School Education)</Label>
                  <select id="school-status" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="school-session">Session of the report (optional)</Label>
                  <Input id="school-session" value={editing.session} maxLength={20} placeholder="2025-2026" onChange={(e) => setEditing({ ...editing, session: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="school-ref">Reference of the report (optional)</Label>
                  <Input id="school-ref" value={editing.dseReference} maxLength={120} placeholder="D.No.185/DSE dated 24.04.2024" onChange={(e) => setEditing({ ...editing, dseReference: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 sm:col-span-2 cursor-pointer">
                  <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
                  <span>Shown to employees in the list of schools</span>
                </label>
              </div>
              {error && <p role="alert" className="text-red-700">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || editing.name.trim().length < 4} onClick={save}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>Back to the list</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search school" aria-label="Search school" className="w-64" />
                <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show" className="h-10 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="all">All ({schools.length})</option>
                  <option value="aligarh">Aligarh</option>
                  <option value="outside">Outside Aligarh</option>
                  <option value="recognised">Recognised</option>
                  <option value="not_recognised">Not recognised</option>
                  <option value="unknown">Not verified yet</option>
                  <option value="inactive">Hidden from employees</option>
                </select>
                {canEdit && <Button size="sm" className="ml-auto" onClick={() => { setEditing({ ...EMPTY }); setError(""); }}><Plus className="h-4 w-4 mr-1" /> Add a school</Button>}
              </div>
              <div className="max-h-[55vh] overflow-y-auto rounded border divide-y">
                {shown.map((s) => (
                  <div key={s.id} className={`flex items-center gap-3 px-3 py-2 ${s.isActive ? "" : "opacity-60"}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{s.name}{s.place ? `, ${s.place}` : ""}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {LOCATION_LABELS[s.location] || s.location}
                        {s.dseReference ? ` · ${s.dseReference}` : ""}{s.session ? ` · ${s.session}` : ""}{s.isActive ? "" : " · hidden"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.status === "recognised" ? "bg-green-100 text-green-800" : s.status === "not_recognised" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                      {STATUS_LABELS[s.status] || s.status}
                    </span>
                    {canEdit && <Button variant="ghost" size="sm" aria-label={`Edit ${s.name}`} onClick={() => { setEditing({ ...s }); setError(""); }}><Pencil className="h-4 w-4" /></Button>}
                  </div>
                ))}
                {shown.length === 0 && <p className="px-3 py-4 text-slate-500">No school matches.</p>}
              </div>
              <p className="text-slate-500">{shown.length.toLocaleString("en-IN")} shown</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
