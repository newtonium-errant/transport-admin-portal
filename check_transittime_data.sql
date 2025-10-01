-- Quick check to see the state of transittime data in appointments table
-- Run this first to understand what data is missing

-- Overall data completeness check
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

-- Check specific transittime values
SELECT 
    'Transittime Value Distribution' as check_type,
    transittime,
    COUNT(*) as count
FROM appointments 
WHERE "transittime" IS NOT NULL
GROUP BY transittime
ORDER BY transittime;

-- Show appointments that need dropOffTime calculation
SELECT 
    id,
    knumber,
    appointmenttime,
    this_appointment_length,
    transittime,
    "dropOffTime",
    CASE 
        WHEN "transittime" IS NULL THEN 'Missing transittime'
        WHEN "this_appointment_length" IS NULL THEN 'Missing appointment length'
        WHEN "appointmenttime" IS NULL THEN 'Missing appointment time'
        ELSE 'Has all required fields'
    END as missing_data_status
FROM appointments 
WHERE "dropOffTime" IS NULL
ORDER BY appointmenttime DESC
LIMIT 10;
