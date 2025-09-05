from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.crud import *
from app import models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user

router = APIRouter()

@router.get("/overview")
def get_archive_overview(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_active_superuser)
):
    """Get overview of all archived data for the main archive page"""
    if current_user.role != schemas.RoleEnum.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required to view archive."
        )
    
    # Get counts
    archived_job_orders_count = db.query(models.ArchivedJobOrder).count()
    archived_items_count = db.query(models.ArchivedJobOrderItem).count()
    archived_batches_count = db.query(models.ArchivedBatch).count()
    
    # Get recent archived job orders (last 10)
    recent_job_orders = db.query(models.ArchivedJobOrder).order_by(
        models.ArchivedJobOrder.archived_at.desc()
    ).limit(10).all()
    
    # Get recent archived batches (last 10)
    recent_batches = db.query(models.ArchivedBatch).order_by(
        models.ArchivedBatch.archived_at.desc()
    ).limit(10).all()
    
    # Format recent job orders
    recent_job_orders_data = []
    for jo in recent_job_orders:
        model = db.query(models.Model).filter(models.Model.model_id == jo.model_id).first()
        brand = db.query(models.Brand).filter(models.Brand.brand_id == jo.brand_id).first() if jo.brand_id else None
        
        recent_job_orders_data.append({
            "job_order_id": jo.job_order_id,
            "job_order_number": jo.job_order_number,
            "model_name": model.model_name if model else "Unknown",
            "brand_name": brand.brand_name if brand else "Unknown",
            "archived_at": jo.archived_at,
            "date_created": jo.date_created
        })
    
    # Format recent batches
    recent_batches_data = []
    for batch in recent_batches:
        recent_batches_data.append({
            "batch_id": batch.batch_id,
            "barcode": batch.barcode,
            "job_order_id": batch.job_order_id,
            "archived_at": batch.archived_at,
            "status": batch.status
        })
    
    return {
        "summary": {
            "archived_job_orders": archived_job_orders_count,
            "archived_items": archived_items_count,
            "archived_batches": archived_batches_count
        },
        "recent_job_orders": recent_job_orders_data,
        "recent_batches": recent_batches_data
    }
