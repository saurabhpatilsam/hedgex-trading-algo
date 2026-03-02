"""
StrategyRunner — Background autonomous execution loop.

Runs as an asyncio background task inside the FastAPI lifespan.
Every TICK_INTERVAL seconds, it:
  1. Queries all ActiveStrategy rows with status=RUNNING
  2. Instantiates the correct strategy class from the registry
  3. Calls on_tick() with latest market data
  4. Commits any DB changes
  5. Logs results

This is the "heartbeat" that makes the system fully automated.
"""

import asyncio
import logging
import traceback
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from database import SessionLocal

logger = logging.getLogger(__name__)

# How often to tick (seconds)
TICK_INTERVAL = 5

_runner_task: asyncio.Task = None
_runner_running = False


async def start_runner():
    """Start the background strategy runner loop."""
    global _runner_task, _runner_running
    if _runner_running:
        logger.warning("Runner already running")
        return
    _runner_running = True
    _runner_task = asyncio.create_task(_run_loop())
    logger.info(f"🚀 Strategy Runner started (interval={TICK_INTERVAL}s)")


async def stop_runner():
    """Stop the background runner."""
    global _runner_task, _runner_running
    _runner_running = False
    if _runner_task:
        _runner_task.cancel()
        try:
            await _runner_task
        except asyncio.CancelledError:
            pass
    logger.info("Strategy Runner stopped")


async def _run_loop():
    """Main loop — ticks every TICK_INTERVAL seconds."""
    while _runner_running:
        try:
            await asyncio.sleep(TICK_INTERVAL)
            _tick()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Runner tick error: {e}\n{traceback.format_exc()}")
            await asyncio.sleep(TICK_INTERVAL)


def _tick():
    """Execute one tick cycle for all RUNNING strategies."""
    from models import ActiveStrategy
    from engine.registry import StrategyRegistry

    db: Session = SessionLocal()
    try:
        running_strategies = (
            db.query(ActiveStrategy)
            .filter(ActiveStrategy.status == "RUNNING")
            .all()
        )

        if not running_strategies:
            return

        for strat_row in running_strategies:
            try:
                # Don't tick hedging strategies — they are one-shot
                if strat_row.strategy_type == "HEDGING":
                    continue

                cls = StrategyRegistry.get(strat_row.strategy_type)
                config = strat_row.get_parameters()
                instance = cls(
                    db=db,
                    strategy_id=strat_row.id,
                    config=config,
                    paper_mode=strat_row.paper_mode,
                )

                # Pass empty market data for now (will integrate websocket later)
                market_data = {"timestamp": datetime.now(timezone.utc).isoformat()}
                actions = instance.on_tick(market_data)

                if actions:
                    logger.info(f"Strategy {strat_row.id} ({strat_row.strategy_type}) tick: {len(actions)} actions")

                db.commit()

            except Exception as e:
                logger.error(
                    f"Error ticking strategy {strat_row.id} ({strat_row.strategy_type}): {e}\n"
                    f"{traceback.format_exc()}"
                )
                db.rollback()

    except Exception as e:
        logger.error(f"Runner tick fatal: {e}")
    finally:
        db.close()


def get_runner_status() -> dict:
    """Return the current runner status."""
    return {
        "running": _runner_running,
        "tick_interval": TICK_INTERVAL,
    }
