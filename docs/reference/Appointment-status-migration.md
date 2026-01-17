# Appointment Status Tracking Migration Plan

## 🎯 CURRENT STATUS (Updated: November 4, 2025 - End of Day)

### ✅ COMPLETED TODAY (Including Continuation Session Fixes)

#### Frontend Changes
1. **Status Display Migration**
   - Updated all views to read from `operation_status` (new) with fallback to `appointmentstatus` (old)
   - Calendar view: Lines 1150, 1306, 1408 in `appointments-sl.js`
   - List view: Line 1535 in `appointments-sl.js`
   - Added "assigned" status badge (light blue) to status badge definitions

2. **Appointment Modal Updates**
   - Removed "confirmed" status from dropdown (replaced with "assigned")
   - Added automatic status->driver sync: selecting driver auto-sets status to "assigned"
   - Hidden driver field in "Add Appointment" mode (only shows in edit/view modes)
   - Status mapping: Old "confirmed" automatically displays as "assigned" in edit modal

3. **CSS Status Styling**
   - Added `.appointment-block.status-assigned` (light blue)
   - Added `.appointment-block.status-completed` (blue/purple)
   - Added `.month-appointment-mini.status-assigned` (light blue)
   - Added `.month-appointment-mini.status-completed` (blue/purple)

4. **Filter System**
   - Made filter box collapsible (collapsed by default)
   - Changed "Status" filter to "Operation Status" with correct values (pending/assigned/completed/cancelled)
   - Added invoice_status filter (visible only for admin/supervisor roles)
   - Filters now work on calendar AND list views

5. **Cancel/Archive/Unarchive System**
   - Implemented soft delete (sets `deleted_at`, `deleted_by`)
   - Implemented unarchive (clears `deleted_at`, `deleted_by`)
   - Implemented cancel with driver notification (SMS via OpenPhone)
   - Added visual indicators for archived appointments (yellow background, ARCHIVED badge)
   - Fixed button logic: Cancel button shows for appointments WITH drivers, Archive shows for appointments WITHOUT drivers
   - Added failed attempt logging to audit trail

#### Backend Workflows (n8n)
1. **APPT - Update Single Appointment with Calendar Management**
   - Updated "Validate and Prepare Data" code to write BOTH `appointmentstatus` and `operation_status`
   - Added `operation_status` field to both Supabase update nodes
   - Optimized to only fetch/sync the single appointment being edited (not all driver appointments)
   - Version: v2.4.0

2. **APPT - Cancel Appointment**
   - Sets `operation_status` to 'cancelled'
   - Sends SMS to driver via OpenPhone API (E.164 phone formatting)
   - Updates Google Calendar event
   - Working correctly with proper authentication

3. **APPT - Soft Delete Appointment**
   - Sets `deleted_at` and `deleted_by` timestamps
   - Does NOT change `operation_status` (keeps existing status)
   - Prevents deletion if driver is assigned

4. **APPT - Unarchive Appointment**
   - Clears `deleted_at` and `deleted_by` fields
   - Restores appointment to active status

5. **APPT - Get Appointments Page Data (Amalgamated)**
   - Added `operation_status` field to response
   - Added `invoice_status`, soft delete fields, cancellation tracking
   - Version: v1.2.0+

6. **RMDR - 1 Hour SMS Reminders**
   - Updated filter from `appointmentstatus = 'confirmed'` to `operation_status = 'assigned'`
   - Fixed critical bug preventing SMS reminders from sending
   - Version: (12)

#### Critical Bug Fixes (Continuation Session)
1. **Driver Field Display Issue**
   - **Problem:** Edit modal showed "Not Assigned" even when driver was assigned
   - **Root Cause:** `setupDriverStatusSync()` was cloning dropdown AFTER values were populated, resetting selection
   - **Fix:** Moved sync setup before form population, added value preservation during cloning
   - **File:** `appointment-modal.js` lines 480-481, 507-518, 571
   - **Status:** ✅ RESOLVED

2. **SMS Reminders Not Working**
   - **Problem:** No SMS reminders being sent to clients
   - **Root Cause:** Workflow filtering for deprecated `appointmentstatus = 'confirmed'` which no longer exists
   - **Fix:** Updated filter to `operation_status = 'assigned'`
   - **File:** `RMDR - 1 Hour SMS Reminders (12).json` lines 78-80
   - **Status:** ✅ RESOLVED

3. **Missing operation_status in API Response**
   - **Problem:** Frontend couldn't access new operation_status field
   - **Root Cause:** Amalgamated workflow wasn't including the field in response
   - **Fix:** Added operation_status to appointment object mapping
   - **File:** `APPT - Get Appointments Page Data (Amalgamated) (1).json` line 190
   - **Status:** ✅ RESOLVED

#### Database Constraint Fix
- Fixed validation error: `valid_operation_status` constraint only allows: pending, assigned, completed, cancelled
- Removed "confirmed" from valid values (deprecated in favor of "assigned")

### 🔄 IN PROGRESS

None currently - all planned work completed.

### 📋 TODO / NEXT STEPS

1. **Batch Driver Assignment Workflow** ⚠️ HIGH PRIORITY
   - Create separate workflow for operations.html to assign drivers to multiple appointments at once
   - Should fetch ALL driver appointments (unlike single update workflow)
   - Endpoint: `/batch-assign-drivers` or `/batch-update-appointments`
   - Use case: Weekly driver scheduling on operations page

2. **Complete Status Migration**
   - Test all workflows with new status system
   - Monitor for any remaining references to old `appointmentstatus` field
   - After 1-2 weeks in production, deprecate `appointmentstatus` column

3. **Invoice Status Implementation**
   - Build UI for finance/admin to manage invoice statuses
   - Implement invoice generation workflow
   - Add payment tracking UI

4. **Payment Tracking Implementation**
   - UI for marking drivers as paid
   - UI for marking booking agents as paid
   - Payment reports

5. **Add Appointment Workflow** (if needed)
   - Verify "Add New Appointments" workflow also writes to `operation_status`
   - Update if necessary

### ⚠️ KNOWN ISSUES

None currently.

### 🔍 TESTING NOTES

**Initial Testing:**
- Status display working correctly in calendar and list views
- Filters working on operation_status field
- Cancel workflow successfully sends SMS and updates calendar
- Archive/Unarchive working correctly with audit logging
- Driver assignment auto-updates status to "assigned"
- Calendar events created correctly (no duplicates - was display layer issue)

**Continuation Session Testing:**
- ✅ Driver field now displays assigned driver correctly in edit modal
- ✅ Cancel/Archive buttons show correctly based on driver assignment
- ✅ SMS reminders workflow now finds appointments using operation_status filter
- ✅ Frontend receives operation_status field from amalgamated endpoint
- ✅ All console debug logging cleaned up for production

---

## Context

The appointment management system previously used a single `appointmentstatus` column (text) to track all states. This was insufficient because:

1. Different user roles need different information (booking agents vs supervisors vs finance)
2. Operational status (driver assignment) is independent from financial status (invoicing)
3. Need to track multiple payment recipients (driver, booking agent)
4. Need audit trail for cancellations and deletions

## Design Decision

**Separated concerns into multiple columns instead of a single status field** because:

- Operational and financial workflows are parallel, not sequential
- Different roles need to filter on different aspects
- Avoids compound states like "assigned_invoice_sent"
- Makes queries simpler and more performant
- Provides precise timestamps for each event

## Database Schema Changes

### Completed Migrations

All of the following have been successfully added to the `appointments` table:

#### Operational Status
- `operation_status` (text, NOT NULL, CHECK constraint)
  - Values: 'pending', 'assigned', 'completed', 'cancelled'
  - Migrated from old `appointmentstatus` based on `driver_assigned` presence
  - Current state: 63 pending, 72 assigned

#### Financial Workflow
- `invoice_status` (text, default 'not_ready', CHECK constraint)
  - Values: 'not_ready', 'ready', 'created', 'sent', 'paid'
- `invoice_created_at` (timestamp with time zone)
- `invoice_sent_at` (timestamp with time zone)
- `payment_received_at` (timestamp with time zone)

#### Payment Tracking
- `driver_paid_at` (timestamp with time zone)
- `booking_agent_paid_at` (timestamp with time zone)

#### Soft Delete / Cancellation
- `deleted_at` (timestamp with time zone)
- `deleted_by` (integer, FK to users.id)
- `cancelled_at` (timestamp with time zone)
- `cancelled_by` (integer, FK to users.id)
- `cancellation_reason` (text)

### Existing Columns Still in Use
- `appointmentstatus` (text) - **TO BE DEPRECATED** after application code migration
- `driver_assigned` (integer, FK to drivers.id) - still used, works with `operation_status`
- `created_at` (timestamp with time zone) - tracks "appointment created" action

## Application Code Changes Needed

### 1. Update Status Setting Logic

Replace all uses of `appointmentstatus` with `operation_status`:

**Before:**
```javascript
await supabase
  .from('appointments')
  .update({ appointmentstatus: 'assigned' })
  .eq('id', appointmentId);
```

**After:**
```javascript
await supabase
  .from('appointments')
  .update({ 
    operation_status: 'assigned',
    driver_assigned: driverId 
  })
  .eq('id', appointmentId);
```

### 2. Calendar View (Booking Agent)

**Query:**
```javascript
const { data } = await supabase
  .from('appointments')
  .select('*')
  .is('deleted_at', null) // exclude soft-deleted
  .gte('appointmenttime', startDate)
  .lte('appointmenttime', endDate)
  .order('appointmenttime');
```

**Color Coding:**
```javascript
function getAppointmentColor(appointment) {
  if (appointment.deleted_at) return null; // hidden
  
  switch (appointment.operation_status) {
    case 'cancelled': return 'red';
    case 'assigned': return 'green';
    case 'pending': return 'yellow';
    case 'completed': return 'blue';
    default: return 'gray';
  }
}
```

### 3. Financial Workflows

**Ready for Invoicing (Supervisor View):**
```javascript
const { data } = await supabase
  .from('appointments')
  .select('*, clients(*), drivers(*)')
  .eq('operation_status', 'completed')
  .in('invoice_status', ['not_ready', 'ready'])
  .is('deleted_at', null)
  .order('appointmenttime');
```

**Outstanding Invoices:**
```javascript
const { data } = await supabase
  .from('appointments')
  .select('*, clients(*)')
  .eq('invoice_status', 'sent')
  .is('payment_received_at', null)
  .is('deleted_at', null);
```

**Unpaid Drivers:**
```javascript
const { data } = await supabase
  .from('appointments')
  .select('*, drivers(*)')
  .eq('operation_status', 'completed')
  .is('driver_paid_at', null)
  .is('deleted_at', null);
```

**Unpaid Booking Agents:**
```javascript
const { data } = await supabase
  .from('appointments')
  .select('*')
  .eq('operation_status', 'completed')
  .is('booking_agent_paid_at', null)
  .is('deleted_at', null);
```

### 4. System Logging Integration

The `system_logs` table already exists. Every status change should create a log entry:

```javascript
async function assignDriver(appointmentId, driverId, userId) {
  // Update appointment
  const { data: appointment } = await supabase
    .from('appointments')
    .update({ 
      driver_assigned: driverId,
      operation_status: 'assigned' 
    })
    .eq('id', appointmentId)
    .select()
    .single();
  
  // Log the action
  await supabase.from('system_logs').insert({
    action: 'driver_assigned',
    entity_type: 'appointment',
    entity_id: appointmentId,
    user_id: userId,
    details: { 
      driver_id: driverId,
      previous_status: 'pending',
      new_status: 'assigned'
    }
  });
  
  return appointment;
}
```

**Actions to Log:**
- `appointment_created` (already tracked via `created_at`)
- `driver_assigned`
- `appointment_completed`
- `appointment_cancelled` (set `cancelled_at`, `cancelled_by`, `cancellation_reason`)
- `appointment_deleted` (set `deleted_at`, `deleted_by`)
- `invoice_ready` (change `invoice_status` to 'ready')
- `invoice_created` (set `invoice_created_at`, change `invoice_status` to 'created')
- `invoice_sent` (set `invoice_sent_at`, change `invoice_status` to 'sent')
- `payment_received` (set `payment_received_at`, change `invoice_status` to 'paid')
- `driver_paid` (set `driver_paid_at`)
- `booking_agent_paid` (set `booking_agent_paid_at`)

### 5. Soft Delete Implementation

**Instead of DELETE:**
```javascript
async function deleteAppointment(appointmentId, userId) {
  const { data } = await supabase
    .from('appointments')
    .update({ 
      deleted_at: new Date().toISOString(),
      deleted_by: userId
    })
    .eq('id', appointmentId)
    .select()
    .single();
  
  await supabase.from('system_logs').insert({
    action: 'appointment_deleted',
    entity_type: 'appointment',
    entity_id: appointmentId,
    user_id: userId
  });
  
  return data;
}
```

**Toggle Visibility:**
```javascript
// Default: hide deleted
.is('deleted_at', null)

// Show deleted (supervisor view with toggle)
// No filter, or:
.order('deleted_at', { ascending: false, nullsFirst: true })
```

### 6. Cancellation Flow

```javascript
async function cancelAppointment(appointmentId, userId, reason) {
  const { data } = await supabase
    .from('appointments')
    .update({ 
      operation_status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      cancellation_reason: reason
    })
    .eq('id', appointmentId)
    .select()
    .single();
  
  await supabase.from('system_logs').insert({
    action: 'appointment_cancelled',
    entity_type: 'appointment',
    entity_id: appointmentId,
    user_id: userId,
    details: { reason }
  });
  
  return data;
}
```

## Status Transition Rules

### operation_status Transitions
- `pending` → `assigned` (when driver assigned)
- `pending` → `cancelled` (booking agent or client cancels before assignment)
- `assigned` → `completed` (after appointment happens)
- `assigned` → `cancelled` (cancellation after assignment)
- `completed` → (terminal state, no further transitions)
- `cancelled` → (terminal state, no further transitions)

### invoice_status Transitions
- `not_ready` → `ready` (appointment completed, ready to invoice)
- `ready` → `created` (invoice generated)
- `created` → `sent` (invoice sent to client)
- `sent` → `paid` (payment received)

**Note:** `invoice_status` is independent of `operation_status` but typically:
- Don't invoice until `operation_status = 'completed'`
- Cancelled appointments may still need invoices (cancellation fees)

## Testing Checklist

- [ ] Calendar displays correct colors based on `operation_status`
- [ ] Deleted appointments are hidden by default
- [ ] Booking agent can toggle visibility of deleted appointments
- [ ] Supervisor can see invoice-related statuses
- [ ] Driver assignment updates `operation_status` to 'assigned'
- [ ] All status changes create system log entries
- [ ] Financial queries return correct appointments for invoicing
- [ ] Payment tracking shows unpaid drivers/agents correctly
- [ ] Cancellation stores reason and user who cancelled
- [ ] Soft delete stores user who deleted

## Deprecation Steps

Once all application code is migrated:

1. Verify no code references `appointmentstatus`
2. Run in production for 1-2 weeks
3. Backup database
4. Drop old column:
```sql
ALTER TABLE appointments DROP COLUMN appointmentstatus;
```

## Role-Based Views Summary

**Booking Agent:**
- Sees: `operation_status`, `driver_assigned`, `deleted_at`
- Filters: Hide deleted by default, color code by operation status
- Doesn't need: Invoice or payment information

**Supervisor:**
- Sees: Everything
- Filters: Outstanding invoices, unpaid staff, financial reports
- Needs: All status fields

**Driver:**
- Sees: Their assigned appointments (`driver_assigned = their_id`)
- Filters: Upcoming appointments, `operation_status != 'cancelled'`
- Doesn't need: Financial details

**Finance/Admin:**
- Sees: Invoice and payment fields
- Filters: Payment tracking, invoice status
- Needs: `invoice_status`, `*_paid_at` timestamps

## Current State Summary

✅ **Completed:**
- All new columns added to database
- Data migrated from old `appointmentstatus` to `operation_status`
- Constraints applied
- 63 pending + 72 assigned appointments successfully migrated

⏳ **Remaining:**
- Update application code to use new columns
- Implement system logging for all status changes
- Build role-specific query views
- Implement soft delete in UI
- Test all workflows end-to-end
- Deprecate old `appointmentstatus` column

## Quick Reference: Column Purpose

| Column | Purpose | Used By |
|--------|---------|---------|
| `operation_status` | Track operational workflow | All users |
| `driver_assigned` | Which driver is assigned | All users |
| `invoice_status` | Track invoicing workflow | Supervisor, Finance |
| `invoice_created_at` | When invoice generated | Finance |
| `invoice_sent_at` | When invoice sent | Finance |
| `payment_received_at` | When client paid | Finance |
| `driver_paid_at` | When driver was paid | Finance, Admin |
| `booking_agent_paid_at` | When agent was paid | Finance, Admin |
| `deleted_at` | Soft delete timestamp | All (filter) |
| `deleted_by` | Who soft deleted | Supervisor |
| `cancelled_at` | When cancelled | All users |
| `cancelled_by` | Who cancelled | Supervisor |
| `cancellation_reason` | Why cancelled | Supervisor, Support |