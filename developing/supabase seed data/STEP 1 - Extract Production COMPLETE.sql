-- ============================================================================
-- SAFE READ-ONLY: Extract Production Data (COMPLETE - All Actual Columns)
-- ============================================================================
-- ✅ 100% READ-ONLY - NO DATA MODIFIED
-- ✅ Uses exact columns from production schema
-- ✅ Safe to run in PRODUCTION
-- ============================================================================

-- ============================================================================
-- PART 1: DESTINATIONS
-- Columns: id, name, address, city, province, postal_code, active, created_at
-- ============================================================================

DO $$
DECLARE
    dest_insert TEXT;
BEGIN
    SELECT
        'INSERT INTO destinations (id, name, address, city, province, postal_code, active, created_at) VALUES ' ||
        string_agg(
            '(' ||
            id::TEXT || ', ' ||
            quote_literal(name) || ', ' ||
            COALESCE(quote_literal(address), 'NULL') || ', ' ||
            COALESCE(quote_literal(city), 'NULL') || ', ' ||
            COALESCE(quote_literal(province), 'NULL') || ', ' ||
            COALESCE(quote_literal(postal_code), 'NULL') || ', ' ||
            COALESCE(active::TEXT, 'true') || ', ' ||
            quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
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
-- PART 2: USERS (only 13, 23, 30 - ALL 20 COLUMNS)
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
            quote_literal(full_name) || ', ' ||
            quote_literal(COALESCE(role, 'user')) || ', ' ||
            COALESCE(is_active::TEXT, 'true') || ', ' ||
            quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
            quote_literal(COALESCE(updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
            COALESCE(quote_literal(last_login::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(password_reset_token), 'NULL') || ', ' ||
            COALESCE(quote_literal(password_reset_expires::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(failed_login_attempts::TEXT, '0') || ', ' ||
            COALESCE(quote_literal(locked_until::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(last_password_change::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(status), '''active''') || ', ' ||
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
-- PART 3: DRIVER (only id 11 - ALL 22 COLUMNS)
-- ============================================================================

DO $$
DECLARE
    driver_insert TEXT;
BEGIN
    SELECT
        'INSERT INTO drivers (id, name, email, phone, google_calendar_id, preferred_calendar_type, active, weekly_hours, created_at, updated_at, gender, workload_preference, workload_percentage, is_male, first_name, last_name, google_calendar_access_token, google_calendar_refresh_token, google_calendar_connected, google_calendar_connected_at, google_calendar_calendar_id, work_phone) VALUES (' ||
        id::TEXT || ', ' ||
        quote_literal(name) || ', ' ||
        quote_literal(email) || ', ' ||
        COALESCE(quote_literal(phone), 'NULL') || ', ' ||
        COALESCE(quote_literal(google_calendar_id), 'NULL') || ', ' ||
        COALESCE(quote_literal(preferred_calendar_type), '''google''') || ', ' ||
        COALESCE(active::TEXT, 'true') || ', ' ||
        COALESCE(quote_literal(weekly_hours::TEXT), 'NULL') || ', ' ||
        quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamp, ' ||
        quote_literal(COALESCE(updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamp, ' ||
        COALESCE(quote_literal(gender), 'NULL') || ', ' ||
        COALESCE(quote_literal(workload_preference), '''normal''') || ', ' ||
        COALESCE(workload_percentage::TEXT, '100') || ', ' ||
        COALESCE(is_male::TEXT, 'false') || ', ' ||
        COALESCE(quote_literal(first_name), 'NULL') || ', ' ||
        COALESCE(quote_literal(last_name), 'NULL') || ', ' ||
        COALESCE(quote_literal(google_calendar_access_token), 'NULL') || ', ' ||
        COALESCE(quote_literal(google_calendar_refresh_token), 'NULL') || ', ' ||
        COALESCE(google_calendar_connected::TEXT, 'false') || ', ' ||
        COALESCE(quote_literal(google_calendar_connected_at::TEXT) || '::timestamp', 'NULL') || ', ' ||
        COALESCE(quote_literal(google_calendar_calendar_id), '''primary''') || ', ' ||
        COALESCE(quote_literal(work_phone), 'NULL') ||
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
-- PART 4: CLIENTS with AUTO-ANONYMIZATION (ALL ACTUAL COLUMNS)
-- ============================================================================

DO $$
DECLARE
    k7807878_insert TEXT;
    anonymized_inserts TEXT;
    ref_openphone_contact_id TEXT;
    ref_openphone_sync_status TEXT;
    ref_openphone_sync_date TIMESTAMPTZ;
BEGIN
    -- Get K7807878's OpenPhone data to reuse for all test clients
    SELECT
        c.openphone_contact_id,
        c.openphone_sync_status,
        c.openphone_sync_date
    INTO
        ref_openphone_contact_id,
        ref_openphone_sync_status,
        ref_openphone_sync_date
    FROM clients c
    WHERE c.knumber = 'K7807878';

    -- Insert K7807878 as-is (NOT anonymized)
    -- Columns: knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode,
    --          notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement,
    --          preferred_driver, mapaddress, active, appointment_length, openphone_contact_id,
    --          openphone_sync_status, openphone_sync_date, status, clinic_travel_times,
    --          secondary_civic_address, secondary_city, secondary_province, secondary_postal_code,
    --          secondary_address_notes, created_at (28 columns, NO updated_at)
    SELECT
        'INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement, preferred_driver, mapaddress, active, appointment_length, openphone_contact_id, openphone_sync_status, openphone_sync_date, status, clinic_travel_times, secondary_civic_address, secondary_city, secondary_province, secondary_postal_code, secondary_address_notes, created_at) VALUES (' ||
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
        COALESCE(active::TEXT, 'true') || ', ' ||
        COALESCE(appointment_length::TEXT, '120') || ', ' ||
        COALESCE(quote_literal(c.openphone_contact_id), 'NULL') || ', ' ||
        COALESCE(quote_literal(c.openphone_sync_status), 'NULL') || ', ' ||
        COALESCE(quote_literal(c.openphone_sync_date::TEXT) || '::timestamptz', 'NULL') || ', ' ||
        COALESCE(quote_literal(status), 'NULL') || ', ' ||
        COALESCE(quote_literal(clinic_travel_times::TEXT), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_civic_address), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_city), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_province), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_postal_code), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_address_notes), 'NULL') || ', ' ||
        quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
        ');'
    INTO k7807878_insert
    FROM clients c
    WHERE knumber = 'K7807878';

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- CLIENTS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', E'-- K7807878 (Andrew Newton - NOT anonymized)\n';
    RAISE NOTICE '%', k7807878_insert;

    -- Generate ANONYMIZED inserts for other clients (ALL COLUMNS)
    -- Use CTE to pre-calculate row numbers (can't use window functions inside string_agg)
    WITH numbered_clients AS (
        SELECT
            c.*,
            ROW_NUMBER() OVER (ORDER BY c.created_at) as row_num
        FROM clients c
        WHERE c.knumber != 'K7807878'
          AND c.active = true
        ORDER BY c.created_at
        LIMIT 50
    )
    SELECT
        E'\n-- Other clients (ANONYMIZED - K0000001, TestFirstName1, etc.)\n-- NOTE: primary_clinic_id will be NULL - set manually in Testing Branch if needed\n-- 28 columns total (NO updated_at in production schema)\nINSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement, preferred_driver, mapaddress, active, appointment_length, openphone_contact_id, openphone_sync_status, openphone_sync_date, status, clinic_travel_times, secondary_civic_address, secondary_city, secondary_province, secondary_postal_code, secondary_address_notes, created_at) VALUES\n' ||
        string_agg(
            '(' ||
            quote_literal('K' || LPAD(row_num::TEXT, 7, '0')) || ', ' ||  -- K0000001, K0000002, etc.
            quote_literal('TestFirstName' || row_num) || ', ' ||  -- TestFirstName1, etc.
            quote_literal('TestLastName' || row_num) || ', ' ||  -- TestLastName1, etc.
            '''902-760-0946'', ' ||  -- Anonymized phone
            '''strugglebusca@gmail.com'', ' ||  -- Anonymized email
            COALESCE(quote_literal(civicaddress), 'NULL') || ', ' ||  -- Keep real address for mapping
            COALESCE(quote_literal(city), 'NULL') || ', ' ||
            COALESCE(quote_literal(prov), 'NULL') || ', ' ||
            COALESCE(quote_literal(postalcode), 'NULL') || ', ' ||
            COALESCE(quote_literal(notes), 'NULL') || ', ' ||
            quote_literal('TestEmergencyContactName' || row_num) || ', ' ||  -- Anonymized
            '''902-760-0946'', ' ||  -- Anonymized emergency phone
            COALESCE(quote_literal(driver_gender_requirement), 'NULL') || ', ' ||  -- Keep
            COALESCE(preferred_driver::TEXT, 'NULL') || ', ' ||  -- Keep
            COALESCE(quote_literal(mapaddress), 'NULL') || ', ' ||  -- Keep
            COALESCE(active::TEXT, 'true') || ', ' ||
            COALESCE(appointment_length::TEXT, '120') || ', ' ||
            COALESCE(quote_literal(ref_openphone_contact_id), 'NULL') || ', ' ||  -- Use K7807878's data
            COALESCE(quote_literal(ref_openphone_sync_status), 'NULL') || ', ' ||
            COALESCE(quote_literal(ref_openphone_sync_date::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(status), 'NULL') || ', ' ||
            COALESCE(quote_literal(clinic_travel_times::TEXT), 'NULL') || ', ' ||  -- Keep
            COALESCE(quote_literal(secondary_civic_address), 'NULL') || ', ' ||  -- Keep
            COALESCE(quote_literal(secondary_city), 'NULL') || ', ' ||
            COALESCE(quote_literal(secondary_province), 'NULL') || ', ' ||
            COALESCE(quote_literal(secondary_postal_code), 'NULL') || ', ' ||
            COALESCE(quote_literal(secondary_address_notes), 'NULL') || ', ' ||
            quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
            ')',
            E',\n'
            ORDER BY row_num
        ) || ';'
    INTO anonymized_inserts
    FROM numbered_clients;

    RAISE NOTICE '%', E'\n';
    RAISE NOTICE '%', anonymized_inserts;
END $$;

-- ============================================================================
-- PART 5: APPOINTMENTS (with anonymized knumbers matching above)
-- ============================================================================

DO $$
DECLARE
    appt_insert TEXT;
BEGIN
    -- Create temp mapping of old knumbers → new anonymized knumbers
    CREATE TEMP TABLE IF NOT EXISTS knumber_mapping AS
    SELECT
        knumber as old_knumber,
        'K' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 7, '0') as new_knumber
    FROM clients
    WHERE knumber != 'K7807878'
      AND active = true
    ORDER BY created_at
    LIMIT 50;

    -- K7807878 stays as-is
    INSERT INTO knumber_mapping VALUES ('K7807878', 'K7807878');

    -- Generate appointment inserts with updated knumbers (ALL 51 COLUMNS)
    -- Use subquery to filter and order data before aggregation
    WITH filtered_appointments AS (
        SELECT
            a.*,
            COALESCE(km.new_knumber, a.knumber) as final_knumber
        FROM appointments a
        LEFT JOIN knumber_mapping km ON a.knumber = km.old_knumber
        WHERE a.appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
          AND a.appointmenttime <= CURRENT_DATE + INTERVAL '2 months'
          AND a.deleted_at IS NULL
        ORDER BY a.appointmenttime
        LIMIT 100
    )
    SELECT
        'INSERT INTO appointments (knumber, appointmenttime, pickuptime, locationname, locationaddress, notes, transittime, appointmentstatus, custom_rate, maptraveltime, google_maps_success, google_maps_error, is_existing, driver_assigned, driver_email, driver_calendar_event_id, client_notification_sent, driver_notification_sent, reminder_sent_client, reminder_sent_driver, notification_status, scheduling_notes, preferred_driver, tripdistance, clinic_id, this_appointment_length, google_calendar_last_synced, google_calendar_sync_error, "appointmentStatusUpdated", "dropOffTime", reminder_1h_sent_at, reminder_1h_error, driver_first_name, operation_status, invoice_status, deleted_at, cancelled_at, driver_paid_at, booking_agent_paid_at, invoice_created_at, invoice_sent_at, payment_received_at, cancelled_by, cancellation_reason, deleted_by, pickup_address, managed_by, managed_by_name, driver_instructions, created_at) VALUES ' ||
        string_agg(
            '(' ||
            quote_literal(final_knumber) || ', ' ||  -- Use anonymized knumber
            quote_literal(appointmenttime::TEXT) || '::timestamptz, ' ||
            COALESCE(quote_literal(pickuptime::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(locationname), 'NULL') || ', ' ||
            COALESCE(quote_literal(locationaddress), 'NULL') || ', ' ||
            COALESCE(quote_literal(notes), 'NULL') || ', ' ||
            COALESCE(transittime::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(appointmentstatus), 'NULL') || ', ' ||
            COALESCE(custom_rate::TEXT, 'NULL') || ', ' ||
            COALESCE(maptraveltime::TEXT, 'NULL') || ', ' ||
            COALESCE(google_maps_success::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(google_maps_error), 'NULL') || ', ' ||
            COALESCE(is_existing::TEXT, 'false') || ', ' ||
            COALESCE(driver_assigned::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(driver_email), 'NULL') || ', ' ||
            COALESCE(quote_literal(driver_calendar_event_id), 'NULL') || ', ' ||
            COALESCE(client_notification_sent::TEXT, 'false') || ', ' ||
            COALESCE(driver_notification_sent::TEXT, 'false') || ', ' ||
            COALESCE(reminder_sent_client::TEXT, 'false') || ', ' ||
            COALESCE(reminder_sent_driver::TEXT, 'false') || ', ' ||
            COALESCE(quote_literal(notification_status::TEXT), 'NULL') || ', ' ||
            COALESCE(quote_literal(scheduling_notes), 'NULL') || ', ' ||
            COALESCE(preferred_driver::TEXT, 'NULL') || ', ' ||
            COALESCE(tripdistance::TEXT, 'NULL') || ', ' ||
            COALESCE(clinic_id::TEXT, 'NULL') || ', ' ||
            COALESCE(this_appointment_length::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(google_calendar_last_synced::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(google_calendar_sync_error), 'NULL') || ', ' ||
            COALESCE(quote_literal("appointmentStatusUpdated"::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal("dropOffTime"::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(reminder_1h_sent_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(reminder_1h_error), 'NULL') || ', ' ||
            COALESCE(quote_literal(driver_first_name), 'NULL') || ', ' ||
            COALESCE(quote_literal(operation_status), 'NULL') || ', ' ||
            COALESCE(quote_literal(invoice_status), 'NULL') || ', ' ||
            COALESCE(quote_literal(deleted_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(cancelled_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(driver_paid_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(booking_agent_paid_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(invoice_created_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(invoice_sent_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(payment_received_at::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(cancelled_by::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(cancellation_reason), 'NULL') || ', ' ||
            COALESCE(deleted_by::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(pickup_address), 'NULL') || ', ' ||
            COALESCE(managed_by::TEXT, 'NULL') || ', ' ||
            COALESCE(quote_literal(managed_by_name), 'NULL') || ', ' ||
            COALESCE(quote_literal(driver_instructions), 'NULL') || ', ' ||
            quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
            ')',
            E',\n'
            ORDER BY appointmenttime
        ) || ';'
    INTO appt_insert
    FROM filtered_appointments;

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- APPOINTMENTS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', appt_insert;

    -- Cleanup
    DROP TABLE IF EXISTS knumber_mapping;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (to run in Testing Branch after import)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- VERIFICATION QUERIES (run in Testing Branch after import)';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', E'-- Check record counts:';
    RAISE NOTICE '%', E'SELECT ''destinations'' as table_name, COUNT(*) as count FROM destinations';
    RAISE NOTICE '%', E'UNION ALL SELECT ''users'', COUNT(*) FROM users';
    RAISE NOTICE '%', E'UNION ALL SELECT ''drivers'', COUNT(*) FROM drivers';
    RAISE NOTICE '%', E'UNION ALL SELECT ''clients'', COUNT(*) FROM clients';
    RAISE NOTICE '%', E'UNION ALL SELECT ''appointments'', COUNT(*) FROM appointments;\n';
    RAISE NOTICE '%', E'-- Verify anonymization:';
    RAISE NOTICE '%', E'SELECT knumber, firstname, lastname, phone, email FROM clients WHERE knumber != ''K7807878'' LIMIT 5;\n';
    RAISE NOTICE '%', E'-- Verify K7807878 NOT anonymized:';
    RAISE NOTICE '%', E'SELECT knumber, firstname, lastname, phone, email FROM clients WHERE knumber = ''K7807878'';\n';
    RAISE NOTICE '%', E'-- After import, you can manually assign primary_clinic_id values in Testing Branch:';
    RAISE NOTICE '%', E'-- UPDATE clients SET primary_clinic_id = 1 WHERE knumber = ''K0000001'';';
END $$;

-- ============================================================================
-- DONE!
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n========================================================================';
    RAISE NOTICE '%', '✅ READ-ONLY EXTRACTION COMPLETE - NO DATA WAS MODIFIED';
    RAISE NOTICE '%', '========================================================================';
    RAISE NOTICE '%', E'\nNEXT STEPS:';
    RAISE NOTICE '%', '1. Switch to the Messages tab above (not Results tab)';
    RAISE NOTICE '%', '2. Copy ALL the SQL output (starts with "-- DESTINATIONS")';
    RAISE NOTICE '%', '3. Save to a file called "import-to-testing.sql"';
    RAISE NOTICE '%', '4. Open Testing Branch Supabase SQL Editor';
    RAISE NOTICE '%', '5. Run: TRUNCATE TABLE appointments, clients, destinations, drivers, users CASCADE;';
    RAISE NOTICE '%', '6. Paste and run your "import-to-testing.sql" file';
    RAISE NOTICE '%', '7. Run verification queries to confirm';
    RAISE NOTICE '%', '8. (Optional) Manually assign primary_clinic_id values to test clients';
    RAISE NOTICE '%', '========================================================================';
END $$;
