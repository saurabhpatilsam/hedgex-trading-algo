from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from engine import HedgingEngine
from models import GroupOrder, Instrument, OrderDirection, StrategyStatus, Trade
from schemas import GroupOrderCreate, GroupOrderResponse, GroupOrderUpdate, TradeResponse

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


@router.post("/add", response_model=GroupOrderResponse)
@router.post("/start", response_model=GroupOrderResponse)  # backward compat
def add_group_strategy(payload: GroupOrderCreate, db: Session = Depends(get_db)):
    """Add a strategy for a specific group (IDLE status, no orders placed yet)."""
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
    """Execute one hedge cycle for an IDLE or RUNNING group strategy."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    if order.status not in (StrategyStatus.RUNNING, StrategyStatus.IDLE):
        raise HTTPException(
            status_code=400,
            detail="Strategy must be IDLE or RUNNING to execute trades.",
        )

    # Transition IDLE → RUNNING on first execute
    if order.status == StrategyStatus.IDLE:
        order.status = StrategyStatus.RUNNING
        order.started_at = datetime.now(timezone.utc)
        db.commit()

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


@router.delete("/orders/{order_id}", status_code=204)
def delete_group_order(order_id: int, db: Session = Depends(get_db)):
    """Delete an IDLE strategy that hasn't been executed yet."""
    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")
    if order.status not in (StrategyStatus.IDLE, StrategyStatus.STOPPED, StrategyStatus.DISABLED):
        raise HTTPException(status_code=400, detail="Only IDLE, STOPPED, or DISABLED strategies can be deleted")
    # Delete associated trades first
    db.query(Trade).filter(Trade.group_order_id == order_id).delete()
    db.delete(order)
    db.commit()


@router.post("/orders/{order_id}/flatten")
def flatten_strategy(order_id: int, db: Session = Depends(get_db)):
    """Flatten all positions for all accounts in this strategy's group."""
    from sqlalchemy.orm import joinedload
    from models import Group, GroupMembership, Account, User, BrokerCredential
    from required_api.tradovate_client import get_proxied_client

    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")

    group = db.query(Group).filter(Group.id == order.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    memberships = (
        db.query(GroupMembership)
        .options(
            joinedload(GroupMembership.account)
            .joinedload(Account.credential)
        )
        .join(Account)
        .filter(
            GroupMembership.group_id == order.group_id,
            Account.is_active == True,
        )
        .all()
    )

    results = []
    client_cache = {}

    for m in memberships:
        account = m.account
        if not account or not account.tradovate_account_id:
            results.append({"account": account.name if account else "Unknown", "success": False, "error": "Missing tradovate_account_id"})
            continue

        cred = account.credential
        if not cred:
            results.append({"account": account.name, "success": False, "error": "No credential"})
            continue

        cred_id = cred.id
        if cred_id not in client_cache:
            user = db.query(User).filter(User.id == cred.user_id).first()
            client = get_proxied_client(user=user)
            token, err = client.login(cred.login_id, cred.password)
            if not token:
                results.append({"account": account.name, "success": False, "error": f"Login failed: {err}"})
                continue
            client_cache[cred_id] = client

        client = client_cache[cred_id]
        try:
            report = client.flatten_account(
                account_id=account.tradovate_account_id,
                account_spec=account.name,
            )
            results.append({"account": account.name, "success": True, "report": report})
        except Exception as e:
            results.append({"account": account.name, "success": False, "error": str(e)})

    # Stop the strategy
    order.status = StrategyStatus.STOPPED
    order.stopped_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": f"Flattened {len(results)} accounts", "results": results}


@router.get("/orders/{order_id}/positions")
def get_strategy_positions(order_id: int, db: Session = Depends(get_db)):
    """Get live positions from Tradovate for all accounts in this strategy's group."""
    from sqlalchemy.orm import joinedload
    from models import Group, GroupMembership, Account, User, BrokerCredential
    from required_api.tradovate_client import get_proxied_client

    order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="GroupOrder not found")

    group = db.query(Group).filter(Group.id == order.group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    memberships = (
        db.query(GroupMembership)
        .options(
            joinedload(GroupMembership.account)
            .joinedload(Account.credential)
        )
        .join(Account)
        .filter(
            GroupMembership.group_id == order.group_id,
            Account.is_active == True,
        )
        .all()
    )

    positions = []
    client_cache = {}

    for m in memberships:
        account = m.account
        if not account or not account.tradovate_account_id:
            continue

        cred = account.credential
        if not cred:
            continue

        cred_id = cred.id
        if cred_id not in client_cache:
            user = db.query(User).filter(User.id == cred.user_id).first()
            client = get_proxied_client(user=user)
            token, err = client.login(cred.login_id, cred.password)
            if not token:
                positions.append({"account_name": account.name, "pod": m.pot, "error": f"Login failed: {err}", "positions": []})
                continue
            client_cache[cred_id] = client

        client = client_cache[cred_id]
        try:
            acct_positions = client.get_positions(account.tradovate_account_id)
            # Also get account balance for P&L context
            state = client.get_account_balance(account.tradovate_account_id)
            balance = float(state.get("balance") or state.get("cashBalance") or 0)
            realized_pnl = float(state.get("realizedPnl") or 0)
            unrealized_pnl = float(state.get("openPnl") or state.get("unrealizedPnl") or 0)

            pos_list = []
            for p in acct_positions:
                net_pos = p.get("netPos", 0)
                if net_pos == 0:
                    continue
                pos_list.append({
                    "contract": p.get("contractId"),
                    "net_position": net_pos,
                    "average_price": float(p.get("netPrice") or p.get("avgPrice") or 0),
                    "unrealized_pnl": float(p.get("openPnl") or 0),
                })

            positions.append({
                "account_name": account.name,
                "account_id": account.id,
                "pod": m.pot,
                "balance": balance,
                "realized_pnl": realized_pnl,
                "unrealized_pnl": unrealized_pnl,
                "positions": pos_list,
            })
        except Exception as e:
            positions.append({"account_name": account.name, "pod": m.pot, "error": str(e), "positions": []})

    return {"order_id": order_id, "positions": positions}
