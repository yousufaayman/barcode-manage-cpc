"""Build the payload for GET /batches/by-phase/current (kept out of endpoints for clarity and Sonar complexity)."""

from typing import Any, Dict, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models

STATUS_PENDING = "Pending"
STATUS_IN_PROGRESS = "In Progress"
STATUS_COMPLETED = "Completed"


def _seconds_to_time_in_phase_label(total_seconds: float) -> str:
    if total_seconds < 0:
        total_seconds = abs(total_seconds)
    hours = int(total_seconds // 3600)
    minutes = int((total_seconds % 3600) // 60)
    if hours > 24:
        days = hours // 24
        hours = hours % 24
        return f"{days}d {hours}h {minutes}m"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _time_in_phase_from_scan_at(db: Session, scan_at) -> str:
    if not scan_at:
        return "N/A"
    try:
        current_db_time = db.query(func.now()).scalar()
        time_diff = current_db_time - scan_at
        return _seconds_to_time_in_phase_label(time_diff.total_seconds())
    except (ValueError, TypeError, AttributeError):
        return "N/A"


def _oldest_first_scan_for_model_color(
    db: Session,
    phase_id: int,
    model_name: Optional[str],
    color_name: Optional[str],
):
    oldest = None
    try:
        mc_batches = (
            db.query(models.Batch)
            .join(
                models.JobOrder,
                models.Batch.job_order_id == models.JobOrder.job_order_id,
            )
            .join(models.Model, models.JobOrder.model_id == models.Model.model_id)
            .join(models.Color, models.Batch.color_id == models.Color.color_id)
            .filter(
                models.Batch.current_phase == phase_id,
                models.Batch.status.in_(
                    [STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_COMPLETED]
                ),
                models.Model.model_name == model_name,
                models.Color.color_name == color_name,
            )
            .all()
        )
        for mc_batch in mc_batches:
            first_scan = (
                db.query(models.BarcodeScanEvent)
                .filter(
                    models.BarcodeScanEvent.batch_id == mc_batch.batch_id,
                    models.BarcodeScanEvent.phase_id == phase_id,
                )
                .order_by(models.BarcodeScanEvent.scanned_at)
                .first()
            )
            if first_scan and (oldest is None or first_scan.scanned_at < oldest):
                oldest = first_scan.scanned_at
        return oldest
    except (ValueError, TypeError, AttributeError):
        return None


def _sum_non_second_degree_batch_qty(
    db: Session,
    job_order_id: int,
    color_id: int,
    size_id: Optional[int] = None,
) -> int:
    try:
        q = db.query(models.Batch).filter(
            models.Batch.job_order_id == job_order_id,
            models.Batch.color_id == color_id,
            models.Batch.is_second_degree.is_(False),
        )
        if size_id is not None:
            q = q.filter(models.Batch.size_id == size_id)
        rows = q.all()
        return sum(b.quantity for b in rows if b.quantity is not None)
    except (ValueError, TypeError, AttributeError):
        return 0


def _ensure_model_color_group(
    db: Session,
    phases_data: Dict[str, Any],
    phase_name: str,
    status: str,
    model_color_key: str,
    batch,
    phase_id: int,
    model_name: Optional[str],
    color_name: Optional[str],
    cleaned_model: str,
    cleaned_color: str,
) -> None:
    if model_color_key in phases_data[phase_name][status]["model_color_groups"]:
        return
    oldest = _oldest_first_scan_for_model_color(db, phase_id, model_name, color_name)
    time_in_phase = _time_in_phase_from_scan_at(db, oldest)
    total_expected = _sum_non_second_degree_batch_qty(
        db, batch.job_order_id, batch.color_id
    )
    phases_data[phase_name][status]["model_color_groups"][model_color_key] = {
        "model_name": cleaned_model,
        "color_name": cleaned_color,
        "total_quantity": 0,
        "expected_quantity": total_expected,
        "batch_count": 0,
        "time_in_phase": time_in_phase,
        "sizes": [],
        "second_degree_sizes": [],
    }


def _build_size_data(
    db: Session,
    batch,
    phase_id: int,
    size_value: Any,
    size_expected_quantity: int,
) -> Dict[str, Any]:
    size_data: Dict[str, Any] = {
        "size_value": size_value,
        "quantity": batch.quantity,
        "expected_quantity": size_expected_quantity,
        "batch_count": 1,
        "time_in_phase": "N/A",
    }
    try:
        first_scan = (
            db.query(models.BarcodeScanEvent)
            .filter(
                models.BarcodeScanEvent.batch_id == batch.batch_id,
                models.BarcodeScanEvent.phase_id == phase_id,
            )
            .order_by(models.BarcodeScanEvent.scanned_at)
            .first()
        )
        if first_scan:
            size_data["time_in_phase"] = _time_in_phase_from_scan_at(
                db, first_scan.scanned_at
            )
    except (ValueError, TypeError, AttributeError):
        pass
    return size_data


def _merge_size_into_group(
    phases_data: Dict[str, Any],
    phase_name: str,
    status: str,
    model_color_key: str,
    batch,
    size_data: Dict[str, Any],
    size_value: Any,
) -> None:
    group = phases_data[phase_name][status]["model_color_groups"][model_color_key]
    size_arrays = (
        group["second_degree_sizes"]
        if batch.is_second_degree
        else group["sizes"]
    )
    existing = next((s for s in size_arrays if s["size_value"] == size_value), None)
    if existing:
        existing["quantity"] += batch.quantity
        existing["batch_count"] += 1
        if size_data["time_in_phase"] != "N/A" and existing["time_in_phase"] == "N/A":
            existing["time_in_phase"] = size_data["time_in_phase"]
    elif batch.is_second_degree:
        group["second_degree_sizes"].append(size_data)
    else:
        group["sizes"].append(size_data)
    if not batch.is_second_degree:
        group["total_quantity"] += batch.quantity
        group["batch_count"] += 1


def _query_current_batches_for_by_phase(db: Session):
    return (
        db.query(
            models.Batch,
            models.JobOrder.job_order_number,
            models.Model.model_name,
            models.Color.color_name,
            models.Size.size_value,
            models.ProductionPhase.phase_name,
            models.ProductionPhase.phase_id,
        )
        .join(
            models.JobOrder,
            models.Batch.job_order_id == models.JobOrder.job_order_id,
        )
        .join(models.Model, models.JobOrder.model_id == models.Model.model_id)
        .join(models.Color, models.Batch.color_id == models.Color.color_id)
        .join(models.Size, models.Batch.size_id == models.Size.size_id)
        .join(
            models.ProductionPhase,
            models.Batch.current_phase == models.ProductionPhase.phase_id,
        )
        .filter(
            models.Batch.status.in_(
                [STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_COMPLETED]
            )
        )
        .order_by(
            models.ProductionPhase.phase_id,
            models.Batch.status,
            models.JobOrder.job_order_number,
            models.Model.model_name,
            models.Color.color_name,
            models.Size.size_value,
        )
        .all()
    )


def _accumulate_by_phase_row(
    db: Session,
    phases_data: Dict[str, Any],
    row: Tuple[Any, ...],
) -> None:
    batch, _jon, model_name, color_name, size_value, phase_name, phase_id = row
    if phase_name not in phases_data:
        phases_data[phase_name] = {}
    status = batch.status
    if status not in phases_data[phase_name]:
        phases_data[phase_name][status] = {
            "model_color_groups": {},
            "daily_throughput": {
                "scanned_in_not_out": 0,
                "completed": 0,
                "efficiency_ratio": 0,
            },
        }
    cleaned_model = model_name.strip() if model_name else ""
    cleaned_color = color_name.strip() if color_name else ""
    model_color_key = f"{cleaned_model}_{cleaned_color}"
    _ensure_model_color_group(
        db,
        phases_data,
        phase_name,
        status,
        model_color_key,
        batch,
        phase_id,
        model_name,
        color_name,
        cleaned_model,
        cleaned_color,
    )
    size_exp = _sum_non_second_degree_batch_qty(
        db, batch.job_order_id, batch.color_id, batch.size_id
    )
    size_data = _build_size_data(db, batch, phase_id, size_value, size_exp)
    _merge_size_into_group(
        phases_data,
        phase_name,
        status,
        model_color_key,
        batch,
        size_data,
        size_value,
    )


def _sum_batch_qty_event_transition(
    db: Session,
    phase_id: int,
    current_db_date,
    *,
    old_status: Optional[str],
    new_status: str,
) -> int:
    q = (
        db.query(models.Batch.batch_id, models.Batch.quantity)
        .join(
            models.BarcodeScanEvent,
            models.Batch.batch_id == models.BarcodeScanEvent.batch_id,
        )
        .filter(
            models.BarcodeScanEvent.phase_id == phase_id,
            models.BarcodeScanEvent.new_status == new_status,
            models.BarcodeScanEvent.scanned_at >= current_db_date,
        )
    )
    if old_status is not None:
        q = q.filter(models.BarcodeScanEvent.old_status == old_status)
    rows = q.distinct().all()
    return sum(batch.quantity for batch in rows if batch.quantity)


def _daily_throughput_for_status(
    db: Session,
    phase_id: int,
    current_db_date,
    status: str,
) -> Tuple[int, int]:
    if status == STATUS_PENDING:
        scanned_in = _sum_batch_qty_event_transition(
            db, phase_id, current_db_date, old_status=None, new_status=STATUS_PENDING
        )
        completed = _sum_batch_qty_event_transition(
            db,
            phase_id,
            current_db_date,
            old_status=STATUS_PENDING,
            new_status=STATUS_IN_PROGRESS,
        )
        return scanned_in, completed
    if status == STATUS_IN_PROGRESS:
        scanned_in = _sum_batch_qty_event_transition(
            db,
            phase_id,
            current_db_date,
            old_status=STATUS_PENDING,
            new_status=STATUS_IN_PROGRESS,
        )
        completed = _sum_batch_qty_event_transition(
            db,
            phase_id,
            current_db_date,
            old_status=STATUS_IN_PROGRESS,
            new_status=STATUS_COMPLETED,
        )
        return scanned_in, completed
    if status == STATUS_COMPLETED:
        completed = _sum_batch_qty_event_transition(
            db,
            phase_id,
            current_db_date,
            old_status=STATUS_IN_PROGRESS,
            new_status=STATUS_COMPLETED,
        )
        return 0, completed
    return 0, 0


def _apply_daily_throughput(db: Session, phases_data: Dict[str, Any]) -> None:
    for phase_name, statuses in phases_data.items():
        for status in statuses:
            try:
                current_db_date = db.query(func.date(func.now())).scalar()
                phase_id = (
                    db.query(models.ProductionPhase.phase_id)
                    .filter(models.ProductionPhase.phase_name == phase_name)
                    .scalar()
                )
                scanned_in, completed_items = _daily_throughput_for_status(
                    db, phase_id, current_db_date, status
                )
                if completed_items > 0 and scanned_in > 0:
                    efficiency_ratio = completed_items / scanned_in
                else:
                    efficiency_ratio = 0
                phases_data[phase_name][status]["daily_throughput"] = {
                    "scanned_in": scanned_in,
                    "completed": completed_items,
                    "efficiency_ratio": round(efficiency_ratio, 2),
                }
            except (ValueError, TypeError, AttributeError, KeyError):
                phases_data[phase_name][status]["daily_throughput"] = {
                    "scanned_in": 0,
                    "completed": 0,
                    "efficiency_ratio": 0,
                }


def _sort_model_color_groups(phases_data: Dict[str, Any]) -> None:
    for phase_name in phases_data:
        for status in phases_data[phase_name]:
            cell = phases_data[phase_name][status]
            if "model_color_groups" in cell:
                cell["model_color_groups"] = dict(
                    sorted(
                        cell["model_color_groups"].items(),
                        key=lambda x: (x[1]["model_name"], x[1]["color_name"]),
                    )
                )


def _accumulate_rows_into_phases(db: Session) -> Dict[str, Any]:
    phases_data: Dict[str, Any] = {}
    for row in _query_current_batches_for_by_phase(db):
        _accumulate_by_phase_row(db, phases_data, row)
    return phases_data


def _post_process_phases(db: Session, phases_data: Dict[str, Any]) -> None:
    _apply_daily_throughput(db, phases_data)
    _sort_model_color_groups(phases_data)


def build_current_batches_by_phase(db: Session) -> Dict[str, Dict[str, Any]]:
    """Aggregate open batches by phase/status for the dashboard."""
    phases_data = _accumulate_rows_into_phases(db)
    _post_process_phases(db, phases_data)
    return phases_data
