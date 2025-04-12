import { db } from "./db";
import { testDbConnection } from "./db";
import { departments, employees, attendanceReports, attendanceEntries, departmentNames } from "@shared/schema";
import { eq, and } from "drizzle-orm";
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
    const [newDepartment] = await db.insert(departments).values(department).returning();
    return newDepartment;
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

  // Employee operations
  async getEmployee(id: number): Promise<Employee | undefined> {
    return await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
  }

  async getEmployeesByDepartment(departmentId: number): Promise<Employee[]> {
    try {
      console.log(`[DbStorage] Fetching employees for department ${departmentId}`);
      const result = await db.query.employees.findMany({
        where: eq(employees.departmentId, departmentId),
      });
      console.log(`[DbStorage] Found ${result.length} employees`);
      if (result.length > 0) {
        console.log('[DbStorage] Sample employee:', result[0]);
      }
      return result;
    } catch (error) {
      console.error('[DbStorage] Error fetching employees:', error);
      throw error;
    }
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const [newEmployee] = await db.insert(employees).values(employee).returning();
    return newEmployee;
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
} 