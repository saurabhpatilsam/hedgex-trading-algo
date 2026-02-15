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
    owner = Column(String, nullable=False, default="")
    broker = Column(String, nullable=False, default="Apex")
    platform = Column(String, nullable=False, default="Tradovate")
    account_number = Column(String, default="")
    api_key = Column(String, default="")
    api_secret = Column(String, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    memberships = relationship("GroupMembership", back_populates="account")


class GroupMembership(Base):
    """
    Join table linking accounts to groups with a per-group pot assignment.
    The same account can belong to multiple groups with different (or same) pots.
    """
    __tablename__ = "group_memberships"
    __table_args__ = (
        UniqueConstraint("group_id", "account_id", name="uq_group_account"),
    )

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    pot = Column(Enum(PotType), nullable=False)  # POT-L or POT-S for THIS group

    group = relationship("Group", back_populates="memberships")
    account = relationship("Account", back_populates="memberships")


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, nullable=False, unique=True)
    exchange = Column(String, nullable=False, default="CME")
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


class GroupOrder(Base):
    """
    Represents a strategy execution configuration for a group.
    When a user starts a strategy, they create a GroupOrder which
    defines the instrument, direction, quantity, PT/SL for each pot.
    """
    __tablename__ = "group_orders"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), nullable=False)
    direction = Column(Enum(OrderDirection), nullable=False)  # POT-L direction
    quantity = Column(Integer, nullable=False, default=1)
    pot_l_profit_target = Column(Float, nullable=False, default=0)  # ticks
    pot_l_stop_loss = Column(Float, nullable=False, default=0)      # ticks
    pot_s_profit_target = Column(Float, nullable=False, default=0)  # ticks
    pot_s_stop_loss = Column(Float, nullable=False, default=0)      # ticks
    status = Column(Enum(StrategyStatus), default=StrategyStatus.IDLE)
    started_at = Column(DateTime, nullable=True)
    stopped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="group_orders")
    instrument = relationship("Instrument")


class Trade(Base):
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
