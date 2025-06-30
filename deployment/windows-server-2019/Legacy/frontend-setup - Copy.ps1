# Windows Server 2019 Frontend Setup Script
# Run this script from the project root directory
# Prerequisites: Node.js and npm already installed
# Expected structure: barcode-manage-cpc/
# ├── backend/
# ├── frontend/
# └── deployment/windows-server-2019/
#     └── frontend-setup.ps1 (this script)

Write-Host "Setting up Barcode Management Frontend..." -ForegroundColor Green

# Get the project root directory (two levels up from this script)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
Write-Host "Project root directory: $projectRoot" -ForegroundColor Cyan

# Check if Node.js and npm are available
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js or npm not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# 1. Clean up old configuration
$deployDir = "C:\barcode-app\frontend"
Write-Host "Cleaning up old configuration..." -ForegroundColor Yellow
if (Test-Path $deployDir) {
    Write-Host "Removing old deployment directory: $deployDir" -ForegroundColor Yellow
    Remove-Item -Path $deployDir -Recurse -Force
}

# 2. Navigate to frontend directory
$frontendDir = Join-Path $projectRoot "frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host "Error: Frontend directory not found at $frontendDir" -ForegroundColor Red
    exit 1
}

Write-Host "Navigating to frontend directory: $frontendDir" -ForegroundColor Yellow
Set-Location $frontendDir

# 3. Install dependencies
Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# 4. Build the application
Write-Host "Building the application..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to build the application" -ForegroundColor Red
    exit 1
}

# 5. Create deployment directory
Write-Host "Creating deployment directory: $deployDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

# 6. Copy built files to deployment directory
$distDir = Join-Path $frontendDir "dist"
if (Test-Path $distDir) {
    Write-Host "Copying built files to deployment directory..." -ForegroundColor Yellow
    Copy-Item -Path "$distDir\*" -Destination $deployDir -Recurse -Force
} else {
    Write-Host "Warning: dist directory not found. Checking for build output..." -ForegroundColor Yellow
    # Check for common build output directories
    $possibleBuildDirs = @("build", "out", "public")
    $foundBuildDir = $null
    
    foreach ($dir in $possibleBuildDirs) {
        $checkDir = Join-Path $frontendDir $dir
        if (Test-Path $checkDir) {
            $foundBuildDir = $checkDir
            break
        }
    }
    
    if ($foundBuildDir) {
        Write-Host "Found build output in: $foundBuildDir" -ForegroundColor Green
        Copy-Item -Path "$foundBuildDir\*" -Destination $deployDir -Recurse -Force
    } else {
        Write-Host "Error: No build output found. Please check your build configuration." -ForegroundColor Red
        exit 1
    }
}

# 7. Ask user about IIS configuration
Write-Host "`nIIS Configuration Options:" -ForegroundColor Cyan
Write-Host "1. Create new IIS site (recommended for clean setup)" -ForegroundColor White
Write-Host "2. Update existing IIS site" -ForegroundColor White
Write-Host "3. Skip IIS configuration (manual setup)" -ForegroundColor White

$iisChoice = Read-Host "Enter your choice (1-3)"

switch ($iisChoice) {
    "1" {
        Write-Host "Setting up new IIS site..." -ForegroundColor Yellow
        
        # Check if IIS is installed
        try {
            Import-Module WebAdministration -ErrorAction Stop
        } catch {
            Write-Host "IIS not found. Installing IIS..." -ForegroundColor Yellow
            Install-WindowsFeature -Name Web-Server -IncludeManagementTools -ErrorAction SilentlyContinue
            Import-Module WebAdministration
        }
        
        $siteName = "BarcodeApp"
        $sitePort = 3000
        
        # Remove existing site if it exists
        Get-Website -Name $siteName -ErrorAction SilentlyContinue | Remove-Website
        
        # Create new IIS site
        New-Website -Name $siteName -Port $sitePort -PhysicalPath $deployDir -ApplicationPool "DefaultAppPool"
        
        # Configure firewall
        New-NetFirewallRule -DisplayName "Barcode Frontend Web" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -ErrorAction SilentlyContinue
        
        Write-Host "New IIS site created: $siteName on port $sitePort" -ForegroundColor Green
    }
    "2" {
        Write-Host "Updating existing IIS site..." -ForegroundColor Yellow
        
        try {
            Import-Module WebAdministration -ErrorAction Stop
            $siteName = "BarcodeApp"
            
            if (Get-Website -Name $siteName -ErrorAction SilentlyContinue) {
                Set-ItemProperty -Path "IIS:\Sites\$siteName" -Name "physicalPath" -Value $deployDir
                Write-Host "Updated existing IIS site: $siteName" -ForegroundColor Green
            } else {
                Write-Host "Site '$siteName' not found. Creating new site..." -ForegroundColor Yellow
                New-Website -Name $siteName -Port 3000 -PhysicalPath $deployDir -ApplicationPool "DefaultAppPool"
            }
        } catch {
            Write-Host "Error updating IIS site. Please configure manually." -ForegroundColor Red
        }
    }
    "3" {
        Write-Host "Skipping IIS configuration. Please configure manually." -ForegroundColor Yellow
    }
    default {
        Write-Host "Invalid choice. Skipping IIS configuration." -ForegroundColor Yellow
    }
}

# 8. Create web.config with reverse proxy for API calls
$webConfigPath = Join-Path $deployDir "web.config"
$webConfigContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <rule name="API Proxy" stopProcessing="true">
                    <match url="^api/(.*)" />
                    <action type="Rewrite" url="http://localhost:5000/api/{R:1}" />
                </rule>
                <rule name="SPA Routes" stopProcessing="true">
                    <match url=".*" />
                    <conditions logicalGrouping="MatchAll">
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                        <add input="{REQUEST_URI}" pattern="^/(api)" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="/" />
                </rule>
            </rules>
        </rewrite>
        <staticContent>
            <mimeMap fileExtension=".js" mimeType="application/javascript" />
            <mimeMap fileExtension=".css" mimeType="text/css" />
            <mimeMap fileExtension=".json" mimeType="application/json" />
            <mimeMap fileExtension=".woff" mimeType="application/font-woff" />
            <mimeMap fileExtension=".woff2" mimeType="application/font-woff2" />
        </staticContent>
        <httpErrors errorMode="Custom" existingResponse="Replace">
            <remove statusCode="404" />
            <error statusCode="404" path="/" responseMode="ExecuteURL" />
        </httpErrors>
    </system.webServer>
</configuration>
"@

Set-Content -Path $webConfigPath -Value $webConfigContent

Write-Host "`nFrontend setup completed successfully!" -ForegroundColor Green
Write-Host "Build output location: $deployDir" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Ensure backend is running on port 5000" -ForegroundColor Cyan
Write-Host "2. Access the application at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "3. Configure SSL certificate for production" -ForegroundColor Cyan 