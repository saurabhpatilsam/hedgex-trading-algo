from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Instrument, InstrumentType
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
        exchange=payload.exchange,
        instrument_type=InstrumentType(payload.instrument_type),
        contract_month=payload.contract_month,
        lot_size=payload.lot_size,
        tick_size=payload.tick_size,
        tick_value=payload.tick_value,
        margin=payload.margin,
        is_active=payload.is_active,
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
    if "instrument_type" in update_data:
        update_data["instrument_type"] = InstrumentType(
            update_data["instrument_type"]
        )

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
