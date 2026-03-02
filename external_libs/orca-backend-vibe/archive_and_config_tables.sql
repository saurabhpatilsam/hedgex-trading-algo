-- SQL Script to create archived_bots and bot_configurations tables in Supabase
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. ARCHIVED_BOTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS archived_bots (
    id BIGSERIAL PRIMARY KEY,
    bot_id TEXT UNIQUE NOT NULL,
    bot_type TEXT NOT NULL DEFAULT 'orcamax',
    custom_name TEXT,
    instrument TEXT NOT NULL,
    account_name TEXT NOT NULL,
    accounts_ids TEXT,
    
    -- Final State
    final_status TEXT NOT NULL,
    final_pnl DECIMAL(20, 2) DEFAULT 0.00,
    total_runtime_seconds INTEGER,
    
    -- Archive Metadata
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_by TEXT,
    archive_reason TEXT, -- 'error', 'manual', 'stopped', 'performance'
    
    -- Original Bot Data
    start_time TIMESTAMPTZ,
    last_health_check TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    
    -- Trading Metrics (snapshot at archive time)
    closed_positions INTEGER DEFAULT 0,
    open_positions INTEGER DEFAULT 0,
    active_orders INTEGER DEFAULT 0,
    won_orders INTEGER DEFAULT 0,
    lost_orders INTEGER DEFAULT 0,
    win_rate DECIMAL(5, 2),
    profit_factor DECIMAL(10, 4),
    sharpe_ratio DECIMAL(10, 4),
    max_drawdown DECIMAL(20, 2),
    max_drawdown_percent DECIMAL(5, 2),
    avg_win DECIMAL(20, 2),
    avg_loss DECIMAL(20, 2),
    largest_win DECIMAL(20, 2),
    largest_loss DECIMAL(20, 2),
    avg_trade_duration_minutes INTEGER,
    total_commission DECIMAL(20, 2),
    net_pnl DECIMAL(20, 2),
    
    -- Configuration (preserved)
    config JSONB,
    
    -- Fibonacci & State Data
    fibonacci_levels JSONB,
    trading_window_active BOOLEAN DEFAULT FALSE,
    threshold_reached BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Original bot creation tracking
    created_by TEXT NOT NULL DEFAULT 'system',
    
    CONSTRAINT valid_archive_reason CHECK (archive_reason IN ('error', 'manual', 'stopped', 'performance', 'user_request'))
);

-- Create indexes for archived_bots table
CREATE INDEX IF NOT EXISTS idx_archived_bots_bot_id ON archived_bots(bot_id);
CREATE INDEX IF NOT EXISTS idx_archived_bots_archived_at ON archived_bots(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_archived_bots_bot_type ON archived_bots(bot_type);
CREATE INDEX IF NOT EXISTS idx_archived_bots_archive_reason ON archived_bots(archive_reason);
CREATE INDEX IF NOT EXISTS idx_archived_bots_account_name ON archived_bots(account_name);
CREATE INDEX IF NOT EXISTS idx_archived_bots_instrument ON archived_bots(instrument);
CREATE INDEX IF NOT EXISTS idx_archived_bots_archived_by ON archived_bots(archived_by);

-- Comments on archived_bots table
COMMENT ON TABLE archived_bots IS 'Archived bots with complete historical data';
COMMENT ON COLUMN archived_bots.bot_id IS 'Original unique identifier for the bot';
COMMENT ON COLUMN archived_bots.archive_reason IS 'Reason for archiving: error, manual, stopped, performance, user_request';
COMMENT ON COLUMN archived_bots.final_pnl IS 'Final P&L at time of archiving';
COMMENT ON COLUMN archived_bots.config IS 'Complete bot configuration preserved as JSON';

-- ============================================
-- 2. BOT_CONFIGURATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bot_configurations (
    id BIGSERIAL PRIMARY KEY,
    config_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    bot_type TEXT NOT NULL DEFAULT 'orcamax',
    
    -- Configuration Data
    config JSONB NOT NULL,
    
    -- Metadata
    tags TEXT[],
    created_by TEXT NOT NULL,
    is_template BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'active', -- 'active', 'archived', 'draft'
    
    -- Usage Statistics
    times_used INTEGER DEFAULT 0,
    last_used TIMESTAMPTZ,
    
    -- Performance Metrics (aggregated from bot runs)
    success_rate DECIMAL(5, 2),
    total_pnl DECIMAL(20, 2),
    performance_metrics JSONB, -- Additional detailed metrics
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_config_status CHECK (status IN ('active', 'archived', 'draft')),
    CONSTRAINT valid_bot_type CHECK (bot_type IN ('orcamax', 'bonucci', 'fibonacci', 'custom'))
);

-- Create indexes for bot_configurations table
CREATE INDEX IF NOT EXISTS idx_bot_configurations_config_id ON bot_configurations(config_id);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_bot_type ON bot_configurations(bot_type);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_created_by ON bot_configurations(created_by);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_status ON bot_configurations(status);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_is_template ON bot_configurations(is_template);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_is_favorite ON bot_configurations(is_favorite);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_tags ON bot_configurations USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_created_at ON bot_configurations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_configurations_times_used ON bot_configurations(times_used DESC);

-- Comments on bot_configurations table
COMMENT ON TABLE bot_configurations IS 'Saved bot configuration templates for reuse';
COMMENT ON COLUMN bot_configurations.config_id IS 'Unique identifier for the configuration';
COMMENT ON COLUMN bot_configurations.config IS 'Complete bot configuration as JSON';
COMMENT ON COLUMN bot_configurations.is_template IS 'Whether this is a shareable template';
COMMENT ON COLUMN bot_configurations.tags IS 'Searchable tags (e.g., scalping, momentum)';
COMMENT ON COLUMN bot_configurations.performance_metrics IS 'Aggregated performance data from all bot runs using this config';

-- ============================================
-- 3. BOT_AUDIT_LOG TABLE (for archive/unarchive/delete actions)
-- ============================================
CREATE TABLE IF NOT EXISTS bot_audit_log (
    id BIGSERIAL PRIMARY KEY,
    bot_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'archive', 'unarchive', 'delete', 'restart'
    performed_by TEXT NOT NULL,
    reason TEXT,
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_audit_action CHECK (action IN ('archive', 'unarchive', 'delete', 'restart', 'create', 'update'))
);

-- Create indexes for bot_audit_log table
CREATE INDEX IF NOT EXISTS idx_bot_audit_log_bot_id ON bot_audit_log(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_audit_log_action ON bot_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_bot_audit_log_timestamp ON bot_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bot_audit_log_performed_by ON bot_audit_log(performed_by);

-- Comments on bot_audit_log table
COMMENT ON TABLE bot_audit_log IS 'Audit trail for critical bot operations';
COMMENT ON COLUMN bot_audit_log.action IS 'Type of operation: archive, unarchive, delete, restart, create, update';

-- ============================================
-- 4. TRIGGERS
-- ============================================

-- Trigger to automatically update updated_at for archived_bots
CREATE TRIGGER update_archived_bots_updated_at 
    BEFORE UPDATE ON archived_bots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update updated_at for bot_configurations
CREATE TRIGGER update_bot_configurations_updated_at 
    BEFORE UPDATE ON bot_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to archive a bot
CREATE OR REPLACE FUNCTION archive_bot(
    p_bot_id TEXT,
    p_archived_by TEXT,
    p_archive_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_bot_record RECORD;
BEGIN
    -- Get bot data from bots table
    SELECT * INTO v_bot_record FROM bots WHERE bot_id = p_bot_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bot % not found', p_bot_id;
    END IF;
    
    -- Calculate runtime
    DECLARE
        v_runtime_seconds INTEGER;
    BEGIN
        v_runtime_seconds := EXTRACT(EPOCH FROM (COALESCE(v_bot_record.stopped_at, NOW()) - v_bot_record.start_time))::INTEGER;
    END;
    
    -- Insert into archived_bots
    INSERT INTO archived_bots (
        bot_id, bot_type, custom_name, instrument, account_name, accounts_ids,
        final_status, final_pnl, total_runtime_seconds,
        archived_by, archive_reason,
        start_time, last_health_check, stopped_at,
        closed_positions, open_positions, active_orders, won_orders, lost_orders,
        config, created_by
    ) VALUES (
        v_bot_record.bot_id, 
        'orcamax', -- default, can be enhanced
        v_bot_record.custom_name,
        v_bot_record.instrument,
        v_bot_record.account_name,
        v_bot_record.accounts_ids,
        v_bot_record.status,
        v_bot_record.total_pnl,
        EXTRACT(EPOCH FROM (COALESCE(v_bot_record.stopped_at, NOW()) - v_bot_record.start_time))::INTEGER,
        p_archived_by,
        p_archive_reason,
        v_bot_record.start_time,
        v_bot_record.last_health_check,
        v_bot_record.stopped_at,
        v_bot_record.closed_positions,
        v_bot_record.open_positions,
        v_bot_record.active_orders,
        v_bot_record.won_orders,
        v_bot_record.lost_orders,
        v_bot_record.config,
        v_bot_record.created_by
    )
    ON CONFLICT (bot_id) DO UPDATE
    SET archived_at = NOW(),
        archived_by = p_archived_by,
        archive_reason = p_archive_reason,
        updated_at = NOW();
    
    -- Log to audit log
    INSERT INTO bot_audit_log (bot_id, action, performed_by, reason, metadata)
    VALUES (p_bot_id, 'archive', p_archived_by, p_archive_reason, jsonb_build_object('final_pnl', v_bot_record.total_pnl));
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. MAINTENANCE QUERIES
-- ============================================

-- Query to clean up old archived bots (run periodically)
-- DELETE FROM archived_bots WHERE archived_at < NOW() - INTERVAL '1 year';

-- Query to clean up old audit logs (run periodically)
-- DELETE FROM bot_audit_log WHERE timestamp < NOW() - INTERVAL '1 year';
