-- Migration 19: Add Appointment Types to Appointments Table
-- Purpose: Support three appointment types: round_trip (default), one_way, and support events
-- Created: 2026-02-23
-- Related Feature: Appointment Types (round trip, one-way, support events)
--
-- Changes:
--   appointments: +appointment_type, +trip_direction, +event_name columns
--   clients: insert sentinel K0000 "Support Event (No Client)"
--   Constraints enforce: trip_direction only for one_way, event_name only for support

-- ============================================================================
-- STEP 1: Add appointment_type column with default 'round_trip'
-- ============================================================================

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS appointment_type text DEFAULT 'round_trip';

COMMENT ON COLUMN appointments.appointment_type IS 'Type of appointment: round_trip (default), one_way, or support. Controls which fields are valid.';

-- ============================================================================
-- STEP 2: Add trip_direction column (nullable, only valid for one_way)
-- ============================================================================

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS trip_direction text;

COMMENT ON COLUMN appointments.trip_direction IS 'Direction for one-way trips: to_clinic or to_home. NULL for round_trip and support types.';

-- ============================================================================
-- STEP 3: Add event_name column (nullable, only valid for support)
-- ============================================================================

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS event_name text;

COMMENT ON COLUMN appointments.event_name IS 'Name/description of support event. NULL for round_trip and one_way types.';

-- ============================================================================
-- STEP 4: Add CHECK constraints
-- ============================================================================

-- Constraint: appointment_type must be one of the valid values
ALTER TABLE appointments
ADD CONSTRAINT chk_appointment_type_valid
CHECK (appointment_type IN ('round_trip', 'one_way', 'support'));

-- Constraint: trip_direction only allowed when appointment_type = 'one_way'
-- When type IS one_way, trip_direction must be set (to_clinic or to_home)
-- When type is NOT one_way, trip_direction must be NULL
ALTER TABLE appointments
ADD CONSTRAINT chk_trip_direction_valid
CHECK (
    (appointment_type = 'one_way' AND trip_direction IN ('to_clinic', 'to_home'))
    OR
    (appointment_type != 'one_way' AND trip_direction IS NULL)
);

-- Constraint: event_name only allowed when appointment_type = 'support'
-- When type IS support, event_name should be set (not enforced NOT NULL to allow saves in progress)
-- When type is NOT support, event_name must be NULL
ALTER TABLE appointments
ADD CONSTRAINT chk_event_name_valid
CHECK (
    (appointment_type = 'support')
    OR
    (appointment_type != 'support' AND event_name IS NULL)
);

-- ============================================================================
-- STEP 5: Backfill existing rows with 'round_trip'
-- ============================================================================

UPDATE appointments
SET appointment_type = 'round_trip'
WHERE appointment_type IS NULL;

-- ============================================================================
-- STEP 6: Add index on appointment_type for filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointments_appointment_type ON appointments(appointment_type);

-- ============================================================================
-- STEP 7: Insert sentinel client K0000 "Support Event (No Client)"
-- ============================================================================

INSERT INTO clients (knumber, firstname, lastname, active, notes)
VALUES (
    'K0000',
    'Support Event',
    '(No Client)',
    true,
    'Sentinel record for support event appointments. Do not edit or delete.'
)
ON CONFLICT (knumber) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify new columns exist
SELECT 'appointments.appointment_type' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'appointment_type')
            THEN 'EXISTS' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'appointments.trip_direction' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'trip_direction')
            THEN 'EXISTS' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'appointments.event_name' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'event_name')
            THEN 'EXISTS' ELSE 'MISSING' END AS status;

-- Verify sentinel client K0000 exists
SELECT 'client K0000' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM clients WHERE knumber = 'K0000')
            THEN 'EXISTS' ELSE 'MISSING' END AS status;

-- Verify backfill (no NULL appointment_type values should remain)
SELECT 'backfill complete' AS check_item,
       CASE WHEN NOT EXISTS (SELECT 1 FROM appointments WHERE appointment_type IS NULL)
            THEN 'YES' ELSE 'INCOMPLETE' END AS status;

-- Verify CHECK constraints exist
SELECT 'chk_appointment_type_valid' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'chk_appointment_type_valid')
            THEN 'EXISTS' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'chk_trip_direction_valid' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'chk_trip_direction_valid')
            THEN 'EXISTS' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'chk_event_name_valid' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'chk_event_name_valid')
            THEN 'EXISTS' ELSE 'MISSING' END AS status;

-- Verify index exists
SELECT 'idx_appointments_appointment_type' AS check_item,
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_appointment_type')
            THEN 'EXISTS' ELSE 'MISSING' END AS status;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'Migration 19 completed: Appointment types added (round_trip, one_way, support)' AS status;
