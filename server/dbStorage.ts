import { db } from "./db";
import { testDbConnection } from "./db";
import { departments, employees, attendanceReports, attendanceEntries, departmentNames, documents } from "@shared/schema";
import { eq, and, or, like } from "drizzle-orm";
import { v4 as uuid } from "uuid";
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
  InsertDepartmentName
} from "@shared/schema";
import { sql, max } from "drizzle-orm";

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
  
  // Authentication methods
  async adminLogin(email: string, password: string): Promise<any> {
    try {
      // This is a simplified version - in a real app you'd verify password with bcrypt
      // For demo purposes, check if this is the admin account (update with your actual admin email)
      if (email === "admin@amu.ac.in" && password === "123") {
        return { id: 1, email, role: "admin" };
      }
      return null;
    } catch (error) {
      console.error("Admin login error:", error);
      return null;
    }
  }
  
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
    // First, delete all associated entries to avoid foreign key constraint violations
    await db.delete(attendanceEntries).where(eq(attendanceEntries.reportId, id));
    
    // Then delete the report itself
    await db.delete(attendanceReports).where(eq(attendanceReports.id, id));
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

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }
} 