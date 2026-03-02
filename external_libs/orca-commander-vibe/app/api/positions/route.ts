import { NextRequest, NextResponse } from 'next/server';
import { getSharedRedisClient } from '@/lib/redis';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';



export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountName = searchParams.get('account');
    
    if (!accountName) {
      return NextResponse.json({ error: 'Account parameter is required' }, { status: 400 });
    }

    // Get account ID from the account name by looking up in dummy accounts
    const { dummyAccounts } = await import('@/lib/data');
    const account = dummyAccounts.find(acc => acc.name === accountName);
    if (!account) {
      return NextResponse.json({ error: `No account found for ${accountName}` }, { status: 400 });
    }
    const accountId = account.id;

    // Use the shared Redis client
    const redisClient = await getSharedRedisClient();
    if (!redisClient) {
      return NextResponse.json({ error: 'Redis connection failed' }, { status: 500 });
    }

    // Fetch JWT token from Redis
    let jwtToken: string | null = null;
    try {
      jwtToken = await redisClient.get(`tokens:${accountName}`);
      console.log('JWT token:', `tokens:${accountName}`);
      if (!jwtToken) {
        return NextResponse.json({ error: `No JWT token found for account ${accountName}` }, { status: 404 });
      }
    } catch (redisError) {
      return NextResponse.json({ 
        error: 'Failed to fetch JWT token from Redis',
        details: redisError instanceof Error ? redisError.message : String(redisError)
      }, { status: 500 });
    }

    // Make API call to Tradovate
    const response = await fetch(`https://tv-demo.tradovateapi.com/accounts/${accountId}/positions?locale=en`, {
      method: 'GET',
      headers: {
        'Host': 'tv-demo.tradovateapi.com',
        'Connection': 'keep-alive',
        'sec-ch-ua-platform': '"macOS"',
        'Authorization': `Bearer ${jwtToken}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'Origin': 'https://www.tradingview.com',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Referer': 'https://www.tradingview.com/',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ 
        error: `Tradovate API error: ${response.status}`,
        details: await response.text()
      }, { status: response.status });
    }

    const positionsData = await response.json();
    
    // Extract positions from the response structure
    const positions = positionsData.d || [];
    
    return NextResponse.json({
      success: true,
      positions,
      accountId,
      accountName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to fetch positions',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
