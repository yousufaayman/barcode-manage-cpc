# Windows Server 2019 Backend Setup Script
# Run this script as Administrator from the project root directory
# Expected structure: barcode-manage-cpc/
# ├── backend/
# ├── frontend/
# └── deployment/windows-server-2019/
#     └── backend-setup.ps1 (this script)

Write-Host "Setting up Barcode Management Backend on Windows Server 2019..." -ForegroundColor Green

# Get the project root directory (two levels up from this script)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
Write-Host "Project root directory: $projectRoot" -ForegroundColor Cyan

# 1. Check if Python is already installed
Write-Host "Checking if Python is already installed..." -ForegroundColor Yellow
$pythonInstalled = $false

# Check multiple possible Python installations
$pythonPaths = @(
    "python",
    "python3",
    "python3.11",
    "C:\Python311\python.exe",
    "C:\Python310\python.exe",
    "C:\Python39\python.exe",
    "C:\Program Files\Python311\python.exe",
    "C:\Program Files\Python310\python.exe",
    "C:\Program Files\Python39\python.exe",
    "C:\Program Files (x86)\Python311\python.exe",
    "C:\Program Files (x86)\Python310\python.exe",
    "C:\Program Files (x86)\Python39\python.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python311\python.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python310\python.exe"
)

foreach ($pythonPath in $pythonPaths) {
    try {
        $pythonVersion = & $pythonPath --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Python found: $pythonPath - $pythonVersion" -ForegroundColor Green
            $pythonInstalled = $true
            $pythonCommand = $pythonPath
            break
        }
    }
    catch {
        # Continue checking other paths
    }
}

# 2. Install Python 3.11 only if not already installed
if (-not $pythonInstalled) {
    Write-Host "Python not found. Installing Python 3.11..." -ForegroundColor Yellow
    $pythonUrl = "https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe"
    $pythonInstaller = "$env:TEMP\python-3.11.8-amd64.exe"

    Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonInstaller
    Start-Process -FilePath $pythonInstaller -ArgumentList "/quiet", "InstallAllUsers=1", "PrependPath=1" -Wait

    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    # Set the Python command to the newly installed version
    $pythonCommand = "C:\Python311\python.exe"
} else {
    Write-Host "Python is already installed. Skipping Python installation." -ForegroundColor Green
}

# 3. Clean up old configurations
$appDir = "C:\barcode-app\backend"
if (Test-Path $appDir) {
    Write-Host "Found existing backend installation. Cleaning up old configurations..." -ForegroundColor Yellow
    Remove-Item -Path $appDir -Recurse -Force
    Write-Host "Old backend directory removed: $appDir" -ForegroundColor Green
}

# 4. Create fresh application directory
Write-Host "Creating fresh application directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $appDir -Force

# 5. Copy backend files from project root
Write-Host "Copying backend files..." -ForegroundColor Yellow
$backendSource = Join-Path $projectRoot "backend"
Copy-Item -Path "$backendSource\*" -Destination $appDir -Recurse -Force

# 6. Copy the service runner script
Write-Host "Setting up service runner..." -ForegroundColor Yellow
$serviceRunnerSource = Join-Path $scriptDir "backend\run_service.py"
Copy-Item -Path $serviceRunnerSource -Destination $appDir -Force

# 7. Install Python dependencies
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
Set-Location $appDir
& $pythonCommand -m pip install --upgrade pip
& $pythonCommand -m pip install -r requirements.txt

# 8. Create .env file if it doesn't exist
$envPath = "C:\barcode-app\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "Creating .env file template..." -ForegroundColor Yellow
    Write-Host "Please update the .env file with your database credentials:" -ForegroundColor Cyan
    
    $envTemplate = @"
# Database Configuration (Update with your existing MySQL credentials)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=your_database_name

# Application Configuration
SECRET_KEY=your-secret-key-here-change-this-in-production
CORS_ORIGINS=http://localhost:3000,http://your-domain.com

# Backend Configuration
HOST=0.0.0.0
PORT=5000
RELOAD=false

# Production Settings
WORKERS=4
WORKER_CLASS=uvicorn.workers.UvicornWorker
ACCESS_LOG=true
LOG_LEVEL=warning
LIMIT_CONCURRENCY=1000
LIMIT_MAX_REQUESTS=1000
"@

    New-Item -ItemType Directory -Path "C:\barcode-app" -Force
    Set-Content -Path $envPath -Value $envTemplate
    
    Write-Host "Environment file created at: $envPath" -ForegroundColor Green
    Write-Host "IMPORTANT: Update the .env file with your actual database credentials before starting the service!" -ForegroundColor Red
} else {
    Write-Host "Environment file already exists at: $envPath" -ForegroundColor Green
}

# 9. Create Windows Service
Write-Host "Creating Windows Service..." -ForegroundColor Yellow
$serviceName = "BarcodeBackend"
$serviceDisplayName = "Barcode Management Backend"
$serviceDescription = "FastAPI backend service for barcode management system"

# Check if NSSM is available (Non-Sucking Service Manager)
$nssmPath = "C:\nssm\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Host "NSSM not found. Please install NSSM for Windows service management:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://nssm.cc/" -ForegroundColor Cyan
    Write-Host "2. Extract to C:\nssm\" -ForegroundColor Cyan
    Write-Host "3. Run this script again" -ForegroundColor Cyan
    Write-Host "Alternatively, you can run the backend manually:" -ForegroundColor Cyan
    Write-Host "   cd $appDir" -ForegroundColor Cyan
    Write-Host "   $pythonCommand run_service.py" -ForegroundColor Cyan
} else {
    # Install service using NSSM
    & $nssmPath install $serviceName $pythonCommand "$appDir\run_service.py"
    & $nssmPath set $serviceName DisplayName $serviceDisplayName
    & $nssmPath set $serviceName Description $serviceDescription
    & $nssmPath set $serviceName AppDirectory $appDir
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    
    Write-Host "Windows service '$serviceName' created successfully!" -ForegroundColor Green
    Write-Host "To start the service: Start-Service $serviceName" -ForegroundColor Cyan
    Write-Host "To stop the service: Stop-Service $serviceName" -ForegroundColor Cyan
}

# 10. Configure firewall
Write-Host "Configuring firewall..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "Barcode Backend API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -ErrorAction SilentlyContinue

Write-Host "Backend setup completed!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Update the .env file at $envPath with your database credentials" -ForegroundColor Cyan
Write-Host "2. Test the backend: cd $appDir && $pythonCommand run_service.py" -ForegroundColor Cyan
Write-Host "3. If NSSM is installed, start the service: Start-Service $serviceName" -ForegroundColor Cyan
Write-Host "4. Test the API: http://localhost:5000/docs" -ForegroundColor Cyan 