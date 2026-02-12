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
  DepartmentName,
  Document,
  InsertDocument,
  Admin,
  InsertAdmin
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
  updateDepartment(id: number, updates: Partial<Department>): Promise<Department>;
  deleteDepartment(id: number): Promise<void>;
  getAllDepartments(): Promise<Department[]>;
  // Employee operations
  getEmployee(id: number): Promise<Employee | undefined>;
  getEmployeesByDepartment(departmentId: number): Promise<Employee[]>;
  getEmployeeCountsByDepartment(): Promise<Map<number, number>>;
  getEmployeeByEpid(epid: string): Promise<Employee | undefined>; // NEW
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  deleteEmployee(id: number): Promise<void>;
  updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee>;
  reorderEmployees(updates: { id: number; sortOrder: number }[]): Promise<void>;
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
  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getAllDocuments(): Promise<Document[]>;
  getDocumentsByDepartment(departmentId: number): Promise<Document[]>;
  searchDocuments(searchTerm: string): Promise<Document[]>;
  getDocumentByRefNoAndDate(refNo: string, date: string): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;
  // File operations
  deleteFile(filePath: string): Promise<void>;
  // Admin operations
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
}

export class MemStorage implements IStorage {
  private departments: Map<number, Department>;
  private employees: Map<number, Employee>;
  private attendanceReports: Map<number, AttendanceReport>;
  private attendanceEntries: Map<number, AttendanceEntry>;
  private documents: Map<number, Document>;
  private admins: Map<number, Admin>;
  private currentId: { [key: string]: number };
  private lastReceiptNo: number;
  // Index for O(1) lookups
  private entriesByReportId: Map<number, Set<number>>;

  constructor() {
    this.departments = new Map();
    this.employees = new Map();
    this.attendanceReports = new Map();
    this.attendanceEntries = new Map();
    this.documents = new Map();
    this.currentId = {
      department: 1,
      employee: 1,
      report: 1,
      entry: 1,
      document: 1,
      admin: 1,
    };
    this.lastReceiptNo = 0;
    this.admins = new Map();
    this.entriesByReportId = new Map();
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    return Array.from(this.admins.values()).find(a => a.email === email);
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const id = this.currentId.admin++;
    const admin: Admin = {
      ...insertAdmin,
      id,
      name: insertAdmin.name || null,
      createdAt: new Date(),
    };
    this.admins.set(id, admin);
    return admin;
  }

  async getDepartment(id: number): Promise<Department | undefined> {
    return this.departments.get(id);
  }

  async updateAllDepartmentsAttendancePermission(enabled: boolean): Promise<void> {
    Array.from(this.departments.values()).forEach(d => d.attendancePermitted = enabled);
  }

  async updateDepartmentAttendancePermission(departmentId: number, permitted: boolean): Promise<Department | undefined> {
    const dept = this.departments.get(departmentId);
    if (dept) {
      dept.attendancePermitted = permitted;
      this.departments.set(departmentId, dept);
    }
    return dept;
  }

  async updateDepartment(id: number, updates: Partial<Department>): Promise<Department> {
    const department = await this.getDepartment(id);
    if (!department) {
      throw new Error(`Department with ID ${id} not found`);
    }

    const updatedDepartment = { ...department, ...updates };
    this.departments.set(id, updatedDepartment);
    return updatedDepartment;
  }

  async deleteDepartment(id: number): Promise<void> {
    const department = await this.getDepartment(id);
    if (department) {
      // Remove from storage
      this.departments.delete(id);
      console.log(`Department ${id} deleted successfully`);
    }
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    return this.employees.get(id);
  }

  async getEmployeesByDepartment(departmentId: number): Promise<Employee[]> {
    return Array.from(this.employees.values()).filter(
      e => e.departmentId === departmentId
    );
  }

  async getEmployeeByEpid(epid: string): Promise<Employee | undefined> {
    return Array.from(this.employees.values()).find(
      e => e.epid === epid
    );
  }

  async getEmployeeCountsByDepartment(): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    this.employees.forEach(emp => {
      const current = counts.get(emp.departmentId) || 0;
      counts.set(emp.departmentId, current + 1);
    });
    return counts;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const id = this.currentId.employee++;

    // Convert joiningDate to string format as per schema
    let joiningDateStr: string;
    if (employee.joiningDate instanceof Date) {
      joiningDateStr = employee.joiningDate.toISOString().split('T')[0];
    } else {
      joiningDateStr = String(employee.joiningDate);
    }

    const newEmployee: Employee = {
      ...employee,
      id,
      joiningDate: joiningDateStr,
      joiningShift: employee.joiningShift || "morning",
      officeMemoNo: employee.officeMemoNo || "",
      salaryRegisterNo: employee.salaryRegisterNo || "",
      bankAccount: employee.bankAccount || "",
      panNumber: employee.panNumber || "",
      aadharCard: employee.aadharCard || "",
      // Preserve document URLs
      panCardUrl: employee.panCardUrl || null,
      bankProofUrl: employee.bankProofUrl || null,
      aadharCardUrl: employee.aadharCardUrl || null,
      officeMemoUrl: employee.officeMemoUrl || null,
      joiningReportUrl: employee.joiningReportUrl || null,
      termExpiry: employee.termExpiry || null,
      sortOrder: employee.sortOrder || 0,
      payLevel: employee.payLevel || "L-0",
      transferStatus: employee.transferStatus || null,
      isActive: employee.isActive || "active",
      salary_asstt: employee.salary_asstt || null,
      termExtensionUrl: employee.termExtensionUrl || null,
      remarks: employee.remarks || null,
      disabledBy: employee.disabledBy || null,
      disableReason: employee.disableReason || null,
      disabledAt: employee.disabledAt || null,
      disableWefDate: employee.disableWefDate || null
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

  async getDepartmentByEmail(email: string): Promise<Department | undefined> {
    return Array.from(this.departments.values()).find(d => d.email === email);
  }

  async createDepartment(insertDepartment: InsertDepartment): Promise<Department> {
    const id = this.currentId.department++;
    const department: Department = {
      ...insertDepartment,
      id,
      attendancePermitted: insertDepartment.attendancePermitted ?? true,
      lastLogin: null
    };
    this.departments.set(id, department);
    return department;
  }

  async deleteFile(filePath: string): Promise<void> {
    deleteFileIfExists(filePath);
  }

  async reorderEmployees(updates: { id: number; sortOrder: number }[]): Promise<void> {
    updates.forEach(update => {
      const employee = this.employees.get(update.id);
      if (employee) {
        employee.sortOrder = update.sortOrder;
        this.employees.set(update.id, employee);
      }
    });
  }

  async updateEmployee(id: number, updates: Partial<Employee>): Promise<Employee> {
    const employee = await this.getEmployee(id);
    if (!employee) throw new Error("Employee not found");

    // Preserve existing document URLs if not being updated
    const updatedEmployee = {
      ...employee,
      ...updates,
      // Only update document URLs if new ones are provided
      panCardUrl: updates.panCardUrl !== undefined ? updates.panCardUrl : employee.panCardUrl,
      bankProofUrl: updates.bankProofUrl !== undefined ? updates.bankProofUrl : employee.bankProofUrl,
      aadharCardUrl: updates.aadharCardUrl !== undefined ? updates.aadharCardUrl : employee.aadharCardUrl,
      officeMemoUrl: updates.officeMemoUrl !== undefined ? updates.officeMemoUrl : employee.officeMemoUrl,
      joiningReportUrl: updates.joiningReportUrl !== undefined ? updates.joiningReportUrl : employee.joiningReportUrl,
    };

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
      receiptNo: null as any,
      receiptDate: null,
      despatchNo: null,
      despatchDate: null,
      fileUrl: null,
      cancelRequestedAt: null,
      cancelledAt: null
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
    // Delete associated entries first using the index (O(1) lookup of set)
    const entryIds = this.entriesByReportId.get(id);
    if (entryIds) {
      entryIds.forEach(entryId => {
        this.attendanceEntries.delete(entryId);
      });
      // Clear the index
      this.entriesByReportId.delete(id);
    } else {
      // Fallback if index missing (shouldn't happen with new entries)
      const entries = await this.getAttendanceEntriesByReport(id);
      entries.forEach(entry => {
        this.attendanceEntries.delete(entry.id);
      });
    }

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
      periods: entry.periods,
      verified: false
    };

    // Log the entry being created
    console.log('Creating attendance entry:', newEntry);

    this.attendanceEntries.set(id, newEntry);

    // Update index
    if (!this.entriesByReportId.has(entry.reportId)) {
      this.entriesByReportId.set(entry.reportId, new Set());
    }
    this.entriesByReportId.get(entry.reportId)?.add(id);

    return newEntry;
  }

  async getAttendanceEntriesByReport(reportId: number): Promise<AttendanceEntry[]> {
    const entryIds = this.entriesByReportId.get(reportId);
    if (entryIds) {
      // O(M) where M is number of entries in the report
      return Array.from(entryIds)
        .map(id => this.attendanceEntries.get(id))
        .filter((e): e is AttendanceEntry => e !== undefined);
    }

    // Fallback for old data or safety
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

  async createDocument(document: InsertDocument): Promise<Document> {
    const id = this.currentId.document++;
    const newDocument: Document = {
      id,
      ...document,
      uploadedAt: new Date()
    };
    this.documents.set(id, newDocument);
    return newDocument;
  }

  async getAllDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values())
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async getDocumentsByDepartment(departmentId: number): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(doc => doc.departmentId === departmentId)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async searchDocuments(searchTerm: string): Promise<Document[]> {
    const searchTermLower = searchTerm.toLowerCase();
    return Array.from(this.documents.values())
      .filter(doc =>
        doc.documentType.toLowerCase().includes(searchTermLower) ||
        doc.issuingAuthority.toLowerCase().includes(searchTermLower) ||
        doc.subject.toLowerCase().includes(searchTermLower) ||
        doc.refNo.toLowerCase().includes(searchTermLower) ||
        doc.date.includes(searchTerm) ||
        doc.departmentName.toLowerCase().includes(searchTermLower)
      )
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async getDocumentByRefNoAndDate(refNo: string, date: string): Promise<Document | undefined> {
    return Array.from(this.documents.values()).find(
      doc => doc.refNo === refNo && doc.date === date
    );
  }

  async deleteDocument(id: number): Promise<void> {
    this.documents.delete(id);
  }
}

export const storage = new MemStorage();