import json
import logging
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


class RedisQuoteMissing(RuntimeError):
    """Raised when Redis does not contain a complete bid/ask quote."""


class TVAccountMappingError(RuntimeError):
    """Raised when a local account cannot be mapped to a TV Bridge account."""


class TVBridgeValidationError(RuntimeError):
    """Raised before sending a malformed request to the TV Bridge."""


WORKING_ORDER_STATUSES = {"working", "pending", "accepted", "new", "pending_new"}
SUPPORTED_DURATIONS = {"Day", "GTC"}


def _as_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _account_label(account: Any) -> str:
    return str(getattr(account, "name", "") or getattr(account, "id", "") or "Unknown")


def _safe_commit(db: Any) -> None:
    commit = getattr(db, "commit", None)
    if callable(commit):
        commit()


def _credential_token_owner(credential: Any) -> Optional[str]:
    return str(getattr(credential, "login_id", "") or "").strip() or None


def get_bridge_client(client=None, credential: Any = None):
    """Return a TV Bridge client whose bearer token came from Redis."""
    if client is not None:
        return client

    from required_api.tradovate_client import TradovateClient

    bridge_client = TradovateClient()
    try:
        if credential is not None:
            bridge_client.ensure_token(
                token_owner=_credential_token_owner(credential),
                user_id=getattr(credential, "user_id", None),
            )
        else:
            bridge_client.ensure_token()
    except Exception as exc:
        login_id = _credential_token_owner(credential)
        if login_id:
            raise TVAccountMappingError(
                f"Authentication token expired or missing in Redis for {login_id}. "
                "Reconnect TradingView/Tradovate and try refresh again."
            ) from exc
        raise
    return bridge_client


def _default_redis_clients() -> Iterable[Any]:
    """Yield Redis clients for quote lookup without coupling callers to config."""
    try:
        from required_api.tradovate_client import _get_redis

        yield _get_redis()
    except Exception as exc:
        logger.debug("Local Redis unavailable for quote lookup: %s", exc)

    try:
        from required_api.tradovate_client import _get_azure_redis

        yield _get_azure_redis()
    except Exception as exc:
        logger.debug("Azure Redis unavailable for quote lookup: %s", exc)


def normalize_quote(symbol: str, raw: Any) -> Dict[str, Any]:
    """Normalize either an hx:prices tick or TV Bridge quote-shaped payload."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RedisQuoteMissing(
                f"Invalid Redis quote for {symbol}: bid/ask required for TV Bridge order placement"
            ) from exc
    if raw is None:
        raise RedisQuoteMissing(f"Missing Redis quote for {symbol}: bid/ask required for TV Bridge order placement")

    if not isinstance(raw, dict):
        raise RedisQuoteMissing(f"Invalid Redis quote for {symbol}: bid/ask required for TV Bridge order placement")

    values = raw.get("v") if isinstance(raw.get("v"), dict) else raw
    quote_symbol = raw.get("symbol") or raw.get("n") or values.get("symbol") or symbol
    bid = _as_float(values.get("bid"))
    ask = _as_float(values.get("ask"))
    price = _as_float(
        values.get("price")
        or values.get("last_price")
        or values.get("last")
        or values.get("lp")
    )

    if bid is None or ask is None:
        raise RedisQuoteMissing(f"Missing Redis quote for {symbol}: bid/ask required for TV Bridge order placement")

    return {
        "symbol": quote_symbol,
        "price": price,
        "bid": bid,
        "ask": ask,
        "raw": raw,
    }


def get_redis_quote(symbol: str, redis_client=None) -> Dict[str, Any]:
    """Fetch a complete quote from Redis; never invent bid/ask values."""
    symbol = str(symbol or "").strip()
    if not symbol:
        raise RedisQuoteMissing("Missing Redis quote: symbol is required")

    clients = [redis_client] if redis_client is not None else list(_default_redis_clients())
    for client in clients:
        if client is None:
            continue
        for key in (symbol, symbol.upper()):
            try:
                raw = client.hget("hx:prices", key)
            except Exception as exc:
                logger.debug("Redis quote lookup failed for %s: %s", key, exc)
                raw = None
            if raw:
                return normalize_quote(symbol, raw)

    raise RedisQuoteMissing(f"Missing Redis quote for {symbol}: bid/ask required for TV Bridge order placement")


def _match_tv_account(local_account: Any, tv_accounts: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    local_name = _account_label(local_account).strip()
    for tv_account in tv_accounts:
        if str(tv_account.get("name", "")).strip() == local_name:
            return tv_account
    local_key = local_name.casefold()
    for tv_account in tv_accounts:
        if str(tv_account.get("name", "")).strip().casefold() == local_key:
            return tv_account
    return None


def resolve_tv_account_id(db: Any, account: Any, client=None) -> str:
    """Resolve and persist the TV Bridge account ID for a local account."""
    existing = getattr(account, "tv_account_id", None)
    if existing:
        return str(existing)

    bridge_client = get_bridge_client(client, credential=getattr(account, "credential", None))
    tv_account = _match_tv_account(account, bridge_client.get_tv_accounts())
    if not tv_account or not tv_account.get("id"):
        raise TVAccountMappingError(f"No TV Bridge account matched local account '{_account_label(account)}'")

    tv_account_id = str(tv_account["id"])
    setattr(account, "tv_account_id", tv_account_id)
    _safe_commit(db)
    return tv_account_id


def parse_account_state(state: Dict[str, Any]) -> Dict[str, Any]:
    am_values = []
    try:
        am_values = state.get("amData", [])[0][0]
    except Exception:
        am_values = []

    def value_at(index: int) -> Optional[float]:
        try:
            return _as_float(am_values[index])
        except Exception:
            return None

    parsed = dict(state or {})
    parsed.update({
        "totalPl": value_at(0),
        "openPl": value_at(1),
        "netLiq": value_at(2),
        "totalMarginUsed": value_at(3),
        "availableMargin": value_at(4),
        "dayMargin": value_at(5),
        "initialMargin": value_at(6),
        "maintenanceMargin": value_at(7),
    })
    return parsed


def normalize_order(order: Dict[str, Any], account: Any = None) -> Dict[str, Any]:
    normalized = dict(order or {})
    duration = normalized.get("duration")
    normalized["durationType"] = duration.get("type") if isinstance(duration, dict) else duration
    normalized["broker_order_id"] = str(normalized.get("id", ""))
    if account is not None:
        normalized["_account_id"] = getattr(account, "tv_account_id", None)
        normalized["_local_account_id"] = getattr(account, "id", None)
        normalized["_account_name"] = _account_label(account)
    return normalized


def normalize_position(position: Dict[str, Any], account: Any = None) -> Dict[str, Any]:
    normalized = dict(position or {})
    side = str(normalized.get("side") or "").lower()
    qty = normalized.get("qty")
    if qty is None and normalized.get("netPos") is not None:
        qty = abs(int(normalized.get("netPos") or 0))
        side = "buy" if int(normalized.get("netPos") or 0) > 0 else "sell"
    normalized["qty"] = qty or 0
    normalized["side"] = side or ("buy" if (qty or 0) > 0 else "sell")
    normalized["avgPrice"] = normalized.get("avgPrice", normalized.get("netPrice"))
    normalized["unrealizedPl"] = normalized.get("unrealizedPl", normalized.get("openPnl", 0))
    if account is not None:
        normalized["_account_id"] = getattr(account, "tv_account_id", None)
        normalized["_local_account_id"] = getattr(account, "id", None)
        normalized["_account_name"] = _account_label(account)
    return normalized


def _validate_order_payload(
    order_type: str,
    limit_price: Optional[float],
    stop_price: Optional[float],
    duration_type: str,
) -> str:
    normalized_type = str(order_type or "market").replace("_", "").lower()
    if normalized_type not in {"market", "limit", "stop", "stoplimit"}:
        raise TVBridgeValidationError("Order type must be Market, Limit, Stop, or StopLimit")
    if normalized_type in {"limit", "stoplimit"} and limit_price is None:
        raise TVBridgeValidationError("limitPrice is required for limit and stop-limit orders")
    if normalized_type in {"stop", "stoplimit"} and stop_price is None:
        raise TVBridgeValidationError("stopPrice is required for stop and stop-limit orders")
    if duration_type not in SUPPORTED_DURATIONS:
        raise TVBridgeValidationError("durationType must be Day or GTC")
    return normalized_type


def place_order_for_accounts(
    db: Any,
    accounts: List[Any],
    instrument: Any,
    side: str,
    qty: int,
    order_type: str = "Market",
    limit_price: Optional[float] = None,
    stop_price: Optional[float] = None,
    stop_loss: Optional[float] = None,
    take_profit: Optional[float] = None,
    duration_type: str = "Day",
    client=None,
    redis_client=None,
) -> Dict[str, Any]:
    """Place one TV Bridge order per account and return per-account results."""
    if qty < 1:
        raise TVBridgeValidationError("qty must be at least 1")
    side_value = str(side or "").lower()
    if side_value not in {"buy", "sell"}:
        if side_value == "buy".lower():
            side_value = "buy"
        elif side_value == "sell".lower():
            side_value = "sell"
        else:
            raise TVBridgeValidationError("side must be Buy or Sell")

    symbol = getattr(instrument, "contract_month", None) or getattr(instrument, "symbol", None) or str(instrument)
    order_type_value = _validate_order_payload(order_type, limit_price, stop_price, duration_type)
    quote = get_redis_quote(symbol, redis_client=redis_client)

    results = []
    success_count = 0
    fail_count = 0

    for account in accounts:
        try:
            bridge_client = get_bridge_client(client, credential=getattr(account, "credential", None))
            tv_account_id = resolve_tv_account_id(db, account, client=bridge_client)
            raw_result = bridge_client.place_tv_order(
                account_id=tv_account_id,
                instrument=symbol,
                side=side_value,
                qty=qty,
                order_type=order_type_value,
                limit_price=limit_price,
                stop_price=stop_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                duration_type=duration_type,
                current_ask=quote["ask"],
                current_bid=quote["bid"],
            )
            broker_order_id = raw_result.get("id") or raw_result.get("orderId")
            results.append({
                "account_id": getattr(account, "id", None),
                "account_name": _account_label(account),
                "tv_account_id": tv_account_id,
                "success": True,
                "broker_order_id": str(broker_order_id) if broker_order_id else None,
                "result": raw_result,
            })
            success_count += 1
        except Exception as exc:
            results.append({
                "account_id": getattr(account, "id", None),
                "account_name": _account_label(account),
                "success": False,
                "error": str(exc),
            })
            fail_count += 1

    return {
        "instrument": symbol,
        "action": side_value.title(),
        "quantity": qty,
        "order_type": order_type_value,
        "duration_type": duration_type,
        "success_count": success_count,
        "fail_count": fail_count,
        "total_accounts": success_count + fail_count,
        "results": results,
    }


def is_working_order(order: Dict[str, Any]) -> bool:
    return str(order.get("status") or order.get("state") or "").lower() in WORKING_ORDER_STATUSES


def flatten_account(db: Any, account: Any, symbol: Optional[str] = None, client=None) -> Dict[str, Any]:
    """Cancel working bridge orders and close bridge positions for one account."""
    bridge_client = get_bridge_client(client)
    tv_account_id = resolve_tv_account_id(db, account, client=bridge_client)
    report = {
        "account_id": getattr(account, "id", None),
        "account": _account_label(account),
        "tv_account_id": tv_account_id,
        "orders_cancelled": [],
        "positions_flattened": [],
        "errors": [],
    }

    for order in bridge_client.get_tv_orders(tv_account_id):
        if not is_working_order(order):
            continue
        if symbol and order.get("instrument") != symbol:
            continue
        try:
            bridge_client.cancel_tv_order(tv_account_id, str(order.get("id")))
            report["orders_cancelled"].append(order)
        except Exception as exc:
            report["errors"].append(f"Cancel {order.get('id')}: {exc}")

    for position in bridge_client.get_tv_positions(tv_account_id):
        if symbol and position.get("instrument") != symbol:
            continue
        try:
            bridge_client.close_tv_position(tv_account_id, str(position.get("id")))
            report["positions_flattened"].append(position)
        except Exception as exc:
            report["errors"].append(f"Close {position.get('id')}: {exc}")

    return report


def cancel_order(db: Any, account: Any, broker_order_id: str, client=None) -> Dict[str, Any]:
    bridge_client = get_bridge_client(client)
    tv_account_id = resolve_tv_account_id(db, account, client=bridge_client)
    return bridge_client.cancel_tv_order(tv_account_id, str(broker_order_id))


def list_positions_for_accounts(db: Any, accounts: List[Any], client=None) -> List[Dict[str, Any]]:
    bridge_client = get_bridge_client(client)
    positions: List[Dict[str, Any]] = []
    for account in accounts:
        try:
            tv_account_id = resolve_tv_account_id(db, account, client=bridge_client)
            for position in bridge_client.get_tv_positions(tv_account_id):
                positions.append(normalize_position(position, account))
        except Exception as exc:
            logger.warning("Position fetch failed for %s: %s", _account_label(account), exc)
    return positions


def list_orders_for_accounts(db: Any, accounts: List[Any], client=None) -> List[Dict[str, Any]]:
    bridge_client = get_bridge_client(client)
    orders: List[Dict[str, Any]] = []
    for account in accounts:
        try:
            tv_account_id = resolve_tv_account_id(db, account, client=bridge_client)
            for order in bridge_client.get_tv_orders(tv_account_id):
                orders.append(normalize_order(order, account))
        except Exception as exc:
            logger.warning("Order fetch failed for %s: %s", _account_label(account), exc)
    return orders


def flatten_accounts(db: Any, accounts: List[Any], symbol: Optional[str] = None, client=None) -> List[Dict[str, Any]]:
    bridge_client = get_bridge_client(client)
    return [flatten_account(db, account, symbol=symbol, client=bridge_client) for account in accounts]


def sync_accounts_from_bridge(db: Any, accounts: List[Any], client=None) -> Dict[str, Any]:
    results = []

    for account in accounts:
        try:
            bridge_client = get_bridge_client(client, credential=getattr(account, "credential", None))
            tv_accounts = bridge_client.get_tv_accounts()
            tv_account = _match_tv_account(account, tv_accounts)
            if not tv_account:
                raise TVAccountMappingError(f"No TV Bridge account matched local account '{_account_label(account)}'")
            tv_account_id = str(tv_account["id"])
            setattr(account, "tv_account_id", tv_account_id)

            state = parse_account_state(bridge_client.get_tv_account_state(tv_account_id))
            balance = state.get("balance") or state.get("netLiq")
            if balance is not None and hasattr(account, "balance"):
                account.balance = float(balance)
            if hasattr(account, "last_updated_at"):
                from datetime import datetime, timezone

                account.last_updated_at = datetime.now(timezone.utc)

            results.append({
                "account_id": getattr(account, "id", None),
                "account": _account_label(account),
                "tv_account_id": tv_account_id,
                "balance": getattr(account, "balance", None),
                "status": "synced",
                "state": state,
            })
        except Exception as exc:
            results.append({
                "account_id": getattr(account, "id", None),
                "account": _account_label(account),
                "error": str(exc),
            })

    _safe_commit(db)
    return {
        "synced": len([r for r in results if r.get("status") == "synced"]),
        "errors": len([r for r in results if r.get("error")]),
        "results": results,
    }


def sync_credential_accounts_from_bridge(db: Any, credential: Any, client=None) -> Dict[str, Any]:
    """Create or update local accounts for one credential from TV Bridge /accounts."""
    from models import Account

    bridge_client = get_bridge_client(client, credential=credential)
    tv_accounts = bridge_client.get_tv_accounts()
    existing = {account.name: account for account in getattr(credential, "accounts", [])}
    results = []

    for tv_account in tv_accounts:
        name = tv_account.get("name")
        if not name:
            continue
        account = existing.get(name)
        if account is None:
            account = Account(
                name=name,
                credential_id=credential.id,
                account_number=name,
                tv_account_id=str(tv_account.get("id")),
                is_active=True,
            )
            db.add(account)
            existing[name] = account
        else:
            account.tv_account_id = str(tv_account.get("id"))
            account.is_active = True

        try:
            state = parse_account_state(bridge_client.get_tv_account_state(account.tv_account_id))
            balance = state.get("balance") or state.get("netLiq")
            if balance is not None:
                account.balance = float(balance)
        except Exception as exc:
            state = {}
            logger.warning("State sync failed for %s: %s", name, exc)

        if hasattr(account, "last_updated_at"):
            from datetime import datetime, timezone

            account.last_updated_at = datetime.now(timezone.utc)
        results.append({
            "account": name,
            "tv_account_id": account.tv_account_id,
            "balance": getattr(account, "balance", None),
            "status": "synced",
            "state": state,
        })

    if hasattr(credential, "error_message"):
        credential.error_message = None
    if hasattr(credential, "last_synced_at"):
        from datetime import datetime, timezone

        credential.last_synced_at = datetime.now(timezone.utc)
    _safe_commit(db)
    return {
        "synced": len(results),
        "errors": 0,
        "results": results,
    }


def sync_instruments_from_bridge(db: Any, account: Any = None, client=None) -> Dict[str, Any]:
    from models import Instrument, InstrumentType

    bridge_client = get_bridge_client(client)
    tv_account_id = resolve_tv_account_id(db, account, client=bridge_client) if account else None
    if tv_account_id is None:
        tv_accounts = bridge_client.get_tv_accounts()
        if not tv_accounts:
            raise TVAccountMappingError("No TV Bridge account available for instrument sync")
        tv_account_id = str(tv_accounts[0]["id"])

    bridge_instruments = bridge_client.get_tv_instruments(tv_account_id)
    added = 0
    updated = 0

    for item in bridge_instruments:
        contract = item.get("name") or item.get("symbol") or item.get("ticker")
        if not contract:
            continue
        base_symbol = contract[:-2] if len(contract) > 2 and contract[-1].isdigit() else contract
        if not base_symbol:
            base_symbol = contract

        existing = db.query(Instrument).filter(Instrument.contract_month == contract).first()
        if existing is None:
            existing = db.query(Instrument).filter(Instrument.symbol == base_symbol).first()

        min_tick = _as_float(item.get("minTick") or item.get("pipSize"))
        tick_value = _as_float(item.get("pipValue"))
        inst_type = InstrumentType.MICRO_FUTURES if base_symbol.startswith("M") else InstrumentType.FUTURES

        if existing:
            existing.contract_month = contract
            existing.name = item.get("description") or existing.name or f"{base_symbol} Futures"
            if min_tick:
                existing.tick_size = min_tick
            if tick_value:
                existing.tick_value = tick_value
            existing.is_active = True
            updated += 1
        else:
            db.add(Instrument(
                symbol=base_symbol,
                name=item.get("description") or f"{base_symbol} Futures",
                instrument_type=inst_type,
                contract_month=contract,
                tick_size=min_tick or 0.25,
                tick_value=tick_value or 12.50,
                is_active=True,
            ))
            added += 1

    _safe_commit(db)
    return {
        "message": f"Instrument sync complete. Added {added} new, updated {updated} existing.",
        "added": added,
        "updated": updated,
    }
