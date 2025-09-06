# Windows Service Installation Script for Dual Network Barcode Management System
# Installs all backend services, monitoring services, and nginx
# Windows Server 2019 Deployment

param(
    [string]$ProjectRoot = "",
    [string]$PythonPath = "",
    [switch]$Force = $false,
    [switch]$SkipNginx = $false
)

Write-Host "🚀 Installing Barcode Management System Services" -ForegroundColor Green
Write-Host "Dual Network Deployment - Windows Server 2019" -ForegroundColor Cyan

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Please right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Get project root directory
if (-not $ProjectRoot) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ProjectRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
}
Write-Host "📁 Project Root: $ProjectRoot" -ForegroundColor Cyan

# Find Python installation
if (-not $PythonPath) {
    Write-Host "🔍 Searching for Python installation..." -ForegroundColor Yellow
    $pythonPaths = @(
        "python",
        "python3",
        "python3.11",
        "C:\Python311\python.exe",
        "C:\Python310\python.exe",
        "C:\Python39\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Program Files\Python310\python.exe",
        "C:\Program Files\Python39\python.exe"
    )
    
    foreach ($pythonPath in $pythonPaths) {
        try {
            $pythonVersion = & $pythonPath --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Python found: $pythonPath - $pythonVersion" -ForegroundColor Green
                $PythonPath = $pythonPath
                break
            }
        }
        catch {
            # Continue checking other paths
        }
    }
    
    if (-not $PythonPath) {
        Write-Host "❌ Python not found. Please install Python 3.11 or later." -ForegroundColor Red
        exit 1
    }
}

# Check if NSSM is available
$nssmPath = "C:\nssm\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Host "❌ NSSM (Non-Sucking Service Manager) not found!" -ForegroundColor Red
    Write-Host "Please download and install NSSM:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://nssm.cc/download" -ForegroundColor Cyan
    Write-Host "2. Extract to C:\nssm\" -ForegroundColor Cyan
    Write-Host "3. Run this script again" -ForegroundColor Cyan
    exit 1
}

# Service configurations
$services = @(
    @{
        Name = "BarcodeBackend_Service_1"
        DisplayName = "Barcode Backend Service 1"
        Description = "FastAPI backend service instance 1 (Port 5000)"
        Script = "run_service_1.py"
        Port = 5000
    },
    @{
        Name = "BarcodeBackend_Service_2"
        DisplayName = "Barcode Backend Service 2"
        Description = "FastAPI backend service instance 2 (Port 5001)"
        Script = "run_service_2.py"
        Port = 5001
    },
    @{
        Name = "BarcodeBackend_Service_3"
        DisplayName = "Barcode Backend Service 3"
        Description = "FastAPI backend service instance 3 (Port 5002)"
        Script = "run_service_3.py"
        Port = 5002
    },
    @{
        Name = "BarcodeHealthMonitorDual"
        DisplayName = "Barcode Health Monitor Dual"
        Description = "Health monitoring service for dual network deployment"
        Script = "health_monitor.py"
        Port = 0
    },
    @{
        Name = "BarcodeAutoRecoveryDual"
        DisplayName = "Barcode Auto Recovery Dual"
        Description = "Auto-recovery service with cross-instance health verification"
        Script = "auto_recovery.py"
        Port = 0
    }
)

# Create application directories
$appDir = "C:\barcode-app"
$backendDir = "$appDir\backend"
$monitoringDir = "$appDir\monitoring"
$logsDir = "$appDir\logs"

Write-Host "📁 Creating application directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
New-Item -ItemType Directory -Path $backendDir -Force | Out-Null
New-Item -ItemType Directory -Path $monitoringDir -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

# Copy backend files
Write-Host "📋 Copying backend files..." -ForegroundColor Yellow
$backendSource = Join-Path $ProjectRoot "backend"
Copy-Item -Path "$backendSource\*" -Destination $backendDir -Recurse -Force

# Copy service runner scripts
Write-Host "📋 Copying service runner scripts..." -ForegroundColor Yellow
$serviceScripts = @(
    "run_service_1.py",
    "run_service_2.py", 
    "run_service_3.py"
)

foreach ($script in $serviceScripts) {
    $sourcePath = Join-Path (Join-Path $ProjectRoot "deployment\windows-server-2019\backend") $script
    if (Test-Path $sourcePath) {
        Copy-Item -Path $sourcePath -Destination $backendDir -Force
        Write-Host "  ✅ Copied $script" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  $script not found at $sourcePath" -ForegroundColor Yellow
    }
}

# Copy monitoring scripts
Write-Host "📋 Copying monitoring scripts..." -ForegroundColor Yellow
$monitoringScripts = @(
    "health_monitor.py",
    "auto_recovery.py"
)

foreach ($script in $monitoringScripts) {
    $sourcePath = Join-Path (Join-Path $ProjectRoot "deployment\windows-server-2019\monitoring") $script
    if (Test-Path $sourcePath) {
        Copy-Item -Path $sourcePath -Destination $monitoringDir -Force
        Write-Host "  ✅ Copied $script" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  $script not found at $sourcePath" -ForegroundColor Yellow
    }
}

# Install Python dependencies
Write-Host "📦 Installing Python dependencies..." -ForegroundColor Yellow
Set-Location $backendDir
& $PythonPath -m pip install --upgrade pip
& $PythonPath -m pip install -r requirements.txt
& $PythonPath -m pip install aiohttp psutil pywin32

# Install monitoring dependencies
Set-Location $monitoringDir
& $PythonPath -m pip install aiohttp psutil pywin32

# Create .env file if it doesn't exist
$envPath = "$appDir\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "📝 Creating .env file template..." -ForegroundColor Yellow
    $envTemplate = @"
# Database Configuration (Update with your existing MySQL credentials)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=your_database_name

# Application Configuration
SECRET_KEY=your-secret-key-here-change-this-in-production
CORS_ORIGINS=http://192.168.0.106,http://192.168.0.249,https://192.168.0.106,https://192.168.0.249

# Backend Configuration
HOST=0.0.0.0
PORT=5000
RELOAD=false

# Production Settings
WORKERS=2
WORKER_CLASS=uvicorn.workers.UvicornWorker
ACCESS_LOG=true
LOG_LEVEL=info
LIMIT_CONCURRENCY=500
LIMIT_MAX_REQUESTS=500

# Dual Network Configuration
NETWORK1_IP=192.168.0.106
NETWORK2_IP=192.168.0.249
"@
    Set-Content -Path $envPath -Value $envTemplate
    Write-Host "✅ Environment file created at: $envPath" -ForegroundColor Green
    Write-Host "⚠️  IMPORTANT: Update the .env file with your actual database credentials!" -ForegroundColor Red
}

# Install Windows Services
Write-Host "`n🔧 Installing Windows Services..." -ForegroundColor Yellow

foreach ($service in $services) {
    $serviceName = $service.Name
    $displayName = $service.DisplayName
    $description = $service.Description
    $script = $service.Script
    $port = $service.Port
    
    Write-Host "`n📋 Installing service: $serviceName" -ForegroundColor Cyan
    
    # Determine working directory and script path
    if ($script -like "*monitor*" -or $script -like "*recovery*") {
        $workingDir = $monitoringDir
        $scriptPath = Join-Path $monitoringDir $script
    } else {
        $workingDir = $backendDir
        $scriptPath = Join-Path $backendDir $script
    }
    
    # Check if service already exists
    $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existingService) {
        if ($Force) {
            Write-Host "  🔄 Removing existing service..." -ForegroundColor Yellow
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            & $nssmPath remove $serviceName confirm
        } else {
            Write-Host "  ⚠️  Service $serviceName already exists. Use -Force to replace." -ForegroundColor Yellow
            continue
        }
    }
    
    # Install service using NSSM
    try {
        & $nssmPath install $serviceName $PythonPath $scriptPath
        & $nssmPath set $serviceName DisplayName $displayName
        & $nssmPath set $serviceName Description $description
        & $nssmPath set $serviceName AppDirectory $workingDir
        & $nssmPath set $serviceName Start SERVICE_AUTO_START
        
        # Set service to restart on failure
        & $nssmPath set $serviceName AppExit Default Restart
        & $nssmPath set $serviceName AppRestartDelay 5000
        & $nssmPath set $serviceName AppThrottle 1500
        
        # Set environment variables
        & $nssmPath set $serviceName AppEnvironmentExtra "PATH=$env:PATH" "PYTHONPATH=$workingDir"
        
        # Configure logging
        & $nssmPath set $serviceName AppStdout "$logsDir\$serviceName.log"
        & $nssmPath set $serviceName AppStderr "$logsDir\$serviceName_error.log"
        & $nssmPath set $serviceName AppStdoutCreationDisposition 4
        & $nssmPath set $serviceName AppStderrCreationDisposition 4
        
        Write-Host "  ✅ Service $serviceName installed successfully" -ForegroundColor Green
        
        # Configure firewall for backend services
        if ($port -gt 0) {
            $firewallRuleName = "Barcode Backend $serviceName"
            New-NetFirewallRule -DisplayName $firewallRuleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -ErrorAction SilentlyContinue
            Write-Host "  🔥 Firewall rule created for port $port" -ForegroundColor Green
        }
        
    } catch {
        Write-Host "  ❌ Failed to install service $serviceName : $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Install Nginx (if not skipped)
if (-not $SkipNginx) {
    Write-Host "`n🌐 Installing Nginx..." -ForegroundColor Yellow
    
    $nginxDir = "C:\nginx"
    $nginxConfigSource = Join-Path (Join-Path $ProjectRoot "deployment\windows-server-2019\nginx") "nginx.conf"
    
    if (-not (Test-Path $nginxDir)) {
        Write-Host "  📥 Downloading Nginx..." -ForegroundColor Yellow
        $nginxUrl = "http://nginx.org/download/nginx-1.24.0.zip"
        $nginxZip = "$env:TEMP\nginx.zip"
        
        try {
            Invoke-WebRequest -Uri $nginxUrl -OutFile $nginxZip
            Expand-Archive -Path $nginxZip -DestinationPath "C:\" -Force
            Rename-Item -Path "C:\nginx-1.24.0" -NewName "nginx" -Force
            Remove-Item -Path $nginxZip -Force
            Write-Host "  ✅ Nginx downloaded and extracted" -ForegroundColor Green
        } catch {
            Write-Host "  ❌ Failed to download Nginx: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    # Copy nginx configuration
    if (Test-Path $nginxConfigSource) {
        $nginxConfigDest = "$nginxDir\conf\nginx.conf"
        Copy-Item -Path $nginxConfigSource -Destination $nginxConfigDest -Force
        Write-Host "  ✅ Nginx configuration copied" -ForegroundColor Green
    }
    
    # Create nginx service
    $nginxServiceName = "BarcodeNginx"
    $nginxExe = "$nginxDir\nginx.exe"
    
    if (Test-Path $nginxExe) {
        try {
            & $nssmPath install $nginxServiceName $nginxExe
            & $nssmPath set $nginxServiceName DisplayName "Barcode Nginx Web Server"
            & $nssmPath set $nginxServiceName Description "Nginx web server for dual network barcode management system"
            & $nssmPath set $nginxServiceName AppDirectory $nginxDir
            & $nssmPath set $nginxServiceName Start SERVICE_AUTO_START
            
            # Configure logging
            & $nssmPath set $nginxServiceName AppStdout "$logsDir\nginx.log"
            & $nssmPath set $nginxServiceName AppStderr "$logsDir\nginx_error.log"
            
            Write-Host "  ✅ Nginx service installed" -ForegroundColor Green
            
            # Configure firewall for nginx
            New-NetFirewallRule -DisplayName "Barcode Nginx HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue
            New-NetFirewallRule -DisplayName "Barcode Nginx HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -ErrorAction SilentlyContinue
            Write-Host "  🔥 Firewall rules created for Nginx" -ForegroundColor Green
            
        } catch {
            Write-Host "  ❌ Failed to install Nginx service: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# Create service management script
Write-Host "`n📝 Creating service management script..." -ForegroundColor Yellow
$managementScript = @"
# Barcode Management System Service Control Script
# Dual Network Deployment - Windows Server 2019

param(
    [Parameter(Mandatory=`$true)]
    [ValidateSet("start", "stop", "restart", "status", "logs")]
    [string]`$Action,
    
    [string]`$ServiceName = "all"
)

`$services = @(
    "BarcodeBackend_Service_1",
    "BarcodeBackend_Service_2", 
    "BarcodeBackend_Service_3",
    "BarcodeHealthMonitorDual",
    "BarcodeAutoRecoveryDual",
    "BarcodeNginx"
)

function Show-ServiceStatus {
    param([string]`$Name)
    
    `$service = Get-Service -Name `$Name -ErrorAction SilentlyContinue
    if (`$service) {
        `$status = `$service.Status
        `$color = if (`$status -eq "Running") { "Green" } else { "Red" }
        Write-Host "  `$Name : `$status" -ForegroundColor `$color
    } else {
        Write-Host "  `$Name : Not Installed" -ForegroundColor Yellow
    }
}

function Start-Services {
    param([string]`$Name)
    
    if (`$Name -eq "all") {
        foreach (`$svc in `$services) {
            Write-Host "Starting `$svc..." -ForegroundColor Yellow
            Start-Service -Name `$svc -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "Starting `$Name..." -ForegroundColor Yellow
        Start-Service -Name `$Name -ErrorAction SilentlyContinue
    }
}

function Stop-Services {
    param([string]`$Name)
    
    if (`$Name -eq "all") {
        foreach (`$svc in `$services) {
            Write-Host "Stopping `$svc..." -ForegroundColor Yellow
            Stop-Service -Name `$svc -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "Stopping `$Name..." -ForegroundColor Yellow
        Stop-Service -Name `$Name -ErrorAction SilentlyContinue
    }
}

function Restart-Services {
    param([string]`$Name)
    
    if (`$Name -eq "all") {
        foreach (`$svc in `$services) {
            Write-Host "Restarting `$svc..." -ForegroundColor Yellow
            Restart-Service -Name `$svc -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "Restarting `$Name..." -ForegroundColor Yellow
        Restart-Service -Name `$Name -ErrorAction SilentlyContinue
    }
}

function Show-Logs {
    param([string]`$Name)
    
    `$logPath = "C:\barcode-app\logs"
    if (`$Name -eq "all") {
        Get-ChildItem -Path `$logPath -Filter "*.log" | ForEach-Object {
            Write-Host "`n=== `$(`$_.Name) ===" -ForegroundColor Cyan
            Get-Content -Path `$_.FullName -Tail 10
        }
    } else {
        `$logFile = Join-Path `$logPath "`$Name.log"
        if (Test-Path `$logFile) {
            Write-Host "=== `$Name Log ===" -ForegroundColor Cyan
            Get-Content -Path `$logFile -Tail 20
        } else {
            Write-Host "Log file not found: `$logFile" -ForegroundColor Red
        }
    }
}

switch (`$Action) {
    "start" { Start-Services -Name `$ServiceName }
    "stop" { Stop-Services -Name `$ServiceName }
    "restart" { Restart-Services -Name `$ServiceName }
    "status" { 
        Write-Host "Service Status:" -ForegroundColor Cyan
        foreach (`$svc in `$services) {
            Show-ServiceStatus -Name `$svc
        }
    }
    "logs" { Show-Logs -Name `$ServiceName }
}
"@

$managementScriptPath = "$appDir\manage-services.ps1"
Set-Content -Path $managementScriptPath -Value $managementScript
Write-Host "✅ Service management script created: $managementScriptPath" -ForegroundColor Green

Write-Host "`n🎉 Service installation completed!" -ForegroundColor Green
Write-Host "`n📋 Installed Services:" -ForegroundColor Cyan
foreach ($service in $services) {
    Write-Host "  - $($service.Name) : $($service.Description)" -ForegroundColor White
}

if (-not $SkipNginx) {
    Write-Host "  - BarcodeNginx : Nginx web server for dual network deployment" -ForegroundColor White
}

Write-Host "`n🔧 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Update the .env file at $envPath with your database credentials" -ForegroundColor White
Write-Host "2. Generate SSL certificates: .\generate_certificates.ps1" -ForegroundColor White
Write-Host "3. Start services: .\manage-services.ps1 -Action start" -ForegroundColor White
Write-Host "4. Check service status: .\manage-services.ps1 -Action status" -ForegroundColor White
Write-Host "5. View logs: .\manage-services.ps1 -Action logs" -ForegroundColor White

Write-Host "`n🌐 Access URLs:" -ForegroundColor Cyan
Write-Host "  - Network 1: http://192.168.0.106" -ForegroundColor White
Write-Host "  - Network 2: http://192.168.0.249" -ForegroundColor White
Write-Host "  - API Docs: http://192.168.0.106/docs" -ForegroundColor White

Write-Host "`n⚠️  Important Notes:" -ForegroundColor Yellow
Write-Host "  - Services are set to auto-start on boot" -ForegroundColor White
Write-Host "  - Health monitoring and auto-recovery are enabled" -ForegroundColor White
Write-Host "  - All services will restart automatically on failure" -ForegroundColor White
Write-Host "  - Logs are stored in: $logsDir" -ForegroundColor White

