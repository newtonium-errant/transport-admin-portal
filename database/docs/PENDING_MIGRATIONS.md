# Pending Database Migrations

This file tracks database changes that were removed from production workflows as quick fixes and need to be properly implemented with the next migration.

---

## Pending Items

*(No pending items)*

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

---

## Notes

- Always test migrations in the Supabase Testing database first
- Coordinate workflow updates with database migrations
- Update this file when adding/completing items
