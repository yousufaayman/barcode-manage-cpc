-- Add closed column to job_orders table
ALTER TABLE job_orders ADD COLUMN closed BOOLEAN NOT NULL DEFAULT FALSE;

-- Update existing job orders to be open by default
UPDATE job_orders SET closed = FALSE WHERE closed IS NULL; 