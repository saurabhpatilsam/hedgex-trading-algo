import { NextRequest, NextResponse } from 'next/server';
import { OrcaMaxConfig } from '@/lib/types';

// Backend API URL - should be configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

export async function POST(request: NextRequest) {
  try {
    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated - missing token' },
        { status: 401 }
      );
    }

    const config: OrcaMaxConfig = await request.json();

    // Validate required fields
    if (!config.accountName || !config.contract ||
        !config.trading_mode || !config.trading_side || !config.point_position ||
        !config.point_strategy_key || !config.exit_strategy_key || 
        !config.dateFrom || !config.dateTo || !config.environment) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate sub-account selection
    if (!config.selected_subaccounts || config.selected_subaccounts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one sub-account must be selected' },
        { status: 400 }
      );
    }

    // Prepare form data for the backend API
    const formData = new URLSearchParams();
    formData.append('accountName', config.accountName);
    formData.append('contract', config.contract);
    formData.append('trading_mode', config.trading_mode);
    formData.append('trading_side', config.trading_side);
    formData.append('point_strategy_key', config.point_strategy_key);
    formData.append('point_position', config.point_position);
    formData.append('exit_strategy_key', config.exit_strategy_key);
    formData.append('dateFrom', new Date(config.dateFrom).toISOString());
    formData.append('dateTo', new Date(config.dateTo).toISOString());
    formData.append('quantity', config.quantity.toString());
    formData.append('environment', config.environment);
    
    // Append selected sub-accounts to the form data
    if (config.selected_subaccounts && config.selected_subaccounts.length > 0) {
      formData.append('selected_subaccounts', JSON.stringify(config.selected_subaccounts));
    }
    
    if (config.accounts_ids) {
      formData.append('accounts_ids', config.accounts_ids);
    }
    if (config.notes) {
      formData.append('notes', config.notes);
    }

    // Call the backend API with authorization
    const response = await fetch(`${BACKEND_API_URL}${API_V1_PREFIX}/run-bot/max`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader, // Forward the auth token
      },
      body: formData.toString(),
    });

    if (!response.ok) {
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

    return NextResponse.json({
      success: true,
      message: 'OrcaMax bot deployed successfully',
      data,
    });

  } catch (error) {
    console.error('Error creating OrcaMax bot:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create OrcaMax bot' 
      },
      { status: 500 }
    );
  }
}
