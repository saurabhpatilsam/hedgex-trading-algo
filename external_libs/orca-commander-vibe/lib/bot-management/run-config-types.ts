/**
 * Run Configuration Types - For viewing bot runs (historical and active)
 * 
 * Separate from bot control - these track the configuration and status of bot runs
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Run configuration status
 */
export enum RunConfigStatus {
  QUEUED = "queued",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  STOPPED = "stopped"
}

/**
 * Trading contract types
 */
export enum Contract {
  NQ = "NQ",
  ES = "ES",
  GC = "GC",
  MNQ = "MNQ",
  MES = "MES",
  MGC = "MGC"
}

/**
 * Trading mode
 */
export enum TeamWay {
  BREAKTHROUGH = "BreakThrough",
  REVERSE = "Reverse"
}

/**
 * Trading side
 */
export enum PointType {
  UP = "UP",
  DOWN = "DOWN"
}

/**
 * Point position
 */
export enum PointPosition {
  A = "a",
  B = "b",
  C = "c"
}

/**
 * Environment
 */
export enum Environment {
  DEV = "DEV",
  DEV_SB = "DEV_SB",
  PROD = "PROD"
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Run configuration record (from database)
 */
export interface RunConfig {
  id: number;
  run_id?: number;
  bot_id?: string;
  status: RunConfigStatus;
  
  // Configuration
  account_name: string;
  contract: Contract;
  trading_mode: TeamWay;
  trading_side: PointType;
  point_strategy_key: string;
  point_position: PointPosition;
  exit_strategy_key: string;
  
  // Optional fields
  custom_name?: string | null;
  notes?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  quantity?: number;
  environment?: Environment;
  accounts_ids?: string | null;
  user?: string | null;
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  
  // Additional metadata
  error_message?: string | null;
  config?: Record<string, any> | null;
}

/**
 * Response from duplicate check
 */
export interface DuplicateCheckResponse {
  has_duplicates: boolean;
  duplicate_count: number;
  duplicates: RunConfig[];
  message: string;
}

/**
 * Request to check for duplicate configuration
 */
export interface DuplicateCheckRequest {
  instrument_name: string;
  way: TeamWay;
  point_type: PointType;
  point_strategy_key: string;
  point_position: PointPosition;
  exit_strategy_key: string;
}

/**
 * Request to update run status
 */
export interface UpdateStatusRequest {
  status: string;
}

/**
 * Run configuration list response
 */
export interface RunConfigListResponse {
  configs: RunConfig[];
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  stopped: number;
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Run config display data (UI-friendly)
 */
export interface RunConfigDisplayData {
  id: number;
  runId?: number;
  botId?: string;
  displayName: string;
  status: RunConfigStatus;
  statusColor: 'blue' | 'green' | 'gray' | 'red' | 'yellow';
  
  // Config summary
  contract: Contract;
  tradingMode: TeamWay;
  tradingSide: PointType;
  strategy: string;
  
  // Metadata
  accountName: string;
  user?: string;
  createdAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  
  // Status checks
  isActive: boolean;
  canStop: boolean;
  canRestart: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get status color for UI
 */
export function getRunStatusColor(status: RunConfigStatus): 'blue' | 'green' | 'gray' | 'red' | 'yellow' {
  switch (status) {
    case RunConfigStatus.QUEUED:
      return 'blue';
    case RunConfigStatus.RUNNING:
      return 'green';
    case RunConfigStatus.COMPLETED:
      return 'gray';
    case RunConfigStatus.FAILED:
      return 'red';
    case RunConfigStatus.STOPPED:
      return 'yellow';
    default:
      return 'gray';
  }
}

/**
 * Check if run is active (can be stopped)
 */
export function isRunActive(status: RunConfigStatus): boolean {
  return status === RunConfigStatus.RUNNING || status === RunConfigStatus.QUEUED;
}

/**
 * Check if run can be stopped
 */
export function canStopRun(status: RunConfigStatus): boolean {
  return status === RunConfigStatus.RUNNING || status === RunConfigStatus.QUEUED;
}

/**
 * Check if run can be restarted
 */
export function canRestartRun(status: RunConfigStatus): boolean {
  return status === RunConfigStatus.FAILED || status === RunConfigStatus.STOPPED;
}

/**
 * Convert run config to display data
 */
export function toRunConfigDisplayData(config: RunConfig): RunConfigDisplayData {
  const strategy = `${config.point_strategy_key} / ${config.exit_strategy_key}`;
  
  return {
    id: config.id,
    runId: config.run_id,
    botId: config.bot_id,
    displayName: config.custom_name || config.bot_id || `Run #${config.id}`,
    status: config.status,
    statusColor: getRunStatusColor(config.status),
    
    contract: config.contract,
    tradingMode: config.trading_mode,
    tradingSide: config.trading_side,
    strategy,
    
    accountName: config.account_name,
    user: config.user || undefined,
    createdAt: config.created_at ? new Date(config.created_at) : undefined,
    startedAt: config.started_at ? new Date(config.started_at) : undefined,
    completedAt: config.completed_at ? new Date(config.completed_at) : undefined,
    
    isActive: isRunActive(config.status),
    canStop: canStopRun(config.status),
    canRestart: canRestartRun(config.status)
  };
}

/**
 * Format strategy for display
 */
export function formatStrategy(config: RunConfig): string {
  return `${config.point_strategy_key} → ${config.exit_strategy_key}`;
}

/**
 * Format trading configuration for display
 */
export function formatTradingConfig(config: RunConfig): string {
  return `${config.contract} ${config.trading_mode} ${config.trading_side} @ ${config.point_position}`;
}

/**
 * Get duration string
 */
export function getRunDuration(config: RunConfig): string | null {
  if (!config.started_at) return null;
  
  const start = new Date(config.started_at);
  const end = config.completed_at ? new Date(config.completed_at) : new Date();
  
  const durationMs = end.getTime() - start.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
