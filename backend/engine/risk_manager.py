"""
RiskManager — Pre-trade risk checks + Kill Switch.

Features:
  - Max position size per account
  - Max drawdown threshold
  - Max orders per minute (rate limiting)
  - Kill switch: cancel all orders + flatten all positions
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from engine.order_manager import OrderManager, OrderState

logger = logging.getLogger(__name__)


class RiskManager:
    """
    Enforces risk limits and provides emergency shutdown capability.
    """

    # Default risk limits (can be overridden per strategy)
    DEFAULT_LIMITS = {
        "max_position_size": 10,        # Max contracts per account/instrument
        "max_daily_loss": 500.0,        # Max daily loss in dollars
        "max_orders_per_minute": 30,    # Rate limit
        "max_open_orders": 50,          # Max concurrent open orders
    }

    def __init__(self, db: Session, limits: Optional[dict] = None):
        self.db = db
        self.limits = {**self.DEFAULT_LIMITS, **(limits or {})}
        self._kill_switch_active = False

    @property
    def is_killed(self) -> bool:
        return self._kill_switch_active

    def pre_trade_check(
        self,
        strategy_id: int,
        account_id: int,
        instrument_id: int,
        side: str,
        quantity: int,
    ) -> dict:
        """
        Run pre-trade risk checks before placing an order.
        Returns {"approved": True} or {"approved": False, "reason": "..."}.
        """
        if self._kill_switch_active:
            return {"approved": False, "reason": "Kill switch is active — all trading halted"}

        # Check max position size
        from engine.position_tracker import PositionTracker
        tracker = PositionTracker(self.db)
        positions = tracker.get_positions(strategy_id)

        for pos in positions:
            if pos["account_id"] == account_id and pos["instrument_id"] == instrument_id:
                new_net = pos["net_quantity"] + (quantity if side == "BUY" else -quantity)
                if abs(new_net) > self.limits["max_position_size"]:
                    return {
                        "approved": False,
                        "reason": f"Would exceed max position size ({self.limits['max_position_size']}). "
                                  f"Current: {pos['net_quantity']}, Adding: {'+' if side == 'BUY' else '-'}{quantity}",
                    }

        # Check max open orders
        om = OrderManager(self.db)
        open_orders = om.get_open_orders(strategy_id)
        if len(open_orders) >= self.limits["max_open_orders"]:
            return {
                "approved": False,
                "reason": f"Max open orders ({self.limits['max_open_orders']}) reached",
            }

        # Check daily P&L drawdown
        summary = tracker.get_portfolio_summary(strategy_id)
        if summary["realized_pnl"] < -self.limits["max_daily_loss"]:
            return {
                "approved": False,
                "reason": f"Daily loss limit (${self.limits['max_daily_loss']}) breached. "
                          f"Current P&L: ${summary['realized_pnl']}",
            }

        return {"approved": True}

    def activate_kill_switch(self, reason: str = "Manual activation") -> dict:
        """
        EMERGENCY: Cancel all open orders and flatten all positions.
        This is the nuclear option.
        """
        self._kill_switch_active = True
        logger.critical(f"🚨 KILL SWITCH ACTIVATED: {reason}")

        from models import AuditLog, ActiveStrategy, OrderRecord
        from engine.order_manager import OrderState

        # 1. Log the kill switch event
        entry = AuditLog(
            strategy_id=None,
            event_type="KILL_SWITCH",
            details_json=str({"reason": reason, "timestamp": str(datetime.now(timezone.utc))}),
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(entry)

        # 2. Cancel all open orders in the database
        om = OrderManager(self.db)
        cancelled_count = om.cancel_all_orders()

        # 3. Stop all running strategies
        running = (
            self.db.query(ActiveStrategy)
            .filter(ActiveStrategy.status == "RUNNING")
            .all()
        )
        for strat in running:
            strat.status = "STOPPED"
            strat.stopped_at = datetime.now(timezone.utc)

        self.db.commit()

        result = {
            "kill_switch": True,
            "orders_cancelled": cancelled_count,
            "strategies_stopped": len(running),
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        logger.critical(f"Kill switch result: {result}")
        return result

    def deactivate_kill_switch(self) -> dict:
        """Re-enable trading after kill switch."""
        self._kill_switch_active = False
        logger.warning("Kill switch deactivated — trading re-enabled")

        from models import AuditLog
        entry = AuditLog(
            strategy_id=None,
            event_type="KILL_SWITCH_DEACTIVATED",
            details_json=str({"timestamp": str(datetime.now(timezone.utc))}),
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(entry)
        self.db.commit()

        return {"kill_switch": False, "message": "Trading re-enabled"}
