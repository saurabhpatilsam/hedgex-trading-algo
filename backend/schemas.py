from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel


# ── Account Schemas ─────────────────────────────────────────


class AccountCreate(BaseModel):
    name: str
    credential_id: int
    account_number: str = ""
    is_active: bool = True


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_number: Optional[str] = None
    is_active: Optional[bool] = None


class AccountResponse(BaseModel):
    id: int
    name: str
    credential_id: int
    account_number: str
    balance: float = 0.0
    peak_balance: Optional[float] = None
    trailing_drawdown: Optional[float] = None
    drawdown_limit: Optional[float] = None
    is_active: bool
    created_at: datetime
    last_updated_at: Optional[datetime] = None
    owner: Optional[str] = None
    user_id: Optional[int] = None

    model_config = {"from_attributes": True}


# ── User Schemas ────────────────────────────────────────────


class BrokerCredentialCreate(BaseModel):
    broker: str  # "Apex", "TakeProfitTrader", "MFF", etc.
    login_id: str = ""
    password: str = ""
    is_active: bool = True


class BrokerCredentialUpdate(BaseModel):
    login_id: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class BrokerCredentialResponse(BaseModel):
    id: int
    broker: str
    login_id: str
    password: str  # masked in real production, shown for now
    is_active: bool
    error_message: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    accounts: List[AccountResponse] = []

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str
    ip_region: Optional[str] = None  # 'india' or 'uk' — triggers Azure IP creation


class UserUpdate(BaseModel):
    name: Optional[str] = None
    static_ip: Optional[str] = None
    proxy_region: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    name: str
    static_ip: Optional[str] = None
    proxy_region: Optional[str] = None
    created_at: datetime
    credentials: List[BrokerCredentialResponse] = []

    model_config = {"from_attributes": True}


class UserSummary(BaseModel):
    """Lightweight user response without credentials."""
    id: int
    name: str

    model_config = {"from_attributes": True}


# ── Instrument Schemas ──────────────────────────────────────


class InstrumentCreate(BaseModel):
    symbol: str
    name: str = ""


class InstrumentUpdate(BaseModel):
    symbol: Optional[str] = None
    name: Optional[str] = None


class InstrumentResponse(BaseModel):
    id: int
    symbol: str
    name: str

    model_config = {"from_attributes": True}


# ── Group Membership Schemas ────────────────────────────────


class GroupMembershipCreate(BaseModel):
    account_id: int
    pot: str  # "POT-L" or "POT-S"


class GroupMembershipResponse(BaseModel):
    id: int
    account_id: int
    account_name: str
    pot: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_membership(cls, membership):
        return cls(
            id=membership.id,
            account_id=membership.account_id,
            account_name=membership.account.name,
            pot=membership.pot.value if hasattr(membership.pot, "value") else membership.pot,
        )


# ── Group Schemas ───────────────────────────────────────────


class GroupCreate(BaseModel):
    name: str


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class GroupResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime
    members: List[GroupMembershipResponse] = []

    model_config = {"from_attributes": True}


# ── GroupOrder Schemas ──────────────────────────────────────


class GroupOrderCreate(BaseModel):
    group_id: int
    instrument_id: int
    direction: str = "LONG"  # POT-L direction
    quantity: int = 1
    pot_l_profit_target: float = 0
    pot_l_stop_loss: float = 0
    pot_s_profit_target: Optional[float] = None  # defaults to pot_l_stop_loss
    pot_s_stop_loss: Optional[float] = None       # defaults to pot_l_profit_target


class GroupOrderUpdate(BaseModel):
    direction: Optional[str] = None
    quantity: Optional[int] = None
    pot_l_profit_target: Optional[float] = None
    pot_l_stop_loss: Optional[float] = None
    pot_s_profit_target: Optional[float] = None
    pot_s_stop_loss: Optional[float] = None


class GroupOrderResponse(BaseModel):
    id: int
    group_id: int
    instrument_id: int
    direction: str
    quantity: int
    pot_l_profit_target: float
    pot_l_stop_loss: float
    pot_s_profit_target: float
    pot_s_stop_loss: float
    status: str
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Trade Schemas ───────────────────────────────────────────


class TradeResponse(BaseModel):
    id: int
    account_id: int
    instrument_id: int
    group_order_id: Optional[int] = None
    side: str
    quantity: int
    entry_price: float
    profit_target: Optional[float] = None
    stop_loss: Optional[float] = None
    timestamp: datetime
    status: str
    broker_order_id: Optional[str] = None
    broker_status: Optional[str] = None

    model_config = {"from_attributes": True}


# ── System / Network Log Schemas ───────────────────────────────────────────


class RequestLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    method: str
    url: str
    status_code: Optional[int] = None
    request_payload: Optional[str] = None
    response_snippet: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}
