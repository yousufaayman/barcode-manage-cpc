from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Union
import pandas as pd
from io import BytesIO
from fastapi.responses import StreamingResponse
import openpyxl
import logging
from pydantic import BaseModel
from zebra import Zebra

from app.core.deps import get_db
from app.crud import *
from app import schemas
from app.crud.helpers import process_bulk_barcodes as process_bulk_barcodes_helper
from app.core.deps import get_current_active_user
from app import models


router = APIRouter()

logger = logging.getLogger(__name__)


def get_available_printers():
    """Get list of available Zebra printers"""
    try:
        z = Zebra()
        printers = z.getqueues()
        return printers if printers else ["No Zebra printers found"]
    except Exception as e:
        logger.error(f"Error getting printers: {str(e)}")
        return ["No Zebra printers found"]

def print_barcode_zebra(barcode_string: str, brand: str, model_name: str, size_value: str, 
                       color_name: str, quantity: int, printer_name: str):
    try:
        # Clean text to ASCII to avoid encoding issues
        def clean_ascii_text(text: str) -> str:
            if not text:
                return ""
            # Remove or replace problematic characters that can't be encoded with cp437
            cleaned = str(text).replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
            return cleaned.encode('ascii', 'ignore').decode('ascii').strip()
        
        text_info = clean_ascii_text(f"Brand: {brand} | Model: {model_name}")
        text_info2 = clean_ascii_text(f"Color: {color_name} | Qty: {quantity} | Size: {size_value}")
        clean_barcode = clean_ascii_text(barcode_string)
        
        zpl_code = f"""
            ^XA
            ^FO50,50^BY2,2.5,50
            ^BCN,80,Y,N,N
            ^FD{clean_barcode}^FS
            ^FO50,210^A0N,35,35^FD{text_info}^FS
            ^FO50,300^A0N,35,35^FD{text_info2}^FS
            ^FO675,225^GB50,50,5^FS
            ^FO685,200^A0N,20,20^FD2nd^FS
            ^XZ
        """
        
        z = Zebra(printer_name)
        z.output(zpl_code)
        return True
    except Exception as e:
        logger.error(f"Error printing barcode {barcode_string}: {str(e)}")
        raise

class PrintBarcodeRequest(BaseModel):
    barcodes: List[Dict[str, Any]]
    count: int
    printer_name: str

@router.get("/template")
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
            
            workbook = writer.book
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

@router.post("/bulk/process", response_model=schemas.BulkBarcodeResponse)
async def process_bulk_barcodes_endpoint(
    file: UploadFile = File(...),
    job_order_id: int = Form(...),
    db: Session = Depends(get_db)
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

@router.post("/bulk/submit", response_model=schemas.BulkSubmitResponse)
async def submit_bulk_barcodes(
    barcodes: List[Union[schemas.BatchCreate, schemas.SecondDegreeBatchCreate]],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Submit processed barcodes to create batches"""
    created_batches = []
    duplicate_barcodes = []
    
    # Validate that all size+color combinations are valid for their respective job orders
    for barcode in barcodes:
        # Check if the size+color combination exists in the job order items
        job_order_item = db.query(models.JobOrderItem).filter(
            models.JobOrderItem.job_order_id == barcode.job_order_id,
            models.JobOrderItem.size_id == barcode.size_id,
            models.JobOrderItem.color_id == barcode.color_id
        ).first()
        
        if not job_order_item:
            # Log the details for debugging
            logger.error(f"Invalid size+color combination: job_order_id={barcode.job_order_id}, size_id={barcode.size_id}, color_id={barcode.color_id}")
            raise HTTPException(
                status_code=400,
                detail=f"Size and color combination not found in job order {barcode.job_order_id}. Size ID: {barcode.size_id}, Color ID: {barcode.color_id}"
            )
    
    for barcode in barcodes:
        # All batches now have barcodes (generated by validation)
        if hasattr(barcode, 'barcode') and barcode.barcode:
            # Regular batch with barcode - check for duplicates
            existing_batch = get_batch_by_barcode(db, barcode.barcode)
            if existing_batch:
                duplicate_barcodes.append({
                    "barcode": barcode.barcode,
                    "brand": existing_batch.client_name,
                    "model": existing_batch.model_name,
                    "size": existing_batch.size_value,
                    "color": existing_batch.color_name,
                    "quantity": barcode.quantity,
                    "layers": barcode.layers,
                    "serial": barcode.serial
                })
                continue
        
        try:
            # Create the batch with user_id
            db_batch = create_batch(db, barcode, user_id=current_user.id)
            db.refresh(db_batch)  # Ensure all auto fields are loaded
            # Get the batch with all related data using CRUD function
            batch_response = get_batch(db, db_batch.batch_id)
            if batch_response:
                created_batches.append(batch_response)
            else:
                # Fallback to manual construction if CRUD function fails
                brand = get_client(db, db_batch.client_id)
                model = get_model(db, db_batch.model_id)
                size = get_size(db, db_batch.size_id)
                color = get_color(db, db_batch.color_id)
                phase = get_phase(db, db_batch.current_phase)
                batch_response = schemas.BatchResponse(
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
                        archived_at=None
                    )
                created_batches.append(batch_response)
        except Exception as e:
            logger.error(f"Error creating batch: {str(e)}")
            # Continue with other batches instead of failing completely
            continue
    return schemas.BulkSubmitResponse(
        created_batches=created_batches,
        duplicate_barcodes=duplicate_barcodes,
        message=f"Successfully created {len(created_batches)} batches. {len(duplicate_barcodes)} duplicates found."
    )

@router.get("/printers")
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

@router.post("/print")
async def print_barcodes(
    request: PrintBarcodeRequest,
    db: Session = Depends(get_db)
):
    """Print barcodes with specified count"""
    try:
        # Validate printer
        available_printers = get_available_printers()
        if request.printer_name not in available_printers:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid printer. Available printers: {', '.join(available_printers)}"
            )
        
        # Print each barcode the specified number of times
        for barcode in request.barcodes:
            for _ in range(request.count):
                print_barcode_zebra(
                    barcode_string=barcode.get('barcode', ''),
                    brand=barcode.get('client_name', ''),
                    model_name=barcode.get('model', ''),
                    size_value=barcode.get('size', ''),
                    color_name=barcode.get('color', ''),
                    quantity=barcode.get('quantity', 0),
                    printer_name=request.printer_name
                )
        
        return {
            "message": f"Successfully printed {len(request.barcodes)} barcodes {request.count} times each",
            "barcodes_printed": len(request.barcodes),
            "print_count": request.count,
            "printer_used": request.printer_name
        }
    except Exception as e:
        logger.error(f"Error printing barcodes: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to print barcodes: {str(e)}"
        )

@router.post("/bulk/validate", response_model=schemas.BulkValidationResponse)
async def validate_bulk_barcodes(
    file: UploadFile = File(...),
    job_order_id: int = Form(...),
    db: Session = Depends(get_db)
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

@router.post("/bulk/validate-second-degree", response_model=schemas.BulkValidationResponse)
async def validate_second_degree_batches(
    data: List[Dict[str, Any]],
    db: Session = Depends(get_db)
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