"""
Typed Configuration with Pydantic Settings

Provides strongly-typed, validated configuration from environment variables.
Replaces direct os.getenv() calls with type-safe settings access.

Usage:
    from core.config import settings
    
    # All settings are typed and validated
    print(settings.OPENAI_API_KEY)  # str
    print(settings.DEBUG)  # bool
    print(settings.LOG_LEVEL)  # str with validation
"""

from typing import Optional, Literal
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings with validation and type hints.
    
    Environment variables are automatically loaded from:
    1. Environment variables
    2. .env file (via model_config)
    
    All sensitive values (API keys) are marked with repr=False
    to prevent accidental logging.
    """
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"  # Ignore extra env vars
    )
    
    # ==========================================================================
    # ENVIRONMENT
    # ==========================================================================
    ENVIRONMENT: str = Field(
        default="production",
        description="Application environment (development, production, test)"
    )
    DEBUG: bool = Field(default=False, description="Enable debug mode")
    LOG_LEVEL: str = Field(
        default="INFO",
        description="Logging level"
    )
    
    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Allow empty string, default to production."""
        if not v or v.strip() == "":
            return "production"
        return v.lower()
    
    @field_validator("LOG_LEVEL", mode="before")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Normalize log level to uppercase."""
        if not v or v.strip() == "":
            return "INFO"
        return v.upper()
    
    # ==========================================================================
    # API KEYS (sensitive - hidden from repr/logs)
    # ==========================================================================
    OPENAI_API_KEY: str = Field(default="", repr=False, description="OpenAI API key")
    STRIPE_SECRET_KEY: Optional[str] = Field(default=None, repr=False, description="Stripe secret key")
    STRIPE_WEBHOOK_SECRET: Optional[str] = Field(default=None, repr=False, description="Stripe webhook signing secret")
    RESEND_API_KEY: Optional[str] = Field(default=None, repr=False, description="Resend email API key")
    LOGFIRE_TOKEN: Optional[str] = Field(default=None, repr=False, description="Logfire observability token")
    
    # ==========================================================================
    # SUPABASE
    # ==========================================================================
    SUPABASE_URL: str = Field(default="", description="Supabase project URL")
    SUPABASE_KEY: str = Field(default="", repr=False, description="Supabase anon/service key")
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = Field(default=None, repr=False, description="Supabase service role key")
    DATABASE_URL: Optional[str] = Field(default=None, repr=False, description="Direct PostgreSQL connection URL")
    SUPABASE_DB_URL: Optional[str] = Field(default=None, repr=False, description="Alternative DB URL")
    
    @field_validator("SUPABASE_URL", "SUPABASE_KEY", mode="before")
    @classmethod
    def validate_supabase(cls, v: Optional[str]) -> str:
        """Allow empty/None values but warn."""
        return v or ""
    
    # ==========================================================================
    # LLM CONFIGURATION
    # ==========================================================================
    DEFAULT_MODEL: str = Field(default="gpt-4o-mini", description="Default LLM model")
    DEFAULT_TEMPERATURE: float = Field(default=0.7, ge=0, le=2, description="Default LLM temperature")
    
    # ==========================================================================
    # REDIS (optional caching)
    # ==========================================================================
    REDIS_URL: Optional[str] = Field(default=None, description="Redis connection URL")
    
    # ==========================================================================
    # CORS
    # ==========================================================================
    CORS_ORIGINS: str = Field(
        default="*",
        description="Comma-separated list of allowed CORS origins"
    )
    
    @field_validator("CORS_ORIGINS")
    @classmethod
    def parse_cors_origins(cls, v: str) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        if v == "*":
            return ["*"]
        return [origin.strip() for origin in v.split(",") if origin.strip()]
    
    # ==========================================================================
    # COMPUTED PROPERTIES
    # ==========================================================================
    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.ENVIRONMENT == "development"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.ENVIRONMENT == "production"
    
    @property
    def database_connection_url(self) -> Optional[str]:
        """Get the database connection URL (from either DATABASE_URL or SUPABASE_DB_URL)."""
        return self.DATABASE_URL or self.SUPABASE_DB_URL
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Get CORS origins as a list."""
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        return [self.CORS_ORIGINS]


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Uses lru_cache to ensure settings are only loaded once.
    """
    return Settings()


# Singleton instance for easy import
settings = get_settings()

