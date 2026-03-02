"""
Pydantic schemas for bot management API.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum


class BotStatus(str, Enum):
    """Bot status enum."""
    INITIALIZING = "initializing"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"


class ActionType(str, Enum):
    """Bot action type enum."""
    START = "start"
    PAUSE = "pause"
    STOP = "stop"
    RESUME = "resume"
    CLEAR_ORDERS = "clear_orders"
    CLEAR_POSITIONS = "clear_positions"
    CLEAR_ALL = "clear_all"
    UPDATE_CONFIG = "update_config"
    HEALTH_CHECK = "health_check"
    ARCHIVE = "archive"
    UNARCHIVE = "unarchive"
    RESTART = "restart"


class ArchiveReason(str, Enum):
    """Archive reason enum."""
    ERROR = "error"
    MANUAL = "manual"
    STOPPED = "stopped"
    PERFORMANCE = "performance"
    USER_REQUEST = "user_request"


# Request Schemas
class BotControlRequest(BaseModel):
    """Request for bot control actions."""
    performed_by: str = Field(..., description="User/admin who triggered the action")
    reason: Optional[str] = Field(None, description="Reason for the action")
    force: bool = Field(False, description="Force the action even if risky")


class BotCreateRequest(BaseModel):
    """Request to create a new bot."""
    instrument: str = Field(..., description="Trading instrument")
    account_name: str = Field(..., description="Account name")
    accounts_ids: Optional[str] = Field(None, description="Account IDs JSON string")
    custom_name: Optional[str] = Field(None, description="Custom name for the bot")
    config: Optional[Dict[str, Any]] = Field(None, description="Bot configuration")


# Response Schemas
class BotStateResponse(BaseModel):
    """Bot state response from Redis/DB."""
    bot_id: str
    custom_name: Optional[str] = None
    status: BotStatus
    instrument: str
    account_name: str
    accounts_ids: Optional[str] = None
    start_time: datetime
    last_health_check: datetime
    stopped_at: Optional[datetime] = None
    
    # Trading metrics
    total_pnl: float = 0.0
    open_positions: int = 0
    closed_positions: int = 0
    active_orders: int = 0
    won_orders: int = 0
    lost_orders: int = 0
    
    # Performance metrics
    win_rate: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    max_drawdown: Optional[float] = None
    
    # Source of data
    data_source: str = Field("redis", description="redis or database")
    
    model_config = ConfigDict(from_attributes=True)


class BotActionResponse(BaseModel):
    """Bot action response."""
    id: int
    bot_id: str
    action_type: str
    performed_by: str
    timestamp: datetime
    details: Optional[Dict[str, Any]] = None
    success: bool = True
    error_message: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class BotMetricResponse(BaseModel):
    """Bot metric snapshot response."""
    id: int
    bot_id: str
    timestamp: datetime
    total_pnl: float
    open_positions: int
    closed_positions: int
    active_orders: int
    won_orders: int
    lost_orders: int
    win_rate: Optional[float] = None
    avg_win: Optional[float] = None
    avg_loss: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    max_drawdown: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)


class BotListResponse(BaseModel):
    """List of bots response."""
    bots: List[BotStateResponse]
    total: int
    active: int
    paused: int
    stopped: int
    error: int
    timestamp: Optional[datetime] = None


class BotDetailResponse(BaseModel):
    """Detailed bot information response."""
    bot: BotStateResponse
    recent_actions: List[BotActionResponse]
    recent_metrics: List[BotMetricResponse]
    config: Optional[Dict[str, Any]] = None


class ControlActionResponse(BaseModel):
    """Response for control actions."""
    success: bool
    message: str
    bot_id: str
    action: str
    new_status: Optional[BotStatus] = None
    details: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class HealthCheckResponse(BaseModel):
    """Health check response."""
    redis_connected: bool
    database_connected: bool
    total_bots: int
    active_bots: int
    timestamp: datetime


# Archive Schemas
class ArchiveBotRequest(BaseModel):
    """Request to archive a bot."""
    reason: ArchiveReason = Field(..., description="Reason for archiving")
    archived_by: str = Field("user", description="Who archived the bot")


class ArchivedBotResponse(BaseModel):
    """Archived bot response."""
    bot_id: str
    bot_type: str = "orcamax"
    custom_name: Optional[str] = None
    status: str
    instrument: str
    account_name: str
    accounts_ids: Optional[str] = None
    
    # Archive metadata
    archived_at: datetime
    archived_by: str
    archive_reason: str
    final_pnl: float
    total_runtime: int
    
    # Timestamps
    start_time: datetime
    last_health_check: datetime
    stopped_at: Optional[datetime] = None
    
    # Trading metrics
    closed_positions: int = 0
    open_positions: int = 0
    active_orders: int = 0
    won_orders: int = 0
    lost_orders: int = 0
    
    # Performance metrics
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    max_drawdown: Optional[float] = None
    
    # Configuration
    config: Optional[Dict[str, Any]] = None
    fibonacci_levels: Optional[Dict[str, Any]] = None
    trading_window_active: bool = False
    threshold_reached: bool = False
    
    model_config = ConfigDict(from_attributes=True)


class ArchiveSuccessResponse(BaseModel):
    """Response for successful archive operation."""
    success: bool = True
    message: str
    archived_bot: ArchivedBotResponse


class ArchivedBotsListResponse(BaseModel):
    """List of archived bots response."""
    success: bool = True
    bots: List[ArchivedBotResponse]
    total: int
    timestamp: datetime


# Restart Schemas
class RestartBotRequest(BaseModel):
    """Request to restart a bot with configuration."""
    bot_id: str = Field(..., description="Original bot ID to restart from")
    config: Dict[str, Any] = Field(..., description="Bot configuration")
    bot_type: str = Field("orcamax", description="Type of bot")
    modified: bool = Field(False, description="Whether config was modified")


class RestartBotResponse(BaseModel):
    """Response for bot restart."""
    success: bool = True
    message: str
    bot_id: str
    config: Dict[str, Any]


# Bot Details Schemas
class BotDetailsRequest(BaseModel):
    """Request parameters for bot details."""
    include_history: bool = Field(False, description="Include trade history")
    include_logs: bool = Field(False, description="Include execution logs")
    history_limit: int = Field(100, description="Limit historical records")


class TradeRecord(BaseModel):
    """Individual trade record."""
    trade_id: str
    timestamp: datetime
    type: str  # 'long' or 'short'
    entry_price: float
    exit_price: float
    quantity: int
    pnl: float
    duration_seconds: int
    exit_reason: str


class LogRecord(BaseModel):
    """Execution log record."""
    timestamp: datetime
    level: str
    message: str
    context: Optional[Dict[str, Any]] = None


class BotDetailsResponse(BaseModel):
    """Comprehensive bot details response."""
    success: bool = True
    bot: BotStateResponse
    
    # Additional metrics
    daily_pnl: Optional[float] = None
    profit_factor: Optional[float] = None
    avg_win: Optional[float] = None
    avg_loss: Optional[float] = None
    largest_win: Optional[float] = None
    largest_loss: Optional[float] = None
    avg_trade_duration_minutes: Optional[int] = None
    total_commission: Optional[float] = None
    net_pnl: Optional[float] = None
    uptime_seconds: Optional[int] = None
    
    # Archive info (if archived)
    is_archived: bool = False
    archived_at: Optional[datetime] = None
    archived_by: Optional[str] = None
    archive_reason: Optional[str] = None
    
    # State information
    fibonacci_levels: Optional[Dict[str, Any]] = None
    trading_window_active: bool = False
    threshold_reached: bool = False
    
    # History (if requested)
    recent_trades: Optional[List[TradeRecord]] = None
    recent_logs: Optional[List[LogRecord]] = None
    
    # System info
    health_status: str = "healthy"
    last_error: Optional[str] = None
    error_count: int = 0
    restart_count: int = 0
    version: Optional[str] = None


# Configuration Library Schemas
class BotConfigurationRequest(BaseModel):
    """Request to save a bot configuration."""
    name: str = Field(..., description="Configuration name")
    description: Optional[str] = Field(None, description="Configuration description")
    bot_type: str = Field("orcamax", description="Bot type")
    config: Dict[str, Any] = Field(..., description="Bot configuration")
    tags: Optional[List[str]] = Field(None, description="Tags for categorization")
    is_template: bool = Field(False, description="Is this a shareable template")
    is_shared: bool = Field(False, description="Share with other users")


class BotConfigurationResponse(BaseModel):
    """Response for bot configuration."""
    id: int
    config_id: str
    name: str
    description: Optional[str] = None
    bot_type: str
    config: Dict[str, Any]
    
    # Metadata
    tags: Optional[List[str]] = None
    created_by: str
    is_template: bool = False
    is_shared: bool = False
    is_favorite: bool = False
    status: str = "active"
    
    # Usage statistics
    times_used: int = 0
    last_used: Optional[datetime] = None
    
    # Performance
    success_rate: Optional[float] = None
    total_pnl: Optional[float] = None
    performance_metrics: Optional[Dict[str, Any]] = None
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class BotConfigurationsListResponse(BaseModel):
    """List of bot configurations response."""
    success: bool = True
    configurations: List[BotConfigurationResponse]
    total: int
    timestamp: datetime


class SaveConfigurationResponse(BaseModel):
    """Response for saving a configuration."""
    success: bool = True
    message: str
    configuration_id: str


# Delete Response
class DeleteBotResponse(BaseModel):
    """Response for deleting a bot."""
    success: bool = True
    message: str
    deleted_bot_id: str
