"""Shared Redis configuration for market data, bearer tokens, and quotes."""
import os
from typing import Any, Dict, Optional

import redis


def _first_env(*names: str) -> Optional[str]:
    for name in names:
        value = os.getenv(name)
        if value not in (None, ""):
            return value
    return None


def _as_int(value: Optional[str], default: int) -> int:
    try:
        return int(value) if value not in (None, "") else default
    except (TypeError, ValueError):
        return default


def _as_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def redis_connection_info() -> Dict[str, Any]:
    """Return non-secret connection metadata for logs and status payloads."""
    redis_url = _first_env("REDIS_URL")
    if redis_url:
        return {"mode": "url", "url": redis_url.split("@")[-1]}

    host = _first_env("AZURE_REDIS_HOST", "REDIS_HOST") or "localhost"
    port = _as_int(_first_env("AZURE_REDIS_PORT", "REDIS_PORT"), 6379)
    ssl_override = _as_bool(_first_env("AZURE_REDIS_SSL", "REDIS_SSL"))
    use_ssl = ssl_override if ssl_override is not None else (
        port == 6380 or host.endswith(".redis.cache.windows.net")
    )
    return {"mode": "host", "host": host, "port": port, "ssl": use_ssl}


def build_redis_client(
    *,
    decode_responses: bool = True,
    socket_timeout: int = 3,
    socket_connect_timeout: int = 3,
):
    """Build a Redis client from REDIS_URL or deployed host/port/password env."""
    redis_url = _first_env("REDIS_URL")
    if redis_url:
        return redis.from_url(
            redis_url,
            decode_responses=decode_responses,
            socket_timeout=socket_timeout,
            socket_connect_timeout=socket_connect_timeout,
        )

    info = redis_connection_info()
    password = _first_env("AZURE_REDIS_PASSWORD", "REDIS_PASSWORD")
    kwargs = {
        "host": info["host"],
        "port": info["port"],
        "password": password,
        "decode_responses": decode_responses,
        "socket_timeout": socket_timeout,
        "socket_connect_timeout": socket_connect_timeout,
    }
    if info["ssl"]:
        kwargs.update({
            "ssl": True,
            "ssl_cert_reqs": None,
        })

    return redis.Redis(**kwargs)
