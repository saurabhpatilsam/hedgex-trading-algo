import { NextRequest, NextResponse } from 'next/server';
import { OrcaMaxConfig, BonucciConfig } from '@/lib/types';

// Backend API URL - should be configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

export interface BotState {
  bot_id: string;
  bot_type?: 'orcamax' | 'bonucci';
  status: 'running' | 'stopped' | 'error' | 'paused';
  start_time: string;
  last_health_check: string;
  instrument: string;
  account_name: string;
  total_pnl: number;
  open_positions: number;
  closed_positions: number;
  active_orders: number;
  fibonacci_levels: Record<string, number>;
  trading_window_active: boolean;
  threshold_reached: boolean;
  config?: OrcaMaxConfig | BonucciConfig;
}

interface BotsResponse {
  success: boolean;
  bots: BotState[];
  timestamp: string;
}

// Map run config status to bot status
function mapConfigStatusToBotStatus(configStatus: string): 'running' | 'stopped' | 'error' | 'paused' {
  const status = configStatus?.toLowerCase() || 'stopped';
  
  if (status === 'running' || status === 'active') return 'running';
  if (status === 'paused') return 'paused';
  if (status === 'error' || status === 'failed') return 'error';
  return 'stopped'; // queued, completed, cancelled, etc.
}

export async function GET(request: NextRequest) {
  try {
    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    // Fetch bot run configurations from backend API
    const response = await fetch(`${BACKEND_API_URL}${API_V1_PREFIX}/run-bot/configs`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
      },
    });

    if (!response.ok) {
      // If endpoint doesn't exist, try alternative endpoint
      if (response.status === 404) {
        // Return empty bots array for now
        return NextResponse.json({
          success: true,
          bots: [],
          timestamp: new Date().toISOString()
        });
      }
      
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Backend API error:', errorData);
      return NextResponse.json(
        { 
          success: false, 
          error: errorData.detail || `Backend API returned ${response.status}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Transform run configs to bot state format
    const configs = Array.isArray(data) ? data : (data.configs || data.data || []);
    
    // Note: The backend API should already filter out archived bots
    // The /api/bots/ endpoint only returns active bots
    // Archived bots are accessed via /api/bots/archived endpoint
    
    const bots: BotState[] = configs.map((config: any) => ({
        bot_id: config.id?.toString() || config.bot_id || '',
        bot_type: 'orcamax', // Default to orcamax since configs come from run-bot/max
        status: mapConfigStatusToBotStatus(config.status),
        start_time: config.created_at || config.start_time || new Date().toISOString(),
        last_health_check: config.updated_at || config.last_health_check || new Date().toISOString(),
        instrument: config.config?.instrument_name || config.contract || config.instrument || 'NQ',
        account_name: config.config?.main_account || config.account_name || config.accountName || config.created_by || 'Unknown',
        total_pnl: config.total_pnl || 0, // Run configs don't track PnL yet
        open_positions: config.open_positions || 0,
        closed_positions: config.closed_positions || 0,
        active_orders: config.active_orders || 0,
        won_orders: config.won_orders || 0,
        lost_orders: config.lost_orders || 0,
        fibonacci_levels: {},
        trading_window_active: config.status === 'running',
        threshold_reached: false,
        config: config.config || config, // Store the actual config object
      }));

    return NextResponse.json({
      success: true,
      bots: bots,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching bot states:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bot states' },
      { status: 500 }
    );
  }
}
