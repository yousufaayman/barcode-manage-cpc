# Installing pg_cron Extension

## PostgreSQL with pg_cron Installation

### Windows Installation

#### Option 1: Using Pre-built Binaries (Recommended)

1. **Download pg_cron**
   - Go to: https://github.com/citusdata/pg_cron/releases
   - Download the Windows binary matching your PostgreSQL version
   - Example for PostgreSQL 16: `pg_cron-v1.6.2-pg16-windows-x86_64.zip`

2. **Extract Files**
   ```powershell
   # Extract to a temporary folder
   Expand-Archive -Path pg_cron-v1.6.2-pg16-windows-x86_64.zip -DestinationPath C:\temp\pg_cron
   ```

3. **Copy to PostgreSQL Extensions Directory**
   ```powershell
   # Find your PostgreSQL lib directory
   # Usually: C:\Program Files\PostgreSQL\16\lib
   
   # Copy DLL files
   Copy-Item "C:\temp\pg_cron\lib\pg_cron.dll" "C:\Program Files\PostgreSQL\16\lib\"
   
   # Copy SQL files
   Copy-Item "C:\temp\pg_cron\share\extension\pg_cron--*.sql" "C:\Program Files\PostgreSQL\16\share\extension\"
   Copy-Item "C:\temp\pg_cron\share\extension\pg_cron.control" "C:\Program Files\PostgreSQL\16\share\extension\"
   ```

4. **Configure postgresql.conf**
   ```powershell
   # Open postgresql.conf (usually in C:\Program Files\PostgreSQL\16\data\)
   # Add these lines:
   shared_preload_libraries = 'pg_cron'
   cron.database_name = 'CPC_INTEGRATED_SYSTEM'
   ```

5. **Restart PostgreSQL Service**
   ```powershell
   # Stop PostgreSQL
   Stop-Service postgresql-x64-16
   
   # Start PostgreSQL
   Start-Service postgresql-x64-16
   ```

6. **Install Extension in Database**
   ```sql
   -- Connect to your database
   \c CPC_INTEGRATED_SYSTEM
   
   -- Create extension
   CREATE EXTENSION pg_cron;
   
   -- Verify installation
   SELECT * FROM cron.job;
   ```

### Linux Installation

#### Using apt (Debian/Ubuntu)

```bash
# For PostgreSQL 16
sudo apt-get install postgresql-16-cron

# Restart PostgreSQL
sudo systemctl restart postgresql

# Install in database
sudo -u postgres psql -d CPC_INTEGRATED_SYSTEM -c "CREATE EXTENSION pg_cron;"
```

#### Using yum (CentOS/RHEL)

```bash
# Add PostgreSQL official repository
sudo yum install postgresql16-server-cron

# Restart PostgreSQL
sudo systemctl restart postgresql-16

# Install in database
sudo -u postgres psql -d CPC_INTEGRATED_SYSTEM -c "CREATE EXTENSION pg_cron;"
```

#### From Source (All Linux distributions)

```bash
# Clone repository
git clone https://github.com/citusdata/pg_cron.git
cd pg_cron

# Build and install
make
sudo make install

# Restart PostgreSQL
sudo systemctl restart postgresql

# Install in database
sudo -u postgres psql -d CPC_INTEGRATED_SYSTEM -c "CREATE EXTENSION pg_cron;"
```

### macOS Installation

```bash
# Install with Homebrew
brew install citusdata/pg_cron/pg_cron

# Or compile from source
git clone https://github.com/citusdata/pg_cron.git
cd pg_cron
make
make install

# Install in database
psql -d CPC_INTEGRATED_SYSTEM -c "CREATE EXTENSION pg_cron;"
```

## Verify Installation

```sql
-- Check if pg_cron is loaded
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- List all cron jobs
SELECT * FROM cron.job;

-- Check version
SELECT extversion FROM pg_extension WHERE extname = 'pg_cron';
```

## Troubleshooting

### Windows: "extension pg_cron does not exist"
- Ensure DLL files are in correct PostgreSQL lib directory
- Verify postgresql.conf has `shared_preload_libraries = 'pg_cron'`
- Restart PostgreSQL service

### Linux: "permission denied"
```bash
# Fix permissions
sudo chmod 644 /usr/share/postgresql/16/extension/pg_cron*.sql
sudo chmod 644 /usr/share/postgresql/16/extension/pg_cron.control
sudo chmod 644 /usr/lib/postgresql/16/lib/pg_cron.so
```

### Check PostgreSQL Logs
```bash
# Linux
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# Windows
# Check: C:\Program Files\PostgreSQL\16\data\log\
```

## Alternative: Using Background Python Worker (if pg_cron not available)

If you cannot install pg_cron, use the Python worker approach I provided earlier.

