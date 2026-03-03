-- Migration 25: Add primary_clinic_id to clients table
--
-- Adds a foreign key reference to destinations(id) so each client can have
-- a default clinic for auto-populating appointment forms.
--
-- Run in Supabase SQL Editor on both branches.

-- ============================================================================
-- 1. Add column
-- ============================================================================

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS primary_clinic_id INTEGER REFERENCES destinations(id) ON DELETE SET NULL;

COMMENT ON COLUMN clients.primary_clinic_id IS 'Default clinic for this client, used for auto-populating appointment forms';

-- ============================================================================
-- 2. Verification
-- ============================================================================

-- Confirm column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name = 'primary_clinic_id';

-- Confirm FK constraint exists
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'clients'
  AND constraint_name LIKE '%primary_clinic_id%';

SELECT 'Migration 25 completed: primary_clinic_id added to clients' AS status;
