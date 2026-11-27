// Printable wage documents: the Muster Roll for Daily Wagers (A4 landscape) and the
// individual pay slip (A4 portrait, monospace text-style layout). Standard fonts only, so every text goes through safe()
// and the rupee sign is written "Rs.".
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";

export type MusterRoll = {
  departmentName: string; sectionLabel: string; month: number; year: number; headName: string; paymentCode: string;
  status: "draft" | "finalised" | "passed"; pageNo?: string | null; passedOn?: string | null; printedAt: string;
  totals: { gross: number; epf: number; esi: number; mas: number; net: number; er_epf_total: number; er_esi: number; days: number; employees: number };
};
export type MusterLine = {
  sno: number; epid: string; name: string; designation: string | null; basic: number; vda: number; days: number;
  gross: number; epf: number; esi: number; mas: number; net: number;
};
export type WageSlip = {
  epid: string; name: string; designation: string | null; departmentName: string; month: number; year: number; category: string;
  basic: number; vda: number; days: number; gross: number; epf: number; esi: number; mas: number; totalDeductions: number; net: number;
  erEpf: number; erEsi: number; uanNo?: string | null; esiNo?: string | null; bankName?: string | null; bankAccountMasked?: string | null;
  ifsc?: string | null; headName?: string | null; paymentCode?: string | null; pageNo?: string | null; passedOn?: string | null; generatedAt: string;
  dealingCode?: string | null; sectionLabel?: string | null; panNumber?: string | null; salaryRegisterNo?: string | null; payLevel?: string | null;
  bankAccount?: string | null;
  chequeNo?: string | null; chequeDate?: string | null; // YYYY-MM-DD
  periods?: { from: string; to: string; days: number }[]; // attendance periods, DD-MM-YYYY
};

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.92, 0.92, 0.92);
const LINE = 0.5;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const monthYear = (m: number, y: number) => `${MONTHS[(m - 1 + 12) % 12] ?? m} ${y}`;

function safe(value: unknown): string {
  return String(value ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

/** Indian digit grouping: 1,23,456.00 */
export function formatINR(n: number, decimals = 0): string {
  const v = Number.isFinite(n) ? n : 0;
  const fixed = Math.abs(v).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  let grouped = int;
  if (int.length > 3) {
    const head = int.slice(0, -3);
    grouped = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + int.slice(-3);
  }
  const neg = v < 0 && Number(fixed) !== 0 ? "-" : "";
  return neg + grouped + (frac ? "." + frac : "");
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
  "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ONES[h] + " Hundred" : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}
function wordsOfInt(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(wordsOfInt(crore) + " Crore");
  if (lakh) parts.push(below100(lakh) + " Lakh");
  if (thousand) parts.push(below100(thousand) + " Thousand");
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** 18585 -> "Rupees Eighteen Thousand Five Hundred Eighty Five Only" */
export function amountInWords(n: number): string {
  const v = Math.abs(Number.isFinite(n) ? n : 0);
  const totalPaise = Math.round(v * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  let s = "Rupees " + wordsOfInt(rupees);
  if (paise) s += " and " + below100(paise) + " Paise";
  return (n < 0 ? "Minus " : "") + s + " Only";
}

function drawText(page: PDFPage, value: string, x: number, topY: number, font: PDFFont, size: number, color = BLACK) {
  page.drawText(safe(value), { x, y: topY, size, font, color });
}
function centredAt(page: PDFPage, value: string, cx: number, y: number, font: PDFFont, size: number, color = BLACK) {
  const s = safe(value);
  drawText(page, s, cx - font.widthOfTextAtSize(s, size) / 2, y, font, size, color);
}
function rightAt(page: PDFPage, value: string, rx: number, y: number, font: PDFFont, size: number) {
  const s = safe(value);
  drawText(page, s, rx - font.widthOfTextAtSize(s, size), y, font, size);
}

/** Wraps to a width; a single word wider than the cell is broken by characters */
function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = (w: string) => {
    let rest = w;
    while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
      let k = rest.length - 1;
      while (k > 1 && font.widthOfTextAtSize(rest.slice(0, k), size) > width) k--;
      lines.push(rest.slice(0, k));
      rest = rest.slice(k);
    }
    line = rest;
  };
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = "";
      push(w);
    } else if (!line && font.widthOfTextAtSize(w, size) > width) {
      push(w);
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function ddmmyyyy(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : safe(iso ?? "");
}

// ───────────────────────── Muster roll ─────────────────────────
const LS = { w: 841.89, h: 595.28 };
const MARGIN = 28;

// relative widths of the 12 columns (scaled to the usable width)
const REL = [30, 52, 124, 108, 56, 50, 44, 66, 62, 62, 62, 72];
const COLS = (() => {
  const usable = LS.w - 2 * MARGIN;
  const total = REL.reduce((a, b) => a + b, 0);
  const widths = REL.map((w) => (w * usable) / total);
  const xs: number[] = [];
  let x = MARGIN;
  for (const w of widths) { xs.push(x); x += w; }
  xs.push(x);
  return { widths, xs };
})();

const HEADERS = ["S. No.", "Emp ID", "Name of the Employee", "Designation", "Basic Rate per Day (Rs.)", "VDA per Day (Rs.)",
  "Total Days Worked", "Gross Wages (Rs.)", "EPF deduction (if applicable) Rs.", "ESI deduction (if applicable) Rs.",
  "MAS deduction (if applicable) Rs.", "Net Payable Amount (Rs.)"];

const FS = 8;       // cell font size
const LH = 9.5;     // line height
const PADV = 3.5;
const HEAD_TOP_H = 13;
const HEAD_H = 46;
const TOTAL_H = 18;
const FOOT_RESERVE = 78;  // note + signature block under the table on the last page
const TABLE_TOP = 94;     // distance from the top of the page to the table

export async function buildMusterRollPdf(roll: MusterRoll, lines: MusterLine[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // wrap every row first: the row height depends on its longest wrapped cell
  const rows = lines.map((l) => {
    const nameL = wrap(l.name, regular, FS, COLS.widths[2] - 6);
    const desL = wrap(l.designation ?? "", regular, FS, COLS.widths[3] - 6);
    const n = Math.max(nameL.length, desL.length, 1);
    return { l, nameL, desL, h: n * LH + 2 * PADV };
  });

  const bottomLimit = LS.h - 36;
  const topLimit = TABLE_TOP + HEAD_H;
  const avail = bottomLimit - topLimit;
  const pages: (typeof rows)[] = [];
  let i = 0;
  while (i < rows.length || pages.length === 0) {
    const rest = rows.slice(i);
    const restH = rest.reduce((s, r) => s + r.h, 0);
    const chunk: typeof rows = [];
    if (restH + TOTAL_H + FOOT_RESERVE <= avail) {
      chunk.push(...rest);
    } else {
      let used = 0;
      for (const r of rest) {
        if (used + r.h > avail) break;
        chunk.push(r);
        used += r.h;
      }
      // everything would fit on this page but the total and signatures would not: leave one row for the next page
      if (chunk.length === rest.length && chunk.length > 1) chunk.pop();
      if (chunk.length === 0 && rest.length) chunk.push(rest[0]);
    }
    pages.push(chunk);
    i += chunk.length;
    if (i >= rows.length) break;
  }

  const t = roll.totals;
  const draw = (page: PDFPage, pageIdx: number) => {
    const y = (top: number) => LS.h - top;
    if (roll.status === "draft") {
      const size = 130;
      const w = bold.widthOfTextAtSize("DRAFT", size);
      const a = (32 * Math.PI) / 180;
      const cx = LS.w / 2, cy = LS.h / 2;
      page.drawText("DRAFT", {
        x: cx - (w / 2) * Math.cos(a) + (size * 0.35) * Math.sin(a),
        y: cy - (w / 2) * Math.sin(a) - (size * 0.35) * Math.cos(a),
        size, font: bold, color: rgb(0.9, 0.9, 0.9), rotate: degrees(32),
      });
    }
    drawText(page, roll.sectionLabel, MARGIN, y(MARGIN - 6), bold, 11);
    centredAt(page, "Muster Roll for Daily Wagers", LS.w / 2, y(42), bold, 14);
    centredAt(page, `Name of the Department: ${roll.departmentName} | Wage Month: ${monthYear(roll.month, roll.year)}`, LS.w / 2, y(60), regular, 9.5);
    centredAt(page, `Payment Head: ${roll.headName} | Payment Code: ${roll.paymentCode}`, LS.w / 2, y(74), regular, 9.5);

    // header
    const hy0 = TABLE_TOP;
    const xs = COLS.xs;
    page.drawRectangle({ x: xs[0], y: y(hy0 + HEAD_H), width: xs[12] - xs[0], height: HEAD_H, color: LIGHT, borderColor: BLACK, borderWidth: LINE });
    for (let c = 1; c < 12; c++) {
      // the three deduction columns share the upper band: no divider there
      const fromY = c >= 9 && c <= 10 ? hy0 + HEAD_TOP_H : hy0;
      page.drawLine({ start: { x: xs[c], y: y(fromY) }, end: { x: xs[c], y: y(hy0 + HEAD_H) }, thickness: LINE, color: BLACK });
    }
    page.drawLine({ start: { x: xs[8], y: y(hy0 + HEAD_TOP_H) }, end: { x: xs[11], y: y(hy0 + HEAD_TOP_H) }, thickness: LINE, color: BLACK });
    centredAt(page, "Employee Deduction", (xs[8] + xs[11]) / 2, y(hy0 + 9.5), bold, FS);
    HEADERS.forEach((h, c) => {
      const deduction = c >= 8 && c <= 10;
      const area = deduction ? HEAD_H - HEAD_TOP_H : HEAD_H;
      const base = deduction ? hy0 + HEAD_TOP_H : hy0;
      const ls = wrap(h, bold, 7, COLS.widths[c] - 4);
      const startTop = base + (area - ls.length * 8.5) / 2 + 6.5;
      ls.forEach((ln, k) => centredAt(page, ln, (xs[c] + xs[c + 1]) / 2, y(startTop + k * 8.5), bold, 7));
    });

    // body rows
    let top = hy0 + HEAD_H;
    const chunk = pages[pageIdx];
    const vline = (from: number, to: number) => {
      for (let c = 0; c <= 12; c++) page.drawLine({ start: { x: xs[c], y: y(from) }, end: { x: xs[c], y: y(to) }, thickness: LINE, color: BLACK });
    };
    const startBody = top;
    for (const r of chunk) {
      const l = r.l;
      const base = top + PADV + FS * 0.82;
      centredAt(page, String(l.sno), (xs[0] + xs[1]) / 2, y(base), regular, FS);
      drawText(page, l.epid, xs[1] + 3, y(base), regular, FS);
      r.nameL.forEach((ln, k) => drawText(page, ln, xs[2] + 3, y(base + k * LH), regular, FS));
      r.desL.forEach((ln, k) => drawText(page, ln, xs[3] + 3, y(base + k * LH), regular, FS));
      const nums = [formatINR(l.basic, 2), formatINR(l.vda, 2), formatINR(l.days, Number.isInteger(l.days) ? 0 : 1), formatINR(l.gross), formatINR(l.epf), formatINR(l.esi), formatINR(l.mas), formatINR(l.net)];
      nums.forEach((v, k) => rightAt(page, v, xs[4 + k + 1] - 4, y(base), regular, FS));
      top += r.h;
      page.drawLine({ start: { x: xs[0], y: y(top) }, end: { x: xs[12], y: y(top) }, thickness: LINE, color: BLACK });
    }
    vline(startBody, top);

    const last = pageIdx === pages.length - 1;
    if (last) {
      const ty = top;
      page.drawRectangle({ x: xs[0], y: y(ty + TOTAL_H), width: xs[12] - xs[0], height: TOTAL_H, color: LIGHT, borderColor: BLACK, borderWidth: LINE });
      const base = ty + 12.5;
      drawText(page, "Total", xs[2] + 3, y(base), bold, 9);
      const tot = [formatINR(t.days, Number.isInteger(t.days) ? 0 : 1), formatINR(t.gross), formatINR(t.epf), formatINR(t.esi), formatINR(t.mas), formatINR(t.net)];
      tot.forEach((v, k) => rightAt(page, v, xs[6 + k + 1] - 4, y(base), bold, 9));
      for (const c of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
        page.drawLine({ start: { x: xs[c], y: y(ty) }, end: { x: xs[c], y: y(ty + TOTAL_H) }, thickness: LINE, color: BLACK });
      }
      top = ty + TOTAL_H;

      drawText(page, `Employer's share (University's liability, met from the fund): EPF Rs. ${formatINR(t.er_epf_total)}, ESI Rs. ${formatINR(t.er_esi)}`, MARGIN, y(top + 14), regular, 7.5, GREY);
      const sy = top + 52;
      const passed = roll.status === "passed" && roll.passedOn ? `Passed for payment on ${ddmmyyyy(roll.passedOn)}` : "Passed for payment: ______________________";
      drawText(page, passed, MARGIN, y(sy), regular, 9);
      drawText(page, roll.pageNo ? `Entered at Page No. ${roll.pageNo}` : "Entered at Page No. ____________", MARGIN, y(sy + 16), regular, 9);
      const sigW = 170;
      const sx = LS.w - MARGIN - sigW;
      page.drawLine({ start: { x: sx, y: y(sy) }, end: { x: sx + sigW, y: y(sy) }, thickness: LINE, color: BLACK });
      centredAt(page, "Signature of HOD / Stamp", sx + sigW / 2, y(sy + 11), regular, 9);
    }

    drawText(page, `Printed: ${roll.printedAt}`, MARGIN, y(LS.h - 16), regular, 7, GREY);
    centredAt(page, `Page ${pageIdx + 1} of ${pages.length}`, LS.w / 2, y(LS.h - 16), regular, 7.5, GREY);
  };

  pages.forEach((_, idx) => draw(pdf.addPage([LS.w, LS.h]), idx));
  return pdf.save();
}

// ───────────────────────── Pay slip (modern single-page layout) ─────────────────────────
// ── Pay slip palette and small drawing helpers ──
const SL = {
  navy: rgb(30 / 255, 58 / 255, 138 / 255), ink: rgb(15 / 255, 23 / 255, 42 / 255), s500: rgb(100 / 255, 116 / 255, 139 / 255),
  s600: rgb(71 / 255, 85 / 255, 105 / 255), s200: rgb(226 / 255, 232 / 255, 240 / 255), s100: rgb(241 / 255, 245 / 255, 249 / 255),
  s50: rgb(248 / 255, 250 / 255, 252 / 255), green: rgb(4 / 255, 120 / 255, 87 / 255), green50: rgb(236 / 255, 253 / 255, 245 / 255),
  white: rgb(1, 1, 1),
};
type SlipColor = ReturnType<typeof rgb>;
type SlipCtx = { page: PDFPage; H: number; reg: PDFFont; bold: PDFFont };

/** Rectangle positioned by its top edge (distance from the top of the page) */
function slipRect(c: SlipCtx, x: number, top: number, w: number, h: number, fill?: SlipColor, border?: SlipColor) {
  c.page.drawRectangle({ x, y: c.H - top - h, width: w, height: h, color: fill, borderColor: border, borderWidth: border ? 0.6 : undefined });
}
function slipHair(c: SlipCtx, x1: number, x2: number, top: number, color: SlipColor = SL.s200, thickness = 0.6) {
  c.page.drawLine({ start: { x: x1, y: c.H - top }, end: { x: x2, y: c.H - top }, thickness, color });
}
/** Text by baseline (distance from the top of the page); right-aligned at x when `right` */
function slipText(c: SlipCtx, v: string, x: number, baseline: number, size: number, bold = false, color: SlipColor = SL.ink, right = false) {
  const font = bold ? c.bold : c.reg;
  const s = safe(v);
  c.page.drawText(s, { x: right ? x - font.widthOfTextAtSize(s, size) : x, y: c.H - baseline, size, font, color });
}
/** Small uppercase grey label over a bold value; the value is cut with ".." if too wide */
function drawLabelValue(c: SlipCtx, label: string, value: string, x: number, top: number, maxW: number) {
  slipText(c, label.toUpperCase(), x, top + 7, 6.8, true, SL.s500);
  let v = safe(value || "-");
  if (c.bold.widthOfTextAtSize(v, 9.5) > maxW) {
    while (v.length > 1 && c.bold.widthOfTextAtSize(v + "..", 9.5) > maxW) v = v.slice(0, -1);
    v += "..";
  }
  slipText(c, v, x, top + 19, 9.5, true);
}
/** One earnings/deductions table; returns its height */
function drawTable(c: SlipCtx, x: number, top: number, w: number, title: string, rows: [string, string][], rowCount: number, footLabel: string, footVal: string): number {
  const HEAD = 20, ROW = 20, FOOT = 23;
  const h = HEAD + ROW * rowCount + FOOT;
  slipRect(c, x, top, w, h, SL.white, SL.s200);
  slipRect(c, x, top, w, HEAD, SL.s100, SL.s200);
  slipText(c, title, x + 10, top + 13, 7.8, true, SL.s600);
  slipText(c, "AMOUNT (Rs.)", x + w - 10, top + 13, 7.8, true, SL.s600, true);
  for (let i = 0; i < rowCount; i++) {
    const t = top + HEAD + ROW * i;
    if (rows[i]) {
      slipText(c, rows[i][0], x + 10, t + 13.5, 9.5);
      slipText(c, rows[i][1], x + w - 10, t + 13.5, 9.5, false, SL.ink, true);
    }
    if (i < rowCount - 1) slipHair(c, x + 1, x + w - 1, t + ROW, SL.s100);
  }
  const ft = top + HEAD + ROW * rowCount;
  slipHair(c, x, x + w, ft, SL.s500, 0.8);
  slipText(c, footLabel, x + 10, ft + 15, 9.5, true);
  slipText(c, footVal, x + w - 10, ft + 15, 9.5, true, SL.ink, true);
  return h;
}

export async function buildWageSlipPdf(s: WageSlip): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 36, CW = W - 2 * M, R = W - M;
  const page = pdf.addPage([W, H]);
  const c: SlipCtx = { page, H, reg, bold };
  const GAP = 14;
  const section = (s.sectionLabel || "Accounts Section").trim();
  const monthName = MONTHS[(s.month - 1 + 12) % 12] ?? String(s.month);
  const amt = (n: number) => formatINR(n, 2);
  let top = 30;

  // 1. header band
  slipRect(c, M, top, CW, 70, SL.navy);
  slipText(c, "ALIGARH MUSLIM UNIVERSITY", M + 16, top + 29, 15, true, SL.white);
  slipText(c, "Finance & Accounts Department, Aligarh", M + 16, top + 45, 10, false, SL.white);
  slipText(c, `(${section})`, M + 16, top + 59, 9.5, true, SL.white);
  slipText(c, "PAY SLIP", R - 16, top + 29, 15, true, SL.white, true);
  slipText(c, `${monthName} ${s.year}`, R - 16, top + 46, 10, false, SL.white, true);
  top += 70 + 14;

  // 2. employee strip
  const boxW = 150, boxH = 46, textW = CW - boxW - 16;
  const nameLines = wrap(s.name, bold, 14, textW);
  const subLines = wrap([s.designation, s.departmentName].filter(Boolean).join(" - "), reg, 9, textW);
  let ty = top + 12;
  for (const l of nameLines) { slipText(c, l, M, ty, 14, true); ty += 17; }
  ty -= 3;
  for (const l of subLines) { slipText(c, l, M, ty + 9, 9, false, SL.s600); ty += 12; }
  slipRect(c, R - boxW, top, boxW, boxH, SL.white, SL.s200);
  slipText(c, "NET PAY", R - boxW + 12, top + 15, 7, true, SL.s500);
  slipText(c, `Rs. ${amt(s.net)}`, R - boxW + 12, top + 35, 16, true, SL.green);
  top += Math.max(boxH, ty - top + 2) + GAP;

  // 3. details panel (3 columns; the pay period spans two and lists every attendance period)
  const lastDay = new Date(s.year, s.month, 0).getDate();
  const mm = String(s.month).padStart(2, "0");
  const rate = Math.round((s.basic + s.vda) * 100) / 100;
  const dayTxt = (n: number) => formatINR(n, Number.isInteger(n) ? 0 : 1);
  const periods = s.periods?.length ? s.periods : [{ from: `01-${mm}-${s.year}`, to: `${lastDay}-${mm}-${s.year}`, days: s.days }];
  const periodLines = periods.map((p) => `${p.from} to ${p.to} (${dayTxt(p.days)} days)`);
  if (periods.length > 1) periodLines.push(`Total: ${dayTxt(s.days)} days`);
  const rows: { label: string; lines: string[]; span: number }[][] = [
    [{ label: "Employee ID", lines: [s.epid], span: 1 }, { label: "Pay Period", lines: periodLines, span: 2 }],
    [{ label: "Rate per Day (Rs.)", lines: [amt(rate)], span: 1 }, { label: "Salary Register", lines: [s.salaryRegisterNo || "-"], span: 1 },
     { label: "PAN", lines: [s.panNumber || "-"], span: 1 }],
    [{ label: "UAN", lines: [s.uanNo || "-"], span: 1 }, { label: "ESI No.", lines: [s.esiNo || "-"], span: 1 }],
  ];
  const PAD = 14, CELL_H = 32, LINE_H = 12.5, colW = (CW - 2 * PAD) / 3;
  const rowH = rows.map((r) => CELL_H + (Math.max(...r.map((x) => x.lines.length)) - 1) * LINE_H);
  const panelH = rowH.reduce((a, b) => a + b, 0) + 12;
  slipRect(c, M, top, CW, panelH, SL.s50, SL.s200);
  let ry = top + 10;
  rows.forEach((r, ri) => {
    let col = 0;
    for (const cell of r) {
      const x = M + PAD + col * colW, w = colW * cell.span - 10;
      drawLabelValue(c, cell.label, cell.lines[0], x, ry, w);
      cell.lines.slice(1).forEach((ln, k) => drawLabelValue(c, "", ln, x, ry + (k + 1) * LINE_H, w));
      col += cell.span;
    }
    ry += rowH[ri];
  });
  top += panelH + GAP;

  // 4. earnings | deductions
  const tGap = 16, tW = (CW - tGap) / 2;
  const basicAmt = Math.round(s.basic * s.days * 100) / 100;
  const vdaAmt = Math.round(s.vda * s.days * 100) / 100;
  const earn: [string, string][] = [
    [`Basic (${amt(s.basic)} x ${dayTxt(s.days)} days)`, amt(basicAmt)], [`VDA (${amt(s.vda)} x ${dayTxt(s.days)} days)`, amt(vdaAmt)],
  ];
  const ded: [string, string][] = [["EPF", amt(s.epf)], ["ESI", amt(s.esi)], ["MAS", amt(s.mas)]];
  const nRows = Math.max(earn.length, ded.length);
  const th = drawTable(c, M, top, tW, "EARNINGS", earn, nRows, "Gross Earnings", amt(s.gross));
  drawTable(c, M + tW + tGap, top, tW, "DEDUCTIONS", ded, nRows, "Total Deductions", amt(s.totalDeductions));
  top += th + GAP;

  // 5. net pay bar
  const wordLines = wrap(`Amount in words: ${amountInWords(s.net)}`, reg, 9, CW - 32);
  const barH = 34 + wordLines.length * 12;
  slipRect(c, M, top, CW, barH, SL.green50);
  slipRect(c, M, top, 4, barH, SL.green);
  slipText(c, "NET PAY", M + 16, top + 21, 10, true, SL.green);
  slipText(c, `Rs. ${amt(s.net)}`, R - 16, top + 22, 14, true, SL.green, true);
  wordLines.forEach((l, i) => slipText(c, l, M + 16, top + 38 + i * 12, 9, false, SL.ink));
  top += barH + GAP;

  // 6. payment details panel (2 columns of label: value)
  const head = [s.headName, s.paymentCode ? `(${s.paymentCode})` : ""].filter(Boolean).join(" ") || "-";
  const pay: [string, string][] = [
    ["Bank", s.bankName || "-"], ["Cheque Date", s.chequeDate ? ddmmyyyy(s.chequeDate) : "-"],
    ["Account No.", s.bankAccount ?? s.bankAccountMasked ?? "-"], ["Payment Head", head],
    ["IFSC", s.ifsc || "-"], ["Passed On", s.passedOn ? ddmmyyyy(s.passedOn) : "-"],
    ["Cheque No.", s.chequeNo || "-"], ["Page No.", s.pageNo || "-"],
  ];
  const pc = (CW - 2 * PAD - 16) / 2, LBL = 74, vW = pc - LBL;
  const prow: { cols: [string, string[]][]; h: number }[] = [];
  for (let i = 0; i < pay.length; i += 2) {
    const cols: [string, string[]][] = [pay[i], pay[i + 1]].map(([l, v]) => [l, wrap(v || "-", bold, 9, vW)] as [string, string[]]);
    prow.push({ cols, h: Math.max(cols[0][1].length, cols[1][1].length) * 11.5 + 6 });
  }
  const payH = 30 + prow.reduce((t, r) => t + r.h, 0) + 4;
  slipRect(c, M, top, CW, payH, SL.s50, SL.s200);
  slipText(c, "PAYMENT DETAILS", M + PAD, top + 16, 7.5, true, SL.s500);
  slipHair(c, M + PAD, R - PAD, top + 23);
  let py = top + 30;
  for (const r of prow) {
    r.cols.forEach(([lab, lines], k) => {
      const x = M + PAD + k * (pc + 16);
      slipText(c, lab, x, py + 8, 8, false, SL.s500);
      lines.forEach((ln, j) => slipText(c, ln, x + LBL, py + 8 + j * 11.5, 9, true));
    });
    py += r.h;
  }
  top += payH + 12;

  // 7. employer contribution
  slipText(c, `Employer contribution (not deducted from wages): EPF Rs. ${amt(s.erEpf)}, ESI Rs. ${amt(s.erEsi)}`, M, top + 8, 8.5, false, SL.s600);

  // 8. footer
  const ft = H - 98;
  slipHair(c, M, R, ft);
  slipText(c, `Authorised for issue by ${section}`, M, ft + 16, 9, true);
  wrap(`Any error must be brought to the notice of the ${section}.`, reg, 8.5, CW).forEach((l, i) => slipText(c, l, M, ft + 30 + i * 11, 8.5, false, SL.s600));
  const gen = `This is a computer generated pay slip and does not need a signature. Generated on ${s.generatedAt}.`;
  wrap(gen, reg, 7.5, CW).forEach((l, i) => slipText(c, l, M, H - 36 + i * 10, 7.5, false, SL.s500));

  return pdf.save();
}

// ───────────────────────── Bank advice (A4 portrait, one or more pages per bank branch) ─────────────────────────
export type BankAdviceLine = { sno: number; epid: string; name: string; departmentName: string; paymentCode: string; accountNo: string; net: number };
export type BankAdviceBranch = {
  bankName: string; branch: string; ifsc: string; lines: BankAdviceLine[]; total: number;
  // one cheque per fund + branch: the fund it is drawn on, and the cheque once entered
  paymentCode?: string | null; headName?: string | null; chequeNo?: string | null; chequeDate?: string | null;
};

const PT = { w: 595.28, h: 841.89 };
const BM = 36;
const BA_REL = [30, 52, 116, 108, 58, 84, 70];
const BA_COLS = (() => {
  const usable = PT.w - 2 * BM;
  const total = BA_REL.reduce((a, b) => a + b, 0);
  const widths = BA_REL.map((w) => (w * usable) / total);
  const xs: number[] = [];
  let x = BM;
  for (const w of widths) { xs.push(x); x += w; }
  xs.push(x);
  return { widths, xs };
})();
const BA_HEADERS = ["S.No.", "Emp ID", "Name", "Department", "Payment Code", "Account No.", "Amount (Rs.)"];
const BA_HEAD_H = 24;
const BA_FIRST_TOP = 232;    // table top on the first page of a branch
const BA_CONT_TOP = 78;      // table top on continuation pages
const BA_FOOT_RESERVE = 130; // total lines + signature block under the table on the last page

export async function buildBankAdvicePdf(
  meta: { sectionLabel: string; month: number; year: number; printedAt: string },
  branches: BankAdviceBranch[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const xs = BA_COLS.xs;
  const bottomLimit = PT.h - 40;

  type Row = { l: BankAdviceLine; nameL: string[]; desL: string[]; h: number };
  type Pg = { b: BankAdviceBranch; rows: Row[]; first: boolean; last: boolean };
  const pages: Pg[] = [];

  for (const b of branches) {
    const rows: Row[] = b.lines.map((l) => {
      const nameL = wrap(l.name, regular, FS, BA_COLS.widths[2] - 6);
      const desL = wrap(l.departmentName, regular, FS, BA_COLS.widths[3] - 6);
      return { l, nameL, desL, h: Math.max(nameL.length, desL.length, 1) * LH + 2 * PADV };
    });
    let i = 0;
    let first = true;
    for (;;) {
      const avail = bottomLimit - ((first ? BA_FIRST_TOP : BA_CONT_TOP) + BA_HEAD_H);
      const rest = rows.slice(i);
      const restH = rest.reduce((s, r) => s + r.h, 0);
      const chunk: Row[] = [];
      let last = false;
      if (restH + TOTAL_H + BA_FOOT_RESERVE <= avail) {
        chunk.push(...rest);
        last = true;
      } else {
        let used = 0;
        for (const r of rest) {
          if (used + r.h > avail) break;
          chunk.push(r);
          used += r.h;
        }
        // everything would fit but the total and signature would not: leave one row for the next page
        if (chunk.length === rest.length && chunk.length > 1) chunk.pop();
        if (chunk.length === 0 && rest.length) chunk.push(rest[0]);
      }
      pages.push({ b, rows: chunk, first, last });
      i += chunk.length;
      first = false;
      if (last) break;
    }
  }

  const draw = (page: PDFPage, pg: Pg, idx: number) => {
    const y = (top: number) => PT.h - top;
    const b = pg.b;
    const missing = !b.bankName.trim() && !b.branch.trim() && !b.ifsc.trim();
    const heading = missing ? "Bank details missing" : [b.bankName, b.branch].filter((s) => s.trim()).join(", ");
    let tableTop: number;
    if (pg.first) {
      centredAt(page, "Aligarh Muslim University", PT.w / 2, y(52), bold, 15);
      centredAt(page, `${meta.sectionLabel}, Finance & Accounts Department`, PT.w / 2, y(70), regular, 10);
      centredAt(page, `BANK ADVICE - Wages for ${monthYear(meta.month, meta.year)}`, PT.w / 2, y(94), bold, 12.5);
      drawText(page, "To,", BM, y(126), regular, 10);
      drawText(page, "The Branch Manager,", BM, y(140), regular, 10);
      drawText(page, heading, BM, y(154), bold, 10);
      drawText(page, missing ? "IFSC: -" : `IFSC: ${b.ifsc}`, BM, y(168), regular, 10);
      rightAt(page, `Cheque Date: ${b.chequeDate ? safe(b.chequeDate) : "____________"}`, PT.w - BM, y(126), b.chequeDate ? bold : regular, 10);
      rightAt(page, `Cheque No.: ${b.chequeNo ? safe(b.chequeNo) : "____________"}`, PT.w - BM, y(146), b.chequeNo ? bold : regular, 10);
      if (b.paymentCode) {
        rightAt(page, safe(`${b.headName || "Fund"} (${b.paymentCode})`).slice(0, 70), PT.w - BM, y(166), regular, 8.5);
      }
      const msg = wrap("Please credit the following amounts to the savings accounts of the employees listed below. The total amount is covered by the cheque mentioned above.", regular, 9.5, PT.w - 2 * BM);
      msg.forEach((ln, k) => drawText(page, ln, BM, y(196 + k * 12), regular, 9.5));
      tableTop = BA_FIRST_TOP;
    } else {
      drawText(page, `${heading} (continued)`, BM, y(52), bold, 10.5);
      drawText(page, `Bank Advice - Wages for ${monthYear(meta.month, meta.year)}`, BM, y(66), regular, 8.5, GREY);
      tableTop = BA_CONT_TOP;
    }

    page.drawRectangle({ x: xs[0], y: y(tableTop + BA_HEAD_H), width: xs[7] - xs[0], height: BA_HEAD_H, color: LIGHT, borderColor: BLACK, borderWidth: LINE });
    for (let c = 1; c < 7; c++) page.drawLine({ start: { x: xs[c], y: y(tableTop) }, end: { x: xs[c], y: y(tableTop + BA_HEAD_H) }, thickness: LINE, color: BLACK });
    BA_HEADERS.forEach((h, c) => {
      const ls = wrap(h, bold, 7.5, BA_COLS.widths[c] - 4);
      const startTop = tableTop + (BA_HEAD_H - ls.length * 9) / 2 + 7;
      ls.forEach((ln, k) => centredAt(page, ln, (xs[c] + xs[c + 1]) / 2, y(startTop + k * 9), bold, 7.5));
    });

    let top = tableTop + BA_HEAD_H;
    const startBody = top;
    for (const r of pg.rows) {
      const base = top + PADV + FS * 0.82;
      centredAt(page, String(r.l.sno), (xs[0] + xs[1]) / 2, y(base), regular, FS);
      drawText(page, r.l.epid, xs[1] + 3, y(base), regular, FS);
      r.nameL.forEach((ln, k) => drawText(page, ln, xs[2] + 3, y(base + k * LH), regular, FS));
      r.desL.forEach((ln, k) => drawText(page, ln, xs[3] + 3, y(base + k * LH), regular, FS));
      drawText(page, r.l.paymentCode, xs[4] + 3, y(base), regular, FS);
      drawText(page, r.l.accountNo, xs[5] + 3, y(base), regular, FS);
      rightAt(page, formatINR(r.l.net), xs[7] - 4, y(base), regular, FS);
      top += r.h;
      page.drawLine({ start: { x: xs[0], y: y(top) }, end: { x: xs[7], y: y(top) }, thickness: LINE, color: BLACK });
    }
    for (let c = 0; c <= 7; c++) page.drawLine({ start: { x: xs[c], y: y(startBody) }, end: { x: xs[c], y: y(top) }, thickness: LINE, color: BLACK });

    if (pg.last) {
      page.drawRectangle({ x: xs[0], y: y(top + TOTAL_H), width: xs[7] - xs[0], height: TOTAL_H, color: LIGHT, borderColor: BLACK, borderWidth: LINE });
      drawText(page, "Total", xs[2] + 3, y(top + 12.5), bold, 9);
      rightAt(page, formatINR(b.total), xs[7] - 4, y(top + 12.5), bold, 9);
      page.drawLine({ start: { x: xs[6], y: y(top) }, end: { x: xs[6], y: y(top + TOTAL_H) }, thickness: LINE, color: BLACK });
      top += TOTAL_H;
      const words = wrap(`Total amount: Rs. ${formatINR(b.total)} (${amountInWords(b.total)})`, regular, 9.5, PT.w - 2 * BM);
      words.forEach((ln, k) => drawText(page, ln, BM, y(top + 20 + k * 12), regular, 9.5));
      const after = top + 20 + words.length * 12;
      drawText(page, `Number of accounts: ${b.lines.length}`, BM, y(after + 4), regular, 9.5);
      const sy = after + 60;
      const sigW = 170;
      const sx = PT.w - BM - sigW;
      page.drawLine({ start: { x: sx, y: y(sy) }, end: { x: sx + sigW, y: y(sy) }, thickness: LINE, color: BLACK });
      centredAt(page, "Authorised Signatory", sx + sigW / 2, y(sy + 12), bold, 9.5);
      centredAt(page, meta.sectionLabel, sx + sigW / 2, y(sy + 24), regular, 9);
      drawText(page, `Printed: ${meta.printedAt}`, BM, y(sy + 24), regular, 7, GREY);
    }
    centredAt(page, `Page ${idx + 1} of ${pages.length}`, PT.w / 2, y(PT.h - 20), regular, 7.5, GREY);
  };

  if (pages.length === 0) {
    const page = pdf.addPage([PT.w, PT.h]);
    centredAt(page, "No bank advice to print", PT.w / 2, PT.h / 2, regular, 11, GREY);
  }
  pages.forEach((pg, idx) => draw(pdf.addPage([PT.w, PT.h]), pg, idx));
  return pdf.save();
}
