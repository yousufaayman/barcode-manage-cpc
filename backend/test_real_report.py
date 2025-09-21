#!/usr/bin/env python3
"""
Test script to send the actual production report via email
"""
import os
import sys
from datetime import datetime
sys.path.append('.')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from app.services.gmail_email_service import GmailEmailService
from app.services.pdf_generation_service import PDFGenerationService
from app.database import get_db

def send_real_production_report():
    """Generate and send the actual production report"""
    print("=" * 60)
    print("SENDING REAL PRODUCTION REPORT")
    print("=" * 60)
    
    try:
        # Get database session
        db = next(get_db())
        
        # Generate real report data
        from app.services.daily_report_service import DailyReportService
        report_service = DailyReportService(db)
        report_data = report_service.generate_daily_production_report()
        
        print("✅ Real production report data generated!")
        print(f"Report Date: {report_data.get('report_date')}")
        print(f"Generated At: {report_data.get('generated_at')}")
        print(f"Phases: {len(report_data.get('phases', {}))}")
        
        # Show summary metrics
        summary = report_data.get('summary_metrics', {})
        print(f"\n📊 Production Summary:")
        print(f"- Total Phases: {summary.get('total_phases', 0)}")
        print(f"- Total Quantity Received: {summary.get('total_quantity_received', 0)}")
        print(f"- Total Quantity Completed: {summary.get('total_quantity_completed', 0)}")
        print(f"- Overall Efficiency: {summary.get('overall_efficiency', 0):.2f}%")
        print(f"- Total Batches: {summary.get('total_batches', 0)}")
        
        # Generate PDF
        pdf_service = PDFGenerationService()
        pdf_path = pdf_service.generate_daily_report_pdf(report_data)
        
        if not pdf_path or not os.path.exists(pdf_path):
            print("❌ Failed to generate PDF!")
            return False
        
        print(f"\n✅ Real production PDF generated!")
        print(f"PDF Path: {pdf_path}")
        print(f"File Size: {os.path.getsize(pdf_path):,} bytes")
        
        # Get email configuration
        sender_email = os.getenv("REPORT_SENDER_EMAIL")
        sender_password = os.getenv("REPORT_SENDER_PASSWORD")
        recipient_emails_str = os.getenv("REPORT_RECIPIENT_EMAILS", "")
        recipient_emails = [email.strip() for email in recipient_emails_str.split(",") if email.strip()]
        company_name = os.getenv("COMPANY_NAME", "Production Management System")
        
        print(f"\n📧 Email Configuration:")
        print(f"Sender: {sender_email}")
        print(f"Recipients: {recipient_emails}")
        print(f"Company: {company_name}")
        
        # Send real production report via email
        email_service = GmailEmailService()
        success = email_service.send_daily_report_email(
            pdf_filepath=pdf_path,
            recipient_emails=recipient_emails,
            sender_email=sender_email,
            sender_password=sender_password,
            company_name=company_name
        )
        
        if success:
            print(f"\n🎉 SUCCESS! Real production report sent!")
            print(f"📧 Email delivered to: {', '.join(recipient_emails)}")
            print(f"📄 PDF attached: {os.path.basename(pdf_path)}")
            print(f"📊 Report contains: {summary.get('total_batches', 0)} batches across {summary.get('total_phases', 0)} phases")
            return True
        else:
            print("❌ Failed to send real production report!")
            return False
            
    except Exception as e:
        print(f"❌ Error sending real production report: {str(e)}")
        return False
    finally:
        # Clean up PDF file
        if 'pdf_path' in locals() and os.path.exists(pdf_path):
            try:
                os.remove(pdf_path)
                print(f"\n🧹 Cleaned up temporary PDF: {os.path.basename(pdf_path)}")
            except:
                pass

def main():
    """Send the real production report"""
    print("REAL PRODUCTION REPORT EMAIL TEST")
    print("=" * 60)
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("This will send the ACTUAL production report via email")
    print("=" * 60)
    
    # Send real report
    success = send_real_production_report()
    
    # Summary
    print("\n" + "=" * 60)
    print("REAL REPORT TEST SUMMARY")
    print("=" * 60)
    
    if success:
        print("✅ REAL PRODUCTION REPORT SENT SUCCESSFULLY!")
        print("📧 Check your email for the actual production report")
        print("📊 The report contains real data from your production system")
        print("🎯 This is exactly what will be sent automatically every day")
    else:
        print("❌ FAILED TO SEND REAL PRODUCTION REPORT")
        print("Please check the error messages above")
    
    return success

if __name__ == "__main__":
    main()
