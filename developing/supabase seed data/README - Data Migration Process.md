# Testing Branch Data Migration Process

This guide walks you through copying production data to the Testing Branch Supabase database with proper anonymization.

## 📋 Overview

**Purpose**: Copy production data to Testing Branch for safe testing of the Primary Clinic feature and other updates.

**Safety Features**:
- All clients anonymized EXCEPT K7807878 (Andrew Newton - test-safe)
- All phone numbers changed to test number
- All emails changed to test email
- OpenPhone data copied from K7807878 to prevent production API calls
- Limited appointment date range (1 month past + 1 month future)
- Only test driver (id 11) copied

## 🗂️ Files in This Folder

1. **Testing Branch Supabase Schema Setup.txt**
   - Creates the database schema (tables, indexes, constraints)
   - **Run this FIRST** in Testing Branch Supabase

2. **STEP 1 - Extract Production Data.sql**
   - Queries to extract data from Production Supabase
   - **Run in PRODUCTION** Supabase SQL Editor
   - Copy the output to use in Step 2

3. **Copy Production Data to Testing.sql**
   - Main migration script with anonymization logic
   - **Run in TESTING BRANCH** Supabase SQL Editor
   - Paste production data into this script before running

## 🚀 Complete Migration Process

### Prerequisites

- [ ] Access to Production Supabase SQL Editor
- [ ] Access to Testing Branch Supabase SQL Editor
- [ ] Verify K7807878 exists in production (Andrew Newton test client)
- [ ] Verify driver id 11 exists in production (Andrew Newton test driver)
- [ ] Verify user ids 13, 23, 30 exist in production

### Step-by-Step Instructions

---

#### **STEP 1: Set Up Testing Branch Schema** ✅

1. Go to Testing Branch Supabase SQL Editor:
   ```
   https://supabase.com/dashboard/project/bkgrouxtldxnbjalnmms/sql
   ```

2. Open file: `Testing Branch Supabase Schema Setup.txt`

3. Copy the ENTIRE contents and paste into SQL Editor

4. Click **RUN** to execute

5. **Verify** schema was created:
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

   Expected tables:
   - app_config
   - appointments
   - clients
   - destinations ✅ (NEW - for Primary Clinic feature!)
   - driver_time_off
   - drivers
   - system_logs
   - users

6. **Verify** primary_clinic_id field exists:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'clients'
   AND column_name = 'primary_clinic_id';
   ```

---

#### **STEP 2: Extract Production Data** 📤

1. Go to **PRODUCTION** Supabase SQL Editor:
   ```
   https://supabase.com/dashboard/project/YOUR_PROD_PROJECT_ID/sql
   ```

2. Open file: `STEP 1 - Extract Production Data.sql`

3. Copy the ENTIRE contents and paste into Production SQL Editor

4. Click **RUN** to execute

5. **IMPORTANT**: Copy ALL the query results. You'll need:
   - Reference OpenPhone data from K7807878
   - All destinations
   - Users 13, 23, 30
   - Driver 11
   - All clients (except K7807878)
   - K7807878 client data
   - Appointments in date range

6. Save the results to a text file or keep the tab open - you'll need this data in Step 3

---

#### **STEP 3: Anonymize and Import Data** 📥

1. Open file: `Copy Production Data to Testing.sql` in a text editor

2. **Find and replace** the placeholder data with actual production data:

   ##### A. Reference OpenPhone Data (around line 60)
   ```sql
   CREATE TEMP TABLE reference_openphone AS
   SELECT
       'contact_id_from_K7807878'::TEXT as ref_contact_id,  -- REPLACE
       'synced'::TEXT as ref_sync_status,                    -- REPLACE
       CURRENT_TIMESTAMP as ref_sync_date;                   -- REPLACE
   ```
   Replace with actual values from Step 2, query 1.

   ##### B. Destinations (around line 85)
   Replace the placeholder INSERT VALUES with production destinations:
   ```sql
   INSERT INTO destinations (id, name, address, city, province, postal_code, phone, notes, active, created_at, updated_at)
   VALUES
   -- PASTE PRODUCTION DESTINATIONS DATA HERE
   (1, 'Halifax General Hospital', '1796 Summer Street', 'Halifax', 'NS', 'B3H 3A7', '902-473-2700', NULL, true, '2025-01-01'::timestamptz, '2025-01-01'::timestamptz),
   -- ... add all destinations
   ```

   ##### C. Users (around line 110)
   Replace placeholder with users 13, 23, 30:
   ```sql
   INSERT INTO users (...)
   VALUES
   -- PASTE PRODUCTION USER DATA HERE (only id 13, 23, 30)
   ```

   ##### D. Driver (around line 135)
   Replace placeholder with driver 11:
   ```sql
   INSERT INTO drivers (...)
   VALUES
   -- PASTE PRODUCTION DRIVER DATA HERE (only id 11)
   ```

   ##### E. Clients (around line 175)
   This is the most complex part. Replace the placeholder in the production_clients CTE:
   ```sql
   WITH production_clients AS (
       SELECT * FROM (VALUES
           -- PASTE PRODUCTION CLIENT DATA HERE (excluding K7807878)
           -- The script will automatically anonymize this data
   ```

   **Format**: Each client should be a complete row with ALL columns.

   ##### F. K7807878 Client (around line 260)
   Replace placeholder with actual K7807878 data (copy as-is, no anonymization):
   ```sql
   INSERT INTO clients (...)
   VALUES
   -- PASTE K7807878 PRODUCTION DATA HERE
   ```

   ##### G. Appointments (around line 290)
   Replace placeholder with appointments from date range:
   ```sql
   WITH production_appointments AS (
       SELECT * FROM (VALUES
           -- PASTE PRODUCTION APPOINTMENT DATA HERE (filtered by date range)
   ```

3. Save the updated file

4. Go to **Testing Branch** Supabase SQL Editor

5. Copy the ENTIRE updated contents and paste into SQL Editor

6. Click **RUN** to execute

7. **Review** the verification queries at the end:
   - Record counts for all tables
   - Sample anonymized client data
   - Appointment date range
   - Knumber mappings

---

#### **STEP 4: Verify Data Migration** ✅

Run these verification queries in Testing Branch:

##### Check Record Counts
```sql
SELECT 'destinations' as table_name, COUNT(*) as record_count FROM destinations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments;
```

##### Verify Client Anonymization
```sql
SELECT
    knumber,
    firstname,
    lastname,
    phone,
    email,
    emergency_contact_name,
    emergency_contact_number
FROM clients
WHERE knumber != 'K7807878'
ORDER BY knumber
LIMIT 5;
```

**Expected**:
- knumber: K0000001, K0000002, K0000003, etc.
- firstname: TestFirstName1, TestFirstName2, TestFirstName3, etc.
- lastname: TestLastName1, TestLastName2, TestLastName3, etc.
- phone: 902-760-0946
- email: strugglebusca@gmail.com
- emergency_contact_number: 902-760-0946

##### Verify K7807878 NOT Anonymized
```sql
SELECT
    knumber,
    firstname,
    lastname,
    phone,
    email
FROM clients
WHERE knumber = 'K7807878';
```

**Expected**: Original data (Andrew Newton with his actual info)

##### Verify Appointments Have Updated Knumbers
```sql
SELECT
    a.knumber,
    c.firstname,
    c.lastname,
    COUNT(*) as appointment_count
FROM appointments a
JOIN clients c ON a.knumber = c.knumber
GROUP BY a.knumber, c.firstname, c.lastname
ORDER BY a.knumber
LIMIT 10;
```

**Expected**: All appointments linked to anonymized clients (TestFirstName1, etc.)

##### Verify Appointment Date Range
```sql
SELECT
    MIN(appointmenttime) as earliest_appointment,
    MAX(appointmenttime) as latest_appointment,
    COUNT(*) as total_appointments,
    COUNT(DISTINCT knumber) as unique_clients
FROM appointments;
```

**Expected**: Dates within ~1 month past to ~1 month future

##### Verify Only Test Driver Exists
```sql
SELECT id, first_name, last_name, email FROM drivers;
```

**Expected**: Only 1 record - driver id 11 (Andrew Newton)

##### Verify Primary Clinic Feature
```sql
-- Check clients with primary clinic assigned
SELECT
    c.knumber,
    c.firstname,
    c.lastname,
    c.primary_clinic_id,
    d.name as primary_clinic_name
FROM clients c
LEFT JOIN destinations d ON c.primary_clinic_id = d.id
WHERE c.primary_clinic_id IS NOT NULL
LIMIT 10;
```

**Expected**: Some clients have primary_clinic_id values and linked destination names

---

## ⚠️ Important Notes

### Data Safety
- ✅ All client data anonymized (except K7807878)
- ✅ All phone numbers changed to test number (902-760-0946)
- ✅ All emails changed to test email (strugglebusca@gmail.com)
- ✅ OpenPhone data copied from K7807878 (prevents production API calls)
- ✅ Only test driver included
- ✅ Limited appointment date range

### What Gets Preserved
- ✅ Client addresses (for mapping/distance calculations)
- ✅ Appointment times and scheduling
- ✅ Driver assignments (if driver id 11)
- ✅ Clinic/destination assignments
- ✅ Appointment statuses and operations data
- ✅ K7807878 client (Andrew Newton) - complete original data

### Known Limitations
- Appointments assigned to drivers OTHER than id 11 will have invalid driver_assigned values (those drivers don't exist in test database)
- Calendar event IDs will be invalid (they reference production Google Calendar events)
- OpenPhone contact IDs will all be the same (from K7807878)

---

## 🔧 Troubleshooting

### Issue: "relation does not exist" Error
**Solution**: Run the schema setup script first (Step 1)

### Issue: Foreign Key Constraint Violation
**Solution**: Make sure you're copying:
1. Destinations BEFORE clients (clients reference destinations)
2. Clients BEFORE appointments (appointments reference clients)
3. Drivers BEFORE appointments (appointments reference drivers)

### Issue: UUID Conflict
**Solution**: The script generates new UUIDs automatically. If you see UUID conflicts, check that you're running in Testing Branch (not production!)

### Issue: Too Many Records
**Solution**: In "STEP 1 - Extract Production Data.sql", adjust the LIMIT on clients and date range on appointments:
```sql
-- Limit clients
LIMIT 50;  -- Change to 20 or 10 for smaller dataset

-- Narrow appointment range
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '2 weeks'  -- Changed from 1 month
  AND appointmenttime <= CURRENT_DATE + INTERVAL '2 weeks'  -- Changed from 1 month
```

---

## 📊 Expected Results Summary

After successful migration, you should have:

| Table | Expected Records | Notes |
|-------|-----------------|-------|
| destinations | All from production | Copied as-is |
| users | 3 | Only ids 13, 23, 30 |
| drivers | 1 | Only id 11 (Andrew Newton) |
| clients | Production count | All anonymized except K7807878 |
| appointments | ~40-100 (depends on production) | 2 months of data, knumbers updated |

---

## ✅ Final Checklist

After completing all steps:

- [ ] Schema created in Testing Branch
- [ ] destinations table has data
- [ ] Clients anonymized (except K7807878)
- [ ] Appointments have updated knumbers
- [ ] primary_clinic_id field exists and populated
- [ ] Only test driver (id 11) exists
- [ ] Only test users (13, 23, 30) exist
- [ ] All phone numbers are 902-760-0946
- [ ] All emails are strugglebusca@gmail.com
- [ ] OpenPhone data matches K7807878

---

## 🎯 Next Steps

Once data migration is complete:

1. **Fix TEST Workflows**:
   - See: `testing/TEST Workflow Copies/CRITICAL-ISSUES-REPORT.md`
   - See: `testing/TEST Workflow Copies/FIX-CHECKLIST.md`

2. **Import TEST Workflows to n8n**

3. **Test Primary Clinic Feature**:
   - Open `testing/TEST-clients-sl.html`
   - Quick edit a client - assign primary clinic
   - View full profile - verify primary clinic displays
   - Create appointment - verify primary clinic used

4. **Test All TEST Endpoints**:
   - Client management (add, update, view)
   - Appointment management (add, update, cancel, delete)
   - Finance operations
   - Verify NO production data affected

---

**Created**: 2025-11-09
**Last Updated**: 2025-11-09
**Version**: 1.0
