from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Instrument, BrokerCredential, InstrumentType
from schemas import InstrumentCreate, InstrumentResponse, InstrumentUpdate

router = APIRouter(prefix="/api/instruments", tags=["instruments"])


@router.get("/", response_model=list[InstrumentResponse])
def list_instruments(db: Session = Depends(get_db)):
    return db.query(Instrument).order_by(Instrument.id).all()


@router.get("/{instrument_id}", response_model=InstrumentResponse)
def get_instrument(instrument_id: int, db: Session = Depends(get_db)):
    inst = db.query(Instrument).filter(Instrument.id == instrument_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")
    return inst


@router.post("/", response_model=InstrumentResponse, status_code=201)
def create_instrument(
    payload: InstrumentCreate, db: Session = Depends(get_db)
):
    # Check duplicate symbol
    existing = (
        db.query(Instrument)
        .filter(Instrument.symbol == payload.symbol)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Instrument '{payload.symbol}' already exists",
        )

    instrument = Instrument(
        symbol=payload.symbol,
        name=payload.name,
    )
    db.add(instrument)
    db.commit()
    db.refresh(instrument)
    return instrument


@router.put("/{instrument_id}", response_model=InstrumentResponse)
def update_instrument(
    instrument_id: int,
    payload: InstrumentUpdate,
    db: Session = Depends(get_db),
):
    inst = db.query(Instrument).filter(Instrument.id == instrument_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(inst, key, value)

    db.commit()
    db.refresh(inst)
    return inst


@router.delete("/{instrument_id}", status_code=204)
def delete_instrument(instrument_id: int, db: Session = Depends(get_db)):
    inst = db.query(Instrument).filter(Instrument.id == instrument_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")
    db.delete(inst)
    db.commit()
    return None


@router.post("/sync", status_code=200)
def sync_instruments(user_id: int, db: Session = Depends(get_db)):
    """
    Given a user ID, finds a valid Tradovate credential, authenticates, 
    and fetches the latest active contracts for predefined popular symbols.
    """
    from required_api.tradovate_client import TradovateClient
    
    cred = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.user_id == user_id, BrokerCredential.broker.in_(["Tradovate", "Apex"]))
        .first()
    )
    if not cred:
        raise HTTPException(status_code=400, detail="User has no valid Tradovate/Apex credentials to sync instruments from.")
        
    client = TradovateClient()
    token, error = client.login(cred.login_id, cred.password)
    if not token:
        raise HTTPException(status_code=400, detail=f"Failed to login to Tradovate: {error}")
        
    symbols_to_sync = ["NQ", "MNQ", "ES", "MES", "GC", "MGC"]
    synced_count = 0
    updated_count = 0
    
    for base_symbol in symbols_to_sync:
        # Get the top suggested contract for the base symbol
        suggestions = client.search_contracts(base_symbol, limit=1)
        if not suggestions:
            continue
            
        contract_name = suggestions[0].get("name")
        if not contract_name:
            continue
            
        # Check if we already have this base instrument
        existing = db.query(Instrument).filter(Instrument.symbol == base_symbol).first()
        is_micro = base_symbol.startswith("M")
        inst_type = InstrumentType.MICRO_FUTURES if is_micro else InstrumentType.FUTURES
            
        if existing:
            # Update the contract month if it changed
            if existing.contract_month != contract_name:
                existing.contract_month = contract_name
                updated_count += 1
        else:
            # Create a new instrument
            new_inst = Instrument(
                symbol=base_symbol,
                name=f"{base_symbol} Futures",
                instrument_type=inst_type,
                contract_month=contract_name,
                is_active=True
            )
            db.add(new_inst)
            synced_count += 1
            
    db.commit()
    return {
        "message": f"Instrument sync complete. Added {synced_count} new, updated {updated_count} existing.",
        "added": synced_count,
        "updated": updated_count
    }
