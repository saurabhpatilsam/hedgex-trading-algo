"""
Azure IP Proxy Service for HedgeX Trading System.

This FastAPI service runs on an Azure VM with multiple static public IPs.
Each user gets a dedicated IP for their outbound Tradovate API calls.

Architecture:
  - Azure VM with 3+ IP configurations on its NIC
  - Each IP config has a static Public IP attached
  - This service binds outbound requests to the correct source IP
  - HedgeX backend sends proxied requests here tagged with user_id

Usage:
  POST /proxy
  {
    "user_id": 2,
    "method": "GET",
    "url": "https://demo.tradovateapi.com/v1/account/list",
    "headers": {"Authorization": "Bearer ..."},
    "body": null
  }

  Response:
  {
    "status_code": 200,
    "headers": {...},
    "body": {...},
    "source_ip": "20.x.x.2"
  }

Deployment:
  pip install fastapi uvicorn requests
  uvicorn ip_proxy_service:app --host 0.0.0.0 --port 9000
"""

import json
import logging
import socket
from typing import Any, Dict, Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ip-proxy")

app = FastAPI(
    title="HedgeX IP Proxy",
    description="Routes outbound API calls through user-specific static IPs",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── IP Mapping ─────────────────────────────────────────────
# Maps user_id → local IP address (the private IP bound to the NIC)
# These get populated from environment or config on startup
# Example: user 1 → 10.0.0.5, user 2 → 10.0.0.6, user 3 → 10.0.0.7
# The Azure NIC maps: 10.0.0.5 → Public IP 20.x.x.1, etc.

USER_IP_MAP: Dict[int, str] = {}

# Default: use system default routing (no source binding)
DEFAULT_SOURCE_IP = None


class ProxyRequest(BaseModel):
    user_id: int
    method: str = "GET"  # GET, POST, PUT, DELETE
    url: str
    headers: Optional[Dict[str, str]] = None
    body: Optional[Any] = None
    timeout: int = 30


class ProxyResponse(BaseModel):
    status_code: int
    headers: Dict[str, str]
    body: Any
    source_ip: Optional[str] = None


class SourceAddressAdapter(requests.adapters.HTTPAdapter):
    """Custom adapter that binds outbound connections to a specific local IP."""

    def __init__(self, source_address, **kwargs):
        self.source_address = source_address
        super().__init__(**kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs["source_address"] = (self.source_address, 0)
        super().init_poolmanager(*args, **kwargs)


def make_request_with_source_ip(
    method: str,
    url: str,
    headers: Optional[Dict] = None,
    body: Optional[Any] = None,
    source_ip: Optional[str] = None,
    timeout: int = 30,
) -> requests.Response:
    """Make an HTTP request bound to a specific source IP address."""
    session = requests.Session()

    if source_ip:
        adapter = SourceAddressAdapter(source_ip)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

    kwargs = {
        "url": url,
        "headers": headers or {},
        "timeout": timeout,
    }

    if body is not None:
        if isinstance(body, (dict, list)):
            kwargs["json"] = body
        else:
            kwargs["data"] = body

    response = getattr(session, method.lower())(**kwargs)
    return response


# ── Endpoints ──────────────────────────────────────────────


@app.get("/")
def root():
    """Health check and status."""
    return {
        "service": "HedgeX IP Proxy",
        "version": "1.0.0",
        "user_ip_map": {
            uid: ip for uid, ip in USER_IP_MAP.items()
        },
        "hostname": socket.gethostname(),
        "status": "healthy",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/proxy", response_model=ProxyResponse)
def proxy_request(req: ProxyRequest):
    """
    Forward a request through the user's dedicated IP.

    The source IP binding ensures that Tradovate sees a consistent
    IP address for each user's API calls.
    """
    source_ip = USER_IP_MAP.get(req.user_id, DEFAULT_SOURCE_IP)

    if not source_ip and USER_IP_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"No IP assigned for user_id={req.user_id}. "
                   f"Available: {list(USER_IP_MAP.keys())}",
        )

    logger.info(
        f"[User {req.user_id}] {req.method} {req.url} → source_ip={source_ip}"
    )

    try:
        response = make_request_with_source_ip(
            method=req.method,
            url=req.url,
            headers=req.headers,
            body=req.body,
            source_ip=source_ip,
            timeout=req.timeout,
        )

        # Parse response body
        try:
            resp_body = response.json()
        except (ValueError, json.JSONDecodeError):
            resp_body = response.text

        return ProxyResponse(
            status_code=response.status_code,
            headers=dict(response.headers),
            body=resp_body,
            source_ip=source_ip,
        )

    except requests.exceptions.ConnectionError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Connection error via {source_ip}: {str(e)}",
        )
    except requests.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail=f"Request timed out via {source_ip}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Proxy error: {str(e)}",
        )


@app.get("/whoami/{user_id}")
def whoami(user_id: int):
    """Check what public IP a specific user's requests come from."""
    source_ip = USER_IP_MAP.get(user_id, DEFAULT_SOURCE_IP)

    try:
        response = make_request_with_source_ip(
            method="GET",
            url="https://api.ipify.org?format=json",
            source_ip=source_ip,
            timeout=10,
        )
        public_ip = response.json().get("ip", "unknown")
    except Exception as e:
        public_ip = f"error: {str(e)}"

    return {
        "user_id": user_id,
        "source_ip": source_ip,
        "public_ip": public_ip,
    }


@app.post("/config/set-ip")
def set_user_ip(user_id: int, local_ip: str):
    """Dynamically assign a local IP to a user."""
    USER_IP_MAP[user_id] = local_ip
    logger.info(f"Set user {user_id} → {local_ip}")
    return {"user_id": user_id, "local_ip": local_ip, "map": USER_IP_MAP}


@app.get("/config/ips")
def list_ips():
    """List all user-to-IP mappings."""
    return {"user_ip_map": USER_IP_MAP}


# ── Startup: Load IP config ───────────────────────────────

import os

@app.on_event("startup")
def load_ip_config():
    """
    Load user IP mappings from environment variables.
    Format: USER_IP_1=10.0.0.5  USER_IP_2=10.0.0.6  USER_IP_3=10.0.0.7
    """
    for key, value in os.environ.items():
        if key.startswith("USER_IP_"):
            try:
                user_id = int(key.replace("USER_IP_", ""))
                USER_IP_MAP[user_id] = value
                logger.info(f"Loaded IP mapping: user {user_id} → {value}")
            except ValueError:
                pass

    if not USER_IP_MAP:
        logger.warning(
            "No USER_IP_* env vars found. "
            "Set USER_IP_1=10.0.0.5, USER_IP_2=10.0.0.6, etc. "
            "Or use POST /config/set-ip to configure at runtime."
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)
