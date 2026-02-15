from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Account Schemas ─────────────────────────────────────────


class AccountCreate(BaseModel):
    name: str
    owner: str = ""
    broker: str = "Apex"
    platform: str = "Tradovate"
    account_number: str = ""
    is_active: bool = True


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    owner: Optional[str] = None
    broker: Optional[str] = None
    platform: Optional[str] = None
    account_number: Optional[str] = None
    is_active: Optional[bool] = None


class AccountResponse(BaseModel):
    id: int
    name: str
    owner: str
    broker: str
    platform: str
    account_number: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Instrument Schemas ──────────────────────────────────────


class InstrumentCreate(BaseModel):
    symbol: str
    exchange: str = "CME"
    instrument_type: str = "FUTURES"
    contract_month: str = ""
    lot_size: int = 1
    tick_size: float = 0.25
    tick_value: float = 12.50
    margin: float = 0.0
    is_active: bool = True


class InstrumentUpdate(BaseModel):
    symbol: Optional[str] = None
    exchange: Optional[str] = None
    instrument_type: Optional[str] = None
    contract_month: Optional[str] = None
    lot_size: Optional[int] = None
    tick_size: Optional[float] = None
    tick_value: Optional[float] = None
    margin: Optional[float] = None
    is_active: Optional[bool] = None


class InstrumentResponse(BaseModel):
    id: int
    symbol: str
    exchange: str
    instrument_type: str
    contract_month: str
    lot_size: int
    tick_size: float
    tick_value: float
    margin: float
    is_active: bool
    created_at: datetime

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
    members: list[GroupMembershipResponse] = []

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

    model_config = {"from_attributes": True}
