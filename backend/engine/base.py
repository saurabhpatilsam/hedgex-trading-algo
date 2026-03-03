"""
BaseStrategy — Abstract interface all trading algorithms must implement.

Lifecycle:
  1. __init__()       — Constructor, receives DB session + config
  2. validate()       — Pre-flight checks (accounts exist, params valid)
  3. on_start()       — Initial entry orders when strategy goes RUNNING
  4. on_tick(data)     — Called every N seconds with latest market data
  5. on_stop()         — Cleanup: cancel open orders, optionally flatten
  6. on_emergency()    — Kill switch: cancel ALL, flatten ALL, immediately

Every strategy records an AuditLog entry for every decision.
"""

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class BaseStrategy(ABC):
    """Abstract base class for all trading strategies."""

    # Human-readable name shown in the UI dropdown
    STRATEGY_NAME: str = "Unnamed Strategy"
    # Short description
    STRATEGY_DESCRIPTION: str = ""
    # JSON schema for the parameters this strategy accepts
    PARAMETER_SCHEMA: dict = {}

    def __init__(
        self,
        db: Session,
        strategy_id: int,
        config: dict,
        paper_mode: bool = False,
    ):
        self.db = db
        self.strategy_id = strategy_id
        self.config = config
        self.paper_mode = paper_mode
        self.logger = logging.getLogger(f"strategy.{self.__class__.__name__}.{strategy_id}")

    # ── Lifecycle Methods ──────────────────────────────────

    @abstractmethod
    def validate(self) -> dict:
        """
        Validate that all preconditions are met.
        Returns {"valid": True} or {"valid": False, "errors": [...]}.
        """
        pass

    @abstractmethod
    def on_start(self) -> list[dict]:
        """
        Called when the strategy transitions to RUNNING.
        Should place initial entry orders.
        Returns list of order dicts placed.
        """
        pass

    @abstractmethod
    def on_tick(self, market_data: dict) -> list[dict]:
        """
        Called periodically with latest market data.
        The strategy evaluates signals and decides to:
          - Place new orders
          - Modify existing orders
          - Cancel orders
          - Do nothing
        Returns list of actions taken.
        """
        pass

    @abstractmethod
    def on_stop(self) -> list[dict]:
        """
        Called when the strategy is stopped gracefully.
        Should cancel open orders.
        Returns list of actions taken.
        """
        pass

    def on_emergency(self) -> list[dict]:
        """
        Kill switch — cancel everything, flatten all positions.
        Default implementation calls on_stop() but subclasses
        can override with more aggressive logic.
        """
        self.logger.critical(f"EMERGENCY SHUTDOWN for strategy {self.strategy_id}")
        return self.on_stop()

    # ── Audit Trail ────────────────────────────────────────

    def audit(self, event_type: str, details: dict):
        """Record an audit log entry for this strategy."""
        from models import AuditLog
        entry = AuditLog(
            strategy_id=self.strategy_id,
            event_type=event_type,
            details_json=str(details),
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(entry)
        # Don't commit here — let the caller batch commits

    # ── Helper: Place Order via Broker ─────────────────────

    def place_broker_order(
        self,
        account,
        symbol: str,
        action: str,
        qty: int,
        order_type: str = "Market",
    ) -> dict:
        """
        Place an order through the Tradovate API.
        If paper_mode is True, simulate the order instead.
        """
        from required_api.tradovate_client import get_proxied_client
        from models import BrokerCredential, User

        if self.paper_mode:
            import random
            sim_id = f"PAPER-{random.randint(100000, 999999)}"
            self.logger.info(f"[PAPER] {action} {qty}x {symbol} on {account.name} → {sim_id}")
            self.audit("PAPER_ORDER", {
                "account": account.name, "symbol": symbol,
                "action": action, "qty": qty, "sim_id": sim_id,
            })
            return {
                "orderId": sim_id,
                "ordStatus": "Filled",
                "avgPx": 0,
                "paper": True,
            }

        # Real order
        cred = (
            self.db.query(BrokerCredential)
            .filter(BrokerCredential.id == account.credential_id)
            .first()
        )
        if not cred:
            raise RuntimeError(f"No credential for account {account.name}")

        # Route through user's dedicated IP
        user = self.db.query(User).filter(User.id == cred.user_id).first()
        client = get_proxied_client(user=user)
        token, error = client.login(cred.login_id, cred.password)
        if not token:
            raise RuntimeError(f"Login failed for {account.name}: {error}")

        if not account.tradovate_account_id:
            raise RuntimeError(f"Missing tradovate_account_id for {account.name}")

        result = client.place_order(
            account_id=account.tradovate_account_id,
            account_spec=account.name,
            symbol=symbol,
            action=action,
            qty=qty,
            order_type=order_type,
        )

        self.audit("ORDER_PLACED", {
            "account": account.name, "symbol": symbol,
            "action": action, "qty": qty, "result": result,
        })
        return result

    def cancel_broker_order(self, account, broker_order_id: int) -> dict:
        """Cancel an order on the broker."""
        from required_api.tradovate_client import get_proxied_client
        from models import BrokerCredential, User

        if self.paper_mode:
            self.logger.info(f"[PAPER] Cancel order {broker_order_id} on {account.name}")
            return {"cancelled": True, "paper": True}

        cred = (
            self.db.query(BrokerCredential)
            .filter(BrokerCredential.id == account.credential_id)
            .first()
        )
        if not cred:
            raise RuntimeError(f"No credential for account {account.name}")

        # Route through user's dedicated IP
        user = self.db.query(User).filter(User.id == cred.user_id).first()
        client = get_proxied_client(user=user)
        token, error = client.login(cred.login_id, cred.password)
        if not token:
            raise RuntimeError(f"Login failed: {error}")

        result = client.cancel_order(broker_order_id)
        self.audit("ORDER_CANCELLED", {
            "account": account.name, "broker_order_id": broker_order_id,
            "result": result,
        })
        return result
