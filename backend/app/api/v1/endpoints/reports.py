from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

from app import schemas
from app.core.config import settings
from app.core.deps import get_current_user
from app.crud.tracking import get_sewing_daily_report_data
from app.db.session import get_db
from app.services.report_pdf_service import ReportPDFService
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/daily-cutting-report")
async def generate_daily_cutting_report(
    date: str = Query(..., description="Report date in YYYY-MM-DD format"),
    client_name: Optional[str] = Query(None, description="Filter by client name"),
    model_name: Optional[str] = Query(None, description="Filter by model name"),
    job_order_number: Optional[str] = Query(
        None, description="Filter by job order number"
    ),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
):
    """
    Generate a daily Cutting production PDF report with an appended Sewing section.

    The report uses the same aggregation logic as the Cutting breakdown view:
    it groups by Client / Model, then by Job Order, then by Color, and
    shows per-cut rows with size breakdown, printing status, and
    consumption (m/kg), plus color and job-order totals.
    """
    try:
        from datetime import datetime as _dt

        try:
            target_date = _dt.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid date format. Expected YYYY-MM-DD.",
            )

        service = ReportPDFService(reports_dir=settings.REPORTS_DIR)
        pdf_path = service.generate_daily_cutting_report(
            db=db,
            target_date=target_date,
            client_name=client_name,
            model_name=model_name,
            job_order_number=job_order_number,
        )

        if not pdf_path or not os.path.exists(pdf_path):
            raise HTTPException(
                status_code=500, detail="Failed to generate Cutting report PDF"
            )

        filename = os.path.basename(pdf_path)
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating daily cutting report: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate daily cutting report: {str(e)}",
        )


@router.get("/sewing-daily-data")
async def get_sewing_daily_data(
    date: str = Query(..., description="Report date in YYYY-MM-DD format"),
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Return Sewing daily report data (phases → schematics → stages) for a single date.
    """
    from datetime import datetime as _dt

    try:
        target_date = _dt.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Expected YYYY-MM-DD.",
        )

    data = get_sewing_daily_report_data(db, target_date)
    return data