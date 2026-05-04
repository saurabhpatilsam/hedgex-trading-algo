from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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


def _provision_vm_task(user_id: int):
    from database import SessionLocal
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return
            
        from services.azure_vm_manager import provision_windows_proxy_vm
        import secrets, string
        alphabet = string.ascii_letters + string.digits + "!@#$%"
        password = 'Hxd1!' + "".join(secrets.choice(alphabet) for _ in range(12))
        
        region = getattr(user, "proxy_region", "india") or "india"
        result = provision_windows_proxy_vm(user.name, "hxadmin", password, region)
        user.vm_ip = result["public_ip"]
        user.static_ip = result["public_ip"]
        user.proxy_url = result["proxy_url"]
        user.vm_username = result["admin_username"]
        user.vm_password = result["admin_password"]
        user.ip_allocation_error = None
        db.commit()
    except Exception as e:
        import logging
        logging.getLogger("users").error(f"VM provisioning failed: {e}")
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.ip_allocation_error = f"VM Setup Failed: {e}"
            db.commit()
    finally:
        db.close()


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(payload: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"User '{payload.name}' already exists")

    # If manual VM is provided, derive proxy_url from vm_ip
    proxy_url = payload.proxy_url
    if payload.vm_ip and not proxy_url:
        proxy_url = f"http://{payload.vm_ip}:9000"

    user = User(
        name=payload.name,
        proxy_region=payload.ip_region,
        proxy_url=proxy_url,
        vm_ip=payload.vm_ip,
        vm_username=payload.vm_username,
        vm_password=payload.vm_password,
    )

    # When a manual VM is provided, use the VM IP as the static_ip display value
    if payload.vm_ip:
        user.static_ip = payload.vm_ip

    db.add(user)
    db.commit()
    db.refresh(user)

    if payload.ip_region == "auto-vm":
        user.ip_allocation_error = "PROVISIONING"
        db.commit()
        db.refresh(user)
        background_tasks.add_task(_provision_vm_task, user.id)
    elif payload.ip_region and not payload.vm_ip:
        # Auto-create basic Azure static IP
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
            user.ip_allocation_error = str(e)

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

    # Manually delete dependent records to avoid Foreign Key violations
    # (since some tables like GroupMembership, Trade, OrderRecord lack ON DELETE CASCADE)
    account_ids = [acc.id for cred in user.credentials for acc in cred.accounts]
    if account_ids:
        from models import GroupMembership, Trade, OrderRecord
        db.query(GroupMembership).filter(GroupMembership.account_id.in_(account_ids)).delete(synchronize_session=False)
        db.query(Trade).filter(Trade.account_id.in_(account_ids)).delete(synchronize_session=False)
        db.query(OrderRecord).filter(OrderRecord.account_id.in_(account_ids)).delete(synchronize_session=False)

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

    error_message = None

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

    if payload.broker in ["Tradovate", "Apex"]:
        try:
            from services.tv_bridge_service import sync_credential_accounts_from_bridge

            sync_credential_accounts_from_bridge(db, cred)
            db.refresh(cred)
        except Exception as e:
            cred.error_message = _shorten_error(str(e))
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
    from datetime import datetime, timezone
    from services.tv_bridge_service import sync_credential_accounts_from_bridge
    
    if cred.broker not in ["Tradovate", "Apex"]:
        return False, "Broker not supported for sync"

    try:
        report = sync_credential_accounts_from_bridge(db, cred)
        return True, f"Successfully synced {report['synced']} sub-accounts."
    except Exception as e:
        cred.error_message = _shorten_error(str(e))
        cred.last_synced_at = datetime.now(timezone.utc)
        db.commit()
        return False, cred.error_message


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
