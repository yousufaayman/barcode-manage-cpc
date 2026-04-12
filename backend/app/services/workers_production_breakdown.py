"""Shared logic for all-workers production / utilization (Advanced Statistics → Workers)."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from app import schemas


def build_all_workers_production_breakdown(
    db: Session,
    date_from: date,
    date_to: date,
) -> schemas.AllWorkersProductionBreakdownResponse:
    """
    Same aggregation as GET /production/workers/breakdown: utilization is
    total true working hours / total capacity working hours per worker over the range.
    For a single day, matches Advanced Statistics → Workers with from = to = that date.
    """

    def _worker_quality_pct(produced: int, rework: int) -> Optional[float]:
        if produced < 0 or rework < 0:
            return None
        if rework == 0:
            return 100.0 if produced > 0 else None
        denom = produced + rework
        if denom <= 0:
            return None
        return (produced / float(denom)) * 100.0

    def _row_quality_pct(produced: int, rework: float) -> Optional[float]:
        if produced < 0 or rework < 0:
            return None
        if rework <= 0:
            return 100.0 if produced > 0 else None
        denom = float(produced) + rework
        if denom <= 0:
            return None
        return (produced / denom) * 100.0

    rework_day_rows = db.execute(
        text(
            """
            SELECT
                sr.worker_id,
                CAST(sr.rejected_at AS date) AS rej_date,
                COALESCE(SUM(sr.quantity), 0)::int AS rework_qty
            FROM ops.single_rejections sr
            WHERE sr.worker_id IS NOT NULL
              AND CAST(sr.rejected_at AS date) >= :date_from
              AND CAST(sr.rejected_at AS date) <= :date_to
            GROUP BY sr.worker_id, CAST(sr.rejected_at AS date)
            """
        ),
        {"date_from": date_from, "date_to": date_to},
    ).mappings().all()

    rework_day: dict[Tuple[int, date], int] = {}
    rework_worker_total: dict[int, int] = defaultdict(int)
    for rr in rework_day_rows:
        wid = int(rr["worker_id"])
        d = rr["rej_date"]
        q = int(rr["rework_qty"] or 0)
        rework_day[(wid, d)] = q
        rework_worker_total[wid] += q

    true_day_rows = db.execute(
        text(
            """
            SELECT
                r.worker_id,
                r.work_date,
                COALESCE(SUM(r.true_output), 0)::int AS true_qty
            FROM reporting.worker_daily_stage_production r
            WHERE r.work_date >= :date_from
              AND r.work_date <= :date_to
            GROUP BY r.worker_id, r.work_date
            """
        ),
        {"date_from": date_from, "date_to": date_to},
    ).mappings().all()
    true_day: dict[Tuple[int, date], int] = {
        (int(tr["worker_id"]), tr["work_date"]): int(tr["true_qty"] or 0)
        for tr in true_day_rows
    }

    rows = db.execute(
        text(
            """
            SELECT
                r.work_date,
                r.worker_id,
                w.worker_name,
                p.phase_id,
                p.phase_name,
                sch.schematic_id,
                sch.name AS schematic_name,
                SUM(r.expected_output)::int AS expected_output,
                SUM(r.true_output)::int AS true_output,
                SUM(r.working_hours)::double precision AS working_hours,
                SUM(r.overtime_hours)::double precision AS overtime_hours,
                (
                    COALESCE(MAX(ac.assignment_count), 0)::double precision
                    * COALESCE(MAX(wg.working_hours), MAX(sch.working_hours), 0)::double precision
                    + SUM(r.overtime_hours)::double precision
                ) AS capacity_working_hours
            FROM reporting.worker_daily_stage_production r
            JOIN core.workers w
              ON w.worker_id = r.worker_id
            LEFT JOIN core.workers_groups wg
              ON wg.group_id = w.worker_group_id
            JOIN core.sewing_line_stages st
              ON st.stage_id = r.stage_id
            JOIN core.sewing_line_schematics sch
              ON sch.schematic_id = st.schematic_id
            JOIN core.production_phases p
              ON p.phase_id = sch.production_phase_id
            LEFT JOIN (
                SELECT DISTINCT
                    wda.assignment_date AS work_date,
                    wda.worker_id,
                    st2.schematic_id,
                    1::int AS assignment_count
                FROM ops.worker_daily_stage_assignments wda
                JOIN core.sewing_line_stages st2
                  ON st2.stage_id = wda.stage_id
                WHERE wda.assignment_date >= :date_from
                  AND wda.assignment_date <= :date_to
            ) ac
              ON ac.work_date = r.work_date
             AND ac.worker_id = r.worker_id
             AND ac.schematic_id = sch.schematic_id
            WHERE r.work_date >= :date_from
              AND r.work_date <= :date_to
            GROUP BY
                r.work_date,
                r.worker_id,
                w.worker_name,
                p.phase_id,
                p.phase_name,
                sch.schematic_id,
                sch.name
            ORDER BY
                w.worker_name ASC,
                p.phase_name ASC,
                sch.name ASC,
                r.work_date ASC;
            """
        ),
        {"date_from": date_from, "date_to": date_to},
    ).mappings().all()

    records: List[schemas.WorkerProductionRecord] = []
    aggregates_map: dict[int, dict] = {}

    for r in rows:
        worker_id = int(r["worker_id"])
        expected_output = int(r["expected_output"] or 0)
        true_output = int(r["true_output"] or 0)
        working_hours = float(r["working_hours"] or 0)
        overtime_hours = float(r["overtime_hours"] or 0)
        capacity_working_hours = float(r["capacity_working_hours"] or 0)

        wd = (worker_id, r["work_date"])
        day_true = true_day.get(wd, 0)
        day_rework = rework_day.get(wd, 0)
        if day_true > 0:
            rework_alloc = round(day_rework * (true_output / float(day_true)), 2)
        else:
            rework_alloc = 0.0
        row_quality_pct = _row_quality_pct(true_output, rework_alloc)

        efficiency_pct: Optional[float]
        if expected_output > 0:
            efficiency_pct = (true_output / float(expected_output)) * 100.0
        else:
            efficiency_pct = None

        records.append(
            schemas.WorkerProductionRecord(
                worker_id=worker_id,
                worker_name=str(r["worker_name"]),
                phase_id=int(r["phase_id"]),
                phase_name=str(r["phase_name"]),
                schematic_id=int(r["schematic_id"]),
                schematic_name=str(r["schematic_name"]),
                work_date=r["work_date"],
                expected_output=expected_output,
                true_output=true_output,
                working_hours=working_hours,
                overtime_hours=overtime_hours,
                capacity_working_hours=capacity_working_hours,
                rework_pcs=rework_alloc,
                quality_pct=row_quality_pct,
                efficiency_pct=efficiency_pct,
            )
        )

        agg = aggregates_map.get(worker_id)
        if not agg:
            aggregates_map[worker_id] = {
                "worker_id": worker_id,
                "worker_name": str(r["worker_name"]),
                "total_expected_output": 0,
                "total_true_output": 0,
                "total_working_hours": 0.0,
                "total_overtime_hours": 0.0,
                "total_capacity_working_hours": 0.0,
            }
            agg = aggregates_map[worker_id]

        agg["total_expected_output"] += expected_output
        agg["total_true_output"] += true_output
        agg["total_working_hours"] += working_hours
        agg["total_overtime_hours"] += overtime_hours
        agg["total_capacity_working_hours"] += capacity_working_hours

    aggregates: List[schemas.WorkerProductionAggregate] = []
    for agg in aggregates_map.values():
        total_expected = int(agg["total_expected_output"])
        total_true = int(agg["total_true_output"])
        total_true_hours = float(agg["total_working_hours"])
        total_cap = float(agg["total_capacity_working_hours"])
        efficiency_pct = (
            (total_true / float(total_expected)) * 100.0 if total_expected > 0 else None
        )
        worker_utilization_pct = (
            (total_true_hours / total_cap) * 100.0 if total_cap > 0 else None
        )
        total_rework = int(rework_worker_total.get(int(agg["worker_id"]), 0))
        quality_pct = _worker_quality_pct(total_true, total_rework)
        aggregates.append(
            schemas.WorkerProductionAggregate(
                worker_id=int(agg["worker_id"]),
                worker_name=str(agg["worker_name"]),
                total_expected_output=total_expected,
                total_true_output=total_true,
                total_working_hours=total_true_hours,
                total_overtime_hours=float(agg["total_overtime_hours"]),
                total_capacity_working_hours=total_cap,
                worker_utilization_pct=worker_utilization_pct,
                total_rework_pcs=total_rework,
                quality_pct=quality_pct,
                efficiency_pct=efficiency_pct,
            )
        )

    aggregates.sort(key=lambda a: a.worker_name or "")
    return schemas.AllWorkersProductionBreakdownResponse(
        date_from=date_from,
        date_to=date_to,
        records=records,
        aggregates=aggregates,
    )


def get_absence_workers_for_date(
    db: Session,
    target_date: date,
) -> List[Tuple[int, str]]:
    """
    Active workers who have no ``ops.worker_daily_stage_assignments`` row for
    ``target_date`` (no daily stage assignment that day).
    """
    rows = db.execute(
        text(
            """
            SELECT w.worker_id, w.worker_name
            FROM core.workers w
            WHERE w.active IS TRUE
              AND NOT EXISTS (
                SELECT 1
                FROM ops.worker_daily_stage_assignments wda
                WHERE wda.worker_id = w.worker_id
                  AND wda.assignment_date = :d
              )
            ORDER BY w.worker_name ASC
            """
        ),
        {"d": target_date},
    ).mappings().all()
    return [(int(r["worker_id"]), str(r["worker_name"] or "")) for r in rows]


def get_total_active_worker_count(db: Session) -> int:
    """Count of active rows in ``core.workers`` (denominator for PDF capacity line)."""
    row = db.execute(
        text(
            """
            SELECT COUNT(*)::int AS n
            FROM core.workers w
            WHERE w.active IS TRUE
            """
        ),
    ).mappings().first()
    return int(row["n"] or 0) if row else 0
