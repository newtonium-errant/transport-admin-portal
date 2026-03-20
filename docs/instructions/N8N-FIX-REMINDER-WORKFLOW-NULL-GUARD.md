# Fix Reminder Workflow — Null Guard on Driver Lookup

**Workflow:** RMDR - 1 Hour SMS Reminders (endpoint: cron trigger, no webhook)
**Date:** 2026-03-20
**Applies to:** Production n8n instance
**Estimated time:** 5-10 minutes

## Problem

The `Get Driver Details - Supabase` node looks up the driver using `driver_assigned` from the appointment data:

```
keyValue: ={{ $('Client Route - Switch').item.json.appointment_data.driver_assigned }}
```

When `driver_assigned` is null (no driver assigned yet), n8n coerces it to the string `"null"`, which gets sent to Supabase as a filter value for the integer `id` column. PostgreSQL throws an "invalid input syntax for type integer" error, crashing the reminder for that appointment.

## Current Flow (broken path)

```
Valid Phone Number - Switch ("True")
  → Get Driver Details - Supabase     ← crashes here when driver_assigned is null
    → Format Driver Phone Number - Code
      → Send OpenPhone SMS
```

## Fix: Add a Switch Guard Node

Insert a new Switch node between `Valid Phone Number - Switch` and `Get Driver Details - Supabase` that checks whether `driver_assigned` has a value. If null/empty, skip the driver lookup entirely and go straight to a Code node that sets the fallback phone number.

### Step 1: Add the Switch Node

1. In the n8n UI, click the **+** button on the canvas to add a new node
2. Search for **Switch** and add it
3. Name it: **`Has Driver Assigned - Switch`**
4. Position it between `Valid Phone Number - Switch` and `Get Driver Details - Supabase`

Configure the Switch node:

**Output 1 — "Has Driver":**
- Left Value: `={{ $('Client Route - Switch').item.json.appointment_data.driver_assigned }}`
- Operation: `is not empty`
- Rename Output: `Has Driver`

**Output 2 — "No Driver":**
- Left Value: `={{ $('Client Route - Switch').item.json.appointment_data.driver_assigned }}`
- Operation: `is empty`
- Rename Output: `No Driver`

Make sure **Type Validation** is set to `Strict` and **Case Sensitive** is checked.

> **Note:** We reference `$('Client Route - Switch')` instead of `$json` because the upstream `Format SMS Message` node outputs flat fields (`appointment_id`, `phone_formatted`, etc.) and does NOT pass through the raw `appointment_data.driver_assigned` field. This matches how the existing `Get Driver Details - Supabase` node already references the same upstream path.

### Step 2: Add the "No Driver Fallback" Code Node

1. Add a new **Code** node
2. Name it: **`No Driver Fallback Phone - Code`**
3. Set mode to: **Run Once for Each Item**
4. Paste this code:

```javascript
// No Driver Fallback - v1.0.0
// Skip driver lookup, use fallback business phone
const appointmentData = $json;
const configItems = $('Merge Config and Appointments').all();
const fallbackPhone = configItems.find(
  item => item.json.key === 'rrts_main_phone'
)?.json.value || '+17788888888';

return {
  ...appointmentData,
  driver_work_phone: null,
  formatted_driver_phone: null,
  sms_from_phone: fallbackPhone
};
```

5. Position it below the `Has Driver Assigned - Switch` node

### Step 3: Rewire the Connections

**Disconnect** the existing connection:
- `Valid Phone Number - Switch` ("True") → `Get Driver Details - Supabase`

**Add new connections:**
1. `Valid Phone Number - Switch` ("True") → **`Has Driver Assigned - Switch`** (input)
2. `Has Driver Assigned - Switch` ("Has Driver") → `Get Driver Details - Supabase` (input)
3. `Has Driver Assigned - Switch` ("No Driver") → **`No Driver Fallback Phone - Code`** (input)
4. `No Driver Fallback Phone - Code` → `Send OpenPhone SMS` (input)

**Keep existing connection:**
- `Get Driver Details - Supabase` → `Format Driver Phone Number - Code` → `Send OpenPhone SMS` (unchanged)

### Final Flow

```
Valid Phone Number - Switch ("True")
  → Has Driver Assigned - Switch
      ├─ "Has Driver" → Get Driver Details - Supabase
      │                   → Format Driver Phone Number - Code
      │                     → Send OpenPhone SMS
      └─ "No Driver"  → No Driver Fallback Phone - Code
                          → Send OpenPhone SMS
```

Both paths converge at `Send OpenPhone SMS`. The reminder is still sent — the only difference is whether the SMS "from" number is the driver's work phone or the business fallback phone.

## After the Fix

1. **Save** the workflow (Ctrl+S)
2. **Verify** the workflow is still active (toggle should be ON)

## Verification

To test, you need an appointment that:
- Is in the 1-hour reminder window
- Has `operation_status = "assigned"`
- Has `reminder_sent_client = false`
- Has `driver_assigned = null`

After the fix, this appointment should:
- Pass through the "No Driver" path
- Use the fallback business phone as the SMS sender
- Successfully send the reminder SMS
- Not throw a PostgreSQL integer parse error
