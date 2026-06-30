import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import AdminHeader from "@/components/layout/admin-header";
import {
  ArrowLeft,
  Scan,
  FileText,
  Mail,
  CheckCircle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Pencil,
  Trash2,
  Download,
  Search,
  Loader2,
  AlertCircle,
  Upload,
  X,
  ScanLine,
  Shield,
  Send,
  RefreshCw,
  Info,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────
interface LpcRecord {
  id: number;
  dispatchNumber: string;
  dispatchDate: string;
  employeeTitle: string;
  employeeId?: number;
  epid: string;
  name: string;
  designation: string;
  department: string;
  postedDeptName?: string;
  retirementReason: string;
  retiredOn: string;
  lastPaidUpTo?: string;
  payLevel?: string;
  basicPay?: number;
  nonPracticeAllowance?: number;
  dearnessAllowance?: number;
  houseRentAllowance?: number;
  transportAllowance?: number;
  otherAmount?: number;
  otherAmountLabel?: string;
  noDuesReportNo?: string;
  noDuesReportDate?: string;
  recoveries?: string;
  pdfUrl?: string;
  pdfHash?: string;
  certSerial?: string;
  scannedRawUrl?: string;
  recipientEmail?: string;
  emailStatus?: string;
  emailSentAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface RecoveryRow {
  label?: string;
  departmentDemand?: number;
  lastSalaryDeduction?: number;
  balanceToRecover?: number;
}

type FormData = {
  dispatchNumber: string;
  dispatchDate: string;
  employeeTitle: string;
  epid: string;
  name: string;
  designation: string;
  department: string;
  retirementReason: string;
  lastPaidUpTo: string;
  payLevel: string;
  basicPay: string;
  nonPracticeAllowance: string;
  dearnessAllowance: string;
  houseRentAllowance: string;
  transportAllowance: string;
  otherAmount: string;
  otherAmountLabel: string;
  noDuesReportNo: string;
  noDuesReportDate: string;
  recoveries: RecoveryRow[];
  recipientEmail: string;
  scannedRawUrl: string;
};

const emptyForm: FormData = {
  dispatchNumber: "",
  dispatchDate: new Date().toISOString().split("T")[0],
  employeeTitle: "Mr.",
  epid: "",
  name: "",
  designation: "",
  department: "",
  retirementReason: "Retired",
  lastPaidUpTo: "",
  payLevel: "",
  basicPay: "",
  nonPracticeAllowance: "",
  dearnessAllowance: "",
  houseRentAllowance: "",
  transportAllowance: "",
  otherAmount: "",
  otherAmountLabel: "CPFA",
  noDuesReportNo: "",
  noDuesReportDate: "",
  recoveries: [{}, {}, {}, {}],
  recipientEmail: "",
  scannedRawUrl: "",
};

type ScannerStatus = "idle" | "connecting" | "connected" | "no-helper" | "no-scanner" | "offline" | "scanning" | "done";
interface Scanner { id: string; name: string; isDefault?: boolean; }

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd-MM-yyyy"); } catch { return d; }
}
function toInputDate(d: string | null | undefined): string {
  if (!d) return "";
  try { return format(new Date(d), "yyyy-MM-dd"); } catch { return ""; }
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminLPC() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const adminInfo = JSON.parse(localStorage.getItem("admin") || "{}");
  const adminType = localStorage.getItem("adminType");
  const canManageLPC = adminType === "super" || adminType === "salary_admin";

  const [search, setSearch] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [activeTab, setActiveTab] = useState<"info" | "pay" | "dispatch">("info");
  const [formSaving, setFormSaving] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>("idle");
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>("");
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const scanFileInputRef = useRef<HTMLInputElement>(null);

  const [pdfViewRecord, setPdfViewRecord] = useState<LpcRecord | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<{ status: string; message: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<number | null>(null);
  const [emailSending, setEmailSending] = useState<number | null>(null);
  const [emailInputs, setEmailInputs] = useState<Record<number, string>>({});

  // ─── Query ────────────────────────────────────────────────────────────────
  const { data: records = [], isLoading } = useQuery<LpcRecord[]>({
    queryKey: ["/api/admin/lpc"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/admin/lpc"); return r.json(); },
  });

  const filtered = records.filter(r => {
    const s = search.toLowerCase();
    return (
      r.dispatchNumber?.toLowerCase().includes(s) ||
      r.epid?.toLowerCase().includes(s) ||
      r.name?.toLowerCase().includes(s) ||
      r.designation?.toLowerCase().includes(s) ||
      r.department?.toLowerCase().includes(s) ||
      fmtDate(r.dispatchDate).includes(s)
    );
  });

  // ─── OCR / Upload ─────────────────────────────────────────────────────────
  async function handleOcrFile(file: File) {
    setOcrRunning(true);
    setOcrProgress("Uploading scanned LPC...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      setOcrProgress("Running OCR on scanned document...");
      const res = await apiRequest("POST", "/api/admin/lpc/ocr", fd);
      const data = await res.json();

      const ext = data.extracted ?? {};
      setOcrProgress("Filling form from extracted data...");

      setFormData({
        ...emptyForm,
        dispatchDate: ext.dispatchDate ? dateStrToInput(ext.dispatchDate) : new Date().toISOString().split("T")[0],
        employeeTitle: ext.employeeTitle || "Mr.",
        epid: ext.epid || "",
        name: ext.name || "",
        designation: ext.designation || "",
        department: ext.department || "",
        retirementReason: ext.retirementReason || "Retired",
        lastPaidUpTo: ext.lastPaidUpTo ? dateStrToInput(ext.lastPaidUpTo) : "",
        payLevel: ext.payLevel || "",
        basicPay: ext.basicPay || "",
        noDuesReportNo: ext.noDuesReportNo || "",
        noDuesReportDate: ext.noDuesReportDate ? dateStrToInput(ext.noDuesReportDate) : "",
        scannedRawUrl: data.scannedRawUrl || "",
        dispatchNumber: ext.dispatchNumber || "",
        nonPracticeAllowance: "",
        dearnessAllowance: "",
        houseRentAllowance: "",
        transportAllowance: "",
        otherAmount: "",
        otherAmountLabel: "CPFA",
        recoveries: [{}, {}, {}, {}],
        recipientEmail: "",
      });

      setEditingId(null);
      setActiveTab("info");
      setScannerOpen(false);
      setReviewOpen(true);
      toast({ title: "✅ OCR Complete", description: "Fields extracted from scanned LPC. Please review and add dispatch details." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "OCR Failed", description: err.message });
      setScannerStatus("connected");
    } finally {
      setOcrRunning(false);
      setOcrProgress("");
    }
  }

  function dateStrToInput(s: string): string {
    const parts = s.split(/[-\/]/);
    if (parts.length === 3 && parts[2].length === 4)
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    return s;
  }

  // ─── Scanner ──────────────────────────────────────────────────────────────
  function openScannerModal() {
    setScannerStatus("connecting");
    setScanners([]);
    setScannerOpen(true);
    setOcrRunning(false);
    setOcrProgress("");

    try {
      const ws = new WebSocket("ws://localhost:8765");
      wsRef.current = ws;
      const timeout = setTimeout(() => { ws.close(); setScannerStatus("no-helper"); }, 3000);

      ws.onopen = () => { clearTimeout(timeout); ws.send(JSON.stringify({ action: "list-scanners" })); };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "scanners") {
            if (!msg.scanners?.length) setScannerStatus("no-scanner");
            else {
              setScanners(msg.scanners);
              const def = msg.scanners.find((s: Scanner) => s.isDefault) ?? msg.scanners[0];
              setSelectedScanner(def.id);
              setScannerStatus("connected");
            }
          } else if (msg.type === "scan-result") {
            setScannerStatus("done");
            const blob = new Blob([Uint8Array.from(atob(msg.data), c => c.charCodeAt(0))], { type: "image/png" });
            handleOcrFile(new File([blob], "scan.png", { type: "image/png" }));
          } else if (msg.type === "error") {
            setScannerStatus("offline");
          }
        } catch {}
      };
      ws.onerror = () => { clearTimeout(timeout); setScannerStatus("no-helper"); };
    } catch { setScannerStatus("no-helper"); }
  }

  function triggerScan() {
    if (wsRef.current?.readyState === WebSocket.OPEN && selectedScanner) {
      setScannerStatus("scanning");
      wsRef.current.send(JSON.stringify({ action: "scan", scannerId: selectedScanner }));
    }
  }

  function closeScannerModal() {
    wsRef.current?.close();
    setScannerOpen(false);
    setScannerStatus("idle");
    setScanners([]);
  }

  function downloadScannerHelper() {
    const token = localStorage.getItem("adminSessionToken") || "";
    toast({ title: "✅ Download Started", description: "After downloading, double-click AMU_Scanner_Helper.exe to install and run it." });
    window.location.href = `/api/admin/lpc/download-scanner-helper?token=${encodeURIComponent(token)}`;
  }

  // ─── Save Form ────────────────────────────────────────────────────────────
  function buildPayload() {
    return {
      dispatchNumber: formData.dispatchNumber,
      dispatchDate: formData.dispatchDate,
      employeeTitle: formData.employeeTitle,
      epid: formData.epid,
      name: formData.name,
      designation: formData.designation,
      department: formData.department,
      retirementReason: formData.retirementReason,
      lastPaidUpTo: formData.lastPaidUpTo || null,
      payLevel: formData.payLevel || null,
      basicPay: formData.basicPay ? parseInt(formData.basicPay) : null,
      nonPracticeAllowance: formData.nonPracticeAllowance ? parseInt(formData.nonPracticeAllowance) : null,
      dearnessAllowance: formData.dearnessAllowance ? parseInt(formData.dearnessAllowance) : null,
      houseRentAllowance: formData.houseRentAllowance ? parseInt(formData.houseRentAllowance) : null,
      transportAllowance: formData.transportAllowance ? parseInt(formData.transportAllowance) : null,
      otherAmount: formData.otherAmount ? parseInt(formData.otherAmount) : null,
      otherAmountLabel: formData.otherAmountLabel || null,
      noDuesReportNo: formData.noDuesReportNo || null,
      noDuesReportDate: formData.noDuesReportDate || null,
      recoveries: JSON.stringify(formData.recoveries),
      recipientEmail: formData.recipientEmail || null,
      scannedRawUrl: formData.scannedRawUrl || null,
      createdBy: adminInfo.email || "admin",
    };
  }

  async function handleSave() {
    if (!formData.dispatchNumber || !formData.dispatchDate) {
      setActiveTab("dispatch");
      toast({ variant: "destructive", title: "Dispatch Info Required", description: "Please enter both the dispatch number and date." });
      return;
    }
    if (!formData.epid || !formData.name) {
      setActiveTab("info");
      toast({ variant: "destructive", title: "Employee Info Required", description: "EPID and Name are required." });
      return;
    }
    if (!formData.designation || !formData.department) {
      toast({ variant: "destructive", title: "Validation Error", description: "Designation and Department are required." });
      return;
    }
    setFormSaving(true);
    try {
      const payload = buildPayload();
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `/api/admin/lpc/${editingId}` : "/api/admin/lpc";
      const res = await apiRequest(method, url, payload);
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.message || "Save failed");

      const pdfRes = await apiRequest("POST", `/api/admin/lpc/${saved.id ?? editingId}/generate-pdf`, {});
      const pdfData = await pdfRes.json();

      queryClient.invalidateQueries({ queryKey: ["/api/admin/lpc"] });
      setReviewOpen(false);
      toast({
        title: editingId ? "✅ LPC Updated" : "✅ LPC Dispatched",
        description: pdfRes.ok
          ? `Record saved & digitally signed PDF created.${formData.recipientEmail ? " Ready to email." : ""}`
          : `Record saved. PDF error: ${pdfData.message}`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally { setFormSaving(false); }
  }

  function openEditForm(r: LpcRecord) {
    setEditingId(r.id);
    setFormData({
      dispatchNumber: r.dispatchNumber ?? "",
      dispatchDate: toInputDate(r.dispatchDate),
      employeeTitle: r.employeeTitle ?? "Mr.",
      epid: r.epid ?? "",
      name: r.name ?? "",
      designation: r.designation ?? "",
      department: r.department ?? "",
      retirementReason: r.retirementReason ?? "Retired",
      lastPaidUpTo: toInputDate(r.lastPaidUpTo),
      payLevel: r.payLevel ?? "",
      basicPay: r.basicPay?.toString() ?? "",
      nonPracticeAllowance: r.nonPracticeAllowance?.toString() ?? "",
      dearnessAllowance: r.dearnessAllowance?.toString() ?? "",
      houseRentAllowance: r.houseRentAllowance?.toString() ?? "",
      transportAllowance: r.transportAllowance?.toString() ?? "",
      otherAmount: r.otherAmount?.toString() ?? "",
      otherAmountLabel: r.otherAmountLabel ?? "CPFA",
      noDuesReportNo: r.noDuesReportNo ?? "",
      noDuesReportDate: toInputDate(r.noDuesReportDate),
      recoveries: r.recoveries ? JSON.parse(r.recoveries) : [{}, {}, {}, {}],
      recipientEmail: r.recipientEmail ?? "",
      scannedRawUrl: r.scannedRawUrl ?? "",
    });
    setActiveTab("info");
    setReviewOpen(true);
  }

  async function handleGeneratePdf(id: number) {
    setGeneratingPdf(id);
    try {
      const res = await apiRequest("POST", `/api/admin/lpc/${id}/generate-pdf`, {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lpc"] });
      toast({ title: "✅ Signed PDF Created", description: "Digitally signed PDF is ready." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "PDF Failed", description: err.message });
    } finally { setGeneratingPdf(null); }
  }

  async function handleVerifyPdf(id: number) {
    setVerifying(true);
    try {
      const res = await apiRequest("GET", `/api/admin/lpc/${id}/verify`);
      setVerifyStatus(await res.json());
    } catch { setVerifyStatus({ status: "error", message: "Verification failed" }); }
    finally { setVerifying(false); }
  }

  async function handleSendEmail(record: LpcRecord) {
    if (!record.pdfUrl) { toast({ variant: "destructive", title: "No PDF", description: "Generate signed PDF first." }); return; }
    setEmailSending(record.id);
    try {
      const res = await apiRequest("POST", `/api/admin/lpc/${record.id}/send-email`);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lpc"] });
      if (res.ok) toast({ title: "✅ Email Sent", description: `LPC dispatched to FO sections` });
      else toast({ variant: "destructive", title: "Email Failed", description: data.message });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Email Error", description: err.message });
    } finally { setEmailSending(null); }
  }

  async function handleDelete(id: number) {
    try {
      await apiRequest("DELETE", `/api/admin/lpc/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lpc"] });
      setDeleteId(null);
      toast({ title: "Deleted", description: "LPC record deleted." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: err.message });
    }
  }

  async function handleDownloadCACert() {
    try {
      const token = localStorage.getItem("adminSessionToken") || "";
      const res = await fetch("/api/admin/lpc/ca-certificate", {
        headers: { "x-session-token": token },
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "AMU_LPC_CA.crt"; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CA Certificate Downloaded", description: "Install in Adobe Acrobat → Preferences → Signatures → Trusted Certificates to see ✔ Verified." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download Failed", description: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-indigo-50/20 to-purple-50/10">
      <AdminHeader />

      <div className="flex-1 p-4 md:p-6 max-w-screen-2xl mx-auto w-full">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/dashboard")} className="text-slate-500 hover:text-slate-700 -ml-1">
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-md">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">Last Pay Certificate (LPC)</h1>
                <p className="text-xs text-slate-400">{records.length} dispatched · Latest first</p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadCACert}
            className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1">
            <Shield className="h-3.5 w-3.5" /> Download CA Cert
          </Button>
        </div>

        {/* Primary Action — SCAN */}
        {canManageLPC && (
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 rounded-2xl p-6 mb-6 shadow-lg text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 70% 50%, white 0%, transparent 60%)" }} />
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ScanLine className="h-6 w-6" />
                Scan &amp; Dispatch LPC
              </h2>
              <p className="text-indigo-100 text-sm mt-1 max-w-lg">
                Scan the physical LPC from payroll system. OCR extracts data, you add dispatch number,
                system digitally signs and emails the PDF.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-indigo-200">
                <span className="flex items-center gap-1"><ScanLine className="h-3 w-3" /> 1. Scan LPC</span>
                <span>→</span>
                <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> 2. OCR Extracts Data</span>
                <span>→</span>
                <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> 3. Review &amp; Dispatch No.</span>
                <span>→</span>
                <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> 4. Digital Sign</span>
                <span>→</span>
                <span className="flex items-center gap-1"><Send className="h-3 w-3" /> 5. Email</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" onClick={openScannerModal}
                className="bg-white text-indigo-700 hover:bg-indigo-50 font-bold shadow-md flex items-center gap-2 px-6">
                <Scan className="h-5 w-5" /> SCAN LPC
              </Button>
              <div className="flex flex-col items-center gap-1">
                <Button size="sm" variant="outline"
                  onClick={() => scanFileInputRef.current?.click()}
                  className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1"
                  disabled={ocrRunning}>
                  {ocrRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload Scanned PDF/Image
                </Button>
                <span className="text-[10px] text-indigo-200">(if scanner not connected)</span>
              </div>
            </div>
          </div>
          {ocrRunning && (
            <div className="relative mt-4 bg-white/10 rounded-lg px-4 py-3 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
              <span className="text-sm text-white font-medium">{ocrProgress || "Processing..."}</span>
            </div>
          )}
        </div>
        )}

        {canManageLPC && (
          <input ref={scanFileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleOcrFile(e.target.files[0]); }} />
        )}

        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Search by dispatch no, EPID, name, department..." value={search}
              onChange={e => setSearch(e.target.value)} className="pl-9 bg-white shadow-sm" />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white/50 rounded-2xl border-2 border-dashed border-slate-200">
            <ScanLine className="h-14 w-14 mx-auto mb-3 text-slate-300" />
            <p className="text-lg font-semibold text-slate-500">No LPC Records</p>
            {canManageLPC && <p className="text-sm text-slate-400 mt-1">Click "SCAN LPC" to scan a physical LPC and dispatch it.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white">
                  <th className="px-3 py-3 text-left text-xs font-semibold">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">Dispatch No.</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">Dispatch Date</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold">EPID</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold min-w-[130px]">Name</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold">Designation</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold">Department</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">Signed PDF</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold min-w-[210px]">Email Dispatch</th>
                  {canManageLPC && <th className="px-3 py-3 text-left text-xs font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-3 py-3 text-slate-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-indigo-700 whitespace-nowrap">{r.dispatchNumber}</td>
                    <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtDate(r.dispatchDate)}</td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-700">{r.epid}</td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{r.employeeTitle} {r.name}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{r.designation}</td>
                    <td className="px-3 py-3 text-xs text-slate-600 max-w-[130px] truncate" title={r.department}>{r.department}</td>
                    <td className="px-3 py-3">
                      {r.pdfUrl ? (
                        <button onClick={() => { setPdfViewRecord(r); setVerifyStatus(null); if (r.pdfHash) handleVerifyPdf(r.id); }}
                          className="flex items-center gap-1.5 group/pdf">
                          <div className="w-9 h-11 bg-red-50 border border-red-200 rounded flex items-center justify-center shadow-sm">
                            <FileText className="h-4 w-4 text-red-500" />
                          </div>
                          <div>
                            <div className="text-[9px] font-bold text-emerald-600 flex items-center gap-0.5">
                              <Shield className="h-2.5 w-2.5" /> Signed
                            </div>
                            <div className="text-[9px] text-blue-500 underline">View PDF</div>
                          </div>
                        </button>
                      ) : (
                        canManageLPC ? (
                          <button onClick={() => handleGeneratePdf(r.id)} disabled={generatingPdf === r.id}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 flex items-center gap-1">
                            {generatingPdf === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                            Sign PDF
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">Not Signed</span>
                        )
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        {r.emailStatus === "sent" && (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-emerald-500" />
                            <span className="text-[10px] text-emerald-600 font-semibold">Sent {r.emailSentAt ? fmtDate(r.emailSentAt) : ""}</span>
                          </div>
                        )}
                        {r.emailStatus === "failed" && (
                          <div className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-red-500" />
                            <span className="text-[10px] text-red-500">Failed</span>
                          </div>
                        )}
                        {canManageLPC && (
                          <button onClick={() => handleSendEmail(r)} disabled={emailSending === r.id}
                            className="flex justify-center items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded px-3 py-1.5 mt-1 w-full shadow-sm">
                            {emailSending === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            {r.emailStatus === "sent" ? "Resend Email" : "Send Email"}
                          </button>
                        )}
                      </div>
                    </td>
                    {canManageLPC && <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditForm(r)} className="p-1.5 rounded hover:bg-indigo-100 text-indigo-600" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {r.pdfUrl && (
                          <button onClick={() => handleGeneratePdf(r.id)} disabled={generatingPdf === r.id}
                            className="p-1.5 rounded hover:bg-purple-100 text-purple-600" title="Re-sign PDF">
                            {generatingPdf === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {r.emailStatus !== "sent" && (
                          <button onClick={() => setDeleteId(r.id)} className="p-1.5 rounded hover:bg-red-100 text-red-500" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ REVIEW FORM DIALOG ═══ */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              {editingId ? <Pencil className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}
              {editingId ? "Edit LPC Record" : "Review OCR Data & Add Dispatch Info"}
            </DialogTitle>
            {!editingId && (
              <DialogDescription className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Data extracted from scanned LPC. Verify all fields and fill in the <strong>Dispatch tab</strong> before saving.</span>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex border-b border-slate-200 -mx-1 mb-4">
            {([
              { key: "info", label: "👤 Employee Info" },
              { key: "dispatch", label: "📋 Dispatch & Email *" },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "info" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex gap-2 col-span-2">
                <div className="w-24">
                  <Label className="text-xs">Title</Label>
                  <Select value={formData.employeeTitle} onValueChange={v => setFormData(p => ({ ...p, employeeTitle: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Dr.", "Mr.", "Mrs.", "Ms.", "Prof."].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Employee Name *</Label>
                  <Input className="h-8 text-sm" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Employee ID *</Label>
                <Input className="h-8 text-sm" value={formData.epid} onChange={e => setFormData(p => ({ ...p, epid: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Designation</Label>
                <Input className="h-8 text-sm" value={formData.designation} onChange={e => setFormData(p => ({ ...p, designation: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Input className="h-8 text-sm" value={formData.department} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} />
              </div>
            </div>
          )}

          {activeTab === "dispatch" && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-xs text-indigo-700 font-semibold mb-1">Dispatch Details</p>
                <p className="text-xs text-indigo-600">Enter the dispatch number and date to be stamped on the digital record.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">Dispatch Number (D.No.) *</Label>
                  <Input className="h-9 text-sm font-mono mt-1" value={formData.dispatchNumber}
                    onChange={e => setFormData(p => ({ ...p, dispatchNumber: e.target.value }))}
                    autoFocus />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Dispatch Date *</Label>
                  <Input type="date" className="h-9 text-sm mt-1" value={formData.dispatchDate}
                    onChange={e => setFormData(p => ({ ...p, dispatchDate: e.target.value }))} />
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <p className="text-xs text-blue-700 font-semibold mb-1 flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email Dispatch</p>
                  <p className="text-xs text-blue-600">The signed LPC PDF will be automatically emailed to the FO sections:</p>
                  <ul className="text-xs text-blue-800 mt-2 list-disc pl-5 font-mono">
                    <li>salary.fo@amu.ac.in</li>
                    <li>pension.fo@amu.ac.in</li>
                    <li>leavesection.fo@amu.ac.in</li>
                    <li>pf.fo@amu.ac.in</li>
                    <li>sbps.reg@amu.ac.in</li>
                  </ul>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs text-emerald-700 flex items-start gap-2">
                  <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span><strong>Digital Signature:</strong> A signed PDF will be auto-generated on save. Install the CA cert in Adobe Acrobat to see ✔ Verified.</span>
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 pt-4 border-t gap-2">
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(false)}>Cancel</Button>
            {activeTab !== "dispatch" && (
              <Button variant="outline" size="sm" onClick={() => setActiveTab("dispatch")} className="text-indigo-600 border-indigo-300">
                Next: Dispatch Details →
              </Button>
            )}
            <Button onClick={handleSave} disabled={formSaving} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {formSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              {editingId ? "Update & Re-sign" : "Save & Sign PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ SCANNER DIALOG ═══ */}
      <Dialog open={scannerOpen} onOpenChange={closeScannerModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Scan className="h-5 w-5" /> Scan LPC Document
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Place the physical signed LPC on the scanner, then click "Scan Now".
              OCR will extract the data automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="py-1 min-h-[220px]">

            {/* Connecting */}
            {scannerStatus === "connecting" && (
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                </div>
                <p className="text-sm font-medium text-slate-700">Connecting to Scanner Helper…</p>
                <p className="text-xs text-slate-400">Checking port 8765 on this system</p>
              </div>
            )}

            {/* Connected - scanner list */}
            {scannerStatus === "connected" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-emerald-700">Scanner Helper is running</span>
                  <span className="ml-auto text-[10px] text-emerald-500">port 8765</span>
                </div>
                <p className="text-xs text-slate-600 font-medium">Select scanner to use:</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {scanners.map(s => {
                    const isSelected = selectedScanner === s.id;
                    return (
                      <label key={s.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          isSelected ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-200 hover:border-indigo-200 hover:bg-slate-50"
                        }`}>
                        <input type="radio" name="scanner" value={s.id} checked={isSelected}
                          onChange={() => setSelectedScanner(s.id)} className="accent-indigo-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{s.id}</p>
                        </div>
                        {s.isDefault && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Default</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <Button onClick={triggerScan} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-10 text-sm font-semibold">
                  <Scan className="h-4 w-4 mr-2" /> Scan Now
                </Button>
              </div>
            )}

            {/* Scanning / OCR in progress */}
            {(scannerStatus === "scanning" || (scannerStatus === "done" && ocrRunning)) && (
              <div className="flex flex-col items-center gap-4 py-10">
                <div className="relative w-16 h-16">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                    <ScanLine className="h-8 w-8 text-indigo-400" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    {scannerStatus === "scanning" ? "Scanning document…" : ocrProgress || "Running OCR…"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Please wait, do not remove the document</p>
                </div>
              </div>
            )}

            {/* No Helper — Download & Install */}
            {scannerStatus === "no-helper" && (
              <div className="space-y-4">
                {/* Status */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900">Scanner Helper Not Installed</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      A small helper app is needed on this computer to access the scanner.
                      It installs once and starts automatically with Windows.
                    </p>
                  </div>
                </div>

                {/* Steps */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2.5">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Setup Steps</p>
                  {[
                    "Click 'Download Scanner Helper' below",
                    "Double-click the downloaded AMU_Scanner_Helper.exe",
                    "Click 'Yes' if Windows asks for permission",
                    "It will install silently and run in the background",
                    "Come back here and click 'Retry Connection'",
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs text-slate-600 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>

                {/* Download Button — primary CTA */}
                <button
                  onClick={downloadScannerHelper}
                  className="w-full flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl py-3 px-4 text-sm font-bold transition-all shadow-md hover:shadow-lg"
                >
                  <Download className="h-5 w-5" />
                  Download Scanner Helper (.exe)
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 border-t border-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">Already installed?</span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 text-sm" onClick={openScannerModal}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry Connection
                  </Button>
                  <Button variant="outline" className="flex-1 text-sm text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                    onClick={() => { closeScannerModal(); setTimeout(() => scanFileInputRef.current?.click(), 100); }}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload File Instead
                  </Button>
                </div>
              </div>
            )}

            {/* Helper running but no scanner */}
            {scannerStatus === "no-scanner" && (
              <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <XCircle className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-orange-900">No Scanner Detected</p>
                    <p className="text-xs text-orange-700 mt-0.5">Scanner Helper is running but no WIA-compatible scanner was found on this computer.</p>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl border p-3 space-y-1.5">
                  <p className="text-xs font-bold text-slate-700 mb-1">Check the following:</p>
                  {["Scanner is powered ON", "USB cable firmly connected to this computer", "Scanner driver is installed (check Device Manager)", "Try unplugging and re-plugging the USB cable"].map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-orange-400 text-xs mt-0.5">•</span>
                      <p className="text-xs text-slate-600">{tip}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm" onClick={openScannerModal}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry Detection
                  </Button>
                  <Button variant="outline" className="flex-1 text-sm"
                    onClick={() => { closeScannerModal(); setTimeout(() => scanFileInputRef.current?.click(), 100); }}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload File
                  </Button>
                </div>
              </div>
            )}

            {/* Scanner error / offline */}
            {scannerStatus === "offline" && (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-900">Scanner Not Responding</p>
                    <p className="text-xs text-red-700 mt-0.5">Scanner Helper connected but the scanner returned an error. Make sure it is powered on and ready.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm" onClick={openScannerModal}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
                  </Button>
                  <Button variant="outline" className="flex-1 text-sm"
                    onClick={() => { closeScannerModal(); setTimeout(() => scanFileInputRef.current?.click(), 100); }}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload File
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button variant="ghost" size="sm" onClick={closeScannerModal} className="text-slate-500 text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ PDF VIEWER ═══ */}
      <Dialog open={!!pdfViewRecord} onOpenChange={() => { setPdfViewRecord(null); setVerifyStatus(null); }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5 text-red-500" />
                {pdfViewRecord?.name} — Dispatch No. {pdfViewRecord?.dispatchNumber}
              </DialogTitle>
              <div className="flex items-center gap-2">
                {verifying && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                {verifyStatus && !verifying && (
                  <Badge variant="outline" className={`flex items-center gap-1 text-xs ${verifyStatus.status === "verified"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                    : "bg-red-100 text-red-700 border-red-300"}`}>
                    {verifyStatus.status === "verified" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                    {verifyStatus.status === "verified" ? "✔ VERIFIED" : "⚠ MODIFIED"}
                  </Badge>
                )}
              </div>
            </div>
            {verifyStatus && (
              <p className={`text-xs mt-1 ${verifyStatus.status === "verified" ? "text-emerald-600" : "text-red-500"}`}>
                {verifyStatus.message}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {pdfViewRecord?.pdfUrl && <iframe src={pdfViewRecord.pdfUrl} className="w-full h-full border-0" title="LPC PDF" />}
          </div>
          <div className="px-4 py-3 border-t flex justify-between items-center bg-slate-50 flex-shrink-0">
            <a href={pdfViewRecord?.pdfUrl ?? "#"} download target="_blank" rel="noopener noreferrer"
              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              <Download className="h-4 w-4" /> Download PDF
            </a>
            <Button variant="outline" size="sm" onClick={() => { setPdfViewRecord(null); setVerifyStatus(null); }}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ DELETE CONFIRM ═══ */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete LPC Record</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the LPC record and its signed PDF. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
