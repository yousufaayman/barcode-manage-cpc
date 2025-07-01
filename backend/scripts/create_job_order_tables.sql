USE barcode_management_v2;

-- ============================================================================
-- JOB ORDER TABLES
-- ============================================================================

-- Main job order table
CREATE TABLE `job_orders` (
  `job_order_id` int unsigned NOT NULL AUTO_INCREMENT,
  `model_id` int unsigned NOT NULL,
  `job_order_number` varchar(100) NOT NULL,
  PRIMARY KEY (`job_order_id`),
  UNIQUE KEY `job_order_number` (`job_order_number`),
  KEY `model_id` (`model_id`),
  CONSTRAINT `job_orders_ibfk_1` FOREIGN KEY (`model_id`) REFERENCES `models` (`model_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Job order items table for color_id/quantity pairs
CREATE TABLE `job_order_items` (
  `item_id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_order_id` int unsigned NOT NULL,
  `color_id` int unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  PRIMARY KEY (`item_id`),
  UNIQUE KEY `job_order_color_unique` (`job_order_id`, `color_id`),
  KEY `job_order_id` (`job_order_id`),
  KEY `color_id` (`color_id`),
  KEY `quantity` (`quantity`),
  CONSTRAINT `job_order_items_ibfk_1` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE,
  CONSTRAINT `job_order_items_ibfk_2` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add indexes for better performance
CREATE INDEX `idx_job_order_items_job_order` ON `job_order_items` (`job_order_id`);
CREATE INDEX `idx_job_order_items_color` ON `job_order_items` (`color_id`);

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Insert sample job orders (uncomment if you want sample data)
/*
INSERT INTO `job_orders` (`model_id`, `job_order_number`) VALUES
(1, 'JO-2024-001'),
(45, 'JO-2024-002');

INSERT INTO `job_order_items` (`job_order_id`, `color_id`, `quantity`) VALUES
(1, 31, 100),   -- Black: 100 pieces
(1, 687, 50),   -- Beige: 50 pieces
(1, 721, 75),   -- Navy: 75 pieces
(2, 31, 200),   -- Black: 200 pieces
(2, 590, 150);  -- Red: 150 pieces
*/

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- View to get job orders with model information
CREATE VIEW `job_orders_with_model` AS
SELECT 
    jo.job_order_id,
    jo.job_order_number,
    m.model_id,
    m.model_name
FROM job_orders jo
JOIN models m ON jo.model_id = m.model_id;

-- View to get job order items with color information
CREATE VIEW `job_order_items_with_details` AS
SELECT 
    joi.item_id,
    joi.job_order_id,
    joi.color_id,
    joi.quantity,
    c.color_name,
    jo.job_order_number,
    m.model_name
FROM job_order_items joi
JOIN colors c ON joi.color_id = c.color_id
JOIN job_orders jo ON joi.job_order_id = jo.job_order_id
JOIN models m ON jo.model_id = m.model_id;

-- View to get job order summary with total quantities
CREATE VIEW `job_order_summary` AS
SELECT 
    jo.job_order_id,
    jo.job_order_number,
    m.model_name,
    COUNT(joi.item_id) as total_colors,
    SUM(joi.quantity) as total_quantity
FROM job_orders jo
JOIN models m ON jo.model_id = m.model_id
LEFT JOIN job_order_items joi ON jo.job_order_id = joi.job_order_id
GROUP BY jo.job_order_id, jo.job_order_number, m.model_name;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables were created
SHOW TABLES LIKE 'job_orders';
SHOW TABLES LIKE 'job_order_items';

-- Show table structure
select * from job_orders;
DESCRIBE job_order_items;

-- Add closed column to job_orders table
ALTER TABLE job_orders ADD COLUMN closed BOOLEAN NOT NULL DEFAULT FALSE;

-- Update existing job orders to be open by default
UPDATE job_orders SET closed = FALSE WHERE closed IS NULL;

-- Show views
SHOW TABLES LIKE 'job_orders_with_model';
SHOW TABLES LIKE 'job_order_items_with_details';
SHOW TABLES LIKE 'job_order_summary'; 