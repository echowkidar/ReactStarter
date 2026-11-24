import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FUND_STATUSES } from "@shared/employeeKind";
import { sectionLabel, type SectionKey } from "@shared/sections";

type ImportSection = Exclude<SectionKey, "salary">;
const SECTION_CODE: Record<ImportSection, string> = { accounts: "ACC", bill: "BIL", students: "STU" };
const MAX_ROWS = 2000;

type InRow = { epid: string; name: string; departmentCode: string; designationCode: string; employmentStatus: string; termExpiry: string };
type ResultRow = {
  row: number; epid: string; name: string; ok: boolean; error?: string;
  departmentName?: string; designation?: string; employmentStatus?: string; termExpiry?: string; created?: boolean;
};
type ApiResponse = { total: number; valid: number; created: number; dryRun: boolean; results: ResultRow[] };

const HEADERS = ["EPID", "Name", "Department Code", "Designation Code", "Employment Status", "Term Expiry"];

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const COLUMN_ALIASES: Record<keyof InRow, string[]> = {
  epid: ["epid", "empid", "employeeid"],
  name: ["name", "employeename", "empname"],
  departmentCode: ["departmentcode", "deptcode", "departmentcd", "deptcd"],
  designationCode: ["designationcode", "desigcode", "designationcd", "desigcd"],
  employmentStatus: ["employmentstatus", "status", "employeestatus", "empstatus"],
  termExpiry: ["termexpiry", "termexpirydate", "expiry", "expirydate", "termexpiredate", "termend", "termenddate"],
};
const COLUMN_LABEL: Record<keyof InRow, string> = {
  epid: "EPID", name: "Name", departmentCode: "Department Code", designationCode: "Designation Code",
  employmentStatus: "Employment Status", termExpiry: "Term Expiry",
};

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (iso?: string) => (iso ? iso.split("-").reverse().join("-") : "");

function cellToText(v: any): string {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v ?? "").trim();
}

export function FundEmployeeImportDialog({
  open, onOpenChange, section,
}: { open: boolean; onOpenChange: (o: boolean) => void; section: SectionKey }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<InRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null);

  const importSection: ImportSection | null = section === "salary" ? null : section;
  const code = importSection ? SECTION_CODE[importSection] : "";

  const reset = () => {
    setRows([]); setResults([]); setFileName(""); setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const call = async (payload: InRow[], dryRun: boolean): Promise<ApiResponse | null> => {
    try {
      const res = await apiRequest("POST", "/api/admin/fund-employees/import", { rows: payload, dryRun, section: importSection });
      return (await res.json()) as ApiResponse;
    } catch (e: any) {
      let msg = String(e?.message || "Import failed");
      const m = msg.match(/\{.*\}/s);
      if (m) { try { msg = JSON.parse(m[0]).message || msg; } catch { /* keep */ } }
      toast({ title: "Import failed", description: msg, variant: "destructive" });
      return null;
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ["R0001", "EXAMPLE NAME", "", "ODW", "Revolving Fund", "31-03-2027"]]);
    ws["!cols"] = HEADERS.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "fund-staff-import-template.xlsx");
  };

  const handleFile = async (file: File) => {
    setResults([]); setDone(null); setRows([]); setFileName(file.name);
    let parsed: InRow[] = [];
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      if (!data.length) { toast({ title: "Empty file", description: "The file has no rows.", variant: "destructive" }); return; }
      const head = (data[0] || []).map(norm);
      const idx = {} as Record<keyof InRow, number>;
      const missing: string[] = [];
      (Object.keys(COLUMN_ALIASES) as (keyof InRow)[]).forEach((k) => {
        const i = head.findIndex((h) => COLUMN_ALIASES[k].includes(h));
        if (i < 0) missing.push(COLUMN_LABEL[k]); else idx[k] = i;
      });
      if (missing.length) {
        toast({ title: "Column missing", description: `Missing column(s): ${missing.join(", ")}`, variant: "destructive" });
        return;
      }
      for (const r of data.slice(1)) {
        const o = {} as InRow;
        (Object.keys(idx) as (keyof InRow)[]).forEach((k) => { o[k] = cellToText(r[idx[k]]); });
        if (Object.values(o).every((v) => !v)) continue;
        parsed.push(o);
      }
    } catch {
      toast({ title: "Could not read the file", description: "Use an .xlsx, .xls or .csv file.", variant: "destructive" });
      return;
    }
    if (!parsed.length) { toast({ title: "No data", description: "The file has no data rows.", variant: "destructive" }); return; }
    if (parsed.length > MAX_ROWS) {
      toast({ title: "Too many rows", description: `At most ${MAX_ROWS} rows can be imported at once.`, variant: "destructive" });
      return;
    }
    setRows(parsed);
    setBusy(true);
    const r = await call(parsed, true);
    setBusy(false);
    if (r) setResults(r.results);
  };

  const validCount = results.filter((r) => r.ok).length;
  const errorCount = results.length - validCount;

  const doImport = async () => {
    setBusy(true);
    const r = await call(rows, false);
    setBusy(false);
    if (!r) return;
    setResults(r.results);
    setDone({ created: r.created, skipped: r.total - r.created });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/employees"] });
    toast({ title: "Import finished", description: `${r.created} employees imported, ${r.total - r.created} skipped` });
  };

  const downloadErrors = () => {
    const bad = results.filter((r) => !r.ok);
    const aoa = [
      [...HEADERS, "Error"],
      ...bad.map((b) => {
        const src = rows[b.row - 2] || ({} as InRow);
        return [src.epid ?? b.epid, src.name ?? b.name, src.departmentCode ?? "", src.designationCode ?? "", src.employmentStatus ?? "", dmy(src.termExpiry) || src.termExpiry || "", b.error ?? ""];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [...HEADERS, "Error"].map((_, i) => ({ wch: i === 6 ? 60 : 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    XLSX.writeFile(wb, "fund-staff-import-errors.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto px-4">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Import Revolving Funds or Other Similar Funds Staff</DialogTitle>
          <DialogDescription>
            {importSection ? `${sectionLabel(importSection)} (dealing assistant ${code})` : "Select a section first."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-sm space-y-1">
          <p>Required columns: <b>EPID, Name, Department Code, Designation Code, Employment Status, Term Expiry</b> (DD-MM-YYYY).</p>
          <p>Allowed Employment Status: {FUND_STATUSES.join(", ")}.</p>
          <p>The dealing assistant is set automatically to <b>{code || "the section's code"}</b> (Accounts: ACC, Bill: BIL, Students: STU).</p>
          <p>EPIDs already in the app are skipped. The joining date is set to the import date; the department should correct it later.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" /> Download template
          </Button>
          <Button type="button" variant="outline" disabled={busy || !importSection} onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> Choose file
          </Button>
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        {busy && <p className="text-sm text-muted-foreground">Please wait...</p>}

        {results.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>Total: <b>{results.length}</b></span>
              <span className="text-green-700 dark:text-green-400">Valid: <b>{validCount}</b></span>
              <span className="text-red-700 dark:text-red-400">With errors: <b>{errorCount}</b></span>
              {done && (
                <span className="font-semibold text-green-700 dark:text-green-400">
                  {done.created} employees imported, {done.skipped} skipped
                </span>
              )}
            </div>

            <div className="max-h-[45vh] overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>EPID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Term Expiry</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={`${r.row}-${i}`}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.epid}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.departmentName ?? ""}</TableCell>
                      <TableCell>{r.designation ?? ""}</TableCell>
                      <TableCell>{r.employmentStatus ?? ""}</TableCell>
                      <TableCell>{dmy(r.termExpiry)}</TableCell>
                      <TableCell>
                        {r.ok
                          ? <span className="font-medium text-green-700 dark:text-green-400">{r.created ? "Imported" : "OK"}</span>
                          : <span className="text-red-700 dark:text-red-400">{r.error}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {errorCount > 0 && (
                <Button type="button" variant="outline" onClick={downloadErrors}>
                  <FileDown className="w-4 h-4 mr-2" /> Download errors
                </Button>
              )}
              <Button type="button" disabled={busy || validCount === 0 || !!done} onClick={doImport}>
                Import {validCount} valid employees
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FundEmployeeImportDialog;
