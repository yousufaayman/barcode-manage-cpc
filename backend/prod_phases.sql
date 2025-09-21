CREATE DATABASE  IF NOT EXISTS `barcode_management_v2` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `barcode_management_v2`;
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
-- Dumping data for table `production_phases`
--

LOCK TABLES `production_phases` WRITE;
/*!40000 ALTER TABLE `production_phases` DISABLE KEYS */;
INSERT INTO `production_phases` VALUES (1,'Cutting','Cutting'),(2,'Sewing - 1','Sewing'),(3,'Sewing - 2','Sewing'),(4,'Sewing - 3','Sewing'),(7,'Sewing - 4','Sewing'),(8,'Packaging','Packaging');
/*!40000 ALTER TABLE `production_phases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'barcode_management_v2'
--

--
-- Dumping routines for database 'barcode_management_v2'
--
/*!50003 DROP FUNCTION IF EXISTS `get_max_cut_quantity` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `get_max_cut_quantity`(job_order_id_param INT) RETURNS int
    READS SQL DATA
    DETERMINISTIC
BEGIN
    DECLARE max_cut_quantity INT DEFAULT 0;
    
    -- Get the maximum cut quantity ever recorded for this job order
    SELECT COALESCE(MAX(cut_quantity), 0) INTO max_cut_quantity
    FROM job_orders_summary 
    WHERE job_order_id = job_order_id_param;
    
    RETURN max_cut_quantity;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP FUNCTION IF EXISTS `get_second_degree_quantity` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` FUNCTION `get_second_degree_quantity`(job_order_id_param INT) RETURNS int
    READS SQL DATA
    DETERMINISTIC
BEGIN
    DECLARE second_degree_total INT DEFAULT 0;
    
    -- Get the total second degree quantity for this job order
    SELECT COALESCE(SUM(quantity), 0) INTO second_degree_total
    FROM batches 
    WHERE job_order_id = job_order_id_param AND is_second_degree = TRUE;
    
    RETURN second_degree_total;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `RefreshJobOrderItemsSummary` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `RefreshJobOrderItemsSummary`(IN p_job_order_id INT)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_item_id INT;
    DECLARE v_job_order_id INT;
    DECLARE v_color_id INT;
    DECLARE v_size_id INT;
    DECLARE v_expected_quantity INT;
    DECLARE v_color_name VARCHAR(50);
    DECLARE v_size_value VARCHAR(20);
    
    -- Cursor for job order items
    DECLARE item_cursor CURSOR FOR
        SELECT 
            joi.item_id,
            joi.job_order_id,
            joi.color_id,
            joi.size_id,
            joi.quantity as expected_quantity,
            c.color_name,
            s.size_value
        FROM job_order_items joi
        JOIN colors c ON joi.color_id = c.color_id
        JOIN sizes s ON joi.size_id = s.size_id
        WHERE (p_job_order_id IS NULL OR joi.job_order_id = p_job_order_id);
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- Open cursor
    OPEN item_cursor;
    
    -- Process each item
    read_loop: LOOP
        FETCH item_cursor INTO v_item_id, v_job_order_id, v_color_id, v_size_id, v_expected_quantity, v_color_name, v_size_value;
        
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        -- Calculate quantities for this specific item
        SET @produced_quantity = (
            SELECT COALESCE(SUM(b.quantity), 0)
            FROM batches b
            WHERE b.job_order_id = v_job_order_id
            AND b.color_id = v_color_id
            AND b.size_id = v_size_id
            AND b.quantity IS NOT NULL
        );
        
        -- Calculate cut quantity as the maximum quantity ever reached (non-decreasing)
        SET @cut_quantity = (
            SELECT COALESCE(MAX(b.quantity), 0)
            FROM batches b
            WHERE b.job_order_id = v_job_order_id
            AND b.color_id = v_color_id
            AND b.size_id = v_size_id
            AND b.quantity IS NOT NULL
        );
        
        SET @second_degree_quantity = (
            SELECT COALESCE(SUM(b.quantity), 0)
            FROM batches b
            WHERE b.job_order_id = v_job_order_id
            AND b.color_id = v_color_id
            AND b.size_id = v_size_id
            AND b.quantity IS NOT NULL
            AND b.is_second_degree = TRUE
        );
        
        SET @completed_quantity = (
            SELECT COALESCE(SUM(b.quantity), 0)
            FROM batches b
            WHERE b.job_order_id = v_job_order_id
            AND b.color_id = v_color_id
            AND b.size_id = v_size_id
            AND b.quantity IS NOT NULL
            AND b.status = 'Completed'
        );
        
        SET @total_batches = (
            SELECT COUNT(*)
            FROM batches b
            WHERE b.job_order_id = v_job_order_id
            AND b.color_id = v_color_id
            AND b.size_id = v_size_id
        );
        
        -- ORIGINAL CALCULATIONS (WORKING)
        SET @remaining_quantity = GREATEST(0, v_expected_quantity - @produced_quantity);
        SET @overproduction_quantity = GREATEST(0, @produced_quantity - v_expected_quantity);
        SET @completion_percentage = CASE WHEN v_expected_quantity > 0 THEN ROUND((@produced_quantity / v_expected_quantity) * 100, 2) ELSE 0 END;
        
        -- Determine production status
        SET @production_status = CASE 
            WHEN @produced_quantity >= v_expected_quantity THEN 'Completed'
            WHEN @produced_quantity > 0 THEN 'In Progress'
            ELSE 'Not Started'
        END;
        
        -- ORIGINAL has_issues calculation
        SET @has_issues = @produced_quantity > v_expected_quantity;
        
        -- Insert or update the summary
        INSERT INTO job_order_items_summary (
            item_id, job_order_id, color_id, size_id, color_name, size_value,
            expected_quantity, produced_quantity, cut_quantity, second_degree_quantity,
            completed_quantity, working_quantity, remaining_quantity, total_batches,
            has_issues, completion_percentage, overproduction_quantity, production_status,
            last_calculated_at
        ) VALUES (
            v_item_id, v_job_order_id, v_color_id, v_size_id, v_color_name, v_size_value,
            v_expected_quantity, @produced_quantity, @cut_quantity, @second_degree_quantity,
            @completed_quantity, @produced_quantity, @remaining_quantity, @total_batches,
            @has_issues, @completion_percentage, @overproduction_quantity, @production_status,
            CURRENT_TIMESTAMP
        ) ON DUPLICATE KEY UPDATE
            expected_quantity = v_expected_quantity,
            produced_quantity = @produced_quantity,
            cut_quantity = @cut_quantity,
            second_degree_quantity = @second_degree_quantity,
            completed_quantity = @completed_quantity,
            working_quantity = @produced_quantity,
            remaining_quantity = @remaining_quantity,
            total_batches = @total_batches,
            has_issues = @has_issues,
            completion_percentage = @completion_percentage,
            overproduction_quantity = @overproduction_quantity,
            production_status = @production_status,
            last_calculated_at = CURRENT_TIMESTAMP;
        
    END LOOP;
    
    -- Close cursor
    CLOSE item_cursor;
    
    SELECT 'Job order items summary refreshed successfully - ORIGINAL WORKING VERSION' as message;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `refresh_job_orders_summary_complete` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `refresh_job_orders_summary_complete`()
BEGIN
    -- Create a temporary table to store current cut quantities before refresh
    CREATE TEMPORARY TABLE temp_cut_quantities AS
    SELECT job_order_id, cut_quantity
    FROM job_orders_summary;
    
    -- Update the summary table with current batch totals, but preserve existing cut quantities
    REPLACE INTO job_orders_summary (
        job_order_id,
        job_order_number,
        model_name,
        brand_name,
        total_items,
        total_expected_quantity,
        total_produced_quantity,
        cut_quantity,
        second_degree_quantity,
        total_batches,
        has_issues,
        completion_percentage,
        overproduction_quantity,
        last_calculated_at,
        last_batch_update
    )
    SELECT
        jo.job_order_id,
        jo.job_order_number,
        m.model_name,
        b.brand_name,
        COALESCE(items.total_items, 0) AS total_items,
        COALESCE(items.total_expected_quantity, 0) AS total_expected_quantity,
        COALESCE(batches.total_produced_quantity, 0) AS total_produced_quantity,
        -- Preserve existing cut quantity or use new total if higher (non-decreasing logic)
        GREATEST(
            COALESCE(temp.cut_quantity, 0),  -- Existing cut quantity
            COALESCE(batches.total_produced_quantity, 0)  -- New total produced quantity
        ) AS cut_quantity,
        COALESCE(batches.second_degree_quantity, 0) AS second_degree_quantity,
        COALESCE(batches.total_batches, 0) AS total_batches,
        CASE
            WHEN COALESCE(batches.total_produced_quantity, 0) > COALESCE(items.total_expected_quantity, 0) THEN TRUE
            ELSE FALSE
        END AS has_issues,
        CASE
            WHEN COALESCE(batches.total_batches, 0) = 0 THEN 0
            ELSE ROUND(100 * COALESCE(batches.completed_batches, 0) / batches.total_batches, 2)
        END AS completion_percentage,
        GREATEST(0, COALESCE(batches.total_produced_quantity, 0) - COALESCE(items.total_expected_quantity, 0)) AS overproduction_quantity,
        CURRENT_TIMESTAMP AS last_calculated_at,
        batches.last_batch_update
    FROM job_orders jo
    LEFT JOIN models m ON jo.model_id = m.model_id
    LEFT JOIN brands b ON jo.brand_id = b.brand_id
    LEFT JOIN (
        SELECT job_order_id, COUNT(*) AS total_items, SUM(quantity) AS total_expected_quantity
        FROM job_order_items
        GROUP BY job_order_id
    ) items ON jo.job_order_id = items.job_order_id
    LEFT JOIN (
        SELECT
            job_order_id,
            SUM(quantity) AS total_produced_quantity,
            SUM(CASE WHEN is_second_degree = TRUE THEN quantity ELSE 0 END) AS second_degree_quantity,
            COUNT(*) AS total_batches,
            SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_batches,
            MAX(last_updated_at) AS last_batch_update
        FROM batches
        GROUP BY job_order_id
    ) batches ON jo.job_order_id = batches.job_order_id
    LEFT JOIN temp_cut_quantities temp ON jo.job_order_id = temp.job_order_id;
    
    -- Clean up temporary table
    DROP TEMPORARY TABLE IF EXISTS temp_cut_quantities;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `refresh_job_order_items_summary` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `refresh_job_order_items_summary`()
BEGIN
            -- Create a temporary table to store current cut quantities before refresh
            CREATE TEMPORARY TABLE temp_item_cut_quantities AS
            SELECT item_id, cut_quantity
            FROM job_order_items_summary;
            
            -- Update the summary table with current batch totals, but preserve existing cut quantities
            REPLACE INTO job_order_items_summary (
                item_id,
                job_order_id,
                color_id,
                size_id,
                color_name,
                size_value,
                expected_quantity,
                produced_quantity,
                cut_quantity,
                second_degree_quantity,
                completed_quantity,
                working_quantity,
                remaining_quantity,
                total_batches,
                has_issues,
                completion_percentage,
                overproduction_quantity,
                production_status,
                notes,
                last_calculated_at
            )
            SELECT 
                joi.item_id,
                joi.job_order_id,
                joi.color_id,
                joi.size_id,
                c.color_name,
                s.size_value,
                joi.quantity as expected_quantity,
                COALESCE(batches.total_produced_quantity, 0) as produced_quantity,
                -- Preserve existing cut quantity or use new total if higher (non-decreasing logic)
                GREATEST(
                    COALESCE(temp.cut_quantity, 0),  -- Existing cut quantity
                    COALESCE(batches.total_produced_quantity, 0)  -- New total produced quantity
                ) AS cut_quantity,
                COALESCE(batches.second_degree_quantity, 0) as second_degree_quantity,
                COALESCE(batches.completed_quantity, 0) as completed_quantity,
                COALESCE(batches.total_produced_quantity, 0) as working_quantity,
                GREATEST(0, joi.quantity - COALESCE(batches.total_produced_quantity, 0)) as remaining_quantity,
                COALESCE(batches.total_batches, 0) as total_batches,
                -- Updated issue detection to include notes
                CASE
                    WHEN COALESCE(batches.total_produced_quantity, 0) > joi.quantity THEN TRUE
                    WHEN joi.notes IS NOT NULL AND joi.notes != '' THEN TRUE
                    ELSE FALSE
                END as has_issues,
                CASE
                    WHEN joi.quantity > 0 THEN ROUND((COALESCE(batches.total_produced_quantity, 0) / joi.quantity) * 100, 2)
                    ELSE 0
                END as completion_percentage,
                GREATEST(0, COALESCE(batches.total_produced_quantity, 0) - joi.quantity) as overproduction_quantity,
                CASE 
                    WHEN COALESCE(batches.total_produced_quantity, 0) >= joi.quantity THEN 'Completed'
                    WHEN COALESCE(batches.total_produced_quantity, 0) > 0 THEN 'In Progress'
                    ELSE 'Not Started'
                END as production_status,
                joi.notes as notes,
                CURRENT_TIMESTAMP as last_calculated_at
            FROM job_order_items joi
            JOIN colors c ON joi.color_id = c.color_id
            JOIN sizes s ON joi.size_id = s.size_id
            LEFT JOIN (
                SELECT
                    job_order_id,
                    color_id,
                    size_id,
                    SUM(quantity) AS total_produced_quantity,
                    SUM(CASE WHEN is_second_degree = TRUE THEN quantity ELSE 0 END) AS second_degree_quantity,
                    SUM(CASE WHEN status = 'Completed' THEN quantity ELSE 0 END) AS completed_quantity,
                    COUNT(*) AS total_batches
                FROM batches
                GROUP BY job_order_id, color_id, size_id
            ) batches ON joi.job_order_id = batches.job_order_id 
                AND joi.color_id = batches.color_id 
                AND joi.size_id = batches.size_id
            LEFT JOIN temp_item_cut_quantities temp ON joi.item_id = temp.item_id;
            
            -- Drop temporary table
            DROP TEMPORARY TABLE temp_item_cut_quantities;
        END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `refresh_job_order_items_summary_single` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = cp850 */ ;
/*!50003 SET character_set_results = cp850 */ ;
/*!50003 SET collation_connection  = cp850_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `refresh_job_order_items_summary_single`(IN p_job_order_id INT)
BEGIN
    
    CREATE TEMPORARY TABLE temp_item_cut_quantities AS
    SELECT item_id, cut_quantity
    FROM job_order_items_summary
    WHERE job_order_id = p_job_order_id;
    
    
    REPLACE INTO job_order_items_summary (
        item_id,
        job_order_id,
        color_id,
        size_id,
        color_name,
        size_value,
        expected_quantity,
        produced_quantity,
        cut_quantity,
        second_degree_quantity,
        completed_quantity,
        working_quantity,
        remaining_quantity,
        total_batches,
        has_issues,
        completion_percentage,
        overproduction_quantity,
        production_status,
        notes,
        last_calculated_at
    )
    SELECT 
        joi.item_id,
        joi.job_order_id,
        joi.color_id,
        joi.size_id,
        c.color_name,
        s.size_value,
        joi.quantity as expected_quantity,
        COALESCE(batches.total_produced_quantity, 0) as produced_quantity,
        
        GREATEST(
            COALESCE(temp.cut_quantity, 0),  
            COALESCE(batches.total_produced_quantity, 0)  
        ) AS cut_quantity,
        COALESCE(batches.second_degree_quantity, 0) as second_degree_quantity,
        COALESCE(batches.completed_quantity, 0) as completed_quantity,
        COALESCE(batches.total_produced_quantity, 0) as working_quantity,
        GREATEST(0, joi.quantity - COALESCE(batches.total_produced_quantity, 0)) as remaining_quantity,
        COALESCE(batches.total_batches, 0) as total_batches,
        CASE
            WHEN COALESCE(batches.total_produced_quantity, 0) > joi.quantity THEN TRUE
            ELSE FALSE
        END as has_issues,
        CASE
            WHEN joi.quantity > 0 THEN ROUND((COALESCE(batches.total_produced_quantity, 0) / joi.quantity) * 100, 2)
            ELSE 0
        END as completion_percentage,
        GREATEST(0, COALESCE(batches.total_produced_quantity, 0) - joi.quantity) as overproduction_quantity,
        CASE 
            WHEN COALESCE(batches.total_produced_quantity, 0) >= joi.quantity THEN 'Completed'
            WHEN COALESCE(batches.total_produced_quantity, 0) > 0 THEN 'In Progress'
            ELSE 'Not Started'
        END as production_status,
        joi.notes as notes,
        CURRENT_TIMESTAMP as last_calculated_at
    FROM job_order_items joi
    JOIN colors c ON joi.color_id = c.color_id
    JOIN sizes s ON joi.size_id = s.size_id
    LEFT JOIN (
        SELECT
            job_order_id,
            color_id,
            size_id,
            SUM(quantity) AS total_produced_quantity,
            SUM(CASE WHEN is_second_degree = TRUE THEN quantity ELSE 0 END) AS second_degree_quantity,
            SUM(CASE WHEN status = 'Completed' THEN quantity ELSE 0 END) AS completed_quantity,
            COUNT(*) AS total_batches
        FROM batches
        GROUP BY job_order_id, color_id, size_id
    ) batches ON joi.job_order_id = batches.job_order_id 
        AND joi.color_id = batches.color_id 
        AND joi.size_id = batches.size_id
    LEFT JOIN temp_item_cut_quantities temp ON joi.item_id = temp.item_id
    WHERE joi.job_order_id = p_job_order_id;
    
    
    DROP TEMPORARY TABLE temp_item_cut_quantities;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-09-22  2:15:05
