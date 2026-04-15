-- 1. Create the unified market_candles table
CREATE TABLE IF NOT EXISTS public.market_candles (
    id UUID DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    timeframe INT NOT NULL, -- e.g., 1, 5, 15, 30, 60, 240
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
    PRIMARY KEY (symbol, timeframe, datetime)
);

-- Note: We use composite Primary Key on (symbol, timeframe, datetime) to guarantee uniquely identified candles
-- and completely avoid duplication upon continuous cron job fetches.
-- The `id` UUID col is optional since we have a solid compound PK, but it can be useful for ORMs like Django.
-- In Supabase, usually table structure works fine without a single-column PK if configured carefully, 
-- but we made the compound key the actual primary key so `upsert` works seamlessly below.

-- Enable Row Level Security (RLS) but allow all for authenticated clients for now
ALTER TABLE public.market_candles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read/write on market_candles" ON public.market_candles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access on market_candles" ON public.market_candles FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. Create the unified RPC function to upsert candles robustly
-- This replaces the need for 6 separate insert_nq_candles_* functions.
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


-- 3. Optional: Example of Pg_Cron scheduling (if running natively via Supabase Postgres)
-- Note: Replace '<YOUR_EDGE_FUNCTION_URL>' and '<SUPABASE_ANON_KEY>' to use this.
-- Alternatively, configure the edge function via its own config.toml

/*
SELECT cron.schedule(
  'fetch-candles-every-5-min',
  '*/5 * * * *',
  $$
    select net.http_post(
      url:='https://<project-ref>.supabase.co/functions/v1/fetch-candles',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SUPABASE_ANON_KEY>"}'::jsonb,
      body:='{"timeframe": 5, "days_back": 1, "symbols": ["MNQH5", "NQH5", "ESH5", "MESH5", "GCH5"]}'::jsonb,
      timeout_milliseconds:=60000
    );
  $$
);

SELECT cron.schedule(
  'fetch-candles-every-30-min',
  '0,30 * * * *',
  $$
    select net.http_post(
      url:='https://<project-ref>.supabase.co/functions/v1/fetch-candles',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SUPABASE_ANON_KEY>"}'::jsonb,
      body:='{"timeframe": 30, "days_back": 2, "symbols": ["MNQH5", "NQH5", "ESH5", "MESH5", "GCH5"]}'::jsonb,
      timeout_milliseconds:=60000
    );
  $$
);
*/
