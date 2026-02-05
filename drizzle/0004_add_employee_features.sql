-- Migration: Add Employee Management Features
-- Date: 2026-02-04
-- Description: Adds disable reason, remarks, transfer system, and audit trail
-- 
-- This migration can be rolled back using the DROP statements at the bottom
-- To rollback: Run the ROLLBACK section only

-- =============================================
-- UP MIGRATION
-- =============================================

-- 1. Add disable reason fields to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disable_reason TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disable_wef_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_by TEXT;

-- 2. Add remarks field
ALTER TABLE employees ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. Add transfer status
ALTER TABLE employees ADD COLUMN IF NOT EXISTS transfer_status TEXT;

-- 4. Create transfer_requests table
CREATE TABLE IF NOT EXISTS transfer_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    from_department_id INTEGER NOT NULL,
    to_department_id INTEGER NOT NULL,
    order_number TEXT NOT NULL,
    order_date DATE NOT NULL,
    relieving_date DATE NOT NULL,
    remarks TEXT NOT NULL,
    hod_signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    rejection_remarks TEXT,
    rejected_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- 5. Create employee_history table for audit trail
CREATE TABLE IF NOT EXISTS employee_history (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    field TEXT NOT NULL,
    previous_value TEXT,
    changed_by TEXT NOT NULL,
    changed_by_role TEXT NOT NULL,
    department_id INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transfer_requests_to_dept ON transfer_requests(to_department_id, status);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_from_dept ON transfer_requests(from_department_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_employee ON transfer_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_history_employee ON employee_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_history_timestamp ON employee_history(timestamp);

-- =============================================
-- ROLLBACK SECTION (Run only if you need to undo this migration)
-- =============================================
-- 
-- To rollback, uncomment and run the following:
--
-- DROP INDEX IF EXISTS idx_employee_history_timestamp;
-- DROP INDEX IF EXISTS idx_employee_history_employee;
-- DROP INDEX IF EXISTS idx_transfer_requests_employee;
-- DROP INDEX IF EXISTS idx_transfer_requests_from_dept;
-- DROP INDEX IF EXISTS idx_transfer_requests_to_dept;
-- DROP TABLE IF EXISTS employee_history;
-- DROP TABLE IF EXISTS transfer_requests;
-- ALTER TABLE employees DROP COLUMN IF EXISTS transfer_status;
-- ALTER TABLE employees DROP COLUMN IF EXISTS remarks;
-- ALTER TABLE employees DROP COLUMN IF EXISTS disabled_by;
-- ALTER TABLE employees DROP COLUMN IF EXISTS disabled_at;
-- ALTER TABLE employees DROP COLUMN IF EXISTS disable_wef_date;
-- ALTER TABLE employees DROP COLUMN IF EXISTS disable_reason;
