USE barcode_management_v2;

-- ============================================================================
-- ALTER BATCHES TABLE TO ADD JOB ORDER FOREIGN KEY
-- ============================================================================

-- First, create job order ID 1 if it doesn't exist
INSERT IGNORE INTO `job_orders` (`job_order_id`, `model_id`, `job_order_number`) VALUES
(1, 1, 'JO-LEGACY-001');

-- Add job_order_id column to batches table
ALTER TABLE `batches` 
ADD COLUMN `job_order_id` int unsigned NULL AFTER `batch_id`;

-- Add index for better performance
CREATE INDEX `idx_batches_job_order` ON `batches` (`job_order_id`);

-- Update all existing batches to have job_order_id = 1
UPDATE `batches` 
SET `job_order_id` = 1 
WHERE `job_order_id` IS NULL;

-- Now add the foreign key constraint with CASCADE (not SET NULL)
ALTER TABLE `batches` 
ADD CONSTRAINT `batches_ibfk_job_order` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE;

-- Make the column NOT NULL after updating all records and setting proper constraint
ALTER TABLE `batches` 
MODIFY COLUMN `job_order_id` int unsigned NOT NULL;

-- ============================================================================
-- UPDATE ARCHIVED BATCHES TABLE AS WELL
-- ============================================================================

-- Add job_order_id column to archived_batches table
ALTER TABLE `archived_batches` 
ADD COLUMN `job_order_id` int unsigned NULL AFTER `batch_id`;

-- Add index for better performance
CREATE INDEX `idx_archived_batches_job_order` ON `archived_batches` (`job_order_id`);

-- Update all existing archived batches to have job_order_id = 1
UPDATE `archived_batches` 
SET `job_order_id` = 1 
WHERE `job_order_id` IS NULL;

-- Add the foreign key constraint with CASCADE
ALTER TABLE `archived_batches` 
ADD CONSTRAINT `archived_batches_ibfk_job_order` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE;

-- Make the column NOT NULL after updating all records
ALTER TABLE `archived_batches` 
MODIFY COLUMN `job_order_id` int unsigned NOT NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify the job order was created
SELECT * FROM `job_orders` WHERE `job_order_id` = 1;

-- Check batches table structure
DESCRIBE `batches`;

-- Verify all batches have job_order_id = 1
SELECT COUNT(*) as total_batches, 
       COUNT(CASE WHEN job_order_id = 1 THEN 1 END) as batches_with_job_order_1,
       COUNT(CASE WHEN job_order_id IS NULL THEN 1 END) as batches_with_null_job_order
FROM `batches`;

-- Check archived batches
SELECT COUNT(*) as total_archived_batches, 
       COUNT(CASE WHEN job_order_id = 1 THEN 1 END) as archived_batches_with_job_order_1,
       COUNT(CASE WHEN job_order_id IS NULL THEN 1 END) as archived_batches_with_null_job_order
FROM `archived_batches`;

-- Show sample of updated batches
SELECT batch_id, job_order_id, barcode, brand_id, model_id 
FROM `batches` 
LIMIT 10;

-- Show foreign key constraints
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE REFERENCED_TABLE_SCHEMA = 'barcode_management_v2' 
AND REFERENCED_TABLE_NAME = 'job_orders'; 

select * from batches;