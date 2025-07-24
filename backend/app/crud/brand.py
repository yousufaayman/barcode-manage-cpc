from sqlalchemy.orm import Session
from .. import models, schemas

def get_brand(db: Session, brand_id: int):
    return db.query(models.Brand).filter(models.Brand.brand_id == brand_id).first()

def get_brand_by_name(db: Session, brand_name: str):
    return db.query(models.Brand).filter(models.Brand.brand_name == brand_name).first()

def get_brands(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Brand).offset(skip).limit(limit).all()

def create_brand(db: Session, brand: schemas.BrandCreate):
    db_brand = models.Brand(brand_name=brand.brand_name)
    db.add(db_brand)
    db.commit()
    db.refresh(db_brand)
    return db_brand 