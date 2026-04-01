from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, text, case
from typing import List, Dict, Optional
from pydantic import BaseModel
from app.crud import *
from app import models, schemas
from app.core.deps import get_db, get_current_active_superuser, get_current_user, get_optional_current_user
from app.crud.job_order import update_job_order as crud_update_job_order, create_job_order_with_names as crud_create_job_order_with_names
import os
from app.core.config import settings
import json
import re
from app.crud.job_order import get_job_order_materials

router = APIRouter()
image_upload_dir = os.path.abspath(settings.JOB_ORDER_IMAGE_UPLOAD_DIR)

class JobOrderListResponse(BaseModel):
    items: List[schemas.JobOrder]
    total: int

class JobOrderSummaryListResponse(BaseModel):
    items: List[schemas.JobOrderSummary]
    total: int

@router.get("/", response_model=JobOrderListResponse)
def read_job_orders(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    model_id: Optional[int] = None,
    job_order_number: Optional[str] = None,
    model_name: Optional[str] = None,
    client_name: Optional[str] = None,
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
    if client_name:
        query = query.join(models.Client, models.JobOrder.client_id == models.Client.client_id).filter(models.Client.client_name.ilike(f"%{client_name}%"))

    
    # Get total count before pagination
    total_count = query.count()
    
    # Apply pagination
    job_orders = query.offset(skip).limit(limit).all()
    
    # Get model names for each job order
    result_items = []
    for job_order in job_orders:
        model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
        brand = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
        
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
            "client_id": job_order.client_id,
            "client_name": brand.client_name if brand else None,
            "items": items_with_details,
            "total_working_quantity": total_working_quantity,
            "batches": batches_min,
            "image_url": job_order.image_url,
            "prints": job_order.print_config,
            "priority": job_order.priority or 0
        }
        
        result_items.append(job_order_dict)
    
    result_items.sort(key=lambda x: (-x.get("priority", 0), x["job_order_number"]))
    
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
        brand = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
        result_items.append({
            "job_order_id": job_order.job_order_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "client_name": brand.client_name if brand else None
        })
    return result_items

@router.get("/{job_order_id}/compensations", response_model=Dict)
def get_job_order_compensations_endpoint(
    job_order_id: int, 
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all compensations for all items in a job order with phase aggregations"""
    job_order = get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail=f"Job order {job_order_id} not found")
    
    phase_aggregates = db.query(
        models.ProductionPhase.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.count(models.BatchCompensation.compensation_id).label('count')
    ).select_from(
        models.BatchCompensation
    ).join(
        models.JobOrderItem,
        models.BatchCompensation.item_id == models.JobOrderItem.item_id
    ).join(
        models.ProductionPhase,
        models.BatchCompensation.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.JobOrderItem.job_order_id == job_order_id
    ).group_by(
        models.ProductionPhase.phase_id,
        models.ProductionPhase.phase_name
    ).order_by(
        models.ProductionPhase.phase_id
    ).all()
    
    phase_summary = []
    for phase_id, phase_name, count in phase_aggregates:
        phase_summary.append({
            "phase_id": phase_id or 0,
            "phase_name": phase_name or "Unknown Phase",
            "count": int(count) if count is not None else 0
        })

    color_aggregates = db.query(
        models.Color.color_name,
        sa_func.count(models.BatchCompensation.compensation_id).label('count')
    ).select_from(
        models.BatchCompensation
    ).join(
        models.JobOrderItem,
        models.BatchCompensation.item_id == models.JobOrderItem.item_id
    ).join(
        models.Color,
        models.JobOrderItem.color_id == models.Color.color_id
    ).filter(
        models.JobOrderItem.job_order_id == job_order_id
    ).group_by(
        models.Color.color_name
    ).order_by(
        models.Color.color_name
    ).all()

    color_summary = []
    for color_name, count in color_aggregates:
        color_summary.append({
            "color_name": color_name or "Unknown",
            "count": int(count) if count is not None else 0
        })
    
    compensations = db.query(
        models.BatchCompensation.compensation_id,
        models.BatchCompensation.batch_id,
        models.BatchCompensation.item_id,
        models.BatchCompensation.phase_id,
        models.BatchCompensation.quantity,
        models.BatchCompensation.created_at,
        models.BatchCompensation.created_by_user_id,
        models.Color.color_name,
        models.Size.size_value,
        models.ProductionPhase.phase_name,
        models.Batch.barcode,
        models.Batch.quantity.label('batch_quantity'),
        models.User.username.label('created_by_username')
    ).select_from(
        models.BatchCompensation
    ).join(
        models.JobOrderItem,
        models.BatchCompensation.item_id == models.JobOrderItem.item_id
    ).join(
        models.Color,
        models.JobOrderItem.color_id == models.Color.color_id
    ).join(
        models.Size,
        models.JobOrderItem.size_id == models.Size.size_id
    ).join(
        models.ProductionPhase,
        models.BatchCompensation.phase_id == models.ProductionPhase.phase_id
    ).join(
        models.Batch,
        models.BatchCompensation.batch_id == models.Batch.batch_id
    ).outerjoin(
        models.User,
        models.BatchCompensation.created_by_user_id == models.User.id
    ).filter(
        models.JobOrderItem.job_order_id == job_order_id
    ).order_by(
        models.BatchCompensation.created_at.desc()
    ).all()
    
    result = []
    for comp_id, batch_id, item_id, phase_id, quantity, created_at, created_by_user_id, color_name, size_value, phase_name, barcode, batch_quantity, created_by_username in compensations:
        result.append({
            "compensation_id": comp_id,
            "batch_id": batch_id,
            "item_id": item_id,
            "phase_id": phase_id,
            "phase_name": phase_name,
            "quantity": quantity,
            "created_at": created_at.isoformat() if created_at else None,
            "created_by_user_id": created_by_user_id,
            "created_by_username": created_by_username,
            "color_name": color_name,
            "size_value": size_value,
            "barcode": barcode,
            "batch_quantity": batch_quantity
        })
    
    return {
        "phase_summary": phase_summary,
        "color_summary": color_summary,
        "compensations": result
    }

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
    brand = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
    
    # Get items with color and size information
    items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "client_id": job_order.client_id,
        "client_name": brand.client_name if brand else None,
        "items": items_with_details,
        "image_url": job_order.image_url,
        "notes": job_order.notes,
        "prints": job_order.print_config,
        "date_created": job_order.date_created,
        "priority": job_order.priority or 0
    }

@router.get("/{job_order_id}/cuts", response_model=List[schemas.CutListItem])
def get_cuts_for_job_order(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get all cuts for a specific job order"""
    from app.crud import cut as cut_crud
    cuts = cut_crud.get_cuts_by_job_order_id(db, job_order_id)
    return cuts


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
    brand = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
    
    # Get items with color and size information
    items_with_details = get_job_order_items_with_details(db, job_order.job_order_id)
    
    return {
        "job_order_id": job_order.job_order_id,
        "model_id": job_order.model_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "client_id": job_order.client_id,
        "client_name": brand.client_name if brand else None,
        "items": items_with_details,
        "image_url": job_order.image_url,
        "notes": job_order.notes,
        "prints": job_order.print_config,
        "date_created": job_order.date_created,
        "priority": job_order.priority or 0
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
        "prints": job_order.print_config,
        "notes": job_order.notes
    }

@router.post("/with-names/", response_model=schemas.JobOrder)
async def create_job_order_with_names(
    db: Session = Depends(get_db),
    job_order_number: str = Form(...),
    model_name: str = Form(...),
    client_name: str = Form(...),
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
        try:
            with open(image_url, "wb") as f:
                f.write(await image.read())
        except (IOError, OSError) as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save image: {str(e)}"
            )
    # Create the job order with names
    job_order_in = schemas.JobOrderCreateWithNames(
        model_name=model_name,
        job_order_number=job_order_number,
        client_name=client_name,
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
        "prints": job_order.print_config,
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
        "prints": job_order.print_config,
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
            "prints": job_order.print_config
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

# ============================================================================
# ITEM-LEVEL QUANTITY TRACKING ENDPOINTS
# ============================================================================

@router.get("/items/summary/", response_model=schemas.JobOrderItemSummaryListResponse)
def get_job_order_items_summary(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    job_order_id: Optional[int] = None,
    color_name: Optional[str] = None,
    size_value: Optional[str] = None,
    production_status: Optional[str] = None,
    has_issues: Optional[bool] = None,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get job order items summary with filtering"""
    query = db.query(models.JobOrderItemSummary)
    
    # Apply filters
    if job_order_id:
        query = query.filter(models.JobOrderItemSummary.job_order_id == job_order_id)
    if color_name:
        query = query.filter(models.JobOrderItemSummary.color_name.ilike(f"%{color_name}%"))
    if size_value:
        query = query.filter(models.JobOrderItemSummary.size_value.ilike(f"%{size_value}%"))
    if production_status:
        query = query.filter(models.JobOrderItemSummary.production_status == production_status)
    if has_issues is not None:
        query = query.filter(models.JobOrderItemSummary.has_issues == has_issues)
    
    # Get total count before pagination
    total_count = query.count()
    
    # Apply pagination
    items = query.offset(skip).limit(limit).all()
    
    # Map database model fields to schema fields - create Pydantic models explicitly
    mapped_items = []
    for item in items:
        # Ensure all phase quantities are integers (handle None values)
        cut_inspection = int(item.cut_inspection_qty) if item.cut_inspection_qty is not None else 0
        second_degree_cut = int(item.second_degree_cut_qty) if item.second_degree_cut_qty is not None else 0
        sewing_in = int(item.sewing_in_qty) if item.sewing_in_qty is not None else 0
        sewing_out = int(item.sewing_out_qty) if item.sewing_out_qty is not None else 0
        qc_in = int(item.qc_in_qty) if item.qc_in_qty is not None else 0
        qc_out = int(item.qc_out_qty) if item.qc_out_qty is not None else 0
        packaging_in = int(item.packaging_in_qty) if item.packaging_in_qty is not None else 0
        packaging_out = int(item.packaging_out_qty) if item.packaging_out_qty is not None else 0
        
        mapped_item = schemas.JobOrderItemSummary(
            item_id=item.item_id,
            job_order_id=item.job_order_id,
            color_id=item.color_id,
            size_id=item.size_id,
            color_name=item.color_name,
            size_value=item.size_value,
            expected_quantity=int(item.expected_quantity) if item.expected_quantity is not None else 0,
            produced_quantity=int(item.working_qty) if item.working_qty is not None else 0,
            cut_quantity=int(item.cut_qty) if item.cut_qty is not None else 0,
            cut_inspection_qty=cut_inspection,
            second_degree_cut_qty=second_degree_cut,
            sewing_in_qty=sewing_in,
            sewing_out_qty=sewing_out,
            qc_in_qty=qc_in,
            qc_out_qty=qc_out,
            packaging_in_qty=packaging_in,
            packaging_out_qty=packaging_out,
            second_degree_quantity=int(item.second_degree_qty) if item.second_degree_qty is not None else 0,
            completed_quantity=int(item.completed_qty) if item.completed_qty is not None else 0,
            working_quantity=int(item.working_qty) if item.working_qty is not None else 0,
            remaining_quantity=int(item.expected_quantity or 0) - int(item.completed_qty or 0),
            lost_qty=int(item.lost_qty) if item.lost_qty is not None else 0,
            total_batches=int(item.total_batches) if item.total_batches is not None else 0,
            has_issues=bool(item.has_issues) if item.has_issues is not None else False,
            completion_percentage=float(item.completion_percentage) if item.completion_percentage is not None else 0.0,
            overproduction_quantity=int(item.overproduction_quantity) if item.overproduction_quantity is not None else 0,
            production_status=str(item.production_status) if item.production_status else 'Not Started',
            notes=item.notes,
            true_consumption=float(item.true_consumption) if item.true_consumption is not None else None,
            last_calculated_at=item.last_calculated_at,
            last_quantity_change=None,
            last_completion_change=None,
            last_new_batch=None,
            last_batch_update=None,
        )
        mapped_items.append(mapped_item)
    
    return schemas.JobOrderItemSummaryListResponse(
        items=mapped_items,
        total=total_count
    )

@router.get("/items/{item_id}/tracking", response_model=schemas.JobOrderItemProductionTracking)
def get_job_order_item_production_tracking(
    item_id: int,
    db: Session = Depends(get_db)
):
    """Get detailed production tracking for a specific item"""
    tracking_data = get_job_order_item_production_tracking(db, item_id)
    if not tracking_data:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return tracking_data

@router.get("/items/issues/", response_model=schemas.JobOrderItemWithIssuesListResponse)
def get_job_order_items_with_issues(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get all items that have issues (overproduction)"""
    items = get_job_order_items_with_issues(db, skip=skip, limit=limit)
    
    return {
        "items": items,
        "total": len(items)  # Note: This is simplified, should count total separately
    }

@router.get("/items/high-second-degree/", response_model=schemas.JobOrderItemHighSecondDegreeListResponse)
def get_job_order_items_high_second_degree(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get items with high second degree quantities (>10% of total production)"""
    items = get_job_order_items_high_second_degree(db, skip=skip, limit=limit)
    
    return {
        "items": items,
        "total": len(items)  # Note: This is simplified, should count total separately
    }

@router.get("/items/quantity-reductions/", response_model=schemas.JobOrderItemWithQuantityReductionsListResponse)
def get_job_order_items_with_quantity_reductions(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get items where cut quantity > produced quantity (quantity reductions)"""
    items = get_job_order_items_with_quantity_reductions(db, skip=skip, limit=limit)
    
    return {
        "items": items,
        "total": len(items)  # Note: This is simplified, should count total separately
    }

@router.get("/{job_order_id}/items/quantity-breakdown/", response_model=schemas.JobOrderItemQuantityBreakdownListResponse)
def get_job_order_items_quantity_breakdown(
    job_order_id: int,
    db: Session = Depends(get_db)
):
    """Get detailed quantity breakdown for all items in a job order"""
    # Check if job order exists
    job_order = get_job_order(db, job_order_id=job_order_id)
    if not job_order:
        raise HTTPException(status_code=404, detail="Job order not found")
    
    items = get_job_order_items_quantity_breakdown(db, job_order_id)
    
    return {
        "items": items,
        "total": len(items)
    }

@router.post("/items/refresh-summary/")
def refresh_job_order_items_summary_endpoint(
    job_order_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Refresh item summaries for a specific job order or all job orders"""
    try:
        refresh_job_order_items_summary(db, job_order_id)
        return {"message": "Item summaries refreshed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refresh item summaries: {str(e)}")

@router.get("/items/statistics/", response_model=schemas.ItemLevelStatistics)
def get_item_level_statistics(
    db: Session = Depends(get_db),
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get comprehensive statistics at the item level"""
    stats = get_item_level_statistics(db)
    return stats

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

@router.put("/items/{item_id}/notes", response_model=schemas.JobOrderItem)
def update_job_order_item_notes(
    item_id: int,
    notes_update: schemas.JobOrderItemNotesUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Update notes for a specific job order item"""
    # Find the job order item
    job_order_item = db.query(models.JobOrderItem).filter(
        models.JobOrderItem.item_id == item_id
    ).first()
    
    if not job_order_item:
        raise HTTPException(status_code=404, detail="Job order item not found")
    
    # Update the notes
    job_order_item.notes = notes_update.notes
    
    # Commit the changes
    db.commit()
    db.refresh(job_order_item)
    
    # Return the updated item with color and size names
    color = db.query(models.Color).filter(models.Color.color_id == job_order_item.color_id).first()
    size = db.query(models.Size).filter(models.Size.size_id == job_order_item.size_id).first()
    
    return {
        "item_id": job_order_item.item_id,
        "job_order_id": job_order_item.job_order_id,
        "color_id": job_order_item.color_id,
        "color_name": color.color_name if color else None,
        "size_id": job_order_item.size_id,
        "size_value": size.size_value if size else None,
        "quantity": job_order_item.quantity,
        "notes": job_order_item.notes
    }

@router.get("/summary/", response_model=JobOrderSummaryListResponse)
def get_job_orders_summary(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    job_order_number: Optional[str] = None,
    model_name: Optional[str] = None,
    client_name: Optional[str] = None,
    current_user: Optional[schemas.User] = Depends(get_optional_current_user)
):
    """Get job order summaries from the job_orders_summary table"""
    # Build query from job_orders_summary table
    query = db.query(models.JobOrderSummary)
    
    # Apply filters
    if job_order_number:
        query = query.filter(models.JobOrderSummary.job_order_number.ilike(f"%{job_order_number}%"))
    if model_name:
        query = query.filter(models.JobOrderSummary.model_name.ilike(f"%{model_name}%"))
    if client_name:
        query = query.filter(models.JobOrderSummary.client_name.ilike(f"%{client_name}%"))
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    results = query.offset(skip).limit(limit).all()
    
    # Also need to check for stalled batches and notes which are not in the summary table
    summaries = []
    for result in results:
        # Check for items with notes
        items_with_notes = db.query(models.JobOrderItemSummary).filter(
            models.JobOrderItemSummary.job_order_id == result.job_order_id,
            models.JobOrderItemSummary.notes.isnot(None),
            models.JobOrderItemSummary.notes != ''
        ).all()
        
        # Detect stalled batches
        phase_group_case = case(
            (models.Batch.current_phase == 1, 'Cutting'),
            (models.Batch.current_phase.in_([2, 3, 4, 7]), 'Sewing'),
            (models.Batch.current_phase == 8, 'Packaging'),
            else_='Other'
        )
        
        stalled_subq = db.query(
            models.Batch.color_id.label('color_id'),
            models.Batch.size_id.label('size_id'),
            sa_func.count(sa_func.distinct(phase_group_case)).label('group_count')
        ).filter(
            models.Batch.job_order_id == result.job_order_id,
            models.Batch.is_second_degree == False
        ).group_by(
            models.Batch.color_id,
            models.Batch.size_id
        ).subquery()
        
        has_stalled_batches = db.query(stalled_subq).filter(stalled_subq.c.group_count > 1).first() is not None
        
        # Update has_issues if notes exist
        has_issues = result.has_issues or len(items_with_notes) > 0
        
        # Get notes text
        notes_text = ""
        if items_with_notes:
            notes_list = [item.notes for item in items_with_notes if item.notes]
            notes_text = "; ".join(notes_list)
        
        job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == result.job_order_id).first()
        
        summaries.append({
            "job_order_id": result.job_order_id,
            "job_order_number": result.job_order_number,
            "model_name": result.model_name,
            "client_name": result.client_name,
            "total_items": result.total_items,
            "total_expected_quantity": result.total_expected_quantity,
            "cut_quantity": result.cut_quantity,
            "second_degree_quantity": result.second_degree_quantity,
            "completed_quantity": result.total_produced_quantity,
            "working_quantity": result.working_quantity,
            "remaining_quantity": result.total_expected_quantity - result.working_quantity,
            "total_batches": result.total_batches,
            "has_issues": has_issues,
            "has_high_second_degree": result.has_high_second_degree,
            "has_stalled_batches": has_stalled_batches,
            "completion_percentage": float(result.completion_percentage) if result.completion_percentage else 0,
            "overproduction_quantity": result.overproduction_quantity,
            "notes": notes_text,
            "last_calculated_at": result.last_calculated_at,
            "priority": job_order.priority if job_order else 0
        })
    
    summaries.sort(key=lambda x: (-x.get("priority", 0), x["job_order_number"]))
    
    return {
        "items": summaries,
        "total": total
    } 

@router.post("/refresh-summary/")
def refresh_job_orders_summary(db: Session = Depends(get_db)):
    """Refresh all job orders summary"""
    from app.crud.job_order import refresh_job_order_items_summary
    refresh_job_order_items_summary(db)
    return {"message": "Job orders summary refreshed successfully"}

@router.post("/priorities/bulk-update")
def bulk_update_job_order_priorities(
    bulk_update: schemas.BulkJobOrderPriorityUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Bulk update job order priorities"""
    updated_count = 0
    for update in bulk_update.updates:
        job_order = get_job_order(db, job_order_id=update.job_order_id)
        if job_order:
            job_order.priority = update.priority
            updated_count += 1
    
    db.commit()
    return {"message": f"Updated priorities for {updated_count} job orders", "updated_count": updated_count}