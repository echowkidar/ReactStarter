import express, { Express, Request } from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from 'url';
import multer from "multer";
import { DbStorage } from "./dbStorage";
import {
  Department,
  Employee,
  AttendanceReport,
  AttendanceEntry,
  insertEmployeeSchema,
  insertAttendanceReportSchema,
  insertAttendanceEntrySchema,
  insertDepartmentSchema,
  DepartmentName,
  InsertDepartment,
  InsertDepartmentName,
  attendanceEntries,
  departments
} from "../shared/schema";
import fs from "fs";
import { sql, eq, and, isNotNull, inArray } from "drizzle-orm";
import { db } from "./db";

// Helper: Check if employee's current-month attendance BLOCKS transfer.
// Logic:
//   - If any period covers the ENTIRE month (from 1st to last day) → block transfer.
//   - If only partial periods exist (e.g. 1st to 7th) → allow transfer.
//   - If no attendance this month → allow transfer.
async function checkEmployeeAttendanceBlocksTransfer(
  storage: DbStorage, employeeId: number
): Promise<{ blocked: boolean; message?: string }> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Last day of current month
  const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();

  // Format helpers for DD-MM-YY comparison (format used in periods JSON)
  const pad = (n: number) => n.toString().padStart(2, '0');
  const fullMonthStart = `${pad(1)}-${pad(currentMonth)}-${currentYear.toString().slice(-2)}`;
  const fullMonthEnd = `${pad(lastDayOfMonth)}-${pad(currentMonth)}-${currentYear.toString().slice(-2)}`;

  const result = await db.execute(sql`
    SELECT ae.periods, ar.month, ar.year, ar.status, d.name as department_name
    FROM attendance_entries ae
    JOIN attendance_reports ar ON ae.report_id = ar.id
    LEFT JOIN departments d ON ar.department_id = d.id
    WHERE ae.employee_id = ${employeeId}
      AND ar.month = ${currentMonth}
      AND ar.year = ${currentYear}
      AND ar.status != 'cancelled'
  `);

  for (const row of result.rows as any[]) {
    let periods: any[] = [];
    try {
      periods = typeof row.periods === 'string' ? JSON.parse(row.periods) : (row.periods || []);
    } catch (e) {
      continue;
    }

    for (const period of periods) {
      if (period.fromDate === fullMonthStart && period.toDate === fullMonthEnd) {
        return {
          blocked: true,
          message: `Cannot transfer: Full month attendance for ${monthNames[currentMonth]} ${currentYear} has already been created/sent by department "${row.department_name || 'Unknown'}" (Status: ${row.status}). You may request this transfer next month (after the new month begins), or contact the department directly to cancel the attendance report first.`
        };
      }
    }
  }

  return { blocked: false };
}
import { v4 as uuid } from "uuid";
import { setupTestEmailAccount, sendPasswordResetEmail, sendAttendanceNotification, sendNoticeEmail } from "./emailService";

// Add custom type for Request with session
interface RequestWithSession extends Request {
  session: {
    department?: Department;
    [key: string]: any;
  };
}

// Add type declaration for global adminResetTokens
declare global {
  var adminResetTokens: Map<string, { token: string; expiry: Date }>;
}

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database storage
const storage = new DbStorage();

// ============ Login Security: Turnstile & Rate Limiting ============
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Verify Cloudflare Turnstile token
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  // Allow development bypass tokens from localhost
  if (token === 'development-bypass' || token === 'error-bypass') {
    return true;
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    console.warn('TURNSTILE_SECRET_KEY not set, skipping verification');
    return true; // Skip in development if not configured
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: ip
      })
    });
    const data = await response.json() as { success: boolean };
    return data.success;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}

// Check if account is locked
async function isAccountLocked(identifier: string): Promise<{ locked: boolean; remainingMs?: number }> {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");

    const result = await db.execute(sql`
      SELECT locked_until FROM login_attempts 
      WHERE identifier = ${identifier} 
      AND locked_until IS NOT NULL 
      AND locked_until > NOW()
    `);

    if (result.rows.length > 0) {
      const lockedUntil = new Date(result.rows[0].locked_until as string);
      const remainingMs = lockedUntil.getTime() - Date.now();
      return { locked: true, remainingMs };
    }
    return { locked: false };
  } catch (error) {
    console.error('Error checking account lock:', error);
    return { locked: false };
  }
}

// Record failed login attempt
async function recordFailedAttempt(identifier: string): Promise<{ locked: boolean; attemptsRemaining: number }> {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");

    // Get current attempt count
    const existing = await db.execute(sql`
      SELECT id, attempt_count FROM login_attempts WHERE identifier = ${identifier}
    `);

    if (existing.rows.length > 0) {
      const currentCount = (existing.rows[0].attempt_count as number) + 1;
      const shouldLock = currentCount >= MAX_LOGIN_ATTEMPTS;

      await db.execute(sql`
        UPDATE login_attempts 
        SET attempt_count = ${currentCount},
            last_attempt_at = NOW(),
            locked_until = ${shouldLock ? sql`NOW() + INTERVAL '30 minutes'` : sql`NULL`}
        WHERE identifier = ${identifier}
      `);

      return {
        locked: shouldLock,
        attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - currentCount)
      };
    } else {
      // First attempt
      await db.execute(sql`
        INSERT INTO login_attempts (identifier, attempt_count, last_attempt_at)
        VALUES (${identifier}, 1, NOW())
      `);
      return { locked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS - 1 };
    }
  } catch (error) {
    console.error('Error recording failed attempt:', error);
    return { locked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }
}

// Clear login attempts on successful login
async function clearLoginAttempts(identifier: string): Promise<void> {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM login_attempts WHERE identifier = ${identifier}`);
  } catch (error) {
    console.error('Error clearing login attempts:', error);
  }
}
// ============ End Login Security ============

// ============ Active Users Tracking ============
// In-memory store for active users (session-based heartbeat)
interface ActiveSession {
  id: string;
  type: 'department' | 'admin';
  name: string;
  email?: string;
  lastHeartbeat: Date;
  loginTime: Date;
}

const activeUsers = new Map<string, ActiveSession>();

// Cleanup expired sessions (older than 2 minutes)
const HEARTBEAT_TIMEOUT = 2 * 60 * 1000; // 2 minutes

function cleanupExpiredSessions() {
  const now = Date.now();
  const entries = Array.from(activeUsers.entries());
  for (const [sessionId, session] of entries) {
    if (now - session.lastHeartbeat.getTime() > HEARTBEAT_TIMEOUT) {
      activeUsers.delete(sessionId);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredSessions, 60 * 1000);

function getActiveUsersCount() {
  cleanupExpiredSessions();
  const departments = Array.from(activeUsers.values()).filter(s => s.type === 'department');
  const admins = Array.from(activeUsers.values()).filter(s => s.type === 'admin');
  return {
    total: activeUsers.size,
    departments: departments.length,
    admins: admins.length,
    users: Array.from(activeUsers.values()).map(s => ({
      type: s.type,
      name: s.name,
      lastSeen: s.lastHeartbeat,
      loginTime: s.loginTime
    }))
  };
}
// ============ End Active Users Tracking ============

// Define the type expected by the client components for this route
// Note: Adjust fields based on what's *actually* needed by the client dropdowns

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Initialize test email service (in development)
  try {
    await setupTestEmailAccount();
  } catch (error) {
    console.error("Failed to setup test email account:", error);
  }

  // NOTE: Admin seeding removed for security - passwords should not be in source code
  // Admins must be manually created in the database 'admins' table
  // Function to verify admin session from header
  const verifyAdminSession = async (req: Request, res: any, next: any) => {
    const sessionToken = req.headers['x-session-token'];

    if (!sessionToken || typeof sessionToken !== 'string') {
      return res.status(401).json({ message: "Unauthorized: No session token" });
    }

    try {
      const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');
      const parts = decoded.split(':');

      if (parts.length < 2) {
        return res.status(401).json({ message: "Unauthorized: Invalid token format" });
      }

      const email = parts[0];
      const password = parts.slice(1).join(':');

      const admin = await storage.getAdminByEmail(email);

      if (!admin || admin.password !== password) {
        return res.status(401).json({ message: "Unauthorized: Invalid credentials" });
      }

      // Attach admin info to request
      (req as any).adminUser = admin;

      // CRITICAL: Block write operations for 'VEW' user code
      const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

      // Exception: Allow nasir to use the mark-exported API and bulk-export-date PATCH even if VEW
      const isNasirExporting = admin.email === 'nasir@amu.ac.in' && (
        (req.path === '/api/admin/attendance/mark-exported' && req.method === 'POST') ||
        (req.path === '/api/admin/attendance/bulk-export-date' && req.method === 'PATCH')
      );

      if (admin.userCode === 'VEW' && writeMethods.includes(req.method) && !isNasirExporting) {
        return res.status(403).json({ message: "Forbidden: View-only access" });
      }

      next();
    } catch (error) {
      console.error("Auth error:", error);
      return res.status(401).json({ message: "Unauthorized: Token validation failed" });
    }
  };

  // Initialize notices tables
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notices (
        id SERIAL PRIMARY KEY,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        image_url TEXT,
        is_global BOOLEAN NOT NULL DEFAULT true,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notice_recipients (
        id SERIAL PRIMARY KEY,
        notice_id INTEGER NOT NULL,
        department_id INTEGER NOT NULL
      )
    `);

    // Create visitors table for analytics
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS visitors (
        id SERIAL PRIMARY KEY,
        visitor_id TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        screen_resolution TEXT,
        timezone TEXT,
        language TEXT,
        visited_at TIMESTAMP NOT NULL DEFAULT NOW(),
        page_visited TEXT,
        department_id INTEGER
      )
    `);

    // Create active_user_snapshots table for graph history
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS active_user_snapshots (
        id SERIAL PRIMARY KEY,
        count INTEGER NOT NULL,
        admin_count INTEGER NOT NULL,
        department_count INTEGER NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create login_attempts table for brute force protection
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        identifier TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        last_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
        locked_until TIMESTAMP
      )
    `);

  } catch (error) {
    console.error("Error initializing tables:", error);
  }

  // Admin auth routes
  app.post("/api/auth/admin/login", async (req, res) => {
    const { email, password, turnstileToken } = req.body;
    const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '';

    try {
      // Check if account is locked
      const lockStatus = await isAccountLocked(email);
      if (lockStatus.locked) {
        const remainingMinutes = Math.ceil((lockStatus.remainingMs || 0) / 60000);
        return res.status(429).json({
          message: `Account locked. Try again in ${remainingMinutes} minutes.`,
          locked: true,
          remainingMinutes
        });
      }

      // Verify Turnstile CAPTCHA
      if (turnstileToken) {
        const isValidCaptcha = await verifyTurnstile(turnstileToken, clientIp);
        if (!isValidCaptcha) {
          return res.status(400).json({ message: "CAPTCHA verification failed. Please try again." });
        }
      } else if (process.env.TURNSTILE_SECRET_KEY) {
        // Only require CAPTCHA if configured
        return res.status(400).json({ message: "CAPTCHA verification required." });
      }

      const admin = await storage.getAdminByEmail(email);

      // Verify password
      if (!admin || admin.password !== password) {
        const attemptResult = await recordFailedAttempt(email);
        if (attemptResult.locked) {
          return res.status(429).json({
            message: "Too many failed attempts. Account locked for 30 minutes.",
            locked: true,
            remainingMinutes: 30
          });
        }
        return res.status(401).json({
          message: `Invalid admin credentials. ${attemptResult.attemptsRemaining} attempts remaining.`,
          attemptsRemaining: attemptResult.attemptsRemaining
        });
      }

      // Clear failed attempts on successful login
      await clearLoginAttempts(email);

      // Map DB role to frontend adminType
      const adminType = (admin.role === 'salary_admin' || admin.role === 'salary') ? 'salary' : 'super';

      // Create session token
      const sessionToken = Buffer.from(`${admin.email}:${admin.password}`).toString('base64');

      return res.json({
        role: "admin",
        adminType: adminType,
        adminName: admin.name || "Admin",
        userCode: admin.userCode,
        sessionToken: sessionToken,
        message: "Admin logged in successfully"
      });
    } catch (error) {
      console.error("Admin login error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Verify admin session (called on page load)
  app.post("/api/auth/admin/verify-session", async (req, res) => {
    const { email, sessionToken } = req.body;

    try {
      if (!email || !sessionToken) {
        return res.status(401).json({ valid: false, message: "Missing credentials" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ valid: false, message: "Admin not found" });
      }

      // Verify session token matches current password
      const expectedToken = Buffer.from(`${admin.email}:${admin.password}`).toString('base64');

      if (sessionToken !== expectedToken) {
        return res.status(401).json({ valid: false, message: "Session expired - password changed" });
      }

      // Map DB role to frontend adminType
      const adminType = (admin.role === 'salary_admin' || admin.role === 'salary') ? 'salary' : 'super';

      return res.json({
        valid: true,
        admin: {
          email: admin.email,
          name: admin.name || "Admin",
          role: adminType,
          userCode: admin.userCode
        }
      });
    } catch (error) {
      console.error("Session verification error:", error);
      return res.status(500).json({ valid: false, message: "Verification failed" });
    }
  });

  // Clear entries route (Placed early to avoid shadowing)
  app.post("/api/attendance/:reportId/clear-entries", async (req, res) => {
    try {
      await storage.deleteEntriesForReport(Number(req.params.reportId));
      res.json({ message: "Entries cleared successfully" });
    } catch (error) {
      console.error("Error clearing entries:", error);
      res.status(500).json({ message: "Failed to clear entries" });
    }
  });

  // ============ Active Users Tracking Endpoints ============
  // Heartbeat - clients call this every 30 seconds to stay active

  app.post("/api/heartbeat", async (req, res) => {
    const { sessionId, type, name, email } = req.body;

    if (!sessionId || !type || !name) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existing = activeUsers.get(sessionId);

    activeUsers.set(sessionId, {
      id: sessionId,
      type: type as 'department' | 'admin',
      name,
      email,
      lastHeartbeat: new Date(),
      loginTime: existing ? existing.loginTime : new Date()
    });

    return res.json({ success: true });
  });

  // Logout - remove session from active users
  app.post("/api/heartbeat/logout", async (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
      activeUsers.delete(sessionId);
    }
    return res.json({ success: true });
  });

  // Get active users count (admin only)
  app.get("/api/admin/active-users", async (req, res) => {
    try {
      const stats = getActiveUsersCount();
      return res.json(stats);
    } catch (error) {
      console.error("Error getting active users:", error);
      return res.status(500).json({ message: "Failed to get active users" });
    }
  });

  // Get active users history (for graph) - sourced from active_user_snapshots (Session State)
  app.get("/api/admin/active-users/history", async (req, res) => {
    try {
      const { period } = req.query;
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      let interval = "6 hours"; // Default to 6h per new default
      if (period === "1h") interval = "1 hour";
      if (period === "6h") interval = "6 hours";
      if (period === "24h") interval = "24 hours";
      if (period === "7d") interval = "7 days";
      if (period === "current_month") interval = "30 days";

      // Simple query for snapshots
      // No need for generate_series as snapshots are taken regularly by the server
      const history = await db.execute(sql`
        SELECT timestamp AT TIME ZONE 'UTC' as timestamp, count 
        FROM active_user_snapshots 
        WHERE timestamp AT TIME ZONE 'UTC' > NOW() - ${interval}::interval 
        ORDER BY timestamp ASC
      `);

      return res.json(history.rows.map(row => ({
        timestamp: row.timestamp,
        count: parseInt((row.count as any).toString())
      })));
    } catch (error) {
      console.error("Error getting active users history:", error);
      return res.status(500).json({ message: "Failed to get history" });
    }
  });

  // Snapshot task - Every 1 minute
  setInterval(async () => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const stats = getActiveUsersCount();

      await db.execute(sql`
        INSERT INTO active_user_snapshots (count, admin_count, department_count, timestamp)
        VALUES (${stats.total}, ${stats.admins}, ${stats.departments}, NOW())
      `);
      // Cleanup old snapshots (> 30 days)
      await db.execute(sql`DELETE FROM active_user_snapshots WHERE timestamp < NOW() - INTERVAL '30 days'`);
    } catch (err) {
      console.error("Error saving active user snapshot:", err);
    }
  }, 60 * 1000); // Every 1 minute
  // ============ End Active Users Tracking Endpoints ============

  // ============ Visitor Analytics Endpoints ============
  // Track a visitor - called on page load
  app.post("/api/visitors/track", async (req, res) => {
    try {
      const { visitorId, screenResolution, timezone, language, pageVisited, departmentId } = req.body;

      if (!visitorId) {
        return res.status(400).json({ message: "visitorId is required" });
      }

      // Get IP from request (considering proxy headers)
      const ipAddress = req.headers['x-forwarded-for'] as string ||
        req.headers['x-real-ip'] as string ||
        req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      // Insert visit record
      await db.execute(sql`
        INSERT INTO visitors (visitor_id, ip_address, user_agent, screen_resolution, timezone, language, page_visited, department_id, visited_at)
        VALUES (${visitorId}, ${ipAddress}, ${userAgent}, ${screenResolution || null}, ${timezone || null}, ${language || null}, ${pageVisited || null}, ${departmentId || null}, NOW())
      `);

      return res.json({ success: true });
    } catch (error) {
      console.error("Error tracking visitor:", error);
      return res.status(500).json({ message: "Failed to track visitor" });
    }
  });

  // Get visitor stats for admin dashboard
  app.get("/api/admin/visitor-stats", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      // Calculate previous month
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      // Get unique visitors for current month (by visitor_id fingerprint)
      const currentMonthResult = await db.execute(sql`
        SELECT COUNT(DISTINCT visitor_id) as unique_count, COUNT(*) as total_visits
        FROM visitors
        WHERE EXTRACT(YEAR FROM visited_at) = ${currentYear}
        AND EXTRACT(MONTH FROM visited_at) = ${currentMonth}
      `);

      // Get unique visitors for previous month
      const prevMonthResult = await db.execute(sql`
        SELECT COUNT(DISTINCT visitor_id) as unique_count, COUNT(*) as total_visits
        FROM visitors
        WHERE EXTRACT(YEAR FROM visited_at) = ${prevYear}
        AND EXTRACT(MONTH FROM visited_at) = ${prevMonth}
      `);

      // Get unique IPs for comparison (to show shared IP users)
      const currentMonthIPs = await db.execute(sql`
        SELECT COUNT(DISTINCT ip_address) as unique_ips
        FROM visitors
        WHERE EXTRACT(YEAR FROM visited_at) = ${currentYear}
        AND EXTRACT(MONTH FROM visited_at) = ${currentMonth}
      `);

      const prevMonthIPs = await db.execute(sql`
        SELECT COUNT(DISTINCT ip_address) as unique_ips
        FROM visitors
        WHERE EXTRACT(YEAR FROM visited_at) = ${prevYear}
        AND EXTRACT(MONTH FROM visited_at) = ${prevMonth}
      `);

      const currentStats = currentMonthResult.rows[0] as any || { unique_count: 0, total_visits: 0 };
      const prevStats = prevMonthResult.rows[0] as any || { unique_count: 0, total_visits: 0 };
      const currentIPs = currentMonthIPs.rows[0] as any || { unique_ips: 0 };
      const prevIPs = prevMonthIPs.rows[0] as any || { unique_ips: 0 };

      return res.json({
        currentMonth: {
          year: currentYear,
          month: currentMonth,
          uniqueVisitors: parseInt(currentStats.unique_count) || 0,
          totalVisits: parseInt(currentStats.total_visits) || 0,
          uniqueIPs: parseInt(currentIPs.unique_ips) || 0,
        },
        previousMonth: {
          year: prevYear,
          month: prevMonth,
          uniqueVisitors: parseInt(prevStats.unique_count) || 0,
          totalVisits: parseInt(prevStats.total_visits) || 0,
          uniqueIPs: parseInt(prevIPs.unique_ips) || 0,
        }
      });
    } catch (error) {
      console.error("Error getting visitor stats:", error);
      return res.status(500).json({ message: "Failed to get visitor stats" });
    }
  });
  // ============ End Visitor Analytics Endpoints ============

  // ============ n8n Webhook Proxy ============
  app.post("/api/chat-webhook", async (req, res) => {
    const n8nUrl = process.env.N8N_WEBHOOK_URL;

    if (!n8nUrl) {
      console.error("N8N_WEBHOOK_URL not configured");
      return res.status(500).json({ message: "Chat service not configured" });
    }

    try {
      const response = await fetch(n8nUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();
      return res.json(data);
    } catch (error) {
      console.error("Error proxying chat request:", error);
      return res.status(500).json({ message: "Failed to process chat request" });
    }
  });

  // Password reset routes
  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
      // Check if email exists in departments
      const department = await storage.getDepartmentByEmail(email);
      if (!department) {
        return res.status(404).json({ message: "Email not found" });
      }

      // Generate reset token (expires in 1 hour)
      const resetToken = uuid();
      const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Store token in database
      await storage.storeResetToken(department.id, resetToken, tokenExpiry);

      // Create reset URL
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://salarysection.com'
        : 'http://localhost:5001';

      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

      // Send email with reset link
      const emailResult = await sendPasswordResetEmail(email, resetUrl, false);

      const response: any = {
        message: "Password reset link has been sent to your email"
      };

      // For development only - include reset token and preview URL
      if (process.env.NODE_ENV !== 'production') {
        response.resetToken = resetToken;
        response.resetUrl = resetUrl;

        if (emailResult.previewUrl) {
          response.emailPreviewUrl = emailResult.previewUrl;
        }

        // Include isEthereal flag for UI customization
        response.isEthereal = emailResult.isEthereal;
      }

      return res.json(response);
    } catch (error) {
      console.error("Forgot password error:", error);
      return res.status(500).json({ message: "Failed to process password reset request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { email, token, newPassword } = req.body;

    try {
      // Validate that all required fields are present
      if (!email || !token || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Find department by email
      const department = await storage.getDepartmentByEmail(email);
      if (!department) {
        return res.status(404).json({ message: "Email not found" });
      }

      // Verify token validity
      const isValidToken = await storage.validateResetToken(department.id, token);
      if (!isValidToken) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      // Update password
      await storage.updateDepartment(department.id, { password: newPassword });

      // Clear used token
      await storage.clearResetToken(department.id);

      return res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Admin forgot/reset password routes
  app.post("/api/auth/admin/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
      // Query database for admin email
      const admin = await storage.getAdminByEmail(email);

      if (!admin) {
        return res.status(404).json({ message: "Admin email not found" });
      }

      // Generate reset token (expires in 1 hour)
      const resetToken = uuid();
      const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Store token (in a real app this would be in the database)
      // For demo, we'll use a global Map to store tokens
      if (!global.adminResetTokens) {
        global.adminResetTokens = new Map();
      }
      global.adminResetTokens.set(email, { token: resetToken, expiry: tokenExpiry });

      // Create reset URL
      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://salarysection.com'
        : 'http://localhost:5001';

      const resetUrl = `${baseUrl}/admin/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

      // Send email with reset link
      const emailResult = await sendPasswordResetEmail(email, resetUrl, true);

      const response: any = {
        message: "Password reset link has been sent to your email"
      };

      // For development only - include reset token and preview URL
      if (process.env.NODE_ENV !== 'production') {
        response.resetToken = resetToken;
        response.resetUrl = resetUrl;

        if (emailResult.previewUrl) {
          response.emailPreviewUrl = emailResult.previewUrl;
        }

        // Include isEthereal flag for UI customization
        response.isEthereal = emailResult.isEthereal;
      }

      return res.json(response);
    } catch (error) {
      console.error("Admin forgot password error:", error);
      return res.status(500).json({ message: "Failed to process admin password reset request" });
    }
  });

  app.post("/api/auth/admin/reset-password", async (req, res) => {
    const { email, token, newPassword } = req.body;

    try {
      // Validate that all required fields are present 
      if (!email || !token || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // For demo purposes only
      const ADMIN_EMAIL = "admin@amu.ac.in";
      const SALARY_ADMIN_EMAIL = "salary@amu.ac.in";

      if (email !== ADMIN_EMAIL && email !== SALARY_ADMIN_EMAIL) {
        return res.status(404).json({ message: "Admin email not found" });
      }

      // Check if token is valid
      if (!global.adminResetTokens || !global.adminResetTokens.has(email)) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      const tokenData = global.adminResetTokens.get(email);
      if (!tokenData || tokenData.token !== token || tokenData.expiry < new Date()) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      // In a real app, you would update the admin password in the database

      // Clear used token
      global.adminResetTokens.delete(email);

      return res.json({ message: "Admin password has been reset successfully" });
    } catch (error) {
      console.error("Admin reset password error:", error);
      return res.status(500).json({ message: "Failed to reset admin password" });
    }
  });

  // Endpoint to verify reset token validity (for frontend check)
  app.post("/api/auth/verify-reset-token", async (req, res) => {
    const { email, token, isAdmin } = req.body;

    if (!email || !token) {
      return res.status(400).json({ valid: false, message: "Missing fields" });
    }

    try {
      if (isAdmin) {
        // Validation for Admin
        if (!global.adminResetTokens || !global.adminResetTokens.has(email)) {
          return res.status(200).json({ valid: false, message: "Invalid or expired token" });
        }

        const tokenData = global.adminResetTokens.get(email);
        if (!tokenData || tokenData.token !== token) {
          return res.status(200).json({ valid: false, message: "Invalid token" });
        }

        if (tokenData.expiry < new Date()) {
          return res.status(200).json({ valid: false, message: "Token expired" });
        }

        return res.status(200).json({ valid: true });
      } else {
        // Validation for Department
        const department = await storage.getDepartmentByEmail(email);
        if (!department) {
          return res.status(200).json({ valid: false, message: "Email not found" });
        }

        const isValid = await storage.validateResetToken(department.id, token);
        // validateResetToken checks both equality and expiry

        return res.json({ valid: isValid });
      }
    } catch (error) {
      console.error("Token verification error:", error);
      return res.status(500).json({ valid: false, message: "Server error" });
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {

    try {
      const { id: departmentNameId, name, hodTitle, hodName, email, password } = req.body;

      if (!name || !hodTitle || !hodName || !email || !password) {
        return res.status(400).json({
          message: "Missing required fields",
          required: ["name", "hodTitle", "hodName", "email", "password"]
        });
      }

      // First check if email is already registered
      const existingDepartment = await storage.getDepartmentByEmail(email);
      if (existingDepartment) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Check if department with same name exists (case insensitive)
      const departments = await storage.getAllDepartments();
      const existingDeptByName = departments.find(
        dept => dept.name.toLowerCase() === name.toLowerCase()
      );

      if (existingDeptByName) {
        // Update the existing department with new credentials
        const updatedDepartment = await storage.updateDepartment(existingDeptByName.id, {
          hodTitle,
          hodName,
          email,
          password
        });
        return res.status(200).json(updatedDepartment);
      }

      // Create new department
      const department = await storage.createDepartment({
        name,
        hodTitle,
        hodName,
        email,
        password
      });


      res.status(201).json(department);
    } catch (error) {
      console.error('[POST /api/auth/register] Error:', error);
      // Send a proper error response
      res.status(400).json({
        message: "Failed to register department",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, turnstileToken } = req.body;
      const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '';

      // Check if account is locked
      const lockStatus = await isAccountLocked(email);
      if (lockStatus.locked) {
        const remainingMinutes = Math.ceil((lockStatus.remainingMs || 0) / 60000);
        return res.status(429).json({
          message: `Account locked. Try again in ${remainingMinutes} minutes.`,
          locked: true,
          remainingMinutes
        });
      }

      // Verify Turnstile CAPTCHA
      if (turnstileToken) {
        const isValidCaptcha = await verifyTurnstile(turnstileToken, clientIp);
        if (!isValidCaptcha) {
          return res.status(400).json({ message: "CAPTCHA verification failed. Please try again." });
        }
      } else if (process.env.TURNSTILE_SECRET_KEY) {
        return res.status(400).json({ message: "CAPTCHA verification required." });
      }

      const department = await storage.getDepartmentByEmail(email);

      if (!department) {
        const attemptResult = await recordFailedAttempt(email);
        if (attemptResult.locked) {
          return res.status(429).json({
            message: "Too many failed attempts. Account locked for 30 minutes.",
            locked: true,
            remainingMinutes: 30
          });
        }
        return res.status(401).json({
          message: `Invalid credentials. ${attemptResult.attemptsRemaining} attempts remaining.`,
          attemptsRemaining: attemptResult.attemptsRemaining
        });
      }

      // Make sure both passwords are strings
      const storedPassword = String(department.password);
      const providedPassword = String(password);

      if (storedPassword !== providedPassword) {
        const attemptResult = await recordFailedAttempt(email);
        if (attemptResult.locked) {
          return res.status(429).json({
            message: "Too many failed attempts. Account locked for 30 minutes.",
            locked: true,
            remainingMinutes: 30
          });
        }
        return res.status(401).json({
          message: `Invalid credentials. ${attemptResult.attemptsRemaining} attempts remaining.`,
          attemptsRemaining: attemptResult.attemptsRemaining
        });
      }

      // Clear failed attempts on successful login
      await clearLoginAttempts(email);

      // Update last login timestamp
      try {
        const { db } = await import("./db");
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`UPDATE departments SET last_login = NOW() WHERE id = ${department.id}`);
      } catch (err) {
        console.error('Failed to update lastLogin:', err);
      }

      // Return the department data
      res.json({
        success: true,
        department: {
          id: department.id,
          name: department.name,
          email: department.email,
          hodName: department.hodName,
          hodTitle: department.hodTitle
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Ensure uploads directory exists with proper permissions
  const uploadDir = path.join(__dirname, '../uploads');

  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    } else {
      // Check if directory is writable
      try {
        // Try to write a test file to verify permissions
        const testFile = path.join(uploadDir, '_test_write.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (err) {
        console.error("Upload directory exists but is not writable:", err);
      }
    }
  } catch (err) {
    console.error("Error checking/creating uploads directory:", err);
  }

  // Configure multer for file uploads
  const fileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const safeFileName = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
      cb(null, safeFileName);
    }
  });

  const upload = multer({
    storage: fileStorage,
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp'];


      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        console.error(`File rejected: ${file.originalname} (${file.mimetype}) - Invalid mimetype`);
        cb(null, false);
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });

  // Serve uploaded files statically with appropriate MIME types
  app.use('/uploads', (req, res, next) => {
    next();
  }, express.static(uploadDir));

  // Multi-file upload fields configuration
  const documentFields = [
    { name: 'panCardDoc', maxCount: 1 },
    { name: 'bankAccountDoc', maxCount: 1 },
    { name: 'aadharCardDoc', maxCount: 1 },
    { name: 'officeMemoDoc', maxCount: 1 },
    { name: 'joiningReportDoc', maxCount: 1 },
    { name: 'termExtensionDoc', maxCount: 1 }
  ];

  // Get all department names (for UI lists, etc.)
  app.get("/api/department-names", async (req, res) => {
    try {
      const names = await storage.getAllDepartmentNames();
      res.json(names);
    } catch (error) {
      console.error("Error fetching department names:", error);
      res.status(500).json({ message: "Failed to fetch department names" });
    }
  });

  // Get available departments (for registration dropdown)
  app.get("/api/departments", async (req, res) => {

    try {
      let departmentList: Array<{ id: number; name: string; code?: string | null; attendancePermitted?: boolean; employeeCount?: number; lastLogin?: Date | string | null }> = [];

      if (req.query.registeredOnly === 'true') {
        const registeredDepartments = await storage.getAllDepartments();
        const employeeCounts = await storage.getEmployeeCountsByDepartment();

        departmentList = registeredDepartments.map(dept => ({
          id: dept.id,
          name: dept.name,
          code: null,
          attendancePermitted: dept.attendancePermitted,
          allowSupplementaryReport: dept.allowSupplementaryReport,
          employeeCount: employeeCounts.get(dept.id) || 0,
          lastLogin: dept.lastLogin || null
        }));
      } else {
        // Simply fetch all departments from department_names table
        const allDepartmentNames = await storage.getAllDepartmentNames();
        departmentList = allDepartmentNames.map(deptName => ({
          id: deptName.id,
          name: deptName.name,
          code: deptName.code
        }));
      }

      // Log sample of results
      if (departmentList.length > 0) {
      }

      res.json(departmentList);

    } catch (error) {
      console.error('[GET /api/departments] Error:', error);
      res.status(500).json({
        message: "Failed to fetch departments",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Check if EPID exists
  app.get("/api/employees/check-epid", async (req, res) => {
    try {
      const epid = req.query.epid as string;
      if (!epid) {
        return res.json({ exists: false });
      }

      const employee = await storage.getEmployeeByEpid(epid);

      if (employee) {
        const department = await storage.getDepartment(employee.departmentId);
        return res.json({
          exists: true,
          employee: {
            name: employee.name,
            departmentName: department?.name || "Unknown Department"
          }
        });
      }

      return res.json({ exists: false });
    } catch (error) {
      console.error("Error checking EPID:", error);
      res.status(500).json({ message: "Failed to check EPID" });
    }
  });

  // Get employees for a department
  app.get("/api/departments/:departmentId/employees", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);

      // Verify department exists
      const department = await storage.getDepartment(departmentId);
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }

      const employees = await storage.getEmployeesByDepartment(departmentId);

      // Fetch app settings to check field visibility
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const settingsResult = await db.execute(sql`SELECT key, value FROM app_settings`);
      const settings: Record<string, string> = {};
      for (const row of settingsResult.rows) {
        settings[row.key as string] = row.value as string;
      }

      const showPan = settings.show_pan_field !== "false";
      const showBank = settings.show_bank_field !== "false";
      const showAadhar = settings.show_aadhar_field !== "false";

      // Transform the response to match the expected format and filter sensitive fields
      const transformedEmployees = employees.map(emp => ({
        ...emp,
        departmentName: department.name,
        // Filter sensitive fields if hidden in settings
        panNumber: showPan ? emp.panNumber : "",
        bankAccount: showBank ? emp.bankAccount : "",
        aadharCard: showAadhar ? emp.aadharCard : "",
        // Also mask the document URLs for hidden fields to be safe
        panCardUrl: showPan ? emp.panCardUrl : null,
        bankProofUrl: showBank ? emp.bankProofUrl : null,
        aadharCardUrl: showAadhar ? emp.aadharCardUrl : null
      }));

      res.json(transformedEmployees);
    } catch (error) {
      console.error('Error fetching department employees:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  // Create employee (department)
  app.post("/api/departments/:departmentId/employees", upload.fields(documentFields), async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);

      // Debug uploaded files in development mode
      if (process.env.NODE_ENV !== 'production') {
        if (req.files) {
          Object.entries(req.files as { [fieldname: string]: Express.Multer.File[] }).forEach(([key, files]) => {
            files.forEach(file => {
            });
          });
        }
      }

      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const employeeData = {
        ...req.body,
        departmentId,
        isActive: "active",
        // Preserve existing URLs if files aren't being updated
        panCardUrl: files?.panCardDoc ? `/uploads/${files.panCardDoc[0].filename}` : req.body.panCardUrl || null,
        bankProofUrl: files?.bankAccountDoc ? `/uploads/${files.bankAccountDoc[0].filename}` : req.body.bankProofUrl || null,
        aadharCardUrl: files?.aadharCardDoc ? `/uploads/${files.aadharCardDoc[0].filename}` : req.body.aadharCardUrl || null,
        officeMemoUrl: files?.officeMemoDoc ? `/uploads/${files.officeMemoDoc[0].filename}` : req.body.officeMemoUrl || null,
        joiningReportUrl: files?.joiningReportDoc ? `/uploads/${files.joiningReportDoc[0].filename}` : req.body.joiningReportUrl || null,
        termExtensionUrl: files?.termExtensionDoc ? `/uploads/${files.termExtensionDoc[0].filename}` : req.body.termExtensionUrl || null
      };

      // Log URLs in development mode
      if (process.env.NODE_ENV !== 'production') {
      }

      if (employeeData.epid) {
        const existingEmployee = await storage.getEmployeeByEpid(employeeData.epid);
        if (existingEmployee) {
          const dept = await storage.getDepartment(existingEmployee.departmentId);
          return res.status(400).json({
            message: `Duplicate EPID: This employee ID is already assigned to ${existingEmployee.name}, ${existingEmployee.designation || 'No Designation'}, ${dept?.name || 'Unknown Department'}`,
            details: 'Duplicate EPID'
          });
        }
      }

      const parsedData = insertEmployeeSchema.parse(employeeData);

      const employee = await storage.createEmployee(parsedData);
      res.status(201).json(employee);
    } catch (error) {
      console.error('Error creating employee:', error);
      if (error instanceof Error) {
        res.status(400).json({
          message: "Invalid employee data",
          details: error.message,
          stack: error.stack
        });
      } else {
        res.status(400).json({
          message: "Invalid employee data",
          details: String(error)
        });
      }
    }
  });

  // Update employee (admin)
  app.patch("/api/employees/:id", upload.fields(documentFields), async (req, res) => {
    try {
      const employeeId = Number(req.params.id);

      // Get current employee state for audit logging
      const currentEmployee = await storage.getEmployee(employeeId);
      if (!currentEmployee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const updates = {
        ...req.body,
        // Only update URLs if new files are uploaded
        ...(files?.panCardDoc && { panCardUrl: `/uploads/${files.panCardDoc[0].filename}` }),
        ...(files?.bankAccountDoc && { bankProofUrl: `/uploads/${files.bankAccountDoc[0].filename}` }),
        ...(files?.aadharCardDoc && { aadharCardUrl: `/uploads/${files.aadharCardDoc[0].filename}` }),
        ...(files?.officeMemoDoc && { officeMemoUrl: `/uploads/${files.officeMemoDoc[0].filename}` }),
        ...(files?.joiningReportDoc && { joiningReportUrl: `/uploads/${files.joiningReportDoc[0].filename}` }),
        ...(files?.termExtensionDoc && { termExtensionUrl: `/uploads/${files.termExtensionDoc[0].filename}` })
      };

      // Guard: Block department change if employee has attendance in current month
      // The form may send departments.id (edit-employee-form) or department_names.id (admin employees page)
      if (updates.departmentId) {
        const sentDeptId = Number(updates.departmentId);

        // If sent value equals current departments.id, department is NOT changing
        if (sentDeptId !== currentEmployee.departmentId) {
          // Could be a department_names.id — check if it resolves to the same department
          const currentDept = await storage.getDepartment(currentEmployee.departmentId);
          const deptNameResult = await db.execute(sql`
            SELECT dept_name FROM department_names WHERE id = ${sentDeptId} LIMIT 1
          `);

          let isDepartmentActuallyChanging = true;

          // If the sent ID is a department_names entry, compare names
          if (deptNameResult.rows.length > 0 && currentDept) {
            const sentDeptName = (deptNameResult.rows[0] as any).dept_name;
            if (sentDeptName === currentDept.name) {
              isDepartmentActuallyChanging = false; // Same department, different ID system
            }
          }

          if (isDepartmentActuallyChanging) {
            const attendanceCheck = await checkEmployeeAttendanceBlocksTransfer(storage, employeeId);
            if (attendanceCheck.blocked) {
              return res.status(400).json({ message: attendanceCheck.message });
            }

            // --- Auto-Cancel Transfer Request Logic ---
            // If the admin is forcing a department change, any pending transfer requests should be auto-cancelled
            const pendingRequest = await storage.getTransferRequestByEmployee(employeeId);
            if (pendingRequest) {
              const adminInitiator = ((req as any).user?.email) || "System Admin";
              const autoRemark = `Auto-cancelled by ${adminInitiator} because employee's department was changed manually via Admin Dashboard.`;

              await storage.updateTransferRequest(pendingRequest.id, {
                status: 'cancelled',
                remarks: pendingRequest.remarks ? `${pendingRequest.remarks}\n\n[ADMIN CANCELLED]: ${autoRemark}` : `[ADMIN CANCELLED]: ${autoRemark}`,
                processedAt: new Date()
              });

              // Clear the employee's badge flag
              updates.transferStatus = null;
            }
          }
        }
      }
      if (updates.epid && updates.epid !== currentEmployee.epid) {
        const existingEmployee = await storage.getEmployeeByEpid(updates.epid);
        if (existingEmployee && existingEmployee.id !== employeeId) {
          const dept = await storage.getDepartment(existingEmployee.departmentId);
          return res.status(400).json({
            message: `Duplicate EPID: This employee ID is already assigned to ${existingEmployee.name}, ${existingEmployee.designation || 'No Designation'}, ${dept?.name || 'Unknown Department'}`,
            details: 'Duplicate EPID'
          });
        }
      }

      const employee = await storage.updateEmployee(employeeId, updates);

      // Log changes
      // Attempt to get user info, default to generic admin if not present
      // Note: req.user is usually populated by auth middleware
      let user = (req as any).user;
      const session = (req as any).session;

      // Try to identify admin from x-session-token header (sent by client)
      const sessionToken = req.headers['x-session-token'];

      if (typeof sessionToken === 'string') {
      }

      if (!user && typeof sessionToken === 'string' && sessionToken) {
        try {
          const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');

          // Format is email:password (simple basic auth style used in this app)
          const parts = decoded.split(':');
          if (parts.length >= 2) {
            const email = parts[0];
            const password = parts.slice(1).join(':'); // Handle passwords with colons

            const admin = await storage.getAdminByEmail(email);
            if (admin) {
              if (admin.password === password) {
                user = {
                  email: admin.email,
                  role: admin.role, // Should be 'super_admin' or 'salary_admin'
                  name: admin.name
                };
              } else {
              }
            } else {
            }
          }
        } catch (e) {
          console.error('Token parsing failed', e);
        }
      }

      // Log changes only if NOT Super Admin (as requested)
      // Check for both 'super' and 'super_admin' (correct DB value)
      const role = user?.role || session?.admin?.role;

      if (role !== 'super' && role !== 'super_admin') {
        const changedBy = user?.email || session?.admin?.email || 'salary.fo@amu.ac.in';
        const changedByRole = role || 'salary_admin';

        await storage.logEmployeeChanges(
          employeeId,
          currentEmployee,
          updates,
          changedBy,
          changedByRole,
          undefined // No department ID for admin updates
        );
      }

      res.json(employee);
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(400).json({ message: "Invalid employee update" });
    }
  });

  // Add this new route for department employee updates
  app.patch("/api/departments/:departmentId/employees/:id", upload.fields(documentFields), async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const employeeId = Number(req.params.id);

      // Verify employee belongs to department
      const employee = await storage.getEmployee(employeeId);
      if (!employee || employee.departmentId !== departmentId) {
        return res.status(404).json({ message: "Employee not found in department" });
      }

      // Get department info for audit logging
      const department = await storage.getDepartment(departmentId);


      // Log files received (if any)
      if (req.files && Object.keys(req.files).length > 0) {
        const filesInfo = Object.entries(req.files as { [fieldname: string]: Express.Multer.File[] })
          .map(([key, files]) => {
            return `${key}: ${files.map(f => `${f.filename} (${f.size} bytes, ${f.mimetype})`).join(', ')}`;
          });
        filesInfo.forEach(info => console.log(`- ${info}`));
      } else {
      }

      // Log body data

      // Handle uploaded files exactly like admin route
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const updates: any = {
        ...req.body,
        // Only update URLs if new files are uploaded (same as admin side)
        ...(files?.panCardDoc && { panCardUrl: `/uploads/${files.panCardDoc[0].filename}` }),
        ...(files?.bankAccountDoc && { bankProofUrl: `/uploads/${files.bankAccountDoc[0].filename}` }),
        ...(files?.aadharCardDoc && { aadharCardUrl: `/uploads/${files.aadharCardDoc[0].filename}` }),
        ...(files?.officeMemoDoc && { officeMemoUrl: `/uploads/${files.officeMemoDoc[0].filename}` }),
        ...(files?.joiningReportDoc && { joiningReportUrl: `/uploads/${files.joiningReportDoc[0].filename}` }),
        ...(files?.termExtensionDoc && { termExtensionUrl: `/uploads/${files.termExtensionDoc[0].filename}` })
      };

      // Handle disable with reason and WEF date
      if (updates.isActive === 'disabled' && employee.isActive !== 'disabled') {
        // Validate disable reason and WEF date
        if (!updates.disableReason) {
          return res.status(400).json({ message: "Disable reason is required when disabling an employee" });
        }
        if (!updates.disableWefDate) {
          return res.status(400).json({ message: "With Effect From (WEF) date is required when disabling an employee" });
        }
        // Add disable metadata
        updates.disabledAt = new Date();
        updates.disabledBy = department?.email || 'unknown';
      }


      // Log changes before update (for audit trail)
      await storage.logEmployeeChanges(
        employeeId,
        employee,
        updates,
        department?.email || 'unknown',
        'department',
        departmentId
      );

      if (updates.epid && updates.epid !== employee.epid) {
        const existingEmployee = await storage.getEmployeeByEpid(updates.epid);
        if (existingEmployee && existingEmployee.id !== employeeId) {
          const dept = await storage.getDepartment(existingEmployee.departmentId);
          return res.status(400).json({
            message: `Duplicate EPID: This employee ID is already assigned to ${existingEmployee.name}, ${existingEmployee.designation || 'No Designation'}, ${dept?.name || 'Unknown Department'}`,
            details: 'Duplicate EPID'
          });
        }
      }

      const updatedEmployee = await storage.updateEmployee(employeeId, updates);
      res.json(updatedEmployee);
    } catch (error) {
      console.error('Error updating employee from department:', error);
      if (error instanceof Error) {
        res.status(400).json({
          message: "Invalid employee update",
          details: error.message,
          stack: error.stack
        });
      } else {
        res.status(400).json({
          message: "Invalid employee update",
          details: String(error)
        });
      }
    }
  });

  // Upload route (file upload handler) - with PDF compression using Ghostscript
  app.post("/api/upload", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }


      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://salarysection.com'
        : `http://localhost:${process.env.PORT || 5001}`;

      let finalFilename = req.file.filename;
      let finalFileUrl = `${baseUrl}/uploads/${finalFilename}`;

      // Compress PDF files using Ghostscript for aggressive compression
      if (req.file.mimetype === 'application/pdf') {
        const filePath = path.join(uploadDir, req.file.filename);
        const originalSize = fs.statSync(filePath).size;

        const compressedFilename = req.file.filename.replace(/\.pdf$/i, '-compressed.pdf');
        const compressedFilePath = path.join(uploadDir, compressedFilename);

        try {
          const { execSync } = await import('child_process');

          // Try Ghostscript compression
          // -dPDFSETTINGS=/ebook gives good compression for scanned documents
          // /screen = lowest quality, smallest size (72 dpi)
          // /ebook = medium quality (150 dpi) - good balance
          // /printer = high quality (300 dpi)
          const gsCommand = process.platform === 'win32'
            ? `gswin64c -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${compressedFilePath}" "${filePath}"`
            : `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${compressedFilePath}" "${filePath}"`;

          execSync(gsCommand, { timeout: 60000 }); // 60 second timeout

          // Check if compressed file was created and is smaller
          if (fs.existsSync(compressedFilePath)) {
            const compressedSize = fs.statSync(compressedFilePath).size;
            const reductionPercent = Math.round((1 - compressedSize / originalSize) * 100);


            if (compressedSize < originalSize * 0.95) { // Only use if at least 5% smaller
              // Delete original and use compressed
              fs.unlinkSync(filePath);
              finalFilename = compressedFilename;
              finalFileUrl = `${baseUrl}/uploads/${compressedFilename}`;
            } else {
              // Compressed file is not significantly smaller, delete it
              fs.unlinkSync(compressedFilePath);
            }
          }
        } catch (gsError: any) {

          // Fallback to pdf-lib basic compression
          try {
            const { PDFDocument } = await import('pdf-lib');
            const existingPdfBytes = fs.readFileSync(filePath);

            const pdfDoc = await PDFDocument.load(existingPdfBytes, {
              ignoreEncryption: true,
            });

            // Remove metadata
            pdfDoc.setTitle('');
            pdfDoc.setAuthor('');
            pdfDoc.setSubject('');
            pdfDoc.setKeywords([]);
            pdfDoc.setProducer('');
            pdfDoc.setCreator('');

            const compressedPdfBytes = await pdfDoc.save({
              useObjectStreams: true,
              addDefaultPage: false,
            });

            const compressedSize = compressedPdfBytes.length;
            const reductionPercent = Math.round((1 - compressedSize / originalSize) * 100);

            if (compressedSize < originalSize) {
              fs.writeFileSync(compressedFilePath, compressedPdfBytes);
              fs.unlinkSync(filePath);
              finalFilename = compressedFilename;
              finalFileUrl = `${baseUrl}/uploads/${compressedFilename}`;
            }
          } catch (pdfLibError) {
            console.error('pdf-lib compression also failed, keeping original:', pdfLibError);
          }
        }
      }

      res.json({ imageUrl: finalFileUrl, fileUrl: finalFileUrl });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Add endpoint to delete a file
  app.delete("/api/upload", async (req, res) => {
    try {

      const { imageUrl } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ message: "No file URL provided" });
      }


      // Extract the filename from the URL
      // Expected format: /uploads/filename.ext
      const urlParts = imageUrl.split('/');
      const filename = urlParts[urlParts.length - 1];

      if (!filename) {
        return res.status(400).json({ message: "Invalid file URL format" });
      }

      // Get the absolute path to the uploads directory
      const uploadDir = path.join(__dirname, '../uploads');

      // Build the absolute file path
      const filePath = path.join(uploadDir, filename);

      // Double check that the file path is within the uploads directory
      if (!filePath.startsWith(uploadDir)) {
        console.error(`Security issue: File path ${filePath} is outside upload directory ${uploadDir}`);
        return res.status(400).json({ message: "Invalid file path" });
      }


      // Check if file exists
      if (!fs.existsSync(filePath)) {
        // Still return success if file doesn't exist, as the end result is the same (no file)
        return res.status(200).json({ message: "File already removed or does not exist" });
      }


      try {
        // Delete the file
        fs.unlinkSync(filePath);

        // Verify the file was deleted
        const fileStillExists = fs.existsSync(filePath);
        if (fileStillExists) {
          console.error(`Failed to delete file: ${filePath} - File still exists after deletion attempt`);
          return res.status(500).json({ message: "Failed to delete file: File still exists after deletion attempt" });
        }


        // Ensure we're sending a proper JSON response
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json({ message: "File deleted successfully" });
      } catch (unlinkError) {
        // Handle specific unlink errors
        console.error(`Error when trying to delete file ${filePath}:`, unlinkError);
        return res.status(500).json({
          message: "Failed to delete file",
          error: String(unlinkError),
          details: "Error occurred during fs.unlinkSync operation"
        });
      }
    } catch (error) {
      console.error('Error in delete file route:', error);

      // Ensure we're sending a proper JSON response
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        message: "Failed to delete file",
        error: String(error)
      });
    }
  });

  // User management endpoints

  // Get all users
  // Constants for ID management
  const DEPARTMENT_ID_OFFSET = 10000;

  // Get all users
  app.get("/api/admin/users", async (req, res) => {
    try {
      // Fetch admins and departments from DB
      const [admins, departments] = await Promise.all([
        storage.getAllAdmins(),
        storage.getAllDepartments()
      ]);

      // Map admins to User format
      const adminUsers = admins.map(admin => ({
        id: admin.id,
        name: admin.name || "Admin",
        email: admin.email,
        role: admin.role,
        userCode: admin.userCode,
        departmentId: null,
        departmentName: null
      }));

      // Only include departments with valid emails
      const validDepartments = departments.filter(dept =>
        dept.email &&
        dept.email.trim() !== '' &&
        !dept.email.includes('unused_dept_') &&
        !dept.email.includes('@placeholder.com')
      );

      // Map departments to User format with ID offset
      const departmentUsers = validDepartments.map(dept => {
        return {
          id: dept.id + DEPARTMENT_ID_OFFSET,
          name: dept.hodName,
          email: dept.email,
          role: "department",
          departmentId: dept.id,
          departmentName: dept.name
        };
      });

      // Combine all users
      const allUsers = [...adminUsers, ...departmentUsers];

      res.json(allUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Create a new user
  app.post("/api/admin/users", async (req, res) => {
    try {
      const { name, email, password, role, departmentId, userCode } = req.body;


      // Validate required fields
      if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if email already exists in departments
      const existingDeptByEmail = await storage.getDepartmentByEmail(email);
      if (existingDeptByEmail) {
        return res.status(400).json({ message: "Email already in use by a department" });
      }

      // Check if email already exists in admins
      const existingAdminByEmail = await storage.getAdminByEmail(email);
      if (existingAdminByEmail) {
        return res.status(400).json({ message: "Email already in use by an admin" });
      }

      // For department role, associate with an existing department
      if (role === "department") {
        if (!departmentId) {
          return res.status(400).json({ message: "Department ID is required for department users" });
        }

        const selectedDeptNameId = Number(departmentId); // ID from department_names table
        if (isNaN(selectedDeptNameId)) {
          return res.status(400).json({ message: "Invalid department ID format" });
        }

        // Fetch details from department_names table using the ID from the dropdown
        const deptNameDetails = await storage.getDepartmentName(selectedDeptNameId);

        if (!deptNameDetails) {
          return res.status(404).json({ message: `Department details not found for ID ${selectedDeptNameId}. Cannot create user.` });
        }


        // Check if a department with this NAME is already registered in the 'departments' table
        // TODO: Make this lookup case-insensitive and trim whitespace if possible in storage layer
        const existingRegisteredDept = await storage.getDepartmentByName(deptNameDetails.name);

        if (existingRegisteredDept) {
          // If it exists and has a valid email (not placeholder), prevent creating another user for it.
          if (existingRegisteredDept.email && !existingRegisteredDept.email.includes('unused_dept_') && !existingRegisteredDept.email.includes('@placeholder.com')) {
            return res.status(409).json({ // 409 Conflict
              message: `Cannot create user: Department "${deptNameDetails.name}" is already associated with an active user (${existingRegisteredDept.email}).`
            });
          } else {
            // If it exists but has a placeholder email, update it (assign the new user)
            try {
              const updatedDepartment = await storage.updateDepartment(existingRegisteredDept.id, {
                hodName: name,
                email: email,
                password: password // Consider hashing
              });

              return res.status(200).json({ // 200 OK for update
                id: updatedDepartment.id + DEPARTMENT_ID_OFFSET,
                name: name,
                email: email,
                role: "department",
                departmentId: updatedDepartment.id, // The existing/updated department ID
                departmentName: updatedDepartment.name
              });
            } catch (updateError: any) {
              console.error(`Error updating existing department ${existingRegisteredDept.id} ("${deptNameDetails.name}"):`, updateError);
              return res.status(500).json({ message: "Failed to update existing department entry for the new user." });
            }
          }
        } else {
          // Department name not found in 'departments' table by name. Proceed to create new entry.
          try {
            // Create the new department entry
            const newDepartment = await storage.createDepartment({
              name: deptNameDetails.name, // Use name from department_names
              hodTitle: "Chairperson", // Default
              hodName: name,
              email: email,
              password: password // Consider hashing
            });

            return res.status(201).json({
              id: newDepartment.id + DEPARTMENT_ID_OFFSET,
              name: name,
              email: email,
              role: "department",
              departmentId: newDepartment.id, // The new ID from the 'departments' table
              departmentName: newDepartment.name
            });
          } catch (creationError: any) {
            console.error('Error creating new department entry:', creationError);
            // Handle potential duplicate key errors during creation (e.g., race condition or ID generation issue)
            if (creationError.code === '23505') {
              console.warn(`Attempted to create a duplicate department for: ${deptNameDetails.name}. Constraint: ${creationError.constraint}. Detail: ${creationError.detail}`);
              // Try to find the conflicting department again, perhaps it was created between the check and the insert attempt
              const conflictingDept = await storage.getDepartmentByName(deptNameDetails.name); // Or by ID if detail provides it
              if (conflictingDept) {
                return res.status(409).json({
                  message: `Failed to register user: A conflicting department entry for '${deptNameDetails.name}' (ID: ${conflictingDept.id}) was found after initial check. Please try again or contact support.`,
                  detail: `Conflict likely due to race condition or concurrent creation. Found existing ID: ${conflictingDept.id}`
                });
              } else {
                return res.status(409).json({ // 409 Conflict
                  message: `Failed to register user: A database conflict occurred while creating the department entry for '${deptNameDetails.name}'. Please check logs or contact support.`,
                  detail: creationError.detail // Include DB detail for debugging
                });
              }
            }
            // Original fallback error
            return res.status(500).json({ message: "Failed to register new department user due to database error during creation." });
          }
        }
      }

      // Handle other roles (superadmin, salary)
      if (role === "superadmin" || role === "salary") {
        let finalUserCode = null;

        if (role === "salary") {
          if (!userCode || !/^[A-Z]{3}$/.test(userCode)) {
            return res.status(400).json({ message: "Salary Admin requires a 3-letter uppercase User Code." });
          }
          finalUserCode = userCode;
        }

        const newAdmin = await storage.createAdmin({
          name,
          email,
          password,
          role,
          userCode: finalUserCode
        });

        return res.status(201).json({
          id: newAdmin.id,
          name: newAdmin.name,
          email: newAdmin.email,
          role: newAdmin.role,
          userCode: newAdmin.userCode,
          departmentId: null,
          departmentName: null
        });
      }

      // Fallback for unhandled roles or errors
      res.status(400).json({ message: "Invalid role or parameters for user creation." });

    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Update an existing user
  app.put("/api/admin/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { name, email, password, role, departmentId, userCode } = req.body;

      if (userId < DEPARTMENT_ID_OFFSET) {
        // Admin update
        const updates: any = { name, email, role };
        if (password && password.trim() !== '') updates.password = password;
        if (role === 'salary' && userCode) {
          if (!/^[A-Z]{3}$/.test(userCode)) {
            return res.status(400).json({ message: "Salary Admin requires a 3-letter uppercase User Code." });
          }
          updates.userCode = userCode;
        }

        const updatedAdmin = await storage.updateAdmin(userId, updates);
        return res.json({
          id: updatedAdmin.id,
          name: updatedAdmin.name,
          email: updatedAdmin.email,
          role: updatedAdmin.role,
          userCode: updatedAdmin.userCode,
          departmentId: null,
          departmentName: null
        });
      }

      // Department update
      const deptId = userId - DEPARTMENT_ID_OFFSET;
      const currentDepartment = await storage.getDepartment(deptId);

      if (!currentDepartment) {
        return res.status(404).json({ message: `User with ID ${userId} not found.` });
      }

      // Get the target department name from department_names
      const targetDeptNameId = Number(departmentId);
      if (isNaN(targetDeptNameId)) {
        return res.status(400).json({ message: "Invalid target department ID format." });
      }

      const targetDeptNameDetails = await storage.getDepartmentName(targetDeptNameId);
      if (!targetDeptNameDetails) {
        return res.status(404).json({ message: `Target department details not found for ID ${targetDeptNameId}.` });
      }

      // Check for email conflict with other departments
      if (email !== currentDepartment.email) {
        const existingUserWithEmail = await storage.getDepartmentByEmail(email);
        if (existingUserWithEmail && existingUserWithEmail.id !== currentDepartment.id) {
          return res.status(400).json({ message: `Email ${email} is already in use by department ${existingUserWithEmail.name}.` });
        }
      }

      // Update the current department with new details
      await storage.updateDepartment(currentDepartment.id, {
        name: targetDeptNameDetails.name, // Update the department name
        hodName: name,
        email: email,
        ...(password && password.trim() !== '' ? { password } : {})
      });

      return res.json({
        id: userId,
        name,
        email,
        role: "department",
        departmentId: currentDepartment.id,
        departmentName: targetDeptNameDetails.name
      });

    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Delete a user
  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      if (userId < DEPARTMENT_ID_OFFSET) {
        // Determine if safe to delete (e.g. don't delete self/superadmin??)
        // For now, allow deletion of admins from DB.
        await storage.deleteAdmin(userId);
        return res.json({ message: "Admin user deleted successfully", userId });
      }

      const deptId = userId - DEPARTMENT_ID_OFFSET;
      const departmentToDelete = await storage.getDepartment(deptId);

      if (!departmentToDelete) {
        return res.status(404).json({ message: "User not found" });
      }

      const deptName = departmentToDelete.name;

      // Check for associated employees before deleting
      const employees = await storage.getEmployeesByDepartment(deptId);
      if (employees.length > 0) {
        // Instead of deleting, clear the user-specific info (email, HOD, password)
        try {
          const placeholderEmail = `unused_dept_${deptId}_${Date.now()}@placeholder.com`;
          await storage.updateDepartment(deptId, {
            email: placeholderEmail,
            hodName: "(User Deleted)",
            password: uuid()
          });
          return res.json({
            message: `User (department ${deptId}) cannot be deleted due to associated employees. User info cleared.`,
            userId: userId,
            departmentId: deptId,
            departmentName: deptName
          });
        } catch (clearError) {
          console.error(`Error clearing user info for department ${deptId} during delete:`, clearError);
          return res.status(500).json({ message: "Failed to clear user info during deletion." });
        }
      } else {
        // No employees, safe to delete the department record
        await storage.deleteDepartment(deptId);
        return res.json({
          message: "User deleted successfully",
          userId: userId,
          departmentId: deptId,
          departmentName: deptName // Return the name before deletion
        });
      }

    } catch (error) {
      console.error('Error deleting user:', error);
      console.error('Error fetching department employees:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  // === New Endpoint: Create Department Name ===
  app.post("/api/admin/department-names", async (req, res) => {
    try {
      // Destructure the new optional field from the body
      const { dept_name, dept_code, dealingAssistantCode } = req.body;


      if (!dept_name || !dept_code) {
        return res.status(400).json({ message: "Department name and code are required" });
      }

      // Optional: Add validation for code format if needed

      // Check if department name or code already exists
      const existingByName = await storage.getDepartmentNameByName(dept_name);
      if (existingByName) {
        return res.status(409).json({ message: `Department name "${dept_name}" already exists.` });
      }
      const existingByCode = await storage.getDepartmentNameByCode(dept_code);
      if (existingByCode) {
        return res.status(409).json({ message: `Department code "${dept_code}" already exists.` });
      }

      // Re-introduce manual ID generation
      const maxIdResult = await storage.getMaxDepartmentNameId();
      const newId = (maxIdResult?.maxId || 0) + 1;

      // Create object with correct field names for Drizzle schema ('name', 'code')
      // AND include the manually generated ID and the optional dealingAssistantCode
      const newDepartmentData: InsertDepartmentName = {
        id: newId, // Add the calculated ID
        name: dept_name, // Map req.body.dept_name to schema field 'name'
        code: dept_code, // Map req.body.dept_code to schema field 'code'
        dealingAssistantCode: dealingAssistantCode || null // Map optional field, ensure it's null if undefined/empty
      };

      // Pass the correctly structured object
      const newDepartmentName = await storage.createDepartmentName(newDepartmentData);

      res.status(201).json(newDepartmentName);
    } catch (error) {
      console.error("Error creating department name:", error);
      if (error instanceof Error && error.message.includes("duplicate key value violates unique constraint")) {
        // Handle potential race conditions if ID generation isn't atomic
        res.status(409).json({ message: "Conflict creating department name, possibly duplicate ID or constraint violation." });
      } else {
        res.status(500).json({ message: "Failed to create department name" });
      }
    }
  });
  // === End: New Endpoint ===

  app.delete("/api/employees/:id", verifyAdminSession, async (req, res) => {
    await storage.deleteEmployee(Number(req.params.id));
    res.status(204).send();
  });

  // Attendance routes
  app.get("/api/departments/:departmentId/attendance", async (req, res) => {
    const departmentId = Number(req.params.departmentId);
    if (isNaN(departmentId)) {
      return res.status(400).json({ error: "Invalid department ID" });
    }
    const reports = await storage.getAttendanceReportsByDepartment(departmentId);
    res.json(reports);
  });

  // Get list of employee IDs that are already in a report for a specific month/year.
  // IMPORTANT: We check the actual attendance PERIOD DATES (inside the periods JSON),
  // NOT the report's submission month (ar.month/ar.year). This correctly handles the case
  // where a report was submitted IN month X but covered attendance periods from month Y
  // (e.g., submitted in May 2026 but covering March 2026 periods). Those employees
  // should NOT be hidden when creating a supplementary report for May 2026.
  app.get("/api/departments/:departmentId/attendance/reported-employees", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const month = Number(req.query.month);
      const year = Number(req.query.year);

      if (isNaN(departmentId) || isNaN(month) || isNaN(year)) {
        return res.status(400).json({ error: "Invalid parameters" });
      }

      console.log(`[PeriodOverlap] Fetching reported employees by period overlap: Dept=${departmentId}, ${month}/${year}`);

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      // Fetch all sent/submitted entries for this department (no month/year filter on report —
      // we will filter by actual period dates in JS below)
      const result = await db.execute(sql`
        SELECT ae.employee_id, ae.periods
        FROM attendance_entries ae
        JOIN attendance_reports ar ON ae.report_id = ar.id
        WHERE ar.department_id = ${departmentId}
          AND ar.status IN ('submitted', 'sent')
      `);

      // Target month date range (first and last day of the requested month)
      const targetMonthStart = new Date(year, month - 1, 1);
      const targetMonthEnd   = new Date(year, month, 0); // last day of month

      // Helper: parse DD-MM-YY → Date
      const parseDDMMYY = (dateStr: string): Date | null => {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const parts = dateStr.split('-').map(Number);
        if (parts.length !== 3) return null;
        const [d, m, y] = parts;
        return new Date(2000 + y, m - 1, d);
      };

      const reportedEmployeeIds = new Set<number>();

      for (const row of result.rows as any[]) {
        const empId = Number(row.employee_id);
        if (reportedEmployeeIds.has(empId)) continue; // already confirmed, skip

        let periods: any[] = [];
        try {
          periods = typeof row.periods === 'string' ? JSON.parse(row.periods) : (row.periods || []);
        } catch (e) {
          continue;
        }

        if (!Array.isArray(periods)) continue;

        for (const p of periods) {
          if (!p.fromDate || !p.toDate) continue;
          const periodStart = parseDDMMYY(p.fromDate);
          const periodEnd   = parseDDMMYY(p.toDate);
          if (!periodStart || !periodEnd) continue;

          // Check if this period overlaps with the target month
          if (periodStart <= targetMonthEnd && periodEnd >= targetMonthStart) {
            reportedEmployeeIds.add(empId);
            break; // no need to check more periods for this employee
          }
        }
      }

      const ids = [...reportedEmployeeIds];
      console.log(`[PeriodOverlap] Employees with periods overlapping ${month}/${year}: ${ids.length}`);
      res.json(ids);

    } catch (error: any) {
      console.error("[PeriodOverlap] Route Error:", error);
      res.status(500).json({
        message: "Failed to fetch reported employees",
        error: error.message
      });
    }
  });

  // Get list of all reported periods for all employees in a department to prevent overlaps.
  // IMPORTANT: This queries attendance from ALL departments for employees currently in this dept.
  // This ensures that if an employee was transferred, their previous dept's attendance is
  // also included in the overlap check — preventing the new dept from double-counting periods
  // that the previous dept already submitted/sent.
  app.get("/api/departments/:departmentId/attendance/reported-periods", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      if (isNaN(departmentId)) {
        return res.status(400).json({ error: "Invalid parameters" });
      }

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      // Fetch attendance entries for all employees currently in this department,
      // regardless of which department submitted the report (cross-department history).
      const result = await db.execute(sql`
        SELECT ae.employee_id, ae.periods, ar.id as report_id,
               ar.month, ar.year, d.name as department_name
        FROM attendance_entries ae
        JOIN attendance_reports ar ON ae.report_id = ar.id
        JOIN departments d ON ar.department_id = d.id
        JOIN employees e ON ae.employee_id = e.id
        WHERE e.department_id = ${departmentId}
          AND ar.status IN ('submitted', 'sent')
      `);

      // Construct a dictionary: employeeId -> Array<{ fromDate, toDate, reportId, departmentName, month, year }>
      const reportedPeriods: Record<number, Array<{
        fromDate: string,
        toDate: string,
        reportId: number,
        departmentName: string,
        month: number,
        year: number
      }>> = {};

      result.rows.forEach((row: any) => {
        const empId = row.employee_id;
        const reportId = row.report_id;
        const deptName = row.department_name || 'Unknown Department';
        const month = row.month;
        const year = row.year;
        let periods = [];
        try {
          periods = typeof row.periods === 'string' ? JSON.parse(row.periods) : row.periods;
        } catch (e) {
          console.error("Failed to parse periods for entry", row);
        }

        if (!reportedPeriods[empId]) {
          reportedPeriods[empId] = [];
        }

        if (Array.isArray(periods)) {
          periods.forEach((p: any) => {
            if (p.fromDate && p.toDate) {
              reportedPeriods[empId].push({
                fromDate: p.fromDate,
                toDate: p.toDate,
                reportId: reportId,
                departmentName: deptName,
                month: month,
                year: year
              });
            }
          });
        }
      });

      res.json(reportedPeriods);

    } catch (error: any) {
      console.error("[FullDebug] Reported Periods Route Error:", error);
      res.status(500).json({
        message: "Failed to fetch reported periods",
        error: error.message
      });
    }
  });


  app.post("/api/departments/:departmentId/attendance", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const reportData = insertAttendanceReportSchema.parse({
        ...req.body,
        departmentId
      });

      // Check if report already exists for this month/year
      const existingReports = await storage.getAttendanceReportsByDepartment(departmentId);
      const existingReport = existingReports.find(
        (r) => r.month === reportData.month && r.year === reportData.year && r.status !== 'cancelled'
      );

      const department = await storage.getDepartment(departmentId);

      if (existingReport) {
        // Check if supplementary report is allowed
        if (department?.allowSupplementaryReport) {

          // CRITICAL: Reset the flag to false immediately so they can't create another one
          const { db } = await import("./db");
          const { sql } = await import("drizzle-orm");
          await db.execute(sql`
             UPDATE departments 
             SET allow_supplementary_report = false
             WHERE id = ${departmentId}
           `);

          // If we are using MemStorage, update it there too
          if (department) {
            department.allowSupplementaryReport = false;
          }

        } else {
          return res.status(400).json({
            message: "A report for this month already exists. Please request cancellation/recall or ask Admin for supplementary report permission."
          });
        }
      }

      const report = await storage.createAttendanceReport(reportData);

      try {
        if (department?.email) {
          const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const emailResponse = await sendAttendanceNotification(
            department.email,
            department.name,
            'created',
            {
              reportId: report.id,
              monthName: monthNames[report.month],
              year: report.year,
              totalEmployees: (req.body as any).totalEmployees || 0
            }
          );
          return res.status(201).json({ ...report, emailStatus: emailResponse.success ? 'sent' : 'failed', emailError: emailResponse.error, emailMessage: emailResponse.message });
        }
      } catch (err) {
        console.error('Email error on create:', err);
      }

      res.status(201).json(report);
    } catch (error) {
      console.error("Error creating attendance report:", error);
      res.status(400).json({ message: "Invalid report data" });
    }
  });

  app.patch("/api/attendance/:id", async (req, res) => {
    try {
      // Create a safe copy of the request body
      const updates = { ...req.body };

      // Handle date fields properly for PostgreSQL
      if (updates.despatchDate && typeof updates.despatchDate === 'string') {
        updates.despatchDate = new Date(updates.despatchDate);
      }

      if (updates.receiptDate) {
        if (typeof updates.receiptDate === 'string') {
          updates.receiptDate = new Date(updates.receiptDate);
        } else if (updates.receiptDate instanceof Date) {
          // Keep it as is (already a Date object)
        } else {
          // If it's neither a string nor a Date, remove it to prevent errors
          delete updates.receiptDate;
        }
      }

      if (updates.status === 'submitted') {
        updates.finalizedAt = new Date();
        // Regenerate transaction ID on each submission to prevent old copy uploads
        updates.transactionId = uuid().slice(0, 8).toUpperCase();
      } else if (updates.status === 'draft') {
        updates.finalizedAt = null;
      }

      const report = await storage.updateAttendanceReport(Number(req.params.id), updates);

      try {
        if (updates.status === 'submitted' || updates.status === 'sent') {
          const department = await storage.getDepartment(report.departmentId);
          if (department?.email) {
            const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const type = updates.status === 'submitted' ? 'finalized' : 'sent';
            const emailResponse = await sendAttendanceNotification(
              department.email,
              department.name,
              type,
              {
                reportId: report.id,
                monthName: monthNames[report.month],
                year: report.year,
                transactionId: updates.status === 'sent' ? (updates.transactionId || report.transactionId) : null,
                despatchNo: updates.status === 'sent' ? (updates.despatchNo || report.despatchNo) : null
              }
            );
            return res.json({ ...report, emailStatus: emailResponse.success ? 'sent' : 'failed', emailError: emailResponse.error, emailMessage: emailResponse.message });
          }
        }
      } catch (err) {
        console.error('Email error on update:', err);
      }

      res.json(report);
    } catch (error) {
      console.error(error);
      res.status(400).json({ message: "Failed to update attendance report" });
    }
  });

  app.get("/api/attendance/:reportId/entries", async (req, res) => {
    const entries = await storage.getAttendanceEntriesByReport(Number(req.params.reportId));
    res.json(entries);
  });

  app.post("/api/attendance/:reportId/entries", async (req, res) => {
    try {
      const reportId = Number(req.params.reportId);
      const { employeeId, periods } = req.body;

      if (!periods || !Array.isArray(periods)) {
        return res.status(400).json({ message: "Invalid periods data" });
      }

      // Calculate total days and combine remarks
      const totalDays = periods.reduce((sum, period) => sum + (period.days || 0), 0);
      const remarks = periods.map(p => p.remarks).filter(Boolean).join("; ");

      // Get the first and last period dates
      const firstPeriod = periods[0];
      const lastPeriod = periods[periods.length - 1];

      // Log the received data for debugging

      // Get report to store departmentId on entry
      const report = await storage.getAttendanceReport(reportId);

      const entryData = insertAttendanceEntrySchema.parse({
        reportId: reportId,
        employeeId: Number(employeeId),
        departmentId: report?.departmentId || null,
        days: totalDays,
        fromDate: firstPeriod?.fromDate || "",
        toDate: lastPeriod?.toDate || "",
        periods: JSON.stringify(periods), // Store all periods as JSON string
        remarks: remarks || ""
      });

      const entry = await storage.createAttendanceEntry(entryData);
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating attendance entry:', error);
      res.status(400).json({ message: "Invalid entry data", error: String(error) });
    }
  });

  app.delete("/api/attendance/:reportId/entries", async (req, res) => {
    try {
      const reportId = Number(req.params.reportId);
      if (isNaN(reportId)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      await db.delete(attendanceEntries).where(eq(attendanceEntries.reportId, reportId));

      // Also clear from MemStorage if used (for consistency)
      // Note: We can't easily clear specific entries from MemStorage without an index or iteration
      // leaving it to DB for now as that's the source of truth for persistent data

      res.status(200).json({ message: "Entries cleared successfully" });
    } catch (error) {
      console.error("Error clearing attendance entries:", error);
      res.status(500).json({ message: "Failed to clear entries" });
    }
  });

  app.patch("/api/attendance/:reportId/entries/:entryId", async (req, res) => {
    try {
      const entry = await storage.updateAttendanceEntry(
        Number(req.params.entryId),
        { days: req.body.days, remarks: req.body.remarks }
      );
      res.json(entry);
    } catch (error) {
      res.status(400).json({ message: "Invalid entry update" });
    }
  });



  // Toggle verification status for attendance entry
  app.patch("/api/attendance/entries/:entryId/toggle-verify", verifyAdminSession, async (req, res) => {
    try {
      const entryId = Number(req.params.entryId);
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      // Toggle verified status
      const result = await db.execute(sql`
        UPDATE attendance_entries 
        SET verified = NOT verified 
        WHERE id = ${entryId}
        RETURNING *
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Entry not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error toggling verification:", error);
      res.status(500).json({ message: "Failed to toggle verification" });
    }
  });

  // Save admin noting for attendance entry (auto-save on blur)
  app.patch("/api/attendance/entries/:entryId/noting", verifyAdminSession, async (req, res) => {
    try {
      const entryId = Number(req.params.entryId);
      const { noting } = req.body;
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const result = await db.execute(sql`
        UPDATE attendance_entries 
        SET admin_noting = ${noting || null}
        WHERE id = ${entryId}
        RETURNING *
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Entry not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error saving admin noting:", error);
      res.status(500).json({ message: "Failed to save admin noting" });
    }
  });

  // Mark attendance entries as exported to Oracle
  app.post("/api/admin/attendance/mark-exported", verifyAdminSession, async (req, res) => {
    try {
      const { entryIds } = req.body;
      if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
        return res.status(400).json({ message: "entryIds array is required" });
      }

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const now = new Date();
      const result = await db.execute(sql`
        UPDATE attendance_entries 
        SET exported_to_oracle_at = ${now}
        WHERE id IN (${sql.join(entryIds.map((id: number) => sql`${id}`), sql`, `)})
        RETURNING id
      `);

      res.json({ exportedAt: now.toISOString(), count: result.rows.length });
    } catch (error) {
      console.error("Error marking entries as exported:", error);
      res.status(500).json({ message: "Failed to mark entries as exported" });
    }
  });

  // Get export status for a specific month (for button color + admin popup)
  app.get("/api/admin/attendance/export-status", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      let result;
      if (!isNaN(month) && !isNaN(year)) {
        result = await db.execute(sql`
          SELECT MAX(ae.exported_to_oracle_at) as latest_export_date,
                 COUNT(CASE WHEN ae.exported_to_oracle_at IS NOT NULL THEN 1 END)::int as exported_count
          FROM attendance_entries ae
          JOIN attendance_reports ar ON ae.report_id = ar.id
          WHERE ar.month = ${month} AND ar.year = ${year}
            AND ar.status IN ('sent', 'cancel_requested')
        `);
      } else {
        result = await db.execute(sql`
          SELECT MAX(ae.exported_to_oracle_at) as latest_export_date,
                 COUNT(CASE WHEN ae.exported_to_oracle_at IS NOT NULL THEN 1 END)::int as exported_count
          FROM attendance_entries ae
          JOIN attendance_reports ar ON ae.report_id = ar.id
          WHERE ar.status IN ('sent', 'cancel_requested')
        `);
      }

      const row = result.rows[0] as any;
      res.json({
        latestExportDate: row?.latest_export_date || null,
        exportedCount: row?.exported_count || 0
      });
    } catch (error) {
      console.error("Error fetching export status:", error);
      res.status(500).json({ message: "Failed to fetch export status" });
    }
  });

  // Super admin: update export date for a single entry
  app.patch("/api/admin/attendance/entry/:entryId/export-date", verifyAdminSession, async (req, res) => {
    try {
      const entryId = Number(req.params.entryId);
      const { exportDate } = req.body; // ISO string or null

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const dateValue = exportDate ? new Date(exportDate) : null;

      const result = await db.execute(sql`
        UPDATE attendance_entries 
        SET exported_to_oracle_at = ${dateValue}
        WHERE id = ${entryId}
        RETURNING id, exported_to_oracle_at
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Entry not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating export date:", error);
      res.status(500).json({ message: "Failed to update export date" });
    }
  });

  // Get distinct export dates (with counts) for a given month — used by Bulk Update dialog
  app.get("/api/admin/attendance/export-dates", verifyAdminSession, async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);

      if (isNaN(month) || isNaN(year)) {
        return res.status(400).json({ message: "month and year are required" });
      }

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const result = await db.execute(sql`
        SELECT
          DATE(ae.exported_to_oracle_at)::text AS export_date,
          COUNT(*)::int AS count
        FROM attendance_entries ae
        JOIN attendance_reports ar ON ae.report_id = ar.id
        WHERE ar.month = ${month} AND ar.year = ${year}
          AND ar.status IN ('sent', 'cancel_requested')
        GROUP BY DATE(ae.exported_to_oracle_at)
        ORDER BY export_date NULLS LAST
      `);

      // Map rows: null export_date means blank entries
      const rows = (result.rows as any[]).map(row => ({
        exportDate: row.export_date ?? null,   // "2026-05-13" or null
        count: row.count,
      }));

      res.json(rows);
    } catch (error) {
      console.error("Error fetching export dates:", error);
      res.status(500).json({ message: "Failed to fetch export dates" });
    }
  });

  // Bulk update exported_to_oracle_at for entries of a month, filtered by selected dates
  app.patch("/api/admin/attendance/bulk-export-date", verifyAdminSession, async (req, res) => {
    try {
      const { month, year, targetDates, newExportDate } = req.body;
      // targetDates: Array<string | null>  e.g. ["2026-05-13", null]
      // newExportDate: ISO string or null

      if (!month || !year || !Array.isArray(targetDates) || targetDates.length === 0) {
        return res.status(400).json({ message: "month, year, and targetDates array are required" });
      }

      // --- Nasir restriction: only today's date allowed ---
      const adminUser = (req as any).adminUser;
      const isNasirRequest = adminUser?.email === "nasir@amu.ac.in";
      if (isNasirRequest) {
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const invalidDates = targetDates.filter((d: string | null) => d !== null && d !== todayStr);
        const hasNull = targetDates.includes(null);
        if (invalidDates.length > 0 || hasNull) {
          return res.status(403).json({
            message: "You can only update entries exported on today's date."
          });
        }
      }

      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const newDateValue = newExportDate ? new Date(newExportDate) : null;

      // Split targetDates into non-null dates and whether null (blank) entries are included
      const specificDates = targetDates.filter((d: string | null) => d !== null) as string[];
      const includeNull = targetDates.includes(null);

      let result;

      if (specificDates.length > 0 && includeNull) {
        // Both specific dates AND null entries
        result = await db.execute(sql`
          UPDATE attendance_entries ae
          SET exported_to_oracle_at = ${newDateValue}
          FROM attendance_reports ar
          WHERE ae.report_id = ar.id
            AND ar.month = ${month} AND ar.year = ${year}
            AND ar.status IN ('sent', 'cancel_requested')
            AND (
              DATE(ae.exported_to_oracle_at)::text IN (${sql.join(specificDates.map((d: string) => sql`${d}`), sql`, `)})
              OR ae.exported_to_oracle_at IS NULL
            )
          RETURNING ae.id
        `);
      } else if (specificDates.length > 0) {
        // Only specific dates
        result = await db.execute(sql`
          UPDATE attendance_entries ae
          SET exported_to_oracle_at = ${newDateValue}
          FROM attendance_reports ar
          WHERE ae.report_id = ar.id
            AND ar.month = ${month} AND ar.year = ${year}
            AND ar.status IN ('sent', 'cancel_requested')
            AND DATE(ae.exported_to_oracle_at)::text IN (${sql.join(specificDates.map((d: string) => sql`${d}`), sql`, `)})
          RETURNING ae.id
        `);
      } else if (includeNull) {
        // Only blank entries
        result = await db.execute(sql`
          UPDATE attendance_entries ae
          SET exported_to_oracle_at = ${newDateValue}
          FROM attendance_reports ar
          WHERE ae.report_id = ar.id
            AND ar.month = ${month} AND ar.year = ${year}
            AND ar.status IN ('sent', 'cancel_requested')
            AND ae.exported_to_oracle_at IS NULL
          RETURNING ae.id
        `);
      } else {
        return res.status(400).json({ message: "No valid targetDates provided" });
      }

      res.json({
        updatedCount: result.rows.length,
        newExportDate: newDateValue ? newDateValue.toISOString() : null,
      });
    } catch (error) {
      console.error("Error in bulk export date update:", error);
      res.status(500).json({ message: "Failed to bulk update export dates" });
    }
  });

  // Update permanent remarks for an employee (from attendance reports page pin button)
  app.patch("/api/employees/:employeeId/remarks", verifyAdminSession, async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const { remarks } = req.body;
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const result = await db.execute(sql`
        UPDATE employees 
        SET remarks = ${remarks || null}
        WHERE id = ${employeeId}
        RETURNING id, remarks
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating employee remarks:", error);
      res.status(500).json({ message: "Failed to update employee remarks" });
    }
  });

  // App Settings - GET (available to all, needed by both admin and department forms)
  app.get("/api/admin/settings", async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(sql`SELECT key, value FROM app_settings`);
      const settings: Record<string, string> = {};
      for (const row of result.rows) {
        settings[row.key as string] = row.value as string;
      }
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  // App Settings - PATCH (update individual setting)
  app.patch("/api/admin/settings", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const { key, value } = req.body;

      if (!key || value === undefined) {
        return res.status(400).json({ message: "key and value are required" });
      }

      await db.execute(sql`
        UPDATE app_settings SET value = ${String(value)} WHERE key = ${key}
      `);

      // Return all settings
      const result = await db.execute(sql`SELECT key, value FROM app_settings`);
      const settings: Record<string, string> = {};
      for (const row of result.rows) {
        settings[row.key as string] = row.value as string;
      }
      res.json(settings);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // Get available attendance months for filter
  app.get("/api/admin/attendance/months", async (req, res) => {
    try {
      const months = await storage.getAvailableAttendanceMonths();
      res.json(months);
    } catch (error) {
      console.error("Error fetching available attendance months:", error);
      res.status(500).json({ message: "Failed to fetch available months" });
    }
  });

  // Admin reports route — OPTIMIZED: batch-load departments & employees
  app.get("/api/admin/attendance", async (req, res) => {
    try {
      const { month, year } = req.query;

      const reports = await storage.getAllAttendanceReports();

      // Filter reports by month/year BEFORE doing any heavy work
      let filteredReports = reports;

      if (month && year) {
        const monthNum = parseInt(month as string);
        const yearNum = parseInt(year as string);

        if (!isNaN(monthNum) && !isNaN(yearNum)) {
          filteredReports = reports.filter(r => r.month === monthNum && r.year === yearNum);
        }
      }

      // Sort by receipt date desc (newest first)
      filteredReports.sort((a, b) => {
        const dateA = new Date(a.receiptDate || 0).getTime();
        const dateB = new Date(b.receiptDate || 0).getTime();
        return dateB - dateA;
      });

      // BATCH LOAD: Fetch all departments and employees in bulk (2 queries instead of thousands)
      const [allDepartments, allEmployees, allDepartmentNames] = await Promise.all([
        storage.getAllDepartments(),
        storage.getAllEmployees(),
        storage.getAllDepartmentNames()
      ]);

      // Build lookup maps for O(1) access
      const departmentNameMap = new Map(allDepartmentNames.map(dn => [dn.name, dn]));

      const departmentMap = new Map(allDepartments.map(d => {
        // Find corresponding department name entry to get dealingAssistantCode
        const dn = departmentNameMap.get(d.name);
        return [d.id, { ...d, dealingAssistantCode: dn?.dealingAssistantCode }];
      }));

      const employeeMap = new Map(allEmployees.map(e => [e.id, e]));

      // Fetch entries for all "sent" reports in parallel (1 query per report, not per entry)
      const sentReports = filteredReports.filter(r => r.status === "sent");
      const entriesByReport = new Map<number, AttendanceEntry[]>();

      if (sentReports.length > 0) {
        const entriesArrays = await Promise.all(
          sentReports.map(r => storage.getAttendanceEntriesByReport(r.id))
        );
        sentReports.forEach((r, idx) => {
          entriesByReport.set(r.id, entriesArrays[idx]);
        });
      }

      // Count distinct employees per report for all filtered reports
      const reportIds = filteredReports.map(r => r.id);
      const countsByReport = new Map<number, number>();

      if (reportIds.length > 0) {
        const { db } = await import("./db");
        const { sql } = await import("drizzle-orm");
        try {
          const countResult = await db.execute(sql`
            SELECT report_id, COUNT(DISTINCT employee_id) as emp_count
            FROM attendance_entries
            WHERE report_id IN (${sql.join(reportIds, sql`, `)})
            GROUP BY report_id
          `);
          for (const row of countResult.rows as any[]) {
            countsByReport.set(row.report_id, Number(row.emp_count));
          }
        } catch (e) {
          console.error("Error fetching employee counts for reports:", e);
        }
      }

      // Assemble response using maps (no extra DB queries)
      const reportsWithDetails = filteredReports.map(report => {
        const department = departmentMap.get(report.departmentId);

        let entriesWithDetails: (AttendanceEntry & { employee?: Employee | undefined })[] = [];
        if (report.status === "sent") {
          const entries = entriesByReport.get(report.id) || [];
          entriesWithDetails = entries.map(entry => ({
            ...entry,
            employee: employeeMap.get(entry.employeeId),
          }));
        }

        return {
          ...report,
          department,
          entries: entriesWithDetails,
          employeeCount: countsByReport.get(report.id) || 0,
          receiptNo: report.receiptNo,
          receiptDate: report.receiptDate,
        };
      });

      res.json(reportsWithDetails);
    } catch (error) {
      console.error('Error fetching attendance reports with details:', error);
      res.status(500).json({ message: "Failed to fetch attendance reports with details" });
    }
  });

  // Department employee stats for admin dashboard — per department breakdown
  app.get("/api/admin/department-employee-stats", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);

      if (isNaN(month) || isNaN(year)) {
        return res.status(400).json({ message: "month and year are required" });
      }

      const allDepartments = await storage.getAllDepartments();

      // Count active vs disabled employees per department
      const employeeResult = await db.execute(sql`
        SELECT department_id, is_active, COUNT(*)::int as count
        FROM employees
        GROUP BY department_id, is_active
      `);

      // Find employees with attendance in submitted/sent reports for this month
      const reportedResult = await db.execute(sql`
        SELECT DISTINCT ae.employee_id, ar.department_id
        FROM attendance_entries ae
        JOIN attendance_reports ar ON ae.report_id = ar.id
        WHERE ar.month = ${month} AND ar.year = ${year}
          AND ar.status IN ('submitted', 'sent')
      `);

      // Build lookup maps
      const activeCountMap = new Map<number, number>();
      const disabledCountMap = new Map<number, number>();
      for (const row of employeeResult.rows as any[]) {
        if (row.is_active === 'active') {
          activeCountMap.set(row.department_id, row.count);
        } else {
          disabledCountMap.set(row.department_id, (disabledCountMap.get(row.department_id) || 0) + row.count);
        }
      }

      const reportedByDept = new Map<number, Set<number>>();
      for (const row of reportedResult.rows as any[]) {
        if (!reportedByDept.has(row.department_id)) {
          reportedByDept.set(row.department_id, new Set());
        }
        reportedByDept.get(row.department_id)!.add(row.employee_id);
      }

      const stats = allDepartments.map(dept => {
        const totalActive = activeCountMap.get(dept.id) || 0;
        const reported = reportedByDept.get(dept.id)?.size || 0;
        const missing = Math.max(0, totalActive - reported);
        const disabled = disabledCountMap.get(dept.id) || 0;
        return { departmentId: dept.id, totalActive, reported, missing, disabled };
      });

      res.json(stats);
    } catch (error) {
      console.error("Error fetching department employee stats:", error);
      res.status(500).json({ message: "Failed to fetch department employee stats" });
    }
  });

  // All missing employees across all departments for download
  app.get("/api/admin/all-missing-employees", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);

      if (isNaN(month) || isNaN(year)) {
        return res.status(400).json({ message: "month and year are required" });
      }

      const result = await db.execute(sql`
        SELECT e.id, e.epid, e.name, e.designation, e.employment_status, 
               e.term_expiry, e.salary_asstt, e.salary_register_no, e.is_active,
               d.name as department_name
        FROM employees e
        JOIN departments d ON d.id = e.department_id
        WHERE e.is_active = 'active'
          AND e.id NOT IN (
            SELECT DISTINCT ae.employee_id FROM attendance_entries ae
            JOIN attendance_reports ar ON ae.report_id = ar.id
            WHERE ar.month = ${month} AND ar.year = ${year}
              AND ar.status IN ('submitted', 'sent')
          )
        ORDER BY d.name, e.epid
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching all missing employees:", error);
      res.status(500).json({ message: "Failed to fetch all missing employees" });
    }
  });

  // Get ALL reported employee IDs for a specific month/year (Admin check)
  app.get("/api/admin/attendance/reported-employees", async (req, res) => {
    try {
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);

      if (isNaN(month) || isNaN(year)) {
        console.log("[FullDebug] Missing parameters:", req.query);
        return res.status(400).json({ message: "month and year are required" });
      }

      console.log(`[FullDebug] fetching reported employees for ${month}/${year}`);

      // Dynamic import to avoid top-level dependency issues if any
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      if (!db) {
        throw new Error("Database instance not found");
      }

      console.log("[FullDebug] Executing Query...");
      const result = await db.execute(sql`
        SELECT DISTINCT ae.employee_id
        FROM attendance_entries ae
        JOIN attendance_reports ar ON ae.report_id = ar.id
        WHERE ar.month = ${month} AND ar.year = ${year}
          AND ar.status IN ('submitted', 'sent')
      `);

      console.log(`[FullDebug] Query Success. Rows: ${result.rows.length}`);

      const ids = result.rows.map((row: any) => row.employee_id);
      res.json(ids);
    } catch (error: any) {
      console.error("[FullDebug] Route Error:", error);
      res.status(500).json({
        message: "Failed to fetch reported employees",
        error: error.message,
        stack: error.stack
      });
    }
  });

  // Department employees list for popup — filtered by category
  app.get("/api/admin/department-employees", async (req, res) => {
    try {
      const departmentId = parseInt(req.query.departmentId as string);
      const category = req.query.category as string;
      const month = parseInt(req.query.month as string);
      const year = parseInt(req.query.year as string);

      if (isNaN(departmentId) || !category) {
        return res.status(400).json({ message: "departmentId and category are required" });
      }

      let employees: any[] = [];

      if (category === 'active') {
        const result = await db.execute(sql`
          SELECT id, epid, name, designation, employment_status, term_expiry, 
                 salary_asstt, salary_register_no, is_active
          FROM employees WHERE department_id = ${departmentId} AND is_active = 'active'
          ORDER BY epid
        `);
        employees = result.rows;
      } else if (category === 'reported' && !isNaN(month) && !isNaN(year)) {
        const result = await db.execute(sql`
          SELECT e.id, e.epid, e.name, e.designation, e.employment_status, 
                 e.term_expiry, e.salary_asstt, e.salary_register_no, e.is_active,
                 COALESCE(SUM(ae.days), 0)::int as days_count
          FROM employees e
          JOIN attendance_entries ae ON ae.employee_id = e.id
          JOIN attendance_reports ar ON ae.report_id = ar.id
          WHERE ar.department_id = ${departmentId}
            AND ar.month = ${month} AND ar.year = ${year}
            AND ar.status IN ('submitted', 'sent')
          GROUP BY e.id, e.epid, e.name, e.designation, e.employment_status, 
                   e.term_expiry, e.salary_asstt, e.salary_register_no, e.is_active
          ORDER BY e.epid
        `);
        employees = result.rows;
      } else if (category === 'missing' && !isNaN(month) && !isNaN(year)) {
        const result = await db.execute(sql`
          SELECT e.id, e.epid, e.name, e.designation, e.employment_status, 
                 e.term_expiry, e.salary_asstt, e.salary_register_no, e.is_active
          FROM employees e
          WHERE e.department_id = ${departmentId} AND e.is_active = 'active'
            AND e.id NOT IN (
              SELECT DISTINCT ae.employee_id FROM attendance_entries ae
              JOIN attendance_reports ar ON ae.report_id = ar.id
              WHERE ar.department_id = ${departmentId}
                AND ar.month = ${month} AND ar.year = ${year}
                AND ar.status IN ('submitted', 'sent')
            )
          ORDER BY e.epid
        `);
        employees = result.rows;
      } else if (category === 'disabled') {
        const result = await db.execute(sql`
          SELECT id, epid, name, designation, employment_status, term_expiry, 
                 salary_asstt, salary_register_no, is_active
          FROM employees WHERE department_id = ${departmentId} AND is_active != 'active'
          ORDER BY epid
        `);
        employees = result.rows;
      }

      res.json(employees);
    } catch (error) {
      console.error("Error fetching department employees:", error);
      res.status(500).json({ message: "Failed to fetch department employees" });
    }
  });

  // Add receipt details to single report endpoint
  app.get("/api/admin/attendance/:id", async (req, res) => {
    try {
      const report = await storage.getAttendanceReport(Number(req.params.id));
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      const department = await storage.getDepartment(report.departmentId);
      const entries = await storage.getAttendanceEntriesByReport(report.id);

      // Fetch all employees referenced in this report's entries
      // This ensures we get employee details even if they transferred to another department later
      const employeeIds = [...new Set(entries.map(e => e.employeeId))];
      const employeesMap = new Map();

      await Promise.all(employeeIds.map(async (id) => {
        const emp = await storage.getEmployee(id);
        if (emp) {
          employeesMap.set(id, emp);
        }
      }));

      // Add employee details to entries
      const entriesWithEmployeeDetails = entries.map(entry => ({
        ...entry,
        employee: employeesMap.get(entry.employeeId)
      }));

      res.json({
        ...report,
        department,
        entries: entriesWithEmployeeDetails,
        // Ensure these fields are included
        receiptNo: report.receiptNo,
        receiptDate: report.receiptDate,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch report details" });
    }
  });

  // Delete attendance report (Admin only)
  app.delete("/api/attendance/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);

      const report = await storage.getAttendanceReport(id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      await storage.deleteAttendanceReport(id);

      if (report.fileUrl) {
        await storage.deleteFile(report.fileUrl);
      } else {
      }

      res.json({ message: "Report deleted successfully" });
    } catch (error) {
      console.error(`[DELETE /api/attendance/${req.params.id}] Error:`, error);
      res.status(500).json({ message: "Failed to delete report" });
    }
  });

  // Request cancellation (Department side)
  app.post("/api/attendance/:id/request-cancel", async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const report = await storage.getAttendanceReport(reportId);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (report.status !== 'sent') {
        return res.status(400).json({
          message: "Only sent reports can be cancelled. Current status: " + report.status
        });
      }

      const updatedReport = await storage.updateAttendanceReport(reportId, {
        status: 'cancel_requested',
        cancelRequestedAt: new Date()
      });

      try {
        const department = await storage.getDepartment(report.departmentId);
        if (department?.email) {
          const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const emailResponse = await sendAttendanceNotification(
            department.email,
            department.name,
            'cancel_requested',
            {
              reportId: report.id,
              monthName: monthNames[report.month],
              year: report.year,
              reason: req.body.reason || 'No reason provided'
            }
          );
          return res.json({ ...updatedReport, emailStatus: emailResponse.success ? 'sent' : 'failed', emailError: emailResponse.error, emailMessage: emailResponse.message });
        }
      } catch (err) {
        console.error('Email error on cancel request:', err);
      }

      res.json(updatedReport);
    } catch (error) {
      console.error('Error requesting cancellation:', error);
      res.status(500).json({ message: "Failed to request cancellation" });
    }
  });

  // Request Recall (Department side) - NEW
  app.post("/api/attendance/:id/request-recall", async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const report = await storage.getAttendanceReport(reportId);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (report.status !== 'submitted') {
        return res.status(400).json({
          message: "Only submitted reports can be recalled. Current status: " + report.status
        });
      }

      const updatedReport = await storage.updateAttendanceReport(reportId, {
        status: 'recall_requested',
        cancelRequestedAt: new Date() // Reusing field for timestamp
      });

      try {
        const department = await storage.getDepartment(report.departmentId);
        if (department?.email) {
          const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const emailResponse = await sendAttendanceNotification(
            department.email,
            department.name,
            'recall_requested',
            {
              reportId: report.id,
              monthName: monthNames[report.month],
              year: report.year,
              reason: req.body.reason || 'No reason provided'
            }
          );
          return res.json({ ...updatedReport, emailStatus: emailResponse.success ? 'sent' : 'failed', emailError: emailResponse.error, emailMessage: emailResponse.message });
        }
      } catch (err) {
        console.error('Email error on recall request:', err);
      }

      res.json(updatedReport);
    } catch (error) {
      console.error('Error requesting recall:', error);
      res.status(500).json({ message: "Failed to request recall" });
    }
  });

  // Revert to Draft (Admin side) - NEW
  app.post("/api/attendance/:id/revert-to-draft", async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const report = await storage.getAttendanceReport(reportId);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Allow reverting if recall_requested OR submitted (admin override)
      // User asked: "Admin us attendance report ko jo submitted status me hogi usko draft me change kar sake"
      if (report.status !== 'recall_requested' && report.status !== 'submitted') {
        return res.status(400).json({
          message: "Only submitted or recall-requested reports can be reverted to draft."
        });
      }

      const updatedReport = await storage.updateAttendanceReport(reportId, {
        status: 'draft',
        cancelRequestedAt: null // Clear the request timestamp
      });

      try {
        const department = await storage.getDepartment(report.departmentId);
        if (department?.email) {
          const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const emailResponse = await sendAttendanceNotification(
            department.email,
            department.name,
            'recall_approved',
            {
              reportId: report.id,
              monthName: monthNames[report.month],
              year: report.year
            },
            req.body.remarks
          );
          return res.json({ ...updatedReport, emailStatus: emailResponse.success ? 'sent' : 'failed', emailError: emailResponse.error, emailMessage: emailResponse.message });
        }
      } catch (err) {
        console.error('Email error on revert to draft:', err);
      }

      res.json(updatedReport);
    } catch (error) {
      console.error('Error reverting to draft:', error);
      res.status(500).json({ message: "Failed to revert to draft" });
    }
  });

  // Accept cancellation (Admin side)
  app.post("/api/attendance/:id/accept-cancel", verifyAdminSession, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const report = await storage.getAttendanceReport(reportId);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (report.status !== 'cancel_requested') {
        return res.status(400).json({
          message: "Only cancel_requested reports can be accepted. Current status: " + report.status
        });
      }

      // Delete all entries for this report (keep PDF and receipt info)
      await storage.deleteEntriesForReport(reportId);

      // Update status to cancelled
      const updatedReport = await storage.updateAttendanceReport(reportId, {
        status: 'cancelled',
        cancelledAt: new Date()
      });

      try {
        const department = await storage.getDepartment(report.departmentId);
        if (department?.email) {
          const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const emailResponse = await sendAttendanceNotification(
            department.email,
            department.name,
            'cancel_approved',
            {
              reportId: report.id,
              monthName: monthNames[report.month],
              year: report.year
            },
            req.body.remarks
          );
          return res.json({ ...updatedReport, emailStatus: emailResponse.success ? 'sent' : 'failed', emailError: emailResponse.error, emailMessage: emailResponse.message });
        }
      } catch (err) {
        console.error('Email error on accept cancel:', err);
      }

      res.json(updatedReport);
    } catch (error) {
      console.error('Error accepting cancellation:', error);
      res.status(500).json({ message: "Failed to accept cancellation" });
    }
  });


  // Get all employees (admin)
  app.get("/api/admin/employees", async (req, res) => {
    try {
      const employees = await storage.getAllEmployees();
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      // Get all departments to add department names
      const departments = await storage.getAllDepartments();
      const departmentMap = new Map(departments.map(d => [d.id, d]));

      // Fetch app settings to check field visibility
      const settingsResult = await db.execute(sql`SELECT key, value FROM app_settings`);
      const settings: Record<string, string> = {};
      for (const row of settingsResult.rows) {
        settings[row.key as string] = row.value as string;
      }

      const showPan = settings.show_pan_field !== "false";
      const showBank = settings.show_bank_field !== "false";
      const showAadhar = settings.show_aadhar_field !== "false";

      // Add department names to employees and filter sensitive fields
      const employeesWithDepartments = employees.map(emp => ({
        ...emp,
        departmentName: departmentMap.get(emp.departmentId)?.name || 'Unknown Department',
        // Filter sensitive fields if hidden in settings
        panNumber: showPan ? emp.panNumber : "",
        bankAccount: showBank ? emp.bankAccount : "",
        aadharCard: showAadhar ? emp.aadharCard : "",
        // Also mask the document URLs for hidden fields to be safe
        panCardUrl: showPan ? emp.panCardUrl : null,
        bankProofUrl: showBank ? emp.bankProofUrl : null,
        aadharCardUrl: showAadhar ? emp.aadharCardUrl : null
      }));

      res.json(employeesWithDepartments);
    } catch (error) {
      console.error('[GET /api/admin/employees] Error:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/departments/registered", async (req, res) => {
    try {
      const registeredDepartments = await storage.getAllDepartments();
      res.json(registeredDepartments);
    } catch (error) {
      console.error("Error fetching registered departments:", error);
      res.status(500).json({ error: "Failed to fetch registered departments" });
    }
  });

  // Create employee (admin)
  // Reorder employees
  app.patch("/api/admin/employees/reorder", async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Invalid updates format" });
      }

      await storage.reorderEmployees(updates);
      res.json({ message: "Employees reordered successfully" });
    } catch (error) {
      console.error("Error reordering employees:", error);
      res.status(500).json({ message: "Failed to reorder employees" });
    }
  });

  app.post("/api/admin/employees", verifyAdminSession, upload.fields(documentFields), async (req, res) => {
    try {

      // Parse departmentId from the request
      const departmentId = Number(req.body.departmentId);

      // Check if department ID exists in departments table
      let departmentExists = false;
      let actualDepartmentId = departmentId; // The ID to use for employee creation

      try {
        const department = await storage.getDepartment(departmentId);
        if (department) {
          departmentExists = true;
        } else {

          // Try to find the department in department_names table
          const departmentNameRecord = await storage.getDepartmentName(departmentId);

          if (departmentNameRecord) {

            // Create a placeholder entry in departments table
            try {
              const placeholderDepartment = await storage.createDepartment({
                name: departmentNameRecord.name,
                hodTitle: "Placeholder",
                hodName: "Placeholder",
                email: `placeholder_${departmentId}@placeholder.com`,
                password: "placeholder_password"
              });


              // Use the newly created department ID instead of the original one
              actualDepartmentId = placeholderDepartment.id;
              departmentExists = true;
            } catch (createDeptError) {
              console.error("Error creating placeholder department:", createDeptError);
              return res.status(500).json({
                message: "Failed to create required department",
                details: createDeptError instanceof Error ? createDeptError.message : String(createDeptError)
              });
            }
          } else {
            return res.status(400).json({
              message: "Invalid department ID",
              details: `Department ID ${departmentId} not found in department_names table`
            });
          }
        }
      } catch (error) {
        console.error("Error checking department:", error);
        return res.status(500).json({
          message: "Error checking department existence",
          details: error instanceof Error ? error.message : String(error)
        });
      }

      if (!departmentExists) {
        return res.status(400).json({
          message: "Invalid department ID",
          details: `Department ID ${departmentId} does not exist`
        });
      }

      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const employeeData = {
        ...req.body,
        departmentId: actualDepartmentId, // Use the department ID we determined above
        joiningDate: req.body.joiningDate || new Date().toISOString().split('T')[0],
        employmentStatus: req.body.employmentStatus || "Permanent",
        joiningShift: req.body.joiningShift || "FN",
        officeMemoNo: req.body.officeMemoNo || "",
        salaryRegisterNo: req.body.salaryRegisterNo || "",
        bankAccount: req.body.bankAccount || "",
        panNumber: req.body.panNumber || "",
        aadharCard: req.body.aadharCard || "",
        // Map file URLs from the uploaded files
        panCardUrl: files?.panCardDoc ? `/uploads/${files.panCardDoc[0].filename}` : req.body.panCardUrl || null,
        bankProofUrl: files?.bankAccountDoc ? `/uploads/${files.bankAccountDoc[0].filename}` : req.body.bankProofUrl || null,
        aadharCardUrl: files?.aadharCardDoc ? `/uploads/${files.aadharCardDoc[0].filename}` : req.body.aadharCardUrl || null,
        officeMemoUrl: files?.officeMemoDoc ? `/uploads/${files.officeMemoDoc[0].filename}` : req.body.officeMemoUrl || null,
        joiningReportUrl: files?.joiningReportDoc ? `/uploads/${files.joiningReportDoc[0].filename}` : req.body.joiningReportUrl || null,
        termExtensionUrl: files?.termExtensionDoc ? `/uploads/${files.termExtensionDoc[0].filename}` : req.body.termExtensionUrl || null,
      };

      if (employeeData.epid) {
        const existingEmployee = await storage.getEmployeeByEpid(employeeData.epid);
        if (existingEmployee) {
          const dept = await storage.getDepartment(existingEmployee.departmentId);
          return res.status(400).json({
            message: `Duplicate EPID: This employee ID is already assigned to ${existingEmployee.name}, ${existingEmployee.designation || 'No Designation'}, ${dept?.name || 'Unknown Department'}`,
            details: 'Duplicate EPID'
          });
        }
      }

      const parsedData = insertEmployeeSchema.parse(employeeData);

      try {
        const employee = await storage.createEmployee(parsedData);
        res.status(201).json(employee);
      } catch (createEmployeeError) {
        console.error("Error creating employee:", createEmployeeError);
        return res.status(400).json({
          message: "Failed to create employee in database",
          details: createEmployeeError instanceof Error ? createEmployeeError.message : String(createEmployeeError)
        });
      }
    } catch (error) {
      console.error('Error creating employee:', error);
      if (error instanceof Error) {
        res.status(400).json({
          message: "Invalid employee data",
          details: error.message,
          stack: error.stack
        });
      } else {
        res.status(400).json({
          message: "Invalid employee data",
          details: String(error)
        });
      }
    }
  });

  // Department profile update
  app.put("/api/departments/:id/profile", async (req, res) => {
    const departmentId = parseInt(req.params.id);
    const { name, email, hodName, hodTitle, password, currentPassword } = req.body;

    try {
      // Get current department data
      const department = await storage.getDepartment(departmentId);
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }

      // If updating password, verify current password
      if (password) {
        if (!currentPassword) {
          return res.status(400).json({ message: "Current password is required to update password" });
        }

        // Verify current password
        if (department.password !== currentPassword) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }
      }

      // Build update object
      const updates: Partial<Department> = {};
      if (name) updates.name = name;
      if (email) updates.email = email;
      if (hodName) updates.hodName = hodName;
      if (hodTitle) updates.hodTitle = hodTitle;
      if (password) updates.password = password;

      // Update department
      const updatedDepartment = await storage.updateDepartment(departmentId, updates);

      // Return updated department data (excluding sensitive info)
      const { password: _, ...safeData } = updatedDepartment;

      return res.json(safeData);
    } catch (error) {
      console.error("Department profile update error:", error);
      return res.status(500).json({ message: "Failed to update department profile" });
    }
  });

  // Document API Routes
  const uploadDestination = path.join(__dirname, "../uploads");

  // Ensure upload directory exists
  if (!fs.existsSync(uploadDestination)) {
    fs.mkdirSync(uploadDestination, { recursive: true });
  }

  // Configure multer for document uploads - use memory storage instead of disk storage
  // to avoid saving the original file to disk
  const documentUpload = multer({
    storage: multer.memoryStorage(), // Store file in memory instead of disk
    fileFilter: (req, file, cb) => {
      // Accept only specific image types
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];


      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        console.error(`Document file rejected: ${file.originalname} (${file.mimetype}) - Invalid mimetype`);
        cb(null, false);
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });

  // Get all documents
  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      res.json(documents);
    } catch (error) {
      console.error("Error fetching all documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });  // Get department-specific documents
  app.get("/api/departments/:departmentId/documents", async (req, res) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      const documents = await storage.getDocumentsByDepartment(departmentId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching department documents:", error);
      res.status(500).json({ message: "Failed to fetch department documents" });
    }
  });

  // Search documents
  app.get("/api/documents/search", async (req, res) => {
    try {
      const searchTerm = req.query.term as string;
      if (!searchTerm) {
        return res.status(400).json({ message: "Search term is required" });
      }

      const documents = await storage.searchDocuments(searchTerm);
      res.json(documents);
    } catch (error) {
      console.error("Error searching documents:", error);
      res.status(500).json({ message: "Failed to search documents" });
    }
  });

  // Upload new document
  app.post("/api/documents", documentUpload.single('documentImage'), async (req: any, res) => {
    try {
      const { documentType, issuingAuthority, subject, refNo, date, departmentId, departmentName } = req.body;

      if (!req.file || !documentType || !issuingAuthority || !subject || !refNo || !date) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check for duplicates
      const existingDoc = await storage.getDocumentByRefNoAndDate(refNo, date);
      if (existingDoc) {
        return res.status(409).json({
          message: "A document with the same Ref. No. and Date already exists"
        });
      }

      // Get department info from the request body first, then fall back to session if available
      let deptId = departmentId !== undefined ? parseInt(departmentId) : undefined;
      let deptName = departmentName || undefined;

      // If not in request body, try to get from session
      if ((deptId === undefined || deptId === null) && req.session?.department) {
        deptId = req.session.department.id;
        deptName = deptName || req.session.department.name;
      }

      // Allow admin uploads (departmentId = 0) with proper department name
      // For admin uploads, departmentId will be 0 and departmentName will be set
      if ((deptId === undefined || deptId === null) || !deptName) {
        return res.status(401).json({ message: "Unauthorized: Department information missing" });
      }

      // Generate a unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileExt = req.file.originalname.split('.').pop();
      const filename = `document-${uniqueSuffix}.${fileExt}`;

      // Set paths for the compressed file
      const compressedFilename = `${filename.replace(`.${fileExt}`, '')}-compressed.${fileExt === 'png' ? 'jpeg' : fileExt}`;
      const compressedFilePath = path.join(uploadDestination, compressedFilename);

      try {
        // Import sharp for image processing
        const sharp = await import('sharp');

        // Process the in-memory buffer directly and save compressed version to disk
        await sharp.default(req.file.buffer)
          .resize({
            width: 800,
            height: 800,
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 70 })
          .toFile(compressedFilePath);


        // Create file URL using the compressed file
        const baseUrl = process.env.NODE_ENV === 'production'
          ? 'https://salarysection.com'
          : `http://localhost:${process.env.PORT || 5001}`;

        const imageUrl = `${baseUrl}/uploads/${compressedFilename}`;

        // Save document to database
        const newDocument = await storage.createDocument({
          documentType,
          issuingAuthority,
          subject,
          refNo,
          date,
          imageUrl,
          departmentId: deptId,
          departmentName: deptName
        });

        res.status(201).json(newDocument);
      } catch (compressError) {
        console.error("Error processing image:", compressError);
        res.status(500).json({ message: "Failed to process document image" });
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      // Get document first to get the imageUrl
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Delete the physical file from uploads folder
      if (document.imageUrl) {
        await storage.deleteFile(document.imageUrl);
      }

      // Delete from database
      await storage.deleteDocument(id);

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Update document metadata
  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { documentType, issuingAuthority, subject, refNo, date } = req.body;

      const updatedDocument = await storage.updateDocument(id, {
        documentType,
        issuingAuthority,
        subject,
        refNo,
        date,
      });

      res.json(updatedDocument);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });



  // ========== ATTENDANCE PERMISSION ROUTES (Super Admin Only) ==========

  // Toggle attendance permission for all departments (global toggle)
  app.patch("/api/admin/attendance-toggle-all", async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }

      // Update all departments
      await storage.updateAllDepartmentsAttendancePermission(enabled);
      res.json({ success: true, enabled });
    } catch (error) {
      console.error("Error toggling global attendance:", error);
      res.status(500).json({ message: "Failed to toggle attendance permission" });
    }
  });

  // Toggle attendance permission for a specific department
  app.patch("/api/departments/:id/attendance-permit", async (req, res) => {
    try {
      const deptId = Number(req.params.id);
      const { permitted } = req.body;

      if (typeof permitted !== 'boolean') {
        return res.status(400).json({ message: "permitted must be a boolean" });
      }

      const updated = await storage.updateDepartmentAttendancePermission(deptId, permitted);
      res.json(updated);
    } catch (error) {
      console.error("Error updating department permission:", error);
      res.status(500).json({ message: "Failed to update permission" });
    }
  });

  // Toggle supplementary report permission
  app.patch("/api/departments/:id/supplementary-permit", async (req, res) => {
    try {
      const deptId = Number(req.params.id);
      const { allowed } = req.body;

      if (typeof allowed !== 'boolean') {
        return res.status(400).json({ message: "allowed must be a boolean" });
      }

      // Update the supplementary permission
      // We use the storage method which handles both DB update and cache/state sync
      await storage.updateDepartmentSupplementaryPermission(deptId, allowed);

      res.json({ success: true, allowed });
    } catch (error) {
      console.error("Error updating supplementary permission:", error);
      res.status(500).json({ message: "Failed to update supplementary permission" });
    }
  });

  // Get attendance permission status for current department
  app.get("/api/departments/:id/attendance-status", async (req, res) => {
    try {
      const deptId = Number(req.params.id);
      const department = await storage.getDepartment(deptId);

      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }

      // Calculate deadline info
      const now = new Date();
      const deadlineDay = 15;
      const currentDay = now.getDate();
      const daysRemaining = deadlineDay - currentDay;
      const isPastDeadline = currentDay > deadlineDay;

      res.json({
        permitted: department.attendancePermitted,
        allowSupplementaryReport: department.allowSupplementaryReport,
        deadlineDay,
        daysRemaining: isPastDeadline ? 0 : daysRemaining,
        isPastDeadline
      });
    } catch (error) {
      console.error("Error getting attendance status:", error);
      res.status(500).json({ message: "Failed to get attendance status" });
    }
  });

  // ========== TICKET ROUTES ==========

  // Configure multer for ticket screenshots
  const ticketUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  // Get ticket stats (for admin dashboard)
  app.get("/api/tickets/stats", async (req, res) => {
    try {
      const stats = await storage.getTicketStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting ticket stats:", error);
      res.status(500).json({ message: "Failed to get ticket stats" });
    }
  });

  // Get all tickets (admin)
  app.get("/api/admin/tickets", async (req, res) => {
    try {
      const tickets = await storage.getAllTickets();
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching all tickets:", error);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // Get tickets by department
  app.get("/api/departments/:departmentId/tickets", async (req, res) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      const tickets = await storage.getTicketsByDepartment(departmentId);
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching department tickets:", error);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // Get single ticket with replies
  app.get("/api/tickets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ticket = await storage.getTicket(id);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }
      // We now use adminResponse column instead of separate replies table
      res.json({ ...ticket, replies: [] });
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

  // Create ticket (department side)
  app.post("/api/tickets", ticketUpload.single('screenshot'), async (req: any, res) => {
    try {
      const { departmentId, subject, description, priority } = req.body;

      if (!departmentId || !subject || !description) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      let imageUrl = null;

      // Process screenshot if provided
      if (req.file) {
        try {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const compressedFilename = `ticket-${uniqueSuffix}-compressed.jpeg`;
          const compressedFilePath = path.join(uploadDestination, compressedFilename);

          const sharp = await import('sharp');
          await sharp.default(req.file.buffer)
            .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toFile(compressedFilePath);

          const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://salarysection.com'
            : `http://localhost:${process.env.PORT || 5001}`;

          imageUrl = `${baseUrl}/uploads/${compressedFilename}`;
        } catch (imgError) {
          console.error("Error processing screenshot:", imgError);
        }
      }

      const ticket = await storage.createTicket({
        departmentId: parseInt(departmentId),
        subject,
        description,
        priority: priority || 'medium',
        status: 'Open',
        imageUrl,
      });

      res.status(201).json(ticket);
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ message: "Failed to create ticket" });
    }
  });

  // Update ticket status (admin)
  app.patch("/api/tickets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, priority } = req.body;

      const updates: any = {};
      if (status) {
        updates.status = status;
        if (status === 'resolved') updates.resolvedAt = new Date();
        if (status === 'closed') updates.closedAt = new Date();
      }
      if (priority) updates.priority = priority;

      const ticket = await storage.updateTicket(id, updates);
      res.json(ticket);
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  // Add admin response to ticket (uses admin_response column)
  app.post("/api/tickets/:id/replies", async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Update ticket with admin response
      const updatedTicket = await storage.updateTicket(ticketId, {
        adminResponse: message,
        status: 'In Progress',
      });

      res.status(201).json(updatedTicket);
    } catch (error) {
      console.error("Error adding response:", error);
      res.status(500).json({ message: "Failed to add response" });
    }
  });

  // Delete ticket (admin only)
  app.delete("/api/tickets/:id", verifyAdminSession, async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      // Get ticket to delete screenshot if exists
      const ticket = await storage.getTicket(id);
      if (ticket?.imageUrl) {
        await storage.deleteFile(ticket.imageUrl);
      }

      await storage.deleteTicket(id);
      res.json({ message: "Ticket deleted successfully" });
    } catch (error) {
      console.error("Error deleting ticket:", error);
      res.status(500).json({ message: "Failed to delete ticket" });
    }
  });

  // ========== NOTICE SYSTEM ROUTES ==========

  // Create notice (admin only) - with image compression
  app.post("/api/notices", upload.single("image"), async (req: any, res) => {
    try {
      const { subject, message, isGlobal, createdBy, departmentIds } = req.body;

      if (!subject || !message || !createdBy) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      let imageUrl = null;
      if (req.file) {
        const baseUrl = process.env.NODE_ENV === 'production'
          ? 'https://salarysection.com'
          : `http://localhost:${process.env.PORT || 5001}`;

        // Compress image if it's an image file
        if (req.file.mimetype.startsWith('image/')) {
          try {
            const sharp = await import('sharp');
            const originalPath = path.join(uploadDir, req.file.filename);
            const compressedFilename = `notice-${Date.now()}-compressed.jpeg`;
            const compressedPath = path.join(uploadDir, compressedFilename);

            await sharp.default(originalPath)
              .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true,
              })
              .jpeg({ quality: 70 })
              .toFile(compressedPath);

            // Delete original and use compressed
            fs.unlinkSync(originalPath);
            imageUrl = `${baseUrl}/uploads/${compressedFilename}`;
          } catch (compressError) {
            console.error("Image compression failed, using original:", compressError);
            imageUrl = `${baseUrl}/uploads/${req.file.filename}`;
          }
        } else {
          imageUrl = `${baseUrl}/uploads/${req.file.filename}`;
        }
      }

      const notice = await storage.createNotice({
        subject,
        message,
        imageUrl,
        isGlobal: isGlobal === 'true' || isGlobal === true,
        createdBy,
        departmentIds: departmentIds ? JSON.parse(departmentIds) : [],
      });

      // Send emails if the checkbox was checked
      if (req.body.sendEmail === 'true') {
        const sendEmailsAsync = async () => {
          try {
            const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
            let targetDepartments: any[] = [];

            if (isGlobal === 'true' || isGlobal === true) {
              // Get all permitted departments that have valid emails
              targetDepartments = await db.query.departments.findMany({
                where: and(isNotNull(departments.email), sql`TRIM(${departments.email}) != ''`)
              });
            } else if (departmentIds) {
              const ids = JSON.parse(departmentIds);
              if (ids.length > 0) {
                targetDepartments = await db.query.departments.findMany({
                  where: and(sql`id = ANY(${ids})`, isNotNull(departments.email), sql`TRIM(${departments.email}) != ''`)
                });
              }
            }

            for (const dept of targetDepartments) {
              if (dept.email && dept.email.includes('@')) {
                await sendNoticeEmail(dept.email, dept.name, {
                  subject: notice.subject,
                  message: notice.message,
                  imageUrl: notice.imageUrl || null,
                  createdBy: notice.createdBy
                });
                await delay(2000); // 2-sec wait for rate limiting
              }
            }
          } catch (e) {
            console.error("Failed to asynchronously send notice bulk emails", e);
          }
        };

        // Fire and forget (don't await) to instantly return HTTP 201
        sendEmailsAsync();
      }

      res.status(201).json(notice);
    } catch (error) {
      console.error("Error creating notice:", error);
      res.status(500).json({ message: "Failed to create notice" });
    }
  });

  // Get all notices (admin)
  app.get("/api/notices", async (req, res) => {
    try {
      const notices = await storage.getAllNotices();
      res.json(notices);
    } catch (error) {
      console.error("Error fetching notices:", error);
      res.status(500).json({ message: "Failed to fetch notices" });
    }
  });

  // Get notices for a department
  app.get("/api/departments/:departmentId/notices", async (req, res) => {
    try {
      const departmentId = parseInt(req.params.departmentId);
      const notices = await storage.getNoticesForDepartment(departmentId);
      res.json(notices);
    } catch (error) {
      console.error("Error fetching department notices:", error);
      res.status(500).json({ message: "Failed to fetch notices" });
    }
  });

  // Get single notice
  app.get("/api/notices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const notice = await storage.getNotice(id);
      if (!notice) {
        return res.status(404).json({ message: "Notice not found" });
      }
      res.json(notice);
    } catch (error) {
      console.error("Error fetching notice:", error);
      res.status(500).json({ message: "Failed to fetch notice" });
    }
  });

  // Delete notice (admin only) - also deletes image file
  app.delete("/api/notices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      // Get notice first to get image URL
      const notice = await storage.getNotice(id);

      // Delete image file if exists
      if (notice?.image_url) {
        try {
          const urlParts = notice.image_url.split('/');
          const filename = urlParts[urlParts.length - 1];
          const filePath = path.join(uploadDir, filename);

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error("Error deleting notice image file:", fileError);
        }
      }

      await storage.deleteNotice(id);
      res.json({ message: "Notice deleted successfully" });
    } catch (error) {
      console.error("Error deleting notice:", error);
      res.status(500).json({ message: "Failed to delete notice" });
    }
  });

  // ========== TRANSFER REQUEST ENDPOINTS ==========

  // Create transfer request
  app.post("/api/departments/:departmentId/employees/:employeeId/transfer", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const employeeId = Number(req.params.employeeId);
      const { toDepartmentId, orderNumber, orderDate, relievingDate, remarks } = req.body;

      // Validate required fields
      if (!toDepartmentId || !orderNumber || !orderDate || !relievingDate) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Verify employee belongs to department
      const employee = await storage.getEmployee(employeeId);
      if (!employee || employee.departmentId !== departmentId) {
        return res.status(404).json({ message: "Employee not found in department" });
      }

      // Check if employee already has pending transfer
      const existingRequest = await storage.getTransferRequestByEmployee(employeeId);
      if (existingRequest) {
        return res.status(400).json({ message: "Employee already has a pending transfer request" });
      }

      // Guard: Block transfer if employee has FULL month attendance in current month
      const attendanceCheck = await checkEmployeeAttendanceBlocksTransfer(storage, employeeId);
      if (attendanceCheck.blocked) {
        return res.status(400).json({ message: attendanceCheck.message });
      }

      // Get department info for HOD signature
      const fromDepartment = await storage.getDepartment(departmentId);
      const hodSignature = `HOD, ${fromDepartment?.name || 'Unknown Department'}`;

      // Create default remarks if not provided
      const defaultRemarks = `He/She was present till his/her relieving i.e. ${relievingDate}`;
      const fullRemarks = remarks ? `${remarks}\n\n${defaultRemarks}` : defaultRemarks;

      // Create transfer request
      const transferRequest = await storage.createTransferRequest({
        employeeId,
        fromDepartmentId: departmentId,
        toDepartmentId: Number(toDepartmentId),
        orderNumber,
        orderDate,
        relievingDate,
        remarks: fullRemarks,
        hodSignature,
        status: 'pending'
      });

      // Update employee transfer status
      await storage.updateEmployee(employeeId, { transferStatus: 'pending' });

      // Get target department name for logging
      const toDepartment = await storage.getDepartment(Number(toDepartmentId));

      // Log the transfer request in history
      await storage.logEmployeeChange(
        employeeId,
        'transfer',
        'transferStatus',
        `Transfer initiated: ${fromDepartment?.name || 'Unknown'} → ${toDepartment?.name || 'Unknown'}`,
        fromDepartment?.email || 'unknown',
        'department',
        departmentId
      );

      res.status(201).json(transferRequest);
    } catch (error) {
      console.error("Error creating transfer request:", error);
      res.status(500).json({ message: "Failed to create transfer request" });
    }
  });

  // Get pending transfer request count for a department (for dashboard card)
  app.get("/api/departments/:departmentId/transfer-requests/count", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const count = await storage.getPendingTransferCount(departmentId);
      res.json({ count });
    } catch (error) {
      console.error("Error getting transfer count:", error);
      res.status(500).json({ message: "Failed to get transfer count" });
    }
  });

  // Get incoming transfer requests for a department
  app.get("/api/departments/:departmentId/transfer-requests/incoming", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const requests = await storage.getTransferRequestsForDepartment(departmentId, 'incoming');

      // Filter for only pending requests
      const pendingRequests = requests.filter(req => req.status === 'pending');

      // Enrich with employee and department names
      const enrichedRequests = await Promise.all(pendingRequests.map(async (req) => {
        const employee = await storage.getEmployee(req.employeeId);
        const fromDept = await storage.getDepartment(req.fromDepartmentId);
        const toDept = await storage.getDepartment(req.toDepartmentId);
        return {
          ...req,
          employeeName: employee?.name || 'Unknown',
          employeeEpid: employee?.epid || 'Unknown',
          fromDepartmentName: fromDept?.name || 'Unknown',
          toDepartmentName: toDept?.name || 'Unknown'
        };
      }));

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error fetching incoming transfer requests:", error);
      res.status(500).json({ message: "Failed to fetch transfer requests" });
    }
  });

  // Get outgoing transfer requests for a department
  app.get("/api/departments/:departmentId/transfer-requests/outgoing", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const requests = await storage.getTransferRequestsForDepartment(departmentId, 'outgoing');

      // Enrich with employee and department names
      const enrichedRequests = await Promise.all(requests.map(async (req) => {
        const employee = await storage.getEmployee(req.employeeId);
        const fromDept = await storage.getDepartment(req.fromDepartmentId);
        const toDept = await storage.getDepartment(req.toDepartmentId);
        return {
          ...req,
          employeeName: employee?.name || 'Unknown',
          employeeEpid: employee?.epid || 'Unknown',
          fromDepartmentName: fromDept?.name || 'Unknown',
          toDepartmentName: toDept?.name || 'Unknown'
        };
      }));

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error fetching outgoing transfer requests:", error);
      res.status(500).json({ message: "Failed to fetch transfer requests" });
    }
  });

  // Accept transfer request
  app.post("/api/departments/:departmentId/transfer-requests/:requestId/accept", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const requestId = Number(req.params.requestId);

      // Get transfer request
      const request = await storage.getTransferRequest(requestId);
      if (!request || request.toDepartmentId !== departmentId) {
        return res.status(404).json({ message: "Transfer request not found" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ message: "Transfer request is no longer pending" });
      }

      // Guard: Block transfer acceptance if employee has FULL month attendance in current month
      const attendanceCheck = await checkEmployeeAttendanceBlocksTransfer(storage, request.employeeId);
      if (attendanceCheck.blocked) {
        return res.status(400).json({ message: attendanceCheck.message });
      }

      // Get department info
      const toDepartment = await storage.getDepartment(departmentId);

      // Update employee's department
      await storage.updateEmployee(request.employeeId, {
        departmentId: departmentId,
        transferStatus: null
      });

      // Update transfer request status
      await storage.updateTransferRequest(requestId, {
        status: 'accepted',
        processedAt: new Date()
      });

      // Get from department info for logging
      const fromDepartment = await storage.getDepartment(request.fromDepartmentId);

      // Log in history
      await storage.logEmployeeChange(
        request.employeeId,
        'transfer',
        'departmentId',
        `Transfer completed: ${fromDepartment?.name || 'Unknown'} → ${toDepartment?.name || 'Unknown'}`,
        toDepartment?.email || 'unknown',
        'department',
        departmentId
      );

      res.json({ message: "Transfer accepted successfully" });
    } catch (error) {
      console.error("Error accepting transfer:", error);
      res.status(500).json({ message: "Failed to accept transfer" });
    }
  });

  // Get outbound transfer requests (initiated by this department OR request releases from others)
  app.get("/api/departments/:departmentId/transfer-requests/outgoing", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const requests = await storage.getTransferRequestsForDepartment(departmentId, 'outgoing');

      // Enrich with employee and department names
      const enrichedRequests = await Promise.all(requests.map(async (req) => {
        const employee = await storage.getEmployee(req.employeeId);
        const toDept = await storage.getDepartment(req.toDepartmentId);
        return {
          ...req,
          employeeName: employee?.name || 'Unknown',
          employeeEpid: employee?.epid || 'Unknown',
          toDepartmentName: toDept?.name || 'Unknown' // For outgoing, we want to know where it's going
        };
      }));

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error fetching outgoing transfer requests:", error);
      res.status(500).json({ message: "Failed to fetch outgoing requests" });
    }
  });

  // Reject transfer request
  app.post("/api/departments/:departmentId/transfer-requests/:requestId/reject", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const requestId = Number(req.params.requestId);
      const { rejectionRemarks } = req.body;

      if (!rejectionRemarks) {
        return res.status(400).json({ message: "Rejection remarks are required" });
      }

      // Get transfer request
      const request = await storage.getTransferRequest(requestId);

      // Authorize: either receiver (standard) or sender (release request) can reject
      if (!request || (request.toDepartmentId !== departmentId && request.fromDepartmentId !== departmentId)) {
        return res.status(404).json({ message: "Transfer request not found or unauthorized" });
      }

      if (request.status !== 'pending' && request.status !== 'release_requested') {
        return res.status(400).json({ message: "Transfer request is no longer pending" });
      }

      // Get department info for rejection signature
      const toDepartment = await storage.getDepartment(departmentId);
      const rejectedBy = `HOD, ${toDepartment?.name || 'Unknown Department'}`;

      // Update employee transfer status (allow retry)
      await storage.updateEmployee(request.employeeId, {
        transferStatus: null
      });

      // Update transfer request status
      await storage.updateTransferRequest(requestId, {
        status: 'rejected',
        rejectionRemarks: `${rejectionRemarks}\n\n${rejectedBy}`,
        rejectedBy,
        processedAt: new Date()
      });

      // Log the rejection in history
      await storage.logEmployeeChange(
        request.employeeId,
        'transfer',
        'transferStatus',
        `Transfer rejected: ${toDepartment?.name || 'Unknown'} (Reason: ${rejectionRemarks})`,
        toDepartment?.email || 'unknown',
        'department',
        departmentId
      );

      res.json({ message: "Transfer rejected successfully" });
    } catch (error) {
      console.error("Error rejecting transfer:", error);
      res.status(500).json({ message: "Failed to reject transfer" });
    }
  });

  // Get employee's pending transfer request (for edit form status display)
  app.get("/api/employees/:employeeId/transfer-request", async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const request = await storage.getTransferRequestByEmployee(employeeId);

      if (request) {
        const toDept = await storage.getDepartment(request.toDepartmentId);
        res.json({
          ...request,
          toDepartmentName: toDept?.name || 'Unknown'
        });
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error("Error fetching employee transfer request:", error);
      res.status(500).json({ message: "Failed to fetch transfer request" });
    }
  });

  // Get employee's latest REJECTED transfer request (for displaying logic)
  app.get("/api/employees/:employeeId/latest-rejected-transfer", async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      // Fetch the absolute LAST request (regardless of status)
      const request = await storage.getLastTransferRequest(employeeId);

      // Only return it if it is REJECTED. 
      // If the latest one is Pending or Accepted, we should NOT show the previous rejection.
      if (request && request.status === 'rejected') {
        const toDept = await storage.getDepartment(request.toDepartmentId);
        res.json({
          ...request,
          toDepartmentName: toDept?.name || 'Unknown'
        });
      } else {
        res.json(null);
      }
    } catch (error) {
      console.error("Error fetching rejected transfer request:", error);
      res.status(500).json({ message: "Failed to fetch rejected request" });
    }
  });

  // ========== ADMIN TRANSFER ROUTES ==========

  // Get global transfer stats (for dashboard card)
  app.get("/api/admin/transfer-stats", async (req, res) => {
    try {
      const stats = await storage.getGlobalTransferStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching transfer stats:", error);
      res.status(500).json({ message: "Failed to fetch transfer stats" });
    }
  });

  // Get all transfer requests (for admin detail view)
  app.get("/api/admin/transfer-requests", async (req, res) => {
    try {
      const requests = await storage.getAllTransferRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching all transfer requests:", error);
      res.status(500).json({ message: "Failed to fetch transfer requests" });
    }
  });

  // ========== GLOBAL SEARCH & RELEASE REQUEST ==========

  // Global Search
  app.get("/api/employees/global-search", async (req: any, res) => {
    try {
      const query = req.query.query as string;
      const deptId = req.session?.department?.id; // Assuming session is populated

      if (!query || query.length < 2) {
        return res.json([]);
      }

      // If no session department (e.g. testing), exclude 0 or handle error
      const excludeDeptId = deptId || 0;

      const results = await storage.searchEmployeesGlobal(query, excludeDeptId);

      // Fetch app settings to check field visibility
      try {
        const { db } = await import("./db");
        const { sql } = await import("drizzle-orm");
        const settingsResult = await db.execute(sql`SELECT key, value FROM app_settings`);
        const settings: Record<string, string> = {};
        for (const row of settingsResult.rows) {
          settings[row.key as string] = row.value as string;
        }

        const showPan = settings.show_pan_field !== "false";
        const showBank = settings.show_bank_field !== "false";
        const showAadhar = settings.show_aadhar_field !== "false";

        // Filter sensitive fields
        const filteredResults = results.map(emp => ({
          ...emp,
          panNumber: showPan ? emp.panNumber : "",
          bankAccount: showBank ? emp.bankAccount : "",
          aadharCard: showAadhar ? emp.aadharCard : "",
          panCardUrl: showPan ? emp.panCardUrl : null,
          bankProofUrl: showBank ? emp.bankProofUrl : null,
          aadharCardUrl: showAadhar ? emp.aadharCardUrl : null
        }));

        res.json(filteredResults);
      } catch (err) {
        console.error("Error filtering search results:", err);
        // Fallback to sending results if settings fail, or send empty? 
        // Safer to return results as is if DB fails, or empty. 
        // Let's return results with fields masked to be safe on error
        const safeResults = results.map(emp => ({
          ...emp,
          panNumber: "",
          bankAccount: "",
          aadharCard: ""
        }));
        res.json(safeResults);
      }
    } catch (error) {
      console.error("Error in global search:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // Request Release (Pull Request)
  app.post("/api/departments/:departmentId/transfer-requests/request-release", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId); // Requester (To Dept)
      const { targetEmployeeId, remarks } = req.body;

      if (!targetEmployeeId) {
        return res.status(400).json({ message: "Target employee ID required" });
      }

      const employee = await storage.getEmployee(targetEmployeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      if (employee.departmentId === departmentId) {
        return res.status(400).json({ message: "Employee is already in your department" });
      }

      const fromDepartment = await storage.getDepartment(employee.departmentId);
      const toDepartment = await storage.getDepartment(departmentId);

      // Check if Inactive (Disabled) -> Auto Transfer
      if (employee.isActive === 'disabled') {
        // Auto Transfer Logic

        // Update Employee
        await storage.updateEmployee(employee.id, {
          departmentId: departmentId,
          transferStatus: null // Clear any status
        });

        // Create Accepted Request Record
        const transferRequest = await storage.createTransferRequest({
          employeeId: employee.id,
          fromDepartmentId: employee.departmentId,
          toDepartmentId: departmentId,
          orderNumber: "AUTO-RELEASE",
          orderDate: new Date().toISOString(),
          relievingDate: new Date().toISOString(),
          remarks: `Auto-release (Inactive Employee) requested by ${toDepartment?.name}. \nRemarks: ${remarks || 'None'}`,
          hodSignature: "System Auto-Process",
          status: 'accepted',
          processedAt: new Date()
        });

        // Log History
        await storage.logEmployeeChange(
          employee.id,
          'transfer',
          'departmentId',
          `Auto-Transfer (Inactive Pull): ${fromDepartment?.name} → ${toDepartment?.name}`,
          toDepartment?.email || 'unknown',
          'department',
          departmentId
        );

        return res.json({ message: "Employee auto-transferred successfully (Inactive)", transferred: true });

      } else {
        // Active Employee -> Create Release Request (pending approval from sender)

        // Check for existing pending requests
        const existingRequest = await storage.getTransferRequestByEmployee(employee.id);
        if (existingRequest) {
          return res.status(400).json({ message: "Employee already has a pending transfer/release request" });
        }

        const transferRequest = await storage.createTransferRequest({
          employeeId: employee.id,
          fromDepartmentId: employee.departmentId, // Current Owner
          toDepartmentId: departmentId,            // Requester
          orderNumber: null, // Unknown yet
          orderDate: null,
          relievingDate: null,
          remarks: `Release Requested by ${toDepartment?.name}. \nRemarks: ${remarks || 'None'}`,
          hodSignature: `Pending Approval from ${fromDepartment?.name}`,
          status: 'release_requested', // NEW STATUS
        });

        await storage.updateEmployee(employee.id, {
          transferStatus: 'pending' // UI shows pending icon
        });

        // Log Request
        await storage.logEmployeeChange(
          employee.id,
          'transfer_request',
          'transferStatus',
          `Release Requested by ${toDepartment?.name}`,
          toDepartment?.email || 'unknown',
          'department',
          departmentId
        );

        return res.json({ message: "Release request sent to current department", transferred: false });
      }

    } catch (error) {
      console.error("Error requesting release:", error);
      res.status(500).json({ message: "Failed to request release" });
    }
  });

  // Approve Release (Sender approves the release request)
  app.post("/api/departments/:departmentId/transfer-requests/:requestId/approve-release", async (req, res) => {
    try {
      const departmentId = Number(req.params.departmentId); // Existing Owner (From Dept)
      const requestId = Number(req.params.requestId);
      const { orderNumber, orderDate, relievingDate, remarks } = req.body;

      // REMOVED required check for order details as per user request
      // if (!orderNumber || !orderDate || !relievingDate) { ... }

      const request = await storage.getTransferRequest(requestId);
      if (!request || request.fromDepartmentId !== departmentId) {
        return res.status(404).json({ message: "Release request not found or unauthorized" });
      }

      if (request.status !== 'release_requested') {
        return res.status(400).json({ message: "Request is not in 'release_requested' state" });
      }

      // Guard: Block release approval if employee has FULL month attendance in current month
      const attendanceCheck = await checkEmployeeAttendanceBlocksTransfer(storage, request.employeeId);
      if (attendanceCheck.blocked) {
        return res.status(400).json({ message: attendanceCheck.message });
      }

      // Execute Transfer
      const toDepartment = await storage.getDepartment(request.toDepartmentId);

      // Update Employee
      await storage.updateEmployee(request.employeeId, {
        departmentId: request.toDepartmentId,
        transferStatus: null
      });

      // Update Request
      await storage.updateTransferRequest(requestId, {
        status: 'accepted',
        orderNumber,
        orderDate, // Assuming string ISO
        relievingDate,
        remarks: `${request.remarks}\n\nApproved Remarks: ${remarks || ''}`,
        processedAt: new Date()
      });

      // Log
      const fromDepartment = await storage.getDepartment(departmentId);

      await storage.logEmployeeChange(
        request.employeeId,
        'transfer',
        'departmentId',
        `Release Approved: ${fromDepartment?.name} → ${toDepartment?.name}`,
        fromDepartment?.email || 'unknown',
        'department',
        departmentId
      );

      res.json({ message: "Release request approved and transfer completed" });

    } catch (error) {
      console.error("Error approving release:", error);
      res.status(500).json({ message: "Failed to approve release" });
    }
  });

  // Get employee history (for admin or department)
  app.get("/api/employees/:employeeId/history", async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const history = await storage.getEmployeeHistory(employeeId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching employee history:", error);
      res.status(500).json({ message: "Failed to fetch employee history" });
    }
  });

  // ============ Useful Downloads ============

  // Admin: Get all useful downloads
  app.get("/api/admin/downloads", verifyAdminSession, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { usefulDownloads } = await import("../shared/schema");
      const { desc } = await import("drizzle-orm");

      const downloads = await db.select().from(usefulDownloads).orderBy(desc(usefulDownloads.createdAt));
      res.json(downloads);
    } catch (error) {
      console.error("Error fetching downloads:", error);
      res.status(500).json({ message: "Failed to fetch downloads" });
    }
  });

  // Admin: Add new useful download
  app.post("/api/admin/downloads", verifyAdminSession, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
    try {
      const { title, description, externalLink } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      let fileUrl = null;
      let thumbnailUrl = null;

      if (files?.file?.[0]) {
        fileUrl = `/uploads/${files.file[0].filename}`;
      }

      if (files?.thumbnail?.[0]) {
        thumbnailUrl = `/uploads/${files.thumbnail[0].filename}`;
      }

      if (!fileUrl && !externalLink) {
        return res.status(400).json({ message: "Either a file upload or an external link is required" });
      }

      const { db } = await import("./db");
      const { usefulDownloads } = await import("../shared/schema");

      const [newDownload] = await db.insert(usefulDownloads).values({
        title,
        description: description || null,
        fileUrl,
        externalLink: externalLink || null,
        thumbnailUrl
      }).returning();

      res.json(newDownload);
    } catch (error) {
      console.error("Error creating download:", error);
      res.status(500).json({ message: "Failed to create download", error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    }
  });

  // Admin: Update useful download
  app.patch("/api/admin/downloads/:id", verifyAdminSession, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, externalLink, removeFile, removeThumbnail } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      const { db } = await import("./db");
      const { usefulDownloads } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const [existing] = await db.select().from(usefulDownloads).where(eq(usefulDownloads.id, parseInt(id)));
      if (!existing) {
        return res.status(404).json({ message: "Download not found" });
      }

      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description || null;
      if (externalLink !== undefined) updates.externalLink = externalLink || null;

      if (removeFile === 'true') {
        updates.fileUrl = null;
      } else if (files?.file?.[0]) {
        updates.fileUrl = `/uploads/${files.file[0].filename}`;
        if (updates.externalLink !== undefined && updates.externalLink !== null) {
          // If they update both file and link, that's fine, we allow both or override.
          // By default, let's just save what they send.
        }
      }

      if (removeThumbnail === 'true') {
        updates.thumbnailUrl = null;
      } else if (files?.thumbnail?.[0]) {
        updates.thumbnailUrl = `/uploads/${files.thumbnail[0].filename}`;
      }

      const [updatedDownload] = await db.update(usefulDownloads)
        .set(updates)
        .where(eq(usefulDownloads.id, parseInt(id)))
        .returning();

      res.json(updatedDownload);
    } catch (error) {
      console.error("Error updating download:", error);
      res.status(500).json({ message: "Failed to update download" });
    }
  });

  // Admin: Delete useful download
  app.delete("/api/admin/downloads/:id", verifyAdminSession, async (req, res) => {
    try {
      const { id } = req.params;
      const { db } = await import("./db");
      const { usefulDownloads } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const [download] = await db.select().from(usefulDownloads).where(eq(usefulDownloads.id, parseInt(id)));
      if (!download) {
        return res.status(404).json({ message: "Download not found" });
      }

      // Cleanup files from storage before deleting the record
      const fs = await import("fs");
      const path = await import("path");

      const deleteFile = (url: string | null) => {
        if (!url) return;
        try {
          const filename = url.split('/').pop();
          if (filename) {
            const filePath = path.join(process.cwd(), 'uploads', filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`Deleted file: ${filePath}`);
            }
          }
        } catch (e) {
          console.error(`Failed to delete file from ${url}:`, e);
        }
      };

      deleteFile(download.fileUrl);
      deleteFile(download.thumbnailUrl);

      await db.delete(usefulDownloads).where(eq(usefulDownloads.id, parseInt(id)));
      res.json({ message: "Download deleted successfully" });
    } catch (error) {
      console.error("Error deleting download:", error);
      res.status(500).json({ message: "Failed to delete download" });
    }
  });

  // Department: Get all useful downloads
  app.get("/api/downloads", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { usefulDownloads } = await import("../shared/schema");
      const { desc } = await import("drizzle-orm");

      const downloads = await db.select().from(usefulDownloads).orderBy(desc(usefulDownloads.createdAt));
      res.json(downloads);
    } catch (error) {
      console.error("Error fetching downloads:", error);
      res.status(500).json({ message: "Failed to fetch downloads" });
    }
  });

  // Department/Public: Proxy external link or local file securely
  app.get("/api/downloads/:id/access", async (req, res) => {
    try {
      const { id } = req.params;
      const { db } = await import("./db");
      const { usefulDownloads } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const [download] = await db.select().from(usefulDownloads).where(eq(usefulDownloads.id, parseInt(id)));

      if (!download) {
        return res.status(404).json({ message: "Resource not found" });
      }

      if (download.fileUrl) {
        // Option 1: It's a local file.
        return res.redirect(download.fileUrl);
      } else if (download.externalLink) {
        // Option 2: It's an external link. Proxy the content securely and bypass SSL certificate issues.
        let externalUrl = download.externalLink;
        if (!externalUrl.startsWith('http://') && !externalUrl.startsWith('https://')) {
          externalUrl = 'https://' + externalUrl;
        }

        try {
          // Temporarily bypass strict SSL checks for AMU internal servers
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
          const response = await fetch(externalUrl);
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';

          if (!response.ok) throw new Error(`HTTP ${response.status} from external resource`);

          // Pass necessary headers
          const contentType = response.headers.get('content-type');
          if (contentType) res.setHeader('Content-Type', contentType);

          const contentDisposition = response.headers.get('content-disposition');
          if (contentDisposition) {
            res.setHeader('Content-Disposition', contentDisposition);
          } else {
            res.setHeader('Content-Disposition', `inline; filename="download-${id}"`);
          }

          if (response.body) {
            const { pipeline } = await import('stream/promises');
            const { Readable } = await import('stream');
            await pipeline(Readable.fromWeb(response.body as any), res);
            return;
          }
        } catch (fetchErr) {
          console.error("Proxy fetch error:", fetchErr);
          // Make sure to reset it just in case it threw before resetting
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
          return res.status(500).send("External resource cannot be proxied or is unavailable.");
        }
      } else {
        return res.status(404).json({ message: "No content available for this resource" });
      }
    } catch (error) {
      console.error("Error accessing download:", error);
      res.status(500).json({ message: "Failed to access resource" });
    }
  });

  // ========== DEPARTMENT CONTACTS (Attendance Contact Person) ==========

  // Get all department contacts with employee and department info
  app.get("/api/admin/department-contacts", verifyAdminSession, async (req, res) => {
    try {
      const { departmentContacts, departments, employees } = await import("../shared/schema");
      const { eq, like, or, ilike } = await import("drizzle-orm");

      const search = (req.query.search as string) || "";
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;

      // Join department_contacts with employees and departments
      let query = db
        .select({
          id: departmentContacts.id,
          departmentId: departmentContacts.departmentId,
          employeeId: departmentContacts.employeeId,
          contactPhone: departmentContacts.contactPhone,
          internalPhone: departmentContacts.internalPhone,
          contactEmail: departmentContacts.contactEmail,
          notes: departmentContacts.notes,
          createdAt: departmentContacts.createdAt,
          updatedAt: departmentContacts.updatedAt,
          departmentName: departments.name,
          employeeName: employees.name,
          employeeEpid: employees.epid,
          employeeDesignation: employees.designation,
        })
        .from(departmentContacts)
        .leftJoin(departments, eq(departmentContacts.departmentId, departments.id))
        .leftJoin(employees, eq(departmentContacts.employeeId, employees.id));

      const results = await query;

      // Apply filters in JS (simpler than building dynamic SQL)
      let filtered = results;
      if (departmentId) {
        filtered = filtered.filter(c => c.departmentId === departmentId);
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(c =>
          (c.departmentName || "").toLowerCase().includes(s) ||
          (c.employeeName || "").toLowerCase().includes(s) ||
          (c.employeeEpid || "").toLowerCase().includes(s) ||
          (c.contactPhone || "").toLowerCase().includes(s) ||
          (c.employeeDesignation || "").toLowerCase().includes(s)
        );
      }

      // Sort by department name
      filtered.sort((a, b) => (a.departmentName || "").localeCompare(b.departmentName || ""));

      res.json(filtered);
    } catch (error) {
      console.error("Error fetching department contacts:", error);
      res.status(500).json({ message: "Failed to fetch department contacts" });
    }
  });

  // Add a new department contact
  app.post("/api/admin/department-contacts", verifyAdminSession, async (req, res) => {
    try {
      const { departmentContacts } = await import("../shared/schema");
      const { departmentId, employeeId, contactPhone, internalPhone, contactEmail, notes } = req.body;

      if (!departmentId || !employeeId || !contactPhone) {
        return res.status(400).json({ message: "Department, employee, and phone number are required" });
      }

      // Check if contact already exists for this department+employee
      const { eq, and } = await import("drizzle-orm");
      const existing = await db.select().from(departmentContacts)
        .where(and(
          eq(departmentContacts.departmentId, Number(departmentId)),
          eq(departmentContacts.employeeId, Number(employeeId))
        ));

      if (existing.length > 0) {
        return res.status(400).json({ message: "This employee is already a contact for this department" });
      }

      const [newContact] = await db.insert(departmentContacts).values({
        departmentId: Number(departmentId),
        employeeId: Number(employeeId),
        contactPhone: contactPhone.trim(),
        internalPhone: internalPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        notes: notes?.trim() || null,
      }).returning();

      res.status(201).json(newContact);
    } catch (error) {
      console.error("Error creating department contact:", error);
      res.status(500).json({ message: "Failed to create department contact" });
    }
  });

  // Update a department contact
  app.put("/api/admin/department-contacts/:id", verifyAdminSession, async (req, res) => {
    try {
      const contactId = Number(req.params.id);
      const { departmentContacts } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      const { employeeId, contactPhone, internalPhone, contactEmail, notes } = req.body;

      const updates: any = { updatedAt: new Date() };
      if (employeeId !== undefined) updates.employeeId = Number(employeeId);
      if (contactPhone !== undefined) updates.contactPhone = contactPhone.trim();
      if (internalPhone !== undefined) updates.internalPhone = internalPhone?.trim() || null;
      if (contactEmail !== undefined) updates.contactEmail = contactEmail?.trim() || null;
      if (notes !== undefined) updates.notes = notes?.trim() || null;

      const [updated] = await db.update(departmentContacts)
        .set(updates)
        .where(eq(departmentContacts.id, contactId))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Contact not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating department contact:", error);
      res.status(500).json({ message: "Failed to update department contact" });
    }
  });

  // Delete a department contact
  app.delete("/api/admin/department-contacts/:id", verifyAdminSession, async (req, res) => {
    try {
      const contactId = Number(req.params.id);
      const { departmentContacts } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const [deleted] = await db.delete(departmentContacts)
        .where(eq(departmentContacts.id, contactId))
        .returning();

      if (!deleted) {
        return res.status(404).json({ message: "Contact not found" });
      }

      res.json({ message: "Contact deleted successfully" });
    } catch (error) {
      console.error("Error deleting department contact:", error);
      res.status(500).json({ message: "Failed to delete department contact" });
    }
  });

  return httpServer;
}
