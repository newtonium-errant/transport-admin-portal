# TEST API Endpoints Required

## Purpose
This document lists all n8n workflow TEST endpoints needed for the Primary Clinic feature testing environment.

---

## Already Created by User

✅ **TEST-new-client**
- URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-new-client`
- Purpose: Create new client with primary_clinic_id field
- Used by: TEST-clients-sl.html (Add Client modal)

✅ **TEST-update-client**
- URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-update-client`
- Purpose: Update existing client including primary_clinic_id field
- Used by: TEST-client-modal.js (Quick Edit modal)

---

## Still Needed from User

### 1. TEST-get-client
❌ **Not yet created**
- URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-get-client`
- Purpose: Get single client by K-number WITH primary_clinic_name field
- SQL Query should include LEFT JOIN with destinations table
- **Used by**:
  - TEST-client-profile.html (Client Profile Page)
- **Expected Response**:
```json
{
  "success": true,
  "client": {
    "knumber": "K7807878",
    "firstname": "Andrew",
    "lastname": "Newton",
    "primary_clinic_id": 1,
    "primary_clinic_name": "Halifax Clinic",
    "primary_clinic_address": "123 Main St",
    "primary_clinic_city": "Halifax",
    ... (all other client fields)
  }
}
```
- **Instructions**: Use the already-created workflow at `workflows/clients/CLIENT - Get Single Client by K-Number.json`, duplicate it, rename to TEST version, and change Supabase credential to "Testing Branch - Supabase"

### 2. TEST-getActiveClients
❌ **Not yet created**
- URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-getActiveClients`
- Purpose: Get all active clients WITH primary_clinic_name for each
- SQL Query should include LEFT JOIN with destinations table
- **Used by**:
  - TEST-clients-sl.html (Client List Page)
  - TEST-add-appointments.html (Appointment creation)
  - TEST-appointments-bulk-add.html (Bulk appointment creation)
- **Expected Response**:
```json
{
  "success": true,
  "clients": [
    {
      "knumber": "K7807878",
      "firstname": "Andrew",
      "lastname": "Newton",
      "primary_clinic_id": 1,
      "primary_clinic_name": "Halifax Clinic",
      "active": true,
      ... (other fields)
    }
  ]
}
```
- **Instructions**: Duplicate existing `getActiveClients` workflow, modify SELECT query to add LEFT JOIN with destinations table:
```sql
SELECT
  c.*,
  d.name as primary_clinic_name
FROM clients c
LEFT JOIN destinations d ON c.primary_clinic_id = d.id
WHERE c.active = true
ORDER BY c.lastname, c.firstname
```

---

## Optional (Nice to Have for Complete Testing)

### 3. TEST-clinic-locations
⚠️ **Optional** - Can use production endpoint for testing
- URL: `https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-clinic-locations`
- Purpose: Get all clinic locations (destinations table)
- Used by: All TEST pages for primary clinic dropdown
- **Note**: Clinic locations table doesn't change often, so using production endpoint is safe. Only create TEST version if you want complete isolation.

---

## Summary of Required Actions

### User Must Create:
1. **TEST-get-client** - Duplicate `CLIENT - Get Single Client by K-Number.json` workflow
   - Change credential to "Testing Branch - Supabase"
   - Webhook path: `/TEST-get-client`
   - Already includes the LEFT JOIN for primary_clinic_name

2. **TEST-getActiveClients** - Duplicate existing `getActiveClients` workflow
   - Change credential to "Testing Branch - Supabase"
   - Modify SQL SELECT to add `d.name as primary_clinic_name` and LEFT JOIN
   - Webhook path: `/TEST-getActiveClients`

### Then I Will Create:
- TEST-clients-sl.html (uses TEST-getActiveClients)
- TEST-client-profile.html (uses TEST-get-client and TEST-update-client)
- TEST-add-appointments.html (uses TEST-getActiveClients)
- TEST-appointments-bulk-add.html (uses TEST-getActiveClients)

---

## Testing Flow

1. User creates the 2 required TEST workflow duplicates in n8n
2. I create the TEST HTML pages that call these endpoints
3. User opens TEST pages in browser
4. User can add/edit clients with primary_clinic_id
5. User can verify primary clinic pre-selects in appointment forms
6. All data goes to Testing Branch Supabase database
7. Production data remains untouched

---

**Created**: 2025-01-09
**Status**: Waiting for user to create TEST-get-client and TEST-getActiveClients workflows
