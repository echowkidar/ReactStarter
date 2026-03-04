import { pgTable, text, serial, integer, date, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  hodTitle: text("hod_title").notNull(),
  hodName: text("hod_name").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  attendancePermitted: boolean("attendance_permitted").notNull().default(true),
  allowSupplementaryReport: boolean("allow_supplementary_report").notNull().default(false),
  lastLogin: timestamp("last_login"),
});

// Login Attempts - for brute force protection
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  identifier: text("identifier").notNull(),  // email or IP
  attemptCount: integer("attempt_count").notNull().default(1),
  lastAttemptAt: timestamp("last_attempt_at").notNull().defaultNow(),
  lockedUntil: timestamp("locked_until"),
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
  payLevel: text("pay_level").notNull().default("L-0"),
  termExpiry: text("term_expiry"),
  joiningDate: date("joining_date").notNull(),
  salaryRegisterNo: text("salary_register_no").notNull(),
  officeMemoNo: text("office_memo_no").notNull(),
  joiningShift: text("joining_shift").notNull().default("morning"),
  salary_asstt: text("salary_asstt"),
  isActive: text("is_active").notNull().default("active"),
  // Add document URL fields
  panCardUrl: text("pan_card_url"),
  bankProofUrl: text("bank_proof_url"),
  aadharCardUrl: text("aadhar_card_url"),
  officeMemoUrl: text("office_memo_url"),
  joiningReportUrl: text("joining_report_url"),
  termExtensionUrl: text("term_extension_url"),
  // Disable reason fields
  disableReason: text("disable_reason"),         // retire, vrs, resign, term_complete, terminate
  disableWefDate: date("disable_wef_date"),      // With Effect From date
  disabledAt: timestamp("disabled_at"),          // When was disabled
  disabledBy: text("disabled_by"),               // Who disabled (department email/name)
  // Remarks field
  remarks: text("remarks"),                      // General remarks about employee
  // Transfer status
  transferStatus: text("transfer_status"),       // pending, null
  // Custom sort order for employees with same pay level
  sortOrder: integer("sort_order").notNull().default(0),
});

export const departmentNames = pgTable("department_names", {
  id: integer("id").primaryKey(),
  code: text("dept_code").notNull().unique(),
  name: text("dept_name").notNull(),
  dealingAssistantCode: text("d_ast"),
});

// Status values: 'draft', 'submitted', 'sent', 'cancel_requested', 'cancelled'
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
  cancelRequestedAt: timestamp("cancel_requested_at"),
  cancelledAt: timestamp("cancelled_at"),
});


export const attendanceEntries = pgTable("attendance_entries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  departmentId: integer("department_id"),
  days: integer("days").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  periods: text("periods").notNull(),
  remarks: text("remarks"),
  verified: boolean("verified").notNull().default(false),
  adminNoting: text("admin_noting"),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true });
export const insertEmployeeSchema = createInsertSchema(employees)
  .omit({ id: true })
  .extend({
    epid: z.string().length(5, "EPID must be exactly 5 digits").regex(/^\d+$/, "EPID must only contain numbers"),
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
    // Document URLs should be optional but preserve their values when present
    panCardUrl: z.string().nullable(),
    bankProofUrl: z.string().nullable(),
    aadharCardUrl: z.string().nullable(),
    officeMemoUrl: z.string().nullable(),
    joiningReportUrl: z.string().nullable(),
    termExtensionUrl: z.string().nullable().optional(),
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

export const insertDepartmentNameSchema = createInsertSchema(departmentNames);

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Employee = typeof employees.$inferSelect & {
  departmentName?: string;
};
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type AttendanceReport = typeof attendanceReports.$inferSelect;
export type InsertAttendanceReport = z.infer<typeof insertAttendanceReportSchema>;
export type AttendanceEntry = typeof attendanceEntries.$inferSelect;
export type InsertAttendanceEntry = z.infer<typeof insertAttendanceEntrySchema>;

export type DepartmentName = typeof departmentNames.$inferSelect;
export type InsertDepartmentName = z.infer<typeof insertDepartmentNameSchema>;

// Document schema
export interface Document {
  id: number;
  documentType: string;
  issuingAuthority: string;
  subject: string;
  refNo: string;
  date: string;
  imageUrl: string;
  departmentId: number;
  departmentName: string;
  uploadedAt: Date;
}

export type InsertDocument = Omit<Document, "id" | "uploadedAt"> & { uploadedAt?: Date };

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull(),
  issuingAuthority: text("issuing_authority").notNull(),
  subject: text("subject").notNull(),
  refNo: text("ref_no").notNull(),
  date: text("date").notNull(),
  imageUrl: text("image_url").notNull(),
  departmentId: integer("department_id").notNull(),
  departmentName: text("department_name").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});


export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true
});

export const activeUserSnapshots = pgTable("active_user_snapshots", {
  id: serial("id").primaryKey(),
  count: integer("count").notNull(),
  adminCount: integer("admin_count").notNull(),
  departmentCount: integer("department_count").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export type ActiveUserSnapshot = typeof activeUserSnapshots.$inferSelect;

// Admin Schema
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // In production, hash this!
  role: text("role").notNull(), // 'super' or 'salary'
  userCode: text("user_code"), // Added for salary admin, 3 uppercase letters
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true
}).extend({
  userCode: z.string().regex(/^[A-Z]{3}$/, "User code must be exactly 3 uppercase letters").optional().nullable(),
});

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;

// Support Tickets Schema
// Status: 'Open', 'In Progress', 'Resolved', 'Closed'
// Priority: 'low', 'medium', 'high'
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull().default("Open"),
  imageUrl: text("image_url"),
  adminResponse: text("admin_response"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Ticket = typeof tickets.$inferSelect & {
  departmentName?: string;
  replies?: TicketReply[];
};
export type InsertTicket = z.infer<typeof insertTicketSchema>;

// Ticket Replies - this may need to be created in database
export const ticketReplies = pgTable("ticket_replies", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  message: text("message").notNull(),
  isAdminReply: boolean("is_admin_reply").notNull().default(false),
  adminName: text("admin_name"),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTicketReplySchema = createInsertSchema(ticketReplies).omit({
  id: true,
  createdAt: true,
});

export type TicketReply = typeof ticketReplies.$inferSelect;
export type InsertTicketReply = z.infer<typeof insertTicketReplySchema>;

// Notices/Announcements System
export const notices = pgTable("notices", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  imageUrl: text("image_url"),
  isGlobal: boolean("is_global").notNull().default(true), // true = sent to all departments
  createdBy: text("created_by").notNull(), // admin username
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNoticeSchema = createInsertSchema(notices).omit({
  id: true,
  createdAt: true,
});

export type Notice = typeof notices.$inferSelect;
export type InsertNotice = z.infer<typeof insertNoticeSchema>;

// Notice Recipients - for targeted notices (when isGlobal = false)
export const noticeRecipients = pgTable("notice_recipients", {
  id: serial("id").primaryKey(),
  noticeId: integer("notice_id").notNull(),
  departmentId: integer("department_id").notNull(),
});

export const insertNoticeRecipientSchema = createInsertSchema(noticeRecipients).omit({
  id: true,
});

export type NoticeRecipient = typeof noticeRecipients.$inferSelect;
export type InsertNoticeRecipient = z.infer<typeof insertNoticeRecipientSchema>;

// Visitor Analytics - Track unique visitors using browser fingerprinting
export const visitors = pgTable("visitors", {
  id: serial("id").primaryKey(),
  visitorId: text("visitor_id").notNull(), // Unique browser fingerprint
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  screenResolution: text("screen_resolution"),
  timezone: text("timezone"),
  language: text("language"),
  visitedAt: timestamp("visited_at").notNull().defaultNow(),
  pageVisited: text("page_visited"), // Which page was visited
  departmentId: integer("department_id"), // If logged in as department
});

export const insertVisitorSchema = createInsertSchema(visitors).omit({
  id: true,
  visitedAt: true,
});

export type Visitor = typeof visitors.$inferSelect;
export type InsertVisitor = z.infer<typeof insertVisitorSchema>;

// Transfer Requests - for inter-department employee transfers
export const transferRequests = pgTable("transfer_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  fromDepartmentId: integer("from_department_id").notNull(),
  toDepartmentId: integer("to_department_id").notNull(),
  orderNumber: text("order_number"),
  orderDate: date("order_date"),
  relievingDate: date("relieving_date"),
  remarks: text("remarks").notNull(),
  hodSignature: text("hod_signature").notNull(),       // "HOD, Department Name" (not editable)
  status: text("status").notNull().default("pending"), // pending, accepted, rejected
  rejectionRemarks: text("rejection_remarks"),
  rejectedBy: text("rejected_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const insertTransferRequestSchema = createInsertSchema(transferRequests).omit({
  id: true,
  createdAt: true,
});

export type TransferRequest = typeof transferRequests.$inferSelect;
export type InsertTransferRequest = z.infer<typeof insertTransferRequestSchema>;

// Employee History - Audit trail for employee changes
export const employeeHistory = pgTable("employee_history", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  action: text("action").notNull(),              // update, document_update, document_delete, transfer, disable
  field: text("field").notNull(),                // Which field was changed
  previousValue: text("previous_value"),         // Previous value (stored as text)
  changedBy: text("changed_by").notNull(),       // Who made the change (email/name)
  changedByRole: text("changed_by_role").notNull(), // department, salary_admin
  departmentId: integer("department_id"),        // Department that made the change
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertEmployeeHistorySchema = createInsertSchema(employeeHistory).omit({
  id: true,
  timestamp: true,
});

export type EmployeeHistory = typeof employeeHistory.$inferSelect;
export type InsertEmployeeHistory = z.infer<typeof insertEmployeeHistorySchema>;