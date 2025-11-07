DROP VIEW IF EXISTS reporting.job_orders_summary_view CASCADE;
DROP VIEW IF EXISTS reporting.production_status_summary CASCADE;
DROP VIEW IF EXISTS reporting.daily_production_summary CASCADE;

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


