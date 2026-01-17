-- ============================================================================
-- QUICK TEST DATA - No Production Data Needed!
-- ============================================================================
-- Run this in TESTING BRANCH Supabase SQL Editor
-- This adds minimal test data so you can start testing immediately
-- No need to extract from production!
-- ============================================================================

-- ============================================================================
-- 1. ADD TEST DESTINATIONS (Clinics)
-- ============================================================================
INSERT INTO destinations (name, address, city, province, postal_code, phone, active) VALUES
('Halifax General Hospital', '1796 Summer Street', 'Halifax', 'NS', 'B3H 3A7', '902-473-2700', true),
('Dartmouth General Hospital', '325 Pleasant Street', 'Dartmouth', 'NS', 'B2Y 4G8', '902-465-8300', true),
('QEII Health Sciences Centre', '1276 South Park Street', 'Halifax', 'NS', 'B3H 2Y9', '902-473-2700', true),
('IWK Health Centre', '5980 University Avenue', 'Halifax', 'NS', 'B3K 6R8', '902-470-8888', true),
('Test Clinic A', '123 Test Street', 'Halifax', 'NS', 'B3J 1A1', '902-555-0001', true),
('Test Clinic B', '456 Test Avenue', 'Dartmouth', 'NS', 'B2Y 1A1', '902-555-0002', true);

-- ============================================================================
-- 2. ADD TEST USERS
-- ============================================================================
-- Note: Use bcrypt or PBKDF2 to hash passwords in production
-- These are placeholder hashes - you'll need to update with real hashed passwords
INSERT INTO users (id, username, email, password_hash, full_name, role, is_active, created_at) VALUES
(13, 'testadmin', 'admin@test.rrts.com', 'PLACEHOLDER_HASH_UPDATE_THIS', 'Test Admin', 'admin', true, CURRENT_TIMESTAMP),
(23, 'testsupervisor', 'supervisor@test.rrts.com', 'PLACEHOLDER_HASH_UPDATE_THIS', 'Test Supervisor', 'supervisor', true, CURRENT_TIMESTAMP),
(30, 'testbooking', 'booking@test.rrts.com', 'PLACEHOLDER_HASH_UPDATE_THIS', 'Test Booking Agent', 'booking_agent', true, CURRENT_TIMESTAMP);

-- Update sequence
SELECT setval('users_id_seq', 100);

-- ============================================================================
-- 3. ADD TEST DRIVER (Andrew Newton - test driver)
-- ============================================================================
INSERT INTO drivers (id, name, first_name, last_name, email, phone, active, created_at) VALUES
(11, 'Andrew Newton', 'Andrew', 'Newton', 'andrew@test.rrts.com', '902-760-0946', true, CURRENT_TIMESTAMP);

-- Update sequence
SELECT setval('drivers_id_seq', 20);

-- ============================================================================
-- 4. ADD TEST CLIENTS
-- ============================================================================

-- K7807878 - Special test client (Andrew Newton - test-safe data)
INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode,
                     emergency_contact_name, emergency_contact_number, active, primary_clinic_id, created_at) VALUES
('K7807878', 'Andrew', 'Newton', '902-760-0946', 'andrew@test.rrts.com',
 '456 Test Avenue', 'Dartmouth', 'NS', 'B2Y 4G8',
 'Emergency Contact', '902-760-0946', true, 1, CURRENT_TIMESTAMP);

-- Add 10 more test clients with Primary Clinic assignments
INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode,
                     emergency_contact_name, emergency_contact_number, active, primary_clinic_id, created_at) VALUES
('K0000001', 'TestFirstName1', 'TestLastName1', '902-760-0946', 'strugglebusca@gmail.com',
 '100 Test St', 'Halifax', 'NS', 'B3H 1A1', 'TestEmergencyContact1', '902-760-0946', true, 1, CURRENT_TIMESTAMP),

('K0000002', 'TestFirstName2', 'TestLastName2', '902-760-0946', 'strugglebusca@gmail.com',
 '101 Test St', 'Halifax', 'NS', 'B3H 1A2', 'TestEmergencyContact2', '902-760-0946', true, 2, CURRENT_TIMESTAMP),

('K0000003', 'TestFirstName3', 'TestLastName3', '902-760-0946', 'strugglebusca@gmail.com',
 '102 Test St', 'Halifax', 'NS', 'B3H 1A3', 'TestEmergencyContact3', '902-760-0946', true, 3, CURRENT_TIMESTAMP),

('K0000004', 'TestFirstName4', 'TestLastName4', '902-760-0946', 'strugglebusca@gmail.com',
 '103 Test St', 'Dartmouth', 'NS', 'B2Y 1A1', 'TestEmergencyContact4', '902-760-0946', true, 1, CURRENT_TIMESTAMP),

('K0000005', 'TestFirstName5', 'TestLastName5', '902-760-0946', 'strugglebusca@gmail.com',
 '104 Test St', 'Dartmouth', 'NS', 'B2Y 1A2', 'TestEmergencyContact5', '902-760-0946', true, 2, CURRENT_TIMESTAMP),

('K0000006', 'TestFirstName6', 'TestLastName6', '902-760-0946', 'strugglebusca@gmail.com',
 '105 Test St', 'Halifax', 'NS', 'B3H 1A4', 'TestEmergencyContact6', '902-760-0946', true, NULL, CURRENT_TIMESTAMP),

('K0000007', 'TestFirstName7', 'TestLastName7', '902-760-0946', 'strugglebusca@gmail.com',
 '106 Test St', 'Halifax', 'NS', 'B3H 1A5', 'TestEmergencyContact7', '902-760-0946', true, 4, CURRENT_TIMESTAMP),

('K0000008', 'TestFirstName8', 'TestLastName8', '902-760-0946', 'strugglebusca@gmail.com',
 '107 Test St', 'Dartmouth', 'NS', 'B2Y 1A3', 'TestEmergencyContact8', '902-760-0946', true, NULL, CURRENT_TIMESTAMP),

('K0000009', 'TestFirstName9', 'TestLastName9', '902-760-0946', 'strugglebusca@gmail.com',
 '108 Test St', 'Halifax', 'NS', 'B3H 1A6', 'TestEmergencyContact9', '902-760-0946', true, 5, CURRENT_TIMESTAMP),

('K0000010', 'TestFirstName10', 'TestLastName10', '902-760-0946', 'strugglebusca@gmail.com',
 '109 Test St', 'Halifax', 'NS', 'B3H 1A7', 'TestEmergencyContact10', '902-760-0946', true, 1, CURRENT_TIMESTAMP);

-- ============================================================================
-- 5. ADD SAMPLE APPOINTMENTS
-- ============================================================================

-- Add 5 upcoming appointments for different clients
INSERT INTO appointments (knumber, appointmenttime, pickuptime, locationname, locationaddress,
                          driver_assigned, appointmentstatus, clinic_id, created_at) VALUES
('K0000001', CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day' - INTERVAL '30 minutes',
 'Halifax General Hospital', '1796 Summer Street, Halifax, NS', 11, 'scheduled', 1, CURRENT_TIMESTAMP),

('K0000002', CURRENT_TIMESTAMP + INTERVAL '2 days', CURRENT_TIMESTAMP + INTERVAL '2 days' - INTERVAL '30 minutes',
 'Dartmouth General Hospital', '325 Pleasant Street, Dartmouth, NS', 11, 'scheduled', 2, CURRENT_TIMESTAMP),

('K0000003', CURRENT_TIMESTAMP + INTERVAL '3 days', CURRENT_TIMESTAMP + INTERVAL '3 days' - INTERVAL '30 minutes',
 'QEII Health Sciences Centre', '1276 South Park Street, Halifax, NS', 11, 'scheduled', 3, CURRENT_TIMESTAMP),

('K7807878', CURRENT_TIMESTAMP + INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '5 days' - INTERVAL '30 minutes',
 'Halifax General Hospital', '1796 Summer Street, Halifax, NS', 11, 'scheduled', 1, CURRENT_TIMESTAMP),

('K0000004', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP + INTERVAL '7 days' - INTERVAL '30 minutes',
 'IWK Health Centre', '5980 University Avenue, Halifax, NS', 11, 'scheduled', 4, CURRENT_TIMESTAMP);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check what was added
SELECT '=== VERIFICATION ===' as section;

SELECT 'destinations' as table_name, COUNT(*) as count FROM destinations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments;

-- View clients with their primary clinics
SELECT
    c.knumber,
    c.firstname,
    c.lastname,
    c.primary_clinic_id,
    d.name as primary_clinic_name
FROM clients c
LEFT JOIN destinations d ON c.primary_clinic_id = d.id
ORDER BY c.knumber;

-- View upcoming appointments
SELECT
    a.knumber,
    c.firstname || ' ' || c.lastname as client_name,
    a.appointmenttime,
    a.locationname,
    a.appointmentstatus
FROM appointments a
JOIN clients c ON a.knumber = c.knumber
WHERE a.appointmenttime > CURRENT_TIMESTAMP
ORDER BY a.appointmenttime;

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT '✅ Test data added successfully! You can now start testing.' as status;
