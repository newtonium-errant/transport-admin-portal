# Async Workflow Implementation - Agent Instructions

## Context

We've designed an async workflow system to improve user experience by reducing wait times. Instead of users waiting 30+ seconds for workflows to complete, they get immediate responses while background tasks handle slow operations (drive time calculations, Quo API sync, notifications, etc.).

**Branch:** `claude/async-tasks-Sr2aC` (based on `Testing`)

---

## What's Already Built

### 1. Database Schema (`sql/background_tasks_schema.sql`)
- `background_tasks` table - tracks async tasks
- `background_tasks_archive` table - stores tasks older than 7 days
- Helper functions: `create_background_task()`, `start_background_task()`, `complete_background_task()`, `fail_background_task()`, `dismiss_background_task()`, `dismiss_all_failed_tasks()`, `archive_old_tasks()`
- Views: `user_failed_tasks`, `all_failed_tasks`, `task_status_summary`, `failed_tasks_summary`
- RLS policies for user/admin access
- Realtime enabled for the table

### 2. Frontend Components (`js/`)
- `js/core/task-monitor.js` - Monitors for failed tasks via Supabase Realtime or polling
- `js/components/task-notifications.js` - Toast notifications, header indicator badge, slide-out panel
- `js/components/failed-tasks-widget.js` - Dashboard widget for supervisors/admins

### 3. Documentation (`docs/`)
- `docs/n8n-archive-cleanup-workflow.md` - How to set up daily archive job
- `docs/workflow-segmentation-guide.md` - Which workflows to segment and how

---

## What Needs to Be Done

### Step 1: Apply Database Schema

Run `sql/background_tasks_schema.sql` in Supabase SQL Editor. This creates all tables, functions, views, and policies.

**Verify by running:**
```sql
SELECT * FROM background_tasks LIMIT 1;
SELECT create_background_task('test', gen_random_uuid(), 'Test', 'test_task', NULL);
```

---

### Step 2: Create n8n Webhook Endpoints for Background Tasks

Create these new n8n webhooks:

#### `/process-drive-times`
**Trigger:** HTTP Webhook
**Input:** `{ task_id, client_id }`
**Steps:**
1. Call `start_background_task(task_id)`
2. Get client address from Supabase
3. Get all active drivers with home addresses
4. For each driver: Call Google Maps Distance Matrix API
5. Store results in `client_drive_times` table (or however you currently store them)
6. On success: Call `complete_background_task(task_id, result_json)`
7. On error: Call `fail_background_task(task_id, error_message)`

#### `/process-quo-sync`
**Trigger:** HTTP Webhook
**Input:** `{ task_id, entity_type, entity_id }`
**Steps:**
1. Call `start_background_task(task_id)`
2. Get entity data from Supabase (client or appointment)
3. Call Quo API to create/update contact
4. On success: Call `complete_background_task(task_id, result_json)`
5. On error: Call `fail_background_task(task_id, error_message)`

#### `/get-failed-tasks`
**Trigger:** HTTP Webhook (authenticated)
**Steps:**
1. Get user ID from JWT
2. Query `user_failed_tasks` view filtered by `created_by = user_id`
3. Return tasks array

#### `/get-all-failed-tasks`
**Trigger:** HTTP Webhook (authenticated, admin only)
**Steps:**
1. Verify user is admin/supervisor
2. Query `all_failed_tasks` view
3. Return tasks array

#### `/get-failed-tasks-summary`
**Trigger:** HTTP Webhook (authenticated, admin only)
**Steps:**
1. Query `failed_tasks_summary` view
2. Return summary object

#### `/dismiss-task`
**Trigger:** HTTP Webhook (authenticated)
**Input:** `{ task_id }`
**Steps:**
1. Get user ID from JWT
2. Call `dismiss_background_task(task_id, user_id)`
3. Return success

#### `/dismiss-all-tasks`
**Trigger:** HTTP Webhook (authenticated)
**Steps:**
1. Get user ID from JWT
2. Call `dismiss_all_failed_tasks(user_id)`
3. Return count dismissed

---

### Step 3: Modify Existing `/add-client` Workflow

**Current flow (slow):**
1. Validate → Insert client → Calculate drive times → Add to Quo → Return

**New flow (fast):**
1. Validate client data
2. Insert client into Supabase → get `client_id`
3. Create background tasks:
```sql
SELECT create_background_task('client', client_id, 'Client Name', 'calculate_drive_times', user_id);
SELECT create_background_task('client', client_id, 'Client Name', 'sync_quo', user_id);
```
4. Trigger background workflows (fire and forget):
```
HTTP Request to /process-drive-times { task_id, client_id } - Don't wait for response
HTTP Request to /process-quo-sync { task_id, entity_type: 'client', entity_id: client_id } - Don't wait
```
5. Return immediately: `{ success: true, client_id, message: "Client saved. Drive times and Quo sync processing in background." }`

**Key n8n setting:** When calling background webhooks, set "Continue On Fail" = true and don't wait for response.

---

### Step 4: Add Frontend Scripts to Pages

Add these scripts to pages that need task notifications (dashboard, client management, etc.):

```html
<!-- Before closing </body> tag -->
<script src="js/core/api-client.js"></script>
<script src="js/core/task-monitor.js"></script>
<script src="js/components/task-notifications.js"></script>

<!-- For dashboard only (admin/supervisor widget) -->
<script src="js/components/failed-tasks-widget.js"></script>
```

The components auto-initialize on page load. No additional code needed.

**Optional Supabase Realtime (faster notifications):**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
    // Initialize with Supabase for realtime (otherwise falls back to polling)
    TaskMonitor.init({
        supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
        supabaseAnonKey: 'YOUR_ANON_KEY'
    });
</script>
```

---

### Step 5: Set Up Archive Cleanup Workflow

Create n8n workflow (see `docs/n8n-archive-cleanup-workflow.md`):
1. Schedule Trigger: Daily at 3 AM
2. Supabase node: `SELECT archive_old_tasks() as archived_count;`
3. Optional: Slack notification with count

---

### Step 6: Test the System

1. **Add a test client** - Should return quickly, check `background_tasks` table for pending tasks
2. **Simulate failure** - In `/process-drive-times`, temporarily add an error. Check that:
   - Task status becomes 'failed'
   - Error toast appears in frontend
   - Task shows in failed tasks panel
3. **Dismiss task** - Click dismiss, verify `dismissed_at` is set
4. **Archive test** - Run `SELECT archive_old_tasks();` manually

---

## Implementation Order

1. Apply SQL schema to Supabase
2. Create `/get-failed-tasks` and `/dismiss-task` endpoints (so frontend works)
3. Add frontend scripts to dashboard.html
4. Verify notifications appear when manually inserting failed tasks
5. Create `/process-drive-times` and `/process-quo-sync` background workflows
6. Modify `/add-client` to use async pattern
7. Test end-to-end
8. Repeat for other workflows (update-client, add-driver, save-appointment, etc.)

---

## Error Handling

Background workflows should catch all errors and call `fail_background_task()` with a helpful message:

```
Good: "Google Maps API returned 429: Rate limit exceeded. Try again in 1 minute."
Bad: "Error"
```

Include:
- What failed (API name, operation)
- Why it failed (error code, message)
- What to do (retry, check config, contact admin)

---

## Files Reference

| File | Purpose |
|------|---------|
| `sql/background_tasks_schema.sql` | Run in Supabase to create tables/functions |
| `js/core/task-monitor.js` | Monitors failed tasks, call `TaskMonitor.init()` |
| `js/components/task-notifications.js` | UI components, auto-initializes |
| `js/components/failed-tasks-widget.js` | Dashboard widget, auto-initializes for admin/supervisor |
| `docs/n8n-archive-cleanup-workflow.md` | Archive cleanup setup guide |
| `docs/workflow-segmentation-guide.md` | Full list of workflows to segment |

---

## Notes

- Only error notifications are shown to users (no success toasts)
- Success is assumed and can be verified on dashboards
- Dismissed tasks are hidden but kept for history (dismissed_at field)
- Tasks auto-archive after 7 days
- Supervisors/admins see all users' failed tasks
- Regular users only see their own failed tasks
