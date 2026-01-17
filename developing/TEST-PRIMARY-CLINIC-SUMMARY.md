# TEST Environment - Primary Clinic Feature

## Overview
TEST environment for testing the Primary Clinic feature before deploying to production. All TEST files use Testing Branch Supabase database and TEST workflow endpoints.

---

## ✅ Completed Files

### Phase 1: Client Quick Edit

#### 1. TEST-client-modal.js
**Location**: `TEST-client-modal.js`

**Changes from production**:
- Added Primary Clinic dropdown field
- Loads clinics from `/webhook/clinic-locations`
- Uses `TEST-update-client` endpoint
- Saves `primary_clinic_id` field
- Visual "TEST MODE" badge in modal header

**Features**:
- Pre-selects existing primary clinic when editing
- Allows setting to "No Primary Clinic" (NULL)
- Dropdown populated with all active clinic locations

---

### 2. TEST-clients-sl.html
**Location**: `TEST-clients-sl.html`

**Changes from production**:
- Title: "🧪 TEST MODE - RRTS - Clients"
- Orange warning banner at top of page
- Loads `TEST-client-modal.js` instead of `client-modal.js`
- Uses `TEST-getActiveClients` endpoint
- Displays `primary_clinic_name` in client cards (with hospital icon)

**Visual Changes**:
- Warning banner: "🧪 TEST MODE - Primary Clinic Feature Testing"
- Client cards show primary clinic below emergency contact
- Format: 🏥 Primary Clinic: Halifax Clinic
- **NEW**: "View Profile (TEST)" button to navigate to full client profile

---

### Phase 2: Client Profile Page

#### 3. TEST-client-profile.html ✅
**Location**: `TEST-client-profile.html`

**Features**:
- Full client profile with all 29 fields from clients table
- Single-page scrolling form (NO tabs - simpler design)
- 6 organized sections:
  1. Basic Information (K-number, name, status, active checkbox)
  2. Contact Information (phone, email, emergency contacts)
  3. Primary Address (civic address, city, province, postal, map address)
  4. Secondary Address (optional - all secondary fields)
  5. **Preferences & Notes** (includes Primary Clinic dropdown!)
  6. System Information (OpenPhone sync, travel times - read-only)
- Orange TEST warning banner at top
- Uses TEST-get-client and TEST-update-client endpoints
- Sticky save/cancel buttons at bottom
- Role-based field permissions
- Navigable from "View Profile (TEST)" button in client list

**Primary Clinic Integration**:
- Dropdown in "Preferences & Notes" section
- Badge: "Primary Clinic Feature" next to label
- Pre-selects existing primary clinic
- Allows setting to "No Primary Clinic" (NULL)
- Saves to Testing database

---

#### 4. TEST-client-profile.js
**Location**: `TEST-client-profile.js`

**Features**:
- Complete page controller for client profile
- Loads client data from TEST-get-client endpoint
- Populates all 29 fields
- Fetches clinics and drivers for dropdowns
- Role-based permissions (admin vs booking_agent/supervisor)
- Saves via TEST-update-client endpoint
- Console logging for debugging
- Error handling and validation

**Key Functions**:
```javascript
loadClient(knumber)           // Fetch client from TEST-get-client
populateForm(client)          // Fill all form fields
applyRoleBasedPermissions()   // Make system fields read-only
saveClient()                  // Save via TEST-update-client
loadDropdownData()            // Load clinics and drivers
```

---

### Phase 3: Appointment Forms with Primary Clinic Pre-Selection

#### 5. TEST-add-appointments.html ✅
**Location**: `TEST-add-appointments.html`

**Changes from production**:
- Title: "🧪 TEST MODE - Add Appointments - RRTS"
- Orange TEST warning banner at top
- Uses `TEST-getActiveClients` endpoint
- Uses `TEST-save-appointment-v7` endpoint
- **Automatically pre-selects client's primary clinic when adding appointments**

**Primary Clinic Pre-Selection Logic**:
- When client is selected and has `primary_clinic_id`, the clinic dropdown automatically pre-selects that clinic
- Finds the destination by ID from the client's `primary_clinic_id`
- Sets `location`, `locationId`, and `locationAddress` automatically
- User can still change to a different clinic if needed

**Visual Changes**:
- TEST warning banner: "🧪 TEST MODE - Add Appointments - Primary Clinic Pre-Selection Testing"
- Console logging for debugging primary clinic selection

---

#### 6. TEST-appointments-bulk-add.html ✅
**Location**: `TEST-appointments-bulk-add.html`

**Changes from production**:
- Title: "🧪 TEST MODE - Bulk Add Appointments - RRTS"
- Orange TEST warning banner (fixed position, 40px height)
- Header adjusted to `top: 40px` to accommodate banner
- Body padding adjusted to `130px` (40px banner + 70px header + 20px)
- Uses `TEST-getActiveClients` endpoint
- Uses `TEST-save-appointment-v7` endpoint
- **First appointment automatically pre-selects client's primary clinic**

**Primary Clinic Pre-Selection Logic**:
- When adding the FIRST appointment for a client with `primary_clinic_id`, automatically pre-selects that clinic
- Subsequent appointments inherit the clinic from the previous appointment (natural bulk add behavior)
- Finds destination by ID and sets `initialClinic` variable
- Sets `location`, `locationId`, and `locationAddress` automatically

**Visual Changes**:
- TEST warning banner: "🧪 TEST MODE - Bulk Add Appointments - Primary Clinic Pre-Selection Testing"
- Console logging for debugging

---

### Phase 0: Core Workflow Fixes

#### 7. CLIENT - Get Single Client by K-Number.json (FIXED)
**Location**: `workflows/clients/CLIENT - Get Single Client by K-Number.json`

**Critical Fixes**:
- ✅ Added JWT Validation (nodes 2-5)
- ✅ Fixed Supabase operations (no more `executeQuery`)
- ✅ Implements multi-node JOIN pattern for primary clinic data

**How it works**:
1. Webhook receives GET request with `?knumber=K123`
2. JWT validation
3. Get client from Supabase (operation: "get")
4. Check if `primary_clinic_id` exists
5. If exists, get clinic from destinations table
6. Merge clinic data into client response
7. Returns client with `primary_clinic_name`, `primary_clinic_address`, `primary_clinic_city`

---

#### 8. CLAUDE.md (UPDATED)
**Location**: `CLAUDE.md`

**Added Documentation**:
- Supabase node limitations section
- Documents that `executeQuery` is NOT supported
- Documents that SQL JOINs require multi-node pattern
- Provides code examples

**Key Limitation**:
```
❌ `executeQuery` operation NOT SUPPORTED in n8n Supabase nodes
❌ SQL JOINs NOT SUPPORTED directly
✅ Use multi-node pattern: Get → Check → Get Related → Merge
```

---

#### 9. TEST-API-ENDPOINTS-NEEDED.md
**Location**: `TEST-API-ENDPOINTS-NEEDED.md`

**Documents Required Endpoints**:
- TEST-new-client (✅ Created by user)
- TEST-update-client (✅ Created by user)
- TEST-get-client (needs to be created)
- TEST-getActiveClients (✅ Created by user)

---

## 🔄 Active TEST Endpoints

### Created by User:
1. **TEST-new-client**
   - URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-new-client`
   - Status: ✅ Active
   - Purpose: Create clients with `primary_clinic_id`

2. **TEST-update-client**
   - URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-update-client`
   - Status: ✅ Active
   - Purpose: Update clients with `primary_clinic_id`
   - Used by: TEST-client-modal.js

3. **TEST-getActiveClients**
   - URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-getActiveClients`
   - Status: ✅ Active
   - Purpose: Get all active clients with `primary_clinic_name`
   - Used by: TEST-clients-sl.html

4. **TEST-get-client**
   - URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-get-client`
   - Status: ✅ Active (Created by user!)
   - Purpose: Get single client with full primary clinic details
   - Used by: TEST-client-profile.html

5. **TEST-save-appointment-v7**
   - URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-save-appointment-v7`
   - Status: ⏳ Needs to be created
   - Purpose: Save appointments to Testing Branch database
   - Used by: TEST-add-appointments.html, TEST-appointments-bulk-add.html
   - Note: Should be a copy of save-appointment-v7 workflow using Testing Branch Supabase credential

---

## 📋 Testing Checklist

### Phase 1: Client Quick Edit Modal (Ready to Test!)

**Test on**: `TEST-clients-sl.html`

- [ ] Open TEST-clients-sl.html in browser
- [ ] Verify orange WARNING banner appears at top
- [ ] Verify client list loads from TEST database
- [ ] Click "Quick Edit" on a client
- [ ] Verify "Primary Clinic" dropdown appears (with 🔄 NEW badge)
- [ ] Verify dropdown is populated with clinic locations
- [ ] Select a primary clinic and save
- [ ] Verify client card now shows "🏥 Primary Clinic: [Clinic Name]"
- [ ] Edit same client again, verify dropdown shows selected clinic
- [ ] Change to "No Primary Clinic" and save
- [ ] Verify primary clinic removed from client card

### Phase 2: Client Profile Page (Ready to Test!)

**Test on**: `TEST-client-profile.html`

- [ ] Open TEST-clients-sl.html
- [ ] Click "View Profile (TEST)" button on any client
- [ ] Verify TEST-client-profile.html loads
- [ ] Verify orange WARNING banner at top
- [ ] Verify all 29 fields populate correctly
- [ ] Scroll to "Preferences & Notes" section
- [ ] Verify "Primary Clinic" dropdown with badge
- [ ] Verify dropdown shows existing primary clinic (if set)
- [ ] Change primary clinic to different clinic and save
- [ ] Verify success message: "✅ Client saved successfully to TEST database!"
- [ ] Verify page reloads with updated primary clinic
- [ ] Change to "No Primary Clinic" and save
- [ ] Verify primary clinic cleared
- [ ] Test Cancel button (should prompt for confirmation)
- [ ] Verify System Information fields are read-only
- [ ] Test with different user roles (booking_agent, supervisor, admin)

### Phase 3: Appointment Forms (Ready to Test!)

**Test on**: `TEST-add-appointments.html`, `TEST-appointments-bulk-add.html`

**Single Appointment Form (TEST-add-appointments.html)**:
- [ ] Open TEST-add-appointments.html in browser
- [ ] Verify orange TEST warning banner at top
- [ ] Select a client WITH primary clinic set
- [ ] Verify clinic dropdown automatically pre-selects the client's primary clinic
- [ ] Verify location address is auto-populated
- [ ] Verify user can still change to a different clinic
- [ ] Add appointment details (date, time, etc.)
- [ ] Save appointment
- [ ] Verify appointment saves to TEST database with selected clinic
- [ ] Test with a client WITHOUT primary clinic (should show empty dropdown)
- [ ] Verify console logs show "[TEST Add Appointments] Pre-selecting primary clinic..."

**Bulk Add Form (TEST-appointments-bulk-add.html)**:
- [ ] Open TEST-appointments-bulk-add.html in browser
- [ ] Verify orange TEST warning banner appears ABOVE the header
- [ ] Select a client WITH primary clinic set
- [ ] Verify FIRST appointment automatically pre-selects the client's primary clinic
- [ ] Click "Add Appointment" to add a second appointment
- [ ] Verify second appointment inherits clinic from first (natural bulk behavior)
- [ ] Change clinic on second appointment
- [ ] Add a third appointment
- [ ] Verify third appointment inherits clinic from second (changed clinic)
- [ ] Fill in all appointment details
- [ ] Save all appointments
- [ ] Verify all appointments save to TEST database
- [ ] Test with a client WITHOUT primary clinic (should show empty for first)
- [ ] Verify console logs show "[TEST Bulk Add] Pre-selecting primary clinic for first appointment..."

---

## 🚀 Next Steps

### Phase 1 & 2 (Ready Now):
1. **Quick Edit Modal Testing**:
   - Open `TEST-clients-sl.html` in browser
   - Click "Quick Edit" on any client
   - Select a primary clinic and save
   - Verify it appears in client card

2. **Full Profile Page Testing**:
   - On `TEST-clients-sl.html`, click "View Profile (TEST)"
   - Edit all client fields including primary clinic
   - Save and verify changes persist
   - Test with different user roles

### Phase 3 (Completed! ✅):
1. **TEST-add-appointments.html** - Single appointment creation with primary clinic pre-select ✅
2. **TEST-appointments-bulk-add.html** - Bulk appointments with primary clinic pre-select ✅
3. **NOTE**: Requires TEST-save-appointment-v7 endpoint to be created (copy of save-appointment-v7 with Testing Branch credential)

---

## 📁 File Structure

```
transport-admin-portal/
├── TEST-client-modal.js                   ✅ Phase 1
├── TEST-clients-sl.html                   ✅ Phase 1 (updated with View Profile button)
├── TEST-client-profile.html               ✅ Phase 2
├── TEST-client-profile.js                 ✅ Phase 2
├── TEST-add-appointments.html             ✅ Phase 3 - NEW!
├── TEST-appointments-bulk-add.html        ✅ Phase 3 - NEW!
├── TEST-API-ENDPOINTS-NEEDED.md           ✅ Documentation
├── TEST-PRIMARY-CLINIC-SUMMARY.md         ✅ This file (updated v3.0.0)
│
├── workflows/clients/
│   └── CLIENT - Get Single Client by K-Number.json  ✅ Fixed
│
├── docs/implementation/
│   ├── PRIMARY-CLINIC-IMPLEMENTATION-GUIDE.md  ✅ Backend guide
│   └── CLIENT-PROFILE-PAGE-IMPLEMENTATION-GUIDE.md  ✅ Frontend guide
│
├── docs/workflows/
│   ├── UPDATE-CLIENT-ADD-WORKFLOW-PRIMARY-CLINIC.md  ✅ Workflow instructions
│   └── UPDATE-CLIENT-UPDATE-WORKFLOW-PRIMARY-CLINIC.md  ✅ Workflow instructions
│
└── database/migrations/
    └── 001_add_primary_clinic_to_clients.sql  ✅ Database schema
```

---

## 🔧 Troubleshooting

### Issue: Client list doesn't load
**Check**:
- Is TEST-getActiveClients endpoint active in n8n?
- Is it using "Testing Branch - Supabase" credential?
- Check browser console for authentication errors

### Issue: Primary clinic dropdown is empty
**Check**:
- Is `/webhook/clinic-locations` endpoint responding?
- Check browser console for API errors
- Verify TEST-client-modal.js is loaded (not client-modal.js)

### Issue: Primary clinic doesn't save
**Check**:
- Is TEST-update-client endpoint active?
- Does it include `primary_clinic_id` in the Supabase UPDATE columns?
- Check n8n execution logs for errors

### Issue: Primary clinic shows ID instead of name
**Check**:
- Does TEST-getActiveClients workflow include LEFT JOIN with destinations?
- Does it return `primary_clinic_name` field?
- Check the workflow SQL query

---

## 🎯 Success Criteria

Before moving to production, verify:

**Phase 1 & 2 (Current):**
1. ✅ Client Quick Edit saves primary clinic to Testing database
2. ✅ Client list displays primary clinic name correctly
3. ✅ Can set primary clinic to NULL (no primary clinic)
4. ✅ Invalid clinic IDs rejected by database (foreign key constraint)
5. ✅ Client profile page displays and edits primary clinic
6. ✅ All TEST pages clearly marked with warning banners
7. ✅ No data written to production database during testing
8. ✅ Navigation between client list and profile works

**Phase 3 (Completed):**
9. ✅ Appointment forms pre-select client's primary clinic
10. ✅ Bulk appointment creation uses primary clinic for first appointment
11. ⏳ TEST-save-appointment-v7 endpoint created and active

---

**Version**: 3.0.0
**Created**: 2025-01-09
**Updated**: 2025-01-09
**Status**: Phases 1, 2 & 3 Complete - Ready for Full Testing!
**Pending**: TEST-save-appointment-v7 endpoint creation
