"""
Connection Pool Management Utilities
"""
import logging
from typing import Dict, Any
from sqlalchemy import text
from app.db.session import engine, get_pool_status

class ConnectionPoolManager:
    """Manages database connection pool operations and monitoring"""
    
    @staticmethod
    def get_pool_metrics() -> Dict[str, Any]:
        """Get comprehensive pool metrics"""
        try:
            pool_status = get_pool_status()
            
            return {
                "pool_size": pool_status["pool_size"],
                "checked_in": pool_status["checked_in"],
                "checked_out": pool_status["checked_out"],
                "overflow": pool_status["overflow"],
                "invalid": pool_status["invalid"],
                "total_connections": pool_status["pool_size"] + pool_status["overflow"],
                "active_connections": pool_status["checked_out"],
                "available_connections": pool_status["checked_in"],
                "utilization_percentage": round(
                    (pool_status["checked_out"] / (pool_status["pool_size"] + pool_status["overflow"]) * 100) 
                    if (pool_status["pool_size"] + pool_status["overflow"]) > 0 else 0, 2
                )
            }
        except Exception as e:
            logging.error(f"Failed to get pool metrics: {e}")
            return {}
    
    @staticmethod
    def test_connection() -> bool:
        """Test database connectivity"""
        try:
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                return result.scalar() == 1
        except Exception as e:
            logging.error(f"Connection test failed: {e}")
            return False
    
    @staticmethod
    def get_pool_health() -> Dict[str, Any]:
        """Get pool health status with recommendations"""
        metrics = ConnectionPoolManager.get_pool_metrics()
        if not metrics:
            return {"status": "error", "message": "Failed to retrieve pool metrics"}
        
        utilization = metrics["utilization_percentage"]
        invalid_connections = metrics["invalid"]
        
        # Determine health status
        if invalid_connections > 0:
            status = "critical"
            message = "Invalid connections detected"
        elif utilization > 95:
            status = "critical"
            message = "Pool utilization critically high"
        elif utilization > 90:
            status = "warning"
            message = "Pool utilization high"
        else:
            status = "healthy"
            message = "Pool operating normally"
        
        # Generate recommendations
        recommendations = []
        if utilization > 90:
            recommendations.append("Consider increasing pool_size or max_overflow")
        if invalid_connections > 0:
            recommendations.append("Check database connectivity and configuration")
        if metrics["overflow"] > metrics["pool_size"] * 0.5:
            recommendations.append("High overflow usage - consider increasing pool_size")
        
        return {
            "status": status,
            "message": message,
            "metrics": metrics,
            "recommendations": recommendations
        }
    
    @staticmethod
    def log_pool_status():
        """Log current pool status for monitoring"""
        metrics = ConnectionPoolManager.get_pool_metrics()
        if metrics:
            logging.info(
                f"Pool Status - Size: {metrics['pool_size']}, "
                f"Active: {metrics['active_connections']}, "
                f"Available: {metrics['available_connections']}, "
                f"Utilization: {metrics['utilization_percentage']}%"
            )
    
    @staticmethod
    def should_scale_pool() -> Dict[str, Any]:
        """Determine if pool should be scaled based on current metrics"""
        metrics = ConnectionPoolManager.get_pool_metrics()
        if not metrics:
            return {"should_scale": False, "reason": "Unable to retrieve metrics"}
        
        utilization = metrics["utilization_percentage"]
        overflow_ratio = metrics["overflow"] / metrics["pool_size"] if metrics["pool_size"] > 0 else 0
        
        if utilization > 95 or overflow_ratio > 0.8:
            return {
                "should_scale": True,
                "reason": "High utilization or overflow",
                "recommended_action": "increase_pool_size",
                "current_utilization": utilization,
                "overflow_ratio": overflow_ratio
            }
        elif utilization < 20 and metrics["pool_size"] > 5:
            return {
                "should_scale": True,
                "reason": "Low utilization",
                "recommended_action": "decrease_pool_size",
                "current_utilization": utilization
            }
        else:
            return {
                "should_scale": False,
                "reason": "Pool size is appropriate",
                "current_utilization": utilization
            }
