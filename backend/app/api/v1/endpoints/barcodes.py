from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import pandas as pd
from io import BytesIO
from fastapi.responses import StreamingResponse
import tempfile
import os
import openpyxl
import traceback
import logging
from pydantic import BaseModel
from zebra import Zebra

from app.core.deps import get_db
from app import crud, schemas

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
    """Print a single barcode using Zebra printer"""
    try:
        z = Zebra(printer_name)
        
        text_info = f"Brand: {brand} | Model: {model_name}"
        text_info2 = f"Color: {color_name} | Qty: {quantity} | Size: {size_value}"
        
        zpl_code = f"""
            ^XA
            ^FO50,50^BY2,2.5,50
            ^BCN,80,Y,N,N
            ^FD{barcode_string}^FS
            ^FO50,210^A0N,35,35^FD{text_info}^FS
            ^FO50,300^A0N,35,35^FD{text_info2}^FS
            ^XZ
        """
        
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
    """Download the barcode template Excel file"""
    try:
        # Create empty DataFrame with required columns
        df_template = pd.DataFrame(columns=[
            "brand",
            "model",
            "size",
            "color",
            "quantity",
            "layers",
            "serial"
        ])
        
        # Create BytesIO object
        output = BytesIO()
        
        # Write DataFrame to Excel
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_template.to_excel(writer, index=False, sheet_name='Template')
            
            # Get the workbook and worksheet
            workbook = writer.book
            worksheet = writer.sheets['Template']
            
            # Add column descriptions
            descriptions = {
                'A': 'Brand name (required)',
                'B': 'Model name (required)',
                'C': 'Size (required)',
                'D': 'Color (required)',
                'E': 'Quantity (required, number)',
                'F': 'Number of layers (required, number)',
                'G': 'Serial number (required, number)'
            }
            
            # Add descriptions as comments
            for col, desc in descriptions.items():
                cell = worksheet[f'{col}1']
                cell.comment = openpyxl.comments.Comment(desc, 'System')
        
        # Reset buffer position
        output.seek(0)
        
        # Return the Excel file
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
async def process_bulk_barcodes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Process bulk barcode data from uploaded file"""
    # Validate file format
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file."
        )
    
    try:
        # Read file content
        contents = await file.read()
        
        # Create BytesIO object
        file_obj = BytesIO(contents)
        
        # Read file based on format
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file_obj)
        else:
            df = pd.read_excel(file_obj)
        
        # Check if file is empty
        if df.empty:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty."
            )
        
        # Process the data
        try:
            processed_data, error_rows = crud.process_bulk_barcodes(db, df)
            
            # Convert error rows to match schema
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
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.post("/bulk/submit", response_model=schemas.BulkSubmitResponse)
async def submit_bulk_barcodes(
    barcodes: List[schemas.BatchCreate],
    db: Session = Depends(get_db)
):
    """Submit processed barcodes to create batches"""
    created_batches = []
    duplicate_barcodes = []
    
    for barcode in barcodes:
        # Check if barcode already exists
        existing_batch = crud.get_batch_by_barcode(db, barcode.barcode)
        if existing_batch:
            duplicate_barcodes.append({
                "barcode": barcode.barcode,
                "brand": barcode.brand_id,
                "model": barcode.model_id,
                "size": barcode.size_id,
                "color": barcode.color_id,
                "quantity": barcode.quantity,
                "layers": barcode.layers,
                "serial": barcode.serial
            })
        else:
            # Create the batch
            db_batch = crud.create_batch(db, barcode)
            db.refresh(db_batch)  # Ensure all auto fields are loaded
            # Get related data for the response
            brand = crud.get_brand(db, db_batch.brand_id)
            model = crud.get_model(db, db_batch.model_id)
            size = crud.get_size(db, db_batch.size_id)
            color = crud.get_color(db, db_batch.color_id)
            phase = crud.get_phase(db, db_batch.current_phase)
            # Create response object with all required fields
            batch_response = schemas.BatchResponse(
                batch_id=db_batch.batch_id,
                barcode=db_batch.barcode,
                brand_id=db_batch.brand_id,
                model_id=db_batch.model_id,
                size_id=db_batch.size_id,
                color_id=db_batch.color_id,
                quantity=db_batch.quantity,
                layers=db_batch.layers,
                serial=db_batch.serial,
                current_phase=db_batch.current_phase,
                status=db_batch.status,
                brand_name=brand.brand_name if brand else "",
                model_name=model.model_name if model else "",
                size_value=size.size_value if size else "",
                color_name=color.color_name if color else "",
                phase_name=phase.phase_name if phase else "",
                last_updated_at=db_batch.last_updated_at,
                archived_at=None
            )
            created_batches.append(batch_response)
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
                    barcode_string=barcode['barcode'],
                    brand=barcode['brand'],
                    model_name=barcode['model'],
                    size_value=barcode['size'],
                    color_name=barcode['color'],
                    quantity=barcode['quantity'],
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