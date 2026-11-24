// Printable wage documents: the Muster Roll for Daily Wagers (A4 landscape) and the
// individual wage slip (A4 portrait). Standard fonts only, so every text goes through safe()
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
    drawText(page, roll.sectionLabel, MARGIN, y(MARGIN - 8), regular, 7, GREY);
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

// ───────────────────────── Wage slip ─────────────────────────
export async function buildWageSlipPdf(s: WageSlip): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89;
  const page = pdf.addPage([W, H]);
  const y = (top: number) => H - top;
  const L = 40, R = W - 40, bw = R - L;

  const boxTop = 40;
  // header
  centredAt(page, "Aligarh Muslim University", W / 2, y(boxTop + 26), bold, 16);
  centredAt(page, `Wage Slip for ${monthYear(s.month, s.year)}`, W / 2, y(boxTop + 44), bold, 11.5);
  centredAt(page, s.departmentName, W / 2, y(boxTop + 59), regular, 10);
  let top = boxTop + 72;
  page.drawLine({ start: { x: L, y: y(top) }, end: { x: R, y: y(top) }, thickness: 0.8, color: BLACK });

  // details grid (2 pairs per row)
  const pass = s.passedOn ? `Passed on ${ddmmyyyy(s.passedOn)}` : "";
  const head = [s.headName, s.paymentCode].filter(Boolean).join(" / ");
  const details: [string, string][] = [
    ["EPID", s.epid], ["Name", s.name],
    ["Designation", s.designation ?? ""], ["Category", s.category],
    ["UAN", s.uanNo ?? ""], ["ESI No.", s.esiNo ?? ""],
    ["Bank", s.bankName ?? ""], ["A/c No.", s.bankAccountMasked ?? ""],
    ["IFSC", s.ifsc ?? ""], ["Payment Head / Code", head],
  ];
  if (s.pageNo || pass) details.push(["Page No.", s.pageNo ?? ""], ["Passed", pass.replace("Passed on ", "")]);
  const colW = bw / 2;
  const labW = 78;
  let gy = top;
  for (let r = 0; r < details.length; r += 2) {
    const cells = details.slice(r, r + 2);
    const prepared = cells.map(([lab, val], c) => {
      const lines = wrap(val || "-", bold, 9, colW - labW - 10 + (lab.length > 14 ? 0 : 0));
      return { lab, lines, c };
    });
    const nLines = Math.max(...prepared.map((p) => p.lines.length));
    const rowH = nLines * 12 + 8;
    for (const p of prepared) {
      const x = L + p.c * colW;
      const labLines = wrap(p.lab, regular, 8.5, labW - 4);
      labLines.forEach((ln, k) => drawText(page, ln, x + 6, y(gy + 14 + k * 11), regular, 8.5, GREY));
      p.lines.forEach((ln, k) => drawText(page, ln, x + 6 + labW, y(gy + 14 + k * 12), bold, 9));
    }
    gy += Math.max(rowH, wrap(cells.map((c) => c[0]).sort((a, b) => b.length - a.length)[0], regular, 8.5, labW - 4).length * 11 + 8);
    page.drawLine({ start: { x: L, y: y(gy) }, end: { x: R, y: y(gy) }, thickness: 0.3, color: GREY });
  }
  top = gy;

  // earnings | deductions
  const midX = L + bw / 2;
  const hdrH = 20;
  page.drawRectangle({ x: L, y: y(top + hdrH), width: bw, height: hdrH, color: LIGHT, borderColor: BLACK, borderWidth: LINE });
  drawText(page, "Earnings", L + 8, y(top + 14), bold, 10);
  drawText(page, "Amount (Rs.)", midX - 8 - bold.widthOfTextAtSize("Amount (Rs.)", 9), y(top + 14), bold, 9);
  drawText(page, "Deductions", midX + 8, y(top + 14), bold, 10);
  rightAt(page, "Amount (Rs.)", R - 8, y(top + 14), bold, 9);
  top += hdrH;

  const basicAmt = Math.round(s.basic * s.days * 100) / 100;
  const vdaAmt = Math.round(s.vda * s.days * 100) / 100;
  const dayTxt = formatINR(s.days, Number.isInteger(s.days) ? 0 : 1);
  const earn: [string, string, boolean][] = [
    [`Basic (${formatINR(s.basic, 2)} x ${dayTxt} days)`, formatINR(basicAmt, 2), false],
    [`VDA (${formatINR(s.vda, 2)} x ${dayTxt} days)`, formatINR(vdaAmt, 2), false],
  ];
  const ded: [string, string, boolean][] = [
    ["EPF", formatINR(s.epf), false], ["ESI", formatINR(s.esi), false], ["MAS", formatINR(s.mas), false],
  ];
  const bodyRows = 3;
  const rowH = 22;
  for (let r = 0; r < bodyRows; r++) {
    const e = earn[r], d = ded[r];
    const by = y(top + 15);
    if (e) { drawText(page, e[0], L + 8, by, regular, 9.5); rightAt(page, e[1], midX - 8, by, regular, 9.5); }
    if (d) { drawText(page, d[0], midX + 8, by, regular, 9.5); rightAt(page, d[1], R - 8, by, regular, 9.5); }
    top += rowH;
  }
  // totals row
  const totH = 22;
  page.drawRectangle({ x: L, y: y(top + totH), width: bw, height: totH, color: LIGHT, borderColor: BLACK, borderWidth: LINE });
  drawText(page, "Gross Wages", L + 8, y(top + 15), bold, 10);
  rightAt(page, formatINR(s.gross), midX - 8, y(top + 15), bold, 10);
  drawText(page, "Total Deductions", midX + 8, y(top + 15), bold, 10);
  rightAt(page, formatINR(s.totalDeductions), R - 8, y(top + 15), bold, 10);
  const tableTop = gy;
  top += totH;
  // outer frame lines of the table
  page.drawLine({ start: { x: L, y: y(tableTop) }, end: { x: L, y: y(top) }, thickness: LINE, color: BLACK });
  page.drawLine({ start: { x: R, y: y(tableTop) }, end: { x: R, y: y(top) }, thickness: LINE, color: BLACK });
  page.drawLine({ start: { x: midX, y: y(tableTop) }, end: { x: midX, y: y(top) }, thickness: LINE, color: BLACK });

  // net payable
  top += 18;
  drawText(page, `Net Payable: Rs. ${formatINR(s.net)}`, L + 8, y(top), bold, 12);
  top += 16;
  wrap(`(${amountInWords(s.net)})`, regular, 9.5, bw - 16).forEach((ln, k) => drawText(page, ln, L + 8, y(top + k * 12), regular, 9.5));
  top += 28;
  drawText(page, `Employer contribution (not deducted from wages): EPF Rs. ${formatINR(s.erEpf)}, ESI Rs. ${formatINR(s.erEsi)}`, L + 8, y(top), regular, 8, GREY);
  top += 14;

  // outer box
  page.drawRectangle({ x: L, y: y(top), width: bw, height: top - boxTop, borderColor: BLACK, borderWidth: 1 });

  const note = "This is a computer generated wage slip and does not need a signature.";
  centredAt(page, note, W / 2, y(top + 18), regular, 8, GREY);
  centredAt(page, `Generated on ${s.generatedAt}.`, W / 2, y(top + 30), regular, 8, GREY);

  return pdf.save();
}
