import { NextRequest, NextResponse } from 'next/server';

// Backend API URL - should be configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    // Build URL with optional status filter
    let url = `${BACKEND_API_URL}${API_V1_PREFIX}/run-bot/configs`;
    if (status) {
      url += `?status=${encodeURIComponent(status)}`;
    }

    const response = await fetch(url, {
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
    console.error('Error fetching run configurations:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch run configurations' 
      },
      { status: 500 }
    );
  }
}
