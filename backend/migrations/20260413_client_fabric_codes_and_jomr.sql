BEGIN;

-- ============================================================================
-- Drop legacy material-level client/fabric artifacts
-- ============================================================================
DROP TRIGGER IF EXISTS trg_materials_set_fabric_code ON core.materials;
DROP FUNCTION IF EXISTS core.materials_set_fabric_code();
DROP TABLE IF EXISTS core.material_fabric_seq;

DROP INDEX IF EXISTS core.uq_core_materials_name_unscoped;
DROP INDEX IF EXISTS core.uq_core_materials_client_name;
DROP INDEX IF EXISTS core.uq_core_materials_fabric_code;
DROP INDEX IF EXISTS core.idx_core_materials_client_id;

ALTER TABLE IF EXISTS core.materials DROP CONSTRAINT IF EXISTS fk_materials_client_id;
ALTER TABLE IF EXISTS core.materials DROP COLUMN IF EXISTS client_id;
ALTER TABLE IF EXISTS core.materials DROP COLUMN IF EXISTS fabric_code;

-- Keep materials globally unique by name.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'materials_material_name_key'
          AND conrelid = 'core.materials'::regclass
    ) THEN
        ALTER TABLE core.materials
            ADD CONSTRAINT materials_material_name_key UNIQUE (material_name);
    END IF;
END $$;

-- ============================================================================
-- New fabric-code tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS core.client_fabric_seq (
    client_id INTEGER NOT NULL REFERENCES core.clients(client_id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES core.materials(material_id) ON DELETE CASCADE,
    last_seq INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE core.client_fabric_seq
    ADD COLUMN IF NOT EXISTS material_id INTEGER;
-- Legacy rows from old schema (client-only sequence) cannot be deterministically mapped
-- to a specific material; remove them so the new client+material sequence can start clean.
DELETE FROM core.client_fabric_seq
WHERE material_id IS NULL;
ALTER TABLE core.client_fabric_seq
    ALTER COLUMN material_id SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'client_fabric_seq_material_id_fkey'
          AND conrelid = 'core.client_fabric_seq'::regclass
    ) THEN
        ALTER TABLE core.client_fabric_seq
            ADD CONSTRAINT client_fabric_seq_material_id_fkey
            FOREIGN KEY (material_id)
            REFERENCES core.materials(material_id)
            ON DELETE CASCADE;
    END IF;
END $$;
ALTER TABLE core.client_fabric_seq DROP CONSTRAINT IF EXISTS client_fabric_seq_pkey;
ALTER TABLE core.client_fabric_seq
    ADD CONSTRAINT client_fabric_seq_pkey PRIMARY KEY (client_id, material_id);

CREATE TABLE IF NOT EXISTS core.client_fabric_codes (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES core.clients(client_id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES core.materials(material_id) ON DELETE CASCADE,
    color_id INTEGER NOT NULL REFERENCES core.colors(color_id) ON DELETE CASCADE,
    fabric_code VARCHAR(100) NOT NULL UNIQUE,
    CONSTRAINT uq_client_fabric_codes_client_material_color UNIQUE (client_id, material_id, color_id)
);

CREATE INDEX IF NOT EXISTS idx_core_client_fabric_codes_client_id
    ON core.client_fabric_codes (client_id);

CREATE OR REPLACE FUNCTION core.client_fabric_codes_set_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fab$
DECLARE
    v_client_code text;
    v_seq integer;
BEGIN
    IF NEW.fabric_code IS NOT NULL AND btrim(NEW.fabric_code) <> '' THEN
        RETURN NEW;
    END IF;

    SELECT c.client_code INTO v_client_code
    FROM core.clients c
    WHERE c.client_id = NEW.client_id;

    IF v_client_code IS NULL OR btrim(v_client_code) = '' THEN
        v_client_code := 'CL';
    END IF;

    INSERT INTO core.client_fabric_seq (client_id, material_id, last_seq)
    VALUES (NEW.client_id, NEW.material_id, 1)
    ON CONFLICT (client_id, material_id) DO UPDATE
        SET last_seq = core.client_fabric_seq.last_seq + 1
    RETURNING last_seq INTO v_seq;

    NEW.fabric_code := upper(v_client_code) || NEW.material_id::text || v_seq::text;
    RETURN NEW;
END;
$fab$;

DROP TRIGGER IF EXISTS trg_client_fabric_codes_set_code ON core.client_fabric_codes;
CREATE TRIGGER trg_client_fabric_codes_set_code
    BEFORE INSERT ON core.client_fabric_codes
    FOR EACH ROW
    EXECUTE FUNCTION core.client_fabric_codes_set_code();

-- ============================================================================
-- Reshape job_order_material_requests to use fabric_code_id
-- ============================================================================
ALTER TABLE IF EXISTS core.job_order_material_requests
    ADD COLUMN IF NOT EXISTS fabric_code_id INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'core'
          AND table_name = 'job_order_material_requests'
          AND column_name = 'material_id'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'core'
          AND table_name = 'job_order_material_requests'
          AND column_name = 'color_id'
    ) THEN
        INSERT INTO core.client_fabric_codes (client_id, material_id, color_id, fabric_code)
        SELECT DISTINCT
            jo.client_id,
            jomr.material_id,
            jomr.color_id,
            NULL
        FROM core.job_order_material_requests jomr
        JOIN core.job_orders jo ON jo.job_order_id = jomr.job_order_id
        WHERE jo.client_id IS NOT NULL
          AND jomr.material_id IS NOT NULL
          AND jomr.color_id IS NOT NULL
        ON CONFLICT (client_id, material_id, color_id) DO NOTHING;

        UPDATE core.job_order_material_requests jomr
        SET fabric_code_id = cfc.id
        FROM core.job_orders jo, core.client_fabric_codes cfc
        WHERE jo.job_order_id = jomr.job_order_id
          AND cfc.client_id = jo.client_id
          AND cfc.material_id = jomr.material_id
          AND cfc.color_id = jomr.color_id
          AND jomr.fabric_code_id IS NULL;
    END IF;
END $$;

ALTER TABLE core.job_order_material_requests
    DROP CONSTRAINT IF EXISTS uq_job_material_request;

ALTER TABLE IF EXISTS core.job_order_material_requests
    DROP CONSTRAINT IF EXISTS job_order_material_requests_material_id_fkey;
ALTER TABLE IF EXISTS core.job_order_material_requests
    DROP CONSTRAINT IF EXISTS job_order_material_requests_color_id_fkey;

ALTER TABLE IF EXISTS core.job_order_material_requests
    DROP COLUMN IF EXISTS material_id;
ALTER TABLE IF EXISTS core.job_order_material_requests
    DROP COLUMN IF EXISTS color_id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'job_order_material_requests_fabric_code_id_fkey'
          AND conrelid = 'core.job_order_material_requests'::regclass
    ) THEN
        ALTER TABLE core.job_order_material_requests
            ADD CONSTRAINT job_order_material_requests_fabric_code_id_fkey
            FOREIGN KEY (fabric_code_id)
            REFERENCES core.client_fabric_codes(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

ALTER TABLE core.job_order_material_requests
    ALTER COLUMN fabric_code_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_job_material_request'
          AND conrelid = 'core.job_order_material_requests'::regclass
    ) THEN
        ALTER TABLE core.job_order_material_requests
            ADD CONSTRAINT uq_job_material_request UNIQUE (job_order_id, fabric_code_id, panel_type);
    END IF;
END $$;

COMMIT;
