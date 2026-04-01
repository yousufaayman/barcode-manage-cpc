"""
Second-degree Arabic on Zebra: use a printer-resident Arabic font (e.g. Swiss 271) via ^A@,
plus arabic_reshaper + bidi. ^CI28 (UTF-8) is emitted on the label before this field (see barcodes / frontend).
"""
from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_ARABIC_SECOND_DEGREE = "درجة ثانية"


def get_second_degree_arabic_shaped_text() -> str:
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
    except ImportError:
        return ""
    return get_display(arabic_reshaper.reshape(_ARABIC_SECOND_DEGREE))


def get_second_degree_arabic_zpl_field() -> str:
    """
    Single field: ^FO + ^A@ + ^FD...^FS. Font path/name must match what is on the printer (e.g. E:SWISS271.TTF).
    Empty if deps missing or ZEBRA_SECOND_DEGREE_ARABIC_FONT is unset.
    """
    shaped = get_second_degree_arabic_shaped_text()
    if not shaped:
        return ""

    font = (settings.ZEBRA_SECOND_DEGREE_ARABIC_FONT or "").strip()
    if not font:
        logger.warning("ZEBRA_SECOND_DEGREE_ARABIC_FONT is empty; second-degree Arabic label line skipped")
        return ""

    h, w = settings.ZEBRA_SECOND_DEGREE_ARABIC_FONT_HEIGHT, settings.ZEBRA_SECOND_DEGREE_ARABIC_FONT_WIDTH
    fx = settings.ZEBRA_SECOND_DEGREE_ARABIC_FO_X
    fy = settings.ZEBRA_SECOND_DEGREE_ARABIC_FO_Y
    return f"^FO{fx},{fy}^A@N,{h},{w},{font}^FD{shaped}^FS"
