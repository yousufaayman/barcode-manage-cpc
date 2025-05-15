from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import crud, models, schemas
from app.core.deps import get_db
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/", response_model=List[schemas.BatchResponse])
def read_batches(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
):
    """Get all batches"""
    batches = crud.get_batches(db, skip=skip, limit=limit)
    return batches

@router.get("/{batch_id}", response_model=schemas.BatchResponse)
def read_batch(
    batch_id: int,
    db: Session = Depends(get_db),
):
    """Get a specific batch by ID"""
    db_batch = crud.get_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.post("/", response_model=schemas.BatchResponse)
def create_batch(
    *,
    db: Session = Depends(get_db),
    batch_in: schemas.BatchCreate,
):
    """Create a new batch"""
    batch = crud.create_batch(db=db, batch=batch_in)
    return batch

@router.put("/{batch_id}", response_model=schemas.BatchResponse)
def update_batch(
    batch_id: int,
    batch_in: schemas.BatchUpdate,
    db: Session = Depends(get_db)
):
    logger.info(f"Received update request for batch {batch_id}")
    logger.info(f"Update data: {batch_in.dict()}")
    
    db_batch = crud.get_batch(db, batch_id)
    if not db_batch:
        logger.error(f"Batch {batch_id} not found")
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.batch_id == batch_id).first()
    if not db_batch_model:
        logger.error(f"Batch model {batch_id} not found")
        raise HTTPException(status_code=404, detail="Batch not found")
    
    try:
        # Update the batch
        logger.info("Attempting to update batch")
        updated_batch = crud.update_batch(db=db, db_batch=db_batch_model, batch=batch_in)
        logger.info(f"Successfully updated batch {batch_id}")
        return updated_batch
    except Exception as e:
        logger.error(f"Error updating batch {batch_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{batch_id}", response_model=schemas.BatchResponse)
def delete_batch(
    *,
    db: Session = Depends(get_db),
    batch_id: int,
):
    """Delete a batch"""
    db_batch = crud.get_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    batch = crud.delete_batch(db=db, batch_id=batch_id)
    return batch

@router.get("/barcode/{barcode}", response_model=schemas.BatchResponse)
def read_batch_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
):
    """Get a specific batch by barcode"""
    db_batch = crud.get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.put("/barcode/{barcode}", response_model=schemas.BatchResponse)
def update_batch_by_barcode(
    barcode: str,
    batch_in: schemas.BatchUpdate,
    db: Session = Depends(get_db)
):
    """Update a batch by barcode"""
    db_batch = crud.get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get the SQLAlchemy model instance
    db_batch_model = db.query(models.Batch).filter(models.Batch.barcode == barcode).first()
    if not db_batch_model:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    try:
        updated_batch = crud.update_batch(db=db, db_batch=db_batch_model, batch=batch_in)
        return updated_batch
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 