# API Endpoints Reference

## Overview

Complete reference for all n8n workflow API endpoints in the RRTS Transport Admin Portal. All endpoints are hosted on Railway.app and require JWT authentication (except login).

**Base URL:** `https://webhook-processor-production-3bb8.up.railway.app/webhook/`

**Authentication:** Most endpoints require a valid JWT access token sent in the `Authorization: Bearer <token>` header. The `APIClient` library handles this automatically.

**Response Format:** All endpoints return standardized responses:
```javascript
// Success
{
  success: true,
  message: "Operation completed successfully",
  data: {...},  // or [...] for arrays
  timestamp: "2025-11-18T12:00:00.000Z"
}

// Error
{
  success: false,
  message: "User-friendly error message",
  error: "Technical error details",
  timestamp: "2025-11-18T12:00:00.000Z"
}
```

---

## Authentication Endpoints

### `POST /user-login`
User login with password hashing.

**Authentication:** None required (public endpoint)

**Request:**
```javascript
{
  username: string,  // Email address
  password: string   // Plain text password (hashed in workflow)
}
```

**Response:**
```javascript
{
  success: true,
  access_token: string,   // 1 hour expiration
  refresh_token: string,  // 7 day expiration
  user: {
    id: number,
    username: string,
    role: string,         // admin, supervisor, booking_agent, driver, client
    full_name: string
  }
}
```

**Error Responses:**
- `401` - Invalid credentials
- `403` - Account locked (too many failed attempts)

---

### `POST /password-reset`
Admin-initiated password reset (creates limited token).

**Authentication:** Admin only

**Request:**
```javascript
{
  username: string  // Email address of user to reset
}
```

**Response:**
```javascript
{
  success: true,
  limited_token: string,  // 15 minute expiration
  message: "Password reset token created"
}
```

**Notes:**
- Limited token only allows access to `/change-password` endpoint
- Forces user to change password before gaining full system access

---

### `POST /change-password`
User self-service password change.

**Authentication:** Requires valid access token OR limited token

**Request:**
```javascript
{
  old_password: string,  // Current password (not required with limited token)
  new_password: string   // New password
}
```

**Response:**
```javascript
{
  success: true,
  message: "Password changed successfully",
  access_token: string,   // New full access token (if using limited token)
  refresh_token: string   // New refresh token (if using limited token)
}
```

**Notes:**
- If using limited token, automatically upgrades to full access token
- Old password not required when using limited token

---

### `POST /refresh-token`
Exchange refresh token for new access/refresh tokens.

**Authentication:** None required (refresh token in body)

**Request:**
```javascript
{
  refresh_token: string  // Current refresh token
}
```

**Response:**
```javascript
{
  success: true,
  access_token: string,   // New access token (1 hour)
  refresh_token: string   // New refresh token (7 days, rotated)
}
```

**Notes:**
- Both tokens rotated for security
- Old refresh token immediately invalidated

---

## Appointment Endpoints

### Read Operations

#### `GET /get-all-appointments`
Retrieve all appointments (use sparingly - large dataset).

**Authentication:** Required

**Query Parameters:** None

**Response:**
```javascript
{
  success: true,
  data: [
    {
      id: number,
      knumber: string,
      appt_date: string,        // "2025-11-18"
      appt_time: string,        // "14:00:00"
      appt_length: number,      // Minutes
      transit_time: number,     // Minutes
      destination: string,
      destination_name: string,
      driver_id: number,
      driver_name: string,
      status: string,           // scheduled, completed, cancelled, no_show
      deleted: boolean,
      // ... additional fields
    }
  ]
}
```

**Notes:**
- Returns ALL appointments including past, deleted, etc.
- Use `/get-active-present-future-appointments` for most pages

---

#### `GET /get-active-present-future-appointments`
Retrieve active/present/future appointments only.

**Authentication:** Required

**Response:** Same format as `/get-all-appointments`

**Filtering:**
- `deleted = false`
- `status != 'cancelled'`
- `appt_date >= today OR status = 'in_progress'`

**Recommended Usage:** Use this instead of get-all-appointments for most pages

---

#### `GET /get-appointments-recent`
Retrieve last 2 weeks + future appointments.

**Authentication:** Required

**Response:** Same format as `/get-all-appointments`

**Filtering:**
- Last 14 days + all future appointments
- Excludes deleted appointments

---

#### `GET /get-operations-appointments`
Retrieve appointments for operations dashboard.

**Authentication:** Required (Admin, Supervisor)

**Response:** Same format as `/get-all-appointments` plus additional fields:
```javascript
{
  success: true,
  data: [
    {
      // ... standard appointment fields
      driver_availability: string,  // Available, Unavailable, On Leave
      managed_by: number,
      managed_by_name: string
    }
  ]
}
```

**Use Case:** Operations page with driver assignments and status tracking

---

#### `GET /get-appointment-modal-data`
Combined data for appointment modal (amalgamated endpoint).

**Authentication:** Required

**Response:**
```javascript
{
  success: true,
  clients: [...],   // All active clients
  drivers: [...],   // All active drivers
  clinics: [...]    // All clinic locations
}
```

**Use Case:** Load all dropdown options in one request (Phase 2 optimization)

---

### Create/Update Operations

#### `POST /save-appointment-v7` **[CURRENT]**
Create appointment(s) with array format.

**Authentication:** Required

**Request:**
```javascript
{
  appointments: [
    {
      knumber: string,                           // Required
      appointmentDateTime: string,               // Required, UTC ISO format
      appointmentLength: number,                 // Required, minutes (camelCase!)
      transitTime: number,                       // Required, minutes (camelCase!)
      location: string,                          // Required, clinic name
      locationAddress: string,                   // Required, clinic address
      pickup_address: string,                    // Required, client pickup address
      status: string,                            // Required, usually "pending"
      driver_instructions: string | null,        // Required
      scheduling_notes: string,                  // Required
      customRate: number | null,                 // Required
      clinic_id: number | null,
      managed_by: number,
      managed_by_name: string,
      notes: string
    }
  ]
}
```

**Response:**
```javascript
{
  success: true,
  data: [...],  // Array of created appointments
  message: "X appointments created successfully"
}
```

**Notes:**
- Array format required even for single appointment
- Field names use camelCase (appointmentLength, NOT appointment_length)
- Supports bulk creation

---

#### `POST /save-appointment` **[DEPRECATED]**
Old single appointment format.

**Authentication:** Required

**Notes:** Use `/save-appointment-v7` instead

---

#### `POST /update-appointment-complete`
Update appointment with complete calendar management.

**Authentication:** Required

**Request:**
```javascript
{
  id: number,         // Required
  // ... any appointment fields to update
}
```

**Response:**
```javascript
{
  success: true,
  data: {...}  // Updated appointment object
}
```

**Notes:**
- Handles Google Calendar event updates
- Recalculates times if date/time changed

---

#### `POST /update-appointment-with-calendar`
Update appointment with calendar sync.

**Authentication:** Required

**Request:** Same as `/update-appointment-complete`

**Response:**
```javascript
{
  success: true
}
```

---

#### `POST /batch-update-appointments`
Bulk update multiple appointments.

**Authentication:** Required (Admin, Supervisor)

**Request:**
```javascript
{
  appointments: [
    {
      id: number,
      // ... fields to update
    }
  ]
}
```

**Response:**
```javascript
{
  success: true,
  updated: number  // Count of updated appointments
}
```

---

### Delete/Archive Operations

#### `POST /delete-appointment-with-calendar`
Hard delete appointment with calendar cleanup.

**Authentication:** Required (Admin, Supervisor)

**Request:**
```javascript
{
  id: number
}
```

**Response:**
```javascript
{
  success: true
}
```

**Notes:**
- Permanently removes from database
- Deletes Google Calendar event
- Use soft delete for audit trail

---

#### `POST /soft-delete-appointment`
Soft delete appointment with audit trail.

**Authentication:** Required (Admin, Supervisor)

**Request:**
```javascript
{
  id: number,
  deletion_reason: string
}
```

**Response:**
```javascript
{
  success: true
}
```

**Notes:**
- Sets `deleted = true`
- Preserves data for audit
- Can be restored with `/unarchive-appointment`

---

#### `POST /cancel-appointment`
Cancel appointment (different from delete).

**Authentication:** Required

**Request:**
```javascript
{
  id: number,
  cancellation_reason: string
}
```

**Response:**
```javascript
{
  success: true
}
```

**Notes:**
- Sets `status = 'cancelled'`
- Appointment remains visible
- Does NOT soft delete

---

#### `POST /unarchive-appointment`
Restore soft-deleted appointment.

**Authentication:** Required (Admin, Supervisor)

**Request:**
```javascript
{
  id: number
}
```

**Response:**
```javascript
{
  success: true
}
```

**Notes:**
- Sets `deleted = false`
- Restores appointment to active

---

## Client Endpoints

### `GET /get-all-clients`
Retrieve all clients.

**Authentication:** Required

**Response:**
```javascript
{
  success: true,
  data: [
    {
      id: number,
      knumber: string,
      firstname: string,
      lastname: string,
      phone: string,
      email: string,
      civicaddress: string,
      city: string,
      prov: string,
      postalcode: string,
      mapaddress: string,
      secondary_civic_address: string,
      secondary_city: string,
      secondary_province: string,
      secondary_postal_code: string,
      secondary_address_notes: string,
      emergency_contact_name: string,
      emergency_contact_number: string,
      appointment_length: number,       // Default duration (minutes)
      primary_clinic_id: number | null,
      clinic_travel_times: object,      // JSONB
      active: boolean,
      notes: string,
      created_at: string,
      updated_at: string
    }
  ]
}
```

---

### `GET /get-active-clients`
Retrieve active clients only.

**Authentication:** Required

**Response:** Same format as `/get-all-clients`

**Filtering:** `active = true`

**Recommended Usage:** Use this for most dropdowns/selects

---

### `GET /getActiveClients` **[ALIAS]**
Alias for `/get-active-clients` (legacy name).

**Authentication:** Required

**Notes:** Use `/get-active-clients` in new code

---

### `POST /add-client`
Create new client.

**Authentication:** Required

**Request:**
```javascript
{
  knumber: string,              // Required, unique
  firstname: string,            // Required
  lastname: string,             // Required
  phone: string,                // Required
  civicaddress: string,         // Required
  city: string,                 // Required
  prov: string,                 // Required (NS, NB, PE, NL)
  postalcode: string,           // Required
  email: string,
  mapaddress: string,
  secondary_civic_address: string,
  secondary_city: string,
  secondary_province: string,
  secondary_postal_code: string,
  secondary_address_notes: string,
  emergency_contact_name: string,
  emergency_contact_number: string,
  appointment_length: number,
  primary_clinic_id: number,
  notes: string,
  active: boolean
}
```

**Response:**
```javascript
{
  success: true,
  data: {...},  // Created client object
  message: "Client created successfully"
}
```

**Validation:**
- K number must be unique
- Phone, email, postal code format validation

---

### `POST /update-client`
Update existing client.

**Authentication:** Required

**Request:**
```javascript
{
  knumber: string,  // Required (identifier, cannot be changed)
  // ... any client fields to update
}
```

**Response:**
```javascript
{
  success: true,
  data: {...}  // Updated client object
}
```

**Notes:**
- K number used as identifier, cannot be changed
- Only provided fields are updated

---

## Driver Endpoints

### `GET /get-all-drivers`
Retrieve all drivers.

**Authentication:** Required

**Response:**
```javascript
{
  success: true,
  data: [
    {
      id: number,
      name: string,
      phone: string,
      email: string,
      google_calendar_id: string,
      active: boolean,
      created_at: string,
      updated_at: string
    }
  ]
}
```

---

### `POST /add-driver-with-calendar`
Create driver and Google Calendar.

**Authentication:** Required (Admin, Supervisor)

**Request:**
```javascript
{
  driver_name: string,  // Required
  phone: string,
  email: string
}
```

**Response:**
```javascript
{
  success: true,
  data: {
    id: number,
    name: string,
    google_calendar_id: string,  // Auto-created calendar ID
    // ... other fields
  }
}
```

**Notes:**
- Automatically creates Google Calendar for driver
- Calendar ID stored in `google_calendar_id` field

---

### `POST /update-driver`
Update driver information.

**Authentication:** Required (Admin, Supervisor)

**Request:**
```javascript
{
  id: number,  // Required
  // ... any driver fields to update
}
```

**Response:**
```javascript
{
  success: true,
  data: {...}  // Updated driver object
}
```

---

## Destination Endpoints

### `GET /get-clinic-locations`
Retrieve active destinations with transformed column names (legacy endpoint for dropdowns).

**Authentication:** Required

**Database Table:** `destinations` (the n8n workflow transforms column names in the response)

**Response:**
```javascript
{
  success: true,
  data: [
    {
      id: number,
      clinic_name: string,       // DB column: name
      full_address: string,      // Composed from: address, city, province, postal_code
      map_coordinates: {
        lat: number,
        lng: number
      },
      phone: string,
      notes: string,
      active: boolean
    }
  ]
}
```

**Use Cases:**
- Appointment location dropdowns
- Travel time calculations
- Map display

### `GET /get-all-destinations`
Retrieve all destinations (active and inactive) with raw column names for management.

**Authentication:** Required (admin, supervisor only)

**Database Table:** `destinations`

**Response:**
```javascript
{
  success: true,
  message: "Retrieved 12 destinations",
  data: [
    {
      id: number,
      name: string,
      address: string,
      city: string,
      province: string,
      postal_code: string,
      phone: string,              // Legacy field, kept for backward compat
      email: string,
      contacts: [                 // JSONB array of contacts
        {
          name: string,
          phone: string,
          email: string,
          type: string            // "main", "billing", "scheduling", "other"
        }
      ],
      notes: string,
      map_coordinates: string,    // Point format "(lat,lng)"
      active: boolean,
      created_at: string,
      updated_at: string
    }
  ],
  count: number,
  timestamp: string
}
```

**Use Cases:**
- Destination management page (destinations.html)

### `POST /add-destination`
Create a new destination.

**Authentication:** Required (admin, supervisor only)

**Request Body:**
```javascript
{
  name: string,            // Required
  address: string,         // Required
  city: string,            // Required
  province: string,        // Required (2-letter code, auto-uppercased)
  postal_code: string,     // Required (auto-uppercased)
  phone: string,           // Optional
  email: string,           // Optional (validated format)
  contacts: [              // Optional JSONB array
    { name: string, phone: string, email: string, type: string }
  ],
  notes: string,           // Optional
  map_coordinates: string, // Optional
  active: boolean          // Optional (default: true)
}
```

**Response:**
```javascript
{
  success: true,
  message: "Destination created successfully",
  data: { /* created destination object */ },
  timestamp: string
}
```

**Notes:**
- Auto-extracts first contact's phone/email into top-level fields for backward compat with `/get-clinic-locations`

### `PUT /update-destination`
Update an existing destination by id.

**Authentication:** Required (admin, supervisor only)

**Request Body:**
```javascript
{
  id: number,              // Required
  // All other fields optional - only provided fields are updated
  name: string,
  address: string,
  city: string,
  province: string,
  postal_code: string,
  phone: string,
  email: string,
  contacts: [],
  notes: string,
  map_coordinates: string,
  active: boolean
}
```

**Response:**
```javascript
{
  success: true,
  message: "Destination updated successfully",
  data: { /* updated destination object */ },
  timestamp: string
}
```

**Notes:**
- Always sets `updated_at` timestamp
- Auto-extracts first contact's phone/email into top-level fields when contacts are updated

---

## User Management Endpoints

### `GET /get-all-users`
Retrieve all users.

**Authentication:** Admin only

**Response:**
```javascript
{
  success: true,
  data: [
    {
      id: number,
      username: string,
      role: string,
      full_name: string,
      active: boolean,
      last_login: string,
      created_at: string
      // password_hash excluded from response
    }
  ]
}
```

---

### `GET /get-booking-agents`
Filter users by booking_agent role.

**Authentication:** Admin, Supervisor

**Response:** Same format as `/get-all-users`

**Filtering:** `role = 'booking_agent'`

**Use Case:** Assignment dropdowns, filtering by specific role

---

### `POST /create-user`
Create new user.

**Authentication:** Admin only

**Request:**
```javascript
{
  username: string,     // Required, email format
  password: string,     // Required, temp password
  role: string,         // Required (admin, supervisor, booking_agent, driver, client)
  full_name: string     // Required
}
```

**Response:**
```javascript
{
  success: true,
  data: {...}  // Created user object (password_hash excluded)
}
```

**Available Roles:**
- `admin` - Full system access
- `supervisor` - Client/appointment/driver management
- `booking_agent` - Create/edit clients and appointments
- `driver` - View own appointments
- `client` - View own appointments

---

### `POST /update-user`
Update user.

**Authentication:** Admin only

**Request:**
```javascript
{
  id: number,  // Required
  // ... any user fields to update
}
```

**Response:**
```javascript
{
  success: true,
  data: {...}  // Updated user object
}
```

---

### `POST /delete-user`
Delete user.

**Authentication:** Admin only

**Request:**
```javascript
{
  id: number
}
```

**Response:**
```javascript
{
  success: true
}
```

**Notes:**
- Hard delete (permanent)
- Cannot delete your own account

---

## Admin Endpoints

### `GET /admin-dashboard`
Retrieve system stats, logs, and security alerts.

**Authentication:** Admin only

**Response:**
```javascript
{
  success: true,
  stats: {
    total_users: number,
    active_users: number,
    total_appointments: number,
    total_clients: number,
    // ... additional stats
  },
  logs: [
    {
      event_type: string,
      event_description: string,
      timestamp: string,
      user: string
    }
  ],
  alerts: [
    {
      type: string,      // warning, error, info
      message: string,
      timestamp: string
    }
  ]
}
```

---

### `POST /store-audit-log`
Create audit log entry.

**Authentication:** Admin, Supervisor

**Request:**
```javascript
{
  event_type: string,           // Required (e.g., "user_login", "appointment_create")
  event_description: string,    // Required
  affected_resource: string,    // Required (e.g., "users.123", "appointments.456")
  old_value: object,            // Optional, for updates
  new_value: object,            // Optional, for updates
  ip_address: string            // Optional
}
```

**Response:**
```javascript
{
  success: true,
  data: {...}  // Created audit log entry
}
```

**Use Cases:**
- Track security events
- Track data changes
- Track user actions

**Event Types:**
- `user_login`, `user_logout`, `failed_login`
- `password_reset`, `password_change`
- `appointment_create`, `appointment_update`, `appointment_delete`
- `client_create`, `client_update`
- `driver_create`, `driver_update`
- `user_create`, `user_update`, `user_delete`

---

## Staging Branch Endpoints

All production endpoints have TEST versions with `TEST-` prefix for safe testing on the staging branch:

**Pattern:** `/TEST-{endpoint-name}`

**Examples:**
- `/TEST-user-login`
- `/TEST-get-all-appointments`
- `/TEST-save-appointment-v7`
- `/TEST-update-client`
- `/TEST-clinic-locations`
- `/TEST-get-all-drivers`

**Configuration:**
- Point to Supabase Testing database
- Use test data (anonymized clients K0000001-K0000011)
- Access via `developing/TEST-*.html` files

**For complete staging branch setup, see:** `docs/reference/TESTING_BRANCH_GUIDE.md`

---

## Usage with API Client Library

**Recommended approach:** Use `APIClient` or convenience APIs instead of direct fetch:

```javascript
// Direct approach (not recommended)
const response = await fetch(
  'https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-clients',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);

// Recommended: APIClient
const clients = await APIClient.get('/get-all-clients');

// Best: Convenience API
const clients = await ClientsAPI.getAll();
```

**For complete API Client documentation, see:** `docs/reference/API_CLIENT_REFERENCE.md`
