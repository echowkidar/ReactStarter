import { db } from "./db";
import { testDbConnection } from "./db";
import { departments, employees, attendanceReports, attendanceEntries, departmentNames, documents, admins, tickets } from "@shared/schema";
import { eq, and, or, like, sql, count, max } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import type { IStorage } from "./storage";
import type {
  Department,
  Employee,
  AttendanceReport,
  AttendanceEntry,
  InsertDepartment,
  InsertEmployee,
  InsertAttendanceReport,
  InsertAttendanceEntry,
  DepartmentName,
  Document,
  InsertDocument,
  InsertDepartmentName,
  Admin,
  InsertAdmin,
  Ticket,
  InsertTicket
} from "@shared/schema";


// Create a temporary in-memory storage for reset tokens
// In a production app, these would be stored in the database
type ResetToken = {
  token: string;
  expiry: Date;
};

const resetTokens = new Map<number, ResetToken>();

export class DbStorage implements IStorage {
  // Database connection check
  async checkConnection(): Promise<boolean> {
    try {
      // Use the improved test function
      const result = await testDbConnection();
      return result;
    } catch (error) {
      console.error("Database connection check failed:", error);
      return false;
    }
  }

  // Note: Admin authentication is handled in routes.ts using getAdminByEmail() and database passwords

  async departmentLogin(email: string, password: string): Promise<Department | null> {
    try {
      const department = await this.getDepartmentByEmail(email);

      if (!department) {
        return null;
      }

      // In a real app, you'd use bcrypt to compare the password
      // This is simplified for demo purposes
      if (department.password === password) {
        return department;
      }

      return null;
    } catch (error) {
      console.error("Department login error:", error);
      return null;
    }
  }

  // Department operations
  async getDepartment(id: number): Promise<Department | undefined> {
    return await db.query.departments.findFirst({
      where: eq(departments.id, id),
    });
  }

  async getDepartmentByEmail(email: string): Promise<Department | undefined> {
    return await db.query.departments.findFirst({
      where: eq(departments.email, email),
    });
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    return await db.query.admins.findFirst({
      where: eq(admins.email, email),
    });
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const [admin] = await db.insert(admins).values(insertAdmin).returning();
    return admin;
  }

  async createDepartment(department: InsertDepartment): Promise<Department> {
    // Use a transaction to reset the sequence before inserting
    return await db.transaction(async (tx) => {
      try {
        // Reset sequence to max(id) + 1 to avoid conflicts
        // Note: The sequence name 'departments_id_seq' is a common convention, verify if different
        await tx.execute(sql`
          SELECT setval('departments_id_seq', coalesce((SELECT MAX(id) FROM departments), 0) + 1, false);
        `);

        // Insert the new department
        const [newDepartment] = await tx.insert(departments).values(department).returning();
        return newDepartment;
      } catch (error) {
        console.error("Error in createDepartment transaction:", error);
        // Rethrow the error so the route handler can catch it
        throw error;
      }
    });
  }

  async updateDepartment(id: number, updates: Partial<Department>): Promise<Department> {
    const [updatedDepartment] = await db
      .update(departments)
      .set(updates)
      .where(eq(departments.id, id))
      .returning();
    return updatedDepartment;
  }

  async deleteDepartment(id: number): Promise<void> {
    await db
      .delete(departments)
      .where(eq(departments.id, id));
  }

  async getAllDepartments(): Promise<Department[]> {
    return await db.query.departments.findMany();
  }

  // Add new method to get all department names
  async getAllDepartmentNames(): Promise<DepartmentName[]> {
    return await db.query.departmentNames.findMany();
  }

  // Add method to get single department name by ID
  async getDepartmentName(id: number): Promise<DepartmentName | undefined> {
    return await db.query.departmentNames.findFirst({
      where: eq(departmentNames.id, id),
    });
  }

  // Add method to get single department by Name
  async getDepartmentByName(name: string): Promise<Department | undefined> {
    return await db.query.departments.findFirst({
      where: eq(departments.name, name),
    });
  }

  // Add methods for department_names table
  async getDepartmentNameByName(name: string): Promise<DepartmentName | undefined> {
    return await db.query.departmentNames.findFirst({
      where: eq(departmentNames.name, name),
    });
  }

  async getDepartmentNameByCode(code: string): Promise<DepartmentName | undefined> {
    return await db.query.departmentNames.findFirst({
      where: eq(departmentNames.code, code),
    });
  }

  async getMaxDepartmentNameId(): Promise<{ maxId: number | null } | undefined> {
    const result = await db.select({ maxId: max(departmentNames.id) }).from(departmentNames);
    return result[0]; // Drizzle returns an array, get the first element
  }

  async createDepartmentName(departmentName: InsertDepartmentName): Promise<DepartmentName> {
    // Assuming InsertDepartmentName is defined in @shared/schema 
    // and includes id, dept_name, dept_code, d_ast
    const [newDepartmentName] = await db.insert(departmentNames).values(departmentName).returning();
    return newDepartmentName;
  }

  // Employee operations
  async getEmployee(id: number): Promise<Employee | undefined> {
    try {
      const result = await db.query.employees.findFirst({
        where: eq(employees.id, id)
      });
      return result;
    } catch (error) {
      console.error('[DbStorage] Error fetching employee:', error);
      return undefined;
    }
  }

  async getEmployeesByDepartment(departmentId: number): Promise<Employee[]> {
    try {
      console.log(`[DbStorage] Fetching employees for department ${departmentId}`);
      const result = await db.query.employees.findMany({
        where: eq(employees.departmentId, departmentId)
      });
      console.log(`[DbStorage] Found ${result.length} employees`);
      if (result.length > 0) {
        console.log('[DbStorage] Sample employee:', result[0]);
      }
      return result;
    } catch (error) {
      console.error('[DbStorage] Error fetching employees:', error);
      return [];
    }
  }

  async getEmployeeCountsByDepartment(): Promise<Map<number, number>> {
    try {
      const result = await db
        .select({
          departmentId: employees.departmentId,
          count: count(employees.id)
        })
        .from(employees)
        .groupBy(employees.departmentId);

      const map = new Map<number, number>();
      result.forEach(row => {
        if (row.departmentId) {
          map.set(row.departmentId, Number(row.count));
        }
      });
      return map;
    } catch (error) {
      console.error("[DbStorage] Error counting employees:", error);
      return new Map();
    }
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    // Use a transaction to ensure sequence reset and insert happen together
    return await db.transaction(async (tx) => {
      try {
        // First ensure the sequence is properly set
        await tx.execute(sql`
          SELECT setval('employees_id_seq', coalesce((SELECT MAX(id) FROM employees), 0) + 1, false);
        `);

        // Now perform the insert within the same transaction
        const [newEmployee] = await tx.insert(employees).values(employee).returning();
        return newEmployee;
      } catch (error) {
        console.error("Error in createEmployee transaction:", error);
        throw error;
      }
    });
  }

  async deleteEmployee(id: number): Promise<void> {
    // Use a transaction to ensure both deletions succeed or fail together
    await db.transaction(async (tx) => {
      console.log(`[DbStorage] Deleting attendance entries for employee ${id}`);
      await tx.delete(attendanceEntries).where(eq(attendanceEntries.employeeId, id));

      console.log(`[DbStorage] Deleting employee ${id}`);
      await tx.delete(employees).where(eq(employees.id, id));
    });
    console.log(`[DbStorage] Successfully deleted employee ${id} and related attendance entries`);
  }

  async updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee> {
    const [updatedEmployee] = await db
      .update(employees)
      .set(updates)
      .where(eq(employees.id, id))
      .returning();
    return updatedEmployee;
  }

  async getAllEmployees(): Promise<Employee[]> {
    try {
      console.log('[DbStorage] Fetching all employees');
      const result = await db.query.employees.findMany();
      console.log(`[DbStorage] Found ${result.length} total employees`);
      if (result.length > 0) {
        console.log('[DbStorage] Sample employee:', result[0]);
      }
      return result;
    } catch (error) {
      console.error('[DbStorage] Error fetching all employees:', error);
      throw error;
    }
  }

  // Attendance operations
  async createAttendanceReport(report: InsertAttendanceReport): Promise<AttendanceReport> {
    // Add transaction ID to the report data
    const reportWithTransactionId = {
      ...report,
      transactionId: uuid().slice(0, 8).toUpperCase()
    };

    const [newReport] = await db.insert(attendanceReports).values(reportWithTransactionId).returning();
    return newReport;
  }

  async getAttendanceReport(id: number): Promise<AttendanceReport | undefined> {
    return await db.query.attendanceReports.findFirst({
      where: eq(attendanceReports.id, id),
    });
  }

  async getAttendanceReportsByDepartment(departmentId: number): Promise<AttendanceReport[]> {
    return await db.query.attendanceReports.findMany({
      where: eq(attendanceReports.departmentId, departmentId),
    });
  }

  async getAllAttendanceReports(): Promise<AttendanceReport[]> {
    return await db.query.attendanceReports.findMany();
  }

  async updateAttendanceReport(id: number, updates: Partial<AttendanceReport>): Promise<AttendanceReport> {
    // If status is being updated to "sent", check if we need to add receipt details
    if (updates.status === "sent") {
      // First get the current report
      const currentReport = await this.getAttendanceReport(id);

      // If the report doesn't already have a receipt number, generate one
      if (currentReport && !currentReport.receiptNo) {
        // Find the highest receipt number in the database
        const reports = await this.getAllAttendanceReports();

        // Filter out reports with no receipt number and find the maximum
        const maxReceiptNo = reports
          .filter(report => report.receiptNo !== null)
          .reduce((max, report) => Math.max(max, report.receiptNo || 0), 0);

        // Start from 1 if no receipt numbers exist, otherwise increment by 1
        const newReceiptNo = maxReceiptNo > 0 ? maxReceiptNo + 1 : 1;

        // Add receipt number and date to updates
        updates.receiptNo = newReceiptNo;

        // Make sure receiptDate is a proper date object
        if (!updates.receiptDate) {
          updates.receiptDate = new Date();
        }
      }
    }

    // Perform the update
    const [updatedReport] = await db
      .update(attendanceReports)
      .set(updates)
      .where(eq(attendanceReports.id, id))
      .returning();

    return updatedReport;
  }

  async deleteAttendanceReport(id: number): Promise<void> {
    // Use a transaction to ensure both deletions succeed or fail together
    await db.transaction(async (tx) => {
      console.log(`[DbStorage] Deleting attendance entries for report ${id}`);
      await tx.delete(attendanceEntries).where(eq(attendanceEntries.reportId, id));

      console.log(`[DbStorage] Deleting attendance report ${id}`);
      await tx.delete(attendanceReports).where(eq(attendanceReports.id, id));
    });
    console.log(`[DbStorage] Successfully deleted report ${id} and related entries`);
  }

  async createAttendanceEntry(entry: InsertAttendanceEntry): Promise<AttendanceEntry> {
    const [newEntry] = await db.insert(attendanceEntries).values(entry).returning();
    return newEntry;
  }

  async getAttendanceEntriesByReport(reportId: number): Promise<AttendanceEntry[]> {
    return await db.query.attendanceEntries.findMany({
      where: eq(attendanceEntries.reportId, reportId),
    });
  }

  async updateAttendanceEntry(id: number, updates: Partial<AttendanceEntry>): Promise<AttendanceEntry> {
    const [updatedEntry] = await db
      .update(attendanceEntries)
      .set(updates)
      .where(eq(attendanceEntries.id, id))
      .returning();
    return updatedEntry;
  }

  // Delete only entries for a report (keep the report record itself)
  async deleteEntriesForReport(reportId: number): Promise<void> {
    await db.delete(attendanceEntries).where(eq(attendanceEntries.reportId, reportId));
  }


  // Password reset token methods
  async storeResetToken(departmentId: number, token: string, expiry: Date): Promise<void> {
    resetTokens.set(departmentId, { token, expiry });
  }

  async validateResetToken(departmentId: number, token: string): Promise<boolean> {
    const tokenData = resetTokens.get(departmentId);
    if (!tokenData) return false;

    if (tokenData.token !== token) return false;

    // Check if token has expired
    if (tokenData.expiry < new Date()) {
      // Token expired, clean it up
      resetTokens.delete(departmentId);
      return false;
    }

    return true;
  }

  async clearResetToken(departmentId: number): Promise<void> {
    resetTokens.delete(departmentId);
  }

  // Document operations
  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  async getAllDocuments(): Promise<Document[]> {
    return await db.query.documents.findMany({
      orderBy: (documents, { desc }) => [desc(documents.uploadedAt)]
    });
  }

  async getDocumentsByDepartment(departmentId: number): Promise<Document[]> {
    return await db.query.documents.findMany({
      where: eq(documents.departmentId, departmentId),
      orderBy: (documents, { desc }) => [desc(documents.uploadedAt)]
    });
  }

  async searchDocuments(searchTerm: string): Promise<Document[]> {
    return await db.query.documents.findMany({
      where: or(
        like(documents.documentType, `%${searchTerm}%`),
        like(documents.issuingAuthority, `%${searchTerm}%`),
        like(documents.subject, `%${searchTerm}%`),
        like(documents.refNo, `%${searchTerm}%`),
        like(documents.date, `%${searchTerm}%`),
        like(documents.departmentName, `%${searchTerm}%`)
      ),
      orderBy: (documents, { desc }) => [desc(documents.uploadedAt)]
    });
  }

  async getDocumentByRefNoAndDate(refNo: string, date: string): Promise<Document | undefined> {
    return await db.query.documents.findFirst({
      where: and(
        eq(documents.refNo, refNo),
        eq(documents.date, date)
      )
    });
  }

  async getDocument(id: number): Promise<Document | undefined> {
    return await db.query.documents.findFirst({
      where: eq(documents.id, id)
    });
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document> {
    const [updatedDocument] = await db
      .update(documents)
      .set(updates)
      .where(eq(documents.id, id))
      .returning();
    return updatedDocument;
  }

  // ========== ATTENDANCE PERMISSION METHODS ==========

  async updateAllDepartmentsAttendancePermission(enabled: boolean): Promise<void> {
    await db.update(departments).set({ attendancePermitted: enabled });
  }

  async updateDepartmentAttendancePermission(departmentId: number, permitted: boolean): Promise<Department | undefined> {
    const [updated] = await db.update(departments)
      .set({ attendancePermitted: permitted })
      .where(eq(departments.id, departmentId))
      .returning();
    return updated;
  }

  async deleteFile(filePath: string): Promise<void> {
    console.log(`[Debug] deleteFile called with: '${filePath}'`);

    if (!filePath) return;

    // Use relaxed check to handle leading slashes or missing slashes
    if (!filePath.includes('uploads')) {
      console.log('[DbStorage] Invalid file path (does not contain "uploads"):', filePath);
      return;
    }

    try {
      // Fix for __dirname in ES modules
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      console.log(`[Debug] __dirname: ${__dirname}`);

      let cleanPath = filePath;
      // Handle full URLs (e.g. http://localhost:5001/uploads/file.png)
      if (filePath.startsWith('http')) {
        try {
          const url = new URL(filePath);
          cleanPath = url.pathname; // Should be /uploads/file.png
          console.log(`[Debug] Extracted pathname from URL: ${cleanPath}`);
        } catch (e) {
          console.log(`[Debug] Failed to parse URL: ${filePath}, using as is.`);
        }
      }

      // Normalize filePath: strip all leading slashes/backslashes to get clean relative path
      // e.g. "/uploads/file.png" -> "uploads/file.png"
      const relativePath = cleanPath.replace(/^[\/\\]+/, '');
      console.log(`[Debug] Normalized relativePath: ${relativePath}`);

      // Construct absolute path. Assuming __dirname is '.../server', so '..' is root.
      const absolutePath = path.join(__dirname, '..', relativePath);
      console.log(`[Debug] Absolute path: ${absolutePath}`);

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        console.log(`[DbStorage] SUCCESS: Deleted file: ${absolutePath}`);
      } else {
        console.log(`[DbStorage] FAILURE: File not found at path: ${absolutePath}`);
        // Debug: list project root uploads folder
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          console.log(`[Debug] Contents of ${uploadsDir}:`, files);
        } else {
          console.log(`[Debug] Uploads dir does not exist at ${uploadsDir}`);
        }
      }
    } catch (error) {
      console.error(`[DbStorage] EXCEPTION during file deletion:`, error);
    }
  }

  // ========== TICKET METHODS ==========

  async createTicket(ticket: InsertTicket): Promise<Ticket> {
    const [newTicket] = await db.insert(tickets).values(ticket).returning();
    // Fetch department name
    const dept = await this.getDepartment(newTicket.departmentId);
    return { ...newTicket, departmentName: dept?.name || 'Unknown' };
  }

  async getTicket(id: number): Promise<Ticket | undefined> {
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, id)
    });
    if (!ticket) return undefined;
    const dept = await this.getDepartment(ticket.departmentId);
    return { ...ticket, departmentName: dept?.name || 'Unknown' };
  }

  async getTicketsByDepartment(departmentId: number): Promise<Ticket[]> {
    const ticketList = await db.query.tickets.findMany({
      where: eq(tickets.departmentId, departmentId),
      orderBy: (tickets, { desc }) => [desc(tickets.createdAt)]
    });
    const dept = await this.getDepartment(departmentId);
    return ticketList.map(t => ({ ...t, departmentName: dept?.name || 'Unknown' }));
  }

  async getAllTickets(): Promise<Ticket[]> {
    const ticketList = await db.query.tickets.findMany({
      orderBy: (tickets, { desc }) => [desc(tickets.createdAt)]
    });
    // Fetch all departments for mapping
    const allDepts = await this.getAllDepartments();
    const deptMap = new Map(allDepts.map(d => [d.id, d.name]));
    return ticketList.map(t => ({ ...t, departmentName: deptMap.get(t.departmentId) || 'Unknown' }));
  }

  async getTicketStats(): Promise<{ open: number; inProgress: number; resolved: number; closed: number }> {
    const ticketList = await db.query.tickets.findMany();
    return {
      open: ticketList.filter(t => t.status === 'Open').length,
      inProgress: ticketList.filter(t => t.status === 'In Progress').length,
      resolved: ticketList.filter(t => t.status === 'Resolved').length,
      closed: ticketList.filter(t => t.status === 'Closed').length,
    };
  }

  async updateTicket(id: number, updates: Partial<Ticket>): Promise<Ticket> {
    const [updatedTicket] = await db
      .update(tickets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return updatedTicket;
  }

  async deleteTicket(id: number): Promise<void> {
    await db.delete(tickets).where(eq(tickets.id, id));
  }

  // ========== NOTICE SYSTEM ==========

  async createNotice(data: { subject: string; message: string; imageUrl?: string | null; isGlobal: boolean; createdBy: string; departmentIds?: number[] }): Promise<any> {
    // First ensure tables exist
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

    // Insert notice
    const result = await db.execute(sql`
      INSERT INTO notices (subject, message, image_url, is_global, created_by)
      VALUES (${data.subject}, ${data.message}, ${data.imageUrl || null}, ${data.isGlobal}, ${data.createdBy})
      RETURNING *
    `);

    const notice = result.rows[0] as any;

    // If not global, add recipient departments
    if (!data.isGlobal && data.departmentIds && data.departmentIds.length > 0) {
      for (const deptId of data.departmentIds) {
        await db.execute(sql`
          INSERT INTO notice_recipients (notice_id, department_id)
          VALUES (${notice.id}, ${deptId})
        `);
      }
    }

    return notice;
  }

  async getAllNotices(): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM notices ORDER BY created_at DESC
      `);
      return result.rows as any[];
    } catch {
      return [];
    }
  }

  async getNoticesForDepartment(departmentId: number): Promise<any[]> {
    try {
      // Get global notices + notices specifically for this department
      const result = await db.execute(sql`
        SELECT DISTINCT n.* FROM notices n
        LEFT JOIN notice_recipients nr ON n.id = nr.notice_id
        WHERE n.is_global = true 
           OR nr.department_id = ${departmentId}
        ORDER BY n.created_at DESC
      `);
      return result.rows as any[];
    } catch {
      return [];
    }
  }

  async getNotice(id: number): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT * FROM notices WHERE id = ${id}
      `);
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  async deleteNotice(id: number): Promise<void> {
    try {
      await db.execute(sql`DELETE FROM notice_recipients WHERE notice_id = ${id}`);
      await db.execute(sql`DELETE FROM notices WHERE id = ${id}`);
    } catch (error) {
      console.error("Error deleting notice:", error);
    }
  }
}
