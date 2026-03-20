from sqlalchemy import text
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


def ensure_temp_worker_group_and_assign(working_hours: float) -> None:
    """
    Create a default `Temp` worker group and assign it to workers without a group.

    - Only assigns when `core.workers.worker_group_id IS NULL` (per operator choice).
    - Does not overwrite existing worker group assignments.
    """
    with engine.connect() as conn:
        # Get existing group_id (if any)
        group_id = conn.execute(
            text(
                """
                SELECT group_id
                FROM core.workers_groups
                WHERE group_name = 'Temp'
                """
            )
        ).scalar()

        if group_id is None:
            # Insert the group. The `group_id` primary key should auto-generate.
            conn.execute(
                text(
                    """
                    INSERT INTO core.workers_groups (group_name, working_hours)
                    VALUES ('Temp', :working_hours)
                    """
                ),
                {"working_hours": working_hours},
            )
            conn.commit()

            group_id = conn.execute(
                text(
                    """
                    SELECT group_id
                    FROM core.workers_groups
                    WHERE group_name = 'Temp'
                    """
                )
            ).scalar()

        # Assign group only for workers missing a group.
        conn.execute(
            text(
                """
                UPDATE core.workers
                SET worker_group_id = :group_id
                WHERE worker_group_id IS NULL
                """
            ),
            {"group_id": group_id},
        )
        conn.commit()


def ensure_worker_groups_fk() -> None:
    """
    Ensure `core.workers.worker_group_id` exists and is wired to `core.workers_groups`.

    Since this repo doesn't use Alembic migrations, we make this idempotent
    via conditional DDL.
    """
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'core'
                          AND table_name = 'workers'
                          AND column_name = 'worker_group_id'
                    ) THEN
                        ALTER TABLE core.workers
                        ADD COLUMN worker_group_id INTEGER;
                    END IF;
                END $$;
                """
            )
        )
        conn.commit()

        # Add FK constraint if missing (best-effort: ignore if it already exists).
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints tc
                        WHERE tc.table_schema = 'core'
                          AND tc.table_name = 'workers'
                          AND tc.constraint_name = 'fk_core_workers_worker_group_id'
                    ) THEN
                        ALTER TABLE core.workers
                        ADD CONSTRAINT fk_core_workers_worker_group_id
                        FOREIGN KEY (worker_group_id)
                        REFERENCES core.workers_groups (group_id)
                        ON DELETE SET NULL;
                    END IF;
                END $$;
                """
            )
        )
        conn.commit()


def ensure_worker_daily_assignment_working_hours_column() -> None:
    """
    Ensure `ops.worker_daily_stage_assignments.working_hours` exists and is backfilled.

    This project does not appear to use Alembic migrations, so we keep DB init
    idempotent by using `information_schema` + conditional `ALTER TABLE`.
    """
    with engine.connect() as conn:
        # Add column if missing
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'ops'
                          AND table_name = 'worker_daily_stage_assignments'
                          AND column_name = 'working_hours'
                    ) THEN
                        ALTER TABLE ops.worker_daily_stage_assignments
                        ADD COLUMN working_hours DECIMAL(4, 2);
                    END IF;
                END $$;
                """
            )
        )
        conn.commit()

        # Backfill NULL values:
        # 1) worker group's working_hours (via ops.worker_daily_stage_assignments.worker_id)
        # 2) fallback to schematic.working_hours via stage_id -> schematic_id
        conn.execute(
            text(
                """
                UPDATE ops.worker_daily_stage_assignments w
                SET working_hours = COALESCE(g.working_hours, s.working_hours)
                FROM core.workers wk
                LEFT JOIN core.workers_groups g
                  ON wk.worker_group_id = g.group_id
                JOIN core.sewing_line_stages st
                  ON w.stage_id = st.stage_id
                JOIN core.sewing_line_schematics s
                  ON st.schematic_id = s.schematic_id
                WHERE w.worker_id = wk.worker_id
                  AND w.working_hours IS NULL
                """
            )
        )
        conn.commit()

def create_ops_system() -> None:
    from app.database import SessionLocal
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
