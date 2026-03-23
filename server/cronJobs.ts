import cron from 'node-cron';
import { db } from './db';
import { attendanceReports, departments } from '@shared/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { sendAttendanceReminder } from './emailService';

export function setupCronJobs() {
    // Run every day at 09:00 AM
    cron.schedule('0 9 * * *', async () => {
        console.log('Running daily attendance reminders cron...');

        try {
            const today = new Date();
            const currentMonth = today.getMonth() + 1; // 1-12
            const currentYear = today.getFullYear();

            // Target month is previous month
            let targetMonth = currentMonth - 1;
            let targetYear = currentYear;
            if (targetMonth === 0) {
                targetMonth = 12;
                targetYear = currentYear - 1;
            }

            const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

            // Get all permitted departments with emails
            const permittedDepts = await db.query.departments.findMany({
                where: and(
                    eq(departments.attendancePermitted, true),
                    isNotNull(departments.email),
                    sql`${departments.email} != ''`
                )
            });

            // 1. Not Created by 10th
            if (today.getDate() >= 10) {
                for (const dept of permittedDepts) {
                    const reports = await db.query.attendanceReports.findMany({
                        where: and(
                            eq(attendanceReports.departmentId, dept.id),
                            eq(attendanceReports.month, targetMonth),
                            eq(attendanceReports.year, targetYear)
                        )
                    });

                    if (reports.length === 0) {
                        await sendAttendanceReminder(dept.email, dept.name, 'not_created', {
                            monthName: monthNames[targetMonth],
                            year: targetYear
                        });
                    }
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
                    await sendAttendanceReminder(dept.email, dept.name, 'not_finalized', {
                        monthName: monthNames[report.month],
                        year: report.year
                    });
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
                    await sendAttendanceReminder(dept.email, dept.name, 'not_sent', {
                        monthName: monthNames[report.month],
                        year: report.year
                    });
                }
            }

            console.log('Daily attendance reminders completed.');
        } catch (err) {
            console.error('Error running daily cron job:', err);
        }
    });
}
