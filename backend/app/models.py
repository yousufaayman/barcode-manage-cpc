from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Enum, UniqueConstraint
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

    batches = relationship("Batch", back_populates="brand")

# Model model
class Model(Base):
    __tablename__ = "models"

    model_id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(255), unique=True, index=True)

    batches = relationship("Batch", back_populates="model")
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
    brand_id = Column(Integer, ForeignKey("brands.brand_id", ondelete="RESTRICT"))
    model_id = Column(Integer, ForeignKey("models.model_id", ondelete="RESTRICT"))
    size_id = Column(Integer, ForeignKey("sizes.size_id", ondelete="RESTRICT"))
    color_id = Column(Integer, ForeignKey("colors.color_id", ondelete="RESTRICT"))
    quantity = Column(Integer)
    layers = Column(Integer)
    serial = Column(String(3), nullable=False)
    current_phase = Column(Integer, ForeignKey("production_phases.phase_id", ondelete="RESTRICT"))
    status = Column(String(50))
    last_updated_at = Column(DateTime, server_default=func.now())

    brand = relationship("Brand", back_populates="batches")
    model = relationship("Model", back_populates="batches")
    size = relationship("Size", back_populates="batches")
    color = relationship("Color", back_populates="batches")
    phase = relationship("ProductionPhase", back_populates="batches")
    job_order = relationship("JobOrder", back_populates="batches")

class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[datetime] = None

# Timeline model for batch status and phase tracking
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

class ArchivedBatch(Base):
    __tablename__ = "archived_batches"

    batch_id = Column(Integer, primary_key=True, index=True)
    job_order_id = Column(Integer, ForeignKey("job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    barcode = Column(String(255), unique=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.brand_id", ondelete="RESTRICT"))
    model_id = Column(Integer, ForeignKey("models.model_id", ondelete="RESTRICT"))
    size_id = Column(Integer, ForeignKey("sizes.size_id", ondelete="RESTRICT"))
    color_id = Column(Integer, ForeignKey("colors.color_id", ondelete="RESTRICT"))
    quantity = Column(Integer)
    layers = Column(Integer)
    serial = Column(String(3), nullable=False)
    current_phase = Column(Integer, ForeignKey("production_phases.phase_id", ondelete="RESTRICT"))
    status = Column(String(50))
    last_updated_at = Column(DateTime)
    archived_at = Column(DateTime)

# Job Order model
class JobOrder(Base):
    __tablename__ = "job_orders"

    job_order_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey("models.model_id", ondelete="RESTRICT"), nullable=False)
    job_order_number = Column(String(100), unique=True, nullable=False, index=True)

    model = relationship("Model", back_populates="job_orders")
    items = relationship("JobOrderItem", back_populates="job_order", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="job_order")

    def __repr__(self):
        return f"<JobOrder {self.job_order_number}>"

# Job Order Item model
class JobOrderItem(Base):
    __tablename__ = "job_order_items"

    item_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_order_id = Column(Integer, ForeignKey("job_orders.job_order_id", ondelete="CASCADE"), nullable=False)
    color_id = Column(Integer, ForeignKey("colors.color_id", ondelete="RESTRICT"), nullable=False)
    size_id = Column(Integer, ForeignKey("sizes.size_id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Integer, nullable=False)

    # Add unique constraint for job_order_id + color_id + size_id combination
    __table_args__ = (
        UniqueConstraint('job_order_id', 'color_id', 'size_id', name='job_order_color_size_unique'),
    )

    job_order = relationship("JobOrder", back_populates="items")
    color = relationship("Color", back_populates="job_order_items")
    size = relationship("Size", back_populates="job_order_items")

    def __repr__(self):
        return f"<JobOrderItem {self.job_order_id}:{self.color_id}:{self.size_id} x{self.quantity}>" 