"""
Centralized Structured Logging Configuration

Uses structlog for structured, context-rich logging.
In production: JSON output for easy parsing by log aggregators
In development: Pretty colored console output

Usage:
    from core.logging import get_logger
    
    logger = get_logger(__name__)
    logger.info("event_name", key1=value1, key2=value2)
"""

import os
import sys
import logging
from typing import Optional

import structlog
from structlog.types import Processor


def _get_log_level() -> int:
    """Get log level from environment."""
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    return getattr(logging, level_name, logging.INFO)


def _is_development() -> bool:
    """Check if running in development mode."""
    return os.getenv("ENVIRONMENT", "production").lower() in ("development", "dev", "local")


def configure_logging(
    level: Optional[int] = None,
    json_output: Optional[bool] = None
) -> None:
    """
    Configure structlog for the application.
    
    Args:
        level: Log level (default: from LOG_LEVEL env var)
        json_output: Force JSON output (default: auto based on ENVIRONMENT)
    """
    if level is None:
        level = _get_log_level()
    
    if json_output is None:
        json_output = not _is_development()
    
    # Configure standard library logging first
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )
    
    # Shared processors for all outputs
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]
    
    if json_output:
        # Production: JSON output
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ]
    else:
        # Development: Pretty console output
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(colors=True)
        ]
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger for the given module/name.
    
    Args:
        name: Logger name (typically __name__)
    
    Returns:
        Configured structlog logger
    
    Usage:
        logger = get_logger(__name__)
        logger.info("user_created", user_id="123", email="test@example.com")
        logger.warning("rate_limit_exceeded", ip="1.2.3.4", limit=100)
        logger.error("database_error", error=str(e), query="SELECT...")
    """
    return structlog.get_logger(name)


def bind_context(**kwargs) -> None:
    """
    Bind context variables that will be included in all subsequent log messages.
    
    Useful for adding request-scoped context like session_id, user_id, etc.
    
    Usage:
        bind_context(session_id="abc123", user_id="user456")
        logger.info("processing_request")  # Will include session_id and user_id
    """
    structlog.contextvars.bind_contextvars(**kwargs)


def clear_context() -> None:
    """Clear all bound context variables."""
    structlog.contextvars.clear_contextvars()


# Auto-configure on import (can be overridden by calling configure_logging explicitly)
configure_logging()

