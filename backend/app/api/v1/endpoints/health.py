from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db, get_pool_status, engine
from sqlalchemy import text
import logging

router = APIRouter()

@router.get("/")
async def health_check():
    """Basic health check endpoint"""
    return {"status": "healthy", "message": "Service is running"}

@router.get("/database")
async def database_health_check(db: Session = Depends(get_db)):
    """Database health check with connection test"""
    try:
        # Test database connection
        result = db.execute(text("SELECT 1 as test"))
        test_value = result.scalar()
        
        if test_value == 1:
            return {
                "status": "healthy",
                "message": "Database connection successful",
                "test_query": "passed"
            }
        else:
            raise HTTPException(status_code=503, detail="Database test query failed")
            
    except Exception as e:
        logging.error(f"Database health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")

@router.get("/pool")
async def pool_health_check():
    """Connection pool status and health check"""
    try:
        pool_status = get_pool_status()
        
        # Calculate pool utilization
        total_connections = pool_status["pool_size"] + pool_status["overflow"]
        active_connections = pool_status["checked_out"]
        utilization_percentage = (active_connections / total_connections * 100) if total_connections > 0 else 0
        
        # Determine pool health
        health_status = "healthy"
        if utilization_percentage > 90:
            health_status = "warning"
        elif utilization_percentage > 95 or pool_status["invalid"] > 0:
            health_status = "critical"
        
        return {
            "status": health_status,
            "pool_status": pool_status,
            "utilization_percentage": round(utilization_percentage, 2),
            "recommendations": get_pool_recommendations(pool_status, utilization_percentage)
        }
        
    except Exception as e:
        logging.error(f"Pool health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Pool status check failed: {str(e)}")

def get_pool_recommendations(pool_status: dict, utilization: float) -> list:
    """Generate recommendations based on pool status"""
    recommendations = []
    
    if utilization > 90:
        recommendations.append("Consider increasing pool_size or max_overflow")
    
    if pool_status["invalid"] > 0:
        recommendations.append("Some connections are invalid - check database connectivity")
    
    if pool_status["overflow"] > pool_status["pool_size"] * 0.5:
        recommendations.append("High overflow usage - consider increasing pool_size")
    
    if not recommendations:
        recommendations.append("Pool configuration is optimal")
    
    return recommendations

@router.get("/full")
async def full_health_check(db: Session = Depends(get_db)):
    """Comprehensive health check including database and pool status"""
    try:
        # Database health
        db_result = db.execute(text("SELECT 1 as test"))
        db_healthy = db_result.scalar() == 1
        
        # Pool health
        pool_status = get_pool_status()
        total_connections = pool_status["pool_size"] + pool_status["overflow"]
        active_connections = pool_status["checked_out"]
        utilization_percentage = (active_connections / total_connections * 100) if total_connections > 0 else 0
        
        overall_status = "healthy"
        if not db_healthy or pool_status["invalid"] > 0:
            overall_status = "unhealthy"
        elif utilization_percentage > 90:
            overall_status = "degraded"
        
        return {
            "status": overall_status,
            "database": {
                "status": "healthy" if db_healthy else "unhealthy",
                "test_query": "passed" if db_healthy else "failed"
            },
            "connection_pool": {
                "status": "healthy" if utilization_percentage < 90 else "warning",
                "pool_status": pool_status,
                "utilization_percentage": round(utilization_percentage, 2)
            },
            "timestamp": "2024-01-01T00:00:00Z"  # You might want to use actual timestamp
        }
        
    except Exception as e:
        logging.error(f"Full health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Health check failed: {str(e)}")
