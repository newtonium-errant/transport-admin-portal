# APPT - Update Appointment Async: Build Instructions

**Version:** v1.0.0
**Date:** 2026-03-03
**Workflow Name:** `APPT - Update Appointment Async`
**Endpoint:** `POST /update-appointment-complete`
**Replaces:** `APPT - Update Appointment (8)` (27-node synchronous workflow)

---

## Overview

Converts the synchronous Update Appointment workflow to an async pattern: the core DB save returns immediately (~200-300ms), while calendar operations and traffic-aware transit calculations run as a single sequential background branch.

### Architecture

```
SYNC PATH (Branch A - immediate response):
  Webhook -> JWT -> Validate (type-aware) -> Calculate Times (type-aware)
    -> Get Current Appt -> Compare Current vs New (enhanced)
    -> Check Delete Needed Switch
        |-- Delete path -> Update Appt (null event ID + type fields)
        \-- No Delete -> Update Appt (type fields)
    -> Decide Async Task
    -> Needs Async Switch
        |-- Yes -> Create Background Task -> Format Async Response
            -> [parallel: Respond, Log Audit, Prepare Async Context]
        \-- No -> Format Simple Response -> Respond

ASYNC BRANCH (sequential, after Respond to Webhook):
  Step 1: Traffic-aware transit calc (if checkbox + not support)
  Step 2: Delete old calendar event (if driver changed)
  Step 3: Create/update new calendar event (if driver assigned)
  Finalize: Mark background_task completed/failed
```

---

## Prerequisites

- Migration 19 applied (`appointment_type`, `trip_direction`, `event_name` columns)
- Migration 26 applied (`background_tasks` table)
- Migration 28 applied (`traffic_aware_transit` column on appointments)
- Google Maps API key in `app_config` (key: `google_maps_api_key`)
- Google Calendar OAuth2 credential configured

---

## Node Inventory (~41 nodes)

### Sync Path (20 nodes)

| # | Node Name | Type | Status |
|---|-----------|------|--------|
| 1 | Webhook - Update Appointment | Webhook | Keep (already responseNode) |
| 2 | Get JWT Secret - Supabase | Supabase | Keep |
| 3 | JWT Validation - Code | Code | Keep |
| 4 | JWT Validation - Switch | Switch | Keep |
| 5 | Format JWT Error - Code | Code | Keep |
| 6 | Validate Request - Code | Code | **Modify v2.0.0** |
| 7 | Validation - Switch | Switch | Keep |
| 8 | Format Validation Error - Code | Code | Keep |
| 9 | Calculate Times - Code | Code | **Modify v2.0.0** |
| 10 | Get Current Appointment - Supabase | Supabase | Keep |
| 11 | Compare Current vs New - Code | Code | **Modify v2.0.0** |
| 12 | Check Delete Needed - Switch | Switch | Keep |
| 13 | Update Appointment - Supabase | Supabase | **Modify** (add 3 fields) |
| 14 | Update Appt After Delete - Supabase | Supabase | **Modify** (add 3 fields) |
| 15 | Decide Async Task - Code | Code | **NEW** |
| 16 | Needs Async - Switch | Switch | **NEW** |
| 17 | Create Background Task - Supabase | Supabase | **NEW** |
| 18 | Format Async Response - Code | Code | **NEW** |
| 19 | Format Simple Response - Code | Code | **NEW** |
| 20 | Respond to Webhook | Respond | Keep |

### Async Branch (19 nodes)

| # | Node Name | Type | Status |
|---|-----------|------|--------|
| 21 | Log Audit - Supabase | Supabase | **NEW** |
| 22 | Prepare Async Context - Code | Code | **NEW** |
| 23 | Mark Task Processing - Supabase | Supabase | **NEW** |
| 24 | Check Traffic Calc - Switch | Switch | **NEW** |
| 25 | Get Maps API Key - Supabase | Supabase | **NEW** |
| 26 | Prepare Distance Request - Code | Code | **NEW** |
| 27 | Call Distance Matrix - HTTP | HTTP | **NEW** |
| 28 | Process Traffic Result - Code | Code | **NEW** |
| 29 | Update Appt Times - Supabase | Supabase | **NEW** |
| 30 | Check Async Delete - Switch | Switch | **NEW** |
| 31 | Get Old Driver - Supabase | Supabase | **NEW** (from sync) |
| 32 | Delete Old Calendar - HTTP | HTTP | **NEW** (from sync) |
| 33 | Check Async Sync - Switch | Switch | **NEW** |
| 34 | Get New Driver - Supabase | Supabase | **NEW** (from sync) |
| 35 | Get Updated Appt - Supabase | Supabase | **NEW** (from sync) |
| 36 | Get Client - Supabase | Supabase | **NEW** (from sync) |
| 37 | Prepare Calendar Event - Code | Code | **NEW** (type-aware) |
| 38 | Execute Calendar API - HTTP | HTTP | **NEW** (from sync) |
| 39 | Save Calendar Event ID - Supabase | Supabase | **NEW** (from sync) |
| 40 | Build Task Result - Code | Code | **NEW** |
| 41 | Mark Task Complete - Supabase | Supabase | **NEW** |

### Removed Nodes (from sync path)

- Check Sync Needed - Switch
- Get New Driver - Supabase (moved to async)
- Validate New Driver - Code (merged into Prepare Calendar Event)
- Get Appointment for Calendar - Supabase (moved to async)
- Get Client for Calendar - Supabase (moved to async)
- Prepare Calendar Sync - Code (replaced by type-aware version)
- Execute Calendar Sync - HTTP (moved to async)
- Prepare Event Update - Code (merged into async flow)
- Update Calendar Event ID - Supabase (moved to async)
- Get Driver for Delete - Supabase (moved to async)
- Delete Calendar Event - HTTP (moved to async)

---

## Code Nodes - Complete Content

### Node 6: Validate Request - Code (v2.0.0)

```javascript
// Validate Request - v2.0.0
// Type-aware validation for appointment update
const webhookData = $('Webhook - Update Appointment').first().json;
const data = webhookData.body;
const user = $('JWT Validation - Code').first().json.user;

if (!data.id) {
  return [{
    json: {
      validationResult: 'invalid',
      error: 'Appointment ID is required'
    }
  }];
}

if (!data.knumber) {
  return [{
    json: {
      validationResult: 'invalid',
      error: 'Client K number is required'
    }
  }];
}

if (!data.appointmentDateTime) {
  return [{
    json: {
      validationResult: 'invalid',
      error: 'Appointment date/time is required'
    }
  }];
}

const appointmentType = data.appointment_type || 'round_trip';
const validTypes = ['round_trip', 'one_way', 'support'];
if (!validTypes.includes(appointmentType)) {
  return [{
    json: {
      validationResult: 'invalid',
      error: 'Invalid appointment_type: ' + appointmentType
    }
  }];
}

if (appointmentType === 'one_way') {
  const validDirs = ['to_clinic', 'to_home'];
  const dir = data.trip_direction || '';
  if (!validDirs.includes(dir)) {
    return [{
      json: {
        validationResult: 'invalid',
        error: 'trip_direction required for one_way'
      }
    }];
  }
}

if (appointmentType === 'support') {
  if (!data.event_name || !data.event_name.trim()) {
    return [{
      json: {
        validationResult: 'invalid',
        error: 'event_name required for support type'
      }
    }];
  }
}

return [{
  json: {
    validationResult: 'valid',
    ...data,
    appointment_type: appointmentType,
    trip_direction: data.trip_direction || null,
    event_name: data.event_name || null,
    calculate_traffic_transit: data.calculate_traffic_transit === true
      || data.calculate_traffic_transit === 'true',
    userId: user?.id || null,
    userName: user?.username || 'unknown',
    userRole: user?.role || 'unknown'
  }
}];
// v2.0.0 - Type-aware validation + traffic flag
```

### Node 9: Calculate Times - Code (v2.0.0)

```javascript
// Calculate Times - v2.0.0
// Type-aware timing calculations
const appointmentDateTime = new Date($json.appointmentDateTime);
const transitTime = parseInt($json.transitTime) || 30;
const appointmentLength = parseInt($json.appointmentLength) || 120;
const appointmentType = $json.appointment_type || 'round_trip';
const oneWayDirection = $json.trip_direction || 'to_clinic';

let pickupTime, dropOffTime;

if (appointmentType === 'one_way') {
  if (oneWayDirection === 'to_home') {
    pickupTime = appointmentDateTime.toISOString();
    const dropOff = new Date(
      appointmentDateTime.getTime() + (transitTime * 60000)
    );
    dropOffTime = dropOff.toISOString();
  } else {
    const pickup = new Date(
      appointmentDateTime.getTime() - (transitTime * 60000)
    );
    pickupTime = pickup.toISOString();
    dropOffTime = appointmentDateTime.toISOString();
  }
} else if (appointmentType === 'support') {
  pickupTime = appointmentDateTime.toISOString();
  const dropOff = new Date(
    appointmentDateTime.getTime()
    + (appointmentLength * 60000)
  );
  dropOffTime = dropOff.toISOString();
} else {
  const pickup = new Date(
    appointmentDateTime.getTime() - (transitTime * 60000)
  );
  pickupTime = pickup.toISOString();
  const totalDuration = appointmentLength + transitTime;
  const dropOff = new Date(
    appointmentDateTime.getTime()
    + (totalDuration * 60000)
  );
  dropOffTime = dropOff.toISOString();
}

return [{
  json: {
    ...$json,
    pickupTime: pickupTime,
    dropOffTime: dropOffTime,
    transitTime: transitTime,
    appointmentLength: appointmentLength
  }
}];
// v2.0.0 - Type-aware timing calculations
```

### Node 11: Compare Current vs New - Code (v2.0.0)

```javascript
// Compare Current vs New - v2.0.0
// Enhanced with type fields, traffic flag, entity label
const requestData = $('Calculate Times - Code').first().json;
const currentAppointment = $input.first().json;

const hasOriginalDriver =
  currentAppointment.driver_assigned !== null
  && currentAppointment.driver_assigned !== undefined;
const hasOriginalCalendarEvent =
  currentAppointment.driver_calendar_event_id
  && currentAppointment.driver_calendar_event_id !== null;
const hasNewDriver = requestData.driver_assigned
  && requestData.driver_assigned !== null;
const driverChanged =
  currentAppointment.driver_assigned
  !== requestData.driver_assigned;

const hasOrphanedEvent =
  (!hasOriginalDriver && hasOriginalCalendarEvent)
  ? 'true' : 'false';

const needsDelete =
  (driverChanged && hasOriginalDriver
  && hasOriginalCalendarEvent)
  ? 'true' : 'false';

const calendarFieldsChanged = (
  currentAppointment.appointmenttime
    !== requestData.appointmentDateTime
  || currentAppointment.pickuptime !== requestData.pickupTime
  || currentAppointment.dropOffTime !== requestData.dropOffTime
  || currentAppointment.locationname !== requestData.location
  || currentAppointment.locationaddress
    !== requestData.locationAddress
  || currentAppointment.scheduling_notes
    !== requestData.scheduling_notes
  || currentAppointment.notes !== requestData.notes
);

const needsSync =
  (hasNewDriver && (driverChanged || calendarFieldsChanged))
  ? 'true' : 'false';

const apptType = requestData.appointment_type || 'round_trip';
const trafficFlag = requestData.calculate_traffic_transit === true
  || requestData.calculate_traffic_transit === 'true';
const trafficCalcNeeded =
  (trafficFlag && apptType !== 'support') ? 'true' : 'false';

const hasAsyncTask = (
  needsDelete === 'true'
  || needsSync === 'true'
  || trafficCalcNeeded === 'true'
) ? 'true' : 'false';

const dateStr = new Date(requestData.appointmentDateTime)
  .toLocaleDateString('en-CA');
const entityLabel = (requestData.knumber || 'Unknown')
  + ' - ' + (requestData.location || 'Unknown')
  + ' (' + dateStr + ')';

return [{
  json: {
    ...requestData,
    currentAppointment: currentAppointment,
    appointment_type: apptType,
    trip_direction: requestData.trip_direction || null,
    event_name: requestData.event_name || null,
    trafficCalcNeeded: trafficCalcNeeded,
    hasAsyncTask: hasAsyncTask,
    entityLabel: entityLabel,
    calendarOperations: {
      needsDelete: needsDelete,
      needsSync: needsSync,
      hasOrphanedEvent: hasOrphanedEvent,
      originalDriverAssigned:
        currentAppointment.driver_assigned,
      originalCalendarEventId:
        currentAppointment.driver_calendar_event_id,
      newDriverAssigned: requestData.driver_assigned,
      driverChanged: driverChanged,
      calendarFieldsChanged: calendarFieldsChanged,
      hasOriginalDriver: hasOriginalDriver,
      hasOriginalCalendarEvent: hasOriginalCalendarEvent
    }
  }
}];
// v2.0.0 - Type fields, traffic flag, entity label
```

### Node 15: Decide Async Task - Code (v1.0.0)

```javascript
// Decide Async Task - v1.0.0
// Determines if background task needed
const data = $input.first().json;

const needsDelete =
  data.calendarOperations.needsDelete === 'true';
const needsSync =
  data.calendarOperations.needsSync === 'true';
const trafficCalc = data.trafficCalcNeeded === 'true';
const hasAsyncTask = needsDelete || needsSync || trafficCalc;

const steps = [];
if (trafficCalc) steps.push('traffic_calc');
if (needsDelete) steps.push('calendar_delete');
if (needsSync) steps.push('calendar_sync');

return [{
  json: {
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
  }
}];
// v1.0.0 - Decide async task
```

### Node 18: Format Async Response - Code (v1.0.0)

```javascript
// Format Async Response - v1.0.0
const data = $('Decide Async Task - Code').first().json;
const taskRow = $input.first().json;

return [{
  json: {
    success: true,
    message: 'Appointment updated. Background tasks started.',
    data: {
      id: data.id,
      knumber: data.knumber,
      appointmenttime: data.appointmentDateTime,
      location: data.location,
      appointment_type: data.appointment_type || 'round_trip',
      trip_direction: data.trip_direction || null,
      event_name: data.event_name || null
    },
    backgroundTasks: {
      taskId: taskRow.id || null,
      taskType: 'appointment_async_ops',
      steps: data.asyncSteps || []
    },
    timestamp: new Date().toISOString()
  }
}];
// v1.0.0 - Async response with task info
```

### Node 19: Format Simple Response - Code (v1.0.0)

```javascript
// Format Simple Response - v1.0.0
const data = $('Decide Async Task - Code').first().json;

return [{
  json: {
    success: true,
    message: 'Appointment updated successfully.',
    data: {
      id: data.id,
      knumber: data.knumber,
      appointmenttime: data.appointmentDateTime,
      location: data.location,
      appointment_type: data.appointment_type || 'round_trip',
      trip_direction: data.trip_direction || null,
      event_name: data.event_name || null
    },
    backgroundTasks: null,
    timestamp: new Date().toISOString()
  }
}];
// v1.0.0 - Simple response, no async tasks
```

### Node 22: Prepare Async Context - Code (v1.0.0)

```javascript
// Prepare Async Context - v1.0.0
// Gather all data needed for the 3 async steps
const data = $('Decide Async Task - Code').first().json;
const taskRow = $('Create Background Task - Supabase')
  .first().json;

return [{
  json: {
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
    needsDelete:
      data.calendarOperations.needsDelete,
    needsSync:
      data.calendarOperations.needsSync,
    originalDriverAssigned:
      data.calendarOperations.originalDriverAssigned,
    originalCalendarEventId:
      data.calendarOperations.originalCalendarEventId,
    newDriverAssigned:
      data.calendarOperations.newDriverAssigned,
    driver_assigned: data.driver_assigned,
    driver_first_name: data.driver_first_name,
    stepResults: {}
  }
}];
// v1.0.0 - Gather async context
```

### Node 26: Prepare Distance Request - Code (v1.0.0)

```javascript
// Prepare Distance Request - v1.0.0
// Build Google Maps API request with traffic model
const data = $input.first().json;
const apiKey = $('Get Maps API Key - Supabase')
  .first().json.value;

if (!apiKey) {
  return [{
    json: {
      ...data,
      trafficError: 'Google Maps API key not found',
      stepResults: {
        ...data.stepResults,
        traffic_calc: 'failed_no_key'
      }
    }
  }];
}

const apptType = data.appointment_type || 'round_trip';
const direction = data.trip_direction || 'to_clinic';
let origins = data.pickup_address || '';
let destinations = data.locationAddress || '';

if (apptType === 'one_way' && direction === 'to_home') {
  origins = data.locationAddress || '';
  destinations = data.pickup_address || '';
}

const departureTime = Math.floor(
  new Date(data.appointmentDateTime).getTime() / 1000
);

return [{
  json: {
    ...data,
    apiKey: apiKey,
    origins: origins,
    destinations: destinations,
    departureTime: departureTime
  }
}];
// v1.0.0 - Prepare distance request
```

### Node 28: Process Traffic Result - Code (v1.0.0)

```javascript
// Process Traffic Result - v1.0.0
// Extract duration_in_traffic, recalculate times
const data = $('Prepare Distance Request - Code')
  .first().json;
const mapResult = $input.first().json;
const stepResults = data.stepResults || {};

if (data.trafficError) {
  return [{
    json: {
      ...data,
      stepResults: {
        ...stepResults,
        traffic_calc: 'failed'
      }
    }
  }];
}

const el = mapResult.rows?.[0]?.elements?.[0];
if (!el || el.status !== 'OK') {
  return [{
    json: {
      ...data,
      stepResults: {
        ...stepResults,
        traffic_calc: 'failed_api_error'
      }
    }
  }];
}

const noTraffic = el.duration.value;
const pessimistic = el.duration_in_traffic
  ? el.duration_in_traffic.value
  : noTraffic;
const p75sec = noTraffic + (pessimistic - noTraffic) * 0.75;
const p75min = Math.ceil(p75sec / 60);
const rounded = Math.ceil(p75min / 5) * 5;
const newTransit = Math.max(rounded, 5);
const distKm = parseFloat(
  (el.distance.value / 1000).toFixed(2)
);

const apptDT = new Date(data.appointmentDateTime);
const apptLen = data.appointmentLength || 120;
const apptType = data.appointment_type || 'round_trip';
const dir = data.trip_direction || 'to_clinic';

let newPickup, newDropOff;
if (apptType === 'one_way') {
  if (dir === 'to_home') {
    newPickup = apptDT.toISOString();
    newDropOff = new Date(
      apptDT.getTime() + (newTransit * 60000)
    ).toISOString();
  } else {
    newPickup = new Date(
      apptDT.getTime() - (newTransit * 60000)
    ).toISOString();
    newDropOff = apptDT.toISOString();
  }
} else {
  newPickup = new Date(
    apptDT.getTime() - (newTransit * 60000)
  ).toISOString();
  const total = apptLen + newTransit;
  newDropOff = new Date(
    apptDT.getTime() + (total * 60000)
  ).toISOString();
}

return [{
  json: {
    ...data,
    newTransitTime: newTransit,
    newPickupTime: newPickup,
    newDropOffTime: newDropOff,
    driverTotalDistance: distKm,
    stepResults: {
      ...stepResults,
      traffic_calc: 'completed',
      traffic_transit_minutes: newTransit,
      traffic_distance_km: distKm
    }
  }
}];
// v1.0.0 - Process traffic result
```

### Node 37: Prepare Calendar Event - Code (v2.0.0)

```javascript
// Prepare Calendar Event - v2.0.0
// Type-aware calendar event builder
const ctx = $('Prepare Async Context - Code').first().json;
const appointment = $('Get Updated Appt - Supabase')
  .first().json;
const client = $('Get Client - Supabase').first().json;
const driver = $('Get New Driver - Supabase').first().json;

if (!driver || !driver.google_calendar_id) {
  return [{
    json: {
      ...ctx,
      calendarError: 'Driver has no calendar configured',
      stepResults: {
        ...ctx.stepResults,
        calendar_sync: 'failed_no_calendar'
      }
    }
  }];
}

const pickupTime = new Date(appointment.pickuptime);
const apptTime = new Date(appointment.appointmenttime);
const dropOff = new Date(
  appointment.dropOffTime
  || apptTime.getTime()
    + (appointment.this_appointment_length * 60000)
);

const clientName = [
  client.firstname || '', client.lastname || ''
].filter(Boolean).join(' ') || 'Unknown Client';

const clientAddr = [
  client.civicaddress, client.city,
  client.prov, client.postalcode
].filter(Boolean).join(', ');

const apptType = appointment.appointment_type
  || 'round_trip';
const oneWayDir = appointment.trip_direction
  || 'to_clinic';
const supportName = appointment.event_name
  || 'Support Event';

let eventTitle;
if (apptType === 'one_way') {
  if (oneWayDir === 'to_home') {
    eventTitle = 'ONE-WAY: ' + clientName
      + ' \u2192 Home';
  } else {
    eventTitle = 'ONE-WAY: ' + clientName
      + ' \u2192 ' + appointment.locationname;
  }
} else if (apptType === 'support') {
  eventTitle = 'SUPPORT: ' + supportName;
} else {
  eventTitle = 'Round Trip: ' + clientName
    + ' to ' + appointment.locationname;
}

let colorId = '2';
if (apptType === 'one_way') colorId = '6';
if (apptType === 'support') colorId = '3';

const timeOpts = {
  timeZone: 'America/Halifax',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
};
const pickupStr = pickupTime
  .toLocaleString('en-US', timeOpts);
const apptStr = apptTime
  .toLocaleString('en-US', timeOpts);

const descLines = [
  'Client: ' + clientName,
  client.phone ? 'Phone: ' + client.phone : '',
  'Type: ' + apptType.replace('_', ' ')
];
if (apptType === 'one_way') {
  descLines.push('Direction: '
    + oneWayDir.replace('_', ' '));
}
descLines.push('Pickup: ' + pickupStr);
descLines.push('Appointment: ' + apptStr);
descLines.push('Duration: '
  + appointment.this_appointment_length + ' min');
if (appointment.driver_instructions) {
  descLines.push('Driver Instructions: '
    + appointment.driver_instructions);
}
if (appointment.scheduling_notes) {
  descLines.push('Notes: '
    + appointment.scheduling_notes);
}

let eventLocation = clientAddr;
if (apptType === 'one_way'
  && oneWayDir === 'to_home') {
  eventLocation = appointment.locationaddress
    || clientAddr;
}

const calEvent = {
  summary: eventTitle,
  description: descLines.filter(Boolean).join('\n'),
  start: {
    dateTime: appointment.pickuptime,
    timeZone: 'America/Halifax'
  },
  end: {
    dateTime: dropOff.toISOString(),
    timeZone: 'America/Halifax'
  },
  location: eventLocation,
  colorId: colorId,
  extendedProperties: {
    private: {
      rrts_appointment_id: appointment.id.toString(),
      rrts_driver_id: driver.id.toString(),
      rrts_appointment_type: apptType
    }
  },
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 60 },
      { method: 'popup', minutes: 5 }
    ]
  }
};

const operation = appointment.driver_calendar_event_id
  ? 'UPDATE' : 'CREATE';

return [{
  json: {
    ...ctx,
    calendarOperation: operation,
    calendarId: driver.google_calendar_id,
    existingEventId:
      appointment.driver_calendar_event_id || null,
    calendarEvent: calEvent,
    calendarMethod:
      operation === 'UPDATE' ? 'PATCH' : 'POST',
    calendarUrl: operation === 'UPDATE'
      ? 'https://www.googleapis.com/calendar/v3/calendars/'
        + driver.google_calendar_id + '/events/'
        + appointment.driver_calendar_event_id
      : 'https://www.googleapis.com/calendar/v3/calendars/'
        + driver.google_calendar_id + '/events'
  }
}];
// v2.0.0 - Type-aware calendar event
```

### Node 40: Build Task Result - Code (v1.0.0)

```javascript
// Build Task Result - v1.0.0
// Collect per-step results for background_task JSONB
const ctx = $('Prepare Async Context - Code').first().json;
const stepResults = {};

// Step 1: Traffic calc
if (ctx.trafficCalcNeeded === 'true') {
  try {
    const trafficData = $('Process Traffic Result - Code')
      .first().json;
    stepResults.traffic_calc =
      trafficData.stepResults?.traffic_calc || 'completed';
    if (trafficData.stepResults?.traffic_transit_minutes) {
      stepResults.traffic_transit_minutes =
        trafficData.stepResults.traffic_transit_minutes;
    }
    if (trafficData.stepResults?.traffic_distance_km) {
      stepResults.traffic_distance_km =
        trafficData.stepResults.traffic_distance_km;
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
    const delResult = $('Delete Old Calendar - HTTP')
      .first().json;
    stepResults.calendar_delete =
      (delResult.error || delResult.code >= 400)
      ? 'failed' : 'completed';
  } catch (e) {
    stepResults.calendar_delete = 'failed';
  }
} else {
  stepResults.calendar_delete = 'skipped';
}

// Step 3: Calendar sync
if (ctx.needsSync === 'true') {
  try {
    const syncResult = $('Execute Calendar API - HTTP')
      .first().json;
    stepResults.calendar_sync =
      (syncResult.error || !syncResult.id)
      ? 'failed' : 'completed';
  } catch (e) {
    stepResults.calendar_sync = 'failed';
  }
} else {
  stepResults.calendar_sync = 'skipped';
}

const hasFailed = Object.values(stepResults)
  .some(v => v === 'failed');
const finalStatus = hasFailed ? 'failed' : 'completed';
const errorMsg = hasFailed
  ? 'One or more async steps failed: '
    + Object.entries(stepResults)
      .filter(([k, v]) => v === 'failed')
      .map(([k]) => k).join(', ')
  : null;

return [{
  json: {
    taskId: ctx.taskId,
    finalStatus: finalStatus,
    errorMessage: errorMsg,
    stepResults: stepResults
  }
}];
// v1.0.0 - Build task result
```

---

## Supabase Node Field Mappings

### Node 13: Update Appointment - Supabase (no-delete path)

Existing fields PLUS 3 new fields. Filter by `id` from Compare node. All field values reference `$('Compare Current vs New - Code').item.json.*`:

| Field | Expression |
|-------|-----------|
| appointmenttime | `={{ $('Compare Current vs New - Code').item.json.appointmentDateTime }}` |
| pickuptime | `={{ $('Compare Current vs New - Code').item.json.pickupTime }}` |
| dropOffTime | `={{ $('Compare Current vs New - Code').item.json.dropOffTime }}` |
| locationname | `={{ $('Compare Current vs New - Code').item.json.location }}` |
| locationaddress | `={{ $('Compare Current vs New - Code').item.json.locationAddress }}` |
| clinic_id | `={{ $('Compare Current vs New - Code').item.json.clinic_id }}` |
| transittime | `={{ $('Compare Current vs New - Code').item.json.transitTime }}` |
| this_appointment_length | `={{ $('Compare Current vs New - Code').item.json.appointmentLength }}` |
| scheduling_notes | `={{ $('Compare Current vs New - Code').item.json.scheduling_notes }}` |
| notes | `={{ $('Compare Current vs New - Code').item.json.notes }}` |
| driver_instructions | `={{ $('Compare Current vs New - Code').item.json.driver_instructions }}` |
| pickup_address | `={{ $('Compare Current vs New - Code').item.json.pickup_address }}` |
| appointmentstatus | `={{ $('Compare Current vs New - Code').item.json.status }}` |
| operation_status | `={{ $('Compare Current vs New - Code').item.json.status }}` |
| custom_rate | `={{ $('Compare Current vs New - Code').item.json.customRate }}` |
| managed_by | `={{ $('Compare Current vs New - Code').item.json.managed_by }}` |
| managed_by_name | `={{ $('Compare Current vs New - Code').item.json.managed_by_name }}` |
| driver_assigned | `={{ $json.driver_assigned }}` |
| driver_first_name | `={{ $json.driver_first_name }}` |
| custom_rate | `={{ $json.customRate }}` |
| **appointment_type** | `={{ $('Compare Current vs New - Code').item.json.appointment_type }}` |
| **trip_direction** | `={{ $('Compare Current vs New - Code').item.json.trip_direction }}` |
| **event_name** | `={{ $('Compare Current vs New - Code').item.json.event_name }}` |

### Node 14: Update Appt After Delete - Supabase (delete path)

Same fields as Node 13. Additionally, this node clears:
- `driver_calendar_event_id` = null
- `google_calendar_last_synced` = null

### Node 17: Create Background Task - Supabase

Table: `background_tasks`. Fields from `$('Decide Async Task - Code').first().json.taskMetadata.*`:

| Field | Expression |
|-------|-----------|
| entity_type | `={{ $('Decide Async Task - Code').first().json.taskMetadata.entity_type }}` |
| entity_id | `={{ $('Decide Async Task - Code').first().json.taskMetadata.entity_id }}` |
| entity_label | `={{ $('Decide Async Task - Code').first().json.taskMetadata.entity_label }}` |
| task_type | `={{ $('Decide Async Task - Code').first().json.taskMetadata.task_type }}` |
| status | `={{ $('Decide Async Task - Code').first().json.taskMetadata.status }}` |
| created_by | `={{ $('Decide Async Task - Code').first().json.taskMetadata.created_by }}` |

### Node 29: Update Appt Times - Supabase (async traffic calc result)

Table: `appointments`. Filter by `id` = `{{ $json.appointmentId }}`. Updates appointment with traffic-aware times after Distance Matrix API returns:

| Field | Expression |
|-------|-----------|
| transittime | `={{ $json.newTransitTime }}` |
| pickuptime | `={{ $json.newPickupTime }}` |
| dropOffTime | `={{ $json.newDropOffTime }}` |
| driver_total_distance | `={{ $json.driverTotalDistance }}` |
| traffic_aware_transit | `true` (static string, not expression) |

**Important:** The `traffic_aware_transit` field MUST be set to `true` here so the system knows this appointment's transit time was calculated using real traffic data rather than the default estimate.

### Node 41: Mark Task Complete - Supabase (finalization)

Table: `background_tasks`. Filter by `id` = `{{ $json.taskId }}`. Receives data from `Build Task Result - Code` (Node 40):

| Field | Expression |
|-------|-----------|
| status | `={{ $json.finalStatus }}` |
| completed_at | `={{ new Date().toISOString() }}` |
| result | `={{ JSON.stringify($json.stepResults) }}` |
| error_message | `={{ $json.errorMessage || '' }}` |

The `result` field stores JSONB with per-step status: `{"traffic_calc": "completed/skipped/failed", "calendar_delete": "completed/skipped/failed", "calendar_sync": "completed/skipped/failed"}`. The `status` is set to `failed` if any step failed, `completed` otherwise.

---

## Connection Wiring

### Sync Path

```
Webhook -> Get JWT Secret -> JWT Validation Code -> JWT Switch
  authorized -> Validate Request -> Validation Switch
    valid -> Calculate Times -> Get Current Appt -> Compare -> Check Delete Switch
      Delete -> Update Appt After Delete -> Decide Async Task
      No Delete -> Update Appointment -> Decide Async Task
    Decide Async Task -> Needs Async Switch
      Yes -> Create Background Task -> Format Async Response
             -> [parallel: Respond to Webhook, Log Audit, Prepare Async Context]
      No -> Format Simple Response -> Respond to Webhook
    extra (invalid) -> Format Validation Error -> Respond to Webhook
  unauthorized -> Format JWT Error -> Respond to Webhook
  extra -> Format JWT Error -> Respond to Webhook
```

**Important:** Only the `Format Async Response` path forks to the async branch. Error and simple response paths connect ONLY to `Respond to Webhook` — they must NOT trigger async processing.

### Async Branch (after Format Async Response)

```
Prepare Async Context -> Mark Task Processing -> Check Traffic Calc Switch
  Yes -> Get Maps API Key -> Prepare Distance Request -> Call Distance Matrix
    -> Process Traffic Result -> Update Appt Times -> Check Async Delete Switch
  No -> Check Async Delete Switch
Check Async Delete Switch
  Yes -> Get Old Driver -> Delete Old Calendar -> Check Async Sync Switch
  No -> Check Async Sync Switch
Check Async Sync Switch
  Yes -> Get New Driver -> Get Updated Appt -> Get Client
    -> Prepare Calendar Event -> Execute Calendar API
    -> Save Calendar Event ID -> Build Task Result -> Mark Task Complete
  No -> Build Task Result -> Mark Task Complete
```

---

## Error Handling

- All HTTP Request nodes (Distance Matrix, Calendar Delete, Calendar Create) must have **Continue On Error** enabled
- After each HTTP call, the downstream Code node checks for errors in the response
- Errors are recorded in the `stepResults` object and execution continues
- The `Build Task Result` Code node (Node 40) collects per-step results by checking what was configured vs what actually executed:
  - Looks up each upstream HTTP result node (`Process Traffic Result`, `Delete Old Calendar`, `Execute Calendar API`)
  - Sets each step to `completed`, `failed`, or `skipped`
  - Determines overall `finalStatus`: `failed` if any step failed, `completed` otherwise
  - Builds `errorMessage` listing which steps failed
- The `Mark Task Complete` Supabase node (Node 41) writes the final result:
  - `status`: from `$json.finalStatus`
  - `result`: JSONB from `$json.stepResults` (always populated)
  - `error_message`: from `$json.errorMessage` (null if all steps succeeded)

---

## Testing Checklist

- [ ] Update appointment with no driver (no async tasks) - immediate response
- [ ] Assign driver to appointment - sync_calendar task created
- [ ] Change driver A -> B - delete + sync tasks in sequence
- [ ] Remove driver - delete task only
- [ ] Change time with driver assigned - sync task updates event
- [ ] Traffic checkbox checked - transit recalculated before calendar
- [ ] Support type skips traffic calc regardless of checkbox
- [ ] One-way to_home reverses origins/destinations in traffic calc
- [ ] Calendar titles match type (Round Trip / ONE-WAY / SUPPORT)
- [ ] Calendar colors match type (2=Sage / 6=Tangerine / 3=Grape)
- [ ] Background task result JSONB shows per-step status
- [ ] Failed Calendar API still completes other steps
