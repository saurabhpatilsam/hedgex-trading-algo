import { NextRequest, NextResponse } from 'next/server';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

export async function POST(
  request: NextRequest,
  { params }: { params: { botId: string } }
) {
  try {
    const { botId } = params;
    const body = await request.json();
    const { reason = 'manual', archived_by = 'user' } = body;

    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');

    // Archive bot on backend
    const backendUrl = `${BACKEND_API_URL}${API_V1_PREFIX}/bots/${botId}/archive`;
    console.log('[Archive] Calling backend:', backendUrl);
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
      },
      body: JSON.stringify({
        reason,
        archived_by,
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

    // Log the archive action
    console.log(`Bot ${botId} archived successfully:`, {
      reason,
      archived_by,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: data.message || 'Bot archived successfully',
      archived_bot: data.archived_bot || { bot_id: botId },
    });
  } catch (error) {
    console.error('Error archiving bot:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
