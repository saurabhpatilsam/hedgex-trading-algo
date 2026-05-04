"""
Broker Data Router — Live data from Tradovate TV Bridge API.

Exposes the TradingView Bridge API endpoints to the frontend,
using bearer tokens sourced from Azure Redis.

Endpoints:
  GET  /api/broker/config                          — Broker capabilities
  GET  /api/broker/accounts                        — List all TV Bridge accounts
  GET  /api/broker/accounts/{id}/state             — Account balance/equity/margins
  GET  /api/broker/accounts/{id}/orders            — Orders for account
  GET  /api/broker/accounts/{id}/positions         — Positions for account
  GET  /api/broker/accounts/{id}/instruments       — Available instruments
  GET  /api/broker/accounts/{id}/executions        — Execution history
  GET  /api/broker/quotes                          — Live quotes
  GET  /api/broker/all-positions                   — Aggregated positions (all accounts)
  GET  /api/broker/all-orders                      — Aggregated orders (all accounts)
  GET  /api/broker/all-states                      — Aggregated account states
  POST /api/broker/accounts/{id}/orders            — Place order via TV Bridge
  PUT  /api/broker/accounts/{id}/orders/{oid}      — Modify working order
  DELETE /api/broker/accounts/{id}/orders/{oid}    — Cancel working order
  DELETE /api/broker/accounts/{id}/positions/{pid} — Close position
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/broker", tags=["broker-data"])


def _get_tv_client():
    """Create a TradovateClient with token from Redis (no login needed)."""
    from required_api.tradovate_client import TradovateClient, get_bearer_token_from_redis

    client = TradovateClient()
    token = get_bearer_token_from_redis()
    if token:
        client.access_token = token
    else:
        raise HTTPException(
            status_code=503,
            detail="No bearer token available in Redis. Ensure a token is stored.",
        )
    return client


# ── Broker Config ──────────────────────────────────────────


@router.get("/config")
def get_broker_config():
    """
    GET /config — Broker capabilities, supported order types,
    durations, and polling intervals.
    """
    client = _get_tv_client()
    try:
        return client.get_tv_config()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


# ── Accounts ───────────────────────────────────────────────


@router.get("/accounts")
def list_broker_accounts():
    """
    GET /accounts — List all trading accounts with capability flags.
    Returns accounts with id, name, type, currency, config.
    """
    client = _get_tv_client()
    try:
        return client.get_tv_accounts()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


@router.get("/accounts/{account_id}/state")
def get_account_state(account_id: str):
    """
    GET /accounts/{id}/state — Balance, equity, unrealized P/L, margin data.
    """
    client = _get_tv_client()
    try:
        return client.get_tv_account_state(account_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


@router.get("/accounts/{account_id}/orders")
def get_account_orders(account_id: str):
    """
    GET /accounts/{id}/orders — All orders for account.
    """
    client = _get_tv_client()
    try:
        return client.get_tv_orders(account_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


@router.get("/accounts/{account_id}/positions")
def get_account_positions(account_id: str):
    """
    GET /accounts/{id}/positions — Open positions for account.
    """
    client = _get_tv_client()
    try:
        return client.get_tv_positions(account_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


@router.get("/accounts/{account_id}/instruments")
def get_account_instruments(account_id: str):
    """
    GET /accounts/{id}/instruments — Available instruments/contracts.
    """
    client = _get_tv_client()
    try:
        return client.get_tv_instruments(account_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


@router.get("/accounts/{account_id}/executions")
def get_account_executions(
    account_id: str,
    symbol: Optional[str] = Query(None, description="Filter by instrument symbol"),
):
    """
    GET /accounts/{id}/executions — Execution/fill history.
    """
    client = _get_tv_client()
    try:
        return client.get_tv_executions(account_id, symbol)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


# ── Quotes ─────────────────────────────────────────────────


@router.get("/quotes")
def get_quotes(
    symbols: str = Query(..., description="Comma-separated symbols (e.g. MNQM6,NQM6)"),
    account_id: str = Query(..., description="TV Bridge account ID (e.g. D18156785)"),
):
    """
    Live quotes from Redis with bid, ask, and last price.
    """
    from services.tv_bridge_service import get_redis_quote

    try:
        symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
        return [
            {
                "s": "ok",
                "n": symbol,
                "v": {
                    "lp": quote.get("price"),
                    "bid": quote.get("bid"),
                    "ask": quote.get("ask"),
                },
            }
            for symbol in symbol_list
            for quote in [get_redis_quote(symbol)]
        ]
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── Aggregated Data (All Accounts) ─────────────────────────


@router.get("/all-positions")
def get_all_positions():
    """
    Fetch positions across ALL accounts. Returns aggregated list.
    """
    client = _get_tv_client()
    try:
        accounts = client.get_tv_accounts()
        all_positions = []
        for acc in accounts:
            acc_id = acc.get("id", "")
            acc_name = acc.get("name", "")
            try:
                positions = client.get_tv_positions(acc_id)
                for pos in positions:
                    pos["_account_id"] = acc_id
                    pos["_account_name"] = acc_name
                all_positions.extend(positions)
            except Exception as e:
                logger.warning(f"Failed to fetch positions for {acc_id}: {e}")
        return {"positions": all_positions, "count": len(all_positions)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


@router.get("/all-orders")
def get_all_orders():
    """
    Fetch orders across ALL accounts. Returns aggregated list.
    """
    client = _get_tv_client()
    try:
        accounts = client.get_tv_accounts()
        all_orders = []
        for acc in accounts:
            acc_id = acc.get("id", "")
            acc_name = acc.get("name", "")
            try:
                orders = client.get_tv_orders(acc_id)
                for order in orders:
                    order["_account_id"] = acc_id
                    order["_account_name"] = acc_name
                all_orders.extend(orders)
            except Exception as e:
                logger.warning(f"Failed to fetch orders for {acc_id}: {e}")
        return {"orders": all_orders, "count": len(all_orders)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


@router.get("/all-states")
def get_all_account_states():
    """
    Fetch account state (balance/equity/margins) for ALL accounts.
    """
    client = _get_tv_client()
    try:
        accounts = client.get_tv_accounts()
        states = []
        for acc in accounts:
            acc_id = acc.get("id", "")
            acc_name = acc.get("name", "")
            try:
                state = client.get_tv_account_state(acc_id)
                state["_account_id"] = acc_id
                state["_account_name"] = acc_name
                state["_currency"] = acc.get("currency", "USD")
                state["_currency_sign"] = acc.get("currencySign", "$")
                states.append(state)
            except Exception as e:
                logger.warning(f"Failed to fetch state for {acc_id}: {e}")
                states.append({
                    "_account_id": acc_id,
                    "_account_name": acc_name,
                    "error": str(e),
                })
        return {"states": states, "count": len(states)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TV Bridge error: {str(e)}")


# ── Order Actions ──────────────────────────────────────────


class PlaceTVOrderRequest(BaseModel):
    instrument: str
    side: str  # "buy" or "sell"
    qty: int = 1
    order_type: str = "market"  # market, limit, stop, stoplimit
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    duration_type: str = "Day"


class ModifyTVOrderRequest(BaseModel):
    instrument: Optional[str] = None
    limit_price: Optional[float] = None
    qty: Optional[int] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None


@router.post("/accounts/{account_id}/orders")
def place_broker_order(account_id: str, payload: PlaceTVOrderRequest):
    """
    POST /accounts/{id}/orders — Place order via TV Bridge.
    """
    client = _get_tv_client()
    try:
        from services.tv_bridge_service import RedisQuoteMissing, get_redis_quote

        quote = get_redis_quote(payload.instrument)
        return client.place_tv_order(
            account_id=account_id,
            instrument=payload.instrument,
            side=payload.side,
            qty=payload.qty,
            order_type=payload.order_type,
            limit_price=payload.limit_price,
            stop_price=payload.stop_price,
            stop_loss=payload.stop_loss,
            take_profit=payload.take_profit,
            duration_type=payload.duration_type,
            current_ask=quote["ask"],
            current_bid=quote["bid"],
        )
    except RedisQuoteMissing as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Order placement failed: {str(e)}")


@router.put("/accounts/{account_id}/orders/{order_id}")
def modify_broker_order(account_id: str, order_id: str, payload: ModifyTVOrderRequest):
    """
    PUT /accounts/{id}/orders/{orderId} — Modify a working order.
    """
    client = _get_tv_client()
    if not payload.instrument:
        raise HTTPException(status_code=400, detail="instrument is required to load Redis bid/ask for order modification")

    try:
        from services.tv_bridge_service import RedisQuoteMissing, get_redis_quote
        quote = get_redis_quote(payload.instrument)
        return client.modify_tv_order(
            account_id=account_id,
            order_id=order_id,
            limit_price=payload.limit_price,
            qty=payload.qty,
            stop_loss=payload.stop_loss,
            take_profit=payload.take_profit,
            current_ask=quote["ask"],
            current_bid=quote["bid"],
        )
    except RedisQuoteMissing as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Order modify failed: {str(e)}")


@router.delete("/accounts/{account_id}/orders/{order_id}")
def cancel_broker_order(account_id: str, order_id: str):
    """
    DELETE /accounts/{id}/orders/{orderId} — Cancel a working order.
    """
    client = _get_tv_client()
    try:
        return client.cancel_tv_order(account_id, order_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Order cancel failed: {str(e)}")


@router.delete("/accounts/{account_id}/positions/{position_id}")
def close_broker_position(account_id: str, position_id: str):
    """
    DELETE /accounts/{id}/positions/{posId} — Close/flatten a position.
    """
    client = _get_tv_client()
    try:
        return client.close_tv_position(account_id, position_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Position close failed: {str(e)}")
