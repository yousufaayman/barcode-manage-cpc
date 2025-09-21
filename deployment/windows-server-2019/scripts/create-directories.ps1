# Directory Creation Script for Barcode Management System
# Windows Server 2019 Deployment
# Creates all necessary directories and sets proper permissions

param(
    [string]$BasePath = "C:\barcode-app",
    [string]$NginxPath = "C:\nginx",
    [switch]$Force = $false
)

Write-Host "📁 Creating Directory Structure for Barcode Management System" -ForegroundColor Green
Write-Host "Base Path: $BasePath" -ForegroundColor Cyan
Write-Host "Nginx Path: $NginxPath" -ForegroundColor Cyan

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Function to create directory with proper permissions
function Create-DirectoryWithPermissions {
    param(
        [string]$Path,
        [string]$Description,
        [string]$Permissions = "FullControl"
    )
    
    try {
        if (Test-Path $Path) {
            if ($Force) {
                Write-Host "  🔄 Recreating: $Description" -ForegroundColor Yellow
                Remove-Item -Path $Path -Recurse -Force
            } else {
                Write-Host "  ✅ Exists: $Description" -ForegroundColor Green
                return
            }
        }
        
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        Write-Host "  ✅ Created: $Description" -ForegroundColor Green
        
        # Set permissions for IIS_IUSRS and SYSTEM
        $acl = Get-Acl $Path
        $accessRule1 = New-Object System.Security.AccessControl.FileSystemAccessRule("IIS_IUSRS", $Permissions, "ContainerInherit,ObjectInherit", "None", "Allow")
        $accessRule2 = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", $Permissions, "ContainerInherit,ObjectInherit", "None", "Allow")
        $accessRule3 = New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators", $Permissions, "ContainerInherit,ObjectInherit", "None", "Allow")
        
        $acl.SetAccessRule($accessRule1)
        $acl.SetAccessRule($accessRule2)
        $acl.SetAccessRule($accessRule3)
        Set-Acl -Path $Path -AclObject $acl
        
    } catch {
        Write-Host "  ❌ Error creating $Description`: $($_.Exception.Message)" -ForegroundColor Red
    }
}

try {
    # 1. Main Application Directories
    Write-Host "`n🏗️  Creating Main Application Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path $BasePath -Description "Main Application Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\backend" -Description "Backend Application Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\frontend-network1" -Description "Frontend Network 1 Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\frontend-network2" -Description "Frontend Network 2 Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\monitoring" -Description "Monitoring Scripts Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\logs" -Description "Application Logs Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\backups" -Description "Backup Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\temp" -Description "Temporary Files Directory"
    
    # 2. Backend Specific Directories
    Write-Host "`n🔧 Creating Backend Specific Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path "$BasePath\backend\logs" -Description "Backend Logs Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\backend\temp" -Description "Backend Temporary Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\backend\cache" -Description "Backend Cache Directory"
    
    # 3. Static File Directories (from backend configuration)
    Write-Host "`n📁 Creating Static File Directories..." -ForegroundColor Cyan
    
    # Job Order Images Directory (from JOB_ORDER_IMAGE_UPLOAD_DIR)
    $staticPath = "S:\CS_Projects\Projects\barcode-manage-cpc\static"
    Create-DirectoryWithPermissions -Path $staticPath -Description "Job Order Images Directory (Static Files)"
    
    # Alternative static path for production
    $prodStaticPath = "$BasePath\static"
    Create-DirectoryWithPermissions -Path $prodStaticPath -Description "Production Static Files Directory"
    
    # 4. Nginx Directories
    Write-Host "`n🌐 Creating Nginx Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path $NginxPath -Description "Nginx Root Directory"
    Create-DirectoryWithPermissions -Path "$NginxPath\conf" -Description "Nginx Configuration Directory"
    Create-DirectoryWithPermissions -Path "$NginxPath\logs" -Description "Nginx Logs Directory"
    Create-DirectoryWithPermissions -Path "$NginxPath\ssl" -Description "SSL Certificates Directory"
    Create-DirectoryWithPermissions -Path "$NginxPath\html" -Description "Nginx HTML Directory"
    Create-DirectoryWithPermissions -Path "$NginxPath\temp" -Description "Nginx Temporary Directory"
    
    # 5. Database Related Directories
    Write-Host "`n🗄️  Creating Database Related Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path "$BasePath\database" -Description "Database Backup Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\database\backups" -Description "Database Backup Storage"
    Create-DirectoryWithPermissions -Path "$BasePath\database\scripts" -Description "Database Scripts Directory"
    
    # 6. Monitoring and Alerting Directories
    Write-Host "`n📊 Creating Monitoring Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path "$BasePath\monitoring\reports" -Description "Health Monitoring Reports"
    Create-DirectoryWithPermissions -Path "$BasePath\monitoring\alerts" -Description "Alert Configuration Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\monitoring\logs" -Description "Monitoring Logs Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\monitoring\data" -Description "Monitoring Data Directory"
    
    # 7. File Upload Directories
    Write-Host "`n📤 Creating File Upload Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path "$BasePath\uploads" -Description "General Upload Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\uploads\barcodes" -Description "Barcode Upload Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\uploads\job-orders" -Description "Job Order Upload Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\uploads\templates" -Description "Template Upload Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\uploads\exports" -Description "Export Files Directory"
    
    # 8. Cache and Session Directories
    Write-Host "`n💾 Creating Cache and Session Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path "$BasePath\cache" -Description "Application Cache Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\cache\sessions" -Description "Session Cache Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\cache\static" -Description "Static File Cache Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\cache\api" -Description "API Response Cache Directory"
    
    # 9. Security and SSL Directories
    Write-Host "`n🔒 Creating Security Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path "$BasePath\security" -Description "Security Configuration Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\security\keys" -Description "Security Keys Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\security\certificates" -Description "Security Certificates Directory"
    
    # 10. Development and Testing Directories
    Write-Host "`n🧪 Creating Development Directories..." -ForegroundColor Cyan
    
    Create-DirectoryWithPermissions -Path "$BasePath\dev" -Description "Development Files Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\dev\test-data" -Description "Test Data Directory"
    Create-DirectoryWithPermissions -Path "$BasePath\dev\scripts" -Description "Development Scripts Directory"
    
    # 11. Create directory structure information file
    Write-Host "`n📋 Creating Directory Structure Documentation..." -ForegroundColor Yellow
    
    $directoryInfo = @"
# Barcode Management System - Directory Structure
Generated: $(Get-Date)

## Main Application Directories
- $BasePath\ - Main application directory
- $BasePath\backend\ - Backend application files
- $BasePath\frontend-network1\ - Frontend for Network 1 (192.168.0.106)
- $BasePath\frontend-network2\ - Frontend for Network 2 (192.168.0.249)
- $BasePath\monitoring\ - Monitoring and health check scripts
- $BasePath\logs\ - Application logs
- $BasePath\backups\ - System backups
- $BasePath\temp\ - Temporary files

## Backend Specific Directories
- $BasePath\backend\logs\ - Backend service logs
- $BasePath\backend\temp\ - Backend temporary files
- $BasePath\backend\cache\ - Backend cache files

## Static File Directories
- $staticPath\ - Job order images (development)
- $prodStaticPath\ - Production static files
- $BasePath\uploads\ - File upload directories
- $BasePath\uploads\barcodes\ - Barcode uploads
- $BasePath\uploads\job-orders\ - Job order uploads
- $BasePath\uploads\templates\ - Template uploads
- $BasePath\uploads\exports\ - Export files

## Nginx Directories
- $NginxPath\ - Nginx root directory
- $NginxPath\conf\ - Nginx configuration
- $NginxPath\logs\ - Nginx logs
- $NginxPath\ssl\ - SSL certificates
- $NginxPath\html\ - Nginx HTML files
- $NginxPath\temp\ - Nginx temporary files

## Database Directories
- $BasePath\database\ - Database related files
- $BasePath\database\backups\ - Database backups
- $BasePath\database\scripts\ - Database scripts

## Monitoring Directories
- $BasePath\monitoring\reports\ - Health monitoring reports
- $BasePath\monitoring\alerts\ - Alert configurations
- $BasePath\monitoring\logs\ - Monitoring logs
- $BasePath\monitoring\data\ - Monitoring data

## Cache Directories
- $BasePath\cache\ - Application cache
- $BasePath\cache\sessions\ - Session cache
- $BasePath\cache\static\ - Static file cache
- $BasePath\cache\api\ - API response cache

## Security Directories
- $BasePath\security\ - Security configurations
- $BasePath\security\keys\ - Security keys
- $BasePath\security\certificates\ - Security certificates

## Development Directories
- $BasePath\dev\ - Development files
- $BasePath\dev\test-data\ - Test data
- $BasePath\dev\scripts\ - Development scripts

## Directory Permissions
All directories are created with the following permissions:
- IIS_IUSRS: Full Control (for web server access)
- SYSTEM: Full Control (for system access)
- Administrators: Full Control (for administrative access)

## Notes
- Directories are created with proper inheritance settings
- All paths use Windows-style backslashes
- Static file directories support both development and production paths
- Cache directories are created for performance optimization
- Security directories are prepared for SSL certificates and keys
"@
    
    Set-Content -Path "$BasePath\DIRECTORY_STRUCTURE.md" -Value $directoryInfo
    
    # 12. Create a directory verification script
    Write-Host "`n🔍 Creating Directory Verification Script..." -ForegroundColor Yellow
    
    $verificationScript = @"
# Directory Verification Script
# Verifies all required directories exist and have proper permissions

`$requiredDirs = @(
    "$BasePath",
    "$BasePath\backend",
    "$BasePath\frontend-network1",
    "$BasePath\frontend-network2",
    "$BasePath\monitoring",
    "$BasePath\logs",
    "$BasePath\backups",
    "$BasePath\temp",
    "$BasePath\backend\logs",
    "$BasePath\backend\temp",
    "$BasePath\backend\cache",
    "$BasePath\static",
    "$BasePath\uploads",
    "$BasePath\uploads\barcodes",
    "$BasePath\uploads\job-orders",
    "$BasePath\uploads\templates",
    "$BasePath\uploads\exports",
    "$BasePath\cache",
    "$BasePath\cache\sessions",
    "$BasePath\cache\static",
    "$BasePath\cache\api",
    "$BasePath\database",
    "$BasePath\database\backups",
    "$BasePath\database\scripts",
    "$BasePath\monitoring\reports",
    "$BasePath\monitoring\alerts",
    "$BasePath\monitoring\logs",
    "$BasePath\monitoring\data",
    "$BasePath\security",
    "$BasePath\security\keys",
    "$BasePath\security\certificates",
    "$BasePath\dev",
    "$BasePath\dev\test-data",
    "$BasePath\dev\scripts",
    "$NginxPath",
    "$NginxPath\conf",
    "$NginxPath\logs",
    "$NginxPath\ssl",
    "$NginxPath\html",
    "$NginxPath\temp"
)

Write-Host "🔍 Verifying Directory Structure..." -ForegroundColor Green

`$missingDirs = @()
`$existingDirs = @()

foreach (`$dir in `$requiredDirs) {
    if (Test-Path `$dir) {
        `$existingDirs += `$dir
        Write-Host "  ✅ `$dir" -ForegroundColor Green
    } else {
        `$missingDirs += `$dir
        Write-Host "  ❌ `$dir" -ForegroundColor Red
    }
}

Write-Host "`n📊 Verification Results:" -ForegroundColor Cyan
Write-Host "  Total Directories: `$(`$requiredDirs.Count)" -ForegroundColor White
Write-Host "  Existing: `$(`$existingDirs.Count)" -ForegroundColor Green
Write-Host "  Missing: `$(`$missingDirs.Count)" -ForegroundColor Red

if (`$missingDirs.Count -gt 0) {
    Write-Host "`n❌ Missing Directories:" -ForegroundColor Red
    foreach (`$dir in `$missingDirs) {
        Write-Host "  - `$dir" -ForegroundColor Red
    }
    Write-Host "`nRun the create-directories.ps1 script to create missing directories." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "`n✅ All required directories exist!" -ForegroundColor Green
    exit 0
}
"@
    
    Set-Content -Path "$BasePath\verify-directories.ps1" -Value $verificationScript
    
    Write-Host "`n✅ Directory creation completed successfully!" -ForegroundColor Green
    Write-Host "📁 Created directories in: $BasePath" -ForegroundColor Cyan
    Write-Host "📁 Created Nginx directories in: $NginxPath" -ForegroundColor Cyan
    Write-Host "📋 Documentation created: $BasePath\DIRECTORY_STRUCTURE.md" -ForegroundColor Cyan
    Write-Host "🔍 Verification script created: $BasePath\verify-directories.ps1" -ForegroundColor Cyan
    
    Write-Host "`n📋 Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Run verification script: .\verify-directories.ps1" -ForegroundColor White
    Write-Host "2. Continue with backend installation" -ForegroundColor White
    Write-Host "3. Configure environment variables" -ForegroundColor White
    Write-Host "4. Install and configure services" -ForegroundColor White
    
} catch {
    Write-Host "`n❌ Error creating directories: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
