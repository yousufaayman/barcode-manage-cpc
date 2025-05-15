from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from . import models
from .api.v1.api import api_router
from .db.init_db import init_db, create_initial_admin
from .core.config import settings
import logging

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

# Configure CORS
origins = [
    "http://localhost:8080",
    "http://192.168.1.9:8080",
    "http://localhost:5173",
    "http://192.168.1.9:5173",
    "http://localhost:3000",
    "http://192.168.1.9:3000",
    "http://192.168.1.9:8000",
    "http://localhost:4173",# Add backend origin
    "*"  # Allow all origins during development
]

logger.info(f"Configuring CORS with origins: {origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up application...")
    init_db()
    create_initial_admin()
    logger.info("Application startup complete")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Barcode Management API"} 