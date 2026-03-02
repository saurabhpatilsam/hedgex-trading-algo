# Account Balance API Documentation

## Overview
The Account Balance API provides real-time trading account balance information from Tradovate. This API allows the frontend to display account balances, P&L, and other financial metrics.

## Base URL
```
http://localhost:8000/api/accounts
```

## Authentication
All endpoints require authentication via Bearer token in the Authorization header:
```javascript
headers: {
  'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
}
```

## Endpoints

### 1. Get All Account Balances
**GET** `/api/accounts/balance/{username}`

Fetches balance information for all trading accounts under a parent username.

**Parameters:**
- `username` (path, required): Parent username (e.g., "APEX_136189")

**Response:**
```json
{
  "username": "APEX_136189",
  "total_accounts": 3,
  "total_cash_value": 150000.50,
  "total_realized_pnl": 2500.75,
  "total_week_realized_pnl": 500.25,
  "accounts": [
    {
      "parent_account": "APEX_136189",
      "orca_name": "PAAPEX1361890000010",
      "tradovate_id": 123456,
      "balance": {
        "totalCashValue": 50000.00,
        "realizedPnL": 1000.00,
        "weekRealizedPnL": 200.00
      },
      "error": null
    }
  ]
}
```

### 2. Get Single Account Balance
**GET** `/api/accounts/balance/{username}/{orca_name}`

Fetches balance information for a specific trading account.

**Parameters:**
- `username` (path, required): Parent username
- `orca_name` (path, required): Specific account name

**Response:**
```json
{
  "parent_account": "APEX_136189",
  "orca_name": "PAAPEX1361890000010",
  "tradovate_id": 123456,
  "tradingView_id": "TV123456",
  "balance": {
    "totalCashValue": 50000.00,
    "realizedPnL": 1000.00,
    "weekRealizedPnL": 200.00
  },
  "error": null
}
```

### 3. Get Multiple Users' Balances
**POST** `/api/accounts/balance/multiple`

Fetches balance information for multiple parent usernames in a single request.

**Request Body:**
```json
{
  "usernames": ["APEX_136189", "APEX_136190", "APEX_136191"]
}
```

**Response:**
```json
{
  "users": [
    {
      "username": "APEX_136189",
      "total_accounts": 3,
      "total_cash_value": 150000.50,
      "total_realized_pnl": 2500.75,
      "total_week_realized_pnl": 500.25,
      "accounts": [...]
    }
  ],
  "total_users": 3,
  "errors": []
}
```

### 4. Get Balance Summary
**GET** `/api/accounts/balance/summary/{username}?include_zero_balance=true`

Get a simplified summary of all accounts for a username.

**Parameters:**
- `username` (path, required): Parent username
- `include_zero_balance` (query, optional): Include accounts with zero balance (default: true)

**Response:**
```json
{
  "username": "APEX_136189",
  "timestamp": null,
  "summary": {
    "total_accounts": 3,
    "active_accounts": 2,
    "total_cash_value": 150000.50,
    "total_realized_pnl": 2500.75,
    "total_week_realized_pnl": 500.25,
    "accounts_with_errors": 0
  },
  "accounts": [
    {
      "orca_name": "PAAPEX1361890000010",
      "tradovate_id": 123456,
      "cash_value": 50000.00,
      "realized_pnl": 1000.00,
      "status": "active"
    }
  ]
}
```

## Frontend Integration Examples

### React/JavaScript Example

```javascript
// Fetch all account balances
async function fetchAccountBalances(username) {
  try {
    const response = await fetch(`http://localhost:8000/api/accounts/balance/${username}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching account balances:', error);
    throw error;
  }
}

// Fetch specific account balance
async function fetchSingleAccountBalance(username, orcaName) {
  try {
    const response = await fetch(
      `http://localhost:8000/api/accounts/balance/${username}/${orcaName}`,
      {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching account balance:', error);
    throw error;
  }
}

// Fetch multiple users' balances (for dashboard)
async function fetchMultipleUsersBalances(usernames) {
  try {
    const response = await fetch('http://localhost:8000/api/accounts/balance/multiple', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usernames })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching multiple balances:', error);
    throw error;
  }
}

// React component example
function AccountBalanceDisplay() {
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Fetch balances every 30 seconds
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await fetchAccountBalances('APEX_136189');
        setBalances(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  if (loading) return <div>Loading balances...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <h2>Account Balances for {balances.username}</h2>
      <div>
        <p>Total Cash Value: ${balances.total_cash_value.toFixed(2)}</p>
        <p>Total Realized P&L: ${balances.total_realized_pnl.toFixed(2)}</p>
        <p>Week P&L: ${balances.total_week_realized_pnl.toFixed(2)}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Cash Value</th>
            <th>Realized P&L</th>
            <th>Week P&L</th>
          </tr>
        </thead>
        <tbody>
          {balances.accounts.map((account, index) => (
            <tr key={index}>
              <td>{account.orca_name}</td>
              <td>${account.balance?.totalCashValue?.toFixed(2) || 'N/A'}</td>
              <td>${account.balance?.realizedPnL?.toFixed(2) || 'N/A'}</td>
              <td>${account.balance?.weekRealizedPnL?.toFixed(2) || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## Error Handling

The API returns standard HTTP status codes:
- `200 OK`: Successful request
- `404 Not Found`: Account or username not found
- `500 Internal Server Error`: Server error (check logs)

Error responses include a detail field:
```json
{
  "detail": "No account with orca_name 'INVALID' found under username 'APEX_136189'"
}
```

## Rate Limiting

Consider implementing rate limiting on the frontend to avoid excessive API calls:
- Recommended: Fetch balances every 30-60 seconds for real-time updates
- Use caching to avoid redundant requests
- Batch requests using the multiple users endpoint when possible

## Notes

1. **Redis Dependency**: The API requires Redis to be running with proper tv_info and tokens stored
2. **Tradovate API**: The backend connects to Tradovate's demo API by default
3. **Real-time Data**: Balance data is fetched in real-time from Tradovate
4. **Error Handling**: Individual account errors don't fail the entire request - check the error field per account
