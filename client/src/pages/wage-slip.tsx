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
          #wage-slip-print { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; }
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
              <p className="text-sm text-slate-600 py-2">No pay slip is available yet. Slips appear after the section has passed the month's wages.</p>
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

// ── One slip (text-style layout, like the university's payroll pay slip) ─────

const COLS = 79;
const MON3 = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const money = (n: number) => (Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(2);
const padR = (v: string, n: number) => (v.length >= n ? v.slice(0, n) : v + " ".repeat(n - v.length));
const padL = (v: string, n: number) => (v.length >= n ? v.slice(-n) : " ".repeat(n - v.length) + v);
const centreIn = (v: string, n: number) => " ".repeat(Math.max(0, Math.floor((n - v.length) / 2))) + v;
function wrapChars(value: string, width: number): string[] {
  const words = String(value ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let w of words) {
    while (w.length > width) { if (line) { lines.push(line); line = ""; } lines.push(w.slice(0, width)); w = w.slice(width); }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += " " + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** The slip as fixed-width lines; `bold` marks the heading / total lines */
function slipLines(slip: Slip): { text: string; bold?: boolean }[] {
  const out: { text: string; bold?: boolean }[] = [];
  const add = (text: string, bold = false) => out.push({ text, bold });
  const up = (v: unknown) => String(v ?? "").toUpperCase();
  const monthTxt = `${up(MONTHS[slip.month])} -${slip.year}`;
  const section = (slip.sectionLabel || "Accounts Section").trim();
  const DASH = "-".repeat(COLS);

  add(padR(up(slip.dealingCode ?? ""), COLS - monthTxt.length) + monthTxt, true);
  add(centreIn("ALIGARH MUSLIM UNIVERSITY-ALIGARH, FINANCE & ACCOUNTS DEPARTMENT", COLS), true);
  add(centreIn(`PAY SLIP FOR THE MONTH OF ${monthTxt}`, COLS - 8).padEnd(COLS - 5) + "WAGES", true);
  add(DASH);

  const LV = 32, RV = COLS - 12 - LV - 2 - 17; // right value width = what fits on the line (16)
  const head = [slip.headName, slip.paymentCode ? `(${slip.paymentCode})` : ""].filter(Boolean).join(" ");
  const dayTxt = Number.isInteger(slip.days) ? String(slip.days) : slip.days.toFixed(1);
  const rate = Math.round((slip.basic + slip.vda) * 100) / 100;
  const details: [string, string, string, string][] = [
    ["NAME", up(slip.name), "PERMANENT ID", up(slip.epid)],
    ["DESIGNATION", up(slip.designation), "SALARY REGISTER", up(slip.salaryRegisterNo || "-")],
    ["DEPARTMENT", up(slip.departmentName), "PAYMENT HEAD", up(head)],
    ["CATEGORY", up(slip.category), "RATE PER DAY", money(rate)],
    ["PAY LEVEL", up(slip.payLevel || "-"), "DAYS WORKED", dayTxt],
  ];
  for (const [l1, v1, l2, v2] of details) {
    const a = wrapChars(v1, LV), b = wrapChars(v2, RV);
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      const lhs = k === 0 ? padR(l1, 11) + ":" : " ".repeat(12);
      const rhs = k === 0 ? padR(l2, 16) + ":" : " ".repeat(17);
      add(lhs + padR(a[k] ?? "", LV) + "  " + rhs + padR(b[k] ?? "", COLS - 12 - LV - 2 - 17));
    }
  }
  add(DASH);

  const earn: [string, string][] = [["BASIC", money(slip.basic * slip.days)], ["VDA", money(slip.vda * slip.days)]];
  const ded: [string, string][] = [["EPF", money(slip.epf)], ["ESI", money(slip.esi)], ["MAS", money(slip.mas)]];
  const RW = COLS - (8 + 1 + 9 + 1 + 20 + 1 + 10 + 1);
  const first = (label: string, v: string | null | undefined) => wrapChars(`${label} ${v || "-"}`, RW);
  const right: string[] = [
    ...first("BANK     ", slip.bankName ? up(slip.bankName) : ""),
    ...first("A/c      ", slip.bankAccount ?? slip.bankAccountMasked ?? ""),
    ...first("IFSC     ", slip.ifsc ? up(slip.ifsc) : ""),
    ...(slip.passedOn ? [`Passed Dt ${String(slip.passedOn).slice(0, 10).split("-").reverse().join(".")}`] : []),
    ...(slip.pageNo ? [`Page No   ${slip.pageNo}`] : []),
    "",
    "   Salary/Wage Period",
  ];
  const lastDay = new Date(slip.year, slip.month, 0).getDate();
  const mon = MON3[slip.month] ?? "";
  const yy = String(slip.year).slice(-2);
  right.push(`   01-${mon}-${yy}  to ${String(lastDay).padStart(2, "0")}-${mon}-${yy}`, "");
  right.push(`   PAN_NO :  ${slip.panNumber ? up(slip.panNumber) : "-"}`);
  if (slip.uanNo) right.push(`   UAN    :  ${slip.uanNo}`);
  if (slip.esiNo) right.push(`   ESI No.:  ${slip.esiNo}`);
  right.push("", "   Authorised For issue", "   under code");
  for (const l of wrapChars(section, RW - 3)) right.push("   " + l);

  const rows = Math.max(right.length, ded.length, earn.length);
  for (let r = 0; r < rows; r++) {
    const e = earn[r], d = ded[r];
    add(`${padR(e?.[0] ?? "", 8)}|${padL(e?.[1] ?? "", 9)}|${padR(d?.[0] ?? "", 20)}|${padL(d?.[1] ?? "", 10)}|${padR(right[r] ?? "", RW)}`);
  }
  add(DASH);
  add(`GROSS ${padL(money(slip.gross), 10)}   DEDUCTION ${padL(money(slip.totalDeductions), 10)}     NET WAGES ${padL(money(slip.net), 10)}`, true);
  add(DASH);
  for (const l of wrapChars(`Net payable in words: ${amountInWords(slip.net)}`, COLS)) add(l);
  for (const l of wrapChars(`Employer contribution (not deducted): EPF Rs. ${money(slip.erEpf)}, ESI Rs. ${money(slip.erEsi)}`, COLS)) add(l);
  add(DASH);
  for (const l of wrapChars(`NOTE  :Error if any, must be brought to the notice of the ${section}`, COLS)) add(l);
  add("=".repeat(COLS));
  add("REMARK:");
  return out;
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

      <div id="wage-slip-print" className="rounded-lg border bg-white p-3 sm:p-5 text-slate-900 shadow-sm overflow-x-auto print:overflow-visible print:bg-white print:p-4">
        <pre className="font-mono text-[11px] sm:text-xs leading-[1.35] whitespace-pre m-0 w-max print:text-[11px] print:text-black">
          {slipLines(slip).map((l, i) => (
            <div key={i} className={l.bold ? "font-bold" : undefined}>{l.text || " "}</div>
          ))}
        </pre>
        <p className="text-[11px] text-slate-500 mt-3">Computer generated pay slip, generated on {slip.generatedAt}.</p>
      </div>
    </div>
  );
}
