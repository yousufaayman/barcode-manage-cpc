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

# Cut-generated batches: layers = cut_sequence_per_job_order * LAYERS_ROLL_MOD + roll_number
# cut_sequence: 1st cut for the job order = 1, 2nd = 2, ... (ORDER BY cut_id). Roll: decimal 0..99 (×100 packing).
LAYERS_ROLL_MOD = 100

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
        return None

    batch_obj = batch.Batch
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
        archived_at=None
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
            # Check if this is a compensation batch - compensation batches may not have events to reverse
            is_compensation_batch = db.query(models.BatchCompensation).filter(
                models.BatchCompensation.batch_id == db_batch.batch_id
            ).first() is not None
            
            events_to_reverse = get_events_to_reverse(db, db_batch.batch_id, old_phase, new_phase)
            
            if not events_to_reverse and not is_compensation_batch:
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
            quantity_decrement_type_raw = update_data.get('quantity_decrement_type')
            quantity_decrement_type = quantity_decrement_type_raw.value if hasattr(quantity_decrement_type_raw, 'value') else quantity_decrement_type_raw
            quantity_decrement_reason = update_data.get('quantity_decrement_reason')
            
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

                        rework_op_batch_id = None
                        if quantity_decrement_type == 'rejection':
                            # IMPORTANT: rework creation is driven by the *responsible phase* selected in the UI,
                            # not necessarily the batch's current phase (new_phase).
                            responsible_phase_id = quantity_decrement_phase_id
                            dec_phase_obj = (
                                db.query(models.ProductionPhase)
                                .filter(models.ProductionPhase.phase_id == responsible_phase_id)
                                .first()
                                if responsible_phase_id is not None
                                else None
                            )
                            stage_nm = update_data.get("quantity_decrement_stage_name")
                            if (
                                dec_phase_obj
                                and (dec_phase_obj.type or "").lower() == "sewing"
                                and stage_nm
                                and str(stage_nm).strip()
                            ):
                                from .sewing_rejection_rework import resolve_sewing_rework_operational_batch_id

                                rework_op_batch_id = resolve_sewing_rework_operational_batch_id(
                                    db,
                                    db_batch,
                                    deduction_amount,
                                    str(stage_nm).strip(),
                                    responsible_phase_id,
                                    user_id,
                                )

                        rejection_create = SingleRejectionCreate(
                            batch_id=db_batch.batch_id,
                            rejected_from_phase_id=new_phase,
                            return_to_phase_id=return_to_phase_id,
                            quantity=deduction_amount,
                            rejection_reason=rejection_reason,
                            worker_id=update_data.get("quantity_decrement_worker_id"),
                            new_batch_id=rework_op_batch_id,
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
                     is_reversal: bool = False, reversed_event_id: Optional[int] = None,
                     autocommit: bool = True):
    """
    Create a new scan event record and write ledger entry.
    
    Phase 2: Now calculates affects_phase_type, quantity_delta, and writes to ledger.
    """
    batch = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    batch_quantity = batch.quantity if batch else None
    
    affects_phase_type = determine_affects_phase_type(
        db, action_type, phase_id, old_phase, new_phase, old_quantity, new_quantity
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
    
    if autocommit:
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
    1. Deduct from LAST batch of source size only
    2. Add to FIRST batch of target size only
    3. Create new batches if needed for remaining quantity
    4. Apply threshold merging after transitions
    
    CRITICAL: Size transitions should only be applied to:
    - The last batch of the transitioned-from size (for deduction)
    - The first batch of the transitioned-to size (for addition)
    """
    from ..crud.helpers import generate_barcode_string, get_next_serial_number
    from .. import models
    
    if not transitions:
        return batches
    
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == job_order_id).first()
    if not job_order:
        return batches
    
    # Group batches by size for easier lookup
    batches_by_size: Dict[str, List[Dict[str, Any]]] = {}
    for batch in batches:
        size_value = batch.get("size")
        if size_value:
            if size_value not in batches_by_size:
                batches_by_size[size_value] = []
            batches_by_size[size_value].append(batch)
    
    # Sort batches by batch number within each size group
    for size_value in batches_by_size:
        batches_by_size[size_value].sort(key=lambda x: x.get("batch", 0))
    
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
        from_size_id = from_size.size_id
        to_size_id = to_size.size_id
        
        # Step 1: Deduct from LAST batch of source size only
        source_batches = batches_by_size.get(from_size_value, [])
        qty_to_deduct = transition_qty
        
        if source_batches:
            # Get the last batch (highest batch number) for this size
            last_source_batch = source_batches[-1]
            batch_qty = last_source_batch.get("quantity", 0)
            
            if batch_qty >= qty_to_deduct:
                # Last batch has enough, deduct and we're done
                new_qty = batch_qty - qty_to_deduct
                last_source_batch["quantity"] = new_qty
                qty_to_add = qty_to_deduct
            else:
                # Last batch doesn't have enough, take all of it
                last_source_batch["quantity"] = 0
                qty_to_add = batch_qty
                # Note: We don't deduct more than available, so qty_to_add = what was actually deducted
            
            # Regenerate barcode for source batch with new quantity
            serial_number = last_source_batch.get("serial_number")
            if not serial_number:
                serial_number = get_next_serial_number(db, job_order_id, from_size_id, color_id)
                last_source_batch["serial_number"] = serial_number
            
            layers = max(1, last_source_batch.get("layers", 1))
            last_source_batch["barcode"] = generate_barcode_string(
                job_order_id,
                from_size_id,
                color_id,
                layers,
                serial_number
            )
        else:
            # No source batches, nothing to deduct
            qty_to_add = 0
        
        # Step 2: Add to FIRST batch of target size only
        if qty_to_add <= 0:
            continue  # Nothing to add, skip to next transition
        
        target_batches = batches_by_size.get(to_size_value, [])
        
        # Find layers for barcode regeneration.
        # We must preserve roll/layers consistency: use the target batch layers when target exists,
        # otherwise fall back to the source batch layers.
        layers = 1
        if target_batches:
            layers = max(1, target_batches[0].get("layers", 1))
        elif source_batches:
            layers = max(1, source_batches[-1].get("layers", 1))
        
        if target_batches:
            # Get the first batch (lowest batch number) for this size
            first_target_batch = target_batches[0]
            current_qty = first_target_batch.get("quantity", 0)
            
            # Check max_batch_size constraint
            if max_batch_size:
                available_space = max_batch_size - current_qty
                if available_space <= 0:
                    # First batch is full, we'll need to create new batch(es)
                    qty_remaining = qty_to_add
                else:
                    # Add to first batch up to max_batch_size
                    qty_to_add_to_batch = min(qty_to_add, available_space)
                    new_qty = current_qty + qty_to_add_to_batch
                    first_target_batch["quantity"] = new_qty
                    
                    # Regenerate barcode with new quantity
                    serial_number = first_target_batch.get("serial_number")
                    if not serial_number:
                        serial_number = get_next_serial_number(db, job_order_id, to_size_id, color_id)
                        first_target_batch["serial_number"] = serial_number
                    
                    first_target_batch["barcode"] = generate_barcode_string(
                        job_order_id,
                        to_size_id,
                        color_id,
                        layers,
                        serial_number
                    )
                    
                    qty_remaining = qty_to_add - qty_to_add_to_batch
            else:
                # No max limit, add all quantity to first batch
                new_qty = current_qty + qty_to_add
                first_target_batch["quantity"] = new_qty
                
                # Regenerate barcode with new quantity
                serial_number = first_target_batch.get("serial_number")
                if not serial_number:
                    serial_number = get_next_serial_number(db, job_order_id, to_size_id, color_id)
                    first_target_batch["serial_number"] = serial_number
                
                first_target_batch["barcode"] = generate_barcode_string(
                    job_order_id,
                    to_size_id,
                    color_id,
                    layers,
                    serial_number
                )
                
                qty_remaining = 0
        else:
            # No target batches exist, all quantity needs new batches
            qty_remaining = qty_to_add
        
        # Step 3: Create new batches if qty_remaining > 0
        if qty_remaining > 0:
            # Find the last batch number to continue from
            max_batch_num = max([b.get("batch", 0) for b in batches], default=0)
            next_batch_num = max_batch_num + 1
            
            while qty_remaining > 0:
                if max_batch_size:
                    batch_qty = min(qty_remaining, max_batch_size)
                else:
                    batch_qty = qty_remaining
                
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
                # Keep batches sorted
                batches_by_size[to_size_value].sort(key=lambda x: x.get("batch", 0))
                
                qty_remaining -= batch_qty
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
            
            # Sort batches by batch number within each size group
            for size_value in batches_by_size:
                batches_by_size[size_value].sort(key=lambda x: x.get("batch", 0))
            
            merged_any = False
            final_batches = []
            
            for size_value, size_batches in batches_by_size.items():
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
    2. Create batches from totals:
       - For each size: full_batches = floor(total_qty / qty_per_batch)
       - leftover = total_qty % qty_per_batch
       - Create full batches with qty_per_batch quantity
       - If leftover >= threshold: create extra batch
       - If leftover < threshold: merge into last batch
    3. Apply size transitions to batches AFTER creation:
       - Deduct from LAST batch of transitioned-from size only
       - Add to FIRST batch of transitioned-to size only
    4. Apply threshold merging:
       - Merge batches with quantity < threshold into previous batch of same size
       - Iterate until no more merges needed
    5. Validate quantity integrity:
       - Ensure total quantities per size match expected values
       - Raise error if pieces are lost
    
    Rules:
    - Size transitions are applied AFTER batch creation
    - Transitions only affect: last batch of source size and last batch of target size
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
    
    cut_seq = cut_crud.get_cut_sequence_per_job_order(db, job_order_id, cut_id)
    
    rolls = cut_details.get('rolls', [])
    # NOTE: cut_details_view.total_pieces already includes cut_size_transitions adjustments.
    # We still load transitions elsewhere for display, but generation should not reapply them.
    color_id = cut_details['color_id']
    
    # Use cut_details['sizes'] (system-of-record) instead of recomputing via per-roll truncation.
    total_size_quantities: Dict[str, int] = {}
    for s in cut_details.get("sizes") or []:
        sv = s.get("size_value")
        tp = s.get("total_pieces")
        if not sv or tp is None:
            continue
        total_size_quantities[str(sv)] = int(tp)
    
    # Step 1: Create batches from totals (without applying transitions yet)
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
        if roll_number < 0 or roll_number >= LAYERS_ROLL_MOD:
            raise ValueError(
                f"roll_number must be 0..{LAYERS_ROLL_MOD - 1} (decimal), got {roll_number}"
            )
        layers = cut_seq * LAYERS_ROLL_MOD + roll_number
        
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
    
    # IMPORTANT:
    # ops.cut_details_view.total_pieces is already transition-adjusted in this codebase.
    # Applying cut_size_transitions again here would double-apply them.
    
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
    # Expected totals come directly from cut_details_view totals.
    adjusted_total_size_quantities = total_size_quantities.copy()
    
    final_totals_by_size = {}
    for batch in batches:
        size_value = batch.get("size")
        if size_value:
            if size_value not in final_totals_by_size:
                final_totals_by_size[size_value] = 0
            final_totals_by_size[size_value] += batch.get("quantity", 0)
    
    # Verify totals match expected (after transitions)
    # Only validate sizes that are in quantity_per_batch (user-selected sizes)
    for size_value, expected_total in adjusted_total_size_quantities.items():
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
    3. Create batches from roll quantities:
       - One batch per roll (do not combine rolls)
       - If max_batch_size is set and quantity > max_batch_size, split into multiple batches
       - If leftover < threshold, merge into previous batch
    4. Apply size transitions to batches AFTER creation:
       - Deduct from LAST batch of transitioned-from size only
       - Add to FIRST batch of transitioned-to size only
    5. Apply threshold merging after transitions
    6. Validate quantity integrity
    
    Rules:
    - Each batch represents exactly one roll (do not combine rolls)
    - Size transitions are applied AFTER batch creation
    - Transitions only affect: last batch of source size and last batch of target size
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
    
    cut_seq = cut_crud.get_cut_sequence_per_job_order(db, job_order_id, cut_id)
    
    ratios = cut_details.get('job_order_items_ratios', {}) or {}
    rolls = cut_details.get('rolls', [])
    # NOTE: cut_details_view.total_pieces already includes cut_size_transitions adjustments.
    # We still load transitions elsewhere for display, but generation should not reapply them.
    color_id = cut_details['color_id']
    
    # Step 1: Calculate integer quantities per roll+size WITHOUT dropping pieces.
    # We derive expected totals from cut_details['sizes'] (which is already the system-of-record total_pieces),
    # then distribute any rounding residues across rolls by largest fractional remainder.
    roll_batches: List[Dict[str, Any]] = []
    total_size_quantities: Dict[int, int] = {}  # size_id -> expected total pieces across ALL rolls

    expected_from_cut: Dict[int, int] = {}
    for s in cut_details.get("sizes") or []:
        sid = s.get("size_id")
        tp = s.get("total_pieces")
        if sid is None or tp is None:
            continue
        expected_from_cut[int(sid)] = int(tp)

    # Map item_id -> size_id once (avoid per-roll queries)
    item_id_to_size_id: Dict[int, int] = {}
    for item_id_str in ratios.keys():
        try:
            item_id = int(item_id_str)
        except (TypeError, ValueError):
            continue
        job_order_item = db.query(models.JobOrderItem).filter(
            models.JobOrderItem.item_id == item_id,
            models.JobOrderItem.job_order_id == job_order_id,
            models.JobOrderItem.color_id == color_id
        ).first()
        if job_order_item:
            item_id_to_size_id[item_id] = int(job_order_item.size_id)

    # Compute exact quantities per (roll, size)
    roll_meta: List[Tuple[int, int]] = []  # (roll_id, roll_number)
    exact_by_roll_size: Dict[int, Dict[int, float]] = {}
    base_by_roll_size: Dict[int, Dict[int, int]] = {}
    frac_by_roll_size: Dict[int, Dict[int, float]] = {}

    for roll in rolls:
        roll_id = int(roll.get("roll_id") or 0) or None
        if roll_id is None:
            # Fallback to roll_number identity if roll_id isn't present
            roll_id = int(roll.get("roll_number") or 0)

        num_layers = roll.get('num_of_layers', 0)
        roll_number = int(roll.get('roll_number', 1))
        if roll_number < 0 or roll_number >= LAYERS_ROLL_MOD:
            raise ValueError(
                f"roll_number must be 0..{LAYERS_ROLL_MOD - 1} (decimal), got {roll_number}"
            )
        if not num_layers or num_layers <= 0:
            continue

        roll_meta.append((roll_id, roll_number))
        exact_by_roll_size[roll_id] = {}
        base_by_roll_size[roll_id] = {}
        frac_by_roll_size[roll_id] = {}

        for item_id_str, ratio_per_layer in ratios.items():
            try:
                item_id = int(item_id_str)
            except (TypeError, ValueError):
                continue
            size_id = item_id_to_size_id.get(item_id)
            if not size_id:
                continue

            exact = float(ratio_per_layer or 0) * float(num_layers or 0)
            if exact <= 0:
                continue
            base = int(exact // 1)
            frac = float(exact - base)

            exact_by_roll_size[roll_id][size_id] = exact_by_roll_size[roll_id].get(size_id, 0.0) + exact
            base_by_roll_size[roll_id][size_id] = base_by_roll_size[roll_id].get(size_id, 0) + base
            # Keep a representative remainder for allocation (sum remainders is fine too, but representative is enough
            # because we're only distributing small diffs; we use summed frac to be safe.)
            frac_by_roll_size[roll_id][size_id] = frac_by_roll_size[roll_id].get(size_id, 0.0) + frac

    # Distribute rounding diff per size across rolls
    # Start from base integers; then add/subtract 1 where needed.
    roll_qty_by_size: Dict[int, Dict[int, int]] = {rid: dict(smap) for rid, smap in base_by_roll_size.items()}

    # Determine expected totals:
    # Prefer cut_details['sizes'] totals (system-of-record), otherwise fall back to rounding sum(exact).
    all_size_ids = set()
    for rid in roll_qty_by_size:
        all_size_ids.update(roll_qty_by_size[rid].keys())

    for size_id in all_size_ids:
        base_sum = sum(roll_qty_by_size[rid].get(size_id, 0) for rid, _ in roll_meta)
        expected_total = expected_from_cut.get(size_id)
        if expected_total is None:
            exact_sum = sum(exact_by_roll_size.get(rid, {}).get(size_id, 0.0) for rid, _ in roll_meta)
            expected_total = int(round(exact_sum))
        diff = int(expected_total) - int(base_sum)

        if diff == 0:
            total_size_quantities[size_id] = int(expected_total)
            continue

        # Sort rolls by remainder: if we need to add pieces, give to largest remainder;
        # if we need to remove pieces, take from smallest remainder (and only from rolls that have >0).
        remainders = []
        for rid, _rn in roll_meta:
            remainders.append((rid, float(frac_by_roll_size.get(rid, {}).get(size_id, 0.0))))

        if diff > 0:
            remainders.sort(key=lambda x: x[1], reverse=True)
            idx = 0
            while diff > 0 and remainders:
                rid, _ = remainders[idx % len(remainders)]
                roll_qty_by_size.setdefault(rid, {})
                roll_qty_by_size[rid][size_id] = int(roll_qty_by_size[rid].get(size_id, 0)) + 1
                diff -= 1
                idx += 1
        else:
            to_remove = -diff
            remainders.sort(key=lambda x: x[1])  # smallest remainder loses first
            idx = 0
            while to_remove > 0 and remainders:
                rid, _ = remainders[idx % len(remainders)]
                cur = int(roll_qty_by_size.get(rid, {}).get(size_id, 0))
                if cur > 0:
                    roll_qty_by_size[rid][size_id] = cur - 1
                    to_remove -= 1
                idx += 1

        total_size_quantities[size_id] = int(expected_total)

    # Build roll_batches list from distributed integers
    for rid, roll_number in roll_meta:
        layers_value = cut_seq * LAYERS_ROLL_MOD + roll_number
        for size_id, qty in (roll_qty_by_size.get(rid) or {}).items():
            if qty and qty > 0:
                roll_batches.append(
                    {
                        "size_id": int(size_id),
                        "quantity": int(qty),
                        "layers": int(layers_value),
                        "roll_number": int(roll_number),
                    }
                )
    
    # Step 2: Create batches from roll quantities (without applying transitions yet)
    batches = []
    batch_number = 1
    
    # Track serial numbers per size-roll_number combination to ensure uniqueness
    serial_counters: Dict[Tuple[int, int, int], int] = {}
    
    def get_next_serial_for_size_roll(size_id: int, layers_value: int, color_id: int) -> int:
        """Next serial for this job order + size + color + encoded cut/roll (full Batch.layers)."""
        key = (size_id, layers_value, color_id)
        if key not in serial_counters:
            existing_count = db.query(models.Batch).filter(
                models.Batch.job_order_id == job_order_id,
                models.Batch.size_id == size_id,
                models.Batch.color_id == color_id,
                models.Batch.layers == layers_value,
            ).count()
            serial_counters[key] = existing_count + 1
        else:
            serial_counters[key] += 1
        return serial_counters[key]
    
    for batch_info in roll_batches:
        size_id = batch_info["size_id"]
        quantity = batch_info["quantity"]  # Already adjusted by transitions
        layers_value = batch_info["layers"]  # cut_seq * LAYERS_ROLL_MOD + roll_number
        roll_number = batch_info.get("roll_number", layers_value % LAYERS_ROLL_MOD)
        
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
                serial_number = get_next_serial_for_size_roll(size_id, layers_value, color_id)
                
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
                        batch_roll = batches[i].get("layers", 0) % LAYERS_ROLL_MOD
                        if batches[i].get("size_id") == size_id and batch_roll == roll_number:
                            last_batch_same_size_roll = batches[i]
                            break
                    
                    if last_batch_same_size_roll:
                        new_quantity = last_batch_same_size_roll["quantity"] + leftover
                        last_serial = last_batch_same_size_roll.get("serial_number")
                        if not last_serial:
                            last_serial = get_next_serial_for_size_roll(size_id, layers_value, color_id)
                        
                        last_batch_same_size_roll["quantity"] = new_quantity
                        last_batch_same_size_roll["barcode"] = generate_barcode_string(
                            job_order_id,
                            size_id,
                            color_id,
                            layers_value,
                            last_serial
                        )
                    else:
                        serial_number = get_next_serial_for_size_roll(size_id, layers_value, color_id)
                        
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
                    serial_number = get_next_serial_for_size_roll(size_id, layers_value, color_id)
                    
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
            serial_number = get_next_serial_for_size_roll(size_id, layers_value, color_id)

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
    
    # IMPORTANT:
    # ops.cut_details_view.total_pieces is already transition-adjusted in this codebase.
    # Applying cut_size_transitions again here would double-apply them.
    
    # Step 4: Apply threshold merging (merge small batches backward)
    if extra_pieces_threshold:
        # Group batches by size and roll_number to ensure we only merge within same size-roll combo
        batches_by_size_roll: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
        for batch in batches:
            size_value = batch.get("size")
            layers_value = batch.get("layers", cut_seq * LAYERS_ROLL_MOD + 1)
            roll_number = layers_value % LAYERS_ROLL_MOD  # Extract roll_number from layers
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
                        layers_value = prev_batch.get("layers", cut_seq * LAYERS_ROLL_MOD + 1)
                        serial_number = prev_batch.get("serial_number")
                        if not serial_number:
                            serial_number = get_next_serial_for_size_roll(size_id, layers_value, color_id)
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
                layers_value = batch.get("layers", cut_seq * LAYERS_ROLL_MOD + 1)
                roll_number = layers_value % LAYERS_ROLL_MOD  # Extract roll_number from layers
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
    # Expected totals come directly from cut_details_view totals.
    adjusted_total_size_quantities = total_size_quantities.copy()
    
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