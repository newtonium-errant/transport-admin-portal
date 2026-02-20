# Driver-Client Distance Matrix - Implementation Notes

**Date:** 2026-02-20
**Status:** Design Complete, Ready for Implementation
**Branch:** `claude/review-rrts-Sr2aC`

---

## Context

The RRTS transport admin portal needs to calculate and store travel distances between drivers (from their home addresses) and clients (pickup addresses). This data is used for:
- Payroll calculations (driver mileage)
- Invoice generation
- Route optimization

## Design Decision

**Chosen approach:** Dedicated lookup table (NOT JSONB on driver table)

**Reasons:**
1. Easy to query "which pairs are missing" with LEFT JOIN
2. Single-row INSERTs vs large JSONB updates
3. Full index support for fast lookups
4. Built-in audit trail with `calculated_at` timestamp
5. Works well with n8n batch workflows

## Files Created

| File | Description |
|------|-------------|
| `docs/DRIVER-CLIENT-DISTANCE-MATRIX.md` | Full design document with API patterns |
| `sql/create_driver_client_distances.sql` | Ready-to-run Supabase migration |

---

## Implementation Checklist

### Phase 1: Database Setup

- [ ] Run `sql/create_driver_client_distances.sql` in Supabase SQL Editor
- [ ] Verify table `driver_client_distances` was created
- [ ] Verify function `get_missing_driver_client_distances()` works
- [ ] Verify function `upsert_driver_client_distance()` works
- [ ] Test the `driver_client_distance_stats` view

### Phase 2: n8n Workflow

Create workflow: `CALC-DRIVER-CLIENT-DISTANCES`

**Trigger:** Schedule (weekly, Sunday night recommended)

**Step 1: Get Missing Pairs**
```sql
SELECT * FROM get_missing_driver_client_distances();
```

**Step 2: Batch by Driver**
Group results by `driver_id` (same origin address) to minimize API calls.

**Step 3: Call Google Distance Matrix API**
```
POST https://maps.googleapis.com/maps/api/distancematrix/json
?origins={driver_address}
&destinations={client_addresses_pipe_separated}
&key={GOOGLE_MAPS_API_KEY}
&units=metric
```

**Step 4: Parse Response**
Extract from response:
- `rows[i].elements[j].distance.value` → meters, convert to km
- `rows[i].elements[j].duration.value` → seconds, convert to minutes

**Step 5: Store Results**
```sql
SELECT upsert_driver_client_distance(
    $driver_id,
    $client_id,
    $primary_distance_km,
    $primary_duration_minutes,
    $secondary_distance_km,  -- NULL if no secondary address
    $secondary_duration_minutes
);
```

### Phase 3: Webhook Endpoints

Create these endpoints in n8n:

**GET `/webhook/get-missing-distances`**
Returns pairs needing calculation (for manual trigger or debugging)

**POST `/webhook/calculate-missing-distances`**
Manually triggers the calculation workflow

**GET `/webhook/driver-distances/{driver_id}`**
Returns all client distances for a specific driver

### Phase 4: Update Finance Module

Modify `js/core/finance.js` to use pre-calculated distances:

```javascript
/**
 * Get travel distance for driver-client pair
 * @param {number} driverId - Driver ID
 * @param {string} knumber - Client K-number
 * @returns {Promise<{distance_km: number, duration_minutes: number}>}
 */
async function getDriverClientDistance(driverId, knumber) {
    const response = await authenticatedFetch(
        `${API_BASE}/get-driver-client-distance?driver_id=${driverId}&knumber=${knumber}`
    );
    const data = await response.json();
    return {
        distance_km: data.primary_distance_km || 0,
        duration_minutes: data.primary_duration_minutes || 0
    };
}
```

---

## Key SQL Queries

### Find Missing Pairs (the core query)
```sql
SELECT * FROM get_missing_driver_client_distances();
```

This returns driver-client pairs that:
1. Have worked together (exist in appointments table)
2. Don't have a distance calculation yet
3. Both have valid addresses

### Get Distance for Specific Pair
```sql
SELECT * FROM get_driver_client_distance(5, 'K1234567');
```

### Check Statistics
```sql
SELECT * FROM driver_client_distance_stats;
```

Returns:
- `total_calculated` - How many pairs have distances
- `pending_calculation` - How many need calculation
- `last_calculation` - When was the last calculation
- `avg_travel_minutes` - Average travel time

---

## Important Considerations

### Only Calculate What's Needed
The design explicitly ONLY calculates distances for driver-client pairs that have actually worked together (from the appointments table). This avoids calculating all possible combinations.

**Example:**
- 50 drivers × 200 clients = 10,000 possible pairs
- But only ~500 actual pairs from appointments
- Saves significant API costs

### Handle Secondary Addresses
Clients can have a secondary address. The workflow should:
1. Always calculate primary address distance
2. If `client_secondary_address` is not null, also calculate secondary
3. Store both in the same row

### API Cost Optimization
- Google Distance Matrix: $5 per 1,000 elements
- Batch by driver (same origin) to reduce calls
- Each request can have up to 25 origins × 25 destinations

### Recalculation
Once a pair is calculated, it doesn't need recalculation (addresses rarely change). If an address changes:
1. Update the client/driver record
2. Delete the affected rows from `driver_client_distances`
3. Next weekly run will recalculate

---

## Testing Steps

1. **Create table:** Run the SQL migration
2. **Verify function:**
   ```sql
   SELECT * FROM get_missing_driver_client_distances() LIMIT 5;
   ```
3. **Manual insert:** Test upsert function with sample data
4. **Build workflow:** Create n8n workflow with the steps above
5. **Test with 1 pair:** Run workflow limited to 1 result first
6. **Full run:** Run for all missing pairs
7. **Verify stats:** Check `driver_client_distance_stats` view

---

## Related Files

- `js/core/finance.js` - Will need to query this table for payroll
- `appointments-sl.html` - Could display travel time info
- `driver-management.html` - Could show client distances per driver

---

## Questions for Implementation

1. **Google Maps API Key:** Where is it stored? (Check `app_config` table or environment)
2. **n8n Instance:** Which workspace/folder for the new workflow?
3. **Schedule:** Confirm Sunday night is appropriate timing
4. **Initial Run:** Should we backfill all historical pairs or start fresh?

---

## Reference: Table Schema

```sql
CREATE TABLE driver_client_distances (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    primary_distance_km NUMERIC(8,2),
    primary_duration_minutes INTEGER,
    secondary_distance_km NUMERIC(8,2),
    secondary_duration_minutes INTEGER,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculation_source VARCHAR(50) DEFAULT 'google_maps',
    CONSTRAINT unique_driver_client_pair UNIQUE (driver_id, client_id)
);
```
