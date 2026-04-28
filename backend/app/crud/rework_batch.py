from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from .batch import ScanEventOptions, create_scan_event
from .helpers import generate_barcode_string, get_next_serial_number


def _schematic_sewing_phase_for_stage(db: Session, stage: models.SewingLineStage) -> Optional[int]:
    """
    Resolve the sewing production phase assigned to the given problem stage's schematic.
    Returns None if schematic/phase does not exist or phase is not of type 'sewing'.
    """
    row = (
        db.query(models.SewingLineSchematic, models.ProductionPhase)
        .join(
            models.ProductionPhase,
            models.ProductionPhase.phase_id == models.SewingLineSchematic.production_phase_id,
        )
        .filter(models.SewingLineSchematic.schematic_id == stage.schematic_id)
        .first()
    )
    if not row:
        return None
    _schematic, phase = row
    if (phase.type or "").strip().lower() != "sewing":
        return None
    return int(phase.phase_id)


def _latest_sewing_scan_in_phase_for_job_order_item(
    db: Session,
    job_order_id: int,
    color_id: int,
    size_id: int,
) -> Optional[int]:
    """
    Return latest sewing phase_id reached via scan_in for the same job order item
    (job_order_id + color_id + size_id), based on most recent event timestamp.
    """
    row = (
        db.query(models.BarcodeScanEvent.phase_id)
        .join(models.Batch, models.Batch.batch_id == models.BarcodeScanEvent.batch_id)
        .join(models.ProductionPhase, models.ProductionPhase.phase_id == models.BarcodeScanEvent.phase_id)
        .filter(
            models.Batch.job_order_id == job_order_id,
            models.Batch.color_id == color_id,
            models.Batch.size_id == size_id,
            models.BarcodeScanEvent.action_type == "scan_in",
            models.ProductionPhase.type == "sewing",
        )
        .order_by(models.BarcodeScanEvent.scanned_at.desc(), models.BarcodeScanEvent.id.desc())
        .first()
    )
    return int(row[0]) if row else None


def create_rework_batch(
    db: Session,
    body: schemas.ReworkBatchCreate,
    created_by_user_id: Optional[int] = None,
):
    source_batch = (
        db.query(models.Batch)
        .filter(models.Batch.batch_id == body.source_batch_id)
        .with_for_update()
        .first()
    )
    if not source_batch:
        raise ValueError("Source batch not found")

    stage = (
        db.query(models.SewingLineStage)
        .filter(models.SewingLineStage.stage_name == body.problem_stage_name)
        .first()
    )
    if not stage:
        raise ValueError("Problem stage not found")

    schematic_sewing_phase_id = _schematic_sewing_phase_for_stage(db, stage)

    if source_batch.size_id is None or source_batch.color_id is None:
        raise ValueError("Source batch must have size and color to create rework batch")

    latest_working_sewing_phase_id = _latest_sewing_scan_in_phase_for_job_order_item(
        db,
        source_batch.job_order_id,
        source_batch.color_id,
        source_batch.size_id,
    )

    # Priority order:
    # 1) Problem stage's assigned schematic sewing phase.
    # 2) Latest scan-in sewing phase seen on any batch of same job order item.
    target_phase_id = schematic_sewing_phase_id or latest_working_sewing_phase_id
    if not target_phase_id:
        raise ValueError(
            "Unable to resolve sewing phase for rework initialization "
            "(no schematic sewing phase and no latest sewing scan-in fallback)"
        )

    serial_number = get_next_serial_number(
        db,
        source_batch.job_order_id,
        source_batch.size_id,
        source_batch.color_id,
    )
    generated_barcode = generate_barcode_string(
        source_batch.job_order_id,
        source_batch.size_id,
        source_batch.color_id,
        source_batch.layers or 1,
        serial_number,
    )

    operational_batch = models.Batch(
        job_order_id=source_batch.job_order_id,
        barcode=generated_barcode,
        size_id=source_batch.size_id,
        color_id=source_batch.color_id,
        quantity=source_batch.quantity or 0,
        layers=source_batch.layers or 1,
        serial=f"{serial_number:03d}",
        current_phase=target_phase_id,
        status="In Progress",
        is_second_degree=bool(source_batch.is_second_degree),
    )
    db.add(operational_batch)
    db.flush()

    create_scan_event(
        db,
        operational_batch.batch_id,
        "scan_in",
        operational_batch.current_phase,
        ScanEventOptions(
            new_status=operational_batch.status,
            new_quantity=operational_batch.quantity,
            new_phase=operational_batch.current_phase,
            user_id=created_by_user_id,
        ),
    )

    row = models.ReworkBatch(
        batch_id=operational_batch.batch_id,
        problem_stage_name=stage.stage_name,
        responsible_phase_id=target_phase_id,
        created_by_user_id=created_by_user_id,
        printed=False,
    )
    db.add(row)
    db.commit()
    rid = row.rework_batch_id
    return (
        db.query(models.ReworkBatch)
        .options(joinedload(models.ReworkBatch.batch))
        .filter(models.ReworkBatch.rework_batch_id == rid)
        .first()
    )


def list_rework_batches(
    db: Session,
    source_batch_id: Optional[int] = None,
    printed: Optional[bool] = None,
) -> List[models.ReworkBatch]:
    q = (
        db.query(models.ReworkBatch)
        .options(joinedload(models.ReworkBatch.batch))
        .join(models.Batch, models.Batch.batch_id == models.ReworkBatch.batch_id)
    )
    if source_batch_id is not None:
        q = (
            q.join(
                models.SingleRejection,
                (models.SingleRejection.new_batch_id == models.ReworkBatch.batch_id)
                & (models.SingleRejection.batch_id == source_batch_id),
            ).distinct()
        )
    if printed is not None:
        q = q.filter(models.ReworkBatch.printed.is_(printed))
    return q.order_by(models.ReworkBatch.created_at.desc(), models.ReworkBatch.rework_batch_id.desc()).all()


def update_rework_batch(
    db: Session,
    rework_batch_id: int,
    body: schemas.ReworkBatchUpdate,
):
    row = (
        db.query(models.ReworkBatch)
        .filter(models.ReworkBatch.rework_batch_id == rework_batch_id)
        .first()
    )
    if not row:
        return None
    if body.printed is not None:
        row.printed = bool(body.printed)
    db.commit()
    return (
        db.query(models.ReworkBatch)
        .options(joinedload(models.ReworkBatch.batch))
        .filter(models.ReworkBatch.rework_batch_id == rework_batch_id)
        .first()
    )
