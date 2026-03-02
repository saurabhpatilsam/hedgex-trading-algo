"""
Alerting System — Records and retrieves system alerts.

Future: plug in SMS (Twilio) and email (SendGrid) providers.
For now, alerts are stored in the database and served via API.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def create_alert(
    db: Session,
    alert_type: str,
    title: str,
    message: str = "",
    severity: str = "INFO",
    strategy_id: Optional[int] = None,
):
    """Create a new system alert."""
    from models import SystemAlert

    alert = SystemAlert(
        alert_type=alert_type,
        severity=severity,
        title=title,
        message=message,
        strategy_id=strategy_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(alert)
    db.flush()

    icon = {"INFO": "ℹ️", "WARNING": "⚠️", "CRITICAL": "🚨"}.get(severity, "📌")
    logger.info(f"{icon} ALERT [{severity}] {title}: {message}")

    return alert


def get_alerts(
    db: Session,
    limit: int = 50,
    unread_only: bool = False,
    severity: Optional[str] = None,
) -> list:
    """Retrieve alerts from the database."""
    from models import SystemAlert

    query = db.query(SystemAlert)
    if unread_only:
        query = query.filter(SystemAlert.is_read == False)
    if severity:
        query = query.filter(SystemAlert.severity == severity)
    return query.order_by(SystemAlert.created_at.desc()).limit(limit).all()


def mark_read(db: Session, alert_id: int):
    """Mark an alert as read."""
    from models import SystemAlert
    alert = db.query(SystemAlert).filter(SystemAlert.id == alert_id).first()
    if alert:
        alert.is_read = True


def mark_all_read(db: Session):
    """Mark all alerts as read."""
    from models import SystemAlert
    db.query(SystemAlert).filter(SystemAlert.is_read == False).update({"is_read": True})
