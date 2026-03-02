from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from engine import HedgingEngine
from models import GroupOrder, Instrument, OrderDirection, StrategyStatus, Trade
from schemas import GroupOrderCreate, GroupOrderResponse, GroupOrderUpdate, TradeResponse

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


@router.post("/start", response_model=GroupOrderResponse)
def start_group_strategy(payload: GroupOrderCreate, db: Session = Depends(get_db)):
    """Start a strategy for a specific group with instrument and PT/SL config."""
    validation = HedgingEngine.validate_group(db, payload.group_id)
    if not validation["valid"]:
        raise HTTPException(
            status_code=400,
            detail={"message": "Group validation failed", "errors": validation["errors"]},
        )

    instrument = db.query(Instrument).filter(Instrument.id == payload.instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    if not instrument.is_active:
        raise HTTPException(status_code=400, detail="Instrument is not active")

    order = HedgingEngine.start_group_order(db, payload.model_dump())

    # Auto-execute: place real orders immediately on start
    try:
        trades = HedgingEngine.execute_group_order(db, order.id)
        order._auto_executed_trades = trades  # attach for logging
    except Exception as e:
        # Don't fail the start if execution fails, just log
        import logging
        logging.getLogger(__name__).error(f"Auto-execute failed for order {order.id}: {e}")

    return order


@router.post("/stop/{order_id}", response_model=GroupOrderResponse)
def stop_group_strategy(order_id: int, db: Session = Depends(get_db)):
    """Stop a running or paused strategy."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    if order.status not in (StrategyStatus.RUNNING, StrategyStatus.PAUSED):
        raise HTTPException(status_code=400, detail="Strategy is not running or paused")

    order.status = StrategyStatus.STOPPED
    order.stopped_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return order


@router.post("/pause/{order_id}", response_model=GroupOrderResponse)
def pause_group_strategy(order_id: int, db: Session = Depends(get_db)):
    """Pause a running strategy (can be resumed later)."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    if order.status != StrategyStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Only running strategies can be paused")

    order.status = StrategyStatus.PAUSED
    db.commit()
    db.refresh(order)
    return order


@router.post("/resume/{order_id}", response_model=GroupOrderResponse)
def resume_group_strategy(order_id: int, db: Session = Depends(get_db)):
    """Resume a paused or stopped strategy."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    if order.status not in (StrategyStatus.PAUSED, StrategyStatus.STOPPED):
        raise HTTPException(status_code=400, detail="Only paused or stopped strategies can be resumed")

    order.status = StrategyStatus.RUNNING
    order.stopped_at = None
    if not order.started_at:
        order.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return order


@router.post("/disable/{order_id}", response_model=GroupOrderResponse)
def disable_group_strategy(order_id: int, db: Session = Depends(get_db)):
    """Disable a strategy. Can be re-enabled by resuming."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")

    order.status = StrategyStatus.DISABLED
    order.stopped_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return order


@router.post("/enable/{order_id}", response_model=GroupOrderResponse)
def enable_group_strategy(order_id: int, db: Session = Depends(get_db)):
    """Re-enable a disabled strategy back to RUNNING."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    if order.status != StrategyStatus.DISABLED:
        raise HTTPException(status_code=400, detail="Only disabled strategies can be enabled")

    order.status = StrategyStatus.RUNNING
    order.stopped_at = None
    db.commit()
    db.refresh(order)
    return order


@router.put("/orders/{order_id}", response_model=GroupOrderResponse)
def edit_group_order(order_id: int, payload: GroupOrderUpdate, db: Session = Depends(get_db)):
    """Edit a strategy's parameters (can edit while paused or stopped)."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "direction" in update_data:
        update_data["direction"] = OrderDirection(update_data["direction"])
    for key, value in update_data.items():
        setattr(order, key, value)
    db.commit()
    db.refresh(order)
    return order


@router.post("/execute/{order_id}")
def execute_group_hedge(order_id: int, db: Session = Depends(get_db)):
    """Execute one hedge cycle for a running group strategy."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    if order.status != StrategyStatus.RUNNING:
        raise HTTPException(
            status_code=400,
            detail="Strategy must be running to execute trades.",
        )

    trades = HedgingEngine.execute_group_order(db, order_id)
    return {"message": f"Executed {len(trades)} trades", "trades": trades}


@router.get("/orders", response_model=list[GroupOrderResponse])
def list_group_orders(db: Session = Depends(get_db)):
    return db.query(GroupOrder).order_by(GroupOrder.created_at.desc()).all()


@router.get("/orders/{order_id}", response_model=GroupOrderResponse)
def get_group_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    return order


@router.get("/trades", response_model=list[TradeResponse])
def list_trades(limit: int = 50, group_order_id: int = None, db: Session = Depends(get_db)):
    query = db.query(Trade)
    if group_order_id:
        query = query.filter(Trade.group_order_id == group_order_id)
    return query.order_by(Trade.timestamp.desc()).limit(limit).all()
