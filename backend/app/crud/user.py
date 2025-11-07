from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Union
from ..models import User, UserRole, System
from ..schemas import UserCreate, UserUpdate, UserRoleCreate
from app.core.security import get_password_hash

# --- User CRUD operations ---

def get_user(db: Session, id: int) -> Optional[User]:
    return db.query(User).filter(User.id == id).first()

def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()

def get_users(db: Session, *, skip: int = 0, limit: int = 100) -> List[User]:
    return db.query(User).offset(skip).limit(limit).all()

def create_user(db: Session, *, obj_in: UserCreate) -> User:
    db_obj = User(
        username=obj_in.username,
        password_hash=get_password_hash(obj_in.password)
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    
    # Create user roles if provided
    if obj_in.roles:
        for role_data in obj_in.roles:
            user_role = UserRole(
                user_id=db_obj.id,
                system_id=role_data.system_id,
                role=role_data.role
            )
            db.add(user_role)
        db.commit()
    
    return db_obj

def update_user(
    db: Session, *, db_obj: User, obj_in: Union[UserUpdate, Dict[str, Any]]
) -> User:
    if isinstance(obj_in, dict):
        update_data = obj_in
    else:
        update_data = obj_in.dict(exclude_unset=True)
    if update_data.get("password"):
        hashed_password = get_password_hash(update_data["password"])
        del update_data["password"]
        update_data["password_hash"] = hashed_password
    for field in update_data:
        setattr(db_obj, field, update_data[field])
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_user(db: Session, *, id: int) -> User:
    obj = db.query(User).filter(User.id == id).first()
    if obj:
        db.delete(obj)
        db.commit()
    return obj

def get_user_role_in_system(db: Session, *, user_id: int, system_name: str) -> Optional[UserRole]:
    """Get user's role in a specific system"""
    return db.query(UserRole).join(System).filter(
        UserRole.user_id == user_id,
        System.name == system_name
    ).first()

def get_user_roles_in_system(db: Session, *, user_id: int, system_name: str) -> List[UserRole]:
    """Get all user roles in a specific system"""
    return db.query(UserRole).join(System).filter(
        UserRole.user_id == user_id,
        System.name == system_name
    ).all()

def has_role_in_system(db: Session, *, user_id: int, system_name: str, role: str) -> bool:
    """Check if user has a specific role in a system"""
    user_role = db.query(UserRole).join(System).filter(
        UserRole.user_id == user_id,
        System.name == system_name,
        UserRole.role == role
    ).first()
    return user_role is not None

def get_users_with_role_in_system(db: Session, *, system_name: str, role: str) -> List[User]:
    """Get all users with a specific role in a system"""
    return db.query(User).join(UserRole).join(System).filter(
        System.name == system_name,
        UserRole.role == role
    ).all() 