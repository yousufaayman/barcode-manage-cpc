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
            last_updated_at=batch.Batch.last_updated_at
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
            last_updated_at=batch.Batch.last_updated_at
        )
        for batch in batches
    ]

def create_timeline_entry(db: Session, batch_id: int, status: str, phase_id: int):
    entry = models.BarcodeStatusTimeline(
        batch_id=batch_id,
        status=status,
        phase_id=phase_id,
        start_time=datetime.utcnow(),
        end_time=None,
        duration_minutes=None
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

def close_current_timeline_entry(db: Session, batch_id: int):
    current = db.query(models.BarcodeStatusTimeline).filter(
        models.BarcodeStatusTimeline.batch_id == batch_id,
        models.BarcodeStatusTimeline.end_time.is_(None)
    ).first()
    if current:
        current.end_time = datetime.utcnow()
        current.duration_minutes = int((current.end_time - current.start_time).total_seconds() // 60)
        db.commit()
        db.refresh(current)
    return current

def get_timeline_by_batch(db: Session, batch_id: int):
    return db.query(models.BarcodeStatusTimeline).filter(
        models.BarcodeStatusTimeline.batch_id == batch_id
    ).order_by(models.BarcodeStatusTimeline.start_time).all()

def get_timeline_stats_by_batch(db: Session, batch_id: int):
    results = db.query(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes)
    ).filter(
        models.BarcodeStatusTimeline.batch_id == batch_id
    ).group_by(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status
    ).all()
    return results

def get_current_timeline_entries(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.BarcodeStatusTimeline).filter(
        models.BarcodeStatusTimeline.end_time.is_(None)
    ).offset(skip).limit(limit).all()

def get_all_timeline_stats(db: Session):
    results = db.query(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status,
        sa_func.avg(models.BarcodeStatusTimeline.duration_minutes)
    ).group_by(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status
    ).all()
    return results

def create_batch(db: Session, batch: schemas.BatchCreate):
    db_batch = models.Batch(**batch.dict())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch

def update_batch(db: Session, db_batch: models.Batch, batch: schemas.BatchUpdate):
    update_data = batch.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_batch, field, value)
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
        brand_name=brand.brand_name if brand else "",
        model_name=model.model_name if model else "",
        size_value=size.size_value if size else "",
        color_name=color.color_name if color else "",
        phase_name=phase.phase_name if phase else "",
        last_updated_at=db_batch.last_updated_at,
        archived_at=None
    )

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
        db.query(models.BarcodeStatusTimeline).filter(
            models.BarcodeStatusTimeline.batch_id == batch_id
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