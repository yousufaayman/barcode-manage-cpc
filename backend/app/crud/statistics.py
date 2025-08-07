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
        models.Brand.brand_id,
        models.Brand.brand_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total'),
        sa_func.sum(models.Batch.quantity).label('total_quantity')
    ).join(
        models.JobOrder,
        models.Batch.job_order_id == models.JobOrder.job_order_id
    ).join(
        models.Brand,
        models.JobOrder.brand_id == models.Brand.brand_id
    ).group_by(
        models.Brand.brand_id,
        models.Brand.brand_name
    ).all()
    
    # Production by Model
    production_by_model = db.query(
        models.Model.model_id,
        models.Model.model_name,
        models.Brand.brand_name,
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
        models.Brand,
        models.JobOrder.brand_id == models.Brand.brand_id
    ).group_by(
        models.Model.model_id,
        models.Model.model_name,
        models.Brand.brand_name
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
        models.Brand.brand_name,
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
        models.Brand,
        models.JobOrder.brand_id == models.Brand.brand_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.Batch.status == 'Pending'
    ).group_by(
        models.ProductionPhase.phase_name,
        models.Brand.brand_name,
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
                "brand_id": item.brand_id,
                "brand_name": item.brand_name,
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
                "brand_name": item.brand_name,
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
                "brand_name": item.brand_name,
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

def get_brand_statistics(db: Session, brand_id: int):
    """Get detailed statistics for a specific brand"""
    
    brand_data = db.query(
        models.Brand.brand_id,
        models.Brand.brand_name
    ).filter(models.Brand.brand_id == brand_id).first()
    
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
        models.Brand,
        models.JobOrder.brand_id == models.Brand.brand_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(
        models.Brand.brand_id == brand_id
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
        models.Brand,
        models.JobOrder.brand_id == models.Brand.brand_id
    ).filter(
        models.Brand.brand_id == brand_id
    ).group_by(
        models.Model.model_id,
        models.Model.model_name
    ).all()
    
    return {
        "brand_info": {
            "brand_id": brand_data.brand_id,
            "brand_name": brand_data.brand_name
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
        models.Brand.brand_name
    ).join(
        models.JobOrder,
        models.Model.model_id == models.JobOrder.model_id
    ).join(
        models.Brand,
        models.JobOrder.brand_id == models.Brand.brand_id
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
            "brand_name": model_data.brand_name
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