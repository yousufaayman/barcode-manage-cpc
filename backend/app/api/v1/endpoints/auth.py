from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.core import deps
from app.core import security
from app.core.config import settings
from app.crud import get_user_by_username, has_role_in_system

router = APIRouter()


@router.post("/login", response_model=schemas.Token)
def login_access_token(
    db: Session = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = get_user_by_username(db, username=form_data.username)
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    elif not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    # Check if user has any role in OPS system
    from app.crud import get_user_roles_in_system
    user_roles = get_user_roles_in_system(db=db, user_id=user.id, system_name="OPS")
    if not user_roles:
        raise HTTPException(
            status_code=403, 
            detail="Access denied. User does not have any role in OPS system."
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.username, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }


@router.post("/test-token", response_model=schemas.User)
def test_token(current_user: models.User = Depends(deps.get_current_active_user)) -> Any:
    """
    Test access token.
    """
    return current_user


@router.get("/me")
def read_user_me(
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get current user with OPS system role only.
    """
    # Extract role from user_roles for OPS system only
    ops_role = None
    for user_role in current_user.user_roles:
        if user_role.system.name == 'OPS':
            ops_role = user_role.role
            break
    
    # Return simplified user data with only OPS role
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": ops_role
    }


@router.get("/me/roles")
def read_user_roles(
    current_user: models.User = Depends(deps.get_current_active_user),
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get current user's roles in all systems.
    """
    from app.crud import get_user_roles_in_system
    
    # Get all systems
    systems = crud.system.get_all(db=db)
    user_roles = []
    
    for system in systems:
        roles = get_user_roles_in_system(db=db, user_id=current_user.id, system_name=system.name)
        if roles:
            user_roles.append({
                "system": system.name,
                "roles": [role.role for role in roles]
            })
    
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "system_roles": user_roles
    }