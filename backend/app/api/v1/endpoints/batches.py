from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Optional
from app import crud, models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user, get_optional_current_user
from pydantic import BaseModel

router = APIRouter()

class BatchListResponse(BaseModel):
    items: List[schemas.BatchResponse]
    total: int

class BulkArchiveRequest(BaseModel):
    batch_ids: List[int]

# Brand endpoints
@router.get("/brands/", response_model=List[schemas.Brand])
def read_brands(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all brands"""
    brands = crud.get_brands(db, skip=skip, limit=limit)
    return brands

# Model endpoints
@router.get("/models/", response_model=List[schemas.Model])
def read_models(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all models"""
    models_list = crud.get_models(db, skip=skip, limit=limit)
    return models_list

# Size endpoints
@router.get("/sizes/", response_model=List[schemas.Size])
def read_sizes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all sizes"""
    sizes = crud.get_sizes(db, skip=skip, limit=limit)
    return sizes

# Color endpoints
@router.get("/colors/", response_model=List[schemas.Color])
def read_colors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all colors"""
    colors = crud.get_colors(db, skip=skip, limit=limit)
    return colors

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
    job_order_number: str = None,
    archived: bool = False,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all batches with optional filtering"""
    # Require admin access for archived batches
    if archived:
        if not current_user or current_user.role != "Admin":
            raise HTTPException(
                status_code=403,
                detail="Access denied. Admin privileges required to view archived batches."
            )
    
    # Choose the base table based on archived parameter
    base_table = models.ArchivedBatch if archived else models.Batch
    
    query = db.query(
        base_table,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name,
        models.JobOrder.job_order_number
    ).join(
        models.Brand,
        base_table.brand_id == models.Brand.brand_id
    ).join(
        models.Model,
        base_table.model_id == models.Model.model_id
    ).join(
        models.Size,
        base_table.size_id == models.Size.size_id
    ).join(
        models.Color,
        base_table.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase,
        base_table.current_phase == models.ProductionPhase.phase_id
    ).join(
        models.JobOrder,
        base_table.job_order_id == models.JobOrder.job_order_id
    )

    # Apply filters if provided
    if barcode:
        query = query.filter(base_table.barcode.ilike(f"%{barcode}%"))
    if brand:
        query = query.filter(models.Brand.brand_name == brand)
    if model:
        query = query.filter(models.Model.model_name.ilike(f"%{model}%"))
    if size:
        query = query.filter(models.Size.size_value == size)
    if color:
        query = query.filter(models.Color.color_name == color)
    if phase:
        query = query.filter(models.ProductionPhase.phase_name == phase)
    if status:
        query = query.filter(base_table.status == status)
    if job_order_number:
        query = query.filter(models.JobOrder.job_order_number.ilike(f"%{job_order_number}%"))

    # Get total count before pagination
    total_count = query.count()

    # Apply pagination
    batches = query.offset(skip).limit(limit).all()

    return {
        "items": [
            schemas.BatchResponse(
                batch_id=batch[0].batch_id,
                job_order_id=batch[0].job_order_id,
                job_order_number=batch.job_order_number,
                barcode=batch[0].barcode,
                brand_id=batch[0].brand_id,
                model_id=batch[0].model_id,
                size_id=batch[0].size_id,
                color_id=batch[0].color_id,
                quantity=batch[0].quantity,
                layers=batch[0].layers,
                serial=str(batch[0].serial),
                current_phase=batch[0].current_phase,
                status=batch[0].status,
                brand_name=batch.brand_name,
                model_name=batch.model_name,
                size_value=batch.size_value,
                color_name=batch.color_name,
                phase_name=batch.phase_name,
                last_updated_at=batch[0].last_updated_at,
                archived_at=getattr(batch[0], 'archived_at', None) if archived else None
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
    db_batch = crud.get_batch(db, batch_id)
    if not db_batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not db_batch_model:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    try:
        # Update the batch
        updated_batch = crud.update_batch(db=db, db_batch=db_batch_model, batch=batch_in)
        return updated_batch
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"Error updating batch {batch_id}: {error_details}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.delete("/{batch_id}", response_model=schemas.BatchResponse)
def delete_batch(
    *,
    db: Session = Depends(get_db),
    batch_id: int,
):
    """Delete a batch"""
    batch = crud.get_batch(db, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return crud.delete_batch(db=db, batch_id=batch_id)

@router.delete("/archived/{batch_id}", response_model=schemas.BatchResponse)
def delete_archived_batch(
    *,
    db: Session = Depends(get_db),
    batch_id: int,
    current_user: Optional[schemas.User] = Depends(get_current_user)
):
    """Delete an archived batch"""
    # Require admin access for deleting archived batches
    if not current_user or current_user.role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required to delete archived batches."
        )
    
    batch = crud.delete_archived_batch(db, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Archived batch not found")
    return batch

@router.post("/{batch_id}/archive", response_model=schemas.BatchResponse)
def archive_batch(
    *,
    db: Session = Depends(get_db),
    batch_id: int,
    current_user: Optional[schemas.User] = Depends(get_current_user)
):
    """Archive a batch by moving it to the archived_batches table"""
    # Require admin access for archiving
    if not current_user or current_user.role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required to archive batches."
        )
    
    batch = crud.get_batch(db, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    return crud.archive_batch(db=db, batch_id=batch_id)

@router.post("/archive/bulk", response_model=List[schemas.BatchResponse])
def archive_batches_bulk(
    *,
    db: Session = Depends(get_db),
    request: BulkArchiveRequest,
    current_user: Optional[schemas.User] = Depends(get_current_user)
):
    """Archive multiple batches by moving them to the archived_batches table"""
    # Require admin access for archiving
    if not current_user or current_user.role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required to archive batches."
        )
    
    if not request.batch_ids:
        raise HTTPException(status_code=400, detail="No batch IDs provided")
    
    return crud.archive_batches_bulk(db=db, batch_ids=request.batch_ids)

@router.post("/archived/{batch_id}/recover", response_model=schemas.BatchResponse)
def recover_archived_batch(
    *,
    db: Session = Depends(get_db),
    batch_id: int,
    current_user: Optional[schemas.User] = Depends(get_current_user)
):
    """Recover an archived batch by moving it back to the active batches table"""
    # Require admin access for recovery
    if not current_user or current_user.role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required to recover archived batches."
        )
    
    try:
        recovered_batch = crud.recover_archived_batch(db, batch_id=batch_id)
        if not recovered_batch:
            raise HTTPException(status_code=404, detail="Archived batch not found")
        return recovered_batch
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recovering batch: {str(e)}")

@router.post("/archived/recover/bulk", response_model=List[schemas.BatchResponse])
def recover_archived_batches_bulk(
    *,
    db: Session = Depends(get_db),
    request: BulkArchiveRequest,
    current_user: Optional[schemas.User] = Depends(get_current_user)
):
    """Recover multiple archived batches by moving them back to the active batches table"""
    # Require admin access for recovery
    if not current_user or current_user.role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required to recover archived batches."
        )
    
    if not request.batch_ids:
        raise HTTPException(status_code=400, detail="No batch IDs provided")
    
    try:
        return crud.recover_archived_batches_bulk(db=db, batch_ids=request.batch_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recovering batches: {str(e)}")

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
        # Log the full error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"Error updating batch by barcode {barcode}: {error_details}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/{batch_id}/timeline", response_model=List[schemas.TimelineEntryResponse])
def get_batch_timeline(batch_id: int, db: Session = Depends(get_db)):
    """Get the complete timeline history for a batch"""
    timeline = crud.get_timeline_by_batch(db, batch_id)
    if not timeline:
        raise HTTPException(status_code=404, detail="No timeline entries found for this batch")
    return timeline

@router.get("/{batch_id}/timeline/stats", response_model=Dict[str, Dict[str, int]])
def get_batch_timeline_stats(batch_id: int, db: Session = Depends(get_db)):
    """Get statistics about time spent in each phase for a batch"""
    stats = crud.get_timeline_stats_by_batch(db, batch_id)
    if not stats:
        raise HTTPException(status_code=404, detail="No timeline statistics found for this batch")
    # Convert to dictionary format
    result = {}
    for phase_id, status, minutes in stats:
        if phase_id not in result:
            result[phase_id] = {}
        result[phase_id][status] = minutes
    return result

@router.get("/timeline/current", response_model=List[schemas.TimelineEntryResponse])
def get_current_timeline_entries(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    """Get all current (ongoing) timeline entries"""
    current_entries = crud.get_current_timeline_entries(db, skip=skip, limit=limit)
    return current_entries

@router.get("/timeline/stats", response_model=Dict[str, Dict[str, float]])
def get_all_timeline_stats(db: Session = Depends(get_db)):
    """Get average time statistics across all batches"""
    stats = crud.get_all_timeline_stats(db)
    result = {}
    for phase_id, status, avg_minutes in stats:
        if phase_id not in result:
            result[phase_id] = {}
        result[phase_id][status] = round(avg_minutes, 2) if avg_minutes else 0
    return result 