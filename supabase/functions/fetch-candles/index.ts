import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { connect } from 'https://deno.land/x/redis@v0.31.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CandleData {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  up_volume?: number;
  down_volume?: number;
  up_ticks?: number;
  down_ticks?: number;
}

async function getTradovateTokenFromRedis(): Promise<string | null> {
  try {
    const redis = await connect({
      hostname: Deno.env.get('REDIS_HOST') || 'redismanager.redis.cache.windows.net',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6380'),
      password: Deno.env.get('REDIS_PASSWORD'),
      tls: true,
    });

    const accounts = [
      'PAAPEX2666680000001',
      'APEX_266668',
      'PAAPEX2666680000003',
      'PAAPEX2666680000002',
      'PAAPEX2666680000004',
      'PAAPEX2666680000005',
    ];

    for (const account of accounts) {
      const token = await redis.get(`token:${account}`);
      if (token) {
        console.log(`✅ Found token for ${account}`);
        await redis.quit();
        return token;
      }
    }
    await redis.quit();
    return null;
  } catch (e) {
    console.error('❌ Redis error:', e);
    return null;
  }
}

async function renewTradovateTokens(tvToken: string) {
  try {
    const renewUrl = 'https://demo.tradovateapi.com/v1/auth/renewaccesstoken';

    const response = await fetch(renewUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${tvToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Token renewal failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.accessToken || !data.mdAccessToken) {
      throw new Error('Missing tokens in renewal response');
    }

    console.log('✅ Successfully renewed Tradovate tokens');

    return {
      access_token: data.accessToken,
      md_access_token: data.mdAccessToken,
    };
  } catch (e) {
    console.error('❌ Token renewal failed:', e);
    return null;
  }
}

async function storeRenewedTokenInRedis(accessToken: string): Promise<void> {
  try {
    const redis = await connect({
      hostname: Deno.env.get('REDIS_HOST') || 'redismanager.redis.cache.windows.net',
      port: parseInt(Deno.env.get('REDIS_PORT') || '6380'),
      password: Deno.env.get('REDIS_PASSWORD'),
      tls: true,
    });

    const accounts = [
      'PAAPEX2666680000001',
      'APEX_266668',
      'PAAPEX2666680000003',
      'PAAPEX2666680000002',
      'PAAPEX2666680000004',
      'PAAPEX2666680000005',
    ];

    const ttl = 3600; // 1 hour TTL
    let updateCount = 0;

    for (const account of accounts) {
      const key = `token:${account}`;
      await redis.setex(key, ttl, accessToken);
      updateCount++;
    }

    await redis.quit();
    console.log(`✅ Updated ${updateCount} tokens in Redis with ${ttl}s TTL`);
  } catch (e) {
    console.error('❌ Failed to store renewed token in Redis:', e);
  }
}

function calculateNumberOfCandles(daysBack: number, timeframeMinutes: number): number {
  const totalMinutes = daysBack * 24 * 60;
  const numberOfCandles = Math.ceil(totalMinutes / timeframeMinutes);

  console.log(`📋 Calculation: ${daysBack} days = ${totalMinutes} minutes`);
  console.log(`📋 ${totalMinutes} minutes ÷ ${timeframeMinutes} min/candle = ${numberOfCandles} candles`);

  return numberOfCandles;
}

function getLatestClosedCandleTime(timeframeMinutes: number): Date {
  const now = new Date();
  const currentMinutes = now.getUTCMinutes();
  const currentHours = now.getUTCHours();

  const totalMinutesFromMidnight = (currentHours * 60) + currentMinutes;
  const candlesSinceMidnight = Math.floor(totalMinutesFromMidnight / timeframeMinutes);
  const latestClosedCandleMinutes = candlesSinceMidnight * timeframeMinutes;

  const latestClosedCandle = new Date(now);
  latestClosedCandle.setUTCHours(Math.floor(latestClosedCandleMinutes / 60));
  latestClosedCandle.setUTCMinutes(latestClosedCandleMinutes % 60);
  latestClosedCandle.setUTCSeconds(0);
  latestClosedCandle.setUTCMilliseconds(0);

  return latestClosedCandle;
}

function wsMsg(op: string, id: number, body: string, query = ''): string {
  return `${op}\n${id}\n${query}\n${body}`;
}

function parseSockJs(message: string): any | null {
  try {
    if (message === 'h') {
      return { type: 'heartbeat' };
    } else if (message === 'o') {
      return { type: 'open' };
    } else if (message === 'c') {
      return { type: 'close' };
    } else if (message.startsWith('a[')) {
      const jsonStr = message.slice(2, -1);
      return JSON.parse(jsonStr);
    }
    return null;
  } catch (e) {
    console.error('❌ SockJs parse error:', e);
    return null;
  }
}

async function fetchHistoricalCandles(
  mdAccessToken: string,
  symbol: string,
  timeframe: number,
  daysBack: number
): Promise<CandleData[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://md-demo.tradovateapi.com/v1/websocket');
    const candles: CandleData[] = [];
    let authorized = false;
    let requestId = 1;
    let dataReceived = false;
    let heartbeatInterval: number | undefined;

    const numberOfCandles = calculateNumberOfCandles(daysBack, timeframe);
    const latestClosedCandle = getLatestClosedCandleTime(timeframe);

    console.log(`\n📅 Fetching ${symbol} - Current time: ${new Date().toISOString()}`);
    console.log(`📋 Latest closed ${timeframe}min candle: ${latestClosedCandle.toISOString()}`);
    console.log(`📊 Requesting ${numberOfCandles} candles, going back ${daysBack} days`);

    const timer = setTimeout(() => {
      console.log(`⏰ WebSocket timeout for ${symbol}`);
      try { ws.close(); } catch {}
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      resolve(candles); // Resolve gracefully on timeout instead of full rejection in loop
    }, 120000);

    ws.onopen = () => {
      console.log(`🔌 WebSocket connected for ${symbol}`);

      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send('[]');
          } catch (e) {
            console.error('❌ Heartbeat failed:', e);
          }
        }
      }, 2400) as unknown as number;

      const authMsg = wsMsg('authorize', requestId, mdAccessToken);
      console.log('🔐 Sending authorization...');
      ws.send(authMsg);
      requestId += 1;
    };

    ws.onmessage = (ev) => {
      const message = String(ev.data);
      const parsed = parseSockJs(message);

      if (!parsed) return;

      if (parsed.type === 'heartbeat') {
        try {
          ws.send('[]');
        } catch (e) {
          console.error('❌ Failed to respond to heartbeat:', e);
        }
        return;
      }

      if (parsed.type === 'open' || parsed.type === 'close') {
        return;
      }

      if (parsed.s === 200 && !authorized) {
        authorized = true;
        console.log(`✅ WebSocket AUTHORIZED for ${symbol}`);

        const chartRequest = {
          symbol,
          chartDescription: {
            underlyingType: 'MinuteBar',
            elementSize: timeframe,
            elementSizeUnit: 'UnderlyingUnits',
            withHistogram: false,
          },
          timeRange: {
            closestTimestamp: latestClosedCandle.toISOString().replace('.000Z', 'Z'),
            asMuchAsElements: numberOfCandles + 1,
          },
        };

        const chartMsg = wsMsg('md/getChart', requestId, JSON.stringify(chartRequest));
        console.log(`📊 Requesting ${numberOfCandles} candles of ${timeframe}min data...`);
        ws.send(chartMsg);
        return;
      }

      if (parsed.e === 'chart') {
        dataReceived = true;

        const chartData = parsed.d || {};
        for (const chart of (chartData.charts || [])) {
          if (chart.eoh) {
            console.log(`🏁 End of historical data for ${symbol}`);
            candles.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
            console.log(`✅ ${symbol} Final result: ${candles.length} candles`);
            clearTimeout(timer);
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            try { ws.close(); } catch {}
            resolve(candles);
            return;
          }

          const bars = chart.bars || [];
          if (bars.length > 0) {
            for (let i = 0; i < bars.length - 1; i++) {
              const bar = bars[i];
              if (bar.timestamp) {
                candles.push({
                  datetime: new Date(bar.timestamp).toISOString(),
                  open: Number(bar.open || 0),
                  high: Number(bar.high || 0),
                  low: Number(bar.low || 0),
                  close: Number(bar.close || 0),
                  volume: Number(bar.upVolume || 0) + Number(bar.downVolume || 0),
                  up_volume: Number(bar.upVolume || 0),
                  down_volume: Number(bar.downVolume || 0),
                  up_ticks: Number(bar.upTicks || 0),
                  down_ticks: Number(bar.downTicks || 0),
                });
              }
            }
          }
        }
      }

      if (parsed.e === 'shutdown') {
        const reasonCode = parsed.d?.reasonCode || 'Unknown';
        console.log(`🛑 Server shutdown: ${reasonCode}`);
        clearTimeout(timer);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        resolve(candles); 
      }
    };

    ws.onerror = (e) => {
      console.log(`❌ WebSocket error for ${symbol}:`, e);
      clearTimeout(timer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      resolve(candles);
    };

    ws.onclose = (event) => {
      console.log(`🔌 WebSocket closed for ${symbol}: ${event.code}`);
      clearTimeout(timer);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      resolve(candles);
    };
  });
}

async function storeCandles(supabase: any, timeframe: number, symbol: string, candles: CandleData[]) {
  let success = 0, errors = 0;
  console.log(`💾 Storing ${candles.length} candles for ${symbol} via upsert_market_candles...`);

  // Define batches to prevent supabase payload size issues on huge ranges
  const batchSize = 100;
  for (let i = 0; i < candles.length; i += batchSize) {
    const batch = candles.slice(i, i + batchSize);
    const rpcPromises = batch.map(candle => 
      supabase.rpc('upsert_market_candles', {
        p_symbol: symbol,
        p_timeframe: timeframe,
        p_candle_time: candle.datetime,
        p_open: candle.open,
        p_high: candle.high,
        p_low: candle.low,
        p_close: candle.close,
        p_volume: candle.volume,
        p_up_volume: candle.up_volume || 0,
        p_down_volume: candle.down_volume || 0,
        p_up_ticks: candle.up_ticks || 0,
        p_down_ticks: candle.down_ticks || 0,
      })
    );
    
    const results = await Promise.all(rpcPromises);
    for (const res of results) {
      if (res.error) {
        console.log('❌ Storage error:', res.error);
        errors++;
      } else {
        success++;
      }
    }
  }

  console.log(`💾 Storage complete for ${symbol}: ${success} success, ${errors} errors`);
  return { success, errors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { 
      timeframe, 
      days_back = 5,
      // Provide fallback symbols if none passed
      symbols = ['MNQH5', 'NQH5', 'ESH5', 'MESH5', 'GCH5']
    } = await req.json();

    if (!timeframe) {
      return new Response(
        JSON.stringify({ error: 'timeframe must be provided (e.g. 5, 15, 30, 60)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(symbols) || symbols.length === 0) {
        return new Response(
            JSON.stringify({ error: 'symbols must be a non-empty array of strings' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
    }

    console.log(`🚀 Starting ${timeframe}min candle fetch - ${days_back} days back`);
    console.log(`📋 Symbols to process: ${symbols.join(', ')}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('supabase_service_key_orca') ?? '' // Or whatever key env var you employ
    );

    const tvToken = await getTradovateTokenFromRedis();
    if (!tvToken) {
      throw new Error('No Tradovate TV token found in Redis');
    }

    const tokens = await renewTradovateTokens(tvToken);
    if (!tokens) {
      throw new Error('Failed to renew Tradovate tokens');
    }

    // Store renewed token back to Redis to prevent expiration locally
    await storeRenewedTokenInRedis(tokens.access_token);

    const fetchResults: any[] = [];

    // Loop through each symbol sequentially to not overload socket connections
    for (const symbol of symbols) {
      console.log(`\n-----------------------------------------`);
      console.log(`⚙️ Processing ${symbol}...`);
      const candles = await fetchHistoricalCandles(
        tokens.md_access_token,
        symbol,
        timeframe,
        days_back
      );

      if (candles.length === 0) {
        console.log(`⏭️ No candles received for ${symbol}. Skipping storage.`);
        fetchResults.push({ symbol, timeframe, days_back, status: 'no_data' });
        continue;
      }

      const result = await storeCandles(supabase, timeframe, symbol, candles);
      
      fetchResults.push({
        symbol,
        timeframe,
        days_back,
        candles_received: candles.length,
        candles_stored: result.success,
        errors: result.errors,
        date_range: {
          start: candles[0]?.datetime,
          end: candles[candles.length - 1]?.datetime,
        }
      });
      // Small sleep to ensure connections breathe between symbols
      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: fetchResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error('❌ Function error:', e);
    return new Response(
      JSON.stringify({
        success: false,
        error: String(e),
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
