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
from datetime import datetime, timezone
import logging
from sqlalchemy import func as sa_func

logger = logging.getLogger(__name__)

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
        # Try archived batches if not found in active batches
        batch = db.query(
            models.ArchivedBatch,
            models.Brand.brand_name,
            models.Model.model_name,
            models.Size.size_value,
            models.Color.color_name,
            models.ProductionPhase.phase_name
        ).join(
            models.Brand,
            models.ArchivedBatch.brand_id == models.Brand.brand_id
        ).join(
            models.Model,
            models.ArchivedBatch.model_id == models.Model.model_id
        ).join(
            models.Size,
            models.ArchivedBatch.size_id == models.Size.size_id
        ).join(
            models.Color,
            models.ArchivedBatch.color_id == models.Color.color_id
        ).join(
            models.ProductionPhase,
            models.ArchivedBatch.current_phase == models.ProductionPhase.phase_id
        ).filter(models.ArchivedBatch.barcode == barcode).first()
        if not batch:
            return None
        batch_obj = batch.ArchivedBatch
        archived_at = batch_obj.archived_at
    else:
        batch_obj = batch.Batch
        archived_at = None
    return schemas.BatchResponse(
        batch_id=batch_obj.batch_id,
        barcode=batch_obj.barcode,
        brand_id=batch_obj.brand_id,
        model_id=batch_obj.model_id,
        size_id=batch_obj.size_id,
        color_id=batch_obj.color_id,
        quantity=batch_obj.quantity,
        layers=batch_obj.layers,
        serial=batch_obj.serial,
        current_phase=batch_obj.current_phase,
        status=batch_obj.status,
        brand_name=batch.brand_name,
        model_name=batch.model_name,
        size_value=batch.size_value,
        color_name=batch.color_name,
        phase_name=batch.phase_name,
        last_updated_at=batch_obj.last_updated_at,
        archived_at=archived_at
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

def create_timeline_entry(db: Session, batch_id: int, status: str, phase_id: int):
    entry = models.BarcodeStatusTimeline(
        batch_id=batch_id,
        status=status,
        phase_id=phase_id,
        start_time=datetime.utcnow(),
        end_time=None,
        duration_minutes=None
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

def close_current_timeline_entry(db: Session, batch_id: int):
    current = db.query(models.BarcodeStatusTimeline).filter(
        models.BarcodeStatusTimeline.batch_id == batch_id,
        models.BarcodeStatusTimeline.end_time.is_(None)
    ).first()
    if current:
        current.end_time = datetime.utcnow()
        current.duration_minutes = int((current.end_time - current.start_time).total_seconds() // 60)
        current.status = 'Completed'
        db.commit()
        db.refresh(current)
    return current

def get_timeline_by_batch(db: Session, batch_id: int):
    return db.query(models.BarcodeStatusTimeline).filter(
        models.BarcodeStatusTimeline.batch_id == batch_id
    ).order_by(models.BarcodeStatusTimeline.start_time).all()

def get_timeline_stats_by_batch(db: Session, batch_id: int):
    results = db.query(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes)
    ).filter(
        models.BarcodeStatusTimeline.batch_id == batch_id
    ).group_by(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status
    ).all()
    return results

def get_current_timeline_entries(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.BarcodeStatusTimeline).filter(
        models.BarcodeStatusTimeline.end_time.is_(None)
    ).offset(skip).limit(limit).all()

def get_all_timeline_stats(db: Session):
    results = db.query(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status,
        sa_func.avg(models.BarcodeStatusTimeline.duration_minutes)
    ).group_by(
        models.BarcodeStatusTimeline.phase_id,
        models.BarcodeStatusTimeline.status
    ).all()
    return results

def create_batch(db: Session, batch: schemas.BatchCreate):
    db_batch = models.Batch(**batch.dict())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    # Create initial timeline entry
    create_timeline_entry(db, db_batch.batch_id, db_batch.status, db_batch.current_phase)
    return db_batch

def update_batch(db: Session, db_batch: models.Batch, batch: schemas.BatchUpdate):
    update_data = batch.dict(exclude_unset=True)
    status_changed = 'status' in update_data and update_data['status'] != db_batch.status
    phase_changed = 'current_phase' in update_data and update_data['current_phase'] != db_batch.current_phase
    # Update the SQLAlchemy model instance
    for field, value in update_data.items():
        setattr(db_batch, field, value)
    db.commit()
    db.refresh(db_batch)
    # If status or phase changed, close previous timeline and create new one
    if status_changed or phase_changed:
        close_current_timeline_entry(db, db_batch.batch_id)
        create_timeline_entry(db, db_batch.batch_id, db_batch.status, db_batch.current_phase)
    # Fetch related names for response
    brand = db.query(models.Brand).filter(models.Brand.brand_id == db_batch.brand_id).first()
    model = db.query(models.Model).filter(models.Model.model_id == db_batch.model_id).first()
    size = db.query(models.Size).filter(models.Size.size_id == db_batch.size_id).first()
    color = db.query(models.Color).filter(models.Color.color_id == db_batch.color_id).first()
    phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == db_batch.current_phase).first()
    return schemas.BatchResponse(
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

def validate_row_data(row_data: Dict[str, Any], required_columns: List[str]) -> Tuple[bool, Optional[str]]:
    missing_fields = [field for field in required_columns if not row_data.get(field)]
    if missing_fields:
        return False, f"Missing required fields: {', '.join(missing_fields)}"
    return True, None

def validate_numeric_fields(row_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    try:
        quantity = int(float(row_data["quantity"]))
        layers = int(float(row_data["layers"]))
        serial = int(float(row_data["serial"]))
        
        if quantity <= 0 or layers <= 0 or serial <= 0:
            return False, "Quantity, layers, and serial must be positive numbers"
        return True, None
    except (ValueError, TypeError):
        return False, "Quantity, layers, and serial must be valid positive numbers"

def validate_serial_field(row_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    serial = row_data.get("serial")
    if serial is None or str(serial).strip() == "":
        return False, "Serial must not be empty"
    if len(str(serial)) > 3:
        return False, "Serial must be at most 3 characters long"
    return True, None

def process_row(db: Session, row_data: Dict[str, Any]) -> Dict[str, Any]:
    brand_name = str(row_data["brand"]).strip().lower()
    brand = get_brand_by_name(db, brand_name) or create_brand(db, schemas.BrandCreate(brand_name=brand_name))
    
    model_name = str(row_data["model"]).strip()
    model = get_model_by_name(db, model_name) or create_model(db, schemas.ModelCreate(model_name=model_name))
    
    size_value = str(row_data["size"]).strip().lower()
    size = get_size_by_value(db, size_value) or create_size(db, schemas.SizeCreate(size_value=size_value))
    
    color_name = str(row_data["color"]).strip().lower()
    color = get_color_by_name(db, color_name) or create_color(db, schemas.ColorCreate(color_name=color_name))
    
    quantity = int(float(row_data["quantity"]))
    layers = int(float(row_data["layers"]))
    serial = int(float(row_data["serial"]))
    
    barcode = generate_barcode_string(
        brand.brand_id,
        model.model_name,
        size.size_id,
        color.color_id,
        quantity,
        layers,
        serial
    )
    
    return {
        "barcode": barcode,
        "brand_id": brand.brand_id,
        "model_id": model.model_id,
        "size_id": size.size_id,
        "color_id": color.color_id,
        "brand": brand.brand_name,
        "model": model.model_name,
        "size": size.size_value,
        "color": color.color_name,
        "quantity": quantity,
        "layers": layers,
        "serial": serial
    }

def process_bulk_barcodes(db: Session, df: pd.DataFrame) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    processed_data = []
    error_rows = []
    required_columns = ["brand", "model", "size", "color", "quantity", "layers", "serial"]
    
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
    
    for index, row in df.iterrows():
        try:
            row_data = {k: v if pd.notna(v) else None for k, v in row.to_dict().items()}
            
            is_valid, error = validate_row_data(row_data, required_columns)
            if not is_valid:
                error_rows.append({"rowNumber": index + 2, "data": row_data, "error": error})
                continue
            
            is_valid, error = validate_numeric_fields(row_data)
            if not is_valid:
                error_rows.append({"rowNumber": index + 2, "data": row_data, "error": error})
                continue
            
            is_valid, error = validate_serial_field(row_data)
            if not is_valid:
                error_rows.append({"rowNumber": index + 2, "data": row_data, "error": error})
                continue
            
            # Standardize all numeric fields to int
            row_data["quantity"] = int(row_data["quantity"])
            row_data["layers"] = int(row_data["layers"])
            row_data["serial"] = int(row_data["serial"])
            # The following IDs are set in process_row, but ensure they are int if present
            if "brand_id" in row_data:
                row_data["brand_id"] = int(row_data["brand_id"])
            if "model_id" in row_data:
                row_data["model_id"] = int(row_data["model_id"])
            if "size_id" in row_data:
                row_data["size_id"] = int(row_data["size_id"])
            if "color_id" in row_data:
                row_data["color_id"] = int(row_data["color_id"])
            processed_data.append(process_row(db, row_data))
            
        except Exception as e:
            error_rows.append({
                "rowNumber": index + 2,
                "data": row_data,
                "error": str(e)
            })
    
    return processed_data, error_rows

def get_or_create_brand(db: Session, name: str) -> models.Brand:
    brand = db.query(models.Brand).filter(models.Brand.name == name).first()
    if not brand:
        brand = models.Brand(name=name)
        db.add(brand)
        db.commit()
        db.refresh(brand)
    return brand

def get_or_create_model(db: Session, name: str, brand_id: int) -> models.Model:
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
    size = db.query(models.Size).filter(models.Size.name == name).first()
    if not size:
        size = models.Size(name=name)
        db.add(size)
        db.commit()
        db.refresh(size)
    return size

def get_or_create_color(db: Session, name: str) -> models.Color:
    color = db.query(models.Color).filter(models.Color.name == name).first()
    if not color:
        color = models.Color(name=name)
        db.add(color)
        db.commit()
        db.refresh(color)
    return color

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