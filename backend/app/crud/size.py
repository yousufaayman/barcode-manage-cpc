from sqlalchemy.orm import Session
from .. import models, schemas

def get_size(db: Session, size_id: int):
    return db.query(models.Size).filter(models.Size.size_id == size_id).first()

def get_size_by_value(db: Session, value: str):
    return db.query(models.Size).filter(models.Size.size_value == value).first()

def get_sizes(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Size).offset(skip).limit(limit).all()

def create_size(db: Session, size: schemas.SizeCreate):
    db_size = models.Size(size_value=size.size_value)
    db.add(db_size)
    db.commit()
    db.refresh(db_size)
    return db_size 