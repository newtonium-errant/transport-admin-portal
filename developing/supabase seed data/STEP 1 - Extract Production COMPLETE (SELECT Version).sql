-- ============================================================================
-- SAFE READ-ONLY: Extract Production Data (SELECT VERSION - Shows in Results)
-- ============================================================================
-- ✅ 100% READ-ONLY - NO DATA MODIFIED
-- ✅ Uses exact column names from your production database
-- ✅ Safe to run in PRODUCTION
-- ✅ Output appears in RESULTS tab (not Messages)
-- ============================================================================
-- INSTRUCTIONS:
-- 1. Run this entire script in PRODUCTION Supabase SQL Editor
-- 2. Results will appear in the RESULTS tab
-- 3. Copy each section's SQL output
-- 4. Paste all sections into a new file: import-to-testing.sql
-- 5. Run import-to-testing.sql in TESTING BRANCH Supabase
-- ============================================================================

-- ============================================================================
-- PART 1: DESTINATIONS
-- ============================================================================
SELECT '-- ============================================================================' as sql_output
UNION ALL SELECT '-- DESTINATIONS'
UNION ALL SELECT '-- ============================================================================'
UNION ALL
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
FROM destinations;

-- ============================================================================
-- PART 2: USERS (only 13, 23, 30)
-- ============================================================================
SELECT '' as sql_output
UNION ALL SELECT '-- ============================================================================'
UNION ALL SELECT '-- USERS'
UNION ALL SELECT '-- ============================================================================'
UNION ALL
SELECT
    'INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at, updated_at) VALUES ' ||
    string_agg(
        '(' ||
        id::TEXT || ', ' ||
        quote_literal(username) || ', ' ||
        quote_literal(email) || ', ' ||
        quote_literal(password_hash) || ', ' ||
        COALESCE(quote_literal(full_name), '''User ' || id || '''') || ', ' ||
        quote_literal(COALESCE(role, 'user')) || ', ' ||
        COALESCE(is_active::TEXT, 'true') || ', ' ||
        quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
        quote_literal(COALESCE(updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
        ')',
        E',\n'
        ORDER BY id
    ) || E';\nSELECT setval(''users_id_seq'', (SELECT MAX(id) FROM users));\n'
FROM users
WHERE id IN (13, 23, 30);

-- ============================================================================
-- PART 3: DRIVER (only id 11)
-- ============================================================================
SELECT '' as sql_output
UNION ALL SELECT '-- ============================================================================'
UNION ALL SELECT '-- DRIVER'
UNION ALL SELECT '-- ============================================================================'
UNION ALL
SELECT
    'INSERT INTO drivers (id, name, first_name, last_name, email, phone, active, created_at, updated_at) VALUES (' ||
    id::TEXT || ', ' ||
    quote_literal(name) || ', ' ||
    COALESCE(quote_literal(first_name), 'NULL') || ', ' ||
    COALESCE(quote_literal(last_name), 'NULL') || ', ' ||
    COALESCE(quote_literal(email), 'NULL') || ', ' ||
    COALESCE(quote_literal(phone), 'NULL') || ', ' ||
    COALESCE(active::TEXT, 'true') || ', ' ||
    quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
    quote_literal(COALESCE(updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
    E');\nSELECT setval(''drivers_id_seq'', (SELECT MAX(id) FROM drivers));\n'
FROM drivers
WHERE id = 11;

-- ============================================================================
-- PART 4: CLIENTS - K7807878 (NOT ANONYMIZED)
-- ============================================================================
SELECT '' as sql_output
UNION ALL SELECT '-- ============================================================================'
UNION ALL SELECT '-- CLIENTS - K7807878 (Andrew Newton - NOT anonymized)'
UNION ALL SELECT '-- ============================================================================'
UNION ALL
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
    COALESCE(quote_literal(openphone_contact_id), 'NULL') || ', ' ||
    COALESCE(quote_literal(openphone_sync_status), 'NULL') || ', ' ||
    COALESCE(quote_literal(openphone_sync_date::TEXT) || '::timestamptz', 'NULL') || ', ' ||
    COALESCE(quote_literal(status), 'NULL') || ', ' ||
    COALESCE(quote_literal(clinic_travel_times::TEXT), 'NULL') || ', ' ||
    COALESCE(quote_literal(secondary_civic_address), 'NULL') || ', ' ||
    COALESCE(quote_literal(secondary_city), 'NULL') || ', ' ||
    COALESCE(quote_literal(secondary_province), 'NULL') || ', ' ||
    COALESCE(quote_literal(secondary_postal_code), 'NULL') || ', ' ||
    COALESCE(quote_literal(secondary_address_notes), 'NULL') || ', ' ||
    quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
    ');'
FROM clients
WHERE knumber = 'K7807878';

-- ============================================================================
-- PART 5: CLIENTS - ANONYMIZED (50 clients)
-- ============================================================================
-- NOTE: This will be a long result - you may need to scroll or increase result limit
SELECT '' as sql_output
UNION ALL SELECT '-- ============================================================================'
UNION ALL SELECT '-- CLIENTS - ANONYMIZED (K0000001, TestFirstName1, etc.)'
UNION ALL SELECT '-- ============================================================================'
UNION ALL
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
    'INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement, preferred_driver, mapaddress, active, appointment_length, openphone_contact_id, openphone_sync_status, openphone_sync_date, status, clinic_travel_times, secondary_civic_address, secondary_city, secondary_province, secondary_postal_code, secondary_address_notes, created_at) VALUES ' ||
    string_agg(
        '(' ||
        quote_literal('K' || LPAD(row_num::TEXT, 7, '0')) || ', ' ||
        quote_literal('TestFirstName' || row_num) || ', ' ||
        quote_literal('TestLastName' || row_num) || ', ' ||
        '''902-760-0946'', ' ||
        '''strugglebusca@gmail.com'', ' ||
        COALESCE(quote_literal(civicaddress), 'NULL') || ', ' ||
        COALESCE(quote_literal(city), 'NULL') || ', ' ||
        COALESCE(quote_literal(prov), 'NULL') || ', ' ||
        COALESCE(quote_literal(postalcode), 'NULL') || ', ' ||
        COALESCE(quote_literal(notes), 'NULL') || ', ' ||
        quote_literal('TestEmergencyContactName' || row_num) || ', ' ||
        '''902-760-0946'', ' ||
        COALESCE(quote_literal(driver_gender_requirement), 'NULL') || ', ' ||
        COALESCE(preferred_driver::TEXT, 'NULL') || ', ' ||
        COALESCE(quote_literal(mapaddress), 'NULL') || ', ' ||
        COALESCE(active::TEXT, 'true') || ', ' ||
        COALESCE(appointment_length::TEXT, '120') || ', ' ||
        COALESCE(quote_literal(openphone_contact_id), 'NULL') || ', ' ||
        COALESCE(quote_literal(openphone_sync_status), 'NULL') || ', ' ||
        COALESCE(quote_literal(openphone_sync_date::TEXT) || '::timestamptz', 'NULL') || ', ' ||
        COALESCE(quote_literal(status), 'NULL') || ', ' ||
        COALESCE(quote_literal(clinic_travel_times::TEXT), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_civic_address), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_city), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_province), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_postal_code), 'NULL') || ', ' ||
        COALESCE(quote_literal(secondary_address_notes), 'NULL') || ', ' ||
        quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
        ')',
        E',\n'
        ORDER BY row_num
    ) || ';'
FROM numbered_clients;

-- ============================================================================
-- PART 6: APPOINTMENTS
-- ============================================================================
SELECT '' as sql_output
UNION ALL SELECT '-- ============================================================================'
UNION ALL SELECT '-- APPOINTMENTS'
UNION ALL SELECT '-- ============================================================================'
UNION ALL
WITH knumber_mapping AS (
    SELECT
        knumber as old_knumber,
        'K' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 7, '0') as new_knumber
    FROM clients
    WHERE knumber != 'K7807878'
      AND active = true
    ORDER BY created_at
    LIMIT 50
    UNION ALL
    SELECT 'K7807878', 'K7807878'
),
filtered_appointments AS (
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
        quote_literal(final_knumber) || ', ' ||
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
FROM filtered_appointments;

-- ============================================================================
-- DONE! Copy all results above to import-to-testing.sql
-- ============================================================================
SELECT '' as sql_output
UNION ALL SELECT '-- ============================================================================'
UNION ALL SELECT '-- ✅ EXTRACTION COMPLETE'
UNION ALL SELECT '-- ============================================================================'
UNION ALL SELECT '-- Next Steps:'
UNION ALL SELECT '-- 1. Copy ALL results from above (scroll up to -- DESTINATIONS)'
UNION ALL SELECT '-- 2. Save to a file: import-to-testing.sql'
UNION ALL SELECT '-- 3. Open Testing Branch Supabase SQL Editor'
UNION ALL SELECT '-- 4. Paste and run import-to-testing.sql'
UNION ALL SELECT '-- 5. Then run: ADD - clients updated_at column.sql'
UNION ALL SELECT '-- ============================================================================';
