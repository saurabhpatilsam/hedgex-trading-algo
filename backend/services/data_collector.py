"""
Data Collection Service — Fetch and store historical market data.

Three data sources:
  1. SUPABASE — Pull tick-by-tick from existing Supabase tables (ticks_nq, ticks_es, etc.)
  2. TRADOVATE_WS — Connect to Tradovate WebSocket for md/getChart (candlestick data)
  3. REDIS_LIVE — Capture live price stream data

This module handles the actual data fetching, transformation, and storage into our local DB.
"""
import os
import json
import asyncio
import logging
import threading
import websocket as ws_client  # websocket-client library
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Generator
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Supabase Configuration ─────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Symbol → Supabase table name mapping
SUPABASE_TICK_TABLES = {
    "NQ": "ticks_nq",
    "MNQ": "ticks_mnq",
    "ES": "ticks_es",
    "MES": "ticks_mes",
    "GC": "ticks_gc",
    "MGC": "ticks_mgc",
}

# Tradovate WebSocket endpoints
TRADOVATE_MD_WS_DEMO = "wss://md-demo.tradovateapi.com/v1/websocket"
TRADOVATE_MD_WS_LIVE = "wss://md.tradovateapi.com/v1/websocket"
TRADOVATE_AUTH_URL = "https://demo.tradovateapi.com/v1/auth/accesstokenrequest"

LONDON_TZ = ZoneInfo("Europe/London")
UTC = timezone.utc


# ── Supabase Data Fetcher ──────────────────────────────────


def fetch_ticks_from_supabase(
    symbol: str,
    start_time: datetime,
    end_time: datetime,
    page_size: int = 1000,
) -> Generator[Dict, None, None]:
    """
    Fetch tick-by-tick data from Supabase using keyset pagination.

    Yields individual tick dicts: {ts, last, bid, ask, volume, ...}

    This reuses the exact logic from orca_supabase.stream_ticks_keyset()
    but is self-contained so our backend doesn't depend on external_libs at runtime.
    """
    try:
        from supabase import create_client
    except ImportError:
        logger.error(
            "supabase package not installed. "
            "Install with: pip install supabase"
        )
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL and SUPABASE_KEY must be set in environment")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    table_name = SUPABASE_TICK_TABLES.get(symbol.upper())
    if not table_name:
        logger.error(
            f"No Supabase table mapping for symbol '{symbol}'. "
            f"Available: {list(SUPABASE_TICK_TABLES.keys())}"
        )
        return

    # Truncate to minute precision (matches orca_supabase behavior)
    data_from = start_time.replace(second=0, microsecond=0)
    data_to = end_time.replace(second=0, microsecond=0)
    data_to_exclusive = data_to + timedelta(minutes=1)

    from_iso = data_from.isoformat()
    to_iso = data_to_exclusive.isoformat()

    last_ts = None
    last_id = None
    total_fetched = 0

    logger.info(
        f"📡 Fetching ticks from Supabase: {table_name} | "
        f"{from_iso} → {to_iso}"
    )

    while True:
        q = (
            supabase.table(table_name)
            .select("*")
            .order("ts", desc=False)
            .order("id", desc=False)
            .gte("ts", from_iso)
            .lt("ts", to_iso)
            .limit(page_size)
        )

        if last_ts is not None:
            q = q.or_(
                f"ts.gt.{last_ts},and(ts.eq.{last_ts},id.gt.{last_id})"
            )

        resp = q.execute()
        batch = resp.data or []
        if not batch:
            break

        for row in batch:
            total_fetched += 1
            yield row

        last_ts = batch[-1]["ts"]
        last_id = batch[-1]["id"]

        if len(batch) < page_size:
            break

    logger.info(f"✅ Fetched {total_fetched} ticks from Supabase ({table_name})")


def save_ticks_to_db(
    db: Session,
    symbol: str,
    ticks: List[Dict],
    source: str = "SUPABASE",
    contract: Optional[str] = None,
) -> int:
    """
    Save tick data to our local database.

    Args:
        db: SQLAlchemy session
        symbol: Instrument symbol ("NQ", "ES", etc.)
        ticks: List of tick dicts with {ts, last, bid, ask, ...}
        source: Data source enum string
        contract: Optional contract name (e.g. "NQH6")

    Returns:
        Number of records saved
    """
    from models_market_data import TickData, DataSource

    source_enum = DataSource(source)
    count = 0
    batch = []

    for tick in ticks:
        ts = tick.get("ts") or tick.get("timestamp")
        price = tick.get("last") or tick.get("price") or tick.get("LAST")

        if ts is None or price is None:
            continue

        # Parse timestamp if string
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                try:
                    ts = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S.%f")
                except ValueError:
                    ts = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")

        tick_record = TickData(
            symbol=symbol.upper(),
            contract=contract,
            timestamp=ts,
            price=float(price),
            bid=float(tick["bid"]) if tick.get("bid") else None,
            ask=float(tick["ask"]) if tick.get("ask") else None,
            volume=int(tick["volume"]) if tick.get("volume") else None,
            source=source_enum,
        )
        batch.append(tick_record)
        count += 1

        # Batch insert every 500 records for efficiency
        if len(batch) >= 500:
            db.bulk_save_objects(batch)
            db.flush()
            batch = []

    # Save remaining
    if batch:
        db.bulk_save_objects(batch)
        db.flush()

    db.commit()
    logger.info(f"💾 Saved {count} ticks to DB for {symbol}")
    return count


def save_candles_to_db(
    db: Session,
    candles: List[Dict],
    symbol: str,
    timeframe: str,
    source: str = "SUPABASE",
    contract: Optional[str] = None,
) -> int:
    """
    Save aggregated candle data to our local database.

    Args:
        db: SQLAlchemy session
        candles: List of candle dicts from candle_aggregator
        symbol: Instrument symbol
        timeframe: Candle timeframe string
        source: Data source
        contract: Optional contract name

    Returns:
        Number of records saved
    """
    from models_market_data import CandleData, CandleTimeframe, DataSource

    source_enum = DataSource(source)
    tf_enum = CandleTimeframe(timeframe)
    count = 0

    for candle in candles:
        ts = candle["timestamp"]
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

        candle_record = CandleData(
            symbol=symbol.upper(),
            contract=contract,
            timeframe=tf_enum,
            timestamp=ts,
            open=candle["open"],
            high=candle["high"],
            low=candle["low"],
            close=candle["close"],
            volume=candle.get("volume", 0),
            tick_count=candle.get("tick_count", 0),
            source=source_enum,
        )
        db.add(candle_record)
        count += 1

    db.commit()
    logger.info(
        f"💾 Saved {count} candles ({timeframe}) to DB for {symbol}"
    )
    return count


# ── Full Collection Pipeline ───────────────────────────────


def collect_and_store_tick_data(
    db: Session,
    symbol: str,
    start_time: datetime,
    end_time: datetime,
    also_build_candles: Optional[List[str]] = None,
    contract: Optional[str] = None,
) -> Dict:
    """
    Complete pipeline: Fetch ticks from Supabase → Store in DB → Optionally build candles.

    Args:
        db: SQLAlchemy session
        symbol: Instrument symbol ("NQ", "ES", etc.)
        start_time: Start of data range (UTC)
        end_time: End of data range (UTC)
        also_build_candles: Optional list of timeframes to also generate candles
                           e.g. ["30m", "1h", "4h"]
        contract: Optional contract name

    Returns:
        Report dict with counts and status
    """
    from services.candle_aggregator import aggregate_ticks_to_candles

    report = {
        "symbol": symbol,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "ticks_fetched": 0,
        "ticks_stored": 0,
        "candles": {},
        "status": "running",
    }

    # Step 1: Fetch ticks from Supabase
    logger.info(
        f"🚀 Starting data collection for {symbol}: "
        f"{start_time} → {end_time}"
    )

    all_ticks = []
    for tick in fetch_ticks_from_supabase(symbol, start_time, end_time):
        all_ticks.append(tick)

    report["ticks_fetched"] = len(all_ticks)

    if not all_ticks:
        report["status"] = "completed"
        report["message"] = "No tick data found in Supabase for the given range"
        logger.warning(f"⚠️ No ticks found for {symbol} in the requested range")
        return report

    # Step 2: Save ticks to local DB
    ticks_stored = save_ticks_to_db(
        db, symbol, all_ticks, source="SUPABASE", contract=contract
    )
    report["ticks_stored"] = ticks_stored

    # Step 3: Build candles if requested
    if also_build_candles:
        for tf in also_build_candles:
            try:
                candles = aggregate_ticks_to_candles(
                    all_ticks,
                    timeframe=tf,
                    symbol=symbol,
                    timestamp_key="ts",
                    price_key="last",
                )
                candles_stored = save_candles_to_db(
                    db, candles, symbol, tf,
                    source="SUPABASE", contract=contract,
                )
                report["candles"][tf] = {
                    "count": candles_stored,
                    "status": "ok",
                }
            except Exception as e:
                report["candles"][tf] = {
                    "count": 0,
                    "status": f"error: {str(e)}",
                }
                logger.error(f"Error building {tf} candles: {e}")

    report["status"] = "completed"
    logger.info(
        f"✅ Collection complete for {symbol}: "
        f"{report['ticks_fetched']} ticks, "
        f"{len(report.get('candles', {}))} candle timeframes"
    )
    return report


# ── Tradovate WebSocket Market Data Client ─────────────────


class TradovateMarketDataClient:
    """
    WebSocket client for Tradovate's md/getChart endpoint.

    Fetches historical candlestick data via WebSocket:
      1. Connect to wss://md-demo.tradovateapi.com/v1/websocket
      2. Authorize with access token
      3. Send md/getChart request
      4. Collect historical bars until eoh: true
      5. Disconnect

    Protocol (SockJS framing):
      - "o" = connection opened
      - "h" = heartbeat
      - 'a["json-string", ...]' = data frames (array of JSON-encoded strings)
      - Auth response: {"s": 200, "i": 1}
      - Chart data: {"e": "chart", "d": {"charts": [{"id":..., "bars":[...], "eoh": true}]}}
    """

    def __init__(self, access_token: str, demo: bool = True):
        self.access_token = access_token
        self.ws_url = TRADOVATE_MD_WS_DEMO if demo else TRADOVATE_MD_WS_LIVE
        self.ws = None
        self.bars = []
        self._seen_timestamps = set()  # Deduplicate live updates
        self.is_authenticated = False
        self.history_complete = False
        self._request_id = 1

    def get_chart_data(
        self,
        symbol: str,
        timeframe_minutes: int = 60,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        num_elements: int = 500,
    ) -> List[Dict]:
        """
        Fetch historical chart data from Tradovate.

        Args:
            symbol: Contract symbol (e.g. "NQH6", "ESH6")
            timeframe_minutes: Bar size in minutes (1, 5, 15, 30, 60, 240, 1440)
            start_time: Optional earliest timestamp
            end_time: Optional latest timestamp
            num_elements: Number of bars if no time range specified

        Returns:
            List of bar dicts: [{timestamp, open, high, low, close, volume}, ...]
        """
        self.bars = []
        self._seen_timestamps = set()
        self.history_complete = False
        self.is_authenticated = False

        # Determine chart type
        if timeframe_minutes >= 1440:
            underlying_type = "DailyBar"
            element_size = timeframe_minutes // 1440
        else:
            underlying_type = "MinuteBar"
            element_size = timeframe_minutes

        # Build request
        chart_request = {
            "symbol": symbol,
            "chartDescription": {
                "underlyingType": underlying_type,
                "elementSize": element_size,
                "elementSizeUnit": "UnderlyingUnits",
                "withHistogram": False,
            },
            "timeRange": {},
        }

        if start_time and end_time:
            chart_request["timeRange"] = {
                "asFarAsTimestamp": start_time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "closestTimestamp": end_time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            }
        else:
            chart_request["timeRange"] = {
                "asMuchAsElements": num_elements,
            }

        try:
            self._connect_and_fetch(chart_request)
        except Exception as e:
            logger.error(f"Error fetching chart data: {e}")

        return self.bars

    def _connect_and_fetch(self, chart_request: Dict):
        """Connect to WebSocket, authenticate, and fetch data."""
        import ssl

        def on_open(ws):
            logger.info("🔌 Connected to Tradovate Market Data WebSocket")
            # Send authorization
            auth_msg = f"authorize\n{self._request_id}\n\n{self.access_token}"
            self._request_id += 1
            ws.send(auth_msg)

        def on_message(ws, message):
            self._handle_message(ws, message, chart_request)

        def on_error(ws, error):
            logger.error(f"WebSocket error: {error}")

        def on_close(ws, close_status_code, close_msg):
            logger.info("WebSocket connection closed")

        self.ws = ws_client.WebSocketApp(
            self.ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )

        # SSL without verification (Tradovate demo uses self-signed certs)
        sslopt = {"cert_reqs": ssl.CERT_NONE}

        # Run with a timeout to not hang forever
        ws_thread = threading.Thread(
            target=lambda: self.ws.run_forever(sslopt=sslopt),
            daemon=True,
        )
        ws_thread.start()
        ws_thread.join(timeout=60)  # Max 60 seconds

        if ws_thread.is_alive():
            self.ws.close()
            logger.warning("WebSocket timed out after 60 seconds")

    def _handle_message(self, ws, message: str, chart_request: Dict):
        """
        Parse incoming WebSocket messages.

        Tradovate uses SockJS framing:
          - "o" = connection opened
          - "h" = heartbeat
          - 'a[...]' = data array where each item is a JSON-encoded string
        """
        if not message or message == "o":
            return

        if message.startswith("h"):
            return

        if not message.startswith("a"):
            return

        try:
            items = json.loads(message[1:])  # Strip "a" prefix, parse JSON array
        except json.JSONDecodeError:
            logger.debug(f"Could not parse frame: {message[:100]}")
            return

        for item in items:
            # Each item is a JSON-encoded string that needs double-parsing
            if isinstance(item, str):
                try:
                    data = json.loads(item)
                except json.JSONDecodeError:
                    continue
            else:
                data = item

            if not isinstance(data, dict):
                continue

            self._process_data(ws, data, chart_request)

    def _process_data(self, ws, data: Dict, chart_request: Dict):
        """Process a parsed data dict from the WebSocket."""

        # Auth response: {"s": 200, "i": 1}
        if data.get("s") == 200 and not self.is_authenticated:
            self.is_authenticated = True
            logger.info("✅ Authenticated with Tradovate MD WebSocket")

            # Send chart request
            req_body = json.dumps(chart_request)
            msg = f"md/getChart\n{self._request_id}\n\n{req_body}"
            self._request_id += 1
            ws.send(msg)
            logger.info(
                f"📊 Sent md/getChart request for {chart_request['symbol']}"
            )
            return

        # Chart data event: {"e": "chart", "d": {"charts": [{"id":..., "bars":[...], "eoh":true}]}}
        if data.get("e") == "chart":
            charts = data.get("d", {}).get("charts", [])
            for chart in charts:
                bars = chart.get("bars", [])
                is_eoh = chart.get("eoh", False)

                for bar in bars:
                    ts = bar.get("timestamp")
                    if not ts:
                        continue

                    # For historical bars (before eoh), always add
                    # For live updates (after eoh), update last bar or add new
                    if not self.history_complete:
                        self.bars.append({
                            "timestamp": ts,
                            "open": bar.get("open"),
                            "high": bar.get("high"),
                            "low": bar.get("low"),
                            "close": bar.get("close"),
                            "volume": bar.get("upVolume", 0) + bar.get("downVolume", 0),
                        })
                        self._seen_timestamps.add(ts)

                if is_eoh:
                    self.history_complete = True
                    logger.info(
                        f"📈 End of history — received {len(self.bars)} bars"
                    )
                    # Close connection after getting all historical data
                    ws.close()
                    return


# ── Query Functions (for reading stored data) ──────────────


def get_stored_ticks(
    db: Session,
    symbol: str,
    start_time: datetime,
    end_time: datetime,
    limit: int = 100000,
) -> List[Dict]:
    """
    Query stored tick data from local database.
    """
    from models_market_data import TickData

    records = (
        db.query(TickData)
        .filter(
            TickData.symbol == symbol.upper(),
            TickData.timestamp >= start_time,
            TickData.timestamp <= end_time,
        )
        .order_by(TickData.timestamp.asc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": r.id,
            "symbol": r.symbol,
            "contract": r.contract,
            "timestamp": r.timestamp.isoformat(),
            "price": r.price,
            "bid": r.bid,
            "ask": r.ask,
            "volume": r.volume,
            "source": r.source.value if r.source else None,
        }
        for r in records
    ]


def get_stored_candles(
    db: Session,
    symbol: str,
    timeframe: str,
    start_time: datetime,
    end_time: datetime,
    limit: int = 10000,
) -> List[Dict]:
    """
    Query stored candle data from local database.
    """
    from models_market_data import CandleData, CandleTimeframe

    tf_enum = CandleTimeframe(timeframe)

    records = (
        db.query(CandleData)
        .filter(
            CandleData.symbol == symbol.upper(),
            CandleData.timeframe == tf_enum,
            CandleData.timestamp >= start_time,
            CandleData.timestamp <= end_time,
        )
        .order_by(CandleData.timestamp.asc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": r.id,
            "symbol": r.symbol,
            "contract": r.contract,
            "timeframe": r.timeframe.value,
            "timestamp": r.timestamp.isoformat(),
            "open": r.open,
            "high": r.high,
            "low": r.low,
            "close": r.close,
            "volume": r.volume,
            "tick_count": r.tick_count,
            "source": r.source.value if r.source else None,
        }
        for r in records
    ]


def get_data_summary(db: Session) -> Dict:
    """
    Get a summary of all stored market data.
    """
    from models_market_data import TickData, CandleData
    from sqlalchemy import func

    tick_summary = (
        db.query(
            TickData.symbol,
            func.count(TickData.id).label("count"),
            func.min(TickData.timestamp).label("earliest"),
            func.max(TickData.timestamp).label("latest"),
        )
        .group_by(TickData.symbol)
        .all()
    )

    candle_summary = (
        db.query(
            CandleData.symbol,
            CandleData.timeframe,
            func.count(CandleData.id).label("count"),
            func.min(CandleData.timestamp).label("earliest"),
            func.max(CandleData.timestamp).label("latest"),
        )
        .group_by(CandleData.symbol, CandleData.timeframe)
        .all()
    )

    return {
        "ticks": [
            {
                "symbol": t.symbol,
                "count": t.count,
                "earliest": t.earliest.isoformat() if t.earliest else None,
                "latest": t.latest.isoformat() if t.latest else None,
            }
            for t in tick_summary
        ],
        "candles": [
            {
                "symbol": c.symbol,
                "timeframe": c.timeframe.value if hasattr(c.timeframe, 'value') else c.timeframe,
                "count": c.count,
                "earliest": c.earliest.isoformat() if c.earliest else None,
                "latest": c.latest.isoformat() if c.latest else None,
            }
            for c in candle_summary
        ],
    }
