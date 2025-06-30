USE barcode_management_v2;

-- ============================================================================
-- MODIFY JOB ORDER TABLES TO INCLUDE SIZES
-- ============================================================================

-- First, drop the existing job_order_items table and recreate it with size_id
DROP TABLE IF EXISTS `job_order_items`;

-- Recreate job_order_items table with size_id
CREATE TABLE `job_order_items` (
  `item_id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_order_id` int unsigned NOT NULL,
  `color_id` int unsigned NOT NULL,
  `size_id` int unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  PRIMARY KEY (`item_id`),
  UNIQUE KEY `job_order_color_size_unique` (`job_order_id`, `color_id`, `size_id`),
  KEY `job_order_id` (`job_order_id`),
  KEY `color_id` (`color_id`),
  KEY `size_id` (`size_id`),
  KEY `quantity` (`quantity`),
  CONSTRAINT `job_order_items_ibfk_1` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE,
  CONSTRAINT `job_order_items_ibfk_2` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE RESTRICT,
  CONSTRAINT `job_order_items_ibfk_3` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`size_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add indexes for better performance
CREATE INDEX `idx_job_order_items_job_order` ON `job_order_items` (`job_order_id`);
CREATE INDEX `idx_job_order_items_color` ON `job_order_items` (`color_id`);
CREATE INDEX `idx_job_order_items_size` ON `job_order_items` (`size_id`);
CREATE INDEX `idx_job_order_items_color_size` ON `job_order_items` (`color_id`, `size_id`);

-- ============================================================================
-- UPDATE VIEWS FOR EASY QUERYING
-- ============================================================================

-- Drop existing views
DROP VIEW IF EXISTS `job_order_items_with_details`;
DROP VIEW IF EXISTS `job_order_summary`;

-- View to get job order items with color and size information
CREATE VIEW `job_order_items_with_details` AS
SELECT 
    joi.item_id,
    joi.job_order_id,
    joi.color_id,
    joi.size_id,
    joi.quantity,
    c.color_name,
    s.size_value,
    jo.job_order_number,
    m.model_name
FROM job_order_items joi
JOIN colors c ON joi.color_id = c.color_id
JOIN sizes s ON joi.size_id = s.size_id
JOIN job_orders jo ON joi.job_order_id = jo.job_order_id
JOIN models m ON jo.model_id = m.model_id;

-- View to get job order summary with total quantities
CREATE VIEW `job_order_summary` AS
SELECT 
    jo.job_order_id,
    jo.job_order_number,
    m.model_name,
    COUNT(joi.item_id) as total_items,
    SUM(joi.quantity) as total_quantity
FROM job_orders jo
JOIN models m ON jo.model_id = m.model_id
LEFT JOIN job_order_items joi ON jo.job_order_id = joi.job_order_id
GROUP BY jo.job_order_id, jo.job_order_number, m.model_name;

-- ============================================================================
-- PRODUCTION TRACKING VIEWS
-- ============================================================================

-- View to track production progress by job order, color, and size
CREATE VIEW `job_order_production_tracking` AS
SELECT 
    jo.job_order_id,
    jo.job_order_number,
    m.model_name,
    joi.color_id,
    joi.size_id,
    c.color_name,
    s.size_value,
    joi.quantity as expected_quantity,
    COALESCE(SUM(b.quantity), 0) as produced_quantity,
    (joi.quantity - COALESCE(SUM(b.quantity), 0)) as remaining_quantity,
    CASE 
        WHEN COALESCE(SUM(b.quantity), 0) >= joi.quantity THEN 'Completed'
        WHEN COALESCE(SUM(b.quantity), 0) > 0 THEN 'In Progress'
        ELSE 'Not Started'
    END as production_status
FROM job_orders jo
JOIN models m ON jo.model_id = m.model_id
JOIN job_order_items joi ON jo.job_order_id = joi.job_order_id
JOIN colors c ON joi.color_id = c.color_id
JOIN sizes s ON joi.size_id = s.size_id
LEFT JOIN batches b ON jo.job_order_id = b.job_order_id 
    AND joi.color_id = b.color_id 
    AND joi.size_id = b.size_id
GROUP BY jo.job_order_id, jo.job_order_number, m.model_name, joi.color_id, joi.size_id, c.color_name, s.size_value, joi.quantity;

-- View to get overall job order production status
CREATE VIEW `job_order_overall_status` AS
SELECT 
    jo.job_order_id,
    jo.job_order_number,
    m.model_name,
    COUNT(joi.item_id) as total_items,
    SUM(joi.quantity) as total_expected,
    COALESCE(SUM(produced.quantity), 0) as total_produced,
    (SUM(joi.quantity) - COALESCE(SUM(produced.quantity), 0)) as total_remaining,
    CASE 
        WHEN COALESCE(SUM(produced.quantity), 0) >= SUM(joi.quantity) THEN 'Completed'
        WHEN COALESCE(SUM(produced.quantity), 0) > 0 THEN 'In Progress'
        ELSE 'Not Started'
    END as overall_status,
    ROUND((COALESCE(SUM(produced.quantity), 0) / SUM(joi.quantity)) * 100, 2) as completion_percentage
FROM job_orders jo
JOIN models m ON jo.model_id = m.model_id
JOIN job_order_items joi ON jo.job_order_id = joi.job_order_id
LEFT JOIN (
    SELECT 
        b.job_order_id,
        b.color_id,
        b.size_id,
        SUM(b.quantity) as quantity
    FROM batches b
    GROUP BY b.job_order_id, b.color_id, b.size_id
) produced ON jo.job_order_id = produced.job_order_id 
    AND joi.color_id = produced.color_id 
    AND joi.size_id = produced.size_id
GROUP BY jo.job_order_id, jo.job_order_number, m.model_name;

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Insert sample job order items with sizes (uncomment if you want sample data)
/*
INSERT INTO `job_order_items` (`job_order_id`, `color_id`, `size_id`, `quantity`) VALUES
(1, 31, 21, 50),   -- Black, S: 50 pieces
(1, 31, 23, 75),   -- Black, M: 75 pieces
(1, 31, 25, 60),   -- Black, L: 60 pieces
(1, 687, 21, 30),  -- Beige, S: 30 pieces
(1, 687, 23, 45),  -- Beige, M: 45 pieces
(1, 721, 25, 40),  -- Navy, L: 40 pieces
(2, 31, 23, 100),  -- Black, M: 100 pieces
(2, 590, 25, 80);  -- Red, L: 80 pieces
*/

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables were modified
SHOW TABLES LIKE 'job_orders';
SHOW TABLES LIKE 'job_order_items';

-- Show table structure
DESCRIBE job_orders;
DESCRIBE job_order_items;

-- Show views
SHOW TABLES LIKE 'job_orders_with_model';
SHOW TABLES LIKE 'job_order_items_with_details';
SHOW TABLES LIKE 'job_order_summary';
SHOW TABLES LIKE 'job_order_production_tracking';
SHOW TABLES LIKE 'job_order_overall_status'; 