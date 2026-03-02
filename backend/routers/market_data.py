"""
Market Data API Router — Endpoints for data collection and backtesting.

Endpoints:
  POST   /market-data/collect/ticks           — Collect tick-by-tick data for a time range
  POST   /market-data/collect/candles          — Collect & build candles for a time range
  GET    /market-data/ticks                    — Query stored tick data
  GET    /market-data/candles                  — Query stored candle data
  GET    /market-data/summary                  — Get summary of all stored data
  GET    /market-data/jobs                     — List data collection jobs
  GET    /market-data/jobs/{job_id}            — Get job status
  POST   /market-data/build-candles            — Build candles from existing tick data
  POST   /market-data/collect/tradovate-chart  — Fetch candles directly from Tradovate WS
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market-data", tags=["market-data"])


# ── Pydantic Schemas ───────────────────────────────────────


class TickCollectionRequest(BaseModel):
    """Request to collect tick-by-tick data."""
    symbol: str = Field(..., description="Instrument symbol: NQ, ES, MNQ, MES, GC, MGC")
    start_time: datetime = Field(..., description="Start of range (UTC ISO format)")
    end_time: datetime = Field(..., description="End of range (UTC ISO format)")
    contract: Optional[str] = Field(None, description="Specific contract name e.g. NQH6")
    also_build_candles: Optional[List[str]] = Field(
        None,
        description="Also build candles at these timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "symbol": "NQ",
                    "start_time": "2025-02-26T14:00:00+00:00",
                    "end_time": "2025-02-26T18:00:00+00:00",
                    "also_build_candles": ["30m", "1h", "4h"],
                }
            ]
        }
    }


class CandleCollectionRequest(BaseModel):
    """Request to build candles from stored tick data."""
    symbol: str
    start_time: datetime
    end_time: datetime
    timeframes: List[str] = Field(
        default=["30m", "1h", "4h"],
        description="Timeframes to build: 1m, 5m, 15m, 30m, 1h, 4h, 1d"
    )


class TradovateChartRequest(BaseModel):
    """Request to fetch chart data directly from Tradovate WebSocket."""
    symbol: str = Field(..., description="Contract symbol e.g. NQH6, ESH6")
    timeframe_minutes: int = Field(60, description="Bar size in minutes: 1, 5, 15, 30, 60, 240")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    num_elements: int = Field(500, description="Number of bars if no time range")
    user_id: int = Field(..., description="User ID for Tradovate login credentials")


class TickResponse(BaseModel):
    id: int
    symbol: str
    contract: Optional[str] = None
    timestamp: str
    price: float
    bid: Optional[float] = None
    ask: Optional[float] = None
    volume: Optional[int] = None
    source: Optional[str] = None


class CandleResponse(BaseModel):
    id: int
    symbol: str
    contract: Optional[str] = None
    timeframe: str
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: Optional[int] = None
    tick_count: Optional[int] = None
    source: Optional[str] = None


class JobResponse(BaseModel):
    id: int
    symbol: str
    start_time: str
    end_time: str
    data_type: str
    timeframe: Optional[str] = None
    status: str
    total_records: int
    error_message: Optional[str] = None
    created_at: str


# ── Collection Endpoints ───────────────────────────────────


@router.post("/collect/ticks")
def collect_tick_data(
    payload: TickCollectionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    🚀 Collect tick-by-tick data from Supabase for a specific time range.

    This fetches ticks from the existing Supabase tick tables and stores them
    in our local database. Optionally builds candles at specified timeframes.

    Example: Get tick data for NQ on Feb 26, 2025 from 2pm to 6pm UTC:
    {
        "symbol": "NQ",
        "start_time": "2025-02-26T14:00:00+00:00",
        "end_time": "2025-02-26T18:00:00+00:00",
        "also_build_candles": ["30m", "1h", "4h"]
    }
    """
    from models_market_data import DataCollectionJob, CollectionJobStatus

    # Create a job record
    job = DataCollectionJob(
        symbol=payload.symbol.upper(),
        start_time=payload.start_time,
        end_time=payload.end_time,
        data_type="tick",
        timeframe=",".join(payload.also_build_candles) if payload.also_build_candles else None,
        status=CollectionJobStatus.PENDING,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Run collection in background
    def _run_collection(job_id: int):
        from database import SessionLocal
        bg_db = SessionLocal()
        try:
            from services.data_collector import collect_and_store_tick_data
            from models_market_data import DataCollectionJob, CollectionJobStatus

            # Update job status
            bg_job = bg_db.query(DataCollectionJob).filter(DataCollectionJob.id == job_id).first()
            bg_job.status = CollectionJobStatus.RUNNING
            bg_job.started_at = datetime.now(timezone.utc)
            bg_db.commit()

            # Run collection
            report = collect_and_store_tick_data(
                db=bg_db,
                symbol=payload.symbol,
                start_time=payload.start_time,
                end_time=payload.end_time,
                also_build_candles=payload.also_build_candles,
                contract=payload.contract,
            )

            # Update job
            bg_job.status = CollectionJobStatus.COMPLETED
            bg_job.total_records = report.get("ticks_stored", 0)
            bg_job.completed_at = datetime.now(timezone.utc)
            bg_db.commit()

            logger.info(f"✅ Collection job {job_id} completed: {report}")

        except Exception as e:
            logger.error(f"❌ Collection job {job_id} failed: {e}")
            bg_job = bg_db.query(DataCollectionJob).filter(DataCollectionJob.id == job_id).first()
            if bg_job:
                bg_job.status = CollectionJobStatus.FAILED
                bg_job.error_message = str(e)
                bg_job.completed_at = datetime.now(timezone.utc)
                bg_db.commit()
        finally:
            bg_db.close()

    background_tasks.add_task(_run_collection, job.id)

    return {
        "job_id": job.id,
        "status": "PENDING",
        "message": f"Data collection job started for {payload.symbol} "
                   f"({payload.start_time} → {payload.end_time})",
        "check_status_at": f"/api/market-data/jobs/{job.id}",
    }


@router.post("/collect/candles")
def collect_and_build_candles(
    payload: CandleCollectionRequest,
    db: Session = Depends(get_db),
):
    """
    Build candles from already-stored tick data in local DB.

    If tick data isn't stored yet, use /collect/ticks first.
    """
    from services.data_collector import get_stored_ticks, save_candles_to_db
    from services.candle_aggregator import aggregate_ticks_to_candles

    # Get stored ticks
    ticks = get_stored_ticks(db, payload.symbol, payload.start_time, payload.end_time)

    if not ticks:
        raise HTTPException(
            status_code=404,
            detail=f"No tick data found for {payload.symbol} in the given range. "
                   f"Use /api/market-data/collect/ticks to fetch data first."
        )

    results = {}
    for tf in payload.timeframes:
        try:
            candles = aggregate_ticks_to_candles(
                ticks, tf, symbol=payload.symbol,
            )
            count = save_candles_to_db(db, candles, payload.symbol, tf)
            results[tf] = {"candles_created": count, "status": "ok"}
        except ValueError as e:
            results[tf] = {"candles_created": 0, "status": f"error: {str(e)}"}

    return {
        "symbol": payload.symbol,
        "ticks_used": len(ticks),
        "candles": results,
    }


@router.post("/collect/tradovate-chart")
def collect_tradovate_chart(
    payload: TradovateChartRequest,
    db: Session = Depends(get_db),
):
    """
    🔌 Fetch candlestick data directly from Tradovate WebSocket (md/getChart).

    Requires valid Tradovate credentials in the system.
    This bypasses tick data and fetches pre-built OHLCV bars.
    """
    from required_api.tradovate_client import TradovateClient
    from models import BrokerCredential

    # Get credentials
    cred = (
        db.query(BrokerCredential)
        .filter(
            BrokerCredential.user_id == payload.user_id,
            BrokerCredential.broker.in_(["Tradovate", "Apex"]),
        )
        .first()
    )
    if not cred:
        raise HTTPException(
            status_code=400,
            detail="No valid Tradovate/Apex credentials found for this user"
        )

    # Login to get token
    client = TradovateClient()
    token, error = client.login(cred.login_id, cred.password)
    if not token:
        raise HTTPException(status_code=400, detail=f"Login failed: {error}")

    # Fetch chart data via WebSocket
    from services.data_collector import TradovateMarketDataClient, save_candles_to_db

    md_client = TradovateMarketDataClient(access_token=token, demo=True)
    bars = md_client.get_chart_data(
        symbol=payload.symbol,
        timeframe_minutes=payload.timeframe_minutes,
        start_time=payload.start_time,
        end_time=payload.end_time,
        num_elements=payload.num_elements,
    )

    if not bars:
        return {
            "symbol": payload.symbol,
            "bars_fetched": 0,
            "message": "No data returned from Tradovate WebSocket. "
                       "The contract may not be available or the time range is invalid."
        }

    # Map timeframe minutes to enum string
    tf_map = {1: "1m", 5: "5m", 15: "15m", 30: "30m", 60: "1h", 240: "4h", 1440: "1d"}
    tf_str = tf_map.get(payload.timeframe_minutes, "1h")

    # Save to DB
    count = save_candles_to_db(
        db, bars, payload.symbol, tf_str,
        source="TRADOVATE_WS", contract=payload.symbol,
    )

    return {
        "symbol": payload.symbol,
        "timeframe": tf_str,
        "bars_fetched": len(bars),
        "bars_stored": count,
    }


# ── Query Endpoints ────────────────────────────────────────


@router.get("/ticks")
def query_ticks(
    symbol: str = Query(..., description="Instrument symbol"),
    start_time: datetime = Query(..., description="Start time (UTC)"),
    end_time: datetime = Query(..., description="End time (UTC)"),
    limit: int = Query(10000, description="Max records to return"),
    db: Session = Depends(get_db),
):
    """
    📊 Query stored tick-by-tick data.

    Returns tick data from the local database for a given symbol and time range.
    """
    from services.data_collector import get_stored_ticks

    ticks = get_stored_ticks(db, symbol, start_time, end_time, limit)
    return {
        "symbol": symbol,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "count": len(ticks),
        "ticks": ticks,
    }


@router.get("/candles")
def query_candles(
    symbol: str = Query(..., description="Instrument symbol"),
    timeframe: str = Query(..., description="Candle timeframe: 1m, 5m, 15m, 30m, 1h, 4h, 1d"),
    start_time: datetime = Query(..., description="Start time (UTC)"),
    end_time: datetime = Query(..., description="End time (UTC)"),
    limit: int = Query(5000, description="Max records to return"),
    db: Session = Depends(get_db),
):
    """
    📊 Query stored candlestick (OHLCV) data.

    Example: Get 1-hour candles for NQ on March 17:
    /api/market-data/candles?symbol=NQ&timeframe=1h&start_time=2025-03-17T14:00:00Z&end_time=2025-03-17T18:00:00Z
    """
    from services.data_collector import get_stored_candles

    candles = get_stored_candles(db, symbol, timeframe, start_time, end_time, limit)
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "count": len(candles),
        "candles": candles,
    }


@router.get("/summary")
def data_summary(db: Session = Depends(get_db)):
    """
    📈 Get a summary of all stored market data.

    Returns counts and date ranges for each symbol's tick and candle data.
    """
    from services.data_collector import get_data_summary
    return get_data_summary(db)


# ── Job Tracking Endpoints ─────────────────────────────────


@router.get("/jobs")
def list_jobs(
    status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List data collection jobs, optionally filtered by status."""
    from models_market_data import DataCollectionJob

    query = db.query(DataCollectionJob)
    if status:
        query = query.filter(DataCollectionJob.status == status)

    jobs = query.order_by(DataCollectionJob.created_at.desc()).limit(limit).all()

    return [
        {
            "id": j.id,
            "symbol": j.symbol,
            "start_time": j.start_time.isoformat(),
            "end_time": j.end_time.isoformat(),
            "data_type": j.data_type,
            "timeframe": j.timeframe,
            "status": j.status.value if hasattr(j.status, 'value') else j.status,
            "total_records": j.total_records,
            "error_message": j.error_message,
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        }
        for j in jobs
    ]


@router.get("/jobs/{job_id}")
def get_job_status(job_id: int, db: Session = Depends(get_db)):
    """Get status of a specific data collection job."""
    from models_market_data import DataCollectionJob

    job = db.query(DataCollectionJob).filter(DataCollectionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "id": job.id,
        "symbol": job.symbol,
        "start_time": job.start_time.isoformat(),
        "end_time": job.end_time.isoformat(),
        "data_type": job.data_type,
        "timeframe": job.timeframe,
        "status": job.status.value if hasattr(job.status, 'value') else job.status,
        "total_records": job.total_records,
        "error_message": job.error_message,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


# ── Utility Endpoints ─────────────────────────────────────


@router.get("/available-symbols")
def available_symbols():
    """List symbols that have Supabase tick data tables available."""
    from services.data_collector import SUPABASE_TICK_TABLES
    return {
        "symbols": list(SUPABASE_TICK_TABLES.keys()),
        "table_mapping": SUPABASE_TICK_TABLES,
    }


@router.get("/supported-timeframes")
def supported_timeframes():
    """List supported candlestick timeframes."""
    from services.candle_aggregator import TIMEFRAME_MINUTES
    return {
        "timeframes": list(TIMEFRAME_MINUTES.keys()),
        "details": {k: f"{v} minutes" for k, v in TIMEFRAME_MINUTES.items()},
    }
