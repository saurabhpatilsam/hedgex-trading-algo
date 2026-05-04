# TV Bridge Migration Design

## Goal

Migrate all trade-affecting dashboard actions to the Tradovate TradingView Bridge API documented in `Tradovate_TradingView_API_Reference.md`, with Redis as the mandatory source for bearer tokens and pricing context.

## Current State

The repo has two broker integration paths:

- `backend/routers/broker_data.py` already exposes a Redis-token-backed TV Bridge wrapper for `/config`, `/accounts`, `/state`, `/orders`, `/positions`, `/instruments`, `/executions`, `/quotes`, order placement, order modification, cancellation, and position close.
- `backend/routers/panel_orders.py`, `backend/routers/accounts.py`, `backend/routers/strategy.py`, `backend/routers/trading.py`, `backend/engine/base.py`, `backend/engine/legacy_hedging.py`, and `backend/engine/position_tracker.py` still call older native Tradovate `/v1/...` methods through `TradovateClient.login()`, `place_order()`, `cancel_order()`, `get_positions()`, `get_orders()`, `flatten_account()`, `search_contracts()`, and `get_last_price()`.

The frontend has the same split:

- `frontend/src/components/PositionsPanel.jsx` uses `brokerApi` and the TV Bridge-facing `/api/broker/...` routes.
- `frontend/src/components/TradingPanel.jsx` uses `panelApi`, which still reaches legacy native Tradovate placement/cancel/flatten routes.

Local verification found two runtime blockers that must be handled during implementation:

- Backend import/startup hangs in the current venv around SQLAlchemy ORM imports, preventing local `uvicorn` from listening.
- Vite 7 starts more reliably with the bundled Node 24 runtime than the system Node 18 runtime; the dev server appeared ready under Node 18 but did not respond to module requests.

## Recommended Approach

Use a single backend TV Bridge gateway as the authoritative broker integration and migrate every trade-affecting path to it. Keep existing frontend pages and user workflows, but route their requests through the bridge gateway.

This avoids split behavior where some buttons use Redis-backed TV Bridge requests while others silently perform direct native `/v1/...` calls and fresh credential logins.

## Critical Review Addendum

The implementation plan must cover these gaps found after reviewing the live code against this design:

- `backend/routers/users.py` has dashboard-facing sync actions (`Add Broker`, credential sync, `Refresh All`) that still login with username/password and fetch subaccounts through native Tradovate calls. Account discovery must move to TV Bridge `/accounts`, and local credentials should no longer be required for balance/account sync.
- `backend/routers/instruments.py` still uses native `search_contracts()`. Instrument sync must use `GET /accounts/{accountId}/instruments?locale=en` from the bridge, using any resolvable TV account ID.
- `backend/routers/market.py` has a direct login fallback in `/api/market/live-quote`, and it is missing `import os`. The fallback must be removed so prices come from Redis only, with a clear missing-quote response.
- `backend/routers/broker_data.py` exposes bridge order placement but currently accepts `current_ask` and `current_bid` from the frontend. All order and modify actions must fill bid/ask from Redis server-side.
- `backend/routers/panel_orders.py` has an existing bug in `/api/panel/positions`: it reads `account.broker_account_id`, which is not an `Account` model field. This route must be replaced with TV Bridge positions keyed by `tv_account_id`.
- `Account.tv_account_id` cannot be added only to the ORM model because this project uses `Base.metadata.create_all()` without Alembic migrations; existing SQLite databases need an idempotent `ALTER TABLE accounts ADD COLUMN tv_account_id VARCHAR` startup/schema step.
- TV Bridge `PUT /orders/{orderId}`, `DELETE /orders/{orderId}`, and `DELETE /positions/{positionId}` are inferred/capture-gap endpoints in the reference. The migration should still use them because they are the documented TradingView broker pattern, but error handling must keep broker rejection details visible.
- `GTD` duration support exists in the reference, but no `GTD` expiration date/time field is captured. The frontend should expose `Day` and `GTC` first, keep `GTD` out of the default UI until a captured request confirms the extra payload shape, and the backend should validate unsupported duration values.
- Legacy market-data collection and historical candle endpoints may continue using native Tradovate token flows if they are not dashboard trading/balance/order/position actions. Visible dashboard trade, price, account, order, position, sync, flatten, and kill-switch buttons must use Redis plus TV Bridge only.

## Backend Architecture

### Bridge Client Boundary

Refactor `backend/required_api/tradovate_client.py` so TV Bridge behavior is explicit and reusable:

- `ensure_token()` must load bearer tokens from Redis only.
- `_build_tv_bridge_headers()` must never perform username/password login.
- `get_tv_accounts()`, `get_tv_account_state()`, `get_tv_orders()`, `get_tv_positions()`, `get_tv_instruments()`, `get_tv_executions()`, `get_tv_quotes()`, `place_tv_order()`, `modify_tv_order()`, `cancel_tv_order()`, and `close_tv_position()` remain the canonical broker operations.
- Legacy native helpers may stay temporarily for non-migrated historical utilities, but trade-facing routers and engines must not call them.

### Redis Token Contract

Bearer token lookup must be centralized in one helper used by all bridge operations. Lookup order should support the existing keys:

- direct string keys: `bearer_token`, `auth_token`, `token`, `access_token`, `Authorization`, `jwt`, `auth`
- cached JSON keys: `hx:token:*` with a `token` field
- hash fields containing token-like values

If no valid token exists, return a 503-style API error with a clear message. Do not fall back to credential login for trade, account, order, position, balance, or quote actions.

### Redis Price Contract

Order placement and modification require `currentAsk` and `currentBid` as documented in the reference file. The backend must source these from Redis before placing or modifying orders.

Primary price source:

- `hx:prices` hash
- value per symbol is JSON with `price`, `bid`, `ask`, `symbol`, and optional volume/change fields

If `bid` or `ask` is missing, the order should fail before submission with an actionable error such as `Missing Redis quote for MNQM6: bid/ask required for TV Bridge order placement`. The backend must not invent bid/ask from user input or use a fresh native Tradovate login as a fallback.

### Account ID Mapping

TV Bridge account IDs are string values such as `D18156785`, while the local `Account.tradovate_account_id` field is an integer intended for native Tradovate account IDs. Add a nullable string `tv_account_id` to local accounts and expose it in account schemas.

Mapping strategy:

- Sync/list operations call `GET /accounts?locale=en`.
- Match bridge accounts to local accounts by account `name`.
- Store the bridge `id` in `Account.tv_account_id`.
- Manual panel and strategy flows use `tv_account_id`; if missing, refresh bridge accounts and attempt name-based resolution once.
- If no bridge account matches the selected local account, fail that account result only and continue fan-out to other accounts.

### Router Migration

Keep frontend API routes stable where possible, but change their internals:

- `POST /api/panel/order` uses `place_tv_order()` for every selected account.
- `POST /api/panel/cancel` uses `cancel_tv_order(account.tv_account_id, broker_order_id)`.
- `GET /api/panel/positions` reads `get_tv_positions()` by mapped TV account ID.
- `POST /api/panel/flatten` closes positions with `close_tv_position()` and cancels working orders with `cancel_tv_order()`.
- `POST /api/accounts/flatten` uses TV Bridge cancellation and position close.
- `POST /api/accounts/sync` uses `GET /accounts` and `GET /accounts/{id}/state`, not credential login.
- `GET /api/strategy/last-price` reads Redis `hx:prices`; it should not login.
- `POST /api/strategy/execute/{order_id}`, `/orders/{order_id}/flatten`, and `/orders/{order_id}/positions` use TV Bridge order, order cancel, position, state, and quote methods.
- `POST /api/trading/kill-switch` uses the bridge gateway to cancel working broker orders and close positions for every mapped active account.
- Strategy base order helpers use bridge placement/cancellation when not in paper mode.

### Order Request Mapping

Internal order types map to reference-file form fields:

- `Market` -> `type=market`
- `Limit` -> `type=limit`, requires `limitPrice`
- `Stop` -> `type=stop`, requires `stopPrice`
- `StopLimit` -> `type=stoplimit`, requires both `stopPrice` and `limitPrice`

Every order body includes:

- `currentAsk`
- `currentBid`
- `durationType`
- `instrument`
- `qty`
- `side`
- `type`

Bracket fields are supported end to end:

- `stopLoss`
- `takeProfit`

These fields are optional unless the frontend explicitly provides them.

### Position And Order Shape

Normalize TV Bridge responses before returning to dashboard components while preserving raw fields.

Orders should expose:

- `id`
- `instrument`
- `qty`
- `side`
- `type`
- `status`
- `lastModified`
- `limitPrice`
- `stopPrice`
- `duration`
- `isTrailingStop`
- `parentId`
- `parentType`
- `_account_id`
- `_account_name`

Positions should expose:

- `id`
- `instrument`
- `qty`
- `side`
- `avgPrice`
- `unrealizedPl`
- `_account_id`
- `_account_name`

Account state should expose:

- `balance`
- `equity`
- `unrealizedPl`
- `amData`
- parsed `totalPl`, `openPl`, `netLiq`, `totalMarginUsed`, `availableMargin`, `dayMargin`, `initialMargin`, `maintenanceMargin`

## Frontend Design

### API Client

Keep `frontend/src/api.js` route names stable for existing components. Add bracket and duration fields to `panelApi.placeOrder` payloads and expose bridge-account fields in account responses.

### Trading Panel

Extend `frontend/src/components/TradingPanel.jsx`:

- Add `durationType` control with `Day` and `GTC` values. Keep `GTD` backend-validated but hidden until a captured TV Bridge request confirms the required expiration fields.
- Add optional stop-loss and take-profit fields for bracket orders.
- Send `stop_loss`, `take_profit`, and `duration_type` to `/api/panel/order`.
- Continue showing bid/ask from live prices, but backend remains the source of truth for submission bid/ask from Redis.
- Show per-account success/failure messages returned by the migrated panel route.

### Positions & Orders

Extend `frontend/src/components/PositionsPanel.jsx` to show all meaningful TV Bridge fields:

- Positions table adds position ID, raw side, average price, unrealized P/L, and close action.
- Orders table adds stop price, duration, trailing flag, parent ID/type, and last modified timestamp.
- Account cards add parsed `amData` metrics for margin and net liquidation.

### Account Manager

Expose `tv_account_id` in account payloads where useful for debugging and mapping health. Add a mapping status indicator when an account name exists locally but no TV Bridge account ID is known after sync.

## Error Handling

Errors should distinguish these cases:

- Redis bearer token missing
- Redis bearer token rejected by TV Bridge
- Redis quote missing or incomplete
- Local account cannot be mapped to a TV Bridge account
- TV Bridge order rejected by broker or market hours
- Partial fan-out failure where some accounts succeed and others fail

Fan-out actions should return per-account results and aggregate counts. A single failed account should not prevent other selected accounts from being attempted.

## Testing And Verification

Backend tests should cover:

- Redis token lookup success and missing-token failure.
- Redis quote lookup success and missing bid/ask failure.
- Order form encoding for market, limit, stop, stoplimit, and bracket orders.
- Account name to `tv_account_id` mapping.
- Panel fan-out partial success.
- Flatten flow cancels working orders and closes positions through TV Bridge methods.

Frontend tests or manual browser verification should cover:

- Trading panel payloads for market, limit, stop, stop-limit, and bracket orders.
- Positions & Orders rendering for orders, positions, executions, and account state cards.
- Button behavior for cancel order, close position, refresh, and account filter tabs.

Runtime verification should include:

- Backend starts with `uvicorn main:app`.
- Frontend starts with Node 24-compatible Vite.
- Browser loads the dashboard.
- Network logs confirm trade buttons hit local backend routes that call TV Bridge URLs under `https://tv-demo.tradovateapi.com`, not native `https://demo.tradovateapi.com/v1/order/placeOrder` for migrated trade paths.

## Out Of Scope

- Building a new OAuth flow.
- Browser automation for obtaining or refreshing the bearer token.
- Replacing the entire historical candle/backtest data collection stack.
- Removing all legacy native Tradovate helper code in the same pass if no dashboard or strategy path still calls it.
