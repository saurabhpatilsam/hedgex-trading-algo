#!/usr/bin/env python3
"""
HedgeX Historical Candle Fetcher — Tradovate WebSocket → Supabase market_candles

Fetches OHLCV candlestick data for all active instruments from Tradovate
and stores them in the unified market_candles table on the self-hosted Supabase.

Usage:
    # Fetch 5-minute candles for the last 2 days (all symbols)
    python backend/services/historical_candle_fetcher.py --timeframe 5 --days 2

    # Fetch 30-minute candles for a specific symbol
    python backend/services/historical_candle_fetcher.py --timeframe 30 --days 5 --symbol MNQH5

    # Run as cron: fetch last N days worth of candles for given timeframe
    */5  * * * * cd /path/to/project && python backend/services/historical_candle_fetcher.py --timeframe 5  --days 1
    0,30 * * * * cd /path/to/project && python backend/services/historical_candle_fetcher.py --timeframe 30 --days 2
    0    * * * * cd /path/to/project && python backend/services/historical_candle_fetcher.py --timeframe 60 --days 3

Env vars (or set directly below):
    REDIS_HOST      — Redis hostname  (default: redismanager.redis.cache.windows.net)
    REDIS_PORT      — Redis port      (default: 6380)
    REDIS_PASSWORD  — Redis password
    SUPABASE_URL    — Supabase URL    (default: https://supabase.magicreview.ai)
    SUPABASE_KEY    — Service role key
"""
import argparse
import asyncio
import json
import logging
import math
import os
import ssl
import sys
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | candle-fetcher | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("candle-fetcher")

# ── Configuration ──────────────────────────────────────────────────────────────
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://supabase.magicreview.ai')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
    'eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzI1NDQxMjMsImV4cCI6MTkzMDIyNDEyM30.'
    'DC_yU-aef-V8348LsXGfByvIRee3fPKFajEL4VQaaHE'
))

TRADOVATE_DEMO_REST = 'https://demo.tradovateapi.com/v1'
TRADOVATE_MD_WS     = 'wss://md-demo.tradovateapi.com/v1/websocket'

# Ordered list — tries each account key until it finds a valid token
REDIS_ACCOUNT_KEYS = [
    'PAAPEX2666680000001',
    'APEX_266668',
    'PAAPEX2666680000003',
    'PAAPEX2666680000002',
    'PAAPEX2666680000004',
    'PAAPEX2666680000005',
]

# Default symbols to fetch (active contracts — update monthly on rollover)
DEFAULT_SYMBOLS = ['MNQH5', 'NQH5', 'ESH5', 'MESH5', 'GCH5']

# Supported timeframes in minutes
VALID_TIMEFRAMES = [1, 5, 15, 30, 60, 240]

# SSL context (same as existing supabase_client.py — skip verify for self-hosted)
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE


# ── Redis Token Retrieval ──────────────────────────────────────────────────────

def get_token_from_redis() -> Optional[str]:
    """Retrieve active Tradovate API token from Azure Redis cache."""
    try:
        import redis as redis_lib
        r = redis_lib.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=10,
        )
        r.ping()
        log.info("✅ Redis connected")

        for account in REDIS_ACCOUNT_KEYS:
            token = r.get(f'token:{account}')
            if token:
                log.info(f"✅ Found token for account: {account}")
                r.close()
                return token

        r.close()
        log.warning("⚠️ No active tokens found in Redis")
        return None

    except ImportError:
        log.error("❌ redis-py not installed. Run: pip install redis")
        return None
    except Exception as e:
        log.error(f"❌ Redis error: {e}")
        return None


def store_token_to_redis(access_token: str) -> None:
    """Store renewed token back to all account keys in Redis."""
    try:
        import redis as redis_lib
        r = redis_lib.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=10,
        )
        ttl = 3600  # 1 hour
        for account in REDIS_ACCOUNT_KEYS:
            r.setex(f'token:{account}', ttl, access_token)
        r.close()
        log.info(f"✅ Updated {len(REDIS_ACCOUNT_KEYS)} token keys in Redis (TTL={ttl}s)")
    except Exception as e:
        log.warning(f"⚠️ Could not store token in Redis: {e}")


# ── Tradovate Token Renewal ────────────────────────────────────────────────────

def renew_tradovate_tokens(access_token: str) -> Optional[Dict]:
    """Renew Tradovate access + MD access tokens."""
    try:
        url = f"{TRADOVATE_DEMO_REST}/auth/renewaccesstoken"
        req = urllib.request.Request(url, method='GET', headers={
            'Accept': 'application/json',
            'Authorization': f'Bearer {access_token}',
        })
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode())

        if not data.get('accessToken') or not data.get('mdAccessToken'):
            log.error(f"❌ Token renewal missing fields: {list(data.keys())}")
            return None

        log.info("✅ Tradovate tokens renewed successfully")
        return {
            'access_token': data['accessToken'],
            'md_access_token': data['mdAccessToken'],
        }
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        log.error(f"❌ Token renewal HTTP {e.code}: {body[:200]}")
        return None
    except Exception as e:
        log.error(f"❌ Token renewal error: {e}")
        return None


# ── Candle Calculation Helpers ─────────────────────────────────────────────────

def calculate_num_candles(days_back: int, timeframe_min: int) -> int:
    """Calculate number of candles needed to cover days_back."""
    total_minutes = days_back * 24 * 60
    n = math.ceil(total_minutes / timeframe_min)
    log.info(f"📋 {days_back} days × 1440 min/day ÷ {timeframe_min} min/candle = {n} candles")
    return n


def get_latest_closed_candle_time(timeframe_min: int) -> datetime:
    """Get the timestamp of the most recently CLOSED candle."""
    now = datetime.now(timezone.utc)
    total_minutes = now.hour * 60 + now.minute
    floored = (total_minutes // timeframe_min) * timeframe_min
    return now.replace(
        hour=floored // 60,
        minute=floored % 60,
        second=0,
        microsecond=0
    )


# ── Tradovate WebSocket Fetcher ────────────────────────────────────────────────

def fetch_candles_websocket(md_token: str, symbol: str, timeframe_min: int, days_back: int) -> List[Dict]:
    """
    Fetch historical OHLCV candlestick data via Tradovate Market Data WebSocket.

    Uses the SockJS protocol on wss://md-demo.tradovateapi.com/v1/websocket.
    Returns a list of candle dicts sorted by datetime ascending.
    """
    import websocket as ws_lib

    num_candles = calculate_num_candles(days_back, timeframe_min)
    latest_closed = get_latest_closed_candle_time(timeframe_min)
    candles: List[Dict] = []

    log.info(f"\n{'─'*55}")
    log.info(f"📊 Fetching {symbol} | {timeframe_min}min | {days_back} days ({num_candles} candles)")
    log.info(f"📅 Latest closed candle: {latest_closed.isoformat()}")

    result_event = threading.Event()
    error_holder = [None]

    def ws_msg(op: str, req_id: int, body: str) -> str:
        return f"{op}\n{req_id}\n\n{body}"

    def on_open(ws):
        log.info(f"🔌 WS connected for {symbol}, sending auth...")
        ws.send(ws_msg('authorize', 1, md_token))

    def on_message(ws, message):
        nonlocal candles
        raw = str(message).strip()

        # SockJS open/heartbeat
        if raw == 'o':
            return
        if raw == 'h':
            ws.send('[]')  # respond to heartbeat
            return
        if raw in ('', '[]') or raw.startswith('c'):
            return

        # Parse SockJS array frame: a["..."]
        try:
            if raw.startswith('a['):
                payload_str = raw[2:-1]
                parsed = json.loads(payload_str)
            elif raw.startswith('{'):
                parsed = raw
            else:
                return
        except Exception:
            return

        if not isinstance(parsed, (dict, str)):
            return

        # Handle string-encoded JSON inside the array
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except Exception:
                return

        # Authorization response
        if parsed.get('s') == 200 and 'i' not in parsed:
            # This is sometimes the auth response
            pass

        status = parsed.get('s')
        req_id_resp = parsed.get('i', 0)

        # Auth confirmed (request id=1)
        if req_id_resp == 1 and status == 200:
            log.info(f"✅ Authorized for {symbol}, requesting chart data...")
            chart_req = {
                'symbol': symbol,
                'chartDescription': {
                    'underlyingType': 'MinuteBar',
                    'elementSize': timeframe_min,
                    'elementSizeUnit': 'UnderlyingUnits',
                    'withHistogram': False,
                },
                'timeRange': {
                    'closestTimestamp': latest_closed.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'asMuchAsElements': num_candles + 1,
                },
            }
            ws.send(ws_msg('md/getChart', 2, json.dumps(chart_req)))
            return

        # Chart data event
        if parsed.get('e') == 'chart':
            chart_data = parsed.get('d', {})
            for chart in chart_data.get('charts', []):
                # End of historical data marker
                if chart.get('eoh'):
                    log.info(f"🏁 EOH received for {symbol} — {len(candles)} candles collected")
                    candles.sort(key=lambda c: c['datetime'])
                    ws.close()
                    result_event.set()
                    return

                bars = chart.get('bars', [])
                if bars:
                    log.info(f"📦 Received {len(bars)} bars for {symbol}")
                    # Skip the last bar (it may be the currently-forming candle)
                    for bar in bars[:-1]:
                        ts = bar.get('timestamp')
                        if not ts:
                            continue
                        try:
                            dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc) if isinstance(ts, (int, float)) else datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
                        except Exception:
                            continue

                        up_vol = float(bar.get('upVolume', 0) or 0)
                        dn_vol = float(bar.get('downVolume', 0) or 0)
                        candles.append({
                            'datetime': dt.isoformat(),
                            'open':        float(bar.get('open', 0) or 0),
                            'high':        float(bar.get('high', 0) or 0),
                            'low':         float(bar.get('low', 0) or 0),
                            'close':       float(bar.get('close', 0) or 0),
                            'volume':      up_vol + dn_vol,
                            'up_volume':   up_vol,
                            'down_volume': dn_vol,
                            'up_ticks':    float(bar.get('upTicks', 0) or 0),
                            'down_ticks':  float(bar.get('downTicks', 0) or 0),
                        })
            return

        # Server shutdown
        if parsed.get('e') == 'shutdown':
            reason = parsed.get('d', {}).get('reasonCode', 'Unknown')
            log.warning(f"🛑 Server shutdown for {symbol}: {reason}")
            result_event.set()
            return

    def on_error(ws, error):
        log.error(f"❌ WS error for {symbol}: {error}")
        error_holder[0] = str(error)
        result_event.set()

    def on_close(ws, code, msg):
        log.info(f"🔌 WS closed for {symbol}: {code} {msg}")
        result_event.set()

    # Heartbeat thread
    def heartbeat(ws):
        while not result_event.is_set():
            time.sleep(2.4)
            try:
                if ws.sock and ws.sock.connected:
                    ws.send('[]')
            except Exception:
                pass

    try:
        ws_app = ws_lib.WebSocketApp(
            TRADOVATE_MD_WS,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )

        hb_thread = threading.Thread(target=heartbeat, args=(ws_app,), daemon=True)

        ws_thread = threading.Thread(
            target=lambda: ws_app.run_forever(ping_interval=20, ping_timeout=10),
            daemon=True,
        )

        ws_thread.start()
        hb_thread.start()

        # Wait up to 120 seconds for data
        completed = result_event.wait(timeout=120)
        if not completed:
            log.warning(f"⏰ Timeout fetching {symbol} — got {len(candles)} candles so far")
            try:
                ws_app.close()
            except Exception:
                pass

    except Exception as e:
        log.error(f"❌ WebSocket setup error for {symbol}: {e}")

    log.info(f"✅ {symbol}: {len(candles)} candles fetched")
    return candles


# ── Supabase Writer ────────────────────────────────────────────────────────────

def store_candles_to_supabase(symbol: str, timeframe_min: int, candles: List[Dict]) -> Dict:
    """Write candles to Supabase market_candles table via upsert_market_candles RPC."""
    if not candles:
        return {'success': 0, 'errors': 0}

    log.info(f"💾 Storing {len(candles)} candles for {symbol} (timeframe={timeframe_min}min)...")

    success = 0
    errors = 0
    batch_size = 50  # Process in small batches to avoid timeouts

    for i in range(0, len(candles), batch_size):
        batch = candles[i:i + batch_size]

        for candle in batch:
            try:
                payload = {
                    'p_symbol':      symbol,
                    'p_timeframe':   timeframe_min,
                    'p_candle_time': candle['datetime'],
                    'p_open':        candle['open'],
                    'p_high':        candle['high'],
                    'p_low':         candle['low'],
                    'p_close':       candle['close'],
                    'p_volume':      candle['volume'],
                    'p_up_volume':   candle.get('up_volume', 0),
                    'p_down_volume': candle.get('down_volume', 0),
                    'p_up_ticks':    candle.get('up_ticks', 0),
                    'p_down_ticks':  candle.get('down_ticks', 0),
                }

                url = f'{SUPABASE_URL}/rest/v1/rpc/upsert_market_candles'
                body = json.dumps(payload).encode('utf-8')
                req = urllib.request.Request(url, method='POST', data=body, headers={
                    'apikey': SUPABASE_KEY,
                    'Authorization': f'Bearer {SUPABASE_KEY}',
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                })
                urllib.request.urlopen(req, context=_ssl_ctx, timeout=30)
                success += 1

            except urllib.error.HTTPError as e:
                body = e.read().decode()
                log.warning(f"⚠️ Supabase error for candle {candle.get('datetime')}: {e.code} {body[:100]}")
                errors += 1
            except Exception as e:
                log.warning(f"⚠️ Store error: {e}")
                errors += 1

        log.info(f"   Batch {i//batch_size + 1}: {min(i+batch_size, len(candles))}/{len(candles)} processed")

    log.info(f"💾 {symbol} stored: ✅{success} ❌{errors}")
    return {'success': success, 'errors': errors}


# ── Main Execution ─────────────────────────────────────────────────────────────

def run_fetch(timeframe_min: int, days_back: int, symbols: List[str]):
    """Main fetch loop — gets token, then fetches all symbols."""
    log.info("=" * 55)
    log.info(f"🚀 Candle Fetcher Starting")
    log.info(f"   Timeframe  : {timeframe_min} minutes")
    log.info(f"   Days back  : {days_back}")
    log.info(f"   Symbols    : {symbols}")
    log.info("=" * 55)

    # 1. Get token from Redis
    raw_token = get_token_from_redis()
    if not raw_token:
        log.error("❌ No token available in Redis. Aborting.")
        sys.exit(1)

    # 2. Renew tokens
    tokens = renew_tradovate_tokens(raw_token)
    if not tokens:
        log.error("❌ Failed to renew Tradovate tokens. Aborting.")
        sys.exit(1)

    # 3. Store renewed token back to Redis
    store_token_to_redis(tokens['access_token'])

    md_access_token = tokens['md_access_token']
    overall_results = []

    # 4. Fetch each symbol sequentially (avoid overwhelming the WS server)
    for symbol in symbols:
        try:
            candles = fetch_candles_websocket(md_access_token, symbol, timeframe_min, days_back)

            if not candles:
                log.warning(f"⚠️ No candles returned for {symbol}")
                overall_results.append({'symbol': symbol, 'status': 'no_data'})
                continue

            result = store_candles_to_supabase(symbol, timeframe_min, candles)
            overall_results.append({
                'symbol':   symbol,
                'candles':  len(candles),
                'stored':   result['success'],
                'errors':   result['errors'],
                'start':    candles[0]['datetime'] if candles else None,
                'end':      candles[-1]['datetime'] if candles else None,
            })

        except Exception as e:
            log.error(f"❌ Failed to process {symbol}: {e}", exc_info=True)
            overall_results.append({'symbol': symbol, 'status': 'error', 'error': str(e)})

        # Wait 2 seconds between symbols to be polite to the API
        time.sleep(2)

    # 5. Print summary
    log.info("\n" + "=" * 55)
    log.info("📊 FETCH SUMMARY")
    log.info("=" * 55)
    total_stored = 0
    for r in overall_results:
        sym = r.get('symbol', '?')
        if 'candles' in r:
            stored = r.get('stored', 0)
            total_stored += stored
            log.info(f"  {sym:10s} | {r['candles']:5d} candles | {stored:5d} stored | {r.get('errors', 0)} errors")
            if r.get('start'):
                log.info(f"             | {r['start'][:10]} → {r['end'][:10]}")
        else:
            log.info(f"  {sym:10s} | {r.get('status', 'unknown')} | {r.get('error', '')}")

    log.info(f"\n✅ Total candles stored: {total_stored}")
    log.info("=" * 55)

    return overall_results


def main():
    parser = argparse.ArgumentParser(
        description='Fetch historical candlestick data from Tradovate and store in Supabase'
    )
    parser.add_argument(
        '--timeframe', '-t', type=int, required=True,
        choices=VALID_TIMEFRAMES,
        help=f'Candle timeframe in minutes. One of: {VALID_TIMEFRAMES}'
    )
    parser.add_argument(
        '--days', '-d', type=int, default=2,
        help='Number of days of history to fetch (default: 2)'
    )
    parser.add_argument(
        '--symbol', '-s', type=str, default=None,
        help=f'Single symbol to fetch (default: all {DEFAULT_SYMBOLS})'
    )
    args = parser.parse_args()

    symbols = [args.symbol.upper()] if args.symbol else DEFAULT_SYMBOLS

    run_fetch(
        timeframe_min=args.timeframe,
        days_back=args.days,
        symbols=symbols,
    )


if __name__ == '__main__':
    main()
