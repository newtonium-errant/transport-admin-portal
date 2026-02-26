# n8n Workflow Instructions: DEST - Get All Destinations

**Purpose:** Return all destinations (active and inactive) with raw column names for the destination management page.
**Endpoint:** `GET /get-all-destinations`
**Webhook Path:** `get-all-destinations`

**NOTE:** This is separate from the existing `GET /get-clinic-locations` endpoint which transforms column names. This endpoint returns raw database columns for CRUD management.

---

## Workflow Flow

```
Webhook (GET)
  → JWT Validation - Code
    → JWT Validation - Switch
      → [Authorized] Get All Destinations - Supabase
        → Format Response - Code
          → Respond to Webhook
      → [Unauthorized] Unauthorized Response - Code
        → Respond to Webhook
```

---

## STEP 1: Create New Workflow

1. In n8n, click **Add Workflow**
2. Name it: `DEST - Get All Destinations`
3. Add a tag: `Destination Management`

---

## STEP 2: Webhook Node

**Node Name:** `GET Destinations - Webhook`

- **HTTP Method:** `GET`
- **Path:** `get-all-destinations`
- **Response Mode:** `Using 'Respond to Webhook' Node`
- **Options:** (leave defaults)

---

## STEP 3: JWT Validation - Code Node

**Node Name:** `JWT Validation - Code`

Connect: `GET Destinations - Webhook` → `JWT Validation - Code`

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

// RBAC: Only admin and supervisor can access destinations management
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

## STEP 5: Get All Destinations - Supabase Node

**Node Name:** `Get All Destinations - Supabase`

Connect: `JWT Validation - Switch` → Output **Authorized** → `Get All Destinations - Supabase`

- **Credential:** `Supabase Production` (or `Supabase Testing` for dev)
- **Resource:** `Row`
- **Operation:** `Get Many`
- **Table:** `destinations`
- **Return All:** Enabled
- **Filters:** (none -- return all rows including inactive)
- **Options → Always Output Data:** Enabled

---

## STEP 6: Format Response - Code Node

**Node Name:** `Format Response - Code`

Connect: `Get All Destinations - Supabase` → `Format Response - Code`

**Replace ENTIRE code with:**

```javascript
// Format Destinations Response - v1.0.0
const items = $input.all();

const destinations = [];

for (const item of items) {
  const d = item.json;
  if (!d || !d.id) continue;

  destinations.push({
    id: d.id,
    name: d.name || '',
    address: d.address || '',
    city: d.city || '',
    province: d.province || '',
    postal_code: d.postal_code || '',
    phone: d.phone || '',
    email: d.email || '',
    contacts: d.contacts || [],
    notes: d.notes || '',
    map_coordinates: d.map_coordinates || null,
    active: d.active !== false,
    created_at: d.created_at || null,
    updated_at: d.updated_at || null
  });
}

destinations.sort((a, b) => a.name.localeCompare(b.name));

if (destinations.length === 0) {
  console.log('No destinations found in database');
}

return [{
  json: {
    success: true,
    message: `Retrieved ${destinations.length} destinations`,
    data: destinations,
    count: destinations.length,
    timestamp: new Date().toISOString()
  }
}];

// Version: v1.0.0 - Raw column names for management page
```

---

## STEP 7: Unauthorized Response - Code Node

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

## STEP 8: Respond to Webhook Node

**Node Name:** `Respond to Webhook`

Connect both paths to this node:
- `Format Response - Code` → `Respond to Webhook`
- `Unauthorized Response - Code` → `Respond to Webhook`

- **Options:** (leave defaults)

---

## STEP 9: Activate and Test

1. **Save** the workflow
2. **Activate** the workflow
3. Test with curl or the frontend:

```bash
curl -X GET \
  https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-destinations \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Retrieved 12 destinations",
  "data": [
    {
      "id": 1,
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
          "phone": "(902) 752-7601",
          "email": "jane@aberdeen.ns.ca",
          "type": "main"
        }
      ],
      "notes": "",
      "map_coordinates": "(45.5868,-62.6465)",
      "active": true,
      "created_at": "2025-10-30T17:00:00.000Z",
      "updated_at": null
    }
  ],
  "count": 12,
  "timestamp": "2026-02-26T16:30:00.000Z"
}
```

---

## Checklist

- [x] Webhook uses GET method with `responseNode` mode
- [x] JWT validation rejects limited and refresh tokens
- [x] Role-based access control (admin, supervisor only)
- [x] Switch node uses strict type validation with string comparisons
- [x] Supabase node has `alwaysOutputData: true`
- [x] Returns ALL destinations (active and inactive)
- [x] Raw column names (no transformations)
- [x] Includes new columns: email, contacts, updated_at
- [x] Sorted alphabetically by name
- [x] Standardized response format: `{success, message, data, timestamp}`
- [x] Minimal logging (only warning if empty result)
- [x] Code nodes have version numbers
