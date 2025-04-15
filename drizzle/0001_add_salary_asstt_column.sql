-- Add salary_asstt column to employees table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'employees'
        AND column_name = 'salary_asstt'
    ) THEN
        ALTER TABLE employees ADD COLUMN salary_asstt TEXT;
    END IF;
END $$; 