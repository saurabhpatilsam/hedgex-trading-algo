import { NextResponse } from 'next/server';
import { connectionManager } from '@/lib/connection-manager';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const beforeCount = connectionManager.getConnectionCount();
    connectionManager.forceCleanup();
    const afterCount = connectionManager.getConnectionCount();
    
    return NextResponse.json({
      success: true,
      message: `Emergency cleanup completed`,
      beforeCount,
      afterCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during emergency cleanup:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to perform emergency cleanup' 
    }, { status: 500 });
  }
}
