-- Migration: add material_id to ops.cut_details and archive.cut_details
-- Idempotent: safe to run more than once (IF NOT EXISTS / conditional FK).
--
-- psql example:
--   psql "$DATABASE_URL" -f backend/migrations/20260413_add_cut_details_material_id.sql

BEGIN;

-- Live cuts: reference core.materials
ALTER TABLE IF EXISTS ops.cut_details
    ADD COLUMN IF NOT EXISTS material_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_cut_details_material_id'
    ) THEN
        ALTER TABLE ops.cut_details
            ADD CONSTRAINT fk_cut_details_material_id
            FOREIGN KEY (material_id) REFERENCES core.materials(material_id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ops_cut_details_material_id ON ops.cut_details (material_id);

-- Archived cuts (no FK: archive tables typically avoid FKs to live reference data)
ALTER TABLE IF EXISTS archive.cut_details
    ADD COLUMN IF NOT EXISTS material_id INTEGER;

-- Backfill from job order material requests via fabric_code_id -> client_fabric_codes.
UPDATE ops.cut_details cd
SET material_id = subq.material_id
FROM (
    SELECT DISTINCT ON (cd2.cut_id)
        cd2.cut_id,
        cfc.material_id
    FROM ops.cut_details cd2
    JOIN core.job_order_material_requests jomr
      ON jomr.job_order_id = cd2.job_order_id
    JOIN core.client_fabric_codes cfc
      ON cfc.id = jomr.fabric_code_id
     AND cfc.color_id = cd2.color_id
    ORDER BY cd2.cut_id, jomr.id
) subq
WHERE cd.cut_id = subq.cut_id
  AND cd.material_id IS NULL;

COMMIT;
