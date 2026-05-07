"""
Market Feed Manager — Continuous WebSocket Server per-Instrument
Maintains persistent Socket.IO WebSocket connections to Tradovate Market Data API.
Subscribes to instruments and pushes real-time ticks into Redis for the REST API to consume.

Architecture Notes:
  - This runs inside the uvicorn worker process.
  - DB access is minimal (single startup query) then credentials are cached.
  - Token reuse is handled via Redis-based global cache (shared across workers).
  - If DB is unavailable, the feed continues with cached credentials.
"""
import asyncio
import json
import logging
import os
import time
from typing import Dict, Set
from collections import defaultdict

from redis import Redis

from services.tradovate_md_auth import (
    build_ws_authorize_message,
    get_tradovate_md_ws_url,
    get_tradovate_rest_base_url,
    renew_market_data_token,
)

logger = logging.getLogger(__name__)


class MarketFeedManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self.active_symbols: Set[str] = set()
        self.client = None
        self.ws = None
        self._running = False
        self._redis: Redis = None
        self._tick_count: int = 0
        self._last_summary: float = 0
        self._last_config_refresh: float = 0
        self._tick_counts_by_sym: Dict[str, int] = defaultdict(int)
        self._cached_login: str = None
        self._cached_password: str = None
        self._initialized = True

    async def start(self):
        """Starts the background feed manager loop in asyncio."""
        if self._running:
            return

        self._running = True

        # Initialize Redis
        from routers.market import get_redis
        self._redis = get_redis()

        # Load instruments and credentials from DB; the pump refreshes this periodically.
        self._load_config_from_db()

        asyncio.create_task(self._pump_loop())

    def _load_config_from_db(self):
        """Refresh instruments and credentials from DB. Non-fatal on failure."""
        try:
            from database import SessionLocal
            from models import BrokerCredential, Instrument

            db = SessionLocal()
            try:
                # Load instruments
                instruments = db.query(Instrument).filter(Instrument.is_active == True).all()
                next_symbols = set()
                for inst in instruments:
                    sym = inst.contract_month or inst.symbol
                    if sym:
                        next_symbols.add(sym)

                if next_symbols != self.active_symbols:
                    logger.info(f"[MarketFeed] Tracking symbols refreshed: {sorted(next_symbols)}")
                self.active_symbols = next_symbols

                # Load first active credential and cache it (never query DB again)
                cred = db.query(BrokerCredential).filter(BrokerCredential.is_active == True).first()
                if cred:
                    self._cached_login = cred.login_id
                    self._cached_password = cred.password
                    logger.info(f"[MarketFeed] Cached credential for user: {cred.login_id[:8]}***")
                self._last_config_refresh = time.time()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[MarketFeed] DB load failed (non-fatal): {e}")

    def _refresh_config_if_due(self, interval: int = 60):
        if time.time() - self._last_config_refresh >= interval:
            self._load_config_from_db()

    def _get_tokens(self) -> dict:
        """Get valid Tradovate REST + market-data tokens using the global Redis cache.
        
        This avoids redundant logins:
          1. Check Redis for a cached token (shared across all workers)
          2. If valid, return it
          3. If not, login once and cache the result in Redis for 25 minutes
        """
        # 1. Try Redis cache first
        cached = self._redis.get("hx:tradovate:feed_token")
        if cached:
            try:
                data = json.loads(cached)
                # Check expiry
                if data.get("expires_at", 0) > time.time():
                    if data.get("access_token") and data.get("md_access_token"):
                        return data
                    if data.get("token"):
                        tokens = renew_market_data_token(data["token"])
                        tokens["expires_at"] = time.time() + 1500
                        tokens["login_id"] = data.get("login_id", "cached")
                        self._redis.setex("hx:tradovate:feed_token", 1500, json.dumps(tokens))
                        return tokens
            except Exception:
                pass

        # 2. Check 429 cooldown — don't even try if we're rate-limited
        cooldown = self._redis.get("hx:tradovate:login_cooldown")
        if cooldown:
            logger.warning("[MarketFeed] Login cooldown active, waiting...")
            return None

        # 3. Fresh login
        if not self._cached_login:
            return None

        from required_api.tradovate_client import TradovateClient
        client = TradovateClient()
        token, err = client.login(self._cached_login, self._cached_password)

        if not token:
            if "429" in str(err):
                # Set a 90-second cooldown to prevent hammering
                self._redis.setex("hx:tradovate:login_cooldown", 90, "1")
                logger.error(f"[MarketFeed] 429 rate-limited. Cooldown set for 90s.")
            else:
                logger.error(f"[MarketFeed] Login failed: {err}")
            return None

        try:
            tokens = renew_market_data_token(token)
        except Exception as e:
            logger.error(f"[MarketFeed] Failed to renew MD token: {e}")
            return None

        # 4. Cache tokens in Redis for 25 minutes (shared across all workers)
        token_data = json.dumps({
            "access_token": tokens["access_token"],
            "md_access_token": tokens["md_access_token"],
            "expires_at": time.time() + 1500,  # 25 minutes
            "login_id": self._cached_login[:8] + "***",
        })
        self._redis.setex("hx:tradovate:feed_token", 1500, token_data)
        logger.info("[MarketFeed] Fresh REST/MD tokens cached in Redis (25m TTL)")

        return tokens

    async def _pump_loop(self):
        """Main loop with auto-reconnect: connect, authorize, subscribe, read frames."""
        retry_delay = 5
        max_delay = 120

        # Set initial status
        self._update_status("starting")

        while self._running:
            self._refresh_config_if_due()
            if not self.active_symbols:
                logger.error("[MarketFeed] No active instruments found. Retrying DB refresh soon.")
                self._update_status("waiting_for_symbols")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_delay)
                continue

            if not self._cached_login:
                logger.error("[MarketFeed] No credentials found. Retrying DB refresh soon.")
                self._update_status("waiting_for_credentials")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_delay)
                continue

            tokens = self._get_tokens()
            if not tokens:
                self._update_status("reconnecting")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_delay)
                continue

            logger.info("[MarketFeed] Spawning WebSocket pump thread...")
            loop = asyncio.get_event_loop()
            try:
                await loop.run_in_executor(
                    None,
                    self._sync_ws_pump,
                    tokens["access_token"],
                    tokens["md_access_token"],
                )
            except Exception as e:
                logger.error(f"[MarketFeed] Pump thread error: {e}")

            if not self._running:
                break

            # Reset retry on successful sessions (ran for > 30s)
            retry_delay = 5
            logger.warning(f"[MarketFeed] WebSocket disconnected. Reconnecting in {retry_delay}s...")
            self._update_status("reconnecting")
            await asyncio.sleep(retry_delay)

        self._running = False

    def _update_status(self, state: str, extra: dict = None):
        """Update the Redis status key for the frontend to consume."""
        from datetime import datetime, timezone
        status = {
            "state": state,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "symbols": sorted(self.active_symbols),
            "symbol_count": len(self.active_symbols),
            "tick_count": self._tick_count,
            "contract_map": {str(k): v for k, v in getattr(self, "contract_map", {}).items()},
        }
        if extra:
            status.update(extra)
        self._redis.set("hx:md:status", json.dumps(status))

    def _sync_ws_pump(self, access_token: str, md_access_token: str):
        """Synchronous blocking pump using websocket-client."""
        import websocket
        import requests

        # Build Reverse ID Map for Trade entries
        self.contract_map = {}
        for sym in self.active_symbols:
            try:
                url = f"{get_tradovate_rest_base_url()}/contract/find?name={sym}"
                res = requests.get(url, headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"})
                if res.status_code == 200:
                    c_id = res.json().get("id")
                    if c_id:
                        self.contract_map[c_id] = sym
                        logger.info(f"[MarketFeed] Mapped {sym} → contractId={c_id}")
                elif res.status_code == 404:
                    logger.warning(f"[MarketFeed] Contract not found: {sym} (may be expired)")
            except Exception as e:
                logger.error(f"[MarketFeed] Map Error for {sym}: {e}")

        if not self.contract_map:
            logger.error("[MarketFeed] No valid contracts resolved. Check instrument symbols.")
            return

        ws_url = get_tradovate_md_ws_url()
        logger.info(f"[MarketFeed] Connecting to: {ws_url}")

        try:
            ws = websocket.create_connection(ws_url, timeout=10)
        except Exception as e:
            logger.error(f"[MarketFeed] WS Connection failed: {e}")
            return

        # 1. Authorize MD
        auth_msg = build_ws_authorize_message(1, md_access_token)
        ws.send(auth_msg)
        authorized = False
        last_frame = ""
        try:
            for _ in range(5):
                frame = ws.recv()
                last_frame = frame
                if (
                    '"s":200' in frame
                    or '"s": 200' in frame
                    or '\\"s\\":200' in frame
                    or '\\"s\\": 200' in frame
                ):
                    authorized = True
                    break
        except Exception as e:
            logger.error(f"[MarketFeed] MD Auth timeout/error: {e}")
            ws.close()
            return
        if not authorized:
            logger.error(f"[MarketFeed] MD authorization failed; last frame={last_frame[:300]!r}")
            ws.close()
            return

        logger.info("[MarketFeed] ✅ MD Authorized. Subscribing to instruments...")
        self._update_status("connected")

        # 2. Subscribe to Market Data for all tracked symbols
        sub_id = 2
        for sym in self.active_symbols:
            logger.info(f"[MarketFeed] Subscribing: {sym}")
            req = f'md/subscribeQuote\n{sub_id}\n\n{{"symbol":"{sym}"}}'
            ws.send(req)
            sub_id += 1

        # 3. Listen Pump
        ws.settimeout(2.0)
        last_heartbeat = time.time()
        session_start = time.time()

        try:
            while self._running:
                # Heartbeat
                if time.time() - last_heartbeat > 2.5:
                    try:
                        ws.send("[]")
                    except Exception:
                        logger.warning("[MarketFeed] Heartbeat send failed, reconnecting...")
                        break
                    last_heartbeat = time.time()

                try:
                    frame = ws.recv()
                except websocket.WebSocketTimeoutException:
                    continue
                except Exception as e:
                    logger.error(f"[MarketFeed] WS Read Error: {e}")
                    break

                if frame == "h":
                    try:
                        ws.send("[]")
                    except Exception:
                        break
                    last_heartbeat = time.time()
                    continue

                if frame.startswith("a["):
                    try:
                        batch = json.loads(frame[1:])
                        for msg in batch:
                            if "e" in msg and msg["e"] == "md" and "d" in msg:
                                data = msg["d"]
                                if "quotes" in data:
                                    for quote in data["quotes"]:
                                        c_id = quote.get("contractId")
                                        sym = self.contract_map.get(c_id, "UNKNOWN")
                                        if sym == "UNKNOWN":
                                            continue
                                        self._process_quote(quote, sym)
                    except Exception as e:
                        logger.error(f"[MarketFeed] JSON Parse Error: {e}")
        finally:
            session_duration = int(time.time() - session_start)
            logger.info(f"[MarketFeed] Closing WebSocket. Session lasted {session_duration}s.")
            ws.close()

    def _process_quote(self, quote: dict, sym: str):
        """Extract Trade/Bid/Ask updates and stream to Redis (hash + pubsub + list)."""
        try:
            entries = quote.get("entries", {})

            trade = entries.get("Trade", {})
            bid_entry = entries.get("Bid", {})
            ask_entry = entries.get("Offer", {})

            price = trade.get("price") or bid_entry.get("price") or ask_entry.get("price")
            if price is None:
                return

            tick = {
                "date": time.time(),
                "price": float(price),
                "volume": int(trade.get("size", 0)),
                "bid": float(bid_entry.get("price", 0)),
                "ask": float(ask_entry.get("price", 0)),
                "symbol": sym,
            }
            tick_json = json.dumps(tick)

            # 1. Update the prices HASH (read by GET /api/market/prices)
            self._redis.hset("hx:prices", sym, tick_json)

            # 2. PUBLISH to the ticks channel (read by SSE /api/market/stream)
            self._redis.publish("hx:ticks", tick_json)

            # 3. Keep per-symbol tick history list
            redis_key = f"hx:market:ticker:{sym}"
            self._redis.lpush(redis_key, tick_json)
            self._redis.ltrim(redis_key, 0, 99)

            # 4. Mark active state (throttled — every 5 seconds max)
            self._tick_count += 1
            self._tick_counts_by_sym[sym] += 1
            now = time.time()

            if now - self._last_summary > 30:
                # Update status + log summary
                self._update_status("active")
                summary = ", ".join(f"{s}:{c}" for s, c in sorted(self._tick_counts_by_sym.items()))
                logger.info(f"[MarketFeed] 30s summary: {self._tick_count} total ticks | {summary}")
                self._tick_count = 0
                self._tick_counts_by_sym.clear()
                self._last_summary = now

        except Exception as e:
            logger.error(f"[MarketFeed] Error processing quote: {e}")
