# Dual Network Deployment Guide

## Complete Step-by-Step Deployment Instructions

### Phase 1: Prerequisites and Environment Setup

#### 1.1 System Requirements
- Windows Server 2019
- Administrator privileges
- Minimum 8GB RAM
- Minimum 100GB free disk space
- Two network interfaces configured:
  - 192.168.0.106 (Network 1)
  - 192.168.0.249 (Network 2)

#### 1.2 Install Required Software

**Python 3.11+**
```powershell
# Download from https://www.python.org/downloads/
# Install with "Add Python to PATH" checked
python --version  # Verify installation
```

**Node.js 18+**
```powershell
# Download from https://nodejs.org/
# Install LTS version
node --version  # Verify installation
npm --version   # Verify installation
```

**NSSM (Non-Sucking Service Manager)**
```powershell
# Download from https://nssm.cc/download
# Extract to C:\nssm\
# Add C:\nssm\ to PATH environment variable
```

**MySQL Database**
```powershell
# Install MySQL Server 8.0+
# Configure with appropriate credentials
# Create database for the application
```

### Phase 2: Project Setup

#### 2.1 Clone and Prepare Project
```powershell
# Navigate to project directory
cd S:\CS_Projects\Projects\barcode-manage-cpc

# Verify project structure
ls deployment\windows-server-2019\
```

#### 2.2 Create Complete Directory Structure
```powershell
# Run the comprehensive directory creation script
.\deployment\windows-server-2019\scripts\create-directories.ps1

# Verify all directories were created successfully
.\C:\barcode-app\verify-directories.ps1
```

**Directory Structure Created:**
- **Main Application**: `C:\barcode-app\` (backend, frontend, monitoring, logs, backups, temp)
- **Backend Specific**: `C:\barcode-app\backend\` (logs, temp, cache)
- **Static Files**: `C:\barcode-app\static\` and `S:\CS_Projects\Projects\barcode-manage-cpc\static\`
- **File Uploads**: `C:\barcode-app\uploads\` (barcodes, job-orders, templates, exports)
- **Nginx**: `C:\nginx\` (conf, logs, ssl, html, temp)
- **Database**: `C:\barcode-app\database\` (backups, scripts)
- **Monitoring**: `C:\barcode-app\monitoring\` (reports, alerts, logs, data)
- **Cache**: `C:\barcode-app\cache\` (sessions, static, api)
- **Security**: `C:\barcode-app\security\` (keys, certificates)
- **Development**: `C:\barcode-app\dev\` (test-data, scripts)

**Directory Features:**
- ✅ Proper Windows permissions (IIS_IUSRS, SYSTEM, Administrators)
- ✅ Directory inheritance settings
- ✅ Support for both development and production paths
- ✅ Comprehensive logging and monitoring directories
- ✅ File upload and static file handling
- ✅ SSL certificate storage
- ✅ Database backup and script directories
- ✅ Cache and session management
- ✅ Security key and certificate storage

### Phase 3: Backend Deployment

#### 3.1 Install Backend Services
```powershell
# Run the installation script
.\deployment\windows-server-2019\scripts\install-services.ps1

# Verify services are installed
Get-Service | Where-Object {$_.Name -like "*Barcode*"}
```

#### 3.2 Configure Environment and Directory Paths
```powershell
# Edit environment file
notepad C:\barcode-app\.env

# Update with your database credentials and directory paths:
# MYSQL_HOST=localhost
# MYSQL_PORT=3306
# MYSQL_USER=your_username
# MYSQL_PASSWORD=your_password
# MYSQL_DATABASE=your_database_name

# Directory Configuration (automatically handled by backend)
# JOB_ORDER_IMAGE_UPLOAD_DIR=C:\barcode-app\static
# LOG_DIR=C:\barcode-app\logs
# TEMP_DIR=C:\barcode-app\temp
# CACHE_DIR=C:\barcode-app\cache
# UPLOAD_DIR=C:\barcode-app\uploads
```

**Backend Directory Handling:**
- ✅ **Static Files**: Backend automatically creates `JOB_ORDER_IMAGE_UPLOAD_DIR` if it doesn't exist
- ✅ **Logs**: Backend creates log directories as needed
- ✅ **Uploads**: File upload endpoints handle directory creation automatically
- ✅ **Cache**: Backend manages cache directories for performance
- ✅ **Temporary Files**: Backend creates temp directories for processing
- ✅ **Database**: Backend creates database if it doesn't exist
- ✅ **Permissions**: All directories created with proper Windows permissions

#### 3.3 Verify Backend Directory Handling
```powershell
# Test backend directory creation and access
cd C:\barcode-app\backend

# Test static file directory creation
python -c "
import os
from app.core.config import settings
print('JOB_ORDER_IMAGE_UPLOAD_DIR:', settings.JOB_ORDER_IMAGE_UPLOAD_DIR)
print('Directory exists:', os.path.exists(settings.JOB_ORDER_IMAGE_UPLOAD_DIR))
print('Directory is writable:', os.access(settings.JOB_ORDER_IMAGE_UPLOAD_DIR, os.W_OK))
"

# Test database directory access
python -c "
from app.database import engine
from sqlalchemy import text
try:
    with engine.connect() as conn:
        result = conn.execute(text('SELECT 1'))
        print('Database connection: SUCCESS')
except Exception as e:
    print('Database connection: FAILED -', str(e))
"

# Test file upload directory
python -c "
import os
upload_dirs = [
    'C:\\barcode-app\\uploads',
    'C:\\barcode-app\\uploads\\barcodes',
    'C:\\barcode-app\\uploads\\job-orders',
    'C:\\barcode-app\\uploads\\templates',
    'C:\\barcode-app\\uploads\\exports'
]
for dir_path in upload_dirs:
    exists = os.path.exists(dir_path)
    writable = os.access(dir_path, os.W_OK) if exists else False
    print(f'{dir_path}: EXISTS={exists}, WRITABLE={writable}')
"
```

#### 3.4 Test Backend Services
```powershell
# Start services manually to test
cd C:\barcode-app\backend
python run_service_1.py

# In another terminal, test the API
Invoke-WebRequest -Uri "http://localhost:5000/health/" -UseBasicParsing

# Test file upload endpoint
Invoke-WebRequest -Uri "http://localhost:5000/api/v1/job-orders/" -UseBasicParsing

# Test directory health check endpoint
Invoke-WebRequest -Uri "http://localhost:5000/health/directories" -UseBasicParsing
```

### Phase 4: SSL Certificate Generation

#### 4.1 Generate Certificates
```powershell
# Run certificate generation script
.\deployment\windows-server-2019\ssl\generate_certificates.ps1

# Verify certificates were created
ls C:\nginx\ssl\
```

#### 4.2 Verify Certificate Installation
```powershell
# Check certificates in Windows Certificate Store
Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object {$_.Subject -like "*192.168.0*"}
```

### Phase 5: Frontend Deployment

#### 5.1 Build Network 1 Frontend
```powershell
# Navigate to frontend directory
cd frontend

# Build for Network 1
node ..\deployment\windows-server-2019\frontend\build-network1.js

# Verify build output
ls C:\barcode-app\frontend-network1\
```

#### 5.2 Build Network 2 Frontend
```powershell
# Build for Network 2
node ..\deployment\windows-server-2019\frontend\build-network2.js

# Verify build output
ls C:\barcode-app\frontend-network2\
```

### Phase 6: Nginx Configuration

#### 6.1 Install Nginx
```powershell
# Download Nginx for Windows
# Extract to C:\nginx\
# Verify installation
C:\nginx\nginx.exe -v
```

#### 6.2 Configure Nginx
```powershell
# Copy nginx configuration
Copy-Item -Path "deployment\windows-server-2019\nginx\nginx.conf" -Destination "C:\nginx\conf\nginx.conf" -Force

# Test nginx configuration
C:\nginx\nginx.exe -t
```

#### 6.3 Install Nginx Service
```powershell
# Install nginx as Windows service
C:\nssm\nssm.exe install BarcodeNginx C:\nginx\nginx.exe
C:\nssm\nssm.exe set BarcodeNginx DisplayName "Barcode Nginx Web Server"
C:\nssm\nssm.exe set BarcodeNginx Start SERVICE_AUTO_START
```

### Phase 7: Service Configuration

#### 7.1 Configure Firewall Rules
```powershell
# Allow HTTP traffic
New-NetFirewallRule -DisplayName "Barcode HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# Allow HTTPS traffic
New-NetFirewallRule -DisplayName "Barcode HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Allow backend API ports
New-NetFirewallRule -DisplayName "Barcode API 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
New-NetFirewallRule -DisplayName "Barcode API 5001" -Direction Inbound -Protocol TCP -LocalPort 5001 -Action Allow
New-NetFirewallRule -DisplayName "Barcode API 5002" -Direction Inbound -Protocol TCP -LocalPort 5002 -Action Allow
```

#### 7.2 Start All Services
```powershell
# Start backend services
Start-Service -Name "BarcodeBackend_Service_1"
Start-Service -Name "BarcodeBackend_Service_2"
Start-Service -Name "BarcodeBackend_Service_3"

# Start monitoring services
Start-Service -Name "BarcodeHealthMonitorDual"
Start-Service -Name "BarcodeAutoRecoveryDual"

# Start nginx
Start-Service -Name "BarcodeNginx"
```

### Phase 8: Verification and Testing

#### 8.1 Directory Structure Verification
```powershell
# Verify all directories exist and have proper permissions
.\C:\barcode-app\verify-directories.ps1

# Check directory permissions
Get-Acl C:\barcode-app | Format-List
Get-Acl C:\nginx | Format-List

# Verify static file directory
Test-Path C:\barcode-app\static
Test-Path S:\CS_Projects\Projects\barcode-manage-cpc\static
```

#### 8.2 Service Status Check
```powershell
# Check all services are running
Get-Service | Where-Object {$_.Name -like "*Barcode*"} | Format-Table Name, Status

# Use management script
.\C:\barcode-app\manage-services.ps1 -Action status
```

#### 8.3 Directory Troubleshooting
```powershell
# If directories are missing, recreate them
.\deployment\windows-server-2019\scripts\create-directories.ps1 -Force

# Check for permission issues
icacls C:\barcode-app /grant IIS_IUSRS:(OI)(CI)F /T
icacls C:\nginx /grant IIS_IUSRS:(OI)(CI)F /T

# Verify backend can access directories
cd C:\barcode-app\backend
python -c "import os; print('Static dir exists:', os.path.exists('C:\\barcode-app\\static'))"
```

#### 8.4 Health Check Verification
```powershell
# Test Network 1 health endpoints
Invoke-WebRequest -Uri "http://192.168.0.106/health/" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.106/health/database" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.106/health/pool" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.106/health/directories" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.106/health/full" -UseBasicParsing

# Test Network 2 health endpoints
Invoke-WebRequest -Uri "http://192.168.0.249/health/" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.249/health/database" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.249/health/pool" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.249/health/directories" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.0.249/health/full" -UseBasicParsing
```

#### 8.5 Frontend Access Test
```powershell
# Test Network 1 frontend
Start-Process "http://192.168.0.106"

# Test Network 2 frontend
Start-Process "http://192.168.0.249"

# Test API documentation
Start-Process "http://192.168.0.106/docs"
Start-Process "http://192.168.0.249/docs"
```

#### 8.6 Load Balancing Test
```powershell
# Test load balancing by making multiple requests
for ($i = 1; $i -le 10; $i++) {
    $response = Invoke-WebRequest -Uri "http://192.168.0.106/api/v1/health/" -UseBasicParsing
    Write-Host "Request $i - Status: $($response.StatusCode)"
    Start-Sleep -Seconds 1
}
```

### Phase 9: Monitoring Setup

#### 9.1 Configure Alerting
```powershell
# Edit alerting configuration
notepad C:\barcode-app\monitoring\alerting_config.json

# Configure email alerts (optional)
# Configure webhook alerts (optional)
# Configure Slack alerts (optional)
```

#### 9.2 Start Alerting Service
```powershell
# Install alerting service
C:\nssm\nssm.exe install BarcodeAlertingService C:\Python311\python.exe "C:\barcode-app\monitoring\alerting.py"
C:\nssm\nssm.exe set BarcodeAlertingService DisplayName "Barcode Alerting Service"
C:\nssm\nssm.exe set BarcodeAlertingService Start SERVICE_AUTO_START

# Start the service
Start-Service -Name "BarcodeAlertingService"
```

### Phase 10: Production Optimization

#### 10.1 Performance Tuning
```powershell
# Adjust worker processes in .env file
# WORKERS=4  # Increase for better performance
# LIMIT_CONCURRENCY=1000  # Increase for more concurrent requests

# Restart services after changes
.\C:\barcode-app\manage-services.ps1 -Action restart
```

#### 10.2 Log Rotation Setup
```powershell
# Create log rotation script
$logRotationScript = @"
# Log Rotation Script for Barcode Management System
`$logPath = "C:\barcode-app\logs"
`$maxLogSize = 100MB
`$maxLogFiles = 10

Get-ChildItem -Path `$logPath -Filter "*.log" | ForEach-Object {
    if (`$_.Length -gt `$maxLogSize) {
        # Archive old log
        `$archiveName = `$_.BaseName + "_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log"
        Move-Item -Path `$_.FullName -Destination (Join-Path `$logPath `$archiveName)
        
        # Create new log file
        New-Item -ItemType File -Path `$_.FullName -Force
        
        # Remove old archives if too many
        `$archives = Get-ChildItem -Path `$logPath -Filter "`$(`$_.BaseName)_*.log" | Sort-Object CreationTime -Descending
        if (`$archives.Count -gt `$maxLogFiles) {
            `$archives | Select-Object -Skip `$maxLogFiles | Remove-Item -Force
        }
    }
}
"@

Set-Content -Path "C:\barcode-app\rotate-logs.ps1" -Value $logRotationScript

# Schedule log rotation (run daily)
schtasks /create /tn "Barcode Log Rotation" /tr "powershell.exe -File C:\barcode-app\rotate-logs.ps1" /sc daily /st 02:00
```

### Phase 11: Backup and Recovery

#### 11.1 Create Backup Script
```powershell
$backupScript = @"
# Backup Script for Barcode Management System
`$backupPath = "C:\barcode-backups"
`$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# Create backup directory
New-Item -ItemType Directory -Path `$backupPath -Force

# Backup application files
Compress-Archive -Path "C:\barcode-app" -DestinationPath "`$backupPath\barcode-app_`$timestamp.zip"

# Backup nginx configuration
Compress-Archive -Path "C:\nginx\conf" -DestinationPath "`$backupPath\nginx-conf_`$timestamp.zip"

# Backup SSL certificates
Compress-Archive -Path "C:\nginx\ssl" -DestinationPath "`$backupPath\ssl-certs_`$timestamp.zip"

# Backup database (if accessible)
# mysqldump -u username -p database_name > "`$backupPath\database_`$timestamp.sql"

Write-Host "Backup completed: `$backupPath"
"@

Set-Content -Path "C:\barcode-app\backup-system.ps1" -Value $backupScript
```

#### 11.2 Schedule Backups
```powershell
# Schedule daily backups
schtasks /create /tn "Barcode System Backup" /tr "powershell.exe -File C:\barcode-app\backup-system.ps1" /sc daily /st 01:00
```

### Phase 12: Security Hardening

#### 12.1 Update Default Passwords
```powershell
# Change SSL certificate password
# Regenerate certificates with new password
.\deployment\windows-server-2019\ssl\generate_certificates.ps1 -CertPassword "YourNewSecurePassword123!"

# Update application secret key
# Edit C:\barcode-app\.env and change SECRET_KEY
```

#### 12.2 Configure Windows Firewall
```powershell
# Restrict access to management ports
New-NetFirewallRule -DisplayName "Block Management Ports" -Direction Inbound -Protocol TCP -LocalPort 22,3389 -Action Block -RemoteAddress "Internet"

# Allow only specific IPs for management (if needed)
New-NetFirewallRule -DisplayName "Allow Management IPs" -Direction Inbound -Protocol TCP -LocalPort 22,3389 -Action Allow -RemoteAddress "192.168.0.0/24"
```

### Phase 13: Final Verification

#### 13.1 Complete System Test
```powershell
# Test all endpoints
$endpoints = @(
    "http://192.168.0.106/",
    "http://192.168.0.106/health/",
    "http://192.168.0.106/api/v1/",
    "http://192.168.0.249/",
    "http://192.168.0.249/health/",
    "http://192.168.0.249/api/v1/"
)

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri $endpoint -UseBasicParsing -TimeoutSec 10
        Write-Host "✅ $endpoint - Status: $($response.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "❌ $endpoint - Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

#### 13.2 Performance Test
```powershell
# Load test the system
$concurrentRequests = 50
$totalRequests = 200

Write-Host "Starting load test with $concurrentRequests concurrent requests, $totalRequests total requests"

$jobs = @()
for ($i = 1; $i -le $totalRequests; $i++) {
    $job = Start-Job -ScriptBlock {
        param($url)
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
            return @{Success = $true; StatusCode = $response.StatusCode; ResponseTime = $response.Headers.'X-Response-Time'}
        } catch {
            return @{Success = $false; Error = $_.Exception.Message}
        }
    } -ArgumentList "http://192.168.0.106/health/"
    
    $jobs += $job
    
    if ($jobs.Count -ge $concurrentRequests) {
        # Wait for some jobs to complete
        $completed = $jobs | Where-Object {$_.State -eq "Completed"}
        if ($completed.Count -gt 0) {
            $completed | Remove-Job
            $jobs = $jobs | Where-Object {$_.State -ne "Completed"}
        }
    }
}

# Wait for all jobs to complete
$jobs | Wait-Job | Out-Null

# Collect results
$results = $jobs | Receive-Job
$jobs | Remove-Job

$successCount = ($results | Where-Object {$_.Success}).Count
$failureCount = $results.Count - $successCount

Write-Host "Load test completed:"
Write-Host "  Success: $successCount" -ForegroundColor Green
Write-Host "  Failures: $failureCount" -ForegroundColor Red
Write-Host "  Success Rate: $([math]::Round(($successCount / $results.Count) * 100, 2))%"
```

### Phase 14: Documentation and Handover

#### 14.1 Create System Documentation
```powershell
# Generate system information report
$systemInfo = @"
# Barcode Management System - Deployment Report
Generated: $(Get-Date)

## System Information
- OS: $((Get-WmiObject -Class Win32_OperatingSystem).Caption)
- Architecture: $((Get-WmiObject -Class Win32_OperatingSystem).OSArchitecture)
- Total RAM: $([math]::Round((Get-WmiObject -Class Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)) GB
- Available RAM: $([math]::Round((Get-WmiObject -Class Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2)) GB

## Network Configuration
- Network 1: 192.168.0.106
- Network 2: 192.168.0.249

## Installed Services
$(Get-Service | Where-Object {$_.Name -like "*Barcode*"} | Format-Table Name, Status, StartType -AutoSize | Out-String)

## Application Paths
- Backend: C:\barcode-app\backend
- Frontend Network 1: C:\barcode-app\frontend-network1
- Frontend Network 2: C:\barcode-app\frontend-network2
- Logs: C:\barcode-app\logs
- Monitoring: C:\barcode-app\monitoring
- Nginx: C:\nginx
- SSL Certificates: C:\nginx\ssl

## Access URLs
- Network 1: http://192.168.0.106
- Network 2: http://192.168.0.249
- API Documentation: http://192.168.0.106/docs

## Management Commands
- Service Control: .\C:\barcode-app\manage-services.ps1 -Action [start|stop|restart|status|logs]
- Log Rotation: .\C:\barcode-app\rotate-logs.ps1
- System Backup: .\C:\barcode-app\backup-system.ps1
"@

Set-Content -Path "C:\barcode-app\DEPLOYMENT_REPORT.md" -Value $systemInfo
```

#### 14.2 Create Maintenance Checklist
```powershell
$maintenanceChecklist = @"
# Barcode Management System - Maintenance Checklist

## Daily Tasks
- [ ] Check service status: .\manage-services.ps1 -Action status
- [ ] Review error logs: .\manage-services.ps1 -Action logs
- [ ] Verify health endpoints are responding
- [ ] Check disk space usage
- [ ] Verify directory structure: .\verify-directories.ps1
- [ ] Check static file directory permissions
- [ ] Monitor upload directory disk usage

## Weekly Tasks
- [ ] Review health monitoring reports
- [ ] Check auto-recovery logs
- [ ] Verify backup completion
- [ ] Review alerting system status
- [ ] Clean up temporary files in cache directories
- [ ] Verify upload directory permissions
- [ ] Check static file directory integrity

## Monthly Tasks
- [ ] Update SSL certificates (if needed)
- [ ] Review and clean old log files
- [ ] Check database performance
- [ ] Update system documentation
- [ ] Review security configurations
- [ ] Audit directory permissions and ownership
- [ ] Clean up old upload files and temporary data
- [ ] Verify backup directory integrity

## Quarterly Tasks
- [ ] Full system backup and restore test
- [ ] Performance optimization review
- [ ] Security audit
- [ ] Update all software components
- [ ] Review and update monitoring rules

## Emergency Procedures
- [ ] Service restart: .\manage-services.ps1 -Action restart
- [ ] Individual service restart: Restart-Service -Name "ServiceName"
- [ ] Log analysis: Get-Content "C:\barcode-app\logs\service.log" -Tail 50
- [ ] Health check: Invoke-WebRequest -Uri "http://192.168.0.106/health/"
- [ ] Database connectivity test
- [ ] Network connectivity test
- [ ] Directory structure verification: .\verify-directories.ps1
- [ ] Recreate missing directories: .\create-directories.ps1 -Force
- [ ] Check file permissions: icacls C:\barcode-app /T
- [ ] Verify static file access: Test-Path C:\barcode-app\static
"@

Set-Content -Path "C:\barcode-app\MAINTENANCE_CHECKLIST.md" -Value $maintenanceChecklist
```

## 🎉 Deployment Complete!

Your dual network Barcode Management System is now fully deployed and operational. The system includes:

- ✅ 3 backend service instances with load balancing
- ✅ Dual network support (192.168.0.106 & 192.168.0.249)
- ✅ Health monitoring and auto-recovery
- ✅ SSL/TLS encryption for both networks
- ✅ Comprehensive alerting system
- ✅ Automated backup and log rotation
- ✅ Windows service management
- ✅ Performance optimization
- ✅ Security hardening
- ✅ Complete directory structure with proper permissions
- ✅ Backend directory handling and file upload support
- ✅ Static file serving and cache management
- ✅ Database directory management and backup support

### Next Steps:
1. Test all functionality thoroughly
2. Configure monitoring alerts
3. Set up regular maintenance schedule
4. Train operations team on management procedures
5. Document any custom configurations

### Support Resources:
- Service Management: `.\C:\barcode-app\manage-services.ps1`
- Directory Management: `.\C:\barcode-app\verify-directories.ps1`
- Directory Creation: `.\deployment\windows-server-2019\scripts\create-directories.ps1`
- Documentation: `C:\barcode-app\README.md`
- Directory Structure: `C:\barcode-app\DIRECTORY_STRUCTURE.md`
- Maintenance Guide: `C:\barcode-app\MAINTENANCE_CHECKLIST.md`
- Deployment Report: `C:\barcode-app\DEPLOYMENT_REPORT.md`

