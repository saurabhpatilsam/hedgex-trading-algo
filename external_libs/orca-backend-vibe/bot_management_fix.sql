-- Fix for foreign key constraint issue
-- Run this in Supabase SQL Editor if you're still getting foreign key errors

-- Option 1: Make the foreign key constraint deferrable (allows temporary violations)
ALTER TABLE bot_state 
DROP CONSTRAINT IF EXISTS fk_bot_state_bot_id;

ALTER TABLE bot_state 
ADD CONSTRAINT fk_bot_state_bot_id 
    FOREIGN KEY (bot_id) 
    REFERENCES bots(bot_id) 
    ON DELETE CASCADE
    DEFERRABLE INITIALLY IMMEDIATE;

-- Option 2: If you want to completely remove the constraint (not recommended for production)
-- ALTER TABLE bot_state 
-- DROP CONSTRAINT IF EXISTS fk_bot_state_bot_id;

-- Check if there are any orphaned bot_state records
SELECT bs.bot_id 
FROM bot_state bs
LEFT JOIN bots b ON bs.bot_id = b.bot_id
WHERE b.bot_id IS NULL;

-- Clean up any orphaned bot_state records
DELETE FROM bot_state 
WHERE bot_id NOT IN (SELECT bot_id FROM bots);

-- Verify the fix
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.is_deferrable,
    rc.initially_deferred
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'bot_state';
