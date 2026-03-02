import { NextResponse } from 'next/server';
import { connectionManager } from '@/lib/connection-manager';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = {
      activeConnections: connectionManager.getActiveCount(),
      totalConnections: connectionManager.getTotalCount(),
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error getting connection status:', error);
    return NextResponse.json({ error: 'Failed to get connection status' }, { status: 500 });
  }
}
