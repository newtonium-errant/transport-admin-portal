# N8N Instruction Doc: Fallback Transit Time Calculation for Update Appointment Async

**Workflow:** `APPT - Update Appointment Async` (webhook path: `update-appointment-complete`)
**Date:** 2026-03-03
**Purpose:** When updating an appointment, detect when transit time is missing/default/undefined for the client-destination pairing, and calculate it via Google Maps API. Persist the result in both the `client_destination_distances` table AND the client's `clinic_travel_times` JSONB column.

---

## Problem

When the frontend sends an appointment update, the transit time can be missing or at the default value (30 minutes) because the client-destination pairing has no pre-calculated travel time. The frontend logs:
```
[Transit Time] Direct lookup for Novaket - Halifax: undefined
[Transit Time] No travel time found for clinic: Novaket - Halifax
```

The existing traffic-aware calculation only fires when the user explicitly checks "Calculate traffic-aware transit" (the `calculate_traffic_transit` flag). There is no fallback for missing/default transit times.

## Solution Overview

Add a new async step `fallback_transit_calc` that:
1. Detects when transit time appears to be missing/default (value of 30 = the hardcoded default)
2. Calls Google Maps Distance Matrix API with pickup_address → destination address
3. Updates the appointment with the calculated transit time and recalculated pickup/dropoff
4. Persists the result into `client_destination_distances` table (upsert via delete-then-insert)
5. Merges the result into the client's `clinic_travel_times` JSONB column

**Insertion point:** In the async section, BEFORE the existing traffic calc check. If the fallback fires, it should SKIP the traffic calc (since we just calculated it).

---

## Changes Required (5 modifications)

### Change 1: Modify "Validate Request - Code" node

Add a `fallback_transit` flag by detecting when transit time equals the default 30 minutes AND the traffic checkbox is NOT checked.

**Node:** `Validate Request - Code` (ID: `ua-val01-0001`, position [-1664, 288])

**Find this line in the return statement (near the end of the code):**
```javascript
calculate_traffic_transit: data.calculate_traffic_transit === true || data.calculate_traffic_transit === 'true',
```

**Replace the entire Code node content with:**
```javascript
// Validate Request - v3.0.0
// Type-aware validation + traffic flag + fallback transit detection
const webhookData = $('Webhook - Update Appointment').first().json;
const data = webhookData.body;
const user = $('JWT Validation - Code').first().json.user;

if (!data.id) {
  return [{ json: { validationResult: 'invalid', error: 'Appointment ID is required' } }];
}
if (!data.knumber) {
  return [{ json: { validationResult: 'invalid', error: 'Client K number is required' } }];
}
if (!data.appointmentDateTime) {
  return [{ json: { validationResult: 'invalid', error: 'Appointment date/time is required' } }];
}

const appointmentType = data.appointment_type || 'round_trip';
const validTypes = ['round_trip', 'one_way', 'support'];
if (!validTypes.includes(appointmentType)) {
  return [{ json: { validationResult: 'invalid', error: 'Invalid appointment_type: ' + appointmentType } }];
}

if (appointmentType === 'one_way') {
  const validDirs = ['to_clinic', 'to_home'];
  const dir = data.trip_direction || '';
  if (!validDirs.includes(dir)) {
    return [{ json: { validationResult: 'invalid', error: 'trip_direction required for one_way' } }];
  }
}

if (appointmentType === 'support') {
  if (!data.event_name || !data.event_name.trim()) {
    return [{ json: { validationResult: 'invalid', error: 'event_name required for support type' } }];
  }
}

const trafficChecked = data.calculate_traffic_transit === true || data.calculate_traffic_transit === 'true';
const transitVal = parseInt(data.transitTime) || 30;
// Detect fallback: transit is default (30) AND traffic not checked
// AND not support type (support doesn't use transit)
const needsFallback = (!trafficChecked && transitVal === 30 && appointmentType !== 'support') ? true : false;

return [{ json: {
  validationResult: 'valid',
  ...data,
  appointment_type: appointmentType,
  trip_direction: data.trip_direction || null,
  event_name: data.event_name || null,
  calculate_traffic_transit: trafficChecked,
  needs_fallback_transit: needsFallback,
  userId: user?.id || null,
  userName: user?.username || 'unknown',
  userRole: user?.role || 'unknown'
} }];
// v3.0.0 - Added needs_fallback_transit detection
```

---

### Change 2: Modify "Compare Current vs New - Code" node

Pass through the `needs_fallback_transit` flag.

**Node:** `Compare Current vs New - Code` (ID: `ua-cmp01-0001`, position [-720, 160])

**Replace the entire Code node content with:**
```javascript
// Compare Current vs New - v3.0.0
// Type fields, traffic flag, fallback transit, entity label
const requestData = $('Calculate Times - Code').first().json;
const currentAppointment = $input.first().json;

const hasOriginalDriver = currentAppointment.driver_assigned !== null && currentAppointment.driver_assigned !== undefined;
const hasOriginalCalendarEvent = currentAppointment.driver_calendar_event_id && currentAppointment.driver_calendar_event_id !== null;
const hasNewDriver = requestData.driver_assigned && requestData.driver_assigned !== null;
const driverChanged = currentAppointment.driver_assigned !== requestData.driver_assigned;

const hasOrphanedEvent = (!hasOriginalDriver && hasOriginalCalendarEvent) ? 'true' : 'false';
const needsDelete = (driverChanged && hasOriginalDriver && hasOriginalCalendarEvent) ? 'true' : 'false';

const calendarFieldsChanged = (
  currentAppointment.appointmenttime !== requestData.appointmentDateTime ||
  currentAppointment.pickuptime !== requestData.pickupTime ||
  currentAppointment.dropOffTime !== requestData.dropOffTime ||
  currentAppointment.locationname !== requestData.location ||
  currentAppointment.locationaddress !== requestData.locationAddress ||
  currentAppointment.scheduling_notes !== requestData.scheduling_notes ||
  currentAppointment.notes !== requestData.notes
);

const needsSync = (hasNewDriver && (driverChanged || calendarFieldsChanged)) ? 'true' : 'false';

const apptType = requestData.appointment_type || 'round_trip';
const trafficFlag = requestData.calculate_traffic_transit === true || requestData.calculate_traffic_transit === 'true';
const trafficCalcNeeded = (trafficFlag && apptType !== 'support') ? 'true' : 'false';
const fallbackNeeded = requestData.needs_fallback_transit === true ? 'true' : 'false';
const hasAsyncTask = (needsDelete === 'true' || needsSync === 'true' || trafficCalcNeeded === 'true' || fallbackNeeded === 'true') ? 'true' : 'false';

const dateStr = new Date(requestData.appointmentDateTime).toLocaleDateString('en-CA');
const entityLabel = (requestData.knumber || 'Unknown') + ' - ' + (requestData.location || 'Unknown') + ' (' + dateStr + ')';

return [{ json: {
  ...requestData,
  currentAppointment: currentAppointment,
  appointment_type: apptType,
  trip_direction: requestData.trip_direction || null,
  event_name: requestData.event_name || null,
  trafficCalcNeeded: trafficCalcNeeded,
  fallbackTransitNeeded: fallbackNeeded,
  hasAsyncTask: hasAsyncTask,
  entityLabel: entityLabel,
  calendarOperations: {
    needsDelete: needsDelete,
    needsSync: needsSync,
    hasOrphanedEvent: hasOrphanedEvent,
    originalDriverAssigned: currentAppointment.driver_assigned,
    originalCalendarEventId: currentAppointment.driver_calendar_event_id,
    newDriverAssigned: requestData.driver_assigned,
    driverChanged: driverChanged,
    calendarFieldsChanged: calendarFieldsChanged,
    hasOriginalDriver: hasOriginalDriver,
    hasOriginalCalendarEvent: hasOriginalCalendarEvent
  }
} }];
// v3.0.0 - Added fallbackTransitNeeded flag
```

---

### Change 3: Modify "Decide Async Task - Code" node

Add `fallback_transit_calc` to the async steps list when needed.

**Node:** `Decide Async Task - Code` (ID: `ua-decide01-0001`, position [480, 160])

**Replace the entire Code node content with:**
```javascript
// Decide Async Task - v2.0.0
// Includes fallback transit calc step
const data = $('Compare Current vs New - Code').first().json;
const needsDelete = data.calendarOperations.needsDelete === 'true';
const needsSync = data.calendarOperations.needsSync === 'true';
const trafficCalc = data.trafficCalcNeeded === 'true';
const fallbackCalc = data.fallbackTransitNeeded === 'true';
const hasAsyncTask = needsDelete || needsSync || trafficCalc || fallbackCalc;

const steps = [];
if (fallbackCalc) steps.push('fallback_transit_calc');
if (trafficCalc) steps.push('traffic_calc');
if (needsDelete) steps.push('calendar_delete');
if (needsSync) steps.push('calendar_sync');

return [{ json: {
  ...data,
  hasAsyncTask: hasAsyncTask ? 'true' : 'false',
  asyncSteps: steps,
  taskMetadata: hasAsyncTask ? {
    entity_type: 'appointment',
    entity_id: data.id,
    entity_label: data.entityLabel,
    task_type: 'appointment_async_ops',
    status: 'pending',
    created_by: data.userId || null
  } : null
} }];
// v2.0.0 - Added fallback_transit_calc step
```

---

### Change 4: Modify "Prepare Async Context - Code" node

Pass through the `fallbackTransitNeeded` flag.

**Node:** `Prepare Async Context - Code` (ID: `ua-ctx01-0001`, position [2160, 0])

**Replace the entire Code node content with:**
```javascript
// Prepare Async Context - v2.0.0
// Includes fallback transit context
const data = $('Decide Async Task - Code').first().json;
const taskRow = $('Create Background Task - Supabase').first().json;

return [{ json: {
  taskId: taskRow.id,
  appointmentId: data.id,
  knumber: data.knumber,
  appointment_type: data.appointment_type || 'round_trip',
  trip_direction: data.trip_direction || null,
  event_name: data.event_name || null,
  appointmentDateTime: data.appointmentDateTime,
  appointmentLength: data.appointmentLength,
  transitTime: data.transitTime,
  pickupTime: data.pickupTime,
  dropOffTime: data.dropOffTime,
  location: data.location,
  locationAddress: data.locationAddress,
  pickup_address: data.pickup_address,
  clinic_id: data.clinic_id,
  scheduling_notes: data.scheduling_notes,
  notes: data.notes,
  driver_instructions: data.driver_instructions,
  trafficCalcNeeded: data.trafficCalcNeeded,
  fallbackTransitNeeded: data.fallbackTransitNeeded || 'false',
  needsDelete: data.calendarOperations.needsDelete,
  needsSync: data.calendarOperations.needsSync,
  originalDriverAssigned: data.calendarOperations.originalDriverAssigned,
  originalCalendarEventId: data.calendarOperations.originalCalendarEventId,
  newDriverAssigned: data.calendarOperations.newDriverAssigned,
  driver_assigned: data.driver_assigned,
  driver_first_name: data.driver_first_name,
  stepResults: {}
} }];
// v2.0.0 - Added fallbackTransitNeeded
```

---

### Change 5: Add new nodes + rewire the async section

This is the main insertion. We add 5 new nodes between `Mark Task Processing - Supabase` and the existing `Check Traffic Calc - Switch`.

#### Current wiring (async section):
```
Mark Task Processing → Check Traffic Calc Switch
                       ├─ Calc Traffic → Get Maps API Key → Prepare Distance Request → Call Distance Matrix → Process Traffic Result → Update Appt Times → Check Async Delete
                       └─ Skip Traffic → Check Async Delete
```

#### New wiring (async section):
```
Mark Task Processing → Check Fallback Needed - Switch
                       ├─ Fallback → Get Maps Key (Fallback) → Fallback Distance Calc - Code → Call Fallback Distance - HTTP → Process Fallback Result - Code → Persist Fallback Data - Code → Get Client for Merge - Supabase → Merge Client Travel Times - Code → Update Client Travel Times - Supabase → Check Async Delete
                       └─ No Fallback → Check Traffic Calc Switch (existing)
                                        ├─ Calc Traffic → (existing traffic flow) → Check Async Delete
                                        └─ Skip Traffic → Check Async Delete
```

When fallback fires, it SKIPS the traffic calc (since fallback already calculated transit from Google Maps).

---

#### Step 5a: Add "Check Fallback Needed - Switch" node

**Create a new Switch node** at position `[2640, -400]` (or wherever fits cleanly):

- **Name:** `Check Fallback Needed - Switch`
- **Type:** Switch (n8n-nodes-base.switch, typeVersion 3.3)
- **Output 0 (Fallback):** `$('Prepare Async Context - Code').first().json.fallbackTransitNeeded` equals `"true"`
- **Output 1 (No Fallback):** `$('Prepare Async Context - Code').first().json.fallbackTransitNeeded` equals `"false"`

---

#### Step 5b: Add "Get Maps Key (Fallback) - Supabase" node

**Create a new Supabase Get node** at position `[2880, -560]`:

- **Name:** `Get Maps Key (Fallback) - Supabase`
- **Table:** `app_config`
- **Operation:** Get
- **Filter:** `key` = `google_maps_api_key`
- **alwaysOutputData:** `true`
- **Credential:** `Supabase Service Role`

---

#### Step 5c: Add "Fallback Distance Calc - Code" node

**Create a new Code node** at position `[3120, -560]`:

**Code content (copy-paste ready):**
```javascript
// Fallback Distance Calc - v1.0.0
// Build Google Maps request for missing transit time
const ctx = $('Prepare Async Context - Code').first().json;
const apiKey = $('Get Maps Key (Fallback) - Supabase').first().json.value;

if (!apiKey) {
  return [{ json: {
    ...ctx,
    fallbackError: 'Google Maps API key not found',
    stepResults: { ...ctx.stepResults, fallback_transit_calc: 'failed_no_key' }
  } }];
}

const origins = ctx.pickup_address || '';
const destinations = ctx.locationAddress || '';

if (!origins || !destinations) {
  return [{ json: {
    ...ctx,
    fallbackError: 'Missing pickup or destination address',
    stepResults: { ...ctx.stepResults, fallback_transit_calc: 'failed_no_address' }
  } }];
}

return [{ json: {
  ...ctx,
  fb_apiKey: apiKey,
  fb_origins: origins,
  fb_destinations: destinations
} }];
// v1.0.0 - Prepare fallback distance request
```

---

#### Step 5d: Add "Call Fallback Distance - HTTP" node

**Create a new HTTP Request node** at position `[3360, -560]`:

- **Name:** `Call Fallback Distance - HTTP`
- **Method:** GET
- **URL:** `https://maps.googleapis.com/maps/api/distancematrix/json`
- **Send Query:** Yes
- **Specify Query:** JSON
- **JSON Query:** `={{ JSON.stringify({ origins: $json.fb_origins, destinations: $json.fb_destinations, key: $json.fb_apiKey, mode: 'driving', units: 'metric' }) }}`
- **Options → Timeout:** `30000`
- **On Error:** Continue (Regular Output)
- **alwaysOutputData:** `true`

---

#### Step 5e: Add "Process Fallback Result - Code" node

**Create a new Code node** at position `[3600, -560]`:

**Code content (copy-paste ready):**
```javascript
// Process Fallback Result - v1.0.0
// Extract distance/duration, update appointment timing
const ctx = $('Fallback Distance Calc - Code').first().json;
const mapResult = $input.first().json;
const stepResults = ctx.stepResults || {};

if (ctx.fallbackError) {
  return [{ json: { ...ctx, stepResults: { ...stepResults, fallback_transit_calc: 'failed' } } }];
}

const el = mapResult.rows?.[0]?.elements?.[0];
if (!el || el.status !== 'OK') {
  console.error('Fallback Maps API failed: ' + (el?.status || 'no response'));
  return [{ json: {
    ...ctx,
    stepResults: { ...stepResults, fallback_transit_calc: 'failed_api_error' }
  } }];
}

const rawMin = Math.ceil(el.duration.value / 60);
// Apply +5 min buffer and round to nearest 5
const transitMin = Math.ceil((rawMin + 5) / 5) * 5;
const distKm = parseFloat((el.distance.value / 1000).toFixed(2));

// Recalculate pickup and dropoff with new transit
const apptDT = new Date(ctx.appointmentDateTime);
const apptLen = ctx.appointmentLength || 120;
const apptType = ctx.appointment_type || 'round_trip';
const dir = ctx.trip_direction || 'to_clinic';

let newPickup, newDropOff;
if (apptType === 'one_way') {
  if (dir === 'to_home') {
    newPickup = apptDT.toISOString();
    newDropOff = new Date(apptDT.getTime() + (transitMin * 60000)).toISOString();
  } else {
    newPickup = new Date(apptDT.getTime() - (transitMin * 60000)).toISOString();
    newDropOff = apptDT.toISOString();
  }
} else {
  newPickup = new Date(apptDT.getTime() - (transitMin * 60000)).toISOString();
  const total = apptLen + transitMin;
  newDropOff = new Date(apptDT.getTime() + (total * 60000)).toISOString();
}

return [{ json: {
  ...ctx,
  fb_transitMinutes: transitMin,
  fb_distanceKm: distKm,
  fb_newPickupTime: newPickup,
  fb_newDropOffTime: newDropOff,
  fb_clinicName: ctx.location,
  fb_clinicId: ctx.clinic_id,
  stepResults: {
    ...stepResults,
    fallback_transit_calc: 'completed',
    fallback_transit_minutes: transitMin,
    fallback_distance_km: distKm
  }
} }];
// v1.0.0 - Process fallback result with buffer
```

---

#### Step 5f: Add "Update Appt Fallback Times - Supabase" node

**Create a new Supabase Update node** at position `[3840, -560]`:

- **Name:** `Update Appt Fallback Times - Supabase`
- **Table:** `appointments`
- **Operation:** Update
- **Filter:** `id` eq `={{ $json.appointmentId }}`
- **Fields:**
  - `transittime` = `={{ $json.fb_transitMinutes }}`
  - `pickuptime` = `={{ $json.fb_newPickupTime }}`
  - `dropOffTime` = `={{ $json.fb_newDropOffTime }}`
- **alwaysOutputData:** `true`
- **Credential:** `Supabase Service Role`

---

#### Step 5g: Add "Get Client for Merge - Supabase" node

**Create a new Supabase Get node** at position `[4080, -560]`:

- **Name:** `Get Client for Merge - Supabase`
- **Table:** `clients`
- **Operation:** Get
- **Filter:** `knumber` eq `={{ $('Prepare Async Context - Code').first().json.knumber }}`
- **alwaysOutputData:** `true`
- **Credential:** `Supabase Service Role`

---

#### Step 5h: Add "Merge Client Travel Times - Code" node

**Create a new Code node** at position `[4320, -560]`:

**Code content (copy-paste ready):**
```javascript
// Merge Client Travel Times - v1.0.0
// Merge fallback result into client clinic_travel_times JSONB
const ctx = $('Process Fallback Result - Code').first().json;
const client = $input.first().json;
const clinicName = ctx.fb_clinicName;

if (!clinicName || !ctx.fb_transitMinutes) {
  return [{ json: { ...ctx, fb_mergeSkipped: 'true' } }];
}

// Get existing travel times or empty object
let travelTimes = client.clinic_travel_times || {};
if (typeof travelTimes === 'string') {
  try { travelTimes = JSON.parse(travelTimes); }
  catch(e) { travelTimes = {}; }
}

// Determine address type based on pickup_address match
const pickupAddr = (ctx.pickup_address || '').toLowerCase().trim();
const primaryAddr = [
  client.civicaddress, client.city,
  client.prov, client.postalcode
].filter(Boolean).join(', ').toLowerCase().trim();

let addressType = 'primary';
if (client.secondary_civic_address) {
  const secAddr = [
    client.secondary_civic_address, client.secondary_city,
    client.secondary_province, client.secondary_postal_code
  ].filter(Boolean).join(', ').toLowerCase().trim();
  if (pickupAddr === secAddr) {
    addressType = 'secondary';
  }
}

// Merge: preserve existing entries, add/update this clinic
if (!travelTimes[clinicName]) {
  travelTimes[clinicName] = {};
}

travelTimes[clinicName][addressType] = {
  duration_minutes: ctx.fb_transitMinutes,
  distance_km: ctx.fb_distanceKm,
  calculated_at: new Date().toISOString()
};

return [{ json: {
  ...ctx,
  fb_mergedTravelTimes: travelTimes,
  fb_addressType: addressType,
  fb_mergeSkipped: 'false'
} }];
// v1.0.0 - Merge fallback into clinic_travel_times
```

---

#### Step 5i: Add "Update Client Travel Times - Supabase" node

**Create a new Supabase Update node** at position `[4560, -560]`:

- **Name:** `Update Client Travel Times (Fallback) - Supabase`
- **Table:** `clients`
- **Operation:** Update
- **Filter:** `knumber` eq `={{ $('Prepare Async Context - Code').first().json.knumber }}`
- **Fields:**
  - `clinic_travel_times` = `={{ $json.fb_mergedTravelTimes }}`
- **alwaysOutputData:** `true`
- **Credential:** `Supabase Service Role`

---

#### Step 5j: Add "Persist Fallback Distance - Code" node

We also need to persist to the `client_destination_distances` table. Since Supabase has no upsert, use the delete-before-insert pattern, but since we can't do both in one node, we'll use a Code node with `this.helpers.httpRequest()` to call Supabase REST API directly.

**Actually, simpler approach:** Add TWO Supabase nodes (Delete + Create) wired sequentially. But since this adds too many nodes, we can instead use a Code node that does the lookup table persistence via HTTP.

**Better approach:** Add a single Code node that prepares the data, followed by a Delete node and a Create node for `client_destination_distances`.

Given the complexity, let's use a simpler approach: just add a **Delete** and **Create** Supabase node pair after the travel times update.

#### Step 5j-1: Add "Delete Old Distance - Supabase" node

**Create a new Supabase node** at position `[4800, -560]`:

- **Name:** `Delete Old Distance - Supabase`
- **Table:** `client_destination_distances`
- **Operation:** Delete
- **Filter conditions:**
  - `client_id` eq `={{ $('Get Client for Merge - Supabase').first().json.id }}`
  - `destination_id` eq `={{ $('Prepare Async Context - Code').first().json.clinic_id }}`
- **alwaysOutputData:** `true`
- **Credential:** `Supabase Service Role`

**NOTE:** The delete may return "no rows deleted" if there's no existing record. That's fine because `alwaysOutputData: true` ensures the flow continues.

#### Step 5j-2: Add "Restore Fallback Data - Code" node

Since Delete nodes lose the input data, we need a Code node to restore it from upstream:

**Create a new Code node** at position `[5040, -560]`:

**Code content (copy-paste ready):**
```javascript
// Restore Fallback Data - v1.0.0
// Delete node loses input; restore from upstream
const ctx = $('Process Fallback Result - Code').first().json;
const client = $('Get Client for Merge - Supabase').first().json;

return [{ json: {
  client_id: client.id,
  destination_id: ctx.fb_clinicId,
  primary_distance_km: ctx.fb_distanceKm,
  primary_duration_minutes: ctx.fb_transitMinutes,
  addressType: ctx.fb_addressType || 'primary',
  allCtx: ctx
} }];
// v1.0.0 - Restore data after delete
```

---

#### Step 5j-3: Add "Insert Distance Lookup - Supabase" node

**Create a new Supabase node** at position `[5280, -560]`:

- **Name:** `Insert Distance Lookup - Supabase`
- **Table:** `client_destination_distances`
- **Operation:** Create
- **Fields:**
  - `client_id` = `={{ $json.client_id }}`
  - `destination_id` = `={{ $json.destination_id }}`
  - `primary_distance_km` = `={{ $json.addressType === 'primary' ? $json.primary_distance_km : null }}`
  - `primary_duration_minutes` = `={{ $json.addressType === 'primary' ? $json.primary_duration_minutes : null }}`
  - `secondary_distance_km` = `={{ $json.addressType === 'secondary' ? $json.primary_distance_km : null }}`
  - `secondary_duration_minutes` = `={{ $json.addressType === 'secondary' ? $json.primary_duration_minutes : null }}`
  - `calculation_source` = `google_maps`
- **alwaysOutputData:** `true`
- **Credential:** `Supabase Service Role`

---

### Rewiring Summary

#### Disconnect:
1. **Mark Task Processing - Supabase** → **Check Traffic Calc - Switch** (disconnect this wire)

#### Connect:
1. **Mark Task Processing - Supabase** → **Check Fallback Needed - Switch**
2. **Check Fallback Needed - Switch** output `Fallback` → **Get Maps Key (Fallback) - Supabase**
3. **Check Fallback Needed - Switch** output `No Fallback` → **Check Traffic Calc - Switch** (existing node)
4. **Get Maps Key (Fallback) - Supabase** → **Fallback Distance Calc - Code**
5. **Fallback Distance Calc - Code** → **Call Fallback Distance - HTTP**
6. **Call Fallback Distance - HTTP** → **Process Fallback Result - Code**
7. **Process Fallback Result - Code** → **Update Appt Fallback Times - Supabase**
8. **Update Appt Fallback Times - Supabase** → **Get Client for Merge - Supabase**
9. **Get Client for Merge - Supabase** → **Merge Client Travel Times - Code**
10. **Merge Client Travel Times - Code** → **Update Client Travel Times (Fallback) - Supabase**
11. **Update Client Travel Times (Fallback) - Supabase** → **Delete Old Distance - Supabase**
12. **Delete Old Distance - Supabase** → **Restore Fallback Data - Code**
13. **Restore Fallback Data - Code** → **Insert Distance Lookup - Supabase**
14. **Insert Distance Lookup - Supabase** → **Check Async Delete - Switch** (existing node, skipping traffic calc)

#### Flow diagram (fallback path):
```
Mark Task Processing
  → Check Fallback Needed - Switch
    ├─ Fallback:
    │   Get Maps Key (Fallback)
    │   → Fallback Distance Calc - Code
    │   → Call Fallback Distance - HTTP
    │   → Process Fallback Result - Code
    │   → Update Appt Fallback Times - Supabase
    │   → Get Client for Merge - Supabase
    │   → Merge Client Travel Times - Code
    │   → Update Client Travel Times (Fallback) - Supabase
    │   → Delete Old Distance - Supabase
    │   → Restore Fallback Data - Code
    │   → Insert Distance Lookup - Supabase
    │   → Check Async Delete - Switch (existing)
    │
    └─ No Fallback:
        Check Traffic Calc - Switch (existing)
        ├─ Calc Traffic → (existing traffic flow) → Check Async Delete
        └─ Skip Traffic → Check Async Delete
```

---

### Change 6: Modify "Build Task Result - Code" node

Add the `fallback_transit_calc` step result collection.

**Node:** `Build Task Result - Code` (ID: `ua-buildresult01-0001`, position [6480, 0])

**Replace the entire Code node content with:**
```javascript
// Build Task Result - v2.0.0
// Collect per-step results including fallback transit
const ctx = $('Prepare Async Context - Code').first().json;
const stepResults = {};

// Step 0: Fallback transit calc
if (ctx.fallbackTransitNeeded === 'true') {
  try {
    const fbData = $('Process Fallback Result - Code').first().json;
    stepResults.fallback_transit_calc = fbData.stepResults?.fallback_transit_calc || 'completed';
    if (fbData.stepResults?.fallback_transit_minutes) {
      stepResults.fallback_transit_minutes = fbData.stepResults.fallback_transit_minutes;
    }
    if (fbData.stepResults?.fallback_distance_km) {
      stepResults.fallback_distance_km = fbData.stepResults.fallback_distance_km;
    }
  } catch (e) {
    stepResults.fallback_transit_calc = 'skipped';
  }
} else {
  stepResults.fallback_transit_calc = 'skipped';
}

// Step 1: Traffic calc
if (ctx.trafficCalcNeeded === 'true') {
  try {
    const trafficData = $('Process Traffic Result - Code').first().json;
    stepResults.traffic_calc = trafficData.stepResults?.traffic_calc || 'completed';
    if (trafficData.stepResults?.traffic_transit_minutes) {
      stepResults.traffic_transit_minutes = trafficData.stepResults.traffic_transit_minutes;
    }
    if (trafficData.stepResults?.traffic_distance_km) {
      stepResults.traffic_distance_km = trafficData.stepResults.traffic_distance_km;
    }
  } catch (e) {
    stepResults.traffic_calc = 'skipped';
  }
} else {
  stepResults.traffic_calc = 'skipped';
}

// Step 2: Calendar delete
if (ctx.needsDelete === 'true') {
  try {
    const delResult = $('Delete Old Calendar - HTTP').first().json;
    stepResults.calendar_delete = (delResult.error || delResult.code >= 400) ? 'failed' : 'completed';
  } catch (e) {
    stepResults.calendar_delete = 'failed';
  }
} else {
  stepResults.calendar_delete = 'skipped';
}

// Step 3: Calendar sync
if (ctx.needsSync === 'true') {
  try {
    const syncResult = $('Execute Calendar API - HTTP').first().json;
    stepResults.calendar_sync = (syncResult.error || !syncResult.id) ? 'failed' : 'completed';
  } catch (e) {
    stepResults.calendar_sync = 'failed';
  }
} else {
  stepResults.calendar_sync = 'skipped';
}

const hasFailed = Object.values(stepResults).some(v => v === 'failed');
const finalStatus = hasFailed ? 'failed' : 'completed';
const failedSteps = Object.entries(stepResults).filter(([k,v]) => v === 'failed').map(([k]) => k);
const errorMsg = hasFailed ? 'One or more async steps failed: ' + failedSteps.join(', ') : null;

return [{ json: {
  taskId: ctx.taskId,
  finalStatus: finalStatus,
  errorMessage: errorMsg,
  stepResults: stepResults
} }];
// v2.0.0 - Added fallback_transit_calc step
```

---

## Testing Checklist

1. **Fallback triggers:** Update an appointment where the client has no `clinic_travel_times` entry for the destination (transit time defaults to 30). Verify:
   - [ ] Google Maps API is called with pickup_address → locationAddress
   - [ ] Appointment transit time, pickup time, and dropoff time are recalculated
   - [ ] `client_destination_distances` table has a new row for this client-destination pair
   - [ ] Client's `clinic_travel_times` JSONB has a new entry for this clinic name

2. **Fallback skipped:** Update an appointment where transit time is NOT 30 (meaning travel time was found). Verify:
   - [ ] Fallback is skipped (`fallback_transit_calc: 'skipped'` in task result)
   - [ ] Normal flow continues (traffic calc if checked, calendar sync, etc.)

3. **Traffic calc takes priority:** Update with `calculate_traffic_transit: true`. Verify:
   - [ ] Fallback is NOT triggered (traffic flag overrides)
   - [ ] Traffic calc runs as before

4. **Support type excluded:** Update a support-type appointment with transit=30. Verify:
   - [ ] Fallback is NOT triggered (support doesn't use transit)

5. **Secondary address:** Update an appointment using client's secondary address. Verify:
   - [ ] `clinic_travel_times` entry is stored under `secondary` key (not `primary`)
   - [ ] `client_destination_distances` row uses `secondary_*` columns

6. **Idempotency:** Run the same update twice. Verify:
   - [ ] Delete-before-insert pattern prevents duplicate rows in `client_destination_distances`
   - [ ] `clinic_travel_times` JSONB is merged, not overwritten (other clinics preserved)

---

## Summary of All Modified Nodes

| Node Name | Change Type | Version |
|---|---|---|
| Validate Request - Code | Modified | v2.0.0 → v3.0.0 |
| Compare Current vs New - Code | Modified | v2.0.0 → v3.0.0 |
| Decide Async Task - Code | Modified | v1.0.0 → v2.0.0 |
| Prepare Async Context - Code | Modified | v1.0.0 → v2.0.0 |
| Build Task Result - Code | Modified | v1.0.0 → v2.0.0 |
| Check Fallback Needed - Switch | **NEW** | - |
| Get Maps Key (Fallback) - Supabase | **NEW** | - |
| Fallback Distance Calc - Code | **NEW** | v1.0.0 |
| Call Fallback Distance - HTTP | **NEW** | - |
| Process Fallback Result - Code | **NEW** | v1.0.0 |
| Update Appt Fallback Times - Supabase | **NEW** | - |
| Get Client for Merge - Supabase | **NEW** | - |
| Merge Client Travel Times - Code | **NEW** | v1.0.0 |
| Update Client Travel Times (Fallback) - Supabase | **NEW** | - |
| Delete Old Distance - Supabase | **NEW** | - |
| Restore Fallback Data - Code | **NEW** | v1.0.0 |
| Insert Distance Lookup - Supabase | **NEW** | - |
