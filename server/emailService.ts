import nodemailer from 'nodemailer';
import { TransportOptions } from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

async function validateEmailDomain(email: string): Promise<boolean> {
  try {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    // Reject common typo squatted domains that have live MX records
    const blockedTypos = [
      'gmyail.com', 'gamil.com', 'gmail.co', 'gmai.com', 'gmal.com',
      'yaho.com', 'yahoo.co', 'yhoo.com',
      'hotmai.com', 'hotmail.co', 'hotmal.com',
      'uotlook.com', 'outlok.com', 'outlook.co'
    ];

    if (blockedTypos.includes(domain)) {
      return false;
    }

    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch (error) {
    return false;
  }
}

// Try to use real SMTP settings from environment variables if available
// Otherwise fallback to Ethereal for testing
function createTransporter() {
  // Check if real SMTP settings are provided in environment variables
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    console.log('Using real SMTP server for emails:', process.env.SMTP_HOST);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
      // Optional TLS settings
      ...(process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? {
        tls: {
          rejectUnauthorized: false // Accept self-signed certificates
        }
      } : {})
    } as TransportOptions);
  }

  // Fallback to Ethereal for testing
  console.log('Using Ethereal test account for emails (no real emails will be sent)');
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: 'ethereal.user@ethereal.email',
      pass: 'ethereal_password',
    },
  } as TransportOptions);
}

// Create the transporter with the appropriate settings
const transporter = createTransporter();

// Get Ethereal test account (for development only)
export async function setupTestEmailAccount() {
  try {
    // Skip if using real SMTP
    if (process.env.SMTP_HOST) {
      console.log('Using real SMTP server, skipping Ethereal test account setup');
      return null;
    }

    // Create a test account at ethereal.email
    const testAccount = await nodemailer.createTestAccount();

    // Log test account credentials for viewing emails
    console.log('Email test account created:');
    console.log(`- Email: ${testAccount.user}`);
    console.log(`- Password: ${testAccount.pass}`);
    console.log(`- Preview URL: https://ethereal.email/login`);

    // Update the transporter with test credentials
    (transporter.options as any).auth.user = testAccount.user;
    (transporter.options as any).auth.pass = testAccount.pass;

    return testAccount;
  } catch (error) {
    console.error('Failed to create test email account:', error);
    return null;
  }
}

export async function sendPasswordResetEmail(email: string, resetLink: string, isAdmin = false) {
  try {
    // Email content
    const mailOptions = {
      from: process.env.SMTP_FROM || '"AMU Salary Section" <noreply@amu.ac.in>',
      to: email,
      subject: `${isAdmin ? 'Admin ' : ''}Password Reset Request`,
      text: `
        You have requested to reset your ${isAdmin ? 'admin ' : ''}password.
        
        Please click on the following link to reset your password:
        ${resetLink}
        
        This link will expire in 1 hour.
        
        If you did not request this reset, please ignore this email.
        
        AMU Salary Section
      `,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
          <p>You have requested to reset your ${isAdmin ? 'admin ' : ''}password.</p>
          <p>Please click on the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #1e293b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Reset Password</a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you did not request this reset, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #666; font-size: 12px; text-align: center;">AMU Salary Section</p>
        </div>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    // Log mail delivery info
    console.log('Password reset email sent:');
    console.log(`- Message ID: ${info.messageId}`);

    // Parse transporter host for determining if using Ethereal
    const transportHost = (transporter.options as any).host;
    const isEthereal = transportHost === 'smtp.ethereal.email';

    // Preview URL for Ethereal test accounts
    if (info.messageId && isEthereal) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`- Preview URL: ${previewUrl}`);

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: previewUrl,
        isEthereal: true
      };
    }

    return {
      success: true,
      messageId: info.messageId,
      isEthereal: false
    };
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return {
      success: false,
      error: String(error)
    };
  }
}

export async function sendAttendanceNotification(
  email: string,
  departmentName: string,
  type: 'created' | 'finalized' | 'sent' | 'cancel_requested' | 'recall_requested' | 'cancel_approved' | 'recall_approved',
  reportDetails: {
    reportId?: number | string;
    monthName?: string;
    year?: number;
    totalEmployees?: number;
    transactionId?: string | null;
    despatchNo?: string | null;
    reason?: string;
  },
  adminRemarks?: string
) {
  try {
    const isValidDomain = await validateEmailDomain(email);
    if (!isValidDomain) {
      return {
        success: false,
        error: 'wrong_email',
        message: 'Email domain does not exist'
      };
    }

    let subject = '';
    let htmlContent = '';
    const reportMonthStr = `${reportDetails.monthName || ''} ${reportDetails.year || ''}`.trim();

    switch (type) {
      case 'created':
        subject = 'Attendance Report Created Successfully';
        htmlContent = `
          <h2 style="color: #333;">Attendance Report Created</h2>
          <p>Your attendance report has been created successfully.</p>
          <ul>
            <li><strong>Report ID:</strong> ${reportDetails.reportId}</li>
            <li><strong>Month:</strong> ${reportMonthStr}</li>
            <li><strong>Total Employees:</strong> ${reportDetails.totalEmployees || 0}</li>
            <li><strong>Current Status:</strong> Draft</li>
          </ul>
          <p>Please review the report, finalize it, and upload it before the deadline as soon as it is ready.</p>
        `;
        break;
      case 'finalized':
        subject = 'Attendance Report Finalized - Action Required';
        htmlContent = `
          <h2 style="color: #333;">Attendance Report Finalized</h2>
          <p>Your attendance report for <strong>${reportMonthStr}</strong> (Report ID: ${reportDetails.reportId}) has been finalized.</p>
          <p style="color: #d97706; font-weight: bold;">Action Required: Please remember to click on "Upload Signed Report" button to oficially submit it.</p>
        `;
        break;
      case 'sent':
        subject = 'Attendance Report Successfully Sent to Salary Section';
        htmlContent = `
          <h2 style="color: #333;">Attendance Report Sent</h2>
          <p>Your attendance report for <strong>${reportMonthStr}</strong> (Report ID: ${reportDetails.reportId}) has been successfully sent to the Salary Section.</p>
          <ul>
            <li><strong>Transaction ID:</strong> ${reportDetails.transactionId || 'N/A'}</li>
            <li><strong>Dispatch No:</strong> ${reportDetails.despatchNo || 'N/A'}</li>
          </ul>
          <p>Thank you for your timely submission.</p>
        `;
        break;
      case 'cancel_requested':
        subject = 'Request to Cancel Attendance Report Submitted';
        htmlContent = `
          <h2 style="color: #333;">Cancel Request Submitted</h2>
          <p>We have received your request to cancel the attendance report for <strong>${reportMonthStr}</strong> (Report ID: ${reportDetails.reportId}).</p>
          <p><strong>Reason provided:</strong> ${reportDetails.reason || 'N/A'}</p>
          <p>This request is currently pending Admin approval.</p>
        `;
        break;
      case 'recall_requested':
        subject = 'Request to Recall Attendance Report Submitted';
        htmlContent = `
          <h2 style="color: #333;">Recall Request Submitted</h2>
          <p>We have received your request to recall the attendance report for <strong>${reportMonthStr}</strong> (Report ID: ${reportDetails.reportId}).</p>
          <p><strong>Reason provided:</strong> ${reportDetails.reason || 'N/A'}</p>
          <p>This request is currently pending Admin approval.</p>
        `;
        break;
      case 'cancel_approved':
        subject = 'Important: Cancel Request Approved';
        htmlContent = `
          <h2 style="color: #333;">Cancel Request Approved</h2>
          <p>Your request to cancel the attendance report for <strong>${reportMonthStr}</strong> (Report ID: ${reportDetails.reportId}) has been <strong>APPROVED</strong>.</p>
          ${adminRemarks ? `<p><strong>Admin Remarks:</strong> ${adminRemarks}</p>` : ''}
          <p>You may now create a new report for this period if necessary.</p>
        `;
        break;
      case 'recall_approved':
        subject = 'Important: Recall Request Approved';
        htmlContent = `
          <h2 style="color: #333;">Recall Request Approved</h2>
          <p>Your request to recall the attendance report for <strong>${reportMonthStr}</strong> (Report ID: ${reportDetails.reportId}) has been <strong>APPROVED</strong>.</p>
          ${adminRemarks ? `<p><strong>Admin Remarks:</strong> ${adminRemarks}</p>` : ''}
          <p>The report status has been reverted to Draft. You can now edit and resend it.</p>
        `;
        break;
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || '"AMU Salary Section" <noreply@amu.ac.in>',
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          ${htmlContent}
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #666; font-size: 12px; text-align: center;">This is an automated message from the AMU Salary Section Attendance Portal. Please do not reply.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Attendance notification (${type}) sent to ${email}: ${info.messageId}`);

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`Failed to send attendance notification (${type}) to ${email}:`, error);

    // Check if error is related to invalid email format or bounce
    const isWrongEmail = error.responseCode === 550 || error.code === 'EENVELOPE' || String(error).includes('Invalid email') || String(error).includes('rejected');

    return {
      success: false,
      error: isWrongEmail ? 'wrong_email' : 'send_failed',
      message: String(error)
    };
  }
}

export async function sendAttendanceReminder(
  email: string,
  departmentName: string,
  type: 'not_created' | 'not_finalized' | 'not_sent' | 'deadline_warning',
  reportDetails: {
    monthName?: string;
    year?: number;
    currentStatus?: string;
  }
) {
  try {
    const isValidDomain = await validateEmailDomain(email);
    if (!isValidDomain) {
      return {
        success: false,
        error: 'wrong_email',
        message: 'Email domain does not exist'
      };
    }

    let subject = '';
    let htmlContent = '';
    const reportMonthStr = `${reportDetails.monthName || ''} ${reportDetails.year || ''}`.trim();

    switch (type) {
      case 'not_created':
        subject = 'Reminder: Please Create Attendance Report';
        htmlContent = `
          <h2 style="color: #333;">Action Required: Create Attendance Report</h2>
          <p>This is a reminder that the attendance report for <strong>${reportMonthStr}</strong> has not been created yet.</p>
          <p>Please log in to the Attendance Portal and create the report as soon as possible.</p>
        `;
        break;
      case 'not_finalized':
        subject = 'Reminder: Please Finalize Attendance Report';
        htmlContent = `
          <h2 style="color: #333;">Action Required: Finalize Attendance Report</h2>
          <p>Your attendance report for <strong>${reportMonthStr}</strong> has been created but is still in Draft status.</p>
          <p>Please log in to the Attendance Portal, review the entries, and finalize the report.</p>
        `;
        break;
      case 'not_sent':
        subject = 'Reminder: Please Upload & Send Attendance Report to Salary Section';
        htmlContent = `
          <h2 style="color: #333;">Action Required: Send Attendance Report</h2>
          <p>Your attendance report for <strong>${reportMonthStr}</strong> has been finalized but has not been sent to the Salary Section.</p>
          <p style="color: #d97706; font-weight: bold;">Please remember to log in and click on "Send Report / Forward to Salary Section" to officially submit it.</p>
        `;
        break;
      case 'deadline_warning':
        let statusMessage = "has not been created yet";
        if (reportDetails.currentStatus === 'draft') {
          statusMessage = "has been created but is currently in Draft status";
        } else if (reportDetails.currentStatus === 'submitted') {
          statusMessage = "has been Finalized but has not yet been Uploaded & Sent to the Salary Section";
        }

        subject = 'Urgent Action Required: Attendance Report Deadline Approaching';
        htmlContent = `
          <h2 style="color: #d97706;">CRITICAL: Submission Deadline Tomorrow</h2>
          <p>This is an urgent reminder that the deadline for submitting the Attendance Report for <strong>${reportMonthStr}</strong> is the 15th (Tomorrow).</p>
          <p>Our records indicate that your report <strong>${statusMessage}</strong>.</p>
          <p style="font-weight: bold;">Please log in to the Attendance Portal immediately and complete the submission process to avoid any administrative delays.</p>
        `;
        break;
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || '"AMU Salary Section" <noreply@amu.ac.in>',
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          ${htmlContent}
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #666; font-size: 12px; text-align: center;">This is an automated reminder from the AMU Salary Section Attendance Portal. Please do not reply.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Reminder (${type}) sent to ${email}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`Failed to send reminder (${type}) to ${email}:`, error);
    return {
      success: false,
      error: 'send_failed',
      message: String(error)
    };
  }
} 