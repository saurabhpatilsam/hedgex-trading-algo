# Hedging Trading Algorithm

A full-stack hedging strategy platform that mirrors opposite positions across two "pots" of trading accounts.

- **POT-L** — All accounts in this pot take **LONG** positions
- **POT-S** — All accounts in this pot take **SHORT** positions

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Architecture
- **Backend**: Python 3 + FastAPI + SQLAlchemy (SQLite)
- **Frontend**: React 19 + Vite
- **Strategy Engine**: Simulated order execution with full trade logging
