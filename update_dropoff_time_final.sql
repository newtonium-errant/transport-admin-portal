-- SQL to update dropOffTime column for existing appointments in Supabase
-- This updates appointments where dropOffTime is currently NULL
-- Formula: dropOffTime = appointmenttime + this_appointment_length + transittime
-- All appointments now have transittime values

-- First, verify all appointments have the required data
SELECT 
    'Data Completeness Check' as check_type,
    COUNT(*) as total_appointments,
    COUNT("transittime") as appointments_with_transittime,
    COUNT(*) - COUNT("transittime") as appointments_with_null_transittime,
    COUNT("this_appointment_length") as appointments_with_appointment_length,
    COUNT(*) - COUNT("this_appointment_length") as appointments_with_null_appointment_length,
    COUNT("dropOffTime") as appointments_with_dropoff_time,
    COUNT(*) - COUNT("dropOffTime") as appointments_with_null_dropoff_time
FROM appointments;

-- Update all appointments that have NULL dropOffTime
-- Since all appointments now have transittime, we can use a single UPDATE statement
UPDATE appointments 
SET "dropOffTime" = ("appointmenttime" + 
                   INTERVAL '1 minute' * COALESCE("this_appointment_length", 120) + 
                   INTERVAL '1 minute' * COALESCE("transittime", 30))
WHERE "dropOffTime" IS NULL 
  AND "appointmenttime" IS NOT NULL;

-- Verify the updates worked correctly
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

-- Count how many appointments still have NULL dropOffTime (should be 0 after update)
SELECT COUNT(*) as appointments_with_null_dropoff
FROM appointments 
WHERE "dropOffTime" IS NULL;

-- Show any appointments that still have NULL dropOffTime (for debugging)
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
