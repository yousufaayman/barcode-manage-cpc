# Barcode Management System - Dual Network Deployment

## Windows Server 2019 Deployment Guide

This deployment provides a comprehensive nginx/uvicorn setup for Windows Server 2019 with dual network support, health monitoring, and auto-recovery capabilities.

## 🏗️ Architecture Overview

### Network Configuration
- **Network 1**: 192.168.0.106 (Primary network)
- **Network 2**: 192.168.0.249 (Secondary network)
- **Backend Services**: 3 uvicorn instances per network (ports 5000, 5001, 5002)
- **Load Balancer**: Nginx with upstream configuration
- **Health Monitoring**: Continuous health checks and auto-recovery

### Service Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Windows Server 2019                     │
├─────────────────────────────────────────────────────────────┤
│  Nginx (Load Balancer)                                     │
│  ├── Network 1 (192.168.0.106:80/443)                     │
│  └── Network 2 (192.168.0.249:80/443)                     │
├─────────────────────────────────────────────────────────────┤
│  Backend Services (3 instances)                            │
│  ├── BarcodeBackend_Service_1 (Port 5000)                 │
│  ├── BarcodeBackend_Service_2 (Port 5001)                 │
│  └── BarcodeBackend_Service_3 (Port 5002)                 │
├─────────────────────────────────────────────────────────────┤
│  Monitoring Services                                        │
│  ├── BarcodeHealthMonitorDual                              │
│  ├── BarcodeAutoRecoveryDual                               │
│  └── BarcodeAlertingService                                │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Network-specific builds)                        │
│  ├── Network 1: C:\barcode-app\frontend-network1          │
│  └── Network 2: C:\barcode-app\frontend-network2          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Windows Server 2019
- Administrator privileges
- Python 3.11+ installed
- Node.js 18+ installed
- MySQL database running
- NSSM (Non-Sucking Service Manager) installed

### 1. Install NSSM
```powershell
# Download NSSM from https://nssm.cc/download
# Extract to C:\nssm\
```

### 2. Clone and Setup
```powershell
# Navigate to project root
cd S:\CS_Projects\Projects\barcode-manage-cpc

# Run the installation script
.\deployment\windows-server-2019\scripts\install-services.ps1
```

### 3. Configure Environment
```powershell
# Edit the environment file
notepad C:\barcode-app\.env

# Update database credentials and other settings
```

### 4. Generate SSL Certificates
```powershell
# Generate self-signed certificates for both networks
.\deployment\windows-server-2019\ssl\generate_certificates.ps1
```

### 5. Build Frontend for Both Networks
```powershell
# Navigate to frontend directory
cd frontend

# Build for Network 1
node ..\deployment\windows-server-2019\frontend\build-network1.js

# Build for Network 2
node ..\deployment\windows-server-2019\frontend\build-network2.js
```

### 6. Start Services
```powershell
# Start all services
.\C:\barcode-app\manage-services.ps1 -Action start

# Check service status
.\C:\barcode-app\manage-services.ps1 -Action status
```

## 📋 Service Configuration

### Backend Services
| Service Name | Port | Description |
|--------------|------|-------------|
| BarcodeBackend_Service_1 | 5000 | Primary backend instance |
| BarcodeBackend_Service_2 | 5001 | Secondary backend instance |
| BarcodeBackend_Service_3 | 5002 | Tertiary backend instance |

### Monitoring Services
| Service Name | Description |
|--------------|-------------|
| BarcodeHealthMonitorDual | Health monitoring for both networks |
| BarcodeAutoRecoveryDual | Auto-recovery with cross-instance verification |
| BarcodeAlertingService | Alerting and notification service |

### Web Server
| Service Name | Description |
|--------------|-------------|
| BarcodeNginx | Nginx load balancer and reverse proxy |

## 🔧 Configuration Files

### Environment Configuration
- **Location**: `C:\barcode-app\.env`
- **Purpose**: Database credentials, API settings, network configuration

### Nginx Configuration
- **Location**: `C:\nginx\conf\nginx.conf`
- **Purpose**: Load balancing, SSL termination, reverse proxy

### SSL Certificates
- **Location**: `C:\nginx\ssl\`
- **Files**: 
  - `network1.crt` / `network1.key` (Network 1)
  - `network2.crt` / `network2.key` (Network 2)
  - `default.crt` / `default.key` (Default)

## 🌐 Access URLs

### Network 1 (192.168.0.106)
- **HTTP**: http://192.168.0.106
- **HTTPS**: https://192.168.0.106
- **API Docs**: http://192.168.0.106/docs
- **Health Check**: http://192.168.0.106/health/

### Network 2 (192.168.0.249)
- **HTTP**: http://192.168.0.249
- **HTTPS**: https://192.168.0.249
- **API Docs**: http://192.168.0.249/docs
- **Health Check**: http://192.168.0.249/health/

## 🔍 Health Monitoring

### Health Endpoints
- `/health/` - Basic health check
- `/health/database` - Database connectivity
- `/health/pool` - Connection pool status
- `/health/full` - Comprehensive health check

### Monitoring Features
- **Continuous Health Checks**: Every 30 seconds
- **Response Time Monitoring**: Tracks API response times
- **Auto-Recovery**: Automatically restarts failed services
- **Cross-Instance Verification**: Checks other instances after recovery
- **Health Scoring**: Calculates health scores based on performance

## 🚨 Alerting System

### Alert Types
- **Critical**: Service down, database failure, network unreachable
- **Warning**: High response time, low health score, resource usage
- **Info**: Auto-recovery events, service restarts

### Notification Channels
- **Email**: SMTP-based email alerts
- **Webhook**: HTTP POST to external systems
- **Slack**: Slack webhook integration

### Alert Configuration
- **Location**: `C:\barcode-app\monitoring\alerting_config.json`
- **Cooldown Periods**: Prevents alert spam
- **Rate Limiting**: Maximum alerts per hour per source

## 🛠️ Service Management

### Service Control Script
```powershell
# Start all services
.\C:\barcode-app\manage-services.ps1 -Action start

# Stop all services
.\C:\barcode-app\manage-services.ps1 -Action stop

# Restart all services
.\C:\barcode-app\manage-services.ps1 -Action restart

# Check service status
.\C:\barcode-app\manage-services.ps1 -Action status

# View logs
.\C:\barcode-app\manage-services.ps1 -Action logs

# Control specific service
.\C:\barcode-app\manage-services.ps1 -Action start -ServiceName "BarcodeBackend_Service_1"
```

### Manual Service Control
```powershell
# Start specific service
Start-Service -Name "BarcodeBackend_Service_1"

# Stop specific service
Stop-Service -Name "BarcodeBackend_Service_1"

# Check service status
Get-Service -Name "BarcodeBackend_Service_1"
```

## 📊 Monitoring and Logs

### Log Locations
- **Application Logs**: `C:\barcode-app\logs\`
- **Nginx Logs**: `C:\nginx\logs\`
- **Health Reports**: `C:\barcode-app\monitoring\health_report_*.json`
- **Recovery Reports**: `C:\barcode-app\monitoring\recovery_report_*.json`
- **Alert Reports**: `C:\barcode-app\monitoring\alert_report_*.json`

### Log Files
- `app_instance_1.log` - Backend instance 1 logs
- `app_instance_2.log` - Backend instance 2 logs
- `app_instance_3.log` - Backend instance 3 logs
- `health_monitor.log` - Health monitoring logs
- `auto_recovery.log` - Auto-recovery logs
- `alerting.log` - Alerting service logs
- `nginx.log` - Nginx access logs
- `nginx_error.log` - Nginx error logs

## 🔒 Security Configuration

### SSL/TLS
- **Protocols**: TLSv1.2, TLSv1.3
- **Ciphers**: ECDHE-RSA-AES256-GCM-SHA512, DHE-RSA-AES256-GCM-SHA512
- **Certificate Authority**: Self-signed (development) / Trusted CA (production)

### Security Headers
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'`

### Rate Limiting
- **API Endpoints**: 10 requests/second
- **Login Endpoints**: 5 requests/minute
- **Burst Allowance**: 20 requests

## 🔄 Auto-Recovery System

### Recovery Logic
1. **Health Check Failure**: Service fails health check
2. **Service Restart**: Automatically restart failed service
3. **Health Verification**: Verify service is healthy after restart
4. **Cross-Instance Check**: Check other instances in the same network
5. **Cascade Recovery**: Restart unhealthy instances found during cross-check
6. **Cooldown Period**: 5-minute cooldown between restart attempts
7. **Maximum Attempts**: 5 restart attempts before giving up

### Recovery Features
- **Graceful Shutdown**: Proper service shutdown before restart
- **Startup Verification**: Verify service started successfully
- **Cross-Network Recovery**: Handle network-wide failures
- **Recovery History**: Track all recovery actions
- **Alert Integration**: Send alerts for recovery events

## 🚀 Performance Optimization

### Backend Optimization
- **Worker Processes**: 2 workers per instance (6 total)
- **Connection Pooling**: Optimized database connections
- **Request Limits**: 500 concurrent requests per instance
- **Response Caching**: Static asset caching

### Nginx Optimization
- **Load Balancing**: Least connections algorithm
- **Keep-Alive**: 32 connections per upstream
- **Gzip Compression**: Enabled for text content
- **Static File Caching**: 1-year cache for assets

### Monitoring Optimization
- **Parallel Health Checks**: All instances checked simultaneously
- **Efficient Logging**: Structured logging with rotation
- **Resource Monitoring**: CPU, memory, and disk usage tracking

## 🛡️ Troubleshooting

### Common Issues

#### Service Won't Start
```powershell
# Check service status
Get-Service -Name "BarcodeBackend_Service_1"

# Check logs
Get-Content "C:\barcode-app\logs\BarcodeBackend_Service_1.log" -Tail 20

# Check environment file
Get-Content "C:\barcode-app\.env"
```

#### Health Check Failures
```powershell
# Test health endpoint manually
Invoke-WebRequest -Uri "http://192.168.0.106:5000/health/" -UseBasicParsing

# Check health monitor logs
Get-Content "C:\barcode-app\logs\health_monitor.log" -Tail 20
```

#### Nginx Issues
```powershell
# Test nginx configuration
C:\nginx\nginx.exe -t

# Check nginx logs
Get-Content "C:\nginx\logs\error.log" -Tail 20

# Restart nginx
Restart-Service -Name "BarcodeNginx"
```

#### Database Connection Issues
```powershell
# Test database connectivity
# Check .env file for correct credentials
# Verify MySQL service is running
Get-Service -Name "MySQL*"
```

### Performance Issues
```powershell
# Check resource usage
Get-Process | Where-Object {$_.ProcessName -like "*python*" -or $_.ProcessName -like "*nginx*"}

# Check disk space
Get-WmiObject -Class Win32_LogicalDisk | Select-Object DeviceID, @{Name="Size(GB)";Expression={[math]::Round($_.Size/1GB,2)}}, @{Name="FreeSpace(GB)";Expression={[math]::Round($_.FreeSpace/1GB,2)}}

# Check memory usage
Get-WmiObject -Class Win32_OperatingSystem | Select-Object @{Name="TotalRAM(GB)";Expression={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}}, @{Name="FreeRAM(GB)";Expression={[math]::Round($_.FreePhysicalMemory/1MB,2)}}
```

## 📈 Scaling and Maintenance

### Horizontal Scaling
- Add more backend instances by creating additional service configurations
- Update nginx upstream configuration to include new instances
- Ensure load balancing configuration supports additional instances

### Vertical Scaling
- Increase worker processes per instance
- Adjust connection pool sizes
- Optimize database configuration

### Maintenance Tasks
- **Certificate Renewal**: Update SSL certificates before expiration
- **Log Rotation**: Implement log rotation to prevent disk space issues
- **Database Maintenance**: Regular database optimization and backup
- **Security Updates**: Keep all components updated

## 🔧 Customization

### Adding New Networks
1. Update nginx configuration with new network block
2. Generate SSL certificates for new network
3. Create network-specific frontend build
4. Update monitoring configuration

### Custom Health Checks
1. Add new health endpoints to backend
2. Update health monitor configuration
3. Configure alerting rules for new checks

### Custom Alerting
1. Configure notification channels in `alerting_config.json`
2. Add custom alert rules
3. Implement custom notification handlers

## 📞 Support

### Log Analysis
- Check application logs for errors
- Review health monitoring reports
- Analyze auto-recovery actions
- Monitor alerting system

### Performance Monitoring
- Track response times
- Monitor resource usage
- Analyze load balancing effectiveness
- Review health scores

### System Health
- Regular health check verification
- Service status monitoring
- Network connectivity testing
- Database performance analysis

---

## 📝 License

This deployment configuration is part of the Barcode Management System project.

## 🤝 Contributing

For issues, feature requests, or contributions, please refer to the main project repository.

---

**Last Updated**: $(Get-Date -Format "yyyy-MM-dd")
**Version**: 1.0.0
**Compatibility**: Windows Server 2019