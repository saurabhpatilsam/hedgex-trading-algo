// Bot Types
export type BotType = 'orcamax' | 'bonucci';

// OrcaMax Configuration Types
export type Contract = 'NQ' | 'ES' | 'GC' | 'MNQ' | 'MES' | 'MGC';
export type TradingMode = 'BreakThrough' | 'Reverse';
export type TradingSide = 'UP' | 'DOWN';
export type PointPosition = 'a' | 'b' | 'c';
export type Environment = 'DEV' | 'DEV_SB' | 'PROD';

export interface OrcaMaxConfig {
  accountName: string;
  contract: Contract;
  trading_mode: TradingMode;
  trading_side: TradingSide;
  point_strategy_key: string;
  point_position: PointPosition;
  exit_strategy_key: string;
  dateFrom: string;
  dateTo: string;
  quantity: number;
  environment: Environment;
  accounts_ids?: string;
  notes?: string;
  selected_subaccounts?: Array<{ tv_id: string; ta_id: string }>;
}

export interface BonucciConfig {
  // Placeholder for future Bonucci configuration
  accountName: string;
  notes?: string;
}

export interface TradingBot {
  bot_id: string;
  bot_type: BotType;
  status: 'running' | 'stopped' | 'error' | 'paused';
  start_time: string;
  last_health_check: string;
  instrument: string;
  account_name: string;
  total_pnl: number;
  open_positions: number;
  closed_positions: number;
  active_orders: number;
  won_orders?: number;
  lost_orders?: number;
  fibonacci_levels: Record<string, number>;
  trading_window_active: boolean;
  threshold_reached: boolean;
  // Bot-specific configuration
  config?: OrcaMaxConfig | BonucciConfig;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  avgFillPrice: number;
  takeProfit?: number;
  stopLoss?: number;
  lastPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  tradeValue: number;
  marketValue: number;
  leverage: number;
  margin: number;
  expirationDate?: string;
  orderId: string;
}

export interface Order {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop' | 'market';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  fillPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  instruction?: string;
  status: 'working' | 'filled' | 'cancelled' | 'rejected';
  placingTime: string;
  orderId: string;
  expiry: string;
  leverage: number;
}

export interface Account {
  id: string;
  name: string;
  owner: string;
}

// Run Configuration Types (from Backend API)
export interface RunConfig {
  id: number;
  instrument_name: string; // Contract
  way: TradingMode; // trading_mode
  point_type: TradingSide; // trading_side
  point_strategy_key: string;
  point_position: PointPosition;
  exit_strategy_key: string;
  status: string; // 'running', 'completed', 'failed', 'stopped'
  created_at?: string;
  updated_at?: string;
  user?: string;
  notes?: string;
  quantity?: number;
  environment?: Environment;
  dateFrom?: string;
  dateTo?: string;
  account_name?: string;
}
