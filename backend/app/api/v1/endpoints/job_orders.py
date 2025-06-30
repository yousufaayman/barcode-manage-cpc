from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from pydantic import BaseModel
from app import crud, models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user, get_optional_current_user

router = APIRouter()

class JobOrderListResponse(BaseModel):
    items: List[schemas.JobOrder]
    total: int

@router.get("/", response_model=JobOrderListResponse)
def read_job_orders(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    model_id: Optional[int] = None,
    job_order_number: Optional[str] = None,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all job orders with optional filtering"""
    job_orders = crud.get_job_orders(db, skip=skip, limit=limit)
    
    # Apply filters if provided
    if model_id:
        job_orders = [jo for jo in job_orders if jo.model_id == model_id]
    if job_order_number:
        job_orders = [jo for jo in job_orders if job_order_number.lower() in jo.job_order_number.lower()]
    
    # Get model names for each job order
    result_items = []
    for job_order in job_orders:
        model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
        job_order_dict = {
            "job_order_id": job_order.job_order_id,
            "model_id": job_order.model_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "items": []
        }
        
        # Get items with color information
        for item in job_order.items:
            color = db.query(models.Color).filter(models.Color.color_id == item.color_id).first()
            job_order_dict["items"].append({
                "item_id": item.item_id,
                "color_id": item.color_id,
                "color_name": color.color_name if color else None,
                "quantity": item.quantity
            })
        
        result_items.append(job_order_dict)
    
    return {
        "items": result_items,
        "total": len(result_items)
    }

@router.get("/{job_order_id}", response_model=schemas.JobOrder)
def read_job_order(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific job order by ID"""
    job_order = crud.get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Get model name
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    
    # Get items with color and size information
    items_with_details = crud.get_job_order_items_with_details(db, job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details
    }

@router.get("/number/{job_order_number}", response_model=schemas.JobOrder)
def read_job_order_by_number(
    job_order_number: str,
    db: Session = Depends(get_db)
):
    """Get a specific job order by job order number"""
    job_order = crud.get_job_order_by_number(db, job_order_number=job_order_number)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Get model name
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    
    # Get items with color and size information
    items_with_details = crud.get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details
    }

@router.post("/", response_model=schemas.JobOrder)
def create_job_order(
    *,
    db: Session = Depends(get_db),
    job_order_in: schemas.JobOrderCreate,
    current_user: schemas.User = Depends(get_current_user)
):
    """Create a new job order"""
    # Check if job order number already exists
    existing_job_order = crud.get_job_order_by_number(db, job_order_number=job_order_in.job_order_number)
    if existing_job_order:
        raise HTTPException(
            status_code=400,
            detail="Job order number already exists"
        )
    
    # Validate model exists
    model = db.query(models.Model).filter(models.Model.model_id == job_order_in.model_id).first()
    if not model:
        raise HTTPException(
            status_code=400,
            detail="Model not found"
        )
    
    # Validate colors and sizes exist
    for item in job_order_in.items:
        color = db.query(models.Color).filter(models.Color.color_id == item.color_id).first()
        if not color:
            raise HTTPException(
                status_code=400,
                detail=f"Color with ID {item.color_id} not found"
            )
        
        size = db.query(models.Size).filter(models.Size.size_id == item.size_id).first()
        if not size:
            raise HTTPException(
                status_code=400,
                detail=f"Size with ID {item.size_id} not found"
            )
    
    job_order = crud.create_job_order(db, job_order=job_order_in)
    
    # Return with model name and color/size names
    items_with_details = crud.get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name,
        "items": items_with_details
    }

@router.put("/{job_order_id}", response_model=schemas.JobOrder)
def update_job_order(
    job_order_id: int,
    job_order_in: schemas.JobOrderUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update a job order"""
    # Check if job order exists
    existing_job_order = crud.get_job_order(db, job_order_id=job_order_id)
    if not existing_job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Check if new job order number already exists (if being updated)
    if job_order_in.job_order_number and job_order_in.job_order_number != existing_job_order.job_order_number:
        duplicate_job_order = crud.get_job_order_by_number(db, job_order_number=job_order_in.job_order_number)
        if duplicate_job_order:
            raise HTTPException(
                status_code=400,
                detail="Job order number already exists"
            )
    
    # Validate model exists (if being updated)
    if job_order_in.model_id:
        model = db.query(models.Model).filter(models.Model.model_id == job_order_in.model_id).first()
        if not model:
            raise HTTPException(
                status_code=400,
                detail="Model not found"
            )
    
    # Validate colors and sizes exist (if items are being updated)
    if job_order_in.items:
        for item in job_order_in.items:
            color = db.query(models.Color).filter(models.Color.color_id == item.color_id).first()
            if not color:
                raise HTTPException(
                    status_code=400,
                    detail=f"Color with ID {item.color_id} not found"
                )
            
            size = db.query(models.Size).filter(models.Size.size_id == item.size_id).first()
            if not size:
                raise HTTPException(
                    status_code=400,
                    detail=f"Size with ID {item.size_id} not found"
                )
    
    job_order = crud.update_job_order(db, job_order_id=job_order_id, job_order_update=job_order_in)
    
    # Return with model name and color/size names
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    items_with_details = crud.get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details
    }

@router.delete("/{job_order_id}")
def delete_job_order(
    job_order_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Delete a job order"""
    success = crud.delete_job_order(db, job_order_id=job_order_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    return {"message": "Job order deleted successfully"}

@router.get("/{job_order_id}/summary", response_model=schemas.JobOrderSummary)
def get_job_order_summary(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get job order summary with totals"""
    summary = crud.get_job_order_summary(db, job_order_id=job_order_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    return summary

@router.get("/model/{model_id}", response_model=List[schemas.JobOrder])
def read_job_orders_by_model(
    model_id: int,
    db: Session = Depends(get_db)
):
    """Get all job orders for a specific model"""
    job_orders = crud.get_job_orders_by_model(db, model_id=model_id)
    
    # Get model name
    model = db.query(models.Model).filter(models.Model.model_id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    result_items = []
    for job_order in job_orders:
        items_with_details = crud.get_job_order_items_with_details(db, job_order.job_order_id)
        result_items.append({
            "job_order_id": job_order.job_order_id,
            "model_id": job_order.model_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name,
            "items": items_with_details
        })
    
    return result_items

@router.get("/{job_order_id}/production-tracking")
def get_job_order_production_tracking(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get production tracking data for a job order"""
    # Check if job order exists
    job_order = crud.get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    tracking_data = crud.get_job_order_production_tracking(db, job_order_id)
    return {
        "job_order_id": job_order_id,
        "job_order_number": job_order.job_order_number,
        "tracking_data": tracking_data
    }

@router.get("/{job_order_id}/overall-status")
def get_job_order_overall_status(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get overall production status for a job order"""
    # Check if job order exists
    job_order = crud.get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    status_data = crud.get_job_order_overall_status(db, job_order_id)
    if not status_data:
        raise HTTPException(status_code=404, detail="Job order status not found")
    
    return status_data 