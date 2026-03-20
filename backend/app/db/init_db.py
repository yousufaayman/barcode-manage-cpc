from app.db.session import engine
from app.models import Base, User, System, UserRole
from app.core.security import get_password_hash
from sqlalchemy.orm import Session
from app.crud import *
from app import schemas
from app.core.config import settings
from app.models import UserRoleEnum

def init_db() -> None:
    # Create tables
    Base.metadata.create_all(bind=engine)
    # Create OPS system
    create_ops_system()
    # Create initial admin user
    create_initial_admin()


def create_ops_system() -> None:
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        # Check if OPS system exists
        ops_system = db.query(System).filter(System.name == "OPS").first()
        if not ops_system:
            # Create OPS system
            ops_system = System(name="OPS")
            db.add(ops_system)
            db.commit()
            db.refresh(ops_system)
            print("OPS system created successfully!")
        else:
            print("OPS system already exists!")
    finally:
        db.close()

def create_initial_admin() -> None:
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        # Check if admin user exists
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            # Create admin user
            admin_in = schemas.UserCreate(
                username="admin",
                password="admin123",
                roles=[]
            )
            admin = create_user(db, obj_in=admin_in)
            
            # Get OPS system
            ops_system = db.query(System).filter(System.name == "OPS").first()
            if ops_system:
                # Create admin role in OPS system
                admin_role = UserRole(
                    user_id=admin.id,
                    system_id=ops_system.id,
                    role=UserRoleEnum.ADMIN
                )
                db.add(admin_role)
                db.commit()
                print("Admin user created successfully with OPS system access!")
            else:
                print("Warning: OPS system not found, admin user created without system access!")
        else:
            print("Admin user already exists!")
            
            # Check if admin has OPS system access
            ops_system = db.query(System).filter(System.name == "OPS").first()
            if ops_system:
                admin_role = db.query(UserRole).filter(
                    UserRole.user_id == admin.id,
                    UserRole.system_id == ops_system.id
                ).first()
                if not admin_role:
                    # Create admin role in OPS system
                    admin_role = UserRole(
                        user_id=admin.id,
                        system_id=ops_system.id,
                        role=UserRoleEnum.ADMIN
                    )
                    db.add(admin_role)
                    db.commit()
                    print("Admin user granted OPS system access!")
    finally:
        db.close()
