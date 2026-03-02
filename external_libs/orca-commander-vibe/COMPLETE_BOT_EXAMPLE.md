# Complete Bot Management Example

This is a **complete, working example** showing both:
1. **Bot Control** - Pause/Resume/Stop active bots
2. **Run Configurations** - View historical and active bot runs

## 🎯 The Missing Piece

You mentioned you couldn't view running bots or old runs. The issue was that you only had bot **control** functionality, but were missing the **run configuration** endpoints that list all bot runs.

## ✅ Complete Implementation

### Full Dashboard Component

```tsx
'use client';

import { useState } from 'react';
import { createUnifiedBotClient } from '@/lib/bot-management';
import { useRunConfigs, useActiveConfigs } from '@/lib/bot-management';
import { useBotManagement } from '@/lib/bot-management';
import { useAuth } from '@/hooks/useAuth';
import { 
  RunConfig, 
  toRunConfigDisplayData,
  getRunStatusColor 
} from '@/lib/bot-management/run-config-types';
import { 
  BotStateResponse,
  getStatusColor,
  calculateWinRate 
} from '@/lib/bot-management/types';

export default function CompleteBotDashboard() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'active' | 'all'>('active');
  
  // Create unified client
  const client = createUnifiedBotClient(token);
  
  // Fetch run configurations (THIS WAS MISSING!)
  const { 
    configs: allRuns, 
    loading: runsLoading, 
    error: runsError,
    stopConfig 
  } = useRunConfigs(client.runs);
  
  const { 
    activeConfigs: activeRuns, 
    loading: activeLoading 
  } = useActiveConfigs(client.runs);
  
  // Fetch bot control status
  const {
    bots,
    loading: botsLoading,
    error: botsError,
    pauseBot,
    resumeBot,
    stopBot
  } = useBotManagement(client.control);

  // Handlers
  const handlePauseBot = async (botId: string) => {
    try {
      await pauseBot(botId, user.email, 'Manual pause');
      // Show success toast
    } catch (err) {
      // Show error toast
    }
  };

  const handleResumeBot = async (botId: string) => {
    try {
      await resumeBot(botId, user.email);
      // Show success toast
    } catch (err) {
      // Show error toast
    }
  };

  const handleStopBot = async (botId: string) => {
    if (!confirm('Stop this bot? This cannot be undone.')) return;
    try {
      await stopBot(botId, user.email, 'Manual stop');
      // Show success toast
    } catch (err) {
      // Show error toast
    }
  };

  const handleStopRun = async (runId: number) => {
    if (!confirm('Stop this run?')) return;
    try {
      await stopConfig(runId);
      // Show success toast
    } catch (err) {
      // Show error toast
    }
  };

  if (runsLoading || botsLoading) {
    return <div className="p-8">Loading...</div>;
  }

  if (runsError || botsError) {
    return (
      <div className="p-8 text-red-600">
        Error: {runsError || botsError}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Bot Management Dashboard</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded ${
              activeTab === 'active' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200'
            }`}
          >
            Active ({activeRuns.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded ${
              activeTab === 'all' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200'
            }`}
          >
            All Runs ({allRuns.length})
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Runs"
          value={allRuns.length}
          color="blue"
        />
        <StatCard
          title="Active Runs"
          value={activeRuns.length}
          color="green"
        />
        <StatCard
          title="Running Bots"
          value={bots?.active || 0}
          color="green"
        />
        <StatCard
          title="Paused Bots"
          value={bots?.paused || 0}
          color="yellow"
        />
      </div>

      {/* Active Runs */}
      {activeTab === 'active' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Active Runs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRuns.map(config => (
              <RunConfigCard
                key={config.id}
                config={config}
                onStop={() => handleStopRun(config.id)}
              />
            ))}
          </div>

          <h2 className="text-2xl font-bold mt-8">Bot Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots?.bots.map(bot => (
              <BotStatusCard
                key={bot.bot_id}
                bot={bot}
                onPause={() => handlePauseBot(bot.bot_id)}
                onResume={() => handleResumeBot(bot.bot_id)}
                onStop={() => handleStopBot(bot.bot_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Runs */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">All Bot Runs</h2>
          <RunConfigTable
            configs={allRuns}
            onStopRun={handleStopRun}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface StatCardProps {
  title: string;
  value: number;
  color: 'blue' | 'green' | 'yellow' | 'red';
}

function StatCard({ title, value, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600'
  };

  return (
    <div className={`p-6 rounded-lg shadow ${colorClasses[color]}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}

interface RunConfigCardProps {
  config: RunConfig;
  onStop: () => void;
}

function RunConfigCard({ config, onStop }: RunConfigCardProps) {
  const display = toRunConfigDisplayData(config);
  
  const statusColors = {
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-800'
  };

  return (
    <div className="border rounded-lg p-4 shadow-sm bg-white">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-lg">{display.displayName}</h3>
          <p className="text-sm text-gray-500">Run #{config.id}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[display.statusColor]}`}>
          {display.status}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Contract:</span>
          <span className="font-medium">{display.contract}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Mode:</span>
          <span className="font-medium">{display.tradingMode}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Side:</span>
          <span className="font-medium">{display.tradingSide}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Strategy:</span>
          <span className="font-medium text-xs">{display.strategy}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Account:</span>
          <span className="font-medium">{display.accountName}</span>
        </div>
      </div>

      {display.canStop && (
        <button
          onClick={onStop}
          className="w-full mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Stop Run
        </button>
      )}
    </div>
  );
}

interface BotStatusCardProps {
  bot: BotStateResponse;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function BotStatusCard({ bot, onPause, onResume, onStop }: BotStatusCardProps) {
  const statusColor = getStatusColor(bot.status);
  const winRate = calculateWinRate(bot);
  
  const statusColors = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-800',
    blue: 'bg-blue-100 text-blue-800'
  };

  return (
    <div className="border rounded-lg p-4 shadow-sm bg-white">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-lg">
            {bot.custom_name || bot.bot_id}
          </h3>
          <p className="text-sm text-gray-500">{bot.instrument}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[statusColor]}`}>
          {bot.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-xs text-gray-600">P&L</p>
          <p className={`text-lg font-bold ${bot.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${bot.total_pnl.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Win Rate</p>
          <p className="text-lg font-bold">{winRate}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Positions</p>
          <p className="text-lg font-semibold">{bot.open_positions}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Orders</p>
          <p className="text-lg font-semibold">{bot.active_orders}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {bot.status === 'running' && (
          <>
            <button
              onClick={onPause}
              className="flex-1 px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
            >
              ⏸️ Pause
            </button>
            <button
              onClick={onStop}
              className="flex-1 px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
            >
              ⏹️ Stop
            </button>
          </>
        )}
        {bot.status === 'paused' && (
          <>
            <button
              onClick={onResume}
              className="flex-1 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
            >
              ▶️ Resume
            </button>
            <button
              onClick={onStop}
              className="flex-1 px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
            >
              ⏹️ Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface RunConfigTableProps {
  configs: RunConfig[];
  onStopRun: (runId: number) => void;
}

function RunConfigTable({ configs, onStopRun }: RunConfigTableProps) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contract</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Strategy</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {configs.map(config => {
            const display = toRunConfigDisplayData(config);
            return (
              <tr key={config.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm">{config.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {display.displayName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    display.statusColor === 'green' ? 'bg-green-100 text-green-800' :
                    display.statusColor === 'blue' ? 'bg-blue-100 text-blue-800' :
                    display.statusColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    display.statusColor === 'red' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {display.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{config.contract}</td>
                <td className="px-6 py-4 text-sm">
                  {config.point_strategy_key} / {config.exit_strategy_key}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{config.account_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">{config.user}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {config.created_at ? new Date(config.created_at).toLocaleDateString() : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {display.canStop && (
                    <button
                      onClick={() => onStopRun(config.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Stop
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

## 🎯 Key Takeaways

### What Was Missing:
```typescript
// ❌ Before: Only had bot control (pause/resume/stop)
const { bots } = await client.getAllBots(); // Only shows currently running bots

// ✅ Now: Also have run configurations
const configs = await client.runs.getAllConfigs(); // Shows ALL bot runs
const activeRuns = await client.runs.getActiveConfigs(); // Shows active runs
```

### The Difference:
- **Bot Control** (`/api/bots/*`) - Manages **currently active** bots (pause/resume/stop)
- **Run Configs** (`/api/v1/run-bot/configs*`) - Views **all bot runs** (historical + active)

### Usage:
```typescript
// Unified client has both
const client = createUnifiedBotClient(token);

// View all runs (historical + active)
const allRuns = await client.runs.getAllConfigs();

// View only active runs
const activeRuns = await client.runs.getActiveConfigs();

// Control active bots
const { bots } = await client.control.getAllBots();
await client.control.pauseBot(botId, { performed_by: email });
```

## 📁 File Location

Save this component as:
```
app/bots/page.tsx
```

Or wherever your bot management page should be.

## 🚀 Next Steps

1. Install dependencies: `npm install axios`
2. Add environment variable: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
3. Copy the component above to your project
4. Navigate to `/bots` to see your dashboard

This will show **both** active bots AND all historical runs!
