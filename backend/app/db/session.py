from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
from app.core.config import settings
from urllib.parse import quote_plus
import pymysql
import logging
from app.models import Base

# Register PyMySQL as the MySQL driver
pymysql.install_as_MySQLdb()

# URL encode the password to handle special characters
password = quote_plus(settings.MYSQL_PASSWORD)

# First create engine without database name to create the database if it doesn't exist
initial_engine = create_engine(
    f"mysql+pymysql://{settings.MYSQL_USER}:{password}@{settings.MYSQL_HOST}:{settings.MYSQL_PORT}",
    pool_pre_ping=settings.DB_POOL_PRE_PING,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_size=5,
    max_overflow=10,
    connect_args={"charset": "utf8mb4"}
)
with initial_engine.connect() as conn:
    conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {settings.MYSQL_DATABASE}"))
    conn.commit()

SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{settings.MYSQL_USER}:{password}@{settings.MYSQL_HOST}:{settings.MYSQL_PORT}/{settings.MYSQL_DATABASE}"

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
    
    # Connection Settings
    connect_args={
        "charset": "utf8mb4",
        "autocommit": False,
        "connect_timeout": 10,
        "read_timeout": 30,
        "write_timeout": 30
    },
    
    # Engine Settings
    echo=False,  # Set to True for SQL query logging
    future=True,  # Use SQLAlchemy 2.0 style
    isolation_level="READ_COMMITTED"
)

# Create all tables
Base.metadata.create_all(bind=engine)

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