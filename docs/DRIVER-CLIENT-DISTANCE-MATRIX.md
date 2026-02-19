# Driver-Client Distance Matrix System

## Overview

Store pre-calculated travel distances/times between drivers (home location) and clients (pickup addresses). Only calculate pairs that have actually worked together based on appointment history.

## Database Design

### Option 1: Dedicated Lookup Table (Recommended)

```sql
-- New table for driver-client distances
CREATE TABLE driver_client_distances (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),

    -- Distance from driver home to client primary address
    primary_distance_km NUMERIC(8,2),
    primary_duration_minutes INTEGER,

    -- Distance from driver home to client secondary address (if exists)
    secondary_distance_km NUMERIC(8,2),
    secondary_duration_minutes INTEGER,

    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculation_source VARCHAR(50) DEFAULT 'google_maps', -- or 'mapbox', etc.

    -- Unique constraint prevents duplicates
    CONSTRAINT unique_driver_client UNIQUE (driver_id, client_id)
);

-- Index for fast lookups
CREATE INDEX idx_driver_client_distances_driver ON driver_client_distances(driver_id);
CREATE INDEX idx_driver_client_distances_client ON driver_client_distances(client_id);
CREATE INDEX idx_driver_client_distances_pair ON driver_client_distances(driver_id, client_id);
```

### Why Not JSONB on Driver Table?

| Aspect | JSONB Column | Lookup Table |
|--------|--------------|--------------|
| Query "missing pairs" | Complex JSON operations | Simple LEFT JOIN |
| Add new calculation | Update entire JSONB | Single INSERT |
| Index performance | Limited | Full index support |
| Audit trail | Manual | Built-in timestamps |
| Schema flexibility | High | Moderate |
| Query complexity | Higher | Lower |

## Workflow Design

### Finding New Pairs to Calculate

The key insight: Only calculate distances for driver-client pairs that have **actually worked together** (exist in appointments table).

```sql
-- Find driver-client pairs from appointments that don't have distances calculated yet
SELECT DISTINCT
    a.driver_id,
    a.knumber as client_knumber,
    c.id as client_id,
    d.home_address as driver_address,
    c.civicaddress || ', ' || c.city || ', ' || c.prov as client_primary_address,
    c.secondary_civic_address || ', ' || c.secondary_city || ', ' || c.secondary_province as client_secondary_address
FROM appointments a
JOIN clients c ON a.knumber = c.knumber
JOIN drivers d ON a.driver_id = d.id
LEFT JOIN driver_client_distances dcd
    ON dcd.driver_id = a.driver_id
    AND dcd.client_id = c.id
WHERE
    dcd.id IS NULL  -- No existing calculation
    AND a.driver_id IS NOT NULL  -- Has assigned driver
    AND d.home_address IS NOT NULL  -- Driver has home address
    AND c.civicaddress IS NOT NULL  -- Client has address
ORDER BY a.driver_id, c.id;
```

### n8n Workflow: Calculate Missing Distances

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW: Calculate Driver Distances              │
│                    Trigger: Weekly (Sunday night)                    │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Schedule   │────▶│  Query Missing   │────▶│  Loop: Each Pair    │
│   Trigger    │     │  Pairs (SQL)     │     │                     │
└──────────────┘     └──────────────────┘     └─────────────────────┘
                                                        │
                     ┌──────────────────────────────────┘
                     ▼
        ┌─────────────────────────┐     ┌─────────────────────────┐
        │  Google Maps Distance   │────▶│  Insert/Update Result   │
        │  Matrix API Call        │     │  in Supabase            │
        └─────────────────────────┘     └─────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │  (If secondary addr)    │
        │  Calculate secondary    │
        │  distance too           │
        └─────────────────────────┘
```

### Workflow Steps Detail

**Step 1: Query Missing Pairs**
```sql
-- Returns pairs needing calculation
SELECT * FROM get_missing_driver_client_distances();
-- Or use the raw query above
```

**Step 2: Batch API Calls**
Google Distance Matrix API allows up to 25 origins × 25 destinations per request.
- Group pairs by driver (same origin)
- Batch client addresses as destinations
- Reduces API calls significantly

**Step 3: Store Results**
```sql
INSERT INTO driver_client_distances (
    driver_id,
    client_id,
    primary_distance_km,
    primary_duration_minutes,
    secondary_distance_km,
    secondary_duration_minutes,
    calculated_at
) VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (driver_id, client_id)
DO UPDATE SET
    primary_distance_km = EXCLUDED.primary_distance_km,
    primary_duration_minutes = EXCLUDED.primary_duration_minutes,
    secondary_distance_km = EXCLUDED.secondary_distance_km,
    secondary_duration_minutes = EXCLUDED.secondary_duration_minutes,
    calculated_at = NOW();
```

## Usage in Payroll/Invoicing

### Get Distance for a Specific Trip
```sql
SELECT
    dcd.primary_duration_minutes,
    dcd.primary_distance_km
FROM driver_client_distances dcd
JOIN clients c ON c.id = dcd.client_id
WHERE dcd.driver_id = $1  -- driver_id
AND c.knumber = $2;       -- client knumber
```

### Get All Distances for a Driver (Payroll Report)
```sql
SELECT
    d.first_name || ' ' || d.last_name as driver_name,
    c.firstname || ' ' || c.lastname as client_name,
    dcd.primary_distance_km,
    dcd.primary_duration_minutes
FROM driver_client_distances dcd
JOIN drivers d ON d.id = dcd.driver_id
JOIN clients c ON c.id = dcd.client_id
WHERE dcd.driver_id = $1
ORDER BY c.lastname, c.firstname;
```

## Alternative: Hybrid Approach

If you want JSONB for quick access but relational for management:

```sql
-- On drivers table, add a cached summary
ALTER TABLE drivers ADD COLUMN client_distances_cache JSONB DEFAULT '{}';

-- Trigger to update cache when distances change
CREATE OR REPLACE FUNCTION update_driver_distance_cache()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE drivers
    SET client_distances_cache = (
        SELECT jsonb_object_agg(
            c.knumber,
            jsonb_build_object(
                'primary_km', dcd.primary_distance_km,
                'primary_min', dcd.primary_duration_minutes,
                'secondary_km', dcd.secondary_distance_km,
                'secondary_min', dcd.secondary_duration_minutes
            )
        )
        FROM driver_client_distances dcd
        JOIN clients c ON c.id = dcd.client_id
        WHERE dcd.driver_id = NEW.driver_id
    )
    WHERE id = NEW.driver_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_driver_distance_cache
AFTER INSERT OR UPDATE ON driver_client_distances
FOR EACH ROW EXECUTE FUNCTION update_driver_distance_cache();
```

## API Endpoint Design

### GET /webhook/driver-client-distances
Returns all calculated distances (for admin/debugging)

### GET /webhook/driver-distances/{driver_id}
Returns all client distances for a specific driver

### POST /webhook/calculate-missing-distances
Triggers the calculation workflow manually

### Response Format
```json
{
    "driver_id": 5,
    "driver_name": "John Smith",
    "client_distances": [
        {
            "client_id": 12,
            "knumber": "K1234567",
            "client_name": "Jane Doe",
            "primary": {
                "distance_km": 45.2,
                "duration_minutes": 38
            },
            "secondary": {
                "distance_km": 52.1,
                "duration_minutes": 44
            },
            "calculated_at": "2026-02-15T10:30:00Z"
        }
    ]
}
```

## Cost Optimization

### Google Maps Distance Matrix API Pricing
- $5 per 1,000 elements (origin-destination pairs)
- 25 origins × 25 destinations = 625 elements per request

### Strategies to Minimize Costs
1. **Only calculate actual pairs** - From appointments, not all possible combinations
2. **Batch requests** - Group by driver (same origin)
3. **Cache forever** - Distances rarely change significantly
4. **Weekly recalc** - Only new pairs, not existing ones
5. **Use basic tier** - Distance Matrix Basic vs Advanced

### Example Cost Calculation
- 50 drivers × 200 clients = 10,000 possible pairs
- But only ~500 actual pairs from appointments
- 500 pairs × $0.005 = $2.50 initial calculation
- Weekly: ~20 new pairs = $0.10/week

## Implementation Checklist

- [ ] Create `driver_client_distances` table in Supabase
- [ ] Add indexes for performance
- [ ] Create SQL function to find missing pairs
- [ ] Build n8n workflow for weekly calculation
- [ ] Add webhook endpoint to trigger manual calculation
- [ ] Update finance.js to use pre-calculated distances
- [ ] Add admin UI to view/manage distances (optional)

## Migration Path

1. Create the new table
2. Run initial calculation for all existing appointment pairs
3. Update payroll/invoice code to use new table
4. Set up weekly workflow
5. Monitor and adjust as needed
