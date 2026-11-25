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

// ───────────────────────── Pay slip (text-style, like the university's payroll pay slip) ─────────────────────────
const SLIP_COLS = 79;
const MON3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Breaks text into lines of at most `width` characters (words kept whole where possible) */
function wrapChars(value: string, width: number): string[] {
  const words = safe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let w of words) {
    while (w.length > width) {
      if (line) { lines.push(line); line = ""; }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += " " + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
const money = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);
const padR = (v: string, n: number) => (v.length >= n ? v.slice(0, n) : v + " ".repeat(n - v.length));
const padL = (v: string, n: number) => (v.length >= n ? v.slice(-n) : " ".repeat(n - v.length) + v);
const centreIn = (v: string, n: number) => " ".repeat(Math.max(0, Math.floor((n - v.length) / 2))) + v;

export async function buildWageSlipPdf(s: WageSlip): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);
  const small = await pdf.embedFont(StandardFonts.Helvetica);
  const W = 595.28, H = 841.89;
  const page = pdf.addPage([W, H]);
  const FSZ = 10.6;
  const charW = mono.widthOfTextAtSize("M", FSZ);
  const left = (W - charW * SLIP_COLS) / 2;
  const LH = 12.4;
  let top = 46;
  const line = (text: string, bold = false) => {
    page.drawText(safe(text), { x: left, y: H - top, size: FSZ, font: bold ? monoBold : mono, color: BLACK });
    top += LH;
  };
  const DASH = "-".repeat(SLIP_COLS);
  const EQ = "=".repeat(SLIP_COLS);

  const monthName = (MONTHS[(s.month - 1 + 12) % 12] ?? String(s.month)).toUpperCase();
  const monthTxt = `${monthName} -${s.year}`;
  const section = (s.sectionLabel || "Accounts Section").trim();
  const upper = (v: unknown) => safe(v).toUpperCase();

  // header
  line(padR(upper(s.dealingCode ?? ""), SLIP_COLS - monthTxt.length) + monthTxt, true);
  line(centreIn("ALIGARH MUSLIM UNIVERSITY-ALIGARH, FINANCE & ACCOUNTS DEPARTMENT", SLIP_COLS), true);
  const title = `PAY SLIP FOR THE MONTH OF ${monthTxt}`;
  line(centreIn(title, SLIP_COLS - 8).padEnd(SLIP_COLS - 5) + "WAGES", true);
  line(DASH);

  // details: two label/value columns, long values wrap
  const LV = 32;   // left value width
  const RV = SLIP_COLS - 12 - LV - 2 - 17;   // right value width = what fits on the line (16)
  const head = [s.headName, s.paymentCode ? `(${s.paymentCode})` : ""].filter(Boolean).join(" ");
  const dayTxt = formatINR(s.days, Number.isInteger(s.days) ? 0 : 1);
  const rate = Math.round((s.basic + s.vda) * 100) / 100;
  const details: [string, string, string, string][] = [
    ["NAME", upper(s.name), "PERMANENT ID", upper(s.epid)],
    ["DESIGNATION", upper(s.designation ?? ""), "SALARY REGISTER", upper(s.salaryRegisterNo || "-")],
    ["DEPARTMENT", upper(s.departmentName), "PAYMENT HEAD", upper(head)],
    ["CATEGORY", upper(s.category), "RATE PER DAY", money(rate)],
    ["PAY LEVEL", upper(s.payLevel || "-"), "DAYS WORKED", dayTxt],
  ];
  for (const [l1, v1, l2, v2] of details) {
    const a = wrapChars(v1, LV), b = wrapChars(v2, RV);
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      const lhs = k === 0 ? padR(l1, 11) + ":" : " ".repeat(12);
      const rhs = k === 0 ? padR(l2, 16) + ":" : " ".repeat(17);
      line(lhs + padR(a[k] ?? "", LV) + "  " + padR(rhs, 17).slice(0, 17) + padR(b[k] ?? "", SLIP_COLS - 12 - LV - 2 - 17));
    }
  }
  line(DASH);

  // body: earnings | deductions | right-hand block
  const basicAmt = Math.round(s.basic * s.days * 100) / 100;
  const vdaAmt = Math.round(s.vda * s.days * 100) / 100;
  const earn: [string, string][] = [["BASIC", money(basicAmt)], ["VDA", money(vdaAmt)]];
  const ded: [string, string][] = [["EPF", money(s.epf)], ["ESI", money(s.esi)], ["MAS", money(s.mas)]];
  const RW = SLIP_COLS - (8 + 1 + 9 + 1 + 20 + 1 + 10 + 1);
  const first = (label: string, v: string | null | undefined, w = RW) => wrapChars(`${label} ${v || "-"}`, w);
  const right: string[] = [
    ...first("BANK     ", s.bankName ? upper(s.bankName) : ""),
    ...first("A/c      ", s.bankAccount ?? s.bankAccountMasked ?? ""),
    ...first("IFSC     ", s.ifsc ? upper(s.ifsc) : ""),
    ...(s.passedOn ? [`Passed Dt ${ddmmyyyy(s.passedOn).split("-").join(".")}`] : []),
    ...(s.pageNo ? [`Page No   ${s.pageNo}`] : []),
    "",
    "   Salary/Wage Period",
  ];
  const lastDay = new Date(s.year, s.month, 0).getDate();
  const mon = MON3[(s.month - 1 + 12) % 12] ?? "";
  const yy = String(s.year).slice(-2);
  right.push(`   01-${mon}-${yy}  to ${String(lastDay).padStart(2, "0")}-${mon}-${yy}`, "");
  right.push(`   PAN_NO :  ${s.panNumber ? upper(s.panNumber) : "-"}`);
  if (s.uanNo) right.push(`   UAN    :  ${s.uanNo}`);
  if (s.esiNo) right.push(`   ESI No.:  ${s.esiNo}`);
  right.push("", "   Authorised For issue", "   under code");
  for (const l of wrapChars(section, RW - 3)) right.push("   " + l);

  const rows = Math.max(right.length, ded.length, earn.length);
  for (let r = 0; r < rows; r++) {
    const e = earn[r], d = ded[r];
    const c1 = e ? padR(e[0], 8) : " ".repeat(8);
    const c2 = e ? padL(e[1], 9) : " ".repeat(9);
    const c3 = d ? padR(d[0], 20) : " ".repeat(20);
    const c4 = d ? padL(d[1], 10) : " ".repeat(10);
    line(`${c1}|${c2}|${c3}|${c4}|${padR(right[r] ?? "", RW)}`);
  }
  line(DASH);

  const gross = padL(money(s.gross), 10);
  const dedTot = padL(money(s.totalDeductions), 10);
  const net = padL(money(s.net), 10);
  line(`GROSS ${gross}   DEDUCTION ${dedTot}     NET WAGES ${net}`, true);
  line(DASH);
  for (const l of wrapChars(`Net payable in words: ${amountInWords(s.net)}`, SLIP_COLS)) line(l);
  for (const l of wrapChars(`Employer contribution (not deducted): EPF Rs. ${money(s.erEpf)}, ESI Rs. ${money(s.erEsi)}`, SLIP_COLS)) line(l);
  line(DASH);
  for (const l of wrapChars(`NOTE  :Error if any, must be brought to the notice of the ${section}`, SLIP_COLS)) line(l);
  line(EQ);
  line("REMARK:");
  top += 6;
  page.drawText(safe(`Computer generated pay slip, generated on ${s.generatedAt}.`), { x: left, y: H - top, size: 8, font: small, color: GREY });

  return pdf.save();
}

// ───────────────────────── Bank advice (A4 portrait, one or more pages per bank branch) ─────────────────────────
export type BankAdviceLine = { sno: number; epid: string; name: string; departmentName: string; paymentCode: string; accountNo: string; net: number };
export type BankAdviceBranch = { bankName: string; branch: string; ifsc: string; lines: BankAdviceLine[]; total: number };

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
      rightAt(page, "Date: ____________", PT.w - BM, y(126), regular, 10);
      rightAt(page, "Cheque No.: ____________", PT.w - BM, y(146), regular, 10);
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
