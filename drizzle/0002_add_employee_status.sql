-- Add isActive column to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active TEXT NOT NULL DEFAULT 'active';

-- Update existing employees to have active status
UPDATE employees SET is_active = 'active' WHERE is_active IS NULL;