from sqlalchemy.orm import Session
from typing import Dict, Any
import base36
import hashlib
from .. import models

# --- Helper functions (validation, barcode generation, get_or_create, etc.) ---

def encode_model_name(model_name: str, length: int = 2) -> str:
    hash_digest = hashlib.md5(str(model_name).encode()).hexdigest()
    hash_int = int(hash_digest, 16)
    encoded = base36.dumps(hash_int)
    return encoded[:length].upper()

def generate_barcode_string(job_order_id: int, size_id: int, color_id: int, layers: int, serial: int) -> str:
    """Generate barcode string without client_id, model_id, and quantity.
    
    Format: {job_order}-{size}-{color}-{layers}-{serial}
    
    For cut-generated batches, ``layers`` packs cut sequence within the job order and roll (decimal):
    ``cut_sequence * 100 + roll_number`` (roll 0..99). Bulk-upload batches use the spreadsheet layers count.
    
    Note: client_id and model_id are removed from barcode but still displayed in printed labels.
    Quantity is also removed from barcode string.
    """
    job_order_code = base36.dumps(job_order_id)
    size_code = base36.dumps(size_id)
    color_code = base36.dumps(color_id)
    layers_code = base36.dumps(layers)
    serial_code = base36.dumps(serial)
    return f"{job_order_code}-{size_code}-{color_code}-{layers_code}-{serial_code}"

def get_or_create_client(db: Session, name: str) -> models.Client:
    client = db.query(models.Client).filter(models.Client.client_name == name).first()
    if not client:
        client = models.Client(client_name=name)
        db.add(client)
        db.commit()
        db.refresh(client)
    return client

def get_or_create_model(db: Session, name: str, client_id: int) -> models.Model:
    model = db.query(models.Model).filter(
        models.Model.model_name == name
    ).first()
    if not model:
        model = models.Model(model_name=name)
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

def get_next_serial_number(db: Session, job_order_id: int, size_id: int, color_id: int) -> int:
    """Get the next serial number for a specific job order + size + color combination"""
    # Count existing batches for this job order + size + color combination
    existing_count = db.query(models.Batch).filter(
        models.Batch.job_order_id == job_order_id,
        models.Batch.size_id == size_id,
        models.Batch.color_id == color_id
    ).count()
    
    # Return the next serial number (starting from 1)
    return existing_count + 1

