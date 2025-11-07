DROP VIEW IF EXISTS reporting.job_orders_summary_view CASCADE;
DROP VIEW IF EXISTS reporting.production_status_summary CASCADE;
DROP VIEW IF EXISTS reporting.daily_production_summary CASCADE;

ALTER TABLE IF EXISTS reporting.job_orders_summary DROP COLUMN IF EXISTS brand_name CASCADE;
ALTER TABLE IF EXISTS reporting.job_orders_summary ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);
ALTER TABLE IF EXISTS reporting.job_orders_summary DROP COLUMN IF EXISTS last_quantity_change CASCADE;
ALTER TABLE IF EXISTS reporting.job_orders_summary DROP COLUMN IF EXISTS last_completion_change CASCADE;
ALTER TABLE IF EXISTS reporting.job_orders_summary DROP COLUMN IF EXISTS last_new_batch CASCADE;
ALTER TABLE IF EXISTS reporting.job_orders_summary DROP COLUMN IF EXISTS last_batch_update CASCADE;

DROP TABLE IF EXISTS reporting.job_order_items_summary CASCADE;

CREATE TABLE reporting.job_order_items_summary (
    item_id INTEGER PRIMARY KEY REFERENCES core.job_order_items(item_id) ON DELETE CASCADE,
    job_order_id INTEGER NOT NULL REFERENCES core.job_orders(job_order_id) ON DELETE CASCADE,
    color_id INTEGER NOT NULL,
    size_id INTEGER NOT NULL,
    color_name VARCHAR(255) NOT NULL,
    size_value VARCHAR(50) NOT NULL,
    expected_quantity INTEGER NOT NULL,
    cut_qty INTEGER DEFAULT 0,
    cut_inspection_qty INTEGER DEFAULT 0,
    second_degree_cut_qty INTEGER DEFAULT 0,
    sewing_in_qty INTEGER DEFAULT 0,
    sewing_out_qty INTEGER DEFAULT 0,
    packaging_in_qty INTEGER DEFAULT 0,
    packaging_out_qty INTEGER DEFAULT 0,
    working_qty INTEGER DEFAULT 0,
    second_degree_qty INTEGER DEFAULT 0,
    lost_qty INTEGER DEFAULT 0,
    completed_qty INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    has_issues BOOLEAN DEFAULT FALSE,
    completion_percentage DECIMAL(5,2) DEFAULT 0.00,
    overproduction_quantity INTEGER DEFAULT 0,
    production_status VARCHAR(20) DEFAULT 'Not Started',
    notes TEXT,
    last_calculated_at TIMESTAMP,
    
    CONSTRAINT fk_summary_color FOREIGN KEY (color_id) REFERENCES core.colors(color_id),
    CONSTRAINT fk_summary_size FOREIGN KEY (size_id) REFERENCES core.sizes(size_id)
);

CREATE INDEX idx_job_order_items_summary_job_order_id ON reporting.job_order_items_summary(job_order_id);
CREATE INDEX idx_job_order_items_summary_color_size ON reporting.job_order_items_summary(color_id, size_id);

CREATE OR REPLACE FUNCTION ops.refresh_job_order_items_summary_for_jobs(
    job_order_ids INTEGER[]
)
RETURNS void AS $$
DECLARE
    job_order_id_var INTEGER;
BEGIN
    FOR job_order_id_var IN SELECT unnest(job_order_ids)
    LOOP
        INSERT INTO reporting.job_order_items_summary AS s (
            item_id, job_order_id, color_id, size_id,
            color_name, size_value, expected_quantity,
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
            
            COALESCE(phase_stats.cut_qty, 0),
            COALESCE(phase_stats.cut_inspection_qty, 0),
            COALESCE(phase_stats.second_degree_cut_qty, 0),
            COALESCE(phase_stats.sewing_in_qty, 0),
            COALESCE(phase_stats.sewing_out_qty, 0),
            COALESCE(phase_stats.packaging_in_qty, 0),
            COALESCE(phase_stats.packaging_out_qty, 0),
            COALESCE(calc_stats.working_qty, 0),
            COALESCE(batch_stats.second_degree_qty, 0),
            COALESCE(calc_stats.lost_qty, 0),
            COALESCE(batch_stats_completed.completed_qty, 0),
            COALESCE(batch_stats.total_batches, 0),
            COALESCE(calc_stats.has_issues, FALSE),
            COALESCE(calc_stats.completion_percentage, 0.00),
            COALESCE(calc_stats.overproduction_quantity, 0),
            COALESCE(calc_stats.production_status, 'Not Started'),
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
                SUM(quantity) as total_batch_qty,
                SUM(CASE WHEN is_second_degree = TRUE THEN quantity ELSE 0 END) as second_degree_qty,
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
                        AND evt.new_status = 'Pending'
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
                END) as packaging_out_qty
                
            FROM ops.batches b
            LEFT JOIN ops.barcode_scan_events evt ON b.batch_id = evt.batch_id
            WHERE b.job_order_id = job_order_id_var
            GROUP BY b.job_order_id, b.color_id, b.size_id
        ) phase_stats ON joi.job_order_id = phase_stats.job_order_id 
            AND joi.color_id = phase_stats.color_id 
            AND joi.size_id = phase_stats.size_id
        
        LEFT JOIN (
            SELECT 
                job_order_id,
                color_id,
                size_id,
                SUM(quantity) FILTER (WHERE current_phase = 8 AND status = 'Completed') as completed_qty
            FROM ops.batches
            WHERE job_order_id = job_order_id_var
            GROUP BY job_order_id, color_id, size_id
        ) batch_stats_completed ON joi.job_order_id = batch_stats_completed.job_order_id 
            AND joi.color_id = batch_stats_completed.color_id 
            AND joi.size_id = batch_stats_completed.size_id
        
        LEFT JOIN LATERAL (
            SELECT
                COALESCE(batch_stats.total_batch_qty, 0) - COALESCE(phase_stats.second_degree_cut_qty, 0) as working_qty,
                GREATEST(0, COALESCE(phase_stats.cut_qty, 0) + COALESCE(phase_stats.second_degree_cut_qty, 0) - 
                    (COALESCE(batch_stats.total_batch_qty, 0) - COALESCE(phase_stats.second_degree_cut_qty, 0))) as lost_qty,
                (
                    (joi.notes IS NOT NULL AND joi.notes != '')
                    OR
                    EXISTS (
                        SELECT 1 FROM ops.batches b 
                        WHERE b.job_order_id = joi.job_order_id 
                        AND b.color_id = joi.color_id 
                        AND b.size_id = joi.size_id
                        AND b.is_second_degree = FALSE
                        GROUP BY b.color_id, b.size_id
                        HAVING COUNT(DISTINCT CASE 
                            WHEN b.current_phase = 1 THEN 'Cutting'
                            WHEN b.current_phase IN (2, 3, 4, 7) THEN 'Sewing'
                            WHEN b.current_phase = 8 THEN 'Packaging'
                            ELSE 'Other'
                        END) > 1
                    )
                    OR
                    (COALESCE(phase_stats.cut_qty, 0) > 
                     (COALESCE(batch_stats.total_batch_qty, 0) - COALESCE(phase_stats.second_degree_cut_qty, 0)))
                    OR
                    (
                        (COALESCE(phase_stats.second_degree_cut_qty, 0) + COALESCE(batch_stats.second_degree_qty, 0)) > 0
                        AND (COALESCE(batch_stats.total_batch_qty, 0) - COALESCE(phase_stats.second_degree_cut_qty, 0)) > 0
                        AND (COALESCE(phase_stats.second_degree_cut_qty, 0) + COALESCE(batch_stats.second_degree_qty, 0))::NUMERIC / 
                            NULLIF((COALESCE(batch_stats.total_batch_qty, 0) - COALESCE(phase_stats.second_degree_cut_qty, 0)), 0) * 100 > 3
                    )
                    OR
                    (COALESCE(phase_stats.cut_qty, 0) > joi.quantity)
                ) as has_issues,
                CASE 
                    WHEN joi.quantity > 0 
                    THEN LEAST(100.00, (COALESCE(phase_stats.cut_qty, 0)::NUMERIC / joi.quantity::NUMERIC) * 100.00)
                    ELSE 0.00 
                END as completion_percentage,
                GREATEST(0, COALESCE(phase_stats.cut_qty, 0) - joi.quantity) as overproduction_quantity,
                CASE 
                    WHEN COALESCE(phase_stats.cut_qty, 0) = 0 THEN 'Not Started'
                    WHEN COALESCE(batch_stats_completed.completed_qty, 0) >= joi.quantity THEN 'Completed'
                    ELSE 'In Progress'
                END as production_status
        ) calc_stats ON TRUE
        
        WHERE joi.job_order_id = job_order_id_var
        
        ON CONFLICT (item_id) DO UPDATE
        SET 
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
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reporting.refresh_job_order_summary_for_jobs(
    job_order_ids INTEGER[]
)
RETURNS void AS $$
BEGIN
    INSERT INTO reporting.job_orders_summary AS j (
        job_order_id, job_order_number, model_name, client_name,
        total_items, total_expected_quantity, total_produced_quantity,
        cut_quantity, second_degree_quantity, working_quantity, total_batches,
        has_issues, has_high_second_degree, completion_percentage,
        overproduction_quantity, last_calculated_at
    )
    SELECT 
        jo.job_order_id,
        jo.job_order_number,
        m.model_name,
        c.client_name,
        COUNT(DISTINCT i.item_id),
        SUM(i.expected_quantity),
        SUM(i.working_qty) as total_produced_quantity,
        SUM(i.cut_qty) as cut_quantity,
        SUM(i.second_degree_qty) as second_degree_quantity,
        SUM(i.working_qty) as working_quantity,
        SUM(i.total_batches),
        BOOL_OR(i.has_issues),
        (
            SUM(i.second_degree_qty) > 0 
            AND SUM(i.working_qty) > 0
            AND (SUM(i.second_degree_qty)::NUMERIC / NULLIF(SUM(i.working_qty), 0) * 100) > 3
        ) as has_high_second_degree,
        CASE 
            WHEN SUM(i.expected_quantity) > 0
            THEN LEAST(100.00, (SUM(i.working_qty)::NUMERIC / SUM(i.expected_quantity)::NUMERIC) * 100.00)
            ELSE 0.00
        END,
        GREATEST(0, SUM(i.working_qty) - SUM(i.expected_quantity)),
        NOW()
    FROM core.job_orders jo
    JOIN core.models m ON jo.model_id = m.model_id
    JOIN core.clients c ON jo.client_id = c.client_id
    LEFT JOIN reporting.job_order_items_summary i ON jo.job_order_id = i.job_order_id
    WHERE jo.job_order_id = ANY(job_order_ids)
    GROUP BY jo.job_order_id, jo.job_order_number, m.model_name, c.client_name
    ON CONFLICT (job_order_id) DO UPDATE
    SET 
        client_name = EXCLUDED.client_name,
        total_items = EXCLUDED.total_items,
        total_expected_quantity = EXCLUDED.total_expected_quantity,
        total_produced_quantity = EXCLUDED.total_produced_quantity,
        cut_quantity = EXCLUDED.cut_quantity,
        second_degree_quantity = EXCLUDED.second_degree_quantity,
        working_quantity = EXCLUDED.working_quantity,
        total_batches = EXCLUDED.total_batches,
        has_issues = EXCLUDED.has_issues,
        has_high_second_degree = EXCLUDED.has_high_second_degree,
        completion_percentage = EXCLUDED.completion_percentage,
        overproduction_quantity = EXCLUDED.overproduction_quantity,
        last_calculated_at = EXCLUDED.last_calculated_at;
END;
$$ LANGUAGE plpgsql;

