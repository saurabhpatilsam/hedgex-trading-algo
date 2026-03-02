# Bot Management System - Backend API Specification

## Overview
This document contains all API endpoints required by the frontend bot management features (Archive, Restart, Configuration Library, View Details). These endpoints must be implemented in the backend.

**Authentication**: All endpoints require Bearer token authentication from `localStorage.getItem('access_token')`

---

## 1. ARCHIVE BOT

**Purpose**: Archive a stopped or errored bot for historical tracking

### Endpoint
```
POST /api/bots/{bot_id}/archive
```

### Frontend Implementation
- **File**: `components/trading-bots-tab.tsx`
- **Function**: `handleArchiveBot()`
- **Also Called From**: `components/premium-bot-card.tsx` (Archive dropdown action)

### Request
```typescript
URL: /api/bots/${bot.bot_id}/archive
Method: POST

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Body: {
  "reason": "error" | "manual" | "stopped" | "performance",
  "archived_by": "user"
}
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Bot archived successfully",
  "archived_bot": {
    "bot_id": "string",
    "archived_at": "2024-01-15T16:35:00Z",
    "archived_by": "user@example.com",
    "archive_reason": "error",
    "final_pnl": 1234.56
  }
}
```

### Response (Error - 404/500)
```json
{
  "error": "Bot not found",
  "success": false
}
```

### Backend Implementation Steps
1. Validate bot_id exists
2. Verify user has permission to archive this bot
3. Stop the bot if it's still running
4. Capture final bot state (P&L, metrics, config)
5. Save to `archived_bots` table with:
   - bot_id
   - archived_at (current timestamp)
   - archived_by (from request)
   - archive_reason (from request)
   - final_pnl
   - total_runtime_seconds
   - full bot configuration
   - final metrics (trades, win rate, etc.)
6. Remove from active bots or set archived flag
7. Log action for audit trail
8. Return archived bot data

---

## 2. GET ARCHIVED BOTS

**Purpose**: Retrieve all archived bots for display in Archived Bots tab

### Endpoint
```
GET /api/bots/archived
```

### Frontend Implementation
- **File**: `components/archived-bots-tab.tsx`
- **Function**: `fetchArchivedBots()` - called on component mount

### Request
```typescript
URL: /api/bots/archived
Method: GET

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Query Parameters (Optional):
  ?page=1
  &limit=50
  &sort_by=archived_at
  &order=desc
  &archive_reason=error|manual|stopped|performance
```

### Response (Success - 200)
```json
{
  "success": true,
  "bots": [
    {
      "bot_id": "orca_max_001_archived",
      "bot_type": "orcamax",
      "status": "stopped",
      "start_time": "2024-01-10T08:00:00Z",
      "last_health_check": "2024-01-15T16:30:00Z",
      "instrument": "NQ",
      "account_name": "APEX_136189",
      "total_pnl": 2450.50,
      "final_pnl": 2450.50,
      "open_positions": 0,
      "closed_positions": 145,
      "active_orders": 0,
      "won_orders": 89,
      "lost_orders": 56,
      "fibonacci_levels": {},
      "trading_window_active": false,
      "threshold_reached": false,
      "archived_at": "2024-01-15T16:35:00Z",
      "archived_by": "user@example.com",
      "archive_reason": "stopped",
      "total_runtime": 432000,
      "config": {
        "quantity": 2,
        "instrument": "NQ",
        "point_strategy_key": "aggressive_v1",
        "exit_strategy_key": "quick_exit",
        "custom_name": "Aggressive Scalper"
      }
    }
  ],
  "total": 50,
  "timestamp": "2024-01-20T10:00:00Z"
}
```

### Backend Implementation Steps
1. Query `archived_bots` table
2. Filter by user if authentication is present
3. Include full bot configuration and final metrics
4. Sort by archived_at descending (newest first)
5. Return paginated results if page/limit provided
6. Include statistics in response

---

## 3. RESTART BOT

**Purpose**: Create a new bot instance using configuration from an existing or archived bot

### Endpoint
```
POST /api/bots/restart
```

### Frontend Implementation
- **File**: `components/trading-bots-tab.tsx`
- **Function**: `handleRestartBot()`
- **Also Called From**: `components/archived-bots-tab.tsx` → `handleRestart()`

### Request
```typescript
URL: /api/bots/restart
Method: POST

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Body: {
  "bot_id": "original_bot_id",
  "config": {
    "quantity": 2,
    "instrument": "NQ",
    "account_name": "APEX_136189",
    "point_strategy_key": "aggressive_scalp_v2",
    "exit_strategy_key": "quick_exit_1min",
    "custom_name": "Restarted Bot",
    "environment": "PROD",
    // ... all other bot configuration fields
  },
  "bot_type": "orcamax",
  "modified": false
}
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Bot restarted successfully",
  "bot_id": "orca_max_restart_xyz123",
  "config": {
    // Final configuration used
  }
}
```

### Response (Error - 400/500)
```json
{
  "error": "Failed to restart bot",
  "success": false
}
```

### Backend Implementation Steps
1. Validate configuration is complete and valid
2. Generate NEW unique bot_id (DO NOT reuse original)
3. Create new bot instance with provided config
4. Initialize bot in "initializing" or "running" state
5. Link to original bot_id in metadata (for tracking)
6. Start bot execution
7. Return new bot_id and final config
8. Log restart action with reference to source bot

**Important**: This creates a NEW bot, not reactivating the old one

---

## 4. UNARCHIVE BOT

**Purpose**: Move bot from archived state back to active bots (without starting it)

### Endpoint
```
POST /api/bots/{bot_id}/unarchive
```

### Frontend Implementation
- **File**: `components/archived-bots-tab.tsx`
- **Function**: `handleUnarchive()`

### Request
```typescript
URL: /api/bots/${botId}/unarchive
Method: POST

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Body: {}
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Bot unarchived successfully",
  "bot": {
    "bot_id": "string",
    "status": "stopped",
    "unarchived_at": "2024-01-20T10:00:00Z"
  }
}
```

### Response (Error - 404)
```json
{
  "error": "Archived bot not found",
  "success": false
}
```

### Backend Implementation Steps
1. Validate bot exists in archived_bots table
2. Move bot record from archived_bots to active bots
3. Keep bot in "stopped" state (DO NOT auto-start)
4. Preserve all configuration and data
5. Update unarchived_at timestamp
6. Remove from archived_bots table
7. Log unarchive action
8. Return updated bot status

---

## 5. DELETE ARCHIVED BOT (PERMANENTLY)

**Purpose**: Permanently delete an archived bot (irreversible)

### Endpoint
```
DELETE /api/bots/{bot_id}
```

### Frontend Implementation
- **File**: `components/archived-bots-tab.tsx`
- **Function**: `handleDelete()` - called after user confirmation

### Request
```typescript
URL: /api/bots/${botId}
Method: DELETE

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Query Parameters (Optional):
  ?permanent=true  // Confirms permanent deletion intent
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Bot deleted permanently",
  "deleted_bot_id": "orca_max_001_archived"
}
```

### Response (Error - 404)
```json
{
  "error": "Bot not found",
  "success": false
}
```

### Backend Implementation Steps
1. Validate bot exists in archived_bots table
2. Verify user has permission to delete
3. Create audit log entry BEFORE deletion (irreversible action)
4. Permanently delete from archived_bots table
5. This action is IRREVERSIBLE - consider soft delete option
6. Return success confirmation with deleted bot_id
7. Clean up any associated data (logs, metrics)

**Warning**: This is a destructive operation. Consider implementing soft delete.

---

## 6. VIEW BOT DETAILS (FULL INFORMATION)

**Purpose**: Get comprehensive details about any bot (active or archived) including all metrics, configuration, history, and performance

### Endpoint
```
GET /api/bots/{bot_id}/details
```

### Frontend Implementation
- **File**: `components/bot-config-details.tsx`
- **Function**: Component displays detailed bot information
- **Also Used In**: `components/archived-bots-tab.tsx` → View Details action

### Request
```typescript
URL: /api/bots/${bot_id}/details
Method: GET

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Query Parameters (Optional):
  ?include_history=true    // Include trade history
  &include_logs=true       // Include execution logs
  &history_limit=100       // Limit number of historical records
```

### Response (Success - 200)
```json
{
  "success": true,
  "bot": {
    // Core Information
    "bot_id": "orca_max_001",
    "bot_type": "orcamax",
    "status": "running",
    "is_archived": false,
    
    // Timing
    "start_time": "2024-01-10T08:00:00Z",
    "last_health_check": "2024-01-20T10:30:00Z",
    "uptime_seconds": 864000,
    
    // Archive Info (if archived)
    "archived_at": null,
    "archived_by": null,
    "archive_reason": null,
    
    // Trading Info
    "instrument": "NQ",
    "account_name": "APEX_136189",
    
    // Performance Metrics
    "total_pnl": 2450.50,
    "daily_pnl": 125.75,
    "open_positions": 2,
    "closed_positions": 145,
    "active_orders": 3,
    "won_orders": 89,
    "lost_orders": 56,
    "win_rate": 61.38,
    "profit_factor": 1.85,
    "sharpe_ratio": 1.42,
    "max_drawdown": -500.00,
    "max_drawdown_percent": -3.25,
    
    // Advanced Metrics
    "avg_win": 45.50,
    "avg_loss": -32.25,
    "largest_win": 250.00,
    "largest_loss": -180.00,
    "avg_trade_duration_minutes": 15,
    "total_commission": 145.00,
    "net_pnl": 2305.50,
    
    // Configuration
    "config": {
      "quantity": 2,
      "instrument": "NQ",
      "point_strategy_key": "aggressive_v1",
      "exit_strategy_key": "quick_exit",
      "custom_name": "Aggressive Scalper",
      "max_position_size": 4,
      "risk_per_trade": 100,
      "stop_loss_points": 10,
      "take_profit_points": 20,
      "environment": "PROD",
      // ... all other configuration fields
    },
    
    // State Information
    "fibonacci_levels": {
      "0.236": 15250.50,
      "0.382": 15245.25,
      "0.5": 15240.00,
      "0.618": 15235.75
    },
    "trading_window_active": true,
    "threshold_reached": false,
    
    // Recent Trade History (if include_history=true)
    "recent_trades": [
      {
        "trade_id": "trade_001",
        "timestamp": "2024-01-20T09:15:00Z",
        "type": "long",
        "entry_price": 15245.50,
        "exit_price": 15250.25,
        "quantity": 2,
        "pnl": 9.50,
        "duration_seconds": 180,
        "exit_reason": "take_profit"
      }
    ],
    
    // Execution Logs (if include_logs=true)
    "recent_logs": [
      {
        "timestamp": "2024-01-20T10:30:15Z",
        "level": "INFO",
        "message": "Order filled: Long 2 NQ @ 15245.50",
        "context": {
          "order_id": "order_123",
          "fill_price": 15245.50
        }
      }
    ],
    
    // System Info
    "health_status": "healthy",
    "last_error": null,
    "error_count": 0,
    "restart_count": 2,
    "version": "1.2.3",
    
    // Timestamps
    "created_at": "2024-01-10T08:00:00Z",
    "updated_at": "2024-01-20T10:30:00Z"
  }
}
```

### Response (Error - 404)
```json
{
  "error": "Bot not found",
  "success": false
}
```

### Backend Implementation Steps
1. Check active bots table first
2. If not found, check archived_bots table
3. Retrieve complete bot record with all fields
4. Calculate real-time metrics:
   - Win rate = won_orders / (won_orders + lost_orders)
   - Profit factor = total_wins / abs(total_losses)
   - Average trade metrics
5. If include_history=true, fetch recent trades
6. If include_logs=true, fetch recent execution logs
7. Include current state (positions, orders, levels)
8. Return comprehensive bot details
9. Cache results for performance (5-10 seconds)

**Use Cases**:
- Detailed bot analysis
- Performance review
- Debugging issues
- Configuration verification
- Before restart decision

---

## 7. GET BOT CONFIGURATIONS LIBRARY

**Purpose**: Retrieve saved bot configurations/templates

### Endpoint
```
GET /api/bot-configurations
```

### Frontend Implementation
- **File**: `components/config-library.tsx`
- **Function**: `fetchConfigurations()` - called on component mount

### Request
```typescript
URL: /api/bot-configurations
Method: GET

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Query Parameters (Optional):
  ?bot_type=orcamax|bonucci|fibonacci
  &tags=scalping,momentum
  &status=active|archived|draft
  &sort_by=created_at|usage_count|performance
```

### Response (Success - 200)
```json
{
  "success": true,
  "configurations": [
    {
      "id": "config_1",
      "name": "High Frequency Scalper",
      "description": "Aggressive scalping strategy for volatile markets",
      "bot_type": "orcamax",
      "config": {
        "instrument": "NQ",
        "quantity": 2,
        "point_strategy_key": "aggressive_scalp_v2",
        "exit_strategy_key": "quick_exit_1min",
        "account_name": "APEX_136189",
        "custom_name": "HF Scalper Pro"
      },
      "created_at": "2024-01-15T10:00:00Z",
      "last_used": "2024-01-20T14:30:00Z",
      "times_used": 45,
      "success_rate": 78,
      "total_pnl": 12450.50,
      "tags": ["scalping", "high-frequency", "volatile"],
      "is_favorite": true,
      "created_by": "user@example.com",
      "status": "active",
      "performance_metrics": {
        "win_rate": 78,
        "avg_pnl": 276.68,
        "total_trades": 892,
        "best_day": 2340.00,
        "worst_day": -890.50
      }
    }
  ],
  "total": 25,
  "timestamp": "2024-01-20T10:00:00Z"
}
```

### Backend Implementation Steps
1. Query `bot_configurations` table
2. Filter by user if needed (support shared configs)
3. Apply filters: bot_type, tags, status
4. Calculate performance metrics from historical bot runs
5. Include usage statistics (times_used, success_rate)
6. Sort by requested criteria
7. Return configurations with full metadata

---

## 8. SAVE BOT CONFIGURATION

**Purpose**: Save a bot configuration as a template for later use

### Endpoint
```
POST /api/bot-configurations
```

### Frontend Implementation
- **File**: `components/config-library.tsx`
- **Function**: Save configuration action

### Request
```typescript
URL: /api/bot-configurations
Method: POST

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Body: {
  "name": "My Custom Strategy",
  "description": "Description of the strategy",
  "bot_type": "orcamax",
  "config": {
    // Full bot configuration
  },
  "tags": ["custom", "scalping"],
  "is_template": true,
  "is_shared": false
}
```

### Response (Success - 201)
```json
{
  "success": true,
  "configuration_id": "config_xyz123",
  "message": "Configuration saved successfully"
}
```

---

## 9. DEPLOY CONFIGURATION FROM LIBRARY

**Purpose**: Create and start a bot using a saved configuration

### Endpoint
```
POST /api/bots/create/{bot_type}
```

### Frontend Implementation
- **File**: `components/config-library.tsx`
- **Function**: `handleRunConfig()` → calls `handleOrcaMaxSubmit(config.config)`
- **File**: `components/trading-bots-tab.tsx`
- **Function**: `handleRunConfigFromLibrary()`

### Request
```typescript
URL: /api/bots/create/orcamax
Method: POST

Headers: {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {access_token}'
}

Body: {
  // Complete config from the library
  "instrument": "NQ",
  "quantity": 2,
  "account_name": "APEX_136189",
  "point_strategy_key": "aggressive_scalp_v2",
  "exit_strategy_key": "quick_exit_1min",
  "custom_name": "Deployed from Library",
  "environment": "PROD",
  // ... all required fields for bot type
}
```

### Response (Success - 200)
```json
{
  "success": true,
  "message": "OrcaMax bot deployed successfully!",
  "bot_id": "orca_max_new_xyz123",
  "data": {
    // Bot creation details
  }
}
```

### Backend Implementation Steps
1. **This uses EXISTING bot creation endpoints**
2. Validate configuration for the bot type
3. Create and start new bot instance
4. Optionally update configuration usage_count
5. Return bot_id and confirmation

**Note**: This reuses existing `/api/bots/create/{bot_type}` endpoints

---

## Error Handling Standards

All endpoints must return consistent error format:

### Error Response Format
```json
{
  "error": "Descriptive error message",
  "success": false,
  "error_code": "BOT_NOT_FOUND"  // Optional error code
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created (for new resources)
- `400` - Bad Request (invalid data, missing fields)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (user lacks permission)
- `404` - Not Found (bot/configuration doesn't exist)
- `500` - Internal Server Error

---

## Database Schema Recommendations

### archived_bots table
```sql
CREATE TABLE archived_bots (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(255) UNIQUE NOT NULL,
  bot_type VARCHAR(50) NOT NULL,
  instrument VARCHAR(50),
  account_name VARCHAR(255),
  config JSONB NOT NULL,
  
  -- Final State
  final_pnl DECIMAL(10,2),
  total_runtime_seconds INTEGER,
  
  -- Archive Metadata
  archived_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_by VARCHAR(255),
  archive_reason VARCHAR(50),
  
  -- Metrics
  closed_positions INTEGER,
  won_orders INTEGER,
  lost_orders INTEGER,
  max_drawdown DECIMAL(10,2),
  win_rate DECIMAL(5,2),
  
  -- Timestamps
  start_time TIMESTAMP,
  last_health_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_archived_at (archived_at DESC),
  INDEX idx_bot_type (bot_type),
  INDEX idx_archive_reason (archive_reason),
  INDEX idx_account_name (account_name)
);
```

### bot_configurations table
```sql
CREATE TABLE bot_configurations (
  id SERIAL PRIMARY KEY,
  config_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  bot_type VARCHAR(50) NOT NULL,
  config JSONB NOT NULL,
  
  -- Metadata
  tags TEXT[],
  created_by VARCHAR(255),
  is_template BOOLEAN DEFAULT false,
  is_shared BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  status VARCHAR(50) DEFAULT 'active',
  
  -- Usage Statistics
  times_used INTEGER DEFAULT 0,
  last_used TIMESTAMP,
  
  -- Performance
  success_rate DECIMAL(5,2),
  total_pnl DECIMAL(10,2),
  performance_metrics JSONB,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_bot_type (bot_type),
  INDEX idx_created_by (created_by),
  INDEX idx_tags (tags),
  INDEX idx_status (status)
);
```

### bot_audit_log table
```sql
CREATE TABLE bot_audit_log (
  id SERIAL PRIMARY KEY,
  bot_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,  -- 'archive', 'unarchive', 'delete', 'restart'
  performed_by VARCHAR(255),
  reason VARCHAR(255),
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_bot_id (bot_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp DESC)
);
```

---

## Authentication

All endpoints expect Bearer token authentication:

```typescript
// Frontend sends
headers: {
  'Authorization': `Bearer ${localStorage.getItem('access_token')}`
}
```

### Token Handling
1. Extract token from `Authorization` header
2. Validate token
3. Extract user information (email, user_id)
4. Use for authorization checks
5. Return 401 if invalid/expired

---

## Implementation Priority

### HIGH Priority (Core Functionality)
1. ✅ **POST /api/bots/{bot_id}/archive** - Archive bots
2. ✅ **GET /api/bots/archived** - View archived bots
3. ✅ **POST /api/bots/restart** - Restart bots with config
4. ✅ **GET /api/bots/{bot_id}/details** - View complete bot details

### MEDIUM Priority (Enhanced Features)
5. ⚠️ **POST /api/bots/{bot_id}/unarchive** - Restore archived bots
6. ⚠️ **DELETE /api/bots/{bot_id}** - Permanent deletion
7. ⚠️ **GET /api/bot-configurations** - Configuration library

### LOW Priority (Future Enhancements)
8. 🔵 **POST /api/bot-configurations** - Save new configurations
9. 🔵 Bulk operations endpoints
10. 🔵 Export archived bots

---

## Testing Checklist

For each endpoint, test:

- ✓ Valid request with authentication
- ✓ Missing authentication token
- ✓ Invalid bot_id / configuration_id
- ✓ Missing required fields
- ✓ User permission validation
- ✓ Database transaction success/rollback
- ✓ Concurrent requests handling
- ✓ Error message clarity

---

## Integration Notes

### With Existing Bot System
- Archive endpoint should call existing bot stop logic
- Restart endpoint should use existing bot creation flow
- Maintain consistency with existing bot_id format
- Preserve all existing bot metadata

### State Synchronization
- Update Redis cache when archiving/unarchiving
- Ensure database and cache consistency
- Handle race conditions in state transitions

### Audit Logging
- Log all archive/unarchive/delete actions
- Include user_id, timestamp, and reason
- Track configuration deployments
- Maintain audit trail for compliance

---

## Summary Table

| Endpoint | Method | Priority | Frontend File | Function |
|----------|--------|----------|---------------|----------|
| `/api/bots/{bot_id}/archive` | POST | **HIGH** | trading-bots-tab.tsx | handleArchiveBot() |
| `/api/bots/archived` | GET | **HIGH** | archived-bots-tab.tsx | fetchArchivedBots() |
| `/api/bots/restart` | POST | **HIGH** | trading-bots-tab.tsx<br>archived-bots-tab.tsx | handleRestartBot()<br>handleRestart() |
| `/api/bots/{bot_id}/details` | GET | **HIGH** | bot-config-details.tsx<br>archived-bots-tab.tsx | View Details |
| `/api/bots/{bot_id}/unarchive` | POST | **MEDIUM** | archived-bots-tab.tsx | handleUnarchive() |
| `/api/bots/{bot_id}` | DELETE | **MEDIUM** | archived-bots-tab.tsx | handleDelete() |
| `/api/bot-configurations` | GET | **MEDIUM** | config-library.tsx | fetchConfigurations() |
| `/api/bot-configurations` | POST | LOW | config-library.tsx | Save Config |
| `/api/bots/create/{type}` | POST | EXISTING | config-library.tsx | handleRunConfig() |

---

## Quick Reference - Frontend to Backend Calls

### Archive Flow
```
User clicks "Archive" → handleArchiveBot() → POST /api/bots/{bot_id}/archive
→ Bot archived → refetch() → UI updates
```

### View Details Flow
```
User clicks "View Details" → Opens dialog → GET /api/bots/{bot_id}/details
→ Display comprehensive information
```

### Restart Flow
```
User clicks "Restart" → handleRestartBot() → POST /api/bots/restart
→ New bot created → refetch() → UI updates
```

### Unarchive Flow
```
User clicks "Unarchive" → handleUnarchive() → POST /api/bots/{bot_id}/unarchive
→ Bot moves to active → refetch() → UI updates
```

### Delete Flow
```
User clicks "Delete" → Confirm → handleDelete() → DELETE /api/bots/{bot_id}
→ Bot permanently removed → refetch() → UI updates
```

---

**End of Specification**

For questions or clarifications, refer to:
- Frontend mock implementations: `/app/api/bots/` directory
- Mock storage: `/lib/mock-storage.ts`
- Component implementations: `/components/` directory
