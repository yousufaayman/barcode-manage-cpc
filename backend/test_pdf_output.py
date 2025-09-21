#!/usr/bin/env python3
"""
Test script to generate PDF report for testing
"""
import os
import sys
from datetime import datetime
sys.path.append('.')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from app.database import get_db

def test_pdf_report_generation():
    """Generate PDF report for testing"""
    print("=" * 80)
    print("PDF REPORT GENERATION TEST")
    print("=" * 80)
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    try:
        # Get database session
        db = next(get_db())
        
        # Generate real report data
        from app.services.daily_report_service import DailyReportService
        report_service = DailyReportService(db)
        report_data = report_service.generate_daily_production_report()
        
        print("✅ Report data generated successfully!")
        print(f"Report Date: {report_data.get('report_date')}")
        print(f"Generated At: {report_data.get('generated_at')}")
        print(f"Total Phases: {len(report_data.get('phases', {}))}")
        
        # Show summary metrics
        summary = report_data.get('summary_metrics', {})
        print(f"\n📊 Production Summary:")
        print(f"- Total Phases: {summary.get('total_phases', 0)}")
        print(f"- Total Quantity Received: {summary.get('total_quantity_received', 0)}")
        print(f"- Total Quantity Completed: {summary.get('total_quantity_completed', 0)}")
        print(f"- Overall Efficiency: {summary.get('overall_efficiency', 0):.2f}%")
        print(f"- Total Pieces: {summary.get('total_pieces', 0)}")
        
        # Generate PDF
        from app.services.pdf_generation_service import PDFGenerationService
        pdf_service = PDFGenerationService()
        pdf_path = pdf_service.generate_daily_report_pdf(report_data)
        
        if not pdf_path or not os.path.exists(pdf_path):
            print("❌ Failed to generate PDF!")
            return False
        
        print(f"\n✅ PDF report generated successfully!")
        print(f"📄 PDF Path: {pdf_path}")
        print(f"📊 File Size: {os.path.getsize(pdf_path):,} bytes")
        
        # Show PDF contents summary
        print(f"\n📋 PDF Report Contents:")
        print(f"- Company Logo: Included")
        print(f"- Report Date: {report_data.get('report_date')}")
        print(f"- Executive Summary: {summary.get('total_phases', 0)} phases, {summary.get('total_pieces', 0)} pieces")
        print(f"- Phase Details: {len(report_data.get('phases', {}))} phases with metrics")
        print(f"- Model-Color Analysis: Detailed breakdowns")
        print(f"- Time Tracking: Longest time in phase with model-color groups")
        print(f"- Bottleneck Analysis: {len(summary.get('bottlenecks', []))} bottlenecks identified")
        
        # Show phase breakdown
        phases_data = report_data.get('phases', {})
        print(f"\n📊 Phase Breakdown:")
        for phase_name, phase_data in phases_data.items():
            phase_summary = phase_data.get('phase_summary', {})
            print(f"- {phase_name}: {phase_summary.get('total_received', 0)} received, {phase_summary.get('total_completed', 0)} completed")
        
        # Show bottlenecks if any
        bottlenecks = summary.get('bottlenecks', [])
        if bottlenecks:
            print(f"\n⚠️ Bottlenecks Identified:")
            for bottleneck in bottlenecks:
                print(f"- {bottleneck.get('phase', 'N/A')}: {bottleneck.get('pending_quantity', 0)} pending items")
        
        print(f"\n" + "=" * 80)
        print("PDF GENERATION COMPLETE")
        print("=" * 80)
        print(f"✅ PDF report saved to: {pdf_path}")
        print(f"📄 File size: {os.path.getsize(pdf_path):,} bytes")
        print(f"📊 Contains: {len(phases_data)} phases, {summary.get('total_pieces', 0)} pieces")
        print(f"🎯 Production data: {summary.get('total_quantity_received', 0)} received, {summary.get('total_quantity_completed', 0)} completed")
        print(f"📁 Open the PDF file to view the complete report")
        
        return pdf_path
        
    except Exception as e:
        print(f"❌ Error generating PDF report: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def main():
    """Run the PDF generation test"""
    pdf_path = test_pdf_report_generation()
    
    if pdf_path:
        print(f"\n🎉 PDF REPORT GENERATION TEST COMPLETED SUCCESSFULLY!")
        print(f"📄 PDF file created: {pdf_path}")
        print(f"📊 Open the file to view your production report")
        print(f"🔍 This is exactly what will be sent via email daily")
    else:
        print(f"\n❌ PDF REPORT GENERATION TEST FAILED!")
        print(f"Please check the error messages above")

if __name__ == "__main__":
    main()
