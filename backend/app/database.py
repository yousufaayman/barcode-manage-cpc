from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from .core.config import settings
from .models import Base
from urllib.parse import quote_plus
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# URL encode the password to handle special characters
password = quote_plus(settings.POSTGRESQL_PASSWORD)

# First create engine without database name to create the database if it doesn't exist
initial_engine = create_engine(
    f"postgresql://{settings.POSTGRESQL_USER}:{password}@{settings.POSTGRESQL_HOST}:{settings.POSTGRESQL_PORT}",
    pool_pre_ping=True,
    pool_recycle=3600,
    isolation_level=ISOLATION_LEVEL_AUTOCOMMIT
)

try:
    with initial_engine.connect() as conn:
        # Create database if it doesn't exist
        conn.execute(text(f"CREATE DATABASE {settings.POSTGRESQL_DATABASE}"))
        print(f"Database {settings.POSTGRESQL_DATABASE} created successfully")
except Exception as e:
    if "already exists" in str(e):
        print(f"Database {settings.POSTGRESQL_DATABASE} already exists")
    else:
        print(f"Warning: Could not create database {settings.POSTGRESQL_DATABASE}: {e}")

# Now create engine with database name
SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.POSTGRESQL_USER}:{password}@{settings.POSTGRESQL_HOST}:{settings.POSTGRESQL_PORT}/{settings.POSTGRESQL_DATABASE}"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is imported from models.py

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
        # Phase transition function
        """
        CREATE OR REPLACE FUNCTION ops.handle_phase_transitions()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Cutting: When set to Completed, move to Sewing - 1 (Pending)
            IF NEW.current_phase = (SELECT phase_id FROM core.production_phases WHERE phase_name = 'Cutting' LIMIT 1) 
               AND NEW.status = 'Completed' THEN
                NEW.current_phase := (SELECT phase_id FROM core.production_phases WHERE phase_name = 'Sewing - 1' LIMIT 1);
                NEW.status := 'Pending';
            END IF;
            
            -- Any Sewing phase: When set to Completed, move to Packaging (Pending)
            IF (SELECT phase_name FROM core.production_phases WHERE phase_id = NEW.current_phase) LIKE 'Sewing%'
               AND NEW.status = 'Completed' THEN
                NEW.current_phase := (SELECT phase_id FROM core.production_phases WHERE phase_name = 'Packaging' LIMIT 1);
                NEW.status := 'Pending';
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
        CREATE TRIGGER trigger_track_item_batch_quantity_changes
            AFTER INSERT OR UPDATE ON ops.batches
            FOR EACH ROW
            EXECUTE FUNCTION ops.track_item_batch_quantity_changes();
        """,
    ]
    
    with engine.connect() as conn:
        for sql in functions_and_triggers:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"Created function/trigger successfully")
            except Exception as e:
                print(f"Warning: Could not create function/trigger: {e}")

# Function to initialize database
def init_database():
    """Initialize PostgreSQL database with schemas and extensions"""
    create_extensions()
    create_schemas()
    print("PostgreSQL database initialization completed")