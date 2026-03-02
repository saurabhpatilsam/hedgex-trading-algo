# Frontend Polling - Best Practices Guide

## 🎯 Problem Identified
The frontend is excessively polling `/api/v1/run-bot/configs` which is causing:
- Unnecessary database load
- Network congestion
- Wrong endpoint for live bot updates

---

## ✅ OPTIMAL SOLUTION

### Backend Changes (COMPLETED)
- ✅ Added 3-second cache to `/api/bots/` endpoint
- ✅ Added 5-second cache to `/api/v1/run-bot/configs` endpoint
- ✅ Optimized both endpoints for efficient polling

### Frontend Changes Required

---

## 📱 Correct Polling Strategy

### 1. For Live Bot Dashboard - Use `/api/bots/`

**When**: User is viewing the active bots dashboard
**Poll Interval**: Every 10 seconds
**Endpoint**: `GET /api/bots/`

#### React Implementation (TypeScript)

```typescript
// components/TradingBotsTab.tsx or BotDashboard.tsx

import { useEffect, useState } from 'react'

interface Bot {
  bot_id: string
  custom_name: string
  status: 'initializing' | 'running' | 'paused' | 'stopped' | 'error'
  instrument: string
  account_name: string
  total_pnl: number
  open_positions: number
  closed_positions: number
  active_orders: number
  won_orders: number
  lost_orders: number
  start_time: string
  last_health_check: string
}

interface BotListResponse {
  bots: Bot[]
  total: number
  active: number
  paused: number
  stopped: number
  error: number
  timestamp: string
}

function BotDashboard() {
  const [bots, setBots] = useState<Bot[]>([])
  const [stats, setStats] = useState({ total: 0, active: 0, paused: 0, stopped: 0, error: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBots = async () => {
      try {
        const token = localStorage.getItem('access_token')
        const response = await fetch('http://localhost:8000/api/bots/', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data: BotListResponse = await response.json()
        setBots(data.bots)
        setStats({
          total: data.total,
          active: data.active,
          paused: data.paused,
          stopped: data.stopped,
          error: data.error
        })
        setLoading(false)
        
        console.log(`✅ Fetched ${data.bots.length} bots at ${data.timestamp}`)
      } catch (error) {
        console.error('Error fetching bots:', error)
        setLoading(false)
      }
    }

    // Fetch immediately on mount
    fetchBots()

    // Set up polling - every 10 seconds
    const interval = setInterval(fetchBots, 10000)

    // CRITICAL: Cleanup interval when component unmounts
    return () => {
      clearInterval(interval)
      console.log('🧹 Cleaned up bot polling interval')
    }
  }, []) // Empty dependency array - only run on mount/unmount

  if (loading) {
    return <div>Loading bots...</div>
  }

  return (
    <div>
      <h1>Active Bots ({stats.active} running)</h1>
      <div className="stats">
        <span>Total: {stats.total}</span>
        <span>Running: {stats.active}</span>
        <span>Paused: {stats.paused}</span>
        <span>Stopped: {stats.stopped}</span>
        <span>Error: {stats.error}</span>
      </div>
      <div className="bot-list">
        {bots.map(bot => (
          <BotCard key={bot.bot_id} bot={bot} />
        ))}
      </div>
    </div>
  )
}

export default BotDashboard
```

---

### 2. For Run History View - Use `/api/v1/run-bot/configs`

**When**: User wants to see historical run records
**Poll Interval**: DO NOT POLL - Fetch once on mount
**Endpoint**: `GET /api/v1/run-bot/configs`

#### React Implementation

```typescript
// components/RunHistoryTab.tsx

import { useEffect, useState } from 'react'

interface RunConfig {
  id: number
  status: string
  created_at: string
  config: any
  // ... other fields
}

function RunHistoryTab() {
  const [configs, setConfigs] = useState<RunConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRunHistory = async () => {
      try {
        const token = localStorage.getItem('access_token')
        const response = await fetch('http://localhost:8000/api/v1/run-bot/configs', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        
        const data = await response.json()
        setConfigs(data.configs)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching run history:', error)
        setLoading(false)
      }
    }

    // Fetch ONCE on mount - NO POLLING
    fetchRunHistory()

    // No interval needed for history view
  }, [])

  if (loading) {
    return <div>Loading history...</div>
  }

  return (
    <div>
      <h1>Run History</h1>
      <button onClick={() => window.location.reload()}>Refresh</button>
      <div className="history-list">
        {configs.map(config => (
          <HistoryCard key={config.id} config={config} />
        ))}
      </div>
    </div>
  )
}

export default RunHistoryTab
```

---

### 3. Using React Query (RECOMMENDED)

For better performance and automatic caching:

```typescript
// Install: npm install @tanstack/react-query

import { useQuery } from '@tanstack/react-query'

const fetchBots = async (): Promise<BotListResponse> => {
  const token = localStorage.getItem('access_token')
  const response = await fetch('http://localhost:8000/api/bots/', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch bots')
  }
  
  return response.json()
}

function BotDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bots'],
    queryFn: fetchBots,
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 3000, // Consider data fresh for 3 seconds (matches backend cache)
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h1>Active Bots ({data.active} running)</h1>
      <div className="bot-list">
        {data.bots.map(bot => (
          <BotCard key={bot.bot_id} bot={bot} />
        ))}
      </div>
    </div>
  )
}
```

---

## 🔍 How to Find and Fix Existing Polling

### Step 1: Search for Polling Code

In your frontend `/Users/amerjod/Desktop/OrcaVentrures/commander` directory:

```bash
# Search for setInterval
grep -r "setInterval" src/

# Search for the old endpoint
grep -r "/api/v1/run-bot/configs" src/

# Search for useInterval (custom hook)
grep -r "useInterval" src/
```

### Step 2: Identify Components Polling

Look for patterns like:
```typescript
useEffect(() => {
  setInterval(...)  // ❌ BAD - no cleanup
}, [])

useEffect(() => {
  const interval = setInterval(...)
  // Missing return statement  // ❌ BAD - memory leak
}, [])
```

### Step 3: Fix Each Occurrence

**BEFORE (Wrong)**:
```typescript
useEffect(() => {
  setInterval(() => {
    fetch('/api/v1/run-bot/configs')
      .then(res => res.json())
      .then(data => setConfigs(data.configs))
  }, 5000)
}, [])
```

**AFTER (Correct)**:
```typescript
useEffect(() => {
  const fetchBots = async () => {
    const response = await fetch('/api/bots/', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await response.json()
    setBots(data.bots)
  }

  fetchBots() // Fetch immediately
  const interval = setInterval(fetchBots, 10000) // Then every 10 seconds

  return () => clearInterval(interval) // ✅ CLEANUP
}, [])
```

---

## 📊 Comparison Table

| Aspect | OLD (Wrong) | NEW (Correct) |
|--------|-------------|---------------|
| **Endpoint** | `/api/v1/run-bot/configs` | `/api/bots/` |
| **Purpose** | Historical runs | Live bot status |
| **Polling** | Yes (5 seconds) | Yes (10 seconds) |
| **Cleanup** | ❌ Missing | ✅ Proper cleanup |
| **Caching** | None | Backend: 3s, Frontend: React Query |
| **Data** | Run records | Live bot state + metrics |

---

## 🎯 Action Items for Frontend Developer

### Immediate Actions (HIGH PRIORITY)

1. **Find All Polling Code**
   ```bash
   cd /Users/amerjod/Desktop/OrcaVentrures/commander
   grep -rn "setInterval" src/ --include="*.tsx" --include="*.ts"
   grep -rn "/api/v1/run-bot/configs" src/
   ```

2. **For Each Bot Dashboard Component**:
   - ✅ Change endpoint from `/api/v1/run-bot/configs` to `/api/bots/`
   - ✅ Add proper cleanup: `return () => clearInterval(interval)`
   - ✅ Increase interval from 5s to 10s
   - ✅ Add error handling

3. **For Run History Views**:
   - ✅ Keep endpoint `/api/v1/run-bot/configs`
   - ✅ Remove polling (fetch once only)
   - ✅ Add manual refresh button

### Medium Priority

4. **Consider React Query**
   - Automatic caching
   - Automatic refetching
   - Better performance
   - Less code to maintain

5. **Add Loading States**
   - Show "Updating..." indicator during refetch
   - Show last updated timestamp
   - Handle errors gracefully

---

## 🐛 Common Mistakes to Avoid

### ❌ WRONG: Multiple Components Polling
```typescript
// NavBar.tsx
useEffect(() => {
  setInterval(fetchBots, 5000) // Polling #1
}, [])

// Dashboard.tsx
useEffect(() => {
  setInterval(fetchBots, 5000) // Polling #2
}, [])

// Sidebar.tsx
useEffect(() => {
  setInterval(fetchBots, 5000) // Polling #3
}, [])

// Result: 3x the requests! 😱
```

### ✅ CORRECT: Centralized State Management
```typescript
// Use React Context or React Query to share data
// Only ONE component polls, others read from shared state

// BotProvider.tsx
const BotContext = createContext()

export function BotProvider({ children }) {
  const { data } = useQuery({
    queryKey: ['bots'],
    queryFn: fetchBots,
    refetchInterval: 10000
  })

  return (
    <BotContext.Provider value={data}>
      {children}
    </BotContext.Provider>
  )
}

// Other components just consume the context
function Dashboard() {
  const bots = useContext(BotContext)
  return <div>{bots.length} bots</div>
}
```

---

## 🔧 Testing Your Changes

### 1. Check Network Tab
Open browser DevTools → Network tab:
- Should see `/api/bots/` called every 10 seconds
- Should NOT see `/api/v1/run-bot/configs` being polled
- Should see HTTP 304 (cached) responses

### 2. Check Backend Logs
```bash
# Should see cache hits
2025-11-29 16:00:00 | DEBUG | Cache HIT for /api/bots/
2025-11-29 16:00:10 | DEBUG | Cache HIT for /api/bots/
2025-11-29 16:00:13 | DEBUG | Cache MISS for /api/bots/ - fetching fresh data
```

### 3. Monitor Performance
- Reduced database queries
- Faster response times
- Lower CPU usage

---

## 📞 Need Help?

Common issues:

**"Still seeing multiple calls"**
→ Check if multiple components are each setting up their own intervals

**"Bots not updating"**
→ Verify cleanup function is working, check browser console for errors

**"Cache not working"**
→ Backend cache is 3 seconds, normal to see some database queries

**"Unauthorized errors"**
→ Check token is valid: `localStorage.getItem('access_token')`

---

## ✅ Success Criteria

Your frontend is optimized when:
- ✅ Only ONE request to `/api/bots/` every 10 seconds
- ✅ No polling of `/api/v1/run-bot/configs` (fetch once only)
- ✅ Proper cleanup on component unmount
- ✅ Backend logs show cache hits
- ✅ Network tab shows reasonable request frequency

---

**Backend Status**: ✅ Optimized and ready
**Frontend Status**: ⏳ Needs updates as described above
