import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Send, Inbox, FileUp, Upload, Scan, ArrowLeft, Loader2, Search, X, CheckCircle2,
  Eye, Clock, Forward, UserCheck, AlertTriangle, ChevronDown, ChevronUp,
  Download, Plus, Trash2, Users, Building2, ExternalLink, Lock, FileText,
  Paperclip, ZoomIn, ZoomOut, RefreshCw, MailCheck, Archive, Undo2
} from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import ScannerModal from "@/components/ScannerModal";
import { getCurrentDepartment } from "@/lib/auth";
import { format } from "date-fns";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────
interface DispatchDoc {
  id: number;
  senderDepartmentId: number;
  senderName: string;
  documentType: string;
  subject: string;
  dispatchNumber: string | null;
  dispatchDate: string | null;
  referenceNumber: string | null;
  inwardNumber: string | null;
  outwardNumber: string | null;
  fileUrl: string;
  fileType: string;
  isConfidential: boolean;
  priority: string;
  aiConfidence: string | null;
  createdAt: string;
  recipients?: any[];
  recipientCount?: number;
  readCount?: number;
  recipientStatus?: string;
  recipientId?: number;
  receivedAt?: string;
  readAt?: string;
  markedToStaff?: string;
  markedBy?: string;
  staffRemarks?: string;
  emailSent?: boolean;
  isPhysicalReceive?: boolean;
}

interface TrackingEntry {
  id: number;
  action: string;
  actionByName: string;
  details: string;
  createdAt: string;
}

const DOCUMENT_TYPES = [
  "Letter", "Office Memo", "Office Order", "Application", "Notification",
  "Circular", "Notice", "File", "Note", "Report", "Minutes", "Resolution",
  "Endorsement", "Certificate", "Invoice", "Quotation", "Tender", "Other",
];

// ─── Main Component ──────────────────────────────────────────────────────
export default function Dispatch() {
  const { toast } = useToast();
  const department = getCurrentDepartment();
  const [activeTab, setActiveTab] = useState("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DispatchDoc[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // ─── New Dispatch State ─────────────────────────────────────────────
  const [showNewDispatch, setShowNewDispatch] = useState(false);
  const [showReceiveEntry, setShowReceiveEntry] = useState(false);
  const [dispatchStep, setDispatchStep] = useState<"upload" | "form" | "recipients">("upload");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [isAiAttempted, setIsAiAttempted] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [uploadedFileType, setUploadedFileType] = useState("image");
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<"dispatch" | "receive">("dispatch");

  // Form fields (editable — auto-filled by AI or manual)
  const [formDocType, setFormDocType] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formDispatchNo, setFormDispatchNo] = useState("");
  const [formDispatchDate, setFormDispatchDate] = useState("");
  const [formRefNo, setFormRefNo] = useState("");
  const [formPriority, setFormPriority] = useState("normal");
  const [formConfidential, setFormConfidential] = useState(false);
  const [formSendEmail, setFormSendEmail] = useState(false);

  // Recipients
  const [selectedRecipients, setSelectedRecipients] = useState<Array<{type: string; id: number; name: string}>>([]);
  const [deptSearchQuery, setDeptSearchQuery] = useState("");
  const [deptSearchResults, setDeptSearchResults] = useState<any[]>([]);
  const [showGroupSelector, setShowGroupSelector] = useState(false);

  // Receive Entry form
  const [recvStep, setRecvStep] = useState<"upload" | "form">("upload");
  const [recvIsExtracting, setRecvIsExtracting] = useState(false);
  const [recvExtractionFailed, setRecvExtractionFailed] = useState(false);
  const [recvIsManualMode, setRecvIsManualMode] = useState(false);
  const [recvSenderInfo, setRecvSenderInfo] = useState("");
  const [recvDocType, setRecvDocType] = useState("");
  const [recvSubject, setRecvSubject] = useState("");
  const [recvReceiptNo, setRecvReceiptNo] = useState("");
  const [recvReceiptDate, setRecvReceiptDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recvDispatchNo, setRecvDispatchNo] = useState("");
  const [recvDispatchDate, setRecvDispatchDate] = useState("");
  const [recvRefNo, setRecvRefNo] = useState("");
  const [recvPriority, setRecvPriority] = useState("normal");
  const [recvConfidential, setRecvConfidential] = useState(false);
  const [recvMarkToStaff, setRecvMarkToStaff] = useState("");
  const [recvMarkToStaffRemarks, setRecvMarkToStaffRemarks] = useState("");
  const [recvFileUrl, setRecvFileUrl] = useState("");
  const [recvFileType, setRecvFileType] = useState("image");
  const [recvIsUploading, setRecvIsUploading] = useState(false);

  // Detail view
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchDoc | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [isSenderFocused, setIsSenderFocused] = useState(false);

  // Forward dialog
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardResults, setForwardResults] = useState<any[]>([]);
  const [forwardSelected, setForwardSelected] = useState<any[]>([]);
  const [forwardRemarks, setForwardRemarks] = useState("");

  // Mark to Staff dialog
  const [showMarkStaff, setShowMarkStaff] = useState(false);
  const [markStaffName, setMarkStaffName] = useState("");
  const [markStaffRemarks, setMarkStaffRemarks] = useState("");

  // RIO dialog
  const [showRioDialog, setShowRioDialog] = useState(false);
  const [rioRemarks, setRioRemarks] = useState("");

  // Export Data Dialog
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportType, setExportType] = useState<"inbox" | "outbox">("inbox");
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recvFileInputRef = useRef<HTMLInputElement>(null);

  // ─── Data Queries ───────────────────────────────────────────────────
  const { data: inbox = [], isLoading: inboxLoading, refetch: refetchInbox } = useQuery<DispatchDoc[]>({
    queryKey: [`/api/dispatch/inbox/${department?.id}`],
    enabled: !!department?.id,
    refetchInterval: 30000,
  });

  const { data: outbox = [], isLoading: outboxLoading, refetch: refetchOutbox } = useQuery<DispatchDoc[]>({
    queryKey: [`/api/dispatch/outbox/${department?.id}`],
    enabled: !!department?.id,
  });

  const { data: dispatchGroups = [] } = useQuery<any[]>({
    queryKey: ["/api/dispatch-groups"],
    enabled: !!department?.id,
  });

  const { data: stats } = useQuery<{sent: number; received: number; unread: number}>({
    queryKey: [`/api/dispatch/stats/${department?.id}`],
    enabled: !!department?.id,
    refetchInterval: 30000,
  });

  const { data: departmentEmployees = [] } = useQuery<any[]>({
    queryKey: [`/api/departments/${department?.id}/employees`],
    enabled: !!department?.id,
  });

  const { refetch: fetchNextInwardNumber } = useQuery<{ nextNumber: string }>({
    queryKey: [`/api/dispatch/next-inward-number/${department?.id}`],
    queryFn: async () => {
      const res = await fetch(`/api/dispatch/next-inward-number/${department?.id}?name=${encodeURIComponent(department?.name || "")}`);
      if (!res.ok) throw new Error("Network response was not ok");
      return res.json();
    },
    enabled: false,
  });

  useEffect(() => {
    if (showReceiveEntry && department?.id) {
      fetchNextInwardNumber().then((res) => {
        if (res.data?.nextNumber) {
          setRecvReceiptNo(res.data.nextNumber);
        }
      });
    }
  }, [showReceiveEntry, department?.id, fetchNextInwardNumber]);

  const { data: dispatchDetail } = useQuery<any>({
    queryKey: [`/api/dispatch/${selectedDispatch?.id}`, department?.id],
    queryFn: async () => {
      const res = await fetch(`/api/dispatch/${selectedDispatch?.id}?departmentId=${department?.id}`);
      return res.json();
    },
    enabled: !!selectedDispatch?.id && showDetail,
  });

  // Fetch Next Dispatch (Outward) Number when creating new dispatch
  useEffect(() => {
    if (showNewDispatch && department?.id) {
      // Set current date
      setFormDispatchDate(format(new Date(), "yyyy-MM-dd"));
      // Fetch next outward number
      fetch(`/api/dispatch/next-outward-number/${department.id}?name=${encodeURIComponent(department.name)}`)
        .then(res => res.json())
        .then(data => {
          if (data.nextNumber) setFormDispatchNo(data.nextNumber);
        })
        .catch(console.error);
    }
  }, [showNewDispatch, department?.id]);

  // ─── Document Search ────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim() || !department?.id) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dispatch/search/${department.id}?q=${encodeURIComponent(searchQuery.trim())}&tab=${activeTab}`);
        const data = await res.json();
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, department?.id]);

  // ─── Department Search for Recipients ───────────────────────────────
  const { data: allDepartments = [] } = useQuery<any[]>({
    queryKey: ["/api/departments"],
  });

  const departmentOptions = allDepartments.map(d => ({
    value: d.id.toString(),
    label: d.name + (d.hodTitle ? ` (${d.hodTitle})` : "")
  }));

  // Forward search
  useEffect(() => {
    if (forwardSearch.length < 2) { setForwardResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dispatch/search-departments?q=${encodeURIComponent(forwardSearch)}`);
        const data = await res.json();
        setForwardResults(data);
      } catch { setForwardResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [forwardSearch]);

  // ─── File Upload + AI Extraction ────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExtractionFailed(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/dispatch/extract", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      setUploadedFileUrl(data.uploadedFileUrl || "");
      setUploadedFileType(data.uploadedFileType || "image");

      if (data.extractionFailed || !data.result) {
        // AI failed — show manual form
        setExtractionFailed(true);
        setIsAiAttempted(true);
        toast({
          title: "AI Extraction Failed",
          description: data.failureReason || "Please fill details manually.",
          variant: "destructive",
        });
      } else {
        // AI success — auto-fill form
        const r = data.result;
        if (r.document_type) setFormDocType(r.document_type);
        if (r.subject) setFormSubject(r.subject);
        if (r.dispatch_number) setFormDispatchNo(r.dispatch_number);
        if (r.dispatch_date) {
          // AI prompt asks it to convert to DD/MM/YYYY or keep original
          // HTML date input expects YYYY-MM-DD
          let formattedDate = r.dispatch_date;
          if (r.dispatch_date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [dd, mm, yyyy] = r.dispatch_date.split("/");
            formattedDate = `${yyyy}-${mm}-${dd}`;
          } else if (r.dispatch_date.match(/^\d{2}-\d{2}-\d{4}$/)) {
             const [dd, mm, yyyy] = r.dispatch_date.split("-");
             formattedDate = `${yyyy}-${mm}-${dd}`;
          }
          setFormDispatchDate(formattedDate);
        }
        if (r.reference_number) setFormRefNo(r.reference_number);
        toast({
          title: "✅ Document Extracted",
          description: `AI Confidence: ${data.result.confidence || "N/A"}. Please review and correct if needed.`,
        });
      }
    } catch (err: any) {
      setExtractionFailed(true);
      setUploadedFileUrl("");
      toast({
        title: "Upload Failed",
        description: err.message || "Could not process document",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
      setDispatchStep("form");
    }
  };

  // Upload only (no AI extraction)
  const handleUploadOnly = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/dispatch/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setUploadedFileUrl(data.uploadedFileUrl || "");
      setUploadedFileType(data.uploadedFileType || "image");
      setExtractionFailed(true); // Show manual form
      setIsAiAttempted(false); // Manual entry, no AI attempted
      setDispatchStep("form");
      toast({ title: "File Uploaded", description: "Please fill document details manually." });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRecvUploadOnly = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/dispatch/upload", { method: "POST", body: formData });
      const data = await response.json();
      setRecvFileUrl(data.uploadedFileUrl || "");
      setRecvFileType(data.uploadedFileType || "image");
      setRecvIsManualMode(true); // Indicate manual mode
      setRecvExtractionFailed(false); // Don't show failure message
      setRecvStep("form");
      toast({ title: "File Uploaded", description: "Please fill document details manually." });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
  };

  // Handle scanned document from ScannerModal
  const handleScanComplete = async (file: File) => {
    setShowScanner(false);

    if (scannerMode === "receive") {
      setRecvIsExtracting(true);
      setRecvExtractionFailed(false);
      setRecvIsManualMode(false);
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await fetch("/api/dispatch/extract", { method: "POST", body: formData });
        const data = await response.json();
        
        setRecvFileUrl(data.uploadedFileUrl || "");
        setRecvFileType(data.uploadedFileType || "image");

        if (data.extractionFailed || !data.result) {
          setRecvExtractionFailed(true);
          toast({ title: "AI Extraction Failed", description: data.failureReason || "Please fill details manually.", variant: "destructive" });
        } else {
          const r = data.result;
          if (r.document_type) setRecvDocType(r.document_type);
          if (r.subject) setRecvSubject(r.subject);
          if (r.dispatch_number) setRecvDispatchNo(r.dispatch_number);
          if (r.sender_department) setRecvSenderInfo(r.sender_department);
          if (r.dispatch_date) {
            let formattedDate = r.dispatch_date;
            if (r.dispatch_date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              const [dd, mm, yyyy] = r.dispatch_date.split("/");
              formattedDate = `${yyyy}-${mm}-${dd}`;
            } else if (r.dispatch_date.match(/^\d{2}-\d{2}-\d{4}$/)) {
               const [dd, mm, yyyy] = r.dispatch_date.split("-");
               formattedDate = `${yyyy}-${mm}-${dd}`;
            }
            setRecvDispatchDate(formattedDate);
          }
          if (r.reference_number) setRecvRefNo(r.reference_number);
          toast({ title: "✅ Scanned & Extracted", description: `AI Confidence: ${data.result.confidence || "N/A"}` });
        }
      } catch (err: any) {
        setRecvExtractionFailed(true);
        toast({ title: "Scan Process Failed", description: err.message, variant: "destructive" });
      } finally {
        setRecvIsExtracting(false);
        setRecvStep("form");
      }
      return;
    }

    // For dispatch — upload and extract with AI
    setIsExtracting(true);
    setExtractionFailed(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/dispatch/extract", { method: "POST", body: formData });
      const data = await response.json();

      setUploadedFileUrl(data.uploadedFileUrl || "");
      setUploadedFileType(data.uploadedFileType || "image");

      if (data.extractionFailed || !data.result) {
        setExtractionFailed(true);
        toast({
          title: "AI Extraction Failed",
          description: data.failureReason || "Please fill details manually.",
          variant: "destructive",
        });
      } else {
        const r = data.result;
        if (r.document_type) setFormDocType(r.document_type);
        if (r.subject) setFormSubject(r.subject);
        if (r.dispatch_number) setFormDispatchNo(r.dispatch_number);
        if (r.dispatch_date) {
          let formattedDate = r.dispatch_date;
          if (r.dispatch_date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [dd, mm, yyyy] = r.dispatch_date.split("/");
            formattedDate = `${yyyy}-${mm}-${dd}`;
          } else if (r.dispatch_date.match(/^\d{2}-\d{2}-\d{4}$/)) {
             const [dd, mm, yyyy] = r.dispatch_date.split("-");
             formattedDate = `${yyyy}-${mm}-${dd}`;
          }
          setFormDispatchDate(formattedDate);
        }
        if (r.reference_number) setFormRefNo(r.reference_number);
        toast({
          title: "✅ Scanned & Extracted",
          description: `AI Confidence: ${data.result.confidence || "N/A"}. Please review and correct if needed.`,
        });
      }
    } catch (err: any) {
      setExtractionFailed(true);
      setUploadedFileUrl("");
      toast({ title: "Scan Process Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
      setDispatchStep("form");
    }
  };

  // ─── Create Dispatch Mutation ───────────────────────────────────────
  const createDispatch = useMutation({
    mutationFn: async () => {
      if (!formDocType || !formSubject || !uploadedFileUrl || selectedRecipients.length === 0) {
        throw new Error("Please fill all required fields and select at least one recipient");
      }

      const formData = new FormData();
      formData.append("senderDepartmentId", department!.id.toString());
      formData.append("senderName", department!.name);
      formData.append("documentType", formDocType);
      formData.append("subject", formSubject);
      formData.append("fileUrl", uploadedFileUrl);
      formData.append("fileType", uploadedFileType);
      if (formDispatchNo) formData.append("dispatchNumber", formDispatchNo);
      if (formDispatchDate) formData.append("dispatchDate", formDispatchDate);
      if (formRefNo) formData.append("referenceNumber", formRefNo);
      formData.append("priority", formPriority);
      formData.append("isConfidential", formConfidential.toString());
      formData.append("sendEmail", formSendEmail.toString());
      formData.append("recipients", JSON.stringify(selectedRecipients));

      const res = await fetch("/api/dispatch", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Document Dispatched!",
        description: `Outward No: ${data.outwardNumber} — Sent to ${data.recipientCount} recipient(s)`,
      });
      resetNewDispatch();
      refetchOutbox();
      queryClient.invalidateQueries({ queryKey: [`/api/dispatch/stats/${department?.id}`] });
    },
    onError: (err: any) => {
      toast({ title: "Dispatch Failed", description: err.message, variant: "destructive" });
    },
  });

  // ─── Receive External Document Mutation ─────────────────────────────
  const receiveExternal = useMutation({
    mutationFn: async () => {
      if (!recvDocType || !recvSubject || !recvSenderInfo) {
        throw new Error("Please fill sender info, document type, and subject");
      }

      const formData = new FormData();
      formData.append("receivingDepartmentId", department!.id.toString());
      formData.append("receivingDepartmentName", department!.name);
      formData.append("documentType", recvDocType);
      formData.append("subject", recvSubject);
      formData.append("senderInfo", recvSenderInfo);
      if (recvFileUrl) formData.append("fileUrl", recvFileUrl);
      if (recvFileType) formData.append("fileType", recvFileType);
      if (recvDispatchNo) formData.append("dispatchNumber", recvDispatchNo);
      if (recvDispatchDate) formData.append("dispatchDate", recvDispatchDate);
      if (recvRefNo) formData.append("referenceNumber", recvRefNo);
      formData.append("priority", recvPriority);
      formData.append("isConfidential", recvConfidential.toString());
      if (recvMarkToStaff && recvMarkToStaff !== "none") formData.append("markedToStaff", recvMarkToStaff);
      if (recvMarkToStaffRemarks) formData.append("staffRemarks", recvMarkToStaffRemarks);

      const res = await fetch("/api/dispatch/receive-external", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Document Received",
        description: `Inward No: ${data.inwardNumber}`,
      });
      resetReceiveForm();
      refetchInbox();
      queryClient.invalidateQueries({ queryKey: [`/api/dispatch/stats/${department?.id}`] });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  // ─── Mark Received / Read ───────────────────────────────────────────
  const markReceived = useMutation({
    mutationFn: async (dispatchId: number) => {
      const res = await apiRequest("PATCH", `/api/dispatch/${dispatchId}/receive`, {
        departmentId: department!.id,
        departmentName: department!.name,
      });
      return res.json();
    },
    onSuccess: () => { 
      refetchInbox(); 
      if (selectedDispatch) {
        queryClient.invalidateQueries({ queryKey: [`/api/dispatch/${selectedDispatch.id}`, department?.id] });
      }
      toast({ title: "Marked as Received" }); 
    },
  });

  const markRead = useMutation({
    mutationFn: async (dispatchId: number) => {
      const res = await apiRequest("PATCH", `/api/dispatch/${dispatchId}/read`, {
        departmentId: department!.id,
        departmentName: department!.name,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchInbox();
      queryClient.invalidateQueries({ queryKey: [`/api/dispatch/inbox-count/${department?.id}`] });
    },
  });

  // Forward
  const forwardDispatch = useMutation({
    mutationFn: async () => {
      if (!selectedDispatch || forwardSelected.length === 0) throw new Error("Select recipients");
      const res = await apiRequest("POST", `/api/dispatch/${selectedDispatch.id}/forward`, {
        departmentId: department!.id,
        departmentName: department!.name,
        forwardTo: forwardSelected,
        remarks: forwardRemarks,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document Forwarded" });
      setShowForwardDialog(false);
      setForwardSelected([]);
      setForwardRemarks("");
      refetchInbox();
    },
  });

  // Mark to Staff
  const markToStaff = useMutation({
    mutationFn: async () => {
      if (!selectedDispatch || !markStaffName) throw new Error("Enter staff name");
      const res = await apiRequest("POST", `/api/dispatch/${selectedDispatch.id}/mark-staff`, {
        departmentId: department!.id,
        departmentName: department!.name,
        employeeName: markStaffName,
        remarks: markStaffRemarks,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Marked to Staff" });
      setShowMarkStaff(false);
      setMarkStaffName("");
      setMarkStaffRemarks("");
      refetchInbox();
    },
  });

  // Return In Original (RIO)
  const rioDispatch = useMutation({
    mutationFn: async () => {
      if (!selectedDispatch) throw new Error("No document selected");
      const res = await apiRequest("POST", `/api/dispatch/${selectedDispatch.id}/rio`, {
        departmentId: department!.id,
        departmentName: department!.name,
        remarks: rioRemarks,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document Returned (RIO)" });
      setShowRioDialog(false);
      setRioRemarks("");
      refetchInbox();
      setShowDetail(false);
    },
  });

  // Upload for receive entry
  const handleRecvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRecvIsExtracting(true);
    setRecvExtractionFailed(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/dispatch/extract", { method: "POST", body: formData });
      const data = await response.json();

      setRecvFileUrl(data.uploadedFileUrl || "");
      setRecvFileType(data.uploadedFileType || "image");

      if (data.extractionFailed || !data.result) {
        setRecvExtractionFailed(true);
        toast({
          title: "AI Extraction Failed",
          description: data.failureReason || "Please fill details manually.",
          variant: "destructive",
        });
      } else {
        const r = data.result;
        if (r.document_type) setRecvDocType(r.document_type);
        if (r.subject) setRecvSubject(r.subject);
        if (r.sender_department) setRecvSenderInfo(r.sender_department);
        if (r.dispatch_date) {
          let formattedDate = r.dispatch_date;
          if (r.dispatch_date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            const [dd, mm, yyyy] = r.dispatch_date.split("/");
            formattedDate = `${yyyy}-${mm}-${dd}`;
          } else if (r.dispatch_date.match(/^\d{2}-\d{2}-\d{4}$/)) {
             const [dd, mm, yyyy] = r.dispatch_date.split("-");
             formattedDate = `${yyyy}-${mm}-${dd}`;
          }
          // We can optionally use the AI extracted date as Receipt Date or keep it as today.
          // setRecvReceiptDate(formattedDate);
        }
        if (r.reference_number) setRecvRefNo(r.reference_number);
        toast({
          title: "✅ Document Extracted",
          description: `AI Confidence: ${data.result.confidence || "N/A"}. Please review and correct if needed.`,
        });
      }
    } catch (err: any) {
      setRecvExtractionFailed(true);
      setRecvFileUrl("");
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setRecvIsExtracting(false);
      setRecvStep("form");
    }
  };

  // ─── Export Logic ───────────────────────────────────────────────────
  const exportToExcel = () => {
    if (!exportFromDate || !exportToDate) {
      toast({ title: "Error", description: "Please select both From and To dates.", variant: "destructive" });
      return;
    }

    const fromDate = new Date(exportFromDate);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(exportToDate);
    toDate.setHours(23, 59, 59, 999);

    const sourceData = exportType === "inbox" ? inbox : outbox;
    
    const filteredData = sourceData.filter(item => {
      const itemDate = new Date(item.createdAt);
      return itemDate >= fromDate && itemDate <= toDate;
    });

    if (filteredData.length === 0) {
      toast({ title: "No Data", description: "No records found in the selected date range." });
      return;
    }

    let worksheetData;
    if (exportType === "inbox") {
      worksheetData = filteredData.map(item => ({
        "R.No.": item.inwardNumber || "-",
        "Date": format(new Date(item.createdAt), "dd MMM yyyy, HH:mm"),
        "Ref.No.": item.dispatchNumber || "-",
        "Ref. Date": item.dispatchDate || "-",
        "From": item.senderDepartmentId === 0 ? item.senderName : item.senderName,
        "Subject": item.subject,
        "Type": item.documentType,
        "Status": item.recipientStatus || "dispatched"
      }));
    } else {
      worksheetData = filteredData.map(item => ({
        "Outward No.": item.outwardNumber || "-",
        "Date": format(new Date(item.createdAt), "dd MMM yyyy, HH:mm"),
        "Ref.No.": item.dispatchNumber || "-",
        "To": item.recipients?.map((r: any) => r.name).join(", ") || "-",
        "Subject": item.subject,
        "Type": item.documentType
      }));
    }

    const ws = XLSX.utils.json_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, exportType === "inbox" ? "Received Documents" : "Dispatched Documents");
    XLSX.writeFile(wb, `amu_dak_${exportType}_${format(fromDate, "yyyyMMdd")}_to_${format(toDate, "yyyyMMdd")}.xlsx`);
    
    setShowExportDialog(false);
  };

  // ─── Reset Functions ────────────────────────────────────────────────
  const resetNewDispatch = () => {
    setShowNewDispatch(false);
    setDispatchStep("upload");
    setIsExtracting(false);
    setExtractionFailed(false);
    setIsAiAttempted(false);
    setUploadedFileUrl("");
    setFormDocType("");
    setFormSubject("");
    setFormDispatchNo("");
    setFormDispatchDate("");
    setFormRefNo("");
    setFormPriority("normal");
    setFormConfidential(false);
    setFormSendEmail(false);
    setSelectedRecipients([]);
    setDeptSearchQuery("");
  };

  const resetReceiveForm = () => {
    setShowReceiveEntry(false);
    setRecvStep("upload");
    setRecvIsExtracting(false);
    setRecvExtractionFailed(false);
    setRecvIsManualMode(false);
    setRecvSenderInfo("");
    setRecvDocType("");
    setRecvSubject("");
    setRecvReceiptNo("");
    setRecvReceiptDate(format(new Date(), "yyyy-MM-dd"));
    setRecvDispatchNo("");
    setRecvDispatchDate("");
    setRecvRefNo("");
    setRecvPriority("normal");
    setRecvConfidential(false);
    setRecvFileUrl("");
    setRecvMarkToStaff("");
    setRecvMarkToStaffRemarks("");
  };

  const addRecipient = (type: string, id: number, name: string) => {
    if (!selectedRecipients.find(r => r.type === type && r.id === id)) {
      setSelectedRecipients(prev => [...prev, { type, id, name }]);
    }
    setDeptSearchQuery("");
    setDeptSearchResults([]);
  };

  const removeRecipient = (type: string, id: number) => {
    setSelectedRecipients(prev => prev.filter(r => !(r.type === type && r.id === id)));
  };

  // ─── Open Detail View ───────────────────────────────────────────────
  const openDetail = async (dispatch: DispatchDoc) => {
    setSelectedDispatch(dispatch);
    setShowDetail(true);
    // Auto mark as read if inbox item and status is dispatched or received
    if (activeTab === "inbox" && (dispatch.recipientStatus === "dispatched" || dispatch.recipientStatus === "received")) {
      markRead.mutate(dispatch.id);
    }
  };

  // ─── Status Badge ──────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      dispatched: "bg-blue-100 text-blue-700",
      received: "bg-yellow-100 text-yellow-700",
      read: "bg-green-100 text-green-700",
      forwarded: "bg-purple-100 text-purple-700",
      marked: "bg-indigo-100 text-indigo-700",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-700"}`}>
        {status}
      </span>
    );
  };

  const PriorityBadge = ({ priority }: { priority: string }) => {
    if (priority === "normal") return null;
    const colors: Record<string, string> = {
      urgent: "bg-orange-100 text-orange-700 border-orange-300",
      immediate: "bg-red-100 text-red-700 border-red-300",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${colors[priority] || ""}`}>
        {priority.toUpperCase()}
      </span>
    );
  };

  if (!department) return null;

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen">
      <Sidebar className="hidden lg:flex lg:w-64 lg:flex-col border-r" />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Send className="h-6 w-6 text-blue-600" />
                Dak Receive / Dispatch
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Send, receive, scan and track official documents
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowReceiveEntry(true)}
                className="flex items-center gap-2"
              >
                <Archive className="h-4 w-4" />
                Receive Entry
              </Button>
              <Button
                onClick={() => { resetNewDispatch(); setShowNewDispatch(true); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Dispatch
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-700">{stats?.sent || 0}</div>
                <div className="text-xs text-blue-600">Dispatched</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-700">{stats?.received || 0}</div>
                <div className="text-xs text-green-600">Received</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-orange-700">{stats?.unread || 0}</div>
                <div className="text-xs text-orange-600">Unread</div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs: Inbox / Outbox */}
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearchQuery(""); setSearchResults(null); }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <TabsList>
                  <TabsTrigger value="inbox" className="flex items-center gap-2">
                    <Inbox className="h-4 w-4" />
                    Inbox {(stats?.unread || 0) > 0 && (
                      <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{stats?.unread}</span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="outbox" className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Outbox
                  </TabsTrigger>
                </TabsList>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="bg-white"
                  onClick={() => { refetchInbox(); refetchOutbox(); queryClient.invalidateQueries({ queryKey: [`/api/dispatch/stats/${department?.id}`]}); }} 
                  title="Refresh Data"
                >
                  <RefreshCw className="h-4 w-4 text-gray-600" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  className="text-green-700 border-green-200 bg-green-50 hover:bg-green-100 whitespace-nowrap" 
                  onClick={() => { setExportType(activeTab as "inbox" | "outbox"); setShowExportDialog(true); }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export to Excel
                </Button>
                <div className="relative w-72 sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9 pr-9"
                  placeholder="Search by R.No., D.No., Subject, Department..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => { setSearchQuery(""); setSearchResults(null); }}>
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
                {isSearching && (
                  <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
                )}
              </div>
              </div>
            </div>

            {/* ─── INBOX ──────────────────────────────────────────── */}
            <TabsContent value="inbox">
              {inboxLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : (searchResults !== null ? searchResults : inbox).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Inbox className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">{searchResults !== null ? "No documents found" : "No documents received"}</p>
                    <p className="text-sm">{searchResults !== null ? "Try different search terms" : "Documents dispatched to your department will appear here"}</p>
                  </CardContent>
                </Card>
              ) : (
                <div>
                  {searchResults !== null && (
                    <div className="text-xs text-gray-500 mb-2 px-1">Found {searchResults.length} result(s) for "{searchQuery}"</div>
                  )}
                  <div className="bg-white rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-left">
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-24">R.No.</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-28">Date</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-20">Ref.No.</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-24">Ref. Date</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 w-32">From</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600">Subject</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-20">Type</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-20">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(searchResults !== null ? searchResults : inbox).map((item) => (
                          <tr
                            key={`inbox-${item.id}-${item.recipientId}`}
                            className={`border-b last:border-b-0 cursor-pointer hover:bg-blue-50/50 transition-colors ${
                              item.recipientStatus === "dispatched" ? "bg-blue-50/30 font-medium" : ""
                            }`}
                            onClick={() => openDetail(item)}
                          >
                            <td className="px-3 py-2.5">
                              {item.inwardNumber ? (
                                <span className="font-mono text-green-700 font-semibold">{item.inwardNumber}</span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                              {format(new Date(item.createdAt), "dd MMM yyyy")}
                              <div className="text-[10px] text-gray-400">{format(new Date(item.createdAt), "HH:mm")}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              {item.dispatchNumber ? (
                                <span className="font-mono text-blue-700 text-xs">{item.dispatchNumber}</span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {item.dispatchDate ? (
                                <span>{item.dispatchDate}</span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {item.isConfidential && <Lock className="h-3 w-3 text-red-500 flex-shrink-0" />}
                                <span className="truncate max-w-[120px] inline-block" title={item.senderName}>
                                  {item.senderDepartmentId === 0 ? `📥 ${item.senderName}` : item.senderName}
                                </span>
                                {item.isPhysicalReceive && (
                                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded flex-shrink-0">Physical</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="truncate max-w-[400px]" title={item.subject}>
                                {item.subject}
                              </div>
                              {item.referenceNumber && (
                                <div className="text-[10px] text-gray-400 mt-0.5">Ref: {item.referenceNumber}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">
                              {item.documentType}
                              <PriorityBadge priority={item.priority} />
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusBadge status={item.recipientStatus || "dispatched"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ─── OUTBOX ─────────────────────────────────────────── */}
            <TabsContent value="outbox">
              {outboxLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : (searchResults !== null ? searchResults : outbox).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-gray-500">
                    <Send className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">{searchResults !== null ? "No documents found" : "No documents dispatched"}</p>
                    <p className="text-sm">{searchResults !== null ? "Try different search terms" : "Click \"New Dispatch\" to send your first document"}</p>
                  </CardContent>
                </Card>
              ) : (
                <div>
                  {searchResults !== null && (
                    <div className="text-xs text-gray-500 mb-2 px-1">Found {searchResults.length} result(s) for "{searchQuery}"</div>
                  )}
                  <div className="bg-white rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-left">
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-24">D.No.</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-32">Date</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600">To</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600">Subject</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-20">Type</th>
                          <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap w-24">Read</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(searchResults !== null ? searchResults : outbox).map((item) => (
                          <tr
                            key={`outbox-${item.id}`}
                            className="border-b last:border-b-0 cursor-pointer hover:bg-blue-50/50 transition-colors"
                            onClick={() => openDetail(item)}
                          >
                            <td className="px-3 py-2.5">
                              {item.outwardNumber ? (
                                <span className="font-mono text-purple-700 font-semibold">{item.outwardNumber}</span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                              {item.dispatchNumber && (
                                <div className="text-[10px] text-blue-600 font-mono mt-0.5">D: {item.dispatchNumber}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                              {format(new Date(item.createdAt), "dd MMM yyyy")}
                              <div className="text-[10px] text-gray-400">{format(new Date(item.createdAt), "HH:mm")}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              {item.recipients && item.recipients.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {item.recipients.slice(0, 2).map((r: any, i: number) => (
                                    <span key={i} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded truncate max-w-[120px]" title={r.name}>
                                      {r.name}
                                    </span>
                                  ))}
                                  {(item.recipientCount || 0) > 2 && (
                                    <span className="text-xs text-gray-400">+{(item.recipientCount || 0) - 2}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {item.isConfidential && <Lock className="h-3 w-3 text-red-500 flex-shrink-0" />}
                                <span className="truncate max-w-[400px]" title={item.subject}>{item.subject}</span>
                              </div>
                              {item.referenceNumber && (
                                <div className="text-[10px] text-gray-400 mt-0.5">Ref: {item.referenceNumber}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">
                              {item.documentType}
                              <PriorityBadge priority={item.priority} />
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-500 text-center">
                              <span className={`font-medium ${(item.readCount || 0) === (item.recipientCount || 0) ? "text-green-600" : "text-orange-600"}`}>
                                {item.readCount || 0}/{item.recipientCount || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* NEW DISPATCH DIALOG                                          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Dialog open={showNewDispatch} onOpenChange={(v) => { if (!v) resetNewDispatch(); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-blue-600" />
                New Dispatch
                {dispatchStep !== "upload" && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (dispatchStep === "recipients") setDispatchStep("form");
                    else setDispatchStep("upload");
                  }}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>

            {/* Step 1: Upload */}
            {dispatchStep === "upload" && (
              <div className="space-y-6 py-4">
                <div className="flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
                  {/* Auto Dispatch (Scanner or Upload via ScannerModal) */}
                  <Card className="w-full border-2 border-dashed border-indigo-300 hover:border-indigo-500 transition-colors cursor-pointer"
                    onClick={() => { setScannerMode("dispatch"); setShowScanner(true); }}>
                    <CardContent className="py-10 text-center">
                      <Scan className="h-16 w-16 mx-auto mb-4 text-indigo-500" />
                      <p className="font-semibold text-xl text-indigo-700">Auto Dispatch</p>
                      <p className="text-sm text-gray-500 mt-2">Use connected scanner or upload file</p>
                      <p className="text-xs text-gray-400 mt-1">AI will automatically extract document details</p>
                    </CardContent>
                  </Card>

                  <div className="flex items-center gap-2 w-full">
                    <div className="h-px bg-gray-200 flex-1"></div>
                    <span className="text-xs text-gray-400 uppercase font-medium">OR</span>
                    <div className="h-px bg-gray-200 flex-1"></div>
                  </div>

                  {/* Upload Only (Manual) - Smaller Button */}
                  <Button 
                    variant="outline" 
                    className="w-full border-gray-300 text-gray-700"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*,.pdf";
                      input.onchange = (e: any) => handleUploadOnly(e);
                      input.click();
                    }}
                  >
                    <Upload className="h-4 w-4 mr-2 text-gray-500" />
                    Upload (Manual Dispatch)
                  </Button>
                </div>

                {isExtracting && (
                  <div className="flex items-center justify-center py-6 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="text-gray-600">Extracting document details with AI...</span>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Form (Auto-filled or Manual) */}
            {dispatchStep === "form" && (
              <div className="space-y-4 py-2">
                <div className="flex gap-4">
                  {/* Document Preview */}
                  {uploadedFileUrl && (
                    <div className="w-1/3 flex-shrink-0">
                      <div className="border rounded-lg overflow-hidden bg-gray-100">
                        {uploadedFileType === "pdf" ? (
                          <iframe src={uploadedFileUrl} className="w-full h-80 border-0" title="PDF Document" />
                        ) : (
                          <img src={uploadedFileUrl} alt="Document" className="w-full object-contain max-h-80" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Form Fields */}
                  <div className="flex-1 space-y-3">
                    {extractionFailed && isAiAttempted && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">AI extraction failed</p>
                          <p className="text-xs text-amber-600">Please fill document details manually below.</p>
                        </div>
                      </div>
                    )}

                    {!extractionFailed && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-800">AI extracted details below</p>
                          <p className="text-xs text-green-600">Please review and correct if needed.</p>
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Document Type *</Label>
                      <Select value={formDocType} onValueChange={setFormDocType}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Subject *</Label>
                      <Input value={formSubject} onChange={e => setFormSubject(e.target.value)} placeholder="Document subject" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Dispatch Number</Label>
                        <Input value={formDispatchNo} onChange={e => setFormDispatchNo(e.target.value)} placeholder="e.g., 139/SS" />
                      </div>
                      <div>
                        <Label className="text-xs">Dispatch Date</Label>
                        <Input type="date" value={formDispatchDate} onChange={e => setFormDispatchDate(e.target.value)} />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Reference Number</Label>
                      <Input value={formRefNo} onChange={e => setFormRefNo(e.target.value)} placeholder="Optional reference" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Priority</Label>
                        <Select value={formPriority} onValueChange={setFormPriority}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="immediate">Immediate</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 mt-5">
                        <Switch checked={formConfidential} onCheckedChange={setFormConfidential} />
                        <Label className="text-xs flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Confidential
                        </Label>
                      </div>
                    </div>

                    <Button className="w-full mt-4" onClick={() => setDispatchStep("recipients")}
                      disabled={!formDocType || !formSubject}>
                      Next: Select Recipients →
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Select Recipients */}
            {dispatchStep === "recipients" && (
              <div className="space-y-4 py-2">
                {/* Search Departments */}
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Search Departments</Label>
                  <SearchableSelect
                    options={departmentOptions}
                    value="" // Always empty so we can select multiple
                    onValueChange={(val) => {
                      const dept = allDepartments.find(d => d.id.toString() === val);
                      if (dept) {
                        addRecipient("department", dept.id, dept.name);
                      }
                    }}
                    placeholder="Search and select department..."
                    searchPlaceholder="Search department name..."
                    emptyMessage="No department found."
                  />
                </div>

                {/* Groups */}
                <div>
                  <Button variant="outline" size="sm" onClick={() => setShowGroupSelector(!showGroupSelector)}
                    className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Select from Groups
                    {showGroupSelector ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                  {showGroupSelector && (
                    <div className="border rounded-lg mt-2 max-h-48 overflow-y-auto bg-white p-2 space-y-1">
                      {dispatchGroups.map((g: any) => (
                        <div key={g.id}
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-sm rounded"
                          onClick={() => addRecipient("group", g.id, g.name)}>
                          <div>
                            <span className="font-medium">{g.name}</span>
                            <span className="text-xs text-gray-400 ml-2">({g.memberCount} departments)</span>
                          </div>
                          <Plus className="h-4 w-4 text-blue-500" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Recipients */}
                <div>
                  <Label className="text-xs font-medium">
                    Selected Recipients ({selectedRecipients.length})
                  </Label>
                  {selectedRecipients.length === 0 ? (
                    <p className="text-sm text-gray-400 mt-1">No recipients selected</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedRecipients.map((r, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          r.type === "group" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {r.type === "group" ? <Users className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                          {r.name}
                          <button onClick={() => removeRecipient(r.type, r.id)}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Send Email Toggle */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Switch checked={formSendEmail} onCheckedChange={setFormSendEmail} />
                  <Label className="text-sm flex items-center gap-1">
                    <MailCheck className="h-4 w-4" /> Send email notification to recipients
                  </Label>
                </div>

                {/* Dispatch Button */}
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 py-5 text-base"
                  disabled={selectedRecipients.length === 0 || createDispatch.isPending}
                  onClick={() => createDispatch.mutate()}
                >
                  {createDispatch.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Dispatching...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Dispatch Document ({selectedRecipients.length} recipients)</>
                  )}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* RECEIVE ENTRY DIALOG (Physical / External)                    */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Dialog open={showReceiveEntry} onOpenChange={(v) => { if (!v) resetReceiveForm(); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5 text-amber-600" />
                Receive Document Entry
                {recvStep !== "upload" && (
                  <Button variant="ghost" size="sm" onClick={() => setRecvStep("upload")}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>

            {/* Step 1: Upload */}
            {recvStep === "upload" && (
              <div className="space-y-6 py-4">
                <p className="text-sm text-gray-500 text-center max-w-md mx-auto">
                  Record a document physically received from external sender, internal staff, or other source.
                </p>
                <div className="flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
                  {/* Auto Receive */}
                  <Card className="w-full border-2 border-dashed border-amber-300 hover:border-amber-500 transition-colors cursor-pointer"
                    onClick={() => { setScannerMode("receive"); setShowScanner(true); }}>
                    <CardContent className="py-10 text-center">
                      <Scan className="h-16 w-16 mx-auto mb-4 text-amber-500" />
                      <p className="font-semibold text-xl text-amber-700">Auto Receive</p>
                      <p className="text-sm text-gray-500 mt-2">Use connected scanner or upload file</p>
                      <p className="text-xs text-gray-400 mt-1">AI will automatically extract details</p>
                    </CardContent>
                  </Card>

                  <div className="flex items-center gap-2 w-full">
                    <div className="h-px bg-gray-200 flex-1"></div>
                    <span className="text-xs text-gray-400 uppercase font-medium">OR</span>
                    <div className="h-px bg-gray-200 flex-1"></div>
                  </div>

                  {/* Manual Receive */}
                  <Button 
                    variant="outline" 
                    className="w-full border-gray-300 text-gray-700"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*,.pdf";
                      input.onchange = (e: any) => handleRecvUploadOnly(e);
                      input.click();
                    }}
                  >
                    <Upload className="h-4 w-4 mr-2 text-gray-500" />
                    Upload (Manual Receive)
                  </Button>
                </div>

                {recvIsExtracting && (
                  <div className="flex items-center justify-center py-6 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                    <span className="text-gray-600">Extracting document details with AI...</span>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Form */}
            {recvStep === "form" && (
              <div className="space-y-4 py-2">
                <div className="flex gap-4">
                  {/* Document Preview */}
                  {recvFileUrl && (
                    <div className="w-1/3 flex-shrink-0">
                      <div className="bg-gray-100 rounded-lg p-2 border">
                        {recvFileType === "pdf" ? (
                          <iframe src={recvFileUrl} className="w-full h-80 border-0 rounded bg-white" title="PDF Preview" />
                        ) : (
                          <img src={recvFileUrl} alt="Document" className="w-full object-contain max-h-80" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Form Fields */}
                  <div className="flex-1 space-y-3">
                    {recvExtractionFailed && !recvIsManualMode && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-800">AI extraction failed</p>
                          <p className="text-xs text-amber-600">Please fill document details manually below.</p>
                        </div>
                      </div>
                    )}
                    
                    {recvIsManualMode && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                        <Upload className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-blue-800">Manual Entry Mode</p>
                          <p className="text-xs text-blue-600">Please fill the document details manually below.</p>
                        </div>
                      </div>
                    )}

                    {!recvExtractionFailed && !recvIsManualMode && recvFileUrl && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-800">AI extracted details below</p>
                          <p className="text-xs text-green-600">Please review and correct if needed.</p>
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Sender / Source *</Label>
                      <div className="relative">
                        <Input 
                          value={recvSenderInfo} 
                          onChange={e => setRecvSenderInfo(e.target.value)}
                          onFocus={() => setIsSenderFocused(true)}
                          onBlur={() => {
                            // slight delay to allow click on dropdown to process
                            setTimeout(() => setIsSenderFocused(false), 200);
                          }}
                          placeholder="Type to search departments or enter name..." 
                        />
                        {isSenderFocused && allDepartments.length > 0 && !allDepartments.some((d: any) => d.name === recvSenderInfo) && (
                          (() => {
                            const filtered = recvSenderInfo.trim()
                              ? allDepartments.filter((d: any) => d.name.toLowerCase().includes(recvSenderInfo.toLowerCase()))
                              : allDepartments;
                            return filtered.length > 0 ? (
                              <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {filtered.map((d: any) => (
                                  <button
                                    key={d.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b last:border-b-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setRecvSenderInfo(d.name);
                                      setIsSenderFocused(false);
                                    }}
                                  >
                                    {d.name}
                                  </button>
                                ))}
                              </div>
                            ) : null;
                          })()
                        )}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Sender's Reference No. (Optional)</Label>
                      <Input value={recvRefNo} onChange={e => setRecvRefNo(e.target.value)} />
                    </div>

                    <div>
                      <Label className="text-xs">Document Type *</Label>
                      <Select value={recvDocType} onValueChange={setRecvDocType}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Subject *</Label>
                      <Input value={recvSubject} onChange={e => setRecvSubject(e.target.value)} placeholder="Document subject" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Receipt Number (R.No.)</Label>
                        <Input value={recvReceiptNo} onChange={e => setRecvReceiptNo(e.target.value)} placeholder="Auto-generated" />
                      </div>
                      <div>
                        <Label className="text-xs">Receipt Date</Label>
                        <Input type="date" value={recvReceiptDate} onChange={e => setRecvReceiptDate(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Mark to Staff (Optional)</Label>
                        <Select value={recvMarkToStaff} onValueChange={setRecvMarkToStaff}>
                          <SelectTrigger className={!recvMarkToStaff ? "text-gray-500" : ""}>
                            <SelectValue placeholder="Select staff..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {departmentEmployees.map((emp: any) => (
                              <SelectItem key={emp.id} value={emp.name}>{emp.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Staff Remarks (Optional)</Label>
                        <Input value={recvMarkToStaffRemarks} onChange={e => setRecvMarkToStaffRemarks(e.target.value)} placeholder="e.g. Please process this" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Priority</Label>
                        <Select value={recvPriority} onValueChange={setRecvPriority}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="immediate">Immediate</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3 mt-5">
                        <Switch checked={recvConfidential} onCheckedChange={setRecvConfidential} />
                        <Label className="text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Confidential</Label>
                      </div>
                    </div>

                    <Button
                      className="w-full bg-amber-600 hover:bg-amber-700 py-5 text-base mt-4"
                      disabled={!recvSenderInfo || !recvDocType || !recvSubject || receiveExternal.isPending}
                      onClick={() => receiveExternal.mutate()}
                    >
                      {receiveExternal.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Recording...</>
                      ) : (
                        <><Archive className="h-4 w-4 mr-2" /> Record Received Document</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* DISPATCH DETAIL DIALOG                                        */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Dialog open={showDetail} onOpenChange={setShowDetail}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {activeTab === "inbox" ? "Receipt Detail" : "Dispatch Detail"}
                {selectedDispatch?.isConfidential && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Confidential
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {dispatchDetail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Document View */}
                  <div>
                    {!dispatchDetail.canViewContent ? (
                      <div className="border rounded-lg p-6 text-center bg-red-50">
                        <Lock className="h-12 w-12 mx-auto text-red-400 mb-2" />
                        <p className="text-red-600">Access Restricted</p>
                      </div>
                    ) : dispatchDetail.fileUrl ? (
                      <div className="border rounded-lg overflow-hidden bg-gray-100">
                        {dispatchDetail.fileType === "pdf" ? (
                          <iframe src={dispatchDetail.fileUrl} className="w-full h-96 border-0" title="PDF Document" />
                        ) : (
                          <img src={dispatchDetail.fileUrl} alt="Document" className="w-full object-contain max-h-96" />
                        )}
                      </div>
                    ) : (
                      <div className="border rounded-lg p-6 text-center bg-gray-50 h-full flex flex-col justify-center min-h-[200px]">
                        <FileText className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500">No digital document attached</p>
                        <p className="text-xs text-gray-400 mt-1">This is a physical document record.</p>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="space-y-3">
                    {/* Prominent R.No., D.No., Outward No. badges */}
                    <div className="flex flex-wrap gap-2">
                      {dispatchDetail.inwardNumber && (
                        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
                          <div className="text-[10px] text-green-600 font-medium uppercase">R.No. (Receipt)</div>
                          <div className="text-sm font-bold text-green-800 font-mono">{dispatchDetail.inwardNumber}</div>
                        </div>
                      )}
                      {dispatchDetail.dispatchNumber && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center">
                          <div className="text-[10px] text-blue-600 font-medium uppercase">Ref.No.</div>
                          <div className="text-sm font-bold text-blue-800 font-mono">{dispatchDetail.dispatchNumber}</div>
                        </div>
                      )}
                      {dispatchDetail.outwardNumber && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-center">
                          <div className="text-[10px] text-purple-600 font-medium uppercase">Outward No.</div>
                          <div className="text-sm font-bold text-purple-800 font-mono">{dispatchDetail.outwardNumber}</div>
                        </div>
                      )}
                      {dispatchDetail.referenceNumber && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-center">
                          <div className="text-[10px] text-gray-600 font-medium uppercase">Ref No.</div>
                          <div className="text-sm font-bold text-gray-800 font-mono">{dispatchDetail.referenceNumber}</div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Type:</span> <strong>{dispatchDetail.documentType}</strong></div>
                      <div><span className="text-gray-500">Priority:</span> <PriorityBadge priority={dispatchDetail.priority} /></div>
                      <div><span className="text-gray-500">From:</span> <strong>{dispatchDetail.senderName}</strong></div>
                      <div><span className="text-gray-500">Subject:</span> <strong>{dispatchDetail.subject}</strong></div>
                      {dispatchDetail.dispatchDate && <div><span className="text-gray-500">Document Date:</span> {dispatchDetail.dispatchDate}</div>}
                      <div><span className="text-gray-500">Entry Date:</span> {format(new Date(dispatchDetail.createdAt), "dd MMM yyyy, HH:mm")}</div>
                    </div>

                    {/* Recipients */}
                    {dispatchDetail.recipients && dispatchDetail.recipients.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Recipients:</p>
                        <div className="space-y-1">
                          {dispatchDetail.recipients.map((r: any) => (
                            <div key={r.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                              <span>{r.name}</span>
                              <StatusBadge status={r.status} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions for inbox items */}
                    {activeTab === "inbox" && selectedDispatch && (
                      <div className="flex gap-2 pt-2">
                        {!dispatchDetail.inwardNumber && (
                          <Button size="sm" variant="outline" onClick={() => markReceived.mutate(selectedDispatch.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Received
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setShowForwardDialog(true)} disabled={!dispatchDetail.inwardNumber}>
                          <Forward className="h-4 w-4 mr-1" /> Forward
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowMarkStaff(true)} disabled={!dispatchDetail.inwardNumber}>
                          <UserCheck className="h-4 w-4 mr-1" /> Mark to Staff
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowRioDialog(true)} disabled={!dispatchDetail.inwardNumber}>
                          <Undo2 className="h-4 w-4 mr-1" /> Return (RIO)
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tracking Timeline */}
                {dispatchDetail.tracking && dispatchDetail.tracking.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                      <Clock className="h-4 w-4" /> Tracking Timeline
                    </p>
                    <div className="border-l-2 border-blue-200 pl-4 space-y-3">
                      {dispatchDetail.tracking.map((t: TrackingEntry) => (
                        <div key={t.id} className="relative">
                          <div className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                          <div className="text-sm">
                            <span className="font-medium">{t.actionByName}</span>
                            <span className="text-gray-500 ml-2 text-xs">
                              {format(new Date(t.createdAt), "dd MMM yyyy, HH:mm")}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">{t.details}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ─── Forward Dialog ──────────────────────────────────────────── */}
        <Dialog open={showForwardDialog} onOpenChange={setShowForwardDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Forward className="h-5 w-5" /> Forward Document
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Search department..."
                  value={forwardSearch} onChange={e => setForwardSearch(e.target.value)} />
              </div>
              {forwardResults.length > 0 && (
                <div className="border rounded max-h-32 overflow-y-auto">
                  {forwardResults.map(d => (
                    <div key={d.id} className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-sm"
                      onClick={() => {
                        if (!forwardSelected.find((f: any) => f.id === d.id)) {
                          setForwardSelected(prev => [...prev, { type: "department", id: d.id, name: d.name }]);
                        }
                        setForwardSearch("");
                      }}>
                      {d.name}
                    </div>
                  ))}
                </div>
              )}
              {forwardSelected.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {forwardSelected.map((f: any) => (
                    <span key={f.id} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                      {f.name}
                      <button onClick={() => setForwardSelected(prev => prev.filter((p: any) => p.id !== f.id))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Textarea placeholder="Remarks (optional)" value={forwardRemarks}
                onChange={e => setForwardRemarks(e.target.value)} rows={2} />
              <Button className="w-full" disabled={forwardSelected.length === 0 || forwardDispatch.isPending}
                onClick={() => forwardDispatch.mutate()}>
                {forwardDispatch.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Forward className="h-4 w-4 mr-2" />}
                Forward
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Mark to Staff Dialog ────────────────────────────────────── */}
        <Dialog open={showMarkStaff} onOpenChange={setShowMarkStaff}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" /> Mark to Staff
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Staff Member Name *</Label>
                <Select value={markStaffName} onValueChange={setMarkStaffName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentEmployees.map((emp: any) => (
                      <SelectItem key={emp.id} value={emp.name}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Remarks</Label>
                <Textarea value={markStaffRemarks} onChange={e => setMarkStaffRemarks(e.target.value)}
                  rows={2} placeholder="Optional remarks" />
              </div>
              <Button className="w-full" disabled={!markStaffName || markToStaff.isPending}
                onClick={() => markToStaff.mutate()}>
                {markToStaff.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                Mark
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Return In Original (RIO) Dialog ─────────────────────────── */}
        <Dialog open={showRioDialog} onOpenChange={setShowRioDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Undo2 className="h-5 w-5 text-destructive" /> Return (RIO)
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Are you sure you want to return this document to the sender department?
              </p>
              <div>
                <Label className="text-xs">Remarks / Reason (Required)</Label>
                <Textarea 
                  value={rioRemarks} 
                  onChange={e => setRioRemarks(e.target.value)}
                  rows={3} 
                  placeholder="Enter reason for returning" 
                />
              </div>
              <Button 
                className="w-full bg-destructive hover:bg-destructive/90 text-white" 
                disabled={!rioRemarks || rioDispatch.isPending}
                onClick={() => rioDispatch.mutate()}
              >
                {rioDispatch.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Undo2 className="h-4 w-4 mr-2" />}
                Confirm Return
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Export Dialog ───────────────────────────────────────────── */}
        <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-green-600" /> Export to Excel
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-xs">Export Data Type</Label>
                <Select value={exportType} onValueChange={(v: "inbox"|"outbox") => setExportType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbox">Received Documents (Inbox)</SelectItem>
                    <SelectItem value="outbox">Dispatched Documents (Outbox)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From Date *</Label>
                <Input type="date" value={exportFromDate} onChange={e => setExportFromDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To Date *</Label>
                <Input type="date" value={exportToDate} onChange={e => setExportToDate(e.target.value)} />
              </div>
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={exportToExcel} disabled={!exportFromDate || !exportToDate}>
                <Download className="h-4 w-4 mr-2" />
                Download Excel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Scanner Modal — used by both dispatch and receive */}
        <ScannerModal
          open={showScanner}
          onOpenChange={setShowScanner}
          onScanComplete={handleScanComplete}
        />
      </main>
    </div>
  );
}
