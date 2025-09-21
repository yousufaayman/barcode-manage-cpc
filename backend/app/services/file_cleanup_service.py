import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
import glob

logger = logging.getLogger(__name__)

class FileCleanupService:
    def __init__(self, reports_dir: str = "backend/reports", retention_days: int = 30):
        self.reports_dir = reports_dir
        self.retention_days = retention_days
        
    def cleanup_old_reports(self) -> Dict[str, Any]:
        """Clean up report files older than retention period"""
        try:
            if not os.path.exists(self.reports_dir):
                logger.warning(f"Reports directory does not exist: {self.reports_dir}")
                return {
                    "success": True,
                    "message": "Reports directory does not exist",
                    "files_deleted": 0,
                    "files_kept": 0
                }
            
            # Calculate cutoff date
            cutoff_date = datetime.now() - timedelta(days=self.retention_days)
            
            # Find all PDF files in the reports directory
            pdf_pattern = os.path.join(self.reports_dir, "*.pdf")
            pdf_files = glob.glob(pdf_pattern)
            
            files_deleted = 0
            files_kept = 0
            deleted_files = []
            
            for file_path in pdf_files:
                try:
                    # Get file modification time
                    file_mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
                    
                    if file_mtime < cutoff_date:
                        # File is older than retention period, delete it
                        os.remove(file_path)
                        files_deleted += 1
                        deleted_files.append({
                            "filename": os.path.basename(file_path),
                            "deleted_at": datetime.now().isoformat(),
                            "file_age_days": (datetime.now() - file_mtime).days
                        })
                        logger.info(f"Deleted old report file: {os.path.basename(file_path)} (age: {(datetime.now() - file_mtime).days} days)")
                    else:
                        files_kept += 1
                        
                except Exception as e:
                    logger.error(f"Error processing file {file_path}: {str(e)}")
                    continue
            
            result = {
                "success": True,
                "message": f"Cleanup completed. Deleted {files_deleted} files, kept {files_kept} files.",
                "files_deleted": files_deleted,
                "files_kept": files_kept,
                "deleted_files": deleted_files,
                "cutoff_date": cutoff_date.isoformat(),
                "retention_days": self.retention_days
            }
            
            logger.info(f"File cleanup completed: {files_deleted} files deleted, {files_kept} files kept")
            return result
            
        except Exception as e:
            logger.error(f"Error during file cleanup: {str(e)}")
            return {
                "success": False,
                "message": f"Error during cleanup: {str(e)}",
                "files_deleted": 0,
                "files_kept": 0
            }
    
    def get_report_files_info(self) -> Dict[str, Any]:
        """Get information about all report files"""
        try:
            if not os.path.exists(self.reports_dir):
                return {
                    "success": True,
                    "message": "Reports directory does not exist",
                    "total_files": 0,
                    "files": []
                }
            
            # Find all PDF files
            pdf_pattern = os.path.join(self.reports_dir, "*.pdf")
            pdf_files = glob.glob(pdf_pattern)
            
            files_info = []
            total_size = 0
            
            for file_path in pdf_files:
                try:
                    file_stat = os.stat(file_path)
                    file_size = file_stat.st_size
                    file_mtime = datetime.fromtimestamp(file_stat.st_mtime)
                    file_age_days = (datetime.now() - file_mtime).days
                    
                    files_info.append({
                        "filename": os.path.basename(file_path),
                        "file_path": file_path,
                        "size_bytes": file_size,
                        "size_mb": round(file_size / (1024 * 1024), 2),
                        "created_at": file_mtime.isoformat(),
                        "age_days": file_age_days,
                        "will_be_deleted": file_age_days >= self.retention_days
                    })
                    
                    total_size += file_size
                    
                except Exception as e:
                    logger.error(f"Error getting info for file {file_path}: {str(e)}")
                    continue
            
            # Sort by creation date (newest first)
            files_info.sort(key=lambda x: x["created_at"], reverse=True)
            
            return {
                "success": True,
                "message": f"Found {len(files_info)} report files",
                "total_files": len(files_info),
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "retention_days": self.retention_days,
                "files": files_info
            }
            
        except Exception as e:
            logger.error(f"Error getting report files info: {str(e)}")
            return {
                "success": False,
                "message": f"Error getting files info: {str(e)}",
                "total_files": 0,
                "files": []
            }
    
    def force_cleanup_all_files(self) -> Dict[str, Any]:
        """Force cleanup of all report files (use with caution)"""
        try:
            if not os.path.exists(self.reports_dir):
                return {
                    "success": True,
                    "message": "Reports directory does not exist",
                    "files_deleted": 0
                }
            
            # Find all PDF files
            pdf_pattern = os.path.join(self.reports_dir, "*.pdf")
            pdf_files = glob.glob(pdf_pattern)
            
            files_deleted = 0
            deleted_files = []
            
            for file_path in pdf_files:
                try:
                    filename = os.path.basename(file_path)
                    os.remove(file_path)
                    files_deleted += 1
                    deleted_files.append(filename)
                    logger.info(f"Force deleted report file: {filename}")
                    
                except Exception as e:
                    logger.error(f"Error force deleting file {file_path}: {str(e)}")
                    continue
            
            result = {
                "success": True,
                "message": f"Force cleanup completed. Deleted {files_deleted} files.",
                "files_deleted": files_deleted,
                "deleted_files": deleted_files
            }
            
            logger.warning(f"Force cleanup completed: {files_deleted} files deleted")
            return result
            
        except Exception as e:
            logger.error(f"Error during force cleanup: {str(e)}")
            return {
                "success": False,
                "message": f"Error during force cleanup: {str(e)}",
                "files_deleted": 0
            }
    
    def set_retention_days(self, days: int) -> bool:
        """Update retention period"""
        if days < 1:
            logger.error("Retention days must be at least 1")
            return False
        
        self.retention_days = days
        logger.info(f"Retention period updated to {days} days")
        return True
    
    def get_cleanup_status(self) -> Dict[str, Any]:
        """Get current cleanup service status"""
        files_info = self.get_report_files_info()
        
        if not files_info["success"]:
            return {
                "success": False,
                "message": "Error getting cleanup status",
                "retention_days": self.retention_days,
                "reports_directory": self.reports_dir
            }
        
        total_files = files_info["total_files"]
        files_to_delete = len([f for f in files_info["files"] if f["will_be_deleted"]])
        
        return {
            "success": True,
            "retention_days": self.retention_days,
            "reports_directory": self.reports_dir,
            "total_files": total_files,
            "files_to_delete": files_to_delete,
            "files_to_keep": total_files - files_to_delete,
            "total_size_mb": files_info["total_size_mb"],
            "next_cleanup_will_delete": files_to_delete
        }
