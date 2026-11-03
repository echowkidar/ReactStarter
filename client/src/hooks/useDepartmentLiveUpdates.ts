// Live updates for department pages
// ─────────────────────────────────────────────────────────────────────────────
// Keeps the department user's screen in step with changes made elsewhere
// (Admin dashboard, Salary Section, another device of the same department):
//
//  1. A Server-Sent-Events connection (/api/live/department/:id) receives a small
//     "change" signal whenever data of this department changes on the server.
//  2. When the user comes back to the tab/app, or the phone's internet returns,
//     the page also refreshes (signals may have been missed meanwhile).
//
// A refresh never reloads the page: it only re-fetches the data the page shows
// (React Query). While a popup is open the refresh waits until it is closed —
// except popups marked with a [data-live-safe] element (the attendance report and
// Edit Employee popups), which handle live data themselves without losing input.

import { useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { getCurrentDepartment } from "@/lib/auth";

/** Fired on window just before data is re-fetched (forms may listen to it). */
export const LIVE_CHANGE_EVENT = "department-live-change";

const DEBOUNCE_MS = 800;          // many quick admin edits → one refresh
const BLOCKED_RETRY_MS = 1500;    // re-check while a popup is open

/** Only queries of department-visible data are refreshed (never mail / dispatch). */
export function isLiveRefreshKey(queryKey: readonly unknown[], departmentId: number): boolean {
  const k = typeof queryKey?.[0] === "string" ? (queryKey[0] as string) : "";
  if (!k.startsWith("/api/")) return false;
  if (k.includes("/dispatch") || k.includes("/email") || k.includes("mailbox")) return false;
  return (
    k === `/api/departments/${departmentId}` ||
    k.startsWith(`/api/departments/${departmentId}/`) ||
    k.startsWith(`/api/departments/${departmentId}?`) ||
    k.startsWith("/api/attendance/") ||
    k.startsWith("/api/employees/") ||
    k.startsWith("/api/admin/attendance/") ||
    k === "/api/admin/settings" ||
    k === "/api/salary-registers" ||
    k === "/api/departments" ||
    k === "/api/downloads"
  );
}

/** Is a popup open that is NOT prepared for live data? */
function blockingPopupOpen(): boolean {
  const open = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  for (const el of Array.from(open)) {
    if (!el.querySelector("[data-live-safe]")) return true;
  }
  return false;
}

export function useDepartmentLiveUpdates() {
  const [location] = useLocation();
  const onDepartmentPage = location.startsWith("/dashboard");
  const departmentId = onDepartmentPage ? getCurrentDepartment()?.id ?? null : null;

  useEffect(() => {
    if (!departmentId || typeof window === "undefined") return;

    let disposed = false;
    let es: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    let connectedOnce = false;

    const run = () => {
      if (disposed) return;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      // Screen off / app in background → refresh when the user comes back
      if (document.visibilityState === "hidden") { pending = true; return; }
      // A normal popup is open → wait so nothing the user typed is disturbed
      if (blockingPopupOpen()) {
        pending = true;
        retryTimer = setTimeout(run, BLOCKED_RETRY_MS);
        return;
      }
      pending = false;
      try {
        window.dispatchEvent(new CustomEvent(LIVE_CHANGE_EVENT, { detail: { departmentId } }));
      } catch { /* ignore */ }
      queryClient.invalidateQueries({
        predicate: (q) => isLiveRefreshKey(q.queryKey, departmentId),
      });
    };

    const schedule = (delay = DEBOUNCE_MS) => {
      if (disposed) return;
      pending = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(run, delay);
    };

    const disconnect = () => {
      try { es?.close(); } catch { /* ignore */ }
      es = null;
    };

    const connect = () => {
      if (disposed || typeof EventSource === "undefined") return;
      try { es?.close(); } catch { /* ignore */ }
      es = new EventSource(`/api/live/department/${departmentId}`);
      es.addEventListener("ready", () => {
        // A (re)connect means signals may have been missed meanwhile → refresh once
        if (connectedOnce) schedule(0);
        connectedOnce = true;
      });
      es.addEventListener("change", () => schedule());
      // EventSource reconnects by itself; if the browser gave up, reconnect on return
      es.onerror = () => { /* handled by readyState check on visibility/online */ };
    };

    // The connection is kept only while the page is visible: saves the phone's
    // battery and keeps background tabs from using up the browser's connections.
    // Coming back reconnects, and the "ready" event then refreshes the page once.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        disconnect();
        return;
      }
      if (!es || es.readyState === EventSource.CLOSED) connect();
      if (pending) schedule(0);
    };

    const onOnline = () => {
      if (!es || es.readyState === EventSource.CLOSED) connect();
      schedule(0);
    };

    if (document.visibilityState !== "hidden") connect();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (retryTimer) clearTimeout(retryTimer);
      disconnect();
    };
  }, [departmentId]);
}

/** Mount once inside the router. Renders nothing. */
export function DepartmentLiveUpdates() {
  useDepartmentLiveUpdates();
  return null;
}
