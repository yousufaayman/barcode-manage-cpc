from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
from app.core.config import settings
from urllib.parse import quote_plus
import psycopg2
import logging

# URL encode the password to handle special characters
password = quote_plus(settings.POSTGRESQL_PASSWORD)

# First create engine without database name to create the database if it doesn't exist
initial_engine = create_engine(
    f"postgresql://{settings.POSTGRESQL_USER}:{password}@{settings.POSTGRESQL_HOST}:{settings.POSTGRESQL_PORT}",
    pool_pre_ping=settings.DB_POOL_PRE_PING,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_size=5,
    max_overflow=10
)
try:
    with initial_engine.connect() as conn:
        result = conn.execute(text(f"SELECT 1 FROM pg_database WHERE datname = '{settings.POSTGRESQL_DATABASE}'")).fetchone()
        if not result:
            conn.execute(text(f"CREATE DATABASE {settings.POSTGRESQL_DATABASE}"))
            conn.commit()
except Exception as e:
    logging.warning(f"Could not create database {settings.POSTGRESQL_DATABASE}: {e}")

SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.POSTGRESQL_USER}:{password}@{settings.POSTGRESQL_HOST}:{settings.POSTGRESQL_PORT}/{settings.POSTGRESQL_DATABASE}"

# Enhanced engine with comprehensive connection pooling
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # Connection Pool Settings
    poolclass=QueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_pre_ping=settings.DB_POOL_PRE_PING,
    
    # Engine Settings
    echo=False,  # Set to True for SQL query logging
    future=True,  # Use SQLAlchemy 2.0 style
    isolation_level="READ_COMMITTED"
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Connection pool monitoring
def get_pool_status():
    """Get current connection pool status"""
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": getattr(pool, 'invalid', lambda: 0)()  # Handle missing invalid attribute
    }

# Enhanced dependency with proper session management
def get_db():
    """Database dependency with proper session management and error handling"""
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        db.rollback()
        logging.error(f"Database session error: {e}")
        raise
    finally:
        db.close()

# Connection pool event listeners for monitoring
@event.listens_for(engine, "connect")
def receive_connect(dbapi_connection, connection_record):
    """Log when a new connection is created"""
    logging.info("New database connection established")

@event.listens_for(engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    """Log when a connection is checked out from the pool"""
    logging.debug("Connection checked out from pool")

@event.listens_for(engine, "checkin")
def receive_checkin(dbapi_connection, connection_record):
    """Log when a connection is checked back into the pool"""
    logging.debug("Connection checked back into pool")