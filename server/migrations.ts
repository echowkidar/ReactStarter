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

    // Add finalized_at column to attendance_reports table
    await db.execute(sql`
      ALTER TABLE attendance_reports ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;
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
        ('show_aadhar_field', 'true'),
        ('show_employee_category_field', 'false'),
        ('attendance_term_check', 'true')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Employee fields filled from the Oracle payroll master (all optional)
    await db.execute(sql`
      ALTER TABLE employees
        ADD COLUMN IF NOT EXISTS employee_category TEXT,
        ADD COLUMN IF NOT EXISTS bank_name TEXT,
        ADD COLUMN IF NOT EXISTS ifsc TEXT,
        ADD COLUMN IF NOT EXISTS oracle_emp_status TEXT,
        ADD COLUMN IF NOT EXISTS sal_group TEXT,
        ADD COLUMN IF NOT EXISTS oracle_synced_at TIMESTAMP;
    `);

    // Oracle sync (see server/oracleSync.ts): data read from the payroll master,
    // every sync run, and every value it changed (so a run can be undone).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oracle_snapshots (
        id SERIAL PRIMARY KEY,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fetched_by TEXT NOT NULL,
        paybill_year INTEGER,
        paybill_month INTEGER,
        row_count INTEGER NOT NULL,
        rows JSONB NOT NULL
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oracle_sync_runs (
        id SERIAL PRIMARY KEY,
        snapshot_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT NOT NULL,
        summary JSONB NOT NULL,
        undone_at TIMESTAMPTZ,
        undone_by TEXT,
        undo_summary JSONB
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oracle_sync_changes (
        id SERIAL PRIMARY KEY,
        run_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        epid TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT
      );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS oracle_sync_changes_run_idx ON oracle_sync_changes (run_id)`);

    // Employee history keeps the new value too (older rows: worked out when shown)
    await db.execute(sql`ALTER TABLE employee_history ADD COLUMN IF NOT EXISTS new_value TEXT`);

    // Settings page PIN (one row per admin, scrypt hash) — see server/settingsPin.ts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_settings_pin (
        admin_id INTEGER PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Paybill history — a copy of Oracle T_PAYBILL_HIST + T_PAYBILL_HIST_ARCHIVE
    // (22 columns). Oracle has no unique key, so a row is identified by
    // src + month + sal_code + ecode + line_no (nth row of that employee in that
    // bill, ordered by pay period). See server/paybillSync.ts.
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS paybill_history (
          src CHAR(1) NOT NULL,              -- H = T_PAYBILL_HIST, A = T_PAYBILL_HIST_ARCHIVE
          yr_no SMALLINT NOT NULL,
          mth_no SMALLINT NOT NULL,
          sal_code SMALLINT NOT NULL,
          ecode VARCHAR(10) NOT NULL,
          line_no SMALLINT NOT NULL,
          cat_code VARCHAR(2),
          emp_cat VARCHAR(2),
          desig_code VARCHAR(10),
          deptt VARCHAR(10),
          basic_sal NUMERIC(12,2),
          npa NUMERIC(12,2),
          da NUMERIC(12,2),
          hra NUMERIC(12,2),
          ta NUMERIC(12,2),
          pat_care NUMERIC(12,2),
          nursing NUMERIC(12,2),
          annual NUMERIC(12,2),
          d_ast VARCHAR(10),
          full_pay_fdate DATE,
          full_pay_tdate DATE,
          sal_no VARCHAR(12),
          grade_pay NUMERIC(12,2),
          sal_flag VARCHAR(2),
          -- month first: period filters and "whole month" replacements use this index
          PRIMARY KEY (yr_no, mth_no, src, sal_code, ecode, line_no)
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS paybill_history_ecode_idx ON paybill_history (ecode, yr_no, mth_no)`);
      // Oracle's fingerprint (row count + ORA_HASH sum) of each month as last copied
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS paybill_months (
          src CHAR(1) NOT NULL,
          yr_no SMALLINT NOT NULL,
          mth_no SMALLINT NOT NULL,
          row_count INTEGER NOT NULL,
          ora_hash TEXT NOT NULL,
          synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (src, yr_no, mth_no)
        )
      `);
      // Each button press: kind = new (add new months) | check (look for changes)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS paybill_runs (
          id SERIAL PRIMARY KEY,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,               -- running | done | report | applied | failed
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_by TEXT NOT NULL,
          finished_at TIMESTAMP,
          summary JSONB NOT NULL DEFAULT '{}'::jsonb,
          error TEXT,
          applied_at TIMESTAMP,
          applied_by TEXT
        )
      `);
      // What a "check" found: one row per paybill row added / removed / changed in Oracle
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS paybill_changes (
          id BIGSERIAL PRIMARY KEY,
          run_id INTEGER NOT NULL,
          src CHAR(1) NOT NULL,
          yr_no SMALLINT NOT NULL,
          mth_no SMALLINT NOT NULL,
          sal_code SMALLINT NOT NULL,
          ecode VARCHAR(10) NOT NULL,
          line_no SMALLINT NOT NULL,
          kind TEXT NOT NULL,                 -- added | removed | changed
          fields JSONB,                       -- changed: [{ field, old, new }]
          new_row JSONB                       -- added / changed: the row as it is in Oracle now
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS paybill_changes_run_idx ON paybill_changes (run_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS paybill_changes_ecode_idx ON paybill_changes (ecode)`);
    } catch (pbErr) {
      console.error("[Migrations] paybill history tables failed (only the Paybill History page is affected):", pbErr);
    }

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

    // Add exported_to_oracle_at column to attendance_entries table for Oracle export tracking
    await db.execute(sql`
      ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS exported_to_oracle_at TIMESTAMP;
    `);

    // ─── LPC (Last Pay Certificate) Records ───────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lpc_records (
        id SERIAL PRIMARY KEY,
        dispatch_number TEXT NOT NULL,
        dispatch_date DATE NOT NULL,
        employee_title TEXT NOT NULL DEFAULT 'Mr.',
        employee_id INTEGER,
        epid TEXT NOT NULL,
        name TEXT NOT NULL,
        designation TEXT NOT NULL,
        department TEXT NOT NULL,
        posted_dept_name TEXT,
        retirement_reason TEXT NOT NULL DEFAULT 'Retired',
        retired_on DATE NOT NULL,
        last_paid_up_to DATE,
        pay_level TEXT,
        basic_pay INTEGER,
        non_practice_allowance INTEGER,
        dearness_allowance INTEGER,
        house_rent_allowance INTEGER,
        transport_allowance INTEGER,
        other_amount INTEGER,
        other_amount_label TEXT,
        no_dues_report_no TEXT,
        no_dues_report_date DATE,
        recoveries TEXT,
        pdf_url TEXT,
        pdf_hash TEXT,
        cert_serial TEXT,
        scanned_raw_url TEXT,
        ocr_raw_text TEXT,
        recipient_email TEXT,
        email_status TEXT,
        email_sent_at TIMESTAMP,
        email_message_id TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─── Reporting Employees (Admin Non Teaching) ─────────────────────────────
    // ADDITIVE ONLY: new table + new defaulted/nullable columns. Nothing existing is
    // altered, renamed or dropped, and every statement is idempotent (IF NOT EXISTS).
    //
    // The 3 columns below are referenced by Drizzle in every query on these tables,
    // so (like all migrations above) a failure here is NOT swallowed: the server
    // stops with a clear error instead of running half-migrated.
    // Feature flag — default false, so no department's behaviour changes on deploy
    await db.execute(sql`
      ALTER TABLE departments ADD COLUMN IF NOT EXISTS allow_reporting_employees BOOLEAN NOT NULL DEFAULT false;
    `);
    // All existing reports automatically become 'regular'
    await db.execute(sql`
      ALTER TABLE attendance_reports ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'regular';
    `);
    // Main vs Supplementary report kind — NULL for all existing reports (label derived as before)
    await db.execute(sql`
      ALTER TABLE attendance_reports ADD COLUMN IF NOT EXISTS report_kind TEXT;
    `);
    // NULL for all existing entries (= normal staff entry)
    await db.execute(sql`
      ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS reporting_employee_id INTEGER;
    `);

    // ─── Designation as it was at the time of the attendance entry ───────────
    // ADDITIVE: three new nullable columns (Drizzle selects them, so not swallowed).
    await db.execute(sql`ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS designation_at_report TEXT;`);
    await db.execute(sql`ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS employment_status_at_report TEXT;`);
    await db.execute(sql`ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS pay_level_at_report TEXT;`);

    // Fill existing entries once (only rows still NULL; new entries are filled when
    // created). Value = what the employee had when the report was created: if the
    // employee history shows a later change of that field, its "previous value" of
    // the FIRST change after the report was created; otherwise the current value.
    // Existing data is only read; nothing else is changed. A failure here is logged
    // and the app keeps working (current values are then shown, as before).
    try {
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_employee_history_emp_field ON employee_history (employee_id, field, "timestamp")`);
      const filled = await db.execute(sql`
        UPDATE attendance_entries ae SET
          designation_at_report = COALESCE((
            SELECT NULLIF(h.previous_value, '') FROM employee_history h
            WHERE h.employee_id = ae.employee_id AND h.action = 'update' AND h.field = 'designation'
              AND h."timestamp" > ar.created_at
            ORDER BY h."timestamp" ASC LIMIT 1), e.designation),
          employment_status_at_report = COALESCE((
            SELECT NULLIF(h.previous_value, '') FROM employee_history h
            WHERE h.employee_id = ae.employee_id AND h.action = 'update' AND h.field = 'employmentStatus'
              AND h."timestamp" > ar.created_at
            ORDER BY h."timestamp" ASC LIMIT 1), e.employment_status),
          pay_level_at_report = COALESCE((
            SELECT NULLIF(h.previous_value, '') FROM employee_history h
            WHERE h.employee_id = ae.employee_id AND h.action = 'update' AND h.field = 'payLevel'
              AND h."timestamp" > ar.created_at
            ORDER BY h."timestamp" ASC LIMIT 1), e.pay_level)
        FROM attendance_reports ar, employees e
        WHERE ar.id = ae.report_id AND e.id = ae.employee_id
          AND ae.designation_at_report IS NULL
      `);
      const n = (filled as any)?.rowCount ?? 0;
      if (n > 0) console.log(`[Migration] Filled designation-at-report for ${n} existing attendance entries`);
    } catch (e) {
      console.error('[Migration] designation-at-report backfill skipped:', e);
    }

    // New table: only used by the new feature (guards fail open if it is missing)
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS reporting_employees (
          id SERIAL PRIMARY KEY,
          employee_id INTEGER NOT NULL,
          host_department_id INTEGER NOT NULL,
          parent_department_id INTEGER NOT NULL,
          from_date DATE NOT NULL,
          to_date DATE,
          order_no TEXT,
          order_date DATE,
          letter_url TEXT,
          remarks TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          close_reason TEXT,
          created_by TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          closed_by TEXT,
          closed_at TIMESTAMP
        );
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_reporting_active_emp
          ON reporting_employees(employee_id) WHERE status = 'active';
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_reporting_host ON reporting_employees(host_department_id);
      `);
    } catch (reportingErr) {
      console.error("[Migrations] reporting_employees table creation failed (only the new feature is affected):", reportingErr);
    }

    // ─── Admin preferences (e.g. salary register order per dealing assistant) ──
    // New table only; failure affects just this preference feature.
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_preferences (
          id SERIAL PRIMARY KEY,
          admin_email TEXT NOT NULL,
          pref_key TEXT NOT NULL,
          value JSONB NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (admin_email, pref_key)
        );
      `);
    } catch (prefErr) {
      console.error("[Migrations] admin_preferences table creation failed (only register ordering is affected):", prefErr);
    }

    // ─── Dak (dispatch) lifecycle: action due date + disposal ────────────────
    // ADDITIVE: nullable columns only. Failure affects just the new dak features.
    try {
      await db.execute(sql`
        ALTER TABLE dispatch_recipients
          ADD COLUMN IF NOT EXISTS action_due_date DATE,
          ADD COLUMN IF NOT EXISTS disposed_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS disposal_type TEXT,
          ADD COLUMN IF NOT EXISTS disposal_remarks TEXT,
          ADD COLUMN IF NOT EXISTS file_number TEXT,
          ADD COLUMN IF NOT EXISTS disposed_by TEXT;
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dispatch_recipients_dept ON dispatch_recipients (department_id, dispatch_id)`);
    } catch (dakErr) {
      console.error("[Migrations] dispatch_recipients lifecycle columns failed (only dak disposal is affected):", dakErr);
    }

    // ─── e-Office: staff logins, e-files, dak attachments, reply links ────────
    // New tables use TIMESTAMPTZ (no time-zone shifts). Existing columns are only
    // added to (nullable), never changed. Failure affects just these features.
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS department_staff (
          id SERIAL PRIMARY KEY,
          department_id INTEGER NOT NULL,
          employee_id INTEGER,
          name TEXT NOT NULL,
          designation TEXT,
          email TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'dealing_assistant',
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_login TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_department_staff_email ON department_staff (LOWER(email))`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_department_staff_dept ON department_staff (department_id)`);

      await db.execute(sql`
        ALTER TABLE dispatch_recipients
          ADD COLUMN IF NOT EXISTS marked_staff_ids INTEGER[],
          ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS acknowledged_by TEXT,
          ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
      `);
      await db.execute(sql`ALTER TABLE dispatch_tracking ADD COLUMN IF NOT EXISTS action_by_staff_id INTEGER`);
      await db.execute(sql`
        ALTER TABLE dispatch_documents
          ADD COLUMN IF NOT EXISTS dispatch_mode TEXT,
          ADD COLUMN IF NOT EXISTS postal_tracking_no TEXT,
          ADD COLUMN IF NOT EXISTS postage_amount NUMERIC(10,2),
          ADD COLUMN IF NOT EXISTS in_reply_to_dispatch_id INTEGER,
          ADD COLUMN IF NOT EXISTS in_reply_to_recipient_id INTEGER,
          ADD COLUMN IF NOT EXISTS efile_id INTEGER,
          ADD COLUMN IF NOT EXISTS sender_department_ref INTEGER,
          ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
          ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
          ADD COLUMN IF NOT EXISTS verify_token TEXT,
          ADD COLUMN IF NOT EXISTS file_sha256 TEXT,
          ADD COLUMN IF NOT EXISTS ocr_text TEXT;
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_verify_token ON dispatch_documents (verify_token) WHERE verify_token IS NOT NULL`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS dispatch_attachments (
          id SERIAL PRIMARY KEY,
          dispatch_id INTEGER NOT NULL,
          file_url TEXT NOT NULL,
          file_type TEXT NOT NULL DEFAULT 'image',
          original_name TEXT,
          ocr_text TEXT,
          added_by TEXT,
          added_by_department_id INTEGER,
          added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dispatch_attachments_dispatch ON dispatch_attachments (dispatch_id)`);

      // e-Files: file register (A/B/C/D record category), noting/movement/correspondence entries
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS efiles (
          id SERIAL PRIMARY KEY,
          department_id INTEGER NOT NULL,
          file_number TEXT NOT NULL,
          subject TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'C',
          status TEXT NOT NULL DEFAULT 'open',
          current_holder_staff_id INTEGER,
          current_holder_name TEXT,
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          closed_at TIMESTAMPTZ,
          retention_until DATE,
          record_remarks TEXT,
          UNIQUE (department_id, file_number)
        );
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS efile_entries (
          id SERIAL PRIMARY KEY,
          efile_id INTEGER NOT NULL,
          kind TEXT NOT NULL,
          para_no INTEGER,
          body TEXT,
          dispatch_id INTEGER,
          to_staff_id INTEGER,
          to_name TEXT,
          by_staff_id INTEGER,
          by_name TEXT NOT NULL,
          draft_status TEXT,
          draft_meta JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_efile_entries_file ON efile_entries (efile_id, id)`);
      // Notifications: in-app inbox + delivery log of e-mail / SMS / WhatsApp
      await db.execute(sql`ALTER TABLE department_staff ADD COLUMN IF NOT EXISTS mobile TEXT`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          event TEXT NOT NULL,
          channel TEXT NOT NULL,
          adapter TEXT NOT NULL,
          department_id INTEGER,
          staff_id INTEGER,
          address TEXT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          link TEXT,
          status TEXT NOT NULL,
          error TEXT,
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON notifications (department_id, channel, read_at, id)`);
    } catch (officeErr) {
      console.error("[Migrations] e-Office tables failed (staff logins / e-files / attachments affected):", officeErr);
    }

    // ── Online claim forms (NPA / HRA / PCA / Conveyance / CEA) ──────────────
    // Only NEW tables and NEW nullable columns: nothing existing is changed, so the
    // app version without claim forms keeps working on the same database.
    try {
      // Payroll-master values the forms need. Filled by the Oracle sync on every
      // "Fetch" (server/oracleSync.ts → refreshPayrollFlags); never edited in forms.
      await db.execute(sql`
        ALTER TABLE employees
          ADD COLUMN IF NOT EXISTS payroll_joining_date DATE,
          ADD COLUMN IF NOT EXISTS payroll_confirm_date DATE,
          ADD COLUMN IF NOT EXISTS conveyance_flag TEXT,
          ADD COLUMN IF NOT EXISTS hra_flag TEXT,
          ADD COLUMN IF NOT EXISTS pca_flag TEXT,
          ADD COLUMN IF NOT EXISTS npa_flag TEXT,
          ADD COLUMN IF NOT EXISTS vacation_code TEXT,
          ADD COLUMN IF NOT EXISTS spouse_epid TEXT,
          ADD COLUMN IF NOT EXISTS bank_code TEXT,
          ADD COLUMN IF NOT EXISTS payroll_flags_at TIMESTAMPTZ;
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS claim_forms (
          id SERIAL PRIMARY KEY,
          form_type TEXT NOT NULL,               -- npa | hra | pca | conveyance | cea
          ref_no TEXT UNIQUE,                    -- e.g. NPA/2026/000123 (set right after insert)
          revision INTEGER NOT NULL DEFAULT 1,   -- +1 on every change of the data: old prints stop matching
          employee_id INTEGER NOT NULL,
          epid TEXT NOT NULL,
          department_id INTEGER NOT NULL,        -- department that certifies and uploads (where attendance comes from)
          period_key TEXT NOT NULL,              -- what the claim is for (appointment / half-year / quarter …)
          period_label TEXT,
          status TEXT NOT NULL DEFAULT 'draft',  -- draft | submitted | sent | returned_department | returned_employee | accepted | processed | rejected | cancelled
          data JSONB NOT NULL DEFAULT '{}'::jsonb,       -- what the employee filled in
          snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,   -- name / designation / department … as they were at that time
          dispatch_no TEXT,
          dispatch_date DATE,
          ai_check JSONB,
          return_reason TEXT,
          returned_by TEXT,
          decided_by TEXT,
          processed_month TEXT,                  -- paybill month in which it was given effect, 'YYYY-MM'
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          submitted_at TIMESTAMPTZ,
          sent_at TIMESTAMPTZ,
          decided_at TIMESTAMPTZ
        );
      `);
      // One live claim per employee + form + period (rejected / cancelled ones do not count)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_forms_live ON claim_forms (employee_id, form_type, period_key)
        WHERE status NOT IN ('rejected', 'cancelled')`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_claim_forms_department ON claim_forms (department_id, status)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_claim_forms_status ON claim_forms (status, form_type)`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS claim_form_files (
          id SERIAL PRIMARY KEY,
          claim_id INTEGER NOT NULL,
          kind TEXT NOT NULL,                    -- undertaking | signed_form | …
          file_url TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          uploaded_by TEXT NOT NULL,
          is_current BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_claim_form_files_claim ON claim_form_files (claim_id, kind)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_claim_form_files_url ON claim_form_files (file_url)`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS claim_form_events (
          id SERIAL PRIMARY KEY,
          claim_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          from_status TEXT,
          to_status TEXT,
          actor_type TEXT NOT NULL,              -- employee | department | staff | admin | system
          actor_name TEXT NOT NULL,
          remarks TEXT,
          ip TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_claim_form_events_claim ON claim_form_events (claim_id, id)`);

      // Conveyance allowance already paid through the payroll (copied by the Oracle sync on
      // every fetch): a paid period cannot be claimed again online.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS conveyance_paid (
          id SERIAL PRIMARY KEY,
          epid TEXT NOT NULL,
          period_from DATE NOT NULL,
          period_to DATE,
          amount NUMERIC(12,2),
          vehicle_type TEXT,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_conveyance_paid_epid ON conveyance_paid (epid, period_from)`);
      // Rate of the conveyance allowance and the DA on it, each from a month onwards
      await db.execute(sql`
        INSERT INTO app_settings (key, value)
        VALUES ('conveyance_rates', '[{"from":"2000-01","amount":3300,"daPercent":103}]')
        ON CONFLICT (key) DO NOTHING`);

      // Children Education Allowance: schools (kept by the Salary Section). Filled once from
      // the DSE register when empty; rates are kept in app_settings ('cea_rates').
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cea_schools (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          place TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT 'aligarh',     -- aligarh | outside
          status TEXT NOT NULL DEFAULT 'unknown',       -- recognised | not_recognised | unknown
          dse_reference TEXT NOT NULL DEFAULT '',
          session TEXT NOT NULL DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT true,
          updated_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      const schoolCount = await db.execute(sql`SELECT COUNT(*)::int AS n FROM cea_schools`);
      if (Number((schoolCount.rows[0] as any).n) === 0) {
        const { CEA_SCHOOLS_SEED } = await import("./ceaSchoolsSeed");
        await db.execute(sql`
          INSERT INTO cea_schools (name, location, status, dse_reference, session, updated_by)
          SELECT x.name, x.location, x.status, x."dseReference", x.session, 'DSE register'
          FROM jsonb_to_recordset(${JSON.stringify(CEA_SCHOOLS_SEED)}::jsonb)
            AS x(name text, location text, status text, "dseReference" text, session text)`);
      }

      // From the payroll (copied by the Oracle sync on every fetch) for the CEA form:
      // children in the family details (service book), CEA already paid, spouse details.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS payroll_children (
          id SERIAL PRIMARY KEY,
          epid TEXT NOT NULL,
          name TEXT NOT NULL,
          dob DATE,
          relation TEXT NOT NULL,          -- S = son, D = daughter
          sex TEXT,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_payroll_children_epid ON payroll_children (epid)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cea_paid (
          id SERIAL PRIMARY KEY,
          epid TEXT NOT NULL,
          child_name TEXT,
          dob DATE,
          session TEXT,                    -- "2025-2026"
          class_name TEXT,
          amount NUMERIC(12,2),
          financial_year TEXT,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cea_paid_epid ON cea_paid (epid, dob)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS payroll_spouse (
          epid TEXT PRIMARY KEY,
          name TEXT,
          designation TEXT,
          organisation TEXT,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // The forms are switched OFF until the super admin turns them on
      await db.execute(sql`
        INSERT INTO app_settings (key, value) VALUES ('claim_forms_enabled', 'false')
        ON CONFLICT (key) DO NOTHING`);
    } catch (claimErr) {
      console.error("[Migrations] claim form tables failed (online claim forms affected):", claimErr);
    }

    console.log("Database migrations completed successfully");

  } catch (error) {
    console.error("Error running migrations:", error);
    throw error;
  }
}
