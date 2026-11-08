// Admin: university-wide dak tracking — pendency per department, search any dak,
// and its full movement chain (recipients + timeline).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, Route, Clock } from "lucide-react";

const fyStart = () => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-04-01`; };
const STATUS: Record<string, string> = {
  dispatched: "Unreceived", received: "Received", read: "Received", marked: "With staff", forwarded: "Forwarded",
  returned: "Returned", disposed: "Disposed", withdrawn: "Withdrawn", cancelled: "Cancelled",
};

export default function AdminDakTracking() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: overview, isLoading } = useQuery<any>({ queryKey: [`/api/admin/dak/overview?from=${from}&to=${to}`] });
  const { data: results = [], isFetching: searching } = useQuery<any[]>({
    queryKey: [`/api/admin/dak/search?q=${encodeURIComponent(term)}`], enabled: term.length >= 2,
  });
  const { data: detail } = useQuery<any>({ queryKey: [`/api/dispatch/${openId}`], enabled: !!openId });

  const totals = (overview?.rows || []).reduce((t: any, r: any) => ({
    pending: t.pending + r.pending, overdue: t.overdue + r.overdue, received: t.received + r.received, dispatched: t.dispatched + r.dispatched,
  }), { pending: 0, overdue: 0, received: 0, dispatched: 0 });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" className="h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <form className="flex gap-2 ml-auto" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()); }}>
            <Input className="h-9 w-72" placeholder="Find dak: R.No., Outward No., letter no., subject, text" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" size="sm" className="h-9"><Search className="h-4 w-4 mr-1" /> Find</Button>
          </form>
        </CardContent>
      </Card>

      {term.length >= 2 && (
        <Card><CardContent className="p-0 overflow-x-auto">
          {searching ? <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : results.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Nothing found for “{term}”.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b text-left text-gray-600">
                <th className="px-3 py-2">Number</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Where it is</th><th className="px-3 py-2">Date</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-blue-50/50 cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <td className="px-3 py-2 font-mono text-xs">{r.outwardNumber || r.inwardNumber || "-"}</td>
                    <td className="px-3 py-2 text-xs">{r.senderName}</td>
                    <td className="px-3 py-2 truncate max-w-[300px]" title={r.subject}>{r.cancelled && <span className="text-red-600 mr-1">[withdrawn]</span>}{r.subject}</td>
                    <td className="px-3 py-2 text-xs">{r.recipients.map((x: any) => `${x.name}: ${STATUS[x.status] || x.status}`).join(" · ")}</td>
                    <td className="px-3 py-2 text-xs">{format(new Date(r.createdAt), "dd MMM yyyy")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Received (period)", totals.received], ["Dispatched (period)", totals.dispatched], ["Pending now", totals.pending], ["Overdue now", totals.overdue]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4"><div className={`text-2xl font-bold ${l === "Overdue now" && (v as number) > 0 ? "text-red-600" : ""}`}>{v as number}</div><div className="text-xs text-gray-500">{l}</div></CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        {isLoading ? <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-left text-gray-600">
              <th className="px-3 py-2">Department</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Not taken in</th>
              <th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Overdue</th><th className="px-3 py-2 text-right">Disposed</th>
              <th className="px-3 py-2 text-right">Dispatched</th></tr></thead>
            <tbody>
              {(overview?.rows || []).map((r: any) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.received}</td>
                  <td className={`px-3 py-2 text-right ${r.unreceived > 0 ? "text-orange-600" : ""}`}>{r.unreceived}</td>
                  <td className="px-3 py-2 text-right">{r.pending}</td>
                  <td className={`px-3 py-2 text-right ${r.overdue > 0 ? "text-red-600 font-semibold" : ""}`}>{r.overdue}</td>
                  <td className="px-3 py-2 text-right">{r.disposed}</td>
                  <td className="px-3 py-2 text-right">{r.dispatched}</td>
                </tr>
              ))}
              {(overview?.rows || []).length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No dak activity yet.</td></tr>}
            </tbody>
          </table>
        )}
      </CardContent></Card>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Route className="h-5 w-5" /> Movement of the dak</DialogTitle></DialogHeader>
          {!detail ? <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <div className="space-y-4 text-sm">
              <div>
                <div className="font-semibold">{detail.subject}</div>
                <div className="text-xs text-gray-500">{detail.senderName} · {detail.documentType} · {detail.outwardNumber || detail.inwardNumber || ""}
                  {detail.cancelledAt && <span className="text-red-600"> · withdrawn / cancelled</span>}</div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Offices</p>
                {detail.recipients.map((r: any) => (
                  <div key={r.id} className="flex justify-between text-xs bg-gray-50 rounded px-2 py-1 mb-1">
                    <span>{r.name}{r.inwardNumber ? ` · R.No. ${r.inwardNumber}` : ""}{r.markedToStaff ? ` · with ${r.markedToStaff}` : ""}</span>
                    <span>{STATUS[r.status] || r.status}{r.actionDueDate ? ` · by ${r.actionDueDate}` : ""}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Timeline</p>
                <div className="border-l-2 border-blue-200 pl-4 space-y-2">
                  {detail.tracking.map((t: any) => (
                    <div key={t.id}>
                      <div className="text-xs"><strong>{t.actionByName}</strong> <span className="text-gray-400">{format(new Date(t.createdAt), "dd MMM yyyy, HH:mm")}</span></div>
                      <div className="text-xs text-gray-600">{t.details}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
