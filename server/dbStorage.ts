import { db } from "./db";
import { departments, employees, attendanceReports, attendanceEntries } from "@shared/schema";
import { eq, and } from "drizzle-orm";
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
} from "@shared/schema";

export class DbStorage implements IStorage {
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

  // Employee operations
  async getEmployee(id: number): Promise<Employee | undefined> {
    return await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });
  }

  async getEmployeesByDepartment(departmentId: number): Promise<Employee[]> {
    return await db.query.employees.findMany({
      where: eq(employees.departmentId, departmentId),
    });
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const [newEmployee] = await db.insert(employees).values(employee).returning();
    return newEmployee;
  }

  async deleteEmployee(id: number): Promise<void> {
    await db.delete(employees).where(eq(employees.id, id));
  }

  async updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee> {
    const [updatedEmployee] = await db
      .update(employees)
      .set(updates)
      .where(eq(employees.id, id))
      .returning();
    return updatedEmployee;
  }

  // Attendance operations
  async createAttendanceReport(report: InsertAttendanceReport): Promise<AttendanceReport> {
    const [newReport] = await db.insert(attendanceReports).values(report).returning();
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
} 