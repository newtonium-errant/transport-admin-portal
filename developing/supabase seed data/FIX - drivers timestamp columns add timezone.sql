-- ============================================================================
-- Fix driver timestamp columns to use 'timestamp with time zone'
-- ============================================================================
-- Run this in TESTING BRANCH Supabase SQL Editor
-- ============================================================================
-- This fixes three timestamp columns that are missing time zone:
-- 1. created_at
-- 2. updated_at
-- 3. google_calendar_connected_at
-- ============================================================================

-- Fix created_at column
ALTER TABLE drivers
ALTER COLUMN created_at TYPE timestamp with time zone;

-- Fix updated_at column
ALTER TABLE drivers
ALTER COLUMN updated_at TYPE timestamp with time zone;

-- Fix google_calendar_connected_at column
ALTER TABLE drivers
ALTER COLUMN google_calendar_connected_at TYPE timestamp with time zone;

-- Create or replace trigger function for updated_at
CREATE OR REPLACE FUNCTION update_drivers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set updated_at on UPDATE
DROP TRIGGER IF EXISTS drivers_updated_at_trigger ON drivers;
CREATE TRIGGER drivers_updated_at_trigger
    BEFORE UPDATE ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_drivers_updated_at();

-- Verify the changes
SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'drivers'
    AND column_name IN ('created_at', 'updated_at', 'google_calendar_connected_at')
ORDER BY column_name;

-- Show sample data with timezone
SELECT
    id,
    name,
    created_at,
    updated_at,
    google_calendar_connected_at
FROM drivers
LIMIT 5;

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT '✅ created_at column changed to timestamp with time zone' as status;
SELECT '✅ updated_at column changed to timestamp with time zone' as status;
SELECT '✅ google_calendar_connected_at column changed to timestamp with time zone' as status;
SELECT '✅ Trigger created to automatically update updated_at on row changes' as status;
