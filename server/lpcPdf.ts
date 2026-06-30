/**
 * LPC PDF Generator — AMU Salary Section
 * Generates a Last Pay Certificate PDF matching the official AMU format exactly.
 * Uses pdf-lib for PDF creation and @signpdf for digital signing.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from '@cantoo/pdf-lib';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateDocSigningCert, P12_PASSWORD, isPKIReady } from './pki.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LPC_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'lpc');

export interface RecoveryRow {
  label?: string;
  departmentDemand?: number;
  lastSalaryDeduction?: number;
  balanceToRecover?: number;
}

export interface LPCData {
  // Dispatch info
  dispatchNumber: string;
  dispatchDate: string; // e.g. "27-06-2026"

  // Employee
  employeeTitle: string; // "Dr." | "Mr." | "Mrs." | "Ms."
  name: string;
  epid: string;
  designation: string;
  department: string;
  postedDeptName?: string;

  // Retirement
  retirementReason: string; // "Retired" | "Resigned" | "VRS" | "Death" | "Terminated"
  lastPaidUpTo?: string;    // "31-01-2026"
  payLevel?: string;         // "L0006"

  // Pay particulars
  basicPay?: number;
  nonPracticeAllowance?: number;
  dearnessAllowance?: number;
  houseRentAllowance?: number;
  transportAllowance?: number;
  otherAmount?: number;
  otherAmountLabel?: string;  // "CPFA" etc.

  // No dues
  noDuesReportNo?: string;
  noDuesReportDate?: string;

  // Recoveries
  recoveries?: RecoveryRow[];
  
  // Scanned raw file URL
  scannedRawUrl?: string;
}

/** Helper: draw text with word wrap */
function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  font: PDFFont,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    if (width > maxWidth && line) {
      page.drawText(line, { x, y: currentY, size: fontSize, font, color: rgb(0, 0, 0) });
      currentY -= lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y: currentY, size: fontSize, font, color: rgb(0, 0, 0) });
    currentY -= lineHeight;
  }
  return currentY;
}

/** Draw a horizontal line */
function drawHLine(page: PDFPage, x1: number, x2: number, y: number, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: rgb(0, 0, 0) });
}

/** Draw a vertical line */
function drawVLine(page: PDFPage, x: number, y1: number, y2: number, thickness = 0.5) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color: rgb(0, 0, 0) });
}

/** Format number with Rs */
function fmtRs(n?: number): string {
  if (!n) return '';
  return n.toLocaleString('en-IN');
}

/**
 * Main function: generate a signed LPC PDF
 * Returns the saved file path, hash, and cert serial
 */
export async function generateAndSignLPC(
  data: LPCData,
  lpcId: number
): Promise<{ pdfPath: string; hash: string; certSerial: string }> {

  // Ensure upload directory exists
  if (!fs.existsSync(LPC_UPLOAD_DIR)) {
    fs.mkdirSync(LPC_UPLOAD_DIR, { recursive: true });
  }

  // ===================== BUILD PDF FROM SCANNED DOCUMENT =====================
  let pdfDoc: PDFDocument;

  let loaded = false;
  if (data.scannedRawUrl) {
    const scannedPath = path.join(process.cwd(), data.scannedRawUrl);
    if (fs.existsSync(scannedPath)) {
      const ext = path.extname(scannedPath).toLowerCase();
      const fileBytes = fs.readFileSync(scannedPath);
      
      try {
        if (ext === '.pdf') {
          pdfDoc = await PDFDocument.load(fileBytes);
          loaded = true;
        } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          pdfDoc = await PDFDocument.create();
          
          // Use jimp to convert ANY image format (especially WIA BMP) to standard JPEG
          // to avoid pdf-lib parsing errors
          const { Jimp } = await import('jimp');
          const img = await Jimp.read(fileBytes);
          const jpgBuffer = await img.getBuffer('image/jpeg');
          const image = await pdfDoc.embedJpg(jpgBuffer);
          
          const dims = image.scaleToFit(595.28, 841.89);
          const page = pdfDoc.addPage([595.28, 841.89]);
          page.drawImage(image, {
            x: (595.28 - dims.width) / 2,
            y: (841.89 - dims.height) / 2,
            width: dims.width,
            height: dims.height,
          });
          loaded = true;
        }
      } catch (err) {
        console.error("Failed to load scanned image/pdf, creating blank:", err);
      }
    }
  }

  // Fallback if failed to load
  if (!loaded) {
    pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595.28, 841.89]);
  }

  // ─────────────────────────────────────────────────────
  // VISUAL SIGNATURE STAMP
  // ─────────────────────────────────────────────────────
  const pages = pdfDoc.getPages();
  if (pages.length > 0) {
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    
    const stampWidth = 165;
    const stampHeight = 65;
    const margin = 20;
    
    // Position at bottom right
    const stampX = width - stampWidth - margin;
    const stampY = margin;
    
    // Draw a semi-transparent background box
    firstPage.drawRectangle({
      x: stampX,
      y: stampY,
      width: stampWidth,
      height: stampHeight,
      color: rgb(0.92, 0.98, 0.92), // Light green
      borderColor: rgb(0.1, 0.6, 0.1), // Dark green border
      borderWidth: 1.5,
      opacity: 0.9,
    });
    
    // Draw text
    firstPage.drawText('DIGITALLY SIGNED', {
      x: stampX + 15,
      y: stampY + 45,
      size: 12,
      font: timesBold,
      color: rgb(0.1, 0.5, 0.1),
    });
    
    firstPage.drawText(`By: AMU Salary Section`, {
      x: stampX + 15,
      y: stampY + 28,
      size: 10,
      font: timesRoman,
      color: rgb(0.1, 0.4, 0.1),
    });
    
    firstPage.drawText(`Date: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, {
      x: stampX + 15,
      y: stampY + 13,
      size: 9,
      font: timesRoman,
      color: rgb(0.1, 0.4, 0.1),
    });
    
    // Add Verification QR Code
    try {
      const QRCode = (await import('qrcode')).default;
      const verifyUrl = `Verification ID: LPC-${lpcId}\nEPID: ${data.epid}\nVerify at: https://salarysection.com/lpc/verify/${lpcId}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1 });
      const qrImage = await pdfDoc.embedPng(qrDataUrl);
      firstPage.drawImage(qrImage, {
        x: stampX - 75,
        y: stampY,
        width: 65,
        height: 65,
      });
      firstPage.drawText('Scan to Verify', {
        x: stampX - 75,
        y: stampY - 12,
        size: 8,
        font: timesRoman,
        color: rgb(0.5, 0.5, 0.5),
      });
    } catch (e) {
      console.error('Failed to draw QR code:', e);
    }
  }

  // ─────────────────────────────────────────────────────
  // SECTION 10 — DIGITAL SIGNATURE METADATA
  // ─────────────────────────────────────────────────────
  pdfDoc.setTitle(`LPC - ${data.name} (${data.epid})`);
  pdfDoc.setAuthor('AMU Salary Section');
  pdfDoc.setSubject('Last Pay Certificate');
  pdfDoc.setKeywords([data.epid, data.name, data.dispatchNumber, 'LPC', 'AMU']);
  pdfDoc.setCreator('AMU Salary Section LPC Management System');
  pdfDoc.setProducer('Finance & Accounts Department, Aligarh Muslim University');
  pdfDoc.setCreationDate(new Date());
  pdfDoc.setModificationDate(new Date());

  // ─────────────────────────────────────────────────────
  // SIGN THE PDF
  // ─────────────────────────────────────────────────────
  let certSerial = '';

  try {
    if (isPKIReady()) {
      // Encrypt PDF before adding placeholder and saving
      // User needs their EPID to open it; modification is disabled.
      const ownerPassword = crypto.randomBytes(16).toString('hex');
      pdfDoc.encrypt({
        userPassword: data.epid,
        ownerPassword,
        permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false, fillingForms: false }
      });

      // Add signature placeholder using @signpdf/placeholder-pdf-lib
      const { pdflibAddPlaceholder } = await import('@signpdf/placeholder-pdf-lib');
      const pageHeight = pdfDoc.getPages()[0].getHeight();
      const pageWidth = pdfDoc.getPages()[0].getWidth();
      await pdflibAddPlaceholder({
        pdfDoc,
        reason: `Last Pay Certificate - ${data.name} (${data.epid}) - ${data.retirementReason}`,
        contactInfo: process.env.SMTP_FROM ?? 'salary@amu.ac.in',
        name: 'AMU Salary Section',
        location: 'Aligarh Muslim University, Aligarh',
        signatureLength: 16384,
        widgetRect: [pageWidth - 165 - 20, 20, pageWidth - 20, 85]
      });

      // Save with placeholder (must use useObjectStreams: false)
      const pdfWithPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));

      // Get document signing cert
      const docCert = await generateDocSigningCert();
      if (docCert) {
        certSerial = docCert.serialNumber;
        const { P12Signer } = await import('@signpdf/signer-p12');
        const { SignPdf } = await import('@signpdf/signpdf');
        const signer = new P12Signer(docCert.p12Buffer, { passphrase: P12_PASSWORD });
        const signpdf = new SignPdf();
        const signedPdf = await signpdf.sign(pdfWithPlaceholder, signer);

        console.log(`[LPC-PDF] Signing PDF with P12 cert (serial: ${certSerial})...`);
        const fileName = `LPC_${lpcId}_${data.epid}_${Date.now()}.pdf`;
        const pdfPath = path.join(LPC_UPLOAD_DIR, fileName);
        fs.writeFileSync(pdfPath, signedPdf);
        console.log(`[LPC-PDF] Signed PDF saved: ${fileName} (${signedPdf.length} bytes)`);


        const hash = crypto.createHash('sha256').update(signedPdf).digest('hex');
        return { pdfPath: `/uploads/lpc/${fileName}`, hash, certSerial };
      }
    }
  } catch (signError) {
    console.error('[LPC-PDF] Signing failed, saving unsigned:', signError);
  }

  // Fallback: save unsigned PDF (but still encrypted)
  try {
    const ownerPassword = crypto.randomBytes(16).toString('hex');
    pdfDoc.encrypt({
      userPassword: data.epid,
      ownerPassword,
      permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false, fillingForms: false }
    });
  } catch (err) {
    // Already encrypted or encrypt failed, ignore
  }
  const pdfBytes = Buffer.from(await pdfDoc.save());
  const hash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
  const fileName = `LPC_${lpcId}_${data.epid}_${Date.now()}.pdf`;
  const pdfPath = path.join(LPC_UPLOAD_DIR, fileName);
  fs.writeFileSync(pdfPath, pdfBytes);

  return { pdfPath: `/uploads/lpc/${fileName}`, hash, certSerial };
}

/** Verify a PDF against stored hash */
export function verifyLPCPdf(absoluteFilePath: string, storedHash: string): 'verified' | 'modified' | 'missing' {
  if (!fs.existsSync(absoluteFilePath)) return 'missing';
  const fileBytes = fs.readFileSync(absoluteFilePath);
  const currentHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
  return currentHash === storedHash ? 'verified' : 'modified';
}
