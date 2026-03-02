"""
Candlestick Aggregator — Build OHLCV candles from raw tick data.

Supports timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d
Can aggregate from:
  - In-memory tick data lists
  - Database TickData records
  - Supabase tick data
"""
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


# Timeframe -> minutes mapping
TIMEFRAME_MINUTES = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}


def _floor_timestamp(ts: datetime, minutes: int) -> datetime:
    """
    Floor a timestamp to the nearest interval boundary.

    E.g. 14:37 with 30-min interval → 14:30
         14:37 with 1-hour interval → 14:00
         14:37 with 4-hour interval → 12:00 (aligned to 00:00 UTC)
    """
    if minutes >= 1440:
        # Daily: floor to start of day
        return ts.replace(hour=0, minute=0, second=0, microsecond=0)

    # Calculate minutes since midnight
    minutes_since_midnight = ts.hour * 60 + ts.minute
    floored_minutes = (minutes_since_midnight // minutes) * minutes

    return ts.replace(
        hour=floored_minutes // 60,
        minute=floored_minutes % 60,
        second=0,
        microsecond=0,
    )


def aggregate_ticks_to_candles(
    ticks: List[Dict],
    timeframe: str,
    symbol: str = "",
    timestamp_key: str = "timestamp",
    price_key: str = "price",
    volume_key: str = "volume",
) -> List[Dict]:
    """
    Aggregate a list of tick data dicts into OHLCV candles.

    Args:
        ticks: List of dicts with at least {timestamp, price} fields.
               timestamp can be a datetime object or ISO string.
        timeframe: One of "1m", "5m", "15m", "30m", "1h", "4h", "1d"
        symbol: Instrument symbol for tagging output
        timestamp_key: Key name for timestamp in tick dicts
        price_key: Key name for price in tick dicts
        volume_key: Key name for volume in tick dicts (optional)

    Returns:
        List of candle dicts: [{timestamp, open, high, low, close, volume, tick_count}, ...]
        Sorted by timestamp ascending.
    """
    if timeframe not in TIMEFRAME_MINUTES:
        raise ValueError(
            f"Unsupported timeframe: {timeframe}. "
            f"Supported: {list(TIMEFRAME_MINUTES.keys())}"
        )

    if not ticks:
        return []

    interval_minutes = TIMEFRAME_MINUTES[timeframe]
    candle_buckets: Dict[datetime, Dict] = {}

    for tick in ticks:
        # Parse timestamp
        ts = tick.get(timestamp_key)
        if ts is None:
            continue

        if isinstance(ts, str):
            # Handle various timestamp formats
            try:
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                try:
                    ts = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S.%f")
                except ValueError:
                    ts = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")

        # Get price
        price = tick.get(price_key)
        if price is None:
            # Try 'last' key (Supabase format)
            price = tick.get("last") or tick.get("LAST")
        if price is None:
            continue

        price = float(price)
        vol = tick.get(volume_key, 0) or 0

        # Floor timestamp to candle boundary
        candle_ts = _floor_timestamp(ts, interval_minutes)

        if candle_ts not in candle_buckets:
            candle_buckets[candle_ts] = {
                "timestamp": candle_ts,
                "symbol": symbol,
                "timeframe": timeframe,
                "open": price,
                "high": price,
                "low": price,
                "close": price,
                "volume": int(vol),
                "tick_count": 1,
            }
        else:
            bucket = candle_buckets[candle_ts]
            bucket["high"] = max(bucket["high"], price)
            bucket["low"] = min(bucket["low"], price)
            bucket["close"] = price  # Last price in the interval
            bucket["volume"] += int(vol)
            bucket["tick_count"] += 1

    # Sort by timestamp
    candles = sorted(candle_buckets.values(), key=lambda c: c["timestamp"])

    logger.info(
        f"Aggregated {len(ticks)} ticks → {len(candles)} candles "
        f"({timeframe}) for {symbol}"
    )
    return candles


def aggregate_supabase_ticks_to_candles(
    ticks_generator,
    timeframe: str,
    symbol: str = "",
) -> List[Dict]:
    """
    Aggregate Supabase tick data (generator from stream_ticks_keyset) into candles.

    Supabase tick format: {id, ts, last, bid, ask, volume, ...}
    """
    ticks_list = []
    for tick in ticks_generator:
        ticks_list.append({
            "timestamp": tick.get("ts"),
            "price": tick.get("last"),
            "volume": tick.get("volume", 0),
        })

    return aggregate_ticks_to_candles(
        ticks_list,
        timeframe,
        symbol=symbol,
        timestamp_key="timestamp",
        price_key="price",
    )


def split_time_range_into_chunks(
    start_time: datetime,
    end_time: datetime,
    chunk_hours: int = 4,
) -> List[Tuple[datetime, datetime]]:
    """
    Split a large time range into smaller chunks for paginated data collection.

    Args:
        start_time: Range start (UTC)
        end_time: Range end (UTC)
        chunk_hours: Hours per chunk (default 4)

    Returns:
        List of (chunk_start, chunk_end) tuples
    """
    chunks = []
    current = start_time
    delta = timedelta(hours=chunk_hours)

    while current < end_time:
        chunk_end = min(current + delta, end_time)
        chunks.append((current, chunk_end))
        current = chunk_end

    return chunks
