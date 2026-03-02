/**
 * Bot Management System - TypeScript Type Definitions
 * 
 * Complete type definitions for the bot management API
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Bot execution status
 * - initializing: Bot is starting up
 * - running: Bot is actively trading
 * - paused: Bot is temporarily halted, can be resumed
 * - stopped: Bot is terminated (terminal state, cannot be resumed)
 * - error: Bot encountered an error
 */
export enum BotStatus {
  INITIALIZING = "initializing",
  RUNNING = "running",
  PAUSED = "paused",
  STOPPED = "stopped",
  ERROR = "error"
}

/**
 * Bot action types
 */
export enum BotActionType {
  START = "start",
  PAUSE = "pause",
  STOP = "stop",
  RESUME = "resume",
  CLEAR_ORDERS = "clear_orders",
  CLEAR_POSITIONS = "clear_positions",
  CLEAR_ALL = "clear_all"
}

/**
 * Data source indicator
 */
export enum DataSource {
  BOT_STATE = "bot_state",      // Real-time state (24hr TTL)
  BOTS_TABLE = "bots_table"      // Persistent storage
}

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Bot state response from the API
 */
export interface BotStateResponse {
  // Identification
  bot_id: string;
  custom_name: string | null;
  
  // Status & Configuration
  status: BotStatus;
  instrument: string;
  account_name: string;
  accounts_ids: string | null;  // JSON string of account IDs
  
  // Timestamps
  start_time: string;            // ISO 8601
  last_health_check: string;     // ISO 8601
  stopped_at: string | null;     // ISO 8601
  
  // Trading Metrics
  total_pnl: number;
  open_positions: number;
  closed_positions: number;
  active_orders: number;
  won_orders: number;
  lost_orders: number;
  
  // Metadata
  data_source: DataSource;
  config?: BotConfig;
}

/**
 * Bot configuration (optional extended data)
 */
export interface BotConfig {
  point_strategy_key?: string;
  exit_strategy_key?: string;
  [key: string]: any;  // Allow additional config properties
}

/**
 * Bot action record
 */
export interface BotActionResponse {
  id: number;
  bot_id: string;
  action_type: BotActionType;
  performed_by: string;          // Email of user who performed action
  timestamp: string;             // ISO 8601
  details: Record<string, any> | null;
  success: boolean;
  error_message: string | null;
}

// ============================================================================
// REQUEST INTERFACES
// ============================================================================

/**
 * Request body for pause action
 */
export interface PauseBotRequest {
  performed_by: string;
  reason?: string;
}

/**
 * Request body for resume action
 */
export interface ResumeBotRequest {
  performed_by: string;
}

/**
 * Request body for stop action
 */
export interface StopBotRequest {
  performed_by: string;
  reason?: string;
}

/**
 * Request body for clear action
 */
export interface ClearBotRequest {
  performed_by: string;
  force?: boolean;  // Set to true to clear even if bot is stopped
}

// ============================================================================
// RESPONSE INTERFACES
// ============================================================================

/**
 * List bots response
 */
export interface ListBotsResponse {
  bots: BotStateResponse[];
  total: number;
  active: number;
  paused: number;
  stopped: number;
  error: number;
}

/**
 * Get bot details response
 */
export interface BotDetailsResponse {
  bot: BotStateResponse;
  recent_actions: BotActionResponse[];
}

/**
 * Action response (pause, resume, stop)
 */
export interface BotActionResult {
  success: boolean;
  message: string;
  action_id?: number;
  bot_id: string;
  new_status?: BotStatus;
  current_status?: BotStatus;  // Included in error responses
}

/**
 * Clear action response
 */
export interface ClearBotResponse {
  success: boolean;
  message: string;
  cleared: {
    orders: boolean;
    positions: boolean;
  };
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  redis_connected: boolean;      // Actually Supabase state connection
  database_connected: boolean;   // Supabase database connection
  total_bots: number;
  active_bots: number;
  timestamp: string;             // ISO 8601
}

// ============================================================================
// API CLIENT INTERFACES
// ============================================================================

/**
 * Bot management API interface
 */
export interface BotManagementAPI {
  // Query methods
  getAllBots(status?: BotStatus): Promise<ListBotsResponse>;
  getBotDetails(botId: string): Promise<BotDetailsResponse>;
  getBotActions(botId: string, limit?: number): Promise<BotActionResponse[]>;
  
  // Control methods
  pauseBot(botId: string, request: PauseBotRequest): Promise<BotActionResult>;
  resumeBot(botId: string, request: ResumeBotRequest): Promise<BotActionResult>;
  stopBot(botId: string, request: StopBotRequest): Promise<BotActionResult>;
  
  // Maintenance methods
  clearBot(botId: string, request: ClearBotRequest, clearOrders?: boolean, clearPositions?: boolean): Promise<ClearBotResponse>;
  
  // Health check
  healthCheck(): Promise<HealthCheckResponse>;
}

/**
 * Bot management client configuration
 */
export interface BotManagementClientConfig {
  baseUrl: string;
  authToken?: string;
  timeout?: number;
}

// ============================================================================
// UI HELPER INTERFACES
// ============================================================================

/**
 * Bot metrics for display
 */
export interface BotMetrics {
  totalPnL: number;
  winRate: number;          // Percentage (0-100)
  openPositions: number;
  activeOrders: number;
  totalTrades: number;
  wonTrades: number;
  lostTrades: number;
}

/**
 * Bot display data (UI-friendly)
 */
export interface BotDisplayData {
  id: string;
  displayName: string;
  status: BotStatus;
  statusColor: 'green' | 'yellow' | 'gray' | 'red' | 'blue';
  instrument: string;
  accountName: string;
  metrics: BotMetrics;
  startTime: Date;
  lastHealthCheck: Date;
  stoppedAt: Date | null;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
}

// ============================================================================
// ERROR INTERFACES
// ============================================================================

/**
 * API error response
 */
export interface APIError {
  detail?: string;
  success?: boolean;
  message?: string;
  current_status?: BotStatus;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Supabase real-time event payload
 */
export interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
  schema: string;
  table: string;
}

/**
 * Query parameters for list bots
 */
export interface ListBotsParams {
  status?: BotStatus;
}

/**
 * Query parameters for clear bot
 */
export interface ClearBotParams {
  clear_orders?: boolean;
  clear_positions?: boolean;
}

/**
 * Query parameters for get actions
 */
export interface GetActionsParams {
  limit?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate win rate from bot metrics
 */
export function calculateWinRate(bot: BotStateResponse): number {
  const totalTrades = bot.won_orders + bot.lost_orders;
  if (totalTrades === 0) return 0;
  return Math.round((bot.won_orders / totalTrades) * 100);
}

/**
 * Get status color for UI display
 */
export function getStatusColor(status: BotStatus): 'green' | 'yellow' | 'gray' | 'red' | 'blue' {
  switch (status) {
    case BotStatus.RUNNING:
      return 'green';
    case BotStatus.PAUSED:
      return 'yellow';
    case BotStatus.STOPPED:
      return 'gray';
    case BotStatus.ERROR:
      return 'red';
    case BotStatus.INITIALIZING:
      return 'blue';
    default:
      return 'gray';
  }
}

/**
 * Check if bot can be paused
 */
export function canPauseBot(status: BotStatus): boolean {
  return status === BotStatus.RUNNING;
}

/**
 * Check if bot can be resumed
 */
export function canResumeBot(status: BotStatus): boolean {
  return status === BotStatus.PAUSED;
}

/**
 * Check if bot can be stopped
 */
export function canStopBot(status: BotStatus): boolean {
  return status === BotStatus.RUNNING || status === BotStatus.PAUSED;
}

/**
 * Convert bot state to display data
 */
export function toBotDisplayData(bot: BotStateResponse): BotDisplayData {
  const winRate = calculateWinRate(bot);
  
  return {
    id: bot.bot_id,
    displayName: bot.custom_name || bot.bot_id,
    status: bot.status,
    statusColor: getStatusColor(bot.status),
    instrument: bot.instrument,
    accountName: bot.account_name,
    metrics: {
      totalPnL: bot.total_pnl,
      winRate,
      openPositions: bot.open_positions,
      activeOrders: bot.active_orders,
      totalTrades: bot.won_orders + bot.lost_orders,
      wonTrades: bot.won_orders,
      lostTrades: bot.lost_orders
    },
    startTime: new Date(bot.start_time),
    lastHealthCheck: new Date(bot.last_health_check),
    stoppedAt: bot.stopped_at ? new Date(bot.stopped_at) : null,
    canPause: canPauseBot(bot.status),
    canResume: canResumeBot(bot.status),
    canStop: canStopBot(bot.status)
  };
}

/**
 * Format bot ID for display
 * Extracts custom name portion or returns full ID
 */
export function formatBotId(botId: string): string {
  // Format: orca_max_{run_id}_{uuid}
  const parts = botId.split('_');
  if (parts.length >= 4) {
    return `${parts[0]}_${parts[1]}_${parts[2]}`;
  }
  return botId;
}

/**
 * Parse accounts IDs from JSON string
 */
export function parseAccountIds(accountsIds: string | null): string[] {
  if (!accountsIds) return [];
  try {
    return JSON.parse(accountsIds);
  } catch {
    return [];
  }
}
