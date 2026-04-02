from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app import crud, schemas
from typing import Annotated, List

router = APIRouter()

@router.get("/", response_model=List[schemas.ProductionPhase])
def read_phases(
    db: Annotated[Session, Depends(get_db)],
    skip: int = 0,
    limit: int = 100,
):
    return crud.phase.get_phases(db, skip=skip, limit=limit)