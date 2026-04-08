"""Arabic shaping + bidi for ReportLab PDF text (same stack as ZPL Arabic)."""
from __future__ import annotations

import re
from typing import Any, List


_ARABIC_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")


def prepare_pdf_text(value: Any) -> str:
    """
    Shape Arabic and apply bidi so PDFs render readable Arabic.
    Latin text is left unchanged in practice.
    """
    if value is None:
        return ""
    s = str(value)
    if not s:
        return s
    # Keep pure English/Latin text untouched.
    if _ARABIC_RE.search(s) is None:
        return s

    try:
        import arabic_reshaper
        from bidi.algorithm import get_display

        # Use default reshaper config for broad compatibility across versions.
        return get_display(arabic_reshaper.reshape(s))
    except Exception:
        return s


def apply_pdf_unicode_to_table_rows(rows: List[List[Any]]) -> List[List[Any]]:
    """Apply prepare_pdf_text to plain string cells; leave Paragraph objects unchanged."""
    out: List[List[Any]] = []
    for row in rows:
        new_row: List[Any] = []
        for cell in row:
            if isinstance(cell, str):
                new_row.append(prepare_pdf_text(cell))
            else:
                new_row.append(cell)
        out.append(new_row)
    return out
