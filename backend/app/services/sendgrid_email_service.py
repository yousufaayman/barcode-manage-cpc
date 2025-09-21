import os
import logging
from typing import List, Optional
from datetime import datetime
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition

logger = logging.getLogger(__name__)

class SendGridEmailService:
    def __init__(self):
        self.api_key = os.getenv("SENDGRID_API_KEY")
        if not self.api_key:
            raise ValueError("SENDGRID_API_KEY environment variable is required")
        
        self.sg = SendGridAPIClient(api_key=self.api_key)
    
    def send_daily_report_email(
        self,
        pdf_filepath: str,
        recipient_emails: List[str],
        sender_email: str,
        company_name: str = "Production Management System"
    ) -> bool:
        """Send daily production report via SendGrid"""
        try:
            # Create email message
            message = Mail(
                from_email=sender_email,
                to_emails=recipient_emails,
                subject=f"Daily Production Report - {datetime.now().strftime('%Y-%m-%d')}",
                html_content=self._create_email_body(company_name)
            )
            
            # Add PDF attachment
            if os.path.exists(pdf_filepath):
                with open(pdf_filepath, 'rb') as f:
                    data = f.read()
                    f.close()
                
                encoded_file = data.encode('base64').decode()
                attachment = Attachment(
                    FileContent(encoded_file),
                    FileName(f"daily_production_report_{datetime.now().strftime('%Y%m%d')}.pdf"),
                    FileType("application/pdf"),
                    Disposition("attachment")
                )
                message.attachment = attachment
            
            # Send email
            response = self.sg.send(message)
            
            if response.status_code in [200, 201, 202]:
                logger.info(f"Daily report email sent successfully to {len(recipient_emails)} recipients")
                return True
            else:
                logger.error(f"SendGrid API error: {response.status_code} - {response.body}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending daily report email: {str(e)}")
            return False
    
    def send_email_with_attachment(
        self,
        sender_email: str,
        recipient_emails: List[str],
        subject: str,
        body: str,
        attachment_path: Optional[str] = None
    ) -> bool:
        """Send email with optional attachment via SendGrid"""
        try:
            # Create email message
            message = Mail(
                from_email=sender_email,
                to_emails=recipient_emails,
                subject=subject,
                html_content=body
            )
            
            # Add attachment if provided
            if attachment_path and os.path.exists(attachment_path):
                with open(attachment_path, 'rb') as f:
                    data = f.read()
                    f.close()
                
                encoded_file = data.encode('base64').decode()
                attachment = Attachment(
                    FileContent(encoded_file),
                    FileName(os.path.basename(attachment_path)),
                    FileType("application/pdf"),
                    Disposition("attachment")
                )
                message.attachment = attachment
            
            # Send email
            response = self.sg.send(message)
            
            if response.status_code in [200, 201, 202]:
                logger.info(f"Email sent successfully to {len(recipient_emails)} recipients")
                return True
            else:
                logger.error(f"SendGrid API error: {response.status_code} - {response.body}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending email: {str(e)}")
            return False
    
    def test_email_connection(
        self,
        sender_email: str,
        test_recipient: str
    ) -> bool:
        """Test SendGrid email connection"""
        try:
            # Create simple test email
            message = Mail(
                from_email=sender_email,
                to_emails=test_recipient,
                subject="SendGrid Test Email - Production System",
                html_content="""
                <h2>SendGrid Test Email</h2>
                <p>This is a test email from the Production Management System.</p>
                <p>If you receive this email, SendGrid integration is working correctly!</p>
                <p>Test sent at: """ + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + """</p>
                """
            )
            
            # Send test email
            response = self.sg.send(message)
            
            if response.status_code in [200, 201, 202]:
                logger.info("SendGrid test email sent successfully")
                return True
            else:
                logger.error(f"SendGrid test failed: {response.status_code} - {response.body}")
                return False
                
        except Exception as e:
            logger.error(f"SendGrid test error: {str(e)}")
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
