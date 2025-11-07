from sqlalchemy.orm import Session
from .. import models, schemas

def get_client(db: Session, client_id: int):
    return db.query(models.Client).filter(models.Client.client_id == client_id).first()

def get_client_by_name(db: Session, name: str):
    return db.query(models.Client).filter(models.Client.client_name == name).first()

def get_clients(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Client).offset(skip).limit(limit).all()

def create_client(db: Session, client: schemas.ClientCreate):
    db_client = models.Client(client_name=client.client_name)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

