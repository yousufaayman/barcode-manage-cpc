from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple, Union
import pandas as pd
from .. import models, schemas
from datetime import datetime
from sqlalchemy import func as sa_func, case
from .ledger_helpers import (
    get_phase_type,
    get_phase_sequence_order,
    calculate_quantity_delta,
    determine_affects_phase_type,
    create_ledger_entry,
    is_backward_movement,
    get_events_to_reverse,
    crosses_phase_type_boundary
)

# Batch CRUD operations and helpers will be moved here from crud.py 

# All batch, timeline, archive, and batch-related helper functions from crud.py should be moved here with their full implementation. 

# --- Batch CRUD operations and helpers ---

def get_batch(db: Session, batch_id: int):
    batch = db.query(
        models.Batch,
        models.JobOrder.job_order_number,
        models.Client.client_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.JobOrder, models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Client, models.JobOrder.client_id == models.Client.client_id
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
            client_name=batch.client_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            phase_name=batch.phase_name,
            last_updated=batch.Batch.last_updated,
            is_second_degree=bool(batch.Batch.is_second_degree),
            notes=getattr(batch.Batch, 'notes', None)
        )
    return None

def get_batch_by_barcode(db: Session, barcode: str):
    batch = db.query(
        models.Batch,
        models.JobOrder.job_order_number,
        models.Client.client_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.JobOrder, models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Client, models.JobOrder.client_id == models.Client.client_id
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
            models.Client.client_name,
            models.Model.model_name,
            models.Size.size_value,
            models.Color.color_name,
            models.ProductionPhase.phase_name
        ).join(
            models.JobOrder, models.ArchivedBatch.job_order_id == models.JobOrder.job_order_id
        ).join(
            models.Client, models.JobOrder.client_id == models.Client.client_id
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
        client_name=batch.client_name,
        model_name=batch.model_name,
        size_value=batch.size_value,
        color_name=batch.color_name,
        phase_name=batch.phase_name,
        last_updated=batch_obj.last_updated,
        archived_at=archived_at
    )

def get_batches(db: Session, skip: int = 0, limit: int = 100):
    batches = db.query(
        models.Batch,
        models.JobOrder.job_order_number,
        models.Client.client_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.JobOrder, models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Client, models.JobOrder.client_id == models.Client.client_id
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
            client_name=batch.client_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            phase_name=batch.phase_name,
            last_updated=batch.Batch.last_updated,
            is_second_degree=bool(batch.Batch.is_second_degree)
        )
        for batch in batches
    ]

def create_batch(db: Session, batch: Union[schemas.BatchCreate, schemas.SecondDegreeBatchCreate], user_id: Optional[int] = None):
    try:
        batch_data = batch.dict()
        
        # All batches now have barcodes (generated by validation)
        # No need to generate barcodes here anymore
        
        db_batch = models.Batch(**batch_data)
        db.add(db_batch)
        db.commit()
        db.refresh(db_batch)
        
        # Create initial scan event for the new batch
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
            user_id=user_id
        )
        
        return db_batch
        
    except Exception as e:
        db.rollback()
        raise e

def update_batch(db: Session, db_batch: models.Batch, batch: schemas.BatchUpdate, user_id: Optional[int] = None):
    try:
        update_data = batch.model_dump(exclude_unset=True)
    except AttributeError:
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
    
    # Phase 2: Detect backward movement and create reversals
    backward_movement_detected = False
    events_to_reverse = []
    if phase_changed and old_phase and new_phase:
        backward_movement_detected = is_backward_movement(db, old_phase, new_phase)
        
        if backward_movement_detected:
            events_to_reverse = get_events_to_reverse(db, db_batch.batch_id, old_phase, new_phase)
            
            if not events_to_reverse:
                raise ValueError(
                    f"Cannot move batch {db_batch.batch_id} backward from phase {old_phase} to {new_phase}: "
                    "No events found to reverse. Backward movement requires reversal events."
                )
    
    try:
        # Phase 2: Create reversal events for backward movement
        # CRITICAL: Create negative ledger entries for each phase type the batch leaves
        # The positive ledger entry for re-entry will be created by the normal scan_in event below
        if backward_movement_detected and events_to_reverse:
            for original_event in events_to_reverse:
                if original_event.quantity_delta and original_event.quantity_delta != 0:
                    # Create reversal with opposite delta sign
                    # This creates negative deltas for downstream phases that need to be reversed
                    create_scan_event(
                        db=db,
                        batch_id=db_batch.batch_id,
                        action_type='phase_change',
                        phase_id=original_event.phase_id,
                        old_phase=old_phase,
                        new_phase=new_phase,
                        old_status=original_event.new_status,
                        new_status=original_event.old_status,
                        old_quantity=original_event.new_quantity,
                        new_quantity=original_event.old_quantity,
                        user_id=user_id,
                        notes=f"Reversal of event {original_event.id} due to backward movement from phase {old_phase} to {new_phase}",
                        is_reversal=True,
                        reversed_event_id=original_event.id
                    )
        
        # Create events based on changes
        # CRITICAL: Ledger entries are only written when crossing phase type boundaries
        # The determine_affects_phase_type function handles this logic
        if status_changed or phase_changed:
            # Create scan_in event when starting a phase
            # Ledger IN written only if crossing INTO a new phase type (handled by determine_affects_phase_type)
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
                    user_id=user_id
                )
            
            # Create scan_out event when completing a phase
            # Ledger OUT written only if crossing OUT OF phase type to a different one (handled by determine_affects_phase_type)
            if new_status == 'Completed':
                create_scan_event(
                    db=db,
                    batch_id=db_batch.batch_id,
                    action_type='scan_out',
                    phase_id=old_phase if old_phase else new_phase,
                    old_status=old_status,
                    new_status=new_status,
                    old_quantity=old_quantity,
                    new_quantity=new_quantity,
                    old_phase=old_phase,
                    new_phase=new_phase,
                    user_id=user_id
                )

                current_phase = db.query(models.ProductionPhase).filter(
                    models.ProductionPhase.phase_id == new_phase
                ).first()
                
                if current_phase:
                    next_phase = None
                    if current_phase.phase_name == 'Cutting':
                        # Cutting → Sewing (lowest sequence_order)
                        next_phase = db.query(models.ProductionPhase).filter(
                            models.ProductionPhase.type == 'sewing'
                        ).order_by(models.ProductionPhase.sequence_order.asc()).first()
                    elif current_phase.type == 'sewing':
                        # Sewing → QC (lowest sequence_order)
                        next_phase = db.query(models.ProductionPhase).filter(
                            models.ProductionPhase.type == 'qc'
                        ).order_by(models.ProductionPhase.sequence_order.asc()).first()
                    elif current_phase.type == 'qc':
                        # QC → Packaging (lowest sequence_order)
                        next_phase = db.query(models.ProductionPhase).filter(
                            models.ProductionPhase.type == 'packaging'
                        ).order_by(models.ProductionPhase.sequence_order.asc()).first()
                    
                    if next_phase:
                        try:
                            create_scan_event(
                                db=db,
                                batch_id=db_batch.batch_id,
                                action_type='scan_in',
                                phase_id=next_phase.phase_id,
                                old_status='Completed',
                                new_status='Pending',
                                old_phase=new_phase,
                                new_phase=next_phase.phase_id,
                                old_quantity=new_quantity,
                                new_quantity=new_quantity,
                                user_id=user_id
                            )
                        except Exception as e:
                            db.rollback()
                            raise e
        
        # Only create quantity event if quantity actually changed
        if quantity_changed:
            deduction_to_phase = update_data.get('deduction_to_phase')
            deduction_amount = old_quantity - new_quantity if old_quantity > new_quantity else 0
            increment_amount = new_quantity - old_quantity if new_quantity > old_quantity else 0
            quantity_decrement_type_raw = update_data.get('quantity_decrement_type')
            quantity_decrement_type = quantity_decrement_type_raw.value if hasattr(quantity_decrement_type_raw, 'value') else quantity_decrement_type_raw
            quantity_decrement_reason = update_data.get('quantity_decrement_reason')
            quantity_increment_reason = update_data.get('quantity_increment_reason')
            
            if deduction_to_phase and deduction_amount > 0:
                create_scan_event(
                    db=db,
                    batch_id=db_batch.batch_id,
                    action_type='scan_out',
                    phase_id=deduction_to_phase,
                    old_status=None,
                    new_status=None,
                    old_quantity=deduction_amount,
                    new_quantity=0,
                    old_phase=None,
                    new_phase=None,
                    user_id=user_id
                )
            if deduction_amount > 0:
                if quantity_decrement_type in ('rejection', 'lost'):
                    quantity_decrement_phase_id = getattr(batch, 'quantity_decrement_phase_id', None)
                    if quantity_decrement_phase_id is None:
                        quantity_decrement_phase_id = update_data.get('quantity_decrement_phase_id')
                    try:
                        from .rejection import create_rejection
                        from ..schemas import SingleRejectionCreate
                        from sqlalchemy.exc import SQLAlchemyError
                        
                        if quantity_decrement_type == 'lost':
                            rejection_reason = 'lost/untracked'
                            return_to_phase_id = new_phase
                        else:
                            rejection_reason = quantity_decrement_reason or f"Quantity decremented by {deduction_amount}"
                            return_to_phase_id = quantity_decrement_phase_id
                        
                        rejection_create = SingleRejectionCreate(
                            batch_id=db_batch.batch_id,
                            rejected_from_phase_id=new_phase,
                            return_to_phase_id=return_to_phase_id,
                            quantity=deduction_amount,
                            rejection_reason=rejection_reason,
                            notes=f"Auto-created from quantity update"
                        )
                        create_rejection(db=db, rejection=rejection_create, user_id=user_id, commit=False)
                    except SQLAlchemyError as e:
                        db.rollback()
                        raise e
                    except Exception as e:
                        db.rollback()
                        raise ValueError(f"Failed to create rejection: {str(e)}") from e
            
            if quantity_decrement_type not in ('rejection', 'lost'):
                notes_text = None
                if quantity_decrement_type:
                    decrement_type_label = {
                        'second_degree': 'Second degree'
                    }.get(quantity_decrement_type, quantity_decrement_type)
                    notes_parts = [f"Decrement type: {decrement_type_label}"]
                    if quantity_decrement_reason:
                        notes_parts.append(f"Reason: {quantity_decrement_reason}")
                    notes_text = "; ".join(notes_parts)
                
                create_scan_event(
                    db=db,
                    batch_id=db_batch.batch_id,
                    action_type='quantity_update',
                    phase_id=new_phase,
                    old_quantity=old_quantity,
                    new_quantity=new_quantity,
                    user_id=user_id,
                    notes=notes_text
                )
        
        # Create second degree event if second degree status changed
        if second_degree_changed:
            create_scan_event(
                db=db,
                batch_id=db_batch.batch_id,
                action_type='status_change',
                phase_id=new_phase,
                old_status=str(old_second_degree),
                new_status=str(new_second_degree),
                old_quantity=old_quantity,
                new_quantity=new_quantity,
                user_id=user_id
            )
    except Exception as e:
        db.rollback()
        raise e
    
    # Note: Automatic phase transitions are handled by the database trigger 'handle_phase_transitions'
    # The trigger automatically transitions:
    # - Cutting (In Progress → Completed) → Sewing - 1 (Pending)
    # - Any Sewing (In Progress → Completed) → Packaging (Pending)
    
    db.commit()
    db.refresh(db_batch)
    # Get related info through JobOrder
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == db_batch.job_order_id).first()
    brand = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order and job_order.client_id else None
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
        client_name=brand.client_name if brand else "",
        model_name=model.model_name if model else "",
        size_value=size.size_value if size else "",
        color_name=color.color_name if color else "",
        phase_name=phase.phase_name if phase else "",
        last_updated=db_batch.last_updated,
        archived_at=None
    )

def transition_all_completed_phases(db: Session):
    """
    Manually transition all existing batches that are in completed phases:
    1. Cutting phase with Completed status → Sewing phase with lowest sequence_order with Pending status
    2. Any Sewing phase with Completed status → QC phase with lowest sequence_order with Pending status
    3. QC phase with Completed status → Packaging phase with lowest sequence_order with Pending status
    """
    cutting_phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_name == 'Cutting'
    ).first()
    
    first_sewing_phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.type == 'sewing'
    ).order_by(models.ProductionPhase.sequence_order.asc()).first()
    
    first_qc_phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.type == 'qc'
    ).order_by(models.ProductionPhase.sequence_order.asc()).first()
    
    first_packaging_phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.type == 'packaging'
    ).order_by(models.ProductionPhase.sequence_order.asc()).first()
    
    if not cutting_phase or not first_sewing_phase or not first_qc_phase or not first_packaging_phase:
        print("Required phases not found in database")
        return 0
    
    cutting_phase_id = cutting_phase.phase_id
    first_sewing_phase_id = first_sewing_phase.phase_id
    first_qc_phase_id = first_qc_phase.phase_id
    first_packaging_phase_id = first_packaging_phase.phase_id
    
    sewing_phases = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.type == 'sewing'
    ).all()
    sewing_phase_ids = [phase.phase_id for phase in sewing_phases]
    
    qc_phases = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.type == 'qc'
    ).all()
    qc_phase_ids = [phase.phase_id for phase in qc_phases]
    
    # Find all batches in Cutting phase with Completed status
    cutting_completed_batches = db.query(models.Batch).filter(
        models.Batch.current_phase == cutting_phase_id,
        models.Batch.status == "Completed"
    ).all()
    
    # Find all batches in Sewing phases with Completed status
    sewing_completed_batches = db.query(models.Batch).filter(
        models.Batch.current_phase.in_(sewing_phase_ids),
        models.Batch.status == "Completed"
    ).all()
    
    # Find all batches in QC phases with Completed status
    qc_completed_batches = db.query(models.Batch).filter(
        models.Batch.current_phase.in_(qc_phase_ids),
        models.Batch.status == "Completed"
    ).all()
    
    transitioned_count = 0
    
    # Transition cutting batches
    for batch in cutting_completed_batches:
        batch.current_phase = first_sewing_phase_id
        batch.status = "Pending"
        try:
            create_scan_event(db, batch.batch_id, "scan_in", first_sewing_phase_id, "Completed", "Pending", user_id=None)
        except Exception as e:
            print(f"Error creating scan event for batch {batch.batch_id}: {e}")
            continue
        transitioned_count += 1
        print(f"Transitioned batch {batch.batch_id} from Cutting (Completed) to {first_sewing_phase.phase_name} (Pending)")
    
    # Transition sewing batches
    for batch in sewing_completed_batches:
        batch.current_phase = first_qc_phase_id
        batch.status = "Pending"
        try:
            create_scan_event(db, batch.batch_id, "scan_in", first_qc_phase_id, "Completed", "Pending", user_id=None)
        except Exception as e:
            print(f"Error creating scan event for batch {batch.batch_id}: {e}")
            continue
        transitioned_count += 1
        print(f"Transitioned batch {batch.batch_id} from Sewing phase (Completed) to {first_qc_phase.phase_name} (Pending)")
    
    # Transition QC batches
    for batch in qc_completed_batches:
        batch.current_phase = first_packaging_phase_id
        batch.status = "Pending"
        try:
            create_scan_event(db, batch.batch_id, "scan_in", first_packaging_phase_id, "Completed", "Pending", user_id=None)
        except Exception as e:
            print(f"Error creating scan event for batch {batch.batch_id}: {e}")
            continue
        transitioned_count += 1
        print(f"Transitioned batch {batch.batch_id} from QC phase (Completed) to {first_packaging_phase.phase_name} (Pending)")
    
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
    # Get the actual batch model instead of the response schema
    batch_model = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not batch_model:
        return None
    
    # Check if already archived
    existing_archived = db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).first()
    
    if existing_archived:
        # Already archived, just delete from main table
        db.query(models.Batch).filter(models.Batch.batch_id == batch_id).delete()
        db.commit()
        return batch_model
    
    # Archive barcode scan events for this batch
    scan_events = db.query(models.BarcodeScanEvent).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).all()
    
    for scan_event in scan_events:
        # Check if already archived by batch_id and scanned_at (unique combination)
        existing_archived_event = db.query(models.ArchivedBarcodeScanEvent).filter(
            models.ArchivedBarcodeScanEvent.batch_id == scan_event.batch_id,
            models.ArchivedBarcodeScanEvent.scanned_at == scan_event.scanned_at,
            models.ArchivedBarcodeScanEvent.action_type == scan_event.action_type
        ).first()
        
        if not existing_archived_event:
            archived_scan_event = models.ArchivedBarcodeScanEvent(
                batch_id=scan_event.batch_id,
                action_type=scan_event.action_type,
                phase_id=scan_event.phase_id,
                old_status=scan_event.old_status,
                new_status=scan_event.new_status,
                old_quantity=scan_event.old_quantity,
                new_quantity=scan_event.new_quantity,
                old_phase=scan_event.old_phase,
                new_phase=scan_event.new_phase,
                scanned_at=scan_event.scanned_at,
                user_id=scan_event.user_id,
                archived_at=sa_func.now()
            )
            db.add(archived_scan_event)
    
    archived_batch = models.ArchivedBatch(
        batch_id=batch_model.batch_id,
        job_order_id=batch_model.job_order_id,
        barcode=batch_model.barcode,
        size_id=batch_model.size_id,
        color_id=batch_model.color_id,
        quantity=batch_model.quantity,
        layers=batch_model.layers,
        serial=batch_model.serial,
        current_phase=batch_model.current_phase,
        status=batch_model.status,
        last_updated=batch_model.last_updated,
        is_second_degree=batch_model.is_second_degree,
        archived_at=sa_func.now()
    )
    db.add(archived_batch)
    
    # Delete scan events from main table
    db.query(models.BarcodeScanEvent).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).delete(synchronize_session=False)
    
    # Delete batch from main table
    db.query(models.Batch).filter(models.Batch.batch_id == batch_id).delete()
    db.commit()
    return batch_model

def archive_batches_bulk(db: Session, batch_ids: List[int]):
    archived_batches = []
    batches_to_delete = []
    
    for batch_id in batch_ids:
        # Get the actual batch model instead of the response schema
        batch_model = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
        if not batch_model:
            continue
        
        # Check if already archived
        existing_archived = db.query(models.ArchivedBatch).filter(
            models.ArchivedBatch.batch_id == batch_id
        ).first()
        
        if existing_archived:
            # Already archived, just mark for deletion from main table and use existing archived batch
            batches_to_delete.append(batch_id)
            archived_batches.append(existing_archived)
            continue
        
        # Archive barcode scan events for this batch
        scan_events = db.query(models.BarcodeScanEvent).filter(
            models.BarcodeScanEvent.batch_id == batch_id
        ).all()
        
        for scan_event in scan_events:
            # Check if already archived
            existing_archived_event = db.query(models.ArchivedBarcodeScanEvent).filter(
                models.ArchivedBarcodeScanEvent.id == scan_event.id
            ).first()
            
            if not existing_archived_event:
                archived_scan_event = models.ArchivedBarcodeScanEvent(
                    id=scan_event.id,
                    batch_id=scan_event.batch_id,
                    action_type=scan_event.action_type,
                    phase_id=scan_event.phase_id,
                    old_status=scan_event.old_status,
                    new_status=scan_event.new_status,
                    old_quantity=scan_event.old_quantity,
                    new_quantity=scan_event.new_quantity,
                    old_phase=scan_event.old_phase,
                    new_phase=scan_event.new_phase,
                    scanned_at=scan_event.scanned_at,
                    user_id=scan_event.user_id,
                    archived_at=sa_func.now()
                )
                db.add(archived_scan_event)
        
        archived_batch = models.ArchivedBatch(
            batch_id=batch_model.batch_id,
            job_order_id=batch_model.job_order_id,
            barcode=batch_model.barcode,
            size_id=batch_model.size_id,
            color_id=batch_model.color_id,
            quantity=batch_model.quantity,
            layers=batch_model.layers,
            serial=batch_model.serial,
            current_phase=batch_model.current_phase,
            status=batch_model.status,
            last_updated=batch_model.last_updated,
            is_second_degree=batch_model.is_second_degree,
            archived_at=sa_func.now()
        )
        db.add(archived_batch)
        archived_batches.append(archived_batch)
        batches_to_delete.append(batch_id)
    
    # Delete scan events from main table for all batches being archived
    if batches_to_delete:
        db.query(models.BarcodeScanEvent).filter(
            models.BarcodeScanEvent.batch_id.in_(batches_to_delete)
        ).delete(synchronize_session=False)
        
        # Delete batches from main table
        db.query(models.Batch).filter(models.Batch.batch_id.in_(batches_to_delete)).delete(synchronize_session=False)
    
    db.commit()
    
    # Convert ArchivedBatch objects to BatchResponse objects
    response_batches = []
    for archived_batch in archived_batches:
        # Get related data for the response
        job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == archived_batch.job_order_id).first()
        size = db.query(models.Size).filter(models.Size.size_id == archived_batch.size_id).first()
        color = db.query(models.Color).filter(models.Color.color_id == archived_batch.color_id).first()
        phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == archived_batch.current_phase).first()
        
        response_batch = schemas.BatchResponse(
            batch_id=archived_batch.batch_id,
            job_order_id=archived_batch.job_order_id,
            job_order_number=job_order.job_order_number if job_order else "",
            barcode=archived_batch.barcode,
            client_id=job_order.client_id if job_order else None,
            model_id=job_order.model_id if job_order else None,
            size_id=archived_batch.size_id,
            color_id=archived_batch.color_id,
            quantity=archived_batch.quantity,
            layers=archived_batch.layers,
            serial=str(archived_batch.serial),
            current_phase=archived_batch.current_phase,
            status=archived_batch.status,
            client_name=job_order.client.client_name if job_order and job_order.client else "",
            model_name=job_order.model.model_name if job_order and job_order.model else "",
            size_value=size.size_value if size else "",
            color_name=color.color_name if color else "",
            phase_name=phase.phase_name if phase else "",
            last_updated=archived_batch.last_updated,
            archived_at=archived_batch.archived_at,
            is_second_degree=bool(archived_batch.is_second_degree)
        )
        response_batches.append(response_batch)
    
    return response_batches

def delete_archived_batch(db: Session, batch_id: int):
    """
    HIERARCHICAL DELETION - BOTTOM LEVEL:
    Permanently delete ONLY the specific archived batch.
    This does NOT affect the parent job order or job order item - only deletes the batch itself.
    """
    archived_batch = db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).first()
    if archived_batch:
        db.query(models.ArchivedBatch).filter(
            models.ArchivedBatch.batch_id == batch_id
        ).delete()
        db.commit()
        # Get related data for the response before deleting
        job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == archived_batch.job_order_id).first()
        size = db.query(models.Size).filter(models.Size.size_id == archived_batch.size_id).first()
        color = db.query(models.Color).filter(models.Color.color_id == archived_batch.color_id).first()
        phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == archived_batch.current_phase).first()
        
        return schemas.BatchResponse(
            batch_id=archived_batch.batch_id,
            job_order_id=archived_batch.job_order_id,
            job_order_number=job_order.job_order_number if job_order else "",
            barcode=archived_batch.barcode,
            client_id=job_order.client_id if job_order else None,
            model_id=job_order.model_id if job_order else None,
            size_id=archived_batch.size_id,
            color_id=archived_batch.color_id,
            quantity=archived_batch.quantity,
            layers=archived_batch.layers,
            serial=str(archived_batch.serial),
            current_phase=archived_batch.current_phase,
            status=archived_batch.status,
            client_name=job_order.client.client_name if job_order and job_order.client else "",
            model_name=job_order.model.model_name if job_order and job_order.model else "",
            size_value=size.size_value if size else "",
            color_name=color.color_name if color else "",
            phase_name=phase.phase_name if phase else "",
            last_updated=archived_batch.last_updated,
            archived_at=archived_batch.archived_at,
            is_second_degree=bool(archived_batch.is_second_degree)
        )
    return None

def recover_archived_batch(db: Session, batch_id: int):
    """
    Recover an archived batch and restore its associated job order and job order item if they are archived.
    This ensures complete restoration of the production chain.
    """
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
    
    # Check if the associated job order is archived and restore it if needed
    job_order_restored = False
    archived_job_order = db.query(models.ArchivedJobOrder).filter(
        models.ArchivedJobOrder.job_order_id == archived_batch.job_order_id
    ).first()
    
    if archived_job_order:
        # Import the restore function
        from .job_order import restore_job_order
        try:
            restored_job_order = restore_job_order(db, archived_batch.job_order_id)
            if restored_job_order:
                print(f"Restored archived job order {archived_batch.job_order_id} for batch {batch_id}")
                job_order_restored = True
        except Exception as e:
            print(f"Error restoring job order {archived_batch.job_order_id}: {str(e)}")
            # Continue with batch restoration even if job order restoration fails
    
    # Check if the associated job order item is archived and restore it if needed
    # We need to find the job order item based on color_id and size_id
    archived_item = db.query(models.ArchivedJobOrderItem).filter(
        models.ArchivedJobOrderItem.job_order_id == archived_batch.job_order_id,
        models.ArchivedJobOrderItem.color_id == archived_batch.color_id,
        models.ArchivedJobOrderItem.size_id == archived_batch.size_id
    ).first()
    
    if archived_item:
        # Import the restore function
        from .job_order import restore_job_order_item
        try:
            restored_item = restore_job_order_item(db, archived_item.item_id)
            if restored_item:
                print(f"Restored archived job order item {archived_item.item_id} for batch {batch_id}")
        except Exception as e:
            print(f"Error restoring job order item {archived_item.item_id}: {str(e)}")
            # Continue with batch restoration even if item restoration fails
    
    active_batch = models.Batch(
        batch_id=archived_batch.batch_id,
        job_order_id=archived_batch.job_order_id,
        barcode=archived_batch.barcode,
        size_id=archived_batch.size_id,
        color_id=archived_batch.color_id,
        quantity=archived_batch.quantity,
        layers=archived_batch.layers,
        serial=archived_batch.serial,
        current_phase=archived_batch.current_phase,
        status=archived_batch.status,
        last_updated=sa_func.now(),
        is_second_degree=archived_batch.is_second_degree
    )
    db.add(active_batch)
    
    # Restore barcode scan events for this batch
    archived_scan_events = db.query(models.ArchivedBarcodeScanEvent).filter(
        models.ArchivedBarcodeScanEvent.batch_id == batch_id
    ).all()
    
    for archived_scan_event in archived_scan_events:
        # Check if scan event already exists by batch_id and scanned_at (unique combination)
        existing_scan_event = db.query(models.BarcodeScanEvent).filter(
            models.BarcodeScanEvent.batch_id == archived_scan_event.batch_id,
            models.BarcodeScanEvent.scanned_at == archived_scan_event.scanned_at,
            models.BarcodeScanEvent.action_type == archived_scan_event.action_type
        ).first()
        
        if not existing_scan_event:
            restored_scan_event = models.BarcodeScanEvent(
                batch_id=archived_scan_event.batch_id,
                action_type=archived_scan_event.action_type,
                phase_id=archived_scan_event.phase_id,
                old_status=archived_scan_event.old_status,
                new_status=archived_scan_event.new_status,
                old_quantity=archived_scan_event.old_quantity,
                new_quantity=archived_scan_event.new_quantity,
                old_phase=archived_scan_event.old_phase,
                new_phase=archived_scan_event.new_phase,
                scanned_at=archived_scan_event.scanned_at,
                user_id=archived_scan_event.user_id
            )
            db.add(restored_scan_event)
    
    # Delete archived scan events
    db.query(models.ArchivedBarcodeScanEvent).filter(
        models.ArchivedBarcodeScanEvent.batch_id == batch_id
    ).delete(synchronize_session=False)
    
    # Delete archived batch
    db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).delete()
    db.commit()
    
    # Get related data for the response
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == active_batch.job_order_id).first()
    size = db.query(models.Size).filter(models.Size.size_id == active_batch.size_id).first()
    color = db.query(models.Color).filter(models.Color.color_id == active_batch.color_id).first()
    phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == active_batch.current_phase).first()
    
    return schemas.BatchResponse(
        batch_id=active_batch.batch_id,
        job_order_id=active_batch.job_order_id,
        job_order_number=job_order.job_order_number if job_order else "",
        barcode=active_batch.barcode,
        client_id=job_order.client_id if job_order else None,
        model_id=job_order.model_id if job_order else None,
        size_id=active_batch.size_id,
        color_id=active_batch.color_id,
        quantity=active_batch.quantity,
        layers=active_batch.layers,
        serial=str(active_batch.serial),
        current_phase=active_batch.current_phase,
        status=active_batch.status,
        client_name=job_order.client.client_name if job_order and job_order.client else "",
        model_name=job_order.model.model_name if job_order and job_order.model else "",
        size_value=size.size_value if size else "",
        color_name=color.color_name if color else "",
        phase_name=phase.phase_name if phase else "",
        last_updated=active_batch.last_updated,
        archived_at=None,
        is_second_degree=bool(active_batch.is_second_degree)
    )

def recover_archived_batches_bulk(db: Session, batch_ids: List[int]):
    """
    Recover multiple archived batches and restore their associated job orders and job order items if they are archived.
    This ensures complete restoration of the production chain for all batches.
    """
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
            
            # Check if the associated job order is archived and restore it if needed
            archived_job_order = db.query(models.ArchivedJobOrder).filter(
                models.ArchivedJobOrder.job_order_id == archived_batch.job_order_id
            ).first()
            
            if archived_job_order:
                # Import the restore function
                from .job_order import restore_job_order
                try:
                    restored_job_order = restore_job_order(db, archived_batch.job_order_id)
                    if restored_job_order:
                        print(f"Restored archived job order {archived_batch.job_order_id} for batch {batch_id}")
                except Exception as e:
                    print(f"Error restoring job order {archived_batch.job_order_id}: {str(e)}")
                    # Continue with batch restoration even if job order restoration fails
            
            # Check if the associated job order item is archived and restore it if needed
            archived_item = db.query(models.ArchivedJobOrderItem).filter(
                models.ArchivedJobOrderItem.job_order_id == archived_batch.job_order_id,
                models.ArchivedJobOrderItem.color_id == archived_batch.color_id,
                models.ArchivedJobOrderItem.size_id == archived_batch.size_id
            ).first()
            
            if archived_item:
                # Import the restore function
                from .job_order import restore_job_order_item
                try:
                    restored_item = restore_job_order_item(db, archived_item.item_id)
                    if restored_item:
                        print(f"Restored archived job order item {archived_item.item_id} for batch {batch_id}")
                except Exception as e:
                    print(f"Error restoring job order item {archived_item.item_id}: {str(e)}")
                    # Continue with batch restoration even if item restoration fails
            
            # Get related data for the response before deleting archived batch
            job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == archived_batch.job_order_id).first()
            size = db.query(models.Size).filter(models.Size.size_id == archived_batch.size_id).first()
            color = db.query(models.Color).filter(models.Color.color_id == archived_batch.color_id).first()
            phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == archived_batch.current_phase).first()
            
            if existing_batch:
                for field in ['job_order_id', 'size_id', 'color_id', 'quantity', 
                             'layers', 'serial', 'current_phase', 'status', 'last_updated', 'is_second_degree']:
                    if hasattr(archived_batch, field):
                        setattr(existing_batch, field, getattr(archived_batch, field))
                db.delete(archived_batch)
                batch_to_use = existing_batch
            else:
                new_batch = models.Batch(
                    batch_id=archived_batch.batch_id,
                    job_order_id=archived_batch.job_order_id,
                    barcode=archived_batch.barcode,
                    size_id=archived_batch.size_id,
                    color_id=archived_batch.color_id,
                    quantity=archived_batch.quantity,
                    layers=archived_batch.layers,
                    serial=archived_batch.serial,
                    current_phase=archived_batch.current_phase,
                    status=archived_batch.status,
                    last_updated=archived_batch.last_updated,
                    is_second_degree=archived_batch.is_second_degree
                )
                db.add(new_batch)
                batch_to_use = new_batch
            
            # Restore barcode scan events for this batch
            archived_scan_events = db.query(models.ArchivedBarcodeScanEvent).filter(
                models.ArchivedBarcodeScanEvent.batch_id == batch_id
            ).all()
            
            for archived_scan_event in archived_scan_events:
                # Check if scan event already exists
                existing_scan_event = db.query(models.BarcodeScanEvent).filter(
                    models.BarcodeScanEvent.id == archived_scan_event.id
                ).first()
                
                if not existing_scan_event:
                    restored_scan_event = models.BarcodeScanEvent(
                        id=archived_scan_event.id,
                        batch_id=archived_scan_event.batch_id,
                        action_type=archived_scan_event.action_type,
                        phase_id=archived_scan_event.phase_id,
                        old_status=archived_scan_event.old_status,
                        new_status=archived_scan_event.new_status,
                        old_quantity=archived_scan_event.old_quantity,
                        new_quantity=archived_scan_event.new_quantity,
                        old_phase=archived_scan_event.old_phase,
                        new_phase=archived_scan_event.new_phase,
                        scanned_at=archived_scan_event.scanned_at,
                        user_id=archived_scan_event.user_id
                    )
                    db.add(restored_scan_event)
            
            # Delete archived scan events
            db.query(models.ArchivedBarcodeScanEvent).filter(
                models.ArchivedBarcodeScanEvent.batch_id == batch_id
            ).delete(synchronize_session=False)
            
            # Restore barcode scan events for this batch
            archived_scan_events = db.query(models.ArchivedBarcodeScanEvent).filter(
                models.ArchivedBarcodeScanEvent.batch_id == batch_id
            ).all()
            
            for archived_scan_event in archived_scan_events:
                # Check if scan event already exists
                existing_scan_event = db.query(models.BarcodeScanEvent).filter(
                    models.BarcodeScanEvent.id == archived_scan_event.id
                ).first()
                
                if not existing_scan_event:
                    restored_scan_event = models.BarcodeScanEvent(
                        id=archived_scan_event.id,
                        batch_id=archived_scan_event.batch_id,
                        action_type=archived_scan_event.action_type,
                        phase_id=archived_scan_event.phase_id,
                        old_status=archived_scan_event.old_status,
                        new_status=archived_scan_event.new_status,
                        old_quantity=archived_scan_event.old_quantity,
                        new_quantity=archived_scan_event.new_quantity,
                        old_phase=archived_scan_event.old_phase,
                        new_phase=archived_scan_event.new_phase,
                        scanned_at=archived_scan_event.scanned_at,
                        user_id=archived_scan_event.user_id
                    )
                    db.add(restored_scan_event)
            
            # Delete archived scan events
            db.query(models.ArchivedBarcodeScanEvent).filter(
                models.ArchivedBarcodeScanEvent.batch_id == batch_id
            ).delete(synchronize_session=False)
            
            # Delete archived batch
            db.delete(archived_batch)
            
            # Create BatchResponse from the batch data
            batch_response = schemas.BatchResponse(
                batch_id=batch_to_use.batch_id,
                job_order_id=batch_to_use.job_order_id,
                job_order_number=job_order.job_order_number if job_order else "",
                barcode=batch_to_use.barcode,
                client_id=job_order.client_id if job_order else None,
                model_id=job_order.model_id if job_order else None,
                size_id=batch_to_use.size_id,
                color_id=batch_to_use.color_id,
                quantity=batch_to_use.quantity,
                layers=batch_to_use.layers,
                serial=str(batch_to_use.serial),
                current_phase=batch_to_use.current_phase,
                status=batch_to_use.status,
                client_name=job_order.client.client_name if job_order and job_order.client else "",
                model_name=job_order.model.model_name if job_order and job_order.model else "",
                size_value=size.size_value if size else "",
                color_name=color.color_name if color else "",
                phase_name=phase.phase_name if phase else "",
                last_updated=batch_to_use.last_updated,
                archived_at=None,
                is_second_degree=bool(batch_to_use.is_second_degree)
            )
            recovered_batches.append(batch_response)
        except Exception as e:
            print(f"Error recovering batch {batch_id}: {str(e)}")
            continue
    
    # Commit all changes at once after processing all batches
    db.commit()
    
    return recovered_batches 

# Event-based timeline functions
def create_scan_event(db: Session, batch_id: int, action_type: str, phase_id: int, 
                     old_status: Optional[str] = None, new_status: Optional[str] = None,
                     old_quantity: Optional[int] = None, new_quantity: Optional[int] = None,
                     old_phase: Optional[int] = None, new_phase: Optional[int] = None,
                     user_id: Optional[int] = None, notes: Optional[str] = None,
                     is_reversal: bool = False, reversed_event_id: Optional[int] = None):
    """
    Create a new scan event record and write ledger entry.
    
    Phase 2: Now calculates affects_phase_type, quantity_delta, and writes to ledger.
    """
    batch = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    batch_quantity = batch.quantity if batch else None
    
    affects_phase_type = determine_affects_phase_type(
        db, action_type, phase_id, old_phase, new_phase
    )
    
    quantity_delta = calculate_quantity_delta(
        action_type, old_quantity, new_quantity, old_phase, new_phase, batch_quantity
    )
    
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
        notes=notes,
        affects_phase_type=affects_phase_type,
        quantity_delta=quantity_delta,
        is_reversal=is_reversal,
        reversed_event_id=reversed_event_id
    )
    db.add(event)
    db.flush()
    db.refresh(event)
    
    if affects_phase_type and quantity_delta is not None and quantity_delta != 0:
        create_ledger_entry(
            db=db,
            scan_event_id=event.id,
            batch_id=batch_id,
            affects_phase_type=affects_phase_type,
            quantity_delta=quantity_delta
        )
    
    db.commit()
    return event

def get_scan_events_by_batch(db: Session, batch_id: int, limit: int = 100):
    """Get all scan events for a batch, ordered by scan time"""
    return db.query(models.BarcodeScanEvent).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).order_by(models.BarcodeScanEvent.scanned_at.desc()).limit(limit).all()

def get_visited_phases_by_batch(db: Session, batch_id: int):
    """Get unique phases that a batch has visited, ordered by sequence"""
    unique_phases = db.query(
        models.ProductionPhase.phase_id,
        models.ProductionPhase.phase_name,
        models.ProductionPhase.sequence_order,
        models.ProductionPhase.type
    ).join(
        models.BarcodeScanEvent,
        models.BarcodeScanEvent.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).distinct().order_by(
        models.ProductionPhase.sequence_order.asc().nullslast(),
        models.ProductionPhase.phase_name.asc()
    ).all()
    
    return [
        {
            'phase_id': phase.phase_id,
            'phase_name': phase.phase_name,
            'sequence_order': phase.sequence_order,
            'type': phase.type
        }
        for phase in unique_phases
    ]

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
        models.User, models.BarcodeScanEvent.user_id == models.User.id
    ).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).order_by(models.BarcodeScanEvent.scanned_at.desc()).limit(limit).all()
    
    return events 

def get_archived_job_order_items(db: Session, job_order_id: int):
    """Get all archived items for a specific job order"""
    return db.query(models.ArchivedJobOrderItem).filter(
        models.ArchivedJobOrderItem.job_order_id == job_order_id
    ).all()

def get_archived_batches(db: Session, skip: int = 0, limit: int = 100):
    """Get all archived batches with pagination"""
    return db.query(models.ArchivedBatch).offset(skip).limit(limit).all()


def apply_size_transitions_to_batches(
    db: Session,
    batches: List[Dict[str, Any]],
    transitions: List[Dict[str, Any]],
    job_order_id: int,
    color_id: int,
    max_batch_size: Optional[int] = None,
    extra_pieces_threshold: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Apply size transitions to generated batches.
    
    For each transition:
    1. Deduct from source size batches (last to first)
    2. Add to target size batches (last to first, respecting max_batch_size)
    3. Create new batches if needed for remaining quantity
    4. Apply threshold merging after transitions
    """
    from ..crud.helpers import generate_barcode_string, get_next_serial_number
    from .. import models
    
    if not transitions:
        return batches
    
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == job_order_id).first()
    if not job_order:
        return batches
    
    client = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first() if job_order.model_id else None
    
    # Group batches by size for easier lookup
    batches_by_size: Dict[str, List[Dict[str, Any]]] = {}
    for batch in batches:
        size_value = batch.get("size")
        if size_value:
            if size_value not in batches_by_size:
                batches_by_size[size_value] = []
            batches_by_size[size_value].append(batch)
    
    # Apply each transition
    for transition in transitions:
        from_item_id = transition.get('from_item_id')
        to_item_id = transition.get('to_item_id')
        transition_qty = transition.get('quantity', 0)
        
        if transition_qty <= 0:
            continue
        
        from_item = db.query(models.JobOrderItem).filter(models.JobOrderItem.item_id == from_item_id).first()
        to_item = db.query(models.JobOrderItem).filter(models.JobOrderItem.item_id == to_item_id).first()
        
        if not from_item or not to_item:
            continue
        
        from_size = db.query(models.Size).filter(models.Size.size_id == from_item.size_id).first()
        to_size = db.query(models.Size).filter(models.Size.size_id == to_item.size_id).first()
        
        if not from_size or not to_size:
            continue
        
        from_size_value = from_size.size_value
        to_size_value = to_size.size_value
        
        # Step 1: Deduct from source size batches (last to first)
        # CRITICAL: Continue through ALL batches until qty_needed is 0
        qty_needed = transition_qty
        source_batches = batches_by_size.get(from_size_value, [])
        from_size_id = from_size.size_id
        
        # Process ALL source batches from last to first until we've deducted the full quantity
        for batch in reversed(source_batches):
            if qty_needed <= 0:
                break
            
            batch_qty = batch.get("quantity", 0)
            if batch_qty <= 0:
                continue
            
            if batch_qty >= qty_needed:
                # This batch has enough, deduct and stop
                new_qty = batch_qty - qty_needed
                batch["quantity"] = new_qty
                qty_needed = 0
            else:
                # This batch doesn't have enough, take all of it and continue
                batch["quantity"] = 0
                qty_needed -= batch_qty
                new_qty = 0
            
            # Regenerate barcode for source batch with new quantity (even if 0, we'll remove it later)
            serial_number = batch.get("serial_number")
            if not serial_number:
                serial_number = get_next_serial_number(db, job_order_id, from_size_id, color_id)
                batch["serial_number"] = serial_number
            
            layers = max(1, batch.get("layers", 1))
            batch["barcode"] = generate_barcode_string(
                job_order_id,
                from_size_id,
                color_id,
                layers,
                serial_number
            )
        
        # Only add what was actually deducted (transition_qty - qty_needed)
        qty_to_add = transition_qty - qty_needed
        
        # Step 2: Add to target size batches (last to first, respecting max_batch_size)
        # CRITICAL: Continue through ALL batches and create new ones if needed
        if qty_to_add <= 0:
            continue  # Nothing to add, skip to next transition
        
        target_batches = batches_by_size.get(to_size_value, [])
        to_size_id = to_size.size_id
        
        # Find layers for barcode regeneration (use from existing batches)
        layers = 1
        if target_batches:
            layers = max(1, target_batches[0].get("layers", 1))
        elif source_batches:
            layers = max(1, source_batches[0].get("layers", 1))
        
        # Add to existing target batches (last to first)
        # CRITICAL: Process ALL batches, don't skip if max_batch_size is reached
        for batch in reversed(target_batches):
            if qty_to_add <= 0:
                break
            
            current_qty = batch.get("quantity", 0)
            if max_batch_size:
                available_space = max_batch_size - current_qty
                if available_space <= 0:
                    # This batch is full, skip to next batch
                    continue
                
                qty_to_add_to_batch = min(qty_to_add, available_space)
            else:
                # No max limit, add all remaining quantity
                qty_to_add_to_batch = qty_to_add
            
            new_qty = current_qty + qty_to_add_to_batch
            batch["quantity"] = new_qty
            
            # Regenerate barcode with new quantity
            serial_number = batch.get("serial_number")
            if not serial_number:
                serial_number = get_next_serial_number(db, job_order_id, to_size_id, color_id)
                batch["serial_number"] = serial_number
            
            batch["barcode"] = generate_barcode_string(
                job_order_id,
                to_size_id,
                color_id,
                layers,
                serial_number
            )
            
            qty_to_add -= qty_to_add_to_batch
        
        # Step 3: Create new batches if qty_to_add remains
        if qty_to_add > 0:
            # Find the last batch number to continue from
            max_batch_num = max([b.get("batch", 0) for b in batches], default=0)
            next_batch_num = max_batch_num + 1
            
            while qty_to_add > 0:
                if max_batch_size:
                    batch_qty = min(qty_to_add, max_batch_size)
                else:
                    batch_qty = qty_to_add
                
                serial_number = get_next_serial_number(db, job_order_id, to_size_id, color_id)
                
                barcode = generate_barcode_string(
                    job_order_id,
                    to_size_id,
                    color_id,
                    layers,
                    serial_number
                )
                
                new_batch = {
                    "batch": next_batch_num,
                    "size": to_size_value,
                    "quantity": batch_qty,
                    "barcode": barcode,
                    "size_id": to_size_id,
                    "serial_number": serial_number,
                    "layers": layers
                }
                
                batches.append(new_batch)
                if to_size_value not in batches_by_size:
                    batches_by_size[to_size_value] = []
                batches_by_size[to_size_value].append(new_batch)
                
                qty_to_add -= batch_qty
                next_batch_num += 1
    
    # Step 4: Remove empty batches first
    batches = [b for b in batches if b.get("quantity", 0) > 0]
    
    # Step 5: Apply threshold merging: merge batches with quantity < threshold into previous batch of same size
    # CRITICAL: Process multiple times until no more merges are needed
    if extra_pieces_threshold:
        max_iterations = 10  # Safety limit
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            batches_by_size = {}
            for batch in batches:
                size_value = batch.get("size")
                if size_value:
                    if size_value not in batches_by_size:
                        batches_by_size[size_value] = []
                    batches_by_size[size_value].append(batch)
            
            merged_any = False
            final_batches = []
            
            for size_value, size_batches in batches_by_size.items():
                # Sort by batch number to maintain order
                size_batches.sort(key=lambda x: x.get("batch", 0))
                
                for i, batch in enumerate(size_batches):
                    qty = batch.get("quantity", 0)
                    
                    # CRITICAL: Merge backward if quantity is below threshold and not the first batch
                    if qty < extra_pieces_threshold and qty > 0 and i > 0:
                        # Merge with previous batch of same size
                        prev_batch = size_batches[i - 1]
                        prev_qty = prev_batch.get("quantity", 0)
                        new_qty = prev_qty + qty
                        
                        prev_batch["quantity"] = new_qty
                        
                        # Regenerate barcode for previous batch
                        size_id = prev_batch.get("size_id")
                        serial_number = prev_batch.get("serial_number")
                        if not serial_number:
                            serial_number = get_next_serial_number(db, job_order_id, size_id, color_id)
                            prev_batch["serial_number"] = serial_number
                        
                        layers = max(1, prev_batch.get("layers", 1))
                        prev_batch["barcode"] = generate_barcode_string(
                            job_order_id,
                            size_id,
                            color_id,
                            layers,
                            serial_number
                        )
                        
                        merged_any = True
                        # Don't add current batch (it's been merged)
                    else:
                        final_batches.append(batch)
            
            batches = final_batches
            
            # If no merges happened, we're done
            if not merged_any:
                break
    
    # Re-number batches sequentially
    batches.sort(key=lambda x: (x.get("size", ""), x.get("batch", 0)))
    for i, batch in enumerate(batches, 1):
        batch["batch"] = i
    
    return batches


def generate_batches_from_cut_manual(
    db: Session,
    job_order_id: int,
    cut_id: int,
    quantity_per_batch: Dict[str, int],
    extra_pieces_threshold: int = 5,
    max_batch_size: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Generate batches in manual mode where user defines quantity per batch per size.
    
    Algorithm:
    1. Calculate total quantities per size from cut:
       - Sum quantities across all rolls: ratio_per_layer * num_layers
       - Sum fractional quantities across layers before truncating
       - Truncate only after summing (int(total_items))
    2. Apply size transitions to totals BEFORE batch creation:
       - Deduct transition quantity from source size total
       - Add transition quantity to target size total
    3. Create batches from adjusted totals:
       - For each size: full_batches = floor(total_qty / qty_per_batch)
       - leftover = total_qty % qty_per_batch
       - Create full batches with qty_per_batch quantity
       - If leftover >= threshold: create extra batch
       - If leftover < threshold: merge into last batch
    4. Apply threshold merging:
       - Merge batches with quantity < threshold into previous batch of same size
       - Iterate until no more merges needed
    5. Validate quantity integrity:
       - Ensure total quantities per size match expected values
       - Raise error if pieces are lost
    
    Rules:
    - Size transitions are applied to totals BEFORE batch creation
    - Never remove or add pieces beyond the total defined by the user
    - After transitions, total quantity per size must match: original ± transition changes
    - No pieces should be lost in the process
    - All batches below threshold should be merged backward
    - If max_batch_size is set and qty_per_batch exceeds it, use max_batch_size
    """
    from ..crud import cut as cut_crud
    from ..crud.helpers import generate_barcode_string, get_next_serial_number
    
    cut_details = cut_crud.get_cut_details_by_id(db, cut_id)
    if not cut_details:
        raise ValueError(f"Cut with ID {cut_id} not found")
    
    if cut_details['job_order_id'] != job_order_id:
        raise ValueError(f"Cut {cut_id} does not belong to job order {job_order_id}")
    
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == job_order_id).first()
    if not job_order:
        raise ValueError(f"Job order with ID {job_order_id} not found")
    
    client = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first() if job_order.model_id else None
    
    ratios = cut_details.get('job_order_items_ratios', {}) or {}
    rolls = cut_details.get('rolls', [])
    transitions = cut_details.get('transitions', [])
    color_id = cut_details['color_id']
    
    total_size_quantities = {}
    
    for roll in rolls:
        num_layers = roll.get('num_of_layers', 0)
        if num_layers <= 0:
            continue
        
        for item_id_str, ratio_per_layer in ratios.items():
            item_id = int(item_id_str)
            
            job_order_item = db.query(models.JobOrderItem).filter(
                models.JobOrderItem.item_id == item_id,
                models.JobOrderItem.job_order_id == job_order_id,
                models.JobOrderItem.color_id == color_id
            ).first()
            
            if not job_order_item:
                continue
            
            size_id = job_order_item.size_id
            size = db.query(models.Size).filter(models.Size.size_id == size_id).first()
            if not size:
                continue
            
            total_items = ratio_per_layer * num_layers
            quantity_int = int(total_items)
            
            if quantity_int > 0:
                size_value = size.size_value
                if size_value not in total_size_quantities:
                    total_size_quantities[size_value] = 0
                total_size_quantities[size_value] += quantity_int
    
    # Step 1: Apply size transitions to totals BEFORE batch creation
    for transition in transitions:
        from_item_id = transition.get('from_item_id')
        to_item_id = transition.get('to_item_id')
        quantity = transition.get('quantity', 0)
        
        if quantity <= 0:
            continue
        
        from_item = db.query(models.JobOrderItem).filter(models.JobOrderItem.item_id == from_item_id).first()
        to_item = db.query(models.JobOrderItem).filter(models.JobOrderItem.item_id == to_item_id).first()
        
        if not from_item or not to_item:
            continue
        
        from_size = db.query(models.Size).filter(models.Size.size_id == from_item.size_id).first()
        to_size = db.query(models.Size).filter(models.Size.size_id == to_item.size_id).first()
        
        if not from_size or not to_size:
            continue
        
        from_size_value = from_size.size_value
        to_size_value = to_size.size_value
        
        # Deduct from source size
        if from_size_value in total_size_quantities:
            total_size_quantities[from_size_value] = max(0, total_size_quantities[from_size_value] - quantity)
        
        # Add to target size
        if to_size_value not in total_size_quantities:
            total_size_quantities[to_size_value] = 0
        total_size_quantities[to_size_value] += quantity
    
    # Step 2: Create batches from adjusted totals
    batches = []
    batch_number = 1
    
    # Track serial numbers per size group to ensure uniqueness
    serial_counters: Dict[Tuple[int, int], int] = {}
    
    def get_next_serial_for_size(size_id: int, color_id: int) -> int:
        """Get next serial number for a size group, tracking in memory"""
        key = (size_id, color_id)
        if key not in serial_counters:
            # Initialize with existing database count
            serial_counters[key] = get_next_serial_number(db, job_order_id, size_id, color_id)
        else:
            # Increment for next batch
            serial_counters[key] += 1
        return serial_counters[key]
    
    for size_value, total_qty in sorted(total_size_quantities.items()):
        if total_qty <= 0:
            continue
        
        if size_value not in quantity_per_batch or quantity_per_batch[size_value] <= 0:
            continue
        
        qty_per_batch = quantity_per_batch[size_value]
        
        # Handle max_batch_size if specified
        if max_batch_size and qty_per_batch > max_batch_size:
            # User-defined qty_per_batch exceeds max, use max_batch_size instead
            qty_per_batch = max_batch_size
        
        full_batches = total_qty // qty_per_batch
        leftover = total_qty % qty_per_batch
        
        size_obj = db.query(models.Size).filter(models.Size.size_value == size_value).first()
        if not size_obj:
            continue
        
        size_id = size_obj.size_id
        roll_number = rolls[0].get('roll_number', 1) if rolls else 1
        # Combine cut_id and roll_number: cut_id * 10000 + roll_number
        layers = cut_id * 10000 + roll_number
        
        size_batches = []
        last_serial_for_size = None
        
        # Create full batches
        for i in range(full_batches):
            serial_number = get_next_serial_for_size(size_id, color_id)
            last_serial_for_size = serial_number
            
            barcode = generate_barcode_string(
                job_order_id,
                size_id,
                color_id,
                layers,
                serial_number
            )
            
            size_batches.append({
                "batch": batch_number,
                "size": size_value,
                "quantity": qty_per_batch,
                "barcode": barcode,
                "size_id": size_id,
                "serial_number": serial_number,
                "layers": layers
            })
            
            batch_number += 1
        
        # Handle leftover
        if leftover > 0:
            if leftover >= extra_pieces_threshold:
                # Create new batch for leftover
                serial_number = get_next_serial_for_size(size_id, color_id)
                
                barcode = generate_barcode_string(
                    job_order_id,
                    size_id,
                    color_id,
                    layers,
                    serial_number
                )
                
                size_batches.append({
                    "batch": batch_number,
                    "size": size_value,
                    "quantity": leftover,
                    "barcode": barcode,
                    "size_id": size_id,
                    "serial_number": serial_number,
                    "layers": layers
                })
                
                batch_number += 1
            else:
                # Merge leftover into last batch
                if size_batches and last_serial_for_size is not None:
                    last_batch = size_batches[-1]
                    new_quantity = last_batch["quantity"] + leftover
                    
                    last_batch["quantity"] = new_quantity
                    last_batch["barcode"] = generate_barcode_string(
                        job_order_id,
                        size_id,
                        color_id,
                        layers,
                        last_serial_for_size
                    )
        
        batches.extend(size_batches)
    
    # Step 3: Apply threshold merging (merge small batches backward)
    if extra_pieces_threshold:
        # Group batches by size
        batches_by_size: Dict[str, List[Dict[str, Any]]] = {}
        for batch in batches:
            size_value = batch.get("size")
            if size_value:
                if size_value not in batches_by_size:
                    batches_by_size[size_value] = []
                batches_by_size[size_value].append(batch)
        
        # Merge small batches iteratively
        max_iterations = 10
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            merged_any = False
            final_batches = []
            
            for size_value, size_batches in batches_by_size.items():
                # Sort by batch number to maintain order
                size_batches.sort(key=lambda x: x.get("batch", 0))
                
                for i, batch in enumerate(size_batches):
                    qty = batch.get("quantity", 0)
                    
                    # Merge backward if below threshold and not first batch
                    if qty < extra_pieces_threshold and qty > 0 and i > 0:
                        prev_batch = size_batches[i - 1]
                        prev_qty = prev_batch.get("quantity", 0)
                        new_qty = prev_qty + qty
                        
                        prev_batch["quantity"] = new_qty
                        
                        # Regenerate barcode
                        size_id = prev_batch.get("size_id")
                        serial_number = prev_batch.get("serial_number")
                        if not serial_number:
                            serial_number = get_next_serial_for_size(size_id, color_id)
                            prev_batch["serial_number"] = serial_number
                        
                        layers = max(1, prev_batch.get("layers", 1))
                        prev_batch["barcode"] = generate_barcode_string(
                            job_order_id,
                            size_id,
                            color_id,
                            layers,
                            serial_number
                        )
                        
                        merged_any = True
                    else:
                        final_batches.append(batch)
            
            batches = final_batches
            
            # Rebuild batches_by_size for next iteration
            batches_by_size = {}
            for batch in batches:
                size_value = batch.get("size")
                if size_value:
                    if size_value not in batches_by_size:
                        batches_by_size[size_value] = []
                    batches_by_size[size_value].append(batch)
            
            if not merged_any:
                break
    
    # Step 4: Re-number batches sequentially
    batches.sort(key=lambda x: (x.get("size", ""), x.get("batch", 0)))
    for i, batch in enumerate(batches, 1):
        batch["batch"] = i
    
    # Step 5: Validate quantity integrity
    final_totals_by_size = {}
    for batch in batches:
        size_value = batch.get("size")
        if size_value:
            if size_value not in final_totals_by_size:
                final_totals_by_size[size_value] = 0
            final_totals_by_size[size_value] += batch.get("quantity", 0)
    
    # Verify totals match expected (after transitions)
    # Only validate sizes that are in quantity_per_batch (user-selected sizes)
    for size_value, expected_total in total_size_quantities.items():
        if expected_total <= 0:
            continue
        
        # Skip validation for sizes not in quantity_per_batch (deselected sizes)
        if size_value not in quantity_per_batch or quantity_per_batch[size_value] <= 0:
            continue
        
        final_total = final_totals_by_size.get(size_value, 0)
        if abs(final_total - expected_total) > 0:
            raise ValueError(
                f"Quantity integrity check failed for size {size_value}: "
                f"expected {expected_total} pieces, got {final_total} pieces. "
                f"Difference: {final_total - expected_total}. "
                f"This indicates pieces were lost during batch creation."
            )
    
    return batches


def generate_batches_from_cut(
    db: Session, 
    job_order_id: int, 
    cut_id: int,
    max_batch_size: Optional[int] = None,
    extra_pieces_threshold: Optional[int] = None
) -> List[Dict[str, Any]]:
    """Generate batches from a cut based on rolls, layers, size ratios, and size transitions.
    
    Algorithm:
    1. Calculate quantities per roll:
       - For each roll: ratio_per_layer * num_layers per size
       - Sum fractional quantities across layers in the roll
       - Truncate only after summing (int(total_items))
    2. Calculate total quantities per size across all rolls
    3. Apply size transitions to totals BEFORE batch creation:
       - Deduct transition quantity from source size total
       - Add transition quantity to target size total
    4. Distribute transition adjustments proportionally back to each roll
    5. Create batches from adjusted roll quantities:
       - One batch per roll (do not combine rolls)
       - If max_batch_size is set and quantity > max_batch_size, split into multiple batches
       - If leftover < threshold, merge into previous batch
    6. Apply threshold merging after batch creation
    7. Validate quantity integrity
    
    Rules:
    - Each batch represents exactly one roll (do not combine rolls)
    - Size transitions are applied to totals BEFORE batch creation
    - Transitions are distributed proportionally across rolls
    - Each batch must have: batch number (sequential), size, quantity, barcode
    - Do not combine batches - even if two rolls produce same quantity, they are separate
    """
    from ..crud import cut as cut_crud
    from ..crud.helpers import generate_barcode_string, get_next_serial_number
    
    cut_details = cut_crud.get_cut_details_by_id(db, cut_id)
    if not cut_details:
        raise ValueError(f"Cut with ID {cut_id} not found")
    
    if cut_details['job_order_id'] != job_order_id:
        raise ValueError(f"Cut {cut_id} does not belong to job order {job_order_id}")
    
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == job_order_id).first()
    if not job_order:
        raise ValueError(f"Job order with ID {job_order_id} not found")
    
    client = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first() if job_order.model_id else None
    
    ratios = cut_details.get('job_order_items_ratios', {}) or {}
    rolls = cut_details.get('rolls', [])
    transitions = cut_details.get('transitions', [])
    color_id = cut_details['color_id']
    
    # Step 1: Calculate quantities per roll and total quantities per size
    roll_batches = []
    total_size_quantities = {}  # size_id -> total quantity
    
    for roll in rolls:
        num_layers = roll.get('num_of_layers', 0)
        roll_number = roll.get('roll_number', 1)
        if num_layers <= 0:
            continue
        
        roll_size_quantities = {}
        
        for item_id_str, ratio_per_layer in ratios.items():
            item_id = int(item_id_str)
            
            job_order_item = db.query(models.JobOrderItem).filter(
                models.JobOrderItem.item_id == item_id,
                models.JobOrderItem.job_order_id == job_order_id,
                models.JobOrderItem.color_id == color_id
            ).first()
            
            if not job_order_item:
                continue
            
            size_id = job_order_item.size_id
            
            # Sum fractional quantities across layers, then truncate
            total_items_for_roll = ratio_per_layer * num_layers
            quantity_int = int(total_items_for_roll)
            
            if quantity_int > 0:
                if size_id not in roll_size_quantities:
                    roll_size_quantities[size_id] = 0
                roll_size_quantities[size_id] += quantity_int
                
                # Track totals per size
                if size_id not in total_size_quantities:
                    total_size_quantities[size_id] = 0
                total_size_quantities[size_id] += quantity_int
        
        for size_id, quantity in roll_size_quantities.items():
            if quantity > 0:
                # Combine cut_id and roll_number: cut_id * 10000 + roll_number
                # This allows decoding: cut_id = layers // 10000, roll_number = layers % 10000
                layers_value = cut_id * 10000 + roll_number
                roll_batches.append({
                    "size_id": size_id,
                    "quantity": quantity,
                    "layers": layers_value,
                    "roll_number": roll_number
                })
    
    # Step 2: Apply size transitions to totals BEFORE batch creation
    adjusted_total_size_quantities = total_size_quantities.copy()
    
    for transition in transitions:
        from_item_id = transition.get('from_item_id')
        to_item_id = transition.get('to_item_id')
        quantity = transition.get('quantity', 0)
        
        if quantity <= 0:
            continue
        
        from_item = db.query(models.JobOrderItem).filter(models.JobOrderItem.item_id == from_item_id).first()
        to_item = db.query(models.JobOrderItem).filter(models.JobOrderItem.item_id == to_item_id).first()
        
        if not from_item or not to_item:
            continue
        
        from_size_id = from_item.size_id
        to_size_id = to_item.size_id
        
        # Deduct from source size total
        if from_size_id in adjusted_total_size_quantities:
            adjusted_total_size_quantities[from_size_id] = max(0, adjusted_total_size_quantities[from_size_id] - quantity)
        
        # Add to target size total
        if to_size_id not in adjusted_total_size_quantities:
            adjusted_total_size_quantities[to_size_id] = 0
        adjusted_total_size_quantities[to_size_id] += quantity
    
    # Step 3: Distribute transition adjustments proportionally to each roll
    # Calculate adjustment ratios per size
    adjustment_ratios = {}
    for size_id, original_total in total_size_quantities.items():
        adjusted_total = adjusted_total_size_quantities.get(size_id, 0)
        if original_total > 0:
            adjustment_ratios[size_id] = adjusted_total / original_total
        else:
            adjustment_ratios[size_id] = 1.0
    
    # Apply adjustments to roll batches
    for batch_info in roll_batches:
        size_id = batch_info["size_id"]
        original_quantity = batch_info["quantity"]
        
        if size_id in adjustment_ratios:
            adjusted_quantity = max(0, int(original_quantity * adjustment_ratios[size_id]))
            batch_info["quantity"] = adjusted_quantity
        else:
            # Size not in original totals, set to 0
            batch_info["quantity"] = 0
    
    # Step 4: Create batches from adjusted roll quantities
    batches = []
    batch_number = 1
    
    # Track serial numbers per size-roll_number combination to ensure uniqueness
    serial_counters: Dict[Tuple[int, int, int], int] = {}
    
    def get_next_serial_for_size_roll(size_id: int, roll_number: int, color_id: int) -> int:
        """Get next serial number for a size-roll_number combination, tracking in memory"""
        key = (size_id, roll_number, color_id)
        if key not in serial_counters:
            # Initialize with existing database count for this size-roll_number combo
            # Query existing batches with same size, roll_number (layers), and color
            existing_count = db.query(models.Batch).filter(
                models.Batch.job_order_id == job_order_id,
                models.Batch.size_id == size_id,
                models.Batch.color_id == color_id,
                models.Batch.layers == roll_number
            ).count()
            serial_counters[key] = existing_count + 1
        else:
            # Increment for next batch
            serial_counters[key] += 1
        return serial_counters[key]
    
    for batch_info in roll_batches:
        size_id = batch_info["size_id"]
        quantity = batch_info["quantity"]  # Already adjusted by transitions
        layers_value = batch_info["layers"]  # This is cut_id * 10000 + roll_number
        roll_number = batch_info.get("roll_number", layers_value % 10000)  # Extract roll_number for serial tracking
        
        if quantity <= 0:
            continue
        
        size = db.query(models.Size).filter(models.Size.size_id == size_id).first()
        if not size:
            continue
        
        size_value = size.size_value
        
        if max_batch_size and quantity > max_batch_size:
            full_batches = quantity // max_batch_size
            leftover = quantity % max_batch_size
            
            for i in range(full_batches):
                serial_number = get_next_serial_for_size_roll(size_id, roll_number, color_id)
                
                barcode = generate_barcode_string(
                    job_order_id,
                    size_id,
                    color_id,
                    layers_value,
                    serial_number
                )
                
                batches.append({
                    "batch": batch_number,
                    "size": size_value,
                    "quantity": max_batch_size,
                    "barcode": barcode,
                    "size_id": size_id,
                    "serial_number": serial_number,
                    "layers": layers_value
                })
                
                batch_number += 1
            
            if leftover > 0:
                if extra_pieces_threshold and leftover < extra_pieces_threshold and batches:
                    last_batch_same_size_roll = None
                    for i in range(len(batches) - 1, -1, -1):
                        batch_roll = batches[i].get("layers", 0) % 10000
                        if batches[i].get("size_id") == size_id and batch_roll == roll_number:
                            last_batch_same_size_roll = batches[i]
                            break
                    
                    if last_batch_same_size_roll:
                        new_quantity = last_batch_same_size_roll["quantity"] + leftover
                        last_serial = last_batch_same_size_roll.get("serial_number")
                        if not last_serial:
                            last_serial = get_next_serial_for_size_roll(size_id, roll_number, color_id)
                        
                        last_batch_same_size_roll["quantity"] = new_quantity
                        last_batch_same_size_roll["barcode"] = generate_barcode_string(
                            job_order_id,
                            size_id,
                            color_id,
                            layers_value,
                            last_serial
                        )
                    else:
                        serial_number = get_next_serial_for_size_roll(size_id, roll_number, color_id)
                        
                        barcode = generate_barcode_string(
                            job_order_id,
                            size_id,
                            color_id,
                            layers_value,
                            serial_number
                        )
                        
                        batches.append({
                            "batch": batch_number,
                            "size": size_value,
                            "quantity": leftover,
                            "barcode": barcode,
                            "size_id": size_id,
                            "serial_number": serial_number,
                            "layers": layers_value
                        })
                        
                        batch_number += 1
                else:
                    serial_number = get_next_serial_for_size_roll(size_id, roll_number, color_id)
                    
                    barcode = generate_barcode_string(
                        job_order_id,
                        size_id,
                        color_id,
                        layers_value,
                        serial_number
                    )
                    
                    batches.append({
                        "batch": batch_number,
                        "size": size_value,
                        "quantity": leftover,
                        "barcode": barcode,
                        "size_id": size_id,
                        "serial_number": serial_number,
                        "layers": layers_value
                    })
                    
                    batch_number += 1
        else:
            serial_number = get_next_serial_for_size_roll(size_id, roll_number, color_id)
            
            barcode = generate_barcode_string(
                job_order_id,
                size_id,
                color_id,
                layers_value,
                serial_number
            )
            
            batches.append({
                "batch": batch_number,
                "size": size_value,
                "quantity": quantity,
                "barcode": barcode,
                "size_id": size_id,
                "serial_number": serial_number,
                "layers": layers_value
            })
            
            batch_number += 1
    
    # Step 5: Apply threshold merging (merge small batches backward)
    if extra_pieces_threshold:
        # Group batches by size and roll_number to ensure we only merge within same size-roll combo
        batches_by_size_roll: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
        for batch in batches:
            size_value = batch.get("size")
            layers_value = batch.get("layers", cut_id * 10000 + 1)
            roll_number = layers_value % 10000  # Extract roll_number from layers
            if size_value:
                key = (size_value, roll_number)
                if key not in batches_by_size_roll:
                    batches_by_size_roll[key] = []
                batches_by_size_roll[key].append(batch)
        
        # Merge small batches iteratively
        max_iterations = 10
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            merged_any = False
            final_batches = []
            
            for (size_value, roll_number), size_roll_batches in batches_by_size_roll.items():
                # Sort by batch number to maintain order
                size_roll_batches.sort(key=lambda x: x.get("batch", 0))
                
                for i, batch in enumerate(size_roll_batches):
                    qty = batch.get("quantity", 0)
                    
                    # Merge backward if below threshold and not first batch
                    if qty < extra_pieces_threshold and qty > 0 and i > 0:
                        prev_batch = size_roll_batches[i - 1]
                        prev_qty = prev_batch.get("quantity", 0)
                        new_qty = prev_qty + qty
                        
                        prev_batch["quantity"] = new_qty
                        
                        # Regenerate barcode
                        size_id = prev_batch.get("size_id")
                        layers_value = prev_batch.get("layers", cut_id * 10000 + 1)
                        roll_number_val = layers_value % 10000  # Extract roll_number for serial tracking
                        serial_number = prev_batch.get("serial_number")
                        if not serial_number:
                            serial_number = get_next_serial_for_size_roll(size_id, roll_number_val, color_id)
                            prev_batch["serial_number"] = serial_number
                        
                        prev_batch["barcode"] = generate_barcode_string(
                            job_order_id,
                            size_id,
                            color_id,
                            layers_value,
                            serial_number
                        )
                        
                        merged_any = True
                    else:
                        final_batches.append(batch)
            
            batches = final_batches
            
            # Rebuild batches_by_size_roll for next iteration
            batches_by_size_roll = {}
            for batch in batches:
                size_value = batch.get("size")
                layers_value = batch.get("layers", cut_id * 10000 + 1)
                roll_number = layers_value % 10000  # Extract roll_number from layers
                if size_value:
                    key = (size_value, roll_number)
                    if key not in batches_by_size_roll:
                        batches_by_size_roll[key] = []
                    batches_by_size_roll[key].append(batch)
            
            if not merged_any:
                break
    
    # Step 6: Re-number batches sequentially
    batches.sort(key=lambda x: (x.get("size", ""), x.get("batch", 0)))
    for i, batch in enumerate(batches, 1):
        batch["batch"] = i
    
    # Step 7: Validate quantity integrity
    final_totals_by_size = {}
    for batch in batches:
        size_id = batch.get("size_id")
        if size_id:
            if size_id not in final_totals_by_size:
                final_totals_by_size[size_id] = 0
            final_totals_by_size[size_id] += batch.get("quantity", 0)
    
    # Verify totals match expected (after transitions)
    for size_id, expected_total in adjusted_total_size_quantities.items():
        if expected_total <= 0:
            continue
        final_total = final_totals_by_size.get(size_id, 0)
        if abs(final_total - expected_total) > 0:
            # Allow small rounding differences due to proportional distribution
            diff = abs(final_total - expected_total)
            if diff > len(rolls):  # Only error if difference is larger than number of rolls
                raise ValueError(
                    f"Quantity integrity check failed for size_id {size_id}: "
                    f"expected {expected_total} pieces, got {final_total} pieces. "
                    f"Difference: {final_total - expected_total}. "
                    f"This may indicate pieces were lost during batch creation."
                )
    
    return batches 