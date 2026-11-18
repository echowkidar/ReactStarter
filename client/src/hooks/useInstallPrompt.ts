import { useEffect, useState } from "react";

// Chrome / Edge / Android: the browser's install prompt event (not in TS's DOM types)
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type WinLike = { matchMedia?: (q: string) => { matches: boolean }; navigator: NavLike };
type NavLike = { userAgent: string; platform?: string; maxTouchPoints?: number; standalone?: boolean };

/** True when the app runs as an installed app (its own window, not a browser tab). */
export function isStandalone(win: WinLike): boolean {
  if (win.navigator.standalone === true) return true; // iOS Safari
  return !!win.matchMedia?.("(display-mode: standalone)").matches;
}

/** iPhone / iPad Safari: no install prompt, the user adds it from the Share menu. */
export function isIosSafari(nav: NavLike): boolean {
  const ua = nav.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);
  // Other iOS browsers (Chrome, Firefox, Edge…) can't add to Home Screen the same way
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

// Module level: the event fires once per page load, maybe before any component mounts
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function useInstallPrompt() {
  const [, rerender] = useState(0);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && isStandalone(window));

  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    const onInstalled = () => setInstalled(true);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onModeChange = () => setInstalled(isStandalone(window));
    listeners.add(update);
    window.addEventListener("appinstalled", onInstalled);
    mq?.addEventListener?.("change", onModeChange);
    return () => {
      listeners.delete(update);
      window.removeEventListener("appinstalled", onInstalled);
      mq?.removeEventListener?.("change", onModeChange);
    };
  }, []);

  const install = async () => {
    if (!deferred) return false;
    const event = deferred;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null; // a prompt can only be used once
    notify();
    if (outcome === "accepted") setInstalled(true);
    return outcome === "accepted";
  };

  return {
    canPrompt: !installed && deferred !== null,
    showIosHint: !installed && typeof navigator !== "undefined" && isIosSafari(navigator as NavLike),
    installed,
    install,
  };
}
