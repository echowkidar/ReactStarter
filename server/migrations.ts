import { db } from "./db";
import { departments, employees, attendanceReports, attendanceEntries } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  try {
    // Create departments table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        hod_title TEXT NOT NULL,
        hod_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      );
    `);

    // Create employees table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        department_id INTEGER NOT NULL REFERENCES departments(id),
        epid TEXT NOT NULL,
        name TEXT NOT NULL,
        pan_number TEXT NOT NULL,
        bank_account TEXT NOT NULL,
        aadhar_card TEXT NOT NULL,
        designation TEXT NOT NULL,
        employment_status TEXT NOT NULL,
        term_expiry DATE,
        joining_date DATE NOT NULL,
        salary_register_no TEXT NOT NULL,
        office_memo_no TEXT NOT NULL,
        joining_shift TEXT NOT NULL DEFAULT 'morning',
        pan_card_url TEXT,
        bank_proof_url TEXT,
        aadhar_card_url TEXT,
        office_memo_url TEXT,
        joining_report_url TEXT
      );
    `);

    // Create attendance_reports table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS attendance_reports (
        id SERIAL PRIMARY KEY,
        department_id INTEGER NOT NULL REFERENCES departments(id),
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        receipt_no INTEGER,
        receipt_date TIMESTAMP,
        transaction_id TEXT,
        despatch_no TEXT,
        despatch_date DATE,
        status TEXT NOT NULL DEFAULT 'draft',
        file_url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create attendance_entries table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS attendance_entries (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL REFERENCES attendance_reports(id),
        employee_id INTEGER NOT NULL REFERENCES employees(id),
        days INTEGER NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        periods TEXT NOT NULL,
        remarks TEXT
      );
    `);

    console.log("Database migrations completed successfully");
  } catch (error) {
    console.error("Error running migrations:", error);
    throw error;
  }
} 