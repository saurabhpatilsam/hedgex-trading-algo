# Frontend Bot Management Integration - Debug Guide

## Issue: Bot Status Not Showing in Frontend After Starting Bot

### 🔍 **Root Cause Analysis**

The backend is working correctly (data is in database), so the issue is in the frontend:

1. **Frontend not calling the bot list API** after starting a bot
2. **CORS issues** preventing API calls
3. **Authentication tokens** not being sent correctly
4. **Data not being displayed** in UI even though it's fetched

---

## ✅ **Backend API Verification**

### Test if Backend is Working

Run these curl commands to verify the API:

```bash
# 1. Start a bot (replace with your auth token)
curl -X POST 'http://localhost:8000/api/v1/run-bot/max' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -d '{
    "accountName": "APEX",
    "accountsIds": ["ACC123"],
    "contract": "NQ",
    "way": "long",
    "exitStrategy": "standard",
    "pointPosition": "abc",
    "pointStrategy": "conservative",
    "environment": "PROD"
  }'

# Expected Response:
# {
#   "status": "queued",
#   "message": "Trading bot queued for execution",
#   "run_id": 20,
#   "bot_id": "orca_max_20_abc12345",
#   "run_name": "Max_HappyDolphin",
#   "note": "Use GET /api/v1/run-bot/configs/{run_id} to check status or GET /api/bots/{bot_id} for bot details"
# }

# 2. Get all bots
curl -X GET 'http://localhost:8000/api/bots/' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE'

# Expected Response:
# {
#   "bots": [
#     {
#       "bot_id": "orca_max_20_abc12345",
#       "custom_name": "Max_HappyDolphin",
#       "status": "running",
#       "instrument": "NQ",
#       "account_name": "APEX",
#       "total_pnl": 0.0,
#       "open_positions": 0,
#       "won_orders": 0,
#       "lost_orders": 0,
#       ...
#     }
#   ],
#   "total": 1,
#   "active": 1,
#   "paused": 0,
#   "stopped": 0,
#   "error": 0
# }

# 3. Get specific bot details
curl -X GET 'http://localhost:8000/api/bots/orca_max_20_abc12345' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE'
```

---

## 🐛 **Frontend Debugging Checklist**

### 1. **Check if API Call is Being Made**

Open browser DevTools (F12) → Network Tab:

- [ ] Do you see a request to `/api/bots/` after starting the bot?
- [ ] What is the status code? (should be 200)
- [ ] What is the response body?
- [ ] Are there any CORS errors in the console?

### 2. **Check Authentication**

In Network tab, click on the `/api/bots/` request:
- [ ] Headers → Request Headers → Is `Authorization: Bearer <token>` present?
- [ ] If missing, the frontend needs to add the auth token

### 3. **Check Response Format**

In Network tab, click on the `/api/bots/` response:
- [ ] Is the response body valid JSON?
- [ ] Does it match the expected format above?
- [ ] Are the `bots` array populated?

### 4. **Check Frontend State Management**

In React DevTools or Vue DevTools:
- [ ] Is the bot data being stored in state/store?
- [ ] Is the component re-rendering after data is fetched?
- [ ] Are there any JavaScript errors in the console?

---

## 🔧 **Frontend Implementation Fix**

### **Issue 1: Frontend Not Polling After Bot Start**

The frontend should:
1. Start the bot via `POST /api/v1/run-bot/max`
2. **Immediately** call `GET /api/bots/` to refresh the list
3. **Poll** `GET /api/bots/` every 5 seconds to get updates

**Example Implementation:**

```typescript
// After starting bot
async function startBot(config: BotConfig) {
  try {
    // 1. Start the bot
    const response = await axios.post('/api/v1/run-bot/max', config, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const { bot_id, run_name } = response.data;
    console.log(`Bot started: ${run_name} (${bot_id})`);
    
    // 2. IMMEDIATELY fetch updated bot list
    await fetchBots();
    
    // 3. Show success notification
    toast.success(`Bot ${run_name} started successfully!`);
    
  } catch (error) {
    console.error('Failed to start bot:', error);
    toast.error('Failed to start bot');
  }
}

// Fetch all bots
async function fetchBots() {
  try {
    const response = await axios.get('/api/bots/', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Fetched bots:', response.data);
    
    // Update state
    setBots(response.data.bots);
    setStats({
      total: response.data.total,
      active: response.data.active,
      paused: response.data.paused,
      stopped: response.data.stopped,
      error: response.data.error
    });
    
  } catch (error) {
    console.error('Failed to fetch bots:', error);
  }
}

// Set up polling
useEffect(() => {
  // Initial fetch
  fetchBots();
  
  // Poll every 5 seconds
  const interval = setInterval(() => {
    fetchBots();
  }, 5000);
  
  return () => clearInterval(interval);
}, []);
```

---

### **Issue 2: CORS Not Configured**

If you see CORS errors in the console, check backend CORS settings:

```python
# In app/orca_api.py
from fastapi.middleware.cors import CORSMiddleware

api_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Add your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### **Issue 3: Auth Token Not Being Sent**

Make sure the frontend is sending the auth token:

```typescript
// Set up axios interceptor
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
```

---

## 📊 **Complete Frontend Integration Code**

### **React + TypeScript Example**

```typescript
import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Bot {
  bot_id: string;
  custom_name: string | null;
  status: 'initializing' | 'running' | 'paused' | 'stopped' | 'error';
  instrument: string;
  account_name: string;
  total_pnl: number;
  open_positions: number;
  won_orders: number;
  lost_orders: number;
  start_time: string;
}

interface BotListResponse {
  bots: Bot[];
  total: number;
  active: number;
  paused: number;
  stopped: number;
  error: number;
}

const BotManagementDashboard: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, paused: 0, stopped: 0, error: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API base URL
  const API_BASE_URL = 'http://localhost:8000';
  const token = localStorage.getItem('auth_token');

  // Fetch all bots
  const fetchBots = async () => {
    try {
      console.log('Fetching bots...');
      const response = await axios.get<BotListResponse>(`${API_BASE_URL}/api/bots/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('Bots fetched:', response.data);
      setBots(response.data.bots);
      setStats({
        total: response.data.total,
        active: response.data.active,
        paused: response.data.paused,
        stopped: response.data.stopped,
        error: response.data.error
      });
      setError(null);
    } catch (err: any) {
      console.error('Error fetching bots:', err);
      setError(err.response?.data?.detail || 'Failed to fetch bots');
    }
  };

  // Start a bot
  const startBot = async (config: any) => {
    setLoading(true);
    try {
      console.log('Starting bot with config:', config);
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/run-bot/max`,
        config,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      console.log('Bot started:', response.data);
      
      // IMPORTANT: Fetch bots immediately after starting
      await fetchBots();
      
      alert(`Bot ${response.data.run_name} started successfully!`);
    } catch (err: any) {
      console.error('Error starting bot:', err);
      alert('Failed to start bot: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Pause bot
  const pauseBot = async (botId: string) => {
    try {
      await axios.post(
        `${API_BASE_URL}/api/bots/${botId}/pause`,
        { performed_by: 'user@example.com' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      // Refresh list
      await fetchBots();
      alert('Bot paused successfully');
    } catch (err: any) {
      alert('Failed to pause bot: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Resume bot
  const resumeBot = async (botId: string) => {
    try {
      await axios.post(
        `${API_BASE_URL}/api/bots/${botId}/resume`,
        { performed_by: 'user@example.com' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      // Refresh list
      await fetchBots();
      alert('Bot resumed successfully');
    } catch (err: any) {
      alert('Failed to resume bot: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Stop bot
  const stopBot = async (botId: string) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    
    try {
      await axios.post(
        `${API_BASE_URL}/api/bots/${botId}/stop`,
        { performed_by: 'user@example.com' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      // Refresh list
      await fetchBots();
      alert('Bot stopped successfully');
    } catch (err: any) {
      alert('Failed to stop bot: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'stopped': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };

  // Format P&L
  const formatPnL = (value: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(value));
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  // Set up polling
  useEffect(() => {
    console.log('Component mounted, starting bot polling...');
    
    // Initial fetch
    fetchBots();
    
    // Poll every 5 seconds
    const interval = setInterval(() => {
      console.log('Polling bots...');
      fetchBots();
    }, 5000);
    
    return () => {
      console.log('Component unmounting, stopping polling');
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Bot Management Dashboard</h1>
      
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-gray-600">Total Bots</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-green-50 p-4 rounded shadow">
          <div className="text-gray-600">Active</div>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded shadow">
          <div className="text-gray-600">Paused</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.paused}</div>
        </div>
        <div className="bg-gray-50 p-4 rounded shadow">
          <div className="text-gray-600">Stopped</div>
          <div className="text-2xl font-bold text-gray-600">{stats.stopped}</div>
        </div>
        <div className="bg-red-50 p-4 rounded shadow">
          <div className="text-gray-600">Error</div>
          <div className="text-2xl font-bold text-red-600">{stats.error}</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Bot List */}
      <div className="space-y-4">
        {bots.length === 0 ? (
          <div className="bg-gray-100 p-8 rounded text-center text-gray-500">
            No bots running. Start a bot to see it here!
          </div>
        ) : (
          bots.map((bot) => (
            <div key={bot.bot_id} className="bg-white p-6 rounded shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold">
                    {bot.custom_name || bot.bot_id}
                  </h3>
                  <p className="text-gray-600 text-sm">{bot.bot_id}</p>
                </div>
                <span className={`px-3 py-1 rounded text-white ${getStatusColor(bot.status)}`}>
                  {bot.status.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-4 mt-4">
                <div>
                  <div className="text-gray-600 text-sm">Instrument</div>
                  <div className="font-semibold">{bot.instrument}</div>
                </div>
                <div>
                  <div className="text-gray-600 text-sm">Account</div>
                  <div className="font-semibold">{bot.account_name}</div>
                </div>
                <div>
                  <div className="text-gray-600 text-sm">P&L</div>
                  <div className={`font-semibold ${bot.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPnL(bot.total_pnl)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600 text-sm">Win Rate</div>
                  <div className="font-semibold">
                    {bot.won_orders + bot.lost_orders > 0
                      ? `${((bot.won_orders / (bot.won_orders + bot.lost_orders)) * 100).toFixed(1)}%`
                      : 'N/A'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {bot.status === 'running' && (
                  <button
                    onClick={() => pauseBot(bot.bot_id)}
                    className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    ⏸️ Pause
                  </button>
                )}
                {bot.status === 'paused' && (
                  <button
                    onClick={() => resumeBot(bot.bot_id)}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    ▶️ Resume
                  </button>
                )}
                {(bot.status === 'running' || bot.status === 'paused') && (
                  <button
                    onClick={() => stopBot(bot.bot_id)}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    ⏹️ Stop
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BotManagementDashboard;
```

---

## 🔄 **Quick Fix Summary**

1. **Add polling** to `GET /api/bots/` every 5 seconds
2. **Fetch bots immediately** after starting a bot
3. **Add console.log** statements to debug API calls
4. **Check browser DevTools** Network tab for API calls
5. **Verify auth token** is being sent in headers
6. **Display bot data** in UI with proper state management

---

## 📞 **Still Not Working?**

Run this test in browser console:

```javascript
// Test API directly from browser
fetch('http://localhost:8000/api/bots/', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN_HERE'
  }
})
.then(r => r.json())
.then(data => console.log('Bots:', data))
.catch(err => console.error('Error:', err));
```

If this works, the backend is fine. The issue is in the frontend React/Vue code not calling the API or not displaying the data.
