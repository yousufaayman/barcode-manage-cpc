from typing import Annotated, Generator, Optional, List
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from pydantic import ValidationError
from sqlalchemy.orm import Session, joinedload

from app.crud import *
from app import models, schemas
from app.core import security
from app.core.config import settings
from app.db.session import get_db as get_db_session

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

# Use the enhanced get_db from session.py
get_db = get_db_session

def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str, Depends(reusable_oauth2)],
) -> models.User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = schemas.TokenPayload(**payload)
    except (jwt.JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = db.query(models.User).options(
        joinedload(models.User.user_roles).joinedload(models.UserRole.system)
    ).filter(models.User.username == token_data.sub).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def get_current_active_user(
    current_user: Annotated[models.User, Depends(get_current_user)],
) -> models.User:
    return current_user

def get_current_active_superuser(
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> models.User:
    if not has_role_in_system(db=db, user_id=current_user.id, system_name="OPS", role="admin"):
        raise HTTPException(status_code=400, detail="The user doesn't have enough privileges")
    return current_user

def get_current_general_ops_or_above(
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> models.User:
    """Allows access to users with ADMIN or GENERAL_OPERATIONS roles"""
    roles = [r.role for r in get_user_roles_in_system(db=db, user_id=current_user.id, system_name="OPS")]
    if not any(r in roles for r in ["admin", "general_operations"]):
        raise HTTPException(status_code=403, detail="Access denied. Admin or General Operations privileges required.")
    return current_user

def get_current_admin_or_general_ops(
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> models.User:
    """Allows access to users with ADMIN or GENERAL_OPERATIONS roles"""
    roles = [r.role for r in get_user_roles_in_system(db=db, user_id=current_user.id, system_name="OPS")]
    if not any(r in roles for r in ["admin", "general_operations"]):
        raise HTTPException(status_code=403, detail="Access denied. Admin or General Operations privileges required.")
    return current_user

def get_current_admin_only(
    current_user: Annotated[models.User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> models.User:
    """Allows access ONLY to users with ADMIN role (for delete operations)"""
    roles = [r.role for r in get_user_roles_in_system(db=db, user_id=current_user.id, system_name="OPS")]
    if "admin" not in roles:
        raise HTTPException(status_code=403, detail="Access denied. Admin privileges required for this operation.")
    return current_user

def get_optional_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[Optional[str], Header()] = None,
) -> Optional[models.User]:
    """Get current user if Authorization header is provided, otherwise return None"""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = schemas.TokenPayload(**payload)
    except (jwt.JWTError, ValidationError):
        return None
    user = db.query(models.User).filter(models.User.username == token_data.sub).first()
    return user if user else None

def get_current_user_with_system_role(
    system_name: str,
    required_role: str,
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str, Depends(reusable_oauth2)],
) -> models.User:
    """Get current user and verify they have the required role in the specified system"""
    user = get_current_user(db=db, token=token)
    
    # Check if user has the required role in the system
    if not has_role_in_system(db=db, user_id=user.id, system_name=system_name, role=required_role):
        raise HTTPException(
            status_code=403,
            detail=f"Access denied. {required_role} privileges required in {system_name} system."
        )
    
    return user

def get_current_admin_user(
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str, Depends(reusable_oauth2)],
) -> models.User:
    """Get current user and verify they have admin role in OPS system"""
    return get_current_user_with_system_role(
        system_name="OPS",
        required_role="admin",
        db=db,
        token=token
    )

def get_current_user_with_any_role(
    system_name: str,
    allowed_roles: List[str],
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str, Depends(reusable_oauth2)],
) -> models.User:
    """Get current user and verify they have any of the allowed roles in the specified system"""
    user = get_current_user(db=db, token=token)
    
    # Check if user has any of the allowed roles in the system
    user_roles = get_user_roles_in_system(db=db, user_id=user.id, system_name=system_name)
    user_role_names = [role.role for role in user_roles]
    
    if not any(role in user_role_names for role in allowed_roles):
        raise HTTPException(
            status_code=403,
            detail=f"Access denied. One of {allowed_roles} privileges required in {system_name} system."
        )
    
    return user 