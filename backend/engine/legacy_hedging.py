import logging
import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from models import (
    Account,
    BrokerCredential,
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
from required_api.tradovate_client import get_proxied_client

logger = logging.getLogger(__name__)


class HedgingEngine:
    """
    Group-based hedging strategy engine.

    On execution:
      1. Fetches the GroupOrder config (instrument, direction, qty, PT/SL)
      2. Fetches POT-L and POT-S accounts via GroupMembership for this group
      3. Logs into Tradovate for each account's credential
      4. Places opposite market orders for each pot via Tradovate API
      5. Records Trade entries with broker order IDs
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
    def _login_for_account(db: Session, account: Account) -> tuple:
        """
        Login to Tradovate for a specific account's credential.
        Routes through the user's dedicated proxy IP.
        Returns (client, error_message).
        """
        from models import User

        cred = (
            db.query(BrokerCredential)
            .filter(BrokerCredential.id == account.credential_id)
            .first()
        )
        if not cred:
            return None, f"No credential found for account {account.name}"

        # Route through user's dedicated IP
        user = db.query(User).filter(User.id == cred.user_id).first()
        client = get_proxied_client(user=user)
        token, error = client.login(cred.login_id, cred.password)
        if not token:
            return None, f"Login failed for {account.name}: {error}"

        return client, None

    @staticmethod
    def execute_group_order(db: Session, order_id: int) -> list[dict]:
        """
        Execute one hedge cycle for a GroupOrder:
        - POT-L accounts get the configured direction
        - POT-S accounts get the opposite direction
        - Each trade gets its pot-specific PT/SL
        - Orders are placed via real Tradovate API calls
        """
        order = db.query(GroupOrder).filter(GroupOrder.id == order_id).first()
        if not order:
            raise ValueError("GroupOrder not found")

        group = db.query(Group).filter(Group.id == order.group_id).first()
        instrument = db.query(Instrument).filter(Instrument.id == order.instrument_id).first()

        if not group or not instrument:
            raise ValueError("Group or Instrument not found")

        # The contract symbol to trade (e.g., "MNQH6")
        contract_symbol = instrument.contract_month if instrument.contract_month else instrument.symbol

        # Get accounts from GroupMembership
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

        # Cache clients per credential to avoid re-login
        client_cache = {}

        def get_client_for_account(account):
            cred_id = account.credential_id
            if cred_id in client_cache:
                return client_cache[cred_id], None
            client, err = HedgingEngine._login_for_account(db, account)
            if client:
                client_cache[cred_id] = client
            return client, err

        def place_and_record(account, side, profit_target, stop_loss):
            """Place order on Tradovate and record the trade."""
            action = "Buy" if side == TradeSide.LONG else "Sell"
            broker_order_id = None
            broker_status = None
            entry_price = 0.0
            error_msg = None

            client, login_error = get_client_for_account(account)

            if login_error:
                error_msg = login_error
                broker_status = f"LOGIN_FAILED: {login_error}"
                logger.error(f"Cannot place order for {account.name}: {login_error}")
            elif not account.tradovate_account_id:
                error_msg = f"Missing tradovate_account_id for {account.name}"
                broker_status = "MISSING_ACCOUNT_ID"
                logger.error(error_msg)
            else:
                try:
                    result = client.place_order(
                        account_id=account.tradovate_account_id,
                        account_spec=account.name,
                        symbol=contract_symbol,
                        action=action,
                        qty=order.quantity,
                    )
                    # Extract order details from response
                    order_info = result.get("orderId") or result.get("id")
                    broker_order_id = str(order_info) if order_info else str(result)
                    broker_status = result.get("ordStatus", "Submitted")
                    entry_price = float(result.get("avgPx", 0) or result.get("price", 0) or 0)
                    logger.info(
                        f"Order placed: {action} {order.quantity}x {contract_symbol} "
                        f"on {account.name} → orderID={broker_order_id}"
                    )
                except Exception as e:
                    error_msg = str(e)
                    broker_status = f"ERROR: {error_msg}"
                    logger.error(f"Order placement failed for {account.name}: {e}")

            # Record the trade regardless (with error info if failed)
            trade = Trade(
                account_id=account.id,
                instrument_id=instrument.id,
                group_order_id=order.id,
                side=side,
                quantity=order.quantity,
                entry_price=entry_price,
                profit_target=profit_target,
                stop_loss=stop_loss,
                timestamp=now,
                status=TradeStatus.OPEN if not error_msg else TradeStatus.CANCELLED,
                broker_order_id=broker_order_id,
                broker_status=broker_status,
            )
            db.add(trade)

            return {
                "account": account.name,
                "instrument": contract_symbol,
                "side": side.value,
                "quantity": order.quantity,
                "price": entry_price,
                "profit_target": profit_target,
                "stop_loss": stop_loss,
                "broker_order_id": broker_order_id,
                "broker_status": broker_status,
                "error": error_msg,
            }

        # Place trades for POT-L accounts
        for account in pot_l_accounts:
            result = place_and_record(
                account, pot_l_side,
                order.pot_l_profit_target, order.pot_l_stop_loss
            )
            trades_created.append(result)

        # Place trades for POT-S accounts (opposite side)
        for account in pot_s_accounts:
            result = place_and_record(
                account, pot_s_side,
                order.pot_s_profit_target, order.pot_s_stop_loss
            )
            trades_created.append(result)

        db.commit()
        return trades_created

