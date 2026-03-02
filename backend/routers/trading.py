"""
Trading System API Router — Production endpoints for the automated trading system.

Endpoints:
  POST   /trading/strategies              — Deploy a new strategy
  GET    /trading/strategies              — List all strategies
  POST   /trading/strategies/{id}/start   — Start a strategy
  POST   /trading/strategies/{id}/stop    — Stop a strategy
  POST   /trading/strategies/{id}/execute — Manual execution trigger
  GET    /trading/orders                  — List all order records
  GET    /trading/positions               — Get portfolio positions
  GET    /trading/portfolio               — Get portfolio summary
  POST   /trading/kill-switch             — EMERGENCY: cancel all, flatten all
  POST   /trading/kill-switch/deactivate  — Re-enable trading
  GET    /trading/alerts                  — Get system alerts
  POST   /trading/alerts/{id}/read        — Mark alert as read
  GET    /trading/audit-log               — Get audit trail
  GET    /trading/reconcile/{account_id}  — Run reconciliation
  GET    /trading/runner/status           — Get runner status
  GET    /trading/strategy-types          — List available strategy types
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Account,
    ActiveStrategy,
    AuditLog,
    OrderRecord,
    SystemAlert,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trading", tags=["trading"])


# ── Pydantic Schemas ───────────────────────────────────────


class DeployStrategyRequest(BaseModel):
    name: str = "Unnamed Strategy"
    strategy_type: str
    group_id: Optional[int] = None
    instrument_id: Optional[int] = None
    parameters: dict = {}
    paper_mode: bool = False


class StrategyResponse(BaseModel):
    id: int
    name: str
    strategy_type: str
    group_id: Optional[int] = None
    instrument_id: Optional[int] = None
    parameters: dict = {}
    status: str
    paper_mode: bool
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_params(cls, obj):
        return cls(
            id=obj.id,
            name=obj.name,
            strategy_type=obj.strategy_type,
            group_id=obj.group_id,
            instrument_id=obj.instrument_id,
            parameters=obj.get_parameters(),
            status=obj.status,
            paper_mode=obj.paper_mode,
            started_at=obj.started_at,
            stopped_at=obj.stopped_at,
            created_at=obj.created_at,
        )


class OrderResponse(BaseModel):
    id: int
    strategy_id: Optional[int] = None
    account_id: int
    instrument_id: int
    side: str
    quantity: int
    filled_quantity: int
    order_type: str
    price: Optional[float] = None
    fill_price: Optional[float] = None
    state: str
    broker_order_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AlertResponse(BaseModel):
    id: int
    alert_type: str
    severity: str
    title: str
    message: str
    strategy_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: int
    strategy_id: Optional[int] = None
    event_type: str
    details_json: str
    timestamp: datetime

    model_config = {"from_attributes": True}


class KillSwitchRequest(BaseModel):
    reason: str = "Manual kill switch activation"


# ── Strategy Endpoints ─────────────────────────────────────


@router.get("/strategy-types")
def list_strategy_types():
    """List all available/registered strategy types."""
    from engine.registry import StrategyRegistry, auto_discover
    auto_discover()
    return StrategyRegistry.list_available()


@router.post("/strategies", response_model=StrategyResponse)
def deploy_strategy(payload: DeployStrategyRequest, db: Session = Depends(get_db)):
    """Deploy a new strategy instance."""
    from engine.registry import StrategyRegistry, auto_discover
    auto_discover()

    # Validate type exists
    if not StrategyRegistry.is_registered(payload.strategy_type):
        raise HTTPException(
            status_code=400,
            detail=f"Unknown strategy type: {payload.strategy_type}. "
                   f"Available: {[s['type'] for s in StrategyRegistry.list_available()]}",
        )

    strat = ActiveStrategy(
        name=payload.name,
        strategy_type=payload.strategy_type,
        group_id=payload.group_id,
        instrument_id=payload.instrument_id,
        status="IDLE",
        paper_mode=payload.paper_mode,
        created_at=datetime.now(timezone.utc),
    )
    strat.set_parameters(payload.parameters)
    db.add(strat)
    db.commit()
    db.refresh(strat)

    from engine.alerting import create_alert
    create_alert(
        db, "STRATEGY", f"Strategy deployed: {strat.name}",
        f"Type: {strat.strategy_type}, Paper: {strat.paper_mode}",
        severity="INFO", strategy_id=strat.id,
    )
    db.commit()

    return StrategyResponse.from_orm_with_params(strat)


@router.get("/strategies")
def list_strategies(db: Session = Depends(get_db)):
    """List all deployed strategies."""
    strategies = db.query(ActiveStrategy).order_by(ActiveStrategy.created_at.desc()).all()
    return [StrategyResponse.from_orm_with_params(s) for s in strategies]


@router.post("/strategies/{strategy_id}/start")
def start_strategy(strategy_id: int, db: Session = Depends(get_db)):
    """Start a deployed strategy — places initial orders."""
    from engine.registry import StrategyRegistry, auto_discover
    from engine.risk_manager import RiskManager

    auto_discover()

    strat = db.query(ActiveStrategy).filter(ActiveStrategy.id == strategy_id).first()
    if not strat:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strat.status == "RUNNING":
        raise HTTPException(status_code=400, detail="Strategy already running")

    # Check kill switch
    risk = RiskManager(db)
    if risk.is_killed:
        raise HTTPException(status_code=403, detail="Kill switch is active — cannot start")

    cls = StrategyRegistry.get(strat.strategy_type)
    config = strat.get_parameters()
    instance = cls(db=db, strategy_id=strat.id, config=config, paper_mode=strat.paper_mode)

    # Validate
    validation = instance.validate()
    if not validation.get("valid"):
        raise HTTPException(status_code=400, detail={"errors": validation.get("errors", [])})

    # Execute on_start
    strat.status = "RUNNING"
    strat.started_at = datetime.now(timezone.utc)
    strat.stopped_at = None

    try:
        results = instance.on_start()
        db.commit()

        from engine.alerting import create_alert
        create_alert(
            db, "STRATEGY", f"Strategy started: {strat.name}",
            f"{len(results)} orders placed",
            severity="INFO", strategy_id=strat.id,
        )
        db.commit()

        return {
            "strategy_id": strat.id,
            "status": "RUNNING",
            "orders_placed": len(results),
            "results": results,
        }
    except Exception as e:
        strat.status = "STOPPED"
        strat.stopped_at = datetime.now(timezone.utc)
        db.commit()
        logger.error(f"Strategy start failed: {e}")
        raise HTTPException(status_code=500, detail=f"Strategy start failed: {str(e)}")


@router.post("/strategies/{strategy_id}/stop")
def stop_strategy(strategy_id: int, db: Session = Depends(get_db)):
    """Stop a running strategy."""
    from engine.registry import StrategyRegistry, auto_discover
    auto_discover()

    strat = db.query(ActiveStrategy).filter(ActiveStrategy.id == strategy_id).first()
    if not strat:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strat.status not in ("RUNNING", "PAUSED"):
        raise HTTPException(status_code=400, detail="Strategy is not running")

    cls = StrategyRegistry.get(strat.strategy_type)
    config = strat.get_parameters()
    instance = cls(db=db, strategy_id=strat.id, config=config, paper_mode=strat.paper_mode)

    results = instance.on_stop()
    strat.status = "STOPPED"
    strat.stopped_at = datetime.now(timezone.utc)
    db.commit()

    from engine.alerting import create_alert
    create_alert(
        db, "STRATEGY", f"Strategy stopped: {strat.name}",
        severity="INFO", strategy_id=strat.id,
    )
    db.commit()

    return {"strategy_id": strat.id, "status": "STOPPED", "actions": results}


@router.post("/strategies/{strategy_id}/execute")
def execute_strategy(strategy_id: int, db: Session = Depends(get_db)):
    """Manually trigger one tick cycle for a strategy."""
    from engine.registry import StrategyRegistry, auto_discover
    auto_discover()

    strat = db.query(ActiveStrategy).filter(ActiveStrategy.id == strategy_id).first()
    if not strat:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if strat.status != "RUNNING":
        raise HTTPException(status_code=400, detail="Strategy must be running")

    cls = StrategyRegistry.get(strat.strategy_type)
    config = strat.get_parameters()
    instance = cls(db=db, strategy_id=strat.id, config=config, paper_mode=strat.paper_mode)

    market_data = {"timestamp": datetime.now(timezone.utc).isoformat()}
    actions = instance.on_tick(market_data)
    db.commit()

    return {"strategy_id": strat.id, "actions": actions}


# ── Order Endpoints ────────────────────────────────────────


@router.get("/orders", response_model=list[OrderResponse])
def list_orders(
    strategy_id: Optional[int] = None,
    state: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List order records with optional filters."""
    query = db.query(OrderRecord)
    if strategy_id:
        query = query.filter(OrderRecord.strategy_id == strategy_id)
    if state:
        query = query.filter(OrderRecord.state == state)
    return query.order_by(OrderRecord.created_at.desc()).limit(limit).all()


# ── Position & Portfolio ───────────────────────────────────


@router.get("/positions")
def get_positions(strategy_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Get current positions."""
    from engine.position_tracker import PositionTracker
    tracker = PositionTracker(db)
    return tracker.get_positions(strategy_id)


@router.get("/portfolio")
def get_portfolio(strategy_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Get portfolio summary with P&L."""
    from engine.position_tracker import PositionTracker
    tracker = PositionTracker(db)
    return tracker.get_portfolio_summary(strategy_id)


# ── Kill Switch (KILL THEM ALL) ────────────────────────────


@router.post("/kill-switch")
def activate_kill_switch(payload: KillSwitchRequest, db: Session = Depends(get_db)):
    """
    🚨 KILL THEM ALL — Nuclear shutdown.
    1. Stop all running strategies in DB
    2. Cancel all open order records in DB
    3. Login to every broker account and:
       a. Cancel all working orders on broker
       b. Close all open positions with opposing market orders
    """
    from engine.risk_manager import RiskManager
    from engine.alerting import create_alert
    from models import BrokerCredential
    from required_api.tradovate_client import TradovateClient
    from sqlalchemy.orm import joinedload

    risk = RiskManager(db)

    # Step 1+2: Internal DB cleanup (stops strategies, cancels order records)
    internal_result = risk.activate_kill_switch(payload.reason)

    # Step 3: Flatten ALL broker accounts
    flatten_reports = []
    accounts = (
        db.query(Account)
        .options(joinedload(Account.credential))
        .filter(Account.is_active == True, Account.tradovate_account_id.isnot(None))
        .all()
    )

    for account in accounts:
        cred = account.credential
        if not cred or not cred.is_active:
            continue

        try:
            client = TradovateClient()
            token, error = client.login(cred.login_id, cred.password)
            if not token:
                flatten_reports.append({
                    "account": account.name,
                    "error": f"Login failed: {error}",
                })
                continue

            report = client.flatten_account(
                account_id=account.tradovate_account_id,
                account_spec=account.name,
            )
            flatten_reports.append(report)
            logger.info(f"Flattened account {account.name}: {report}")

        except Exception as e:
            flatten_reports.append({
                "account": account.name,
                "error": str(e),
            })
            logger.error(f"Failed to flatten {account.name}: {e}")

    # Create alert with full report
    total_cancelled = sum(len(r.get("orders_cancelled", [])) for r in flatten_reports)
    total_flattened = sum(len(r.get("positions_flattened", [])) for r in flatten_reports)

    create_alert(
        db, "SYSTEM", "🚨 KILL THEM ALL EXECUTED",
        f"Reason: {payload.reason}. "
        f"Strategies stopped: {internal_result['strategies_stopped']}. "
        f"Broker orders cancelled: {total_cancelled}. "
        f"Positions flattened: {total_flattened}. "
        f"Accounts processed: {len(flatten_reports)}.",
        severity="CRITICAL",
    )
    db.commit()

    return {
        **internal_result,
        "broker_flatten_reports": flatten_reports,
        "total_broker_orders_cancelled": total_cancelled,
        "total_positions_flattened": total_flattened,
    }


@router.post("/kill-switch/deactivate")
def deactivate_kill_switch(db: Session = Depends(get_db)):
    """Re-enable trading after kill switch."""
    from engine.risk_manager import RiskManager
    risk = RiskManager(db)
    return risk.deactivate_kill_switch()


# ── Alerts ─────────────────────────────────────────────────


@router.get("/alerts", response_model=list[AlertResponse])
def get_alerts(
    limit: int = 50,
    unread_only: bool = False,
    severity: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get system alerts."""
    from engine.alerting import get_alerts as _get_alerts
    return _get_alerts(db, limit, unread_only, severity)


@router.post("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    """Mark an alert as read."""
    from engine.alerting import mark_read
    mark_read(db, alert_id)
    db.commit()
    return {"ok": True}


@router.post("/alerts/read-all")
def mark_all_alerts_read(db: Session = Depends(get_db)):
    """Mark all alerts as read."""
    from engine.alerting import mark_all_read
    mark_all_read(db)
    db.commit()
    return {"ok": True}


# ── Audit Log ──────────────────────────────────────────────


@router.get("/audit-log", response_model=list[AuditLogResponse])
def get_audit_log(
    strategy_id: Optional[int] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Get audit trail entries."""
    query = db.query(AuditLog)
    if strategy_id:
        query = query.filter(AuditLog.strategy_id == strategy_id)
    if event_type:
        query = query.filter(AuditLog.event_type == event_type)
    return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()


# ── Reconciliation ─────────────────────────────────────────


@router.get("/reconcile/{account_id}")
def reconcile_account(account_id: int, db: Session = Depends(get_db)):
    """Run reconciliation for a specific account."""
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    from engine.reconciliation import ReconciliationEngine
    engine = ReconciliationEngine(db)
    report = engine.reconcile_positions(account)
    db.commit()
    return report


# ── Runner Status ──────────────────────────────────────────


@router.get("/runner/status")
def runner_status():
    """Get background runner status."""
    from engine.runner import get_runner_status
    return get_runner_status()
