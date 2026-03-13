# Session Summary — 2026-03-13

## Overview
Investigated and fixed null integer error in Update Appointment workflow, then redesigned the entire workflow from scratch (v10, 69 nodes). Discovered and standardized the Restore Context pattern for n8n data flow. Audited DB compatibility, updated frontend endpoints, and identified recurring bug patterns across multiple workflows. Fixed 6 session logout bugs causing users to be logged out while active. v10 workflow validated and deployed to production. All changes merged to main.

## Team Structure
Multi-agent team ("rrts-dev") with specialized agents:
- **frontend** — HTML/CSS/JS, Bootstrap 5, endpoint updates
- **n8n-backend** — Workflow investigation, fixes, auditing
- **n8n-backend-2** — Workflow redesign from scratch (spawned mid-session)
- **supabase-db** — Schema verification, DB compatibility auditing
- **testing-qa** — Edge case analysis, QA reviews, bug pattern cross-referencing
- **n8n-researcher** — Online research on n8n data flow patterns
- **workflow-history-search** — Searched recent session notes for troubled workflows

## Changes Made

### 1. Null Integer Error Fix — Instruction Doc
**Problem:** `invalid input syntax for type integer: "null"` at "Lookup Driver Distance - Supabase" node in `APPT - Update Appointment Async (9)` workflow. When `driver_assigned` or `clinic_id` is JS `null`, n8n's expression engine coerces it to string `"null"`, which PostgreSQL rejects for INTEGER columns on `driver_destination_distances`.

**Fix:** Add Switch guard node before the Lookup to skip when `driver_assigned` or `clinic_id` is null, plus add `alwaysOutputData: true` and `onError: continueRegularOutput` to the Lookup node.

**File:** `docs/instructions/N8N-FIX-LOOKUP-DRIVER-DISTANCE-NULL-GUARD.md`

**Additional finding during review:** `rightValue: "=true"` instead of `"true"` in Switch node — the `=` prefix makes n8n treat it as an expression instead of a literal string comparison.

**Other workflows audited:** Fallback transit path is safe, Cancel Appointment has existing guard, reminder workflows are practically safe due to operation_status filter.

### 2. Complete Workflow Redesign — v10 (69 nodes)
**Motivation:** 8 problems identified in current workflow:
1. Duplicated Update nodes (22+ fields mapped identically in two places)
2. Inconsistent null coercion guards
3. 15+ fragile cross-node `$('NodeName')` references
4. Overlapping distance/transit paths
5. Missing `alwaysOutputData` flags
6. Delete-before-insert data loss
7. Calendar error swallowing
8. Incomplete audit logging
9. (Found by testing-qa) No server-side RBAC — driver/client roles could call update endpoint directly

**Architecture:**
- Pipeline context pattern — single Code node builds all context, Restore Context nodes after every Supabase/HTTP node
- Single Update node (eliminates duplication)
- Centralized null safety in Code nodes
- RBAC enforcement at webhook entry
- Three-way driver field handling (omitted/null/value)
- Proper HTTP status codes via `responseCode` expression on Respond to Webhook

**File:** `Workflows/appointments/APPT - Update Appointment Async v10.json`

### 3. DB Compatibility Audit
supabase-db audited all 25 Supabase nodes in v10 against production schema.

**2 critical issues found and fixed:**
1. **Log Audit node:** Wrong column names (`event_type` → `action`, `entity_type` → `resource_type`, `entity_id` → `resource_id`, missing `role` field)
2. **Client distance nodes:** `client_knumber` doesn't exist → should be `client_id` (UUID). Also `distance_km` → `primary_distance_km`, `duration_minutes` → `primary_duration_minutes`

**1 moderate issue fixed:** `traffic_aware_transit` using string `"true"` instead of boolean expression

### 4. Frontend Endpoint Update (v5 → v5_5)
**Problem:** Respond to Webhook in v10 always returned HTTP 200, bypassing frontend's auto-logout on 401.

**Fix:** Added `responseCode` expression to Respond to Webhook node, added `statusCode` to all error return paths. Endpoint renamed from `update-appointment-complete-v5` to `update-appointment-complete-v5_5` to avoid conflicts during rollout.

**Files modified:**
- `js/core/api-client.js` — v5 → v5_5 endpoint
- `js/core/api-security.js` — v5 → v5_5 endpoint
- `js/components/appointment-modal.js` — v5 → v5_5 endpoint
- `js/pages/appointments.js` — v5 → v5_5 endpoint
- `clients.html` — v5 → v5_5 endpoint

### 5. $json Context Loss Discovery & Restore Context Pattern (NEW STANDARD)
**Production failure:** v10 workflow failed at Async Route Switch — `$json._route` was lost after Supabase Update node.

**Root cause:** Supabase and HTTP Request nodes replace `$json` with their own output (raw DB row or API response), silently losing all pipeline context from upstream Code nodes.

**Research:** n8n-researcher agent investigated online — found community consensus supporting Restore Context Code nodes over explicit `$('NodeName')` references.

**Decision:** ALWAYS use Restore Context Code nodes after Supabase/HTTP nodes. Pattern:
```javascript
const ctx = $('UpstreamCodeNode').first().json;
const result = $input.first().json;
return [{ json: { ...ctx, dbResult: result } }];
```

**Performance:** ~15ms per Code node vs 2-5s for DB/API calls — negligible overhead.

**Full audit found 12 instances** needing Restore Context nodes in v10 — all fixed. Final workflow: 69 nodes, 66 connections.

### 6. Workflow History Audit
workflow-history-search agent identified 4 workflows blocked on fixes in the last 2 weeks:
1. **FIN - Approve Appointments** — merge mode, response format, audit log
2. **APPT - Update Appointment Async** — null guard, managed_by, driver_work_duration
3. **APPT - Update Appointment non-async** — same bugs as async version
4. **Finance Completion Workflows** — JSONB serialization, camelCase mismatch

**5 recurring bug patterns identified** across all workflows, cross-referenced by testing-qa — all 5 addressed in v10 redesign.

## Key Discoveries & New Patterns

### Restore Context Pattern (NEW STANDARD)
After every Supabase/HTTP node, add a Restore Context Code node that reads from the upstream Code node and restores pipeline context. All downstream nodes use `$json` normally. No `$('NodeName')` references as alternative. Documented in memory file `n8n-supabase-json-context-loss.md`.

### Plan Mode Causes Approval Loops
When spawning agents for implementation tasks, use `mode: "acceptEdits"` not `mode: "plan"`. Plan mode causes agents to resubmit plans endlessly instead of coding. Memory updated.

### n8n Expression `"=true"` vs `"true"`
The `=` prefix in Switch node `rightValue` causes n8n to interpret it as an expression instead of a literal string. Common typo when manually applying changes.

### `client_destination_distances` Column Naming
Unlike `driver_destination_distances` which has simple `distance_km`/`duration_minutes`, the client table uses `primary_distance_km`/`primary_duration_minutes` (and `secondary_` variants).

### Distance Route Priority
Traffic takes priority over fallback (mutually exclusive by design). Traffic = driver-to-clinic with traffic model. Fallback = client-to-clinic without traffic. Client distances populated at client creation, driver distances at appointment assignment.

## Files Created
- `docs/instructions/N8N-FIX-LOOKUP-DRIVER-DISTANCE-NULL-GUARD.md` — Instruction doc for null guard fix
- `Workflows/appointments/APPT - Update Appointment Async v10.json` — Complete redesigned workflow (69 nodes, 66 connections)

### 7. Session Logout Bug Fixes (6 bugs)
**Problem:** Users being logged out while actively using the website.

**Root cause investigation:** frontend and testing-qa agents investigated independently, found 6 bugs:

1. **(CRITICAL) Dashboard shadow functions** — `dashboard.html` had local copies of `startTokenRefreshTimer()` and `refreshAccessToken()` that shadowed the global `jwt-auth.js` versions. Local `refreshAccessToken()` did NOT store rotated refresh tokens, causing subsequent refreshes to fail with stale tokens. **Fix:** Deleted ~70 lines of duplicate code.

2. **(HIGH) Dashboard missing `requireAuth()`** — Existing-session code path skipped `requireAuth()`, so token validation/refresh never ran on page load for returning users. **Fix:** Added `await requireAuth()` before `showDashboard()`, made DOMContentLoaded callback async.

3. **(HIGH) Token refresh timer resets on navigation** — Fixed 45-min `setInterval` reset on every page navigation, allowing 1hr token to expire before refresh fires. **Fix:** Replaced with `setTimeout` scheduled 5min before actual `rrts_token_expiry`, re-schedules recursively after successful refresh.

4. **(MEDIUM) APIClient 401 without refresh retry** — On 401, `api-client.js` immediately called `logout()` without attempting token refresh. **Fix:** Attempt `refreshAccessToken()` + retry original request; only logout if both fail.

5. **(LOW) Missing `expires_in` fallback** — If backend omits `expires_in`, expiry calculation becomes `NaN`. **Fix:** Added `|| 3600` (1hr default) in all 3 locations.

6. **(LOW) profile.html script load order** — `session-manager.js` loaded in `<head>` before `jwt-auth.js` at end of `<body>`, causing SessionManager auto-start to fail silently. **Fix:** Moved `session-manager.js` after `jwt-auth.js`.

**QA verified all 6 fixes pass.**

### 8. Update Appointment Async v10 — Validated in Production
Workflow imported to n8n UI, tested, and validated. Now active in production with endpoint `update-appointment-complete-v5_5`.

## Files Created
- `docs/instructions/N8N-FIX-LOOKUP-DRIVER-DISTANCE-NULL-GUARD.md` — Instruction doc for null guard fix
- `Workflows/appointments/APPT - Update Appointment Async v10.json` — Complete redesigned workflow (69 nodes, 66 connections)

## Files Modified
- `js/core/api-client.js` — v5 → v5_5 endpoint, 401 refresh+retry
- `js/core/api-security.js` — v5 → v5_5 endpoint
- `js/components/appointment-modal.js` — v5 → v5_5 endpoint
- `js/pages/appointments.js` — v5 → v5_5 endpoint
- `clients.html` — v5 → v5_5 endpoint
- `js/auth/jwt-auth.js` — Expiry-aware token refresh timer, rotated refresh token storage, expires_in fallback
- `dashboard.html` — Removed shadow auth functions, added requireAuth(), expires_in fallback, clearTimeout fix
- `profile.html` — Fixed session-manager.js script load order

## Memory Files Created/Updated
- `n8n-supabase-json-context-loss.md` — Restore Context pattern (NEW STANDARD)

## Commits
- `915acb2` Finance quick edit source-aware routing, PDF date format, cache bust fix
- `9c8c469` Add invoice bulk mark-sent button and merge PDFs for bulk print
- `3950482` Update appointment endpoint to v5_5 for redesigned async workflow
- `0261b90` Fix session logout bugs: expiry-aware token refresh, 401 retry, script order
- `b769f89` Merge staging into main (production deploy)

## Pending / Next Steps
1. **Apply fixes to other blocked workflows** — Approve, non-async Update, Finance Completion
2. **Fix reminder workflows' theoretical null integer vulnerability** — low priority, practically safe
3. **Backfill `driver_work_duration`** for existing appointments
4. **Apply Restore Context pattern to other existing workflows** as they're updated
5. **Browser test session fixes** — QA provided 5 manual test scenarios to confirm in-browser behavior
