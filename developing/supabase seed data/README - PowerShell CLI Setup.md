# PowerShell CLI Setup Guide

This guide explains how to set up and populate your local Testing Branch Supabase database using PowerShell scripts and Supabase CLI.

## 📋 Prerequisites

### 1. Supabase CLI Installed
Check if installed:
```powershell
supabase --version
```

If not installed, install via npm:
```powershell
npm install -g supabase
```

Or via Scoop:
```powershell
scoop install supabase
```

### 2. Supabase Project Initialized
Your local Supabase should already be linked to the project. Verify:
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase status
```

You should see your local Supabase instance running with connection details.

### 3. Supabase Running Locally
If not running, start it:
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase start
```

---

## 🚀 Quick Start (3 Steps)

### Step 1: Setup Schema
Run the schema setup script to create all tables:

```powershell
cd "F:\GitHub\Repos\transport-admin-portal\testing\supabase seed data"
.\1-setup-schema.ps1
```

**What this does:**
- Drops existing tables (if any)
- Creates all 8 tables (users, destinations, clients, drivers, appointments, etc.)
- Creates the new `destinations` table
- Adds `primary_clinic_id` field to `clients` table
- Sets up foreign key constraints
- Creates indexes for performance

**Expected output:**
```
✅ Schema setup completed successfully!
```

---

### Step 2: Extract Production Data

Since you need to extract data from **Production Supabase** (not local), you have two options:

#### Option A: Use Supabase Dashboard (Easiest)
1. Go to Production Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROD_PROJECT/sql
2. Open file: `STEP 1 - Extract Production Data.sql`
3. Copy entire contents and paste into SQL Editor
4. Run the queries
5. Copy all the output data

#### Option B: Use Supabase CLI with Production Connection
If you have production credentials:

```powershell
# Set production connection string temporarily
$env:SUPABASE_DB_URL = "postgresql://postgres:[YOUR_PASSWORD]@[YOUR_PROD_HOST]:5432/postgres"

# Run extraction script
Get-Content "STEP 1 - Extract Production Data.sql" | supabase db execute --file -

# Unset when done
Remove-Item Env:\SUPABASE_DB_URL
```

---

### Step 3: Update and Import Data

1. Open `Copy Production Data to Testing.sql` in a text editor
2. Replace all "PASTE PRODUCTION DATA HERE" sections with the data you extracted in Step 2
3. Save the file
4. Run the import script:

```powershell
cd "F:\GitHub\Repos\transport-admin-portal\testing\supabase seed data"
.\2-import-data.ps1
```

**What this does:**
- Truncates all existing data
- Imports destinations (as-is from production)
- Imports users (only ids 13, 23, 30)
- Imports driver (only id 11 - Andrew Newton)
- Imports and anonymizes clients (except K7807878)
- Imports appointments (1 month past + 1 month future)
- Updates appointment knumbers to match anonymized clients

**Expected output:**
```
✅ Data import completed successfully!

Record counts:
destinations    | 15
users           | 3
drivers         | 1
clients         | 50
appointments    | 120
```

---

## 🔍 Verification

After setup and import, verify everything is correct:

```powershell
cd "F:\GitHub\Repos\transport-admin-portal\testing\supabase seed data"
.\3-verify-schema.ps1
```

This script will check:
- ✅ All 8 tables exist
- ✅ destinations table has correct structure
- ✅ primary_clinic_id field exists in clients
- ✅ Foreign key constraint is set up
- ✅ Indexes are created
- ✅ Record counts

---

## 📂 PowerShell Scripts Reference

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `1-setup-schema.ps1` | Create database schema | First time, or to reset schema |
| `2-import-data.ps1` | Import production data | After updating data SQL file |
| `3-verify-schema.ps1` | Verify schema and data | Anytime to check status |

---

## 🔧 Useful Commands

### Check Supabase Status
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase status
```

### View Local Database in Browser
```powershell
supabase db browser
```
Opens Studio UI in your browser (usually http://localhost:54323)

### Reset Local Database (Nuclear Option)
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase db reset
```
⚠️ This will delete ALL data!

### Run Custom SQL Query
```powershell
supabase db execute --file path/to/query.sql
```

Or inline:
```powershell
"SELECT * FROM destinations LIMIT 5;" | supabase db execute --file -
```

### Generate Migration from Changes
If you make schema changes via Studio UI:
```powershell
supabase db diff -f new_migration_name
```

### View Database Logs
```powershell
supabase logs db
```

---

## 🐛 Troubleshooting

### Error: "Supabase CLI not found"
**Solution:** Install Supabase CLI:
```powershell
npm install -g supabase
```

### Error: "relation does not exist"
**Solution:** Schema hasn't been set up yet. Run:
```powershell
.\1-setup-schema.ps1
```

### Error: "Connection refused"
**Solution:** Local Supabase isn't running. Start it:
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase start
```

### Error: "Foreign key constraint violation"
**Solution:** Make sure you're importing data in the correct order:
1. destinations (referenced by clients)
2. users
3. drivers
4. clients (references destinations)
5. appointments (references clients and drivers)

The `2-import-data.ps1` script handles this automatically.

### Warning: "Placeholder data detected"
**Solution:** You need to extract production data first:
1. Run `STEP 1 - Extract Production Data.sql` in Production Supabase
2. Copy the output
3. Paste into `Copy Production Data to Testing.sql`
4. Run `.\2-import-data.ps1` again

---

## 🎯 Alternative: Manual SQL Execution

If you prefer to run SQL files manually:

### Setup Schema
```powershell
cd F:\GitHub\Repos\transport-admin-portal
Get-Content "testing\supabase seed data\Testing Branch Supabase Schema Setup.txt" | supabase db execute --file -
```

### Import Data
```powershell
cd F:\GitHub\Repos\transport-admin-portal
Get-Content "testing\supabase seed data\Copy Production Data to Testing.sql" | supabase db execute --file -
```

### Run Single Query
```powershell
"SELECT COUNT(*) FROM destinations;" | supabase db execute --file -
```

---

## 📊 Viewing Your Data

### Option 1: Supabase Studio (Recommended)
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase studio
```
Opens in browser - full GUI for viewing/editing data

### Option 2: psql CLI
```powershell
# Get connection string
supabase status

# Connect with psql (if installed)
psql "postgresql://postgres:postgres@localhost:54322/postgres"
```

### Option 3: Direct SQL Queries
```powershell
# View destinations
"SELECT id, name, city FROM destinations ORDER BY name;" | supabase db execute --file -

# View anonymized clients
"SELECT knumber, firstname, lastname, phone FROM clients WHERE knumber != 'K7807878' LIMIT 10;" | supabase db execute --file -

# View K7807878 (should NOT be anonymized)
"SELECT knumber, firstname, lastname, phone FROM clients WHERE knumber = 'K7807878';" | supabase db execute --file -
```

---

## ✅ Next Steps After Setup

Once your local database is set up with the schema and data:

1. **Fix TEST Workflows** (before importing to n8n)
   - See: `testing/TEST Workflow Copies/CRITICAL-ISSUES-REPORT.md`
   - See: `testing/TEST Workflow Copies/FIX-CHECKLIST.md`

2. **Update n8n Workflows**
   - Import TEST workflows to n8n
   - Fix Supabase credentials to point to "Testing Branch - Supabase"
   - Fix webhook paths

3. **Start Testing**
   - Open `testing/TEST-clients-sl.html`
   - Test Primary Clinic feature
   - Test client management
   - Test appointment management

4. **Connect Local Supabase to n8n**
   - Update n8n "Testing Branch - Supabase" credential to point to local Supabase
   - Get connection details: `supabase status`
   - Use the values for: API URL, anon key, service role key

---

## 🔗 Useful Links

- **Supabase CLI Docs**: https://supabase.com/docs/guides/cli
- **Supabase CLI Commands**: https://supabase.com/docs/reference/cli
- **Local Development Guide**: https://supabase.com/docs/guides/cli/local-development
- **Database Commands**: https://supabase.com/docs/reference/cli/supabase-db

---

## 📝 Summary

**Step-by-step workflow:**

1. ✅ Install Supabase CLI
2. ✅ Start local Supabase: `supabase start`
3. ✅ Run: `.\1-setup-schema.ps1`
4. ✅ Extract production data (via Supabase Dashboard)
5. ✅ Update `Copy Production Data to Testing.sql` with production data
6. ✅ Run: `.\2-import-data.ps1`
7. ✅ Run: `.\3-verify-schema.ps1`
8. ✅ Open Supabase Studio to view data: `supabase studio`
9. ✅ Fix and import TEST workflows to n8n
10. ✅ Start testing!

**You're ready to test the Primary Clinic feature! 🎉**
