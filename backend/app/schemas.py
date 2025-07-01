from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from enum import Enum

# User schemas
class RoleEnum(str, Enum):
    ADMIN = "Admin"
    CREATOR = "Creator"
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
    id: int

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

class ResetPasswordRequest(BaseModel):
    new_password: str

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
    job_order_id: int
    barcode: str
    brand_id: int
    model_id: int
    size_id: int
    color_id: int
    quantity: int
    layers: int
    serial: str
    current_phase: int
    status: str

class BatchCreate(BatchBase):
    pass

class BatchUpdate(BaseModel):
    job_order_id: Optional[int] = None
    barcode: Optional[str] = None
    brand_id: Optional[int] = None
    model_id: Optional[int] = None
    size_id: Optional[int] = None
    color_id: Optional[int] = None
    quantity: Optional[int] = None
    layers: Optional[int] = None
    serial: Optional[str] = None
    current_phase: Optional[int] = None
    status: Optional[str] = None

class BatchResponse(BatchBase):
    batch_id: int
    job_order_number: Optional[str] = None
    brand_name: str
    model_name: str
    size_value: str
    color_name: str
    phase_name: str
    last_updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

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

class BulkValidationResponse(BaseModel):
    valid_rows: List[Dict[str, Any]]
    error_rows: List[ErrorRow]

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

# Timeline schemas
class TimelineEntryBase(BaseModel):
    batch_id: int
    status: str
    phase_id: int

class TimelineEntryCreate(TimelineEntryBase):
    pass

class TimelineEntryResponse(TimelineEntryBase):
    id: int
    start_time: datetime
    end_time: Optional[datetime]
    duration_minutes: Optional[int]

    class Config:
        from_attributes = True

class TurnoverRateByPhase(BaseModel):
    phase_id: int
    phase_name: str
    average_minutes: float

    class Config:
        from_attributes = True

class TurnoverStat(BaseModel):
    batch_id: int
    phase_id: int
    phase_name: str
    duration_minutes: Optional[float] = None

    class Config:
        from_attributes = True

class BottleneckPhaseStat(BaseModel):
    phase_id: int
    phase_name: str
    average_minutes: float

    class Config:
        from_attributes = True

class TimeSpentStatusStat(BaseModel):
    batch_id: int
    phase_id: int
    phase_name: str
    total_minutes: Optional[float] = None

    class Config:
        from_attributes = True

class ThroughputStat(BaseModel):
    period: date
    completed_batches: int

    class Config:
        from_attributes = True

class PhaseEntryExitStat(BaseModel):
    phase_id: int
    phase_name: str
    entries: int
    exits: int

    class Config:
        from_attributes = True

class WIPStat(BaseModel):
    phase_id: int
    phase_name: str
    pending: int
    in_progress: int
    completed: int

    class Config:
        from_attributes = True

class WIPByBrandStat(BaseModel):
    brand_id: int
    brand_name: str
    pending: int
    in_progress: int
    completed: int
    total: int

    class Config:
        from_attributes = True

class WorkingPhaseByBrandStat(BaseModel):
    brand_id: int
    brand_name: str
    phase_id: int
    phase_name: str
    pending: int
    in_progress: int
    completed: int
    total: int

    class Config:
        from_attributes = True

class WorkingPhaseByModelStat(BaseModel):
    model_id: int
    model_name: str
    brand_id: int
    brand_name: str
    phase_id: int
    phase_name: str
    pending: int
    in_progress: int
    completed: int
    total: int

    class Config:
        from_attributes = True

class AttributeCompletionTimeStat(BaseModel):
    attribute: str  # e.g., 'brand', 'model', etc.
    value: str
    average_minutes: float

    class Config:
        from_attributes = True

class StuckBatchStat(BaseModel):
    batch_id: int
    phase_id: int
    phase_name: str
    status: str
    duration_minutes: float

    class Config:
        from_attributes = True

class PhaseReentryStat(BaseModel):
    batch_id: int
    phase_id: int
    phase_name: str
    reentry_count: int

    class Config:
        from_attributes = True

class PendingInProgressRatioStat(BaseModel):
    phase_id: int
    phase_name: str
    pending_minutes: float
    in_progress_minutes: float
    ratio: float

    class Config:
        from_attributes = True

class BatchAgeStat(BaseModel):
    batch_id: int
    age_minutes: float

    class Config:
        from_attributes = True

class StatusDistributionStat(BaseModel):
    status: str
    count: int

    class Config:
        from_attributes = True

class CommonAttributeStat(BaseModel):
    attribute: str
    value: str
    count: int

    class Config:
        from_attributes = True

class AdvancedStatisticsResponse(BaseModel):
    turnover_rate_by_phase: List[TurnoverRateByPhase]
    slowest_turnover: Optional[TurnoverRateByPhase]
    fastest_turnover: Optional[TurnoverRateByPhase]
    bottleneck_phase: Optional[TurnoverRateByPhase]
    most_time_spent_pending: Optional[TimeSpentStatusStat]
    fastest_pending: Optional[TimeSpentStatusStat]
    fastest_in_progress: Optional[TimeSpentStatusStat]
    batch_throughput: List[ThroughputStat]
    average_batch_size: float
    phase_entry_exit_counts: List[PhaseEntryExitStat]
    average_phases_per_batch: float
    longest_time_in_single_phase: Optional[TurnoverRateByPhase]
    shortest_time_in_single_phase: Optional[TurnoverRateByPhase]
    current_wip: List[WIPStat]
    wip_by_brand: List[WIPByBrandStat]
    working_phase_by_brand: List[WorkingPhaseByBrandStat]
    working_phase_by_model: List[WorkingPhaseByModelStat]
    avg_time_to_completion_by_attribute: List[AttributeCompletionTimeStat]
    stuck_batches: List[StuckBatchStat]
    phase_reentries: List[PhaseReentryStat]
    pending_in_progress_ratio: List[PendingInProgressRatioStat]
    batch_ages: List[BatchAgeStat]
    status_distribution: List[StatusDistributionStat]
    most_common_batch_attributes: List[CommonAttributeStat]

    class Config:
        from_attributes = True

# Job Order schemas
class JobOrderItemBase(BaseModel):
    color_id: int
    size_id: int
    quantity: int

class JobOrderItem(JobOrderItemBase):
    item_id: int
    job_order_id: int
    color_name: Optional[str] = None
    size_value: Optional[str] = None

    class Config:
        from_attributes = True

class JobOrderItemCreate(JobOrderItemBase):
    pass

class JobOrderItemCreateWithNames(BaseModel):
    color_name: str
    size_value: str
    quantity: int

class JobOrderItemUpdate(BaseModel):
    color_id: Optional[int] = None
    size_id: Optional[int] = None
    quantity: Optional[int] = None

class JobOrderBase(BaseModel):
    model_id: int
    job_order_number: str

class JobOrderCreate(BaseModel):
    model_id: int
    job_order_number: str
    items: List[JobOrderItemCreate]
    closed: bool = False

class JobOrderCreateWithNames(BaseModel):
    model_name: str
    job_order_number: str
    items: List[JobOrderItemCreateWithNames]
    closed: bool = False

class JobOrderUpdate(BaseModel):
    model_id: Optional[int] = None
    job_order_number: Optional[str] = None
    items: Optional[List[Dict[str, int]]] = None  # List of {item_id: int, quantity: int}
    closed: Optional[bool] = None

class JobOrder(JobOrderBase):
    job_order_id: int
    model_name: Optional[str] = None
    items: List[JobOrderItem] = []
    total_working_quantity: Optional[int] = None
    closed: bool = False

    class Config:
        from_attributes = True

class JobOrderSummary(BaseModel):
    job_order_id: int
    job_order_number: str
    model_name: str
    total_colors: int
    total_quantity: int

    class Config:
        from_attributes = True 