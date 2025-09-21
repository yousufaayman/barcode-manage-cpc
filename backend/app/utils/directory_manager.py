"""
Directory Management Utilities
Handles creation and management of all required directories for the application
"""
import os
import logging
from pathlib import Path
from typing import List, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

class DirectoryManager:
    """Manages all application directories and ensures proper setup"""
    
    def __init__(self):
        self.base_paths = {
            'static': settings.JOB_ORDER_IMAGE_UPLOAD_DIR,
            'logs': getattr(settings, 'LOG_DIR', 'logs'),
            'uploads': getattr(settings, 'UPLOAD_DIR', 'uploads'),
        }
    
    def ensure_directory_exists(self, directory_path: str, description: str = "") -> bool:
        """
        Ensure a directory exists, create it if it doesn't
        
        Args:
            directory_path: Path to the directory
            description: Description of the directory for logging
            
        Returns:
            bool: True if directory exists or was created successfully
        """
        try:
            path = Path(directory_path)
            if not path.exists():
                path.mkdir(parents=True, exist_ok=True)
                logger.info(f"Created directory: {directory_path} ({description})")
                return True
            else:
                logger.debug(f"Directory already exists: {directory_path}")
                return True
        except Exception as e:
            logger.error(f"Failed to create directory {directory_path}: {e}")
            return False
    
    def ensure_upload_directories(self) -> bool:
        """Ensure all upload directories exist"""
        upload_dirs = [
            (self.base_paths['uploads'], "General uploads"),
            (os.path.join(self.base_paths['uploads'], 'barcodes'), "Barcode uploads"),
            (os.path.join(self.base_paths['uploads'], 'job-orders'), "Job order uploads"),
            (os.path.join(self.base_paths['uploads'], 'templates'), "Template uploads"),
            (os.path.join(self.base_paths['uploads'], 'exports'), "Export files"),
        ]
        
        success = True
        for dir_path, description in upload_dirs:
            if not self.ensure_directory_exists(dir_path, description):
                success = False
        
        return success
    
    
    def ensure_log_directories(self) -> bool:
        """Ensure all log directories exist"""
        log_dirs = [
            (self.base_paths['logs'], "Application logs"),
            (os.path.join(self.base_paths['logs'], 'backend'), "Backend logs"),
            (os.path.join(self.base_paths['logs'], 'monitoring'), "Monitoring logs"),
            (os.path.join(self.base_paths['logs'], 'nginx'), "Nginx logs"),
        ]
        
        success = True
        for dir_path, description in log_dirs:
            if not self.ensure_directory_exists(dir_path, description):
                success = False
        
        return success
    
    
    
    
    def ensure_all_directories(self) -> bool:
        """Ensure all required directories exist"""
        logger.info("Ensuring all application directories exist...")
        
        success = True
        
        # Core directories
        if not self.ensure_directory_exists(self.base_paths['static'], "Static files"):
            success = False
        
        # Specialized directories
        if not self.ensure_upload_directories():
            success = False
        
        if not self.ensure_log_directories():
            success = False
        
        if success:
            logger.info("All application directories verified successfully")
        else:
            logger.error("Some directories could not be created")
        
        return success
    
    def get_directory_info(self) -> dict:
        """Get information about all directories"""
        info = {}
        
        for name, path in self.base_paths.items():
            path_obj = Path(path)
            info[name] = {
                'path': str(path_obj.absolute()),
                'exists': path_obj.exists(),
                'is_dir': path_obj.is_dir() if path_obj.exists() else False,
                'writable': os.access(path, os.W_OK) if path_obj.exists() else False,
                'readable': os.access(path, os.R_OK) if path_obj.exists() else False,
            }
        
        return info
    
    def verify_directory_permissions(self) -> dict:
        """Verify permissions for all directories"""
        permissions = {}
        
        for name, path in self.base_paths.items():
            path_obj = Path(path)
            if path_obj.exists():
                permissions[name] = {
                    'readable': os.access(path, os.R_OK),
                    'writable': os.access(path, os.W_OK),
                    'executable': os.access(path, os.X_OK),
                }
            else:
                permissions[name] = {
                    'readable': False,
                    'writable': False,
                    'executable': False,
                }
        
        return permissions
    

# Global instance
directory_manager = DirectoryManager()

def ensure_all_directories() -> bool:
    """Convenience function to ensure all directories exist"""
    return directory_manager.ensure_all_directories()

def get_directory_info() -> dict:
    """Convenience function to get directory information"""
    return directory_manager.get_directory_info()

def verify_directory_permissions() -> dict:
    """Convenience function to verify directory permissions"""
    return directory_manager.verify_directory_permissions()

