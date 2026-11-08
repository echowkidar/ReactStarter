// Small dak panels used on the Dak page: My Dak, attachments, acknowledgements.
import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Paperclip, FileText, CheckCircle2, UserCheck, Upload, Inbox } from "lucide-react";

const today = () => format(new Date(), "yyyy-MM-dd");
const CLOSED = ["disposed", "forwarded", "returned", "withdrawn", "cancelled"];

/** Dak marked to the logged-in staff person */
export function MyDak({ departmentId, onOpen }: { departmentId: number; onOpen: (item: any) => void }) {
  const { toast } = useToast();
  const key = [`/api/dispatch/my/${departmentId}`];
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: key, enabled: !!departmentId });
  const ack = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/dispatch/${id}/acknowledge`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: [`/api/dispatch/inbox-count/${departmentId}`] });
      toast({ title: "Acknowledged" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const open = data.filter((d) => !CLOSED.includes(d.recipientStatus));
  const done = data.filter((d) => CLOSED.includes(d.recipientStatus));

  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (data.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-gray-500">
        <UserCheck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p className="text-lg font-medium">Nothing marked to you</p>
        <p className="text-sm">Dak that is marked to you appears here.</p>
      </CardContent></Card>
    );
  }
  const row = (d: any) => {
    const overdue = d.actionDueDate && !CLOSED.includes(d.recipientStatus) && d.actionDueDate < today();
    return (
      <tr key={`${d.id}-${d.recipientId}`} className="border-b last:border-b-0 hover:bg-blue-50/50 cursor-pointer" onClick={() => onOpen(d)}>
        <td className="px-3 py-2.5 font-mono text-green-700 font-semibold text-xs">{d.inwardNumber || "-"}</td>
        <td className="px-3 py-2.5 text-xs">{d.markedAt ? format(new Date(d.markedAt), "dd MMM yyyy") : "-"}</td>
        <td className="px-3 py-2.5 text-sm truncate max-w-[160px]" title={d.senderName}>{d.senderName}</td>
        <td className="px-3 py-2.5 text-sm">
          <div className="truncate max-w-[360px]" title={d.subject}>{d.subject}</div>
          {d.staffRemarks && <div className="text-[11px] text-gray-500 truncate max-w-[360px]">“{d.staffRemarks}”</div>}
        </td>
        <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${overdue ? "text-red-600 font-semibold" : ""}`}>{d.actionDueDate || "-"}{overdue && " · overdue"}</td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          {CLOSED.includes(d.recipientStatus) ? (
            <span className="text-xs text-green-700">{d.disposalType || d.recipientStatus}</span>
          ) : d.acknowledgedAt ? (
            <span className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Acknowledged</span>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={ack.isPending} onClick={() => ack.mutate(d.id)}>Acknowledge</Button>
          )}
        </td>
      </tr>
    );
  };
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 border-b text-left text-gray-600">
          <th className="px-3 py-2.5">R.No.</th><th className="px-3 py-2.5">Marked on</th><th className="px-3 py-2.5">From</th>
          <th className="px-3 py-2.5">Subject</th><th className="px-3 py-2.5">Action by</th><th className="px-3 py-2.5"></th></tr></thead>
        <tbody>
          {open.map(row)}
          {done.length > 0 && (
            <tr><td colSpan={6} className="px-3 py-1.5 bg-gray-50 text-xs text-gray-500">Done ({done.length})</td></tr>
          )}
          {done.slice(0, 30).map(row)}
        </tbody>
      </table>
    </div>
  );
}

/** Attachments (annexures) of a dak, with upload for the parties */
export function DakAttachments({ dispatchId, departmentId, attachments, canAdd, onChanged }: {
  dispatchId: number; departmentId: number; attachments: any[]; canAdd: boolean; onChanged: () => void;
}) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("departmentId", String(departmentId));
      fd.append("file", file);
      const res = await fetch(`/api/dispatch/${dispatchId}/attachments`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Upload failed");
      toast({ title: "Attachment added", description: "Its text becomes searchable in a moment." });
      onChanged();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  if (!canAdd && attachments.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-gray-500 flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Attachments ({attachments.length})</p>
        {canAdd && (
          <>
            <input ref={input} type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />} Add
            </Button>
          </>
        )}
      </div>
      <div className="space-y-1">
        {attachments.map((a) => (
          <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-blue-50 rounded px-2 py-1">
            <FileText className="h-3.5 w-3.5 text-gray-500" />
            <span className="truncate flex-1">{a.originalName || "Attachment"}</span>
            <span className="text-gray-400">{a.addedAt ? format(new Date(a.addedAt), "dd MMM") : ""}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Physical letters of this office that other offices recorded as received */
export function Acknowledgements({ departmentId }: { departmentId: number }) {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: [`/api/dispatch/acknowledgements/${departmentId}`], enabled: !!departmentId });
  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  if (data.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-gray-500">
        <Inbox className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p className="text-lg font-medium">No acknowledgements yet</p>
        <p className="text-sm">When another office records a letter of yours as received by hand, it shows here.</p>
      </CardContent></Card>
    );
  }
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 border-b text-left text-gray-600">
          <th className="px-3 py-2.5">Received by</th><th className="px-3 py-2.5">Their R.No.</th><th className="px-3 py-2.5">On</th>
          <th className="px-3 py-2.5">Your letter no.</th><th className="px-3 py-2.5">Subject</th><th className="px-3 py-2.5">Status there</th></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id} className={`border-b last:border-b-0 ${a.cancelled ? "text-gray-400 line-through" : ""}`}>
              <td className="px-3 py-2.5">{a.receivedBy}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-green-700">{a.inwardNumber}</td>
              <td className="px-3 py-2.5 text-xs">{a.receivedAt ? format(new Date(a.receivedAt), "dd MMM yyyy") : "-"}</td>
              <td className="px-3 py-2.5 text-xs">{a.letterNumber || "-"}{a.letterDate ? ` / ${a.letterDate}` : ""}</td>
              <td className="px-3 py-2.5 truncate max-w-[320px]" title={a.subject}>{a.subject}</td>
              <td className="px-3 py-2.5 text-xs capitalize">{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
