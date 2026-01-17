# Workflow Fix: Removed executeQuery ⚠️

## Issue

Supabase nodes in n8n **do not support** the `executeQuery` operation. The original "TEST - FIN - Create Invoice" workflow used `executeQuery` for:
1. Getting multiple appointments by ID array
2. Calculating totals with SQL SUM()
3. Calling `generate_invoice_number()` function

## Solution

Created **v2 workflows** that use ONLY basic Supabase operations:
- `get` - Get single record
- `getAll` - Get multiple records
- `create` - Insert record
- `update` - Update record
- `delete` - Delete record

---

## ✅ Fixed Workflows - USE THESE

### 1. TEST - FIN - Create Invoice v2.json ✅ **NEW**
**File:** `developing/TEST Workflow Copies/TEST - FIN - Create Invoice v2.json`

**Changes from v1:**
- ❌ **Removed:** `executeQuery` to get appointments by ID array
- ✅ **Added:** Split IDs in Code node → Loop through `get` for each appointment
- ❌ **Removed:** `executeQuery` with SUM() to calculate totals
- ✅ **Added:** Calculate totals in Code node after fetching appointments
- ❌ **Removed:** `executeQuery` to call `generate_invoice_number()` function
- ✅ **Added:** Get latest invoice → Parse number → Increment in Code node → Insert with new number

**How it works now:**
1. JWT validation ✓
2. Validate input & split appointment IDs into separate items
3. **Loop:** Get each appointment individually using `get` operation
4. Merge all appointments in Code node
5. Validate same client + all status='ready'
6. **Calculate totals in Code node** (sum all custom_rate values)
7. Get latest invoice using `getAll` with limit=1, sorted by date DESC
8. **Generate next invoice number** in Code node (parse INV-0001 → increment → INV-0002)
9. Insert invoice using `create` operation
10. Update all appointments using `update` operation (loops automatically)
11. Return success response

**Endpoint:** `POST /webhook/TEST-create-invoice` (same as before)

---

### 2. TEST - FIN - Get Invoices.json ✅ **NO CHANGES NEEDED**
**File:** `developing/TEST Workflow Copies/TEST - FIN - Get Invoices.json`

**Status:** Already uses basic operations only - no executeQuery

---

### 3. TEST - FIN - Update Invoice Status.json ✅ **NO CHANGES NEEDED**
**File:** `developing/TEST Workflow Copies/TEST - FIN - Update Invoice Status.json`

**Status:** Already uses basic operations only - no executeQuery

---

### 4. TEST - FIN - Void Invoice.json ✅ **NO CHANGES NEEDED**
**File:** `developing/TEST Workflow Copies/TEST - FIN - Void Invoice.json`

**Status:** Already uses basic operations only - no executeQuery

---

### 5. TEST - Get App Config.json ✅ **NO CHANGES NEEDED**
**File:** `developing/TEST Workflow Copies/TEST - Get App Config.json`

**Status:** Already uses basic operations only - no executeQuery

---

## 📦 Workflows to Import (Updated List)

Import these **5 workflows** to n8n Testing Branch:

1. ✅ **TEST - FIN - Create Invoice v2.json** ← **Use v2, not v1!**
2. ✅ **TEST - FIN - Get Invoices.json**
3. ✅ **TEST - FIN - Update Invoice Status.json**
4. ✅ **TEST - FIN - Void Invoice.json**
5. ✅ **TEST - Get App Config.json**

---

## ⚠️ Important Notes

### Invoice Numbering

The original workflow used a PostgreSQL sequence + function:
```sql
CREATE SEQUENCE invoice_number_seq START 1;
CREATE FUNCTION generate_invoice_number() RETURNS TEXT ...
```

**v2 approach:**
- Sequence still exists in database (from migration 11)
- But we don't call the function directly
- Instead: Query latest invoice → Increment number in Code node

**Why:**
- n8n Supabase node can't call stored functions
- Code node approach is more portable
- Result is identical: INV-0001, INV-0002, etc.

**Concurrency concern:**
- If two invoices are created simultaneously, there's a small risk of duplicate numbers
- In practice, unlikely for your use case (single user creating invoices)
- If needed later, can add database UNIQUE constraint check + retry logic

### Performance

**v1 (executeQuery):**
- 1 query to get all appointments
- 1 query to calculate totals
- 1 query to insert invoice
- Faster, but not supported

**v2 (basic operations):**
- N queries to get N appointments (loops automatically in n8n)
- Totals calculated in Code node
- 1 query to get latest invoice
- 1 query to insert new invoice
- Slightly slower, but fully supported

**For typical use (3-10 appointments per invoice):** Negligible difference, maybe +100-200ms

---

## 🧪 Testing the v2 Workflow

After importing **TEST - FIN - Create Invoice v2**, test with:

**Request:**
```bash
POST https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-create-invoice
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "appointmentIds": [123, 124, 125],
  "invoiceDate": "2025-11-26",
  "notes": "Test invoice"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Invoice created successfully",
  "data": {
    "invoice": {
      "id": "uuid",
      "invoiceNumber": "INV-0001",
      "knumber": "K6340996",
      "invoiceStatus": "created",
      "invoiceDate": "2025-11-26",
      "invoiceSubtotal": 450.00,
      "invoiceTax": 63.00,
      "invoiceTotal": 513.00,
      "appointmentCount": 3,
      "qboSyncStatus": "pending",
      "notes": "Test invoice"
    }
  }
}
```

---

## 📋 Updated Deployment Checklist

- [x] ~~Step 1: Run SQL config~~ ✅ **DONE** (you confirmed)
- [x] ~~Step 2: Import 5 workflows to n8n~~ ✅ **DONE**
  - [x] **TEST - FIN - Create Invoice v2.json** ← **v2, not v1!**
  - [x] TEST - FIN - Get Invoices.json
  - [x] TEST - FIN - Update Invoice Status.json
  - [x] TEST - FIN - Void Invoice.json
  - [x] TEST - Get App Config.json (was already active)
- [x] ~~Step 3: Activate all 5 workflows~~ ✅ **DONE**
- [x] ~~Step 4: Fix JWT validation~~ ✅ **DONE** - Updated all workflows to use `_route` pattern
- [ ] Step 5: Create test data (run `developing/sql/create_test_invoice_data.sql`)
- [ ] Step 6: Test invoice creation in UI

---

## 🔧 JWT Validation Fix (2025-11-27)

**Issue:** New workflows were using different JWT validation pattern than existing workflows
- New workflows returned: `{ jwtValid: 'true'/'false' }`
- Existing workflows return: `{ _route: 'authorized'/'unauthorized' }`
- Switch nodes were checking for wrong field names

**Solution:** Updated JWT validation code in all 3 new workflows to match existing pattern:
- TEST - FIN - Get Invoices.json ✅
- TEST - FIN - Create Invoice v2.json ✅
- TEST - FIN - Update Invoice Status.json ✅

**Result:** JWT validation now passes, workflows execute correctly

---

Last Updated: 2025-11-27
Status: Workflows imported, JWT validation fixed, ready for testing
