-- ============================================================================
-- SIMPLIFIED: Extract Production Data for Testing Branch
-- ============================================================================
-- Run this in PRODUCTION Supabase SQL Editor
-- This version just shows the data - you can copy/paste it manually
-- ============================================================================

-- ============================================================================
-- 1. GET DESTINATIONS (all records)
-- ============================================================================
SELECT
    '=== DESTINATIONS DATA ===' as section,
    COUNT(*) as total_records
FROM destinations;

SELECT * FROM destinations ORDER BY id;

-- ============================================================================
-- 2. GET USERS (only id 13, 23, 30)
-- ============================================================================
SELECT
    '=== USERS DATA ===' as section,
    COUNT(*) as total_records
FROM users
WHERE id IN (13, 23, 30);

SELECT * FROM users WHERE id IN (13, 23, 30) ORDER BY id;

-- ============================================================================
-- 3. GET DRIVER (only id 11 - Andrew Newton)
-- ============================================================================
SELECT
    '=== DRIVER DATA ===' as section,
    COUNT(*) as total_records
FROM drivers
WHERE id = 11;

SELECT * FROM drivers WHERE id = 11;

-- ============================================================================
-- 4. GET K7807878 CLIENT (test-safe client, copy as-is)
-- ============================================================================
SELECT
    '=== K7807878 CLIENT DATA (for reference) ===' as section;

SELECT
    openphone_contact_id,
    openphone_sync_status,
    openphone_sync_date
FROM clients
WHERE knumber = 'K7807878';

-- Get full K7807878 record
SELECT * FROM clients WHERE knumber = 'K7807878';

-- ============================================================================
-- 5. GET CLIENTS (excluding K7807878, will be anonymized)
-- ============================================================================
SELECT
    '=== CLIENTS TO ANONYMIZE ===' as section,
    COUNT(*) as total_records
FROM clients
WHERE knumber != 'K7807878'
AND active = true;

-- Get first 50 active clients (adjust LIMIT as needed)
SELECT
    id,
    knumber,
    firstname,
    lastname,
    civicaddress,
    city,
    prov,
    postalcode,
    primary_clinic_id,
    active,
    created_at
FROM clients
WHERE knumber != 'K7807878'
AND active = true
ORDER BY created_at
LIMIT 50;

-- ============================================================================
-- 6. GET APPOINTMENTS (last month + next month)
-- ============================================================================
SELECT
    '=== APPOINTMENTS IN DATE RANGE ===' as section,
    COUNT(*) as total_records,
    MIN(appointmenttime) as earliest,
    MAX(appointmenttime) as latest
FROM appointments
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
  AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
  AND deleted_at IS NULL;

-- Get appointments summary (not full records)
SELECT
    id,
    knumber,
    appointmenttime,
    locationname,
    driver_assigned,
    appointmentstatus
FROM appointments
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
  AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
  AND deleted_at IS NULL
ORDER BY appointmenttime
LIMIT 100;

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT '=== SUMMARY ===' as section;

SELECT 'destinations' as table_name, COUNT(*) as count FROM destinations
UNION ALL
SELECT 'users', COUNT(*) FROM users WHERE id IN (13, 23, 30)
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers WHERE id = 11
UNION ALL
SELECT 'clients (active, excluding K7807878)', COUNT(*) FROM clients WHERE knumber != 'K7807878' AND active = true
UNION ALL
SELECT 'K7807878', COUNT(*) FROM clients WHERE knumber = 'K7807878'
UNION ALL
SELECT 'appointments (date range)', COUNT(*) FROM appointments
    WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
    AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
    AND deleted_at IS NULL;

-- ============================================================================
-- NOTES FOR MANUAL IMPORT
-- ============================================================================
-- After running these queries:
-- 1. destinations: Copy all records from the SELECT * query
-- 2. users: Copy records for ids 13, 23, 30
-- 3. drivers: Copy record for id 11
-- 4. K7807878: Note the openphone data, you'll use this for all test clients
-- 5. clients: These will be anonymized in Testing Branch
-- 6. appointments: Note the count - you may want to adjust the date range
-- ============================================================================
