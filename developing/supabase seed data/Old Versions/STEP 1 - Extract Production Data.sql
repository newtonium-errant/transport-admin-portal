-- ============================================================================
-- STEP 1: EXTRACT PRODUCTION DATA
-- ============================================================================
-- Run this script in PRODUCTION Supabase SQL Editor
-- Copy the output and use it in "Copy Production Data to Testing.sql"
--
-- Production Supabase URL: https://supabase.com/dashboard/project/YOUR_PROD_PROJECT/sql
-- Testing Branch URL: https://supabase.com/dashboard/project/bkgrouxtldxnbjalnmms/sql
--
-- ============================================================================

-- ============================================================================
-- 1. GET REFERENCE DATA FROM K7807878 (Andrew Newton - Test Client)
-- ============================================================================
-- This data will be used for all anonymized clients' OpenPhone fields

SELECT
    'Reference OpenPhone Data from K7807878:' as info,
    openphone_contact_id,
    openphone_sync_status,
    openphone_sync_date
FROM clients
WHERE knumber = 'K7807878';

-- ============================================================================
-- 2. EXTRACT DESTINATIONS (all records)
-- ============================================================================

SELECT
    'DESTINATIONS DATA - Copy this entire output:' as info;

SELECT
    id,
    name,
    address,
    city,
    province,
    postal_code,
    phone,
    notes,
    active,
    created_at,
    updated_at
FROM destinations
ORDER BY id;

-- For SQL INSERT format:
SELECT
    '(' ||
    id || ', ' ||
    '''' || REPLACE(name, '''', '''''') || ''', ' ||
    COALESCE('''' || REPLACE(address, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(city, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(province, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(postal_code, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(phone, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(notes, '''', '''''') || '''', 'NULL') || ', ' ||
    active || ', ' ||
    '''' || created_at || '''::timestamptz, ' ||
    '''' || updated_at || '''::timestamptz' ||
    '),' as insert_statement
FROM destinations
ORDER BY id;

-- ============================================================================
-- 3. EXTRACT USERS (only id 13, 23, 30)
-- ============================================================================

SELECT
    'USERS DATA - Copy this entire output:' as info;

SELECT
    id,
    username,
    email,
    password_hash,
    full_name,
    role,
    is_active,
    created_at,
    updated_at,
    last_login,
    password_reset_token,
    password_reset_expires,
    failed_login_attempts,
    locked_until,
    last_password_change,
    status,
    must_change_password,
    last_activity,
    password_reset_attempts,
    password_reset_last_attempt
FROM users
WHERE id IN (13, 23, 30)
ORDER BY id;

-- For SQL INSERT format:
SELECT
    '(' ||
    id || ', ' ||
    '''' || REPLACE(username, '''', '''''') || ''', ' ||
    '''' || REPLACE(email, '''', '''''') || ''', ' ||
    '''' || REPLACE(password_hash, '''', '''''') || ''', ' ||
    COALESCE('''' || REPLACE(full_name, '''', '''''') || '''', 'NULL') || ', ' ||
    '''' || role || ''', ' ||
    is_active || ', ' ||
    '''' || created_at || '''::timestamptz, ' ||
    '''' || updated_at || '''::timestamptz, ' ||
    COALESCE('''' || last_login || '''::timestamptz', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(password_reset_token, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || password_reset_expires || '''::timestamptz', 'NULL') || ', ' ||
    COALESCE(failed_login_attempts::TEXT, '0') || ', ' ||
    COALESCE('''' || locked_until || '''::timestamptz', 'NULL') || ', ' ||
    COALESCE('''' || last_password_change || '''::timestamptz', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(status, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(must_change_password::TEXT, 'false') || ', ' ||
    COALESCE('''' || last_activity || '''::timestamptz', 'NULL') || ', ' ||
    COALESCE(password_reset_attempts::TEXT, '0') || ', ' ||
    COALESCE('''' || password_reset_last_attempt || '''::timestamptz', 'NULL') ||
    '),' as insert_statement
FROM users
WHERE id IN (13, 23, 30)
ORDER BY id;

-- ============================================================================
-- 4. EXTRACT DRIVERS (only id 11 - Andrew Newton)
-- ============================================================================

SELECT
    'DRIVERS DATA - Copy this entire output:' as info;

SELECT *
FROM drivers
WHERE id = 11;

-- For SQL INSERT format (single record):
SELECT
    '(' ||
    id || ', ' ||
    COALESCE('''' || REPLACE(name, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(email, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(phone, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_id, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(preferred_calendar_type, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(active::TEXT, 'true') || ', ' ||
    COALESCE('''' || weekly_hours::TEXT || '''::jsonb', 'NULL') || ', ' ||
    '''' || created_at || '''::timestamptz, ' ||
    '''' || updated_at || '''::timestamptz, ' ||
    COALESCE('''' || REPLACE(gender, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(workload_preference, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(workload_percentage::TEXT, 'NULL') || ', ' ||
    COALESCE(is_male::TEXT, 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(first_name, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(last_name, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_access_token, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_refresh_token, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(google_calendar_connected::TEXT, 'false') || ', ' ||
    COALESCE('''' || google_calendar_connected_at || '''::timestamptz', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_calendar_id, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(work_phone, '''', '''''') || '''', 'NULL') ||
    ')' as insert_statement
FROM drivers
WHERE id = 11;

-- ============================================================================
-- 5. EXTRACT CLIENTS (excluding K7807878, we'll handle separately)
-- ============================================================================

SELECT
    'CLIENTS DATA (excluding K7807878) - ' || COUNT(*) || ' records' as info
FROM clients
WHERE knumber != 'K7807878'
AND active = true;  -- Optional: only get active clients

-- Get first 50 clients for testing (adjust LIMIT as needed)
SELECT
    id,
    created_at,
    knumber,
    phone,
    email,
    firstname,
    lastname,
    civicaddress,
    city,
    prov,
    postalcode,
    notes,
    emergency_contact_name,
    emergency_contact_number,
    driver_gender_requirement,
    preferred_driver,
    mapaddress,
    active,
    appointment_length,
    status,
    clinic_travel_times,
    primary_clinic_id
FROM clients
WHERE knumber != 'K7807878'
ORDER BY created_at
LIMIT 50;

-- ============================================================================
-- 6. EXTRACT K7807878 CLIENT DATA (copy as-is)
-- ============================================================================

SELECT
    'K7807878 CLIENT DATA - Copy this entire output:' as info;

SELECT *
FROM clients
WHERE knumber = 'K7807878';

-- ============================================================================
-- 7. EXTRACT APPOINTMENTS (last month + next month)
-- ============================================================================

SELECT
    'APPOINTMENTS DATA - Date Range: ' ||
    (CURRENT_DATE - INTERVAL '1 month')::TEXT || ' to ' ||
    (CURRENT_DATE + INTERVAL '1 month')::TEXT as info;

SELECT COUNT(*) as total_appointments_in_range
FROM appointments
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
  AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
  AND deleted_at IS NULL;

-- Get appointments in date range
SELECT
    id,
    created_at,
    knumber,
    appointmenttime,
    pickuptime,
    locationname,
    locationaddress,
    notes,
    transittime,
    appointmentstatus,
    driver_assigned,
    driver_email,
    driver_calendar_event_id,
    preferred_driver,
    tripdistance,
    clinic_id,
    this_appointment_length,
    driver_first_name,
    operation_status,
    invoice_status,
    pickup_address,
    managed_by,
    managed_by_name,
    driver_instructions
FROM appointments
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
  AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
  AND deleted_at IS NULL
ORDER BY appointmenttime;

-- ============================================================================
-- 8. SUMMARY STATISTICS
-- ============================================================================

SELECT
    'SUMMARY - Records to be copied:' as info;

SELECT
    'destinations' as table_name,
    COUNT(*) as record_count
FROM destinations
UNION ALL
SELECT 'users', COUNT(*)
FROM users
WHERE id IN (13, 23, 30)
UNION ALL
SELECT 'drivers', COUNT(*)
FROM drivers
WHERE id = 11
UNION ALL
SELECT 'clients (excluding K7807878)', COUNT(*)
FROM clients
WHERE knumber != 'K7807878'
UNION ALL
SELECT 'K7807878 client', COUNT(*)
FROM clients
WHERE knumber = 'K7807878'
UNION ALL
SELECT 'appointments (date range)', COUNT(*)
FROM appointments
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
  AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
  AND deleted_at IS NULL;

-- ============================================================================
-- NEXT STEPS
-- ============================================================================
SELECT '
✅ STEP 1 COMPLETE!

Next Steps:
1. Copy the output from the queries above
2. Open "Copy Production Data to Testing.sql"
3. Replace placeholder data with actual production data
4. Run the updated script in Testing Branch Supabase

Note: For large datasets, you may want to:
- Limit the number of clients (adjust LIMIT 50)
- Filter only active clients (active = true)
- Narrow the appointment date range if needed
' as next_steps;
