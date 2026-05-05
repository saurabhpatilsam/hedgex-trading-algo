#!/usr/bin/env python3
"""
HedgeX Market Data Service — Standalone Tradovate WebSocket → Redis pipeline.

Runs as an independent systemd service (hedgex-md). Maintains a persistent
WebSocket connection to Tradovate's market data server, subscribes to quotes
for all active instruments, and publishes tick data to Redis.

Redis keys:
  hx:prices              — HASH: latest price snapshot per symbol
  hx:ticks               — PUB/SUB channel: every tick event
  hx:ticks:{symbol}      — LIST: recent tick history (capped at 1000)
  hx:md:status           — STRING: service status JSON (heartbeat)
"""
import json
import logging
import os
import sys
import threading
import time
from datetime import datetime, timezone

import redis
import websocket

# Add parent dir to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models import Instrument, BrokerCredential, User
from required_api.tradovate_client import get_proxied_client
from services.redis_config import build_redis_client, redis_connection_info

# ── Config ────────────────────────────────────────────────
WS_URL = "wss://md.tradovateapi.com/v1/websocket"
HEARTBEAT_INTERVAL = 30  # seconds
RECONNECT_DELAY = 5      # seconds
TICK_HISTORY_MAX = 1000   # max ticks per symbol in Redis list

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | hedgex-md | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("hedgex-md")


class MarketDataService:
    def __init__(self):
        logger.info("Connecting market data Redis: %s", redis_connection_info())
        self.redis = build_redis_client(
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=10,
        )
        self.access_token = None
        self.ws = None
        self.symbols = []
        self.running = True
        self.connected = False
        self.authorized = False
        self.last_prices = {}
        self.request_id = 10
        self._contract_map = {}
        self._tick_count = 0

    def _get_credentials(self):
        db = SessionLocal()
        try:
            cred = db.query(BrokerCredential).filter(
                BrokerCredential.is_active == True
            ).first()
            if not cred:
                raise RuntimeError("No active broker credentials found")
            user = db.query(User).filter(User.id == cred.user_id).first()
            return user, cred
        finally:
            db.close()

    def _get_instruments(self):
        db = SessionLocal()
        try:
            instruments = db.query(Instrument).filter(
                Instrument.is_active == True
            ).all()
            symbols = []
            for inst in instruments:
                sym = inst.contract_month if inst.contract_month else inst.symbol
                symbols.append(sym)
            logger.info(f"Active instruments from DB: {symbols}")
            return symbols
        finally:
            db.close()

    def _login(self):
        user, cred = self._get_credentials()
        client = get_proxied_client(user=user)
        token, err = client.login(cred.login_id, cred.password)
        if not token:
            raise RuntimeError(f"Tradovate login failed: {err}")
        self.access_token = token
        logger.info(f"Logged in to Tradovate via user {user.name}")
        return token

    def _next_id(self):
        self.request_id += 1
        return self.request_id

    def _on_open(self, ws):
        logger.info("WebSocket raw connection opened, waiting for SockJS 'o' frame...")

    def _on_message(self, ws, message):
        """Parse incoming Tradovate WebSocket messages.

        Tradovate WS uses a custom text protocol:
        - Frame "o" = connection opened
        - Frame "h" = heartbeat
        - Frame "a[...]" = SockJS array frame wrapping messages
        - Direct frames: "type\\nid\\n\\nbody"
        """
        try:
            if not message:
                return

            raw = message.strip()

            # Log all messages for debugging (truncated)
            if len(raw) < 500:
                logger.info(f"WS MSG: {repr(raw)}")
            else:
                logger.info(f"WS MSG: {repr(raw[:200])}... ({len(raw)} bytes)")

            # SockJS: open frame — NOW send authorization
            if raw == "o":
                logger.info("SockJS session opened, sending authorization...")
                auth_msg = f"authorize\n{self._next_id()}\n\n{self.access_token}"
                ws.send(auth_msg)
                return

            # SockJS: heartbeat
            if raw == "h":
                return

            # SockJS: array-wrapped frame  a["..."]
            if raw.startswith("a["):
                try:
                    arr = json.loads(raw[1:])  # parse the JSON array
                    for item in arr:
                        self._handle_frame(item)
                except json.JSONDecodeError:
                    # Try treating as raw text
                    inner = raw[2:-1]  # strip a[ and ]
                    self._handle_frame(inner)
                return

            # Direct frame (non-SockJS)
            self._handle_frame(raw)

        except Exception as e:
            logger.warning(f"Message parse error: {e} | raw={message[:200]}")

    def _handle_frame(self, frame):
        """Handle a single Tradovate protocol frame (string or dict)."""
        if not frame:
            return

        # If it's already a parsed dict (from SockJS JSON array), handle directly
        if isinstance(frame, dict):
            self._handle_json_data(frame)
            return

        if not isinstance(frame, str):
            return

        frame = frame.strip()
        if not frame:
            return

        # Try parsing as JSON first (common for SockJS string-wrapped JSON)
        if frame.startswith("{") or frame.startswith("["):
            try:
                data = json.loads(frame)
                if isinstance(data, dict):
                    self._handle_json_data(data)
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            self._handle_json_data(item)
                return
            except json.JSONDecodeError:
                pass

        # Tradovate text protocol: "type\nid\n\nbody"
        parts = frame.split("\n", 2)
        body_str = ""
        if len(parts) >= 3:
            body_str = parts[2].strip()
        elif len(parts) == 2:
            body_str = parts[1].strip()

        if not body_str:
            return

        # Find JSON in the body
        json_start = -1
        for i, c in enumerate(body_str):
            if c in ('{', '['):
                json_start = i
                break

        if json_start < 0:
            return

        try:
            data = json.loads(body_str[json_start:])
            if isinstance(data, dict):
                self._handle_json_data(data)
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        self._handle_json_data(item)
        except json.JSONDecodeError:
            pass

    def _handle_json_data(self, data):
        """Process a parsed JSON object from the WebSocket."""
        # Check for authorization response
        if not self.authorized:
            status_code = data.get("s")
            if status_code == 200:
                logger.info("✅ Authorization successful!")
                self.authorized = True
                self.connected = True
                self._subscribe_all()
                self._update_status("connected")
                return
            elif status_code is not None:
                logger.error(f"❌ Authorization failed: status={status_code} data={data}")
                return

        # Current Tradovate market-data frames arrive as {"e":"md","d":{"quotes":[...]}}.
        envelope = data.get("d") if data.get("e") == "md" and isinstance(data.get("d"), dict) else None
        if envelope:
            for quote in envelope.get("quotes", []):
                if isinstance(quote, dict):
                    self._process_quote(quote)
            return

        # Quote data — has 'entries' with Trade, Bid, Ask etc.
        if "entries" in data:
            self._process_quote(data)
        elif "contractId" in data and "entries" not in data:
            # Some subscription confirmations
            logger.debug(f"Subscription response: {data}")

        # Log subscription confirmations
        if data.get("s") == 200:
            logger.debug(f"Request confirmed: id={data.get('i')}")

    def _process_quote(self, data):
        """Process a quote tick and publish to Redis."""
        entries = data.get("entries", {})
        contract_id = data.get("contractId")

        tick = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "contract_id": contract_id,
        }

        if "Trade" in entries:
            trade = entries["Trade"]
            tick["price"] = trade.get("price")
            tick["size"] = trade.get("size")
        if "Bid" in entries:
            tick["bid"] = entries["Bid"].get("price")
            tick["bid_size"] = entries["Bid"].get("size")
        ask_entry = entries.get("Ask") or entries.get("Offer")
        if ask_entry:
            tick["ask"] = ask_entry.get("price")
            tick["ask_size"] = ask_entry.get("size")
        if "TotalTradeVolume" in entries:
            tick["volume"] = entries["TotalTradeVolume"].get("size")
        if "OpenInterest" in entries:
            tick["open_interest"] = entries["OpenInterest"].get("size")
        high_entry = entries.get("High") or entries.get("HighPrice")
        if high_entry:
            tick["high"] = high_entry.get("price")
        low_entry = entries.get("Low") or entries.get("LowPrice")
        if low_entry:
            tick["low"] = low_entry.get("price")
        open_entry = entries.get("Open") or entries.get("OpeningPrice")
        if open_entry:
            tick["open"] = open_entry.get("price")

        # Find which symbol this is for
        symbol = self._contract_map.get(contract_id)
        if not symbol:
            # Try to match by logged contract IDs
            logger.debug(f"Unknown contract_id={contract_id}, known={list(self._contract_map.keys())}")
            return

        tick["symbol"] = symbol

        previous_tick = self.last_prices.get(symbol, {})
        if tick.get("price") is None and previous_tick.get("price") is not None:
            tick["price"] = previous_tick["price"]

        # Calculate change
        last = previous_tick.get("price")
        if last and tick.get("price"):
            tick["change"] = round(tick["price"] - last, 4)
        else:
            tick["change"] = 0

        if tick.get("price"):
            self.last_prices[symbol] = tick

        tick_json = json.dumps(tick)

        # Publish to Redis
        try:
            pipe = self.redis.pipeline()
            pipe.hset("hx:prices", symbol, tick_json)
            pipe.publish("hx:ticks", tick_json)
            pipe.lpush(f"hx:ticks:{symbol}", tick_json)
            pipe.ltrim(f"hx:ticks:{symbol}", 0, TICK_HISTORY_MAX - 1)
            pipe.execute()

            self._tick_count += 1
            if self._tick_count % 100 == 0:
                logger.info(f"📊 Processed {self._tick_count} ticks | Latest: {symbol}={tick.get('price')}")
        except redis.RedisError as e:
            logger.error(f"Redis error: {e}")

    def _subscribe_all(self):
        """Subscribe to quote data for all active instruments."""
        self.symbols = self._get_instruments()
        if not self.symbols:
            logger.warning("No active instruments found in DB")
            return

        logger.info(f"Subscribing to {len(self.symbols)} instruments: {self.symbols}")

        for symbol in self.symbols:
            try:
                # First resolve the contract ID
                self._resolve_contract_id(symbol)

                # Then subscribe
                req_id = self._next_id()
                sub_msg = f'md/subscribeQuote\n{req_id}\n\n{{"symbol": "{symbol}"}}'
                self.ws.send(sub_msg)
                logger.info(f"  📡 Subscribed: {symbol} (req #{req_id})")

                time.sleep(0.3)  # Rate limit
            except Exception as e:
                logger.error(f"Failed to subscribe to {symbol}: {e}")

        logger.info(f"Contract map: {self._contract_map}")

    def _resolve_contract_id(self, symbol):
        """Look up contract ID for symbol and cache the mapping."""
        import urllib.request
        try:
            find_url = f"https://demo.tradovateapi.com/v1/contract/find?name={symbol}"
            req = urllib.request.Request(find_url, headers={
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json",
            })
            resp = urllib.request.urlopen(req, timeout=10)
            contract = json.loads(resp.read())
            cid = contract.get("id")
            if cid:
                self._contract_map[cid] = symbol
                logger.info(f"  🔗 Mapped {symbol} → contract_id={cid}")
            else:
                logger.warning(f"  No contract found for {symbol}")
        except Exception as e:
            logger.warning(f"Could not resolve contract ID for {symbol}: {e}")

    def _on_error(self, ws, error):
        logger.error(f"WebSocket error: {error}")
        self.connected = False
        self.authorized = False
        self._update_status("error", str(error))

    def _on_close(self, ws, close_status_code, close_msg):
        logger.warning(f"WebSocket closed: {close_status_code} {close_msg}")
        self.connected = False
        self.authorized = False
        self._update_status("disconnected")

    def _update_status(self, state, error=None):
        try:
            status = {
                "state": state,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "symbols": self.symbols,
                "symbol_count": len(self.symbols),
                "tick_count": self._tick_count,
                "contract_map": {str(k): v for k, v in self._contract_map.items()},
            }
            if error:
                status["error"] = error
            self.redis.set("hx:md:status", json.dumps(status), ex=120)
        except Exception:
            pass

    def _heartbeat_loop(self):
        while self.running:
            time.sleep(HEARTBEAT_INTERVAL)
            if self.connected and self.ws:
                try:
                    self.ws.send("")
                    self._update_status("connected")
                    logger.info(f"💓 Heartbeat | ticks={self._tick_count} | connected={self.connected}")
                except Exception:
                    pass

    def run(self):
        logger.info("=" * 60)
        logger.info("HedgeX Market Data Service starting...")
        logger.info("=" * 60)

        hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        hb_thread.start()

        while self.running:
            try:
                self._login()
                self.authorized = False

                logger.info(f"Connecting to {WS_URL}...")
                self.ws = websocket.WebSocketApp(
                    WS_URL,
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                )

                self.ws.run_forever(
                    ping_interval=25,
                    ping_timeout=10,
                )

            except KeyboardInterrupt:
                logger.info("Shutting down (keyboard interrupt)...")
                self.running = False
                break
            except Exception as e:
                logger.error(f"Service error: {e}")

            if self.running:
                logger.info(f"Reconnecting in {RECONNECT_DELAY}s...")
                self._update_status("reconnecting")
                time.sleep(RECONNECT_DELAY)

        self._update_status("stopped")
        logger.info("Market Data Service stopped.")


if __name__ == "__main__":
    service = MarketDataService()
    service.run()
