from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple, Union
from .core.config import settings
from .db.session import engine, SessionLocal

class CRUDAdapter:
    """Adapter class to handle PostgreSQL database operations"""
    
    def __init__(self):
        self.engine = engine
        self.SessionLocal = SessionLocal
    
    def get_models(self):
        """Get the PostgreSQL models"""
        from .models import (
            User, Client, Color, Size, Model, Material, ProductionPhase,
            JobOrder, JobOrderItem, JobOrderMaterial, Batch, BarcodeScanEvent,
            ArchivedBatch, ArchivedJobOrder, ArchivedJobOrderItem, ArchivedJobOrderMaterial,
            JobOrderItemSummary, JobOrderSummary
        )
        return {
            'User': User,
            'Client': Client,
            'Color': Color,
            'Size': Size,
            'Model': Model,
            'Material': Material,
            'ProductionPhase': ProductionPhase,
            'JobOrder': JobOrder,
            'JobOrderItem': JobOrderItem,
            'JobOrderMaterial': JobOrderMaterial,
            'Batch': Batch,
            'BarcodeScanEvent': BarcodeScanEvent,
            'ArchivedBatch': ArchivedBatch,
            'ArchivedJobOrder': ArchivedJobOrder,
            'ArchivedJobOrderItem': ArchivedJobOrderItem,
            'ArchivedJobOrderMaterial': ArchivedJobOrderMaterial,
            'JobOrderItemSummary': JobOrderItemSummary,
            'JobOrderSummary': JobOrderSummary
        }
    
    def get_schemas(self):
        """Get the PostgreSQL schemas"""
        from .schemas import (
            User, Client, Color, Size, Model, Material, ProductionPhase,
            JobOrder, JobOrderItem, JobOrderMaterial, Batch, BarcodeScanEvent,
            ArchivedBatch, ArchivedJobOrder, ArchivedJobOrderItem,
            JobOrderItemSummary, JobOrderSummary
        )
        return {
            'User': User,
            'Client': Client,
            'Color': Color,
            'Size': Size,
            'Model': Model,
            'Material': Material,
            'ProductionPhase': ProductionPhase,
            'JobOrder': JobOrder,
            'JobOrderItem': JobOrderItem,
            'JobOrderMaterial': JobOrderMaterial,
            'Batch': Batch,
            'BarcodeScanEvent': BarcodeScanEvent,
            'ArchivedBatch': ArchivedBatch,
            'ArchivedJobOrder': ArchivedJobOrder,
            'ArchivedJobOrderItem': ArchivedJobOrderItem,
            'JobOrderItemSummary': JobOrderItemSummary,
            'JobOrderSummary': JobOrderSummary
        }
    
    def get_table_name(self, model_name: str) -> str:
        """Get the full table name including schema for PostgreSQL"""
        models = self.get_models()
        model_class = models.get(model_name)
        
        if not model_class:
            raise ValueError(f"Model {model_name} not found")
        
        # For PostgreSQL, include schema in table name
        schema_mapping = {
            'User': 'core.users',
            'Client': 'core.clients',
            'Color': 'core.colors',
            'Size': 'core.sizes',
            'Model': 'core.models',
            'Material': 'core.materials',
            'ProductionPhase': 'core.production_phases',
            'JobOrder': 'core.job_orders',
            'JobOrderItem': 'core.job_order_items',
            'JobOrderMaterial': 'core.job_order_materials',
            'Batch': 'ops.batches',
            'BarcodeScanEvent': 'ops.barcode_scan_events',
            'ArchivedBatch': 'archive.batches',
            'ArchivedJobOrder': 'archive.job_orders',
            'ArchivedJobOrderItem': 'archive.job_order_items',
            'ArchivedJobOrderMaterial': 'archive.job_order_materials',
            'JobOrderItemSummary': 'reporting.job_order_items_summary',
            'JobOrderSummary': 'reporting.job_orders_summary'
        }
        return schema_mapping.get(model_name, model_class.__tablename__)
    
    def get_session(self):
        """Get database session"""
        return self.SessionLocal()
    
    def get_engine(self):
        """Get database engine"""
        return self.engine

# Global adapter instance
crud_adapter = CRUDAdapter()

# Convenience functions
def get_models():
    """Get models for PostgreSQL"""
    return crud_adapter.get_models()

def get_schemas():
    """Get schemas for PostgreSQL"""
    return crud_adapter.get_schemas()

def get_table_name(model_name: str) -> str:
    """Get table name for PostgreSQL"""
    return crud_adapter.get_table_name(model_name)

def get_db():
    """Get database session"""
    return crud_adapter.get_session()

def get_engine():
    """Get database engine"""
    return crud_adapter.get_engine()