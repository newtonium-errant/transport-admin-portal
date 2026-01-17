# TEST Workflows - Fix Checklist

**Date**: 2025-01-09

Use this checklist to fix all issues before importing workflows to n8n.

---

## 🔴 CRITICAL FIXES (Production Data Risk)

### ☐ Fix TEST - APPT - Update Appointment copy.json

**Workflow**: Open in n8n

**Node to fix**: `Update Appt After Calendar Delete - Supabase`

**Steps**:
1. [ ] Open workflow in n8n
2. [ ] Find node: "Update Appt After Calendar Delete - Supabase"
3. [ ] Click on node
4. [ ] Change Credentials dropdown from "Supabase Service Role" to "Testing Branch - Supabase"
5. [ ] Click Save
6. [ ] Re-export and verify change

---

### ☐ Fix TEST - CLIENT - Update Client.json

**Workflow**: Open in n8n

**4 nodes to fix**:

#### Node 1: Get Current Client - Supabase
- [ ] Find node
- [ ] Change credential to "Testing Branch - Supabase"

#### Node 2: Get Active Destinations - Supabase
- [ ] Find node
- [ ] Change credential to "Testing Branch - Supabase"

#### Node 3: Update Client and Travel Times - Supabase
- [ ] Find node
- [ ] Change credential to "Testing Branch - Supabase"

#### Node 4: Update Client (without travel times) - Supabase1
- [ ] Find node
- [ ] Change credential to "Testing Branch - Supabase"

- [ ] Click Save
- [ ] Re-export and verify changes

---

### ☐ Fix TEST - CLIENT - Get Single Client by K-Number.json **NEW!**

**Workflow**: Open in n8n

**Node to fix**: `Get Clinic - Supabase`

**Steps**:
1. [ ] Open workflow in n8n
2. [ ] Find node: "Get Clinic - Supabase"
3. [ ] Click on node
4. [ ] Change Credentials dropdown from "Supabase Service Role" to "Testing Branch - Supabase"
5. [ ] Click Save
6. [ ] Re-export and verify change

**Why this matters**: This workflow fetches the primary clinic for a client. If not fixed, it will show production clinic data mixed with test client data, causing confusion during testing.

---

## ⚠️ IMPORTANT FIXES (Frontend Compatibility)

### ☐ Fix TEST - APPT - Add Appointment copy.json

**Webhook Path Issue**: Path doesn't match frontend expectations

**Steps**:
1. [ ] Open workflow in n8n
2. [ ] Click on first node (Webhook node)
3. [ ] Change Path from "TEST-save-appointment" to "TEST-save-appointment-v7"
4. [ ] Click Save
5. [ ] Re-export workflow

---

### ☐ Fix TEST - APPT - HARD Delete Appointment copy.json

**Webhook Path Issue**: Path doesn't match frontend expectations

**Steps**:
1. [ ] Open workflow in n8n
2. [ ] Click on first node (Webhook node)
3. [ ] Change Path from "TEST-hard-delete-appointment" to "TEST-delete-appointment-with-calendar"
4. [ ] Click Save
5. [ ] Re-export workflow

---

## ✅ VERIFICATION

### ☐ Verify No Production Credentials Remain

**Command** (run in Git Bash or PowerShell):
```bash
cd "F:\GitHub\Repos\transport-admin-portal\testing\TEST Workflow Copies"
grep "Supabase Service Role" *.json
```

**Expected Result**: No output (empty)

**If any results appear**: There are still production credentials! Go back and fix them.

---

### ☐ Verify Webhook Paths

**Check these files**:
1. [ ] TEST - APPT - Add Appointment copy.json: Path should be "TEST-save-appointment-v7"
2. [ ] TEST - APPT - HARD Delete Appointment copy.json: Path should be "TEST-delete-appointment-with-calendar"

**Command**:
```bash
cd "F:\GitHub\Repos\transport-admin-portal\testing\TEST Workflow Copies"
grep "\"path\":" "TEST - APPT - Add Appointment copy.json"
grep "\"path\":" "TEST - APPT - HARD Delete Appointment copy.json"
```

**Expected Output**:
```
"path": "TEST-save-appointment-v7",
"path": "TEST-delete-appointment-with-calendar",
```

---

## 📤 IMPORT TO n8n

### ☐ All fixes complete - Ready to import!

**Import Order** (suggested):
1. [ ] Client workflows first (Get, Add, Update)
2. [ ] Appointment workflows (Page Data, Add, Update, Cancel, Delete, etc.)
3. [ ] Finance workflows (Invoice Status, Mark Paid)

**After import**:
- [ ] Activate all workflows
- [ ] Test each endpoint with frontend
- [ ] Monitor n8n execution logs for errors

---

## 🧪 TESTING CHECKLIST

After importing, test these features:

### Client Management
- [ ] Open TEST-clients-sl.html
- [ ] Quick edit client - set primary clinic
- [ ] View full profile - edit and save
- [ ] Verify data appears in Testing Branch Supabase

### Appointment Management
- [ ] Open TEST-appointments-sl.html
- [ ] Create new appointment
- [ ] Update appointment
- [ ] Cancel appointment
- [ ] Delete appointment (soft and hard)
- [ ] Verify no production data affected

### Finance Dashboard
- [ ] Open TEST-finance.html
- [ ] Update invoice status
- [ ] Mark driver paid
- [ ] Mark agent paid
- [ ] Verify data in Testing Branch Supabase

---

## 🚨 IF SOMETHING GOES WRONG

**STOP IMMEDIATELY** and:

1. Deactivate all TEST workflows in n8n
2. Check n8n execution logs
3. Verify which database was affected:
   - Testing Branch ✅ OK - continue testing
   - Production ❌ PROBLEM - document what changed, may need to rollback
4. Re-review this checklist
5. Fix issues before proceeding

---

**Checklist Created**: 2025-01-09
**Last Updated**: 2025-01-09 (added TEST - CLIENT - Get Single Client)
**Issues Found**: 3 critical (production risk), 2 important (path mismatch)
**Total Workflows**: 14 workflows reviewed
