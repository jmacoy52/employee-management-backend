-- Add start_date column to employees table
ALTER TABLE employees ADD COLUMN start_date DATE;

-- Update existing records to have today's date as start_date
UPDATE employees SET start_date = CURDATE() WHERE start_date IS NULL;
