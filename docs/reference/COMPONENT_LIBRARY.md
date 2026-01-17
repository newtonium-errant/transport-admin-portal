# Component Library Reference

## Overview

The RRTS application includes reusable modal components for common operations. These components are RBAC-aware, support auto-population of fields, and provide consistent UX patterns across the application.

## AppointmentModal (v2.5.0)

Reusable modal component for creating, editing, and viewing appointments.

**File**: `appointment-modal.js`

**Features**:
- Three modes: add, edit, view
- RBAC-aware (hides fields based on user permissions)
- Auto-populates duration from `client.default_appointment_length`
- Auto-populates transit time from `client.clinic_travel_times`
- Handles array format for save-appointment-v7 endpoint
- Pre-fills client data when opened from clients-sl.html
- Query parameter support (auto-fill from URL)

### Initialization

```javascript
// Include in HTML
<script src="appointment-modal.js"></script>

// Initialize with callbacks
const modal = new AppointmentModal({
    onSave: async (appointment) => {
        // Wrap single appointment in array for v7 endpoint
        const payload = { appointments: [appointment] };
        await saveAppointment(payload);
        await refreshAppointments();
    },
    onDelete: async (appointmentId) => {
        await deleteAppointment(appointmentId);
        await refreshAppointments();
    }
});
```

### Usage Patterns

```javascript
// Open in ADD mode
await modal.open('add');  // Async - wait for clients/drivers to load

// Open in EDIT mode
modal.open('edit', appointmentData);

// Open in VIEW mode (read-only)
modal.open('view', appointmentData);

// Pre-select client (clients-sl.html pattern)
await modal.open('add');  // Must await!
modal.selectClient(knumber, fullName);  // Then call selectClient

// Pre-select clinic
modal.selectClinic('Clinic Name');
```

### Auto-Population

The modal automatically populates fields when a client is selected:

1. **Duration**: From `client.default_appointment_length` (defaults to 120 min if not set)
2. **Transit Time**: From `client.clinic_travel_times[clinicName].primary.duration_minutes`
3. **Pickup Address**: From `client.clinic_travel_times[clinicName].primary.address` or client's primary address

### Client Data Structure

```javascript
{
  knumber: "K1234",
  firstname: "John",
  lastname: "Doe",
  default_appointment_length: 90,  // Auto-populates duration field
  civicaddress: "123 Main St",     // Primary address
  city: "City",
  prov: "NS",
  postalcode: "A1B 2C3",
  clinic_travel_times: {
    "Clinic Name": {
      primary: {
        duration_minutes: 30,        // Auto-populates transit time
        distance_km: 5.2,
        address: "123 Main St..."    // Used for pickup address
      },
      secondary: {
        duration_minutes: 35,
        distance_km: 8.1,
        address: "456 Alt St..."
      }
    }
  }
}
```

### RBAC Behavior

- **Admin/Supervisor**: All fields accessible, can assign drivers
- **Booking Agent**: Cannot assign drivers, driver fields hidden
- **Driver/Client**: Cannot edit (view mode only)

### Common Issues

**TypeError: Cannot read properties of undefined (reading 'filter')**
- **Cause**: `this.clients` not initialized
- **Fixed in**: v2.5.0 (line 34)

**Client not pre-filling**
- **Cause**: `selectClient()` called before `open()` completes
- **Solution**: `await modal.open('add')` then call `selectClient()`

**Duration not loading**
- **Cause**: Field name mismatch or client doesn't have `default_appointment_length`
- **Solution**: Ensure client object includes this field

## ClientModal

Quick edit modal for client information.

**File**: `client-modal.js`

**Features**:
- Inline editing without full page reload
- Primary and secondary address support
- Phone/email validation
- Auto-recalculates travel times on address change
- Emergency contact fields

### Usage

```javascript
// Include in HTML
<script src="client-modal.js"></script>

// Initialize
const clientModal = new ClientModal({
    onSave: async (updatedClient) => {
        // Client updated, refresh list
        await refreshClientList();
    }
});

// Open modal with client data
clientModal.open(clientData);

// Client data format
const clientData = {
    knumber: "K1234",
    firstname: "John",
    lastname: "Doe",
    phone: "902-555-0123",
    email: "john@example.com",
    civicaddress: "123 Main St",
    city: "Halifax",
    prov: "NS",
    postalcode: "B3H 1A1",
    // Secondary address
    secondary_civic_address: "456 Alt St",
    secondary_city: "Dartmouth",
    secondary_province: "NS",
    secondary_postal_code: "B2Y 2C3",
    // Emergency contact
    emergency_contact_name: "Jane Doe",
    emergency_contact_number: "902-555-9999",
    // Settings
    active: true,
    notes: "Special instructions..."
};
```

### Field Validation

- **Phone**: Format (902-555-1234) or (902) 555-1234
- **Email**: Valid email format
- **Postal Code**: Canadian format (A1B 2C3)
- **K Number**: Cannot be changed (read-only in edit mode)

### Auto-Calculations

- When address changes, travel times to clinics are recalculated
- Uses Google Maps API or pre-calculated lookup table

## ClientQuickView

Read-only modal for viewing client details.

**File**: `client-quick-view.js`

**Features**:
- Fast, read-only client information display
- Shows all addresses (primary + secondary)
- Displays travel times to common clinics
- Shows recent appointment history
- Emergency contact information

### Usage

```javascript
// Include in HTML
<script src="client-quick-view.js"></script>

// Show client quick view
showClientQuickView(knumber);

// Or with full client object
showClientQuickView(knumber, clientData);
```

### Display Sections

1. **Client Information**
   - Name, K number, phone, email
   - Active status

2. **Addresses**
   - Primary address
   - Secondary address (if exists)
   - Address notes

3. **Travel Times**
   - Distance and duration to each clinic
   - Primary vs secondary route comparison

4. **Emergency Contact**
   - Name and phone number

5. **Recent Appointments**
   - Last 5 appointments
   - Status and dates

### RBAC

- All roles can view client information (with appropriate data filtering)
- Cost information hidden for booking_agent role

## Component Usage Best Practices

### 1. Always await modal.open() for AppointmentModal

```javascript
// ✅ Good
await modal.open('add');
modal.selectClient(knumber);

// ❌ Bad - race condition
modal.open('add');
modal.selectClient(knumber);  // May fail if clients not loaded
```

### 2. Pass callbacks for data refresh

```javascript
// ✅ Good - refreshes after save
const modal = new AppointmentModal({
    onSave: async () => await refreshAppointments()
});

// ❌ Bad - stale data shown
const modal = new AppointmentModal({});
```

### 3. Use appropriate modal for task

```javascript
// ✅ Good - quick edits use ClientModal
clientModal.open(clientData);

// ❌ Overkill - don't navigate to full page for simple edit
window.location.href = `client-management.html?k=${knumber}`;
```

### 4. Handle errors gracefully

```javascript
try {
    await modal.open('add');
} catch (error) {
    console.error('Failed to load modal:', error);
    alert('Unable to open appointment form. Please refresh and try again.');
}
```

## Error Handling Pattern

```javascript
try {
    const response = await fetch(endpoint, options);
    const data = await response.json();

    if (!response.ok || !data.success) {
        alert(data.message || 'Operation failed');
        return;
    }

    // Handle success
} catch (error) {
    console.error('Error:', error);
    alert('An error occurred. Please try again.');
}
```

## Related Documentation

- **CLAUDE.md** - Project overview and architecture
- **API_CLIENT_REFERENCE.md** - API client usage with components
- **TESTING_GUIDE.md** - Component testing guidelines
