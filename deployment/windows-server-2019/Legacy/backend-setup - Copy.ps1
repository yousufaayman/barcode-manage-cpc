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

# 1. Install Python 3.11
Write-Host "Installing Python 3.11..." -ForegroundColor Yellow
$pythonUrl = "https://www.python.org/ftp/python/3.11.8/python-3.11.8-amd64.exe"
$pythonInstaller = "$env:TEMP\python-3.11.8-amd64.exe"

Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonInstaller
Start-Process -FilePath $pythonInstaller -ArgumentList "/quiet", "InstallAllUsers=1", "PrependPath=1" -Wait

# Refresh environment variables
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 2. Create application directory
$appDir = "C:\barcode-app\backend"
New-Item -ItemType Directory -Path $appDir -Force

# 3. Copy backend files from project root
Write-Host "Copying backend files..." -ForegroundColor Yellow
$backendSource = Join-Path $projectRoot "backend"
Copy-Item -Path "$backendSource\*" -Destination $appDir -Recurse -Force

# 4. Copy the service runner script
Write-Host "Setting up service runner..." -ForegroundColor Yellow
$serviceRunnerSource = Join-Path $scriptDir "backend\run_service.py"
Copy-Item -Path $serviceRunnerSource -Destination $appDir -Force

# 5. Install Python dependencies
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
Set-Location $appDir
python -m pip install --upgrade pip
pip install -r requirements.txt

# 6. Create .env file if it doesn't exist
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
"@

    New-Item -ItemType Directory -Path "C:\barcode-app" -Force
    Set-Content -Path $envPath -Value $envTemplate
    
    Write-Host "Environment file created at: $envPath" -ForegroundColor Green
    Write-Host "IMPORTANT: Update the .env file with your actual database credentials before starting the service!" -ForegroundColor Red
} else {
    Write-Host "Environment file already exists at: $envPath" -ForegroundColor Green
}

# 7. Create Windows Service
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
    Write-Host "   python run_service.py" -ForegroundColor Cyan
} else {
    # Install service using NSSM
    & $nssmPath install $serviceName "C:\Python311\python.exe" "$appDir\run_service.py"
    & $nssmPath set $serviceName DisplayName $serviceDisplayName
    & $nssmPath set $serviceName Description $serviceDescription
    & $nssmPath set $serviceName AppDirectory $appDir
    & $nssmPath set $serviceName Start SERVICE_AUTO_START
    
    Write-Host "Windows service '$serviceName' created successfully!" -ForegroundColor Green
    Write-Host "To start the service: Start-Service $serviceName" -ForegroundColor Cyan
    Write-Host "To stop the service: Stop-Service $serviceName" -ForegroundColor Cyan
}

# 8. Configure firewall
Write-Host "Configuring firewall..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "Barcode Backend API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -ErrorAction SilentlyContinue

Write-Host "Backend setup completed!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Update the .env file at $envPath with your database credentials" -ForegroundColor Cyan
Write-Host "2. Test the backend: cd $appDir && python run_service.py" -ForegroundColor Cyan
Write-Host "3. If NSSM is installed, start the service: Start-Service $serviceName" -ForegroundColor Cyan
Write-Host "4. Test the API: http://localhost:5000/docs" -ForegroundColor Cyan 