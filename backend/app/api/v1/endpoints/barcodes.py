from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Annotated, List, Dict, Any
import logging
from pydantic import BaseModel
from zebra import Zebra

from app.core.deps import get_db
from app.core.config import settings
from app import models


router = APIRouter()

logger = logging.getLogger(__name__)

# ZPL: ^CI28 — UTF-8 (Unicode) character encoding for ^FD fields.
ZPL_UTF8_CHARSET = "^CI28"
# ZPL: ^PA — print alignment (parameters 0,1,1,1).
ZPL_PRINT_ALIGNMENT = "^PA0,1,1,1"
# ZPL: ^BC — Code 128 barcode (N, height 80, print interpretation line, no UCC check digit, no mode).
ZPL_BC_CODE128 = "^BCN,80,Y,N,N"
# ZPL: ^FO field origin + ^BY module width for standard / second-degree barcode block (y=50).
# Shifted slightly right for final print alignment.
ZPL_FO_BY_BARCODE_STANDARD = "^FO30,50^BY2,2.5,50"

# OpenAPI: document HTTPException status codes on routes.
_HTTP_RESP_400 = {"description": "Bad request"}
_HTTP_RESP_500 = {"description": "Internal server error"}
_HTTP_RESP_400_500 = {400: _HTTP_RESP_400, 500: _HTTP_RESP_500}

# 10cm x 5cm at 203 dpi is approximately 800 x 400 dots.
ZPL_LABEL_WIDTH_10X5 = "^PW800"
ZPL_LABEL_LENGTH_10X5 = "^LL400"


def _zpl_clean_ascii(text: str) -> str:
    """Latin fields ASCII-only for predictable ZPL on non-Arabic lines."""
    if not text:
        return ""
    cleaned = str(text).replace("\n", " ").replace("\r", " ").replace("\t", " ")
    return cleaned.encode("ascii", "ignore").decode("ascii").strip()


def _zpl_safe_utf8(text: str) -> str:
    """Keep UTF-8 (Arabic allowed) but strip ZPL control chars and newlines."""
    if not text:
        return ""
    return (
        str(text)
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("\t", " ")
        .replace("^", " ")
        .replace("~", " ")
        .strip()
    )


def _zpl_font_path() -> str:
    """Use configured printer font path for Arabic-capable text."""
    return (settings.ZEBRA_SECOND_DEGREE_ARABIC_FONT or "E:TT0003M_.TTF").strip()


def _zpl_shape_arabic(text: str) -> str:
    """Raw Arabic for printer flow that already renders correctly."""
    safe = _zpl_safe_utf8(text)
    return safe


def _build_zpl_rework(
    *,
    client: str,
    model: str,
    po: str,
    phase_name: str,
    stage_name: str,
    color_name: str,
    size_value: str,
    barcode_string: str,
) -> str:
    phase_s = _zpl_shape_arabic(phase_name)
    stage_s = _zpl_shape_arabic(stage_name)
    color_utf8 = _zpl_shape_arabic(color_name)
    size_utf8 = _zpl_shape_arabic(size_value)
    barcode_utf8 = _zpl_safe_utf8(barcode_string)
    font = _zpl_font_path()
    parts = [
        "^XA",
        ZPL_LABEL_WIDTH_10X5,
        ZPL_LABEL_LENGTH_10X5,
        ZPL_UTF8_CHARSET,
        f"^CW1,{font}",
        ZPL_PRINT_ALIGNMENT,
        "^FO30,60^BY2,2.5,50",
        ZPL_BC_CODE128,
        f"^FD{barcode_utf8}^FS",
        "^FO340,20^A1N,30,30^FDإصلاح^FS",
        f"^FO20,200^A1N,30,30^FDالعميل: {client} | الموديل: {model}^FS",
        f"^FO20,270^A1N,30,30^FDاللون: {color_utf8} | المقاس: {size_utf8} | المرحلة: {phase_s}^FS",
        f"^FO20,340^A1N,30,30^FDPO: {po} | المرحلة: {stage_s}^FS",
        "^XZ",
    ]
    return "\r\n".join(parts)


def _build_zpl_second_degree(
    *,
    client: str,
    model: str,
    color: str,
    qty: str,
    size: str,
    po: str,
    clean_barcode: str,
) -> str:
    from app.utils.second_degree_arabic_zpl import get_second_degree_arabic_zpl_field

    arabic_field = (get_second_degree_arabic_zpl_field() or "").strip()
    font = _zpl_font_path()
    parts = [
        "^XA",
        ZPL_LABEL_WIDTH_10X5,
        ZPL_LABEL_LENGTH_10X5,
        ZPL_UTF8_CHARSET,
        f"^CW1,{font}",
        ZPL_PRINT_ALIGNMENT,
        ZPL_FO_BY_BARCODE_STANDARD,
        ZPL_BC_CODE128,
        f"^FD{clean_barcode}^FS",
        f"^FO50,200^A1N,35,35^FDالعميل: {client} | الموديل: {model}^FS",
        f"^FO50,270^A1N,35,35^FDاللون: {color} | الكمية: {qty} | المقاس: {size}^FS",
        f"^FO50,340^A0N,35,35^FDPO: {po} |^FS",
    ]
    fallback_arabic = "^FO580,340^A1N,50,50^FDدرجة ثانية^FS"
    parts.append(arabic_field if arabic_field else fallback_arabic)
    parts.extend(["^PQ1", "^XZ"])
    return "\r\n".join(parts)


def _build_zpl_standard(
    *,
    client: str,
    model: str,
    color: str,
    qty: str,
    size: str,
    layers_s: str,
    po: str,
    clean_barcode: str,
) -> str:
    font = _zpl_font_path()
    parts = [
        "^XA",
        ZPL_LABEL_WIDTH_10X5,
        ZPL_LABEL_LENGTH_10X5,
        ZPL_UTF8_CHARSET,
        f"^CW1,{font}",
        ZPL_PRINT_ALIGNMENT,
        ZPL_FO_BY_BARCODE_STANDARD,
        ZPL_BC_CODE128,
        f"^FD{clean_barcode}^FS",
        f"^FO50,200^A1N,35,35^FDالعميل: {client} | الموديل: {model}^FS",
        f"^FO50,270^A1N,35,35^FDاللون: {color} | الكمية: {qty} | المقاس: {size}^FS",
        f"^FO50,340^A1N,35,35^FDالطبقات: {layers_s} | PO: {po}^FS",
        "^PQ1",
        "^XZ",
    ]
    return "\r\n".join(parts)


def get_available_printers():
    """Get list of available Zebra printers"""
    try:
        z = Zebra()
        printers = z.getqueues()
        return printers if printers else ["No Zebra printers found"]
    except Exception as e:
        logger.error(f"Error getting printers: {str(e)}")
        return ["No Zebra printers found"]


@router.get("/zpl/second-degree-arabic-graphic")
def get_second_degree_arabic_graphic_fragment():
    """ZPL fragment (^FO...^A@...^FD...) for Arabic 'second degree' using printer font (Browser Print)."""
    from app.utils.second_degree_arabic_zpl import get_second_degree_arabic_zpl_field

    return {"fragment": get_second_degree_arabic_zpl_field()}


def print_barcode_zebra(
    barcode_string: str,
    brand: str,
    model_name: str,
    size_value: str,
    color_name: str,
    quantity: int,
    printer_name: str,
    layers: int = 1,
    job_order_number: str = "",
    is_second_degree: bool = False,
    is_rework: bool = False,
    phase_name: str = "",
    stage_name: str = "",
):
    try:
        # Latin fields ASCII-only; Arabic uses printer bound font (^CW1/^A1) + UTF-8 (^CI28).
        # No leading whitespace before ^ — indented triple-quoted f-strings break Zebra parsers.
        client = _zpl_clean_ascii(brand)
        model = _zpl_clean_ascii(model_name)
        color = _zpl_safe_utf8(color_name)
        qty = str(int(quantity) if quantity is not None else 0)
        size = _zpl_safe_utf8(size_value)
        # Label says "Serial:" on sticker; value is batch.layers (legacy wording).
        layers_s = str(int(layers) if layers is not None else 1)
        po = _zpl_clean_ascii(job_order_number)
        clean_barcode = _zpl_clean_ascii(barcode_string)

        if is_rework:
            zpl_code = _build_zpl_rework(
                client=client,
                model=model,
                po=po,
                phase_name=phase_name or "",
                stage_name=stage_name or "",
                color_name=color_name or "",
                size_value=size_value or "",
                barcode_string=barcode_string or "",
            )
        elif is_second_degree:
            zpl_code = _build_zpl_second_degree(
                client=client,
                model=model,
                color=color,
                qty=qty,
                size=size,
                po=po,
                clean_barcode=clean_barcode,
            )
        else:
            zpl_code = _build_zpl_standard(
                client=client,
                model=model,
                color=color,
                qty=qty,
                size=size,
                layers_s=layers_s,
                po=po,
                clean_barcode=clean_barcode,
            )

        z = Zebra(printer_name)
        z.output(zpl_code, encoding="utf-8")
        return True
    except Exception as e:
        logger.error(f"Error printing barcode {barcode_string}: {str(e)}")
        raise


class PrintBarcodeRequest(BaseModel):
    barcodes: List[Dict[str, Any]]
    count: int
    printer_name: str


@router.get("/printers", responses={500: _HTTP_RESP_500})
async def get_printers():
    """Get list of available Zebra printers"""
    try:
        printers = get_available_printers()
        return {"printers": printers}
    except Exception as e:
        logger.error(f"Error getting printers: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get printers: {str(e)}",
        )


def _require_valid_printer(printer_name: str) -> None:
    available = get_available_printers()
    if printer_name in available:
        return
    raise HTTPException(
        status_code=400,
        detail=f"Invalid printer. Available printers: {', '.join(available)}",
    )


def _print_zpl_copies(barcode: Dict[str, Any], printer_name: str, count: int) -> None:
    for _ in range(count):
        print_barcode_zebra(
            barcode_string=barcode.get("barcode", ""),
            brand=barcode.get("client_name", ""),
            model_name=barcode.get("model", ""),
            size_value=barcode.get("size", ""),
            color_name=barcode.get("color", ""),
            quantity=barcode.get("quantity", 0),
            printer_name=printer_name,
            layers=barcode.get("layers", 1),
            job_order_number=str(barcode.get("job_order_number", "") or ""),
            is_second_degree=bool(barcode.get("is_second_degree", False)),
            is_rework=bool(barcode.get("is_rework", False)),
            phase_name=str(barcode.get("phase_name", "") or ""),
            stage_name=str(barcode.get("stage_name", "") or ""),
        )


def _mark_rework_printed_after_success(db: Session, barcode: Dict[str, Any]) -> None:
    if not (bool(barcode.get("is_rework", False)) and barcode.get("rework_batch_id") is not None):
        return
    try:
        rework_batch_id = int(barcode.get("rework_batch_id"))
        rb = (
            db.query(models.ReworkBatch)
            .filter(models.ReworkBatch.rework_batch_id == rework_batch_id)
            .first()
        )
        if rb is not None and not rb.printed:
            rb.printed = True
            db.commit()
    except Exception:
        db.rollback()


@router.post("/print", responses=_HTTP_RESP_400_500)
async def print_barcodes(
    request: PrintBarcodeRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """Print barcodes with specified count"""
    try:
        _require_valid_printer(request.printer_name)
        for barcode in request.barcodes:
            _print_zpl_copies(barcode, request.printer_name, request.count)
            _mark_rework_printed_after_success(db, barcode)
        return {
            "message": (
                f"Successfully printed {len(request.barcodes)} barcodes "
                f"{request.count} times each"
            ),
            "barcodes_printed": len(request.barcodes),
            "print_count": request.count,
            "printer_used": request.printer_name,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error printing barcodes: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to print barcodes: {str(e)}",
        )
