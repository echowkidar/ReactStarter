// E-Files (paperless file work) of a department.
// ─────────────────────────────────────────────────────────────────────────────
// A file has a number, subject and record category (A/B/C/D). Its entries are:
//   note          – a para on the noting side (numbered)
//   movement      – the file is sent to a staff member ("put up")
//   correspondence– a dak (received or issued) placed on the file
//   draft         – a Draft for Approval (letter); approved → issued as outward dak
//   approval / returned / issued / opened / closed / reopened / record – history
// Record room: closed files keep their retention date (C = 10 years, D = 5 years,
// A/B = permanent); when due they can be archived, kept longer or weeded out.
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { who, linkDakToFile, createOutwardDispatch, buildLetterPdf, DakError, DISPATCH_MODES, type Actor } from "./dakCore";
import { notify, supervisorsOf } from "./notify";

const CATEGORY_YEARS: Record<string, number | null> = { A: null, B: null, C: 10, D: 5 };
const iso = (col: string) => sql.raw(`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

async function loadFile(departmentId: number, fileId: number) {
  return (await db.execute(sql`SELECT * FROM efiles WHERE id = ${fileId} AND department_id = ${departmentId}`)).rows[0] as any;
}

async function addEntry(fileId: number, actor: Actor, kind: string, fields: {
  body?: string | null; paraNo?: number | null; dispatchId?: number | null; toStaffId?: number | null; toName?: string | null;
  draftStatus?: string | null; draftMeta?: any;
} = {}) {
  const row = (await db.execute(sql`
    INSERT INTO efile_entries (efile_id, kind, para_no, body, dispatch_id, to_staff_id, to_name, by_staff_id, by_name, draft_status, draft_meta)
    VALUES (${fileId}, ${kind}, ${fields.paraNo ?? null}, ${fields.body ?? null}, ${fields.dispatchId ?? null},
            ${fields.toStaffId ?? null}, ${fields.toName ?? null}, ${actor.staffId}, ${actor.label},
            ${fields.draftStatus ?? null}, ${fields.draftMeta ? JSON.stringify(fields.draftMeta) : null}::jsonb)
    RETURNING id`)).rows[0] as any;
  return Number(row.id);
}

function fail(res: Response, error: any, what: string) {
  if (error instanceof DakError) return res.status(error.status).json({ message: error.message });
  console.error(`[E-File] ${what}:`, error);
  return res.status(500).json({ message: `Could not ${what}` });
}

export function registerEfileRoutes(app: Express) {
  const base = "/api/departments/:departmentId/efiles";

  // ─── File register ─────────────────────────────────────────────────────
  app.get(base, async (req: Request, res: Response) => {
    try {
      const d = Number(req.params.departmentId);
      const status = String(req.query.status || "open");
      const q = String(req.query.q || "").trim();
      const rows = (await db.execute(sql`
        SELECT f.id, f.file_number AS "fileNumber", f.subject, f.category, f.status,
          f.current_holder_staff_id AS "holderStaffId", f.current_holder_name AS "holderName", f.created_by AS "createdBy",
          f.retention_until::text AS "retentionUntil", f.record_remarks AS "recordRemarks",
          ${iso("f.created_at")} AS "createdAt", ${iso("f.closed_at")} AS "closedAt",
          (SELECT COUNT(*) FROM efile_entries e WHERE e.efile_id = f.id AND e.kind = 'note')::int AS notes,
          (SELECT COUNT(*) FROM efile_entries e WHERE e.efile_id = f.id AND e.kind = 'correspondence')::int AS papers,
          (SELECT COUNT(*) FROM efile_entries e WHERE e.efile_id = f.id AND e.kind = 'draft' AND e.draft_status IN ('pending', 'approved'))::int AS "openDrafts",
          (SELECT to_char(MAX(e.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM efile_entries e WHERE e.efile_id = f.id) AS "lastActivity"
        FROM efiles f
        WHERE f.department_id = ${d}
          ${status === "due" ? sql`AND f.status IN ('closed', 'archived') AND f.retention_until IS NOT NULL AND f.retention_until <= CURRENT_DATE`
            : status !== "all" ? sql`AND f.status = ${status}` : sql``}
          ${q ? sql`AND (f.file_number ILIKE ${`%${q}%`} OR f.subject ILIKE ${`%${q}%`})` : sql``}
        ORDER BY f.created_at DESC`)).rows;
      res.json(rows);
    } catch (error) { fail(res, error, "load the files"); }
  });

  app.post(base, async (req: Request, res: Response) => {
    try {
      const d = Number(req.params.departmentId);
      const actor = await who(req, d);
      const fileNumber = String(req.body.fileNumber || "").trim();
      const subject = String(req.body.subject || "").trim();
      const category = String(req.body.category || "C").toUpperCase();
      if (!fileNumber || !subject) return res.status(400).json({ message: "File number and subject are required" });
      if (!(category in CATEGORY_YEARS)) return res.status(400).json({ message: "Category must be A, B, C or D" });
      const exists = (await db.execute(sql`SELECT 1 FROM efiles WHERE department_id = ${d} AND LOWER(file_number) = LOWER(${fileNumber})`)).rows.length > 0;
      if (exists) return res.status(409).json({ message: `File ${fileNumber} already exists` });
      const row = (await db.execute(sql`
        INSERT INTO efiles (department_id, file_number, subject, category, created_by, current_holder_staff_id, current_holder_name)
        VALUES (${d}, ${fileNumber}, ${subject}, ${category}, ${actor.label}, ${actor.staffId}, ${actor.staffName || actor.departmentName})
        RETURNING id`)).rows[0] as any;
      await addEntry(Number(row.id), actor, "opened", { body: `File opened: ${subject} (Category ${category})` });
      res.status(201).json({ id: Number(row.id) });
    } catch (error) { fail(res, error, "open the file"); }
  });

  // ─── One file with its noting and correspondence ───────────────────────
  app.get(`${base}/:fileId`, async (req: Request, res: Response) => {
    try {
      const d = Number(req.params.departmentId);
      const file = await loadFile(d, Number(req.params.fileId));
      if (!file) return res.status(404).json({ message: "File not found" });
      const entries = (await db.execute(sql`
        SELECT e.id, e.kind, e.para_no AS "paraNo", e.body, e.dispatch_id AS "dispatchId", e.to_staff_id AS "toStaffId",
          e.to_name AS "toName", e.by_staff_id AS "byStaffId", e.by_name AS "byName", e.draft_status AS "draftStatus",
          e.draft_meta AS "draftMeta", ${iso("e.created_at")} AS "createdAt",
          x.subject AS "dSubject", x.is_confidential AS "dConfidential", x.ai_extracted_data->>'_actualSubject' AS "dActual",
          x.outward_number AS "dOutwardNo", x.sender_department_id AS "dSenderId", x.sender_name AS "dSender",
          x.file_url AS "dFileUrl", x.file_type AS "dFileType", x.document_type AS "dType",
          (SELECT COALESCE(r.inward_number, x.inward_number) FROM dispatch_recipients r
             WHERE r.dispatch_id = x.id AND r.department_id = ${d} ORDER BY r.id DESC LIMIT 1) AS "dInwardNo"
        FROM efile_entries e LEFT JOIN dispatch_documents x ON x.id = e.dispatch_id
        WHERE e.efile_id = ${file.id} ORDER BY e.id`)).rows.map((e: any) => ({
          ...e,
          dak: e.dispatchId ? {
            id: e.dispatchId,
            subject: e.dConfidential ? (e.dActual || "CONFIDENTIAL") : e.dSubject,
            outwardNumber: e.dSenderId === d ? e.dOutwardNo : null,
            inwardNumber: e.dInwardNo,
            sender: e.dSender,
            fileUrl: e.dFileUrl,
            fileType: e.dFileType,
            documentType: e.dType,
          } : null,
        }));
      res.json({
        id: file.id, fileNumber: file.file_number, subject: file.subject, category: file.category, status: file.status,
        holderStaffId: file.current_holder_staff_id, holderName: file.current_holder_name, createdBy: file.created_by,
        retentionUntil: file.retention_until ? String(file.retention_until).slice(0, 10) : null, recordRemarks: file.record_remarks,
        entries: entries.map(({ dSubject, dConfidential, dActual, dOutwardNo, dSenderId, dSender, dFileUrl, dFileType, dType, dInwardNo, ...e }: any) => e),
      });
    } catch (error) { fail(res, error, "load the file"); }
  });

  /** Common checks for file actions; returns [actor, file] or sends the error */
  async function openFile(req: Request, res: Response, needOpen = true): Promise<[Actor, any] | null> {
    const d = Number(req.params.departmentId);
    const actor = await who(req, d);
    const file = await loadFile(d, Number(req.params.fileId));
    if (!file) { res.status(404).json({ message: "File not found" }); return null; }
    if (needOpen && file.status !== "open") { res.status(400).json({ message: "The file is closed. Reopen it first." }); return null; }
    return [actor, file];
  }

  // ─── Noting ────────────────────────────────────────────────────────────
  app.post(`${base}/:fileId/notes`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      const body = String(req.body.body || "").trim();
      if (!body) return res.status(400).json({ message: "The note is empty" });
      const next = (await db.execute(sql`SELECT COALESCE(MAX(para_no), 0) + 1 AS n FROM efile_entries WHERE efile_id = ${file.id} AND kind = 'note'`)).rows[0] as any;
      await addEntry(file.id, actor, "note", { body, paraNo: Number(next.n) });
      res.status(201).json({ success: true, paraNo: Number(next.n) });
    } catch (error) { fail(res, error, "add the note"); }
  });

  // ─── Movement: send the file to a staff member (put up) ────────────────
  app.post(`${base}/:fileId/move`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      const toStaffId = Number(req.body.toStaffId);
      const staff = (await db.execute(sql`SELECT id, name, role FROM department_staff
        WHERE id = ${toStaffId} AND department_id = ${file.department_id} AND is_active = true`)).rows[0] as any;
      if (!staff) return res.status(400).json({ message: "Choose an active staff login of your department" });
      await db.execute(sql`UPDATE efiles SET current_holder_staff_id = ${staff.id}, current_holder_name = ${staff.name} WHERE id = ${file.id}`);
      await addEntry(file.id, actor, "movement", { toStaffId: staff.id, toName: staff.name, body: String(req.body.remarks || "").trim() || null });
      void notify("efile.moved", [{ kind: "staff", staffId: Number(staff.id) }], {
        title: `File ${file.file_number} sent to you`,
        text: `${file.subject} — from ${actor.label}${String(req.body.remarks || "").trim() ? `: ${String(req.body.remarks).trim()}` : ""}`,
        link: "/dashboard/efiles",
      });
      res.json({ success: true });
    } catch (error) { fail(res, error, "move the file"); }
  });

  // ─── Place a dak on the file (by R.No. or Outward No.) ─────────────────
  app.post(`${base}/:fileId/attach`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      const number = String(req.body.number || "").trim();
      if (!number) return res.status(400).json({ message: "Give the R.No. or Outward No." });
      const d = Number(file.department_id);
      const found = (await db.execute(sql`
        SELECT r.dispatch_id AS id FROM dispatch_recipients r JOIN dispatch_documents x ON x.id = r.dispatch_id
          WHERE r.department_id = ${d} AND LOWER(COALESCE(r.inward_number, x.inward_number)) = LOWER(${number})
        UNION ALL
        SELECT x.id FROM dispatch_documents x WHERE x.sender_department_id = ${d} AND LOWER(x.outward_number) = LOWER(${number})
        LIMIT 1`)).rows[0] as any;
      if (!found) return res.status(404).json({ message: `No dak ${number} in your inbox or outbox` });
      await linkDakToFile(file.id, Number(found.id), actor, `Dak ${number} placed on file`);
      res.json({ success: true });
    } catch (error) { fail(res, error, "place the dak on the file"); }
  });

  // ─── Draft for Approval (DFA) ──────────────────────────────────────────
  app.post(`${base}/:fileId/drafts`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      const subject = String(req.body.subject || "").trim();
      const body = String(req.body.body || "").trim();
      const recipients = Array.isArray(req.body.recipients) ? req.body.recipients
        .filter((r: any) => ["department", "external", "group"].includes(r?.type) && Number.isFinite(Number(r?.id)))
        .map((r: any) => ({ type: r.type, id: Number(r.id), name: String(r.name || "") })) : [];
      if (!subject || !body) return res.status(400).json({ message: "Subject and text of the draft are required" });
      if (recipients.length === 0) return res.status(400).json({ message: "Choose at least one addressee" });
      const meta = {
        subject, recipients,
        documentType: String(req.body.documentType || "Letter"),
        inReplyToRecipientId: req.body.inReplyToRecipientId ? Number(req.body.inReplyToRecipientId) : null,
        version: 1,
      };
      const id = await addEntry(file.id, actor, "draft", { body, draftStatus: "pending", draftMeta: meta });
      void notify("efile.draft_put_up", await supervisorsOf(Number(file.department_id)), {
        title: `Draft for approval on file ${file.file_number}`,
        text: `${subject} — put up by ${actor.label}`,
        link: "/dashboard/efiles",
      });
      res.status(201).json({ id });
    } catch (error) { fail(res, error, "save the draft"); }
  });

  // Edit a draft that is pending or was returned (new version)
  app.patch(`${base}/:fileId/drafts/:entryId`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      const draft = (await db.execute(sql`SELECT * FROM efile_entries WHERE id = ${Number(req.params.entryId)} AND efile_id = ${file.id} AND kind = 'draft'`)).rows[0] as any;
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (!["pending", "returned"].includes(draft.draft_status)) return res.status(400).json({ message: "Only a pending or returned draft can be changed" });
      const meta = { ...(draft.draft_meta || {}) };
      if (req.body.subject !== undefined) meta.subject = String(req.body.subject).trim();
      if (Array.isArray(req.body.recipients)) meta.recipients = req.body.recipients;
      meta.version = Number(meta.version || 1) + 1;
      const body = req.body.body !== undefined ? String(req.body.body).trim() : draft.body;
      if (!meta.subject || !body) return res.status(400).json({ message: "Subject and text are required" });
      await db.execute(sql`UPDATE efile_entries SET body = ${body}, draft_meta = ${JSON.stringify(meta)}::jsonb, draft_status = 'pending' WHERE id = ${draft.id}`);
      await addEntry(file.id, actor, "note", { body: `Draft revised (version ${meta.version}) and put up again.`, paraNo: null });
      res.json({ success: true });
    } catch (error) { fail(res, error, "change the draft"); }
  });

  app.post(`${base}/:fileId/drafts/:entryId/decision`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      if (!actor.isSupervisor) return res.status(403).json({ message: "Only the HOD, Section Officer or department admin can approve drafts" });
      const decision = String(req.body.decision || "");
      if (!["approve", "return"].includes(decision)) return res.status(400).json({ message: "Approve or return?" });
      const draft = (await db.execute(sql`SELECT * FROM efile_entries WHERE id = ${Number(req.params.entryId)} AND efile_id = ${file.id} AND kind = 'draft'`)).rows[0] as any;
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (draft.draft_status !== "pending") return res.status(400).json({ message: "This draft is not waiting for a decision" });
      const remarks = String(req.body.remarks || "").trim();
      if (decision === "return" && !remarks) return res.status(400).json({ message: "Say what should be changed" });
      const meta = { ...(draft.draft_meta || {}), ...(decision === "approve" ? { approvedBy: actor.label, signatory: actor.staffName ? `${actor.staffName}\n${actor.departmentName}` : actor.departmentName } : {}) };
      await db.execute(sql`UPDATE efile_entries SET draft_status = ${decision === "approve" ? "approved" : "returned"}, draft_meta = ${JSON.stringify(meta)}::jsonb WHERE id = ${draft.id}`);
      await addEntry(file.id, actor, decision === "approve" ? "approval" : "returned", {
        body: `${decision === "approve" ? "Draft approved" : "Draft returned"}: ${meta.subject}${remarks ? `. ${remarks}` : ""}`,
      });
      void notify("efile.draft_decided", draft.by_staff_id
        ? [{ kind: "staff", staffId: Number(draft.by_staff_id) }]
        : [{ kind: "department", departmentId: Number(file.department_id) }], {
        title: `Draft ${decision === "approve" ? "approved" : "returned"} — file ${file.file_number}`,
        text: `${meta.subject}${remarks ? ` — ${remarks}` : ""} (${actor.label})`,
        link: "/dashboard/efiles",
      });
      res.json({ success: true });
    } catch (error) { fail(res, error, "record the decision"); }
  });

  // Issue an approved draft: letter PDF (with outward no. + QR) → outward dispatch
  app.post(`${base}/:fileId/drafts/:entryId/dispatch`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      const draft = (await db.execute(sql`SELECT * FROM efile_entries WHERE id = ${Number(req.params.entryId)} AND efile_id = ${file.id} AND kind = 'draft'`)).rows[0] as any;
      if (!draft) return res.status(404).json({ message: "Draft not found" });
      if (draft.draft_status !== "approved") return res.status(400).json({ message: "Only an approved draft can be issued" });
      const meta = draft.draft_meta || {};
      const d = Number(file.department_id);
      const mode = String(req.body.dispatchMode || "electronic");
      if (!(mode in DISPATCH_MODES)) return res.status(400).json({ message: "Invalid dispatch mode" });

      const result = await createOutwardDispatch({
        actor,
        senderDepartmentId: d,
        senderName: actor.departmentName,
        documentType: meta.documentType || "Letter",
        subject: meta.subject,
        isConfidential: !!req.body.isConfidential,
        priority: ["urgent", "immediate"].includes(req.body.priority) ? req.body.priority : "normal",
        recipients: (meta.recipients || []).map((r: any) => ({ type: r.type, id: Number(r.id) })),
        sendEmail: !!req.body.sendEmail,
        dispatchMode: mode,
        postalTrackingNo: req.body.postalTrackingNo || null,
        postageAmount: req.body.postageAmount ?? null,
        inReplyToRecipientId: meta.inReplyToRecipientId || null,
        efileId: file.id,
        buildFile: (outwardNumber) => buildLetterPdf({
          departmentName: actor.departmentName,
          outwardNumber,
          to: (meta.recipients || []).map((r: any) => r.name).filter(Boolean),
          subject: meta.subject,
          body: draft.body,
          signatory: meta.signatory || actor.departmentName,
        }),
      });
      await db.execute(sql`UPDATE efile_entries SET draft_status = 'issued',
        draft_meta = ${JSON.stringify({ ...meta, dispatchId: result.dispatch.id, outwardNumber: result.outwardNumber })}::jsonb WHERE id = ${draft.id}`);
      await addEntry(file.id, actor, "issued", { body: `Letter issued vide Outward No. ${result.outwardNumber}`, dispatchId: result.dispatch.id });
      res.json({ success: true, outwardNumber: result.outwardNumber, dispatchId: result.dispatch.id });
    } catch (error) { fail(res, error, "issue the letter"); }
  });

  // ─── Close / reopen ────────────────────────────────────────────────────
  app.post(`${base}/:fileId/close`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res); if (!ok) return;
      const [actor, file] = ok;
      if (!actor.isSupervisor) return res.status(403).json({ message: "Only the HOD, Section Officer or department admin can close a file" });
      const pending = (await db.execute(sql`SELECT 1 FROM efile_entries WHERE efile_id = ${file.id} AND kind = 'draft' AND draft_status IN ('pending', 'approved') LIMIT 1`)).rows.length > 0;
      if (pending) return res.status(400).json({ message: "A draft on this file is still pending / not issued" });
      const years = CATEGORY_YEARS[file.category] ?? null;
      await db.execute(sql`UPDATE efiles SET status = 'closed', closed_at = NOW(),
        retention_until = ${years === null ? null : sql`(CURRENT_DATE + make_interval(years => ${years}))::date`} WHERE id = ${file.id}`);
      await addEntry(file.id, actor, "closed", {
        body: `File closed${String(req.body.remarks || "").trim() ? `: ${String(req.body.remarks).trim()}` : ""}. ${years === null ? "Permanent record (category " + file.category + ")." : `Keep until ${years} years (category ${file.category}).`}`,
      });
      res.json({ success: true });
    } catch (error) { fail(res, error, "close the file"); }
  });

  app.post(`${base}/:fileId/reopen`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res, false); if (!ok) return;
      const [actor, file] = ok;
      if (!actor.isSupervisor) return res.status(403).json({ message: "Only the HOD, Section Officer or department admin can reopen a file" });
      if (!["closed", "archived"].includes(file.status)) return res.status(400).json({ message: "Only a closed or archived file can be reopened" });
      const remarks = String(req.body.remarks || "").trim();
      if (!remarks) return res.status(400).json({ message: "Please give the reason" });
      await db.execute(sql`UPDATE efiles SET status = 'open', closed_at = NULL, retention_until = NULL WHERE id = ${file.id}`);
      await addEntry(file.id, actor, "reopened", { body: `File reopened: ${remarks}` });
      res.json({ success: true });
    } catch (error) { fail(res, error, "reopen the file"); }
  });

  // ─── Record room: archive / keep longer / weed out ─────────────────────
  app.post(`${base}/:fileId/record`, async (req: Request, res: Response) => {
    try {
      const ok = await openFile(req, res, false); if (!ok) return;
      const [actor, file] = ok;
      if (!actor.isSupervisor) return res.status(403).json({ message: "Only the HOD, Section Officer or department admin can do record room actions" });
      const action = String(req.body.action || "");
      const remarks = String(req.body.remarks || "").trim();
      if (action === "archive") {
        if (file.status !== "closed") return res.status(400).json({ message: "Only a closed file can go to the record room" });
        await db.execute(sql`UPDATE efiles SET status = 'archived', record_remarks = ${remarks || null} WHERE id = ${file.id}`);
        await addEntry(file.id, actor, "record", { body: `Sent to record room${remarks ? `: ${remarks}` : ""}` });
      } else if (action === "extend") {
        const years = Number(req.body.years);
        if (!["closed", "archived"].includes(file.status) || !file.retention_until) return res.status(400).json({ message: "Only a closed file with a retention date can be kept longer" });
        if (!Number.isInteger(years) || years < 1 || years > 50) return res.status(400).json({ message: "Years must be 1–50" });
        if (!remarks) return res.status(400).json({ message: "Please give the reason" });
        await db.execute(sql`UPDATE efiles SET retention_until = (GREATEST(retention_until, CURRENT_DATE) + make_interval(years => ${years}))::date,
          record_remarks = ${remarks} WHERE id = ${file.id}`);
        await addEntry(file.id, actor, "record", { body: `Retention extended by ${years} year(s): ${remarks}` });
      } else if (action === "weed") {
        const due = file.retention_until && String(file.retention_until).slice(0, 10) <= new Date().toISOString().slice(0, 10);
        if (!["closed", "archived"].includes(file.status) || !due) return res.status(400).json({ message: "Only a closed file whose retention period is over can be weeded out" });
        if (!remarks) return res.status(400).json({ message: "Please record the weeding order / reason" });
        await db.execute(sql`UPDATE efiles SET status = 'weeded', record_remarks = ${remarks} WHERE id = ${file.id}`);
        await addEntry(file.id, actor, "record", { body: `Weeded out: ${remarks}` });
      } else {
        return res.status(400).json({ message: "Unknown record room action" });
      }
      res.json({ success: true });
    } catch (error) { fail(res, error, "do the record room action"); }
  });
}
