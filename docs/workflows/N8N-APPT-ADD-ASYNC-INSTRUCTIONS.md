# APPT - Add Appointment Async: Build Instructions

**Version:** v1.0.0
**Date:** 2026-03-03
**Endpoint:** `POST /save-appointment-v7`
**Workflow JSON:** `workflows/appointments/APPT - Add Appointment Async.json`

## Overview

This workflow replaces the synchronous `APPT - Add Appointment` workflow with an async version that:

1. **Synchronously** validates, calculates times, and inserts appointment(s) to the database
2. **Optionally** creates a `calculate_traffic_transit` background task and runs Google Maps Distance Matrix API to get traffic-aware transit time
3. **Responds immediately** to the frontend, with background task IDs if traffic calc was requested

### When is the Async Branch Used?

Only when the frontend sends `calculate_traffic_transit: true` on one or more appointments in the array AND the appointment type is NOT `support`. If no appointment requests traffic calc, the workflow behaves exactly like the old synchronous version.

---

## Prerequisites

1. Database migration 19 applied (appointment_type, trip_direction, event_name columns)
2. Database migration 26 applied (background_tasks table)
3. Google Maps API key stored in `app_config` table (key: `google_maps_api_key`)

---

## Architecture Diagram

```
Webhook (POST /save-appointment-v7)
  → Get JWT Secret
  → JWT Validation
  → JWT Route Switch
    ├─ Unauthorized → Unauthorized Response → Respond to Webhook
    └─ Authorized → Validate Request (v3.0.0, type-aware, array)
         → Validation Switch
           ├─ Error → Format Error Response → Respond to Webhook
           └─ Valid → Calculate Times (v3.0.0, type-aware)
                → Combine Notes
                → Insert Appointment(s)
                → Check Traffic Calc Needed
                → Traffic Route Switch
                  ├─ Sync (no traffic) → Format Simple Response → Respond to Webhook
                  └─ Async (traffic needed)
                       → Prepare Background Tasks
                       → Create Task - Supabase
                       → Format Async Response
                       → Respond to Webhook ──────────────── [HTTP response sent]
                       └→ Get Maps API Key              [async continues]
                            → Prepare Traffic Requests
                            → Maps API Traffic - HTTP Request
                            → Calculate P75 Transit
                            → Traffic Calc Result Switch
                              ├─ Success → Update Appointment → Mark Complete → Update Task Status
                              └─ Error → Mark Failed → Update Task Status
```

---

## Node-by-Node Reference

### Node 1: Webhook - Save Appointment

- **Type:** Webhook
- **Method:** POST
- **Path:** `save-appointment-v7`
- **Response Mode:** `responseNode` (critical — enables mid-workflow response)

### Node 2: Get JWT Secret - Supabase

- **Operation:** Get
- **Table:** `app_config`
- **Filter:** `key` eq `jwt_secret`
- **alwaysOutputData:** true

### Node 3: JWT Validation - Code (v2.0.0)

Standard JWT validation. Fetches secret from Node 2 via `$('Get JWT Secret - Supabase').first().json.value`. Validates token format, signature, expiration. Rejects `limited` and `refresh` token types.

### Node 4: JWT Route - Switch

| Output | Condition |
|--------|-----------|
| Authorized | `_route` equals `"authorized"` |
| Unauthorized | `_route` equals `"unauthorized"` |

### Node 5: Validate Request - Code (v3.0.0)

**Key changes from v2.0.0:**

1. **Type-aware validation:**
   - `appointment_type` defaults to `round_trip` if missing (backward compatible)
   - Valid types: `round_trip`, `one_way`, `support`
   - `trip_direction` required for `one_way` (values: `to_clinic`, `to_home`)
   - `event_name` required for `support`
   - `location`/`locationAddress` required for `round_trip` and `one_way` but NOT `support`

2. **Traffic flag passthrough:**
   - `calculate_traffic_transit` converted to string `'true'`/`'false'` for Switch routing

3. **Array processing preserved:**
   - Handles `data.appointments[]` array (single or bulk)
   - Invalid appointments are skipped with console.error, not rejected

### Node 6: Validation - Switch

| Output | Condition |
|--------|-----------|
| Valid | `_route` equals `"valid"` |
| Error | `_route` equals `"error"` |

### Node 7: Calculate Times - Code (v3.0.0)

Type-aware pickup/dropoff calculations:

| Type | Pickup Time | Drop-off Time |
|------|-------------|---------------|
| round_trip | `apptTime - transitTime` | `apptTime + length + transitTime` |
| one_way (to_clinic) | `apptTime - transitTime` | `apptTime` |
| one_way (to_home) | `apptTime` | `apptTime + transitTime` |
| support | `apptTime` | `apptTime + length` |

Uses `$input.all().map()` for array processing.

### Node 8: Combine Notes - Code (v3.0.0)

Merges `driver_instructions` and `scheduling_notes`. No logic change from v2.0.0 — all new type fields flow through via spread operator.

### Node 9: Insert Appointment - Supabase

27 field mappings (24 existing + 3 new):

**New fields:**
| Field | Value |
|-------|-------|
| `appointment_type` | `={{ $json.appointment_type }}` |
| `trip_direction` | `={{ $json.trip_direction }}` |
| `event_name` | `={{ $json.event_name }}` |

### Node 10: Check Traffic Calc Needed - Code (v1.0.0)

Examines all inserted appointments. For each one:
- Is `calculate_traffic_transit === 'true'`?
- Is `appointment_type !== 'support'`?
- Are `pickup_address` and `locationaddress` both present?

Sets `_route` to `'async'` if any appointment needs traffic calc, `'sync'` otherwise.

Also aggregates the success response data (all appointment results) for use by either response path.

### Node 11: Traffic Route - Switch

| Output | Condition |
|--------|-----------|
| Async | `_route` equals `"async"` |
| Sync | `_route` equals `"sync"` |

### Node 12: Prepare Background Tasks - Code (v1.0.0)

Creates one `background_tasks` row per appointment needing traffic calc:
- `entity_type`: `'appointment'`
- `entity_id`: appointment ID (string)
- `entity_label`: `"K1234567 - Clinic Name"`
- `task_type`: `'calculate_traffic_transit'`
- `status`: `'pending'`
- `created_by`: user ID from JWT

### Node 13: Create Task - Supabase

- **Operation:** Create
- **Table:** `background_tasks`
- **alwaysOutputData:** true

### Node 14: Format Async Response - Code (v1.0.0)

Builds response including task IDs:

```json
{
  "success": true,
  "message": "3 of 3 appointment(s) saved successfully",
  "data": {
    "appointments": [
      {
        "id": "uuid",
        "knumber": "K1234567",
        "appointmenttime": "2026-03-15T14:00:00Z",
        "pickuptime": "2026-03-15T13:30:00Z",
        "location": "Halifax Clinic",
        "appointment_type": "round_trip",
        "trip_direction": null,
        "event_name": null
      }
    ],
    "backgroundTasks": {
      "appointment-uuid": {
        "calculate_traffic_transit": "task-uuid"
      }
    }
  },
  "timestamp": "2026-03-03T..."
}
```

**FORK POINT:** This node's output connects to BOTH:
1. `Respond to Webhook` (sends HTTP response immediately)
2. `Get Maps API Key - Supabase` (starts async branch)

### Node 15: Format Simple Response - Code (v1.0.0)

Same response format but with empty `backgroundTasks: {}`. Used when no traffic calc is needed.

### Node 16: Format Error Response - Code (v1.0.0)

Standard error response for validation failures.

### Node 17: Unauthorized Response - Code (v1.0.0)

Standard 401/403 error response for JWT failures.

### Node 18: Respond to Webhook

Single response node. Receives input from:
- Format Async Response (async path)
- Format Simple Response (sync path)
- Format Error Response (validation errors)
- Unauthorized Response (JWT errors)

---

## Async Branch: Traffic-Aware Transit Time

Everything below runs AFTER the HTTP response has been sent.

### Node 19: Get Maps API Key - Supabase

- **Operation:** Get
- **Table:** `app_config`
- **Filter:** `key` eq `google_maps_api_key`
- **alwaysOutputData:** true

### Node 20: Prepare Traffic Requests - Code (v1.0.0)

For each appointment with a background task:
- Determines origin/destination based on appointment type:
  - `round_trip` / `one_way to_clinic`: origin = `pickup_address`, destination = `locationAddress`
  - `one_way to_home`: origin = `locationAddress`, destination = `pickup_address`
- Computes `departure_time` as Unix timestamp from `appointmentDateTime`
- If Maps API key is missing, marks all items with `branchError: 'true'`

### Node 21: Maps API Traffic - HTTP Request

- **URL:** `https://maps.googleapis.com/maps/api/distancematrix/json`
- **Query Parameters:**
  - `origins`: from Code node
  - `destinations`: from Code node
  - `key`: API key
  - `mode`: `driving`
  - `units`: `metric`
  - `departure_time`: Unix timestamp
  - `traffic_model`: `pessimistic`
- **Timeout:** 30000ms
- **On Error:** Continue Regular Output (prevents workflow abort)
- **alwaysOutputData:** true

### Node 22: Calculate P75 Transit - Code (v1.0.0)

**75th Percentile Formula:**

```javascript
const noTraffic = element.duration.value;           // seconds
const pessimistic = element.duration_in_traffic.value; // seconds
const p75seconds = noTraffic + (pessimistic - noTraffic) * 0.75;
const p75minutes = Math.ceil(p75seconds / 60);
const rounded = Math.ceil(p75minutes / 5) * 5;       // ceil to nearest 5 min
const newTransit = Math.max(rounded, 5);             // minimum 5 min
```

Then recalculates pickup/dropoff using the same type-aware formulas as Node 7.

Also extracts `distance.value` for `driver_total_distance` (km).

### Node 23: Traffic Calc Result - Switch

| Output | Condition |
|--------|-----------|
| Success | `calcError` equals `"false"` |
| Error | `calcError` equals `"true"` |

### Node 24: Update Appointment Times - Supabase (Success path)

- **Operation:** Update
- **Table:** `appointments`
- **Filter:** `id` eq `appointmentId`
- **Fields updated:**
  - `transittime` — new traffic-aware value
  - `pickuptime` — recalculated
  - `dropOffTime` — recalculated
  - `driver_total_distance` — distance in km
  - `traffic_aware_transit` — set to `true` (flags this appointment as traffic-calculated for frontend)

### Node 25: Mark Task Complete - Code (v1.0.0)

Sets task status to `completed` with result JSONB containing:
- `transit_minutes`, `distance_km`, `duration_no_traffic`, `duration_pessimistic`, `p75_minutes`

### Node 26: Mark Task Failed - Code (v1.0.0)

Sets task status to `failed` with `error_message`.

### Node 27: Update Task Status - Supabase

- **Operation:** Update
- **Table:** `background_tasks`
- **Filter:** `id` eq `taskId`
- **Fields:** `status`, `completed_at`, `result`, `error_message`

---

## Frontend Integration

### Request Format

Same endpoint, same array format. New optional field per appointment:

```javascript
const payload = {
  appointments: [{
    knumber: "K1234567",
    appointmentDateTime: "2026-03-15T14:00:00.000Z",
    appointmentLength: 90,
    status: "pending",
    notes: "",
    driver_instructions: null,
    scheduling_notes: "",
    transitTime: 30,
    pickup_address: "123 Main St, City, NS, A1B 2C3",
    customRate: null,
    location: "Clinic Name",
    clinic_id: 2,
    locationAddress: "456 Clinic St, City, NS, A1B 2C3",
    managed_by: 13,
    managed_by_name: "User Name",
    // NEW: type fields
    appointment_type: "round_trip",   // or "one_way", "support"
    trip_direction: null,              // "to_clinic" or "to_home" when one_way
    event_name: null,                  // required when support
    // NEW: traffic flag
    calculate_traffic_transit: true    // checkbox value
  }]
};
```

### Response Format

**Without traffic calc (sync):**
```json
{
  "success": true,
  "message": "1 of 1 appointment(s) saved successfully",
  "data": {
    "appointments": [{ "id": "...", "knumber": "K1234567", ... }],
    "backgroundTasks": {}
  },
  "timestamp": "..."
}
```

**With traffic calc (async):**
```json
{
  "success": true,
  "message": "1 of 1 appointment(s) saved successfully",
  "data": {
    "appointments": [{ "id": "...", "knumber": "K1234567", ... }],
    "backgroundTasks": {
      "appointment-uuid": {
        "calculate_traffic_transit": "task-uuid"
      }
    }
  },
  "timestamp": "..."
}
```

Frontend can check `Object.keys(data.backgroundTasks).length > 0` to determine if async ops are running. The task monitor component polls `background_tasks` for status updates.

---

## Backward Compatibility

- `appointment_type` defaults to `round_trip` if not sent — zero impact on existing frontend code
- `calculate_traffic_transit` defaults to `false` if not sent — no async branch triggered
- Response always includes `backgroundTasks` (empty object if none) — frontend can safely check
- Same endpoint path (`/save-appointment-v7`) — no URL changes needed

---

## Deployment Steps

1. **Export** the current `APPT - Add Appointment` workflow as JSON backup
2. **Import** `workflows/appointments/APPT - Add Appointment Async.json` into n8n
3. **Update credentials:** Verify Supabase credential (`Supabase Service Role`) is selected on all Supabase nodes
4. **Activate** the new workflow
5. **Deactivate** the old `APPT - Add Appointment` workflow
6. **Test** with:
   - Single appointment without traffic flag (sync path)
   - Single appointment with traffic flag (async path)
   - Bulk appointments (array of 2+)
   - Each appointment type: round_trip, one_way (to_clinic), one_way (to_home), support
   - Missing/invalid fields (validation errors)
   - Expired JWT token (unauthorized path)

---

## Testing Checklist

- [ ] Single round_trip appointment saves correctly (no traffic flag)
- [ ] Single round_trip with `calculate_traffic_transit: true` creates background task
- [ ] Background task completes and updates appointment with traffic-aware times
- [ ] Bulk add (3 appointments) works correctly
- [ ] one_way to_clinic timing: pickup = apptTime - transit, dropoff = apptTime
- [ ] one_way to_home timing: pickup = apptTime, dropoff = apptTime + transit
- [ ] one_way to_home traffic calc reverses origin/destination
- [ ] support type: pickup = apptTime, dropoff = apptTime + length, no transit
- [ ] support type with `calculate_traffic_transit: true` is SKIPPED (no task created)
- [ ] Missing knumber returns validation error
- [ ] Missing trip_direction on one_way returns validation error
- [ ] Missing event_name on support returns validation error
- [ ] Invalid JWT returns 401
- [ ] Expired JWT returns 401
- [ ] Refresh token returns 403
- [ ] Google Maps API failure marks task as failed (not workflow crash)
- [ ] Response includes backgroundTasks map with correct appointment-to-task mapping
- [ ] P75 calculation produces expected values (e.g., duration=3600s, pessimistic=7200s → P75=5400s → ceil(90/5)*5 = 90 min)
