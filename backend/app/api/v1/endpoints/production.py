from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db.session import get_db
from app import crud, schemas, models
from app.crud import rework_batch as rework_batch_crud
from app.core.deps import get_current_active_superuser, get_current_general_ops_or_above
from app.services.workers_production_breakdown import build_all_workers_production_breakdown
from typing import Annotated, List, Optional, Tuple
from collections import defaultdict

router = APIRouter()

MSG_SCHEMATIC_NOT_FOUND = "Schematic not found"
MSG_DATE_RANGE_INVALID = "date_from must be <= date_to"

_OPENAPI_404 = {404: {"description": "Not found"}}
_OPENAPI_400 = {400: {"description": "Bad request"}}
_OPENAPI_409 = {409: {"description": "Conflict"}}
_OPENAPI_400_404 = {**_OPENAPI_400, **_OPENAPI_404}


@router.get("/schematics", response_model=List[schemas.SewingLineSchematic])
def list_sewing_line_schematics(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
    active_only: bool = False,
):
    """List all sewing line schematics (optionally active only), ordered by phase and schematic id."""
    return crud.schematic.get_schematics(db, skip=skip, limit=limit, active_only=active_only)


@router.get(
    "/schematics/{schematic_id}",
    response_model=schemas.SewingLineSchematicDetail,
    responses=_OPENAPI_404,
)
def get_schematic(schematic_id: int, db: Annotated[Session, Depends(get_db)]):
    """Get a single schematic by ID with its stages."""
    row = crud.schematic.get_schematic_by_id(db, schematic_id)
    if not row:
        raise HTTPException(status_code=404, detail=MSG_SCHEMATIC_NOT_FOUND)
    schematic, phase_name = row
    stages = crud.schematic.get_stages_for_schematic(db, schematic_id)
    return schemas.SewingLineSchematicDetail(
        schematic_id=schematic.schematic_id,
        production_phase_id=schematic.production_phase_id,
        name=schematic.name,
        active=schematic.active,
        phase_name=phase_name,
        working_hours=float(schematic.working_hours) if schematic.working_hours is not None else None,
        hourly_production=schematic.hourly_production,
        start_time=schematic.start_time,
        stages=[
            schemas.SewingLineStageResponse(
                stage_id=s.stage_id,
                schematic_id=s.schematic_id,
                stage_name=s.stage_name,
                stage_order=s.stage_order,
                production_qty=s.production_qty,
                is_in_final_stage=s.is_in_final_stage,
                active=s.active,
            )
            for s in stages
        ],
    )


@router.put(
    "/schematics/{schematic_id}",
    response_model=schemas.SewingLineSchematic,
    responses=_OPENAPI_404,
)
def update_schematic(
    schematic_id: int,
    data: schemas.SewingLineSchematicUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    """Update a schematic (name, phase, active, working_hours, and optionally replace all stages)."""
    updated = crud.schematic.update_schematic(db, schematic_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail=MSG_SCHEMATIC_NOT_FOUND)
    phase_row = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == updated.production_phase_id
    ).first()
    phase_name = phase_row.phase_name if phase_row else None
    return schemas.SewingLineSchematic(
        schematic_id=updated.schematic_id,
        production_phase_id=updated.production_phase_id,
        name=updated.name,
        active=updated.active,
        phase_name=phase_name,
        working_hours=float(updated.working_hours) if updated.working_hours is not None else None,
        hourly_production=updated.hourly_production,
        start_time=updated.start_time,
    )


@router.post("/schematics", response_model=schemas.SewingLineSchematic)
def create_sewing_line_schematic(
    schematic: schemas.SewingLineSchematicCreate,
    db: Annotated[Session, Depends(get_db)],
):
    """Create a new sewing line schematic."""
    db_schematic = crud.schematic.create_schematic(db, schematic)
    phase_row = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == db_schematic.production_phase_id
    ).first()
    phase_name = phase_row.phase_name if phase_row else None
    return schemas.SewingLineSchematic(
        schematic_id=db_schematic.schematic_id,
        production_phase_id=db_schematic.production_phase_id,
        name=db_schematic.name,
        active=db_schematic.active,
        phase_name=phase_name,
        working_hours=float(db_schematic.working_hours) if db_schematic.working_hours is not None else None,
        hourly_production=db_schematic.hourly_production,
        start_time=db_schematic.start_time,
    )


@router.delete(
    "/schematics/{schematic_id}",
    response_model=schemas.SewingLineSchematicDeleteResult,
    responses=_OPENAPI_404,
)
def delete_schematic_cascade(
    schematic_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[models.User, Depends(get_current_active_superuser)],
):
    """
    Admin only. Permanently delete a schematic and all sewing production data tied to it
    (overtime requests/history, worker–stage assignments, production_history, reporting snapshots, stages).
    Does not delete batches.
    """
    result = crud.schematic.delete_schematic_cascade(db, schematic_id)
    if not result:
        raise HTTPException(status_code=404, detail=MSG_SCHEMATIC_NOT_FOUND)
    return result


# Workers
@router.get("/workers", response_model=List[schemas.Worker])
def list_workers(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 500,
    active_only: bool = False,
):
    """List all workers."""
    return crud.worker.get_workers(db, skip=skip, limit=limit, active_only=active_only)


@router.get(
    "/workers/breakdown",
    response_model=schemas.AllWorkersProductionBreakdownResponse,
    responses=_OPENAPI_400,
)
def get_all_workers_breakdown(
    date_from: date,
    date_to: date,
    db: Annotated[Session, Depends(get_db)],
):
    """
    All-workers production breakdown over a date range. Returns per-worker records
    (phase, schematic, date, expected, true, efficiency) and per-worker totals
    across all phases and schematics.
    """
    if date_from > date_to:
        raise HTTPException(status_code=400, detail=MSG_DATE_RANGE_INVALID)

    return build_all_workers_production_breakdown(db, date_from, date_to)


@router.get(
    "/sewing/schematic-daily-production",
    response_model=List[schemas.SchematicDailyProductionRecord],
    responses=_OPENAPI_400,
)
def get_sewing_schematic_daily_production(
    date_from: date,
    date_to: date,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Daily expected/true output per schematic in sewing phases.

    - `expected_output` is derived from whether a schematic has any active stage
      assignment on that day (schematic working-days), multiplied by the
      schematic's configured working hours and hourly production.
    - `true_output` comes from `reporting.worker_daily_stage_production`, aggregated
      from final stage(s) only.

    This makes range aggregation a simple sum over days on the client.
    """
    if date_from > date_to:
        raise HTTPException(status_code=400, detail=MSG_DATE_RANGE_INVALID)

    rows = db.execute(
        text(
            """
            WITH working_days AS (
                -- A schematic "works" on a day if there is at least one active worker
                -- assignment for any stage in that schematic on that day.
                SELECT DISTINCT
                    p.phase_id,
                    p.phase_name,
                    sch.schematic_id,
                    sch.name AS schematic_name,
                    w.assignment_date AS work_date
                FROM ops.worker_daily_stage_assignments w
                JOIN core.sewing_line_stages st
                  ON st.stage_id = w.stage_id
                JOIN core.sewing_line_schematics sch
                  ON sch.schematic_id = st.schematic_id
                JOIN core.production_phases p
                  ON p.phase_id = sch.production_phase_id
                WHERE w.active IS TRUE
                  AND w.assignment_date >= :date_from
                  AND w.assignment_date <= :date_to
            ),
            expected_per_day AS (
                SELECT
                    wd.phase_id,
                    wd.phase_name,
                    wd.schematic_id,
                    wd.schematic_name,
                    wd.work_date,
                    (COALESCE(sch.working_hours, 0) * COALESCE(sch.hourly_production, 0))::int AS expected_output
                FROM working_days wd
                JOIN core.sewing_line_schematics sch
                  ON sch.schematic_id = wd.schematic_id
            ),
            true_per_day AS (
                -- True output is still final-stage only (max stage_order per schematic),
                -- and it comes from the precomputed reporting table.
                SELECT
                    p.phase_id,
                    p.phase_name,
                    sch.schematic_id,
                    sch.name AS schematic_name,
                    r.work_date,
                    SUM(r.true_output)::int AS true_output
                FROM reporting.worker_daily_stage_production r
                JOIN core.sewing_line_stages st
                  ON st.stage_id = r.stage_id
                JOIN (
                    SELECT schematic_id, MAX(stage_order) AS max_stage_order
                    FROM core.sewing_line_stages
                    GROUP BY schematic_id
                ) last_stages
                  ON last_stages.schematic_id = st.schematic_id
                 AND last_stages.max_stage_order = st.stage_order
                JOIN core.sewing_line_schematics sch
                  ON sch.schematic_id = st.schematic_id
                JOIN core.production_phases p
                  ON p.phase_id = sch.production_phase_id
                WHERE r.work_date >= :date_from
                  AND r.work_date <= :date_to
                GROUP BY
                    p.phase_id,
                    p.phase_name,
                    sch.schematic_id,
                    sch.name,
                    r.work_date
            )
            SELECT
                e.phase_id,
                e.phase_name,
                e.schematic_id,
                e.schematic_name,
                e.work_date,
                e.expected_output,
                COALESCE(t.true_output, 0)::int AS true_output
            FROM expected_per_day e
            LEFT JOIN true_per_day t
              ON t.phase_id = e.phase_id
             AND t.schematic_id = e.schematic_id
             AND t.work_date = e.work_date
            ORDER BY
                e.phase_name ASC,
                e.schematic_name ASC,
                e.work_date ASC;
            """
        ),
        {"date_from": date_from, "date_to": date_to},
    ).mappings().all()

    return [
        schemas.SchematicDailyProductionRecord(
            phase_id=int(r["phase_id"]),
            phase_name=str(r["phase_name"]),
            schematic_id=int(r["schematic_id"]),
            schematic_name=str(r["schematic_name"]),
            work_date=r["work_date"],
            expected_output=int(r["expected_output"] or 0),
            true_output=int(r["true_output"] or 0),
        )
        for r in rows
    ]


@router.get(
    "/workers/{worker_id}",
    response_model=schemas.Worker,
    responses=_OPENAPI_404,
)
def get_worker(worker_id: int, db: Annotated[Session, Depends(get_db)]):
    """Get a worker by ID (e.g. for barcode lookup where barcode encodes worker_id)."""
    worker = crud.worker.get_worker_by_id(db, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    return worker


@router.post("/workers", response_model=schemas.Worker, responses=_OPENAPI_409)
def create_worker(
    worker: schemas.WorkerCreate,
    db: Annotated[Session, Depends(get_db)],
):
    """Create a new worker. If worker_id is provided, it must not already exist."""
    if worker.worker_id is not None:
        existing = crud.worker.get_worker_by_id(db, worker.worker_id)
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Worker ID already in use. Choose another or leave blank for auto.",
            )
    return crud.worker.create_worker(db, worker)


@router.put(
    "/workers/{worker_id}",
    response_model=schemas.Worker,
    responses=_OPENAPI_404,
)
def update_worker(
    worker_id: int,
    worker_in: schemas.WorkerUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    """Update a worker (e.g. assign to a different worker group)."""
    updated = crud.worker.update_worker(db, worker_id, worker_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Worker not found")
    return updated


# Worker Groups
@router.get("/worker-groups", response_model=List[schemas.WorkerGroup])
def list_worker_groups(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 500,
):
    """List all worker groups with their default working hours."""
    return crud.worker_group.get_worker_groups(db, skip=skip, limit=limit)


@router.get(
    "/worker-groups/{group_id}",
    response_model=schemas.WorkerGroup,
    responses=_OPENAPI_404,
)
def get_worker_group(group_id: int, db: Annotated[Session, Depends(get_db)]):
    """Get a worker group by ID."""
    group = crud.worker_group.get_worker_group_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Worker group not found")
    return group


@router.post("/worker-groups", response_model=schemas.WorkerGroup)
def create_worker_group(
    group: schemas.WorkerGroupCreate,
    db: Annotated[Session, Depends(get_db)],
):
    """Create a new worker group (name + working hours)."""
    return crud.worker_group.create_worker_group(db, group)


@router.put(
    "/worker-groups/{group_id}",
    response_model=schemas.WorkerGroup,
    responses=_OPENAPI_404,
)
def update_worker_group(
    group_id: int,
    group_in: schemas.WorkerGroupUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    """Update worker group fields (e.g. working_hours)."""
    updated = crud.worker_group.update_worker_group(db, group_id, group_in)
    if not updated:
        raise HTTPException(status_code=404, detail="Worker group not found")
    return updated


# Production tracking (daily assignments + record production by barcode)
@router.get("/stages", response_model=List[schemas.StageOption])
def list_stages(db: Annotated[Session, Depends(get_db)]):
    """List all sewing line stages with schematic name (for assignment dropdown)."""
    rows = (
        db.query(
            models.SewingLineStage,
            models.SewingLineSchematic.name.label("schematic_name"),
        )
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .order_by(models.SewingLineSchematic.schematic_id.asc(), models.SewingLineStage.stage_order.asc())
        .all()
    )
    return [
        schemas.StageOption(
            stage_id=s.stage_id,
            stage_name=s.stage_name,
            schematic_id=s.schematic_id,
            schematic_name=name or "",
            stage_order=s.stage_order,
        )
        for s, name in rows
    ]


@router.get("/assignments", response_model=List[schemas.DailyAssignmentResponse])
def list_assignments(
    assignment_date: date,
    db: Annotated[Session, Depends(get_db)],
):
    """List daily stage assignments for a date (worker + stage + schematic name)."""
    rows = crud.tracking.get_assignments_for_date(db, assignment_date)
    return [
        schemas.DailyAssignmentResponse(
            daily_assignment_id=a.daily_assignment_id,
            assignment_date=a.assignment_date,
            worker_id=a.worker_id,
            worker_name=worker_name or "",
            stage_id=a.stage_id,
            stage_name=stage_name or "",
            schematic_name=schematic_name or "",
            working_hours=getattr(a, "working_hours", None),
            active=getattr(a, "active", True),
        )
        for a, worker_name, stage_name, _stage_order, schematic_name in rows
    ]


@router.post("/assignments", response_model=schemas.DailyAssignmentResponse)
def create_or_get_assignment(
    body: schemas.DailyAssignmentCreate,
    db: Annotated[Session, Depends(get_db)],
):
    """Get or create a daily assignment for the given date, worker, and stage."""
    assignment, _created = crud.tracking.get_or_create_assignment(
        db, body.assignment_date, body.worker_id, body.stage_id, active=body.active
    )
    worker = db.query(models.Worker).filter(models.Worker.worker_id == assignment.worker_id).first()
    stage = (
        db.query(models.SewingLineStage, models.SewingLineSchematic.name)
        .join(
            models.SewingLineSchematic,
            models.SewingLineStage.schematic_id == models.SewingLineSchematic.schematic_id,
        )
        .filter(models.SewingLineStage.stage_id == assignment.stage_id)
        .first()
    )
    stage_name = stage[0].stage_name if stage else ""
    schematic_name = stage[1] if stage else ""
    return schemas.DailyAssignmentResponse(
        daily_assignment_id=assignment.daily_assignment_id,
        assignment_date=assignment.assignment_date,
        worker_id=assignment.worker_id,
        worker_name=worker.worker_name if worker else "",
        stage_id=assignment.stage_id,
        stage_name=stage_name,
        schematic_name=schematic_name,
        working_hours=getattr(assignment, "working_hours", None),
        active=getattr(assignment, "active", True),
    )


@router.post(
    "/rework/batches",
    response_model=schemas.ReworkBatchResponse,
    responses=_OPENAPI_400,
)
def create_rework_batch(
    body: schemas.ReworkBatchCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[models.User, Depends(get_current_general_ops_or_above)],
):
    try:
        return rework_batch_crud.create_rework_batch(db, body, created_by_user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/rework/batches", response_model=List[schemas.ReworkBatchResponse])
def list_rework_batches(
    db: Annotated[Session, Depends(get_db)],
    source_batch_id: Optional[int] = None,
    printed: Optional[bool] = None,
):
    return rework_batch_crud.list_rework_batches(
        db=db,
        source_batch_id=source_batch_id,
        printed=printed,
    )


@router.patch(
    "/rework/batches/{rework_batch_id}",
    response_model=schemas.ReworkBatchResponse,
    responses=_OPENAPI_404,
)
def update_rework_batch(
    rework_batch_id: int,
    body: schemas.ReworkBatchUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    updated = rework_batch_crud.update_rework_batch(db, rework_batch_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Rework batch not found")
    return updated


@router.get(
    "/tracking/max-quantity",
    response_model=schemas.MaxProductionQuantityResponse,
    responses=_OPENAPI_400_404,
)
def get_max_production_quantity(
    db: Annotated[Session, Depends(get_db)],
    daily_assignment_id: int,
    barcode: str,
    tracking_date: Optional[date] = None,
):
    """Return max quantity that can be recorded for this batch at this stage type (same stage name in schematic).
    Assignment must be for tracking_date if provided, otherwise for the current server date."""
    assignment = crud.tracking.get_assignment_if_for_date(db, daily_assignment_id, tracking_date)
    if not assignment:
        raise HTTPException(
            status_code=400,
            detail="Assignment must be for the current date and active. Only today's active assignments are valid for production tracking.",
        )
    batch = crud.batch.get_batch_by_barcode(db, barcode)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found for this barcode.")
    batch_quantity = getattr(batch, "quantity", None)
    max_allowed, total_already = crud.tracking.get_max_allowed_quantity(
        db, daily_assignment_id, batch.batch_id, batch_quantity, tracking_date
    )
    return schemas.MaxProductionQuantityResponse(
        max_allowed=max_allowed,
        total_already=total_already,
        batch_quantity=batch_quantity,
    )


@router.post(
    "/tracking/record",
    response_model=schemas.RecordProductionResponse,
    responses=_OPENAPI_400_404,
)
def record_production(
    body: schemas.RecordProductionRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """Record quantity produced for the given assignment and barcode (batch).
    Enforces: per stage type (same stage name in schematic), a batch cannot exceed
    its quantity; if remainder is 0 the batch is completed and cannot be read again."""
    if body.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive.")
    row, _batch_id, error_code, max_allowed, total_already = crud.tracking.record_production(
        db, body.daily_assignment_id, body.barcode, body.quantity, body.tracking_date
    )
    if error_code == "assignment_not_for_today":
        raise HTTPException(
            status_code=400,
            detail="Assignment must be for the current date and active. Only today's active assignments are valid for production tracking.",
        )
    if error_code == "batch_not_found":
        raise HTTPException(status_code=404, detail="Batch not found for this barcode.")
    if error_code == "batch_completed":
        raise HTTPException(
            status_code=400,
            detail=f"Batch already completed for this stage type (quantity already produced: {total_already}). Cannot record again.",
        )
    if error_code == "exceeds_max":
        raise HTTPException(
            status_code=400,
            detail=f"Maximum quantity allowed for this batch at this stage type is {max_allowed} (already produced: {total_already}).",
        )
    if error_code or row is None:
        raise HTTPException(status_code=400, detail="Could not record production.")
    return schemas.RecordProductionResponse(
        production_id=row.production_id,
        batch_id=row.batch_id,
        barcode=body.barcode,
        quantity_produced=row.quantity_produced,
    )




@router.get(
    "/phase-daily-production",
    response_model=schemas.PhaseDailyProductionResponse,
)
def get_phase_daily_production(
    phase_id: int,
    target_date: date,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Get total quantity produced (from production_history) for a production phase
    on a specific date, aggregating across all schematics and stages.
    Also returns the first and last production timestamps for that date.
    """
    total, first_ts, last_ts = crud.tracking.get_phase_daily_production_total(
        db, phase_id, target_date
    )
    return schemas.PhaseDailyProductionResponse(
        phase_id=phase_id,
        date=target_date,
        total_quantity=total,
        first_timestamp=first_ts,
        last_timestamp=last_ts,
    )


@router.get(
    "/phase-expected-work-range",
    response_model=schemas.PhaseExpectedWorkRangeResponse,
    responses=_OPENAPI_400,
)
def get_phase_expected_work_range(
    phase_id: int,
    date_from: date,
    date_to: date,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Get total expected work for a phase over a date range.

    A day's expected work for a schematic is only counted if there is at least one
    active worker assignment on that day for any of its stages.
    """
    if date_from > date_to:
        raise HTTPException(status_code=400, detail=MSG_DATE_RANGE_INVALID)
    (
        expected,
        working_days_count,
        expected_hourly_work,
        working_hours_per_day,
        total_possible_working_hours,
    ) = crud.tracking.get_phase_expected_work_for_range(
        db, phase_id, date_from, date_to
    )
    return schemas.PhaseExpectedWorkRangeResponse(
        phase_id=phase_id,
        date_from=date_from,
        date_to=date_to,
        expected_quantity=expected,
        working_days_count=working_days_count,
        expected_hourly_work=expected_hourly_work,
        working_hours_per_day=working_hours_per_day,
        total_possible_working_hours=total_possible_working_hours,
    )


@router.get(
    "/schematics/{schematic_id}/worker-breakdown",
    response_model=schemas.SchematicWorkerBreakdownResponse,
    responses=_OPENAPI_400_404,
)
def get_schematic_worker_breakdown(
    schematic_id: int,
    date_from: date,
    date_to: date,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Worker-level production breakdown for a schematic over a date range.

    Expected output per worker/stage/day comes from sewing_line_stages.production_qty
    for the assigned stage_id. True output comes from production_history.quantity_produced,
    grouped by worker, stage, and day, using the production_history.timestamp date and
    matching it against the assignment_date.
    """
    if date_from > date_to:
        raise HTTPException(status_code=400, detail=MSG_DATE_RANGE_INVALID)

    # Ensure schematic exists
    schematic = db.query(models.SewingLineSchematic).filter(
        models.SewingLineSchematic.schematic_id == schematic_id
    ).first()
    if schematic is None:
        raise HTTPException(status_code=404, detail=MSG_SCHEMATIC_NOT_FOUND)

    breakdown_list = crud.tracking.get_schematic_worker_breakdown_for_range(
        db, schematic_id, date_from, date_to
    )
    # Function returns a list with a single dict containing records and aggregates
    payload = breakdown_list[0] if breakdown_list else {"records": [], "aggregates": []}

    records = [
        schemas.SchematicWorkerDayRecord(
            worker_id=int(r["worker_id"]),
            worker_name=str(r["worker_name"]),
            stage_id=int(r["stage_id"]),
            stage_name=str(r["stage_name"]),
            stage_order=int(r["stage_order"]),
            work_date=r["work_date"],
            expected_output=int(r["expected_output"]),
            true_output=int(r["true_output"]),
            efficiency_pct=float(r["efficiency_pct"])
            if r.get("efficiency_pct") is not None
            else None,
        )
        for r in payload["records"]
    ]

    aggregates = [
        schemas.SchematicWorkerAggregate(
            worker_id=int(a["worker_id"]),
            worker_name=str(a["worker_name"]),
            total_expected_output=int(a["total_expected_output"]),
            total_true_output=int(a["total_true_output"]),
            efficiency_pct=float(a["efficiency_pct"])
            if a.get("efficiency_pct") is not None
            else None,
        )
        for a in payload["aggregates"]
    ]

    return schemas.SchematicWorkerBreakdownResponse(
        schematic_id=schematic_id,
        date_from=date_from,
        date_to=date_to,
        records=records,
        aggregates=aggregates,
    )


@router.get(
    "/phase-schematic-work-range",
    response_model=schemas.PhaseSchematicWorkRangeResponse,
    responses=_OPENAPI_400,
)
def get_phase_schematic_work_range(
    phase_id: int,
    date_from: date,
    date_to: date,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Get per-schematic expected and true work statistics for a phase over a date range.

    This mirrors the working-days and possible-hours logic of /phase-expected-work-range
    but returns a breakdown per active schematic in the phase.
    """
    if date_from > date_to:
        raise HTTPException(status_code=400, detail=MSG_DATE_RANGE_INVALID)

    rows = crud.tracking.get_schematic_work_for_phase_range(
        db, phase_id, date_from, date_to
    )
    schematics_stats = [
        schemas.SchematicWorkRangeStat(
            schematic_id=int(row["schematic_id"]),
            schematic_name=str(row["schematic_name"]),
            expected_quantity=int(row["expected_quantity"]),
            expected_hourly_work=float(row["expected_hourly_work"]),
            true_quantity=int(row["true_quantity"]),
            true_hourly_work=float(row["true_hourly_work"]),
            efficiency_pct=(
                float(row["efficiency_pct"])
                if row.get("efficiency_pct") is not None
                else None
            ),
        )
        for row in rows
    ]
    return schemas.PhaseSchematicWorkRangeResponse(
        phase_id=phase_id,
        date_from=date_from,
        date_to=date_to,
        schematics=schematics_stats,
    )


# ============================================================================
# Overtime management
# ============================================================================
@router.post(
    "/overtime/requests",
    response_model=schemas.WorkerOvertimeRequestResponse,
)
def create_overtime_request(
    body: schemas.WorkerOvertimeRequestCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[models.User, Depends(get_current_general_ops_or_above)],
):
    """Create an overtime request (admin approval required before applying)."""
    req = crud.overtime.create_worker_overtime_request(
        db,
        phase_id=body.phase_id,
        schematic_id=body.schematic_id,
        work_date=body.work_date,
        overtime_hours=body.overtime_hours,
        worker_ids=body.worker_ids,
        requested_by_user_id=current_user.id,
        notes=body.notes,
    )
    return schemas.WorkerOvertimeRequestResponse(request_id=req.request_id, status=req.status)


@router.get(
    "/overtime/requests/pending",
    response_model=List[schemas.WorkerOvertimePendingRequest],
)
def list_pending_overtime_requests(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[models.User, Depends(get_current_active_superuser)],
):
    """Admin: list all pending overtime requests."""
    pending = crud.overtime.get_pending_overtime_requests(db)

    result: List[schemas.WorkerOvertimePendingRequest] = []
    for req in pending:
        phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == req.phase_id).first()
        schematic = (
            db.query(models.SewingLineSchematic).filter(models.SewingLineSchematic.schematic_id == req.schematic_id).first()
        )

        worker_ids: List[int] = [int(x) for x in (req.worker_ids or [])]
        workers = db.query(models.Worker).filter(models.Worker.worker_id.in_(worker_ids)).all()
        worker_name_by_id = {w.worker_id: w.worker_name for w in workers}

        # Preserve order of worker_ids as stored in the request.
        workers_payload = [
            schemas.WorkerOvertimePendingWorker(worker_id=wid, worker_name=str(worker_name_by_id.get(wid, "")))
            for wid in worker_ids
        ]

        result.append(
            schemas.WorkerOvertimePendingRequest(
                request_id=req.request_id,
                phase_id=req.phase_id,
                phase_name=str(phase.phase_name) if phase else "",
                schematic_id=req.schematic_id,
                schematic_name=str(schematic.name) if schematic else "",
                work_date=req.work_date,
                overtime_hours=float(req.overtime_hours),
                workers=workers_payload,
            )
        )

    return result


@router.post(
    "/overtime/requests/{request_id}/approve",
    response_model=schemas.WorkerOvertimeRequestResponse,
)
def approve_overtime_request(
    request_id: int,
    body: schemas.WorkerOvertimeAdminDecision,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[models.User, Depends(get_current_active_superuser)],
):
    """Admin: approve the request and apply overtime to the latest worker_daily_stage_assignment per worker."""
    req = crud.overtime.approve_worker_overtime_request(
        db,
        request_id=request_id,
        approved_by_user_id=current_user.id,
        admin_comment=body.admin_comment,
    )
    return schemas.WorkerOvertimeRequestResponse(request_id=req.request_id, status=req.status)


@router.post(
    "/overtime/requests/{request_id}/reject",
    response_model=schemas.WorkerOvertimeRequestResponse,
)
def reject_overtime_request(
    request_id: int,
    body: schemas.WorkerOvertimeAdminDecision,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[models.User, Depends(get_current_active_superuser)],
):
    """Admin: reject and auto-delete the request (no assignment changes)."""
    req = crud.overtime.reject_worker_overtime_request(
        db,
        request_id=request_id,
        rejected_by_user_id=current_user.id,
        admin_comment=body.admin_comment,
    )
    return schemas.WorkerOvertimeRequestResponse(request_id=req.request_id, status=req.status)
