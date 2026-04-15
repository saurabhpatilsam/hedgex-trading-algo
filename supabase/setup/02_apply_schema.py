#!/usr/bin/env python3
"""
Apply market_candles schema to self-hosted Supabase at supabase.magicreview.ai.
Uses the /pg/query endpoint with service_role key (same pattern as supabase_client.py).

Run this once to set up the database:
    python supabase/setup/02_apply_schema.py
"""
import json
import ssl
import sys
import urllib.request

SUPABASE_URL = 'https://supabase.magicreview.ai'
SERVICE_ROLE_KEY = (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
    'eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzI1NDQxMjMsImV4cCI6MTkzMDIyNDEyM30.'
    'DC_yU-aef-V8348LsXGfByvIRee3fPKFajEL4VQaaHE'
)

_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE


def run_sql(query: str, description: str = "") -> any:
    """Execute raw SQL via the pg/query endpoint."""
    print(f"\n{'='*60}")
    print(f"▶ {description or 'Running SQL...'}")
    url = f'{SUPABASE_URL}/pg/query'
    body = json.dumps({'query': query}).encode('utf-8')
    req = urllib.request.Request(url, method='POST', data=body, headers={
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
    })
    try:
        resp = urllib.request.urlopen(req, context=_ssl_ctx, timeout=30)
        result = json.loads(resp.read().decode('utf-8'))
        print(f"✅ Success: {result}")
        return result
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        print(f"❌ HTTP Error {e.code}: {body}")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None


def check_rest_api():
    """Verify basic REST API connectivity."""
    print("\n🔍 Checking Supabase connectivity...")
    url = f'{SUPABASE_URL}/rest/v1/'
    req = urllib.request.Request(url, headers={
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    })
    try:
        resp = urllib.request.urlopen(req, context=_ssl_ctx, timeout=10)
        print(f"✅ Supabase REST API reachable (status {resp.status})")
        return True
    except Exception as e:
        print(f"❌ Cannot reach Supabase: {e}")
        return False


# ─── SQL Statements ────────────────────────────────────────────────────────────

CREATE_EXTENSION = "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS public.market_candles (
    id UUID DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    timeframe INT NOT NULL,
    datetime TIMESTAMPTZ NOT NULL,
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume NUMERIC DEFAULT 0,
    up_volume NUMERIC DEFAULT 0,
    down_volume NUMERIC DEFAULT 0,
    up_ticks NUMERIC DEFAULT 0,
    down_ticks NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT market_candles_pkey PRIMARY KEY (symbol, timeframe, datetime)
);
"""

CREATE_INDEX_SYMBOL = """
CREATE INDEX IF NOT EXISTS idx_market_candles_symbol
    ON public.market_candles(symbol, timeframe, datetime DESC);
"""

CREATE_INDEX_DATETIME = """
CREATE INDEX IF NOT EXISTS idx_market_candles_datetime
    ON public.market_candles(datetime DESC);
"""

ENABLE_RLS = "ALTER TABLE public.market_candles ENABLE ROW LEVEL SECURITY;"

CREATE_POLICY_SERVICE = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'market_candles'
        AND policyname = 'service_role_full_access'
    ) THEN
        CREATE POLICY service_role_full_access ON public.market_candles
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
"""

CREATE_POLICY_ANON = """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'market_candles'
        AND policyname = 'anon_read_access'
    ) THEN
        CREATE POLICY anon_read_access ON public.market_candles
            FOR SELECT TO anon USING (true);
    END IF;
END $$;
"""

CREATE_RPC = """
CREATE OR REPLACE FUNCTION public.upsert_market_candles(
    p_symbol VARCHAR,
    p_timeframe INT,
    p_candle_time TIMESTAMPTZ,
    p_open NUMERIC,
    p_high NUMERIC,
    p_low NUMERIC,
    p_close NUMERIC,
    p_volume NUMERIC,
    p_up_volume NUMERIC,
    p_down_volume NUMERIC,
    p_up_ticks NUMERIC,
    p_down_ticks NUMERIC
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.market_candles (
        symbol, timeframe, datetime, open, high, low, close,
        volume, up_volume, down_volume, up_ticks, down_ticks
    )
    VALUES (
        p_symbol, p_timeframe, p_candle_time, p_open, p_high, p_low, p_close,
        p_volume, p_up_volume, p_down_volume, p_up_ticks, p_down_ticks
    )
    ON CONFLICT (symbol, timeframe, datetime)
    DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        up_volume = EXCLUDED.up_volume,
        down_volume = EXCLUDED.down_volume,
        up_ticks = EXCLUDED.up_ticks,
        down_ticks = EXCLUDED.down_ticks;
END;
$$;
"""

# Grant execute permission on the function
GRANT_RPC = """
GRANT EXECUTE ON FUNCTION public.upsert_market_candles TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_market_candles TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_market_candles TO authenticated;
"""

VERIFY_TABLE = """
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_name = 'market_candles' AND table_schema = 'public') as col_count
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'market_candles';
"""

VERIFY_FUNCTION = """
SELECT routine_name, routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name = 'upsert_market_candles';
"""


def main():
    print("🚀 Applying market_candles schema to Supabase at supabase.magicreview.ai")
    print("=" * 60)

    # Step 0: Verify connectivity
    if not check_rest_api():
        print("\n❌ Cannot connect to Supabase. Aborting.")
        sys.exit(1)

    # Step 1: Extensions
    run_sql(CREATE_EXTENSION, "Creating uuid-ossp extension")

    # Step 2: Create table
    run_sql(CREATE_TABLE, "Creating market_candles table")

    # Step 3: Indexes
    run_sql(CREATE_INDEX_SYMBOL, "Creating symbol/timeframe/datetime index")
    run_sql(CREATE_INDEX_DATETIME, "Creating datetime index")

    # Step 4: RLS
    run_sql(ENABLE_RLS, "Enabling Row Level Security")
    run_sql(CREATE_POLICY_SERVICE, "Creating service_role policy")
    run_sql(CREATE_POLICY_ANON, "Creating anon read policy")

    # Step 5: Create RPC function
    run_sql(CREATE_RPC, "Creating upsert_market_candles RPC function")
    run_sql(GRANT_RPC, "Granting execute permissions on RPC")

    # Step 6: Verify
    print("\n" + "="*60)
    print("🔍 VERIFICATION")
    run_sql(VERIFY_TABLE, "Verifying table exists")
    run_sql(VERIFY_FUNCTION, "Verifying RPC function exists")

    print("\n" + "="*60)
    print("✅ Schema deployment complete!")
    print("   Table: public.market_candles")
    print("   RPC:   public.upsert_market_candles(...)")
    print("   Next:  Run the historical candle fetcher:")
    print("   python backend/services/historical_candle_fetcher.py --timeframe 5 --days 2")


if __name__ == '__main__':
    main()
