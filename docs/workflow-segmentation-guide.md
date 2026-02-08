# Workflow Segmentation Guide

## Overview

This document identifies n8n workflows that can be segmented into synchronous (immediate) and asynchronous (background) parts to improve user experience by reducing wait times.

---

## Segmentation Pattern

```
BEFORE: User waits for everything
┌──────────────────────────────────────────────────────────────┐
│ User Action → Step 1 → Step 2 → Step 3 → Step 4 → Response  │
│                        (User waits 30+ seconds)              │
└──────────────────────────────────────────────────────────────┘

AFTER: User gets immediate response
┌─────────────────────────────────────┐
│ User Action → Step 1 → Response     │  (< 2 seconds)
└──────────────────┬──────────────────┘
                   │
                   ▼ (background)
┌─────────────────────────────────────┐
│ Step 2 → Step 3 → Step 4            │
└─────────────────────────────────────┘
```

---

## Workflows to Segment

### 1. Add Client (`/add-client`)

**Current Flow:**
1. Validate client data
2. Insert client into Supabase
3. Calculate drive times from all drivers (SLOW - Google Maps API)
4. Add client to Quo/OpenPhone (SLOW - external API)
5. Return response

**Proposed Segmentation:**

| Phase | Steps | Response Time |
|-------|-------|---------------|
| **Sync** | Validate → Insert client | < 2 sec |
| **Async** | Calculate drive times | 10-30 sec |
| **Async** | Sync to Quo | 5-15 sec |

**Background Tasks to Create:**
- `calculate_drive_times` - Calculate drive times from all active drivers
- `sync_quo` - Add/update client in Quo

---

### 2. Update Client (`/update-client`)

**Current Flow:**
1. Validate changes
2. Update client in Supabase
3. If address changed: Recalculate drive times
4. If phone/name changed: Update in Quo
5. Return response

**Proposed Segmentation:**

| Phase | Steps | Response Time |
|-------|-------|---------------|
| **Sync** | Validate → Update client | < 2 sec |
| **Async** | Recalculate drive times (if address changed) | 10-30 sec |
| **Async** | Update Quo (if relevant fields changed) | 5-15 sec |

---

### 3. Add Driver (`/add-driver-with-calendar`)

**Current Flow:**
1. Validate driver data
2. Insert driver into Supabase
3. Create Google Calendar for driver
4. Calculate drive times to all clients (SLOW)
5. Return response

**Proposed Segmentation:**

| Phase | Steps | Response Time |
|-------|-------|---------------|
| **Sync** | Validate → Insert driver → Create calendar | 3-5 sec |
| **Async** | Calculate drive times to all clients | 30-60 sec |

**Background Tasks to Create:**
- `calculate_driver_drive_times` - Calculate times from new driver to all active clients

---

### 4. Save Appointment (`/save-appointment-v7`)

**Current Flow:**
1. Validate appointment data
2. Check driver availability
3. Insert appointment into Supabase
4. Create/update Google Calendar event
5. Send SMS notification to client
6. Update Quo with appointment details
7. Return response

**Proposed Segmentation:**

| Phase | Steps | Response Time |
|-------|-------|---------------|
| **Sync** | Validate → Check availability → Insert → Calendar | 3-5 sec |
| **Async** | Send SMS notification | 2-5 sec |
| **Async** | Sync appointment to Quo | 3-5 sec |

**Background Tasks to Create:**
- `send_appointment_notification` - Send SMS to client
- `sync_appointment_quo` - Update Quo with appointment details

---

### 5. Update Appointment (`/update-appointment-complete`)

**Current Flow:**
1. Validate changes
2. Update appointment in Supabase
3. Update Google Calendar event
4. If time/driver changed: Send update notification
5. Update Quo
6. Return response

**Proposed Segmentation:**

| Phase | Steps | Response Time |
|-------|-------|---------------|
| **Sync** | Validate → Update → Calendar | 2-4 sec |
| **Async** | Send update notification (if needed) | 2-5 sec |
| **Async** | Sync changes to Quo | 3-5 sec |

---

### 6. Create Invoice (`/create-invoice`)

**Current Flow:**
1. Validate invoice data
2. Calculate totals
3. Insert invoice into Supabase
4. Generate PDF
5. Send email to client (optional)
6. Return response

**Proposed Segmentation:**

| Phase | Steps | Response Time |
|-------|-------|---------------|
| **Sync** | Validate → Calculate → Insert invoice | 1-2 sec |
| **Async** | Generate PDF | 5-10 sec |
| **Async** | Send email notification | 2-5 sec |

**Background Tasks to Create:**
- `generate_invoice_pdf` - Generate and store PDF
- `send_invoice_email` - Email invoice to client

---

### 7. Delete Appointment (`/delete-appointment-with-calendar`)

**Current Flow:**
1. Soft delete in Supabase
2. Delete Google Calendar event
3. Send cancellation notification
4. Update Quo
5. Return response

**Proposed Segmentation:**

| Phase | Steps | Response Time |
|-------|-------|---------------|
| **Sync** | Soft delete → Delete calendar | 2-3 sec |
| **Async** | Send cancellation notification | 2-5 sec |
| **Async** | Update Quo | 3-5 sec |

---

## Workflows to Keep Synchronous

These workflows should remain fully synchronous:

| Workflow | Reason |
|----------|--------|
| `/user-login` | User needs immediate authentication feedback |
| `/change-password` | Security-critical, needs immediate confirmation |
| `/refresh-token` | Auth flow requires immediate response |
| `/get-*` (all read operations) | User needs data immediately |
| `/cancel-appointment` | User needs immediate confirmation |

---

## Implementation Priority

### Phase 1 (High Impact)
1. **Add Client** - Most noticeable improvement (drive times are very slow)
2. **Update Client** - Frequently used, address changes trigger long waits

### Phase 2 (Medium Impact)
3. **Add Driver** - Less frequent but very slow when it happens
4. **Save Appointment** - High volume, SMS/Quo sync adds delay

### Phase 3 (Polish)
5. **Update Appointment** - Notifications can be async
6. **Create Invoice** - PDF generation can be async
7. **Delete Appointment** - Cleanup can be async

---

## New n8n Webhook Endpoints Needed

### For Background Task Processing

| Endpoint | Purpose | Triggered By |
|----------|---------|--------------|
| `/process-drive-times` | Calculate drive times for a client | Add/Update Client |
| `/process-quo-sync` | Sync entity to Quo | Add/Update Client/Appointment |
| `/process-notification` | Send SMS/email notification | Appointment changes |
| `/process-invoice-pdf` | Generate invoice PDF | Create Invoice |
| `/process-driver-distances` | Calculate all distances for new driver | Add Driver |

### For Task Management

| Endpoint | Purpose |
|----------|---------|
| `/get-failed-tasks` | Get user's failed tasks |
| `/get-all-failed-tasks` | Get all failed tasks (admin) |
| `/get-failed-tasks-summary` | Get failed task counts |
| `/dismiss-task` | Mark task as dismissed |
| `/dismiss-all-tasks` | Dismiss all user's failed tasks |

---

## Background Workflow Template

Each background workflow should follow this pattern:

```
┌─────────────────────────┐
│ Webhook Trigger         │
│ (receives task_id,      │
│  entity_id, etc.)       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Mark Task Processing    │
│ start_background_task() │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Do The Actual Work      │
│ (API calls, calcs, etc) │
└───────────┬─────────────┘
            │
       ┌────┴────┐
       │         │
       ▼         ▼
┌──────────┐ ┌──────────┐
│ Success  │ │ Error    │
│ complete │ │ fail     │
│ _task()  │ │ _task()  │
└──────────┘ └──────────┘
```

---

## Migration Steps

For each workflow being segmented:

1. **Create background workflow** - New webhook that does the async work
2. **Modify main workflow** - Remove async steps, add task creation, trigger background workflow
3. **Test thoroughly** - Ensure main workflow returns fast, background completes reliably
4. **Add frontend integration** - Include task-monitor.js and task-notifications.js on relevant pages
5. **Monitor** - Watch for failed tasks, adjust error handling

---

## Error Handling

Each background task should capture:
- **error_message**: Human-readable error description
- **result**: On success, any relevant data (e.g., `{ drive_times_calculated: 15 }`)

Common error patterns:
- API rate limits → Include retry guidance in error message
- Timeout → Suggest manual retry
- Invalid data → Include which field/value failed
- External service down → Include service name and status
