"""CRUD for production tracking: daily stage assignments and production_history."""
from datetime import date, datetime, time as dt_time, timedelta
from typing import Tuple, Optional, List, Dict, Any

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .. import models
from .batch import get_batch_by_barcode
from .tracking_math import _calc_active_from_elapsed, _calc_elapsed_from_active


def _compute_time_weighted_expected_per_stage(
    assignments_by_worker_date: Dict[Tuple[int, date], List[Dict[str, Any]]],
) -> Dict[Tuple[int, date], Dict[int, int]]:
    """
    For each (worker_id, assignment_date) with multiple stages, compute expected
    output per stage_id using assignment timestamps. Returns a map
    (worker_id, assignment_date) -> { stage_id: expected_output }.
    Single-stage days are included with expected = production_qty * working_hours.
    """
    result: Dict[Tuple[int, date], Dict[int, int]] = {}
    for (worker_id, assignment_date), group in assignments_by_worker_date.items():
        # Sort by created_at then daily_assignment_id for deterministic order
        sorted_list = sorted(
            group,
            key=lambda x: (
                x.get("created_at") or datetime.min,
                x["daily_assignment_id"],
            ),
        )
        # For a multi-stage day, we treat the earliest assignment's stored working_hours
        # as the total available hours for that worker/day.
        working_hours_val = float(sorted_list[0].get("working_hours") or 0.0)
        stage_expected: Dict[int, int] = {}

        if len(sorted_list) == 1:
            row = sorted_list[0]
            pq = int(row["production_qty"] or 0)
            stage_expected[int(row["stage_id"])] = (
                int(pq * working_hours_val) if working_hours_val > 0 and pq else 0
            )
        else:
            for i, row in enumerate(sorted_list):
                created_at = row.get("created_at")
                if created_at is None:
                    # Fallback: treat as full day for this stage only
                    pq = int(row["production_qty"] or 0)
                    stage_expected[int(row["stage_id"])] = (
                        int(pq * working_hours_val) if working_hours_val > 0 and pq else 0
                    )
                    continue
                if i < len(sorted_list) - 1:
                    next_created = sorted_list[i + 1].get("created_at")
                    if next_created is None:
                        hours_i = 0.0
                    else:
                        delta = next_created - created_at
                        hours_i = delta.total_seconds() / 3600.0
                else:
                    first_created = sorted_list[0].get("created_at")
                    if first_created is None:
                        hours_i = 0.0
                    else:
                        span_seconds = (
                            created_at - first_created
                        ).total_seconds()
                        span_hours = span_seconds / 3600.0
                        hours_i = working_hours_val - span_hours
                hours_i = max(0.0, hours_i)
                pq = int(row["production_qty"] or 0)
                stage_expected[int(row["stage_id"])] = int(round(hours_i * pq))

        result[(worker_id, assignment_date)] = stage_expected
    return result


def get_assignment_if_for_date(
    db: Session, daily_assignment_id: int, reference_date: Optional[date] = None
):
    """
    Return the WorkerDailyStageAssignment if it exists, its assignment_date
    matches the reference date, and it is active. If reference_date is None,
    use the current date (server). Otherwise return None (not counted, considered missing).
    """
    assignment = (
        db.query(models.WorkerDailyStageAssignment)
        .filter(models.WorkerDailyStageAssignment.daily_assignment_id == daily_assignment_id)
        .first()
    )
    if not assignment:
        return None
    effective_date = reference_date if reference_date is not None else date.today()
    if assignment.assignment_date != effective_date:
        return None
    if not getattr(assignment, "active", True):
        return None
    return assignment


def get_max_allowed_quantity(
    db: Session,
    daily_assignment_id: int,
    batch_id: int,
    batch_quantity: Optional[int],
    reference_date: Optional[date] = None,
) -> Tuple[Optional[int], int]:
    """
    For a single stage type (same stage name within the schematic): compute how much
    of this batch can still be recorded at this stage type. A batch cannot be read
    into production twice beyond its quantity.

    - Find the current assignment's stage -> stage_name, schematic_id.
    - Find all stage_ids in the same schematic with the same stage_name.
    - Sum quantity_produced for this batch across all production_history rows whose
      assignment is for one of those stages.
    - remainder = batch_quantity - total_already (if batch_quantity is None, no cap).
    - Returns (max_allowed, total_already). max_allowed is None when batch_quantity is None.
    - If the assignment's date does not match the reference date (or today if not provided), the assignment is not counted (treated as missing).
    """
    assignment = get_assignment_if_for_date(db, daily_assignment_id, reference_date)
    if not assignment:
        return (batch_quantity if batch_quantity is not None else None, 0)

    stage = (
        db.query(models.SewingLineStage)
        .filter(models.SewingLineStage.stage_id == assignment.stage_id)
        .first()
    )
    if not stage:
        return (batch_quantity if batch_quantity is not None else None, 0)

    # All stage_ids in this schematic with the same stage name (same "stage type")
    stage_ids_same_type = [
        r[0]
        for r in db.query(models.SewingLineStage.stage_id)
        .filter(
            models.SewingLineStage.schematic_id == stage.schematic_id,
            models.SewingLineStage.stage_name == stage.stage_name,
        )
        .all()
    ]
    if not stage_ids_same_type:
        return (batch_quantity if batch_quantity is not None else None, 0)

    # Sum quantity_produced for this batch where assignment.stage_id is in that set
    total_row = (
        db.query(func.coalesce(func.sum(models.ProductionHistory.quantity_produced), 0).label("total"))
        .join(
            models.WorkerDailyStageAssignment,
            models.ProductionHistory.daily_assignment_id == models.WorkerDailyStageAssignment.daily_assignment_id,
        )
        .filter(
            models.ProductionHistory.batch_id == batch_id,
            models.WorkerDailyStageAssignment.stage_id.in_(stage_ids_same_type),
        )
        .first()
    )
    total_already = int(total_row.total) if total_row and total_row.total is not None else 0

    if batch_quantity is None:
        return (None, total_already)
    max_allowed = max(0, batch_quantity - total_already)
    return (max_allowed, total_already)


def get_assignments_for_date(
    db: Session,
    assignment_date: date,
    active_only: bool = True,
):
    """List daily assignments for a date with worker name, stage name, schematic name.
    If active_only is True (default), only assignments with active=True are returned,
    so at most one assignment per stage per date (enforcing one active worker per stage)."""
    q = (
        db.query(
            models.WorkerDailyStageAssignment,
            models.Worker.worker_name,
            models.SewingLineStage.stage_name,
            models.SewingLineStage.stage_order,
            models.SewingLineSchematic.name.label("schematic_name"),
        )
        .join(models.Worker, models.WorkerDailyStageAssignment.worker_id == models.Worker.worker_id)
        .join(models.SewingLineStage, models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id)
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .filter(models.WorkerDailyStageAssignment.assignment_date == assignment_date)
    )
    if active_only:
        q = q.filter(models.WorkerDailyStageAssignment.active.is_(True))
    rows = q.order_by(
        models.SewingLineSchematic.schematic_id.asc(),
        models.SewingLineStage.stage_order.asc(),
    ).all()
    return rows


def get_or_create_assignment(
    db: Session,
    assignment_date: date,
    worker_id: int,
    stage_id: int,
    active: bool = True,
):
    """
    Get existing daily assignment or create one. Returns (assignment, created).
    Enforces at most one active assignment per (assignment_date, stage_id): when
    activating this assignment, any other assignment for the same stage and date
    is set active=False.
    """
    existing_stage = (
        db.query(models.WorkerDailyStageAssignment)
        .with_for_update()
        .filter(
            and_(
                models.WorkerDailyStageAssignment.assignment_date == assignment_date,
                models.WorkerDailyStageAssignment.worker_id == worker_id,
                models.WorkerDailyStageAssignment.stage_id == stage_id,
            )
        )
        .first()
    )

    # If caller is deactivating, just flip the flag (time accounting is driven
    # by stage switches when active=True).
    if not active:
        if existing_stage:
            existing_stage.active = False
            db.commit()
            db.refresh(existing_stage)
        return existing_stage, False

    now = datetime.now()

    def _get_worker_total_hours(target_worker_id: int, fallback_stage_id: int) -> float:
        worker_group_hours = (
            db.query(models.WorkersGroup.working_hours)
            .join(
                models.Worker,
                models.Worker.worker_group_id == models.WorkersGroup.group_id,
            )
            .filter(models.Worker.worker_id == target_worker_id)
            .scalar()
        )
        if worker_group_hours is not None:
            return float(worker_group_hours)
        stage_schematic_hours = (
            db.query(models.SewingLineSchematic.working_hours)
            .join(
                models.SewingLineStage,
                models.SewingLineStage.schematic_id
                == models.SewingLineSchematic.schematic_id,
            )
            .filter(models.SewingLineStage.stage_id == fallback_stage_id)
            .scalar()
        )
        return float(stage_schematic_hours or 0.0)

    def _elapsed_from(ts: Optional[datetime]) -> float:
        if ts is None:
            return 0.0
        return max(0.0, (now - ts).total_seconds() / 3600.0)

    def _remaining(total_hours: float, elapsed_hours: float) -> float:
        return max(0.0, float(total_hours) - float(elapsed_hours))

    # Active assignment currently occupying this stage/date (different worker).
    active_stage_other = (
        db.query(models.WorkerDailyStageAssignment)
        .with_for_update()
        .filter(
            and_(
                models.WorkerDailyStageAssignment.assignment_date == assignment_date,
                models.WorkerDailyStageAssignment.stage_id == stage_id,
                models.WorkerDailyStageAssignment.active.is_(True),
                models.WorkerDailyStageAssignment.worker_id != worker_id,
            )
        )
        .order_by(models.WorkerDailyStageAssignment.created_at.desc())
        .first()
    )

    worker_day_assignments = (
        db.query(models.WorkerDailyStageAssignment)
        .with_for_update()
        .filter(
            models.WorkerDailyStageAssignment.assignment_date == assignment_date,
            models.WorkerDailyStageAssignment.worker_id == worker_id,
        )
        .order_by(models.WorkerDailyStageAssignment.created_at.asc())
        .all()
    )

    # Standardized elapsed anchor for the whole day (all workers/stages/schematics):
    # first daily assignment created_at for this date.
    day_anchor_created_at = (
        db.query(func.min(models.WorkerDailyStageAssignment.created_at))
        .filter(models.WorkerDailyStageAssignment.assignment_date == assignment_date)
        .scalar()
    )
    elapsed_standard_day = _elapsed_from(day_anchor_created_at)

    # First assignment of the day: inherit total available working hours.
    # If this stage is being handed over from another worker on the same date,
    # use remaining hours for the new worker and elapsed hours for the replaced one.
    if not worker_day_assignments:
        inherited_total_hours = _get_worker_total_hours(worker_id, stage_id)

        if active_stage_other and active_stage_other.created_at is not None:
            elapsed_hours = elapsed_standard_day
            inherited_total_hours = _remaining(inherited_total_hours, elapsed_hours)

            # Old assignment should only be recalculated when still active.
            if getattr(active_stage_other, "active", False):
                outgoing_total_hours = _get_worker_total_hours(
                    active_stage_other.worker_id, stage_id
                )
                outgoing_current_hours = float(active_stage_other.working_hours or 0.0)
                active_stage_other.working_hours = _calc_elapsed_from_active(
                    outgoing_current_hours, outgoing_total_hours, elapsed_hours
                )
                active_stage_other.active = False

        assignment = models.WorkerDailyStageAssignment(
            assignment_date=assignment_date,
            worker_id=worker_id,
            stage_id=stage_id,
            active=True,
            working_hours=inherited_total_hours,
            created_at=now,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment, True

    # Compute remaining using standardized elapsed anchor for this day.
    first_row = worker_day_assignments[0]
    total_available_hours = _get_worker_total_hours(worker_id, first_row.stage_id)
    elapsed_worker_day = elapsed_standard_day
    remaining_at_event = _remaining(total_available_hours, elapsed_worker_day)

    # Determine previous/current stage using the most recently activated row.
    prev_row = worker_day_assignments[-1]
    is_stage_switch = prev_row.stage_id != stage_id

    if not is_stage_switch and existing_stage:
        if active_stage_other:
            # Worker switching on same stage/date.
            elapsed_at_event = elapsed_standard_day
            incoming_total_hours = _get_worker_total_hours(worker_id, stage_id)
            incoming_remaining = _remaining(incoming_total_hours, elapsed_at_event)

            # Switch-back to existing worker assignment: add remaining to existing elapsed.
            if not getattr(existing_stage, "active", False):
                existing_stage.working_hours = float(existing_stage.working_hours or 0.0) + incoming_remaining
            existing_stage.active = True

            # Old assignment should only be recalculated when still active.
            if getattr(active_stage_other, "active", False):
                outgoing_total_hours = _get_worker_total_hours(
                    active_stage_other.worker_id, stage_id
                )
                outgoing_current_hours = float(active_stage_other.working_hours or 0.0)
                active_stage_other.working_hours = _calc_elapsed_from_active(
                    outgoing_current_hours, outgoing_total_hours, elapsed_at_event
                )
                active_stage_other.active = False
        else:
            # Idempotent call: worker already at this stage.
            existing_stage.active = True
        db.commit()
        db.refresh(existing_stage)
        return existing_stage, False

    # Stage switch: convert previous stage remaining into elapsed time by
    # subtracting the new remaining-at-event.
    if getattr(prev_row, "active", False):
        prev_working_hours = float(prev_row.working_hours or 0.0)
        prev_row.working_hours = _calc_elapsed_from_active(
            prev_working_hours, total_available_hours, elapsed_worker_day
        )
        prev_row.active = False

    if active_stage_other:
        target_stage_elapsed = elapsed_standard_day
        if getattr(active_stage_other, "active", False):
            outgoing_total_hours = _get_worker_total_hours(
                active_stage_other.worker_id, stage_id
            )
            outgoing_current_hours = float(active_stage_other.working_hours or 0.0)
            active_stage_other.working_hours = _calc_elapsed_from_active(
                outgoing_current_hours, outgoing_total_hours, target_stage_elapsed
            )
            active_stage_other.active = False

    if existing_stage:
        # Reactivation of a stage: add the remaining time until end_time to
        # the stage's accumulated elapsed time.
        existing_working_hours = float(existing_stage.working_hours or 0.0)
        existing_stage.working_hours = existing_working_hours + remaining_at_event
        existing_stage.active = True
        db.commit()
        db.refresh(existing_stage)
        return existing_stage, False

    assignment = models.WorkerDailyStageAssignment(
        assignment_date=assignment_date,
        worker_id=worker_id,
        stage_id=stage_id,
        active=True,
        working_hours=remaining_at_event,
        created_at=now,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment, True


def record_production(
    db: Session,
    daily_assignment_id: int,
    barcode: str,
    quantity: int = 1,
    reference_date: Optional[date] = None,
) -> Tuple[Optional[object], Optional[int], Optional[str], Optional[int], Optional[int]]:
    """
    Record quantity produced for the given assignment and batch (from barcode).
    Enforces: for the same stage type (stage name within schematic), a batch cannot
    be read into production beyond its quantity; remainder = batch_quantity - already_produced.
    If reference_date is provided, the assignment is valid only when its assignment_date
    matches reference_date (otherwise server date is used).

    Returns:
        (row, batch_id, None, None, None) on success;
        (None, None, "batch_not_found", None, None) if batch not found;
        (None, None, "batch_completed", 0, total_already) if remainder is 0;
        (None, None, "exceeds_max", max_allowed, total_already) if quantity > max_allowed.
    """
    if quantity <= 0:
        return None, None, "invalid_quantity", None, None
    assignment = get_assignment_if_for_date(db, daily_assignment_id, reference_date)
    if not assignment:
        return None, None, "assignment_not_for_today", None, None
    batch = get_batch_by_barcode(db, barcode)
    if not batch:
        return None, None, "batch_not_found", None, None
    batch_id = batch.batch_id
    batch_quantity = getattr(batch, "quantity", None)

    # Enforce max quantity per stage type (same stage name in schematic)
    if batch_quantity is not None:
        max_allowed, total_already = get_max_allowed_quantity(
            db, daily_assignment_id, batch_id, batch_quantity, reference_date
        )
        if max_allowed == 0:
            return None, None, "batch_completed", 0, total_already
        if quantity > max_allowed:
            return None, None, "exceeds_max", max_allowed, total_already

    existing = (
        db.query(models.ProductionHistory)
        .filter(
            and_(
                models.ProductionHistory.daily_assignment_id == daily_assignment_id,
                models.ProductionHistory.batch_id == batch_id,
            )
        )
        .first()
    )
    if existing:
        existing.quantity_produced += quantity
        db.commit()
        db.refresh(existing)
        return existing, batch_id, None, None, None
    new_row = models.ProductionHistory(
        daily_assignment_id=daily_assignment_id,
        batch_id=batch_id,
        quantity_produced=quantity,
    )
    db.add(new_row)
    db.commit()
    db.refresh(new_row)
    return new_row, batch_id, None, None, None


def get_stages_from_batch_production_history(
    db: Session,
    batch_id: int,
    phase_id: Optional[int] = None,
) -> List[Tuple[int, str, int, str, int]]:
    """
    Get distinct stages for a batch from production_history.
    Queries production_history for batch_id, gets daily_assignment_ids, joins
    worker_daily_stage_assignments and sewing_line_stages to get stage info.
    If phase_id is provided, filters to stages belonging to that production phase
    (via sewing_line_schematics.production_phase_id).
    Returns list of (stage_id, stage_name, schematic_id, schematic_name, stage_order).
    """
    q = (
        db.query(
            models.SewingLineStage.stage_id,
            models.SewingLineStage.stage_name,
            models.SewingLineStage.schematic_id,
            models.SewingLineSchematic.name.label("schematic_name"),
            models.SewingLineStage.stage_order,
        )
        .join(
            models.WorkerDailyStageAssignment,
            models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id,
        )
        .join(
            models.ProductionHistory,
            models.ProductionHistory.daily_assignment_id
            == models.WorkerDailyStageAssignment.daily_assignment_id,
        )
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .filter(models.ProductionHistory.batch_id == batch_id)
    )
    if phase_id is not None:
        q = q.filter(models.SewingLineSchematic.production_phase_id == phase_id)

    rows = (
        q.distinct()
        .order_by(models.SewingLineStage.stage_order.asc())
        .all()
    )
    return [
        (r.stage_id, r.stage_name or "", r.schematic_id, r.schematic_name or "", r.stage_order)
        for r in rows
    ]


def get_daily_assignments_from_batch_production_history(
    db: Session,
    batch_id: int,
    phase_id: Optional[int] = None,
) -> List[Tuple[int, int, str, str, int, Optional[date]]]:
    """
    Get daily assignments with production for a batch from production_history.
    Returns list of (daily_assignment_id, worker_id, worker_name, stage_name, quantity_produced, assignment_date).
    If phase_id is provided, filters to assignments whose stage belongs to that production phase.
    Used for the responsible-phase dropdown when phase type is sewing.
    """
    q = (
        db.query(
            models.WorkerDailyStageAssignment.daily_assignment_id,
            models.Worker.worker_id,
            models.Worker.worker_name,
            models.SewingLineStage.stage_name,
            models.SewingLineStage.stage_order,
            func.sum(models.ProductionHistory.quantity_produced).label("quantity_produced"),
            models.WorkerDailyStageAssignment.assignment_date,
        )
        .join(
            models.ProductionHistory,
            models.ProductionHistory.daily_assignment_id
            == models.WorkerDailyStageAssignment.daily_assignment_id,
        )
        .join(models.Worker, models.WorkerDailyStageAssignment.worker_id == models.Worker.worker_id)
        .join(models.SewingLineStage, models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id)
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .filter(models.ProductionHistory.batch_id == batch_id)
    )
    if phase_id is not None:
        q = q.filter(models.SewingLineSchematic.production_phase_id == phase_id)

    rows = (
        q.group_by(
            models.WorkerDailyStageAssignment.daily_assignment_id,
            models.Worker.worker_id,
            models.Worker.worker_name,
            models.SewingLineStage.stage_name,
            models.SewingLineStage.stage_order,
            models.WorkerDailyStageAssignment.assignment_date,
        )
        .order_by(
            models.SewingLineStage.stage_order.asc(),
            models.Worker.worker_name.asc(),
        )
        .all()
    )
    return [
        (
            r.daily_assignment_id,
            r.worker_id,
            r.worker_name or "",
            r.stage_name or "",
            r.quantity_produced,
            r.assignment_date,
        )
        for r in rows
    ]


def get_phase_daily_production_total(
    db: Session,
    phase_id: int,
    work_date: date,
) -> Tuple[int, Optional[datetime], Optional[datetime]]:
    """
    Sum quantity_produced from production_history for the *last stage only* of each
    schematic belonging to the given production phase on a specific date.

    "Last stage" is defined by the highest stage_order per schematic.
    """
    # Subquery: for each schematic in this phase, get its max stage_order
    last_stage_subq = (
        db.query(
            models.SewingLineStage.schematic_id.label("schematic_id"),
            func.max(models.SewingLineStage.stage_order).label("max_order"),
        )
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .filter(models.SewingLineSchematic.production_phase_id == phase_id)
        .group_by(models.SewingLineStage.schematic_id)
        .subquery()
    )

    # Only count production where the assignment's stage is one of those "last" stages
    total_row = (
        db.query(
            func.coalesce(func.sum(models.ProductionHistory.quantity_produced), 0).label(
                "total"
            ),
            func.min(models.ProductionHistory.timestamp).label("first_ts"),
            func.max(models.ProductionHistory.timestamp).label("last_ts"),
        )
        .join(
            models.WorkerDailyStageAssignment,
            models.ProductionHistory.daily_assignment_id
            == models.WorkerDailyStageAssignment.daily_assignment_id,
        )
        .join(
            models.SewingLineStage,
            models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id,
        )
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .join(
            last_stage_subq,
            and_(
                models.SewingLineStage.schematic_id == last_stage_subq.c.schematic_id,
                models.SewingLineStage.stage_order == last_stage_subq.c.max_order,
            ),
        )
        .filter(
            models.SewingLineSchematic.production_phase_id == phase_id,
            models.WorkerDailyStageAssignment.assignment_date == work_date,
        )
        .first()
    )
    total = int(total_row.total) if total_row and total_row.total is not None else 0
    first_ts = getattr(total_row, "first_ts", None) if total_row else None
    last_ts = getattr(total_row, "last_ts", None) if total_row else None
    return total, first_ts, last_ts


def get_phase_expected_work_for_range(
    db: Session,
    phase_id: int,
    start_date: date,
    end_date: date,
) -> tuple[int, int, float, float, float]:
    """
    Compute expected work and expected hourly work for a phase over a date range.

    Only "active" schematics in the phase are included (SewingLineSchematic.active is True).

    - Expected hourly work = sum of hourly_production across active schematics in the phase.
    - Working days = distinct dates in [start_date, end_date] with at least one
      active worker assignment for this phase.
    - Expected work = for each active schematic: working_hours * hourly_production * working_days_count;
      these per-schematic expected amounts are summed to get the phase total.
    - Total possible working hours = working_days_count * working_hours_per_day, except when the range
      includes today: then today counts only hours elapsed so far (capped at working_hours_per_day).

    Returns (expected_quantity, working_days_count, expected_hourly_work, working_hours_per_day, total_possible_working_hours).
    """
    if start_date > end_date:
        return 0, 0, 0.0, 0.0, 0.0

    # Load active schematics for this phase only
    schematics = (
        db.query(models.SewingLineSchematic)
        .filter(
            models.SewingLineSchematic.production_phase_id == phase_id,
            models.SewingLineSchematic.active.is_(True),
        )
        .all()
    )
    if not schematics:
        return 0, 0, 0.0, 0.0, 0.0

    # Expected hourly work = sum of hourly_production for active schematics
    phase_expected_hourly = sum((s.hourly_production or 0) for s in schematics)

    # Working hours per day (sum across active schematics)
    phase_working_hours_per_day = sum(
        float(s.working_hours) if s.working_hours is not None else 0.0
        for s in schematics
    )

    # Per-schematic working dates: dates in range with at least one active assignment
    # for that schematic. Phase working days are the union of these dates.
    working_dates_rows = (
        db.query(
            models.SewingLineSchematic.schematic_id.label("schematic_id"),
            models.WorkerDailyStageAssignment.assignment_date.label("assignment_date"),
        )
        .join(
            models.SewingLineStage,
            models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id,
        )
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .filter(
            models.SewingLineSchematic.production_phase_id == phase_id,
            models.WorkerDailyStageAssignment.assignment_date >= start_date,
            models.WorkerDailyStageAssignment.assignment_date <= end_date,
            models.WorkerDailyStageAssignment.active.is_(True),
        )
        .distinct()
        .all()
    )

    schematic_working_dates: Dict[int, set[date]] = {}
    for row in working_dates_rows:
        sid = int(row.schematic_id)
        d = row.assignment_date
        if sid not in schematic_working_dates:
            schematic_working_dates[sid] = set()
        schematic_working_dates[sid].add(d)

    phase_working_date_set: set[date] = set()
    for dates in schematic_working_dates.values():
        phase_working_date_set.update(dates)
    working_days_count = len(phase_working_date_set)

    # Expected work and total possible working hours are now computed by
    # applying the same per-schematic logic as in get_schematic_work_for_phase_range
    # and summing the results across schematics.
    expected_quantity_total = 0
    total_possible_working_hours_total = 0.0

    today = date.today()
    midnight_today = datetime.combine(today, dt_time.min)
    now = datetime.now()
    hours_elapsed_today = max(
        0.0, (now - midnight_today).total_seconds() / 3600.0
    )

    for s in schematics:
        sid = int(s.schematic_id)
        wh = float(s.working_hours) if s.working_hours is not None else 0.0
        hp = s.hourly_production or 0

        working_dates_for_schematic = schematic_working_dates.get(sid, set())
        working_days_for_schematic = len(working_dates_for_schematic)

        expected_quantity_schematic = 0
        if wh > 0 and hp > 0 and working_days_for_schematic > 0:
            expected_quantity_schematic = int(wh * hp * working_days_for_schematic)

        # Per-schematic total possible working hours, with \"today\" partial logic
        if (
            end_date >= today
            and today in working_dates_for_schematic
            and working_days_for_schematic > 0
            and wh > 0
        ):
            capped_today_hours = min(hours_elapsed_today, wh)
            full_days = working_days_for_schematic - 1
            possible_hours_schematic = full_days * wh + capped_today_hours
        else:
            possible_hours_schematic = working_days_for_schematic * wh

        expected_quantity_total += expected_quantity_schematic
        total_possible_working_hours_total += possible_hours_schematic

    expected_hourly_float = float(phase_expected_hourly)

    return (
        expected_quantity_total,
        working_days_count,
        expected_hourly_float,
        phase_working_hours_per_day,
        total_possible_working_hours_total,
    )


def get_schematic_work_for_phase_range(
    db: Session,
    phase_id: int,
    start_date: date,
    end_date: date,
) -> List[Dict[str, object]]:
    """
    Compute expected and true work per schematic in a phase over a date range.

    - Only active schematics in the phase are included.
    - Expected quantity per schematic uses schematic config only:
      hourly_production * adjusted_working_hours.
    - adjusted_working_hours = base schematic hours in the range + overtime hours.
      Overtime hours are added only when an overtime entry's (stage_id, work_date)
      matches a final-stage row from reporting.worker_daily_stage_production.
    - True quantity/hourly come from reporting.worker_daily_stage_production
      final-stage rows in range.
    """
    if start_date > end_date:
        return []

    # Load active schematics for this phase only
    schematics = (
        db.query(models.SewingLineSchematic)
        .filter(
            models.SewingLineSchematic.production_phase_id == phase_id,
            models.SewingLineSchematic.active.is_(True),
        )
        .all()
    )
    if not schematics:
        return []

    # Per-schematic working dates: distinct dates in range with at least one active
    # assignment for that schematic (same definition as phase-level, but scoped).
    working_dates_rows = (
        db.query(
            models.SewingLineSchematic.schematic_id.label("schematic_id"),
            models.WorkerDailyStageAssignment.assignment_date.label("assignment_date"),
        )
        .join(
            models.SewingLineStage,
            models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id,
        )
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .filter(
            models.SewingLineSchematic.production_phase_id == phase_id,
            models.WorkerDailyStageAssignment.assignment_date >= start_date,
            models.WorkerDailyStageAssignment.assignment_date <= end_date,
            models.WorkerDailyStageAssignment.active.is_(True),
        )
        .distinct()
        .all()
    )
    schematic_working_dates: Dict[int, set[date]] = {}
    for row in working_dates_rows:
        sid = int(row.schematic_id)
        d = row.assignment_date
        if sid not in schematic_working_dates:
            schematic_working_dates[sid] = set()
        schematic_working_dates[sid].add(d)

    results: List[Dict[str, object]] = []
    for schematic in schematics:
        sid = int(schematic.schematic_id)
        name = schematic.name
        hourly = schematic.hourly_production or 0
        wh = float(schematic.working_hours) if schematic.working_hours is not None else 0.0

        # Working days and possible hours are computed per schematic, based on
        # assignments that actually used this schematic in the range.
        working_dates = schematic_working_dates.get(sid, set())
        working_days_count = len(working_dates)

        # Reporting-side true/working-hours over final-stage rows in date range.
        reporting_row = (
            db.query(
                func.coalesce(func.sum(models.WorkerDailyStageProduction.true_output), 0).label("true_sum"),
                func.coalesce(func.sum(models.WorkerDailyStageProduction.working_hours), 0).label("working_hours_sum"),
            )
            .join(
                models.SewingLineStage,
                models.WorkerDailyStageProduction.stage_id == models.SewingLineStage.stage_id,
            )
            .filter(
                models.SewingLineStage.schematic_id == sid,
                models.WorkerDailyStageProduction.work_date >= start_date,
                models.WorkerDailyStageProduction.work_date <= end_date,
                models.WorkerDailyStageProduction.is_final_stage.is_(True),
            )
            .first()
        )
        reporting_true_quantity = int(reporting_row.true_sum or 0) if reporting_row else 0
        final_stage_working_hours = float(reporting_row.working_hours_sum or 0.0) if reporting_row else 0.0

        # Base hours in range using schematic working hours with "today partial" logic.
        today = date.today()
        midnight_today = datetime.combine(today, dt_time.min)
        now = datetime.now()
        hours_elapsed_today = max(
            0.0, (now - midnight_today).total_seconds() / 3600.0
        )
        if (
            end_date >= today
            and today in working_dates
            and working_days_count > 0
            and wh > 0
        ):
            capped_today_hours = min(hours_elapsed_today, wh)
            full_days = working_days_count - 1
            base_hours = full_days * wh + capped_today_hours
        else:
            base_hours = working_days_count * wh

        # Add overtime hours only for entries matching final-stage rows by (stage_id, work_date).
        overtime_row = (
            db.query(
                func.coalesce(func.sum(models.WorkerOvertimeHistory.overtime_hours), 0).label("overtime_sum")
            )
            .join(
                models.WorkerDailyStageProduction,
                and_(
                    models.WorkerDailyStageProduction.stage_id == models.WorkerOvertimeHistory.stage_id,
                    models.WorkerDailyStageProduction.work_date == models.WorkerOvertimeHistory.work_date,
                ),
            )
            .join(
                models.SewingLineStage,
                models.WorkerDailyStageProduction.stage_id == models.SewingLineStage.stage_id,
            )
            .filter(
                models.SewingLineStage.schematic_id == sid,
                models.WorkerDailyStageProduction.work_date >= start_date,
                models.WorkerDailyStageProduction.work_date <= end_date,
                models.WorkerDailyStageProduction.is_final_stage.is_(True),
            )
            .first()
        )
        overtime_hours_total = float(overtime_row.overtime_sum or 0.0) if overtime_row else 0.0
        expected_hours_total = max(0.0, base_hours + overtime_hours_total)

        expected_hourly = float(hourly) if hourly else 0.0
        expected_quantity = (
            int(round(expected_hourly * expected_hours_total))
            if expected_hourly > 0 and expected_hours_total > 0
            else 0
        )

        true_quantity = reporting_true_quantity

        # True hourly uses final-stage working hours from reporting rows in range.
        true_hourly = (
            float(true_quantity) / final_stage_working_hours
            if final_stage_working_hours > 0 and true_quantity > 0
            else 0.0
        )

        efficiency_pct: Optional[float]
        if expected_quantity > 0:
            efficiency_pct = (float(true_quantity) / float(expected_quantity)) * 100.0
        else:
            efficiency_pct = None

        results.append(
            {
                "schematic_id": sid,
                "schematic_name": name,
                "expected_quantity": expected_quantity,
                "expected_hourly_work": expected_hourly,
                "true_quantity": true_quantity,
                "true_hourly_work": true_hourly,
                "efficiency_pct": efficiency_pct,
            }
        )

    return results


def get_schematic_worker_breakdown_for_range(
    db: Session,
    schematic_id: int,
    start_date: date,
    end_date: date,
) -> List[Dict[str, object]]:
    """
    Compute per-worker, per-stage, per-day expected and true output for a schematic.

    - Expected output: when a worker has a single stage on a day, expected = production_qty
      (hourly) * the assigned working_hours. When a worker has multiple stages the same day,
      expected is time-weighted using assignment created_at timestamps (first assignment
      = start; each subsequent assignment starts a new segment; remaining hours go to the
      last stage).
    - True output comes from production_history.quantity_produced summed per worker/stage/day,
      using the production_history.timestamp to determine the work date, and constrained so that
      DATE(timestamp) == assignment_date.
    """
    if start_date > end_date:
        return []

    # Query all assignments for this schematic in range with created_at for time-weighted expected
    assignment_rows = (
        db.query(
            models.WorkerDailyStageAssignment.worker_id,
            models.WorkerDailyStageAssignment.assignment_date,
            models.WorkerDailyStageAssignment.stage_id,
            models.WorkerDailyStageAssignment.daily_assignment_id,
            models.WorkerDailyStageAssignment.created_at,
            models.SewingLineStage.production_qty,
            models.WorkerDailyStageAssignment.working_hours,
        )
        .join(
            models.SewingLineStage,
            models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id,
        )
        .filter(
            models.SewingLineStage.schematic_id == schematic_id,
            models.WorkerDailyStageAssignment.assignment_date >= start_date,
            models.WorkerDailyStageAssignment.assignment_date <= end_date,
            models.WorkerDailyStageAssignment.active.is_(True),
        )
        .all()
    )
    assignments_by_worker_date: Dict[Tuple[int, date], List[Dict[str, Any]]] = {}
    for ar in assignment_rows:
        worker_id = int(ar.worker_id)
        assignment_date = ar.assignment_date
        key = (worker_id, assignment_date)
        if key not in assignments_by_worker_date:
            assignments_by_worker_date[key] = []
        assignments_by_worker_date[key].append({
            "worker_id": worker_id,
            "assignment_date": assignment_date,
            "stage_id": ar.stage_id,
            "daily_assignment_id": ar.daily_assignment_id,
            "created_at": ar.created_at,
            "production_qty": ar.production_qty,
            "working_hours": float(ar.working_hours) if ar.working_hours is not None else 0.0,
        })
    time_weighted_expected: Dict[Tuple[int, date], Dict[int, int]] = _compute_time_weighted_expected_per_stage(
        assignments_by_worker_date
    )

    # Base: daily assignments for this schematic in the date range
    assignments_subq = (
        db.query(
            models.WorkerDailyStageAssignment.daily_assignment_id.label(
                "daily_assignment_id"
            ),
            models.WorkerDailyStageAssignment.assignment_date.label(
                "assignment_date"
            ),
            models.Worker.worker_id.label("worker_id"),
            models.Worker.worker_name.label("worker_name"),
            models.SewingLineStage.stage_id.label("stage_id"),
            models.SewingLineStage.stage_name.label("stage_name"),
            models.SewingLineStage.stage_order.label("stage_order"),
            models.SewingLineStage.production_qty.label("hourly_expected_output"),
            models.WorkerDailyStageAssignment.working_hours.label("working_hours"),
        )
        .join(
            models.Worker,
            models.WorkerDailyStageAssignment.worker_id == models.Worker.worker_id,
        )
        .join(
            models.SewingLineStage,
            models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id,
        )
        .filter(
            models.SewingLineStage.schematic_id == schematic_id,
            models.WorkerDailyStageAssignment.assignment_date >= start_date,
            models.WorkerDailyStageAssignment.assignment_date <= end_date,
            models.WorkerDailyStageAssignment.active.is_(True),
        )
        .subquery()
    )

    # Outer-join production history, grouping by worker / stage / assignment_date
    work_date = assignments_subq.c.assignment_date

    q = (
        db.query(
            assignments_subq.c.worker_id,
            assignments_subq.c.worker_name,
            assignments_subq.c.stage_id,
            assignments_subq.c.stage_name,
            assignments_subq.c.stage_order,
            work_date.label("work_date"),
            assignments_subq.c.hourly_expected_output,
            assignments_subq.c.working_hours,
            func.coalesce(
                func.sum(models.ProductionHistory.quantity_produced), 0
            ).label("true_output"),
        )
        .outerjoin(
            models.ProductionHistory,
            and_(
                models.ProductionHistory.daily_assignment_id
                == assignments_subq.c.daily_assignment_id,
                func.date(models.ProductionHistory.timestamp) == work_date,
            ),
        )
        .group_by(
            assignments_subq.c.worker_id,
            assignments_subq.c.worker_name,
            assignments_subq.c.stage_id,
            assignments_subq.c.stage_name,
            assignments_subq.c.stage_order,
            work_date,
            assignments_subq.c.hourly_expected_output,
            assignments_subq.c.working_hours,
        )
        .order_by(
            assignments_subq.c.worker_name.asc(),
            assignments_subq.c.stage_order.asc(),
            work_date.asc(),
        )
    )

    rows = q.all()

    results: List[Dict[str, object]] = []
    aggregates: Dict[int, Dict[str, object]] = {}

    for r in rows:
        worker_id = int(r.worker_id)
        worker_name = r.worker_name or ""
        stage_id = int(r.stage_id)
        stage_name = r.stage_name or ""
        stage_order = int(r.stage_order)
        work_date_value: date = r.work_date
        hourly_expected = int(r.hourly_expected_output or 0)
        working_hours = float(r.working_hours or 0.0)
        # `working_hours` on WorkerDailyStageAssignment is maintained as the total
        # time the worker spent in this stage for the day (including remaining
        # time until end_time for the currently active stage).
        expected_output = (
            int(round(float(hourly_expected) * working_hours))
            if hourly_expected and working_hours > 0
            else 0
        )
        true_output = int(r.true_output or 0)

        efficiency_pct: Optional[float]
        if expected_output > 0:
            efficiency_pct = (true_output / float(expected_output)) * 100.0
        else:
            efficiency_pct = None

        results.append(
            {
                "worker_id": worker_id,
                "worker_name": worker_name,
                "stage_id": stage_id,
                "stage_name": stage_name,
                "stage_order": stage_order,
                "work_date": work_date_value,
                "expected_output": expected_output,
                "true_output": true_output,
                "efficiency_pct": efficiency_pct,
            }
        )

        agg = aggregates.get(worker_id)
        if not agg:
            agg = {
                "worker_id": worker_id,
                "worker_name": worker_name,
                "total_expected_output": 0,
                "total_true_output": 0,
            }
            aggregates[worker_id] = agg
        agg["total_expected_output"] += expected_output
        agg["total_true_output"] += true_output

    # Finalize aggregate efficiencies
    for agg in aggregates.values():
        total_expected = agg["total_expected_output"]
        total_true = agg["total_true_output"]
        if total_expected > 0:
            agg["efficiency_pct"] = (total_true / float(total_expected)) * 100.0
        else:
            agg["efficiency_pct"] = None

    # Return combined structure: caller will map to Pydantic models
    return [
        {
            "records": results,
            "aggregates": list(aggregates.values()),
        }
    ]


def get_all_workers_production_breakdown_for_range(
    db: Session,
    start_date: date,
    end_date: date,
) -> Dict[str, object]:
    """
    Worker-centric production breakdown across all phases and schematics in a date range.

    - Finds all schematic IDs that have at least one active assignment in [start_date, end_date].
    - For each schematic, reuses get_schematic_worker_breakdown_for_range, then aggregates
      its records by (worker_id, work_date) to one record per (worker, phase, schematic, date)
      with summed expected_output, summed true_output, and derived efficiency.
    - Returns records (with phase_name, schematic_name) and per-worker aggregates (totals).
    """
    if start_date > end_date:
        return {"records": [], "aggregates": []}

    # Schematic IDs that have at least one active assignment in range
    schematic_ids_rows = (
        db.query(models.SewingLineStage.schematic_id)
        .join(
            models.WorkerDailyStageAssignment,
            models.WorkerDailyStageAssignment.stage_id == models.SewingLineStage.stage_id,
        )
        .filter(
            models.WorkerDailyStageAssignment.assignment_date >= start_date,
            models.WorkerDailyStageAssignment.assignment_date <= end_date,
            models.WorkerDailyStageAssignment.active.is_(True),
        )
        .distinct()
        .all()
    )
    schematic_ids = [int(r.schematic_id) for r in schematic_ids_rows]

    all_records: List[Dict[str, object]] = []
    worker_totals: Dict[int, Dict[str, Any]] = {}  # worker_id -> { expected_sum, true_sum, worker_name }

    for schematic_id in schematic_ids:
        schematic = (
            db.query(models.SewingLineSchematic)
            .filter(models.SewingLineSchematic.schematic_id == schematic_id)
            .first()
        )
        if not schematic:
            continue
        phase = (
            db.query(models.ProductionPhase)
            .filter(models.ProductionPhase.phase_id == schematic.production_phase_id)
            .first()
        )
        phase_id = int(schematic.production_phase_id)
        phase_name = (phase.phase_name or "") if phase else ""
        schematic_name = schematic.name or ""

        breakdown_list = get_schematic_worker_breakdown_for_range(
            db, schematic_id, start_date, end_date
        )
        if not breakdown_list:
            continue
        payload = breakdown_list[0]
        records = payload.get("records") or []

        # Aggregate by (worker_id, work_date) for this schematic
        by_worker_date: Dict[Tuple[int, date], Dict[str, Any]] = {}
        for r in records:
            worker_id = int(r["worker_id"])
            work_date_value = r["work_date"]
            key = (worker_id, work_date_value)
            if key not in by_worker_date:
                by_worker_date[key] = {
                    "worker_id": worker_id,
                    "worker_name": r["worker_name"],
                    "expected_output": 0,
                    "true_output": 0,
                }
            by_worker_date[key]["expected_output"] += int(r["expected_output"])
            by_worker_date[key]["true_output"] += int(r["true_output"])

        for (worker_id, work_date_value), v in by_worker_date.items():
            exp = v["expected_output"]
            true_val = v["true_output"]
            eff = (true_val / float(exp) * 100.0) if exp > 0 else None
            rec = {
                "worker_id": worker_id,
                "worker_name": v["worker_name"],
                "phase_id": phase_id,
                "phase_name": phase_name,
                "schematic_id": schematic_id,
                "schematic_name": schematic_name,
                "work_date": work_date_value,
                "expected_output": exp,
                "true_output": true_val,
                "efficiency_pct": eff,
            }
            all_records.append(rec)

            if worker_id not in worker_totals:
                worker_totals[worker_id] = {
                    "worker_id": worker_id,
                    "worker_name": v["worker_name"],
                    "total_expected_output": 0,
                    "total_true_output": 0,
                }
            worker_totals[worker_id]["total_expected_output"] += exp
            worker_totals[worker_id]["total_true_output"] += true_val

    # Sort records by worker_name, phase_name, schematic_name, work_date
    def sort_key(r: Dict[str, object]) -> tuple:
        return (
            str(r.get("worker_name") or ""),
            str(r.get("phase_name") or ""),
            str(r.get("schematic_name") or ""),
            r.get("work_date") or date.min,
        )
    all_records.sort(key=sort_key)

    # Build aggregates with efficiency
    aggregates_list: List[Dict[str, object]] = []
    for agg in worker_totals.values():
        total_expected = agg["total_expected_output"]
        total_true = agg["total_true_output"]
        efficiency_pct = (
            (total_true / float(total_expected) * 100.0) if total_expected > 0 else None
        )
        aggregates_list.append({
            "worker_id": agg["worker_id"],
            "worker_name": agg["worker_name"],
            "total_expected_output": total_expected,
            "total_true_output": total_true,
            "efficiency_pct": efficiency_pct,
        })
    aggregates_list.sort(key=lambda a: (str(a.get("worker_name") or ""),))

    return {"records": all_records, "aggregates": aggregates_list}


def get_sewing_daily_report_data(
    db: Session,
    target_date: date,
) -> List[Dict[str, Any]]:
    """
    Build Sewing daily report data for a single date.

    Returns a nested structure:
    - phases: [ { phase_id, phase_name, schematics: [...] } ]
    - per schematic: stages with expected, worker list + true, efficiency, and schematic totals.
    """
    # Phases of type "sewing", excluding the base "Sewing" phase
    phases = (
        db.query(models.ProductionPhase)
        .filter(
            (models.ProductionPhase.type == "sewing"),
            func.lower(func.trim(models.ProductionPhase.phase_name)) != "sewing",
        )
        .order_by(
            func.coalesce(models.ProductionPhase.sequence_order, 999).asc(),
            models.ProductionPhase.phase_id.asc(),
        )
        .all()
    )
    if not phases:
        return []

    result: List[Dict[str, Any]] = []

    for phase in phases:
        phase_id = int(phase.phase_id)
        phase_name = phase.phase_name or ""

        # Active schematics for this phase
        schematics = (
            db.query(models.SewingLineSchematic)
            .filter(
                models.SewingLineSchematic.production_phase_id == phase_id,
                func.coalesce(models.SewingLineSchematic.active, False).is_(True),
            )
            .order_by(models.SewingLineSchematic.schematic_id.asc())
            .all()
        )

        phase_entry: Dict[str, Any] = {
            "phase_id": phase_id,
            "phase_name": phase_name,
            "schematics": [],
        }

        if not schematics:
            result.append(phase_entry)
            continue

        for schematic in schematics:
            schematic_id = int(schematic.schematic_id)
            schematic_name = schematic.name or ""
            working_hours = float(schematic.working_hours or 0.0)
            schematic_active = bool(getattr(schematic, "active", False))

            if not schematic_active:
                continue

            # Stages for this schematic (ordered)
            stages = (
                db.query(models.SewingLineStage)
                .filter(models.SewingLineStage.schematic_id == schematic_id)
                .order_by(
                    models.SewingLineStage.stage_order.asc(),
                    models.SewingLineStage.stage_id.asc(),
                )
                .all()
            )

            stages_by_id: Dict[int, Dict[str, Any]] = {}
            # NOTE: schematic_* totals here are for ALL stages (kept for reference),
            # while line_* totals below are based on last stage(s) only.
            schematic_expected_total = 0
            schematic_true_total = 0

            for stage in stages:
                stage_id = int(stage.stage_id)
                stage_name = stage.stage_name or ""
                stage_order = int(getattr(stage, "stage_order", 0) or 0)
                hourly_qty = int(stage.production_qty or 0)
                expected = int(working_hours * hourly_qty) if working_hours > 0 and hourly_qty > 0 else 0

                stages_by_id[stage_id] = {
                    "stage_id": stage_id,
                    "stage_name": stage_name,
                    "stage_order": stage_order,
                    "expected": expected,
                    "workers": [],
                    "total_true": 0,
                    "efficiency_pct": None,
                }
                schematic_expected_total += expected

            # Worker breakdown for this schematic and date
            breakdown_list = get_schematic_worker_breakdown_for_range(
                db,
                schematic_id,
                target_date,
                target_date,
            )
            if breakdown_list:
                payload = breakdown_list[0] or {}
                records = payload.get("records") or []
            else:
                records = []

            # Aggregate true output per stage and build worker lists
            for rec in records:
                stage_id = int(rec.get("stage_id"))
                stage_entry = stages_by_id.get(stage_id)
                if not stage_entry:
                    continue

                worker_id = int(rec.get("worker_id"))
                worker_name = str(rec.get("worker_name") or "")
                true_output = int(rec.get("true_output") or 0)

                # Always include workers, even when true_output == 0,
                # so the report shows who was assigned to the stage.
                stage_entry["workers"].append(
                    {
                        "worker_id": worker_id,
                        "worker_name": worker_name,
                        "true_output": true_output,
                    }
                )
                stage_entry["total_true"] += true_output
                schematic_true_total += true_output

            # Compute efficiencies per stage
            for stage_entry in stages_by_id.values():
                expected = int(stage_entry["expected"] or 0)
                total_true = int(stage_entry["total_true"] or 0)
                if expected > 0:
                    stage_entry["efficiency_pct"] = (total_true / float(expected)) * 100.0
                else:
                    stage_entry["efficiency_pct"] = None

            # Line totals for analytics: only stages with the highest stage_order
            if stages_by_id:
                max_stage_order = max(int(s.get("stage_order") or 0) for s in stages_by_id.values())
                last_stages = [
                    s for s in stages_by_id.values() if int(s.get("stage_order") or 0) == max_stage_order
                ]
            else:
                max_stage_order = 0
                last_stages = []

            line_expected_total = sum(int(s.get("expected") or 0) for s in last_stages)
            line_true_total = sum(int(s.get("total_true") or 0) for s in last_stages)
            line_efficiency_pct: Optional[float]
            if line_expected_total > 0:
                line_efficiency_pct = (line_true_total / float(line_expected_total)) * 100.0
            else:
                line_efficiency_pct = None

            line_shortage = max(0, int(line_expected_total) - int(line_true_total))

            # Keep the previous schematic_* efficiency (all stages), but expose the new line_* analytics
            schematic_efficiency_pct: Optional[float]
            if schematic_expected_total > 0:
                schematic_efficiency_pct = (schematic_true_total / float(schematic_expected_total)) * 100.0
            else:
                schematic_efficiency_pct = None

            schematic_entry = {
                "schematic_id": schematic_id,
                "schematic_name": schematic_name,
                "working_hours": working_hours,
                "active": schematic_active,
                "stages": sorted(
                    stages_by_id.values(),
                    key=lambda s: (s.get("stage_order") or 0, s.get("stage_name") or ""),
                ),
                "schematic_expected_total": schematic_expected_total,
                "schematic_true_total": schematic_true_total,
                "schematic_efficiency_pct": schematic_efficiency_pct,
                "line_expected_total": line_expected_total,
                "line_true_total": line_true_total,
                "line_efficiency_pct": line_efficiency_pct,
                "line_shortage": line_shortage,
            }

            phase_entry["schematics"].append(schematic_entry)

        result.append(phase_entry)

    return result
