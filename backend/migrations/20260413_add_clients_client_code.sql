-- Migration: add core.clients.client_code (unique, auto-filled on INSERT)
-- Idempotent: safe to run more than once (CREATE OR REPLACE, IF NOT EXISTS).
--
-- Generation order: first 2 letters of name → first 3 → first 2 + letter from name
-- (random order) → first letter + two letters A–Z.
--
-- psql example:
--   psql "$DATABASE_URL" -f backend/migrations/20260413_add_clients_client_code.sql

BEGIN;

ALTER TABLE IF EXISTS core.clients
    ADD COLUMN IF NOT EXISTS client_code VARCHAR(32);

CREATE OR REPLACE FUNCTION core.client_code_taken(p_code text, p_exclude_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
AS $taken$
    SELECT EXISTS (
        SELECT 1
        FROM core.clients c
        WHERE c.client_code = p_code
          AND (p_exclude_id IS NULL OR c.client_id <> p_exclude_id)
    );
$taken$;

CREATE OR REPLACE FUNCTION core.generate_client_code(p_name text, p_exclude_id integer)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $gen$
DECLARE
    letters text;
    base2 text;
    v_try text;
    fl text;
    rec record;
    i int;
    j int;
BEGIN
    letters := regexp_replace(lower(trim(coalesce(p_name, ''))), '[^[:alpha:]]', '', 'g');
    IF length(letters) = 0 THEN
        letters := 'x';
    END IF;

    IF length(letters) >= 2 THEN
        v_try := upper(substr(letters, 1, 2));
    ELSE
        v_try := upper(substr(letters, 1, 1) || substr(letters, 1, 1));
    END IF;
    IF NOT core.client_code_taken(v_try, p_exclude_id) THEN
        RETURN v_try;
    END IF;

    IF length(letters) >= 3 THEN
        v_try := upper(substr(letters, 1, 3));
        IF NOT core.client_code_taken(v_try, p_exclude_id) THEN
            RETURN v_try;
        END IF;
    END IF;

    IF length(letters) >= 2 THEN
        base2 := substr(letters, 1, 2);
    ELSE
        base2 := substr(letters, 1, 1) || substr(letters, 1, 1);
    END IF;

    FOR rec IN
        SELECT substr(letters, s.i, 1) AS ch
        FROM generate_series(1, length(letters)) AS s(i)
        ORDER BY random()
    LOOP
        v_try := upper(base2 || rec.ch);
        IF NOT core.client_code_taken(v_try, p_exclude_id) THEN
            RETURN v_try;
        END IF;
    END LOOP;

    fl := upper(substr(letters, 1, 1));
    FOR i IN 0..25 LOOP
        FOR j IN 0..25 LOOP
            v_try := fl || chr(ascii('A') + i) || chr(ascii('A') + j);
            IF NOT core.client_code_taken(v_try, p_exclude_id) THEN
                RETURN v_try;
            END IF;
        END LOOP;
    END LOOP;

    RAISE EXCEPTION 'Could not allocate client_code for name %', p_name;
END;
$gen$;

CREATE OR REPLACE FUNCTION core.clients_set_client_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $trg$
BEGIN
    IF NEW.client_code IS NULL OR btrim(NEW.client_code::text) = '' THEN
        NEW.client_code := core.generate_client_code(NEW.client_name, NULL);
    END IF;
    RETURN NEW;
END;
$trg$;

DROP TRIGGER IF EXISTS trg_clients_set_client_code ON core.clients;
CREATE TRIGGER trg_clients_set_client_code
    BEFORE INSERT ON core.clients
    FOR EACH ROW
    EXECUTE FUNCTION core.clients_set_client_code();

DO $fill$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT client_id, client_name
        FROM core.clients
        WHERE client_code IS NULL
        ORDER BY client_id
    LOOP
        UPDATE core.clients c
        SET client_code = core.generate_client_code(r.client_name, r.client_id)
        WHERE c.client_id = r.client_id;
    END LOOP;
END
$fill$;

DROP INDEX IF EXISTS core.uq_core_clients_client_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_core_clients_client_code ON core.clients (client_code);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'clients'
          AND column_name = 'client_code' AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE core.clients ALTER COLUMN client_code SET NOT NULL;
    END IF;
END $$;

COMMIT;
