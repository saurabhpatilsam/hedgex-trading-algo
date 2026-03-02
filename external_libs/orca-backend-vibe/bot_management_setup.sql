-- SQL Script to create bot management tables in Supabase
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. BOTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bots (
    id BIGSERIAL PRIMARY KEY,
    bot_id TEXT UNIQUE NOT NULL,
    custom_name TEXT,
    instrument TEXT NOT NULL,
    account_name TEXT NOT NULL,
    accounts_ids TEXT, -- JSON string of account IDs
    status TEXT NOT NULL DEFAULT 'initializing',
    
    -- Timestamps
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_health_check TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    
    -- Trading metrics
    total_pnl DECIMAL(20, 2) DEFAULT 0.00,
    open_positions INTEGER DEFAULT 0,
    closed_positions INTEGER DEFAULT 0,
    active_orders INTEGER DEFAULT 0,
    won_orders INTEGER DEFAULT 0,
    lost_orders INTEGER DEFAULT 0,
    
    -- Configuration
    config JSONB,
    
    -- Tracking
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_bot_status CHECK (status IN ('initializing', 'running', 'paused', 'stopped', 'error'))
);

-- Create indexes for bots table
CREATE INDEX IF NOT EXISTS idx_bots_bot_id ON bots(bot_id);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);
CREATE INDEX IF NOT EXISTS idx_bots_account_name ON bots(account_name);
CREATE INDEX IF NOT EXISTS idx_bots_instrument ON bots(instrument);
CREATE INDEX IF NOT EXISTS idx_bots_start_time ON bots(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_bots_custom_name ON bots(custom_name);

-- ============================================
-- 2. BOT_ACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bot_actions (
    id BIGSERIAL PRIMARY KEY,
    bot_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    performed_by TEXT NOT NULL DEFAULT 'system',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    
    -- Foreign key constraint
    CONSTRAINT fk_bot_actions_bot_id 
        FOREIGN KEY (bot_id) 
        REFERENCES bots(bot_id) 
        ON DELETE CASCADE
);

-- Create indexes for bot_actions table
CREATE INDEX IF NOT EXISTS idx_bot_actions_bot_id ON bot_actions(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_actions_action_type ON bot_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_bot_actions_timestamp ON bot_actions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bot_actions_performed_by ON bot_actions(performed_by);

-- ============================================
-- 3. BOT_METRICS TABLE (Optional for future use)
-- ============================================
CREATE TABLE IF NOT EXISTS bot_metrics (
    id BIGSERIAL PRIMARY KEY,
    bot_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Snapshot metrics
    total_pnl DECIMAL(20, 2) DEFAULT 0.00,
    open_positions INTEGER DEFAULT 0,
    closed_positions INTEGER DEFAULT 0,
    active_orders INTEGER DEFAULT 0,
    won_orders INTEGER DEFAULT 0,
    lost_orders INTEGER DEFAULT 0,
    
    -- Additional performance metrics
    win_rate DECIMAL(5, 2), -- Percentage (0.00 to 100.00)
    avg_win DECIMAL(20, 2),
    avg_loss DECIMAL(20, 2),
    sharpe_ratio DECIMAL(10, 4),
    max_drawdown DECIMAL(20, 2),
    
    -- Foreign key constraint
    CONSTRAINT fk_bot_metrics_bot_id 
        FOREIGN KEY (bot_id) 
        REFERENCES bots(bot_id) 
        ON DELETE CASCADE
);

-- Create indexes for bot_metrics table
CREATE INDEX IF NOT EXISTS idx_bot_metrics_bot_id ON bot_metrics(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_metrics_timestamp ON bot_metrics(timestamp DESC);

-- ============================================
-- 4. BOT_STATE TABLE (For Redis-like state tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS bot_state (
    bot_id TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    
    -- Foreign key constraint
    CONSTRAINT fk_bot_state_bot_id 
        FOREIGN KEY (bot_id) 
        REFERENCES bots(bot_id) 
        ON DELETE CASCADE
);

-- Create index for expiration queries
CREATE INDEX IF NOT EXISTS idx_bot_state_expires_at ON bot_state(expires_at);

-- ============================================
-- 5. FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_bots_updated_at 
    BEFORE UPDATE ON bots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean expired bot states
CREATE OR REPLACE FUNCTION clean_expired_bot_states()
RETURNS void AS $$
BEGIN
    DELETE FROM bot_state WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update bot state with automatic expiry extension
CREATE OR REPLACE FUNCTION upsert_bot_state(
    p_bot_id TEXT,
    p_state JSONB
)
RETURNS void AS $$
BEGIN
    INSERT INTO bot_state (bot_id, state, last_updated, expires_at)
    VALUES (p_bot_id, p_state, NOW(), NOW() + INTERVAL '24 hours')
    ON CONFLICT (bot_id) DO UPDATE
    SET state = p_state,
        last_updated = NOW(),
        expires_at = NOW() + INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================

-- Comments on bots table
COMMENT ON TABLE bots IS 'Stores metadata and last-known state for all trading bots';
COMMENT ON COLUMN bots.bot_id IS 'Unique identifier for the bot (e.g., orca_max_123_abc123)';
COMMENT ON COLUMN bots.custom_name IS 'User-friendly name for the bot (e.g., Max_TurboShark)';
COMMENT ON COLUMN bots.status IS 'Current bot status: initializing, running, paused, stopped, error';
COMMENT ON COLUMN bots.config IS 'Complete bot configuration as JSON';

-- Comments on bot_actions table
COMMENT ON TABLE bot_actions IS 'Audit trail of all bot actions and control events';
COMMENT ON COLUMN bot_actions.action_type IS 'Type of action: start, pause, stop, resume, clear_orders, clear_positions, etc.';
COMMENT ON COLUMN bot_actions.performed_by IS 'User or system that triggered the action';
COMMENT ON COLUMN bot_actions.details IS 'Additional metadata about the action';

-- Comments on bot_metrics table
COMMENT ON TABLE bot_metrics IS 'Historical snapshots of bot performance metrics';
COMMENT ON COLUMN bot_metrics.win_rate IS 'Percentage of winning trades (0.00 to 100.00)';
COMMENT ON COLUMN bot_metrics.sharpe_ratio IS 'Risk-adjusted return metric';

-- Comments on bot_state table
COMMENT ON TABLE bot_state IS 'Real-time bot state with automatic expiry (Redis-like functionality)';
COMMENT ON COLUMN bot_state.state IS 'Current bot state as JSON including metrics, actions, etc.';
COMMENT ON COLUMN bot_state.expires_at IS 'Automatic expiration time (24 hours from last update)';

-- ============================================
-- 7. ROW LEVEL SECURITY (Optional)
-- ============================================

-- Enable RLS if needed
-- ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bot_actions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bot_metrics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bot_state ENABLE ROW LEVEL SECURITY;

-- Example policy for authenticated users
-- CREATE POLICY "Enable read access for all authenticated users" 
--     ON bots FOR SELECT 
--     USING (auth.role() = 'authenticated');

-- CREATE POLICY "Enable write access for bot owners" 
--     ON bots FOR ALL 
--     USING (auth.uid()::text = created_by);

-- ============================================
-- 8. INITIAL DATA (Optional)
-- ============================================

-- You can add initial test data here if needed
-- INSERT INTO bots (bot_id, custom_name, instrument, account_name, status)
-- VALUES ('test_bot_001', 'TestBot', 'NQ', 'TEST_ACCOUNT', 'stopped');

-- ============================================
-- 9. MAINTENANCE QUERIES
-- ============================================

-- Query to clean up old stopped bots (run periodically)
-- DELETE FROM bots WHERE status = 'stopped' AND stopped_at < NOW() - INTERVAL '30 days';

-- Query to archive old actions (run periodically)
-- DELETE FROM bot_actions WHERE timestamp < NOW() - INTERVAL '90 days';

-- Query to aggregate old metrics (run periodically)
-- DELETE FROM bot_metrics WHERE timestamp < NOW() - INTERVAL '30 days';
