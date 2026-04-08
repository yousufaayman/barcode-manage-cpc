"""QC summary aggregation (single rejections, rework) shared by API and daily QC PDF."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy import func as sa_func, literal
from sqlalchemy.orm import Session

from app import models
from app.crud.tracking import get_job_order_sewing_phase_final_stage_production_total


def get_job_order_ids_with_qc_rejections_on_date(
    db: Session,
    target_date: date,
    client_name: Optional[str] = None,
    model_name: Optional[str] = None,
    job_order_number: Optional[str] = None,
) -> List[int]:
    """Distinct job orders that had at least one single rejection on ``target_date``."""
    q = (
        db.query(models.Batch.job_order_id)
        .join(
            models.SingleRejection,
            models.SingleRejection.batch_id == models.Batch.batch_id,
        )
        .join(
            models.JobOrder,
            models.JobOrder.job_order_id == models.Batch.job_order_id,
        )
        .filter(sa_func.date(models.SingleRejection.rejected_at) == literal(target_date))
    )
    if client_name:
        q = q.join(
            models.Client,
            models.JobOrder.client_id == models.Client.client_id,
        ).filter(models.Client.client_name == client_name)
    if model_name:
        q = q.join(models.Model, models.JobOrder.model_id == models.Model.model_id).filter(
            models.Model.model_name == model_name
        )
    if job_order_number:
        q = q.filter(models.JobOrder.job_order_number == job_order_number)

    rows = q.distinct().all()
    ids = sorted(int(r[0]) for r in rows if r[0] is not None)
    return ids


def build_job_order_qc_summary(
    db: Session,
    job_order_id: int,
    *,
    today_reference_date: Optional[date] = None,
) -> Dict[str, Any]:
    """
    QC summary for one job order.

    When ``today_reference_date`` is None, \"today\" uses the database ``CURRENT_DATE``
    (same as the QC API). When set (e.g. daily PDF), all \"today\" filters and
    same-day sewing production totals use that calendar date.
    """
    if today_reference_date is None:
        today_expr = sa_func.current_date()
        today_assignment_date = db.query(sa_func.current_date()).scalar()
    else:
        today_expr = literal(today_reference_date)
        today_assignment_date = today_reference_date

    def build_rejection_view(today_only: bool = False):
        total_query = (
            db.query(sa_func.coalesce(sa_func.sum(models.SingleRejection.quantity), 0))
            .join(models.Batch, models.SingleRejection.batch_id == models.Batch.batch_id)
            .filter(models.Batch.job_order_id == job_order_id)
        )
        if today_only:
            total_query = total_query.filter(
                sa_func.date(models.SingleRejection.rejected_at) == today_expr
            )
        total_rejected = total_query.scalar() or 0

        rejection_phase_query = (
            db.query(
                models.SingleRejection.return_to_phase_id.label("phase_id"),
                models.ProductionPhase.phase_name.label("phase_name"),
                models.ProductionPhase.type.label("phase_type"),
                sa_func.coalesce(sa_func.sum(models.SingleRejection.quantity), 0).label("reject"),
            )
            .join(models.Batch, models.SingleRejection.batch_id == models.Batch.batch_id)
            .join(
                models.ProductionPhase,
                models.SingleRejection.return_to_phase_id == models.ProductionPhase.phase_id,
            )
            .filter(models.Batch.job_order_id == job_order_id)
        )
        if today_only:
            rejection_phase_query = rejection_phase_query.filter(
                sa_func.date(models.SingleRejection.rejected_at) == today_expr
            )
        rejection_phase_rows = (
            rejection_phase_query.group_by(
                models.SingleRejection.return_to_phase_id,
                models.ProductionPhase.phase_name,
                models.ProductionPhase.type,
            )
            .order_by(models.ProductionPhase.phase_name)
            .all()
        )

        rejection_reason_query = (
            db.query(
                models.SingleRejection.return_to_phase_id.label("phase_id"),
                sa_func.coalesce(models.SingleRejection.rejection_reason, "Unspecified").label("reason"),
                models.Worker.worker_name.label("worker_name"),
                sa_func.coalesce(models.ReworkBatch.problem_stage_name, "Unknown Stage").label(
                    "problem_stage_name"
                ),
                sa_func.coalesce(sa_func.sum(models.SingleRejection.quantity), 0).label("count"),
            )
            .join(models.Batch, models.SingleRejection.batch_id == models.Batch.batch_id)
            .outerjoin(models.ReworkBatch, models.SingleRejection.new_batch_id == models.ReworkBatch.batch_id)
            .outerjoin(models.Worker, models.SingleRejection.worker_id == models.Worker.worker_id)
            .filter(models.Batch.job_order_id == job_order_id)
        )
        if today_only:
            rejection_reason_query = rejection_reason_query.filter(
                sa_func.date(models.SingleRejection.rejected_at) == today_expr
            )
        rejection_reason_rows = (
            rejection_reason_query.group_by(
                models.SingleRejection.return_to_phase_id,
                sa_func.coalesce(models.SingleRejection.rejection_reason, "Unspecified"),
                models.Worker.worker_name,
                sa_func.coalesce(models.ReworkBatch.problem_stage_name, "Unknown Stage"),
            )
            .order_by(
                models.SingleRejection.return_to_phase_id,
                models.Worker.worker_name,
                sa_func.coalesce(models.ReworkBatch.problem_stage_name, "Unknown Stage"),
                sa_func.coalesce(models.SingleRejection.rejection_reason, "Unspecified"),
            )
            .all()
        )

        rejection_reason_map: Dict[int, Dict[str, Dict[str, Dict[str, int]]]] = {}
        for row in rejection_reason_rows:
            phase_id = int(row.phase_id) if row.phase_id is not None else 0
            problem_stage_name = str(row.problem_stage_name or "Unknown Stage")
            worker_name = str(row.worker_name) if row.worker_name else "Unassigned Worker"
            reason = str(row.reason)
            count = int(row.count or 0)

            stage_bucket = rejection_reason_map.setdefault(phase_id, {})
            worker_bucket = stage_bucket.setdefault(problem_stage_name, {})
            reason_bucket = worker_bucket.setdefault(worker_name, {})
            reason_bucket[reason] = reason_bucket.get(reason, 0) + count

        rejection_reason_counts_by_phase: Dict[int, List[Dict[str, Any]]] = {}
        rejection_reason_totals_by_phase: Dict[int, List[Dict[str, Any]]] = {}
        for phase_id, stage_data in rejection_reason_map.items():
            stage_entries: List[Dict[str, Any]] = []
            reason_totals: Dict[str, int] = {}
            for problem_stage_name, worker_data in sorted(stage_data.items(), key=lambda x: x[0]):
                workers: List[Dict[str, Any]] = []
                stage_total = 0
                for worker_name, reasons_data in sorted(worker_data.items(), key=lambda x: x[0]):
                    reasons = [
                        {"reason": reason, "count": count}
                        for reason, count in sorted(reasons_data.items(), key=lambda x: x[0])
                    ]
                    worker_total = sum(entry["count"] for entry in reasons)
                    stage_total += worker_total
                    for entry in reasons:
                        reason_totals[entry["reason"]] = reason_totals.get(entry["reason"], 0) + int(
                            entry["count"]
                        )
                    workers.append(
                        {
                            "worker_name": worker_name,
                            "total_count": worker_total,
                            "reasons": reasons,
                        }
                    )
                stage_entries.append(
                    {
                        "problem_stage_name": problem_stage_name,
                        "total_count": stage_total,
                        "workers": workers,
                    }
                )
            rejection_reason_counts_by_phase[phase_id] = stage_entries
            rejection_reason_totals_by_phase[phase_id] = [
                {"reason": reason, "count": count}
                for reason, count in sorted(reason_totals.items(), key=lambda x: x[0])
            ]
        return (
            int(total_rejected),
            rejection_phase_rows,
            rejection_reason_counts_by_phase,
            rejection_reason_totals_by_phase,
        )

    active_rework_rows = (
        db.query(
            models.Batch.current_phase.label("phase_id"),
            sa_func.count(models.ReworkBatch.rework_batch_id).label("active_rework_batches"),
        )
        .join(models.Batch, models.ReworkBatch.batch_id == models.Batch.batch_id)
        .join(
            models.ProductionPhase,
            models.Batch.current_phase == models.ProductionPhase.phase_id,
        )
        .filter(
            models.Batch.job_order_id == job_order_id,
            models.Batch.current_phase.isnot(None),
            models.ProductionPhase.type == "sewing",
        )
        .group_by(models.Batch.current_phase)
        .all()
    )
    active_rework_map = {
        int(row.phase_id): int(row.active_rework_batches)
        for row in active_rework_rows
        if row.phase_id is not None
    }

    active_rework_stage_rows = (
        db.query(
            models.Batch.current_phase.label("phase_id"),
            models.ReworkBatch.problem_stage_name.label("problem_stage_name"),
            sa_func.coalesce(sa_func.sum(models.Batch.quantity), 0).label("count"),
        )
        .join(models.Batch, models.ReworkBatch.batch_id == models.Batch.batch_id)
        .join(
            models.ProductionPhase,
            models.Batch.current_phase == models.ProductionPhase.phase_id,
        )
        .filter(
            models.Batch.job_order_id == job_order_id,
            models.Batch.current_phase.isnot(None),
            models.ProductionPhase.type == "sewing",
        )
        .group_by(
            models.Batch.current_phase,
            models.ReworkBatch.problem_stage_name,
        )
        .order_by(
            models.Batch.current_phase,
            models.ReworkBatch.problem_stage_name,
        )
        .all()
    )
    active_rework_stage_map: Dict[int, List[Dict[str, Any]]] = {}
    for row in active_rework_stage_rows:
        phase_id = int(row.phase_id) if row.phase_id is not None else 0
        active_rework_stage_map.setdefault(phase_id, []).append(
            {
                "problem_stage_name": row.problem_stage_name or "Unknown Stage",
                "count": int(row.count or 0),
            }
        )

    total_rejected_pieces, rejection_phase_rows, rejection_reason_counts_by_phase, rejection_reason_totals_by_phase = build_rejection_view(
        today_only=False
    )
    (
        today_rejected_pieces,
        today_phase_rows,
        today_reason_counts_by_phase,
        today_reason_totals_by_phase,
    ) = build_rejection_view(today_only=True)

    def _reject_ratio_percent(baseline_qty: int, rejected: int) -> Optional[float]:
        if baseline_qty <= 0:
            return None
        return round(100.0 * float(rejected) / float(baseline_qty), 2)

    item_phase_detail_totals = (
        db.query(
            sa_func.coalesce(sa_func.sum(models.JobOrderItemSummary.cut_inspection_qty), 0).label(
                "cut_inspection_total"
            ),
            sa_func.coalesce(sa_func.sum(models.JobOrderItemSummary.qc_out_qty), 0).label(
                "qc_out_total"
            ),
        )
        .filter(models.JobOrderItemSummary.job_order_id == job_order_id)
        .first()
    )
    if item_phase_detail_totals is None:
        cut_inspection_job_total = 0
        qc_out_job_total = 0
    else:
        cut_inspection_job_total = int(item_phase_detail_totals.cut_inspection_total or 0)
        qc_out_job_total = int(item_phase_detail_totals.qc_out_total or 0)

    sewing_phase_ids = [
        int(r[0])
        for r in db.query(models.ProductionPhase.phase_id)
        .filter(models.ProductionPhase.type == "sewing")
        .all()
    ]
    job_final_stage_production_all_time = sum(
        get_job_order_sewing_phase_final_stage_production_total(db, job_order_id, pid, None)
        for pid in sewing_phase_ids
    )
    job_final_stage_production_today = sum(
        get_job_order_sewing_phase_final_stage_production_total(
            db, job_order_id, pid, today_assignment_date
        )
        for pid in sewing_phase_ids
    )

    sewing_rejects_all_time = int(
        db.query(sa_func.coalesce(sa_func.sum(models.SingleRejection.quantity), 0))
        .join(models.Batch, models.SingleRejection.batch_id == models.Batch.batch_id)
        .join(
            models.ProductionPhase,
            models.SingleRejection.return_to_phase_id == models.ProductionPhase.phase_id,
        )
        .filter(
            models.Batch.job_order_id == job_order_id,
            models.ProductionPhase.type == "sewing",
        )
        .scalar()
        or 0
    )
    sewing_rejects_today = int(
        db.query(sa_func.coalesce(sa_func.sum(models.SingleRejection.quantity), 0))
        .join(models.Batch, models.SingleRejection.batch_id == models.Batch.batch_id)
        .join(
            models.ProductionPhase,
            models.SingleRejection.return_to_phase_id == models.ProductionPhase.phase_id,
        )
        .filter(
            models.Batch.job_order_id == job_order_id,
            models.ProductionPhase.type == "sewing",
            sa_func.date(models.SingleRejection.rejected_at) == today_expr,
        )
        .scalar()
        or 0
    )

    def _phase_production_and_ratios(
        phase_id: int,
        phase_type: Optional[str],
        reject_all_time: int,
        reject_today: int,
    ) -> Dict[str, Any]:
        if phase_type == "sewing" and phase_id:
            prod_all = get_job_order_sewing_phase_final_stage_production_total(
                db, job_order_id, phase_id, None
            )
            prod_today = get_job_order_sewing_phase_final_stage_production_total(
                db, job_order_id, phase_id, today_assignment_date
            )
            return {
                "final_stage_production_all_time": prod_all,
                "final_stage_production_today": prod_today,
                "reject_ratio_pct_all_time": _reject_ratio_percent(prod_all, reject_all_time),
                "reject_ratio_pct_today": _reject_ratio_percent(prod_today, reject_today),
            }
        if phase_type == "cutting" and phase_id:
            baseline = cut_inspection_job_total
            return {
                "final_stage_production_all_time": 0,
                "final_stage_production_today": 0,
                "reject_ratio_pct_all_time": _reject_ratio_percent(baseline, reject_all_time),
                "reject_ratio_pct_today": _reject_ratio_percent(baseline, reject_today),
            }
        if phase_type == "qc" and phase_id:
            baseline = qc_out_job_total
            return {
                "final_stage_production_all_time": 0,
                "final_stage_production_today": 0,
                "reject_ratio_pct_all_time": _reject_ratio_percent(baseline, reject_all_time),
                "reject_ratio_pct_today": _reject_ratio_percent(baseline, reject_today),
            }
        return {
            "final_stage_production_all_time": 0,
            "final_stage_production_today": 0,
            "reject_ratio_pct_all_time": None,
            "reject_ratio_pct_today": None,
        }

    today_reject_by_phase: Dict[int, int] = {
        int(row.phase_id) if row.phase_id is not None else 0: int(row.reject or 0)
        for row in today_phase_rows
    }

    phases = []
    for row in rejection_phase_rows:
        phase_id = int(row.phase_id) if row.phase_id is not None else 0
        reject_all = int(row.reject or 0)
        reject_today_cnt = today_reject_by_phase.get(phase_id, 0)
        metrics = _phase_production_and_ratios(phase_id, row.phase_type, reject_all, reject_today_cnt)
        phases.append(
            {
                "phase_id": phase_id,
                "phase_name": row.phase_name or "Unknown Phase",
                "phase_type": row.phase_type or None,
                "reject": reject_all,
                "active_rework_batches": active_rework_map.get(phase_id, 0)
                if row.phase_type == "sewing"
                else 0,
                "active_rework_problem_stages": active_rework_stage_map.get(phase_id, [])
                if row.phase_type == "sewing"
                else [],
                "rejection_reason_counts": rejection_reason_counts_by_phase.get(phase_id, [])
                if row.phase_type == "sewing"
                else [],
                "rejection_reason_totals": rejection_reason_totals_by_phase.get(phase_id, [])
                if row.phase_type != "sewing"
                else [],
                **metrics,
            }
        )

    alltime_reject_by_phase: Dict[int, int] = {
        int(row.phase_id) if row.phase_id is not None else 0: int(row.reject or 0)
        for row in rejection_phase_rows
    }

    today_phases = []
    for row in today_phase_rows:
        phase_id = int(row.phase_id) if row.phase_id is not None else 0
        reject_today_cnt = int(row.reject or 0)
        reject_all_cnt = alltime_reject_by_phase.get(phase_id, 0)
        metrics = _phase_production_and_ratios(
            phase_id, row.phase_type, reject_all_cnt, reject_today_cnt
        )
        today_phases.append(
            {
                "phase_id": phase_id,
                "phase_name": row.phase_name or "Unknown Phase",
                "phase_type": row.phase_type or None,
                "reject": reject_today_cnt,
                "active_rework_batches": active_rework_map.get(phase_id, 0)
                if row.phase_type == "sewing"
                else 0,
                "active_rework_problem_stages": active_rework_stage_map.get(phase_id, [])
                if row.phase_type == "sewing"
                else [],
                "rejection_reason_counts": today_reason_counts_by_phase.get(phase_id, [])
                if row.phase_type == "sewing"
                else [],
                "rejection_reason_totals": today_reason_totals_by_phase.get(phase_id, [])
                if row.phase_type != "sewing"
                else [],
                **metrics,
            }
        )

    return {
        "job_order_id": job_order_id,
        "total_rejected_pieces": int(total_rejected_pieces),
        "phases": phases,
        "today_rejected_pieces": int(today_rejected_pieces),
        "today_phases": today_phases,
        "final_stage_production_job_all_time": int(job_final_stage_production_all_time),
        "final_stage_production_job_today": int(job_final_stage_production_today),
        "reject_ratio_pct_job_all_time": _reject_ratio_percent(
            job_final_stage_production_all_time, sewing_rejects_all_time
        ),
        "reject_ratio_pct_job_today": _reject_ratio_percent(
            job_final_stage_production_today, sewing_rejects_today
        ),
        "sewing_rejected_pieces_all_time": int(sewing_rejects_all_time),
        "sewing_rejected_pieces_today": int(sewing_rejects_today),
    }
