# Bot Management API - Quick Reference for Frontend

## 🎯 **TL;DR - What You Need to Do**

After starting a bot, the frontend **MUST**:
1. ✅ Call `GET /api/bots/` immediately to refresh the list
2. ✅ Poll `GET /api/bots/` every 5 seconds to get updates
3. ✅ Display the bots in the UI

---

## 📡 **Essential API Endpoints**

### **1. Start Bot**
```
POST /api/v1/run-bot/max
Headers: Authorization: Bearer <token>
Body: { bot config }

Response (202):
{
  "status": "queued",
  "run_id": 20,
  "bot_id": "orca_max_20_abc12345",
  "run_name": "Max_HappyDolphin"
}
```

### **2. Get All Bots** ⭐ MOST IMPORTANT
```
GET /api/bots/  (NOTE: /api/bots/ not /api/v1/bots/)
Headers: Authorization: Bearer <token>

Response (200):
{
  "bots": [
    {
      "bot_id": "orca_max_20_abc12345",
      "custom_name": "Max_HappyDolphin",
      "status": "running",
      "instrument": "NQ",
      "account_name": "APEX",
      "total_pnl": 125.50,
      "open_positions": 2,
      "won_orders": 5,
      "lost_orders": 1,
      "start_time": "2025-11-15T13:00:00Z"
    }
  ],
  "total": 1,
  "active": 1,
  "paused": 0,
  "stopped": 0,
  "error": 0
}
```

### **3. Get Bot Details**
```
GET /api/bots/{bot_id}
Headers: Authorization: Bearer <token>

Response (200):
{
  "bot": { ... bot data ... },
  "recent_actions": [ ... ],
  "config": { ... }
}
```

### **4. Pause Bot**
```
POST /api/bots/{bot_id}/pause
Headers: Authorization: Bearer <token>
Body: { "performed_by": "user@example.com" }

Response (200):
{
  "success": true,
  "message": "Bot paused successfully",
  "bot_id": "orca_max_20_abc12345",
  "action": "pause",
  "new_status": "paused"
}
```

### **5. Resume Bot**
```
POST /api/bots/{bot_id}/resume
Headers: Authorization: Bearer <token>
Body: { "performed_by": "user@example.com" }
```

### **6. Stop Bot**
```
POST /api/bots/{bot_id}/stop
Headers: Authorization: Bearer <token>
Body: { "performed_by": "user@example.com" }
```

---

## 💻 **Minimal Working Code**

### **Option A: Plain JavaScript/Fetch**

```javascript
const API_BASE = 'http://localhost:8000';
const token = localStorage.getItem('auth_token');

// Fetch all bots
async function getBots() {
  const response = await fetch(`${API_BASE}/api/bots/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  console.log('Bots:', data);
  return data;
}

// Start bot
async function startBot(config) {
  const response = await fetch(`${API_BASE}/api/v1/run-bot/max`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  });
  const data = await response.json();
  
  // IMPORTANT: Fetch bots immediately after starting
  await getBots();
  
  return data;
}

// Auto-refresh every 5 seconds
setInterval(getBots, 5000);
```

### **Option B: Axios**

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  }
});

// Fetch all bots
const getBots = async () => {
  const { data } = await api.get('/api/bots/');
  console.log('Bots:', data);
  return data;
};

// Start bot
const startBot = async (config) => {
  const { data } = await api.post('/api/v1/run-bot/max', config);
  
  // IMPORTANT: Fetch bots immediately after starting
  await getBots();
  
  return data;
};

// Auto-refresh
setInterval(getBots, 5000);
```

---

## 🔍 **Debugging Steps**

### **Step 1: Open Browser DevTools**
Press `F12` → Go to **Network** tab

### **Step 2: Start a Bot**
Click the start bot button in your UI

### **Step 3: Check These Things**

✅ **Look for request to `/api/v1/run-bot/max`:**
- Status should be `202 Accepted`
- Response should have `bot_id` and `run_name`

✅ **Look for request to `/api/bots/` after starting:**
- Should happen immediately after starting
- Status should be `200 OK`
- Response should have `bots` array

❌ **If you DON'T see `/api/bots/` request:**
- The frontend is NOT calling the API
- Add `await getBots()` after starting bot

❌ **If you see CORS error:**
- Check console for errors like "Access-Control-Allow-Origin"
- Backend needs to add your frontend URL to CORS

❌ **If you see 401 Unauthorized:**
- Auth token is missing or invalid
- Check `localStorage.getItem('auth_token')`

---

## 🎨 **UI States to Handle**

```javascript
// Bot statuses
const STATUS = {
  INITIALIZING: 'initializing',  // Just started
  RUNNING: 'running',            // Active trading
  PAUSED: 'paused',              // Temporarily stopped
  STOPPED: 'stopped',            // Permanently stopped
  ERROR: 'error'                 // Something went wrong
};

// Show buttons based on status
function getBotControls(bot) {
  if (bot.status === STATUS.RUNNING) {
    return ['Pause', 'Stop'];
  } else if (bot.status === STATUS.PAUSED) {
    return ['Resume', 'Stop'];
  } else if (bot.status === STATUS.STOPPED) {
    return [];  // No controls for stopped bots
  }
}

// Format P&L with color
function formatPnL(value) {
  const color = value >= 0 ? 'text-green-600' : 'text-red-600';
  const sign = value >= 0 ? '+' : '';
  return `<span class="${color}">${sign}$${value.toFixed(2)}</span>`;
}
```

---

## 🚨 **Common Mistakes**

### ❌ **Mistake 1: Not Calling API After Starting Bot**
```javascript
// WRONG ❌
async function startBot(config) {
  await api.post('/api/v1/run-bot/max', config);
  // Missing: getBots() call
}

// CORRECT ✅
async function startBot(config) {
  await api.post('/api/v1/run-bot/max', config);
  await getBots();  // Fetch immediately
}
```

### ❌ **Mistake 2: Not Polling for Updates**
```javascript
// WRONG ❌
useEffect(() => {
  getBots();  // Only fetches once
}, []);

// CORRECT ✅
useEffect(() => {
  getBots();
  const interval = setInterval(getBots, 5000);
  return () => clearInterval(interval);
}, []);
```

### ❌ **Mistake 3: Missing Auth Header**
```javascript
// WRONG ❌
fetch('/api/bots/')

// CORRECT ✅
fetch('/api/bots/', {
  headers: { 'Authorization': `Bearer ${token}` }
})
```

---

## 📊 **Expected Flow**

```
User clicks "Start Bot"
      ↓
POST /api/v1/run-bot/max (202 response)
      ↓
Immediately call GET /api/bots/
      ↓
Update UI with new bot
      ↓
Poll GET /api/bots/ every 5 seconds
      ↓
Update UI with bot status changes
```

---

## 🧪 **Quick Test in Browser Console**

Paste this in your browser console to test if API works:

```javascript
// Test fetching bots
fetch('http://localhost:8000/api/bots/', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  }
})
.then(r => r.json())
.then(data => {
  console.log('✅ API Works!');
  console.log('Total Bots:', data.total);
  console.log('Active Bots:', data.active);
  console.table(data.bots);
})
.catch(err => {
  console.error('❌ API Failed:', err);
});
```

If this works, your backend is fine. The issue is in your React/Vue component not calling the API or not displaying the data.

---

## 📞 **Need Help?**

1. Run `python test_bot_api.py` to verify backend
2. Check `FRONTEND_DEBUG_GUIDE.md` for detailed debugging
3. Look at browser DevTools Network tab
4. Check console for JavaScript errors

The backend is confirmed working (data in database). The issue is frontend not calling/displaying the API data.
