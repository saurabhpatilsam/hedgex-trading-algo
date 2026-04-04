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
from typing import Optional

import redis
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["market-live"])

# Redis connection (lazy init)
_redis = None


def get_redis():
    global _redis
    if _redis is None:
        _redis = redis.Redis(
            host="localhost", port=6379, db=0,
            decode_responses=True,
            socket_timeout=3,
            socket_connect_timeout=3,
        )
    return _redis


# ── Latest Prices (snapshot) ──────────────────────────────


@router.get("/prices")
def get_all_prices():
    """Get the latest price for every instrument from Redis."""
    r = get_redis()
    try:
        raw = r.hgetall("hx:prices")
        prices = {}
        for symbol, tick_json in raw.items():
            try:
                prices[symbol] = json.loads(tick_json)
            except json.JSONDecodeError:
                prices[symbol] = {"symbol": symbol, "error": "invalid_data"}
        return {"prices": prices, "count": len(prices)}
    except redis.RedisError as e:
        logger.error(f"Redis error fetching prices: {e}")
        return {"prices": {}, "count": 0, "error": str(e)}


# ── SSE Stream (real-time push) ───────────────────────────


@router.get("/stream")
async def stream_prices():
    """
    Server-Sent Events stream of real-time tick data.

    Frontend connects via EventSource('/api/market/stream').
    Each event is a JSON tick with: symbol, price, bid, ask, volume, change.
    """
    async def event_generator():
        r = get_redis()
        pubsub = r.pubsub()
        pubsub.subscribe("hx:ticks")

        try:
            # Send initial snapshot as first event
            all_prices = r.hgetall("hx:prices")
            if all_prices:
                snapshot = {
                    "type": "snapshot",
                    "prices": {k: json.loads(v) for k, v in all_prices.items()},
                }
                yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"

            # Stream real-time ticks
            while True:
                message = pubsub.get_message(timeout=1.0)
                if message and message["type"] == "message":
                    tick_data = message["data"]
                    yield f"event: tick\ndata: {tick_data}\n\n"
                else:
                    # Send keepalive comment every second to prevent timeout
                    yield ": keepalive\n\n"
                await asyncio.sleep(0.05)  # Yield control back
        except Exception as e:
            logger.error(f"SSE stream error: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            try:
                pubsub.unsubscribe("hx:ticks")
                pubsub.close()
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# ── Tick History ──────────────────────────────────────────


@router.get("/ticks/{symbol}")
def get_tick_history(
    symbol: str,
    limit: int = Query(100, ge=1, le=1000),
):
    """Get recent tick history for a specific symbol."""
    r = get_redis()
    try:
        raw_ticks = r.lrange(f"hx:ticks:{symbol}", 0, limit - 1)
        ticks = []
        for t in raw_ticks:
            try:
                ticks.append(json.loads(t))
            except json.JSONDecodeError:
                pass
        return {"symbol": symbol, "ticks": ticks, "count": len(ticks)}
    except redis.RedisError as e:
        logger.error(f"Redis error fetching tick history: {e}")
        return {"symbol": symbol, "ticks": [], "count": 0, "error": str(e)}


# ── Service Status ────────────────────────────────────────


@router.get("/status")
def get_md_status():
    """Get the market data service health status."""
    r = get_redis()
    try:
        status_raw = r.get("hx:md:status")
        if status_raw:
            return json.loads(status_raw)
        return {"state": "unknown", "message": "No status reported by hedgex-md service"}
    except redis.RedisError as e:
        return {"state": "error", "error": str(e)}
