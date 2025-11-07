from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from .. import models, schemas
from datetime import datetime, timedelta
from sqlalchemy import func as sa_func, case, desc, asc

def get_production_statistics(db: Session):
    """Get comprehensive production statistics"""
    
    # Current WIP by Phase
    wip_by_phase = db.query(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total')
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).group_by(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name
    ).order_by(
        models.ProductionPhase.phase_id
    ).all()
    
    # Production by Brand
    production_by_brand = db.query(
        models.Client.client_id,
        models.Client.client_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total'),
        sa_func.sum(models.Batch.quantity).label('total_quantity')
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Client,
        models.JobOrder.client_id == models.Client.client_id
    ).group_by(
        models.Client.client_id,
        models.Client.client_name
    ).all()
    
    # Production by Model
    production_by_model = db.query(
        models.Model.model_id,
        models.Model.model_name,
        models.Client.client_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total'),
        sa_func.sum(models.Batch.quantity).label('total_quantity')
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Model,
        models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.Client,
        models.JobOrder.client_id == models.Client.client_id
    ).group_by(
        models.Model.model_id,
        models.Model.model_name,
        models.Client.client_name
    ).all()
    
    # Recent Activity (last 7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_activity = db.query(
        sa_func.date(models.BarcodeScanEvent.scanned_at).label('date'),
        sa_func.count(models.BarcodeScanEvent.id).label('total_events'),
        sa_func.count(models.BarcodeScanEvent.batch_id.distinct()).label('unique_batches')
    ).filter(
        models.BarcodeScanEvent.scanned_at >= seven_days_ago
    ).group_by(
        sa_func.date(models.BarcodeScanEvent.scanned_at)
    ).order_by(
        sa_func.date(models.BarcodeScanEvent.scanned_at)
    ).all()
    
    # Bottleneck Analysis - Most Pending by Phase
    bottlenecks = db.query(
        models.ProductionPhase.phase_name,
        models.Client.client_name,
        models.Model.model_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending_count'),
        sa_func.sum(models.Batch.quantity).label('total_quantity')
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Model,
        models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.Client,
        models.JobOrder.client_id == models.Client.client_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.Batch.status == 'Pending'
    ).group_by(
        models.ProductionPhase.phase_name,
        models.Client.client_name,
        models.Model.model_name
    ).order_by(
        desc(sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)))
    ).limit(10).all()
    
    # Overall Statistics
    total_batches = db.query(sa_func.count(models.Batch.batch_id)).scalar() or 0
    total_pending = db.query(sa_func.count(models.Batch.batch_id)).filter(models.Batch.status == 'Pending').scalar() or 0
    total_in_progress = db.query(sa_func.count(models.Batch.batch_id)).filter(models.Batch.status == 'In Progress').scalar() or 0
    total_completed = db.query(sa_func.count(models.Batch.batch_id)).filter(models.Batch.status == 'Completed').scalar() or 0
    total_quantity = db.query(sa_func.sum(models.Batch.quantity)).scalar() or 0
    
    # Second Degree Analysis
    second_degree_batches = db.query(sa_func.count(models.Batch.batch_id)).filter(models.Batch.is_second_degree == True).scalar() or 0
    second_degree_quantity = db.query(sa_func.sum(models.Batch.quantity)).filter(models.Batch.is_second_degree == True).scalar() or 0
    
    return {
        "wip_by_phase": [
            {
                "phase_id": item.current_phase,
                "phase_name": item.phase_name,
                "pending": item.pending,
                "in_progress": item.in_progress,
                "completed": item.completed,
                "total": item.total
            } for item in wip_by_phase
        ],
        "production_by_brand": [
            {
                "client_id": item.client_id,
                "client_name": item.client_name,
                "pending": item.pending,
                "in_progress": item.in_progress,
                "completed": item.completed,
                "total": item.total,
                "total_quantity": item.total_quantity
            } for item in production_by_brand
        ],
        "production_by_model": [
            {
                "model_id": item.model_id,
                "model_name": item.model_name,
                "client_name": item.client_name,
                "pending": item.pending,
                "in_progress": item.in_progress,
                "completed": item.completed,
                "total": item.total,
                "total_quantity": item.total_quantity
            } for item in production_by_model
        ],
        "recent_activity": [
            {
                "date": item.date.strftime("%Y-%m-%d"),
                "total_events": item.total_events,
                "unique_batches": item.unique_batches
            } for item in recent_activity
        ],
        "bottlenecks": [
            {
                "phase_name": item.phase_name,
                "client_name": item.client_name,
                "model_name": item.model_name,
                "pending_count": item.pending_count,
                "total_quantity": item.total_quantity
            } for item in bottlenecks
        ],
        "overall_stats": {
            "total_batches": total_batches,
            "total_pending": total_pending,
            "total_in_progress": total_in_progress,
            "total_completed": total_completed,
            "total_quantity": total_quantity,
            "completion_rate": round((total_completed / total_batches * 100) if total_batches > 0 else 0, 2)
        },
        "second_degree_stats": {
            "second_degree_batches": second_degree_batches,
            "second_degree_quantity": second_degree_quantity,
            "second_degree_percentage": round((second_degree_batches / total_batches * 100) if total_batches > 0 else 0, 2)
        }
    }

def get_client_statistics(db: Session, client_id: int):
    """Get detailed statistics for a specific brand"""
    
    brand_data = db.query(
        models.Client.client_id,
        models.Client.client_name
    ).filter(models.Client.client_id == client_id).first()
    
    if not brand_data:
        return None
    
    # Brand production by phase
    brand_phases = db.query(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total'),
        sa_func.sum(models.Batch.quantity).label('total_quantity')
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Client,
        models.JobOrder.client_id == models.Client.client_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.Client.client_id == client_id
    ).group_by(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name
    ).order_by(
        models.ProductionPhase.phase_id
    ).all()
    
    # Brand models
    brand_models = db.query(
        models.Model.model_id,
        models.Model.model_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total'),
        sa_func.sum(models.Batch.quantity).label('total_quantity')
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Model,
        models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.Client,
        models.JobOrder.client_id == models.Client.client_id
    ).filter(
        models.Client.client_id == client_id
    ).group_by(
        models.Model.model_id,
        models.Model.model_name
    ).all()
    
    return {
        "brand_info": {
            "client_id": brand_data.client_id,
            "client_name": brand_data.client_name
        },
        "phases": [
            {
                "phase_id": item.current_phase,
                "phase_name": item.phase_name,
                "pending": item.pending,
                "in_progress": item.in_progress,
                "completed": item.completed,
                "total": item.total,
                "total_quantity": item.total_quantity
            } for item in brand_phases
        ],
        "models": [
            {
                "model_id": item.model_id,
                "model_name": item.model_name,
                "pending": item.pending,
                "in_progress": item.in_progress,
                "completed": item.completed,
                "total": item.total,
                "total_quantity": item.total_quantity
            } for item in brand_models
        ]
    }

def get_model_statistics(db: Session, model_id: int):
    """Get detailed statistics for a specific model"""
    
    model_data = db.query(
        models.Model.model_id,
        models.Model.model_name,
        models.Client.client_name
    ).join(
        models.JobOrder,
        models.Model.model_id == models.JobOrder.model_id
    ).join(
        models.Client,
        models.JobOrder.client_id == models.Client.client_id
    ).filter(models.Model.model_id == model_id).first()
    
    if not model_data:
        return None
    
    # Model production by phase
    model_phases = db.query(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total'),
        sa_func.sum(models.Batch.quantity).label('total_quantity')
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Model,
        models.JobOrder.model_id == models.Model.model_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.Model.model_id == model_id
    ).group_by(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name
    ).order_by(
        models.ProductionPhase.phase_id
    ).all()
    
    return {
        "model_info": {
            "model_id": model_data.model_id,
            "model_name": model_data.model_name,
            "client_name": model_data.client_name
        },
        "phases": [
            {
                "phase_id": item.current_phase,
                "phase_name": item.phase_name,
                "pending": item.pending,
                "in_progress": item.in_progress,
                "completed": item.completed,
                "total": item.total,
                "total_quantity": item.total_quantity
            } for item in model_phases
        ]
    }

def get_model_history(db: Session, job_order_number: str = None):
    """Get model history with phase timing data, optionally filtered by job order"""
    
    if not job_order_number:
        return {"job_order_color_groups": {}}
    
    # First, get the job order to get its ID
    job_order = db.query(models.JobOrder).filter(
        models.JobOrder.job_order_number == job_order_number
    ).first()
    
    if not job_order:
        return {"job_order_color_groups": {}}
    
    # Get all job order items for this job order
    job_order_items = db.query(
        models.JobOrderItem.item_id,
        models.JobOrderItem.job_order_id,
        models.JobOrderItem.color_id,
        models.JobOrderItem.size_id,
        models.JobOrderItem.quantity,
        models.Color.color_name,
        models.Size.size_value,
        models.Model.model_name,
        models.JobOrder.job_order_number
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
        models.JobOrderItem.job_order_id == job_order.job_order_id
    ).all()
    
    # Initialize job order color groups
    job_order_color_groups = {}
    
    # Process each job order item
    for item in job_order_items:
        # Create job_order-color key
        job_order_color_key = f"{item.job_order_number}_{item.color_name}"
        
        # Initialize group if not exists
        if job_order_color_key not in job_order_color_groups:
            job_order_color_groups[job_order_color_key] = {
                "job_order_number": item.job_order_number,
                "color_name": item.color_name,
                "model_name": item.model_name,
                "total_entries": 0,
                "total_duration_minutes": 0,
                "sizes": {}
            }
        
        # Initialize size if not exists
        if item.size_value not in job_order_color_groups[job_order_color_key]["sizes"]:
            job_order_color_groups[job_order_color_key]["sizes"][item.size_value] = {
                "size_value": item.size_value,
                "item_id": item.item_id,
                "entries": [],
                "total_duration_minutes": 0,
                "entry_count": 0
            }
        
        # Get all batches for this job order item
        batches = db.query(models.Batch).filter(
            models.Batch.job_order_id == item.job_order_id,
            models.Batch.color_id == item.color_id,
            models.Batch.size_id == item.size_id
        ).all()
        
        # Process each batch for this job order item
        for batch in batches:
            # Get all scan events for this batch
            scan_events = db.query(
                models.BarcodeScanEvent.batch_id,
                models.BarcodeScanEvent.action_type,
                models.BarcodeScanEvent.scanned_at,
                models.BarcodeScanEvent.old_status,
                models.BarcodeScanEvent.new_status,
                models.BarcodeScanEvent.old_quantity,
                models.BarcodeScanEvent.new_quantity,
                models.ProductionPhase.phase_name,
                models.ProductionPhase.phase_id
            ).join(
                models.ProductionPhase,
                models.BarcodeScanEvent.phase_id == models.ProductionPhase.phase_id
            ).filter(
                models.BarcodeScanEvent.batch_id == batch.batch_id
            ).order_by(
                models.BarcodeScanEvent.scanned_at
            ).all()
            
            # Group events by phase
            phase_events = {}
            for event in scan_events:
                phase_name = event.phase_name
                if phase_name not in phase_events:
                    phase_events[phase_name] = []
                phase_events[phase_name].append(event)
            
            # Create entries for each phase
            for phase_name, phase_event_list in phase_events.items():
                entry_time = None
                exit_time = None
                status = "In Progress"
                
                # Find entry and exit times
                for event in phase_event_list:
                    if event.action_type == "scan_in":
                        entry_time = event.scanned_at
                        # Use the new_status from the scan_in event if available
                        if event.new_status:
                            status = event.new_status
                    elif event.action_type == "scan_out":
                        exit_time = event.scanned_at
                        status = "Completed"
                
                # Calculate duration
                duration_minutes = None
                if entry_time and exit_time:
                    duration_seconds = (exit_time - entry_time).total_seconds()
                    duration_minutes = max(0, int(duration_seconds // 60))
                elif entry_time:
                    # Still in phase
                    duration_minutes = 0
                
                # Create entry
                entry = {
                    "model_name": item.model_name,
                    "color_name": item.color_name,
                    "size_value": item.size_value,
                    "job_order_number": item.job_order_number,
                    "phase_name": phase_name,
                    "entry_time": entry_time.isoformat() if entry_time else "N/A",
                    "exit_time": exit_time.isoformat() if exit_time else "N/A",
                    "duration_minutes": duration_minutes,
                    "status": status,
                    "quantity": batch.quantity
                }
                
                # Add to size data
                job_order_color_groups[job_order_color_key]["sizes"][item.size_value]["entries"].append(entry)
                job_order_color_groups[job_order_color_key]["sizes"][item.size_value]["entry_count"] += 1
                if duration_minutes is not None:
                    job_order_color_groups[job_order_color_key]["sizes"][item.size_value]["total_duration_minutes"] += duration_minutes
                
                # Update group totals
                job_order_color_groups[job_order_color_key]["total_entries"] += 1
                if duration_minutes is not None:
                    job_order_color_groups[job_order_color_key]["total_duration_minutes"] += duration_minutes
    
    return {"job_order_color_groups": job_order_color_groups}

def _process_batch_events(batch_events, model_color_groups):
    """Process events for a single batch and add to model_color_groups"""
    if not batch_events:
        return
    
    # Get batch info from first event
    first_event = batch_events[0]
    model_name = first_event.model_name
    color_name = first_event.color_name
    size_value = first_event.size_value
    job_order_number = first_event.job_order_number
    quantity = first_event.quantity
    
    # Create model-color key
    model_color_key = f"{model_name}_{color_name}"
    
    # Initialize group if not exists
    if model_color_key not in model_color_groups:
        model_color_groups[model_color_key] = {
            "model_name": model_name,
            "color_name": color_name,
            "total_entries": 0,
            "total_duration_minutes": 0,
            "sizes": {}
        }
    
    # Initialize size if not exists
    if size_value not in model_color_groups[model_color_key]["sizes"]:
        model_color_groups[model_color_key]["sizes"][size_value] = {
            "size_value": size_value,
            "entries": [],
            "total_duration_minutes": 0,
            "entry_count": 0
        }
    
    # Group events by phase
    phase_events = {}
    for event in batch_events:
        phase_name = event.phase_name
        if phase_name not in phase_events:
            phase_events[phase_name] = []
        phase_events[phase_name].append(event)
    
    # Create entries for each phase
    for phase_name, phase_event_list in phase_events.items():
        entry_time = None
        exit_time = None
        status = "In Progress"
        
        # Find entry and exit times
        for event in phase_event_list:
            if event.action_type == "scan_in":
                entry_time = event.scanned_at
            elif event.action_type == "scan_out":
                exit_time = event.scanned_at
                status = "Completed"
        
        # Calculate duration
        duration_minutes = None
        if entry_time and exit_time:
            duration_seconds = (exit_time - entry_time).total_seconds()
            duration_minutes = max(0, int(duration_seconds // 60))
        elif entry_time:
            # Still in phase
            duration_minutes = 0
        
        # Create entry
        entry = {
            "model_name": model_name,
            "color_name": color_name,
            "size_value": size_value,
            "job_order_number": job_order_number,
            "phase_name": phase_name,
            "entry_time": entry_time.isoformat() if entry_time else None,
            "exit_time": exit_time.isoformat() if exit_time else None,
            "duration_minutes": duration_minutes,
            "status": status,
            "quantity": quantity
        }
        
        # Add to size data
        model_color_groups[model_color_key]["sizes"][size_value]["entries"].append(entry)
        model_color_groups[model_color_key]["sizes"][size_value]["entry_count"] += 1
        if duration_minutes is not None:
            model_color_groups[model_color_key]["sizes"][size_value]["total_duration_minutes"] += duration_minutes
        
        # Update group totals
        model_color_groups[model_color_key]["total_entries"] += 1
        if duration_minutes is not None:
            model_color_groups[model_color_key]["total_duration_minutes"] += duration_minutes

def get_job_order_item_batch_details(db: Session, item_id: int):
    """Get detailed batch information for a specific job order item"""
    
    # Get the job order item details
    job_order_item = db.query(
        models.JobOrderItem.item_id,
        models.JobOrderItem.job_order_id,
        models.JobOrderItem.color_id,
        models.JobOrderItem.size_id,
        models.JobOrderItem.quantity,
        models.Color.color_name,
        models.Size.size_value,
        models.Model.model_name,
        models.JobOrder.job_order_number
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
        models.JobOrderItem.item_id == item_id
    ).first()
    
    if not job_order_item:
        return None
    
    # Get all batches for this job order item
    batches = db.query(
        models.Batch.batch_id,
        models.Batch.barcode,
        models.Batch.quantity,
        models.Batch.current_phase,
        models.Batch.status,
        models.Batch.is_second_degree,
        models.Batch.last_updated,
        models.ProductionPhase.phase_name
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.Batch.job_order_id == job_order_item.job_order_id,
        models.Batch.color_id == job_order_item.color_id,
        models.Batch.size_id == job_order_item.size_id
    ).all()
    
    # Group batches by phase and status
    phase_status_groups = {}
    total_batch_quantity = 0
    
    for batch in batches:
        phase_status_key = f"{batch.phase_name}_{batch.status}"
        if phase_status_key not in phase_status_groups:
            phase_status_groups[phase_status_key] = {
                "phase_name": batch.phase_name,
                "status": batch.status,
                "batches": [],
                "total_quantity": 0,
                "batch_count": 0
            }
        
        batch_detail = {
            "batch_id": batch.batch_id,
            "barcode": batch.barcode,
            "quantity": batch.quantity,
            "current_phase": batch.current_phase,
            "phase_name": batch.phase_name,
            "status": batch.status,
            "is_second_degree": bool(batch.is_second_degree),
            "last_updated": batch.last_updated.isoformat() if batch.last_updated else None
        }
        
        phase_status_groups[phase_status_key]["batches"].append(batch_detail)
        phase_status_groups[phase_status_key]["total_quantity"] += batch.quantity or 0
        phase_status_groups[phase_status_key]["batch_count"] += 1
        total_batch_quantity += batch.quantity or 0
    
    # Convert to list and sort by phase order
    def get_phase_order_index(phase_name):
        if not phase_name:
            return 9999
        n = phase_name.lower()
        if 'cut' in n:
            return 1
        if n.startswith('sew'):
            import re
            m = re.search(r'(\d+)', n)
            return 10 + int(m.group(1)) if m else 10
        if 'pack' in n:
            return 100
        return 9999
    
    phase_status_list = list(phase_status_groups.values())
    phase_status_list.sort(key=lambda x: (get_phase_order_index(x["phase_name"]), x["status"]))
    
    remaining_quantity = job_order_item.quantity - total_batch_quantity
    
    return {
        "item_id": job_order_item.item_id,
        "job_order_number": job_order_item.job_order_number,
        "model_name": job_order_item.model_name,
        "color_name": job_order_item.color_name,
        "size_value": job_order_item.size_value,
        "expected_quantity": job_order_item.quantity,
        "total_batch_quantity": total_batch_quantity,
        "remaining_quantity": remaining_quantity,
        "phase_status_groups": phase_status_list
    }