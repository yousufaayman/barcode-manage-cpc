from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.crud import statistics as stats_crud
from app import schemas
from app.api.v1.endpoints.auth import get_db
from app.core.deps import get_current_user

router = APIRouter()

@router.get("/production", response_model=schemas.ProductionStatisticsResponse)
def get_production_statistics(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get comprehensive production statistics"""
    try:
        return stats_crud.get_production_statistics(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving production statistics: {str(e)}")

@router.get("/brand/{brand_id}", response_model=schemas.BrandStatisticsResponse)
def get_brand_statistics(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed statistics for a specific brand"""
    try:
        stats = stats_crud.get_brand_statistics(db, brand_id)
        if not stats:
            raise HTTPException(status_code=404, detail="Brand not found")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving brand statistics: {str(e)}")

@router.get("/model/{model_id}", response_model=schemas.ModelStatisticsResponse)
def get_model_statistics(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed statistics for a specific model"""
    try:
        stats = stats_crud.get_model_statistics(db, model_id)
        if not stats:
            raise HTTPException(status_code=404, detail="Model not found")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving model statistics: {str(e)}")

# Keep the old endpoint for backward compatibility but mark as deprecated
@router.get("/advanced", response_model=schemas.AdvancedStatisticsResponse)
def get_advanced_statistics_endpoint(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """DEPRECATED: Use /production instead. Get advanced statistics (legacy endpoint)"""
    raise HTTPException(
        status_code=410, 
        detail="This endpoint is deprecated. Please use /statistics/production instead."
    ) 