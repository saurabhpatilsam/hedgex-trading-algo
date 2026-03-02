# Bot Management API - Frontend Integration Guide

## Overview
The bot management system provides real-time status tracking and control for trading bots. All bot states are stored in Supabase (not Redis anymore) and accessible via REST API endpoints.

## Authentication
All endpoints require authentication via Bearer token:
```
Authorization: Bearer <token>
```

## Base URL
```
http://localhost:8000/api/bots
```

## Data Models

### Bot Status Enum
```typescript
enum BotStatus {
  INITIALIZING = "initializing",
  RUNNING = "running",
  PAUSED = "paused",
  STOPPED = "stopped",
  ERROR = "error"
}
```

### Bot State Response
```typescript
interface BotStateResponse {
  bot_id: string;              // Unique bot identifier
  custom_name: string | null;  // User-friendly name (e.g., "Max_HappyDolphin")
  status: BotStatus;           // Current status
  instrument: string;          // Trading instrument (e.g., "NQ", "ES")
  account_name: string;        // Account name
  accounts_ids: string | null; // JSON string of account IDs
  start_time: string;          // ISO 8601 timestamp
  last_health_check: string;   // ISO 8601 timestamp
  stopped_at: string | null;   // ISO 8601 timestamp (if stopped)
  
  // Trading Metrics
  total_pnl: number;          // Total profit/loss
  open_positions: number;     // Current open positions
  closed_positions: number;   // Total closed positions
  active_orders: number;      // Current active orders
  won_orders: number;         // Total winning orders
  lost_orders: number;        // Total losing orders
  
  data_source: "bot_state" | "bots_table";  // Where data came from
}
```

### Bot Action Response
```typescript
interface BotActionResponse {
  id: number;
  bot_id: string;
  action_type: "start" | "pause" | "stop" | "resume" | "clear_orders" | "clear_positions" | "clear_all";
  performed_by: string;        // Email of user who performed action
  timestamp: string;           // ISO 8601 timestamp
  details: Record<string, any> | null;
  success: boolean;
  error_message: string | null;
}
```

## API Endpoints

### 1. List All Bots
```http
GET /api/bots/
```

**Query Parameters:**
- `status` (optional): Filter by status (e.g., "running", "paused")

**Response:**
```json
{
  "bots": [
    {
      "bot_id": "orca_max_123_abc12345",
      "custom_name": "Max_HappyDolphin",
      "status": "running",
      "instrument": "NQ",
      "account_name": "APEX",
      "start_time": "2024-11-07T10:30:00Z",
      "last_health_check": "2024-11-07T19:15:30Z",
      "total_pnl": 1250.50,
      "open_positions": 2,
      "closed_positions": 15,
      "active_orders": 1,
      "won_orders": 10,
      "lost_orders": 5
    }
  ],
  "total": 3,
  "active": 2,
  "paused": 1,
  "stopped": 0,
  "error": 0
}
```

### 2. Get Bot Details
```http
GET /api/bots/{bot_id}
```

**Response:**
```json
{
  "bot": {
    "bot_id": "orca_max_123_abc12345",
    "custom_name": "Max_HappyDolphin",
    "status": "running",
    "instrument": "NQ",
    "account_name": "APEX",
    "accounts_ids": "[\"ACC123\", \"ACC456\"]",
    "start_time": "2024-11-07T10:30:00Z",
    "last_health_check": "2024-11-07T19:15:30Z",
    "stopped_at": null,
    "total_pnl": 1250.50,
    "open_positions": 2,
    "closed_positions": 15,
    "active_orders": 1,
    "won_orders": 10,
    "lost_orders": 5,
    "config": {
      "point_strategy_key": "conservative",
      "exit_strategy_key": "standard"
    }
  },
  "recent_actions": [
    {
      "id": 1,
      "action_type": "start",
      "performed_by": "user@example.com",
      "timestamp": "2024-11-07T10:30:00Z",
      "success": true
    }
  ]
}
```

### 3. Pause Bot
```http
POST /api/bots/{bot_id}/pause
```

**Request Body:**
```json
{
  "performed_by": "user@example.com",
  "reason": "Manual pause for adjustment"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot paused successfully",
  "action_id": 123,
  "bot_id": "orca_max_123_abc12345",
  "new_status": "paused"
}
```

**Error Response (if already paused):**
```json
{
  "success": false,
  "message": "Bot is not running",
  "current_status": "paused"
}
```

### 4. Resume Bot
```http
POST /api/bots/{bot_id}/resume
```

**Request Body:**
```json
{
  "performed_by": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot resumed successfully",
  "action_id": 124,
  "bot_id": "orca_max_123_abc12345",
  "new_status": "running"
}
```

### 5. Stop Bot
```http
POST /api/bots/{bot_id}/stop
```

**Request Body:**
```json
{
  "performed_by": "user@example.com",
  "reason": "End of trading session"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot stopped successfully",
  "action_id": 125,
  "bot_id": "orca_max_123_abc12345",
  "new_status": "stopped"
}
```

**Note:** Stopped bots cannot be resumed. They must be restarted as a new instance.

### 6. Clear Orders/Positions
```http
POST /api/bots/{bot_id}/clear
```

**Query Parameters:**
- `clear_orders` (boolean, default: true): Clear pending orders
- `clear_positions` (boolean, default: true): Clear open positions

**Request Body:**
```json
{
  "performed_by": "user@example.com",
  "force": false  // Set to true to clear even if bot is stopped
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cleared successfully",
  "cleared": {
    "orders": true,
    "positions": true
  }
}
```

### 7. Get Bot Actions History
```http
GET /api/bots/{bot_id}/actions
```

**Query Parameters:**
- `limit` (number, default: 100): Maximum actions to return

**Response:**
```json
[
  {
    "id": 125,
    "bot_id": "orca_max_123_abc12345",
    "action_type": "pause",
    "performed_by": "user@example.com",
    "timestamp": "2024-11-07T19:00:00Z",
    "details": {
      "reason": "Market volatility"
    },
    "success": true,
    "error_message": null
  }
]
```

### 8. Health Check
```http
GET /api/bots/health/check
```

**Response:**
```json
{
  "redis_connected": true,      // Actually Supabase state connection
  "database_connected": true,   // Supabase database connection
  "total_bots": 5,
  "active_bots": 3,
  "timestamp": "2024-11-07T19:15:00Z"
}
```

## Real-time Updates (WebSocket)

For real-time updates, you can subscribe to Supabase real-time events:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Subscribe to bot status changes
const channel = supabase
  .channel('bot-changes')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'bots',
      filter: `bot_id=eq.${botId}` 
    },
    (payload) => {
      console.log('Bot updated:', payload.new)
      // Update UI with new bot status
    }
  )
  .subscribe()

// Subscribe to new actions
const actionsChannel = supabase
  .channel('bot-actions')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'bot_actions',
      filter: `bot_id=eq.${botId}` 
    },
    (payload) => {
      console.log('New action:', payload.new)
      // Show notification or update action log
    }
  )
  .subscribe()
```

## Frontend Implementation Example

### React Component Example
```tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Bot {
  bot_id: string;
  custom_name: string;
  status: string;
  total_pnl: number;
  open_positions: number;
}

const BotDashboard: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all bots
  const fetchBots = async () => {
    try {
      const response = await axios.get('/api/bots/', {
        headers: {
          'Authorization': `Bearer ${token}` 
        }
      });
      setBots(response.data.bots);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  // Pause bot
  const pauseBot = async (botId: string) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `/api/bots/${botId}/pause`,
        {
          performed_by: userEmail
        },
        {
          headers: {
            'Authorization': `Bearer ${token}` 
          }
        }
      );
      
      if (response.data.success) {
        // Update local state
        setBots(bots.map(bot => 
          bot.bot_id === botId 
            ? { ...bot, status: 'paused' }
            : bot
        ));
        
        // Show success message
        toast.success('Bot paused successfully');
      }
    } catch (error) {
      toast.error('Failed to pause bot');
    } finally {
      setLoading(false);
    }
  };

  // Resume bot
  const resumeBot = async (botId: string) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `/api/bots/${botId}/resume`,
        {
          performed_by: userEmail
        },
        {
          headers: {
            'Authorization': `Bearer ${token}` 
          }
        }
      );
      
      if (response.data.success) {
        // Update local state
        setBots(bots.map(bot => 
          bot.bot_id === botId 
            ? { ...bot, status: 'running' }
            : bot
        ));
        
        toast.success('Bot resumed successfully');
      }
    } catch (error) {
      toast.error('Failed to resume bot');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBots();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchBots, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bot-dashboard">
      {bots.map(bot => (
        <div key={bot.bot_id} className="bot-card">
          <h3>{bot.custom_name || bot.bot_id}</h3>
          <div className="status-badge" data-status={bot.status}>
            {bot.status}
          </div>
          <div className="metrics">
            <span>P&L: ${bot.total_pnl}</span>
            <span>Positions: {bot.open_positions}</span>
          </div>
          <div className="controls">
            {bot.status === 'running' && (
              <button 
                onClick={() => pauseBot(bot.bot_id)}
                disabled={loading}
              >
                ⏸️ Pause
              </button>
            )}
            {bot.status === 'paused' && (
              <button 
                onClick={() => resumeBot(bot.bot_id)}
                disabled={loading}
              >
                ▶️ Resume
              </button>
            )}
            {['running', 'paused'].includes(bot.status) && (
              <button 
                onClick={() => stopBot(bot.bot_id)}
                disabled={loading}
                className="danger"
              >
                ⏹️ Stop
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
```

## Status Transition Rules

```
INITIALIZING → RUNNING
RUNNING → PAUSED, STOPPED, ERROR
PAUSED → RUNNING, STOPPED
ERROR → STOPPED
STOPPED → (terminal state, cannot transition)
```

### Valid Transitions:
- **initializing** → running
- **running** → paused, stopped, error
- **paused** → running, stopped
- **error** → stopped
- **stopped** → (terminal state, cannot transition)

## Error Handling

All endpoints return standard error responses:

### 404 - Bot Not Found
```json
{
  "detail": "Bot orca_max_123_abc not found"
}
```

### 400 - Invalid State Transition
```json
{
  "success": false,
  "message": "Bot is not running",
  "current_status": "stopped"
}
```

### 500 - Server Error
```json
{
  "detail": "Internal server error message"
}
```

## Important Notes for Frontend

1. **Bot IDs**: Format is `orca_max_{run_id}_{uuid}` (e.g., "orca_max_123_abc12345")

2. **Status Polling**: 
   - Recommended interval: 5 seconds for active bots
   - Can reduce to 30 seconds for stopped bots

3. **Pause Response Time**: 
   - Bot checks status every 5 seconds
   - Actual pause occurs within 5 seconds of request

4. **Custom Names**: 
   - Format: "Max_AdjectiveAnimal" (e.g., "Max_HappyDolphin")
   - Always display custom_name if available, fallback to bot_id

5. **Stopped Bots**: 
   - Cannot be resumed, only viewed
   - Hide or disable control buttons for stopped bots

6. **Real-time Updates**:
   - Use Supabase subscriptions for instant updates
   - Fallback to polling if WebSocket fails

7. **Metrics**:
   - `total_pnl`: Can be negative (show in red)
   - `open_positions`: 0 means no active trades
   - `won_orders` / `lost_orders`: Use for win rate calculation

## Testing Endpoints with cURL

```bash
# Get all bots
curl -X GET http://localhost:8000/api/bots/ \
  -H "Authorization: Bearer <token>"

# Pause a bot
curl -X POST http://localhost:8000/api/bots/orca_max_123_abc/pause \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"performed_by": "test@example.com"}'

# Resume a bot
curl -X POST http://localhost:8000/api/bots/orca_max_123_abc/resume \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"performed_by": "test@example.com"}'
```

## Environment Variables Needed

```env
# For API calls
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# For Supabase real-time (optional)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Integration with Existing Auth System

Since this is a Next.js project with existing auth, integrate with your current auth state:

```typescript
// Example: Using existing auth context
import { useAuth } from '@/hooks/useAuth';

function BotManagementPage() {
  const { user, token } = useAuth();
  const client = new BotManagementClient(
    process.env.NEXT_PUBLIC_API_BASE_URL!,
    token
  );
  
  // Use client...
}
```
