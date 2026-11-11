// Printable claim forms (A4) — same wording and layout as the office's paper forms.
// ─────────────────────────────────────────────────────────────────────────────
// The system only fills the blanks (name, ID, designation, department, dates) and
// adds one strip at the foot of the page: a reference ID with a QR code (so the
// uploaded scan can be matched to the right claim) and the dispatch number / date
// the department writes by hand. Signatures are always left blank.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import crypto from "crypto";
import {
  CLAIM_FORM_DEFS, CONVEYANCE_MONTH_REASONS, formatClaimDate, monthLabel, quarterRange,
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
function blank(page: PDFPage, label: string, value: string, x: number, top: number, endX: number, fonts: Fonts, size: number, filler: "-" | "." = "-") {
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
  if (claim.formType === "conveyance") {
    // the office's bill is set in a serif face
    conveyancePage(page, claim, {
      regular: await pdf.embedFont(StandardFonts.TimesRoman),
      bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
      italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    });
    await footer(pdf, page, claim, fonts, "Conveyance Allowance Bill");
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
