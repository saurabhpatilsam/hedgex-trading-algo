import { NextRequest, NextResponse } from 'next/server';
import { getSharedRedisClient } from '@/lib/redis';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SubAccount {
  id: string;
  name: string;
  currency?: string;
  locale?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mainAccount = searchParams.get('mainAccount');
    
    if (!mainAccount) {
      return NextResponse.json({ error: 'Main account parameter is required' }, { status: 400 });
    }

    // Use the shared Redis client
    const redisClient = await getSharedRedisClient();
    if (!redisClient) {
      return NextResponse.json({ error: 'Redis connection failed' }, { status: 500 });
    }

    // Fetch sub-accounts from Redis using the tv_info:ACCOUNT_NAME pattern
    const tvInfoKey = `tv_info:${mainAccount}`;
    let subAccountsJson: string | null = null;

    try {
      subAccountsJson = await redisClient.get(tvInfoKey);
      
      if (!subAccountsJson) {
        // If not found in Redis, fall back to dummy data
        const { dummyAccounts } = await import('@/lib/data');
        const subAccounts = dummyAccounts.filter(acc => acc.owner === mainAccount);
        
        if (subAccounts.length === 0) {
          return NextResponse.json({ 
            error: `No sub-accounts found for ${mainAccount}`,
            subAccounts: []
          }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          mainAccount,
          subAccounts: subAccounts.map(acc => ({
            id: acc.id,
            name: acc.name,
            currency: 'USD',
            locale: null
          })),
          source: 'database'
        });
      }

      // Parse the JSON from Redis
      const subAccounts: SubAccount[] = JSON.parse(subAccountsJson);

      return NextResponse.json({
        success: true,
        mainAccount,
        subAccounts,
        source: 'redis'
      });

    } catch (redisError) {
      console.error('Redis error:', redisError);
      
      // Fall back to dummy data on Redis error
      const { dummyAccounts } = await import('@/lib/data');
      const subAccounts = dummyAccounts.filter(acc => acc.owner === mainAccount);
      
      return NextResponse.json({
        success: true,
        mainAccount,
        subAccounts: subAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          currency: 'USD',
          locale: null
        })),
        source: 'database',
        warning: 'Redis fetch failed, using fallback data'
      });
    }

  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to fetch sub-accounts',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
