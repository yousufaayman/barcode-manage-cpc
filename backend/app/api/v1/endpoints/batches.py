from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict
from app import crud, models, schemas
from app.core.deps import get_db
import logging
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

class BatchListResponse(BaseModel):
    items: List[schemas.BatchResponse]
    total: int

@router.get("/", response_model=BatchListResponse)
def read_batches(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    barcode: str = None,
    brand: str = None,
    model: str = None,
    size: str = None,
    color: str = None,
    phase: str = None,
    status: str = None,
):
    """Get all batches with optional filtering"""
    query = db.query(
        models.Batch,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.Brand,
        models.Batch.brand_id == models.Brand.brand_id
    ).join(
        models.Model,
        models.Batch.model_id == models.Model.model_id
    ).join(
        models.Size,
        models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color,
        models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    )

    # Apply filters if provided
    if barcode:
        query = query.filter(models.Batch.barcode.ilike(f"%{barcode}%"))
    if brand:
        query = query.filter(models.Brand.brand_name.ilike(f"%{brand}%"))
    if model:
        query = query.filter(models.Model.model_name.ilike(f"%{model}%"))
    if size:
        query = query.filter(models.Size.size_value.ilike(f"%{size}%"))
    if color:
        query = query.filter(models.Color.color_name.ilike(f"%{color}%"))
    if phase:
        query = query.filter(models.ProductionPhase.phase_name == phase)
    if status:
        query = query.filter(models.Batch.status == status)

    # Get total count before pagination
    total_count = query.count()

    # Apply pagination
    batches = query.offset(skip).limit(limit).all()

    return {
        "items": [
            schemas.BatchResponse(
                batch_id=batch.Batch.batch_id,
                barcode=batch.Batch.barcode,
                brand_name=batch.brand_name,
                model_name=batch.model_name,
                size_value=batch.size_value,
                color_name=batch.color_name,
                quantity=batch.Batch.quantity,
                layers=batch.Batch.layers,
                serial=batch.Batch.serial,
                phase_name=batch.phase_name,
                status=batch.Batch.status
            )
            for batch in batches
        ],
        "total": total_count
    }

@router.get("/stats", response_model=schemas.BatchStats)
def get_batch_stats(db: Session = Depends(get_db)):
    """Get batch statistics"""
    total_batches = db.query(func.count(models.Batch.batch_id)).scalar()
    in_production = db.query(func.count(models.Batch.batch_id)).filter(
        models.Batch.status.in_(['Pending', 'In Progress'])
    ).scalar()
    completed = db.query(func.count(models.Batch.batch_id)).filter(
        models.Batch.status == 'Completed'
    ).scalar()
    
    return {
        "total_batches": total_batches,
        "in_production": in_production,
        "completed": completed
    }

@router.get("/phase-stats", response_model=schemas.PhaseStats)
def get_phase_stats(db: Session = Depends(get_db)):
    """Get batch statistics by phase"""
    # Get counts for cutting phase by status
    cutting_stats = db.query(
        models.Batch.status,
        func.count(models.Batch.batch_id).label('count')
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.ProductionPhase.phase_name == 'Cutting'
    ).group_by(
        models.Batch.status
    ).all()
    
    # Get counts for sewing phase by status
    sewing_stats = db.query(
        models.Batch.status,
        func.count(models.Batch.batch_id).label('count')
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.ProductionPhase.phase_name == 'Sewing'
    ).group_by(
        models.Batch.status
    ).all()
    
    # Get counts for packaging phase by status
    packaging_stats = db.query(
        models.Batch.status,
        func.count(models.Batch.batch_id).label('count')
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.ProductionPhase.phase_name == 'Packaging'
    ).group_by(
        models.Batch.status
    ).all()
    
    # Convert to dictionary format
    cutting_counts = {status: count for status, count in cutting_stats}
    sewing_counts = {status: count for status, count in sewing_stats}
    packaging_counts = {status: count for status, count in packaging_stats}
    
    return {
        "cutting": {
            "pending": cutting_counts.get('Pending', 0),
            "in_progress": cutting_counts.get('In Progress', 0)
        },
        "sewing": {
            "pending": sewing_counts.get('Pending', 0),
            "in_progress": sewing_counts.get('In Progress', 0)
        },
        "packaging": {
            "completed": packaging_counts.get('Completed', 0),
            "pending": packaging_counts.get('Pending', 0),
            "in_progress": packaging_counts.get('In Progress', 0)
        }
    }

@router.get("/{batch_id}", response_model=schemas.BatchResponse)
def read_batch(
    batch_id: int,
    db: Session = Depends(get_db),
):
    """Get a specific batch by ID"""
    db_batch = crud.get_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.post("/", response_model=schemas.BatchResponse)
def create_batch(
    *,
    db: Session = Depends(get_db),
    batch_in: schemas.BatchCreate,
):
    """Create a new batch"""
    batch = crud.create_batch(db=db, batch=batch_in)
    return batch

@router.put("/{batch_id}", response_model=schemas.BatchResponse)
def update_batch(
    batch_id: int,
    batch_in: schemas.BatchUpdate,
    db: Session = Depends(get_db)
):
    logger.info(f"Received update request for batch {batch_id}")
    logger.info(f"Update data: {batch_in.dict()}")
    
    db_batch = crud.get_batch(db, batch_id)
    if not db_batch:
        logger.error(f"Batch {batch_id} not found")
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not db_batch_model:
        logger.error(f"Batch model {batch_id} not found")
        raise HTTPException(status_code=404, detail="Batch not found")
    
    try:
        # Update the batch
        logger.info("Attempting to update batch")
        updated_batch = crud.update_batch(db=db, db_batch=db_batch_model, batch=batch_in)
        logger.info(f"Successfully updated batch {batch_id}")
        return updated_batch
    except Exception as e:
        logger.error(f"Error updating batch {batch_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{batch_id}", response_model=schemas.BatchResponse)
def delete_batch(
    *,
    db: Session = Depends(get_db),
    batch_id: int,
):
    """Delete a batch"""
    db_batch = crud.get_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    batch = crud.delete_batch(db=db, batch_id=batch_id)
    return batch

@router.get("/barcode/{barcode}", response_model=schemas.BatchResponse)
def read_batch_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
):
    """Get a specific batch by barcode"""
    db_batch = crud.get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.put("/barcode/{barcode}", response_model=schemas.BatchResponse)
def update_batch_by_barcode(
    barcode: str,
    batch_in: schemas.BatchUpdate,
    db: Session = Depends(get_db)
):
    """Update a batch by barcode"""
    db_batch = crud.get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.barcode == barcode).first()
    if not db_batch_model:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    try:
        updated_batch = crud.update_batch(db=db, db_batch=db_batch_model, batch=batch_in)
        return updated_batch
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 