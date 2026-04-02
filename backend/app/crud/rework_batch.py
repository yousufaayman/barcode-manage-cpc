from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from .batch import ScanEventOptions, create_scan_event
from .helpers import generate_barcode_string, get_next_serial_number


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

    schematic = (
        db.query(models.SewingLineSchematic)
        .filter(models.SewingLineSchematic.schematic_id == stage.schematic_id)
        .first()
    )
    if not schematic:
        raise ValueError("Schematic for problem stage not found")

    if source_batch.size_id is None or source_batch.color_id is None:
        raise ValueError("Source batch must have size and color to create rework batch")

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
        current_phase=schematic.production_phase_id,
        status=source_batch.status or "In Progress",
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
        responsible_phase_id=schematic.production_phase_id,
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
