from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db, get_pool_status, engine
from sqlalchemy import text
import logging
import os
import psutil
import threading
from typing import Dict, List, Optional

router = APIRouter()

# Global handle monitoring data
_handle_monitor_data = {
    "last_check": None,
    "process_handles": {},
    "system_limits": {},
    "warnings": []
}
_handle_monitor_lock = threading.Lock()

def get_process_handle_info(pid: Optional[int] = None) -> Dict:
    """Get handle information for a specific process or current process"""
    try:
        if pid is None:
            pid = os.getpid()
        
        process = psutil.Process(pid)
        
        # Get file descriptors (Unix-like systems)
        num_fds = 0
        if hasattr(process, 'num_fds'):
            num_fds = process.num_fds()
        
        # Get connections
        connections = process.connections()
        
        # Get open files
        open_files = []
        try:
            open_files = process.open_files()
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            pass
        
        return {
            "pid": pid,
            "file_descriptors": num_fds,
            "connections": len(connections),
            "open_files": len(open_files),
            "memory_info": process.memory_info()._asdict(),
            "cpu_percent": process.cpu_percent(),
            "connections_detail": [
                {
                    "fd": conn.fd,
                    "family": conn.family.name if conn.family else None,
                    "type": conn.type.name if conn.type else None,
                    "local_address": f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else None,
                    "remote_address": f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else None,
                    "status": conn.status
                } for conn in connections
            ],
            "open_files_detail": [
                {
                    "path": f.path,
                    "fd": f.fd
                } for f in open_files
            ]
        }
    except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
        return {"error": str(e), "pid": pid}

def get_system_handle_limits() -> Dict:
    """Get system-wide handle limits and current usage"""
    try:
        limits = {}
        
        # Get system file descriptor limits (Unix-like systems)
        if hasattr(os, 'getrlimit'):
            try:
                soft_limit, hard_limit = os.getrlimit(os.RLIMIT_NOFILE)
                limits["file_descriptors"] = {
                    "soft_limit": soft_limit,
                    "hard_limit": hard_limit
                }
            except OSError:
                pass
        
        # Get system-wide file descriptor usage (Linux)
        try:
            with open('/proc/sys/fs/file-nr', 'r') as f:
                allocated, unused, max_files = map(int, f.read().strip().split())
                limits["system_file_descriptors"] = {
                    "allocated": allocated,
                    "unused": unused,
                    "max_files": max_files,
                    "usage_percentage": (allocated / max_files * 100) if max_files > 0 else 0
                }
        except (FileNotFoundError, OSError):
            pass
        
        return limits
    except Exception as e:
        return {"error": str(e)}

def check_handle_warnings(process_info: Dict, system_limits: Dict) -> List[str]:
    """Check for potential handle-related issues and return warnings"""
    warnings = []
    
    # Check file descriptor usage
    if "file_descriptors" in process_info:
        fd_count = process_info["file_descriptors"]
        
        # Check against soft limit
        if "file_descriptors" in system_limits:
            soft_limit = system_limits["file_descriptors"]["soft_limit"]
            if fd_count > soft_limit * 0.8:
                warnings.append(f"High file descriptor usage: {fd_count}/{soft_limit} ({fd_count/soft_limit*100:.1f}%)")
        
        # General warning for high FD count
        if fd_count > 500:
            warnings.append(f"Very high file descriptor count: {fd_count}")
    
    # Check connection count
    if "connections" in process_info:
        conn_count = process_info["connections"]
        if conn_count > 100:
            warnings.append(f"High connection count: {conn_count}")
    
    # Check open files
    if "open_files" in process_info:
        open_files_count = process_info["open_files"]
        if open_files_count > 50:
            warnings.append(f"High open files count: {open_files_count}")
    
    # Check system-wide limits
    if "system_file_descriptors" in system_limits:
        sys_fd_info = system_limits["system_file_descriptors"]
        if sys_fd_info["usage_percentage"] > 80:
            warnings.append(f"System-wide file descriptor usage high: {sys_fd_info['usage_percentage']:.1f}%")
    
    return warnings

def update_handle_monitor_data():
    """Update the global handle monitoring data"""
    global _handle_monitor_data
    
    with _handle_monitor_lock:
        try:
            # Get current process info
            current_process = get_process_handle_info()
            
            # Get system limits
            system_limits = get_system_handle_limits()
            
            # Check for warnings
            warnings = check_handle_warnings(current_process, system_limits)
            
            # Update global data
            _handle_monitor_data.update({
                "last_check": psutil.time.time(),
                "process_handles": current_process,
                "system_limits": system_limits,
                "warnings": warnings
            })
            
        except Exception as e:
            logging.error(f"Failed to update handle monitor data: {e}")
            _handle_monitor_data["error"] = str(e)

@router.get("/")
async def health_check():
    """Basic health check endpoint"""
    return {"status": "healthy", "message": "Service is running"}

@router.get("/handles")
async def handle_monitor():
    """Multi-process handle monitoring endpoint"""
    try:
        # Update handle data
        update_handle_monitor_data()
        
        with _handle_monitor_lock:
            data = _handle_monitor_data.copy()
        
        # Determine overall status
        status = "healthy"
        if data.get("warnings"):
            status = "warning"
        if data.get("error"):
            status = "error"
        
        return {
            "status": status,
            "timestamp": data.get("last_check"),
            "process_info": data.get("process_handles", {}),
            "system_limits": data.get("system_limits", {}),
            "warnings": data.get("warnings", []),
            "error": data.get("error")
        }
        
    except Exception as e:
        logging.error(f"Handle monitor failed: {e}")
        raise HTTPException(status_code=500, detail=f"Handle monitoring failed: {str(e)}")

@router.get("/handles/process/{pid}")
async def handle_monitor_process(pid: int):
    """Monitor handles for a specific process"""
    try:
        process_info = get_process_handle_info(pid)
        system_limits = get_system_handle_limits()
        warnings = check_handle_warnings(process_info, system_limits)
        
        status = "healthy"
        if warnings:
            status = "warning"
        if "error" in process_info:
            status = "error"
        
        return {
            "status": status,
            "pid": pid,
            "process_info": process_info,
            "system_limits": system_limits,
            "warnings": warnings
        }
        
    except Exception as e:
        logging.error(f"Process handle monitor failed for PID {pid}: {e}")
        raise HTTPException(status_code=500, detail=f"Process handle monitoring failed: {str(e)}")

@router.get("/handles/system")
async def handle_monitor_system():
    """System-wide handle monitoring"""
    try:
        system_limits = get_system_handle_limits()
        
        # Get all processes (limited to avoid performance issues)
        processes = []
        try:
            for proc in psutil.process_iter(['pid', 'name', 'num_fds']):
                try:
                    proc_info = proc.info
                    if proc_info['num_fds'] is not None and proc_info['num_fds'] > 0:
                        processes.append({
                            "pid": proc_info['pid'],
                            "name": proc_info['name'],
                            "file_descriptors": proc_info['num_fds']
                        })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            logging.warning(f"Could not get all processes: {e}")
        
        # Sort by file descriptor count (descending)
        processes.sort(key=lambda x: x['file_descriptors'], reverse=True)
        
        return {
            "status": "healthy",
            "system_limits": system_limits,
            "top_processes_by_fds": processes[:20],  # Top 20 processes
            "total_processes_with_fds": len(processes)
        }
        
    except Exception as e:
        logging.error(f"System handle monitor failed: {e}")
        raise HTTPException(status_code=500, detail=f"System handle monitoring failed: {str(e)}")

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
    """Comprehensive health check including database, pool status, and handle monitoring"""
    try:
        # Database health
        db_result = db.execute(text("SELECT 1 as test"))
        db_healthy = db_result.scalar() == 1
        
        # Pool health
        pool_status = get_pool_status()
        total_connections = pool_status["pool_size"] + pool_status["overflow"]
        active_connections = pool_status["checked_out"]
        utilization_percentage = (active_connections / total_connections * 100) if total_connections > 0 else 0
        
        # Handle monitoring
        update_handle_monitor_data()
        with _handle_monitor_lock:
            handle_data = _handle_monitor_data.copy()
        
        # Determine overall status
        overall_status = "healthy"
        issues = []
        
        if not db_healthy:
            overall_status = "unhealthy"
            issues.append("Database connection failed")
        
        if pool_status["invalid"] > 0:
            overall_status = "unhealthy"
            issues.append("Invalid database connections")
        elif utilization_percentage > 90:
            overall_status = "degraded"
            issues.append("High connection pool utilization")
        
        if handle_data.get("warnings"):
            if overall_status == "healthy":
                overall_status = "warning"
            issues.extend(handle_data["warnings"])
        
        if handle_data.get("error"):
            overall_status = "unhealthy"
            issues.append(f"Handle monitoring error: {handle_data['error']}")
        
        return {
            "status": overall_status,
            "issues": issues,
            "database": {
                "status": "healthy" if db_healthy else "unhealthy",
                "test_query": "passed" if db_healthy else "failed"
            },
            "connection_pool": {
                "status": "healthy" if utilization_percentage < 90 else "warning",
                "pool_status": pool_status,
                "utilization_percentage": round(utilization_percentage, 2)
            },
            "handle_monitoring": {
                "status": "healthy" if not handle_data.get("warnings") and not handle_data.get("error") else "warning",
                "process_info": handle_data.get("process_handles", {}),
                "system_limits": handle_data.get("system_limits", {}),
                "warnings": handle_data.get("warnings", []),
                "last_check": handle_data.get("last_check")
            },
            "timestamp": psutil.time.time()
        }
        
    except Exception as e:
        logging.error(f"Full health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Health check failed: {str(e)}")
