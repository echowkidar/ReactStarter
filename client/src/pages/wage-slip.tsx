// Wage slip — the page for wage / fund staff (no login).
// The employee proves who they are with the Employee ID plus the date of joining or the bank
// account number, then sees and prints the slips of the months the section has passed.
import { retryImage } from "@/lib/retry-image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronRight, Download, Loader2, LogOut, Printer, ReceiptText } from "lucide-react";

const TURNSTILE_SITE_KEY = "0x4AAAAAACZTOpxqkHGef-Qz";
/** Cloudflare security check, loaded on demand (same as the claim forms and login pages) */
const turnstile = (): any => (window as any).turnstile;

const API = "/api/public/wage-slip";

type Employee = { epid: string; name: string; designation: string; departmentName: string };
type SlipItem = { lineId: number; month: number; year: number; label: string; net: number; days: number; departmentName: string };
type Slip = {
  epid: string; name: string; designation: string; departmentName: string; month: number; year: number; category: string;
  basic: number; vda: number; days: number; gross: number; epf: number; esi: number; mas: number; totalDeductions: number; net: number;
  erEpf: number; erEsi: number; uanNo: string | null; esiNo: string | null; bankName: string | null; bankAccountMasked: string | null; ifsc: string | null;
  headName: string | null; paymentCode: string | null; pageNo: string | null; passedOn: string | null; generatedAt: string;
};

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const inr = (n: number | string | null | undefined) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const longDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
};

// ── Amount in words (Indian numbering: thousand, lakh, crore) ────────────────
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
const below1000 = (n: number) => {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
};
function wholeInWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${wholeInWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(" ");
}
/** "Rupees Twelve Thousand Five Hundred and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const total = Math.round((Number(amount) || 0) * 100);
  const rupees = Math.floor(total / 100), paise = total % 100;
  return `Rupees ${wholeInWords(rupees)}${paise ? ` and ${below100(paise)} Paise` : ""} Only`;
}

/** Calls the wage slip API; throws an Error carrying the server's message (and its code) */
async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || "Something went wrong. Please try again."), { code: data.code, status: res.status });
  return data;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #wage-slip-print, #wage-slip-print * { visibility: visible !important; }
          #wage-slip-print { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; }
        }
      `}</style>
      <header className="bg-white border-b print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo_favicon/favicon-32x32.png" onError={retryImage} alt="" className="h-8 w-8" />
          <div>
            <h1 className="text-base font-semibold leading-tight">Wage Slip — Wage / Fund Staff</h1>
            <p className="text-xs text-slate-500">Aligarh Muslim University</p>
          </div>
          <a href="/" className="ml-auto flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Back to</span> Home
          </a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">{children}</main>
    </div>
  );
}

export default function WageSlipPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [slips, setSlips] = useState<SlipItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const reset = () => { setEmployee(null); setSlips([]); setOpen(null); };
  const fail = (error: any) => {
    if (error?.code === "SLIP_REQUIRED") {
      reset();
      toast({ title: "Session ended, please identify again", variant: "destructive" });
      return;
    }
    toast({ title: error?.message || "Something went wrong", variant: "destructive" });
  };

  const loadMe = async () => {
    const me = await api("GET", "/me");
    setEmployee(me.employee);
    setSlips(me.slips || []);
  };

  useEffect(() => {
    loadMe().catch(() => { /* not identified yet */ }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Shell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></Shell>;
  if (!employee) {
    return <Shell><Identify onDone={async () => { try { await loadMe(); } catch (e) { fail(e); } }} /></Shell>;
  }

  return (
    <Shell>
      <Card className="print:hidden">
        <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex-1 min-w-[220px]">
            <p className="font-semibold">{employee.name}</p>
            <p className="text-sm text-slate-600">{employee.designation} · {employee.departmentName}</p>
            <p className="text-xs text-slate-500">Employee ID {employee.epid}</p>
          </div>
          <Button variant="outline" size="sm" onClick={async () => { await api("POST", "/logout").catch(() => { }); reset(); }}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </CardContent>
      </Card>

      {open === null ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Your wage slips</CardTitle></CardHeader>
          <CardContent>
            {slips.length === 0 && (
              <p className="text-sm text-slate-600 py-2">No wage slip is available yet. Slips appear after the section has passed the month's wages.</p>
            )}
            <div className="divide-y">
              {slips.map((s) => (
                <button key={s.lineId} onClick={() => setOpen(s.lineId)}
                  className="w-full text-left py-3 px-1 flex items-center gap-3 rounded hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <ReceiptText className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{s.label}</p>
                    <p className="text-xs text-slate-500 truncate">{s.departmentName} · {s.days} days</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Net</p>
                    <p className="font-semibold tabular-nums">{inr(s.net)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <SlipView key={open} lineId={open} onBack={() => setOpen(null)} onError={fail} />
      )}
    </Shell>
  );
}

// ── Who are you? ─────────────────────────────────────────────────────────────

function Identify({ onDone }: { onDone: () => void }) {
  const [epid, setEpid] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [useAccount, setUseAccount] = useState(false);
  const [bankAccount, setBankAccount] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const captchaRef = useRef<HTMLDivElement>(null);
  const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  useEffect(() => {
    if (local) { setToken("local"); return; }
    const render = () => {
      if (turnstile() && captchaRef.current && !captchaRef.current.hasChildNodes()) {
        turnstile().render(captchaRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(null),
        });
      }
    };
    if (turnstile()) { render(); return; }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [local]);

  const epidOk = /^[A-Z]\d{4}$/.test(epid);
  const detailOk = useAccount ? bankAccount.length >= 6 : !!joiningDate;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("POST", "/identify", { epid, turnstileToken: token, ...(useAccount ? { bankAccount } : { joiningDate }) });
      onDone();
    } catch (e: any) {
      setError(e.message);
      if (!local && turnstile() && captchaRef.current) { turnstile().reset(captchaRef.current); setToken(null); }
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">View your wage slip</CardTitle>
        <p className="text-sm text-slate-600">For wage / fund staff. Enter your details to see and print your wage slips.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <Label htmlFor="ws-epid">Employee ID</Label>
            <Input id="ws-epid" maxLength={5} autoComplete="off" autoCapitalize="characters" value={epid}
              onChange={(e) => setEpid(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="e.g. R0001" required />
          </div>
          {!useAccount ? (
            <div className="space-y-1.5">
              <Label htmlFor="ws-doj">Date of joining</Label>
              <Input id="ws-doj" type="date" value={joiningDate} max={today()} onChange={(e) => setJoiningDate(e.target.value)} required />
              <button type="button" className="text-xs text-blue-700 underline" onClick={() => setUseAccount(true)}>
                Use my bank account number instead
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="ws-acct">Bank account number</Label>
              <Input id="ws-acct" inputMode="numeric" maxLength={25} autoComplete="off" value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, ""))} placeholder="Digits only" required />
              <p className="text-xs text-slate-500">The salary account number on record, in full.</p>
              <button type="button" className="text-xs text-blue-700 underline" onClick={() => setUseAccount(false)}>
                Use date of joining instead
              </button>
            </div>
          )}
          <div ref={captchaRef} />
          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <Button type="submit" disabled={busy || !token || !epidOk || !detailOk}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── One slip ─────────────────────────────────────────────────────────────────

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 ${bold ? "font-semibold border-t border-slate-300 mt-1 pt-1.5" : ""}`}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

function SlipView({ lineId, onBack, onError }: { lineId: number; onBack: () => void; onError: (e: any) => void }) {
  const [slip, setSlip] = useState<Slip | null>(null);
  useEffect(() => {
    api("GET", `/slip/${lineId}`).then(setSlip).catch((e) => { onError(e); onBack(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  if (!slip) return <Card><CardContent className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></CardContent></Card>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> All months</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          <Button size="sm" onClick={() => window.open(`${API}/slip/${lineId}/pdf?download=1`, "_blank", "noopener")}>
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </div>

      <div id="wage-slip-print" className="rounded-lg border bg-white p-4 sm:p-6 text-sm text-slate-900 shadow-sm">
        <div className="text-center border-b border-slate-300 pb-3 mb-3">
          <p className="text-base font-bold">Aligarh Muslim University</p>
          <p className="font-semibold">Wage Slip for {MONTHS[slip.month]} {slip.year}</p>
          <p className="text-xs text-slate-600">{slip.departmentName}</p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">Name</dt><dd className="font-medium">{slip.name}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">Employee ID</dt><dd className="font-medium">{slip.epid}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">Designation</dt><dd className="font-medium">{slip.designation}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">Category</dt><dd className="font-medium">{slip.category}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">UAN</dt><dd className="font-medium">{slip.uanNo || "—"}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">ESI No.</dt><dd className="font-medium">{slip.esiNo || "—"}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">Bank</dt><dd className="font-medium">{[slip.bankName, slip.bankAccountMasked, slip.ifsc].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500 w-28 shrink-0">Days paid</dt><dd className="font-medium">{slip.days}</dd></div>
        </dl>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-4">
          <div>
            <p className="font-semibold border-b border-slate-300 pb-1 mb-1">Earnings</p>
            <Row label={`Basic (${inr(slip.basic)} × ${slip.days})`} value={inr(slip.basic * slip.days)} />
            <Row label={`VDA (${inr(slip.vda)} × ${slip.days})`} value={inr(slip.vda * slip.days)} />
            <Row label="Gross" value={inr(slip.gross)} bold />
          </div>
          <div>
            <p className="font-semibold border-b border-slate-300 pb-1 mb-1">Deductions</p>
            <Row label="EPF" value={inr(slip.epf)} />
            <Row label="ESI" value={inr(slip.esi)} />
            <Row label="MAS" value={inr(slip.mas)} />
            <Row label="Total deductions" value={inr(slip.totalDeductions)} bold />
          </div>
        </div>

        <div className="mt-4 rounded border border-slate-300 bg-slate-50 px-3 py-2">
          <div className="flex justify-between gap-3 text-base font-bold"><span>Net payable</span><span className="tabular-nums">{inr(slip.net)}</span></div>
          <p className="text-xs text-slate-700 mt-0.5">{amountInWords(slip.net)}</p>
        </div>

        <p className="text-xs text-slate-600 mt-3">
          Employer contribution (not deducted from your wages): EPF {inr(slip.erEpf)}, ESI {inr(slip.erEsi)}.
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Payment head: {slip.headName || "—"}{slip.paymentCode ? ` (${slip.paymentCode})` : ""}
          {slip.passedOn ? ` · Passed on ${longDate(slip.passedOn)}` : ""}{slip.pageNo ? `, Page No. ${slip.pageNo}` : ""}
        </p>
        <p className="text-[11px] text-slate-500 mt-2">Computer generated wage slip · {slip.generatedAt}</p>
      </div>
    </div>
  );
}
