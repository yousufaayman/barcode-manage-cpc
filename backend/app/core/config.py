from typing import List
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl
import os

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Product Management System"
    
    # Server Configuration
    PORT: int = 5000
    HOST: str = "0.0.0.0"
    
    # CORS Configuration - Dynamic from environment
    CORS_ORIGINS: str = "*"
    
    # Database Configuration - PostgreSQL only
    POSTGRESQL_HOST: str
    POSTGRESQL_PORT: int = 5432
    POSTGRESQL_USER: str
    POSTGRESQL_PASSWORD: str
    POSTGRESQL_DATABASE: str
    
    # Connection Pool Configuration
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 3600
    DB_POOL_PRE_PING: bool = True
    
    # JWT Configuration
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Image upload directory
    JOB_ORDER_IMAGE_UPLOAD_DIR: str = "job_order_images"
    
    # Email Configuration for Reports (Gmail)
    REPORT_SENDER_EMAIL: str = ""
    REPORT_SENDER_PASSWORD: str = ""
    REPORT_RECIPIENT_EMAILS: str = ""
    COMPANY_NAME: str = "Production Management System"
    
    # Report Configuration
    REPORT_RETENTION_DAYS: int = 30
    REPORTS_DIR: str = "backend/reports"
    
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS_ORIGINS string to list"""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        # Handle case where CORS_ORIGINS might be a JSON string
        if self.CORS_ORIGINS.startswith("[") and self.CORS_ORIGINS.endswith("]"):
            import json
            try:
                return json.loads(self.CORS_ORIGINS)
            except json.JSONDecodeError:
                pass
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

settings = Settings() 