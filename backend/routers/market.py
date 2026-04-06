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
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import redis
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["market-live"])

# Redis connection (lazy init) with timeouts
_redis = None
_executor = ThreadPoolExecutor(max_workers=2)


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
async def get_all_prices():
    """Get the latest price for every instrument from Redis."""
    loop = asyncio.get_event_loop()
    try:
        raw = await loop.run_in_executor(_executor, lambda: get_redis().hgetall("hx:prices"))
        prices = {}
        for symbol, tick_json in raw.items():
            try:
                prices[symbol] = json.loads(tick_json)
            except json.JSONDecodeError:
                prices[symbol] = {"symbol": symbol, "error": "invalid_data"}
        return {"prices": prices, "count": len(prices)}
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
        r = get_redis()
        pubsub = r.pubsub()
        pubsub.subscribe("hx:ticks")
        loop = asyncio.get_event_loop()

        try:
            # Send initial snapshot as first event
            all_prices = await loop.run_in_executor(
                _executor, lambda: r.hgetall("hx:prices")
            )
            if all_prices:
                snapshot = {
                    "type": "snapshot",
                    "prices": {},
                }
                for k, v in all_prices.items():
                    try:
                        snapshot["prices"][k] = json.loads(v)
                    except json.JSONDecodeError:
                        pass
                yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"

            # Stream real-time ticks — non-blocking
            while True:
                # Run the blocking pubsub call in a thread
                message = await loop.run_in_executor(
                    _executor, lambda: pubsub.get_message(timeout=1.0)
                )
                if message and message["type"] == "message":
                    tick_data = message["data"]
                    yield f"event: tick\ndata: {tick_data}\n\n"
                else:
                    # Send keepalive comment to prevent timeout
                    yield ": keepalive\n\n"
                await asyncio.sleep(0.05)  # Yield control back to event loop
        except asyncio.CancelledError:
            # Client disconnected
            pass
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
async def get_tick_history(
    symbol: str,
    limit: int = Query(100, ge=1, le=1000),
):
    """Get recent tick history for a specific symbol."""
    loop = asyncio.get_event_loop()
    try:
        raw_ticks = await loop.run_in_executor(
            _executor, lambda: get_redis().lrange(f"hx:ticks:{symbol}", 0, limit - 1)
        )
        ticks = []
        for t in raw_ticks:
            try:
                ticks.append(json.loads(t))
            except json.JSONDecodeError:
                pass
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


# ── Live Quote Fallback (direct from Tradovate) ──────────


@router.get("/live-quote")
def get_live_quote(symbol: str = Query(..., description="Contract symbol e.g. NQM6")):
    """
    Fetch live quote for a symbol.

    Priority:
      1. Redis hx:prices hash (fed by MarketFeedManager WebSocket — zero logins needed)
      2. Direct Tradovate API (fallback — shares Redis-backed token cache)
    """
    # 1. Try Redis first (no login needed, shared across all callers)
    try:
        r = get_redis()
        cached = r.hget("hx:prices", symbol)
        if cached:
            tick = json.loads(cached)
            return {
                "symbol": symbol,
                "price": tick.get("price"),
                "bid": tick.get("bid"),
                "ask": tick.get("ask"),
                "change": 0,
                "source": "redis",
            }
    except Exception:
        pass

    # 2. Fallback: direct Tradovate API (uses Redis-cached token to avoid 429)
    from database import SessionLocal
    from models import BrokerCredential
    from required_api.tradovate_client import TradovateClient

    db = SessionLocal()
    try:
        cred = db.query(BrokerCredential).filter(
            BrokerCredential.is_active == True
        ).first()

        if not cred:
            return {"symbol": symbol, "error": "No active credentials", "price": None}

        client = TradovateClient()
        token, err = client.login(cred.login_id, cred.password)

        if not token:
            return {"symbol": symbol, "error": f"Login failed: {err}", "price": None}

        quote = client.get_last_price(symbol)
        return {
            "symbol": symbol,
            "price": quote.get("last_price"),
            "bid": quote.get("bid"),
            "ask": quote.get("ask"),
            "change": 0,
            "source": "tradovate_direct",
        }
    except Exception as e:
        logger.error(f"Live quote error for {symbol}: {e}")
        return {"symbol": symbol, "error": str(e), "price": None}
    finally:
        db.close()


