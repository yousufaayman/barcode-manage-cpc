-- =====================================================
-- Complete Database Setup Script for Barcode Management System
-- =====================================================
-- Based on schema analysis from June 21, 2025
-- This script creates the complete database schema with all tables, 
-- triggers, procedures, indexes, and initial data

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS `barcode_management` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_0900_ai_ci;

USE `barcode_management`;

-- =====================================================
-- TABLE CREATION STATEMENTS
-- =====================================================

-- Production phases table (must be created first due to foreign key dependencies)
CREATE TABLE `production_phases` (
    `phase_id` TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `phase_name` VARCHAR(50) NOT NULL UNIQUE
);

-- Brands table
CREATE TABLE `brands` (
    `brand_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `brand_name` VARCHAR(100) NOT NULL UNIQUE
);

-- Models table
CREATE TABLE `models` (
    `model_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `model_name` VARCHAR(100) NOT NULL UNIQUE
);

-- Sizes table
CREATE TABLE `sizes` (
    `size_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `size_value` VARCHAR(20) NOT NULL UNIQUE
);

-- Colors table
CREATE TABLE `colors` (
    `color_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `color_name` VARCHAR(50) NOT NULL UNIQUE
);

-- Users table
CREATE TABLE `users` (
    `user_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('Admin', 'Cutting', 'Sewing', 'Packaging') NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Batches table (main table)
CREATE TABLE `batches` (
    `batch_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `barcode` VARCHAR(100) NOT NULL UNIQUE,
    `brand_id` INT UNSIGNED NOT NULL,
    `model_id` INT UNSIGNED NOT NULL,
    `size_id` INT UNSIGNED NOT NULL,
    `color_id` INT UNSIGNED NOT NULL,
    `quantity` INT UNSIGNED NOT NULL CHECK (`quantity` > 0),
    `layers` INT UNSIGNED NOT NULL CHECK (`layers` > 0),
    `serial` VARCHAR(3) NOT NULL,
    `current_phase` TINYINT UNSIGNED NOT NULL,
    `status` ENUM('Pending', 'In Progress', 'Completed') NOT NULL DEFAULT 'Pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `last_updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`brand_id`) REFERENCES `brands`(`brand_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`model_id`) REFERENCES `models`(`model_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`size_id`) REFERENCES `sizes`(`size_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`color_id`) REFERENCES `colors`(`color_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`current_phase`) REFERENCES `production_phases`(`phase_id`) ON DELETE RESTRICT,
    INDEX `idx_batches_barcode` (`barcode`),
    INDEX `idx_batches_status_phase` (`status`, `current_phase`),
    INDEX `idx_batches_updated_at` (`last_updated_at`)
);

-- Barcode status timeline table
CREATE TABLE `barcode_status_timeline` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `batch_id` INT UNSIGNED NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `phase_id` TINYINT UNSIGNED NOT NULL,
    `start_time` DATETIME NOT NULL,
    `end_time` DATETIME NULL,
    `duration_minutes` INT UNSIGNED NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`batch_id`) REFERENCES `batches`(`batch_id`) ON DELETE CASCADE,
    FOREIGN KEY (`phase_id`) REFERENCES `production_phases`(`phase_id`) ON DELETE RESTRICT,
    INDEX `idx_timeline_batch_id` (`batch_id`),
    INDEX `idx_timeline_start_time` (`start_time`)
);

-- Archived batches table
CREATE TABLE `archived_batches` (
    `batch_id` INT UNSIGNED NOT NULL,
    `barcode` VARCHAR(100) NOT NULL,
    `brand_id` INT UNSIGNED NOT NULL,
    `model_id` INT UNSIGNED NOT NULL,
    `size_id` INT UNSIGNED NOT NULL,
    `color_id` INT UNSIGNED NOT NULL,
    `quantity` INT UNSIGNED NOT NULL,
    `layers` INT UNSIGNED NOT NULL,
    `serial` VARCHAR(3) NOT NULL,
    `current_phase` TINYINT UNSIGNED NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `created_at` DATETIME NOT NULL,
    `last_updated_at` DATETIME NOT NULL,
    `archived_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`batch_id`),
    UNIQUE KEY `uk_archived_barcode` (`barcode`),
    FOREIGN KEY (`brand_id`) REFERENCES `brands`(`brand_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`model_id`) REFERENCES `models`(`model_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`size_id`) REFERENCES `sizes`(`size_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`color_id`) REFERENCES `colors`(`color_id`) ON DELETE RESTRICT,
    FOREIGN KEY (`current_phase`) REFERENCES `production_phases`(`phase_id`) ON DELETE RESTRICT,
    INDEX `idx_archived_barcode` (`barcode`),
    INDEX `idx_archived_archived_at` (`archived_at`)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Batches table indexes
CREATE INDEX `barcode` ON `batches`(`barcode`);
CREATE INDEX `brand_id` ON `batches`(`brand_id`);
CREATE INDEX `model_id` ON `batches`(`model_id`);
CREATE INDEX `size_id` ON `batches`(`size_id`);
CREATE INDEX `color_id` ON `batches`(`color_id`);
CREATE INDEX `current_phase` ON `batches`(`current_phase`);

-- Barcode status timeline indexes
CREATE INDEX `batch_id` ON `barcode_status_timeline`(`batch_id`);
CREATE INDEX `phase_id` ON `barcode_status_timeline`(`phase_id`);

-- Archived batches indexes
CREATE INDEX `ix_archived_batches_barcode` ON `archived_batches`(`barcode`);
CREATE INDEX `brand_id` ON `archived_batches`(`brand_id`);
CREATE INDEX `model_id` ON `archived_batches`(`model_id`);
CREATE INDEX `size_id` ON `archived_batches`(`size_id`);
CREATE INDEX `color_id` ON `archived_batches`(`color_id`);
CREATE INDEX `current_phase` ON `archived_batches`(`current_phase`);
CREATE INDEX `ix_archived_batches_batch_id` ON `archived_batches`(`batch_id`);

-- Master data indexes (unique constraints already create indexes)
-- brands: brand_name (UNIQUE)
-- colors: color_name (UNIQUE)
-- models: model_name (UNIQUE)
-- production_phases: phase_name (UNIQUE)
-- sizes: size_value (UNIQUE)
-- users: username (UNIQUE)

-- =====================================================
-- TRIGGERS
-- =====================================================

DELIMITER //

-- Trigger to handle phase transitions automatically
CREATE TRIGGER `handle_phase_transitions`
BEFORE UPDATE ON `batches`
FOR EACH ROW
BEGIN
    -- If changing to phase 1 (Cutting) and status 'Completed'
    IF NEW.current_phase = 1 AND NEW.status = 'Completed' THEN
        -- Then set it to phase 2 (Sewing) and status 'Pending' instead
        SET NEW.current_phase = 2;
        SET NEW.status = 'Pending';
    
    -- If changing to phase 2 (Sewing) and status 'Completed'
    ELSEIF NEW.current_phase = 2 AND NEW.status = 'Completed' THEN
        -- Then set it to phase 3 (Packaging) and status 'Pending' instead
        SET NEW.current_phase = 3;
        SET NEW.status = 'Pending';
    
    -- For phase 3 (Packaging) and Completed, we keep it as-is
    END IF;
END //

-- Trigger to automatically update timeline when batch status changes
CREATE TRIGGER `update_timeline_on_status_change`
AFTER UPDATE ON `batches`
FOR EACH ROW
BEGIN
    -- If status or phase changed, record in timeline
    IF OLD.status != NEW.status OR OLD.current_phase != NEW.current_phase THEN
        -- Close the previous timeline entry
        UPDATE `barcode_status_timeline` 
        SET `end_time` = NOW(),
            `duration_minutes` = TIMESTAMPDIFF(MINUTE, `start_time`, NOW())
        WHERE `batch_id` = NEW.batch_id 
        AND `end_time` IS NULL;
        
        -- Insert new timeline entry
        INSERT INTO `barcode_status_timeline` (`batch_id`, `status`, `phase_id`, `start_time`)
        VALUES (NEW.batch_id, NEW.status, NEW.current_phase);
    END IF;
END //

-- Trigger to create initial timeline entry when batch is created
CREATE TRIGGER `create_initial_timeline_entry`
AFTER INSERT ON `batches`
FOR EACH ROW
BEGIN
    INSERT INTO `barcode_status_timeline` (`batch_id`, `status`, `phase_id`, `start_time`)
    VALUES (NEW.batch_id, NEW.status, NEW.current_phase);
END //

DELIMITER ;

-- =====================================================
-- STORED PROCEDURES
-- =====================================================

DELIMITER //

-- Procedure to archive old batches (optimized version)
CREATE PROCEDURE `archive_old_batches`()
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    -- Start transaction to ensure data consistency
    START TRANSACTION;
    
    -- Insert batches that haven't been updated in 3 months into archived_batches
    INSERT INTO `archived_batches` (
        `batch_id`, `barcode`, `brand_id`, `model_id`, `size_id`, `color_id`,
        `quantity`, `layers`, `serial`, `current_phase`, `status`, 
        `created_at`, `last_updated_at`
    )
    SELECT 
        `batch_id`, `barcode`, `brand_id`, `model_id`, `size_id`, `color_id`,
        `quantity`, `layers`, `serial`, `current_phase`, `status`,
        `created_at`, `last_updated_at`
    FROM `batches`
    WHERE `last_updated_at` < DATE_SUB(NOW(), INTERVAL 3 MONTH)
    AND `batch_id` NOT IN (
        SELECT `batch_id` FROM `archived_batches`
    );

    -- Delete the archived batches from the original table
    DELETE FROM `batches`
    WHERE `last_updated_at` < DATE_SUB(NOW(), INTERVAL 3 MONTH);
    
    -- Commit the transaction
    COMMIT;
END //

-- Procedure to get batch statistics
CREATE PROCEDURE `get_batch_statistics`()
BEGIN
    SELECT 
        COUNT(*) as total_batches,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_batches,
        COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_batches,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_batches,
        COUNT(CASE WHEN current_phase = 1 THEN 1 END) as cutting_batches,
        COUNT(CASE WHEN current_phase = 2 THEN 1 END) as sewing_batches,
        COUNT(CASE WHEN current_phase = 3 THEN 1 END) as packaging_batches
    FROM `batches`;
END //

DELIMITER ;

-- =====================================================
-- EVENTS
-- =====================================================

-- Event to run the archiving procedure automatically
CREATE EVENT `archive_batches_event`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
    CALL `archive_old_batches`();

-- =====================================================
-- INITIAL DATA INSERTION
-- =====================================================

-- Insert production phases (order matters for foreign keys)
INSERT INTO `production_phases` (`phase_name`) VALUES
    ('Cutting'),
    ('Sewing'),
    ('Packaging');

-- Insert admin user (password: admin123 - bcrypt hashed)
INSERT INTO `users` (`username`, `password`, `role`) VALUES
    ('admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5u.G', 'Admin');

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Display setup completion message
SELECT 'Database setup completed successfully!' as message;
SELECT 'Default admin credentials: admin / admin123' as credentials;
SELECT 'Remember to change the admin password after first login!' as reminder;

-- Verify table creation
SELECT 
    'Tables created:' as info,
    COUNT(*) as total_tables
FROM information_schema.tables 
WHERE table_schema = 'barcode_management';

-- Verify indexes
SELECT 
    'Indexes created:' as info,
    COUNT(*) as total_indexes
FROM information_schema.statistics 
WHERE table_schema = 'barcode_management';

-- Verify triggers
SELECT 
    'Triggers created:' as info,
    COUNT(*) as total_triggers
FROM information_schema.triggers 
WHERE trigger_schema = 'barcode_management';

-- Verify stored procedures
SELECT 
    'Stored procedures created:' as info,
    COUNT(*) as total_procedures
FROM information_schema.routines 
WHERE routine_schema = 'barcode_management';

-- Verify events
SELECT 
    'Events created:' as info,
    COUNT(*) as total_events
FROM information_schema.events 
WHERE event_schema = 'barcode_management';

-- Verify initial data
SELECT 
    'Production phases:' as info,
    COUNT(*) as count
FROM production_phases;

SELECT 
    'Users created:' as info,
    COUNT(*) as count
FROM users;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================

-- Final confirmation
SELECT '========================================' as separator;
SELECT 'SETUP COMPLETE' as status;
SELECT '========================================' as separator;
SELECT 'All tables, indexes, triggers, procedures, and events have been created.' as message;
SELECT 'Initial data has been inserted.' as message;
SELECT 'The database is ready for use!' as message; 