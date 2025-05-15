from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Enum
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

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

# Size model
class Size(Base):
    __tablename__ = "sizes"

    size_id = Column(Integer, primary_key=True, index=True)
    size_value = Column(String(50), unique=True, index=True)

    batches = relationship("Batch", back_populates="size")

# Color model
class Color(Base):
    __tablename__ = "colors"

    color_id = Column(Integer, primary_key=True, index=True)
    color_name = Column(String(100), unique=True, index=True)

    batches = relationship("Batch", back_populates="color")

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
    barcode = Column(String(255), unique=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.brand_id"))
    model_id = Column(Integer, ForeignKey("models.model_id"))
    size_id = Column(Integer, ForeignKey("sizes.size_id"))
    color_id = Column(Integer, ForeignKey("colors.color_id"))
    quantity = Column(Integer)
    layers = Column(Integer)
    serial = Column(Integer)
    current_phase = Column(Integer, ForeignKey("production_phases.phase_id"))
    status = Column(String(50))

    brand = relationship("Brand", back_populates="batches")
    model = relationship("Model", back_populates="batches")
    size = relationship("Size", back_populates="batches")
    color = relationship("Color", back_populates="batches")
    phase = relationship("ProductionPhase", back_populates="batches")

class TokenPayload(BaseModel):
    sub: Optional[int] = None
    exp: Optional[datetime] = None 