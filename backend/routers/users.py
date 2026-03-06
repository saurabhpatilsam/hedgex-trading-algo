from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import User, BrokerCredential, Account
from schemas import (
    UserCreate, UserUpdate, UserResponse,
    BrokerCredentialCreate, BrokerCredentialUpdate, BrokerCredentialResponse,
)

router = APIRouter(prefix="/api/users", tags=["users"])


def _shorten_error(error: str) -> str:
    """Convert verbose broker errors into short, actionable messages."""
    if not error:
        return error
    e = error.lower()
    if "tradingview" in e and "entitled" in e:
        return "Login blocked: Account failed, inactive, or missing TV Add-On"
    if "incorrect username or password" in e:
        return "Invalid credentials — check login ID & password"
    if "timeout" in e or "timed out" in e:
        return "Connection timed out — try again later"
    if "connection" in e and ("refused" in e or "reset" in e):
        return "Broker server unreachable — try again later"
    if "rate limit" in e or "too many" in e:
        return "Too many requests — wait a moment and retry"
    if "not found" in e:
        return "Account not found on broker"
    # Shorten generic long messages to first 80 chars
    if len(error) > 80:
        return error[:77] + "..."
    return error


# ── User CRUD ───────────────────────────────────────────────


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    return (
        db.query(User)
        .options(joinedload(User.credentials).joinedload(BrokerCredential.accounts))
        .order_by(User.id)
        .all()
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .options(joinedload(User.credentials).joinedload(BrokerCredential.accounts))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"User '{payload.name}' already exists")

    user = User(name=payload.name, proxy_region=payload.ip_region)
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-create Azure static IP if region specified
    if payload.ip_region:
        try:
            from services.azure_ip_manager import create_static_ip
            result = create_static_ip(payload.name, payload.ip_region)
            user.static_ip = result["ip_address"]
            user.proxy_region = payload.ip_region
            db.commit()
            db.refresh(user)
        except Exception as e:
            import logging
            logging.getLogger("users").error(f"Azure IP creation failed: {e}")
            # User is created but IP assignment failed — can be retried

    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Clean up Azure IP if assigned
    if user.static_ip:
        try:
            from services.azure_ip_manager import delete_static_ip
            delete_static_ip(user.name)
        except Exception as e:
            import logging
            logging.getLogger("users").error(f"Azure IP cleanup failed: {e}")

    db.delete(user)
    db.commit()
    return None

@router.get("/logs/all")
def get_all_logs(limit: int = 100, db: Session = Depends(get_db)):
    """Fetch recent API requests across all users."""
    from models import RequestLog
    from schemas import RequestLogResponse
    logs = db.query(RequestLog).order_by(RequestLog.id.desc()).limit(limit).all()
    
    return [RequestLogResponse.model_validate(log) for log in logs]

# ── Broker Credentials ──────────────────────────────────────


@router.post("/{user_id}/credentials", response_model=BrokerCredentialResponse, status_code=201)
def add_credential(user_id: int, payload: BrokerCredentialCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Try to authenticate and fetch sub-accounts if applicable
    from required_api.tradovate_client import get_proxied_client
    
    fetched_accounts = []
    error_message = None
    if payload.broker in ["Tradovate", "Apex"]:  # Support both as they use same API usually
        client = get_proxied_client(user=user)
        token, error = client.login(payload.login_id, payload.password)
        if not token:
            error_message = _shorten_error(error)
        else:
            try:
                fetched_accounts = client.get_subaccounts()
            except Exception as e:
                error_message = _shorten_error(f"Failed to fetch sub-accounts: {str(e)}")

    existing = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.user_id == user_id, BrokerCredential.broker == payload.broker)
        .first()
    )
    
    if existing:
        # Update existing credential
        existing.login_id = payload.login_id
        existing.password = payload.password
        existing.is_active = payload.is_active
        existing.error_message = error_message
        cred = existing
    else:
        cred = BrokerCredential(
            user_id=user_id,
            broker=payload.broker,
            login_id=payload.login_id,
            password=payload.password,
            is_active=payload.is_active,
            error_message=error_message
        )
        db.add(cred)
    
    db.commit()
    db.refresh(cred)

    # Sync fetched accounts
    if fetched_accounts:
        # We should create new accounts or update existing ones
        # For simplicity, we add new ones. 
        # TODO: Handle removing old accounts? For now, let's just add/update.
        
        current_accounts = {acc.name: acc for acc in cred.accounts}
        
        for acc_data in fetched_accounts:
            name = acc_data.get("name")
            if not name:
                continue
            
            is_active = acc_data.get("active", True)
            
            # Get balance
            balance = 0.0
            tradovate_id = acc_data.get("tradovate_id")
            if tradovate_id:
                try:
                    state_info = client.get_account_balance(tradovate_id)
                    # Try to get balance or cashBalance or totalCashValue
                    balance = float(state_info.get("balance") or state_info.get("cashBalance") or state_info.get("totalCashValue") or 0.0)
                except Exception as e:
                    print(f"Error getting balance for {name}: {e}")

            if name in current_accounts:
                # Update existing
                current_accounts[name].is_active = is_active
                current_accounts[name].balance = balance
                from datetime import datetime, timezone
                current_accounts[name].last_updated_at = datetime.now(timezone.utc)
                # Update other fields if needed
            else:
                from datetime import datetime, timezone
                # Create new
                new_account = Account(
                    name=name,
                    credential_id=cred.id,
                    account_number=name, # Using name as number for now
                    is_active=is_active,
                    balance=balance,
                    last_updated_at=datetime.now(timezone.utc)
                )
                db.add(new_account)
        
        db.commit()
        db.refresh(cred)

    return cred


@router.put("/{user_id}/credentials/{cred_id}", response_model=BrokerCredentialResponse)
def update_credential(user_id: int, cred_id: int, payload: BrokerCredentialUpdate, db: Session = Depends(get_db)):
    cred = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.id == cred_id, BrokerCredential.user_id == user_id)
        .first()
    )
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cred, key, value)
    db.commit()
    db.refresh(cred)
    return cred


@router.delete("/{user_id}/credentials/{cred_id}", status_code=204)
def delete_credential(user_id: int, cred_id: int, db: Session = Depends(get_db)):
    cred = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.id == cred_id, BrokerCredential.user_id == user_id)
        .first()
    )
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.delete(cred)
    db.commit()
    return None


def _sync_single_credential(cred: BrokerCredential, db: Session):
    from required_api.tradovate_client import get_proxied_client
    from datetime import datetime, timezone
    
    if cred.broker not in ["Tradovate", "Apex"]:
        return False, "Broker not supported for sync"

    # Get the user for proxy routing
    user = db.query(User).filter(User.id == cred.user_id).first()
    client = get_proxied_client(user=user)
    token, error = client.login(cred.login_id, cred.password)
    if not token:
        cred.error_message = _shorten_error(error)
        cred.last_synced_at = datetime.now(timezone.utc)
        db.commit()
        return False, cred.error_message
    
    try:
        fetched_accounts = client.get_subaccounts()
        cred.error_message = None  # Clear error on success
    except Exception as e:
        cred.error_message = _shorten_error(f"Failed to fetch sub-accounts: {str(e)}")
        cred.last_synced_at = datetime.now(timezone.utc)
        db.commit()
        return False, cred.error_message

    # Build lookup maps for existing accounts (by name AND account_number)
    current_by_name = {acc.name: acc for acc in cred.accounts}
    current_by_number = {acc.account_number: acc for acc in cred.accounts if acc.account_number}
    
    # Fetch drawdown data from Tradovate (peak, width, drawdown_limit per account)
    # peak = maxNetLiq (highest balance ever), width = trailingMaxDrawdown
    # drawdown_limit = peak - width (the auto-liq threshold)
    dd_params = {}
    try:
        dd_params = client.get_drawdown_limits()
    except Exception:
        pass

    # Deduplicate fetched accounts by name (TV + Tradovate merge can return dupes)
    seen_names = set()
    unique_accounts = []
    for acc_data in fetched_accounts:
        name = acc_data.get("name")
        if name and name not in seen_names:
            seen_names.add(name)
            unique_accounts.append(acc_data)

    for acc_data in unique_accounts:
        name = acc_data.get("name")
        if not name:
            continue
        
        is_active = acc_data.get("active", True)
        balance = 0.0
        tradovate_id = acc_data.get("tradovate_id")
        
        if tradovate_id:
            try:
                state_info = client.get_account_balance(tradovate_id)
                balance = float(state_info.get("balance") or state_info.get("cashBalance") or state_info.get("totalCashValue") or 0.0)
            except Exception:
                pass

        # Get drawdown data for this account from Tradovate
        peak = None
        width = None
        dd_limit = None
        if tradovate_id and int(tradovate_id) in dd_params:
            params = dd_params[int(tradovate_id)]
            peak = params.get("peak")        # maxNetLiq from accountRiskStatus
            width = params.get("width")       # trailingMaxDrawdown from userAccountAutoLiq
            dd_limit = params.get("drawdown_limit")  # peak - width

        if name in current_by_name:
            acct = current_by_name[name]
        elif name in current_by_number:
            acct = current_by_number[name]
        else:
            acct = None

        if acct:
            acct.is_active = is_active
            acct.balance = balance
            acct.last_updated_at = datetime.now(timezone.utc)
            if tradovate_id:
                acct.tradovate_account_id = int(tradovate_id)
            
            # Update from Tradovate data
            if peak and peak > 0:
                acct.peak_balance = peak
            if width and width > 0:
                acct.trailing_drawdown = width
            if dd_limit and dd_limit > 0:
                acct.drawdown_limit = dd_limit
            
        else:
            new_account = Account(
                name=name,
                credential_id=cred.id,
                account_number=name,
                tradovate_account_id=int(tradovate_id) if tradovate_id else None,
                is_active=is_active,
                balance=balance,
                peak_balance=peak,
                trailing_drawdown=width,
                drawdown_limit=dd_limit,
                last_updated_at=datetime.now(timezone.utc)
            )
            db.add(new_account)
    
    cred.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return True, f"Successfully synced {len(unique_accounts)} sub-accounts."


@router.post("/{user_id}/credentials/{cred_id}/sync", status_code=200)
def sync_credential(user_id: int, cred_id: int, db: Session = Depends(get_db)):
    cred = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.id == cred_id, BrokerCredential.user_id == user_id)
        .first()
    )
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    success, message = _sync_single_credential(cred, db)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}


@router.post("/{user_id}/sync-all", status_code=200)
def sync_all_user_credentials(user_id: int, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .options(joinedload(User.credentials).joinedload(BrokerCredential.accounts))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sync_results = []
    for cred in user.credentials:
        # Only attempt to sync Tradovate/Apex for now
        if cred.broker in ["Tradovate", "Apex"]:
            try:
                success, msg = _sync_single_credential(cred, db)
                sync_results.append({"broker": cred.broker, "login_id": cred.login_id, "success": success, "message": msg})
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                sync_results.append({
                    "broker": cred.broker,
                    "login_id": cred.login_id,
                    "success": False,
                    "message": f"Exception: {str(e)}",
                    "traceback": tb
                })

    return {"message": "Sync complete", "results": sync_results}
