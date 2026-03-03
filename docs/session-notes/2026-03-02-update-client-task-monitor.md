# Session Notes: 2026-03-02 (Part 2) — Update Client Async & Task Monitor

## Summary

Built and deployed the Update Client Async workflow, completed the task monitor system, and fixed dashboard appointment counting. Merged all work from `wip` → `staging` → `main`.

---

## Completed Work

### 1. Task Monitor System — Fully Wired and Working
**Files:** `js/core/task-monitor.js`, `js/components/task-notifications.js`, 9 HTML pages

- Fixed endpoint: `/get-all-failed-tasks` → `/get-failed-tasks` (single endpoint for all roles)
- Fixed dismiss-all: `/dismiss-all-tasks` → `/dismiss-task` with `{ dismiss_all: true }` body
- Added 6 task type labels: calculate_distances, calculate_travel_times, add_openphone_contact, send_test_sms, send_onboarding_email, complete_client_profile
- Fixed header indicator placement: moved from `<nav>` (destroyed by navigation.js) to `.header-user` section
- Fixed dashboard.html inline fetch to use correct endpoint

**UI components:** Header badge (warning triangle with count), slide-out panel with dismiss/refresh, toast notifications on new failures.

### 2. Update Client Async Workflow (DEPLOYED)
**Workflow:** `CLIENT - Update Client Async` — 62 nodes, webhook POST `/update-client`

**Features:**
- JWT auth (dynamic secret from app_config)
- Change detection: compares incoming data vs existing client to detect address/phone/name changes
- Conditional background tasks — only creates tasks for what actually changed
- Branch A: Recalculate distances (client-destination + driver-client) with delete-before-insert pattern
- Branch B: Recalculate travel times (clinic_travel_times JSONB, +5min buffer, round to 5min)
- Branch C: OpenPhone contact update/create using stored `openphone_contact_id` (PATCH existing or POST new)
- Saves `openphone_contact_id`, `openphone_sync_status`, `openphone_sync_date` back to clients table
- K number cascade: updates appointments, invoices, background_tasks when K number changes (T-prefix → real)
- Profile completion: auto-detects when all required fields filled, sets `profile_status = 'complete'`
- Audit logging (non-blocking)
- Immediate webhook response with backgroundTasks map, async branches run after

**Issues fixed during testing:**
- Branch C: Removed non-existent `/v1/contacts/search` endpoint — OpenPhone has no search-by-phone API. Used stored `openphone_contact_id` from clients table instead
- Cascade Needed Switch: Fixed `{{ .cascadeNeeded }}` → `{{ $json.cascadeNeeded }}` (missing `$json` prefix)

### 3. Frontend Update Client Endpoint
**Files:** `js/components/client-modal.js` (v2.3.0), `clients.html`

- Switched endpoint from `/update-client-destinations` to `/update-client`
- Success handler reads `backgroundTasks` map and shows task names in toast
- Handles `profileCompleted` flag — shows additional toast when fast-add profile becomes complete
- `onSave` callback in clients.html reloads client list to reflect changes

### 4. Dashboard Cancelled Appointment Fix
**File:** `dashboard.html`

- Added `isExcludedStatus()` helper to check for cancelled/no_show status
- Applied filter to all 4 appointment counting sections: today, this week, next week, reminders
- Cancelled and no_show appointments no longer counted in metrics or displayed in today's list

### 5. Merged to Production
- `wip` → `staging` (resolved index.html conflict, took wip version with redesigned landing page)
- `staging` → `main` (clean merge, auto-deploys frontend)
- Commit: `c916d92`

---

## Database Notes

- **No new migrations required** for Update Client workflow
- Existing `openphone_contact_id`, `openphone_sync_status`, `openphone_sync_date` columns on clients table are now actively used
- `background_tasks.task_type` is unconstrained TEXT — new types used freely without schema changes

## Key Learnings

- **OpenPhone API has no search-by-phone endpoint** — must store and use contact IDs
- **CORS errors from n8n usually mean wrong endpoint** — non-existent webhooks return no CORS headers
- **Navigation.js clears nav innerHTML** — don't insert elements into `<nav id="mainNav">`, use `.header-user` instead
- **n8n Switch expressions need `$json.` prefix** — `{{ .field }}` causes "invalid syntax"
- **Agent `mode: "plan"` causes approval loops** — use `mode: "acceptEdits"` for implementation tasks

## Pending

- **Link driver users** — connect driver records to user accounts
- **Google Maps API key** in app_config table
- **Login workflow v6** deployment confirmation
- **Add Client workflow**: should save `openphone_contact_id` after creating contact (currently doesn't)
