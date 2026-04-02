from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
from math import ceil
from sqlalchemy import text
from app.crud import cut as cut_crud
from app import schemas
from app.db.session import get_db
from app.core.deps import get_current_user

router = APIRouter()

CUT_NOT_FOUND = "Cut not found"

@router.get(
    "/",
    response_model=schemas.CutDetailsListResponse,
    responses={
        500: {"description": "Error retrieving cuts (e.g. database or cut_details_view failure)."},
    },
)
def get_all_cuts(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[schemas.User, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Number of items per page")] = 10,
    job_order_id: Annotated[Optional[int], Query(description="Filter by job order ID")] = None,
    model_id: Annotated[Optional[int], Query(description="Filter by model ID")] = None,
    color_id: Annotated[Optional[int], Query(description="Filter by color ID")] = None,
    print_status: Annotated[
        Optional[str],
        Query(
            description="Filter by print status (pending, in_progress, completed, no_printing)"
        ),
    ] = None,
):
    """Get all cuts with their details from cut_details_view with pagination and filtering.
    
    Returns cuts sorted by created_at descending (newest first).
    """
    try:
        skip = (page - 1) * limit
        cuts, total_count = cut_crud.get_all_cut_details(
            db, 
            skip=skip, 
            limit=limit,
            job_order_id=job_order_id,
            model_id=model_id,
            color_id=color_id,
            print_status=print_status
        )
        total_pages = ceil(total_count / limit) if total_count > 0 else 0
        
        response = schemas.CutDetailsListResponse(
            cuts=cuts,
            total=total_count,
            page=page,
            limit=limit,
            total_pages=total_pages
        )
        
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving cuts: {str(e)}")

@router.get(
    "/filter-options",
    responses={
        500: {"description": "Error retrieving filter options (e.g. database or view failure)."},
    },
)
def get_filter_options(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[schemas.User, Depends(get_current_user)],
):
    """Get filter options for cuts (unique job orders, models, colors, print statuses)"""
    try:
        job_orders_result = db.execute(
            text("""
                SELECT DISTINCT job_order_id, job_order_number
                FROM ops.cut_details_view
                ORDER BY job_order_number
            """)
        )
        job_orders = [
            {"id": row.job_order_id, "number": row.job_order_number}
            for row in job_orders_result.fetchall()
        ]
        
        models_result = db.execute(
            text("""
                SELECT DISTINCT model_id, model_name
                FROM ops.cut_details_view
                WHERE model_name IS NOT NULL
                ORDER BY model_name
            """)
        )
        models = [
            {"id": row.model_id, "name": row.model_name}
            for row in models_result.fetchall()
        ]
        
        colors_result = db.execute(
            text("""
                SELECT DISTINCT color_id, color_name
                FROM ops.cut_details_view
                WHERE color_name IS NOT NULL
                ORDER BY color_name
            """)
        )
        colors = [
            {"id": row.color_id, "name": row.color_name}
            for row in colors_result.fetchall()
        ]
        
        return {
            "job_orders": job_orders,
            "models": models,
            "colors": colors,
            "print_statuses": [
                {"value": "pending", "label": "Pending"},
                {"value": "in_progress", "label": "In Progress"},
                {"value": "completed", "label": "Completed"},
                {"value": "no_printing", "label": "No Printing"}
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving filter options: {str(e)}")

@router.post(
    "/",
    response_model=schemas.CutDetailsResponse,
    responses={
        400: {"description": "Invalid cut payload or validation error."},
        500: {"description": "Cut creation failed or unexpected server error."},
    },
)
def create_cut(
    cut_in: schemas.CutCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[schemas.User, Depends(get_current_user)],
):
    """Create a new cut with optional rolls and transitions"""
    try:
        cut = cut_crud.create_cut(db, cut_in, user_id=current_user.id)
        if not cut:
            raise HTTPException(status_code=500, detail="Failed to create cut")
        return schemas.CutDetailsResponse(**cut)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating cut: {str(e)}")


@router.get(
    "/{cut_id}",
    response_model=schemas.CutDetailsResponse,
    responses={
        404: {"description": CUT_NOT_FOUND},
        500: {"description": "Error retrieving cut details."},
    },
)
def get_cut_by_id(
    cut_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[schemas.User, Depends(get_current_user)],
):
    """Get cut details by cut_id"""
    try:
        cut = cut_crud.get_cut_details_by_id(db, cut_id=cut_id)
        if not cut:
            raise HTTPException(status_code=404, detail=CUT_NOT_FOUND)
        
        # Ensure rolls and transitions are always lists (even if empty)
        if isinstance(cut, dict):
            cut['rolls'] = cut.get('rolls', [])
            cut['transitions'] = cut.get('transitions', [])
        
        # Convert dict to Pydantic model for proper serialization
        return schemas.CutDetailsResponse(**cut)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving cut: {str(e)}")

@router.put(
    "/{cut_id}",
    response_model=schemas.CutDetailsResponse,
    responses={
        400: {"description": "Invalid update payload."},
        404: {"description": f"{CUT_NOT_FOUND} or referenced resource not found."},
        500: {"description": "Error updating cut."},
    },
)
def update_cut(
    cut_id: int,
    cut_in: schemas.CutUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[schemas.User, Depends(get_current_user)],
):
    """Update an existing cut."""
    try:
        cut = cut_crud.update_cut(db, cut_id=cut_id, cut_update=cut_in, user_id=current_user.id)
        if not cut:
            raise HTTPException(status_code=404, detail=CUT_NOT_FOUND)
        return schemas.CutDetailsResponse(**cut)
    except ValueError as e:
        message = str(e)
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating cut: {str(e)}")


@router.delete(
    "/{cut_id}",
    responses={
        404: {"description": CUT_NOT_FOUND},
        500: {"description": "Error deleting cut."},
    },
)
def delete_cut(
    cut_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[schemas.User, Depends(get_current_user)],
):
    """Delete a cut and all its associated rolls and transitions."""
    try:
        result = cut_crud.delete_cut(db, cut_id=cut_id, user_id=current_user.id)
        if not result:
            raise HTTPException(status_code=404, detail=CUT_NOT_FOUND)
        return {"message": f"Cut {cut_id} deleted successfully", "cut_id": cut_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting cut: {str(e)}")

