import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import {
  Department,
  Employee,
  AttendanceReport,
  AttendanceEntry,
  InsertDepartment,
  InsertEmployee,
  InsertAttendanceReport,
  InsertAttendanceEntry,
} from "@shared/schema";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to delete file if it exists
function deleteFileIfExists(filePath: string) {
  // Only process paths that start with /uploads/
  if (!filePath || !filePath.startsWith('/uploads/')) {
    return;
  }

  // Convert URL path to file system path
  const absolutePath = path.join(__dirname, '..', filePath);

  if (fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
      console.log(`Deleted file: ${absolutePath}`);
    } catch (error) {
      console.error(`Error deleting file ${absolutePath}:`, error);
    }
  }
}

export interface IStorage {
  // Department operations
  getDepartment(id: number): Promise<Department | undefined>;
  getDepartmentByEmail(email: string): Promise<Department | undefined>;
  createDepartment(department: InsertDepartment): Promise<Department>;
  getAllDepartments(): Promise<Department[]>;
  // Employee operations
  getEmployee(id: number): Promise<Employee | undefined>;
  getEmployeesByDepartment(departmentId: number): Promise<Employee[]>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  deleteEmployee(id: number): Promise<void>;
  updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee>;
  // Attendance operations
  createAttendanceReport(report: InsertAttendanceReport): Promise<AttendanceReport>;
  getAttendanceReport(id: number): Promise<AttendanceReport | undefined>;
  getAttendanceReportsByDepartment(departmentId: number): Promise<AttendanceReport[]>;
  getAllAttendanceReports(): Promise<AttendanceReport[]>;
  updateAttendanceReport(id: number, updates: Partial<AttendanceReport>): Promise<AttendanceReport>;
  deleteAttendanceReport(id: number): Promise<void>;
  createAttendanceEntry(entry: InsertAttendanceEntry): Promise<AttendanceEntry>;
  getAttendanceEntriesByReport(reportId: number): Promise<AttendanceEntry[]>;
  updateAttendanceEntry(id: number, updates: Partial<AttendanceEntry>): Promise<AttendanceEntry>;
}

export class MemStorage implements IStorage {
  private departments: Map<number, Department>;
  private employees: Map<number, Employee>;
  private attendanceReports: Map<number, AttendanceReport>;
  private attendanceEntries: Map<number, AttendanceEntry>;
  private currentId: { [key: string]: number };
  private lastReceiptNo: number;

  constructor() {
    this.departments = new Map();
    this.employees = new Map();
    this.attendanceReports = new Map();
    this.attendanceEntries = new Map();
    this.currentId = {
      department: 1,
      employee: 1,
      report: 1,
      entry: 1,
    };
    this.lastReceiptNo = 0; // Initialize receipt number counter
  }

  async getDepartment(id: number): Promise<Department | undefined> {
    return this.departments.get(id);
  }

  async getDepartmentByEmail(email: string): Promise<Department | undefined> {
    return Array.from(this.departments.values()).find(d => d.email === email);
  }

  async createDepartment(department: InsertDepartment): Promise<Department> {
    const id = this.currentId.department++;
    const newDepartment = { ...department, id };
    this.departments.set(id, newDepartment);
    return newDepartment;
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    return this.employees.get(id);
  }

  async getEmployeesByDepartment(departmentId: number): Promise<Employee[]> {
    return Array.from(this.employees.values()).filter(
      e => e.departmentId === departmentId
    );
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const id = this.currentId.employee++;

    // Convert joiningDate to string format as per schema
    const joiningDateStr = employee.joiningDate instanceof Date
      ? employee.joiningDate.toISOString().split('T')[0]
      : employee.joiningDate;

    const newEmployee = {
      ...employee,
      id,
      joiningDate: joiningDateStr,
      joiningShift: employee.joiningShift || "morning",
      officeMemoNo: employee.officeMemoNo || "",
      salaryRegisterNo: employee.salaryRegisterNo || "",
      bankAccount: employee.bankAccount || "",
      panNumber: employee.panNumber || "",
      aadharCard: employee.aadharCard || ""
    };

    // Log the employee being created
    console.log('Creating employee in storage:', newEmployee);

    this.employees.set(id, newEmployee);
    return newEmployee;
  }

  async deleteEmployee(id: number): Promise<void> {
    const employee = this.employees.get(id);
    if (employee) {
      // Delete all associated files
      if (employee.panCardUrl) deleteFileIfExists(employee.panCardUrl);
      if (employee.bankProofUrl) deleteFileIfExists(employee.bankProofUrl);
      if (employee.aadharCardUrl) deleteFileIfExists(employee.aadharCardUrl);
      if (employee.officeMemoUrl) deleteFileIfExists(employee.officeMemoUrl);
      if (employee.joiningReportUrl) deleteFileIfExists(employee.joiningReportUrl);

      // Remove from storage
      this.employees.delete(id);
      console.log(`Employee ${id} and associated files deleted successfully`);
    }
  }

  async updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee> {
    const employee = await this.getEmployee(id);
    if (!employee) throw new Error("Employee not found");

    const updatedEmployee = { ...employee, ...updates };
    this.employees.set(id, updatedEmployee);
    return updatedEmployee;
  }

  async createAttendanceReport(report: InsertAttendanceReport): Promise<AttendanceReport> {
    const id = this.currentId.report++;
    const newReport = {
      ...report,
      id,
      createdAt: new Date(),
      status: report.status || "draft",
      transactionId: uuid().slice(0, 8).toUpperCase(),
      receiptNo: null,
      receiptDate: null,
      despatchNo: null,
      despatchDate: null,
      fileUrl: null
    };
    this.attendanceReports.set(id, newReport);
    return newReport;
  }

  async getAttendanceReport(id: number): Promise<AttendanceReport | undefined> {
    return this.attendanceReports.get(id);
  }

  async getAttendanceReportsByDepartment(departmentId: number): Promise<AttendanceReport[]> {
    return Array.from(this.attendanceReports.values()).filter(
      r => r.departmentId === departmentId
    );
  }

  async getAllAttendanceReports(): Promise<AttendanceReport[]> {
    return Array.from(this.attendanceReports.values());
  }

  async updateAttendanceReport(id: number, updates: Partial<AttendanceReport>): Promise<AttendanceReport> {
    const report = await this.getAttendanceReport(id);
    if (!report) throw new Error("Report not found");

    // If status is changing to "sent" and there's no receipt number yet
    if (updates.status === "sent" && !report.receiptNo) {
      this.lastReceiptNo++;
      updates.receiptNo = this.lastReceiptNo;
      updates.receiptDate = new Date();
    }

    const updatedReport = { ...report, ...updates };
    this.attendanceReports.set(id, updatedReport);
    return updatedReport;
  }

  async deleteAttendanceReport(id: number): Promise<void> {
    // Delete associated entries first
    const entries = await this.getAttendanceEntriesByReport(id);
    entries.forEach(entry => {
      this.attendanceEntries.delete(entry.id);
    });

    // Then delete the report
    this.attendanceReports.delete(id);
  }

  async createAttendanceEntry(entry: InsertAttendanceEntry): Promise<AttendanceEntry> {
    const id = this.currentId.entry++;
    const newEntry = {
      ...entry,
      id,
      remarks: entry.remarks || null,
      fromDate: entry.fromDate || "",
      toDate: entry.toDate || "",
      periods: entry.periods
    };

    // Log the entry being created
    console.log('Creating attendance entry:', newEntry);

    this.attendanceEntries.set(id, newEntry);
    return newEntry;
  }

  async getAttendanceEntriesByReport(reportId: number): Promise<AttendanceEntry[]> {
    return Array.from(this.attendanceEntries.values()).filter(
      e => e.reportId === reportId
    );
  }

  async updateAttendanceEntry(id: number, updates: Partial<AttendanceEntry>): Promise<AttendanceEntry> {
    const entry = this.attendanceEntries.get(id);
    if (!entry) throw new Error("Entry not found");

    const updatedEntry = { ...entry, ...updates };
    this.attendanceEntries.set(id, updatedEntry);
    return updatedEntry;
  }

  async getAllDepartments(): Promise<Department[]> {
    return Array.from(this.departments.values());
  }
}

export const storage = new MemStorage();