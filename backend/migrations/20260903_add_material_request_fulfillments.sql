BEGIN;

CREATE TABLE IF NOT EXISTS core.material_request_fulfillments (
    id SERIAL PRIMARY KEY,
    material_request_id INTEGER NOT NULL REFERENCES core.job_order_material_requests(id) ON DELETE CASCADE,
    internal_receipt_id INTEGER,
    supplier_receipt_id INTEGER,
    external_receipt_id INTEGER,
    quantity_issued NUMERIC(10,4) NOT NULL,
    measurement_scale VARCHAR(10) NOT NULL DEFAULT 'KG',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_core_material_request_fulfillments_material_request_id
    ON core.material_request_fulfillments (material_request_id);

COMMIT;
