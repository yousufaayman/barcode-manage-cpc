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
            COALESCE(batch_stats.working_qty, 0),
            COALESCE(batch_stats.second_degree_qty, 0),
            COALESCE(phase_stats.lost_qty, 0),
            COALESCE(batch_stats.completed_qty, 0),
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
                SUM(CASE WHEN is_second_degree = TRUE THEN quantity ELSE 0 END) as second_degree_qty,
                SUM(CASE WHEN status = 'Completed' THEN quantity ELSE 0 END) as completed_qty,
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
                    WHEN evt.phase_id IN (2,3,4,7) 
                        AND evt.action_type = 'scan_in' 
                        AND evt.new_status IN ('In Progress', 'Completed')
                    THEN evt.new_quantity ELSE 0 
                END) as packaging_in_qty,
                
                SUM(CASE 
                    WHEN evt.phase_id IN (2,3,4,7) 
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
        
        LEFT JOIN LATERAL (
            SELECT 
                SUM(batch_stats.second_degree_qty) - COALESCE(phase_stats.second_degree_cut_qty, 0) as working_qty,
                COALESCE(phase_stats.cut_qty, 0) + COALESCE(phase_stats.second_degree_cut_qty, 0) - (SUM(batch_stats.second_degree_qty) - COALESCE(phase_stats.second_degree_cut_qty, 0)) as lost_qty,
                FALSE as has_issues,
                0.00 as completion_percentage,
                GREATEST(0, COALESCE(phase_stats.cut_qty, 0) - joi.quantity) as overproduction_quantity,
                CASE 
                    WHEN COALESCE(phase_stats.cut_qty, 0) = 0 THEN 'Not Started'
                    WHEN COALESCE(batch_stats.completed_qty, 0) >= joi.quantity THEN 'Completed'
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


