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

# Installation Options
Write-Host "`nFrontend Installation Options:" -ForegroundColor Cyan
Write-Host "1. Clean Install - Remove all old installations and IIS configs, fresh setup" -ForegroundColor White
Write-Host "2. Parallel Install - Install second instance with separate IIS configuration" -ForegroundColor White

$installChoice = Read-Host "Enter your choice (1-2)"

# Initialize variables
$deployDir = ""
$siteName = ""
$sitePort = 0

switch ($installChoice) {
    "1" {
        Write-Host "`nPerforming Clean Install..." -ForegroundColor Yellow
        
        # Clean Install Configuration
        $deployDir = "C:\barcode-app\frontend"
        $siteName = "BarcodeApp"
        $sitePort = 3000
        
        # 1. Clean up old configuration
        Write-Host "Cleaning up old configuration..." -ForegroundColor Yellow
        
        # Remove old deployment directory
        if (Test-Path $deployDir) {
            Write-Host "Removing old deployment directory: $deployDir" -ForegroundColor Yellow
            Remove-Item -Path $deployDir -Recurse -Force
        }
        
        # Remove old IIS site
        try {
            Import-Module WebAdministration -ErrorAction Stop
            if (Get-Website -Name $siteName -ErrorAction SilentlyContinue) {
                Write-Host "Removing old IIS site: $siteName" -ForegroundColor Yellow
                Remove-Website -Name $siteName
            }
        } catch {
            Write-Host "IIS module not available or site not found" -ForegroundColor Yellow
        }
        
        # Remove old firewall rules
        Write-Host "Removing old firewall rules..." -ForegroundColor Yellow
        Remove-NetFirewallRule -DisplayName "Barcode Frontend Web" -ErrorAction SilentlyContinue
    }
    "2" {
        Write-Host "`nPerforming Parallel Install..." -ForegroundColor Yellow
        
        # Parallel Install Configuration
        $deployDir = "C:\barcode-app\frontend-parallel"
        $siteName = "BarcodeAppParallel"
        $sitePort = 3001
        
        # Check if parallel installation already exists
        if (Test-Path $deployDir) {
            Write-Host "Warning: Parallel installation already exists at: $deployDir" -ForegroundColor Yellow
            $overwrite = Read-Host "Do you want to overwrite it? (y/n)"
            if ($overwrite -eq "y" -or $overwrite -eq "Y") {
                Write-Host "Removing existing parallel installation..." -ForegroundColor Yellow
                Remove-Item -Path $deployDir -Recurse -Force
            } else {
                Write-Host "Installation cancelled." -ForegroundColor Red
                exit 1
            }
        }
        
        # Check if IIS site already exists
        try {
            Import-Module WebAdministration -ErrorAction Stop
            if (Get-Website -Name $siteName -ErrorAction SilentlyContinue) {
                Write-Host "Warning: IIS site '$siteName' already exists" -ForegroundColor Yellow
                $overwriteSite = Read-Host "Do you want to overwrite it? (y/n)"
                if ($overwriteSite -eq "y" -or $overwriteSite -eq "Y") {
                    Write-Host "Removing existing IIS site..." -ForegroundColor Yellow
                    Remove-Website -Name $siteName
                } else {
                    Write-Host "Installation cancelled." -ForegroundColor Red
                    exit 1
                }
            }
        } catch {
            Write-Host "IIS module not available" -ForegroundColor Yellow
        }
    }
    default {
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
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

# 7. Configure IIS
Write-Host "Configuring IIS..." -ForegroundColor Yellow

# Check if IIS is installed
try {
    Import-Module WebAdministration -ErrorAction Stop
} catch {
    Write-Host "IIS not found. Installing IIS..." -ForegroundColor Yellow
    Install-WindowsFeature -Name Web-Server -IncludeManagementTools -ErrorAction SilentlyContinue
    Import-Module WebAdministration
}

# Create new IIS site
New-Website -Name $siteName -Port $sitePort -PhysicalPath $deployDir -ApplicationPool "DefaultAppPool"

# Configure firewall
New-NetFirewallRule -DisplayName "Barcode Frontend Web - $siteName" -Direction Inbound -Protocol TCP -LocalPort $sitePort -Action Allow -ErrorAction SilentlyContinue

Write-Host "IIS site created: $siteName on port $sitePort" -ForegroundColor Green

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
Write-Host "Installation type: $($installChoice -eq "1" ? "Clean Install" : "Parallel Install")" -ForegroundColor Cyan
Write-Host "Build output location: $deployDir" -ForegroundColor Cyan
Write-Host "IIS site: $siteName" -ForegroundColor Cyan
Write-Host "Port: $sitePort" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Ensure backend is running on port 5000" -ForegroundColor Cyan
Write-Host "2. Access the application at: http://localhost:$sitePort" -ForegroundColor Cyan
Write-Host "3. Configure SSL certificate for production" -ForegroundColor Cyan 