from sqlalchemy import text
from app.db.session import engine
from app.models import Base, User
from app.core.security import get_password_hash
from sqlalchemy.orm import Session
from app import crud, schemas
from app.core.config import settings
from app.models import UserRole

def init_db() -> None:
    # Create tables
    Base.metadata.create_all(bind=engine)
    # Create initial admin user
    create_initial_admin()

def create_initial_admin() -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        # Check if admin user exists
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            # Create admin user
            admin_in = schemas.UserCreate(
                username="admin",
                password="admin123",
                role=UserRole.ADMIN
            )
            crud.user.create(db, obj_in=admin_in)
    finally:
        db.close()
