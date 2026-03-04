import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


class PotType(str, enum.Enum):
    POT_L = "POT-L"
    POT_S = "POT-S"
    UNASSIGNED = "UNASSIGNED"


class InstrumentType(str, enum.Enum):
    FUTURES = "FUTURES"
    MICRO_FUTURES = "MICRO_FUTURES"


class StrategyStatus(str, enum.Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    STOPPED = "STOPPED"
    DISABLED = "DISABLED"


class TradeSide(str, enum.Enum):
    LONG = "LONG"
    SHORT = "SHORT"


class TradeStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class OrderDirection(str, enum.Enum):
    LONG = "LONG"
    SHORT = "SHORT"


# ── ORM Models ─────────────────────────────────────────────


class User(Base):
    """A user/owner who has broker credentials and owns trading accounts."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    static_ip = Column(String, nullable=True)       # Dedicated outbound IP for this user
    proxy_region = Column(String, nullable=True)     # Azure region (e.g. 'eastus')
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    credentials = relationship("BrokerCredential", back_populates="user", cascade="all, delete-orphan")


class BrokerCredential(Base):
    """Stores login credentials for a specific user + broker combination."""
    __tablename__ = "broker_credentials"
    __table_args__ = (
        UniqueConstraint("user_id", "broker", name="uq_user_broker"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    broker = Column(String, nullable=False)  # Apex, TakeProfitTrader, MFF, etc.
    login_id = Column(String, nullable=False, default="")
    password = Column(String, nullable=False, default="")
    is_active = Column(Boolean, default=True)
    error_message = Column(String, nullable=True)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="credentials")
    accounts = relationship("Account", back_populates="credential", cascade="all, delete-orphan")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    memberships = relationship("GroupMembership", back_populates="group", cascade="all, delete-orphan")
    group_orders = relationship("GroupOrder", back_populates="group")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    credential_id = Column(Integer, ForeignKey("broker_credentials.id", ondelete="CASCADE"), nullable=False)
    account_number = Column(String, default="")
    tradovate_account_id = Column(Integer, nullable=True)
    balance = Column(Float, default=0.0)
    peak_balance = Column(Float, nullable=True)      # Highest balance ever seen (our watermark)
    trailing_drawdown = Column(Float, nullable=True)  # Broker's trailing DD width (e.g. $2500)
    drawdown_limit = Column(Float, nullable=True)     # Computed: peak_balance - trailing_drawdown
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_updated_at = Column(DateTime, nullable=True)

    credential = relationship("BrokerCredential", back_populates="accounts")
    memberships = relationship("GroupMembership", back_populates="account")


class GroupMembership(Base):
    """Join table linking accounts to groups with a per-group pot assignment."""
    __tablename__ = "group_memberships"
    __table_args__ = (
        UniqueConstraint("group_id", "account_id", name="uq_group_account"),
    )

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    pot = Column(Enum(PotType), nullable=False)

    group = relationship("Group", back_populates="memberships")
    account = relationship("Account", back_populates="memberships")


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False, default="")
    instrument_type = Column(
        Enum(InstrumentType), default=InstrumentType.FUTURES
    )
    contract_month = Column(String, default="")
    lot_size = Column(Integer, default=1)
    tick_size = Column(Float, default=0.25)
    tick_value = Column(Float, default=12.50)
    margin = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ── Legacy GroupOrder (kept for backward compat) ───────────


class GroupOrder(Base):
    """Legacy strategy execution config — kept for existing data."""
    __tablename__ = "group_orders"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), nullable=False)
    direction = Column(Enum(OrderDirection), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    pot_l_profit_target = Column(Float, nullable=False, default=0)
    pot_l_stop_loss = Column(Float, nullable=False, default=0)
    pot_s_profit_target = Column(Float, nullable=False, default=0)
    pot_s_stop_loss = Column(Float, nullable=False, default=0)
    status = Column(Enum(StrategyStatus), default=StrategyStatus.IDLE)
    started_at = Column(DateTime, nullable=True)
    stopped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="group_orders")
    instrument = relationship("Instrument")


class Trade(Base):
    """Legacy trade record — kept for existing data."""
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), nullable=False)
    group_order_id = Column(Integer, ForeignKey("group_orders.id"), nullable=True)
    side = Column(Enum(TradeSide), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    entry_price = Column(Float, nullable=False)
    profit_target = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status = Column(Enum(TradeStatus), default=TradeStatus.OPEN)
    broker_order_id = Column(String, nullable=True)
    broker_status = Column(String, nullable=True)


# ═══════════════════════════════════════════════════════════
# NEW TABLES — Production Trading System
# ═══════════════════════════════════════════════════════════


class ActiveStrategy(Base):
    """
    A deployed strategy instance.
    Stores strategy type + JSON parameters so any algo can be deployed
    without schema changes.
    """
    __tablename__ = "active_strategies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, default="Unnamed")
    strategy_type = Column(String, nullable=False)  # "HEDGING", "GRID", etc.
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), nullable=True)
    parameters_json = Column(Text, default="{}")  # JSON blob for strategy config
    status = Column(String, default="IDLE")  # IDLE, RUNNING, PAUSED, STOPPED
    paper_mode = Column(Boolean, default=False)
    started_at = Column(DateTime, nullable=True)
    stopped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("Group")
    instrument = relationship("Instrument")

    def get_parameters(self) -> dict:
        import json
        try:
            return json.loads(self.parameters_json or "{}")
        except Exception:
            return {}

    def set_parameters(self, params: dict):
        import json
        self.parameters_json = json.dumps(params)


class OrderRecord(Base):
    """
    Production order tracking with state machine.
    Every order goes through: PENDING_NEW → ACCEPTED → FILLED/CANCELLED/REJECTED
    """
    __tablename__ = "order_records"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("active_strategies.id"), nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), nullable=False)
    side = Column(String, nullable=False)  # "Buy" or "Sell"
    quantity = Column(Integer, nullable=False, default=1)
    filled_quantity = Column(Integer, default=0)
    order_type = Column(String, default="Market")  # Market, Limit, Stop
    price = Column(Float, nullable=True)  # Limit/Stop price
    fill_price = Column(Float, nullable=True)  # Actual fill price
    state = Column(String, default="PENDING_NEW")
    broker_order_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)

    account = relationship("Account")
    instrument = relationship("Instrument")


class AuditLog(Base):
    """
    Immutable audit trail for every trading decision.
    Records: order state changes, strategy events, kill switch, errors.
    """
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("active_strategies.id"), nullable=True)
    event_type = Column(String, nullable=False)  # ORDER_PLACED, KILL_SWITCH, etc.
    details_json = Column(Text, default="{}")
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SystemAlert(Base):
    """
    Alerts for fills, errors, drawdown breaches, system failures.
    Future: integrate with SMS/email providers.
    """
    __tablename__ = "system_alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String, nullable=False)  # FILL, ERROR, DRAWDOWN, SYSTEM
    severity = Column(String, default="INFO")  # INFO, WARNING, CRITICAL
    title = Column(String, nullable=False)
    message = Column(Text, default="")
    strategy_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RequestLog(Base):
    """
    Logs all API requests outgoing and incoming for frontend visibility.
    """
    __tablename__ = "request_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    method = Column(String, nullable=False)
    url = Column(String, nullable=False)
    status_code = Column(Integer, nullable=True)
    request_payload = Column(Text, nullable=True)
    response_snippet = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
