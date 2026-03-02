-- Complete Authentication System Migration
-- Run this in Supabase SQL Editor to set up all auth tables

-- 1. Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ
);

-- 2. Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ
);

-- 3. Create indexes for password reset tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- 4. Create indexes for email verification tokens
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- 5. Add updated_at column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 6. Add comments for documentation
COMMENT ON TABLE password_reset_tokens IS 'Stores password reset tokens with expiration (1 hour)';
COMMENT ON COLUMN password_reset_tokens.token_hash IS 'SHA256 hash of the reset token';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Token expiration time (1 hour from creation)';
COMMENT ON COLUMN password_reset_tokens.used IS 'Whether the token has been used';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'When the token was used';

COMMENT ON TABLE email_verification_tokens IS 'Stores email verification tokens with expiration (24 hours)';
COMMENT ON COLUMN email_verification_tokens.token_hash IS 'SHA256 hash of the verification token';
COMMENT ON COLUMN email_verification_tokens.expires_at IS 'Token expiration time (24 hours from creation)';
COMMENT ON COLUMN email_verification_tokens.used IS 'Whether the token has been used';
COMMENT ON COLUMN email_verification_tokens.used_at IS 'When the token was used to verify email';

-- 7. Create function to automatically delete expired tokens (optional cleanup)
CREATE OR REPLACE FUNCTION delete_expired_auth_tokens()
RETURNS void AS $$
BEGIN
    -- Delete password reset tokens older than 7 days
    DELETE FROM password_reset_tokens 
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    -- Delete email verification tokens older than 30 days
    DELETE FROM email_verification_tokens 
    WHERE expires_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 8. Verify tables were created
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_tokens') AND
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_verification_tokens') THEN
        RAISE NOTICE '✅ All authentication tables created successfully!';
    ELSE
        RAISE EXCEPTION '❌ Failed to create some tables. Please check the migration.';
    END IF;
END $$;

-- 9. Display summary
SELECT 
    'password_reset_tokens' as table_name,
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE used = false AND expires_at > NOW()) as active_tokens
FROM password_reset_tokens
UNION ALL
SELECT 
    'email_verification_tokens' as table_name,
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE used = false AND expires_at > NOW()) as active_tokens
FROM email_verification_tokens;
