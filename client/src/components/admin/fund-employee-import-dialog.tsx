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

const REQUIRED = ["epid", "name", "departmentCode", "designationCode", "employmentStatus", "termExpiry"] as const;
const OPTIONAL = [
  "joiningDate", "wageCategory", "dealingAssistant", "fundCode", "bankAccount", "bankName", "bankBranch", "ifsc",
  "epf", "uanNo", "esi", "esiNo", "esiCovered", "mas", "monthlyFixed",
] as const;
type Key = (typeof REQUIRED)[number] | (typeof OPTIONAL)[number];
type InRow = Record<Key, string>;
type ResultRow = {
  row: number; epid: string; name: string; ok: boolean; error?: string;
  departmentName?: string; designation?: string; employmentStatus?: string; termExpiry?: string; created?: boolean;
  warnings?: string[];
  [extra: string]: any;
};
type ApiResponse = { total: number; valid: number; created: number; dryRun: boolean; results: ResultRow[] };

const COLUMN_LABEL: Record<Key, string> = {
  epid: "EPID", name: "Name", departmentCode: "Department Code", designationCode: "Designation Code",
  employmentStatus: "Employment Status", termExpiry: "Term Expiry",
  joiningDate: "Joining Date", wageCategory: "Wage Category", dealingAssistant: "Dealing Assistant", fundCode: "Payment Code",
  bankAccount: "Bank Account No.", bankName: "Bank Name", bankBranch: "Bank Branch", ifsc: "IFSC",
  epf: "EPF", uanNo: "UAN", esi: "ESI", esiNo: "ESI No.", esiCovered: "ESI Covered", mas: "MAS", monthlyFixed: "Monthly Fixed Wages",
};
const ALL_KEYS: Key[] = [...REQUIRED, ...OPTIONAL];
const HEADERS = ALL_KEYS.map((k) => COLUMN_LABEL[k]);
const EXAMPLE: Record<Key, string> = {
  epid: "R0001", name: "EXAMPLE NAME", departmentCode: "", designationCode: "ODW", employmentStatus: "Revolving Fund", termExpiry: "31-03-2027",
  joiningDate: "01-04-2024", wageCategory: "Unskilled", dealingAssistant: "", fundCode: "", bankAccount: "123456789012", bankName: "SBI",
  bankBranch: "Main Branch", ifsc: "SBIN0001234", epf: "Yes", uanNo: "", esi: "No", esiNo: "", esiCovered: "No", mas: "Yes", monthlyFixed: "",
};

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const COLUMN_ALIASES: Record<Key, string[]> = {
  epid: ["epid", "empid", "employeeid"],
  name: ["name", "employeename", "empname"],
  departmentCode: ["departmentcode", "deptcode", "departmentcd", "deptcd"],
  designationCode: ["designationcode", "desigcode", "designationcd", "desigcd"],
  employmentStatus: ["employmentstatus", "status", "employeestatus", "empstatus"],
  termExpiry: ["termexpiry", "termexpirydate", "expiry", "expirydate", "termexpiredate", "termend", "termenddate"],
  joiningDate: ["joiningdate", "dateofjoining", "doj", "joindate"],
  wageCategory: ["wagecategory", "category", "wagecat"],
  dealingAssistant: ["dealingassistant", "dealingasst", "salaryasstt", "da"],
  fundCode: ["paymentcode", "fundcode", "fund", "fundpaymentcode"],
  bankAccount: ["bankaccountno", "bankaccount", "accountno", "accountnumber", "bankacno", "bankaccno"],
  bankName: ["bankname", "bank"],
  bankBranch: ["bankbranch", "branch", "branchname"],
  ifsc: ["ifsc", "ifsccode"],
  epf: ["epf", "epfyesno", "epfapplicable"],
  uanNo: ["uan", "uanno", "uannumber"],
  esi: ["esi", "esiyesno", "esiapplicable"],
  esiNo: ["esino", "esinumber", "esicno", "esic"],
  esiCovered: ["esicovered", "esicoverage"],
  mas: ["mas", "masyesno", "masapplicable"],
  monthlyFixed: ["monthlyfixed", "monthlyfixedwages", "fixedmonthlywages", "fixedmonthly", "fixedwages", "monthlywages"],
};

const pad = (n: number) => String(n).padStart(2, "0");
const dmy = (iso?: string) => (iso ? iso.split("-").reverse().join("-") : "");
const yes = (v: any) => /^(y|yes|true|1)$/i.test(String(v ?? "").trim());
const mask = (acc: any) => { const s = String(acc ?? "").replace(/\D/g, ""); return s ? `****${s.slice(-4)}` : ""; };

function cellToText(v: any): string {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v ?? "").trim();
}

const Mark = ({ on, label }: { on: boolean; label: string }) => (
  <span className={on ? "text-green-700 dark:text-green-400" : "text-slate-400"} aria-label={`${label} ${on ? "yes" : "no"}`}>{on ? "✓" : "–"}</span>
);

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
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ALL_KEYS.map((k) => EXAMPLE[k])]);
    ws["!cols"] = HEADERS.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "fund-staff-import-template.xlsx");
  };

  const handleFile = async (file: File) => {
    setResults([]); setDone(null); setRows([]); setFileName(file.name);
    const parsed: InRow[] = [];
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      if (!data.length) { toast({ title: "Empty file", description: "The file has no rows.", variant: "destructive" }); return; }
      const head = (data[0] || []).map(norm);
      const idx: Partial<Record<Key, number>> = {};
      const missing: string[] = [];
      ALL_KEYS.forEach((k) => {
        const i = head.findIndex((h) => COLUMN_ALIASES[k].includes(h));
        if (i >= 0) idx[k] = i;
        else if ((REQUIRED as readonly string[]).includes(k)) missing.push(COLUMN_LABEL[k]);
      });
      if (missing.length) {
        toast({ title: "Column missing", description: `Missing column(s): ${missing.join(", ")}`, variant: "destructive" });
        return;
      }
      for (const r of data.slice(1)) {
        const o = Object.fromEntries(ALL_KEYS.map((k) => [k, idx[k] === undefined ? "" : cellToText(r[idx[k]!])])) as InRow;
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
        return [
          ...ALL_KEYS.map((k) => (k === "termExpiry" || k === "joiningDate" ? dmy(src[k]) || src[k] || "" : src[k] ?? (k === "epid" ? b.epid : k === "name" ? b.name : ""))),
          b.error ?? "",
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [...HEADERS, "Error"].map((_, i) => ({ wch: i === HEADERS.length ? 60 : 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    XLSX.writeFile(wb, "fund-staff-import-errors.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto px-4">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Import Revolving Funds or Other Similar Funds Staff</DialogTitle>
          <DialogDescription>
            {importSection ? `${sectionLabel(importSection)} (dealing assistant ${code})` : "Select a section first."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-sm space-y-1">
          <p>Required columns: <b>{REQUIRED.map((k) => COLUMN_LABEL[k]).join(", ")}</b> (dates as DD-MM-YYYY).</p>
          <p>Optional columns: <b>{OPTIONAL.map((k) => COLUMN_LABEL[k]).join(", ")}</b>. EPF, ESI, ESI Covered and MAS take <b>Yes</b> or <b>No</b>.</p>
          <p>Allowed Employment Status: {FUND_STATUSES.join(", ")}.</p>
          <p>
            Dealing Assistant: if left empty it is set to <b>{code || "the section's code"}</b> (Accounts: ACC, Bill: BIL, Students: STU); Accounts may also use OTH.
            Payment Code must be one of the fund codes of the department.
          </p>
          <p>EPIDs already in the app are skipped. If the Joining Date is empty, the import date is used and the department should correct it later.</p>
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
                    <TableHead>Fund</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Term Expiry</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>EPF</TableHead>
                    <TableHead>ESI</TableHead>
                    <TableHead>MAS</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => {
                    const src = rows[r.row - 2] || ({} as InRow);
                    const acc = r.bankAccount ?? src.bankAccount;
                    const ifsc = r.ifsc ?? src.ifsc;
                    return (
                      <TableRow key={`${r.row}-${i}`}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell>{r.epid}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.departmentName ?? ""}</TableCell>
                        <TableCell className="font-mono text-xs">{r.fundCode ?? src.fundCode ?? ""}</TableCell>
                        <TableCell>{r.designation ?? ""}</TableCell>
                        <TableCell>{r.employmentStatus ?? ""}</TableCell>
                        <TableCell>{dmy(r.termExpiry)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{[mask(acc), ifsc].filter(Boolean).join(" · ")}</TableCell>
                        <TableCell><Mark on={r.epf ?? yes(src.epf)} label="EPF" /></TableCell>
                        <TableCell><Mark on={r.esi ?? yes(src.esi)} label="ESI" /></TableCell>
                        <TableCell><Mark on={r.mas ?? yes(src.mas)} label="MAS" /></TableCell>
                        <TableCell>
                          {r.ok ? (
                            <div>
                              <span className="font-medium text-green-700 dark:text-green-400">{r.created ? "Imported" : "OK"}</span>
                              {(r.warnings || []).map((w, j) => (
                                <div key={j} className="text-xs text-amber-700 dark:text-amber-400">{w}</div>
                              ))}
                            </div>
                          ) : <span className="text-red-700 dark:text-red-400">{r.error}</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
