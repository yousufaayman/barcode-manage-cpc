from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Tuple


@lru_cache()
def _load_size_order() -> Tuple[dict, int, int]:
    """Load size ordering metadata from shared JSON file."""
    # Project root is one level above backend (backend/..)
    root = Path(__file__).resolve().parents[3]
    json_path = root / "shared" / "size_order.json"
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    precedence_map = {
        size.upper(): index for index, size in enumerate(data.get("precedence", []))
    }
    numeric_start = int(data.get("numeric_start", 0))
    numeric_end = int(data.get("numeric_end", 0))
    return precedence_map, numeric_start, numeric_end


def get_size_sort_key(size_value: str) -> Tuple[int, float, str]:
    """Return a tuple that can be used to consistently sort sizes.

    Ordering rules:
      1. Named sizes defined in size_order.json precedence list.
      2. Numeric sizes (1, 2, 3, ...). Sorted by numeric value.
      3. Fallback to lexical order for anything else.
    """
    if not size_value:
        return (3, float("inf"), "")

    normalized = size_value.strip().upper()
    precedence_map, _, _ = _load_size_order()

    if normalized in precedence_map:
        return (0, precedence_map[normalized], normalized)

    if normalized.isdigit():
        return (1, float(int(normalized)), normalized)

    # Some numeric sizes might include decimals or fractions
    try:
        numeric_value = float(normalized)
        return (1, numeric_value, normalized)
    except ValueError:
        pass

    return (2, float("inf"), normalized)


__all__ = ["get_size_sort_key"]



