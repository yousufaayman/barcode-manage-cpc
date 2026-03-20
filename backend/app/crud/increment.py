from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List, Optional
from .. import models, schemas
from datetime import datetime


def create_increment(db: Session, increment: schemas.SingleIncrementCreate, user_id: Optional[int] = None, commit: bool = True):
    db_batch = db.query(models.Batch).filter(
        models.Batch.batch_id == increment.batch_id
    ).with_for_update().first()
    
    if not db_batch:
        raise ValueError(f"Batch {increment.batch_id} not found")
    
    increment_type = getattr(increment, 'increment_type', 'rejection_resolution')
    
    # Validate that rejection_resolution requires incremented_from_phase_id
    if increment_type == 'rejection_resolution' and not increment.incremented_from_phase_id:
        raise ValueError("incremented_from_phase_id is required when increment_type is 'rejection_resolution'")
    
    from_phase_type = None
    to_phase_type = None
    
    if increment.incremented_from_phase_id:
        from_phase = db.query(models.ProductionPhase).filter(
            models.ProductionPhase.phase_id == increment.incremented_from_phase_id
        ).first()
        if from_phase:
            from_phase_type = from_phase.type or 'unknown'
    
    if increment.incremented_to_phase_id:
        to_phase = db.query(models.ProductionPhase).filter(
            models.ProductionPhase.phase_id == increment.incremented_to_phase_id
        ).first()
        if to_phase:
            to_phase_type = to_phase.type or 'unknown'
    
    db_increment = models.SingleIncrement(
        batch_id=increment.batch_id,
        incremented_from_phase_id=increment.incremented_from_phase_id,
        incremented_to_phase_id=increment.incremented_to_phase_id,
        incremented_from_phase_type=from_phase_type,
        incremented_to_phase_type=to_phase_type,
        responsible_daily_assignment_id=increment.responsible_daily_assignment_id,
        quantity=increment.quantity,
        increment_type=increment_type,
        incremented_by_user_id=user_id,
        status_at_increment=db_batch.status
    )
    
    db.add(db_increment)
    
    if not commit:
        db.flush()
    
    if increment_type == 'rejection_resolution' and increment.incremented_from_phase_id:
        db.execute(
            text("""
                SELECT ops.apply_rejection_resolution_increment(
                    :batch_id,
                    :incremented_from_phase_id,
                    :quantity,
                    CAST(:status_at_increment AS VARCHAR(50))
                )
            """),
            {
                "batch_id": increment.batch_id,
                "incremented_from_phase_id": increment.incremented_from_phase_id,
                "quantity": increment.quantity,
                "status_at_increment": db_batch.status
            }
        )
        # When resolving from a sewing phase, update production_history for the selected stage
        if from_phase_type and from_phase_type.lower() == 'sewing' and increment.responsible_daily_assignment_id:
            ph_row = db.query(models.ProductionHistory).filter(
                models.ProductionHistory.daily_assignment_id == increment.responsible_daily_assignment_id,
                models.ProductionHistory.batch_id == increment.batch_id,
            ).with_for_update().first()
            if ph_row:
                ph_row.quantity_produced = ph_row.quantity_produced + increment.quantity
            else:
                new_row = models.ProductionHistory(
                    daily_assignment_id=increment.responsible_daily_assignment_id,
                    batch_id=increment.batch_id,
                    quantity_produced=increment.quantity,
                )
                db.add(new_row)
    
    if commit:
        db.commit()
        db.refresh(db_increment)
    
    db.refresh(db_increment)
    db_increment_with_batch = db.query(models.SingleIncrement).options(
        joinedload(models.SingleIncrement.batch)
    ).filter(
        models.SingleIncrement.increment_id == db_increment.increment_id
    ).first()
    return db_increment_with_batch if db_increment_with_batch else db_increment


def get_increment(db: Session, increment_id: int):
    return db.query(models.SingleIncrement).options(
        joinedload(models.SingleIncrement.batch)
    ).filter(
        models.SingleIncrement.increment_id == increment_id
    ).first()


def get_increments(
    db: Session,
    batch_id: Optional[int] = None,
    phase_id: Optional[int] = None,
    job_order_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100
):
    query = db.query(models.SingleIncrement)
    
    if batch_id:
        query = query.filter(models.SingleIncrement.batch_id == batch_id)
    
    if phase_id:
        query = query.filter(
            (models.SingleIncrement.incremented_from_phase_id == phase_id) |
            (models.SingleIncrement.incremented_to_phase_id == phase_id)
        )
    
    if job_order_id:
        query = query.join(models.Batch).filter(models.Batch.job_order_id == job_order_id)
    
    query = query.options(joinedload(models.SingleIncrement.batch))
    return query.order_by(models.SingleIncrement.incremented_at.desc()).offset(skip).limit(limit).all()


def update_increment(
    db: Session,
    increment_id: int,
    increment_update: schemas.SingleIncrementUpdate,
    user_id: Optional[int] = None
):
    db_increment = get_increment(db, increment_id)
    if not db_increment:
        return None
    
    db_batch = db.query(models.Batch).filter(models.Batch.batch_id == db_increment.batch_id).first()
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
    db.refresh(db_increment)
    db_increment_with_batch = db.query(models.SingleIncrement).options(
        joinedload(models.SingleIncrement.batch)
    ).filter(
        models.SingleIncrement.increment_id == db_increment.increment_id
    ).first()
    return db_increment_with_batch if db_increment_with_batch else db_increment


def delete_increment(db: Session, increment_id: int):
    db_increment = get_increment(db, increment_id)
    if not db_increment:
        return None
    
    db_batch = db.query(models.Batch).filter(models.Batch.batch_id == db_increment.batch_id).first()
    job_order_id = db_batch.job_order_id if db_batch else None
    
    db.delete(db_increment)
    
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
    return db_increment

