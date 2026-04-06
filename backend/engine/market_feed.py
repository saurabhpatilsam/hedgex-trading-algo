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
        """Main loop: connect, authorize, subscribe, read frames."""
        # This will use the generic TradovateClient and its cached token
        db = SessionLocal()
        cred = db.query(BrokerCredential).filter(BrokerCredential.is_active == True).first()
        db.close()

        if not cred:
            logger.warning("[MarketFeed] No active credentials found to start Market Feed.")
            self._running = False
            return
            
        self.client = TradovateClient()
        # Ensure we have a valid token (cached or fresh)
        token, err = self.client.login(cred.login_id, cred.password)
        if not token:
            logger.error(f"[MarketFeed] Failed to authenticate: {err}")
            self._running = False
            return

        import websocket
        
        logger.info("[MarketFeed] Spawning background thread for WebSocket Pump...")
        # Since websocket-client is blocking, we wrap it in a thread executor
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._sync_ws_pump, token)
        
        self._running = False

    def _sync_ws_pump(self, token: str):
        """Synchronous blocking pump using websocket-client."""
        import websocket
        from datetime import datetime, timezone
        
        ws_url = "wss://md.tradovateapi.com/v1/websocket"
        logger.info(f"[MarketFeed] Connecting to MD WebSocket: {ws_url}")
        
        try:
            ws = websocket.create_connection(ws_url, timeout=10)
        except Exception as e:
            logger.error(f"[MarketFeed] WS Connection failed: {e}")
            return
            
        # 1. Authorize MD
        auth_msg = f"authorize\n{token}"
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
        sub_id = 1
        for sym in self.active_symbols:
            logger.info(f"[MarketFeed] Subscribing to: {sym}")
            req = f'md/subscribeQuote\n{sub_id}\n{{"symbol":"{sym}"}}'
            ws.send(req)
            sub_id += 1
            
        # 3. Listen Pump
        ws.settimeout(2.0)
        last_heartbeat = time.time()
        
        try:
            while self._running:
                # Send manual heartbeat according to Tradovate Socket.IO spec
                if time.time() - last_heartbeat > 2.5:
                    ws.send("[]")
                    last_heartbeat = time.time()
                
                try:
                    frame = ws.recv()
                except websocket.WebSocketTimeoutException:
                    continue
                except Exception as e:
                    logger.error(f"[MarketFeed] WS Read Error: {e}")
                    break
                    
                if frame == "h":
                    ws.send("[]")
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
                                        self._process_quote(quote)
                    except Exception as e:
                        logger.error(f"[MarketFeed] JSON Parse Error on frame: {e}")
        finally:
            logger.info("[MarketFeed] Closing WebSocket.")
            ws.close()
            
    def _process_quote(self, quote: dict):
        """Extract Trade updates and stream them to Redis."""
        try:
            entries = quote.get("entries", {})
            sym = quote.get("contractName", "UNKNOWN")
            
            # Map standard quotes (Trade=Trade, Bid/Offer can also be captured if needed)
            if "Trade" in entries:
                trade = entries["Trade"]
                price = trade.get("price")
                if price is not None:
                    # Construct uniform tick response
                    tick = {
                        "date": time.time(),
                        "price": float(price),
                        "volume": int(trade.get("size", 0)),
                        "bid": float(entries.get("Bid", {}).get("price", 0)),
                        "ask": float(entries.get("Offer", {}).get("price", 0))
                    }
                    
                    redis_key = f"hx:market:ticker:{sym}"
                    self._redis.lpush(redis_key, json.dumps(tick))
                    self._redis.ltrim(redis_key, 0, 99)
                    # Mark active state
                    self._redis.set("hx:md:status", json.dumps({"state": "active", "timestamp": time.time()}))
                    
        except Exception as e:
            logger.error(f"[MarketFeed] Error processing quote: {e}")
