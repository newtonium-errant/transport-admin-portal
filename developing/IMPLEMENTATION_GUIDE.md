# Testing Branch Setup - Implementation Guide

This guide walks through setting up the Testing Branch Supabase database with anonymized production data and schema enhancements.

## Overview

1. Extract anonymized data from Production
2. Import to Testing Branch
3. Apply schema enhancements
4. Verify everything works

## Prerequisites

- Access to Production Supabase SQL Editor
- Access to Testing Branch Supabase SQL Editor
- Git repo up to date on `Testing` branch

---

## Step 1: Extract Production Data (Production Supabase)

**File:** `testing/supabase seed data/STEP 1 - Extract Production COMPLETE.sql`

**Where to run:** Production Supabase SQL Editor

**What it does:**
- Extracts all destinations
- Extracts users 13, 23, 30
- Extracts driver 11
- Extracts K7807878 (Andrew Newton) as-is
- Extracts and anonymizes 50 other active clients (K0000001, TestFirstName1, etc.)
- Extracts appointments from last month through next 2 months
- Automatically anonymizes PII while preserving functional data (addresses, travel times)

**How to run:**
1. Open Production Supabase SQL Editor
2. Paste entire contents of `STEP 1 - Extract Production COMPLETE.sql`
3. Run the script
4. **IMPORTANT:** Switch to the **Messages** tab (not Results tab)
5. Copy ALL SQL output starting with `-- DESTINATIONS`
6. Save to a new file: `import-to-testing.sql`

**Expected output:**
- Destinations INSERT statements
- Users INSERT statements (3 users)
- Driver INSERT statement (1 driver)
- Clients INSERT statements (51 clients - K7807878 + 50 anonymized)
- Appointments INSERT statements (~100 appointments)

---

## Step 2: Prepare Testing Branch for Import (Testing Branch Supabase)

**Where to run:** Testing Branch Supabase SQL Editor

**What to do:** Clear existing data to avoid conflicts

```sql
-- Clear all data (preserves schema)
TRUNCATE TABLE appointments CASCADE;
TRUNCATE TABLE clients CASCADE;
TRUNCATE TABLE drivers CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE destinations CASCADE;
```

**Expected output:**
```
TRUNCATE TABLE
TRUNCATE TABLE
TRUNCATE TABLE
TRUNCATE TABLE
TRUNCATE TABLE
```

---

## Step 3: Import Production Data (Testing Branch Supabase)

**File:** `import-to-testing.sql` (created in Step 1)

**Where to run:** Testing Branch Supabase SQL Editor

**What it does:**
- Inserts all destinations with original IDs
- Inserts test users with original IDs
- Inserts test driver with original ID
- Inserts clients (1 real + 50 anonymized)
- Inserts appointments with anonymized knumbers
- Resets sequence counters to prevent ID conflicts

**How to run:**
1. Open Testing Branch Supabase SQL Editor
2. Paste entire contents of `import-to-testing.sql`
3. Run the script

**Expected output:**
```
INSERT 0 [N]  (for each table)
setval
------
[max_id]
```

---

## Step 4: Add clients.updated_at Column (Testing Branch Supabase)

**File:** `testing/supabase seed data/ADD - clients updated_at column.sql`

**Where to run:** Testing Branch Supabase SQL Editor

**What it does:**
- Adds `updated_at` column to clients table with `timestamp with time zone` type
- Sets existing records' `updated_at` to their `created_at` value
- Creates automatic trigger to update timestamp on row changes

**Why:** Production doesn't have this column, but Testing Branch should for better audit tracking

**How to run:**
1. Open Testing Branch Supabase SQL Editor
2. Paste entire contents of `ADD - clients updated_at column.sql`
3. Run the script

**Expected output:**
```
ALTER TABLE
UPDATE [N]
CREATE FUNCTION
DROP TRIGGER
CREATE TRIGGER
✅ updated_at column added to clients table
✅ Trigger created to automatically update updated_at on row changes
```

**Verification queries** (at end of script):
```sql
-- Should show updated_at column with timestamp with time zone type
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'updated_at';

-- Should show 5 clients with both created_at and updated_at
SELECT knumber, firstname, lastname, created_at, updated_at
FROM clients LIMIT 5;
```

---

## Step 5: Fix Driver Timestamp Columns (Testing Branch Supabase)

**File:** `testing/supabase seed data/FIX - drivers timestamp columns add timezone.sql`

**Where to run:** Testing Branch Supabase SQL Editor

**What it does:**
- Changes `created_at` from `timestamp without time zone` → `timestamp with time zone`
- Changes `updated_at` from `timestamp without time zone` → `timestamp with time zone`
- Changes `google_calendar_connected_at` from `timestamp without time zone` → `timestamp with time zone`
- Creates automatic trigger for updated_at

**Why:** Production has timestamp WITHOUT time zone, but Testing Branch should use WITH time zone for consistency with all other tables

**How to run:**
1. Open Testing Branch Supabase SQL Editor
2. Paste entire contents of `FIX - drivers timestamp columns add timezone.sql`
3. Run the script

**Expected output:**
```
ALTER TABLE
ALTER TABLE
ALTER TABLE
CREATE FUNCTION
DROP TRIGGER
CREATE TRIGGER
✅ created_at column changed to timestamp with time zone
✅ updated_at column changed to timestamp with time zone
✅ google_calendar_connected_at column changed to timestamp with time zone
✅ Trigger created to automatically update updated_at on row changes
```

**Verification queries** (at end of script):
```sql
-- Should show all three columns with "timestamp with time zone" type
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'drivers'
    AND column_name IN ('created_at', 'updated_at', 'google_calendar_connected_at')
ORDER BY column_name;
```

---

## Step 6: Verify Data Import and Schema Changes

Run these verification queries in Testing Branch Supabase:

```sql
-- Check record counts
SELECT 'destinations' as table_name, COUNT(*) as count FROM destinations
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments;

-- Expected:
-- destinations: ~20-30
-- users: 3
-- drivers: 1
-- clients: 51
-- appointments: ~100

-- Verify anonymization worked (should see K0000001, TestFirstName1, etc.)
SELECT knumber, firstname, lastname, phone, email
FROM clients
WHERE knumber != 'K7807878'
LIMIT 5;

-- Verify K7807878 NOT anonymized (should see real data)
SELECT knumber, firstname, lastname, phone, email
FROM clients
WHERE knumber = 'K7807878';

-- Verify clients.updated_at column exists and has data
SELECT knumber, firstname, created_at, updated_at
FROM clients
LIMIT 5;

-- Verify driver timestamp columns have time zone
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'drivers'
    AND column_name IN ('created_at', 'updated_at', 'google_calendar_connected_at')
ORDER BY column_name;
-- Should all show: "timestamp with time zone"
```

---

## Step 7: Update TEST Workflows (n8n on Railway.app)

**File:** `testing/TEST Workflow Copies/TEST - CLIENT - Update Client (1).json`

**Where to import:** n8n workflow editor on Railway.app

**What changed:**
- Added `updated_at` field to both Supabase update nodes
- Sets `updated_at` to `{{ $now.toISO() }}` on manual client updates

**How to deploy:**
1. Open n8n workflow editor (Railway.app)
2. Import `TEST - CLIENT - Update Client (1).json`
3. Verify credentials point to "Testing Branch - Supabase"
4. Activate the workflow
5. Test by updating a client record

**Workflows that DON'T need changes:**
- Driver workflows: They don't explicitly set created_at/updated_at (rely on database defaults and triggers)
- Other client workflows: Only the update workflow needs the updated_at field

---

## Step 8: Test Frontend (Optional but Recommended)

**Files to check:**
- `client-management.html` - Verify client updates work
- `driver-management.html` - Verify driver display works

**What to test:**
1. Load client management page
2. Edit a test client (K0000001, etc.)
3. Save changes
4. Verify `updated_at` timestamp updates in database
5. Load driver management page
6. Verify driver information displays correctly

**Frontend files DON'T need code changes** because:
- They don't explicitly manipulate timestamp fields
- Database triggers handle timestamp updates automatically
- Frontend just displays the data as-is

---

## Future: Production Database Merge

**File:** `sql/MERGE - Fix timestamp columns for production.sql`

**When to run:** When merging Testing Branch schema changes to Production

**Where to run:** Production Supabase SQL Editor

**What it does:**
- Fixes all 3 driver timestamp columns in Production
- Adds clients.updated_at column to Production
- Creates both automatic triggers
- Verifies all changes

**IMPORTANT:** Only run this when you're ready to merge Testing Branch features to Production!

---

## Summary Checklist

- [ ] Step 1: Extract production data → `import-to-testing.sql`
- [ ] Step 2: Clear Testing Branch tables
- [ ] Step 3: Import production data
- [ ] Step 4: Add clients.updated_at column
- [ ] Step 5: Fix driver timestamp columns
- [ ] Step 6: Run verification queries
- [ ] Step 7: Import updated TEST workflows to n8n
- [ ] Step 8: Test frontend functionality

---

## Rollback Plan (If Something Goes Wrong)

If import or migrations fail:

```sql
-- Clear all data
TRUNCATE TABLE appointments CASCADE;
TRUNCATE TABLE clients CASCADE;
TRUNCATE TABLE drivers CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE destinations CASCADE;

-- Drop added column (if needed)
ALTER TABLE clients DROP COLUMN IF EXISTS updated_at;

-- Revert driver columns (if needed)
ALTER TABLE drivers ALTER COLUMN created_at TYPE timestamp without time zone;
ALTER TABLE drivers ALTER COLUMN updated_at TYPE timestamp without time zone;
ALTER TABLE drivers ALTER COLUMN google_calendar_connected_at TYPE timestamp without time zone;

-- Start over from Step 1
```

---

## Questions?

- Migration script errors: Check Messages tab in Supabase, not Results tab
- Import fails: Verify you cleared tables first (Step 2)
- Workflow fails: Verify credentials point to Testing Branch Supabase
- Frontend issues: Check browser console for errors, verify API endpoints use TEST- prefix
