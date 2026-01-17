-- RRTS Transport Admin Portal - Copy Production Data to Testing Branch
-- Generated: 2025-11-09
-- Purpose: Copy production data with anonymization for testing
--
-- INSTRUCTIONS:
-- 1. This script must be run in TWO PARTS
-- 2. PART 1: Run in PRODUCTION Supabase to export data
-- 3. PART 2: Run in TESTING BRANCH Supabase to import data
--
-- WARNING: This script will DELETE all existing data in Testing Branch tables!
-- Make sure you're running this in the correct database!

-- ============================================================================
-- PART 1: EXPORT FROM PRODUCTION (Run in Production Supabase)
-- ============================================================================
-- Copy the output of these queries and use them in PART 2

-- ============================================================================
-- PART 2: IMPORT TO TESTING BRANCH (Run in Testing Branch Supabase)
-- ============================================================================

-- Clear existing test data
TRUNCATE TABLE driver_time_off CASCADE;
TRUNCATE TABLE appointments CASCADE;
TRUNCATE TABLE clients CASCADE;
TRUNCATE TABLE destinations CASCADE;
TRUNCATE TABLE drivers CASCADE;
TRUNCATE TABLE users CASCADE;

-- ============================================================================
-- 1. COPY DESTINATIONS (all records, no changes)
-- ============================================================================

-- TODO: Replace this with actual production data
-- Get from production: SELECT * FROM destinations ORDER BY id;

INSERT INTO destinations (id, name, address, city, province, postal_code, phone, notes, active, created_at, updated_at)
VALUES
-- PASTE PRODUCTION DESTINATIONS DATA HERE
-- Example format:
-- (1, 'Halifax General Hospital', '1796 Summer Street', 'Halifax', 'NS', 'B3H 3A7', '902-473-2700', NULL, true, '2025-01-01'::timestamptz, '2025-01-01'::timestamptz),
(1, 'Test Clinic A', '123 Test St', 'Halifax', 'NS', 'B3J 1A1', '902-555-0001', 'Test clinic', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(2, 'Test Clinic B', '456 Test Ave', 'Dartmouth', 'NS', 'B2Y 4G8', '902-555-0002', 'Test clinic', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence for destinations
SELECT setval('destinations_id_seq', (SELECT MAX(id) FROM destinations));

-- ============================================================================
-- 2. COPY USERS (only id 13, 23, and 30)
-- ============================================================================

-- TODO: Replace this with actual production data
-- Get from production: SELECT * FROM users WHERE id IN (13, 23, 30) ORDER BY id;

INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at, updated_at,
                   last_login, password_reset_token, password_reset_expires, failed_login_attempts,
                   locked_until, last_password_change, status, must_change_password, last_activity,
                   password_reset_attempts, password_reset_last_attempt)
VALUES
-- PASTE PRODUCTION USER DATA HERE (only id 13, 23, 30)
-- Example format:
-- (13, 'testuser1', 'test1@example.com', 'hash...', 'Test User 1', 'admin', true, '2025-01-01'::timestamptz, '2025-01-01'::timestamptz, NULL, NULL, NULL, 0, NULL, NULL, NULL, false, NULL, 0, NULL),
(13, 'testadmin', 'admin@test.com', 'placeholder_hash', 'Test Admin', 'admin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL, 0, NULL, NULL, 'active', false, NULL, 0, NULL),
(23, 'testsupervisor', 'supervisor@test.com', 'placeholder_hash', 'Test Supervisor', 'supervisor', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL, 0, NULL, NULL, 'active', false, NULL, 0, NULL),
(30, 'testbooking', 'booking@test.com', 'placeholder_hash', 'Test Booking Agent', 'booking_agent', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL, 0, NULL, NULL, 'active', false, NULL, 0, NULL)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence for users
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ============================================================================
-- 3. COPY DRIVERS (only driver id 11 - Andrew Newton)
-- ============================================================================

-- TODO: Replace this with actual production data
-- Get from production: SELECT * FROM drivers WHERE id = 11;

INSERT INTO drivers (id, name, email, phone, google_calendar_id, preferred_calendar_type, active,
                     weekly_hours, created_at, updated_at, gender, workload_preference, workload_percentage,
                     is_male, first_name, last_name, google_calendar_access_token, google_calendar_refresh_token,
                     google_calendar_connected, google_calendar_connected_at, google_calendar_calendar_id, work_phone)
VALUES
-- PASTE PRODUCTION DRIVER DATA HERE (only id 11)
-- Example format:
(11, 'Andrew Newton', 'andrew@example.com', '902-760-0946', 'calendar_id_here', 'google', true,
 '{"monday": "9-5", "tuesday": "9-5"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'male', 'full_time', 100,
 true, 'Andrew', 'Newton', 'access_token_here', 'refresh_token_here', true, CURRENT_TIMESTAMP, 'calendar_id_here', '902-760-0946')
ON CONFLICT (id) DO NOTHING;

-- Reset sequence for drivers
SELECT setval('drivers_id_seq', (SELECT MAX(id) FROM drivers));

-- ============================================================================
-- 4. COPY CLIENTS (with anonymization)
-- ============================================================================

-- First, create a temporary table to store the mapping between old and new knumbers
CREATE TEMP TABLE client_knumber_mapping (
    old_knumber TEXT,
    new_knumber TEXT,
    client_id UUID
);

-- TODO: Get reference data from production for K7807878
-- Get from production: SELECT openphone_contact_id, openphone_sync_status, openphone_sync_date FROM clients WHERE knumber = 'K7807878';

-- Store reference OpenPhone data from K7807878 (Andrew Newton - test-safe client)
-- Replace these values with actual production data
CREATE TEMP TABLE reference_openphone AS
SELECT
    'contact_id_from_K7807878'::TEXT as ref_contact_id,
    'synced'::TEXT as ref_sync_status,
    CURRENT_TIMESTAMP as ref_sync_date;

-- TODO: Replace this with actual production data
-- Get from production:
-- SELECT * FROM clients
-- ORDER BY created_at
-- LIMIT 50;  -- Adjust limit as needed

-- Generate anonymized client data
-- IMPORTANT: Replace the VALUES below with actual production data
WITH production_clients AS (
    SELECT * FROM (VALUES
        -- PASTE PRODUCTION CLIENT DATA HERE
        -- Format: (id, created_at, knumber, phone, email, firstname, lastname, civicaddress, city, prov, postalcode,
        --          notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement, preferred_driver,
        --          mapaddress, active, appointment_length, openphone_contact_id, openphone_sync_status, openphone_sync_date,
        --          status, clinic_travel_times, secondary_civic_address, secondary_city, secondary_province,
        --          secondary_postal_code, secondary_address_notes, primary_clinic_id)

        -- Example placeholder - REPLACE WITH REAL DATA:
        (gen_random_uuid(), CURRENT_TIMESTAMP, 'K1234567', '902-555-0001', 'old@example.com', 'John', 'Doe',
         '123 Main St', 'Halifax', 'NS', 'B3H 1A1', 'Some notes', 'Jane Doe', '902-555-0002', 'no_preference',
         NULL, '123 Main St, Halifax, NS', true, 60, 'old_contact_id', 'synced', CURRENT_TIMESTAMP,
         'active', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        (gen_random_uuid(), CURRENT_TIMESTAMP, 'K7807878', '902-760-0946', 'andrew@example.com', 'Andrew', 'Newton',
         '456 Test Ave', 'Dartmouth', 'NS', 'B2Y 4G8', 'Test client', 'Emergency Contact', '902-760-0946', 'no_preference',
         11, '456 Test Ave, Dartmouth, NS', true, 60, 'contact_id_from_K7807878', 'synced', CURRENT_TIMESTAMP,
         'active', NULL, NULL, NULL, NULL, NULL, NULL, 1)
    ) AS t(id, created_at, knumber, phone, email, firstname, lastname, civicaddress, city, prov, postalcode,
           notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement, preferred_driver,
           mapaddress, active, appointment_length, openphone_contact_id, openphone_sync_status, openphone_sync_date,
           status, clinic_travel_times, secondary_civic_address, secondary_city, secondary_province,
           secondary_postal_code, secondary_address_notes, primary_clinic_id)
),
numbered_clients AS (
    SELECT
        *,
        ROW_NUMBER() OVER (ORDER BY created_at) as row_num
    FROM production_clients
    WHERE knumber != 'K7807878'  -- Exclude Andrew Newton, we'll add him separately
),
anonymized_clients AS (
    SELECT
        gen_random_uuid() as id,  -- Generate new UUID
        created_at,
        CASE
            WHEN knumber = 'K7807878' THEN knumber  -- Keep Andrew Newton's knumber
            ELSE 'K' || LPAD(row_num::TEXT, 7, '0')  -- K0000001, K0000002, etc.
        END as new_knumber,
        knumber as old_knumber,  -- Keep for mapping
        '902-760-0946' as phone,
        'strugglebusca@gmail.com' as email,
        'TestFirstName' || row_num as firstname,
        'TestLastName' || row_num as lastname,
        civicaddress,  -- Keep original address
        city,
        prov,
        postalcode,
        notes,
        'TestEmergencyContactName' || row_num as emergency_contact_name,
        '902-760-0946' as emergency_contact_number,
        driver_gender_requirement,
        preferred_driver,
        mapaddress,
        active,
        appointment_length,
        (SELECT ref_contact_id FROM reference_openphone) as openphone_contact_id,
        (SELECT ref_sync_status FROM reference_openphone) as openphone_sync_status,
        (SELECT ref_sync_date FROM reference_openphone) as openphone_sync_date,
        status,
        clinic_travel_times,
        secondary_civic_address,
        secondary_city,
        secondary_province,
        secondary_postal_code,
        secondary_address_notes,
        primary_clinic_id
    FROM numbered_clients
)
INSERT INTO clients (id, created_at, knumber, phone, email, firstname, lastname, civicaddress, city, prov,
                     postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement,
                     preferred_driver, mapaddress, active, appointment_length, openphone_contact_id,
                     openphone_sync_status, openphone_sync_date, status, clinic_travel_times,
                     secondary_civic_address, secondary_city, secondary_province, secondary_postal_code,
                     secondary_address_notes, primary_clinic_id)
SELECT
    id, created_at, new_knumber, phone, email, firstname, lastname, civicaddress, city, prov,
    postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement,
    preferred_driver, mapaddress, active, appointment_length, openphone_contact_id,
    openphone_sync_status, openphone_sync_date, status, clinic_travel_times,
    secondary_civic_address, secondary_city, secondary_province, secondary_postal_code,
    secondary_address_notes, primary_clinic_id
FROM anonymized_clients
RETURNING id, knumber;

-- Store the knumber mapping for appointments
INSERT INTO client_knumber_mapping (old_knumber, new_knumber, client_id)
SELECT
    nc.knumber as old_knumber,
    CASE
        WHEN nc.knumber = 'K7807878' THEN nc.knumber
        ELSE 'K' || LPAD(nc.row_num::TEXT, 7, '0')
    END as new_knumber,
    gen_random_uuid() as client_id
FROM numbered_clients nc;

-- Add K7807878 (Andrew Newton) as-is
-- TODO: Replace with actual production data
-- Get from production: SELECT * FROM clients WHERE knumber = 'K7807878';

INSERT INTO clients (id, created_at, knumber, phone, email, firstname, lastname, civicaddress, city, prov,
                     postalcode, notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement,
                     preferred_driver, mapaddress, active, appointment_length, openphone_contact_id,
                     openphone_sync_status, openphone_sync_date, status, clinic_travel_times,
                     secondary_civic_address, secondary_city, secondary_province, secondary_postal_code,
                     secondary_address_notes, primary_clinic_id)
VALUES
-- PASTE K7807878 PRODUCTION DATA HERE
(gen_random_uuid(), CURRENT_TIMESTAMP, 'K7807878', '902-760-0946', 'andrew@example.com', 'Andrew', 'Newton',
 '456 Test Ave', 'Dartmouth', 'NS', 'B2Y 4G8', 'Test client', 'Emergency Contact', '902-760-0946', 'no_preference',
 11, '456 Test Ave, Dartmouth, NS', true, 60, 'contact_id_from_K7807878', 'synced', CURRENT_TIMESTAMP,
 'active', NULL, NULL, NULL, NULL, NULL, NULL, 1)
ON CONFLICT (knumber) DO NOTHING;

-- ============================================================================
-- 5. COPY APPOINTMENTS (last month + next month, with knumber updates)
-- ============================================================================

-- TODO: Replace this with actual production data
-- Get from production:
-- SELECT * FROM appointments
-- WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
--   AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
-- ORDER BY appointmenttime;

WITH production_appointments AS (
    SELECT * FROM (VALUES
        -- PASTE PRODUCTION APPOINTMENT DATA HERE (filtered by date range)
        -- Format: (id, created_at, knumber, appointmenttime, pickuptime, locationname, locationaddress,
        --          notes, transittime, appointmentstatus, custom_rate, maptraveltime, google_maps_success,
        --          google_maps_error, is_existing, driver_assigned, driver_email, driver_calendar_event_id,
        --          client_notification_sent, driver_notification_sent, reminder_sent_client, reminder_sent_driver,
        --          notification_status, scheduling_notes, preferred_driver, tripdistance, clinic_id,
        --          this_appointment_length, google_calendar_last_synced, google_calendar_sync_error,
        --          appointmentStatusUpdated, dropOffTime, reminder_1h_sent_at, reminder_1h_error,
        --          driver_first_name, operation_status, invoice_status, deleted_at, cancelled_at,
        --          driver_paid_at, booking_agent_paid_at, invoice_created_at, invoice_sent_at,
        --          payment_received_at, cancelled_by, cancellation_reason, deleted_by, pickup_address,
        --          managed_by, managed_by_name, driver_instructions)

        -- Example placeholder - REPLACE WITH REAL DATA:
        (gen_random_uuid(), CURRENT_TIMESTAMP, 'K1234567', CURRENT_TIMESTAMP + INTERVAL '1 day',
         CURRENT_TIMESTAMP + INTERVAL '1 day' - INTERVAL '30 minutes', 'Test Clinic', '123 Clinic St',
         'Test appointment', 30, 'scheduled', NULL, 25, true, NULL, false, 11, 'andrew@example.com', 'cal_event_123',
         false, false, false, false, NULL, NULL, NULL, 10.5, 1, 60, NULL, NULL, NULL, NULL, NULL, NULL,
         'Andrew', 'pending', 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         NULL, NULL, NULL, NULL)
    ) AS t(id, created_at, knumber, appointmenttime, pickuptime, locationname, locationaddress,
           notes, transittime, appointmentstatus, custom_rate, maptraveltime, google_maps_success,
           google_maps_error, is_existing, driver_assigned, driver_email, driver_calendar_event_id,
           client_notification_sent, driver_notification_sent, reminder_sent_client, reminder_sent_driver,
           notification_status, scheduling_notes, preferred_driver, tripdistance, clinic_id,
           this_appointment_length, google_calendar_last_synced, google_calendar_sync_error,
           "appointmentStatusUpdated", "dropOffTime", reminder_1h_sent_at, reminder_1h_error,
           driver_first_name, operation_status, invoice_status, deleted_at, cancelled_at,
           driver_paid_at, booking_agent_paid_at, invoice_created_at, invoice_sent_at,
           payment_received_at, cancelled_by, cancellation_reason, deleted_by, pickup_address,
           managed_by, managed_by_name, driver_instructions)
)
INSERT INTO appointments (id, created_at, knumber, appointmenttime, pickuptime, locationname, locationaddress,
                          notes, transittime, appointmentstatus, custom_rate, maptraveltime, google_maps_success,
                          google_maps_error, is_existing, driver_assigned, driver_email, driver_calendar_event_id,
                          client_notification_sent, driver_notification_sent, reminder_sent_client, reminder_sent_driver,
                          notification_status, scheduling_notes, preferred_driver, tripdistance, clinic_id,
                          this_appointment_length, google_calendar_last_synced, google_calendar_sync_error,
                          "appointmentStatusUpdated", "dropOffTime", reminder_1h_sent_at, reminder_1h_error,
                          driver_first_name, operation_status, invoice_status, deleted_at, cancelled_at,
                          driver_paid_at, booking_agent_paid_at, invoice_created_at, invoice_sent_at,
                          payment_received_at, cancelled_by, cancellation_reason, deleted_by, pickup_address,
                          managed_by, managed_by_name, driver_instructions)
SELECT
    gen_random_uuid() as id,  -- Generate new UUID
    pa.created_at,
    COALESCE(ckm.new_knumber, pa.knumber) as knumber,  -- Update knumber using mapping
    pa.appointmenttime,
    pa.pickuptime,
    pa.locationname,
    pa.locationaddress,
    pa.notes,
    pa.transittime,
    pa.appointmentstatus,
    pa.custom_rate,
    pa.maptraveltime,
    pa.google_maps_success,
    pa.google_maps_error,
    pa.is_existing,
    pa.driver_assigned,
    pa.driver_email,
    pa.driver_calendar_event_id,
    pa.client_notification_sent,
    pa.driver_notification_sent,
    pa.reminder_sent_client,
    pa.reminder_sent_driver,
    pa.notification_status,
    pa.scheduling_notes,
    pa.preferred_driver,
    pa.tripdistance,
    pa.clinic_id,
    pa.this_appointment_length,
    pa.google_calendar_last_synced,
    pa.google_calendar_sync_error,
    pa."appointmentStatusUpdated",
    pa."dropOffTime",
    pa.reminder_1h_sent_at,
    pa.reminder_1h_error,
    pa.driver_first_name,
    pa.operation_status,
    pa.invoice_status,
    pa.deleted_at,
    pa.cancelled_at,
    pa.driver_paid_at,
    pa.booking_agent_paid_at,
    pa.invoice_created_at,
    pa.invoice_sent_at,
    pa.payment_received_at,
    pa.cancelled_by,
    pa.cancellation_reason,
    pa.deleted_by,
    pa.pickup_address,
    pa.managed_by,
    pa.managed_by_name,
    pa.driver_instructions
FROM production_appointments pa
LEFT JOIN client_knumber_mapping ckm ON pa.knumber = ckm.old_knumber;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check record counts
SELECT 'destinations' as table_name, COUNT(*) as record_count FROM destinations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments;

-- Verify client anonymization
SELECT
    knumber,
    firstname,
    lastname,
    phone,
    email,
    emergency_contact_name,
    emergency_contact_number,
    openphone_contact_id,
    openphone_sync_status
FROM clients
ORDER BY knumber
LIMIT 10;

-- Verify appointments date range
SELECT
    MIN(appointmenttime) as earliest_appointment,
    MAX(appointmenttime) as latest_appointment,
    COUNT(*) as total_appointments
FROM appointments;

-- Verify knumber updates in appointments
SELECT
    a.knumber,
    c.firstname,
    c.lastname,
    COUNT(*) as appointment_count
FROM appointments a
JOIN clients c ON a.knumber = c.knumber
GROUP BY a.knumber, c.firstname, c.lastname
ORDER BY a.knumber;

-- Clean up temporary tables
DROP TABLE IF EXISTS client_knumber_mapping;
DROP TABLE IF EXISTS reference_openphone;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================
SELECT '✅ Data import complete! Please review verification queries above.' as status;
