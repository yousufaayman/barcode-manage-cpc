# Barcode Management System - Windows Server 2019 Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Barcode Management System on Windows Server 2019. Since Windows Server 2019 doesn't support Linux containers natively, we'll use a traditional Windows deployment approach.

## Prerequisites

- Windows Server 2019 (Standard or Datacenter)
- Administrator access
- Internet connectivity for downloading components
- At least 4GB RAM and 20GB free disk space

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IIS (Port 80) │    │  FastAPI Backend│    │   MySQL Server  │
│   Frontend      │◄──►│   (Port 5000)   │◄──►│   (Port 3306)   │
│   (React SPA)   │    │   (Python)      │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Deployment Steps

### 1. Database Setup

Run the database setup script first:

```powershell
# Run as Administrator
.\database-setup.ps1
```

This script will:
- Install MySQL Server 8.0
- Create the `barcode_management` database
- Create a dedicated user `barcode_user`
- Configure MySQL for production use
- Set up firewall rules
- Create environment file template

### 2. Backend Setup

Deploy the FastAPI backend:

```powershell
# Run as Administrator
.\backend-setup.ps1
```

This script will:
- Install Python 3.11
- Copy backend files to `C:\barcode-app\backend`
- Install Python dependencies
- Create Windows service for automatic startup
- Configure firewall rules

### 3. Frontend Setup

Deploy the React frontend:

```powershell
# Run as Administrator
.\frontend-setup.ps1
```

This script will:
- Install Node.js 18 LTS
- Install IIS (if not present)
- Build the React application
- Configure IIS for static file serving
- Set up reverse proxy for API calls
- Configure firewall rules

## Manual Installation (Alternative)

If you prefer manual installation:

### Database Installation

1. **Download MySQL Server:**
   - Visit: https://dev.mysql.com/downloads/mysql/
   - Download MySQL Server 8.0 for Windows
   - Run the installer and follow the setup wizard

2. **Create Database:**
   ```sql
   CREATE DATABASE barcode_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'barcode_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON barcode_management.* TO 'barcode_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

### Backend Installation

1. **Install Python 3.11:**
   - Download from: https://www.python.org/downloads/
   - Install with "Add to PATH" option

2. **Deploy Application:**
   ```powershell
   # Create directory
   mkdir C:\barcode-app\backend
   
   # Copy files
   Copy-Item -Path ".\backend\*" -Destination "C:\barcode-app\backend" -Recurse
   
   # Install dependencies
   cd C:\barcode-app\backend
   pip install -r requirements.txt
   
   # Test run
   python run_service.py
   ```

### Frontend Installation

1. **Install Node.js 18:**
   - Download from: https://nodejs.org/
   - Install LTS version

2. **Build Application:**
   ```powershell
   # Copy files
   Copy-Item -Path ".\frontend\*" -Destination "C:\barcode-app\frontend" -Recurse
   
   # Install and build
   cd C:\barcode-app\frontend
   npm install
   npm run build
   ```

3. **Configure IIS:**
   - Install IIS: `Install-WindowsFeature -Name Web-Server`
   - Create website pointing to `C:\barcode-app\frontend\dist`
   - Configure URL Rewrite for SPA routing

## Configuration

### Environment Variables

Update `C:\barcode-app\.env` with your settings:

```env
# Database Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=barcode_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=barcode_management

# Application Configuration
SECRET_KEY=your-secret-key-here-change-this-in-production
CORS_ORIGINS=http://localhost:3000,http://your-domain.com

# Backend Configuration
HOST=0.0.0.0
PORT=5000
RELOAD=false
```

### IIS Configuration

The frontend setup creates a web.config file for:
- SPA routing (React Router)
- API reverse proxy
- MIME type configuration

### Windows Services

The backend runs as a Windows service:
- Service Name: `BarcodeBackend`
- Auto-start: Yes
- Logs: Windows Event Logs

## Security Considerations

### Firewall Configuration

The setup scripts automatically configure:
- Port 80 (HTTP)
- Port 3000 (Frontend)
- Port 5000 (Backend API)
- Port 3306 (MySQL)

### SSL/TLS Setup

For production, configure SSL certificates:

1. **Obtain SSL Certificate:**
   - Use Let's Encrypt or purchase from CA
   - Install in Windows Certificate Store

2. **Configure IIS HTTPS:**
   ```powershell
   # Bind SSL certificate to website
   New-WebBinding -Name "BarcodeApp" -Protocol "https" -Port 443
   ```

3. **Update Environment:**
   - Set `CORS_ORIGINS` to HTTPS URLs
   - Configure backend for HTTPS

### Database Security

- Use strong passwords
- Limit database access to application user only
- Enable MySQL SSL connections
- Regular backups

## Monitoring and Maintenance

### Logs

- **Backend:** Windows Event Logs
- **Frontend:** IIS logs (`%SystemDrive%\inetpub\logs\LogFiles`)
- **Database:** MySQL error logs

### Backup Strategy

1. **Database Backups:**
   ```powershell
   # Create backup script
   mysqldump -u barcode_user -p barcode_management > backup_$(Get-Date -Format 'yyyyMMdd').sql
   ```

2. **Application Backups:**
   - Backup `C:\barcode-app` directory
   - Backup IIS configuration

### Performance Tuning

1. **MySQL Optimization:**
   - Adjust `innodb_buffer_pool_size` based on available RAM
   - Monitor slow query log

2. **IIS Optimization:**
   - Enable compression
   - Configure caching headers
   - Monitor application pool recycling

## Troubleshooting

### Common Issues

1. **Backend Won't Start:**
   - Check Python installation: `python --version`
   - Verify dependencies: `pip list`
   - Check service status: `Get-Service BarcodeBackend`

2. **Frontend Not Loading:**
   - Check IIS site status
   - Verify web.config configuration
   - Check firewall rules

3. **Database Connection Issues:**
   - Verify MySQL service is running
   - Check connection credentials
   - Test connection: `mysql -u barcode_user -p`

### Useful Commands

```powershell
# Check service status
Get-Service BarcodeBackend

# View service logs
Get-EventLog -LogName Application -Source "BarcodeBackend"

# Test backend API
Invoke-WebRequest -Uri "http://localhost:5000/docs"

# Check IIS site
Get-Website -Name "BarcodeApp"

# Test database connection
mysql -u barcode_user -p barcode_management -e "SELECT 1;"
```

## Support

For issues specific to this deployment:
1. Check Windows Event Logs
2. Review application logs
3. Verify all services are running
4. Test network connectivity between components

## Alternative Deployment Options

If Windows Server 2019 limitations are problematic, consider:

1. **Upgrade to Windows Server 2022** (supports WSL2 and Linux containers)
2. **Use Linux Server** (Ubuntu/CentOS) for full Docker support
3. **Cloud deployment** (Azure, AWS, GCP) with container support 