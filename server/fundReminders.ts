// Reminder e-mails for the Wages / Fund Staff (letter-EPID) attendance. Its due date is not the
// Salary Section's 15th: month M's attendance (Muster Roll) is due by the LAST DAY of M, and the
// Accounts / Bill / Students Section pays the wages by the 7th of M+1 (Finance Officer's circular).
// Sent to departments that have active letter-EPID staff, only while the report is open:
//  • 5 days before the month ends — M's report not created yet;
//  • the day before the month ends — M's report not sent yet (due tomorrow);
//  • the 3rd of M+1 — M's report still not sent (overdue; wages are paid by the 7th).
// A report entered by the section from the paper copy counts as sent.
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sendSimpleEmail } from "./emailService";
import { isFundReportOpen } from "./fundReports";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FUND = "Revolving Funds or Other Similar Funds";

type Kind = "not_created" | "due_tomorrow" | "overdue";
export type FundReminder = { departmentId: number; departmentName: string; email: string; kind: Kind; month: number; year: number; status: string };

/** Which reminders are due today (nothing is sent) */
export async function dueFundReminders(today: Date = new Date()): Promise<FundReminder[]> {
  const day = today.getDate();
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let kind: Kind | null = null;
  let ref = new Date(today.getFullYear(), today.getMonth(), 1);
  if (day === last - 5) kind = "not_created";
  else if (day === last - 1) kind = "due_tomorrow";
  else if (day === 3) { kind = "overdue"; ref = new Date(today.getFullYear(), today.getMonth() - 1, 1); }
  if (!kind || !(await isFundReportOpen())) return [];
  const month = ref.getMonth() + 1, year = ref.getFullYear();

  const rows = (await db.execute(sql`
    SELECT d.id, d.name, d.email,
      (SELECT ar.status FROM attendance_reports ar
        WHERE ar.department_id = d.id AND ar.month = ${month} AND ar.year = ${year}
          AND COALESCE(ar.report_type, 'regular') = 'fund' AND ar.status <> 'cancelled'
        ORDER BY (ar.status IN ('sent', 'cancel_requested')) DESC, ar.id DESC LIMIT 1) AS status
    FROM departments d
    WHERE COALESCE(d.email, '') <> ''
      AND EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id AND e.is_active = 'active' AND e.epid ~ '^[A-Za-z]')
    ORDER BY d.name`)).rows as any[];

  return rows
    .filter((r) => (kind === "not_created" ? !r.status : !["sent", "cancel_requested"].includes(r.status)))
    .map((r) => ({ departmentId: Number(r.id), departmentName: r.name, email: String(r.email).trim(), kind: kind!, month, year, status: r.status || "not_created" }));
}

function mail(r: FundReminder): { subject: string; html: string } {
  const m = `${MONTHS[r.month]} ${r.year}`;
  const state = r.status === "draft" ? "has been created but is still in Draft"
    : r.status === "submitted" ? "has been finalised but not yet uploaded and sent"
    : "has not been created yet";
  const text: Record<Kind, { subject: string; body: string }> = {
    not_created: {
      subject: `Reminder: ${FUND} attendance of ${m}`,
      body: `<p>The ${FUND} attendance (Muster Roll) of <strong>${m}</strong> for your wage staff has not been created yet.</p>
             <p>As per the Finance Officer's circular it must reach the Accounts / Bill / Students Section by the <strong>last day of the month</strong>, so that the wages can be paid by the 7th of next month.</p>`,
    },
    due_tomorrow: {
      subject: `Urgent: ${FUND} attendance of ${m} is due tomorrow`,
      body: `<p>The ${FUND} attendance of <strong>${m}</strong> is due <strong>tomorrow, the last day of the month</strong>.</p>
             <p>Our records show that it ${state}. Please complete and send it, so that your wage staff are paid on time.</p>`,
    },
    overdue: {
      subject: `Overdue: ${FUND} attendance of ${m} not received`,
      body: `<p>The ${FUND} attendance of <strong>${m}</strong> was due by the last day of the month and ${state === "has not been created yet" ? "has not been received" : `${state}`}.</p>
             <p>The wages of your staff are paid by the <strong>7th</strong>. Please send it today; a late attendance may delay their payment.</p>`,
    },
  };
  const t = text[r.kind];
  return {
    subject: t.subject,
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <h2 style="color: ${r.kind === "not_created" ? "#333" : "#d97706"};">${t.subject}</h2>
      <p>Dear ${r.departmentName},</p>${t.body}
      <p>Please log in to the Attendance Portal and use the <strong>${FUND}</strong> report.</p>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
      <p style="color: #666; font-size: 12px; text-align: center;">This is an automated reminder from the AMU Attendance Portal. Please do not reply.</p>
    </div>`,
  };
}

/** Sends today's reminders (2 seconds apart); returns how many were sent */
export async function runFundReminders(today: Date = new Date()): Promise<number> {
  const due = await dueFundReminders(today);
  let sent = 0;
  for (const r of due) {
    const { subject, html } = mail(r);
    const res = await sendSimpleEmail(r.email, subject, html);
    if (res.success) sent++;
    else console.error(`[FundReminders] ${r.kind} to ${r.departmentName} failed: ${res.error}`);
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  if (due.length) console.log(`[FundReminders] ${sent}/${due.length} ${due[0].kind} reminder(s) for ${MONTHS[due[0].month]} ${due[0].year}`);

  // The sections get the list of their departments still pending (day before the due date / overdue)
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const overdue = today.getDate() === 3;
  if ((today.getDate() === last - 1 || overdue) && (await isFundReportOpen())) {
    const ref = overdue ? new Date(today.getFullYear(), today.getMonth() - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1);
    const { sendSectionPendingLists } = await import("./sectionMail");
    await sendSectionPendingLists(ref.getMonth() + 1, ref.getFullYear(), overdue);
  }
  return sent;
}
