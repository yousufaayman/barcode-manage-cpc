from sqlalchemy.orm import Session
from .. import models, schemas

def get_model(db: Session, model_id: int):
    return db.query(models.Model).filter(models.Model.model_id == model_id).first()

def get_model_by_name(db: Session, model_name: str):
    return db.query(models.Model).filter(models.Model.model_name == model_name).first()

def get_models(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Model).offset(skip).limit(limit).all()

def create_model(db: Session, model: schemas.ModelCreate):
    db_model = models.Model(model_name=model.model_name)
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model 