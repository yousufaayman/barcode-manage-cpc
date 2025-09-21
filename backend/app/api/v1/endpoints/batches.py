from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Optional, Any
from app.crud import *
from app import models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user, get_optional_current_user, get_current_active_user
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
    brands = get_brands(db, skip=skip, limit=limit)
    return brands

# Model endpoints
@router.get("/models/", response_model=List[schemas.Model])
def read_models(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all models"""
    models_list = get_models(db, skip=skip, limit=limit)
    return models_list

# Size endpoints
@router.get("/sizes/", response_model=List[schemas.Size])
def read_sizes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all sizes"""
    sizes = get_sizes(db, skip=skip, limit=limit)
    return sizes

# Color endpoints
@router.get("/colors/", response_model=List[schemas.Color])
def read_colors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all colors"""
    colors = get_colors(db, skip=skip, limit=limit)
    return colors

@router.get("/", response_model=schemas.BatchListResponse)
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
    job_order_id: Optional[int] = None,
    color_id: Optional[int] = None,
    archived: bool = False,
    is_second_degree: Optional[bool] = None,
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
    
    if archived:
        # For archived batches, use outer joins since the referenced data might not exist
        query = db.query(
            base_table,
            models.Brand.brand_name.label('brand_name'),
            models.Model.model_name.label('model_name'),
            models.Size.size_value.label('size_value'),
            models.Color.color_name.label('color_name'),
            models.ProductionPhase.phase_name.label('phase_name'),
            models.JobOrder.job_order_number.label('job_order_number')
        ).outerjoin(
            models.JobOrder,
            base_table.job_order_id == models.JobOrder.job_order_id
        ).outerjoin(
            models.Brand,
            models.JobOrder.brand_id == models.Brand.brand_id
        ).outerjoin(
            models.Model,
            models.JobOrder.model_id == models.Model.model_id
        ).outerjoin(
            models.Size,
            base_table.size_id == models.Size.size_id
        ).outerjoin(
            models.Color,
            base_table.color_id == models.Color.color_id
        ).outerjoin(
            models.ProductionPhase,
            base_table.current_phase == models.ProductionPhase.phase_id
        )
    else:
        # For active batches, use regular joins
        query = db.query(
            base_table,
            models.Brand.brand_name.label('brand_name'),
            models.Model.model_name.label('model_name'),
            models.Size.size_value.label('size_value'),
            models.Color.color_name.label('color_name'),
            models.ProductionPhase.phase_name.label('phase_name'),
            models.JobOrder.job_order_number.label('job_order_number')
        ).join(
            models.JobOrder,
            base_table.job_order_id == models.JobOrder.job_order_id
        ).outerjoin(
            models.Brand,
            models.JobOrder.brand_id == models.Brand.brand_id
        ).outerjoin(
            models.Model,
            models.JobOrder.model_id == models.Model.model_id
        ).join(
            models.Size,
            base_table.size_id == models.Size.size_id
        ).join(
            models.Color,
            base_table.color_id == models.Color.color_id
        ).join(
            models.ProductionPhase,
            base_table.current_phase == models.ProductionPhase.phase_id
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
    if job_order_id is not None:
        query = query.filter(base_table.job_order_id == job_order_id)
    if color_id is not None:
        query = query.filter(base_table.color_id == color_id)
    if is_second_degree is not None:
        query = query.filter(base_table.is_second_degree == is_second_degree)

    # Get total count before pagination
    total_count = query.count()

    # Apply pagination
    batches = query.offset(skip).limit(limit).all()

    return {
        "items": [
            schemas.BatchResponse(
                batch_id=batch[0].batch_id,
                job_order_id=batch[0].job_order_id,
                job_order_number=batch[6] if batch[6] else f"JO-{batch[0].job_order_id}",
                barcode=batch[0].barcode,
                brand_id=getattr(batch[0], 'brand_id', None),
                model_id=getattr(batch[0], 'model_id', None),
                size_id=batch[0].size_id,
                color_id=batch[0].color_id,
                quantity=batch[0].quantity,
                layers=batch[0].layers,
                serial=str(batch[0].serial),
                current_phase=batch[0].current_phase,
                status=batch[0].status,
                brand_name=batch[1] if batch[1] else "Unknown",
                model_name=batch[2] if batch[2] else "Unknown",
                size_value=batch[3] if batch[3] else "Unknown",
                color_name=batch[4] if batch[4] else "Unknown",
                phase_name=batch[5] if batch[5] else "Unknown",
                last_updated_at=batch[0].last_updated_at,
                archived_at=getattr(batch[0], 'archived_at', None) if archived else None,
                is_second_degree=bool(batch[0].is_second_degree)
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
    # Get all phase statistics ordered by phase_id to maintain correct order
    phase_stats = db.query(
        models.ProductionPhase.phase_id,
        models.ProductionPhase.phase_name,
        models.Batch.status,
        func.count(models.Batch.batch_id).label('count')
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).group_by(
        models.ProductionPhase.phase_id,
        models.ProductionPhase.phase_name,
        models.Batch.status
    ).order_by(
        models.ProductionPhase.phase_id
    ).all()
    
    # Initialize phase counts
    phase_counts = {
        'Cutting': {'pending': 0, 'in_progress': 0},
        'Sewing': {'pending': 0, 'in_progress': 0},
        'Packaging': {'completed': 0, 'pending': 0, 'in_progress': 0}
    }
    
    # Process the results
    for phase_id, phase_name, status, count in phase_stats:
        if phase_name == 'Cutting':
            if status == 'Pending':
                phase_counts['Cutting']['pending'] = count
            elif status == 'In Progress':
                phase_counts['Cutting']['in_progress'] = count
        elif phase_name.startswith('Sewing'):  # Handle all sewing phases (Sewing - 1, Sewing - 2, etc.)
            if status == 'Pending':
                phase_counts['Sewing']['pending'] += count
            elif status == 'In Progress':
                phase_counts['Sewing']['in_progress'] += count
        elif phase_name == 'Packaging':
            if status == 'Completed':
                phase_counts['Packaging']['completed'] = count
            elif status == 'Pending':
                phase_counts['Packaging']['pending'] = count
            elif status == 'In Progress':
                phase_counts['Packaging']['in_progress'] = count
    
    result = {
        "cutting": phase_counts['Cutting'],
        "sewing": phase_counts['Sewing'],
        "packaging": phase_counts['Packaging']
    }
    
    # Debug logging

    
    return result

@router.get("/{batch_id}", response_model=schemas.BatchResponse)
def read_batch(
    batch_id: int,
    db: Session = Depends(get_db),
):
    """Get a specific batch by ID"""
    db_batch = get_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.post("/", response_model=schemas.BatchResponse)
def create_batch(
    *,
    db: Session = Depends(get_db),
    batch_in: schemas.BatchCreate,
    current_user: models.User = Depends(get_current_active_user),
):
    """Create a new batch"""
    batch = create_batch(db=db, batch=batch_in, user_id=current_user.user_id)
    return batch

@router.put("/{batch_id}", response_model=schemas.BatchResponse)
def update_batch_endpoint(
    batch_id: int,
    batch_in: schemas.BatchUpdate,
    db: Session = Depends(get_db)
):
    db_batch = get_batch(db, batch_id)
    if not db_batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not db_batch_model:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    try:
        # Update the batch
        updated_batch = update_batch(db=db, db_batch=db_batch_model, batch=batch_in)
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
    from app.crud.batch import delete_batch as crud_delete_batch
    batch = crud_delete_batch(db, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch

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
    
    from app.crud.batch import delete_archived_batch as crud_delete_archived_batch
    batch = crud_delete_archived_batch(db, batch_id=batch_id)
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
    
    batch = get_batch(db, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    from app.crud.batch import archive_batch as crud_archive_batch
    return crud_archive_batch(db=db, batch_id=batch_id)

@router.post("/archive/bulk", response_model=List[schemas.BatchResponse])
def archive_batches_bulk_endpoint(
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
    
    from app.crud.batch import archive_batches_bulk as crud_archive_batches_bulk
    return crud_archive_batches_bulk(db=db, batch_ids=request.batch_ids)

@router.post("/archived/{batch_id}/recover", response_model=schemas.BatchResponse)
def recover_archived_batch_endpoint(
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
        from app.crud.batch import recover_archived_batch as crud_recover_archived_batch
        recovered_batch = crud_recover_archived_batch(db, batch_id=batch_id)
        if not recovered_batch:
            raise HTTPException(status_code=404, detail="Archived batch not found")
        return recovered_batch
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recovering batch: {str(e)}")

@router.post("/archived/recover/bulk", response_model=List[schemas.BatchResponse])
def recover_archived_batches_bulk_endpoint(
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
        from app.crud.batch import recover_archived_batches_bulk as crud_recover_archived_batches_bulk
        return crud_recover_archived_batches_bulk(db=db, batch_ids=request.batch_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recovering batches: {str(e)}")

# --- Archive Batches Child Page Endpoint ---

@router.get("/archive/batches/", response_model=List[schemas.BatchResponse])
def get_archived_batches_detailed(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    barcode: Optional[str] = None,
    job_order_id: Optional[int] = None,
    current_user: schemas.User = Depends(get_current_active_superuser)
):
    """Get all archived batches with filtering and pagination for the archive child page"""
    if current_user.role != schemas.RoleEnum.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required to view archived batches."
        )
    
    # Build query
    query = db.query(models.ArchivedBatch)
    
    # Apply filters
    if barcode:
        query = query.filter(models.ArchivedBatch.barcode.ilike(f"%{barcode}%"))
    if job_order_id:
        query = query.filter(models.ArchivedBatch.job_order_id == job_order_id)
    
    # Apply pagination
    archived_batches = query.offset(skip).limit(limit).all()
    
    result = []
    for batch in archived_batches:
        # Get related information
        job_order = db.query(models.JobOrder).filter(
            models.JobOrder.job_order_id == batch.job_order_id
        ).first()
        
        brand = None
        model = None
        if job_order:
            brand = db.query(models.Brand).filter(
                models.Brand.brand_id == job_order.brand_id
            ).first() if job_order.brand_id else None
            model = db.query(models.Model).filter(
                models.Model.model_id == job_order.model_id
            ).first()
        
        size = db.query(models.Size).filter(
            models.Size.size_id == batch.size_id
        ).first() if batch.size_id else None
        
        color = db.query(models.Color).filter(
            models.Color.color_id == batch.color_id
        ).first() if batch.color_id else None
        
        phase = db.query(models.ProductionPhase).filter(
            models.ProductionPhase.phase_id == batch.current_phase
        ).first() if batch.current_phase else None
        
        result.append(schemas.BatchResponse(
            batch_id=batch.batch_id,
            job_order_id=batch.job_order_id,
            job_order_number=job_order.job_order_number if job_order else None,
            barcode=batch.barcode,
            size_id=batch.size_id,
            color_id=batch.color_id,
            quantity=batch.quantity,
            layers=batch.layers,
            serial=str(batch.serial),
            current_phase=batch.current_phase,
            status=batch.status,
            brand_name=brand.brand_name if brand else None,
            model_name=model.model_name if model else None,
            size_value=size.size_value if size else None,
            color_name=color.color_name if color else None,
            phase_name=phase.phase_name if phase else None,
            last_updated_at=batch.last_updated_at,
            archived_at=batch.archived_at,
            is_second_degree=False  # Archived batches don't have this field
        ))
    
    return result

@router.get("/barcode/{barcode}", response_model=schemas.BatchResponse)
def read_batch_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
):
    """Get a specific batch by barcode"""
    db_batch = get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.put("/barcode/{barcode}", response_model=schemas.BatchResponse)
def update_batch_by_barcode(
    barcode: str,
    batch_in: schemas.BatchUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Update a batch by barcode"""
    db_batch = get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.barcode == barcode).first()
    if not db_batch_model:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    try:
        user_id = current_user.user_id if current_user else None
        updated_batch = update_batch(db=db, db_batch=db_batch_model, batch=batch_in, user_id=user_id)
        return updated_batch
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"Error updating batch by barcode {barcode}: {error_details}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

 

@router.post("/transition-completed-phases", response_model=Dict[str, int])
def transition_completed_phases(
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_current_user)
):
    """Manually transition all existing batches from completed phases to next phases:
    - Cutting (Completed) → Sewing - 1 (Pending)
    - Any Sewing (Completed) → Packaging (Pending)
    
    Note: Automatic transitions are handled by the database trigger 'handle_phase_transitions'
    for new status changes. This endpoint is for bulk transitions of existing batches.
    """
    if not current_user or current_user.role != "Admin":
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required."
        )
    
    from app.crud.batch import transition_all_completed_phases
    transitioned_count = transition_all_completed_phases(db)
    
    return {"transitioned_count": transitioned_count} 

@router.get("/{batch_id}/events", response_model=List[schemas.BarcodeScanEventResponse])
def get_batch_scan_events(batch_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Get all scan events for a batch (detailed audit trail)"""
    events = get_detailed_events_by_batch(db, batch_id, limit)
    if not events:
        raise HTTPException(status_code=404, detail="No scan events found for this batch")
    
    # Convert to response format
    event_responses = []
    for event, phase_name, user_name in events:
        event_responses.append(schemas.BarcodeScanEventResponse(
            id=event.id,
            batch_id=event.batch_id,
            action_type=event.action_type,
            phase_id=event.phase_id,
            old_status=event.old_status,
            new_status=event.new_status,
            old_quantity=event.old_quantity,
            new_quantity=event.new_quantity,
            old_phase=event.old_phase,
            new_phase=event.new_phase,
            scanned_at=event.scanned_at,
            user_id=event.user_id,
            notes=event.notes,
            phase_name=phase_name,
            user_name=user_name
        ))
    
    return event_responses

@router.get("/{batch_id}/timeline/summary", response_model=schemas.TimelineSummaryResponse)
def get_batch_timeline_summary(batch_id: int, db: Session = Depends(get_db)):
    """Get aggregated timeline summary for a batch (optimized for display)"""
    summary = get_timeline_summary_by_batch(db, batch_id)
    if not summary:
        raise HTTPException(status_code=404, detail="No timeline data found for this batch")
    
    # Convert to response format
    timeline_entries = []
    for entry in summary['timeline_entries']:
        timeline_entries.append(schemas.TimelineSummaryEntry(
            phase_id=entry['phase_id'],
            phase_name=entry['phase_name'],
            start_time=entry['start_time'],
            end_time=entry['end_time'],
            duration_minutes=entry['duration_minutes'],
            status=entry['status'],
            quantity_at_start=entry['quantity_at_start'],
            quantity_at_end=entry['quantity_at_end'],
            event_count=entry['event_count']
        ))
    
    return schemas.TimelineSummaryResponse(
        barcode=summary['barcode'],
        timeline_entries=timeline_entries,
        total_entries=summary['total_entries'],
        total_events=summary['total_events']
    ) 

@router.get("/barcode/{barcode}/job-order-item")
def get_job_order_item_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
):
    """Get job order item information for a batch by barcode"""
    # First get the batch
    batch = get_batch_by_barcode(db, barcode=barcode)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Find the corresponding job order item
    job_order_item = db.query(models.JobOrderItem).filter(
        models.JobOrderItem.job_order_id == batch.job_order_id,
        models.JobOrderItem.color_id == batch.color_id,
        models.JobOrderItem.size_id == batch.size_id
    ).first()
    
    if not job_order_item:
        raise HTTPException(status_code=404, detail="Job order item not found")
    
    return {
        "item_id": job_order_item.item_id,
        "job_order_id": job_order_item.job_order_id,
        "color_id": job_order_item.color_id,
        "size_id": job_order_item.size_id,
        "expected_quantity": job_order_item.quantity,
        "notes": job_order_item.notes
    }

@router.get("/remaining-quantity/{job_order_id}/{color_id}/{size_id}")
def get_remaining_quantity_for_phase_status(
    job_order_id: int,
    color_id: int,
    size_id: int,
    phase_id: int,
    status: str,
    db: Session = Depends(get_db),
):
    """Get remaining quantity for a specific job order item that are NOT in the specified phase-status combination"""
    
    # Get the specific job order item for this job order, color, and size
    job_order_item = db.query(models.JobOrderItem).filter(
        models.JobOrderItem.job_order_id == job_order_id,
        models.JobOrderItem.color_id == color_id,
        models.JobOrderItem.size_id == size_id
    ).first()
    
    if not job_order_item:
        return {
            "remaining_quantity": 0,
            "total_batches": 0,
            "job_order_item_quantity": 0
        }
    
    # Get all batches for this specific job order item (job_order + color + size) that are NOT in the specified phase-status combination
    remaining_batches = db.query(models.Batch).filter(
        models.Batch.job_order_id == job_order_id,
        models.Batch.color_id == color_id,
        models.Batch.size_id == size_id,
        ~(
            (models.Batch.current_phase == phase_id) & 
            (models.Batch.status == status)
        )
    ).all()
    
    # Calculate remaining quantity from batches
    remaining_quantity = sum(batch.quantity for batch in remaining_batches if batch.quantity is not None)
    
    return {
        "remaining_quantity": remaining_quantity,
        "total_batches": len(remaining_batches),
        "job_order_item_quantity": job_order_item.quantity
    }

@router.get("/by-phase/current", response_model=Dict[str, Dict[str, Any]])
def get_current_batches_by_phase(db: Session = Depends(get_db)):
    """Get current batches grouped by production phases and status with model/color grouping"""
    
    # Get all current batches with their related information
    batches = db.query(
        models.Batch,
        models.JobOrder.job_order_number,
        models.Model.model_name,
        models.Color.color_name,
        models.Size.size_value,
        models.ProductionPhase.phase_name,
        models.ProductionPhase.phase_id
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Model,
        models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.Color,
        models.Batch.color_id == models.Color.color_id
    ).join(
        models.Size,
        models.Batch.size_id == models.Size.size_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.Batch.status.in_(['Pending', 'In Progress', 'Completed'])
    ).order_by(
        models.ProductionPhase.phase_id,
        models.Batch.status,
        models.JobOrder.job_order_number,
        models.Model.model_name,
        models.Color.color_name,
        models.Size.size_value
    ).all()
    
    # Group batches by phase, status, and model/color combinations
    phases_data = {}
    
    for batch, job_order_number, model_name, color_name, size_value, phase_name, phase_id in batches:
        if phase_name not in phases_data:
            phases_data[phase_name] = {}
        
        # Initialize status groups for this phase
        status = batch.status
        if status not in phases_data[phase_name]:
            phases_data[phase_name][status] = {
                'model_color_groups': {},
                'daily_throughput': {'scanned_in_not_out': 0, 'completed': 0, 'efficiency_ratio': 0}
            }
        
        # Clean model_name and color_name (preserve trailing zeros)
        cleaned_model_name = model_name.strip() if model_name else ''
        cleaned_color_name = color_name.strip() if color_name else ''
        
        # Create model-color key (grouping by model + color only, second degree will be handled separately)
        model_color_key = f"{cleaned_model_name}_{cleaned_color_name}"
        
        if model_color_key not in phases_data[phase_name][status]['model_color_groups']:
            # Get expected quantity from job order items for this model and color
            job_order_items = db.query(models.JobOrderItem).filter(
                models.JobOrderItem.job_order_id == batch.job_order_id,
                models.JobOrderItem.color_id == batch.color_id
            ).all()
            
            expected_quantity = sum(item.quantity for item in job_order_items) if job_order_items else 0
            
            # Calculate time in phase based on oldest batch in this model-color combination
            time_in_phase = "N/A"
            oldest_scan_time = None
            
            try:
                # Get all batches for this model-color combination in this phase (both second degree and regular)
                model_color_batches = db.query(models.Batch).join(
                    models.JobOrder, models.Batch.job_order_id == models.JobOrder.job_order_id
                ).join(
                    models.Model, models.JobOrder.model_id == models.Model.model_id
                ).join(
                    models.Color, models.Batch.color_id == models.Color.color_id
                ).filter(
                    models.Batch.current_phase == phase_id,
                    models.Batch.status.in_(['Pending', 'In Progress', 'Completed']),
                    models.Model.model_name == model_name,
                    models.Color.color_name == color_name
                ).all()
                
                # Find the oldest scan event among all batches in this model-color combination
                for mc_batch in model_color_batches:
                    first_scan = db.query(models.BarcodeScanEvent).filter(
                        models.BarcodeScanEvent.batch_id == mc_batch.batch_id,
                        models.BarcodeScanEvent.phase_id == phase_id
                    ).order_by(models.BarcodeScanEvent.scanned_at).first()
                    
                    if first_scan and (oldest_scan_time is None or first_scan.scanned_at < oldest_scan_time):
                        oldest_scan_time = first_scan.scanned_at
                
                if oldest_scan_time:
                    from datetime import datetime
                    from sqlalchemy import func
                    
                    # Get current database timestamp to ensure timezone consistency
                    current_db_time = db.query(func.now()).scalar()
                    time_diff = current_db_time - oldest_scan_time
                    total_seconds = time_diff.total_seconds()
                    
                    if total_seconds < 0:
                        # If still negative, use absolute value (edge case)
                        total_seconds = abs(total_seconds)
                    
                    hours = int(total_seconds // 3600)
                    minutes = int((total_seconds % 3600) // 60)
                    if hours > 24:
                        days = hours // 24
                        hours = hours % 24
                        time_in_phase = f"{days}d {hours}h {minutes}m"
                    elif hours > 0:
                        time_in_phase = f"{hours}h {minutes}m"
                    else:
                        time_in_phase = f"{minutes}m"
            except (ValueError, TypeError, AttributeError):
                time_in_phase = "N/A"
            
            # Calculate total working quantity for this model-color combination
            # Use sum of all batches for this job order and color combination (excluding second degree items)
            total_expected_quantity = 0
            try:
                # Get all batches for this specific job order and color combination (excluding second degree)
                all_batches_for_model_color = db.query(models.Batch).filter(
                    models.Batch.job_order_id == batch.job_order_id,
                    models.Batch.color_id == batch.color_id,
                    models.Batch.is_second_degree == False
                ).all()
                
                # Sum all batch quantities for this model-color combination (working quantity)
                total_expected_quantity = sum(b.quantity for b in all_batches_for_model_color if b.quantity is not None)
            except Exception as e:
                total_expected_quantity = 0
            
            # Initialize model-color group with separate tracking for second degree
            phases_data[phase_name][status]['model_color_groups'][model_color_key] = {
                'model_name': cleaned_model_name,
                'color_name': cleaned_color_name,
                'total_quantity': 0,
                'expected_quantity': total_expected_quantity,
                'batch_count': 0,
                'time_in_phase': time_in_phase,
                'sizes': [],
                'second_degree_sizes': []
            }
        
        # Get working quantity for this specific model/color/size combination
        # Use sum of all batches for this job order item instead of job order item quantity (excluding second degree items)
        size_expected_quantity = 0
        try:
            # Get all batches for this specific job order, color, and size combination (excluding second degree)
            all_batches_for_size = db.query(models.Batch).filter(
                models.Batch.job_order_id == batch.job_order_id,
                models.Batch.color_id == batch.color_id,
                models.Batch.size_id == batch.size_id,
                models.Batch.is_second_degree == False
            ).all()
            
            # Sum all batch quantities for this size (working quantity)
            size_expected_quantity = sum(b.quantity for b in all_batches_for_size if b.quantity is not None)
        except (ValueError, TypeError, AttributeError):
            size_expected_quantity = 0
        
        # Add size data to the model-color group
        size_data = {
            'size_value': size_value,
            'quantity': batch.quantity,
            'expected_quantity': size_expected_quantity,
            'batch_count': 1,
            'time_in_phase': "N/A"  # Will be calculated individually for each size
        }
        
        # Calculate individual time in phase for this size
        try:
            first_scan = db.query(models.BarcodeScanEvent).filter(
                models.BarcodeScanEvent.batch_id == batch.batch_id,
                models.BarcodeScanEvent.phase_id == phase_id
            ).order_by(models.BarcodeScanEvent.scanned_at).first()
            
            if first_scan:
                from datetime import datetime
                from sqlalchemy import func
                
                current_db_time = db.query(func.now()).scalar()
                time_diff = current_db_time - first_scan.scanned_at
                total_seconds = time_diff.total_seconds()
                
                if total_seconds < 0:
                    total_seconds = abs(total_seconds)
                
                hours = int(total_seconds // 3600)
                minutes = int((total_seconds % 3600) // 60)
                if hours > 24:
                    days = hours // 24
                    hours = hours % 24
                    size_data['time_in_phase'] = f"{days}d {hours}h {minutes}m"
                elif hours > 0:
                    size_data['time_in_phase'] = f"{hours}h {minutes}m"
                else:
                    size_data['time_in_phase'] = f"{minutes}m"
        except (ValueError, TypeError, AttributeError):
            pass
        
        # Check if this size already exists in the appropriate array
        size_arrays = phases_data[phase_name][status]['model_color_groups'][model_color_key]['second_degree_sizes'] if batch.is_second_degree else phases_data[phase_name][status]['model_color_groups'][model_color_key]['sizes']
        existing_size = next((size for size in size_arrays if size['size_value'] == size_value), None)
        
        if existing_size:
            # Update existing size entry
            existing_size['quantity'] += batch.quantity
            existing_size['batch_count'] += 1
            
            # Update time if this batch is older (keep the oldest time)
            if size_data['time_in_phase'] != "N/A":
                if existing_size['time_in_phase'] == "N/A":
                    existing_size['time_in_phase'] = size_data['time_in_phase']
                else:
                    # Compare time strings (this is a simplified approach - ideally we'd parse the times)
                    # For now, we'll keep the existing time and let the frontend handle display
                    pass
        else:
            # Add new size entry
            if batch.is_second_degree:
                phases_data[phase_name][status]['model_color_groups'][model_color_key]['second_degree_sizes'].append(size_data)
            else:
                phases_data[phase_name][status]['model_color_groups'][model_color_key]['sizes'].append(size_data)
        
        # Only add to total quantity and batch count if it's not a second degree item
        if not batch.is_second_degree:
            phases_data[phase_name][status]['model_color_groups'][model_color_key]['total_quantity'] += batch.quantity
            phases_data[phase_name][status]['model_color_groups'][model_color_key]['batch_count'] += 1
    
    # Calculate daily throughput for each status within each phase
    for phase_name in phases_data:
        for status in phases_data[phase_name]:
            try:
                from datetime import datetime
                from sqlalchemy import func
                
                # Get current database date to ensure timezone consistency
                current_db_date = db.query(func.date(func.now())).scalar()
                
                # Get phase ID for this phase
                phase_id = db.query(models.ProductionPhase.phase_id).filter(
                    models.ProductionPhase.phase_name == phase_name
                ).scalar()
                
                # Initialize throughput values
                scanned_in = 0  # Items moved from Pending to In Progress
                completed_items = 0  # Items moved from In Progress to Completed
                
                if status == 'Pending':
                    # For Pending: 
                    # 1. Sum quantities of batches that were set to Pending today (scanned_in)
                    # Use DISTINCT to avoid duplicate batch quantities
                    set_to_pending_batches = db.query(models.Batch.batch_id, models.Batch.quantity).join(
                        models.BarcodeScanEvent, models.Batch.batch_id == models.BarcodeScanEvent.batch_id
                    ).filter(
                        models.BarcodeScanEvent.phase_id == phase_id,
                        models.BarcodeScanEvent.new_status == 'Pending',
                        models.BarcodeScanEvent.scanned_at >= current_db_date
                    ).distinct().all()
                    
                    scanned_in = sum(batch.quantity for batch in set_to_pending_batches if batch.quantity)
                    
                    # 2. Sum quantities of batches that moved from Pending to In Progress today (completed_items)
                    # Use DISTINCT to avoid duplicate batch quantities
                    pending_to_in_progress_batches = db.query(models.Batch.batch_id, models.Batch.quantity).join(
                        models.BarcodeScanEvent, models.Batch.batch_id == models.BarcodeScanEvent.batch_id
                    ).filter(
                        models.BarcodeScanEvent.phase_id == phase_id,
                        models.BarcodeScanEvent.old_status == 'Pending',
                        models.BarcodeScanEvent.new_status == 'In Progress',
                        models.BarcodeScanEvent.scanned_at >= current_db_date
                    ).distinct().all()
                    
                    completed_items = sum(batch.quantity for batch in pending_to_in_progress_batches if batch.quantity)
                    
                elif status == 'In Progress':
                    # For In Progress: 
                    # 1. Sum quantities of batches that moved from Pending to In Progress today (scan_in)
                    # Use DISTINCT to avoid duplicate batch quantities
                    pending_to_in_progress_batches = db.query(models.Batch.batch_id, models.Batch.quantity).join(
                        models.BarcodeScanEvent, models.Batch.batch_id == models.BarcodeScanEvent.batch_id
                    ).filter(
                        models.BarcodeScanEvent.phase_id == phase_id,
                        models.BarcodeScanEvent.old_status == 'Pending',
                        models.BarcodeScanEvent.new_status == 'In Progress',
                        models.BarcodeScanEvent.scanned_at >= current_db_date
                    ).distinct().all()
                    
                    scanned_in = sum(batch.quantity for batch in pending_to_in_progress_batches if batch.quantity)
                    
                    # 2. Sum quantities of batches that moved from In Progress to Completed today
                    # Use DISTINCT to avoid duplicate batch quantities
                    in_progress_to_completed_batches = db.query(models.Batch.batch_id, models.Batch.quantity).join(
                        models.BarcodeScanEvent, models.Batch.batch_id == models.BarcodeScanEvent.batch_id
                    ).filter(
                        models.BarcodeScanEvent.phase_id == phase_id,
                        models.BarcodeScanEvent.old_status == 'In Progress',
                        models.BarcodeScanEvent.new_status == 'Completed',
                        models.BarcodeScanEvent.scanned_at >= current_db_date
                    ).distinct().all()
                    
                    completed_items = sum(batch.quantity for batch in in_progress_to_completed_batches if batch.quantity)
                    
                elif status == 'Completed':
                    # For Completed: sum quantities of batches that moved from In Progress to Completed today
                    # Use DISTINCT to avoid duplicate batch quantities
                    in_progress_to_completed_batches = db.query(models.Batch.batch_id, models.Batch.quantity).join(
                        models.BarcodeScanEvent, models.Batch.batch_id == models.BarcodeScanEvent.batch_id
                    ).filter(
                        models.BarcodeScanEvent.phase_id == phase_id,
                        models.BarcodeScanEvent.old_status == 'In Progress',
                        models.BarcodeScanEvent.new_status == 'Completed',
                        models.BarcodeScanEvent.scanned_at >= current_db_date
                    ).distinct().all()
                    
                    completed_items = sum(batch.quantity for batch in in_progress_to_completed_batches if batch.quantity)
                    scanned_in = 0  # Completed doesn't have scanned in items
                
                # Calculate efficiency ratio
                if completed_items > 0 and scanned_in > 0:
                    efficiency_ratio = completed_items / scanned_in
                else:
                    efficiency_ratio = 0
                
                # Update daily throughput for this status
                phases_data[phase_name][status]['daily_throughput'] = {
                    'scanned_in': scanned_in,
                    'completed': completed_items,
                    'efficiency_ratio': round(efficiency_ratio, 2)
                }
                
            except (ValueError, TypeError, AttributeError, KeyError) as e:
                # Set default values if calculation fails
                phases_data[phase_name][status]['daily_throughput'] = {
                    'scanned_in': 0,
                    'completed': 0,
                    'efficiency_ratio': 0
                }
    
    # Sort model-color groups within each status of each phase by model name, then color name
    for phase_name in phases_data:
        for status in phases_data[phase_name]:
            if 'model_color_groups' in phases_data[phase_name][status]:
                phases_data[phase_name][status]['model_color_groups'] = dict(
                    sorted(phases_data[phase_name][status]['model_color_groups'].items(), 
                           key=lambda x: (x[1]['model_name'], x[1]['color_name']))
                )
    
    return phases_data