"""
PositionTracker — Real-time portfolio state.

Provides:
  - Current holdings per account/instrument
  - Unrealized P&L (requires market price)
  - Realized P&L (from closed fills)
  - Net exposure across all strategies
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class PositionTracker:
    """
    Tracks real-time positions, P&L, and exposure
    by querying filled orders and broker positions.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_positions(self, strategy_id: Optional[int] = None) -> list[dict]:
        """
        Get current open positions aggregated from filled orders.
        Returns net position per account+instrument.
        """
        from models import OrderRecord
        from engine.order_manager import OrderState

        query = self.db.query(OrderRecord).filter(
            OrderRecord.state == OrderState.FILLED.value,
        )
        if strategy_id:
            query = query.filter(OrderRecord.strategy_id == strategy_id)

        filled = query.all()

        # Aggregate: (account_id, instrument_id) → net quantity + avg price
        positions = {}
        for order in filled:
            key = (order.account_id, order.instrument_id)
            if key not in positions:
                positions[key] = {
                    "account_id": order.account_id,
                    "instrument_id": order.instrument_id,
                    "net_quantity": 0,
                    "total_cost": 0.0,
                    "realized_pnl": 0.0,
                    "fills": [],
                }

            signed_qty = order.filled_quantity if order.side == "BUY" else -order.filled_quantity
            fill_price = order.fill_price or 0.0

            pos = positions[key]
            old_qty = pos["net_quantity"]
            old_cost = pos["total_cost"]

            # If adding to position
            if (old_qty >= 0 and signed_qty > 0) or (old_qty <= 0 and signed_qty < 0):
                pos["net_quantity"] += signed_qty
                pos["total_cost"] += abs(signed_qty) * fill_price
            else:
                # Reducing or flipping — realize P&L
                close_qty = min(abs(signed_qty), abs(old_qty))
                if old_qty != 0:
                    avg_entry = old_cost / abs(old_qty) if old_qty != 0 else 0
                    if old_qty > 0:  # Was long, selling
                        pos["realized_pnl"] += close_qty * (fill_price - avg_entry)
                    else:  # Was short, buying
                        pos["realized_pnl"] += close_qty * (avg_entry - fill_price)

                pos["net_quantity"] += signed_qty
                remaining = abs(pos["net_quantity"])
                pos["total_cost"] = remaining * fill_price if remaining > 0 else 0

            pos["fills"].append({
                "order_id": order.id,
                "side": order.side,
                "qty": order.filled_quantity,
                "price": fill_price,
            })

        return list(positions.values())

    def get_portfolio_summary(self, strategy_id: Optional[int] = None) -> dict:
        """High-level portfolio summary."""
        positions = self.get_positions(strategy_id)

        total_long = sum(p["net_quantity"] for p in positions if p["net_quantity"] > 0)
        total_short = sum(abs(p["net_quantity"]) for p in positions if p["net_quantity"] < 0)
        total_realized = sum(p["realized_pnl"] for p in positions)

        return {
            "total_positions": len([p for p in positions if p["net_quantity"] != 0]),
            "long_contracts": total_long,
            "short_contracts": total_short,
            "net_exposure": total_long - total_short,
            "realized_pnl": round(total_realized, 2),
            "positions": positions,
        }

    def get_broker_positions(self, account) -> list[dict]:
        """Fetch live positions from the broker for reconciliation."""
        from required_api.tradovate_client import get_proxied_client
        from models import BrokerCredential, User

        cred = (
            self.db.query(BrokerCredential)
            .filter(BrokerCredential.id == account.credential_id)
            .first()
        )
        if not cred:
            return []

        # Route through user's dedicated IP
        user = self.db.query(User).filter(User.id == cred.user_id).first()
        client = get_proxied_client(user=user)
        token, error = client.login(cred.login_id, cred.password)
        if not token:
            logger.error(f"Cannot fetch broker positions: {error}")
            return []

        return client.get_positions(account.tradovate_account_id)
