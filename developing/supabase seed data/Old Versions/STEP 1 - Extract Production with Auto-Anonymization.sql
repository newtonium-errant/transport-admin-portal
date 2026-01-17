-- ============================================================================
-- STEP 1: Extract Production Data with AUTOMATIC Anonymization
-- ============================================================================
-- Run this in PRODUCTION Supabase SQL Editor
-- Copy ALL the output and save to a file called "import-to-testing.sql"
-- Then run that file in TESTING BRANCH Supabase
-- ============================================================================

-- This script generates INSERT statements with anonymization already applied
-- K7807878 stays as-is, all others become K0000001, K0000002, etc.

-- ============================================================================
-- PART 1: DESTINATIONS (copy as-is, no anonymization needed)
-- ============================================================================

DO $$
DECLARE
    dest_insert TEXT;
BEGIN
    SELECT
        'INSERT INTO destinations (id, name, address, city, province, postal_code, phone, notes, active, created_at, updated_at) VALUES ' ||
        string_agg(
            '(' ||
            id::TEXT || ', ' ||
            quote_literal(name) || ', ' ||
            quote_literal(address) || ', ' ||
            quote_literal(city) || ', ' ||
            quote_literal(province) || ', ' ||
            quote_literal(postal_code) || ', ' ||
            COALESCE(quote_literal(phone), 'NULL') || ', ' ||
            COALESCE(quote_literal(notes), 'NULL') || ', ' ||
            active::TEXT || ', ' ||
            quote_literal(created_at::TEXT) || '::timestamptz, ' ||
            quote_literal(updated_at::TEXT) || '::timestamptz' ||
            ')',
            E',\n'
            ORDER BY id
        ) || E';\nSELECT setval(''destinations_id_seq'', (SELECT MAX(id) FROM destinations));\n'
    INTO dest_insert
    FROM destinations;

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- DESTINATIONS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', dest_insert;
END $$;

-- ============================================================================
-- PART 2: USERS (only 13, 23, 30 - copy as-is)
-- ============================================================================

DO $$
DECLARE
    users_insert TEXT;
BEGIN
    SELECT
        'INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at, updated_at, last_login, password_reset_token, password_reset_expires, failed_login_attempts, locked_until, last_password_change, status, must_change_password, last_activity, password_reset_attempts, password_reset_last_attempt) VALUES ' ||
        string_agg(
            '(' ||
            id::TEXT || ', ' ||
            quote_literal(username) || ', ' ||
            quote_literal(email) || ', ' ||
            quote_literal(password_hash) || ', ' ||
            COALESCE(quote_literal(full_name), 'NULL') || ', ' ||
            quote_literal(role) || ', ' ||
            is_active::TEXT || ', ' ||
            quote_literal(created_at::TEXT) || '::timestamptz, ' ||
            quote_literal(updated_at::TEXT) || '::timestamptz, ' ||
            COALESCE(quote_literal(last_login::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(password_reset_token), 'NULL') || ', ' ||
            COALESCE(quote_literal(password_reset_expires::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(failed_login_attempts::TEXT, '0') || ', ' ||
            COALESCE(quote_literal(locked_until::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(last_password_change::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(status), 'NULL') || ', ' ||
            COALESCE(must_change_password::TEXT, 'false') || ', ' ||
            COALESCE(quote_literal(last_activity::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(password_reset_attempts::TEXT, '0') || ', ' ||
            COALESCE(quote_literal(password_reset_last_attempt::TEXT) || '::timestamptz', 'NULL') ||
            ')',
            E',\n'
            ORDER BY id
        ) || E';\nSELECT setval(''users_id_seq'', (SELECT MAX(id) FROM users));\n'
    INTO users_insert
    FROM users
    WHERE id IN (13, 23, 30);

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- USERS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', users_insert;
END $$;

-- ============================================================================
-- PART 3: DRIVER (only id 11 - copy as-is)
-- ============================================================================

DO $$
DECLARE
    driver_insert TEXT;
BEGIN
    SELECT
        'INSERT INTO drivers (id, name, first_name, last_name, email, phone, work_phone, google_calendar_id, active, gender, is_male, google_calendar_access_token, google_calendar_refresh_token, google_calendar_connected, google_calendar_connected_at, google_calendar_calendar_id, created_at, updated_at) VALUES (' ||
        id::TEXT || ', ' ||
        COALESCE(quote_literal(name), 'NULL') || ', ' ||
        COALESCE(quote_literal(first_name), 'NULL') || ', ' ||
        COALESCE(quote_literal(last_name), 'NULL') || ', ' ||
        COALESCE(quote_literal(email), 'NULL') || ', ' ||
        COALESCE(quote_literal(phone), 'NULL') || ', ' ||
        COALESCE(quote_literal(work_phone), 'NULL') || ', ' ||
        COALESCE(quote_literal(google_calendar_id), 'NULL') || ', ' ||
        COALESCE(active::TEXT, 'true') || ', ' ||
        COALESCE(quote_literal(gender), 'NULL') || ', ' ||
        COALESCE(is_male::TEXT, 'false') || ', ' ||
        COALESCE(quote_literal(google_calendar_access_token), 'NULL') || ', ' ||
        COALESCE(quote_literal(google_calendar_refresh_token), 'NULL') || ', ' ||
        COALESCE(google_calendar_connected::TEXT, 'false') || ', ' ||
        COALESCE(quote_literal(google_calendar_connected_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
        COALESCE(quote_literal(google_calendar_calendar_id), 'NULL') || ', ' ||
        quote_literal(created_at::TEXT) || '::timestamptz, ' ||
        quote_literal(updated_at::TEXT) || '::timestamptz' ||
        E');\nSELECT setval(''drivers_id_seq'', (SELECT MAX(id) FROM drivers));\n'
    INTO driver_insert
    FROM drivers
    WHERE id = 11;

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- DRIVER';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', driver_insert;
END $$;

-- ============================================================================
-- PART 4: CLIENTS (K7807878 as-is, others ANONYMIZED)
-- ============================================================================

DO $$
DECLARE
    k7807878_insert TEXT;
    anonymized_inserts TEXT;
    openphone_contact_id TEXT;
    openphone_sync_status TEXT;
    openphone_sync_date TIMESTAMPTZ;
BEGIN
    -- Get K7807878's OpenPhone data to use for all test clients
    SELECT
        c.openphone_contact_id,
        c.openphone_sync_status,
        c.openphone_sync_date
    INTO
        openphone_contact_id,
        openphone_sync_status,
        openphone_sync_date
    FROM clients c
    WHERE c.knumber = 'K7807878';

    -- Insert K7807878 as-is
    SELECT
        'INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement, preferred_driver, mapaddress, active, appointment_length, primary_clinic_id, clinic_travel_times, status, openphone_contact_id, openphone_sync_status, openphone_sync_date, created_at, updated_at) VALUES (' ||
        quote_literal(knumber) || ', ' ||
        quote_literal(firstname) || ', ' ||
        quote_literal(lastname) || ', ' ||
        quote_literal(phone) || ', ' ||
        COALESCE(quote_literal(email), 'NULL') || ', ' ||
        COALESCE(quote_literal(civicaddress), 'NULL') || ', ' ||
        COALESCE(quote_literal(city), 'NULL') || ', ' ||
        COALESCE(quote_literal(prov), 'NULL') || ', ' ||
        COALESCE(quote_literal(postalcode), 'NULL') || ', ' ||
        COALESCE(quote_literal(notes), 'NULL') || ', ' ||
        COALESCE(quote_literal(emergency_contact_name), 'NULL') || ', ' ||
        COALESCE(quote_literal(emergency_contact_number), 'NULL') || ', ' ||
        COALESCE(quote_literal(driver_gender_requirement), 'NULL') || ', ' ||
        COALESCE(preferred_driver::TEXT, 'NULL') || ', ' ||
        COALESCE(quote_literal(mapaddress), 'NULL') || ', ' ||
        active::TEXT || ', ' ||
        COALESCE(appointment_length::TEXT, '60') || ', ' ||
        COALESCE(primary_clinic_id::TEXT, 'NULL') || ', ' ||
        COALESCE(quote_literal(clinic_travel_times::TEXT), 'NULL') || ', ' ||
        COALESCE(quote_literal(status), 'NULL') || ', ' ||
        COALESCE(quote_literal(c.openphone_contact_id), 'NULL') || ', ' ||
        COALESCE(quote_literal(c.openphone_sync_status), 'NULL') || ', ' ||
        COALESCE(quote_literal(c.openphone_sync_date::TEXT) || '::timestamptz', 'NULL') || ', ' ||
        quote_literal(created_at::TEXT) || '::timestamptz, ' ||
        quote_literal(updated_at::TEXT) || '::timestamptz' ||
        ');'
    INTO k7807878_insert
    FROM clients c
    WHERE knumber = 'K7807878';

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- CLIENTS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', E'-- K7807878 (Andrew Newton - test-safe, not anonymized)\n';
    RAISE NOTICE '%', k7807878_insert;

    -- Generate anonymized inserts for other clients
    SELECT
        E'\n-- Other clients (ANONYMIZED)\nINSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement, preferred_driver, mapaddress, active, appointment_length, primary_clinic_id, clinic_travel_times, status, openphone_contact_id, openphone_sync_status, openphone_sync_date, created_at, updated_at) VALUES\n' ||
        string_agg(
            '(' ||
            quote_literal('K' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 7, '0')) || ', ' ||  -- K0000001, K0000002, etc.
            quote_literal('TestFirstName' || ROW_NUMBER() OVER (ORDER BY created_at)) || ', ' ||
            quote_literal('TestLastName' || ROW_NUMBER() OVER (ORDER BY created_at)) || ', ' ||
            '''902-760-0946'', ' ||
            '''strugglebusca@gmail.com'', ' ||
            COALESCE(quote_literal(civicaddress), 'NULL') || ', ' ||
            COALESCE(quote_literal(city), 'NULL') || ', ' ||
            COALESCE(quote_literal(prov), 'NULL') || ', ' ||
            COALESCE(quote_literal(postalcode), 'NULL') || ', ' ||
            COALESCE(quote_literal(notes), 'NULL') || ', ' ||
            quote_literal('TestEmergencyContactName' || ROW_NUMBER() OVER (ORDER BY created_at)) || ', ' ||
            '''902-760-0946'', ' ||
            COALESCE(quote_literal(driver_gender_requirement), 'NULL') || ', ' ||
            COALESCE(preferred_driver::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(mapaddress), 'NULL') || ', ' ||
            active::TEXT || ', ' ||
            COALESCE(appointment_length::TEXT, '60') || ', ' ||
            COALESCE(primary_clinic_id::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(clinic_travel_times::TEXT), 'NULL') || ', ' ||
            COALESCE(quote_literal(status), 'NULL') || ', ' ||
            COALESCE(quote_literal(openphone_contact_id), 'NULL') || ', ' ||
            COALESCE(quote_literal(openphone_sync_status), 'NULL') || ', ' ||
            COALESCE(quote_literal(openphone_sync_date::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            quote_literal(created_at::TEXT) || '::timestamptz, ' ||
            quote_literal(updated_at::TEXT) || '::timestamptz' ||
            ')',
            E',\n'
        ) || ';'
    INTO anonymized_inserts
    FROM clients
    WHERE knumber != 'K7807878'
      AND active = true
    ORDER BY created_at
    LIMIT 50;

    RAISE NOTICE '%', E'\n';
    RAISE NOTICE '%', anonymized_inserts;
END $$;

-- ============================================================================
-- PART 5: APPOINTMENTS (update knumbers to match anonymized clients)
-- ============================================================================

DO $$
DECLARE
    appt_insert TEXT;
BEGIN
    -- Create temp mapping of old knumbers to new anonymized knumbers
    CREATE TEMP TABLE IF NOT EXISTS knumber_mapping AS
    SELECT
        knumber as old_knumber,
        'K' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 7, '0') as new_knumber
    FROM clients
    WHERE knumber != 'K7807878'
      AND active = true
    ORDER BY created_at
    LIMIT 50;

    -- Add K7807878 to mapping (maps to itself)
    INSERT INTO knumber_mapping VALUES ('K7807878', 'K7807878');

    -- Generate appointment inserts with updated knumbers
    SELECT
        'INSERT INTO appointments (knumber, appointmenttime, pickuptime, locationname, locationaddress, notes, transittime, appointmentstatus, driver_assigned, driver_email, clinic_id, this_appointment_length, created_at, updated_at) VALUES ' ||
        string_agg(
            '(' ||
            quote_literal(COALESCE(km.new_knumber, a.knumber)) || ', ' ||
            quote_literal(a.appointmenttime::TEXT) || '::timestamptz, ' ||
            COALESCE(quote_literal(a.pickuptime::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(a.locationname), 'NULL') || ', ' ||
            COALESCE(quote_literal(a.locationaddress), 'NULL') || ', ' ||
            COALESCE(quote_literal(a.notes), 'NULL') || ', ' ||
            COALESCE(a.transittime::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(a.appointmentstatus), 'NULL') || ', ' ||
            COALESCE(a.driver_assigned::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(a.driver_email), 'NULL') || ', ' ||
            COALESCE(a.clinic_id::TEXT, 'NULL') || ', ' ||
            COALESCE(a.this_appointment_length::TEXT, 'NULL') || ', ' ||
            quote_literal(a.created_at::TEXT) || '::timestamptz, ' ||
            quote_literal(a.updated_at::TEXT) || '::timestamptz' ||
            ')',
            E',\n'
        ) || ';'
    INTO appt_insert
    FROM appointments a
    LEFT JOIN knumber_mapping km ON a.knumber = km.old_knumber
    WHERE a.appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
      AND a.appointmenttime <= CURRENT_DATE + INTERVAL '2 months'
      AND a.deleted_at IS NULL
    ORDER BY a.appointmenttime
    LIMIT 100;

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- APPOINTMENTS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', appt_insert;

    -- Cleanup
    DROP TABLE IF EXISTS knumber_mapping;
END $$;

-- ============================================================================
-- PART 6: VERIFICATION QUERIES
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- VERIFICATION QUERIES (run these in Testing Branch after import)';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', E'-- Check record counts:\nSELECT ''destinations'' as table_name, COUNT(*) as count FROM destinations\nUNION ALL SELECT ''users'', COUNT(*) FROM users\nUNION ALL SELECT ''drivers'', COUNT(*) FROM drivers\nUNION ALL SELECT ''clients'', COUNT(*) FROM clients\nUNION ALL SELECT ''appointments'', COUNT(*) FROM appointments;\n';
    RAISE NOTICE '%', E'-- Verify anonymization:\nSELECT knumber, firstname, lastname, phone, email FROM clients WHERE knumber != ''K7807878'' LIMIT 5;\n';
    RAISE NOTICE '%', E'-- Verify K7807878 NOT anonymized:\nSELECT knumber, firstname, lastname, phone, email FROM clients WHERE knumber = ''K7807878'';\n';
    RAISE NOTICE '%', E'-- Check clients with primary clinics:\nSELECT c.knumber, c.firstname, c.primary_clinic_id, d.name as clinic_name\nFROM clients c\nLEFT JOIN destinations d ON c.primary_clinic_id = d.id\nWHERE c.primary_clinic_id IS NOT NULL\nLIMIT 10;';
END $$;

-- ============================================================================
-- DONE!
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n========================================================================';
    RAISE NOTICE '%', '✅ COPY ALL THE OUTPUT ABOVE (from Messages tab)';
    RAISE NOTICE '%', 'Save to a file called "import-to-testing.sql"';
    RAISE NOTICE '%', 'Then run that file in Testing Branch Supabase SQL Editor';
    RAISE NOTICE '%', '========================================================================';
END $$;
