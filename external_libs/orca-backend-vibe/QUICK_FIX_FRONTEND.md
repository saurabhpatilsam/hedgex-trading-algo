# Frontend Quick Fix - Copy & Paste Solution

## 🎯 The Problem
Frontend is excessively polling `/api/v1/run-bot/configs` every 5 seconds, causing performance issues.

## ✅ The Solution

### For Bot Dashboard (Live Updates)

Replace your current polling code with this:

```typescript
import { useEffect, useState } from 'react'

function BotDashboard() {
  const [bots, setBots] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, paused: 0, stopped: 0 })

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
        
        const data = await response.json()
        setBots(data.bots)
        setStats({
          total: data.total,
          active: data.active,
          paused: data.paused,
          stopped: data.stopped
        })
      } catch (error) {
        console.error('Error fetching bots:', error)
      }
    }

    fetchBots() // Fetch immediately
    const interval = setInterval(fetchBots, 10000) // Then every 10 seconds

    return () => clearInterval(interval) // CRITICAL: Cleanup!
  }, [])

  return (
    <div>
      <h1>Active Bots ({stats.active} running)</h1>
      {bots.map(bot => (
        <div key={bot.bot_id}>
          {bot.custom_name} - {bot.status} - P&L: ${bot.total_pnl}
        </div>
      ))}
    </div>
  )
}
```

---

## 🔍 Find and Replace

### Step 1: Find the old code
```bash
cd /Users/amerjod/Desktop/OrcaVentrures/commander
grep -rn "/api/v1/run-bot/configs" src/
```

### Step 2: Look for patterns like this:
```typescript
// ❌ OLD (WRONG)
fetch('/api/v1/run-bot/configs')
```

### Step 3: Replace with:
```typescript
// ✅ NEW (CORRECT)
fetch('http://localhost:8000/api/bots/', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
    'Content-Type': 'application/json'
  }
})
```

---

## 📋 Checklist

- [ ] Found all files using `/api/v1/run-bot/configs`
- [ ] Changed endpoint to `/api/bots/`
- [ ] Added `return () => clearInterval(interval)` for cleanup
- [ ] Changed interval from 5 seconds to 10 seconds
- [ ] Tested in browser - verify only ONE request every 10 seconds
- [ ] Checked browser console for errors
- [ ] Verified bot data displays correctly

---

## 🧪 Test It Works

1. Open browser DevTools → Network tab
2. Should see: `GET http://localhost:8000/api/bots/` every 10 seconds
3. Should NOT see: `/api/v1/run-bot/configs` being polled
4. Check backend logs for: `Cache HIT for /api/bots/`

---

## 📞 Quick Help

**Q: Still seeing `/api/v1/run-bot/configs` being called?**
A: Search for ALL occurrences: `grep -r "run-bot/configs" src/`

**Q: Getting 401 Unauthorized?**
A: Check token exists: `console.log(localStorage.getItem('access_token'))`

**Q: Bots not updating?**
A: Verify cleanup function exists: `return () => clearInterval(interval)`

**Q: Multiple requests happening?**
A: Check if multiple components are each setting up intervals

---

## 📖 Full Documentation
See `FRONTEND_POLLING_GUIDE.md` for complete details, React Query examples, and advanced patterns.
