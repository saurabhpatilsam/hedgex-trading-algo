import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mock configurations - in production, fetch from database
    const configurations = [
      {
        id: 'config_1',
        name: 'High Frequency Scalper',
        description: 'Aggressive scalping strategy for volatile markets',
        bot_type: 'orcamax',
        config: {
          instrument: 'NQ',
          quantity: 2,
          point_strategy_key: 'aggressive_scalp_v2',
          exit_strategy_key: 'quick_exit_1min',
          account_name: 'APEX_136189',
          custom_name: 'HF Scalper Pro'
        },
        created_at: '2024-01-15T10:00:00Z',
        last_used: '2024-01-20T14:30:00Z',
        times_used: 45,
        success_rate: 78,
        total_pnl: 12450.50,
        tags: ['scalping', 'high-frequency', 'volatile'],
        is_favorite: true,
        created_by: 'user@example.com',
        status: 'active',
        performance_metrics: {
          win_rate: 78,
          avg_pnl: 276.68,
          total_trades: 892,
          best_day: 2340.00,
          worst_day: -890.50
        }
      },
      {
        id: 'config_2',
        name: 'Conservative Swing Trader',
        description: 'Low risk swing trading with tight stop losses',
        bot_type: 'bonucci',
        config: {
          instrument: 'ES',
          quantity: 1,
          risk_percentage: 0.5,
          account_name: 'APEX_265995',
          custom_name: 'Safe Swinger'
        },
        created_at: '2024-01-10T08:00:00Z',
        last_used: '2024-01-19T09:00:00Z',
        times_used: 23,
        success_rate: 65,
        total_pnl: 8230.25,
        tags: ['swing', 'conservative', 'low-risk'],
        is_favorite: false,
        created_by: 'admin@example.com',
        status: 'active',
        performance_metrics: {
          win_rate: 65,
          avg_pnl: 357.84,
          total_trades: 234,
          best_day: 1250.00,
          worst_day: -450.00
        }
      },
      {
        id: 'config_3',
        name: 'Fibonacci Retracement Pro',
        description: 'Advanced fibonacci levels with dynamic adjustments',
        bot_type: 'fibonacci',
        config: {
          instrument: 'YM',
          quantity: 1,
          fibonacci_levels: {
            '0.236': 5,
            '0.382': 8,
            '0.5': 10,
            '0.618': 12,
          },
          account_name: 'APEX_266668',
          custom_name: 'Fib Master'
        },
        created_at: '2024-01-05T12:00:00Z',
        times_used: 12,
        success_rate: 82,
        total_pnl: 15670.75,
        tags: ['fibonacci', 'technical', 'retracement'],
        is_favorite: true,
        created_by: 'pro@trader.com',
        status: 'active',
        performance_metrics: {
          win_rate: 82,
          avg_pnl: 1305.90,
          total_trades: 156,
          best_day: 3450.00,
          worst_day: -220.00
        }
      },
      {
        id: 'config_4',
        name: 'Morning Breakout Hunter',
        description: 'Captures early morning price breakouts',
        bot_type: 'orcamax',
        config: {
          instrument: 'MNQ',
          quantity: 3,
          point_strategy_key: 'morning_breakout',
          exit_strategy_key: 'trailing_stop',
          account_name: 'APEX_272045',
          custom_name: 'Dawn Trader'
        },
        created_at: '2024-01-12T06:00:00Z',
        last_used: '2024-01-21T06:30:00Z',
        times_used: 38,
        success_rate: 71,
        total_pnl: 9875.50,
        tags: ['breakout', 'morning', 'momentum'],
        is_favorite: false,
        created_by: 'trader@example.com',
        status: 'active',
        performance_metrics: {
          win_rate: 71,
          avg_pnl: 259.88,
          total_trades: 523,
          best_day: 1890.00,
          worst_day: -670.00
        }
      }
    ];

    return NextResponse.json({
      success: true,
      configurations,
      total: configurations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching configurations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configurations' },
      { status: 500 }
    );
  }
}
