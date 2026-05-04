# TV Bridge Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move dashboard trading, pricing, account sync, flatten, position, and order actions onto the Tradovate TradingView Bridge API with Redis as the mandatory token and quote source.

**Architecture:** Add a focused backend bridge service that owns Redis token lookup, Redis quote lookup, TV account mapping, order payload validation, response normalization, and flatten fan-out. Routers keep their existing local API paths but delegate broker work to the bridge service so the frontend does not need a route rename.

**Tech Stack:** FastAPI, SQLAlchemy, Redis, requests, Pydantic, React/Vite.

---

## File Structure

- Modify `backend/models.py`: add `Account.tv_account_id`.
- Modify `backend/schemas.py`: expose `tv_account_id` and full instrument metadata.
- Modify `backend/database.py`: add idempotent runtime schema migration for existing SQLite/Postgres accounts tables.
- Modify `backend/main.py`: call the schema migration before `create_all()`.
- Modify `backend/required_api/tradovate_client.py`: make bridge auth Redis-only, add Redis quote helper, enforce form payload requirements, normalize bridge data.
- Create `backend/services/tv_bridge_service.py`: account mapping, order placement, cancel, flatten, account sync, instrument sync, quote access.
- Modify `backend/routers/broker_data.py`: delegate order/quote actions to Redis-backed service and normalize all-account responses.
- Modify `backend/routers/panel_orders.py`: migrate manual order, cancel, positions, flatten.
- Modify `backend/routers/accounts.py`: migrate selected account sync and flatten.
- Modify `backend/routers/users.py`: migrate credential/user sync away from native login.
- Modify `backend/routers/instruments.py`: migrate instrument sync to bridge instruments.
- Modify `backend/routers/strategy.py`: migrate execute, last-price, positions, flatten.
- Modify `backend/routers/trading.py`: migrate kill switch.
- Modify `backend/routers/market.py`: import `os` and remove native quote fallback.
- Modify `backend/engine/base.py`, `backend/engine/legacy_hedging.py`, `backend/engine/position_tracker.py`, `backend/engine/reconciliation.py`: use the bridge service for live broker order/position work.
- Modify `frontend/src/api.js`: include duration, bracket, and string broker order IDs.
- Modify `frontend/src/components/TradingPanel.jsx`: add duration, stop-loss, take-profit controls; render per-account bridge failures.
- Modify `frontend/src/components/PositionsPanel.jsx`: show position/order IDs, duration, stop price, parent fields, raw side, and bridge close/cancel behavior.
- Modify `frontend/src/components/AccountManager.jsx`: show TV Bridge mapping status and `tv_account_id`.
- Add backend tests under `backend/tests/test_tv_bridge_service.py`.

## Critical Decisions

- Redis token missing returns HTTP 503; no username/password login fallback for dashboard trading, balances, orders, positions, quotes, sync, flatten, or kill switch.
- Redis quote missing or missing `bid`/`ask` fails before broker submission.
- `tv_account_id` is a string because TV Bridge account IDs look like `D18156785`.
- Account mapping matches TV Bridge account `name` to local `Account.name`.
- `Day` and `GTC` are exposed in the frontend; `GTD` remains backend-validated but hidden until the reference has captured expiration payload fields.
- Capture-gap endpoints for modify/cancel/close are used exactly as documented; broker errors are returned per account.

## Task 1: Schema And Bridge Primitives

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/schemas.py`
- Modify: `backend/database.py`
- Modify: `backend/main.py`
- Modify: `backend/required_api/tradovate_client.py`
- Test: `backend/tests/test_tv_bridge_service.py`

- [ ] **Step 1: Write failing tests for Redis quote/token and bridge form encoding**

Run:
```bash
cd backend && PYTHONPATH=. pytest tests/test_tv_bridge_service.py -q
```

Expected before implementation: tests fail because `services.tv_bridge_service` does not exist and `Account.tv_account_id` is missing.

- [ ] **Step 2: Add `tv_account_id` schema support**

Add `Account.tv_account_id = Column(String, nullable=True)` and expose it in `AccountResponse`, `AccountCreate`, and `AccountUpdate`.

- [ ] **Step 3: Add idempotent runtime schema migration**

Add a function that inspects the `accounts` table and adds `tv_account_id` when absent. Call it in `main.lifespan()` before `Base.metadata.create_all()`.

- [ ] **Step 4: Make TV Bridge auth and order payloads strict**

Update `ensure_token()` and `_build_tv_bridge_headers()` messages to remove login fallback language. Require `currentAsk` and `currentBid` for `place_tv_order()` and `modify_tv_order()` before sending requests.

- [ ] **Step 5: Verify Task 1**

Run:
```bash
cd backend && PYTHONPATH=. pytest tests/test_tv_bridge_service.py -q
```

Expected after implementation: token/quote/payload tests pass.

## Task 2: Shared Bridge Service

**Files:**
- Create: `backend/services/tv_bridge_service.py`
- Test: `backend/tests/test_tv_bridge_service.py`

- [ ] **Step 1: Write failing tests for account mapping and flatten fan-out**

Tests cover name-based mapping, partial mapping failure, cancel working orders, and close positions.

- [ ] **Step 2: Implement bridge service**

Implement:
- `get_bridge_client()`
- `get_redis_quote(symbol)`
- `normalize_quote(symbol, raw)`
- `normalize_order(order, account)`
- `normalize_position(position, account)`
- `parse_account_state(state)`
- `resolve_tv_account_id(db, account, client=None)`
- `sync_accounts_from_bridge(db, accounts)`
- `place_order_for_accounts(db, accounts, instrument, side, qty, order_type, limit_price, stop_price, stop_loss, take_profit, duration_type)`
- `cancel_order(db, account_id, broker_order_id)`
- `flatten_account(db, account, symbol=None)`
- `sync_instruments_from_bridge(db, user_id=None)`

- [ ] **Step 3: Verify Task 2**

Run:
```bash
cd backend && PYTHONPATH=. pytest tests/test_tv_bridge_service.py -q
```

Expected: service behavior tests pass.

## Task 3: Migrate Backend Routers

**Files:**
- Modify: `backend/routers/broker_data.py`
- Modify: `backend/routers/panel_orders.py`
- Modify: `backend/routers/accounts.py`
- Modify: `backend/routers/users.py`
- Modify: `backend/routers/instruments.py`
- Modify: `backend/routers/strategy.py`
- Modify: `backend/routers/trading.py`
- Modify: `backend/routers/market.py`

- [ ] **Step 1: Migrate `/api/broker` actions**

Quotes return Redis quote data. Order placement/modification ignores frontend bid/ask and fills from Redis.

- [ ] **Step 2: Migrate `/api/panel` actions**

Manual order fan-out, cancel, positions, and flatten use `tv_account_id` and bridge service only.

- [ ] **Step 3: Migrate account and user sync actions**

`/api/accounts/sync`, `/api/users/{id}/credentials/{cred_id}/sync`, and `/api/users/{id}/sync-all` call TV Bridge `/accounts` and `/state`.

- [ ] **Step 4: Migrate instruments and market quote actions**

Instrument sync uses `/accounts/{id}/instruments`. `/api/market/live-quote` reads Redis only.

- [ ] **Step 5: Migrate strategy and kill-switch actions**

Legacy strategy execute/flatten/positions and production kill switch use bridge placement/cancel/close.

- [ ] **Step 6: Verify no migrated dashboard route calls native helpers**

Run:
```bash
rg -n "client\.(login|get_subaccounts|get_account_balance|get_drawdown_limits|search_contracts|place_order|get_last_price|cancel_order|get_positions|get_orders|flatten_account)" backend/routers backend/engine/base.py backend/engine/legacy_hedging.py backend/engine/position_tracker.py backend/engine/reconciliation.py
```

Expected: no matches in migrated router/engine files except out-of-scope market-data collection services.

## Task 4: Frontend Updates

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/components/TradingPanel.jsx`
- Modify: `frontend/src/components/PositionsPanel.jsx`
- Modify: `frontend/src/components/AccountManager.jsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Extend manual order payloads**

Send `duration_type`, `stop_loss`, and `take_profit` from the trading panel. Keep backend Redis quote as source of truth.

- [ ] **Step 2: Add expected controls**

Add compact controls for `Day`/`GTC`, stop loss, and take profit. Keep text within existing panel dimensions.

- [ ] **Step 3: Render richer bridge data**

Show TV account mapping status, bridge account IDs, order stop/duration/parent fields, position IDs, and raw position side.

- [ ] **Step 4: Verify frontend build**

Run with bundled Node 24 if system Node fails:
```bash
cd frontend && npm run build
```

Expected: Vite build exits 0.

## Task 5: Runtime Verification

**Files:**
- No planned code edits.

- [ ] **Step 1: Backend import/start verification**

Run:
```bash
cd backend && PYTHONPATH=. python -c "import main; print('import ok')"
```

Expected: import exits 0. If it hangs, diagnose before claiming runtime success.

- [ ] **Step 2: Backend test verification**

Run:
```bash
cd backend && PYTHONPATH=. pytest tests/test_tv_bridge_service.py -q
```

Expected: all tests pass.

- [ ] **Step 3: Endpoint grep verification**

Run the native helper grep from Task 3 Step 6 and confirm migrated dashboard paths no longer call native helper methods.

- [ ] **Step 4: Frontend build verification**

Run:
```bash
cd frontend && npm run build
```

Expected: build exits 0.
