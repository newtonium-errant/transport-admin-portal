# n8n Workflow Instructions: DEST - Add Destination

**Purpose:** Create a new destination record with validation and contacts JSONB support.
**Endpoint:** `POST /add-destination`
**Webhook Path:** `add-destination`

---

## Workflow Flow

```
Webhook (POST)
  → JWT Validation - Code
    → JWT Validation - Switch
      → [Authorized] Validate Destination Data - Code
        → Check Validation - Switch
          → [True] Create Destination - Supabase
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
2. Name it: `DEST - Add Destination`
3. Add a tag: `Destination Management`

---

## STEP 2: Webhook Node

**Node Name:** `POST Add Destination - Webhook`

- **HTTP Method:** `POST`
- **Path:** `add-destination`
- **Response Mode:** `Using 'Respond to Webhook' Node`
- **Options:** (leave defaults)

---

## STEP 3: JWT Validation - Code Node

**Node Name:** `JWT Validation - Code`

Connect: `POST Add Destination - Webhook` → `JWT Validation - Code`

**Replace ENTIRE code with:**

```javascript
// JWT Token Validation - v1.0.0
const webhookData = $input.first().json;

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

const JWT_SECRET = "RRTS_JWT_SECRET_KEY_PHASE2_TEMP";

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

// Version: v1.1.0 - JWT validation with RBAC role check
```

---

## STEP 4: JWT Validation - Switch Node

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

## STEP 5: Validate Destination Data - Code Node

**Node Name:** `Validate Destination Data - Code`

Connect: `JWT Validation - Switch` → Output **Authorized** → `Validate Destination Data - Code`

**Replace ENTIRE code with:**

```javascript
// Validate Destination Data - v1.0.0
const data = $json.requestBody || {};

const errors = [];

// Required field validation
if (!data.name || data.name.trim() === '') {
  errors.push('Name is required');
}
if (!data.address || data.address.trim() === '') {
  errors.push('Address is required');
}
if (!data.city || data.city.trim() === '') {
  errors.push('City is required');
}
if (!data.province || data.province.trim() === '') {
  errors.push('Province is required');
}
if (!data.postal_code || data.postal_code.trim() === '') {
  errors.push('Postal code is required');
}

// Email format validation (optional field)
if (data.email && data.email.trim() !== '') {
  if (!data.email.includes('@')) {
    errors.push('Invalid email format');
  }
}

// Contacts JSONB validation (optional field)
let parsedContacts = null;
if (data.contacts !== undefined && data.contacts !== null) {
  if (typeof data.contacts === 'string') {
    try {
      parsedContacts = JSON.parse(data.contacts);
    } catch (e) {
      errors.push('Contacts must be valid JSON');
    }
  } else {
    parsedContacts = data.contacts;
  }

  if (parsedContacts !== null && !Array.isArray(parsedContacts)) {
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

// Build cleaned destination object
const contacts = parsedContacts || [];
const destination = {
  name: data.name.trim(),
  address: data.address.trim(),
  city: data.city.trim(),
  province: data.province.trim().toUpperCase(),
  postal_code: data.postal_code.trim().toUpperCase(),
  phone: data.phone ? data.phone.trim() : null,
  email: data.email ? data.email.trim().toLowerCase() : null,
  contacts: contacts,
  notes: data.notes ? data.notes.trim() : null,
  map_coordinates: data.map_coordinates || null,
  active: data.active !== undefined ? data.active : true
};

// Backward compat: auto-extract first contact's phone/email into top-level fields
// if not explicitly provided (ensures /get-clinic-locations still works)
if (!destination.phone && contacts.length > 0 && contacts[0].phone) {
  destination.phone = contacts[0].phone.trim();
}
if (!destination.email && contacts.length > 0 && contacts[0].email) {
  destination.email = contacts[0].email.trim().toLowerCase();
}

return [{
  json: {
    success: 'true',
    destination: destination
  }
}];

// Version: v1.1.0 - Validate, sanitize, backward-compat phone/email
```

---

## STEP 6: Check Validation - Switch Node

**Node Name:** `Check Validation - Switch`

Connect: `Validate Destination Data - Code` → `Check Validation - Switch`

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

## STEP 7: Create Destination - Supabase Node

**Node Name:** `Create Destination - Supabase`

Connect: `Check Validation - Switch` → Output **True** → `Create Destination - Supabase`

- **Credential:** `Supabase Production` (or `Supabase Testing` for dev)
- **Resource:** `Row`
- **Operation:** `Create`
- **Table:** `destinations`
- **Data to Insert (Add Field for each):**
  - `name` = `{{ $json.destination.name }}`
  - `address` = `{{ $json.destination.address }}`
  - `city` = `{{ $json.destination.city }}`
  - `province` = `{{ $json.destination.province }}`
  - `postal_code` = `{{ $json.destination.postal_code }}`
  - `phone` = `{{ $json.destination.phone }}`
  - `email` = `{{ $json.destination.email }}`
  - `contacts` = `{{ JSON.stringify($json.destination.contacts) }}`
  - `notes` = `{{ $json.destination.notes }}`
  - `map_coordinates` = `{{ $json.destination.map_coordinates }}`
  - `active` = `{{ $json.destination.active }}`
- **Options → Always Output Data:** Enabled

**NOTE on contacts field:** Because contacts is JSONB, the value must be a JSON string. Use the expression `{{ JSON.stringify($json.destination.contacts) }}` to ensure proper formatting. If Supabase auto-parses it, you can also try `{{ $json.destination.contacts }}` directly.

---

## STEP 8: Format Success Response - Code Node

**Node Name:** `Format Success Response - Code`

Connect: `Create Destination - Supabase` → `Format Success Response - Code`

**Replace ENTIRE code with:**

```javascript
// Format Success Response - v1.0.0
const result = $input.first().json;

if (result.error) {
  console.error('Database error:', result.error);
  return [{
    json: {
      success: false,
      message: 'Failed to create destination',
      error: result.error,
      timestamp: new Date().toISOString()
    }
  }];
}

return [{
  json: {
    success: true,
    message: 'Destination created successfully',
    data: result,
    timestamp: new Date().toISOString()
  }
}];

// Version: v1.0.0 - Format create success response
```

---

## STEP 9: Format Error Response - Code Node

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

## STEP 10: Unauthorized Response - Code Node

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

## STEP 11: Respond to Webhook Node

**Node Name:** `Respond to Webhook`

Connect all three terminal paths to this node:
- `Format Success Response - Code` → `Respond to Webhook`
- `Format Error Response - Code` → `Respond to Webhook`
- `Unauthorized Response - Code` → `Respond to Webhook`

- **Options:** (leave defaults)

---

## STEP 12: Activate and Test

1. **Save** the workflow
2. **Activate** the workflow
3. Test with curl or the frontend:

```bash
curl -X POST \
  https://webhook-processor-production-3bb8.up.railway.app/webhook/add-destination \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aberdeen Hospital",
    "address": "835 East River Rd",
    "city": "New Glasgow",
    "province": "NS",
    "postal_code": "B2H 3S6",
    "phone": "(902) 752-7600",
    "email": "info@aberdeen.ns.ca",
    "contacts": [
      {
        "name": "Jane Smith",
        "type": "main",
        "phone": "(902) 752-7601",
        "email": "jane@aberdeen.ns.ca"
      }
    ],
    "notes": "Main entrance on east side",
    "active": true
  }'
```

**Expected Success Response:**
```json
{
  "success": true,
  "message": "Destination created successfully",
  "data": {
    "id": 15,
    "name": "Aberdeen Hospital",
    "address": "835 East River Rd",
    "city": "New Glasgow",
    "province": "NS",
    "postal_code": "B2H 3S6",
    "phone": "(902) 752-7600",
    "email": "info@aberdeen.ns.ca",
    "contacts": [
      {
        "name": "Jane Smith",
        "type": "main",
        "phone": "(902) 752-7601",
        "email": "jane@aberdeen.ns.ca"
      }
    ],
    "notes": "Main entrance on east side",
    "map_coordinates": null,
    "active": true,
    "created_at": "2026-02-26T16:30:00.000Z",
    "updated_at": null
  },
  "timestamp": "2026-02-26T16:30:00.000Z"
}
```

**Expected Validation Error Response:**
```json
{
  "success": false,
  "message": "Validation failed: Name is required, Address is required",
  "errors": ["Name is required", "Address is required"],
  "timestamp": "2026-02-26T16:30:00.000Z"
}
```

---

## Checklist

- [x] Webhook uses POST method with `responseNode` mode
- [x] JWT validation rejects limited and refresh tokens
- [x] Role-based access control (admin, supervisor only)
- [x] Switch nodes use strict type validation with string comparisons
- [x] No IF nodes used
- [x] Supabase node has `alwaysOutputData: true`
- [x] Required fields validated: name, address, city, province, postal_code
- [x] Optional fields handled: phone, email, contacts, notes, map_coordinates, active
- [x] Email format validated when provided
- [x] Contacts validated as JSONB array when provided
- [x] Strings trimmed and sanitized
- [x] Province and postal code uppercased
- [x] Standardized response format: `{success, message, data, timestamp}`
- [x] Minimal logging (only database errors)
- [x] Code nodes have version numbers
