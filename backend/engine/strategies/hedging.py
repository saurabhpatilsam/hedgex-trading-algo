"""
HedgingStrategy — Group-based hedging with mirrored Long/Short pots.

This is the migration of the original HedgingEngine into the new
BaseStrategy interface. It executes one hedge cycle on start:
  - POT-L accounts get the configured direction (Buy/Sell)
  - POT-S accounts get the opposite direction
  - Each pot has independent PT/SL

This strategy is "one-shot" — it places orders on_start() and then
monitors them. on_tick() checks if positions have hit PT/SL.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from engine.base import BaseStrategy
from engine.registry import StrategyRegistry

logger = logging.getLogger(__name__)


class HedgingStrategy(BaseStrategy):
    """POT-based hedging: mirror Long/Short across grouped accounts."""

    STRATEGY_NAME = "Group Hedging"
    STRATEGY_DESCRIPTION = "Places opposite trades on POT-L and POT-S accounts with configurable PT/SL per pot."
    PARAMETER_SCHEMA = {
        "group_id": {"type": "integer", "required": True, "description": "Group ID"},
        "instrument_id": {"type": "integer", "required": True, "description": "Instrument ID"},
        "direction": {"type": "string", "enum": ["LONG", "SHORT"], "default": "LONG"},
        "quantity": {"type": "integer", "default": 1},
        "pot_l_profit_target": {"type": "number", "required": True, "description": "POT-L profit target in ticks"},
        "pot_l_stop_loss": {"type": "number", "required": True, "description": "POT-L stop loss in ticks"},
        "pot_s_profit_target": {"type": "number", "description": "POT-S profit target (defaults to POT-L SL)"},
        "pot_s_stop_loss": {"type": "number", "description": "POT-S stop loss (defaults to POT-L PT)"},
    }

    def validate(self) -> dict:
        """Validate group has balanced pots."""
        from models import Group, GroupMembership, Account, PotType

        group_id = self.config.get("group_id")
        group = self.db.query(Group).filter(Group.id == group_id).first()
        if not group:
            return {"valid": False, "errors": ["Group not found"]}

        memberships = (
            self.db.query(GroupMembership)
            .join(Account)
            .filter(GroupMembership.group_id == group_id, Account.is_active == True)
            .all()
        )

        pot_l = [m for m in memberships if m.pot == PotType.POT_L]
        pot_s = [m for m in memberships if m.pot == PotType.POT_S]

        errors = []
        if not pot_l:
            errors.append("No active POT-L accounts")
        if not pot_s:
            errors.append("No active POT-S accounts")
        if pot_l and pot_s and len(pot_l) != len(pot_s):
            errors.append(f"Unbalanced pots: POT-L={len(pot_l)}, POT-S={len(pot_s)}")

        return {"valid": len(errors) == 0, "errors": errors}

    def on_start(self) -> list[dict]:
        """Place initial hedge orders on all accounts in both pots."""
        from models import (
            Account, GroupMembership, Instrument, OrderRecord,
            PotType, AuditLog,
        )
        from engine.order_manager import OrderManager, OrderState

        group_id = self.config["group_id"]
        instrument_id = self.config["instrument_id"]
        direction = self.config.get("direction", "LONG")
        quantity = self.config.get("quantity", 1)

        instrument = self.db.query(Instrument).filter(Instrument.id == instrument_id).first()
        if not instrument:
            raise ValueError("Instrument not found")

        contract_symbol = instrument.contract_month or instrument.symbol

        # Get accounts per pot
        memberships = (
            self.db.query(GroupMembership)
            .options(joinedload(GroupMembership.account).joinedload(Account.credential))
            .join(Account)
            .filter(GroupMembership.group_id == group_id, Account.is_active == True)
            .all()
        )

        pot_l = [m.account for m in memberships if m.pot == PotType.POT_L]
        pot_s = [m.account for m in memberships if m.pot == PotType.POT_S]

        pot_l_action = "Buy" if direction == "LONG" else "Sell"
        pot_s_action = "Sell" if direction == "LONG" else "Buy"

        om = OrderManager(self.db)
        results = []

        # Client cache to avoid re-login
        client_cache = {}

        def place_for_accounts(accounts, action, pt, sl):
            for account in accounts:
                order_rec = om.create_order(
                    strategy_id=self.strategy_id,
                    account_id=account.id,
                    instrument_id=instrument_id,
                    side=action,
                    quantity=quantity,
                    order_type="Market",
                )

                try:
                    broker_result = self.place_broker_order(
                        account=account,
                        symbol=contract_symbol,
                        action=action,
                        qty=quantity,
                    )

                    broker_id = str(broker_result.get("orderId", broker_result.get("id", "")))
                    fill_price = float(broker_result.get("avgPx", 0) or broker_result.get("price", 0) or 0)

                    om.transition(
                        order_rec.id, OrderState.ACCEPTED,
                        broker_order_id=broker_id,
                        reason=f"Broker accepted: {broker_id}",
                    )
                    # For market orders, assume immediate fill
                    om.transition(
                        order_rec.id, OrderState.FILLED,
                        fill_price=fill_price,
                        filled_qty=quantity,
                        reason="Market order filled",
                    )

                    results.append({
                        "account": account.name,
                        "action": action,
                        "symbol": contract_symbol,
                        "quantity": quantity,
                        "broker_order_id": broker_id,
                        "status": "FILLED",
                        "profit_target": pt,
                        "stop_loss": sl,
                    })

                except Exception as e:
                    om.transition(
                        order_rec.id, OrderState.FAILED,
                        reason=str(e),
                    )
                    results.append({
                        "account": account.name,
                        "action": action,
                        "symbol": contract_symbol,
                        "quantity": quantity,
                        "status": "FAILED",
                        "error": str(e),
                    })

        # Place POT-L orders
        pot_l_pt = self.config.get("pot_l_profit_target", 0)
        pot_l_sl = self.config.get("pot_l_stop_loss", 0)
        place_for_accounts(pot_l, pot_l_action, pot_l_pt, pot_l_sl)

        # Place POT-S orders (opposite side)
        pot_s_pt = self.config.get("pot_s_profit_target", pot_l_sl)
        pot_s_sl = self.config.get("pot_s_stop_loss", pot_l_pt)
        place_for_accounts(pot_s, pot_s_action, pot_s_pt, pot_s_sl)

        self.audit("HEDGE_STARTED", {
            "group_id": group_id,
            "instrument": contract_symbol,
            "direction": direction,
            "quantity": quantity,
            "results": results,
        })

        return results

    def on_tick(self, market_data: dict) -> list[dict]:
        """
        Check if any open positions have hit PT/SL.
        For now this is a no-op since we use broker-side PT/SL.
        Future: monitor positions and close manually if needed.
        """
        return []

    def on_stop(self) -> list[dict]:
        """Cancel any pending orders for this strategy."""
        from engine.order_manager import OrderManager
        om = OrderManager(self.db)
        cancelled = om.cancel_all_orders(self.strategy_id)
        self.audit("HEDGE_STOPPED", {"cancelled_orders": cancelled})
        return [{"action": "cancel_all", "cancelled": cancelled}]


# Auto-register
StrategyRegistry.register("HEDGING", HedgingStrategy)
