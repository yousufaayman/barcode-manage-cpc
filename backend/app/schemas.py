from pydantic import BaseModel, Field, EmailStr, model_validator, computed_field, model_serializer
from typing import Optional, List, Dict, Any, Literal
# Shared status literals
CutPrintStatus = Literal['pending', 'in_progress', 'completed']

from datetime import datetime, date
from enum import Enum

# ============================================================================
# CORE SCHEMA MODELS
# ============================================================================

# User schemas
class RoleEnum(str, Enum):
    ADMIN = "admin"
    GENERAL_OPERATIONS = "general_operations"
    CUTTING = "cutting"
    SEWING = "sewing"
    PACKAGING = "packaging"

# System schemas
class SystemBase(BaseModel):
    name: str

class SystemCreate(SystemBase):
    pass

class SystemUpdate(BaseModel):
    name: Optional[str] = None

class System(SystemBase):
    id: int

    class Config:
        from_attributes = True

# User Role schemas
class UserRoleBase(BaseModel):
    user_id: int
    system_id: int
    role: RoleEnum

class UserRoleCreate(UserRoleBase):
    pass

class UserRoleUpdate(BaseModel):
    role: Optional[RoleEnum] = None

class UserRole(UserRoleBase):
    id: int
    system: Optional["System"] = None

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    roles: Optional[List[UserRoleCreate]] = []

class UserUpdate(UserBase):
    password: Optional[str] = None
    roles: Optional[List[UserRoleCreate]] = None

class UserInDB(UserBase):
    id: int
    user_roles: Optional[List[UserRole]] = []

    class Config:
        from_attributes = True

class User(UserInDB):
    @computed_field
    @property
    def role(self) -> Optional[str]:
        """Extract role from user_roles array for OPS system"""
        if not self.user_roles:
            return None
        
        for user_role in self.user_roles:
            if hasattr(user_role, 'system') and user_role.system.name == 'OPS':
                return user_role.role
        return None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None  # username
    exp: Optional[datetime] = None

class ResetPasswordRequest(BaseModel):
    new_password: str

# Client schemas (renamed from Brand)
class ClientBase(BaseModel):
    client_name: str

class ClientCreate(ClientBase):
    pass

class Client(ClientBase):
    client_id: int

    class Config:
        from_attributes = True

# Backward compatibility for brands endpoint
class BrandResponse(BaseModel):
    brand_name: str
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

# Material schemas
class MaterialBase(BaseModel):
    material_name: str

class MaterialCreate(MaterialBase):
    pass

class Material(MaterialBase):
    material_id: int

    class Config:
        from_attributes = True

# Production Phase schemas
class ProductionPhaseBase(BaseModel):
    phase_name: str
    type: Optional[str] = None
    sequence_order: Optional[int] = None

class ProductionPhaseCreate(ProductionPhaseBase):
    pass

class ProductionPhase(ProductionPhaseBase):
    phase_id: int

    class Config:
        from_attributes = True


# Sewing line schematic (for production management)
class SewingLineSchematicBase(BaseModel):
    name: str
    active: bool = True
    working_hours: Optional[float] = None
    hourly_production: Optional[int] = None


class SewingLineStageCreate(BaseModel):
    stage_name: str
    stage_order: int
    production_qty: Optional[int] = None
    is_in_final_stage: bool = False
    active: bool = True


class SewingLineSchematicCreate(SewingLineSchematicBase):
    production_phase_id: int
    stages: Optional[List[SewingLineStageCreate]] = None


class SewingLineSchematicUpdate(BaseModel):
    """Update schematic; stages if provided replace all existing stages."""
    production_phase_id: Optional[int] = None
    name: Optional[str] = None
    active: Optional[bool] = None
    working_hours: Optional[float] = None
    hourly_production: Optional[int] = None
    stages: Optional[List[SewingLineStageCreate]] = None


class SewingLineSchematic(SewingLineSchematicBase):
    schematic_id: int
    production_phase_id: int
    phase_name: Optional[str] = None  # joined from production_phases

    class Config:
        from_attributes = True


class SewingLineStageResponse(BaseModel):
    stage_id: int
    schematic_id: int
    stage_name: str
    stage_order: int
    production_qty: Optional[int] = None
    is_in_final_stage: bool = False
    active: bool = True

    class Config:
        from_attributes = True


class SewingLineSchematicDetail(SewingLineSchematic):
    stages: List[SewingLineStageResponse] = []


class SewingLineSchematicDeleteResult(BaseModel):
    """Row counts removed when deleting a schematic and dependent sewing production data."""

    schematic_id: int
    name: str
    worker_overtime_requests: int
    worker_overtime_history: int
    worker_daily_stage_assignments: int
    production_history: int
    worker_daily_stage_production: int
    sewing_line_stages: int


# Workers (production management)
class WorkerBase(BaseModel):
    worker_name: str
    active: bool = True
    worker_group_id: Optional[int] = None


class WorkerCreate(WorkerBase):
    worker_id: Optional[int] = None  # Optional manual PK; checked for conflict on create


class WorkerUpdate(BaseModel):
    worker_name: Optional[str] = None
    active: Optional[bool] = None
    worker_group_id: Optional[int] = None


class Worker(WorkerBase):
    worker_id: int

    class Config:
        from_attributes = True


class WorkerGroupBase(BaseModel):
    group_name: str
    working_hours: Optional[float] = None


class WorkerGroupCreate(WorkerGroupBase):
    pass


class WorkerGroupUpdate(BaseModel):
    group_name: Optional[str] = None
    working_hours: Optional[float] = None


class WorkerGroup(WorkerGroupBase):
    group_id: int

    class Config:
        from_attributes = True


# Production tracking (daily assignments + record production)
class DailyAssignmentResponse(BaseModel):
    daily_assignment_id: int
    assignment_date: date
    worker_id: int
    worker_name: str
    stage_id: int
    stage_name: str
    schematic_name: str
    working_hours: Optional[float] = None
    active: bool = True

    class Config:
        from_attributes = True


class DailyAssignmentCreate(BaseModel):
    assignment_date: date
    worker_id: int
    stage_id: int
    active: bool = True


# ============================================================================
# Overtime (OPS)
# ============================================================================
class WorkerOvertimeRequestCreate(BaseModel):
    phase_id: int
    schematic_id: int
    work_date: date
    overtime_hours: float
    worker_ids: List[int]
    notes: Optional[str] = None


class WorkerOvertimeRequestResponse(BaseModel):
    request_id: int
    status: str


class WorkerOvertimePendingWorker(BaseModel):
    worker_id: int
    worker_name: str


class WorkerOvertimePendingRequest(BaseModel):
    request_id: int
    phase_id: int
    phase_name: str
    schematic_id: int
    schematic_name: str
    work_date: date
    overtime_hours: float
    workers: List[WorkerOvertimePendingWorker]


class WorkerOvertimeAdminDecision(BaseModel):
    admin_comment: Optional[str] = None


class RecordProductionRequest(BaseModel):
    daily_assignment_id: int
    barcode: str
    quantity: int = 1
    tracking_date: Optional[date] = None  # If set, assignment must match this date (e.g. client "today")


class RecordProductionResponse(BaseModel):
    production_id: int
    batch_id: int
    barcode: str
    quantity_produced: int


class MaxProductionQuantityResponse(BaseModel):
    """Max quantity that can be recorded for this batch at this stage type."""
    max_allowed: Optional[int] = None  # None = no limit (batch has no quantity set)
    total_already: int = 0
    batch_quantity: Optional[int] = None


class PhaseDailyProductionResponse(BaseModel):
    """Total quantity produced in a phase for a specific date."""
    phase_id: int
    date: date
    total_quantity: int
    first_timestamp: Optional[datetime] = None
    last_timestamp: Optional[datetime] = None


class PhaseExpectedWorkRangeResponse(BaseModel):
    """Expected work and expected hourly work in a phase over a date range."""
    phase_id: int
    date_from: date
    date_to: date
    expected_quantity: int
    working_days_count: int
    expected_hourly_work: float
    working_hours_per_day: float
    total_possible_working_hours: float


class StageOption(BaseModel):
    stage_id: int
    stage_name: str
    schematic_id: int
    schematic_name: str
    stage_order: int


class BatchProductionDailyAssignmentOption(BaseModel):
    """Daily assignment option for responsible-phase dropdown when phase type is sewing."""
    daily_assignment_id: int
    worker_id: int
    worker_name: str
    stage_name: str
    quantity_produced: int
    assignment_date: Optional[date] = None


# Job Order Print Configuration (JSONB)
class JobOrderPrintConfig(BaseModel):
    type: str
    fields: Dict[str, str] = Field(default_factory=dict)
    placement_labels: Dict[str, str] = Field(default_factory=dict)
    color_breakdown: Dict[str, Dict[str, str]] = Field(default_factory=dict)

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, value):
        if value is None:
            return None

        if isinstance(value, JobOrderPrintConfig):
            return value

        if isinstance(value, dict):
            type_value = value.get("type") or value.get("method") or value.get("mode")
            if not type_value:
                return None

            merged_fields: Dict[str, str] = {}
            placement_labels: Dict[str, str] = {}
            color_breakdown: Dict[str, Dict[str, str]] = {}

            # Legacy nested details
            legacy_details = value.get("details")
            if isinstance(legacy_details, dict):
                for key, entry_value in legacy_details.items():
                    if entry_value is None:
                        continue
                    merged_fields[key] = str(entry_value)

            # Explicit fields dict
            explicit_fields = value.get("fields")
            if isinstance(explicit_fields, dict):
                for key, entry_value in explicit_fields.items():
                    if entry_value is None:
                        continue
                    merged_fields[key] = str(entry_value)

            labels = value.get("placement_labels")
            if isinstance(labels, dict):
                for key, label in labels.items():
                    if not key or label is None:
                        continue
                    placement_labels[key] = str(label)

            breakdown = value.get("color_breakdown")
            if isinstance(breakdown, dict):
                for color, placements in breakdown.items():
                    if not isinstance(placements, dict):
                        continue
                    normalized_entries: Dict[str, str] = {}
                    for placement_key, placement_value in placements.items():
                        if placement_value is None:
                            continue
                        normalized_entries[placement_key] = str(placement_value)
                    if normalized_entries:
                        color_breakdown[color] = normalized_entries

            # Any additional root-level entries become key/value pairs
            for key, entry_value in value.items():
                if key in {"type", "method", "mode", "details", "fields", "placement_labels", "color_breakdown"}:
                    continue
                if entry_value is None:
                    continue
                merged_fields[key] = str(entry_value)

            payload: Dict[str, Any] = {
                "type": type_value,
                "fields": merged_fields,
                "placement_labels": placement_labels,
                "color_breakdown": color_breakdown,
            }

            return payload

        return value

    @model_serializer(mode="plain")
    def serialize(self):
        payload: Dict[str, Any] = {"type": self.type}
        payload["fields"] = self.fields
        payload.update(self.fields)
        if self.placement_labels:
            payload["placement_labels"] = self.placement_labels
        if self.color_breakdown:
            payload["color_breakdown"] = self.color_breakdown
        return payload

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

class JobOrderPriorityUpdate(BaseModel):
    job_order_id: int
    priority: int

class BulkJobOrderPriorityUpdate(BaseModel):
    updates: List[JobOrderPriorityUpdate]

class JobOrderBase(BaseModel):
    model_id: int
    job_order_number: str
    client_id: Optional[int] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    print_config: Optional[JobOrderPrintConfig] = None
    priority: Optional[int] = 0

class JobOrderCreate(BaseModel):
    model_id: int
    job_order_number: str
    items: List[JobOrderItemCreate]
    client_id: Optional[int] = None
    image_url: Optional[str] = None
    print_config: Optional[JobOrderPrintConfig] = None
    priority: Optional[int] = 0

class JobOrderCreateWithNames(BaseModel):
    model_name: str
    job_order_number: str
    client_name: str
    items: List[JobOrderItemCreateWithNames]
    client_id: Optional[int] = None
    image_url: Optional[str] = None
    materials: Optional[List[Dict[str, Any]]] = None
    print_config: Optional[JobOrderPrintConfig] = None
    notes: Optional[str] = None
    priority: Optional[int] = 0

class JobOrderUpdate(BaseModel):
    model_id: Optional[int] = None
    job_order_number: Optional[str] = None
    items: Optional[List[Dict[str, int]]] = None  # List of {item_id: int, quantity: int}
    client_id: Optional[int] = None
    image_url: Optional[str] = None
    print_config: Optional[JobOrderPrintConfig] = None
    notes: Optional[str] = None
    materials: Optional[List[Dict[str, Any]]] = None
    priority: Optional[int] = None

class JobOrder(JobOrderBase):
    job_order_id: int
    model_name: Optional[str] = None
    client_name: Optional[str] = None
    items: List[JobOrderItem] = []
    total_working_quantity: Optional[int] = None
    batches: Optional[List[Dict[str, str]]] = None
    image_url: Optional[str] = None
    date_created: Optional[datetime] = None

    class Config:
        from_attributes = True

# Job Order Material schemas
class JobOrderMaterialCreateWithName(BaseModel):
    material_name: str
    quantity: float
    color_name: Optional[str] = None
    notes: Optional[str] = None
    consumption: Optional[float] = None

class JobOrderMaterialBase(BaseModel):
    material_id: int
    color_id: Optional[int] = None
    quantity: float
    consumption: Optional[float] = None

class JobOrderMaterialCreate(JobOrderMaterialBase):
    pass

class JobOrderMaterial(JobOrderMaterialBase):
    id: int
    job_order_id: int
    material_name: Optional[str] = None
    color_name: Optional[str] = None

    class Config:
        from_attributes = True

# ============================================================================
# OPERATIONS SCHEMA MODELS
# ============================================================================

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
    current_phase: int
    status: str
    is_second_degree: bool = True

class QuantityDecrementType(str, Enum):
    REJECTION = "rejection"
    SECOND_DEGREE = "second_degree"
    LOST = "lost"

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
    deduction_to_phase: Optional[int] = None
    deduction_reason: Optional[str] = None
    quantity_decrement_type: Optional[QuantityDecrementType] = None
    quantity_decrement_reason: Optional[str] = None
    quantity_decrement_phase_id: Optional[int] = None
    quantity_decrement_worker_id: Optional[int] = None
    quantity_decrement_stage_name: Optional[str] = None

class BatchResponse(BatchBase):
    batch_id: int
    job_order_number: Optional[str] = None
    size_value: str
    color_name: str
    phase_name: str
    last_updated: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    client_name: Optional[str] = None  # Renamed from brand_name
    model_name: Optional[str] = None

    class Config:
        from_attributes = True

class BatchListResponse(BaseModel):
    items: List[BatchResponse]
    total: int

class BatchCompensationCreate(BaseModel):
    item_id: int
    phase_id: int
    quantity: int
    notes: Optional[str] = None

class BatchCompensationRequest(BaseModel):
    job_order_id: int
    compensations: List[BatchCompensationCreate]


class ReworkBatchCreate(BaseModel):
    source_batch_id: int
    problem_stage_name: str


class ReworkBatchUpdate(BaseModel):
    printed: Optional[bool] = None


class ReworkBatchResponse(BaseModel):
    rework_batch_id: int
    batch_id: int
    barcode: Optional[str] = None
    source_batch_id: Optional[int] = None
    job_order_id: Optional[int] = None
    problem_stage_name: str
    responsible_phase_id: Optional[int] = None
    printed: bool
    created_at: datetime
    created_by_user_id: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def from_rework_orm(cls, data: Any):
        if isinstance(data, dict):
            return data
        rb = data
        b = getattr(rb, "batch", None)
        return {
            "rework_batch_id": rb.rework_batch_id,
            "batch_id": rb.batch_id,
            "barcode": getattr(rb, "barcode", None),
            "source_batch_id": None,
            "job_order_id": b.job_order_id if b is not None else None,
            "problem_stage_name": rb.problem_stage_name,
            "responsible_phase_id": getattr(rb, "responsible_phase_id", None),
            "printed": rb.printed,
            "created_at": rb.created_at,
            "created_by_user_id": rb.created_by_user_id,
        }

    class Config:
        from_attributes = True

class RejectionResolutionType(str, Enum):
    REWORKED = "reworked"
    SCRAPPED = "scrapped"
    CANCELLED = "cancelled"
    INVALID = "invalid"

class SingleRejectionBase(BaseModel):
    batch_id: int
    rejected_from_phase_id: int
    return_to_phase_id: Optional[int] = None
    new_batch_id: Optional[int] = None
    worker_id: Optional[int] = None
    quantity: int = Field(default=1, gt=0)
    rejection_reason: Optional[str] = None

class SingleRejectionCreate(SingleRejectionBase):
    pass

class SingleRejectionUpdate(BaseModel):
    return_to_phase_id: Optional[int] = None
    rejection_reason: Optional[str] = None
    is_resolved: Optional[bool] = None
    new_batch_id: Optional[int] = None
    worker_id: Optional[int] = None

class SingleRejection(SingleRejectionBase):
    rejection_id: int
    job_order_id: int
    color_id: int
    size_id: int
    rejected_from_phase_type: str
    rejected_by_user_id: Optional[int] = None
    rejected_at: datetime
    status_at_rejection: Optional[str] = None
    is_resolved: bool
    resolved_at: Optional[datetime] = None

    @model_validator(mode="before")
    @classmethod
    def extract_batch_fields(cls, data: Any):
        if isinstance(data, dict):
            return data
        if hasattr(data, 'batch') and data.batch:
            data_dict = {
                'rejection_id': data.rejection_id,
                'batch_id': data.batch_id,
                'rejected_from_phase_id': data.rejected_from_phase_id,
                'rejected_from_phase_type': data.rejected_from_phase_type,
                'return_to_phase_id': data.return_to_phase_id,
                'new_batch_id': getattr(data, 'new_batch_id', None),
                'worker_id': getattr(data, 'worker_id', None),
                'quantity': data.quantity,
                'rejection_reason': data.rejection_reason,
                'rejected_by_user_id': data.rejected_by_user_id,
                'rejected_at': data.rejected_at,
                'status_at_rejection': data.status_at_rejection,
                'is_resolved': data.is_resolved,
                'resolved_at': data.resolved_at,
                'job_order_id': data.batch.job_order_id,
                'color_id': data.batch.color_id,
                'size_id': data.batch.size_id,
            }
            return data_dict
        return data

    class Config:
        from_attributes = True

class BulkBarcodeProcess(BaseModel):
    client: str  # Renamed from brand
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

# Barcode Scan Event schemas
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

class BarcodeScanEventCreate(BarcodeScanEventBase):
    pass

class BarcodeScanEventResponse(BarcodeScanEventBase):
    id: int
    phase_name: Optional[str] = None
    user_name: Optional[str] = None

    class Config:
        from_attributes = True

# ============================================================================
# ARCHIVE SCHEMA MODELS
# ============================================================================

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
    last_updated: Optional[datetime] = None
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
    client_id: Optional[int] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None
    print_config: Optional[JobOrderPrintConfig] = None
    date_created: datetime
    archived_at: Optional[datetime] = None

class ArchivedJobOrderCreate(ArchivedJobOrderBase):
    pass

class ArchivedJobOrderResponse(ArchivedJobOrderBase):
    job_order_id: int
    model_name: Optional[str] = None
    client_name: Optional[str] = None

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

# ============================================================================
# REPORTING SCHEMA MODELS
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
    cut_inspection_qty: int
    second_degree_cut_qty: int
    sewing_in_qty: int
    sewing_out_qty: int
    qc_in_qty: int
    qc_out_qty: int
    packaging_in_qty: int
    packaging_out_qty: int
    second_degree_quantity: int
    completed_quantity: int
    working_quantity: int
    remaining_quantity: int
    lost_qty: int
    total_batches: int
    has_issues: bool
    completion_percentage: float
    overproduction_quantity: int
    production_status: str
    notes: Optional[str] = None
    true_consumption: Optional[float] = None
    last_calculated_at: Optional[datetime] = None
    last_quantity_change: Optional[datetime] = None
    last_completion_change: Optional[datetime] = None
    last_new_batch: Optional[datetime] = None
    last_batch_update: Optional[datetime] = None

    class Config:
        from_attributes = True

class JobOrderSummary(BaseModel):
    job_order_id: int
    job_order_number: str
    model_name: Optional[str] = None
    client_name: Optional[str] = None  # Renamed from brand_name
    total_items: int
    total_expected_quantity: int
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
    priority: Optional[int] = 0
    last_calculated_at: Optional[datetime] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True

# ============================================================================
# STATISTICS AND ANALYTICS SCHEMAS
# ============================================================================

class BatchStats(BaseModel):
    total_batches: int
    in_production: int
    completed: int

class PackagingStats(BaseModel):
    completed: int
    pending: int
    in_progress: int

class PhaseStatusStats(BaseModel):
    pending: int
    in_progress: int

class QCStats(BaseModel):
    pending: int
    in_progress: int
    completed: int

class PhaseStats(BaseModel):
    cutting: PhaseStatusStats
    sewing: PhaseStatusStats
    packaging: PackagingStats
    qc: QCStats

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

# Advanced Statistics schemas
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

class WIPByClientStat(BaseModel):  # Renamed from WIPByBrandStat
    client_id: int
    client_name: str
    pending: int
    in_progress: int
    completed: int
    total: int

    class Config:
        from_attributes = True

class WorkingPhaseByClientStat(BaseModel):  # Renamed from WorkingPhaseByBrandStat
    client_id: int
    client_name: str
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
    client_id: int
    client_name: str  # Renamed from brand_name
    phase_id: int
    phase_name: str
    pending: int
    in_progress: int
    completed: int
    total: int

    class Config:
        from_attributes = True

class AttributeCompletionTimeStat(BaseModel):
    attribute: str  # e.g., 'client', 'model', etc.
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
    wip_by_client: List[WIPByClientStat]  # Renamed from wip_by_brand
    working_phase_by_client: List[WorkingPhaseByClientStat]  # Renamed from working_phase_by_brand
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


class SchematicWorkRangeStat(BaseModel):
    """Per-schematic expected and true work over a date range."""
    schematic_id: int
    schematic_name: str
    expected_quantity: int
    expected_hourly_work: float
    true_quantity: int
    true_hourly_work: float
    efficiency_pct: Optional[float] = None


class PhaseSchematicWorkRangeResponse(BaseModel):
    """Per-phase wrapper for schematic work range statistics."""
    phase_id: int
    date_from: date
    date_to: date
    schematics: List[SchematicWorkRangeStat]


class SchematicWorkerDayRecord(BaseModel):
    """Per-worker, per-stage, per-day production record within a schematic."""
    worker_id: int
    worker_name: str
    stage_id: int
    stage_name: str
    stage_order: int
    work_date: date
    expected_output: int
    true_output: int
    efficiency_pct: Optional[float] = None


class SchematicWorkerAggregate(BaseModel):
    """Aggregate expected/true output and efficiency per worker."""
    worker_id: int
    worker_name: str
    total_expected_output: int
    total_true_output: int
    efficiency_pct: Optional[float] = None


class SchematicWorkerBreakdownResponse(BaseModel):
    """Worker-level breakdown for a schematic over a date range."""
    schematic_id: int
    date_from: date
    date_to: date
    records: List[SchematicWorkerDayRecord]
    aggregates: List[SchematicWorkerAggregate]


class WorkerProductionRecord(BaseModel):
    """Per-worker, per-phase, per-schematic, per-day production record (all-workers view)."""
    worker_id: int
    worker_name: str
    phase_id: int
    phase_name: str
    schematic_id: int
    schematic_name: str
    work_date: date
    expected_output: int
    true_output: int
    working_hours: float
    overtime_hours: float
    efficiency_pct: Optional[float] = None


class WorkerProductionAggregate(BaseModel):
    """Aggregate expected/true output and efficiency per worker across all phases/schematics."""
    worker_id: int
    worker_name: str
    total_expected_output: int
    total_true_output: int
    total_working_hours: float
    total_overtime_hours: float
    efficiency_pct: Optional[float] = None


class AllWorkersProductionBreakdownResponse(BaseModel):
    """All-workers production breakdown over a date range (phase/schematic agnostic)."""
    date_from: date
    date_to: date
    records: List[WorkerProductionRecord]
    aggregates: List[WorkerProductionAggregate]


class SchematicDailyProductionRecord(BaseModel):
    """Daily expected/true output for a schematic (final stage(s) only)."""
    phase_id: int
    phase_name: str
    schematic_id: int
    schematic_name: str
    work_date: date
    expected_output: int
    true_output: int


# Response models for item-level endpoints
class JobOrderItemSummaryListResponse(BaseModel):
    items: List[JobOrderItemSummary]
    total: int

class JobOrderItemWithIssuesListResponse(BaseModel):
    items: List[Dict[str, Any]]  # Simplified for now
    total: int

class JobOrderItemHighSecondDegreeListResponse(BaseModel):
    items: List[Dict[str, Any]]  # Simplified for now
    total: int

class JobOrderItemWithQuantityReductionsListResponse(BaseModel):
    items: List[Dict[str, Any]]  # Simplified for now
    total: int

class JobOrderItemQuantityBreakdownListResponse(BaseModel):
    items: List[Dict[str, Any]]  # Simplified for now
    total: int

# Job Order Item Batch Details schema
class JobOrderItemBatchDetails(BaseModel):
    item_id: int
    job_order_id: int
    job_order_number: str
    model_name: str
    color_name: str
    size_value: str
    expected_quantity: int
    current_quantity: int
    batches: List[Dict[str, Any]]
    total_batches: int
    completion_percentage: float

    class Config:
        from_attributes = True

# Model History schemas
class ModelHistoryEntry(BaseModel):
    model_name: str
    color_name: str
    size_value: str
    job_order_number: str
    phase_name: str
    entry_time: str
    exit_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: str
    quantity: int

class ModelHistorySizeData(BaseModel):
    size_value: str
    item_id: int
    entries: List[ModelHistoryEntry]
    total_duration_minutes: int
    entry_count: int

class ModelHistoryGroup(BaseModel):
    job_order_number: str
    color_name: str
    model_name: str
    total_entries: int
    total_duration_minutes: int
    sizes: Dict[str, ModelHistorySizeData]

class ModelHistoryResponse(BaseModel):
    job_order_color_groups: Dict[str, ModelHistoryGroup]

class ProductionStatisticsResponse(BaseModel):
    wip_by_phase: List[Dict[str, Any]]
    production_by_client: List[Dict[str, Any]]  # Renamed from production_by_brand
    production_by_model: List[Dict[str, Any]]
    recent_activity: List[Dict[str, Any]]
    bottlenecks: List[Dict[str, Any]]
    overall_stats: Dict[str, Any]
    second_degree_stats: Dict[str, Any]

    class Config:
        from_attributes = True

class ClientStatisticsResponse(BaseModel):  # Renamed from BrandStatisticsResponse
    client_info: Dict[str, Any]  # Renamed from brand_info
    phases: List[Dict[str, Any]]
    models: List[Dict[str, Any]]

    class Config:
        from_attributes = True

class ModelStatisticsResponse(BaseModel):
    model_info: Dict[str, Any]
    phases: List[Dict[str, Any]]

    class Config:
        from_attributes = True

class JobOrderItemProductionTracking(BaseModel):
    item_id: int
    job_order_id: int
    phase_id: int
    phase_name: str
    status: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class ItemLevelStatistics(BaseModel):
    total_items: int
    completed_items: int
    in_progress_items: int
    pending_items: int
    completion_rate: float
    average_processing_time: Optional[float] = None
    items_by_phase: List[Dict[str, Any]]

    class Config:
        from_attributes = True

class CutSizeDetail(BaseModel):
    size_id: int
    size_value: str
    item_id: int
    total_pieces: int
    ratio: Optional[float] = None  # Ratio (pieces per layer) for this size

    class Config:
        from_attributes = True

class CutRoll(BaseModel):
    roll_id: int
    cut_id: int
    roll_number: int
    weight: float
    layer_weight: float
    num_of_layers: int
    roll_width: Optional[float] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class CutSizeTransition(BaseModel):
    transition_id: int
    cut_id: int
    from_item_id: int
    to_item_id: int
    from_size_id: int
    from_size_value: str
    to_size_id: int
    to_size_value: str
    quantity: int
    notes: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class CutDetailsResponse(BaseModel):
    cut_id: int
    job_order_id: int
    job_order_number: str
    model_id: int
    model_name: str
    color_id: int
    color_name: str
    waste_fabric_weight: Optional[float] = None
    marker_length: Optional[float] = None
    created_at: Optional[str] = None
    cut_weight: float
    num_of_rolls_used: int
    total_layers: int
    created_by_user_id: Optional[int] = None
    notes: Optional[str] = None
    job_order_items_ratios: Optional[Dict[str, float]] = None  # JSONB ratios: {"item_id": ratio}
    print_status: Optional[CutPrintStatus] = None
    requires_printing: bool = False
    job_order_print_config: Optional[Dict[str, Any]] = None
    sizes: List[CutSizeDetail]
    rolls: List[CutRoll] = []
    transitions: List[CutSizeTransition] = []

    class Config:
        from_attributes = True

class CutDetailsListResponse(BaseModel):
    cuts: List[CutDetailsResponse]
    total: int
    page: int
    limit: int
    total_pages: int

    class Config:
        from_attributes = True

class CutRollCreate(BaseModel):
    roll_number: int
    weight: float
    layer_weight: float
    num_of_layers: int
    roll_width: Optional[float] = None

class CutSizeTransitionCreate(BaseModel):
    from_item_id: int
    to_item_id: int
    quantity: int
    notes: Optional[str] = None

class CutCreate(BaseModel):
    job_order_id: int
    color_id: int
    job_order_items_ratios: Dict[str, float]  # {"item_id": ratio}
    waste_fabric_weight: Optional[float] = None
    marker_length: Optional[float] = None
    notes: Optional[str] = None
    rolls: Optional[List[CutRollCreate]] = []
    transitions: Optional[List[CutSizeTransitionCreate]] = []
    print_status: Optional[CutPrintStatus] = None


class CutUpdate(BaseModel):
    job_order_id: Optional[int] = None
    color_id: Optional[int] = None
    job_order_items_ratios: Optional[Dict[str, float]] = None
    waste_fabric_weight: Optional[float] = None
    marker_length: Optional[float] = None
    notes: Optional[str] = None
    rolls: Optional[List[CutRollCreate]] = None
    transitions: Optional[List[CutSizeTransitionCreate]] = None
    print_status: Optional[CutPrintStatus] = None


class CutListItem(BaseModel):
    cut_number: str
    cut_id: int
    color: str
    color_id: int

    class Config:
        from_attributes = True


class BatchGenerateRequest(BaseModel):
    job_order_id: int
    cut_number: str
    mode: Optional[str] = "auto"
    quantity_per_batch: Optional[Dict[str, int]] = None
    extra_pieces_threshold: Optional[int] = 5
    max_batch_size: Optional[int] = None


class GeneratedBatch(BaseModel):
    batch: int
    size: str
    quantity: int
    barcode: str
    size_id: Optional[int] = None
    serial_number: Optional[int] = None
    layers: Optional[int] = None

class BatchSubmitRequest(BaseModel):
    batches: List[GeneratedBatch]
    job_order_id: int
    color_id: int