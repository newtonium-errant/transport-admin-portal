# Session Notes — 2026-02-27 (Part 2)

## Async Background Tasks — Planning Discussion

### Context
Planning the "respond early, continue processing" pattern for n8n workflows to speed up the frontend. The workflow saves core data → creates background task records → responds to webhook immediately → continues processing slow operations (Google Maps, OpenPhone, etc.) → updates background_tasks table as things complete → flags failures for admin review.

This replaces the failed async approach (v6 test workflow) that tried calling other n8n webhooks via `this.helpers.httpRequest()` — a known n8n limitation with self-referential webhook calls.

### Reference Workflows Analyzed
- **Current production**: `Workflows/Review/CLIENT - Add New Client (8).json`
- **Failed async attempt**: `Workflows/Review/TEST - CLIENT - Add New Client v6 (1).json`

---

## Team Analysis Summary

### n8n-backend: Pattern Viability ✅

- **"Respond to Webhook" mid-workflow is a proven, documented n8n pattern.** When webhook is set to `responseMode: "responseNode"`, the response is sent when that node fires, but execution continues through remaining connected nodes.
- **Only ONE Respond to Webhook node can fire per execution** — so the topology must be a fork, not a sequence.
- **Correct topology:**
```
Create Client → Fork
  ├── Branch A (fast, ~200ms): Create task records → Format Response → Respond to Webhook
  └── Branch B (slow, 10-30s): Get Destinations → Google Maps → Aggregate → Update Travel Times → Update Task Status
```
- Both branches execute in parallel. Branch A sends the response. Branch B continues in background.
- **Railway won't kill long-running executions** after the response is sent — the HTTP layer is done, and the n8n process continues independently.
- n8n's `EXECUTIONS_TIMEOUT` env var controls execution limits (default: no timeout). Should verify this isn't set restrictively on Railway.
- **Error handling**: Use background_tasks table as the async error channel. Each step in Branch B wrapped in try/catch. Error outputs connect to a "Mark Task Failed" node.
- **Recommended frontend UX**: Optimistic (Option a) — show "Client created!" and let travel times calculate lazily. They're only needed when booking appointments, which is a separate action.
- **Key risk**: Stuck tasks if container restarts mid-execution. Mitigation: scheduled "stale task cleanup" workflow every 15 minutes.

### supabase-db: Schema Design (v2 Proposal)

**Proposed schema** — cleaned up from migration 17:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | `gen_random_uuid()` |
| `entity_type` | TEXT NOT NULL | 'client', 'appointment', 'driver' (CHECK constraint) |
| `entity_id` | TEXT NOT NULL | knumber, appointment UUID, driver ID |
| `entity_label` | TEXT | Human-readable: "John Smith (K0001234)" |
| `task_type` | TEXT NOT NULL | See task type reference below |
| `status` | TEXT NOT NULL DEFAULT 'pending' | CHECK: pending/processing/completed/failed |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() |
| `started_at` | TIMESTAMPTZ | When processing began |
| `completed_at` | TIMESTAMPTZ | When completed or failed |
| `created_by` | INTEGER | users.id who triggered it |
| `result` | JSONB | Success payload |
| `error_message` | TEXT | Human-readable error on failure |
| `retry_count` | INTEGER DEFAULT 0 | Number of retries |
| `max_retries` | INTEGER DEFAULT 3 | Per-task configurable limit |
| `dismissed_at` | TIMESTAMPTZ | When admin dismissed a failure |
| `dismissed_by` | INTEGER | users.id who dismissed |

**Key changes from migration 17:**
- **Removed all PL/pgSQL functions** — n8n Supabase nodes can only do basic CRUD (get/getAll/create/update/delete), no executeQuery, no RPC calls
- **Removed all views** — same reason
- **Removed `audit_log_id` FK** — background tasks and audit logs serve different purposes (operational reliability vs security/compliance)
- **Added `max_retries` column** — per-task configurable instead of hardcoded 3
- **Added `chk_bg_task_entity_type` CHECK constraint** — restricts to known values

**Indexes:**
- `idx_bg_tasks_pending` — partial on status='pending' for n8n polling
- `idx_bg_tasks_user_failed` — partial on status='failed' AND dismissed_at IS NULL for frontend
- `idx_bg_tasks_entity` — entity_type + entity_id for entity lookup
- `idx_bg_tasks_completed_at` — partial on completed/failed for archival
- `idx_bg_tasks_retryable` — partial for finding retryable failed tasks

**Task type reference:**
| task_type | entity_type | Triggered By |
|-----------|-------------|-------------|
| `calculate_distances` | client | Add/Update Client |
| `add_openphone_contact` | client | Add Client |
| `sync_calendar` | appointment | Save/Update Appointment |
| `delete_calendar` | appointment | Delete/Cancel Appointment |
| `calculate_appointment_distance` | appointment | Save Appointment (with driver) |
| `send_sms_notification` | appointment | Save/Update/Cancel Appointment |
| `create_driver_calendar` | driver | Add Driver |
| `calculate_driver_distances` | driver | Add/Update Driver (address change) |
| `recalculate_clinic_preferences` | driver | Update Driver Home Address |

**Audit logs vs background tasks — keep separate:**
- audit_logs = security/compliance trail (who did what)
- background_tasks = operational reliability (did the async work complete)

**Data retention:**
- Active table: tasks stay 7 days after completion
- Archive table: receives moved tasks, keeps 90 days
- Alternative (given low volume ~50-100 tasks/day): skip archive, just delete completed tasks after 30 days

### frontend: Impact Assessment — Minimal ✅

- **Total frontend changes: ~5 lines** — just update 2-3 toast messages
- **Every place that reads `clinic_travel_times` already has null/undefined guards** with graceful fallbacks
- **No pages will break** — travel times are only consumed in appointment modal when selecting client + clinic (separate action from client creation)
- **Existing TaskMonitor/TaskNotifications system already handles failure display** — polling every 30s, toast notifications, slide-out panel, admin dashboard widget
- **Recommendation: Option (a) — don't poll for success.** Fire-and-forget from the user's perspective. Only show failures via existing system.
- **Pages that consume clinic_travel_times:**
  - `appointment-modal.js` (transit time auto-populate) — has fallback, shows 0/blank
  - `appointment-modal.js` (pickup address determination) — defaults to primary address
  - `appointments-bulk-add.html` (transit time per appointment) — skips auto-fill
  - `client-modal.js` (success message) — already conditional
  - `clients.html` — does NOT display travel times anywhere

### testing-qa: Risk Assessment & Test Plan

**Critical gap identified: stale task detection is mandatory.**
- If Railway restarts mid-processing or a webhook is dropped, tasks get stuck in `pending` or `processing` forever
- **Required**: Scheduled n8n workflow (every 15 minutes) that marks tasks as `failed` if stuck for >10 minutes

**Key test scenarios:**
1. Status transitions: pending → processing → completed/failed
2. Race condition: create client → immediately create appointment (transit time blank, user enters manually)
3. Failure handling: task fails → TaskMonitor picks up → toast notification → admin can dismiss
4. Stale tasks: Railway restart mid-processing → tasks stuck → stale detector catches them
5. Rapid creation: 5 clients in 30 seconds → all 5 tasks process independently
6. API outage: Google Maps down → all tasks fail → need bulk retry mechanism

**RBAC:**
- admin/supervisor: see ALL tasks, can dismiss any
- booking_agent: see ONLY their own tasks
- driver/client: should NOT see background task notifications (skip TaskMonitor init)

**Regression risks:**
- HIGH: Appointment modal transit time auto-population (blank for a few seconds after client creation)
- HIGH: Pickup address determination defaults to primary when travel times unavailable
- MEDIUM: DataCache staleness (5-min TTL means cached client data won't include travel times until refresh)
- LOW: Audit logging, Google Calendar sync (unaffected)

---

## Decisions Made (2026-02-28)

1. **Archive table — YES.** Keep archive table. Never delete records. Completed/failed tasks move to archive after 7 days, archive kept permanently.

2. **PL/pgSQL functions — SKIP.** Table + indexes only in migration 26. No functions, no views. Can add later if needed.

3. **Migration number — 26.** (25 is taken by primary_clinic_id.)

4. **Retry mechanism — Auto-retry with manual override.** A scheduled n8n workflow auto-retries failed tasks where `retry_count < max_retries`. However, if an admin sees a failure, investigates, and fixes it manually, they can **dismiss** the task (`dismissed_at` set) which prevents auto-retry from picking it up again. Auto-retry query must check `dismissed_at IS NULL` before retrying. This prevents the auto process from retrying a task the admin has already resolved manually.

5. **"Travel times calculating" hint — YES, add it.** Show a subtle message in the appointment modal when `clinic_travel_times` is null for the selected client: "Travel times are still being calculated. Transit time may need to be entered manually."

---

## Also Completed This Session

### Migrations Run
- **Migration 19** (appointment types) — run on both branches (production + staging)
- **Migration 25** (primary_clinic_id on clients) — run on both branches

### Files Created
- `database/sql/25_add_client_primary_clinic.sql` — primary_clinic_id column + FK to destinations

### Docs Updated
- `database/docs/PENDING_MIGRATIONS.md` — both pending items moved to Completed section (primary_clinic_id + calendar_ical_url)

### Backlog Decisions
- Migration 14: Skip (superseded by migration 23)
- Migration 17 (background_tasks): Deferred — needs more planning (this discussion)
- Driver user accounts: Deferred until more updates/testing on production branch
