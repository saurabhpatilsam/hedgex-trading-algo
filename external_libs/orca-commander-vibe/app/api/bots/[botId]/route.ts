import { NextRequest, NextResponse } from 'next/server';

// Backend API URL - should be configured via environment variable
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { botId: string } }
) {
  const { botId } = params;
  
  try {
    console.log(`[DELETE /api/bots/${botId}] Request received`);
    
    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    // Check if permanent parameter is provided
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';
    
    console.log(`[DELETE /api/bots/${botId}] permanent=${permanent}, hasAuth=${!!authHeader}`);
    
    if (!permanent) {
      console.log(`[DELETE /api/bots/${botId}] Missing permanent=true parameter`);
      return NextResponse.json(
        { success: false, error: 'Must confirm permanent deletion with permanent=true parameter' },
        { status: 400 }
      );
    }

    // Delete bot from backend database
    const backendUrl = `${BACKEND_API_URL}${API_V1_PREFIX}/bots/${botId}?permanent=true`;
    console.log(`[DELETE /api/bots/${botId}] Calling backend: ${backendUrl}`);
    
    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
      },
    });

    console.log(`[DELETE /api/bots/${botId}] Backend response: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
      console.error(`[DELETE /api/bots/${botId}] Backend API error:`, errorData);
      return NextResponse.json(
        { 
          success: false,
          error: errorData.detail || errorData.message || `Backend API returned ${response.status}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Log the deletion action
    console.log(`[DELETE /api/bots/${botId}] Successfully deleted from backend:`, data);

    return NextResponse.json({
      success: true,
      message: data.message || 'Bot permanently deleted',
      deleted_bot_id: botId,
    });
  } catch (error) {
    console.error(`[DELETE /api/bots/${botId}] Error:`, error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
