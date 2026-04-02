from collections import defaultdict
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import models, schemas


def create_schematic(db: Session, schematic: schemas.SewingLineSchematicCreate):
    db_schematic = models.SewingLineSchematic(
        production_phase_id=schematic.production_phase_id,
        name=schematic.name,
        active=schematic.active,
        working_hours=float(schematic.working_hours) if schematic.working_hours is not None else None,
        hourly_production=schematic.hourly_production,
    )
    db.add(db_schematic)
    db.flush()  # get schematic_id without committing
    if schematic.stages:
        max_stage_order = max((s.stage_order for s in schematic.stages), default=None)
        for s in schematic.stages:
            stage = models.SewingLineStage(
                schematic_id=db_schematic.schematic_id,
                stage_name=s.stage_name,
                stage_order=s.stage_order,
                production_qty=s.production_qty,
                is_in_final_stage=(max_stage_order is not None and s.stage_order == max_stage_order),
                active=s.active,
            )
            db.add(stage)
    db.commit()
    db.refresh(db_schematic)
    return db_schematic


def update_schematic(db: Session, schematic_id: int, data: schemas.SewingLineSchematicUpdate):
    """
    Update schematic and optionally update its stages.

    Only provided fields are updated.

    For stages:
    - Payload items are matched to existing stages by stage_name (first payload
      item with name X updates the first existing stage named X, etc.). Only
      stage_order, production_qty, and active are updated; stage_name is never
      changed on an existing row so that stage_id keeps its identity and
      production/assignment history stays consistent.
    - If there is no unused existing stage with that name, a new stage is created.
    - Existing stages not matched by any payload item are left unchanged (no hard
      delete) to avoid violating foreign key constraints from worker_daily_stage_assignments.
    """
    schematic = db.query(models.SewingLineSchematic).filter(
        models.SewingLineSchematic.schematic_id == schematic_id
    ).first()
    if not schematic:
        return None
    set_fields = data.model_dump(exclude_unset=True)
    if "production_phase_id" in set_fields:
        schematic.production_phase_id = set_fields["production_phase_id"]
    if "name" in set_fields:
        schematic.name = set_fields["name"]
    if "active" in set_fields:
        schematic.active = set_fields["active"]
    if "working_hours" in set_fields:
        v = set_fields["working_hours"]
        schematic.working_hours = float(v) if v is not None else None
    if "hourly_production" in set_fields:
        schematic.hourly_production = set_fields["hourly_production"]

    # Safely update stages without hard-deleting rows that may be referenced
    # from ops.worker_daily_stage_assignments (stage_id has ON DELETE RESTRICT).
    # Match payload items to existing stages by stage_name (consume in order within
    # each name) so we only update stage_order, production_qty, active. We never
    # change stage_name on an existing row — stage_id keeps its name to avoid
    # inconsistent production history and worker assignments.
    if "stages" in set_fields and set_fields["stages"] is not None:
        new_stages = set_fields["stages"]
        max_stage_order = max((s["stage_order"] for s in new_stages), default=None)

        # Group existing stages by stage_name; within each name sort by (stage_order, stage_id)
        existing_stages = (
            db.query(models.SewingLineStage)
            .filter(models.SewingLineStage.schematic_id == schematic_id)
            .order_by(
                models.SewingLineStage.stage_name.asc(),
                models.SewingLineStage.stage_order.asc(),
                models.SewingLineStage.stage_id.asc(),
            )
            .all()
        )
        by_name = defaultdict(list)
        for st in existing_stages:
            by_name[st.stage_name].append(st)

        for s in new_stages:
            stage_name = s["stage_name"]
            stage_order = s["stage_order"]
            production_qty = s.get("production_qty")
            is_in_final_stage = (max_stage_order is not None and stage_order == max_stage_order)
            active = s.get("active", True)

            queue = by_name.get(stage_name)
            if queue:
                # Use next existing row with this name; update only order/qty/active (keep stage_name)
                existing = queue.pop(0)
                existing.stage_order = stage_order
                existing.production_qty = production_qty
                existing.is_in_final_stage = is_in_final_stage
                existing.active = active
            else:
                # New stage for this schematic
                stage = models.SewingLineStage(
                    schematic_id=schematic_id,
                    stage_name=stage_name,
                    stage_order=stage_order,
                    production_qty=production_qty,
                    is_in_final_stage=is_in_final_stage,
                    active=active,
                )
                db.add(stage)
    db.commit()
    db.refresh(schematic)
    return schematic


def get_schematic_by_id(db: Session, schematic_id: int):
    """Get a single schematic with phase name, or None."""
    row = (
        db.query(models.SewingLineSchematic, models.ProductionPhase.phase_name)
        .join(
            models.ProductionPhase,
            models.SewingLineSchematic.production_phase_id == models.ProductionPhase.phase_id,
        )
        .filter(models.SewingLineSchematic.schematic_id == schematic_id)
        .first()
    )
    return row


def get_stages_for_schematic(db: Session, schematic_id: int):
    """Get all stages for a schematic, ordered by stage_order."""
    return (
        db.query(models.SewingLineStage)
        .filter(models.SewingLineStage.schematic_id == schematic_id)
        .order_by(models.SewingLineStage.stage_order.asc(), models.SewingLineStage.stage_id.asc())
        .all()
    )


def get_schematics(db: Session, skip: int = 0, limit: int = 100, active_only: bool = False):
    q = (
        db.query(models.SewingLineSchematic, models.ProductionPhase.phase_name)
        .join(
            models.ProductionPhase,
            models.SewingLineSchematic.production_phase_id == models.ProductionPhase.phase_id,
        )
        .order_by(
            func.coalesce(models.ProductionPhase.sequence_order, 999).asc(),
            models.ProductionPhase.phase_id.asc(),
            models.SewingLineSchematic.schematic_id.asc(),
        )
    )
    if active_only:
        q = q.filter(models.SewingLineSchematic.active.is_(True))
    rows = q.offset(skip).limit(limit).all()
    # Build response objects with phase_name
    return [
        schemas.SewingLineSchematic(
            schematic_id=s.schematic_id,
            production_phase_id=s.production_phase_id,
            name=s.name,
            active=s.active,
            phase_name=phase_name,
            working_hours=float(s.working_hours) if s.working_hours is not None else None,
            hourly_production=s.hourly_production,
        )
        for s, phase_name in rows
    ]


def delete_schematic_cascade(db: Session, schematic_id: int) -> Optional[schemas.SewingLineSchematicDeleteResult]:
    """
    Delete a sewing line schematic and all sewing production rows that reference it:
    overtime requests/history, daily stage assignments, production_history,
    reporting.worker_daily_stage_production (via stage CASCADE), and stages.

    Does not delete batches or batch_phase_history.
    """
    schematic = (
        db.query(models.SewingLineSchematic)
        .filter(models.SewingLineSchematic.schematic_id == schematic_id)
        .first()
    )
    if not schematic:
        return None

    # Copy scalars before deleting the row; ORM instance becomes invalid after delete().
    schematic_name = schematic.name

    stage_ids = [
        r[0]
        for r in db.query(models.SewingLineStage.stage_id)
        .filter(models.SewingLineStage.schematic_id == schematic_id)
        .all()
    ]

    n_otr = (
        db.query(func.count())
        .select_from(models.WorkerOvertimeRequest)
        .filter(models.WorkerOvertimeRequest.schematic_id == schematic_id)
        .scalar()
    )
    n_oth = (
        db.query(func.count())
        .select_from(models.WorkerOvertimeHistory)
        .filter(models.WorkerOvertimeHistory.stage_id.in_(stage_ids))
        .scalar()
        if stage_ids
        else 0
    )
    assign_subq = db.query(models.WorkerDailyStageAssignment.daily_assignment_id).filter(
        models.WorkerDailyStageAssignment.stage_id.in_(stage_ids)
    )
    n_wda = (
        db.query(func.count())
        .select_from(models.WorkerDailyStageAssignment)
        .filter(models.WorkerDailyStageAssignment.stage_id.in_(stage_ids))
        .scalar()
        if stage_ids
        else 0
    )
    n_ph = (
        db.query(func.count())
        .select_from(models.ProductionHistory)
        .filter(models.ProductionHistory.daily_assignment_id.in_(assign_subq))
        .scalar()
        if stage_ids
        else 0
    )
    n_wdsp = (
        db.query(func.count())
        .select_from(models.WorkerDailyStageProduction)
        .filter(models.WorkerDailyStageProduction.stage_id.in_(stage_ids))
        .scalar()
        if stage_ids
        else 0
    )
    n_stages = len(stage_ids)

    db.query(models.WorkerOvertimeRequest).filter(
        models.WorkerOvertimeRequest.schematic_id == schematic_id
    ).delete(synchronize_session=False)

    if stage_ids:
        db.query(models.WorkerOvertimeHistory).filter(
            models.WorkerOvertimeHistory.stage_id.in_(stage_ids)
        ).delete(synchronize_session=False)

        db.query(models.ProductionHistory).filter(
            models.ProductionHistory.daily_assignment_id.in_(assign_subq)
        ).delete(synchronize_session=False)

        db.query(models.WorkerDailyStageAssignment).filter(
            models.WorkerDailyStageAssignment.stage_id.in_(stage_ids)
        ).delete(synchronize_session=False)

        db.query(models.WorkerDailyStageProduction).filter(
            models.WorkerDailyStageProduction.stage_id.in_(stage_ids)
        ).delete(synchronize_session=False)

    db.query(models.SewingLineSchematic).filter(
        models.SewingLineSchematic.schematic_id == schematic_id
    ).delete(synchronize_session=False)

    db.commit()

    return schemas.SewingLineSchematicDeleteResult(
        schematic_id=schematic_id,
        name=schematic_name,
        worker_overtime_requests=int(n_otr or 0),
        worker_overtime_history=int(n_oth or 0),
        worker_daily_stage_assignments=int(n_wda or 0),
        production_history=int(n_ph or 0),
        worker_daily_stage_production=int(n_wdsp or 0),
        sewing_line_stages=n_stages,
    )
