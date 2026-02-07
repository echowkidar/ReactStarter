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
  InsertDepartmentName
} from "../shared/schema";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { setupTestEmailAccount, sendPasswordResetEmail } from "./emailService";

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

// ============ Active Users Tracking ============
// In-memory store for active users (session-based heartbeat)
interface ActiveSession {
  id: string;
  type: 'department' | 'admin';
  name: string;
  email?: string;
  lastHeartbeat: Date;
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
      lastSeen: s.lastHeartbeat
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
  // Required fields: email, password, role ('super_admin' or 'salary_admin'), name

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

    console.log("Notices, visitors, and active_user_snapshots tables initialized successfully.");
  } catch (error) {
    console.error("Error initializing tables:", error);
  }

  // Admin auth routes
  app.post("/api/auth/admin/login", async (req, res) => {
    const { email, password } = req.body;

    try {
      const admin = await storage.getAdminByEmail(email);

      // Verify password (plain text as per current system design, should be hashed in production)
      if (!admin || admin.password !== password) {
        return res.status(401).json({ message: "Invalid admin credentials" });
      }

      // Map DB role to frontend adminType
      // DB: 'super_admin', 'salary_admin'
      // Frontend expects: 'super', 'salary'
      const adminType = admin.role === 'salary_admin' ? 'salary' : 'super';

      // Create session token based on password (for session invalidation on password change)
      const sessionToken = Buffer.from(`${admin.email}:${admin.password}`).toString('base64');

      return res.json({
        role: "admin",
        adminType: adminType,
        adminName: admin.name || "Admin",
        sessionToken: sessionToken, // For session verification
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

      return res.json({ valid: true });
    } catch (error) {
      console.error("Session verification error:", error);
      return res.status(500).json({ valid: false, message: "Verification failed" });
    }
  });

  // Clear entries route (Placed early to avoid shadowing)
  app.post("/api/attendance/:reportId/clear-entries", async (req, res) => {
    console.log(`[POST] Request to clear entries for report ${req.params.reportId}`);
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

    activeUsers.set(sessionId, {
      id: sessionId,
      type: type as 'department' | 'admin',
      name,
      email,
      lastHeartbeat: new Date()
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
      // For demo purposes, we'll only handle the two hardcoded admin accounts
      const ADMIN_EMAIL = "admin@amu.ac.in";
      const SALARY_ADMIN_EMAIL = "salary@amu.ac.in";

      if (email !== ADMIN_EMAIL && email !== SALARY_ADMIN_EMAIL) {
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

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    console.log('[POST /api/auth/register] Registration attempt with data:', {
      ...req.body,
      password: '[REDACTED]'
    });

    try {
      const { id: departmentNameId, name, hodTitle, hodName, email, password } = req.body;

      if (!name || !hodTitle || !hodName || !email || !password) {
        console.log('[POST /api/auth/register] Missing required fields');
        return res.status(400).json({
          message: "Missing required fields",
          required: ["name", "hodTitle", "hodName", "email", "password"]
        });
      }

      // First check if email is already registered
      console.log('[POST /api/auth/register] Checking if email exists:', email);
      const existingDepartment = await storage.getDepartmentByEmail(email);
      if (existingDepartment) {
        console.log('[POST /api/auth/register] Email already registered:', email);
        return res.status(400).json({ message: "Email already registered" });
      }

      // Check if department with same name exists (case insensitive)
      console.log('[POST /api/auth/register] Checking if department name exists:', name);
      const departments = await storage.getAllDepartments();
      const existingDeptByName = departments.find(
        dept => dept.name.toLowerCase() === name.toLowerCase()
      );

      if (existingDeptByName) {
        console.log('[POST /api/auth/register] Updating existing department:', existingDeptByName.id);
        // Update the existing department with new credentials
        const updatedDepartment = await storage.updateDepartment(existingDeptByName.id, {
          hodTitle,
          hodName,
          email,
          password
        });
        console.log('[POST /api/auth/register] Department updated successfully');
        return res.status(200).json(updatedDepartment);
      }

      // Create new department
      console.log('[POST /api/auth/register] Creating new department');
      const department = await storage.createDepartment({
        name,
        hodTitle,
        hodName,
        email,
        password
      });

      console.log('[POST /api/auth/register] Department registered successfully:', {
        id: department.id,
        name: department.name,
        email: department.email
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
      const { email, password } = req.body;
      console.log('Login attempt for:', email);

      const department = await storage.getDepartmentByEmail(email);
      console.log('Found department:', department);

      if (!department) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Make sure both the stored password and provided password are strings
      const storedPassword = String(department.password);
      const providedPassword = String(password);

      if (storedPassword !== providedPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Update last login timestamp
      try {
        const { db } = await import("./db");
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`UPDATE departments SET last_login = NOW() WHERE id = ${department.id}`);
      } catch (err) {
        console.error('Failed to update lastLogin:', err);
      }

      // Return the department data in the expected format
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
  console.log("Upload directory path:", uploadDir);

  try {
    if (!fs.existsSync(uploadDir)) {
      console.log("Creating uploads directory since it doesn't exist");
      fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
    } else {
      console.log("Uploads directory already exists");
      // Check if directory is writable
      try {
        // Try to write a test file to verify permissions
        const testFile = path.join(uploadDir, '_test_write.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log("Upload directory is writable");
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
      console.log(`Storing file ${file.originalname} in ${uploadDir}`);
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const safeFileName = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
      console.log(`Generated filename for ${file.originalname}: ${safeFileName}`);
      cb(null, safeFileName);
    }
  });

  const upload = multer({
    storage: fileStorage,
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp'];

      console.log(`Validating file: ${file.originalname}, mimetype: ${file.mimetype}`);
      console.log(`Request path: ${req.path}`);

      if (allowedTypes.includes(file.mimetype)) {
        console.log(`File accepted: ${file.originalname} (${file.mimetype})`);
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
    console.log(`Static file request: ${req.url}`);
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
    console.log(`[GET /api/departments] Called with params:`, {
      showAll: req.query.showAll,
      showRegistered: req.query.showRegistered,
      registeredOnly: req.query.registeredOnly
    });

    try {
      let departmentList: Array<{ id: number; name: string; code?: string | null; attendancePermitted?: boolean; employeeCount?: number; lastLogin?: Date | string | null }> = [];

      if (req.query.registeredOnly === 'true') {
        console.log('[GET /api/departments] Fetching only registered departments (from departments table)');
        const registeredDepartments = await storage.getAllDepartments();
        const employeeCounts = await storage.getEmployeeCountsByDepartment();

        departmentList = registeredDepartments.map(dept => ({
          id: dept.id,
          name: dept.name,
          code: null,
          attendancePermitted: dept.attendancePermitted,
          employeeCount: employeeCounts.get(dept.id) || 0,
          lastLogin: dept.lastLogin || null
        }));
        console.log(`[GET /api/departments] Fetched ${departmentList.length} registered departments`);
      } else {
        console.log('[GET /api/departments] Fetching all department names (from department_names table)');
        // Simply fetch all departments from department_names table
        const allDepartmentNames = await storage.getAllDepartmentNames();
        console.log(`[GET /api/departments] Fetched ${allDepartmentNames.length} departments from names table`);
        departmentList = allDepartmentNames.map(deptName => ({
          id: deptName.id,
          name: deptName.name,
          code: deptName.code
        }));
      }

      // Log sample of results
      if (departmentList.length > 0) {
        console.log(`[GET /api/departments] Sample of results:`,
          departmentList.slice(0, 3).map(d => ({
            id: d.id,
            name: d.name,
            code: d.code
          }))
        );
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
      console.log('Fetching employees for department:', departmentId);

      // Verify department exists
      const department = await storage.getDepartment(departmentId);
      if (!department) {
        console.log('Department not found:', departmentId);
        return res.status(404).json({ message: "Department not found" });
      }
      console.log('Found department:', department);

      const employees = await storage.getEmployeesByDepartment(departmentId);
      console.log('Found employees:', employees.length ? employees : 'No employees found');

      // Transform the response to match the expected format
      const transformedEmployees = employees.map(emp => ({
        ...emp,
        departmentName: department.name
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
      console.log("Department - Received raw employee data:", req.body);

      // Debug uploaded files in development mode
      if (process.env.NODE_ENV !== 'production') {
        console.log("Files received:", req.files ? Object.keys(req.files).length : 'No files');
        if (req.files) {
          Object.entries(req.files as { [fieldname: string]: Express.Multer.File[] }).forEach(([key, files]) => {
            console.log(`- ${key}: ${files.length} file(s)`);
            files.forEach(file => {
              console.log(`  * ${file.fieldname}: ${file.originalname} (${file.mimetype}, ${file.size} bytes) saved as ${file.filename}`);
            });
          });
        }
      }

      // Handle uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const employeeData = {
        ...req.body,
        departmentId,
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
        console.log("Document URLs being saved:");
        console.log("- panCardUrl:", employeeData.panCardUrl);
        console.log("- bankProofUrl:", employeeData.bankProofUrl);
        console.log("- aadharCardUrl:", employeeData.aadharCardUrl);
        console.log("- officeMemoUrl:", employeeData.officeMemoUrl);
        console.log("- joiningReportUrl:", employeeData.joiningReportUrl);
        console.log("- termExtensionUrl:", employeeData.termExtensionUrl);
      }

      const parsedData = insertEmployeeSchema.parse(employeeData);
      console.log("Department - Parsed employee data:", parsedData);
      console.log("Creating employee in storage:", parsedData);

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

      const employee = await storage.updateEmployee(employeeId, updates);

      // Log changes
      // Attempt to get user info, default to generic admin if not present
      // Note: req.user is usually populated by auth middleware
      let user = (req as any).user;
      const session = (req as any).session;

      // Try to identify admin from x-session-token header (sent by client)
      const sessionToken = req.headers['x-session-token'];

      console.log('--- AUTH DEBUG ---');
      console.log('Header x-session-token:', sessionToken ? 'Present' : 'Missing');
      if (typeof sessionToken === 'string') {
        console.log('Token Length:', sessionToken.length);
      }

      if (!user && typeof sessionToken === 'string' && sessionToken) {
        try {
          const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');
          console.log('Decoded Token Part:', decoded.split(':')[0]);

          // Format is email:password (simple basic auth style used in this app)
          const parts = decoded.split(':');
          if (parts.length >= 2) {
            const email = parts[0];
            const password = parts.slice(1).join(':'); // Handle passwords with colons

            const admin = await storage.getAdminByEmail(email);
            if (admin) {
              console.log('Admin Found:', admin.email, 'Role:', admin.role);
              if (admin.password === password) {
                user = {
                  email: admin.email,
                  role: admin.role, // Should be 'super_admin' or 'salary_admin'
                  name: admin.name
                };
                console.log('Admin Authenticated Successfully. Computed Role:', user.role);
              } else {
                console.log('Password Mismatch');
              }
            } else {
              console.log('Admin Not Found in DB');
            }
          }
        } catch (e) {
          console.error('Token parsing failed', e);
        }
      }
      console.log('Final Computed User Role:', user?.role);
      console.log('------------------');

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

      console.log(`Department employee update - request received for employee ${employeeId} in department ${departmentId}`);

      // Log files received (if any)
      if (req.files && Object.keys(req.files).length > 0) {
        console.log("Department employee update - files received:", Object.keys(req.files));
        const filesInfo = Object.entries(req.files as { [fieldname: string]: Express.Multer.File[] })
          .map(([key, files]) => {
            return `${key}: ${files.map(f => `${f.filename} (${f.size} bytes, ${f.mimetype})`).join(', ')}`;
          });
        console.log("Files details:");
        filesInfo.forEach(info => console.log(`- ${info}`));
      } else {
        console.log("Department employee update - no files received");
      }

      // Log body data
      console.log("Department employee update - body fields:", Object.keys(req.body));

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

      console.log("Department employee update - processed updates:", JSON.stringify(updates, null, 2));

      // Log changes before update (for audit trail)
      await storage.logEmployeeChanges(
        employeeId,
        employee,
        updates,
        department?.email || 'unknown',
        'department',
        departmentId
      );

      const updatedEmployee = await storage.updateEmployee(employeeId, updates);
      console.log("Successfully updated employee:", JSON.stringify(updatedEmployee, null, 2));
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

      console.log(`Upload API - File received: ${req.file.originalname}, size: ${req.file.size}, type: ${req.file.mimetype}`);

      const baseUrl = process.env.NODE_ENV === 'production'
        ? 'https://amu.echowkidar.in'
        : `http://localhost:${process.env.PORT || 5001}`;

      let finalFilename = req.file.filename;
      let finalFileUrl = `${baseUrl}/uploads/${finalFilename}`;

      // Compress PDF files using Ghostscript for aggressive compression
      if (req.file.mimetype === 'application/pdf') {
        const filePath = path.join(uploadDir, req.file.filename);
        const originalSize = fs.statSync(filePath).size;
        console.log(`PDF compression - Original size: ${Math.round(originalSize / 1024)} KB`);

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

          console.log('Running Ghostscript compression...');
          execSync(gsCommand, { timeout: 60000 }); // 60 second timeout

          // Check if compressed file was created and is smaller
          if (fs.existsSync(compressedFilePath)) {
            const compressedSize = fs.statSync(compressedFilePath).size;
            const reductionPercent = Math.round((1 - compressedSize / originalSize) * 100);

            console.log(`PDF compression - Compressed size: ${Math.round(compressedSize / 1024)} KB`);
            console.log(`PDF compression - Size reduction: ${reductionPercent}%`);

            if (compressedSize < originalSize * 0.95) { // Only use if at least 5% smaller
              // Delete original and use compressed
              fs.unlinkSync(filePath);
              finalFilename = compressedFilename;
              finalFileUrl = `${baseUrl}/uploads/${compressedFilename}`;
              console.log(`PDF compressed successfully using Ghostscript: ${compressedFilename}`);
            } else {
              // Compressed file is not significantly smaller, delete it
              fs.unlinkSync(compressedFilePath);
              console.log('Ghostscript compression did not significantly reduce size, keeping original');
            }
          }
        } catch (gsError: any) {
          console.log('Ghostscript not available or failed, trying pdf-lib fallback...');

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
            console.log(`PDF compression (pdf-lib) - Compressed size: ${Math.round(compressedSize / 1024)} KB`);
            console.log(`PDF compression (pdf-lib) - Size reduction: ${reductionPercent}%`);

            if (compressedSize < originalSize) {
              fs.writeFileSync(compressedFilePath, compressedPdfBytes);
              fs.unlinkSync(filePath);
              finalFilename = compressedFilename;
              finalFileUrl = `${baseUrl}/uploads/${compressedFilename}`;
              console.log(`PDF compressed using pdf-lib: ${compressedFilename}`);
            }
          } catch (pdfLibError) {
            console.error('pdf-lib compression also failed, keeping original:', pdfLibError);
          }
        }
      }

      console.log(`Upload API - Final file URL: ${finalFileUrl}`);
      res.json({ imageUrl: finalFileUrl, fileUrl: finalFileUrl });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Add endpoint to delete a file
  app.delete("/api/upload", async (req, res) => {
    try {
      console.log("Delete file API called with body:", req.body);

      const { imageUrl } = req.body;

      if (!imageUrl) {
        console.log("No file URL provided in request body");
        return res.status(400).json({ message: "No file URL provided" });
      }

      console.log(`Delete file API called for: ${imageUrl}`);

      // Extract the filename from the URL
      // Expected format: /uploads/filename.ext
      const urlParts = imageUrl.split('/');
      const filename = urlParts[urlParts.length - 1];

      if (!filename) {
        console.log("Invalid file URL format, couldn't extract filename");
        return res.status(400).json({ message: "Invalid file URL format" });
      }

      // Get the absolute path to the uploads directory
      const uploadDir = path.join(__dirname, '../uploads');
      console.log(`Upload directory absolute path: ${uploadDir}`);

      // Build the absolute file path
      const filePath = path.join(uploadDir, filename);
      console.log(`Full absolute file path: ${filePath}`);

      // Double check that the file path is within the uploads directory
      if (!filePath.startsWith(uploadDir)) {
        console.error(`Security issue: File path ${filePath} is outside upload directory ${uploadDir}`);
        return res.status(400).json({ message: "Invalid file path" });
      }

      console.log(`Checking if file exists at: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log(`File does not exist: ${filePath}`);
        // Still return success if file doesn't exist, as the end result is the same (no file)
        return res.status(200).json({ message: "File already removed or does not exist" });
      }

      console.log(`File exists, attempting to delete file at: ${filePath}`);

      try {
        // Delete the file
        fs.unlinkSync(filePath);

        // Verify the file was deleted
        const fileStillExists = fs.existsSync(filePath);
        if (fileStillExists) {
          console.error(`Failed to delete file: ${filePath} - File still exists after deletion attempt`);
          return res.status(500).json({ message: "Failed to delete file: File still exists after deletion attempt" });
        }

        console.log(`File successfully deleted: ${filePath}`);

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
  app.get("/api/admin/users", async (req, res) => {
    try {
      // For the MVP, we'll use a simplified approach
      // In production, these would be stored in the database

      // Hardcoded super admin and salary admin
      const hardcodedUsers = [
        {
          id: 1,
          name: "Super Administrator",
          email: "admin@amu.ac.in",
          role: "superadmin",
          departmentId: null,
          departmentName: null
        },
        {
          id: 2,
          name: "Salary Officer",
          email: "salary@amu.ac.in",
          role: "salary",
          departmentId: null,
          departmentName: null
        }
      ];

      // Get department admins from the departments table
      const departments = await storage.getAllDepartments();

      // Only include departments with valid emails (non-empty and NOT placeholder emails)
      const validDepartments = departments.filter(dept =>
        dept.email &&
        dept.email.trim() !== '' &&
        !dept.email.includes('unused_dept_') && // Filter out placeholder emails for deleted users
        !dept.email.includes('@placeholder.com') // Additional check for placeholder domain
      );

      console.log(`Found ${departments.length} total departments, ${validDepartments.length} have valid emails`);

      const departmentUsers = validDepartments.map((dept, index) => {
        // REMOVED: Logic to resolve names starting with "Department ID -"
        // The name should be correct in the database now.
        let departmentName = dept.name;

        return {
          id: index + 3, // Start IDs after hardcoded users
          name: dept.hodName,
          email: dept.email,
          role: "department",
          departmentId: dept.id,
          departmentName: departmentName // Use the name directly from the department record
        };
      });

      // Combine all users
      const allUsers = [...hardcodedUsers, ...departmentUsers];

      res.json(allUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Create a new user
  app.post("/api/admin/users", async (req, res) => {
    try {
      const { name, email, password, role, departmentId } = req.body;

      console.log("POST /api/admin/users - Creating user with data:", {
        name,
        email,
        role,
        departmentId: departmentId,
        departmentIdType: typeof departmentId
      });

      // Validate required fields
      if (!name || !email || !password || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if email already exists in departments
      const existingDeptByEmail = await storage.getDepartmentByEmail(email);
      if (existingDeptByEmail) {
        return res.status(400).json({ message: "Email already in use" });
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

        console.log(`Fetching details for department name ID: ${selectedDeptNameId}`);
        // Fetch details from department_names table using the ID from the dropdown
        const deptNameDetails = await storage.getDepartmentName(selectedDeptNameId);

        if (!deptNameDetails) {
          return res.status(404).json({ message: `Department details not found for ID ${selectedDeptNameId}. Cannot create user.` });
        }

        console.log(`Found details: ${deptNameDetails.name} (Code: ${deptNameDetails.code})`);

        // Check if a department with this NAME is already registered in the 'departments' table
        // TODO: Make this lookup case-insensitive and trim whitespace if possible in storage layer
        const existingRegisteredDept = await storage.getDepartmentByName(deptNameDetails.name);

        if (existingRegisteredDept) {
          // If it exists and has a valid email (not placeholder), prevent creating another user for it.
          if (existingRegisteredDept.email && !existingRegisteredDept.email.includes('unused_dept_') && !existingRegisteredDept.email.includes('@placeholder.com')) {
            console.log(`Department "${deptNameDetails.name}" (ID: ${existingRegisteredDept.id}) is already registered with user ${existingRegisteredDept.email}.`);
            return res.status(409).json({ // 409 Conflict
              message: `Cannot create user: Department "${deptNameDetails.name}" is already associated with an active user (${existingRegisteredDept.email}).`
            });
          } else {
            // If it exists but has a placeholder email, update it (assign the new user)
            console.log(`Department "${deptNameDetails.name}" (ID: ${existingRegisteredDept.id}) exists but has no active user or a placeholder email. Updating it.`);
            try {
              const updatedDepartment = await storage.updateDepartment(existingRegisteredDept.id, {
                hodName: name,
                email: email,
                password: password // Consider hashing
              });
              // Recalculate UI ID (Fragile) - Reuse existing calculation
              const allDepts = await storage.getAllDepartments();
              const validDepts = allDepts.filter(d => d.email && !d.email.includes('unused_dept_') && !d.email.includes('@placeholder.com'));
              const userIndex = validDepts.findIndex(d => d.id === updatedDepartment.id);
              const uiId = (userIndex !== -1) ? userIndex + 3 : Date.now(); // Fallback UI ID
              return res.status(200).json({ // 200 OK for update
                id: uiId,
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
          console.log(`Department "${deptNameDetails.name}" not found by name in 'departments' table. Creating new entry.`);
          try {
            // Create the new department entry
            const newDepartment = await storage.createDepartment({
              name: deptNameDetails.name, // Use name from department_names
              hodTitle: "Chairperson", // Default
              hodName: name,
              email: email,
              password: password // Consider hashing
            });
            console.log(`Created new registered department: ID=${newDepartment.id}, Name=${newDepartment.name}`);

            // Recalculate UI ID (Fragile)
            const allDepts = await storage.getAllDepartments(); // Refetch might be needed
            const validDepts = allDepts.filter(d => d.email && !d.email.includes('unused_dept_') && !d.email.includes('@placeholder.com'));
            const userIndex = validDepts.findIndex(d => d.id === newDepartment.id);
            const uiId = (userIndex !== -1) ? userIndex + 3 : Date.now(); // Fallback UI ID

            return res.status(201).json({
              id: uiId,
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

      // Handle other roles (superadmin, salary) - For MVP, these are not stored/created via API
      if (role === "superadmin" || role === "salary") {
        return res.status(400).json({ message: `Cannot create '${role}' user via API in this version.` });
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
      const { name, email, password, role, departmentId } = req.body;

      console.log("PUT /api/admin/users/:id - Updating user:", {
        userId, name, email, role, departmentId
      });

      // Handle hardcoded users (superadmin, salary) - cannot be updated via API
      if (userId <= 2) {
        return res.json({ message: "System users cannot be modified via API." });
      }

      // Find the current department for this user
      const allDepts = await storage.getAllDepartments();
      const validDepartments = allDepts.filter(dept =>
        dept.email && !dept.email.includes('unused_dept_') && !dept.email.includes('@placeholder.com')
      );

      const currentDepartment = validDepartments.find((dept, index) => {
        const calculatedUserId = index + 3;
        return calculatedUserId === userId;
      });

      if (!currentDepartment) {
        return res.status(404).json({ message: `User with UI ID ${userId} not found (no corresponding department).` });
      }

      console.log(`Found current department for UI user ID ${userId}: Dept ID ${currentDepartment.id} (${currentDepartment.name})`);

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
      console.log(`Updating department ${currentDepartment.id} with new name "${targetDeptNameDetails.name}" and user details`);
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
      const userId = parseInt(req.params.id); // Fragile UI ID
      console.log(`Attempting to delete user with UI ID: ${userId}`);

      // Prevent deleting hardcoded users
      if (userId <= 2) {
        console.log(`Cannot delete system user with ID: ${userId}`);
        return res.status(403).json({ message: "Cannot delete system users" });
      }

      // Find the department matching this UI user ID using .find()
      const allDepts = await storage.getAllDepartments();

      const validDepartments = allDepts.filter(dept =>
        dept.email && !dept.email.includes('unused_dept_') && !dept.email.includes('@placeholder.com')
      );

      const departmentToDelete = validDepartments.find((dept, index) => {
        const calculatedUserId = index + 3;
        return calculatedUserId === userId;
      });

      if (!departmentToDelete) {
        // No need for extra null check here
        console.log(`No department found for user ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      // departmentToDelete is guaranteed to be a Department object here
      const deptId = departmentToDelete.id;
      const deptName = departmentToDelete.name;

      console.log(`Found department to delete: ${deptId} (${deptName})`);

      // Check for associated employees before deleting
      const employees = await storage.getEmployeesByDepartment(deptId);
      if (employees.length > 0) {
        console.log(`Cannot delete department ${deptId} - it has ${employees.length} employees. Clearing user info instead.`);
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
        console.log(`Department ${deptId} deleted successfully.`);
        return res.json({
          message: "User deleted successfully",
          userId: userId,
          departmentId: deptId,
          departmentName: deptName // Return the name before deletion
        });
      }

      // REMOVED: Old logic trying to resolve names with getDepartmentNameFromNegativeId

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

      console.log("POST /api/admin/department-names - Creating department name:", {
        dept_name,
        dept_code,
        dealingAssistantCode
      });

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

      console.log("Department name created successfully:", newDepartmentName);
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

  app.delete("/api/employees/:id", async (req, res) => {
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

  app.post("/api/departments/:departmentId/attendance", async (req, res) => {
    try {
      const reportData = insertAttendanceReportSchema.parse({
        ...req.body,
        departmentId: Number(req.params.departmentId)
      });
      const report = await storage.createAttendanceReport(reportData);
      res.status(201).json(report);
    } catch (error) {
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

      // Handle receipt date
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

      const report = await storage.updateAttendanceReport(Number(req.params.id), updates);
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
      console.log('Received periods:', periods);
      console.log('First period:', firstPeriod);
      console.log('Last period:', lastPeriod);

      const entryData = insertAttendanceEntrySchema.parse({
        reportId: reportId,
        employeeId: Number(employeeId),
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



  // Admin routes
  app.get("/api/admin/attendance", async (req, res) => {
    try {
      const reports = await storage.getAllAttendanceReports();
      const reportsWithDetailsPromises = reports.map(async (report) => {
        const department = await storage.getDepartment(report.departmentId);

        // Provide explicit type for entriesWithDetails
        let entriesWithDetails: (AttendanceEntry & { employee?: Employee | undefined })[] = [];
        if (report.status === "sent") {
          const entries = await storage.getAttendanceEntriesByReport(report.id);
          entriesWithDetails = await Promise.all(
            entries.map(async (entry) => {
              const employee = await storage.getEmployee(entry.employeeId);
              return {
                ...entry,
                employee // employee is already Employee | undefined
              };
            })
          );
        }

        return {
          ...report,
          department, // department is already Department | undefined
          entries: entriesWithDetails, // Use explicitly typed array
          receiptNo: report.receiptNo,
          receiptDate: report.receiptDate,
        };
      });

      const reportsWithDetails = await Promise.all(reportsWithDetailsPromises);
      res.json(reportsWithDetails);
    } catch (error) {
      console.error('Error fetching attendance reports with details:', error);
      res.status(500).json({ message: "Failed to fetch attendance reports with details" });
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

      // Fetch all employees for this department
      const employees = await storage.getEmployeesByDepartment(report.departmentId);
      const employeesMap = new Map(employees.map(emp => [emp.id, emp]));

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
      console.log(`[DELETE /api/attendance/${id}] Request received`);

      const report = await storage.getAttendanceReport(id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      await storage.deleteAttendanceReport(id);

      console.log(`[DELETE] Report ${id} fileUrl: '${report.fileUrl}'`);
      if (report.fileUrl) {
        console.log(`[DELETE] Calling deleteFile for report ${id}`);
        await storage.deleteFile(report.fileUrl);
      } else {
        console.log(`[DELETE] No file to delete for report ${id}`);
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

      console.log(`Cancellation requested for report ${reportId}`);
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

      console.log(`Recall requested for report ${reportId}`);
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

      console.log(`Report ${reportId} reverted to draft`);
      res.json(updatedReport);
    } catch (error) {
      console.error('Error reverting to draft:', error);
      res.status(500).json({ message: "Failed to revert to draft" });
    }
  });

  // Accept cancellation (Admin side)
  app.post("/api/attendance/:id/accept-cancel", async (req, res) => {
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

      console.log(`Cancellation accepted for report ${reportId}. Entries deleted, PDF preserved.`);
      res.json(updatedReport);
    } catch (error) {
      console.error('Error accepting cancellation:', error);
      res.status(500).json({ message: "Failed to accept cancellation" });
    }
  });


  // Get all employees (admin)
  app.get("/api/admin/employees", async (req, res) => {
    try {
      console.log('[GET /api/admin/employees] Fetching all employees');
      const employees = await storage.getAllEmployees();

      // Get all departments to add department names
      const departments = await storage.getAllDepartments();
      const departmentMap = new Map(departments.map(d => [d.id, d]));

      // Add department names to employees
      const employeesWithDepartments = employees.map(emp => ({
        ...emp,
        departmentName: departmentMap.get(emp.departmentId)?.name || 'Unknown Department'
      }));

      console.log(`[GET /api/admin/employees] Returning ${employeesWithDepartments.length} employees`);
      res.json(employeesWithDepartments);
    } catch (error) {
      console.error('[GET /api/admin/employees] Error:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/departments/registered", async (req, res) => {
    try {
      const registeredDepartments = await storage.getAllDepartments();
      console.log(`Fetched ${registeredDepartments.length} registered departments`);
      res.json(registeredDepartments);
    } catch (error) {
      console.error("Error fetching registered departments:", error);
      res.status(500).json({ error: "Failed to fetch registered departments" });
    }
  });

  // Create employee (admin)
  app.post("/api/admin/employees", upload.fields(documentFields), async (req, res) => {
    try {
      console.log("Admin - Received raw employee data:", req.body);

      // Parse departmentId from the request
      const departmentId = Number(req.body.departmentId);
      console.log(`Processing department ID: ${departmentId}`);

      // Check if department ID exists in departments table
      let departmentExists = false;
      let actualDepartmentId = departmentId; // The ID to use for employee creation

      try {
        const department = await storage.getDepartment(departmentId);
        if (department) {
          departmentExists = true;
          console.log(`Department ${departmentId} exists in departments table: ${department.name}`);
        } else {
          console.log(`Department ${departmentId} does not exist in departments table`);

          // Try to find the department in department_names table
          const departmentNameRecord = await storage.getDepartmentName(departmentId);

          if (departmentNameRecord) {
            console.log(`Found department in department_names: ${departmentId} - ${departmentNameRecord.name}`);

            // Create a placeholder entry in departments table
            try {
              const placeholderDepartment = await storage.createDepartment({
                name: departmentNameRecord.name,
                hodTitle: "Placeholder",
                hodName: "Placeholder",
                email: `placeholder_${departmentId}@placeholder.com`,
                password: "placeholder_password"
              });

              console.log(`Created placeholder department: ID=${placeholderDepartment.id}, Name=${placeholderDepartment.name}`);

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
            console.log(`Department ${departmentId} not found in department_names table either`);
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

      console.log(`Final employee data using department ID: ${actualDepartmentId}`);
      const parsedData = insertEmployeeSchema.parse(employeeData);
      console.log("Admin - Parsed employee data:", parsedData);

      try {
        const employee = await storage.createEmployee(parsedData);
        console.log(`Employee created successfully with ID: ${employee.id}`);
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

      console.log(`Document upload validation: ${file.originalname}, mimetype: ${file.mimetype}`);

      if (allowedTypes.includes(file.mimetype)) {
        console.log(`Document file accepted: ${file.originalname} (${file.mimetype})`);
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

        console.log(`Image compressed and saved: ${compressedFilePath}`);

        // Create file URL using the compressed file
        const baseUrl = process.env.NODE_ENV === 'production'
          ? 'https://amu.echowkidar.in'
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
        console.log(`[DELETE Document] Deleting file for document ${id}: ${document.imageUrl}`);
        await storage.deleteFile(document.imageUrl);
      }

      // Delete from database
      await storage.deleteDocument(id);

      console.log(`[DELETE Document] Successfully deleted document ${id}`);
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

  // Cleanup routine for old files
  const cleanupOldFiles = () => {
    try {
      const files = fs.readdirSync(uploadDestination);

      // Find files older than 30 days that might be orphaned
      const now = Date.now();
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

      // Check all files for age
      files.forEach(file => {
        const filePath = path.join(uploadDestination, file);
        try {
          const stats = fs.statSync(filePath);
          const fileCreationTime = stats.birthtime.getTime();

          // Delete very old files (orphaned files)
          if (now - fileCreationTime > THIRTY_DAYS) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old file (30+ days): ${file}`);
          }
        } catch (err) {
          console.error(`Error checking file ${file}:`, err);
        }
      });
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  };

  // Run cleanup every 12 hours
  setInterval(cleanupOldFiles, 12 * 60 * 60 * 1000);

  // Run cleanup on startup
  setTimeout(cleanupOldFiles, 5 * 60 * 1000); // Wait 5 minutes after server start

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
      console.log(`Global attendance permission toggled: ${enabled ? 'ON' : 'OFF'}`);
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
      console.log(`Department ${deptId} attendance permission: ${permitted ? 'PERMITTED' : 'REVOKED'}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating department permission:", error);
      res.status(500).json({ message: "Failed to update permission" });
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
            ? 'https://amu.echowkidar.in'
            : `http://localhost:${process.env.PORT || 5001}`;

          imageUrl = `${baseUrl}/uploads/${compressedFilename}`;
          console.log(`[Ticket] Image saved: ${imageUrl}`);
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
  app.delete("/api/tickets/:id", async (req, res) => {
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
          ? 'https://amu.echowkidar.in'
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
            console.log(`Notice image compressed: ${compressedFilename}`);
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
            console.log(`Deleted notice image: ${filename}`);
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
      res.json(results);
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

  return httpServer;
}
