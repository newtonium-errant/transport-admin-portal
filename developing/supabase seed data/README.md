# Testing Branch Supabase Seed Data

This directory contains scripts to populate your Testing Branch Supabase database with data.

---

## 🎯 Quick Start - Choose Your Approach

### ⭐ **RECOMMENDED: Option 1 - Production Data with Auto-Anonymization**

**Use this if**: You want real production data structure with anonymized personal information

**Steps**:
1. Read: `HOW TO USE - Auto Anonymization.md`
2. Run: `STEP 1 - Extract Production with Auto-Anonymization.sql` in **PRODUCTION**
3. Copy the output SQL
4. Run the output in **TESTING BRANCH**

**What you get**:
- Real production clinics (destinations)
- Real production users (3 specific users)
- Real production driver (Andrew Newton)
- Up to 51 clients: K7807878 (real) + 50 anonymized (K0000001, TestFirstName1, etc.)
- Up to 100 appointments with anonymized knumbers
- All addresses/clinics preserved for mapping accuracy
- All personal info safely anonymized

**Time**: ~5 minutes

---

### 🚀 **Option 2 - Quick Test Data (No Production Needed)**

**Use this if**: You just want to start testing immediately with fake data

**Steps**:
1. Open Testing Branch Supabase
2. Run: `Quick Test Data - No Production Needed.sql`

**What you get**:
- 6 test clinics (Halifax hospitals)
- 3 test users
- 1 test driver
- 11 test clients (K7807878 + 10 anonymized)
- 5 sample appointments

**Time**: ~1 minute

---

### 📝 **Option 3 - Manual Extraction (For Custom Needs)**

**Use this if**: You need fine control over what data is extracted

**Steps**:
1. Read: `STEP 1 - Get Production Data (Manual).md`
2. Follow the step-by-step guide to extract specific data
3. Use: `STEP 2 - Import with Anonymization (Manual).sql` as template
4. Manually apply anonymization
5. Run in Testing Branch

**Time**: ~15-30 minutes

---

## 📁 File Reference

### Automated Approach (Recommended)
- **`HOW TO USE - Auto Anonymization.md`** - Complete guide for automated extraction
- **`STEP 1 - Extract Production with Auto-Anonymization.sql`** - Run in Production to generate anonymized INSERT statements

### Quick Start Approach
- **`Quick Test Data - No Production Needed.sql`** - Ready-to-use test data, just run in Testing Branch

### Manual Approach
- **`STEP 1 - Get Production Data (Manual).md`** - Step-by-step manual extraction guide
- **`STEP 2 - Import with Anonymization (Manual).sql`** - Template for manual import
- **`STEP 1B - Generate Import Script.sql`** - Semi-automated generation script

### Legacy/Reference
- **`STEP 1 - Extract Production Data.sql`** - Original complex script (has syntax errors, use auto-anonymization instead)
- **`STEP 1 - Extract Production Data - SIMPLE.sql`** - Simplified extraction (displays data, doesn't generate INSERTs)

---

## 🔐 Anonymization Rules

For all approaches that use production data, the following anonymization is applied:

### ✅ Keep As-Is (Test-Safe Data)
- **K7807878** (Andrew Newton) - All original data preserved
- **Destinations** (clinics) - All production clinics copied exactly
- **Users** (id 13, 23, 30) - Specific production users copied exactly
- **Driver** (id 11) - Andrew Newton driver record copied exactly

### 🔄 Anonymize (PII Protection)
- **K Numbers**: K0000001, K0000002, K0000003, etc.
- **First Names**: TestFirstName1, TestFirstName2, etc.
- **Last Names**: TestLastName1, TestLastName2, etc.
- **Phone Numbers**: All → 902-760-0946
- **Emails**: All → strugglebusca@gmail.com
- **Emergency Contact Names**: TestEmergencyContactName1, etc.
- **Emergency Contact Numbers**: All → 902-760-0946
- **OpenPhone Data**: All use K7807878's values (prevents production API calls)

### ✅ Preserve (Mapping & Logic)
- **Addresses** (civicaddress, city, province, postal code)
- **Primary Clinic ID** (for testing the feature)
- **Driver Gender Requirements**
- **Preferred Driver**
- **Map Addresses**
- **Appointment Lengths**
- **Clinic Travel Times**
- **All timestamps**

---

## 🌐 Supabase URLs

### Production
https://supabase.com/dashboard/project/YOUR_PROD_PROJECT/sql

### Testing Branch
https://supabase.com/dashboard/project/bkgrouxtldxnbjalnmms/sql

---

## 📊 Expected Data Volumes

### Option 1 (Production with Auto-Anonymization)
- Destinations: All production clinics
- Users: 3 users
- Drivers: 1 driver
- Clients: ~51 (K7807878 + up to 50 anonymized)
- Appointments: ~100 (last month + next 2 months)

### Option 2 (Quick Test Data)
- Destinations: 6 test clinics
- Users: 3 test users
- Drivers: 1 test driver
- Clients: 11 test clients
- Appointments: 5 sample appointments

---

## ✅ Verification Queries

After importing data, run these in Testing Branch to verify:

```sql
-- Check record counts
SELECT 'destinations' as table_name, COUNT(*) as count FROM destinations
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments;

-- Verify anonymization
SELECT knumber, firstname, lastname, phone, email
FROM clients
WHERE knumber != 'K7807878'
LIMIT 5;

-- Verify K7807878 NOT anonymized
SELECT knumber, firstname, lastname, phone, email
FROM clients
WHERE knumber = 'K7807878';

-- Check Primary Clinic feature
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

## 🔧 Troubleshooting

### Script has syntax errors
- Use the **Auto-Anonymization** approach instead of the legacy scripts
- The automated script uses DO blocks and RAISE NOTICE to avoid complex string concatenation issues

### Duplicate key errors
- Run TRUNCATE statements first:
  ```sql
  TRUNCATE TABLE appointments CASCADE;
  TRUNCATE TABLE clients CASCADE;
  TRUNCATE TABLE destinations CASCADE;
  TRUNCATE TABLE drivers CASCADE;
  TRUNCATE TABLE users CASCADE;
  ```

### Foreign key violations
- Make sure destinations are imported before clients
- The automated script generates all INSERTs in the correct order

### Need more data
- Edit the automated script's LIMIT clauses (lines ~190 and ~250)
- Adjust date range for appointments if needed

---

## 🎯 Next Steps After Import

1. Test TEST environment pages:
   - `testing/TEST-clients-sl.html`
   - `testing/TEST-appointments-sl.html`
   - `testing/TEST-appointments-bulk-add.html`

2. Verify Primary Clinic feature:
   - Check client-clinic relationships
   - Test appointment creation with pre-filled clinic data
   - Verify dropdowns populate with correct clinics

3. Test all TEST API endpoints:
   - See `testing/README.md` for full endpoint list
   - Verify workflows connect to Testing Branch Supabase

---

## 📝 Notes

- **Testing Branch Project ID**: `bkgrouxtldxnbjalnmms`
- **All TEST workflows** are configured to use "Testing Branch - Supabase" credential
- **RLS is enabled** on all tables
- **Timezone**: Server in Halifax (AST/ADT), database stores UTC
- **Password format**: PBKDF2 hash (salt:hash format)
