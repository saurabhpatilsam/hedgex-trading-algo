import { NextRequest, NextResponse } from 'next/server';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const API_V1_PREFIX = '/api/v1';

export async function POST(
  request: NextRequest,
  { params }: { params: { botId: string } }
) {
  try {
    const { botId } = params;

    // Extract authorization token from request headers
    const authHeader = request.headers.get('authorization');

    // Unarchive bot on backend
    const response = await fetch(`${BACKEND_API_URL}${API_V1_PREFIX}/bots/${botId}/unarchive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
      },
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

    // Log the unarchive action
    console.log(`Bot ${botId} unarchived successfully:`, {
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: data.message || 'Bot unarchived successfully',
    });
  } catch (error) {
    console.error('Error unarchiving bot:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
