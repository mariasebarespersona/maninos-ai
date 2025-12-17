"""
Performance Caching Module for MANINOS AI.

This module provides OPTIONAL Redis caching for frequently accessed data.
The application works perfectly WITHOUT Redis (graceful degradation).

Features:
- Optional Redis connection (falls back to no-cache if unavailable)
- Automatic cache invalidation on updates
- Configurable TTL (default: 5 minutes)
- Logging for debugging
- Zero impact on existing logic

Usage:
    from tools.cache import cache
    
    # Try to get from cache
    data = cache.get("property", property_id)
    if data is None:
        data = fetch_from_database(property_id)
        cache.set("property", property_id, data)
    
    # Invalidate on update
    cache.invalidate("property", property_id)
"""

import os
import json
import logging
from typing import Any, Optional
from functools import wraps

logger = logging.getLogger(__name__)

# Try to import Redis (optional dependency)
try:
    import redis
    from redis.exceptions import RedisError, ConnectionError as RedisConnectionError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.info("[cache] Redis library not installed - caching disabled (app will work normally)")


class CacheManager:
    """
    Centralized cache manager with graceful degradation.
    
    If Redis is unavailable, all operations are no-ops (returns None for gets).
    """
    
    def __init__(self):
        """Initialize cache manager."""
        self.enabled = False
        self.redis_client = None
        self.ttl_seconds = int(os.getenv("CACHE_TTL_SECONDS", "300"))  # Default: 5 minutes
        
        # Try to connect to Redis (optional)
        if REDIS_AVAILABLE:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            try:
                self.redis_client = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=2,  # Quick timeout
                    socket_keepalive=True,
                    health_check_interval=30
                )
                # Test connection
                self.redis_client.ping()
                self.enabled = True
                logger.info(f"[cache] ✅ Redis connected successfully (TTL={self.ttl_seconds}s)")
            except Exception as e:
                logger.warning(f"[cache] ⚠️  Redis unavailable: {e} - caching disabled (app will work normally)")
                self.redis_client = None
                self.enabled = False
        else:
            logger.info("[cache] Redis library not available - caching disabled")
    
    def _make_key(self, namespace: str, key: str) -> str:
        """Generate cache key with namespace."""
        return f"maninos:{namespace}:{key}"
    
    def get(self, namespace: str, key: str) -> Optional[Any]:
        """
        Get value from cache.
        
        Args:
            namespace: Cache namespace (e.g., "property", "docs")
            key: Cache key (e.g., property_id)
        
        Returns:
            Cached value (deserialized from JSON) or None if not found/unavailable
        """
        if not self.enabled:
            return None
        
        try:
            cache_key = self._make_key(namespace, key)
            value = self.redis_client.get(cache_key)
            
            if value is not None:
                logger.debug(f"[cache] 🎯 HIT: {namespace}:{key}")
                return json.loads(value)
            else:
                logger.debug(f"[cache] ❌ MISS: {namespace}:{key}")
                return None
        
        except Exception as e:
            logger.warning(f"[cache] Error getting key {namespace}:{key}: {e}")
            return None
    
    def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Set value in cache.
        
        Args:
            namespace: Cache namespace
            key: Cache key
            value: Value to cache (will be JSON serialized)
            ttl: Optional TTL override (seconds)
        
        Returns:
            True if successful, False otherwise
        """
        if not self.enabled:
            return False
        
        try:
            cache_key = self._make_key(namespace, key)
            ttl = ttl or self.ttl_seconds
            
            # Serialize to JSON
            serialized = json.dumps(value, default=str)  # default=str handles datetimes
            
            self.redis_client.setex(cache_key, ttl, serialized)
            logger.debug(f"[cache] ✅ SET: {namespace}:{key} (TTL={ttl}s)")
            return True
        
        except Exception as e:
            logger.warning(f"[cache] Error setting key {namespace}:{key}: {e}")
            return False
    
    def invalidate(self, namespace: str, key: str) -> bool:
        """
        Invalidate (delete) cache entry.
        
        Args:
            namespace: Cache namespace
            key: Cache key
        
        Returns:
            True if deleted, False otherwise
        """
        if not self.enabled:
            return False
        
        try:
            cache_key = self._make_key(namespace, key)
            deleted = self.redis_client.delete(cache_key)
            
            if deleted:
                logger.debug(f"[cache] 🗑️  INVALIDATED: {namespace}:{key}")
            
            return bool(deleted)
        
        except Exception as e:
            logger.warning(f"[cache] Error invalidating key {namespace}:{key}: {e}")
            return False
    
    def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate all keys matching a pattern.
        
        Args:
            pattern: Redis pattern (e.g., "maninos:property:*")
        
        Returns:
            Number of keys deleted
        """
        if not self.enabled:
            return 0
        
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                deleted = self.redis_client.delete(*keys)
                logger.debug(f"[cache] 🗑️  INVALIDATED PATTERN: {pattern} ({deleted} keys)")
                return deleted
            return 0
        
        except Exception as e:
            logger.warning(f"[cache] Error invalidating pattern {pattern}: {e}")
            return 0
    
    def clear_namespace(self, namespace: str) -> int:
        """
        Clear all cache entries in a namespace.
        
        Args:
            namespace: Cache namespace to clear
        
        Returns:
            Number of keys deleted
        """
        pattern = f"maninos:{namespace}:*"
        return self.invalidate_pattern(pattern)
    
    def get_stats(self) -> dict:
        """
        Get cache statistics.
        
        Returns:
            Dict with cache stats (or empty if unavailable)
        """
        if not self.enabled:
            return {"enabled": False, "reason": "Redis unavailable"}
        
        try:
            info = self.redis_client.info("stats")
            return {
                "enabled": True,
                "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0),
                "total_keys": self.redis_client.dbsize(),
                "ttl_seconds": self.ttl_seconds
            }
        except Exception as e:
            return {"enabled": False, "error": str(e)}


# Global cache instance (singleton)
cache = CacheManager()


def cached(namespace: str, key_param: str = "property_id", ttl: Optional[int] = None):
    """
    Decorator for caching function results.
    
    Usage:
        @cached("property", key_param="property_id")
        def get_property(property_id: str):
            # ... fetch from database
            return data
    
    Args:
        namespace: Cache namespace
        key_param: Name of function parameter to use as cache key
        ttl: Optional TTL override
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Extract cache key from function args/kwargs
            key = kwargs.get(key_param)
            if key is None and len(args) > 0:
                # Try to get from positional args (assume first arg is the key)
                key = args[0]
            
            if key is None:
                # Can't cache without a key - just call function
                return func(*args, **kwargs)
            
            # Try to get from cache
            cached_value = cache.get(namespace, str(key))
            if cached_value is not None:
                return cached_value
            
            # Cache miss - call function
            result = func(*args, **kwargs)
            
            # Cache result (if not None)
            if result is not None:
                cache.set(namespace, str(key), result, ttl)
            
            return result
        
        return wrapper
    return decorator


# Export main interface
__all__ = ["cache", "cached"]
