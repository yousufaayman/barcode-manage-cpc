from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from .. import models, schemas
from datetime import datetime, timedelta
from sqlalchemy import func as sa_func, case

# Statistics and analytics functions will be moved here from crud.py 

# get_advanced_statistics from crud.py should be moved here with its full implementation. 

# --- Statistics and analytics functions ---

def get_advanced_statistics(db: Session):
    timeline_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        models.BarcodeStatusTimeline.status,
        models.BarcodeStatusTimeline.duration_minutes
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    )

    batch_phase_totals_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).label("total_duration_per_batch")
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    ).group_by(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).subquery()

    turnover_rate_by_phase_query = db.query(
        batch_phase_totals_query.c.phase_id,
        batch_phase_totals_query.c.phase_name,
        sa_func.avg(batch_phase_totals_query.c.total_duration_per_batch).label("average_minutes")
    ).group_by(
        batch_phase_totals_query.c.phase_id,
        batch_phase_totals_query.c.phase_name
    )
    
    turnover_rate_results = turnover_rate_by_phase_query.all()
    turnover_rate_by_phase = [schemas.TurnoverRateByPhase.model_validate(r._asdict()) for r in turnover_rate_results]

    if turnover_rate_by_phase:
        slowest_turnover = max(turnover_rate_by_phase, key=lambda x: x.average_minutes)
        fastest_turnover = min(turnover_rate_by_phase, key=lambda x: x.average_minutes)
        bottleneck_phase = slowest_turnover
    else:
        slowest_turnover = None
        fastest_turnover = None
        bottleneck_phase = None

    bottleneck_phase = max(turnover_rate_by_phase, key=lambda x: x.average_minutes, default=None)

    pending_times_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).label("total_minutes")
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.status == 'Pending',
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    ).group_by(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).order_by(sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).desc())
    
    pending_times = pending_times_query.all()
    most_time_spent_pending = schemas.TimeSpentStatusStat.model_validate(pending_times[0]._asdict()) if pending_times else None
    fastest_pending_entry = pending_times_query.order_by(sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).asc()).first()
    fastest_pending = schemas.TimeSpentStatusStat.model_validate(fastest_pending_entry._asdict()) if fastest_pending_entry else None

    in_progress_times_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).label("total_minutes")
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.status == 'In Progress',
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    ).group_by(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).order_by(sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).asc())
    
    in_progress_times = in_progress_times_query.all()
    fastest_in_progress = schemas.TimeSpentStatusStat.model_validate(in_progress_times[0]._asdict()) if in_progress_times else None
    
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    throughput_query = db.query(
        sa_func.date(models.Batch.last_updated_at).label("period"),
        sa_func.count(models.Batch.batch_id).label("completed_batches")
    ).filter(
        models.Batch.status == 'Completed',
        models.Batch.last_updated_at >= thirty_days_ago
    ).group_by(sa_func.date(models.Batch.last_updated_at)).all()
    
    batch_throughput = [schemas.ThroughputStat.model_validate(r._asdict()) for r in throughput_query]

    avg_quantity = db.query(sa_func.avg(models.Batch.quantity)).scalar() or 0
    average_batch_size = round(avg_quantity, 2)

    status_dist_query = db.query(
        models.Batch.status,
        sa_func.count(models.Batch.batch_id).label("count")
    ).group_by(models.Batch.status).all()
    status_distribution = [schemas.StatusDistributionStat.model_validate(r._asdict()) for r in status_dist_query]

    wip_query = db.query(
        models.Batch.current_phase.label('phase_id'),
        models.ProductionPhase.phase_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed')
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).group_by(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name
    ).all()
    current_wip = [schemas.WIPStat.model_validate(r._asdict()) for r in wip_query]

    subquery = db.query(
        models.BarcodeStatusTimeline.batch_id,
        sa_func.count(models.BarcodeStatusTimeline.phase_id.distinct()).label('phase_count')
    ).group_by(models.BarcodeStatusTimeline.batch_id).subquery()
    
    avg_phases_query = db.query(sa_func.avg(subquery.c.phase_count)).scalar()
    average_phases_per_batch = round(avg_phases_query, 2) if avg_phases_query else 0

    phase_counts_query = db.query(
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.count(models.BarcodeStatusTimeline.id).label('entries'),
        sa_func.sum(case((models.BarcodeStatusTimeline.status == 'Completed', 1), else_=0)).label('exits')
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).group_by(
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).all()
    phase_entry_exit_counts = [schemas.PhaseEntryExitStat.model_validate(r._asdict()) for r in phase_counts_query]

    all_brands = db.query(models.Brand.brand_id, models.Brand.brand_name).all()
    all_phases = db.query(models.ProductionPhase.phase_id, models.ProductionPhase.phase_name).all()
    working_phase_by_brand = []
    for brand in all_brands:
        for phase in all_phases:
            phase_stats = db.query(
                sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
                sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
                sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
                sa_func.count(models.Batch.batch_id).label('total')
            ).filter(
                models.Batch.brand_id == brand.brand_id,
                models.Batch.current_phase == phase.phase_id
            ).first()
            working_phase_by_brand.append(schemas.WorkingPhaseByBrandStat(
                brand_id=brand.brand_id,
                brand_name=brand.brand_name,
                phase_id=phase.phase_id,
                phase_name=phase.phase_name,
                pending=phase_stats.pending or 0,
                in_progress=phase_stats.in_progress or 0,
                completed=phase_stats.completed or 0,
                total=phase_stats.total or 0
            ))
    all_models = db.query(models.Model.model_id, models.Model.model_name).all()
    all_phases = db.query(models.ProductionPhase.phase_id, models.ProductionPhase.phase_name).all()
    working_phase_by_model = []
    for model in all_models:
        for phase in all_phases:
            phase_stats = db.query(
                sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
                sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
                sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
                sa_func.count(models.Batch.batch_id).label('total')
            ).join(
                models.Model,
                models.Batch.model_id == models.Model.model_id
            ).filter(
                models.Batch.model_id == model.model_id,
                models.Batch.current_phase == phase.phase_id
            ).first()
            brand_info = db.query(
                models.Brand.brand_id,
                models.Brand.brand_name
            ).join(
                models.Batch,
                models.Batch.brand_id == models.Brand.brand_id
            ).filter(
                models.Batch.model_id == model.model_id
            ).first()
            working_phase_by_model.append(schemas.WorkingPhaseByModelStat(
                model_id=model.model_id,
                model_name=model.model_name,
                brand_id=brand_info.brand_id if brand_info else 0,
                brand_name=brand_info.brand_name if brand_info else 'Unknown Brand',
                phase_id=phase.phase_id,
                phase_name=phase.phase_name,
                pending=phase_stats.pending or 0,
                in_progress=phase_stats.in_progress or 0,
                completed=phase_stats.completed or 0,
                total=phase_stats.total or 0
            ))
    return {
        "turnover_rate_by_phase": turnover_rate_by_phase,
        "slowest_turnover": slowest_turnover,
        "fastest_turnover": fastest_turnover,
        "bottleneck_phase": bottleneck_phase,
        "most_time_spent_pending": most_time_spent_pending,
        "fastest_pending": fastest_pending,
        "fastest_in_progress": fastest_in_progress,
        "batch_throughput": batch_throughput,
        "average_batch_size": average_batch_size,
        "phase_entry_exit_counts": phase_entry_exit_counts,
        "average_phases_per_batch": average_phases_per_batch,
        "longest_time_in_single_phase": slowest_turnover,
        "shortest_time_in_single_phase": fastest_turnover,
        "current_wip": current_wip,
        "working_phase_by_brand": working_phase_by_brand,
        "working_phase_by_model": working_phase_by_model,
        "avg_time_to_completion_by_attribute": [],
        "stuck_batches": [],
        "phase_reentries": [],
        "pending_in_progress_ratio": [],
        "batch_ages": [],
        "status_distribution": status_distribution,
        "most_common_batch_attributes": []
    }