import { pgTable, text, serial, integer, date, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
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
  finalizedAt: timestamp("finalized_at"),
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
  exportedToOracleAt: timestamp("exported_to_oracle_at"),
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
      const allowed = [
        "Permanent",
        "Probation",
        "Temporary",
        "Court Case",
        "Compensation",
        "Till Further Order"
      ];
      const match = allowed.find(s => s.toLowerCase() === val.trim().toLowerCase());
      if (!match) {
        throw new Error("Invalid employment status");
      }
      return match;
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

// Useful Downloads - for department sidebar resources
export const usefulDownloads = pgTable("useful_downloads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url"),
  externalLink: text("external_link"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUsefulDownloadSchema = createInsertSchema(usefulDownloads).omit({
  id: true,
  createdAt: true,
});

export type UsefulDownload = typeof usefulDownloads.$inferSelect;
export type InsertUsefulDownload = z.infer<typeof insertUsefulDownloadSchema>;

// Department Contacts - for salary admin to find attendance contact person per department
export const departmentContacts = pgTable("department_contacts", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),   // FK → departments.id
  employeeId: integer("employee_id").notNull(),       // FK → employees.id (selected from department's list)
  contactPhone: text("contact_phone").notNull(),      // Phone number
  internalPhone: text("internal_phone"),              // Internal phone number (optional)
  contactEmail: text("contact_email"),                // Email ID (optional)
  notes: text("notes"),                                // Optional remark
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDepartmentContactSchema = createInsertSchema(departmentContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DepartmentContact = typeof departmentContacts.$inferSelect;
export type InsertDepartmentContact = z.infer<typeof insertDepartmentContactSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// LPC Records — Last Pay Certificate
// ─────────────────────────────────────────────────────────────────────────────
export const lpcRecords = pgTable("lpc_records", {
  id: serial("id").primaryKey(),

  // Dispatch info
  dispatchNumber: text("dispatch_number").notNull(),
  dispatchDate: date("dispatch_date").notNull(),

  // Employee basic info
  employeeTitle: text("employee_title").notNull().default("Mr."),  // Dr./Mr./Mrs./Ms.
  employeeId: integer("employee_id"),                               // FK → employees.id (optional)
  epid: text("epid").notNull(),
  name: text("name").notNull(),
  designation: text("designation").notNull(),
  department: text("department").notNull(),                         // Department at retirement

  // Retirement info
  retirementReason: text("retirement_reason").notNull().default("Retired"),
  lastPaidUpTo: date("last_paid_up_to"),
  payLevel: text("pay_level"),

  // Pay particulars (amounts in INR)
  basicPay: integer("basic_pay"),
  nonPracticeAllowance: integer("non_practice_allowance"),
  dearnessAllowance: integer("dearness_allowance"),
  houseRentAllowance: integer("house_rent_allowance"),
  transportAllowance: integer("transport_allowance"),
  otherAmount: integer("other_amount"),
  otherAmountLabel: text("other_amount_label"),  // e.g. "CPFA"

  // No dues reference
  noDuesReportNo: text("no_dues_report_no"),
  noDuesReportDate: date("no_dues_report_date"),

  // Recovery details (stored as JSON string)
  // [{label, departmentDemand, lastSalaryDeduction, balanceToRecover}]
  recoveries: text("recoveries"),

  // PDF & Digital Signing
  pdfUrl: text("pdf_url"),             // Relative URL to signed PDF
  pdfHash: text("pdf_hash"),           // SHA-256 hash for tamper detection
  certSerial: text("cert_serial"),     // Certificate serial number
  scannedRawUrl: text("scanned_raw_url"),  // Original scanned file URL
  ocrRawText: text("ocr_raw_text"),    // Raw OCR output text

  // Email delivery
  recipientEmail: text("recipient_email"),   // To whom LPC is emailed
  emailStatus: text("email_status"),         // null | 'sent' | 'failed'
  emailSentAt: timestamp("email_sent_at"),   // When email was sent
  emailMessageId: text("email_message_id"),  // Nodemailer messageId

  // Audit trail
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLpcRecordSchema = createInsertSchema(lpcRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type LpcRecord = typeof lpcRecords.$inferSelect;
export type InsertLpcRecord = z.infer<typeof insertLpcRecordSchema>;

// User Emails - for managing user gmail app passwords
export const userEmails = pgTable("user_emails", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),     // Department email, or super admin email
  userType: text("user_type").notNull(), // 'admin' or 'department'
  email: text("email").notNull(),        // The configured Gmail address
  appPassword: text("app_password").notNull(), // App password
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserEmailSchema = createInsertSchema(userEmails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserEmail = typeof userEmails.$inferSelect;
export type InsertUserEmail = z.infer<typeof insertUserEmailSchema>;

export const employeeGroups = pgTable("employee_groups", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id"), // Nullable for admin groups
  isAdmin: boolean("is_admin").default(false),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const employeeGroupMembers = pgTable("employee_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  employeeId: integer("employee_id"), // Nullable if it's a department
  departmentId: integer("department_id"), // Nullable if it's an employee
});

export const insertEmployeeGroupSchema = createInsertSchema(employeeGroups).omit({
  id: true,
  createdAt: true,
});

export const insertEmployeeGroupMemberSchema = createInsertSchema(employeeGroupMembers).omit({
  id: true,
});

export type EmployeeGroup = typeof employeeGroups.$inferSelect;
export type EmployeeGroupMember = typeof employeeGroupMembers.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Document Dispatch System Tables
// ─────────────────────────────────────────────────────────────────────────────

// External Contacts — for non-department recipients
export const externalContacts = pgTable("external_contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactType: text("contact_type").notNull().default("person"),
  designation: text("designation"),
  organization: text("organization"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  city: text("city"),
  state: text("state"),
  pinCode: text("pin_code"),
  notes: text("notes"),
  isGlobal: boolean("is_global").notNull().default(true),
  createdByDepartmentId: integer("created_by_department_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExternalContactSchema = createInsertSchema(externalContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ExternalContact = typeof externalContacts.$inferSelect;
export type InsertExternalContact = z.infer<typeof insertExternalContactSchema>;

// Dispatch Documents — core dispatch records
export const dispatchDocuments = pgTable("dispatch_documents", {
  id: serial("id").primaryKey(),
  senderDepartmentId: integer("sender_department_id").notNull(),
  senderName: text("sender_name").notNull(),
  documentType: text("document_type").notNull(),
  subject: text("subject").notNull(),
  dispatchNumber: text("dispatch_number"),
  dispatchDate: date("dispatch_date"),
  referenceNumber: text("reference_number"),
  inwardNumber: text("inward_number"),
  outwardNumber: text("outward_number"),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull().default("image"),
  pageCount: integer("page_count").default(1),
  isConfidential: boolean("is_confidential").notNull().default(false),
  priority: text("priority").notNull().default("normal"),
  aiExtractedData: jsonb("ai_extracted_data"),
  aiConfidence: text("ai_confidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDispatchDocumentSchema = createInsertSchema(dispatchDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DispatchDocument = typeof dispatchDocuments.$inferSelect;
export type InsertDispatchDocument = z.infer<typeof insertDispatchDocumentSchema>;

// Dispatch Recipients — many-to-many dispatch → departments/external
export const dispatchRecipients = pgTable("dispatch_recipients", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull(),
  recipientType: text("recipient_type").notNull().default("department"),
  departmentId: integer("department_id"),
  externalContactId: integer("external_contact_id"),
  status: text("status").notNull().default("dispatched"),
  receivedAt: timestamp("received_at"),
  readAt: timestamp("read_at"),
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  inwardNumber: text("inward_number"),
  markedToStaff: text("marked_to_staff"),
  markedToEmployeeId: integer("marked_to_employee_id"),
  markedAt: timestamp("marked_at"),
  markedBy: text("marked_by"),
  staffRemarks: text("staff_remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDispatchRecipientSchema = createInsertSchema(dispatchRecipients).omit({
  id: true,
  createdAt: true,
});

export type DispatchRecipient = typeof dispatchRecipients.$inferSelect;
export type InsertDispatchRecipient = z.infer<typeof insertDispatchRecipientSchema>;

// Dispatch Tracking — full audit trail
export const dispatchTracking = pgTable("dispatch_tracking", {
  id: serial("id").primaryKey(),
  dispatchId: integer("dispatch_id").notNull(),
  action: text("action").notNull(),
  actionByDepartmentId: integer("action_by_department_id"),
  actionByName: text("action_by_name").notNull(),
  details: text("details"),
  recipientDepartmentId: integer("recipient_department_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDispatchTrackingSchema = createInsertSchema(dispatchTracking).omit({
  id: true,
  createdAt: true,
});

export type DispatchTracking = typeof dispatchTracking.$inferSelect;
export type InsertDispatchTracking = z.infer<typeof insertDispatchTrackingSchema>;

// Department Groups — for dispatch group selection
export const departmentGroups = pgTable("department_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  isGlobal: boolean("is_global").notNull().default(true),
  createdByDepartmentId: integer("created_by_department_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDepartmentGroupSchema = createInsertSchema(departmentGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DepartmentGroup = typeof departmentGroups.$inferSelect;
export type InsertDepartmentGroup = z.infer<typeof insertDepartmentGroupSchema>;

// Department Group Members — group → department mapping
export const departmentGroupMembers = pgTable("department_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  departmentId: integer("department_id").notNull(),
});

export const insertDepartmentGroupMemberSchema = createInsertSchema(departmentGroupMembers).omit({
  id: true,
});

export type DepartmentGroupMember = typeof departmentGroupMembers.$inferSelect;
export type InsertDepartmentGroupMember = z.infer<typeof insertDepartmentGroupMemberSchema>;

// Salary Registers
export const salaryRegisters = pgTable("salary_registers", {
  id: serial("id").primaryKey(),
  value: text("value").notNull().unique(), // e.g. "ADM106"
  label: text("label").notNull(),          // e.g. "ADM106 - DEAN F/o AGRICULTURAL SCIENCE"
  departmentId: integer("department_id"),  // Foreign key to departments, nullable if unmapped
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSalaryRegisterSchema = createInsertSchema(salaryRegisters).omit({
  id: true,
  createdAt: true,
});

export type SalaryRegister = typeof salaryRegisters.$inferSelect;
export type InsertSalaryRegister = z.infer<typeof insertSalaryRegisterSchema>;
