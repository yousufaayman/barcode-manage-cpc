# Docker Deployment Guide

This guide explains how to deploy the Barcode Management System using Docker Compose on a Windows Server 2019 machine with multiple network interfaces.

## Prerequisites

- Docker Desktop for Windows or Docker Engine
- Docker Compose
- Windows Server 2019 with two network interfaces:
  - IP: 192.168.0.249
  - IP: 192.168.0.106

## Architecture

The application consists of three main services:

1. **Frontend** (React + Nginx): Serves the React application on port 3000
2. **Backend** (FastAPI): Provides the API on port 5000
3. **Database** (MySQL): Stores application data on port 3306

## Quick Start

1. **Clone the repository and navigate to the project root:**
   ```bash
   cd barcode-manage-cpc
   ```

2. **Configure environment variables:**
   ```bash
   # Copy the example file
   cp backend/env.example backend/.env
   
   # Edit the .env file with your configuration
   notepad backend/.env
   ```

3. **Build and start all services:**
   ```bash
   docker-compose up -d --build
   ```

4. **Check service status:**
   ```bash
   docker-compose ps
   ```

5. **View logs:**
   ```bash
   docker-compose logs -f
   ```

## Configuration

### Environment Variables (.env file)

**IMPORTANT**: You must configure the following variables in `backend/.env` before deployment:

#### Database Configuration
```
MYSQL_USER=your_database_user
MYSQL_PASSWORD=your_secure_password
MYSQL_ROOT_PASSWORD=your_root_password
MYSQL_DATABASE=barcode_management
```

#### Security Configuration
```
SECRET_KEY=your-very-secure-jwt-secret-key
```

#### CORS Configuration
```
CORS_ORIGINS=http://192.168.0.249:3000,http://192.168.0.106:3000
```

### Why .env.example vs .env?

- **`env.example`**: Template file with example values (safe to commit to git)
- **`.env`**: Actual configuration file with real credentials (should NOT be committed to git)

The `.env` file contains sensitive information like database passwords and JWT secrets, so it's excluded from version control for security.

## Accessing the Application

The application will be accessible via both IP addresses:

- **Frontend**: 
  - http://192.168.0.249:3000
  - http://192.168.0.106:3000

- **Backend API**: 
  - http://192.168.0.249:5000
  - http://192.168.0.106:5000

- **Database**: 
  - 192.168.0.249:3306
  - 192.168.0.106:3306

## Configuration

### Environment Variables

The application uses environment variables for configuration. Key variables include:

- `CORS_ORIGINS`: Comma-separated list of allowed origins for CORS
- `MYSQL_HOST`: Database host (set to `db` for Docker networking)
- `SECRET_KEY`: JWT secret key for authentication

### CORS Configuration

The backend is configured to allow requests from both IP addresses:
```
CORS_ORIGINS=http://192.168.0.249:3000,http://192.168.0.106:3000
```

### Network Configuration

All containers are connected to a custom Docker network (`barcode_network`) for internal communication. The frontend Nginx proxy forwards `/api/` requests to the backend container.

## Service Management

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f db
```

### Update and Rebuild
```bash
# Pull latest changes and rebuild
git pull
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build frontend
```

## Data Persistence

- **Database**: MySQL data is persisted in a Docker volume (`mysql_data`)
- **Application Data**: Backend code is mounted as a volume for development

## Health Checks

All services include health checks:

- **Frontend**: Checks if Nginx is responding on port 80
- **Backend**: Checks if FastAPI is responding on port 8000
- **Database**: Checks if MySQL is responding

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000, 5000, and 3306 are not in use
2. **Database connection**: Wait for the database to be healthy before starting the backend
3. **CORS errors**: Verify the CORS_ORIGINS environment variable is set correctly
4. **Missing .env file**: Ensure you've created `backend/.env` from `backend/env.example`

### Debug Commands

```bash
# Check container status
docker-compose ps

# Check container logs
docker-compose logs [service_name]

# Access container shell
docker-compose exec backend bash
docker-compose exec frontend sh
docker-compose exec db mysql -u root -p

# Check network connectivity
docker-compose exec backend ping db
docker-compose exec frontend ping backend
```

### Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove all images
docker-compose down --rmi all

# Start fresh
docker-compose up -d --build
```

## Production Considerations

1. **Security**: 
   - Change all default passwords and secrets
   - Use strong, unique passwords for database users
   - Generate a secure JWT secret key
2. **SSL/TLS**: Add SSL certificates for HTTPS
3. **Backup**: Implement database backup strategy
4. **Monitoring**: Add monitoring and logging solutions
5. **Scaling**: Consider using Docker Swarm or Kubernetes for production

## File Structure

```
barcode-manage-cpc/
├── docker-compose.yml          # Main Docker Compose configuration
├── .dockerignore               # Files to exclude from Docker builds
├── start-docker.bat            # Windows startup script
├── backend/
│   ├── Dockerfile              # Backend container configuration
│   ├── env.example             # Environment variables template
│   ├── .env                    # Actual environment variables (created during setup)
│   └── ...
├── frontend/
│   ├── Dockerfile              # Frontend container configuration
│   ├── nginx.conf              # Nginx configuration
│   └── ...
└── README-Docker.md            # This file
```

## Support

For issues related to Docker deployment, check the logs and refer to the troubleshooting section above. 