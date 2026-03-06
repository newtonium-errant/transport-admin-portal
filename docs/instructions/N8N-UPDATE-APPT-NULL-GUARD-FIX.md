# N8N Fix: Null Guard for Non-Text Nullable Fields in Update Appointment Nodes

## Problem

The "Update Appt After Delete - Supabase" and "Update Appointment - Supabase" nodes fail with:

```
invalid input syntax for type timestamp with time zone: ""
```

**Root cause:** When n8n evaluates an expression like `={{ $('Node').item.json.fieldName }}` and the JavaScript value is `null` or `undefined`, n8n's expression engine converts it to an empty string `""`. Postgres rejects `""` for non-text column types (timestamp, integer, numeric).

**Affected fields (nullable non-text columns):**
- `clinic_id` (integer, nullable) — fails with `invalid input syntax for type integer: ""`
- `custom_rate` (numeric, nullable) — fails with `invalid input syntax for type numeric: ""`
- `managed_by` (integer, nullable) — fails with `invalid input syntax for type integer: ""`
- `driver_assigned` (integer, nullable) — fails with `invalid input syntax for type integer: ""`

The `timestamp with time zone` error reported from production may occur when any of these nullable fields receive null from the frontend while Postgres processes the UPDATE statement.

## Fix: Apply to Production Workflow

**Workflow:** APPT - Update Appointment Async
**Nodes to modify:** 2 (both Supabase Update nodes)

---

### Node 1: "Update Appointment - Supabase"

Open this node and change these 4 field expressions:

#### Field: `clinic_id`
- **Old:** `{{ $('Compare Current vs New - Code').item.json.clinic_id }}`
- **New:** `{{ $('Compare Current vs New - Code').item.json.clinic_id != null ? $('Compare Current vs New - Code').item.json.clinic_id : null }}`

#### Field: `custom_rate`
- **Old:** `{{ $('Compare Current vs New - Code').item.json.customRate }}`
- **New:** `{{ $('Compare Current vs New - Code').item.json.customRate != null ? $('Compare Current vs New - Code').item.json.customRate : null }}`

#### Field: `managed_by`
- **Old:** `{{ $('Compare Current vs New - Code').item.json.managed_by }}`
- **New:** `{{ $('Compare Current vs New - Code').item.json.managed_by != null ? $('Compare Current vs New - Code').item.json.managed_by : null }}`

#### Field: `driver_assigned`
- **Old:** `{{ $('Compare Current vs New - Code').item.json.driver_assigned }}`
- **New:** `{{ $('Compare Current vs New - Code').item.json.driver_assigned != null ? $('Compare Current vs New - Code').item.json.driver_assigned : null }}`

---

### Node 2: "Update Appt After Delete - Supabase"

Open this node and change the **same 4 fields** with the **same expressions** as Node 1 above.

The field names and expressions are identical — both nodes write the same set of appointment columns.

---

### Node 3: "Save Calendar Event ID - Supabase" (verify only)

Verify this node already has `null` fallbacks (not empty string `''`):

- `driver_calendar_event_id`: should be `{{ $json.id || null }}` (NOT `{{ $json.id || '' }}`)
- `google_calendar_last_synced`: should be `{{ $json.id ? new Date().toISOString() : null }}` (NOT `... : ''`)

If these still use `''`, change them to `null`.

---

## How the Fix Works

The ternary pattern `{{ value != null ? value : null }}` works because:

1. `!= null` catches both `null` AND `undefined` (loose equality)
2. When the ternary evaluates to JavaScript `null`, n8n treats it the same as `={{ null }}` — sending JSON `null` to PostgREST
3. When the value exists and is valid (e.g., `13` for managed_by), it passes through unchanged
4. This preserves `0` as a valid integer value (unlike `|| null` which would null out zeroes)

## Testing

After applying the fix:

1. **Test with driver assigned:** Edit an appointment that has a driver, change something (e.g., notes). Verify the update succeeds.
2. **Test without driver:** Edit an appointment with no driver assigned (`driver_assigned` = null). Verify the update succeeds without the timestamp/integer error.
3. **Test driver change (delete path):** Edit an appointment, change the driver from one to another. This triggers the "Update Appt After Delete" path. Verify it succeeds.
4. **Test with no custom rate:** Edit an appointment where `custom_rate` is null. Verify no errors.

## Prevention

This pattern should be applied to ALL Supabase Update/Create nodes that write nullable non-text columns. See the SOP in:
- `database/docs/SUPABASE_NODE_QUICK_REFERENCE.md` — "Empty Strings to Clear Non-Text Columns" section
- `docs/instructions/AGENT_INSTRUCTIONS_N8N.md` — "Clearing Column Values Mistakes" section
