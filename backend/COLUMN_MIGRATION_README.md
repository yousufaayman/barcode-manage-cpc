# Column Name Migration Guide

This guide explains how to convert standardized PostgreSQL column names back to MySQL-style naming conventions.

## Problem Description

After migrating from MySQL to PostgreSQL, you may need to convert the standardized column names back to the original MySQL naming conventions:

### ID Columns
- `id` → `phase_id`
- `id` → `color_id` 
- `id` → `size_id`
- `id` → `model_id`
- `id` → `material_id`
- `id` → `client_id`
- `id` → `id` (users table - exception to the rule)
- `id` → `job_order_id`
- `id` → `item_id`
- `id` → `batch_id`

### Name Columns
- `name` → `phase_name`
- `name` → `color_name`
- `value` → `size_value`
- `name` → `model_name`
- `name` → `material_name`
- `name` → `client_name`

## Migration Scripts

### 1. SQL Migration Script (`fix_column_names_migration.sql`)

The main migration script that converts standardized PostgreSQL column names back to MySQL-style naming.

**Features:**
- Renames all `id` columns to `{table}_id`
- Renames all `name` columns to `{table}_name`
- Renames `value` to `size_value` for sizes table
- Converts `clients` back to `brands` naming
- Updates foreign key constraints
- Updates unique constraints
- Updates indexes
- Includes verification queries

### 2. Python Runner (`run_column_migration.py`)

A Python script that runs the migration with better error handling and logging.

**Usage:**
```bash
# Dry run (show what would be done)
python run_column_migration.py --dry-run

# Run with verbose output
python run_column_migration.py --verbose

# Run normally
python run_column_migration.py
```

**Requirements:**
- Python 3.7+
- psycopg2
- Access to database configuration

### 3. PowerShell Script (`run_column_migration.ps1`)

A Windows PowerShell script for running the migration.

**Usage:**
```powershell
# Dry run
.\run_column_migration.ps1 -DryRun

# Run with verbose output
.\run_column_migration.ps1 -Verbose

# Run with custom database settings
.\run_column_migration.ps1 -DatabaseHost "localhost" -DatabasePort "5432" -DatabaseName "barcode_management" -DatabaseUser "postgres" -Password "your_password"
```

**Requirements:**
- PowerShell 5.0+
- PostgreSQL client tools (psql)
- Windows environment

## Manual Execution

If you prefer to run the migration manually:

1. **Connect to your PostgreSQL database:**
   ```bash
   psql -h localhost -p 5432 -U postgres -d barcode_management
   ```

2. **Run the migration script:**
   ```sql
   \i fix_column_names_migration.sql
   ```

3. **Verify the results:**
   The script includes verification queries that will show the updated column names.

## What the Migration Does

### 1. Column Renames
- Renames all primary key columns from `id` to `{table}_id`
- Renames name columns from `name` to `{table}_name`
- Renames `value` to `size_value` (sizes table)
- Converts client column names to match table naming convention

### 2. Foreign Key Updates
- Updates all foreign key constraints to reference the new column names
- Maintains referential integrity
- Updates constraint names for clarity

### 3. Constraint Updates
- Updates unique constraints
- Updates composite unique constraints
- Maintains data integrity

### 4. Index Updates
- Drops old indexes
- Creates new indexes with updated column names
- Maintains query performance

## Verification

After running the migration, verify the results:

### Check Core Schema
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'core' 
AND table_name IN ('production_phases', 'colors', 'sizes', 'models', 'materials', 'clients', 'users')
ORDER BY table_name, ordinal_position;
```

### Check Operations Schema
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'ops' 
AND table_name IN ('batches', 'barcode_scan_events')
ORDER BY table_name, ordinal_position;
```

### Check Archive Schema
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'archive' 
AND table_name IN ('batches', 'job_orders', 'job_order_items')
ORDER BY table_name, ordinal_position;
```

### Check Reporting Schema
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'reporting' 
AND table_name IN ('job_order_items_summary', 'job_orders_summary')
ORDER BY table_name, ordinal_position;
```

## Expected Results

After successful migration, you should see:

### Core Schema
- `production_phases`: `phase_id`, `phase_name`, `type`, `sequence_order`
- `colors`: `color_id`, `color_name`
- `sizes`: `size_id`, `size_value`
- `models`: `model_id`, `model_name`
- `materials`: `material_id`, `material_name`
- `clients`: `client_id`, `client_name`
- `users`: `id`, `username`, `password_hash` (exception - keeps `id`)

### Operations Schema
- `batches`: `batch_id`, `job_order_id`, `barcode`, `size_id`, `color_id`, etc.
- `barcode_scan_events`: `id`, `batch_id`, `phase_id`, etc.

### Archive Schema
- `batches`: `batch_id`, `job_order_id`, `barcode`, etc.
- `job_orders`: `job_order_id`, `model_id`, `job_order_number`, `client_id`, etc.
- `job_order_items`: `item_id`, `job_order_id`, `color_id`, `size_id`, etc.

### Reporting Schema
- `job_order_items_summary`: `item_id`, `job_order_id`, `color_id`, `size_id`, etc.
- `job_orders_summary`: `job_order_id`, `job_order_number`, `model_name`, `client_name`, etc.

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Ensure the database user has ALTER TABLE permissions
   - Run as a superuser if necessary

2. **Foreign Key Constraint Errors**
   - The script handles this by dropping and recreating constraints
   - If issues persist, check for data inconsistencies

3. **Index Errors**
   - The script drops and recreates indexes
   - If issues persist, check for duplicate index names

4. **Schema Not Found**
   - Ensure all schemas (core, ops, archive, reporting) exist
   - Run the initial database setup first

### Rollback

If you need to rollback the changes:

1. **Restore from backup** (recommended)
2. **Manual rollback** (complex, not recommended)

## Safety Notes

- **Always backup your database** before running the migration
- **Test on a copy** of your production database first
- **Use dry-run mode** to preview changes
- **Monitor the application** after migration for any issues

## Support

If you encounter issues:

1. Check the logs for specific error messages
2. Verify database connectivity and permissions
3. Ensure all required schemas and tables exist
4. Check for data inconsistencies that might prevent constraint updates

The migration script is designed to be idempotent and safe, but always test thoroughly before running on production data.
