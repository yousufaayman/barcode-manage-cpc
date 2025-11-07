from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Enum, UniqueConstraint, DECIMAL, TIMESTAMP, Text, CheckConstraint
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
    CREATOR = "creator"
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

class BarcodeScanEvent(Base):
    """Ops.barcode_scan_events - Enhanced with metadata JSONB field"""
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
    scan_metadata = Column(JSONB, nullable=True)  # Additional metadata for scan events
    
    # Relationships
    batch = relationship("Batch", back_populates="barcode_scan_events")
    phase = relationship("ProductionPhase", back_populates="barcode_scan_events")
    user = relationship("User")
    
    def __repr__(self):
        return f"<BarcodeScanEvent {self.batch_id}:{self.action_type}:{self.scanned_at}>"

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
    notes = Column(Text, nullable=True)
    scan_metadata = Column(JSONB, nullable=True)
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
    last_calculated_at = Column(TIMESTAMP, nullable=True)

    def __repr__(self):
        return f"<JobOrderSummary {self.job_order_number}>"

# ============================================================================
# PYDANTIC SCHEMAS FOR API
# ============================================================================

class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[datetime] = None