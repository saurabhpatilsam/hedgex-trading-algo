import { NextResponse } from 'next/server';
import { getSharedRedisClient } from '@/lib/redis';

// Force dynamic rendering - this route should never be statically generated
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const client = await getSharedRedisClient();
    if (!client) {
      return NextResponse.json({ connected: false, error: 'Redis client not available' }, { status: 500 });
    }

    // Test the connection with a timeout
    const pingResult = await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]);

    // Get Redis host from environment for display
    const redisHost = process.env.REDIS_HOST || 'localhost';

    return NextResponse.json({ connected: true, host: redisHost });
  } catch (error) {
    // Don't log timeout errors as they're expected
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('Timeout')) {
      console.error('Redis status check failed:', error);
    }
    return NextResponse.json({ connected: false, error: errorMessage }, { status: 500 });
  }
}
