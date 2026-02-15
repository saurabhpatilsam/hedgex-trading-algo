import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from models import (
    Account,
    Group,
    GroupMembership,
    GroupOrder,
    Instrument,
    OrderDirection,
    PotType,
    StrategyStatus,
    Trade,
    TradeSide,
    TradeStatus,
)


class HedgingEngine:
    """
    Group-based hedging strategy engine.

    On execution:
      1. Fetches the GroupOrder config (instrument, direction, qty, PT/SL)
      2. Fetches POT-L and POT-S accounts via GroupMembership for this group
      3. Places opposite trades for each pot
      4. Sets PT/SL on each trade where:
         - By default POT-L profit_target = POT-S stop_loss
         - By default POT-L stop_loss = POT-S profit_target
         - But all four values can be customized
    """

    @staticmethod
    def validate_group(db: Session, group_id: int) -> dict:
        """Validate that a group has accounts in both pots via memberships."""
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            return {"valid": False, "errors": ["Group not found"]}

        memberships = (
            db.query(GroupMembership)
            .join(Account)
            .filter(
                GroupMembership.group_id == group_id,
                Account.is_active == True,
            )
            .all()
        )

        pot_l = [m for m in memberships if m.pot == PotType.POT_L]
        pot_s = [m for m in memberships if m.pot == PotType.POT_S]

        errors = []
        if len(pot_l) == 0:
            errors.append("No active POT-L accounts in this group")
        if len(pot_s) == 0:
            errors.append("No active POT-S accounts in this group")

        total = len(pot_l) + len(pot_s)
        if total > 0 and total % 2 != 0:
            errors.append(
                f"Total accounts ({total}) must be even. "
                f"POT-L: {len(pot_l)}, POT-S: {len(pot_s)}"
            )

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "pot_l_count": len(pot_l),
            "pot_s_count": len(pot_s),
            "group_name": group.name,
        }

    @staticmethod
    def start_group_order(db: Session, config: dict) -> GroupOrder:
        """Create and start a new GroupOrder."""
        # Default: POT-S PT = POT-L SL, POT-S SL = POT-L PT
        pot_s_pt = config.get("pot_s_profit_target")
        pot_s_sl = config.get("pot_s_stop_loss")

        if pot_s_pt is None:
            pot_s_pt = config["pot_l_stop_loss"]
        if pot_s_sl is None:
            pot_s_sl = config["pot_l_profit_target"]

        order = GroupOrder(
            group_id=config["group_id"],
            instrument_id=config["instrument_id"],
            direction=OrderDirection(config.get("direction", "LONG")),
            quantity=config.get("quantity", 1),
            pot_l_profit_target=config["pot_l_profit_target"],
            pot_l_stop_loss=config["pot_l_stop_loss"],
            pot_s_profit_target=pot_s_pt,
            pot_s_stop_loss=pot_s_sl,
            status=StrategyStatus.RUNNING,
            started_at=datetime.now(timezone.utc),
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def stop_group_order(db: Session, order_id: int) -> GroupOrder:
        """Stop an active GroupOrder."""
        order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
        if not order:
            raise ValueError("GroupOrder not found")
        order.status = StrategyStatus.STOPPED
        order.stopped_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def execute_group_order(db: Session, order_id: int) -> list[dict]:
        """
        Execute one hedge cycle for a GroupOrder:
        - POT-L accounts get the configured direction
        - POT-S accounts get the opposite direction
        - Each trade gets its pot-specific PT/SL
        - Accounts are resolved via GroupMembership (not via Account.pot)
        """
        order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
        if not order:
            raise ValueError("GroupOrder not found")

        group = db.query(Group).filter(Group.id == order.group_id).first()
        instrument = db.query(Instrument).filter(Instrument.id == order.instrument_id).first()

        if not group or not instrument:
            raise ValueError("Group or Instrument not found")

        # Get accounts from GroupMembership, NOT from Account.pot
        memberships = (
            db.query(GroupMembership)
            .options(joinedload(GroupMembership.account))
            .join(Account)
            .filter(
                GroupMembership.group_id == order.group_id,
                Account.is_active == True,
            )
            .all()
        )

        pot_l_accounts = [m.account for m in memberships if m.pot == PotType.POT_L]
        pot_s_accounts = [m.account for m in memberships if m.pot == PotType.POT_S]

        # Determine sides based on direction
        if order.direction == OrderDirection.LONG:
            pot_l_side = TradeSide.LONG
            pot_s_side = TradeSide.SHORT
        else:
            pot_l_side = TradeSide.SHORT
            pot_s_side = TradeSide.LONG

        trades_created = []
        now = datetime.now(timezone.utc)
        sim_price = round(random.uniform(100, 5000), 2)

        # Place trades for POT-L accounts
        for account in pot_l_accounts:
            trade = Trade(
                account_id=account.id,
                instrument_id=instrument.id,
                group_order_id=order.id,
                side=pot_l_side,
                quantity=order.quantity,
                entry_price=sim_price,
                profit_target=order.pot_l_profit_target,
                stop_loss=order.pot_l_stop_loss,
                timestamp=now,
                status=TradeStatus.OPEN,
            )
            db.add(trade)
            trades_created.append({
                "account": account.name,
                "instrument": instrument.symbol,
                "side": pot_l_side.value,
                "quantity": order.quantity,
                "price": sim_price,
                "profit_target": order.pot_l_profit_target,
                "stop_loss": order.pot_l_stop_loss,
            })

        # Place trades for POT-S accounts (opposite side)
        for account in pot_s_accounts:
            trade = Trade(
                account_id=account.id,
                instrument_id=instrument.id,
                group_order_id=order.id,
                side=pot_s_side,
                quantity=order.quantity,
                entry_price=sim_price,
                profit_target=order.pot_s_profit_target,
                stop_loss=order.pot_s_stop_loss,
                timestamp=now,
                status=TradeStatus.OPEN,
            )
            db.add(trade)
            trades_created.append({
                "account": account.name,
                "instrument": instrument.symbol,
                "side": pot_s_side.value,
                "quantity": order.quantity,
                "price": sim_price,
                "profit_target": order.pot_s_profit_target,
                "stop_loss": order.pot_s_stop_loss,
            })

        db.commit()
        return trades_created
