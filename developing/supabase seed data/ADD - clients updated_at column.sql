-- ============================================================================
-- Add updated_at column to clients table (Testing Branch)
-- ============================================================================
-- Run this in TESTING BRANCH Supabase SQL Editor
-- ============================================================================

-- Add updated_at column with default value
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP;

-- Set updated_at to created_at for existing records
UPDATE clients
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Create a trigger function to automatically update updated_at on row changes
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set updated_at on UPDATE
DROP TRIGGER IF EXISTS clients_updated_at_trigger ON clients;
CREATE TRIGGER clients_updated_at_trigger
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_clients_updated_at();

-- Verify
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'clients'
    AND column_name = 'updated_at';

-- Show sample data
SELECT
    knumber,
    firstname,
    lastname,
    created_at,
    updated_at
FROM clients
LIMIT 5;

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT '✅ updated_at column added to clients table' as status;
SELECT '✅ Trigger created to automatically update updated_at on row changes' as status;
