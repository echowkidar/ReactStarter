import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getCurrentDepartment } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import Loading from "@/components/layout/loading";
import AttendanceForm from "@/components/forms/attendance-form";
import { Plus, Eye, Upload, Trash2, Loader2, FileCheck, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import React from "react";

// Types
interface AttendanceReport {
  id: number;
  departmentId: number;
  month: number;
  year: number;
  status: 'draft' | 'submitted' | 'sent' | 'cancel_requested' | 'cancelled' | 'recall_requested';
  transactionId?: string;
  fileUrl?: string;
  despatchNo?: string;
  despatchDate?: string;
  receiptNo?: number;
  receiptDate?: string;
  cancelRequestedAt?: string;
  cancelledAt?: string;
}


interface DespatchDetails {
  despatchNo: string;
  despatchDate: string;
}

interface AttendanceEntry {
  id: number;
  reportId: number;
  employeeId: number;
  periods: {
    fromDate: string;
    toDate: string;
    days: number;
    remarks: string;
  }[];
}

// Add a new component for PDF dialog content
const PDFDialogContent = ({
  report,
  department,
  handleUpload,
  formatDate,
  toast
}: {
  report: AttendanceReport;
  department: any;
  handleUpload: (file: File, reportId: number, despatchDetails?: DespatchDetails) => Promise<any>;
  formatDate: (date: string | Date) => string;
  toast: any;
}) => {
  const [refreshedReport, setRefreshedReport] = React.useState<AttendanceReport>(report);

  // State for file handling
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [processedFile, setProcessedFile] = React.useState<File | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Manual entry confirmation checkbox
  const [manualConfirmed, setManualConfirmed] = React.useState(false);

  // ── Unified quality check state ───────────────────────────────
  // The OCR API is the authoritative quality gatekeeper.
  // Local canvas/pdfjs checks are a lightweight pre-filter only.
  //
  // 'idle'      → no file selected
  // 'checking'  → pre-filter passed; OCR API call in progress (form awaits)
  // 'passed'    → API confirmed quality_acceptable = true
  // 'failed'    → API confirmed quality_acceptable = false (see qualityIssuesEn/Hi)
  // 'fallback'  → API unavailable/503/timeout; local pre-filter passed → user may proceed
  const [qualityStatus, setQualityStatus] = React.useState<
    'idle' | 'checking' | 'passed' | 'failed' | 'fallback'
  >('idle');
  const [qualityStep, setQualityStep] = React.useState<string>('');
  // For local pre-filter rejections (shown via toast, qualityStatus stays 'idle')
  const [qualityError, setQualityError] = React.useState<string>('');
  // Bilingual issues returned by the API when quality_acceptable = false
  const [qualityIssuesEn, setQualityIssuesEn] = React.useState<string[]>([]);
  const [qualityIssuesHi, setQualityIssuesHi] = React.useState<string[]>([]);
  // ─────────────────────────────────────────────────────────────

  // When the API fills the Transaction ID, Tesseract must not override it.
  // This ref is reset on every new file selection.
  const txIdSetByApiRef = React.useRef(false);

  // Transaction ID verification state
  // 'idle'           → no file selected yet
  // 'extracting'     → scanning file for Transaction ID
  // 'verified'       → ID extracted AND matches system record → input locked ✅
  // 'mismatch'       → ID extracted but doesn't match → old/wrong copy warning
  // 'manual'         → extraction failed / user is typing manually
  // 'manual_verified'→ user typed correct ID manually → input locked ✅
  const [txIdStatus, setTxIdStatus] = React.useState<
    'idle' | 'extracting' | 'verified' | 'mismatch' | 'manual' | 'manual_verified'
  >('idle');
  const [txIdLocked, setTxIdLocked] = React.useState(false);
  const [txIdAutoDetected, setTxIdAutoDetected] = React.useState(false);

  // Use effect hook at the top level of the component
  React.useEffect(() => {
    const fetchReportDetails = async () => {
      try {
        const response = await fetch(`/api/attendance/${report.id}`);
        if (response.ok) {
          const updatedReport = await response.json();
          setRefreshedReport(updatedReport);
        }
      } catch (error) {
        console.error("Error fetching report details:", error);
      }
    };

    if (!report.fileUrl && report.status === "sent") {
      fetchReportDetails();
    } else {
      setRefreshedReport(report);
    }
  }, [report.id, report.fileUrl, report.status]);

  const currentReport = refreshedReport;

  const getProperFileUrl = (url: string | undefined): string[] => {
    if (!url) return [];
    const possibleUrls = [];
    const fileName = url.split('/').pop();
    if (url.startsWith('/')) {
      possibleUrls.push(`${window.location.origin}${url}`);
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      possibleUrls.push(`${window.location.origin}/${url}`);
    }
    possibleUrls.push(url);
    if (fileName) {
      const baseFileName = fileName.split('.')[0];
      const fileExt = fileName.split('.').pop() || 'pdf';
      possibleUrls.push(`${window.location.origin}/uploads/${fileName}`);
      possibleUrls.push(`/uploads/${fileName}`);
      possibleUrls.push(`${window.location.origin}/api/uploads/${fileName}`);
      possibleUrls.push(`/api/uploads/${fileName}`);
      possibleUrls.push(`${window.location.origin}/uploads/${baseFileName}_*.${fileExt}`);
      possibleUrls.push(`${window.location.origin}/uploads/${baseFileName}*.${fileExt}`);
      const reportId = currentReport.id;
      if (reportId) {
        possibleUrls.push(`${window.location.origin}/uploads/${reportId}_*.${fileExt}`);
        possibleUrls.push(`${window.location.origin}/uploads/report_${reportId}.${fileExt}`);
      }
    }
    const reportId = currentReport.id;
    if (fileName) {
      const fileExt = fileName.split('.').pop() || 'pdf';
      possibleUrls.push(`${window.location.origin}/uploads/*_${reportId}.${fileExt}`);
      possibleUrls.push(`${window.location.origin}/uploads/*${reportId}*.${fileExt}`);
    }
    return possibleUrls;
  };

  const [fileExists, setFileExists] = React.useState<boolean>(false);
  const [isCheckingFile, setIsCheckingFile] = React.useState<boolean>(true);
  const [workingFileUrl, setWorkingFileUrl] = React.useState<string>('');
  const [errorDetails, setErrorDetails] = React.useState<string>('');
  const [verifyTransactionId, setVerifyTransactionId] = React.useState<string>('');

  React.useEffect(() => {
    const checkFileExists = async () => {
      if (!currentReport.fileUrl) {
        setFileExists(false);
        setIsCheckingFile(false);
        setErrorDetails("No file URL provided");
        return;
      }
      setIsCheckingFile(true);
      setErrorDetails('');
      try {
        const possibleUrls = getProperFileUrl(currentReport.fileUrl);
        for (const url of possibleUrls) {
          try {
            const response = await fetch(url, { method: 'HEAD', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' } });
            if (response.ok) {
              setFileExists(true);
              setWorkingFileUrl(url);
              return;
            }
          } catch (urlError) {
            console.error(`Error checking URL ${url}:`, urlError);
          }
        }
        try {
          const url = possibleUrls[0];
          const response = await fetch(url);
          if (response.ok && response.headers.get('content-type')?.includes('pdf')) {
            setFileExists(true);
            setWorkingFileUrl(url);
            return;
          }
          const blob = await response.blob();
          if (blob.type === 'application/pdf' || blob.size > 1000) {
            setFileExists(true);
            setWorkingFileUrl(url);
            return;
          } else {
            setErrorDetails(`Server returned: ${response.status} ${response.statusText}, Content-Type: ${blob.type}, Size: ${blob.size} bytes`);
          }
        } catch (getError) {
          console.error("Error with GET request:", getError);
        }
        setFileExists(false);
        setErrorDetails(`Tried ${possibleUrls.length} URLs, all returned 404 or errors`);
      } catch (error) {
        console.error("Error checking file existence:", error);
        setFileExists(false);
        setErrorDetails(error instanceof Error ? error.message : String(error));
      } finally {
        setIsCheckingFile(false);
      }
    };
    checkFileExists();
  }, [currentReport.fileUrl]);

  // --- Quality Check Helpers ---

  const calcBlurScore = (imageData: ImageData): number => {
    const { data, width, height } = imageData;
    let sum = 0, count = 0;
    const getGray = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const lap =
          -getGray(x - 1, y - 1) - getGray(x, y - 1) - getGray(x + 1, y - 1)
          - getGray(x - 1, y) + 8 * getGray(x, y) - getGray(x + 1, y)
          - getGray(x - 1, y + 1) - getGray(x, y + 1) - getGray(x + 1, y + 1);
        sum += lap * lap;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  };

  const calcBrightness = (imageData: ImageData): number => {
    const { data } = imageData;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return total / (data.length / 4);
  };

  const loadImageToCanvas = (file: File): Promise<{ canvas: HTMLCanvasElement; width: number; height: number } | null> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (!ev.target?.result) return resolve(null);
        const img = new Image();
        img.onload = () => {
          const MAX = 800;
          let w = img.width, h = img.height;
          if (w > h ? w > MAX : h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else { w = Math.round(w * MAX / h); h = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          resolve({ canvas, width: img.width, height: img.height });
        };
        img.onerror = () => resolve(null);
        img.src = ev.target.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const checkImageQuality = async (file: File): Promise<{ pass: boolean; reason?: string }> => {
    // Canvas checks (blur, brightness, resolution)
    setQualityStep('Analyzing image clarity and brightness...');
    const result = await loadImageToCanvas(file);
    if (!result) return { pass: false, reason: 'Could not read the image file. Please try a different file.' };

    const { canvas, width, height } = result;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Resolution check
    const longer = Math.max(width, height);
    const shorter = Math.min(width, height);
    if (longer < 600 || shorter < 400) {
      return { pass: false, reason: `Image resolution is too low (${width}x${height}px). Please upload a clearer photo with at least 600x400 pixels.` };
    }

    // Orientation check
    if (width > height) {
      return { pass: false, reason: 'Image is in landscape orientation. Please upload the document straight in portrait orientation.' };
    }

    // Blur check — threshold set to 3 to accommodate compressed mobile scans
    // (CamScanner, Adobe Scan, phone camera JPEG) which have lower Laplacian variance
    // due to JPEG compression even when the document is clearly readable.
    // Only genuinely out-of-focus or heavily blurred images will score below 3.
    const blurScore = calcBlurScore(imageData);
    if (blurScore < 3) {
      return { pass: false, reason: 'Image appears too blurry. Please retake the photo in good lighting and hold the camera steady.' };
    }

    // Brightness check — only check for too dark; upper limit removed because
    // scanned documents on white paper legitimately have high brightness (> 230)
    const brightness = calcBrightness(imageData);
    if (brightness < 40) {
      return { pass: false, reason: 'Image is too dark. Please take the photo in a well-lit area.' };
    }

    // NOTE: Tesseract OCR removed — it only loaded the English model which
    // caused false rejections for Hindi/Urdu/mixed-language government attendance
    // forms. Canvas checks above are sufficient for document quality validation.

    return { pass: true };
  };

  const checkPDFQuality = async (file: File): Promise<{ pass: boolean; reason?: string }> => {
    setQualityStep('Step 1/2: Loading PDF document...');
    try {
      // Load pdfjs from CDN — always re-set workerSrc even if lib is cached
      // to handle cases where the PDF.js worker thread has died between uploads
      const pdfjsLib = await new Promise<any>((resolve, reject) => {
        const workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        if ((window as any).pdfjsLib) {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
          resolve((window as any).pdfjsLib);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          const lib = (window as any).pdfjsLib;
          lib.GlobalWorkerOptions.workerSrc = workerSrc;
          resolve(lib);
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (pdf.numPages === 0) {
        return { pass: false, reason: 'The PDF file appears to be empty (0 pages). Please upload a valid PDF.' };
      }

      setQualityStep('Step 2/2: Checking document visibility...');
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });

      // Orientation check
      if (viewport.width > viewport.height) {
        return { pass: false, reason: 'PDF is in landscape orientation. Please upload the document straight in portrait orientation.' };
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.min(viewport.width, 800);
      canvas.height = Math.min(viewport.height, 1000);
      const ctx = canvas.getContext('2d')!;
      // Guard against zero/NaN scale (corrupt or unusual PDFs with zero-width viewport)
      const renderScale = viewport.width > 0 ? canvas.width / viewport.width : 1.0;
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: renderScale }) }).promise;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const brightness = calcBrightness(imageData);

      // Count non-white pixels to detect truly blank pages
      // Adobe Scan PDFs have white backgrounds but always contain dark text/lines
      const { data } = imageData;
      let nonWhitePixels = 0;
      const totalPixels = canvas.width * canvas.height;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // A pixel is "non-white" if any channel is meaningfully below 240
        if (r < 240 || g < 240 || b < 240) {
          nonWhitePixels++;
        }
      }
      const nonWhiteRatio = nonWhitePixels / totalPixels;

      // A truly blank/empty page has almost zero non-white pixels (< 0.3%)
      if (nonWhiteRatio < 0.003) {
        return { pass: false, reason: 'The first page of the PDF appears blank or empty. Please check the file and try again.' };
      }
      // Too dark (bad scan) — still use brightness for this case
      if (brightness < 30) {
        return { pass: false, reason: 'The PDF page is too dark to read. Please re-scan the document with proper brightness settings.' };
      }
      return { pass: true };
    } catch (err) {
      console.error('PDF quality check error:', err);
      // If pdfjs fails, allow upload rather than blocking
      return { pass: true };
    }
  };

  const rejectFile = (message: string) => {
    setQualityStatus('failed');
    setQualityError(message);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSelectedFile(null);
    setProcessedFile(null);
    setQualityStatus('idle');
    setQualityError('');
    setTxIdStatus('idle');
    setTxIdLocked(false);
    setTxIdAutoDetected(false);
    setVerifyTransactionId('');
    setManualConfirmed(false);
    toast({ variant: 'destructive', title: 'Document Quality Check Failed', description: message });
  };

  // ---------------------------------------------------------------------------
  // Transaction ID extraction helpers
  // ---------------------------------------------------------------------------

  /**
   * Helper to clean up OCR mistakes where letters are confused for numbers.
   * Since Transaction ID is Hexadecimal (0-9, A-F), letters like O, I, S, Z are definitely mistakes.
   */
  const sanitizeOCRText = (text: string): string => {
    return text.toUpperCase()
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .replace(/S/g, '5')
      .replace(/Z/g, '2')
      .replace(/G/g, '6');
  };

  /**
   * Helper to find a valid 8-char hex Transaction ID in OCR text.
   * Prefers tokens with at least one letter (to avoid matching dates like 01042026).
   */
  const extractIdFromText = (text: string): string | null => {
    const sanitized = sanitizeOCRText(text);
    const allTokens = sanitized.match(/\b([0-9A-F]{8})\b/g) || [];
    // Prefer token with at least one letter (true hex ID), fallback to any 8-digit token
    return allTokens.find((t) => /[A-F]/.test(t)) || allTokens[0] || null;
  };

  /**
   * Helper to load Tesseract JS dynamically.
   */
  const loadTesseract = async () => {
    return new Promise<any>((resolve, reject) => {
      if ((window as any).Tesseract) { resolve((window as any).Tesseract); return; }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => resolve((window as any).Tesseract);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  /**
   * Orchestrates OCR on top and bottom strips of a canvas/image source.
   */
  const performOCROnSource = async (source: HTMLCanvasElement | HTMLImageElement): Promise<string | null> => {
    const Tesseract = await loadTesseract();
    const W = source.width;
    const H = source.height;

    const ocrStrip = async (sy: number, sh: number): Promise<string> => {
      const c = document.createElement('canvas');
      const scale = 2;
      c.width = W * scale;
      c.height = sh * scale;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(source, 0, sy, W, sh, 0, 0, c.width, c.height);
      const worker = await Tesseract.createWorker('eng');
      const { data } = await worker.recognize(c);
      await worker.terminate();
      return data.text || '';
    };

    // Scan Top 25%
    const headerHeight = Math.round(H * 0.25);
    const headerText = await ocrStrip(0, headerHeight);
    const headerId = extractIdFromText(headerText);
    if (headerId) return headerId;

    // Scan Bottom 20%
    const footerHeight = Math.round(H * 0.20);
    const footerY = H - footerHeight;
    const footerText = await ocrStrip(footerY, footerHeight);
    return extractIdFromText(footerText);
  };

  /**
   * Extract Transaction ID from a PDF using PDF.js text layer.
   * Falls back to canvas OCR if no text layer found (scanned PDFs).
   */
  const extractTransactionIdFromPDF = async (file: File): Promise<string | null> => {
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) return null;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (!pdf || pdf.numPages === 0) return null;

      const page = await pdf.getPage(1);

      // Attempt fast native text extraction
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map((item: any) => item.str).join(' ');
      const candidate = extractIdFromText(fullText);
      if (candidate) return candidate;

      // Fallback: render PDF page to canvas and OCR it
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, viewport }).promise;
      return await performOCROnSource(canvas);
    } catch (err) {
      console.error('PDF extraction failed:', err);
      return null;
    }
  };

  /**
   * Extract Transaction ID from an image using Tesseract OCR.
   */
  const extractTransactionIdFromImage = async (file: File): Promise<string | null> => {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = ev.target!.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return await performOCROnSource(img);
    } catch (err) {
      console.error('Image extraction failed:', err);
      return null;
    }
  };

  /**
   * Orchestrate extraction + immediate verification against report.transactionId.
   */
  const runTransactionIdExtraction = async (file: File, isPdf: boolean) => {
    // Only set 'extracting' if API hasn't already provided an ID
    if (!txIdSetByApiRef.current) {
      setTxIdStatus('extracting');
      setTxIdLocked(false);
      setTxIdAutoDetected(false);
    }

    const extracted = isPdf
      ? await extractTransactionIdFromPDF(file)
      : await extractTransactionIdFromImage(file);

    // If the API already set the TX ID while Tesseract was running, don't override it
    if (txIdSetByApiRef.current) return;

    if (!extracted) {
      setTxIdStatus('manual');
      setVerifyTransactionId('');
      return;
    }

    setVerifyTransactionId(extracted);
    setTxIdAutoDetected(true);

    const systemId = report.transactionId?.toUpperCase() ?? '';
    if (extracted.toUpperCase() === systemId) {
      setTxIdStatus('verified');
      setTxIdLocked(true);
    } else {
      setTxIdStatus('mismatch');
      setTxIdLocked(false);
    }
  };

  // --- End Quality Check Helpers ---

  // ── OCR API: primary quality check ───────────────────────────
  /**
   * callOcrApiAndSetQuality — the authoritative document quality decision.
   *
   * Called AFTER the local pre-filter (canvas/pdfjs) passes.
   * handleFileChange AWAITS this function, so qualityStatus stays 'checking'
   * (spinner visible) until the API responds.
   *
   * API success:
   *   quality_acceptable=true  → qualityStatus='passed'
   *   quality_acceptable=false → qualityStatus='failed' + bilingual issues
   *   transaction_id present   → fills Verify TX ID field (always, regardless
   *                              of quality result; same verified/mismatch logic)
   *                              Sets txIdSetByApiRef=true so Tesseract won't override.
   *
   * API unavailable (503 / network error / timeout):
   *   qualityStatus='fallback' — user sees amber warning, may still submit.
   *   Tesseract extraction continues as the txId fallback.
   */
  const callOcrApiAndSetQuality = async (file: File, isPdf: boolean): Promise<void> => {
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 s

      let resp: Response;
      try {
        resp = await fetch('/api/ocr-validate', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // 503 = service not configured → graceful fallback
      if (resp.status === 503) {
        setQualityStatus('fallback');
        runTransactionIdExtraction(file, isPdf);
        return;
      }

      if (!resp.ok) {
        // Any other upstream error → fallback (don't block the user)
        console.error(`OCR API proxy returned ${resp.status}`);
        setQualityStatus('fallback');
        runTransactionIdExtraction(file, isPdf);
        return;
      }

      const data = await resp.json();

      // ── Quality verdict ──────────────────────────────────────────────
      // document_acceptable = combined result (quality + content checks).
      // Falls back to quality_acceptable if not present.
      const acceptable: boolean =
        data.document_acceptable ?? data.quality_acceptable ?? true;

      // Build the bilingual issue lists.
      // Preferred: split message / message_hindi by ' | ' → gives ALL issues
      //            (image quality issues + content issues like dispatch missing)
      // Fallback:  quality_issues / quality_issues_hindi arrays (image only)
      const issuesEn: string[] = data.message
        ? (data.message as string).split(' | ').map((s: string) => s.trim()).filter(Boolean)
        : (data.quality_issues ?? data.issues_en ?? []);

      const issuesHi: string[] = data.message_hindi
        ? (data.message_hindi as string).split(' | ').map((s: string) => s.trim()).filter(Boolean)
        : (data.quality_issues_hindi ?? data.issues_hi ?? []);

      if (acceptable) {
        setQualityStatus('passed');
        setQualityIssuesEn([]);
        setQualityIssuesHi([]);
      } else {
        setQualityStatus('failed');
        setQualityIssuesEn(issuesEn);
        setQualityIssuesHi(issuesHi);
      }

      // ── Transaction ID (always fill, regardless of quality) ──────────
      // API returns it as transaction_id_extracted; fallback to other names.
      const apiTxId: string | null =
        data.transaction_id_extracted ??
        data.transaction_id ??
        data.content_checks?.transaction_id ??
        null;

      if (apiTxId) {
        const cleaned = apiTxId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        if (cleaned.length >= 6) { // at least 6 chars = plausible TX ID
          txIdSetByApiRef.current = true; // prevent Tesseract from overriding
          setVerifyTransactionId(cleaned);
          setTxIdAutoDetected(true);
          const systemId = report.transactionId?.toUpperCase() ?? '';
          if (cleaned === systemId) {
            setTxIdStatus('verified');
            setTxIdLocked(true);
          } else {
            setTxIdStatus('mismatch');
            setTxIdLocked(false);
          }
          return; // Successfully got ID from API, no need for local extraction
        }
      }

      // If API succeeded but didn't provide a valid Transaction ID, fallback to local
      runTransactionIdExtraction(file, isPdf);

    } catch (err: any) {
      // AbortError (55 s timeout) or network failure → fallback gracefully
      console.warn('OCR API unavailable, falling back to local result:', err?.message ?? err);
      setQualityStatus('fallback');
      runTransactionIdExtraction(file, isPdf);
    }
  };
  // ─────────────────────────────────────────────────────────────

  // Function to process image files (resize and compress)
  const processImageFile = async (file: File): Promise<File | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target?.result) return resolve(null);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null); // Could not get context
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(null);
              const originalName = file.name.substring(0, file.name.lastIndexOf('.') || file.name.length);
              const newFilename = `compressed_${originalName}.jpg`;
              const processedImageFile = new File([blob], newFilename, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(processedImageFile);
            },
            'image/jpeg',
            0.5 // 50% quality
          );
        };
        img.onerror = () => resolve(null); // Image load error
        img.src = event.target.result as string;
      };
      reader.onerror = () => resolve(null); // File read error
      reader.readAsDataURL(file);
    });
  };

  // Handler for file input changes
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // ── Reset all state on every new file selection ──────────────
    setSelectedFile(file || null);
    setProcessedFile(null);
    setQualityStatus('idle');
    setQualityError('');
    setQualityStep('');
    setQualityIssuesEn([]);
    setQualityIssuesHi([]);
    setTxIdStatus('idle');
    setTxIdLocked(false);
    setTxIdAutoDetected(false);
    setVerifyTransactionId('');
    setManualConfirmed(false);
    txIdSetByApiRef.current = false;
    // ─────────────────────────────────────────────────────────────

    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileExtension === 'pdf';
    const isImage = file.type.startsWith('image/');
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    const isAllowedType = allowedTypes.includes(file.type) || fileExtension === 'pdf';

    // ── Step 1: File type / size guard ───────────────────────────
    if (!isAllowedType) {
      toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Please select a PDF or an image file (JPEG/PNG).' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
      return;
    }
    if (isPdf && file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'PDF file size must be less than 5MB.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
      return;
    }
    if (isImage && file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'Image file size must be less than 2MB.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
      return;
    }

    // ── Step 2: Local pre-filter (basic readability only) ────────
    // Catches truly bad files: blank pages, corrupt PDFs, extremely dark images.
    // Does NOT determine quality pass/fail — that is the OCR API's job.
    setQualityStatus('checking');
    setQualityStep('Verifying file readability...');

    let preFilterPassed = true;
    if (isPdf) {
      const pdfResult = await checkPDFQuality(file);
      if (!pdfResult.pass) {
        rejectFile(pdfResult.reason || 'PDF could not be read. Please check the file and try again.');
        return;
      }
    } else if (isImage) {
      const imgResult = await checkImageQuality(file);
      if (!imgResult.pass) {
        rejectFile(imgResult.reason || 'Image could not be read. Please try a different file.');
        return;
      }
    } else {
      preFilterPassed = false;
    }
    if (!preFilterPassed) return;

    // ── Step 3: Image compression (start in background, non-blocking) ─
    if (isImage) {
      if (file.size <= 500 * 1024) {
        setProcessedFile(file);
      } else {
        setIsProcessing(true);
        // Fire-and-forget; compression completes while OCR API runs
        processImageFile(file)
          .then((result) => {
            if (result) setProcessedFile(result);
            else setProcessedFile(file); // fallback: use original
          })
          .catch(() => setProcessedFile(file))
          .finally(() => setIsProcessing(false));
      }
    }

    // ── Step 4: OCR API — PRIMARY quality check (awaited) ────────
    // The form stays in 'checking' state (submit disabled) until this resolves.
    // Sets qualityStatus → 'passed' | 'failed' | 'fallback'
    // Transaction ID will be extracted from API, or fallback to Tesseract if missing/failed.
    setQualityStep('Running deep document analysis...');
    await callOcrApiAndSetQuality(file, isPdf);
  };

  React.useEffect(() => {
    const attemptToFindFile = async () => {
      if (!currentReport.fileUrl && !currentReport.id) return;

      try {
        const response = await fetch('/api/list-files?dir=uploads');
        if (response.ok) {
          const files = await response.json();

          const reportId = currentReport.id;
          const possibleFiles = files.filter((file: string) => {
            return file.includes(`${reportId}`) ||
              (currentReport.fileUrl && file.includes(currentReport.fileUrl.split('/').pop() || ''));
          });

          if (possibleFiles.length > 0) {
            const mostLikelyFile = possibleFiles[0];
            const fileUrl = `/uploads/${mostLikelyFile}`;
            setWorkingFileUrl(fileUrl);
            setFileExists(true);
          }
        } else {
        }
      } catch (error) {
        console.error("Error listing files:", error);
      }
    };

    // Only attempt if file isn't already found by URL check
    if (!fileExists && isCheckingFile === false) {
      attemptToFindFile();
    }
  }, [currentReport.id, currentReport.fileUrl, fileExists, isCheckingFile]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {currentReport.fileUrl && fileExists ? "View Signed Attendance Report" : "Upload Signed Attendance Report"}
        </DialogTitle>
        <DialogDescription>
          {currentReport.fileUrl && fileExists
            ? "Review the uploaded signed attendance report file."
            : currentReport.fileUrl && !fileExists
              ? "The report file could not be found. Please upload it again."
              : "Upload the signed PDF or image version of this attendance report and provide despatch details."}
        </DialogDescription>
      </DialogHeader>

      {currentReport.fileUrl && fileExists ? (
        <>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              <p>
                <strong>Despatch No:</strong> {currentReport.despatchNo}
              </p>
              <p>
                <strong>Despatch Date:</strong>{" "}
                {formatDate(currentReport.despatchDate!)}
              </p>
            </div>
          </div>
          <div className="w-full h-[600px] border rounded-lg overflow-hidden">
            {workingFileUrl ? (
              workingFileUrl.toLowerCase().endsWith('.pdf') ? (
                <object
                  data={workingFileUrl}
                  type="application/pdf"
                  className="w-full h-full"
                >
                  <div className="p-4 text-center">
                    <p className="mb-4">
                      Unable to display PDF in browser.
                    </p>
                    <a
                      href={workingFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                    >
                      Open PDF in new tab
                    </a>
                  </div>
                </object>
              ) : (
                <img src={workingFileUrl} alt="Uploaded Report Document" className="w-full h-full object-contain" />
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="mb-6 text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">File Not Found</h3>
                <p className="text-muted-foreground mb-4">
                  The file could not be loaded. It may have been deleted or moved.
                </p>
                {isCheckingFile ? (
                  <div className="flex items-center justify-center mb-4">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Checking file locations...</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const urls = getProperFileUrl(currentReport.fileUrl);
                          if (urls.length > 0) {
                            window.open(urls[0], '_blank');
                          }
                        }}
                      >
                        Try Opening in New Tab
                      </Button>
                      <Button
                        variant="default"
                        onClick={() => {
                          const rerequestFile = async () => {
                            try {
                              const response = await fetch(`/api/attendance/${currentReport.id}`);
                              if (response.ok) {
                                const updatedReport = await response.json();
                                setRefreshedReport(updatedReport);
                                // Re-trigger checkFileExists
                                setIsCheckingFile(true);
                                setFileExists(false); // Reset state to force re-check
                              }
                            } catch (error) {
                              console.error("Error requesting file:", error);
                            }
                          };
                          rerequestFile();
                        }}
                      >
                        Refresh File Status
                      </Button>
                    </div>

                    {errorDetails && (
                      <div className="mt-4 text-left w-full">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground">Show technical details</summary>
                          <div className="mt-2 p-3 bg-gray-50 rounded border text-xs font-mono overflow-auto max-h-32">
                            <p>File URL: {currentReport.fileUrl}</p>
                            <p>Error: {errorDetails}</p>
                          </div>
                        </details>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <form className="space-y-4">
          <div className="grid gap-4">

            {/* 1. File Upload Field */}
            <div className="space-y-2">
              <label htmlFor="pdfOrImageFile" className="text-sm font-medium">
                PDF or Image File <span className="text-xs font-normal text-muted-foreground ml-1">(Max: Image 2MB, PDF 5MB)</span>
              </label>
              <Input
                ref={fileInputRef}
                id="pdfOrImageFile"
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg"
                className="cursor-pointer"
                onChange={handleFileChange}
              />
              {/* ── Quality status block ────────────────────────────────── */}

              {/* Checking: pre-filter or OCR API in progress */}
              {qualityStatus === 'checking' && (
                <div className="mt-3 p-3 rounded-md bg-blue-50 border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700 text-sm font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking document quality...
                  </div>
                  <p className="text-xs text-blue-600 mt-1">{qualityStep}</p>
                  <div className="mt-2 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full animate-pulse"
                      style={{ width: qualityStep.includes('OCR') ? '65%' : '25%' }}
                    />
                  </div>
                </div>
              )}

              {/* Passed: API confirmed quality_acceptable = true */}
              {qualityStatus === 'passed' && (
                <div className="mt-3 p-3 rounded-md bg-green-50 border border-green-200 flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700 font-medium">Document quality check passed.</span>
                </div>
              )}

              {/* Failed: API confirmed quality_acceptable = false — show bilingual reasons */}
              {qualityStatus === 'failed' && (
                <div className="mt-3 p-3 rounded-md bg-red-50 border border-red-400">
                  <div className="flex items-center gap-2 text-red-800 text-sm font-bold mb-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Document Quality Check Failed
                  </div>
                  {qualityIssuesEn.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-2">
                      {qualityIssuesEn.map((issue, i) => (
                        <li key={i} className="text-xs text-red-700 font-semibold">
                          {issue}
                          {qualityIssuesHi[i] && (
                            <span
                              className="block text-red-600 font-normal mt-0.5"
                              style={{ fontFamily: 'Noto Sans Devanagari, Arial, sans-serif' }}
                            >
                              {qualityIssuesHi[i]}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-red-700">The document did not meet quality requirements.</p>
                  )}
                  <p className="text-xs text-red-500 mt-2 font-medium">
                    Please fix the above issues and upload the corrected document.
                  </p>
                </div>
              )}

              {/* Fallback: API unavailable — local pre-filter passed, proceed with caution */}
              {qualityStatus === 'fallback' && (
                <div className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-400">
                  <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Basic Check Passed — Deep Analysis Unavailable
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    The deep OCR quality check is currently unavailable. Please ensure the signed document
                    has a <strong>dispatch number</strong>, <strong>dispatch date</strong>, and the correct
                    <strong> Transaction ID</strong> written on it before submitting.
                  </p>
                </div>
              )}

              {/* ── Compression / file-ready info ─────────────────────────── */}
              {isProcessing && (
                <div className="flex items-center text-sm text-muted-foreground mt-2">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Compressing image...
                </div>
              )}
              {processedFile && (qualityStatus === 'passed' || qualityStatus === 'fallback') && (
                <div className="text-sm text-green-600 mt-2">
                  Ready: {processedFile.name} ({Math.round(processedFile.size / 1024)} KB)
                </div>
              )}
              {!processedFile && selectedFile && selectedFile.type.startsWith('application/pdf') && (qualityStatus === 'passed' || qualityStatus === 'fallback') && (
                <div className="text-sm text-blue-600 mt-2">
                  PDF Ready: {selectedFile.name}
                </div>
              )}
            </div>

            </div>

            {/* 2b. Non-manual status messages (extracting / verified / mismatch) */}
            {txIdStatus !== 'idle' && txIdStatus !== 'manual' && (
              <div className="space-y-1">
                {txIdStatus === 'extracting' && (
                  <p className="text-xs text-blue-600 flex items-center gap-1 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Scanning document for Transaction ID...
                  </p>
                )}
                {(txIdStatus === 'verified' || txIdStatus === 'manual_verified') && (
                  <p className="text-xs text-green-700 flex items-center gap-1 font-medium">
                    <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {txIdAutoDetected
                      ? 'Transaction ID auto-detected and verified. — Please confirm it matches the printed copy.'
                      : 'Transaction ID verified.'}
                  </p>
                )}
                {txIdStatus === 'mismatch' && (
                  <div className="mt-1 p-2.5 rounded-md bg-amber-50 border border-amber-300">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800">
                          This does not appear to be the latest signed copy.
                        </p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          The Transaction ID on this document (<span className="font-mono font-bold">{verifyTransactionId}</span>) does not match the current report ID.
                          Please ensure you are uploading the most recently printed and signed attendance report.
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          If this is correct, please type the Transaction ID manually in the field below.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2c. Manual state info block with checkbox */}
            {txIdStatus === 'manual' && (
              <div className="mt-2 p-3.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-800">
                <p className="font-bold text-[15px] mb-2 text-slate-900">
                  The Transaction ID could not be detected automatically. This usually happens if the uploaded attendance report is:
                </p>
                <ul className="list-disc pl-5 space-y-1 mb-3 text-slate-700 font-medium">
                  <li>Blurry or of low image quality.</li>
                  <li>Captured at an angle (skewed) rather than flat on a proper surface.</li>
                  <li>Scanned at low resolution.</li>
                  <li>The wrong document (not a valid attendance report).</li>
                </ul>

                {/* English + Hindi warning */}
                <p className="font-bold text-amber-700 mb-1">
                  Please ensure the file is clear, readable, and printable; otherwise, the system may reject it during deep analysis.
                </p>
                <p className="font-bold text-amber-700 mb-3" style={{ fontFamily: 'Noto Sans Devanagari, Arial, sans-serif' }}>
                  कृपया सुनिश्चित करें कि फ़ाइल स्पष्ट, पठनीय और प्रिंट होने योग्य हो; अन्यथा सिस्टम गहरे विश्लेषण के दौरान इसे अस्वीकार कर सकता है।
                </p>

                {/* Confirmation checkbox */}
                <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={manualConfirmed}
                    onChange={(e) => setManualConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-400 accent-blue-600 cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                    I believe the PDF or image file is correct.
                  </span>
                </label>

                {manualConfirmed && (
                  <p className="mt-2 text-sm text-blue-700 font-medium pl-6">
                    Please manually type the Transaction ID as it appears on the physically signed report.
                  </p>
                )}
              </div>
            )}

            {/* 3. Despatch Details - Only show when quality is passed AND ID is verified */}
            {(txIdStatus === 'verified' || txIdStatus === 'manual_verified') && (qualityStatus === 'passed' || qualityStatus === 'fallback') && (
              <>
                <div className="space-y-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-medium text-foreground">Despatch Details</h3>
                  <label htmlFor="despatchNo" className="text-xs font-medium text-muted-foreground">
                    Despatch No
                  </label>
                  <Input
                    id="despatchNo"
                    placeholder="Enter despatch number"
                    defaultValue={report.despatchNo}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="despatchDate" className="text-xs font-medium text-muted-foreground">
                    Despatch Date
                  </label>
                  <Input
                    id="despatchDate"
                    type="date"
                    defaultValue={report.despatchDate ? new Date(report.despatchDate).toISOString().split('T')[0] : undefined}
                  />
                </div>
              </>
            )}

            {/* 4. Verify Transaction ID — moved to bottom, just above Submit/Cancel */}
            {(txIdStatus !== 'idle' || qualityStatus === 'passed' || qualityStatus === 'failed' || qualityStatus === 'fallback') && (
              <div className="space-y-1.5 border-t pt-4 mt-2">
                <label htmlFor="verifyTransactionId" className="text-sm font-medium text-amber-900 flex items-center gap-1">
                  Verify Transaction ID <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Input
                    id="verifyTransactionId"
                    placeholder={
                      txIdStatus === 'extracting'
                        ? 'Scanning document...'
                        : txIdStatus === 'manual' && !manualConfirmed
                          ? 'Check the box above to enable manual entry'
                          : 'ENTER ID PRINTED ON THE PAPER REPORT'
                    }
                    value={verifyTransactionId}
                    readOnly={txIdLocked || txIdStatus === 'extracting'}
                    disabled={txIdStatus === 'manual' && !manualConfirmed}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
                      setVerifyTransactionId(val);
                      setTxIdAutoDetected(false);
                      if (val.length === 8) {
                        const systemId = report.transactionId?.toUpperCase() ?? '';
                        if (val === systemId) {
                          setTxIdStatus('manual_verified');
                          setTxIdLocked(true);
                        } else {
                          setTxIdStatus('mismatch');
                        }
                      } else {
                        setTxIdStatus('manual');
                        setTxIdLocked(false);
                      }
                    }}
                    className={[
                      'font-mono uppercase tracking-widest pr-10 transition-all duration-200',
                      txIdStatus === 'manual' && !manualConfirmed
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : txIdStatus === 'verified' || txIdStatus === 'manual_verified'
                          ? 'border-green-500 bg-green-50 text-green-800 focus-visible:ring-green-400'
                          : txIdStatus === 'mismatch'
                            ? 'border-amber-400 bg-amber-50 text-amber-900 focus-visible:ring-amber-400'
                            : txIdStatus === 'extracting'
                              ? 'bg-blue-50 border-blue-300'
                              : ''
                    ].join(' ')}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    {txIdStatus === 'extracting' && (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    )}
                    {(txIdStatus === 'verified' || txIdStatus === 'manual_verified') && (
                      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {txIdStatus === 'mismatch' && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    {txIdStatus === 'manual' && manualConfirmed && verifyTransactionId.length > 0 && verifyTransactionId.length < 8 && (
                      <span className="text-xs text-muted-foreground font-mono">{verifyTransactionId.length}/8</span>
                    )}
                  </div>
                </div>
                {txIdStatus === 'idle' && (
                  <p className="text-xs text-muted-foreground">
                    Please type the Transaction ID that is printed on the physical signed report.
                  </p>
                )}
              </div>
            )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={
                // Block while OCR API is still running
                qualityStatus === 'checking' ||
                // Block when API confirmed document is unacceptable
                qualityStatus === 'failed' ||
                // Block while image is compressing (processedFile not ready yet)
                isProcessing ||
                // Block while Tesseract is still extracting (and API hasn't provided TX ID yet)
                (txIdStatus === 'extracting' && !txIdSetByApiRef.current) ||
                // Block when TX ID doesn't match (user must correct it)
                txIdStatus === 'mismatch'
              }
              onClick={async (e) => {
                e.preventDefault();
                const form = e.currentTarget.closest("form");
                if (form) {
                  try {
                    const despatchNoInput = form.querySelector("#despatchNo") as HTMLInputElement;
                    const despatchDateInput = form.querySelector("#despatchDate") as HTMLInputElement;

                    const fileToUpload = processedFile || selectedFile;

                    const despatchNo = despatchNoInput?.value || report.despatchNo || '';
                    const despatchDate = despatchDateInput?.value || (report.despatchDate ? new Date(report.despatchDate).toISOString().split('T')[0] : '');

                    if (!verifyTransactionId.trim()) {
                      toast({
                        variant: "destructive",
                        title: "Verification Required",
                        description: "Please enter the Transaction ID printed on the physical copy.",
                      });
                      return;
                    }

                    if (verifyTransactionId.trim().toUpperCase() !== report.transactionId?.toUpperCase()) {
                      toast({
                        variant: "destructive",
                        title: "ID Mismatch",
                        description: "The Transaction ID you entered does not match this report.",
                      });
                      return;
                    }

                    if (!fileToUpload || !despatchNo || !despatchDate) {
                      toast({
                        variant: "destructive",
                        title: "Error",
                        description: "Please fill in all fields and select a file",
                      });
                      return;
                    }

                    const button = e.currentTarget;
                    const originalText = button.innerHTML;
                    button.innerHTML = '<span class="animate-spin mr-2">⏳</span> Uploading...';
                    button.disabled = true;

                    try {
                      const result = await handleUpload(fileToUpload, report.id, {
                        despatchNo,
                        despatchDate,
                      });

                      await queryClient.refetchQueries({
                        queryKey: [`/api/departments/${department?.id}/attendance`]
                      });

                      const closeButton = document.querySelector("[data-dialog-close]");
                      if (closeButton instanceof HTMLButtonElement) {
                        closeButton.click();
                      }

                      setTimeout(() => {
                        window.location.reload();
                      }, 500);
                    } catch (uploadError) {
                      console.error("Upload error:", uploadError);
                      button.innerHTML = originalText;
                      button.disabled = false;
                    }
                  } catch (error) {
                    console.error("Error in form submission:", error);
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: "An unexpected error occurred"
                    });

                    const button = e.currentTarget;
                    if (button.disabled) {
                      button.innerHTML = '<span>Submit</span>';
                      button.disabled = false;
                    }
                  }
                }
              }}
            >
              <span>Submit</span>
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
};

const POSITIVE_REMARKS = [
  {
    en: "The Attendance Management System has significantly simplified the reporting process for our department. In my opinion, this system should continue permanently.",
    hi: "इस उपस्थिति प्रबंधन प्रणाली ने हमारे विभाग के लिए रिपोर्टिंग प्रक्रिया को काफी सरल बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance System has been very helpful for our department. It has simplified the attendance submission process, reduced paperwork, saved time and resources, and improved efficiency. In my opinion, this system should continue permanently.",
    hi: "उपस्थिति प्रणाली हमारे विभाग के लिए बहुत उपयोगी रही है। इसने उपस्थिति जमा करने की प्रक्रिया को सरल बनाया है, कागजी काम कम किया है, समय और संसाधनों की बचत की है, और कार्यकुशलता में सुधार किया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "This system has improved efficiency and reduced manual workload. In my opinion, this system should continue permanently.",
    hi: "इस प्रणाली ने कार्यक्षमता में सुधार किया है और मैन्युअल कार्यभार को कम किया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The digital attendance reporting system is very helpful. In my opinion, this system should continue permanently.",
    hi: "डिजिटल उपस्थिति रिपोर्टिंग प्रणाली बहुत उपयोगी है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The system has saved time, resources, and improved administrative workflow. In my opinion, this system should continue permanently.",
    hi: "प्रणाली ने समय और संसाधनों की बचत की है, और प्रशासनिक कार्यप्रवाह में सुधार किया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance Management System has made the submission and monitoring of attendance reports much easier for our department. In my view, this system should be continued permanently.",
    hi: "उपस्थिति प्रबंधन प्रणाली ने हमारे विभाग के लिए उपस्थिति रिपोर्ट जमा करना और उनकी निगरानी करना काफी आसान बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The implementation of this Attendance System has streamlined our departmental work and reduced unnecessary delays. In my opinion, this system should remain in operation permanently.",
    hi: "इस उपस्थिति प्रणाली के लागू होने से हमारे विभाग का कार्य सुव्यवस्थित हुआ है और अनावश्यक देरी कम हुई है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The system has made the process of attendance reporting more transparent and efficient for our department. I strongly recommend that this system should continue permanently.",
    hi: "इस प्रणाली ने हमारे विभाग के लिए उपस्थिति रिपोर्टिंग की प्रक्रिया को अधिक पारदर्शी और प्रभावी बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance System has reduced manual errors and simplified record keeping in our department. In my view, this system should be maintained as a permanent solution.",
    hi: "उपस्थिति प्रणाली ने मैन्युअल त्रुटियों को कम किया है और हमारे विभाग में रिकॉर्ड रखने की प्रक्रिया को सरल बनाया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The digital approach of this Attendance System has improved accuracy and efficiency in managing attendance reports. In my opinion, this system deserves to be continued permanently.",
    hi: "इस उपस्थिति प्रणाली के डिजिटल तरीके ने उपस्थिति रिपोर्ट प्रबंधन में सटीकता और कार्यकुशलता को बेहतर बनाया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance Management System has made coordination between our department and the Salary Section more convenient. I believe this system should remain in use on a permanent basis.",
    hi: "उपस्थिति प्रबंधन प्रणाली ने हमारे विभाग और सैलरी सेक्शन के बीच समन्वय को अधिक सुविधाजनक बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The system has reduced the dependency on manual paperwork and improved overall administrative efficiency. In my opinion, this system should be adopted permanently.",
    hi: "इस प्रणाली ने मैन्युअल कागजी कार्य पर निर्भरता कम की है और समग्र प्रशासनिक कार्यकुशलता में सुधार किया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance System has made the reporting process faster and more organized for our department. I recommend that this system be continued permanently for future use.",
    hi: "उपस्थिति प्रणाली ने हमारे विभाग के लिए रिपोर्टिंग प्रक्रिया को अधिक तेज और व्यवस्थित बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "This system has brought better organization and clarity in attendance reporting within our department. In my view, the continuation of this system on a permanent basis would be beneficial.",
    hi: "इस प्रणाली ने हमारे विभाग में उपस्थिति रिपोर्टिंग को अधिक व्यवस्थित और स्पष्ट बनाया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance System has minimized paperwork and improved the efficiency of administrative tasks in our department. I am of the opinion that this system should continue permanently.",
    hi: "उपस्थिति प्रणाली ने कागजी कार्य को कम किया है और हमारे विभाग में प्रशासनिक कार्यों की कार्यकुशलता को बढ़ाया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The system has made the preparation and submission of attendance reports much more convenient. In my opinion, this system should be retained permanently.",
    hi: "इस प्रणाली ने उपस्थिति रिपोर्ट तैयार करने और जमा करने की प्रक्रिया को काफी अधिक सुविधाजनक बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "This Attendance System has improved the speed and reliability of attendance reporting in our department. I strongly believe this system should continue as a permanent arrangement.",
    hi: "इस उपस्थिति प्रणाली ने हमारे विभाग में उपस्थिति रिपोर्टिंग की गति और विश्वसनीयता को बेहतर बनाया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The digital attendance reporting process has been beneficial and user friendly for our department. In my view, this system should remain a permanent part of the process.",
    hi: "डिजिटल उपस्थिति रिपोर्टिंग प्रक्रिया हमारे विभाग के लिए लाभदायक और उपयोगकर्ता अनुकूल रही है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance Management System has improved administrative workflow and reduced unnecessary workload. I recommend that this system be implemented on a permanent basis.",
    hi: "उपस्थिति प्रबंधन प्रणाली ने प्रशासनिक कार्यप्रवाह को बेहतर बनाया है और अनावश्यक कार्यभार को कम किया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "This system has made attendance documentation more systematic and efficient for our department. In my opinion, the system should continue to operate permanently.",
    hi: "इस प्रणाली ने हमारे विभाग के लिए उपस्थिति दस्तावेजीकरण को अधिक व्यवस्थित और प्रभावी बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance System has enhanced transparency and improved the reporting structure in our department. I believe this system should be continued indefinitely.",
    hi: "उपस्थिति प्रणाली ने पारदर्शिता बढ़ाई है और हमारे विभाग में रिपोर्टिंग संरचना को बेहतर बनाया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The system has helped our department manage attendance records more efficiently and with less effort. In my view, the system should remain permanently in use.",
    hi: "इस प्रणाली ने हमारे विभाग को उपस्थिति रिकॉर्ड अधिक कुशलता और कम प्रयास के साथ प्रबंधित करने में मदद की है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The digital attendance submission system has made the process smoother and more reliable. I strongly support the permanent continuation of this system.",
    hi: "डिजिटल उपस्थिति जमा प्रणाली ने प्रक्रिया को अधिक सुचारु और विश्वसनीय बना दिया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "This Attendance System has reduced complexity and improved the overall reporting process in our department. In my opinion, this system should be continued for the long term.",
    hi: "इस उपस्थिति प्रणाली ने जटिलता को कम किया है और हमारे विभाग में समग्र रिपोर्टिंग प्रक्रिया को बेहतर बनाया है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  },
  {
    en: "The Attendance Management System has proven to be a practical and efficient solution for attendance reporting. I recommend that this system remain permanently in place.",
    hi: "उपस्थिति प्रबंधन प्रणाली उपस्थिति रिपोर्टिंग के लिए एक व्यावहारिक और प्रभावी समाधान साबित हुई है। मेरी राय में, इस प्रणाली को स्थायी रूप से जारी रखा जाना चाहिए।"
  }
];

export default function Attendance() {
  const { toast } = useToast();

  const handleEmailResponse = (data: any) => {
    if (data?.emailStatus === 'failed') {
      if (data?.emailError === 'wrong_email') {
        toast({ variant: "destructive", title: "Email Not Sent", description: "You have provided a wrong email ID. Please replace it with the correct one to get notifications." });
      } else {
        toast({ variant: "destructive", title: "Email Warning", description: "Email not sent." });
      }
    } else if (data?.emailStatus === 'sent') {
      toast({ title: "Email Sent", description: "Notification email sent to department successfully." });
    }
  };

  const department = getCurrentDepartment();
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const [cancelDialogReportId, setCancelDialogReportId] = useState<number | null>(null);

  // Recall countdown state
  const [recallCountdownReportId, setRecallCountdownReportId] = useState<number | null>(null);
  const [recallCountdown, setRecallCountdown] = useState<number>(15);
  const recallCancelledRef = useRef<boolean>(false);

  const [feedbackReport, setFeedbackReport] = useState<AttendanceReport | null>(null);
  const [feedbackSelection, setFeedbackSelection] = useState<'positive' | 'negative' | null>(null);
  const [finalizeReport, setFinalizeReport] = useState<AttendanceReport | null>(null);
  const [randomFeedbackIndex, setRandomFeedbackIndex] = useState<number>(0);

  // Check if cancellation is allowed (only before 23rd of each month)
  const today = new Date();
  const canRequestCancellation = today.getDate() <= 23;

  // Check attendance status for deadline alert (MOVED FROM BELOW)
  const { data: attendanceStatus, isLoading: loadingStatus } = useQuery<{ permitted: boolean; allowSupplementaryReport: boolean; daysRemaining: number; isPastDeadline: boolean }>({
    queryKey: [`/api/departments/${department?.id}/attendance-status`],
    enabled: !!department?.id,
  });

  const [showDeadlineAlert, setShowDeadlineAlert] = useState(false);

  React.useEffect(() => {
    if (attendanceStatus && !loadingStatus) {
      if (attendanceStatus.isPastDeadline && attendanceStatus.permitted === false) {
        setShowDeadlineAlert(true);
      } else {
        setShowDeadlineAlert(false);
      }
    }
  }, [attendanceStatus, loadingStatus]);

  const currentMonthName = today.toLocaleString('default', { month: 'long' });
  const currentYear = today.getFullYear();


  const { data: reports = [], isLoading } = useQuery<AttendanceReport[]>({
    queryKey: [`/api/departments/${department?.id}/attendance`],
    // Sort reports by receiptNo in descending order
    select: (data) => {
      if (!Array.isArray(data)) return [];
      // Sort a shallow copy to avoid potential mutation issues
      return [...data].sort((a, b) => {
        const aValue = a.receiptNo ?? -Infinity; // Treat null/undefined as lowest
        const bValue = b.receiptNo ?? -Infinity;
        return bValue - aValue; // Descending order
      });
    },
  });

  const { data: entries = [], isLoading: loadingEntries } = useQuery<AttendanceEntry[]>({
    queryKey: [`/api/attendance/${selectedReport}/entries`],
    enabled: !!selectedReport,
    select: (data: any) => Array.isArray(data) ? data : [],
  });

  const createReport = useMutation({
    mutationFn: async (data: any) => {
      const formattedData = {
        departmentId: department?.id,
        month: parseInt(data.month),
        year: parseInt(data.year),
        status: "draft",
        totalEmployees: data.entries.length,
      };

      const response = await apiRequest(
        "POST",
        `/api/departments/${department?.id}/attendance`,
        formattedData,
      );

      const report = await response.json();

      for (const entry of data.entries) {
        if (!entry.periods || entry.periods.length === 0) continue;

        const periods = entry.periods.map((period: any) => ({
          fromDate: period.fromDate,
          toDate: period.toDate,
          days: period.days,
          remarks: period.remarks || "",
        }));

        await apiRequest("POST", `/api/attendance/${report.id}/entries`, {
          employeeId: entry.employeeId,
          periods,
        });
      }
      return report;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/departments/${department?.id}/attendance`],
      });
      setIsCreatingReport(false);
      toast({
        title: "Success",
        description: "Attendance report created successfully",
      });
      if (data) handleEmailResponse(data);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create attendance report",
      });
    },
  });

  const handleUpload = async (
    file: File,
    reportId: number,
    despatchDetails?: DespatchDetails,
  ) => {
    try {

      // Based on server code examination, the server uses multer with the following format:
      // file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + original extension
      // The fieldname is "file" for single file uploads
      // We'll use the standard FormData to let the server handle naming as it normally does

      const formData = new FormData();
      formData.append("file", file);


      const uploadResponse = await fetch(`/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        console.error("General upload failed with status:", uploadResponse.status);
        const errorText = await uploadResponse.text();
        console.error("Upload error response:", errorText);
        throw new Error("Failed to upload PDF file");
      }

      // Parse the upload response to get the file URL
      const uploadData = await uploadResponse.json();

      // Extract the server-generated filename from the response
      // The server might return either { fileUrl: "/uploads/filename" } or { imageUrl: "/uploads/filename" }
      let fileUrlToSave = '';

      if (uploadData?.fileUrl) {
        fileUrlToSave = uploadData.fileUrl;
      } else if (uploadData?.imageUrl) {
        fileUrlToSave = uploadData.imageUrl;
      } else {
        // Try a few common fields from server response
        const possibleFields = ['url', 'path', 'file', 'filePath', 'location'];

        for (const field of possibleFields) {
          if (uploadData && uploadData[field]) {
            fileUrlToSave = uploadData[field];
            break;
          }
        }

        // If we still don't have a URL, check if uploadData itself is a string URL
        if (!fileUrlToSave && typeof uploadData === 'string' && (uploadData.startsWith('/') || uploadData.startsWith('http'))) {
          fileUrlToSave = uploadData;
        }

        // Last resort: Log the issue if no URL is found. An error will be thrown later if fileUrlToSave is still empty.
        if (!fileUrlToSave) {
          console.error("Server response doesn't contain recognizable URL fields:", uploadData);
        }
      }

      if (!fileUrlToSave) {
        throw new Error("Server did not return a recognizable file URL");
      }


      // Verify the file is accessible at the exact URL the server provided
      try {
        const verifyResponse = await fetch(fileUrlToSave, {
          method: 'HEAD',
          cache: 'no-cache'
        });


        if (!verifyResponse.ok) {
          console.warn("Warning: Could not verify file at the server URL. Status:", verifyResponse.status);
        } else {
        }
      } catch (error) {
        console.error("Error verifying file existence:", error);
      }

      // Step 2: Now update the attendance report with our consistent filename URL

      // Update the updatePayload to use this URL
      const updatePayload = {
        status: "sent",
        fileUrl: fileUrlToSave,
        despatchNo: despatchDetails?.despatchNo || '',
        despatchDate: despatchDetails?.despatchDate ? new Date(despatchDetails.despatchDate) : new Date(),
        receiptDate: new Date(),
      };


      const updateResponse = await fetch(`/api/attendance/${reportId}`, {
        method: "PATCH",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        console.error("Report update failed with status:", updateResponse.status);
        const errorText = await updateResponse.text();
        console.error("Update error response:", errorText);
        throw new Error("Failed to update report with file URL");
      }

      const updateData = await updateResponse.json();

      // Update local state
      setUploadedPdfUrl(fileUrlToSave);
      setSelectedReport(reportId);

      // Force a refetch of the reports data to ensure UI is updated
      await queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      await queryClient.refetchQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });

      toast({
        title: "Success",
        description: "PDF uploaded successfully",
      });

      handleEmailResponse(updateData);

      return { fileUrl: fileUrlToSave, report: updateData };
    } catch (error) {
      console.error("Error in handleUpload:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload PDF",
      });
      throw error;
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatPeriod = (year: number, month: number) => {
    return new Date(year, month - 1).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "default";
      case "submitted":
        return "secondary";
      case "sent":
        return "success";
      case "cancel_requested":
      case "recall_requested":
        return "outline"; // Yellow/orange indicator
      case "cancelled":
        return "destructive";
      default:
        return "default";
    }
  };



  const deleteAttendance = useMutation({
    mutationFn: async (reportId: number) => {
      await apiRequest("DELETE", `/api/attendance/${reportId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Attendance report deleted",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete attendance report",
      });
    },
  });

  const changeStatus = useMutation({
    mutationFn: async (report: AttendanceReport) => {
      const res = await apiRequest("PATCH", `/api/attendance/${report.id}`, { status: "submitted" });
      return res.json();
    },
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/attendance/${variables.id}`] });
      toast({
        title: "Success",
        description: "Report submitted successfully",
      });
      if (data) handleEmailResponse(data);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit report",
      });
    },
  });

  const requestCancellation = useMutation({
    mutationFn: async (reportId: number) => {
      const res = await apiRequest("POST", `/api/attendance/${reportId}/request-cancel`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setCancelDialogReportId(null); // Close the dialog
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "Success",
        description: "Cancellation request sent to admin",
      });
      if (data) handleEmailResponse(data);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to request cancellation",
      });
    },
  });

  // Direct Revert mutation (no admin approval needed — calls revert-to-draft directly)
  const directRevert = useMutation({
    mutationFn: async (reportId: number) => {
      const res = await apiRequest("POST", `/api/attendance/${reportId}/revert-to-draft`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/departments/${department?.id}/attendance`] });
      toast({
        title: "✅ Recall Successful",
        description: "Your request has been accepted. You can now recreate, edit or delete this attendance report.",
        duration: 5000,
      });
      if (data) handleEmailResponse(data);
      setTimeout(() => window.location.reload(), 1800);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Recall Failed",
        description: error.message || "Failed to recall report. Please try again.",
      });
    },
  });

  // Countdown effect — triggers directRevert when countdown reaches 0
  useEffect(() => {
    if (recallCountdownReportId === null) return;

    setRecallCountdown(15);
    recallCancelledRef.current = false;
    const capturedReportId = recallCountdownReportId;

    let remaining = 15;
    const interval = setInterval(() => {
      remaining -= 1;
      setRecallCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        if (!recallCancelledRef.current) {
          setRecallCountdownReportId(null);
          directRevert.mutate(capturedReportId);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [recallCountdownReportId]);

  const [editingReportData, setEditingReportData] = useState<any>(null);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);

  const editReport = useMutation({
    mutationFn: async ({ reportId, data }: { reportId: number; data: any }) => {

      // 1. Update report metadata (month, year)
      await apiRequest("PATCH", `/api/attendance/${reportId}`, {
        month: parseInt(data.month),
        year: parseInt(data.year),
      });

      // 2. Clear existing entries completely
      await apiRequest("POST", `/api/attendance/${reportId}/clear-entries`);

      // 3. Re-create entries
      for (const entry of data.entries) {
        if (!entry.periods || entry.periods.length === 0) continue;

        const periods = entry.periods.map((period: any) => ({
          fromDate: period.fromDate,
          toDate: period.toDate,
          days: period.days,
          remarks: period.remarks || "",
        }));

        await apiRequest("POST", `/api/attendance/${reportId}/entries`, {
          employeeId: entry.employeeId,
          periods,
        });
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate the general list
      queryClient.invalidateQueries({
        queryKey: [`/api/departments/${department?.id}/attendance`],
      });
      // Invalidate the specific report entries (CRITICAL for View Details to show new data)
      queryClient.invalidateQueries({
        queryKey: [`/api/attendance/${variables.reportId}/entries`],
      });
      // Invalidate specific report details
      queryClient.invalidateQueries({
        queryKey: [`/api/attendance/${variables.reportId}`],
      });
      // Invalidate admin report details (used by report-details page)
      queryClient.invalidateQueries({
        queryKey: [`/api/admin/attendance/${variables.reportId}`],
      });

      setIsCreatingReport(false);
      setEditingReportData(null);
      setEditingReportId(null);
      toast({
        title: "Success",
        description: "Attendance report updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("[editReport] Error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update attendance report",
      });
    },
  });

  const handleEditClick = async (report: AttendanceReport) => {
    try {
      // Fetch entries for this report
      const res = await apiRequest("GET", `/api/attendance/${report.id}/entries`);
      const entries = await res.json();

      // Parse JSON periods if they are strings (schema says periods is text/JSON)
      const parsedEntries = entries.map((entry: any) => ({
        ...entry,
        periods: typeof entry.periods === 'string' ? JSON.parse(entry.periods) : entry.periods
      }));

      const formData = {
        month: String(report.month),
        year: String(report.year),
        entries: parsedEntries.map((entry: any) => ({
          employeeId: entry.employeeId,
          periods: entry.periods
        }))
      };

      setEditingReportId(report.id);
      setEditingReportData(formData);
      setIsCreatingReport(true);
    } catch (error) {
      console.error("Failed to fetch report details for editing", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load report details",
      });
    }
  };



  // Calculate deadline countdown (reusing 'today' from above)
  const deadlineDay = 15;
  const currentDay = today.getDate();
  const daysRemaining = deadlineDay - currentDay;
  const isPastDeadline = currentDay > deadlineDay;


  // Check attendance status for department
  // Moved to top of component to support alert logic


  // Check if a report already exists for the current month (and is not cancelled)
  // Note: 'today' is defined above
  const currentMonthYear = today.getFullYear();
  const currentMonthIdx = today.getMonth() + 1;
  const existingReport = reports?.find(r => r.year === currentMonthYear && r.month === currentMonthIdx && r.status !== 'cancelled');

  // Logic for canCreateReport:
  // 1. If department is explicitly permitted by admin (permitted === true): ignore deadline
  // 2. If department is NOT permitted (permitted === false): ALWAYS disable (regardless of deadline)
  // 3. If permitted is undefined (loading/error): respect deadline as fallback
  // 
  // ADDITIONALLY: If existingReport exists, check allowSupplementaryReport
  const canCreateReport = attendanceStatus?.permitted === true
    ? (!existingReport || attendanceStatus?.allowSupplementaryReport) // Permitted: ignore deadline, check if report exists OR supp allowed
    : attendanceStatus?.permitted === false
      ? false  // Explicitly NOT permitted: always disable
      : (!isPastDeadline && (!existingReport || attendanceStatus?.allowSupplementaryReport));  // Undefined/loading: respect deadline, check existing report OR supp allowed

  // Override canRequestCancellation: allow if permitted OR before 23rd
  // Note: canRequestCancellation was initially defined above as today.getDate() <= 23
  // Now we override it to also allow when department has special permission
  const canRequestCancellationFinal = canRequestCancellation || attendanceStatus?.permitted === true;

  if (isLoading || loadingEntries) return <Loading />;

  return (
    <div className="flex min-h-screen">
      <Sidebar className="w-64 border-r" />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          {/* Countdown Banner - show when permitted OR when deadline has passed */}
          {(attendanceStatus?.permitted !== false || isPastDeadline) && (
            <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${isPastDeadline
              ? (attendanceStatus?.permitted === true
                ? 'bg-green-100 border border-green-300 text-green-800'  // Permitted after deadline - show green
                : 'bg-red-100 border border-red-300 text-red-800')
              : daysRemaining <= 5
                ? 'bg-orange-100 border border-orange-300 text-orange-800'
                : 'bg-blue-100 border border-blue-300 text-blue-800'
              }`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">📅</span>
                {isPastDeadline ? (
                  <span className="font-medium">
                    {attendanceStatus?.permitted === true
                      ? "⚠️ Deadline passed! Attendance report submission deadline was 15th. (Special permission granted)"
                      : "⚠️ Deadline passed! Attendance report submission deadline was 15th."
                    }
                  </span>
                ) : (
                  <span className="font-medium">
                    {daysRemaining === 0
                      ? "🔔 Today is the last day to submit attendance report!"
                      : `⏳ ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining to submit attendance report (Deadline: 15th)`
                    }
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Existing Report Warning Banner */}
          {existingReport && !isPastDeadline && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 flex items-center gap-2">
              <span className="text-xl">ℹ️</span>
              <span className="font-medium">
                You have already created a report for this month ({existingReport.status}).
                {existingReport.status === 'draft' && " Please delete the existing draft to create a new one."}
                {(existingReport.status === 'submitted' || existingReport.status === 'recall_requested') && " Please recall the report to modify it."}
                {existingReport.status === 'sent' && " Please request cancellation to create a new one."}
              </span>
            </div>
          )}

          {/* Permission blocked message - only show BEFORE deadline passes */}
          {attendanceStatus?.permitted === false && !isPastDeadline && (
            <div className="mb-4 p-4 bg-orange-50 border border-orange-300 rounded-lg text-orange-800">
              <span className="font-medium">⚠️ Currently, the facility to submit attendance reports is not available.</span>
            </div>
          )}

          {/* Supplementary Report Allowed Banner */}
          {attendanceStatus?.allowSupplementaryReport && existingReport && (
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 flex items-center gap-2">
              <span className="text-xl">✨</span>
              <span className="font-medium">
                You have been granted one-time permission to create a supplementary attendance report for this month.
              </span>
            </div>
          )}


          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Attendance Reports</h1>
            <Dialog open={isCreatingReport} onOpenChange={setIsCreatingReport}>
              <DialogTrigger asChild>
                <Button
                  className="bg-gradient-to-r from-primary to-primary/90 hover:to-primary"
                  disabled={!canCreateReport}
                  title={
                    !canCreateReport
                      ? (existingReport
                        ? (existingReport.status === 'draft' ? "Draft report already exists. Please delete it to create new."
                          : existingReport.status === 'submitted' || existingReport.status === 'recall_requested' ? "Report submitted. Use 'Recall' to modify."
                            : attendanceStatus?.allowSupplementaryReport ? "Create Supplementary Report" : "Report sent. Request cancellation to recreate or ask Admin for supplementary permission.")
                        : (isPastDeadline && attendanceStatus?.permitted !== true)
                          ? "Deadline passed"
                          : "Attendance submission disabled")
                      : (existingReport ? "Create Supplementary Report" : "Create new report")
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Report
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-[95vw] w-[1400px] max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle className="text-xl font-semibold">
                    {editingReportId ? "Edit Attendance Report" : "Create Attendance Report"}
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-auto flex-grow pr-1">

                  <AttendanceForm
                    onSubmit={async (data) => {
                      try {
                        if (editingReportId) {
                          await editReport.mutateAsync({ reportId: editingReportId, data });
                        } else {
                          await createReport.mutateAsync(data);
                        }
                      } catch (error) {
                        console.error("Failed to create/update report:", error);
                      }
                    }}
                    isLoading={createReport.isPending || editReport.isPending}
                    initialData={editingReportData}
                    isSupplementary={!!(existingReport && attendanceStatus?.allowSupplementaryReport)}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rec. No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Despatch Details</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports?.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      {report.receiptNo || "-"}
                    </TableCell>
                    <TableCell>
                      {report.receiptDate ? formatDate(report.receiptDate) : "-"}
                    </TableCell>
                    <TableCell>
                      {formatPeriod(report.year, report.month)}
                    </TableCell>
                    <TableCell>
                      {report.transactionId ? (
                        report.status === "sent" ? (
                          report.transactionId
                        ) : (
                          <>
                            <span className="print:hidden font-mono tracking-widest text-muted-foreground">***</span>
                            <span className="hidden print:inline">{report.transactionId}</span>
                          </>
                        )
                      ) : (
                        "Not generated"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusColor(report.status)}
                        className={report.status === "sent" ? "font-bold text-green-600" : ""}
                      >
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(report.status === "sent" || report.status === "cancelled" || report.status === "cancel_requested") && report.despatchNo ? (
                        <div className="text-sm">
                          <p>
                            <span className="font-medium">No:</span> {report.despatchNo}
                          </p>
                          <p>
                            <span className="font-medium">Date:</span>{" "}
                            {formatDate(report.despatchDate!)}
                          </p>
                        </div>
                      ) : (
                        "-"
                      )}

                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {report.status === "draft" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(report)}
                              title="Edit Report"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit mr-2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
                              </svg>
                              Edit
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Delete Report</DialogTitle>
                                  <DialogDescription>
                                    Are you sure you want to delete this
                                    attendance report? This action cannot be
                                    undone.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                  </DialogClose>
                                  <Button
                                    variant="destructive"
                                    onClick={() => deleteAttendance.mutate(report.id)}
                                    disabled={deleteAttendance.isPending}
                                  >
                                    {deleteAttendance.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                      </>
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <Button
                              size="sm"
                              disabled={changeStatus.isPending}
                              onClick={() => {
                                setFinalizeReport(report);
                              }}
                            >
                              {changeStatus.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <FileCheck className="h-4 w-4 mr-2" />
                              )}
                              Finalize
                            </Button>
                          </>
                        )}
                        {report.status !== "draft" && (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  title={report.fileUrl || report.status === "sent" ? "View Signed Attendance Report" : "Upload Signed Attendance Report"}
                                  className={!report.fileUrl && report.status === "submitted" ? "min-w-[195px] border-amber-500 text-amber-700 bg-amber-50 relative overflow-hidden" : ""}
                                >
                                  {report.fileUrl || report.status === "sent" ? (
                                    <>
                                      <Eye className="h-4 w-4 mr-2" /> View Signed Report
                                    </>
                                  ) : (
                                    report.status === "submitted" && !report.fileUrl ? (
                                      <>
                                        <span className="invisible flex items-center"><Upload className="h-4 w-4 mr-2" /> Upload Signed Report</span>
                                        <span className="animate-fade-swap-a absolute inset-0 flex items-center justify-center">
                                          <Upload className="h-4 w-4 mr-2" /> Upload Signed Report
                                        </span>
                                        <span className="animate-fade-swap-b inset-0 flex items-center justify-center text-amber-600 font-bold tracking-wider">
                                          Waiting ....
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="h-4 w-4 mr-2" /> Upload Signed Report
                                      </>
                                    )
                                  )}
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <PDFDialogContent
                                  report={report}
                                  department={department}
                                  handleUpload={handleUpload}
                                  formatDate={formatDate}
                                  toast={toast}
                                />
                              </DialogContent>
                            </Dialog>
                          </>
                        )}
                        {/* Request to Cancel button for sent reports - only for CURRENT MONTH and (before 23rd OR with special permission) */}
                        {report.status === "sent" && canRequestCancellationFinal && report.year === currentMonthYear && report.month === currentMonthIdx && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-orange-600 border-orange-300 hover:bg-orange-50"
                              onClick={() => setCancelDialogReportId(report.id)}
                            >
                              Request to Cancel
                            </Button>
                            <Dialog open={cancelDialogReportId === report.id} onOpenChange={(open) => !open && setCancelDialogReportId(null)}>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Request Cancellation</DialogTitle>
                                  <DialogDescription>
                                    Are you sure you want to request cancellation of this report?
                                    This will send a request to the admin for approval.
                                    The entries will be deleted but the PDF and receipt number will be preserved.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setCancelDialogReportId(null)}>Cancel</Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => requestCancellation.mutate(report.id)}
                                    disabled={requestCancellation.isPending}
                                  >
                                    {requestCancellation.isPending ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Requesting...
                                      </>
                                    ) : (
                                      "Request Cancellation"
                                    )}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}
                        {/* Show when cancellation not allowed (after 23rd AND no special permission) - ONLY for current month */}
                        {report.status === "sent" && !canRequestCancellationFinal && report.year === currentMonthYear && report.month === currentMonthIdx && (
                          <span className="text-xs text-gray-500">
                            Cancel N/A after 23rd
                          </span>
                        )}
                        {/* Request Recall for Submitted reports — instant countdown, no admin approval */}
                        {report.status === "submitted" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-yellow-600 border-yellow-300 hover:bg-yellow-50"
                            onClick={() => {
                              recallCancelledRef.current = false;
                              setRecallCountdownReportId(report.id);
                            }}
                          >
                            Request Recall
                          </Button>
                        )}
                        {/* Show status for cancel_requested and cancelled */}
                        {report.status === "cancel_requested" && (
                          <span className="text-sm font-medium text-orange-600">
                            ⏳ Cancellation Pending
                          </span>
                        )}
                        {report.status === "cancelled" && (
                          <span className="text-sm font-medium text-green-600">
                            ✅ Cancellation Accepted
                          </span>
                        )}

                        {/* View Details button - hidden for cancelled and draft reports */}
                        {report.status !== "cancelled" && report.status !== "draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/dashboard/reports/${report.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {report.status === "submitted" || report.status === "sent"
                              ? "View / Print Final Report"
                              : "View Draft Report"}
                          </Button>
                        )}

                      </div>

                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </main>
      </div>

      {/* Feedback Modal */}
      <Dialog open={!!feedbackReport} onOpenChange={(open) => !open && setFeedbackReport(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Department Feedback on Attendance System / उपस्थिति प्रणाली पर विभाग की प्रतिक्रिया</DialogTitle>
            <DialogDescription asChild>
              <div className="pt-3 text-sm text-foreground space-y-3">
                <p>
                  This Attendance Management System was introduced on a trial basis to simplify the submission of attendance reports.<br />
                  Your department's feedback is important to evaluate whether the system should continue in the future.<br />
                  <span className="text-muted-foreground mt-1 block">यह उपस्थिति प्रबंधन प्रणाली (Attendance Management System) उपस्थिति रिपोर्ट जमा करने की प्रक्रिया को सरल बनाने के लिए परीक्षण (trial) के आधार पर शुरू की गई थी। इस प्रणाली को भविष्य में जारी रखा जाना चाहिए या नहीं, इसका मूल्यांकन करने के लिए आपके विभाग की प्रतिक्रिया (feedback) महत्वपूर्ण है।</span>
                </p>
                <p className="font-medium text-amber-900 mt-4">
                  Kindly select your department's recommendation regarding this system.<br />
                  <span className="text-sm font-normal">कृपया इस प्रणाली के संबंध में अपने विभाग की अनुशंसा (recommendation) चुनें।</span>
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div
                    className={`p-4 border rounded-md cursor-pointer transition-colors ${feedbackSelection === 'positive' ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : 'hover:bg-muted'}`}
                    onClick={() => setFeedbackSelection('positive')}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-1">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${feedbackSelection === 'positive' ? 'border-green-600 border-4' : 'border-input'}`}></div>
                      </div>
                      <div>
                        <p className="font-bold mb-1 text-[15px] text-green-700">Option 1 - Positive Recommendation<br /><span className="text-sm font-medium">विकल्प 1 - सकारात्मक अनुशंसा</span></p>
                        <p className="text-sm text-muted-foreground mt-2">{POSITIVE_REMARKS[randomFeedbackIndex].en}</p>
                        <p className="text-sm text-muted-foreground mt-2 border-t pt-2">{POSITIVE_REMARKS[randomFeedbackIndex].hi}</p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 border rounded-md cursor-pointer transition-colors ${feedbackSelection === 'negative' ? 'border-red-600 bg-red-50 ring-1 ring-red-600' : 'hover:bg-muted'}`}
                    onClick={() => setFeedbackSelection('negative')}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-1">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${feedbackSelection === 'negative' ? 'border-red-600 border-4' : 'border-input'}`}></div>
                      </div>
                      <div>
                        <p className="font-bold mb-1 text-[15px] text-red-700">Option 2 - Negative Recommendation<br /><span className="text-sm font-medium">विकल्प 2 - नकारात्मक अनुशंसा</span></p>
                        <p className="text-sm text-muted-foreground mt-2">The Attendance System should be discontinued after the trial period and the previous manual system should be continued.</p>
                        <p className="text-sm text-muted-foreground mt-2 border-t pt-2">परीक्षण अवधि के बाद उपस्थिति प्रणाली को बंद कर दिया जाना चाहिए और पिछली मैन्युअल प्रणाली को जारी रखा जाना चाहिए।</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setFeedbackReport(null)}>Cancel</Button>
            <Button
              disabled={!feedbackSelection}
              onClick={() => {
                if (feedbackReport) {
                  if (feedbackSelection === 'positive') {
                    localStorage.setItem(`feedback_remark_${feedbackReport.id}`, `Positive: ${POSITIVE_REMARKS[randomFeedbackIndex].en}`);
                  } else {
                    localStorage.setItem(`feedback_remark_${feedbackReport.id}`, "Negative: ----");
                  }
                  setFinalizeReport(feedbackReport);
                  setFeedbackReport(null);
                }
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize Dialog */}
      <Dialog open={!!finalizeReport} onOpenChange={(open) => !open && setFinalizeReport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Attendance Report</DialogTitle>
            <DialogDescription asChild>
              <div className="pt-3 text-sm text-foreground space-y-3">
                <p>
                  <strong>Please note the next steps:</strong>
                </p>
                <p>
                  1. Now please print the submitted report, get it signed by the HOD, and write the dispatch number and date on the attendance report.
                </p>
                <p>
                  2. After that, return here to upload the signed report. As soon as you upload the signed report and fill in the dispatch details and click the submit button, the attendance report will be sent to the Salary Section.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setFinalizeReport(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (finalizeReport) {
                  changeStatus.mutate(finalizeReport);
                  setFinalizeReport(null);
                }
              }}
              disabled={changeStatus.isPending}
            >
              I Understand, Finalize Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deadline Passed Alert Modal */}
      <Dialog open={showDeadlineAlert} onOpenChange={setShowDeadlineAlert}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-0 shadow-lg">
          <div className="bg-red-600 p-6 text-center text-white">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold uppercase tracking-wide">DEADLINE PASSED</h2>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <h3 className="font-bold text-lg text-gray-900">Aligarh Muslim University</h3>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Salary Section – Attendance Alert</p>

              <p className="mx-auto text-gray-700">
                Attendance submission deadline for <span className="font-bold">{currentMonthName} {currentYear}</span> was <span className="font-bold text-red-600">15 {currentMonthName}</span>. The deadline has now passed.
              </p>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 text-sm text-blue-800 mt-4">
              <p>
                Attendance portal will be reopened on <strong>20th of this month</strong> (or the next working day if 20th is a Sunday or Holiday) for a few hours. Departments who have not created their attendance can submit their attendance during this available time window.
              </p>
            </div>

            <div className="flex justify-center mt-6">
              <Button
                className="bg-gray-800 hover:bg-gray-900 text-white w-full py-6 text-lg"
                onClick={() => setShowDeadlineAlert(false)}
              >
                Continue to Dashboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Recall Countdown Overlay ── */}
      {recallCountdownReportId !== null && (() => {
        const TOTAL = 15;
        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const progress = recallCountdown / TOTAL;
        const dashOffset = circumference * (1 - progress);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <div
              className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4 text-center"
              style={{ animation: 'fadeInScale 0.25s ease' }}
            >
              {/* Title */}
              <h2 className="text-xl font-bold text-gray-800 mb-1">Recalling Report</h2>
              <p className="text-sm text-muted-foreground mb-6">
                The report will revert to <strong>draft</strong> automatically. Click cancel to stop.
              </p>

              {/* Circular clock */}
              <div className="relative mx-auto mb-6" style={{ width: 140, height: 140 }}>
                <svg
                  width="140" height="140"
                  viewBox="0 0 120 120"
                  style={{ transform: 'rotate(-90deg)' }}
                >
                  {/* Track */}
                  <circle
                    cx="60" cy="60" r={radius}
                    fill="none"
                    stroke="#f3f4f6"
                    strokeWidth="10"
                  />
                  {/* Progress arc */}
                  <circle
                    cx="60" cy="60" r={radius}
                    fill="none"
                    stroke={recallCountdown <= 5 ? '#ef4444' : '#f59e0b'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
                  />
                </svg>
                {/* Centre number */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center"
                >
                  <span
                    className="font-bold leading-none"
                    style={{
                      fontSize: 42,
                      color: recallCountdown <= 5 ? '#ef4444' : '#f59e0b',
                      transition: 'color 0.3s ease'
                    }}
                  >
                    {recallCountdown}
                  </span>
                  <span className="text-xs text-gray-400 mt-1">seconds</span>
                </div>
              </div>

              {/* Status text */}
              <p className="text-xs text-gray-500 mb-5">
                {recallCountdown > 5
                  ? '⏳ Processing your recall request...'
                  : '⚠️ Almost done! Click cancel to stop.'}
              </p>

              {/* Cancel button */}
              <Button
                variant="outline"
                className="w-full border-red-300 text-red-600 hover:bg-red-50 font-semibold"
                onClick={() => {
                  recallCancelledRef.current = true;
                  setRecallCountdownReportId(null);
                }}
              >
                Cancel
              </Button>
            </div>

            {/* Keyframe injection */}
            <style>{`
              @keyframes fadeInScale {
                from { opacity: 0; transform: scale(0.88); }
                to   { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </div>
        );
      })()}
    </div>
  );
}