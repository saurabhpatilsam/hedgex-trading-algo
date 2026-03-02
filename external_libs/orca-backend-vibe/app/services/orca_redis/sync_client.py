"""
Synchronous Redis client wrapper for non-async code.

This module provides a synchronous interface to Redis for code that doesn't
use async/await, like the balance_tradovate.py utilities.
"""

import os
from typing import Optional, Any
import redis
from loguru import logger
from dotenv import load_dotenv

load_dotenv()


class SyncRedisClient:
    """Synchronous Redis client for Azure Cache for Redis."""
    
    _instance: Optional["SyncRedisClient"] = None
    _redis: Optional[redis.Redis] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def initialize(self) -> redis.Redis:
        """Initialize synchronous Redis connection."""
        if self._redis is not None:
            return self._redis
        
        REDIS_HOST = os.getenv("REDIS_HOST")
        REDIS_PORT = os.getenv("REDIS_PORT", "6380")
        REDIS_PRIMARY_ACCESS_KEY = os.getenv("REDIS_PRIMARY_ACCESS_KEY")
        
        if not all([REDIS_HOST, REDIS_PORT, REDIS_PRIMARY_ACCESS_KEY]):
            logger.error("Missing one or more Redis environment variables.")
            raise RuntimeError("Redis environment variables not properly configured.")
        
        try:
            self._redis = redis.Redis(
                host=REDIS_HOST,
                port=int(REDIS_PORT),
                password=REDIS_PRIMARY_ACCESS_KEY,
                ssl=True,
                ssl_cert_reqs=None,  # Azure often requires disabling SSL verification
                decode_responses=True,
                encoding="utf-8",
            )
            
            # Test connection
            self._redis.ping()
            logger.info(f"✅ Sync Redis connected to {REDIS_HOST}:{REDIS_PORT}")
            
            return self._redis
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to Redis: {e}")
            raise
    
    def get(self, key: str) -> Optional[Any]:
        """Get a value from Redis."""
        if self._redis is None:
            self.initialize()
        return self._redis.get(key)
    
    def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        """Set a value in Redis with optional expiration."""
        if self._redis is None:
            self.initialize()
        return self._redis.set(key, value, ex=ex)
    
    def delete(self, key: str) -> int:
        """Delete a key from Redis."""
        if self._redis is None:
            self.initialize()
        return self._redis.delete(key)
    
    def exists(self, key: str) -> bool:
        """Check if a key exists in Redis."""
        if self._redis is None:
            self.initialize()
        return bool(self._redis.exists(key))
    
    def close(self):
        """Close the Redis connection."""
        if self._redis:
            self._redis.close()
            self._redis = None
            logger.info("Sync Redis connection closed")


# Global instance
sync_redis_client = SyncRedisClient()


def get_sync_redis_client() -> redis.Redis:
    """Get or create the synchronous Redis client."""
    if sync_redis_client._redis is None:
        sync_redis_client.initialize()
    return sync_redis_client._redis
