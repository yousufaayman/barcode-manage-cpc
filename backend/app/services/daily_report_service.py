from sqlalchemy.orm import Session
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta, date
from .. import models
from ..api.v1.endpoints.batches import get_current_batches_by_phase
import logging
import os

logger = logging.getLogger(__name__)

class DailyReportService:
    def __init__(self, db: Session):
        self.db = db

    def generate_daily_production_report(self) -> Dict[str, Any]:
        """Generate comprehensive daily production report with all required metrics"""
        try:
            # Get current batches by phase data (same as frontend)
            phases_data = get_current_batches_by_phase(self.db)
            
            # Get available phases
            available_phases = self._get_available_phases()
            
            # Process each phase data
            report_data = {
                "report_date": datetime.now().strftime("%Y-%m-%d"),
                "generated_at": datetime.now().isoformat(),
                "phases": {},
                "summary_metrics": {},
                "completed_today": {},
                "completed_today_items": {}
            }
            
            # Process each phase
            for phase in available_phases:
                phase_name = phase["phase_name"]
                if phase_name in phases_data:
                    report_data["phases"][phase_name] = self._process_phase_data(
                        phase_name, phases_data[phase_name]
                    )
            
            # Add Completed Today for Cutting and Sewing phases
            report_data["completed_today"] = self._get_completed_today_groups()
            report_data["completed_today_items"] = self._get_completed_today_items()
            
            # Calculate summary metrics
            report_data["summary_metrics"] = self._calculate_summary_metrics(report_data["phases"])
            
            return report_data
            
        except Exception as e:
            logger.error(f"Error generating daily production report: {str(e)}")
            raise

    def _get_available_phases(self) -> List[Dict[str, Any]]:
        """Get available production phases"""
        phases = self.db.query(
            models.ProductionPhase.phase_id,
            models.ProductionPhase.phase_name
        ).order_by(models.ProductionPhase.phase_id).all()
        
        return [{"phase_id": phase.phase_id, "phase_name": phase.phase_name} for phase in phases]

    def _get_completed_today_groups(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get model-color groups completed today for Cutting and Sewing phases"""
        try:
            # Determine today (database date)
            from sqlalchemy import func
            current_db_date = self.db.query(func.date(func.now())).scalar()

            # Get phase ids for Cutting and Sewing phases
            phases = self.db.query(models.ProductionPhase).all()
            phase_name_by_id = {p.phase_id: p.phase_name for p in phases}
            sewing_phase_ids = [p.phase_id for p in phases if p.phase_name.startswith('Sewing')]
            cutting_phase_ids = [p.phase_id for p in phases if p.phase_name == 'Cutting']
            target_phase_ids = cutting_phase_ids + sewing_phase_ids
            if not target_phase_ids:
                return {}

            # Subquery: distinct batches moved to Completed today in target phases
            from sqlalchemy import distinct
            completed_today_subq = self.db.query(
                models.BarcodeScanEvent.batch_id.label('batch_id'),
                models.BarcodeScanEvent.phase_id.label('phase_id')
            ).filter(
                models.BarcodeScanEvent.phase_id.in_(target_phase_ids),
                models.BarcodeScanEvent.new_status == 'Completed',
                func.date(models.BarcodeScanEvent.scanned_at) == current_db_date
            ).distinct(models.BarcodeScanEvent.batch_id, models.BarcodeScanEvent.phase_id).subquery()

            # Join batches and lookup model/color names and quantities
            q = (
                self.db.query(
                    completed_today_subq.c.phase_id,
                    models.Model.model_name,
                    models.Color.color_name,
                    func.sum(models.Batch.quantity).label('qty')
                )
                .join(models.Batch, models.Batch.batch_id == completed_today_subq.c.batch_id)
                .join(models.JobOrder, models.JobOrder.job_order_id == models.Batch.job_order_id)
                .join(models.Model, models.Model.model_id == models.JobOrder.model_id)
                .join(models.Color, models.Color.color_id == models.Batch.color_id)
                .group_by(completed_today_subq.c.phase_id, models.Model.model_name, models.Color.color_name)
            )

            results = q.all()
            completed_by_phase: Dict[str, List[Dict[str, Any]]] = {}
            for phase_id, model_name, color_name, qty in results:
                phase_name = phase_name_by_id.get(phase_id, str(phase_id))
                if phase_name not in completed_by_phase:
                    completed_by_phase[phase_name] = []
                completed_by_phase[phase_name].append({
                    "model_name": model_name,
                    "color_name": color_name,
                    "quantity": int(qty or 0)
                })
            return completed_by_phase
        except Exception as e:
            logger.error(f"Error aggregating completed today groups: {str(e)}")
            return {}

    def _get_completed_today_items(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get job order items completed today for Cutting and Sewing phases (JO number/model/color/size)."""
        try:
            from sqlalchemy import func
            current_db_date = self.db.query(func.date(func.now())).scalar()
            phases = self.db.query(models.ProductionPhase).all()
            phase_name_by_id = {p.phase_id: p.phase_name for p in phases}
            target_phase_ids = [p.phase_id for p in phases if p.phase_name == 'Cutting' or p.phase_name.startswith('Sewing')]
            if not target_phase_ids:
                return {}

            completed_today_subq = self.db.query(
                models.BarcodeScanEvent.batch_id.label('batch_id'),
                models.BarcodeScanEvent.phase_id.label('phase_id')
            ).filter(
                models.BarcodeScanEvent.phase_id.in_(target_phase_ids),
                models.BarcodeScanEvent.new_status == 'Completed',
                func.date(models.BarcodeScanEvent.scanned_at) == current_db_date
            ).distinct(models.BarcodeScanEvent.batch_id, models.BarcodeScanEvent.phase_id).subquery()

            q = (
                self.db.query(
                    completed_today_subq.c.phase_id,
                    models.JobOrder.job_order_number,
                    models.Model.model_name,
                    models.Color.color_name,
                    models.Size.size_value,
                    func.sum(models.Batch.quantity).label('qty')
                )
                .join(models.Batch, models.Batch.batch_id == completed_today_subq.c.batch_id)
                .join(models.JobOrder, models.JobOrder.job_order_id == models.Batch.job_order_id)
                .join(models.Model, models.Model.model_id == models.JobOrder.model_id)
                .join(models.Color, models.Color.color_id == models.Batch.color_id)
                .join(models.Size, models.Size.size_id == models.Batch.size_id)
                .group_by(
                    completed_today_subq.c.phase_id,
                    models.JobOrder.job_order_number,
                    models.Model.model_name,
                    models.Color.color_name,
                    models.Size.size_value
                )
            )

            results = q.all()
            items_by_phase: Dict[str, List[Dict[str, Any]]] = {}
            for phase_id, jo_number, model_name, color_name, size_value, qty in results:
                phase_name = phase_name_by_id.get(phase_id, str(phase_id))
                if phase_name not in items_by_phase:
                    items_by_phase[phase_name] = []
                items_by_phase[phase_name].append({
                    "job_order_number": jo_number,
                    "model_name": model_name,
                    "color_name": color_name,
                    "size_value": size_value,
                    "quantity": int(qty or 0)
                })
            return items_by_phase
        except Exception as e:
            logger.error(f"Error aggregating completed today items: {str(e)}")
            return {}

    def _process_phase_data(self, phase_name: str, phase_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process individual phase data for the report"""
        processed_data = {
            "phase_name": phase_name,
            "statuses": {},
            "phase_summary": {
                "total_received": 0,
                "total_completed": 0,
                "throughput_efficiency": 0.0,
                "longest_time_in_phase": "0 days",
                "longest_time_model_color": "",
                "total_pieces": 0
            }
        }
        
        # Process each status in the phase
        for status, status_data in phase_data.items():
            if status == "daily_throughput":
                # Skip phase-level daily_throughput - we'll aggregate from status-level data
                continue
                
            processed_data["statuses"][status] = self._process_status_data(status, status_data)
        
        # Calculate phase-level metrics
        self._calculate_phase_metrics(processed_data)
        
        return processed_data

    def _process_status_data(self, status: str, status_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process status-specific data with model-color-size aggregation"""
        processed_status = {
            "status": status,
            "model_color_groups": {},
            "aggregated_metrics": {
                "total_quantity": 0,
                "total_expected_quantity": 0,
                "total_batches": 0,
                "longest_time_in_phase": "0 days",
                "model_count": 0,
                "color_count": 0
            }
        }
        
        # Preserve daily_throughput data from the original status_data
        if "daily_throughput" in status_data:
            processed_status["daily_throughput"] = status_data["daily_throughput"]
        
        if "model_color_groups" in status_data:
            model_color_groups = status_data["model_color_groups"]
            time_in_phase_values = []
            models_seen = set()
            colors_seen = set()
            
            for group_key, group_data in model_color_groups.items():
                # Process model-color group
                processed_group = self._process_model_color_group(group_data)
                processed_status["model_color_groups"][group_key] = processed_group
                
                # Track unique models and colors
                if group_data.get("model_name"):
                    models_seen.add(group_data["model_name"])
                if group_data.get("color_name"):
                    colors_seen.add(group_data["color_name"])
                
                # Aggregate metrics
                processed_status["aggregated_metrics"]["total_quantity"] += group_data.get("total_quantity", 0)
                processed_status["aggregated_metrics"]["total_expected_quantity"] += group_data.get("expected_quantity", 0)
                processed_status["aggregated_metrics"]["total_batches"] += group_data.get("batch_count", 0)
                
                # Collect time in phase for calculations
                if group_data.get("time_in_phase"):
                    time_in_phase_values.append(self._parse_time_in_phase(group_data["time_in_phase"]))
                
                # Process sizes for additional metrics
                for size in group_data.get("sizes", []):
                    if size.get("time_in_phase"):
                        time_in_phase_values.append(self._parse_time_in_phase(size["time_in_phase"]))
                
                for size in group_data.get("second_degree_sizes", []):
                    if size.get("time_in_phase"):
                        time_in_phase_values.append(self._parse_time_in_phase(size["time_in_phase"]))
            
            # Set unique counts
            processed_status["aggregated_metrics"]["model_count"] = len(models_seen)
            processed_status["aggregated_metrics"]["color_count"] = len(colors_seen)
            
            # Calculate time metrics
            if time_in_phase_values:
                processed_status["aggregated_metrics"]["longest_time_in_phase"] = self._format_time_in_phase(max(time_in_phase_values))
        
        return processed_status

    def _process_model_color_group(self, group_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process individual model-color group data with size aggregation"""
        processed_group = {
            "model_name": group_data.get("model_name", ""),
            "color_name": group_data.get("color_name", ""),
            "total_quantity": group_data.get("total_quantity", 0),
            "expected_quantity": group_data.get("expected_quantity", 0),
            "batch_count": group_data.get("batch_count", 0),
            "time_in_phase": group_data.get("time_in_phase", "0 days"),
            "sizes": [],
            "second_degree_sizes": [],
            "size_aggregation": {},
            "completion_percentage": 0.0
        }
        
        # Calculate completion percentage
        if processed_group["expected_quantity"] > 0:
            processed_group["completion_percentage"] = min(100.0, 
                (processed_group["total_quantity"] / processed_group["expected_quantity"]) * 100.0)
        
        # Process regular sizes
        for size in group_data.get("sizes", []):
            processed_size = self._process_size_data(size, is_second_degree=False)
            processed_group["sizes"].append(processed_size)
            processed_group["size_aggregation"][size.get("size_value", "")] = processed_size
        
        # Process second degree sizes
        for size in group_data.get("second_degree_sizes", []):
            processed_size = self._process_size_data(size, is_second_degree=True)
            processed_group["second_degree_sizes"].append(processed_size)
            processed_group["size_aggregation"][f"{size.get('size_value', '')}_2nd"] = processed_size
        
        return processed_group

    def _process_size_data(self, size: Dict[str, Any], is_second_degree: bool = False) -> Dict[str, Any]:
        """Process individual size data"""
        processed_size = {
            "size_value": size.get("size_value", ""),
            "quantity": size.get("quantity", 0),
            "expected_quantity": size.get("expected_quantity", 0),
            "batch_count": size.get("batch_count", 0),
            "time_in_phase": size.get("time_in_phase", "0 days"),
            "completion_percentage": self._calculate_completion_percentage(
                size.get("quantity", 0), size.get("expected_quantity", 0)
            ),
            "is_second_degree": is_second_degree
        }
        
        return processed_size

    def _calculate_phase_metrics(self, phase_data: Dict[str, Any]) -> None:
        """Calculate phase-level metrics"""
        total_batches = 0
        time_values = []
        longest_time_info = {"time": 0, "model_color": ""}
        
        # Copy implementation from AdvancedStatisticsProductionPhasesOverview.tsx "In Progress" tab
        total_received = 0  # "Scanned In" from In Progress status
        total_completed = 0  # "Moved to Completed" from In Progress status
        
        # Calculate total pieces (sum of all batch quantities) from all statuses
        for status, status_data in phase_data.get("statuses", {}).items():
            total_batches += status_data.get("aggregated_metrics", {}).get("total_quantity", 0)
        
        # Get daily throughput from "In Progress" status only (copying frontend logic)
        if "In Progress" in phase_data.get("statuses", {}):
            in_progress_data = phase_data["statuses"]["In Progress"]
            if "daily_throughput" in in_progress_data:
                daily_throughput = in_progress_data["daily_throughput"]
                total_received = daily_throughput.get("scanned_in", 0)  # "Scanned In"
                total_completed = daily_throughput.get("completed", 0)  # "Moved to Completed"
        
        # Find longest time in phase from model-color groups (from all statuses)
        for status, status_data in phase_data.get("statuses", {}).items():
            model_color_groups = status_data.get("model_color_groups", {})
            for group_key, group_data in model_color_groups.items():
                time_in_phase = group_data.get("time_in_phase", "0 days")
                if time_in_phase != "0 days":
                    time_value = self._parse_time_in_phase(time_in_phase)
                    if time_value > longest_time_info["time"]:
                        longest_time_info["time"] = time_value
                        longest_time_info["model_color"] = f"{group_data.get('model_name', '')}-{group_data.get('color_name', '')}"
                        longest_time_info["time_str"] = time_in_phase
        
        # Update phase summary with calculated values
        phase_data["phase_summary"]["total_pieces"] = total_batches
        phase_data["phase_summary"]["total_received"] = total_received
        phase_data["phase_summary"]["total_completed"] = total_completed
        
        # Set longest time info
        if longest_time_info["time"] > 0:
            phase_data["phase_summary"]["longest_time_in_phase"] = longest_time_info["time_str"]
            phase_data["phase_summary"]["longest_time_model_color"] = longest_time_info["model_color"]
        
        # Calculate throughput efficiency
        if total_received > 0:
            phase_data["phase_summary"]["throughput_efficiency"] = (total_completed / total_received) * 100

    def _calculate_summary_metrics(self, phases_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate summary metrics across all phases"""
        summary = {
            "total_phases": len(phases_data),
            "total_quantity_received": 0,
            "total_quantity_completed": 0,
            "overall_efficiency": 0.0,
            "total_pieces": 0,
            "phases_with_issues": [],
            "bottlenecks": [],
            "longest_overall_time": "0 days"
        }
        
        time_values = []
        
        for phase_name, phase_data in phases_data.items():
            phase_summary = phase_data.get("phase_summary", {})
            
            # Aggregate quantities
            summary["total_quantity_received"] += phase_summary.get("total_received", 0)
            summary["total_quantity_completed"] += phase_summary.get("total_completed", 0)
            summary["total_pieces"] += phase_summary.get("total_pieces", 0)
            
            # Collect time values
            longest_time = phase_summary.get("longest_time_in_phase", "0 days")
            if longest_time != "0 days":
                time_values.append(self._parse_time_in_phase(longest_time))
            
            # Check for bottlenecks (phases with high pending counts)
            for status, status_data in phase_data.get("statuses", {}).items():
                if status == "Pending":
                    total_quantity = status_data.get("aggregated_metrics", {}).get("total_quantity", 0)
                    if total_quantity > 100:  # Threshold for bottleneck
                        summary["bottlenecks"].append({
                            "phase": phase_name,
                            "pending_quantity": total_quantity
                        })
        
        # Calculate overall efficiency
        if summary["total_quantity_received"] > 0:
            summary["overall_efficiency"] = (summary["total_quantity_completed"] / summary["total_quantity_received"]) * 100
        
        # Set longest overall time
        if time_values:
            summary["longest_overall_time"] = self._format_time_in_phase(max(time_values))
        
        return summary

    def _calculate_completion_percentage(self, quantity: int, expected_quantity: int) -> float:
        """Calculate completion percentage"""
        if expected_quantity <= 0:
            return 0.0
        return min(100.0, (quantity / expected_quantity) * 100.0)

    def _parse_time_in_phase(self, time_str: str) -> float:
        """Parse time in phase string to days (float)"""
        try:
            if not time_str or time_str == "N/A" or time_str == "0 days":
                return 0.0
            
            import re
            
            # Parse format like "48d 20h 55m" or "1d 3h 34m"
            if "d" in time_str and "h" in time_str:
                # Extract days, hours, minutes
                day_match = re.search(r'(\d+)d', time_str)
                hour_match = re.search(r'(\d+)h', time_str)
                min_match = re.search(r'(\d+)m', time_str)
                
                days = float(day_match.group(1)) if day_match else 0
                hours = float(hour_match.group(1)) if hour_match else 0
                minutes = float(min_match.group(1)) if min_match else 0
                
                # Convert to total days
                total_days = days + (hours / 24.0) + (minutes / (24.0 * 60.0))
                return total_days
            
            # Parse format like "1d 3h" (no minutes)
            elif "d" in time_str and "h" in time_str:
                day_match = re.search(r'(\d+)d', time_str)
                hour_match = re.search(r'(\d+)h', time_str)
                
                days = float(day_match.group(1)) if day_match else 0
                hours = float(hour_match.group(1)) if hour_match else 0
                
                return days + (hours / 24.0)
            
            # Parse format like "23h 1m" (no days)
            elif "h" in time_str and "m" in time_str:
                hour_match = re.search(r'(\d+)h', time_str)
                min_match = re.search(r'(\d+)m', time_str)
                
                hours = float(hour_match.group(1)) if hour_match else 0
                minutes = float(min_match.group(1)) if min_match else 0
                
                return (hours / 24.0) + (minutes / (24.0 * 60.0))
            
            # Parse format like "22h" (hours only)
            elif "h" in time_str:
                hour_match = re.search(r'(\d+)h', time_str)
                if hour_match:
                    return float(hour_match.group(1)) / 24.0
            
            # Parse format like "1 day" or "2 days"
            elif "day" in time_str.lower():
                numbers = re.findall(r'\d+', time_str)
                if numbers:
                    return float(numbers[0])
            
            return 0.0
        except:
            return 0.0

    def _format_time_in_phase(self, days: float) -> str:
        """Format days back to readable string"""
        if days < 1:
            hours = int(days * 24)
            return f"{hours} hour{'s' if hours != 1 else ''}"
        else:
            days_int = int(days)
            return f"{days_int} day{'s' if days_int != 1 else ''}"