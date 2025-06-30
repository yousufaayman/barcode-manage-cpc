from fastapi import APIRouter
from .endpoints import auth, barcodes, batches, statistics, job_orders

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(barcodes.router, prefix="/barcodes", tags=["barcodes"])
api_router.include_router(batches.router, prefix="/batches", tags=["batches"])
api_router.include_router(statistics.router, prefix="/statistics", tags=["statistics"])
api_router.include_router(job_orders.router, prefix="/job-orders", tags=["job-orders"]) 