import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hedging.db")

# SQLite needs check_same_thread=False; PostgreSQL uses connection pooling
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,      # Reconnect stale connections
        pool_size=3,              # Keep low — Supabase Session mode has hard client limit
        max_overflow=2,           # Minimal burst — total max = pool_size + max_overflow = 5 per worker
        pool_recycle=300,         # Recycle connections every 5 minutes
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

