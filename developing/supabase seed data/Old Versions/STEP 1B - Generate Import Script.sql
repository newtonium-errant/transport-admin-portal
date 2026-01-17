-- ============================================================================
-- STEP 1B: Generate Import Script (Run in PRODUCTION)
-- ============================================================================
-- This script GENERATES the SQL you need to run in Testing Branch
-- Copy the OUTPUT of these queries and save to a file
-- Then run that file in Testing Branch Supabase
-- ============================================================================

-- ============================================================================
-- PART 1: Generate DESTINATIONS inserts
-- ============================================================================
SELECT '-- DESTINATIONS' as section;

SELECT
    'INSERT INTO destinations (id, name, address, city, province, postal_code, phone, notes, active, created_at, updated_at) VALUES' ||
    E'\n' ||
    string_agg(
        '(' ||
        id || ', ' ||
        COALESCE('''' || REPLACE(name, '''', '''''') || '''', 'NULL') || ', ' ||
        COALESCE('''' || REPLACE(address, '''', '''''') || '''', 'NULL') || ', ' ||
        COALESCE('''' || REPLACE(city, '''', '''''') || '''', 'NULL') || ', ' ||
        COALESCE('''' || REPLACE(province, '''', '''''') || '''', 'NULL') || ', ' ||
        COALESCE('''' || REPLACE(postal_code, '''', '''''') || '''', 'NULL') || ', ' ||
        COALESCE('''' || REPLACE(phone, '''', '''''') || '''', 'NULL') || ', ' ||
        COALESCE('''' || REPLACE(notes, '''', '''''') || '''', 'NULL') || ', ' ||
        active || ', ' ||
        '''' || created_at || '''::timestamptz, ' ||
        '''' || updated_at || '''::timestamptz' ||
        ')',
        E',\n'
        ORDER BY id
    ) ||
    E';\n' ||
    'SELECT setval(''destinations_id_seq'', (SELECT MAX(id) FROM destinations));'
    as insert_statement
FROM destinations;

-- ============================================================================
-- PART 2: Generate USERS inserts (only 13, 23, 30)
-- ============================================================================
SELECT '-- USERS' as section;

SELECT
    'INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at, updated_at, last_login, password_reset_token, password_reset_expires, failed_login_attempts, locked_until, last_password_change, status, must_change_password, last_activity, password_reset_attempts, password_reset_last_attempt) VALUES' ||
    E'\n' ||
    string_agg(
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
        COALESCE(failed_login_attempts, 0) || ', ' ||
        COALESCE('''' || locked_until || '''::timestamptz', 'NULL') || ', ' ||
        COALESCE('''' || last_password_change || '''::timestamptz', 'NULL') || ', ' ||
        COALESCE('''' || REPLACE(status, '''', '''''') || '''', 'NULL') || ', ' ||
        COALESCE(must_change_password, false) || ', ' ||
        COALESCE('''' || last_activity || '''::timestamptz', 'NULL') || ', ' ||
        COALESCE(password_reset_attempts, 0) || ', ' ||
        COALESCE('''' || password_reset_last_attempt || '''::timestamptz', 'NULL') ||
        ')',
        E',\n'
        ORDER BY id
    ) ||
    E';\n' ||
    'SELECT setval(''users_id_seq'', (SELECT MAX(id) FROM users));'
    as insert_statement
FROM users
WHERE id IN (13, 23, 30);

-- ============================================================================
-- PART 3: Generate DRIVER insert (only id 11)
-- ============================================================================
SELECT '-- DRIVER' as section;

SELECT
    'INSERT INTO drivers (id, name, first_name, last_name, email, phone, work_phone, google_calendar_id, active, gender, is_male, google_calendar_access_token, google_calendar_refresh_token, google_calendar_connected, google_calendar_connected_at, google_calendar_calendar_id, created_at, updated_at) VALUES (' ||
    id || ', ' ||
    COALESCE('''' || REPLACE(name, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(first_name, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(last_name, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(email, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(phone, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(work_phone, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_id, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(active, true) || ', ' ||
    COALESCE('''' || REPLACE(gender, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(is_male, false) || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_access_token, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_refresh_token, '''', '''''') || '''', 'NULL') || ', ' ||
    COALESCE(google_calendar_connected, false) || ', ' ||
    COALESCE('''' || google_calendar_connected_at || '''::timestamptz', 'NULL') || ', ' ||
    COALESCE('''' || REPLACE(google_calendar_calendar_id, '''', '''''') || '''', 'NULL') || ', ' ||
    '''' || created_at || '''::timestamptz, ' ||
    '''' || updated_at || '''::timestamptz' ||
    ');' || E'\n' ||
    'SELECT setval(''drivers_id_seq'', (SELECT MAX(id) FROM drivers));'
    as insert_statement
FROM drivers
WHERE id = 11;

-- ============================================================================
-- PART 4: Get K7807878 OpenPhone reference data
-- ============================================================================
SELECT '-- K7807878 OPENPHONE REFERENCE' as section;

SELECT
    '-- Use these values for all anonymized clients:' || E'\n' ||
    '-- openphone_contact_id: ' || COALESCE(openphone_contact_id, 'NULL') || E'\n' ||
    '-- openphone_sync_status: ' || COALESCE(openphone_sync_status, 'NULL') || E'\n' ||
    '-- openphone_sync_date: ' || COALESCE(openphone_sync_date::TEXT, 'NULL')
    as reference_data
FROM clients
WHERE knumber = 'K7807878';

-- ============================================================================
-- INSTRUCTIONS FOR CLIENTS
-- ============================================================================
SELECT '-- CLIENTS - MANUAL ANONYMIZATION NEEDED' as section;

SELECT '-- Run this query to get client data, then manually anonymize:' as instruction;

SELECT '-- For each client below (except K7807878):
-- 1. Change knumber to sequential: K0000001, K0000002, etc.
-- 2. Change firstname to: TestFirstName1, TestFirstName2, etc.
-- 3. Change lastname to: TestLastName1, TestLastName2, etc.
-- 4. Change phone to: 902-760-0946
-- 5. Change email to: strugglebusca@gmail.com
-- 6. Change emergency_contact_name to: TestEmergencyContactName1, etc.
-- 7. Change emergency_contact_number to: 902-760-0946
-- 8. Use K7807878 openphone values from above
-- 9. Keep everything else (address, primary_clinic_id, etc.)
' as instructions;

-- Show client data in easy-to-read format
SELECT
    knumber,
    firstname,
    lastname,
    civicaddress,
    city,
    prov,
    postalcode,
    primary_clinic_id,
    active
FROM clients
WHERE knumber != 'K7807878'
  AND active = true
ORDER BY created_at
LIMIT 50;

-- ============================================================================
-- DONE
-- ============================================================================
SELECT '
=================================================================
COPY ALL THE OUTPUT ABOVE AND SAVE TO A FILE
Then manually add the anonymized client inserts
Then run in Testing Branch Supabase
=================================================================
' as next_steps;
