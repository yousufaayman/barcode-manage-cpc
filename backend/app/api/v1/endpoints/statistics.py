from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.crud import statistics as stats_crud
from app import schemas
from app.db.session import get_db
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

@router.get("/client/{client_id}", response_model=schemas.ClientStatisticsResponse)
def get_client_statistics(
    client_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed statistics for a specific client"""
    try:
        stats = stats_crud.get_client_statistics(db, client_id)
        if not stats:
            raise HTTPException(status_code=404, detail="Client not found")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving client statistics: {str(e)}")

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
@router.get("/model-history", response_model=schemas.ModelHistoryResponse)
def get_model_history(
    job_order_number: str = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get model history with phase timing data, optionally filtered by job order"""
    try:
        return stats_crud.get_model_history(db, job_order_number)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving model history: {str(e)}")

@router.get("/job-order-item/{item_id}/batch-details", response_model=schemas.JobOrderItemBatchDetails)
def get_job_order_item_batch_details(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """Get detailed batch information for a specific job order item"""
    try:
        return stats_crud.get_job_order_item_batch_details(db, item_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving batch details: {str(e)}")

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