import cron from 'node-cron';
import { db } from './db';
import { attendanceReports, departments } from '@shared/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { sendAttendanceReminder } from './emailService';

export function setupCronJobs() {
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    // Run every day at 09:00 AM IST
    cron.schedule('0 9 * * *', async () => {
        console.log('Running daily attendance reminders cron...');

        try {
            const today = new Date();
            const currentMonth = today.getMonth() + 1; // 1-12
            const currentYear = today.getFullYear();

            // Target month is current month
            let targetMonth = currentMonth;
            let targetYear = currentYear;

            const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

            // Get all permitted departments with emails
            const permittedDepts = await db.query.departments.findMany({
                where: and(
                    eq(departments.attendancePermitted, true),
                    isNotNull(departments.email),
                    sql`${departments.email} != ''`
                )
            });

            // 1. Not Created by 10th (Runs exactly on the 10th)
            if (today.getDate() === 10) {
                console.log('Running 10th day reminders...');
                for (const dept of permittedDepts) {
                    const reports = await db.query.attendanceReports.findMany({
                        where: and(
                            eq(attendanceReports.departmentId, dept.id),
                            eq(attendanceReports.month, targetMonth),
                            eq(attendanceReports.year, targetYear)
                        )
                    });

                    const hasSentReport = reports.some(r => r.status === 'sent');
                    const activeReports = reports.filter(r => r.status !== 'cancelled');

                    // Only send reminder if department has no active reports and no sent report
                    if (!hasSentReport && activeReports.length === 0) {
                        try {
                            await sendAttendanceReminder(dept.email, dept.name, 'not_created', {
                                monthName: monthNames[targetMonth],
                                year: targetYear
                            });
                        } catch (e) {
                            console.error(`Cron error sending not_created to ${dept.email}:`, e);
                        }
                        await delay(2000); // Wait 2 seconds between emails
                    }
                }
            }

            // 4. Day before deadline (14th of the month)
            if (today.getDate() === 14) {
                console.log('Running 14th day deadline warnings...');
                for (const dept of permittedDepts) {
                    const reports = await db.query.attendanceReports.findMany({
                        where: and(
                            eq(attendanceReports.departmentId, dept.id),
                            eq(attendanceReports.month, targetMonth),
                            eq(attendanceReports.year, targetYear)
                        )
                    });

                    // If department ALREADY has ANY report in 'sent' status for this month, NEVER send deadline warning
                    const hasSentReport = reports.some(r => r.status === 'sent');
                    if (hasSentReport) {
                        continue;
                    }

                    // Look only at active (non-cancelled) reports
                    const activeReports = reports.filter(r => r.status !== 'cancelled');
                    const latestActiveReport = activeReports.length > 0
                        ? activeReports.sort((a, b) => b.id - a.id)[0]
                        : null;

                    let currentStatus = 'not_created';
                    if (latestActiveReport) {
                        currentStatus = latestActiveReport.status;
                    }

                    try {
                        await sendAttendanceReminder(dept.email, dept.name, 'deadline_warning', {
                            monthName: monthNames[targetMonth],
                            year: targetYear,
                            currentStatus: currentStatus
                        });
                    } catch (e) {
                        console.error(`Cron error sending deadline_warning to ${dept.email}:`, e);
                    }
                    await delay(2000); // Wait 2 seconds between emails
                }
            }

            // Calculate date ranges for 2-3 days ago (to send exactly one reminder)
            // "create karne ke 2 din bad reminder send hona chahiye"
            // If today is 12th, the report was created on 10th. (Difference is 2 days)
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            twoDaysAgo.setHours(23, 59, 59, 999);

            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            threeDaysAgo.setHours(23, 59, 59, 999);

            // 2. Created but not Finalized (draft) for > 2 days
            const draftReports = await db.query.attendanceReports.findMany({
                where: and(
                    eq(attendanceReports.status, 'draft'),
                    sql`${attendanceReports.createdAt} <= ${twoDaysAgo}`,
                    sql`${attendanceReports.createdAt} > ${threeDaysAgo}`
                )
            });

            for (const report of draftReports) {
                const dept = permittedDepts.find(d => d.id === report.departmentId);
                if (dept?.email) {
                    // Check if department already has a 'sent' report for this month/year
                    const alreadySent = await db.query.attendanceReports.findFirst({
                        where: and(
                            eq(attendanceReports.departmentId, report.departmentId),
                            eq(attendanceReports.month, report.month),
                            eq(attendanceReports.year, report.year),
                            eq(attendanceReports.status, 'sent')
                        )
                    });
                    if (alreadySent) {
                        continue; // Skip if department already submitted a report for this month
                    }

                    try {
                        await sendAttendanceReminder(dept.email, dept.name, 'not_finalized', {
                            monthName: monthNames[report.month],
                            year: report.year
                        });
                    } catch (e) {
                        console.error(`Cron error sending not_finalized to ${dept.email}:`, e);
                    }
                    await delay(2000); // Wait 2 seconds
                }
            }

            // 3. Finalized but not Uploaded (submitted) for > 2 days
            const submittedReports = await db.query.attendanceReports.findMany({
                where: and(
                    eq(attendanceReports.status, 'submitted'),
                    sql`${attendanceReports.finalizedAt} <= ${twoDaysAgo}`,
                    sql`${attendanceReports.finalizedAt} > ${threeDaysAgo}`
                )
            });

            for (const report of submittedReports) {
                const dept = permittedDepts.find(d => d.id === report.departmentId);
                if (dept?.email) {
                    // Check if department already has a 'sent' report for this month/year
                    const alreadySent = await db.query.attendanceReports.findFirst({
                        where: and(
                            eq(attendanceReports.departmentId, report.departmentId),
                            eq(attendanceReports.month, report.month),
                            eq(attendanceReports.year, report.year),
                            eq(attendanceReports.status, 'sent')
                        )
                    });
                    if (alreadySent) {
                        continue; // Skip if department already submitted a report for this month
                    }

                    try {
                        await sendAttendanceReminder(dept.email, dept.name, 'not_sent', {
                            monthName: monthNames[report.month],
                            year: report.year
                        });
                    } catch (e) {
                        console.error(`Cron error sending not_sent to ${dept.email}:`, e);
                    }
                    await delay(2000); // Wait 2 seconds
                }
            }

            console.log('Daily attendance reminders completed.');
        } catch (err) {
            console.error('Error running daily cron job:', err);
        }
    }, {
        timezone: "Asia/Kolkata"
    });
}
