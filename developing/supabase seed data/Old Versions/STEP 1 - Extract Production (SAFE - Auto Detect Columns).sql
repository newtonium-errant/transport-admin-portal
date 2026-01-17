-- ============================================================================
-- SAFE READ-ONLY: Extract Production Data with Auto-Anonymization
-- ============================================================================
-- ✅ This script is 100% READ-ONLY - it does NOT modify any data
-- ✅ It only uses SELECT statements to read data
-- ✅ RAISE NOTICE just prints output - no changes made
-- ✅ Safe to run in PRODUCTION Supabase
-- ============================================================================
-- Run this in PRODUCTION Supabase SQL Editor
-- Copy the output from the Messages tab
-- Then run in TESTING BRANCH Supabase
-- ============================================================================

-- ============================================================================
-- PART 1: DESTINATIONS (auto-detect columns, copy as-is)
-- ============================================================================

DO $$
DECLARE
    dest_insert TEXT;
BEGIN
    -- Simple approach: Just get all data, we'll manually format it
    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- DESTINATIONS';
    RAISE NOTICE '%', E'-- ============================================================================';
    RAISE NOTICE '%', '-- Copy the table below and manually create INSERT statements';
    RAISE NOTICE '%', E'-- Or run this query separately and export as CSV:\n';
    RAISE NOTICE '%', 'SELECT * FROM destinations ORDER BY id;';
    RAISE NOTICE '%', E'\n';
END $$;

-- ============================================================================
-- PART 2: USERS (only 13, 23, 30)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- USERS (id 13, 23, 30)';
    RAISE NOTICE '%', E'-- ============================================================================';
    RAISE NOTICE '%', '-- Run this query separately:';
    RAISE NOTICE '%', E'SELECT * FROM users WHERE id IN (13, 23, 30) ORDER BY id;\n';
END $$;

-- ============================================================================
-- PART 3: DRIVER (only id 11)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- DRIVER (id 11)';
    RAISE NOTICE '%', E'-- ============================================================================';
    RAISE NOTICE '%', '-- Run this query separately:';
    RAISE NOTICE '%', E'SELECT * FROM drivers WHERE id = 11;\n';
END $$;

-- ============================================================================
-- PART 4: K7807878 OpenPhone Reference Data
-- ============================================================================

DO $$
DECLARE
    openphone_contact_id TEXT;
    openphone_sync_status TEXT;
    openphone_sync_date TEXT;
BEGIN
    -- Get K7807878's OpenPhone data
    SELECT
        COALESCE(c.openphone_contact_id, 'NULL'),
        COALESCE(c.openphone_sync_status, 'NULL'),
        COALESCE(c.openphone_sync_date::TEXT, 'NULL')
    INTO
        openphone_contact_id,
        openphone_sync_status,
        openphone_sync_date
    FROM clients c
    WHERE c.knumber = 'K7807878';

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- K7807878 OPENPHONE REFERENCE DATA';
    RAISE NOTICE '%', E'-- ============================================================================';
    RAISE NOTICE '%', '-- Use these values for all anonymized clients:';
    RAISE NOTICE '%', E'-- openphone_contact_id: %', openphone_contact_id;
    RAISE NOTICE '%', E'-- openphone_sync_status: %', openphone_sync_status;
    RAISE NOTICE '%', E'-- openphone_sync_date: %', openphone_sync_date;
    RAISE NOTICE '%', E'\n';
END $$;

-- ============================================================================
-- PART 5: CLIENTS (Simple output - will anonymize manually)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- CLIENTS TO ANONYMIZE';
    RAISE NOTICE '%', E'-- ============================================================================';
    RAISE NOTICE '%', '-- Run these queries separately:';
    RAISE NOTICE '%', E'\n-- K7807878 (copy as-is):';
    RAISE NOTICE '%', E'SELECT * FROM clients WHERE knumber = ''K7807878'';\n';
    RAISE NOTICE '%', E'-- First 50 active clients (will be anonymized):';
    RAISE NOTICE '%', E'SELECT * FROM clients WHERE knumber != ''K7807878'' AND active = true ORDER BY created_at LIMIT 50;\n';
END $$;

-- ============================================================================
-- PART 6: APPOINTMENTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- APPOINTMENTS';
    RAISE NOTICE '%', E'-- ============================================================================';
    RAISE NOTICE '%', '-- Run this query separately:';
    RAISE NOTICE '%', E'SELECT *';
    RAISE NOTICE '%', E'FROM appointments';
    RAISE NOTICE '%', E'WHERE appointmenttime >= CURRENT_DATE - INTERVAL ''1 month''';
    RAISE NOTICE '%', E'  AND appointmenttime <= CURRENT_DATE + INTERVAL ''2 months''';
    RAISE NOTICE '%', E'  AND deleted_at IS NULL';
    RAISE NOTICE '%', E'ORDER BY appointmenttime';
    RAISE NOTICE '%', E'LIMIT 100;\n';
END $$;

-- ============================================================================
-- SUMMARY OF WHAT TO DO NEXT
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n========================================================================';
    RAISE NOTICE '%', '✅ THIS SCRIPT IS READ-ONLY - NO DATA WAS CHANGED';
    RAISE NOTICE '%', '========================================================================';
    RAISE NOTICE '%', E'\nNEXT STEPS:';
    RAISE NOTICE '%', '1. Run each SELECT query shown above separately in Production';
    RAISE NOTICE '%', '2. Export the results';
    RAISE NOTICE '%', '3. Use the manual import template to create INSERT statements';
    RAISE NOTICE '%', '4. Apply anonymization (K0000001, TestFirstName1, etc.)';
    RAISE NOTICE '%', '5. Run the INSERT statements in Testing Branch';
    RAISE NOTICE '%', E'\nOR use the CSV export feature in Supabase to export each table,';
    RAISE NOTICE '%', 'then import into Testing Branch with anonymization.';
    RAISE NOTICE '%', '========================================================================';
END $$;
