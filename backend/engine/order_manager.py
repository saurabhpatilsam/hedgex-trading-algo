"""
OrderManager — State machine for tracking every order from creation to fill.

Order States:
    PENDING_NEW  → sent to broker, awaiting acknowledgment
    ACCEPTED     → broker acknowledged, waiting for fill
    PARTIALLY_FILLED → some quantity filled
    FILLED       → fully filled
    CANCELLED    → cancelled by us or broker
    REJECTED     → broker rejected the order
    FAILED       → internal error during placement

Every state transition is logged to the AuditLog table.
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class OrderState(str, Enum):
    PENDING_NEW = "PENDING_NEW"
    ACCEPTED = "ACCEPTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"


# Valid state transitions
VALID_TRANSITIONS = {
    OrderState.PENDING_NEW: {OrderState.ACCEPTED, OrderState.REJECTED, OrderState.FAILED, OrderState.CANCELLED},
    OrderState.ACCEPTED: {OrderState.PARTIALLY_FILLED, OrderState.FILLED, OrderState.CANCELLED},
    OrderState.PARTIALLY_FILLED: {OrderState.FILLED, OrderState.CANCELLED},
    OrderState.FILLED: set(),       # Terminal
    OrderState.CANCELLED: set(),    # Terminal
    OrderState.REJECTED: set(),     # Terminal
    OrderState.FAILED: set(),       # Terminal
}


class OrderManager:
    """
    Manages the lifecycle of orders with state machine logic.
    Tracks every order from creation to fill/cancel/reject.
    """

    def __init__(self, db: Session):
        self.db = db

    def create_order(
        self,
        strategy_id: int,
        account_id: int,
        instrument_id: int,
        side: str,
        quantity: int,
        order_type: str = "Market",
        price: Optional[float] = None,
    ) -> "OrderRecord":
        """Create a new order record in PENDING_NEW state."""
        from models import OrderRecord

        order = OrderRecord(
            strategy_id=strategy_id,
            account_id=account_id,
            instrument_id=instrument_id,
            side=side,
            quantity=quantity,
            filled_quantity=0,
            order_type=order_type,
            price=price,
            state=OrderState.PENDING_NEW.value,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(order)
        self.db.flush()  # Get the ID without committing

        self._log_transition(order.id, None, OrderState.PENDING_NEW, "Order created")
        return order

    def transition(
        self,
        order_id: int,
        new_state: OrderState,
        broker_order_id: Optional[str] = None,
        fill_price: Optional[float] = None,
        filled_qty: Optional[int] = None,
        reason: str = "",
    ) -> "OrderRecord":
        """
        Transition an order to a new state.
        Validates the transition is legal per the state machine.
        """
        from models import OrderRecord

        order = self.db.query(OrderRecord).filter(OrderRecord.id == order_id).first()
        if not order:
            raise ValueError(f"Order {order_id} not found")

        current = OrderState(order.state)

        if new_state not in VALID_TRANSITIONS.get(current, set()):
            raise ValueError(
                f"Invalid transition: {current.value} → {new_state.value}. "
                f"Valid: {[s.value for s in VALID_TRANSITIONS.get(current, set())]}"
            )

        old_state = current
        order.state = new_state.value
        order.updated_at = datetime.now(timezone.utc)

        if broker_order_id:
            order.broker_order_id = broker_order_id
        if fill_price is not None:
            order.fill_price = fill_price
        if filled_qty is not None:
            order.filled_quantity = filled_qty
        if new_state in (OrderState.FILLED, OrderState.CANCELLED, OrderState.REJECTED, OrderState.FAILED):
            order.closed_at = datetime.now(timezone.utc)

        self._log_transition(order_id, old_state, new_state, reason)
        logger.info(f"Order {order_id}: {old_state.value} → {new_state.value} ({reason})")
        return order

    def get_open_orders(self, strategy_id: Optional[int] = None) -> list:
        """Get all orders that are not in a terminal state."""
        from models import OrderRecord

        query = self.db.query(OrderRecord).filter(
            OrderRecord.state.in_([
                OrderState.PENDING_NEW.value,
                OrderState.ACCEPTED.value,
                OrderState.PARTIALLY_FILLED.value,
            ])
        )
        if strategy_id:
            query = query.filter(OrderRecord.strategy_id == strategy_id)
        return query.all()

    def cancel_all_orders(self, strategy_id: Optional[int] = None) -> int:
        """Cancel all open orders. Returns count cancelled."""
        open_orders = self.get_open_orders(strategy_id)
        count = 0
        for order in open_orders:
            try:
                self.transition(order.id, OrderState.CANCELLED, reason="Bulk cancel")
                count += 1
            except ValueError:
                pass
        return count

    def _log_transition(self, order_id: int, old_state, new_state, reason: str):
        """Record state transition in audit log."""
        from models import AuditLog
        entry = AuditLog(
            strategy_id=None,
            event_type="ORDER_STATE_CHANGE",
            details_json=str({
                "order_id": order_id,
                "from": old_state.value if old_state else None,
                "to": new_state.value,
                "reason": reason,
            }),
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(entry)
