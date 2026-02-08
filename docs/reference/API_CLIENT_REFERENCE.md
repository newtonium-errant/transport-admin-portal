# API Client Library Reference

## Overview

The API Client Library (`api-client.js`) provides a simplified, modern interface for making authenticated API calls. It wraps the native `fetch()` API with automatic JWT token management, standardized error handling, and convenient method wrappers for common operations.

**Key Benefits:**
- ✅ Automatic JWT token inclusion and refresh
- ✅ Standardized error handling with custom `APIError` class
- ✅ Automatic 401 logout and redirect
- ✅ CSRF protection headers
- ✅ Request logging in development
- ✅ Convenience APIs for common endpoints
- ✅ Support for batch/parallel requests

## Core APIClient Methods

### `APIClient.get(endpoint, queryParams?)`
Make an authenticated GET request.

**Parameters:**
- `endpoint` (string) - API endpoint path (e.g., `/get-all-clients`)
- `queryParams` (object, optional) - Query string parameters

**Returns:** `Promise<object>` - Response data

**Example:**
```javascript
// Simple GET
const appointments = await APIClient.get('/get-all-appointments');

// GET with query parameters
const filtered = await APIClient.get('/get-appointments', {
    status: 'scheduled',
    date: '2025-11-08'
});
// Calls: /get-appointments?status=scheduled&date=2025-11-08
```

### `APIClient.post(endpoint, data)`
Make an authenticated POST request.

**Parameters:**
- `endpoint` (string) - API endpoint path
- `data` (object) - Request body (auto-serialized to JSON)

**Returns:** `Promise<object>` - Response data

**Example:**
```javascript
const appointmentData = {
    appointments: [{
        knumber: "K1234",
        appointmentDateTime: "2025-11-08T14:00:00.000Z",
        appointmentLength: 90,
        status: "pending"
    }]
};

const result = await APIClient.post('/save-appointment-v7', appointmentData);
console.log(result.message); // "Appointments saved successfully"
```

### `APIClient.put(endpoint, data)`
Make an authenticated PUT request.

**Parameters:**
- `endpoint` (string) - API endpoint path
- `data` (object) - Request body

**Returns:** `Promise<object>` - Response data

**Example:**
```javascript
const updateData = {
    id: 123,
    status: 'completed',
    notes: 'Appointment completed successfully'
};

const result = await APIClient.put('/update-appointment-complete', updateData);
```

### `APIClient.delete(endpoint, data?)`
Make an authenticated DELETE request.

**Parameters:**
- `endpoint` (string) - API endpoint path
- `data` (object, optional) - Request body

**Returns:** `Promise<object>` - Response data

**Example:**
```javascript
// Delete with ID in body
await APIClient.delete('/delete-appointment-with-calendar', { id: 123 });

// Delete with ID in URL
await APIClient.delete('/delete-user/456');
```

### `APIClient.upload(endpoint, formData)`
Upload a file with multipart/form-data.

**Parameters:**
- `endpoint` (string) - API endpoint path
- `formData` (FormData) - Form data containing file

**Returns:** `Promise<object>` - Response data

**Example:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('description', 'Medical document');

const result = await APIClient.upload('/upload-document', formData);
console.log(result.data.fileUrl);
```

### `APIClient.batch(requests)`
Execute multiple requests in parallel.

**Parameters:**
- `requests` (Array<Promise>) - Array of API request promises

**Returns:** `Promise<Array>` - Array of results (preserves order)

**Example:**
```javascript
// Load multiple datasets in parallel
const [appointments, clients, drivers] = await APIClient.batch([
    APIClient.get('/get-all-appointments'),
    APIClient.get('/get-all-clients'),
    APIClient.get('/get-all-drivers')
]);

// All three requests execute simultaneously
// Results returned in same order as requests
```

## Convenience APIs

Pre-configured wrappers for common endpoints. Eliminate boilerplate code.

### AppointmentsAPI

**`AppointmentsAPI.getAll()`**
```javascript
// Equivalent to: APIClient.get('/get-all-appointments')
const appointments = await AppointmentsAPI.getAll();
```

**`AppointmentsAPI.getActive()`**
```javascript
// Get active/present/future appointments only
const active = await AppointmentsAPI.getActive();
```

**`AppointmentsAPI.getOperations()`**
```javascript
// Get appointments for operations dashboard
const operations = await AppointmentsAPI.getOperations();
```

**`AppointmentsAPI.save(data)`**
```javascript
const appointmentData = {
    appointments: [{ /* appointment object */ }]
};
const result = await AppointmentsAPI.save(appointmentData);
```

**`AppointmentsAPI.update(data)`**
```javascript
const updateData = {
    id: 123,
    status: 'completed'
};
await AppointmentsAPI.update(updateData);
```

**`AppointmentsAPI.delete(id)`**
```javascript
// Deletes appointment and removes from Google Calendar
await AppointmentsAPI.delete(123);
```

### ClientsAPI

**`ClientsAPI.getAll()`**
```javascript
const allClients = await ClientsAPI.getAll();
```

**`ClientsAPI.getActive()`**
```javascript
// Only active clients (active = true)
const activeClients = await ClientsAPI.getActive();
```

**`ClientsAPI.add(data)`**
```javascript
const clientData = {
    knumber: "K1234",
    firstname: "John",
    lastname: "Doe",
    phone: "902-555-0123",
    civicaddress: "123 Main St"
};
const result = await ClientsAPI.add(clientData);
```

**`ClientsAPI.update(data)`**
```javascript
const updateData = {
    knumber: "K1234",
    phone: "902-555-9999"
};
await ClientsAPI.update(updateData);
```

### DriversAPI

**`DriversAPI.getAll()`**
```javascript
const drivers = await DriversAPI.getAll();
```

**`DriversAPI.add(data)`**
```javascript
// Creates driver AND Google Calendar
const driverData = {
    driver_name: "Jane Smith",
    phone: "902-555-0456",
    email: "jane@example.com"
};
const result = await DriversAPI.add(driverData);
console.log(result.data.google_calendar_id); // Created calendar ID
```

**`DriversAPI.update(data)`**
```javascript
const updateData = {
    id: 5,
    phone: "902-555-7777"
};
await DriversAPI.update(updateData);
```

### UsersAPI

**Admin only** - These endpoints require admin role.

**`UsersAPI.getAll()`**
```javascript
const users = await UsersAPI.getAll();
```

**`UsersAPI.create(data)`**
```javascript
const userData = {
    username: "newuser@example.com",
    password: "TempPassword123!",
    role: "booking_agent",
    full_name: "New User"
};
const result = await UsersAPI.create(userData);
```

**`UsersAPI.update(data)`**
```javascript
const updateData = {
    id: 15,
    role: "supervisor"
};
await UsersAPI.update(updateData);
```

**`UsersAPI.delete(id)`**
```javascript
await UsersAPI.delete(15);
```

**`UsersAPI.resetPassword(username)`**
```javascript
// Triggers password reset (sends email or creates limited token)
await UsersAPI.resetPassword("user@example.com");
```

## Error Handling

### APIError Class

All API errors throw a custom `APIError` instance:

```javascript
class APIError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'APIError';
        this.status = status;  // HTTP status code
        this.data = data;      // Full response data
    }
}
```

### Error Handling Patterns

**Basic try/catch:**
```javascript
try {
    const result = await APIClient.post('/save-appointment', data);
    alert('Appointment saved successfully!');
} catch (error) {
    if (error instanceof APIClient.APIError) {
        alert(`Error: ${error.message}`);
        console.error('Status:', error.status);
        console.error('Data:', error.data);
    } else {
        alert('Network error occurred');
    }
}
```

**Handle specific status codes:**
```javascript
try {
    await APIClient.post('/update-client', clientData);
} catch (error) {
    switch (error.status) {
        case 400:
            alert('Validation error: ' + error.message);
            break;
        case 401:
            // Auto-handled: logout and redirect
            break;
        case 403:
            alert('Permission denied');
            break;
        case 404:
            alert('Resource not found');
            break;
        case 500:
            alert('Server error. Please try again later.');
            break;
        default:
            alert('An error occurred: ' + error.message);
    }
}
```

**Extract validation errors:**
```javascript
try {
    await ClientsAPI.add(clientData);
} catch (error) {
    if (error.status === 400 && error.data.errors) {
        // Display field-specific errors
        Object.entries(error.data.errors).forEach(([field, message]) => {
            document.getElementById(`${field}-error`).textContent = message;
        });
    }
}
```

### Automatic 401 Handling

**401 (Unauthorized) responses trigger automatic logout:**

```javascript
// No manual handling needed
try {
    await APIClient.get('/get-all-appointments');
} catch (error) {
    // If error.status === 401:
    // 1. JWTManager.clearTokens() called automatically
    // 2. Alert shown: "Your session has expired. Please log in again."
    // 3. Redirect to dashboard.html
}
```

## Advanced Usage

### Custom Headers

```javascript
const response = await APIClient.request('/custom-endpoint', {
    method: 'POST',
    headers: {
        'X-Custom-Header': 'value',
        'Accept-Language': 'en-US'
    },
    body: JSON.stringify({ data: 'value' })
});
```

### Query Parameters (Multiple Methods)

```javascript
// Method 1: Object parameter (recommended)
const results = await APIClient.get('/search', {
    query: 'John',
    status: 'active',
    limit: 10
});

// Method 2: Manual URLSearchParams
const params = new URLSearchParams({
    query: 'John',
    status: 'active'
});
const results = await APIClient.get(`/search?${params.toString()}`);
```

### Response Transformation

```javascript
// Extract just the data array
const appointments = await AppointmentsAPI.getAll();
const appointmentArray = appointments.data || appointments;

// Map to simplified format
const simplifiedAppointments = appointmentArray.map(apt => ({
    id: apt.id,
    client: apt.knumber,
    date: apt.appt_date,
    time: apt.appt_time
}));
```

### Retry Logic (Custom Implementation)

```javascript
async function retryRequest(requestFn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            if (error.status === 401 || error.status === 403) throw error;

            console.log(`Retry ${i + 1}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// Usage
const data = await retryRequest(() => APIClient.get('/unreliable-endpoint'));
```

## Migration from Legacy Patterns

### Before: Manual fetch() calls

```javascript
// ❌ OLD PATTERN - Don't use
const token = sessionStorage.getItem('rrts_access_token');
const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-clients', {
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }
});
const data = await response.json();
if (!response.ok) {
    alert('Error: ' + data.message);
}
```

### After: APIClient

```javascript
// ✅ NEW PATTERN - Use this
try {
    const data = await APIClient.get('/get-all-clients');
    // Or even simpler:
    const data = await ClientsAPI.getAll();
} catch (error) {
    alert('Error: ' + error.message);
}
```

### Real-World Migration Examples

**Example 1: Loading page data**
```javascript
// Before (appointments-new.html - old pattern)
async function loadPageData() {
    const token = sessionStorage.getItem('rrts_access_token');

    const [apptRes, clientRes, driverRes] = await Promise.all([
        fetch(apiBaseUrl + '/get-all-appointments', {
            headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(apiBaseUrl + '/get-all-clients', {
            headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(apiBaseUrl + '/get-all-drivers', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
    ]);

    const appointments = await apptRes.json();
    const clients = await clientRes.json();
    const drivers = await driverRes.json();
}

// After (appointments-sl.html - new pattern)
async function loadPageData() {
    const [appointments, clients, drivers] = await APIClient.batch([
        AppointmentsAPI.getAll(),
        ClientsAPI.getAll(),
        DriversAPI.getAll()
    ]);
}
```

**Example 2: Saving appointment**
```javascript
// Before
async function saveAppointment(data) {
    const token = sessionStorage.getItem('rrts_access_token');
    const response = await fetch(apiBaseUrl + '/save-appointment-v7', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(result.message || 'Save failed');
    }

    return result;
}

// After
async function saveAppointment(data) {
    return await APIClient.post('/save-appointment-v7', data);
    // Or:
    return await AppointmentsAPI.save(data);
}
```

## Best Practices

### 1. Always use convenience APIs when available
```javascript
// ✅ Good
const clients = await ClientsAPI.getAll();

// ⚠️ Works but verbose
const clients = await APIClient.get('/get-all-clients');
```

### 2. Use batch() for parallel requests
```javascript
// ✅ Good - loads in parallel
const [a, b, c] = await APIClient.batch([
    AppointmentsAPI.getAll(),
    ClientsAPI.getAll(),
    DriversAPI.getAll()
]);

// ❌ Bad - loads sequentially (slower)
const a = await AppointmentsAPI.getAll();
const b = await ClientsAPI.getAll();
const c = await DriversAPI.getAll();
```

### 3. Handle errors gracefully
```javascript
// ✅ Good
try {
    await ClientsAPI.add(clientData);
    showSuccessMessage();
} catch (error) {
    showErrorMessage(error.message);
    logErrorToConsole(error);
}

// ❌ Bad - unhandled errors crash the app
await ClientsAPI.add(clientData);
showSuccessMessage();
```

### 4. Don't catch 401 errors manually
```javascript
// ✅ Good - let APIClient handle 401
try {
    await APIClient.get('/endpoint');
} catch (error) {
    if (error.status === 400) {
        // Handle validation errors
    }
    // 401 already handled automatically
}

// ❌ Bad - redundant 401 handling
try {
    await APIClient.get('/endpoint');
} catch (error) {
    if (error.status === 401) {
        window.location.href = 'dashboard.html'; // Already done!
    }
}
```

### 5. Validate data before sending
```javascript
// ✅ Good
function saveClient(clientData) {
    // Validate first
    if (!clientData.knumber) {
        alert('K number is required');
        return;
    }

    if (!clientData.firstname || !clientData.lastname) {
        alert('Name is required');
        return;
    }

    // Then send
    return ClientsAPI.add(clientData);
}
```

## Related Documentation

- **CLAUDE.md** - Project overview and architecture
- **API_ENDPOINTS.md** - Complete endpoint reference
- **Authentication Architecture** - JWT system and token management
