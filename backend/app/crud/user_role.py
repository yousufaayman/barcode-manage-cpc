from typing import Any, Dict, Optional, Union, List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.crud.base import CRUDBase
from app.models import UserRole, User, System
from app.schemas import UserRoleCreate, UserRoleUpdate


class CRUDUserRole(CRUDBase[UserRole, UserRoleCreate, UserRoleUpdate]):
    def get_by_user_and_system(self, db: Session, *, user_id: int, system_id: int) -> Optional[UserRole]:
        return db.query(UserRole).filter(
            and_(UserRole.user_id == user_id, UserRole.system_id == system_id)
        ).first()

    def get_by_user(self, db: Session, *, user_id: int) -> List[UserRole]:
        return db.query(UserRole).filter(UserRole.user_id == user_id).all()

    def get_by_system(self, db: Session, *, system_id: int) -> List[UserRole]:
        return db.query(UserRole).filter(UserRole.system_id == system_id).all()

    def get_user_roles_in_system(self, db: Session, *, user_id: int, system_name: str) -> Optional[UserRole]:
        return db.query(UserRole).join(System).filter(
            and_(UserRole.user_id == user_id, System.name == system_name)
        ).first()

    def get_users_with_role_in_system(self, db: Session, *, system_name: str, role: str) -> List[UserRole]:
        return db.query(UserRole).join(System).filter(
            and_(System.name == system_name, UserRole.role == role)
        ).all()

    def create_user_role(self, db: Session, *, user_id: int, system_id: int, role: str) -> UserRole:
        db_obj = UserRole(
            user_id=user_id,
            system_id=system_id,
            role=role
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_user_role(self, db: Session, *, user_id: int, system_id: int, role: str) -> Optional[UserRole]:
        db_obj = self.get_by_user_and_system(db, user_id=user_id, system_id=system_id)
        if db_obj:
            db_obj.role = role
            db.commit()
            db.refresh(db_obj)
        return db_obj

    def delete_user_role(self, db: Session, *, user_id: int, system_id: int) -> Optional[UserRole]:
        db_obj = self.get_by_user_and_system(db, user_id=user_id, system_id=system_id)
        if db_obj:
            db.delete(db_obj)
            db.commit()
        return db_obj


user_role = CRUDUserRole(UserRole)





