-- SQL to update dropOffTime column for existing appointments in Supabase
-- This updates appointments where dropOffTime is currently NULL
-- Formula: dropOffTime = appointmenttime + this_appointment_length + transittime

-- First, let's check the current state of the data
-- Count appointments with NULL transittime
SELECT 
    COUNT(*) as total_appointments,
    COUNT("transittime") as appointments_with_transittime,
    COUNT(*) - COUNT("transittime") as appointments_with_null_transittime,
    COUNT("this_appointment_length") as appointments_with_appointment_length,
    COUNT(*) - COUNT("this_appointment_length") as appointments_with_null_appointment_length,
    COUNT("dropOffTime") as appointments_with_dropoff_time,
    COUNT(*) - COUNT("dropOffTime") as appointments_with_null_dropoff_time
FROM appointments;

-- Show sample of appointments with NULL transittime
SELECT 
    id,
    knumber,
    appointmenttime,
    this_appointment_length,
    transittime,
    "dropOffTime"
FROM appointments 
WHERE "transittime" IS NULL
ORDER BY appointmenttime DESC
LIMIT 5;

-- Update appointments that have all required fields (appointmenttime, this_appointment_length, transittime)
UPDATE appointments 
SET "dropOffTime" = ("appointmenttime" + 
                   INTERVAL '1 minute' * COALESCE("this_appointment_length", 120) + 
                   INTERVAL '1 minute' * COALESCE("transittime", 30))
WHERE "dropOffTime" IS NULL 
  AND "appointmenttime" IS NOT NULL
  AND ("this_appointment_length" IS NOT NULL OR "transittime" IS NOT NULL);

-- Update appointments that have appointmenttime and this_appointment_length but NULL transittime (use default 30 minutes)
UPDATE appointments 
SET "dropOffTime" = ("appointmenttime" + 
                   INTERVAL '1 minute' * COALESCE("this_appointment_length", 120) + 
                   INTERVAL '30 minutes')
WHERE "dropOffTime" IS NULL 
  AND "appointmenttime" IS NOT NULL
  AND "this_appointment_length" IS NOT NULL
  AND "transittime" IS NULL;

-- Update appointments that have appointmenttime and transittime but NULL this_appointment_length (use default 120 minutes)
UPDATE appointments 
SET "dropOffTime" = ("appointmenttime" + 
                   INTERVAL '120 minutes' + 
                   INTERVAL '1 minute' * COALESCE("transittime", 30))
WHERE "dropOffTime" IS NULL 
  AND "appointmenttime" IS NOT NULL
  AND "transittime" IS NOT NULL
  AND "this_appointment_length" IS NULL;

-- Update appointments that only have appointmenttime (use defaults: 120 min appointment + 30 min transit)
UPDATE appointments 
SET "dropOffTime" = ("appointmenttime" + INTERVAL '150 minutes')
WHERE "dropOffTime" IS NULL 
  AND "appointmenttime" IS NOT NULL
  AND ("this_appointment_length" IS NULL OR "this_appointment_length" <= 0)
  AND ("transittime" IS NULL OR "transittime" <= 0);

-- Verify the updates
SELECT 
    id,
    knumber,
    appointmenttime,
    this_appointment_length,
    transittime,
    "dropOffTime",
    CASE 
        WHEN "dropOffTime" IS NOT NULL THEN 
            EXTRACT(EPOCH FROM ("dropOffTime" - appointmenttime))/60 
        ELSE NULL 
    END as total_duration_minutes,
    CASE 
        WHEN "dropOffTime" IS NOT NULL AND this_appointment_length IS NOT NULL AND transittime IS NOT NULL THEN
            CONCAT('Appointment: ', this_appointment_length, 'min + Transit: ', transittime, 'min = ', 
                   EXTRACT(EPOCH FROM ("dropOffTime" - appointmenttime))/60, 'min total')
        ELSE 'Missing data for calculation'
    END as calculation_breakdown
FROM appointments 
WHERE "dropOffTime" IS NOT NULL
ORDER BY appointmenttime DESC
LIMIT 10;

-- Count how many appointments still have NULL dropOffTime
SELECT COUNT(*) as appointments_with_null_dropoff
FROM appointments 
WHERE "dropOffTime" IS NULL;

-- Show appointments that still have NULL dropOffTime (for debugging)
SELECT 
    id,
    knumber,
    appointmenttime,
    this_appointment_length,
    transittime,
    "dropOffTime"
FROM appointments 
WHERE "dropOffTime" IS NULL
ORDER BY appointmenttime DESC
LIMIT 5;
