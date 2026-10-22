// ─────────────────────────────────────────────────────────────────────────────
// Document scanner — pure OpenCV logic (no DOM). Used by DocumentScannerDialog
// and unit-testable in Node with @techstark/opencv-js.
//
//   detectDocumentCorners → finds the paper's 4 corners (several strategies)
//   warpDocument          → perspective-crops the paper to a flat rectangle
//   estimateSkewAngle     → residual tilt of text lines (degrees)
//   rotateMat             → rotates by an angle, keeping the whole page
// ─────────────────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

/** Orders 4 points as top-left, top-right, bottom-right, bottom-left */
export function orderCorners(pts: Point[]): Quad {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = bySum[0], br = bySum[3];
  const rest = [bySum[1], bySum[2]];
  // top-right has the smaller (y - x)
  rest.sort((a, b) => (a.y - a.x) - (b.y - b.x));
  return [tl, rest[0], br, rest[1]];
}

export function fullImageQuad(w: number, h: number): Quad {
  return [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }];
}

function polygonArea(q: Point[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/** Smallest interior angle of a quad, degrees */
function minAngle(q: Quad): number {
  let m = 180;
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4], c = q[i], n = q[(i + 1) % 4];
    const v1x = p.x - c.x, v1y = p.y - c.y, v2x = n.x - c.x, v2y = n.y - c.y;
    const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    m = Math.min(m, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
  }
  return m;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Candidate quads from the contours of a binary/edge image */
function quadsFromBinary(cv: any, bin: any, minArea: number, out: Quad[]) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const list: { idx: number; area: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area >= minArea) list.push({ idx: i, area });
      c.delete();
    }
    list.sort((a, b) => b.area - a.area);
    for (const { idx } of list.slice(0, 8)) {
      const c = contours.get(idx);
      const hull = new cv.Mat();
      const approx = new cv.Mat();
      try {
        cv.convexHull(c, hull, false, true);
        const peri = cv.arcLength(hull, true);
        for (const eps of [0.02, 0.03, 0.05]) {
          cv.approxPolyDP(hull, approx, eps * peri, true);
          if (approx.rows === 4) {
            const pts: Point[] = [];
            for (let k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
            out.push(orderCorners(pts));
            break;
          }
        }
        // Fallback for rounded / partly hidden corners: rotated bounding box of the hull
        if (approx.rows !== 4) {
          const rect = cv.minAreaRect(hull);
          const pts = (cv.RotatedRect.points(rect) as Point[]).map((p) => ({ x: p.x, y: p.y }));
          out.push(orderCorners(pts));
        }
      } finally {
        hull.delete(); approx.delete(); c.delete();
      }
    }
  } finally {
    contours.delete(); hierarchy.delete();
  }
}

/** Mean of `gray` inside the quad and in a band just outside it (contrast check) */
function insideOutsideContrast(cv: any, gray: any, q: Quad): number {
  const w = gray.cols, h = gray.rows;
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const grow = (f: number) => q.map((p) => [Math.round(cx + (p.x - cx) * f), Math.round(cy + (p.y - cy) * f)]).flat();
  const inner = new cv.Mat.zeros(h, w, cv.CV_8UC1);
  const outer = new cv.Mat.zeros(h, w, cv.CV_8UC1);
  const pIn = cv.matFromArray(4, 1, cv.CV_32SC2, grow(0.9));
  const pOut = cv.matFromArray(4, 1, cv.CV_32SC2, grow(1.12));
  const pEdge = cv.matFromArray(4, 1, cv.CV_32SC2, grow(1.02));
  const vIn = new cv.MatVector(), vOut = new cv.MatVector(), vEdge = new cv.MatVector();
  try {
    vIn.push_back(pIn); vOut.push_back(pOut); vEdge.push_back(pEdge);
    cv.fillPoly(inner, vIn, new cv.Scalar(255));
    cv.fillPoly(outer, vOut, new cv.Scalar(255));
    cv.fillPoly(outer, vEdge, new cv.Scalar(0));   // band = grow(1.12) minus grow(1.02)
    const mIn = cv.mean(gray, inner)[0];
    const outCount = cv.countNonZero(outer);
    if (outCount < 50) return 0.5; // page fills the frame: no outside to compare, assume OK
    const mOut = cv.mean(gray, outer)[0];
    return (mIn - mOut) / 255;
  } finally {
    inner.delete(); outer.delete(); pIn.delete(); pOut.delete(); pEdge.delete();
    vIn.delete(); vOut.delete(); vEdge.delete();
  }
}

/**
 * Finds the document's corners in an RGBA/RGB/gray Mat.
 * Returns corners in the coordinates of `src`, and whether a page was found.
 */
export function detectDocumentCorners(cv: any, src: any): { quad: Quad; found: boolean; score: number } {
  const W = src.cols, H = src.rows;
  const scale = Math.min(1, 800 / Math.max(W, H));
  const small = new cv.Mat();
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const med = new cv.Mat();
  const work = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const candidates: Quad[] = [];
  try {
    cv.resize(src, small, new cv.Size(Math.round(W * scale), Math.round(H * scale)), 0, 0, cv.INTER_AREA);
    const ch = small.channels();
    if (ch === 4) cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    else if (ch === 3) cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);
    else small.copyTo(gray);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.medianBlur(gray, med, 11); // removes text and fine texture, keeps the paper edge
    const sw = small.cols, sh = small.rows;
    const minArea = sw * sh * 0.15;

    // Strategy 1: Canny edges at several sensitivities
    for (const [img, lo, hi] of [[blur, 50, 150], [blur, 25, 90], [med, 20, 60], [med, 10, 35]] as const) {
      cv.Canny(img, work, lo, hi);
      cv.dilate(work, work, kernel, new cv.Point(-1, -1), 2);
      quadsFromBinary(cv, work, minArea, candidates);
    }
    // Strategy 2: Otsu on brightness (bright paper vs darker background)
    cv.threshold(med, work, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(work, work, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 3);
    quadsFromBinary(cv, work, minArea, candidates);
    // Strategy 3: "paper colour" — bright AND unsaturated (separates paper from wood / coloured desks)
    if (ch >= 3) {
      const rgb = new cv.Mat();
      const hsv = new cv.Mat();
      const planes = new cv.MatVector();
      try {
        if (ch === 4) cv.cvtColor(small, rgb, cv.COLOR_RGBA2RGB); else small.copyTo(rgb);
        cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
        cv.split(hsv, planes);
        const S = planes.get(1), V = planes.get(2);
        const sMask = new cv.Mat(), vMask = new cv.Mat();
        try {
          cv.medianBlur(S, S, 9); cv.medianBlur(V, V, 9);
          cv.threshold(S, sMask, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
          cv.threshold(V, vMask, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
          cv.bitwise_and(sMask, vMask, work);
          cv.morphologyEx(work, work, cv.MORPH_OPEN, kernel, new cv.Point(-1, -1), 2);
          cv.morphologyEx(work, work, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 3);
          quadsFromBinary(cv, work, minArea, candidates);
          quadsFromBinary(cv, sMask, minArea, candidates);
        } finally {
          sMask.delete(); vMask.delete(); S.delete(); V.delete();
        }
      } finally {
        rgb.delete(); hsv.delete(); planes.delete();
      }
    }

    // Score: large, convex, sensible angles, and BRIGHTER inside than just outside.
    // (An inner table/box of the page is not darker outside, so the page itself wins.)
    let best: Quad | null = null;
    let bestScore = 0;
    for (const q of candidates) {
      if (!isConvexQuad(q)) continue;
      const area = polygonArea(q);
      const frac = area / (sw * sh);
      if (frac < 0.15 || frac > 0.985) continue;
      const ang = minAngle(q);
      if (ang < 45) continue;
      // Corners sitting on the photo border usually mean the contour leaked into the
      // background (or is the photo frame itself) — allowed, but strongly penalised.
      const margin = Math.max(3, Math.round(Math.min(sw, sh) * 0.01));
      const onBorder = q.filter((p) => p.x <= margin || p.y <= margin || p.x >= sw - 1 - margin || p.y >= sh - 1 - margin).length;
      if (onBorder >= 4) continue;
      const borderFactor = onBorder === 0 ? 1 : onBorder === 1 ? 0.75 : 0.3;
      const contrast = insideOutsideContrast(cv, med, q);
      if (contrast < 0.03) continue;
      const score = frac * borderFactor * (0.6 + 0.4 * Math.min(1, ang / 80)) * Math.min(1.5, 0.5 + contrast * 4);
      if (score > bestScore) { bestScore = score; best = q; }
    }

    if (!best) return { quad: fullImageQuad(W, H), found: false, score: 0 };
    const quad = best.map((p) => ({
      x: Math.min(W - 1, Math.max(0, p.x / scale)),
      y: Math.min(H - 1, Math.max(0, p.y / scale)),
    })) as Quad;
    return { quad, found: true, score: bestScore };
  } finally {
    small.delete(); gray.delete(); blur.delete(); med.delete(); work.delete(); kernel.delete();
  }
}

/** Perspective-crops `src` to the quad. Output long side is capped at maxSide. */
export function warpDocument(cv: any, src: any, quad: Quad, maxSide = 2200): any {
  const [tl, tr, br, bl] = quad;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(10, Math.round(w * k));
  h = Math.max(10, Math.round(h * k));
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    return dst;
  } finally {
    srcTri.delete(); dstTri.delete(); M.delete();
  }
}

/**
 * Residual skew of text/table lines in degrees (positive = rotate clockwise to fix).
 * Uses near-horizontal Hough line segments; returns 0 when unsure.
 */
export function estimateSkewAngle(cv: any, src: any, maxAngle = 15): number {
  const scale = Math.min(1, 1200 / Math.max(src.cols, src.rows));
  const small = new cv.Mat();
  const gray = new cv.Mat();
  const bin = new cv.Mat();
  const lines = new cv.Mat();
  try {
    cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA);
    if (small.channels() === 4) cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    else if (small.channels() === 3) cv.cvtColor(small, gray, cv.COLOR_RGB2GRAY);
    else small.copyTo(gray);
    cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 25, 15);
    const minLen = Math.round(small.cols * 0.15);
    cv.HoughLinesP(bin, lines, 1, Math.PI / 720, 80, minLen, 10);
    const angles: { a: number; w: number }[] = [];
    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.data32S[i * 4], y1 = lines.data32S[i * 4 + 1], x2 = lines.data32S[i * 4 + 2], y2 = lines.data32S[i * 4 + 3];
      const a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const norm = a > 90 ? a - 180 : a < -90 ? a + 180 : a;
      if (Math.abs(norm) <= maxAngle) angles.push({ a: norm, w: Math.hypot(x2 - x1, y2 - y1) });
    }
    if (angles.length < 3) return 0;
    // weighted median
    angles.sort((p, q) => p.a - q.a);
    const total = angles.reduce((s, v) => s + v.w, 0);
    let acc = 0;
    for (const v of angles) {
      acc += v.w;
      if (acc >= total / 2) return Math.abs(v.a) < 0.3 ? 0 : v.a;
    }
    return 0;
  } finally {
    small.delete(); gray.delete(); bin.delete(); lines.delete();
  }
}

/** Rotates by `angleDeg` (counter-clockwise positive, OpenCV convention), expanding the canvas. */
export function rotateMat(cv: any, src: any, angleDeg: number): any {
  const w = src.cols, h = src.rows;
  const center = new cv.Point(w / 2, h / 2);
  const M = cv.getRotationMatrix2D(center, angleDeg, 1);
  const rad = (angleDeg * Math.PI) / 180;
  const nw = Math.round(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
  const nh = Math.round(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
  M.doublePtr(0, 2)[0] += (nw - w) / 2;
  M.doublePtr(1, 2)[0] += (nh - h) / 2;
  const dst = new cv.Mat();
  try {
    cv.warpAffine(src, dst, M, new cv.Size(nw, nh), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    return dst;
  } finally {
    M.delete();
  }
}

/** Rotates by a multiple of 90° (clockwise when quarter > 0) */
export function rotate90(cv: any, src: any, quarterTurns: number): any {
  const q = ((quarterTurns % 4) + 4) % 4;
  const dst = new cv.Mat();
  if (q === 0) { src.copyTo(dst); return dst; }
  const code = q === 1 ? cv.ROTATE_90_CLOCKWISE : q === 2 ? cv.ROTATE_180 : cv.ROTATE_90_COUNTERCLOCKWISE;
  cv.rotate(src, dst, code);
  return dst;
}

/** Optional "document" enhancement: grayscale + background flattening + contrast */
export function enhanceDocument(cv: any, src: any): any {
  const gray = new cv.Mat();
  const bg = new cv.Mat();
  const out = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(31, 31));
  try {
    if (src.channels() === 4) cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    else if (src.channels() === 3) cv.cvtColor(src, gray, cv.COLOR_RGB2GRAY);
    else src.copyTo(gray);
    // estimate paper background (removes shadows / uneven light)
    cv.morphologyEx(gray, bg, cv.MORPH_CLOSE, kernel);
    cv.divide(gray, bg, out, 255);
    cv.normalize(out, out, 0, 255, cv.NORM_MINMAX);
    const rgba = new cv.Mat();
    cv.cvtColor(out, rgba, cv.COLOR_GRAY2RGBA);
    return rgba;
  } finally {
    gray.delete(); bg.delete(); out.delete(); kernel.delete();
  }
}
