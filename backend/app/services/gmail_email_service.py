import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional
import logging
import os
from datetime import datetime

logger = logging.getLogger(__name__)

class GmailEmailService:
    def __init__(self):
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
        
    def send_daily_report_email(
        self,
        pdf_filepath: str,
        recipient_emails: List[str],
        sender_email: str,
        sender_password: str,
        company_name: str = "Production Management System"
    ) -> bool:
        """Send daily production report via Gmail"""
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = ", ".join(recipient_emails)
            msg['Subject'] = f"Daily Production Report - {datetime.now().strftime('%Y-%m-%d')}"
            
            # Email body
            body = self._create_email_body(company_name)
            msg.attach(MIMEText(body, 'html'))
            
            # Add PDF attachment
            if os.path.exists(pdf_filepath):
                with open(pdf_filepath, "rb") as attachment:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment.read())
                
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {os.path.basename(pdf_filepath)}'
                )
                msg.attach(part)
            
            # Create SMTP session
            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls(context=context)
                server.login(sender_email, sender_password)
                server.send_message(msg)
            
            logger.info(f"Daily report email sent successfully to {len(recipient_emails)} recipients")
            return True
            
        except Exception as e:
            logger.error(f"Error sending daily report email: {str(e)}")
            return False
    
    def send_email_with_attachment(
        self,
        sender_email: str,
        sender_password: str,
        recipient_emails: List[str],
        subject: str,
        body: str,
        attachment_path: Optional[str] = None
    ) -> bool:
        """Send email with optional attachment via Gmail"""
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = ", ".join(recipient_emails)
            msg['Subject'] = subject
            
            # Add body
            msg.attach(MIMEText(body, 'html'))
            
            # Add attachment if provided
            if attachment_path and os.path.exists(attachment_path):
                with open(attachment_path, "rb") as attachment:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment.read())
                
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {os.path.basename(attachment_path)}'
                )
                msg.attach(part)
            
            # Create SMTP session
            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls(context=context)
                server.login(sender_email, sender_password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {len(recipient_emails)} recipients")
            return True
            
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            return False
    
    def test_email_connection(
        self,
        sender_email: str,
        sender_password: str,
        test_recipient: str
    ) -> bool:
        """Test Gmail email connection"""
        try:
            # Create simple test email
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = test_recipient
            msg['Subject'] = "Gmail Test Email - Production System"
            
            body = f"""
            <h2>Gmail Test Email</h2>
            <p>This is a test email from the Production Management System.</p>
            <p>If you receive this email, Gmail integration is working correctly!</p>
            <p>Test sent at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            """
            msg.attach(MIMEText(body, 'html'))
            
            # Create SMTP session
            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls(context=context)
                server.login(sender_email, sender_password)
                server.send_message(msg)
            
            logger.info("Gmail test email sent successfully")
            return True
            
        except Exception as e:
            logger.error(f"Gmail test error: {str(e)}")
            return False
    
    def _create_email_body(self, company_name: str) -> str:
        """Create HTML email body for daily report"""
        return f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                    Daily Production Report
                </h2>
                
                <p>Dear Team,</p>
                
                <p>Please find attached the daily production report for <strong>{datetime.now().strftime('%B %d, %Y')}</strong>.</p>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #2c3e50;">Report Contents:</h3>
                    <ul>
                        <li>Executive summary with key metrics</li>
                        <li>Detailed phase-by-phase analysis</li>
                        <li>Model and color breakdowns</li>
                        <li>Time-in-phase tracking</li>
                        <li>Throughput efficiency metrics</li>
                        <li>Bottleneck identification</li>
                    </ul>
                </div>
                
                <p>The report was generated automatically by the <strong>{company_name}</strong>.</p>
                
                <p>For any questions or issues, please contact the system administrator.</p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="font-size: 12px; color: #666;">
                    This is an automated message from the Production Management System.<br>
                    Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
                </p>
            </div>
        </body>
        </html>
        """
