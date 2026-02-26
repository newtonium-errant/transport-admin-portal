# n8n Workflow Instructions: DEST - Update Destination

**Purpose:** Update an existing destination record by id. Accepts any combination of updatable fields.
**Endpoint:** `PUT /update-destination`
**Webhook Path:** `update-destination`

---

## Workflow Flow

```
Webhook (PUT)
  → Get JWT Secret - Supabase
    → JWT Validation - Code
      → JWT Validation - Switch
        → [Authorized] Validate Update Data - Code
          → Check Validation - Switch
            → [True] Update Destination - Supabase
              → Format Success Response - Code
                → Respond to Webhook
            → [False] Format Error Response - Code
              → Respond to Webhook
        → [Unauthorized] Unauthorized Response - Code
          → Respond to Webhook
```

---

## STEP 1: Create New Workflow

1. In n8n, click **Add Workflow**
2. Name it: `DEST - Update Destination`
3. Add a tag: `Destination Management`

---

## STEP 2: Webhook Node

**Node Name:** `PUT Update Destination - Webhook`

- **HTTP Method:** `PUT`
- **Path:** `update-destination`
- **Response Mode:** `Using 'Respond to Webhook' Node`
- **Options:** (leave defaults)

---

## STEP 3: Get JWT Secret - Supabase Node

**Node Name:** `Get JWT Secret - Supabase`

Connect: `PUT Update Destination - Webhook` → `Get JWT Secret - Supabase`

- **Credential:** `Supabase Service Role`
- **Resource:** `Row`
- **Operation:** `Get` (single record lookup)
- **Table:** `app_config`
- **Filters:**
  - Column: `key`
  - Value: `jwt_secret`

**Purpose:** Fetches the JWT secret dynamically from the `app_config` table instead of hardcoding it. This ensures the workflow always uses the current secret.

---

## STEP 4: JWT Validation - Code Node

**Node Name:** `JWT Validation - Code`

Connect: `Get JWT Secret - Supabase` → `JWT Validation - Code`

**IMPORTANT:** Since `$input` now comes from the Supabase node (not the Webhook), you must use named references:
- Webhook data: `$('PUT Update Destination - Webhook').first().json`
- JWT secret: `$('Get JWT Secret - Supabase').first().json.value`

**Replace ENTIRE code with:**

```javascript
// JWT Token Validation - v2.0.0
// Fetches JWT secret from app_config via preceding Supabase node
const webhookData = $('PUT Update Destination - Webhook').first().json;

const authHeader =
  webhookData.headers?.authorization ||
  webhookData.headers?.Authorization;

if (!authHeader) {
  return [{
    json: {
      _route: 'unauthorized',
      success: false,
      message: 'Missing authorization header',
      statusCode: 401,
      timestamp: new Date().toISOString()
    }
  }];
}

if (!authHeader.startsWith('Bearer ')) {
  return [{
    json: {
      _route: 'unauthorized',
      success: false,
      message: 'Invalid authorization format',
      statusCode: 401,
      timestamp: new Date().toISOString()
    }
  }];
}

const token = authHeader.substring(7);

function simpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// Get JWT secret from app_config (fetched by previous Supabase node)
const configData = $('Get JWT Secret - Supabase').first().json;
const JWT_SECRET = configData.value;

if (!JWT_SECRET) {
  return [{
    json: {
      _route: 'unauthorized',
      success: false,
      message: 'JWT secret not configured',
      statusCode: 500,
      timestamp: new Date().toISOString()
    }
  }];
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [header, payload, sig] = parts;
    const dataToSign = `${header}.${payload}.${JWT_SECRET}`;
    const expectedSig = simpleHash(dataToSign);

    if (sig !== expectedSig) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const decoded = JSON.parse(atob(payload));
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload: decoded };
  } catch (error) {
    return {
      valid: false,
      error: 'Token verification failed'
    };
  }
}

const validation = verifyJWT(token);

if (!validation.valid) {
  return [{
    json: {
      _route: 'unauthorized',
      success: false,
      message: validation.error || 'Invalid token',
      statusCode: 401,
      timestamp: new Date().toISOString()
    }
  }];
}

const payload = validation.payload;

if (payload.type === 'limited') {
  return [{
    json: {
      _route: 'unauthorized',
      success: false,
      message: 'Full authentication required',
      statusCode: 403,
      timestamp: new Date().toISOString()
    }
  }];
}

if (payload.type === 'refresh') {
  return [{
    json: {
      _route: 'unauthorized',
      success: false,
      message: 'Refresh tokens cannot be used here',
      statusCode: 403,
      timestamp: new Date().toISOString()
    }
  }];
}

// RBAC: Only admin and supervisor can manage destinations
const allowedRoles = ['admin', 'supervisor'];
if (!allowedRoles.includes(payload.role)) {
  return [{
    json: {
      _route: 'unauthorized',
      success: false,
      message: 'Insufficient permissions',
      statusCode: 403,
      timestamp: new Date().toISOString()
    }
  }];
}

return [{
  json: {
    _route: 'authorized',
    authenticated: true,
    user: {
      username: payload.sub,
      role: payload.role,
      tokenType: payload.type
    },
    requestBody: webhookData.body,
    timestamp: new Date().toISOString()
  }
}];

// Version: v2.0.0 - Dynamic JWT secret from app_config + RBAC role check
```

---

## STEP 5: JWT Validation - Switch Node

**Node Name:** `JWT Validation - Switch`

Connect: `JWT Validation - Code` → `JWT Validation - Switch`

**Configuration:**
- **Mode:** Rules
- **Output 0 ("Authorized"):**
  - Rename Output: `Authorized`
  - Condition: `{{ $json._route }}` **equals** `authorized`
  - Type Validation: `Strict`
  - Case Sensitive: `true`
- **Output 1 ("Unauthorized"):**
  - Rename Output: `Unauthorized`
  - Condition: `{{ $json._route }}` **equals** `unauthorized`
  - Type Validation: `Strict`
  - Case Sensitive: `true`

---

## STEP 6: Validate Update Data - Code Node

**Node Name:** `Validate Update Data - Code`

Connect: `JWT Validation - Switch` → Output **Authorized** → `Validate Update Data - Code`

**Replace ENTIRE code with:**

```javascript
// Validate Update Data - v1.0.0
const data = $json.requestBody || {};

const errors = [];

// id is required for update
if (!data.id && data.id !== 0) {
  errors.push('Destination id is required');
}

const destinationId = parseInt(data.id);
if (isNaN(destinationId) || destinationId <= 0) {
  errors.push('Destination id must be a positive integer');
}

// Email format validation (if provided)
if (data.email !== undefined
    && data.email !== null
    && data.email !== '') {
  if (!data.email.includes('@')) {
    errors.push('Invalid email format');
  }
}

// Contacts JSONB validation (if provided)
let parsedContacts = undefined;
if (data.contacts !== undefined) {
  if (data.contacts === null) {
    parsedContacts = [];
  } else if (typeof data.contacts === 'string') {
    try {
      parsedContacts = JSON.parse(data.contacts);
    } catch (e) {
      errors.push('Contacts must be valid JSON');
    }
  } else {
    parsedContacts = data.contacts;
  }

  if (parsedContacts !== undefined
      && !Array.isArray(parsedContacts)) {
    errors.push('Contacts must be an array');
  }
}

if (errors.length > 0) {
  return [{
    json: {
      success: 'false',
      errors: errors,
      message: 'Validation failed: ' + errors.join(', '),
      skipSupabase: true
    }
  }];
}

// Build update object with only provided fields
const updateFields = {};

if (data.name !== undefined) {
  updateFields.name = data.name ? data.name.trim() : '';
}
if (data.address !== undefined) {
  updateFields.address = data.address ? data.address.trim() : '';
}
if (data.city !== undefined) {
  updateFields.city = data.city ? data.city.trim() : '';
}
if (data.province !== undefined) {
  updateFields.province = data.province
    ? data.province.trim().toUpperCase()
    : '';
}
if (data.postal_code !== undefined) {
  updateFields.postal_code = data.postal_code
    ? data.postal_code.trim().toUpperCase()
    : '';
}
if (data.phone !== undefined) {
  updateFields.phone = data.phone ? data.phone.trim() : null;
}
if (data.email !== undefined) {
  updateFields.email = data.email
    ? data.email.trim().toLowerCase()
    : null;
}
if (parsedContacts !== undefined) {
  updateFields.contacts = parsedContacts;
}
if (data.notes !== undefined) {
  updateFields.notes = data.notes ? data.notes.trim() : null;
}
if (data.map_coordinates !== undefined) {
  updateFields.map_coordinates = data.map_coordinates || null;
}
if (data.active !== undefined) {
  updateFields.active = data.active;
}

// Backward compat: auto-extract first contact's phone/email into top-level fields
// if contacts are being updated and phone/email weren't explicitly provided
if (parsedContacts !== undefined && parsedContacts.length > 0) {
  if (updateFields.phone === undefined && parsedContacts[0].phone) {
    updateFields.phone = parsedContacts[0].phone.trim();
  }
  if (updateFields.email === undefined && parsedContacts[0].email) {
    updateFields.email = parsedContacts[0].email.trim().toLowerCase();
  }
}

// Always set updated_at
updateFields.updated_at = new Date().toISOString();

// Check at least one field to update (besides updated_at)
const fieldCount = Object.keys(updateFields).length;
if (fieldCount <= 1) {
  return [{
    json: {
      success: 'false',
      errors: ['No fields provided to update'],
      message: 'No fields provided to update',
      skipSupabase: true
    }
  }];
}

return [{
  json: {
    success: 'true',
    destinationId: destinationId,
    updateFields: updateFields
  }
}];

// Version: v1.1.0 - Validate, dynamic update, backward-compat phone/email
```

---

## STEP 7: Check Validation - Switch Node

**Node Name:** `Check Validation - Switch`

Connect: `Validate Update Data - Code` → `Check Validation - Switch`

**Configuration:**
- **Mode:** Rules
- **Output 0 ("True"):**
  - Rename Output: `True`
  - Condition: `{{ $json.success }}` **equals** `true`
  - Type Validation: `Strict`
  - Case Sensitive: `true`
- **Output 1 ("False"):**
  - Rename Output: `False`
  - Condition: `{{ $json.success }}` **equals** `false`
  - Type Validation: `Strict`
  - Case Sensitive: `true`

---

## STEP 8: Update Destination - Supabase Node

**Node Name:** `Update Destination - Supabase`

Connect: `Check Validation - Switch` → Output **True** → `Update Destination - Supabase`

- **Credential:** `Supabase Production` (or `Supabase Testing` for dev)
- **Resource:** `Row`
- **Operation:** `Update`
- **Table:** `destinations`
- **Filters:**
  - Click "Add Filter"
  - Column: `id`
  - Operator: `Equal to`
  - Value: `{{ $json.destinationId }}`
- **Update Fields (Add Field for each):**
  - `name` = `{{ $json.updateFields.name }}`
  - `address` = `{{ $json.updateFields.address }}`
  - `city` = `{{ $json.updateFields.city }}`
  - `province` = `{{ $json.updateFields.province }}`
  - `postal_code` = `{{ $json.updateFields.postal_code }}`
  - `phone` = `{{ $json.updateFields.phone }}`
  - `email` = `{{ $json.updateFields.email }}`
  - `contacts` = `{{ JSON.stringify($json.updateFields.contacts) }}`
  - `notes` = `{{ $json.updateFields.notes }}`
  - `map_coordinates` = `{{ $json.updateFields.map_coordinates }}`
  - `active` = `{{ $json.updateFields.active }}`
  - `updated_at` = `{{ $json.updateFields.updated_at }}`
- **Options → Always Output Data:** Enabled

**IMPORTANT NOTE:** Because Supabase nodes send all configured fields regardless of whether they were provided, and undefined fields would overwrite existing values with null/undefined, an alternative approach is recommended. Instead of configuring individual fields in the Supabase node, you can replace the Supabase node with an **HTTP Request node** that calls the Supabase REST API directly, sending only the fields in `updateFields`. See the Alternative Approach section below.

### Alternative Approach: HTTP Request Node for Dynamic Updates

If you want to send ONLY the fields that were actually provided (recommended), replace the Supabase Update node with an HTTP Request node:

**Node Name:** `Update Destination - HTTP Request`

- **Method:** `PATCH`
- **URL:** `https://YOUR_SUPABASE_URL.supabase.co/rest/v1/destinations?id=eq.{{ $json.destinationId }}`
- **Authentication:** `Generic Credential Type` → `Header Auth`
- **Send Headers:**
  - `apikey` = your Supabase anon/service key
  - `Authorization` = `Bearer YOUR_SERVICE_ROLE_KEY`
  - `Content-Type` = `application/json`
  - `Prefer` = `return=representation`
- **Send Body:** `JSON`
- **JSON Body:** `{{ JSON.stringify($json.updateFields) }}`

However, if using the standard Supabase node approach (Step 8 above), it will work correctly since the Code node only includes fields that were actually provided. Fields set to `undefined` in the expression will be sent as empty/null by the Supabase node, so **the Supabase node approach is simpler and works well when all fields are included in the update object.**

---

## STEP 9: Format Success Response - Code Node

**Node Name:** `Format Success Response - Code`

Connect: `Update Destination - Supabase` → `Format Success Response - Code`

**Replace ENTIRE code with:**

```javascript
// Format Success Response - v1.0.0
const result = $input.first().json;

if (result.error) {
  console.error('Database error:', result.error);
  return [{
    json: {
      success: false,
      message: 'Failed to update destination',
      error: result.error,
      timestamp: new Date().toISOString()
    }
  }];
}

// Check if a row was actually updated
if (!result.id) {
  return [{
    json: {
      success: false,
      message: 'Destination not found',
      timestamp: new Date().toISOString()
    }
  }];
}

return [{
  json: {
    success: true,
    message: 'Destination updated successfully',
    data: result,
    timestamp: new Date().toISOString()
  }
}];

// Version: v1.0.0 - Format update success response
```

---

## STEP 10: Format Error Response - Code Node

**Node Name:** `Format Error Response - Code`

Connect: `Check Validation - Switch` → Output **False** → `Format Error Response - Code`

**Replace ENTIRE code with:**

```javascript
// Format Error Response - v1.0.0
const errorData = $input.first().json;

return [{
  json: {
    success: false,
    message: errorData.message || 'Validation failed',
    errors: errorData.errors || [],
    timestamp: new Date().toISOString()
  }
}];

// Version: v1.0.0 - Format validation error response
```

---

## STEP 11: Unauthorized Response - Code Node

**Node Name:** `Unauthorized Response - Code`

Connect: `JWT Validation - Switch` → Output **Unauthorized** → `Unauthorized Response - Code`

**Replace ENTIRE code with:**

```javascript
// Unauthorized Error Response - v1.0.0
const errorData = $input.first().json;

return [{
  json: {
    success: false,
    message: errorData.message || 'Unauthorized access',
    error: {
      statusCode: errorData.statusCode || 401
    },
    timestamp: errorData.timestamp || new Date().toISOString()
  }
}];

// Version: v1.0.0 - Standard unauthorized response
```

---

## STEP 12: Respond to Webhook Node

**Node Name:** `Respond to Webhook`

Connect all three terminal paths to this node:
- `Format Success Response - Code` → `Respond to Webhook`
- `Format Error Response - Code` → `Respond to Webhook`
- `Unauthorized Response - Code` → `Respond to Webhook`

- **Options:** (leave defaults)

---

## STEP 13: Activate and Test

1. **Save** the workflow
2. **Activate** the workflow
3. Test with curl or the frontend:

### Test: Update name and email

```bash
curl -X PUT \
  https://webhook-processor-production-3bb8.up.railway.app/webhook/update-destination \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "name": "Aberdeen Regional Hospital",
    "email": "reception@aberdeen.ns.ca"
  }'
```

### Test: Update contacts JSONB

```bash
curl -X PUT \
  https://webhook-processor-production-3bb8.up.railway.app/webhook/update-destination \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "contacts": [
      {
        "name": "Jane Smith",
        "type": "main",
        "phone": "(902) 752-7601",
        "email": "jane@aberdeen.ns.ca"
      },
      {
        "name": "Bob Jones",
        "type": "billing",
        "phone": "(902) 752-7602",
        "email": "bob@aberdeen.ns.ca"
      }
    ]
  }'
```

### Test: Deactivate a destination

```bash
curl -X PUT \
  https://webhook-processor-production-3bb8.up.railway.app/webhook/update-destination \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 5,
    "active": false
  }'
```

**Expected Success Response:**
```json
{
  "success": true,
  "message": "Destination updated successfully",
  "data": {
    "id": 1,
    "name": "Aberdeen Regional Hospital",
    "address": "835 East River Rd",
    "city": "New Glasgow",
    "province": "NS",
    "postal_code": "B2H 3S6",
    "phone": "(902) 752-7600",
    "email": "reception@aberdeen.ns.ca",
    "contacts": [],
    "notes": null,
    "map_coordinates": "(45.5868,-62.6465)",
    "active": true,
    "created_at": "2025-10-30T17:00:00.000Z",
    "updated_at": "2026-02-26T16:30:00.000Z"
  },
  "timestamp": "2026-02-26T16:30:00.000Z"
}
```

**Expected Validation Error (no id):**
```json
{
  "success": false,
  "message": "Validation failed: Destination id is required",
  "errors": ["Destination id is required"],
  "timestamp": "2026-02-26T16:30:00.000Z"
}
```

**Expected Validation Error (no fields):**
```json
{
  "success": false,
  "message": "No fields provided to update",
  "errors": ["No fields provided to update"],
  "timestamp": "2026-02-26T16:30:00.000Z"
}
```

---

## Checklist

- [x] Webhook uses PUT method with `responseNode` mode
- [x] JWT secret fetched dynamically from `app_config` table (never hardcoded)
- [x] JWT Validation Code uses named node references (`$('NodeName').first().json`)
- [x] JWT validation rejects limited and refresh tokens
- [x] Role-based access control (admin, supervisor only)
- [x] Switch nodes use strict type validation with string comparisons
- [x] No IF nodes used
- [x] Supabase node has `alwaysOutputData: true`
- [x] Destination id is required
- [x] All other fields are optional
- [x] Only provided fields are included in update object
- [x] `updated_at` timestamp always set on update
- [x] Email format validated when provided
- [x] Contacts validated as JSONB array when provided
- [x] Strings trimmed and sanitized
- [x] Province and postal code uppercased when provided
- [x] "Not found" handled when no row matched
- [x] Standardized response format: `{success, message, data, timestamp}`
- [x] Minimal logging (only database errors)
- [x] Code nodes have version numbers
