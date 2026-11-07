// PIN lock in front of the Settings page (server side: server/settingsPin.ts).
// Shows "set a PIN" the first time, then "enter PIN". While unlocked it shows the
// page with a small bar: time left, Lock now, Change PIN. When it locks again the
// page is only hidden (not thrown away), so after the PIN it carries on as it was.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, LockOpen, KeyRound } from "lucide-react";
import Loading from "@/components/layout/loading";
import { getSettingsUnlock, setSettingsUnlock, clearSettingsUnlock } from "@/lib/settings-unlock";

type PinStatus = { pinSet: boolean; locked: boolean; lockedUntil: number | null; unlockMinutes: number };

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-session-token": localStorage.getItem("adminSessionToken") || "",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || `Error ${res.status}`), { data });
  return data;
}

function minutesLeft(until: number) {
  return Math.max(1, Math.ceil((until - Date.now()) / 60_000));
}

export function SettingsPinGate({ children }: { children: ReactNode }) {
  const [unlock, setUnlock] = useState(getSettingsUnlock());
  const [mode, setMode] = useState<"enter" | "setup">("enter");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const [opened, setOpened] = useState(!!getSettingsUnlock());

  const { data: status, isLoading, refetch } = useQuery<PinStatus>({
    queryKey: ["/api/admin/settings-pin/status"],
    staleTime: 0,
  });

  // Re-lock when the unlock runs out; refresh the "time left" text every 30 s
  useEffect(() => {
    if (!unlock) return;
    const t = setInterval(() => {
      if (unlock.expiresAt <= Date.now()) {
        clearSettingsUnlock();
        setUnlock(null);
      } else tick((n) => n + 1);
    }, 30_000);
    return () => clearInterval(t);
  }, [unlock]);

  const reset = () => { setPin(""); setPin2(""); setPassword(""); setError(""); };

  const lockNow = () => { clearSettingsUnlock(); setUnlock(null); setMode("enter"); reset(); };

  const onEnter = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await post("/api/admin/settings-pin/verify", { pin });
      setSettingsUnlock(r.token, r.expiresAt);
      setUnlock(getSettingsUnlock());
      reset();
    } catch (err: any) {
      setError(err.message);
      setPin("");
      if (err.data?.lockedUntil) refetch();
    } finally { setBusy(false); }
  };

  const onSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{4,8}$/.test(pin)) return setError("PIN must be 4 to 8 digits");
    if (pin !== pin2) return setError("The two PINs are not the same");
    setBusy(true);
    try {
      const r = await post("/api/admin/settings-pin/setup", { password, pin });
      setSettingsUnlock(r.token, r.expiresAt);
      setUnlock(getSettingsUnlock());
      setMode("enter");
      reset();
      refetch();
    } catch (err: any) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  // Once the page has been opened it stays mounted (only hidden) while locked,
  // so filters, ticks and scroll position are all still there after the PIN.
  useEffect(() => { if (unlock) setOpened(true); }, [unlock]);

  const showPage = !!unlock && mode !== "setup";

  // Remember where the page was scrolled to when it locked; go back there after the PIN
  const savedScroll = useRef(0);
  const wasShown = useRef(showPage);
  useEffect(() => {
    if (!showPage) return;
    const onScroll = () => { savedScroll.current = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showPage]);
  useLayoutEffect(() => {
    if (wasShown.current === showPage) return;
    wasShown.current = showPage;
    if (showPage) window.scrollTo(0, savedScroll.current);
  }, [showPage]);
  const setup = mode === "setup" || !status?.pinSet;
  const lockedUntil = status?.locked ? status.lockedUntil : null;

  return (
    <>
      {!showPage && (isLoading ? <Loading /> : pinCard())}
      {opened && (
        <div hidden={!showPage}>
          {unlock && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
              <LockOpen className="h-4 w-4" />
              <span>Settings unlocked · locks again in about {minutesLeft(unlock.expiresAt)} min</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { reset(); setMode("setup"); }}>
                  <KeyRound className="mr-1 h-4 w-4" /> Change PIN
                </Button>
                <Button size="sm" variant="outline" onClick={lockNow}>
                  <Lock className="mr-1 h-4 w-4" /> Lock now
                </Button>
              </div>
            </div>
          )}
          {children}
        </div>
      )}
    </>
  );

  function pinCard() {
  return (
    <Card className="mx-auto mt-10 max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lock className="h-5 w-5" />
          {setup ? (status?.pinSet ? "Change Settings PIN" : "Set a Settings PIN") : "Settings are locked"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {setup
            ? "Enter your login password and choose a PIN of 4 to 8 digits."
            : opened
              ? "Enter your PIN to carry on — your work on this page is kept as it was."
              : "Enter your PIN to open Settings."}
        </p>
      </CardHeader>
      <CardContent>
        {setup ? (
          <form onSubmit={onSetup} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pin-password">Login password</Label>
              <Input id="pin-password" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pin-new">New PIN</Label>
              <Input id="pin-new" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8}
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pin-new2">New PIN again</Label>
              <Input id="pin-new2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8}
                value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy}>Save PIN</Button>
              {status?.pinSet && (
                <Button type="button" variant="outline" onClick={() => { reset(); setMode("enter"); }}>Cancel</Button>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={onEnter} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pin-enter">PIN</Label>
              <Input id="pin-enter" type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={8}
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                disabled={!!lockedUntil} required />
            </div>
            {lockedUntil && (
              <p className="text-sm text-red-600">Too many wrong PINs. Try again in about {minutesLeft(lockedUntil)} min.</p>
            )}
            {error && !lockedUntil && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !!lockedUntil || pin.length < 4}>Unlock</Button>
            <button type="button" className="w-full text-center text-xs text-muted-foreground underline"
              onClick={() => { reset(); setMode("setup"); }}>
              Forgot PIN? Set a new one with your login password
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
  }
}
