-- Migration 28: Add traffic_aware_transit flag to appointments
--
-- Adds a boolean flag to indicate that an appointment's transit time was
-- calculated using real-time Google Maps traffic data (75th percentile)
-- rather than the pre-stored client clinic travel time.
--
-- When true, the transittime column holds the traffic-aware value.
-- The original stored travel time remains available from the client's
-- clinic_travel_times JSONB field.
--
-- Run in Supabase SQL Editor on both branches.

-- ============================================================================
-- 1. Add traffic_aware_transit column
-- ============================================================================

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS traffic_aware_transit BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN appointments.traffic_aware_transit IS 'Whether this appointment used a real-time Google Maps traffic-aware transit time calculation. When true, transittime holds the traffic-calculated value.';

-- ============================================================================
-- 2. Verification
-- ============================================================================

-- Confirm column exists
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'appointments'
  AND column_name = 'traffic_aware_transit';

SELECT 'Migration 28 completed: traffic_aware_transit added to appointments' AS status;
