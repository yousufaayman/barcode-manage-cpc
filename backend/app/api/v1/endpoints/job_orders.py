from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, text
from typing import List, Dict, Optional
from pydantic import BaseModel
from app.crud import *
from app import models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user, get_optional_current_user
from app.crud.job_order import update_job_order as crud_update_job_order, create_job_order_with_names as crud_create_job_order_with_names
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import os
from app.core.config import settings
import json
import re
from app.crud.job_order import get_job_order_materials

router = APIRouter()

class JobOrderListResponse(BaseModel):
    items: List[schemas.JobOrder]
    total: int

class JobOrderSummaryListResponse(BaseModel):
    items: List[schemas.JobOrderSummary]
    total: int

# Mount static files for images
app = FastAPI()
image_upload_dir = os.path.abspath(settings.JOB_ORDER_IMAGE_UPLOAD_DIR)
# Expose the directory exactly as provided at the '/static' route for serving, but *do not* modify the
# stored path.  The env variable is assumed to be an absolute filesystem path (e.g. "S:\\...\\static").
app.mount("/static", StaticFiles(directory=image_upload_dir), name="job_order_images")

@router.get("/", response_model=JobOrderListResponse)
def read_job_orders(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    model_id: Optional[int] = None,
    job_order_number: Optional[str] = None,
    model_name: Optional[str] = None,
    brand_name: Optional[str] = None,
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
    if brand_name:
        query = query.join(models.Brand, models.JobOrder.brand_id == models.Brand.brand_id).filter(models.Brand.brand_name.ilike(f"%{brand_name}%"))

    
    # Get total count before pagination
    total_count = query.count()
    
    # Apply pagination
    job_orders = query.offset(skip).limit(limit).all()
    
    # Get model names for each job order
    result_items = []
    for job_order in job_orders:
        model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
        brand = db.query(models.Brand).filter(models.Brand.brand_id == job_order.brand_id).first() if job_order.brand_id else None
        
        # Get items with color and size information using the proper CRUD function
        items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
        
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
        priority = 1 if is_over_quantity or is_below_threshold else 0
        
        # Get all batches for this job order (for progress bar)
        all_batches = db.query(models.Batch).filter(
            models.Batch.job_order_id == job_order.job_order_id
        ).all()
        # Minimal batch info for progress
        batches_min = [{"status": batch.status} for batch in all_batches]
        
        job_order_dict = {
            "job_order_id": job_order.job_order_id,
            "model_id": job_order.model_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "brand_id": job_order.brand_id,
            "brand_name": brand.brand_name if brand else None,
            "items": items_with_details,
            "total_working_quantity": total_working_quantity,
            "batches": batches_min,
            "image_url": job_order.image_url,
            "prints": job_order.prints,
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
        brand = db.query(models.Brand).filter(models.Brand.brand_id == job_order.brand_id).first() if job_order.brand_id else None
        result_items.append({
            "job_order_id": job_order.job_order_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "brand_name": brand.brand_name if brand else None
        })
    return result_items

@router.get("/{job_order_id}", response_model=schemas.JobOrder)
def read_job_order(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific job order by ID"""
    job_order = get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Get model name
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    
    # Get brand name
    brand = db.query(models.Brand).filter(models.Brand.brand_id == job_order.brand_id).first() if job_order.brand_id else None
    
    # Get items with color and size information
    items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "brand_id": job_order.brand_id,
        "brand_name": brand.brand_name if brand else None,
        "items": items_with_details,
        "image_url": job_order.image_url,
        "notes": job_order.notes,
        "prints": job_order.prints,
        "date_created": job_order.date_created
    }

@router.get("/number/{job_order_number}", response_model=schemas.JobOrder)
def read_job_order_by_number(
    job_order_number: str,
    db: Session = Depends(get_db)
):
    """Get a specific job order by job order number"""
    job_order = get_job_order_by_number(db, job_order_number=job_order_number)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Get model name
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()

    # Get brand name
    brand = db.query(models.Brand).filter(models.Brand.brand_id == job_order.brand_id).first() if job_order.brand_id else None
    
    # Get items with color and size information
    items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "brand_id": job_order.brand_id,
        "brand_name": brand.brand_name if brand else None,
        "items": items_with_details,
        "image_url": job_order.image_url,
        "notes": job_order.notes,
        "prints": job_order.prints
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
    existing_job_order = get_job_order_by_number(db, job_order_number=job_order_in.job_order_number)
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
    job_order = create_job_order(db, job_order_in)
    
    # Get model name for response
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    
    # Get items with details
    items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details,
        "prints": job_order.prints,
        "notes": job_order.notes
    }

@router.post("/with-names/", response_model=schemas.JobOrder)
async def create_job_order_with_names(
    db: Session = Depends(get_db),
    job_order_number: str = Form(...),
    model_name: str = Form(...),
    brand_name: str = Form(...),
    items: str = Form(...),  # Expect JSON stringified list
    materials: str = Form('[]'),
    prints: str = Form('{}'),
    notes: str = Form(None),
    image: UploadFile = File(None),
    current_user: schemas.User = Depends(get_current_user)
):
    """Create a new job order with names, creating models, colors, and sizes if they don't exist, and handle image upload."""
    # Check if job order number already exists
    existing_job_order = get_job_order_by_number(db, job_order_number=job_order_number)
    if existing_job_order:
        raise HTTPException(
            status_code=400,
            detail="Job order number already exists"
        )
    # Validate that at least one item is provided
    items_data = json.loads(items)
    materials_data = json.loads(materials) if materials else []
    prints_data = json.loads(prints) if prints else {}
    if not items_data:
        raise HTTPException(
            status_code=400,
            detail="At least one job order item is required"
        )
    # Handle image upload
    image_url = None
    if image:
        # Rename image to just the job order number while preserving extension
        original_ext = os.path.splitext(image.filename)[1]
        # Sanitize job_order_number to ensure safe filename characters
        safe_order_number = re.sub(r"[^A-Za-z0-9_.-]", "_", job_order_number)
        filename = f"{safe_order_number}{original_ext}"
        # Store absolute filesystem path (env dir + filename) exactly as requested
        image_url = os.path.join(image_upload_dir, filename)
        with open(image_url, "wb") as f:
            f.write(await image.read())
    # Create the job order with names
    job_order_in = schemas.JobOrderCreateWithNames(
        model_name=model_name,
        job_order_number=job_order_number,
        brand_name=brand_name,
        items=items_data,
        materials=materials_data,
        prints=prints_data or None,
        notes=notes,
        image_url=image_url
    )
    job_order = crud_create_job_order_with_names(db, job_order_in)
    # Get model name for response
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    # Get items with details
    items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details,
        "notes": job_order.notes,
        "prints": job_order.prints,
        "image_url": job_order.image_url
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
    existing_job_order = get_job_order(db, job_order_id=job_order_id)
    if not existing_job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    # Check if new job order number already exists (if being updated)
    if job_order_in.job_order_number and job_order_in.job_order_number != existing_job_order.job_order_number:
        duplicate_job_order = get_job_order_by_number(db, job_order_number=job_order_in.job_order_number)
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
    
    job_order = crud_update_job_order(db, job_order_id=job_order_id, job_order_update=job_order_in)
    
    # Return with model name and color/size names
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "items": items_with_details,
        "prints": job_order.prints,
        "image_url": job_order.image_url if hasattr(job_order, 'image_url') else None
    }

@router.delete("/{job_order_id}")
def delete_job_order(
    job_order_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Delete a job order"""
    success = delete_job_order(db, job_order_id=job_order_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    return {"message": "Job order deleted successfully"}

@router.get("/{job_order_id}/summary", response_model=schemas.JobOrderSummary)
def get_job_order_summary(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get job order summary with totals"""
    summary = get_job_order_summary(db, job_order_id=job_order_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    return summary

@router.get("/model/{model_id}", response_model=List[schemas.JobOrder])
def read_job_orders_by_model(
    model_id: int,
    db: Session = Depends(get_db)
):
    """Get all job orders for a specific model"""
    job_orders = get_job_orders_by_model(db, model_id=model_id)
    
    # Get model name
    model = db.query(models.Model).filter(models.Model.model_id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    result_items = []
    for job_order in job_orders:
        items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
        result_items.append({
            "job_order_id": job_order.job_order_id,
            "model_id": job_order.model_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name,
            "items": items_with_details,
            "image_url": job_order.image_url,
            "prints": job_order.prints
        })
    
    return result_items

@router.get("/{job_order_id}/production-tracking")
def job_order_production_tracking_endpoint(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get production tracking data for a job order"""
    # Check if job order exists
    job_order = get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    tracking_data = get_job_order_production_tracking(db, job_order_id)
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
    job_order = get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    status_data = get_job_order_overall_status(db, job_order_id)
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

@router.get("/options/materials", response_model=List[str])
def get_existing_materials(
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Return list of unique material names"""
    materials = db.query(models.Material.material_name).all()
    return [m.material_name for m in materials]

@router.get("/{job_order_id}/items-with-details/", response_model=List[Dict])
def get_job_order_items_with_details_endpoint(job_order_id: int, db: Session = Depends(get_db)):
    """Get all job order items with color and size details for a specific job order."""
    return get_job_order_items_with_details(db, job_order_id)

@router.get("/{job_order_id}/materials", response_model=List[Dict])
def get_job_order_materials_endpoint(job_order_id: int, db: Session = Depends(get_db)):
    mats = get_job_order_materials(db, job_order_id)
    return mats

@router.get("/summary/", response_model=JobOrderSummaryListResponse)
def get_job_orders_summary(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    job_order_number: Optional[str] = None,
    model_name: Optional[str] = None,
    brand_name: Optional[str] = None,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get job order summaries from the summary table"""
    query = db.query(models.JobOrderSummary)
    if job_order_number:
        query = query.filter(models.JobOrderSummary.job_order_number.ilike(f"%{job_order_number}%"))
    if model_name:
        query = query.filter(models.JobOrderSummary.model_name.ilike(f"%{model_name}%"))
    if brand_name:
        query = query.filter(models.JobOrderSummary.brand_name.ilike(f"%{brand_name}%"))
    
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total
    } 

@router.post("/refresh-summary/")
def refresh_job_orders_summary(db: Session = Depends(get_db)):
    refresh_sql = """
    REPLACE INTO job_orders_summary (
        job_order_id,
        job_order_number,
        model_name,
        brand_name,
        total_items,
        total_expected_quantity,
        total_produced_quantity,
        total_batches,
        has_issues,
        completion_percentage,
        overproduction_quantity,
        last_calculated_at,
        last_batch_update
    )
    SELECT
        jo.job_order_id,
        jo.job_order_number,
        m.model_name,
        b.brand_name,
        COALESCE(items.total_items, 0) AS total_items,
        COALESCE(items.total_expected_quantity, 0) AS total_expected_quantity,
        COALESCE(batches.total_produced_quantity, 0) AS total_produced_quantity,
        COALESCE(batches.total_batches, 0) AS total_batches,
        CASE
            WHEN COALESCE(batches.total_produced_quantity, 0) > COALESCE(items.total_expected_quantity, 0) THEN TRUE
            ELSE FALSE
        END AS has_issues,
        CASE
            WHEN COALESCE(batches.total_batches, 0) = 0 THEN 0
            ELSE ROUND(100.0 * COALESCE(batches.completed_batches, 0) / batches.total_batches, 2)
        END AS completion_percentage,
        GREATEST(0, COALESCE(batches.total_produced_quantity, 0) - COALESCE(items.total_expected_quantity, 0)) AS overproduction_quantity,
        CURRENT_TIMESTAMP AS last_calculated_at,
        batches.last_batch_update
    FROM job_orders jo
    LEFT JOIN models m ON jo.model_id = m.model_id
    LEFT JOIN brands b ON jo.brand_id = b.brand_id
    LEFT JOIN (
        SELECT job_order_id, COUNT(*) AS total_items, SUM(quantity) AS total_expected_quantity
        FROM job_order_items
        GROUP BY job_order_id
    ) items ON jo.job_order_id = items.job_order_id
    LEFT JOIN (
        SELECT
            job_order_id,
            SUM(quantity) AS total_produced_quantity,
            COUNT(*) AS total_batches,
            SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_batches,
            MAX(last_updated_at) AS last_batch_update
        FROM batches
        GROUP BY job_order_id
    ) batches ON jo.job_order_id = batches.job_order_id;
    """
    db.execute(text(refresh_sql))
    db.commit()
    return {"status": "refreshed"} 