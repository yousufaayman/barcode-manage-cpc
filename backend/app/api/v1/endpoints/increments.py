from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.crud import get_increment, get_increments, create_increment, update_increment, delete_increment
from app import models, schemas
from app.core.deps import get_db, get_current_active_user, get_current_active_superuser

router = APIRouter()


@router.post("/", response_model=schemas.SingleIncrement)
def create_increment_endpoint(
    increment: schemas.SingleIncrementCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    try:
        return create_increment(db=db, increment=increment, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[schemas.SingleIncrement])
def get_increments_endpoint(
    batch_id: Optional[int] = None,
    phase_id: Optional[int] = None,
    job_order_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    return get_increments(
        db=db,
        batch_id=batch_id,
        phase_id=phase_id,
        job_order_id=job_order_id,
        skip=skip,
        limit=limit
    )


@router.get("/{increment_id}", response_model=schemas.SingleIncrement)
def get_increment_endpoint(
    increment_id: int,
    db: Session = Depends(get_db)
):
    increment = get_increment(db, increment_id)
    if not increment:
        raise HTTPException(status_code=404, detail="Increment not found")
    return increment


@router.patch("/{increment_id}", response_model=schemas.SingleIncrement)
def update_increment_endpoint(
    increment_id: int,
    increment_update: schemas.SingleIncrementUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    increment = update_increment(db=db, increment_id=increment_id, increment_update=increment_update, user_id=current_user.id)
    if not increment:
        raise HTTPException(status_code=404, detail="Increment not found")
    return increment


@router.delete("/{increment_id}")
def delete_increment_endpoint(
    increment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser)
):
    increment = delete_increment(db=db, increment_id=increment_id)
    if not increment:
        raise HTTPException(status_code=404, detail="Increment not found")
    return {"message": "Increment deleted successfully"}

