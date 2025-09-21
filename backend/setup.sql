-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: barcode_management_v2
-- ------------------------------------------------------
-- Server version	8.0.42

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `archived_batches`
--

DROP TABLE IF EXISTS `archived_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `archived_batches` (
  `batch_id` int NOT NULL AUTO_INCREMENT,
  `job_order_id` int NOT NULL,
  `barcode` varchar(255) DEFAULT NULL,
  `size_id` int DEFAULT NULL,
  `color_id` int DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `layers` int DEFAULT NULL,
  `serial` varchar(3) NOT NULL,
  `current_phase` int DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `last_updated_at` datetime DEFAULT NULL,
  `archived_at` datetime DEFAULT NULL,
  `notes` varchar(1000) DEFAULT NULL,
  `is_second_degree` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`batch_id`),
  UNIQUE KEY `ix_archived_batches_barcode` (`barcode`),
  KEY `ix_archived_batches_batch_id` (`batch_id`),
  CONSTRAINT `archived_batches_chk_1` CHECK (((`quantity` > 0) or ((`is_second_degree` = 1) and (`quantity` = 0))))
) ENGINE=InnoDB AUTO_INCREMENT=4251 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `archived_job_order_items`
--

DROP TABLE IF EXISTS `archived_job_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `archived_job_order_items` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `job_order_id` int NOT NULL,
  `color_id` int NOT NULL,
  `size_id` int NOT NULL,
  `quantity` int NOT NULL,
  `weight` decimal(10,2) DEFAULT NULL,
  `notes` varchar(1000) DEFAULT NULL,
  `archived_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`item_id`),
  KEY `ix_archived_job_order_items_item_id` (`item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `archived_job_orders`
--

DROP TABLE IF EXISTS `archived_job_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `archived_job_orders` (
  `job_order_id` int NOT NULL AUTO_INCREMENT,
  `model_id` int NOT NULL,
  `job_order_number` varchar(100) NOT NULL,
  `brand_id` int DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `notes` varchar(1000) DEFAULT NULL,
  `date_created` datetime NOT NULL,
  `archived_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`job_order_id`),
  UNIQUE KEY `ix_archived_job_orders_job_order_number` (`job_order_number`),
  KEY `ix_archived_job_orders_job_order_id` (`job_order_id`)
) ENGINE=InnoDB AUTO_INCREMENT=157 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `barcode_scan_events`
--

DROP TABLE IF EXISTS `barcode_scan_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `barcode_scan_events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `batch_id` int unsigned NOT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Type of scan action: scan_in, scan_out, quantity_update, status_change, phase_change',
  `phase_id` int NOT NULL,
  `old_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Previous status before the action',
  `new_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'New status after the action',
  `old_quantity` int unsigned DEFAULT NULL,
  `new_quantity` int unsigned DEFAULT NULL,
  `old_phase` int DEFAULT NULL COMMENT 'Previous phase before the action',
  `new_phase` int DEFAULT NULL COMMENT 'New phase after the action',
  `scanned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the scan event occurred',
  `user_id` int unsigned DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_scan_events_batch_id` (`batch_id`),
  KEY `idx_scan_events_action_type` (`action_type`),
  KEY `idx_scan_events_scanned_at` (`scanned_at`),
  KEY `idx_scan_events_batch_action` (`batch_id`,`action_type`,`scanned_at`),
  KEY `idx_scan_events_phase_time` (`phase_id`,`scanned_at`),
  KEY `idx_scan_events_user_time` (`user_id`,`scanned_at`),
  CONSTRAINT `barcode_scan_events_ibfk_1` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`batch_id`) ON DELETE CASCADE,
  CONSTRAINT `barcode_scan_events_ibfk_2` FOREIGN KEY (`phase_id`) REFERENCES `production_phases` (`phase_id`) ON DELETE RESTRICT,
  CONSTRAINT `barcode_scan_events_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=416 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `batches`
--

DROP TABLE IF EXISTS `batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `batches` (
  `batch_id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_order_id` int unsigned DEFAULT NULL,
  `barcode` varchar(100) NOT NULL,
  `size_id` int unsigned NOT NULL,
  `color_id` int unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  `layers` int unsigned NOT NULL,
  `serial` varchar(3) NOT NULL,
  `current_phase` int NOT NULL,
  `status` enum('Pending','In Progress','Completed') NOT NULL DEFAULT 'Pending',
  `last_updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_second_degree` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`batch_id`),
  UNIQUE KEY `barcode` (`barcode`),
  KEY `size_id` (`size_id`),
  KEY `color_id` (`color_id`),
  KEY `current_phase` (`current_phase`),
  KEY `idx_batches_barcode` (`barcode`),
  KEY `idx_batches_status_phase` (`status`,`current_phase`),
  KEY `idx_batches_updated_at` (`last_updated_at`),
  KEY `idx_batches_job_order` (`job_order_id`),
  CONSTRAINT `batches_ibfk_3` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`size_id`) ON DELETE RESTRICT,
  CONSTRAINT `batches_ibfk_4` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE RESTRICT,
  CONSTRAINT `batches_ibfk_job_order` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE SET NULL,
  CONSTRAINT `batches_chk_1` CHECK (((`quantity` > 0) or ((`is_second_degree` = 1) and (`quantity` = 0)))),
  CONSTRAINT `batches_chk_2` CHECK ((`layers` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=4350 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `brands`
--

DROP TABLE IF EXISTS `brands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `brands` (
  `brand_id` int unsigned NOT NULL AUTO_INCREMENT,
  `brand_name` varchar(100) NOT NULL,
  PRIMARY KEY (`brand_id`),
  UNIQUE KEY `brand_name` (`brand_name`)
) ENGINE=InnoDB AUTO_INCREMENT=2686 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `colors`
--

DROP TABLE IF EXISTS `colors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `colors` (
  `color_id` int unsigned NOT NULL AUTO_INCREMENT,
  `color_name` varchar(50) NOT NULL,
  PRIMARY KEY (`color_id`),
  UNIQUE KEY `color_name` (`color_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4488 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `high_second_degree_job_orders_from_items`
--

DROP TABLE IF EXISTS `high_second_degree_job_orders_from_items`;
/*!50001 DROP VIEW IF EXISTS `high_second_degree_job_orders_from_items`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `high_second_degree_job_orders_from_items` AS SELECT 
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `total_second_degree_quantity`,
 1 AS `total_produced_quantity`,
 1 AS `total_expected_quantity`,
 1 AS `second_degree_percentage`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `job_order_items`
--

DROP TABLE IF EXISTS `job_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_order_items` (
  `item_id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_order_id` int unsigned NOT NULL,
  `color_id` int unsigned NOT NULL,
  `size_id` int unsigned NOT NULL,
  `quantity` int unsigned NOT NULL,
  `weight` decimal(10,2) DEFAULT NULL,
  `notes` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`item_id`),
  UNIQUE KEY `job_order_color_size_unique` (`job_order_id`,`color_id`,`size_id`),
  KEY `job_order_id` (`job_order_id`),
  KEY `color_id` (`color_id`),
  KEY `size_id` (`size_id`),
  KEY `quantity` (`quantity`),
  KEY `idx_job_order_items_job_order` (`job_order_id`),
  KEY `idx_job_order_items_color` (`color_id`),
  KEY `idx_job_order_items_size` (`size_id`),
  KEY `idx_job_order_items_color_size` (`color_id`,`size_id`),
  CONSTRAINT `job_order_items_ibfk_1` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE,
  CONSTRAINT `job_order_items_ibfk_2` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE RESTRICT,
  CONSTRAINT `job_order_items_ibfk_3` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`size_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=635 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `job_order_items_high_second_degree`
--

DROP TABLE IF EXISTS `job_order_items_high_second_degree`;
/*!50001 DROP VIEW IF EXISTS `job_order_items_high_second_degree`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_order_items_high_second_degree` AS SELECT 
 1 AS `item_id`,
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `color_name`,
 1 AS `size_value`,
 1 AS `produced_quantity`,
 1 AS `second_degree_quantity`,
 1 AS `second_degree_percentage`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `job_order_items_production_tracking`
--

DROP TABLE IF EXISTS `job_order_items_production_tracking`;
/*!50001 DROP VIEW IF EXISTS `job_order_items_production_tracking`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_order_items_production_tracking` AS SELECT 
 1 AS `item_id`,
 1 AS `job_order_id`,
 1 AS `color_id`,
 1 AS `size_id`,
 1 AS `color_name`,
 1 AS `size_value`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `expected_quantity`,
 1 AS `produced_quantity`,
 1 AS `cut_quantity`,
 1 AS `second_degree_quantity`,
 1 AS `completed_quantity`,
 1 AS `working_quantity`,
 1 AS `remaining_quantity`,
 1 AS `production_status`,
 1 AS `completion_percentage`,
 1 AS `has_issues`,
 1 AS `overproduction_quantity`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `job_order_items_quantity_breakdown`
--

DROP TABLE IF EXISTS `job_order_items_quantity_breakdown`;
/*!50001 DROP VIEW IF EXISTS `job_order_items_quantity_breakdown`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_order_items_quantity_breakdown` AS SELECT 
 1 AS `item_id`,
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `color_name`,
 1 AS `size_value`,
 1 AS `expected_quantity`,
 1 AS `produced_quantity`,
 1 AS `cut_quantity`,
 1 AS `second_degree_quantity`,
 1 AS `first_degree_quantity`,
 1 AS `cut_vs_produced_difference`,
 1 AS `second_degree_percentage`,
 1 AS `completion_percentage`,
 1 AS `has_issues`,
 1 AS `production_status`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `job_order_items_summary`
--

DROP TABLE IF EXISTS `job_order_items_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_order_items_summary` (
  `item_id` int unsigned NOT NULL,
  `job_order_id` int unsigned NOT NULL,
  `color_id` int unsigned NOT NULL,
  `size_id` int unsigned NOT NULL,
  `color_name` varchar(50) DEFAULT NULL,
  `size_value` varchar(20) DEFAULT NULL,
  `expected_quantity` int DEFAULT '0',
  `produced_quantity` int DEFAULT '0',
  `cut_quantity` int DEFAULT '0',
  `second_degree_quantity` int DEFAULT '0',
  `completed_quantity` int DEFAULT '0',
  `working_quantity` int DEFAULT '0',
  `remaining_quantity` int DEFAULT '0',
  `total_batches` int DEFAULT '0',
  `has_issues` tinyint(1) DEFAULT '0',
  `completion_percentage` decimal(5,2) DEFAULT '0.00',
  `overproduction_quantity` int DEFAULT '0',
  `production_status` enum('Not Started','In Progress','Completed') DEFAULT 'Not Started',
  `last_calculated_at` timestamp NULL DEFAULT NULL,
  `last_quantity_change` timestamp NULL DEFAULT NULL,
  `last_completion_change` timestamp NULL DEFAULT NULL,
  `last_new_batch` timestamp NULL DEFAULT NULL,
  `last_batch_update` timestamp NULL DEFAULT NULL,
  `notes` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`item_id`),
  KEY `idx_job_order_id` (`job_order_id`),
  KEY `idx_color_size` (`color_id`,`size_id`),
  KEY `idx_has_issues` (`has_issues`),
  KEY `idx_production_status` (`production_status`),
  KEY `idx_completion_percentage` (`completion_percentage`),
  KEY `idx_cut_quantity` (`cut_quantity`),
  KEY `idx_second_degree_quantity` (`second_degree_quantity`),
  KEY `idx_last_updated` (`last_batch_update`),
  KEY `size_id` (`size_id`),
  CONSTRAINT `job_order_items_summary_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `job_order_items` (`item_id`) ON DELETE CASCADE,
  CONSTRAINT `job_order_items_summary_ibfk_2` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE,
  CONSTRAINT `job_order_items_summary_ibfk_3` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE RESTRICT,
  CONSTRAINT `job_order_items_summary_ibfk_4` FOREIGN KEY (`size_id`) REFERENCES `sizes` (`size_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `job_order_items_with_details`
--

DROP TABLE IF EXISTS `job_order_items_with_details`;
/*!50001 DROP VIEW IF EXISTS `job_order_items_with_details`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_order_items_with_details` AS SELECT 
 1 AS `item_id`,
 1 AS `job_order_id`,
 1 AS `color_id`,
 1 AS `size_id`,
 1 AS `quantity`,
 1 AS `color_name`,
 1 AS `size_value`,
 1 AS `job_order_number`,
 1 AS `model_name`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `job_order_items_with_issues`
--

DROP TABLE IF EXISTS `job_order_items_with_issues`;
/*!50001 DROP VIEW IF EXISTS `job_order_items_with_issues`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_order_items_with_issues` AS SELECT 
 1 AS `item_id`,
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `color_name`,
 1 AS `size_value`,
 1 AS `expected_quantity`,
 1 AS `produced_quantity`,
 1 AS `overproduction_quantity`,
 1 AS `completion_percentage`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `job_order_items_with_quantity_reductions`
--

DROP TABLE IF EXISTS `job_order_items_with_quantity_reductions`;
/*!50001 DROP VIEW IF EXISTS `job_order_items_with_quantity_reductions`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_order_items_with_quantity_reductions` AS SELECT 
 1 AS `item_id`,
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `color_name`,
 1 AS `size_value`,
 1 AS `produced_quantity`,
 1 AS `cut_quantity`,
 1 AS `quantity_reduction`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `job_order_materials`
--

DROP TABLE IF EXISTS `job_order_materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_order_materials` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_order_id` int unsigned NOT NULL,
  `material_id` int unsigned NOT NULL,
  `color_id` int unsigned DEFAULT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `consumption` decimal(10,3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_material` (`job_order_id`,`material_id`,`color_id`),
  KEY `idx_job_order` (`job_order_id`),
  KEY `idx_material` (`material_id`),
  KEY `idx_color` (`color_id`),
  CONSTRAINT `fk_job_material_color` FOREIGN KEY (`color_id`) REFERENCES `colors` (`color_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_job_material_job_order` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_job_material_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`material_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=152 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_order_prints`
--

DROP TABLE IF EXISTS `job_order_prints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_order_prints` (
  `job_order_id` int unsigned NOT NULL,
  `chest` tinyint(1) NOT NULL DEFAULT '0',
  `back` tinyint(1) NOT NULL DEFAULT '0',
  `waist` tinyint(1) NOT NULL DEFAULT '0',
  `right_leg` tinyint(1) NOT NULL DEFAULT '0',
  `left_leg` tinyint(1) NOT NULL DEFAULT '0',
  `pocket` tinyint(1) NOT NULL DEFAULT '0',
  `hood` tinyint(1) NOT NULL DEFAULT '0',
  `right_arm` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ذراع يمين',
  `left_arm` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ذراع يسار',
  PRIMARY KEY (`job_order_id`),
  CONSTRAINT `fk_job_prints_job_order` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders` (`job_order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `job_order_production_tracking`
--

DROP TABLE IF EXISTS `job_order_production_tracking`;
/*!50001 DROP VIEW IF EXISTS `job_order_production_tracking`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_order_production_tracking` AS SELECT 
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `color_id`,
 1 AS `size_id`,
 1 AS `color_name`,
 1 AS `size_value`,
 1 AS `expected_quantity`,
 1 AS `produced_quantity`,
 1 AS `remaining_quantity`,
 1 AS `production_status`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `job_orders`
--

DROP TABLE IF EXISTS `job_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_orders` (
  `job_order_id` int unsigned NOT NULL AUTO_INCREMENT,
  `model_id` int unsigned NOT NULL,
  `job_order_number` varchar(100) NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `notes` text,
  `date_created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `brand_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`job_order_id`),
  UNIQUE KEY `job_order_number` (`job_order_number`),
  KEY `model_id` (`model_id`),
  KEY `fk_job_orders_brand` (`brand_id`),
  CONSTRAINT `fk_job_orders_brand` FOREIGN KEY (`brand_id`) REFERENCES `brands` (`brand_id`),
  CONSTRAINT `job_orders_ibfk_1` FOREIGN KEY (`model_id`) REFERENCES `models` (`model_id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=174 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_orders_summary`
--

DROP TABLE IF EXISTS `job_orders_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_orders_summary` (
  `job_order_id` int NOT NULL AUTO_INCREMENT,
  `job_order_number` varchar(255) NOT NULL,
  `model_name` varchar(255) DEFAULT NULL,
  `brand_name` varchar(255) DEFAULT NULL,
  `total_items` int DEFAULT NULL,
  `total_expected_quantity` int DEFAULT NULL,
  `total_produced_quantity` int DEFAULT NULL,
  `cut_quantity` int DEFAULT NULL,
  `second_degree_quantity` int DEFAULT NULL,
  `total_batches` int DEFAULT NULL,
  `has_issues` tinyint(1) DEFAULT NULL,
  `completion_percentage` decimal(5,2) DEFAULT NULL,
  `overproduction_quantity` int DEFAULT NULL,
  `last_calculated_at` timestamp NULL DEFAULT NULL,
  `last_quantity_change` timestamp NULL DEFAULT NULL,
  `last_completion_change` timestamp NULL DEFAULT NULL,
  `last_new_batch` timestamp NULL DEFAULT NULL,
  `last_batch_update` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`job_order_id`),
  KEY `ix_job_orders_summary_job_order_id` (`job_order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `job_orders_summary_from_items`
--

DROP TABLE IF EXISTS `job_orders_summary_from_items`;
/*!50001 DROP VIEW IF EXISTS `job_orders_summary_from_items`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_orders_summary_from_items` AS SELECT 
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `image_url`,
 1 AS `notes`,
 1 AS `date_created`,
 1 AS `total_items`,
 1 AS `total_expected_quantity`,
 1 AS `total_produced_quantity`,
 1 AS `total_cut_quantity`,
 1 AS `total_second_degree_quantity`,
 1 AS `total_completed_quantity`,
 1 AS `total_working_quantity`,
 1 AS `total_remaining_quantity`,
 1 AS `total_batches`,
 1 AS `has_issues`,
 1 AS `completion_percentage`,
 1 AS `overproduction_quantity`,
 1 AS `overall_status`,
 1 AS `last_calculated_at`,
 1 AS `last_quantity_change`,
 1 AS `last_completion_change`,
 1 AS `last_new_batch`,
 1 AS `last_batch_update`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `job_orders_with_model`
--

DROP TABLE IF EXISTS `job_orders_with_model`;
/*!50001 DROP VIEW IF EXISTS `job_orders_with_model`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_orders_with_model` AS SELECT 
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_id`,
 1 AS `model_name`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `job_orders_with_quantity_reductions_from_items`
--

DROP TABLE IF EXISTS `job_orders_with_quantity_reductions_from_items`;
/*!50001 DROP VIEW IF EXISTS `job_orders_with_quantity_reductions_from_items`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `job_orders_with_quantity_reductions_from_items` AS SELECT 
 1 AS `job_order_id`,
 1 AS `job_order_number`,
 1 AS `model_name`,
 1 AS `brand_name`,
 1 AS `total_cut_quantity`,
 1 AS `total_produced_quantity`,
 1 AS `total_expected_quantity`,
 1 AS `quantity_reduction`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `materials`
--

DROP TABLE IF EXISTS `materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `materials` (
  `material_id` int unsigned NOT NULL AUTO_INCREMENT,
  `material_name` varchar(100) NOT NULL,
  PRIMARY KEY (`material_id`),
  UNIQUE KEY `material_name` (`material_name`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `models`
--

DROP TABLE IF EXISTS `models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `models` (
  `model_id` int unsigned NOT NULL AUTO_INCREMENT,
  `model_name` varchar(100) NOT NULL,
  PRIMARY KEY (`model_id`),
  UNIQUE KEY `model_name` (`model_name`)
) ENGINE=InnoDB AUTO_INCREMENT=4799 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `production_phases`
--

DROP TABLE IF EXISTS `production_phases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `production_phases` (
  `phase_id` int NOT NULL AUTO_INCREMENT,
  `phase_name` varchar(100) NOT NULL,
  `phase_type` varchar(50) NOT NULL,
  PRIMARY KEY (`phase_id`),
  UNIQUE KEY `phase_name` (`phase_name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `report_history`
--

DROP TABLE IF EXISTS `report_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_history` (
  `report_id` int NOT NULL AUTO_INCREMENT,
  `report_type` varchar(50) NOT NULL,
  `report_date` datetime NOT NULL,
  `status` varchar(20) NOT NULL,
  `recipients` text,
  `file_path` varchar(500) DEFAULT NULL,
  `error_message` text,
  `created_at` datetime DEFAULT (now()),
  PRIMARY KEY (`report_id`),
  KEY `ix_report_history_report_id` (`report_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `report_schedules`
--

DROP TABLE IF EXISTS `report_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_schedules` (
  `schedule_id` int NOT NULL AUTO_INCREMENT,
  `report_type` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `schedule_time` varchar(10) NOT NULL,
  `days_of_week` varchar(20) NOT NULL,
  `recipients` text NOT NULL,
  `created_at` datetime DEFAULT (now()),
  `updated_at` datetime DEFAULT (now()),
  PRIMARY KEY (`schedule_id`),
  KEY `ix_report_schedules_schedule_id` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sizes`
--

DROP TABLE IF EXISTS `sizes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sizes` (
  `size_id` int unsigned NOT NULL AUTO_INCREMENT,
  `size_value` varchar(20) NOT NULL,
  PRIMARY KEY (`size_id`),
  UNIQUE KEY `size_value` (`size_value`)
) ENGINE=InnoDB AUTO_INCREMENT=4794 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('Admin','Cutting','Sewing','Packaging','Creator') NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Final view structure for view `high_second_degree_job_orders_from_items`
--

/*!50001 DROP VIEW IF EXISTS `high_second_degree_job_orders_from_items`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `high_second_degree_job_orders_from_items` AS select `jo`.`job_order_id` AS `job_order_id`,`jo`.`job_order_number` AS `job_order_number`,`m`.`model_name` AS `model_name`,`b`.`brand_name` AS `brand_name`,sum(`jois`.`second_degree_quantity`) AS `total_second_degree_quantity`,sum(`jois`.`produced_quantity`) AS `total_produced_quantity`,sum(`jois`.`expected_quantity`) AS `total_expected_quantity`,round(((100 * sum(`jois`.`second_degree_quantity`)) / nullif(sum(`jois`.`produced_quantity`),0)),2) AS `second_degree_percentage` from (((`job_orders` `jo` left join `models` `m` on((`jo`.`model_id` = `m`.`model_id`))) left join `brands` `b` on((`jo`.`brand_id` = `b`.`brand_id`))) left join `job_order_items_summary` `jois` on((`jo`.`job_order_id` = `jois`.`job_order_id`))) where (`jois`.`second_degree_quantity` > 0) group by `jo`.`job_order_id`,`jo`.`job_order_number`,`m`.`model_name`,`b`.`brand_name` having (sum(`jois`.`second_degree_quantity`) > (sum(`jois`.`produced_quantity`) * 0.1)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_order_items_high_second_degree`
--

/*!50001 DROP VIEW IF EXISTS `job_order_items_high_second_degree`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_order_items_high_second_degree` AS select `job_order_items_production_tracking`.`item_id` AS `item_id`,`job_order_items_production_tracking`.`job_order_id` AS `job_order_id`,`job_order_items_production_tracking`.`job_order_number` AS `job_order_number`,`job_order_items_production_tracking`.`model_name` AS `model_name`,`job_order_items_production_tracking`.`brand_name` AS `brand_name`,`job_order_items_production_tracking`.`color_name` AS `color_name`,`job_order_items_production_tracking`.`size_value` AS `size_value`,`job_order_items_production_tracking`.`produced_quantity` AS `produced_quantity`,`job_order_items_production_tracking`.`second_degree_quantity` AS `second_degree_quantity`,round(((`job_order_items_production_tracking`.`second_degree_quantity` / `job_order_items_production_tracking`.`produced_quantity`) * 100),2) AS `second_degree_percentage` from `job_order_items_production_tracking` where ((`job_order_items_production_tracking`.`second_degree_quantity` > 0) and ((`job_order_items_production_tracking`.`second_degree_quantity` / `job_order_items_production_tracking`.`produced_quantity`) > 0.1)) order by round(((`job_order_items_production_tracking`.`second_degree_quantity` / `job_order_items_production_tracking`.`produced_quantity`) * 100),2) desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_order_items_production_tracking`
--

/*!50001 DROP VIEW IF EXISTS `job_order_items_production_tracking`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_order_items_production_tracking` AS select `jois`.`item_id` AS `item_id`,`jois`.`job_order_id` AS `job_order_id`,`jois`.`color_id` AS `color_id`,`jois`.`size_id` AS `size_id`,`jois`.`color_name` AS `color_name`,`jois`.`size_value` AS `size_value`,`jo`.`job_order_number` AS `job_order_number`,`m`.`model_name` AS `model_name`,`b`.`brand_name` AS `brand_name`,`jois`.`expected_quantity` AS `expected_quantity`,`jois`.`produced_quantity` AS `produced_quantity`,`jois`.`cut_quantity` AS `cut_quantity`,`jois`.`second_degree_quantity` AS `second_degree_quantity`,`jois`.`completed_quantity` AS `completed_quantity`,`jois`.`working_quantity` AS `working_quantity`,`jois`.`remaining_quantity` AS `remaining_quantity`,`jois`.`production_status` AS `production_status`,`jois`.`completion_percentage` AS `completion_percentage`,`jois`.`has_issues` AS `has_issues`,`jois`.`overproduction_quantity` AS `overproduction_quantity` from (((`job_order_items_summary` `jois` join `job_orders` `jo` on((`jois`.`job_order_id` = `jo`.`job_order_id`))) join `models` `m` on((`jo`.`model_id` = `m`.`model_id`))) left join `brands` `b` on((`jo`.`brand_id` = `b`.`brand_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_order_items_quantity_breakdown`
--

/*!50001 DROP VIEW IF EXISTS `job_order_items_quantity_breakdown`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_order_items_quantity_breakdown` AS select `job_order_items_production_tracking`.`item_id` AS `item_id`,`job_order_items_production_tracking`.`job_order_id` AS `job_order_id`,`job_order_items_production_tracking`.`job_order_number` AS `job_order_number`,`job_order_items_production_tracking`.`model_name` AS `model_name`,`job_order_items_production_tracking`.`brand_name` AS `brand_name`,`job_order_items_production_tracking`.`color_name` AS `color_name`,`job_order_items_production_tracking`.`size_value` AS `size_value`,`job_order_items_production_tracking`.`expected_quantity` AS `expected_quantity`,`job_order_items_production_tracking`.`produced_quantity` AS `produced_quantity`,`job_order_items_production_tracking`.`cut_quantity` AS `cut_quantity`,`job_order_items_production_tracking`.`second_degree_quantity` AS `second_degree_quantity`,(`job_order_items_production_tracking`.`produced_quantity` - `job_order_items_production_tracking`.`second_degree_quantity`) AS `first_degree_quantity`,(`job_order_items_production_tracking`.`cut_quantity` - `job_order_items_production_tracking`.`produced_quantity`) AS `cut_vs_produced_difference`,round(((`job_order_items_production_tracking`.`second_degree_quantity` / `job_order_items_production_tracking`.`produced_quantity`) * 100),2) AS `second_degree_percentage`,`job_order_items_production_tracking`.`completion_percentage` AS `completion_percentage`,`job_order_items_production_tracking`.`has_issues` AS `has_issues`,`job_order_items_production_tracking`.`production_status` AS `production_status` from `job_order_items_production_tracking` where (`job_order_items_production_tracking`.`produced_quantity` > 0) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_order_items_with_details`
--

/*!50001 DROP VIEW IF EXISTS `job_order_items_with_details`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_order_items_with_details` AS select `joi`.`item_id` AS `item_id`,`joi`.`job_order_id` AS `job_order_id`,`joi`.`color_id` AS `color_id`,`joi`.`size_id` AS `size_id`,`joi`.`quantity` AS `quantity`,`c`.`color_name` AS `color_name`,`s`.`size_value` AS `size_value`,`jo`.`job_order_number` AS `job_order_number`,`m`.`model_name` AS `model_name` from ((((`job_order_items` `joi` join `colors` `c` on((`joi`.`color_id` = `c`.`color_id`))) join `sizes` `s` on((`joi`.`size_id` = `s`.`size_id`))) join `job_orders` `jo` on((`joi`.`job_order_id` = `jo`.`job_order_id`))) join `models` `m` on((`jo`.`model_id` = `m`.`model_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_order_items_with_issues`
--

/*!50001 DROP VIEW IF EXISTS `job_order_items_with_issues`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_order_items_with_issues` AS select `job_order_items_production_tracking`.`item_id` AS `item_id`,`job_order_items_production_tracking`.`job_order_id` AS `job_order_id`,`job_order_items_production_tracking`.`job_order_number` AS `job_order_number`,`job_order_items_production_tracking`.`model_name` AS `model_name`,`job_order_items_production_tracking`.`brand_name` AS `brand_name`,`job_order_items_production_tracking`.`color_name` AS `color_name`,`job_order_items_production_tracking`.`size_value` AS `size_value`,`job_order_items_production_tracking`.`expected_quantity` AS `expected_quantity`,`job_order_items_production_tracking`.`produced_quantity` AS `produced_quantity`,`job_order_items_production_tracking`.`overproduction_quantity` AS `overproduction_quantity`,`job_order_items_production_tracking`.`completion_percentage` AS `completion_percentage` from `job_order_items_production_tracking` where (`job_order_items_production_tracking`.`has_issues` = true) order by `job_order_items_production_tracking`.`overproduction_quantity` desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_order_items_with_quantity_reductions`
--

/*!50001 DROP VIEW IF EXISTS `job_order_items_with_quantity_reductions`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_order_items_with_quantity_reductions` AS select `job_order_items_production_tracking`.`item_id` AS `item_id`,`job_order_items_production_tracking`.`job_order_id` AS `job_order_id`,`job_order_items_production_tracking`.`job_order_number` AS `job_order_number`,`job_order_items_production_tracking`.`model_name` AS `model_name`,`job_order_items_production_tracking`.`brand_name` AS `brand_name`,`job_order_items_production_tracking`.`color_name` AS `color_name`,`job_order_items_production_tracking`.`size_value` AS `size_value`,`job_order_items_production_tracking`.`produced_quantity` AS `produced_quantity`,`job_order_items_production_tracking`.`cut_quantity` AS `cut_quantity`,(`job_order_items_production_tracking`.`cut_quantity` - `job_order_items_production_tracking`.`produced_quantity`) AS `quantity_reduction` from `job_order_items_production_tracking` where (`job_order_items_production_tracking`.`cut_quantity` > `job_order_items_production_tracking`.`produced_quantity`) order by (`job_order_items_production_tracking`.`cut_quantity` - `job_order_items_production_tracking`.`produced_quantity`) desc */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_order_production_tracking`
--

/*!50001 DROP VIEW IF EXISTS `job_order_production_tracking`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_order_production_tracking` AS select `jo`.`job_order_id` AS `job_order_id`,`jo`.`job_order_number` AS `job_order_number`,`m`.`model_name` AS `model_name`,`joi`.`color_id` AS `color_id`,`joi`.`size_id` AS `size_id`,`c`.`color_name` AS `color_name`,`s`.`size_value` AS `size_value`,`joi`.`quantity` AS `expected_quantity`,coalesce(sum(`b`.`quantity`),0) AS `produced_quantity`,(`joi`.`quantity` - coalesce(sum(`b`.`quantity`),0)) AS `remaining_quantity`,(case when (coalesce(sum(`b`.`quantity`),0) >= `joi`.`quantity`) then 'Completed' when (coalesce(sum(`b`.`quantity`),0) > 0) then 'In Progress' else 'Not Started' end) AS `production_status` from (((((`job_orders` `jo` join `models` `m` on((`jo`.`model_id` = `m`.`model_id`))) join `job_order_items` `joi` on((`jo`.`job_order_id` = `joi`.`job_order_id`))) join `colors` `c` on((`joi`.`color_id` = `c`.`color_id`))) join `sizes` `s` on((`joi`.`size_id` = `s`.`size_id`))) left join `batches` `b` on(((`jo`.`job_order_id` = `b`.`job_order_id`) and (`joi`.`color_id` = `b`.`color_id`) and (`joi`.`size_id` = `b`.`size_id`)))) group by `jo`.`job_order_id`,`jo`.`job_order_number`,`m`.`model_name`,`joi`.`color_id`,`joi`.`size_id`,`c`.`color_name`,`s`.`size_value`,`joi`.`quantity` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_orders_summary_from_items`
--

/*!50001 DROP VIEW IF EXISTS `job_orders_summary_from_items`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_orders_summary_from_items` AS select `jo`.`job_order_id` AS `job_order_id`,`jo`.`job_order_number` AS `job_order_number`,`m`.`model_name` AS `model_name`,`b`.`brand_name` AS `brand_name`,`jo`.`image_url` AS `image_url`,`jo`.`notes` AS `notes`,`jo`.`date_created` AS `date_created`,count(`jois`.`item_id`) AS `total_items`,sum(`jois`.`expected_quantity`) AS `total_expected_quantity`,sum(`jois`.`produced_quantity`) AS `total_produced_quantity`,sum(`jois`.`cut_quantity`) AS `total_cut_quantity`,sum(`jois`.`second_degree_quantity`) AS `total_second_degree_quantity`,sum(`jois`.`completed_quantity`) AS `total_completed_quantity`,sum(`jois`.`working_quantity`) AS `total_working_quantity`,sum(`jois`.`remaining_quantity`) AS `total_remaining_quantity`,sum(`jois`.`total_batches`) AS `total_batches`,(case when (sum(`jois`.`produced_quantity`) > sum(`jois`.`expected_quantity`)) then true else false end) AS `has_issues`,(case when (sum(`jois`.`expected_quantity`) = 0) then 0 else round(((100 * sum(`jois`.`produced_quantity`)) / sum(`jois`.`expected_quantity`)),2) end) AS `completion_percentage`,greatest(0,(sum(`jois`.`produced_quantity`) - sum(`jois`.`expected_quantity`))) AS `overproduction_quantity`,(case when (count((case when (`jois`.`production_status` = 'Completed') then 1 end)) = count(0)) then 'Completed' when (count((case when (`jois`.`production_status` in ('In Progress','Completed')) then 1 end)) > 0) then 'In Progress' else 'Not Started' end) AS `overall_status`,max(`jois`.`last_calculated_at`) AS `last_calculated_at`,max(`jois`.`last_quantity_change`) AS `last_quantity_change`,max(`jois`.`last_completion_change`) AS `last_completion_change`,max(`jois`.`last_new_batch`) AS `last_new_batch`,max(`jois`.`last_batch_update`) AS `last_batch_update` from (((`job_orders` `jo` left join `models` `m` on((`jo`.`model_id` = `m`.`model_id`))) left join `brands` `b` on((`jo`.`brand_id` = `b`.`brand_id`))) left join `job_order_items_summary` `jois` on((`jo`.`job_order_id` = `jois`.`job_order_id`))) group by `jo`.`job_order_id`,`jo`.`job_order_number`,`m`.`model_name`,`b`.`brand_name`,`jo`.`image_url`,`jo`.`notes`,`jo`.`date_created` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_orders_with_model`
--

/*!50001 DROP VIEW IF EXISTS `job_orders_with_model`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_orders_with_model` AS select `jo`.`job_order_id` AS `job_order_id`,`jo`.`job_order_number` AS `job_order_number`,`m`.`model_id` AS `model_id`,`m`.`model_name` AS `model_name` from (`job_orders` `jo` join `models` `m` on((`jo`.`model_id` = `m`.`model_id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `job_orders_with_quantity_reductions_from_items`
--

/*!50001 DROP VIEW IF EXISTS `job_orders_with_quantity_reductions_from_items`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `job_orders_with_quantity_reductions_from_items` AS select `jo`.`job_order_id` AS `job_order_id`,`jo`.`job_order_number` AS `job_order_number`,`m`.`model_name` AS `model_name`,`b`.`brand_name` AS `brand_name`,sum(`jois`.`cut_quantity`) AS `total_cut_quantity`,sum(`jois`.`produced_quantity`) AS `total_produced_quantity`,sum(`jois`.`expected_quantity`) AS `total_expected_quantity`,(sum(`jois`.`cut_quantity`) - sum(`jois`.`produced_quantity`)) AS `quantity_reduction` from (((`job_orders` `jo` left join `models` `m` on((`jo`.`model_id` = `m`.`model_id`))) left join `brands` `b` on((`jo`.`brand_id` = `b`.`brand_id`))) left join `job_order_items_summary` `jois` on((`jo`.`job_order_id` = `jois`.`job_order_id`))) group by `jo`.`job_order_id`,`jo`.`job_order_number`,`m`.`model_name`,`b`.`brand_name` having (sum(`jois`.`cut_quantity`) > sum(`jois`.`produced_quantity`)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-21  9:34:50
