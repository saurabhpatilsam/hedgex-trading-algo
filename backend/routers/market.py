"""
Live Market Data Router — Real-time price streaming via SSE.

Endpoints:
  GET  /api/market/prices            — Snapshot of all latest prices from Redis
  GET  /api/market/stream            — SSE stream of real-time tick data
  GET  /api/market/ticks/{symbol}    — Recent tick history for a symbol
  GET  /api/market/status            — Market data service health
"""
import asyncio
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from services.redis_config import build_redis_client, redis_connection_info

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["market-live"])

PRICE_HASH_KEY = os.environ.get("REDIS_PRICE_HASH_KEY", "hx:prices")
TICK_CHANNELS = tuple(
    ch.strip() for ch in os.environ.get("REDIS_TICK_CHANNELS", "hx:ticks").split(",") if ch.strip()
)
try:
    PRICE_POLL_INTERVAL = max(0.2, float(os.environ.get("REDIS_PRICE_POLL_INTERVAL", "1.0")))
except ValueError:
    PRICE_POLL_INTERVAL = 1.0

# Redis connection (lazy init) with timeouts
_redis = None
_executor = ThreadPoolExecutor(max_workers=2)


def get_redis():
    global _redis
    if _redis is None:
        logger.info("Connecting market data Redis: %s", redis_connection_info())
        _redis = build_redis_client(
            decode_responses=True,
            socket_timeout=3,
            socket_connect_timeout=3,
        )
    return _redis


def decode_tick_payload(payload, fallback_symbol: Optional[str] = None) -> Optional[Dict]:
    """Decode a Redis tick payload into a frontend-safe dict."""
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return None
    if not isinstance(payload, dict):
        return None

    values = payload.get("v") if isinstance(payload.get("v"), dict) else payload
    symbol = (
        payload.get("symbol")
        or payload.get("contract_month")
        or payload.get("n")
        or values.get("symbol")
        or fallback_symbol
    )
    if symbol:
        payload = dict(payload)
        payload["symbol"] = str(symbol)
    return payload


def decode_price_hash(raw_prices: Dict[str, str]) -> Dict[str, Dict]:
    """Decode hx:prices hash rows, dropping malformed entries instead of rendering stale errors."""
    prices = {}
    for symbol, tick_json in (raw_prices or {}).items():
        tick = decode_tick_payload(tick_json, fallback_symbol=symbol)
        if tick:
            prices[symbol] = tick
    return prices


def format_sse_error_event(message: str) -> str:
    """Format a Redis/SSE error as an EventSource frame instead of crashing the stream."""
    return f"event: error\ndata: {json.dumps({'error': str(message)})}\n\n"


# ── Latest Prices (snapshot) ──────────────────────────────


@router.get("/prices")
async def get_all_prices():
    """Get the latest price for every instrument from Redis."""
    loop = asyncio.get_event_loop()
    try:
        raw = await loop.run_in_executor(_executor, lambda: get_redis().hgetall(PRICE_HASH_KEY))
        prices = decode_price_hash(raw)
        return {"prices": prices, "count": len(prices), "source": "redis"}
    except Exception as e:
        logger.error(f"Redis error fetching prices: {e}")
        return {"prices": {}, "count": 0, "error": str(e)}


# ── SSE Stream (real-time push) ───────────────────────────


@router.get("/stream")
async def stream_prices():
    """
    Server-Sent Events stream of real-time tick data.

    Uses run_in_executor to avoid blocking the async event loop.
    Frontend connects via EventSource('/api/market/stream').
    """
    async def event_generator():
        r = None
        pubsub = None
        subscribed_channels = TICK_CHANNELS or ("hx:ticks",)
        loop = asyncio.get_event_loop()
        last_seen = {}
        last_poll = 0.0

        try:
            r = get_redis()
            pubsub = r.pubsub()
            await loop.run_in_executor(
                _executor, lambda: pubsub.subscribe(*subscribed_channels)
            )

            # Send initial snapshot as first event
            all_prices = await loop.run_in_executor(
                _executor, lambda: r.hgetall(PRICE_HASH_KEY)
            )
            snapshot_prices = decode_price_hash(all_prices)
            for symbol, raw_tick in all_prices.items():
                last_seen[symbol] = raw_tick
            if snapshot_prices:
                snapshot = {
                    "type": "snapshot",
                    "prices": snapshot_prices,
                }
                yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"

            # Stream real-time ticks — non-blocking
            while True:
                sent_event = False
                # Run the blocking pubsub call in a thread
                message = await loop.run_in_executor(
                    _executor, lambda: pubsub.get_message(timeout=0.5)
                )
                if message and message["type"] == "message":
                    tick = decode_tick_payload(message["data"])
                    if tick and tick.get("symbol"):
                        last_seen[tick["symbol"]] = message["data"]
                        yield f"event: tick\ndata: {json.dumps(tick)}\n\n"
                        sent_event = True

                now = loop.time()
                if now - last_poll >= PRICE_POLL_INTERVAL:
                    all_prices = await loop.run_in_executor(
                        _executor, lambda: r.hgetall(PRICE_HASH_KEY)
                    )
                    for symbol, raw_tick in all_prices.items():
                        if raw_tick == last_seen.get(symbol):
                            continue
                        tick = decode_tick_payload(raw_tick, fallback_symbol=symbol)
                        if not tick:
                            continue
                        last_seen[symbol] = raw_tick
                        yield f"event: tick\ndata: {json.dumps(tick)}\n\n"
                        sent_event = True
                    last_poll = now

                if not sent_event:
                    # Send keepalive comment to prevent timeout
                    yield ": keepalive\n\n"
                await asyncio.sleep(0.05)  # Yield control back to event loop
        except asyncio.CancelledError:
            # Client disconnected
            pass
        except Exception as e:
            logger.error(f"SSE stream error: {e}")
            yield format_sse_error_event(str(e))
        finally:
            try:
                if pubsub is not None:
                    pubsub.unsubscribe(*subscribed_channels)
                    pubsub.close()
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# ── Tick History ──────────────────────────────────────────


@router.get("/ticks/{symbol}")
async def get_tick_history(
    symbol: str,
    limit: int = Query(100, ge=1, le=1000),
):
    """Get recent tick history for a specific symbol."""
    loop = asyncio.get_event_loop()
    try:
        history_keys = (f"hx:ticks:{symbol}", f"hx:market:ticker:{symbol}")
        raw_ticks = []
        for key in history_keys:
            raw_ticks = await loop.run_in_executor(
                _executor, lambda k=key: get_redis().lrange(k, 0, limit - 1)
            )
            if raw_ticks:
                break
        ticks = []
        for t in raw_ticks:
            tick = decode_tick_payload(t, fallback_symbol=symbol)
            if tick:
                ticks.append(tick)
        return {"symbol": symbol, "ticks": ticks, "count": len(ticks)}
    except Exception as e:
        logger.error(f"Redis error fetching tick history: {e}")
        return {"symbol": symbol, "ticks": [], "count": 0, "error": str(e)}


# ── Service Status ────────────────────────────────────────


@router.get("/status")
async def get_md_status():
    """Get the market data service health status."""
    loop = asyncio.get_event_loop()
    try:
        status_raw = await loop.run_in_executor(
            _executor, lambda: get_redis().get("hx:md:status")
        )
        if status_raw:
            return json.loads(status_raw)
        return {"state": "unknown", "message": "No status reported by hedgex-md service"}
    except Exception as e:
        return {"state": "error", "error": str(e)}


# ── Live Quote (Redis only) ──────────────────────────────


@router.get("/live-quote")
def get_live_quote(symbol: str = Query(..., description="Contract symbol e.g. NQM6")):
    """
    Fetch live quote for a symbol from Redis.
    """
    try:
        from services.tv_bridge_service import get_redis_quote
        quote = get_redis_quote(symbol, redis_client=get_redis())
        return {
            "symbol": symbol,
            "price": quote.get("price"),
            "bid": quote.get("bid"),
            "ask": quote.get("ask"),
            "change": 0,
            "source": "redis",
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e), "price": None}
