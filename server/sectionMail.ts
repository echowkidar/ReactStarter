// E-mails to the Accounts / Bill / Students Section about the Wages / Fund Staff (letter-EPID)
// attendance of their own staff. Sent to the e-mail of every section login of that section
// (admins with role "salary" and user code ACC / BIL / STU). Never throws.
//  • a department sent its report, asked to cancel or recall it, or the cancel / recall was approved;
//  • before the due date (day before the month ends) and when overdue (3rd of next month):
//    the departments whose attendance has not arrived yet.
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sendSimpleEmail } from "./emailService";
import { sectionCodes, sectionLabel, FUND_REPORT_LABEL, type SectionKey } from "../shared/sections";

type FundSection = Exclude<SectionKey, "salary">;
const FUND_SECTIONS: FundSection[] = ["accounts", "bill", "students"];
const LOGIN_CODE: Record<FundSection, string> = { accounts: "ACC", bill: "BIL", students: "STU" };
const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const codesSql = (s: FundSection) => sql.join(sectionCodes(s).map((c) => sql`${c}`), sql`, `);

/** E-mail addresses of a section's logins */
export async function sectionEmails(section: FundSection): Promise<string[]> {
  const r = (await db.execute(sql`
    SELECT DISTINCT LOWER(TRIM(email)) AS email FROM admins
    WHERE role IN ('salary', 'salary_admin') AND UPPER(TRIM(COALESCE(user_code, ''))) = ${LOGIN_CODE[section]}
      AND COALESCE(TRIM(email), '') <> ''`)).rows as any[];
  return r.map((x) => x.email).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

function wrapHtml(title: string, body: string, color = "#1e3a8a") {
  return `<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 6px;">
    <h2 style="color: ${color}; margin-top: 0;">${title}</h2>${body}
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
    <p style="color: #666; font-size: 12px; text-align: center;">Automated message from the AMU Attendance Portal (${FUND_REPORT_LABEL} staff). Please do not reply.</p>
  </div>`;
}

async function sendToSection(section: FundSection, subject: string, html: string) {
  for (const to of await sectionEmails(section)) {
    const r = await sendSimpleEmail(to, subject, html);
    if (!r.success) console.error(`[SectionMail] ${subject} → ${sectionLabel(section)} failed: ${r.error}`);
  }
}

// (Recall applies to a finalised report that was never sent, so the sections never had it — no e-mail.)
export type FundReportEvent = "sent" | "cancel_requested" | "cancelled";
type StaffRow = { epid: string; name: string; days: number };
export type FundReportStaff = Partial<Record<FundSection, StaffRow[]>>;

/** Each section's staff in a report (taken BEFORE entries are deleted on cancel); null = not a fund report */
export async function fundReportStaff(reportId: number): Promise<FundReportStaff | null> {
  try {
    const t = (await db.execute(sql`SELECT COALESCE(report_type, 'regular') AS t, entry_source FROM attendance_reports WHERE id = ${reportId}`)).rows[0] as any;
    if (!t || t.t !== "fund") return null;
    const out: FundReportStaff = {};
    for (const section of FUND_SECTIONS) {
      const staff = (await db.execute(sql`
        SELECT e.epid, e.name, SUM(ae.days)::int AS days
        FROM attendance_entries ae JOIN employees e ON e.id = ae.employee_id
        WHERE ae.report_id = ${reportId} AND UPPER(TRIM(COALESCE(e.salary_asstt, ''))) IN (${codesSql(section)})
        GROUP BY e.epid, e.name ORDER BY e.epid`)).rows as any[];
      if (staff.length) out[section] = staff.map((s) => ({ epid: s.epid, name: s.name, days: Number(s.days) || 0 }));
    }
    return out;
  } catch (e) {
    console.error("[SectionMail] staff of report failed:", e);
    return null;
  }
}

/** A department's Wages / Fund Staff report changed: tell each section whose staff are in it */
export async function notifySectionsOfFundReport(reportId: number, event: FundReportEvent, reason?: string | null, staffBySection?: FundReportStaff | null): Promise<void> {
  try {
    const rep = (await db.execute(sql`
      SELECT ar.id, ar.month, ar.year, ar.report_kind, ar.transaction_id, ar.despatch_no, ar.entry_source,
             COALESCE(ar.report_type, 'regular') AS report_type, d.name AS department_name
      FROM attendance_reports ar LEFT JOIN departments d ON d.id = ar.department_id WHERE ar.id = ${reportId}`)).rows[0] as any;
    if (!rep || rep.report_type !== "fund" || rep.entry_source === "paper") return;
    const m = `${MONTHS[Number(rep.month)]} ${rep.year}`;
    const kind = rep.report_kind === "supplementary" ? "Supplementary" : "Main";
    const all = staffBySection ?? (await fundReportStaff(reportId)) ?? {};
    for (const section of FUND_SECTIONS) {
      const staff = all[section] || [];
      if (!staff.length) continue;
      const total = staff.reduce((n, s) => n + Number(s.days || 0), 0);
      const head: Record<FundReportEvent, [string, string]> = {
        sent: [`Received: ${FUND_REPORT_LABEL} attendance of ${m} — ${rep.department_name}`,
          `<p><strong>${esc(rep.department_name)}</strong> has sent its ${FUND_REPORT_LABEL} attendance (${kind}) of <strong>${m}</strong>.</p>`],
        cancel_requested: [`Cancel requested: ${FUND_REPORT_LABEL} attendance of ${m} — ${rep.department_name}`,
          `<p><strong>${esc(rep.department_name)}</strong> has asked to <strong>cancel</strong> its ${FUND_REPORT_LABEL} attendance (${kind}) of <strong>${m}</strong>.</p>${reason ? `<p><strong>Reason:</strong> ${esc(reason)}</p>` : ""}`],
        cancelled: [`Cancelled: ${FUND_REPORT_LABEL} attendance of ${m} — ${rep.department_name}`,
          `<p>The ${FUND_REPORT_LABEL} attendance (${kind}) of <strong>${m}</strong> of <strong>${esc(rep.department_name)}</strong> has been <strong>cancelled</strong>; these days no longer count. Please check any payroll roll made from it (a draft roll can be rebuilt; a passed roll needs your attention).</p>${reason ? `<p><strong>Remarks:</strong> ${esc(reason)}</p>` : ""}`],
      };
      const [subject, intro] = head[event];
      const rows = staff.slice(0, 50).map((s) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(s.epid)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(s.name)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${s.days}</td></tr>`).join("");
      const body = `${intro}
        <p>${sectionLabel(section)} staff in this report: <strong>${staff.length}</strong>, total days <strong>${total}</strong>${rep.transaction_id ? ` · Transaction ID ${esc(rep.transaction_id)}` : ""}${rep.despatch_no ? ` · Despatch No. ${esc(rep.despatch_no)}` : ""}</p>
        <table style="border-collapse:collapse;font-size:13px;width:100%;"><thead><tr style="background:#f1f5f9;">
          <th style="padding:6px 8px;text-align:left;">Emp ID</th><th style="padding:6px 8px;text-align:left;">Name</th><th style="padding:6px 8px;text-align:right;">Days</th></tr></thead>
          <tbody>${rows}</tbody></table>${staff.length > 50 ? `<p style="font-size:12px;color:#666;">… and ${staff.length - 50} more.</p>` : ""}
        <p>Open the Attendance Portal → Payroll (${sectionLabel(section)}) to prepare or check the roll.</p>`;
      await sendToSection(section, subject, wrapHtml(subject, body, event === "sent" ? "#1e3a8a" : "#b45309"));
    }
  } catch (e) {
    console.error("[SectionMail] notify failed:", e);
  }
}

/**
 * The day before the due date and on the 3rd of next month: tell each section which of its
 * departments have not sent the month's attendance yet (a paper entry by the section counts as received).
 */
export async function sendSectionPendingLists(month: number, year: number, overdue: boolean): Promise<void> {
  try {
    const m = `${MONTHS[month]} ${year}`;
    for (const section of FUND_SECTIONS) {
      const r = (await db.execute(sql`
        SELECT d.name, COUNT(*)::int AS staff,
          (SELECT ar.status FROM attendance_reports ar WHERE ar.department_id = d.id AND ar.month = ${month} AND ar.year = ${year}
             AND COALESCE(ar.report_type, 'regular') = 'fund' AND ar.status <> 'cancelled'
           ORDER BY (ar.status IN ('sent', 'cancel_requested')) DESC, ar.id DESC LIMIT 1) AS status
        FROM employees e JOIN departments d ON d.id = e.department_id
        WHERE e.is_active = 'active' AND e.epid ~ '^[A-Za-z]' AND UPPER(TRIM(COALESCE(e.salary_asstt, ''))) IN (${codesSql(section)})
        GROUP BY d.id, d.name ORDER BY d.name`)).rows as any[];
      const pending = r.filter((x) => !["sent", "cancel_requested"].includes(x.status));
      if (!pending.length) continue;
      const label = (s: string | null) => (s === "draft" ? "Draft" : s === "submitted" ? "Finalised, not sent" : "Not created");
      const subject = overdue
        ? `${sectionLabel(section)}: ${pending.length} department(s) have not sent the ${m} attendance (overdue)`
        : `${sectionLabel(section)}: ${pending.length} department(s) have not sent the ${m} attendance (due tomorrow)`;
      const rows = pending.map((x) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${esc(x.name)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${x.staff}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;">${label(x.status)}</td></tr>`).join("");
      const body = `<p>The ${FUND_REPORT_LABEL} attendance of <strong>${m}</strong> ${overdue ? "was due by the last day of the month" : "is due tomorrow (last day of the month)"}. These departments with ${sectionLabel(section)} staff have not sent it yet${overdue ? "; the wages are paid by the 7th" : ""}:</p>
        <table style="border-collapse:collapse;font-size:13px;width:100%;"><thead><tr style="background:#f1f5f9;">
          <th style="padding:6px 8px;text-align:left;">Department</th><th style="padding:6px 8px;text-align:right;">Staff</th><th style="padding:6px 8px;text-align:left;">Status</th></tr></thead>
          <tbody>${rows}</tbody></table>
        <p>The departments have been reminded by e-mail. Attendance received on paper can be entered from Payroll → "Enter paper attendance".</p>`;
      await sendToSection(section, subject, wrapHtml(subject, body, overdue ? "#b45309" : "#1e3a8a"));
    }
  } catch (e) {
    console.error("[SectionMail] pending lists failed:", e);
  }
}
