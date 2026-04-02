"""Sewing quantity rejections: merge into an existing pending rework batch or create a new one."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from .batch import ScanEventOptions, create_scan_event
from .helpers import generate_barcode_string, get_next_serial_number


def _last_sewing_in_progress_phase_id(db: Session, batch_id: int) -> Optional[int]:
    row = (
        db.query(models.BarcodeScanEvent.phase_id)
        .join(
            models.ProductionPhase,
            models.ProductionPhase.phase_id == models.BarcodeScanEvent.phase_id,
        )
        .filter(
            models.BarcodeScanEvent.batch_id == batch_id,
            models.ProductionPhase.type == "sewing",
            or_(
                models.BarcodeScanEvent.old_status == "In Progress",
                models.BarcodeScanEvent.new_status == "In Progress",
            ),
        )
        .order_by(models.BarcodeScanEvent.scanned_at.desc())
        .first()
    )
    return int(row[0]) if row else None


def _phase_id_for_stage_name(db: Session, stage_name: str) -> Optional[int]:
    stage = (
        db.query(models.SewingLineStage)
        .filter(models.SewingLineStage.stage_name == stage_name.strip())
        .first()
    )
    if not stage:
        return None
    schematic = (
        db.query(models.SewingLineSchematic)
        .filter(models.SewingLineSchematic.schematic_id == stage.schematic_id)
        .first()
    )
    if not schematic:
        return None
    return int(schematic.production_phase_id)


def resolve_sewing_rework_operational_batch_id(
    db: Session,
    source_batch: models.Batch,
    deduction_amount: int,
    stage_name: str,
    responsible_phase_id_from_ui: Optional[int] = None,
    user_id: Optional[int] = None,
) -> Optional[int]:
    """
    Case A: merge deduction into existing pending sewing rework with matching problem_stage_name.
    Case B: create new operational batch (layers=1, Pending) + rework_batches + scan_in.
    Returns ops.batches.batch_id for SingleRejection.new_batch_id.
    """
    name = (stage_name or "").strip()
    if not name or deduction_amount <= 0:
        return None
    if source_batch.size_id is None or source_batch.color_id is None:
        return None

    derived_responsible_phase_id = _last_sewing_in_progress_phase_id(db, source_batch.batch_id)
    if derived_responsible_phase_id is None and responsible_phase_id_from_ui is not None:
        derived_responsible_phase_id = int(responsible_phase_id_from_ui)
    if derived_responsible_phase_id is None:
        derived_responsible_phase_id = _phase_id_for_stage_name(db, name)

    match = (
        db.query(models.ReworkBatch)
        .join(models.Batch, models.Batch.batch_id == models.ReworkBatch.batch_id)
        .join(
            models.ProductionPhase,
            models.ProductionPhase.phase_id == models.Batch.current_phase,
        )
        .filter(
            models.Batch.job_order_id == source_batch.job_order_id,
            models.Batch.color_id == source_batch.color_id,
            models.Batch.size_id == source_batch.size_id,
            models.ProductionPhase.type == "sewing",
            models.Batch.status == "Pending",
            models.ReworkBatch.problem_stage_name == name,
            models.ReworkBatch.responsible_phase_id == derived_responsible_phase_id,
        )
        .order_by(models.ReworkBatch.rework_batch_id.desc())
        .first()
    )
    if match:
        ob = (
            db.query(models.Batch)
            .filter(models.Batch.batch_id == match.batch_id)
            .with_for_update()
            .first()
        )
        if not ob:
            return None
        ob.quantity = (ob.quantity or 0) + deduction_amount
        db.flush()
        return ob.batch_id

    phase_id = derived_responsible_phase_id
    if phase_id is None:
        raise ValueError(
            f"Cannot resolve sewing phase for rework: no sewing In Progress scan event on batch "
            f"{source_batch.batch_id} and stage {name!r} not found."
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
        1,
        serial_number,
    )
    operational = models.Batch(
        job_order_id=source_batch.job_order_id,
        barcode=generated_barcode,
        size_id=source_batch.size_id,
        color_id=source_batch.color_id,
        quantity=deduction_amount,
        layers=1,
        serial=f"{serial_number:03d}",
        current_phase=phase_id,
        status="Pending",
        is_second_degree=bool(source_batch.is_second_degree),
    )
    db.add(operational)
    db.flush()

    create_scan_event(
        db,
        operational.batch_id,
        "scan_in",
        phase_id,
        ScanEventOptions(
            new_status="Pending",
            new_quantity=deduction_amount,
            new_phase=phase_id,
            user_id=user_id,
            autocommit=False,
        ),
    )

    row = models.ReworkBatch(
        batch_id=operational.batch_id,
        problem_stage_name=name,
        responsible_phase_id=phase_id,
        created_by_user_id=user_id,
        printed=False,
    )
    db.add(row)
    db.flush()
    return operational.batch_id
