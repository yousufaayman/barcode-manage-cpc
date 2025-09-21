from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from app.database import get_db
from app.core.deps import get_current_user
from app import schemas
from app.services.pdf_generation_service import PDFGenerationService
from app.services.gmail_email_service import GmailEmailService
from app.services.scheduler_service import SchedulerService
from app.services.file_cleanup_service import FileCleanupService
import logging
import os
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Global scheduler service instance
scheduler_service = SchedulerService()

@router.get("/status")
async def get_report_system_status(current_user: schemas.User = Depends(get_current_user)):
    """Get the current status of the report system"""
    try:
        return {
            "status": "active",
            "scheduler_running": scheduler_service.is_running,
            "message": "Report system is operational"
        }
    except Exception as e:
        logger.error(f"Error getting report system status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get report system status")

@router.post("/generate")
async def generate_daily_report(
    background_tasks: BackgroundTasks,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually trigger daily report generation"""
    try:
        from app.services.daily_report_service import DailyReportService
        
        # Generate report data
        report_service = DailyReportService(db)
        report_data = report_service.generate_daily_production_report()
        
        # Generate PDF
        pdf_service = PDFGenerationService(reports_dir=settings.REPORTS_DIR)
        pdf_filepath = pdf_service.generate_daily_report_pdf(report_data)
        
        if not pdf_filepath or not os.path.exists(pdf_filepath):
            raise HTTPException(status_code=500, detail="Failed to generate PDF report")
        
        return {
            "success": True,
            "message": "Daily report generated successfully",
            "pdf_path": pdf_filepath,
            "file_size": os.path.getsize(pdf_filepath)
        }
        
    except Exception as e:
        logger.error(f"Error generating daily report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@router.post("/send-test-email")
async def send_test_email(current_user: schemas.User = Depends(get_current_user)):
    """Send a test email to verify email configuration"""
    try:
        # Get email configuration
        sender_email = os.getenv("REPORT_SENDER_EMAIL")
        sender_password = os.getenv("REPORT_SENDER_PASSWORD")
        recipient_emails_str = os.getenv("REPORT_RECIPIENT_EMAILS", "")
        
        if not all([sender_email, sender_password, recipient_emails_str]):
            raise HTTPException(
                status_code=400, 
                detail="Email configuration missing. Please set REPORT_SENDER_EMAIL, REPORT_SENDER_PASSWORD, and REPORT_RECIPIENT_EMAILS environment variables."
            )
        
        recipient_emails = [email.strip() for email in recipient_emails_str.split(",") if email.strip()]
        
        if not recipient_emails:
            raise HTTPException(status_code=400, detail="No recipient emails configured")
        
        # Test email service
        email_service = GmailEmailService()
        test_recipient = recipient_emails[0]
        
        success = email_service.test_email_connection(
            sender_email=sender_email,
            sender_password=sender_password,
            test_recipient=test_recipient
        )
        
        if success:
            return {
                "success": True,
                "message": f"Test email sent successfully to {test_recipient}"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to send test email")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending test email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {str(e)}")

@router.post("/send-report")
async def send_daily_report(
    background_tasks: BackgroundTasks,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate and send daily report via email"""
    try:
        from app.services.daily_report_service import DailyReportService
        
        # Generate report data
        report_service = DailyReportService(db)
        report_data = report_service.generate_daily_production_report()
        
        # Generate PDF
        pdf_service = PDFGenerationService(reports_dir=settings.REPORTS_DIR)
        pdf_filepath = pdf_service.generate_daily_report_pdf(report_data)
        
        if not pdf_filepath or not os.path.exists(pdf_filepath):
            raise HTTPException(status_code=500, detail="Failed to generate PDF report")
        
        # Get email configuration
        sender_email = os.getenv("REPORT_SENDER_EMAIL")
        sender_password = os.getenv("REPORT_SENDER_PASSWORD")
        recipient_emails_str = os.getenv("REPORT_RECIPIENT_EMAILS", "")
        company_name = os.getenv("COMPANY_NAME", "Production Management System")
        
        if not all([sender_email, sender_password, recipient_emails_str]):
            raise HTTPException(
                status_code=400, 
                detail="Email configuration missing. Please set REPORT_SENDER_EMAIL, REPORT_SENDER_PASSWORD, and REPORT_RECIPIENT_EMAILS environment variables."
            )
        
        recipient_emails = [email.strip() for email in recipient_emails_str.split(",") if email.strip()]
        
        if not recipient_emails:
            raise HTTPException(status_code=400, detail="No recipient emails configured")
        
        # Send email
        email_service = GmailEmailService()
        success = email_service.send_daily_report_email(
            pdf_filepath=pdf_filepath,
            recipient_emails=recipient_emails,
            sender_email=sender_email,
            sender_password=sender_password,
            company_name=company_name
        )
        
        if success:
            return {
                "success": True,
                "message": f"Daily report sent successfully to {len(recipient_emails)} recipients",
                "recipients": recipient_emails,
                "pdf_path": pdf_filepath
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending daily report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send report: {str(e)}")

@router.post("/start-scheduler")
async def start_scheduler(current_user: schemas.User = Depends(get_current_user)):
    """Start the report scheduler service"""
    try:
        if scheduler_service.is_running:
            return {
                "success": True,
                "message": "Scheduler is already running"
            }
        
        scheduler_service.start_scheduler()
        
        return {
            "success": True,
            "message": "Report scheduler started successfully"
        }
        
    except Exception as e:
        logger.error(f"Error starting scheduler: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start scheduler: {str(e)}")

@router.post("/stop-scheduler")
async def stop_scheduler(current_user: schemas.User = Depends(get_current_user)):
    """Stop the report scheduler service"""
    try:
        if not scheduler_service.is_running:
            return {
                "success": True,
                "message": "Scheduler is not running"
            }
        
        scheduler_service.stop_scheduler()
        
        return {
            "success": True,
            "message": "Report scheduler stopped successfully"
        }
        
    except Exception as e:
        logger.error(f"Error stopping scheduler: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to stop scheduler: {str(e)}")

@router.post("/cleanup-files")
async def cleanup_old_files(current_user: schemas.User = Depends(get_current_user)):
    """Manually trigger file cleanup"""
    try:
        cleanup_service = FileCleanupService()
        result = cleanup_service.cleanup_old_files()
        
        return {
            "success": True,
            "message": "File cleanup completed",
            "files_deleted": result.get("files_deleted", 0),
            "space_freed": result.get("space_freed", 0)
        }
        
    except Exception as e:
        logger.error(f"Error during file cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup files: {str(e)}")

@router.get("/configuration")
async def get_email_configuration(current_user: schemas.User = Depends(get_current_user)):
    """Get current email configuration (without sensitive data)"""
    try:
        sender_email = os.getenv("REPORT_SENDER_EMAIL", "")
        recipient_emails_str = os.getenv("REPORT_RECIPIENT_EMAILS", "")
        company_name = os.getenv("COMPANY_NAME", "Production Management System")
        retention_days = os.getenv("REPORT_RETENTION_DAYS", "30")
        
        recipient_emails = [email.strip() for email in recipient_emails_str.split(",") if email.strip()]
        
        return {
            "sender_email": sender_email,
            "recipient_emails": recipient_emails,
            "company_name": company_name,
            "retention_days": int(retention_days),
            "scheduler_running": scheduler_service.is_running,
            "configuration_complete": bool(sender_email and recipient_emails)
        }
        
    except Exception as e:
        logger.error(f"Error getting configuration: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get configuration")