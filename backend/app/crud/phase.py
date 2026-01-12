from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import models, schemas

def get_phase(db: Session, phase_id: int):
    return db.query(models.ProductionPhase).filter(models.ProductionPhase.phase_id == phase_id).first()

def get_phases(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.ProductionPhase).order_by(
        func.coalesce(models.ProductionPhase.sequence_order, 999).asc(),
        models.ProductionPhase.phase_id.asc()
    ).offset(skip).limit(limit).all()

def create_phase(db: Session, phase: schemas.ProductionPhaseCreate):
    db_phase = models.ProductionPhase(
        phase_name=phase.phase_name,
        type=phase.type,
        sequence_order=phase.sequence_order
    )
    db.add(db_phase)
    db.commit()
    db.refresh(db_phase)
    return db_phase 