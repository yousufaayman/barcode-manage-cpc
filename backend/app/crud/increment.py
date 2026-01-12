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
    
    if db_batch.current_phase != increment.incremented_in_phase_id:
        raise ValueError(f"Batch is not in phase {increment.incremented_in_phase_id}. Current phase: {db_batch.current_phase}")
    
    phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == increment.incremented_in_phase_id
    ).first()
    
    if not phase:
        raise ValueError(f"Phase {increment.incremented_in_phase_id} not found")
    
    phase_type = phase.type or 'unknown'
    
    db_increment = models.SingleIncrement(
        batch_id=increment.batch_id,
        incremented_in_phase_id=increment.incremented_in_phase_id,
        incremented_in_phase_type=phase_type,
        quantity=increment.quantity,
        increment_reason=increment.increment_reason,
        incremented_by_user_id=user_id,
        status_at_increment=db_batch.status
    )
    
    db.add(db_increment)
    
    if commit:
        db.commit()
        db.refresh(db_increment)
    
    if not commit:
        db.flush()
    
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
        query = query.filter(models.SingleIncrement.incremented_in_phase_id == phase_id)
    
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
    
    if increment_update.increment_reason is not None:
        db_increment.increment_reason = increment_update.increment_reason
    
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

