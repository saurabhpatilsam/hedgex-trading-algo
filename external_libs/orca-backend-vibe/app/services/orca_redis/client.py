import os
import asyncio
from typing import Optional
from loguru import logger
from dotenv import load_dotenv
from redis import asyncio as aioredis  # ✅ correct for redis>=4.2.0, works in redis 6.4.0

load_dotenv()


class RedisClient:
    """Singleton async Redis client manager for Azure Cache for Redis."""

    _instance: Optional["RedisClient"] = None
    _redis: Optional[aioredis.Redis] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self):
        """Initialize async Redis connection to Azure Cache for Redis."""
        if self._redis is not None:
            return  # Already initialized

        REDIS_HOST = os.getenv("REDIS_HOST")
        REDIS_PORT = os.getenv("REDIS_PORT", "6380")
        REDIS_PRIMARY_ACCESS_KEY = os.getenv("REDIS_PRIMARY_ACCESS_KEY")

        if not all([REDIS_HOST, REDIS_PORT, REDIS_PRIMARY_ACCESS_KEY]):
            logger.error("Missing one or more Redis environment variables. Check your .env file.")
            raise RuntimeError("Redis environment variables not properly configured.")

        redis_url = f"rediss://:{REDIS_PRIMARY_ACCESS_KEY}@{REDIS_HOST}:{REDIS_PORT}"

        try:
            self._redis = aioredis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=50,

                ssl_cert_reqs=None,  # Azure often requires disabling SSL verification
            )

            # Test connection
            await self._redis.ping()
            logger.info(f"✅ Connected to Azure Cache for Redis at {REDIS_HOST}:{REDIS_PORT}")

        except Exception as e:
            logger.error(f"❌ Failed to connect to Azure Cache for Redis: {e}")
            raise

    async def close(self):
        """Close Redis connection."""
        if self._redis:
            await self._redis.aclose()  # ✅ modern async close method
            logger.info("📴 Redis connection closed")
            self._redis = None

    @property
    def client(self) -> aioredis.Redis:
        """Get Redis client instance."""
        if self._redis is None:
            raise RuntimeError("Redis client not initialized. Call initialize() first.")
        return self._redis


# Global instance
redis_client = RedisClient()


async def get_redis_client() -> aioredis.Redis:
    """Get the initialized Redis client (for dependency injection)."""
    # Auto-initialize if not already initialized
    if redis_client._redis is None:
        await redis_client.initialize()
    return redis_client.client

