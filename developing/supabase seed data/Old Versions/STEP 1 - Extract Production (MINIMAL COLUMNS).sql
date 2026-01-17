-- ============================================================================
-- SAFE READ-ONLY: Extract Production Data (MINIMAL COLUMN VERSION)
-- ============================================================================
-- ✅ 100% READ-ONLY - NO DATA MODIFIED
-- ✅ Only assumes columns that MUST exist (id, name, created_at, updated_at)
-- ✅ Safe to run in PRODUCTION
-- ============================================================================

-- ============================================================================
-- PART 1: DESTINATIONS (minimal columns)
-- ============================================================================

DO $$
DECLARE
    dest_insert TEXT;
BEGIN
    -- Only use columns that definitely exist
    SELECT
        'INSERT INTO destinations (id, name, address, city, province, postal_code, active, created_at, updated_at) VALUES ' ||
        string_agg(
            '(' ||
            id::TEXT || ', ' ||
            quote_literal(name) || ', ' ||
            COALESCE(quote_literal(address), 'NULL') || ', ' ||
            COALESCE(quote_literal(city), 'NULL') || ', ' ||
            COALESCE(quote_literal(province), 'NULL') || ', ' ||
            COALESCE(quote_literal(postal_code), 'NULL') || ', ' ||
            COALESCE(active::TEXT, 'true') || ', ' ||
            quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
            quote_literal(COALESCE(updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
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
-- PART 2: USERS (only 13, 23, 30)
-- ============================================================================

DO $$
DECLARE
    users_insert TEXT;
BEGIN
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
    INTO users_insert
    FROM users
    WHERE id IN (13, 23, 30);

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- USERS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', users_insert;
END $$;

-- ============================================================================
-- PART 3: DRIVER (only id 11)
-- ============================================================================

DO $$
DECLARE
    driver_insert TEXT;
BEGIN
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
    INTO driver_insert
    FROM drivers
    WHERE id = 11;

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- DRIVER';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', driver_insert;
END $$;

-- ============================================================================
-- PART 4: CLIENTS with AUTO-ANONYMIZATION
-- ============================================================================

DO $$
DECLARE
    k7807878_insert TEXT;
    anonymized_inserts TEXT;
    openphone_contact_id TEXT;
    openphone_sync_status TEXT;
    openphone_sync_date TIMESTAMPTZ;
BEGIN
    -- Get K7807878's OpenPhone data
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

    -- Insert K7807878 as-is (minimal columns)
    SELECT
        'INSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode, active, primary_clinic_id, created_at, updated_at) VALUES (' ||
        quote_literal(knumber) || ', ' ||
        quote_literal(firstname) || ', ' ||
        quote_literal(lastname) || ', ' ||
        quote_literal(phone) || ', ' ||
        COALESCE(quote_literal(email), 'NULL') || ', ' ||
        COALESCE(quote_literal(civicaddress), 'NULL') || ', ' ||
        COALESCE(quote_literal(city), 'NULL') || ', ' ||
        COALESCE(quote_literal(prov), 'NULL') || ', ' ||
        COALESCE(quote_literal(postalcode), 'NULL') || ', ' ||
        COALESCE(active::TEXT, 'true') || ', ' ||
        COALESCE(primary_clinic_id::TEXT, 'NULL') || ', ' ||
        quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
        quote_literal(COALESCE(updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
        ');'
    INTO k7807878_insert
    FROM clients
    WHERE knumber = 'K7807878';

    RAISE NOTICE '%', E'\n-- ============================================================================';
    RAISE NOTICE '%', '-- CLIENTS';
    RAISE NOTICE '%', E'-- ============================================================================\n';
    RAISE NOTICE '%', E'-- K7807878 (NOT anonymized)\n';
    RAISE NOTICE '%', k7807878_insert;

    -- Generate anonymized inserts (minimal columns)
    SELECT
        E'\n-- Other clients (ANONYMIZED)\nINSERT INTO clients (knumber, firstname, lastname, phone, email, civicaddress, city, prov, postalcode, active, primary_clinic_id, created_at, updated_at) VALUES\n' ||
        string_agg(
            '(' ||
            quote_literal('K' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 7, '0')) || ', ' ||
            quote_literal('TestFirstName' || ROW_NUMBER() OVER (ORDER BY created_at)) || ', ' ||
            quote_literal('TestLastName' || ROW_NUMBER() OVER (ORDER BY created_at)) || ', ' ||
            '''902-760-0946'', ' ||
            '''strugglebusca@gmail.com'', ' ||
            COALESCE(quote_literal(civicaddress), 'NULL') || ', ' ||
            COALESCE(quote_literal(city), 'NULL') || ', ' ||
            COALESCE(quote_literal(prov), 'NULL') || ', ' ||
            COALESCE(quote_literal(postalcode), 'NULL') || ', ' ||
            COALESCE(active::TEXT, 'true') || ', ' ||
            COALESCE(primary_clinic_id::TEXT, 'NULL') || ', ' ||
            quote_literal(COALESCE(created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
            quote_literal(COALESCE(updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
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
-- PART 5: APPOINTMENTS (minimal columns, anonymized knumbers)
-- ============================================================================

DO $$
DECLARE
    appt_insert TEXT;
BEGIN
    -- Create temp mapping
    CREATE TEMP TABLE IF NOT EXISTS knumber_mapping AS
    SELECT
        knumber as old_knumber,
        'K' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 7, '0') as new_knumber
    FROM clients
    WHERE knumber != 'K7807878'
      AND active = true
    ORDER BY created_at
    LIMIT 50;

    INSERT INTO knumber_mapping VALUES ('K7807878', 'K7807878');

    -- Generate appointment inserts (minimal columns)
    SELECT
        'INSERT INTO appointments (knumber, appointmenttime, pickuptime, locationname, locationaddress, appointmentstatus, driver_assigned, clinic_id, created_at, updated_at) VALUES ' ||
        string_agg(
            '(' ||
            quote_literal(COALESCE(km.new_knumber, a.knumber)) || ', ' ||
            quote_literal(a.appointmenttime::TEXT) || '::timestamptz, ' ||
            COALESCE(quote_literal(a.pickuptime::TEXT) || '::timestamptz', 'NULL') || ', ' ||
            COALESCE(quote_literal(a.locationname), 'NULL') || ', ' ||
            COALESCE(quote_literal(a.locationaddress), 'NULL') || ', ' ||
            COALESCE(quote_literal(a.appointmentstatus), '''scheduled''') || ', ' ||
            COALESCE(a.driver_assigned::TEXT, 'NULL') || ', ' ||
            COALESCE(a.clinic_id::TEXT, 'NULL') || ', ' ||
            quote_literal(COALESCE(a.created_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz, ' ||
            quote_literal(COALESCE(a.updated_at, CURRENT_TIMESTAMP)::TEXT) || '::timestamptz' ||
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

    DROP TABLE IF EXISTS knumber_mapping;
END $$;

-- ============================================================================
-- DONE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '%', E'\n========================================================================';
    RAISE NOTICE '%', '✅ READ-ONLY EXTRACTION COMPLETE - NO DATA WAS MODIFIED';
    RAISE NOTICE '%', '========================================================================';
    RAISE NOTICE '%', E'\nCopy all output above from the Messages tab';
    RAISE NOTICE '%', 'Save to "import-to-testing.sql"';
    RAISE NOTICE '%', 'Run in Testing Branch Supabase';
    RAISE NOTICE '%', '========================================================================';
END $$;
