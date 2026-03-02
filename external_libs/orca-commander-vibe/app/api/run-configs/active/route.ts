import { NextRequest, NextResponse } from 'next/server';

// Backend API URL - should be configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_API_URL}${API_V1_PREFIX}/run-bot/configs/active`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
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
      configs: data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching active run configurations:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch active run configurations' 
      },
      { status: 500 }
    );
  }
}
