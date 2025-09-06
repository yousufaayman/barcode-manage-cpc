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
    size_id: int
    color_id: int
    quantity: int
    layers: int
    serial: str
    current_phase: int
    status: str
    is_second_degree: bool = False

class BatchCreate(BatchBase):
    is_second_degree: bool = False

class SecondDegreeBatchCreate(BaseModel):
    job_order_id: int
    size_id: int
    color_id: int
    quantity: int = 0  # Always 0 for second degree
    layers: int = 1
    current_phase: int = 1
    status: str = "In Progress"
    is_second_degree: bool = True

class BatchUpdate(BaseModel):
    job_order_id: Optional[int] = None
    barcode: Optional[str] = None
    size_id: Optional[int] = None
    color_id: Optional[int] = None
    quantity: Optional[int] = None
    layers: Optional[int] = None
    serial: Optional[str] = None
    current_phase: Optional[int] = None
    status: Optional[str] = None
    is_second_degree: Optional[bool] = None

class BatchResponse(BatchBase):
    batch_id: int
    job_order_number: Optional[str] = None
    size_value: str
    color_name: str
    phase_name: str
    last_updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    brand_name: Optional[str] = None
    model_name: Optional[str] = None

    class Config:
        from_attributes = True

class BatchListResponse(BaseModel):
    items: List[BatchResponse]
    total: int

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
    updated_quantity: Optional[int] = None

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

class JobOrderMaterialCreateWithName(BaseModel):
    material_name: str
    quantity: float
    color_name: Optional[str] = None
    notes: Optional[str] = None
    consumption: Optional[float] = None

class JobOrderPrint(BaseModel):
    chest: bool = False
    back: bool = False
    waist: bool = False
    right_leg: bool = False
    left_leg: bool = False
    pocket: bool = False
    hood: bool = False
    right_arm: bool = False
    left_arm: bool = False

    class Config:
        from_attributes = True

# Job Order schemas
class JobOrderItemBase(BaseModel):
    color_id: int
    size_id: int
    quantity: int
    weight: Optional[float] = None
    notes: Optional[str] = None

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
    weight: Optional[float] = None
    notes: Optional[str] = None

class JobOrderItemUpdate(BaseModel):
    color_id: Optional[int] = None
    size_id: Optional[int] = None
    quantity: Optional[int] = None
    weight: Optional[float] = None
    notes: Optional[str] = None

class JobOrderItemNotesUpdate(BaseModel):
    notes: str

class JobOrderBase(BaseModel):
    model_id: int
    job_order_number: str
    brand_id: Optional[int] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None

class JobOrderCreate(BaseModel):
    model_id: int
    job_order_number: str
    items: List[JobOrderItemCreate]
    brand_id: Optional[int] = None
    image_url: Optional[str] = None
    prints: Optional[JobOrderPrint] = None

class JobOrderCreateWithNames(BaseModel):
    model_name: str
    job_order_number: str
    brand_name: str
    items: List[JobOrderItemCreateWithNames]
    brand_id: Optional[int] = None
    image_url: Optional[str] = None
    materials: Optional[List[JobOrderMaterialCreateWithName]] = None
    prints: Optional[JobOrderPrint] = None
    notes: Optional[str] = None

class JobOrderUpdate(BaseModel):
    model_id: Optional[int] = None
    job_order_number: Optional[str] = None
    items: Optional[List[Dict[str, int]]] = None  # List of {item_id: int, quantity: int}
    brand_id: Optional[int] = None
    image_url: Optional[str] = None
    prints: Optional[JobOrderPrint] = None
    notes: Optional[str] = None
    materials: Optional[List[JobOrderMaterialCreateWithName]] = None

class JobOrder(JobOrderBase):
    job_order_id: int
    model_name: Optional[str] = None
    brand_name: Optional[str] = None
    items: List[JobOrderItem] = []
    total_working_quantity: Optional[int] = None
    prints: Optional[JobOrderPrint] = None
    batches: Optional[List[Dict[str, str]]] = None
    image_url: Optional[str] = None
    date_created: Optional[datetime] = None

    class Config:
        from_attributes = True

class JobOrderSummary(BaseModel):
    job_order_id: int
    job_order_number: str
    model_name: Optional[str] = None
    brand_name: Optional[str] = None
    total_items: int
    total_expected_quantity: int
    total_produced_quantity: int
    cut_quantity: int
    second_degree_quantity: int
    completed_quantity: int
    working_quantity: int
    remaining_quantity: int
    total_batches: int
    has_issues: bool
    has_high_second_degree: bool
    has_stalled_batches: bool
    completion_percentage: float
    overproduction_quantity: int
    last_calculated_at: Optional[datetime] = None
    last_quantity_change: Optional[datetime] = None
    last_completion_change: Optional[datetime] = None
    last_new_batch: Optional[datetime] = None
    last_batch_update: Optional[datetime] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True

# ============================================================================
# ITEM-LEVEL QUANTITY TRACKING SCHEMAS
# ============================================================================

class JobOrderItemSummary(BaseModel):
    item_id: int
    job_order_id: int
    color_id: int
    size_id: int
    color_name: Optional[str] = None
    size_value: Optional[str] = None
    expected_quantity: int
    produced_quantity: int
    cut_quantity: int
    second_degree_quantity: int
    completed_quantity: int
    working_quantity: int
    remaining_quantity: int
    total_batches: int
    has_issues: bool
    completion_percentage: float
    overproduction_quantity: int
    production_status: str
    notes: Optional[str] = None
    last_calculated_at: Optional[datetime] = None
    last_quantity_change: Optional[datetime] = None
    last_completion_change: Optional[datetime] = None
    last_new_batch: Optional[datetime] = None
    last_batch_update: Optional[datetime] = None

    class Config:
        from_attributes = True

class JobOrderItemProductionTracking(BaseModel):
    item_id: int
    job_order_id: int
    job_order_number: str
    model_name: Optional[str] = None
    brand_name: Optional[str] = None
    color_id: int
    color_name: str
    size_id: int
    size_value: str
    expected_quantity: int
    produced_quantity: int
    cut_quantity: int
    second_degree_quantity: int
    completed_quantity: int
    working_quantity: int
    remaining_quantity: int
    production_status: str
    completion_percentage: float
    has_issues: bool
    overproduction_quantity: int
    total_batches: int
    last_calculated_at: Optional[datetime] = None
    last_quantity_change: Optional[datetime] = None
    last_completion_change: Optional[datetime] = None
    last_new_batch: Optional[datetime] = None
    last_batch_update: Optional[datetime] = None

    class Config:
        from_attributes = True

class JobOrderItemWithIssues(BaseModel):
    item_id: int
    job_order_id: int
    job_order_number: str
    model_name: Optional[str] = None
    brand_name: Optional[str] = None
    color_name: str
    size_value: str
    expected_quantity: int
    produced_quantity: int
    overproduction_quantity: int
    completion_percentage: float

    class Config:
        from_attributes = True

class JobOrderItemHighSecondDegree(BaseModel):
    item_id: int
    job_order_id: int
    job_order_number: str
    model_name: Optional[str] = None
    brand_name: Optional[str] = None
    color_name: str
    size_value: str
    produced_quantity: int
    second_degree_quantity: int
    second_degree_percentage: float

    class Config:
        from_attributes = True

class JobOrderItemWithQuantityReductions(BaseModel):
    item_id: int
    job_order_id: int
    job_order_number: str
    model_name: Optional[str] = None
    brand_name: Optional[str] = None
    color_name: str
    size_value: str
    produced_quantity: int
    cut_quantity: int
    quantity_reduction: int

    class Config:
        from_attributes = True

class JobOrderItemQuantityBreakdown(BaseModel):
    item_id: int
    job_order_id: int
    color_name: str
    size_value: str
    expected_quantity: int
    produced_quantity: int
    cut_quantity: int
    second_degree_quantity: int
    first_degree_quantity: int
    cut_vs_produced_difference: int
    second_degree_percentage: float
    completion_percentage: float
    has_issues: bool
    production_status: str

    class Config:
        from_attributes = True

class ItemLevelStatistics(BaseModel):
    total_items: int
    items_with_issues: int
    completed_items: int
    in_progress_items: int
    not_started_items: int
    total_expected_quantity: int
    total_produced_quantity: int
    total_second_degree_quantity: int
    total_overproduction_quantity: int
    overall_completion_percentage: float
    overall_second_degree_percentage: float

    class Config:
        from_attributes = True

# Response models for item-level endpoints
class JobOrderItemSummaryListResponse(BaseModel):
    items: List[JobOrderItemSummary]
    total: int

class JobOrderItemWithIssuesListResponse(BaseModel):
    items: List[JobOrderItemWithIssues]
    total: int

class JobOrderItemHighSecondDegreeListResponse(BaseModel):
    items: List[JobOrderItemHighSecondDegree]
    total: int

class JobOrderItemWithQuantityReductionsListResponse(BaseModel):
    items: List[JobOrderItemWithQuantityReductions]
    total: int

class JobOrderItemQuantityBreakdownListResponse(BaseModel):
    items: List[JobOrderItemQuantityBreakdown]
    total: int

class ArchivedBatchBase(BaseModel):
    job_order_id: int
    barcode: str
    size_id: int
    color_id: int
    quantity: int
    layers: int
    serial: str
    current_phase: int
    status: str
    last_updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

class ArchivedBatchCreate(ArchivedBatchBase):
    pass

class ArchivedBatchResponse(ArchivedBatchBase):
    batch_id: int
    size_value: Optional[str] = None
    color_name: Optional[str] = None
    phase_name: Optional[str] = None

    class Config:
        from_attributes = True

# Archived Job Order schemas
class ArchivedJobOrderBase(BaseModel):
    model_id: int
    job_order_number: str
    brand_id: Optional[int] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    date_created: datetime
    archived_at: Optional[datetime] = None

class ArchivedJobOrderCreate(ArchivedJobOrderBase):
    pass

class ArchivedJobOrderResponse(ArchivedJobOrderBase):
    job_order_id: int
    model_name: Optional[str] = None
    brand_name: Optional[str] = None

    class Config:
        from_attributes = True

# Archived Job Order Item schemas
class ArchivedJobOrderItemBase(BaseModel):
    job_order_id: int
    color_id: int
    size_id: int
    quantity: int
    weight: Optional[float] = None
    notes: Optional[str] = None
    archived_at: datetime

class ArchivedJobOrderItemCreate(ArchivedJobOrderItemBase):
    pass

class ArchivedJobOrderItemResponse(ArchivedJobOrderItemBase):
    item_id: int
    job_order_number: Optional[str] = None
    color_name: Optional[str] = None
    size_value: Optional[str] = None

    class Config:
        from_attributes = True

# Event-based timeline schemas
class BarcodeScanEventBase(BaseModel):
    batch_id: int
    action_type: str
    phase_id: int
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    old_quantity: Optional[int] = None
    new_quantity: Optional[int] = None
    old_phase: Optional[int] = None
    new_phase: Optional[int] = None
    scanned_at: datetime
    user_id: Optional[int] = None
    notes: Optional[str] = None

class BarcodeScanEventCreate(BarcodeScanEventBase):
    pass

class BarcodeScanEventResponse(BarcodeScanEventBase):
    id: int
    phase_name: Optional[str] = None
    user_name: Optional[str] = None

    class Config:
        from_attributes = True

class TimelineSummaryEntry(BaseModel):
    phase_id: int
    phase_name: str
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    duration_minutes: Optional[int]
    status: str
    quantity_at_start: Optional[int]
    quantity_at_end: Optional[int]
    event_count: int

class TimelineSummaryResponse(BaseModel):
    barcode: str
    timeline_entries: List[TimelineSummaryEntry]
    total_entries: int
    total_events: int

    class Config:
        from_attributes = True 

class ProductionStatisticsResponse(BaseModel):
    wip_by_phase: List[Dict[str, Any]]
    production_by_brand: List[Dict[str, Any]]
    production_by_model: List[Dict[str, Any]]
    recent_activity: List[Dict[str, Any]]
    bottlenecks: List[Dict[str, Any]]
    overall_stats: Dict[str, Any]
    second_degree_stats: Dict[str, Any]

    class Config:
        from_attributes = True

class BrandStatisticsResponse(BaseModel):
    brand_info: Dict[str, Any]
    phases: List[Dict[str, Any]]
    models: List[Dict[str, Any]]

    class Config:
        from_attributes = True

class ModelStatisticsResponse(BaseModel):
    model_info: Dict[str, Any]
    phases: List[Dict[str, Any]]

    class Config:
        from_attributes = True 