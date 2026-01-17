# 🚨 CRITICAL ISSUES REPORT - TEST Workflows
**Date**: 2025-01-09
**Severity**: HIGH - PRODUCTION DATA AT RISK

---

## ⚠️ EXECUTIVE SUMMARY

**3 workflows** contain **PRODUCTION database credentials** that will **READ/WRITE TO PRODUCTION DATABASE** if executed. These must be fixed immediately before testing.

---

## 🔴 CRITICAL ISSUES (Must Fix Before Testing)

### 1. TEST - APPT - Update Appointment copy.json

**File**: `TEST - APPT - Update Appointment copy.json`

**Issue**: 1 Supabase node using production credentials

**Affected Node**:
- **Node Name**: `Update Appt After Calendar Delete - Supabase`
- **Line**: 811
- **Current Credential**: `"Supabase Service Role"` ❌
- **Should Be**: `"Testing Branch - Supabase"` ✅
- **Risk Level**: HIGH - This node WRITES to database when deleting calendar events

**Fix Required**:
```json
// Change line 811 from:
"name": "Supabase Service Role"

// To:
"name": "Testing Branch - Supabase"
```

---

### 2. TEST - CLIENT - Update Client.json

**File**: `TEST - CLIENT - Update Client.json`

**Issue**: 4 Supabase nodes using production credentials (0 test credentials!)

**⚠️ DANGER**: This workflow has **NO TEST credentials** - it will write **ONLY to production database**!

**Affected Nodes**:

1. **Node**: `Get Current Client - Supabase`
   - **Line**: 160
   - **Risk**: MEDIUM - Reads from production (less dangerous but incorrect)
   - **Fix**: Change to `"Testing Branch - Supabase"`

2. **Node**: `Get Active Destinations - Supabase`
   - **Line**: 270
   - **Risk**: MEDIUM - Reads from production
   - **Fix**: Change to `"Testing Branch - Supabase"`

3. **Node**: `Update Client and Travel Times - Supabase`
   - **Line**: 401
   - **Risk**: 🔴 **CRITICAL** - **WRITES to production database!**
   - **Fix**: Change to `"Testing Branch - Supabase"`

4. **Node**: `Update Client (without travel times) - Supabase1`
   - **Line**: 511
   - **Risk**: 🔴 **CRITICAL** - **WRITES to production database!**
   - **Fix**: Change to `"Testing Branch - Supabase"`

---

### 3. TEST - CLIENT - Get Single Client by K-Number.json

**File**: `TEST - CLIENT - Get Single Client by K-Number.json`

**Issue**: 1 Supabase node using production credentials

**⚠️ NEW WORKFLOW ADDED** - Contains mixed credentials!

**Affected Node**:

1. **Node**: `Get Clinic - Supabase`
   - **Line**: 340-347
   - **Current Credential**: `"Supabase Service Role"` ❌ **PRODUCTION!**
   - **Should Be**: `"Testing Branch - Supabase"` ✅
   - **Risk**: MEDIUM - This node READS from production destinations table
   - **Impact**: Will show production clinic data mixed with test client data

**Correct Nodes** (already using test credentials):
- ✅ `Get Client - Supabase` (line 209): Uses "Testing Branch - Supabase" (correct!)

**Fix Required**:
```json
// Change line 344-346 from:
"credentials": {
  "supabaseApi": {
    "id": "SEqiOYHTdU9Hm0pI",
    "name": "Supabase Service Role"
  }
}

// To:
"credentials": {
  "supabaseApi": {
    "id": "pHAY0PSxRTkwJnPE",
    "name": "Testing Branch - Supabase"
  }
}
```

**Why This Matters**:
This workflow fetches the client from Testing Branch (correct) but then fetches the primary clinic from PRODUCTION (wrong). This means:
- Client data will be from test database ✅
- But clinic/destination data will be from production ❌
- Mixed data can cause confusion during testing

---

## ✅ VERIFIED SAFE WORKFLOWS

These workflows correctly use ONLY "Testing Branch - Supabase" credentials:

| Workflow | Test Credentials | Production Credentials | Status |
|----------|-----------------|----------------------|--------|
| TEST - APPT - Cancel Appointment copy.json | 3 | 0 | ✅ SAFE |
| TEST - APPT - Get ALL Appointments (Historic Data) copy.json | 2 | 0 | ✅ SAFE |
| TEST - APPT - Get Appointments Page Data copy.json | 3 | 0 | ✅ SAFE |
| TEST - APPT - HARD Delete Appointment copy.json | 3 | 0 | ✅ SAFE |
| TEST - APPT - Soft Delete Appointment copy.json | 1 | 0 | ✅ SAFE |
| TEST - APPT - Unarchive Appointment copy.json | 1 | 0 | ✅ SAFE |
| TEST - CLIENT - Add New Client.json | 3 | 0 | ✅ SAFE |
| TEST - CLIENT - Get Active Clients copy.json | 1 | 0 | ✅ SAFE |
| TEST - FIN - Mark Booking Agent Paid.json | 1 | 0 | ✅ SAFE |
| TEST - FIN - Mark Driver Paid.json | 1 | 0 | ✅ SAFE |
| TEST - FIN - Update Invoice Status.json | 2 | 0 | ✅ SAFE |

---

## ⚠️ WEBHOOK PATH MISMATCHES

**UPDATED**: New workflows added, but webhook paths don't match frontend expectations!

### 1. TEST - APPT - Add Appointment copy.json

✅ **Credentials**: SAFE - Uses "Testing Branch - Supabase" (1 node)
❌ **Webhook Path**: MISMATCH

- **Current Path**: `TEST-save-appointment`
- **Frontend Expects**: `TEST-save-appointment-v7`
- **Used By**: `TEST-appointments-sl.js` (line 2201)
- **Impact**: Appointment saving will return 404 error

**Fix**: Change webhook path from `TEST-save-appointment` to `TEST-save-appointment-v7`

### 2. TEST - APPT - HARD Delete Appointment copy.json

✅ **Credentials**: SAFE - Uses "Testing Branch - Supabase" (3 nodes)
❌ **Webhook Path**: MISMATCH

- **Current Path**: `TEST-hard-delete-appointment`
- **Frontend Expects**: `TEST-delete-appointment-with-calendar`
- **Used By**: `TEST-appointments-sl.js` (line 2015)
- **Impact**: Hard delete operations will return 404 error

**Fix**: Change webhook path from `TEST-hard-delete-appointment` to `TEST-delete-appointment-with-calendar`

---

## 🔧 FIX INSTRUCTIONS

### Step 1: Fix TEST - APPT - Update Appointment copy.json

1. Open workflow in n8n
2. Find node: `Update Appt After Calendar Delete - Supabase`
3. Click on the node
4. In the Credentials dropdown, change from `Supabase Service Role` to `Testing Branch - Supabase`
5. Save workflow

### Step 2: Fix TEST - CLIENT - Update Client.json

This workflow needs **4 nodes updated**:

1. Open workflow in n8n
2. Update each of these nodes' credentials:
   - `Get Current Client - Supabase`
   - `Get Active Destinations - Supabase`
   - `Update Client and Travel Times - Supabase`
   - `Update Client (without travel times) - Supabase1`
3. For each node: Change credential from `Supabase Service Role` to `Testing Branch - Supabase`
4. Save workflow

### Step 3: Fix Webhook Path Mismatches

**Fix workflow**: TEST - APPT - Add Appointment copy.json
1. Open workflow in n8n
2. Click on the first node (Webhook node)
3. Change Path from `TEST-save-appointment` to `TEST-save-appointment-v7`
4. Save workflow

**Fix workflow**: TEST - APPT - HARD Delete Appointment copy.json
1. Open workflow in n8n
2. Click on the first node (Webhook node)
3. Change Path from `TEST-hard-delete-appointment` to `TEST-delete-appointment-with-calendar`
4. Save workflow

### Step 4: Verify All Fixes

After fixing, verify no production credentials remain:

```bash
cd "F:\GitHub\Repos\transport-admin-portal\testing\TEST Workflow Copies"
grep "Supabase Service Role" *.json
```

**Should return**: NO results (empty)

---

## ⚠️ IMPORTANT NOTES

### About External API Credentials

You mentioned:
> "Google maps, google calendar, and openphone api access still needs to use production credentials."

**This is CORRECT and EXPECTED** ✅

- Google Calendar: Uses production credentials to write to test driver's calendar
- Google Maps: Uses production API for distance calculations
- OpenPhone: Uses production API for SMS (but should only send to test phone numbers)

These are external services, not your database, so using production credentials here is fine.

### About Test Driver

You mentioned:
> "The only driver that the testing data will have access to is the test driver copied from production data."

**This is good practice** ✅ - Make sure the test driver's calendar ID is valid in production Google Calendar.

---

## 🎯 ACTION REQUIRED

**BEFORE IMPORTING THESE WORKFLOWS TO n8n:**

### Critical (Must Fix - Production Risk)
1. ❌ Fix 1 node in `TEST - APPT - Update Appointment copy.json` (Supabase credential)
2. ❌ Fix 4 nodes in `TEST - CLIENT - Update Client.json` (Supabase credentials)
3. ❌ Fix 1 node in `TEST - CLIENT - Get Single Client by K-Number.json` (Supabase credential) **NEW!**

### Important (Must Fix - Frontend Errors)
4. ⚠️ Fix webhook path in `TEST - APPT - Add Appointment copy.json`
5. ⚠️ Fix webhook path in `TEST - APPT - HARD Delete Appointment copy.json`

**DO NOT activate these workflows in n8n until fixes are complete!**

---

## 📊 SUMMARY

| Status | Count | Risk Level | Details |
|--------|-------|-----------|---------|
| 🔴 Critical Issues | 3 workflows (6 nodes) | HIGH | Will read/write to PRODUCTION database |
| ⚠️ Path Mismatches | 2 workflows | MEDIUM | Will return 404 errors, features won't work |
| ✅ Safe Workflows | 11 workflows | None | All use correct test credentials |

**Total Workflows Checked**: 14 workflows

**Risk Assessment**:
- **Production Data Risk**: 3 workflows will read/write to production if not fixed
- **Functionality Risk**: 2 workflows have wrong paths, will cause 404 errors
- **Safe to Import**: 11 workflows ready to use immediately

---

**Report Generated**: 2025-01-09
**Reviewer**: Claude Code
**Next Action**: Fix 2 workflows before importing to n8n
