# N8N Appointment Types Workflow Modifications - Build Instructions

**Version:** v1.0.0
**Date:** 2026-02-24
**Prerequisite:** Database migration (adding `appointment_type`, `trip_direction`, `event_name` columns to `appointments` table) must be run before making these workflow changes. See the supabase-db team's migration file.

## Table of Contents

1. [Overview](#overview)
2. [Appointment Type Definitions](#appointment-type-definitions)
3. [Timing Calculations by Type](#timing-calculations-by-type)
4. [Google Calendar Configuration by Type](#google-calendar-configuration-by-type)
5. [SMS Behavior by Type](#sms-behavior-by-type)
6. [Backward Compatibility](#backward-compatibility)
7. [Workflow 1: APPT - Add Appointment (HIGH)](#workflow-1-appt---add-appointment-high)
8. [Workflow 2: APPT - Update Appointment (HIGH)](#workflow-2-appt---update-appointment-high)
9. [Workflow 3: APPT - Cancel Appointment (MEDIUM)](#workflow-3-appt---cancel-appointment-medium)
10. [Workflow 4: APPT - Update Multiple Appointments and Calendar (MEDIUM)](#workflow-4-appt---update-multiple-appointments-and-calendar-medium)
11. [Workflow 5: RMDR - 1 Hour SMS Reminders (MEDIUM)](#workflow-5-rmdr---1-hour-sms-reminders-medium)
12. [Workflow 6: RMDR - Night Before SMS Reminders (MEDIUM)](#workflow-6-rmdr---night-before-sms-reminders-medium)
13. [Workflow 7: RMDR - Weekly Client Email Reminder (MEDIUM)](#workflow-7-rmdr---weekly-client-email-reminder-medium)
14. [Workflow 8: APPT - Get Appointments Page Data (LOW)](#workflow-8-appt---get-appointments-page-data-low)
15. [Workflows Requiring No Changes](#workflows-requiring-no-changes)
16. [Testing Checklist](#testing-checklist)

---

## Overview

This document provides step-by-step instructions for modifying existing n8n workflows to support three appointment types: **round_trip**, **one_way**, and **support**. Each workflow section describes which nodes to modify and provides the exact code changes.

### Impact Summary

| Workflow | Impact | Changes |
|----------|--------|---------|
| APPT - Add Appointment | HIGH | Validation, timing calc, Supabase insert (3 new fields) |
| APPT - Update Appointment | HIGH | Validation, timing calc, Supabase update, calendar title + color |
| APPT - Cancel Appointment | MEDIUM | Calendar title per type, SMS skip for support |
| APPT - Update Multiple + Calendar | MEDIUM | Batch version of update changes |
| RMDR - 1 Hour SMS Reminders | MEDIUM | Type-aware templates, skip support |
| RMDR - Night Before SMS Reminders | MEDIUM | Type-aware templates, skip support |
| RMDR - Weekly Client Email | MEDIUM | Include type in appointment listing |
| APPT - Get Appointments Page Data | LOW | Verify pass-through of new columns |
| All other workflows | NONE | No changes needed |

---

## Appointment Type Definitions

### Type Values

| Type | Value | Description |
|------|-------|-------------|
| Round Trip | `round_trip` | Standard: driver picks up client, waits at clinic, drives home. Default type. |
| One Way | `one_way` | Driver picks up and drops off in one direction only. No waiting. |
| Support | `support` | Block of time for support services. No transit, no clinic destination. |

### One-Way Direction Values

When `appointment_type` is `one_way`, the `trip_direction` field specifies the direction:

| Direction | Value | Description |
|-----------|-------|-------------|
| To Clinic | `to_clinic` | Driver picks up client at home, drops off at clinic, leaves. |
| To Home | `to_home` | Driver picks up client at clinic, drives client home, leaves. |

### Support Event Name

When `appointment_type` is `support`, the `event_name` field provides a custom event title (e.g., "Wellness Check", "Grocery Run") used in calendar events instead of clinic name.

---

## Timing Calculations by Type

This is the core logic change needed in the "Calculate Times" Code nodes across multiple workflows.

### Round Trip (existing behavior, unchanged)

```
pickupTime = appointmentDateTime - transitTime
dropOffTime = appointmentDateTime + appointmentLength + transitTime
```

Driver picks up client, drives to clinic (transit), waits during appointment (length), drives home (transit).

### One Way - To Clinic

```
pickupTime = appointmentDateTime - transitTime
dropOffTime = appointmentDateTime
```

Driver picks up client, drives to clinic. Drops off and leaves. No waiting, no return trip. The `dropOffTime` equals `appointmentDateTime` because the driver's job ends at drop-off.

### One Way - To Home

```
pickupTime = appointmentDateTime
dropOffTime = appointmentDateTime + transitTime
```

Driver picks up client at clinic at the appointment time, drives client home. The `pickupTime` equals `appointmentDateTime` (pickup at clinic), `dropOffTime` is after driving home.

### Support (no transit)

```
pickupTime = appointmentDateTime
dropOffTime = appointmentDateTime + appointmentLength
```

Block of time at client location. No transit calculations. The `transitTime` is effectively 0 for support events.

### Universal Calculate Times Code

Use this code as the replacement for all "Calculate Times - Code" nodes:

```javascript
// Calculate Times - v2.0.0
// Calculates pickup and dropoff based on appointment_type

const appointmentDateTime = new Date($json.appointmentDateTime);
const transitTime = parseInt($json.transitTime) || 30;
const appointmentLength = parseInt($json.appointmentLength) || 120;
const appointmentType = $json.appointment_type || 'round_trip';
const oneWayDirection = $json.trip_direction || 'to_clinic';

let pickupTime, dropOffTime;

if (appointmentType === 'one_way') {
  if (oneWayDirection === 'to_home') {
    // Pickup at clinic, drive home
    pickupTime = appointmentDateTime.toISOString();
    const dropOff = new Date(
      appointmentDateTime.getTime() + (transitTime * 60000)
    );
    dropOffTime = dropOff.toISOString();
  } else {
    // to_clinic: pickup at home, drop at clinic
    const pickup = new Date(
      appointmentDateTime.getTime() - (transitTime * 60000)
    );
    pickupTime = pickup.toISOString();
    dropOffTime = appointmentDateTime.toISOString();
  }
} else if (appointmentType === 'support') {
  // Block of time, no transit
  pickupTime = appointmentDateTime.toISOString();
  const dropOff = new Date(
    appointmentDateTime.getTime()
    + (appointmentLength * 60000)
  );
  dropOffTime = dropOff.toISOString();
} else {
  // round_trip (default)
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

// Version: v2.0.0 - Type-aware timing calculations
```

---

## Google Calendar Configuration by Type

### Calendar Event Titles

| Type | Title Format | Example |
|------|-------------|---------|
| round_trip | `Round Trip: {ClientName} to {ClinicName}` | `Round Trip: John Doe to Halifax Clinic` |
| one_way (to_clinic) | `ONE-WAY: {ClientName} → {ClinicName}` | `ONE-WAY: John Doe → Halifax Clinic` |
| one_way (to_home) | `ONE-WAY: {ClientName} → Home` | `ONE-WAY: John Doe → Home` |
| support | `SUPPORT: {EventName}` | `SUPPORT: Wellness Check` |
| Cancelled (any type) | `CANCELLED - {OriginalTitle}` | `CANCELLED - Round Trip: John Doe to Halifax Clinic` |

### Calendar Color IDs

| Type | Google Calendar Color | Color ID |
|------|----------------------|----------|
| round_trip | Sage (green) | `2` |
| one_way | Tangerine (orange) | `6` |
| support | Grape (purple) | `3` |

### Calendar Title Builder Code

Use this helper code anywhere calendar titles are constructed:

```javascript
// Build calendar title based on appointment type
function buildCalendarTitle(appointmentType, oneWayDirection,
  clientName, clinicName, supportEventName) {
  if (appointmentType === 'one_way') {
    if (oneWayDirection === 'to_home') {
      return 'ONE-WAY: ' + clientName + ' \u2192 Home';
    }
    return 'ONE-WAY: ' + clientName + ' \u2192 ' + clinicName;
  }
  if (appointmentType === 'support') {
    return 'SUPPORT: '
      + (supportEventName || 'Support Event');
  }
  // round_trip (default)
  return 'Round Trip: ' + clientName + ' to ' + clinicName;
}

// Get calendar color ID based on appointment type
function getCalendarColorId(appointmentType) {
  if (appointmentType === 'one_way') return '6';
  if (appointmentType === 'support') return '3';
  return '2'; // round_trip default
}
```

---

## SMS Behavior by Type

### Rules

| Type | Client SMS | Driver SMS (Cancel) |
|------|-----------|-------------------|
| round_trip | Standard pickup message | Standard cancellation message |
| one_way (to_clinic) | Modified: "pick you up" (no "wait and bring you home") | Standard cancellation message |
| one_way (to_home) | Modified: "pick you up at {clinic}" | Standard cancellation message |
| support | **SKIP entirely** - no SMS sent | **SKIP entirely** - no SMS sent |

### SMS Message Templates

**Round Trip (existing):**
```
Hi {firstname}, it's {driverName} from RRTS.
I'll be there to pick you up at {pickupTime}
for your {appointmentTime} appointment.
```

**One Way - To Clinic:**
```
Hi {firstname}, it's {driverName} from RRTS.
I'll be there to pick you up at {pickupTime}
and drop you off at {clinicName}
for your {appointmentTime} appointment.
```

**One Way - To Home:**
```
Hi {firstname}, it's {driverName} from RRTS.
I'll pick you up at {clinicName} at {pickupTime}
and bring you home.
```

**Support:**
No SMS sent. Support events are excluded from all SMS reminder workflows.

---

## Backward Compatibility

All workflows MUST handle appointments created before the `appointment_type` column exists.

**Rule:** If `appointment_type` is `null`, `undefined`, or empty, treat it as `round_trip`.

This pattern must appear in every Code node that reads `appointment_type`:

```javascript
const appointmentType = data.appointment_type || 'round_trip';
```

This ensures zero disruption to existing appointments.

---

## Workflow 1: APPT - Add Appointment (HIGH)

### Workflow Name
`APPT - Add Appointment` (endpoint: `save-appointment-v7`)

### Overview of Changes

4 nodes need modification:
1. **Validate Request - Code** -- add new field validation
2. **Calculate Times - Code** -- type-aware timing
3. **Insert Appointment - Supabase** -- 3 new fields
4. **Format Success Response - Code** -- return new fields

### Before You Begin

1. **Export** the current workflow as JSON backup
2. Save as `APPT - Add Appointment - BACKUP.json`
3. Only then proceed with edits

---

### Node 1: Validate Request - Code

**Current version:** v1.0.0
**New version:** v2.0.0

**Find this code** in the Validate Request node:

```javascript
// Validate Request Data - v1.0.0
// Validates required fields for new appointment
```

**Replace the entire Code node content with:**

```javascript
// Validate Request Data - v2.0.0
// Validates required fields, type-aware validation

const data = $json.requestBody || $json.body || $json;

// Required fields for ALL types
const requiredFields = [
  'knumber',
  'appointmentDateTime'
];

const missingFields = [];

for (const field of requiredFields) {
  if (!data[field]) {
    missingFields.push(field);
  }
}

// Determine appointment type (default: round_trip)
const appointmentType = data.appointment_type || 'round_trip';

// Validate appointment_type value
const validTypes = ['round_trip', 'one_way', 'support'];
if (!validTypes.includes(appointmentType)) {
  return [{
    json: {
      _route: 'error',
      success: false,
      message: 'Invalid appointment_type: '
        + appointmentType
        + '. Must be: round_trip, one_way, support',
      timestamp: new Date().toISOString()
    }
  }];
}

// Type-specific validation
if (appointmentType === 'round_trip'
  || appointmentType === 'one_way') {
  if (!data.location) missingFields.push('location');
  if (!data.locationAddress) {
    missingFields.push('locationAddress');
  }
}

if (appointmentType === 'one_way') {
  const validDirs = ['to_clinic', 'to_home'];
  const dir = data.trip_direction || '';
  if (!validDirs.includes(dir)) {
    return [{
      json: {
        _route: 'error',
        success: false,
        message: 'trip_direction is required '
          + 'for one_way type (to_clinic or to_home)',
        timestamp: new Date().toISOString()
      }
    }];
  }
}

if (appointmentType === 'support') {
  if (!data.event_name
    || !data.event_name.trim()) {
    missingFields.push('event_name');
  }
}

if (missingFields.length > 0) {
  return [{
    json: {
      _route: 'error',
      success: false,
      message: 'Missing required fields: '
        + missingFields.join(', '),
      missingFields: missingFields,
      timestamp: new Date().toISOString()
    }
  }];
}

// Validate appointmentDateTime is valid ISO string
try {
  const testDate = new Date(data.appointmentDateTime);
  if (isNaN(testDate.getTime())) {
    return [{
      json: {
        _route: 'error',
        success: false,
        message: 'Invalid appointmentDateTime format',
        timestamp: new Date().toISOString()
      }
    }];
  }
} catch (e) {
  return [{
    json: {
      _route: 'error',
      success: false,
      message: 'Invalid appointmentDateTime',
      timestamp: new Date().toISOString()
    }
  }];
}

// Pass validated data forward
return [{
  json: {
    _route: 'valid',
    ...data,
    appointment_type: appointmentType,
    trip_direction: data.trip_direction || null,
    event_name: data.event_name || null
  }
}];

// Version: v2.0.0 - Type-aware validation
```

---

### Node 2: Calculate Times - Code

**Current version:** v1.0.0
**New version:** v2.0.0

**Replace the entire Code node content** with the [Universal Calculate Times Code](#universal-calculate-times-code) from the shared section above.

---

### Node 3: Insert Appointment - Supabase

Add 3 new field mappings to the existing Supabase Create node. Open the node and add these fields **after** the existing `managed_by_name` field:

| Field | Value |
|-------|-------|
| `appointment_type` | `={{ $json.appointment_type }}` |
| `trip_direction` | `={{ $json.trip_direction }}` |
| `event_name` | `={{ $json.event_name }}` |

**Keep all existing fields unchanged.** Only ADD these three new rows.

---

### Node 4: Format Success Response - Code

**Current version:** v1.0.0
**New version:** v2.0.0

**Find this code** in the Format Success Response node:

```javascript
// Format Success Response - v1.0.0

const appointmentData = $input.first().json;

return [{
  json: {
    success: true,
    message: 'Appointment saved successfully',
    data: {
      id: appointmentData.id,
      knumber: appointmentData.knumber,
      appointmenttime: appointmentData.appointmenttime,
      pickuptime: appointmentData.pickuptime,
      location: appointmentData.locationname
    },
    timestamp: new Date().toISOString()
  }
}];
```

**Replace with:**

```javascript
// Format Success Response - v2.0.0

const appointmentData = $input.first().json;

return [{
  json: {
    success: true,
    message: 'Appointment saved successfully',
    data: {
      id: appointmentData.id,
      knumber: appointmentData.knumber,
      appointmenttime: appointmentData.appointmenttime,
      pickuptime: appointmentData.pickuptime,
      location: appointmentData.locationname,
      appointment_type: appointmentData.appointment_type
        || 'round_trip',
      trip_direction:
        appointmentData.trip_direction || null,
      event_name:
        appointmentData.event_name || null
    },
    timestamp: new Date().toISOString()
  }
}];

// Version: v2.0.0 - Include type fields in response
```

---

## Workflow 2: APPT - Update Appointment (HIGH)

### Workflow Name
`APPT - Update Appointment` (endpoint: `update-appointment-complete`)

### Overview of Changes

5 nodes need modification:
1. **Validate Request - Code** -- add type validation
2. **Calculate Times - Code** -- type-aware timing
3. **Update Appointment - Supabase** (both instances) -- 3 new fields
4. **Prepare Calendar Sync - Code** -- type-aware title + color
5. **Format Success Response - Code** -- return new fields

Additionally: **Update Appt After Calendar Delete - Supabase** needs 3 new fields.

### Before You Begin

1. **Export** the current workflow as JSON backup
2. Save as `APPT - Update Appointment - BACKUP.json`
3. Only then proceed with edits

---

### Node 1: Validate Request - Code

**Current version:** v1.0.0
**New version:** v2.0.0

**Replace the entire Code node content with:**

```javascript
// Validate Request - v2.0.0
// Type-aware validation for appointment update
const data = $json.requestBody || $json.body || $json;

if (!data.id) {
  return [{
    json: {
      validationResult: "invalid",
      error: 'Appointment ID is required'
    }
  }];
}

if (!data.knumber) {
  return [{
    json: {
      validationResult: "invalid",
      error: 'Client K number is required'
    }
  }];
}

if (!data.appointmentDateTime) {
  return [{
    json: {
      validationResult: "invalid",
      error: 'Appointment date/time is required'
    }
  }];
}

// Validate appointment_type
const appointmentType = data.appointment_type || 'round_trip';
const validTypes = ['round_trip', 'one_way', 'support'];
if (!validTypes.includes(appointmentType)) {
  return [{
    json: {
      validationResult: "invalid",
      error: 'Invalid appointment_type: '
        + appointmentType
    }
  }];
}

// one_way requires direction
if (appointmentType === 'one_way') {
  const validDirs = ['to_clinic', 'to_home'];
  const dir = data.trip_direction || '';
  if (!validDirs.includes(dir)) {
    return [{
      json: {
        validationResult: "invalid",
        error: 'trip_direction required for one_way'
      }
    }];
  }
}

// support requires event name
if (appointmentType === 'support') {
  if (!data.event_name
    || !data.event_name.trim()) {
    return [{
      json: {
        validationResult: "invalid",
        error: 'event_name required for support'
      }
    }];
  }
}

return [{
  json: {
    validationResult: "valid",
    ...data,
    appointment_type: appointmentType,
    trip_direction: data.trip_direction || null,
    event_name: data.event_name || null
  }
}];

// Version: v2.0.0 - Type-aware validation
```

---

### Node 2: Calculate Times - Code

**Current version:** v1.0.0
**New version:** v2.0.0

**Replace the entire Code node content** with the [Universal Calculate Times Code](#universal-calculate-times-code) from the shared section above.

---

### Node 3: Update Appointment - Supabase (no-delete path)

This is the Supabase Update node on the "no delete needed" path (the one that runs when driver did NOT change).

Add 3 new field mappings. Open the node and add these fields:

| Field | Value |
|-------|-------|
| `appointment_type` | `={{ $json.appointment_type }}` |
| `trip_direction` | `={{ $json.trip_direction }}` |
| `event_name` | `={{ $json.event_name }}` |

**Keep all existing fields unchanged.**

---

### Node 3b: Update Appt After Calendar Delete - Supabase

This is the Supabase Update node on the "delete needed" path (after calendar event is deleted).

Add the same 3 new field mappings:

| Field | Value |
|-------|-------|
| `appointment_type` | `={{ $('Compare Current vs New - Code').item.json.appointment_type }}` |
| `trip_direction` | `={{ $('Compare Current vs New - Code').item.json.trip_direction }}` |
| `event_name` | `={{ $('Compare Current vs New - Code').item.json.event_name }}` |

**Keep all existing fields unchanged.**

---

### Node 4: Prepare Calendar Sync - Code

**Current version:** v1.0.0
**New version:** v2.0.0

This is the most significant change. The calendar event title and color must vary by appointment type.

**Replace the entire Code node content with:**

```javascript
// Prepare Calendar Sync - v2.0.0
// Type-aware calendar event creation
const appointment = $(
  'Get Appointment for Calendar - Supabase'
).first().json;
const client = $input.first().json;
const driverInfo = $(
  'Validate New Driver - Code'
).first().json;

const pickupTime = new Date(appointment.pickuptime);
const appointmentTime = new Date(
  appointment.appointmenttime
);
const dropOffTime = new Date(
  appointment.dropOffTime
  || appointmentTime.getTime()
  + (appointment.this_appointment_length * 60000)
);

const clientName = [
  client.firstname || '',
  client.lastname || ''
].filter(Boolean).join(' ') || 'Unknown Client';

const clientAddress = [
  client.civicaddress,
  client.city,
  client.prov,
  client.postalcode
].filter(Boolean).join(', ');

// Get appointment type info
const apptType = appointment.appointment_type
  || 'round_trip';
const oneWayDir = appointment.trip_direction
  || 'to_clinic';
const supportName = appointment.event_name
  || 'Support Event';

// Build title based on type
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

// Get color ID based on type
let colorId = '2'; // round_trip = Sage
if (apptType === 'one_way') colorId = '6'; // Tangerine
if (apptType === 'support') colorId = '3'; // Grape

// Build description lines
const timeOpts = {
  timeZone: 'America/Halifax',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
};
const pickupStr = pickupTime.toLocaleString(
  'en-US', timeOpts
);
const apptStr = appointmentTime.toLocaleString(
  'en-US', timeOpts
);

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

if (appointment.driver_instructions) {
  descLines.push('Driver Instructions: '
    + appointment.driver_instructions);
}
if (appointment.scheduling_notes) {
  descLines.push('Notes: '
    + appointment.scheduling_notes);
}

// Build location for calendar event
let eventLocation = clientAddress;
if (apptType === 'one_way'
  && oneWayDir === 'to_home') {
  eventLocation = appointment.locationaddress
    || clientAddress;
}

const event = {
  summary: eventTitle,
  description: descLines.filter(Boolean).join('\n'),
  start: {
    dateTime: appointment.pickuptime,
    timeZone: 'America/Halifax'
  },
  end: {
    dateTime: dropOffTime.toISOString(),
    timeZone: 'America/Halifax'
  },
  location: eventLocation,
  colorId: colorId,
  extendedProperties: {
    private: {
      rrts_appointment_id:
        appointment.id.toString(),
      rrts_driver_id:
        driverInfo.driverId.toString(),
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
    operation: operation,
    appointmentId: appointment.id,
    eventId:
      appointment.driver_calendar_event_id || null,
    calendarId: driverInfo.calendarId,
    event: event
  }
}];

// Version: v2.0.0 - Type-aware calendar events
```

---

### Node 5: Format Success Response - Code

**Current version:** v1.0.0
**New version:** v2.0.0

**Replace the entire Code node content with:**

```javascript
// Format Success Response - v2.0.0
const compareData = $(
  'Compare Current vs New - Code'
).first().json;

return [{
  json: {
    success: true,
    message: 'Appointment updated successfully',
    data: {
      id: compareData.id,
      knumber: compareData.knumber,
      appointmenttime: compareData.appointmentDateTime,
      location: compareData.location,
      appointment_type:
        compareData.appointment_type || 'round_trip'
    },
    calendarOperations: {
      deleted: compareData.calendarOperations
        .needsDelete === 'true',
      synced: compareData.calendarOperations
        .needsSync === 'true'
    },
    timestamp: new Date().toISOString()
  }
}];

// Version: v2.0.0 - Include type in response
```

---

## Workflow 3: APPT - Cancel Appointment (MEDIUM)

### Workflow Name
`APPT - Cancel Appointment` (endpoint: `cancel-appointment`)

### Overview of Changes

2 nodes need modification:
1. **Prepare Calendar Data - Code** -- type-aware calendar title for cancellation
2. **Send SMS - OpenPhone** -- skip SMS for support type, modify wording for one_way

Plus a new Switch node is needed to skip SMS for support appointments.

### Before You Begin

1. **Export** the current workflow as JSON backup
2. Save as `APPT - Cancel Appointment (5) - BACKUP.json`

---

### Node 1: Prepare Calendar Data - Code

**Current version:** v1.1.0
**New version:** v2.0.0

**Replace the entire Code node content with:**

```javascript
// Prepare Calendar Data - v2.0.0
// Type-aware cancellation data
const driver = $input.first().json;
const appointment = $(
  'Check Driver Assigned - Code'
).item.json.appointment;
const validationData = $(
  'Validate Request - Code'
).item.json;

// Build client name
const clientName = validationData.clientFirstName
  && validationData.clientLastName
  ? (validationData.clientFirstName + ' '
    + validationData.clientLastName).trim()
  : validationData.clientFirstName
    || validationData.clientLastName
    || appointment.knumber;

// Get appointment type
const apptType = appointment.appointment_type
  || 'round_trip';
const oneWayDir = appointment.trip_direction
  || 'to_clinic';
const supportName = appointment.event_name
  || 'Support Event';

// Build original title to prefix with CANCELLED
let originalTitle;
if (apptType === 'one_way') {
  if (oneWayDir === 'to_home') {
    originalTitle = 'ONE-WAY: ' + clientName
      + ' \u2192 Home';
  } else {
    originalTitle = 'ONE-WAY: ' + clientName
      + ' \u2192 ' + appointment.locationname;
  }
} else if (apptType === 'support') {
  originalTitle = 'SUPPORT: ' + supportName;
} else {
  originalTitle = 'Round Trip: ' + clientName
    + ' to ' + appointment.locationname;
}

return [{
  json: {
    calendarId: driver.google_calendar_id,
    eventId: appointment.driver_calendar_event_id,
    driverPhone: driver.phone,
    driverName: driver.first_name + ' '
      + driver.last_name,
    clientName: clientName,
    clientKnumber: appointment.knumber,
    locationName: appointment.locationname,
    appointmentTime: appointment.appointmenttime,
    cancellationReason: $(
      'Check Driver Assigned - Code'
    ).item.json.cancellationReason,
    cancelledCalendarTitle:
      'CANCELLED - ' + originalTitle,
    appointmentType: apptType,
    isSupportType: apptType === 'support'
      ? 'true' : 'false'
  }
}];

// Version: v2.0.0 - Type-aware cancellation
```

---

### Node 2: Update Calendar Event - HTTP

**Current change:** Update the `summary` body parameter.

**Find the current value:**
```
=CANCELLED - {{ $json.clientName }} - {{ $json.locationName }}
```

**Replace with:**
```
={{ $json.cancelledCalendarTitle }}
```

This uses the pre-built title from the Prepare Calendar Data node.

---

### Node 3: Add SMS Skip Switch (NEW NODE)

**Insert a new Switch node** between the "Format Phone Number - Code" node and the "Send SMS - OpenPhone" node.

| Setting | Value |
|---------|-------|
| **Name** | `Check Skip SMS - Switch` |
| **Type** | Switch |
| **Type Validation** | Strict |
| **Case Sensitive** | true |

**Output 0 (rename to "Send SMS"):**
- Left Value: `={{ $('Prepare Calendar Data - Code').item.json.isSupportType }}`
- Operation: equals
- Right Value: `false` (string)

**Output 1 (rename to "Skip SMS"):**
- Left Value: `={{ $('Prepare Calendar Data - Code').item.json.isSupportType }}`
- Operation: equals
- Right Value: `true` (string)

**Connections:**
- Send SMS -> existing `Send SMS - OpenPhone` node
- Skip SMS -> existing `Format Success - Code` node (bypass SMS entirely)

**Rewire:**
- Disconnect "Format Phone Number - Code" from "Send SMS - OpenPhone"
- Connect "Format Phone Number - Code" -> new "Check Skip SMS - Switch"
- Connect "Check Skip SMS - Switch" (Send SMS) -> "Send SMS - OpenPhone"
- Connect "Check Skip SMS - Switch" (Skip SMS) -> "Format Success - Code"

---

## Workflow 4: APPT - Update Multiple Appointments and Calendar (MEDIUM)

### Workflow Name
`APPT - Update Multiple Appointments and Calendar` (endpoint: `update-multiple-appointments-with-calendar`)

### Overview of Changes

This is the batch version of the Update Appointment workflow. The same type-aware logic applies.

3 nodes need modification:
1. **Validate and Prepare Multiple Appointments - Code** -- pass through type fields
2. **Prepare Calendar Sync - Code** -- type-aware calendar titles and colors
3. **Supabase Update nodes** -- add 3 new fields

### Before You Begin

1. **Export** the current workflow as JSON backup

---

### Node 1: Validate and Prepare Multiple Appointments - Code

**Current version:** v1.3.0
**New version:** v2.0.0

**Replace the entire Code node content with:**

```javascript
// Validate Multiple Appointments Request - v2.0.0
const requestBody = $json.body || $json;
const appointments = requestBody.appointments || [];

// Validate required fields
if (!Array.isArray(appointments) || appointments.length === 0) {
    console.log('Appointments array empty or invalid');
    return [{
        json: {
            success: false,
            error: 'Appointments array is required and must not be empty'
        }
    }];
}

// Helper function to handle empty strings for integer fields
function parseIntegerField(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const parsed = parseInt(value);
    return isNaN(parsed) ? null : parsed;
}

// Helper function to handle empty strings for numeric fields
function parseNumericField(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
}

// Calculate dropOffTime based on appointment type
function calculateDropOffTime(appointmentDateTime, appointmentLength, transitTime, appointmentType, tripDirection) {
    if (!appointmentDateTime) return null;

    const appointmentDate = new Date(appointmentDateTime);
    const lengthMinutes = appointmentLength || 120;
    const transitMinutes = transitTime || 0;
    const apptType = appointmentType || 'round_trip';
    const dir = tripDirection || 'to_clinic';

    if (apptType === 'one_way') {
        if (dir === 'to_home') {
            // Pickup at clinic, drive home
            return new Date(appointmentDate.getTime() + (transitMinutes * 60000)).toISOString();
        } else {
            // to_clinic: drop off at appointment time
            return appointmentDate.toISOString();
        }
    } else if (apptType === 'support') {
        // Block of time, no transit
        return new Date(appointmentDate.getTime() + (lengthMinutes * 60000)).toISOString();
    } else {
        // round_trip (default)
        const totalMinutes = lengthMinutes + transitMinutes;
        return new Date(appointmentDate.getTime() + (totalMinutes * 60000)).toISOString();
    }
}

// Calculate pickupTime based on appointment type
function calculatePickupTime(appointmentDateTime, transitTime, appointmentType, tripDirection) {
    if (!appointmentDateTime) return null;

    const appointmentDate = new Date(appointmentDateTime);
    const transitMinutes = transitTime || 0;
    const apptType = appointmentType || 'round_trip';
    const dir = tripDirection || 'to_clinic';

    if (apptType === 'one_way' && dir === 'to_home') {
        // Pickup at clinic at appointment time
        return appointmentDate.toISOString();
    } else if (apptType === 'support') {
        // Start at appointment time
        return appointmentDate.toISOString();
    } else {
        // round_trip or one_way to_clinic: subtract transit
        return new Date(appointmentDate.getTime() - (transitMinutes * 60000)).toISOString();
    }
}

// Process each appointment
const processedAppointments = [];
const errors = [];

for (let i = 0; i < appointments.length; i++) {
    const apt = appointments[i];

    try {
        // Validate required fields for each appointment
        if (!apt.id || apt.id.trim() === '') {
            errors.push(`Appointment ${i + 1}: ID is required`);
            continue;
        }

        // Determine if notes should go to scheduling_notes or notes field
        const notesValue = apt.notes || null;
        let schedulingNotes = null;
        let generalNotes = null;

        if (notesValue && notesValue.includes('pickup for') && notesValue.includes('appointment at')) {
            schedulingNotes = notesValue;
        } else {
            generalNotes = notesValue;
        }

        // Get appointment type fields
        const appointmentType = apt.appointment_type || 'round_trip';
        const tripDirection = apt.trip_direction || null;
        const eventName = apt.event_name || null;

        // Calculate times based on type
        const appointmentLength = parseIntegerField(apt.appointmentLength) || 120;
        const transitTime = parseIntegerField(apt.transitTime) || 0;
        const dropOffTime = calculateDropOffTime(apt.appointmentDateTime, appointmentLength, transitTime, appointmentType, tripDirection);
        const pickupTime = apt.pickupTime || calculatePickupTime(apt.appointmentDateTime, transitTime, appointmentType, tripDirection);

        // Determine status value - map old 'confirmed' to new 'assigned'
        const statusValue = apt.status || 'assigned';

        // Prepare appointment data
        const appointmentData = {
            id: apt.id,
            appointmenttime: apt.appointmentDateTime,
            pickuptime: pickupTime,
            dropOffTime: dropOffTime,
            appointmentLength: appointmentLength,
            transittime: transitTime,
            locationname: apt.location || null,
            locationaddress: apt.locationAddress || null,
            appointmentstatus: statusValue,
            operation_status: statusValue,
            driver_assigned: parseIntegerField(apt.driver_assigned),
            driver_first_name: apt.driver_first_name || null,
            notes: generalNotes,
            scheduling_notes: schedulingNotes,
            custom_rate: parseNumericField(apt.customRate),
            appointment_type: appointmentType,
            trip_direction: tripDirection,
            event_name: eventName
        };

        processedAppointments.push({
            json: {
                appointmentData: appointmentData,
                success: true,
                appointmentId: apt.id,
                originalIndex: i
            }
        });

    } catch (error) {
        errors.push(`Appointment ${i + 1} (${apt.id || 'unknown'}): ${error.message}`);
    }
}

if (errors.length > 0) {
    console.error('Validation errors:', errors);
}

return processedAppointments;

// Version: v2.0.0 - Added appointment type fields and type-aware timing
```

---

### Node 2: Prepare Calendar Sync - Code

**Current version:** v1.1.0
**New version:** v2.0.0

**Replace the entire Code node content with:**

```javascript
// Prepare Calendar Sync - v2.0.0
// Type-aware calendar events for batch updates
const appointments = $input.all().map(item => item.json);
const driverInfo = $('Validate New Driver - Code').first().json;

const operations = [];
let createCount = 0;
let updateCount = 0;

appointments.forEach((apt) => {
    const pickupTime = new Date(apt.pickuptime);
    const appointmentTime = new Date(apt.appointmenttime);
    const dropOffTime = new Date(apt.dropOffTime || appointmentTime.getTime() + (apt.this_appointment_length * 60000));

    const clientName = apt.firstname && apt.lastname ?
        `${apt.firstname} ${apt.lastname}` : 'Unknown Client';

    const clientAddress = [
        apt.civicaddress,
        apt.city,
        apt.prov,
        apt.postalcode
    ].filter(Boolean).join(', ');

    // Get appointment type info
    const apptType = apt.appointment_type || 'round_trip';
    const oneWayDir = apt.trip_direction || 'to_clinic';
    const supportName = apt.event_name || 'Support Event';

    // Build title based on type
    let eventTitle;
    if (apptType === 'one_way') {
        if (oneWayDir === 'to_home') {
            eventTitle = 'ONE-WAY: ' + clientName + ' \u2192 Home';
        } else {
            eventTitle = 'ONE-WAY: ' + clientName + ' \u2192 ' + apt.locationname;
        }
    } else if (apptType === 'support') {
        eventTitle = 'SUPPORT: ' + supportName;
    } else {
        eventTitle = 'Round Trip: ' + clientName + ' to ' + apt.locationname;
    }

    // Get color ID based on type
    let colorId = '2'; // round_trip = Sage
    if (apptType === 'one_way') colorId = '6'; // Tangerine
    if (apptType === 'support') colorId = '3'; // Grape

    // Build description lines
    const timeOpts = {
        timeZone: 'America/Halifax',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };

    const descLines = [
        'Client: ' + clientName,
        apt.phone ? 'Phone: ' + apt.phone : '',
        'Type: ' + apptType.replace('_', ' ')
    ];

    if (apptType === 'one_way') {
        descLines.push('Direction: ' + oneWayDir.replace('_', ' '));
    }

    descLines.push('Pickup: ' + pickupTime.toLocaleString('en-US', timeOpts));
    descLines.push('Appointment: ' + appointmentTime.toLocaleString('en-US', timeOpts));

    if (apt.notes) descLines.push('Notes: ' + apt.notes);
    if (apt.scheduling_notes) descLines.push('Scheduling: ' + apt.scheduling_notes);

    // Build location for calendar event
    let eventLocation = clientAddress;
    if (apptType === 'one_way' && oneWayDir === 'to_home') {
        eventLocation = apt.locationaddress || clientAddress;
    }

    const event = {
        summary: eventTitle,
        description: descLines.filter(Boolean).join('\n'),
        start: {
            dateTime: apt.pickuptime,
            timeZone: 'America/Halifax'
        },
        end: {
            dateTime: dropOffTime.toISOString(),
            timeZone: 'America/Halifax'
        },
        location: eventLocation,
        colorId: colorId,
        extendedProperties: {
            private: {
                rrts_appointment_id: apt.id.toString(),
                rrts_driver_id: driverInfo.driverId.toString(),
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

    let operation;
    if (apt.driver_calendar_event_id) {
        operation = 'UPDATE';
        updateCount++;
    } else {
        operation = 'CREATE';
        createCount++;
    }

    operations.push({
        json: {
            operation: operation,
            appointmentId: apt.id,
            eventId: apt.driver_calendar_event_id || null,
            calendarId: driverInfo.calendarId,
            event: event
        }
    });
});

console.log(`Prepared ${operations.length} operations (${createCount} create, ${updateCount} update)`);
return operations;

// Version: v2.0.0 - Type-aware calendar events
```

---

### Node 3: Supabase Update Nodes

For **both** Supabase Update nodes in this workflow (`Update Appointment - Supabase` and `Update Appointment After Calendar Delete - Supabase`), add 3 new field mappings.

**Update Appointment - Supabase** (no-delete path) -- add:

| Field | Value |
|-------|-------|
| `appointment_type` | `={{ $json.appointmentData.appointment_type }}` |
| `trip_direction` | `={{ $json.appointmentData.trip_direction }}` |
| `event_name` | `={{ $json.appointmentData.event_name }}` |

**Update Appointment After Calendar Delete - Supabase** (delete path) -- add:

| Field | Value |
|-------|-------|
| `appointment_type` | `={{ $('Compare Current vs New - Code').item.json.appointmentData.appointment_type }}` |
| `trip_direction` | `={{ $('Compare Current vs New - Code').item.json.appointmentData.trip_direction }}` |
| `event_name` | `={{ $('Compare Current vs New - Code').item.json.appointmentData.event_name }}` |

**Keep all existing fields unchanged in both nodes.**

---

## Workflow 5: RMDR - 1 Hour SMS Reminders (MEDIUM)

### Workflow Name
`RMDR - 1 Hour SMS Reminders`

### Overview of Changes

1 node needs modification:
1. **Format SMS Message - Code** -- type-aware message templates, skip support via `phone_valid: 'false'`

Support appointments will be skipped because the Code node returns `phone_valid: 'false'` for support type, which routes to the existing "invalid phone" path in the `Valid Phone Number - Switch` node. No new Switch node needed.

### Before You Begin

1. **Export** the current workflow as JSON backup

---

### Node 1: Format SMS Message - Code

**Current version:** (no version comment)
**New version:** v2.0.0

**Replace the entire Code node content with:**

```javascript
// Format SMS Message - v2.0.0
// Type-aware SMS messages, skip support appointments

// Get the combined data from previous node
const appointmentData = $json.appointment_data;
const clientData = $json.client_data;

// Get business name and signature from config (access via merge node)
const allMergedItems = $('Merge Config and Appointments').all();
const configItems = allMergedItems.filter(item => item.json.key);
const businessName = configItems.find(item => item.json.key === 'rrts_business_name')?.json.value || 'Rural Route Transportation Services';
const smsSignature = configItems.find(item => item.json.key === 'sms_signature')?.json.value || 'Andrew @ RRTS';

// Get appointment type
const apptType = appointmentData.appointment_type
  || 'round_trip';
const oneWayDir = appointmentData.trip_direction
  || 'to_clinic';

// Skip support appointments entirely
if (apptType === 'support') {
  return {
    appointment_id: appointmentData.id,
    client_knumber: appointmentData.knumber,
    client_name: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
    phone_formatted: '',
    phone_valid: 'false',
    message_content: '',
    skip_sms: 'true',
    minutes_until: 0,
    appointment_time: '',
    pickup_time: ''
  };
}

// Calculate exact time until appointment
const appointmentTime = new Date(appointmentData.appointmenttime);
const now = new Date();
const minutesUntil = Math.round((appointmentTime - now) / (1000 * 60));

// Format appointment time for display (Halifax timezone)
const timeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Halifax',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
});

const appointmentTimeStr = timeFormatter.format(appointmentTime);
const pickupTimeStr = timeFormatter.format(new Date(appointmentData.pickuptime));

// Format phone number to E.164
let phone = clientData.phone || '';
phone = phone.replace(/\D/g, ''); // Remove non-digits
if (phone.length === 10) {
  phone = '+1' + phone; // Add country code for 10-digit numbers
} else if (phone.length === 11 && phone.startsWith('1')) {
  phone = '+' + phone; // Add + to 11-digit numbers starting with 1
} else if (!phone.startsWith('+')) {
  phone = '+' + phone;
}

// Create phone validation string for switch
const phoneValid = (phone && phone.length >= 10) ? 'true' : 'false';

// Build type-aware personalized message
const driverName = appointmentData.driver_first_name
  || 'your driver';
const greeting = `Hi ${clientData.firstname || 'there'}, it's ${driverName} from RRTS. `;

let message;
if (apptType === 'one_way' && oneWayDir === 'to_clinic') {
  message = greeting
    + `I'll be there to pick you up at ${pickupTimeStr}`
    + ` and drop you off at ${appointmentData.locationname || 'your clinic'}`
    + ` for your ${appointmentTimeStr} appointment.`;
} else if (apptType === 'one_way' && oneWayDir === 'to_home') {
  message = greeting
    + `I'll pick you up at ${appointmentData.locationname || 'the clinic'}`
    + ` at ${pickupTimeStr} and bring you home.`;
} else {
  // round_trip (default)
  message = greeting
    + `I'll be there to pick you up at ${pickupTimeStr}`
    + ` for your ${appointmentTimeStr} appointment.`;
}

return {
  appointment_id: appointmentData.id,
  client_knumber: appointmentData.knumber,
  client_name: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
  phone_formatted: phone,
  phone_valid: phoneValid,
  message_content: message,
  skip_sms: 'false',
  minutes_until: minutesUntil,
  appointment_time: appointmentTimeStr,
  pickup_time: pickupTimeStr
};

// Version: v2.0.0 - Type-aware SMS, skip support appointments
```

---

### SMS Skip Mechanism

Support appointments return `phone_valid: 'false'`, which routes them through the existing `Valid Phone Number - Switch` node to the "False" path (Log Phone Error). This means support appointments are naturally skipped without needing a new Switch node.

No wiring changes required.

---

## Workflow 6: RMDR - Night Before SMS Reminders (MEDIUM)

### Workflow Name
`RMDR - Night Before SMS Reminders`

### Overview of Changes

1 node needs modification:
1. **Format SMS Message - Code** -- type-aware message templates, skip support via `phone_valid: 'false'`

Same skip mechanism as Workflow 5: support appointments return `phone_valid: 'false'` to route through the existing invalid phone path.

### Before You Begin

1. **Export** the current workflow as JSON backup

---

### Node 1: Format SMS Message - Code

**Current version:** (no version comment)
**New version:** v2.0.0

**Replace the entire Code node content with:**

```javascript
// Format SMS Message - v2.0.0
// Type-aware night-before SMS, skip support appointments

// Get the combined data from previous node
const appointmentData = $json.appointment_data;
const clientData = $json.client_data;

// Get appointment type
const apptType = appointmentData.appointment_type
  || 'round_trip';
const oneWayDir = appointmentData.trip_direction
  || 'to_clinic';

// Skip support appointments entirely
if (apptType === 'support') {
  return {
    appointment_id: appointmentData.id,
    client_knumber: appointmentData.knumber,
    client_name: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
    phone_formatted: '',
    phone_valid: 'false',
    message_content: '',
    skip_sms: 'true',
    appointment_time: '',
    pickup_time: ''
  };
}

// Format appointment time for display (Halifax timezone)
const appointmentTime = new Date(appointmentData.appointmenttime);
const pickupTime = new Date(appointmentData.pickuptime);

const timeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Halifax',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

const appointmentTimeStr = timeFormatter.format(appointmentTime);
const pickupTimeStr = timeFormatter.format(pickupTime);

// Format phone number to E.164
let phone = clientData.phone || '';
phone = phone.replace(/\D/g, ''); // Remove non-digits
if (phone.length === 10) {
  phone = '+1' + phone;
} else if (phone.length === 11 && phone.startsWith('1')) {
  phone = '+' + phone;
} else if (!phone.startsWith('+')) {
  phone = '+' + phone;
}

// Create phone validation string for switch
const phoneValid = (phone && phone.length >= 10) ? 'true' : 'false';

// Get driver name if available
const driverName = appointmentData.driver_first_name || 'your driver';

// Build type-aware night-before reminder message
let message;
const greeting = `Hello ${clientData.firstname || 'there'}, it's ${driverName} from RRTS. `;

if (apptType === 'one_way' && oneWayDir === 'to_clinic') {
  message = greeting
    + `Just a reminder that I'll be picking you up tomorrow at ${pickupTimeStr}`
    + ` and dropping you off at ${appointmentData.locationname || 'your clinic'}`
    + ` for your ${appointmentTimeStr} appointment.`;
} else if (apptType === 'one_way' && oneWayDir === 'to_home') {
  message = greeting
    + `Just a reminder that I'll be picking you up at`
    + ` ${appointmentData.locationname || 'the clinic'}`
    + ` tomorrow at ${pickupTimeStr} and bringing you home.`;
} else {
  // round_trip (default)
  message = greeting
    + `Just a reminder that I'll be picking you up tomorrow`
    + ` at ${pickupTimeStr} for your ${appointmentTimeStr} appointment.`;
}

return {
  appointment_id: appointmentData.id,
  client_knumber: appointmentData.knumber,
  client_name: `${clientData.firstname || ''} ${clientData.lastname || ''}`.trim(),
  phone_formatted: phone,
  phone_valid: phoneValid,
  message_content: message,
  skip_sms: 'false',
  appointment_time: appointmentTimeStr,
  pickup_time: pickupTimeStr
};

// Version: v2.0.0 - Type-aware night-before SMS, skip support appointments
```

---

### SMS Skip Mechanism

Same as Workflow 5: support appointments return `phone_valid: 'false'` and are routed to the existing "False" path in `Valid Phone Number - Switch`. No wiring changes required.

---

## Workflow 7: RMDR - Weekly Client Email Reminder (MEDIUM)

### Overview

The Weekly Client Email Reminder sends an email listing upcoming appointments. The appointment type should be included in the listing for clarity. This workflow does not have a JSON reference file in the repository, so changes are described at the pattern level.

### Changes

In the Code node that formats the email body, where appointment details are listed, add a type label. Find the section that builds appointment rows/lines and add the following code where each appointment is formatted:

```javascript
// Add this where each appointment row is built
const apptType = appointment.appointment_type
  || 'round_trip';
const typeLabel = apptType === 'one_way'
  ? 'One Way'
  : apptType === 'support'
    ? 'Support'
    : 'Round Trip';
```

Include `typeLabel` in the email output alongside date, time, and location. For example, if the current email line is:

```javascript
`${dateStr} at ${timeStr} - ${appointment.locationname}`
```

Change it to:

```javascript
`${dateStr} at ${timeStr} - ${typeLabel} - ${appointment.locationname || appointment.event_name || 'N/A'}`
```

Support events use `event_name` instead of `locationname`, so include the fallback.

---

## Workflow 8: APPT - Get Appointments Page Data (LOW)

### Workflow Name
`APPT - Get Appointments Page Data`

### Changes Required

**Likely none.** Supabase `Get Many` / `Get All` operations return ALL columns from the table. After the database migration adds `appointment_type`, `trip_direction`, and `event_name` columns, these will automatically appear in the response data.

### Verification Steps

1. After running the migration, trigger the endpoint
2. Check the response JSON for a known appointment
3. Verify `appointment_type`, `trip_direction`, and `event_name` fields are present
4. If a Code node filters or restructures the response, update it to include the new fields

If there IS a Code node that explicitly lists which fields to return (allowlist pattern), add the 3 new fields to that list.

---

## Workflows Requiring No Changes

These workflows need no modification for appointment types:

| Workflow | Reason |
|----------|--------|
| APPT - Get All Appointments | Returns all columns (auto includes new fields) |
| APPT - Get Active Present Future Appointments | Returns all columns (auto includes new fields) |
| APPT - Get Appointment | Returns all columns (auto includes new fields) |
| APPT - Delete Appointment with Calendar Management | Deletes by ID, no type logic needed |
| APPT - Soft Delete Appointment | Soft deletes by ID, no type logic needed |
| APPT - HARD Delete Appointment | Hard deletes by ID, no type logic needed |
| APPT - Unarchive Appointment | Restores by ID, no type logic needed |
| APPT - Update Driver Assignment | Updates driver only, no type logic needed |
| APPT - Get Appointment Modal Data | Returns all columns (auto includes new fields) |
| All CLIENT workflows | No appointment type logic |
| All DRIVER workflows | No appointment type logic |
| All USER workflows | No appointment type logic |
| All ADMIN workflows | No appointment type logic |
| All CLINIC workflows | No appointment type logic |
| All FINANCE workflows | No appointment type logic |

---

## Testing Checklist

### Pre-Deployment

- [ ] Database migration has been run (3 new columns on appointments table)
- [ ] All modified workflows have been backed up as JSON
- [ ] All Code node changes have been tested with pinned data in n8n

### Add Appointment (save-appointment-v7)

- [ ] `appointment_type: "round_trip"` creates with correct pickup/dropoff times (existing behavior)
- [ ] `appointment_type: "one_way"` + `trip_direction: "to_clinic"` creates with correct times
- [ ] `appointment_type: "one_way"` + `trip_direction: "to_home"` creates with correct times
- [ ] `appointment_type: "support"` + `event_name: "Wellness Check"` creates correctly
- [ ] Missing `appointment_type` defaults to `round_trip`
- [ ] Invalid `appointment_type` returns validation error
- [ ] `one_way` without `trip_direction` returns validation error
- [ ] `support` without `event_name` returns validation error
- [ ] `support` type does NOT require `location` or `locationAddress`
- [ ] Response includes `appointment_type` field
- [ ] Existing appointments without `appointment_type` still work (backward compat)

### Update Appointment (update-appointment-complete)

- [ ] All validation rules from Add apply
- [ ] Changing type from `round_trip` to `one_way` recalculates times
- [ ] Changing type updates Supabase record correctly
- [ ] Google Calendar title is "Round Trip: ClientName to Clinic" for round_trip
- [ ] Google Calendar title is "ONE-WAY: ClientName -> Clinic" for one_way to_clinic
- [ ] Google Calendar title is "ONE-WAY: ClientName -> Home" for one_way to_home
- [ ] Google Calendar title is "SUPPORT: EventName" for support
- [ ] Calendar color is Sage (2) for round_trip
- [ ] Calendar color is Tangerine (6) for one_way
- [ ] Calendar color is Grape (3) for support
- [ ] Calendar event description includes type info

### Cancel Appointment

- [ ] Cancelled round_trip calendar shows "CANCELLED - Round Trip: ..."
- [ ] Cancelled one_way calendar shows "CANCELLED - ONE-WAY: ..."
- [ ] Cancelled support calendar shows "CANCELLED - SUPPORT: ..."
- [ ] SMS is sent for cancelled round_trip appointments
- [ ] SMS is sent for cancelled one_way appointments
- [ ] SMS is **NOT** sent for cancelled support appointments

### SMS Reminders (1 Hour + Night Before)

- [ ] Round trip gets standard message
- [ ] One way to_clinic gets modified message (drop off wording)
- [ ] One way to_home gets modified message (pick up at clinic wording)
- [ ] Support appointments are SKIPPED entirely (no SMS)
- [ ] Existing appointments without type get standard message

### Update Multiple Appointments

- [ ] Batch update preserves appointment_type fields
- [ ] Type fields are passed through to Supabase update

### Get Appointments Page Data

- [ ] Response includes `appointment_type`, `trip_direction`, `event_name`
- [ ] Null values returned for existing appointments without type

### Backward Compatibility

- [ ] All existing appointments (no appointment_type column value) continue to work
- [ ] All workflows default to `round_trip` when type is missing
- [ ] No errors on appointments created before this feature

---

## Appendix: New Database Columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `appointment_type` | varchar(20) | `'round_trip'` | Type: round_trip, one_way, support |
| `trip_direction` | varchar(20) | `NULL` | Direction for one_way: to_clinic, to_home |
| `event_name` | varchar(255) | `NULL` | Custom event name for support type |

---

## Appendix: Credential Reference

All Supabase nodes should use the existing production credential. No new credentials are needed for this feature.

| Environment | Credential Name | Usage |
|-------------|----------------|-------|
| Production | `Supabase Service Role` | Live workflows |
| Testing | `Supabase Testing` | TEST- prefixed workflows only |

---

## Appendix: Quick Reference - Type to Calendar Mapping

```
round_trip  -> "Round Trip: Client to Clinic"     -> colorId: 2 (Sage)
one_way     -> "ONE-WAY: Client -> Clinic/Home"    -> colorId: 6 (Tangerine)
support     -> "SUPPORT: EventName"                -> colorId: 3 (Grape)
cancelled   -> "CANCELLED - {original title}"      -> (unchanged color)
```
