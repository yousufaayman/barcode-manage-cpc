from datetime import timedelta
from typing import Any, Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.core import deps
from app.core import security
from app.core.config import settings
from app.crud import get_user_by_username, has_role_in_system, get_user, get_users
from app.crud.user import create_user, update_user, delete_user
from app.crud.user_role import user_role
from app.crud.system import system as system_crud
from app.models import System

router = APIRouter()

USER_NOT_FOUND_DETAIL = "User not found"


# Request/response schemas for user management (OPS-only)
class UserCreateOPS(BaseModel):
    username: str
    password: str
    role: str  # admin | general_operations | cutting | sewing | packaging


class UserUpdateOPS(BaseModel):
    username: str | None = None
    role: str | None = None  # admin | general_operations | cutting | sewing | packaging


class UserResponseOPS(BaseModel):
    id: int
    username: str
    role: str


class ResetPasswordBody(BaseModel):
    new_password: str


@router.post(
    "/login",
    response_model=schemas.Token,
    responses={
        400: {"description": "Incorrect username or password"},
        403: {"description": "Access denied. User does not have any role in OPS system."},
    },
)
def login_access_token(
    db: Annotated[Session, Depends(deps.get_db)],
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = get_user_by_username(db, username=form_data.username)
    if not user or not security.verify_password(form_data.password, user.password_hash):
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




@router.get("/me")
def read_user_me(
    current_user: Annotated[models.User, Depends(deps.get_current_active_user)],
) -> Any:
    """
    Get current user with OPS system role only.
    """
    # Extract role from user_roles for OPS system only
    ops_role = None
    for ur in current_user.user_roles:
        if ur.system.name == 'OPS':
            ops_role = ur.role
            break
    
    # Return simplified user data with only OPS role
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": ops_role
    }


@router.get("/me/roles")
def read_user_roles(
    current_user: Annotated[models.User, Depends(deps.get_current_active_user)],
    db: Annotated[Session, Depends(deps.get_db)],
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


# ----- Admin-only user management (OPS users) -----

def _get_ops_system(db: Session) -> System:
    ops = system_crud.get_by_name(db, name="OPS")
    if not ops:
        raise HTTPException(status_code=500, detail="OPS system not configured")
    return ops


@router.get("/users", response_model=List[UserResponseOPS])
def list_users(
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[models.User, Depends(deps.get_current_active_superuser)],
) -> Any:
    """List all users that have a role in the OPS system (admin only)."""
    all_users = get_users(db, skip=0, limit=1000)
    result: List[UserResponseOPS] = []
    for u in all_users:
        roles = crud.get_user_roles_in_system(db=db, user_id=u.id, system_name="OPS")
        if roles:
            role_val = roles[0].role.value if hasattr(roles[0].role, "value") else str(roles[0].role)
            result.append(UserResponseOPS(id=u.id, username=u.username, role=role_val))
    return result


@router.post(
    "/users",
    response_model=UserResponseOPS,
    responses={
        400: {"description": "Username already exists"},
        500: {"description": "OPS system not configured"},
    },
)
def create_user_ops(
    body: UserCreateOPS,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[models.User, Depends(deps.get_current_active_superuser)],
) -> Any:
    """Create a new user with an OPS role (admin only)."""
    if get_user_by_username(db, username=body.username):
        raise HTTPException(status_code=400, detail="Username already exists")
    ops = _get_ops_system(db)
    user_in = schemas.UserCreate(username=body.username, password=body.password, roles=[])
    new_user = create_user(db, obj_in=user_in)
    user_role.create_user_role(db, user_id=new_user.id, system_id=ops.id, role=body.role)
    db.refresh(new_user)
    roles = crud.get_user_roles_in_system(db=db, user_id=new_user.id, system_name="OPS")
    role_val = roles[0].role.value if (roles and hasattr(roles[0].role, "value")) else body.role
    return UserResponseOPS(id=new_user.id, username=new_user.username, role=role_val)


@router.put(
    "/users/{user_id}",
    response_model=UserResponseOPS,
    responses={
        400: {"description": "Username already exists"},
        404: {"description": "User not found"},
        500: {"description": "OPS system not configured"},
    },
)
def update_user_ops(
    user_id: int,
    body: UserUpdateOPS,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[models.User, Depends(deps.get_current_active_superuser)],
) -> Any:
    """Update a user's username and/or OPS role (admin only)."""
    db_user = get_user(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)
    ops = _get_ops_system(db)
    if body.username is not None:
        existing = get_user_by_username(db, username=body.username)
        if existing and existing.id != user_id:
            raise HTTPException(status_code=400, detail="Username already exists")
        update_user(db, db_obj=db_user, obj_in={"username": body.username})
    if body.role is not None:
        ur = user_role.get_by_user_and_system(db, user_id=user_id, system_id=ops.id)
        if ur:
            user_role.update_user_role(db, user_id=user_id, system_id=ops.id, role=body.role)
        else:
            user_role.create_user_role(db, user_id=user_id, system_id=ops.id, role=body.role)
    db.refresh(db_user)
    roles = crud.get_user_roles_in_system(db=db, user_id=db_user.id, system_name="OPS")
    role_val = roles[0].role.value if (roles and hasattr(roles[0].role, "value")) else (body.role or "cutting")
    return UserResponseOPS(id=db_user.id, username=db_user.username, role=role_val)


@router.delete(
    "/users/{user_id}",
    responses={
        400: {"description": "Cannot delete your own user"},
        404: {"description": "User not found"},
    },
)
def delete_user_ops(
    user_id: int,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[models.User, Depends(deps.get_current_active_superuser)],
) -> Any:
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own user")
    db_user = get_user(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)
    delete_user(db, id=user_id)
    return {"message": "User deleted"}


@router.put(
    "/users/{user_id}/reset-password",
    responses={
        400: {"description": "Password must be at least 6 characters"},
        404: {"description": "User not found"},
    },
)
def reset_user_password(
    user_id: int,
    body: ResetPasswordBody,
    db: Annotated[Session, Depends(deps.get_db)],
    current_user: Annotated[models.User, Depends(deps.get_current_active_superuser)],
) -> Any:
    """Set a new password for a user (admin only)."""
    db_user = get_user(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    update_user(db, db_obj=db_user, obj_in={"password": body.new_password})
    return {"message": "Password updated"}