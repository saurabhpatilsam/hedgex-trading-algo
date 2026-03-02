"""
SQLAlchemy models for bot management.
"""
from datetime import datetime
from sqlalchemy import (
    Column, String, Float, Integer, DateTime, JSON,
    ForeignKey, Index, Boolean, Text
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

Base = declarative_base()


class Bot(Base):
    """Bot metadata and last-known state."""
    
    __tablename__ = "bots"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    bot_id = Column(String(100), unique=True, nullable=False, index=True)
    custom_name = Column(String(255), nullable=True)
    instrument = Column(String(50), nullable=False)
    account_name = Column(String(100), nullable=False)
    accounts_ids = Column(Text, nullable=True)  # JSON string of account IDs
    status = Column(String(20), nullable=False, default="initializing")
    
    # Timestamps
    start_time = Column(DateTime(timezone=True), nullable=False, default=func.now())
    last_health_check = Column(DateTime(timezone=True), nullable=False, default=func.now())
    stopped_at = Column(DateTime(timezone=True), nullable=True)
    
    # Trading metrics
    total_pnl = Column(Float, default=0.0)
    open_positions = Column(Integer, default=0)
    closed_positions = Column(Integer, default=0)
    active_orders = Column(Integer, default=0)
    won_orders = Column(Integer, default=0)
    lost_orders = Column(Integer, default=0)
    
    # Configuration
    config = Column(JSON, nullable=True)  # Store full run config
    
    # Tracking
    created_by = Column(String(100), nullable=False, default="system")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    actions = relationship("BotAction", back_populates="bot", cascade="all, delete-orphan")
    metrics = relationship("BotMetric", back_populates="bot", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index("idx_bot_status", "status"),
        Index("idx_bot_account", "account_name"),
        Index("idx_bot_instrument", "instrument"),
        Index("idx_bot_start_time", "start_time"),
    )
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            "id": self.id,
            "bot_id": self.bot_id,
            "custom_name": self.custom_name,
            "instrument": self.instrument,
            "account_name": self.account_name,
            "accounts_ids": self.accounts_ids,
            "status": self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "last_health_check": self.last_health_check.isoformat() if self.last_health_check else None,
            "stopped_at": self.stopped_at.isoformat() if self.stopped_at else None,
            "total_pnl": self.total_pnl,
            "open_positions": self.open_positions,
            "closed_positions": self.closed_positions,
            "active_orders": self.active_orders,
            "won_orders": self.won_orders,
            "lost_orders": self.lost_orders,
            "config": self.config,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class BotAction(Base):
    """Log of all bot actions and control events."""
    
    __tablename__ = "bot_actions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    bot_id = Column(String(100), ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False)
    action_type = Column(String(50), nullable=False)  # pause, stop, clear, start, etc.
    performed_by = Column(String(100), nullable=False, default="system")
    timestamp = Column(DateTime(timezone=True), nullable=False, default=func.now())
    details = Column(JSON, nullable=True)  # Additional metadata
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    
    # Relationships
    bot = relationship("Bot", back_populates="actions")
    
    # Indexes
    __table_args__ = (
        Index("idx_action_bot_id", "bot_id"),
        Index("idx_action_type", "action_type"),
        Index("idx_action_timestamp", "timestamp"),
        Index("idx_action_performed_by", "performed_by"),
    )
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            "id": self.id,
            "bot_id": self.bot_id,
            "action_type": self.action_type,
            "performed_by": self.performed_by,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "details": self.details,
            "success": self.success,
            "error_message": self.error_message,
        }


class BotMetric(Base):
    """Historical snapshots of bot metrics."""
    
    __tablename__ = "bot_metrics"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    bot_id = Column(String(100), ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=func.now())
    
    # Snapshot metrics
    total_pnl = Column(Float, default=0.0)
    open_positions = Column(Integer, default=0)
    closed_positions = Column(Integer, default=0)
    active_orders = Column(Integer, default=0)
    won_orders = Column(Integer, default=0)
    lost_orders = Column(Integer, default=0)
    
    # Additional metrics
    win_rate = Column(Float, nullable=True)  # Percentage
    avg_win = Column(Float, nullable=True)
    avg_loss = Column(Float, nullable=True)
    sharpe_ratio = Column(Float, nullable=True)
    max_drawdown = Column(Float, nullable=True)
    
    # Relationships
    bot = relationship("Bot", back_populates="metrics")
    
    # Indexes
    __table_args__ = (
        Index("idx_metric_bot_id", "bot_id"),
        Index("idx_metric_timestamp", "timestamp"),
    )
    
    def to_dict(self):
        """Convert to dictionary."""
        return {
            "id": self.id,
            "bot_id": self.bot_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "total_pnl": self.total_pnl,
            "open_positions": self.open_positions,
            "closed_positions": self.closed_positions,
            "active_orders": self.active_orders,
            "won_orders": self.won_orders,
            "lost_orders": self.lost_orders,
            "win_rate": self.win_rate,
            "avg_win": self.avg_win,
            "avg_loss": self.avg_loss,
            "sharpe_ratio": self.sharpe_ratio,
            "max_drawdown": self.max_drawdown,
        }
