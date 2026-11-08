// Dak extras: My Dak (staff), acknowledge, withdraw / cancel entry, attachments,
// public QR verification, MIS reports, printable registers, acknowledgements for
// senders of physical dak, admin university-wide tracking and overdue reminders.
import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { sql, eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import { dispatchDocuments, dispatchRecipients } from "../shared/schema";
import { deptActor } from "./dakStaff";
import { safeUploadName } from "./security";
import { notify } from "./notify";
import {
  DAK_UPLOAD_DIR, CLOSED_SQL, DISPATCH_MODES, who, track, toInboxItem, queueOcr, recipientsWithNames,
  escapeHtml, publicBaseUrl, ymd, fyBounds,
} from "./dakCore";

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DAK_UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, safeUploadName("dak-att", file)),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"].includes(file.mimetype)
      || /\.pdf$/i.test(file.originalname);
    cb(null, ok);
  },
});

/** Date range from ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: this financial year up to today) */
function range(req: Request) {
  const ok = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
  const { start } = fyBounds(new Date());
  const from = ok(req.query.from) ? String(req.query.from) : ymd(start);
  const to = ok(req.query.to) ? String(req.query.to) : ymd(new Date());
  return { from, to };
}

const subjectOf = (d: { isConfidential: boolean; subject: string; aiExtractedData: unknown }) =>
  d.isConfidential ? ((d.aiExtractedData as any)?._actualSubject || "CONFIDENTIAL") : d.subject;

export function registerDakExtraRoutes(app: Express) {
  // ─── My Dak: dak marked to the logged-in staff person ────────────────────
  app.get("/api/dispatch/my/:departmentId", async (req: Request, res: Response) => {
    try {
      const actor = await deptActor(req);
      if (!actor?.staffId) return res.json([]);
      const rows = await db
        .select({ r: dispatchRecipients, d: dispatchDocuments })
        .from(dispatchRecipients)
        .innerJoin(dispatchDocuments, eq(dispatchDocuments.id, dispatchRecipients.dispatchId))
        .where(and(
          eq(dispatchRecipients.departmentId, actor.departmentId),
          sql`${actor.staffId} = ANY(COALESCE(${dispatchRecipients.markedStaffIds}, '{}'))`,
        ))
        .orderBy(desc(dispatchRecipients.markedAt));
      res.json(rows.map((x) => toInboxItem(x.r, x.d)));
    } catch (error: any) {
      console.error("[Dak] my dak error:", error);
      res.status(500).json({ message: "Could not load your dak" });
    }
  });

  // ─── Acknowledge (the marked staff person confirms they have it) ─────────
  app.post("/api/dispatch/:id/acknowledge", async (req: Request, res: Response) => {
    try {
      const dispatchId = Number(req.params.id);
      const actor = await deptActor(req);
      if (!actor?.staffId) return res.status(400).json({ message: "Only a staff login can acknowledge dak marked to it" });
      const [row] = await db.select().from(dispatchRecipients)
        .where(and(
          eq(dispatchRecipients.dispatchId, dispatchId),
          eq(dispatchRecipients.departmentId, actor.departmentId),
          sql`${actor.staffId} = ANY(COALESCE(${dispatchRecipients.markedStaffIds}, '{}'))`,
        ))
        .orderBy(desc(dispatchRecipients.id)).limit(1);
      if (!row) return res.status(404).json({ message: "This dak is not marked to you" });
      if (!row.acknowledgedAt) {
        await db.update(dispatchRecipients).set({ acknowledgedAt: new Date(), acknowledgedBy: actor.staffName }).where(eq(dispatchRecipients.id, row.id));
        await track({ dispatchId, action: "acknowledged", actor, details: `Acknowledged by ${actor.staffName}`, recipientDepartmentId: actor.departmentId });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Withdraw an outward dispatch (before anyone received it) ───────────
  app.post("/api/dispatch/:id/withdraw", async (req: Request, res: Response) => {
    try {
      const dispatchId = Number(req.params.id);
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ message: "Please give the reason for withdrawing" });
      const [doc] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const actor = await who(req, doc.senderDepartmentId);
      if ((doc.aiExtractedData as any)?._physicalReceive || actor.departmentId !== doc.senderDepartmentId) {
        return res.status(403).json({ message: "Only the sending department can withdraw its dispatch" });
      }
      if (doc.cancelledAt) return res.status(400).json({ message: "Already withdrawn" });
      const recipients = await recipientsWithNames([dispatchId]);
      const received = recipients.filter((r) => r.receivedAt);
      if (received.length) {
        return res.status(400).json({ message: `Already received by ${received.map((r) => r.name).join(", ")}. Ask them to return it (RIO) instead.` });
      }
      await db.update(dispatchDocuments).set({ cancelledAt: new Date(), cancelReason: reason, cancelledBy: actor.label }).where(eq(dispatchDocuments.id, dispatchId));
      await db.update(dispatchRecipients).set({ status: "withdrawn" }).where(eq(dispatchRecipients.dispatchId, dispatchId));
      await track({ dispatchId, action: "withdrawn", actor, details: `Dispatch withdrawn. Reason: ${reason}` });
      const deptIds = recipients.filter((r) => r.departmentId).map((r) => Number(r.departmentId));
      if (deptIds.length) {
        void notify("dak.withdrawn", deptIds.map((id) => ({ kind: "department" as const, departmentId: id })), {
          title: `Dak withdrawn by ${actor.departmentName}`,
          text: `${doc.outwardNumber}: ${doc.isConfidential ? "CONFIDENTIAL" : doc.subject} — ${reason}`,
          link: "/dashboard/dispatch",
        });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Cancel a wrong physical receipt entry (number stays used) ──────────
  app.post("/api/dispatch/:id/cancel-entry", async (req: Request, res: Response) => {
    try {
      const dispatchId = Number(req.params.id);
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ message: "Please give the reason for cancelling" });
      const [doc] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const extra = (doc.aiExtractedData as any) || {};
      const actor = await who(req, extra._receivedByDepartmentId);
      if (!extra._physicalReceive || String(extra._receivedByDepartmentId) !== String(actor.departmentId)) {
        return res.status(403).json({ message: "Only the receiving department can cancel its own physical entry" });
      }
      if (!actor.isSupervisor) return res.status(403).json({ message: "Only the department admin, HOD or Section Officer can cancel an entry" });
      if (doc.cancelledAt) return res.status(400).json({ message: "Already cancelled" });
      await db.update(dispatchDocuments).set({ cancelledAt: new Date(), cancelReason: reason, cancelledBy: actor.label }).where(eq(dispatchDocuments.id, dispatchId));
      await db.update(dispatchRecipients).set({ status: "cancelled" })
        .where(and(eq(dispatchRecipients.dispatchId, dispatchId), eq(dispatchRecipients.departmentId, actor.departmentId)));
      await track({ dispatchId, action: "cancelled", actor, details: `Entry cancelled (R.No. ${doc.inwardNumber} stays used). Reason: ${reason}` });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Attachments (annexures) ─────────────────────────────────────────────
  app.post("/api/dispatch/:id/attachments", attachmentUpload.single("file"), async (req: any, res: Response) => {
    try {
      const dispatchId = Number(req.params.id);
      if (!req.file) return res.status(400).json({ message: "Only PDF or image files can be attached" });
      const [doc] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.id, dispatchId));
      if (!doc) return res.status(404).json({ message: "Document not found" });
      if (doc.cancelledAt) return res.status(400).json({ message: "This entry is cancelled / withdrawn" });
      const actor = await who(req, req.body?.departmentId);
      const fileUrl = `/uploads/dispatch/${path.basename(req.file.path)}`;
      const fileType = /pdf/i.test(req.file.mimetype) || /\.pdf$/i.test(req.file.originalname) ? "pdf" : "image";
      const row = (await db.execute(sql`
        INSERT INTO dispatch_attachments (dispatch_id, file_url, file_type, original_name, added_by, added_by_department_id)
        VALUES (${dispatchId}, ${fileUrl}, ${fileType}, ${String(req.file.originalname || "").slice(0, 200)}, ${actor.label}, ${actor.departmentId || null})
        RETURNING id`)).rows[0] as any;
      await track({ dispatchId, action: "attachment_added", actor, details: `Attachment added: ${String(req.file.originalname || "file").slice(0, 120)}` });
      queueOcr({ kind: "attachment", id: Number(row.id), fileUrl });
      res.status(201).json({ id: row.id, fileUrl, fileType });
    } catch (error: any) {
      console.error("[Dak] attachment error:", error);
      res.status(500).json({ message: "Could not add the attachment" });
    }
  });

  // ─── Public verification of an outward document (QR code) ───────────────
  app.get("/api/public/dak/verify/:token", async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "");
      if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return res.status(404).json({ message: "Not found" });
      const [doc] = await db.select().from(dispatchDocuments).where(eq(dispatchDocuments.verifyToken, token));
      if (!doc) return res.status(404).json({ message: "Not found" });
      const recipients = await recipientsWithNames([doc.id]);
      res.json({
        outwardNumber: doc.outwardNumber,
        issuedOn: doc.createdAt,
        letterDate: doc.dispatchDate,
        issuedBy: doc.senderName,
        documentType: doc.documentType,
        subject: doc.isConfidential ? "Confidential" : doc.subject,
        recipients: doc.isConfidential ? [] : recipients.map((r) => r.name),
        recipientCount: recipients.length,
        fileSha256: doc.fileSha256,
        status: doc.cancelledAt ? "withdrawn" : "valid",
        withdrawnOn: doc.cancelledAt,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Could not verify" });
    }
  });

  // ─── Sender's view of physical dak other offices received from it ───────
  app.get("/api/dispatch/acknowledgements/:departmentId", async (req: Request, res: Response) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const rows = await db
        .select({ r: dispatchRecipients, d: dispatchDocuments })
        .from(dispatchDocuments)
        .innerJoin(dispatchRecipients, eq(dispatchRecipients.dispatchId, dispatchDocuments.id))
        .where(eq(dispatchDocuments.senderDepartmentRef, departmentId))
        .orderBy(desc(dispatchDocuments.createdAt))
        .limit(500);
      const names = await recipientsWithNames(rows.map((x) => x.d.id));
      res.json(rows.map(({ r, d }) => ({
        id: d.id,
        receivedBy: names.find((n) => n.id === r.id)?.name || "Unknown",
        inwardNumber: r.inwardNumber || d.inwardNumber,
        receivedAt: r.receivedAt,
        letterNumber: d.dispatchNumber,
        letterDate: d.dispatchDate,
        subject: d.isConfidential ? "CONFIDENTIAL" : d.subject,
        status: r.status,
        cancelled: !!d.cancelledAt,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── MIS report of one department ───────────────────────────────────────
  app.get("/api/dispatch/reports/:departmentId", async (req: Request, res: Response) => {
    try {
      const d = Number(req.params.departmentId);
      const { from, to } = range(req);
      const open = sql`r.received_at IS NOT NULL AND r.status NOT IN ${CLOSED_SQL}`;

      const byStaff = (await db.execute(sql`
        SELECT s.id, s.name, s.role, s.is_active AS "isActive",
          COUNT(r.id) FILTER (WHERE ${open})::int AS pending,
          COUNT(r.id) FILTER (WHERE ${open} AND r.action_due_date < CURRENT_DATE)::int AS overdue,
          COUNT(r.id) FILTER (WHERE ${open} AND r.acknowledged_at IS NULL)::int AS "notAcknowledged",
          COUNT(r.id) FILTER (WHERE r.status = 'disposed' AND r.disposed_at::date BETWEEN ${from}::date AND ${to}::date)::int AS disposed
        FROM department_staff s
        LEFT JOIN dispatch_recipients r ON r.department_id = s.department_id AND s.id = ANY(COALESCE(r.marked_staff_ids, '{}'))
        WHERE s.department_id = ${d}
        GROUP BY s.id ORDER BY s.is_active DESC, s.name`)).rows;

      const unassigned = (await db.execute(sql`
        SELECT COALESCE(NULLIF(r.marked_to_staff, ''), 'Not marked to anyone') AS name,
          COUNT(*)::int AS pending,
          COUNT(*) FILTER (WHERE r.action_due_date < CURRENT_DATE)::int AS overdue
        FROM dispatch_recipients r
        WHERE r.department_id = ${d} AND ${open} AND (r.marked_staff_ids IS NULL OR cardinality(r.marked_staff_ids) = 0)
        GROUP BY 1 ORDER BY 2 DESC`)).rows;

      const age = (await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE CURRENT_DATE - r.received_at::date <= 7)::int AS "d0_7",
          COUNT(*) FILTER (WHERE CURRENT_DATE - r.received_at::date BETWEEN 8 AND 15)::int AS "d8_15",
          COUNT(*) FILTER (WHERE CURRENT_DATE - r.received_at::date BETWEEN 16 AND 30)::int AS "d16_30",
          COUNT(*) FILTER (WHERE CURRENT_DATE - r.received_at::date > 30)::int AS "d30plus",
          COUNT(*) FILTER (WHERE r.action_due_date < CURRENT_DATE)::int AS overdue,
          COUNT(*)::int AS total
        FROM dispatch_recipients r WHERE r.department_id = ${d} AND ${open}`)).rows[0];

      const monthly = (await db.execute(sql`
        WITH months AS (
          SELECT to_char(m, 'YYYY-MM') AS month FROM generate_series(date_trunc('month', ${from}::date), date_trunc('month', ${to}::date), interval '1 month') m
        )
        SELECT m.month,
          (SELECT COUNT(*) FROM dispatch_recipients r WHERE r.department_id = ${d} AND to_char(r.received_at, 'YYYY-MM') = m.month)::int AS received,
          (SELECT COUNT(*) FROM dispatch_recipients r WHERE r.department_id = ${d} AND r.status = 'disposed' AND to_char(r.disposed_at, 'YYYY-MM') = m.month)::int AS disposed,
          (SELECT COUNT(*) FROM dispatch_documents x WHERE x.sender_department_id = ${d} AND x.cancelled_at IS NULL AND to_char(x.created_at, 'YYYY-MM') = m.month)::int AS dispatched
        FROM months m ORDER BY m.month`)).rows;

      const byType = (await db.execute(sql`
        SELECT x.document_type AS type, COUNT(*)::int AS count
        FROM dispatch_recipients r JOIN dispatch_documents x ON x.id = r.dispatch_id
        WHERE r.department_id = ${d} AND r.received_at::date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`)).rows;

      const disposal = (await db.execute(sql`
        SELECT COUNT(*)::int AS count,
          ROUND(AVG(EXTRACT(EPOCH FROM (r.disposed_at - r.received_at)) / 86400)::numeric, 1) AS "avgDays",
          COUNT(*) FILTER (WHERE r.action_due_date IS NOT NULL AND r.disposed_at::date <= r.action_due_date)::int AS "inTime"
        FROM dispatch_recipients r
        WHERE r.department_id = ${d} AND r.status = 'disposed' AND r.disposed_at::date BETWEEN ${from}::date AND ${to}::date`)).rows[0];

      const byDisposal = (await db.execute(sql`
        SELECT r.disposal_type AS type, COUNT(*)::int AS count FROM dispatch_recipients r
        WHERE r.department_id = ${d} AND r.status = 'disposed' AND r.disposed_at::date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1 ORDER BY 2 DESC`)).rows;

      res.json({ from, to, byStaff, unassigned, age, monthly, byType, disposal, byDisposal });
    } catch (error: any) {
      console.error("[Dak] report error:", error);
      res.status(500).json({ message: "Could not build the report" });
    }
  });

  // ─── Printable registers (inward / outward / peon book) ─────────────────
  app.get("/api/dispatch/registers/:departmentId", async (req: Request, res: Response) => {
    try {
      const d = Number(req.params.departmentId);
      const { from, to } = range(req);
      const kind = String(req.query.kind || "inward");
      if (kind === "inward") {
        const rows = (await db.execute(sql`
          SELECT COALESCE(r.inward_number, x.inward_number) AS "rNo", to_char(r.received_at, 'DD-MM-YYYY') AS "receivedOn",
            x.sender_name AS "from", x.dispatch_number AS "letterNo", to_char(x.dispatch_date, 'DD-MM-YYYY') AS "letterDate",
            CASE WHEN x.is_confidential THEN COALESCE(x.ai_extracted_data->>'_actualSubject', 'CONFIDENTIAL') ELSE x.subject END AS subject,
            x.document_type AS type, r.marked_to_staff AS "markedTo", r.status, r.disposal_type AS disposal, r.file_number AS "fileNo",
            to_char(r.disposed_at, 'DD-MM-YYYY') AS "disposedOn", (x.cancelled_at IS NOT NULL) AS cancelled
          FROM dispatch_recipients r JOIN dispatch_documents x ON x.id = r.dispatch_id
          WHERE r.department_id = ${d} AND r.received_at IS NOT NULL AND r.received_at::date BETWEEN ${from}::date AND ${to}::date
          ORDER BY r.received_at, r.id`)).rows;
        return res.json({ kind, from, to, rows });
      }
      const modeFilter = kind === "peon" ? sql`AND x.dispatch_mode IN ('by_hand', 'peon_book')` : sql``;
      const rows = (await db.execute(sql`
        SELECT x.id, x.outward_number AS "outwardNo", to_char(x.created_at, 'DD-MM-YYYY') AS "date",
          CASE WHEN x.is_confidential THEN COALESCE(x.ai_extracted_data->>'_actualSubject', 'CONFIDENTIAL') ELSE x.subject END AS subject,
          x.document_type AS type, x.dispatch_mode AS mode, x.postal_tracking_no AS "trackingNo", x.postage_amount AS postage,
          (x.cancelled_at IS NOT NULL) AS cancelled,
          COALESCE((SELECT string_agg(COALESCE(dp.name, ec.name, '?'), ', ' ORDER BY rr.id)
            FROM dispatch_recipients rr LEFT JOIN departments dp ON dp.id = rr.department_id
            LEFT JOIN external_contacts ec ON ec.id = rr.external_contact_id WHERE rr.dispatch_id = x.id), '') AS "to"
        FROM dispatch_documents x
        WHERE x.sender_department_id = ${d} AND x.created_at::date BETWEEN ${from}::date AND ${to}::date ${modeFilter}
        ORDER BY x.created_at, x.id`)).rows.map((r: any) => ({ ...r, modeLabel: DISPATCH_MODES[r.mode] || "Electronic only" }));
      res.json({ kind, from, to, rows });
    } catch (error: any) {
      console.error("[Dak] register error:", error);
      res.status(500).json({ message: "Could not load the register" });
    }
  });

  // ─── Admin: university-wide dak overview ────────────────────────────────
  app.get("/api/admin/dak/overview", async (req: Request, res: Response) => {
    try {
      const { from, to } = range(req);
      const rows = (await db.execute(sql`
        SELECT dp.id, dp.name,
          COUNT(r.id) FILTER (WHERE r.received_at::date BETWEEN ${from}::date AND ${to}::date)::int AS received,
          COUNT(r.id) FILTER (WHERE r.status = 'dispatched')::int AS unreceived,
          COUNT(r.id) FILTER (WHERE r.received_at IS NOT NULL AND r.status NOT IN ${CLOSED_SQL})::int AS pending,
          COUNT(r.id) FILTER (WHERE r.received_at IS NOT NULL AND r.status NOT IN ${CLOSED_SQL} AND r.action_due_date < CURRENT_DATE)::int AS overdue,
          COUNT(r.id) FILTER (WHERE r.status = 'disposed' AND r.disposed_at::date BETWEEN ${from}::date AND ${to}::date)::int AS disposed,
          (SELECT COUNT(*) FROM dispatch_documents x WHERE x.sender_department_id = dp.id AND x.cancelled_at IS NULL
             AND x.created_at::date BETWEEN ${from}::date AND ${to}::date)::int AS dispatched
        FROM departments dp LEFT JOIN dispatch_recipients r ON r.department_id = dp.id AND r.recipient_type = 'department'
        GROUP BY dp.id
        HAVING COUNT(r.id) > 0 OR EXISTS (SELECT 1 FROM dispatch_documents x WHERE x.sender_department_id = dp.id)
        ORDER BY overdue DESC, pending DESC, dp.name`)).rows;
      res.json({ from, to, rows });
    } catch (error: any) {
      console.error("[Dak] admin overview error:", error);
      res.status(500).json({ message: "Could not load the overview" });
    }
  });

  // ─── Admin: find any dak (number, subject, sender, scanned text) ─────────
  app.get("/api/admin/dak/search", async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || "").trim();
      if (q.length < 2) return res.json([]);
      const like = `%${q}%`;
      const docs = await db.select().from(dispatchDocuments).where(sql`
        ${dispatchDocuments.outwardNumber} ILIKE ${like} OR ${dispatchDocuments.inwardNumber} ILIKE ${like}
        OR ${dispatchDocuments.dispatchNumber} ILIKE ${like} OR ${dispatchDocuments.senderName} ILIKE ${like}
        OR (${dispatchDocuments.isConfidential} = false AND (${dispatchDocuments.subject} ILIKE ${like} OR ${dispatchDocuments.ocrText} ILIKE ${like}))
        OR EXISTS (SELECT 1 FROM dispatch_recipients r WHERE r.dispatch_id = ${dispatchDocuments.id} AND r.inward_number ILIKE ${like})`)
        .orderBy(desc(dispatchDocuments.createdAt)).limit(50);
      const recipients = await recipientsWithNames(docs.map((x) => x.id));
      res.json(docs.map((x) => ({
        id: x.id,
        outwardNumber: x.outwardNumber,
        inwardNumber: x.inwardNumber,
        senderName: x.senderName,
        subject: x.isConfidential ? "CONFIDENTIAL" : x.subject,
        documentType: x.documentType,
        createdAt: x.createdAt,
        cancelled: !!x.cancelledAt,
        recipients: recipients.filter((r) => r.dispatchId === x.id).map((r) => ({ name: r.name, status: r.status, inwardNumber: r.inwardNumber })),
      })));
    } catch (error: any) {
      console.error("[Dak] admin search error:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // ─── Admin: send the overdue reminders now ──────────────────────────────
  app.post("/api/admin/dak/run-reminders", async (_req: Request, res: Response) => {
    try {
      res.json(await runDakReminders());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}

// ─── Daily reminders: overdue / due-today dak ─────────────────────────────
// One e-mail per department (escalated items first) and one per staff login with
// dak marked to them. A dak is reminded at most once in 20 hours.
export async function runDakReminders(): Promise<{ departments: number; staff: number; items: number; reminded?: number }> {
  const rows = (await db.execute(sql`
    SELECT r.id, r.department_id AS "deptId", r.marked_staff_ids AS "staffIds", r.marked_to_staff AS "markedTo",
      r.action_due_date::text AS due, (CURRENT_DATE - r.action_due_date)::int AS "daysOver",
      COALESCE(r.inward_number, x.inward_number) AS "rNo", x.sender_name AS "from", x.priority,
      CASE WHEN x.is_confidential THEN 'CONFIDENTIAL' ELSE x.subject END AS subject,
      dp.name AS "deptName"
    FROM dispatch_recipients r
    JOIN dispatch_documents x ON x.id = r.dispatch_id
    JOIN departments dp ON dp.id = r.department_id
    WHERE r.received_at IS NOT NULL AND r.status NOT IN ${CLOSED_SQL}
      AND r.action_due_date IS NOT NULL AND r.action_due_date <= CURRENT_DATE
      AND (r.reminder_sent_at IS NULL OR r.reminder_sent_at < NOW() - INTERVAL '20 hours')
    ORDER BY "daysOver" DESC`)).rows as any[];
  if (rows.length === 0) return { departments: 0, staff: 0, items: 0, reminded: 0 };

  const table = (items: any[]) => `
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f3f4f6"><th align="left" style="padding:6px;border:1px solid #e5e7eb">R.No.</th>
      <th align="left" style="padding:6px;border:1px solid #e5e7eb">From</th><th align="left" style="padding:6px;border:1px solid #e5e7eb">Subject</th>
      <th align="left" style="padding:6px;border:1px solid #e5e7eb">With</th><th align="left" style="padding:6px;border:1px solid #e5e7eb">Action by</th></tr>
      ${items.map((i) => `<tr>
        <td style="padding:6px;border:1px solid #e5e7eb">${escapeHtml(i.rNo)}</td>
        <td style="padding:6px;border:1px solid #e5e7eb">${escapeHtml(i.from)}</td>
        <td style="padding:6px;border:1px solid #e5e7eb">${escapeHtml(i.subject)}</td>
        <td style="padding:6px;border:1px solid #e5e7eb">${escapeHtml(i.markedTo || "-")}</td>
        <td style="padding:6px;border:1px solid #e5e7eb;color:${i.daysOver > 0 ? "#b91c1c" : "#92400e"}">${escapeHtml(i.due)}${i.daysOver > 0 ? ` (${i.daysOver} day(s) late)` : " (today)"}</td>
      </tr>`).join("")}
    </table>`;
  const link = `${publicBaseUrl()}/dashboard/dispatch`;
  const reminded = new Set<number>();
  const delivered = (s: { sent: number; stubbed: number }) => s.sent + s.stubbed > 0;

  // Departments (escalation: more than 3 days late listed first)
  const byDept = new Map<number, any[]>();
  for (const r of rows) byDept.set(r.deptId, [...(byDept.get(r.deptId) || []), r]);
  let deptCount = 0;
  for (const items of Array.from(byDept.values())) {
    const escalated = items.filter((i) => i.daysOver > 3);
    const html = `<div style="font-family:Arial,sans-serif;max-width:760px">
      <h2 style="color:#b91c1c">Dak pending action — ${escapeHtml(items[0].deptName)}</h2>
      ${escalated.length ? `<p><strong>Escalated (more than 3 days late): ${escalated.length}</strong></p>${table(escalated)}<br/>` : ""}
      <p>${items.length} dak item(s) are due today or overdue.</p>${table(items.filter((i) => i.daysOver <= 3))}
      <p><a href="${link}">Open Dak Receive / Dispatch</a></p>
      <p style="color:#6b7280;font-size:12px">Automatic daily reminder of the AMU Dak system.</p></div>`;
    const result = await notify("dak.overdue", [{ kind: "department", departmentId: items[0].deptId }], {
      title: `[DAK] ${items.length} item(s) pending action${escalated.length ? ` — ${escalated.length} escalated` : ""}`,
      text: `${items.length} dak item(s) due today or overdue${escalated.length ? `, ${escalated.length} more than 3 days late` : ""}. Oldest: ${items[0].rNo} (${items[0].due}).`,
      html,
      link: "/dashboard/dispatch",
    });
    if (delivered(result)) { deptCount++; items.forEach((i) => reminded.add(Number(i.id))); }
  }

  // Staff logins with dak marked to them
  const staffIds = Array.from(new Set(rows.flatMap((r) => (r.staffIds || []).map(Number))));
  let staffCount = 0;
  if (staffIds.length) {
    const staff = (await db.execute(sql`SELECT id, name FROM department_staff WHERE is_active = true
      AND id IN (${sql.join(staffIds.map((i) => sql`${i}`), sql`, `)})`)).rows as any[];
    for (const s of staff) {
      const items = rows.filter((r) => (r.staffIds || []).map(Number).includes(Number(s.id)));
      const html = `<div style="font-family:Arial,sans-serif;max-width:760px">
        <h2>Dak marked to you, ${escapeHtml(s.name)}</h2>
        <p>${items.length} item(s) are due today or overdue.</p>${table(items)}
        <p><a href="${link}">Open My Dak</a></p></div>`;
      const result = await notify("dak.overdue", [{ kind: "staff", staffId: Number(s.id) }], {
        title: `[DAK] ${items.length} item(s) marked to you need action`,
        text: `${items.length} dak item(s) marked to you are due today or overdue. Oldest: ${items[0].rNo} (${items[0].due}).`,
        html,
        link: "/dashboard/dispatch",
      });
      if (delivered(result)) { staffCount++; items.forEach((i) => reminded.add(Number(i.id))); }
    }
  }

  // Only items somebody was actually told about; otherwise tried again next run
  if (reminded.size) {
    await db.execute(sql`UPDATE dispatch_recipients SET reminder_sent_at = NOW()
      WHERE id IN (${sql.join(Array.from(reminded).map((id) => sql`${id}`), sql`, `)})`);
  }
  console.log(`[Dak] reminders: ${rows.length} item(s), ${deptCount} department(s), ${staffCount} staff notified`);
  return { departments: deptCount, staff: staffCount, items: rows.length, reminded: reminded.size };
}
