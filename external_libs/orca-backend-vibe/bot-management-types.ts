/**
 * Bot Management System - TypeScript Type Definitions
 * 
 * Copy this file to your frontend project for type-safe API integration
 * Compatible with the OrcaBot Backend API
 */

// ============= Enums =============

export enum BotStatus {
  INITIALIZING = "initializing",
  RUNNING = "running",
  PAUSED = "paused",
  STOPPED = "stopped",
  ERROR = "error"
}

export enum ActionType {
  START = "start",
  PAUSE = "pause",
  STOP = "stop",
  RESUME = "resume",
  CLEAR_ORDERS = "clear_orders",
  CLEAR_POSITIONS = "clear_positions",
  CLEAR_ALL = "clear_all",
  ERROR = "error"
}

export enum DataSource {
  BOT_STATE = "bot_state",    // Real-time state (24hr TTL)
  BOTS_TABLE = "bots_table"   // Persistent storage
}

// ============= Core Types =============

export interface BotState {
  bot_id: string;
  custom_name: string | null;
  status: BotStatus;
  instrument: string;
  account_name: string;
  accounts_ids: string | null;
  start_time: string;          // ISO 8601
  last_health_check: string;   // ISO 8601
  stopped_at: string | null;   // ISO 8601
  
  // Trading Metrics
  total_pnl: number;
  open_positions: number;
  closed_positions: number;
  active_orders: number;
  won_orders: number;
  lost_orders: number;
  
  // Optional fields
  config?: Record<string, any>;
  data_source?: DataSource;
}

export interface BotAction {
  id: number;
  bot_id: string;
  action_type: ActionType;
  performed_by: string;
  timestamp: string;           // ISO 8601
  details: Record<string, any> | null;
  success: boolean;
  error_message: string | null;
}

export interface BotMetric {
  id: number;
  bot_id: string;
  timestamp: string;           // ISO 8601
  total_pnl: number;
  open_positions: number;
  closed_positions: number;
  active_orders: number;
  won_orders: number;
  lost_orders: number;
  win_rate: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
}

// ============= API Request Types =============

export interface BotControlRequest {
  performed_by: string;
  reason?: string;
  force?: boolean;
}

export interface ClearRequest extends BotControlRequest {
  clear_orders?: boolean;
  clear_positions?: boolean;
}

// ============= API Response Types =============

export interface BotListResponse {
  bots: BotState[];
  total: number;
  active: number;
  paused: number;
  stopped: number;
  error: number;
}

export interface BotDetailResponse {
  bot: BotState;
  recent_actions: BotAction[];
}

export interface ControlActionResponse {
  success: boolean;
  message: string;
  action_id?: number;
  bot_id: string;
  new_status?: BotStatus;
  current_status?: BotStatus;
}

export interface HealthCheckResponse {
  redis_connected: boolean;     // Actually Supabase state
  database_connected: boolean;
  total_bots: number;
  active_bots: number;
  timestamp: string;            // ISO 8601
}

// ============= Supabase Real-time Types =============

export interface BotChangePayload {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  new: BotState;
  old: BotState | null;
}

export interface ActionChangePayload {
  event: 'INSERT';
  new: BotAction;
}

// ============= Helper Types =============

export interface BotStatistics {
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  totalTrades: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

// ============= API Client Interface =============

export interface BotManagementAPI {
  // Read Operations
  getAllBots(status?: BotStatus): Promise<BotListResponse>;
  getBotDetail(botId: string): Promise<BotDetailResponse>;
  getBotActions(botId: string, limit?: number): Promise<BotAction[]>;
  getBotMetrics(botId: string, limit?: number): Promise<BotMetric[]>;
  getHealthCheck(): Promise<HealthCheckResponse>;
  
  // Control Operations
  pauseBot(botId: string, request: BotControlRequest): Promise<ControlActionResponse>;
  resumeBot(botId: string, request: BotControlRequest): Promise<ControlActionResponse>;
  stopBot(botId: string, request: BotControlRequest): Promise<ControlActionResponse>;
  clearBot(botId: string, request: ClearRequest): Promise<ControlActionResponse>;
}

// ============= Utility Functions =============

/**
 * Calculate win rate from bot metrics
 */
export function calculateWinRate(bot: BotState): number {
  const total = bot.won_orders + bot.lost_orders;
  return total > 0 ? (bot.won_orders / total) * 100 : 0;
}

/**
 * Format bot status for display
 */
export function formatBotStatus(status: BotStatus): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case BotStatus.RUNNING:
      return { label: 'Running', color: 'green', icon: '▶️' };
    case BotStatus.PAUSED:
      return { label: 'Paused', color: 'yellow', icon: '⏸️' };
    case BotStatus.STOPPED:
      return { label: 'Stopped', color: 'gray', icon: '⏹️' };
    case BotStatus.ERROR:
      return { label: 'Error', color: 'red', icon: '⚠️' };
    case BotStatus.INITIALIZING:
      return { label: 'Starting', color: 'blue', icon: '🔄' };
    default:
      return { label: 'Unknown', color: 'gray', icon: '❓' };
  }
}

/**
 * Check if a bot can be controlled (paused/resumed/stopped)
 */
export function canControlBot(status: BotStatus): {
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
} {
  return {
    canPause: status === BotStatus.RUNNING,
    canResume: status === BotStatus.PAUSED,
    canStop: [BotStatus.RUNNING, BotStatus.PAUSED].includes(status)
  };
}

/**
 * Format PnL for display
 */
export function formatPnL(value: number): {
  formatted: string;
  isPositive: boolean;
  color: string;
} {
  const isPositive = value >= 0;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value));
  
  return {
    formatted: isPositive ? formatted : `-${formatted}`,
    isPositive,
    color: isPositive ? 'green' : 'red'
  };
}

/**
 * Parse bot_id to extract components
 */
export function parseBotId(botId: string): {
  prefix: string;
  runId: string;
  uuid: string;
} | null {
  const match = botId.match(/^(orca_max)_(\d+)_([a-f0-9]+)$/);
  if (!match) return null;
  
  return {
    prefix: match[1],
    runId: match[2],
    uuid: match[3]
  };
}

/**
 * Get display name for bot
 */
export function getBotDisplayName(bot: BotState): string {
  return bot.custom_name || bot.bot_id;
}

/**
 * Check if bot is in terminal state
 */
export function isTerminalState(status: BotStatus): boolean {
  return status === BotStatus.STOPPED;
}

/**
 * Get time since last health check
 */
export function getTimeSinceHealthCheck(lastCheck: string): {
  minutes: number;
  isStale: boolean;
} {
  const now = new Date();
  const checkTime = new Date(lastCheck);
  const diffMs = now.getTime() - checkTime.getTime();
  const minutes = Math.floor(diffMs / 60000);
  
  return {
    minutes,
    isStale: minutes > 5  // Consider stale if no update for 5+ minutes
  };
}
