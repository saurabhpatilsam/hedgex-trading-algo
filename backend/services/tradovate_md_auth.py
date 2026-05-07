"""Helpers for Tradovate market-data websocket authentication."""
import json
import os
import urllib.request
from typing import Callable, Dict, Optional


def _is_live_env() -> bool:
    return os.getenv("TRADOVATE_ENV", "demo").strip().lower() in {"live", "prod", "production"}


def get_tradovate_rest_base_url() -> str:
    configured = os.getenv("TRADOVATE_REST_BASE_URL")
    if configured:
        return configured.rstrip("/")
    host = "live.tradovateapi.com" if _is_live_env() else "demo.tradovateapi.com"
    return f"https://{host}/v1"


def get_tradovate_md_ws_url() -> str:
    configured = os.getenv("TRADOVATE_MD_WS_URL")
    if configured:
        return configured
    host = "md.tradovateapi.com" if _is_live_env() else "md-demo.tradovateapi.com"
    return f"wss://{host}/v1/websocket"


def build_ws_authorize_message(request_id: int, md_access_token: str) -> str:
    if not md_access_token:
        raise ValueError("md_access_token is required")
    return f"authorize\n{request_id}\n\n{json.dumps(md_access_token)}"


def renew_market_data_token(
    access_token: str,
    opener: Optional[Callable] = None,
    timeout: int = 15,
) -> Dict[str, str]:
    """Renew a REST bearer into the paired REST + market-data tokens."""
    if not access_token:
        raise ValueError("access_token is required")

    url = f"{get_tradovate_rest_base_url()}/auth/renewaccesstoken"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
    )
    response = (opener or urllib.request.urlopen)(req, timeout=timeout)
    raw = response.read()
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    data = json.loads(raw)

    next_access_token = data.get("accessToken") or data.get("access_token") or access_token
    md_access_token = data.get("mdAccessToken") or data.get("md_access_token")
    if not md_access_token:
        raise RuntimeError(f"Token renewal did not return mdAccessToken; fields={list(data.keys())}")

    return {
        "access_token": next_access_token,
        "md_access_token": md_access_token,
    }
