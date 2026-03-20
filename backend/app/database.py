from sqlalchemy import text
from .db.session import engine, SessionLocal, get_db

# Function to create schemas
def create_schemas():
    """Create all required schemas in PostgreSQL"""
    schemas = ['core', 'ops', 'archive', 'reporting']
    
    with engine.connect() as conn:
        for schema in schemas:
            try:
                conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
                conn.commit()
                print(f"Schema {schema} created successfully")
            except Exception as e:
                print(f"Warning: Could not create schema {schema}: {e}")

# Function to create extensions
def create_extensions():
    """Create required PostgreSQL extensions"""
    extensions = ['uuid-ossp', 'pg_trgm']  # Add other extensions as needed
    
    with engine.connect() as conn:
        for extension in extensions:
            try:
                conn.execute(text(f"CREATE EXTENSION IF NOT EXISTS {extension}"))
                conn.commit()
                print(f"Extension {extension} created successfully")
            except Exception as e:
                print(f"Warning: Could not create extension {extension}: {e}")

# Function to create indexes
def create_indexes():
    """Create indexes for optimal performance"""
    indexes = [
        # Core schema indexes
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_core_clients_name ON core.clients (name);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_core_colors_name ON core.colors (name);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_core_sizes_value ON core.sizes (value);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_core_models_name ON core.models (name);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_core_materials_name ON core.materials (name);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_core_production_phases_name ON core.production_phases (name);",
        "CREATE INDEX IF NOT EXISTS idx_core_job_order_items_composite ON core.job_order_items (job_order_id, color_id, size_id);",
        "CREATE INDEX IF NOT EXISTS idx_core_job_order_materials_composite ON core.job_order_materials (job_order_id, material_id, color_id);",
        "CREATE INDEX IF NOT EXISTS idx_core_production_phases_type ON core.production_phases (type);",
        "CREATE INDEX IF NOT EXISTS idx_core_production_phases_sequence ON core.production_phases (sequence_order);",
        "CREATE INDEX IF NOT EXISTS idx_core_job_orders_print_config ON core.job_orders USING GIN (print_config);",
        "CREATE INDEX IF NOT EXISTS idx_core_job_orders_notes_fts ON core.job_orders USING GIN (to_tsvector('english', notes));",
        
        # Operations schema indexes
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_batches_barcode ON ops.batches (barcode);",
        "CREATE INDEX IF NOT EXISTS idx_ops_barcode_scan_events_batch_action ON ops.barcode_scan_events (batch_id, action_type, scanned_at);",
        "CREATE INDEX IF NOT EXISTS idx_ops_barcode_scan_events_phase_scanned ON ops.barcode_scan_events (phase_id, scanned_at);",
        "CREATE INDEX IF NOT EXISTS idx_ops_batches_status_phase ON ops.batches (status, current_phase);",
        "CREATE INDEX IF NOT EXISTS idx_ops_batches_last_updated ON ops.batches (last_updated);",
        "CREATE INDEX IF NOT EXISTS idx_ops_batches_barcode_trgm ON ops.batches USING GIN (barcode gin_trgm_ops);",
        
        # Archive schema indexes
        "CREATE INDEX IF NOT EXISTS idx_archive_batches_archived_at ON archive.batches (archived_at);",
        "CREATE INDEX IF NOT EXISTS idx_archive_barcode_scan_events_archived_at ON archive.barcode_scan_events (archived_at);",
        "CREATE INDEX IF NOT EXISTS idx_archive_batches_job_order ON archive.batches (job_order_id);",
        "CREATE INDEX IF NOT EXISTS idx_archive_batches_color_size ON archive.batches (color_id, size_id);",
        
        # Reporting schema indexes
        "CREATE INDEX IF NOT EXISTS idx_reporting_job_order_items_summary_completion ON reporting.job_order_items_summary (completion_percentage);",
        "CREATE INDEX IF NOT EXISTS idx_reporting_job_order_items_summary_status ON reporting.job_order_items_summary (production_status);",
        "CREATE INDEX IF NOT EXISTS idx_reporting_job_order_items_summary_issues ON reporting.job_order_items_summary (has_issues);",
        "CREATE INDEX IF NOT EXISTS idx_reporting_job_orders_summary_completion ON reporting.job_orders_summary (completion_percentage);",
        "CREATE INDEX IF NOT EXISTS idx_reporting_worker_daily_stage_production_work_date ON reporting.worker_daily_stage_production (work_date);",
        "CREATE INDEX IF NOT EXISTS idx_reporting_worker_daily_stage_production_worker_work_date ON reporting.worker_daily_stage_production (worker_id, work_date);",
        "CREATE INDEX IF NOT EXISTS idx_reporting_worker_daily_stage_production_stage_work_date ON reporting.worker_daily_stage_production (stage_id, work_date);",
    ]
    
    with engine.connect() as conn:
        for index_sql in indexes:
            try:
                conn.execute(text(index_sql))
                conn.commit()
                print(f"Index created: {index_sql.split('idx_')[1].split(' ')[0]}")
            except Exception as e:
                print(f"Warning: Could not create index: {e}")

# Function to create triggers and functions
def create_triggers_and_functions():
    """Create PostgreSQL triggers and functions"""
    functions_and_triggers = [
        # Cleanup legacy function/trigger names and wrong schema references
        "DROP TRIGGER IF EXISTS trigger_handle_phase_transition ON ops.batches;",
        "DROP TRIGGER IF EXISTS trigger_handle_phase_transitions ON ops.batches;",
        "DROP FUNCTION IF EXISTS ops.handle_phase_transition();",
        "DROP FUNCTION IF EXISTS ops.handle_phase_transitions();",
        "DROP FUNCTION IF EXISTS ops.track_item_batch_completion_changes() CASCADE;",
        """
        -- New column for Advanced Statistics (WorkersSubTab) to display
        -- working hours coming from ops.worker_daily_stage_assignments.
        ALTER TABLE IF EXISTS reporting.worker_daily_stage_production
        ADD COLUMN IF NOT EXISTS working_hours DECIMAL(6,2) NOT NULL DEFAULT 0;

        -- New column for Advanced Statistics overtime hours coming from
        -- ops.worker_overtime_history.
        ALTER TABLE IF EXISTS reporting.worker_daily_stage_production
        ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(6,2) NOT NULL DEFAULT 0;
        """,
        # Phase transition function
        """
        CREATE OR REPLACE FUNCTION ops.handle_phase_transitions()
        RETURNS TRIGGER AS $$
        DECLARE
            cutting_phase_id INTEGER;
            first_sewing_phase_id INTEGER;
            first_qc_phase_id INTEGER;
            first_packaging_phase_id INTEGER;
            current_phase_type VARCHAR;
        BEGIN
            -- Get cutting phase ID
            SELECT phase_id INTO cutting_phase_id FROM core.production_phases WHERE phase_name = 'Cutting' LIMIT 1;
            
            -- Get current phase type
            SELECT COALESCE(type, '') INTO current_phase_type FROM core.production_phases WHERE phase_id = NEW.current_phase;
            
            -- Cutting: When set to Completed, move to Sewing phase with lowest sequence_order (Pending)
            IF NEW.current_phase = cutting_phase_id AND NEW.status = 'Completed' THEN
                SELECT phase_id INTO first_sewing_phase_id
                FROM core.production_phases
                WHERE type = 'sewing'
                ORDER BY sequence_order ASC NULLS LAST
                LIMIT 1;
                
                IF first_sewing_phase_id IS NOT NULL THEN
                    NEW.current_phase := first_sewing_phase_id;
                    NEW.status := 'Pending';
                END IF;
            END IF;
            
            -- Any Sewing phase: When set to Completed, move to QC phase with lowest sequence_order (Pending)
            IF current_phase_type = 'sewing' AND NEW.status = 'Completed' THEN
                SELECT phase_id INTO first_qc_phase_id
                FROM core.production_phases
                WHERE type = 'qc'
                ORDER BY sequence_order ASC NULLS LAST
                LIMIT 1;
                
                IF first_qc_phase_id IS NOT NULL THEN
                    NEW.current_phase := first_qc_phase_id;
                    NEW.status := 'Pending';
                END IF;
            END IF;
            
            -- QC phase: When set to Completed, move to Packaging phase with lowest sequence_order (Pending)
            IF current_phase_type = 'qc' AND NEW.status = 'Completed' THEN
                SELECT phase_id INTO first_packaging_phase_id
                FROM core.production_phases
                WHERE type = 'packaging'
                ORDER BY sequence_order ASC NULLS LAST
                LIMIT 1;
                
                IF first_packaging_phase_id IS NOT NULL THEN
                    NEW.current_phase := first_packaging_phase_id;
                    NEW.status := 'Pending';
                END IF;
            END IF;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        # Phase transition trigger
        """
        CREATE TRIGGER trigger_handle_phase_transitions
            BEFORE UPDATE ON ops.batches
            FOR EACH ROW
            EXECUTE FUNCTION ops.handle_phase_transitions();
        """,
        
        # Quantity tracking function
        """
        CREATE OR REPLACE FUNCTION ops.track_item_batch_quantity_changes()
        RETURNS TRIGGER AS $$
        DECLARE
            current_cut_qty INTEGER DEFAULT 0;
            new_total_quantity INTEGER DEFAULT 0;
            new_second_degree_qty INTEGER DEFAULT 0;
            new_completed_qty INTEGER DEFAULT 0;
            expected_qty INTEGER DEFAULT 0;
            item_status VARCHAR(20) DEFAULT 'Not Started';
            completion_pct NUMERIC(5,2) DEFAULT 0.00;
            has_issues_flag BOOLEAN DEFAULT FALSE;
            overproduction_qty INTEGER DEFAULT 0;
        BEGIN
            SELECT cut_qty INTO current_cut_qty 
            FROM reporting.job_order_items_summary 
            WHERE job_order_id = NEW.job_order_id 
            AND color_id = NEW.color_id 
            AND size_id = NEW.size_id;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        # Quantity tracking trigger
        """
        DROP TRIGGER IF EXISTS trigger_track_item_batch_quantity_changes ON ops.batches;
        CREATE TRIGGER trigger_track_item_batch_quantity_changes
            AFTER INSERT OR UPDATE ON ops.batches
            FOR EACH ROW
            EXECUTE FUNCTION ops.track_item_batch_quantity_changes();
        """,
        
        # Completion tracking function (updates last_completion_change in reporting schema)
        """
        CREATE OR REPLACE FUNCTION ops.track_item_batch_completion_changes()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.status != 'Completed' AND NEW.status = 'Completed' THEN
                UPDATE reporting.job_order_items_summary 
                SET last_completion_change = NOW()
                WHERE job_order_id = NEW.job_order_id 
                AND color_id = NEW.color_id
                AND size_id = NEW.size_id;
            END IF;
            RETURN NEW;
        EXCEPTION
            WHEN OTHERS THEN
                RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        # Completion tracking trigger
        """
        DROP TRIGGER IF EXISTS trigger_track_item_batch_completion_changes ON ops.batches;
        CREATE TRIGGER trigger_track_item_batch_completion_changes
            AFTER UPDATE ON ops.batches
            FOR EACH ROW
            EXECUTE FUNCTION ops.track_item_batch_completion_changes();
        """,
        # Rejection-resolution increment: updates batch_phase_history when a rejection-resolution increment is recorded
        """
        CREATE OR REPLACE FUNCTION ops.apply_rejection_resolution_increment(
            p_batch_id INTEGER,
            p_incremented_from_phase_id INTEGER,
            p_quantity INTEGER,
            p_status_at_increment VARCHAR(50)
        )
        RETURNS void AS $$
        DECLARE
            v_from_phase_type VARCHAR(50);
            v_from_phase_rank INTEGER;
            v_status_affects_in BOOLEAN := FALSE;
            v_status_affects_out BOOLEAN := FALSE;
        BEGIN
            SELECT type,
                   CASE type
                       WHEN 'cutting' THEN 1
                       WHEN 'sewing' THEN 2
                       WHEN 'qc' THEN 3
                       WHEN 'packaging' THEN 4
                       ELSE 5
                   END INTO v_from_phase_type, v_from_phase_rank
            FROM core.production_phases
            WHERE phase_id = p_incremented_from_phase_id;
            IF v_from_phase_type IS NULL THEN
                RETURN;
            END IF;
            -- Pending increments should behave like rejections:
            -- they affect previous phases but not the current phase \"in\" quantity.
            IF p_status_at_increment = 'Pending' THEN
                v_status_affects_out := TRUE;
            ELSIF p_status_at_increment = 'In Progress' THEN
                v_status_affects_out := TRUE;
            ELSIF p_status_at_increment = 'Completed' THEN
                v_status_affects_in := TRUE;
                v_status_affects_out := TRUE;
            END IF;
            UPDATE ops.batch_phase_history
            SET
                inspection_qty = CASE WHEN 1 <= v_from_phase_rank AND v_status_affects_in THEN COALESCE(inspection_qty, 0) + p_quantity ELSE inspection_qty END,
                sewing_in_qty = CASE WHEN 2 <= v_from_phase_rank AND v_status_affects_in THEN COALESCE(sewing_in_qty, 0) + p_quantity ELSE sewing_in_qty END,
                sewing_out_qty = CASE WHEN 2 <= v_from_phase_rank AND v_status_affects_out THEN COALESCE(sewing_out_qty, 0) + p_quantity ELSE sewing_out_qty END,
                qc_in_qty = CASE WHEN 3 <= v_from_phase_rank AND v_status_affects_in THEN COALESCE(qc_in_qty, 0) + p_quantity ELSE qc_in_qty END,
                qc_out_qty = CASE WHEN 3 <= v_from_phase_rank AND v_status_affects_out THEN COALESCE(qc_out_qty, 0) + p_quantity ELSE qc_out_qty END,
                packaging_in_qty = CASE WHEN 4 <= v_from_phase_rank AND v_status_affects_in THEN COALESCE(packaging_in_qty, 0) + p_quantity ELSE packaging_in_qty END,
                packaging_out_qty = CASE WHEN 4 <= v_from_phase_rank AND v_status_affects_out THEN COALESCE(packaging_out_qty, 0) + p_quantity ELSE packaging_out_qty END,
                last_updated = NOW()
            WHERE batch_id = p_batch_id;
        END;
        $$ LANGUAGE plpgsql;
        """,
    ]
    
    with engine.connect() as conn:
        for sql in functions_and_triggers:
            trans = conn.begin()
            try:
                conn.execute(text(sql))
                trans.commit()
                print(f"Created function/trigger successfully")
            except Exception as e:
                try:
                    trans.rollback()
                except:
                    pass
                print(f"Warning: Could not create function/trigger: {e}")

# Function to create batch phase history table and maintenance functions
def create_batch_phase_history_functions():
    """Create batch_phase_history table and functions to maintain it"""
    
    batch_phase_history_sql = [
        """
        CREATE TABLE IF NOT EXISTS ops.batch_phase_history (
            id SERIAL PRIMARY KEY,
            batch_id INTEGER NOT NULL REFERENCES ops.batches(batch_id) ON DELETE CASCADE,
            inspection_qty INTEGER DEFAULT 0,
            sewing_in_qty INTEGER DEFAULT 0,
            sewing_out_qty INTEGER DEFAULT 0,
            qc_in_qty INTEGER DEFAULT 0,
            qc_out_qty INTEGER DEFAULT 0,
            packaging_in_qty INTEGER DEFAULT 0,
            packaging_out_qty INTEGER DEFAULT 0,
            current_phase_type VARCHAR(50),
            quantity_at_phase INTEGER DEFAULT 0,
            status_at_phase VARCHAR(50),
            compensation BOOLEAN DEFAULT FALSE NOT NULL,
            entered_at TIMESTAMP DEFAULT NOW() NOT NULL,
            last_updated TIMESTAMP DEFAULT NOW() NOT NULL,
            CONSTRAINT batch_phase_history_batch_unique UNIQUE (batch_id)
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_batch_phase_history_batch_id ON ops.batch_phase_history(batch_id);
        """,
        """
        CREATE OR REPLACE FUNCTION ops.maintain_batch_phase_history()
        RETURNS trigger AS $$
        DECLARE
            v_phase_type VARCHAR(50);
            v_old_phase_type VARCHAR(50);
            v_phase_rank INTEGER;
            v_old_phase_rank INTEGER;
            v_current_qty INTEGER;
            v_rejected_qty INTEGER;
            v_original_qty INTEGER;
            v_phase_changed BOOLEAN;
            v_status_changed BOOLEAN;
            v_backward_movement BOOLEAN := FALSE;
            v_is_compensation BOOLEAN := FALSE;
            v_compensation_phase_id INTEGER;
            v_compensation_phase_rank INTEGER;
            v_old_quantity_at_phase INTEGER;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                DELETE FROM ops.batch_phase_history WHERE batch_id = OLD.batch_id;
                RETURN OLD;
            END IF;
            
            SELECT type,
                   CASE type
                       WHEN 'cutting' THEN 1
                       WHEN 'sewing' THEN 2
                       WHEN 'qc' THEN 3
                       WHEN 'packaging' THEN 4
                       ELSE 5
                   END INTO v_phase_type, v_phase_rank
            FROM core.production_phases
            WHERE phase_id = NEW.current_phase;
            
            IF v_phase_type IS NULL THEN
                RETURN NEW;
            END IF;
            
            SELECT phase_id INTO v_compensation_phase_id
            FROM ops.batch_compensations
            WHERE batch_id = NEW.batch_id
            LIMIT 1;
            
            IF v_compensation_phase_id IS NOT NULL THEN
                v_is_compensation := TRUE;
                SELECT CASE type
                           WHEN 'cutting' THEN 1
                           WHEN 'sewing' THEN 2
                           WHEN 'qc' THEN 3
                           WHEN 'packaging' THEN 4
                           ELSE 5
                       END INTO v_compensation_phase_rank
                FROM core.production_phases
                WHERE phase_id = v_compensation_phase_id;
            END IF;
            
            -- Get old phase type and rank if this is an UPDATE
            IF TG_OP = 'UPDATE' AND OLD.current_phase IS NOT NULL THEN
                SELECT type,
                       CASE type
                           WHEN 'cutting' THEN 1
                           WHEN 'sewing' THEN 2
                           WHEN 'qc' THEN 3
                           WHEN 'packaging' THEN 4
                           ELSE 5
                       END INTO v_old_phase_type, v_old_phase_rank
                FROM core.production_phases
                WHERE phase_id = OLD.current_phase;
            ELSE
                v_old_phase_type := NULL;
                v_old_phase_rank := NULL;
            END IF;
            
            -- Check if phase or status changed (for UPDATE operations)
            IF TG_OP = 'UPDATE' THEN
                v_phase_changed := (OLD.current_phase IS DISTINCT FROM NEW.current_phase);
                v_status_changed := (OLD.status IS DISTINCT FROM NEW.status);
                -- Detect backward movement: new phase rank < old phase rank
                v_backward_movement := (v_phase_changed AND v_old_phase_rank IS NOT NULL AND v_phase_rank < v_old_phase_rank);
            ELSE
                -- For INSERT operations, treat as changed
                v_phase_changed := TRUE;
                v_status_changed := TRUE;
                v_backward_movement := FALSE;
            END IF;
            
            v_current_qty := COALESCE(NEW.quantity, 0);
            SELECT COALESCE(SUM(quantity), 0) INTO v_rejected_qty
            FROM ops.single_rejections
            WHERE batch_id = NEW.batch_id AND is_resolved = FALSE;
            v_original_qty := v_current_qty + v_rejected_qty;
            
            -- Get the old quantity_at_phase BEFORE we update it
            -- This preserves the quantity that was used when entering the previous phase
            SELECT COALESCE(quantity_at_phase, 0) INTO v_old_quantity_at_phase
            FROM ops.batch_phase_history
            WHERE batch_id = NEW.batch_id;
            
            -- Insert or update the single row for this batch
            -- Always preserve existing values, only update relevant columns based on current phase and status
            INSERT INTO ops.batch_phase_history (
                batch_id,
                inspection_qty,
                sewing_in_qty,
                sewing_out_qty,
                qc_in_qty,
                qc_out_qty,
                packaging_in_qty,
                packaging_out_qty,
                current_phase_type,
                quantity_at_phase,
                status_at_phase,
                compensation,
                entered_at,
                last_updated
            )
            VALUES (
                NEW.batch_id,
                -- For compensation batches: Initialize all to 0, otherwise set based on phase/status
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'cutting' AND NEW.status = 'Completed' THEN v_current_qty ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'sewing' AND NEW.status = 'In Progress' THEN v_current_qty ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'sewing' AND NEW.status = 'Completed' THEN v_current_qty ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'qc' AND NEW.status = 'In Progress' THEN v_current_qty ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'qc' AND NEW.status = 'Completed' THEN v_current_qty ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'packaging' AND NEW.status = 'In Progress' THEN v_current_qty ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'packaging' AND NEW.status = 'Completed' THEN v_current_qty ELSE 0 END END,
                v_phase_type,
                v_current_qty,
                NEW.status,
                v_is_compensation,
                NOW(),
                NOW()
            )
            ON CONFLICT (batch_id) DO UPDATE SET
                -- Only update phase-specific quantities if phase or status changed
                -- If only quantity changed, preserve all phase-specific values
                -- IMPORTANT: Check OLD phase/status for out quantities since phase transitions happen BEFORE this trigger
                inspection_qty = CASE 
                    -- Compensation batches: preserve existing (may be negative after rejections)
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 1 THEN COALESCE(batch_phase_history.inspection_qty, 0)
                    -- If currently in cutting with Completed status
                    -- Use CURRENT quantity (v_current_qty) because quantity may have been incremented while in progress
                    WHEN (v_phase_changed OR v_status_changed) AND v_phase_type = 'cutting' AND NEW.status = 'Completed'
                        THEN v_current_qty
                    -- If phase changed from cutting to sewing (cutting was completed and auto-transitioned)
                    -- Use CURRENT quantity because quantity may have been incremented while in progress
                    WHEN v_phase_changed AND v_old_phase_type IS NOT NULL AND v_old_phase_type = 'cutting' 
                        AND v_phase_type = 'sewing' THEN v_current_qty
                    -- If moved back to cutting (backward movement), clear inspection_qty
                    WHEN v_backward_movement AND v_phase_type = 'cutting' THEN 0
                    -- If currently in cutting with In Progress status (not completed), clear inspection_qty
                    WHEN (v_phase_changed OR v_status_changed) AND v_phase_type = 'cutting' AND NEW.status = 'In Progress' THEN 0
                    -- Preserve existing value if already set
                    ELSE COALESCE(batch_phase_history.inspection_qty, 0)
                END,
                sewing_in_qty = CASE 
                    -- Compensation batches: preserve existing (may be negative after rejections)
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 2 THEN COALESCE(batch_phase_history.sewing_in_qty, 0)
                    -- Backward movement: Clear if moved to cutting or earlier (rank < 2)
                    WHEN v_backward_movement AND v_phase_rank < 2 THEN 0
                    -- If currently in sewing with In Progress status (only for non-compensation batches, only on phase change, not status change)
                    WHEN NOT v_is_compensation AND v_phase_changed AND v_phase_type = 'sewing' AND NEW.status = 'In Progress' THEN v_current_qty
                    -- If batch moved to qc/packaging, it must have been in sewing, so set sewing_in_qty if not already set (only for non-compensation batches)
                    -- Use old quantity_at_phase to preserve the quantity from when entering the previous phase
                    WHEN NOT v_is_compensation AND v_phase_changed AND v_phase_type IN ('qc', 'packaging') 
                        AND COALESCE(batch_phase_history.sewing_in_qty, 0) = 0
                        THEN COALESCE(v_old_quantity_at_phase, batch_phase_history.quantity_at_phase, v_current_qty)
                    -- Preserve existing value if already set
                    ELSE COALESCE(batch_phase_history.sewing_in_qty, 0)
                END,
                sewing_out_qty = CASE 
                    -- Compensation batches: preserve existing (may be negative after rejections)
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) > 2 THEN COALESCE(batch_phase_history.sewing_out_qty, 0)
                    -- If currently in sewing with Completed status (before auto-transition, but this is rare)
                    -- Use CURRENT quantity (v_current_qty) because quantity may have been incremented while in progress
                    WHEN (v_phase_changed OR v_status_changed) AND v_phase_type = 'sewing' AND NEW.status = 'Completed'
                        THEN v_current_qty
                    -- CRITICAL: If phase changed from sewing to qc/packaging, sewing was completed (forward transition)
                    -- Use CURRENT quantity because quantity may have been incremented while in progress
                    WHEN v_phase_changed AND v_old_phase_type IS NOT NULL AND v_old_phase_type = 'sewing' 
                        AND v_phase_type IN ('qc', 'packaging')
                        THEN v_current_qty
                    -- If batch is in qc/packaging with Completed status (manually set), infer sewing was completed
                    -- Use CURRENT quantity because quantity may have been incremented while in progress
                    WHEN (v_phase_changed OR v_status_changed) AND v_phase_type IN ('qc', 'packaging') AND NEW.status = 'Completed' 
                        AND COALESCE(batch_phase_history.sewing_out_qty, 0) = 0
                        THEN v_current_qty
                    -- If currently in sewing (and not Completed), out_qty must be 0 (not completed if we're in this phase)
                    WHEN v_phase_type = 'sewing' THEN 0
                    -- Backward movement: Clear if moved to cutting or earlier (rank < 2)
                    WHEN v_backward_movement AND v_phase_rank < 2 THEN 0
                    -- Preserve existing value if already set
                    ELSE COALESCE(batch_phase_history.sewing_out_qty, 0)
                END,
                qc_in_qty = CASE 
                    -- Compensation batches: preserve existing (may be negative after rejections)
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 3 THEN COALESCE(batch_phase_history.qc_in_qty, 0)
                    -- Backward movement: Clear if moved to sewing or earlier (rank <= 2)
                    WHEN v_backward_movement AND v_phase_rank <= 2 THEN 0
                    -- If currently in qc with In Progress status (only for non-compensation batches, only on phase change, not status change)
                    WHEN NOT v_is_compensation AND v_phase_changed AND v_phase_type = 'qc' AND NEW.status = 'In Progress' THEN v_current_qty
                    -- If batch moved to packaging, it must have been in qc, so set qc_in_qty if not already set (only for non-compensation batches)
                    -- Use old quantity_at_phase to preserve the quantity from when entering QC
                    WHEN NOT v_is_compensation AND v_phase_changed AND v_phase_type = 'packaging' 
                        AND COALESCE(batch_phase_history.qc_in_qty, 0) = 0
                        THEN COALESCE(v_old_quantity_at_phase, batch_phase_history.quantity_at_phase, v_current_qty)
                    -- Preserve existing value if already set
                    ELSE COALESCE(batch_phase_history.qc_in_qty, 0)
                END,
                qc_out_qty = CASE 
                    -- Compensation batches: preserve existing (may be negative after rejections)
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) > 3 THEN COALESCE(batch_phase_history.qc_out_qty, 0)
                    -- If currently in qc with Completed status (before auto-transition, but this is rare)
                    -- Use CURRENT quantity (v_current_qty) because quantity may have been incremented while in progress
                    WHEN (v_phase_changed OR v_status_changed) AND v_phase_type = 'qc' AND NEW.status = 'Completed'
                        THEN v_current_qty
                    -- CRITICAL: If phase changed from qc to packaging, qc was completed (forward transition)
                    -- Use CURRENT quantity because quantity may have been incremented while in progress
                    WHEN v_phase_changed AND v_old_phase_type IS NOT NULL AND v_old_phase_type = 'qc' 
                        AND v_phase_type = 'packaging'
                        THEN v_current_qty
                    -- If batch is in packaging with Completed status (manually set), infer qc was completed
                    -- Use CURRENT quantity because quantity may have been incremented while in progress
                    WHEN (v_phase_changed OR v_status_changed) AND v_phase_type = 'packaging' AND NEW.status = 'Completed' 
                        AND COALESCE(batch_phase_history.qc_out_qty, 0) = 0
                        THEN v_current_qty
                    -- If currently in qc (and not Completed), out_qty must be 0 (not completed if we're in this phase)
                    WHEN v_phase_type = 'qc' THEN 0
                    -- Backward movement: Clear if moved to sewing or earlier (rank <= 2)
                    WHEN v_backward_movement AND v_phase_rank <= 2 THEN 0
                    -- Preserve existing value if already set
                    ELSE COALESCE(batch_phase_history.qc_out_qty, 0)
                END,
                packaging_in_qty = CASE 
                    -- Compensation batches: preserve existing (may be negative after rejections)
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 4 THEN COALESCE(batch_phase_history.packaging_in_qty, 0)
                    -- Backward movement: Clear if moved to qc or earlier (rank <= 3)
                    WHEN v_backward_movement AND v_phase_rank <= 3 THEN 0
                    -- If currently in packaging with In Progress status (only for non-compensation batches, only on phase change, not status change)
                    WHEN NOT v_is_compensation AND v_phase_changed AND v_phase_type = 'packaging' AND NEW.status = 'In Progress' THEN v_current_qty
                    -- Preserve existing value if already set
                    ELSE COALESCE(batch_phase_history.packaging_in_qty, 0)
                END,
                packaging_out_qty = CASE 
                    -- Compensation batches: preserve existing (may be negative after rejections)
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) > 4 THEN COALESCE(batch_phase_history.packaging_out_qty, 0)
                    -- If currently in packaging with Completed status
                    -- Use CURRENT quantity (v_current_qty) because quantity may have been incremented while in progress
                    WHEN (v_phase_changed OR v_status_changed) AND v_phase_type = 'packaging' AND NEW.status = 'Completed'
                        THEN v_current_qty
                    -- If currently in packaging (and not Completed), out_qty must be 0 (not completed if we're in this phase)
                    WHEN v_phase_type = 'packaging' THEN 0
                    -- Backward movement: Clear if moved to qc or earlier (rank <= 3)
                    WHEN v_backward_movement AND v_phase_rank <= 3 THEN 0
                    -- Preserve existing value if already set
                    ELSE COALESCE(batch_phase_history.packaging_out_qty, 0)
                END,
                current_phase_type = CASE WHEN v_phase_changed THEN v_phase_type ELSE batch_phase_history.current_phase_type END,
                quantity_at_phase = CASE
                    -- Only update quantity_at_phase when entering a NEW phase (forward movement)
                    -- Preserve existing quantity_at_phase for backward movements and status-only changes
                    WHEN v_phase_changed AND NOT v_backward_movement THEN v_current_qty
                    ELSE batch_phase_history.quantity_at_phase
                END,
                status_at_phase = CASE WHEN v_status_changed THEN NEW.status ELSE batch_phase_history.status_at_phase END,
                compensation = CASE WHEN v_is_compensation THEN TRUE ELSE COALESCE(batch_phase_history.compensation, FALSE) END,
                last_updated = CASE WHEN (v_phase_changed OR v_status_changed) AND NEW.status != 'Pending' THEN NOW() ELSE batch_phase_history.last_updated END;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """,
        """
        DROP TRIGGER IF EXISTS trigger_maintain_batch_phase_history ON ops.batches;
        """,
        """
        CREATE TRIGGER trigger_maintain_batch_phase_history
            AFTER INSERT OR UPDATE ON ops.batches
            FOR EACH ROW
            EXECUTE FUNCTION ops.maintain_batch_phase_history();
        """,
        """
        CREATE OR REPLACE FUNCTION ops.sync_batch_phase_history_for_batch(p_batch_id INTEGER)
        RETURNS void AS $$
        DECLARE
            v_batch RECORD;
            v_phase_type VARCHAR(50);
            v_current_qty INTEGER;
            v_rejected_qty INTEGER;
            v_original_qty INTEGER;
            v_is_compensation BOOLEAN := FALSE;
            v_compensation_phase_id INTEGER;
            v_compensation_phase_rank INTEGER;
        BEGIN
            SELECT b.*, pp.type as phase_type
            INTO v_batch
            FROM ops.batches b
            JOIN core.production_phases pp ON b.current_phase = pp.phase_id
            WHERE b.batch_id = p_batch_id;
            
            IF v_batch.batch_id IS NULL OR v_batch.phase_type IS NULL THEN
                RETURN;
            END IF;
            
            -- Check if this is a compensation batch
            SELECT phase_id INTO v_compensation_phase_id
            FROM ops.batch_compensations
            WHERE batch_id = p_batch_id
            LIMIT 1;
            
            IF v_compensation_phase_id IS NOT NULL THEN
                v_is_compensation := TRUE;
                SELECT CASE type
                           WHEN 'cutting' THEN 1
                           WHEN 'sewing' THEN 2
                           WHEN 'qc' THEN 3
                           WHEN 'packaging' THEN 4
                           ELSE 5
                       END INTO v_compensation_phase_rank
                FROM core.production_phases
                WHERE phase_id = v_compensation_phase_id;
            END IF;
            
            v_phase_type := v_batch.phase_type;
            v_current_qty := COALESCE(v_batch.quantity, 0);
            SELECT COALESCE(SUM(quantity), 0) INTO v_rejected_qty
            FROM ops.single_rejections
            WHERE batch_id = p_batch_id AND is_resolved = FALSE;
            v_original_qty := v_current_qty + v_rejected_qty;
            
            INSERT INTO ops.batch_phase_history (
                batch_id,
                inspection_qty,
                sewing_in_qty,
                sewing_out_qty,
                qc_in_qty,
                qc_out_qty,
                packaging_in_qty,
                packaging_out_qty,
                current_phase_type,
                quantity_at_phase,
                status_at_phase,
                compensation,
                entered_at,
                last_updated
            )
            VALUES (
                p_batch_id,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'cutting' AND v_batch.status = 'Completed' THEN v_current_qty ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'cutting' THEN 0
                     WHEN v_phase_type = 'sewing' AND v_batch.status = 'In Progress' THEN v_current_qty 
                     WHEN v_phase_type IN ('qc', 'packaging') THEN v_current_qty
                     ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'sewing' THEN 0
                     WHEN v_phase_type IN ('qc', 'packaging') AND v_batch.status = 'Completed' THEN v_current_qty
                     ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type IN ('cutting', 'sewing') THEN 0
                     WHEN v_phase_type = 'qc' AND v_batch.status = 'In Progress' THEN v_current_qty 
                     WHEN v_phase_type = 'packaging' THEN v_current_qty
                     ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type IN ('cutting', 'sewing', 'qc') THEN 0
                     WHEN v_phase_type = 'packaging' AND v_batch.status = 'Completed' THEN v_current_qty
                     ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type IN ('cutting', 'sewing', 'qc') THEN 0
                     WHEN v_phase_type = 'packaging' AND v_batch.status = 'In Progress' THEN v_current_qty 
                     ELSE 0 END END,
                CASE WHEN v_is_compensation THEN 0 ELSE CASE WHEN v_phase_type = 'packaging' THEN 0
                     ELSE 0 END END,
                v_phase_type,
                v_current_qty,
                v_batch.status,
                v_is_compensation,
                NOW(),
                NOW()
            )
            ON CONFLICT (batch_id) DO UPDATE SET
                inspection_qty = CASE 
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 1 THEN COALESCE(batch_phase_history.inspection_qty, 0)
                    WHEN v_phase_type = 'cutting' AND v_batch.status = 'Completed' THEN v_current_qty
                    ELSE batch_phase_history.inspection_qty
                END,
                sewing_in_qty = CASE 
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 2 THEN COALESCE(batch_phase_history.sewing_in_qty, 0)
                    WHEN v_phase_type = 'cutting' THEN 0
                    -- Only update sewing_in_qty when entering sewing phase, not when already past it
                    -- Preserve existing values once set - never update with current quantity for batches already past sewing
                    WHEN NOT v_is_compensation AND v_phase_type = 'sewing' AND v_batch.status = 'In Progress' 
                        AND (batch_phase_history.sewing_in_qty = 0 OR batch_phase_history.sewing_in_qty IS NULL) THEN v_current_qty
                    -- Always preserve existing sewing_in_qty once it's been set
                    ELSE batch_phase_history.sewing_in_qty
                END,
                sewing_out_qty = CASE 
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) > 2 THEN COALESCE(batch_phase_history.sewing_out_qty, 0)
                    WHEN v_phase_type = 'sewing' THEN 0
                    WHEN v_phase_type = 'cutting' THEN 0
                    WHEN NOT v_is_compensation AND v_phase_type IN ('qc', 'packaging') AND v_batch.status = 'Completed' THEN 
                        CASE WHEN batch_phase_history.sewing_out_qty = 0 OR batch_phase_history.sewing_out_qty IS NULL 
                             THEN v_current_qty 
                             ELSE batch_phase_history.sewing_out_qty 
                        END
                    ELSE batch_phase_history.sewing_out_qty
                END,
                qc_in_qty = CASE 
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 3 THEN COALESCE(batch_phase_history.qc_in_qty, 0)
                    WHEN v_phase_type IN ('cutting', 'sewing') THEN 0
                    -- Only update qc_in_qty when entering qc phase, not when already past it
                    -- Preserve existing values once set - never update with current quantity for batches already past qc
                    WHEN NOT v_is_compensation AND v_phase_type = 'qc' AND v_batch.status = 'In Progress' 
                        AND (batch_phase_history.qc_in_qty = 0 OR batch_phase_history.qc_in_qty IS NULL) THEN v_current_qty
                    -- Always preserve existing qc_in_qty once it's been set
                    ELSE batch_phase_history.qc_in_qty
                END,
                qc_out_qty = CASE 
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) > 3 THEN COALESCE(batch_phase_history.qc_out_qty, 0)
                    WHEN v_phase_type = 'qc' THEN 0
                    WHEN v_phase_type IN ('cutting', 'sewing') THEN 0
                    WHEN NOT v_is_compensation AND v_phase_type = 'packaging' AND v_batch.status = 'Completed' THEN 
                        CASE WHEN batch_phase_history.qc_out_qty = 0 OR batch_phase_history.qc_out_qty IS NULL 
                             THEN v_current_qty 
                             ELSE batch_phase_history.qc_out_qty 
                        END
                    ELSE batch_phase_history.qc_out_qty
                END,
                packaging_in_qty = CASE 
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) >= 4 THEN COALESCE(batch_phase_history.packaging_in_qty, 0)
                    WHEN v_phase_type IN ('cutting', 'sewing', 'qc') THEN 0
                    WHEN NOT v_is_compensation AND v_phase_type = 'packaging' AND v_batch.status = 'In Progress' THEN v_current_qty
                    ELSE batch_phase_history.packaging_in_qty
                END,
                packaging_out_qty = CASE 
                    WHEN v_is_compensation AND COALESCE(v_compensation_phase_rank, 0) > 4 THEN COALESCE(batch_phase_history.packaging_out_qty, 0)
                    WHEN v_phase_type = 'packaging' THEN 0
                    WHEN v_phase_type IN ('cutting', 'sewing', 'qc') THEN 0
                    ELSE batch_phase_history.packaging_out_qty
                END,
                current_phase_type = v_phase_type,
                -- Only update quantity_at_phase if phase changed (not just quantity update)
                -- This function is called to sync, so preserve existing quantity_at_phase if phase hasn't changed
                quantity_at_phase = CASE 
                    WHEN v_phase_type != COALESCE(batch_phase_history.current_phase_type, '') THEN v_current_qty
                    ELSE batch_phase_history.quantity_at_phase
                END,
                status_at_phase = v_batch.status,
                compensation = CASE WHEN v_is_compensation THEN TRUE ELSE COALESCE(batch_phase_history.compensation, FALSE) END,
                last_updated = CASE WHEN v_batch.status != 'Pending' THEN NOW() ELSE batch_phase_history.last_updated END;
        END;
        $$ LANGUAGE plpgsql;
        """,
        """
        CREATE OR REPLACE FUNCTION ops.sync_all_batch_phase_history()
        RETURNS void AS $$
        BEGIN
            INSERT INTO ops.batch_phase_history (
                batch_id,
                inspection_qty,
                sewing_in_qty,
                sewing_out_qty,
                qc_in_qty,
                qc_out_qty,
                packaging_in_qty,
                packaging_out_qty,
                current_phase_type,
                quantity_at_phase,
                status_at_phase,
                compensation,
                entered_at,
                last_updated
            )
            SELECT 
                b.batch_id,
                CASE WHEN bc.batch_id IS NOT NULL THEN 0
                     WHEN pp.type = 'cutting' AND b.status = 'Completed' THEN b.quantity
                ELSE 0 END as inspection_qty,
                CASE WHEN bc.batch_id IS NOT NULL THEN 0
                     WHEN pp.type = 'cutting' THEN 0
                     WHEN pp.type = 'sewing' AND b.status = 'In Progress' THEN b.quantity 
                     WHEN pp.type IN ('qc', 'packaging') THEN b.quantity
                     ELSE 0 END as sewing_in_qty,
                CASE WHEN bc.batch_id IS NOT NULL THEN 0
                     WHEN pp.type = 'sewing' THEN 0
                     WHEN pp.type IN ('qc', 'packaging') AND b.status = 'Completed' THEN b.quantity
                     ELSE 0 END as sewing_out_qty,
                CASE WHEN bc.batch_id IS NOT NULL THEN 0
                     WHEN pp.type IN ('cutting', 'sewing') THEN 0
                     WHEN pp.type = 'qc' AND b.status = 'In Progress' THEN b.quantity 
                     WHEN pp.type = 'packaging' THEN b.quantity
                     ELSE 0 END as qc_in_qty,
                CASE WHEN bc.batch_id IS NOT NULL THEN 0
                     WHEN pp.type IN ('cutting', 'sewing', 'qc') THEN 0
                     WHEN pp.type = 'packaging' AND b.status = 'Completed' THEN b.quantity
                     ELSE 0 END as qc_out_qty,
                CASE WHEN bc.batch_id IS NOT NULL THEN 0
                     WHEN pp.type IN ('cutting', 'sewing', 'qc') THEN 0
                     WHEN pp.type = 'packaging' AND b.status = 'In Progress' THEN b.quantity 
                     ELSE 0 END as packaging_in_qty,
                CASE WHEN bc.batch_id IS NOT NULL THEN 0
                     WHEN pp.type = 'packaging' THEN 0
                     ELSE 0 END as packaging_out_qty,
                pp.type as current_phase_type,
                b.quantity as quantity_at_phase,
                b.status as status_at_phase,
                CASE WHEN bc.batch_id IS NOT NULL THEN TRUE ELSE FALSE END as compensation,
                b.last_updated as entered_at,
                NOW() as last_updated
            FROM ops.batches b
            JOIN core.production_phases pp ON b.current_phase = pp.phase_id
            LEFT JOIN ops.batch_compensations bc ON b.batch_id = bc.batch_id
            WHERE b.status != 'Pending'
            ON CONFLICT (batch_id) DO UPDATE SET
                inspection_qty = CASE 
                    WHEN EXISTS (SELECT 1 FROM ops.batch_compensations bc2 
                                 JOIN core.production_phases pp2 ON bc2.phase_id = pp2.phase_id
                                 WHERE bc2.batch_id = EXCLUDED.batch_id 
                                 AND CASE pp2.type WHEN 'cutting' THEN 1 WHEN 'sewing' THEN 2 WHEN 'qc' THEN 3 WHEN 'packaging' THEN 4 ELSE 5 END >= 1)
                    THEN COALESCE(batch_phase_history.inspection_qty, 0)
                    WHEN EXCLUDED.current_phase_type = 'cutting' AND EXCLUDED.status_at_phase = 'Completed' THEN EXCLUDED.inspection_qty
                    ELSE batch_phase_history.inspection_qty
                END,
                sewing_in_qty = CASE 
                    WHEN EXISTS (SELECT 1 FROM ops.batch_compensations bc2 
                                 JOIN core.production_phases pp2 ON bc2.phase_id = pp2.phase_id
                                 WHERE bc2.batch_id = EXCLUDED.batch_id 
                                 AND CASE pp2.type WHEN 'cutting' THEN 1 WHEN 'sewing' THEN 2 WHEN 'qc' THEN 3 WHEN 'packaging' THEN 4 ELSE 5 END >= 2)
                    THEN COALESCE(batch_phase_history.sewing_in_qty, 0)
                    WHEN EXCLUDED.current_phase_type = 'cutting' THEN 0
                    -- Only set sewing_in_qty when entering sewing, preserve existing values once set
                    WHEN EXCLUDED.current_phase_type = 'sewing' AND EXCLUDED.status_at_phase = 'In Progress' 
                        AND (batch_phase_history.sewing_in_qty = 0 OR batch_phase_history.sewing_in_qty IS NULL) THEN EXCLUDED.sewing_in_qty
                    -- Always preserve existing sewing_in_qty for batches already past sewing phase
                    ELSE batch_phase_history.sewing_in_qty
                END,
                sewing_out_qty = CASE 
                    WHEN EXISTS (SELECT 1 FROM ops.batch_compensations bc2 
                                 JOIN core.production_phases pp2 ON bc2.phase_id = pp2.phase_id
                                 WHERE bc2.batch_id = EXCLUDED.batch_id 
                                 AND CASE pp2.type WHEN 'cutting' THEN 1 WHEN 'sewing' THEN 2 WHEN 'qc' THEN 3 WHEN 'packaging' THEN 4 ELSE 5 END > 2)
                    THEN COALESCE(batch_phase_history.sewing_out_qty, 0)
                    WHEN EXCLUDED.current_phase_type = 'sewing' THEN 0
                    WHEN EXCLUDED.current_phase_type = 'cutting' THEN 0
                    WHEN EXCLUDED.current_phase_type IN ('qc', 'packaging') AND EXCLUDED.status_at_phase = 'Completed' THEN EXCLUDED.sewing_out_qty
                    ELSE batch_phase_history.sewing_out_qty
                END,
                qc_in_qty = CASE 
                    WHEN EXISTS (SELECT 1 FROM ops.batch_compensations bc2 
                                 JOIN core.production_phases pp2 ON bc2.phase_id = pp2.phase_id
                                 WHERE bc2.batch_id = EXCLUDED.batch_id 
                                 AND CASE pp2.type WHEN 'cutting' THEN 1 WHEN 'sewing' THEN 2 WHEN 'qc' THEN 3 WHEN 'packaging' THEN 4 ELSE 5 END >= 3)
                    THEN COALESCE(batch_phase_history.qc_in_qty, 0)
                    WHEN EXCLUDED.current_phase_type IN ('cutting', 'sewing') THEN 0
                    -- Only set qc_in_qty when entering qc, preserve existing values once set
                    WHEN EXCLUDED.current_phase_type = 'qc' AND EXCLUDED.status_at_phase = 'In Progress' 
                        AND (batch_phase_history.qc_in_qty = 0 OR batch_phase_history.qc_in_qty IS NULL) THEN EXCLUDED.qc_in_qty
                    -- Always preserve existing qc_in_qty for batches already past qc phase
                    ELSE batch_phase_history.qc_in_qty
                END,
                qc_out_qty = CASE 
                    WHEN EXISTS (SELECT 1 FROM ops.batch_compensations bc2 
                                 JOIN core.production_phases pp2 ON bc2.phase_id = pp2.phase_id
                                 WHERE bc2.batch_id = EXCLUDED.batch_id 
                                 AND CASE pp2.type WHEN 'cutting' THEN 1 WHEN 'sewing' THEN 2 WHEN 'qc' THEN 3 WHEN 'packaging' THEN 4 ELSE 5 END > 3)
                    THEN COALESCE(batch_phase_history.qc_out_qty, 0)
                    WHEN EXCLUDED.current_phase_type = 'qc' THEN 0
                    WHEN EXCLUDED.current_phase_type IN ('cutting', 'sewing') THEN 0
                    WHEN EXCLUDED.current_phase_type = 'packaging' AND EXCLUDED.status_at_phase = 'Completed' THEN EXCLUDED.qc_out_qty
                    ELSE batch_phase_history.qc_out_qty
                END,
                packaging_in_qty = CASE 
                    WHEN EXISTS (SELECT 1 FROM ops.batch_compensations bc2 
                                 JOIN core.production_phases pp2 ON bc2.phase_id = pp2.phase_id
                                 WHERE bc2.batch_id = EXCLUDED.batch_id 
                                 AND CASE pp2.type WHEN 'cutting' THEN 1 WHEN 'sewing' THEN 2 WHEN 'qc' THEN 3 WHEN 'packaging' THEN 4 ELSE 5 END >= 4)
                    THEN COALESCE(batch_phase_history.packaging_in_qty, 0)
                    WHEN EXCLUDED.current_phase_type IN ('cutting', 'sewing', 'qc') THEN 0
                    WHEN EXCLUDED.current_phase_type = 'packaging' AND EXCLUDED.status_at_phase = 'In Progress' THEN EXCLUDED.packaging_in_qty
                    ELSE batch_phase_history.packaging_in_qty
                END,
                packaging_out_qty = CASE 
                    WHEN EXISTS (SELECT 1 FROM ops.batch_compensations bc2 
                                 JOIN core.production_phases pp2 ON bc2.phase_id = pp2.phase_id
                                 WHERE bc2.batch_id = EXCLUDED.batch_id 
                                 AND CASE pp2.type WHEN 'cutting' THEN 1 WHEN 'sewing' THEN 2 WHEN 'qc' THEN 3 WHEN 'packaging' THEN 4 ELSE 5 END > 4)
                    THEN COALESCE(batch_phase_history.packaging_out_qty, 0)
                    WHEN EXCLUDED.current_phase_type = 'packaging' THEN 0
                    WHEN EXCLUDED.current_phase_type IN ('cutting', 'sewing', 'qc') THEN 0
                    ELSE batch_phase_history.packaging_out_qty
                END,
                current_phase_type = EXCLUDED.current_phase_type,
                -- Only update quantity_at_phase if phase changed (not just quantity update)
                quantity_at_phase = CASE 
                    WHEN EXCLUDED.current_phase_type != COALESCE(batch_phase_history.current_phase_type, '') THEN EXCLUDED.quantity_at_phase
                    ELSE batch_phase_history.quantity_at_phase
                END,
                status_at_phase = EXCLUDED.status_at_phase,
                compensation = EXCLUDED.compensation,
                last_updated = NOW();
        END;
        $$ LANGUAGE plpgsql;
        """,
        """
        CREATE OR REPLACE FUNCTION ops.update_batch_phase_history_on_rejection(
            p_batch_id INTEGER,
            p_rejected_from_phase_id INTEGER,
            p_return_to_phase_id INTEGER,
            p_quantity INTEGER
        )
        RETURNS void AS $$
        DECLARE
            v_from_phase_type VARCHAR(50);
            v_to_phase_type VARCHAR(50);
            v_from_phase_rank INTEGER;
            v_to_phase_rank INTEGER;
            v_is_compensation BOOLEAN := FALSE;
        BEGIN
            SELECT type,
                   CASE type
                       WHEN 'cutting' THEN 1
                       WHEN 'sewing' THEN 2
                       WHEN 'qc' THEN 3
                       WHEN 'packaging' THEN 4
                       ELSE 5
                   END INTO v_from_phase_type, v_from_phase_rank
            FROM core.production_phases
            WHERE phase_id = p_rejected_from_phase_id;
            
            IF p_return_to_phase_id IS NULL THEN
                RETURN;
            END IF;
            
            SELECT type,
                   CASE type
                       WHEN 'cutting' THEN 1
                       WHEN 'sewing' THEN 2
                       WHEN 'qc' THEN 3
                       WHEN 'packaging' THEN 4
                       ELSE 5
                   END INTO v_to_phase_type, v_to_phase_rank
            FROM core.production_phases
            WHERE phase_id = p_return_to_phase_id;
            
            IF v_from_phase_type IS NULL OR v_to_phase_type IS NULL THEN
                RETURN;
            END IF;
            
            SELECT EXISTS(SELECT 1 FROM ops.batch_compensations WHERE batch_id = p_batch_id) INTO v_is_compensation;
            
            -- Compensation batches: allow negative so sums across batches stay correct; non-compensation floor at 0.
            UPDATE ops.batch_phase_history
            SET
                inspection_qty = CASE 
                    WHEN v_to_phase_type = 'cutting' THEN CASE WHEN v_is_compensation THEN COALESCE(inspection_qty, 0) - p_quantity ELSE GREATEST(COALESCE(inspection_qty, 0) - p_quantity, 0) END
                    ELSE inspection_qty
                END,
                sewing_in_qty = CASE 
                    WHEN v_from_phase_type = 'sewing' THEN CASE WHEN v_is_compensation THEN COALESCE(sewing_in_qty, 0) - p_quantity ELSE GREATEST(COALESCE(sewing_in_qty, 0) - p_quantity, 0) END
                    WHEN v_from_phase_rank > 2 AND v_to_phase_rank < 2 THEN CASE WHEN v_is_compensation THEN COALESCE(sewing_in_qty, 0) - p_quantity ELSE GREATEST(COALESCE(sewing_in_qty, 0) - p_quantity, 0) END
                    ELSE sewing_in_qty
                END,
                sewing_out_qty = CASE 
                    WHEN v_to_phase_type = 'sewing' THEN CASE WHEN v_is_compensation THEN COALESCE(sewing_out_qty, 0) - p_quantity ELSE GREATEST(COALESCE(sewing_out_qty, 0) - p_quantity, 0) END
                    WHEN v_from_phase_rank > 2 AND v_to_phase_rank < 2 THEN CASE WHEN v_is_compensation THEN COALESCE(sewing_out_qty, 0) - p_quantity ELSE GREATEST(COALESCE(sewing_out_qty, 0) - p_quantity, 0) END
                    ELSE sewing_out_qty
                END,
                qc_in_qty = CASE 
                    WHEN v_from_phase_rank > 3 AND v_to_phase_rank < 3 THEN CASE WHEN v_is_compensation THEN COALESCE(qc_in_qty, 0) - p_quantity ELSE GREATEST(COALESCE(qc_in_qty, 0) - p_quantity, 0) END
                    ELSE qc_in_qty
                END,
                qc_out_qty = CASE 
                    WHEN v_to_phase_type = 'qc' THEN CASE WHEN v_is_compensation THEN COALESCE(qc_out_qty, 0) - p_quantity ELSE GREATEST(COALESCE(qc_out_qty, 0) - p_quantity, 0) END
                    WHEN v_from_phase_rank > 3 AND v_to_phase_rank < 3 THEN CASE WHEN v_is_compensation THEN COALESCE(qc_out_qty, 0) - p_quantity ELSE GREATEST(COALESCE(qc_out_qty, 0) - p_quantity, 0) END
                    ELSE qc_out_qty
                END,
                packaging_in_qty = CASE 
                    WHEN v_from_phase_type = 'packaging' THEN CASE WHEN v_is_compensation THEN COALESCE(packaging_in_qty, 0) - p_quantity ELSE GREATEST(COALESCE(packaging_in_qty, 0) - p_quantity, 0) END
                    ELSE packaging_in_qty
                END,
                packaging_out_qty = CASE 
                    WHEN v_to_phase_type = 'packaging' THEN CASE WHEN v_is_compensation THEN COALESCE(packaging_out_qty, 0) - p_quantity ELSE GREATEST(COALESCE(packaging_out_qty, 0) - p_quantity, 0) END
                    ELSE packaging_out_qty
                END,
                last_updated = NOW()
            WHERE batch_id = p_batch_id;
        END;
        $$ LANGUAGE plpgsql;
        """
    ]
    
    with engine.connect() as conn:
        for sql in batch_phase_history_sql:
            trans = conn.begin()
            try:
                conn.execute(text(sql))
                trans.commit()
                print(f"Created batch phase history function/table successfully")
            except Exception as e:
                try:
                    trans.rollback()
                except:
                    pass
                print(f"Warning: Could not create batch phase history function/table: {e}")
                import traceback
                print(traceback.format_exc())

# Function to create the Net-State Accounting summary refresh functions
def create_summary_refresh_functions():
    """Create PostgreSQL functions for Net-State Accounting summary refresh
    
    Uses CURRENT STATE approach: The batch's current_phase and status determine
    which summary fields include its quantity. This ensures backward movements
    properly "erase" the batch from subsequent phases.
    """
    
    summary_functions = [
        """
        DROP FUNCTION IF EXISTS ops.refresh_job_order_items_summary_for_jobs(INTEGER[]);
        """,
        
        """
        CREATE OR REPLACE FUNCTION ops.refresh_job_order_items_summary_for_jobs(p_job_order_ids INTEGER[])
        RETURNS void AS $$
        DECLARE
            v_job_order_id INTEGER;
        BEGIN
            FOREACH v_job_order_id IN ARRAY p_job_order_ids
            LOOP
                PERFORM ops.sync_all_batch_phase_history();
                
                WITH phase_sequence AS (
                    SELECT 
                        phase_id,
                        type,
                        sequence_order,
                        CASE type
                            WHEN 'cutting' THEN 1
                            WHEN 'sewing' THEN 2
                            WHEN 'qc' THEN 3
                            WHEN 'packaging' THEN 4
                            ELSE 5
                        END AS phase_rank
                    FROM core.production_phases
                ),
                
                batch_rejections AS (
                    SELECT 
                        sr.batch_id,
                        MAX(ps_from.phase_rank) AS rejected_from_rank,
                        MAX(ps_from.type) AS rejected_from_type,
                        MAX(COALESCE(ps_to.phase_rank, 999)) AS return_to_rank,
                        MAX(COALESCE(ps_to.type, '')) AS return_to_type,
                        SUM(sr.quantity) AS total_rejected_qty
                    FROM ops.single_rejections sr
                    JOIN phase_sequence ps_from ON sr.rejected_from_phase_id = ps_from.phase_id
                    LEFT JOIN phase_sequence ps_to ON sr.return_to_phase_id = ps_to.phase_id
                    WHERE sr.is_resolved = FALSE
                        AND EXISTS (
                            SELECT 1 FROM ops.batches b 
                            WHERE b.batch_id = sr.batch_id 
                            AND b.job_order_id = v_job_order_id
                        )
                    GROUP BY sr.batch_id
                ),
                
                batch_phase_history_aggregates AS (
                    SELECT 
                        b.job_order_id,
                        b.color_id,
                        b.size_id,
                        COALESCE(SUM(bph.inspection_qty), 0) AS cut_inspection_qty,
                        COALESCE(SUM(bph.sewing_in_qty), 0) AS sewing_in_qty,
                        COALESCE(SUM(bph.sewing_out_qty), 0) AS sewing_out_qty,
                        COALESCE(SUM(bph.qc_in_qty), 0) AS qc_in_qty,
                        COALESCE(SUM(bph.qc_out_qty), 0) AS qc_out_qty,
                        COALESCE(SUM(bph.packaging_in_qty), 0) AS packaging_in_qty,
                        COALESCE(SUM(bph.packaging_out_qty), 0) AS packaging_out_qty
                    FROM ops.batches b
                    LEFT JOIN ops.batch_phase_history bph ON b.batch_id = bph.batch_id
                    WHERE b.job_order_id = v_job_order_id
                    GROUP BY b.job_order_id, b.color_id, b.size_id
                ),
                
                cut_qty_from_details AS (
                    SELECT 
                        joi.item_id,
                        joi.job_order_id,
                        joi.color_id,
                        joi.size_id,
                        COALESCE(SUM(
                            FLOOR((cd.total_layers * COALESCE((cd.job_order_items_ratios->>joi.item_id::text)::numeric, 0)))::INTEGER
                        ), 0) AS cut_qty
                    FROM core.job_order_items joi
                    LEFT JOIN ops.cut_details cd ON joi.job_order_id = cd.job_order_id AND joi.color_id = cd.color_id
                    WHERE joi.job_order_id = v_job_order_id
                    GROUP BY joi.item_id, joi.job_order_id, joi.color_id, joi.size_id
                ),
                
                transitions_in AS (
                    SELECT 
                        to_item_id AS item_id,
                        SUM(quantity) AS qty
                    FROM ops.cut_size_transitions cst
                    JOIN ops.cut_details cd ON cst.cut_id = cd.cut_id
                    WHERE cd.job_order_id = v_job_order_id
                    GROUP BY to_item_id
                ),
                
                transitions_out AS (
                    SELECT 
                        from_item_id AS item_id,
                        SUM(quantity) AS qty
                    FROM ops.cut_size_transitions cst
                    JOIN ops.cut_details cd ON cst.cut_id = cd.cut_id
                    WHERE cd.job_order_id = v_job_order_id
                    GROUP BY from_item_id
                ),
                
                item_second_degree AS (
                    SELECT 
                        b.job_order_id,
                        b.color_id,
                        b.size_id,
                        COALESCE(SUM(
                            CASE WHEN b.is_second_degree = TRUE THEN b.quantity ELSE 0 END
                        ), 0) AS qty
                    FROM ops.batches b
                    WHERE b.job_order_id = v_job_order_id
                    GROUP BY b.job_order_id, b.color_id, b.size_id
                ),
                
                item_batch_counts AS (
                    SELECT 
                        b.job_order_id,
                        b.color_id,
                        b.size_id,
                        COUNT(DISTINCT b.batch_id) AS total_batches,
                        COALESCE(SUM(b.quantity), 0) AS working_qty
                    FROM ops.batches b
                    WHERE b.job_order_id = v_job_order_id
                    GROUP BY b.job_order_id, b.color_id, b.size_id
                ),
                
                lost_qty AS (
                    SELECT 
                        joi.item_id,
                        joi.job_order_id,
                        joi.color_id,
                        joi.size_id,
                        COALESCE(SUM(sr.quantity), 0) AS qty
                    FROM core.job_order_items joi
                    LEFT JOIN ops.batches b ON b.job_order_id = joi.job_order_id
                        AND b.color_id = joi.color_id
                        AND b.size_id = joi.size_id
                    LEFT JOIN ops.single_rejections sr ON sr.batch_id = b.batch_id
                        AND sr.is_resolved = FALSE
                        AND sr.rejection_reason = 'lost/untracked'
                    WHERE joi.job_order_id = v_job_order_id
                    GROUP BY joi.item_id, joi.job_order_id, joi.color_id, joi.size_id
                )
                
                INSERT INTO reporting.job_order_items_summary (
                    item_id, job_order_id, color_id, size_id,
                    color_name, size_value, expected_quantity,
                    cut_qty, cut_inspection_qty, second_degree_cut_qty,
                    sewing_in_qty, sewing_out_qty,
                    qc_in_qty, qc_out_qty,
                    packaging_in_qty, packaging_out_qty,
                    working_qty, second_degree_qty, lost_qty, completed_qty,
                    total_batches, has_issues, completion_percentage,
                    overproduction_quantity, production_status, last_calculated_at
                )
                SELECT 
                    joi.item_id,
                    joi.job_order_id,
                    joi.color_id,
                    joi.size_id,
                    c.color_name,
                    s.size_value,
                    joi.quantity AS expected_quantity,
                    
                    COALESCE(cqd.cut_qty, 0) + COALESCE(ti.qty, 0) - COALESCE(tout.qty, 0) AS cut_qty,
                    COALESCE(bpha.cut_inspection_qty, 0) AS cut_inspection_qty,
                    0 AS second_degree_cut_qty,
                    
                    COALESCE(bpha.sewing_in_qty, 0) AS sewing_in_qty,
                    COALESCE(bpha.sewing_out_qty, 0) AS sewing_out_qty,
                    
                    COALESCE(bpha.qc_in_qty, 0) AS qc_in_qty,
                    COALESCE(bpha.qc_out_qty, 0) AS qc_out_qty,
                    
                    COALESCE(bpha.packaging_in_qty, 0) AS packaging_in_qty,
                    COALESCE(bpha.packaging_out_qty, 0) AS packaging_out_qty,
                    
                    COALESCE(ibc.working_qty, 0) AS working_qty,
                    COALESCE(isd.qty, 0) AS second_degree_qty,
                    COALESCE(lq.qty, 0) AS lost_qty,
                    COALESCE(bpha.packaging_out_qty, 0) AS completed_qty,
                    
                    COALESCE(ibc.total_batches, 0) AS total_batches,
                    
                    CASE 
                        WHEN (COALESCE(cqd.cut_qty, 0) + COALESCE(ti.qty, 0) - COALESCE(tout.qty, 0)) > joi.quantity THEN TRUE
                        WHEN COALESCE(isd.qty, 0) > 0 THEN TRUE
                        ELSE FALSE 
                    END AS has_issues,
                    
                    CASE 
                        WHEN joi.quantity = 0 THEN 0.00
                        ELSE LEAST(100.00, ROUND((COALESCE(bpha.packaging_out_qty, 0)::NUMERIC / joi.quantity::NUMERIC) * 100, 2))
                    END AS completion_percentage,
                    
                    GREATEST(0, (COALESCE(cqd.cut_qty, 0) + COALESCE(ti.qty, 0) - COALESCE(tout.qty, 0)) - joi.quantity) AS overproduction_quantity,
                    
                    CASE 
                        WHEN COALESCE(bpha.packaging_out_qty, 0) >= joi.quantity THEN 'Completed'
                        WHEN COALESCE(ibc.working_qty, 0) > 0 THEN 'In Progress'
                        ELSE 'Not Started'
                    END AS production_status,
                    
                    NOW() AS last_calculated_at
                    
                FROM core.job_order_items joi
                JOIN core.colors c ON joi.color_id = c.color_id
                JOIN core.sizes s ON joi.size_id = s.size_id
                LEFT JOIN cut_qty_from_details cqd ON joi.item_id = cqd.item_id
                LEFT JOIN transitions_in ti ON joi.item_id = ti.item_id
                LEFT JOIN transitions_out tout ON joi.item_id = tout.item_id
                LEFT JOIN batch_phase_history_aggregates bpha ON joi.job_order_id = bpha.job_order_id 
                    AND joi.color_id = bpha.color_id AND joi.size_id = bpha.size_id
                LEFT JOIN item_second_degree isd ON joi.job_order_id = isd.job_order_id 
                    AND joi.color_id = isd.color_id AND joi.size_id = isd.size_id
                LEFT JOIN item_batch_counts ibc ON joi.job_order_id = ibc.job_order_id 
                    AND joi.color_id = ibc.color_id AND joi.size_id = ibc.size_id
                LEFT JOIN lost_qty lq ON joi.item_id = lq.item_id
                WHERE joi.job_order_id = v_job_order_id
                ON CONFLICT (item_id) DO UPDATE SET
                    color_name = EXCLUDED.color_name,
                    size_value = EXCLUDED.size_value,
                    expected_quantity = EXCLUDED.expected_quantity,
                    cut_qty = EXCLUDED.cut_qty,
                    cut_inspection_qty = EXCLUDED.cut_inspection_qty,
                    second_degree_cut_qty = EXCLUDED.second_degree_cut_qty,
                    sewing_in_qty = EXCLUDED.sewing_in_qty,
                    sewing_out_qty = EXCLUDED.sewing_out_qty,
                    qc_in_qty = EXCLUDED.qc_in_qty,
                    qc_out_qty = EXCLUDED.qc_out_qty,
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
        """,
        
        """
        DROP FUNCTION IF EXISTS reporting.refresh_job_order_summary_for_jobs(INTEGER[]);
        """,
        
        """
        CREATE OR REPLACE FUNCTION reporting.refresh_job_order_summary_for_jobs(p_job_order_ids INTEGER[])
        RETURNS void AS $$
        DECLARE
            v_job_order_id INTEGER;
        BEGIN
            FOREACH v_job_order_id IN ARRAY p_job_order_ids
            LOOP
                INSERT INTO reporting.job_orders_summary (
                    job_order_id, job_order_number, model_name, client_name,
                    total_items, total_expected_quantity, total_produced_quantity,
                    cut_quantity, second_degree_quantity, working_quantity,
                    total_batches, has_issues, has_high_second_degree,
                    completion_percentage, overproduction_quantity, priority,
                    last_calculated_at
                )
                SELECT 
                    jo.job_order_id,
                    jo.job_order_number,
                    m.model_name,
                    cl.client_name,
                    COUNT(DISTINCT jois.item_id) AS total_items,
                    COALESCE(SUM(jois.expected_quantity), 0) AS total_expected_quantity,
                    COALESCE(SUM(jois.completed_qty), 0) AS total_produced_quantity,
                    COALESCE(SUM(jois.cut_qty), 0) AS cut_quantity,
                    COALESCE(SUM(jois.second_degree_qty), 0) AS second_degree_quantity,
                    COALESCE(SUM(jois.working_qty), 0) AS working_quantity,
                    COALESCE(SUM(jois.total_batches), 0) AS total_batches,
                    BOOL_OR(jois.has_issues) AS has_issues,
                    CASE 
                        WHEN COALESCE(SUM(jois.working_qty), 0) = 0 THEN FALSE
                        ELSE (COALESCE(SUM(jois.second_degree_qty), 0)::NUMERIC / 
                              NULLIF(SUM(jois.working_qty), 0)::NUMERIC) > 0.10
                    END AS has_high_second_degree,
                    CASE 
                        WHEN COALESCE(SUM(jois.expected_quantity), 0) = 0 THEN 0.00
                        ELSE LEAST(100.00, ROUND(
                            (COALESCE(SUM(jois.completed_qty), 0)::NUMERIC / 
                             SUM(jois.expected_quantity)::NUMERIC) * 100, 2))
                    END AS completion_percentage,
                    COALESCE(SUM(jois.overproduction_quantity), 0) AS overproduction_quantity,
                    jo.priority,
                    NOW() AS last_calculated_at
                FROM core.job_orders jo
                LEFT JOIN core.models m ON jo.model_id = m.model_id
                LEFT JOIN core.clients cl ON jo.client_id = cl.client_id
                LEFT JOIN reporting.job_order_items_summary jois ON jo.job_order_id = jois.job_order_id
                WHERE jo.job_order_id = v_job_order_id
                GROUP BY jo.job_order_id, jo.job_order_number, m.model_name, cl.client_name, jo.priority
                ON CONFLICT (job_order_id) DO UPDATE SET
                    job_order_number = EXCLUDED.job_order_number,
                    model_name = EXCLUDED.model_name,
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
                    priority = EXCLUDED.priority,
                    last_calculated_at = EXCLUDED.last_calculated_at;
            END LOOP;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        """
        DROP FUNCTION IF EXISTS reporting.refresh_stale_summaries(INTEGER);
        """,
        
        """
        CREATE OR REPLACE FUNCTION reporting.refresh_stale_summaries(p_interval_seconds INTEGER DEFAULT 5)
        RETURNS INTEGER AS $$
        DECLARE
            v_count INTEGER := 0;
            v_job_order_ids INTEGER[];
        BEGIN
            SELECT ARRAY_AGG(DISTINCT job_order_id) INTO v_job_order_ids
            FROM ops.summary_refresh_queue
            WHERE queued_at <= NOW() - (p_interval_seconds || ' seconds')::INTERVAL;
            
            IF v_job_order_ids IS NOT NULL AND array_length(v_job_order_ids, 1) > 0 THEN
                PERFORM ops.refresh_job_order_items_summary_for_jobs(v_job_order_ids);
                PERFORM reporting.refresh_job_order_summary_for_jobs(v_job_order_ids);
                
                DELETE FROM ops.summary_refresh_queue 
                WHERE job_order_id = ANY(v_job_order_ids);
                
                v_count := array_length(v_job_order_ids, 1);
            END IF;
            
            RETURN v_count;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        """
        CREATE TABLE IF NOT EXISTS ops.summary_refresh_queue (
            job_order_id INTEGER PRIMARY KEY REFERENCES core.job_orders(job_order_id) ON DELETE CASCADE,
            queued_at TIMESTAMP DEFAULT NOW()
        );
        """,
        
        """
        CREATE OR REPLACE FUNCTION ops.queue_summary_refresh()
        RETURNS trigger AS $$
        DECLARE
            v_job_order_id INTEGER;
        BEGIN
            -- Determine job_order_id based on operation type
            IF TG_OP = 'DELETE' THEN
                v_job_order_id := OLD.job_order_id;
            ELSE
                v_job_order_id := NEW.job_order_id;
            END IF;
            
            -- Only insert if job_order_id is not null
            IF v_job_order_id IS NOT NULL THEN
                INSERT INTO ops.summary_refresh_queue (job_order_id, queued_at)
                VALUES (v_job_order_id, NOW())
                ON CONFLICT (job_order_id) DO UPDATE SET queued_at = NOW();
            END IF;
            
            -- Return appropriate record based on operation
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        """
        DROP TRIGGER IF EXISTS trigger_queue_summary_refresh ON ops.batches;
        """,
        
        """
        CREATE TRIGGER trigger_queue_summary_refresh
            AFTER INSERT OR UPDATE OR DELETE ON ops.batches
            FOR EACH ROW
            EXECUTE FUNCTION ops.queue_summary_refresh();
        """,
        
        """
        DROP TRIGGER IF EXISTS trigger_queue_summary_refresh_events ON ops.barcode_scan_events;
        """,
        
        """
        CREATE TRIGGER trigger_queue_summary_refresh_events
            AFTER INSERT ON ops.barcode_scan_events
            FOR EACH ROW
            EXECUTE FUNCTION ops.queue_summary_refresh_from_event();
        """,
        
        """
        CREATE OR REPLACE FUNCTION ops.queue_summary_refresh_from_event()
        RETURNS trigger AS $$
        DECLARE
            v_job_order_id INTEGER;
        BEGIN
            SELECT job_order_id INTO v_job_order_id
            FROM ops.batches
            WHERE batch_id = NEW.batch_id;
            
            IF v_job_order_id IS NOT NULL THEN
                INSERT INTO ops.summary_refresh_queue (job_order_id, queued_at)
                VALUES (v_job_order_id, NOW())
                ON CONFLICT (job_order_id) DO UPDATE SET queued_at = NOW();
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        """
        CREATE OR REPLACE FUNCTION ops.refresh_summary_on_cut_change()
        RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                INSERT INTO ops.summary_refresh_queue (job_order_id, queued_at)
                VALUES (OLD.job_order_id, NOW())
                ON CONFLICT (job_order_id) DO UPDATE SET queued_at = NOW();
                RETURN OLD;
            ELSE
                INSERT INTO ops.summary_refresh_queue (job_order_id, queued_at)
                VALUES (NEW.job_order_id, NOW())
                ON CONFLICT (job_order_id) DO UPDATE SET queued_at = NOW();
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        """
        DROP TRIGGER IF EXISTS trigger_refresh_summary_on_cut_change ON ops.cut_details;
        """,
        
        """
        CREATE TRIGGER trigger_refresh_summary_on_cut_change
            AFTER INSERT OR UPDATE OR DELETE ON ops.cut_details
            FOR EACH ROW
            EXECUTE FUNCTION ops.refresh_summary_on_cut_change();
        """,
        
        """
        CREATE OR REPLACE FUNCTION ops.refresh_summary_on_transition_change()
        RETURNS trigger AS $$
        DECLARE
            v_job_order_id INTEGER;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                SELECT job_order_id INTO v_job_order_id FROM ops.cut_details WHERE cut_id = OLD.cut_id;
            ELSE
                SELECT job_order_id INTO v_job_order_id FROM ops.cut_details WHERE cut_id = NEW.cut_id;
            END IF;
            
            IF v_job_order_id IS NOT NULL THEN
                INSERT INTO ops.summary_refresh_queue (job_order_id, queued_at)
                VALUES (v_job_order_id, NOW())
                ON CONFLICT (job_order_id) DO UPDATE SET queued_at = NOW();
            END IF;
            
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """,
        
        """
        DROP TRIGGER IF EXISTS trigger_refresh_summary_on_transition_change ON ops.cut_size_transitions;
        """,
        
        """
        CREATE TRIGGER trigger_refresh_summary_on_transition_change
            AFTER INSERT OR UPDATE OR DELETE ON ops.cut_size_transitions
            FOR EACH ROW
            EXECUTE FUNCTION ops.refresh_summary_on_transition_change();
        """,

        # --------------------------------------------------------------------
        # Worker daily stage production reporting refresh (expected/true)
        # --------------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS reporting.worker_daily_stage_production_refresh_queue (
            work_date DATE PRIMARY KEY,
            queued_at TIMESTAMP DEFAULT NOW()
        );
        """,

        """
        CREATE OR REPLACE FUNCTION reporting.queue_worker_daily_stage_production_refresh_from_assignments()
        RETURNS TRIGGER AS $$
        DECLARE
            v_work_date DATE;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                v_work_date := OLD.assignment_date;
            ELSE
                v_work_date := NEW.assignment_date;
            END IF;

            IF v_work_date IS NOT NULL THEN
                INSERT INTO reporting.worker_daily_stage_production_refresh_queue (work_date, queued_at)
                VALUES (v_work_date, NOW())
                ON CONFLICT (work_date) DO UPDATE SET queued_at = NOW();
            END IF;

            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """,

        """
        DROP TRIGGER IF EXISTS trigger_queue_worker_daily_stage_production_refresh_assignments ON ops.worker_daily_stage_assignments;
        """,

        """
        CREATE TRIGGER trigger_queue_worker_daily_stage_production_refresh_assignments
            AFTER INSERT OR UPDATE OR DELETE ON ops.worker_daily_stage_assignments
            FOR EACH ROW
            EXECUTE FUNCTION reporting.queue_worker_daily_stage_production_refresh_from_assignments();
        """,

        """
        CREATE OR REPLACE FUNCTION reporting.queue_worker_daily_stage_production_refresh_from_production_history()
        RETURNS TRIGGER AS $$
        DECLARE
            v_work_date DATE;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                v_work_date := DATE(OLD.timestamp);
            ELSE
                v_work_date := DATE(NEW.timestamp);
            END IF;

            IF v_work_date IS NOT NULL THEN
                INSERT INTO reporting.worker_daily_stage_production_refresh_queue (work_date, queued_at)
                VALUES (v_work_date, NOW())
                ON CONFLICT (work_date) DO UPDATE SET queued_at = NOW();
            END IF;

            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """,

        """
        DROP TRIGGER IF EXISTS trigger_queue_worker_daily_stage_production_refresh_production_history ON ops.production_history;
        """,

        """
        CREATE TRIGGER trigger_queue_worker_daily_stage_production_refresh_production_history
            AFTER INSERT OR UPDATE OR DELETE ON ops.production_history
            FOR EACH ROW
            EXECUTE FUNCTION reporting.queue_worker_daily_stage_production_refresh_from_production_history();
        """,

        """
        -- Ensure Advanced Statistics reporting refreshes after overtime approvals.
        DROP TRIGGER IF EXISTS trigger_queue_worker_daily_stage_production_refresh_overtime ON ops.worker_overtime_history;
        """,

        """
        CREATE OR REPLACE FUNCTION reporting.queue_worker_daily_stage_production_refresh_from_overtime()
        RETURNS TRIGGER AS $$
        DECLARE
            v_work_date DATE;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                v_work_date := OLD.work_date;
            ELSE
                v_work_date := NEW.work_date;
            END IF;

            IF v_work_date IS NOT NULL THEN
                INSERT INTO reporting.worker_daily_stage_production_refresh_queue (work_date, queued_at)
                VALUES (v_work_date, NOW())
                ON CONFLICT (work_date) DO UPDATE SET queued_at = NOW();
            END IF;

            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
        """,

        """
        CREATE TRIGGER trigger_queue_worker_daily_stage_production_refresh_overtime
            AFTER INSERT OR UPDATE OR DELETE ON ops.worker_overtime_history
            FOR EACH ROW
            EXECUTE FUNCTION reporting.queue_worker_daily_stage_production_refresh_from_overtime();
        """,

        """
        DROP FUNCTION IF EXISTS reporting.refresh_worker_daily_stage_production(INTEGER);
        """,

        """
        CREATE OR REPLACE FUNCTION reporting.refresh_worker_daily_stage_production(p_interval_seconds INTEGER DEFAULT 5)
        RETURNS INTEGER AS $$
        DECLARE
            v_work_dates DATE[];
            v_work_date DATE;
        BEGIN
            SELECT ARRAY_AGG(DISTINCT work_date)
            INTO v_work_dates
            FROM reporting.worker_daily_stage_production_refresh_queue
            WHERE queued_at <= NOW() - (p_interval_seconds || ' seconds')::INTERVAL;

            IF v_work_dates IS NULL OR array_length(v_work_dates, 1) IS NULL THEN
                RETURN 0;
            END IF;

            FOREACH v_work_date IN ARRAY v_work_dates LOOP
                -- Rebuild all worker/stage rows for this specific day
                DELETE FROM reporting.worker_daily_stage_production
                WHERE work_date = v_work_date;

                WITH active_assignments AS (
                    SELECT
                        w.worker_id,
                        w.assignment_date AS work_date,
                        w.stage_id,
                        w.daily_assignment_id,
                        w.created_at,
                        COALESCE(w.working_hours, 0)::double precision AS working_hours_val,
                        COALESCE(st.production_qty, 0)::double precision AS production_qty
                    FROM ops.worker_daily_stage_assignments w
                    JOIN core.sewing_line_stages st
                      ON st.stage_id = w.stage_id
                    WHERE w.assignment_date = v_work_date
                ),
                base AS (
                    SELECT
                        worker_id,
                        work_date,
                        stage_id,
                        daily_assignment_id,
                        created_at,
                        production_qty,
                        FIRST_VALUE(working_hours_val) OVER (
                            PARTITION BY worker_id, work_date
                            ORDER BY created_at ASC NULLS FIRST, daily_assignment_id ASC
                        ) AS first_working_hours,
                        MIN(created_at) OVER (PARTITION BY worker_id, work_date) AS first_created_at,
                        COUNT(*) OVER (PARTITION BY worker_id, work_date) AS assignment_count,
                        LEAD(created_at) OVER (
                            PARTITION BY worker_id, work_date
                            ORDER BY created_at ASC NULLS FIRST, daily_assignment_id ASC
                        ) AS next_created_at
                    FROM active_assignments
                ),
                expected AS (
                    -- `ops.worker_daily_stage_assignments.working_hours` is maintained
                    -- as "total time spent in this stage for this day" (including
                    -- remaining time for the currently active stage).
                    SELECT
                        worker_id,
                        work_date,
                        stage_id,
                        COALESCE(ROUND(SUM(production_qty * working_hours_val)), 0)::int
                            AS expected_output,
                        -- Total elapsed hours for this worker/stage/day.
                        COALESCE(ROUND(SUM(working_hours_val)::numeric, 2), 0)::double precision
                            AS working_hours
                    FROM active_assignments
                    GROUP BY worker_id, work_date, stage_id
                ),
                true_output AS (
                    SELECT
                        w.worker_id,
                        w.assignment_date AS work_date,
                        w.stage_id,
                        COALESCE(SUM(ph.quantity_produced), 0)::int AS true_output
                    FROM ops.worker_daily_stage_assignments w
                    JOIN ops.production_history ph
                      ON ph.daily_assignment_id = w.daily_assignment_id
                    WHERE w.assignment_date = v_work_date
                      AND DATE(ph.timestamp) = v_work_date
                    GROUP BY w.worker_id, w.assignment_date, w.stage_id
                ),
                overtime_hours AS (
                    -- Sum all overtime applications for this worker/stage/day.
                    SELECT
                        h.worker_id,
                        h.work_date,
                        h.stage_id,
                        COALESCE(SUM(h.overtime_hours), 0)::double precision AS overtime_hours
                    FROM ops.worker_overtime_history h
                    WHERE h.work_date = v_work_date
                    GROUP BY h.worker_id, h.work_date, h.stage_id
                )
                INSERT INTO reporting.worker_daily_stage_production (
                    work_date,
                    worker_id,
                    stage_id,
                    expected_output,
                    true_output,
                    working_hours,
                    overtime_hours,
                    last_calculated_at
                )
                SELECT
                    e.work_date,
                    e.worker_id,
                    e.stage_id,
                    e.expected_output,
                    COALESCE(t.true_output, 0) AS true_output,
                    COALESCE(e.working_hours, 0) AS working_hours,
                    COALESCE(o.overtime_hours, 0) AS overtime_hours,
                    NOW() AS last_calculated_at
                FROM expected e
                LEFT JOIN true_output t
                  ON t.work_date = e.work_date
                 AND t.worker_id = e.worker_id
                 AND t.stage_id = e.stage_id
                LEFT JOIN overtime_hours o
                  ON o.work_date = e.work_date
                 AND o.worker_id = e.worker_id
                 AND o.stage_id = e.stage_id;
            END LOOP;

            DELETE FROM reporting.worker_daily_stage_production_refresh_queue
            WHERE work_date = ANY(v_work_dates);

            RETURN COALESCE(array_length(v_work_dates, 1), 0);
        END;
        $$ LANGUAGE plpgsql;
        """
    ]
    
    with engine.connect() as conn:
        for sql in summary_functions:
            trans = conn.begin()
            try:
                conn.execute(text(sql))
                trans.commit()
                print(f"Created summary function/trigger successfully")
            except Exception as e:
                try:
                    trans.rollback()
                except:
                    pass
                print(f"Warning: Could not create summary function/trigger: {e}")

# Function to initialize database
def init_database():
    """Initialize PostgreSQL database with schemas and extensions"""
    create_extensions()
    create_schemas()
    create_batch_phase_history_functions()
    create_summary_refresh_functions()
    print("PostgreSQL database initialization completed")