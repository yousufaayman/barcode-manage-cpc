from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Enum, UniqueConstraint, DECIMAL, TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import enum

Base = declarative_base()

class UserRole(str, enum.Enum):
    ADMIN = "Admin"
    CREATOR = "Creator"
    CUTTING = "Cutting"
    SEWING = "Sewing"
    PACKAGING = "Packaging"

# User model
class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(255), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, values_callable=lambda x: [e.value for e in UserRole]), nullable=False, default=UserRole.CUTTING)

    @property
    def id(self):
        return self.user_id

    def __repr__(self):
        return f"<User {self.username}>"

# Brand model
class Brand(Base):
    __tablename__ = "brands"

    brand_id = Column(Integer, primary_key=True, index=True)
    brand_name = Column(String(255), unique=True, index=True)

# Model model
class Model(Base):
    __tablename__ = "models"

    model_id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(255), unique=True, index=True)

    job_orders = relationship("JobOrder", back_populates="model")

# Size model
class Size(Base):
    __tablename__ = "sizes"

    size_id = Column(Integer, primary_key=True, index=True)
    size_value = Column(String(50), unique=True, index=True)

    batches = relationship("Batch", back_populates="size")
    job_order_items = relationship("JobOrderItem", back_populates="size")

# Color model
class Color(Base):
    __tablename__ = "colors"

    color_id = Column(Integer, primary_key=True, index=True)
    color_name = Column(String(100), unique=True, index=True)

    batches = relationship("Batch", back_populates="color")
    job_order_items = relationship("JobOrderItem", back_populates="color")

# Production Phase model
class ProductionPhase(Base):
    __tablename__ = "production_phases"

    phase_id = Column(Integer, primary_key=True, index=True)
    phase_name = Column(String(100), unique=True, index=True)

    batches = relationship("Batch", back_populates="phase")

# Batch model
class Batch(Base):
    __tablename__ = "batches"

    batch_id = Column(Integer, primary_key=True, index=True)
    job_order_id = Column(Integer, ForeignKey("job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    barcode = Column(String(255), unique=True, index=True)
    size_id = Column(Integer, ForeignKey("sizes.size_id", ondelete="RESTRICT"))
    color_id = Column(Integer, ForeignKey("colors.color_id", ondelete="RESTRICT"))
    quantity = Column(Integer)
    layers = Column(Integer)
    serial = Column(String(3), nullable=False)
    current_phase = Column(Integer, ForeignKey("production_phases.phase_id", ondelete="RESTRICT"))
    status = Column(String(50))
    last_updated_at = Column(DateTime, server_default=func.now())

    size = relationship("Size", back_populates="batches")
    color = relationship("Color", back_populates="batches")
    phase = relationship("ProductionPhase", back_populates="batches")
    job_order = relationship("JobOrder", back_populates="batches")

#Token Payload
class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[datetime] = None

#Barcode Status Timeline
class BarcodeStatusTimeline(Base):
    __tablename__ = "barcode_status_timeline"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batches.batch_id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False)  # 'in', 'out', 'pending'
    phase_id = Column(Integer, ForeignKey("production_phases.phase_id", ondelete="RESTRICT"), nullable=False)
    start_time = Column(DateTime, nullable=False, default=func.now())
    end_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)

    batch = relationship("Batch")
    phase = relationship("ProductionPhase")

#Archived Batches
class ArchivedBatch(Base):
    __tablename__ = "archived_batches"

    batch_id = Column(Integer, primary_key=True, index=True)
    job_order_id = Column(Integer, ForeignKey("job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    barcode = Column(String(255), unique=True, index=True)
    size_id = Column(Integer, ForeignKey("sizes.size_id", ondelete="RESTRICT"))
    color_id = Column(Integer, ForeignKey("colors.color_id", ondelete="RESTRICT"))
    quantity = Column(Integer)
    layers = Column(Integer)
    serial = Column(String(3), nullable=False)
    current_phase = Column(Integer, ForeignKey("production_phases.phase_id", ondelete="RESTRICT"))
    status = Column(String(50))
    last_updated_at = Column(DateTime)
    archived_at = Column(DateTime)

    size = relationship("Size")
    color = relationship("Color")
    phase = relationship("ProductionPhase")
    job_order = relationship("JobOrder")

# Job Order model
class JobOrder(Base):
    __tablename__ = "job_orders"

    job_order_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey("models.model_id", ondelete="RESTRICT"), nullable=False)
    job_order_number = Column(String(100), unique=True, nullable=False, index=True)
    brand_id = Column(Integer, ForeignKey("brands.brand_id", ondelete="RESTRICT"), nullable=True)
    image_url = Column(String(255), nullable=True)
    notes = Column(String(length=1000), nullable=True)
    date_created = Column(DateTime, server_default=func.now(), nullable=False)

    model = relationship("Model", back_populates="job_orders")
    items = relationship("JobOrderItem", back_populates="job_order", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="job_order")
    brand = relationship("Brand")
    materials = relationship("JobOrderMaterial", back_populates="job_order", cascade="all, delete-orphan")
    prints = relationship("JobOrderPrint", back_populates="job_order", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<JobOrder {self.job_order_number}>"

# ---------------------------------------------------------------------------
# Job Order Material model (consumption per job order)
# ---------------------------------------------------------------------------

class JobOrderMaterial(Base):
    __tablename__ = "job_order_materials"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_order_id = Column(Integer, ForeignKey("job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.material_id", ondelete="RESTRICT"), nullable=False)
    color_id = Column(Integer, ForeignKey("colors.color_id", ondelete="RESTRICT"), nullable=True)
    quantity = Column(DECIMAL(10, 3), nullable=False)
    consumption = Column(DECIMAL(10, 3), nullable=True)

    __table_args__ = (
        UniqueConstraint('job_order_id', 'material_id', 'color_id', name='uq_job_material'),
    )

    job_order = relationship("JobOrder", back_populates="materials")
    material = relationship("Material", back_populates="job_order_materials")
    color = relationship("Color")

    def __repr__(self):
        return f"<JobOrderMaterial JO:{self.job_order_id} Mat:{self.material_id} Qty:{self.quantity}>"

# Job Order Item model
class JobOrderItem(Base):
    __tablename__ = "job_order_items"

    item_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_order_id = Column(Integer, ForeignKey("job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    color_id = Column(Integer, ForeignKey("colors.color_id", ondelete="RESTRICT"), nullable=False)
    size_id = Column(Integer, ForeignKey("sizes.size_id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Integer, nullable=False)
    weight = Column(DECIMAL(10,2), nullable=True)

    # Add unique constraint for job_order_id + color_id + size_id combination
    __table_args__ = (
        UniqueConstraint('job_order_id', 'color_id', 'size_id', name='job_order_color_size_unique'),
    )

    job_order = relationship("JobOrder", back_populates="items")
    color = relationship("Color", back_populates="job_order_items")
    size = relationship("Size", back_populates="job_order_items")

    def __repr__(self):
        return f"<JobOrderItem {self.job_order_id}:{self.color_id}:{self.size_id} x{self.quantity} w{self.weight}>"

# Job Order Summary model
class JobOrderSummary(Base):
    __tablename__ = "job_orders_summary"

    job_order_id = Column(Integer, primary_key=True, index=True)
    job_order_number = Column(String(255), nullable=False)
    model_name = Column(String(255))
    brand_name = Column(String(255))
    total_items = Column(Integer, default=0)
    total_expected_quantity = Column(Integer, default=0)
    total_produced_quantity = Column(Integer, default=0)
    total_batches = Column(Integer, default=0)
    has_issues = Column(Boolean, default=False)
    completion_percentage = Column(DECIMAL(5,2), default=0.00)
    overproduction_quantity = Column(Integer, default=0)
    last_calculated_at = Column(TIMESTAMP)
    last_quantity_change = Column(TIMESTAMP)
    last_completion_change = Column(TIMESTAMP)
    last_new_batch = Column(TIMESTAMP)
    last_batch_update = Column(TIMESTAMP) 

class Material(Base):
    __tablename__ = "materials"

    material_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    material_name = Column(String(100), unique=True, nullable=False, index=True)

    # Relationships
    job_order_materials = relationship("JobOrderMaterial", back_populates="material") 

# ---------------------------------------------------------------------------
# Job Order Print flags
# ---------------------------------------------------------------------------

class JobOrderPrint(Base):
    __tablename__ = "job_order_prints"

    job_order_id = Column(Integer, ForeignKey("job_orders.job_order_id", ondelete="CASCADE"), primary_key=True)
    chest = Column(Boolean, default=False)
    back = Column(Boolean, default=False)
    waist = Column(Boolean, default=False)
    right_leg = Column(Boolean, default=False)
    left_leg = Column(Boolean, default=False)
    pocket = Column(Boolean, default=False)
    hood = Column(Boolean, default=False)
    right_arm = Column(Boolean, default=False)
    left_arm = Column(Boolean, default=False)

    job_order = relationship("JobOrder", back_populates="prints")

    def __repr__(self):
        return f"<JobOrderPrint JO:{self.job_order_id}>" 