// Admin: delivery log of notifications — which adapter each channel uses
// (console = stub, only logged) and what was sent / stubbed / failed.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  sent: "bg-green-100 text-green-800", stubbed: "bg-amber-100 text-amber-800", failed: "bg-red-100 text-red-700",
};

export default function AdminNotificationLog() {
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const qs = `${channel !== "all" ? `channel=${channel}&` : ""}${status !== "all" ? `status=${status}` : ""}`;
  const { data, isLoading } = useQuery<any>({ queryKey: [`/api/admin/notifications?${qs}`] });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <span className="text-gray-500">Adapters:</span>
            <span className="px-2 py-0.5 rounded bg-gray-100">In-app: app</span>
            {data?.adapters && Object.entries(data.adapters).map(([c, a]: any) => (
              <span key={c} className={`px-2 py-0.5 rounded ${a === "console" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                {c === "sms" ? "SMS" : c === "whatsapp" ? "WhatsApp" : "E-mail"}: {a}
              </span>
            ))}
            {data?.disabled?.length > 0 && <span className="px-2 py-0.5 rounded bg-red-100 text-red-700">Off: {data.disabled.join(", ")}</span>}
          </div>
          <div className="flex gap-2 ml-auto">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="inapp">In-app</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="stubbed">Stubbed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-gray-500">“Stubbed” = the channel runs on the console adapter: the message was only logged, not delivered. Real SMS / WhatsApp providers are added later.</p>
      <Card><CardContent className="p-0 overflow-x-auto">
        {isLoading ? <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-left text-gray-600">
              <th className="px-3 py-2">When</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">To</th>
              <th className="px-3 py-2">Message</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>
              {(data?.rows || []).map((r: any) => (
                <tr key={r.id} className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{format(new Date(r.createdAt), "dd MMM, HH:mm")}</td>
                  <td className="px-3 py-2 text-xs">{r.channel}<div className="text-gray-400">{r.adapter}</div></td>
                  <td className="px-3 py-2 text-xs">{r.staffName || r.departmentName}<div className="text-gray-400 font-mono">{r.address || ""}</div></td>
                  <td className="px-3 py-2"><div className="font-medium text-xs">{r.title}</div><div className="text-xs text-gray-600 line-clamp-2">{r.body}</div>
                    <div className="text-[10px] text-gray-400">{r.event}</div></td>
                  <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status] || "bg-gray-100"}`}>{r.status}</span>
                    {r.error && <div className="text-[10px] text-red-600 mt-0.5 max-w-[160px] truncate" title={r.error}>{r.error}</div>}</td>
                </tr>
              ))}
              {(data?.rows || []).length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Nothing yet.</td></tr>}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </div>
  );
}
