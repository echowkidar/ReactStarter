// Document scanner for the signed attendance report (images / phone photos).
// Like a mobile "scan" app: finds the paper's edges, lets the user drag the
// 4 corners, then perspective-crops, straightens (deskew) and compresses the
// page to a JPEG under 2 MB before the normal quality check / upload runs.
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, RotateCw, Maximize, ScanLine, Check, ArrowLeft, AlertTriangle } from "lucide-react";
import { loadOpenCV } from "@/lib/opencv-loader";
import {
  detectDocumentCorners, warpDocument, estimateSkewAngle, rotateMat, rotate90, enhanceDocument,
  fullImageQuad, orderCorners, type Quad, type Point,
} from "@/lib/doc-scanner-cv";

const MAX_WORK_SIDE = 3200;           // working resolution (enough detail for OCR, still fast on phones)
const MAX_OUTPUT_BYTES = 1.9 * 1024 * 1024; // existing limit for images is 2 MB

type Props = {
  file: File | null;
  onCancel: () => void;
  onUseOriginal: (file: File) => void;
  onDone: (file: File) => void;
};

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let w = 0, h = 0;
  try {
    // honours EXIF rotation of phone photos
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
    source = bmp; w = bmp.width; h = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("Image could not be read"));
        im.src = url;
      });
      source = img; w = img.naturalWidth; h = img.naturalHeight;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const k = Math.min(1, MAX_WORK_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  if ((source as any).close) (source as any).close();
  return c;
}

function rotateCanvas90(src: HTMLCanvasElement, clockwise: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(((clockwise ? 90 : -90) * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

function canvasToBlob(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image"))), "image/jpeg", quality)
  );
}

/** JPEG under MAX_OUTPUT_BYTES: lowers quality first, then size */
async function compressCanvas(c: HTMLCanvasElement): Promise<Blob> {
  let canvas = c;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const q of [0.88, 0.8, 0.72]) {
      const b = await canvasToBlob(canvas, q);
      if (b.size <= MAX_OUTPUT_BYTES) return b;
    }
    const s = document.createElement("canvas");
    s.width = Math.round(canvas.width * 0.85);
    s.height = Math.round(canvas.height * 0.85);
    s.getContext("2d")!.drawImage(canvas, 0, 0, s.width, s.height);
    canvas = s;
  }
  return canvasToBlob(canvas, 0.65);
}

export function DocumentScannerDialog({ file, onCancel, onUseOriginal, onDone }: Props) {
  const [stage, setStage] = React.useState<"loading" | "adjust" | "processing" | "result" | "error">("loading");
  const [status, setStatus] = React.useState("Preparing image...");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [base, setBase] = React.useState<HTMLCanvasElement | null>(null);
  const [baseUrl, setBaseUrl] = React.useState<string>("");
  const [quad, setQuad] = React.useState<Quad | null>(null);
  const [autoFound, setAutoFound] = React.useState(false);
  const [enhance, setEnhance] = React.useState(false);
  const [result, setResult] = React.useState<HTMLCanvasElement | null>(null);
  const [resultUrl, setResultUrl] = React.useState("");
  const [skewApplied, setSkewApplied] = React.useState(0);
  const cvRef = React.useRef<any>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const dragIdx = React.useRef<number | null>(null);

  const detect = React.useCallback((canvas: HTMLCanvasElement) => {
    const cv = cvRef.current;
    if (!cv) { setQuad(fullImageQuad(canvas.width, canvas.height)); setAutoFound(false); return; }
    const src = cv.imread(canvas);
    try {
      const r = detectDocumentCorners(cv, src);
      setQuad(r.quad);
      setAutoFound(r.found);
    } catch (e) {
      console.error("[Scanner] detection failed", e);
      setQuad(fullImageQuad(canvas.width, canvas.height));
      setAutoFound(false);
    } finally {
      src.delete();
    }
  }, []);

  const showBase = (c: HTMLCanvasElement) => {
    setBase(c);
    setBaseUrl(c.toDataURL("image/jpeg", 0.8));
  };

  // Load image + OpenCV when a file arrives
  React.useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      setStage("loading"); setResult(null); setResultUrl(""); setErrorMsg(""); setEnhance(false);
      try {
        setStatus("Preparing image...");
        const c = await fileToCanvas(file);
        if (cancelled) return;
        showBase(c);
        setStatus("Loading scanner (first time may take a few seconds)...");
        try {
          const { cv } = await loadOpenCV();
          cvRef.current = cv;
        } catch (e) {
          console.error("[Scanner] OpenCV load failed", e);
          if (cancelled) return;
          setErrorMsg("Scanner could not be loaded (slow or no internet). You can retry, or upload the original photo.");
          setStage("error");
          return;
        }
        if (cancelled) return;
        setStatus("Detecting page edges...");
        await new Promise((r) => setTimeout(r, 30)); // let the UI paint
        detect(c);
        setStage("adjust");
      } catch (e: any) {
        if (cancelled) return;
        setErrorMsg(e?.message || "Image could not be read.");
        setStage("error");
      }
    })();
    return () => { cancelled = true; };
  }, [file, detect]);

  // ── Corner dragging ─────────────────────────────────────────────────────
  const toImagePoint = (e: React.PointerEvent): Point | null => {
    const svg = svgRef.current;
    if (!svg || !base) return null;
    const r = svg.getBoundingClientRect();
    return {
      x: Math.min(base.width - 1, Math.max(0, ((e.clientX - r.left) / r.width) * base.width)),
      y: Math.min(base.height - 1, Math.max(0, ((e.clientY - r.top) / r.height) * base.height)),
    };
  };
  const onHandleDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragIdx.current = i;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragIdx.current === null || !quad) return;
    const p = toImagePoint(e);
    if (!p) return;
    const q = [...quad] as Quad;
    q[dragIdx.current] = p;
    setQuad(q);
  };
  const onUp = () => {
    if (dragIdx.current !== null && quad) setQuad(orderCorners(quad));
    dragIdx.current = null;
  };

  const rotateBase = (clockwise: boolean) => {
    if (!base) return;
    const c = rotateCanvas90(base, clockwise);
    showBase(c);
    detect(c);
  };

  // ── Crop + straighten ───────────────────────────────────────────────────
  const process = async () => {
    const cv = cvRef.current;
    if (!cv || !base || !quad) return;
    setStage("processing");
    await new Promise((r) => setTimeout(r, 30));
    const mats: any[] = [];
    try {
      const src = cv.imread(base); mats.push(src);
      let cur = warpDocument(cv, src, quad); mats.push(cur);
      const skew = estimateSkewAngle(cv, cur);
      if (Math.abs(skew) >= 0.3) {
        cur = rotateMat(cv, cur, skew); mats.push(cur);
      }
      setSkewApplied(skew);
      if (enhance) { cur = enhanceDocument(cv, cur); mats.push(cur); }
      const out = document.createElement("canvas");
      cv.imshow(out, cur);
      setResult(out);
      setResultUrl(out.toDataURL("image/jpeg", 0.85));
      setStage("result");
    } catch (e) {
      console.error("[Scanner] processing failed", e);
      setErrorMsg("Could not process this image. Please adjust the corners and try again, or upload the original.");
      setStage("adjust");
    } finally {
      mats.forEach((m) => { try { m.delete(); } catch { /* ignore */ } });
    }
  };

  const rotateResult = (clockwise: boolean) => {
    const cv = cvRef.current;
    if (!result || !cv) return;
    const src = cv.imread(result);
    const r = rotate90(cv, src, clockwise ? 1 : -1);
    const out = document.createElement("canvas");
    cv.imshow(out, r);
    src.delete(); r.delete();
    setResult(out);
    setResultUrl(out.toDataURL("image/jpeg", 0.85));
  };

  const finish = async () => {
    if (!result || !file) return;
    setStage("processing");
    try {
      const blob = await compressCanvas(result);
      const baseName = file.name.replace(/\.[^.]+$/, "") || "attendance-report";
      onDone(new File([blob], `${baseName}-scanned.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    } catch (e: any) {
      setErrorMsg(e?.message || "Could not save the scanned image.");
      setStage("result");
    }
  };

  const retryLoad = async () => {
    if (!base) return;
    setStage("loading");
    setStatus("Loading scanner...");
    try {
      const { cv } = await loadOpenCV();
      cvRef.current = cv;
      detect(base);
      setErrorMsg("");
      setStage("adjust");
    } catch {
      setErrorMsg("Scanner could not be loaded. Please check the internet connection, or upload the original photo.");
      setStage("error");
    }
  };

  const handleR = base ? Math.max(base.width, base.height) * 0.018 : 10;
  const isLandscape = !!result && result.width > result.height * 1.1;

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-[98vw] w-[900px] max-h-[96vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Scan Signed Report</DialogTitle>
          <DialogDescription>
            {stage === "result"
              ? "Check the scanned page. It should be straight, readable and show the whole report."
              : "Drag the 4 corner points onto the corners of the paper, then press Crop & Straighten."}
          </DialogDescription>
        </DialogHeader>

        {(stage === "loading" || stage === "processing") && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            {stage === "loading" ? status : "Processing..."}
          </div>
        )}

        {stage === "error" && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {errorMsg}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              {base && <Button variant="outline" onClick={retryLoad}>Retry scanner</Button>}
              {file && <Button onClick={() => onUseOriginal(file)}>Use original photo</Button>}
            </div>
          </div>
        )}

        {stage === "adjust" && base && quad && (
          <div className="space-y-3">
            {!autoFound && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                Page edges could not be detected automatically. Please drag the corner points onto the paper's corners.
                (Tip: keep the paper on a darker surface and take the photo from straight above.)
              </div>
            )}
            {errorMsg && <div className="text-xs text-red-700">{errorMsg}</div>}
            <div className="relative mx-auto w-full select-none touch-none" style={{ maxWidth: `min(100%, calc(62vh * ${base.width / base.height}))` }}>
              <img src={baseUrl} alt="Report photo" className="block w-full h-auto rounded border" draggable={false} />
              <svg
                ref={svgRef}
                viewBox={`0 0 ${base.width} ${base.height}`}
                className="absolute inset-0 w-full h-full"
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <polygon
                  points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(37, 99, 235, 0.15)"
                  stroke="rgb(37, 99, 235)"
                  strokeWidth={handleR * 0.3}
                />
                {quad.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={handleR}
                    fill="rgba(255,255,255,0.85)"
                    stroke="rgb(37, 99, 235)"
                    strokeWidth={handleR * 0.3}
                    style={{ cursor: "grab", touchAction: "none" }}
                    onPointerDown={onHandleDown(i)}
                  />
                ))}
              </svg>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => rotateBase(false)} title="Rotate left"><RotateCcw className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="outline" onClick={() => rotateBase(true)} title="Rotate right"><RotateCw className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="outline" onClick={() => detect(base)}><ScanLine className="h-4 w-4 mr-1" /> Auto detect</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setQuad(fullImageQuad(base.width, base.height))}><Maximize className="h-4 w-4 mr-1" /> Full image</Button>
                <label className="flex items-center gap-1 text-xs text-muted-foreground px-1">
                  <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
                  Enhance (black &amp; white)
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => file && onUseOriginal(file)}>Use original</Button>
                <Button type="button" onClick={process}><ScanLine className="h-4 w-4 mr-1" /> Crop &amp; Straighten</Button>
              </div>
            </div>
          </div>
        )}

        {stage === "result" && result && (
          <div className="space-y-3">
            {isLandscape && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                The page looks sideways (landscape). If the report is portrait, use the rotate buttons below.
              </div>
            )}
            <div className="mx-auto" style={{ maxWidth: `min(100%, calc(62vh * ${result.width / result.height}))` }}>
              <img src={resultUrl} alt="Scanned report" className="block w-full h-auto rounded border shadow-sm" />
            </div>
            <div className="text-xs text-muted-foreground text-center">
              {Math.abs(skewApplied) >= 0.3 ? `Tilt corrected by ${Math.abs(skewApplied).toFixed(1)}°. ` : ""}
              {result.width} × {result.height} px
            </div>
            {errorMsg && <div className="text-xs text-red-700">{errorMsg}</div>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => rotateResult(false)} title="Rotate left"><RotateCcw className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="outline" onClick={() => rotateResult(true)} title="Rotate right"><RotateCw className="h-4 w-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStage("adjust")}><ArrowLeft className="h-4 w-4 mr-1" /> Adjust again</Button>
                <Button type="button" onClick={finish}><Check className="h-4 w-4 mr-1" /> Use this page</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
