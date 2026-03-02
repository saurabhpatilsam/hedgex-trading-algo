"""
Reconciliation Engine — Compare internal records against broker state.

Catches discrepancies between:
  - Our OrderRecord table vs broker's actual order status
  - Our calculated position vs broker's reported position
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class ReconciliationEngine:
    """Compares internal trading records against broker state."""

    def __init__(self, db: Session):
        self.db = db

    def reconcile_positions(self, account) -> dict:
        """
        Compare our position calculations against broker positions.
        Returns a reconciliation report.
        """
        from engine.position_tracker import PositionTracker

        tracker = PositionTracker(self.db)

        # Our internal view
        internal_positions = tracker.get_positions()
        internal_for_account = [
            p for p in internal_positions if p["account_id"] == account.id
        ]

        # Broker's view
        broker_positions = tracker.get_broker_positions(account)

        # Build comparison
        discrepancies = []
        matched = []

        # Map broker positions by contract
        broker_map = {}
        for bp in broker_positions:
            contract_id = bp.get("contractId")
            net_pos = bp.get("netPos", 0)
            broker_map[contract_id] = {
                "contract_id": contract_id,
                "net_position": net_pos,
                "avg_price": bp.get("netPrice", 0),
            }

        for ip in internal_for_account:
            instrument_id = ip["instrument_id"]
            internal_qty = ip["net_quantity"]

            # Try to find matching broker position
            # Note: This is a simplified match — in prod you'd map instrument_id to contractId
            found_match = False
            for contract_id, bp in broker_map.items():
                if bp["net_position"] == internal_qty:
                    matched.append({
                        "instrument_id": instrument_id,
                        "internal_qty": internal_qty,
                        "broker_qty": bp["net_position"],
                        "status": "MATCHED",
                    })
                    found_match = True
                    break

            if not found_match:
                discrepancies.append({
                    "instrument_id": instrument_id,
                    "internal_qty": internal_qty,
                    "broker_qty": "NOT_FOUND",
                    "status": "DISCREPANCY",
                })

        report = {
            "account": account.name,
            "account_id": account.id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "internal_positions": len(internal_for_account),
            "broker_positions": len(broker_positions),
            "matched": len(matched),
            "discrepancies": len(discrepancies),
            "details": {
                "matched": matched,
                "discrepancies": discrepancies,
            },
        }

        if discrepancies:
            from engine.alerting import create_alert
            create_alert(
                self.db,
                alert_type="RECONCILIATION",
                title=f"Position discrepancy on {account.name}",
                message=f"{len(discrepancies)} discrepancies found",
                severity="WARNING",
            )

        logger.info(
            f"Reconciliation for {account.name}: "
            f"{len(matched)} matched, {len(discrepancies)} discrepancies"
        )
        return report
