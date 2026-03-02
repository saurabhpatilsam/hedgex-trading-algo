# Bot Management System - Frontend Integration Summary

> **Complete integration package for bot management system**

This document provides a quick start guide for integrating the bot management system into your Next.js frontend.

## 📦 Files Included

All integration files are now in your project:

### Bot Control (Pause/Resume/Stop)
1. **`lib/bot-management/types.ts`** - Bot control type definitions
2. **`lib/bot-management/client.ts`** - Bot control API client with React hooks

### Run Configurations (View bot runs)
3. **`lib/bot-management/run-config-types.ts`** - Run configuration type definitions
4. **`lib/bot-management/run-config-client.ts`** - Run configuration API client with React hooks

### Unified Interface
5. **`lib/bot-management/index.ts`** - Unified export with `UnifiedBotClient`

### Documentation
6. **`BOT_MANAGEMENT_FRONTEND_API.md`** - Complete API documentation

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
# Install required dependencies (if not already installed)
npm install axios @supabase/supabase-js
```

### Step 2: Environment Variables

Add to your `.env.local`:

```env
# Backend API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Supabase (for real-time updates - optional)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Import and Use

**Option A: Unified Client (Recommended)**

```typescript
import { createUnifiedBotClient } from '@/lib/bot-management';
import { useAuth } from '@/hooks/useAuth';

function BotManagementPage() {
  const { user, token } = useAuth();
  
  // Create unified client (has both control and runs)
  const client = createUnifiedBotClient(token);
  
  // Bot control operations
  const fetchActiveBots = async () => {
    const { bots, active } = await client.control.getAllBots();
    console.log(`${active} active bots`);
  };
  
  const pauseBot = async (botId: string) => {
    await client.control.pauseBot(botId, {
      performed_by: user.email
    });
  };
  
  // Run configuration operations (THIS WAS MISSING!)
  const fetchAllRuns = async () => {
    const configs = await client.runs.getAllConfigs();
    console.log(`Found ${configs.length} bot runs`);
  };
  
  const fetchActiveRuns = async () => {
    const active = await client.runs.getActiveConfigs();
    console.log(`${active.length} active runs`);
  };
  
  return (
    <div>
      {/* Your UI */}
    </div>
  );
}
```

**Option B: Separate Clients**

```typescript
import { BotManagementClient } from '@/lib/bot-management/client';
import { RunConfigClient } from '@/lib/bot-management/run-config-client';

const controlClient = new BotManagementClient(baseUrl, token);
const runClient = new RunConfigClient(baseUrl, token);

// Use separate clients...
```

## 🎣 Using React Hooks

The client includes ready-to-use React hooks:

### Hook 1: useBotManagement (Full bot list)

```typescript
import { useBotManagement } from '@/lib/bot-management/client';
import { createBotManagementClient } from '@/lib/bot-management/client';

function BotList() {
  const { token } = useAuth();
  const client = createBotManagementClient(token);
  
  const { 
    bots, 
    loading, 
    error, 
    refresh,
    pauseBot, 
    resumeBot, 
    stopBot 
  } = useBotManagement(client);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <h1>Active Bots: {bots?.active ?? 0}</h1>
      {bots?.bots.map(bot => (
        <BotCard 
          key={bot.bot_id} 
          bot={bot}
          onPause={() => pauseBot(bot.bot_id, user.email)}
          onResume={() => resumeBot(bot.bot_id, user.email)}
          onStop={() => stopBot(bot.bot_id, user.email)}
        />
      ))}
    </div>
  );
}
```

### Hook 2: useBotDetails (Single bot)

```typescript
import { useBotDetails } from '@/lib/bot-management/client';

function BotDetailsPage({ botId }: { botId: string }) {
  const { token } = useAuth();
  const client = createBotManagementClient(token);
  
  const { bot, actions, loading, error, refresh } = useBotDetails(client, botId);
  
  return (
    <div>
      <h1>{bot?.custom_name || bot?.bot_id}</h1>
      <p>Status: {bot?.status}</p>
      <p>P&L: ${bot?.total_pnl}</p>
      
      <h2>Recent Actions</h2>
      {actions?.map(action => (
        <div key={action.id}>{action.action_type}</div>
      ))}
    </div>
  );
}
```

### Hook 3: useRealtimeBots (Auto-polling)

```typescript
import { useRealtimeBots } from '@/lib/bot-management/client';

function RealtimeBotDashboard() {
  const { token } = useAuth();
  const client = createBotManagementClient(token);
  
  // Auto-polls every 5 seconds
  const { bots, error } = useRealtimeBots(client, 5000);
  
  return (
    <div>
      {bots?.bots.map(bot => (
        <BotCard key={bot.bot_id} bot={bot} />
      ))}
    </div>
  );
}
```

## 📊 Run Configuration Hooks (View Bot Runs)

**These hooks show historical and active bot runs - this was the missing piece!**

### Hook 4: useRunConfigs (All bot runs)

```typescript
import { useRunConfigs, createRunConfigClient } from '@/lib/bot-management';

function BotRunsPage() {
  const { token } = useAuth();
  const client = createRunConfigClient(token);
  
  const { configs, loading, error, refresh, stopConfig } = useRunConfigs(client);
  
  if (loading) return <div>Loading runs...</div>;
  
  return (
    <div>
      <h1>All Bot Runs ({configs.length})</h1>
      {configs.map(config => (
        <div key={config.id}>
          <h3>{config.custom_name || `Run #${config.id}`}</h3>
          <p>Status: {config.status}</p>
          <p>Contract: {config.contract}</p>
          <p>Strategy: {config.point_strategy_key} / {config.exit_strategy_key}</p>
          
          {config.status === 'running' && (
            <button onClick={() => stopConfig(config.id)}>
              Stop Run
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Hook 5: useActiveConfigs (Active runs only)

```typescript
import { useActiveConfigs, createRunConfigClient } from '@/lib/bot-management';

function ActiveRunsWidget() {
  const { token } = useAuth();
  const client = createRunConfigClient(token);
  
  const { activeConfigs, loading, error, refresh } = useActiveConfigs(client);
  
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2>Active Runs: {activeConfigs.length}</h2>
      {activeConfigs.map(config => (
        <div key={config.id} className="border-b py-2">
          <span className="font-semibold">{config.custom_name}</span>
          <span className="text-sm text-gray-500 ml-2">{config.contract}</span>
        </div>
      ))}
    </div>
  );
}
```

### Hook 6: useRunConfig (Single run details)

```typescript
import { useRunConfig, createRunConfigClient } from '@/lib/bot-management';

function RunDetailsPage({ runId }: { runId: number }) {
  const { token } = useAuth();
  const client = createRunConfigClient(token);
  
  const { config, loading, error, refresh } = useRunConfig(client, runId);
  
  if (!config) return <div>Run not found</div>;
  
  return (
    <div>
      <h1>Run #{config.id}</h1>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>Status</label>
          <p>{config.status}</p>
        </div>
        <div>
          <label>Contract</label>
          <p>{config.contract}</p>
        </div>
        <div>
          <label>Trading Mode</label>
          <p>{config.trading_mode}</p>
        </div>
        <div>
          <label>Strategy</label>
          <p>{config.point_strategy_key} → {config.exit_strategy_key}</p>
        </div>
        <div>
          <label>Account</label>
          <p>{config.account_name}</p>
        </div>
        <div>
          <label>User</label>
          <p>{config.user}</p>
        </div>
      </div>
    </div>
  );
}
```

### Hook 7: useRealtimeConfigs (Auto-polling run configs)

```typescript
import { useRealtimeConfigs, createRunConfigClient } from '@/lib/bot-management';

function RealtimeRunsDashboard() {
  const { token } = useAuth();
  const client = createRunConfigClient(token);
  
  // Auto-polls every 10 seconds
  const { configs, error } = useRealtimeConfigs(client, 10000);
  
  return (
    <div>
      <h1>Bot Runs (Auto-refreshing)</h1>
      {configs.map(config => (
        <RunCard key={config.id} config={config} />
      ))}
    </div>
  );
}
```

## 🎨 Example Components

### Bot Card Component

```tsx
import { BotStateResponse, getStatusColor, calculateWinRate } from '@/lib/bot-management/types';

interface BotCardProps {
  bot: BotStateResponse;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function BotCard({ bot, onPause, onResume, onStop }: BotCardProps) {
  const statusColor = getStatusColor(bot.status);
  const winRate = calculateWinRate(bot);
  const canPause = bot.status === 'running';
  const canResume = bot.status === 'paused';
  const canStop = ['running', 'paused'].includes(bot.status);
  
  return (
    <div className="border rounded-lg p-4 shadow-sm">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">
            {bot.custom_name || bot.bot_id}
          </h3>
          <p className="text-sm text-gray-500">{bot.instrument}</p>
        </div>
        
        <span 
          className={`px-3 py-1 rounded-full text-sm font-medium
            ${statusColor === 'green' ? 'bg-green-100 text-green-800' : ''}
            ${statusColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' : ''}
            ${statusColor === 'red' ? 'bg-red-100 text-red-800' : ''}
            ${statusColor === 'gray' ? 'bg-gray-100 text-gray-800' : ''}
          `}
        >
          {bot.status}
        </span>
      </div>
      
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-500">P&L</p>
          <p className={`text-xl font-bold ${bot.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${bot.total_pnl.toFixed(2)}
          </p>
        </div>
        
        <div>
          <p className="text-sm text-gray-500">Win Rate</p>
          <p className="text-xl font-bold">{winRate}%</p>
        </div>
        
        <div>
          <p className="text-sm text-gray-500">Open Positions</p>
          <p className="text-lg font-semibold">{bot.open_positions}</p>
        </div>
        
        <div>
          <p className="text-sm text-gray-500">Active Orders</p>
          <p className="text-lg font-semibold">{bot.active_orders}</p>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex gap-2">
        {canPause && (
          <button 
            onClick={onPause}
            className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          >
            ⏸️ Pause
          </button>
        )}
        
        {canResume && (
          <button 
            onClick={onResume}
            className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            ▶️ Resume
          </button>
        )}
        
        {canStop && (
          <button 
            onClick={onStop}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            ⏹️ Stop
          </button>
        )}
      </div>
    </div>
  );
}
```

### Bot List Page

```tsx
'use client';

import { useBotManagement, createBotManagementClient } from '@/lib/bot-management/client';
import { BotStatus } from '@/lib/bot-management/types';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

export default function BotManagementPage() {
  const { user, token } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<BotStatus | undefined>();
  
  const client = createBotManagementClient(token);
  const { bots, loading, error, pauseBot, resumeBot, stopBot, refresh } = useBotManagement(client);
  
  const handlePause = async (botId: string) => {
    try {
      await pauseBot(botId, user.email, 'Manual pause');
      // Success notification
    } catch (err) {
      // Error notification
    }
  };
  
  const handleResume = async (botId: string) => {
    try {
      await resumeBot(botId, user.email);
      // Success notification
    } catch (err) {
      // Error notification
    }
  };
  
  const handleStop = async (botId: string) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    
    try {
      await stopBot(botId, user.email, 'Manual stop');
      // Success notification
    } catch (err) {
      // Error notification
    }
  };
  
  if (loading) {
    return <div className="p-8">Loading bots...</div>;
  }
  
  if (error) {
    return (
      <div className="p-8 text-red-600">
        Error: {error}
        <button onClick={refresh} className="ml-4 px-4 py-2 bg-blue-500 text-white rounded">
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Bot Management</h1>
        <button 
          onClick={refresh}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Refresh
        </button>
      </div>
      
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Total Bots</p>
          <p className="text-2xl font-bold">{bots?.total ?? 0}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">{bots?.active ?? 0}</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Paused</p>
          <p className="text-2xl font-bold text-yellow-600">{bots?.paused ?? 0}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500">Stopped</p>
          <p className="text-2xl font-bold text-gray-600">{bots?.stopped ?? 0}</p>
        </div>
      </div>
      
      {/* Bot Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots?.bots.map(bot => (
          <BotCard
            key={bot.bot_id}
            bot={bot}
            onPause={() => handlePause(bot.bot_id)}
            onResume={() => handleResume(bot.bot_id)}
            onStop={() => handleStop(bot.bot_id)}
          />
        ))}
      </div>
    </div>
  );
}
```

## 🔄 Real-time Updates with Supabase

For instant updates without polling:

```typescript
import { createClient } from '@supabase/supabase-js';
import { useEffect } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function useRealtimeBotUpdates(botId: string, onUpdate: (bot: any) => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`bot-${botId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bots',
          filter: `bot_id=eq.${botId}`
        },
        (payload) => {
          onUpdate(payload.new);
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [botId, onUpdate]);
}
```

## 📊 Key Data Points to Display

### Essential Metrics
- **Status** - Color-coded badge (running=green, paused=yellow, stopped=gray, error=red)
- **Total P&L** - Show in red if negative, green if positive
- **Win Rate** - Calculate as `(won_orders / (won_orders + lost_orders)) * 100`
- **Open Positions** - Current active trades
- **Active Orders** - Pending orders

### Bot Information
- **Display Name** - Use `custom_name` if available, fallback to `bot_id`
- **Instrument** - Trading instrument (NQ, ES, etc.)
- **Account** - Account name
- **Start Time** - When bot was started
- **Last Health Check** - Last activity timestamp

### Control Buttons
Show/hide based on status:
- **Running**: Show Pause & Stop buttons
- **Paused**: Show Resume & Stop buttons
- **Stopped**: No controls (terminal state)

## 🎯 Status Transition Rules

Valid transitions:
```
initializing → running
running → paused, stopped, error
paused → running, stopped
error → stopped
stopped → (cannot transition)
```

## ⚠️ Important Notes

1. **Pause Response Time**: Bots check status every 5 seconds, so actual pause occurs within 5 seconds

2. **Stop is Permanent**: Once stopped, a bot cannot be resumed. Only show stop button with confirmation dialog

3. **Authentication**: All API calls require Bearer token from your existing auth system

4. **Bot ID Format**: `orca_max_{run_id}_{uuid}` (e.g., "orca_max_123_abc12345")

5. **Error Handling**: Client includes automatic error handling with descriptive messages

6. **Polling vs Real-time**: 
   - Use polling (5s interval) for simplicity
   - Use Supabase subscriptions for instant updates

## 🧪 Testing the Integration

### Step 1: Start Backend
```bash
# Make sure your backend API is running
# Default: http://localhost:8000
```

### Step 2: Create a Test Bot
Use the backend API to create a test bot via `/api/v1/run-bot/max` endpoint

### Step 3: Test in Browser
Navigate to your bot management page and verify:
- ✅ Bots load correctly
- ✅ Status badges show correct colors
- ✅ Metrics display properly
- ✅ Pause button works (status changes within 5s)
- ✅ Resume button works
- ✅ Stop button works (with confirmation)

## 📁 File Structure

```
your-project/
├── lib/
│   └── bot-management/
│       ├── types.ts          ← Type definitions
│       └── client.ts         ← API client & hooks
├── app/
│   └── bots/
│       └── page.tsx          ← Bot management page
├── components/
│   └── BotCard.tsx          ← Reusable bot card
└── .env.local               ← Environment variables
```

## 🔗 Additional Resources

- **API Documentation**: See `BOT_MANAGEMENT_FRONTEND_API.md` for complete API reference
- **Type Definitions**: Check `lib/bot-management/types.ts` for all available types
- **Helper Functions**: Use utility functions in types.ts for common operations

## 🚨 Common Issues

### Issue: "Cannot find module 'axios'"
**Solution**: Run `npm install axios`

### Issue: Bot status not updating
**Solution**: Check polling interval or verify Supabase real-time subscription

### Issue: Unauthorized errors
**Solution**: Verify auth token is being passed correctly to client

### Issue: CORS errors
**Solution**: Ensure backend API has CORS enabled for your frontend origin

## 📞 Support

If you encounter issues:
1. Check `BOT_MANAGEMENT_FRONTEND_API.md` for API details
2. Verify environment variables are set correctly
3. Check browser console for detailed error messages
4. Ensure backend API is running and accessible

---

**Ready to integrate!** Start with the Quick Start section above and refer to the example components for guidance.
