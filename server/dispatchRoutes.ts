/**
 * Document Dispatch System — API Routes
 * 
 * Completely separate from main routes.ts to avoid modifying existing code.
 * Registered via registerDispatchRoutes(app) in server/index.ts.
 */

import type { Express, Request, Response } from "express";
import { safeUploadName } from "./security";
import { requireBodyDepartment } from "./auth";
import {
  DAK_UPLOAD_DIR, CLOSED_STATUSES, CLOSED_SQL, DISPOSAL_TYPES, SLA_DAYS, slaDueDate, isoDateOrNull, receiptMoment,
  lockRegister, usedInwardNumbers, nextInwardNumber, nextOutwardNumber, normalizeNo, myRecipientRow,
  who, track, toInboxItem, linkDakToFile, queueOcr, createOutwardDispatch, sendDispatchEmails, DakError,
  recipientsWithNames, publicBaseUrl, DISPATCH_MODES,
} from "./dakCore";
import { sessionStaff } from "./auth";
import { notify, type Recipient } from "./notify";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db } from "./db";
import {
  departments,
  dispatchDocuments,
  dispatchRecipients,
  dispatchTracking,
  departmentGroups,
  departmentGroupMembers,
  externalContacts,
  employees,
} from "../shared/schema";
import { eq, and, or, desc, asc, sql, inArray, ilike } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── File Upload Config ───────────────────────────────────────────────────
const uploadDir = DAK_UPLOAD_DIR;

const dispatchStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    // Extension from the checked file type, never from the user's file name
    cb(null, safeUploadName("dispatch", file));
  },
});

const dispatchUpload = multer({
  storage: dispatchStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "application/pdf"];
    if (allowed.includes(file.mimetype) || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

/** Tell staff logins that a dak was marked to them */
function notifyMarked(staffIds: number[], by: string, inwardNumber: string | null, doc: any, remarks?: string | null, due?: string | null) {
  const subject = doc?.isConfidential ? "CONFIDENTIAL" : ((doc?.aiExtractedData as any)?._actualSubject || doc?.subject || "");
  return notify("dak.marked", staffIds.map((id): Recipient => ({ kind: "staff", staffId: id })), {
    title: `Dak ${inwardNumber || ""} marked to you`,
    text: `${subject} (from ${doc?.senderName || "-"})${remarks ? ` — ${remarks}` : ""}${due ? `. Action by ${due}` : ""}. Marked by ${by}`,
    link: "/dashboard/dispatch",
  });
}

// ─── Helper: Convert PDF first page to image using sharp ──────────────────
async function convertPdfToImage(pdfPath: string): Promise<string> {
  try {
    // Use pdf2pic which is already in package.json
    const pdf2picModule = await import("pdf2pic");
    const fromPath = (pdf2picModule as any).fromPath ?? (pdf2picModule as any).default?.fromPath;
    
    if (!fromPath) {
      throw new Error("fromPath could not be loaded from pdf2pic");
    }

    const outputName = `dispatch-converted-${Date.now()}`;
    const options = {
      density: 200,
      saveFilename: outputName,
      savePath: uploadDir,
      format: "jpeg" as const,
      width: 1200,
      height: 1600,
    };
    
    const converter = fromPath(pdfPath, options);
    const result = await converter(1); // Convert first page
    
    const rp = (result as any)?.path ?? (result as any)?.name;
    if (rp) {
      return rp;
    }
    
    // Fallback: Check if file was created in uploadDir anyway
    const expectedPath = path.join(uploadDir, `${outputName}.1.jpeg`);
    if (fs.existsSync(expectedPath)) {
      return expectedPath;
    }

    throw new Error("PDF conversion returned no path");
  } catch (error: any) {
    console.error("[Dispatch] PDF to image conversion error:", error);
    // Fallback: try with sharp directly if pdf2pic fails
    try {
      const sharp = (await import("sharp")).default;
      const outputPath = path.join(uploadDir, `dispatch-converted-${Date.now()}.jpg`);
      await sharp(pdfPath, { pages: 1 })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
      return outputPath;
    } catch (sharpError) {
      console.error("[Dispatch] Sharp PDF fallback also failed:", sharpError);
      
      try {
        console.log("[Dispatch] Trying pdf-img-convert fallback...");
        const pdfImgConvert = await import("pdf-img-convert");
        const converter = pdfImgConvert.convert || (pdfImgConvert as any).default?.convert;
        
        if (converter) {
          const pdfArray = await converter(pdfPath, { page_numbers: [1] });
          if (pdfArray && pdfArray.length > 0) {
            const outputPath = path.join(uploadDir, `dispatch-converted-pic-${Date.now()}.jpg`);
            fs.writeFileSync(outputPath, pdfArray[0]);
            return outputPath;
          }
        }
      } catch (picError: any) {
        console.error("[Dispatch] pdf-img-convert fallback also failed:", picError);
        throw new Error(`PDF conversion failed. Missing Ghostscript? Fallback error: ${picError.message || String(picError)}`);
      }
      
      throw new Error(`Could not convert PDF to image. Please install ghostscript on server.`);
    }
  }
}

// ─── Helper: Optimize image size for AI API ───────────────────────────────
async function optimizeImageForApi(imagePath: string): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    const optimized = await sharp(imagePath)
      .resize(1200, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return optimized;
  } catch (error) {
    console.error("[Dispatch] Image optimization failed, using original:", error);
    return fs.readFileSync(imagePath);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER ALL DISPATCH ROUTES
// ═══════════════════════════════════════════════════════════════════════════
export function registerDispatchRoutes(app: Express) {
  console.log("[Dispatch] Registering document dispatch routes...");

  // ─── AI Document Extraction Proxy ───────────────────────────────────────
  // Accepts both scanned images AND uploaded PDFs.
  // If PDF: converts first page to image before sending to AI.
  // If image: optimizes size before sending to AI.
  // If AI fails: returns error with uploadedFileUrl so frontend can show manual form.
  app.post(
    "/api/dispatch/extract",
    dispatchUpload.single("file"),
    async (req: any, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        const reqType = req.body.type || "dispatch";
        
        const originalFileUrl = `/uploads/dispatch/${path.basename(req.file.path)}`;
        const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");

        let imageBufferForApi: Buffer;
        let imageFilenameForApi = req.file.originalname;

        if (isPdf) {
          // Convert PDF to image for AI processing
          try {
            const convertedImagePath = await convertPdfToImage(req.file.path);
            imageBufferForApi = await optimizeImageForApi(convertedImagePath);
            imageFilenameForApi = path.basename(convertedImagePath);
          } catch (convError: any) {
            console.error("[Dispatch] PDF conversion failed:", convError);
            // Return file info without AI extraction — frontend shows manual form
            return res.json({
              result: null,
              extractionFailed: true,
              failureReason: "PDF conversion failed: " + convError.message,
              uploadedFileUrl: originalFileUrl,
              uploadedFileType: "pdf",
              uploadedFileName: req.file.originalname,
            });
          }
        } else {
          // Optimize image for API
          imageBufferForApi = await optimizeImageForApi(req.file.path);
        }
        const ollamaApiUrl = reqType === "receive" ? process.env.RECEIVE_OLLAMA_API_URL : process.env.DISPATCH_OLLAMA_API_URL;
        const ollamaApiKey = reqType === "receive" ? process.env.RECEIVE_OLLAMA_API_KEY : process.env.DISPATCH_OLLAMA_API_KEY;
        const ollamaModel = reqType === "receive" ? process.env.RECEIVE_OLLAMA_MODEL : process.env.DISPATCH_OLLAMA_MODEL;

        const fallbackApiUrl = process.env.DISPATCH_API_URL || "https://dispatch-api.salarysection.com/v1/dispatch/extract";
        const fallbackApiKey = process.env.DISPATCH_API_KEY || "test-1234";

        // Try Ollama first if configured
        let aiResult: any = null;
        let aiSuccess = false;
        let aiError = "";

        const basePrompt = `You are AMU Dispatch AI. You work like an experienced dispatch clerk in a Central Government University office. You read official documents (printed, handwritten, stamped, scanned, skewed, cropped, English/Hindi/Urdu/mixed) and extract information for a Dispatch Register. Your output directly auto-fills a Dispatch Form. Accuracy > completeness. You are a Document Understanding AI, not a plain OCR engine: first understand the document's purpose, then extract fields.

OUTPUT RULES (STRICT)
- Output ONLY one valid JSON object. No markdown, no code fences, no explanation, no OCR dump, no notes, before or after.
- Double quotes only, no trailing commas, no comments.
- If information cannot be safely determined, use JSON null — never "Unknown", "N/A", "None", "-", "", or "?".

JSON SCHEMA (exact fields)
{
"document_type": null,
"recipient_department": null,
"sender_department": null,
"subject": null,
"dispatch_number": null,
"dispatch_date": null,
"employee_related": false,
"employees": [{"name": null, "employee_id": null, "designation": null, "department": null}],
"attachments": [],
"confidence": "HIGH"
}
(employees/attachments = [] if none found)

FIELD CATEGORIES
A. Direct extraction (clearly written) — e.g. dispatch no., memo no., date, employee ID, department name. Extract exactly.
B. Guided inference (not written but confidently inferable from strong evidence) — allowed ONLY for: document_type, subject (if missing), recipient_department (from routing/forwarding). Never fabricate; base only on document content.
C. Unknown — if not extractable or inferable with confidence, return null. Never guess.

HALLUCINATION POLICY — never invent: employee IDs, dispatch numbers, memo numbers, dates, department names, reference numbers. If unreadable, null. Only subject and document_type may be intelligently generated, and only from facts actually present.

READ EVERYTHING: printed/typed text, rubber stamps, handwritten notes, margin notes, forwarding notes, endorsements, initials, routing slips, headers/footers, tables, serial numbers, seals, reference numbers, dates. Never assume the first visible info is correct — scan the whole page/all pages first.

HANDWRITING & ROUTING (important)
- Handwritten notes are equally important as print; never ignore them.
- If a document has multiple routing markings, priority order for "current recipient": (1) handwritten forwarding note, e.g. "Send to Salary Section", (2) official "To:" address block, (3) dispatch endorsement, (4) rubber stamp, (5) CC section.
- Example: typed "To: Chairman, Dept. of Physics" but handwritten "Send to Salary Section" -> recipient_department = "Salary Section".
- Recipient is the FINAL intended office, never confuse with sender. Verify recipient != sender before finalizing.
- Common handwritten office markings to watch for: "Send to X", "Urgent", "Immediate", "Verified", "Please process", "Finance", "Accounts", short names like SO/AFO/JFO/FO.

RECIPIENT DEPARTMENT (most important field) — search entire document (To:, address block, forwarding note, handwritten note, margin, endorsement, stamp, dispatch seal, routing slip, CC). Return full department name (e.g. "Department of Physics", "Registrar Office", "Finance Office", "Salary Section"), never just "AMU"/"University"/"Office"/"Administration" alone unless that literally is the complete name.

SENDER DEPARTMENT — the name and designation of the person or office issuing the document. Prioritize the name/designation of the person who signed it at the bottom (e.g., "Mohd Naim Khan", "Registrar").

SUBJECT
- If an explicit Subject/Sub:/Re: line exists, extract it exactly (strip only the label).
- If missing, generate one: factual, professional, office-style, max 15 words, based only on document contents, no invented names/dates/departments. Style like: "Forwarding of Last Pay Certificate", "Grant of Child Care Leave", "Submission of Attendance Report".
- If document concerns 1–5 named employees, append them in brackets, e.g. "Forwarding of Last Pay Certificate (Mohammad Asif [10235])". If more than 5 employees, do not list names in subject.

DISPATCH NUMBER — look for Dispatch No./D.No./Diary No./Memo No./Admin/LD/NT/T/Letter No./Office Memo No./Reference No./Ref No./R.No./File No./Outward No. (printed, typed, handwritten, or stamped). Return only the value, e.g. "D.No. 142/2026" -> "142/2026". Must NOT be an employee ID, phone number, cheque number, bill number, account number, or file number unless explicitly labelled as dispatch/memo/reference/letter/diary number.

DISPATCH DATE — look for Date/Dated/Dt./Date:/Dispatch Date. Convert to DD/MM/YYYY if possible, else keep original format. Must NOT be joining date, birth date, attendance month, retirement date, medical date, or salary month — unless explicitly the document's own date. If multiple dates exist, extract only the letter/dispatch date nearby dispatch number.

EMPLOYEE_RELATED — true only if the document concerns specific individual employee(s). False for circulars, general notices, and office orders affecting everyone.

EMPLOYEES — extract every clearly readable employee as {name, employee_id, designation, department}. Names must exactly match document text — never abbreviate, expand initials, correct spelling, or translate. If employee ID not visible, null (never invent). If many employees, still list all clearly readable ones in the array, but do not name them in the subject.

ATTACHMENTS — only documents explicitly referenced as enclosed/attached/annexed/forwarded (Encl, Enclosure, Attached, Annexure, Enclosed herewith, Copy enclosed). Return as an array of names, e.g. ["Attendance Report", "LPC"]. Never invent attachments. If a forwarding letter encloses another document, document_type = "Forwarding Letter" and the enclosed document goes into attachments (not document_type).

CONFIDENCE — one of HIGH (clearly visible/certain), MEDIUM (readable but partially unclear), LOW (heavy blur, uncertain handwriting, poor image, missing page, or an important field could not be safely determined). If confidence is LOW and inference is unsafe, prefer null over guessing.

DOCUMENT TYPE — decide using heading + subject + layout + opening/closing paragraph + terminology + attachments + signature block together, not heading alone. Allowed values: Office Memo, Office Order, Letter, Forwarding Letter, Application, Forwarded Application, Notice, Circular, Reminder, Attendance Report, Attendance Statement, Salary Bill, Pay Fixation, Increment Order, Promotion Order, Transfer Order, Joining Report, Relieving Report, Last Pay Certificate, Medical Reimbursement, Leave Application, Leave Sanction, Experience Certificate, No Objection Certificate, Pension Case, Arrear Bill, Other. If evidence is inconsistent or uncertain, return "Other".

UNIVERSITY CONTEXT — documents originate from offices like Registrar, Finance & Accounts, Salary Section, Controller of Examinations, Dean/Chairman/Principal offices, department offices, Proctor, Library, T&P, Computer Centre, Hostel, Purchase/Store, Estate, Audit, Accounts, Legal Cell, Personnel/Establishment/Academic/Research/Admission/Scholarship sections, etc. Ignore signatures, initials, decorative handwriting, logos, emblems, and borders unless they contain routing/department/instruction info.

MULTI-PAGE DOCUMENTS — analyze every page, return one combined JSON. Use page 1 for document_type, dispatch_number, dispatch_date. Use all pages for subject, employees, attachments, departments.

SELF-CHECK BEFORE OUTPUT (internal, do not print): Did I read the whole page/all pages? Did I check handwriting, stamps, margins, forwarding remarks? Did I confuse sender with recipient, or reference number with employee ID? Did I invent anything? Is JSON valid (no trailing commas, double quotes only)? Are there duplicate employees/attachments? If any check fails, fix it before producing the final JSON.

EXAMPLES

1) Office Memo, To: Chairman/Dept of Physics, Subject: "Grant of Child Care Leave", Memo No. F.15/2026, Date 05/07/2026 ->
{"document_type":"Office Memo","recipient_department":"Department of Physics","sender_department":null,"subject":"Grant of Child Care Leave","dispatch_number":"F.15/2026","dispatch_date":"05/07/2026","employee_related":false,"employees":[],"attachments":[],"confidence":"HIGH"}

2) Forwarding Letter enclosing Attendance Report, To: Salary Section, D.No. 225/2026, Date 06/07/2026 ->
{"document_type":"Forwarding Letter","recipient_department":"Salary Section","sender_department":null,"subject":"Forwarding of Attendance Report","dispatch_number":"225/2026","dispatch_date":"06/07/2026","employee_related":false,"employees":[],"attachments":["Attendance Report"],"confidence":"HIGH"}

3) No subject; body forwards LPC of Mohammad Asif, ID 10235 ->
{"document_type":"Forwarding Letter","recipient_department":null,"sender_department":null,"subject":"Forwarding of Last Pay Certificate (Mohammad Asif [10235])","dispatch_number":null,"dispatch_date":null,"employee_related":true,"employees":[{"name":"Mohammad Asif","employee_id":"10235","designation":null,"department":null}],"attachments":["Last Pay Certificate"],"confidence":"MEDIUM"}

4) Typed "To: Registrar" but handwritten "Forward to Finance Office" ->
{"document_type":"Letter","recipient_department":"Finance Office","sender_department":null,"subject":null,"dispatch_number":null,"dispatch_date":null,"employee_related":false,"employees":[],"attachments":[],"confidence":"HIGH"}

5) Unreadable / blurred / partially cropped document ->
{"document_type":"Other","recipient_department":null,"sender_department":null,"subject":null,"dispatch_number":null,"dispatch_date":null,"employee_related":false,"employees":[],"attachments":[],"confidence":"LOW"}`;

        const currDept = req.body.currentDepartment;
        let useCaseInstruction = "";
        if (reqType === "receive") {
          useCaseInstruction = currDept 
            ? `\n\nCRITICAL CONTEXT: You are processing a RECEIVE DOCUMENT ENTRY for our department: "${currDept}". The RECIPIENT DEPARTMENT is "${currDept}". Pay extra attention to accurately identifying the SENDER DEPARTMENT (who sent this to us, usually someone else).`
            : `\n\nCRITICAL CONTEXT: You are processing a RECEIVE DOCUMENT ENTRY. Pay extra attention to accurately identifying the SENDER DEPARTMENT (who sent this to us).`;
        } else {
          useCaseInstruction = currDept
            ? `\n\nCRITICAL CONTEXT: You are processing a NEW DISPATCH from our department: "${currDept}". The SENDER DEPARTMENT is "${currDept}". Pay extra attention to accurately identifying the RECIPIENT DEPARTMENT (who we are sending this to).`
            : `\n\nCRITICAL CONTEXT: You are processing a NEW DISPATCH. Pay extra attention to accurately identifying the RECIPIENT DEPARTMENT (who we are sending this to).`;
        }
        
        const finalPrompt = basePrompt + useCaseInstruction;

        if (ollamaApiUrl && ollamaModel) {
          try {
            const base64Image = imageBufferForApi.toString("base64");
            const ollamaPayload = {
              model: ollamaModel,
              messages: [{
                role: "user",
                content: req.body.prompt || finalPrompt,
                images: [base64Image]
              }],
              stream: false
            };

            const ollamaHeaders: Record<string, string> = { "Content-Type": "application/json" };
            if (ollamaApiKey) {
              ollamaHeaders["Authorization"] = `Bearer ${ollamaApiKey}`;
            }

            const ollamaResponse = await fetch(ollamaApiUrl, {
              method: "POST",
              headers: ollamaHeaders,
              body: JSON.stringify(ollamaPayload)
            });

            if (ollamaResponse.ok) {
              const ollamaData = await ollamaResponse.json();
              let content = ollamaData.message?.content || "";
              content = content.replace(/```json/gi, "").replace(/```/g, "").trim();
              
              const parsedResult = JSON.parse(content);
              aiResult = { result: parsedResult };
              aiSuccess = true;
            } else {
              aiError = `Ollama returned ${ollamaResponse.status}: ${await ollamaResponse.text()}`;
            }
          } catch (e: any) {
             aiError = "Ollama connection/parsing failed: " + e.message;
             console.error("[Dispatch] Ollama error:", e);
          }
        }

        // Fallback to legacy OCR API if Ollama failed or is not configured
        if (!aiSuccess && fallbackApiUrl) {
          console.log("[Dispatch] Falling back to legacy OCR API...", fallbackApiUrl);
          try {
            const formData = new FormData();
            formData.append(
              "file",
              new Blob([imageBufferForApi], { type: "image/jpeg" }),
              imageFilenameForApi.replace(/\.[^.]+$/, ".jpg")
            );
            if (req.body.prompt || finalPrompt) formData.append("prompt", req.body.prompt || finalPrompt);

            const fallbackHeaders: Record<string, string> = {};
            if (fallbackApiKey) {
              fallbackHeaders["Authorization"] = `Bearer ${fallbackApiKey}`;
              fallbackHeaders["x-api-key"] = fallbackApiKey;
            }

            const fallbackModel = (req.query.model as string) || "gemma4:cloud";
            const fallbackResponse = await fetch(`${fallbackApiUrl}?model=${encodeURIComponent(fallbackModel)}`, {
              method: "POST",
              headers: fallbackHeaders,
              body: formData,
            });

            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json();
              // Wrap the response in 'result' if the API returned it flatly
              aiResult = fallbackData.result ? fallbackData : { result: fallbackData };
              aiSuccess = true;
            } else {
              aiError += ` | Fallback API returned ${fallbackResponse.status}: ${await fallbackResponse.text()}`;
            }
          } catch (e: any) {
             aiError += ` | Fallback connection failed: ${e.message}`;
             console.error("[Dispatch] Fallback API error:", e);
          }
        }

        if (!aiSuccess) {
          return res.json({
            result: null,
            extractionFailed: true,
            failureReason: aiError || "No extraction APIs available",
            uploadedFileUrl: originalFileUrl,
            uploadedFileType: isPdf ? "pdf" : "image",
            uploadedFileName: req.file.originalname,
          });
        }

        // Success: return AI result + uploaded file info
        res.json({
          ...aiResult,
          extractionFailed: false,
          uploadedFileUrl: originalFileUrl,
          uploadedFileType: isPdf ? "pdf" : "image",
          uploadedFileName: req.file.originalname,
        });

      } catch (error: any) {
        console.error("[Dispatch] Extract error:", error);
        res.status(500).json({ message: "Failed to process document", error: error.message });
      }
    }
  );

  // ─── Upload Only (no AI extraction) ─────────────────────────────────────
  // For cases where user just wants to upload and fill details manually
  app.post(
    "/api/dispatch/upload",
    dispatchUpload.single("file"),
    async (req: any, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");
        const fileUrl = `/uploads/dispatch/${path.basename(req.file.path)}`;
        res.json({
          uploadedFileUrl: fileUrl,
          uploadedFileType: isPdf ? "pdf" : "image",
          uploadedFileName: req.file.originalname,
        });
      } catch (error: any) {
        res.status(500).json({ message: "Upload failed", error: error.message });
      }
    }
  );

  // ─── Create Dispatch (Outgoing) ─────────────────────────────────────────
  app.post(
    "/api/dispatch",
    dispatchUpload.single("file"),
    requireBodyDepartment("senderDepartmentId"),
    async (req: any, res: Response) => {
      try {
        const b = req.body;
        if (!b.senderDepartmentId || !b.senderName || !b.documentType || !b.subject) {
          return res.status(400).json({ message: "Missing required fields: senderDepartmentId, senderName, documentType, subject" });
        }
        let fileUrl = b.fileUrl;
        let fileType = b.fileType || "image";
        if (req.file) {
          fileUrl = `/uploads/dispatch/${path.basename(req.file.path)}`;
          fileType = req.file.mimetype.includes("pdf") ? "pdf" : "image";
        }
        let recipients: any[] = [];
        try {
          const parsed = typeof b.recipients === "string" ? JSON.parse(b.recipients) : b.recipients;
          if (Array.isArray(parsed)) recipients = parsed;
        } catch { /* bad list → no recipients */ }
        let aiExtractedData: any = undefined;
        try { aiExtractedData = typeof b.aiExtractedData === "string" ? JSON.parse(b.aiExtractedData) : b.aiExtractedData; } catch { /* ignore */ }

        const senderId = parseInt(b.senderDepartmentId);
        const actor = await who(req, senderId, b.senderName);
        const result = await createOutwardDispatch({
          actor,
          senderDepartmentId: senderId,
          senderName: actor.departmentName || b.senderName,
          documentType: b.documentType,
          subject: b.subject,
          dispatchNumber: b.dispatchNumber,
          dispatchDate: b.dispatchDate,
          referenceNumber: b.referenceNumber,
          isConfidential: b.isConfidential === "true" || b.isConfidential === true,
          priority: b.priority,
          aiExtractedData,
          aiConfidence: b.aiConfidence,
          fileUrl,
          fileType,
          recipients,
          sendEmail: b.sendEmail === "true" || b.sendEmail === true,
          dispatchMode: b.dispatchMode,
          postalTrackingNo: b.postalTrackingNo,
          postageAmount: b.postageAmount,
          inReplyToRecipientId: b.inReplyToRecipientId ? Number(b.inReplyToRecipientId) : null,
          efileId: b.efileId ? Number(b.efileId) : null,
        });
        res.json({ success: true, ...result });
      } catch (error: any) {
        if (error instanceof DakError) return res.status(error.status).json({ message: error.message });
        console.error("[Dispatch] Create error:", error);
        res.status(500).json({ message: "Failed to create dispatch", error: error.message });
      }
    }
  );

  // ─── Receive Document (Physical / External Inward Entry) ────────────────
  // Sender, letter no./date, other reference, receipt no. (auto when empty),
  // receipt date, mark to staff logins (+ "action by" date; default by priority).
  app.post(
    "/api/dispatch/receive-external",
    dispatchUpload.single("file"),
    requireBodyDepartment("receivingDepartmentId"),
    async (req: any, res: Response) => {
      try {
        const b = req.body;
        if (!b.receivingDepartmentId || !b.documentType || !b.subject || !b.senderInfo) {
          return res.status(400).json({ message: "Missing required fields (sender, document type, subject)" });
        }
        const deptId = parseInt(b.receivingDepartmentId);
        const actor = await who(req, deptId, b.receivingDepartmentName);
        const confidential = b.isConfidential === "true" || b.isConfidential === true;
        const priority = ["normal", "urgent", "immediate"].includes(b.priority) ? b.priority : "normal";

        let fileUrl = b.fileUrl;
        let fileType = b.fileType || "image";
        if (req.file) {
          fileUrl = `/uploads/dispatch/${path.basename(req.file.path)}`;
          fileType = req.file.mimetype.includes("pdf") ? "pdf" : "image";
        }
        if (fileUrl && !/^\/uploads\/dispatch\/[A-Za-z0-9._-]+$/.test(String(fileUrl))) fileUrl = "";

        const parseIds = (v: any): number[] => {
          try {
            const parsed = typeof v === "string" ? JSON.parse(v) : v;
            return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
          } catch { return []; }
        };
        // Staff logins (department_staff) + older free names (employees without login)
        const staffIds = parseIds(b.markedStaffIds);
        const staffRows = staffIds.length
          ? (await db.execute(sql`SELECT id, name FROM department_staff WHERE department_id = ${deptId} AND is_active = true
              AND id IN (${sql.join(staffIds.map((i) => sql`${i}`), sql`, `)})`)).rows as any[]
          : [];
        const extraNames = String(b.markedToStaff || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        const names = [...staffRows.map((r) => r.name), ...extraNames.filter((n) => !staffRows.some((r) => r.name === n))];
        const marked = names.join(", ");
        const employeeIds = parseIds(b.markedToEmployeeIds);

        // Sender is a department on this system → it can see that its letter arrived
        let senderRef: number | null = null;
        if (b.senderDepartmentRef && Number(b.senderDepartmentRef) !== deptId) {
          const exists = (await db.execute(sql`SELECT 1 FROM departments WHERE id = ${Number(b.senderDepartmentRef)}`)).rows.length > 0;
          if (exists) senderRef = Number(b.senderDepartmentRef);
        }

        const receivedAt = receiptMoment(b.receiptDate);
        const dueDate = isoDateOrNull(b.actionDueDate) || slaDueDate(priority, receivedAt);

        const result = await db.transaction(async (tx) => {
          await lockRegister(tx, "in", deptId);
          let inwardNumber: string;
          const typed = String(b.inwardNumber || "").trim();
          if (typed) {
            const used = await usedInwardNumbers(tx, deptId, receivedAt);
            if (used.some((n) => normalizeNo(n) === normalizeNo(typed))) return { conflict: typed } as const;
            inwardNumber = typed;
          } else {
            inwardNumber = await nextInwardNumber(tx, deptId, receivedAt);
          }

          const [dispatch] = await tx.insert(dispatchDocuments).values({
            senderDepartmentId: 0, // 0 = external/physical sender
            senderName: b.senderInfo || "External",
            documentType: b.documentType,
            subject: confidential ? "CONFIDENTIAL" : b.subject,
            dispatchNumber: b.dispatchNumber || null,
            dispatchDate: isoDateOrNull(b.dispatchDate),
            referenceNumber: b.referenceNumber || null,
            inwardNumber,
            fileUrl: fileUrl || "",
            fileType: fileType || "image",
            isConfidential: confidential,
            priority,
            senderDepartmentRef: senderRef,
            aiExtractedData: {
              _actualSubject: b.subject,
              _receivedByDepartmentId: deptId.toString(),
              _physicalReceive: true,
              _senderInfo: b.senderInfo || "External",
            },
          }).returning();

          await tx.insert(dispatchRecipients).values({
            dispatchId: dispatch.id,
            recipientType: "department",
            departmentId: deptId,
            status: marked ? "marked" : "received",
            receivedAt,
            readAt: receivedAt,
            inwardNumber,
            markedToStaff: marked || null,
            markedStaffIds: staffRows.length ? staffRows.map((r) => Number(r.id)) : null,
            markedToEmployeeId: employeeIds[0] ?? null,
            staffRemarks: b.staffRemarks || null,
            markedBy: marked ? actor.label : null,
            markedAt: marked ? new Date() : null,
            actionDueDate: dueDate,
          });

          await track({
            dispatchId: dispatch.id, action: "received_physical", actor, recipientDepartmentId: deptId,
            details: `Physical document received from: ${b.senderInfo || "External"}. Inward No: ${inwardNumber}. Action by: ${dueDate}`,
          }, tx);
          if (marked) {
            await track({
              dispatchId: dispatch.id, action: "marked_to_staff", actor, recipientDepartmentId: deptId,
              details: `Marked to: ${marked}${b.staffRemarks ? `. Remarks: ${b.staffRemarks}` : ""}`,
            }, tx);
          }
          return { dispatch, inwardNumber } as const;
        });

        if ("conflict" in result) {
          return res.status(409).json({ message: `Receipt No. ${result.conflict} is already used this year. Leave it empty for the next number.` });
        }
        queueOcr({ kind: "document", id: result.dispatch.id, fileUrl: result.dispatch.fileUrl });
        if (staffRows.length) {
          void notifyMarked(staffRows.map((r) => Number(r.id)), actor.label, result.inwardNumber, result.dispatch, b.staffRemarks, dueDate);
        }
        res.json({ success: true, dispatch: result.dispatch, inwardNumber: result.inwardNumber });
      } catch (error: any) {
        console.error("[Dispatch] Receive external error:", error);
        res.status(500).json({ message: "Failed to record received document", error: error.message });
      }
    }
  );

  // ─── Get Outbox (Sent Dispatches) ───────────────────────────────────────
  // Two queries in all (documents, then all their recipients) instead of one per row.
  app.get("/api/dispatch/outbox/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });

      const fy = req.query.fy as string;
      const conditions = [eq(dispatchDocuments.senderDepartmentId, departmentId)];
      if (fy && fy !== "all") {
        const year = parseInt(fy.split("-")[0]);
        if (!isNaN(year)) {
          conditions.push(sql`${dispatchDocuments.createdAt} >= ${new Date(year, 3, 1).toISOString()}`);
          conditions.push(sql`${dispatchDocuments.createdAt} < ${new Date(year + 1, 3, 1).toISOString()}`);
        }
      }
      const docs = await db.select().from(dispatchDocuments).where(and(...conditions)).orderBy(desc(dispatchDocuments.createdAt));
      const recipients = await recipientsWithNames(docs.map((d) => d.id));

      res.json(docs.map(({ ocrText: _o, ...d }) => {
        const list = recipients.filter((r) => r.dispatchId === d.id);
        return {
          ...d,
          subject: d.isConfidential ? ((d.aiExtractedData as any)?._actualSubject || d.subject) : d.subject,
          recipients: list,
          recipientCount: list.length,
          readCount: list.filter((r) => r.readAt).length,
        };
      }));
    } catch (error: any) {
      console.error("[Dispatch] Outbox error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Inbox (Received Dispatches) ────────────────────────────────────
  app.get("/api/dispatch/inbox/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });

      const fy = req.query.fy as string;
      const conditions = [
        eq(dispatchRecipients.departmentId, departmentId),
        eq(dispatchRecipients.recipientType, "department"),
      ];
      if (fy && fy !== "all") {
        const year = parseInt(fy.split("-")[0]);
        if (!isNaN(year)) {
          conditions.push(sql`${dispatchRecipients.createdAt} >= ${new Date(year, 3, 1).toISOString()}`);
          conditions.push(sql`${dispatchRecipients.createdAt} < ${new Date(year + 1, 3, 1).toISOString()}`);
        }
      }
      const rows = await db
        .select({ r: dispatchRecipients, d: dispatchDocuments })
        .from(dispatchRecipients)
        .innerJoin(dispatchDocuments, eq(dispatchDocuments.id, dispatchRecipients.dispatchId))
        .where(and(...conditions))
        .orderBy(desc(dispatchRecipients.createdAt));
      res.json(rows.map((x) => toInboxItem(x.r, x.d)));
    } catch (error: any) {
      console.error("[Dispatch] Inbox error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Inbox Count (for sidebar badge) ────────────────────────────────
  // count = not yet received; myPending = open dak marked to this staff login, not acknowledged
  app.get("/api/dispatch/inbox-count/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });
      const actor = await who(req, departmentId);
      const row = (await db.execute(sql`
        SELECT COUNT(*) FILTER (WHERE status = 'dispatched')::int AS unreceived,
               COUNT(*) FILTER (WHERE ${actor.staffId ?? 0} = ANY(COALESCE(marked_staff_ids, '{}'))
                                  AND acknowledged_at IS NULL AND status NOT IN ${CLOSED_SQL})::int AS my_pending
        FROM dispatch_recipients WHERE department_id = ${departmentId} AND recipient_type = 'department'`)).rows[0] as any;
      res.json({ count: Number(row?.unreceived || 0), myPending: actor.staffId ? Number(row?.my_pending || 0) : 0 });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Next Inward Number (Receipt Number) ────────────────────────────
  app.get("/api/dispatch/next-inward-number/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });
      
      // Optional ?date=YYYY-MM-DD (receipt date) picks the financial year
      res.json({ nextNumber: await nextInwardNumber(db, departmentId, receiptMoment(req.query.date)) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Next Outward Number (Dispatch Number) ────────────────────────────
  app.get("/api/dispatch/next-outward-number/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });
      
      res.json({ nextNumber: await nextOutwardNumber(db, departmentId, new Date()) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Search Departments for recipient selection ─────────────────────────
  app.get("/api/dispatch/search-departments", async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string) || "";
      if (query.length < 1) return res.json([]);

      const results = await db
        .select({
          id: departments.id,
          name: departments.name,
          email: departments.email,
          hodTitle: departments.hodTitle,
          hodName: departments.hodName,
        })
        .from(departments)
        .where(ilike(departments.name, `%${query}%`))
        .orderBy(asc(departments.name))
        .limit(20);

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── All Dispatches (Admin Overview) ────────────────────────────────────
  app.get("/api/dispatch/all-dispatches", async (req: Request, res: Response) => {
    try {
      const dispatches = await db
        .select({
          id: dispatchDocuments.id,
          senderName: dispatchDocuments.senderName,
          documentType: dispatchDocuments.documentType,
          subject: dispatchDocuments.subject,
          outwardNumber: dispatchDocuments.outwardNumber,
          priority: dispatchDocuments.priority,
          createdAt: dispatchDocuments.createdAt,
          recipientCount: sql<number>`(SELECT count(*) FROM dispatch_recipients WHERE dispatch_id = ${dispatchDocuments.id})`,
        })
        .from(dispatchDocuments)
        .orderBy(desc(dispatchDocuments.createdAt))
        .limit(100);

      res.json(dispatches);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Dispatch Detail ────────────────────────────────────────────────
  app.get("/api/dispatch/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const actor = await who(req, req.query.departmentId);
      const requestingDeptId = actor.departmentId || parseInt(req.query.departmentId as string);

      const [dispatch] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, id));
      if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });

      const recipientDetails = await recipientsWithNames([id]);
      const extra = (dispatch.aiExtractedData as any) || {};
      const isPhysicalReceive = extra._physicalReceive === true;
      const isSender = !isPhysicalReceive && dispatch.senderDepartmentId === requestingDeptId;
      const isRecipient = recipientDetails.some((r) => r.departmentId === requestingDeptId);
      const canViewContent = !dispatch.isConfidential || isSender || isRecipient;

      let tracking = await db.select().from(dispatchTracking).where(eq(dispatchTracking.dispatchId, id)).orderBy(asc(dispatchTracking.createdAt));
      if (!canViewContent) tracking = tracking.map((t) => ({ ...t, details: "Confidential" }));

      const subject = dispatch.isConfidential
        ? (canViewContent ? (extra._actualSubject || dispatch.subject) : "CONFIDENTIAL")
        : dispatch.subject;

      // This department's own (latest) row: drives the actions shown to it
      const userRecipient = [...recipientDetails].sort((a, b) => b.id - a.id).find((r) => r.departmentId === requestingDeptId);
      const canEdit = isPhysicalReceive
        ? String(extra._receivedByDepartmentId) === String(requestingDeptId)
        : dispatch.senderDepartmentId === requestingDeptId;

      const attachments = canViewContent ? (await db.execute(sql`
        SELECT id, file_url AS "fileUrl", file_type AS "fileType", original_name AS "originalName", added_by AS "addedBy",
               (ocr_text IS NOT NULL) AS "hasText",
               to_char(added_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "addedAt"
        FROM dispatch_attachments WHERE dispatch_id = ${id} ORDER BY id`)).rows : [];

      // Reply links: what this letter answers, and the letters that answer it
      let inReplyTo: any = null;
      if (dispatch.inReplyToRecipientId && isSender) {
        const [rr] = await db.select().from(dispatchRecipients).where(eq(dispatchRecipients.id, dispatch.inReplyToRecipientId));
        const [od] = rr ? await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, rr.dispatchId)) : [];
        if (rr && od) inReplyTo = {
          dispatchId: od.id,
          inwardNumber: rr.inwardNumber || od.inwardNumber,
          senderName: od.senderName,
          subject: od.isConfidential ? ((od.aiExtractedData as any)?._actualSubject || "CONFIDENTIAL") : od.subject,
        };
      }
      const replies = (await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.inReplyToDispatchId, id)))
        .filter((r) => r.senderDepartmentId === requestingDeptId || isRecipient || isSender)
        .map((r) => ({ id: r.id, outwardNumber: r.outwardNumber, senderName: r.senderName, createdAt: r.createdAt, cancelled: !!r.cancelledAt }));

      const efiles = requestingDeptId ? (await db.execute(sql`
        SELECT DISTINCT f.id, f.file_number AS "fileNumber", f.subject FROM efile_entries e JOIN efiles f ON f.id = e.efile_id
        WHERE e.dispatch_id = ${id} AND f.department_id = ${requestingDeptId}`)).rows : [];

      const { ocrText: _o, ...rest } = dispatch;
      res.json({
        ...rest,
        inwardNumber: userRecipient?.inwardNumber || (userRecipient ? dispatch.inwardNumber : null),
        subject,
        fileUrl: canViewContent ? dispatch.fileUrl : "",
        recipients: recipientDetails,
        tracking,
        canViewContent,
        isPhysicalReceive,
        canEdit,
        canWithdraw: isSender && !dispatch.cancelledAt && !recipientDetails.some((r) => r.receivedAt),
        canCancelEntry: isPhysicalReceive && canEdit && !dispatch.cancelledAt && actor.isSupervisor,
        myRecipient: userRecipient || null,
        attachments,
        inReplyTo,
        replies,
        efiles,
        verifyUrl: dispatch.verifyToken ? `${publicBaseUrl()}/dak/verify/${dispatch.verifyToken}` : null,
        me: { staffId: actor.staffId, isSupervisor: actor.isSupervisor, role: actor.role },
      });
    } catch (error: any) {
      console.error("[Dispatch] Detail error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Mark as Received ───────────────────────────────────────────────────
  // Gives the next receipt number (R.No.) and a default "action by" date (by priority).
  app.patch("/api/dispatch/:id/receive", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const actor = await who(req, departmentId, req.body.departmentName);

      const result = await db.transaction(async (tx) => {
        await lockRegister(tx, "in", departmentId);
        const [row] = await tx.select().from(dispatchRecipients)
          .where(and(eq(dispatchRecipients.dispatchId, dispatchId), eq(dispatchRecipients.departmentId, departmentId)))
          .orderBy(desc(dispatchRecipients.id)).limit(1);
        if (!row) return { notFound: true } as const;
        if (row.inwardNumber) return { inwardNumber: row.inwardNumber } as const;
        if (row.status === "withdrawn") return { withdrawn: true } as const;
        const [doc] = await tx.select({ priority: dispatchDocuments.priority }).from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));

        const receivedAt = new Date();
        const inwardNumber = await nextInwardNumber(tx, departmentId, receivedAt);
        const dueDate = row.actionDueDate || slaDueDate(doc?.priority, receivedAt);
        await tx.update(dispatchRecipients).set({
          status: (row.status === "dispatched" || row.status === "read") ? "received" : row.status,
          receivedAt, inwardNumber, readAt: row.readAt || receivedAt, actionDueDate: dueDate,
        }).where(eq(dispatchRecipients.id, row.id));
        await track({ dispatchId, action: "received", actor, recipientDepartmentId: departmentId,
          details: `Document received. Inward No: ${inwardNumber}. Action by: ${dueDate}` }, tx);
        return { inwardNumber } as const;
      });

      if ("notFound" in result) return res.status(404).json({ message: "Recipient not found" });
      if ("withdrawn" in result) return res.status(400).json({ message: "The sender has withdrawn this document" });
      res.json({ success: true, inwardNumber: result.inwardNumber });
    } catch (error: any) {
      console.error("[Dispatch] Receive error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Mark as Read ───────────────────────────────────────────────────────
  app.patch("/api/dispatch/:id/read", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const recipient = await myRecipientRow(dispatchId, departmentId);
      if (recipient && !recipient.readAt) {
        const actor = await who(req, departmentId, req.body.departmentName);
        await db.update(dispatchRecipients).set({ readAt: new Date() }).where(eq(dispatchRecipients.id, recipient.id));
        await track({ dispatchId, action: "read", actor, details: "Document viewed", recipientDepartmentId: departmentId });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  /** Row of this department that it has received and not closed (forward / mark / RIO / dispose need it) */
  async function openReceivedRow(dispatchId: number, departmentId: number, res: Response) {
    const row = await myRecipientRow(dispatchId, departmentId);
    if (!row) { res.status(404).json({ message: "This document is not in your inbox" }); return null; }
    if (row.status === "withdrawn") { res.status(400).json({ message: "The sender has withdrawn this document" }); return null; }
    if (row.status === "cancelled") { res.status(400).json({ message: "This entry was cancelled" }); return null; }
    if (!row.receivedAt) { res.status(400).json({ message: "Please mark the document as received first" }); return null; }
    if (row.status === "disposed") { res.status(400).json({ message: "This document is disposed. Reopen it first." }); return null; }
    if (row.status === "returned") { res.status(400).json({ message: "This document was returned to the sender" }); return null; }
    return row;
  }

  // ─── Forward Dispatch ───────────────────────────────────────────────────
  app.post("/api/dispatch/:id/forward", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const actor = await who(req, departmentId, req.body.departmentName);
      const { forwardTo, remarks } = req.body;

      const forwardRecipients = typeof forwardTo === "string" ? JSON.parse(forwardTo) : forwardTo;
      if (!Array.isArray(forwardRecipients) || forwardRecipients.length === 0) {
        return res.status(400).json({ message: "No forward recipients specified" });
      }
      const row = await openReceivedRow(dispatchId, departmentId, res);
      if (!row) return;

      const existing = await db.select({ departmentId: dispatchRecipients.departmentId, status: dispatchRecipients.status })
        .from(dispatchRecipients).where(eq(dispatchRecipients.dispatchId, dispatchId));
      const holding = new Set(existing.filter((e) => e.status !== "returned").map((e) => e.departmentId));
      const targets = forwardRecipients
        .filter((r: any) => (r.type || "department") === "department")
        .map((r: any) => Number(r.id))
        .filter((id: number, i: number, all: number[]) => Number.isFinite(id) && id !== departmentId && !holding.has(id) && all.indexOf(id) === i);
      if (targets.length === 0) return res.status(400).json({ message: "The selected department(s) already have this document" });

      await db.insert(dispatchRecipients).values(targets.map((id: number) => ({
        dispatchId, recipientType: "department", departmentId: id, status: "dispatched" as const,
      })));
      await db.update(dispatchRecipients).set({ status: "forwarded" }).where(eq(dispatchRecipients.id, row.id));

      const names = (await db.select({ name: departments.name }).from(departments).where(inArray(departments.id, targets))).map((d) => d.name);
      await track({ dispatchId, action: "forwarded", actor, recipientDepartmentId: departmentId,
        details: `Forwarded to: ${names.join(", ")}${remarks ? `. Remarks: ${remarks}` : ""}` });

      // Tell the new recipients by e-mail (in the background) and on the other channels
      const [doc] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
      if (doc) {
        sendDispatchEmails(doc, targets, actor).catch(() => {});
        void notify("dak.forwarded_in", targets.map((id: number) => ({ kind: "department" as const, departmentId: id })), {
          title: `Dak forwarded by ${actor.departmentName}`,
          text: `${doc.documentType}: ${doc.isConfidential ? "CONFIDENTIAL" : ((doc.aiExtractedData as any)?._actualSubject || doc.subject)}${remarks ? ` — ${remarks}` : ""}`,
          link: "/dashboard/dispatch",
        });
      }

      res.json({ success: true, forwardedTo: targets.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Mark to Staff ──────────────────────────────────────────────────────
  // Staff logins (staffIds) and/or names of staff without login; optional "action by" date.
  app.post("/api/dispatch/:id/mark-staff", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const actor = await who(req, departmentId, req.body.departmentName);
      const { employeeName, employeeNames, employeeId, employeeIds, staffIds, remarks, dueDate } = req.body;

      const ids: number[] = (Array.isArray(staffIds) ? staffIds : []).map(Number).filter(Number.isFinite);
      const staffRows = ids.length
        ? (await db.execute(sql`SELECT id, name FROM department_staff WHERE department_id = ${departmentId} AND is_active = true
            AND id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)).rows as any[]
        : [];
      const freeNames: string[] = Array.isArray(employeeNames)
        ? employeeNames.map((n: any) => String(n).trim()).filter(Boolean)
        : String(employeeName || "").split(",").map((n) => n.trim()).filter(Boolean);
      const names = [...staffRows.map((r) => r.name), ...freeNames.filter((n) => !staffRows.some((r) => r.name === n))];
      if (names.length === 0) return res.status(400).json({ message: "Select at least one staff member" });
      const empIds: number[] = (Array.isArray(employeeIds) ? employeeIds : [employeeId]).map(Number).filter(Number.isFinite);

      const row = await openReceivedRow(dispatchId, departmentId, res);
      if (!row) return;

      const due = isoDateOrNull(dueDate) || row.actionDueDate;
      await db.update(dispatchRecipients).set({
        status: "marked",
        markedToStaff: names.join(", "),
        markedStaffIds: staffRows.length ? staffRows.map((r) => Number(r.id)) : null,
        markedToEmployeeId: empIds[0] ?? null,
        markedAt: new Date(),
        markedBy: actor.label,
        staffRemarks: remarks || null,
        actionDueDate: due,
        acknowledgedAt: null,
        acknowledgedBy: null,
      }).where(eq(dispatchRecipients.id, row.id));

      await track({ dispatchId, action: "marked_to_staff", actor, recipientDepartmentId: departmentId,
        details: `Marked to: ${names.join(", ")}${remarks ? `. Remarks: ${remarks}` : ""}${due ? `. Action by: ${due}` : ""}` });
      if (staffRows.length) {
        const [doc] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
        void notifyMarked(staffRows.map((r) => Number(r.id)), actor.label, row.inwardNumber, doc, remarks, due);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Return In Original (RIO) ───────────────────────────────────────────
  app.post("/api/dispatch/:id/rio", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const actor = await who(req, departmentId, req.body.departmentName);
      const { remarks } = req.body;
      if (!String(remarks || "").trim()) return res.status(400).json({ message: "Please give the reason for returning" });

      const [dispatch] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
      if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });
      if (!dispatch.senderDepartmentId) return res.status(400).json({ message: "Cannot RIO external or unknown sender documents" });
      const row = await openReceivedRow(dispatchId, departmentId, res);
      if (!row) return;

      const senderDeptId = dispatch.senderDepartmentId;
      await db.update(dispatchRecipients).set({ status: "returned", staffRemarks: remarks || null }).where(eq(dispatchRecipients.id, row.id));
      const existingSenderRecipient = await myRecipientRow(dispatchId, senderDeptId);
      if (existingSenderRecipient) {
        await db.update(dispatchRecipients)
          .set({ status: "dispatched", receivedAt: null, inwardNumber: null, readAt: null, disposedAt: null, disposalType: null, disposalRemarks: null })
          .where(eq(dispatchRecipients.id, existingSenderRecipient.id));
      } else {
        await db.insert(dispatchRecipients).values({ dispatchId, recipientType: "department", departmentId: senderDeptId, status: "dispatched" });
      }
      await track({ dispatchId, action: "returned", actor, recipientDepartmentId: senderDeptId,
        details: `Returned in Original (RIO) to Sender. Remarks: ${remarks || "None"}` });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Dispatch] RIO error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Dispose (close the dak in this department) ─────────────────────────
  // Dealing assistants / diary clerks may dispose only dak marked to them.
  // "Filed" needs a file number or an e-file of the department.
  app.post("/api/dispatch/:id/dispose", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const actor = await who(req, departmentId, req.body.departmentName);
      const disposalType = String(req.body.disposalType || "").trim();
      const remarks = String(req.body.remarks || "").trim();
      let fileNumber = String(req.body.fileNumber || "").trim();
      const efileId = req.body.efileId ? Number(req.body.efileId) : null;

      if (!DISPOSAL_TYPES.includes(disposalType)) return res.status(400).json({ message: "Please choose how the document was disposed" });
      if (disposalType === "Filed" && !fileNumber && !efileId) {
        return res.status(400).json({ message: "File number (or an e-file) is required when the document is filed" });
      }
      const row = await openReceivedRow(dispatchId, departmentId, res);
      if (!row) return;
      if (actor.staffId && !actor.isSupervisor && !(row.markedStaffIds || []).includes(actor.staffId)) {
        return res.status(403).json({ message: "Only dak marked to you can be disposed by you. Ask the Section Officer / HOD." });
      }
      if (efileId) {
        const linked = await linkDakToFile(efileId, dispatchId, actor, `Dak ${row.inwardNumber || ""} placed on file`);
        if (!linked) return res.status(400).json({ message: "The e-file is not an open file of your department" });
        fileNumber = linked;
      }

      await db.update(dispatchRecipients).set({
        status: "disposed", disposedAt: new Date(), disposalType,
        disposalRemarks: remarks || null, fileNumber: fileNumber || null, disposedBy: actor.label,
      }).where(eq(dispatchRecipients.id, row.id));
      await track({ dispatchId, action: "disposed", actor, recipientDepartmentId: departmentId,
        details: `Disposed: ${disposalType}${fileNumber ? `. File No: ${fileNumber}` : ""}${remarks ? `. Remarks: ${remarks}` : ""}` });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Dispatch] Dispose error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Reopen a disposed dak ──────────────────────────────────────────────
  app.post("/api/dispatch/:id/reopen", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const actor = await who(req, departmentId, req.body.departmentName);
      const remarks = String(req.body.remarks || "").trim();
      if (!remarks) return res.status(400).json({ message: "Please give the reason for reopening" });

      const row = await myRecipientRow(dispatchId, departmentId);
      if (!row || row.status !== "disposed") return res.status(400).json({ message: "Only a disposed document can be reopened" });
      await db.update(dispatchRecipients).set({
        status: row.markedToStaff ? "marked" : "received",
        disposedAt: null, disposalType: null, disposalRemarks: null, disposedBy: null,
      }).where(eq(dispatchRecipients.id, row.id));
      await track({ dispatchId, action: "reopened", actor, recipientDepartmentId: departmentId, details: `Reopened. Reason: ${remarks}` });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Correct the register entry (typing mistakes) ───────────────────────
  // Physical receipts: the receiving department. Own dispatches: the sender.
  app.patch("/api/dispatch/:id/details", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const departmentId = Number(req.body.departmentId);
      const actor = await who(req, departmentId, req.body.departmentName);

      const [dispatch] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
      if (!dispatch) return res.status(404).json({ message: "Document not found" });
      const extra = (dispatch.aiExtractedData as any) || {};
      const isPhysical = extra._physicalReceive === true;
      const allowed = isPhysical
        ? String(extra._receivedByDepartmentId) === String(departmentId)
        : dispatch.senderDepartmentId === departmentId;
      if (!allowed) return res.status(403).json({ message: "Only the department that made this entry can correct it" });
      if (dispatch.cancelledAt) return res.status(400).json({ message: "A cancelled / withdrawn entry cannot be changed" });

      const b = req.body;
      const changes: string[] = [];
      const updates: Record<string, any> = {};
      const setIf = (key: string, label: string, value: any, current: any) => {
        if (value === undefined) return;
        const v = value === "" ? null : value;
        if ((v ?? null) !== (current ?? null)) {
          updates[key] = v;
          changes.push(`${label}: "${current ?? "-"}" → "${v ?? "-"}"`);
        }
      };
      if (b.documentType !== undefined && !String(b.documentType).trim()) return res.status(400).json({ message: "Document type is required" });
      if (b.subject !== undefined && !String(b.subject).trim()) return res.status(400).json({ message: "Subject is required" });
      setIf("documentType", "Type", b.documentType, dispatch.documentType);
      setIf("dispatchNumber", "Letter No.", b.dispatchNumber, dispatch.dispatchNumber);
      setIf("dispatchDate", "Letter Date", b.dispatchDate === undefined ? undefined : isoDateOrNull(b.dispatchDate), dispatch.dispatchDate);
      setIf("referenceNumber", "Reference", b.referenceNumber, dispatch.referenceNumber);
      if (b.priority !== undefined && ["normal", "urgent", "immediate"].includes(b.priority)) setIf("priority", "Priority", b.priority, dispatch.priority);
      if (!isPhysical) {
        if (b.dispatchMode !== undefined && b.dispatchMode in DISPATCH_MODES) setIf("dispatchMode", "Mode", b.dispatchMode, dispatch.dispatchMode);
        setIf("postalTrackingNo", "Postal tracking no.", b.postalTrackingNo, dispatch.postalTrackingNo);
        if (b.postageAmount !== undefined) {
          const n = String(b.postageAmount).trim() === "" ? null : Number(b.postageAmount);
          if (n !== null && (!Number.isFinite(n) || n < 0)) return res.status(400).json({ message: "Postage must be a positive amount" });
          setIf("postageAmount", "Postage", n === null ? null : n.toFixed(2), dispatch.postageAmount);
        }
      }
      if (isPhysical && b.senderName !== undefined && String(b.senderName).trim()) setIf("senderName", "From", String(b.senderName).trim(), dispatch.senderName);
      let newExtra: any = null;
      if (b.subject !== undefined) {
        const actual = extra._actualSubject || dispatch.subject;
        if (String(b.subject).trim() !== actual) {
          changes.push(dispatch.isConfidential ? "Subject changed" : `Subject: "${actual}" → "${String(b.subject).trim()}"`);
          newExtra = { ...extra, _actualSubject: String(b.subject).trim() };
          if (!dispatch.isConfidential) updates.subject = String(b.subject).trim();
        }
      }
      if (isPhysical && updates.senderName) newExtra = { ...(newExtra || extra), _senderInfo: updates.senderName };
      if (newExtra) updates.aiExtractedData = newExtra;
      if (changes.length === 0) return res.json({ success: true, changed: 0 });

      updates.updatedAt = new Date();
      await db.update(dispatchDocuments).set(updates).where(eq(dispatchDocuments.id, dispatchId));
      await track({ dispatchId, action: "edited", actor, details: `Entry corrected. ${changes.join("; ")}` });
      res.json({ success: true, changed: changes.length });
    } catch (error: any) {
      console.error("[Dispatch] Edit error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Tracking Timeline ──────────────────────────────────────────────
  app.get("/api/dispatch/:id/tracking", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const requestingDeptId = parseInt(req.query.departmentId as string);

      const [dispatch] = await db
        .select({ isConfidential: dispatchDocuments.isConfidential, senderDepartmentId: dispatchDocuments.senderDepartmentId })
        .from(dispatchDocuments)
        .where(eq(dispatchDocuments.id, dispatchId));

      const tracking = await db
        .select()
        .from(dispatchTracking)
        .where(eq(dispatchTracking.dispatchId, dispatchId))
        .orderBy(asc(dispatchTracking.createdAt));

      if (dispatch?.isConfidential) {
        const recipients = await db
          .select({ departmentId: dispatchRecipients.departmentId })
          .from(dispatchRecipients)
          .where(eq(dispatchRecipients.dispatchId, dispatchId));

        const isParty =
          dispatch.senderDepartmentId === requestingDeptId ||
          recipients.some((r) => r.departmentId === requestingDeptId);

        if (!isParty) {
          return res.json(tracking.map((t) => ({ ...t, details: "Confidential" })));
        }
      }

      res.json(tracking);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPARTMENT GROUPS APIs
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/dispatch-groups", async (_req: Request, res: Response) => {
    try {
      const groups = await db
        .select()
        .from(departmentGroups)
        .orderBy(asc(departmentGroups.name));

      const results = await Promise.all(
        groups.map(async (g) => {
          const members = await db
            .select({ departmentId: departmentGroupMembers.departmentId })
            .from(departmentGroupMembers)
            .where(eq(departmentGroupMembers.groupId, g.id));

          return {
            ...g,
            memberCount: members.length,
            memberDepartmentIds: members.map((m) => m.departmentId),
          };
        })
      );

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dispatch-groups/:id/members", async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.id);
      const members = await db
        .select({
          id: departmentGroupMembers.id,
          departmentId: departmentGroupMembers.departmentId,
          deptName: departments.name,
          deptEmail: departments.email,
          hodTitle: departments.hodTitle,
          hodName: departments.hodName,
        })
        .from(departmentGroupMembers)
        .innerJoin(departments, eq(departmentGroupMembers.departmentId, departments.id))
        .where(eq(departmentGroupMembers.groupId, groupId))
        .orderBy(asc(departments.name));

      res.json(members);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/dispatch-groups", async (req: Request, res: Response) => {
    try {
      const { name, description, departmentIds, createdByDepartmentId, isGlobal } = req.body;
      if (!name) return res.status(400).json({ message: "Group name is required" });

      const [group] = await db
        .insert(departmentGroups)
        .values({
          name,
          shortName: name.toUpperCase().replace(/\s+/g, "_").substring(0, 30),
          description: description || null,
          isSystem: false,
          isGlobal: isGlobal !== false,
          createdByDepartmentId: createdByDepartmentId || null,
        })
        .returning();

      if (departmentIds && Array.isArray(departmentIds) && departmentIds.length > 0) {
        await db.insert(departmentGroupMembers).values(
          departmentIds.map((deptId: number) => ({ groupId: group.id, departmentId: deptId }))
        );
      }

      res.json({ success: true, group });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/dispatch-groups/:id", async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.id);
      const { name, description, departmentIds } = req.body;

      const updates: any = {};
      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      updates.updatedAt = new Date();

      if (Object.keys(updates).length > 0) {
        await db.update(departmentGroups).set(updates).where(eq(departmentGroups.id, groupId));
      }

      if (departmentIds && Array.isArray(departmentIds)) {
        await db.delete(departmentGroupMembers).where(eq(departmentGroupMembers.groupId, groupId));
        if (departmentIds.length > 0) {
          await db.insert(departmentGroupMembers).values(
            departmentIds.map((deptId: number) => ({ groupId, departmentId: deptId }))
          );
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/dispatch-groups/:id", async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.id);

      const [group] = await db
        .select({ isSystem: departmentGroups.isSystem })
        .from(departmentGroups)
        .where(eq(departmentGroups.id, groupId));

      if (group?.isSystem) {
        return res.status(403).json({ message: "System groups cannot be deleted. You can modify their members instead." });
      }

      await db.delete(departmentGroupMembers).where(eq(departmentGroupMembers.groupId, groupId));
      await db.delete(departmentGroups).where(eq(departmentGroups.id, groupId));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTERNAL CONTACTS APIs
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/external-contacts", async (req: Request, res: Response) => {
    try {
      const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string) : null;

      const contacts = await db
        .select()
        .from(externalContacts)
        .where(
          departmentId
            ? or(
                eq(externalContacts.isGlobal, true),
                eq(externalContacts.createdByDepartmentId, departmentId)
              )
            : eq(externalContacts.isGlobal, true)
        )
        .orderBy(asc(externalContacts.name));

      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/external-contacts", async (req: Request, res: Response) => {
    try {
      const { name, contactType, designation, organization, address, email, phone, city, state, pinCode, notes, isGlobal, createdByDepartmentId } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });

      const [contact] = await db
        .insert(externalContacts)
        .values({
          name,
          contactType: contactType || "person",
          designation: designation || null,
          organization: organization || null,
          address: address || null,
          email: email || null,
          phone: phone || null,
          city: city || null,
          state: state || null,
          pinCode: pinCode || null,
          notes: notes || null,
          isGlobal: isGlobal !== false,
          createdByDepartmentId: createdByDepartmentId || null,
        })
        .returning();

      res.json({ success: true, contact });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/external-contacts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates = { ...req.body, updatedAt: new Date() };
      delete updates.id;
      delete updates.createdAt;

      await db.update(externalContacts).set(updates).where(eq(externalContacts.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/external-contacts/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(externalContacts).where(eq(externalContacts.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPATCH STATS (for dashboard)
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/dispatch/stats/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);

      const [sentCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchDocuments)
        .where(eq(dispatchDocuments.senderDepartmentId, departmentId));

      const [receivedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.departmentId, departmentId),
            eq(dispatchRecipients.recipientType, "department")
          )
        );

      const [unreadCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.departmentId, departmentId),
            eq(dispatchRecipients.recipientType, "department"),
            eq(dispatchRecipients.status, "dispatched")
          )
        );

      // Received but not yet closed here (disposed / forwarded / returned close it)
      const pending = (await db.execute(sql`
        SELECT COUNT(*)::int AS pending,
               COUNT(*) FILTER (WHERE action_due_date IS NOT NULL AND action_due_date < CURRENT_DATE)::int AS overdue
        FROM dispatch_recipients
        WHERE department_id = ${departmentId} AND recipient_type = 'department'
          AND received_at IS NOT NULL AND status NOT IN ${CLOSED_SQL}`)).rows[0] as any;

      res.json({
        sent: Number(sentCount?.count || 0),
        received: Number(receivedCount?.count || 0),
        unread: Number(unreadCount?.count || 0),
        pendingAction: Number(pending?.pending || 0),
        overdue: Number(pending?.overdue || 0),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });



  // ─── Add member to group ───────────────────────────────────────────────
  app.post("/api/dispatch-groups/:id/members", async (req: Request, res: Response) => {
    try {
      const groupId = parseInt(req.params.id);
      const { departmentId } = req.body;
      if (!departmentId) return res.status(400).json({ message: "departmentId is required" });

      // Check if already a member
      const existing = await db
        .select()
        .from(departmentGroupMembers)
        .where(
          and(
            eq(departmentGroupMembers.groupId, groupId),
            eq(departmentGroupMembers.departmentId, departmentId)
          )
        );

      if (existing.length > 0) {
        return res.status(409).json({ message: "Department is already a member of this group" });
      }

      const [member] = await db
        .insert(departmentGroupMembers)
        .values({ groupId, departmentId })
        .returning();

      res.json({ success: true, member });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Remove member from group ──────────────────────────────────────────
  app.delete("/api/dispatch-groups/:id/members/:memberId", async (req: Request, res: Response) => {
    try {
      const memberId = parseInt(req.params.memberId);
      await db.delete(departmentGroupMembers).where(eq(departmentGroupMembers.id, memberId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Search Dispatch Documents ──────────────────────────────────────────
  app.get("/api/dispatch/search/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });

      const q = (req.query.q as string || "").trim();
      const tab = req.query.tab as string || "inbox"; // "inbox" or "outbox"

      if (!q) return res.json([]);

      const searchTerm = `%${q}%`;

      if (tab === "outbox") {
        // Search outbox: documents sent by this department
        const results = await db
          .select()
          .from(dispatchDocuments)
          .where(
            and(
              eq(dispatchDocuments.senderDepartmentId, departmentId),
              or(
                ilike(dispatchDocuments.subject, searchTerm),
                ilike(dispatchDocuments.senderName, searchTerm),
                ilike(dispatchDocuments.documentType, searchTerm),
                sql`${dispatchDocuments.dispatchNumber} ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.outwardNumber} ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.inwardNumber} ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.referenceNumber} ILIKE ${searchTerm}`,
                sql`CAST(${dispatchDocuments.dispatchDate} AS TEXT) ILIKE ${searchTerm}`,
                sql`TO_CHAR(${dispatchDocuments.createdAt}, 'DD Mon YYYY') ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.aiExtractedData}->>'_actualSubject' ILIKE ${searchTerm}`,
                // text read from the scanned file and its attachments (OCR)
                sql`${dispatchDocuments.ocrText} ILIKE ${searchTerm}`,
                sql`EXISTS (SELECT 1 FROM dispatch_attachments a WHERE a.dispatch_id = ${dispatchDocuments.id} AND a.ocr_text ILIKE ${searchTerm})`
              )
            )
          )
          .orderBy(desc(dispatchDocuments.createdAt))
          .limit(50);

        // Enrich with recipients
        const enriched = await Promise.all(
          results.map(async (d) => {
            const recipients = await db
              .select({
                id: dispatchRecipients.id,
                recipientType: dispatchRecipients.recipientType,
                departmentId: dispatchRecipients.departmentId,
                status: dispatchRecipients.status,
                emailSent: dispatchRecipients.emailSent,
              })
              .from(dispatchRecipients)
              .where(eq(dispatchRecipients.dispatchId, d.id));

            const recipientDetails = await Promise.all(
              recipients.map(async (r) => {
                if (r.recipientType === "department" && r.departmentId) {
                  const [dept] = await db
                    .select({ name: departments.name })
                    .from(departments)
                    .where(eq(departments.id, r.departmentId));
                  return { ...r, name: dept?.name || "Unknown" };
                }
                return { ...r, name: "Unknown" };
              })
            );

            const actualSubject = d.isConfidential && d.aiExtractedData
              ? (d.aiExtractedData as any)?._actualSubject || d.subject
              : d.subject;

            return {
              ...d,
              ocrText: undefined,
              subject: actualSubject,
              recipients: recipientDetails,
              recipientCount: recipients.length,
              readCount: recipients.filter((r) => r.status === "read" || r.status === "forwarded" || r.status === "marked").length,
            };
          })
        );

        return res.json(enriched);
      } else {
        // Search inbox: documents received by this department
        // First get all dispatch IDs where this department is a recipient
        const recipientRecords = await db
          .select()
          .from(dispatchRecipients)
          .where(
            and(
              eq(dispatchRecipients.departmentId, departmentId),
              eq(dispatchRecipients.recipientType, "department")
            )
          );

        if (recipientRecords.length === 0) return res.json([]);

        const dispatchIds = recipientRecords.map(r => r.dispatchId);

        // Search within those dispatches
        const results = await db
          .select()
          .from(dispatchDocuments)
          .where(
            and(
              inArray(dispatchDocuments.id, dispatchIds),
              or(
                ilike(dispatchDocuments.subject, searchTerm),
                ilike(dispatchDocuments.senderName, searchTerm),
                ilike(dispatchDocuments.documentType, searchTerm),
                sql`${dispatchDocuments.dispatchNumber} ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.outwardNumber} ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.inwardNumber} ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.referenceNumber} ILIKE ${searchTerm}`,
                sql`CAST(${dispatchDocuments.dispatchDate} AS TEXT) ILIKE ${searchTerm}`,
                sql`TO_CHAR(${dispatchDocuments.createdAt}, 'DD Mon YYYY') ILIKE ${searchTerm}`,
                sql`${dispatchDocuments.aiExtractedData}->>'_actualSubject' ILIKE ${searchTerm}`,
                // text read from the scanned file and its attachments (OCR)
                sql`${dispatchDocuments.ocrText} ILIKE ${searchTerm}`,
                sql`EXISTS (SELECT 1 FROM dispatch_attachments a WHERE a.dispatch_id = ${dispatchDocuments.id} AND a.ocr_text ILIKE ${searchTerm})`
              )
            )
          )
          .orderBy(desc(dispatchDocuments.createdAt))
          .limit(50);

        // Enrich with recipient status
        const enriched = results.map((dispatch) => {
          const r = recipientRecords.filter(rec => rec.dispatchId === dispatch.id).sort((a, b) => b.id - a.id)[0];
          const isPhysicalReceive = (dispatch.aiExtractedData as any)?._physicalReceive === true;

          let subject = dispatch.subject;
          if (dispatch.isConfidential && dispatch.aiExtractedData) {
            subject = (dispatch.aiExtractedData as any)?._actualSubject || "CONFIDENTIAL";
          }

          return {
            ...dispatch,
            ocrText: undefined,
            subject,
            inwardNumber: r?.inwardNumber || dispatch.inwardNumber,
            recipientStatus: r?.status || "dispatched",
            recipientId: r?.id,
            receivedAt: r?.receivedAt,
            readAt: r?.readAt,
            markedToStaff: r?.markedToStaff,
            markedBy: r?.markedBy,
            markedAt: r?.markedAt,
            staffRemarks: r?.staffRemarks,
            actionDueDate: r?.actionDueDate,
            disposedAt: r?.disposedAt,
            disposalType: r?.disposalType,
            disposalRemarks: r?.disposalRemarks,
            fileNumber: r?.fileNumber,
            emailSent: r?.emailSent,
            isPhysicalReceive,
          };
        });

        return res.json(enriched);
      }
    } catch (error: any) {
      console.error("[Dispatch] Search error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  console.log("[Dispatch] Document dispatch routes registered successfully.");
}
