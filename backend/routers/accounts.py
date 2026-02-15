from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Account
from schemas import AccountCreate, AccountResponse, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("/", response_model=list[AccountResponse])
def list_accounts(db: Session = Depends(get_db)):
    return db.query(Account).order_by(Account.id).all()


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("/", response_model=AccountResponse, status_code=201)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    account = Account(
        name=payload.name,
        owner=payload.owner,
        broker=payload.broker,
        platform=payload.platform,
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
