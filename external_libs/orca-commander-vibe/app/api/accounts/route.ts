import { NextRequest, NextResponse } from 'next/server';
import { getSharedRedisClient } from '@/lib/redis';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Use the shared Redis client
    const redisClient = await getSharedRedisClient();
    
    // Array to store unique account names
    const accountNames: string[] = [];
    
    if (redisClient) {
      try {
        // Scan for all keys matching tv_info:APEX_* pattern
        const keys = await redisClient.keys('tv_info:APEX_*');
        
        // Extract account names from keys
        for (const key of keys) {
          const accountName = key.replace('tv_info:', '');
          if (accountName && !accountNames.includes(accountName)) {
            accountNames.push(accountName);
          }
        }
      } catch (redisError) {
        console.error('Redis error:', redisError);
      }
    }
    
    // If no accounts found in Redis, use dummy data
    if (accountNames.length === 0) {
      const { dummyAccounts } = await import('@/lib/data');
      
      // Extract unique owners from dummy accounts
      const uniqueOwners = Array.from(new Set(dummyAccounts.map(acc => acc.owner)));
      accountNames.push(...uniqueOwners);
    }
    
    // Sort accounts for consistent display
    accountNames.sort();
    
    return NextResponse.json({
      success: true,
      accounts: accountNames,
      source: accountNames.length > 0 && redisClient ? 'redis' : 'database'
    });
    
  } catch (error) {
    console.error('Failed to fetch accounts:', error);
    
    // Fallback to dummy data on error
    const { dummyAccounts } = await import('@/lib/data');
    const uniqueOwners = Array.from(new Set(dummyAccounts.map(acc => acc.owner)));
    
    return NextResponse.json({
      success: true,
      accounts: uniqueOwners.sort(),
      source: 'database',
      warning: 'Using fallback data due to error'
    });
  }
}
