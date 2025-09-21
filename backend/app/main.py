from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from . import models
from .api.v1.api import api_router
from .db.init_db import init_db, create_initial_admin
from .core.config import settings
from .utils.pool_manager import ConnectionPoolManager
from .utils.directory_manager import ensure_all_directories, get_directory_info
from .services.scheduler_service import SchedulerService
import logging
import uvicorn
import os
from fastapi.staticfiles import StaticFiles

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API for managing barcodes, batches, and printing",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Configure CORS with dynamic origins - MUST be first middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

app.include_router(api_router, prefix=settings.API_V1_STR)

# Mount static files for job order images
image_dir = os.path.abspath(settings.JOB_ORDER_IMAGE_UPLOAD_DIR)
os.makedirs(image_dir, exist_ok=True)
app.mount('/static', StaticFiles(directory=image_dir), name='static')

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up application...")
    
    # Ensure all required directories exist
    if ensure_all_directories():
        logger.info("All application directories verified")
    else:
        logger.error("Failed to create some required directories")
    
    # Test database connection and pool
    if ConnectionPoolManager.test_connection():
        logger.info("Database connection test successful")
        ConnectionPoolManager.log_pool_status()
    else:
        logger.error("Database connection test failed")
    
    # Initialize database
    init_db()
    create_initial_admin()
    
    # Log directory information
    dir_info = get_directory_info()
    logger.info(f"Directory structure: {len(dir_info)} directories configured")
    
    # Start the report scheduler service
    try:
        scheduler_service = SchedulerService()
        scheduler_service.start_scheduler()
        logger.info("Report scheduler service started successfully")
    except Exception as e:
        logger.error(f"Failed to start report scheduler service: {str(e)}")
    
    # Log final pool status
    ConnectionPoolManager.log_pool_status()
    logger.info("Application startup complete")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Barcode Management API"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "message": "Service is running"}

@app.get("/health/directories")
def health_check_directories():
    """Health check endpoint for directory status"""
    from .utils.directory_manager import get_directory_info, verify_directory_permissions
    
    dir_info = get_directory_info()
    permissions = verify_directory_permissions()
    
    # Check if all critical directories exist and are writable
    critical_dirs = ['static', 'uploads', 'logs']
    all_healthy = True
    issues = []
    
    for dir_name in critical_dirs:
        if dir_name in dir_info:
            info = dir_info[dir_name]
            if not info['exists']:
                all_healthy = False
                issues.append(f"{dir_name}: Directory does not exist")
            elif not info['writable']:
                all_healthy = False
                issues.append(f"{dir_name}: Directory not writable")
    
    status = "healthy" if all_healthy else "unhealthy"
    
    return {
        "status": status,
        "message": "Directory health check",
        "directories": dir_info,
        "permissions": permissions,
        "issues": issues if issues else None
    }

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info"
    ) 

