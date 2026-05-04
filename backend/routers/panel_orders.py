"""
Trading Panel Router — Manual order placement across groups.

Endpoints:
  POST /api/panel/order     — Place order across all accounts in a group
  GET  /api/panel/orders    — List recent panel-placed orders
  POST /api/panel/cancel    — Cancel a broker order
"""

import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Account,
    AuditLog,
    Group,
    GroupMembership,
    Instrument,
    OrderRecord,
    SystemAlert,
    User,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/panel", tags=["trading-panel"])


# ── Pydantic Schemas ───────────────────────────────────────


class PanelOrderRequest(BaseModel):
    group_id: Optional[int] = None      # Trade all accounts in group
    account_ids: Optional[List[int]] = None # Trade specific accounts
    instrument_symbol: str  # e.g. "NQ" — maps to contract_month for Tradovate
    action: str             # "Buy" or "Sell"
    quantity: int = 1
    order_type: str = "Market"  # Market, Limit, Stop, StopLimit
    price: Optional[float] = None       # Limit price
    stop_price: Optional[float] = None  # Stop trigger price
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    duration_type: str = "Day"


class CancelOrderRequest(BaseModel):
    broker_order_id: str
    account_id: int


class PanelOrderResult(BaseModel):
    account_id: int
    account_name: str
    success: bool
    broker_order_id: Optional[str] = None
    error: Optional[str] = None


# ── Place Order (fan-out to all group accounts) ───────────


@router.post("/order")
def place_panel_order(
    payload: PanelOrderRequest,
    db: Session = Depends(get_db),
):
    """
    Place an order across ALL accounts in a group.

    Flow:
      1. Resolve group → memberships → accounts
      2. Resolve instrument symbol → contract_month (Tradovate symbol)
      3. For each account: place TV Bridge order using Redis token and quote
      4. Record results in OrderRecord table
      5. Return aggregated report
    """
    from services.tv_bridge_service import RedisQuoteMissing, TVBridgeValidationError, place_order_for_accounts
    from engine.alerting import create_alert

    # ── Validate: exactly one of group_id or account_ids ──
    if payload.group_id and payload.account_ids:
        raise HTTPException(
            status_code=400,
            detail="Specify either group_id or account_ids, not both.",
        )
    if not payload.group_id and not payload.account_ids:
        raise HTTPException(
            status_code=400,
            detail="Either group_id or account_ids is required.",
        )

    # ── Resolve accounts to trade ────────────────────────
    group = None
    target_accounts = []  # list of Account ORM objects (with .credential loaded)

    if payload.group_id:
        # Group mode: fan-out to all members
        group = (
            db.query(Group)
            .options(
                joinedload(Group.memberships)
                .joinedload(GroupMembership.account)
                .joinedload(Account.credential)
            )
            .filter(Group.id == payload.group_id)
            .first()
        )
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        if not group.memberships:
            raise HTTPException(
                status_code=400,
                detail="Group has no accounts. Add accounts to the group first.",
            )
        target_accounts = [
            m.account for m in group.memberships if m.account and m.account.is_active
        ]
    else:
        # Multi-account mode
        accounts = (
            db.query(Account)
            .options(joinedload(Account.credential))
            .filter(Account.id.in_(payload.account_ids))
            .all()
        )
        if not accounts:
            raise HTTPException(status_code=404, detail="No accounts found")
        target_accounts = [acc for acc in accounts if acc.is_active]
        if not target_accounts:
            raise HTTPException(status_code=400, detail="No active accounts found in selection")

    # ── Resolve instrument ───────────────────────────────
    instrument = (
        db.query(Instrument)
        .filter(Instrument.symbol == payload.instrument_symbol)
        .first()
    )
    if not instrument:
        raise HTTPException(
            status_code=404,
            detail=f"Instrument '{payload.instrument_symbol}' not found",
        )

    # Use contract_month for Tradovate (e.g. "NQH6") or fall back to symbol
    tradovate_symbol = instrument.contract_month or instrument.symbol

    # ── Validate order type & price ──────────────────────
    if payload.order_type in ("Limit", "StopLimit") and payload.price is None:
        raise HTTPException(
            status_code=400, detail="Price required for Limit/StopLimit orders"
        )
    if payload.order_type in ("Stop", "StopLimit") and payload.stop_price is None:
        raise HTTPException(
            status_code=400, detail="Stop price required for Stop/StopLimit orders"
        )
    if payload.action not in ("Buy", "Sell"):
        raise HTTPException(
            status_code=400, detail="Action must be 'Buy' or 'Sell'"
        )
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    try:
        bridge_report = place_order_for_accounts(
            db,
            accounts=target_accounts,
            instrument=instrument,
            side=payload.action,
            qty=payload.quantity,
            order_type=payload.order_type,
            limit_price=payload.price,
            stop_price=payload.stop_price,
            stop_loss=payload.stop_loss,
            take_profit=payload.take_profit,
            duration_type=payload.duration_type,
        )
    except RedisQuoteMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except TVBridgeValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    results: List[dict] = bridge_report["results"]
    success_count = bridge_report["success_count"]
    fail_count = bridge_report["fail_count"]

    order_records_by_account = {}
    for result in results:
        if not result.get("success"):
            continue
        order_record = OrderRecord(
            strategy_id=None,
            account_id=result["account_id"],
            instrument_id=instrument.id,
            side=payload.action,
            quantity=payload.quantity,
            filled_quantity=0,
            order_type=payload.order_type,
            price=payload.price,
            state=(result.get("result", {}).get("status") or "ACCEPTED").upper(),
            broker_order_id=result.get("broker_order_id"),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(order_record)
        order_records_by_account[result["account_id"]] = order_record

    db.flush()
    for result in results:
        order_record = order_records_by_account.get(result.get("account_id"))
        if order_record:
            result["order_record_id"] = order_record.id

    # Create audit log
    group_name = group.name if group else f"Accounts {payload.account_ids}"
    audit = AuditLog(
        strategy_id=None,
        event_type="PANEL_ORDER",
        details_json=json.dumps({
            "group_id": payload.group_id,
            "account_ids": payload.account_ids,
            "group_name": group_name,
            "instrument": payload.instrument_symbol,
            "contract": tradovate_symbol,
            "action": payload.action,
            "quantity": payload.quantity,
            "order_type": payload.order_type,
            "price": payload.price,
            "stop_price": payload.stop_price,
            "stop_loss": payload.stop_loss,
            "take_profit": payload.take_profit,
            "duration_type": payload.duration_type,
            "success_count": success_count,
            "fail_count": fail_count,
        }),
        timestamp=datetime.now(timezone.utc),
    )
    db.add(audit)

    # Create alert
    price_str = f"@ ${payload.price}" if payload.price else "@ MKT"
    create_alert(
        db,
        alert_type="TRADING",
        title=f"Panel: {payload.action} {payload.quantity}x {tradovate_symbol} {price_str}",
        message=(
            f"Target: {group_name} | "
            f"Type: {payload.order_type} | "
            f"Success: {success_count}/{success_count + fail_count}"
        ),
        severity="INFO" if fail_count == 0 else "WARNING",
    )
    db.commit()

    return {
        "order_id": audit.id,
        "group_name": group_name,
        "instrument": tradovate_symbol,
        "action": payload.action,
        "quantity": payload.quantity,
        "order_type": payload.order_type,
        "price": payload.price,
        "stop_loss": payload.stop_loss,
        "take_profit": payload.take_profit,
        "duration_type": payload.duration_type,
        "success_count": success_count,
        "fail_count": fail_count,
        "total_accounts": success_count + fail_count,
        "results": results,
    }


# ── Recent Panel Orders ──────────────────────────────────


@router.get("/orders")
def list_panel_orders(
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """List recent orders placed via the trading panel (strategy_id is NULL)."""
    orders = (
        db.query(OrderRecord)
        .filter(OrderRecord.strategy_id.is_(None))
        .order_by(OrderRecord.created_at.desc())
        .limit(limit)
        .all()
    )

    # Enrich with account names and instrument symbols
    result = []
    for o in orders:
        account = db.query(Account).filter(Account.id == o.account_id).first()
        instrument = db.query(Instrument).filter(Instrument.id == o.instrument_id).first()
        result.append({
            "id": o.id,
            "account_id": o.account_id,
            "account_name": account.name if account else "Unknown",
            "instrument_id": o.instrument_id,
            "instrument_symbol": instrument.symbol if instrument else "Unknown",
            "contract": instrument.contract_month if instrument else "",
            "side": o.side,
            "quantity": o.quantity,
            "filled_quantity": o.filled_quantity,
            "order_type": o.order_type,
            "price": o.price,
            "fill_price": o.fill_price,
            "state": o.state,
            "broker_order_id": o.broker_order_id,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        })

    return {"orders": result, "count": len(result)}


# ── Cancel Order ─────────────────────────────────────────


@router.post("/cancel")
def cancel_panel_order(
    payload: CancelOrderRequest,
    db: Session = Depends(get_db),
):
    """Cancel a specific broker order."""
    from services.tv_bridge_service import cancel_order

    account = (
        db.query(Account)
        .filter(Account.id == payload.account_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        result = cancel_order(db, account, payload.broker_order_id)

        # Update local record
        local_order = (
            db.query(OrderRecord)
            .filter(OrderRecord.broker_order_id == str(payload.broker_order_id))
            .first()
        )
        if local_order:
            local_order.state = "CANCELLED"
            local_order.updated_at = datetime.now(timezone.utc)
            local_order.closed_at = datetime.now(timezone.utc)
            db.commit()

        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cancel failed: {str(e)}")


# ── Open Positions ───────────────────────────────────────


class FlattenRequest(BaseModel):
    account_id: int
    symbol: Optional[str] = None  # Optional: flatten specific symbol, or all if empty


@router.get("/positions")
def list_open_positions(db: Session = Depends(get_db)):
    """
    Fetch open positions from TV Bridge for all active accounts.
    Returns aggregated position data across accounts.
    """
    from services.tv_bridge_service import list_positions_for_accounts

    accounts = (
        db.query(Account)
        .filter(Account.is_active == True)
        .all()
    )

    all_positions = []
    for pos in list_positions_for_accounts(db, accounts):
        qty = abs(pos.get("qty") or 0)
        if qty == 0:
            continue
        side = str(pos.get("side") or "").lower()
        all_positions.append({
            **pos,
            "account_id": pos.get("_local_account_id"),
            "account_name": pos.get("_account_name"),
            "broker_account_id": pos.get("_account_id"),
            "contract_id": pos.get("id"),
            "net_pos": qty if side in ("buy", "long") else -qty,
            "net_price": pos.get("avgPrice"),
            "side": "Long" if side in ("buy", "long") else "Short",
            "quantity": qty,
            "timestamp": pos.get("lastModified"),
        })

    return {"positions": all_positions, "count": len(all_positions)}


# ── Flatten (Close) Position ─────────────────────────────


@router.post("/flatten")
def flatten_position(
    payload: FlattenRequest,
    db: Session = Depends(get_db),
):
    """Flatten (close all positions and cancel orders) for a specific account."""
    from services.tv_bridge_service import flatten_account

    account = (
        db.query(Account)
        .filter(Account.id == payload.account_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        report = flatten_account(db, account, symbol=payload.symbol)

        # Create audit record
        audit = AuditLog(
            strategy_id=None,
            event_type="PANEL_FLATTEN",
            details_json=json.dumps({
                "account_id": account.id,
                "account_name": account.name,
                "report": report,
            }),
            timestamp=datetime.now(timezone.utc),
        )
        db.add(audit)
        db.commit()

        return {"success": True, "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Flatten failed: {str(e)}")
