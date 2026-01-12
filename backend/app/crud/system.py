from typing import Any, Dict, Optional, Union, List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.crud.base import CRUDBase
from app.models import System
from app.schemas import SystemCreate, SystemUpdate


class CRUDSystem(CRUDBase[System, SystemCreate, SystemUpdate]):
    def get_by_name(self, db: Session, *, name: str) -> Optional[System]:
        return db.query(System).filter(System.name == name).first()

    def get_by_id(self, db: Session, *, id: int) -> Optional[System]:
        return db.query(System).filter(System.id == id).first()

    def get_all(self, db: Session, *, skip: int = 0, limit: int = 100) -> List[System]:
        return db.query(System).offset(skip).limit(limit).all()


system = CRUDSystem(System)












