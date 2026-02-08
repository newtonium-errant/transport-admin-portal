# Archive Cleanup Workflow

## Purpose
Automatically archive completed/failed background tasks older than 7 days to keep the `background_tasks` table lean and performant.

## Schedule
Run daily at 3:00 AM (low-traffic period)

---

## n8n Workflow Structure

```
┌─────────────────────┐
│   Schedule Trigger  │
│   (Daily @ 3 AM)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Supabase:         │
│   Call RPC          │
│   archive_old_tasks │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Check Result      │
│   (archived_count)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Log Result        │
│   (optional: Slack) │
└─────────────────────┘
```

---

## n8n Node Configuration

### Node 1: Schedule Trigger
- **Type:** Schedule Trigger
- **Settings:**
  - Mode: Every Day
  - Hour: 3
  - Minute: 0
  - Timezone: America/Toronto (or your local timezone)

### Node 2: Supabase - Call RPC Function
- **Type:** Supabase
- **Operation:** Execute Query
- **Query:**
```sql
SELECT archive_old_tasks() as archived_count;
```

**Alternative using RPC call:**
- **Operation:** Call RPC Function
- **Function Name:** `archive_old_tasks`
- **Parameters:** (none)

### Node 3: Log/Notify (Optional)
- **Type:** IF node + Slack/Email
- **Condition:** Check if `archived_count > 0`
- **Slack Message (if true):**
```
📦 Background Tasks Archive Complete
Archived {{ $json.archived_count }} tasks older than 7 days.
```

---

## Manual Execution

If you need to run the archive manually:

```sql
-- Run in Supabase SQL Editor
SELECT archive_old_tasks();

-- Check what will be archived (preview)
SELECT COUNT(*)
FROM background_tasks
WHERE completed_at < NOW() - INTERVAL '7 days'
AND status IN ('completed', 'failed');

-- Check archive table
SELECT COUNT(*) FROM background_tasks_archive;
```

---

## Monitoring

### Health Checks
Add these queries to your monitoring dashboard:

```sql
-- Active tasks table size
SELECT COUNT(*) as active_tasks FROM background_tasks;

-- Archive table size
SELECT COUNT(*) as archived_tasks FROM background_tasks_archive;

-- Pending tasks (should be low)
SELECT COUNT(*) FROM background_tasks WHERE status = 'pending';

-- Stuck tasks (processing for > 1 hour)
SELECT * FROM background_tasks
WHERE status = 'processing'
AND started_at < NOW() - INTERVAL '1 hour';
```

### Alert Conditions
Consider setting up alerts for:
1. **Stuck tasks:** Tasks in 'processing' status for > 1 hour
2. **High failure rate:** > 10 failed tasks in 24 hours
3. **Archive backlog:** > 1000 tasks in main table

---

## Archive Retention

The archive table retains historical data indefinitely. If you want to purge old archive data:

```sql
-- Delete archived tasks older than 1 year
DELETE FROM background_tasks_archive
WHERE archived_at < NOW() - INTERVAL '1 year';
```

Consider adding this as a quarterly manual cleanup or separate scheduled workflow.
