from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import crud, schemas
from app.api.v1.endpoints.auth import get_db
from app.core.deps import get_current_active_superuser

router = APIRouter()

@router.get("/advanced", response_model=schemas.AdvancedStatisticsResponse)
def get_advanced_statistics_endpoint(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_active_superuser)
):
    return crud.get_advanced_statistics(db) 