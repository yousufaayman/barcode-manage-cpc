#!/usr/bin/env python3
"""
Windows Service Runner for Barcode Management Backend
This script runs the FastAPI application as a Windows service
Optimized for production deployment
"""

import os
import sys
import signal
import logging
import uvicorn
from pathlib import Path
from dotenv import load_dotenv
from contextlib import asynccontextmanager

# Configure logging for production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('C:/barcode-app/backend/logs/app.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Global variable to track shutdown
shutdown_event = None

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global shutdown_event
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    if shutdown_event:
        shutdown_event.set()

@asynccontextmanager
async def lifespan(app):
    """Application lifespan manager for graceful startup/shutdown"""
    # Startup
    logger.info("Starting Barcode Management Backend...")
    try:
        # Add any startup tasks here (database connections, etc.)
        logger.info("Backend startup completed successfully")
        yield
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        raise
    finally:
        # Shutdown
        logger.info("Shutting down Barcode Management Backend...")
        # Add any cleanup tasks here

def setup_environment():
    """Setup environment and configuration"""
    # Get the directory where this script is located
    script_dir = Path(__file__).parent
    app_dir = script_dir
    
    # Create logs directory if it doesn't exist
    logs_dir = Path("C:/barcode-app/backend/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    # Load environment variables from the .env file in the parent directory
    env_file_path = app_dir.parent / ".env"
    if env_file_path.exists():
        load_dotenv(env_file_path)
        logger.info(f"Loaded environment from: {env_file_path}")
    else:
        logger.warning(f".env file not found at {env_file_path}")
        logger.warning("Make sure to create the .env file with your database credentials")
    
    # Add the app directory to Python path
    sys.path.insert(0, str(app_dir))
    
    # Set working directory to the app directory
    os.chdir(app_dir)
    
    return app_dir

def import_application():
    """Import the FastAPI application with error handling"""
    try:
        from app.main import app
        logger.info("Successfully imported FastAPI application")
        
        # Add lifespan manager to the app
        app.router.lifespan_context = lifespan
        
        return app
    except ImportError as e:
        logger.error(f"Error importing FastAPI application: {e}")
        logger.error(f"Current working directory: {os.getcwd()}")
        logger.error(f"Python path: {sys.path}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error importing application: {e}")
        sys.exit(1)

def get_production_config():
    """Get production-optimized configuration"""
    # Get configuration from environment variables
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    
    # Production settings - disable reload, enable workers
    workers = int(os.getenv("WORKERS", "4"))  # Number of worker processes
    worker_class = os.getenv("WORKER_CLASS", "uvicorn.workers.UvicornWorker")
    
    # Security settings
    access_log = os.getenv("ACCESS_LOG", "true").lower() == "true"
    log_level = os.getenv("LOG_LEVEL", "info").lower()
    
    # Performance settings
    limit_concurrency = int(os.getenv("LIMIT_CONCURRENCY", "1000"))
    limit_max_requests = int(os.getenv("LIMIT_MAX_REQUESTS", "1000"))
    
    return {
        "host": host,
        "port": port,
        "workers": workers,
        "worker_class": worker_class,
        "access_log": access_log,
        "log_level": log_level,
        "limit_concurrency": limit_concurrency,
        "limit_max_requests": limit_max_requests
    }

def main():
    """Main application entry point"""
    try:
        # Setup environment
        app_dir = setup_environment()
        
        # Import application
        app = import_application()
        
        # Get production configuration
        config = get_production_config()
        
        logger.info(f"Starting FastAPI server on {config['host']}:{config['port']}")
        logger.info(f"Workers: {config['workers']}")
        logger.info(f"Log level: {config['log_level']}")
        logger.info(f"Environment: Production")
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Run the FastAPI application with production settings
        uvicorn.run(
            "app.main:app",
            host=config["host"],
            port=config["port"],
            reload=False,  # Disable reload in production
            workers=config["workers"],
            worker_class=config["worker_class"],
            access_log=config["access_log"],
            log_level=config["log_level"],
            limit_concurrency=config["limit_concurrency"],
            limit_max_requests=config["limit_max_requests"],
            server_header=False,  # Security: don't expose server info
            date_header=False,    # Performance: disable date headers
            forwarded_allow_ips="*",  # Allow forwarded headers for proxy
            proxy_headers=True,   # Trust proxy headers
        )
        
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt, shutting down...")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 