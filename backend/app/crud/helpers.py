from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple
import pandas as pd
import base36
import hashlib
from .. import models, schemas

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

def validate_row_data(row_data: Dict[str, Any], required_columns: List[str]) -> Tuple[bool, Optional[str]]:
    missing_fields = [field for field in required_columns if not row_data.get(field)]
    if missing_fields:
        if len(missing_fields) == 1:
            return False, f"Missing required field: {missing_fields[0]}"
        else:
            return False, f"Missing required fields: {', '.join(missing_fields)}"
    return True, None

def validate_numeric_fields(row_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    try:
        quantity = int(float(row_data["quantity"]))
        layers = int(float(row_data["layers"]))
        
        # Check each field individually for better error messages
        if quantity <= 0:
            return False, "Quantity must be a positive number"
        if layers <= 0:
            return False, "Layers must be a positive number"
        
        return True, None
    except (ValueError, TypeError):
        # Try to identify which field is causing the issue
        try:
            int(float(row_data["quantity"]))
        except (ValueError, TypeError):
            return False, "Quantity must be a valid number"
        
        try:
            int(float(row_data["layers"]))
        except (ValueError, TypeError):
            return False, "Layers must be a valid number"
        
        return False, "Quantity and layers must be valid numbers"



def process_row(db: Session, row_data: Dict[str, Any], job_order: models.JobOrder, allowed_sizes: Dict[str, Any], allowed_colors: Dict[str, Any]) -> Dict[str, Any]:
    size_value = str(row_data["size"]).strip().lower()
    color_name = str(row_data["color"]).strip().lower()
    size = allowed_sizes.get(size_value)
    color = allowed_colors.get(color_name)
    
    # Provide specific error messages for size/color validation
    if not size and not color:
        raise ValueError("Size/color not allowed for this job order.")
    elif not size:
        raise ValueError("Size not allowed for this job order.")
    elif not color:
        raise ValueError("Color not allowed for this job order.")
    quantity = int(float(row_data["quantity"]))
    layers = int(float(row_data["layers"]))
    
    # Auto-generate serial number based on existing batches for this job order + size + color combination
    serial_int = get_next_serial_number(db, job_order.job_order_id, size.size_id, color.color_id)
    serial_str = f"{serial_int:03d}"
    
    client = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first() if job_order.model_id else None
    barcode = generate_barcode_string(
        job_order.job_order_id,
        size.size_id,
        color.color_id,
        layers,
        serial_int
    )
    return {
        "barcode": barcode,
        "job_order_id": job_order.job_order_id,
        "client_id": client.client_id if client else None,
        "model_id": model.model_id if model else None,
        "size_id": size.size_id,
        "color_id": color.color_id,
        "client": client.client_name if client else None,
        "model": model.model_name if model else None,
        "size": size.size_value,
        "color": color.color_name,
        "quantity": quantity,
        "layers": layers,
        "serial": serial_str,
        "current_phase": 1,  # Default to first phase (Cutting)
        "status": "In Progress"  # Default status for new batches
    }

def process_row_with_serial(db: Session, row_data: Dict[str, Any], job_order: models.JobOrder, allowed_sizes: Dict[str, Any], allowed_colors: Dict[str, Any], serial_number: int) -> Dict[str, Any]:
    """Process a row with a pre-assigned serial number"""
    size_value = str(row_data["size"]).strip().lower()
    color_name = str(row_data["color"]).strip().lower()
    size = allowed_sizes.get(size_value)
    color = allowed_colors.get(color_name)
    
    # Provide specific error messages for size/color validation
    if not size and not color:
        raise ValueError("Size/color not allowed for this job order.")
    elif not size:
        raise ValueError("Size not allowed for this job order.")
    elif not color:
        raise ValueError("Color not allowed for this job order.")
    quantity = int(float(row_data["quantity"]))
    layers = int(float(row_data["layers"]))
    
    # Use the pre-assigned serial number
    serial_str = f"{serial_number:03d}"
    
    client = db.query(models.Client).filter(models.Client.client_id == job_order.client_id).first() if job_order.client_id else None
    model = db.query(models.Model).filter(models.Model.model_id == job_order.model_id).first() if job_order.model_id else None
    barcode = generate_barcode_string(
        job_order.job_order_id,
        size.size_id,
        color.color_id,
        layers,
        serial_number
    )
    return {
        "barcode": barcode,
        "job_order_id": job_order.job_order_id,
        "client_id": client.client_id if client else None,
        "model_id": model.model_id if model else None,
        "size_id": size.size_id,
        "color_id": color.color_id,
        "client": client.client_name if client else None,
        "model": model.model_name if model else None,
        "size": size.size_value,
        "color": color.color_name,
        "quantity": quantity,
        "layers": layers,
        "serial": serial_str,
        "current_phase": 1,  # Default to first phase (Cutting)
        "status": "In Progress"  # Default status for new batches
    }

def process_bulk_barcodes(db: Session, df: pd.DataFrame, job_order_id: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    processed_data = []
    error_rows = []
    required_columns = ["size", "color", "quantity", "layers"]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
    job_order = db.query(models.JobOrder).filter(models.JobOrder.job_order_id == job_order_id).first()
    if not job_order:
        raise ValueError("Job order not found.")
    
    # Build allowed sizes/colors dicts for fast lookup (case-insensitive)
    allowed_sizes = {item.size.size_value.strip().lower(): item.size for item in job_order.items}
    allowed_colors = {item.color.color_name.strip().lower(): item.color for item in job_order.items}
    
    # First pass: validate all rows and collect valid ones
    valid_rows = []
    for index, row in df.iterrows():
        try:
            row_data = {k: v if pd.notna(v) else None for k, v in row.to_dict().items()}
            for key, value in row_data.items():
                if isinstance(value, str):
                    row_data[key] = value.strip().lower()
                elif isinstance(value, (int, float)):
                    # Convert numeric values to string for size and color fields
                    if key in ["size", "color"]:
                        row_data[key] = str(value).strip().lower()
            
            is_valid, error = validate_row_data(row_data, required_columns)
            if not is_valid:
                error_rows.append({"rowNumber": index + 2, "data": row_data, "error": error})
                continue
            is_valid, error = validate_numeric_fields(row_data)
            if not is_valid:
                error_rows.append({"rowNumber": index + 2, "data": row_data, "error": error})
                continue
            
            # Check if size and color are allowed for this job order with specific error messages
            size_valid = row_data["size"] in allowed_sizes
            color_valid = row_data["color"] in allowed_colors
            
            if not size_valid and not color_valid:
                error_rows.append({
                    "rowNumber": index + 2,
                    "data": row_data,
                    "error": "Size/color not allowed for this job order."
                })
                continue
            elif not size_valid:
                error_rows.append({
                    "rowNumber": index + 2,
                    "data": row_data,
                    "error": "Size not allowed for this job order."
                })
                continue
            elif not color_valid:
                error_rows.append({
                    "rowNumber": index + 2,
                    "data": row_data,
                    "error": "Color not allowed for this job order."
                })
                continue
            
            row_data["quantity"] = int(row_data["quantity"])
            row_data["layers"] = int(row_data["layers"])
            valid_rows.append((index, row_data))
            
        except Exception as e:
            error_rows.append({
                "rowNumber": index + 2,
                "data": row_data,
                "error": str(e)
            })
    
    # Group valid rows by size+color combination
    size_color_groups = {}
    for index, row_data in valid_rows:
        size_value = row_data["size"]
        color_name = row_data["color"]
        key = (size_value, color_name)
        if key not in size_color_groups:
            size_color_groups[key] = []
        size_color_groups[key].append((index, row_data))
    
    # For each group, get the starting serial number and assign sequential numbers
    for (size_value, color_name), group_rows in size_color_groups.items():
        size = allowed_sizes[size_value]
        color = allowed_colors[color_name]
        
        # Get the starting serial number for this combination
        existing_count = db.query(models.Batch).filter(
            models.Batch.job_order_id == job_order_id,
            models.Batch.size_id == size.size_id,
            models.Batch.color_id == color.color_id
        ).count()
        
        # Assign sequential serial numbers to each row in this group
        for i, (index, row_data) in enumerate(group_rows):
            serial_number = existing_count + i + 1
            row_data["serial"] = serial_number
            
            # Process the row with the assigned serial number
            try:
                processed_row = process_row_with_serial(db, row_data, job_order, allowed_sizes, allowed_colors, serial_number)
                processed_data.append(processed_row)
            except Exception as e:
                error_rows.append({
                    "rowNumber": index + 2,
                    "data": row_data,
                    "error": str(e)
                })
    
    return processed_data, error_rows

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

