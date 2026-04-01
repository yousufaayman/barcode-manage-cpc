from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.crud import get_rejection, get_rejections, create_rejection, update_rejection, delete_rejection
from app import models, schemas
from app.core.deps import get_db, get_current_active_user, get_current_active_superuser

router = APIRouter()


@router.post("/", response_model=schemas.SingleRejection)
def create_rejection_endpoint(
    rejection: schemas.SingleRejectionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    try:
        return create_rejection(db=db, rejection=rejection, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[schemas.SingleRejection])
def get_rejections_endpoint(
    batch_id: Optional[int] = None,
    phase_id: Optional[int] = None,
    is_resolved: Optional[bool] = None,
    job_order_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    return get_rejections(
        db=db,
        batch_id=batch_id,
        phase_id=phase_id,
        is_resolved=is_resolved,
        job_order_id=job_order_id,
        skip=skip,
        limit=limit
    )


@router.get("/{rejection_id}", response_model=schemas.SingleRejection)
def get_rejection_endpoint(
    rejection_id: int,
    db: Session = Depends(get_db)
):
    rejection = get_rejection(db, rejection_id)
    if not rejection:
        raise HTTPException(status_code=404, detail="Rejection not found")
    return rejection


@router.patch("/{rejection_id}", response_model=schemas.SingleRejection)
def update_rejection_endpoint(
    rejection_id: int,
    rejection_update: schemas.SingleRejectionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    rejection = update_rejection(db=db, rejection_id=rejection_id, rejection_update=rejection_update, user_id=current_user.id)
    if not rejection:
        raise HTTPException(status_code=404, detail="Rejection not found")
    return rejection


@router.patch("/{rejection_id}/resolve", response_model=schemas.SingleRejection)
def resolve_rejection_endpoint(
    rejection_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    rejection_update = schemas.SingleRejectionUpdate(is_resolved=True)
    rejection = update_rejection(db=db, rejection_id=rejection_id, rejection_update=rejection_update, user_id=current_user.id)
    if not rejection:
        raise HTTPException(status_code=404, detail="Rejection not found")
    return rejection


@router.delete("/{rejection_id}")
def delete_rejection_endpoint(
    rejection_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_superuser)
):
    rejection = delete_rejection(db=db, rejection_id=rejection_id)
    if not rejection:
        raise HTTPException(status_code=404, detail="Rejection not found")
    return {"message": "Rejection deleted successfully"}

