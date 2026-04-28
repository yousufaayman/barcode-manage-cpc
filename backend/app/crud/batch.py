from dataclasses import dataclass
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

LAYERS_ROLL_MOD = 100


@dataclass
class ScanEventOptions:
    """Optional fields for create_scan_event (keeps the public API under Sonar parameter limits)."""

    old_status: Optional[str] = None
    new_status: Optional[str] = None
    old_quantity: Optional[int] = None
    new_quantity: Optional[int] = None
    old_phase: Optional[int] = None
    new_phase: Optional[int] = None
    user_id: Optional[int] = None
    notes: Optional[str] = None
    is_reversal: bool = False
    reversed_event_id: Optional[int] = None
    autocommit: bool = True


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
            db,
            db_batch.batch_id,
            "scan_in",
            db_batch.current_phase,
            ScanEventOptions(
                new_status=db_batch.status,
                new_quantity=db_batch.quantity,
                new_phase=db_batch.current_phase,
                user_id=user_id,
            ),
        )
        
        return db_batch
        
    except Exception as e:
        db.rollback()
        raise e


def _dump_batch_update_payload(batch: schemas.BatchUpdate) -> dict:
    try:
        return batch.model_dump(exclude_unset=True)
    except AttributeError:
        return batch.dict(exclude_unset=True)


def _apply_batch_update_fields(db_batch: models.Batch, update_data: dict) -> None:
    for field, value in update_data.items():
        if field == "is_second_degree":
            setattr(db_batch, field, 1 if value else 0)
        else:
            setattr(db_batch, field, value)


def _backward_movement_events_or_raise(
    db: Session,
    db_batch: models.Batch,
    phase_changed: bool,
    old_phase: Optional[int],
    new_phase: Optional[int],
) -> Tuple[bool, list]:
    if not (phase_changed and old_phase and new_phase):
        return False, []
    if not is_backward_movement(db, old_phase, new_phase):
        return False, []
    is_compensation_batch = (
        db.query(models.BatchCompensation)
        .filter(models.BatchCompensation.batch_id == db_batch.batch_id)
        .first()
        is not None
    )
    events_to_reverse = get_events_to_reverse(db, db_batch.batch_id, old_phase, new_phase)
    if not events_to_reverse and not is_compensation_batch:
        raise ValueError(
            f"Cannot move batch {db_batch.batch_id} backward from phase {old_phase} to {new_phase}: "
            "No events found to reverse. Backward movement requires reversal events."
        )
    return True, events_to_reverse


def _validate_second_degree_phase_transition(
    db: Session,
    phase_changed: bool,
    old_phase: Optional[int],
    new_phase: Optional[int],
    old_second_degree: Any,
) -> None:
    if not phase_changed or not bool(old_second_degree):
        return
    if old_phase is None or new_phase is None or old_phase == new_phase:
        return

    old_phase_row = (
        db.query(models.ProductionPhase)
        .filter(models.ProductionPhase.phase_id == old_phase)
        .first()
    )
    new_phase_row = (
        db.query(models.ProductionPhase)
        .filter(models.ProductionPhase.phase_id == new_phase)
        .first()
    )
    if not old_phase_row or not new_phase_row:
        return

    old_phase_name = (old_phase_row.phase_name or "").strip().lower()
    old_phase_type = (old_phase_row.type or "").strip().lower()
    new_phase_type = (new_phase_row.type or "").strip().lower()

    if old_phase_name == "cutting":
        raise ValueError(
            "Second degree batches in Cutting cannot be moved to any other phase"
        )

    if old_phase_type == "qc" and new_phase_type != "packaging":
        raise ValueError(
            "Second degree batches in QC can only be moved to Packaging phases"
        )


def _emit_backward_movement_reversals(
    db: Session,
    db_batch: models.Batch,
    events_to_reverse: list,
    old_phase: Optional[int],
    new_phase: Optional[int],
    user_id: Optional[int],
) -> None:
    for original_event in events_to_reverse:
        if not original_event.quantity_delta or original_event.quantity_delta == 0:
            continue
        create_scan_event(
            db,
            db_batch.batch_id,
            "phase_change",
            original_event.phase_id,
            ScanEventOptions(
                old_phase=old_phase,
                new_phase=new_phase,
                old_status=original_event.new_status,
                new_status=original_event.old_status,
                old_quantity=original_event.new_quantity,
                new_quantity=original_event.old_quantity,
                user_id=user_id,
                notes=(
                    f"Reversal of event {original_event.id} due to backward movement "
                    f"from phase {old_phase} to {new_phase}"
                ),
                is_reversal=True,
                reversed_event_id=original_event.id,
            ),
        )


def _resolve_next_production_phase(
    db: Session, current_phase: models.ProductionPhase
) -> Optional[models.ProductionPhase]:
    if current_phase.phase_name == "Cutting":
        return (
            db.query(models.ProductionPhase)
            .filter(models.ProductionPhase.type == "sewing")
            .order_by(models.ProductionPhase.sequence_order.asc())
            .first()
        )
    if current_phase.type == "sewing":
        return (
            db.query(models.ProductionPhase)
            .filter(models.ProductionPhase.type == "qc")
            .order_by(models.ProductionPhase.sequence_order.asc())
            .first()
        )
    if current_phase.type == "qc":
        return (
            db.query(models.ProductionPhase)
            .filter(models.ProductionPhase.type == "packaging")
            .order_by(models.ProductionPhase.sequence_order.asc())
            .first()
        )
    return None


def _scan_in_next_phase_after_completed(
    db: Session,
    db_batch: models.Batch,
    new_phase: int,
    new_quantity: int,
    user_id: Optional[int],
) -> None:
    current_phase = (
        db.query(models.ProductionPhase)
        .filter(models.ProductionPhase.phase_id == new_phase)
        .first()
    )
    if not current_phase:
        return
    next_phase = _resolve_next_production_phase(db, current_phase)
    if not next_phase:
        return
    try:
        create_scan_event(
            db,
            db_batch.batch_id,
            "scan_in",
            next_phase.phase_id,
            ScanEventOptions(
                old_status="Completed",
                new_status="Pending",
                old_phase=new_phase,
                new_phase=next_phase.phase_id,
                old_quantity=new_quantity,
                new_quantity=new_quantity,
                user_id=user_id,
            ),
        )
    except Exception as e:
        db.rollback()
        raise e


def _emit_status_and_phase_scan_events(
    db: Session,
    db_batch: models.Batch,
    status_changed: bool,
    phase_changed: bool,
    old_status: Optional[str],
    new_status: Optional[str],
    old_phase: Optional[int],
    new_phase: Optional[int],
    old_quantity: Optional[int],
    new_quantity: Optional[int],
    user_id: Optional[int],
) -> None:
    if not (status_changed or phase_changed):
        return
    if new_status in ["In Progress", "Pending"]:
        create_scan_event(
            db,
            db_batch.batch_id,
            "scan_in",
            new_phase,
            ScanEventOptions(
                old_status=old_status,
                new_status=new_status,
                old_phase=old_phase,
                new_phase=new_phase,
                old_quantity=old_quantity,
                new_quantity=new_quantity,
                user_id=user_id,
            ),
        )
    if new_status != "Completed":
        return
    create_scan_event(
        db,
        db_batch.batch_id,
        "scan_out",
        old_phase if old_phase else new_phase,
        ScanEventOptions(
            old_status=old_status,
            new_status=new_status,
            old_quantity=old_quantity,
            new_quantity=new_quantity,
            old_phase=old_phase,
            new_phase=new_phase,
            user_id=user_id,
        ),
    )
    _scan_in_next_phase_after_completed(db, db_batch, new_phase, new_quantity, user_id)


def _create_rejection_for_quantity_decrement(
    db: Session,
    db_batch: models.Batch,
    batch: schemas.BatchUpdate,
    update_data: dict,
    quantity_decrement_type: str,
    deduction_amount: int,
    new_phase: int,
    user_id: Optional[int],
) -> None:
    from .rejection import create_rejection
    from ..schemas import SingleRejectionCreate
    from sqlalchemy.exc import SQLAlchemyError

    try:
        quantity_decrement_phase_id = getattr(batch, "quantity_decrement_phase_id", None)
        if quantity_decrement_phase_id is None:
            quantity_decrement_phase_id = update_data.get("quantity_decrement_phase_id")
        quantity_decrement_reason = update_data.get("quantity_decrement_reason")

        if quantity_decrement_type == "lost":
            rejection_reason = "lost/untracked"
            return_to_phase_id = new_phase
        else:
            rejection_reason = quantity_decrement_reason or f"Quantity decremented by {deduction_amount}"
            return_to_phase_id = quantity_decrement_phase_id

        rework_op_batch_id = None
        if quantity_decrement_type == "rejection":
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


def _emit_quantity_change_events(
    db: Session,
    db_batch: models.Batch,
    batch: schemas.BatchUpdate,
    update_data: dict,
    quantity_changed: bool,
    old_quantity: int,
    new_quantity: int,
    new_phase: int,
    user_id: Optional[int],
) -> None:
    if not quantity_changed:
        return

    deduction_to_phase = update_data.get("deduction_to_phase")
    deduction_amount = old_quantity - new_quantity if old_quantity > new_quantity else 0
    quantity_decrement_type_raw = update_data.get("quantity_decrement_type")
    quantity_decrement_type = (
        quantity_decrement_type_raw.value
        if hasattr(quantity_decrement_type_raw, "value")
        else quantity_decrement_type_raw
    )
    quantity_decrement_reason = update_data.get("quantity_decrement_reason")

    if deduction_to_phase and deduction_amount > 0:
        create_scan_event(
            db,
            db_batch.batch_id,
            "scan_out",
            deduction_to_phase,
            ScanEventOptions(
                old_quantity=deduction_amount,
                new_quantity=0,
                user_id=user_id,
            ),
        )

    if deduction_amount > 0 and quantity_decrement_type in ("rejection", "lost"):
        _create_rejection_for_quantity_decrement(
            db,
            db_batch,
            batch,
            update_data,
            quantity_decrement_type,
            deduction_amount,
            new_phase,
            user_id,
        )

    if quantity_decrement_type not in ("rejection", "lost"):
        notes_text = None
        if quantity_decrement_type:
            decrement_type_label = {"second_degree": "Second degree"}.get(
                quantity_decrement_type, quantity_decrement_type
            )
            notes_parts = [f"Decrement type: {decrement_type_label}"]
            if quantity_decrement_reason:
                notes_parts.append(f"Reason: {quantity_decrement_reason}")
            notes_text = "; ".join(notes_parts)
        create_scan_event(
            db,
            db_batch.batch_id,
            "quantity_update",
            new_phase,
            ScanEventOptions(
                old_quantity=old_quantity,
                new_quantity=new_quantity,
                user_id=user_id,
                notes=notes_text,
            ),
        )


def _emit_second_degree_change_event(
    db: Session,
    db_batch: models.Batch,
    second_degree_changed: bool,
    old_second_degree,
    new_second_degree,
    new_phase: int,
    old_quantity: int,
    new_quantity: int,
    user_id: Optional[int],
) -> None:
    if not second_degree_changed:
        return
    create_scan_event(
        db,
        db_batch.batch_id,
        "status_change",
        new_phase,
        ScanEventOptions(
            old_status=str(old_second_degree),
            new_status=str(new_second_degree),
            old_quantity=old_quantity,
            new_quantity=new_quantity,
            user_id=user_id,
        ),
    )


@dataclass
class _UpdateBatchEffectContext:
    update_data: dict
    backward_movement_detected: bool
    events_to_reverse: list
    status_changed: bool
    phase_changed: bool
    quantity_changed: bool
    second_degree_changed: bool
    old_status: Optional[str]
    old_quantity: int
    old_phase: Optional[int]
    old_second_degree: Any
    new_status: Optional[str]
    new_phase: Any
    new_quantity: int
    new_second_degree: Any


def _run_update_batch_scan_event_side_effects(
    db: Session,
    db_batch: models.Batch,
    batch: schemas.BatchUpdate,
    ctx: _UpdateBatchEffectContext,
    user_id: Optional[int],
) -> None:
    if ctx.backward_movement_detected and ctx.events_to_reverse:
        _emit_backward_movement_reversals(
            db, db_batch, ctx.events_to_reverse, ctx.old_phase, ctx.new_phase, user_id
        )
    _emit_status_and_phase_scan_events(
        db,
        db_batch,
        ctx.status_changed,
        ctx.phase_changed,
        ctx.old_status,
        ctx.new_status,
        ctx.old_phase,
        ctx.new_phase,
        ctx.old_quantity,
        ctx.new_quantity,
        user_id,
    )
    _emit_quantity_change_events(
        db,
        db_batch,
        batch,
        ctx.update_data,
        ctx.quantity_changed,
        ctx.old_quantity,
        ctx.new_quantity,
        ctx.new_phase,
        user_id,
    )
    _emit_second_degree_change_event(
        db,
        db_batch,
        ctx.second_degree_changed,
        ctx.old_second_degree,
        ctx.new_second_degree,
        ctx.new_phase,
        ctx.old_quantity,
        ctx.new_quantity,
        user_id,
    )


def _batch_to_response_after_update(db: Session, db_batch: models.Batch) -> schemas.BatchResponse:
    job_order = (
        db.query(models.JobOrder)
        .filter(models.JobOrder.job_order_id == db_batch.job_order_id)
        .first()
    )
    brand = (
        db.query(models.Client)
        .filter(models.Client.client_id == job_order.client_id)
        .first()
        if job_order and job_order.client_id
        else None
    )
    model = (
        db.query(models.Model)
        .filter(models.Model.model_id == job_order.model_id)
        .first()
        if job_order and job_order.model_id
        else None
    )
    size = db.query(models.Size).filter(models.Size.size_id == db_batch.size_id).first()
    color = db.query(models.Color).filter(models.Color.color_id == db_batch.color_id).first()
    phase = (
        db.query(models.ProductionPhase)
        .filter(models.ProductionPhase.phase_id == db_batch.current_phase)
        .first()
    )
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
        archived_at=None,
    )


def update_batch(
    db: Session,
    db_batch: models.Batch,
    batch: schemas.BatchUpdate,
    user_id: Optional[int] = None,
):
    update_data = _dump_batch_update_payload(batch)

    old_status = db_batch.status
    old_quantity = db_batch.quantity
    old_phase = db_batch.current_phase
    old_second_degree = db_batch.is_second_degree

    _apply_batch_update_fields(db_batch, update_data)

    status_changed = "status" in update_data and old_status != update_data["status"]
    quantity_changed = "quantity" in update_data and old_quantity != update_data["quantity"]
    phase_changed = "current_phase" in update_data and old_phase != update_data["current_phase"]
    second_degree_changed = (
        "is_second_degree" in update_data
        and old_second_degree != update_data["is_second_degree"]
    )

    new_status = update_data.get("status", old_status)
    new_phase = update_data.get("current_phase", old_phase)
    new_quantity = update_data.get("quantity", old_quantity)
    new_second_degree = update_data.get("is_second_degree", old_second_degree)

    _validate_second_degree_phase_transition(
        db, phase_changed, old_phase, new_phase, old_second_degree
    )

    backward_movement_detected, events_to_reverse = _backward_movement_events_or_raise(
        db, db_batch, phase_changed, old_phase, new_phase
    )

    try:
        effect_ctx = _UpdateBatchEffectContext(
            update_data=update_data,
            backward_movement_detected=backward_movement_detected,
            events_to_reverse=events_to_reverse,
            status_changed=status_changed,
            phase_changed=phase_changed,
            quantity_changed=quantity_changed,
            second_degree_changed=second_degree_changed,
            old_status=old_status,
            old_quantity=old_quantity,
            old_phase=old_phase,
            old_second_degree=old_second_degree,
            new_status=new_status,
            new_phase=new_phase,
            new_quantity=new_quantity,
            new_second_degree=new_second_degree,
        )
        _run_update_batch_scan_event_side_effects(db, db_batch, batch, effect_ctx, user_id)
    except Exception as e:
        db.rollback()
        raise e

    db.commit()
    db.refresh(db_batch)
    return _batch_to_response_after_update(db, db_batch)


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
            create_scan_event(
                db,
                batch.batch_id,
                "scan_in",
                first_sewing_phase_id,
                ScanEventOptions(old_status="Completed", new_status="Pending"),
            )
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
            create_scan_event(
                db,
                batch.batch_id,
                "scan_in",
                first_qc_phase_id,
                ScanEventOptions(old_status="Completed", new_status="Pending"),
            )
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
            create_scan_event(
                db,
                batch.batch_id,
                "scan_in",
                first_packaging_phase_id,
                ScanEventOptions(old_status="Completed", new_status="Pending"),
            )
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

# Event-based timeline functions
def create_scan_event(
    db: Session,
    batch_id: int,
    action_type: str,
    phase_id: int,
    options: Optional[ScanEventOptions] = None,
) -> models.BarcodeScanEvent:
    """
    Create a new scan event record and write ledger entry.

    Phase 2: Now calculates affects_phase_type, quantity_delta, and writes to ledger.
    """
    o = options or ScanEventOptions()
    batch = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    batch_quantity = batch.quantity if batch else None

    affects_phase_type = determine_affects_phase_type(
        db,
        action_type,
        phase_id,
        o.old_phase,
        o.new_phase,
        o.old_quantity,
        o.new_quantity,
    )

    quantity_delta = calculate_quantity_delta(
        action_type,
        o.old_quantity,
        o.new_quantity,
        o.old_phase,
        o.new_phase,
        batch_quantity,
    )

    event = models.BarcodeScanEvent(
        batch_id=batch_id,
        action_type=action_type,
        phase_id=phase_id,
        old_status=o.old_status,
        new_status=o.new_status,
        old_quantity=o.old_quantity,
        new_quantity=o.new_quantity,
        old_phase=o.old_phase,
        new_phase=o.new_phase,
        user_id=o.user_id,
        notes=o.notes,
        affects_phase_type=affects_phase_type,
        quantity_delta=quantity_delta,
        is_reversal=o.is_reversal,
        reversed_event_id=o.reversed_event_id,
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
            quantity_delta=quantity_delta,
        )

    if o.autocommit:
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


def _append_timeline_entry_if_any(
    db: Session,
    timeline_entries: List[dict],
    phase_events: List[models.BarcodeScanEvent],
) -> None:
    if not phase_events:
        return
    entry = _create_timeline_entry_from_events(db, phase_events)
    if entry:
        timeline_entries.append(entry)


def _build_timeline_entries_from_scan_events(
    db: Session, events: List[models.BarcodeScanEvent]
) -> List[dict]:
    timeline_entries: List[dict] = []
    current_phase_events: List[models.BarcodeScanEvent] = []
    current_phase_id: Optional[int] = None

    for event in events:
        if current_phase_id is None:
            current_phase_id = event.phase_id
            current_phase_events = [event]
        elif event.phase_id == current_phase_id:
            current_phase_events.append(event)
        else:
            _append_timeline_entry_if_any(db, timeline_entries, current_phase_events)
            current_phase_id = event.phase_id
            current_phase_events = [event]

    _append_timeline_entry_if_any(db, timeline_entries, current_phase_events)
    return timeline_entries


def get_timeline_summary_by_batch(db: Session, batch_id: int):
    """Get aggregated timeline summary for a batch"""
    events = db.query(models.BarcodeScanEvent).filter(
        models.BarcodeScanEvent.batch_id == batch_id
    ).order_by(models.BarcodeScanEvent.scanned_at).all()

    if not events:
        return None

    batch = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not batch:
        return None

    timeline_entries = _build_timeline_entries_from_scan_events(db, events)

    return {
        "barcode": batch.barcode,
        "timeline_entries": timeline_entries,
        "total_entries": len(timeline_entries),
        "total_events": len(events),
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


def _group_batches_by_size_sorted(
    batches: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    batches_by_size: Dict[str, List[Dict[str, Any]]] = {}
    for batch in batches:
        size_value = batch.get("size")
        if not size_value:
            continue
        batches_by_size.setdefault(size_value, []).append(batch)
    for lst in batches_by_size.values():
        lst.sort(key=lambda x: x.get("batch", 0))
    return batches_by_size


def _transition_resolve_items_and_sizes(
    db: Session, transition: Dict[str, Any]
) -> Optional[Tuple[int, models.Size, models.Size]]:
    transition_qty = transition.get("quantity", 0)
    if transition_qty <= 0:
        return None
    from_item_id = transition.get("from_item_id")
    to_item_id = transition.get("to_item_id")
    from_item = (
        db.query(models.JobOrderItem)
        .filter(models.JobOrderItem.item_id == from_item_id)
        .first()
    )
    to_item = (
        db.query(models.JobOrderItem)
        .filter(models.JobOrderItem.item_id == to_item_id)
        .first()
    )
    if not from_item or not to_item:
        return None
    from_size = (
        db.query(models.Size).filter(models.Size.size_id == from_item.size_id).first()
    )
    to_size = db.query(models.Size).filter(models.Size.size_id == to_item.size_id).first()
    if not from_size or not to_size:
        return None
    return transition_qty, from_size, to_size


def _deduct_qty_from_last_source_batch(
    db: Session,
    job_order_id: int,
    color_id: int,
    batches_by_size: Dict[str, List[Dict[str, Any]]],
    from_size_value: str,
    qty_to_deduct: int,
) -> int:
    """Deduct up to qty_to_deduct from the last batch of from_size_value; return quantity to move."""
    from ..crud.helpers import generate_barcode_string, get_next_serial_number

    source_batches = batches_by_size.get(from_size_value, [])
    if not source_batches:
        return 0

    last_source_batch = source_batches[-1]
    batch_qty = last_source_batch.get("quantity", 0)
    from_size_id = last_source_batch.get("size_id")

    if batch_qty >= qty_to_deduct:
        last_source_batch["quantity"] = batch_qty - qty_to_deduct
        qty_to_add = qty_to_deduct
    else:
        last_source_batch["quantity"] = 0
        qty_to_add = batch_qty

    serial_number = last_source_batch.get("serial_number")
    if not serial_number:
        serial_number = get_next_serial_number(db, job_order_id, from_size_id, color_id)
        last_source_batch["serial_number"] = serial_number

    layers = max(1, last_source_batch.get("layers", 1))
    last_source_batch["barcode"] = generate_barcode_string(
        job_order_id, from_size_id, color_id, layers, serial_number
    )
    return qty_to_add


def _fill_first_target_batch(
    db: Session,
    job_order_id: int,
    color_id: int,
    first_target_batch: Dict[str, Any],
    to_size_id: int,
    layers: int,
    qty_to_add: int,
    max_batch_size: Optional[int],
) -> int:
    """Add quantity to the first target batch; return qty_remaining."""
    from ..crud.helpers import generate_barcode_string, get_next_serial_number

    current_qty = first_target_batch.get("quantity", 0)

    if max_batch_size:
        available_space = max_batch_size - current_qty
        if available_space <= 0:
            return qty_to_add
        qty_to_add_to_batch = min(qty_to_add, available_space)
    else:
        qty_to_add_to_batch = qty_to_add

    first_target_batch["quantity"] = current_qty + qty_to_add_to_batch

    serial_number = first_target_batch.get("serial_number")
    if not serial_number:
        serial_number = get_next_serial_number(db, job_order_id, to_size_id, color_id)
        first_target_batch["serial_number"] = serial_number

    first_target_batch["barcode"] = generate_barcode_string(
        job_order_id, to_size_id, color_id, layers, serial_number
    )

    return qty_to_add - qty_to_add_to_batch


def _spawn_batches_for_remaining_qty(
    db: Session,
    batches: List[Dict[str, Any]],
    batches_by_size: Dict[str, List[Dict[str, Any]]],
    job_order_id: int,
    color_id: int,
    to_size_value: str,
    to_size_id: int,
    layers: int,
    qty_remaining: int,
    max_batch_size: Optional[int],
) -> None:
    from ..crud.helpers import generate_barcode_string, get_next_serial_number

    if qty_remaining <= 0:
        return

    max_batch_num = max((b.get("batch", 0) for b in batches), default=0)
    next_batch_num = max_batch_num + 1

    while qty_remaining > 0:
        batch_qty = min(qty_remaining, max_batch_size) if max_batch_size else qty_remaining
        serial_number = get_next_serial_number(db, job_order_id, to_size_id, color_id)
        barcode = generate_barcode_string(
            job_order_id, to_size_id, color_id, layers, serial_number
        )
        new_batch = {
            "batch": next_batch_num,
            "size": to_size_value,
            "quantity": batch_qty,
            "barcode": barcode,
            "size_id": to_size_id,
            "serial_number": serial_number,
            "layers": layers,
        }
        batches.append(new_batch)
        batches_by_size.setdefault(to_size_value, []).append(new_batch)
        batches_by_size[to_size_value].sort(key=lambda x: x.get("batch", 0))
        qty_remaining -= batch_qty
        next_batch_num += 1


def _add_transition_qty_to_target_size(
    db: Session,
    batches: List[Dict[str, Any]],
    batches_by_size: Dict[str, List[Dict[str, Any]]],
    job_order_id: int,
    color_id: int,
    from_size_value: str,
    to_size_value: str,
    to_size_id: int,
    qty_to_add: int,
    max_batch_size: Optional[int],
) -> None:
    if qty_to_add <= 0:
        return

    source_batches = batches_by_size.get(from_size_value, [])
    target_batches = batches_by_size.get(to_size_value, [])

    if target_batches:
        layers = max(1, target_batches[0].get("layers", 1))
    elif source_batches:
        layers = max(1, source_batches[-1].get("layers", 1))
    else:
        layers = 1

    qty_remaining = qty_to_add
    if target_batches:
        qty_remaining = _fill_first_target_batch(
            db,
            job_order_id,
            color_id,
            target_batches[0],
            to_size_id,
            layers,
            qty_to_add,
            max_batch_size,
        )

    _spawn_batches_for_remaining_qty(
        db,
        batches,
        batches_by_size,
        job_order_id,
        color_id,
        to_size_value,
        to_size_id,
        layers,
        qty_remaining,
        max_batch_size,
    )


def _merge_sub_threshold_batches_once(
    db: Session,
    batches: List[Dict[str, Any]],
    job_order_id: int,
    color_id: int,
    extra_pieces_threshold: int,
) -> Tuple[List[Dict[str, Any]], bool]:
    from ..crud.helpers import generate_barcode_string, get_next_serial_number

    batches_by_size = _group_batches_by_size_sorted(batches)
    merged_any = False
    final_batches: List[Dict[str, Any]] = []

    for _size_value, size_batches in batches_by_size.items():
        for i, batch in enumerate(size_batches):
            qty = batch.get("quantity", 0)
            if qty < extra_pieces_threshold and qty > 0 and i > 0:
                prev_batch = size_batches[i - 1]
                prev_qty = prev_batch.get("quantity", 0)
                prev_batch["quantity"] = prev_qty + qty

                size_id = prev_batch.get("size_id")
                serial_number = prev_batch.get("serial_number")
                if not serial_number:
                    serial_number = get_next_serial_number(db, job_order_id, size_id, color_id)
                    prev_batch["serial_number"] = serial_number

                layers = max(1, prev_batch.get("layers", 1))
                prev_batch["barcode"] = generate_barcode_string(
                    job_order_id, size_id, color_id, layers, serial_number
                )
                merged_any = True
            else:
                final_batches.append(batch)

    return final_batches, merged_any


def _apply_threshold_merging_until_stable(
    db: Session,
    batches: List[Dict[str, Any]],
    job_order_id: int,
    color_id: int,
    extra_pieces_threshold: int,
) -> List[Dict[str, Any]]:
    max_iterations = 10
    current = batches
    for _ in range(max_iterations):
        current, merged_any = _merge_sub_threshold_batches_once(
            db, current, job_order_id, color_id, extra_pieces_threshold
        )
        if not merged_any:
            break
    return current


def _renumber_batches_sequential(batches: List[Dict[str, Any]]) -> None:
    batches.sort(key=lambda x: (x.get("size", ""), x.get("batch", 0)))
    for i, batch in enumerate(batches, 1):
        batch["batch"] = i


def apply_size_transitions_to_batches(
    db: Session,
    batches: List[Dict[str, Any]],
    transitions: List[Dict[str, Any]],
    job_order_id: int,
    color_id: int,
    max_batch_size: Optional[int] = None,
    extra_pieces_threshold: Optional[int] = None,
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
    if not transitions:
        return batches

    job_order = (
        db.query(models.JobOrder)
        .filter(models.JobOrder.job_order_id == job_order_id)
        .first()
    )
    if not job_order:
        return batches

    batches_by_size = _group_batches_by_size_sorted(batches)

    for transition in transitions:
        resolved = _transition_resolve_items_and_sizes(db, transition)
        if not resolved:
            continue
        transition_qty, from_size, to_size = resolved
        qty_to_add = _deduct_qty_from_last_source_batch(
            db,
            job_order_id,
            color_id,
            batches_by_size,
            from_size.size_value,
            transition_qty,
        )
        _add_transition_qty_to_target_size(
            db,
            batches,
            batches_by_size,
            job_order_id,
            color_id,
            from_size.size_value,
            to_size.size_value,
            to_size.size_id,
            qty_to_add,
            max_batch_size,
        )

    batches = [b for b in batches if b.get("quantity", 0) > 0]

    if extra_pieces_threshold:
        batches = _apply_threshold_merging_until_stable(
            db, batches, job_order_id, color_id, extra_pieces_threshold
        )

    _renumber_batches_sequential(batches)
    return batches


def _manual_cut_load_and_validate(
    db: Session, job_order_id: int, cut_id: int
) -> Tuple[int, List[Any], int, Dict[str, int]]:
    """Load cut details, validate job order, return cut_seq, rolls, color_id, totals per size (string keys)."""
    from ..crud import cut as cut_crud

    cut_details = cut_crud.get_cut_details_by_id(db, cut_id)
    if not cut_details:
        raise ValueError(f"Cut with ID {cut_id} not found")
    if cut_details["job_order_id"] != job_order_id:
        raise ValueError(f"Cut {cut_id} does not belong to job order {job_order_id}")

    job_order = (
        db.query(models.JobOrder)
        .filter(models.JobOrder.job_order_id == job_order_id)
        .first()
    )
    if not job_order:
        raise ValueError(f"Job order with ID {job_order_id} not found")

    cut_seq = cut_crud.get_cut_sequence_per_job_order(db, job_order_id, cut_id)
    rolls = cut_details.get("rolls", [])
    color_id = cut_details["color_id"]

    total_size_quantities: Dict[str, int] = {}
    for s in cut_details.get("sizes") or []:
        sv = s.get("size_value")
        tp = s.get("total_pieces")
        if not sv or tp is None:
            continue
        total_size_quantities[str(sv)] = int(tp)

    return cut_seq, rolls, color_id, total_size_quantities


def _alloc_serial_manual(
    serial_counters: Dict[Tuple[int, int], int],
    db: Session,
    job_order_id: int,
    size_id: int,
    color_id: int,
) -> int:
    from ..crud.helpers import get_next_serial_number

    key = (size_id, color_id)
    if key not in serial_counters:
        serial_counters[key] = get_next_serial_number(db, job_order_id, size_id, color_id)
    else:
        serial_counters[key] += 1
    return serial_counters[key]


def _build_one_size_batches_manual(
    db: Session,
    job_order_id: int,
    color_id: int,
    size_value: str,
    total_qty: int,
    qty_per_batch: int,
    extra_pieces_threshold: int,
    cut_seq: int,
    rolls: List[Any],
    batch_number: int,
    serial_counters: Dict[Tuple[int, int], int],
) -> Tuple[List[Dict[str, Any]], int]:
    from ..crud.helpers import generate_barcode_string

    full_batches = total_qty // qty_per_batch
    leftover = total_qty % qty_per_batch

    size_obj = (
        db.query(models.Size).filter(models.Size.size_value == size_value).first()
    )
    if not size_obj:
        return [], batch_number

    size_id = size_obj.size_id
    roll_number = rolls[0].get("roll_number", 1) if rolls else 1
    if roll_number < 0 or roll_number >= LAYERS_ROLL_MOD:
        raise ValueError(
            f"roll_number must be 0..{LAYERS_ROLL_MOD - 1} (decimal), got {roll_number}"
        )
    layers = cut_seq * LAYERS_ROLL_MOD + roll_number

    size_batches: List[Dict[str, Any]] = []
    last_serial_for_size: Optional[int] = None

    for _ in range(full_batches):
        serial_number = _alloc_serial_manual(
            serial_counters, db, job_order_id, size_id, color_id
        )
        last_serial_for_size = serial_number
        barcode = generate_barcode_string(
            job_order_id, size_id, color_id, layers, serial_number
        )
        size_batches.append(
            {
                "batch": batch_number,
                "size": size_value,
                "quantity": qty_per_batch,
                "barcode": barcode,
                "size_id": size_id,
                "serial_number": serial_number,
                "layers": layers,
            }
        )
        batch_number += 1

    if leftover > 0:
        if leftover >= extra_pieces_threshold:
            serial_number = _alloc_serial_manual(
                serial_counters, db, job_order_id, size_id, color_id
            )
            barcode = generate_barcode_string(
                job_order_id, size_id, color_id, layers, serial_number
            )
            size_batches.append(
                {
                    "batch": batch_number,
                    "size": size_value,
                    "quantity": leftover,
                    "barcode": barcode,
                    "size_id": size_id,
                    "serial_number": serial_number,
                    "layers": layers,
                }
            )
            batch_number += 1
        elif size_batches and last_serial_for_size is not None:
            last_batch = size_batches[-1]
            last_batch["quantity"] = last_batch["quantity"] + leftover
            last_batch["barcode"] = generate_barcode_string(
                job_order_id,
                size_id,
                color_id,
                layers,
                last_serial_for_size,
            )

    return size_batches, batch_number


def _manual_merge_sub_threshold_once(
    db: Session,
    batches: List[Dict[str, Any]],
    job_order_id: int,
    color_id: int,
    extra_pieces_threshold: int,
    serial_counters: Dict[Tuple[int, int], int],
) -> Tuple[List[Dict[str, Any]], bool]:
    """One backward-merge pass using in-memory serial counters (manual cut flow)."""
    from ..crud.helpers import generate_barcode_string

    batches_by_size: Dict[str, List[Dict[str, Any]]] = {}
    for batch in batches:
        size_value = batch.get("size")
        if size_value:
            batches_by_size.setdefault(size_value, []).append(batch)

    merged_any = False
    final_batches: List[Dict[str, Any]] = []

    for _size_value, size_batches in batches_by_size.items():
        size_batches.sort(key=lambda x: x.get("batch", 0))
        for i, batch in enumerate(size_batches):
            qty = batch.get("quantity", 0)
            if qty < extra_pieces_threshold and qty > 0 and i > 0:
                prev_batch = size_batches[i - 1]
                prev_qty = prev_batch.get("quantity", 0)
                prev_batch["quantity"] = prev_qty + qty
                size_id = prev_batch.get("size_id")
                serial_number = prev_batch.get("serial_number")
                if not serial_number:
                    serial_number = _alloc_serial_manual(
                        serial_counters, db, job_order_id, size_id, color_id
                    )
                    prev_batch["serial_number"] = serial_number
                layers = max(1, prev_batch.get("layers", 1))
                prev_batch["barcode"] = generate_barcode_string(
                    job_order_id, size_id, color_id, layers, serial_number
                )
                merged_any = True
            else:
                final_batches.append(batch)

    return final_batches, merged_any


def _manual_apply_threshold_merging_until_stable(
    db: Session,
    batches: List[Dict[str, Any]],
    job_order_id: int,
    color_id: int,
    extra_pieces_threshold: int,
    serial_counters: Dict[Tuple[int, int], int],
) -> List[Dict[str, Any]]:
    max_iterations = 10
    current = batches
    for _ in range(max_iterations):
        current, merged_any = _manual_merge_sub_threshold_once(
            db,
            current,
            job_order_id,
            color_id,
            extra_pieces_threshold,
            serial_counters,
        )
        if not merged_any:
            break
    return current


def _validate_manual_batch_quantity_integrity(
    total_size_quantities: Dict[str, int],
    quantity_per_batch: Dict[str, int],
    batches: List[Dict[str, Any]],
) -> None:
    final_totals_by_size: Dict[str, int] = {}
    for batch in batches:
        size_value = batch.get("size")
        if not size_value:
            continue
        final_totals_by_size[size_value] = (
            final_totals_by_size.get(size_value, 0) + batch.get("quantity", 0)
        )

    for size_value, expected_total in total_size_quantities.items():
        if expected_total <= 0:
            continue
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


def generate_batches_from_cut_manual(
    db: Session,
    job_order_id: int,
    cut_id: int,
    quantity_per_batch: Dict[str, int],
    extra_pieces_threshold: int = 5,
    max_batch_size: Optional[int] = None,
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
    cut_seq, rolls, color_id, total_size_quantities = _manual_cut_load_and_validate(
        db, job_order_id, cut_id
    )

    batches: List[Dict[str, Any]] = []
    batch_number = 1
    serial_counters: Dict[Tuple[int, int], int] = {}

    for size_value, total_qty in sorted(total_size_quantities.items()):
        if total_qty <= 0:
            continue
        if size_value not in quantity_per_batch or quantity_per_batch[size_value] <= 0:
            continue

        qty_per_batch = quantity_per_batch[size_value]
        if max_batch_size and qty_per_batch > max_batch_size:
            qty_per_batch = max_batch_size

        size_batches, batch_number = _build_one_size_batches_manual(
            db,
            job_order_id,
            color_id,
            size_value,
            total_qty,
            qty_per_batch,
            extra_pieces_threshold,
            cut_seq,
            rolls,
            batch_number,
            serial_counters,
        )
        batches.extend(size_batches)

    if extra_pieces_threshold:
        batches = _manual_apply_threshold_merging_until_stable(
            db,
            batches,
            job_order_id,
            color_id,
            extra_pieces_threshold,
            serial_counters,
        )

    _renumber_batches_sequential(batches)

    _validate_manual_batch_quantity_integrity(
        total_size_quantities, quantity_per_batch, batches
    )
    return batches


def _auto_cut_load_and_validate(
    db: Session, job_order_id: int, cut_id: int
) -> Tuple[dict, int, dict, List[Any], int]:
    from ..crud import cut as cut_crud

    cut_details = cut_crud.get_cut_details_by_id(db, cut_id)
    if not cut_details:
        raise ValueError(f"Cut with ID {cut_id} not found")
    if cut_details["job_order_id"] != job_order_id:
        raise ValueError(f"Cut {cut_id} does not belong to job order {job_order_id}")
    job_order = (
        db.query(models.JobOrder)
        .filter(models.JobOrder.job_order_id == job_order_id)
        .first()
    )
    if not job_order:
        raise ValueError(f"Job order with ID {job_order_id} not found")
    cut_seq = cut_crud.get_cut_sequence_per_job_order(db, job_order_id, cut_id)
    ratios = cut_details.get("job_order_items_ratios", {}) or {}
    rolls = cut_details.get("rolls", [])
    color_id = cut_details["color_id"]
    return cut_details, cut_seq, ratios, rolls, color_id


def _expected_totals_by_size_id_from_cut(cut_details: dict) -> Dict[int, int]:
    expected: Dict[int, int] = {}
    for s in cut_details.get("sizes") or []:
        sid = s.get("size_id")
        tp = s.get("total_pieces")
        if sid is None or tp is None:
            continue
        expected[int(sid)] = int(tp)
    return expected


def _build_item_id_to_size_id_for_cut(
    db: Session, ratios: dict, job_order_id: int, color_id: int
) -> Dict[int, int]:
    mapping: Dict[int, int] = {}
    for item_id_str in ratios.keys():
        try:
            item_id = int(item_id_str)
        except (TypeError, ValueError):
            continue
        job_order_item = (
            db.query(models.JobOrderItem)
            .filter(
                models.JobOrderItem.item_id == item_id,
                models.JobOrderItem.job_order_id == job_order_id,
                models.JobOrderItem.color_id == color_id,
            )
            .first()
        )
        if job_order_item:
            mapping[item_id] = int(job_order_item.size_id)
    return mapping


def _auto_cut_merge_ratio_lines_into_roll_maps(
    roll_id: int,
    num_layers: int,
    ratios: dict,
    item_id_to_size_id: Dict[int, int],
    exact_by_roll_size: Dict[int, Dict[int, float]],
    base_by_roll_size: Dict[int, Dict[int, int]],
    frac_by_roll_size: Dict[int, Dict[int, float]],
) -> None:
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
        exact_by_roll_size[roll_id][size_id] = (
            exact_by_roll_size[roll_id].get(size_id, 0.0) + exact
        )
        base_by_roll_size[roll_id][size_id] = (
            base_by_roll_size[roll_id].get(size_id, 0) + base
        )
        frac_by_roll_size[roll_id][size_id] = (
            frac_by_roll_size[roll_id].get(size_id, 0.0) + frac
        )


def _auto_cut_accumulate_roll_size_quantities(
    rolls: List[Any],
    ratios: dict,
    item_id_to_size_id: Dict[int, int],
) -> Tuple[
    List[Tuple[int, int]],
    Dict[int, Dict[int, float]],
    Dict[int, Dict[int, int]],
    Dict[int, Dict[int, float]],
]:
    roll_meta: List[Tuple[int, int]] = []
    exact_by_roll_size: Dict[int, Dict[int, float]] = {}
    base_by_roll_size: Dict[int, Dict[int, int]] = {}
    frac_by_roll_size: Dict[int, Dict[int, float]] = {}

    for roll in rolls:
        roll_id_raw = int(roll.get("roll_id") or 0) or None
        roll_id = roll_id_raw if roll_id_raw is not None else int(roll.get("roll_number") or 0)
        num_layers = roll.get("num_of_layers", 0)
        roll_number = int(roll.get("roll_number", 1))
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
        _auto_cut_merge_ratio_lines_into_roll_maps(
            roll_id,
            int(num_layers),
            ratios,
            item_id_to_size_id,
            exact_by_roll_size,
            base_by_roll_size,
            frac_by_roll_size,
        )

    return roll_meta, exact_by_roll_size, base_by_roll_size, frac_by_roll_size


def _auto_cut_balance_one_size_across_rolls(
    size_id: int,
    roll_meta: List[Tuple[int, int]],
    roll_qty_by_size: Dict[int, Dict[int, int]],
    exact_by_roll_size: Dict[int, Dict[int, float]],
    frac_by_roll_size: Dict[int, Dict[int, float]],
    expected_from_cut: Dict[int, int],
) -> int:
    base_sum = sum(roll_qty_by_size[rid].get(size_id, 0) for rid, _ in roll_meta)
    expected_total = expected_from_cut.get(size_id)
    if expected_total is None:
        exact_sum = sum(
            exact_by_roll_size.get(rid, {}).get(size_id, 0.0) for rid, _ in roll_meta
        )
        expected_total = int(round(exact_sum))
    diff = int(expected_total) - int(base_sum)

    if diff == 0:
        return int(expected_total)

    remainders = [
        (rid, float(frac_by_roll_size.get(rid, {}).get(size_id, 0.0)))
        for rid, _ in roll_meta
    ]

    if diff > 0:
        remainders.sort(key=lambda x: x[1], reverse=True)
        idx = 0
        d = diff
        while d > 0 and remainders:
            rid, _ = remainders[idx % len(remainders)]
            roll_qty_by_size.setdefault(rid, {})
            roll_qty_by_size[rid][size_id] = int(roll_qty_by_size[rid].get(size_id, 0)) + 1
            d -= 1
            idx += 1
    else:
        to_remove = -diff
        remainders.sort(key=lambda x: x[1])
        idx = 0
        while to_remove > 0 and remainders:
            rid, _ = remainders[idx % len(remainders)]
            cur = int(roll_qty_by_size.get(rid, {}).get(size_id, 0))
            if cur > 0:
                roll_qty_by_size[rid][size_id] = cur - 1
                to_remove -= 1
            idx += 1

    return int(expected_total)


def _auto_cut_apply_rounding_distribution(
    roll_meta: List[Tuple[int, int]],
    roll_qty_by_size: Dict[int, Dict[int, int]],
    exact_by_roll_size: Dict[int, Dict[int, float]],
    frac_by_roll_size: Dict[int, Dict[int, float]],
    expected_from_cut: Dict[int, int],
) -> Dict[int, int]:
    total_size_quantities: Dict[int, int] = {}
    all_size_ids = set()
    for rid in roll_qty_by_size:
        all_size_ids.update(roll_qty_by_size[rid].keys())

    for size_id in all_size_ids:
        total_size_quantities[size_id] = _auto_cut_balance_one_size_across_rolls(
            size_id,
            roll_meta,
            roll_qty_by_size,
            exact_by_roll_size,
            frac_by_roll_size,
            expected_from_cut,
        )

    return total_size_quantities


def _auto_cut_roll_batches_from_quantities(
    roll_meta: List[Tuple[int, int]],
    roll_qty_by_size: Dict[int, Dict[int, int]],
    cut_seq: int,
) -> List[Dict[str, Any]]:
    roll_batches: List[Dict[str, Any]] = []
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
    return roll_batches


def _alloc_serial_auto_cut(
    serial_counters: Dict[Tuple[int, int, int], int],
    db: Session,
    job_order_id: int,
    size_id: int,
    layers_value: int,
    color_id: int,
) -> int:
    key = (size_id, layers_value, color_id)
    if key not in serial_counters:
        existing_count = (
            db.query(models.Batch)
            .filter(
                models.Batch.job_order_id == job_order_id,
                models.Batch.size_id == size_id,
                models.Batch.color_id == color_id,
                models.Batch.layers == layers_value,
            )
            .count()
        )
        serial_counters[key] = existing_count + 1
    else:
        serial_counters[key] += 1
    return serial_counters[key]


def _auto_cut_find_last_batch_same_size_roll(
    batches: List[Dict[str, Any]], size_id: int, roll_number: int
) -> Optional[Dict[str, Any]]:
    for i in range(len(batches) - 1, -1, -1):
        batch_roll = batches[i].get("layers", 0) % LAYERS_ROLL_MOD
        if batches[i].get("size_id") == size_id and batch_roll == roll_number:
            return batches[i]
    return None


def _auto_cut_append_single_barcode_batch(
    batches: List[Dict[str, Any]],
    batch_number: int,
    job_order_id: int,
    color_id: int,
    size_id: int,
    size_value: str,
    quantity: int,
    layers_value: int,
    serial_number: int,
) -> int:
    from ..crud.helpers import generate_barcode_string

    barcode = generate_barcode_string(
        job_order_id, size_id, color_id, layers_value, serial_number
    )
    batches.append(
        {
            "batch": batch_number,
            "size": size_value,
            "quantity": quantity,
            "barcode": barcode,
            "size_id": size_id,
            "serial_number": serial_number,
            "layers": layers_value,
        }
    )
    return batch_number + 1


def _auto_cut_handle_leftover_after_max_splits(
    db: Session,
    batches: List[Dict[str, Any]],
    batch_number: int,
    serial_counters: Dict[Tuple[int, int, int], int],
    job_order_id: int,
    color_id: int,
    size_id: int,
    size_value: str,
    layers_value: int,
    roll_number: int,
    leftover: int,
    extra_pieces_threshold: Optional[int],
) -> int:
    from ..crud.helpers import generate_barcode_string

    if leftover <= 0:
        return batch_number

    merge_eligible = (
        extra_pieces_threshold
        and leftover < extra_pieces_threshold
        and batches
    )
    if merge_eligible:
        last_same = _auto_cut_find_last_batch_same_size_roll(
            batches, size_id, roll_number
        )
        if last_same:
            new_quantity = last_same["quantity"] + leftover
            last_serial = last_same.get("serial_number")
            if not last_serial:
                last_serial = _alloc_serial_auto_cut(
                    serial_counters, db, job_order_id, size_id, layers_value, color_id
                )
            last_same["quantity"] = new_quantity
            last_same["barcode"] = generate_barcode_string(
                job_order_id, size_id, color_id, layers_value, last_serial
            )
            return batch_number

    serial_number = _alloc_serial_auto_cut(
        serial_counters, db, job_order_id, size_id, layers_value, color_id
    )
    return _auto_cut_append_single_barcode_batch(
        batches,
        batch_number,
        job_order_id,
        color_id,
        size_id,
        size_value,
        leftover,
        layers_value,
        serial_number,
    )


def _auto_cut_add_batches_for_roll_quantity(
    db: Session,
    batches: List[Dict[str, Any]],
    batch_number: int,
    serial_counters: Dict[Tuple[int, int, int], int],
    job_order_id: int,
    color_id: int,
    size_id: int,
    size_value: str,
    quantity: int,
    layers_value: int,
    roll_number: int,
    max_batch_size: Optional[int],
    extra_pieces_threshold: Optional[int],
) -> int:
    if quantity <= 0:
        return batch_number

    if max_batch_size and quantity > max_batch_size:
        full_batches = quantity // max_batch_size
        leftover = quantity % max_batch_size
        for _ in range(full_batches):
            serial_number = _alloc_serial_auto_cut(
                serial_counters, db, job_order_id, size_id, layers_value, color_id
            )
            batch_number = _auto_cut_append_single_barcode_batch(
                batches,
                batch_number,
                job_order_id,
                color_id,
                size_id,
                size_value,
                max_batch_size,
                layers_value,
                serial_number,
            )
        return _auto_cut_handle_leftover_after_max_splits(
            db,
            batches,
            batch_number,
            serial_counters,
            job_order_id,
            color_id,
            size_id,
            size_value,
            layers_value,
            roll_number,
            leftover,
            extra_pieces_threshold,
        )

    serial_number = _alloc_serial_auto_cut(
        serial_counters, db, job_order_id, size_id, layers_value, color_id
    )
    return _auto_cut_append_single_barcode_batch(
        batches,
        batch_number,
        job_order_id,
        color_id,
        size_id,
        size_value,
        quantity,
        layers_value,
        serial_number,
    )


def _auto_cut_merge_sub_threshold_size_roll_once(
    batches: List[Dict[str, Any]],
    cut_seq: int,
    extra_pieces_threshold: int,
    db: Session,
    job_order_id: int,
    color_id: int,
    serial_counters: Dict[Tuple[int, int, int], int],
) -> Tuple[List[Dict[str, Any]], bool]:
    from ..crud.helpers import generate_barcode_string

    batches_by_size_roll: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
    for batch in batches:
        size_value = batch.get("size")
        layers_value = batch.get("layers", cut_seq * LAYERS_ROLL_MOD + 1)
        roll_nr = layers_value % LAYERS_ROLL_MOD
        if size_value:
            batches_by_size_roll.setdefault((size_value, roll_nr), []).append(batch)

    merged_any = False
    final_batches: List[Dict[str, Any]] = []

    for _key, size_roll_batches in batches_by_size_roll.items():
        size_roll_batches.sort(key=lambda x: x.get("batch", 0))
        for i, batch in enumerate(size_roll_batches):
            qty = batch.get("quantity", 0)
            if qty < extra_pieces_threshold and qty > 0 and i > 0:
                prev_batch = size_roll_batches[i - 1]
                prev_batch["quantity"] = prev_batch.get("quantity", 0) + qty
                p_size_id = prev_batch.get("size_id")
                p_layers = prev_batch.get("layers", cut_seq * LAYERS_ROLL_MOD + 1)
                serial_number = prev_batch.get("serial_number")
                if not serial_number:
                    serial_number = _alloc_serial_auto_cut(
                        serial_counters,
                        db,
                        job_order_id,
                        p_size_id,
                        p_layers,
                        color_id,
                    )
                    prev_batch["serial_number"] = serial_number
                prev_batch["barcode"] = generate_barcode_string(
                    job_order_id,
                    p_size_id,
                    color_id,
                    p_layers,
                    serial_number,
                )
                merged_any = True
            else:
                final_batches.append(batch)

    return final_batches, merged_any


def _auto_cut_apply_threshold_merging_size_roll_until_stable(
    db: Session,
    batches: List[Dict[str, Any]],
    cut_seq: int,
    extra_pieces_threshold: int,
    job_order_id: int,
    color_id: int,
    serial_counters: Dict[Tuple[int, int, int], int],
) -> List[Dict[str, Any]]:
    current = batches
    for _ in range(10):
        current, merged = _auto_cut_merge_sub_threshold_size_roll_once(
            current,
            cut_seq,
            extra_pieces_threshold,
            db,
            job_order_id,
            color_id,
            serial_counters,
        )
        if not merged:
            break
    return current


def _validate_auto_cut_quantity_integrity(
    total_size_quantities: Dict[int, int],
    batches: List[Dict[str, Any]],
    num_rolls: int,
) -> None:
    final_totals: Dict[int, int] = {}
    for batch in batches:
        sid = batch.get("size_id")
        if sid:
            final_totals[sid] = final_totals.get(sid, 0) + batch.get("quantity", 0)

    for size_id, expected_total in total_size_quantities.items():
        if expected_total <= 0:
            continue
        final_total = final_totals.get(size_id, 0)
        if abs(final_total - expected_total) > 0:
            diff = abs(final_total - expected_total)
            if diff > num_rolls:
                raise ValueError(
                    f"Quantity integrity check failed for size_id {size_id}: "
                    f"expected {expected_total} pieces, got {final_total} pieces. "
                    f"Difference: {final_total - expected_total}. "
                    f"This may indicate pieces were lost during batch creation."
                )


def generate_batches_from_cut(
    db: Session,
    job_order_id: int,
    cut_id: int,
    max_batch_size: Optional[int] = None,
    extra_pieces_threshold: Optional[int] = None,
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
    cut_details, cut_seq, ratios, rolls, color_id = _auto_cut_load_and_validate(
        db, job_order_id, cut_id
    )

    expected_from_cut = _expected_totals_by_size_id_from_cut(cut_details)
    item_id_to_size_id = _build_item_id_to_size_id_for_cut(
        db, ratios, job_order_id, color_id
    )

    roll_meta, exact_by, base_by, frac_by = _auto_cut_accumulate_roll_size_quantities(
        rolls, ratios, item_id_to_size_id
    )
    roll_qty_by_size = {rid: dict(smap) for rid, smap in base_by.items()}
    total_size_quantities = _auto_cut_apply_rounding_distribution(
        roll_meta, roll_qty_by_size, exact_by, frac_by, expected_from_cut
    )
    roll_batches = _auto_cut_roll_batches_from_quantities(
        roll_meta, roll_qty_by_size, cut_seq
    )

    batches: List[Dict[str, Any]] = []
    batch_number = 1
    serial_counters: Dict[Tuple[int, int, int], int] = {}

    for batch_info in roll_batches:
        size_id = batch_info["size_id"]
        quantity = batch_info["quantity"]
        layers_value = batch_info["layers"]
        roll_number = batch_info.get("roll_number", layers_value % LAYERS_ROLL_MOD)
        size = db.query(models.Size).filter(models.Size.size_id == size_id).first()
        if not size:
            continue
        batch_number = _auto_cut_add_batches_for_roll_quantity(
            db,
            batches,
            batch_number,
            serial_counters,
            job_order_id,
            color_id,
            size_id,
            size.size_value,
            quantity,
            layers_value,
            roll_number,
            max_batch_size,
            extra_pieces_threshold,
        )

    if extra_pieces_threshold:
        batches = _auto_cut_apply_threshold_merging_size_roll_until_stable(
            db,
            batches,
            cut_seq,
            extra_pieces_threshold,
            job_order_id,
            color_id,
            serial_counters,
        )

    _renumber_batches_sequential(batches)
    _validate_auto_cut_quantity_integrity(
        total_size_quantities, batches, len(rolls)
    )
    return batches
