from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session
from typing import List
from . import crud, schemas
from .database import get_db
import os
import pandas as pd
from fastapi.responses import FileResponse, StreamingResponse
import openpyxl
from io import BytesIO

router = APIRouter()

# Brand routes
@router.get("/brands/", response_model=List[schemas.Brand])
def read_brands(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    brands = crud.get_brands(db, skip=skip, limit=limit)
    return brands

@router.post("/brands/", response_model=schemas.Brand)
def create_brand(brand: schemas.BrandCreate, db: Session = Depends(get_db)):
    db_brand = crud.get_brand_by_name(db, brand_name=brand.brand_name)
    if db_brand:
        raise HTTPException(status_code=400, detail="Brand already exists")
    return crud.create_brand(db=db, brand=brand)

# Model routes
@router.get("/models/", response_model=List[schemas.Model])
def read_models(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    models = crud.get_models(db, skip=skip, limit=limit)
    return models

@router.post("/models/", response_model=schemas.Model)
def create_model(model: schemas.ModelCreate, db: Session = Depends(get_db)):
    db_model = crud.get_model_by_name(db, model_name=model.model_name)
    if db_model:
        raise HTTPException(status_code=400, detail="Model already exists")
    return crud.create_model(db=db, model=model)

# Size routes
@router.get("/sizes/", response_model=List[schemas.Size])
def read_sizes(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    sizes = crud.get_sizes(db, skip=skip, limit=limit)
    return sizes

@router.post("/sizes/", response_model=schemas.Size)
def create_size(size: schemas.SizeCreate, db: Session = Depends(get_db)):
    db_size = crud.get_size_by_value(db, size_value=size.size_value)
    if db_size:
        raise HTTPException(status_code=400, detail="Size already exists")
    return crud.create_size(db=db, size=size)

# Color routes
@router.get("/colors/", response_model=List[schemas.Color])
def read_colors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    colors = crud.get_colors(db, skip=skip, limit=limit)
    return colors

@router.post("/colors/", response_model=schemas.Color)
def create_color(color: schemas.ColorCreate, db: Session = Depends(get_db)):
    db_color = crud.get_color_by_name(db, color_name=color.color_name)
    if db_color:
        raise HTTPException(status_code=400, detail="Color already exists")
    return crud.create_color(db=db, color=color)

# Production Phase routes
@router.get("/phases/", response_model=List[schemas.ProductionPhase])
def read_phases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    phases = crud.get_phases(db, skip=skip, limit=limit)
    return phases

@router.post("/phases/", response_model=schemas.ProductionPhase)
def create_phase(phase: schemas.ProductionPhaseCreate, db: Session = Depends(get_db)):
    return crud.create_phase(db=db, phase=phase)

# Batch routes
@router.get("/batches/", response_model=List[schemas.BatchResponse])
def read_batches(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    batches = crud.get_batches(db, skip=skip, limit=limit)
    return batches

@router.post("/batches/", response_model=schemas.Batch)
def create_batch(batch: schemas.BatchCreate, db: Session = Depends(get_db)):
    db_batch = crud.get_batch_by_barcode(db, barcode=batch.barcode)
    if db_batch:
        raise HTTPException(status_code=400, detail="Batch with this barcode already exists")
    return crud.create_batch(db=db, batch=batch)

@router.get("/batches/{batch_id}", response_model=schemas.BatchResponse)
def read_batch(batch_id: int, db: Session = Depends(get_db)):
    db_batch = crud.get_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.get("/batches/barcode/{barcode}", response_model=schemas.BatchResponse)
def read_batch_by_barcode(barcode: str, db: Session = Depends(get_db)):
    db_batch = crud.get_batch_by_barcode(db, barcode=barcode)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return db_batch

@router.put("/batches/{batch_id}/status")
def update_batch_status(batch_id: int, status: str, db: Session = Depends(get_db)):
    db_batch = crud.update_batch_status(db, batch_id=batch_id, status=status)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"message": "Status updated successfully"}

@router.put("/batches/{batch_id}/phase")
def update_batch_phase(batch_id: int, phase_id: int, db: Session = Depends(get_db)):
    db_batch = crud.update_batch_phase(db, batch_id=batch_id, phase_id=phase_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"message": "Phase updated successfully"}

@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    db_batch = crud.delete_batch(db, batch_id=batch_id)
    if db_batch is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return {"message": "Batch deleted successfully"}

# Bulk batch creation
@router.post("/batches/bulk", response_model=List[schemas.Batch])
async def create_bulk_batches(batches: List[schemas.BatchCreate], db: Session = Depends(get_db)):
    """Create multiple batches from pre-processed data"""
    created_batches = []
    for batch in batches:
        db_batch = crud.create_batch(db=db, batch=batch)
        created_batches.append(db_batch)
    return created_batches

# Bulk barcode template and processing
@router.get("/barcodes/template")
async def download_barcode_template():
    """Download the barcode template Excel file"""
    try:
        # Create a DataFrame with the template structure
        df = pd.DataFrame({
            'brand': ['Example Brand'],
            'model': ['Example Model'],
            'size': ['Example Size'],
            'color': ['Example Color'],
            'quantity': [1],
            'layers': [1],
            'serial': [1]
        })
        
        # Create a BytesIO object to store the Excel file
        output = BytesIO()
        
        # Write the DataFrame to Excel
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Sheet1')
            
            # Get the workbook and worksheet
            workbook = writer.book
            worksheet = writer.sheets['Sheet1']
            
            # Add column descriptions
            descriptions = {
                'A1': 'Brand name (required)',
                'B1': 'Model name (required, alphanumeric characters)',
                'C1': 'Size value (required)',
                'D1': 'Color name (required)',
                'E1': 'Quantity (required, 1-999)',
                'F1': 'Layers (required, 1-99)',
                'G1': 'Serial number (required, 1-999)'
            }
            
            # Add descriptions as comments
            for cell, description in descriptions.items():
                worksheet[cell].comment = openpyxl.comments.Comment(description, 'System')
            
            # Auto-adjust column widths
            for column in worksheet.columns:
                max_length = 0
                column_letter = openpyxl.utils.get_column_letter(column[0].column)
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = (max_length + 2)
                worksheet.column_dimensions[column_letter].width = adjusted_width
        
        # Set the pointer to the beginning of the BytesIO object
        output.seek(0)
        
        # Return the Excel file
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=bulk_barcode_template.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate template: {str(e)}")

@router.post("/barcodes/bulk/process", response_model=schemas.BulkBarcodeResponse)
async def process_bulk_barcodes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Process uploaded Excel file for bulk barcode creation"""
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel or CSV file.")
    
    try:
        # Read the uploaded file
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file.file)
        else:
            df = pd.read_excel(file.file)
        
        # Process the data
        processed_data, error_rows = crud.process_bulk_barcodes(db, df)
        
        return {
            "processed_data": processed_data,
            "error_rows": error_rows
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/barcodes/bulk/submit", response_model=List[schemas.BatchResponse])
async def submit_bulk_barcodes(
    barcodes: List[schemas.BatchCreate],
    db: Session = Depends(get_db)
):
    """Submit processed barcodes to create batches"""
    created_batches = []
    for barcode in barcodes:
        # Check if barcode already exists
        existing_batch = crud.get_batch_by_barcode(db, barcode.barcode)
        if existing_batch:
            raise HTTPException(
                status_code=400,
                detail=f"Barcode {barcode.barcode} already exists"
            )
        created_batch = crud.create_batch(db, barcode)
        created_batches.append(created_batch)
    return created_batches 