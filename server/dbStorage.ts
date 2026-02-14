import { db } from "./db";
import { testDbConnection } from "./db";
import { departments, employees, attendanceReports, attendanceEntries, departmentNames, documents, admins, tickets, transferRequests, employeeHistory } from "@shared/schema";
import { eq, and, or, like, ne, sql, count, max, desc } from "drizzle-orm";
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
  InsertTicket,
  TransferRequest,
  InsertTransferRequest,
  EmployeeHistory,
  InsertEmployeeHistory
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
      const result = await db.query.employees.findMany({
        where: eq(employees.departmentId, departmentId)
      });
      if (result.length > 0) {
      }
      return result;
    } catch (error) {
      console.error('[DbStorage] Error fetching employees:', error);
      return [];
    }
  }

  async getEmployeeByEpid(epid: string): Promise<Employee | undefined> {
    try {
      const result = await db.query.employees.findFirst({
        where: eq(employees.epid, epid)
      });
      return result;
    } catch (error) {
      console.error('[DbStorage] Error fetching employee by EPID:', error);
      return undefined;
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
      await tx.delete(attendanceEntries).where(eq(attendanceEntries.employeeId, id));

      await tx.delete(employees).where(eq(employees.id, id));
    });
  }

  async updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee> {
    const [updatedEmployee] = await db
      .update(employees)
      .set(updates)
      .where(eq(employees.id, id))
      .returning();
    return updatedEmployee;
  }

  async reorderEmployees(updates: { id: number; sortOrder: number }[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(employees)
          .set({ sortOrder: update.sortOrder })
          .where(eq(employees.id, update.id));
      }
    });
  }

  async getAllEmployees(): Promise<Employee[]> {
    try {
      const result = await db.query.employees.findMany();
      return result;
    } catch (error) {
      console.error('[DbStorage] Error fetching all employees:', error);
      throw error;
    }
  }

  async searchEmployeesGlobal(query: string, excludeDepartmentId: number): Promise<any[]> {
    // Basic validation
    if (!query || query.length < 2) return [];

    const searchPattern = `%${query}%`;

    // Perform search
    const results = await db.query.employees.findMany({
      where: and(
        ne(employees.departmentId, excludeDepartmentId),
        or(
          like(employees.name, searchPattern),
          like(employees.epid, searchPattern),
          like(employees.designation, searchPattern)
        )
      ),
      limit: 20
    });

    // We need to fetch department names for these employees
    // Efficient way: get all depts involved
    const deptIds = Array.from(new Set(results.map(e => e.departmentId)));
    const deptMap = new Map<number, string>();

    // Determine which depts we need to fetch
    // Actually, getting all departments is cached/fast enough usually, or we can fetch individually
    // For now, let's just fetch all departments if list is small, or use getDepartment helper
    // Better: Helper to enrich
    const enrichedResults = await Promise.all(results.map(async (emp) => {
      const dept = await this.getDepartment(emp.departmentId);
      return {
        ...emp,
        departmentName: dept?.name || "Unknown Department"
      };
    }));

    return enrichedResults;
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

  async getAvailableAttendanceMonths(): Promise<{ month: number; year: number }[]> {
    try {
      // Get unique month/year combinations from attendance reports using raw SQL
      // This ensures we avoid any potential ORM issues with distinct + order by
      const result = await db.execute(sql`
        SELECT DISTINCT month, year 
        FROM attendance_reports 
        ORDER BY year DESC, month DESC
      `);

      if (result.rows.length > 0) {
      }

      // Map the rows to the expected format (ensure numbers)
      return result.rows.map(row => ({
        month: Number(row.month),
        year: Number(row.year)
      }));
    } catch (error) {
      console.error("[DbStorage] Error in getAvailableAttendanceMonths:", error);
      return [];
    }
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
      await tx.delete(attendanceEntries).where(eq(attendanceEntries.reportId, id));

      await tx.delete(attendanceReports).where(eq(attendanceReports.id, id));
    });
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

  async updateDepartmentSupplementaryPermission(departmentId: number, allowed: boolean): Promise<Department | undefined> {
    const [updated] = await db.update(departments)
      .set({ allowSupplementaryReport: allowed })
      .where(eq(departments.id, departmentId))
      .returning();
    return updated;
  }

  async deleteFile(filePath: string): Promise<void> {

    if (!filePath) return;

    // Use relaxed check to handle leading slashes or missing slashes
    if (!filePath.includes('uploads')) {
      return;
    }

    try {
      // Fix for __dirname in ES modules
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      let cleanPath = filePath;
      // Handle full URLs (e.g. http://localhost:5001/uploads/file.png)
      if (filePath.startsWith('http')) {
        try {
          const url = new URL(filePath);
          cleanPath = url.pathname; // Should be /uploads/file.png
        } catch (e) {
        }
      }

      // Normalize filePath: strip all leading slashes/backslashes to get clean relative path
      // e.g. "/uploads/file.png" -> "uploads/file.png"
      const relativePath = cleanPath.replace(/^[\/\\]+/, '');

      // Construct absolute path. Assuming __dirname is '.../server', so '..' is root.
      const absolutePath = path.join(__dirname, '..', relativePath);

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      } else {
        // Debug: list project root uploads folder
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
        } else {
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

  // ========== TRANSFER REQUEST METHODS ==========

  async createTransferRequest(request: InsertTransferRequest): Promise<TransferRequest> {
    const [newRequest] = await db.insert(transferRequests).values(request).returning();
    return newRequest;
  }

  async getTransferRequest(id: number): Promise<TransferRequest | undefined> {
    return await db.query.transferRequests.findFirst({
      where: eq(transferRequests.id, id)
    });
  }

  async getTransferRequestsForDepartment(departmentId: number, type: 'incoming' | 'outgoing'): Promise<TransferRequest[]> {
    if (type === 'incoming') {
      return await db.query.transferRequests.findMany({
        where: eq(transferRequests.toDepartmentId, departmentId),
        orderBy: (transferRequests, { desc }) => [desc(transferRequests.createdAt)]
      });
    } else {
      return await db.query.transferRequests.findMany({
        where: eq(transferRequests.fromDepartmentId, departmentId),
        orderBy: (transferRequests, { desc }) => [desc(transferRequests.createdAt)]
      });
    }
  }

  async getPendingTransferCount(departmentId: number): Promise<number> {
    const result = await db
      .select({ count: count(transferRequests.id) })
      .from(transferRequests)
      .where(and(
        eq(transferRequests.toDepartmentId, departmentId),
        eq(transferRequests.status, 'pending')
      ));
    return Number(result[0]?.count || 0);
  }

  async updateTransferRequest(id: number, updates: Partial<TransferRequest>): Promise<TransferRequest> {
    const [updatedRequest] = await db
      .update(transferRequests)
      .set(updates)
      .where(eq(transferRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async getTransferRequestByEmployee(employeeId: number): Promise<TransferRequest | undefined> {
    return await db.query.transferRequests.findFirst({
      where: and(
        eq(transferRequests.employeeId, employeeId),
        eq(transferRequests.status, 'pending')
      )
    });
  }

  async getLastTransferRequest(employeeId: number): Promise<TransferRequest | undefined> {
    return await db.query.transferRequests.findFirst({
      where: eq(transferRequests.employeeId, employeeId),
      orderBy: (transferRequests, { desc }) => [desc(transferRequests.createdAt)]
    });
  }

  async getGlobalTransferStats(): Promise<{ pendingTransfer: number; pendingRelease: number; resolved: number }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Helper to count based on conditions
    // Note: In Drizzle with standard pg driver, count() returns distinct rows.
    // We'll fetch all and filter for flexibility or use raw SQL if performance needed later.
    // For now, findMany with where clause is clean.

    const allRequests = await db.query.transferRequests.findMany();

    const pendingTransfer = allRequests.filter(r => r.status === 'pending').length;
    const pendingRelease = allRequests.filter(r => r.status === 'release_requested').length;

    // Resolved in current month (Accepted or Rejected)
    const resolved = allRequests.filter(r => {
      const isResolvedStatus = r.status === 'accepted' || r.status === 'rejected';
      if (!isResolvedStatus) return false;

      // Check processedAt date
      const processedDate = r.processedAt ? new Date(r.processedAt) : null;
      return processedDate && processedDate >= startOfMonth;
    }).length;

    return {
      pendingTransfer,
      pendingRelease,
      resolved
    };
  }

  async getAllTransferRequests(): Promise<any[]> {
    const requests = await db.query.transferRequests.findMany({
      orderBy: (transferRequests, { desc }) => [desc(transferRequests.createdAt)]
    });

    // Enrich with names
    // Optimization: Fetch all needed employees and departments in one go if list is huge.
    // For MVP, Promise.all is acceptable.
    const enriched = await Promise.all(requests.map(async (req) => {
      const employee = await this.getEmployee(req.employeeId);
      const fromDept = await this.getDepartment(req.fromDepartmentId);
      const toDept = await this.getDepartment(req.toDepartmentId);

      return {
        ...req,
        employeeName: employee?.name || 'Unknown',
        employeeEpid: employee?.epid || 'Unknown',
        fromDepartmentName: fromDept?.name || 'Unknown',
        toDepartmentName: toDept?.name || 'Unknown'
      };
    }));

    return enriched;
  }

  // ========== EMPLOYEE HISTORY / AUDIT TRAIL METHODS ==========

  async createHistoryEntry(entry: InsertEmployeeHistory): Promise<EmployeeHistory> {
    const [newEntry] = await db.insert(employeeHistory).values(entry).returning();
    return newEntry;
  }

  async getEmployeeHistory(employeeId: number): Promise<any[]> {
    return await db.select({
      id: employeeHistory.id,
      employeeId: employeeHistory.employeeId,
      action: employeeHistory.action,
      field: employeeHistory.field,
      previousValue: employeeHistory.previousValue,
      changedBy: employeeHistory.changedBy,
      changedByRole: employeeHistory.changedByRole,
      departmentId: employeeHistory.departmentId,
      timestamp: employeeHistory.timestamp,
      departmentName: departments.name
    })
      .from(employeeHistory)
      .leftJoin(departments, eq(employeeHistory.departmentId, departments.id))
      .where(eq(employeeHistory.employeeId, employeeId))
      .orderBy(desc(employeeHistory.timestamp));
  }

  // Helper method to log employee changes (for audit trail)
  async logEmployeeChange(
    employeeId: number,
    action: string,
    field: string,
    previousValue: string | null,
    changedBy: string,
    changedByRole: string,
    departmentId?: number
  ): Promise<void> {
    try {
      await db.insert(employeeHistory).values({
        employeeId,
        action,
        field,
        previousValue,
        changedBy,
        changedByRole,
        departmentId: departmentId || null
      });
    } catch (error) {
      console.error("Error logging employee change:", error);
      // Don't throw - audit logging failure shouldn't break the main operation
    }
  }

  // Batch log multiple changes for an employee update
  async logEmployeeChanges(
    employeeId: number,
    oldEmployee: Partial<Employee>,
    newEmployee: Partial<Employee>,
    changedBy: string,
    changedByRole: string,
    departmentId?: number
  ): Promise<void> {
    const fieldsToTrack = [
      'epid', 'name', 'panNumber', 'bankAccount', 'aadharCard',
      'designation', 'employmentStatus', 'payLevel', 'termExpiry',
      'joiningDate', 'salaryRegisterNo', 'officeMemoNo', 'joiningShift',
      'salary_asstt', 'isActive', 'disableReason', 'disableWefDate', 'remarks',
      'departmentId' // Added departmentId to tracking
    ];

    // Helper to normalize values for comparison
    const normalize = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (val instanceof Date) return val.toISOString().split('T')[0];
      return String(val).trim();
    };

    for (const field of fieldsToTrack) {
      // Skip fields not present in the update payload
      if (newEmployee[field as keyof Employee] === undefined) continue;

      const oldValue = oldEmployee[field as keyof Employee];
      const newValue = newEmployee[field as keyof Employee];

      const normOld = normalize(oldValue);
      const normNew = normalize(newValue);

      if (normOld !== normNew) {
        let displayValue = normOld;

        // If tracking departmentId, try to resolve the department name
        if (field === 'departmentId' && oldValue) {
          try {
            const dept = await this.getDepartment(Number(oldValue));
            if (dept) {
              displayValue = dept.name;
            }
          } catch (err) {
            console.error("Error fetching department name for log:", err);
          }
        }

        await this.logEmployeeChange(
          employeeId,
          'update',
          field,
          displayValue, // Log the resolved name or normalized value
          changedBy,
          changedByRole,
          departmentId
        );
      }
    }

    // Track document changes
    const docFields = ['panCardUrl', 'bankProofUrl', 'aadharCardUrl', 'officeMemoUrl', 'joiningReportUrl', 'termExtensionUrl'];
    for (const field of docFields) {
      // Skip fields not present in the update payload - Fixes false 'Document Deleted' logs
      if (newEmployee[field as keyof Employee] === undefined) continue;

      const oldValue = oldEmployee[field as keyof Employee];
      const newValue = newEmployee[field as keyof Employee];

      // Normalize logic for documents as well to handle null vs empty string
      const normOld = normalize(oldValue);
      const normNew = normalize(newValue);

      if (normOld !== normNew) {
        const action = newValue ? 'document_update' : 'document_delete';
        await this.logEmployeeChange(
          employeeId,
          action,
          field,
          normOld === '' ? 'none' : normOld,
          changedBy,
          changedByRole,
          departmentId
        );
      }
    }
  }
}
