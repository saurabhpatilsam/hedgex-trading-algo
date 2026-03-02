import { NextRequest, NextResponse } from 'next/server';

// Backend API URL - should be configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

interface UpdateStatusRequest {
  status: 'running' | 'paused' | 'stopped';
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { botId: string } }
) {
  try {
    const { botId } = params;
    const body: UpdateStatusRequest = await request.json();
    const { status } = body;

    // Validate status
    if (!['running', 'paused', 'stopped'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status. Must be running, paused, or stopped' },
        { status: 400 }
      );
    }

    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Map frontend status to backend run config status
    // Backend run_configs table only supports: queued, running, completed, failed, stopped, cancelled
    // Frontend uses: running, paused, stopped
    const backendStatus = status === 'paused' ? 'stopped' : status;

    // Update run config status via backend API
    const response = await fetch(`${BACKEND_API_URL}${API_V1_PREFIX}/run-bot/configs/${botId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({ status: backendStatus }),
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
      bot: data,
      message: `Bot status updated to ${status}`
    });

  } catch (error) {
    console.error('Error updating bot status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update bot status' },
      { status: 500 }
    );
  }
}
