from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.crud import *
from app import models, schemas
from app.core.deps import get_db, get_current_admin_user

router = APIRouter()

def build_archive_overview(db: Session):
    """Shared archive overview payload used by archive and job-orders endpoints."""
    archived_job_orders_count = db.query(models.ArchivedJobOrder).count()
    archived_items_count = db.query(models.ArchivedJobOrderItem).count()
    archived_batches_count = db.query(models.ArchivedBatch).count()

    recent_job_orders = db.query(models.ArchivedJobOrder).order_by(
        models.ArchivedJobOrder.archived_at.desc()
    ).limit(10).all()
    recent_batches = db.query(models.ArchivedBatch).order_by(
        models.ArchivedBatch.archived_at.desc()
    ).limit(10).all()

    recent_job_orders_data = []
    for jo in recent_job_orders:
        model = db.query(models.Model).filter(models.Model.model_id == jo.model_id).first()
        brand = db.query(models.Client).filter(models.Client.client_id == jo.client_id).first() if jo.client_id else None
        recent_job_orders_data.append({
            "job_order_id": jo.job_order_id,
            "job_order_number": jo.job_order_number,
            "model_name": model.model_name if model else "Unknown",
            "client_name": brand.client_name if brand else "Unknown",
            "archived_at": jo.archived_at,
            "date_created": jo.date_created
        })

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

@router.get("/overview")
def get_archive_overview(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """Get overview of all archived data for the main archive page"""
    return build_archive_overview(db)
