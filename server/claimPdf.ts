// Printable claim forms (A4) — same wording and layout as the office's paper forms.
// ─────────────────────────────────────────────────────────────────────────────
// The system only fills the blanks (name, ID, designation, department, dates) and
// adds one strip at the foot of the page: a reference ID with a QR code (so the
// uploaded scan can be matched to the right claim) and the dispatch number / date
// the department writes by hand. Signatures are always left blank.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import crypto from "crypto";
import {
  CEA_APPROVALS, CLAIM_FORM_DEFS, CONVEYANCE_MONTH_REASONS, SPOUSE_EMPLOYMENT, formatClaimDate, halfYearLabel, monthLabel, quarterRange,
  type ClaimForm, type ConveyanceMonth,
} from "@shared/claimForms";

const A4 = { w: 595.28, h: 841.89 };
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);

/** Short code printed beside the reference: ties a print to one revision of one claim */
export function claimPrintCode(refNo: string, revision: number): string {
  const secret = process.env.CLAIM_CODE_SECRET || process.env.SESSION_SECRET || process.env.EXTERNAL_API_KEY || "amu-claim-forms";
  return crypto.createHmac("sha256", secret).update(`${refNo}|${revision}`).digest("hex").slice(0, 8).toUpperCase();
}

/** Reference as printed: NPA/2026/000123/R2 */
export function claimPrintRef(refNo: string, revision: number): string {
  return `${refNo}/R${revision}`;
}

/** Calendar date in India of a UTC time ("…Z") */
function indianDate(isoUtc: string): string {
  const t = Date.parse(isoUtc);
  return Number.isNaN(t) ? String(isoUtc).slice(0, 10) : new Date(t + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

// pdf-lib measures from the bottom of the page; the forms are laid out from the top
const fromTop = (top: number) => A4.h - top;

/** Characters the built-in fonts cannot draw are replaced, so a name never breaks the PDF */
function safe(text: unknown): string {
  return String(text ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function text(page: PDFPage, value: string, x: number, top: number, font: PDFFont, size: number, color = BLACK) {
  page.drawText(safe(value), { x, y: fromTop(top), size, font, color });
}

function centred(page: PDFPage, value: string, centreX: number, top: number, font: PDFFont, size: number) {
  const s = safe(value);
  text(page, s, centreX - font.widthOfTextAtSize(s, size) / 2, top, font, size);
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type ParagraphOptions = {
  x: number; top: number; width: number; font: PDFFont; size: number; lineHeight: number;
  justify?: boolean; centre?: boolean; strike?: boolean;
};

/** Draws a paragraph and returns the top of the line after it */
function paragraph(page: PDFPage, value: string, o: ParagraphOptions): number {
  const lines = wrap(value, o.font, o.size, o.width);
  let top = o.top;
  lines.forEach((line, index) => {
    const lineWidth = o.font.widthOfTextAtSize(line, o.size);
    const last = index === lines.length - 1;
    let startX = o.x;
    let endX = o.x + lineWidth;
    if (o.centre) {
      startX = o.x + (o.width - lineWidth) / 2;
      endX = startX + lineWidth;
      text(page, line, startX, top, o.font, o.size);
    } else if (o.justify && !last && line.includes(" ")) {
      const words = line.split(" ");
      const gap = (o.width - words.reduce((sum, w) => sum + o.font.widthOfTextAtSize(w, o.size), 0)) / (words.length - 1);
      let x = o.x;
      for (const w of words) {
        text(page, w, x, top, o.font, o.size);
        x += o.font.widthOfTextAtSize(w, o.size) + gap;
      }
      endX = o.x + o.width;
    } else {
      text(page, line, o.x, top, o.font, o.size);
    }
    if (o.strike) {
      const y = fromTop(top) + o.size * 0.3;
      page.drawLine({ start: { x: startX, y }, end: { x: endX, y }, thickness: 0.8, color: BLACK });
    }
    top += o.lineHeight;
  });
  return top;
}

/** "Label: value" on a ruled blank; an empty value leaves the blank for handwriting */
function blank(page: PDFPage, label: string, value: string, x: number, top: number, endX: number, fonts: Fonts, size: number, filler: "-" | "." | "_" = "-") {
  text(page, label, x, top, fonts.regular, size);
  let cursor = x + fonts.regular.widthOfTextAtSize(safe(label), size) + size * 0.45;
  if (value) {
    const v = safe(value);
    text(page, v, cursor, top, fonts.bold, size);
    cursor += fonts.bold.widthOfTextAtSize(v + " ", size);
  }
  const unit = fonts.regular.widthOfTextAtSize(filler, size);
  const count = Math.floor((endX - cursor) / unit);
  if (count > 2) text(page, filler.repeat(count), cursor, top, fonts.regular, size, value ? GREY : BLACK);
}

/** Foot of every page: reference + QR (for matching the scan) and the department's dispatch boxes */
async function footer(pdf: PDFDocument, page: PDFPage, claim: ClaimForm, fonts: Fonts, pageLabel: string, withDispatch = true) {
  const ref = claimPrintRef(claim.refNo, claim.revision);
  const code = claimPrintCode(claim.refNo, claim.revision);
  const top = A4.h - 92;
  page.drawLine({ start: { x: 50, y: fromTop(top) }, end: { x: A4.w - 50, y: fromTop(top) }, thickness: 0.5, color: GREY });

  try {
    // @ts-ignore qrcode ships without type declarations
    const QR: any = await import("qrcode");
    const toBuffer = QR.toBuffer || QR.default?.toBuffer;
    const png: Buffer = await toBuffer(`AMU-CLAIM|${ref}|${code}`, { margin: 0, width: 220, errorCorrectionLevel: "M" });
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: 50, y: fromTop(top + 58), width: 50, height: 50 });
  } catch (error) {
    console.warn("[ClaimPdf] QR code not drawn:", error);
  }

  text(page, `Ref. ID: ${ref}`, 108, top + 18, fonts.bold, 9);
  text(page, `Code: ${code}`, 108, top + 31, fonts.regular, 8.5);
  text(page, `${pageLabel}  |  Filled online on ${formatClaimDate(indianDate(claim.updatedAt))}`, 108, top + 43, fonts.regular, 7, GREY);
  text(page, "Valid only with the signatures. Do not write over the QR code.", 108, top + 53, fonts.regular, 7, GREY);

  if (!withDispatch) return;
  // Dispatch number and date: written by the department before scanning
  const boxX = A4.w - 50 - 190;
  page.drawRectangle({ x: boxX, y: fromTop(top + 58), width: 190, height: 48, borderColor: BLACK, borderWidth: 0.7 });
  page.drawLine({ start: { x: boxX, y: fromTop(top + 34) }, end: { x: boxX + 190, y: fromTop(top + 34) }, thickness: 0.5, color: BLACK });
  text(page, "D. No.", boxX + 6, top + 26, fonts.bold, 9);
  text(page, "D. Date", boxX + 6, top + 50, fonts.bold, 9);
  text(page, "(to be filled by the Department)", boxX, top + 68, fonts.italic, 6.5, GREY);
}

const M = { left: 91, right: 504 }; // text margins of the paper forms
const WIDTH = M.right - M.left;

function npaPage(page: PDFPage, claim: ClaimForm, f: Fonts) {
  const s = claim.snapshot;
  const size = 9.5;
  const lh = 13.6;
  centred(page, "CERTIFICATE OF N.P.A. CLAIM", A4.w / 2, 78, f.regular, 10);

  blank(page, "With Effect From:", formatClaimDate(claim.data.wefDate), M.left, 118, M.left + 165, f, size);
  text(page, "I certified that:", M.left, 139, f.regular, size);

  const items: Array<[string, string]> = [
    ["(i)", "I am not involved in any kind of Private Practice whatsoever."],
    ["(ii)", "I have submitted my Undertaking regarding private practice in the Department (copy enclosed)."],
    ["(iii)", "I have possessed essential qualification as per current NPA rules."],
    ["(iv)", "I undertake to intimate if any change in the particulars mentioned above which affect my eligibility of NPA."],
  ];
  let top = 160;
  for (const [no, line] of items) {
    text(page, no, M.left + 17, top, f.regular, size);
    top = paragraph(page, line, { x: M.left + 50, top, width: WIDTH - 50, font: f.regular, size, lineHeight: lh });
  }

  paragraph(page, "I am aware that if at any stage the information/documents furnished above is found to be false, all payment will be refunded by me to the institution.",
    { x: M.left, top: top + 12, width: WIDTH, font: f.regular, size, lineHeight: lh + 0.6, centre: true });

  const endX = M.left + 150;
  blank(page, "Signature:", "", M.left, 327, endX, f, size);
  blank(page, "Name :", s.name, M.left, 348, Math.max(endX, M.left + 60 + f.bold.widthOfTextAtSize(safe(s.name), size)), f, size);
  blank(page, "ID No.:", s.epid, M.left, 369, endX, f, size);
  blank(page, "Designation:", s.designation, M.left, 390, Math.max(endX, M.left + 80 + f.bold.widthOfTextAtSize(safe(s.designation), size)), f, size);
  blank(page, "Deptt. / Office:", s.departmentName, M.left, 411, Math.max(endX, M.left + 90 + f.bold.widthOfTextAtSize(safe(s.departmentName), size)), f, size);

  text(page, "It is certified that the above information is correct to the best of my knowledge.", M.left, 454, f.regular, size);
  centred(page, "Chairman / Head of the Department / Office", 414, 496, f.regular, size);
  centred(page, "(Seal & Signature)", 414, 509, f.regular, size);
}

function hraPage(page: PDFPage, claim: ClaimForm, f: Fonts) {
  const s = claim.snapshot;
  const size = 11;
  const lh = 18.6;
  const chosen = String(claim.data.option || "");
  centred(page, "CERTIFICATE OF H.R.A. CLAIM", A4.w / 2, 84, f.regular, 16.5);

  blank(page, "With Effect From:", formatClaimDate(claim.data.wefDate), M.left, 115, M.left + 215, f, 10);
  text(page, "I certified that:", M.left, 143, f.bold, 10);

  text(page, "1)  I have not been provided with University accommodation", M.left + 17, 171, f.regular, size);

  // 2) — the employee chose one of the three; the other two are struck out, as on paper
  text(page, "2)", M.left + 17, 190, f.regular, size);
  paragraph(page, "(a) I am living in a rented accommodation",
    { x: M.left + 34, top: 190, width: WIDTH - 34, font: f.regular, size, lineHeight: lh, strike: chosen !== "rented" });

  text(page, "OR", 232, 227, f.bold, size);
  paragraph(page, "I am incurring some expenditure on rent / contributory towards Rent of rented accommodation.",
    { x: M.left + 50, top: 245, width: WIDTH - 50, font: f.regular, size, lineHeight: lh, strike: chosen !== "rent_contribution" });

  text(page, "OR", 229, 282, f.bold, size);
  const own = chosen !== "own_house";
  paragraph(page, "(b)", { x: M.left + 33, top: 301, width: 20, font: f.regular, size, lineHeight: lh, strike: own });
  paragraph(page, "I am living in my own house /house owned by my spouse and I am paying / contributing towards house or property tax or maintenance of house.",
    { x: M.left + 52, top: 301, width: WIDTH - 52, font: f.regular, size, lineHeight: lh, justify: true, strike: own });

  const x = 288;
  blank(page, "Signature:", "", x, 393, M.right - 10, f, size);
  blank(page, "Name :", s.name, x, 417, M.right - 10, f, size);
  blank(page, "ID No.:", s.epid, x, 441, M.right - 10, f, size);
  blank(page, "Designation:", s.designation, x, 465, M.right - 10, f, size);
  blank(page, "Deptt. / Office:", s.departmentName, x, 489, M.right - 10, f, size);

  paragraph(page, "It is certified that the above information is correct to the best of my knowledge.",
    { x: M.left, top: 556, width: WIDTH, font: f.regular, size, lineHeight: 24.5, justify: true });

  centred(page, "Chairman / Head of the Department / Office", A4.w / 2, 648, f.regular, size);
  centred(page, "(Seal & Signature)", A4.w / 2, 664, f.regular, size);
}

function undertakingPage(page: PDFPage, claim: ClaimForm, f: Fonts) {
  const s = claim.snapshot;
  const size = 10.5;
  const lh = 20.6;
  const title = "UNDERTAKING";
  const titleSize = 17;
  centred(page, title, A4.w / 2, 88, f.regular, titleSize);
  const tw = f.regular.widthOfTextAtSize(title, titleSize);
  page.drawLine({ start: { x: A4.w / 2 - tw / 2, y: fromTop(88) - 2.5 }, end: { x: A4.w / 2 + tw / 2, y: fromTop(88) - 2.5 }, thickness: 0.9, color: BLACK });

  paragraph(page, "As decided in the consultative meeting of the Principal, J.N.M.C.H. / Dr. ZADC and all Chairman, Department of Studies, Faculty of Medicine which was held on 10.05.2012 and minutes of the same were circulated vide D.No.190/FM, dated 10.05.2012",
    { x: M.left, top: 139, width: WIDTH, font: f.regular, size, lineHeight: lh, justify: true });

  // "I ........ Dept. of ........" — both blanks filled, on one line when they fit
  const nameEnd = Math.min(M.left + 12 + f.bold.widthOfTextAtSize(safe(s.name) + "  ", size) + 20, M.left + 215);
  blank(page, "I", s.name, M.left, 207, Math.max(nameEnd, M.left + 150), f, size, ".");
  blank(page, "Dept. of", s.departmentName, Math.max(nameEnd, M.left + 150) + 6, 207, M.right, f, size, ".");

  paragraph(page, "hereby declare that I am not involved any kind of Private Practice whatsoever. In case if I am found indulging in any Private Practice, disciplinary action may be taken against me as University rules.",
    { x: M.left, top: 228, width: WIDTH, font: f.regular, size, lineHeight: lh, justify: true });

  blank(page, "Signature of Teacher / Resident", "", 190, 320, 480, f, size, ".");
  blank(page, "Dated :", "", 190, 342, 345, f, size, ".");

  text(page, "Counter Signed by the Chairman of the Department", M.left, 387, f.regular, size);
  text(page, "Chairman", 157, 454, f.regular, size);
  blank(page, "D/o", s.departmentName, 124, 478, Math.max(256, 124 + 30 + f.bold.widthOfTextAtSize(safe(s.departmentName), size)), f, size, ".");
  text(page, ".".repeat(46), 124, 500, f.regular, size);
}

/** Conveyance Allowance Bill — wording, order and spelling exactly as on the office's bill */
function conveyancePage(page: PDFPage, claim: ClaimForm, f: Fonts) {
  const s = claim.snapshot;
  const d = claim.data;
  const size = 11;
  const L = 60, R = 535, MID = 330, COL2 = 345;

  const title = "CONVEYANCE ALLOWANCE BILL";
  centred(page, title, A4.w / 2, 72, f.bold, 12.5);
  const tw = f.bold.widthOfTextAtSize(title, 12.5);
  page.drawLine({ start: { x: A4.w / 2 - tw / 2, y: fromTop(72) - 2 }, end: { x: A4.w / 2 + tw / 2, y: fromTop(72) - 2 }, thickness: 0.8, color: BLACK });
  centred(page, "(To be submitted at an interval of three month starting from March each year", A4.w / 2, 90, f.bold, 10.5);
  centred(page, "alongwith attendance report)", A4.w / 2, 105, f.bold, 10.5);

  const months: ConveyanceMonth[] = Array.isArray(d.months) ? d.months : [];
  const counted = months.filter((m) => m.amount > 0);
  const short = (ym: string) => monthLabel(ym).slice(0, 3);
  const [from, to] = quarterRange(String(d.quarter));
  const visits = counted.map((m) => `${short(m.month)} ${m.visits}`).join(", ");
  const sameRate = counted.every((m) => m.amount === counted[0]?.amount);
  const amount = sameRate && counted.length ? `${counted[0].amount} x ${counted.length} = ${d.amount}` : `${d.amount}`;

  let top = 142;
  const row = 20;
  blank(page, "1.    Name of the Doctor", s.name, L, top, MID, f, size, ".");
  blank(page, "Perm. I.D. No.", s.epid, COL2, top, R, f, size, ".");
  top += row;
  blank(page, "2.    Designation", s.designation, L, top, MID, f, size, ".");
  blank(page, "3.  Deptt.", s.departmentName, COL2, top, R, f, size, ".");
  top += row;
  blank(page, "4.    Local Residential Address", String(d.address || ""), L, top, R, f, size, ".");
  top += row;
  blank(page, "5.    Type of Vehicle", String(d.vehicleType || ""), L, top, MID, f, size, ".");
  blank(page, "6.  Reg. No.", String(d.vehicleRegNo || ""), COL2, top, R, f, size, ".");
  top += row;
  text(page, "7.    Period for which Conveyance", L, top, f.regular, size);
  top += row;
  blank(page, "Allowance is claimed / from", formatClaimDate(from), L + 22, top, MID, f, size, ".");
  blank(page, "to", formatClaimDate(to), COL2, top, R, f, size, ".");
  top += row;
  blank(page, "8.    No. of visit", visits, L, top, MID, f, size, ".");
  blank(page, "9.  Amount of Claim", amount, COL2, top, R, f, size, ".");
  top += 18;

  // Months of the quarter that are not claimed, with the reason (as written by hand on the paper bill)
  const left = months.filter((m) => m.amount === 0);
  if (left.length) {
    const byReason = new Map<string, string[]>();
    for (const m of left) {
      const reason = CONVEYANCE_MONTH_REASONS[(m.reason || "visits") as keyof typeof CONVEYANCE_MONTH_REASONS];
      byReason.set(reason, [...(byReason.get(reason) || []), monthLabel(m.month).split(" ")[0]]);
    }
    const note = "(" + Array.from(byReason.entries()).map(([reason, names]) => `${names.join(" & ")}: ${reason.toLowerCase()}`).join("; ") + ")";
    const nw = f.italic.widthOfTextAtSize(safe(note), 10);
    text(page, note, R - nw, top, f.italic, 10);
  }
  top += 26;

  text(page, "CERTIFIED THAT :", L, top, f.bold, size);
  top += 24;
  const items = [
    "My residence is a distance of more than one Km. from the place of visit.",
    "The visits were out side duty hours and no vehicle was provided by the hospital.",
    "I did not avail leave for than 15 days in the month of claim I have visited hospital for patient care for more than twenty times in a month besides my normal duty hours.",
    "No other type of conveyance Allowance is being drawn by me.",
    "I am maintaining a visit book of the visits made by me indicating the date, time and place of visit and it has been certified by the Chairman.",
    "I have not claimed the said allowance before, for the aforesaid period nor I will claim it a subsequently.",
  ];
  items.forEach((line, i) => {
    text(page, `${i + 1}.`, L, top, f.regular, size);
    top = paragraph(page, line, { x: L + 22, top, width: R - L - 22, font: f.regular, size, lineHeight: 18.5 });
  });
  text(page, "I hereby declare that the above statement is ture to the best of my knowledge and belief and based", L + 48, top, f.regular, size);
  top += 18.5;
  text(page, "on record.", L + 20, top, f.regular, size);

  top += 40;
  blank(page, "DATED", "", L, top, L + 150, f, size, ".");
  centred(page, "(Signature of the Claimant)", 450, top - 8, f.regular, size);

  top += 36;
  text(page, "Certified that above claim for the aforesaid period is correct has not been claimed before.", L + 45, top, f.regular, size);
  top += 30;
  text(page, "The claim has been entered on page No.", L + 45, top, f.regular, size);
  const dotsFrom = L + 45 + f.regular.widthOfTextAtSize("The claim has been entered on page No. ", size);
  const tail = "of the conveyance";
  const tailX = R - f.regular.widthOfTextAtSize(tail, size);
  const unit = f.regular.widthOfTextAtSize(".", size);
  text(page, ".".repeat(Math.max(3, Math.floor((tailX - dotsFrom - 2) / unit))), dotsFrom, top, f.regular, size);
  text(page, tail, tailX, top, f.regular, size);
  top += 18.5;
  text(page, "allowance Register.", L + 12, top, f.regular, size);

  top += 44;
  centred(page, "(Signature of the Chairman", 455, top, f.italic, size);
  centred(page, "of the Deptt. & Seal)", 455, top + 16, f.italic, size);
}

type Run = { t: string; font: PDFFont; size: number; underline?: boolean };

/** A paragraph whose words differ in face or size (bold or underlined parts); returns the top after it */
function richParagraph(page: PDFPage, runs: Run[], x: number, top: number, width: number, lineHeight: number): number {
  const words: Array<Run & { w: number }> = [];
  for (const run of runs) {
    for (const word of safe(run.t).split(/\s+/).filter(Boolean)) {
      words.push({ ...run, t: word, w: run.font.widthOfTextAtSize(word, run.size) });
    }
  }
  let cursor = x;
  let y = top;
  for (const word of words) {
    const space = word.font.widthOfTextAtSize(" ", word.size);
    if (cursor > x && cursor + word.w > x + width) {
      cursor = x;
      y += lineHeight;
    }
    text(page, word.t, cursor, y, word.font, word.size);
    if (word.underline) {
      // the underline runs on under the space, so underlined words join up
      page.drawLine({ start: { x: cursor, y: fromTop(y) - 2 }, end: { x: cursor + word.w + space, y: fromTop(y) - 2 }, thickness: 0.8, color: BLACK });
    }
    cursor += word.w + space;
  }
  return y + lineHeight;
}

/** Text in a table cell, made smaller when it would not fit */
function cell(page: PDFPage, value: string, x: number, top: number, width: number, font: PDFFont, size = 10) {
  const v = safe(value);
  let s = size;
  while (s > 6.5 && font.widthOfTextAtSize(v, s) > width - 8) s -= 0.5;
  text(page, v, x + 4, top, font, s);
}

/** H.P.C.A. / P.C.A. claim form — wording and layout of the form approved by the PCA Committee */
function pcaPage(page: PDFPage, claim: ClaimForm, f: Fonts, sans: Fonts) {
  const s = claim.snapshot;
  const d = claim.data;
  const L = 70, R = 548, SPLIT = 322;
  const size = 10.5;

  centred(page, "CLAIM FORM", A4.w / 2 - 8, 60, f.bold, 13.5);
  centred(page, "H.P.C.A. / P.C.A. CLAIM", A4.w / 2 - 8, 76, f.bold, 11);
  centred(page, "(This form is not applicable for temporary staff)", A4.w / 2 - 8, 91, f.bold, 11);
  page.drawRectangle({ x: 459, y: fromTop(75), width: 116, height: 32, borderColor: BLACK, borderWidth: 0.9 });
  centred(page, "Claim form approved by", 517, 56, sans.regular, 8.5);
  centred(page, "the PCA Committee", 517, 68, sans.regular, 8.5);

  text(page, "D.No.___________", L + 2, 104, f.regular, size);
  text(page, "Dated:______________", 432, 104, f.regular, size);

  // The table: label on the left, the filled value on the right
  const rows: Array<{ label: string[]; small?: string; height: number }> = [
    { label: ["Name of employee"], height: 23 },
    { label: ["Employee ID Number  |  Salary Register Number"], height: 22 },
    { label: ["Present Designation    |  Pay Level"], height: 22 },
    { label: ["Date of Confirmation / Term of Probation"], height: 22 },
    { label: ["Name of the Department / Office"], height: 22 },
    { label: ["Date of joining (FN/AN) in JNMCH, AKTCH, ZH", "Dental College (Clinic), University Health Service"], height: 25 },
    { label: ["Period for which HPCA / PCA is claimed"], small: "(January to June / July to December)", height: 24 },
    { label: ["If transferred mention name of the previous", "department/office with date"], height: 25 },
  ];
  const tableTop = 116;
  let top = tableTop;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: fromTop(y1) }, end: { x: x2, y: fromTop(y2) }, thickness: 0.8, color: BLACK });
  line(L, top, R, top);
  const values: string[][] = [
    [s.name],
    [s.epid, s.salaryRegisterNo || ""],
    [s.designation, s.payLevel || ""],
    [String(d.confirmation || "")],
    [s.departmentName],
    [`${formatClaimDate(d.joiningDate)} (${d.joiningSession || ""})`],
    [halfYearLabel(String(d.period || ""))],
    [d.transferFrom ? `${d.transferFrom}, ${formatClaimDate(d.transferDate)}` : ""],
  ];
  const splits: Record<number, number> = { 1: 434, 2: 484 }; // rows whose value cell is divided in two
  rows.forEach((row, i) => {
    const two = row.label.length > 1 || !!row.small;
    const base = top + (two ? 10 : row.height / 2 + 3.5);
    text(page, row.label[0], L + 6, base, i === 1 ? sans.regular : f.regular, i === 1 ? 9.5 : size);
    if (row.label[1]) text(page, row.label[1], L + 6, base + 11, f.regular, size);
    if (row.small) text(page, row.small, L + 6, base + 9.5, f.regular, 7.5);
    const valueTop = top + row.height / 2 + 3.5;
    const cut = splits[i];
    if (cut) {
      line(cut, top, cut, top + row.height);
      cell(page, values[i][0], SPLIT, valueTop, cut - SPLIT, f.bold);
      cell(page, values[i][1] || "", cut, valueTop, R - cut, f.bold);
    } else {
      cell(page, values[i][0], SPLIT, valueTop, R - SPLIT, f.bold);
    }
    top += row.height;
    line(L, top, R, top);
  });
  line(L, tableTop, L, top);
  line(R, tableTop, R, top);
  line(SPLIT, tableTop, SPLIT, top);

  // The employee's three statements
  top += 18;
  const statements: Run[][] = [
    [{ t: "I am aware that if, at any stage, the information / documents furnished by me are found to be false, or incorrect, I shall be liable to refund all payments received, alongwith any applicable penalties, to the AMU.", font: f.regular, size }],
    [{ t: "I am regularly performing duties that involve continuous routine contact with patients affected with communicable diseases / I am handling infected materials, instruments and equipment which can spread infection as my primary duty working in healthcare delivery.", font: f.regular, size }],
    [{ t: "My exposure to infected materials /patients contact is of", font: sans.regular, size: 9.5 }, { t: "regular and continuous nature, not occasional.", font: sans.bold, size: 9.5 }],
  ];
  statements.forEach((runs, i) => {
    text(page, `${i + 1}.`, L - 4, top, f.regular, size);
    top = richParagraph(page, runs, L + 8, top, R - L - 8, 12.4);
  });

  top += 16;
  text(page, "Dated:__________", L, top, f.regular, size);
  text(page, "Signature of Employee: -----------------------------", 326, top, f.regular, size);

  // The Chairman / Head's certificate
  top += 21;
  blank(page, "This is to certify that Mr./Mrs.", s.name, L, top, 360, f, size, "_");
  blank(page, "Designation", s.designation, 364, top, 532, f, size, "_");
  text(page, ",", 534, top, f.regular, size);

  top += 20;
  const certificate: Run[][] = [
    [
      { t: "is an", font: f.regular, size },
      { t: "allied healthcare professional", font: f.bold, size: 12.5, underline: true },
      { t: "as per the guidelines mentioned below / Office Memorandum issued by the Ministry of Health and Family Welfare (No.V.28017/23/2018-H-II) and is therefore entitled to claim Hospital Patient Care Allowance / Patient Care Allowance.", font: f.regular, size },
    ],
    [{ t: "is working in close proximity of patients directly / indirectly regular and continuous nature, not occasional.", font: f.regular, size }],
    [{ t: "I undertake to intimate Joint Finance Officer (Salary) if any change occurs in the above employee's duties or status that affects his / her eligibility of HPCA/PCA at later stage and undertake to get indemnify the AMU, if any.", font: f.regular, size }],
  ];
  certificate.forEach((runs, i) => {
    text(page, `${i + 1}.`, L + 18, top, f.regular, size);
    top = richParagraph(page, runs, L + 36, top, R - L - 36, 15.5);
  });

  top += 16;
  centred(page, "Chairman / Head of the Department / Office", 434, top, f.regular, size);
  centred(page, "(Seal & Signature)", 434, top + 13, f.regular, size);
  text(page, "Countersigned by", L + 10, top + 10, sans.regular, 9.5);

  top += 38;
  text(page, "Signature of CMS / CMO", L - 2, top, f.regular, size);
  text(page, "JNMCH / AKTCH / UHS", L - 2, top + 13, f.regular, size);

  // Guidelines printed at the foot of the form
  top += 24;
  centred(page, "Guidelines as per D.No.13/Cr dated 11.1.2023", A4.w / 2, top, sans.bold, 7);
  top += 13;
  const guidelines = [
    "The payment of Patient Care Allowance will be made only to those employees who are either confirmed on their post in the substantive capacity or those who are working on probation through Direct Recruitment.",
    "HPCA /PCA may be admissible in case the individual proceeds on leave / training for less than one calendar month.",
    "HPCA / PCA may not be admissible in case of the individual proceeds on leave / training for equivalent and more than one calendar month.",
    "HPCA / PCA should not be admissible in case of unauthorised leave.",
    "In case there is any contrary decision declaring them ineligible at a later stage for HPCA / PCA, in that case recovery will be made of the amount of HPCA / PCA paid to such employees.",
    "This claim form should be submitted twice a year i.e. in January and July, if fresh claim is not submitted after expiry of claim period, PCA will be stopped.",
  ];
  guidelines.forEach((g, i) => {
    text(page, `${i + 1}.`, L + 2, top, sans.regular, 6.6);
    top = paragraph(page, g, { x: L + 18, top, width: R - L - 18, font: sans.regular, size: 6.6, lineHeight: 8.3 });
  });
}

// ── Children Education Allowance / Hostel Subsidy ──────────────────────────────

type Seg = { t: string; font?: PDFFont; strike?: boolean; underline?: boolean; glue?: boolean } | { blank: number; v?: string };

/** Running text with blanks (filled ones are printed in bold on the line) and struck-out words; returns the top after it */
function flow(page: PDFPage, segs: Seg[], x: number, top: number, width: number, lh: number, f: Fonts, size: number): number {
  type Tok = { w: number; draw: (cx: number, y: number) => void; glue: boolean };
  const toks: Tok[] = [];
  for (const seg of segs) {
    if ("blank" in seg) {
      const v = seg.v ? safe(seg.v) : "";
      const w = Math.max(seg.blank, v ? f.bold.widthOfTextAtSize(v, size) + 10 : 0);
      toks.push({
        w, glue: false,
        draw: (cx, y) => {
          page.drawLine({ start: { x: cx, y: fromTop(y) - 1.5 }, end: { x: cx + w, y: fromTop(y) - 1.5 }, thickness: 0.5, color: BLACK });
          if (v) text(page, v, cx + 4, y - 1, f.bold, size);
        },
      });
      continue;
    }
    const font = seg.font || f.regular;
    for (const word of safe(seg.t).split(/\s+/).filter(Boolean)) {
      const w = font.widthOfTextAtSize(word, size);
      toks.push({
        w, glue: !!seg.glue,
        draw: (cx, y) => {
          text(page, word, cx, y, font, size);
          if (seg.strike) page.drawLine({ start: { x: cx - 1, y: fromTop(y) + size * 0.3 }, end: { x: cx + w + 1, y: fromTop(y) + size * 0.3 }, thickness: 0.8, color: BLACK });
          if (seg.underline) page.drawLine({ start: { x: cx, y: fromTop(y) - 1.5 }, end: { x: cx + w, y: fromTop(y) - 1.5 }, thickness: 0.6, color: BLACK });
        },
      });
    }
  }
  const space = f.regular.widthOfTextAtSize(" ", size);
  let cx = x;
  let y = top;
  let first = true;
  toks.forEach((tok, i) => {
    if (!first && cx + tok.w > x + width) { cx = x; y += lh; first = true; }
    tok.draw(cx, y);
    cx += tok.w + (tok.glue ? 0 : space);
    first = false;
    void i;
  });
  return y + lh;
}

const yesNo = (yes: boolean, _f?: Fonts): Seg[] => [
  { t: "Yes", strike: !yes, glue: true }, { t: "/", glue: true }, { t: "No", strike: yes },
];

const ceaYears = (session: string): [string, string] => {
  const m = /^(\d{4})-(\d{4})$/.exec(session);
  return m ? [m[1], m[2]] : ["", ""];
};

const money = (n: number) => Number(n || 0).toLocaleString("en-IN");
const ordinal = (i: number) => ["1st", "2nd", "3rd", "4th"][i] || `${i + 1}th`;

/** Pages 1 and 2: the proforma itself */
function ceaProforma(p1: PDFPage, p2: PDFPage, claim: ClaimForm, f: Fonts) {
  const s = claim.snapshot;
  const d = claim.data;
  const children: any[] = Array.isArray(d.children) ? d.children : [];
  const L = 56, R = 540, W = R - L;
  const size = 9.5;
  const line = (page: PDFPage, x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: fromTop(y1) }, end: { x: x2, y: fromTop(y2) }, thickness: 0.7, color: BLACK });
  const box = (x: number, top: number, w: number, h: number) =>
    p1.drawRectangle({ x, y: fromTop(top + h), width: w, height: h, borderColor: BLACK, borderWidth: 0.7 });

  // ── Page 1 ──
  const t1 = "PROPOSED PROFORMA FOR RE-IMBURSEMENT OF";
  const t2 = "CHILDREN EDUCATION ALLOWANCE";
  const t3 = "CLAIM FOR THE ACADEMIC YEAR:";
  const ul = (txt: string, top: number, extra = "") => {
    const full = txt + extra;
    centred(p1, full, A4.w / 2, top, f.bold, 12);
    const w = f.bold.widthOfTextAtSize(safe(full), 12);
    line(p1, A4.w / 2 - w / 2, top + 2, A4.w / 2 + w / 2, top + 2);
  };
  ul(t1, 50);
  ul(t2, 65);
  ul(t3, 80, ` ${d.session || ""}`);
  let top = 94;
  if (d.approval && d.approval !== "none") {
    const msg = (CEA_APPROVALS as Record<string, string>)[String(d.approval)] || "";
    if (msg) centred(p1, msg, A4.w / 2, top + 4, f.bold, 9.5);
    top += 14;
  }
  top = paragraph(p1, "I hereby apply for the reimbursement of Children Education Allowance / Hostel Subsidy for my child / children and relevant particulars are furnished below:-",
    { x: L, top: top + 8, width: W, font: f.regular, size: 10, lineHeight: 12.5 });

  // Items 1 to 6
  const labelW = 200, colonX = L + labelW;
  const spouseOn = d.spouseEmployment && d.spouseEmployment !== "none";
  const spouseText = spouseOn
    ? [(SPOUSE_EMPLOYMENT as Record<string, string>)[d.spouseEmployment], d.spouseName].filter(Boolean).join(" - ")
    : "No";
  const rows: Array<{ no: string; label: string; value: string; h: number }> = [
    { no: "1.", label: "Name of the Employee", value: s.name, h: 17 },
    { no: "2.", label: "Employee I.D.", value: s.epid, h: 17 },
    { no: "3.", label: "Designation", value: s.designation, h: 17 },
    { no: "4.", label: "Department / Office", value: s.departmentName, h: 17 },
    { no: "5.", label: "If Spouse is employed, state whether in Central Govt., PSU, State Govt. (give details with name of the Spouse)", value: spouseText, h: 38 },
    { no: "6.", label: "Designation, Office & B.U./PID No. of spouse, if spouse is employed", value: spouseOn ? String(d.spouseDetails || "") : "", h: 26 },
  ];
  top += 3;
  const t1Top = top;
  rows.forEach((r) => {
    line(p1, L, top, R, top);
    text(p1, r.no, L + 3, top + 12, f.regular, size);
    paragraph(p1, r.label, { x: L + 20, top: top + 12, width: labelW - 24, font: f.regular, size, lineHeight: 11.5 });
    text(p1, ":", colonX + 3, top + 12, f.regular, size);
    cell(p1, r.value, colonX + 10, top + 12, R - colonX - 10, f.bold, 10);
    top += r.h;
  });
  line(p1, L, top, R, top);
  line(p1, L, t1Top, L, top); line(p1, R, t1Top, R, top);
  line(p1, colonX, t1Top, colonX, top); line(p1, colonX + 10, t1Top, colonX + 10, top);

  // Table 7: the children
  top += 8;
  text(p1, "7.", L, top + 8, f.bold, size);
  text(p1, "Details of the child / children for whom CEA / Hostel Subsidy claimed:-", L + 20, top + 8, f.bold, size);
  top += 13;
  const c7 = [L, L + 52, L + 160, L + 224, L + 284, R];
  const headTop = top;
  box(L, headTop, W, 28);
  c7.slice(1, -1).forEach((x) => line(p1, x, headTop, x, headTop + 28));
  centred(p1, "Sequence", (c7[0] + c7[1]) / 2, headTop + 17, f.bold, size);
  centred(p1, "Name of the Child", (c7[1] + c7[2]) / 2, headTop + 17, f.bold, size);
  centred(p1, "DOB", (c7[2] + c7[3]) / 2, headTop + 17, f.bold, size);
  centred(p1, "Standard/", (c7[3] + c7[4]) / 2, headTop + 12, f.bold, size);
  centred(p1, "Class", (c7[3] + c7[4]) / 2, headTop + 23, f.bold, size);
  centred(p1, "Name & Place of the", (c7[4] + c7[5]) / 2, headTop + 12, f.bold, size);
  centred(p1, "School/Institution", (c7[4] + c7[5]) / 2, headTop + 23, f.bold, size);
  top += 28;

  // Rows: 1st, 2nd, (twins notice), 3rd, 4th
  type Slot = { label: string; child?: any } | { twins: true };
  const slots: Slot[] = [
    { label: "1st Child", child: children[0] },
    { label: "2nd Child", child: children[1] },
    { twins: true },
    { label: "3rd Child", child: children[2] },
  ];
  if (children[3]) slots.push({ label: "4th Child", child: children[3] });
  const rowH = 22;
  const schoolLine = (c: any) => (c ? String(c.schoolName || "") : "");

  const table7Top = top;
  slots.forEach((slot) => {
    box(L, top, W, rowH);
    if ("twins" in slot) {
      centred(p1, "In case 2nd child birth results in Twins/ Multiple births", A4.w / 2 + 4, top + 15, f.bold, size);
    } else {
      c7.slice(1, -1).forEach((x) => line(p1, x, top, x, top + rowH));
      cell(p1, slot.label, c7[0], top + 15, c7[1] - c7[0], f.regular, size);
      const c = slot.child;
      if (c) {
        cell(p1, c.name, c7[1], top + 15, c7[2] - c7[1], f.bold, 9.5);
        cell(p1, formatClaimDate(c.dob), c7[2], top + 15, c7[3] - c7[2], f.bold, 9.5);
        cell(p1, c.className, c7[3], top + 15, c7[4] - c7[3], f.bold, 9.5);
        cell(p1, schoolLine(c), c7[4], top + 15, c7[5] - c7[4], f.bold, 9.5);
      }
    }
    top += rowH;
  });
  void table7Top;

  // Table 8: re-imbursement
  top += 9;
  text(p1, "8.", L, top + 8, f.bold, size);
  text(p1, "Re-imbursement of Expenditure:-", L + 20, top + 8, f.regular, size);
  top += 13;
  const c8 = [L, L + 52, L + 150, L + 270, L + 340, R];
  const h8 = top;
  box(L, h8, W, 28);
  c8.slice(1, -1).forEach((x) => line(p1, x, h8, x, h8 + 28));
  centred(p1, "Sequence", (c8[0] + c8[1]) / 2, h8 + 17, f.bold, size);
  centred(p1, "Period/AY", (c8[1] + c8[2]) / 2, h8 + 17, f.bold, size);
  centred(p1, "Rate (Rs.)", (c8[2] + c8[3]) / 2, h8 + 17, f.bold, size);
  centred(p1, "Amount", (c8[3] + c8[4]) / 2, h8 + 12, f.bold, size);
  centred(p1, "claimed", (c8[3] + c8[4]) / 2, h8 + 23, f.bold, size);
  centred(p1, "Remarks", (c8[4] + c8[5]) / 2, h8 + 8, f.bold, size);
  centred(p1, "(Passed/Failed)", (c8[4] + c8[5]) / 2, h8 + 17, f.regular, 8);
  centred(p1, "Submit the Documentary Proof", (c8[4] + c8[5]) / 2, h8 + 25, f.regular, 7);
  top += 28;
  slots.forEach((slot) => {
    const c = "twins" in slot ? undefined : slot.child;
    const h = c && c.hostel && c.hostelAmount > 0 ? 32 : rowH;
    box(L, top, W, h);
    if ("twins" in slot) {
      centred(p1, "In case 2nd child birth results in Twins/ Multiple births", A4.w / 2 + 4, top + 15, f.bold, size);
    } else {
      c8.slice(1, -1).forEach((x) => line(p1, x, top, x, top + h));
      cell(p1, slot.label, c8[0], top + 15, c8[1] - c8[0], f.regular, size);
      if (c) {
        cell(p1, String(d.session || ""), c8[1], top + 15, c8[2] - c8[1], f.bold, 9.5);
        cell(p1, `CEA: ${money(c.cea)}`, c8[2], top + (h > rowH ? 13 : 15), c8[3] - c8[2], f.bold, 9.5);
        if (h > rowH) cell(p1, `Hostel: ${money(c.hostelAmount)}`, c8[2], top + 26, c8[3] - c8[2], f.bold, 9.5);
        cell(p1, money(c.amount), c8[3], top + 15, c8[4] - c8[3], f.bold, 9.5);
        cell(p1, c.result === "failed" ? "Failed" : "Passed", c8[4], top + 15, c8[5] - c8[4], f.bold, 9.5);
      }
    }
    top += h;
  });
  box(L, top, W, 19);
  line(p1, c8[3], top, c8[3], top + 19);
  text(p1, "Total Amount Claimed", L + 4, top + 13, f.bold, 10.5);
  cell(p1, money(d.total), c8[3], top + 13, c8[5] - c8[3], f.bold, 10.5);
  top += 19 + 16;

  // Items 9 to 15
  const hostelKids = children.filter((c) => c.hostel);
  const disabledKids = children.filter((c) => c.disabled);
  const anyHostel = hostelKids.length > 0;
  const named = children.length > 1;
  const per = (kids: any[], val: (c: any) => string) =>
    kids.map((c) => (kids.length > 1 || named ? `${String(c.name).split(" ")[0]}: ${val(c)}` : val(c))).join("; ");
  const hostelTotal = hostelKids.reduce((sum, c) => sum + Number(c.hostelAmount || 0), 0);
  const IX = L + 22, IW = R - IX, lh = 15;
  const item = (no: string, segs: Seg[], indent = 0, nolabel = false) => {
    if (!nolabel) text(p1, no, L + 4, top, f.regular, size);
    top = flow(p1, segs, IX + indent, top, IW - indent, lh, f, size);
  };
  item("9.", [{ t: "Distance of Hostel of child from residence of employee (in case Hostel Subsidy):" }, { blank: 60, v: anyHostel ? per(hostelKids, (c) => `${c.hostelDistanceKm} km`) : "" }]);
  item("10.", [{ t: "Amount of CEA / Hostel Subsidy already received up to previous quarter:" }, { blank: 60, v: d.amountAlreadyReceived ? `Rs. ${money(d.amountAlreadyReceived)}` : "" }]);
  item("11.", [{ t: "The Academic year for which CEA / Hostel Subsidy is applied now:" }, { blank: 60, v: String(d.session || "") }]);
  item("12.", [{ t: "(a) Whether the child for whom the CEA is applied for is a disabled child :" }, ...yesNo(disabledKids.length > 0, f)]);
  item("", [{ t: "(b) If yes, indicate the nature of disability:" }, { blank: 80, v: disabledKids.length ? per(disabledKids, (c) => c.disabilityNature || "") : "" }], 12, true);
  item("", [{ t: "(c) Date of disability certificate:" }, { blank: 80, v: disabledKids.length ? per(disabledKids, (c) => (c.disabilityCertDate ? formatClaimDate(c.disabilityCertDate) : "")) : "" }], 12, true);
  item("", [{ t: "(d) Indicate the percentage of disability:" }, { blank: 80, v: disabledKids.length ? per(disabledKids, (c) => (c.disabilityPercent ? `${c.disabilityPercent}%` : "")) : "" }], 12, true);
  item("13.", [{ t: "Whether the Bonafide certificate from Head of Institution has been attached :" }, ...yesNo(true, f)]);
  item("14.", [{ t: "For Hostel Subsidy, the Bonafide certificate mentioning the amount is attached:" }, ...yesNo(anyHostel, f)]);
  item("15.", [{ t: "If Yes at Item No. 14, Amount claimed for Hostel Subsidy: Rs" }, { blank: 80, v: anyHostel ? money(hostelTotal) : "" }, { t: "." }]);

  // ── Page 2 ──
  const P = p2;
  const sz = 10;
  const lh2 = 14;
  const X = L, WD = R - L;
  const central = d.spouseEmployment === "central";
  centred(P, "- 2 -", A4.w / 2, 52, f.regular, 10);
  let y = 76;
  const par = (no: string, segs: Seg[], indent = 22) => {
    if (no) text(P, no, X + (indent > 22 ? indent - 20 : 0), y, f.regular, sz);
    y = flow(P, segs, X + indent, y, WD - indent, lh2, f, sz);
  };
  par("16.", [{ t: "(a) Certified that I or my wife / husband" }, { t: "is", strike: !central, glue: true }, { t: "/", glue: true }, { t: "is not", strike: central }, { t: "Central Government servant." }]);
  par("", [
    { t: "(b) Certified that my wife / husband Sri / Smt" }, { blank: 110, v: spouseOn ? String(d.spouseName || "") : "" }, { t: "is presently working as:" },
    { blank: 110, v: spouseOn ? String(d.spouseDetails || "") : "" }, { t: "in" }, { blank: 80 },
    { t: "and that he / she shall not apply / has not applied for the Children Education Allowance for the child/children mentioned above." },
  ]);
  par("", [{ t: "(c) Certified that I or my wife / husband has not claimed this re-imbursement from any other source and will not claim the same in future." }]);
  y += 8;
  par("17.", [
    { t: "Certified that my child in respect of whom re-imbursement of Children Education Allowance is applied is studying in the School / Jr. College/ Institution which is recognized and/or affiliated to Board of Education / University" },
    { blank: 130 }, { t: "vide Registration/Recognition/Aff. No." }, { blank: 110 }, { t: "." },
  ]);
  y += 8;
  par("18.", [{ t: "Certified that I am claiming the CEA in respect of my two eldest surviving children only, the information furnished above are complete and correct and I have not suppressed any relevant information. In the event of any change in the particulars given above which affect my eligibility for reimbursement of Children Education Allowance, I undertake to intimate the same promptly and also to refund excess payments if any made. Further, I am aware that if at any stage the information / documents furnished above is found to be false, I am liable for disciplinary action and recovery of payment." }]);

  y += 14;
  flow(P, [{ t: "Date:" }, { blank: 100 }], X, y, 200, lh2, f, sz);
  const sigX = 330;
  text(P, "Signature of Employee:", sigX, y + 18, f.bold, sz);
  line(P, sigX, y + 20, sigX + f.bold.widthOfTextAtSize("Signature of Employee:", sz), y + 20);
  flow(P, [{ t: "Name:" }, { blank: 110, v: s.name }], sigX, y + 34, 200, lh2, f, sz);
  y += 82;
  text(P, "Signature with Seal of Head of the Department", sigX - 40, y, f.bold, sz);

  // Office part — left blank, as on the paper
  y += 34;
  P.drawLine({ start: { x: X, y: fromTop(y - 12) }, end: { x: R, y: fromTop(y - 12) }, thickness: 0.4, color: GREY });
  const three = (a: string, b: string, c: string, bold = true) => {
    text(P, a, X, y, bold ? f.bold : f.regular, 9.5);
    centred(P, b, A4.w / 2 + 6, y, bold ? f.bold : f.regular, 9.5);
    text(P, c, R - f.bold.widthOfTextAtSize(c, 9.5), y, bold ? f.bold : f.regular, 9.5);
    y += 15;
  };
  const small = 9.5;
  text(P, "Forwarded to JFO (Salary)", X, y, f.regular, small);
  line(P, X, y + 2, X + f.regular.widthOfTextAtSize("Forwarded to JFO (Salary)", small), y + 2);
  y += 26;
  three("DA (Salary)", "SO (Salary)", "AFO/DFO/JFO (Salary)");
  y += 8;
  const fw = "Forwarded to Service Book & Pension Section with the request to provide a copy of detail of family of employee concerned.";
  const yy = y;
  y = paragraph(P, fw, { x: X, top: y, width: WD, font: f.bold, size: small, lineHeight: 12.5 });
  [yy, yy + 12.5].forEach((t, i) => {
    const ln = wrap(fw, f.bold, small, WD)[i] || "";
    line(P, X, t + 2, X + f.bold.widthOfTextAtSize(ln, small), t + 2);
  });
  y += 2;
  flow(P, [{ t: "As desired, a copy of detail of family of Mr./Mrs." }, { blank: 110, v: s.name }, { t: "is enclosed." }], X, y, WD, lh2, f, small);
  y += 24;
  three("DA (SB&PS)", "SO (SB&PS)", "AR/JR (SB&PS)");
  y += 6;
  text(P, "AFO/DFO/JFO (Salary)", X, y, f.bold, small);
  y += 14;
  const box2 = (x: number, top: number) => P.drawRectangle({ x, y: fromTop(top + 1), width: 9, height: 9, borderColor: BLACK, borderWidth: 0.7 });
  text(P, "Eligible to be forwarded to Director of School Education", X, y, f.regular, small);
  const ex = X + f.regular.widthOfTextAtSize("Eligible to be forwarded to Director of School Education  ", small);
  box2(ex, y); text(P, "YES", ex + 12, y, f.bold, small);
  box2(ex + 50, y); text(P, "NO", ex + 62, y, f.bold, small);
  y += 14;
  y = flow(P, [{ t: "If Forwarded, Cumulative No." }, { blank: 30 }, { t: "/100(If School is Local), Cumulative No." }, { blank: 30 }, { t: "/25 (If out of Aligarh) in FY:" }, { blank: 40 }], X, y, WD, 13, f, 8.5);
  y += 4;
  const st = "Forwarded to Director of School Education with the request to verify the recognition/Affiliation status of the School concerned and return the same to this office.";
  const st2 = wrap(st, f.italic, small, WD);
  st2.forEach((ln, i) => {
    text(P, ln, X, y + i * 12.5, f.italic, small);
    line(P, X, y + i * 12.5 + 2, X + f.italic.widthOfTextAtSize(ln, small), y + i * 12.5 + 2);
  });
  y += st2.length * 12.5 + 18;
  three("DA (Salary)", "SO (Salary)", "AFO/DFO/JFO (Salary)");
  y += 6;
  flow(P, [{ t: "Report of Director of School Education:" }, { blank: 150 }], X, y, WD, lh2, f, small);
  y += 30;
  text(P, "DA / SO (DSE)", X, y, f.bold, small);
  text(P, "Director (DSE)", X + 230, y, f.bold, small);
}

/** Annexure 'B' — one page per child; the school fills in everything except the child's particulars */
function ceaAnnexure(page: PDFPage, claim: ClaimForm, f: Fonts, child: any, pageNo: number) {
  const d = claim.data;
  const s = claim.snapshot;
  const L = 70, R = 525, W = R - L;
  const sz = 11;
  const son = child.relation === "S";
  const [y1, y2] = ceaYears(String(d.session || ""));
  centred(page, `-:${pageNo}:-`, A4.w / 2, 52, f.regular, 10);
  const at = "Annexure 'B'";
  text(page, at, R - f.bold.widthOfTextAtSize(at, 11), 80, f.bold, 11);
  line2(page, R - f.bold.widthOfTextAtSize(at, 11), 82, R);
  centred(page, "CEA: CERTIFICATE FROM THE HEAD OF INSTITUTION/SCHOOL", A4.w / 2, 110, f.bold, 12);
  line2(page, A4.w / 2 - f.bold.widthOfTextAtSize("CEA: CERTIFICATE FROM THE HEAD OF INSTITUTION/SCHOOL", 12) / 2, 112, A4.w / 2 + f.bold.widthOfTextAtSize("CEA: CERTIFICATE FROM THE HEAD OF INSTITUTION/SCHOOL", 12) / 2);
  let y = paragraph(page, "Authority vide Government of India Ministry of Personal P.G. and Department of Personal & Training New Delhi Order No.A-27102(02)2017 Estt.(AL) 16 August 2017.",
    { x: L + 20, top: 138, width: W - 20, font: f.regular, size: 10.5, lineHeight: 14, centre: false });
  centred(page, "Certificate from the Head of Institution/School", A4.w / 2, y + 12, f.bold, 12);
  centred(page, "(For Re-imbursement CEA)", A4.w / 2, y + 27, f.bold, 12);
  y += 56;
  flow(page, [{ t: "Ref No." }, { blank: 110 }], L, y, 200, 18, f, sz);
  flow(page, [{ t: "Date:" }, { blank: 100 }], R - 140, y, 140, 18, f, sz);
  y += 34;
  const lh = 24;
  y = flow(page, [
    { t: "It is certified that" },
    { t: "Master", strike: !son, glue: true }, { t: "/", glue: true }, { t: "Kumari", strike: son },
    { blank: 150, v: child.name }, { t: "having Admission No." }, { blank: 70 },
    { t: "D.O.B." }, { blank: 80, v: formatClaimDate(child.dob) },
    { t: "Son", strike: !son, glue: true }, { t: "/", glue: true }, { t: "Daughter", strike: son }, { t: "of Mr./Mrs." }, { blank: 140, v: s.name },
    { t: "was studying in Class" }, { blank: 50, v: child.className }, { t: "Sec." }, { blank: 40 }, { t: "Roll No." }, { blank: 50 },
    { t: "during the Previous Academic year from 20" }, { blank: 28, v: y1.slice(2) }, { t: "to 20" }, { blank: 28, v: y2.slice(2) },
    { t: "School / Institution, namely" }, { blank: 170, v: child.schoolName }, { t: "vide affiliation Reg. No." }, { blank: 70 },
    { t: "code" }, { blank: 70 }, { t: "and pattern" }, { blank: 80 }, { t: "Curriculum." },
  ], L, y, W, lh, f, sz);
  y += 18;
  text(page, "Date :", L, y, f.regular, 10);
  text(page, "Place:", L, y + 24, f.regular, 10);
  y += 56;
  text(page, "Signature of Principal", R - 150, y, f.regular, sz);
  text(page, "(Affix School seal)", R - 140, y + 40, f.bold, sz);
  text(page, `Contd..P/${pageNo + 1}`, A4.w / 2 - 25, 700, f.regular, 9);
}

const line2 = (page: PDFPage, x1: number, top: number, x2: number) =>
  page.drawLine({ start: { x: x1, y: fromTop(top) }, end: { x: x2, y: fromTop(top) }, thickness: 0.7, color: BLACK });

/** Self Declaration of the Govt. servant — one page per child */
function ceaSelfDeclaration(page: PDFPage, claim: ClaimForm, f: Fonts, child: any, pageNo: number) {
  const d = claim.data;
  const s = claim.snapshot;
  const L = 70, R = 525, W = R - L;
  const sz = 11.5;
  const son = child.relation === "S";
  centred(page, `-:${pageNo}:-`, A4.w / 2, 52, f.regular, 10);
  const t1 = "CEA: Self Declaration to be submitted by the Govt. Servant";
  const t2 = "Self Declaration";
  centred(page, t1, A4.w / 2, 100, f.bold, 12.5);
  line2(page, A4.w / 2 - f.bold.widthOfTextAtSize(t1, 12.5) / 2, 102, A4.w / 2 + f.bold.widthOfTextAtSize(t1, 12.5) / 2);
  centred(page, t2, A4.w / 2, 120, f.bold, 12.5);
  line2(page, A4.w / 2 - f.bold.widthOfTextAtSize(t2, 12.5) / 2, 122, A4.w / 2 + f.bold.widthOfTextAtSize(t2, 12.5) / 2);
  let y = flow(page, [
    { t: "I" }, { blank: 170, v: s.name }, { t: "designation" }, { blank: 150, v: s.designation },
    { t: "I.D.No." }, { blank: 90, v: s.epid }, { t: "Dept/Office" }, { blank: 220, v: s.departmentName },
    { t: "do hereby certify that my" }, { t: "Son", strike: !son, glue: true }, { t: "/", glue: true }, { t: "Daughter", strike: son },
    { t: "namely" }, { blank: 150, v: child.name }, { t: "Studied in class" }, { blank: 60, v: child.className },
    { t: "Section" }, { blank: 50 }, { t: "Roll No." }, { blank: 60 }, { t: "during Previous Academic Year" }, { blank: 80, v: String(d.session || "") },
    { t: "in" }, { blank: 280, v: child.schoolName }, { t: "School." },
  ], L, 170, W, 30, f, sz);
  y += 10;
  y = paragraph(page, "\"In the event of any change in the particulars given above which affect my eligibility for Children Education Allowance. I undertake to intimate the same promptly and refund excess payment, if any made to me.\"",
    { x: L + 20, top: y, width: W - 20, font: f.italic, size: 11.5, lineHeight: 18 });
  y += 24;
  const X = 330;
  const lines: Array<[string, string]> = [["Signature :", ""], ["I.D. No :.", s.epid], ["Name :", s.name], ["Designation :", s.designation], ["Department :", s.departmentName]];
  lines.forEach(([lab, val], i) => {
    flow(page, [{ t: lab }, { blank: 150, v: val }], X, y + i * 26, 250, 20, f, sz);
  });
  flow(page, [{ t: "Dated :" }, { blank: 110 }], L + 20, y + 50, 200, 20, f, sz);
}

/** The whole print of one claim: the form itself and, for NPA, the undertaking */
export async function buildClaimPdf(claim: ClaimForm): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const def = CLAIM_FORM_DEFS[claim.formType];
  pdf.setTitle(`${def.title} - ${claim.refNo}`);
  pdf.setProducer("AMU Salary Section");

  const page = pdf.addPage([A4.w, A4.h]);
  if (claim.formType === "cea") {
    const serif: Fonts = {
      regular: await pdf.embedFont(StandardFonts.TimesRoman),
      bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    };
    const kids: any[] = Array.isArray(claim.data.children) ? claim.data.children : [];
    const total = 2 + 2 * kids.length;
    const second = pdf.addPage([A4.w, A4.h]);
    ceaProforma(page, second, claim, serif);
    await footer(pdf, page, claim, fonts, `CEA claim (page 1 of ${total})`);
    await footer(pdf, second, claim, fonts, `CEA claim (page 2 of ${total})`, false);
    let n = 2;
    for (const [i, child] of kids.entries()) {
      void i;
      const annex = pdf.addPage([A4.w, A4.h]);
      ceaAnnexure(annex, claim, serif, child, 3);
      await footer(pdf, annex, claim, fonts, `CEA claim (page ${++n} of ${total}) - school certificate`, false);
      const decl = pdf.addPage([A4.w, A4.h]);
      ceaSelfDeclaration(decl, claim, serif, child, 4);
      await footer(pdf, decl, claim, fonts, `CEA claim (page ${++n} of ${total}) - self declaration`, false);
    }
  } else if (claim.formType === "conveyance" || claim.formType === "pca") {
    // these two forms are set in a serif face
    const serif: Fonts = {
      regular: await pdf.embedFont(StandardFonts.TimesRoman),
      bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    };
    if (claim.formType === "conveyance") {
      conveyancePage(page, claim, serif);
      await footer(pdf, page, claim, fonts, "Conveyance Allowance Bill");
    } else {
      pcaPage(page, claim, serif, fonts);
      // the form has its own D.No. / Dated line at the top, so no dispatch box at the foot
      await footer(pdf, page, claim, fonts, "HPCA / PCA claim form", false);
    }
  } else {
    if (claim.formType === "npa") npaPage(page, claim, fonts);
    else hraPage(page, claim, fonts);
    await footer(pdf, page, claim, fonts, def.needsUndertaking ? `${def.shortTitle} certificate (page 1 of 2)` : `${def.shortTitle} certificate`);
  }

  if (def.needsUndertaking) {
    const second = pdf.addPage([A4.w, A4.h]);
    undertakingPage(second, claim, fonts);
    await footer(pdf, second, claim, fonts, "Undertaking (page 2 of 2)", false);
  }
  return pdf.save();
}
