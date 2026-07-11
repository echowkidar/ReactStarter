/**
 * Document Dispatch System — API Routes
 * 
 * Completely separate from main routes.ts to avoid modifying existing code.
 * Registered via registerDispatchRoutes(app) in server/index.ts.
 */

import type { Express, Request, Response } from "express";
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
const uploadDir = path.join(__dirname, "../uploads/dispatch");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const dispatchStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "dispatch-" + uniqueSuffix + path.extname(file.originalname));
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

// ─── Helper: Generate short name from department name ─────────────────────
function generateShortName(name: string): string {
  const skipWords = new Set(["of", "the", "and", "&", "in", "for", "to", "a", "an", "f/o"]);
  const words = name
    .replace(/[()[\],]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !skipWords.has(w.toLowerCase()));
  return words.map((w) => w[0].toUpperCase()).join("");
}

// ─── Helper: Generate outward number ──────────────────────────────────────
async function generateOutwardNumber(departmentId: number, departmentName: string): Promise<string> {
  const now = new Date();
  const fyStart = now.getMonth() >= 3
    ? new Date(now.getFullYear(), 3, 1)
    : new Date(now.getFullYear() - 1, 3, 1);

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(dispatchDocuments)
    .where(
      and(
        eq(dispatchDocuments.senderDepartmentId, departmentId),
        sql`${dispatchDocuments.createdAt} >= ${fyStart.toISOString()}`
      )
    );

  const count = Number(result[0]?.count || 0) + 1;
  const shortName = generateShortName(departmentName);
  return `${count}/${shortName}`;
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
    async (req: any, res: Response) => {
      try {
        const {
          senderDepartmentId,
          senderName,
          documentType,
          subject,
          dispatchNumber,
          dispatchDate,
          referenceNumber,
          isConfidential,
          priority,
          aiExtractedData,
          aiConfidence,
          recipients,
          sendEmail,
        } = req.body;

        if (!senderDepartmentId || !senderName || !documentType || !subject) {
          return res.status(400).json({ message: "Missing required fields: senderDepartmentId, senderName, documentType, subject" });
        }

        // Determine file URL
        let fileUrl = req.body.fileUrl;
        let fileType = req.body.fileType || "image";
        if (req.file) {
          fileUrl = `/uploads/dispatch/${path.basename(req.file.path)}`;
          fileType = req.file.mimetype.includes("pdf") ? "pdf" : "image";
        }
        if (!fileUrl) {
          fileUrl = ""; // Use empty string instead of throwing error for manual dispatch
        }

        // Generate outward number
        const outwardNumber = await generateOutwardNumber(
          parseInt(senderDepartmentId),
          senderName
        );

        // Store actual subject separately for confidential docs
        const storedSubject = (isConfidential === "true" || isConfidential === true) ? "CONFIDENTIAL" : subject;

        // Create dispatch document
        const [dispatch] = await db
          .insert(dispatchDocuments)
          .values({
            senderDepartmentId: parseInt(senderDepartmentId),
            senderName,
            documentType,
            subject: storedSubject,
            dispatchNumber: dispatchNumber || null,
            dispatchDate: dispatchDate || null,
            referenceNumber: referenceNumber || null,
            outwardNumber,
            fileUrl,
            fileType,
            isConfidential: isConfidential === "true" || isConfidential === true,
            priority: priority || "normal",
            aiExtractedData: aiExtractedData
              ? {
                  ...(typeof aiExtractedData === "string" ? JSON.parse(aiExtractedData) : aiExtractedData),
                  _actualSubject: subject, // Always store real subject in AI data
                }
              : { _actualSubject: subject },
            aiConfidence: aiConfidence || null,
          })
          .returning();

        // Parse recipients and resolve groups
        let parsedRecipients: Array<{ type: string; id: number }> = [];
        try {
          const recipientData = typeof recipients === "string" ? JSON.parse(recipients) : recipients;
          if (Array.isArray(recipientData)) {
            for (const r of recipientData) {
              if (r.type === "group") {
                const members = await db
                  .select({ departmentId: departmentGroupMembers.departmentId })
                  .from(departmentGroupMembers)
                  .where(eq(departmentGroupMembers.groupId, r.id));
                for (const m of members) {
                  if (m.departmentId !== parseInt(senderDepartmentId)) {
                    parsedRecipients.push({ type: "department", id: m.departmentId });
                  }
                }
              } else {
                parsedRecipients.push({ type: r.type, id: r.id });
              }
            }
          }
        } catch (e) {
          console.error("[Dispatch] Error parsing recipients:", e);
        }

        // Deduplicate
        const seen = new Set<string>();
        parsedRecipients = parsedRecipients.filter((r) => {
          const key = `${r.type}-${r.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Insert recipients
        if (parsedRecipients.length > 0) {
          await db.insert(dispatchRecipients).values(
            parsedRecipients.map((r) => ({
              dispatchId: dispatch.id,
              recipientType: r.type,
              departmentId: r.type === "department" ? r.id : null,
              externalContactId: r.type === "external" ? r.id : null,
              status: "dispatched" as const,
            }))
          );
        }

        // Create tracking entry
        await db.insert(dispatchTracking).values({
          dispatchId: dispatch.id,
          action: "created",
          actionByDepartmentId: parseInt(senderDepartmentId),
          actionByName: senderName,
          details: `Dispatched to ${parsedRecipients.length} recipient(s). Outward No: ${outwardNumber}`,
        });

        if (sendEmail === "true" || sendEmail === true) {
          try {
            // Fetch sender's official email from departments table
            const [senderDeptRecord] = await db
              .select({ email: departments.email })
              .from(departments)
              .where(eq(departments.id, parseInt(senderDepartmentId)));
            const senderOfficialEmail = senderDeptRecord?.email;

            const { sendDispatchNotificationEmail } = await import("./emailService");
            let emailsSentCount = 0;
            
            for (const r of parsedRecipients) {
              if (r.type === "department") {
                const [dept] = await db
                  .select({ email: departments.email, name: departments.name })
                  .from(departments)
                  .where(eq(departments.id, r.id));
                if (dept?.email && !dept.email.includes("example.com")) {
                  try {
                    const result = await sendDispatchNotificationEmail(
                      dept.email,
                      dispatch.isConfidential ? "CONFIDENTIAL" : subject,
                      senderName,
                      documentType,
                      dispatchNumber || outwardNumber,
                      dispatch.isConfidential,
                      dispatch.fileUrl,
                      senderOfficialEmail
                    );
                    
                    if (result.success) {
                      emailsSentCount++;
                      await db
                        .update(dispatchRecipients)
                        .set({ emailSent: true, emailSentAt: new Date() })
                        .where(
                          and(
                            eq(dispatchRecipients.dispatchId, dispatch.id),
                            eq(dispatchRecipients.departmentId, r.id)
                          )
                        );
                    } else {
                      console.error(`[Dispatch] Email failed for ${dept.email}:`, result.error);
                    }
                  } catch (emailErr) {
                    console.error(`[Dispatch] Email exception for ${dept.email}:`, emailErr);
                  }
                }
              }
            }

            if (emailsSentCount > 0) {
              await db.insert(dispatchTracking).values({
                dispatchId: dispatch.id,
                action: "email_sent",
                actionByDepartmentId: parseInt(senderDepartmentId),
                actionByName: senderName,
                details: `Email notifications sent to ${emailsSentCount} recipient(s)`,
              });
            } else {
              await db.insert(dispatchTracking).values({
                dispatchId: dispatch.id,
                action: "email_sent",
                actionByDepartmentId: parseInt(senderDepartmentId),
                actionByName: senderName,
                details: `Email notifications failed to send`,
              });
            }
          } catch (emailError) {
            console.error("[Dispatch] Email notification error:", emailError);
          }
        }

        res.json({
          success: true,
          dispatch: { ...dispatch, subject },
          outwardNumber,
          recipientCount: parsedRecipients.length,
        });
      } catch (error: any) {
        console.error("[Dispatch] Create error:", error);
        res.status(500).json({ message: "Failed to create dispatch", error: error.message });
      }
    }
  );

  // ─── Receive Document (Physical / External Inward Entry) ────────────────
  // For documents physically received by a department (from outside, internal staff, etc.)
  app.post(
    "/api/dispatch/receive-external",
    dispatchUpload.single("file"),
    async (req: any, res: Response) => {
      try {
        const {
          receivingDepartmentId,
          receivingDepartmentName,
          documentType,
          subject,
          senderInfo,           // Free text: "UGC", "Staff Name", "External Org" etc.
          dispatchNumber,
          dispatchDate,
          referenceNumber,
          inwardNumber: providedInwardNumber,
          priority,
          isConfidential,
          markedToStaff,
          staffRemarks,
        } = req.body;

        if (!receivingDepartmentId || !receivingDepartmentName || !documentType || !subject) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        let fileUrl = req.body.fileUrl;
        let fileType = req.body.fileType || "image";
        if (req.file) {
          fileUrl = `/uploads/dispatch/${path.basename(req.file.path)}`;
          fileType = req.file.mimetype.includes("pdf") ? "pdf" : "image";
        }

        // Generate inward number for receiving department
        const now = new Date();
        const fyStart = now.getMonth() >= 3
          ? new Date(now.getFullYear(), 3, 1)
          : new Date(now.getFullYear() - 1, 3, 1);

        const inwardCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(dispatchDocuments)
          .where(
            and(
              sql`${dispatchDocuments.aiExtractedData}->>'_receivedByDepartmentId' = ${receivingDepartmentId.toString()}`,
              sql`${dispatchDocuments.createdAt} >= ${fyStart.toISOString()}`
            )
          );

        // Also count inward entries from dispatch_recipients
        const inwardCount2 = await db
          .select({ count: sql<number>`count(*)` })
          .from(dispatchRecipients)
          .where(
            and(
              eq(dispatchRecipients.departmentId, parseInt(receivingDepartmentId)),
              sql`${dispatchRecipients.receivedAt} IS NOT NULL`,
              sql`${dispatchRecipients.receivedAt} >= ${fyStart.toISOString()}`
            )
          );

        const totalInward = Number(inwardCount[0]?.count || 0) + Number(inwardCount2[0]?.count || 0) + 1;
        const shortName = generateShortName(receivingDepartmentName);
        
        const inwardNumber = providedInwardNumber ? providedInwardNumber : `${totalInward}/${shortName}`;

        // Create dispatch document as a "received" entry
        // senderDepartmentId = 0 means external/unknown sender
        const [dispatch] = await db
          .insert(dispatchDocuments)
          .values({
            senderDepartmentId: 0, // 0 = external/physical sender
            senderName: senderInfo || "External",
            documentType,
            subject: (isConfidential === "true" || isConfidential === true) ? "CONFIDENTIAL" : subject,
            dispatchNumber: dispatchNumber || null,
            dispatchDate: dispatchDate || null,
            referenceNumber: referenceNumber || null,
            inwardNumber,
            fileUrl: fileUrl || "",
            fileType: fileType || "image",
            isConfidential: isConfidential === "true" || isConfidential === true,
            priority: priority || "normal",
            aiExtractedData: {
              _actualSubject: subject,
              _receivedByDepartmentId: receivingDepartmentId.toString(),
              _physicalReceive: true,
              _senderInfo: senderInfo || "External",
            },
          })
          .returning();

        // Create recipient record with status = received
        await db.insert(dispatchRecipients).values({
          dispatchId: dispatch.id,
          recipientType: "department",
          departmentId: parseInt(receivingDepartmentId),
          status: markedToStaff ? "marked" : "received",
          receivedAt: new Date(),
          markedToStaff: markedToStaff || null,
          staffRemarks: staffRemarks || null,
          markedBy: markedToStaff ? receivingDepartmentName : null,
          markedAt: markedToStaff ? new Date() : null,
        });

        // Create tracking entry
        await db.insert(dispatchTracking).values({
          dispatchId: dispatch.id,
          action: markedToStaff ? "marked_to_staff" : "received_physical",
          actionByDepartmentId: parseInt(receivingDepartmentId),
          actionByName: receivingDepartmentName,
          details: markedToStaff 
            ? `Physical document received and marked to: ${markedToStaff}. Remarks: ${staffRemarks || "None"}. Inward No: ${inwardNumber}` 
            : `Physical document received from: ${senderInfo || "External"}. Inward No: ${inwardNumber}`,
        });

        res.json({
          success: true,
          dispatch,
          inwardNumber,
        });
      } catch (error: any) {
        console.error("[Dispatch] Receive external error:", error);
        res.status(500).json({ message: "Failed to record received document", error: error.message });
      }
    }
  );

  // ─── Get Outbox (Sent Dispatches) ───────────────────────────────────────
  app.get("/api/dispatch/outbox/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });

      const fy = req.query.fy as string;
      const conditions = [eq(dispatchDocuments.senderDepartmentId, departmentId)];

      if (fy && fy !== "all") {
        const year = parseInt(fy.split("-")[0]);
        if (!isNaN(year)) {
          const start = new Date(year, 3, 1).toISOString();
          const end = new Date(year + 1, 2, 31, 23, 59, 59, 999).toISOString();
          conditions.push(sql`${dispatchDocuments.createdAt} >= ${start}`);
          conditions.push(sql`${dispatchDocuments.createdAt} <= ${end}`);
        }
      }

      const dispatches = await db
        .select()
        .from(dispatchDocuments)
        .where(and(...conditions))
        .orderBy(desc(dispatchDocuments.createdAt));

      const results = await Promise.all(
        dispatches.map(async (d) => {
          const recipients = await db
            .select({
              id: dispatchRecipients.id,
              recipientType: dispatchRecipients.recipientType,
              departmentId: dispatchRecipients.departmentId,
              externalContactId: dispatchRecipients.externalContactId,
              status: dispatchRecipients.status,
              emailSent: dispatchRecipients.emailSent,
              readAt: dispatchRecipients.readAt,
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
              } else if (r.recipientType === "external" && r.externalContactId) {
                const [ext] = await db
                  .select({ name: externalContacts.name })
                  .from(externalContacts)
                  .where(eq(externalContacts.id, r.externalContactId));
                return { ...r, name: ext?.name || "Unknown External" };
              }
              return { ...r, name: "Unknown" };
            })
          );

          // Return actual subject for sender's own dispatches
          const actualSubject = d.isConfidential && d.aiExtractedData
            ? (d.aiExtractedData as any)?._actualSubject || d.subject
            : d.subject;

          return {
            ...d,
            subject: actualSubject,
            recipients: recipientDetails,
            recipientCount: recipients.length,
            readCount: recipients.filter((r) => r.readAt !== null && r.readAt !== undefined).length,
          };
        })
      );

      res.json(results);
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
        eq(dispatchRecipients.recipientType, "department")
      ];

      if (fy && fy !== "all") {
        const year = parseInt(fy.split("-")[0]);
        if (!isNaN(year)) {
          const start = new Date(year, 3, 1).toISOString();
          const end = new Date(year + 1, 2, 31, 23, 59, 59, 999).toISOString();
          conditions.push(sql`${dispatchRecipients.createdAt} >= ${start}`);
          conditions.push(sql`${dispatchRecipients.createdAt} <= ${end}`);
        }
      }

      const recipientRecords = await db
        .select()
        .from(dispatchRecipients)
        .where(and(...conditions))
        .orderBy(desc(dispatchRecipients.createdAt));

      const results = await Promise.all(
        recipientRecords.map(async (r) => {
          const [dispatch] = await db
            .select()
            .from(dispatchDocuments)
            .where(eq(dispatchDocuments.id, r.dispatchId));

          if (!dispatch) return null;

          // For confidential docs: show actual subject to recipient
          let subject = dispatch.subject;
          if (dispatch.isConfidential && dispatch.aiExtractedData) {
            subject = (dispatch.aiExtractedData as any)?._actualSubject || "CONFIDENTIAL";
          }

          // Check if this is a physically received external document
          const isPhysicalReceive = (dispatch.aiExtractedData as any)?._physicalReceive === true;

            return {
              ...dispatch,
              subject,
              inwardNumber: r.inwardNumber || dispatch.inwardNumber,
              recipientStatus: r.status,
              recipientId: r.id,
              receivedAt: r.receivedAt,
              readAt: r.readAt,
              markedToStaff: r.markedToStaff,
              markedBy: r.markedBy,
              staffRemarks: r.staffRemarks,
              emailSent: r.emailSent,
              isPhysicalReceive,
            };
        })
      );

      res.json(results.filter(Boolean));
    } catch (error: any) {
      console.error("[Dispatch] Inbox error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Inbox Count (for sidebar badge) ────────────────────────────────
  app.get("/api/dispatch/inbox-count/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });

      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.departmentId, departmentId),
            eq(dispatchRecipients.recipientType, "department"),
            eq(dispatchRecipients.status, "dispatched")
          )
        );

      res.json({ count: Number(result[0]?.count || 0) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Next Inward Number (Receipt Number) ────────────────────────────
  app.get("/api/dispatch/next-inward-number/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });
      
      const departmentName = req.query.name as string;
      if (!departmentName) return res.status(400).json({ message: "Missing department name" });

      const now = new Date();
      const fyStart = now.getMonth() >= 3 
        ? new Date(now.getFullYear(), 3, 1) 
        : new Date(now.getFullYear() - 1, 3, 1);

      const inwardCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchDocuments)
        .where(
          and(
            sql`${dispatchDocuments.aiExtractedData}->>'_receivedByDepartmentId' = ${departmentId.toString()}`,
            sql`${dispatchDocuments.createdAt} >= ${fyStart.toISOString()}`
          )
        );

      const inwardCount2 = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.departmentId, departmentId),
            sql`${dispatchRecipients.receivedAt} IS NOT NULL`,
            sql`${dispatchRecipients.receivedAt} >= ${fyStart.toISOString()}`
          )
        );

      const totalInward = Number(inwardCount[0]?.count || 0) + Number(inwardCount2[0]?.count || 0) + 1;
      const shortName = generateShortName(departmentName);
      
      res.json({ nextNumber: `${totalInward}/${shortName}` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Get Next Outward Number (Dispatch Number) ────────────────────────────
  app.get("/api/dispatch/next-outward-number/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      if (isNaN(departmentId)) return res.status(400).json({ message: "Invalid department ID" });
      
      const departmentName = req.query.name as string;
      if (!departmentName) return res.status(400).json({ message: "Missing department name" });

      const now = new Date();
      const fyStart = now.getMonth() >= 3 
        ? new Date(now.getFullYear(), 3, 1) 
        : new Date(now.getFullYear() - 1, 3, 1);

      const outwardCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchDocuments)
        .where(
          and(
            eq(dispatchDocuments.senderDepartmentId, departmentId),
            sql`${dispatchDocuments.createdAt} >= ${fyStart.toISOString()}`
          )
        );

      const totalOutward = Number(outwardCount[0]?.count || 0) + 1;
      const shortName = generateShortName(departmentName);
      
      res.json({ nextNumber: `${totalOutward}/${shortName}` });
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
      const requestingDeptId = parseInt(req.query.departmentId as string);

      const [dispatch] = await db
        .select()
        .from(dispatchDocuments)
        .where(eq(dispatchDocuments.id, id));

      if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });

      const recipients = await db
        .select()
        .from(dispatchRecipients)
        .where(eq(dispatchRecipients.dispatchId, id));

      const recipientDetails = await Promise.all(
        recipients.map(async (r) => {
          if (r.recipientType === "department" && r.departmentId) {
            const [dept] = await db
              .select({ name: departments.name, email: departments.email })
              .from(departments)
              .where(eq(departments.id, r.departmentId));
            return { ...r, name: dept?.name || "Unknown", email: dept?.email };
          } else if (r.recipientType === "external" && r.externalContactId) {
            const [ext] = await db
              .select({ name: externalContacts.name, email: externalContacts.email })
              .from(externalContacts)
              .where(eq(externalContacts.id, r.externalContactId));
            return { ...r, name: ext?.name || "Unknown External", email: ext?.email };
          }
          return { ...r, name: "Unknown" };
        })
      );

      const tracking = await db
        .select()
        .from(dispatchTracking)
        .where(eq(dispatchTracking.dispatchId, id))
        .orderBy(asc(dispatchTracking.createdAt));

      const isSender = dispatch.senderDepartmentId === requestingDeptId;
      const isRecipient = recipients.some((r) => r.departmentId === requestingDeptId);

      let subject = dispatch.subject;
      let fileUrl = dispatch.fileUrl;

      if (dispatch.isConfidential) {
        if (isSender || isRecipient) {
          subject = (dispatch.aiExtractedData as any)?._actualSubject || dispatch.subject;
        } else {
          subject = "CONFIDENTIAL";
          fileUrl = "";
        }
      }

      const userRecipient = recipients.find(r => r.departmentId === requestingDeptId);
      const recipientInwardNumber = userRecipient?.inwardNumber || dispatch.inwardNumber;

      res.json({
        ...dispatch,
        inwardNumber: recipientInwardNumber,
        subject,
        fileUrl,
        recipients: recipientDetails,
        tracking,
        canViewContent: !dispatch.isConfidential || isSender || isRecipient,
      });
    } catch (error: any) {
      console.error("[Dispatch] Detail error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Mark as Received ───────────────────────────────────────────────────
  app.patch("/api/dispatch/:id/receive", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const { departmentId, departmentName } = req.body;

      const [recipientRow] = await db
        .select()
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, departmentId)
          )
        );

      if (!recipientRow) {
        return res.status(404).json({ message: "Recipient not found" });
      }

      if (recipientRow.inwardNumber) {
        return res.json({ success: true, inwardNumber: recipientRow.inwardNumber });
      }

      const now = new Date();
      const fyStart = now.getMonth() >= 3
        ? new Date(now.getFullYear(), 3, 1)
        : new Date(now.getFullYear() - 1, 3, 1);

      const inwardCount1 = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchDocuments)
        .where(
          and(
            sql`${dispatchDocuments.aiExtractedData}->>'_receivedByDepartmentId' = ${departmentId.toString()}`,
            sql`${dispatchDocuments.createdAt} >= ${fyStart.toISOString()}`
          )
        );

      const inwardCount2 = await db
        .select({ count: sql<number>`count(*)` })
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.departmentId, departmentId),
            sql`${dispatchRecipients.receivedAt} IS NOT NULL`,
            sql`${dispatchRecipients.receivedAt} >= ${fyStart.toISOString()}`
          )
        );

      const totalInward = Number(inwardCount1[0]?.count || 0) + Number(inwardCount2[0]?.count || 0) + 1;
      const inwardNumber = `${totalInward}/${generateShortName(departmentName || "DEPT")}`;

      const newStatus = (recipientRow.status === "dispatched" || recipientRow.status === "read") 
        ? "received" 
        : recipientRow.status;

      console.log(`[Dispatch Receive] Updating dispatchId=${dispatchId} deptId=${departmentId}`);
      console.log(`[Dispatch Receive] Setting inwardNumber=${inwardNumber}, status=${newStatus}`);

      const updateResult = await db
        .update(dispatchRecipients)
        .set({ 
          status: newStatus, 
          receivedAt: new Date(),
          inwardNumber: inwardNumber 
        })
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, departmentId)
          )
        )
        .returning();
      
      console.log(`[Dispatch Receive] Update result:`, updateResult);



      await db.insert(dispatchTracking).values({
        dispatchId,
        action: "received",
        actionByDepartmentId: departmentId,
        actionByName: departmentName || "Department",
        details: `Document received. Inward No: ${inwardNumber}`,
        recipientDepartmentId: departmentId,
      });

      res.json({ success: true, inwardNumber });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Mark as Read ───────────────────────────────────────────────────────
  app.patch("/api/dispatch/:id/read", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const { departmentId, departmentName } = req.body;

      const [recipient] = await db
        .select()
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, departmentId)
          )
        );

      if (recipient) {
        const updateData: any = {};
        let isFirstRead = false;

        if (!recipient.readAt) {
          updateData.readAt = new Date();
          isFirstRead = true;
        }

        if (recipient.status === "received") {
          updateData.status = "read";
        }

        if (Object.keys(updateData).length > 0) {
          await db
            .update(dispatchRecipients)
            .set(updateData)
            .where(eq(dispatchRecipients.id, recipient.id));

          if (isFirstRead) {
            await db.insert(dispatchTracking).values({
              dispatchId,
              action: "read",
              actionByDepartmentId: departmentId,
              actionByName: departmentName || "Department",
              details: `Document viewed`,
              recipientDepartmentId: departmentId,
            });
          }
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Forward Dispatch ───────────────────────────────────────────────────
  app.post("/api/dispatch/:id/forward", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const { departmentId, departmentName, forwardTo, remarks } = req.body;

      const forwardRecipients = typeof forwardTo === "string" ? JSON.parse(forwardTo) : forwardTo;
      if (!Array.isArray(forwardRecipients) || forwardRecipients.length === 0) {
        return res.status(400).json({ message: "No forward recipients specified" });
      }

      await db.insert(dispatchRecipients).values(
        forwardRecipients.map((r: any) => ({
          dispatchId,
          recipientType: r.type || "department",
          departmentId: r.type === "department" ? r.id : null,
          externalContactId: r.type === "external" ? r.id : null,
          status: "dispatched" as const,
        }))
      );

      await db
        .update(dispatchRecipients)
        .set({ status: "forwarded" })
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, departmentId)
          )
        );

      const forwardNames: string[] = [];
      for (const r of forwardRecipients) {
        if (r.type === "department") {
          const [dept] = await db.select({ name: departments.name }).from(departments).where(eq(departments.id, r.id));
          forwardNames.push(dept?.name || "Unknown");
        }
      }

      await db.insert(dispatchTracking).values({
        dispatchId,
        action: "forwarded",
        actionByDepartmentId: departmentId,
        actionByName: departmentName || "Department",
        details: `Forwarded to: ${forwardNames.join(", ")}${remarks ? `. Remarks: ${remarks}` : ""}`,
        recipientDepartmentId: departmentId,
      });

      res.json({ success: true, forwardedTo: forwardRecipients.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Mark to Staff ──────────────────────────────────────────────────────
  app.post("/api/dispatch/:id/mark-staff", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const { departmentId, departmentName, employeeId, employeeName, remarks } = req.body;

      await db
        .update(dispatchRecipients)
        .set({
          status: "marked",
          markedToStaff: employeeName,
          markedToEmployeeId: employeeId || null,
          markedAt: new Date(),
          markedBy: departmentName,
          staffRemarks: remarks || null,
        })
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, departmentId)
          )
        );

      await db.insert(dispatchTracking).values({
        dispatchId,
        action: "marked_to_staff",
        actionByDepartmentId: departmentId,
        actionByName: departmentName || "Department",
        details: `Marked to: ${employeeName}${remarks ? `. Remarks: ${remarks}` : ""}`,
        recipientDepartmentId: departmentId,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Return In Original (RIO) ───────────────────────────────────────────
  app.post("/api/dispatch/:id/rio", async (req: Request, res: Response) => {
    try {
      const dispatchId = parseInt(req.params.id);
      const { departmentId, departmentName, remarks } = req.body;

      const [dispatch] = await db
        .select()
        .from(dispatchDocuments)
        .where(eq(dispatchDocuments.id, dispatchId));

      if (!dispatch) return res.status(404).json({ message: "Dispatch not found" });
      if (!dispatch.senderDepartmentId) {
        return res.status(400).json({ message: "Cannot RIO external or unknown sender documents" });
      }

      const senderDeptId = dispatch.senderDepartmentId;

      await db
        .update(dispatchRecipients)
        .set({ status: "returned", staffRemarks: remarks || null })
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, departmentId)
          )
        );

      const [existingSenderRecipient] = await db
        .select()
        .from(dispatchRecipients)
        .where(
          and(
            eq(dispatchRecipients.dispatchId, dispatchId),
            eq(dispatchRecipients.departmentId, senderDeptId)
          )
        );

      if (existingSenderRecipient) {
        await db
          .update(dispatchRecipients)
          .set({ status: "dispatched" })
          .where(eq(dispatchRecipients.id, existingSenderRecipient.id));
      } else {
        await db.insert(dispatchRecipients).values({
          dispatchId,
          recipientType: "department",
          departmentId: senderDeptId,
          status: "dispatched"
        });
      }

      await db.insert(dispatchTracking).values({
        dispatchId,
        action: "returned",
        actionByDepartmentId: departmentId,
        actionByName: departmentName || "Department",
        details: `Returned in Original (RIO) to Sender. Remarks: ${remarks || "None"}`,
        recipientDepartmentId: senderDeptId,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Dispatch] RIO error:", error);
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

      res.json({
        sent: Number(sentCount?.count || 0),
        received: Number(receivedCount?.count || 0),
        unread: Number(unreadCount?.count || 0),
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
                sql`${dispatchDocuments.aiExtractedData}->>'_actualSubject' ILIKE ${searchTerm}`
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
                sql`${dispatchDocuments.aiExtractedData}->>'_actualSubject' ILIKE ${searchTerm}`
              )
            )
          )
          .orderBy(desc(dispatchDocuments.createdAt))
          .limit(50);

        // Enrich with recipient status
        const enriched = results.map((dispatch) => {
          const r = recipientRecords.find(rec => rec.dispatchId === dispatch.id);
          const isPhysicalReceive = (dispatch.aiExtractedData as any)?._physicalReceive === true;

          let subject = dispatch.subject;
          if (dispatch.isConfidential && dispatch.aiExtractedData) {
            subject = (dispatch.aiExtractedData as any)?._actualSubject || "CONFIDENTIAL";
          }

          return {
            ...dispatch,
            subject,
            recipientStatus: r?.status || "dispatched",
            recipientId: r?.id,
            receivedAt: r?.receivedAt,
            readAt: r?.readAt,
            markedToStaff: r?.markedToStaff,
            markedBy: r?.markedBy,
            staffRemarks: r?.staffRemarks,
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
