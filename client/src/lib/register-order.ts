// Salary register ordering helpers (dealing assistant's own paper-register order).
// Pure functions — no React — so they are easy to test.

const norm = (s: string) => String(s || "").trim().toUpperCase();

/** Sorts `values` by the saved order; registers not in the order follow, A→Z (existing behaviour). */
export function sortByCustomOrder(values: string[], order: string[]): string[] {
  const pos = new Map<string, number>();
  order.forEach((v, i) => { if (!pos.has(norm(v))) pos.set(norm(v), i); });
  return [...values].sort((a, b) => {
    const pa = pos.get(norm(a)), pb = pos.get(norm(b));
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Next/previous register for the « » buttons.
 * - exactly one register selected → move from it
 * - none / several selected → » starts at the first, « at the last
 * Returns null at the ends (no wrap-around), with which end was hit.
 */
export function stepRegister(list: string[], selected: string[], dir: 1 | -1): { value: string; index: number } | { edge: "first" | "last" } | null {
  if (list.length === 0) return null;
  const cur = selected.length === 1 ? list.findIndex((v) => norm(v) === norm(selected[0])) : -1;
  if (cur === -1) {
    const index = dir > 0 ? 0 : list.length - 1;
    return { value: list[index], index };
  }
  const next = cur + dir;
  if (next < 0) return { edge: "first" };
  if (next >= list.length) return { edge: "last" };
  return { value: list[next], index: next };
}

/** Saved order first (kept even if not visible now), then newly seen registers A→Z */
export function mergeOrder(saved: string[], available: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of saved) { const k = norm(v); if (k && !seen.has(k)) { seen.add(k); out.push(v.trim()); } }
  const rest = available.filter((v) => !seen.has(norm(v))).sort();
  for (const v of rest) { const k = norm(v); if (k && !seen.has(k)) { seen.add(k); out.push(v.trim()); } }
  return out;
}

/**
 * Applies a pasted list (one per line / comma / space separated): pasted registers come first
 * in the pasted order, all others keep their current relative order after them.
 * Pasted values are matched case-insensitively to known registers.
 */
export function applyPastedOrder(current: string[], pasted: string): string[] {
  const byKey = new Map(current.map((v) => [norm(v), v]));
  const tokens = pasted.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const first: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const k = norm(t);
    if (seen.has(k)) continue;
    seen.add(k);
    first.push(byKey.get(k) ?? t.toUpperCase());
  }
  return [...first, ...current.filter((v) => !seen.has(norm(v)))];
}

/** Moves item at `from` to `to` (array copy) */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(copy.length, to)), 0, x);
  return copy;
}
