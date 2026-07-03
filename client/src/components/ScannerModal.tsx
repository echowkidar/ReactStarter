import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Scan, Download, CheckCircle, AlertCircle, RefreshCw, FileImage, FileText, Check, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ScannerStatus = "idle" | "connecting" | "connected" | "no-helper" | "no-scanner" | "offline" | "scanning" | "done";

export interface Scanner {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface ScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: (file: File) => void;
  downloadUrl?: string; // e.g. "/api/public/download-scanner-helper"
}

export default function ScannerModal({ open, onOpenChange, onScanComplete, downloadUrl = "/api/public/download-scanner-helper" }: ScannerModalProps) {
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>("idle");
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [selectedScanner, setSelectedScanner] = useState<string>("");
  const [scanFormat, setScanFormat] = useState<"image" | "pdf">("pdf");
  const [scannedPages, setScannedPages] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const scanFormatRef = useRef<"image" | "pdf">("pdf");
  const scannedPagesRef = useRef<string[]>([]);
  
  const { toast } = useToast();

  useEffect(() => {
    scanFormatRef.current = scanFormat;
  }, [scanFormat]);

  useEffect(() => {
    scannedPagesRef.current = scannedPages;
  }, [scannedPages]);

  useEffect(() => {
    if (open) {
      connectToScannerHelper();
    } else {
      closeConnection();
    }
    return () => {
      closeConnection();
    };
  }, [open]);

  function closeConnection() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setScannerStatus("idle");
    setScanners([]);
    setScannedPages([]);
  }

  function connectToScannerHelper() {
    setScannerStatus("connecting");
    setScanners([]);

    try {
      const ws = new WebSocket("ws://localhost:8765");
      wsRef.current = ws;
      
      const timeout = setTimeout(() => { 
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close(); 
          setScannerStatus("no-helper"); 
        }
      }, 3000);

      ws.onopen = () => { 
        clearTimeout(timeout); 
        ws.send(JSON.stringify({ action: "list-scanners" })); 
      };
      
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "scanners") {
            if (!msg.scanners?.length) {
              setScannerStatus("no-scanner");
            } else {
              setScanners(msg.scanners);
              const def = msg.scanners.find((s: Scanner) => s.isDefault) ?? msg.scanners[0];
              setSelectedScanner(def.id);
              setScannerStatus("connected");
            }
          } else if (msg.type === "scan-result") {
            const base64Data = msg.data;
            if (scanFormatRef.current === "image") {
              setScannerStatus("done");
              const blob = new Blob([Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))], { type: "image/png" });
              const file = new File([blob], "scanned_document.png", { type: "image/png" });
              onScanComplete(file);
              onOpenChange(false);
            } else {
              setScannedPages(prev => [...prev, base64Data]);
              setScannerStatus("connected"); // Ready for next page
            }
          } else if (msg.type === "error") {
            setScannerStatus("offline");
          }
        } catch (e) {
          console.error("Scanner message error", e);
        }
      };
      
      ws.onerror = () => { 
        clearTimeout(timeout); 
        setScannerStatus("no-helper"); 
      };
    } catch { 
      setScannerStatus("no-helper"); 
    }
  }

  function triggerScan() {
    if (wsRef.current?.readyState === WebSocket.OPEN && selectedScanner) {
      setScannerStatus("scanning");
      wsRef.current.send(JSON.stringify({ action: "scan", scannerId: selectedScanner }));
    }
  }

  async function finishPdfScan() {
    if (scannedPages.length === 0) return;
    
    setScannerStatus("done");
    try {
      const pdfLib = await import("@cantoo/pdf-lib");
      const PDFDocument = pdfLib.PDFDocument || (pdfLib as any).default?.PDFDocument;
      
      const imageCompression = (await import("browser-image-compression")).default;

      if (!PDFDocument) {
        throw new Error("PDFDocument could not be loaded");
      }
      
      const pdfDoc = await PDFDocument.create();
      
      for (const base64 of scannedPages) {
        // Safe base64 to Uint8Array conversion without using fetch (which can fail on large data URIs)
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const imageBytesRaw = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          imageBytesRaw[i] = binaryString.charCodeAt(i);
        }
        
        const imageBlob = new Blob([imageBytesRaw], { type: "image/png" });
        
        // Compress and convert to JPEG to save massive amounts of memory
        const compressedFile = await imageCompression(new File([imageBlob], "scan.png", { type: "image/png" }), {
          maxSizeMB: 1, // Max 1MB per page
          maxWidthOrHeight: 1600, // Reasonable resolution for documents
          useWebWorker: true,
          fileType: "image/jpeg"
        });
        
        const compressedBuffer = await compressedFile.arrayBuffer();
        const imageBytes = new Uint8Array(compressedBuffer);
        
        // Embed the compressed JPEG instead of the massive PNG
        const image = await pdfDoc.embedJpg(imageBytes);
        const { width, height } = image;
        
        // A4 size is typically 595.28 x 841.89 points
        const a4Width = 595.28;
        const a4Height = 841.89;
        
        const page = pdfDoc.addPage([a4Width, a4Height]);
        
        // Scale image to fit A4
        const scale = Math.min(a4Width / width, a4Height / height);
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        
        // Center the image
        const x = (a4Width - scaledWidth) / 2;
        const y = (a4Height - scaledHeight) / 2;
        
        page.drawImage(image, {
          x, y, width: scaledWidth, height: scaledHeight
        });
      }
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const file = new File([blob], "scanned_document.pdf", { type: "application/pdf" });
      onScanComplete(file);
      onOpenChange(false);
      setScannedPages([]);
    } catch (error: any) {
      console.error("Failed to create PDF", error);
      toast({ 
        title: "PDF Creation Failed", 
        description: `Error: ${error?.message || String(error)}`, 
        variant: "destructive" 
      });
      setScannerStatus("connected");
    }
  }

  function downloadHelper() {
    toast({ title: "✅ Download Started", description: "After downloading, double-click AMU_Scanner_Helper.exe to install and run it." });
    window.location.href = downloadUrl;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-indigo-800">
            <Scan className="w-5 h-5" /> Scan Document
          </DialogTitle>
          <DialogDescription>
            Place the physical document on the scanner, then click "Scan Now".
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {scannerStatus === "connecting" && (
            <div className="flex flex-col items-center justify-center py-6 gap-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="w-8 h-8 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-700">Connecting to Scanner Helper…</p>
            </div>
          )}

          {scannerStatus === "no-helper" && (
            <div className="flex flex-col items-center text-center p-6 bg-red-50 text-red-700 rounded-lg border border-red-100">
              <AlertCircle className="w-10 h-10 mb-3 text-red-500 opacity-80" />
              <h4 className="font-bold mb-1">Scanner Helper Not Running</h4>
              <p className="text-xs opacity-90 mb-4 px-4">
                We couldn't connect to the local scanner helper. Make sure it's installed and running on your PC.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={connectToScannerHelper} className="bg-white border-red-200 text-red-700 hover:bg-red-50">
                  <RefreshCw className="w-3 h-3 mr-2" /> Retry Connection
                </Button>
                <Button size="sm" onClick={downloadHelper} className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
                  <Download className="w-3 h-3 mr-2" /> Download Helper
                </Button>
              </div>
            </div>
          )}

          {scannerStatus === "connected" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-2 rounded-md border border-emerald-100">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-semibold text-emerald-700">Scanner Helper is running</span>
                <span className="text-[10px] text-emerald-500 ml-auto bg-emerald-100 px-2 py-0.5 rounded-full">port 8765</span>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-600 font-medium">Select scanner to use:</p>
                <div className="max-h-[150px] overflow-y-auto space-y-2 pr-1 rounded-md">
                  {scanners.map(s => {
                    const isSelected = selectedScanner === s.id;
                    return (
                      <label key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                        <input type="radio" name="scanner" value={s.id} checked={isSelected}
                          onChange={() => setSelectedScanner(s.id)} className="accent-indigo-600" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate">{s.name.split('(')[0]}</div>
                          <div className="text-[10px] text-slate-500 truncate opacity-70 mt-0.5 font-mono">{s.id.split('\\')[1] || s.id}</div>
                        </div>
                        {s.isDefault && (
                          <span className="text-[10px] font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">Default</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-600 font-medium">Output Format:</p>
                <div className="flex gap-2">
                  <label className={`flex-1 flex flex-col items-center p-3 border rounded-lg cursor-pointer transition-all ${scanFormat === 'pdf' ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'hover:bg-slate-50'}`}>
                    <input type="radio" name="format" value="pdf" checked={scanFormat === 'pdf'} onChange={() => setScanFormat("pdf")} className="sr-only" />
                    <FileText className={`w-6 h-6 mb-1 ${scanFormat === 'pdf' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className={`text-xs font-semibold ${scanFormat === 'pdf' ? 'text-indigo-700' : 'text-slate-600'}`}>PDF (Multi-page)</span>
                  </label>
                  <label className={`flex-1 flex flex-col items-center p-3 border rounded-lg cursor-pointer transition-all ${scanFormat === 'image' ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'hover:bg-slate-50'}`}>
                    <input type="radio" name="format" value="image" checked={scanFormat === 'image'} onChange={() => setScanFormat("image")} className="sr-only" />
                    <FileImage className={`w-6 h-6 mb-1 ${scanFormat === 'image' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className={`text-xs font-semibold ${scanFormat === 'image' ? 'text-indigo-700' : 'text-slate-600'}`}>Image (PNG)</span>
                  </label>
                </div>
              </div>

              {scannedPages.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-800">Pages Scanned: {scannedPages.length}</span>
                    <Button variant="ghost" size="sm" onClick={() => setScannedPages([])} className="h-6 px-2 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50">Clear All</Button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {scannedPages.map((page, idx) => (
                      <div key={idx} className="relative w-12 h-16 bg-white border border-blue-200 rounded shrink-0 shadow-sm overflow-hidden">
                        <img src={`data:image/png;base64,${page}`} alt={`Page ${idx + 1}`} className="w-full h-full object-cover opacity-80" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                          <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{idx + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={triggerScan} disabled={!selectedScanner} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                  {scannedPages.length > 0 ? <Plus className="w-4 h-4 mr-2" /> : <Scan className="w-4 h-4 mr-2" />}
                  {scannedPages.length > 0 ? "Scan Next Page" : "Scan Now"}
                </Button>
                
                {scannedPages.length > 0 && (
                  <Button onClick={finishPdfScan} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                    <Check className="w-4 h-4 mr-2" /> Finish & Attach PDF
                  </Button>
                )}
              </div>
            </div>
          )}

          {scannerStatus === "scanning" && (
            <div className="flex flex-col items-center justify-center p-8 bg-indigo-50 rounded-lg border border-indigo-100">
              <Scan className="w-12 h-12 text-indigo-400 animate-pulse mb-4" />
              <h4 className="font-bold text-indigo-900 mb-1">Scanning Document...</h4>
              <p className="text-xs text-indigo-600/80">Please wait while the scanner processes your document.</p>
            </div>
          )}

          {scannerStatus === "done" && (
            <div className="flex flex-col items-center justify-center p-8 bg-emerald-50 rounded-lg border border-emerald-100">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
              <h4 className="font-bold text-emerald-900 mb-1">Processing Complete</h4>
              <p className="text-xs text-emerald-600/80">Attaching document to your email...</p>
            </div>
          )}

          {scannerStatus === "offline" && (
            <div className="flex flex-col items-center justify-center p-6 bg-orange-50 rounded-lg border border-orange-100 text-orange-800 text-center">
              <AlertCircle className="w-10 h-10 mb-2 opacity-80" />
              <p className="text-sm font-semibold">Scanner is offline or busy.</p>
              <Button variant="outline" size="sm" onClick={connectToScannerHelper} className="mt-4 bg-white border-orange-200 text-orange-700 hover:bg-orange-100">
                <RefreshCw className="w-3 h-3 mr-2" /> Try Again
              </Button>
            </div>
          )}

          {scannerStatus === "no-scanner" && (
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-center">
              <AlertCircle className="w-10 h-10 mb-2 opacity-60" />
              <p className="text-sm font-medium">No scanner found.</p>
              <p className="text-xs opacity-80 mt-1">Make sure a scanner is connected and turned on.</p>
              <Button variant="outline" size="sm" onClick={connectToScannerHelper} className="mt-4 bg-white">
                <RefreshCw className="w-3 h-3 mr-2" /> Scan for Devices
              </Button>
            </div>
          )}
        </div>
        
        <div className="flex justify-end pt-2 border-t mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
