// Lazy-loads OpenCV.js (~10 MB) only when the document scanner is opened.
// Tried in order from several CDNs; the result is cached for the session.
//
// NOTE: the Emscripten module object is a "thenable" — returning/awaiting it
// directly makes the Promise machinery loop forever. Always wrap it: { cv }.

const OPENCV_URLS = [
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js",
  "https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js",
  "https://docs.opencv.org/4.10.0/opencv.js",
];

let loading: Promise<{ cv: any }> | null = null;

function injectScript(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.crossOrigin = "anonymous";
    const timer = setTimeout(() => {
      s.remove();
      reject(new Error("timeout"));
    }, timeoutMs);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error("load error")); };
    document.head.appendChild(s);
  });
}

function waitForRuntime(timeoutMs: number): Promise<{ cv: any }> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    const started = Date.now();
    const check = () => {
      const cv = w.cv;
      if (cv && cv.Mat) {
        resolve({ cv });
        return;
      }
      if (cv && !cv.__scannerHooked && typeof cv === "object") {
        cv.__scannerHooked = true;
        const prev = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          try { prev && prev(); } catch { /* ignore */ }
          resolve({ cv: w.cv });
        };
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("OpenCV runtime did not initialise"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

export function loadOpenCV(): Promise<{ cv: any }> {
  const w = window as any;
  if (w.cv && w.cv.Mat) return Promise.resolve({ cv: w.cv });
  if (loading) return loading;
  loading = (async () => {
    let lastErr: any = null;
    for (const url of OPENCV_URLS) {
      try {
        if (!(w.cv && (w.cv.Mat || w.cv.onRuntimeInitialized !== undefined))) {
          await injectScript(url, 90_000);
        }
        return await waitForRuntime(60_000);
      } catch (e) {
        lastErr = e;
        try { delete w.cv; } catch { w.cv = undefined; }
      }
    }
    loading = null; // allow retry
    throw lastErr || new Error("OpenCV could not be loaded");
  })();
  return loading;
}
