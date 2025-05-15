from sqlalchemy.orm import Session
from . import models, schemas
from typing import List, Dict, Optional, Any, Union, Tuple
import pandas as pd
import base36
import hashlib
from app.core.security import get_password_hash, verify_password
from app.models import User
from app.schemas import UserCreate, UserUpdate
import uuid

# Brand CRUD operations
def get_brand(db: Session, brand_id: int):
    return db.query(models.Brand).filter(models.Brand.brand_id == brand_id).first()

def get_brand_by_name(db: Session, brand_name: str):
    return db.query(models.Brand).filter(models.Brand.brand_name == brand_name).first()

def get_brands(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Brand).offset(skip).limit(limit).all()

def create_brand(db: Session, brand: schemas.BrandCreate):
    db_brand = models.Brand(brand_name=brand.brand_name)
    db.add(db_brand)
    db.commit()
    db.refresh(db_brand)
    return db_brand

# Model CRUD operations
def get_model(db: Session, model_id: int):
    return db.query(models.Model).filter(models.Model.model_id == model_id).first()

def get_model_by_name(db: Session, model_name: str):
    return db.query(models.Model).filter(models.Model.model_name == model_name).first()

def get_models(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Model).offset(skip).limit(limit).all()

def create_model(db: Session, model: schemas.ModelCreate):
    db_model = models.Model(model_name=model.model_name)
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model

# Size CRUD operations
def get_size(db: Session, size_id: int):
    return db.query(models.Size).filter(models.Size.size_id == size_id).first()

def get_size_by_value(db: Session, size_value: str):
    return db.query(models.Size).filter(models.Size.size_value == size_value).first()

def get_sizes(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Size).offset(skip).limit(limit).all()

def create_size(db: Session, size: schemas.SizeCreate):
    db_size = models.Size(size_value=size.size_value)
    db.add(db_size)
    db.commit()
    db.refresh(db_size)
    return db_size

# Color CRUD operations
def get_color(db: Session, color_id: int):
    return db.query(models.Color).filter(models.Color.color_id == color_id).first()

def get_color_by_name(db: Session, color_name: str):
    return db.query(models.Color).filter(models.Color.color_name == color_name).first()

def get_colors(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Color).offset(skip).limit(limit).all()

def create_color(db: Session, color: schemas.ColorCreate):
    db_color = models.Color(color_name=color.color_name)
    db.add(db_color)
    db.commit()
    db.refresh(db_color)
    return db_color

# Production Phase CRUD operations
def get_phase(db: Session, phase_id: int):
    return db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == phase_id).first()

def get_phases(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.ProductionPhase).offset(skip).limit(limit).all()

def create_phase(db: Session, phase: schemas.ProductionPhaseCreate):
    db_phase = models.ProductionPhase(phase_name=phase.phase_name)
    db.add(db_phase)
    db.commit()
    db.refresh(db_phase)
    return db_phase

# Batch CRUD operations
def get_batch(db: Session, batch_id: int):
    batch = db.query(
        models.Batch,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.Brand,
        models.Batch.brand_id == models.Brand.brand_id
    ).join(
        models.Model,
        models.Batch.model_id == models.Model.model_id
    ).join(
        models.Size,
        models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color,
        models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(models.Batch.batch_id == batch_id).first()
    
    if batch:
        return schemas.BatchResponse(
            batch_id=batch.Batch.batch_id,
            barcode=batch.Batch.barcode,
            brand_name=batch.brand_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            quantity=batch.Batch.quantity,
            layers=batch.Batch.layers,
            serial=batch.Batch.serial,
            phase_name=batch.phase_name,
            status=batch.Batch.status
        )
    return None

def get_batch_by_barcode(db: Session, barcode: str):
    batch = db.query(
        models.Batch,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.Brand,
        models.Batch.brand_id == models.Brand.brand_id
    ).join(
        models.Model,
        models.Batch.model_id == models.Model.model_id
    ).join(
        models.Size,
        models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color,
        models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(models.Batch.barcode == barcode).first()
    
    if not batch:
        return None
        
    return schemas.BatchResponse(
        batch_id=batch.Batch.batch_id,
        barcode=batch.Batch.barcode,
        brand_name=batch.brand_name,
        model_name=batch.model_name,
        size_value=batch.size_value,
        color_name=batch.color_name,
        quantity=batch.Batch.quantity,
        layers=batch.Batch.layers,
        serial=batch.Batch.serial,
        phase_name=batch.phase_name,
        status=batch.Batch.status
    )

def get_batches(db: Session, skip: int = 0, limit: int = 100):
    batches = db.query(
        models.Batch,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.Brand,
        models.Batch.brand_id == models.Brand.brand_id
    ).join(
        models.Model,
        models.Batch.model_id == models.Model.model_id
    ).join(
        models.Size,
        models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color,
        models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).offset(skip).limit(limit).all()
    
    return [
        schemas.BatchResponse(
            batch_id=batch.Batch.batch_id,
            barcode=batch.Batch.barcode,
            brand_name=batch.brand_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            quantity=batch.Batch.quantity,
            layers=batch.Batch.layers,
            serial=batch.Batch.serial,
            phase_name=batch.phase_name,
            status=batch.Batch.status
        )
        for batch in batches
    ]

def create_batch(db: Session, batch: schemas.BatchCreate):
    db_batch = models.Batch(**batch.dict())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch

def update_batch(db: Session, db_batch: models.Batch, batch: schemas.BatchUpdate):
    # Update only the fields that are provided
    update_data = batch.dict(exclude_unset=True)
    
    # Handle automatic phase advancement when status is set to completed
    if update_data.get('status') == 'Completed':
        current_phase = db_batch.current_phase
        # If in Cutting (1) or Sewing (2), advance to next phase with Pending status
        if current_phase == 1:  # Cutting
            update_data['current_phase'] = 2  # Move to Sewing
            update_data['status'] = 'Pending'  # Set status to Pending
        elif current_phase == 2:  # Sewing
            update_data['current_phase'] = 3  # Move to Packaging
            update_data['status'] = 'Pending'  # Set status to Pending
        # If in Packaging (3), stay in Packaging with Completed status
    
    # Update the SQLAlchemy model instance
    for field, value in update_data.items():
        setattr(db_batch, field, value)
    
    # Commit the changes
    db.commit()
    
    # Get the updated batch with all related data
    updated_batch = db.query(
        models.Batch,
        models.Brand.brand_name,
        models.Model.model_name,
        models.Size.size_value,
        models.Color.color_name,
        models.ProductionPhase.phase_name
    ).join(
        models.Brand,
        models.Batch.brand_id == models.Brand.brand_id
    ).join(
        models.Model,
        models.Batch.model_id == models.Model.model_id
    ).join(
        models.Size,
        models.Batch.size_id == models.Size.size_id
    ).join(
        models.Color,
        models.Batch.color_id == models.Color.color_id
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).filter(models.Batch.batch_id == db_batch.batch_id).first()
    
    # Return the batch response
    return schemas.BatchResponse(
        batch_id=updated_batch.Batch.batch_id,
        barcode=updated_batch.Batch.barcode,
        brand_name=updated_batch.brand_name,
        model_name=updated_batch.model_name,
        size_value=updated_batch.size_value,
        color_name=updated_batch.color_name,
        quantity=updated_batch.Batch.quantity,
        layers=updated_batch.Batch.layers,
        serial=updated_batch.Batch.serial,
        phase_name=updated_batch.phase_name,
        status=updated_batch.Batch.status
    )

def update_batch_status(db: Session, batch_id: int, status: str):
    db_batch = get_batch(db, batch_id)
    if db_batch:
        db_batch.status = status
        db.commit()
        db.refresh(db_batch)
    return db_batch

def update_batch_phase(db: Session, batch_id: int, phase_id: int):
    db_batch = get_batch(db, batch_id)
    if db_batch:
        db_batch.current_phase = phase_id
        db.commit()
        db.refresh(db_batch)
    return db_batch

def delete_batch(db: Session, batch_id: int):
    # Get the batch data before deleting
    batch_data = get_batch(db, batch_id)
    if batch_data:
        # Delete the batch from the database
        db.query(models.Batch).filter(models.Batch.batch_id == batch_id).delete()
        db.commit()
    return batch_data

# Barcode generation helper functions
def encode_model_name(model_name: str, length: int = 2) -> str:
    hash_digest = hashlib.md5(str(model_name).encode()).hexdigest()
    hash_int = int(hash_digest, 16)
    encoded = base36.dumps(hash_int)
    return encoded[:length].upper()

def generate_barcode_string(brand_id: int, model_name: str, size_id: int, color_id: int, 
                          quantity: int, layers: int, serial: int) -> str:
    brand_code = base36.dumps(brand_id)
    model_code = encode_model_name(model_name)
    size_code = base36.dumps(size_id)
    color_code = base36.dumps(color_id)
    quantity_code = base36.dumps(quantity)
    layers_code = base36.dumps(layers)
    serial_code = base36.dumps(serial)

    return f"{brand_code}-{model_code}-{size_code}-{color_code}-{quantity_code}-{layers_code}-{serial_code}"

def process_bulk_barcodes(db: Session, df: pd.DataFrame) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Process bulk barcode data from DataFrame
    Returns tuple of (processed_data, error_rows)
    """
    processed_data = []
    error_rows = []
    
    # Required columns
    required_columns = ["brand", "model", "size", "color", "quantity", "layers", "serial"]
    
    # Validate required columns
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
    
    # Process each row
    for index, row in df.iterrows():
        try:
            # Convert row to dict and handle NaN values
            row_data = row.to_dict()
            row_data = {k: v if pd.notna(v) else None for k, v in row_data.items()}
            
            # Validate required fields
            missing_fields = []
            for field in required_columns:
                if not row_data.get(field):
                    missing_fields.append(field)
            
            if missing_fields:
                error_rows.append({
                    "rowNumber": index + 2,  # +2 because Excel is 1-based and has header
                    "data": row_data,
                    "error": f"Missing required fields: {', '.join(missing_fields)}"
                })
                continue
            
            # Validate numeric fields
            try:
                quantity = int(float(row_data["quantity"]))
                layers = int(float(row_data["layers"]))
                serial = int(float(row_data["serial"]))
                
                if quantity <= 0 or layers <= 0 or serial <= 0:
                    raise ValueError("Quantity, layers, and serial must be positive numbers")
            except (ValueError, TypeError):
                error_rows.append({
                    "rowNumber": index + 2,
                    "data": row_data,
                    "error": "Quantity, layers, and serial must be valid positive numbers"
                })
                continue
            
            # Get or create brand
            brand_name = str(row_data["brand"]).strip().lower()
            brand = get_brand_by_name(db, brand_name)
            if not brand:
                brand = create_brand(db, schemas.BrandCreate(brand_name=brand_name))
            
            # Get or create model
            model_name = str(row_data["model"]).strip()
            model = get_model_by_name(db, model_name)
            if not model:
                model = create_model(db, schemas.ModelCreate(model_name=model_name))
            
            # Get or create size
            size_value = str(row_data["size"]).strip().lower()
            size = get_size_by_value(db, size_value)
            if not size:
                size = create_size(db, schemas.SizeCreate(size_value=size_value))
            
            # Get or create color
            color_name = str(row_data["color"]).strip().lower()
            color = get_color_by_name(db, color_name)
            if not color:
                color = create_color(db, schemas.ColorCreate(color_name=color_name))
            
            # Generate barcode
            barcode = generate_barcode_string(
                brand.brand_id,
                model.model_name,
                size.size_id,
                color.color_id,
                quantity,
                layers,
                serial
            )
            
            # Add to processed data with both IDs and names
            processed_data.append({
                "barcode": barcode,
                "brand_id": brand.brand_id,  # Send ID
                "model_id": model.model_id,  # Send ID
                "size_id": size.size_id,    # Send ID
                "color_id": color.color_id,  # Send ID
                "brand": brand.brand_name,  # Send name for display
                "model": model.model_name,  # Send name for display
                "size": size.size_value,    # Send value for display
                "color": color.color_name,  # Send name for display
                "quantity": quantity,
                "layers": layers,
                "serial": serial
            })
            
        except Exception as e:
            error_rows.append({
                "rowNumber": index + 2,
                "data": row_data,
                "error": str(e)
            })
    
    return processed_data, error_rows

def get_or_create_brand(db: Session, name: str) -> models.Brand:
    """Get or create brand"""
    brand = db.query(models.Brand).filter(models.Brand.name == name).first()
    if not brand:
        brand = models.Brand(name=name)
        db.add(brand)
        db.commit()
        db.refresh(brand)
    return brand

def get_or_create_model(db: Session, name: str, brand_id: int) -> models.Model:
    """Get or create model"""
    model = db.query(models.Model).filter(
        models.Model.name == name,
        models.Model.brand_id == brand_id
    ).first()
    if not model:
        model = models.Model(name=name, brand_id=brand_id)
        db.add(model)
        db.commit()
        db.refresh(model)
    return model

def get_or_create_size(db: Session, name: str) -> models.Size:
    """Get or create size"""
    size = db.query(models.Size).filter(models.Size.name == name).first()
    if not size:
        size = models.Size(name=name)
        db.add(size)
        db.commit()
        db.refresh(size)
    return size

def get_or_create_color(db: Session, name: str) -> models.Color:
    """Get or create color"""
    color = db.query(models.Color).filter(models.Color.name == name).first()
    if not color:
        color = models.Color(name=name)
        db.add(color)
        db.commit()
        db.refresh(color)
    return color

# User CRUD operations
def get_user(db: Session, id: int) -> Optional[User]:
    return db.query(User).filter(User.user_id == id).first()

def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()

def get_users(db: Session, *, skip: int = 0, limit: int = 100) -> List[User]:
    return db.query(User).offset(skip).limit(limit).all()

def create_user(db: Session, *, obj_in: UserCreate) -> User:
    db_obj = User(
        username=obj_in.username,
        password=get_password_hash(obj_in.password),
        role=obj_in.role
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def update_user(
    db: Session, *, db_obj: User, obj_in: Union[UserUpdate, Dict[str, Any]]
) -> User:
    if isinstance(obj_in, dict):
        update_data = obj_in
    else:
        update_data = obj_in.dict(exclude_unset=True)
    
    if update_data.get("password"):
        hashed_password = get_password_hash(update_data["password"])
        del update_data["password"]
        update_data["password"] = hashed_password
    
    for field in update_data:
        setattr(db_obj, field, update_data[field])
    
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_user(db: Session, *, id: int) -> User:
    obj = db.query(User).get(id)
    db.delete(obj)
    db.commit()
    return obj 