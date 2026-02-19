-- ============================================================================
-- Driver-Client Distance Matrix Table
-- ============================================================================
-- Stores pre-calculated travel distances/times between drivers and clients.
-- Only populated for pairs that have actually worked together (from appointments).
--
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Create the lookup table
CREATE TABLE IF NOT EXISTS driver_client_distances (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

    -- Distance from driver home to client PRIMARY address
    primary_distance_km NUMERIC(8,2),
    primary_duration_minutes INTEGER,

    -- Distance from driver home to client SECONDARY address (if exists)
    secondary_distance_km NUMERIC(8,2),
    secondary_duration_minutes INTEGER,

    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculation_source VARCHAR(50) DEFAULT 'google_maps',

    -- Prevent duplicate pairs
    CONSTRAINT unique_driver_client_pair UNIQUE (driver_id, client_id)
);

-- Add helpful comments
COMMENT ON TABLE driver_client_distances IS 'Pre-calculated travel distances between drivers (home) and clients (pickup addresses)';
COMMENT ON COLUMN driver_client_distances.primary_distance_km IS 'Distance in km from driver home to client primary address';
COMMENT ON COLUMN driver_client_distances.primary_duration_minutes IS 'Travel time in minutes to client primary address';
COMMENT ON COLUMN driver_client_distances.secondary_distance_km IS 'Distance in km from driver home to client secondary address (if exists)';
COMMENT ON COLUMN driver_client_distances.secondary_duration_minutes IS 'Travel time in minutes to client secondary address';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dcd_driver ON driver_client_distances(driver_id);
CREATE INDEX IF NOT EXISTS idx_dcd_client ON driver_client_distances(client_id);
CREATE INDEX IF NOT EXISTS idx_dcd_pair ON driver_client_distances(driver_id, client_id);

-- ============================================================================
-- Function: Get missing driver-client pairs that need distance calculation
-- ============================================================================
-- Returns pairs from appointments that don't have distances calculated yet
-- ============================================================================

CREATE OR REPLACE FUNCTION get_missing_driver_client_distances()
RETURNS TABLE (
    driver_id INTEGER,
    client_id INTEGER,
    driver_name TEXT,
    driver_address TEXT,
    client_knumber VARCHAR,
    client_name TEXT,
    client_primary_address TEXT,
    client_secondary_address TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        d.id::INTEGER as driver_id,
        c.id::INTEGER as client_id,
        (d.first_name || ' ' || d.last_name)::TEXT as driver_name,
        d.home_address::TEXT as driver_address,
        c.knumber::VARCHAR as client_knumber,
        (c.firstname || ' ' || c.lastname)::TEXT as client_name,
        (c.civicaddress || ', ' || c.city || ', ' || c.prov || ' ' || COALESCE(c.postalcode, ''))::TEXT as client_primary_address,
        CASE
            WHEN c.secondary_civic_address IS NOT NULL AND c.secondary_civic_address != ''
            THEN (c.secondary_civic_address || ', ' || COALESCE(c.secondary_city, '') || ', ' || COALESCE(c.secondary_province, '') || ' ' || COALESCE(c.secondary_postal_code, ''))::TEXT
            ELSE NULL
        END as client_secondary_address
    FROM appointments a
    JOIN clients c ON a.knumber = c.knumber
    JOIN drivers d ON a.driver_id = d.id
    LEFT JOIN driver_client_distances dcd
        ON dcd.driver_id = d.id
        AND dcd.client_id = c.id
    WHERE
        dcd.id IS NULL                          -- No existing calculation
        AND a.driver_id IS NOT NULL             -- Has assigned driver
        AND d.home_address IS NOT NULL          -- Driver has home address
        AND d.home_address != ''
        AND c.civicaddress IS NOT NULL          -- Client has address
        AND c.civicaddress != ''
    ORDER BY d.id, c.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_missing_driver_client_distances IS 'Returns driver-client pairs from appointments that need distance calculation';

-- ============================================================================
-- Function: Get distance for a specific driver-client pair
-- ============================================================================

CREATE OR REPLACE FUNCTION get_driver_client_distance(
    p_driver_id INTEGER,
    p_client_knumber VARCHAR
)
RETURNS TABLE (
    driver_id INTEGER,
    client_id INTEGER,
    primary_distance_km NUMERIC,
    primary_duration_minutes INTEGER,
    secondary_distance_km NUMERIC,
    secondary_duration_minutes INTEGER,
    calculated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dcd.driver_id,
        dcd.client_id,
        dcd.primary_distance_km,
        dcd.primary_duration_minutes,
        dcd.secondary_distance_km,
        dcd.secondary_duration_minutes,
        dcd.calculated_at
    FROM driver_client_distances dcd
    JOIN clients c ON c.id = dcd.client_id
    WHERE dcd.driver_id = p_driver_id
    AND c.knumber = p_client_knumber;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function: Upsert distance calculation result
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_driver_client_distance(
    p_driver_id INTEGER,
    p_client_id INTEGER,
    p_primary_distance_km NUMERIC,
    p_primary_duration_minutes INTEGER,
    p_secondary_distance_km NUMERIC DEFAULT NULL,
    p_secondary_duration_minutes INTEGER DEFAULT NULL,
    p_calculation_source VARCHAR DEFAULT 'google_maps'
)
RETURNS driver_client_distances AS $$
DECLARE
    result driver_client_distances;
BEGIN
    INSERT INTO driver_client_distances (
        driver_id,
        client_id,
        primary_distance_km,
        primary_duration_minutes,
        secondary_distance_km,
        secondary_duration_minutes,
        calculation_source,
        calculated_at
    ) VALUES (
        p_driver_id,
        p_client_id,
        p_primary_distance_km,
        p_primary_duration_minutes,
        p_secondary_distance_km,
        p_secondary_duration_minutes,
        p_calculation_source,
        NOW()
    )
    ON CONFLICT (driver_id, client_id)
    DO UPDATE SET
        primary_distance_km = EXCLUDED.primary_distance_km,
        primary_duration_minutes = EXCLUDED.primary_duration_minutes,
        secondary_distance_km = EXCLUDED.secondary_distance_km,
        secondary_duration_minutes = EXCLUDED.secondary_duration_minutes,
        calculation_source = EXCLUDED.calculation_source,
        calculated_at = NOW()
    RETURNING * INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View: Summary statistics for monitoring
-- ============================================================================

CREATE OR REPLACE VIEW driver_client_distance_stats AS
SELECT
    (SELECT COUNT(*) FROM driver_client_distances) as total_calculated,
    (SELECT COUNT(*) FROM get_missing_driver_client_distances()) as pending_calculation,
    (SELECT COUNT(DISTINCT driver_id) FROM driver_client_distances) as drivers_with_distances,
    (SELECT COUNT(DISTINCT client_id) FROM driver_client_distances) as clients_with_distances,
    (SELECT MAX(calculated_at) FROM driver_client_distances) as last_calculation,
    (SELECT AVG(primary_duration_minutes)::INTEGER FROM driver_client_distances) as avg_travel_minutes;

COMMENT ON VIEW driver_client_distance_stats IS 'Summary statistics for driver-client distance calculations';

-- ============================================================================
-- Grant permissions (adjust as needed for your Supabase setup)
-- ============================================================================

-- Allow authenticated users to read distances
GRANT SELECT ON driver_client_distances TO authenticated;
GRANT SELECT ON driver_client_distance_stats TO authenticated;

-- Allow service role to manage (for n8n workflows)
GRANT ALL ON driver_client_distances TO service_role;
GRANT USAGE, SELECT ON SEQUENCE driver_client_distances_id_seq TO service_role;
