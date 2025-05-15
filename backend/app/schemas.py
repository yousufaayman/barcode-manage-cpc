from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

# User schemas
class RoleEnum(str, Enum):
    ADMIN = "Admin"
    CUTTING = "Cutting"
    SEWING = "Sewing"
    PACKAGING = "Packaging"

class UserBase(BaseModel):
    username: str
    role: RoleEnum

class UserCreate(UserBase):
    password: str

class UserUpdate(UserBase):
    password: Optional[str] = None

class UserInDB(UserBase):
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class User(UserInDB):
    pass

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None  # username
    exp: Optional[datetime] = None

# Brand schemas
class BrandBase(BaseModel):
    brand_name: str

class BrandCreate(BrandBase):
    pass

class Brand(BrandBase):
    brand_id: int

    class Config:
        from_attributes = True

# Model schemas
class ModelBase(BaseModel):
    model_name: str

class ModelCreate(ModelBase):
    pass

class Model(ModelBase):
    model_id: int

    class Config:
        from_attributes = True

# Size schemas
class SizeBase(BaseModel):
    size_value: str

class SizeCreate(SizeBase):
    pass

class Size(SizeBase):
    size_id: int

    class Config:
        from_attributes = True

# Color schemas
class ColorBase(BaseModel):
    color_name: str

class ColorCreate(ColorBase):
    pass

class Color(ColorBase):
    color_id: int

    class Config:
        from_attributes = True

# Production Phase schemas
class ProductionPhaseBase(BaseModel):
    phase_name: str

class ProductionPhaseCreate(ProductionPhaseBase):
    pass

class ProductionPhase(ProductionPhaseBase):
    phase_id: int

    class Config:
        from_attributes = True

# Batch schemas
class BatchBase(BaseModel):
    barcode: str
    brand_id: int
    model_id: int
    size_id: int
    color_id: int
    quantity: int = Field(ge=1, le=999)
    layers: int = Field(ge=1, le=99)
    serial: str = Field(min_length=1, max_length=3)
    current_phase: int
    status: str

class BatchCreate(BatchBase):
    pass

class BatchUpdate(BaseModel):
    quantity: Optional[int] = Field(None, ge=1, le=999)
    layers: Optional[int] = Field(None, ge=1, le=99)
    serial: Optional[str] = Field(None, min_length=1, max_length=3)
    current_phase: Optional[int] = None
    status: Optional[str] = None

class Batch(BatchBase):
    batch_id: int
    brand: Optional[Brand] = None
    model: Optional[Model] = None
    size: Optional[Size] = None
    color: Optional[Color] = None
    phase: Optional[ProductionPhase] = None

    class Config:
        from_attributes = True

class BatchResponse(BaseModel):
    batch_id: int
    barcode: str
    brand_name: str
    model_name: str
    size_value: str
    color_name: str
    quantity: int
    layers: int
    serial: str
    phase_name: str
    status: str

    class Config:
        from_attributes = True

class BulkBarcodeProcess(BaseModel):
    brand: str
    model: str
    size: str
    color: str
    quantity: int
    layers: int
    serial: int

class ErrorRow(BaseModel):
    rowNumber: int
    data: Dict[str, Any]
    error: str

class BulkBarcodeResponse(BaseModel):
    processed_data: List[Dict[str, Any]]
    error_rows: List[ErrorRow]

    class Config:
        from_attributes = True

class BulkSubmitResponse(BaseModel):
    created_batches: List[BatchResponse]
    duplicate_barcodes: List[Dict[str, Any]]
    message: str

    class Config:
        from_attributes = True

class BatchStats(BaseModel):
    total_batches: int
    in_production: int
    completed: int

class PackagingStats(BaseModel):
    completed: int
    pending: int
    in_progress: int  # Separate from pending now

class PhaseStatusStats(BaseModel):
    pending: int
    in_progress: int

class PhaseStats(BaseModel):
    cutting: PhaseStatusStats
    sewing: PhaseStatusStats
    packaging: PackagingStats 