# Bot Management Library

Complete TypeScript library for managing trading bots via REST API.

## Files

### Bot Control (Pause/Resume/Stop)
- **`types.ts`** - Bot control type definitions, enums, and utility functions
- **`client.ts`** - Bot control API client with React hooks

### Run Configurations (View bot runs)
- **`run-config-types.ts`** - Run configuration type definitions and helpers
- **`run-config-client.ts`** - Run configuration API client with React hooks

### Unified Interface
- **`index.ts`** - Central export with `UnifiedBotClient`

## Quick Import

### Unified Client (Recommended)

```typescript
// Import everything from index
import { 
  createUnifiedBotClient,
  // Bot control types
  BotStatus,
  BotStateResponse,
  // Run config types
  RunConfig,
  RunConfigStatus,
  // Hooks
  useBotManagement,
  useRunConfigs,
  useActiveConfigs
} from '@/lib/bot-management';
```

### Specific Imports

```typescript
// Bot control
import { 
  BotStatus, 
  BotStateResponse,
  BotActionType,
  calculateWinRate,
  getStatusColor,
  toBotDisplayData
} from '@/lib/bot-management/types';

import { 
  BotManagementClient,
  createBotManagementClient,
  useBotManagement,
  useBotDetails,
  useRealtimeBots
} from '@/lib/bot-management/client';

// Run configurations
import {
  RunConfig,
  RunConfigStatus,
  toRunConfigDisplayData
} from '@/lib/bot-management/run-config-types';

import {
  RunConfigClient,
  createRunConfigClient,
  useRunConfigs,
  useActiveConfigs,
  useRunConfig
} from '@/lib/bot-management/run-config-client';
```

## Basic Usage

### 1. Create Unified Client (Recommended)

```typescript
import { createUnifiedBotClient } from '@/lib/bot-management';

const client = createUnifiedBotClient(authToken);

// Bot control operations
await client.control.getAllBots();
await client.control.pauseBot(botId, { performed_by: email });

// Run configuration operations
await client.runs.getAllConfigs();
await client.runs.getActiveConfigs();
```

### 2. Or Use Separate Clients

```typescript
import { createBotManagementClient } from '@/lib/bot-management/client';
import { createRunConfigClient } from '@/lib/bot-management/run-config-client';

const controlClient = createBotManagementClient(authToken);
const runClient = createRunConfigClient(authToken);
```

### 2. Fetch Bots

```typescript
const { bots, total, active } = await client.getAllBots();
```

### 3. Control Bots

```typescript
// Pause
await client.pauseBot(botId, { 
  performed_by: 'user@example.com',
  reason: 'Manual pause'
});

// Resume
await client.resumeBot(botId, { 
  performed_by: 'user@example.com'
});

// Stop (permanent)
await client.stopBot(botId, { 
  performed_by: 'user@example.com',
  reason: 'End of session'
});
```

## React Hooks

### useBotManagement

Full bot list management with control methods:

```typescript
const { 
  bots,           // ListBotsResponse | null
  loading,        // boolean
  error,          // string | null
  refresh,        // () => Promise<void>
  pauseBot,       // (botId, email, reason?) => Promise<BotActionResult>
  resumeBot,      // (botId, email) => Promise<BotActionResult>
  stopBot         // (botId, email, reason?) => Promise<BotActionResult>
} = useBotManagement(client);
```

### useBotDetails

Single bot details with action history:

```typescript
const { 
  bot,            // BotStateResponse | undefined
  actions,        // BotActionResponse[] | undefined
  loading,        // boolean
  error,          // string | null
  refresh         // () => Promise<void>
} = useBotDetails(client, botId);
```

### useRealtimeBots

Auto-polling bot updates:

```typescript
const { 
  bots,           // ListBotsResponse | null
  error           // string | null
} = useRealtimeBots(client, 5000); // Poll every 5 seconds
```

## Utility Functions

### Calculate Win Rate

```typescript
import { calculateWinRate } from '@/lib/bot-management/types';

const winRate = calculateWinRate(bot); // Returns 0-100
```

### Get Status Color

```typescript
import { getStatusColor } from '@/lib/bot-management/types';

const color = getStatusColor(bot.status);
// Returns: 'green' | 'yellow' | 'gray' | 'red' | 'blue'
```

### Convert to Display Data

```typescript
import { toBotDisplayData } from '@/lib/bot-management/types';

const displayData = toBotDisplayData(bot);
// Returns BotDisplayData with UI-friendly properties
```

### Check Control Permissions

```typescript
import { canPauseBot, canResumeBot, canStopBot } from '@/lib/bot-management/types';

if (canPauseBot(bot.status)) {
  // Show pause button
}

if (canResumeBot(bot.status)) {
  // Show resume button
}

if (canStopBot(bot.status)) {
  // Show stop button
}
```

## Status Values

```typescript
enum BotStatus {
  INITIALIZING = "initializing",  // Bot is starting
  RUNNING = "running",            // Actively trading
  PAUSED = "paused",              // Temporarily halted
  STOPPED = "stopped",            // Permanently stopped
  ERROR = "error"                 // Error state
}
```

## Error Handling

The client automatically handles errors and returns descriptive messages:

```typescript
try {
  await client.pauseBot(botId, { performed_by: email });
} catch (error) {
  console.error(error.message);
  // Examples:
  // - "Bot not found"
  // - "Bot is not running"
  // - "Unauthorized - Please check your authentication token"
}
```

## Environment Variables

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Complete Documentation

See the root directory for complete documentation:
- **`BOT_MANAGEMENT_INTEGRATION.md`** - Full integration guide with examples
- **`BOT_MANAGEMENT_FRONTEND_API.md`** - Complete API reference

## Dependencies

```bash
npm install axios @supabase/supabase-js
```

Or run the installation script:
```bash
chmod +x install-bot-management.sh
./install-bot-management.sh
```
