"""
Aggressive integrity test runner for daily assignments, switching time accounting,
production caps, and overtime application.

Runs directly against the configured PostgreSQL DB using the same SQLAlchemy models
and CRUD used by the API (no HTTP/auth required).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
import traceback
from typing import Callable, List, Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app import models
from app.crud import tracking as tracking_crud
from app.crud import overtime as overtime_crud


@dataclass
class TestResult:
    name: str
    passed: bool
    detail: str = ""


class TestFailure(RuntimeError):
    pass


RUN_PREFIX = "DAITEST"

def _next_int_pk(db: Session, qualified_table: str, pk_col: str) -> int:
    """
    Compute next integer PK for tables that are not backed by a sequence/identity.
    """
    row = db.execute(text(f"SELECT COALESCE(MAX({pk_col}), 0) + 1 AS next_id FROM {qualified_table}")).mappings().first()
    return int(row["next_id"]) if row and row.get("next_id") is not None else 1


def _d(v: float | Decimal | None) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise TestFailure(msg)


def _approx(a: Decimal, b: Decimal, tol: Decimal = Decimal("0.01")) -> bool:
    return abs(a - b) <= tol


def _unique_slug(prefix: str) -> str:
    # Stable-ish, readable unique suffix
    return f"{RUN_PREFIX}-{prefix}-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"

def _short_token(tag: str, max_len: int) -> str:
    """
    Produce a short unique-ish token for columns with small VARCHAR limits.
    """
    raw = f"{tag}-{datetime.utcnow().strftime('%H%M%S%f')}"
    return raw[:max_len]


def _create_minimal_user(db: Session, username_prefix: str) -> models.User:
    u = models.User(username=_unique_slug(username_prefix), password_hash="test")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _create_minimal_job_order_graph(db: Session) -> int:
    """
    Create the smallest set of core rows required to insert an ops.batch.
    Returns job_order_id.
    """
    model = models.Model(model_name=_unique_slug("model"))
    db.add(model)
    db.commit()
    db.refresh(model)

    client = models.Client(
        client_id=_next_int_pk(db, "core.clients", "client_id"),
        client_name=_unique_slug("client"),
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    jo = models.JobOrder(
        model_id=int(model.model_id),
        job_order_number=_unique_slug("JO"),
        client_id=int(client.client_id),
        image_url=None,
        notes="test",
        print_config=None,
        priority=0,
    )
    db.add(jo)
    db.commit()
    db.refresh(jo)
    return int(jo.job_order_id)


def _create_phase_schematic_and_stages(
    db: Session,
    *,
    working_hours: float = 8.0,
    hourly_production: int = 10,
    stage_defs: Sequence[tuple[str, int, int, bool]] = (("Stage A", 1, 10, False), ("Stage B", 2, 10, True)),
) -> tuple[models.ProductionPhase, models.SewingLineSchematic, list[models.SewingLineStage]]:
    phase = models.ProductionPhase(
        phase_id=_next_int_pk(db, "core.production_phases", "phase_id"),
        phase_name=_unique_slug("phase"),
        type="sewing",
        sequence_order=1,
    )
    db.add(phase)
    db.commit()
    db.refresh(phase)

    schematic = models.SewingLineSchematic(
        schematic_id=_next_int_pk(db, "core.sewing_line_schematics", "schematic_id"),
        production_phase_id=int(phase.phase_id),
        name=_unique_slug("schematic"),
        active=True,
        working_hours=_d(working_hours),
        hourly_production=hourly_production,
    )
    db.add(schematic)
    db.commit()
    db.refresh(schematic)

    stages: list[models.SewingLineStage] = []
    next_stage_id = _next_int_pk(db, "core.sewing_line_stages", "stage_id")
    for (stage_name, stage_order, production_qty, is_final) in stage_defs:
        st = models.SewingLineStage(
            stage_id=next_stage_id,
            schematic_id=int(schematic.schematic_id),
            stage_name=stage_name,
            stage_order=stage_order,
            production_qty=production_qty,
            is_in_final_stage=bool(is_final),
            active=True,
        )
        next_stage_id += 1
        db.add(st)
        stages.append(st)
    db.commit()
    for st in stages:
        db.refresh(st)
    return phase, schematic, stages


def _create_worker_with_group(db: Session, *, hours: float = 8.0) -> tuple[models.WorkersGroup, models.Worker]:
    g = models.WorkersGroup(
        group_id=_next_int_pk(db, "core.workers_groups", "group_id"),
        group_name=_unique_slug("group"),
        working_hours=_d(hours),
    )
    db.add(g)
    db.commit()
    db.refresh(g)

    w = models.Worker(
        worker_id=_next_int_pk(db, "core.workers", "worker_id"),
        worker_name=_unique_slug("worker"),
        worker_group_id=int(g.group_id),
        active=True,
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return g, w


def _create_batch(db: Session, *, job_order_id: int, phase_id: int, quantity: int) -> models.Batch:
    size = models.Size(
        size_id=_next_int_pk(db, "core.sizes", "size_id"),
        size_value=_short_token("DT", 20),
    )
    color = models.Color(
        color_id=_next_int_pk(db, "core.colors", "color_id"),
        color_name=_unique_slug("color"),
    )
    db.add(size)
    db.add(color)
    db.commit()
    db.refresh(size)
    db.refresh(color)

    b = models.Batch(
        batch_id=_next_int_pk(db, "ops.batches", "batch_id"),
        job_order_id=int(job_order_id),
        barcode=_unique_slug("BATCH"),
        size_id=int(size.size_id),
        color_id=int(color.color_id),
        quantity=int(quantity),
        layers=1,
        serial="001",
        current_phase=int(phase_id),
        status="In Progress",
        is_second_degree=False,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


def _set_created_at(db: Session, assignment_id: int, created_at: datetime) -> None:
    db.execute(
        text(
            """
            UPDATE ops.worker_daily_stage_assignments
               SET created_at = :created_at
             WHERE daily_assignment_id = :id
            """
        ),
        {"created_at": created_at, "id": assignment_id},
    )
    db.commit()


def _get_assignment(db: Session, assignment_id: int) -> models.WorkerDailyStageAssignment:
    a = (
        db.query(models.WorkerDailyStageAssignment)
        .filter(models.WorkerDailyStageAssignment.daily_assignment_id == assignment_id)
        .first()
    )
    _assert(a is not None, f"assignment {assignment_id} not found")
    return a  # type: ignore[return-value]


def _cleanup(db: Session) -> None:
    """
    Best-effort cleanup for rows created by this script.

    We key off RUN_PREFIX, which is embedded in all generated names/barcodes.
    """
    like = f"{RUN_PREFIX}-%"

    # --- ops: production history depends on assignments/batches ---
    db.execute(
        text(
            """
            DELETE FROM ops.production_history ph
             USING ops.worker_daily_stage_assignments a
             JOIN core.workers w ON w.worker_id = a.worker_id
            WHERE ph.daily_assignment_id = a.daily_assignment_id
              AND w.worker_name LIKE :like;
            """
        ),
        {"like": like},
    )
    db.commit()

    # --- ops: overtime history depends on requests and assignments ---
    db.execute(
        text(
            """
            DELETE FROM ops.worker_overtime_history h
             USING core.workers w
            WHERE h.worker_id = w.worker_id
              AND w.worker_name LIKE :like;
            """
        ),
        {"like": like},
    )
    db.commit()

    db.execute(
        text(
            """
            DELETE FROM ops.worker_overtime_requests r
             WHERE r.requested_by_user_id IN (SELECT id FROM core.users WHERE username LIKE :like)
                OR r.reviewed_by_user_id IN (SELECT id FROM core.users WHERE username LIKE :like);
            """
        ),
        {"like": like},
    )
    db.commit()

    # --- ops: assignments ---
    db.execute(
        text(
            """
            DELETE FROM ops.worker_daily_stage_assignments a
             USING core.workers w
            WHERE a.worker_id = w.worker_id
              AND w.worker_name LIKE :like;
            """
        ),
        {"like": like},
    )
    db.commit()

    # --- ops: batches ---
    db.query(models.Batch).filter(models.Batch.barcode.like(like)).delete(synchronize_session=False)
    db.commit()

    # --- core rows (order matters) ---
    db.query(models.Worker).filter(models.Worker.worker_name.like(like)).delete(synchronize_session=False)
    db.query(models.WorkersGroup).filter(models.WorkersGroup.group_name.like(like)).delete(synchronize_session=False)
    db.query(models.SewingLineStage).filter(models.SewingLineStage.stage_name.like(like)).delete(synchronize_session=False)
    db.query(models.SewingLineSchematic).filter(models.SewingLineSchematic.name.like(like)).delete(synchronize_session=False)
    db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_name.like(like)).delete(synchronize_session=False)
    db.query(models.JobOrder).filter(models.JobOrder.job_order_number.like(like)).delete(synchronize_session=False)
    db.query(models.Model).filter(models.Model.model_name.like(like)).delete(synchronize_session=False)
    db.query(models.User).filter(models.User.username.like(like)).delete(synchronize_session=False)
    db.commit()


def test_assignment_inherits_group_hours(db: Session) -> None:
    _, worker = _create_worker_with_group(db, hours=8.0)
    _phase, _schematic, stages = _create_phase_schematic_and_stages(
        db,
        stage_defs=((_unique_slug("stage"), 1, 10, False),),
    )
    st = stages[0]

    today = date.today()
    a, created = tracking_crud.get_or_create_assignment(db, today, int(worker.worker_id), int(st.stage_id), active=True)
    _assert(created is True, "expected first assignment to be created")
    _assert(a.active is True, "expected assignment.active True")
    _assert(a.assignment_date == today, "assignment_date mismatch")
    _assert(_approx(_d(a.working_hours), Decimal("8.00")), f"expected working_hours ~8.00, got {a.working_hours}")


def test_stage_switch_elapsed_accounting(db: Session) -> None:
    _, worker = _create_worker_with_group(db, hours=8.0)
    _phase, _schematic, stages = _create_phase_schematic_and_stages(
        db,
        stage_defs=(
            (_unique_slug("stage-A"), 1, 10, False),
            (_unique_slug("stage-B"), 2, 10, True),
        ),
    )
    st1, st2 = stages

    today = date.today()
    a1, _ = tracking_crud.get_or_create_assignment(db, today, int(worker.worker_id), int(st1.stage_id), active=True)
    # Backdate the first assignment so "elapsed_standard_day" is ~2 hours.
    anchor = datetime.now() - timedelta(hours=2)
    _set_created_at(db, int(a1.daily_assignment_id), anchor)

    a2, created2 = tracking_crud.get_or_create_assignment(db, today, int(worker.worker_id), int(st2.stage_id), active=True)
    _assert(created2 is True, "expected second stage assignment to be created on switch")

    a1r = _get_assignment(db, int(a1.daily_assignment_id))
    a2r = _get_assignment(db, int(a2.daily_assignment_id))

    _assert(a1r.active is False, "previous stage should be deactivated after switch")
    _assert(a2r.active is True, "new stage should be active after switch")

    # Previous row should now hold elapsed hours ~2.0.
    _assert(
        _approx(_d(a1r.working_hours), Decimal("2.00"), tol=Decimal("0.25")),
        f"expected prev working_hours ~2.0 after switch, got {a1r.working_hours}",
    )

    # New row should have remaining ~6.0
    _assert(
        _approx(_d(a2r.working_hours), Decimal("6.00"), tol=Decimal("0.25")),
        f"expected new working_hours ~6.0 remaining, got {a2r.working_hours}",
    )


def test_production_cap_per_stage_type(db: Session) -> None:
    job_order_id = _create_minimal_job_order_graph(db)
    _, worker = _create_worker_with_group(db, hours=8.0)

    # Two stages with SAME stage_name in same schematic => same "stage type"
    stage_type_name = _unique_slug("same-stage-type")
    phase, schematic, stages = _create_phase_schematic_and_stages(
        db,
        stage_defs=(
            (stage_type_name, 1, 10, False),
            (stage_type_name, 2, 10, True),
        ),
    )
    st1, st2 = stages

    batch = _create_batch(db, job_order_id=job_order_id, phase_id=int(phase.phase_id), quantity=10)

    today = date.today()
    a1, _ = tracking_crud.get_or_create_assignment(db, today, int(worker.worker_id), int(st1.stage_id), active=True)

    row, _batch_id, error_code, _max_allowed, _total_already = tracking_crud.record_production(
        db,
        int(a1.daily_assignment_id),
        batch.barcode,
        quantity=10,
        reference_date=today,
    )
    _assert(error_code is None and row is not None, f"expected success recording full qty, got {error_code}")

    # Now attempt to record more for same stage type, but from the other stage ID.
    a2, _ = tracking_crud.get_or_create_assignment(db, today, int(worker.worker_id), int(st2.stage_id), active=True)
    row2, _bid2, error2, max_allowed2, total_already2 = tracking_crud.record_production(
        db,
        int(a2.daily_assignment_id),
        batch.barcode,
        quantity=1,
        reference_date=today,
    )
    _assert(row2 is None, "expected second record attempt to fail / not create row")
    _assert(error2 in ("batch_completed", "exceeds_max"), f"expected cap error, got {error2}")
    _assert(int(total_already2 or 0) >= 10, f"expected total_already>=10, got {total_already2}")
    _assert(int(max_allowed2 or 0) == 0, f"expected max_allowed=0, got {max_allowed2}")


def test_assignment_date_mismatch_rejected(db: Session) -> None:
    job_order_id = _create_minimal_job_order_graph(db)
    _, worker = _create_worker_with_group(db, hours=8.0)
    phase, _schematic, stages = _create_phase_schematic_and_stages(
        db,
        stage_defs=((_unique_slug("stage"), 1, 10, True),),
    )
    st = stages[0]
    batch = _create_batch(db, job_order_id=job_order_id, phase_id=int(phase.phase_id), quantity=5)

    yesterday = date.today() - timedelta(days=1)
    a, _ = tracking_crud.get_or_create_assignment(db, yesterday, int(worker.worker_id), int(st.stage_id), active=True)
    row, _bid, error, *_rest = tracking_crud.record_production(
        db,
        int(a.daily_assignment_id),
        batch.barcode,
        quantity=1,
        reference_date=date.today(),
    )
    _assert(row is None, "expected no production row created")
    _assert(error == "assignment_not_for_today", f"expected assignment_not_for_today, got {error}")


def test_overtime_applies_to_latest_assignment_in_schematic(db: Session) -> None:
    requested_by = _create_minimal_user(db, "req-user")
    approved_by = _create_minimal_user(db, "admin-user")

    _, worker = _create_worker_with_group(db, hours=8.0)
    phase, schematic, stages = _create_phase_schematic_and_stages(
        db,
        stage_defs=(
            (_unique_slug("ot-A"), 1, 10, False),
            (_unique_slug("ot-B"), 2, 10, True),
        ),
    )
    st1, st2 = stages

    today = date.today()

    a1, _ = tracking_crud.get_or_create_assignment(db, today, int(worker.worker_id), int(st1.stage_id), active=True)
    # Backdate a1 so it is NOT the latest.
    _set_created_at(db, int(a1.daily_assignment_id), datetime.now() - timedelta(hours=3))

    a2, _ = tracking_crud.get_or_create_assignment(db, today, int(worker.worker_id), int(st2.stage_id), active=True)
    _set_created_at(db, int(a2.daily_assignment_id), datetime.now() - timedelta(hours=1))

    # Create request and approve it; it should apply to a2 (latest assignment within schematic).
    req = overtime_crud.create_worker_overtime_request(
        db,
        phase_id=int(phase.phase_id),
        schematic_id=int(schematic.schematic_id),
        work_date=today,
        overtime_hours=1.5,
        worker_ids=[int(worker.worker_id)],
        requested_by_user_id=int(requested_by.id),
        notes="test overtime",
    )

    before_a2 = _d(_get_assignment(db, int(a2.daily_assignment_id)).working_hours)
    approved = overtime_crud.approve_worker_overtime_request(
        db,
        request_id=int(req.request_id),
        approved_by_user_id=int(approved_by.id),
        admin_comment="ok",
    )
    _assert(approved.status == "approved", "expected request status approved")

    a2_after = _d(_get_assignment(db, int(a2.daily_assignment_id)).working_hours)
    _assert(
        _approx(a2_after, before_a2 + Decimal("1.5"), tol=Decimal("0.01")),
        f"expected latest assignment hours +1.5 (before={before_a2}, after={a2_after})",
    )

    # Verify history points to the latest assignment_id.
    hist = (
        db.query(models.WorkerOvertimeHistory)
        .filter(models.WorkerOvertimeHistory.request_id == int(req.request_id))
        .first()
    )
    _assert(hist is not None, "expected overtime history row created")
    _assert(int(hist.daily_assignment_id) == int(a2.daily_assignment_id), "expected overtime history to reference latest assignment")
    _assert(int(hist.stage_id) == int(st2.stage_id), "expected overtime history stage_id to match latest assignment stage")

    # Verify refresh queue got the work_date (DB trigger).
    qrow = db.execute(
        text("SELECT work_date FROM reporting.worker_daily_stage_production_refresh_queue WHERE work_date = :d"),
        {"d": today},
    ).fetchone()
    _assert(qrow is not None, "expected reporting refresh queue entry after overtime approval")


def _run(db: Session, tests: List[tuple[str, Callable[[Session], None]]]) -> List[TestResult]:
    results: List[TestResult] = []
    for name, fn in tests:
        try:
            fn(db)
            results.append(TestResult(name=name, passed=True))
        except Exception as exc:  # noqa: BLE001 - we want full detail
            try:
                db.rollback()
            except Exception:
                pass
            detail = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
            results.append(TestResult(name=name, passed=False, detail=detail))
    return results


def main() -> int:
    tests: List[tuple[str, Callable[[Session], None]]] = [
        ("assignment inherits worker-group hours", test_assignment_inherits_group_hours),
        ("stage switch elapsed accounting", test_stage_switch_elapsed_accounting),
        ("production cap per stage type", test_production_cap_per_stage_type),
        ("assignment date mismatch rejected", test_assignment_date_mismatch_rejected),
        ("overtime applies to latest assignment in schematic", test_overtime_applies_to_latest_assignment_in_schematic),
    ]

    db = SessionLocal()
    try:
        results = _run(db, tests)
        # Cleanup even if tests fail; we still want a readable DB.
        try:
            try:
                db.rollback()
            except Exception:
                pass
            _cleanup(db)
        except Exception:
            print("WARNING: Cleanup failed (leaving test data in DB).")
            print(traceback.format_exc())
    finally:
        db.close()

    passed = [r for r in results if r.passed]
    failed = [r for r in results if not r.passed]

    print("=== Daily Assignment Integrity Test Results ===")
    print(f"Passed: {len(passed)} / {len(results)}")
    for r in results:
        status = "PASS" if r.passed else "FAIL"
        print(f"- {status}: {r.name}")
        if not r.passed:
            print(r.detail)

    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())

