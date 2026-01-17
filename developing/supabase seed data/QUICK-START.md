# Quick Start - PowerShell CLI

Run your Testing Branch Supabase setup from PowerShell in just a few commands!

## ⚡ Super Quick Start (One Command)

```powershell
cd "F:\GitHub\Repos\transport-admin-portal\testing\supabase seed data"
.\RUN-ALL.ps1
```

This will:
1. ✅ Setup database schema (all tables, indexes, foreign keys)
2. ⏭️ Optionally import production data (if ready)
3. ✅ Verify everything is working

---

## 🎯 Step-by-Step Commands

### 1. Setup Schema Only
```powershell
cd "F:\GitHub\Repos\transport-admin-portal\testing\supabase seed data"
.\1-setup-schema.ps1
```

### 2. Import Production Data
```powershell
.\2-import-data.ps1
```
*(First update `Copy Production Data to Testing.sql` with real production data)*

### 3. Verify Setup
```powershell
.\3-verify-schema.ps1
```

---

## 📊 Useful Commands After Setup

### View Data in Browser (Studio UI)
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase studio
```
Opens http://localhost:54323 in your browser

### Check Connection Details
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase status
```

### Run Custom SQL Query
```powershell
"SELECT * FROM destinations;" | supabase db execute --file -
```

### View Record Counts
```powershell
"SELECT 'destinations' as table, COUNT(*) FROM destinations UNION ALL SELECT 'clients', COUNT(*) FROM clients UNION ALL SELECT 'appointments', COUNT(*) FROM appointments;" | supabase db execute --file -
```

### Reset Database (⚠️ Deletes all data!)
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase db reset
```

---

## 🔍 Verification Queries

### Check Tables Exist
```powershell
"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" | supabase db execute --file -
```

### Check Primary Clinic Field
```powershell
"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'primary_clinic_id';" | supabase db execute --file -
```

### View Sample Destinations
```powershell
"SELECT id, name, city FROM destinations LIMIT 5;" | supabase db execute --file -
```

### View Anonymized Clients
```powershell
"SELECT knumber, firstname, lastname, phone FROM clients WHERE knumber != 'K7807878' LIMIT 5;" | supabase db execute --file -
```

### Check K7807878 NOT Anonymized
```powershell
"SELECT knumber, firstname, lastname, phone, email FROM clients WHERE knumber = 'K7807878';" | supabase db execute --file -
```

---

## 🆘 Troubleshooting

### Supabase Not Running?
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase start
```

### Need to Stop Supabase?
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase stop
```

### Want Fresh Start?
```powershell
cd F:\GitHub\Repos\transport-admin-portal
supabase db reset
cd "testing\supabase seed data"
.\RUN-ALL.ps1
```

---

## 📝 File Reference

| File | Purpose |
|------|---------|
| `RUN-ALL.ps1` | Master script - runs everything in order |
| `1-setup-schema.ps1` | Creates database schema |
| `2-import-data.ps1` | Imports production data |
| `3-verify-schema.ps1` | Verifies setup |
| `Testing Branch Supabase Schema Setup.txt` | SQL schema definition |
| `Copy Production Data to Testing.sql` | Data import script (needs production data) |
| `STEP 1 - Extract Production Data.sql` | Run in Production to get data |

---

## ✅ Next Steps After Setup

1. **Fix TEST Workflows** - See `testing/TEST Workflow Copies/FIX-CHECKLIST.md`
2. **Import to n8n** - Import all TEST workflows
3. **Update n8n Credentials** - Point to local Supabase
4. **Start Testing** - Open `testing/TEST-clients-sl.html`

---

## 🎉 You're Ready!

Once setup is complete:
- Database schema: ✅
- Primary Clinic feature: ✅
- Test data: ✅ (if imported)
- Ready to test! ✅

Need help? See `README - PowerShell CLI Setup.md` for detailed documentation.
