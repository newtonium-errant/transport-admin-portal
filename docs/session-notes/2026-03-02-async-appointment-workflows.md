# Session Notes: 2026-03-02 (Part 3) — Async Appointment Workflows

## Summary

Built async versions of both Add Appointment and Update Appointment workflows, added traffic-aware transit time checkbox feature, and created migration 28. All work incorporates the appointment types system (round_trip, one_way, support) from the 2026-02-24 session.

---

## Completed Work

### 1. Migration 28 — Traffic-Aware Transit Column (APPLIED)
**File:** `database/sql/28_add_traffic_aware_transit.sql`
- `traffic_aware_transit BOOLEAN NOT NULL DEFAULT false` on appointments table
- Flags appointments that used real-time Google Maps traffic calculation
- **Already run on both production and testing database branches**

### 2. Traffic-Aware Transit Checkbox (Frontend)
**File:** `js/components/appointment-modal.js` (v3.1.0 → v3.2.0)
- Checkbox "Calculate traffic-aware transit time" inside `#transitTimeRow`
- Hidden for support appointment type (no transit for support events)
- Visible in both add and edit modes
- Payload field: `calculate_traffic_transit: true/false`
- When checked, shows "Traffic override" badge (yellow) instead of "Auto-filled" (blue)
- Pre-checks in edit mode when `appointment.traffic_aware_transit === true`
- Disabled for archived/cancelled appointments

### 3. Add Appointment Async Workflow (NEW)
**Files:**
- `Workflows/appointments/APPT - Add Appointment Async.json` (27 nodes, importable)
- `docs/workflows/N8N-APPT-ADD-ASYNC-INSTRUCTIONS.md` (instruction doc)

**Architecture:**
- **Sync path:** Webhook `/save-appointment-v7` → JWT → Validate (type-aware) → Calculate Times (type-aware) → Combine Notes → Insert → Check Traffic → Respond to Webhook
- **Async branch (only when `calculate_traffic_transit: true` AND type !== support):**
  - Google Maps Distance Matrix API with `departure_time` + `traffic_model=pessimistic`
  - P75 formula: `duration + (duration_in_traffic - duration) * 0.75`
  - `Math.ceil` to nearest 5 min, minimum 5 min floor
  - Updates appointment: transittime, pickuptime, dropOffTime, driver_total_distance, traffic_aware_transit=true
  - one_way to_home reverses origin/destination
- **No calendar sync** (driver never assigned at creation)
- **No SMS** (handled by reminder workflows)
- Handles single and bulk appointments (array format)

### 4. Update Appointment Async Workflow (NEW)
**Files:**
- `Workflows/appointments/APPT - Update Appointment Async.json` (41 nodes, importable)
- `docs/workflows/N8N-APPT-UPDATE-ASYNC-INSTRUCTIONS.md` (instruction doc)

**Architecture:**
- **Sync path:** Webhook `/update-appointment-complete` → JWT → Validate (type-aware) → Calculate Times (type-aware) → Get Current → Compare Changes → Check Delete → Update DB → Decide Async → Create Task or Skip → Respond to Webhook
- **One sequential async branch (3 conditional steps):**
  1. Traffic-aware transit calc (if checkbox checked AND not support) — same P75 formula as Add workflow
  2. Delete old calendar event (if driver changed or calendar fields changed)
  3. Sync new calendar event (if driver assigned and calendar fields changed) — re-fetches appointment to get final times from step 1
- **No SMS** (handled by reminder workflows)
- Single `background_task` row per update, task_type: `appointment_async_ops`
- JSONB result tracks per-step status: `{"traffic_calc": "completed/skipped/failed", "calendar_delete": "...", "calendar_sync": "..."}`
- Calendar titles/colors per type: round_trip=Sage(2), one_way=Tangerine(6), support=Grape(3)

### 5. Add Client Workflow Fix (Applied in n8n UI)
- **Branch C: Mark Quo Task - Code** v2.0.0 — now extracts `openphone_contact_id` from API response
- **Branch C: Save Contact ID - Supabase** — new node saves `openphone_contact_id`, `openphone_sync_status`, `openphone_sync_date` back to clients table
- Applied directly in n8n UI (no file changes)

---

## QA Review Findings (All Resolved)

### Add Appointment Async
- `traffic_aware_transit` column not set to `true` after traffic calc → **Fixed** (added to Update Appointment Times node)
- P75 rounding used `Math.round` instead of `Math.ceil` → **Fixed** (always rounds up for safer estimates)

### Update Appointment Async (6 bugs found and fixed)
1. **(CRITICAL)** Field name mismatch: backend read `traffic_aware_transit` instead of `calculate_traffic_transit` → **Fixed**
2. **(MEDIUM)** P75 formula used raw pessimistic instead of blend → **Fixed** (now matches Add workflow)
3. **(MEDIUM)** Async branch triggered on error/JWT failure paths → **Fixed** (restructured fork point)
4. **(LOW)** `getAll` + limit 1 instead of `get` on 2 nodes → **Fixed**
5. **(LOW)** Mark Task Complete didn't save stepResults JSONB → **Fixed** (added Build Task Result node)
6. **(LOW)** Orphan event path documented but not implemented → **Fixed** (removed from docs)

---

## Pending / Next Steps

### Must Do Before Deploy
1. **Import Add Appointment Async workflow** into n8n from `Workflows/appointments/APPT - Add Appointment Async.json`
   - Set Supabase credential on all 5 Supabase nodes
   - Test with single appointment, bulk appointments, and traffic checkbox
   - Deactivate old Add Appointment workflow after validation

2. **Import Update Appointment Async workflow** into n8n from `Workflows/appointments/APPT - Update Appointment Async.json`
   - Set Supabase credential on all 14 Supabase nodes
   - Set Google Calendar OAuth2 credential on calendar HTTP nodes
   - Test: update with/without traffic checkbox, driver change (calendar delete+sync), type changes
   - Deactivate old Update Appointment workflow after validation

3. **Wire frontend to async responses** — success toasts should show background task names from `backgroundTasks` map in response (not yet implemented — currently just shows generic success)

### Future Work
- Apply appointment types n8n workflow changes to other appointment workflows (delete, cancel, soft-delete) per `docs/instructions/N8N-APPOINTMENT-TYPES-INSTRUCTIONS.md`
- Frontend appointment type indicators on all pages (already in appointment-modal.js, needs list views)
- Commit uncommitted changes from previous sessions (clients.html fast-add, client-modal.js, index.html)

---

## Files in This Session

### New Files
| File | Purpose |
|------|---------|
| `database/sql/28_add_traffic_aware_transit.sql` | Migration 28 (applied both branches) |
| `Workflows/appointments/APPT - Add Appointment Async.json` | Importable workflow (27 nodes) |
| `Workflows/appointments/APPT - Update Appointment Async.json` | Importable workflow (41 nodes) |
| `docs/workflows/N8N-APPT-ADD-ASYNC-INSTRUCTIONS.md` | Instruction doc for Add Appointment |
| `docs/workflows/N8N-APPT-UPDATE-ASYNC-INSTRUCTIONS.md` | Instruction doc for Update Appointment |

### Modified Files
| File | Change |
|------|--------|
| `js/components/appointment-modal.js` | v3.2.0: traffic-aware checkbox |

---

## Key Design Decisions

### Traffic-Aware Transit Time
- **Opt-in via checkbox** — not all appointments need real-time traffic calculation
- **P75 formula** — blends no-traffic and pessimistic estimates: `noTraffic + (pessimistic - noTraffic) * 0.75`
- **Rounds UP to nearest 5 min** with minimum 5 min floor — conservative for driver scheduling
- **Uses `departure_time`** not `arrival_time` (Google Maps doesn't support arrival_time for driving mode)
- **Support type always skipped** — no transit for support/event appointments

### Single Background Task Per Update
- One `background_task` row tracks all 3 async steps (traffic, calendar delete, calendar sync)
- JSONB `result` column records per-step outcomes
- Simpler than 3 separate tasks for strictly sequential operations
- Task monitor shows one entry per update with detailed breakdown

### Async Fork Pattern
- `Format Async Response` node forks to BOTH `Respond to Webhook` AND `Prepare Async Context`
- Error/simple paths connect ONLY to `Respond to Webhook`
- Prevents async branch from running on failed requests

### No SMS on Appointment Workflows
- SMS notifications handled by separate scheduled reminder workflows
- Keeps appointment add/update workflows focused on data + calendar
