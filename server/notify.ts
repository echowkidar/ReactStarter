// Notifications: one place that sends dak / e-file events over channels.
// ─────────────────────────────────────────────────────────────────────────────
// Channels:  inapp (bell in the app) · email · sms · whatsapp
// Adapters:  every channel sends through an adapter chosen by environment:
//   NOTIFY_EMAIL_ADAPTER     smtp (default, the existing mail server) | console
//   NOTIFY_SMS_ADAPTER       console (default)
//   NOTIFY_WHATSAPP_ADAPTER  console (default)
//   NOTIFY_DISABLE           comma list of channels to switch off, e.g. "sms,whatsapp"
// "console" adapters only log the message and record it as "stubbed" in the
// delivery log (table `notifications`). A real provider is added later with
// registerChannelAdapter("sms", "<name>", adapter) and NOTIFY_SMS_ADAPTER=<name>;
// nothing else changes.
//
// Every message (all channels) is written to `notifications`: in-app rows are the
// bell's inbox, the other rows are the delivery log (admin can see it).
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionDepartmentId, sessionStaff } from "./auth";

export type Channel = "inapp" | "email" | "sms" | "whatsapp";
export const CHANNELS: Channel[] = ["inapp", "email", "sms", "whatsapp"];

export interface OutboundMessage {
  channel: Channel;
  event: string;
  to: string;          // e-mail address / mobile number
  title: string;
  text: string;        // plain text (SMS / WhatsApp / e-mail fallback)
  html?: string;       // e-mail body
  link?: string;       // path in the app, e.g. /dashboard/dispatch
}
export interface SendResult { status: "sent" | "stubbed" | "failed"; providerId?: string; error?: string }
export interface ChannelAdapter { send(message: OutboundMessage): Promise<SendResult> }

// ─── Adapters ─────────────────────────────────────────────────────────────
class ConsoleAdapter implements ChannelAdapter {
  async send(m: OutboundMessage): Promise<SendResult> {
    console.log(`[notify:${m.channel}:console] → ${m.to} | ${m.title} | ${m.text}${m.link ? ` | ${m.link}` : ""}`);
    return { status: "stubbed" };
  }
}

class SmtpEmailAdapter implements ChannelAdapter {
  async send(m: OutboundMessage): Promise<SendResult> {
    const { sendSimpleEmail } = await import("./emailService");
    const r = await sendSimpleEmail(m.to, m.title, m.html || `<p>${escapeHtml(m.text)}</p>`);
    return r.success ? { status: "sent" } : { status: "failed", error: r.error };
  }
}

const registry: Record<Exclude<Channel, "inapp">, Record<string, ChannelAdapter>> = {
  email: { smtp: new SmtpEmailAdapter(), console: new ConsoleAdapter() },
  sms: { console: new ConsoleAdapter() },
  whatsapp: { console: new ConsoleAdapter() },
};

/** Add a real provider later, e.g. registerChannelAdapter("sms", "msg91", new Msg91Adapter()) */
export function registerChannelAdapter(channel: Exclude<Channel, "inapp">, name: string, adapter: ChannelAdapter) {
  registry[channel][name] = adapter;
}

const warned = new Set<string>();
function adapterFor(channel: Exclude<Channel, "inapp">): { name: string; adapter: ChannelAdapter } {
  const wanted = String(process.env[`NOTIFY_${channel.toUpperCase()}_ADAPTER`] || (channel === "email" ? "smtp" : "console")).toLowerCase();
  const adapter = registry[channel][wanted];
  if (adapter) return { name: wanted, adapter };
  if (!warned.has(`${channel}:${wanted}`)) {
    warned.add(`${channel}:${wanted}`);
    console.warn(`[notify] ${channel} adapter "${wanted}" is not available yet — using console`);
  }
  return { name: "console", adapter: registry[channel].console };
}

const disabled = () => new Set(String(process.env.NOTIFY_DISABLE || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));

// ─── Events and their channels ────────────────────────────────────────────
// Dispatch e-mails to departments are sent by the dispatch itself ("Send email"
// tick box, forwards), so those events do not add a second e-mail here.
export const EVENT_CHANNELS: Record<string, Channel[]> = {
  "dak.incoming": ["inapp", "sms", "whatsapp"],
  "dak.forwarded_in": ["inapp", "sms", "whatsapp"],
  "dak.marked": ["inapp", "email", "sms", "whatsapp"],
  "dak.overdue": ["inapp", "email", "sms", "whatsapp"],
  "dak.withdrawn": ["inapp"],
  "efile.moved": ["inapp", "sms"],
  "efile.draft_put_up": ["inapp"],
  "efile.draft_decided": ["inapp", "email"],
};

export type Recipient = { kind: "department"; departmentId: number } | { kind: "staff"; staffId: number };
export interface NotifyContent { title: string; text: string; html?: string; link?: string }

export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** "98765 43210" → "+919876543210"; anything that is not a usable number → null */
export function normalizeMobile(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (s.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

type Contact = { departmentId: number; staffId: number | null; email: string | null; mobile: string | null };

async function contactOf(r: Recipient): Promise<Contact | null> {
  if (r.kind === "staff") {
    const s = (await db.execute(sql`SELECT id, department_id, email, mobile FROM department_staff WHERE id = ${r.staffId} AND is_active = true`)).rows[0] as any;
    return s ? { departmentId: Number(s.department_id), staffId: Number(s.id), email: s.email || null, mobile: normalizeMobile(s.mobile) } : null;
  }
  const d = (await db.execute(sql`
    SELECT d.id, d.email,
      (SELECT c.contact_phone FROM department_contacts c WHERE c.department_id = d.id ORDER BY c.updated_at DESC LIMIT 1) AS mobile
    FROM departments d WHERE d.id = ${r.departmentId}`)).rows[0] as any;
  if (!d) return null;
  const email = d.email && !/placeholder|example\.com/i.test(d.email) ? d.email : null;
  return { departmentId: Number(d.id), staffId: null, email, mobile: normalizeMobile(d.mobile) };
}

async function record(m: { event: string; channel: Channel; adapter: string; contact: Contact; address: string | null; content: NotifyContent; result: SendResult }) {
  await db.execute(sql`
    INSERT INTO notifications (event, channel, adapter, department_id, staff_id, address, title, body, link, status, error)
    VALUES (${m.event}, ${m.channel}, ${m.adapter}, ${m.contact.departmentId}, ${m.contact.staffId}, ${m.address},
            ${m.content.title}, ${m.content.text}, ${m.content.link || null}, ${m.result.status}, ${m.result.error || null})`);
}

export type NotifySummary = { sent: number; stubbed: number; failed: number; skipped: number };

/**
 * Send one event to recipients on the event's channels. Never throws.
 * Department recipients: in-app is seen by everyone logged in to that department;
 * e-mail / SMS / WhatsApp go to the department e-mail and its contact person's phone.
 */
export async function notify(event: string, recipients: Recipient[], content: NotifyContent): Promise<NotifySummary> {
  const summary: NotifySummary = { sent: 0, stubbed: 0, failed: 0, skipped: 0 };
  try {
    const off = disabled();
    const channels = (EVENT_CHANNELS[event] || ["inapp"]).filter((c) => !off.has(c));
    const seen = new Set<string>();
    for (const r of recipients) {
      const key = r.kind === "staff" ? `s${r.staffId}` : `d${r.departmentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const contact = await contactOf(r);
      if (!contact) { summary.skipped += channels.length; continue; }
      for (const channel of channels) {
        try {
          if (channel === "inapp") {
            await record({ event, channel, adapter: "app", contact, address: null, content, result: { status: "sent" } });
            summary.sent++;
            continue;
          }
          const address = channel === "email" ? contact.email : contact.mobile;
          if (!address) { summary.skipped++; continue; }
          const { name, adapter } = adapterFor(channel);
          const text = channel === "email" ? content.text : `AMU Dak: ${content.text}`.slice(0, channel === "sms" ? 300 : 1000);
          const result = await adapter.send({ channel, event, to: address, title: content.title, text, html: content.html, link: content.link });
          await record({ event, channel, adapter: name, contact, address, content: { ...content, text }, result });
          summary[result.status]++;
        } catch (error: any) {
          summary.failed++;
          console.error(`[notify] ${channel} for ${event} failed:`, error?.message || error);
        }
      }
    }
  } catch (error: any) {
    console.error(`[notify] ${event} failed:`, error?.message || error);
  }
  return summary;
}

/** Supervisors of a department (HOD / Section Officer logins), else the department itself */
export async function supervisorsOf(departmentId: number): Promise<Recipient[]> {
  const rows = (await db.execute(sql`SELECT id FROM department_staff
    WHERE department_id = ${departmentId} AND is_active = true AND role IN ('hod', 'section_officer')`)).rows as any[];
  return rows.length ? rows.map((r) => ({ kind: "staff" as const, staffId: Number(r.id) })) : [{ kind: "department", departmentId }];
}

// ─── In-app inbox (bell) + admin delivery log ─────────────────────────────
const iso = (col: string) => sql.raw(`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

export function registerNotificationRoutes(app: Express) {
  // In-app messages of the logged-in department / staff person
  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const departmentId = await sessionDepartmentId(req);
      if (!departmentId) return res.json({ unread: 0, items: [] });
      const staffId = sessionStaff(req)?.id ?? 0;
      const mine = sql`channel = 'inapp' AND department_id = ${departmentId} AND (staff_id IS NULL OR staff_id = ${staffId})`;
      const items = (await db.execute(sql`
        SELECT id, event, title, body, link, (read_at IS NOT NULL) AS read, ${iso("created_at")} AS "createdAt"
        FROM notifications WHERE ${mine} ORDER BY id DESC LIMIT 40`)).rows;
      const unread = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM notifications WHERE ${mine} AND read_at IS NULL`)).rows[0] as any;
      res.json({ unread: Number(unread?.n || 0), items });
    } catch (error: any) {
      console.error("[notify] inbox error:", error);
      res.status(500).json({ message: "Could not load notifications" });
    }
  });

  app.post("/api/notifications/read", async (req: Request, res: Response) => {
    try {
      const departmentId = await sessionDepartmentId(req);
      if (!departmentId) return res.json({ success: true });
      const staffId = sessionStaff(req)?.id ?? 0;
      const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
      await db.execute(sql`UPDATE notifications SET read_at = NOW()
        WHERE channel = 'inapp' AND read_at IS NULL AND department_id = ${departmentId} AND (staff_id IS NULL OR staff_id = ${staffId})
        ${ids.length ? sql`AND id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Could not update notifications" });
    }
  });

  // Admin: what was sent (or stubbed) on which channel
  app.get("/api/admin/notifications", async (req: Request, res: Response) => {
    try {
      const channel = String(req.query.channel || "");
      const status = String(req.query.status || "");
      const rows = (await db.execute(sql`
        SELECT n.id, n.event, n.channel, n.adapter, n.address, n.title, n.body, n.status, n.error,
          d.name AS "departmentName", s.name AS "staffName", ${iso("n.created_at")} AS "createdAt"
        FROM notifications n
        LEFT JOIN departments d ON d.id = n.department_id
        LEFT JOIN department_staff s ON s.id = n.staff_id
        WHERE TRUE
          ${CHANNELS.includes(channel as Channel) ? sql`AND n.channel = ${channel}` : sql``}
          ${["sent", "stubbed", "failed"].includes(status) ? sql`AND n.status = ${status}` : sql``}
        ORDER BY n.id DESC LIMIT 300`)).rows;
      const adapters = Object.fromEntries((["email", "sms", "whatsapp"] as const).map((c) => [c, adapterFor(c).name]));
      res.json({ adapters, disabled: Array.from(disabled()), rows });
    } catch (error: any) {
      console.error("[notify] admin log error:", error);
      res.status(500).json({ message: "Could not load the delivery log" });
    }
  });
}
