"""
Second-degree Arabic on Zebra using raw Arabic text.
^CI28 (UTF-8) is emitted on the label before this field (see barcodes / frontend).
"""
from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_ARABIC_SECOND_DEGREE = "درجة ثانية"


def get_second_degree_arabic_raw_text() -> str:
    return _ARABIC_SECOND_DEGREE


def get_second_degree_arabic_zpl_field() -> str:
    """
    Single field: ^FO + ^A1 + ^FD...^FS.
    The caller must bind font alias 1 first: ^CW1,<font-path>.
    """
    arabic_text = get_second_degree_arabic_raw_text()

    font = (settings.ZEBRA_SECOND_DEGREE_ARABIC_FONT or "").strip()
    if not font:
        logger.warning("ZEBRA_SECOND_DEGREE_ARABIC_FONT is empty; second-degree Arabic label line skipped")
        return ""

    h, w = settings.ZEBRA_SECOND_DEGREE_ARABIC_FONT_HEIGHT, settings.ZEBRA_SECOND_DEGREE_ARABIC_FONT_WIDTH
    fx = settings.ZEBRA_SECOND_DEGREE_ARABIC_FO_X
    fy = settings.ZEBRA_SECOND_DEGREE_ARABIC_FO_Y
    return f"^FO{fx},{fy}^A1N,{h},{w}^FD{arabic_text}^FS"
