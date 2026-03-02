"""
Market Data Models — Tick-by-tick and Candlestick (OHLCV) storage.

These tables support:
  - Raw tick data storage for backtesting replay
  - Aggregated candlestick data at multiple timeframes (1min, 5min, 15min, 30min, 1hr, 4hr, daily)
  - Data collection job tracking for async fetch requests
"""
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    Index,
    Integer,
    String,
    Text,
    BigInteger,
)

from database import Base


class CandleTimeframe(str, enum.Enum):
    """Supported candlestick timeframes."""
    M1 = "1m"       # 1 minute
    M5 = "5m"       # 5 minutes
    M15 = "15m"     # 15 minutes
    M30 = "30m"     # 30 minutes
    H1 = "1h"       # 1 hour
    H4 = "4h"       # 4 hours
    D1 = "1d"       # Daily


class DataSource(str, enum.Enum):
    """Where the data originated."""
    TRADOVATE_WS = "TRADOVATE_WS"       # Tradovate WebSocket md/getChart
    SUPABASE = "SUPABASE"               # Pulled from existing Supabase tick tables
    REDIS_LIVE = "REDIS_LIVE"           # Captured from live Redis price stream
    CSV_IMPORT = "CSV_IMPORT"           # Imported from CSV/text files
    MANUAL = "MANUAL"                   # Manual entry


class CollectionJobStatus(str, enum.Enum):
    """Status of a data collection job."""
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TickData(Base):
    """
    Raw tick-by-tick market data.

    Each row = one price update from the market.
    Used for exact replay in backtesting.
    """
    __tablename__ = "tick_data"
    __table_args__ = (
        Index("ix_tick_symbol_ts", "symbol", "timestamp"),
        Index("ix_tick_ts", "timestamp"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False, index=True)      # e.g. "NQ", "ES", "MNQ"
    contract = Column(String, nullable=True)                   # e.g. "NQH6", "ESZ5"
    timestamp = Column(DateTime, nullable=False)               # Exact tick time (UTC)
    price = Column(Float, nullable=False)                      # Last trade price
    bid = Column(Float, nullable=True)                         # Best bid (if available)
    ask = Column(Float, nullable=True)                         # Best ask (if available)
    volume = Column(Integer, nullable=True)                    # Tick volume (if available)
    source = Column(Enum(DataSource), default=DataSource.SUPABASE)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class CandleData(Base):
    """
    Aggregated candlestick (OHLCV) data.

    Pre-computed from tick data or fetched directly from Tradovate.
    Supports multiple timeframes.
    """
    __tablename__ = "candle_data"
    __table_args__ = (
        Index("ix_candle_symbol_tf_ts", "symbol", "timeframe", "timestamp"),
        Index("ix_candle_ts", "timestamp"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False, index=True)
    contract = Column(String, nullable=True)
    timeframe = Column(Enum(CandleTimeframe), nullable=False)  # 1m, 5m, 30m, 1h, 4h, 1d
    timestamp = Column(DateTime, nullable=False)                # Candle open time (UTC)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Integer, nullable=True, default=0)
    tick_count = Column(Integer, nullable=True, default=0)      # Number of ticks in this candle
    source = Column(Enum(DataSource), default=DataSource.SUPABASE)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DataCollectionJob(Base):
    """
    Tracks data collection requests.

    When a user requests historical data for a time range,
    a job is created to track progress.
    """
    __tablename__ = "data_collection_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False)
    start_time = Column(DateTime, nullable=False)               # Requested start (UTC)
    end_time = Column(DateTime, nullable=False)                 # Requested end (UTC)
    data_type = Column(String, nullable=False, default="tick")  # "tick" or "candle"
    timeframe = Column(String, nullable=True)                   # For candle: "30m", "1h", "4h"
    source = Column(Enum(DataSource), default=DataSource.SUPABASE)
    status = Column(Enum(CollectionJobStatus), default=CollectionJobStatus.PENDING)
    total_records = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
