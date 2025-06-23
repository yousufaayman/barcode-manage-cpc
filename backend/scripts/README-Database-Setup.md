# Database Setup Documentation

## Overview
This directory contains the complete database setup script for the Barcode Management System. The setup creates all necessary tables, indexes, triggers, stored procedures, events, and minimal initial data.

## Files

### `complete_database_setup.sql`
The main setup script that creates the entire database schema.

### `setup_database.bat`
Windows batch script to run the setup with proper MySQL connection parameters.

## What Gets Created

### Database
- **Database Name**: `barcode_management`
- **Character Set**: `utf8mb4`
- **Collation**: `utf8mb4_0900_ai_ci`

### Tables (9 total)

#### Master Data Tables
1. **`production_phases`** - Production workflow phases (Cutting, Sewing, Packaging)
2. **`brands`** - Product brands (empty, to be populated as needed)
3. **`models`** - Product models (empty, to be populated as needed)
4. **`sizes`** - Product sizes (empty, to be populated as needed)
5. **`colors`** - Product colors (empty, to be populated as needed)
6. **`users`** - System users with roles (Admin, Cutting, Sewing, Packaging)

#### Main Tables
7. **`batches`** - Main barcode tracking table with all product details
8. **`barcode_status_timeline`** - Historical tracking of status changes
9. **`archived_batches`** - Archived batches for long-term storage

### Indexes
- **Primary Keys**: All tables have auto-increment primary keys
- **Unique Indexes**: barcode, brand_name, model_name, size_value, color_name, username, phase_name
- **Foreign Key Indexes**: All foreign key columns are indexed for performance
- **Additional Indexes**: Specific indexes for common query patterns

### Triggers
- **`handle_phase_transitions`**: Automatically handles phase transitions when a batch is marked as completed

### Stored Procedures
- **`archive_old_batches`**: Archives batches older than 3 months to the archived_batches table

### Events
- **`archive_batches_event`**: Runs daily to automatically archive old batches

### Initial Data
- **Production Phases**: Cutting, Sewing, Packaging (required for system operation)
- **Users**: 1 admin user (admin/admin123)

**Note**: Master data tables (brands, models, sizes, colors) are created empty and should be populated through the application interface as needed.

## Setup Instructions

### Prerequisites
1. MySQL Server installed and running
2. MySQL command line client in PATH
3. User with sufficient privileges to create databases

### Running the Setup

#### Option 1: Using the Batch Script (Windows)
```bash
# Run the setup script
setup_database.bat
```

#### Option 2: Manual MySQL Command
```bash
# Connect to MySQL and run the script
mysql -u root -p < backend/scripts/complete_database_setup.sql
```

### Default Credentials
After setup, you can log in with:
- **Username**: `admin`
- **Password**: `admin123`

**⚠️ IMPORTANT**: Change the admin password after first login!

## Database Schema Details

### Foreign Key Relationships
- `batches.brand_id` → `brands.brand_id`
- `batches.model_id` → `models.model_id`
- `batches.size_id` → `sizes.size_id`
- `batches.color_id` → `colors.color_id`
- `batches.current_phase` → `production_phases.phase_id`
- `barcode_status_timeline.batch_id` → `batches.batch_id`
- `barcode_status_timeline.phase_id` → `production_phases.phase_id`
- `archived_batches.*` → Same relationships as batches

### Data Types and Constraints
- All text fields use appropriate VARCHAR lengths
- Enums for status and role fields ensure data integrity
- Timestamps for tracking creation and updates
- Auto-increment primary keys for all tables

## Verification

After running the setup, you can verify the installation by checking:

```sql
-- Check tables
SHOW TABLES;

-- Check indexes
SHOW INDEX FROM batches;

-- Check triggers
SHOW TRIGGERS;

-- Check stored procedures
SHOW PROCEDURE STATUS WHERE Db = 'barcode_management';

-- Check events
SHOW EVENTS;

-- Check initial data
SELECT COUNT(*) FROM production_phases;
SELECT COUNT(*) FROM users;
```

## Post-Setup Configuration

After the initial setup, you'll need to:

1. **Add Master Data**: Populate the master data tables through the application:
   - Add brands (Nike, Adidas, etc.)
   - Add models (Air Max, Ultraboost, etc.)
   - Add sizes (XS, S, M, L, XL, XXL, 7, 8, 9, 10)
   - Add colors (Black, White, Red, Blue, etc.)

2. **Create Additional Users**: Add users for different roles:
   - Cutting department users
   - Sewing department users
   - Packaging department users

3. **Change Admin Password**: Update the default admin password

## Troubleshooting

### Common Issues

1. **MySQL not found**: Ensure MySQL is installed and in PATH
2. **Access denied**: Check user privileges and password
3. **Database already exists**: The script uses `CREATE DATABASE IF NOT EXISTS`
4. **Foreign key errors**: Tables are created in the correct order to avoid dependency issues

### Error Recovery
If the setup fails partway through:
1. Drop the database: `DROP DATABASE IF EXISTS barcode_management;`
2. Re-run the setup script

## Maintenance

### Archiving
- Old batches are automatically archived after 3 months
- Archived data is preserved in the `archived_batches` table
- The archiving process runs daily via the scheduled event

### Backup Recommendations
- Regular backups of the `barcode_management` database
- Include both active and archived data
- Consider point-in-time recovery for critical data

## Security Notes

1. **Change default passwords** immediately after setup
2. **Limit database access** to only necessary users
3. **Regular security updates** for MySQL server
4. **Network security** - ensure database is not exposed to public networks
5. **Encryption** - consider enabling MySQL encryption for sensitive data

## Performance Considerations

- All foreign key columns are indexed for optimal join performance
- Barcode field is indexed for fast lookups
- Consider partitioning large tables if they grow significantly
- Monitor query performance and add additional indexes as needed 