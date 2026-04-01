from fastapi import APIRouter
from .endpoints import auth, barcodes, batches, job_orders, phases, archive, health, reports, cuts, rejections, production

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(barcodes.router, prefix="/barcodes", tags=["barcodes"])
api_router.include_router(batches.router, prefix="/batches", tags=["batches"])
api_router.include_router(job_orders.router, prefix="/job-orders", tags=["job-orders"])
api_router.include_router(phases.router, prefix="/phases", tags=["phases"])
api_router.include_router(archive.router, prefix="/archive", tags=["archive"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(cuts.router, prefix="/cuts", tags=["cuts"])
api_router.include_router(rejections.router, prefix="/rejections", tags=["rejections"])
api_router.include_router(production.router, prefix="/production", tags=["production"])