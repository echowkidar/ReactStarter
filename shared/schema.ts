import { pgTable, text, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hodTitle: text("hod_title").notNull(),
  hodName: text("hod_name").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),
  epid: text("epid").notNull(),
  name: text("name").notNull(),
  panNumber: text("pan_number").notNull(),
  bankAccount: text("bank_account").notNull(),
  aadharCard: text("aadhar_card").notNull(),
  designation: text("designation").notNull(),
  employmentStatus: text("employment_status").notNull(),
  termExpiry: date("term_expiry"),
  joiningDate: date("joining_date").notNull(),
  salaryRegisterNo: text("salary_register_no").notNull(),
  officeMemoNo: text("office_memo_no").notNull(),
  joiningShift: text("joining_shift").notNull().default("morning"),
  // Add document URL fields
  panCardUrl: text("pan_card_url"),
  bankProofUrl: text("bank_proof_url"),
  aadharCardUrl: text("aadhar_card_url"),
  officeMemoUrl: text("office_memo_url"),
  joiningReportUrl: text("joining_report_url"),
});

export const attendanceReports = pgTable("attendance_reports", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  receiptNo: serial("receipt_no"),
  receiptDate: timestamp("receipt_date"),
  transactionId: text("transaction_id"),
  despatchNo: text("despatch_no"),
  despatchDate: date("despatch_date"),
  status: text("status").notNull().default("draft"),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const attendanceEntries = pgTable("attendance_entries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  days: integer("days").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  periods: text("periods").notNull(),
  remarks: text("remarks"),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true });
export const insertEmployeeSchema = createInsertSchema(employees)
  .omit({ id: true })
  .extend({
    joiningDate: z.union([
      z.string(),
      z.date().transform(date => date.toISOString().split('T')[0])
    ]),
    termExpiry: z.union([
      z.string(),
      z.date(),
      z.null()
    ]).optional().transform(val => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().split('T')[0];
      return val;
    }),
    employmentStatus: z.string().transform(val => {
      const normalized = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
      if (!["Permanent", "Probation", "Temporary"].includes(normalized)) {
        throw new Error("Invalid employment status");
      }
      return normalized;
    }),
    joiningShift: z.string().default("morning"),
    officeMemoNo: z.string().optional().default(""),
    salaryRegisterNo: z.string().optional().default(""),
    bankAccount: z.string().optional().default(""),
    panNumber: z.string().optional().default(""),
    aadharCard: z.string().optional().default(""),
    // Add URL fields to the schema
    panCardUrl: z.string().nullable().optional(),
    bankProofUrl: z.string().nullable().optional(),
    aadharCardUrl: z.string().nullable().optional(),
    officeMemoUrl: z.string().nullable().optional(),
    joiningReportUrl: z.string().nullable().optional(),
    // Allow both epid and employeeId
    epid: z.union([
      z.string(),
      z.undefined()
    ]).transform(val => {
      if (!val && typeof window !== 'undefined') {
        const formData = window.document?.activeElement?.closest('form')?.elements;
        const employeeId = formData?.['employeeId']?.value;
        if (employeeId) return employeeId;
      }
      return val || '';
    }).refine(val => val.length > 0, {
      message: "Employee ID is required"
    }),
    name: z.string().min(1, "Name is required"),
    designation: z.string().min(1, "Designation is required"),
  });
export const insertAttendanceReportSchema = createInsertSchema(attendanceReports).omit({
  id: true,
  createdAt: true,
  receiptNo: true,
  receiptDate: true
});

const periodSchema = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  days: z.number(),
  remarks: z.string().optional()
});

export const insertAttendanceEntrySchema = createInsertSchema(attendanceEntries)
  .omit({ id: true })
  .extend({
    fromDate: z.string(),
    toDate: z.string(),
    periods: z.string()
  });

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Employee = typeof employees.$inferSelect & { 
  departmentName?: string;
  panCardUrl?: string;
  bankProofUrl?: string;
  aadharCardUrl?: string;
  officeMemoUrl?: string;
  joiningReportUrl?: string;
};
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type AttendanceReport = typeof attendanceReports.$inferSelect;
export type InsertAttendanceReport = z.infer<typeof insertAttendanceReportSchema>;
export type AttendanceEntry = typeof attendanceEntries.$inferSelect;
export type InsertAttendanceEntry = z.infer<typeof insertAttendanceEntrySchema>;