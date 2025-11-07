-- Migration to update job_order_items_summary table structure
-- Drop all dependent views first, then update columns

DROP VIEW IF EXISTS reporting.job_orders_summary_view CASCADE;
DROP VIEW IF EXISTS reporting.production_status_summary CASCADE;
DROP VIEW IF EXISTS reporting.daily_production_summary CASCADE;

ALTER TABLE reporting.job_order_items_summary
    DROP COLUMN IF EXISTS cut_quantity CASCADE,
    DROP COLUMN IF EXISTS second_degree_quantity CASCADE,
    DROP COLUMN IF EXISTS completed_quantity CASCADE,
    DROP COLUMN IF EXISTS working_quantity CASCADE,
    DROP COLUMN IF EXISTS remaining_quantity CASCADE;

ALTER TABLE reporting.job_order_items_summary
    ADD COLUMN IF NOT EXISTS cut_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cut_inspection_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS second_degree_cut_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sewing_in_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sewing_out_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS packaging_in_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS packaging_out_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS working_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS second_degree_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lost_qty INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completed_qty INTEGER DEFAULT 0;

-- Recreate view with new column names (if needed)
-- Note: We may not need this view if using the refresh functions

