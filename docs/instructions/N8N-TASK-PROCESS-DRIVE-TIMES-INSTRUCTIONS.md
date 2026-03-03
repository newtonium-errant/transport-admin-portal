# Background Task: Process Drive Times - n8n Implementation Guide

## Overview

This document provides step-by-step instructions for creating the background task processing workflow that calculates drive times from all drivers to a client's address. This workflow is triggered asynchronously after a client is created/updated.

**Workflow Name:** `TASK - Process Drive Times`
**Webhook Path:** `/process-drive-times`
**Authentication:** Internal only (triggered by other workflows)
**Trigger:** Fire-and-forget from add-client or update-client workflows

---

## How It Works

1. **Add Client workflow** creates client record immediately
2. **Add Client workflow** creates a background task record
3. **Add Client workflow** fires webhook to this workflow (no-wait)
4. **This workflow** picks up the task and processes drive times
5. **This workflow** marks task as completed or failed
6. **Frontend** receives notification if task fails

---

## Prerequisites

1. **Database Schema**: Run `12_background_tasks_schema.sql` in Supabase SQL Editor
2. **Google Maps API Key**: Configured in n8n credentials
3. **Drivers Table**: Must have active drivers with addresses
4. **Destinations Table**: Must have `destinations` table with addresses

---

## Workflow Structure

```
1. Webhook (POST /process-drive-times)
   ↓
2. Validate Internal Request - Code
   ↓
3. Check Valid - Switch
   ├─ Invalid → Log Error → Exit
   └─ Valid
      ↓
4. Start Task (mark processing) - Supabase
   ↓
5. Get Client Details - Supabase
   ↓
6. Check Client Found - Switch
   ├─ Not Found → Fail Task → Exit
   └─ Found
      ↓
7. Get All Clinic Locations - Supabase
   ↓
8. Calculate Drive Times - Code (Google Maps API)
   ↓
9. Check Calculation Success - Switch
   ├─ Failed → Fail Task → Exit
   └─ Success
      ↓
10. Update Client Travel Times - Supabase
   ↓
11. Complete Task - Supabase
   ↓
12. Exit (no response needed - fire and forget)
```

---

## Step-by-Step Node Configuration

### Node 1: Webhook

- **Type:** Webhook
- **Name:** `POST Process Drive Times - Webhook`
- **Configuration:**
  - HTTP Method: `POST`
  - Path: `process-drive-times`
  - Response Mode: `Immediately` (fire-and-forget)

---

### Node 2: Validate Internal Request - Code

- **Type:** Code
- **Name:** `Validate Internal Request - Code`
- **Code:**

```javascript
// TASK - Process Drive Times - Validate Request
// Version: v1.0.0
// Validates that this is an internal request with required data

const body = $input.first().json.body;

// Required fields
const taskId = body.task_id || '';
const clientId = body.client_id || '';
const clientAddress = body.client_address || '';

// Validate required fields
if (!taskId) {
    return [{
        json: {
            _route: 'invalid',
            error: 'task_id is required'
        }
    }];
}

if (!clientId) {
    return [{
        json: {
            _route: 'invalid',
            error: 'client_id is required'
        }
    }];
}

// UUID format validation for task_id
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(taskId)) {
    return [{
        json: {
            _route: 'invalid',
            error: 'Invalid task_id format'
        }
    }];
}

return [{
    json: {
        _route: 'valid',
        task_id: taskId,
        client_id: clientId,
        client_address: clientAddress,
        secondary_address: body.secondary_address || null
    }
}];
```

---

### Node 3: Check Valid - Switch

- **Type:** Switch
- **Name:** `Check Valid - Switch`
- **Configuration:**
  - Mode: `Rules`
  - Type Validation: `Strict`
  - Rules:
    - **Rule 1 (valid):**
      - Value 1: `{{ $json._route }}`
      - Operation: `equals`
      - Value 2: `valid`
    - **Rule 2 (invalid):**
      - Value 1: `{{ $json._route }}`
      - Operation: `equals`
      - Value 2: `invalid`

**Invalid Branch:** Connect to a "No Operation" node or just end (fire-and-forget)

---

### Node 4: Start Task - Supabase

- **Type:** Supabase
- **Name:** `Start Task - Supabase`
- **Credential:** `Supabase Production`
- **Configuration:**
  - Operation: `Update`
  - Table: `background_tasks`
  - Columns:
    - `status`: `processing`
    - `started_at`: `{{ $now.toISO() }}`
  - Filters:
    - `id` equals `{{ $json.task_id }}`
    - `status` equals `pending`
  - **Settings:** Enable `Always Output Data: true`

---

### Node 5: Get Client Details - Supabase

- **Type:** Supabase
- **Name:** `Get Client Details - Supabase`
- **Configuration:**
  - Operation: `Get Many`
  - Table: `clients`
  - Filters:
    - `id` equals `{{ $('Validate Internal Request - Code').first().json.client_id }}`
  - Limit: `1`
  - **Settings:** Enable `Always Output Data: true`

---

### Node 6: Check Client Found - Code

- **Type:** Code
- **Name:** `Check Client Found - Code`
- **Code:**

```javascript
// TASK - Process Drive Times - Check Client Found
// Version: v1.0.0

const client = $input.first().json;
const taskData = $('Validate Internal Request - Code').first().json;

if (!client || !client.id) {
    return [{
        json: {
            _route: 'not_found',
            task_id: taskData.task_id,
            error_message: 'Client not found in database'
        }
    }];
}

// Build primary address
let primaryAddress = taskData.client_address;
if (!primaryAddress && client.mapaddress) {
    primaryAddress = client.mapaddress;
} else if (!primaryAddress) {
    primaryAddress = [
        client.civicaddress,
        client.city,
        client.prov,
        client.postalcode
    ].filter(Boolean).join(', ');
}

// Build secondary address
let secondaryAddress = taskData.secondary_address;
if (!secondaryAddress && client.secondary_civic_address) {
    secondaryAddress = [
        client.secondary_civic_address,
        client.secondary_city,
        client.secondary_province,
        client.secondary_postal_code
    ].filter(Boolean).join(', ');
}

return [{
    json: {
        _route: 'found',
        task_id: taskData.task_id,
        client_id: client.id,
        knumber: client.knumber,
        primary_address: primaryAddress,
        secondary_address: secondaryAddress,
        existing_travel_times: client.clinic_travel_times || {}
    }
}];
```

---

### Node 7: Get All Clinic Locations - Supabase

- **Type:** Supabase
- **Name:** `Get All Clinic Locations - Supabase`
- **Configuration:**
  - Operation: `Get Many`
  - Table: `destinations`
  - Return All: `true`
  - **Settings:** Enable `Always Output Data: true`

---

### Node 8: Calculate Drive Times - Code

- **Type:** Code
- **Name:** `Calculate Drive Times - Code`
- **Code:**

```javascript
// TASK - Process Drive Times - Calculate via Google Maps
// Version: v1.0.0
// Calculates drive times from client to all clinics

const clientData = $('Check Client Found - Code').first().json;
const clinics = $input.all().map(i => i.json);
const taskId = clientData.task_id;

// Google Maps API Key from environment
const GOOGLE_MAPS_API_KEY = $env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
    return [{
        json: {
            _route: 'failed',
            task_id: taskId,
            error_message: 'Google Maps API key not configured'
        }
    }];
}

const primaryAddress = clientData.primary_address;
const secondaryAddress = clientData.secondary_address;

if (!primaryAddress) {
    return [{
        json: {
            _route: 'failed',
            task_id: taskId,
            error_message: 'Client has no valid address'
        }
    }];
}

// Build clinic travel times object
const travelTimes = {};

try {
    for (const clinic of clinics) {
        if (!clinic.address || !clinic.name) continue;

        const clinicName = clinic.name;
        travelTimes[clinicName] = {};

        // Calculate from primary address
        const primaryResult = await calculateDriveTime(
            primaryAddress,
            clinic.address,
            GOOGLE_MAPS_API_KEY
        );

        if (primaryResult.success) {
            travelTimes[clinicName].primary = {
                duration_minutes: primaryResult.duration_minutes,
                distance_km: primaryResult.distance_km,
                address: primaryAddress
            };
        }

        // Calculate from secondary address if exists
        if (secondaryAddress) {
            const secondaryResult = await calculateDriveTime(
                secondaryAddress,
                clinic.address,
                GOOGLE_MAPS_API_KEY
            );

            if (secondaryResult.success) {
                travelTimes[clinicName].secondary = {
                    duration_minutes: secondaryResult.duration_minutes,
                    distance_km: secondaryResult.distance_km,
                    address: secondaryAddress
                };
            }
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    return [{
        json: {
            _route: 'success',
            task_id: taskId,
            client_id: clientData.client_id,
            clinic_travel_times: travelTimes,
            clinics_processed: Object.keys(travelTimes).length
        }
    }];

} catch (error) {
    return [{
        json: {
            _route: 'failed',
            task_id: taskId,
            error_message: `Google Maps API error: ${error.message}`
        }
    }];
}

// Helper function to calculate drive time
async function calculateDriveTime(origin, destination, apiKey) {
    try {
        const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
        url.searchParams.set('origins', origin);
        url.searchParams.set('destinations', destination);
        url.searchParams.set('mode', 'driving');
        url.searchParams.set('units', 'metric');
        url.searchParams.set('key', apiKey);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status !== 'OK') {
            return { success: false, error: data.status };
        }

        const element = data.rows[0]?.elements[0];
        if (!element || element.status !== 'OK') {
            return { success: false, error: element?.status || 'No result' };
        }

        // Duration in seconds, convert to minutes
        const durationMinutes = Math.round(element.duration.value / 60);
        // Distance in meters, convert to km
        const distanceKm = Math.round(element.distance.value / 100) / 10;

        return {
            success: true,
            duration_minutes: durationMinutes,
            distance_km: distanceKm
        };

    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

---

### Node 9: Check Calculation Success - Switch

- **Type:** Switch
- **Name:** `Check Calculation Success - Switch`
- **Configuration:**
  - Rules:
    - **Rule 1 (success):** `{{ $json._route }}` equals `success`
    - **Rule 2 (failed):** `{{ $json._route }}` equals `failed`

---

### Node 10 (Failed Branch): Fail Task - Supabase

- **Type:** Supabase
- **Name:** `Fail Task - Supabase`
- **Configuration:**
  - Operation: `Update`
  - Table: `background_tasks`
  - Columns:
    - `status`: `failed`
    - `error_message`: `{{ $json.error_message }}`
    - `completed_at`: `{{ $now.toISO() }}`
  - Filters:
    - `id` equals `{{ $json.task_id }}`
  - **Settings:** Enable `Always Output Data: true`

---

### Node 11 (Success Branch): Update Client Travel Times - Supabase

- **Type:** Supabase
- **Name:** `Update Client Travel Times - Supabase`
- **Configuration:**
  - Operation: `Update`
  - Table: `clients`
  - Columns:
    - `clinic_travel_times`: `{{ JSON.stringify($json.clinic_travel_times) }}`
    - `updated_at`: `{{ $now.toISO() }}`
  - Filters:
    - `id` equals `{{ $json.client_id }}`
  - **Settings:** Enable `Always Output Data: true`

---

### Node 12: Complete Task - Supabase

- **Type:** Supabase
- **Name:** `Complete Task - Supabase`
- **Configuration:**
  - Operation: `Update`
  - Table: `background_tasks`
  - Columns:
    - `status`: `completed`
    - `completed_at`: `{{ $now.toISO() }}`
    - `result`: `{{ JSON.stringify({ clinics_processed: $json.clinics_processed }) }}`
  - Filters:
    - `id` equals `{{ $('Calculate Drive Times - Code').first().json.task_id }}`
  - **Settings:** Enable `Always Output Data: true`

---

## Error Handling

The workflow handles errors at multiple points:

| Error Point | Handling |
|-------------|----------|
| Invalid request | Silently exits (no task to update) |
| Client not found | Marks task as failed with message |
| Google Maps API error | Marks task as failed with API error |
| Database update error | Task remains in processing state |

---

## Testing

### Manual Test via Webhook

1. **Create a test background task:**
   ```sql
   INSERT INTO background_tasks (
       entity_type, entity_id, entity_label, task_type,
       status, created_by
   )
   SELECT
       'client',
       c.id::text,
       c.firstname || ' ' || c.lastname,
       'calculate_drive_times',
       'pending',
       (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
   FROM clients c
   WHERE c.active = true
   LIMIT 1
   RETURNING id;
   ```

2. **Trigger the webhook:**
   ```bash
   curl -X POST https://your-n8n-url/webhook/process-drive-times \
     -H "Content-Type: application/json" \
     -d '{
       "task_id": "uuid-from-step-1",
       "client_id": "client-id",
       "client_address": "123 Main St, Halifax, NS, B3H 1A1"
     }'
   ```

3. **Check task status:**
   ```sql
   SELECT * FROM background_tasks WHERE id = 'uuid-from-step-1';
   ```

4. **Check client travel times:**
   ```sql
   SELECT knumber, clinic_travel_times FROM clients
   WHERE id = 'client-id';
   ```

---

## Environment Variables Required

| Variable | Description |
|----------|-------------|
| `GOOGLE_MAPS_API_KEY` | Google Maps Distance Matrix API key |

---

## Related Files

- **SQL Schema:** `database/sql/12_background_tasks_schema.sql`
- **Task Endpoints:** `N8N-TASK-ENDPOINTS-INSTRUCTIONS.md`
- **Add Client Async:** `N8N-CLIENT-ADD-ASYNC-INSTRUCTIONS.md`
