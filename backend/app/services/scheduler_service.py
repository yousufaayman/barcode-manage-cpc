import schedule
import time
import threading
from datetime import datetime, timedelta
from typing import Optional
import logging
import os
from sqlalchemy.orm import Session
from .daily_report_service import DailyReportService
from .pdf_generation_service import PDFGenerationService
from .gmail_email_service import GmailEmailService
from .file_cleanup_service import FileCleanupService
from ..database import SessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)

class SchedulerService:
    def __init__(self):
        self.is_running = False
        self.scheduler_thread: Optional[threading.Thread] = None
        self.email_service = GmailEmailService()
        self.file_cleanup_service = FileCleanupService()
        
    def start_scheduler(self):
        """Start the scheduler service"""
        if self.is_running:
            logger.warning("Scheduler is already running")
            return
        
        self.is_running = True
        
        # Schedule daily report generation at 5:00 PM (Saturday through Thursday, excluding Friday)
        schedule.every().saturday.at("17:00").do(self._generate_daily_report)
        schedule.every().sunday.at("17:00").do(self._generate_daily_report)
        schedule.every().monday.at("17:00").do(self._generate_daily_report)
        schedule.every().tuesday.at("17:00").do(self._generate_daily_report)
        schedule.every().wednesday.at("17:00").do(self._generate_daily_report)
        schedule.every().thursday.at("17:00").do(self._generate_daily_report)
        # Friday is intentionally excluded
        
        # Schedule file cleanup at 6:00 PM daily
        schedule.every().day.at("18:00").do(self._cleanup_old_files)
        
        # Start scheduler in a separate thread
        self.scheduler_thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self.scheduler_thread.start()
        
        logger.info("Scheduler service started successfully")
        logger.info("Daily reports scheduled for Saturday-Thursday at 5:00 PM")
        logger.info("File cleanup scheduled daily at 6:00 PM")
    
    def stop_scheduler(self):
        """Stop the scheduler service"""
        if not self.is_running:
            logger.warning("Scheduler is not running")
            return
        
        self.is_running = False
        schedule.clear()
        
        if self.scheduler_thread and self.scheduler_thread.is_alive():
            self.scheduler_thread.join(timeout=5)
        
        logger.info("Scheduler service stopped")
    
    def _run_scheduler(self):
        """Run the scheduler loop"""
        logger.info("Scheduler loop started")
        
        while self.is_running:
            try:
                schedule.run_pending()
                time.sleep(60)  # Check every minute
            except Exception as e:
                logger.error(f"Error in scheduler loop: {str(e)}")
                time.sleep(60)  # Continue running even if there's an error
        
        logger.info("Scheduler loop stopped")
    
    def _generate_daily_report(self):
        """Generate and send daily production report"""
        logger.info("Starting daily report generation")
        
        db = SessionLocal()
        try:
            # Generate report data
            report_service = DailyReportService(db)
            report_data = report_service.generate_daily_production_report()
            
            # Generate PDF
            pdf_service = PDFGenerationService(reports_dir=settings.REPORTS_DIR)
            pdf_filepath = pdf_service.generate_daily_report_pdf(report_data)
            
            # Send email
            success = self._send_report_email(pdf_filepath)
            
            if success:
                logger.info("Daily report generated and sent successfully")
            else:
                logger.error("Failed to send daily report email")
                
        except Exception as e:
            logger.error(f"Error generating daily report: {str(e)}")
            self._send_error_notification(str(e))
        finally:
            db.close()
    
    def _send_report_email(self, pdf_filepath: str) -> bool:
        """Send the report email"""
        try:
            # Get email configuration from environment variables
            sender_email = os.getenv("REPORT_SENDER_EMAIL")
            sender_password = os.getenv("REPORT_SENDER_PASSWORD")
            recipient_emails_str = os.getenv("REPORT_RECIPIENT_EMAILS", "")
            company_name = os.getenv("COMPANY_NAME", "Production Management System")
            
            if not all([sender_email, sender_password, recipient_emails_str]):
                logger.error("Email configuration missing. Please set REPORT_SENDER_EMAIL, REPORT_SENDER_PASSWORD, and REPORT_RECIPIENT_EMAILS environment variables.")
                return False
            
            recipient_emails = [email.strip() for email in recipient_emails_str.split(",") if email.strip()]
            
            if not recipient_emails:
                logger.error("No recipient emails configured")
                return False
            
            return self.email_service.send_daily_report_email(
                pdf_filepath=pdf_filepath,
                recipient_emails=recipient_emails,
                sender_email=sender_email,
                sender_password=sender_password,
                company_name=company_name
            )
            
        except Exception as e:
            logger.error(f"Error sending report email: {str(e)}")
            return False
    
    def _send_error_notification(self, error_message: str):
        """Send error notification email"""
        try:
            sender_email = os.getenv("REPORT_SENDER_EMAIL")
            sender_password = os.getenv("REPORT_SENDER_PASSWORD")
            recipient_emails_str = os.getenv("REPORT_RECIPIENT_EMAILS", "")
            company_name = os.getenv("COMPANY_NAME", "Production Management System")
            
            if not all([sender_email, sender_password, recipient_emails_str]):
                logger.error("Cannot send error notification - email configuration missing")
                return
            
            recipient_emails = [email.strip() for email in recipient_emails_str.split(",") if email.strip()]
            
            if recipient_emails:
                self.email_service.send_error_notification(
                    error_message=error_message,
                    recipient_emails=recipient_emails,
                    sender_email=sender_email,
                    sender_password=sender_password,
                    company_name=company_name
                )
                
        except Exception as e:
            logger.error(f"Error sending error notification: {str(e)}")
    
    def _cleanup_old_files(self):
        """Clean up old report files"""
        logger.info("Starting file cleanup")
        
        try:
            self.file_cleanup_service.cleanup_old_reports()
            logger.info("File cleanup completed successfully")
        except Exception as e:
            logger.error(f"Error during file cleanup: {str(e)}")
    
    def get_next_report_time(self) -> Optional[str]:
        """Get the next scheduled report time"""
        try:
            # Get the next scheduled job
            jobs = schedule.get_jobs()
            report_jobs = [job for job in jobs if 'daily_report' in str(job.job_func)]
            
            if report_jobs:
                next_run = min(job.next_run for job in report_jobs)
                return next_run.strftime("%Y-%m-%d %H:%M:%S")
            
            return None
        except Exception as e:
            logger.error(f"Error getting next report time: {str(e)}")
            return None
    
    def get_scheduler_status(self) -> dict:
        """Get current scheduler status"""
        return {
            "is_running": self.is_running,
            "next_report_time": self.get_next_report_time(),
            "scheduled_jobs": len(schedule.get_jobs()),
            "current_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "schedule_days": "Saturday through Thursday (excluding Friday)"
        }
    
    def trigger_manual_report(self) -> dict:
        """Manually trigger report generation (for testing or immediate needs)"""
        logger.info("Manual report generation triggered")
        
        try:
            self._generate_daily_report()
            return {
                "success": True,
                "message": "Report generated and sent successfully",
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Error in manual report generation: {str(e)}")
            return {
                "success": False,
                "message": f"Error generating report: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
