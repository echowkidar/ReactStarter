import nodemailer from 'nodemailer';
import { TransportOptions } from 'nodemailer';

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