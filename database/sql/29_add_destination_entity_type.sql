-- Migration 29: Add 'destination' to background_tasks entity_type CHECK constraint
--
-- The background_tasks table tracks async operations for clients, appointments,
-- and drivers. Adding 'destination' supports async workflows for Add Destination
-- and Update Destination (e.g., calculating distances to all clients/drivers).
--
-- Run in Supabase SQL Editor on both branches.

-- ============================================================================
-- 1. Drop existing constraint
-- ============================================================================

ALTER TABLE background_tasks
DROP CONSTRAINT IF EXISTS chk_bg_task_entity_type;

-- ============================================================================
-- 2. Re-add with 'destination' included
-- ============================================================================

ALTER TABLE background_tasks
ADD CONSTRAINT chk_bg_task_entity_type
  CHECK (entity_type IN ('client', 'appointment', 'driver', 'destination'));

-- ============================================================================
-- 3. Verification
-- ============================================================================

SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'chk_bg_task_entity_type';

SELECT 'Migration 29 completed: destination added to background_tasks entity_type CHECK' AS status;
