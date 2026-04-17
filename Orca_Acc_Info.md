# Orca Account Information & Tradovate Endpoints

This document explains how the HedgeX/Orca dashboard fetches and calculates account data (Account Name, Balance, Liquidation Limit, and Buffer) from the Tradovate (trade-away) API. 

All API integrations are handled by the `TradovateClient` in the `backend/required_api/tradovate_client.py` service.

---

## 1. Account Details (Name, ID, Status)

We retrieve the master list of sub-accounts and their basic information (like the account names: Arjun, Manish, Amir) by merging data from two separate endpoints.

**Method:** `TradovateClient.get_subaccounts()`

- **TradingView Accounts API:**
  - **Endpoint:** `GET https://tv-demo.tradovateapi.com/accounts?locale=en`
  - **Purpose:** Fetches the basic account profile, names, and currency.
- **Tradovate Native API:**
  - **Endpoint:** `GET https://demo.tradovateapi.com/v1/account/list`
  - **Purpose:** Fetches status flags indicating whether the account is active, restricted, or closed.

---

## 2. Real-Time Balance

To retrieve the current liquid balance for any specific account, we query the TradingView-branded state endpoint.

**Method:** `TradovateClient.get_account_balance(account_id)`

- **Endpoint:** `GET https://tv-demo.tradovateapi.com/accounts/{account_id}/state?locale=en`
- **Purpose:** Returns the live balance, equity, and state of the associated sub-account.

---

## 3. Liquidation Limit (Auto-Liquidation Threshold)

Tradovate doesn't expose the final liquidation threshold as a single value. Instead, we calculate it dynamically by fetching the peak balance and the configured trailing drawdown width.

**Method:** `TradovateClient.get_drawdown_limits()`

- **Peak Balance (`maxNetLiq`):**
  - **Endpoint:** `GET https://demo.tradovateapi.com/v1/accountRiskStatus/list`
  - **Purpose:** Fetches the highest balance (high-watermark) the account has ever reached.
- **Trailing Drawdown Width (`trailingMaxDrawdown`):**
  - **Endpoint:** `GET https://demo.tradovateapi.com/v1/userAccountAutoLiq/list`
  - **Purpose:** Fetches the rule-based trailing distance for the evaluation (e.g., $2,500).

**The Calculation:**
```python
Liquidation Limit = Peak Balance (maxNetLiq) - Trailing Drawdown Width (trailingMaxDrawdown)
```

---

## 4. Account Buffer

The **Buffer** represents the amount of money an account can lose before hitting its liquidation limit. 

Unlike the other metrics, the buffer is **NOT** fetched from the backend or the Tradovate API. It is calculated securely on the Client-Side (Frontend) and rendered by React.

**Location:** `frontend/src/components/AccountManager.jsx` (Approx. Line 756)

**The Calculation:**
```javascript
// Example JavaScript from the React Dashboard
const buffer = hasDD ? acct.balance - acct.drawdown_limit : null;
```
This takes the real-time **Balance** (from step 2) and simply subtracts the **Liquidation Limit** (calculated in step 3).

---

## Authentication Requisites

To utilize any of the raw Tradovate endpoints listed above, requests **must** include an injected JWT Token in the headers:
```json
{
  "Authorization": "Bearer <ACCESS_TOKEN>"
}
```
Currently, tokens are pooled and cached dynamically using an Azure Redis instance, reducing rate-limits and API bans via the backend pipeline.
