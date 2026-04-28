from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Optional, Any, Annotated, Literal
import logging
from app.crud import (
    get_clients,
    get_models,
    get_sizes,
    get_colors,
    get_batch as crud_get_batch,
    get_batch_by_barcode as crud_get_batch_by_barcode,
    update_batch as crud_update_batch,
    get_job_order as crud_get_job_order,
)
from app import models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user, get_optional_current_user
from app.services.current_batches_by_phase import build_current_batches_by_phase
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

STATUS_PENDING = "Pending"
STATUS_IN_PROGRESS = "In Progress"
STATUS_COMPLETED = "Completed"
BATCH_NOT_FOUND = "Batch not found"

class BatchListResponse(BaseModel):
    items: List[schemas.BatchResponse]
    total: int

 
class BatchQueryParams(BaseModel):
    skip: int = 0
    limit: int = 100
    barcode: Optional[str] = None
    client: Optional[str] = None
    model: Optional[str] = None
    size: Optional[str] = None
    color: Optional[str] = None
    phase: Optional[str] = None
    status: Optional[str] = None
    job_order_number: Optional[str] = None
    job_order_id: Optional[int] = None
    color_id: Optional[int] = None
    is_second_degree: Optional[bool] = None

# Client endpoints (renamed from Brand)
@router.get("/clients/", response_model=List[schemas.Client])
def read_clients(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
):
    """Get all clients"""
    clients = get_clients(db, skip=skip, limit=limit)
    return clients

# Backward compatibility - brands endpoint redirects to clients
@router.get("/brands", response_model=List[schemas.BrandResponse])
@router.get("/brands/", response_model=List[schemas.BrandResponse])
def read_brands(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
):
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
def read_models(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
):
    """Get all models"""
    models_list = get_models(db, skip=skip, limit=limit)
    return models_list

# Size endpoints
@router.get("/sizes/", response_model=List[schemas.Size])
def read_sizes(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
):
    """Get all sizes"""
    sizes = get_sizes(db, skip=skip, limit=limit)
    return sizes

# Color endpoints
@router.get("/colors/", response_model=List[schemas.Color])
def read_colors(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
):
    """Get all colors"""
    colors = get_colors(db, skip=skip, limit=limit)
    return colors

@router.get("/", response_model=schemas.BatchListResponse)
def read_batches(
    db: Annotated[Session, Depends(get_db)],
    params: Annotated[BatchQueryParams, Depends()],
    current_user: Annotated[Optional[schemas.User], Depends(get_optional_current_user)],
):
    """Get all batches with optional filtering"""
    base_table = models.Batch

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

    def _apply_filter(condition: bool, apply):
        nonlocal query
        if condition:
            query = apply(query)

    # Apply filters if provided
    _apply_filter(bool(params.barcode), lambda q: q.filter(base_table.barcode.ilike(f"%{params.barcode}%")))
    _apply_filter(bool(params.client), lambda q: q.filter(models.Client.client_name == params.client))
    _apply_filter(bool(params.model), lambda q: q.filter(models.Model.model_name.ilike(f"%{params.model}%")))
    _apply_filter(bool(params.size), lambda q: q.filter(models.Size.size_value == params.size))
    _apply_filter(bool(params.color), lambda q: q.filter(models.Color.color_name == params.color))
    _apply_filter(bool(params.phase), lambda q: q.filter(models.ProductionPhase.phase_name == params.phase))
    _apply_filter(bool(params.status), lambda q: q.filter(base_table.status == params.status))
    _apply_filter(
        bool(params.job_order_number),
        lambda q: q.filter(models.JobOrder.job_order_number.ilike(f"%{params.job_order_number}%")),
    )
    _apply_filter(params.job_order_id is not None, lambda q: q.filter(base_table.job_order_id == params.job_order_id))
    _apply_filter(params.color_id is not None, lambda q: q.filter(base_table.color_id == params.color_id))
    _apply_filter(
        params.is_second_degree is not None,
        lambda q: q.filter(base_table.is_second_degree == params.is_second_degree),
    )

    # Get total count before pagination
    total_count = query.count()

    # Apply pagination
    batches = query.offset(params.skip).limit(params.limit).all()

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
                archived_at=None,
                is_second_degree=bool(batch[0].is_second_degree)
            )
            for batch in batches
        ],
        "total": total_count
    }

@router.get("/stats", response_model=schemas.BatchStats)
def get_batch_stats(db: Annotated[Session, Depends(get_db)]):
    """Get batch statistics"""
    total_batches = db.query(func.count(models.Batch.batch_id)).scalar()
    in_production = db.query(func.count(models.Batch.batch_id)).filter(
        models.Batch.status.in_([STATUS_PENDING, STATUS_IN_PROGRESS])
    ).scalar()
    completed = db.query(func.count(models.Batch.batch_id)).filter(
        models.Batch.status == STATUS_COMPLETED
    ).scalar()
    
    return {
        "total_batches": total_batches,
        "in_production": in_production,
        "completed": completed
    }

@router.get("/phase-stats", response_model=schemas.PhaseStats)
def get_phase_stats(db: Annotated[Session, Depends(get_db)]):
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
    
    def _phase_group(name: str) -> Optional[str]:
        exact = {"Cutting": "Cutting", "Packaging": "Packaging", "QC": "QC"}
        group = exact.get(name)
        if group:
            return group
        for prefix, prefix_group in (("Sewing", "Sewing"), ("QC", "QC")):
            if name.startswith(prefix):
                return prefix_group
        return None

    status_key = {STATUS_PENDING: "pending", STATUS_IN_PROGRESS: "in_progress", STATUS_COMPLETED: "completed"}
    mode = {"Cutting": "set", "Packaging": "set", "Sewing": "add", "QC": "add"}

    # Process the results
    for phase_id, phase_name, status, count in phase_stats:
        group = _phase_group(phase_name)
        key = status_key.get(status)
        if not group or not key:
            continue

        if mode[group] == "add":
            phase_counts[group][key] += count
        else:
            phase_counts[group][key] = count
    
    result = {
        "cutting": phase_counts['Cutting'],
        "sewing": phase_counts['Sewing'],
        "packaging": phase_counts['Packaging'],
        "qc": phase_counts['QC']
    }
    
    # Debug logging

    
    return result

@router.get(
    "/{batch_id}",
    response_model=schemas.BatchResponse,
    responses={404: {"description": BATCH_NOT_FOUND}},
)
def read_batch(
    batch_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    """Get a specific batch by ID"""
    db_batch = crud_get_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    return db_batch

@router.put(
    "/{batch_id}",
    response_model=schemas.BatchResponse,
    responses={
        400: {"description": "Invalid update payload"},
        404: {"description": BATCH_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
def update_batch_endpoint(
    batch_id: int,
    batch_in: schemas.BatchUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    db_batch = crud_get_batch(db, batch_id)
    if not db_batch:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not db_batch_model:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    if (
        batch_in.quantity is not None
        and batch_in.quantity > db_batch_model.quantity
        and not bool(db_batch_model.is_second_degree)
    ):
        raise HTTPException(
            status_code=400,
            detail="Quantity increment is allowed only for second degree batches",
        )
    
    try:
        # Update the batch
        updated_batch = crud_update_batch(db=db, db_batch=db_batch_model, batch=batch_in)
        return updated_batch
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"Error updating batch {batch_id}: {error_details}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.delete(
    "/{batch_id}",
    response_model=schemas.BatchResponse,
    responses={404: {"description": BATCH_NOT_FOUND}},
)
def delete_batch(
    *,
    db: Annotated[Session, Depends(get_db)],
    batch_id: int,
):
    """Delete a batch"""
    from app.crud.batch import delete_batch as crud_delete_batch
    batch = crud_delete_batch(db, batch_id=batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    return batch
@router.get(
    "/barcode/{barcode}",
    response_model=schemas.BatchResponse,
    responses={404: {"description": BATCH_NOT_FOUND}},
)
def read_batch_by_barcode(
    barcode: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Get a specific batch by barcode"""
    db_batch = crud_get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    return db_batch

@router.put(
    "/barcode/{barcode}",
    response_model=schemas.BatchResponse,
    responses={
        400: {"description": "Invalid update payload"},
        404: {"description": BATCH_NOT_FOUND},
        500: {"description": "Internal server error"},
    },
)
def update_batch_by_barcode(
    barcode: str,
    batch_in: schemas.BatchUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Optional[schemas.User], Depends(get_optional_current_user)],
):
    """Update a batch by barcode"""
    db_batch = crud_get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.barcode == barcode).first()
    if not db_batch_model:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    if (
        batch_in.quantity is not None
        and batch_in.quantity > db_batch_model.quantity
        and not bool(db_batch_model.is_second_degree)
    ):
        raise HTTPException(
            status_code=400,
            detail="Quantity increment is allowed only for second degree batches",
        )
    
    try:
        user_id = current_user.id if current_user else None
        updated_batch = crud_update_batch(db=db, db_batch=db_batch_model, batch=batch_in, user_id=user_id)
        return updated_batch
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_details = traceback.format_exc()
        print(f"Error updating batch by barcode {barcode}: {error_details}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

 

@router.post("/transition-completed-phases", response_model=Dict[str, int])
def transition_completed_phases(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[models.User, Depends(get_current_active_superuser)],
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

@router.get(
    "/{batch_id}/events",
    response_model=List[schemas.BarcodeScanEventResponse],
    responses={404: {"description": "No scan events found for this batch"}},
)
def get_batch_scan_events(
    batch_id: int,
    db: Annotated[Session, Depends(get_db)],
    limit: int = 100,
):
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

@router.get(
    "/{batch_id}/timeline/summary",
    response_model=schemas.TimelineSummaryResponse,
    responses={404: {"description": "No timeline data found for this batch"}},
)
def get_batch_timeline_summary(
    batch_id: int,
    db: Annotated[Session, Depends(get_db)],
):
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
def get_batch_visited_phases(
    batch_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    """Get unique phases that a batch has visited"""
    from app.crud.batch import get_visited_phases_by_batch
    phases = get_visited_phases_by_batch(db, batch_id)
    return phases


@router.get("/{batch_id}/production-stages", response_model=List[schemas.StageOption])
def get_batch_production_stages(
    batch_id: int,
    db: Annotated[Session, Depends(get_db)],
    phase_id: Optional[int] = None,
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
    db: Annotated[Session, Depends(get_db)],
    phase_id: Optional[int] = None,
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
            worker_id=worker_id,
            worker_name=worker_name,
            stage_name=stage_name,
            quantity_produced=qty,
            assignment_date=asgn_date,
        )
        for daid, worker_id, worker_name, stage_name, qty, asgn_date in rows
    ]


@router.get("/{batch_id}/production-history", response_model=List[schemas.BatchProductionHistoryEntry])
def get_batch_production_history(
    batch_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Get detailed production_history rows for a batch.
    Each row includes worker, quantity produced, and the registration timestamp.
    """
    from app.crud.tracking import get_batch_production_history_rows
    rows = get_batch_production_history_rows(db, batch_id)
    return [
        schemas.BatchProductionHistoryEntry(
            production_id=production_id,
            worker_id=worker_id,
            worker_name=worker_name,
            stage_name=stage_name,
            quantity_produced=qty,
            registered_at=registered_at,
        )
        for production_id, worker_id, worker_name, stage_name, qty, registered_at in rows
    ]


@router.get(
    "/barcode/{barcode}/job-order-item",
    responses={404: {"description": "Not found"}},
)
def get_job_order_item_by_barcode(
    barcode: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Get job order item information for a batch by barcode"""
    # First get the batch
    batch = crud_get_batch_by_barcode(db, barcode=barcode)
    if not batch:
        raise HTTPException(status_code=404, detail=BATCH_NOT_FOUND)
    
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
    db: Annotated[Session, Depends(get_db)],
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
def get_current_batches_by_phase(
    db: Annotated[Session, Depends(get_db)],
):
    """Get current batches grouped by production phases and status with model/color grouping"""
    return build_current_batches_by_phase(db)


@router.post(
    "/generate",
    response_model=List[schemas.GeneratedBatch],
    responses={
        400: {
            "description": "Invalid request (e.g. cut_number not in CUT-{cut_id} form, missing quantity_per_batch in manual mode, or cut/validation error).",
        },
        500: {"description": "Unexpected error while generating batches."},
    },
)
def generate_batches(
    request: schemas.BatchGenerateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Optional[schemas.User], Depends(get_optional_current_user)],
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


def _submit_resolve_size_id(db: Session, batch: schemas.GeneratedBatch) -> None:
    if batch.size_id:
        return
    size_row = db.query(models.Size).filter(models.Size.size_value == batch.size).first()
    if not size_row:
        raise HTTPException(status_code=400, detail=f"Size '{batch.size}' not found")
    batch.size_id = size_row.size_id


def _submit_validate_job_order_item(
    db: Session, job_order_id: int, batch: schemas.GeneratedBatch, color_id: int
) -> None:
    job_order_item = (
        db.query(models.JobOrderItem)
        .filter(
            models.JobOrderItem.job_order_id == job_order_id,
            models.JobOrderItem.size_id == batch.size_id,
            models.JobOrderItem.color_id == color_id,
        )
        .first()
    )
    if not job_order_item:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Size and color combination not found in job order {job_order_id}. "
                f"Size: {batch.size}, Color ID: {color_id}"
            ),
        )


def _submit_validate_all_batches(
    db: Session, request: schemas.BatchSubmitRequest, color_id: int
) -> None:
    for batch in request.batches:
        _submit_resolve_size_id(db, batch)
        _submit_validate_job_order_item(db, request.job_order_id, batch, color_id)


def _submit_duplicate_payload(batch: schemas.GeneratedBatch, existing: Any) -> Dict[str, Any]:
    return {
        "barcode": batch.barcode,
        "brand": existing.client_name,
        "model": existing.model_name,
        "size": existing.size_value,
        "color": existing.color_name,
        "quantity": batch.quantity,
        "layers": batch.layers or 1,
        "serial": str(batch.serial_number) if batch.serial_number else "N/A",
    }


def _submit_build_batch_create(
    request: schemas.BatchSubmitRequest, batch: schemas.GeneratedBatch, color_id: int
) -> schemas.BatchCreate:
    return schemas.BatchCreate(
        job_order_id=request.job_order_id,
        barcode=batch.barcode,
        size_id=batch.size_id,
        color_id=color_id,
        quantity=batch.quantity,
        layers=batch.layers or 1,
        serial=str(batch.serial_number) if batch.serial_number else "1",
        current_phase=1,
        status=STATUS_IN_PROGRESS,
        is_second_degree=False,
    )


def _submit_batch_response_after_create(
    db: Session, db_batch: models.Batch
) -> schemas.BatchResponse:
    from app.crud.batch import get_batch
    from app.crud import client, model, size, color, phase

    batch_response = get_batch(db, db_batch.batch_id)
    if batch_response:
        return batch_response
    brand = client.get_client(db, db_batch.client_id) if db_batch.client_id else None
    model_obj = model.get_model(db, db_batch.model_id) if db_batch.model_id else None
    size_obj = size.get_size(db, db_batch.size_id)
    color_obj = color.get_color(db, db_batch.color_id)
    phase_obj = phase.get_phase(db, db_batch.current_phase)
    return schemas.BatchResponse(
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
        is_second_degree=bool(db_batch.is_second_degree),
    )


def _submit_process_one_batch(
    db: Session,
    request: schemas.BatchSubmitRequest,
    batch: schemas.GeneratedBatch,
    color_id: int,
    current_user: Optional[schemas.User],
    duplicate_barcodes: List[Dict[str, Any]],
    created_batches: List[schemas.BatchResponse],
) -> None:
    from app.crud.batch import create_batch, get_batch_by_barcode

    existing = get_batch_by_barcode(db, batch.barcode)
    if existing:
        duplicate_barcodes.append(_submit_duplicate_payload(batch, existing))
        return
    try:
        batch_create = _submit_build_batch_create(request, batch, color_id)
        user_id = current_user.id if current_user else None
        db_batch = create_batch(db, batch_create, user_id=user_id)
        db.refresh(db_batch)
        created_batches.append(_submit_batch_response_after_create(db, db_batch))
    except Exception as e:
        logger.error(f"Error creating batch: {str(e)}")


@router.post(
    "/submit",
    response_model=schemas.BulkSubmitResponse,
    responses={
        400: {"description": "Invalid size or size/color not present on the job order."},
    },
)
def submit_generated_batches(
    request: schemas.BatchSubmitRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Optional[schemas.User], Depends(get_optional_current_user)],
):
    """Submit generated batches to database with duplicate checking.

    Skips duplicates and reports them.
    """
    color_id = request.color_id
    _submit_validate_all_batches(db, request, color_id)

    created_batches: List[schemas.BatchResponse] = []
    duplicate_barcodes: List[Dict[str, Any]] = []

    for batch in request.batches:
        _submit_process_one_batch(
            db,
            request,
            batch,
            color_id,
            current_user,
            duplicate_barcodes,
            created_batches,
        )

    message = f"Successfully created {len(created_batches)} batches."
    if duplicate_barcodes:
        message += f" {len(duplicate_barcodes)} duplicates found."

    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=message,
    )

class SecondDegreeBatchRequest(BaseModel):
    job_order_id: int
    items: List[Dict[str, int]]
    initial_phase: Literal["cutting", "qc"] = "qc"


def _second_degree_get_qc_phase(db: Session) -> Optional[models.ProductionPhase]:
    """Return first production phase whose name starts with 'qc' (case-insensitive), or None."""
    return (
        db.query(models.ProductionPhase)
        .filter(models.ProductionPhase.phase_name.ilike("qc%"))
        .order_by(models.ProductionPhase.phase_id)
        .first()
    )


def _second_degree_get_cutting_phase(db: Session) -> Optional[models.ProductionPhase]:
    """Return the cutting production phase (exact match), or None."""
    return (
        db.query(models.ProductionPhase)
        .filter(models.ProductionPhase.phase_name == "Cutting")
        .order_by(models.ProductionPhase.phase_id)
        .first()
    )


def _second_degree_duplicate_entry(barcode: str, existing: Any) -> Dict[str, Any]:
    return {
        "barcode": barcode,
        "size": existing.size_value if hasattr(existing, "size_value") else "Unknown",
        "color": existing.color_name if hasattr(existing, "color_name") else "Unknown",
    }


def _second_degree_create_one(
    db: Session,
    job_order_id: int,
    job_order_item: models.JobOrderItem,
    initial_phase: models.ProductionPhase,
    current_user: Optional[schemas.User],
    duplicate_barcodes: List[Dict[str, Any]],
    created_batches: List[schemas.BatchResponse],
) -> None:
    from app.crud.helpers import generate_barcode_string, get_next_serial_number
    from app.crud.batch import get_batch_by_barcode, get_batch, create_scan_event, ScanEventOptions

    serial_number = get_next_serial_number(
        db,
        job_order_id,
        job_order_item.size_id,
        job_order_item.color_id,
    )
    barcode = generate_barcode_string(
        job_order_id,
        job_order_item.size_id,
        job_order_item.color_id,
        1,
        serial_number,
    )

    existing_batch = get_batch_by_barcode(db, barcode)
    if existing_batch:
        duplicate_barcodes.append(_second_degree_duplicate_entry(barcode, existing_batch))
        return

    second_degree_batch = schemas.SecondDegreeBatchCreate(
        job_order_id=job_order_id,
        size_id=job_order_item.size_id,
        color_id=job_order_item.color_id,
        quantity=0,
        layers=1,
        current_phase=initial_phase.phase_id,
        status=STATUS_IN_PROGRESS,
        is_second_degree=True,
    )

    batch_data = second_degree_batch.dict()
    batch_data["barcode"] = barcode
    batch_data["serial"] = f"{serial_number:03d}"

    db_batch = models.Batch(**batch_data)
    db.add(db_batch)
    db.flush()

    create_scan_event(
        db,
        db_batch.batch_id,
        "scan_in",
        db_batch.current_phase,
        ScanEventOptions(
            new_status=db_batch.status,
            new_quantity=db_batch.quantity,
            new_phase=db_batch.current_phase,
            user_id=current_user.id if current_user else None,
        ),
    )

    db.refresh(db_batch)
    batch_response = get_batch(db, db_batch.batch_id)
    if batch_response:
        created_batches.append(batch_response)


def _second_degree_process_item_entry(
    db: Session,
    job_order_id: int,
    item_request: Dict[str, Any],
    initial_phase: models.ProductionPhase,
    current_user: Optional[schemas.User],
    duplicate_barcodes: List[Dict[str, Any]],
    created_batches: List[schemas.BatchResponse],
) -> None:
    item_id = item_request.get("item_id")
    count = item_request.get("count", 0)
    if count <= 0:
        return

    job_order_item = (
        db.query(models.JobOrderItem)
        .filter(
            models.JobOrderItem.item_id == item_id,
            models.JobOrderItem.job_order_id == job_order_id,
        )
        .first()
    )
    if not job_order_item:
        logger.warning(
            "Job order item %s not found for job order %s",
            item_id,
            job_order_id,
        )
        return

    for _ in range(count):
        try:
            _second_degree_create_one(
                db,
                job_order_id,
                job_order_item,
                initial_phase,
                current_user,
                duplicate_barcodes,
                created_batches,
            )
        except Exception as e:
            logger.error("Error creating second degree batch: %s", e)


@router.post(
    "/create-second-degree",
    response_model=schemas.BulkSubmitResponse,
    responses={
        404: {"description": "Job order not found"},
        400: {"description": "QC phase not found"},
    },
)
def create_second_degree_batches(
    request: SecondDegreeBatchRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Optional[schemas.User], Depends(get_optional_current_user)],
):
    """Create second degree batches for job order items.
    
    items format: [{"item_id": int, "count": int}, ...]
    where count is the number of second degree batches to create for that item.
    """
    job_order = crud_get_job_order(db, job_order_id=request.job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail=f"Job order {request.job_order_id} not found")

    if request.initial_phase == "cutting":
        initial_phase = _second_degree_get_cutting_phase(db)
        if not initial_phase:
            raise HTTPException(status_code=400, detail="Cutting phase not found")
    else:
        initial_phase = _second_degree_get_qc_phase(db)
        if not initial_phase:
            raise HTTPException(status_code=400, detail="QC phase not found")

    created_batches: List[schemas.BatchResponse] = []
    duplicate_barcodes: List[Dict[str, Any]] = []

    for item_request in request.items:
        _second_degree_process_item_entry(
            db,
            request.job_order_id,
            item_request,
            initial_phase,
            current_user,
            duplicate_barcodes,
            created_batches,
        )

    db.commit()

    message = f"Successfully created {len(created_batches)} second degree batches."
    if duplicate_barcodes:
        message += f" {len(duplicate_barcodes)} duplicates found."

    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=message,
    )

class CompensationBatchRequest(BaseModel):
    job_order_id: int
    compensations: List[Dict[str, Any]]


def _compensation_duplicate_entry(barcode: str, existing: Any) -> Dict[str, Any]:
    return {
        "barcode": barcode,
        "size": existing.size_value if hasattr(existing, "size_value") else "Unknown",
        "color": existing.color_name if hasattr(existing, "color_name") else "Unknown",
    }


def _compensation_mark_phase_history(db: Session, batch_id: int) -> None:
    db.query(models.BatchPhaseHistory).filter(
        models.BatchPhaseHistory.batch_id == batch_id
    ).update(
        {
            "compensation": True,
            "inspection_qty": 0,
            "sewing_in_qty": 0,
            "sewing_out_qty": 0,
            "qc_in_qty": 0,
            "qc_out_qty": 0,
            "packaging_in_qty": 0,
            "packaging_out_qty": 0,
            "quantity_at_phase": 0,
        }
    )


def _compensation_create_single(
    db: Session,
    job_order_id: int,
    item_id: int,
    phase_id: int,
    quantity: int,
    job_order_item: models.JobOrderItem,
    current_user: Optional[schemas.User],
    duplicate_barcodes: List[Dict[str, Any]],
    created_batches: List[schemas.BatchResponse],
) -> None:
    from app.crud.helpers import generate_barcode_string, get_next_serial_number
    from app.crud.batch import get_batch_by_barcode, get_batch

    serial_number = get_next_serial_number(
        db,
        job_order_id,
        job_order_item.size_id,
        job_order_item.color_id,
    )
    barcode = generate_barcode_string(
        job_order_id,
        job_order_item.size_id,
        job_order_item.color_id,
        1,
        serial_number,
    )

    existing_batch = get_batch_by_barcode(db, barcode)
    if existing_batch:
        duplicate_barcodes.append(_compensation_duplicate_entry(barcode, existing_batch))
        return

    compensation_batch = schemas.BatchCreate(
        job_order_id=job_order_id,
        barcode=barcode,
        size_id=job_order_item.size_id,
        color_id=job_order_item.color_id,
        quantity=quantity,
        layers=1,
        serial=f"{serial_number:03d}",
        current_phase=phase_id,
        status=STATUS_IN_PROGRESS,
        is_second_degree=False,
    )

    db_batch = models.Batch(**compensation_batch.dict())
    db.add(db_batch)
    db.flush()

    compensation = models.BatchCompensation(
        batch_id=db_batch.batch_id,
        item_id=item_id,
        phase_id=phase_id,
        quantity=quantity,
        created_by_user_id=current_user.id if current_user else None,
    )
    db.add(compensation)
    db.flush()

    _compensation_mark_phase_history(db, db_batch.batch_id)

    db.refresh(db_batch)
    batch_response = get_batch(db, db_batch.batch_id)
    if batch_response:
        created_batches.append(batch_response)


def _compensation_process_entry(
    db: Session,
    request: CompensationBatchRequest,
    comp_request: Dict[str, Any],
    current_user: Optional[schemas.User],
    duplicate_barcodes: List[Dict[str, Any]],
    created_batches: List[schemas.BatchResponse],
) -> None:
    item_id = comp_request.get("item_id")
    phase_id = comp_request.get("phase_id")
    quantity = comp_request.get("quantity", 0)
    if quantity <= 0:
        return

    job_order_item = (
        db.query(models.JobOrderItem)
        .filter(
            models.JobOrderItem.item_id == item_id,
            models.JobOrderItem.job_order_id == request.job_order_id,
        )
        .first()
    )
    if not job_order_item:
        logger.warning(
            "Job order item %s not found for job order %s",
            item_id,
            request.job_order_id,
        )
        return

    phase_row = (
        db.query(models.ProductionPhase)
        .filter(models.ProductionPhase.phase_id == phase_id)
        .first()
    )
    if not phase_row:
        logger.warning("Phase %s not found", phase_id)
        return

    try:
        _compensation_create_single(
            db,
            request.job_order_id,
            item_id,
            phase_id,
            quantity,
            job_order_item,
            current_user,
            duplicate_barcodes,
            created_batches,
        )
    except Exception as e:
        logger.error("Error creating compensation batch: %s", e)
        db.rollback()


@router.post(
    "/create-compensation",
    response_model=schemas.BulkSubmitResponse,
    responses={
        404: {"description": "Job order not found"},
        500: {"description": "Failed to commit compensation batches to the database."},
    },
)
def create_compensation_batches(
    request: CompensationBatchRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[Optional[schemas.User], Depends(get_optional_current_user)],
):
    """Create compensation batches for lost physical barcodes.
    
    Compensations format: [{"item_id": int, "phase_id": int, "quantity": int}, ...]
    These batches are NOT included in cut_qty or phase_in_qty calculations.
    """
    job_order = crud_get_job_order(db, job_order_id=request.job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail=f"Job order {request.job_order_id} not found")

    created_batches: List[schemas.BatchResponse] = []
    duplicate_barcodes: List[Dict[str, Any]] = []

    for comp_request in request.compensations:
        _compensation_process_entry(
            db,
            request,
            comp_request,
            current_user,
            duplicate_barcodes,
            created_batches,
        )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Failed to commit compensation batches: {str(e)}"
        )

    message = f"Successfully created {len(created_batches)} compensation batches."
    if duplicate_barcodes:
        message += f" {len(duplicate_barcodes)} duplicates found."

    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=message,
    )