from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
from .. import models, schemas
from datetime import datetime
from sqlalchemy import func as sa_func, case

# Batch CRUD operations and helpers will be moved here from crud.py 

# All batch, timeline, archive, and batch-related helper functions from crud.py should be moved here with their full implementation. 

# --- Batch CRUD operations and helpers ---

def get_batch(db: Session, batch_id: int):
    batch = db.query(
        models.Batch,
        models.JobOrder.job_order_number,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.JobOrder, models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Brand, models.JobOrder.brand_id == models.Brand.brand_id
    ).join(
        models.Model, models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.Size, models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color, models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase, models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(models.Batch.batch_id == batch_id).first()
    
    if batch:
        return schemas.BatchResponse(
            batch_id=batch.Batch.batch_id,
            job_order_id=batch.Batch.job_order_id,
            job_order_number=batch.job_order_number,
            barcode=batch.Batch.barcode,
            size_id=batch.Batch.size_id,
            color_id=batch.Batch.color_id,
            quantity=batch.Batch.quantity,
            layers=batch.Batch.layers,
            serial=str(batch.Batch.serial),
            current_phase=batch.Batch.current_phase,
            status=batch.Batch.status,
            brand_name=batch.brand_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            phase_name=batch.phase_name,
            last_updated_at=batch.Batch.last_updated_at,
            is_second_degree=bool(batch.Batch.is_second_degree),
            notes=getattr(batch.Batch, 'notes', None)
        )
    return None

def get_batch_by_barcode(db: Session, barcode: str):
    batch = db.query(
        models.Batch,
        models.JobOrder.job_order_number,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.JobOrder, models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Brand, models.JobOrder.brand_id == models.Brand.brand_id
    ).join(
        models.Model, models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.Size, models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color, models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase, models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(models.Batch.barcode == barcode).first()
    
    if not batch:
        # Try archived batches if not found in active batches
        batch = db.query(
            models.ArchivedBatch,
            models.JobOrder.job_order_number,
            models.Brand.brand_name,
            models.Model.model_name,
            models.Size.size_value,
            models.Color.color_name,
            models.ProductionPhase.phase_name
        ).join(
            models.JobOrder, models.ArchivedBatch.job_order_id == models.JobOrder.job_order_id
        ).join(
            models.Brand, models.JobOrder.brand_id == models.Brand.brand_id
        ).join(
            models.Model, models.JobOrder.model_id == models.Model.model_id
        ).join(
            models.Size, models.ArchivedBatch.size_id == models.Size.size_id
        ).join(
            models.Color, models.ArchivedBatch.color_id == models.Color.color_id
        ).join(
            models.ProductionPhase, models.ArchivedBatch.current_phase == models.ProductionPhase.phase_id
        ).filter(models.ArchivedBatch.barcode == barcode).first()
        if not batch:
            return None
        batch_obj = batch.ArchivedBatch
        archived_at = batch_obj.archived_at
    else:
        batch_obj = batch.Batch
        archived_at = None
    return schemas.BatchResponse(
        batch_id=batch_obj.batch_id,
        job_order_id=batch_obj.job_order_id,
        job_order_number=batch.job_order_number,
        barcode=batch_obj.barcode,
        size_id=batch_obj.size_id,
        color_id=batch_obj.color_id,
        quantity=batch_obj.quantity,
        layers=batch_obj.layers,
        serial=str(batch_obj.serial),
        current_phase=batch_obj.current_phase,
        status=batch_obj.status,
        is_second_degree=bool(batch_obj.is_second_degree),
        brand_name=batch.brand_name,
        model_name=batch.model_name,
        size_value=batch.size_value,
        color_name=batch.color_name,
        phase_name=batch.phase_name,
        last_updated_at=batch_obj.last_updated_at,
        archived_at=archived_at
    )

def get_batches(db: Session, skip: int = 0, limit: int = 100):
    batches = db.query(
        models.Batch,
        models.JobOrder.job_order_number,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.JobOrder, models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Brand, models.JobOrder.brand_id == models.Brand.brand_id
    ).join(
        models.Model, models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.Size, models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color, models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase, models.Batch.current_phase == models.ProductionPhase.phase_id
    ).offset(skip).limit(limit).all()
    
    return [
        schemas.BatchResponse(
            batch_id=batch.Batch.batch_id,
            job_order_id=batch.Batch.job_order_id,
            job_order_number=batch.job_order_number,
            barcode=batch.Batch.barcode,
            size_id=batch.Batch.size_id,
            color_id=batch.Batch.color_id,
            quantity=batch.Batch.quantity,
            layers=batch.Batch.layers,
            serial=str(batch.Batch.serial),
            current_phase=batch.Batch.current_phase,
            status=batch.Batch.status,
            brand_name=batch.brand_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            phase_name=batch.phase_name,
            last_updated_at=batch.Batch.last_updated_at,
            is_second_degree=bool(batch.Batch.is_second_degree)
        )
        for batch in batches
    ]




def create_batch(db: Session, batch: schemas.BatchCreate):
    db_batch = models.Batch(**batch.dict())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch

def update_batch(db: Session, db_batch: models.Batch, batch: schemas.BatchUpdate, user_id: Optional[int] = None):
    update_data = batch.dict(exclude_unset=True)
    
    # Store old values for comparison
    old_status = db_batch.status
    old_quantity = db_batch.quantity
    old_phase = db_batch.current_phase
    old_second_degree = db_batch.is_second_degree
    
    for field, value in update_data.items():
        if field == 'is_second_degree':
            # Convert boolean to integer for MySQL TINYINT
            new_value = 1 if value else 0
            setattr(db_batch, field, new_value)
        else:
            setattr(db_batch, field, value)
    
    # Determine what changed
    status_changed = 'status' in update_data and old_status != update_data['status']
    quantity_changed = 'quantity' in update_data and old_quantity != update_data['quantity']
    phase_changed = 'current_phase' in update_data and old_phase != update_data['current_phase']
    second_degree_changed = 'is_second_degree' in update_data and old_second_degree != update_data['is_second_degree']
    
    # Get new values
    new_status = update_data.get('status', old_status)
    new_phase = update_data.get('current_phase', old_phase)
    new_quantity = update_data.get('quantity', old_quantity)
    new_second_degree = update_data.get('is_second_degree', old_second_degree)
    
    # Create events based on changes
    if status_changed or phase_changed:
        # Create scan_in event only when starting a phase (In Progress or Pending)
        if new_status in ['In Progress', 'Pending']:
            create_scan_event(
                db=db,
                batch_id=db_batch.batch_id,
                action_type='scan_in',
                phase_id=new_phase,
                old_status=old_status,
                new_status=new_status,
                old_phase=old_phase,
                new_phase=new_phase,
                old_quantity=old_quantity,
                new_quantity=new_quantity,
                user_id=user_id,
                notes=f"Status changed from {old_status} to {new_status}" if status_changed else None
            )
        
        # Create scan_out event only when completing a phase
        if new_status == 'Completed':
            create_scan_event(
                db=db,
                batch_id=db_batch.batch_id,
                action_type='scan_out',
                phase_id=new_phase,
                old_status=old_status,
                new_status=new_status,
                old_quantity=old_quantity,
                new_quantity=new_quantity,
                user_id=user_id,
                notes="Phase completed"
            )
    
    # Only create quantity event if quantity actually changed
    if quantity_changed:
        create_scan_event(
            db=db,
            batch_id=db_batch.batch_id,
            action_type='quantity_update',
            phase_id=new_phase,
            old_quantity=old_quantity,
            new_quantity=new_quantity,
            user_id=user_id,
            notes=f"Quantity updated from {old_quantity} to {new_quantity}"
        )
    
    # Create second degree event if second degree status changed
    if second_degree_changed:
        create_scan_event(
            db=db,
            batch_id=db_batch.batch_id,
            action_type='second_degree_update',
            phase_id=new_phase,
            old_status=str(old_second_degree),
            new_status=str(new_second_degree),
            old_quantity=old_quantity,
            new_quantity=new_quantity,
            user_id=user_id,
            notes=f"Second degree status changed from {'Yes' if old_second_degree else 'No'} to {'Yes' if new_second_degree else 'No'}"
        )
    
    # Note: Automatic phase transitions are handled by the database trigger 'handle_phase_transitions'
    # The trigger automatically transitions:
    # - Cutting (In Progress → Completed) → Sewing - 1 (Pending)
    # - Any Sewing (In Progress → Completed) → Packaging (Pending)
    
    db.commit()
    db.refresh(db_batch)
    # Get related info through JobOrder
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == db_batch.job_order_id).first()
    brand = db.query(models.Brand).filter(models.Brand.brand_id == job_order.brand_id).first() if job_order and job_order.brand_id else None
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first() if job_order and job_order.model_id else None
    size = db.query(models.Size).filter(models.Size.size_id == db_batch.size_id).first()
    color = db.query(models.Color).filter(models.Color.color_id == db_batch.color_id).first()
    phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == db_batch.current_phase).first()
    return schemas.BatchResponse(
        batch_id=db_batch.batch_id,
        job_order_id=db_batch.job_order_id,
        job_order_number=job_order.job_order_number if job_order else None,
        barcode=db_batch.barcode,
        size_id=db_batch.size_id,
        color_id=db_batch.color_id,
        quantity=db_batch.quantity,
        layers=db_batch.layers,
        serial=str(db_batch.serial),
        current_phase=db_batch.current_phase,
        status=db_batch.status,
        is_second_degree=bool(db_batch.is_second_degree),
        brand_name=brand.brand_name if brand else "",
        model_name=model.model_name if model else "",
        size_value=size.size_value if size else "",
        color_name=color.color_name if color else "",
        phase_name=phase.phase_name if phase else "",
        last_updated_at=db_batch.last_updated_at,
        archived_at=None
    )

def transition_all_completed_phases(db: Session):
    """
    Manually transition all existing batches that are in completed phases:
    1. Cutting phase (1) with Completed status → Sewing - 1 (phase 2) with Pending status
    2. Any Sewing phase (2, 3, 4, 7) with Completed status → Packaging (phase 8) with Pending status
    """
    # Find all batches in Cutting phase with Completed status
    cutting_completed_batches = db.query(models.Batch).filter(
        models.Batch.current_phase == 1,
        models.Batch.status == "Completed"
    ).all()
    
    # Find all batches in Sewing phases with Completed status
    sewing_completed_batches = db.query(models.Batch).filter(
        models.Batch.current_phase.in_([2, 3, 4, 7]),
        models.Batch.status == "Completed"
    ).all()
    
    transitioned_count = 0
    
    # Transition cutting batches
    for batch in cutting_completed_batches:
        batch.current_phase = 2
        batch.status = "Pending"
        # Create scan events for the transition
        create_scan_event(db, batch.batch_id, "scan_in", 2, "Completed", "Pending", user_id=None, notes="Phase transition from Cutting to Sewing")
        transitioned_count += 1
        print(f"Transitioned batch {batch.batch_id} from Cutting (Completed) to Sewing - 1 (Pending)")
    
    # Transition sewing batches
    for batch in sewing_completed_batches:
        batch.current_phase = 8
        batch.status = "Pending"
        # Create scan events for the transition
        create_scan_event(db, batch.batch_id, "scan_in", 8, "Completed", "Pending", user_id=None, notes="Phase transition from Sewing to Packaging")
        transitioned_count += 1
        print(f"Transitioned batch {batch.batch_id} from Sewing phase {batch.current_phase} (Completed) to Packaging (Pending)")
    
    if transitioned_count > 0:
        db.commit()
        print(f"Successfully transitioned {transitioned_count} batches")
    
    return transitioned_count

def update_batch_status(db: Session, batch_id: int, status: str):
    db_batch = get_batch(db, batch_id)
    if db_batch:
        db_batch.status = status
        db.commit()
        db.refresh(db_batch)
    return db_batch

def update_batch_phase(db: Session, batch_id: int, phase_id: int):
    db_batch = get_batch(db, batch_id)
    if db_batch:
        db_batch.current_phase = phase_id
        db.commit()
        db.refresh(db_batch)
    return db_batch

def delete_batch(db: Session, batch_id: int):
    batch_data = get_batch(db, batch_id)
    if batch_data:
        # Delete related scan events first (CASCADE should handle this, but being explicit)
        db.query(models.BarcodeScanEvent).filter(
            models.BarcodeScanEvent.batch_id == batch_id
        ).delete()
        db.query(models.Batch).filter(models.Batch.batch_id == batch_id).delete()
        db.commit()
    return batch_data

def archive_batch(db: Session, batch_id: int):
    batch_data = get_batch(db, batch_id)
    if not batch_data:
        return None
    archived_batch = models.ArchivedBatch(
        batch_id=batch_data.batch_id,
        job_order_id=batch_data.job_order_id,
        barcode=batch_data.barcode,
        brand_id=batch_data.brand_id,
        model_id=batch_data.model_id,
        size_id=batch_data.size_id,
        color_id=batch_data.color_id,
        quantity=batch_data.quantity,
        layers=batch_data.layers,
        serial=batch_data.serial,
        current_phase=batch_data.current_phase,
        status=batch_data.status,
        last_updated_at=batch_data.last_updated_at,
        archived_at=sa_func.now()
    )
    db.add(archived_batch)
    db.query(models.Batch).filter(models.Batch.batch_id == batch_id).delete()
    db.commit()
    return batch_data

def archive_batches_bulk(db: Session, batch_ids: List[int]):
    archived_batches = []
    for batch_id in batch_ids:
        batch_data = get_batch(db, batch_id)
        if batch_data:
            archived_batch = models.ArchivedBatch(
                batch_id=batch_data.batch_id,
                job_order_id=batch_data.job_order_id,
                barcode=batch_data.barcode,
                brand_id=batch_data.brand_id,
                model_id=batch_data.model_id,
                size_id=batch_data.size_id,
                color_id=batch_data.color_id,
                quantity=batch_data.quantity,
                layers=batch_data.layers,
                serial=batch_data.serial,
                current_phase=batch_data.current_phase,
                status=batch_data.status,
                last_updated_at=batch_data.last_updated_at,
                archived_at=sa_func.now()
            )
            db.add(archived_batch)
            archived_batches.append(batch_data)
    db.query(models.Batch).filter(models.Batch.batch_id.in_(batch_ids)).delete(synchronize_session=False)
    db.commit()
    return archived_batches

def delete_archived_batch(db: Session, batch_id: int):
    archived_batch = db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).first()
    if archived_batch:
        db.query(models.ArchivedBatch).filter(
            models.ArchivedBatch.batch_id == batch_id
        ).delete()
        db.commit()
        return schemas.BatchResponse(
            batch_id=archived_batch.batch_id,
            job_order_id=archived_batch.job_order_id,
            job_order_number=archived_batch.job_order_number,
            barcode=archived_batch.barcode,
            brand_id=archived_batch.brand_id,
            model_id=archived_batch.model_id,
            size_id=archived_batch.size_id,
            color_id=archived_batch.color_id,
            quantity=archived_batch.quantity,
            layers=archived_batch.layers,
            serial=str(archived_batch.serial),
            current_phase=archived_batch.current_phase,
            status=archived_batch.status,
            brand_name="",
            model_name="",
            size_value="",
            color_name="",
            phase_name="",
            last_updated_at=archived_batch.last_updated_at,
            archived_at=archived_batch.archived_at
        )
    return None

def recover_archived_batch(db: Session, batch_id: int):
    archived_batch = db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).first()
    if not archived_batch:
        return None
    existing_batch = db.query(models.Batch).filter(
        models.Batch.barcode == archived_batch.barcode
    ).first()
    if existing_batch:
        raise ValueError(f"A batch with barcode {archived_batch.barcode} already exists in active batches")
    active_batch = models.Batch(
        batch_id=archived_batch.batch_id,
        barcode=archived_batch.barcode,
        brand_id=archived_batch.brand_id,
        model_id=archived_batch.model_id,
        size_id=archived_batch.size_id,
        color_id=archived_batch.color_id,
        quantity=archived_batch.quantity,
        layers=archived_batch.layers,
        serial=archived_batch.serial,
        current_phase=archived_batch.current_phase,
        status=archived_batch.status,
        last_updated_at=sa_func.now()
    )
    db.add(active_batch)
    db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).delete()
    db.commit()
    brand = db.query(models.Brand).filter(models.Brand.brand_id == active_batch.brand_id).first()
    model = db.query(models.Model).filter(models.Model.model_id == active_batch.model_id).first()
    size = db.query(models.Size).filter(models.Size.size_id == active_batch.size_id).first()
    color = db.query(models.Color).filter(models.Color.color_id == active_batch.color_id).first()
    phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == active_batch.current_phase).first()
    return schemas.BatchResponse(
        batch_id=active_batch.batch_id,
        job_order_id=active_batch.job_order_id,
        job_order_number=active_batch.job_order_number,
        barcode=active_batch.barcode,
        brand_id=active_batch.brand_id,
        model_id=active_batch.model_id,
        size_id=active_batch.size_id,
        color_id=active_batch.color_id,
        quantity=active_batch.quantity,
        layers=active_batch.layers,
        serial=str(active_batch.serial),
        current_phase=active_batch.current_phase,
        status=active_batch.status,
        brand_name=brand.brand_name if brand else "",
        model_name=model.model_name if model else "",
        size_value=size.size_value if size else "",
        color_name=color.color_name if color else "",
        phase_name=phase.phase_name if phase else "",
        last_updated_at=active_batch.last_updated_at,
        archived_at=None
    )

def recover_archived_batches_bulk(db: Session, batch_ids: List[int]):
    recovered_batches = []
    for batch_id in batch_ids:
        try:
            archived_batch = db.query(models.ArchivedBatch).filter(
                models.ArchivedBatch.batch_id == batch_id
            ).first()
            if not archived_batch:
                continue
            existing_batch = db.query(models.Batch).filter(
                models.Batch.barcode == archived_batch.barcode
            ).first()
            if existing_batch:
                for field in ['brand_id', 'model_id', 'size_id', 'color_id', 'quantity', 
                             'layers', 'serial', 'current_phase', 'status', 'last_updated_at']:
                    if hasattr(archived_batch, field):
                        setattr(existing_batch, field, getattr(archived_batch, field))
                db.delete(archived_batch)
                recovered_batches.append(existing_batch)
            else:
                new_batch = models.Batch(
                    batch_id=archived_batch.batch_id,
                    barcode=archived_batch.barcode,
                    brand_id=archived_batch.brand_id,
                    model_id=archived_batch.model_id,
                    size_id=archived_batch.size_id,
                    color_id=archived_batch.color_id,
                    quantity=archived_batch.quantity,
                    layers=archived_batch.layers,
                    serial=archived_batch.serial,
                    current_phase=archived_batch.current_phase,
                    status=archived_batch.status,
                    last_updated_at=archived_batch.last_updated_at
                )
                db.add(new_batch)
                db.delete(archived_batch)
                recovered_batches.append(new_batch)
        except Exception as e:
            print(f"Error recovering batch {batch_id}: {str(e)}")
            continue
    db.commit()
    return recovered_batches 

# Event-based timeline functions
def create_scan_event(db: Session, batch_id: int, action_type: str, phase_id: int, 
                     old_status: Optional[str] = None, new_status: Optional[str] = None,
                     old_quantity: Optional[int] = None, new_quantity: Optional[int] = None,
                     old_phase: Optional[int] = None, new_phase: Optional[int] = None,
                     user_id: Optional[int] = None, notes: Optional[str] = None):
    """Create a new scan event record"""
    event = models.BarcodeScanEvent(
        batch_id=batch_id,
        action_type=action_type,
        phase_id=phase_id,
        old_status=old_status,
        new_status=new_status,
        old_quantity=old_quantity,
        new_quantity=new_quantity,
        old_phase=old_phase,
        new_phase=new_phase,
        user_id=user_id,
        notes=notes
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event

def get_scan_events_by_batch(db: Session, batch_id: int, limit: int = 100):
    """Get all scan events for a batch, ordered by scan time"""
    return db.query(models.BarcodeScanEvent).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).order_by(models.BarcodeScanEvent.scanned_at.desc()).limit(limit).all()

def get_timeline_summary_by_batch(db: Session, batch_id: int):
    """Get aggregated timeline summary for a batch"""
    # Get all events for the batch
    events = db.query(models.BarcodeScanEvent).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).order_by(models.BarcodeScanEvent.scanned_at).all()
    
    if not events:
        return None
    
    # Get batch info
    batch = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not batch:
        return None
    
    # Group events by phase and calculate timeline
    timeline_entries = []
    current_phase_events = []
    current_phase_id = None
    
    for event in events:
        if current_phase_id is None:
            current_phase_id = event.phase_id
            current_phase_events = [event]
        elif event.phase_id == current_phase_id:
            current_phase_events.append(event)
        else:
            # Process the previous phase
            if current_phase_events:
                entry = _create_timeline_entry_from_events(db, current_phase_events)
                if entry:
                    timeline_entries.append(entry)
            
            # Start new phase
            current_phase_id = event.phase_id
            current_phase_events = [event]
    
    # Process the last phase
    if current_phase_events:
        entry = _create_timeline_entry_from_events(db, current_phase_events)
        if entry:
            timeline_entries.append(entry)
    
    return {
        'barcode': batch.barcode,
        'timeline_entries': timeline_entries,
        'total_entries': len(timeline_entries),
        'total_events': len(events)
    }

def _create_timeline_entry_from_events(db: Session, events: List[models.BarcodeScanEvent]):
    """Helper function to create timeline entry from events"""
    if not events:
        return None
    
    # Get phase name
    phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == events[0].phase_id
    ).first()
    
    # Find start and end events
    start_event = None
    end_event = None
    quantity_events = []
    
    for event in events:
        if event.action_type == 'scan_in':
            start_event = event
        elif event.action_type == 'scan_out':
            end_event = event
        elif event.action_type == 'quantity_update':
            quantity_events.append(event)
    
    # Calculate duration
    duration_minutes = None
    if start_event and end_event:
        duration_seconds = (end_event.scanned_at - start_event.scanned_at).total_seconds()
        duration_minutes = max(0, int(duration_seconds // 60))
    
    # Determine status
    status = 'In Progress'
    if end_event:
        status = 'Completed'
    elif start_event and start_event.new_status == 'Pending':
        status = 'Pending'
    
    # Get quantities
    quantity_at_start = None
    quantity_at_end = None
    
    if quantity_events:
        # Get first and last quantity events
        first_qty_event = min(quantity_events, key=lambda x: x.scanned_at)
        last_qty_event = max(quantity_events, key=lambda x: x.scanned_at)
        quantity_at_start = first_qty_event.old_quantity
        quantity_at_end = last_qty_event.new_quantity
    
    return {
        'phase_id': events[0].phase_id,
        'phase_name': phase.phase_name if phase else f'Phase {events[0].phase_id}',
        'start_time': start_event.scanned_at if start_event else None,
        'end_time': end_event.scanned_at if end_event else None,
        'duration_minutes': duration_minutes,
        'status': status,
        'quantity_at_start': quantity_at_start,
        'quantity_at_end': quantity_at_end,
        'event_count': len(events)
    }

def get_detailed_events_by_batch(db: Session, batch_id: int, limit: int = 100):
    """Get detailed scan events with phase and user names"""
    events = db.query(
        models.BarcodeScanEvent,
        models.ProductionPhase.phase_name,
        models.User.username.label('user_name')
    ).join(
        models.ProductionPhase, models.BarcodeScanEvent.phase_id == models.ProductionPhase.phase_id
    ).outerjoin(
        models.User, models.BarcodeScanEvent.user_id == models.User.user_id
    ).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).order_by(models.BarcodeScanEvent.scanned_at.desc()).limit(limit).all()
    
    return events 