-- ========================================================================
-- Summary Refresh System WITHOUT pg_cron - Python Worker Alternative
-- ========================================================================

-- STEP 1: Create refresh queue table
CREATE TABLE IF NOT EXISTS reporting.summary_refresh_queue (
    id SERIAL PRIMARY KEY,
    job_order_id INTEGER NOT NULL,
    changed_at TIMESTAMP DEFAULT NOW(),
    needs_refresh BOOLEAN DEFAULT FALSE,
    last_refreshed_at TIMESTAMP,
    UNIQUE(job_order_id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_queue_needs_refresh 
ON reporting.summary_refresh_queue(needs_refresh, changed_at) 
WHERE needs_refresh = TRUE;

-- STEP 2: Trigger function to queue refreshes when batches change
CREATE OR REPLACE FUNCTION ops.queue_summary_refresh()
RETURNS TRIGGER AS $$
DECLARE
    affected_job_order_id INTEGER;
BEGIN
    affected_job_order_id := COALESCE(NEW.job_order_id, OLD.job_order_id);
    
    INSERT INTO reporting.summary_refresh_queue (job_order_id, needs_refresh, changed_at)
    VALUES (affected_job_order_id, TRUE, NOW())
    ON CONFLICT (job_order_id) DO UPDATE
        SET needs_refresh = TRUE,
            changed_at = NOW();
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- STEP 3: Trigger on batches table
DROP TRIGGER IF EXISTS trigger_queue_batch_changes ON ops.batches;

CREATE TRIGGER trigger_queue_batch_changes
    AFTER INSERT OR UPDATE OR DELETE ON ops.batches
    FOR EACH ROW
    EXECUTE FUNCTION ops.queue_summary_refresh();

-- STEP 4: Trigger on job_order_items table
DROP TRIGGER IF EXISTS trigger_queue_item_changes ON core.job_order_items;

CREATE TRIGGER trigger_queue_item_changes
    AFTER INSERT OR UPDATE OR DELETE ON core.job_order_items
    FOR EACH ROW
    EXECUTE FUNCTION ops.queue_summary_refresh();

-- STEP 5: Refresh item summaries with new column structure
CREATE OR REPLACE FUNCTION ops.refresh_job_order_items_summary_for_jobs(
    job_order_ids INTEGER[]
)
RETURNS void AS $$
DECLARE
    job_order_id_var INTEGER;
BEGIN
    FOR job_order_id_var IN SELECT unnest(job_order_ids)
    LOOP
        DROP TABLE IF EXISTS temp_item_cut_quantities_loop;
        
        CREATE TEMPORARY TABLE temp_item_cut_quantities_loop AS
        SELECT item_id, cut_qty
        FROM reporting.job_order_items_summary
        WHERE job_order_id = job_order_id_var;
        
        INSERT INTO reporting.job_order_items_summary AS s (
            item_id, job_order_id, color_id, size_id,
            color_name, size_value, expected_quantity,
            produced_quantity, 
            cut_qty, cut_inspection_qty, second_degree_cut_qty,
            sewing_in_qty, sewing_out_qty, packaging_in_qty, packaging_out_qty,
            working_qty, second_degree_qty, lost_qty, completed_qty,
            total_batches, has_issues, completion_percentage,
            overproduction_quantity, production_status, notes,
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
            batch_stats.produced_quantity,
            
            COALESCE(phase_stats.cut_qty, 0),
            COALESCE(phase_stats.cut_inspection_qty, 0),
            COALESCE(phase_stats.second_degree_cut_qty, 0),
            COALESCE(phase_stats.sewing_in_qty, 0),
            COALESCE(phase_stats.sewing_out_qty, 0),
            COALESCE(phase_stats.packaging_in_qty, 0),
            COALESCE(phase_stats.packaging_out_qty, 0),
            COALESCE(batch_stats.working_qty, 0),
            COALESCE(batch_stats.second_degree_qty, 0),
            COALESCE(phase_stats.lost_qty, 0),
            COALESCE(batch_stats.completed_qty, 0),
            
            COALESCE(batch_stats.total_batches, 0),
            CASE WHEN COALESCE(batch_stats.produced_quantity, 0) > joi.quantity THEN TRUE ELSE FALSE END,
            CASE 
                WHEN joi.quantity > 0 
                THEN LEAST(100.00, (COALESCE(batch_stats.produced_quantity, 0)::NUMERIC / joi.quantity::NUMERIC) * 100.00)
                ELSE 0.00 
            END,
            GREATEST(0, COALESCE(batch_stats.produced_quantity, 0) - joi.quantity),
            CASE 
                WHEN COALESCE(batch_stats.produced_quantity, 0) = 0 THEN 'Not Started'
                WHEN COALESCE(batch_stats.produced_quantity, 0) >= joi.quantity THEN 'Completed'
                ELSE 'In Progress'
            END,
            joi.notes,
            NOW()
        FROM core.job_order_items joi
        JOIN core.colors c ON joi.color_id = c.color_id
        JOIN core.sizes s ON joi.size_id = s.size_id
        
        LEFT JOIN (
            SELECT 
                job_order_id,
                color_id,
                size_id,
                SUM(CASE WHEN is_second_degree = FALSE THEN quantity ELSE 0 END) as produced_quantity,
                SUM(CASE WHEN is_second_degree = TRUE THEN quantity ELSE 0 END) as second_degree_qty,
                SUM(CASE WHEN status = 'Completed' THEN quantity ELSE 0 END) as completed_qty,
                SUM(CASE WHEN status = 'In Progress' THEN quantity ELSE 0 END) as working_qty,
                COUNT(*) as total_batches
            FROM ops.batches
            WHERE job_order_id = job_order_id_var
            GROUP BY job_order_id, color_id, size_id
        ) batch_stats ON joi.job_order_id = batch_stats.job_order_id 
            AND joi.color_id = batch_stats.color_id 
            AND joi.size_id = batch_stats.size_id
        
        LEFT JOIN (
            SELECT 
                b.job_order_id,
                b.color_id,
                b.size_id,
                
                SUM(CASE 
                    WHEN evt.phase_id = 1 
                        AND evt.action_type = 'scan_in' 
                        AND evt.new_status IN ('In Progress', 'Completed')
                    THEN evt.new_quantity ELSE 0 
                END) as cut_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id = 1 
                        AND evt.action_type = 'scan_out' 
                    THEN evt.old_quantity ELSE 0 
                END) as cut_inspection_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id = 1 
                        AND evt.action_type = 'scan_in' 
                        AND evt.new_status IN ('In Progress', 'Completed')
                        AND b.is_second_degree = TRUE
                    THEN evt.new_quantity ELSE 0 
                END) as second_degree_cut_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id IN (2,3,4,7) 
                        AND evt.action_type = 'scan_in' 
                        AND evt.new_status IN ('In Progress', 'Completed')
                    THEN evt.new_quantity ELSE 0 
                END) as sewing_in_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id IN (2,3,4,7) 
                        AND evt.action_type = 'scan_out' 
                    THEN evt.old_quantity ELSE 0 
                END) as sewing_out_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id = 8 
                        AND evt.action_type = 'scan_in' 
                        AND evt.new_status IN ('In Progress', 'Completed')
                    THEN evt.new_quantity ELSE 0 
                END) as packaging_in_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id = 8 
                        AND evt.action_type = 'scan_out' 
                    THEN evt.old_quantity ELSE 0 
                END) as packaging_out_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id = 1 
                        AND evt.action_type = 'scan_in' 
                        AND evt.new_status IN ('In Progress', 'Completed')
                    THEN evt.new_quantity ELSE 0 
                END) - 
                SUM(CASE 
                    WHEN evt.phase_id = 8 
                        AND evt.action_type = 'scan_out' 
                    THEN evt.old_quantity ELSE 0 
                END) as lost_qty
                
            FROM ops.batches b
            LEFT JOIN ops.barcode_scan_events evt ON b.batch_id = evt.batch_id
            WHERE b.job_order_id = job_order_id_var
            GROUP BY b.job_order_id, b.color_id, b.size_id
        ) phase_stats ON joi.job_order_id = phase_stats.job_order_id 
            AND joi.color_id = phase_stats.color_id 
            AND joi.size_id = phase_stats.size_id
        
        WHERE joi.job_order_id = job_order_id_var
        
        ON CONFLICT (item_id) DO UPDATE
        SET 
            produced_quantity = EXCLUDED.produced_quantity,
            cut_qty = EXCLUDED.cut_qty,
            cut_inspection_qty = EXCLUDED.cut_inspection_qty,
            second_degree_cut_qty = EXCLUDED.second_degree_cut_qty,
            sewing_in_qty = EXCLUDED.sewing_in_qty,
            sewing_out_qty = EXCLUDED.sewing_out_qty,
            packaging_in_qty = EXCLUDED.packaging_in_qty,
            packaging_out_qty = EXCLUDED.packaging_out_qty,
            working_qty = EXCLUDED.working_qty,
            second_degree_qty = EXCLUDED.second_degree_qty,
            lost_qty = EXCLUDED.lost_qty,
            completed_qty = EXCLUDED.completed_qty,
            total_batches = EXCLUDED.total_batches,
            has_issues = EXCLUDED.has_issues,
            completion_percentage = EXCLUDED.completion_percentage,
            overproduction_quantity = EXCLUDED.overproduction_quantity,
            production_status = EXCLUDED.production_status,
            last_calculated_at = EXCLUDED.last_calculated_at;
        
        DROP TABLE IF EXISTS temp_item_cut_quantities_loop;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- STEP 6: Refresh job order summary (aggregate from items)
CREATE OR REPLACE FUNCTION reporting.refresh_job_order_summary_for_jobs(
    job_order_ids INTEGER[]
)
RETURNS void AS $$
BEGIN
    INSERT INTO reporting.job_orders_summary AS j (
        job_order_id, job_order_number, model_name, brand_name,
        total_items, total_expected_quantity, total_produced_quantity,
        cut_quantity, second_degree_quantity, total_batches,
        has_issues, completion_percentage,
        overproduction_quantity, last_calculated_at
    )
    SELECT 
        jo.job_order_id,
        jo.job_order_number,
        m.model_name,
        c.client_name as brand_name,
        COUNT(DISTINCT i.item_id),
        SUM(i.expected_quantity),
        SUM(i.produced_quantity),
        SUM(i.cut_qty) as cut_quantity,
        SUM(i.second_degree_qty) as second_degree_quantity,
        SUM(i.total_batches),
        BOOL_OR(i.has_issues),
        CASE 
            WHEN SUM(i.expected_quantity) > 0
            THEN LEAST(100.00, (SUM(i.produced_quantity)::NUMERIC / SUM(i.expected_quantity)::NUMERIC) * 100.00)
            ELSE 0.00
        END,
        GREATEST(0, SUM(i.produced_quantity) - SUM(i.expected_quantity)),
        MAX(i.last_calculated_at)
    FROM core.job_orders jo
    JOIN core.models m ON jo.model_id = m.model_id
    JOIN core.clients c ON jo.client_id = c.client_id
    LEFT JOIN reporting.job_order_items_summary i ON jo.job_order_id = i.job_order_id
    WHERE jo.job_order_id = ANY(job_order_ids)
    GROUP BY jo.job_order_id, jo.job_order_number, m.model_name, c.client_name
    ON CONFLICT (job_order_id) DO UPDATE
    SET 
        total_items = EXCLUDED.total_items,
        total_expected_quantity = EXCLUDED.total_expected_quantity,
        total_produced_quantity = EXCLUDED.total_produced_quantity,
        cut_quantity = EXCLUDED.cut_quantity,
        second_degree_quantity = EXCLUDED.second_degree_quantity,
        total_batches = EXCLUDED.total_batches,
        has_issues = EXCLUDED.has_issues,
        completion_percentage = EXCLUDED.completion_percentage,
        overproduction_quantity = EXCLUDED.overproduction_quantity,
        last_calculated_at = EXCLUDED.last_calculated_at;
END;
$$ LANGUAGE plpgsql;

-- STEP 7: Main debounced refresh function (called by Python worker)
CREATE OR REPLACE FUNCTION reporting.refresh_stale_summaries(
    debounce_seconds INTEGER DEFAULT 10
)
RETURNS INTEGER AS $$
DECLARE
    refreshed_count INTEGER;
    cutoff_time TIMESTAMP;
    job_order_ids INTEGER[];
BEGIN
    cutoff_time := NOW() - (debounce_seconds || ' seconds')::INTERVAL;
    
    WITH stale_refreshes AS (
        UPDATE reporting.summary_refresh_queue
        SET needs_refresh = FALSE,
            last_refreshed_at = NOW()
        WHERE needs_refresh = TRUE
          AND changed_at <= cutoff_time
        RETURNING job_order_id
    )
    SELECT ARRAY_AGG(job_order_id) INTO job_order_ids FROM stale_refreshes;
    
    IF job_order_ids IS NOT NULL AND array_length(job_order_ids, 1) > 0 THEN
        PERFORM ops.refresh_job_order_items_summary_for_jobs(job_order_ids);
        PERFORM reporting.refresh_job_order_summary_for_jobs(job_order_ids);
        
        refreshed_count := array_length(job_order_ids, 1);
        
        DELETE FROM reporting.summary_refresh_queue
        WHERE job_order_id = ANY(job_order_ids);
    ELSE
        refreshed_count := 0;
    END IF;
    
    RETURN refreshed_count;
END;
$$ LANGUAGE plpgsql;

-- Test the refresh function manually
SELECT reporting.refresh_stale_summaries(10);

