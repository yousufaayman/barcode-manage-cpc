from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
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
    model_name: Optional[str] = None,
    closed: Optional[bool] = None,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all job orders with optional filtering"""
    # Build base query
    query = db.query(models.JobOrder)
    
    # Apply filters
    if model_id:
        query = query.filter(models.JobOrder.model_id == model_id)
    if job_order_number:
        query = query.filter(models.JobOrder.job_order_number.ilike(f"%{job_order_number}%"))
    if model_name:
        query = query.join(models.Model).filter(models.Model.model_name.ilike(f"%{model_name}%"))
    if closed is not None:
        query = query.filter(models.JobOrder.closed == closed)

    
    # Get total count before pagination
    total_count = query.count()
    
    # Apply pagination
    job_orders = query.offset(skip).limit(limit).all()
    
    # Get model names for each job order
    result_items = []
    for job_order in job_orders:
        model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
        
        # Get items with color and size information using the proper CRUD function
        items_with_details = crud.get_job_order_items_with_details(db, job_order.job_order_id)
        
        # Calculate total working quantity from batches
        # Get all batches for this job order and sum their quantities
        all_batches = db.query(models.Batch).filter(
            models.Batch.job_order_id == job_order.job_order_id
        ).all()
        
        # Sum up all quantities, excluding None values
        total_working_quantity = sum(batch.quantity for batch in all_batches if batch.quantity is not None)
        
        # Calculate total quantity from job order items
        total_quantity = sum(item["quantity"] for item in items_with_details)
        
        # Calculate completion percentage
        completion_percentage = round((total_working_quantity / total_quantity) * 100) if total_quantity > 0 else 0
        
        # Determine priority for sorting (red entries first)
        is_over_quantity = total_working_quantity > total_quantity
        is_below_threshold = completion_percentage < 97
        priority = 0  # Default priority (lowest)
        
        if is_over_quantity or is_below_threshold:
            priority = 1  # High priority (red entries)
        
        job_order_dict = {
            "job_order_id": job_order.job_order_id,
            "model_id": job_order.model_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "items": items_with_details,
            "total_working_quantity": total_working_quantity,
            "closed": job_order.closed,
            "_priority": priority  # Internal field for sorting
        }
        
        result_items.append(job_order_dict)
    
    # Sort by priority (red entries first), then by job order number
    result_items.sort(key=lambda x: (-x["_priority"], x["job_order_number"]))
    
    # Remove the internal priority field before returning
    for item in result_items:
        item.pop("_priority", None)
    
    return {
        "items": result_items,
        "total": total_count
    }

@router.get("/simple/", response_model=List[Dict])
def read_job_orders_simple(
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all job orders with basic information (for dropdowns)"""
    job_orders = db.query(models.JobOrder).all()
    
    result_items = []
    for job_order in job_orders:
        model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
        result_items.append({
            "job_order_id": job_order.job_order_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None
        })
    
    return result_items

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
    
    # Create the job order
    job_order = crud.create_job_order(db, job_order_in)
    
    # Get model name for response
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    
    # Get items with details
    items_with_details = crud.get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details,
        "closed": job_order.closed
    }

@router.post("/with-names/", response_model=schemas.JobOrder)
def create_job_order_with_names(
    *,
    db: Session = Depends(get_db),
    job_order_in: schemas.JobOrderCreateWithNames,
    current_user: schemas.User = Depends(get_current_user)
):
    """Create a new job order with names, creating models, colors, and sizes if they don't exist"""
    # Check if job order number already exists
    existing_job_order = crud.get_job_order_by_number(db, job_order_number=job_order_in.job_order_number)
    if existing_job_order:
        raise HTTPException(
            status_code=400,
            detail="Job order number already exists"
        )
    
    # Validate that at least one item is provided
    if not job_order_in.items:
        raise HTTPException(
            status_code=400,
            detail="At least one job order item is required"
        )
    
    # Create the job order with names
    job_order = crud.create_job_order_with_names(db, job_order_in)
    
    # Get model name for response
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    
    # Get items with details
    items_with_details = crud.get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details,
        "closed": job_order.closed
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
    
    # Validate items exist (if items are being updated)
    if job_order_in.items:
        for item in job_order_in.items:
            job_order_item = db.query(models.JobOrderItem).filter(
                models.JobOrderItem.item_id == item["item_id"],
                models.JobOrderItem.job_order_id == job_order_id
            ).first()
            if not job_order_item:
                raise HTTPException(
                    status_code=400,
                    detail=f"Job order item with ID {item['item_id']} not found"
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
        "items": items_with_details,
        "closed": job_order.closed
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

@router.get("/options/colors", response_model=List[str])
def get_existing_colors(
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all existing color names for dropdown options"""
    colors = db.query(models.Color).order_by(models.Color.color_name).all()
    return [color.color_name for color in colors]

@router.get("/options/sizes", response_model=List[str])
def get_existing_sizes(
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all existing size values for dropdown options"""
    sizes = db.query(models.Size).order_by(models.Size.size_value).all()
    return [size.size_value for size in sizes]

@router.get("/options/models", response_model=List[str])
def get_existing_models(
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all existing model names for dropdown options"""
    model_list = db.query(models.Model).order_by(models.Model.model_name).all()
    return [model.model_name for model in model_list] 