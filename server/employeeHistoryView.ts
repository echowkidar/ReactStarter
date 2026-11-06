// Employee history as shown to users: previous → new value, real changes only.
// ─────────────────────────────────────────────────────────────────────────────
// Rows written before `new_value` existed have no new value. For a field
// change it is the previous value of the NEXT change of the same field, or —
// for the latest change — the employee's current value.
// Hidden from the list:
//   • changes whose previous and new value are the same (nothing changed),
//   • Oracle-only bookkeeping fields (Oracle status, salary group).

const FIELD_CHANGE_ACTIONS = new Set(["update", "oracle_sync", "oracle_sync_undo"]);
const INTERNAL_FIELDS = new Set(["oracleEmpStatus", "salGroup", "oracleSyncedAt", "sortOrder"]);

type Row = {
  id: number;
  action: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  timestamp: string | Date;
  [k: string]: any;
};

const norm = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s === "none" ? "" : s;
};

/** Current value of a history field on the employee record */
function currentValue(field: string, employee: Record<string, any> | undefined, departmentName?: string | null): string | null {
  if (!employee) return null;
  if (field === "departmentId") return departmentName ?? (employee.departmentId != null ? String(employee.departmentId) : null);
  if (!(field in employee)) return null;
  return norm(employee[field]);
}

export function buildHistoryView(
  rows: Row[],
  employee: Record<string, any> | undefined,
  departmentName?: string | null,
): Array<Row & { newValue: string | null; isSync: boolean }> {
  // Oldest first, to look at "the next change of the same field"
  const asc = [...rows].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || a.id - b.id);
  const out: Array<Row & { newValue: string | null; isSync: boolean }> = [];

  asc.forEach((r, idx) => {
    if (INTERNAL_FIELDS.has(r.field)) return;
    const isSync = String(r.changedByRole || "") === "oracle_sync" || r.action.startsWith("oracle_sync");
    let newValue = r.newValue;

    if (FIELD_CHANGE_ACTIONS.has(r.action) && r.field !== "created") {
      if (newValue === null || newValue === undefined) {
        const next = asc.slice(idx + 1).find((x) => x.field === r.field && FIELD_CHANGE_ACTIONS.has(x.action));
        newValue = next ? next.previousValue : currentValue(r.field, employee, departmentName);
      }
      if (norm(r.previousValue) === norm(newValue)) return; // nothing actually changed
    }
    out.push({ ...r, newValue: newValue ?? null, isSync });
  });

  return out.reverse(); // newest first, as before
}
