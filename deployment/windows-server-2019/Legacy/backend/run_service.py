#!/usr/bin/env python3
"""
Windows Service Runner for Barcode Management Backend
This script runs the FastAPI application as a Windows service
"""

import os
import sys
import uvicorn
from pathlib import Path
from dotenv import load_dotenv

# Get the directory where this script is located
script_dir = Path(__file__).parent
app_dir = script_dir

# Load environment variables from the .env file in the parent directory
env_file_path = app_dir.parent / ".env"
if env_file_path.exists():
    load_dotenv(env_file_path)
    print(f"Loaded environment from: {env_file_path}")
else:
    print(f"Warning: .env file not found at {env_file_path}")
    print("Make sure to create the .env file with your database credentials")

# Add the app directory to Python path
sys.path.insert(0, str(app_dir))

# Set working directory to the app directory
os.chdir(app_dir)

# Import the FastAPI app
try:
    from app.main import app
    print("Successfully imported FastAPI application")
except ImportError as e:
    print(f"Error importing FastAPI application: {e}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Python path: {sys.path}")
    sys.exit(1)

if __name__ == "__main__":
    # Get configuration from environment variables
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    reload = os.getenv("RELOAD", "false").lower() == "true"
    
    print(f"Starting FastAPI server on {host}:{port}")
    print(f"Environment variables loaded: {list(os.environ.keys())}")
    
    # Run the FastAPI application
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    ) 