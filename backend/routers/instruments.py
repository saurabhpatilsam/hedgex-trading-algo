from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Instrument
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
    Sync available instruments from the TV Bridge using the Redis bearer token.
    """
    from models import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        from services.tv_bridge_service import sync_instruments_from_bridge

        return sync_instruments_from_bridge(db)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
