from sqlalchemy.orm import Session
from .. import models, schemas

def get_color(db: Session, color_id: int):
    return db.query(models.Color).filter(models.Color.color_id == color_id).first()

def get_color_by_name(db: Session, name: str):
    return db.query(models.Color).filter(models.Color.color_name == name).first()

def get_colors(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Color).offset(skip).limit(limit).all()

def create_color(db: Session, color: schemas.ColorCreate):
    db_color = models.Color(color_name=color.color_name)
    db.add(db_color)
    db.commit()
    db.refresh(db_color)
    return db_color 