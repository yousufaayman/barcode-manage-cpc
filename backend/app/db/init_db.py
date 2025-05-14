from app.db.session import engine
from app.models.user import Base as UserBase
# We'll add more Base imports here as we create more models

def init_db():
    # Create all tables
    UserBase.metadata.create_all(bind=engine)
    # We'll add more create_all() calls here as we add more models 