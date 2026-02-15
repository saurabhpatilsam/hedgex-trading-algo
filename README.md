# ⚖️ HedgeX — POT-Based Hedging Trading Algorithm

> A full-stack trading management system for executing **hedged positions** across multiple prop firm accounts using a POT-L / POT-S (Long/Short) architecture.

Built with **FastAPI** (Python) + **React** (Vite) · SQLite · Drag-and-Drop UI

---

## 📖 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Backend API](#backend-api)
- [Frontend UI](#frontend-ui)
- [Core Concepts](#core-concepts)
- [Tech Stack](#tech-stack)
- [Screenshots](#screenshots)

---

## Overview

HedgeX is designed for **prop firm traders** who manage multiple funded accounts (e.g., Apex, Topstep, MyFundedFutures) and need to execute **hedged trades** — taking opposite positions across accounts to manage risk.

### Key Features

- **Account Management** — CRUD for prop accounts, grouped by owner/user with status toggles
- **Group-Based Architecture** — Accounts are organized into trading groups with POT-L (Long) and POT-S (Short) zones
- **Drag-and-Drop Assignment** — Drag accounts into POT-L / POT-S zones, move between pots, Save/Discard changes
- **Instrument Configuration** — Configure futures contracts (ES, NQ, CL, etc.) with tick size, tick value, margin
- **Strategy Lifecycle** — Full state machine: Start → Run → Pause → Resume → Stop → Disable → Enable
- **Hedged Execution** — One click executes mirrored trades: POT-L goes LONG → POT-S automatically goes SHORT
- **PT/SL Mirroring** — Profit Target and Stop Loss can be mirrored between pots or set independently

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                    FRONTEND                    │
│            React + Vite (Port 5173)           │
│                                               │
│  ┌────────────┐ ┌──────────┐ ┌─────────────┐ │
│  │  Accounts  │ │  Groups  │ │ Instruments │ │
│  │  Manager   │ │ Manager  │ │   Manager   │ │
│  └────────────┘ └──────────┘ └─────────────┘ │
│  ┌────────────────────────────────────────┐   │
│  │          Strategy Panel                │   │
│  │  Start / Stop / Pause / Execute        │   │
│  └────────────────────────────────────────┘   │
└──────────────────┬───────────────────────────┘
                   │ REST API (JSON)
┌──────────────────┴───────────────────────────┐
│                    BACKEND                     │
│          FastAPI + SQLAlchemy (Port 8000)      │
│                                               │
│  Routers: accounts, groups, instruments,      │
│           strategy                            │
│  Engine:  HedgingEngine (validate, execute)   │
│  DB:      SQLite (hedging.db, auto-created)   │
└───────────────────────────────────────────────┘
```

---

## Project Structure

```
Hedging-Algo-by-Antigravity/
├── README.md                    # This file
├── .gitignore
│
├── backend/                     # FastAPI Python backend
│   ├── main.py                  # App entry point, CORS, router mounts
│   ├── database.py              # SQLAlchemy engine + session setup
│   ├── models.py                # ORM models (Account, Group, GroupMembership, etc.)
│   ├── schemas.py               # Pydantic request/response schemas
│   ├── engine.py                # HedgingEngine — trade execution logic
│   ├── requirements.txt         # Python dependencies
│   └── routers/
│       ├── __init__.py
│       ├── accounts.py          # CRUD for trading accounts
│       ├── groups.py            # CRUD for groups + member management
│       ├── instruments.py       # CRUD for futures instruments
│       └── strategy.py          # Strategy lifecycle + trade execution
│
└── frontend/                    # React + Vite frontend
    ├── index.html               # HTML entry point
    ├── package.json             # Node.js dependencies
    ├── vite.config.js           # Vite configuration
    ├── eslint.config.js         # ESLint config
    └── src/
        ├── main.jsx             # React entry point
        ├── App.jsx              # Root component with sidebar navigation
        ├── App.css              # All application styles (design system)
        ├── index.css            # Global resets
        ├── api.js               # API client (fetch wrapper for all endpoints)
        └── components/
            ├── AccountManager.jsx    # Account CRUD, owner-grouped tables
            ├── GroupManager.jsx      # Group management, drag-and-drop POTs
            ├── InstrumentManager.jsx # Instrument CRUD with presets
            └── StrategyPanel.jsx     # Strategy lifecycle controls
```

---

## Getting Started

### Prerequisites

- **Python 3.10+** (for the backend)
- **Node.js 18+** (for the frontend)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/Hedging-Algo-by-Antigravity.git
cd Hedging-Algo-by-Antigravity
```

### 2. Start the Backend

```bash
cd backend

# Create and activate a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python -m uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`  
Interactive API docs at `http://localhost:8000/docs`

### 3. Start the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run the dev server
npm run dev
```

The UI will be available at `http://localhost:5173`

---

## Backend API

### Accounts (`/api/accounts`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts/` | List all accounts |
| `GET` | `/api/accounts/{id}` | Get single account |
| `POST` | `/api/accounts/` | Create account |
| `PUT` | `/api/accounts/{id}` | Update account |
| `DELETE` | `/api/accounts/{id}` | Delete account |

### Groups (`/api/groups`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/groups/` | List all groups (with members) |
| `POST` | `/api/groups/` | Create group |
| `PUT` | `/api/groups/{id}` | Update group |
| `DELETE` | `/api/groups/{id}` | Delete group (cascades) |
| `POST` | `/api/groups/{id}/members` | Add/update member (account + pot) |
| `DELETE` | `/api/groups/{id}/members/{account_id}` | Remove member |

### Instruments (`/api/instruments`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/instruments/` | List all instruments |
| `POST` | `/api/instruments/` | Create instrument |
| `PUT` | `/api/instruments/{id}` | Update instrument |
| `DELETE` | `/api/instruments/{id}` | Delete instrument |

### Strategy (`/api/strategy`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/strategy/start` | Start a new strategy |
| `POST` | `/api/strategy/stop/{id}` | Stop a running strategy |
| `POST` | `/api/strategy/pause/{id}` | Pause a running strategy |
| `POST` | `/api/strategy/resume/{id}` | Resume paused/stopped strategy |
| `POST` | `/api/strategy/disable/{id}` | Disable a strategy |
| `POST` | `/api/strategy/enable/{id}` | Re-enable disabled strategy |
| `POST` | `/api/strategy/execute/{id}` | Execute one hedge cycle |
| `PUT` | `/api/strategy/orders/{id}` | Edit strategy parameters |
| `GET` | `/api/strategy/orders` | List all strategy orders |
| `GET` | `/api/strategy/trades` | List trade history |

---

## Frontend UI

The app has 4 tabs in the sidebar:

### 👥 Accounts
- Create/edit/delete prop firm accounts
- Accounts grouped by **owner** in compact tables
- Toggle active/inactive status
- Fields: Name, Owner, Firm (Apex/Topstep/etc.), Platform (Tradovate/Rithmic), Account Number

### 🔗 Groups
- Create trading groups (e.g., "Saurabh", "Arjun")
- **Drag-and-drop** accounts from the pool into POT-L or POT-S zones
- **Inter-pot drag**: Move accounts between POT-L ↔ POT-S
- Owner tags shown on account chips for easy identification
- Save/Discard buttons with unsaved change indicators

### 📊 Instruments
- Configure futures contracts with **quick presets** (ES, NQ, MES, CL, GC, etc.)
- Set tick size, tick value, margin, lot size
- Toggle active/inactive

### ⚡ Strategy
- **Start**: Select group + instrument → configure direction, quantity, PT/SL
- **Mirror PT↔SL**: POT-S Profit Target = POT-L Stop Loss (and vice versa), or set independently
- **Execute**: Place trades for all accounts in the group
- **Lifecycle**: Start → Pause → Resume → Stop → Disable → Enable
- **Trade Log**: View executed trades per strategy

---

## Core Concepts

### POT Architecture

| POT | Role | Example |
|-----|------|---------|
| **POT-L** | Long pot — accounts that go LONG on execution | Accounts #1, #3 |
| **POT-S** | Short pot — accounts that go SHORT on execution | Accounts #2, #4 |

When you **execute** a strategy:
- All POT-L accounts receive a **LONG** trade
- All POT-S accounts receive a **SHORT** trade (opposite)
- PT/SL are set per-pot (mirrored by default)

### Many-to-Many Groups

Accounts can belong to **multiple groups** with different pot assignments:
- Account "Acc-1" can be POT-L in "Group A" and POT-S in "Group B"
- The `GroupMembership` join table tracks `(group_id, account_id, pot)`

### Strategy State Machine

```
         ┌────────────────────────────────┐
         │                                │
    ┌────▼─────┐    ┌────────┐    ┌──────┴────┐
    │ RUNNING  │───▶│ PAUSED │───▶│  STOPPED  │
    └────┬─────┘    └───┬────┘    └──────┬────┘
         │              │               │
         │              │          ┌────▼─────┐
         │              └─────────▶│ DISABLED │
         │                         └──────────┘
         │
    ▶ Execute (places trades)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | FastAPI | REST API framework |
| ORM | SQLAlchemy 2.0 | Database models and queries |
| Validation | Pydantic v2 | Request/response schemas |
| Database | SQLite | Lightweight, file-based storage |
| Server | Uvicorn | ASGI server |
| Frontend | React 18 | UI components |
| Build | Vite | Fast dev server + bundler |
| Styling | Vanilla CSS | Custom dark theme design system |

---

## Screenshots

*(Add screenshots of the running application here)*

### Account Management
<!-- ![Accounts](screenshots/accounts.png) -->

### Group Configuration with Drag-and-Drop
<!-- ![Groups](screenshots/groups.png) -->

### Strategy Execution
<!-- ![Strategy](screenshots/strategy.png) -->

---

## License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ⚡ by <strong>Antigravity</strong>
</p>
