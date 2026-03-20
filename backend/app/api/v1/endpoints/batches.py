from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Optional, Any
import logging
from app.crud import *
from app import models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user, get_optional_current_user, get_current_active_user
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

class BatchListResponse(BaseModel):
    items: List[schemas.BatchResponse]
    total: int

class BulkArchiveRequest(BaseModel):
    batch_ids: List[int]

# Client endpoints (renamed from Brand)
@router.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all clients"""
    clients = get_clients(db, skip=skip, limit=limit)
    return clients

# Backward compatibility - brands endpoint redirects to clients
@router.get("/brands", response_model=List[schemas.BrandResponse])
@router.get("/brands/", response_model=List[schemas.BrandResponse])
def read_brands(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all clients (backward compatibility for brands)"""
    clients = get_clients(db, skip=skip, limit=limit)
    # Transform client data to brand format for backward compatibility
    return [
        schemas.BrandResponse(
            brand_name=client.client_name,
            brand_id=client.client_id
        )
        for client in clients
    ]

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
    client: str = None,
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
        if not current_user or not has_role_in_system(db=db, user_id=current_user.id, system_name="OPS", role="admin"):
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
            models.Client.client_name.label('client_name'),
            models.Model.model_name.label('model_name'),
            models.Size.size_value.label('size_value'),
            models.Color.color_name.label('color_name'),
            models.ProductionPhase.phase_name.label('phase_name'),
            models.JobOrder.job_order_number.label('job_order_number')
        ).outerjoin(
            models.JobOrder,
            base_table.job_order_id == models.JobOrder.job_order_id
        ).outerjoin(
            models.Client,
            models.JobOrder.client_id == models.Client.client_id
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
            models.Client.client_name.label('client_name'),
            models.Model.model_name.label('model_name'),
            models.Size.size_value.label('size_value'),
            models.Color.color_name.label('color_name'),
            models.ProductionPhase.phase_name.label('phase_name'),
            models.JobOrder.job_order_number.label('job_order_number')
        ).join(
            models.JobOrder,
            base_table.job_order_id == models.JobOrder.job_order_id
        ).outerjoin(
            models.Client,
            models.JobOrder.client_id == models.Client.client_id
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
    if client:
        query = query.filter(models.Client.client_name == client)
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
                client_id=getattr(batch[0], 'client_id', None),
                model_id=getattr(batch[0], 'model_id', None),
                size_id=batch[0].size_id,
                color_id=batch[0].color_id,
                quantity=batch[0].quantity,
                layers=batch[0].layers,
                serial=str(batch[0].serial),
                current_phase=batch[0].current_phase,
                status=batch[0].status,
                client_name=batch[1] if batch[1] else "Unknown",
                model_name=batch[2] if batch[2] else "Unknown",
                size_value=batch[3] if batch[3] else "Unknown",
                color_name=batch[4] if batch[4] else "Unknown",
                phase_name=batch[5] if batch[5] else "Unknown",
                last_updated=batch[0].last_updated,
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
        'Packaging': {'completed': 0, 'pending': 0, 'in_progress': 0},
        'QC': {'pending': 0, 'in_progress': 0, 'completed': 0}
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
        elif phase_name == 'QC' or phase_name.startswith('QC'):
            if status == 'Completed':
                phase_counts['QC']['completed'] += count
            elif status == 'Pending':
                phase_counts['QC']['pending'] += count
            elif status == 'In Progress':
                phase_counts['QC']['in_progress'] += count
    
    result = {
        "cutting": phase_counts['Cutting'],
        "sewing": phase_counts['Sewing'],
        "packaging": phase_counts['Packaging'],
        "qc": phase_counts['QC']
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
    batch = create_batch(db=db, batch=batch_in, user_id=current_user.id)
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
    if not current_user or not has_role_in_system(db=db, user_id=current_user.id, system_name="OPS", role="admin"):
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
    if not current_user or not has_role_in_system(db=db, user_id=current_user.id, system_name="OPS", role="admin"):
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
    if not current_user or not has_role_in_system(db=db, user_id=current_user.id, system_name="OPS", role="admin"):
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
    current_user: models.User = Depends(get_current_active_superuser)
):
    """Recover an archived batch by moving it back to the active batches table"""
    
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
    current_user: models.User = Depends(get_current_active_superuser)
):
    """Recover multiple archived batches by moving them back to the active batches table"""
    
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
    current_user: models.User = Depends(get_current_active_superuser)
):
    """Get all archived batches with filtering and pagination for the archive child page"""
    
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
        
        client = None
        model = None
        if job_order:
            client = db.query(models.Client).filter(
                models.Client.client_id == job_order.client_id
            ).first() if job_order.client_id else None
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
            client_name=client.client_name if client else None,
            model_name=model.model_name if model else None,
            size_value=size.size_value if size else None,
            color_name=color.color_name if color else None,
            phase_name=phase.phase_name if phase else None,
            last_updated=batch.last_updated,
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
        user_id = current_user.id if current_user else None
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
    current_user: models.User = Depends(get_current_active_superuser)
):
    """Manually transition all existing batches from completed phases to next phases:
    - Cutting (Completed) → Sewing - 1 (Pending)
    - Any Sewing (Completed) → Packaging (Pending)
    
    Note: Automatic transitions are handled by the database trigger 'handle_phase_transitions'
    for new status changes. This endpoint is for bulk transitions of existing batches.
    """
    
    from app.crud.batch import transition_all_completed_phases
    transitioned_count = transition_all_completed_phases(db)
    
    return {"transitioned_count": transitioned_count} 

@router.get("/{batch_id}/events", response_model=List[schemas.BarcodeScanEventResponse])
def get_batch_scan_events(batch_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Get all scan events for a batch (detailed audit trail)"""
    from app.crud.batch import get_detailed_events_by_batch
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
            phase_name=phase_name,
            user_name=user_name
        ))
    
    return event_responses

@router.get("/{batch_id}/timeline/summary", response_model=schemas.TimelineSummaryResponse)
def get_batch_timeline_summary(batch_id: int, db: Session = Depends(get_db)):
    """Get aggregated timeline summary for a batch (optimized for display)"""
    from app.crud.batch import get_timeline_summary_by_batch
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

@router.get("/{batch_id}/visited-phases")
def get_batch_visited_phases(batch_id: int, db: Session = Depends(get_db)):
    """Get unique phases that a batch has visited"""
    from app.crud.batch import get_visited_phases_by_batch
    phases = get_visited_phases_by_batch(db, batch_id)
    return phases


@router.get("/{batch_id}/production-stages", response_model=List[schemas.StageOption])
def get_batch_production_stages(
    batch_id: int,
    phase_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Get distinct stages from production_history for a batch.
    Queries production_history for batch_id, gets daily_assignment_ids,
    joins worker_daily_stage_assignments and sewing_line_stages for stage names.
    If phase_id is provided, filters to stages belonging to that production phase.
    Used for the responsible-phase stage dropdown when phase type is sewing.
    """
    from app.crud.tracking import get_stages_from_batch_production_history
    rows = get_stages_from_batch_production_history(db, batch_id, phase_id)
    return [
        schemas.StageOption(
            stage_id=sid,
            stage_name=name,
            schematic_id=schem_id,
            schematic_name=schem_name,
            stage_order=order,
        )
        for sid, name, schem_id, schem_name, order in rows
    ]


@router.get("/{batch_id}/production-daily-assignments", response_model=List[schemas.BatchProductionDailyAssignmentOption])
def get_batch_production_daily_assignments(
    batch_id: int,
    phase_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Get daily assignments with production for a batch from production_history.
    Returns worker name, stage name, quantity produced for each assignment.
    If phase_id is provided, filters to assignments whose stage belongs to that phase.
    Used for the responsible-phase dropdown when phase type is sewing (user picks
    which worker's production to attribute the rejection to).
    """
    from app.crud.tracking import get_daily_assignments_from_batch_production_history
    rows = get_daily_assignments_from_batch_production_history(db, batch_id, phase_id)
    return [
        schemas.BatchProductionDailyAssignmentOption(
            daily_assignment_id=daid,
            worker_name=worker_name,
            stage_name=stage_name,
            quantity_produced=qty,
            assignment_date=asgn_date,
        )
        for daid, worker_name, stage_name, qty, asgn_date in rows
    ]


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


@router.post("/generate", response_model=List[schemas.GeneratedBatch])
def generate_batches(
    request: schemas.BatchGenerateRequest,
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Generate batches from a cut based on rolls, layers, size ratios, and size transitions.
    
    Modes:
    - "auto": One batch per roll (default)
    - "manual": User defines quantity per batch per size
    
    The cut_number should be in format "CUT-{cut_id}" (e.g., "CUT-1")
    """
    from app.crud.batch import generate_batches_from_cut, generate_batches_from_cut_manual
    
    try:
        cut_id_str = request.cut_number.replace("CUT-", "").strip()
        cut_id = int(cut_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid cut_number format: {request.cut_number}. Expected format: CUT-{{cut_id}}")
    
    try:
        mode = request.mode or "auto"
        
        if mode == "manual":
            if not request.quantity_per_batch:
                raise HTTPException(status_code=400, detail="quantity_per_batch is required for manual mode")
            
            extra_threshold = request.extra_pieces_threshold or 5
            max_batch_size = request.max_batch_size
            batches = generate_batches_from_cut_manual(
                db,
                request.job_order_id,
                cut_id,
                request.quantity_per_batch,
                extra_threshold,
                max_batch_size=max_batch_size
            )
        else:
            max_batch_size = request.max_batch_size
            extra_threshold = request.extra_pieces_threshold
            batches = generate_batches_from_cut(
                db, 
                request.job_order_id, 
                cut_id,
                max_batch_size=max_batch_size,
                extra_pieces_threshold=extra_threshold
            )
        
        return batches
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating batches: {str(e)}")

@router.post("/submit", response_model=schemas.BulkSubmitResponse)
def submit_generated_batches(
    request: schemas.BatchSubmitRequest,
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Submit generated batches to database with duplicate checking.
    
    Skips duplicates and reports them.
    """
    from app.crud.batch import create_batch, get_batch_by_barcode, get_batch
    from app.crud import cut as cut_crud
    from app.crud import client, model, size, color, phase
    from app import models
    
    created_batches = []
    duplicate_barcodes = []
    
    # Get cut details to extract color_id if not provided
    color_id = request.color_id
    if not color_id and request.batches:
        # Try to get color_id from the first batch's barcode or cut
        # For now, we'll require color_id to be provided
        pass
    
    # Validate that all size+color combinations are valid for the job order
    for batch in request.batches:
        if not batch.size_id:
            # Need to look up size_id from size value
            size = db.query(models.Size).filter(models.Size.size_value == batch.size).first()
            if not size:
                raise HTTPException(
                    status_code=400,
                    detail=f"Size '{batch.size}' not found"
                )
            batch.size_id = size.size_id
        
        # Check if the size+color combination exists in the job order items
        job_order_item = db.query(models.JobOrderItem).filter(
            models.JobOrderItem.job_order_id == request.job_order_id,
            models.JobOrderItem.size_id == batch.size_id,
            models.JobOrderItem.color_id == color_id
        ).first()
        
        if not job_order_item:
            raise HTTPException(
                status_code=400,
                detail=f"Size and color combination not found in job order {request.job_order_id}. Size: {batch.size}, Color ID: {color_id}"
            )
    
    # Process each batch
    for batch in request.batches:
        # Check for duplicates
        existing_batch = get_batch_by_barcode(db, batch.barcode)
        if existing_batch:
            duplicate_barcodes.append({
                "barcode": batch.barcode,
                "brand": existing_batch.client_name,
                "model": existing_batch.model_name,
                "size": existing_batch.size_value,
                "color": existing_batch.color_name,
                "quantity": batch.quantity,
                "layers": batch.layers or 1,
                "serial": str(batch.serial_number) if batch.serial_number else "N/A"
            })
            continue
        
        try:
            # Convert GeneratedBatch to BatchCreate
            batch_create = schemas.BatchCreate(
                job_order_id=request.job_order_id,
                barcode=batch.barcode,
                size_id=batch.size_id,
                color_id=color_id,
                quantity=batch.quantity,
                layers=batch.layers or 1,
                serial=str(batch.serial_number) if batch.serial_number else "1",
                current_phase=1,
                status="In Progress",
                is_second_degree=False
            )
            
            # Create the batch
            user_id = current_user.id if current_user else None
            db_batch = create_batch(db, batch_create, user_id=user_id)
            db.refresh(db_batch)
            
            # Get the batch with all related data
            batch_response = get_batch(db, db_batch.batch_id)
            if batch_response:
                created_batches.append(batch_response)
            else:
                # Fallback to manual construction
                brand = client.get_client(db, db_batch.client_id) if db_batch.client_id else None
                model_obj = model.get_model(db, db_batch.model_id) if db_batch.model_id else None
                size_obj = size.get_size(db, db_batch.size_id)
                color_obj = color.get_color(db, db_batch.color_id)
                phase_obj = phase.get_phase(db, db_batch.current_phase)
                batch_response = schemas.BatchResponse(
                    batch_id=db_batch.batch_id,
                    job_order_id=db_batch.job_order_id,
                    job_order_number=None,
                    barcode=db_batch.barcode,
                    client_id=db_batch.client_id,
                    model_id=db_batch.model_id,
                    size_id=db_batch.size_id,
                    color_id=db_batch.color_id,
                    quantity=db_batch.quantity,
                    layers=db_batch.layers,
                    serial=str(db_batch.serial),
                    current_phase=db_batch.current_phase,
                    status=db_batch.status,
                    client_name=brand.client_name if brand else "",
                    model_name=model_obj.model_name if model_obj else "",
                    size_value=size_obj.size_value if size_obj else "",
                    color_name=color_obj.color_name if color_obj else "",
                    phase_name=phase_obj.phase_name if phase_obj else "",
                    last_updated=db_batch.last_updated,
                    archived_at=None,
                    is_second_degree=bool(db_batch.is_second_degree)
                )
                created_batches.append(batch_response)
        except Exception as e:
            logger.error(f"Error creating batch: {str(e)}")
            continue
    
    message = f"Successfully created {len(created_batches)} batches."
    if duplicate_barcodes:
        message += f" {len(duplicate_barcodes)} duplicates found."
    
    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=message
    )

class SecondDegreeBatchRequest(BaseModel):
    job_order_id: int
    items: List[Dict[str, int]]

@router.post("/create-second-degree", response_model=schemas.BulkSubmitResponse)
def create_second_degree_batches(
    request: SecondDegreeBatchRequest,
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Create second degree batches for job order items.
    
    items format: [{"item_id": int, "count": int}, ...]
    where count is the number of second degree batches to create for that item.
    """
    job_order = get_job_order(db, job_order_id=request.job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail=f"Job order {request.job_order_id} not found")
    
    created_batches = []
    duplicate_barcodes = []
    
    from app.crud.helpers import generate_barcode_string, get_next_serial_number
    from app.crud.batch import get_batch_by_barcode, get_batch, create_scan_event
    
    for item_request in request.items:
        item_id = item_request.get("item_id")
        count = item_request.get("count", 0)
        
        if count <= 0:
            continue
        
        job_order_item = db.query(models.JobOrderItem).filter(
            models.JobOrderItem.item_id == item_id,
            models.JobOrderItem.job_order_id == request.job_order_id
        ).first()
        
        if not job_order_item:
            logger.warning(f"Job order item {item_id} not found for job order {request.job_order_id}")
            continue
        
        for _ in range(count):
            try:
                serial_number = get_next_serial_number(
                    db,
                    request.job_order_id,
                    job_order_item.size_id,
                    job_order_item.color_id
                )
                
                barcode = generate_barcode_string(
                    request.job_order_id,
                    job_order_item.size_id,
                    job_order_item.color_id,
                    1,
                    serial_number
                )
                
                existing_batch = get_batch_by_barcode(db, barcode)
                if existing_batch:
                    duplicate_barcodes.append({
                        "barcode": barcode,
                        "size": existing_batch.size_value if hasattr(existing_batch, 'size_value') else "Unknown",
                        "color": existing_batch.color_name if hasattr(existing_batch, 'color_name') else "Unknown"
                    })
                    continue
                
                second_degree_batch = schemas.SecondDegreeBatchCreate(
                    job_order_id=request.job_order_id,
                    size_id=job_order_item.size_id,
                    color_id=job_order_item.color_id,
                    quantity=0,
                    layers=1,
                    current_phase=1,
                    status="In Progress",
                    is_second_degree=True
                )
                
                batch_data = second_degree_batch.dict()
                batch_data["barcode"] = barcode
                batch_data["serial"] = f"{serial_number:03d}"
                
                db_batch = models.Batch(**batch_data)
                db.add(db_batch)
                db.flush()
                
                create_scan_event(
                    db=db,
                    batch_id=db_batch.batch_id,
                    action_type='scan_in',
                    phase_id=db_batch.current_phase,
                    old_status=None,
                    new_status=db_batch.status,
                    old_quantity=None,
                    new_quantity=db_batch.quantity,
                    old_phase=None,
                    new_phase=db_batch.current_phase,
                    user_id=current_user.id if current_user else None
                )
                
                db.refresh(db_batch)
                batch_response = get_batch(db, db_batch.batch_id)
                if batch_response:
                    created_batches.append(batch_response)
                    
            except Exception as e:
                logger.error(f"Error creating second degree batch: {str(e)}")
                continue
    
    db.commit()
    
    message = f"Successfully created {len(created_batches)} second degree batches."
    if duplicate_barcodes:
        message += f" {len(duplicate_barcodes)} duplicates found."
    
    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=message
    )

class CompensationBatchRequest(BaseModel):
    job_order_id: int
    compensations: List[Dict[str, Any]]

@router.post("/create-compensation", response_model=schemas.BulkSubmitResponse)
def create_compensation_batches(
    request: CompensationBatchRequest,
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Create compensation batches for lost physical barcodes.
    
    Compensations format: [{"item_id": int, "phase_id": int, "quantity": int}, ...]
    These batches are NOT included in cut_qty or phase_in_qty calculations.
    """
    job_order = get_job_order(db, job_order_id=request.job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail=f"Job order {request.job_order_id} not found")
    
    created_batches = []
    duplicate_barcodes = []
    
    from app.crud.helpers import generate_barcode_string, get_next_serial_number
    from app.crud.batch import get_batch_by_barcode, get_batch
    
    for comp_request in request.compensations:
        item_id = comp_request.get("item_id")
        phase_id = comp_request.get("phase_id")
        quantity = comp_request.get("quantity", 0)
        
        if quantity <= 0:
            continue
        
        job_order_item = db.query(models.JobOrderItem).filter(
            models.JobOrderItem.item_id == item_id,
            models.JobOrderItem.job_order_id == request.job_order_id
        ).first()
        
        if not job_order_item:
            logger.warning(f"Job order item {item_id} not found for job order {request.job_order_id}")
            continue
        
        phase = db.query(models.ProductionPhase).filter(
            models.ProductionPhase.phase_id == phase_id
        ).first()
        
        if not phase:
            logger.warning(f"Phase {phase_id} not found")
            continue
        
        try:
            serial_number = get_next_serial_number(
                db,
                request.job_order_id,
                job_order_item.size_id,
                job_order_item.color_id
            )
            
            barcode = generate_barcode_string(
                request.job_order_id,
                job_order_item.size_id,
                job_order_item.color_id,
                1,
                serial_number
            )
            
            existing_batch = get_batch_by_barcode(db, barcode)
            if existing_batch:
                duplicate_barcodes.append({
                    "barcode": barcode,
                    "size": existing_batch.size_value if hasattr(existing_batch, 'size_value') else "Unknown",
                    "color": existing_batch.color_name if hasattr(existing_batch, 'color_name') else "Unknown"
                })
                continue
            
            compensation_batch = schemas.BatchCreate(
                job_order_id=request.job_order_id,
                barcode=barcode,
                size_id=job_order_item.size_id,
                color_id=job_order_item.color_id,
                quantity=quantity,
                layers=1,
                serial=f"{serial_number:03d}",
                current_phase=phase_id,
                status="In Progress",
                is_second_degree=False
            )
            
            db_batch = models.Batch(**compensation_batch.dict())
            db.add(db_batch)
            db.flush()
            
            compensation = models.BatchCompensation(
                batch_id=db_batch.batch_id,
                item_id=item_id,
                phase_id=phase_id,
                quantity=quantity,
                created_by_user_id=current_user.id if current_user else None
            )
            db.add(compensation)
            db.flush()
            
            db.query(models.BatchPhaseHistory).filter(
                models.BatchPhaseHistory.batch_id == db_batch.batch_id
            ).update({
                'compensation': True,
                'inspection_qty': 0,
                'sewing_in_qty': 0,
                'sewing_out_qty': 0,
                'qc_in_qty': 0,
                'qc_out_qty': 0,
                'packaging_in_qty': 0,
                'packaging_out_qty': 0,
                'quantity_at_phase': 0
            })
            
            db.refresh(db_batch)
            batch_response = get_batch(db, db_batch.batch_id)
            if batch_response:
                created_batches.append(batch_response)
                
        except Exception as e:
            logger.error(f"Error creating compensation batch: {str(e)}")
            db.rollback()
            continue
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to commit compensation batches: {str(e)}")
    
    message = f"Successfully created {len(created_batches)} compensation batches."
    if duplicate_barcodes:
        message += f" {len(duplicate_barcodes)} duplicates found."
    
    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=message
    )