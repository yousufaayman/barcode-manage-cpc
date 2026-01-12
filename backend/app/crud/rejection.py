from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, func, case
from typing import List, Optional
from .. import models, schemas
from datetime import datetime


def create_rejection(db: Session, rejection: schemas.SingleRejectionCreate, user_id: Optional[int] = None, commit: bool = True):
    db_batch = db.query(models.Batch).filter(
        models.Batch.batch_id == rejection.batch_id
    ).with_for_update().first()
    
    if not db_batch:
        raise ValueError(f"Batch {rejection.batch_id} not found")
    
    if rejection.quantity > db_batch.quantity:
        raise ValueError(f"Rejection quantity ({rejection.quantity}) cannot exceed batch quantity ({db_batch.quantity})")
    
    if db_batch.current_phase != rejection.rejected_from_phase_id:
        raise ValueError(f"Batch is not in phase {rejection.rejected_from_phase_id}. Current phase: {db_batch.current_phase}")
    
    phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == rejection.rejected_from_phase_id
    ).first()
    
    if not phase:
        raise ValueError(f"Phase {rejection.rejected_from_phase_id} not found")
    
    phase_type = phase.type or 'unknown'
    
    db_rejection = models.SingleRejection(
        batch_id=rejection.batch_id,
        rejected_from_phase_id=rejection.rejected_from_phase_id,
        rejected_from_phase_type=phase_type,
        return_to_phase_id=rejection.return_to_phase_id,
        quantity=rejection.quantity,
        rejection_reason=rejection.rejection_reason,
        rejected_by_user_id=user_id,
        status_at_rejection=db_batch.status,
        is_resolved=False
    )
    
    db.add(db_rejection)
    
    if not commit:
        db.flush()
    
    if rejection.return_to_phase_id:
        db.execute(
            text("""
                SELECT ops.update_batch_phase_history_on_rejection(
                    :batch_id,
                    :rejected_from_phase_id,
                    :return_to_phase_id,
                    :quantity
                )
            """),
            {
                "batch_id": rejection.batch_id,
                "rejected_from_phase_id": rejection.rejected_from_phase_id,
                "return_to_phase_id": rejection.return_to_phase_id,
                "quantity": rejection.quantity
            }
        )
    
    if commit:
        db.commit()
        db.refresh(db_rejection)
    
    if not commit:
        db.flush()
    
    db.refresh(db_rejection)
    db_rejection_with_batch = db.query(models.SingleRejection).options(
        joinedload(models.SingleRejection.batch)
    ).filter(
        models.SingleRejection.rejection_id == db_rejection.rejection_id
    ).first()
    return db_rejection_with_batch if db_rejection_with_batch else db_rejection


def get_rejection(db: Session, rejection_id: int):
    return db.query(models.SingleRejection).options(
        joinedload(models.SingleRejection.batch)
    ).filter(
        models.SingleRejection.rejection_id == rejection_id
    ).first()


def get_rejections(
    db: Session,
    batch_id: Optional[int] = None,
    phase_id: Optional[int] = None,
    is_resolved: Optional[bool] = None,
    job_order_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100
):
    query = db.query(models.SingleRejection)
    
    if batch_id:
        query = query.filter(models.SingleRejection.batch_id == batch_id)
    
    if phase_id:
        query = query.filter(models.SingleRejection.rejected_from_phase_id == phase_id)
    
    if is_resolved is not None:
        query = query.filter(models.SingleRejection.is_resolved == is_resolved)
    
    if job_order_id:
        query = query.join(models.Batch).filter(models.Batch.job_order_id == job_order_id)
    
    query = query.options(joinedload(models.SingleRejection.batch))
    return query.order_by(models.SingleRejection.rejected_at.desc()).offset(skip).limit(limit).all()


def update_rejection(
    db: Session,
    rejection_id: int,
    rejection_update: schemas.SingleRejectionUpdate,
    user_id: Optional[int] = None
):
    db_rejection = get_rejection(db, rejection_id)
    if not db_rejection:
        return None
    
    if rejection_update.return_to_phase_id is not None:
        db_rejection.return_to_phase_id = rejection_update.return_to_phase_id
    
    if rejection_update.rejection_reason is not None:
        db_rejection.rejection_reason = rejection_update.rejection_reason
    
    if rejection_update.is_resolved is not None:
        db_rejection.is_resolved = rejection_update.is_resolved
        if rejection_update.is_resolved:
            if not db_rejection.resolved_at:
                db_rejection.resolved_at = datetime.now()
            
            if rejection_update.resolved_quantity is not None:
                if rejection_update.resolved_quantity > db_rejection.quantity:
                    raise ValueError(f"Resolved quantity ({rejection_update.resolved_quantity}) cannot exceed rejection quantity ({db_rejection.quantity})")
                db_rejection.resolved_quantity = rejection_update.resolved_quantity
            elif db_rejection.resolved_quantity is None:
                db_rejection.resolved_quantity = db_rejection.quantity
        else:
            db_rejection.resolved_at = None
            db_rejection.resolved_quantity = None
    
    if rejection_update.resolved_quantity is not None:
        if rejection_update.resolved_quantity > db_rejection.quantity:
            raise ValueError(f"Resolved quantity ({rejection_update.resolved_quantity}) cannot exceed rejection quantity ({db_rejection.quantity})")
        if not db_rejection.is_resolved:
            raise ValueError("Cannot set resolved_quantity on unresolved rejection")
        db_rejection.resolved_quantity = rejection_update.resolved_quantity
    
    db_batch = db.query(models.Batch).filter(models.Batch.batch_id == db_rejection.batch_id).first()
    if db_batch:
        db.execute(
            text("""
                INSERT INTO reporting.summary_refresh_queue (job_order_id, needs_refresh, changed_at)
                VALUES (:job_order_id, TRUE, NOW())
                ON CONFLICT (job_order_id) DO UPDATE
                    SET needs_refresh = TRUE,
                        changed_at = NOW()
            """),
            {"job_order_id": db_batch.job_order_id}
        )
    
    db.commit()
    db.refresh(db_rejection)
    db_rejection_with_batch = db.query(models.SingleRejection).options(
        joinedload(models.SingleRejection.batch)
    ).filter(
        models.SingleRejection.rejection_id == db_rejection.rejection_id
    ).first()
    return db_rejection_with_batch if db_rejection_with_batch else db_rejection


def resolve_rejection(db: Session, rejection_id: int, user_id: Optional[int] = None):
    return update_rejection(
        db=db,
        rejection_id=rejection_id,
        rejection_update=schemas.SingleRejectionUpdate(is_resolved=True),
        user_id=user_id
    )


def delete_rejection(db: Session, rejection_id: int):
    db_rejection = get_rejection(db, rejection_id)
    if not db_rejection:
        return None
    
    db_batch = db.query(models.Batch).filter(models.Batch.batch_id == db_rejection.batch_id).first()
    job_order_id = db_batch.job_order_id if db_batch else None
    
    db.delete(db_rejection)
    
    if job_order_id:
        db.execute(
            text("""
                INSERT INTO reporting.summary_refresh_queue (job_order_id, needs_refresh, changed_at)
                VALUES (:job_order_id, TRUE, NOW())
                ON CONFLICT (job_order_id) DO UPDATE
                    SET needs_refresh = TRUE,
                        changed_at = NOW()
            """),
            {"job_order_id": job_order_id}
        )
    
    db.commit()
    return db_rejection


def create_scan_event(
    db: Session,
    batch_id: int,
    action_type: str,
    phase_id: int,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    old_quantity: Optional[int] = None,
    new_quantity: Optional[int] = None,
    old_phase: Optional[int] = None,
    new_phase: Optional[int] = None,
    user_id: Optional[int] = None,
    notes: Optional[str] = None
):
    """
    Create scan event - delegates to batch.create_scan_event for Phase 2 ledger support.
    """
    from .batch import create_scan_event as batch_create_scan_event
    return batch_create_scan_event(
        db=db,
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

