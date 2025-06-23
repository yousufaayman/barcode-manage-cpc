from typing import List
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl
import os

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Barcode Management System"
    
    # CORS Configuration - Dynamic from environment
    CORS_ORIGINS: List[str] = []
    
    # Database Configuration - All from environment variables (no hardcoded defaults)
    MYSQL_HOST: str
    MYSQL_PORT: int = 3306
    MYSQL_USER: str
    MYSQL_PASSWORD: str
    MYSQL_DATABASE: str
    
    # JWT Configuration
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Parse CORS_ORIGINS from environment variable if provided
        cors_origins_env = os.getenv("CORS_ORIGINS")
        if cors_origins_env:
            self.CORS_ORIGINS = [origin.strip() for origin in cors_origins_env.split(",")]
        elif not self.CORS_ORIGINS:
            # Default to allow all origins if not specified
            self.CORS_ORIGINS = ["*"]

settings = Settings() 