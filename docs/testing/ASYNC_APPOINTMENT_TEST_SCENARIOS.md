# Async Appointment Workflows - Test Scenarios

**Version:** 1.0.0
**Date:** 2026-03-03
**Author:** testing-qa

## Table of Contents

1. [Test Environment Setup](#test-environment-setup)
2. [Scenario 1: Single Appointment Save by Type](#scenario-1-single-appointment-save-by-type)
3. [Scenario 2: Bulk Appointment Save](#scenario-2-bulk-appointment-save)
4. [Scenario 3: Update with Driver Change](#scenario-3-update-with-driver-change)
5. [Scenario 4: Update with Calendar Field Changes (No Driver Change)](#scenario-4-update-with-calendar-field-changes-no-driver-change)
6. [Scenario 5: Support Event Specifics](#scenario-5-support-event-specifics)
7. [Scenario 6: One-Way Timing and SMS](#scenario-6-one-way-timing-and-sms)
8. [Scenario 7: Failure Scenarios](#scenario-7-failure-scenarios)
9. [Scenario 8: Race Conditions](#scenario-8-race-conditions)
10. [Scenario 9: Task Monitor Across Roles](#scenario-9-task-monitor-across-roles)
11. [Scenario 10: RBAC - Role-Specific Behavior](#scenario-10-rbac---role-specific-behavior)

---

## Test Environment Setup

### Prerequisite Checklist

- [ ] Migration 26 (`26_background_tasks.sql`) applied to test database
- [ ] Migration 19 (`19_appointment_types.sql`) applied (appointment_type, trip_direction, event_name columns + K0000 sentinel client)
- [ ] Async Add Appointment n8n workflow deployed and active (TEST- prefix for staging)
- [ ] Async Update Appointment n8n workflow deployed and active
- [ ] `get-failed-tasks` and `dismiss-task` endpoints active
- [ ] TaskMonitor + TaskNotifications JS loaded on all test pages
- [ ] Test user accounts available for all 5 roles (admin, supervisor, booking_agent, driver, client)
- [ ] At least 2 active drivers with Google Calendars
- [ ] At least 3 active clients with `clinic_travel_times` populated (including one with secondary address)
- [ ] K0000 sentinel client exists for support events
- [ ] At least 2 clinic/destination records available

### Test Data Conventions

- **Test clients:** K9000+ range (per CLAUDE.md convention)
- **Test users:** `test_` prefix for usernames
- **Test webhooks:** `TEST-` prefix (e.g., `TEST-save-appointment-v7`)
- **Test pages:** Files in `developing/` folder with TEST MODE banner

### Roles Reference

| Role | Pages | Can Assign Drivers | Can View Costs | Can Delete Appointments | Session Timeout |
|------|-------|--------------------|----------------|-------------------------|-----------------|
| admin | All | Yes | Yes | Yes (hard + soft) | 30 min |
| supervisor | All except admin | Yes | Yes | Yes (soft only) | 60 min |
| booking_agent | dashboard, clients, appointments, bulk-add, profile | No | No | Yes (soft only) | 120 min |
| driver | dashboard, appointment-management, profile | No | No | No | 120 min |
| client | dashboard, profile | No | No | No | 120 min |

---

## Scenario 1: Single Appointment Save by Type

### Purpose

Verify that saving a single appointment (from `appointments-sl.html` or `clients-sl.html`) returns an immediate response, creates the correct `background_tasks` rows for async operations, and uses the correct payload format (`{ appointments: [{ ... }] }`) sent to `/save-appointment-v7`.

---

### 1A. Round Trip (Default)

**Precondition:** Logged in as admin. Client K9001 has `clinic_travel_times` populated. Driver available.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointments page, click "Add Appointment" | Modal opens in add mode. Type selector shows Round Trip selected (default). |
| 2 | Select client K9001 from dropdown | Client fields auto-populate: `appointmentLength` from `default_appointment_length`, primary clinic auto-selects (if `primary_clinic_id` set), transit time auto-fills from `clinic_travel_times`. |
| 3 | Set appointment date/time to tomorrow 10:00 AM | Pickup time auto-calculates: appointment time minus transit time. |
| 4 | Click "Save Appointment" | **Immediate response (< 1 second):** success toast appears, modal closes. Appointment appears in table with status "pending". |
| 5 | Check browser console | Payload sent to `/save-appointment-v7` includes: `{ appointments: [{ knumber, appointmentDateTime (ISO UTC), appointmentLength (camelCase), status: "pending", appointment_type: "round_trip", trip_direction: null, event_name: null, ... }] }`. |
| 6 | Check `background_tasks` table | New row(s) created with `entity_type: 'appointment'`, `entity_id:` (appointment UUID), `status: 'pending'`, task_type(s) appropriate for round_trip (e.g., `send_sms_notification`). No `sync_calendar` task yet (no driver assigned). |
| 7 | Wait 10-30 seconds | Background task(s) transition: `pending` -> `processing` -> `completed`. SMS notification sent to client (if configured). |

**Verify field name casing in payload:**
- `appointmentLength` (camelCase) -- NOT `appointment_length`
- `appointmentDateTime` (camelCase) -- NOT `appointment_date_time`
- `transitTime` (camelCase) -- NOT `transit_time`

---

### 1B. One Way (to_clinic)

**Precondition:** Same as 1A.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Add Appointment modal | Round Trip selected by default. |
| 2 | Click "One Way" type button | Type selector highlights One Way. Trip Direction dropdown appears. Event Name field hidden. Client selection remains visible. Transit time row remains visible. |
| 3 | Select "To Clinic (Home -> Clinic)" from Trip Direction | Direction set. |
| 4 | Select client, set date/time, select clinic | Auto-population works same as round trip. |
| 5 | Save | Payload includes: `appointment_type: "one_way"`, `trip_direction: "to_clinic"`, `event_name: null`. |
| 6 | Check `background_tasks` | Task(s) created. SMS template should differ from round_trip (one-way specific wording). |

---

### 1C. One Way (to_home)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1-4 | Same as 1B but select "To Home (Clinic -> Home)" | Direction set to `to_home`. |
| 5 | Save | Payload: `trip_direction: "to_home"`. Timing calc: pickupTime = appointmentDateTime, dropOffTime = appointmentDateTime + transitTime. |

---

### 1D. Support Event

**Precondition:** Logged in as admin or supervisor.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Add Appointment modal | Round Trip selected. |
| 2 | Click "Support Event" type button | Client selection row hides. `appointmentClientId` auto-set to "K0000". Trip Direction row hidden. Event Name field appears (required). Transit time row hides. Clinic label changes to "Event Venue". |
| 3 | Enter event name "Community Health Fair" | Event name field populated. |
| 4 | Set date/time and select venue | No transit time calculation (support events have no transit). |
| 5 | Save | Payload: `knumber: "K0000"`, `appointment_type: "support"`, `trip_direction: null`, `event_name: "Community Health Fair"`. |
| 6 | Check `background_tasks` | No `send_sms_notification` task created (support events skip SMS). No calendar color set for support. If a calendar event is created, title should use event_name. |

**Validation checks:**
- Saving without event name shows alert: "Please enter an event name for support events."
- K0000 sentinel is NOT shown in client dropdown for non-support types.

---

## Scenario 2: Bulk Appointment Save

### Purpose

Verify that `appointments-bulk-add.html` sends multiple appointments in a single array to `/save-appointment-v7` and that background tasks are created for each.

---

### 2A. Multiple Round Trip Appointments

**Precondition:** Logged in as admin. Page: `appointments-bulk-add.html`.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add 3 appointments for client K9001 on different dates | Summary shows 3 pending appointments. |
| 2 | Click "Save" | Single POST to `/save-appointment-v7` with `{ appointments: [apt1, apt2, apt3] }`. All 3 in one request, NOT 3 separate requests. |
| 3 | Check response | Immediate success response. All 3 appointments appear with IDs. |
| 4 | Check `background_tasks` | Background task rows created for each appointment (e.g., 3x `send_sms_notification` if SMS enabled). |

---

### 2B. Mixed Type Bulk (if supported)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add appointments with mixed types (round_trip + one_way) | Each appointment in the array has its own `appointment_type` and `trip_direction`. |
| 2 | Save | Workflow processes each item according to its type. Timing calculations per-item. |

---

### 2C. Bulk with Invalid Appointment

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add 3 appointments where 1 has missing required field (e.g., no `location`) | Frontend validation should catch before sending. |
| 2 | If validation missed, check workflow response | Workflow should return partial success or reject entire batch (verify which behavior is implemented). |

---

## Scenario 3: Update with Driver Change

### Purpose

Verify that when a driver is changed on an existing appointment, the old driver's Google Calendar event is deleted (async) and a new event is created on the new driver's calendar (async).

---

### 3A. Assign Driver to Unassigned Appointment

**Precondition:** Logged in as admin or supervisor. Existing appointment with `driver_assigned: null`, `status: "pending"`.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode | Driver dropdown shows "Not Assigned". Status is "pending". |
| 2 | Select a driver from dropdown | Status auto-changes to "assigned" (modal logic at line ~1873). |
| 3 | Click "Update Appointment" | POST to `/update-appointment-complete`. Immediate response. |
| 4 | Check `background_tasks` | New task: `task_type: 'sync_calendar'`, `entity_type: 'appointment'`, `status: 'pending'`. No `delete_calendar` task (there was no previous driver). |
| 5 | Wait for background completion | Calendar event created on driver's Google Calendar. Task status -> `completed`. |
| 6 | Check driver's Google Calendar | Event exists with correct: title (client name + clinic), start/end times (based on type timing), correct color. |

---

### 3B. Change Driver (Driver A -> Driver B)

**Precondition:** Appointment has Driver A assigned with an existing Google Calendar event.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode | Driver dropdown shows Driver A selected. |
| 2 | Change to Driver B | |
| 3 | Update | Immediate response. |
| 4 | Check `background_tasks` | TWO tasks created: (1) `delete_calendar` for Driver A's old event, (2) `sync_calendar` for Driver B's new event. Both `status: 'pending'`. |
| 5 | Wait for completion | Driver A's calendar event removed. Driver B's calendar event created. Both tasks -> `completed`. |

---

### 3C. Remove Driver (Driver A -> None)

**Precondition:** Appointment has Driver A assigned.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode | Driver A shown. Status "assigned". |
| 2 | Change driver to "Not Assigned" | Status auto-reverts to "pending" (modal logic at line ~1877). |
| 3 | Update | Immediate response. |
| 4 | Check `background_tasks` | One task: `delete_calendar` for Driver A's old event. No `sync_calendar` (no new driver). |

---

## Scenario 4: Update with Calendar Field Changes (No Driver Change)

### Purpose

Verify that when appointment time, duration, or clinic changes (but driver stays the same), the existing Google Calendar event is updated asynchronously (not deleted and recreated).

---

### 4A. Change Appointment Date/Time

**Precondition:** Appointment has driver assigned with active calendar event.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode | Current date/time shown. |
| 2 | Change appointment time (e.g., 10:00 AM -> 2:00 PM) | Pickup time auto-recalculates. |
| 3 | Update | Immediate response. |
| 4 | Check `background_tasks` | Task: `sync_calendar` with `status: 'pending'`. This should UPDATE the existing event, not create a new one. |
| 5 | Verify calendar | Event start/end times updated. Event ID preserved (same event, not new). |

---

### 4B. Change Clinic Location

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change clinic from "Clinic A" to "Clinic B" | Transit time may auto-update from `clinic_travel_times`. |
| 2 | Update | Background task to update calendar event (new location in event). |

---

### 4C. Change Duration

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change `appointmentLength` from 120 to 90 | Drop-off time recalculates. |
| 2 | Update | Calendar event end time updated. |

---

### 4D. Change Notes Only (No Calendar Update Needed)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Only change `notes` or `driver_instructions` field | |
| 2 | Update | DB updated immediately. Depending on implementation: either no calendar task created (notes don't affect calendar) or a lightweight update task. Verify expected behavior. |

---

## Scenario 5: Support Event Specifics

### Purpose

Verify that support events have correct behavior: no SMS, no calendar color coding, event_name used in calendar title, K0000 sentinel.

---

### 5A. Create Support Event - No SMS

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a support event appointment (type: support) | Success. |
| 2 | Check `background_tasks` | NO `send_sms_notification` task created. Support events must skip SMS entirely. |
| 3 | Verify no SMS sent | No OpenPhone API call for this appointment. |

---

### 5B. Support Event - Calendar Title Uses event_name

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create support event with event_name "Vaccination Drive", assign a driver | Calendar sync task created. |
| 2 | Check driver's Google Calendar | Event title contains "Vaccination Drive" (not a client name, since K0000 is sentinel). |
| 3 | Calendar event should NOT have the standard patient-transport color | Support events use a distinct color or default color. |

---

### 5C. Support Event - Type Change Restrictions in Edit Mode

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open an existing support event in edit mode | Type selector shows "Support Event" selected. Round Trip and One Way buttons are DISABLED (`.disabled` class applied, `disabled` attribute set). |
| 2 | Attempt to click Round Trip | Button is unresponsive. Type stays as support. |
| 3 | Open a round_trip appointment in edit mode | Round Trip and One Way are enabled. Support button is DISABLED. Can switch between round_trip <-> one_way only. |

---

### 5D. Support Event - K0000 Auto-Set

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select Support type in Add mode | `appointmentClientId` hidden field auto-set to "K0000". Client dropdown hidden. |
| 2 | Switch back to Round Trip | K0000 cleared. Client dropdown reappears. Client dropdown does NOT contain K0000 in the options list. |

---

## Scenario 6: One-Way Timing and SMS

### Purpose

Verify that one-way appointments calculate timing correctly per direction and use appropriate SMS templates.

---

### 6A. To Clinic Timing

**Formula:** `pickupTime = appointmentDateTime - transitTime`, `dropOffTime = appointmentDateTime`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create one_way/to_clinic appointment: date 2026-03-10 10:00 AM, transitTime 30 min | |
| 2 | Verify timing in DB/calendar | pickupTime = 9:30 AM, dropOffTime = 10:00 AM. Calendar event spans 9:30 - 10:00. |
| 3 | Verify no return trip time | Unlike round_trip, no additional transit time added after appointment. |

---

### 6B. To Home Timing

**Formula:** `pickupTime = appointmentDateTime`, `dropOffTime = appointmentDateTime + transitTime`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create one_way/to_home appointment: date 2026-03-10 10:00 AM, transitTime 30 min | |
| 2 | Verify timing | pickupTime = 10:00 AM, dropOffTime = 10:30 AM. Calendar event spans 10:00 - 10:30. |

---

### 6C. One-Way SMS Differs from Round Trip

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create one_way appointment with SMS notification | `send_sms_notification` task created. |
| 2 | Verify SMS content | Template mentions one-way trip (e.g., "pickup only" or "drop-off only"), NOT "round trip" or "return home" language. |

---

### 6D. One-Way Validation - Direction Required

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select One Way type, do NOT select a direction | |
| 2 | Click Save | Alert: "Please select a trip direction for one-way appointments." Save blocked. |

---

## Scenario 7: Failure Scenarios

### Purpose

Verify that async failures are handled gracefully: user sees immediate success for the core save, but failures in background tasks are surfaced through the task monitor.

---

### 7A. Google Calendar API Down

**Precondition:** Simulate Calendar API failure (or use a driver with invalid/revoked calendar credentials).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create appointment with driver assigned | Immediate success response. Appointment saved to DB. |
| 2 | Background `sync_calendar` task runs | Task fails. `status: 'failed'`, `error_message` populated (e.g., "Google Calendar API error: 403 Forbidden"). |
| 3 | Check task monitor UI | TaskMonitor polling detects failed task. Toast notification appears: "Task Failed - Sync Calendar for [entity_label]". Header badge shows count "1". |
| 4 | Click toast or header badge | Slide-out panel opens. Shows failed task with: entity type "Appointment", entity label, task type "Sync Calendar", error message, timestamp ("Just now" or "X min ago"), and "View Appointment" + "Dismiss" buttons. |
| 5 | Appointment data in DB | Appointment row is intact and correct. Only the calendar event is missing. |
| 6 | Retry behavior | If `retry_count < max_retries` (default 3), task should be retried automatically. Check `retry_count` increments. |

---

### 7B. SMS Notification Fails (OpenPhone API Error)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create appointment for client without valid phone number | Core save succeeds. |
| 2 | `send_sms_notification` task fails | `status: 'failed'`, error_message describes SMS failure. |
| 3 | User notification | Toast and badge indicator appear. Task panel shows SMS failure details. |
| 4 | Appointment is fully functional | Appointment visible in table, editable, driver assigned. Only SMS is missing. |

---

### 7C. Partial Failure in Bulk Save

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Bulk save 3 appointments. One has a client with bad phone, others are fine. | All 3 saved to DB. |
| 2 | Background tasks | 2 SMS tasks complete successfully. 1 SMS task fails. |
| 3 | Task monitor | Shows 1 failed task. Other 2 appointments fully processed. |

---

### 7D. Both Calendar and SMS Fail

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Appointment with driver (bad calendar) and client (bad phone) | Core save succeeds. |
| 2 | Two background tasks fail | Both appear in task monitor. Badge shows "2". |
| 3 | Each can be dismissed independently | Dismissing one removes it; the other persists. |

---

### 7E. Network Error During Background Processing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If Railway container restarts mid-background-processing | Task stays in `processing` status (stale). |
| 2 | Stale task cleanup workflow (scheduled every 15 min) | Should detect tasks stuck in `processing` for >5 minutes and reset to `pending` for retry (or mark as `failed`). |

---

## Scenario 8: Race Conditions

### Purpose

Verify behavior when a user modifies an appointment before its background tasks from a previous action have completed.

---

### 8A. Save Appointment, Immediately Edit Before Calendar Sync

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create appointment with driver (triggers `sync_calendar` background task) | Immediate success. Calendar task `pending`. |
| 2 | Immediately open same appointment in edit mode and change time | Edit succeeds. A NEW `sync_calendar` task is created. |
| 3 | Original calendar task completes | Creates calendar event with OLD time. |
| 4 | New calendar task completes | Updates calendar event with NEW time. |
| 5 | Final state | Calendar event should reflect the latest update. Verify the implementation handles this (e.g., by using the appointment's current DB state when executing the task, not the task's creation-time data). |

**Critical verification:** Does the background task use the appointment's current DB state at execution time, or does it use snapshot data from when the task was created? If snapshot, the second update overwrites correctly. If live DB read, the first task might use stale data. Document actual behavior.

---

### 8B. Save Appointment, Immediately Delete

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create appointment with driver | Calendar sync task pending. |
| 2 | Immediately soft-delete the appointment | Delete succeeds. A `delete_calendar` task is created. |
| 3 | Original `sync_calendar` task runs | Should either: (a) check if appointment is deleted and skip, or (b) create the event, then `delete_calendar` task removes it. |
| 4 | `delete_calendar` task runs | Calendar event removed (if it was created). |
| 5 | Verify no orphaned calendar events | No events left on driver's calendar for this appointment. |

---

### 8C. Rapid Driver Reassignment (A -> B -> C)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Assign Driver A | Tasks: `sync_calendar` for A. |
| 2 | Before A's task completes, change to Driver B | Tasks: `delete_calendar` for A, `sync_calendar` for B. |
| 3 | Before B's tasks complete, change to Driver C | Tasks: `delete_calendar` for B, `sync_calendar` for C. |
| 4 | All tasks eventually complete | Final state: only Driver C has a calendar event. Drivers A and B have no events for this appointment. |

**Risk:** If delete and create tasks execute out of order, a driver might end up with an orphaned event. Verify task ordering/idempotency.

---

## Scenario 9: Task Monitor Across Roles

### Purpose

Verify that the TaskMonitor and TaskNotifications components work correctly for all roles, with proper visibility scoping.

---

### 9A. Admin Sees All Failed Tasks

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as admin | TaskMonitor initializes. |
| 2 | Trigger a failed task (from another user's action) | Admin sees the failure in their task monitor. |
| 3 | Open task panel | Shows all failed tasks across all users. Each task card shows "Created by: [username]" line (admin-only field, per `task-notifications.js` line 284). |
| 4 | Dismiss a task | Task disappears. `dismissed_at` and `dismissed_by` updated in DB. |
| 5 | Click "Dismiss All" | All failed tasks dismissed. Badge disappears. |

---

### 9B. Supervisor Sees All Failed Tasks

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as supervisor | TaskMonitor initializes with `isAdminOrSupervisor() = true`. |
| 2 | Check visibility | Same as admin: sees all failed tasks, "Created by" field shown. |

---

### 9C. Booking Agent Sees Only Own Tasks

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as booking_agent (user ID = X) | TaskMonitor initializes. |
| 2 | TaskMonitor fetches failed tasks | Query filters: `WHERE created_by = X` (not all tasks). Only tasks triggered by this user's actions appear. |
| 3 | Another user creates a failed task | Booking agent does NOT see it. Badge stays at previous count. |
| 4 | "Created by" field NOT shown in panel | `isAdminOrSupervisor()` returns false, so the created_by_name line is omitted from task cards. |

---

### 9D. Driver and Client Roles

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as driver | TaskMonitor initializes. Only sees own failed tasks (if any). Drivers typically don't create appointments, so this may always be empty. |
| 2 | Login as client | Same scoping as driver. Clients don't create appointments in the normal flow. |

---

### 9E. Task Monitor Polling vs Realtime

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If Supabase Realtime configured | TaskMonitor subscribes to `postgres_changes` on `background_tasks` table. Notifications appear instantly (no polling delay). |
| 2 | If Realtime NOT configured (typical) | Falls back to polling every 30 seconds (`config.pollingInterval`). New failures appear within 30 seconds. |
| 3 | Realtime subscription fails | Console: "[TaskMonitor] Realtime failed, falling back to polling". Polling activates automatically. |

---

### 9F. Task Indicator Placement

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check header on any page | Task indicator badge is positioned inside `.header-user` section, before the logout button. |
| 2 | If `.header-user` not found | Falls back to floating position (fixed top-right, z-index 9999). |
| 3 | Badge shows "0" when no failures | Indicator is hidden (`display: none`). |
| 4 | Badge shows count when failures exist | Indicator visible with pulsing animation. Count displayed (max "99+"). |

---

## Scenario 10: RBAC - Role-Specific Behavior

### Purpose

Verify that role permissions are correctly enforced in the appointment modal and that async task creation respects role capabilities.

---

### 10A. Booking Agent - Can Save, Cannot Assign Driver

**Precondition:** Logged in as booking_agent.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Add Appointment modal | Driver field is hidden in add mode (line 1341: `driverFieldContainer.style.display = 'none'`). |
| 2 | Save appointment | Payload has NO `driver_assigned` field. Status stays "pending". |
| 3 | Check `background_tasks` | NO `sync_calendar` task created (no driver = no calendar event needed). SMS task created if applicable. |
| 4 | Open appointment in edit mode | Driver dropdown visible but DISABLED (gray background, `el.disabled = true`, title="You do not have permission to assign drivers"). |
| 5 | Attempt to change driver | Cannot interact with disabled dropdown. |
| 6 | Edit other fields (notes, time) and save | Payload does NOT include `driver_assigned` (line 1866: only included when `canAssign && mode === 'edit'`). |

---

### 10B. Booking Agent - Cannot See Cost Fields

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open any appointment modal as booking_agent | Cost Information section (`[data-cost-field]`) is hidden (`display: none`). |
| 2 | Save appointment | Payload does NOT include cost-related fields (filtered by `filterSensitiveData` if using `secureApiRequest`). |

---

### 10C. Booking Agent - Status Field Read-Only

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode as booking_agent | Status dropdown is disabled (gray background). Cannot change status. |
| 2 | Save | Status value preserved from original (not changed by booking_agent). |

---

### 10D. Supervisor - Can Assign Driver, Calendar Task Created

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as supervisor. Open appointment in edit mode. | Driver dropdown is enabled (not disabled). |
| 2 | Assign a driver and save | Payload includes `driver_assigned`. Status auto-changes to "assigned". |
| 3 | Check `background_tasks` | `sync_calendar` task created for the assigned driver. |

---

### 10E. Supervisor - Cannot Hard Delete

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode as supervisor | "Hard Delete" button is hidden (`canHardDeleteAppointments: false`). Only "Delete" (soft delete/archive) button shown (if applicable). |

---

### 10F. Admin - Full Access

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode as admin | All fields editable. Driver dropdown enabled. Status dropdown enabled. Cost fields visible. Hard Delete button visible. Managing Agent dropdown shown (can reassign). |
| 2 | Assign driver, change status, update cost | All changes saved. Calendar task created for driver assignment. |

---

### 10G. Booking Agent - Managing Agent Read-Only

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open appointment in edit mode as booking_agent | Managing Agent shows as read-only text input (not dropdown). Shows current agent's name. |
| 2 | Supervisor/Admin opens same appointment | Managing Agent shows as dropdown (can reassign to different agent). |

---

### 10H. Driver Role - View Only

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as driver | Can access dashboard and appointment-management page only. |
| 2 | Navigate to appointments page | `enforcePageAccess()` checks `hasPageAccess('driver', 'appointments')` -> false. Alert shown, redirected to dashboard. |
| 3 | On dashboard, driver sees own appointments | View-only mode. No add/edit capabilities. |

---

### 10I. Client Role - View Only

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as client | Can access dashboard and profile only. |
| 2 | Navigate to any appointment page | Redirected to dashboard by `enforcePageAccess()`. |
| 3 | On dashboard | Sees own appointments in read-only format. |

---

## Cross-Cutting Concerns

### XSS Prevention

- [ ] All user-provided strings displayed in task notifications use `escapeHtml()` (both `appointment-modal.js` and `task-notifications.js` implement this)
- [ ] `event_name` field input is sanitized before display in calendar and task panel
- [ ] `entity_label` in background_tasks is escaped before rendering in notification panel

### Session Timeout During Background Tasks

- [ ] If user's session expires while background tasks are running, tasks complete normally (they execute server-side in n8n, independent of frontend session)
- [ ] On next login, any failed tasks from previous session appear in task monitor (tasks are associated with `created_by` user ID, not session)

### Field Name Consistency

Verify across ALL save/update paths:
- [ ] `appointmentLength` (camelCase) in frontend payload
- [ ] `appointmentDateTime` (camelCase) in frontend payload
- [ ] `transitTime` (camelCase) in frontend payload
- [ ] `appointment_type` (snake_case) in payload
- [ ] `trip_direction` (snake_case) in payload
- [ ] `event_name` (snake_case) in payload
- [ ] `driver_instructions` (snake_case) in payload
- [ ] `scheduling_notes` (snake_case) in payload

### Modal Async Pattern

- [ ] Always `await modal.open('add')` before calling `selectClient()` (prevents race condition where clients list not yet loaded)
- [ ] Modal lazy-loads data on first open (driversLoaded, clientsLoaded, clinicsLoaded flags)
- [ ] In edit mode, clients are reloaded to ensure latest address data (line 1207)

---

## Summary Matrix

| Scenario | admin | supervisor | booking_agent | driver | client |
|----------|-------|------------|---------------|--------|--------|
| 1. Single save (all types) | Full | Full | Save only (no driver) | N/A | N/A |
| 2. Bulk save | Full | Full | Save only (no driver) | N/A | N/A |
| 3. Update w/ driver change | Full | Full | Cannot change driver | N/A | N/A |
| 4. Update calendar fields | Full | Full | Can update time/clinic | N/A | N/A |
| 5. Support events | Create/edit | Create/edit | Create (no driver) | N/A | N/A |
| 6. One-way timing | Verify | Verify | Verify | N/A | N/A |
| 7. Failure scenarios | See all failures | See all failures | See own failures | See own | See own |
| 8. Race conditions | Test all | Test | N/A (no driver changes) | N/A | N/A |
| 9. Task monitor | All tasks + dismiss | All tasks + dismiss | Own tasks + dismiss | Own | Own |
| 10. RBAC enforcement | Full access | No hard delete/user mgmt | Read-only driver/status/cost | View own | View own |
