# Batch Fix: Unauthorized Response Format in Finance Workflows

**Date:** 2026-03-18 (updated 2026-03-20)
**Scope:** 15 finance workflows in n8n UI
**Priority:** High — non-standard response format causes frontend nullref errors
**Estimated time:** 15-20 minutes (identical change in each workflow)

## Progress Checklist

Check off each workflow after applying the fix in the n8n UI and verifying the response:

### Group A — Nested `error` object → standard format (13 workflows)

- [ ] FIN - Submit Payroll (`submit-payroll`)
- [ ] FIN - Mark Driver Paid v2 (`mark-driver-paid`)
- [ ] FIN - Mark Booking Agent Paid v2 (`mark-agent-paid`)
- [ ] FIN - Get Staff Mileage (`get-staff-mileage`)
- [ ] FIN - Add Staff Mileage (`add-staff-mileage`)
- [ ] FIN - Delete Staff Mileage (`delete-staff-mileage`)
- [ ] FIN - Complete Appointment (`complete-appointment`)
- [ ] FIN - Get Finance Page Data (`get-finance-appointments`)
- [ ] FIN - Create Invoice (`create-invoice`)
- [ ] FIN - Get Invoices (`get-invoices-v5`)
- [ ] FIN - Update Invoice Status v2 (`update-invoice-status-v2`)
- [ ] FIN - Void Invoice (`void-invoice`)
- [ ] FIN - Get App Config (`get-app-config`)

### Group A-partial — Already partially fixed, needs `data: {}` only (1 workflow)

- [ ] FIN - Approve Appointments (`mark-appointment-ready`) — **see `FIN-FIX-APPROVE-WORKFLOW-REMAINING.md` for this workflow's complete fix** (includes removing `operation_status` filter in addition to the unauthorized response fix)

### Group B — Flat message but missing `data` field (1 workflow)

- [ ] FIN - Unapprove Appointments (`unapprove-appointments`)

## Problem

All 15 v2 finance workflows have an "Unauthorized Response - Code" node that returns a non-standard response format. The frontend `APIClient` expects `{ success, message, data, timestamp }` at the top level. The current code nests `message` inside an `error` object, causing `response.message` to be `undefined` on the frontend when a 401/403 occurs.

## Affected Workflows (15 total)

### Group A — Nested `error` object (13 workflows, identical fix)

| # | Workflow Name | Webhook Path | Live Status (2026-03-20) |
|---|---------------|--------------|--------------------------|
| 1 | FIN - Submit Payroll | `submit-payroll` | Unfixed (nested error, HTTP 200) |
| 2 | FIN - Mark Driver Paid v2 | `mark-driver-paid` | Unfixed (nested error, HTTP 200) |
| 3 | FIN - Mark Booking Agent Paid v2 | `mark-agent-paid` | Unfixed (nested error, HTTP 200) |
| 4 | FIN - Get Staff Mileage | `get-staff-mileage` | Unfixed (nested error, HTTP 200) |
| 5 | FIN - Add Staff Mileage | `add-staff-mileage` | Unfixed (nested error, HTTP 200) |
| 6 | FIN - Delete Staff Mileage | `delete-staff-mileage` | Unfixed (nested error, HTTP 200) |
| 7 | FIN - Complete Appointment | `complete-appointment` | Unfixed (nested error, HTTP 200) |
| 8 | FIN - Get Finance Page Data | `get-finance-appointments` | Unfixed (nested error, HTTP 200) |
| 9 | FIN - Create Invoice | `create-invoice` | Unfixed (nested error, HTTP 200) |
| 10 | FIN - Get Invoices | `get-invoices-v5` | Unfixed (nested error, HTTP 200) |
| 11 | FIN - Update Invoice Status v2 | `update-invoice-status-v2` | Unfixed (nested error, HTTP 200) |
| 12 | FIN - Void Invoice | `void-invoice` | Unfixed (nested error, HTTP 200) |
| 13 | FIN - Get App Config | `get-app-config` | Unfixed (nested error, HTTP 200) |

### Group A-partial — Already partially fixed in live n8n (1 workflow)

| # | Workflow Name | Webhook Path | Live Status (2026-03-20) |
|---|---------------|--------------|--------------------------|
| 14 | FIN - Approve Appointments | `mark-appointment-ready` | Partially fixed (flat message, HTTP 401, but missing `data: {}`) |

> **Note:** Approve Appointments was partially fixed in the n8n UI on 2026-03-11. The live node has flat `message` format and returns proper HTTP 401, but is missing the `data: {}` field. This workflow also has a separate issue (operation_status filter). See **`FIN-FIX-APPROVE-WORKFLOW-REMAINING.md`** for the complete fix instructions for this workflow. When you open this node in the n8n UI, you will see v1.1.0 code (not v1.0.0). The replacement code from that doc brings it to v1.2.0.

### Group B — Flat message but missing `data` field (1 workflow, partial fix)

| # | Workflow Name | Webhook Path | Live Status (2026-03-20) |
|---|---------------|--------------|--------------------------|
| 15 | FIN - Unapprove Appointments | `unapprove-appointments` | Partially fixed (flat message, HTTP 200, missing `data: {}`) |

## Node to Find

In each workflow, locate the node named:

**`Unauthorized Response - Code`**

This is a Code node that handles the unauthorized/forbidden response path. It receives data from the JWT Route Switch or Role Route Switch "Unauthorized" output.

## Fix for Group A (13 workflows + Approve Appointments via separate doc)

### Current Code (WRONG)

```javascript
// Unauthorized Response - v1.0.0
const errorData = $input.first().json;
return [{
  json: {
    success: false,
    error: {
      message: errorData.message || 'Unauthorized access',
      statusCode: errorData.statusCode || 401
    },
    timestamp: errorData.timestamp || new Date().toISOString()
  }
}];
```

Note: In Submit Payroll and Create Invoice, the comment line reads `// Unauthorized Error Response - v1.0.0` but the code is identical.

### Replacement Code (CORRECT)

```javascript
// Unauthorized Response - v1.1.0
// v1.1.0: Standard response format
const errorData = $input.first().json;
return [{
  json: {
    success: false,
    message: errorData.message || 'Unauthorized access',
    data: {},
    timestamp: errorData.timestamp || new Date().toISOString()
  }
}];
```

## Fix for Group B (Unapprove Appointments only)

### Current Code (PARTIALLY CORRECT)

```javascript
// Unauthorized Response - v1.1.0
// v1.1.0: Flat response format (no nested error object)
const errorData = $input.first().json;
return [{
  json: {
    success: false,
    message: errorData.message || 'Unauthorized access',
    statusCode: errorData.statusCode || 401,
    timestamp: errorData.timestamp || new Date().toISOString()
  }
}];
```

### Replacement Code (CORRECT)

```javascript
// Unauthorized Response - v1.2.0
// v1.2.0: Add data field, remove statusCode
const errorData = $input.first().json;
return [{
  json: {
    success: false,
    message: errorData.message || 'Unauthorized access',
    data: {},
    timestamp: errorData.timestamp || new Date().toISOString()
  }
}];
```

## Step-by-Step Instructions

For each workflow in the checklist above:

1. **Open** the workflow in the n8n UI editor
2. **Find** the node named **"Unauthorized Response - Code"**
   - It is typically in the lower portion of the workflow canvas
   - It connects from the "Unauthorized" output of either "JWT Route - Switch" or "Role Route - Switch" (or both)
   - It connects to the "Respond to Webhook" node
3. **Double-click** the node to open the Code editor
4. **Select all** the existing code (Ctrl+A)
5. **Replace** with the correct code from above:
   - For **Group A** (13 workflows): Use the Group A replacement code
   - For **Approve Appointments**: Use the separate doc `FIN-FIX-APPROVE-WORKFLOW-REMAINING.md` (has additional fixes beyond the unauthorized response)
   - For **Group B** (Unapprove Appointments): Use the Group B replacement code
6. **Click** "Execute node" (play button) to verify no syntax errors
7. **Close** the node editor
8. **Save** the workflow (Ctrl+S)
9. **Verify** the workflow is still active (toggle should be ON)
10. **Check off** the workflow in the Progress Checklist at the top of this document

## Verification

After applying the fix to each workflow, you can verify by:

1. Making an API call without an Authorization header
2. The response should be:
   ```json
   {
     "success": false,
     "message": "Missing authorization header",
     "data": {},
     "timestamp": "2026-03-18T..."
   }
   ```
3. Confirm that `message` is at the top level (not nested inside `error`)
4. Confirm that `data` field is present (even though empty)

## What Changed

| Field | Before (v1.0.0) | After (v1.1.0) |
|-------|-----------------|-----------------|
| `error.message` | Nested inside error object | Removed |
| `error.statusCode` | Nested inside error object | Removed |
| `message` | Missing at top level | Present at top level |
| `data` | Missing | Present (empty object `{}`) |

## Why This Matters

The frontend `APIClient` error handler expects all API responses to have this structure:

```javascript
{
  success: true/false,
  message: "string",
  data: { ... },
  timestamp: "ISO8601"
}
```

When `message` is nested inside `error`, the frontend sees `response.message` as `undefined`, which causes:
- Error toast shows "undefined" instead of the actual error message
- Potential nullref errors in error handling code
- Inconsistent error behavior between auth failures and other errors

## Quick Verification Commands

After applying fixes, test each endpoint with curl (no auth header) to verify the response format:

```bash
# Group A — POST endpoints
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/submit-payroll
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/mark-driver-paid
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/mark-agent-paid
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/add-staff-mileage
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/delete-staff-mileage
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/complete-appointment
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/create-invoice
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/update-invoice-status-v2
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/void-invoice

# Group A — GET endpoints
curl -s https://webhook-processor-production-3bb8.up.railway.app/webhook/get-staff-mileage
curl -s https://webhook-processor-production-3bb8.up.railway.app/webhook/get-finance-appointments
curl -s https://webhook-processor-production-3bb8.up.railway.app/webhook/get-invoices-v5
curl -s https://webhook-processor-production-3bb8.up.railway.app/webhook/get-app-config

# Group A-partial (Approve Appointments — see separate doc)
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/mark-appointment-ready

# Group B
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/unapprove-appointments
```

Every response should match:
```json
{"success":false,"message":"Missing authorization header","data":{},"timestamp":"..."}
```

## Workflows NOT Affected

These workflows do **not** need this fix:

| Workflow | Reason |
|----------|--------|
| FIN - Auto Complete Appointments Cron | Cron trigger, no webhook, no auth response |
| FIN - Mark Driver Paid (v1) | Legacy, no JWT auth, DO NOT DEPLOY |
| FIN - Mark Booking Agent Paid (v1) | Legacy, no JWT auth, DO NOT DEPLOY |
| FIN - Update Invoice Status (v1) | Legacy, no JWT auth, DO NOT DEPLOY |
