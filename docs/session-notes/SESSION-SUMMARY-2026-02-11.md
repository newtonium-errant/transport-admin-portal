# Session Summary - February 11, 2026

## Overview

Railway infrastructure troubleshooting session. Resolved PostgreSQL collation version mismatch, Redis connection timeouts, and n8n service synchronization issues after deleting an old corrupted Postgres service.

---

## Issues Resolved

### 1. PostgreSQL Collation Version Mismatch

**Problem:** Railway logs flooded with `WARNING: database "railway" has a collation version mismatch` every ~60 seconds. Database created with collation version 2.36, OS provides 2.41.

**Investigation:**
- Connected via psql using Railway CLI: `railway connect Postgres-n8n-database-v2`
- Required PATH fix: `$env:PATH += ";C:\Program Files\PostgreSQL\17\bin"` (PostgreSQL 17 installed but bin not on system PATH)
- Ran `ALTER DATABASE railway REFRESH COLLATION VERSION;` → returned `NOTICE: version has not changed`
- Verified: `datcollversion = 2.41` in `pg_database`, OS provides `2.41` via `pg_collation_actual_version()`
- Warnings persisted despite versions matching

**Root Cause:** Warnings were coming from **old corrupted Postgres service** (service ID `622c4fc7...`), not the current Postgres-n8n-database-v2 (service ID `b13d538b...`). Identified by analyzing service IDs in log JSON entries.

**Fix:** Deleted the old Postgres service from Railway. Warnings stopped immediately.

---

### 2. Redis Connection Timeouts

**Problem:** n8n losing Redis connection with `connect ETIMEDOUT`, entering crash loop: "Unable to connect to Redis after trying to connect for 10s" → "Exiting process due to Redis connection error"

**Fix:** Redis service was restarted by a previous agent session. No further Redis issues after restart.

---

### 3. n8n Service Synchronization After Old Postgres Deletion

**Problem:** Deleting the old Postgres triggered a Railway-wide redeploy of all services. This caused:

1. **Migration race condition** - Webhook Processor and Worker both tried to run n8n database migrations simultaneously, causing deadlocks (`deadlock detected`) and "column already exists" errors
2. **Webhook processor couldn't find workflows** - `Could not find workflow with id "9ZufFVhtQAGS5YxR"` - the user-login webhook was registered but the workflow data wasn't accessible
3. **Worker couldn't process executions** - `Worker failed to find data for execution` errors every 5 minutes

**Root Cause:** Two issues compounded:
- **Deploy order** - Webhook Processor and Worker started before Primary (Errant) finished activating workflows
- **Stale environment variables** - `DB_POSTGRESDB_DATABASE` and `DB_POSTGRESDB_PORT` on Webhook Processor and Worker still referenced the deleted old Postgres service (`${{Postgres.PGDATABASE}}` / `${{Postgres.PGPORT}}`), resolving to empty strings. Only `DB_POSTGRESDB_HOST` and `DB_POSTGRESDB_USER` had been updated to reference `Postgres-n8n-database-v2`.

**Fix:**
1. Updated all three n8n services' environment variables to reference `Postgres-n8n-database-v2`:
   - `DB_POSTGRESDB_DATABASE` → `${{Postgres-n8n-database-v2.PGDATABASE}}`
   - `DB_POSTGRESDB_PORT` → `${{Postgres-n8n-database-v2.PGPORT}}`
2. Restarted services in correct order: Primary (Errant) first → Webhook Processor → Worker
3. Website login restored

---

## Service Architecture (Railway)

| Service | Role | Service ID (prefix) | URL |
|---------|------|---------------------|-----|
| Errant (Primary) | n8n editor UI + workflow activation | `257efdc9` | `primary-production-ec28.up.railway.app` |
| Webhook Processor | Handles incoming webhook requests | `e2e74a43` | `webhook-processor-production-3bb8.up.railway.app` |
| Worker | Executes queued workflow jobs | `237b0206` | N/A (internal) |
| Redis | Queue/pub-sub for n8n | N/A | Internal |
| Postgres-n8n-database-v2 | Database | `b13d538b` | Internal |
| transport-admin-portal | Frontend static files | `9f1fc080` | GitHub Pages deployment |

---

## Key Learnings

### Railway Service Dependencies
- When deleting a service that other services reference via `${{ServiceName.VAR}}`, all referencing variables become empty strings
- Railway redeploys all dependent services simultaneously - no control over startup order
- After infrastructure changes, must verify environment variable references on ALL services

### n8n Multi-Instance Startup Order
- **Primary must start first** and finish activating all workflows before other services
- Webhook Processor reads `webhook_entity` table populated by Primary during activation
- Worker needs execution data written by Primary to process jobs
- If services start out of order, webhooks return "not registered" or "could not find workflow"

### n8n Environment Variables to Verify After Changes
- `DB_POSTGRESDB_HOST`, `DB_POSTGRESDB_PORT`, `DB_POSTGRESDB_DATABASE`, `DB_POSTGRESDB_USER`, `DB_POSTGRESDB_PASSWORD` - must all point to same Postgres
- `N8N_ENCRYPTION_KEY` - must be identical across all services
- `EXECUTIONS_MODE=queue` - required on all services for multi-instance setup

### Recommended Environment Variables (Not Yet Applied)
- `N8N_SKIP_WEBHOOK_DEREGISTRATION_SHUTDOWN=true` on Primary - prevents webhook table clearing on shutdown
- `N8N_RELOAD_WORKFLOWS_ON_CHANGE=true` on all services - helps sync webhook registrations
- `N8N_TRUST_PROXY=true` on Primary - fixes `X-Forwarded-For` rate limiter errors behind Railway's proxy

---

## Outstanding Items

### Non-Critical
- **X-Forwarded-For errors** - n8n rate limiter complaining about proxy headers. Fix: add `N8N_TRUST_PROXY=true` to Primary service
- **N8N_RUNNERS_ENABLED deprecation** - Environment variable no longer needed, can be removed from Worker
- **Python task runner** - Fails to start (Python 3 not installed in container) - informational only, not needed

### Monitoring
- Watch logs for recurrence of Redis timeout issues
- Verify the 5-minute scheduled workflow executions are succeeding (were failing during outage)

---

## Tools & Commands Used

```bash
# Connect to Railway Postgres via psql
$env:PATH += ";C:\Program Files\PostgreSQL\17\bin"
railway connect Postgres-n8n-database-v2

# SQL commands run
ALTER DATABASE railway REFRESH COLLATION VERSION;
SELECT datname, datcollversion FROM pg_database;
SELECT pg_collation_actual_version(oid) FROM pg_collation WHERE collname = 'default';

# Log analysis via Python (log file is single-line JSON array)
# Grouped entries by service ID tags to identify which service generated which errors
```

---

## Notes for Next Session

1. Consider adding recommended env vars (`N8N_SKIP_WEBHOOK_DEREGISTRATION_SHUTDOWN`, `N8N_RELOAD_WORKFLOWS_ON_CHANGE`, `N8N_TRUST_PROXY`)
2. The old corrupted Postgres has been deleted - no longer paying for unused service
3. If services need restarting in future, always start Primary first, then Webhook Processor, then Worker
4. `psql` is installed at `C:\Program Files\PostgreSQL\17\bin\` but not on system PATH
