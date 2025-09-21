#!/usr/bin/env python3
"""
Debug script to examine time values in the report data
"""
import os
import sys
from datetime import datetime
sys.path.append('.')

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from app.database import get_db

def debug_time_values():
    """Debug time values in the report data"""
    print("=" * 80)
    print("DEBUGGING TIME VALUES")
    print("=" * 80)
    
    try:
        # Get database session
        db = next(get_db())
        
        # Generate real report data
        from app.services.daily_report_service import DailyReportService
        report_service = DailyReportService(db)
        report_data = report_service.generate_daily_production_report()
        
        phases_data = report_data.get('phases', {})
        
        for phase_name, phase_data in phases_data.items():
            print(f"\n📊 PHASE: {phase_name}")
            print("-" * 60)
            
            statuses = phase_data.get('statuses', {})
            longest_times = []
            
            for status, status_data in statuses.items():
                model_color_groups = status_data.get('model_color_groups', {})
                
                for group_key, group_data in model_color_groups.items():
                    time_in_phase = group_data.get('time_in_phase', 'N/A')
                    model_name = group_data.get('model_name', 'N/A')
                    color_name = group_data.get('color_name', 'N/A')
                    
                    if time_in_phase and time_in_phase != 'N/A' and time_in_phase != '0 days':
                        print(f"  {model_name}-{color_name}: {time_in_phase}")
                        longest_times.append({
                            'time': time_in_phase,
                            'model_color': f"{model_name}-{color_name}",
                            'status': status
                        })
            
            # Show what the phase summary shows
            phase_summary = phase_data.get('phase_summary', {})
            print(f"\nPhase Summary:")
            print(f"  Longest Time: {phase_summary.get('longest_time_in_phase', 'N/A')}")
            print(f"  Model-Color: {phase_summary.get('longest_time_model_color', 'N/A')}")
            
            if longest_times:
                print(f"\nAll Time Values Found:")
                for item in longest_times:
                    print(f"  {item['model_color']} ({item['status']}): {item['time']}")
            else:
                print(f"\nNo valid time values found for this phase")
        
        return True
        
    except Exception as e:
        print(f"❌ Error debugging time values: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    debug_time_values()
