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