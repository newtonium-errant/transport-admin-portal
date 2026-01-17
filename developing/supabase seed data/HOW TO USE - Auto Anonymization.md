# How to Extract Production Data with Auto-Anonymization

This guide walks you through using the automated extraction script that generates ready-to-use INSERT statements with anonymization already applied.

---

## 🎯 What This Does

- Extracts production data (destinations, users, drivers, clients, appointments)
- **Automatically anonymizes** all clients except K7807878
- K7807878 stays as Andrew Newton (test-safe)
- All other clients become K0000001, K0000002, etc.
- Names become TestFirstName1/TestLastName1, etc.
- All phone numbers → 902-760-0946
- All emails → strugglebusca@gmail.com
- Uses K7807878's OpenPhone data for all test clients

---

## 📋 Step-by-Step Instructions

### Step 1: Run Extraction Script in Production

1. Open **PRODUCTION** Supabase: https://supabase.com/dashboard/project/YOUR_PROD_PROJECT/sql

2. Copy the entire contents of `STEP 1 - Extract Production with Auto-Anonymization.sql`

3. Paste into the SQL Editor

4. Click **Run**

5. Switch to the **Messages** tab (not Results)

6. You'll see output like:
   ```sql
   -- ============================================================================
   -- DESTINATIONS
   -- ============================================================================
   INSERT INTO destinations (...) VALUES ...;

   -- ============================================================================
   -- USERS
   -- ============================================================================
   INSERT INTO users (...) VALUES ...;

   -- ... etc
   ```

7. **Copy ALL the SQL output** from the Messages tab

8. Save to a file called `import-to-testing.sql`

---

### Step 2: Import into Testing Branch

1. Open **TESTING BRANCH** Supabase: https://supabase.com/dashboard/project/bkgrouxtldxnbjalnmms/sql

2. First, clear existing data by running:
   ```sql
   TRUNCATE TABLE appointments CASCADE;
   TRUNCATE TABLE clients CASCADE;
   TRUNCATE TABLE destinations CASCADE;
   TRUNCATE TABLE drivers CASCADE;
   TRUNCATE TABLE users CASCADE;
   ```

3. Open your saved `import-to-testing.sql` file

4. Copy the entire contents

5. Paste into the SQL Editor

6. Click **Run**

---

### Step 3: Verify the Import

Run these verification queries in Testing Branch:

```sql
-- Check record counts
SELECT 'destinations' as table_name, COUNT(*) as count FROM destinations
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments;

-- Verify anonymization worked
SELECT knumber, firstname, lastname, phone, email
FROM clients
WHERE knumber != 'K7807878'
LIMIT 5;

-- Should show:
-- K0000001 | TestFirstName1 | TestLastName1 | 902-760-0946 | strugglebusca@gmail.com
-- K0000002 | TestFirstName2 | TestLastName2 | 902-760-0946 | strugglebusca@gmail.com
-- etc.

-- Verify K7807878 NOT anonymized
SELECT knumber, firstname, lastname, phone, email
FROM clients
WHERE knumber = 'K7807878';

-- Should show:
-- K7807878 | Andrew | Newton | 902-760-0946 | andrew@... (original data)

-- Check Primary Clinic assignments
SELECT
    c.knumber,
    c.firstname,
    c.primary_clinic_id,
    d.name as clinic_name
FROM clients c
LEFT JOIN destinations d ON c.primary_clinic_id = d.id
WHERE c.primary_clinic_id IS NOT NULL
LIMIT 10;
```

---

## ✅ What You Should See

After successful import:

1. **Destinations**: All production clinics copied as-is
2. **Users**: 3 users (id 13, 23, 30) copied as-is
3. **Drivers**: 1 driver (id 11) copied as-is
4. **Clients**:
   - K7807878 with real Andrew Newton data (test-safe)
   - Up to 50 other clients with anonymized data (K0000001, TestFirstName1, etc.)
5. **Appointments**: Up to 100 appointments from last month + next 2 months, with knumbers updated to match anonymized clients

---

## 🔍 Troubleshooting

### "ERROR: duplicate key value"
- You didn't clear existing data first
- Run the TRUNCATE statements in Step 2.2

### "No output in Messages tab"
- Check the **Messages** tab, not the Results tab
- The script uses RAISE NOTICE which outputs to Messages

### "Foreign key constraint violation"
- The primary_clinic_id references don't match
- This shouldn't happen with the automated script
- Check that destinations were imported first

### "Too much/too little data"
- The script limits to:
  - 50 active clients (excluding K7807878)
  - 100 appointments (last month + next 2 months)
- To change limits, edit the LIMIT clauses in the script

---

## 📊 Data Volumes

The script extracts:
- **All** destinations (clinics)
- **3** users (id 13, 23, 30)
- **1** driver (id 11)
- **Up to 51** clients (K7807878 + 50 anonymized)
- **Up to 100** appointments (within date range)

This provides enough data to thoroughly test the Primary Clinic feature while keeping the dataset manageable.

---

## 🎉 Next Steps

Once you've imported the data:

1. Test the Primary Clinic feature in TEST pages
2. Verify client-clinic relationships are correct
3. Test appointment creation with Primary Clinic pre-fill
4. Check that all TEST API endpoints work with the real data structure

---

## Need More Data?

If you need more than 50 clients or 100 appointments, edit the extraction script:

- Line ~190: Change `LIMIT 50` to a higher number (for clients)
- Line ~250: Change `LIMIT 100` to a higher number (for appointments)
- Line ~240: Adjust date range if needed (currently last month + next 2 months)
