// Public page behind the QR code on outward documents: shows the university's
// record of the letter and lets anyone check a file against its SHA-256.
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { ShieldCheck, ShieldAlert, Loader2, FileCheck2, FileX2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DakVerify() {
  const { token } = useParams();
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [data, setData] = useState<any>(null);
  const [fileCheck, setFileCheck] = useState<"none" | "checking" | "match" | "mismatch">("none");

  useEffect(() => {
    fetch(`/api/public/dak/verify/${encodeURIComponent(token || "")}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setState("ok"); })
      .catch(() => setState("missing"));
  }, [token]);

  const checkFile = async (file: File) => {
    setFileCheck("checking");
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    setFileCheck(hex === data?.fileSha256 ? "match" : "mismatch");
  };

  if (state === "loading") {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /></div>;
  }
  if (state === "missing") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border-t-4 border-red-500">
          <ShieldAlert className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Not found</h2>
          <p className="text-slate-600">This QR code does not match any document issued through the university dak system.</p>
        </div>
      </div>
    );
  }
  const valid = data.status === "valid";
  const row = (label: string, value: any) => value ? (
    <div className="flex justify-between gap-4 py-2 border-b last:border-b-0 text-sm"><span className="text-slate-500">{label}</span><span className="font-medium text-right">{value}</span></div>
  ) : null;
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full border-t-4 ${valid ? "border-green-500" : "border-amber-500"}`}>
        <div className="text-center mb-6">
          {valid ? <ShieldCheck className="h-16 w-16 text-green-600 mx-auto mb-3" /> : <ShieldAlert className="h-16 w-16 text-amber-500 mx-auto mb-3" />}
          <h1 className="text-2xl font-bold text-slate-800">{valid ? "Issued document" : "Withdrawn document"}</h1>
          <p className="text-slate-500 text-sm mt-1">Aligarh Muslim University — dak record</p>
          {!valid && <p className="text-amber-700 text-sm mt-2">The issuing office withdrew this document{data.withdrawnOn ? ` on ${new Date(data.withdrawnOn).toLocaleDateString("en-IN")}` : ""}.</p>}
        </div>
        <div>
          {row("Outward No.", data.outwardNumber)}
          {row("Issued on", data.issuedOn ? new Date(data.issuedOn).toLocaleDateString("en-IN", { dateStyle: "long" }) : null)}
          {row("Issued by", data.issuedBy)}
          {row("Type", data.documentType)}
          {row("Subject", data.subject)}
          {row("Addressed to", data.recipients?.length ? data.recipients.join(", ") : `${data.recipientCount} office(s)`)}
        </div>
        {data.fileSha256 && (
          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <p className="text-sm font-medium text-slate-700 mb-2">Check your copy of the file</p>
            <p className="text-xs text-slate-500 mb-3">Choose the PDF you received. It is checked on this device only (not uploaded).</p>
            <input type="file" accept="application/pdf" className="text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) checkFile(f); }} />
            {fileCheck === "checking" && <p className="text-sm mt-2 text-slate-500">Checking…</p>}
            {fileCheck === "match" && <p className="text-sm mt-2 text-green-700 flex items-center gap-1"><FileCheck2 className="h-4 w-4" /> Same file as issued — not changed.</p>}
            {fileCheck === "mismatch" && <p className="text-sm mt-2 text-red-600 flex items-center gap-1"><FileX2 className="h-4 w-4" /> This file is different from the issued one.</p>}
            <p className="text-[10px] text-slate-400 mt-3 break-all">SHA-256: {data.fileSha256}</p>
          </div>
        )}
        <div className="mt-6 text-center"><a href="/"><Button variant="outline">Home</Button></a></div>
      </div>
    </div>
  );
}
