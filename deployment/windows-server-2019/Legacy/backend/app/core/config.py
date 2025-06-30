from typing import List
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl
import os
from pathlib import Path

class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Product Management System"
    
    # CORS Configuration - Dynamic from environment
    CORS_ORIGINS: str = "*"
    
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
    
    # Try to find .env file in multiple locations
    def _get_env_file_path(self) -> str:
        """Find the .env file in the expected locations"""
        possible_paths = [
            ".env",  # Current directory
            "../.env",  # Parent directory
        ]
        
        for path in possible_paths:
            if Path(path).exists():
                print(f"Found .env file at: {Path(path).absolute()}")
                return path
        
        print("Warning: No .env file found in expected locations")
        return ".env"  # Default fallback
    
    model_config = SettingsConfigDict(
        case_sensitive=True, 
        env_file=_get_env_file_path,
        env_file_encoding='utf-8'
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS_ORIGINS string to list"""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

settings = Settings() 