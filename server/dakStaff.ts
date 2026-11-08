// Staff logins inside a department (e-Office).
// ─────────────────────────────────────────────────────────────────────────────
// A department keeps its main login (acts as the department's administrator).
// It can add staff accounts: HOD, Section Officer, Dealing Assistant, Diary Clerk.
// Staff log in on the same department login page with their own e-mail/password;
// every dak / e-file action is then recorded under the person's name.
//
// Table `department_staff` (migrations.ts). Staff passwords are stored as scrypt
// hashes (new table; existing department/admin passwords are left as they are).
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sessionDepartmentId, sessionStaff, passwordFingerprint, saveSession } from "./auth";

export const STAFF_ROLES = ["hod", "section_officer", "dealing_assistant", "diary_clerk"] as const;
export type StaffRole = typeof STAFF_ROLES[number];
export const ROLE_LABELS: Record<string, string> = {
  department: "Department Admin",
  hod: "HOD",
  section_officer: "Section Officer",
  dealing_assistant: "Dealing Assistant",
  diary_clerk: "Diary Clerk",
};
const SUPERVISOR_ROLES = new Set(["department", "hod", "section_officer"]);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = String(stored || "").split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password ?? ""), salt, 64);
  const real = Buffer.from(hash, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

/** Staff row for a login attempt (active, password correct), else null */
export async function findStaffForLogin(email: string, password: string): Promise<any | null> {
  const row = (await db.execute(sql`
    SELECT s.*, d.name AS department_name FROM department_staff s
    JOIN departments d ON d.id = s.department_id
    WHERE LOWER(s.email) = LOWER(${String(email || "").trim()}) AND s.is_active = true`)).rows[0] as any;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  await db.execute(sql`UPDATE department_staff SET last_login = NOW() WHERE id = ${row.id}`);
  return row;
}

export async function staffEmailExists(email: string): Promise<boolean> {
  return (await db.execute(sql`SELECT 1 FROM department_staff WHERE LOWER(email) = LOWER(${email}) LIMIT 1`)).rows.length > 0;
}

/** Who is acting inside a department: the person (staff) or the department login itself */
export type DeptActor = {
  departmentId: number;
  departmentName: string;
  staffId: number | null;
  staffName: string | null;
  role: string;
  isSupervisor: boolean;
  /** Shown in tracking: "Name (Role), Department" or the department name */
  label: string;
};

export async function deptActor(req: Request): Promise<DeptActor | null> {
  const departmentId = await sessionDepartmentId(req);
  if (!departmentId) return null;
  const dept = (await db.execute(sql`SELECT name FROM departments WHERE id = ${departmentId}`)).rows[0] as any;
  const departmentName = dept?.name || "Department";
  const staff = sessionStaff(req);
  if (staff) {
    return {
      departmentId,
      departmentName,
      staffId: staff.id,
      staffName: staff.name,
      role: staff.role,
      isSupervisor: SUPERVISOR_ROLES.has(staff.role),
      label: `${staff.name} (${ROLE_LABELS[staff.role] || staff.role}), ${departmentName}`,
    };
  }
  return { departmentId, departmentName, staffId: null, staffName: null, role: "department", isSupervisor: true, label: departmentName };
}

const publicStaff = (r: any) => ({
  id: r.id,
  departmentId: r.department_id,
  employeeId: r.employee_id,
  name: r.name,
  designation: r.designation,
  email: r.email,
  role: r.role,
  roleLabel: ROLE_LABELS[r.role] || r.role,
  isActive: r.is_active,
  lastLogin: r.last_login,
  createdAt: r.created_at,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerStaffRoutes(app: Express) {
  // List staff of a department (any user of that department)
  app.get("/api/departments/:departmentId/staff", async (req: Request, res: Response) => {
    try {
      const departmentId = Number(req.params.departmentId);
      const onlyActive = req.query.active === "1";
      const rows = (await db.execute(sql`
        SELECT * FROM department_staff WHERE department_id = ${departmentId}
        ${onlyActive ? sql`AND is_active = true` : sql``}
        ORDER BY is_active DESC, name`)).rows as any[];
      res.json(rows.map(publicStaff));
    } catch (error: any) {
      console.error("[Staff] list error:", error);
      res.status(500).json({ message: "Could not load staff" });
    }
  });

  // Add a staff login (department admin, HOD, Section Officer)
  app.post("/api/departments/:departmentId/staff", async (req: Request, res: Response) => {
    try {
      const actor = await deptActor(req);
      const departmentId = Number(req.params.departmentId);
      if (actor && (!actor.isSupervisor || actor.departmentId !== departmentId)) {
        return res.status(403).json({ message: "Only the department admin, HOD or Section Officer can add staff" });
      }
      const name = String(req.body.name || "").trim();
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      const role = String(req.body.role || "dealing_assistant");
      if (!name || !EMAIL_RE.test(email)) return res.status(400).json({ message: "Name and a valid e-mail are required" });
      if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
      if (!STAFF_ROLES.includes(role as StaffRole)) return res.status(400).json({ message: "Invalid role" });
      if (actor && actor.role === "section_officer" && role === "hod") {
        return res.status(403).json({ message: "A Section Officer cannot create an HOD login" });
      }
      // The e-mail must not already log in anywhere else
      const taken = await staffEmailExists(email)
        || (await db.execute(sql`SELECT 1 FROM departments WHERE LOWER(email) = ${email}
             UNION ALL SELECT 1 FROM admins WHERE LOWER(email) = ${email} LIMIT 1`)).rows.length > 0;
      if (taken) return res.status(409).json({ message: "This e-mail is already used for a login" });

      const employeeId = req.body.employeeId ? Number(req.body.employeeId) : null;
      const row = (await db.execute(sql`
        INSERT INTO department_staff (department_id, employee_id, name, designation, email, password_hash, role)
        VALUES (${departmentId}, ${employeeId}, ${name}, ${String(req.body.designation || "").trim() || null},
                ${email}, ${hashPassword(password)}, ${role})
        RETURNING *`)).rows[0];
      res.status(201).json(publicStaff(row));
    } catch (error: any) {
      console.error("[Staff] create error:", error);
      res.status(500).json({ message: "Could not create the staff login" });
    }
  });

  // Change a staff login (name, role, active, password reset)
  app.patch("/api/departments/:departmentId/staff/:staffId", async (req: Request, res: Response) => {
    try {
      const actor = await deptActor(req);
      const departmentId = Number(req.params.departmentId);
      const staffId = Number(req.params.staffId);
      if (actor && (!actor.isSupervisor || actor.departmentId !== departmentId)) {
        return res.status(403).json({ message: "Only the department admin, HOD or Section Officer can change staff" });
      }
      const current = (await db.execute(sql`SELECT * FROM department_staff WHERE id = ${staffId} AND department_id = ${departmentId}`)).rows[0] as any;
      if (!current) return res.status(404).json({ message: "Staff not found" });
      if (actor?.staffId === staffId && (req.body.role !== undefined || req.body.isActive === false)) {
        return res.status(400).json({ message: "You cannot change your own role or deactivate yourself" });
      }
      if (actor?.role === "section_officer" && (current.role === "hod" || req.body.role === "hod")) {
        return res.status(403).json({ message: "A Section Officer cannot change an HOD login" });
      }

      const b = req.body;
      const name = b.name !== undefined ? String(b.name).trim() : current.name;
      const role = b.role !== undefined ? String(b.role) : current.role;
      if (!name) return res.status(400).json({ message: "Name is required" });
      if (!STAFF_ROLES.includes(role as StaffRole)) return res.status(400).json({ message: "Invalid role" });
      let passwordHash = current.password_hash;
      if (b.password) {
        if (String(b.password).length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });
        passwordHash = hashPassword(String(b.password));
      }
      const row = (await db.execute(sql`
        UPDATE department_staff SET
          name = ${name},
          designation = ${b.designation !== undefined ? (String(b.designation).trim() || null) : current.designation},
          role = ${role},
          is_active = ${b.isActive !== undefined ? !!b.isActive : current.is_active},
          employee_id = ${b.employeeId !== undefined ? (b.employeeId ? Number(b.employeeId) : null) : current.employee_id},
          password_hash = ${passwordHash}
        WHERE id = ${staffId} RETURNING *`)).rows[0];
      res.json(publicStaff(row));
    } catch (error: any) {
      console.error("[Staff] update error:", error);
      res.status(500).json({ message: "Could not update the staff login" });
    }
  });

  // A staff member changes their own password
  app.post("/api/staff/me/password", async (req: Request, res: Response) => {
    try {
      const staff = sessionStaff(req);
      if (!staff) return res.status(400).json({ message: "Only staff logins have a personal password here" });
      const { currentPassword, newPassword } = req.body || {};
      if (String(newPassword || "").length < 8) return res.status(400).json({ message: "New password must be at least 8 characters" });
      const row = (await db.execute(sql`SELECT password_hash FROM department_staff WHERE id = ${staff.id}`)).rows[0] as any;
      if (!row || !verifyPassword(String(currentPassword || ""), row.password_hash)) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const hash = hashPassword(String(newPassword));
      await db.execute(sql`UPDATE department_staff SET password_hash = ${hash} WHERE id = ${staff.id}`);
      // Keep this login; other logins of this person end
      req.session.staffPwFp = passwordFingerprint(hash);
      await saveSession(req);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Staff] password error:", error);
      res.status(500).json({ message: "Could not change the password" });
    }
  });
}
