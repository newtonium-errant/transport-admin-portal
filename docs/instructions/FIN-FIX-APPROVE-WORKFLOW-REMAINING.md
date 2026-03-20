# Fix Approve Appointments Workflow — Remaining Issue

**Workflow:** FIN - Approve Appointments (endpoint: `POST /mark-appointment-ready`)
**Date:** 2026-03-20
**Applies to:** Production n8n instance
**Estimated time:** 2 minutes

## Background

The Approve Appointments workflow has been substantially fixed in prior sessions. The following are **already applied in production** (confirmed 2026-03-20 via live export at `Workflows/Review/FIN - Approve Appointments (2).json`):

- `operation_status = "completed"` filter replaced with smarter `review_status != "approved"` filter
- `billing_snapshot` properly JSON.stringify'd
- Custom rate handling (`custom_rate` field honored)
- Audit log fields fixed (`user_id`, dynamic `role`, `success` as expression)
- Respond to Webhook has dynamic `responseCode` (returns HTTP 401 for auth errors)
- Calculate & Build code writes `approved_hours` and `approved_mileage`

**One issue remains:** the Unauthorized Response node is missing `data: {}`.

---

## Fix: Add `data: {}` to Unauthorized Response

**Node:** `Unauthorized Response - Code`

**Problem:** The node currently returns flat format with `message` at top level, but is missing the `data: {}` field. The frontend `APIClient` expects all responses to have `{ success, message, data, timestamp }`. The `statusCode` field in the body is also redundant since the Respond to Webhook node already handles HTTP status via its `responseCode` expression.

**Current code in n8n UI (you should see something like this):**
```javascript
// Unauthorized Response - v1.0.0
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

### Replacement Code

```javascript
// Unauthorized Response - v1.2.0
// Standard format with data field, statusCode removed from body (HTTP status handles it)
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

### Steps

1. Double-click the **Unauthorized Response - Code** node
2. Select all code (Ctrl+A)
3. Paste the replacement code above
4. Click **Execute node** (play button) to verify no syntax errors
5. Close the node editor

---

## After Fix

1. **Save** the workflow (Ctrl+S)
2. **Verify** the workflow is still active (toggle should be ON)

## Verification

```bash
curl -s -X POST https://webhook-processor-production-3bb8.up.railway.app/webhook/mark-appointment-ready
```

Expected response:
```json
{
  "success": false,
  "message": "Missing authorization header",
  "data": {},
  "timestamp": "2026-03-20T..."
}
```

Verify:
- `message` is at the top level (not nested inside `error`)
- `data` field is present (empty object `{}`)
- `statusCode` is NOT in the response body (HTTP status handles this)
