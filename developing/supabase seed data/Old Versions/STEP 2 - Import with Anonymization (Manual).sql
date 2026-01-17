-- ============================================================================
-- STEP 2: Import Production Data to Testing Branch with Anonymization
-- ============================================================================
-- Run this in TESTING BRANCH Supabase SQL Editor
-- After you've extracted data from production using STEP 1
-- ============================================================================

-- IMPORTANT: Fill in the placeholders below with your production data!

-- ============================================================================
-- CLEAR EXISTING DATA
-- ============================================================================
TRUNCATE TABLE appointments CASCADE;
TRUNCATE TABLE clients CASCADE;
TRUNCATE TABLE destinations CASCADE;
TRUNCATE TABLE drivers CASCADE;
TRUNCATE TABLE users CASCADE;

-- ============================================================================
-- 1. INSERT DESTINATIONS (copy as-is from production)
-- ============================================================================
-- TODO: Replace with your production destinations
-- Format: (id, name, address, city, province, postal_code, phone, notes, active, created_at, updated_at)

INSERT INTO destinations (id, name, address, city, province, postal_code, phone, notes, active, created_at, updated_at) VALUES
-- PASTE YOUR PRODUCTION DESTINATIONS HERE, ONE PER LINE
-- Example format:
-- (1, 'Halifax General Hospital', '1796 Summer Street', 'Halifax', 'NS', 'B3H 3A7', '902-473-2700', NULL, true, '2025-01-01'::timestamptz, '2025-01-01'::timestamptz),
-- (2, 'Dartmouth General', '325 Pleasant St', 'Dartmouth', 'NS', 'B2Y 4G8', '902-465-8300', NULL, true, '2025-01-01'::timestamptz, '2025-01-01'::timestamptz),
(1, 'Test Clinic Placeholder', '123 Test St', 'Halifax', 'NS', 'B3J 1A1', '902-555-0001', 'REPLACE WITH REAL DATA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Reset sequence
SELECT setval('destinations_id_seq', (SELECT MAX(id) FROM destinations));

-- ============================================================================
-- 2. INSERT USERS (copy as-is from production - only 13, 23, 30)
-- ============================================================================
-- TODO: Replace with your production users
-- Format: (id, username, email, password_hash, full_name, role, is_active, created_at, updated_at, ...)

INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at, updated_at) VALUES
-- PASTE YOUR PRODUCTION USERS HERE (id 13, 23, 30)
-- Example format:
-- (13, 'admin', 'admin@example.com', 'hash123', 'Admin User', 'admin', true, '2025-01-01'::timestamptz, '2025-01-01'::timestamptz),
(13, 'testuser1', 'test1@example.com', 'PLACEHOLDER', 'Test User 1', 'admin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(23, 'testuser2', 'test2@example.com', 'PLACEHOLDER', 'Test User 2', 'supervisor', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(30, 'testuser3', 'test3@example.com', 'PLACEHOLDER', 'Test User 3', 'booking_agent', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Reset sequence
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- ============================================================================
-- 3. INSERT DRIVER (copy as-is from production - only id 11)
-- ============================================================================
-- TODO: Replace with your production driver data

INSERT INTO drivers (id, name, first_name, last_name, email, phone, work_phone, active,
                     google_calendar_id, google_calendar_access_token, google_calendar_refresh_token,
                     google_calendar_connected, created_at, updated_at) VALUES
-- PASTE YOUR PRODUCTION DRIVER HERE (id 11)
-- Example format:
(11, 'Andrew Newton', 'Andrew', 'Newton', 'andrew@example.com', '902-760-0946', '902-760-0946', true,
 'google_cal_id_here', 'access_token_here', 'refresh_token_here', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Reset sequence
SELECT setval('drivers_id_seq', (SELECT MAX(id) FROM drivers));

-- ============================================================================
-- 4. SET K7807878 OPENPHONE REFERENCE DATA
-- ============================================================================
-- TODO: Fill in these values from your production K7807878 client

CREATE TEMP TABLE ref_openphone AS
SELECT
    'PASTE_OPENPHONE_CONTACT_ID_HERE'::TEXT as contact_id,
    'PASTE_OPENPHONE_SYNC_STATUS_HERE'::TEXT as sync_status,
    'PASTE_OPENPHONE_SYNC_DATE_HERE'::TIMESTAMPTZ as sync_date;

-- ============================================================================
-- 5. INSERT K7807878 CLIENT (copy as-is from production)
-- ============================================================================
-- TODO: Replace with your production K7807878 record

INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode,
                     notes, emergency_contact_name, emergency_contact_number, active, primary_clinic_id,
                     openphone_contact_id, openphone_sync_status, openphone_sync_date, created_at) VALUES
-- PASTE K7807878 DATA HERE (copy exactly as-is)
('K7807878', 'Andrew', 'Newton', '902-760-0946', 'andrew@example.com',
 '456 Test Ave', 'Dartmouth', 'NS', 'B2Y 4G8', 'Test client',
 'Emergency Contact', '902-760-0946', true, 1,
 'PASTE_CONTACT_ID', 'synced', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ============================================================================
-- 6. INSERT AND ANONYMIZE OTHER CLIENTS
-- ============================================================================
-- TODO: For each client from production (excluding K7807878), create an INSERT like this:

-- Template for each client:
-- Take the production data and modify:
-- - Keep: civicaddress, city, prov, postalcode, notes, driver_gender_requirement, preferred_driver,
--         mapaddress, active, appointment_length, primary_clinic_id, clinic_travel_times, status
-- - Change firstname to: TestFirstName1, TestFirstName2, etc.
-- - Change lastname to: TestLastName1, TestLastName2, etc.
-- - Change phone to: 902-760-0946
-- - Change email to: strugglebusca@gmail.com
-- - Change emergency_contact_name to: TestEmergencyContactName1, TestEmergencyContactName2, etc.
-- - Change emergency_contact_number to: 902-760-0946
-- - Use OpenPhone data from ref_openphone table

-- Example for first 3 clients:
INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode,
                     notes, emergency_contact_name, emergency_contact_number, driver_gender_requirement,
                     preferred_driver, mapaddress, active, appointment_length, primary_clinic_id,
                     openphone_contact_id, openphone_sync_status, openphone_sync_date, created_at) VALUES
-- Client 1 - PASTE PRODUCTION DATA BUT ANONYMIZE NAMES/CONTACT INFO
('K1234567', 'TestFirstName1', 'TestLastName1', '902-760-0946', 'strugglebusca@gmail.com',
 'PASTE_REAL_ADDRESS', 'PASTE_REAL_CITY', 'NS', 'PASTE_REAL_POSTAL',
 'PASTE_REAL_NOTES', 'TestEmergencyContactName1', '902-760-0946', 'PASTE_REAL_GENDER_REQ',
 NULL, 'PASTE_REAL_MAPADDRESS', true, 60, NULL,
 (SELECT contact_id FROM ref_openphone), (SELECT sync_status FROM ref_openphone), (SELECT sync_date FROM ref_openphone),
 CURRENT_TIMESTAMP),

-- Client 2 - REPEAT PATTERN
('K2345678', 'TestFirstName2', 'TestLastName2', '902-760-0946', 'strugglebusca@gmail.com',
 'PASTE_REAL_ADDRESS', 'PASTE_REAL_CITY', 'NS', 'PASTE_REAL_POSTAL',
 'PASTE_REAL_NOTES', 'TestEmergencyContactName2', '902-760-0946', 'PASTE_REAL_GENDER_REQ',
 NULL, 'PASTE_REAL_MAPADDRESS', true, 60, NULL,
 (SELECT contact_id FROM ref_openphone), (SELECT sync_status FROM ref_openphone), (SELECT sync_date FROM ref_openphone),
 CURRENT_TIMESTAMP);

-- ADD MORE CLIENTS HERE, ONE PER LINE
-- Remember to end each with a comma except the last one

-- ============================================================================
-- 7. INSERT APPOINTMENTS (with updated knumbers)
-- ============================================================================
-- TODO: For each appointment from production, create an INSERT
-- Make sure the knumber matches what you used above (including anonymized knumbers)

INSERT INTO appointments (knumber, appointmenttime, pickuptime, locationname, locationaddress,
                          notes, transittime, appointmentstatus, driver_assigned, driver_email,
                          clinic_id, this_appointment_length, created_at) VALUES
-- PASTE YOUR PRODUCTION APPOINTMENTS HERE
-- Remember to update knumbers to match your anonymized client knumbers above!
-- Example format:
-- ('K1234567', '2025-01-15 10:00:00+00', '2025-01-15 09:30:00+00', 'Halifax General', '1796 Summer St', 'Test', 30, 'scheduled', 11, 'andrew@example.com', 1, 60, CURRENT_TIMESTAMP),
('K0000001', CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day' - INTERVAL '30 minutes',
 'Test Clinic', '123 Test St', 'REPLACE WITH REAL DATA', 30, 'scheduled', 11, 'andrew@example.com', 1, 60, CURRENT_TIMESTAMP);

-- ADD MORE APPOINTMENTS HERE

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check counts
SELECT 'destinations' as table_name, COUNT(*) as count FROM destinations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments;

-- Check anonymization
SELECT knumber, firstname, lastname, phone, email, emergency_contact_number
FROM clients
WHERE knumber != 'K7807878'
LIMIT 5;

-- Should show:
-- - firstname: TestFirstName1, TestFirstName2, etc.
-- - lastname: TestLastName1, TestLastName2, etc.
-- - phone: 902-760-0946
-- - email: strugglebusca@gmail.com
-- - emergency_contact_number: 902-760-0946

-- Check K7807878 NOT anonymized
SELECT knumber, firstname, lastname, phone, email
FROM clients
WHERE knumber = 'K7807878';

-- Should show original Andrew Newton data

-- Check clients with primary clinics
SELECT
    c.knumber,
    c.firstname,
    c.primary_clinic_id,
    d.name as clinic_name
FROM clients c
LEFT JOIN destinations d ON c.primary_clinic_id = d.id
WHERE c.primary_clinic_id IS NOT NULL
LIMIT 10;

-- Clean up temp table
DROP TABLE IF EXISTS ref_openphone;

SELECT '✅ Data import complete! Verify the results above.' as status;
