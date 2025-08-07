from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Union
from .. import models, schemas
from sqlalchemy import func
from .brand import get_brand_by_name, create_brand
from .model import get_model_by_name, create_model
from .color import get_color_by_name, create_color
from .size import get_size_by_value, create_size

# JobOrder CRUD operations will be moved here from crud.py 

# All job order CRUD and helper functions from crud.py should be moved here with their full implementation. 

# --- Job Order CRUD and helpers ---

def create_job_order(db: Session, job_order: schemas.JobOrderCreate) -> models.JobOrder:
    db_job_order = models.JobOrder(
        model_id=job_order.model_id,
        job_order_number=job_order.job_order_number,
        image_url=getattr(job_order, 'image_url', None)
        # date_created will be set automatically by the model
    )
    db.add(db_job_order)
    db.flush()
    for item in job_order.items:
        db_item = models.JobOrderItem(
            job_order_id=db_job_order.job_order_id,
            color_id=item.color_id,
            size_id=item.size_id,
            quantity=item.quantity,
            weight=getattr(item, 'weight', None),
            notes=getattr(item, 'notes', None)
        )
        db.add(db_item)

    # Handle prints flags if provided
    if getattr(job_order, 'prints', None) is not None:
        db_prints = models.JobOrderPrint(
            job_order_id=db_job_order.job_order_id,
            **job_order.prints.model_dump()
        )
        db.add(db_prints)

    db.commit()
    db.refresh(db_job_order)
    return db_job_order

def create_job_order_with_names(db: Session, job_order: schemas.JobOrderCreateWithNames) -> models.JobOrder:
    model = get_model_by_name(db, job_order.model_name)
    if not model:
        model = create_model(db, schemas.ModelCreate(model_name=job_order.model_name))
    
    brand = get_brand_by_name(db, job_order.brand_name)
    if not brand:
        brand = create_brand(db, schemas.BrandCreate(brand_name=job_order.brand_name))
    
    db_job_order = models.JobOrder(
        model_id=model.model_id,
        brand_id=brand.brand_id,
        job_order_number=job_order.job_order_number,
        image_url=job_order.image_url,  # Save uploaded image path
        notes=job_order.notes
        # date_created will be set automatically by the model
    )
    db.add(db_job_order)
    db.flush()
    for item in job_order.items:
        color = get_color_by_name(db, item.color_name)
        if not color:
            color = create_color(db, schemas.ColorCreate(color_name=item.color_name))
        size = get_size_by_value(db, item.size_value)
        if not size:
            size = create_size(db, schemas.SizeCreate(size_value=item.size_value))
        db_item = models.JobOrderItem(
            job_order_id=db_job_order.job_order_id,
            color_id=color.color_id,
            size_id=size.size_id,
            quantity=item.quantity,
            weight=getattr(item, 'weight', None),
            notes=getattr(item, 'notes', None)
        )
        db.add(db_item)

    # handle materials consumption
    if job_order.materials:
        for mat in job_order.materials:
            material = db.query(models.Material).filter(models.Material.material_name == mat.material_name).first()
            if not material:
                material = models.Material(material_name=mat.material_name)
                db.add(material)
                db.flush()
            color_id = None
            if getattr(mat, 'color_name', None):
                clr = get_color_by_name(db, mat.color_name)
                if clr:
                    color_id = clr.color_id
            db_mat = models.JobOrderMaterial(
                job_order_id=db_job_order.job_order_id,
                material_id=material.material_id,
                color_id=color_id,
                quantity=mat.quantity,
                consumption=getattr(mat, 'consumption', mat.quantity)
            )
            db.add(db_mat)

    # handle prints flags
    if job_order.prints is not None:
        db_prints = models.JobOrderPrint(
            job_order_id=db_job_order.job_order_id,
            **job_order.prints.model_dump()
        )
        db.add(db_prints)
    db.commit()
    db.refresh(db_job_order)
    return db_job_order

def get_job_order(db: Session, job_order_id: int) -> Optional[models.JobOrder]:
    return db.query(models.JobOrder).filter(
        models.JobOrder.job_order_id == job_order_id
    ).first()

def get_job_order_by_number(db: Session, job_order_number: str) -> Optional[models.JobOrder]:
    return db.query(models.JobOrder).filter(
        models.JobOrder.job_order_number == job_order_number
    ).first()

def get_job_orders(db: Session, skip: int = 0, limit: int = 100) -> List[models.JobOrder]:
    return db.query(models.JobOrder).offset(skip).limit(limit).all()

def get_job_orders_count(db: Session) -> int:
    return db.query(models.JobOrder).count()

def update_job_order(db: Session, job_order_id: int, job_order_update: schemas.JobOrderUpdate) -> Optional[models.JobOrder]:
    db_job_order = get_job_order(db, job_order_id)
    if not db_job_order:
        return None
    if job_order_update.model_id is not None:
        db_job_order.model_id = job_order_update.model_id
    if job_order_update.job_order_number is not None:
        db_job_order.job_order_number = job_order_update.job_order_number
    if job_order_update.image_url is not None:
        db_job_order.image_url = job_order_update.image_url
    # Handle notes update
    if job_order_update.notes is not None:
        db_job_order.notes = job_order_update.notes
    if job_order_update.items is not None:
        for item in job_order_update.items:
            db_item = db.query(models.JobOrderItem).filter(
                models.JobOrderItem.item_id == item["item_id"],
                models.JobOrderItem.job_order_id == job_order_id
            ).first()
            if db_item:
                db_item.quantity = item.get("quantity", db_item.quantity)
                if "weight" in item:
                    db_item.weight = item["weight"]
                if "notes" in item:
                    db_item.notes = item["notes"]

    # Handle prints update
    if job_order_update.prints is not None:
        db_prints = db.query(models.JobOrderPrint).filter(models.JobOrderPrint.job_order_id == job_order_id).first()
        if db_prints:
            for field, value in job_order_update.prints.model_dump().items():
                setattr(db_prints, field, value)
        else:
            db_prints = models.JobOrderPrint(
                job_order_id=job_order_id,
                **job_order_update.prints.model_dump()
            )
            db.add(db_prints)
    # Handle materials update
    if job_order_update.materials is not None:
        # Delete existing materials for this job order
        db.query(models.JobOrderMaterial).filter(
            models.JobOrderMaterial.job_order_id == job_order_id
        ).delete()
        # Insert new materials
        for m in job_order_update.materials:
            # Ensure material exists
            material = db.query(models.Material).filter(
                models.Material.material_name == m.material_name
            ).first()
            if not material:
                material = models.Material(material_name=m.material_name)
                db.add(material)
                db.flush()
            # Determine color_id
            color_id = None
            if m.color_name:
                clr = db.query(models.Color).filter(
                    models.Color.color_name == m.color_name
                ).first()
                if clr:
                    color_id = clr.color_id
            db_mat = models.JobOrderMaterial(
                job_order_id=job_order_id,
                material_id=material.material_id,
                color_id=color_id,
                quantity=m.quantity,
                consumption=getattr(m, 'consumption', m.quantity)
            )
            db.add(db_mat)

    db.commit()
    db.refresh(db_job_order)
    return db_job_order

def delete_job_order(db: Session, job_order_id: int) -> bool:
    db_job_order = get_job_order(db, job_order_id)
    if not db_job_order:
        return False
    db.delete(db_job_order)
    db.commit()
    return True

def get_job_order_summary(db: Session, job_order_id: int) -> Optional[Dict]:
    job_order = get_job_order(db, job_order_id)
    if not job_order:
        return None
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first()
    total_colors = len(job_order.items)
    total_quantity = sum(item.quantity for item in job_order.items)
    return {
        "job_order_id": job_order.job_order_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "total_colors": total_colors,
        "total_quantity": total_quantity
    }

def get_job_orders_by_model(db: Session, model_id: int) -> List[models.JobOrder]:
    return db.query(models.JobOrder).filter(
        models.JobOrder.model_id == model_id
    ).all()

def get_job_order_items_with_details(db: Session, job_order_id: int) -> List[Dict]:
    items = db.query(
        models.JobOrderItem,
        models.Color.color_name,
        models.Size.size_value
    ).join(
        models.Color,
        models.JobOrderItem.color_id == models.Color.color_id
    ).join(
        models.Size,
        models.JobOrderItem.size_id == models.Size.size_id
    ).filter(
        models.JobOrderItem.job_order_id == job_order_id
    ).all()
    return [
        {
            "item_id": item.JobOrderItem.item_id,
            "job_order_id": item.JobOrderItem.job_order_id,
            "color_id": item.JobOrderItem.color_id,
            "color_name": item.color_name,
            "size_id": item.JobOrderItem.size_id,
            "size_value": item.size_value,
            "quantity": item.JobOrderItem.quantity,
            "weight": item.JobOrderItem.weight
        }
        for item in items
    ]

def get_job_order_production_tracking(db: Session, job_order_id: int) -> List[Dict]:
    items = db.query(
        models.JobOrderItem,
        models.Color.color_name,
        models.Size.size_value,
        models.JobOrder.job_order_number,
        models.Model.model_name
    ).join(
        models.Color,
        models.JobOrderItem.color_id == models.Color.color_id
    ).join(
        models.Size,
        models.JobOrderItem.size_id == models.Size.size_id
    ).join(
        models.JobOrder,
        models.JobOrderItem.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Model,
        models.JobOrder.model_id == models.Model.model_id
    ).filter(
        models.JobOrderItem.job_order_id == job_order_id
    ).all()
    
    result = []
    for item in items:
        # Get all batches for this specific item (color + size combination)
        item_batches = db.query(models.Batch).filter(
            models.Batch.job_order_id == job_order_id,
            models.Batch.color_id == item.JobOrderItem.color_id,
            models.Batch.size_id == item.JobOrderItem.size_id
        ).all()
        
        # Calculate quantities at item level
        produced_quantity = sum(batch.quantity for batch in item_batches if batch.quantity is not None)
        
        # Calculate cut quantity (non-decreasing maximum)
        cut_quantity = 0
        if item_batches:
            # Get the maximum quantity ever reached for this item
            cut_quantity = max(batch.quantity for batch in item_batches if batch.quantity is not None)
        
        # Calculate second degree quantity
        second_degree_quantity = sum(
            batch.quantity for batch in item_batches 
            if batch.quantity is not None and batch.is_second_degree == True
        )
        
        # Calculate completed quantity (only completed batches)
        completed_quantity = sum(
            batch.quantity for batch in item_batches 
            if batch.quantity is not None and batch.status == 'Completed'
        )
        
        # Calculate remaining quantity
        remaining_quantity = item.JobOrderItem.quantity - produced_quantity
        
        # Determine production status
        if produced_quantity >= item.JobOrderItem.quantity:
            production_status = "Completed"
        elif produced_quantity > 0:
            production_status = "In Progress"
        else:
            production_status = "Not Started"
        
        result.append({
            "item_id": item.JobOrderItem.item_id,
            "color_id": item.JobOrderItem.color_id,
            "color_name": item.color_name,
            "size_id": item.JobOrderItem.size_id,
            "size_value": item.size_value,
            "expected_quantity": item.JobOrderItem.quantity,
            "produced_quantity": produced_quantity,
            "cut_quantity": cut_quantity,
            "working_quantity": produced_quantity,  # Same as produced_quantity for clarity
            "second_degree_quantity": second_degree_quantity,
            "completed_quantity": completed_quantity,
            "remaining_quantity": remaining_quantity,
            "production_status": production_status
        })
    return result

def get_job_order_overall_status(db: Session, job_order_id: int) -> Optional[Dict]:
    """Get overall production status for a job order by aggregating from item summaries"""
    job_order = db.query(
        models.JobOrder,
        models.Model.model_name
    ).join(
        models.Model,
        models.JobOrder.model_id == models.Model.model_id
    ).filter(
        models.JobOrder.job_order_id == job_order_id
    ).first()
    
    if not job_order:
        return None
    
    # Get item summaries for this job order
    item_summaries = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.job_order_id == job_order_id
    ).all()
    
    if not item_summaries:
        return None
    
    # Aggregate quantities from item summaries
    total_expected = sum(item.expected_quantity for item in item_summaries)
    total_produced = sum(item.produced_quantity for item in item_summaries)
    total_cut_quantity = sum(item.cut_quantity for item in item_summaries)
    total_second_degree_quantity = sum(item.second_degree_quantity for item in item_summaries)
    total_completed_quantity = sum(item.completed_quantity for item in item_summaries)
    total_working_quantity = sum(item.working_quantity for item in item_summaries)
    total_remaining = sum(item.remaining_quantity for item in item_summaries)
    
    # Determine overall status based on item statuses
    completed_items = sum(1 for item in item_summaries if item.production_status == 'Completed')
    in_progress_items = sum(1 for item in item_summaries if item.production_status == 'In Progress')
    
    if completed_items == len(item_summaries):
        overall_status = "Completed"
    elif completed_items > 0 or in_progress_items > 0:
        overall_status = "In Progress"
    else:
        overall_status = "Not Started"
    
    completion_percentage = round((total_produced / total_expected) * 100, 2) if total_expected > 0 else 0
    
    return {
        "job_order_id": job_order.JobOrder.job_order_id,
        "job_order_number": job_order.JobOrder.job_order_number,
        "model_name": job_order.model_name,
        "total_expected": total_expected,
        "total_produced": total_produced,
        "cut_quantity": total_cut_quantity,
        "working_quantity": total_working_quantity,
        "second_degree_quantity": total_second_degree_quantity,
        "completed_quantity": total_completed_quantity,
        "total_remaining": total_remaining,
        "overall_status": overall_status,
        "completion_percentage": completion_percentage
    }

def get_job_order_materials(db: Session, job_order_id: int):
    materials = db.query(
        models.JobOrderMaterial,
        models.Material.material_name,
        models.Color.color_name
    ).join(models.Material, models.JobOrderMaterial.material_id == models.Material.material_id)
    materials = materials.join(models.Color, models.JobOrderMaterial.color_id == models.Color.color_id, isouter=True)
    materials = materials.filter(models.JobOrderMaterial.job_order_id == job_order_id).all()
    return [
        {
            "id": m.JobOrderMaterial.id,
            "material_id": m.JobOrderMaterial.material_id,
            "material_name": m.material_name,
            "quantity": float(m.JobOrderMaterial.quantity),
            "consumption": float(m.JobOrderMaterial.consumption) if m.JobOrderMaterial.consumption is not None else None,
            "color_name": m.color_name
        } for m in materials]

# ============================================================================
# ITEM-LEVEL QUANTITY TRACKING FUNCTIONS
# ============================================================================

def get_job_order_item_summary(db: Session, item_id: int) -> Optional[models.JobOrderItemSummary]:
    """Get item summary by item_id"""
    return db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.item_id == item_id
    ).first()

def get_job_order_items_summary(db: Session, job_order_id: int) -> List[models.JobOrderItemSummary]:
    """Get all item summaries for a job order"""
    return db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.job_order_id == job_order_id
    ).all()

def get_job_order_item_production_tracking(db: Session, item_id: int) -> Optional[Dict]:
    """Get detailed production tracking for a specific item"""
    item_summary = get_job_order_item_summary(db, item_id)
    if not item_summary:
        return None
    
    # Get job order details
    job_order = db.query(models.JobOrder).filter(
        models.JobOrder.job_order_id == item_summary.job_order_id
    ).first()
    
    # Get model and brand details
    model = db.query(models.Model).filter(
        models.Model.model_id == job_order.model_id
    ).first()
    
    brand = db.query(models.Brand).filter(
        models.Brand.brand_id == job_order.brand_id
    ).first() if job_order.brand_id else None
    
    return {
        "item_id": item_summary.item_id,
        "job_order_id": item_summary.job_order_id,
        "job_order_number": job_order.job_order_number,
        "model_name": model.model_name if model else None,
        "brand_name": brand.brand_name if brand else None,
        "color_id": item_summary.color_id,
        "color_name": item_summary.color_name,
        "size_id": item_summary.size_id,
        "size_value": item_summary.size_value,
        "expected_quantity": item_summary.expected_quantity,
        "produced_quantity": item_summary.produced_quantity,
        "cut_quantity": item_summary.cut_quantity,
        "second_degree_quantity": item_summary.second_degree_quantity,
        "completed_quantity": item_summary.completed_quantity,
        "working_quantity": item_summary.working_quantity,
        "remaining_quantity": item_summary.remaining_quantity,
        "production_status": item_summary.production_status,
        "completion_percentage": float(item_summary.completion_percentage) if item_summary.completion_percentage else 0,
        "has_issues": item_summary.has_issues,
        "overproduction_quantity": item_summary.overproduction_quantity,
        "total_batches": item_summary.total_batches,
        "last_calculated_at": item_summary.last_calculated_at,
        "last_quantity_change": item_summary.last_quantity_change,
        "last_completion_change": item_summary.last_completion_change,
        "last_new_batch": item_summary.last_new_batch,
        "last_batch_update": item_summary.last_batch_update
    }

def get_job_order_items_with_issues(db: Session, skip: int = 0, limit: int = 100) -> List[Dict]:
    """Get all items that have issues (overproduction)"""
    items = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.has_issues == True
    ).offset(skip).limit(limit).all()
    
    result = []
    for item in items:
        # Get job order details
        job_order = db.query(models.JobOrder).filter(
            models.JobOrder.job_order_id == item.job_order_id
        ).first()
        
        # Get model and brand details
        model = db.query(models.Model).filter(
            models.Model.model_id == job_order.model_id
        ).first()
        
        brand = db.query(models.Brand).filter(
            models.Brand.brand_id == job_order.brand_id
        ).first() if job_order.brand_id else None
        
        result.append({
            "item_id": item.item_id,
            "job_order_id": item.job_order_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "brand_name": brand.brand_name if brand else None,
            "color_name": item.color_name,
            "size_value": item.size_value,
            "expected_quantity": item.expected_quantity,
            "produced_quantity": item.produced_quantity,
            "overproduction_quantity": item.overproduction_quantity,
            "completion_percentage": float(item.completion_percentage) if item.completion_percentage else 0
        })
    
    return result

def get_job_order_items_high_second_degree(db: Session, skip: int = 0, limit: int = 100) -> List[Dict]:
    """Get items with high second degree quantities (>10% of total production)"""
    items = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.second_degree_quantity > 0
    ).filter(
        models.JobOrderItemSummary.produced_quantity > 0
    ).all()
    
    # Filter for items with >10% second degree
    high_second_degree_items = []
    for item in items:
        if item.produced_quantity > 0:
            second_degree_percentage = (item.second_degree_quantity / item.produced_quantity) * 100
            if second_degree_percentage > 10:
                high_second_degree_items.append(item)
    
    # Sort by second degree percentage descending
    high_second_degree_items.sort(key=lambda x: (x.second_degree_quantity / x.produced_quantity) * 100, reverse=True)
    
    # Apply pagination
    paginated_items = high_second_degree_items[skip:skip + limit]
    
    result = []
    for item in paginated_items:
        # Get job order details
        job_order = db.query(models.JobOrder).filter(
            models.JobOrder.job_order_id == item.job_order_id
        ).first()
        
        # Get model and brand details
        model = db.query(models.Model).filter(
            models.Model.model_id == job_order.model_id
        ).first()
        
        brand = db.query(models.Brand).filter(
            models.Brand.brand_id == job_order.brand_id
        ).first() if job_order.brand_id else None
        
        second_degree_percentage = (item.second_degree_quantity / item.produced_quantity) * 100
        
        result.append({
            "item_id": item.item_id,
            "job_order_id": item.job_order_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "brand_name": brand.brand_name if brand else None,
            "color_name": item.color_name,
            "size_value": item.size_value,
            "produced_quantity": item.produced_quantity,
            "second_degree_quantity": item.second_degree_quantity,
            "second_degree_percentage": round(second_degree_percentage, 2)
        })
    
    return result

def get_job_order_items_with_quantity_reductions(db: Session, skip: int = 0, limit: int = 100) -> List[Dict]:
    """Get items where cut quantity > produced quantity (quantity reductions)"""
    items = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.cut_quantity > models.JobOrderItemSummary.produced_quantity
    ).order_by(
        (models.JobOrderItemSummary.cut_quantity - models.JobOrderItemSummary.produced_quantity).desc()
    ).offset(skip).limit(limit).all()
    
    result = []
    for item in items:
        # Get job order details
        job_order = db.query(models.JobOrder).filter(
            models.JobOrder.job_order_id == item.job_order_id
        ).first()
        
        # Get model and brand details
        model = db.query(models.Model).filter(
            models.Model.model_id == job_order.model_id
        ).first()
        
        brand = db.query(models.Brand).filter(
            models.Brand.brand_id == job_order.brand_id
        ).first() if job_order.brand_id else None
        
        quantity_reduction = item.cut_quantity - item.produced_quantity
        
        result.append({
            "item_id": item.item_id,
            "job_order_id": item.job_order_id,
            "job_order_number": job_order.job_order_number,
            "model_name": model.model_name if model else None,
            "brand_name": brand.brand_name if brand else None,
            "color_name": item.color_name,
            "size_value": item.size_value,
            "produced_quantity": item.produced_quantity,
            "cut_quantity": item.cut_quantity,
            "quantity_reduction": quantity_reduction
        })
    
    return result

def get_job_order_items_quantity_breakdown(db: Session, job_order_id: int) -> List[Dict]:
    """Get detailed quantity breakdown for all items in a job order"""
    items = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.job_order_id == job_order_id,
        models.JobOrderItemSummary.produced_quantity > 0
    ).all()
    
    result = []
    for item in items:
        first_degree_quantity = item.produced_quantity - item.second_degree_quantity
        cut_vs_produced_difference = item.cut_quantity - item.produced_quantity
        second_degree_percentage = (item.second_degree_quantity / item.produced_quantity) * 100 if item.produced_quantity > 0 else 0
        
        result.append({
            "item_id": item.item_id,
            "job_order_id": item.job_order_id,
            "color_name": item.color_name,
            "size_value": item.size_value,
            "expected_quantity": item.expected_quantity,
            "produced_quantity": item.produced_quantity,
            "cut_quantity": item.cut_quantity,
            "second_degree_quantity": item.second_degree_quantity,
            "first_degree_quantity": first_degree_quantity,
            "cut_vs_produced_difference": cut_vs_produced_difference,
            "second_degree_percentage": round(second_degree_percentage, 2),
            "completion_percentage": float(item.completion_percentage) if item.completion_percentage else 0,
            "has_issues": item.has_issues,
            "production_status": item.production_status
        })
    
    return result

def refresh_job_order_items_summary(db: Session, job_order_id: Optional[int] = None):
    """Refresh item summaries for a specific job order or all job orders"""
    if job_order_id:
        # Refresh specific job order
        db.execute(text("CALL refresh_job_order_items_summary_single(:job_order_id)"), 
                  {"job_order_id": job_order_id})
    else:
        # Refresh all job orders
        db.execute(text("CALL refresh_job_order_items_summary()"))
    
    db.commit()

def get_item_level_statistics(db: Session) -> Dict:
    """Get comprehensive statistics at the item level"""
    total_items = db.query(models.JobOrderItemSummary).count()
    items_with_issues = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.has_issues == True
    ).count()
    completed_items = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.production_status == 'Completed'
    ).count()
    in_progress_items = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.production_status == 'In Progress'
    ).count()
    not_started_items = db.query(models.JobOrderItemSummary).filter(
        models.JobOrderItemSummary.production_status == 'Not Started'
    ).count()
    
    # Calculate totals
    total_expected = db.query(func.sum(models.JobOrderItemSummary.expected_quantity)).scalar() or 0
    total_produced = db.query(func.sum(models.JobOrderItemSummary.produced_quantity)).scalar() or 0
    total_second_degree = db.query(func.sum(models.JobOrderItemSummary.second_degree_quantity)).scalar() or 0
    total_overproduction = db.query(func.sum(models.JobOrderItemSummary.overproduction_quantity)).scalar() or 0
    
    return {
        "total_items": total_items,
        "items_with_issues": items_with_issues,
        "completed_items": completed_items,
        "in_progress_items": in_progress_items,
        "not_started_items": not_started_items,
        "total_expected_quantity": total_expected,
        "total_produced_quantity": total_produced,
        "total_second_degree_quantity": total_second_degree,
        "total_overproduction_quantity": total_overproduction,
        "overall_completion_percentage": round((total_produced / total_expected) * 100, 2) if total_expected > 0 else 0,
        "overall_second_degree_percentage": round((total_second_degree / total_produced) * 100, 2) if total_produced > 0 else 0
    } 