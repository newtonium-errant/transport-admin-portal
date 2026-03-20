# Pending Database Migrations

This file tracks database changes that were removed from production workflows as quick fixes and need to be properly implemented with the next migration.

---

## Pending Items

*(No pending items)*

---

## Decisions / Resolved

### Drivers table `status` column — No action needed
The frontend sends a `status` field when saving drivers, but no `status` column exists on the `drivers` table. The value is silently dropped by Supabase. **Decision (2026-03-20):** Being removed from frontend code — no database column needed.

---

## Completed Migrations

### 1. Add `primary_clinic_id` column to `clients` table — ✅ Done 2026-02-27
**Migration File:** `database/sql/25_add_client_primary_clinic.sql`
**Applied:** Both branches (production + staging)
**Remaining:**
1. Re-add `primary_clinic_id` field to both Supabase update nodes in the Update Client workflow
2. Frontend appointment modal auto-populate already implemented (v3.1.0)

### 2. Add `calendar_ical_url` column to `drivers` table — ✅ Done (confirmed 2026-02-27)
**Migration File:** `database/sql/12_add_calendar_ical_url.sql`
**Applied:** Both branches (confirmed present in production schema CSV)

### 3. Backfill `driver_work_duration` for historical appointments — ✅ Done 2026-03-20
**Script:** `database/sql/backfill_driver_work_duration.sql`
**Context:** Migration 34 added the column; this backfill populates it for ~328 existing appointments using tiered calculation (completion time, appointment length + transit, or 240 min default).
**Status:** Ready to run in Supabase SQL Editor (run dry-run preview first).

---

## Notes

- Always test migrations in the Supabase Testing database first
- Coordinate workflow updates with database migrations
- Update this file when adding/completing items
