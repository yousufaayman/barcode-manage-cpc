# Final Database Transition Plan: MySQL to PostgreSQL

## Executive Summary

This document outlines the complete transition from the current MySQL-based barcode management system to a new PostgreSQL-based system with a multi-schema architecture. The transition involves migrating from a single-database MySQL structure to a well-organized PostgreSQL system with separate schemas for different functional areas.

## Current State Analysis

### MySQL Database Structure (barcode_management_v2)

The current system uses a single MySQL database with the following key components:

#### Core Tables
- **Reference Tables**: `brands`, `colors`, `sizes`, `models`, `materials`, `users`
- **Business Tables**: `job_orders`, `job_order_items`, `job_order_materials`
- **Operational Tables**: `batches`, `barcode_scan_events`, `production_phases`
- **Summary Tables**: `job_order_items_summary`, `job_orders_summary`
- **Archive Tables**: `archived_batches`, `archived_job_order_items`, `archived_job_orders`
- **Reporting Tables**: `report_history`, `report_schedules`

#### Key Features
- Complex triggers for automatic phase transitions and quantity tracking
- Stored procedures for summary table maintenance
- Multiple views for reporting and analytics
- Archive tables for historical data preservation

## Target State: PostgreSQL Multi-Schema Architecture

### Schema Organization

The new PostgreSQL system will be organized into five distinct schemas:

1. **core**: Core business entities and reference data
2. **ops**: Operational data for active production processes  
3. **archive**: Historical and archived data
4. **reporting**: Aggregated data for reporting and analytics

## Detailed Migration Mapping

### 1. Core Schema Migration

#### Reference Tables
| MySQL Table | PostgreSQL Schema | Notes |
|-------------|------------------|-------|
| `brands` | `core.clients` | Renamed for clarity |
| `colors` | `core.colors` | Direct mapping |
| `sizes` | `core.sizes` | Direct mapping |
| `models` | `core.models` | Direct mapping |
| `materials` | `core.materials` | Direct mapping |
| `users` | `core.users` | Enhanced with role system |

#### Business Tables
| MySQL Table | PostgreSQL Schema | Changes |
|-------------|------------------|---------|
| `job_orders` | `core.job_orders` | Added `print_config` JSONB field (replaces job_order_prints table) |
| `job_order_items` | `core.job_order_items` | Direct mapping |
| `job_order_materials` | `core.job_order_materials` | Direct mapping |

#### New Core Tables
- `core.systems`: System definitions for role-based access
- `core.user_roles`: User role assignments per system

### 2. Operations Schema Migration

| MySQL Table | PostgreSQL Schema | Changes |
|-------------|------------------|---------|
| `batches` | `ops.batches` | Enhanced with better indexing |
| `barcode_scan_events` | `ops.barcode_scan_events` | Added `metadata` JSONB field |

### 2.1. Core Schema - Production Phases

| MySQL Table | PostgreSQL Schema | Changes |
|-------------|------------------|---------|
| `production_phases` | `core.production_phases` | Moved to core schema, added `sequence_order` field |

### 3. Archive Schema Migration

| MySQL Table | PostgreSQL Schema | Changes |
|-------------|------------------|---------|
| `archived_batches` | `archive.batches` | Enhanced structure |
| `archived_job_order_items` | `archive.job_order_items` | Enhanced structure |
| `archived_job_orders` | `archive.job_orders` | Enhanced structure |

#### New Archive Tables
- `archive.job_order_materials`: Archive for material data
- `archive.barcode_scan_events`: Archive for scan events

### 4. Reporting Schema Migration

| MySQL Table | PostgreSQL Schema | Changes |
|-------------|------------------|---------|
| `job_order_items_summary` | `reporting.job_order_items_summary` | Enhanced with more fields |
| `job_orders_summary` | `reporting.job_orders_summary` | Enhanced with more fields |

#### New Reporting Tables
- `reporting.daily_production_summary`: Daily production metrics
- `reporting.production_status_summary`: Status-based summaries

#### New Reporting Views
- `reporting.job_orders_summary_view`: Enhanced job order view
- `reporting.daily_production_summary`: Daily metrics view
- `reporting.production_status_summary`: Status metrics view

## Key Architectural Changes

### Print Configuration Migration
The `job_order_prints` table has been replaced with a `print_config` JSONB column in the `core.job_orders` table. This change:

- **Simplifies Data Model**: Eliminates the need for a separate prints table
- **Improves Performance**: Reduces JOIN operations for print data
- **Enhances Flexibility**: JSONB allows for dynamic print configuration fields
- **Maintains Data Integrity**: Print settings are now directly associated with job orders

### Archive Schema Simplification
Summary tables have been removed from the archive schema to:

- **Reduce Redundancy**: Summary data can be calculated on-demand from archived base tables
- **Simplify Maintenance**: Fewer tables to maintain and synchronize
- **Improve Performance**: Archive operations are faster without summary table updates
- **Maintain Data Integrity**: Summary data is always current when calculated from source data


## Column Naming Conventions

### MySQL to PostgreSQL Column Name Mapping

During the migration, column names are standardized to follow PostgreSQL conventions:

| MySQL Column | PostgreSQL Column | Notes |
|--------------|------------------|-------|
| `phase_id` | `id` | Primary key standardization |
| `color_id` | `id` | Primary key standardization |
| `size_id` | `id` | Primary key standardization |
| `model_id` | `id` | Primary key standardization |
| `material_id` | `id` | Primary key standardization |
| `brand_id` | `client_id` | Table renamed from brands to clients |
| `user_id` | `id` | **Exception**: users table keeps `id` |
| `job_order_id` | `id` | Primary key standardization |
| `item_id` | `id` | Primary key standardization |
| `batch_id` | `id` | Primary key standardization |

| MySQL Column | PostgreSQL Column | Notes |
|--------------|------------------|-------|
| `phase_name` | `name` | Name column standardization |
| `color_name` | `name` | Name column standardization |
| `size_value` | `value` | Size-specific naming |
| `model_name` | `name` | Name column standardization |
| `material_name` | `name` | Name column standardization |
| `brand_name` | `client_name` | Table renamed from brands to clients |

**Exception Rule**: The `users` table is the only exception where the primary key remains as `id` instead of `user_id` to maintain consistency with authentication systems.

## Data Type Mappings

### MySQL to PostgreSQL Conversions

| MySQL Type | PostgreSQL Type | Notes |
|------------|----------------|-------|
| `INT UNSIGNED` | `INTEGER` | PostgreSQL integers are signed |
| `TINYINT(1)` | `BOOLEAN` | Boolean conversion |
| `VARCHAR(n)` | `VARCHAR(n)` | Direct mapping |
| `TEXT` | `TEXT` | Direct mapping |
| `DECIMAL(10,2)` | `NUMERIC(10,2)` | Direct mapping |
| `DATETIME` | `TIMESTAMP` | Direct mapping |
| `ENUM` | `VARCHAR` with CHECK constraints | PostgreSQL enum alternative |
| `JSON` | `JSONB` | Enhanced JSON support |

## Function and Trigger Migration

### MySQL Triggers to PostgreSQL

#### 1. Phase Transition Trigger
**MySQL**: `handle_phase_transitions`
**PostgreSQL**: Convert to function with trigger (Updated to reference core.production_phases)
```sql
CREATE OR REPLACE FUNCTION ops.handle_phase_transitions()
RETURNS TRIGGER AS $$
BEGIN
    -- Cutting: When set to Completed, move to Sewing - 1 (Pending)
    IF NEW.current_phase = (SELECT id FROM core.production_phases WHERE phase_name = 'Cutting' LIMIT 1) 
       AND NEW.status = 'Completed' THEN
        NEW.current_phase := (SELECT id FROM core.production_phases WHERE phase_name = 'Sewing - 1' LIMIT 1);
        NEW.status := 'Pending';
    END IF;
    
    -- Any Sewing phase: When set to Completed, move to Packaging (Pending)
    IF (SELECT phase_name FROM core.production_phases WHERE id = NEW.current_phase) LIKE 'Sewing%'
       AND NEW.status = 'Completed' THEN
        NEW.current_phase := (SELECT id FROM core.production_phases WHERE phase_name = 'Packaging' LIMIT 1);
        NEW.status := 'Pending';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 2. Quantity Tracking Trigger
**MySQL**: `track_item_batch_quantity_changes`
**PostgreSQL**: Convert to function with trigger
```sql
CREATE OR REPLACE FUNCTION ops.track_item_batch_quantity_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_cut_quantity INTEGER DEFAULT 0;
    new_total_quantity INTEGER DEFAULT 0;
    new_second_degree_quantity INTEGER DEFAULT 0;
    new_completed_quantity INTEGER DEFAULT 0;
    expected_qty INTEGER DEFAULT 0;
    item_status VARCHAR(20) DEFAULT 'Not Started';
    completion_pct NUMERIC(5,2) DEFAULT 0.00;
    has_issues_flag BOOLEAN DEFAULT FALSE;
    overproduction_qty INTEGER DEFAULT 0;
BEGIN
    -- Get current cut quantity for this item
    SELECT cut_quantity INTO current_cut_quantity 
    FROM reporting.job_order_items_summary 
    WHERE job_order_id = NEW.job_order_id 
    AND color_id = NEW.color_id 
    AND size_id = NEW.size_id;
    
    -- Calculate new quantities and update summary
    -- [Implementation details...]
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### MySQL Stored Procedures to PostgreSQL

#### 1. Summary Refresh Procedures
**MySQL**: `RefreshJobOrderItemsSummary`, `refresh_job_orders_summary_complete`
**PostgreSQL**: Convert to functions
```sql
CREATE OR REPLACE FUNCTION reporting.refresh_job_order_items_summary(p_job_order_id INTEGER DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    rec RECORD;
BEGIN
    -- Implementation similar to MySQL procedure
    -- [Detailed implementation...]
    
    RETURN 'Job order items summary refreshed successfully';
END;
$$ LANGUAGE plpgsql;
```

## Index Strategy Migration

### MySQL Indexes to PostgreSQL

#### Core Schema Indexes
```sql
-- Unique constraints
CREATE UNIQUE INDEX ON core.clients (name);
CREATE UNIQUE INDEX ON core.colors (name);
CREATE UNIQUE INDEX ON core.sizes (value);
CREATE UNIQUE INDEX ON core.models (name);
CREATE UNIQUE INDEX ON core.materials (name);
CREATE UNIQUE INDEX ON core.production_phases (phase_name);

-- Composite indexes
CREATE INDEX ON core.job_order_items (job_order_id, color_id, size_id);
CREATE INDEX ON core.job_order_materials (job_order_id, material_id, color_id);

-- Production phases indexes
CREATE INDEX ON core.production_phases (type);
CREATE INDEX ON core.production_phases (sequence_order);

-- GIN indexes for JSONB
CREATE INDEX ON core.job_orders USING GIN (print_config);

-- Full-text search
CREATE INDEX ON core.job_orders USING GIN (to_tsvector('english', notes));
```

#### Operations Schema Indexes
```sql
-- Unique constraints
CREATE UNIQUE INDEX ON ops.batches (barcode);

-- Performance indexes
CREATE INDEX ON ops.barcode_scan_events (batch_id, action_type, scanned_at);
CREATE INDEX ON ops.barcode_scan_events (phase_id, scanned_at);
CREATE INDEX ON ops.batches (status, current_phase);
CREATE INDEX ON ops.batches (last_updated);

-- Trigram indexes for fuzzy search
CREATE INDEX ON ops.batches USING GIN (barcode gin_trgm_ops);
```

#### Archive Schema Indexes
```sql
-- Time-based indexes
CREATE INDEX ON archive.batches (archived_at);
CREATE INDEX ON archive.barcode_scan_events (archived_at);

-- Foreign key indexes
CREATE INDEX ON archive.batches (job_order_id);
CREATE INDEX ON archive.batches (color_id, size_id);
```

#### Reporting Schema Indexes
```sql
-- Performance indexes
CREATE INDEX ON reporting.job_order_items_summary (completion_percentage);
CREATE INDEX ON reporting.job_order_items_summary (production_status);
CREATE INDEX ON reporting.job_order_items_summary (has_issues);
CREATE INDEX ON reporting.job_orders_summary (completion_percentage);
```

## Migration Execution Plan

### Phase 1: Schema Creation
1. Create PostgreSQL database
2. Create all schemas (core, ops, archive, reporting)
3. Create all tables with proper constraints
4. Create all indexes
5. Create all functions and triggers

### Phase 2: Data Migration
1. Export data from MySQL
2. Transform data to PostgreSQL format
3. Import reference data first (brands → clients, colors, sizes, models, materials)
4. Import business data (job_orders with print_config JSONB, job_order_items, job_order_materials)
5. Import operational data (batches, barcode_scan_events, production_phases)
6. Import summary data
7. Import archive data (batches, job_orders, job_order_items, job_order_materials, barcode_scan_events)

### Phase 3: Application Migration
1. Update database connection strings
2. Update SQL queries for PostgreSQL syntax
3. Update stored procedure calls to function calls
4. Migrate job_order_prints table logic to use print_config JSONB column
5. Update archive functions to exclude summary tables
6. Test all functionality
7. Update reporting queries

### Phase 4: Validation and Testing
1. Data integrity validation
2. Performance testing
3. Functionality testing
4. User acceptance testing
5. Go-live preparation

## Production Phases Schema Migration

### Overview
The `production_phases` table has been moved from the `ops` schema to the `core` schema to better reflect its role as a reference table that defines the production workflow phases. This change improves the logical organization of the database schema.

### Migration Details
- **Source**: `ops.production_phases`
- **Target**: `core.production_phases`
- **Migration Script**: `move_production_phases_to_core.sql`

### Changes Required
1. **Table Creation**: Create `core.production_phases` with enhanced structure
2. **Data Migration**: Copy all data from `ops.production_phases` to `core.production_phases`
3. **Foreign Key Updates**: Update all foreign key references to point to the new location
4. **Trigger Updates**: Update trigger functions to reference the new schema
5. **Application Code**: Update all application code to use `core.production_phases`

### Affected Tables
- `ops.batches` (current_phase foreign key)
- `ops.barcode_scan_events` (phase_id foreign key)
- `archive.barcode_scan_events` (phase_id foreign key)

### Deprecated Tables
- `job_order_prints`: Replaced by `print_config` JSONB column in `core.job_orders`
- Archive summary tables: Removed in favor of on-demand calculation from base tables

### Benefits
- **Logical Organization**: Production phases are reference data, better suited for core schema
- **Consistency**: All reference tables now in core schema
- **Maintainability**: Easier to manage and understand schema organization
- **Performance**: No performance impact, same indexing strategy

## Performance Considerations

### PostgreSQL Advantages
- **Better JSON Support**: JSONB provides better performance than MySQL JSON
- **Advanced Indexing**: GIN, GiST, and other index types
- **Better Concurrency**: MVCC provides better concurrent access
- **Schema Organization**: Logical separation improves maintainability
- **Advanced Analytics**: Better support for complex queries

### Optimization Strategies
- **Partitioning**: Consider partitioning large tables by date
- **Connection Pooling**: Use PgBouncer for connection management
- **Query Optimization**: Use EXPLAIN ANALYZE for query tuning
- **Vacuum and Analyze**: Regular maintenance for optimal performance

## Risk Mitigation

### Data Loss Prevention
- **Full Backup**: Complete MySQL database backup before migration
- **Incremental Backups**: Regular backups during migration process
- **Data Validation**: Comprehensive data integrity checks
- **Rollback Plan**: Ability to revert to MySQL if needed

### Downtime Minimization
- **Parallel Migration**: Migrate non-dependent data in parallel
- **Blue-Green Deployment**: Maintain both systems during transition
- **Gradual Cutover**: Migrate functionality incrementally
- **Monitoring**: Real-time monitoring during migration

## Post-Migration Tasks

### Immediate Tasks
1. **Data Validation**: Verify all data migrated correctly
2. **Performance Monitoring**: Monitor query performance
3. **User Training**: Train users on any interface changes
4. **Documentation Update**: Update all system documentation

### Long-term Tasks
1. **Performance Tuning**: Optimize queries based on usage patterns
2. **Backup Strategy**: Implement PostgreSQL backup strategy
3. **Monitoring Setup**: Set up comprehensive monitoring
4. **Maintenance Schedule**: Establish regular maintenance procedures

## Success Criteria

## Conclusion

This migration plan provides a comprehensive roadmap for transitioning from the current MySQL-based system to a modern PostgreSQL multi-schema architecture. The new system will provide better performance, improved maintainability, and enhanced capabilities while preserving all existing functionality and data.

The phased approach ensures minimal risk while the detailed mapping ensures no data or functionality is lost during the transition. The new architecture will provide a solid foundation for future enhancements and scalability.
