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
    account_id: Optional[int] = None    # Trade a single account
    instrument_symbol: str  # e.g. "NQ" — maps to contract_month for Tradovate
    action: str             # "Buy" or "Sell"
    quantity: int = 1
    order_type: str = "Market"  # Market, Limit, Stop, StopLimit
    price: Optional[float] = None       # Limit price
    stop_price: Optional[float] = None  # Stop trigger price


class CancelOrderRequest(BaseModel):
    broker_order_id: int
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
      3. For each account: login → place_order
      4. Record results in OrderRecord table
      5. Return aggregated report
    """
    from required_api.tradovate_client import get_proxied_client
    from engine.alerting import create_alert

    # ── Validate: exactly one of group_id or account_id ──
    if payload.group_id and payload.account_id:
        raise HTTPException(
            status_code=400,
            detail="Specify either group_id or account_id, not both.",
        )
    if not payload.group_id and not payload.account_id:
        raise HTTPException(
            status_code=400,
            detail="Either group_id or account_id is required.",
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
        # Single-account mode
        account = (
            db.query(Account)
            .options(joinedload(Account.credential))
            .filter(Account.id == payload.account_id)
            .first()
        )
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        if not account.is_active:
            raise HTTPException(status_code=400, detail="Account is not active")
        target_accounts = [account]

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

    # ── Fan-out: place order on each account ─────────────
    results: List[dict] = []
    success_count = 0
    fail_count = 0

    # Cache logins per credential to avoid re-authenticating
    client_cache = {}

    for account in target_accounts:
        cred = account.credential
        if not cred or not cred.is_active:
            results.append({
                "account_id": account.id,
                "account_name": account.name,
                "success": False,
                "error": "No active credential",
            })
            fail_count += 1
            continue

        # Get or create client for this credential
        cred_key = cred.id
        if cred_key not in client_cache:
            try:
                user = db.query(User).filter(User.id == cred.user_id).first()
                client = get_proxied_client(user=user)
                token, error = client.login(cred.login_id, cred.password)
                if not token:
                    # All accounts under this credential will fail
                    client_cache[cred_key] = {"client": None, "error": f"Login failed: {error}"}
                else:
                    client_cache[cred_key] = {"client": client, "error": None}
            except Exception as e:
                client_cache[cred_key] = {"client": None, "error": str(e)}

        cached = client_cache[cred_key]
        if not cached["client"]:
            results.append({
                "account_id": account.id,
                "account_name": account.name,
                "success": False,
                "error": cached["error"],
            })
            fail_count += 1
            continue

        client = cached["client"]

        try:
            # Determine order price
            order_price = payload.price
            if payload.order_type == "Stop":
                order_price = payload.stop_price

            result = client.place_order(
                account_id=account.tradovate_account_id,
                account_spec=account.name,
                symbol=tradovate_symbol,
                action=payload.action,
                qty=payload.quantity,
                order_type=payload.order_type,
                price=order_price,
            )

            # Extract broker order ID from response
            broker_oid = str(result.get("orderId", result.get("id", "")))

            # Record in OrderRecord
            order_record = OrderRecord(
                strategy_id=None,  # Panel orders have no strategy
                account_id=account.id,
                instrument_id=instrument.id,
                side=payload.action,
                quantity=payload.quantity,
                filled_quantity=0,
                order_type=payload.order_type,
                price=payload.price,
                state="ACCEPTED",
                broker_order_id=broker_oid,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(order_record)

            results.append({
                "account_id": account.id,
                "account_name": account.name,
                "success": True,
                "broker_order_id": broker_oid,
                "order_record_id": None,  # Will be set after flush
            })
            success_count += 1

        except Exception as e:
            logger.error(f"Order failed for {account.name}: {e}")
            results.append({
                "account_id": account.id,
                "account_name": account.name,
                "success": False,
                "error": str(e),
            })
            fail_count += 1

    # Commit all order records
    db.flush()

    # Create audit log
    group_name = group.name if group else f"Account #{payload.account_id}"
    audit = AuditLog(
        strategy_id=None,
        event_type="PANEL_ORDER",
        details_json=json.dumps({
            "group_id": payload.group_id,
            "account_id": payload.account_id,
            "group_name": group_name,
            "instrument": payload.instrument_symbol,
            "contract": tradovate_symbol,
            "action": payload.action,
            "quantity": payload.quantity,
            "order_type": payload.order_type,
            "price": payload.price,
            "stop_price": payload.stop_price,
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
    from required_api.tradovate_client import get_proxied_client

    account = (
        db.query(Account)
        .options(joinedload(Account.credential))
        .filter(Account.id == payload.account_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if not account.credential:
        raise HTTPException(status_code=400, detail="Account has no credential")

    cred = account.credential
    user = db.query(User).filter(User.id == cred.user_id).first()
    client = get_proxied_client(user=user)
    token, error = client.login(cred.login_id, cred.password)
    if not token:
        raise HTTPException(status_code=400, detail=f"Login failed: {error}")

    try:
        result = client.cancel_order(payload.broker_order_id)

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
