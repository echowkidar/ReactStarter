// Online claim forms — the employee's page (no login).
// The employee proves who they are with the Permanent ID and date of joining,
// fills a form, prints it, signs it and hands it to the department.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, FileText, Loader2, LogOut, Printer, Search, Upload } from "lucide-react";
import {
  CLAIM_STATUS_HELP, CLAIM_STATUS_LABELS, CONVEYANCE_VEHICLES, DEFAULT_CONVEYANCE_RATES, EMPLOYEE_EDITABLE, HRA_OPTIONS,
  claimSummary, conveyanceAmounts, localToday, monthLabel, quarterMonths,
  type ClaimForm, type ClaimFormType, type ClaimStatus, type ConveyanceMonthReason, type ConveyanceRate,
} from "@shared/claimForms";

const TURNSTILE_SITE_KEY = "0x4AAAAAACZTOpxqkHGef-Qz";
/** Cloudflare security check, loaded on demand (typed in pages/auth/login.tsx) */
const turnstile = (): any => (window as any).turnstile;

type FormInfo = { type: ClaimFormType; title: string; shortTitle: string; description: string; needsUndertaking: boolean };
type Employee = { name: string; epid: string; designation: string; departmentName: string; payLevel: string | null; joiningDate: string | null };

/** Calls the forms API; throws an Error carrying the server's message (and its code) */
async function api(method: string, path: string, body?: unknown): Promise<any> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api/public/forms${path}`, {
    method,
    credentials: "include",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || "Something went wrong. Please try again."), { code: data.code, status: res.status });
  return data;
}

const STATUS_COLOURS: Record<ClaimStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-100 text-amber-800",
  sent: "bg-blue-100 text-blue-800",
  returned_department: "bg-orange-100 text-orange-800",
  returned_employee: "bg-red-100 text-red-800",
  accepted: "bg-emerald-100 text-emerald-800",
  processed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return <Badge variant="outline" className={`${STATUS_COLOURS[status]} border-0 font-medium whitespace-nowrap`}>{CLAIM_STATUS_LABELS[status]}</Badge>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo_favicon/favicon-32x32.png" alt="" className="h-8 w-8" />
          <div>
            <h1 className="text-base font-semibold leading-tight">Salary Section — Online Claim Forms</h1>
            <p className="text-xs text-slate-500">Aligarh Muslim University</p>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">{children}</main>
    </div>
  );
}

export default function ClaimFormsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [claims, setClaims] = useState<ClaimForm[]>([]);
  // what is open: the list, a new form of one type, or one existing claim
  const [view, setView] = useState<{ kind: "home" } | { kind: "new"; type: ClaimFormType } | { kind: "claim"; id: number; edit?: boolean }>({ kind: "home" });

  const fail = (error: any) => {
    if (error?.code === "CLAIMANT_REQUIRED") {
      setEmployee(null);
      setView({ kind: "home" });
    }
    toast({ title: error?.message || "Something went wrong", variant: "destructive" });
  };

  useEffect(() => {
    (async () => {
      try {
        const config = await api("GET", "/config");
        setEnabled(!!config.enabled);
        setForms(config.forms || []);
        if (config.enabled) {
          try {
            const me = await api("GET", "/me");
            setEmployee(me.employee);
            setClaims(me.claims);
          } catch { /* not identified yet */ }
        }
      } catch { /* shown as closed */ }
      setLoading(false);
    })();
  }, []);

  const putClaim = (claim: ClaimForm) => setClaims((list) => [claim, ...list.filter((c) => c.id !== claim.id)].sort((a, b) => b.id - a.id));

  if (loading) return <Shell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div></Shell>;
  if (!enabled) {
    return (
      <Shell>
        <Card><CardContent className="py-10 text-center text-slate-600">
          Online claim forms are not open at present. Please contact your Department or the Salary Section.
        </CardContent></Card>
      </Shell>
    );
  }
  if (!employee) {
    return (
      <Shell>
        <Identify onDone={(e, c) => { setEmployee(e); setClaims(c); setView({ kind: "home" }); }} />
        <TrackStatus />
      </Shell>
    );
  }

  const openClaim = view.kind === "claim" ? claims.find((c) => c.id === view.id) : undefined;

  return (
    <Shell>
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex-1 min-w-[220px]">
            <p className="font-semibold">{employee.name}</p>
            <p className="text-sm text-slate-600">{employee.designation} · {employee.departmentName}</p>
            <p className="text-xs text-slate-500">Permanent ID {employee.epid}</p>
          </div>
          <Button variant="outline" size="sm" onClick={async () => { await api("POST", "/logout").catch(() => { }); setEmployee(null); setClaims([]); setView({ kind: "home" }); }}>
            <LogOut className="h-4 w-4 mr-1" /> Close
          </Button>
        </CardContent>
      </Card>

      {view.kind === "home" && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Fill a new form</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {forms.map((f) => (
                <button key={f.type} onClick={() => setView({ kind: "new", type: f.type })}
                  className="text-left rounded-lg border bg-white p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <p className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" />{f.title}</p>
                  <p className="text-sm text-slate-600 mt-1">{f.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Your forms</CardTitle></CardHeader>
            <CardContent>
              {claims.length === 0 && <p className="text-sm text-slate-500 py-2">You have not filled any form yet.</p>}
              <div className="divide-y">
                {claims.map((c) => (
                  <button key={c.id} onClick={() => setView({ kind: "claim", id: c.id })}
                    className="w-full text-left py-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-slate-50 px-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <div className="flex-1 min-w-[200px]">
                      <p className="font-medium">{forms.find((f) => f.type === c.formType)?.title || c.formType}</p>
                      <p className="text-xs text-slate-500">{c.refNo} · {c.periodLabel}</p>
                    </div>
                    <ClaimStatusBadge status={c.status} />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {view.kind === "new" && view.type === "conveyance" && (
        <ConveyanceEditor
          employee={employee} onCancel={() => setView({ kind: "home" })} onError={fail}
          onSave={async (bills) => {
            // one bill per quarter; a quarter that fails is reported, the others are kept
            const made: ClaimForm[] = [];
            try {
              for (const data of bills) {
                const claim = await api("POST", "/claims", { formType: "conveyance", data });
                made.push(claim);
                putClaim(claim);
              }
            } catch (e) { fail(e); }
            if (made.length === 1 && bills.length === 1) setView({ kind: "claim", id: made[0].id });
            else if (made.length) setView({ kind: "home" });
          }}
        />
      )}

      {view.kind === "new" && view.type !== "conveyance" && (
        <ClaimEditor
          info={forms.find((f) => f.type === view.type)!} employee={employee}
          onCancel={() => setView({ kind: "home" })}
          onSave={async (data) => {
            try {
              const claim = await api("POST", "/claims", { formType: view.type, data });
              putClaim(claim);
              setView({ kind: "claim", id: claim.id });
            } catch (e) { fail(e); }
          }}
        />
      )}

      {view.kind === "claim" && openClaim && view.edit && openClaim.formType === "conveyance" && (
        <ConveyanceEditor
          employee={employee} initial={openClaim.data} fixedQuarter={openClaim.data.quarter}
          onCancel={() => setView({ kind: "claim", id: openClaim.id })} onError={fail}
          onSave={async (bills) => {
            try {
              putClaim(await api("PUT", `/claims/${openClaim.id}`, { data: bills[0] }));
              setView({ kind: "claim", id: openClaim.id });
            } catch (e) { fail(e); }
          }}
        />
      )}

      {view.kind === "claim" && openClaim && view.edit && openClaim.formType !== "conveyance" && (
        <ClaimEditor
          info={forms.find((f) => f.type === openClaim.formType)!} employee={employee} initial={openClaim.data}
          onCancel={() => setView({ kind: "claim", id: openClaim.id })}
          onSave={async (data) => {
            try {
              putClaim(await api("PUT", `/claims/${openClaim.id}`, { data }));
              setView({ kind: "claim", id: openClaim.id });
            } catch (e) { fail(e); }
          }}
        />
      )}

      {view.kind === "claim" && openClaim && !view.edit && (
        <ClaimView
          claim={openClaim} info={forms.find((f) => f.type === openClaim.formType)!}
          onBack={() => setView({ kind: "home" })}
          onEdit={() => setView({ kind: "claim", id: openClaim.id, edit: true })}
          onChange={putClaim} onError={fail}
        />
      )}
    </Shell>
  );
}

// ── Who are you? ─────────────────────────────────────────────────────────────

function Identify({ onDone }: { onDone: (e: Employee, claims: ClaimForm[]) => void }) {
  const [epid, setEpid] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [useAccount, setUseAccount] = useState(false);
  const [accountLast4, setAccountLast4] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const captchaRef = useRef<HTMLDivElement>(null);
  const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  // Same security check as the login pages (not on a developer's own computer)
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

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api("POST", "/identify", {
        epid: epid.trim(), turnstileToken: token,
        ...(useAccount ? { accountLast4 } : { joiningDate }),
      });
      onDone(r.employee, r.claims);
    } catch (e: any) {
      setError(e.message);
      if (!local && turnstile() && captchaRef.current) { turnstile().reset(captchaRef.current); setToken(null); }
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Fill a claim form</CardTitle>
        <p className="text-sm text-slate-600">NPA, HRA and Conveyance Allowance forms can be filled here. Enter your details to begin.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <Label htmlFor="epid">Permanent ID Number</Label>
            <Input id="epid" inputMode="numeric" maxLength={5} autoComplete="off" value={epid}
              onChange={(e) => setEpid(e.target.value.replace(/\D/g, ""))} placeholder="5 digits" required />
          </div>
          {!useAccount ? (
            <div className="space-y-1.5">
              <Label htmlFor="doj">Date of joining</Label>
              <Input id="doj" type="date" value={joiningDate} max={localToday()}
                onChange={(e) => setJoiningDate(e.target.value)} required />
              <button type="button" className="text-xs text-blue-700 underline" onClick={() => setUseAccount(true)}>
                My date of joining is not accepted
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="acct">Last four digits of your salary account number</Label>
              <Input id="acct" inputMode="numeric" maxLength={4} autoComplete="off" value={accountLast4}
                onChange={(e) => setAccountLast4(e.target.value.replace(/\D/g, ""))} placeholder="4 digits" required />
              <p className="text-xs text-slate-500">Used only where no date of joining is on record.</p>
              <button type="button" className="text-xs text-blue-700 underline" onClick={() => setUseAccount(false)}>
                Use date of joining instead
              </button>
            </div>
          )}
          <div ref={captchaRef} />
          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <Button type="submit" disabled={busy || !token || epid.length !== 5}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TrackStatus() {
  const [refNo, setRefNo] = useState("");
  const [epid, setEpid] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const check = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(""); setResult(null); setBusy(true);
    try { setResult(await api("POST", "/track", { refNo, epid })); } catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Check the status of a form</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={check} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="track-ref">Reference number</Label>
            <Input id="track-ref" value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="NPA/2026/000123" className="w-48" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="track-epid">Permanent ID Number</Label>
            <Input id="track-epid" inputMode="numeric" maxLength={5} value={epid} onChange={(e) => setEpid(e.target.value.replace(/\D/g, ""))} className="w-32" required />
          </div>
          <Button type="submit" variant="outline" disabled={busy}><Search className="h-4 w-4 mr-1" /> Check</Button>
        </form>
        {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
        {result && (
          <div className="mt-3 rounded border bg-slate-50 px-3 py-2 text-sm">
            <p className="font-medium">{result.form} · {result.refNo}</p>
            <p className="mt-1"><ClaimStatusBadge status={result.status} /> <span className="text-slate-600 ml-1">{result.help}</span></p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Filling a form ───────────────────────────────────────────────────────────

const NPA_STATEMENTS = [
  "I am not involved in any kind of Private Practice whatsoever.",
  "I have submitted my Undertaking regarding private practice in the Department (copy enclosed).",
  "I have possessed essential qualification as per current NPA rules.",
  "I undertake to intimate if any change in the particulars mentioned above which affect my eligibility of NPA.",
];

function ClaimEditor({ info, employee, initial, onSave, onCancel }: {
  info: FormInfo; employee: Employee; initial?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<void>; onCancel: () => void;
}) {
  const [wefDate, setWefDate] = useState<string>(initial?.wefDate || "");
  const [option, setOption] = useState<string>(initial?.option || "");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = !!wefDate && declared && (info.type !== "hra" || !!option);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{info.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm rounded border bg-slate-50 px-3 py-2">
          <dt className="text-slate-500">Name</dt><dd className="font-medium">{employee.name}</dd>
          <dt className="text-slate-500">ID No.</dt><dd className="font-medium">{employee.epid}</dd>
          <dt className="text-slate-500">Designation</dt><dd className="font-medium">{employee.designation}</dd>
          <dt className="text-slate-500">Deptt. / Office</dt><dd className="font-medium">{employee.departmentName}</dd>
        </dl>
        <p className="text-xs text-slate-500 -mt-3">These details come from the office record. If something is wrong, please contact your Department.</p>

        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="wef">With Effect From</Label>
          <Input id="wef" type="date" value={wefDate} min={employee.joiningDate || undefined} onChange={(e) => setWefDate(e.target.value)} required />
        </div>

        {info.type === "npa" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">I certified that:</p>
            <ol className="text-sm space-y-1 list-[lower-roman] pl-6">
              {NPA_STATEMENTS.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <p className="text-sm">I am aware that if at any stage the information/documents furnished above is found to be false, all payment will be refunded by me to the institution.</p>
          </div>
        )}

        {info.type === "hra" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">I certified that:</legend>
            <p className="text-sm">1) I have not been provided with University accommodation</p>
            <p className="text-sm">2) Choose the one that applies to you:</p>
            <div className="space-y-2 pl-4">
              {Object.entries(HRA_OPTIONS).map(([key, label]) => (
                <label key={key} className={`flex items-start gap-2 rounded border px-3 py-2 text-sm cursor-pointer ${option === key ? "border-blue-500 bg-blue-50" : "bg-white"}`}>
                  <input type="radio" name="hra-option" className="mt-1" checked={option === key} onChange={() => setOption(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox checked={declared} onCheckedChange={(v) => setDeclared(v === true)} className="mt-0.5" aria-label="I have read the above and it is correct to the best of my knowledge" />
          <span>I have read the above and it is correct to the best of my knowledge.</span>
        </label>

        <div className="flex gap-2">
          <Button disabled={!ready || busy} onClick={async () => {
            setBusy(true);
            await onSave(info.type === "hra" ? { wefDate, option, declared: true } : { wefDate, declared: true });
            setBusy(false);
          }}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save and continue
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Conveyance Allowance Bill ────────────────────────────────────────────────

type ConveyanceInfo = {
  eligible: boolean; message?: string; rates?: ConveyanceRate[]; vacationStaff?: boolean;
  quarters?: Array<{ start: string; label: string; months: string[]; claimedRef: string | null; paidMonths: string[] }>;
  last?: { address: string; vehicleType: string; vehicleRegNo: string } | null;
};
type MonthEntry = { visits: string; reason: ConveyanceMonthReason | null };

const CONVEYANCE_STATEMENTS = [
  "My residence is a distance of more than one Km. from the place of visit.",
  "The visits were out side duty hours and no vehicle was provided by the hospital.",
  "I did not avail leave for than 15 days in the month of claim I have visited hospital for patient care for more than twenty times in a month besides my normal duty hours.",
  "No other type of conveyance Allowance is being drawn by me.",
  "I am maintaining a visit book of the visits made by me indicating the date, time and place of visit and it has been certified by the Chairman.",
  "I have not claimed the said allowance before, for the aforesaid period nor I will claim it a subsequently.",
];

/**
 * Fill one bill, or several quarters at once (each quarter becomes its own bill with its
 * own reference). `fixedQuarter` = changing an existing bill: its quarter stays.
 */
function ConveyanceEditor({ employee, initial, fixedQuarter, onSave, onCancel, onError }: {
  employee: Employee; initial?: Record<string, any>; fixedQuarter?: string;
  onSave: (bills: Record<string, any>[]) => Promise<void>; onCancel: () => void; onError: (e: any) => void;
}) {
  const [info, setInfo] = useState<ConveyanceInfo | null>(null);
  const [chosen, setChosen] = useState<string[]>(fixedQuarter ? [fixedQuarter] : []);
  const [entries, setEntries] = useState<Record<string, MonthEntry>>(() => {
    const start: Record<string, MonthEntry> = {};
    for (const m of (initial?.months || []) as any[]) start[m.month] = { visits: String(m.visits ?? ""), reason: m.amount > 0 ? null : m.reason };
    return start;
  });
  const [address, setAddress] = useState<string>(initial?.address || "");
  const [vehicleType, setVehicleType] = useState<string>(initial?.vehicleType || "");
  const [vehicleRegNo, setVehicleRegNo] = useState<string>(initial?.vehicleRegNo || "");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("GET", "/conveyance").then((r: ConveyanceInfo) => {
      setInfo(r);
      // details of the last bill save typing them again
      if (!initial && r.last) {
        setAddress(r.last.address || "");
        setVehicleType(r.last.vehicleType || "");
        setVehicleRegNo(r.last.vehicleRegNo || "");
      }
    }).catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!info) return <Card><CardContent className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></CardContent></Card>;
  if (!info.eligible) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-lg">Conveyance Allowance Bill</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{info.message}</p>
          <Button variant="outline" onClick={onCancel}>Back</Button>
        </CardContent>
      </Card>
    );
  }

  const rates = info.rates || DEFAULT_CONVEYANCE_RATES;
  const quarters = info.quarters || [];
  const entry = (month: string): MonthEntry => entries[month] || { visits: "", reason: null };
  const setEntry = (month: string, change: Partial<MonthEntry>) => setEntries((all) => ({ ...all, [month]: { ...entry(month), ...change } }));
  const bill = (quarter: string) => {
    const months = quarterMonths(quarter).map((month) => ({ month, visits: Number(entry(month).visits) || 0, reason: entry(month).reason }));
    return conveyanceAmounts(months, rates);
  };
  const bills = chosen.map((q) => ({ quarter: q, ...bill(q) }));
  const total = bills.reduce((sum, b) => sum + b.amount, 0);
  const ready = chosen.length > 0 && bills.every((b) => b.eligibleMonths > 0) && address.trim().length >= 5 && !!vehicleType && vehicleRegNo.trim().length >= 4 && declared;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-lg">Conveyance Allowance Bill</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm rounded border bg-slate-50 px-3 py-2">
          <dt className="text-slate-500">Name of the Doctor</dt><dd className="font-medium">{employee.name}</dd>
          <dt className="text-slate-500">Perm. I.D. No.</dt><dd className="font-medium">{employee.epid}</dd>
          <dt className="text-slate-500">Designation</dt><dd className="font-medium">{employee.designation}</dd>
          <dt className="text-slate-500">Deptt.</dt><dd className="font-medium">{employee.departmentName}</dd>
        </dl>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ca-address">Local Residential Address</Label>
            <Input id="ca-address" value={address} maxLength={120} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-vehicle">Type of Vehicle</Label>
            <select id="ca-vehicle" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose…</option>
              {CONVEYANCE_VEHICLES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-reg">Reg. No.</Label>
            <Input id="ca-reg" value={vehicleRegNo} maxLength={20} onChange={(e) => setVehicleRegNo(e.target.value.toUpperCase())} />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Period for which Conveyance Allowance is claimed</legend>
          {!fixedQuarter && <p className="text-xs text-slate-500">A quarter can be claimed after it is over. You may choose more than one; each becomes a separate bill.</p>}
          <div className="space-y-2">
            {quarters.filter((q) => !fixedQuarter || q.start === fixedQuarter).map((q) => {
              const allPaid = q.paidMonths.length === q.months.length;
              const taken = (!!q.claimedRef && !fixedQuarter) || allPaid;
              const on = chosen.includes(q.start);
              const worked = on ? bill(q.start) : null;
              return (
                <div key={q.start} className={`rounded border ${on ? "border-blue-500 bg-blue-50/40" : "bg-white"}`}>
                  <label className={`flex items-center gap-2 px-3 py-2 text-sm ${taken ? "text-slate-400" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={on} disabled={taken || !!fixedQuarter}
                      onChange={(e) => setChosen((list) => (e.target.checked ? [...list, q.start] : list.filter((x) => x !== q.start)).sort())} />
                    <span className="font-medium">{q.label}</span>
                    {taken && <span className="text-xs">{allPaid ? "— already paid" : `— already filled (${q.claimedRef})`}</span>}
                  </label>
                  {on && (
                    <div className="px-3 pb-3 space-y-2">
                      {q.months.map((month) => {
                        const paid = q.paidMonths.includes(month);
                        const x = entry(month);
                        return (
                          <div key={month} className="grid grid-cols-[7rem_1fr] sm:grid-cols-[8rem_7rem_1fr] items-center gap-2 text-sm">
                            <span>{monthLabel(month)}</span>
                            {paid ? <span className="col-span-1 sm:col-span-2 text-amber-800">Already paid — cannot be claimed</span> : (
                              <>
                                <Input type="number" inputMode="numeric" min={0} max={200} placeholder="Visits" aria-label={`Number of visits in ${monthLabel(month)}`}
                                  value={x.reason ? "" : x.visits} disabled={!!x.reason} onChange={(e) => setEntry(month, { visits: e.target.value })} />
                                <select aria-label={`${monthLabel(month)}: claimed or not`} value={x.reason || ""}
                                  onChange={(e) => setEntry(month, { reason: (e.target.value || null) as ConveyanceMonthReason | null })}
                                  className="col-span-2 sm:col-span-1 h-10 rounded-md border border-input bg-background px-2 text-sm">
                                  <option value="">Claimed (more than 20 visits)</option>
                                  <option value="vacation">Not claimed — on vacation</option>
                                  <option value="leave">Not claimed — leave for more than 15 days</option>
                                  <option value="visits">Not claimed — 20 visits or fewer</option>
                                </select>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {worked && (
                        <p className={`text-sm ${worked.eligibleMonths ? "text-slate-700" : "text-red-700"}`}>
                          {worked.eligibleMonths
                            ? <>Amount of Claim: <span className="font-semibold">Rs. {worked.amount.toLocaleString("en-IN")}</span> for {worked.eligibleMonths} month{worked.eligibleMonths > 1 ? "s" : ""}</>
                            : "Enter more than 20 visits for at least one month of this quarter."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {chosen.length > 1 && <p className="text-sm font-medium">Total of {chosen.length} bills: Rs. {total.toLocaleString("en-IN")}</p>}
          <p className="text-xs text-slate-500">Dearness allowance on this amount is added by the Salary Section.</p>
        </fieldset>

        <div className="space-y-2">
          <p className="text-sm font-medium">CERTIFIED THAT :</p>
          <ol className="text-sm space-y-1 list-decimal pl-6">
            {CONVEYANCE_STATEMENTS.map((line) => <li key={line}>{line}</li>)}
          </ol>
        </div>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox checked={declared} onCheckedChange={(v) => setDeclared(v === true)} className="mt-0.5"
            aria-label="I hereby declare that the above statement is true to the best of my knowledge and belief and based on record" />
          <span>I hereby declare that the above statement is true to the best of my knowledge and belief and based on record.</span>
        </label>

        <div className="flex gap-2">
          <Button disabled={!ready || busy} onClick={async () => {
            setBusy(true);
            await onSave(bills.map((b) => ({ quarter: b.quarter, address: address.trim(), vehicleType, vehicleRegNo: vehicleRegNo.trim(), months: b.months, declared: true })));
            setBusy(false);
          }}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save and continue
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── One form: print, sign, upload, submit, status ────────────────────────────

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${done ? "bg-green-600 text-white" : "bg-slate-200 text-slate-700"}`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : n}
      </span>
      <div className="flex-1 pb-4">
        <p className="font-medium text-sm">{title}</p>
        <div className="text-sm text-slate-600 mt-1 space-y-2">{children}</div>
      </div>
    </li>
  );
}

function ClaimView({ claim, info, onBack, onEdit, onChange, onError }: {
  claim: ClaimForm; info: FormInfo; onBack: () => void; onEdit: () => void;
  onChange: (c: ClaimForm) => void; onError: (e: any) => void;
}) {
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = EMPLOYEE_EDITABLE.includes(claim.status);
  const pdfUrl = `/api/public/forms/claims/${claim.id}/pdf`;
  const run = async (name: string, fn: () => Promise<ClaimForm>) => {
    setBusy(name);
    try { onChange(await fn()); } catch (e) { onError(e); }
    setBusy("");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <button onClick={onBack} className="text-sm text-blue-700 flex items-center gap-1 mb-1 w-fit"><ArrowLeft className="h-4 w-4" /> All forms</button>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg flex-1">{info.title}</CardTitle>
          <ClaimStatusBadge status={claim.status} />
        </div>
        <p className="text-sm text-slate-600">
          Reference <span className="font-mono font-medium">{claim.refNo}</span> · {claimSummary(claim)}
          {claim.formType === "conveyance" && <> · Amount of Claim Rs. {Number(claim.data.amount || 0).toLocaleString("en-IN")}</>}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {claim.status === "returned_employee" && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <p className="font-medium">Your department has returned this form.</p>
            <p>Reason: {claim.returnReason}</p>
            <p className="mt-1">Correct the form, print it again, sign it and submit it again.</p>
          </div>
        )}
        {claim.status === "rejected" && claim.returnReason && (
          <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Reason: {claim.returnReason}</div>
        )}

        {editable ? (
          <ol>
            <Step n={1} title={info.needsUndertaking ? "Print the certificate and the undertaking" : "Print the form"}>
              <p>{info.needsUndertaking ? "Both pages are in one file. Print on A4 paper." : "Print on A4 paper."}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><a href={pdfUrl} target="_blank" rel="noopener"><Printer className="h-4 w-4 mr-1" /> Open to print</a></Button>
                <Button variant="ghost" size="sm" onClick={onEdit}>Change the form</Button>
              </div>
              <p className="text-xs">If you change the form after printing, print it again: the old print will not be accepted.</p>
            </Step>
            {info.needsUndertaking ? (
              <>
                <Step n={2} title="Sign both pages and get them signed by the Chairman">
                  <p>Sign the certificate and the undertaking. The Chairman signs the certificate and counter-signs the undertaking.</p>
                </Step>
                <Step n={3} done={claim.hasUndertaking} title="Upload the signed undertaking">
                  <p>Scan or photograph the signed undertaking (PDF, JPG or PNG, up to 10 MB).</p>
                  <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const body = new FormData();
                      body.append("file", file);
                      run("upload", () => api("POST", `/claims/${claim.id}/undertaking`, body));
                    }} />
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                    {busy === "upload" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    {claim.hasUndertaking ? "Upload again" : "Choose file"}
                  </Button>
                  {claim.hasUndertaking && <p className="text-green-700">Undertaking uploaded.</p>}
                </Step>
                <Step n={4} title="Submit, then hand the signed certificate to your department">
                  <Button disabled={!!busy || !claim.hasUndertaking} onClick={() => run("submit", () => api("POST", `/claims/${claim.id}/submit`))}>
                    {busy === "submit" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit the form
                  </Button>
                  {!claim.hasUndertaking && <p className="text-xs">The form can be submitted after the signed undertaking is uploaded.</p>}
                </Step>
              </>
            ) : (
              <>
                <Step n={2} title="Submit the form">
                  <Button disabled={!!busy} onClick={() => run("submit", () => api("POST", `/claims/${claim.id}/submit`))}>
                    {busy === "submit" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit the form
                  </Button>
                </Step>
                <Step n={3} title="Sign the printed form and hand it to your department">
                  <p>Your department will get it signed by the Chairman / Head and send it to the Salary Section.</p>
                </Step>
              </>
            )}
          </ol>
        ) : (
          <div className="space-y-3">
            <p className="text-sm rounded border bg-slate-50 px-3 py-2">{CLAIM_STATUS_HELP[claim.status]}</p>
            {claim.status !== "cancelled" && (
              <Button asChild variant="outline" size="sm"><a href={pdfUrl} target="_blank" rel="noopener"><Printer className="h-4 w-4 mr-1" /> Open to print</a></Button>
            )}
          </div>
        )}

        {claim.events && claim.events.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1">History</p>
            <ul className="text-xs text-slate-600 space-y-0.5">
              {claim.events.map((e) => (
                <li key={e.id}>
                  {new Date(e.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} — {EVENT_LABELS[e.action] || e.action}
                  {e.actorType !== "employee" ? ` (${e.actorName})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {["draft", "submitted", "returned_employee"].includes(claim.status) && (
          <button className="text-xs text-red-700 underline" disabled={!!busy}
            onClick={() => { if (window.confirm("Cancel this form? This cannot be undone.")) run("cancel", () => api("POST", `/claims/${claim.id}/cancel`)); }}>
            Cancel this form
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export const EVENT_LABELS: Record<string, string> = {
  created: "Form filled",
  edited: "Form changed",
  undertaking_uploaded: "Signed undertaking uploaded",
  submitted: "Submitted to department",
  cancelled: "Cancelled",
  signed_form_uploaded: "Signed form uploaded by department",
  returned_to_employee: "Returned to employee",
  returned_to_department: "Returned to department",
  accepted: "Accepted by Salary Section",
  processed: "Processed",
  rejected: "Rejected",
};
