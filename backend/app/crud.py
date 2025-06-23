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
from datetime import datetime, timezone, timedelta
import logging
from sqlalchemy import func as sa_func
from sqlalchemy.orm import aliased
from sqlalchemy import case

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
            brand_id=batch.Batch.brand_id,
            model_id=batch.Batch.model_id,
            size_id=batch.Batch.size_id,
            color_id=batch.Batch.color_id,
            quantity=batch.Batch.quantity,
            layers=batch.Batch.layers,
            serial=str(batch.Batch.serial),
            current_phase=batch.Batch.current_phase,
            status=batch.Batch.status,
            brand_name=batch.brand_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            phase_name=batch.phase_name,
            last_updated_at=batch.Batch.last_updated_at
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
        serial=str(batch_obj.serial),
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
            brand_id=batch.Batch.brand_id,
            model_id=batch.Batch.model_id,
            size_id=batch.Batch.size_id,
            color_id=batch.Batch.color_id,
            quantity=batch.Batch.quantity,
            layers=batch.Batch.layers,
            serial=str(batch.Batch.serial),
            current_phase=batch.Batch.current_phase,
            status=batch.Batch.status,
            brand_name=batch.brand_name,
            model_name=batch.model_name,
            size_value=batch.size_value,
            color_name=batch.color_name,
            phase_name=batch.phase_name,
            last_updated_at=batch.Batch.last_updated_at
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
        serial=str(db_batch.serial),
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
        # First delete all related timeline entries
        db.query(models.BarcodeStatusTimeline).filter(
            models.BarcodeStatusTimeline.batch_id == batch_id
        ).delete()
        
        # Then delete the batch from the database
        db.query(models.Batch).filter(models.Batch.batch_id == batch_id).delete()
        db.commit()
    return batch_data

def archive_batch(db: Session, batch_id: int):
    """Archive a batch by moving it to the archived_batches table"""
    # Get the batch data before archiving
    batch_data = get_batch(db, batch_id)
    if not batch_data:
        return None
    
    # Create archived batch record
    archived_batch = models.ArchivedBatch(
        batch_id=batch_data.batch_id,
        barcode=batch_data.barcode,
        brand_id=batch_data.brand_id,
        model_id=batch_data.model_id,
        size_id=batch_data.size_id,
        color_id=batch_data.color_id,
        quantity=batch_data.quantity,
        layers=batch_data.layers,
        serial=batch_data.serial,
        current_phase=batch_data.current_phase,
        status=batch_data.status,
        last_updated_at=batch_data.last_updated_at,
        archived_at=sa_func.now()
    )
    
    # Add to archived table
    db.add(archived_batch)
    
    # Delete from active batches table
    db.query(models.Batch).filter(models.Batch.batch_id == batch_id).delete()
    
    # Commit the transaction
    db.commit()
    
    return batch_data

def archive_batches_bulk(db: Session, batch_ids: List[int]):
    """Archive multiple batches by moving them to the archived_batches table"""
    archived_batches = []
    
    for batch_id in batch_ids:
        batch_data = get_batch(db, batch_id)
        if batch_data:
            # Create archived batch record
            archived_batch = models.ArchivedBatch(
                batch_id=batch_data.batch_id,
                barcode=batch_data.barcode,
                brand_id=batch_data.brand_id,
                model_id=batch_data.model_id,
                size_id=batch_data.size_id,
                color_id=batch_data.color_id,
                quantity=batch_data.quantity,
                layers=batch_data.layers,
                serial=batch_data.serial,
                current_phase=batch_data.current_phase,
                status=batch_data.status,
                last_updated_at=batch_data.last_updated_at,
                archived_at=sa_func.now()
            )
            
            # Add to archived table
            db.add(archived_batch)
            archived_batches.append(batch_data)
    
    # Delete all batches from active table
    db.query(models.Batch).filter(models.Batch.batch_id.in_(batch_ids)).delete(synchronize_session=False)
    
    # Commit the transaction
    db.commit()
    
    return archived_batches

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
    try:
        serial_num = int(float(serial))
        if not (0 <= serial_num <= 999):
            return False, "Serial must be a number between 0 and 999."
    except (ValueError, TypeError):
        return False, "Serial must be a valid number."
    return True, None

def process_row(db: Session, row_data: Dict[str, Any]) -> Dict[str, Any]:
    brand_name = str(row_data["brand"]).strip()
    brand = get_brand_by_name(db, brand_name) or create_brand(db, schemas.BrandCreate(brand_name=brand_name))
    
    model_name = str(row_data["model"]).strip()
    model = get_model_by_name(db, model_name) or create_model(db, schemas.ModelCreate(model_name=model_name))
    
    size_value = str(row_data["size"]).strip()
    size = get_size_by_value(db, size_value) or create_size(db, schemas.SizeCreate(size_value=size_value))
    
    color_name = str(row_data["color"]).strip()
    color = get_color_by_name(db, color_name) or create_color(db, schemas.ColorCreate(color_name=color_name))
    
    quantity = int(float(row_data["quantity"]))
    layers = int(float(row_data["layers"]))
    serial_int = int(float(row_data["serial"]))
    
    serial_str = f"{serial_int:03d}"
    
    if len(serial_str) > 3:
        raise ValueError("Serial number cannot exceed 3 digits after formatting.")

    barcode = generate_barcode_string(
        brand.brand_id,
        model.model_name,
        size.size_id,
        color.color_id,
        quantity,
        layers,
        serial_int
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
        "serial": serial_str
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
            
            # Convert string values to lowercase during preprocessing
            for key, value in row_data.items():
                if isinstance(value, str):
                    row_data[key] = value.strip().lower()
            
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

            processed_data.append(process_row(db, row_data))
            
        except Exception as e:
            error_rows.append({
                "rowNumber": index + 2,
                "data": row_data,
                "error": str(e)
            })
    
    return processed_data, error_rows

def get_or_create_brand(db: Session, name: str) -> models.Brand:
    brand = db.query(models.Brand).filter(models.Brand.brand_name == name).first()
    if not brand:
        brand = models.Brand(brand_name=name)
        db.add(brand)
        db.commit()
        db.refresh(brand)
    return brand

def get_or_create_model(db: Session, name: str, brand_id: int) -> models.Model:
    model = db.query(models.Model).filter(
        models.Model.model_name == name,
        models.Model.brand_id == brand_id
    ).first()
    if not model:
        model = models.Model(model_name=name, brand_id=brand_id)
        db.add(model)
        db.commit()
        db.refresh(model)
    return model

def get_or_create_size(db: Session, name: str) -> models.Size:
    size = db.query(models.Size).filter(models.Size.size_value == name).first()
    if not size:
        size = models.Size(size_value=name)
        db.add(size)
        db.commit()
        db.refresh(size)
    return size

def get_or_create_color(db: Session, name: str) -> models.Color:
    color = db.query(models.Color).filter(models.Color.color_name == name).first()
    if not color:
        color = models.Color(color_name=name)
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
    obj = db.query(User).filter(User.user_id == id).first()
    if obj:
        db.delete(obj)
        db.commit()
    return obj

def get_advanced_statistics(db: Session):
    # Base query for timeline data with duration
    timeline_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        models.BarcodeStatusTimeline.status,
        models.BarcodeStatusTimeline.duration_minutes
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    )

    # 1. Turnover Rate by Phase - FIXED: Calculate average per batch per phase
    # First, get total duration per batch per phase
    batch_phase_totals_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).label("total_duration_per_batch")
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    ).group_by(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).subquery()

    # Then, calculate average across all batches for each phase
    turnover_rate_by_phase_query = db.query(
        batch_phase_totals_query.c.phase_id,
        batch_phase_totals_query.c.phase_name,
        sa_func.avg(batch_phase_totals_query.c.total_duration_per_batch).label("average_minutes")
    ).group_by(
        batch_phase_totals_query.c.phase_id,
        batch_phase_totals_query.c.phase_name
    )
    
    turnover_rate_results = turnover_rate_by_phase_query.all()
    turnover_rate_by_phase = [schemas.TurnoverRateByPhase.model_validate(r._asdict()) for r in turnover_rate_results]

    # 2 & 3. Slowest and Fastest Turnover (by phase average)
    if turnover_rate_by_phase:
        slowest_turnover = max(turnover_rate_by_phase, key=lambda x: x.average_minutes)
        fastest_turnover = min(turnover_rate_by_phase, key=lambda x: x.average_minutes)
        bottleneck_phase = slowest_turnover
    else:
        slowest_turnover = None
        fastest_turnover = None
        bottleneck_phase = None

    # 4. Bottleneck Phase
    bottleneck_phase = max(turnover_rate_by_phase, key=lambda x: x.average_minutes, default=None)

    # 5, 6, 7. Time Spent Pending/In Progress - FIXED: Calculate per batch per phase
    # Get total pending time per batch per phase
    pending_times_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).label("total_minutes")
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.status == 'Pending',
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    ).group_by(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).order_by(sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).desc())
    
    pending_times = pending_times_query.all()
    most_time_spent_pending = schemas.TimeSpentStatusStat.model_validate(pending_times[0]._asdict()) if pending_times else None
    fastest_pending_entry = pending_times_query.order_by(sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).asc()).first()
    fastest_pending = schemas.TimeSpentStatusStat.model_validate(fastest_pending_entry._asdict()) if fastest_pending_entry else None

    # Get total in-progress time per batch per phase
    in_progress_times_query = db.query(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).label("total_minutes")
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).filter(
        models.BarcodeStatusTimeline.status == 'In Progress',
        models.BarcodeStatusTimeline.duration_minutes.isnot(None)
    ).group_by(
        models.BarcodeStatusTimeline.batch_id,
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).order_by(sa_func.sum(models.BarcodeStatusTimeline.duration_minutes).asc())
    
    in_progress_times = in_progress_times_query.all()
    fastest_in_progress = schemas.TimeSpentStatusStat.model_validate(in_progress_times[0]._asdict()) if in_progress_times else None
    
    # 8. Batch Throughput (Last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    throughput_query = db.query(
        sa_func.date(models.Batch.last_updated_at).label("period"),
        sa_func.count(models.Batch.batch_id).label("completed_batches")
    ).filter(
        models.Batch.status == 'Completed',
        models.Batch.last_updated_at >= thirty_days_ago
    ).group_by(sa_func.date(models.Batch.last_updated_at)).all()
    
    batch_throughput = [schemas.ThroughputStat.model_validate(r._asdict()) for r in throughput_query]

    # 9. Average Batch Size
    avg_quantity = db.query(sa_func.avg(models.Batch.quantity)).scalar() or 0
    average_batch_size = round(avg_quantity, 2)

    # 10. Status Distribution
    status_dist_query = db.query(
        models.Batch.status,
        sa_func.count(models.Batch.batch_id).label("count")
    ).group_by(models.Batch.status).all()
    status_distribution = [schemas.StatusDistributionStat.model_validate(r._asdict()) for r in status_dist_query]

    # 11. Current WIP (Work in Progress)
    wip_query = db.query(
        models.Batch.current_phase.label('phase_id'),
        models.ProductionPhase.phase_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed')
    ).join(
        models.ProductionPhase,
        models.Batch.current_phase == models.ProductionPhase.phase_id
    ).group_by(
        models.Batch.current_phase,
        models.ProductionPhase.phase_name
    ).all()
    current_wip = [schemas.WIPStat.model_validate(r._asdict()) for r in wip_query]

    # 12 & 13. Longest/Shortest Time in Single Phase (reusing existing stats)
    longest_time_in_single_phase = slowest_turnover
    shortest_time_in_single_phase = fastest_turnover

    # 14. Phase Entry/Exit Counts
    phase_counts_query = db.query(
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name,
        sa_func.count(models.BarcodeStatusTimeline.id).label('entries'),
        sa_func.sum(case((models.BarcodeStatusTimeline.status == 'Completed', 1), else_=0)).label('exits')
    ).join(
        models.ProductionPhase,
        models.BarcodeStatusTimeline.phase_id == models.ProductionPhase.phase_id
    ).group_by(
        models.BarcodeStatusTimeline.phase_id,
        models.ProductionPhase.phase_name
    ).all()
    phase_entry_exit_counts = [schemas.PhaseEntryExitStat.model_validate(r._asdict()) for r in phase_counts_query]

    # 15. Average Phases Per Batch
    subquery = db.query(
        models.BarcodeStatusTimeline.batch_id,
        sa_func.count(models.BarcodeStatusTimeline.phase_id.distinct()).label('phase_count')
    ).group_by(models.BarcodeStatusTimeline.batch_id).subquery()
    
    avg_phases_query = db.query(sa_func.avg(subquery.c.phase_count)).scalar()
    average_phases_per_batch = round(avg_phases_query, 2) if avg_phases_query else 0

    # 16. WIP by Brand
    wip_by_brand_query = db.query(
        models.Batch.brand_id,
        models.Brand.brand_name,
        sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
        sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
        sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
        sa_func.count(models.Batch.batch_id).label('total')
    ).join(
        models.Brand,
        models.Batch.brand_id == models.Brand.brand_id
    ).group_by(
        models.Batch.brand_id,
        models.Brand.brand_name
    ).all()
    wip_by_brand = [schemas.WIPByBrandStat.model_validate(r._asdict()) for r in wip_by_brand_query]

    # 17. Working Phase by Brand - Show all phases for each brand
    # First get all brands and phases
    all_brands = db.query(models.Brand.brand_id, models.Brand.brand_name).all()
    all_phases = db.query(models.ProductionPhase.phase_id, models.ProductionPhase.phase_name).all()
    
    working_phase_by_brand = []
    
    for brand in all_brands:
        for phase in all_phases:
            # Get counts for this brand-phase combination
            phase_stats = db.query(
                sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
                sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
                sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
                sa_func.count(models.Batch.batch_id).label('total')
            ).filter(
                models.Batch.brand_id == brand.brand_id,
                models.Batch.current_phase == phase.phase_id
            ).first()
            
            working_phase_by_brand.append(schemas.WorkingPhaseByBrandStat(
                brand_id=brand.brand_id,
                brand_name=brand.brand_name,
                phase_id=phase.phase_id,
                phase_name=phase.phase_name,
                pending=phase_stats.pending or 0,
                in_progress=phase_stats.in_progress or 0,
                completed=phase_stats.completed or 0,
                total=phase_stats.total or 0
            ))

    # 18. Working Phase by Model - Show all phases for each model
    # First get all models and phases
    all_models = db.query(models.Model.model_id, models.Model.model_name).all()
    all_phases = db.query(models.ProductionPhase.phase_id, models.ProductionPhase.phase_name).all()
    
    working_phase_by_model = []
    
    for model in all_models:
        for phase in all_phases:
            # Get counts for this model-phase combination
            phase_stats = db.query(
                sa_func.sum(case((models.Batch.status == 'Pending', 1), else_=0)).label('pending'),
                sa_func.sum(case((models.Batch.status == 'In Progress', 1), else_=0)).label('in_progress'),
                sa_func.sum(case((models.Batch.status == 'Completed', 1), else_=0)).label('completed'),
                sa_func.count(models.Batch.batch_id).label('total')
            ).join(
                models.Model,
                models.Batch.model_id == models.Model.model_id
            ).filter(
                models.Batch.model_id == model.model_id,
                models.Batch.current_phase == phase.phase_id
            ).first()
            
            # Get brand information for this model
            brand_info = db.query(
                models.Brand.brand_id,
                models.Brand.brand_name
            ).join(
                models.Batch,
                models.Batch.brand_id == models.Brand.brand_id
            ).filter(
                models.Batch.model_id == model.model_id
            ).first()
            
            working_phase_by_model.append(schemas.WorkingPhaseByModelStat(
                model_id=model.model_id,
                model_name=model.model_name,
                brand_id=brand_info.brand_id if brand_info else 0,
                brand_name=brand_info.brand_name if brand_info else 'Unknown Brand',
                phase_id=phase.phase_id,
                phase_name=phase.phase_name,
                pending=phase_stats.pending or 0,
                in_progress=phase_stats.in_progress or 0,
                completed=phase_stats.completed or 0,
                total=phase_stats.total or 0
            ))

    # ... rest of the stats to be implemented

    return {
        "turnover_rate_by_phase": turnover_rate_by_phase,
        "slowest_turnover": slowest_turnover,
        "fastest_turnover": fastest_turnover,
        "bottleneck_phase": bottleneck_phase,
        "most_time_spent_pending": most_time_spent_pending,
        "fastest_pending": fastest_pending,
        "fastest_in_progress": fastest_in_progress,
        "batch_throughput": batch_throughput,
        "average_batch_size": average_batch_size,
        "phase_entry_exit_counts": phase_entry_exit_counts,
        "average_phases_per_batch": average_phases_per_batch,
        "longest_time_in_single_phase": longest_time_in_single_phase,
        "shortest_time_in_single_phase": shortest_time_in_single_phase,
        "current_wip": current_wip,
        "wip_by_brand": wip_by_brand,
        "working_phase_by_brand": working_phase_by_brand,
        "working_phase_by_model": working_phase_by_model,
        "avg_time_to_completion_by_attribute": [],
        "stuck_batches": [],
        "phase_reentries": [],
        "pending_in_progress_ratio": [],
        "batch_ages": [],
        "status_distribution": status_distribution,
        "most_common_batch_attributes": []
    }

def delete_archived_batch(db: Session, batch_id: int):
    """Delete an archived batch from the archived_batches table"""
    # Get the archived batch data before deleting
    archived_batch = db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).first()
    
    if archived_batch:
        # Delete the archived batch from the database
        db.query(models.ArchivedBatch).filter(
            models.ArchivedBatch.batch_id == batch_id
        ).delete()
        db.commit()
        
        # Return the deleted batch data for response
        return schemas.BatchResponse(
            batch_id=archived_batch.batch_id,
            barcode=archived_batch.barcode,
            brand_id=archived_batch.brand_id,
            model_id=archived_batch.model_id,
            size_id=archived_batch.size_id,
            color_id=archived_batch.color_id,
            quantity=archived_batch.quantity,
            layers=archived_batch.layers,
            serial=str(archived_batch.serial),
            current_phase=archived_batch.current_phase,
            status=archived_batch.status,
            brand_name="",  # These would need to be fetched if needed
            model_name="",
            size_value="",
            color_name="",
            phase_name="",
            last_updated_at=archived_batch.last_updated_at,
            archived_at=archived_batch.archived_at
        )
    return None

def recover_archived_batch(db: Session, batch_id: int):
    """Recover an archived batch by moving it back to the active batches table"""
    # Get the archived batch data
    archived_batch = db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).first()
    
    if not archived_batch:
        return None
    
    # Check if a batch with the same barcode already exists in active batches
    existing_batch = db.query(models.Batch).filter(
        models.Batch.barcode == archived_batch.barcode
    ).first()
    
    if existing_batch:
        raise ValueError(f"A batch with barcode {archived_batch.barcode} already exists in active batches")
    
    # Create new active batch record
    active_batch = models.Batch(
        batch_id=archived_batch.batch_id,
        barcode=archived_batch.barcode,
        brand_id=archived_batch.brand_id,
        model_id=archived_batch.model_id,
        size_id=archived_batch.size_id,
        color_id=archived_batch.color_id,
        quantity=archived_batch.quantity,
        layers=archived_batch.layers,
        serial=archived_batch.serial,
        current_phase=archived_batch.current_phase,
        status=archived_batch.status,
        last_updated_at=sa_func.now()
    )
    
    # Add to active table
    db.add(active_batch)
    
    # Delete from archived table
    db.query(models.ArchivedBatch).filter(
        models.ArchivedBatch.batch_id == batch_id
    ).delete()
    
    # Commit the transaction
    db.commit()
    
    # Fetch related names for response
    brand = db.query(models.Brand).filter(models.Brand.brand_id == active_batch.brand_id).first()
    model = db.query(models.Model).filter(models.Model.model_id == active_batch.model_id).first()
    size = db.query(models.Size).filter(models.Size.size_id == active_batch.size_id).first()
    color = db.query(models.Color).filter(models.Color.color_id == active_batch.color_id).first()
    phase = db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == active_batch.current_phase).first()
    
    return schemas.BatchResponse(
        batch_id=active_batch.batch_id,
        barcode=active_batch.barcode,
        brand_id=active_batch.brand_id,
        model_id=active_batch.model_id,
        size_id=active_batch.size_id,
        color_id=active_batch.color_id,
        quantity=active_batch.quantity,
        layers=active_batch.layers,
        serial=str(active_batch.serial),
        current_phase=active_batch.current_phase,
        status=active_batch.status,
        brand_name=brand.brand_name if brand else "",
        model_name=model.model_name if model else "",
        size_value=size.size_value if size else "",
        color_name=color.color_name if color else "",
        phase_name=phase.phase_name if phase else "",
        last_updated_at=active_batch.last_updated_at,
        archived_at=None
    )

def recover_archived_batches_bulk(db: Session, batch_ids: List[int]):
    """Recover multiple archived batches by moving them back to the active batches table"""
    recovered_batches = []
    errors = []
    
    for batch_id in batch_ids:
        try:
            recovered_batch = recover_archived_batch(db, batch_id)
            if recovered_batch:
                recovered_batches.append(recovered_batch)
            else:
                errors.append(f"Batch {batch_id} not found in archived batches")
        except ValueError as e:
            errors.append(f"Batch {batch_id}: {str(e)}")
        except Exception as e:
            errors.append(f"Batch {batch_id}: Unexpected error - {str(e)}")
    
    if errors:
        raise ValueError(f"Some batches could not be recovered: {'; '.join(errors)}")
    
    return recovered_batches 