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
    db.delete(account)
    db.commit()
    return None


# ── Bulk Operations ────────────────────────────────────────


@router.post("/flatten")
def flatten_accounts(payload: BulkAccountIds, db: Session = Depends(get_db)):
    """
    💀 FLATTEN selected accounts on the broker.
    Cancels all working orders + closes all open positions with opposing market orders.
    """
    import logging
    from required_api.tradovate_client import TradovateClient

    logger = logging.getLogger(__name__)

    accounts = (
        db.query(Account)
        .options(joinedload(Account.credential))
        .filter(Account.id.in_(payload.account_ids))
        .all()
    )

    if not accounts:
        raise HTTPException(status_code=404, detail="No matching accounts found")

    reports = []
    for account in accounts:
        cred = account.credential
        if not cred or not cred.is_active:
            reports.append({
                "account_id": account.id,
                "account": account.name,
                "error": "Credential inactive or missing",
            })
            continue

        if not account.tradovate_account_id:
            reports.append({
                "account_id": account.id,
                "account": account.name,
                "error": "Missing tradovate_account_id — sync first",
            })
            continue

        try:
            client = TradovateClient()
            token, error = client.login(cred.login_id, cred.password)
            if not token:
                reports.append({
                    "account_id": account.id,
                    "account": account.name,
                    "error": f"Login failed: {error}",
                })
                continue

            report = client.flatten_account(
                account_id=account.tradovate_account_id,
                account_spec=account.name,
            )
            report["account_id"] = account.id
            reports.append(report)
            logger.info(f"Flattened {account.name}")

        except Exception as e:
            reports.append({
                "account_id": account.id,
                "account": account.name,
                "error": str(e),
            })
            logger.error(f"Flatten failed for {account.name}: {e}")

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
    Refresh/sync balances for selected accounts only.
    """
    import logging
    from datetime import datetime, timezone
    from required_api.tradovate_client import TradovateClient

    logger = logging.getLogger(__name__)

    accounts = (
        db.query(Account)
        .options(joinedload(Account.credential))
        .filter(Account.id.in_(payload.account_ids))
        .all()
    )

    if not accounts:
        raise HTTPException(status_code=404, detail="No matching accounts found")

    # Group by credential to avoid re-login
    cred_groups = {}
    for account in accounts:
        cred_id = account.credential_id
        if cred_id not in cred_groups:
            cred_groups[cred_id] = {
                "credential": account.credential,
                "accounts": [],
            }
        cred_groups[cred_id]["accounts"].append(account)

    results = []
    for cred_id, group in cred_groups.items():
        cred = group["credential"]
        if not cred or not cred.is_active:
            for acct in group["accounts"]:
                results.append({"account_id": acct.id, "account": acct.name, "error": "Credential inactive"})
            continue

        try:
            client = TradovateClient()
            token, error = client.login(cred.login_id, cred.password)
            if not token:
                for acct in group["accounts"]:
                    results.append({"account_id": acct.id, "account": acct.name, "error": f"Login failed: {error}"})
                continue

            # Fetch all sub-accounts from broker
            broker_accounts = client.get_subaccounts()
            broker_map = {}
            for ba in broker_accounts:
                ba_name = ba.get("name", "")
                ba_balance = ba.get("balance", ba.get("cashBalance", 0))
                broker_map[ba_name] = ba

            for acct in group["accounts"]:
                ba = broker_map.get(acct.name)
                if ba:
                    acct.balance = ba.get("balance") or ba.get("cashBalance") or acct.balance
                    acct.last_updated_at = datetime.now(timezone.utc)
                    if not acct.tradovate_account_id and ba.get("id"):
                        acct.tradovate_account_id = ba["id"]
                    results.append({
                        "account_id": acct.id,
                        "account": acct.name,
                        "balance": acct.balance,
                        "status": "synced",
                    })
                else:
                    results.append({
                        "account_id": acct.id,
                        "account": acct.name,
                        "error": "Not found on broker",
                    })

        except Exception as e:
            for acct in group["accounts"]:
                results.append({"account_id": acct.id, "account": acct.name, "error": str(e)})

    db.commit()
    return {
        "synced": len([r for r in results if r.get("status") == "synced"]),
        "errors": len([r for r in results if r.get("error")]),
        "results": results,
    }

