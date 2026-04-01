from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import text

from app.crud import cut as cut_crud
from app.crud.batch import generate_batches_from_cut
from app.database import SessionLocal


@dataclass(frozen=True)
class Scenario:
    extra_pieces_threshold: Optional[int]
    max_batch_size: Optional[int]


def _iter_cut_ids(db) -> Iterable[int]:
    rows = db.execute(text("SELECT DISTINCT cut_id FROM ops.cut_details ORDER BY cut_id ASC")).fetchall()
    for r in rows:
        yield int(r[0])


def _expected_totals_by_size_id_from_cut_details(cut_details: Dict[str, Any]) -> Dict[int, int]:
    expected: Dict[int, int] = {}
    for s in cut_details.get("sizes") or []:
        size_id = s.get("size_id")
        total_pieces = s.get("total_pieces")
        if size_id is None or total_pieces is None:
            continue
        expected[int(size_id)] = int(total_pieces)
    return expected


def _actual_totals_by_size_id_from_batches(batches: List[Dict[str, Any]]) -> Dict[int, int]:
    totals: Dict[int, int] = defaultdict(int)
    for b in batches:
        size_id = b.get("size_id")
        qty = b.get("quantity") or 0
        if size_id is None:
            continue
        totals[int(size_id)] += int(qty)
    return dict(totals)


def _check_threshold_invariants(
    batches: List[Dict[str, Any]],
    *,
    extra_pieces_threshold: Optional[int],
) -> List[str]:
    if not extra_pieces_threshold:
        return []

    issues: List[str] = []
    thr = int(extra_pieces_threshold)

    # In auto mode we explicitly avoid merging across rolls.
    # So we verify: within the same (size_id, roll_number) group, there should not be a "non-first" batch
    # with quantity 0 < qty < threshold.
    groups: Dict[Tuple[int, int], List[Dict[str, Any]]] = defaultdict(list)
    for b in batches:
        size_id = b.get("size_id")
        layers = b.get("layers")
        if size_id is None or layers is None:
            continue
        roll_number = int(layers) % 100
        groups[(int(size_id), roll_number)].append(b)

    for (size_id, roll_number), gb in groups.items():
        gb.sort(key=lambda x: x.get("batch", 0))
        for idx, b in enumerate(gb):
            qty = int(b.get("quantity") or 0)
            if idx > 0 and 0 < qty < thr:
                issues.append(
                    f"threshold_violation: size_id={size_id} roll={roll_number} "
                    f"batch={b.get('batch')} qty={qty} < threshold={thr}"
                )

    return issues


def run_diagnostics(
    *,
    scenarios: List[Scenario],
    cut_ids: Optional[List[int]] = None,
    limit: Optional[int] = None,
) -> int:
    """
    Runs batch generation for cuts and validates:
    - totals per size_id match cut_details_view totals (after transitions; transitions are handled inside generator)
    - extra pieces threshold invariants per (size_id, roll_number)

    Returns number of failing (cut_id, scenario) cases.
    """
    failures = 0
    db = SessionLocal()
    try:
        all_cut_ids = cut_ids if cut_ids is not None else list(_iter_cut_ids(db))
        if limit is not None:
            all_cut_ids = all_cut_ids[: int(limit)]

        for cut_id in all_cut_ids:
            cut_details = cut_crud.get_cut_details_by_id(db, cut_id)
            if not cut_details:
                continue

            job_order_id = int(cut_details["job_order_id"])
            expected_totals = _expected_totals_by_size_id_from_cut_details(cut_details)

            for sc in scenarios:
                try:
                    batches = generate_batches_from_cut(
                        db,
                        job_order_id=job_order_id,
                        cut_id=int(cut_id),
                        max_batch_size=sc.max_batch_size,
                        extra_pieces_threshold=sc.extra_pieces_threshold,
                    )
                except Exception as e:
                    failures += 1
                    print(
                        f"[FAIL] cut_id={cut_id} job_order_id={job_order_id} "
                        f"scenario(thr={sc.extra_pieces_threshold}, max={sc.max_batch_size}) "
                        f"exception={type(e).__name__}: {e}"
                    )
                    continue

                actual_totals = _actual_totals_by_size_id_from_batches(batches)

                mismatches = []
                for size_id, expected in expected_totals.items():
                    actual = actual_totals.get(size_id, 0)
                    if actual != expected:
                        mismatches.append((size_id, expected, actual, actual - expected))

                threshold_issues = _check_threshold_invariants(
                    batches,
                    extra_pieces_threshold=sc.extra_pieces_threshold,
                )

                if mismatches or threshold_issues:
                    failures += 1
                    print(
                        f"[FAIL] cut_id={cut_id} job_order_id={job_order_id} "
                        f"scenario(thr={sc.extra_pieces_threshold}, max={sc.max_batch_size}) "
                        f"mismatches={mismatches} threshold_issues={len(threshold_issues)}"
                    )
                    for ti in threshold_issues[:10]:
                        print(f"  - {ti}")

        return failures
    finally:
        db.close()


if __name__ == "__main__":
    scenarios = [
        Scenario(extra_pieces_threshold=5, max_batch_size=None),
        Scenario(extra_pieces_threshold=5, max_batch_size=200),
        Scenario(extra_pieces_threshold=5, max_batch_size=100),
        Scenario(extra_pieces_threshold=5, max_batch_size=50),
        Scenario(extra_pieces_threshold=5, max_batch_size=40),
    ]
    failures = run_diagnostics(scenarios=scenarios, cut_ids=None, limit=None)
    print(f"Done. failures={failures}")

