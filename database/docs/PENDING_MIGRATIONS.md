# Pending Database Migrations

This file tracks database changes that were removed from production workflows as quick fixes and need to be properly implemented with the next migration.

---

## Pending Items

### 1. Add `primary_clinic_id` column to `clients` table

**Date Added:** 2026-01-27
**Reason Removed:** Column doesn't exist in production database, causing workflow failure
**Affected Workflows:**
- `CLIENT - Update Client` (update-client-destinations)
  - Node: "Update Client (without travel times) - Supabase1"
  - Node: "Update Client and Travel Times - Supabase"

**Migration SQL:**
```sql
ALTER TABLE clients
ADD COLUMN primary_clinic_id INTEGER REFERENCES destinations(id);

COMMENT ON COLUMN clients.primary_clinic_id IS 'Default clinic for this client, used for auto-populating appointment forms';
```

**After Migration:**
1. Re-add `primary_clinic_id` field to both Supabase update nodes in the workflow
2. Update frontend forms to allow selecting primary clinic (if not already done)
3. Test end-to-end

### 2. Add `calendar_ical_url` column to `drivers` table

**Date Added:** 2026-02-13
**Reason:** Stores the secret iCal URL from Google Calendar settings for each driver. Used by the new Calendar Links section in the Edit Driver modal.
**Migration File:** `database/sql/12_add_calendar_ical_url.sql`

**Migration SQL:**
```sql
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS calendar_ical_url text;
```

**After Migration:**
1. Update **DRIVER - Get All Drivers** n8n workflow: add `calendar_ical_url` to the Final Processing code node field mapping
2. Update **DRIVER - Update Driver** n8n workflow: add `calendar_ical_url` to validation and Supabase Update node
3. Backfill existing drivers: open each driver's edit modal, click Google Calendar Settings link, copy the secret iCal URL, paste, and save

---

## Completed Migrations

*(Move items here after migration is applied)*

---

## Notes

- Always test migrations in the Supabase Testing database first
- Coordinate workflow updates with database migrations
- Update this file when adding/completing items
