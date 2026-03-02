import { NextRequest, NextResponse } from 'next/server';

// Backend API URL - should be configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';
export async function GET(request: NextRequest) {
  try {
    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const archiveReason = searchParams.get('archive_reason');
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';

    // Build query string
    const queryParams = new URLSearchParams();
    if (archiveReason) queryParams.append('archive_reason', archiveReason);
    queryParams.append('limit', limit);
    queryParams.append('offset', offset);

    const backendUrl = `${BACKEND_API_URL}${API_V1_PREFIX}/bots/archived?${queryParams}`;
    console.log('[GET /api/bots/archived] Calling backend:', backendUrl);

    // Fetch archived bots from backend API
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
      },
    });

    console.log('[GET /api/bots/archived] Backend response:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error('[GET /api/bots/archived] Backend API error:', errorData);
      return NextResponse.json(
        { 
          success: false,
          error: errorData.detail || `Backend API returned ${response.status}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[GET /api/bots/archived] Backend data:', { 
      success: data.success, 
      botsCount: data.bots?.length || 0,
      total: data.total 
    });

    return NextResponse.json({
      success: true,
      bots: data.bots || [],
      total: data.total || 0,
      timestamp: data.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GET /api/bots/archived] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch archived bots' },
      { status: 500 }
    );
  }
}
