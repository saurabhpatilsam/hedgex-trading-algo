# Frontend Integration Example: Account Balances + Bot Management

This example shows how to integrate the new Account Balance API with the existing Bot Management system.

## Complete Dashboard Component Example

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

// Create axios instance with auth
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
});

function TradingDashboard() {
  // State for account balances
  const [balanceData, setBalanceData] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  
  // State for bots
  const [bots, setBots] = useState([]);
  const [botsLoading, setBotsLoading] = useState(true);
  
  // Configuration
  const USERNAME = 'APEX_136189'; // Your trading username
  
  // Fetch account balances
  const fetchBalances = async () => {
    try {
      const response = await api.get(`/api/accounts/balance/${USERNAME}`);
      setBalanceData(response.data);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setBalanceLoading(false);
    }
  };
  
  // Fetch bot status
  const fetchBots = async () => {
    try {
      const response = await api.get('/api/bots/');
      setBots(response.data);
    } catch (error) {
      console.error('Error fetching bots:', error);
    } finally {
      setBotsLoading(false);
    }
  };
  
  // Start a new bot
  const startBot = async (accountName) => {
    try {
      const response = await api.post('/api/v1/run-bot/max', {
        accountName: accountName,
        mode: 'live',
        contract: 'ES',
        dateFrom: new Date().toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0],
        point_key: 'default',
        exit_strategy_key: 'default',
        customName: `Trading_${accountName}_${Date.now()}`
      });
      
      // Refresh bot list after starting
      await fetchBots();
      return response.data;
    } catch (error) {
      console.error('Error starting bot:', error);
      throw error;
    }
  };
  
  // Control bot (pause/resume/stop)
  const controlBot = async (botId, action) => {
    try {
      const response = await api.post(`/api/bots/${botId}/${action}`);
      await fetchBots(); // Refresh after action
      return response.data;
    } catch (error) {
      console.error(`Error ${action} bot:`, error);
      throw error;
    }
  };
  
  // Setup polling
  useEffect(() => {
    // Initial fetch
    fetchBalances();
    fetchBots();
    
    // Poll every 30 seconds for balances
    const balanceInterval = setInterval(fetchBalances, 30000);
    
    // Poll every 5 seconds for bot status
    const botInterval = setInterval(fetchBots, 5000);
    
    // Cleanup
    return () => {
      clearInterval(balanceInterval);
      clearInterval(botInterval);
    };
  }, []);
  
  // Loading state
  if (balanceLoading || botsLoading) {
    return <div className="loading">Loading dashboard...</div>;
  }
  
  return (
    <div className="dashboard">
      <h1>Trading Dashboard</h1>
      
      {/* Account Balance Section */}
      <div className="balance-section">
        <h2>Account Balances</h2>
        {balanceData && (
          <div className="balance-summary">
            <div className="metric">
              <span>Total Cash Value:</span>
              <strong>${balanceData.total_cash_value.toFixed(2)}</strong>
            </div>
            <div className="metric">
              <span>Total P&L:</span>
              <strong className={balanceData.total_realized_pnl >= 0 ? 'profit' : 'loss'}>
                ${balanceData.total_realized_pnl.toFixed(2)}
              </strong>
            </div>
            <div className="metric">
              <span>Week P&L:</span>
              <strong className={balanceData.total_week_realized_pnl >= 0 ? 'profit' : 'loss'}>
                ${balanceData.total_week_realized_pnl.toFixed(2)}
              </strong>
            </div>
          </div>
        )}
        
        {/* Individual Account Cards */}
        <div className="accounts-grid">
          {balanceData?.accounts.map((account, idx) => (
            <div key={idx} className="account-card">
              <h3>{account.orca_name}</h3>
              {account.balance ? (
                <>
                  <div>Cash: ${account.balance.totalCashValue.toFixed(2)}</div>
                  <div>P&L: ${account.balance.realizedPnL.toFixed(2)}</div>
                  <div>Week: ${account.balance.weekRealizedPnL.toFixed(2)}</div>
                  <button 
                    onClick={() => startBot(account.orca_name)}
                    className="btn-primary"
                  >
                    Start Bot
                  </button>
                </>
              ) : (
                <div className="error">{account.error || 'No data'}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Active Bots Section */}
      <div className="bots-section">
        <h2>Active Bots</h2>
        <div className="bots-table">
          <table>
            <thead>
              <tr>
                <th>Bot Name</th>
                <th>Account</th>
                <th>Status</th>
                <th>P&L</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bots.map(bot => (
                <tr key={bot.id}>
                  <td>{bot.run_name || bot.id}</td>
                  <td>{bot.account_name}</td>
                  <td>
                    <span className={`status status-${bot.status}`}>
                      {bot.status}
                    </span>
                  </td>
                  <td>${bot.total_pnl?.toFixed(2) || '0.00'}</td>
                  <td>
                    {bot.status === 'running' && (
                      <button onClick={() => controlBot(bot.id, 'pause')}>
                        Pause
                      </button>
                    )}
                    {bot.status === 'paused' && (
                      <button onClick={() => controlBot(bot.id, 'resume')}>
                        Resume
                      </button>
                    )}
                    {bot.status !== 'stopped' && (
                      <button 
                        onClick={() => controlBot(bot.id, 'stop')}
                        className="btn-danger"
                      >
                        Stop
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TradingDashboard;
```

## CSS Styles (Optional)

```css
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.balance-section, .bots-section {
  margin-bottom: 30px;
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.balance-summary {
  display: flex;
  gap: 30px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 5px;
}

.metric {
  display: flex;
  flex-direction: column;
}

.metric span {
  color: #666;
  font-size: 12px;
}

.metric strong {
  font-size: 20px;
  margin-top: 5px;
}

.profit { color: #10b981; }
.loss { color: #ef4444; }

.accounts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
  margin-top: 20px;
}

.account-card {
  border: 1px solid #ddd;
  padding: 15px;
  border-radius: 5px;
  background: #fafafa;
}

.account-card h3 {
  margin-top: 0;
  font-size: 14px;
  color: #333;
}

.bots-table table {
  width: 100%;
  border-collapse: collapse;
}

.bots-table th {
  text-align: left;
  padding: 10px;
  background: #f5f5f5;
  border-bottom: 2px solid #ddd;
}

.bots-table td {
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.status {
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
}

.status-running { background: #10b981; color: white; }
.status-paused { background: #f59e0b; color: white; }
.status-stopped { background: #6b7280; color: white; }
.status-error { background: #ef4444; color: white; }

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-danger {
  background: #ef4444;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  opacity: 0.9;
}

.loading {
  text-align: center;
  padding: 50px;
  font-size: 18px;
  color: #666;
}

.error {
  color: #ef4444;
  font-size: 14px;
}
```

## Key Integration Points

### 1. Combined Data Display
- Show account balances alongside bot status
- Display which bots are running on which accounts
- Show combined P&L (account balance + bot performance)

### 2. Smart Bot Management
- Start bots directly from account cards
- Only show start button for accounts with positive balance
- Disable actions for accounts with errors

### 3. Real-time Updates
- Poll balances every 30 seconds (less frequent, more stable data)
- Poll bot status every 5 seconds (more frequent, operational data)
- Update UI immediately after bot actions

### 4. Error Handling
- Show account-specific errors inline
- Gracefully handle missing data
- Provide fallback UI for loading states

## API Endpoints Used

### Account Balance API
- `GET /api/accounts/balance/{username}` - Get all account balances
- `GET /api/accounts/balance/{username}/{orca_name}` - Get specific account
- `GET /api/accounts/balance/summary/{username}` - Get summary view

### Bot Management API
- `GET /api/bots/` - List all bots
- `POST /api/v1/run-bot/max` - Start new bot
- `POST /api/bots/{bot_id}/pause` - Pause bot
- `POST /api/bots/{bot_id}/resume` - Resume bot
- `POST /api/bots/{bot_id}/stop` - Stop bot

## Next Steps

1. **Add WebSocket Support**: Replace polling with WebSocket connections for real-time updates
2. **Add Charts**: Integrate charting library to show P&L over time
3. **Add Filtering**: Allow filtering accounts and bots by status, P&L, etc.
4. **Add Notifications**: Alert users when bots encounter errors or hit P&L thresholds
5. **Add Batch Operations**: Allow starting/stopping multiple bots at once
