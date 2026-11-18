import { useEffect, useState } from "react";
import { Download, Share, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const IOS_HINT = "Tap Share, then Add to Home Screen";
const DISMISS_KEY = "installBannerDismissed";

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

/** Small "Install app" banner at the bottom of the screen; hidden once installed or dismissed. */
export function InstallBanner() {
  const { canPrompt, showIosHint, installed, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (installed || dismissed || (!canPrompt && !showIosHint)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode: hide for this visit only */ }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background p-3 shadow-lg print:hidden">
      <img src="/icons/icon-192.png" alt="" className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">Install AMU Attendance</div>
        {showIosHint && !canPrompt && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Share className="h-3.5 w-3.5 shrink-0" /> {IOS_HINT}
          </div>
        )}
      </div>
      {canPrompt && (
        <Button size="sm" onClick={() => install()}>
          <Download className="mr-1 h-4 w-4" /> Install
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Dismiss">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** "Install app" card for the settings page; hidden once installed. */
export function InstallAppCard() {
  const { canPrompt, showIosHint, installed, install } = useInstallPrompt();
  if (installed) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install app</CardTitle>
        <CardDescription>Open the attendance system from your home screen or desktop, in its own window.</CardDescription>
      </CardHeader>
      <CardContent>
        {canPrompt ? (
          <Button onClick={() => install()}>
            <Download className="mr-2 h-4 w-4" /> Install app
          </Button>
        ) : showIosHint ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Share className="h-4 w-4" /> {IOS_HINT}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Use your browser's menu and choose "Install app" or "Add to Home screen".
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Shown while the device is offline: data can't load, nothing stale is shown from a cache. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-sm font-medium text-black print:hidden">
      <WifiOff className="h-4 w-4" /> You are offline. Data can't be loaded or saved until the connection is back.
    </div>
  );
}
