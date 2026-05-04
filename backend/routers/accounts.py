from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Account, BrokerCredential
from schemas import AccountCreate, AccountResponse, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


# ── Bulk action schemas ────────────────────────────────────

class BulkAccountIds(BaseModel):
    account_ids: List[int]


# ── CRUD ───────────────────────────────────────────────────

@router.get("/")
def list_accounts(db: Session = Depends(get_db)):
    accounts = (
        db.query(Account)
        .options(joinedload(Account.credential).joinedload(BrokerCredential.user))
        .order_by(Account.id)
        .all()
    )
    result = []
    for a in accounts:
        resp = AccountResponse.model_validate(a)
        if a.credential and a.credential.user:
            resp.owner = a.credential.user.name
            resp.user_id = a.credential.user.id
        result.append(resp)
    return result


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("/", response_model=AccountResponse, status_code=201)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    cred = db.query(BrokerCredential).filter(BrokerCredential.id == payload.credential_id).first()
    if not cred:
        raise HTTPException(status_code=400, detail="Broker credential not found")

    account = Account(
        name=payload.name,
        credential_id=payload.credential_id,
        account_number=payload.account_number,
        is_active=payload.is_active,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int, payload: AccountUpdate, db: Session = Depends(get_db)
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(account, key, value)

    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    # Remove from any groups first
    from models import GroupMembership
    db.query(GroupMembership).filter(GroupMembership.account_id == account_id).delete()
    db.delete(account)
    db.commit()
    return None


@router.post("/bulk-delete")
def bulk_delete_accounts(payload: BulkAccountIds, db: Session = Depends(get_db)):
    """Delete multiple sub-accounts at once."""
    from models import GroupMembership
    accounts = db.query(Account).filter(Account.id.in_(payload.account_ids)).all()
    if not accounts:
        raise HTTPException(status_code=404, detail="No accounts found")
    deleted_count = 0
    for acct in accounts:
        db.query(GroupMembership).filter(GroupMembership.account_id == acct.id).delete()
        db.delete(acct)
        deleted_count += 1
    db.commit()
    return {"deleted": deleted_count}


# ── Bulk Operations ────────────────────────────────────────


@router.post("/flatten")
def flatten_accounts(payload: BulkAccountIds, db: Session = Depends(get_db)):
    """
    Flatten selected accounts through TV Bridge.
    """
    import logging
    from services.tv_bridge_service import flatten_accounts

    logger = logging.getLogger(__name__)

    accounts = (
        db.query(Account)
        .options(joinedload(Account.credential))
        .filter(Account.id.in_(payload.account_ids))
        .all()
    )

    if not accounts:
        raise HTTPException(status_code=404, detail="No matching accounts found")

    try:
        reports = flatten_accounts(db, accounts)
    except Exception as e:
        logger.error(f"Flatten failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

    total_cancelled = sum(len(r.get("orders_cancelled", [])) for r in reports)
    total_flattened = sum(len(r.get("positions_flattened", [])) for r in reports)
    total_errors = sum(1 for r in reports if r.get("error"))

    # Create alert
    from engine.alerting import create_alert
    create_alert(
        db, "SYSTEM",
        f"💀 Flatten executed on {len(accounts)} account(s)",
        f"Orders cancelled: {total_cancelled}, Positions flattened: {total_flattened}, Errors: {total_errors}",
        severity="CRITICAL" if total_flattened > 0 or total_cancelled > 0 else "INFO",
    )
    db.commit()

    return {
        "accounts_processed": len(accounts),
        "total_orders_cancelled": total_cancelled,
        "total_positions_flattened": total_flattened,
        "total_errors": total_errors,
        "reports": reports,
    }


@router.post("/sync")
def sync_selected_accounts(payload: BulkAccountIds, db: Session = Depends(get_db)):
    """
    Refresh/sync balances and TV Bridge account IDs for selected accounts only.
    """
    import logging
    from datetime import datetime, timezone
    from services.tv_bridge_service import sync_accounts_from_bridge

    logger = logging.getLogger(__name__)

    accounts = (
        db.query(Account)
        .options(joinedload(Account.credential))
        .filter(Account.id.in_(payload.account_ids))
        .all()
    )

    if not accounts:
        raise HTTPException(status_code=404, detail="No matching accounts found")

    try:
        return sync_accounts_from_bridge(db, accounts)
    except Exception as e:
        logger.error(f"Account sync failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))
