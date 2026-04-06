"""
Market Feed Manager — Continuous WebSocket Server per-Instrument
Maintains persistent Socket.IO WebSocket connections to Tradovate Market Data API.
Subscribes to instruments and pushes real-time ticks into Redis for the REST API to consume.
"""
import asyncio
import json
import logging
import time
from typing import Dict, Set
from collections import defaultdict

from redis import Redis

from required_api.tradovate_client import TradovateClient
from database import SessionLocal
from models import BrokerCredential, Instrument
from routers.market import get_redis

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
        self.client: TradovateClient = None
        self.ws = None
        self._running = False
        self._redis: Redis = None
        self._tick_count: int = 0
        self._last_summary: float = 0
        self._tick_counts_by_sym: Dict[str, int] = defaultdict(int)
        self._initialized = True

    async def start(self):
        """Starts the background feed manager loop in asyncio."""
        if self._running:
            return
        
        self._running = True
        self._redis = get_redis()
        
        # Pull active instruments from DB
        db = SessionLocal()
        try:
            instruments = db.query(Instrument).filter(Instrument.is_active == True).all()
            for inst in instruments:
                sym = inst.contract_month or inst.symbol
                self.active_symbols.add(sym)
                logger.info(f"[MarketFeed] Tracking active instrument: {sym}")
        finally:
            db.close()
            
        asyncio.create_task(self._pump_loop())

    async def _pump_loop(self):
        """Main loop with auto-reconnect: connect, authorize, subscribe, read frames."""
        retry_delay = 5
        max_delay = 60

        while self._running:
            db = SessionLocal()
            cred = db.query(BrokerCredential).filter(BrokerCredential.is_active == True).first()
            db.close()

            if not cred:
                logger.warning("[MarketFeed] No active credentials found. Retrying in 30s...")
                await asyncio.sleep(30)
                continue

            self.client = TradovateClient()
            token, err = self.client.login(cred.login_id, cred.password)
            if not token:
                logger.error(f"[MarketFeed] Failed to authenticate: {err}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_delay)
                continue

            logger.info("[MarketFeed] Spawning background thread for WebSocket Pump...")
            loop = asyncio.get_event_loop()
            try:
                await loop.run_in_executor(None, self._sync_ws_pump, token)
            except Exception as e:
                logger.error(f"[MarketFeed] Pump thread error: {e}")

            if not self._running:
                break
            logger.warning(f"[MarketFeed] WebSocket disconnected. Reconnecting in {retry_delay}s...")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, max_delay)

        self._running = False

    def _sync_ws_pump(self, token: str):
        """Synchronous blocking pump using websocket-client."""
        import websocket
        from datetime import datetime, timezone
        import requests
        
        # Build Reverse ID Map for Trade entries
        self.contract_map = {}
        for sym in self.active_symbols:
            try:
                url = f"https://demo.tradovateapi.com/v1/contract/find?name={sym}"
                res = requests.get(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
                if res.status_code == 200:
                    c_id = res.json().get("id")
                    if c_id:
                        self.contract_map[c_id] = sym
                        logger.info(f"[MarketFeed] Mapped {sym} to {c_id}")
            except Exception as e:
                logger.error(f"[MarketFeed] Map Error for {sym}: {e}")

        ws_url = "wss://md.tradovateapi.com/v1/websocket"
        logger.info(f"[MarketFeed] Connecting to MD WebSocket: {ws_url}")
        
        try:
            ws = websocket.create_connection(ws_url, timeout=10)
        except Exception as e:
            logger.error(f"[MarketFeed] WS Connection failed: {e}")
            return
            
        # 1. Authorize MD
        auth_msg = f"authorize\n1\n\n{token}"
        ws.send(auth_msg)
        try:
            # Drop initial frames until 'a[{"s":200,"i":0...}]'
            for _ in range(5):
                frame = ws.recv()
                if "a[{\"s\":200" in frame:
                    break
        except Exception as e:
            logger.error(f"[MarketFeed] MD Auth timeout/error: {e}")
            ws.close()
            return
            
        logger.info("[MarketFeed] MD Authorized successfully.")
        
        # 2. Subscribe to standard Market Data for all tracked symbols
        sub_id = 2
        for sym in self.active_symbols:
            logger.info(f"[MarketFeed] Subscribing to: {sym}")
            req = f'md/subscribeQuote\n{sub_id}\n\n{{"symbol":"{sym}"}}'
            ws.send(req)
            sub_id += 1
            
        # 3. Listen Pump
        ws.settimeout(2.0)
        last_heartbeat = time.time()
        
        try:
            while self._running:
                # Send manual heartbeat according to Tradovate Socket.IO spec
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
                        logger.error(f"[MarketFeed] JSON Parse Error on frame: {e}")
        finally:
            logger.info("[MarketFeed] Closing WebSocket.")
            ws.close()
            
    def _process_quote(self, quote: dict, sym: str):
        """Extract Trade/Bid/Ask updates and stream to Redis (hash + pubsub + list)."""
        try:
            entries = quote.get("entries", {})
            
            # Build tick from any available data (Trade, Bid, Offer)
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
                "symbol": sym
            }
            tick_json = json.dumps(tick)
            
            # 1. Update the prices HASH (read by GET /api/market/prices)
            self._redis.hset("hx:prices", sym, tick_json)
            
            # 2. PUBLISH to the ticks channel (read by SSE /api/market/stream)
            self._redis.publish("hx:ticks", tick_json)
            
            # 3. Also keep the per-symbol list for tick history
            redis_key = f"hx:market:ticker:{sym}"
            self._redis.lpush(redis_key, tick_json)
            self._redis.ltrim(redis_key, 0, 99)
            
            # 4. Mark active state
            self._redis.set("hx:md:status", json.dumps({"state": "active", "timestamp": time.time()}))
            
            # 5. Periodic summary logging (every 30s instead of per-tick)
            self._tick_count += 1
            self._tick_counts_by_sym[sym] += 1
            now = time.time()
            if now - self._last_summary > 30:
                summary = ", ".join(f"{s}:{c}" for s, c in sorted(self._tick_counts_by_sym.items()))
                logger.info(f"[MarketFeed] 30s summary: {self._tick_count} total ticks | {summary}")
                self._tick_count = 0
                self._tick_counts_by_sym.clear()
                self._last_summary = now
                    
        except Exception as e:
            logger.error(f"[MarketFeed] Error processing quote: {e}")
