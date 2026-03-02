import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import accounts, groups, instruments, strategy, users, trading, market_data
import models_market_data  # Ensure market data tables are registered with Base

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (including new ones)
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    # Auto-discover strategy types
    from engine.registry import auto_discover
    auto_discover()

    # Start the background strategy runner
    from engine.runner import start_runner, stop_runner
    await start_runner()
    logger.info("🚀 Trading system initialized")

    yield

    # Shutdown
    await stop_runner()
    logger.info("Trading system shutdown complete")


app = FastAPI(
    title="Automated Trading System",
    description="Production-grade multi-strategy trading platform with order management, "
                "position tracking, risk controls, and kill switch.",
    version="3.0.0",
    lifespan=lifespan,
)

# Allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(users.router)
app.include_router(accounts.router)
app.include_router(groups.router)
app.include_router(instruments.router)
app.include_router(strategy.router)      # Legacy strategy endpoints
app.include_router(trading.router)        # New trading system endpoints
app.include_router(market_data.router)    # Market data collection & backtesting


@app.get("/")
def root():
    return {
        "message": "Automated Trading System API",
        "version": "3.1.0",
        "docs": "/docs",
        "trading_api": "/api/trading",
        "market_data_api": "/api/market-data",
    }
