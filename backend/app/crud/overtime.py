"""CRUD helpers for worker overtime requests/approvals."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models


def create_worker_overtime_request(
    db: Session,
    *,
    phase_id: int,
    schematic_id: int,
    work_date: date,
    overtime_hours: float,
    worker_ids: List[int],
    requested_by_user_id: int,
    notes: Optional[str] = None,
) -> models.WorkerOvertimeRequest:
    if not worker_ids:
        raise HTTPException(status_code=400, detail="worker_ids cannot be empty")

    normalized_worker_ids = sorted({int(w) for w in worker_ids})
    if any(w <= 0 for w in normalized_worker_ids):
        raise HTTPException(status_code=400, detail="worker_ids must be positive integers")

    if overtime_hours <= 0:
        raise HTTPException(status_code=400, detail="overtime_hours must be > 0")

    schematic = (
        db.query(models.SewingLineSchematic)
        .filter(models.SewingLineSchematic.schematic_id == schematic_id)
        .first()
    )
    if schematic is None:
        raise HTTPException(status_code=404, detail="Schematic not found")
    if int(schematic.production_phase_id) != int(phase_id):
        raise HTTPException(status_code=400, detail="phase_id does not match schematic's production_phase_id")

    req = models.WorkerOvertimeRequest(
        phase_id=phase_id,
        schematic_id=schematic_id,
        work_date=work_date,
        overtime_hours=Decimal(str(overtime_hours)),
        worker_ids=normalized_worker_ids,
        status="pending",
        requested_by_user_id=requested_by_user_id,
        admin_comment=notes,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def get_pending_overtime_requests(db: Session) -> List[models.WorkerOvertimeRequest]:
    return (
        db.query(models.WorkerOvertimeRequest)
        .filter(models.WorkerOvertimeRequest.status == "pending")
        .order_by(models.WorkerOvertimeRequest.created_at.desc())
        .all()
    )


def approve_worker_overtime_request(
    db: Session,
    *,
    request_id: int,
    approved_by_user_id: int,
    admin_comment: Optional[str] = None,
) -> models.WorkerOvertimeRequest:
    req = db.query(models.WorkerOvertimeRequest).filter(models.WorkerOvertimeRequest.request_id == request_id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Overtime request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Overtime request is not pending (status={req.status})")

    worker_ids: List[int] = [int(x) for x in (req.worker_ids or [])]
    if not worker_ids:
        # Nothing to apply; treat as invalid.
        raise HTTPException(status_code=400, detail="Overtime request has no worker_ids")

    overtime_hours = Decimal(str(req.overtime_hours))
    work_date = req.work_date
    schematic_id = req.schematic_id

    # "Latest assignment per worker" within the schematic for the day.
    rn = func.row_number().over(
        partition_by=models.WorkerDailyStageAssignment.worker_id,
        order_by=(
            models.WorkerDailyStageAssignment.created_at.desc(),
            models.WorkerDailyStageAssignment.daily_assignment_id.desc(),
        ),
    )

    latest_subq = (
        db.query(
            models.WorkerDailyStageAssignment.daily_assignment_id.label("daily_assignment_id"),
            models.WorkerDailyStageAssignment.worker_id.label("worker_id"),
            models.WorkerDailyStageAssignment.stage_id.label("stage_id"),
            models.WorkerDailyStageAssignment.working_hours.label("working_hours"),
            rn.label("rn"),
        )
        .join(models.SewingLineStage, models.SewingLineStage.stage_id == models.WorkerDailyStageAssignment.stage_id)
        .filter(
            models.WorkerDailyStageAssignment.assignment_date == work_date,
            models.SewingLineStage.schematic_id == schematic_id,
            models.WorkerDailyStageAssignment.worker_id.in_(worker_ids),
        )
        .subquery()
    )

    latest_rows = (
        db.query(
            latest_subq.c.daily_assignment_id,
            latest_subq.c.worker_id,
            latest_subq.c.stage_id,
            latest_subq.c.working_hours,
        )
        .filter(latest_subq.c.rn == 1)
        .all()
    )

    found_worker_ids = {int(r.worker_id) for r in latest_rows}
    missing = [wid for wid in worker_ids if wid not in found_worker_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing worker assignments for work_date={work_date} and schematic_id={schematic_id}: {missing}",
        )

    now = datetime.utcnow()

    for r in latest_rows:
        assignment = (
            db.query(models.WorkerDailyStageAssignment)
            .filter(models.WorkerDailyStageAssignment.daily_assignment_id == int(r.daily_assignment_id))
            .with_for_update()
            .first()
        )
        if assignment is None:
            # Should be impossible, but be defensive.
            raise HTTPException(status_code=409, detail="Latest daily assignment disappeared during approval")

        prev = assignment.working_hours if assignment.working_hours is not None else Decimal("0")
        new_val = Decimal(prev) + overtime_hours
        assignment.working_hours = new_val

        db.add(
            models.WorkerOvertimeHistory(
                request_id=req.request_id,
                work_date=work_date,
                worker_id=int(r.worker_id),
                daily_assignment_id=int(r.daily_assignment_id),
                stage_id=int(r.stage_id),
                overtime_hours=overtime_hours,
                previous_working_hours=Decimal(prev),
                new_working_hours=new_val,
                applied_by_user_id=approved_by_user_id,
                applied_at=now,
            )
        )

    req.status = "approved"
    req.reviewed_by_user_id = approved_by_user_id
    if admin_comment is not None:
        req.admin_comment = admin_comment
    req.reviewed_at = now

    db.commit()
    db.refresh(req)
    return req


def reject_worker_overtime_request(
    db: Session,
    *,
    request_id: int,
    rejected_by_user_id: int,
    admin_comment: Optional[str] = None,
) -> models.WorkerOvertimeRequest:
    req = db.query(models.WorkerOvertimeRequest).filter(models.WorkerOvertimeRequest.request_id == request_id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Overtime request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Overtime request is not pending (status={req.status})")

    # Business rule: rejected overtime requests are auto-deleted.
    # Keep API contract by returning a lightweight response object.
    _ = rejected_by_user_id
    _ = admin_comment
    rejected_request_id = req.request_id
    db.delete(req)
    db.commit()
    return models.WorkerOvertimeRequest(request_id=rejected_request_id, status="rejected")

