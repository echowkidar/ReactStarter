// Pay slip — the page for Revolving Funds or Other Similar Funds staff (no login).
// The employee proves who they are with the Employee ID plus the date of joining or the bank
// account number, then sees and prints the pay slips of the months the section has passed.
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
  dealingCode?: string | null; sectionLabel?: string | null; panNumber?: string | null; salaryRegisterNo?: string | null; payLevel?: string | null;
  bankAccount?: string | null;
  chequeNo?: string | null; chequeDate?: string | null; // YYYY-MM-DD
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

/** Calls the pay slip API; throws an Error carrying the server's message (and its code) */
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
          #wage-slip-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border-radius: 0 !important; }
          #wage-slip-print, #wage-slip-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ws-keep { break-inside: avoid; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>
      <header className="bg-white border-b print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo_favicon/favicon-32x32.png" onError={retryImage} alt="" className="h-8 w-8" />
          <div>
            <h1 className="text-base font-semibold leading-tight">Pay Slip — Revolving Funds or Other Similar Funds</h1>
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
          <CardHeader className="pb-2"><CardTitle className="text-base">Your pay slips</CardTitle></CardHeader>
          <CardContent>
            {slips.length === 0 && (
              <p className="text-sm text-slate-600 py-2">No pay slip is available yet. Slips appear after the section has paid the month's wages and released the pay slips.</p>
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
        <CardTitle className="text-lg">View your pay slip</CardTitle>
        <p className="text-sm text-slate-600">For Revolving Funds or Other Similar Funds staff. Enter your details to see and print your pay slips.</p>
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

const MON3 = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const amt = (n: number | null | undefined) =>
  (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("-") : "");
const dash = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? "—" : String(v));

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-[13.5px] font-semibold text-slate-900 break-words ${mono ? "tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}

function AmountTable({ title, rows, totalLabel, total, accent }: {
  title: string; rows: [string, number][]; totalLabel: string; total: number; accent: "blue" | "rose";
}) {
  const bar = accent === "blue" ? "bg-blue-600" : "bg-rose-500";
  return (
    <div className="ws-keep overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className={`h-3.5 w-1 rounded-full ${bar}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">{title}</span>
        <span className="ml-auto text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Amount (₹)</span>
      </div>
      <table className="w-full text-[13.5px]">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2.5 text-slate-700">{label}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">{amt(value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50/70">
            <td className="px-4 py-2.5 font-semibold text-slate-900">{totalLabel}</td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{amt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SlipDocument({ slip }: { slip: Slip }) {
  const section = (slip.sectionLabel || "Accounts Section").trim();
  const monthName = `${MONTHS[slip.month]} ${slip.year}`;
  const lastDay = new Date(slip.year, slip.month, 0).getDate();
  const period = `01–${String(lastDay).padStart(2, "0")} ${MON3[slip.month]} ${slip.year}`;
  const days = Number.isInteger(slip.days) ? String(slip.days) : slip.days.toFixed(1);
  const rate = Math.round((slip.basic + slip.vda) * 100) / 100;
  const head = [slip.headName, slip.paymentCode ? `(${slip.paymentCode})` : ""].filter(Boolean).join(" ");
  const account = slip.bankAccount ?? slip.bankAccountMasked;

  return (
    <article id="wage-slip-print" className="ws-doc overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(15,23,42,0.18)]">
      {/* Letterhead */}
      <header className="relative bg-gradient-to-br from-[#0f2a5f] via-[#1e3a8a] to-[#1d4ed8] px-5 py-5 text-white sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_85%_-20%,#fff_0,transparent_45%)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/95 p-1.5 shadow-sm">
            <img src="/logo_favicon/favicon-32x32.png" onError={retryImage} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold leading-tight tracking-wide sm:text-lg">Aligarh Muslim University</p>
            <p className="text-[12.5px] text-blue-100">Finance &amp; Accounts Department, Aligarh</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200">Pay Slip</p>
            <p className="text-lg font-bold leading-tight">{monthName}</p>
            <div className="mt-1 flex justify-end gap-1.5">
              {slip.dealingCode && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold tracking-wider">{slip.dealingCode}</span>}
              <span className="rounded-full border border-white/40 px-2 py-0.5 text-[10.5px] font-semibold tracking-wider">WAGES</span>
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-6 sm:px-8">
        {/* Employee + net pay */}
        <section className="flex flex-wrap items-start gap-4">
          <div className="min-w-[220px] flex-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{slip.name}</h2>
            <p className="mt-0.5 text-[13.5px] text-slate-600">{slip.designation}</p>
            <p className="text-[13.5px] text-slate-600">{slip.departmentName}</p>
          </div>
          <div className="ws-keep rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Net Pay</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">₹{amt(slip.net)}</p>
          </div>
        </section>

        {/* Employee details */}
        <dl className="ws-keep grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-4 sm:p-5">
          <Field label="Employee ID" value={slip.epid} />
          <Field label="Category" value={dash(slip.category)} />
          <Field label="Pay Level" value={dash(slip.payLevel)} />
          <Field label="Rate per Day" value={`₹${amt(rate)}`} mono />
          <Field label="Days Worked" value={days} mono />
          <Field label="Pay Period" value={period} />
          <Field label="Salary Register" value={dash(slip.salaryRegisterNo)} />
          <Field label="PAN" value={dash(slip.panNumber)} />
          <Field label="UAN" value={dash(slip.uanNo)} mono />
          <Field label="ESI No." value={dash(slip.esiNo)} mono />
        </dl>

        {/* Earnings and deductions */}
        <section className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <AmountTable title="Earnings" accent="blue" totalLabel="Gross Earnings" total={slip.gross}
            rows={[["Basic Wages", slip.basic * slip.days], ["VDA", slip.vda * slip.days]]} />
          <AmountTable title="Deductions" accent="rose" totalLabel="Total Deductions" total={slip.totalDeductions}
            rows={[["EPF (Employee)", slip.epf], ["ESI (Employee)", slip.esi], ["MAS", slip.mas]]} />
        </section>

        {/* Net pay */}
        <section className="ws-keep relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white">
          <span className="absolute inset-y-0 left-0 w-1.5 bg-emerald-600" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-4 pl-6 pr-5">
            <div className="flex-1 min-w-[200px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Net Pay (Gross − Deductions)</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{amountInWords(slip.net)}</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">₹{amt(slip.net)}</p>
          </div>
        </section>

        {/* Payment details */}
        <section className="ws-keep rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">Payment Details</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-4 sm:p-5">
            <Field label="Bank" value={dash(slip.bankName)} />
            <Field label="Account No." value={dash(account)} mono />
            <Field label="IFSC" value={dash(slip.ifsc)} mono />
            <Field label="Payment Head" value={dash(head)} />
            <Field label="Cheque No." value={dash(slip.chequeNo)} mono />
            <Field label="Cheque Date" value={dash(dmy(slip.chequeDate))} mono />
            <Field label="Passed On" value={dash(dmy(slip.passedOn))} mono />
            <Field label="Page No." value={dash(slip.pageNo)} mono />
          </dl>
        </section>

        <p className="text-[12.5px] text-slate-600">
          <span className="font-medium text-slate-700">Employer contribution</span> (paid by the fund, not deducted from wages):
          EPF ₹{amt(slip.erEpf)} · ESI ₹{amt(slip.erEsi)}
        </p>
      </div>

      {/* Footer */}
      <footer className="flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-50/70 px-5 py-4 text-[12px] text-slate-600 sm:px-8">
        <div className="flex-1 min-w-[220px] space-y-0.5">
          <p>Authorised for issue by the <span className="font-semibold text-slate-800">{section}</span>.</p>
          <p>Any error must be brought to the notice of the {section}.</p>
        </div>
        <p className="text-[11px] text-slate-500">Computer generated pay slip; no signature required. Generated on {slip.generatedAt}.</p>
      </footer>
    </article>
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
      <SlipDocument slip={slip} />
    </div>
  );
}
