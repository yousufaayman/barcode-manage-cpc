from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from typing import Annotated, List, Dict, Any, Union, Optional
import pandas as pd
from io import BytesIO
from fastapi.responses import StreamingResponse
import openpyxl
import logging
import re
from pydantic import BaseModel
from zebra import Zebra

from app.core.deps import get_db
from app.crud import (
    create_batch,
    get_batch,
    get_batch_by_barcode,
    get_client,
    get_color,
    get_model,
    get_phase,
    get_size,
)
from app import schemas
from app.crud.helpers import process_bulk_barcodes as process_bulk_barcodes_helper
from app.core.deps import get_current_active_user
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
ZPL_FO_BY_BARCODE_STANDARD = "^FO10,50^BY2,2.5,50"

# OpenAPI: document HTTPException status codes on routes.
_HTTP_RESP_400 = {"description": "Bad request"}
_HTTP_RESP_500 = {"description": "Internal server error"}
_HTTP_RESP_400_500 = {400: _HTTP_RESP_400, 500: _HTTP_RESP_500}

_ARABIC_CHARS_RE = re.compile(
    r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]"
)


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


def _zpl_shape_arabic(text: str) -> str:
    """Presentation forms + bidi for Arabic in ^FD when libraries are available."""
    safe = _zpl_safe_utf8(text)
    if not safe:
        return ""
    if not _ARABIC_CHARS_RE.search(safe):
        return safe
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display

        return get_display(arabic_reshaper.reshape(safe))
    except Exception:
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
    parts = [
        "^XA",
        ZPL_UTF8_CHARSET,
        ZPL_PRINT_ALIGNMENT,
        "^FO10,60^BY2,2.5,50",
        ZPL_BC_CODE128,
        f"^FD{barcode_utf8}^FS",
        "^FO340,20^A@N,30,30,E:SWISS271.TTF^FD\ufe95\ufe8e\ufea3\ufefc\ufebb\ufe87^FS",
        f"^FO20,200^A@N,30,30,E:SWISS271.TTF^FD\ufede\ufef4\ufee4\ufecc\ufedf\ufe8d: {client} | \ufede\ufef3\ufea9\ufeee\ufee4\ufedf\ufe8d: {model}^FS",
        f"^FO20,270^A@N,30,30,E:SWISS271.TTF^FD\ufee5\ufeee\ufee0\ufedf\ufe8d: {color_utf8} | \ufeb1\ufe8e\ufed8\ufee4\ufedf\ufe8d: {size_utf8} | \ufec2\ufea8\ufedf\ufe8d: {phase_s}^FS",
        f"^FO20,340^A@N,30,30,E:SWISS271.TTF^FDPO: {po} | \ufe94\ufee0\ufea3\ufeae\ufee4\ufedf\ufe8d: {stage_s}^FS",
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
    parts = [
        "^XA",
        ZPL_UTF8_CHARSET,
        ZPL_PRINT_ALIGNMENT,
        ZPL_FO_BY_BARCODE_STANDARD,
        ZPL_BC_CODE128,
        f"^FD{clean_barcode}^FS",
        f"^FO50,200^A@N,35,35,E:SWISS271.TTF^FD\ufede\ufef4\ufee4\ufecc\ufedf\ufe8d: {client} | \ufede\ufef3\ufea9\ufeee\ufee4\ufedf\ufe8d: {model}^FS",
        f"^FO50,270^A@N,35,35,E:SWISS271.TTF^FD\ufee5\ufeee\ufee0\ufedf\ufe8d: {color} | \ufe94\ufef4\ufee4\ufedc\ufedf\ufe8d: {qty} | \ufeb1\ufe8e\ufed8\ufee4\ufedf\ufe8d: {size}^FS",
        f"^FO50,340^A0N,35,35^FDPO: {po} |^FS",
    ]
    fallback_arabic = (
        "^FO580,340^A@N,50,50,E:SWISS271.TTF^FD\ufe94\ufef4\ufee7\ufe8e\ufe9b \ufe94\ufe9f\ufead\ufea9^FS"
    )
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
    parts = [
        "^XA",
        ZPL_UTF8_CHARSET,
        ZPL_PRINT_ALIGNMENT,
        ZPL_FO_BY_BARCODE_STANDARD,
        ZPL_BC_CODE128,
        f"^FD{clean_barcode}^FS",
        f"^FO50,200^A@N,35,35,E:SWISS271.TTF^FD\ufede\ufef4\ufee4\ufecc\ufedf\ufe8d: {client} | \ufede\ufef3\ufea9\ufeee\ufee4\ufedf\ufe8d: {model}^FS",
        f"^FO50,270^A@N,35,35,E:SWISS271.TTF^FD\ufee5\ufeee\ufee0\ufedf\ufe8d: {color} | \ufe94\ufef4\ufee4\ufedc\ufedf\ufe8d: {qty} | \ufeb1\ufe8e\ufed8\ufee4\ufedf\ufe8d: {size}^FS",
        f"^FO50,340^A@N,35,35,E:SWISS271.TTF^FD\ufedd\ufe8e\ufef3\ufeae\ufef4\ufeb3: {layers_s} | PO: {po}^FS",
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
        # Latin fields ASCII-only; Arabic uses printer font (^A@) + UTF-8 (^CI28).
        # No leading whitespace before ^ — indented triple-quoted f-strings break Zebra parsers.
        client = _zpl_clean_ascii(brand)
        model = _zpl_clean_ascii(model_name)
        color = _zpl_clean_ascii(color_name)
        qty = str(int(quantity) if quantity is not None else 0)
        size = _zpl_clean_ascii(size_value)
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

@router.get("/template", responses={500: _HTTP_RESP_500})
async def download_barcode_template():
    try:
        df_template = pd.DataFrame(columns=[
            "size",
            "color",
            "quantity",
            "layers"
        ])
        
        output = BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_template.to_excel(writer, index=False, sheet_name='Template')
            
            worksheet = writer.sheets['Template']
            
            descriptions = {
                'A': 'Size (required)',
                'B': 'Color (required)',
                'C': 'Quantity (required, number)',
                'D': 'Number of layers (required, number)'
            }
            
            for col, desc in descriptions.items():
                cell = worksheet[f'{col}1']
                cell.comment = openpyxl.comments.Comment(desc, 'System')
        
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=bulk_barcode_template.xlsx",
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate template: {str(e)}")

@router.post(
    "/bulk/process",
    response_model=schemas.BulkBarcodeResponse,
    responses=_HTTP_RESP_400_500,
)
async def process_bulk_barcodes_endpoint(
    file: Annotated[UploadFile, File(...)],
    job_order_id: Annotated[int, Form(...)],
    db: Annotated[Session, Depends(get_db)],
):
    """Process bulk barcode data from uploaded file"""
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file."
        )
    try:
        contents = await file.read()
        file_obj = BytesIO(contents)
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file_obj)
        else:
            df = pd.read_excel(file_obj)
        if df.empty:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty."
            )
        try:
            processed_data, error_rows = process_bulk_barcodes_helper(db, df, job_order_id)
            formatted_error_rows = [
                schemas.ErrorRow(
                    rowNumber=row["rowNumber"],
                    data=row["data"],
                    error=row["error"]
                )
                for row in error_rows
            ]
            return schemas.BulkBarcodeResponse(
                processed_data=processed_data,
                error_rows=formatted_error_rows
            )
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=str(e)
            )
        except Exception as e:
            logger.error(f"Error processing data: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error processing data: {str(e)}"
            )
    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=400,
            detail="The file is empty or contains no data."
        )
    except pd.errors.ParserError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error parsing file: {str(e)}"
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


def _validate_bulk_submit_job_order_items(
    db: Session,
    barcodes: List[Union[schemas.BatchCreate, schemas.SecondDegreeBatchCreate]],
) -> None:
    """Raises HTTPException if any size+color is not present on the job order."""
    for barcode in barcodes:
        job_order_item = (
            db.query(models.JobOrderItem)
            .filter(
                models.JobOrderItem.job_order_id == barcode.job_order_id,
                models.JobOrderItem.size_id == barcode.size_id,
                models.JobOrderItem.color_id == barcode.color_id,
            )
            .first()
        )
        if job_order_item:
            continue
        logger.error(
            "Invalid size+color combination: job_order_id=%s, size_id=%s, color_id=%s",
            barcode.job_order_id,
            barcode.size_id,
            barcode.color_id,
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Size and color combination not found in job order {barcode.job_order_id}. "
                f"Size ID: {barcode.size_id}, Color ID: {barcode.color_id}"
            ),
        )


def _duplicate_payload_if_exists(
    db: Session,
    barcode: Union[schemas.BatchCreate, schemas.SecondDegreeBatchCreate],
) -> Optional[Dict[str, Any]]:
    """If this barcode string already exists, return duplicate row payload; else None."""
    if not (getattr(barcode, "barcode", None)):
        return None
    existing_batch = get_batch_by_barcode(db, barcode.barcode)
    if not existing_batch:
        return None
    return {
        "barcode": barcode.barcode,
        "brand": existing_batch.client_name,
        "model": existing_batch.model_name,
        "size": existing_batch.size_value,
        "color": existing_batch.color_name,
        "quantity": barcode.quantity,
        "layers": barcode.layers,
        "serial": barcode.serial,
    }


def _batch_response_after_create(db: Session, db_batch: models.Batch) -> schemas.BatchResponse:
    batch_response = get_batch(db, db_batch.batch_id)
    if batch_response:
        return batch_response
    brand = get_client(db, db_batch.client_id)
    model = get_model(db, db_batch.model_id)
    size = get_size(db, db_batch.size_id)
    color = get_color(db, db_batch.color_id)
    phase = get_phase(db, db_batch.current_phase)
    return schemas.BatchResponse(
        batch_id=db_batch.batch_id,
        job_order_id=db_batch.job_order_id,
        job_order_number=None,
        barcode=db_batch.barcode,
        client_id=db_batch.client_id,
        model_id=db_batch.model_id,
        size_id=db_batch.size_id,
        color_id=db_batch.color_id,
        quantity=db_batch.quantity,
        layers=db_batch.layers,
        serial=str(db_batch.serial),
        current_phase=db_batch.current_phase,
        status=db_batch.status,
        client_name=brand.client_name if brand else "",
        model_name=model.model_name if model else "",
        size_value=size.size_value if size else "",
        color_name=color.color_name if color else "",
        phase_name=phase.phase_name if phase else "",
        last_updated=db_batch.last_updated,
        archived_at=None,
    )


@router.post(
    "/bulk/submit",
    response_model=schemas.BulkSubmitResponse,
    responses={400: _HTTP_RESP_400},
)
async def submit_bulk_barcodes(
    barcodes: List[Union[schemas.BatchCreate, schemas.SecondDegreeBatchCreate]],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[models.User, Depends(get_current_active_user)],
):
    """Submit processed barcodes to create batches"""
    created_batches: List[schemas.BatchResponse] = []
    duplicate_barcodes: List[Dict[str, Any]] = []

    _validate_bulk_submit_job_order_items(db, barcodes)

    for barcode in barcodes:
        dup = _duplicate_payload_if_exists(db, barcode)
        if dup is not None:
            duplicate_barcodes.append(dup)
            continue
        try:
            db_batch = create_batch(db, barcode, user_id=current_user.id)
            db.refresh(db_batch)
            created_batches.append(_batch_response_after_create(db, db_batch))
        except Exception as e:
            logger.error(f"Error creating batch: {str(e)}")
            continue

    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=(
            f"Successfully created {len(created_batches)} batches. "
            f"{len(duplicate_barcodes)} duplicates found."
        ),
    )

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
            detail=f"Failed to get printers: {str(e)}"
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

@router.post(
    "/bulk/validate",
    response_model=schemas.BulkValidationResponse,
    responses=_HTTP_RESP_400_500,
)
async def validate_bulk_barcodes(
    file: Annotated[UploadFile, File(...)],
    job_order_id: Annotated[int, Form(...)],
    db: Annotated[Session, Depends(get_db)],
):
    """Validate bulk barcode data from uploaded file without processing"""
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file."
        )
    try:
        contents = await file.read()
        file_obj = BytesIO(contents)
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file_obj)
        else:
            df = pd.read_excel(file_obj)
        if df.empty:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty."
            )
        try:
            valid_rows, error_rows = process_bulk_barcodes_helper(db, df, job_order_id)
            formatted_error_rows = [
                schemas.ErrorRow(
                    rowNumber=row["rowNumber"],
                    data=row["data"],
                    error=row["error"]
                )
                for row in error_rows
            ]
            return schemas.BulkValidationResponse(
                valid_rows=valid_rows,
                error_rows=formatted_error_rows
            )
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=str(e)
            )
        except Exception as e:
            logger.error(f"Error validating data: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error validating data: {str(e)}"
            )
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.post(
    "/bulk/validate-second-degree",
    response_model=schemas.BulkValidationResponse,
    responses=_HTTP_RESP_400_500,
)
async def validate_second_degree_batches(
    data: List[Dict[str, Any]],
    db: Annotated[Session, Depends(get_db)],
):
    """Validate second degree batch data and generate barcodes"""
    try:
        valid_rows = []
        error_rows = []
        
        for index, row_data in enumerate(data):
            try:
                # Validate required fields
                required_fields = ["job_order_id", "size_id", "color_id", "quantity", "layers"]
                missing_fields = [field for field in required_fields if field not in row_data]
                if missing_fields:
                    error_rows.append({
                        "rowNumber": index + 1,
                        "data": row_data,
                        "error": f"Missing required fields: {', '.join(missing_fields)}"
                    })
                    continue
                
                # Validate job order exists
                job_order = db.query(models.JobOrder).filter(
                    models.JobOrder.job_order_id == row_data["job_order_id"]
                ).first()
                if not job_order:
                    error_rows.append({
                        "rowNumber": index + 1,
                        "data": row_data,
                        "error": f"Job order {row_data['job_order_id']} not found"
                    })
                    continue
                
                # Validate size+color combination exists in job order
                job_order_item = db.query(models.JobOrderItem).filter(
                    models.JobOrderItem.job_order_id == row_data["job_order_id"],
                    models.JobOrderItem.size_id == row_data["size_id"],
                    models.JobOrderItem.color_id == row_data["color_id"]
                ).first()
                if not job_order_item:
                    error_rows.append({
                        "rowNumber": index + 1,
                        "data": row_data,
                        "error": f"Size+color combination not found in job order {row_data['job_order_id']}"
                    })
                    continue
                
                # Get next serial number for this size+color combination
                from app.crud.helpers import get_next_serial_number
                serial_number = get_next_serial_number(
                    db, 
                    row_data["job_order_id"], 
                    row_data["size_id"], 
                    row_data["color_id"]
                )
                
                # Generate barcode
                from app.crud.helpers import generate_barcode_string
                barcode = generate_barcode_string(
                    row_data["job_order_id"],
                    row_data["size_id"],
                    row_data["color_id"],
                    row_data["layers"],
                    serial_number
                )
                
                # Create valid row with generated barcode
                valid_row = {
                    "barcode": barcode,
                    "brand": job_order.brand.client_name if job_order.brand else "",
                    "model": job_order.model.model_name if job_order.model else "",
                    "size": job_order_item.size.size_value,
                    "color": job_order_item.color.color_name,
                    "quantity": row_data["quantity"],
                    "layers": row_data["layers"],
                    "serial": f"{serial_number:03d}",
                    "status": "success",
                    "client_id": job_order.client_id or 0,
                    "model_id": job_order.model_id or 0,
                    "size_id": row_data["size_id"],
                    "color_id": row_data["color_id"],
                    "is_second_degree": True
                }
                valid_rows.append(valid_row)
                
            except Exception as e:
                error_rows.append({
                    "rowNumber": index + 1,
                    "data": row_data,
                    "error": str(e)
                })
        
        formatted_error_rows = [
            schemas.ErrorRow(
                rowNumber=row["rowNumber"],
                data=row["data"],
                error=row["error"]
            )
            for row in error_rows
        ]
        
        return schemas.BulkValidationResponse(
            valid_rows=valid_rows,
            error_rows=formatted_error_rows
        )
        
    except Exception as e:
        logger.error(f"Error validating second degree batches: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error validating second degree batches: {str(e)}"
        )
    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=400,
            detail="The file is empty or contains no data."
        )
    except pd.errors.ParserError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error parsing file: {str(e)}"
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        ) 