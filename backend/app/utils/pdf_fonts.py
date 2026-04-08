"""Register Unicode fonts (Arabic + Latin) for ReportLab PDFs."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional, Tuple

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

# Default to built-ins; replaced after successful TTF registration
PDF_FONT_REGULAR = "Helvetica"
PDF_FONT_BOLD = "Helvetica-Bold"

_FONT_READY = False

_FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"

_NOTO_REGULAR_URL = (
    "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/"
    "hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf"
)
_NOTO_BOLD_URL = (
    "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/"
    "hinted/ttf/NotoSansArabic/NotoSansArabic-Bold.ttf"
)

_REGISTERED_NAMES = ("PdfUnicode", "PdfUnicode-Bold")


def _download(url: str, dest: Path) -> bool:
    try:
        import urllib.request

        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        urllib.request.urlretrieve(url, tmp)
        tmp.replace(dest)
        return dest.is_file() and dest.stat().st_size > 2000
    except Exception as exc:
        logger.warning("Could not download font from %s: %s", url, exc)
        return False


def _resolve_ttf_paths() -> Tuple[Optional[Path], Optional[Path]]:
    """Return (regular, bold) TTF paths, or (None, None) if unavailable."""
    # Prefer fonts with good Latin + Arabic coverage first.
    win = os.environ.get("WINDIR", r"C:\Windows")
    ar = Path(win) / "Fonts" / "arial.ttf"
    ab = Path(win) / "Fonts" / "arialbd.ttf"
    if ar.is_file() and ab.is_file():
        logger.info("Using Windows Arial TTFs for PDF Unicode fonts")
        return ar, ab

    for base, b in (
        (
            Path("/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf"),
            Path("/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ),
    ):
        if base.is_file() and b.is_file():
            logger.info("Using system TTFs for PDF Unicode fonts: %s", base)
            return base, b

    # As a fallback, try downloading Noto Arabic files into backend/app/fonts.
    regular = _FONT_DIR / "NotoSansArabic-Regular.ttf"
    bold = _FONT_DIR / "NotoSansArabic-Bold.ttf"

    if not regular.is_file():
        _download(_NOTO_REGULAR_URL, regular)
    if not bold.is_file():
        _download(_NOTO_BOLD_URL, bold)

    if regular.is_file() and bold.is_file():
        logger.info("Using downloaded Noto Arabic fonts from %s", _FONT_DIR)
        return regular, bold

    return None, None


def ensure_pdf_fonts_registered() -> None:
    """Register Arabic-capable fonts once per process; safe to call repeatedly."""
    global _FONT_READY, PDF_FONT_REGULAR, PDF_FONT_BOLD
    if _FONT_READY:
        return

    reg, bold = _resolve_ttf_paths()
    if reg is not None and bold is not None:
        try:
            pdfmetrics.registerFont(TTFont(_REGISTERED_NAMES[0], str(reg)))
            pdfmetrics.registerFont(TTFont(_REGISTERED_NAMES[1], str(bold)))
            PDF_FONT_REGULAR = _REGISTERED_NAMES[0]
            PDF_FONT_BOLD = _REGISTERED_NAMES[1]
            logger.info(
                "PDF Unicode fonts registered as %s / %s",
                PDF_FONT_REGULAR,
                PDF_FONT_BOLD,
            )
        except Exception as exc:
            logger.warning("Failed to register Noto/Arial TTF fonts: %s", exc)
    else:
        logger.warning(
            "No Arabic-capable TTF found; Arabic may not render. "
            "Install fonts under %s or ensure network access for first-time download.",
            _FONT_DIR,
        )

    _FONT_READY = True


def patch_reportlab_sample_styles(styles) -> None:
    """Point sample stylesheet entries at PDF fonts (bold vs regular)."""
    ensure_pdf_fonts_registered()
    bold_names = frozenset(
        {
            "Title",
            "Heading1",
            "Heading2",
            "Heading3",
            "Heading4",
            "Heading5",
            "Heading6",
        }
    )
    try:
        by = getattr(styles, "byName", None) or styles
        for name, st in by.items():
            if not hasattr(st, "fontName"):
                continue
            if name in bold_names:
                st.fontName = PDF_FONT_BOLD
            else:
                st.fontName = PDF_FONT_REGULAR
    except Exception as exc:
        logger.warning("Could not patch sample styles: %s", exc)
