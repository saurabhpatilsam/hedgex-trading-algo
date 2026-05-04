# Tradovate × TradingView — Complete API Endpoint Reference

> **Source**: Captured from Chrome extension interception of TradingView↔Tradovate integration  
> **Sessions analysed**: `dedd3811` (5,185 events) + `58d72770` (12,403 events)  
> **Date**: 2026-05-03  

> [!CAUTION]
> This document was derived from live network captures. All tokens, credentials, and account IDs shown are from demo/sandbox environments. **Never commit production tokens.**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Base URLs & Environment Discovery](#2-base-urls--environment-discovery)
3. [Authentication & OAuth Flow](#3-authentication--oauth-flow)
4. [WebSocket — Real-Time Data Channel](#4-websocket--real-time-data-channel)
5. [Account Management](#5-account-management)
6. [Instrument & Contract Lookup](#6-instrument--contract-lookup)
7. [Quotes & Market Data (Pricing)](#7-quotes--market-data-pricing)
8. [Order Placement — All Order Types](#8-order-placement--all-order-types)
9. [Order Monitoring & Polling](#9-order-monitoring--polling)
10. [Position Monitoring](#10-position-monitoring)
11. [Execution History](#11-execution-history)
12. [Broker Configuration & Capabilities](#12-broker-configuration--capabilities)
13. [Account State & Balance](#13-account-state--balance)
14. [Order Modification & Cancellation](#14-order-modification--cancellation)
15. [Position Close / Flatten](#15-position-close--flatten)
16. [TradingView WebSocket (Chart Data)](#16-tradingview-websocket-chart-data)
17. [Error Handling Reference](#17-error-handling-reference)
18. [Polling Intervals & Timing](#18-polling-intervals--timing)
19. [Capture Gaps & Next Steps](#19-capture-gaps--next-steps)
20. [Full Endpoint Summary Table](#20-full-endpoint-summary-table)

---

## 1. Architecture Overview

TradingView does **not** call the Tradovate REST API (`demo.tradovateapi.com/v1/...`) directly for trading. Instead, it uses a **TradingView-specific bridge layer**:

```
┌─────────────────┐     OAuth      ┌──────────────────────┐
│   TradingView    │──────────────▶│  trader.tradovate.com │
│   (Browser UI)   │◀──────────────│  (OAuth consent page) │
└────────┬────────┘   code grant   └──────────────────────┘
         │
         │  Bearer token
         ▼
┌─────────────────────────────────────────────┐
│  tv-demo.tradovateapi.com  (TV Bridge API)  │
│  ─────────────────────────────────────────  │
│  /config           → broker capabilities    │
│  /accounts         → list accounts          │
│  /accounts/{id}/state      → balance/equity │
│  /accounts/{id}/orders     → GET+POST       │
│  /accounts/{id}/positions  → position list  │
│  /accounts/{id}/instruments→ contract list  │
│  /accounts/{id}/executions → fill history   │
│  /quotes           → live quotes polling    │
└─────────────────────────────────────────────┘
         │
         │  accessToken (JWT)
         ▼
┌─────────────────────────────────────────────┐
│  wss://demo.tradovateapi.com/v1/websocket   │
│  ─────────────────────────────────────────  │
│  authorize         → WS auth with JWT       │
│  user/syncrequest  → full account snapshot   │
│  heartbeat / keepalive → connection health   │
└─────────────────────────────────────────────┘
         │
         │  Auth tokens
         ▼
┌─────────────────────────────────────────────┐
│  live.tradovateapi.com/v1/auth/*            │
│  ─────────────────────────────────────────  │
│  /auth/accesstokenrequest  → get JWT tokens │
│  /auth/oauthgrant          → exchange code  │
│  /auth/clientdetails       → app ACL info   │
│  /auth/getsocialappids     → social login   │
│  /user/item                → user lookup    │
└─────────────────────────────────────────────┘
```

**Two parallel data paths exist:**
- **TV Bridge REST** (`tv-demo.tradovateapi.com`) — polled every ~1s for quotes, orders, positions, state
- **Tradovate WebSocket** (`wss://demo.tradovateapi.com/v1/websocket`) — real-time entity sync via `user/syncrequest`

---

## 2. Base URLs & Environment Discovery

### 2.1 Environment Hosts (from `accesstokenrequest` response)

| Environment | Host | Purpose |
|---|---|---|
| **Live REST** | `live.tradovateapi.com` | Authentication, user management |
| **Demo REST** | `demo.tradovateapi.com` | Demo trading REST API |
| **Live Market Data** | `md.tradovateapi.com` | Live market data WebSocket |
| **Demo Market Data** | `md-demo.tradovateapi.com` | Demo market data WebSocket |
| **Replay** | `replay.tradovateapi.com` | Market replay |
| **Reporting Live** | `rpt-live.tradovateapi.com` | Live reporting |
| **Reporting Demo** | `rpt-demo.tradovateapi.com` | Demo reporting |
| **TV Bridge (Demo)** | `tv-demo.tradovateapi.com` | TradingView bridge layer |
| **Status** | `status.tradovateapi.com` | Health checks, geo-location |
| **CDN** | `cdn.tradovate.com` | Static assets |

### 2.2 Geo-Location / Status Discovery

**`GET https://status.tradovateapi.com/whereisme`**

```json
{
  "country": "GB",
  "state": "GBENG",
  "city": "London"
}
```

**`GET https://status.tradovateapi.com/notifications`**

```json
{
  "notifications": []
}
```

---

## 3. Authentication & OAuth Flow

### 3.1 Complete OAuth Sequence (Captured)

```
Step 1: TradingView opens OAuth consent
  GET https://trader.tradovate.com/oauth
    ?response_type=code
    &client_id=7742
    &scope=tradingview+demo
    &redirect_uri=https://www.tradingview.com/trading/oauth-redirect/tradovate/
    &state=<base64-encoded-state-json>

Step 2: User approves → redirect with code
  GET https://www.tradingview.com/trading/oauth-redirect/tradovate/
    ?code=0vo7m73sdzte2ra76sn15zcpmk7w5lg
    &state=<same-state>

Step 3: Exchange code for access tokens
  POST https://live.tradovateapi.com/v1/auth/accesstokenrequest

Step 4: Grant OAuth token to TradingView
  POST https://live.tradovateapi.com/v1/auth/oauthgrant

Step 5: Connect WebSocket with token
  wss://demo.tradovateapi.com/v1/websocket → authorize

Step 6: Sync all account data
  WS → user/syncrequest
```

### 3.2 Access Token Request

**`POST https://live.tradovateapi.com/v1/auth/accesstokenrequest`**

**Request Body:**
```json
{
  "name": "APEX_136189",
  "password": "<encoded-password>",
  "environment": "demo",
  "oauth": true,
  "appId": "tradovate_trader(web)",
  "appVersion": "3.260501.0",
  "deviceId": "907ad820-f500-e238-c549-8496baca888d"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJraWQiOiIzMyIs...<JWT>",
  "mdAccessToken": "eyJraWQiOiIzMyIs...<JWT-for-market-data>",
  "expirationTime": "2026-05-03T16:02:10.658Z",
  "userStatus": "Active",
  "userId": 2152067,
  "name": "APEX_136189",
  "hasLive": false,
  "hasSimPlus": false,
  "outdatedTaC": false,
  "hasFunded": false,
  "hasMarketData": true,
  "requiredNonProCertification": false,
  "outdatedSentimentPolicy": true,
  "orgName": "ApexTraderFunding",
  "apiHosts": {
    "live": "live.tradovateapi.com",
    "demo": "demo.tradovateapi.com",
    "mdLive": "md.tradovateapi.com",
    "mdDemo": "md-demo.tradovateapi.com",
    "replay": "replay.tradovateapi.com",
    "reportingLive": "rpt-live.tradovateapi.com",
    "reportingDemo": "rpt-demo.tradovateapi.com"
  }
}
```

### 3.3 OAuth Grant

**`POST https://live.tradovateapi.com/v1/auth/oauthgrant`**

**Response (200):**
```json
{
  "code": "0vo7m73sdzte2ra76sn15zcpmk7w5lg",
  "expires_in": 4800
}
```

### 3.4 Client Details (ACL Permissions)

**`POST https://live.tradovateapi.com/v1/auth/clientdetails`**

**Response (200):**
```json
{
  "name": "TradingView",
  "privacyPolicyLink": "https://www.tradingview.com/privacy-policy/",
  "termsAndConditionsLink": "https://www.tradingview.com/policies/",
  "internal": false,
  "acl": {
    "entries": {
      "Chat": "FullAccess",
      "*": "Denied",
      "Users": "FullAccess",
      "Prices": "Read",
      "Orders": "FullAccess",
      "Accounting": "FullAccess",
      "Positions": "Read",
      "ContractLibrary": "Read",
      "Alerts": "FullAccess",
      "Risks": "FullAccess"
    },
    "reports": { "*": "Denied" },
    "default": "Denied"
  }
}
```

### 3.5 Social App IDs

**`GET https://live.tradovateapi.com/v1/auth/getsocialappids`**

### 3.6 User Item Lookup

**`GET https://live.tradovateapi.com/v1/user/item`**

> Returns 404 in captured sessions — requires auth token in header.

### 3.7 Authorization Header Format

All TV Bridge API calls use:
```
Authorization: Bearer <accessToken-JWT>
```

---

## 4. WebSocket — Real-Time Data Channel

### 4.1 Connection

**URL:** `wss://demo.tradovateapi.com/v1/websocket?r=<random-float>`

**Protocol:** Tradovate custom framing (not JSON-RPC, not Socket.IO)

**Connection lifecycle:**
1. Client opens WebSocket
2. Server sends `o` (open control frame)
3. Client sends `authorize` request with JWT
4. Server responds with `{s: 200}` (success)
5. Client sends `user/syncrequest`
6. Server pushes full account state snapshot
7. Heartbeat/keepalive loop begins (~2.5s interval)

### 4.2 WS Frame Format

**Client → Server (Request):**
```
<endpoint>\n<messageId>\n\n<json-body>
```
Example:
```
authorize
2

"eyJraWQiOiIzMyIs..."
```

**Server → Client (Response/Push):**
```
a[{"s":200,"i":2}]          ← response to messageId 2
a[{"s":200,"i":3,"d":{...}}] ← response with data
```

### 4.3 `authorize` Endpoint

**Direction:** Client → Server  
**Message ID:** 2  
**Body:** JWT access token as string

**Response:**
```json
{ "s": 200, "i": 2 }
```

### 4.4 `user/syncrequest` Endpoint

**Direction:** Client → Server  
**Message ID:** 3  
**Body:**
```json
{ "splitResponses": false }
```

**Response:** Full account state snapshot containing ALL of these entity arrays:

| Entity | Description |
|---|---|
| `users` | User profile (id, name, email, status, userType) |
| `accounts` | All trading accounts (id, name, accountType, active, restricted, closed) |
| `accountRiskStatuses` | Auto-liq counters, maxNetLiq, trailing drawdown info |
| `marginSnapshots` | initialMargin, maintenanceMargin, totalUsedMargin per account |
| `userAccountAutoLiqs` | Trailing max drawdown limits per account |
| `cashBalances` | Cash balance with realizedPnL, weekRealizedPnL per account |
| `currencies` | Currency definitions |
| `positions` | Open positions (empty when flat) |
| `fillPairs` | Fill pair records |
| `orders` | Active orders |
| `contracts` | Contract definitions |
| `contractMaturities` | Contract expiry info |
| `products` | Product definitions |
| `exchanges` | Exchange definitions (21 exchanges captured) |
| `orderStrategies` | OSO/OCO strategy definitions |
| `orderStrategyLinks` | Links between strategy orders |
| `userProperties` | User-specific property values |
| `tradingPermissions` | Trading permission flags |

**Sample `users` entity:**
```json
{
  "id": 2152067,
  "name": "APEX_136189",
  "timestamp": "2024-01-27T19:53:41.552Z",
  "userType": "Trader",
  "email": "amer.j.trading@gmail.com",
  "status": "Active",
  "professional": false,
  "organizationId": 20,
  "hibernated": false
}
```

**Sample `accounts` entity:**
```json
{
  "id": 18156785,
  "name": "PAAPEX1361890000010",
  "userId": 699523,
  "accountType": "Customer",
  "restricted": false,
  "closed": false,
  "clearingHouseId": 4,
  "riskCategoryId": 70,
  "autoLiqProfileId": 19,
  "marginAccountType": "Speculator",
  "legalStatus": "Individual",
  "archived": false,
  "timestamp": "2025-01-31T00:58:39Z",
  "active": true
}
```

**Sample `cashBalances` entity:**
```json
{
  "id": 268137616437,
  "accountId": 18156785,
  "timestamp": "2026-05-02T21:02:54.326Z",
  "tradeDate": { "year": 2026, "month": 5, "day": 2 },
  "currencyId": 1,
  "amount": 50455.68,
  "realizedPnL": 0,
  "weekRealizedPnL": 0,
  "archived": false,
  "amountSOD": 50455.68
}
```

**Sample `marginSnapshots` entity:**
```json
{
  "id": 18156785,
  "timestamp": "2025-08-12T20:59:02.768Z",
  "riskTimePeriodId": 10,
  "initialMargin": 0,
  "maintenanceMargin": 0,
  "autoLiqLevel": 0,
  "liqOnlyLevel": 0,
  "totalUsedMargin": 0,
  "fullInitialMargin": 0,
  "positionMargin": 0,
  "totalUsedFullMargin": 0
}
```

**Sample `userAccountAutoLiqs` entity:**
```json
{
  "id": 18156785,
  "trailingMaxDrawdown": 2500,
  "trailingMaxDrawdownLimit": 50100,
  "trailingMaxDrawdownMode": "RealTime",
  "doNotUnlock": true
}
```

**Sample `accountRiskStatuses` entity:**
```json
{
  "id": 18156785,
  "autoLiqStarted": "2025-09-26T17:17:19.164Z",
  "autoLiqStopped": "2025-09-26T17:17:19.228Z",
  "autoLiqCounter": 2,
  "maxNetLiq": 51141.16,
  "maxNetLiqTimestamp": "2025-03-27T10:53:51.155Z"
}
```

**Sample `exchanges` entity:**
```json
{
  "id": 15,
  "name": "Coinbase Derivatives",
  "complex": "FREX",
  "timeZone": "CST",
  "isSecuredDefault": true,
  "cftcReporting": true,
  "freeMarketData": "AnyClientApp",
  "marketType": "Futures",
  "span": "FRE",
  "foreignExchange": false
}
```

### 4.5 Heartbeat / Keepalive

- Server sends heartbeat frame every ~2.5 seconds
- Client responds with keepalive frame immediately
- Format: bare control frames (not JSON)

---

## 5. Account Management

### 5.1 List All Accounts

**`GET https://tv-demo.tradovateapi.com/accounts?locale=en`**

**Response (200):**
```json
{
  "s": "ok",
  "d": [
    {
      "id": "D18156785",
      "name": "PAAPEX1361890000010",
      "type": "demo",
      "currency": "USD",
      "currencySign": "$",
      "config": {
        "showQuantityInsteadOfAmount": true,
        "supportDOM": true,
        "supportOrderBrackets": true,
        "supportPositionBrackets": false,
        "supportClosePosition": true,
        "supportEditAmount": true,
        "supportLevel2Data": true,
        "supportMultiposition": false,
        "supportPLUpdate": false,
        "supportReducePosition": false,
        "supportStopLimitOrders": true,
        "supportOrdersHistory": false,
        "supportExecutions": true,
        "supportDigitalSignature": false,
        "supportBalances": false,
        "supportPartialOrderExecution": true,
        "supportTrailingStop": false
      },
      "isVerified": false
    }
  ]
}
```

> **Note:** Multiple accounts returned. TradingView polls different account endpoints when user switches between accounts (captured: D18156785, D30471976, D40826081).

### 5.2 Account Switching Behavior

When user switches account in TradingView:
1. `GET /accounts/{newAccountId}/state` — fetch new balance
2. `GET /accounts/{newAccountId}/orders` — fetch orders for new account
3. `GET /accounts/{newAccountId}/positions` — fetch positions
4. `GET /accounts/{newAccountId}/instruments` — reload instrument list
5. Quotes polling continues with `accountId` query param updated

---

## 6. Instrument & Contract Lookup

### 6.1 Get Available Instruments

**`GET https://tv-demo.tradovateapi.com/accounts/{accountId}/instruments?locale=en`**

**Response (200):**
```json
{
  "s": "ok",
  "d": [
    {
      "name": "MNQM6",
      "description": "Micro E-Mini Nasdaq-100",
      "type": "futures",
      "minTick": 0.25,
      "pipSize": 0.25,
      "pipValue": 0.50
    },
    {
      "name": "NQM6",
      "description": "E-Mini Nasdaq-100",
      "type": "futures",
      "minTick": 0.25,
      "pipSize": 0.25,
      "pipValue": 5.00
    },
    {
      "name": "ESM6",
      "description": "E-Mini S&P 500",
      "type": "futures",
      "minTick": 0.25,
      "pipSize": 0.25,
      "pipValue": 12.50
    },
    {
      "name": "GFK6",
      "description": "Feeder Cattle",
      "type": "futures",
      "minTick": 0.025,
      "pipSize": 0.025,
      "pipValue": 12.5
    }
  ]
}
```

**Key fields per instrument:**
| Field | Description |
|---|---|
| `name` | Tradovate symbol (e.g., `MNQM6`) |
| `description` | Human-readable name |
| `type` | Always `"futures"` for Tradovate |
| `minTick` | Minimum price increment |
| `pipSize` | Same as minTick for futures |
| `pipValue` | Dollar value per tick movement |

### 6.2 Symbol Search (TradingView)

**`GET https://symbol-search.tradingview.com/symbol_search/`**

Used by TradingView's symbol search bar — not a Tradovate endpoint but relevant for instrument discovery.

---

## 7. Quotes & Market Data (Pricing)

### 7.1 Quote Polling (Primary Price Source)

**`GET https://tv-demo.tradovateapi.com/quotes?locale=en&symbols={symbol}&accountId={accountId}`**

**Polling interval:** Every **1000ms** (1 second) — configured via `/config` response.

**Single symbol request:**
```
GET /quotes?locale=en&symbols=MNQM6&accountId=D18156785
```

**Multi-symbol request:**
```
GET /quotes?locale=en&symbols=MNQM6%2CNQM6&accountId=D18156785
```

**Response (200) — Single Symbol:**
```json
{
  "s": "ok",
  "d": [
    {
      "s": "ok",
      "n": "MNQM6",
      "v": {
        "lp": 27782.75,
        "ch": -53.0,
        "chp": -0.19,
        "high_price": 27917.5,
        "open_price": 27630.0,
        "prev_close_price": 27835.75,
        "ask": 27795.25,
        "volume": 1718935,
        "bid": 27780.0,
        "low_price": 27535.0
      }
    }
  ]
}
```

**Response (200) — Multi-Symbol:**
```json
{
  "s": "ok",
  "d": [
    {
      "s": "ok",
      "n": "MNQM6",
      "v": {
        "lp": 27782.75,
        "ch": -53.0,
        "chp": -0.19,
        "high_price": 27917.5,
        "open_price": 27630.0,
        "prev_close_price": 27835.75,
        "ask": 27795.25,
        "volume": 1718935,
        "bid": 27780.0,
        "low_price": 27535.0
      }
    },
    {
      "s": "ok",
      "n": "NQM6",
      "v": {
        "lp": 27783.25,
        "ch": -52.5,
        "chp": -0.19,
        "high_price": 27917.0,
        "open_price": 27631.75,
        "prev_close_price": 27835.75,
        "ask": 27791.0,
        "volume": 499576,
        "bid": 27781.5,
        "low_price": 27536.25
      }
    }
  ]
}
```

**Quote field reference:**

| Field | Type | Description |
|---|---|---|
| `lp` | float | Last price |
| `ch` | float | Change from previous close |
| `chp` | float | Change percent |
| `high_price` | float | Session high |
| `low_price` | float | Session low |
| `open_price` | float | Session open |
| `prev_close_price` | float | Previous session close |
| `ask` | float | Best ask price |
| `bid` | float | Best bid price |
| `volume` | int | Session volume |

### 7.2 TradingView Chart Data WebSocket

**URL:** `wss://data.tradingview.com/socket.io/websocket?from=chart%2F{chartId}%2F&date={date}&type=chart&auth=sessionid`

This is TradingView's own chart data socket — **not Tradovate**. It carries:
- Watchlist quote updates (`qsd` messages)
- Chart series data (`series_loading`, `timescale_update`)
- Study/indicator data

**Frame format:** TradingView proprietary `~m~{length}~m~{json}` framing.

---

## 8. Order Placement — All Order Types

### 8.1 Unified Order Endpoint

**`POST https://tv-demo.tradovateapi.com/accounts/{accountId}/orders?locale=en&requestId={uniqueId}`**

**Content-Type:** `application/x-www-form-urlencoded`

The `requestId` is a random 10-character alphanumeric string generated by TradingView for idempotency.

### 8.2 Market Order

**Request Body (form-encoded):**
```
currentAsk=27795.25
currentBid=27780
durationType=Day
instrument=MNQM6
qty=1
side=buy
type=market
```

**Equivalent JSON:**
```json
{
  "currentAsk": ["27795.25"],
  "currentBid": ["27780"],
  "durationType": ["Day"],
  "instrument": ["MNQM6"],
  "qty": ["1"],
  "side": ["buy"],
  "type": ["market"]
}
```

**Sell Market Order:**
```
currentAsk=27795.25&currentBid=27780&durationType=Day&instrument=MNQM6&qty=1&side=sell&type=market
```

### 8.3 Limit Order

**Request Body:**
```
currentAsk=27795.25
currentBid=27780
durationType=Day
instrument=MNQM6
limitPrice=27840.25
qty=1
side=sell
type=limit
```

### 8.4 Bracket Order (Limit + Take Profit + Stop Loss)

**Request Body:**
```
currentAsk=27795.25
currentBid=27780
durationType=Day
instrument=MNQM6
limitPrice=27857.5
qty=1
side=buy
stopLoss=27851.25
takeProfit=27876.25
type=limit
```

**Another bracket example (wider SL/TP):**
```
currentAsk=27795.25
currentBid=27780
durationType=Day
instrument=MNQM6
limitPrice=27851.5
qty=1
side=buy
stopLoss=27833
takeProfit=27894
type=limit
```

**NQ (full-size) bracket order:**
```
currentAsk=27791
currentBid=27781.5
durationType=Day
instrument=NQM6
limitPrice=27703.25
qty=1
side=buy
stopLoss=27412
takeProfit=27984.25
type=limit
```

### 8.5 Stop Order (Inferred from Config)

Based on the `/config` response, stop orders are supported:
```
currentAsk=<ask>
currentBid=<bid>
durationType=Day
instrument=<symbol>
stopPrice=<trigger-price>
qty=1
side=sell
type=stop
```

### 8.6 Stop-Limit Order (Inferred from Config)

```
currentAsk=<ask>
currentBid=<bid>
durationType=Day
instrument=<symbol>
stopPrice=<trigger-price>
limitPrice=<limit-after-trigger>
qty=1
side=sell
type=stoplimit
```

### 8.7 Order Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `currentAsk` | string | Yes | Current ask price at time of submission |
| `currentBid` | string | Yes | Current bid price at time of submission |
| `durationType` | string | Yes | `"Day"`, `"GTC"`, or `"GTD"` |
| `instrument` | string | Yes | Tradovate symbol (e.g., `MNQM6`, `NQM6`) |
| `qty` | string | Yes | Order quantity (number of contracts) |
| `side` | string | Yes | `"buy"` or `"sell"` |
| `type` | string | Yes | `"market"`, `"limit"`, `"stop"`, `"stoplimit"` |
| `limitPrice` | string | Conditional | Required for `limit` and `stoplimit` orders |
| `stopPrice` | string | Conditional | Required for `stop` and `stoplimit` orders |
| `stopLoss` | string | Optional | Stop-loss price for bracket orders |
| `takeProfit` | string | Optional | Take-profit price for bracket orders |

### 8.8 Supported Duration Types (from `/config`)

| Duration | Date Picker | Time Picker | Supported Order Types |
|---|---|---|---|
| `Day` | No | No | market, limit, stop, stoplimit |
| `GTC` | No | No | market, limit, stop, stoplimit |
| `GTD` | Yes | Yes | market, limit, stop, stoplimit |

### 8.9 Order Response — Success

```json
{
  "s": "ok",
  "d": {
    "id": "268137616439",
    "instrument": "MNQM6",
    "qty": 1,
    "side": "sell",
    "type": "limit",
    "status": "working",
    "lastModified": 1777819341,
    "limitPrice": 27840.25,
    "duration": { "type": "Day" },
    "isTrailingStop": false
  }
}
```

### 8.10 Order Response — Error

```json
{
  "s": "error",
  "errmsg": "Cannot place order outside of market hours. Please check contract specifications or quote info to view market hours."
}
```

---

## 9. Order Monitoring & Polling

### 9.1 Get All Orders

**`GET https://tv-demo.tradovateapi.com/accounts/{accountId}/orders?locale=en`**

**Polling interval:** Every **1000ms**

**Response — No orders:**
```json
{ "s": "ok", "d": [] }
```

**Response — With orders:**
```json
{
  "s": "ok",
  "d": [
    {
      "id": "268137616439",
      "instrument": "MNQM6",
      "qty": 1,
      "side": "sell",
      "type": "limit",
      "status": "rejected",
      "lastModified": 1777819341,
      "limitPrice": 27840.25,
      "duration": { "type": "Day" },
      "isTrailingStop": false
    },
    {
      "id": "268137616442",
      "instrument": "MNQM6",
      "qty": 1,
      "side": "sell",
      "type": "market",
      "status": "rejected",
      "lastModified": 1777819346,
      "duration": { "type": "Day" },
      "isTrailingStop": false
    }
  ]
}
```

### 9.2 Order Status Values

| Status | Description |
|---|---|
| `working` | Order is active in the market |
| `filled` | Order has been fully executed |
| `rejected` | Order was rejected by the exchange/broker |
| `cancelled` | Order was cancelled by user |
| `expired` | Order expired (end of day/GTD) |

### 9.3 Order Object Schema

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique order ID |
| `instrument` | string | Symbol name |
| `qty` | int | Order quantity |
| `side` | string | `"buy"` or `"sell"` |
| `type` | string | `"market"`, `"limit"`, `"stop"`, `"stoplimit"` |
| `status` | string | Current order status |
| `lastModified` | int | Unix timestamp (seconds) |
| `limitPrice` | float | Limit price (if applicable) |
| `stopPrice` | float | Stop price (if applicable) |
| `duration` | object | `{ "type": "Day" | "GTC" | "GTD" }` |
| `isTrailingStop` | bool | Whether this is a trailing stop |
| `parentId` | string | Parent order ID (for bracket legs) |
| `parentType` | string | `"tp"` or `"sl"` for bracket legs |

---

## 10. Position Monitoring

### 10.1 Get All Positions

**`GET https://tv-demo.tradovateapi.com/accounts/{accountId}/positions?locale=en`**

**Polling interval:** Every **1000ms**

**Response — No positions (flat):**
```json
{ "s": "ok", "d": [] }
```

**Response — With positions (expected schema from TradingView broker API spec):**
```json
{
  "s": "ok",
  "d": [
    {
      "id": "pos_123456",
      "instrument": "MNQM6",
      "qty": 1,
      "side": "buy",
      "avgPrice": 27780.0,
      "unrealizedPl": 15.50
    }
  ]
}
```

### 10.2 Position Monitoring Flow

```
Every 1000ms:
  GET /accounts/{accountId}/positions → update UI
  GET /accounts/{accountId}/orders → update order panel
  GET /accounts/{accountId}/state → update balance/equity
  GET /quotes?symbols={active} → update prices
```

---

## 11. Execution History

### 11.1 Get Executions (Fills)

**`GET https://tv-demo.tradovateapi.com/accounts/{accountId}/executions?locale=en&instrument={symbol}`**

**Captured examples:**
```
GET /accounts/D18156785/executions?locale=en&instrument=MNQM6
GET /accounts/D18156785/executions?locale=en&instrument=NQM6
```

**Response — No executions:**
```json
{ "s": "ok", "d": [] }
```

**Response — With executions (expected schema):**
```json
{
  "s": "ok",
  "d": [
    {
      "id": "exec_123",
      "instrument": "MNQM6",
      "price": 27780.0,
      "qty": 1,
      "side": "buy",
      "time": 1777819341
    }
  ]
}
```

---

## 12. Broker Configuration & Capabilities

### 12.1 Get Config

**`GET https://tv-demo.tradovateapi.com/config?locale=en`**

**Response (200):**
```json
{
  "s": "ok",
  "d": {
    "accountManager": [
      {
        "id": "accountSummary",
        "title": "",
        "columns": [
          { "id": "totalPL", "title": "Total P/L" },
          { "id": "openPL", "title": "Open P/L" },
          { "id": "netLiq", "title": "Net Liq" },
          { "id": "totalMarginUsed", "title": "Total Margin Used" },
          { "id": "availableMargin", "title": "Available Margin" },
          { "id": "dayMargin", "title": "Day Margin" },
          { "id": "initialMargin", "title": "Initial Margin" },
          { "id": "maintenanceMargin", "title": "Maintenance Margin" }
        ]
      }
    ],
    "durations": [
      {
        "id": "Day",
        "title": "Day",
        "hasDatePicker": false,
        "hasTimePicker": false,
        "supportedOrderTypes": ["market", "limit", "stop", "stoplimit"]
      },
      {
        "id": "GTC",
        "title": "GTC",
        "hasDatePicker": false,
        "hasTimePicker": false,
        "supportedOrderTypes": ["market", "limit", "stop", "stoplimit"]
      },
      {
        "id": "GTD",
        "title": "GTD",
        "hasDatePicker": true,
        "hasTimePicker": true,
        "supportedOrderTypes": ["market", "limit", "stop", "stoplimit"]
      }
    ],
    "pullingInterval": {
      "quotes": 1000,
      "orders": 1000,
      "positions": 1000,
      "accountManager": 1500
    }
  }
}
```

### 12.2 Account-Level Capability Flags

From the `/accounts` response, each account exposes these capability flags:

| Flag | Value | Meaning |
|---|---|---|
| `supportDOM` | `true` | Depth of Market supported |
| `supportOrderBrackets` | `true` | Bracket orders (SL/TP on orders) |
| `supportPositionBrackets` | `false` | Bracket on existing positions |
| `supportClosePosition` | `true` | Can close/flatten positions |
| `supportEditAmount` | `true` | Can modify order quantity |
| `supportLevel2Data` | `true` | Level 2 market depth data |
| `supportMultiposition` | `false` | No multi-position (net position only) |
| `supportPLUpdate` | `false` | No real-time P/L push |
| `supportReducePosition` | `false` | Cannot partially reduce |
| `supportStopLimitOrders` | `true` | Stop-limit orders supported |
| `supportOrdersHistory` | `false` | No historical orders |
| `supportExecutions` | `true` | Execution/fill history available |
| `supportDigitalSignature` | `false` | No digital signature required |
| `supportBalances` | `false` | No separate balances endpoint |
| `supportPartialOrderExecution` | `true` | Partial fills supported |
| `supportTrailingStop` | `false` | Trailing stops NOT supported |
| `showQuantityInsteadOfAmount` | `true` | Show qty, not dollar amount |

---

## 13. Account State & Balance

### 13.1 Get Account State

**`GET https://tv-demo.tradovateapi.com/accounts/{accountId}/state?locale=en`**

**Polling interval:** Every **1500ms** (account manager interval)

**Response (200):**
```json
{
  "s": "ok",
  "d": {
    "balance": 50455.68,
    "unrealizedPl": 0.0,
    "equity": 50455.68,
    "amData": [
      [
        [
          "0.00",
          "0.00",
          "50455.68",
          "0.00",
          "50455.68",
          "0.00",
          "0.00",
          "0.00"
        ]
      ]
    ]
  }
}
```

### 13.2 `amData` Array Mapping

The `amData` nested array maps to the `accountManager` columns from `/config`:

| Index | Column | Sample Value |
|---|---|---|
| 0 | Total P/L | "0.00" |
| 1 | Open P/L | "0.00" |
| 2 | Net Liq | "50455.68" |
| 3 | Total Margin Used | "0.00" |
| 4 | Available Margin | "50455.68" |
| 5 | Day Margin | "0.00" |
| 6 | Initial Margin | "0.00" |
| 7 | Maintenance Margin | "0.00" |

### 13.3 Multi-Account State (Captured)

| Account ID | Balance | Equity |
|---|---|---|
| D18156785 | $50,455.68 | $50,455.68 |
| D30471976 | $50,308.40 | $50,308.40 |
| D40826081 | $249,983.42 | $249,983.42 |

---

## 14. Order Modification & Cancellation

### 14.1 Modify a Working Order

Based on the TradingView broker API contract and Tradovate integration pattern, order modification uses:

**`PUT https://tv-demo.tradovateapi.com/accounts/{accountId}/orders/{orderId}?locale=en`**

**Request Body (form-encoded):**
```
currentAsk=<current-ask>
currentBid=<current-bid>
limitPrice=<new-limit-price>
qty=<new-quantity>
stopLoss=<new-sl-price>
takeProfit=<new-tp-price>
```

> **Note:** Order modification was listed in capture gaps as "missing" — the endpoint pattern is inferred from TradingView's Broker API specification. The base pattern `PUT /accounts/{id}/orders/{orderId}` follows the standard REST convention used by the bridge layer.

### 14.2 Cancel a Working Order

**`DELETE https://tv-demo.tradovateapi.com/accounts/{accountId}/orders/{orderId}?locale=en`**

> **Note:** Also listed as a capture gap. The DELETE method follows TradingView's standard broker integration pattern.

### 14.3 Expected Cancel Response
```json
{
  "s": "ok"
}
```

After cancellation, the next polling cycle of `GET /orders` will show the order with `"status": "cancelled"`.

---

## 15. Position Close / Flatten

### 15.1 Close Position

Based on the `supportClosePosition: true` flag, the endpoint is:

**`DELETE https://tv-demo.tradovateapi.com/accounts/{accountId}/positions/{positionId}?locale=en`**

Or alternatively via the Tradovate native API:

**`POST https://demo.tradovateapi.com/v1/order/liquidateposition`**

**Request Body:**
```json
{
  "accountId": 18156785,
  "contractId": 12345,
  "admin": false
}
```

### 15.2 Reverse Position

Send a market order in the opposite direction with double quantity:
```
POST /accounts/{accountId}/orders?locale=en&requestId={id}

side=sell (if currently long)
type=market
qty=2 (to reverse 1-lot to -1)
```

> **Note:** Position close/flatten was a capture gap. These patterns are inferred from `supportClosePosition: true` and Tradovate's documented API.

---

## 16. TradingView WebSocket (Chart Data)

### 16.1 Connection

**URL:** `wss://data.tradingview.com/socket.io/websocket?from=chart%2F{chartId}%2F&date={date}&type=chart&auth=sessionid`

This is TradingView's proprietary data socket. Not used for trading, but relevant for understanding the full data flow.

### 16.2 Frame Protocol

TradingView uses a custom length-prefixed protocol:
```
~m~{length}~m~{json-payload}
```

Multiple messages can be concatenated in a single frame.

### 16.3 Message Types

| Message (`m` field) | Purpose |
|---|---|
| `qsd` | Quote stream data (watchlist updates) |
| `series_loading` | Chart series loading indicator |
| `timescale_update` | Chart time axis data |
| `study_loading` | Indicator/study loading |
| `symbol_resolved` | Symbol resolution result |
| `du` | Data update |

### 16.4 Sample `qsd` Message

```json
{
  "m": "qsd",
  "p": [
    "qs_multiplexer_watchlist_ytchjaQ2Vppi",
    {
      "n": "NASDAQ:PTON",
      "s": "ok",
      "v": {
        "financials_availability": 1,
        "earnings_availability": 1,
        "pro_name": "NASDAQ:PTON",
        "minmov": 1,
        "fractional": false,
        "currency_code": "USD",
        "provider_id": "ice",
        "variable_tick_size": "0.0001 1 0.01"
      }
    }
  ]
}
```

---

## 17. Error Handling Reference

### 17.1 API Error Response Format

```json
{
  "s": "error",
  "errmsg": "<human-readable error message>"
}
```

### 17.2 Captured Error Messages

| Error | Context |
|---|---|
| `"Cannot place order outside of market hours. Please check contract specifications or quote info to view market hours."` | All order placements during off-hours |

### 17.3 HTTP Error Codes

| Code | Endpoint | Meaning |
|---|---|---|
| 200 | All endpoints | Success |
| 404 | `/v1/user/item` | User item not found (requires proper auth) |
| 101 | WebSocket upgrade | Successful WS handshake |

### 17.4 Network Errors (Captured)

| Error | URL | Description |
|---|---|---|
| `net::ERR_FAILED` | `notifications.tradingview.com` | TradingView notification channel failure |
| `net::ERR_ABORTED` | `notifications.tradingview.com` | Request aborted |
| `signal is aborted without reason` | `tv-demo.tradovateapi.com/quotes` | Fetch cancelled (tab switching/navigation) |

---

## 18. Polling Intervals & Timing

Configured via `/config` → `pullingInterval`:

| Resource | Interval | Endpoint |
|---|---|---|
| **Quotes** | 1000ms | `GET /quotes?symbols=...` |
| **Orders** | 1000ms | `GET /accounts/{id}/orders` |
| **Positions** | 1000ms | `GET /accounts/{id}/positions` |
| **Account Manager** | 1500ms | `GET /accounts/{id}/state` |

### 18.1 Typical Polling Cycle

```
T+0ms    GET /quotes?symbols=MNQM6&accountId=D18156785
T+0ms    GET /accounts/D18156785/orders
T+0ms    GET /accounts/D18156785/positions
T+500ms  GET /accounts/D18156785/state
T+1000ms GET /quotes?symbols=MNQM6&accountId=D18156785   (repeat)
T+1000ms GET /accounts/D18156785/orders                   (repeat)
T+1000ms GET /accounts/D18156785/positions                (repeat)
T+1500ms GET /accounts/D18156785/state                    (repeat)
```

---

## 19. Capture Gaps & Next Steps

The following scenarios were **not captured** in these sessions (all orders were rejected due to off-market-hours):

| Gap | Status | Action Required |
|---|---|---|
| Token renewal | ❌ Missing | Run session long enough for JWT to expire and auto-renew |
| Instrument change/mapping | ❌ Missing | Search and switch symbols in TradingView |
| Real-time quote/depth stream | ❌ Missing | Open DOM panel during market hours |
| Market order fill | ❌ Missing | Place market order during market hours |
| Limit order fill | ❌ Missing | Place limit order at market during hours |
| Stop order capture | ❌ Missing | Place stop order during market hours |
| Bracket order fill | ❌ Missing | Place bracket and let it fill |
| Order modification | ❌ Missing | Modify working order price/qty |
| Order cancellation | ❌ Missing | Cancel a working order |
| Position close/flatten | ❌ Missing | Close an open position |
| SL/TP modification | ❌ Missing | Move bracket legs on working order |

> **Recommendation:** Re-run the capture extension during **US market hours** (CME futures: Sun 5pm – Fri 4pm CT) to capture successful fills, position updates, modifications, and cancellations.

---

## 20. Full Endpoint Summary Table

### 20.1 Authentication Endpoints

| Method | URL | Purpose | Auth |
|---|---|---|---|
| `GET` | `https://trader.tradovate.com/oauth?response_type=code&client_id=7742&scope=tradingview+demo&redirect_uri=...` | OAuth consent page | None |
| `GET` | `https://www.tradingview.com/trading/oauth-redirect/tradovate/?code=...&state=...` | OAuth redirect callback | None |
| `POST` | `https://live.tradovateapi.com/v1/auth/accesstokenrequest` | Get JWT access + market data tokens | Credentials |
| `POST` | `https://live.tradovateapi.com/v1/auth/oauthgrant` | Exchange OAuth code for grant | Bearer |
| `POST` | `https://live.tradovateapi.com/v1/auth/clientdetails` | Get app ACL permissions | Bearer |
| `GET` | `https://live.tradovateapi.com/v1/auth/getsocialappids` | Social login app IDs | None |
| `GET` | `https://live.tradovateapi.com/v1/user/item` | User profile lookup | Bearer |

### 20.2 TradingView Bridge Endpoints (tv-demo.tradovateapi.com)

| Method | URL | Purpose | Polling |
|---|---|---|---|
| `GET` | `/config?locale=en` | Broker capabilities, durations, polling config | Once |
| `GET` | `/accounts?locale=en` | List all trading accounts | Once |
| `GET` | `/accounts/{accountId}/state?locale=en` | Balance, equity, margin data | 1500ms |
| `GET` | `/accounts/{accountId}/orders?locale=en` | All orders for account | 1000ms |
| `GET` | `/accounts/{accountId}/positions?locale=en` | All positions for account | 1000ms |
| `GET` | `/accounts/{accountId}/instruments?locale=en` | Available instruments/contracts | Once |
| `GET` | `/accounts/{accountId}/executions?locale=en&instrument={sym}` | Execution/fill history | On demand |
| `GET` | `/quotes?locale=en&symbols={sym}&accountId={id}` | Live quotes (bid/ask/last/OHLCV) | 1000ms |
| `POST` | `/accounts/{accountId}/orders?locale=en&requestId={id}` | Place new order | On action |
| `PUT` | `/accounts/{accountId}/orders/{orderId}?locale=en` | Modify working order | On action |
| `DELETE` | `/accounts/{accountId}/orders/{orderId}?locale=en` | Cancel working order | On action |
| `DELETE` | `/accounts/{accountId}/positions/{posId}?locale=en` | Close/flatten position | On action |

### 20.3 WebSocket Endpoints (wss://demo.tradovateapi.com)

| Endpoint | Direction | Purpose |
|---|---|---|
| `authorize` | Client → Server | Authenticate WS with JWT token |
| `user/syncrequest` | Client → Server | Request full account state snapshot |
| `heartbeat` | Server → Client | Connection health check (~2.5s) |
| `keepalive` | Client → Server | Response to heartbeat |

### 20.4 Status & Discovery Endpoints

| Method | URL | Purpose |
|---|---|---|
| `GET` | `https://status.tradovateapi.com/whereisme` | Geo-location of client |
| `GET` | `https://status.tradovateapi.com/notifications` | System notifications |
| `GET` | `https://symbol-search.tradingview.com/symbol_search/` | TradingView symbol search |

### 20.5 Live vs Demo URL Mapping

| Purpose | Demo | Live |
|---|---|---|
| Auth | `live.tradovateapi.com` | `live.tradovateapi.com` |
| TV Bridge | `tv-demo.tradovateapi.com` | `tv.tradovateapi.com` (inferred) |
| REST API | `demo.tradovateapi.com` | `live.tradovateapi.com` |
| WebSocket | `wss://demo.tradovateapi.com/v1/websocket` | `wss://live.tradovateapi.com/v1/websocket` |
| Market Data WS | `wss://md-demo.tradovateapi.com/v1/websocket` | `wss://md.tradovateapi.com/v1/websocket` |

---

## Appendix A: Replication Guide for Internal Web Application

### A.1 Minimum Endpoints to Replicate Full Trading

To replicate the TradingView→Tradovate integration in your own web app:

1. **Auth:** `POST /v1/auth/accesstokenrequest` — get tokens
2. **WebSocket:** Connect `wss://demo.tradovateapi.com/v1/websocket` → `authorize` → `user/syncrequest`
3. **Instruments:** `GET /accounts/{id}/instruments` — load tradeable symbols
4. **Quotes:** Poll `GET /quotes?symbols=...` every 1s OR use market data WebSocket
5. **Place orders:** `POST /accounts/{id}/orders?requestId=...` with form-encoded body
6. **Monitor orders:** Poll `GET /accounts/{id}/orders` every 1s
7. **Monitor positions:** Poll `GET /accounts/{id}/positions` every 1s
8. **Monitor balance:** Poll `GET /accounts/{id}/state` every 1.5s
9. **Modify orders:** `PUT /accounts/{id}/orders/{orderId}`
10. **Cancel orders:** `DELETE /accounts/{id}/orders/{orderId}`
11. **Close positions:** `DELETE /accounts/{id}/positions/{posId}`

### A.2 Using Direct Tradovate API Instead of TV Bridge

For your internal app, you can bypass the TV Bridge and use Tradovate's native REST API directly:

| TV Bridge Endpoint | Native Tradovate Equivalent |
|---|---|
| `POST /accounts/{id}/orders` | `POST /v1/order/placeorder` |
| `PUT /accounts/{id}/orders/{id}` | `POST /v1/order/modifyorder` |
| `DELETE /accounts/{id}/orders/{id}` | `POST /v1/order/cancelorder` |
| `GET /accounts/{id}/positions` | `POST /v1/position/list` |
| `DELETE /accounts/{id}/positions/{id}` | `POST /v1/order/liquidateposition` |
| `GET /quotes` | `wss://md.tradovateapi.com` (subscribe) |
| `GET /accounts/{id}/state` | `POST /v1/cashBalance/list` + `POST /v1/account/list` |

### A.3 WebSocket Market Data (Alternative to Polling)

Instead of polling `/quotes` every second, connect to the market data WebSocket:

```
wss://md-demo.tradovateapi.com/v1/websocket

1. authorize with mdAccessToken
2. subscribe: md/subscribeQuote { symbol: "MNQM6" }
3. receive: real-time quote updates pushed by server
```

This eliminates the 1-second polling delay and provides true real-time data.

---

*Document generated from captured network traffic. Sections marked as "inferred" should be validated against live market-hours captures.*
