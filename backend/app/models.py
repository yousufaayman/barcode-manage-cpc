from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Date, Enum, UniqueConstraint, DECIMAL, TIMESTAMP, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import enum

Base = declarative_base()

class UserRoleEnum(str, enum.Enum):
    ADMIN = "admin"
    GENERAL_OPERATIONS = "general_operations"
    CUTTING = "cutting"
    SEWING = "sewing"
    PACKAGING = "packaging"

# ============================================================================
# CORE SCHEMA MODELS
# ============================================================================

class Client(Base):
    """Core.clients - Renamed from brands for clarity"""
    __tablename__ = "clients"
    __table_args__ = {'schema': 'core'}

    client_id = Column(Integer, primary_key=True, index=True)
    client_name = Column(String(255), unique=True, index=True, nullable=False)

    # Relationships
    job_orders = relationship("JobOrder", back_populates="client")

class Color(Base):
    """Core.colors - Reference data for colors"""
    __tablename__ = "colors"
    __table_args__ = {'schema': 'core'}

    color_id = Column(Integer, primary_key=True, index=True)
    color_name = Column(String(100), unique=True, index=True, nullable=False)

    # Relationships
    batches = relationship("Batch", back_populates="color")
    job_order_items = relationship("JobOrderItem", back_populates="color")
    job_order_materials = relationship("JobOrderMaterial", back_populates="color")

class Size(Base):
    """Core.sizes - Reference data for sizes"""
    __tablename__ = "sizes"
    __table_args__ = {'schema': 'core'}

    size_id = Column(Integer, primary_key=True, index=True)
    size_value = Column(String(50), unique=True, index=True, nullable=False)

    # Relationships
    batches = relationship("Batch", back_populates="size")
    job_order_items = relationship("JobOrderItem", back_populates="size")

class Model(Base):
    """Core.models - Reference data for models"""
    __tablename__ = "models"
    __table_args__ = {'schema': 'core'}

    model_id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(255), unique=True, index=True, nullable=False)

    # Relationships
    job_orders = relationship("JobOrder", back_populates="model")

class Material(Base):
    """Core.materials - Reference data for materials"""
    __tablename__ = "materials"
    __table_args__ = {'schema': 'core'}

    material_id = Column(Integer, primary_key=True, index=True)
    material_name = Column(String(100), unique=True, index=True, nullable=False)

    # Relationships
    job_order_materials = relationship("JobOrderMaterial", back_populates="material")

class System(Base):
    """Core.systems - System definitions for role-based access"""
    __tablename__ = "systems"
    __table_args__ = {'schema': 'core'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False)

    # Relationships
    user_roles = relationship("UserRole", back_populates="system")

    def __repr__(self):
        return f"<System {self.name}>"

class UserRole(Base):
    """Core.user_roles - User role assignments per system"""
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint('user_id', 'system_id', name='user_roles_user_id_system_id_key'),
        {'schema': 'core'}
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("core.users.id", ondelete="CASCADE"), nullable=False)
    system_id = Column(Integer, ForeignKey("core.systems.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(UserRoleEnum, values_callable=lambda x: [e.value for e in UserRoleEnum]), nullable=False)

    # Relationships
    user = relationship("User", back_populates="user_roles")
    system = relationship("System", back_populates="user_roles")

    def __repr__(self):
        return f"<UserRole user_id={self.user_id} system_id={self.system_id} role={self.role}>"

class User(Base):
    """Core.users - Enhanced with role system"""
    __tablename__ = "users"
    __table_args__ = {'schema': 'core'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    # Remove the old role column as roles are now managed through user_roles table
    # role = Column(Enum(UserRole, values_callable=lambda x: [e.value for e in UserRole]), nullable=False, default=UserRole.CUTTING)

    # Relationships
    user_roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User {self.username}>"

class ProductionPhase(Base):
    """Core.production_phases - Moved from ops schema, enhanced with sequence_order"""
    __tablename__ = "production_phases"
    __table_args__ = {'schema': 'core'}

    phase_id = Column(Integer, primary_key=True, index=True)
    phase_name = Column(String(100), unique=True, index=True, nullable=False)
    type = Column(String(50), nullable=True)  # e.g., 'cutting', 'sewing', 'packaging'
    sequence_order = Column(Integer, nullable=True)  # For ordering phases

    # Relationships
    batches = relationship("Batch", back_populates="phase")
    barcode_scan_events = relationship("BarcodeScanEvent", back_populates="phase")
    sewing_line_schematics = relationship("SewingLineSchematic", back_populates="phase")

class Worker(Base):
    """Core.workers - Workers for sewing line assignments"""
    __tablename__ = "workers"
    __table_args__ = {'schema': 'core'}

    worker_id = Column(Integer, primary_key=True, index=True)
    worker_name = Column(String(255), nullable=False)
    worker_group_id = Column(
        Integer,
        ForeignKey("core.workers_groups.group_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    active = Column(Boolean, nullable=False, default=True, server_default='true')

    # Relationships
    daily_assignments = relationship(
        "WorkerDailyStageAssignment",
        back_populates="worker",
        foreign_keys="WorkerDailyStageAssignment.worker_id",
    )
    worker_group = relationship("WorkersGroup", back_populates="workers")


class WorkersGroup(Base):
    """Core.workers_groups - Groups of workers with default working hours"""
    __tablename__ = "workers_groups"
    __table_args__ = {'schema': 'core'}

    group_id = Column(Integer, primary_key=True, index=True)
    group_name = Column(String(255), unique=True, nullable=False, index=True)
    # Hours per day for this group (e.g. 8.00, 8.50)
    working_hours = Column(DECIMAL(4, 2), nullable=True)

    workers = relationship("Worker", back_populates="worker_group")

class SewingLineSchematic(Base):
    """Core.sewing_line_schematics - Line configuration per production phase (e.g. sewing 1, 2, 3)"""
    __tablename__ = "sewing_line_schematics"
    __table_args__ = {'schema': 'core'}

    schematic_id = Column(Integer, primary_key=True, index=True)
    production_phase_id = Column(Integer, ForeignKey("core.production_phases.phase_id", ondelete="RESTRICT"), nullable=False)
    name = Column(String(255), nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default='true')
    working_hours = Column(DECIMAL(4, 2), nullable=True)  # e.g. 8.00, 8.50 hours per day
    hourly_production = Column(Integer, nullable=True)  # Total hourly production (line capacity) from production management

    # Relationships
    phase = relationship("ProductionPhase", back_populates="sewing_line_schematics")
    stages = relationship("SewingLineStage", back_populates="schematic", cascade="all, delete-orphan")

class SewingLineStage(Base):
    """Core.sewing_line_stages - Operation stages within a schematic; stage_order for sequence"""
    __tablename__ = "sewing_line_stages"
    __table_args__ = {'schema': 'core'}

    stage_id = Column(Integer, primary_key=True, index=True)
    schematic_id = Column(Integer, ForeignKey("core.sewing_line_schematics.schematic_id", ondelete="CASCADE"), nullable=False)
    stage_name = Column(String(255), nullable=False)
    stage_order = Column(Integer, nullable=False)
    production_qty = Column(Integer, nullable=True)
    is_in_final_stage = Column(Boolean, nullable=False, default=False, server_default='false')
    active = Column(Boolean, nullable=False, default=True, server_default='true')

    # Relationships
    schematic = relationship("SewingLineSchematic", back_populates="stages")
    daily_assignments = relationship("WorkerDailyStageAssignment", back_populates="stage")

class JobOrder(Base):
    """Core.job_orders - Enhanced with print_config JSONB field"""
    __tablename__ = "job_orders"
    __table_args__ = {'schema': 'core'}

    job_order_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey("core.models.model_id", ondelete="RESTRICT"), nullable=False)
    job_order_number = Column(String(100), unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("core.clients.client_id", ondelete="RESTRICT"), nullable=True)
    image_url = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    print_config = Column(JSONB, nullable=True)  # Replaces job_order_prints table
    date_created = Column(DateTime, server_default=func.now(), nullable=False)
    priority = Column(Integer, nullable=True, default=0)

    # Relationships
    model = relationship("Model", back_populates="job_orders")
    client = relationship("Client", back_populates="job_orders")
    items = relationship("JobOrderItem", back_populates="job_order", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="job_order")
    materials = relationship("JobOrderMaterial", back_populates="job_order", cascade="all, delete-orphan")
    item_summaries = relationship("JobOrderItemSummary", back_populates="job_order", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<JobOrder {self.job_order_number}>"

class JobOrderItem(Base):
    """Core.job_order_items - Direct mapping from MySQL"""
    __tablename__ = "job_order_items"
    __table_args__ = (
        UniqueConstraint('job_order_id', 'color_id', 'size_id', name='job_order_color_size_unique'),
        {'schema': 'core'}
    )

    item_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_order_id = Column(Integer, ForeignKey("core.job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    color_id = Column(Integer, ForeignKey("core.colors.color_id", ondelete="RESTRICT"), nullable=False)
    size_id = Column(Integer, ForeignKey("core.sizes.size_id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Integer, nullable=False)
    weight = Column(DECIMAL(10,2), nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    job_order = relationship("JobOrder", back_populates="items")
    color = relationship("Color", back_populates="job_order_items")
    size = relationship("Size", back_populates="job_order_items")
    summary = relationship("JobOrderItemSummary", back_populates="item")

    def __repr__(self):
        return f"<JobOrderItem {self.job_order_id}:{self.color_id}:{self.size_id} x{self.quantity} w{self.weight}>"

class JobOrderMaterial(Base):
    """Core.job_order_materials - Direct mapping from MySQL"""
    __tablename__ = "job_order_materials"
    __table_args__ = (
        UniqueConstraint('job_order_id', 'material_id', 'color_id', name='uq_job_material'),
        {'schema': 'core'}
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_order_id = Column(Integer, ForeignKey("core.job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    material_id = Column(Integer, ForeignKey("core.materials.material_id", ondelete="RESTRICT"), nullable=False)
    color_id = Column(Integer, ForeignKey("core.colors.color_id", ondelete="RESTRICT"), nullable=True)
    quantity = Column(DECIMAL(10, 3), nullable=False)
    consumption = Column(DECIMAL(10, 3), nullable=True)

    # Relationships
    job_order = relationship("JobOrder", back_populates="materials")
    material = relationship("Material", back_populates="job_order_materials")
    color = relationship("Color", back_populates="job_order_materials")

    def __repr__(self):
        return f"<JobOrderMaterial JO:{self.job_order_id} Mat:{self.material_id} Qty:{self.quantity}>"

# ============================================================================
# OPERATIONS SCHEMA MODELS
# ============================================================================

class Batch(Base):
    """Ops.batches - Enhanced with better indexing"""
    __tablename__ = "batches"
    __table_args__ = {'schema': 'ops'}

    batch_id = Column(Integer, primary_key=True, index=True)
    job_order_id = Column(Integer, ForeignKey("core.job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    barcode = Column(String(255), unique=True, index=True, nullable=False)
    size_id = Column(Integer, ForeignKey("core.sizes.size_id", ondelete="RESTRICT"), nullable=True)
    color_id = Column(Integer, ForeignKey("core.colors.color_id", ondelete="RESTRICT"), nullable=True)
    quantity = Column(Integer, nullable=True)
    layers = Column(Integer, nullable=True)
    serial = Column(String(3), nullable=False)
    current_phase = Column(Integer, ForeignKey("core.production_phases.phase_id", ondelete="RESTRICT"), nullable=True)
    status = Column(String(50), nullable=True)
    last_updated = Column(DateTime, server_default=func.now(), nullable=True)
    is_second_degree = Column(Boolean, nullable=False, default=False, server_default='false')

    # Relationships
    size = relationship("Size", back_populates="batches")
    color = relationship("Color", back_populates="batches")
    phase = relationship("ProductionPhase", back_populates="batches")
    job_order = relationship("JobOrder", back_populates="batches")
    barcode_scan_events = relationship("BarcodeScanEvent", back_populates="batch")
    phase_quantity_ledger = relationship("PhaseQuantityLedger", back_populates="batch")
    phase_history = relationship("BatchPhaseHistory", back_populates="batch", cascade="all, delete-orphan")
    production_history = relationship("ProductionHistory", back_populates="batch")
    rework_batch_record = relationship(
        "ReworkBatch",
        foreign_keys="ReworkBatch.batch_id",
        uselist=False,
        cascade="all, delete-orphan",
    )

class BarcodeScanEvent(Base):
    """Ops.barcode_scan_events"""
    __tablename__ = "barcode_scan_events"
    __table_args__ = {'schema': 'ops'}
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("ops.batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String(50), nullable=False, index=True)  # 'scan_in', 'scan_out', 'quantity_update', 'status_change', 'phase_change'
    phase_id = Column(Integer, ForeignKey("core.production_phases.phase_id", ondelete="RESTRICT"), nullable=False)
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    old_quantity = Column(Integer, nullable=True)
    new_quantity = Column(Integer, nullable=True)
    old_phase = Column(Integer, nullable=True)
    new_phase = Column(Integer, nullable=True)
    scanned_at = Column(DateTime, nullable=False, default=func.now(), index=True)
    user_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    
    affects_phase_type = Column(String(50), nullable=True, index=True)
    quantity_delta = Column(Integer, nullable=True)
    is_reversal = Column(Boolean, nullable=True, default=False, index=True)
    reversed_event_id = Column(Integer, ForeignKey("ops.barcode_scan_events.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Relationships
    batch = relationship("Batch", back_populates="barcode_scan_events")
    phase = relationship("ProductionPhase", back_populates="barcode_scan_events")
    user = relationship("User")
    reversed_event = relationship("BarcodeScanEvent", remote_side=[id], foreign_keys=[reversed_event_id])
    ledger_entries = relationship("PhaseQuantityLedger", back_populates="scan_event")
    
    def __repr__(self):
        return f"<BarcodeScanEvent {self.batch_id}:{self.action_type}:{self.scanned_at}>"

class PhaseQuantityLedger(Base):
    """Ops.phase_quantity_ledger - Append-only ledger for phase quantity deltas"""
    __tablename__ = "phase_quantity_ledger"
    __table_args__ = {'schema': 'ops'}
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("ops.batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    scan_event_id = Column(Integer, ForeignKey("ops.barcode_scan_events.id", ondelete="CASCADE"), nullable=False, index=True)
    affects_phase_type = Column(String(50), nullable=False, index=True)
    quantity_delta = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=func.now(), index=True)
    
    # Relationships
    batch = relationship("Batch")
    scan_event = relationship("BarcodeScanEvent", back_populates="ledger_entries")
    
    def __repr__(self):
        return f"<PhaseQuantityLedger batch:{self.batch_id} phase:{self.affects_phase_type} delta:{self.quantity_delta}>"

class BatchCompensation(Base):
    """Ops.batch_compensations - Tracks batches created to compensate for lost physical barcodes"""
    __tablename__ = "batch_compensations"
    __table_args__ = {'schema': 'ops'}

    compensation_id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("ops.batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("core.job_order_items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    phase_id = Column(Integer, ForeignKey("core.production_phases.phase_id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)

    batch = relationship("Batch")
    item = relationship("JobOrderItem")
    phase = relationship("ProductionPhase")
    user = relationship("User")

    def __repr__(self):
        return f"<BatchCompensation {self.compensation_id}: Batch {self.batch_id}, Item {self.item_id}, Phase {self.phase_id}, Qty {self.quantity}>"


class ReworkBatch(Base):
    """Ops.rework_batches - Metadata row for a rework operational batch (ops.batches.batch_id)."""
    __tablename__ = "rework_batches"
    __table_args__ = {"schema": "ops"}

    rework_batch_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    batch_id = Column(
        Integer,
        ForeignKey("ops.batches.batch_id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    problem_stage_name = Column(String(255), nullable=False, index=True)
    responsible_phase_id = Column(
        Integer,
        ForeignKey("core.production_phases.phase_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    printed = Column(Boolean, nullable=False, default=False, server_default="false")

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("core.users.id", ondelete="SET NULL"), nullable=True, index=True)

    batch = relationship("Batch", foreign_keys=[batch_id], back_populates="rework_batch_record")
    responsible_phase = relationship("ProductionPhase", foreign_keys=[responsible_phase_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    rejections = relationship(
        "SingleRejection",
        back_populates="rework_batch",
        primaryjoin="ReworkBatch.batch_id == SingleRejection.new_batch_id",
        foreign_keys="SingleRejection.new_batch_id",
    )

    def __repr__(self):
        return f"<ReworkBatch {self.rework_batch_id}: batch_id={self.batch_id} problem_stage={self.problem_stage_name}>"

    @property
    def barcode(self):
        return self.batch.barcode if self.batch else None

class SingleRejection(Base):
    """Ops.single_rejections - Tracks individual piece rejections that move items back between phases"""
    __tablename__ = "single_rejections"
    __table_args__ = {'schema': 'ops'}

    rejection_id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("ops.batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    rejected_from_phase_id = Column(Integer, ForeignKey("core.production_phases.phase_id", ondelete="RESTRICT"), nullable=False, index=True)
    rejected_from_phase_type = Column(String(50), nullable=False, index=True)
    return_to_phase_id = Column(Integer, ForeignKey("core.production_phases.phase_id", ondelete="RESTRICT"), nullable=True, index=True)
    new_batch_id = Column(
        Integer,
        ForeignKey("ops.batches.batch_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    worker_id = Column(
        Integer,
        ForeignKey("core.workers.worker_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    quantity = Column(Integer, nullable=False, default=1)
    rejection_reason = Column(Text, nullable=True)
    rejected_by_user_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)
    rejected_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)
    status_at_rejection = Column(String(50), nullable=True, index=True)
    is_resolved = Column(Boolean, nullable=False, default=False)
    resolved_at = Column(DateTime, nullable=True)

    batch = relationship("Batch", foreign_keys=[batch_id])
    rejected_from_phase = relationship("ProductionPhase", foreign_keys=[rejected_from_phase_id])
    return_to_phase = relationship("ProductionPhase", foreign_keys=[return_to_phase_id])
    rework_batch = relationship(
        "ReworkBatch",
        primaryjoin="SingleRejection.new_batch_id == ReworkBatch.batch_id",
        foreign_keys=[new_batch_id],
        back_populates="rejections",
    )
    worker = relationship("Worker", foreign_keys=[worker_id])
    user = relationship("User")

    def __repr__(self):
        return f"<SingleRejection {self.rejection_id}: Batch {self.batch_id}, From Phase {self.rejected_from_phase_id}, Qty {self.quantity}>"

class BatchPhaseHistory(Base):
    """Ops.batch_phase_history - Tracks detailed phase history per batch with one entry per batch"""
    __tablename__ = "batch_phase_history"
    __table_args__ = (
        UniqueConstraint('batch_id', name='batch_phase_history_batch_unique'),
        {'schema': 'ops'}
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("ops.batches.batch_id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    inspection_qty = Column(Integer, default=0)
    sewing_in_qty = Column(Integer, default=0)
    sewing_out_qty = Column(Integer, default=0)
    qc_in_qty = Column(Integer, default=0)
    qc_out_qty = Column(Integer, default=0)
    packaging_in_qty = Column(Integer, default=0)
    packaging_out_qty = Column(Integer, default=0)
    current_phase_type = Column(String(50), nullable=True)  # Track current phase for reference
    quantity_at_phase = Column(Integer, default=0)
    status_at_phase = Column(String(50), nullable=True)
    compensation = Column(Boolean, nullable=False, default=False, server_default='false')
    entered_at = Column(DateTime, server_default=func.now(), nullable=False)
    last_updated = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    batch = relationship("Batch", back_populates="phase_history")

    def __repr__(self):
        return f"<BatchPhaseHistory batch:{self.batch_id} phase:{self.current_phase_type} qty:{self.quantity_at_phase}>"

class WorkerDailyStageAssignment(Base):
    """Ops.worker_daily_stage_assignments - Daily assignment of a worker to a stage"""
    __tablename__ = "worker_daily_stage_assignments"
    __table_args__ = {'schema': 'ops'}

    daily_assignment_id = Column(Integer, primary_key=True, index=True)
    assignment_date = Column(Date, nullable=False)
    worker_id = Column(Integer, ForeignKey("core.workers.worker_id", ondelete="CASCADE"), nullable=False)
    stage_id = Column(Integer, ForeignKey("core.sewing_line_stages.stage_id", ondelete="RESTRICT"), nullable=False)
    # Inherited from the parent schematic at record creation time (copy-on-create).
    # Backfilled for existing rows during DB initialization.
    working_hours = Column(DECIMAL(4, 2), nullable=True)  # e.g. 8.00 hours per day
    active = Column(Boolean, nullable=False, default=True, server_default='true')
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    worker = relationship(
        "Worker",
        back_populates="daily_assignments",
        foreign_keys=[worker_id],
    )
    stage = relationship("SewingLineStage", back_populates="daily_assignments")
    production_history_entries = relationship("ProductionHistory", back_populates="daily_assignment", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<WorkerDailyStageAssignment {self.daily_assignment_id}: worker={self.worker_id} stage={self.stage_id} date={self.assignment_date}>"

class ProductionHistory(Base):
    """Ops.production_history - Quantity produced per assignment per batch"""
    __tablename__ = "production_history"
    __table_args__ = {'schema': 'ops'}

    production_id = Column(Integer, primary_key=True, index=True)
    daily_assignment_id = Column(Integer, ForeignKey("ops.worker_daily_stage_assignments.daily_assignment_id", ondelete="CASCADE"), nullable=False)
    batch_id = Column(Integer, ForeignKey("ops.batches.batch_id", ondelete="CASCADE"), nullable=False)
    quantity_produced = Column(Integer, nullable=False)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    daily_assignment = relationship("WorkerDailyStageAssignment", back_populates="production_history_entries")
    batch = relationship("Batch", back_populates="production_history")

    def __repr__(self):
        return f"<ProductionHistory {self.production_id}: assignment={self.daily_assignment_id} batch={self.batch_id} qty={self.quantity_produced}>"


# ============================================================================
# OVERTIME MODELS (OPS)
# ============================================================================
class WorkerOvertimeRequest(Base):
    """ops.worker_overtime_requests - Pending/approved overtime requests for worker working_hours adjustments."""

    __tablename__ = "worker_overtime_requests"
    __table_args__ = {"schema": "ops"}

    request_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    phase_id = Column(Integer, ForeignKey("core.production_phases.phase_id", ondelete="RESTRICT"), nullable=False)
    schematic_id = Column(
        Integer,
        ForeignKey("core.sewing_line_schematics.schematic_id", ondelete="RESTRICT"),
        nullable=False,
    )
    work_date = Column(Date, nullable=False, index=True)

    overtime_hours = Column(DECIMAL(6, 2), nullable=False)
    # List of worker_ids encoded at request time (admins approve later).
    worker_ids = Column(JSONB, nullable=False)

    status = Column(String(20), nullable=False, default="pending", server_default="pending", index=True)
    requested_by_user_id = Column(Integer, ForeignKey("core.users.id"), nullable=False, index=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("core.users.id"), nullable=True, index=True)
    admin_comment = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    reviewed_at = Column(DateTime, nullable=True)


class WorkerOvertimeHistory(Base):
    """ops.worker_overtime_history - Append-only record for each applied overtime delta."""

    __tablename__ = "worker_overtime_history"
    __table_args__ = (
        UniqueConstraint("request_id", "worker_id", name="uq_worker_overtime_history_request_worker"),
        {"schema": "ops"},
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    request_id = Column(
        Integer,
        ForeignKey("ops.worker_overtime_requests.request_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    work_date = Column(Date, nullable=False, index=True)
    worker_id = Column(Integer, ForeignKey("core.workers.worker_id", ondelete="CASCADE"), nullable=False, index=True)

    # We apply overtime to exactly one "latest" assignment per worker, so we record the assignment + stage.
    daily_assignment_id = Column(
        Integer,
        ForeignKey("ops.worker_daily_stage_assignments.daily_assignment_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stage_id = Column(Integer, ForeignKey("core.sewing_line_stages.stage_id", ondelete="RESTRICT"), nullable=False)

    overtime_hours = Column(DECIMAL(6, 2), nullable=False)
    previous_working_hours = Column(DECIMAL(6, 2), nullable=False, server_default="0")
    new_working_hours = Column(DECIMAL(6, 2), nullable=False, server_default="0")

    applied_by_user_id = Column(Integer, ForeignKey("core.users.id"), nullable=False, index=True)
    applied_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

# ============================================================================
# ARCHIVE SCHEMA MODELS
# ============================================================================

class ArchivedBatch(Base):
    """Archive.batches - Enhanced structure for archived data"""
    __tablename__ = "batches"
    __table_args__ = {'schema': 'archive'}

    batch_id = Column(Integer, primary_key=True, index=True)
    job_order_id = Column(Integer, nullable=False)  # No foreign key for archived data
    barcode = Column(String(255), unique=True, index=True, nullable=False)
    size_id = Column(Integer, nullable=True)  # No foreign key for archived data
    color_id = Column(Integer, nullable=True)  # No foreign key for archived data
    quantity = Column(Integer, nullable=True)
    layers = Column(Integer, nullable=True)
    serial = Column(String(3), nullable=False)
    current_phase = Column(Integer, nullable=True)  # No foreign key for archived data
    status = Column(String(50), nullable=True)
    last_updated = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)
    is_second_degree = Column(Boolean, nullable=False, default=False, server_default='false')
    notes = Column(Text, nullable=True)

class ArchivedJobOrder(Base):
    """Archive.job_orders - Enhanced structure for archived data"""
    __tablename__ = "job_orders"
    __table_args__ = {'schema': 'archive'}

    job_order_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    model_id = Column(Integer, nullable=False)  # No foreign key for archived data
    job_order_number = Column(String(100), unique=True, nullable=False, index=True)
    client_id = Column(Integer, nullable=True)  # No foreign key for archived data
    image_url = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    print_config = Column(JSONB, nullable=True)  # Preserve print configuration
    date_created = Column(DateTime, nullable=False)
    priority = Column(Integer, nullable=True, default=0)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)

class ArchivedJobOrderItem(Base):
    """Archive.job_order_items - Enhanced structure for archived data"""
    __tablename__ = "job_order_items"
    __table_args__ = {'schema': 'archive'}

    item_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_order_id = Column(Integer, nullable=False)  # No foreign key for archived data
    color_id = Column(Integer, nullable=False)  # No foreign key for archived data
    size_id = Column(Integer, nullable=False)  # No foreign key for archived data
    quantity = Column(Integer, nullable=False)
    weight = Column(DECIMAL(10,2), nullable=True)
    notes = Column(Text, nullable=True)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)

class ArchivedJobOrderMaterial(Base):
    """Archive.job_order_materials - New table for archived material data"""
    __tablename__ = "job_order_materials"
    __table_args__ = {'schema': 'archive'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_order_id = Column(Integer, nullable=False)  # No foreign key for archived data
    material_id = Column(Integer, nullable=False)  # No foreign key for archived data
    color_id = Column(Integer, nullable=True)  # No foreign key for archived data
    quantity = Column(DECIMAL(10, 3), nullable=False)
    consumption = Column(DECIMAL(10, 3), nullable=True)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)

class ArchivedBarcodeScanEvent(Base):
    """Archive.barcode_scan_events - New table for archived scan events"""
    __tablename__ = "barcode_scan_events"
    __table_args__ = {'schema': 'archive'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    batch_id = Column(Integer, nullable=False)  # No foreign key for archived data
    action_type = Column(String(50), nullable=False)
    phase_id = Column(Integer, nullable=False)  # No foreign key for archived data
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    old_quantity = Column(Integer, nullable=True)
    new_quantity = Column(Integer, nullable=True)
    old_phase = Column(Integer, nullable=True)
    new_phase = Column(Integer, nullable=True)
    scanned_at = Column(DateTime, nullable=False)
    user_id = Column(Integer, nullable=True)  # No foreign key for archived data
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)

class ArchivedCutDetail(Base):
    """Archive.cut_details - Archived cut details"""
    __tablename__ = "cut_details"
    __table_args__ = {'schema': 'archive'}

    cut_id = Column(Integer, primary_key=True, index=True)
    job_order_id = Column(Integer, nullable=False)
    color_id = Column(Integer, nullable=False)
    num_of_rolls_used = Column(Integer, nullable=False, default=0)
    total_layers = Column(Integer, nullable=False, default=0)
    job_order_items_ratios = Column(JSONB, nullable=False)
    waste_fabric_weight = Column(DECIMAL(10, 3), nullable=True)
    marker_length = Column(DECIMAL(10, 3), nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    print_status = Column(String(50), nullable=True)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)

class ArchivedCutRoll(Base):
    """Archive.cut_rolls - Archived cut rolls"""
    __tablename__ = "cut_rolls"
    __table_args__ = {'schema': 'archive'}

    roll_id = Column(Integer, primary_key=True, index=True)
    cut_id = Column(Integer, nullable=False, index=True)
    roll_number = Column(Integer, nullable=False)
    weight = Column(DECIMAL(10, 3), nullable=False)
    layer_weight = Column(DECIMAL(10, 3), nullable=False)
    num_of_layers = Column(Integer, nullable=False)
    roll_width = Column(DECIMAL(10, 3), nullable=True)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)

class ArchivedCutSizeTransition(Base):
    """Archive.cut_size_transitions - Archived cut size transitions"""
    __tablename__ = "cut_size_transitions"
    __table_args__ = {'schema': 'archive'}

    transition_id = Column(Integer, primary_key=True, index=True)
    cut_id = Column(Integer, nullable=False, index=True)
    from_item_id = Column(Integer, nullable=False)
    to_item_id = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, server_default=func.now(), nullable=False)

# ============================================================================
# REPORTING SCHEMA MODELS
# ============================================================================

class JobOrderItemSummary(Base):
    """Reporting.job_order_items_summary - Enhanced with more fields"""
    __tablename__ = "job_order_items_summary"
    __table_args__ = {'schema': 'reporting'}

    item_id = Column(Integer, ForeignKey("core.job_order_items.item_id", ondelete="CASCADE"), primary_key=True, index=True)
    job_order_id = Column(Integer, ForeignKey("core.job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    color_id = Column(Integer, ForeignKey("core.colors.color_id", ondelete="RESTRICT"), nullable=False)
    size_id = Column(Integer, ForeignKey("core.sizes.size_id", ondelete="RESTRICT"), nullable=False)
    color_name = Column(String(50), nullable=True)
    size_value = Column(String(20), nullable=True)
    expected_quantity = Column(Integer, default=0)
    cut_qty = Column(Integer, default=0)
    cut_inspection_qty = Column(Integer, default=0)
    second_degree_cut_qty = Column(Integer, default=0)
    sewing_in_qty = Column(Integer, default=0)
    sewing_out_qty = Column(Integer, default=0)
    qc_in_qty = Column(Integer, default=0)
    qc_out_qty = Column(Integer, default=0)
    packaging_in_qty = Column(Integer, default=0)
    packaging_out_qty = Column(Integer, default=0)
    working_qty = Column(Integer, default=0)
    second_degree_qty = Column(Integer, default=0)
    lost_qty = Column(Integer, default=0)
    completed_qty = Column(Integer, default=0)
    total_batches = Column(Integer, default=0)
    has_issues = Column(Boolean, default=False)
    completion_percentage = Column(DECIMAL(5,2), default=0.00)
    overproduction_quantity = Column(Integer, default=0)
    production_status = Column(String(20), default='Not Started')
    notes = Column(Text, nullable=True)
    true_consumption = Column(DECIMAL(10, 4), nullable=True)
    true_consumption_m = Column(DECIMAL(10, 4), nullable=True)
    last_calculated_at = Column(TIMESTAMP, nullable=True)

    # Relationships
    job_order = relationship("JobOrder", back_populates="item_summaries")
    color = relationship("Color")
    size = relationship("Size")
    item = relationship("JobOrderItem", back_populates="summary")

    def __repr__(self):
        return f"<JobOrderItemSummary Item:{self.item_id} JO:{self.job_order_id} {self.color_name}-{self.size_value}>"

class JobOrderSummary(Base):
    """Reporting.job_orders_summary - Enhanced with more fields"""
    __tablename__ = "job_orders_summary"
    __table_args__ = {'schema': 'reporting'}

    job_order_id = Column(Integer, primary_key=True, index=True)
    job_order_number = Column(String(255), nullable=False)
    model_name = Column(String(255), nullable=True)
    client_name = Column(String(255), nullable=True)  # Renamed from brand_name
    total_items = Column(Integer, default=0)
    total_expected_quantity = Column(Integer, default=0)
    total_produced_quantity = Column(Integer, default=0)
    cut_quantity = Column(Integer, default=0)
    second_degree_quantity = Column(Integer, default=0)
    working_quantity = Column(Integer, default=0)
    total_batches = Column(Integer, default=0)
    has_issues = Column(Boolean, default=False)
    has_high_second_degree = Column(Boolean, default=False)
    completion_percentage = Column(DECIMAL(5,2), default=0.00)
    overproduction_quantity = Column(Integer, default=0)
    priority = Column(Integer, nullable=True, default=0)
    last_calculated_at = Column(TIMESTAMP, nullable=True)

    def __repr__(self):
        return f"<JobOrderSummary {self.job_order_number}>"


class WorkerDailyStageProduction(Base):
    """Reporting.worker_daily_stage_production - Precomputed daily expected/true output per worker/stage."""
    __tablename__ = "worker_daily_stage_production"
    __table_args__ = {'schema': 'reporting'}

    work_date = Column(Date, primary_key=True, index=True)
    worker_id = Column(
        Integer,
        ForeignKey("core.workers.worker_id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    stage_id = Column(
        Integer,
        ForeignKey("core.sewing_line_stages.stage_id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    # Assignment source used for true_output traceability/joining to production_history.
    daily_assignment_id = Column(
        Integer,
        ForeignKey("ops.worker_daily_stage_assignments.daily_assignment_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    expected_output = Column(Integer, default=0, nullable=False)
    true_output = Column(Integer, default=0, nullable=False)
    # Total elapsed hours spent in this worker/stage for the day.
    # Derived from ops.worker_daily_stage_assignments.working_hours (including overtime changes).
    working_hours = Column(DECIMAL(6, 2), default=0, nullable=False)
    # Overtime hours applied for this worker/stage/day.
    # Derived from ops.worker_overtime_history (can contain multiple request entries).
    overtime_hours = Column(DECIMAL(6, 2), default=0, nullable=False)
    # Snapshot of whether this stage is marked as final stage at refresh time.
    is_final_stage = Column(Boolean, default=False, nullable=False, server_default='false')
    last_calculated_at = Column(TIMESTAMP, nullable=True)

    def __repr__(self):
        return f"<WorkerDailyStageProduction {self.work_date} worker:{self.worker_id} stage:{self.stage_id}>"

# ============================================================================
# PYDANTIC SCHEMAS FOR API
# ============================================================================

class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[datetime] = None