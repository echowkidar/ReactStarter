import { db } from "./db";
import { departments, employees, attendanceReports, attendanceEntries, departmentNames, documents } from "@shared/schema";
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
        salary_asstt TEXT,
        is_active TEXT NOT NULL DEFAULT 'active',
        pan_card_url TEXT,
        bank_proof_url TEXT,
        aadhar_card_url TEXT,
        office_memo_url TEXT,
        joining_report_url TEXT,
        term_extension_url TEXT
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

    // Create department_names table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS department_names (
        id SERIAL PRIMARY KEY,
        dept_code TEXT NOT NULL UNIQUE,
        dept_name TEXT NOT NULL,
        d_ast TEXT
      );
    `);

    // Create documents table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        document_type TEXT NOT NULL,
        issuing_authority TEXT NOT NULL,
        subject TEXT NOT NULL,
        ref_no TEXT NOT NULL,
        date TEXT NOT NULL,
        image_url TEXT NOT NULL,
        department_id INTEGER NOT NULL REFERENCES departments(id),
        department_name TEXT NOT NULL,
        uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add isActive column to existing employees table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active TEXT NOT NULL DEFAULT 'active';
    `);

    // Add salary_asstt column to existing employees table if it doesn't exist
    await db.execute(sql`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_asstt TEXT;
    `);

    // Add cancel_requested_at column to attendance_reports table
    await db.execute(sql`
      ALTER TABLE attendance_reports ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMP;
    `);

    // Add cancelled_at column to attendance_reports table
    await db.execute(sql`
      ALTER TABLE attendance_reports ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
    `);

    // Add attendance_permitted column to departments table
    await db.execute(sql`
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS attendance_permitted BOOLEAN NOT NULL DEFAULT true;
    `);

    // Add verified column to attendance_entries table
    await db.execute(sql`
      ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
    `);

    // Create app_settings table for form field visibility control
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Insert default settings (don't overwrite if already exist)
    await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES
        ('show_pan_field', 'true'),
        ('show_bank_field', 'true'),
        ('show_aadhar_field', 'true')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Add department_id column to attendance_entries table
    await db.execute(sql`
      ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS department_id INTEGER;
    `);

    // Backfill department_id from attendance_reports for existing entries
    await db.execute(sql`
      UPDATE attendance_entries ae
      SET department_id = ar.department_id
      FROM attendance_reports ar
      WHERE ae.report_id = ar.id AND ae.department_id IS NULL;
    `);

    // Add admin_noting column to attendance_entries table for salary assistant notes
    await db.execute(sql`
      ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS admin_noting TEXT;
    `);

    // Create department_contacts table for attendance contact persons
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS department_contacts (
        id SERIAL PRIMARY KEY,
        department_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        contact_phone TEXT NOT NULL,
        internal_phone TEXT,
        contact_email TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add internal_phone and contact_email columns if they don't exist
    await db.execute(sql`
      ALTER TABLE department_contacts ADD COLUMN IF NOT EXISTS internal_phone TEXT;
    `);
    await db.execute(sql`
      ALTER TABLE department_contacts ADD COLUMN IF NOT EXISTS contact_email TEXT;
    `);

    console.log("Database migrations completed successfully");
  } catch (error) {
    console.error("Error running migrations:", error);
    throw error;
  }
}
