import { NextRequest, NextResponse } from 'next/server';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bot_id, config, bot_type, modified = false } = body;

    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Forward to backend restart endpoint
    const backendUrl = `${BACKEND_API_URL}${API_V1_PREFIX}/bots/restart`;
    console.log('[Restart] Calling backend:', backendUrl);
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        bot_id,
        config,
        modified,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('Backend API error:', errorData);
      return NextResponse.json(
        { 
          success: false,
          error: errorData.detail || errorData.message || `Backend API returned ${response.status}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      message: data.message || 'Bot restarted successfully',
      bot_id: data.bot_id,
      config: data.config,
    });
  } catch (error) {
    console.error('Error restarting bot:', error);
    return NextResponse.json(
      { error: 'Failed to restart bot' },
      { status: 500 }
    );
  }
}
