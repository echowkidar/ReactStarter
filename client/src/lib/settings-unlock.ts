// Settings PIN unlock token (see server/settingsPin.ts).
// Kept in sessionStorage: it is gone when the tab closes, and it expires on the
// server after a few minutes anyway. Sent as header x-settings-unlock.
const KEY = "settingsUnlock";

type Stored = { token: string; expiresAt: number };

export function getSettingsUnlock(): Stored | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    if (!v?.token || !v.expiresAt || v.expiresAt <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function setSettingsUnlock(token: string, expiresAt: number) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ token, expiresAt })); } catch { /* ignore */ }
}

export function clearSettingsUnlock() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Header to add to Settings write calls (empty when locked) */
export function settingsUnlockHeader(): Record<string, string> {
  const v = getSettingsUnlock();
  return v ? { "x-settings-unlock": v.token } : {};
}
