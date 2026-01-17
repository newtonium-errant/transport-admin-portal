# Client Profile Page - Implementation Guide

## Overview
Single-page client profile with role-based field access. All fields displayed in one scrolling form with section headers for organization.

---

## Page Structure

### File: `client-profile.html`

Single scrolling form with 6 sections:
1. **Basic Information** - K-number, name, status
2. **Contact Information** - Phone, email
3. **Primary Address** - Civic address, city, province, postal code, map address
4. **Secondary Address** - All secondary address fields
5. **Preferences & Notes** - Driver preferences, appointment length, notes, emergency contact
6. **System Information** - Created date, OpenPhone sync, clinic travel times

---

## Field Access Rules

### All Fields from clients table (29 total):

| Field | Booking Agent | Supervisor | Admin | Notes |
|-------|---------------|------------|-------|-------|
| `id` | Hidden | Hidden | Read-only | Display only |
| `created_at` | Read-only | Read-only | Read-only | Display formatted |
| `knumber` | Editable | Editable | Editable | Unique identifier |
| `phone` | Editable | Editable | Editable | |
| `email` | Editable | Editable | Editable | |
| `firstname` | Editable | Editable | Editable | |
| `lastname` | Editable | Editable | Editable | |
| `civicaddress` | Editable | Editable | Editable | Primary address |
| `city` | Editable | Editable | Editable | |
| `prov` | Editable | Editable | Editable | Dropdown: NS, NB, PE |
| `postalcode` | Editable | Editable | Editable | |
| `mapaddress` | Editable | Editable | Editable | Google Maps address |
| `secondary_civic_address` | Editable | Editable | Editable | |
| `secondary_city` | Editable | Editable | Editable | |
| `secondary_province` | Editable | Editable | Editable | Dropdown: NS, NB, PE |
| `secondary_postal_code` | Editable | Editable | Editable | |
| `secondary_address_notes` | Editable | Editable | Editable | Textarea |
| `notes` | Editable | Editable | Editable | Textarea |
| `emergency_contact_name` | Editable | Editable | Editable | |
| `emergency_contact_number` | Editable | Editable | Editable | |
| `driver_gender_requirement` | Editable | Editable | Editable | Dropdown: any, male, female |
| `preferred_driver` | Editable | Editable | Editable | Dropdown from drivers |
| `appointment_length` | Editable | Editable | Editable | Number input (minutes) |
| `active` | Editable | Editable | Editable | Checkbox |
| `status` | Editable | Editable | Editable | Dropdown: active, inactive, archived |
| `openphone_contact_id` | Read-only | Read-only | Editable | OpenPhone sync |
| `openphone_sync_status` | Read-only | Read-only | Read-only | Display badge |
| `openphone_sync_date` | Read-only | Read-only | Read-only | Display formatted |
| `clinic_travel_times` | Read-only + Button | Read-only + Button | Editable | JSONB field |
| `primary_clinic_id` | Editable | Editable | Editable | **NEW FIELD** - Dropdown |

---

## HTML Structure

### Page Layout

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Client Profile - RRTS</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="shared-styles.css">
    <link rel="stylesheet" href="css/client-profile.css">
</head>
<body>
    <!-- Header with navigation (same pattern as other pages) -->
    <header id="main-header"></header>

    <div class="container-fluid py-4">
        <!-- Breadcrumb Navigation -->
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="dashboard.html">Dashboard</a></li>
                <li class="breadcrumb-item"><a href="clients-sl.html">Clients</a></li>
                <li class="breadcrumb-item active" id="breadcrumb-client-name">Loading...</li>
            </ol>
        </nav>

        <!-- Page Header -->
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h1 class="h3 mb-1" id="page-title">Client Profile</h1>
                <p class="text-muted mb-0" id="client-knumber">Loading...</p>
            </div>
            <div>
                <button type="button" class="btn btn-secondary me-2" id="btn-cancel">
                    Cancel
                </button>
                <button type="button" class="btn btn-primary" id="btn-save">
                    Save Changes
                </button>
            </div>
        </div>

        <!-- Loading State -->
        <div id="loading-state" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading client...</span>
            </div>
            <p class="mt-3 text-muted">Loading client profile...</p>
        </div>

        <!-- Error State -->
        <div id="error-state" class="alert alert-danger d-none" role="alert">
            <h4 class="alert-heading">Error Loading Client</h4>
            <p id="error-message"></p>
            <hr>
            <a href="clients-sl.html" class="btn btn-outline-danger">Return to Client List</a>
        </div>

        <!-- Client Profile Form -->
        <form id="client-profile-form" class="d-none">

            <!-- Section 1: Basic Information -->
            <div class="card mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">Basic Information</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="knumber" class="form-label">K Number <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="knumber" required>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="status" class="form-label">Status</label>
                            <select class="form-select" id="status">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="firstname" class="form-label">First Name <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="firstname" required>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="lastname" class="form-label">Last Name <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="lastname" required>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="active">
                                <label class="form-check-label" for="active">
                                    Active Client
                                </label>
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Created Date</label>
                            <input type="text" class="form-control" id="created_at" readonly>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 2: Contact Information -->
            <div class="card mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">Contact Information</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="phone" class="form-label">Phone Number <span class="text-danger">*</span></label>
                            <input type="tel" class="form-control" id="phone" required>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="email" class="form-label">Email Address</label>
                            <input type="email" class="form-control" id="email">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="emergency_contact_name" class="form-label">Emergency Contact Name</label>
                            <input type="text" class="form-control" id="emergency_contact_name">
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="emergency_contact_number" class="form-label">Emergency Contact Number</label>
                            <input type="tel" class="form-control" id="emergency_contact_number">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 3: Primary Address -->
            <div class="card mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">Primary Address</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-12 mb-3">
                            <label for="civicaddress" class="form-label">Street Address <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="civicaddress" required>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-5 mb-3">
                            <label for="city" class="form-label">City <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="city" required>
                        </div>
                        <div class="col-md-4 mb-3">
                            <label for="prov" class="form-label">Province <span class="text-danger">*</span></label>
                            <select class="form-select" id="prov" required>
                                <option value="">Select Province</option>
                                <option value="NS">Nova Scotia</option>
                                <option value="NB">New Brunswick</option>
                                <option value="PE">Prince Edward Island</option>
                            </select>
                        </div>
                        <div class="col-md-3 mb-3">
                            <label for="postalcode" class="form-label">Postal Code <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" id="postalcode" required>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-12 mb-3">
                            <label for="mapaddress" class="form-label">Google Maps Address</label>
                            <input type="text" class="form-control" id="mapaddress">
                            <small class="form-text text-muted">Full address formatted for Google Maps (if different from civic address)</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 4: Secondary Address -->
            <div class="card mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">Secondary Address (Optional)</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-12 mb-3">
                            <label for="secondary_civic_address" class="form-label">Street Address</label>
                            <input type="text" class="form-control" id="secondary_civic_address">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-5 mb-3">
                            <label for="secondary_city" class="form-label">City</label>
                            <input type="text" class="form-control" id="secondary_city">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label for="secondary_province" class="form-label">Province</label>
                            <select class="form-select" id="secondary_province">
                                <option value="">Select Province</option>
                                <option value="NS">Nova Scotia</option>
                                <option value="NB">New Brunswick</option>
                                <option value="PE">Prince Edward Island</option>
                            </select>
                        </div>
                        <div class="col-md-3 mb-3">
                            <label for="secondary_postal_code" class="form-label">Postal Code</label>
                            <input type="text" class="form-control" id="secondary_postal_code">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-12 mb-3">
                            <label for="secondary_address_notes" class="form-label">Secondary Address Notes</label>
                            <textarea class="form-control" id="secondary_address_notes" rows="3"></textarea>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 5: Preferences & Notes -->
            <div class="card mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">Preferences & Notes</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="primary_clinic_id" class="form-label">Primary Clinic</label>
                            <select class="form-select" id="primary_clinic_id">
                                <option value="">No Primary Clinic</option>
                                <!-- Populated from /webhook/clinic-locations -->
                            </select>
                            <small class="form-text text-muted">Default clinic for new appointments</small>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="appointment_length" class="form-label">Default Appointment Length (minutes)</label>
                            <input type="number" class="form-control" id="appointment_length" min="15" step="15">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="driver_gender_requirement" class="form-label">Driver Gender Requirement</label>
                            <select class="form-select" id="driver_gender_requirement">
                                <option value="any">Any</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="preferred_driver" class="form-label">Preferred Driver</label>
                            <select class="form-select" id="preferred_driver">
                                <option value="">No Preference</option>
                                <!-- Populated from /webhook/get-all-drivers -->
                            </select>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-12 mb-3">
                            <label for="notes" class="form-label">Client Notes</label>
                            <textarea class="form-control" id="notes" rows="4"></textarea>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 6: System Information -->
            <div class="card mb-4">
                <div class="card-header bg-secondary text-white">
                    <h5 class="mb-0">System Information</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="openphone_contact_id" class="form-label">OpenPhone Contact ID</label>
                            <input type="text" class="form-control" id="openphone_contact_id">
                        </div>
                        <div class="col-md-3 mb-3">
                            <label for="openphone_sync_status" class="form-label">Sync Status</label>
                            <div class="mt-2">
                                <span class="badge" id="openphone_sync_status_badge">Unknown</span>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <label for="openphone_sync_date" class="form-label">Last Synced</label>
                            <input type="text" class="form-control" id="openphone_sync_date" readonly>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-12 mb-3">
                            <label class="form-label">Clinic Travel Times</label>
                            <div class="d-flex align-items-center">
                                <textarea class="form-control me-2" id="clinic_travel_times" rows="3" readonly></textarea>
                                <button type="button" class="btn btn-outline-primary" id="btn-recalculate-travel-times">
                                    Recalculate
                                </button>
                            </div>
                            <small class="form-text text-muted">Travel times to each clinic (JSONB data)</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Form Actions (Sticky Footer) -->
            <div class="sticky-form-actions bg-white border-top p-3 mt-4">
                <div class="container-fluid">
                    <div class="d-flex justify-content-end">
                        <button type="button" class="btn btn-secondary me-2" id="btn-cancel-bottom">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary" id="btn-save-bottom">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

        </form>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="js/auth.js"></script>
    <script src="js/permissions.js"></script>
    <script src="js/client-profile.js"></script>
</body>
</html>
```

---

## JavaScript Controller

### File: `js/client-profile.js`

```javascript
// Client Profile Page Controller - v1.0.0

// Workflow endpoints
const ENDPOINTS = {
    getClient: '/webhook/get-client',
    updateClient: '/webhook/update-client',
    getClinics: '/webhook/clinic-locations',
    getDrivers: '/webhook/get-all-drivers'
};

// Global state
let currentClient = null;
let userRole = null;
let clinics = [];
let drivers = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const savedUser = sessionStorage.getItem('rrts_user');
    if (!savedUser) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);
    userRole = user.role;

    // Check page access
    if (!hasPageAccess(userRole, 'client-management')) {
        alert('You do not have permission to access this page.');
        window.location.href = 'dashboard.html';
        return;
    }

    // Get K-number from URL
    const urlParams = new URLSearchParams(window.location.search);
    const knumber = urlParams.get('knumber');

    if (!knumber) {
        showError('No client K-number provided');
        return;
    }

    // Load data
    await loadDropdownData();
    await loadClient(knumber);

    // Setup event listeners
    setupEventListeners();
});

// Load clinics and drivers for dropdowns
async function loadDropdownData() {
    try {
        // Load clinics
        const clinicsResponse = await fetch(`${API_BASE_URL}${ENDPOINTS.getClinics}`);
        const clinicsData = await clinicsResponse.json();
        if (clinicsData.success && clinicsData.clinics) {
            clinics = clinicsData.clinics;
            populateClinicsDropdown();
        }

        // Load drivers
        const driversResponse = await fetch(`${API_BASE_URL}${ENDPOINTS.getDrivers}`);
        const driversData = await driversResponse.json();
        if (driversData.success && driversData.drivers) {
            drivers = driversData.drivers.filter(d => d.active);
            populateDriversDropdown();
        }
    } catch (error) {
        console.error('Error loading dropdown data:', error);
    }
}

// Populate clinics dropdown
function populateClinicsDropdown() {
    const select = document.getElementById('primary_clinic_id');

    // Clear existing options (except "No Primary Clinic")
    select.innerHTML = '<option value="">No Primary Clinic</option>';

    // Add clinic options
    clinics.forEach(clinic => {
        const option = document.createElement('option');
        option.value = clinic.id;
        option.textContent = `${clinic.name} - ${clinic.city}`;
        select.appendChild(option);
    });
}

// Populate drivers dropdown
function populateDriversDropdown() {
    const select = document.getElementById('preferred_driver');

    // Clear existing options (except "No Preference")
    select.innerHTML = '<option value="">No Preference</option>';

    // Add driver options
    drivers.forEach(driver => {
        const option = document.createElement('option');
        option.value = driver.id;
        option.textContent = `${driver.name}`;
        select.appendChild(option);
    });
}

// Load client data
async function loadClient(knumber) {
    try {
        showLoading();

        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.getClient}?knumber=${knumber}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            showError(data.message || 'Failed to load client');
            return;
        }

        currentClient = data.client;
        populateForm(currentClient);
        applyRoleBasedPermissions();
        showForm();

    } catch (error) {
        console.error('Error loading client:', error);
        showError('An error occurred while loading the client');
    }
}

// Populate form with client data
function populateForm(client) {
    // Basic Information
    document.getElementById('knumber').value = client.knumber || '';
    document.getElementById('firstname').value = client.firstname || '';
    document.getElementById('lastname').value = client.lastname || '';
    document.getElementById('status').value = client.status || 'active';
    document.getElementById('active').checked = client.active === true;

    // Format created_at
    if (client.created_at) {
        const date = new Date(client.created_at);
        document.getElementById('created_at').value = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Contact Information
    document.getElementById('phone').value = client.phone || '';
    document.getElementById('email').value = client.email || '';
    document.getElementById('emergency_contact_name').value = client.emergency_contact_name || '';
    document.getElementById('emergency_contact_number').value = client.emergency_contact_number || '';

    // Primary Address
    document.getElementById('civicaddress').value = client.civicaddress || '';
    document.getElementById('city').value = client.city || '';
    document.getElementById('prov').value = client.prov || '';
    document.getElementById('postalcode').value = client.postalcode || '';
    document.getElementById('mapaddress').value = client.mapaddress || '';

    // Secondary Address
    document.getElementById('secondary_civic_address').value = client.secondary_civic_address || '';
    document.getElementById('secondary_city').value = client.secondary_city || '';
    document.getElementById('secondary_province').value = client.secondary_province || '';
    document.getElementById('secondary_postal_code').value = client.secondary_postal_code || '';
    document.getElementById('secondary_address_notes').value = client.secondary_address_notes || '';

    // Preferences & Notes
    document.getElementById('primary_clinic_id').value = client.primary_clinic_id || '';
    document.getElementById('appointment_length').value = client.appointment_length || '';
    document.getElementById('driver_gender_requirement').value = client.driver_gender_requirement || 'any';
    document.getElementById('preferred_driver').value = client.preferred_driver || '';
    document.getElementById('notes').value = client.notes || '';

    // System Information
    document.getElementById('openphone_contact_id').value = client.openphone_contact_id || '';

    // OpenPhone sync status badge
    const syncBadge = document.getElementById('openphone_sync_status_badge');
    if (client.openphone_sync_status === 'synced') {
        syncBadge.textContent = 'Synced';
        syncBadge.className = 'badge bg-success';
    } else if (client.openphone_sync_status === 'pending') {
        syncBadge.textContent = 'Pending';
        syncBadge.className = 'badge bg-warning';
    } else {
        syncBadge.textContent = 'Not Synced';
        syncBadge.className = 'badge bg-secondary';
    }

    // Format sync date
    if (client.openphone_sync_date) {
        const syncDate = new Date(client.openphone_sync_date);
        document.getElementById('openphone_sync_date').value = syncDate.toLocaleString('en-US');
    }

    // Clinic travel times (format JSONB)
    if (client.clinic_travel_times) {
        document.getElementById('clinic_travel_times').value = JSON.stringify(client.clinic_travel_times, null, 2);
    }

    // Update page header
    document.getElementById('page-title').textContent = `${client.firstname} ${client.lastname}`;
    document.getElementById('client-knumber').textContent = client.knumber;
    document.getElementById('breadcrumb-client-name').textContent = `${client.firstname} ${client.lastname}`;
}

// Apply role-based field permissions
function applyRoleBasedPermissions() {
    const isAdmin = userRole === 'admin';
    const isBookingOrSuper = ['booking_agent', 'supervisor'].includes(userRole);

    // Fields that are read-only for booking agents and supervisors
    const readOnlyForNonAdmin = [
        'created_at',
        'clinic_travel_times',
        'openphone_sync_status',
        'openphone_sync_date'
    ];

    // Fields that are editable only for admins
    const adminOnlyFields = [
        'openphone_contact_id'
    ];

    // Apply read-only to appropriate fields
    readOnlyForNonAdmin.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.setAttribute('readonly', 'readonly');
            field.classList.add('bg-light');
        }
    });

    // Admin-only fields
    adminOnlyFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            if (!isAdmin) {
                field.setAttribute('readonly', 'readonly');
                field.classList.add('bg-light');
            }
        }
    });

    // clinic_travel_times - admin can edit, others read-only with recalculate button
    const travelTimesField = document.getElementById('clinic_travel_times');
    const recalcButton = document.getElementById('btn-recalculate-travel-times');

    if (isAdmin) {
        travelTimesField.removeAttribute('readonly');
        travelTimesField.classList.remove('bg-light');
        recalcButton.style.display = 'none'; // Admins can edit directly
    } else {
        recalcButton.style.display = 'inline-block'; // Others use button
    }
}

// Setup event listeners
function setupEventListeners() {
    // Form submit
    const form = document.getElementById('client-profile-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveClient();
    });

    // Save buttons (top and bottom)
    document.getElementById('btn-save').addEventListener('click', async () => {
        await saveClient();
    });
    document.getElementById('btn-save-bottom').addEventListener('click', async () => {
        await saveClient();
    });

    // Cancel buttons
    document.getElementById('btn-cancel').addEventListener('click', () => {
        window.location.href = 'clients-sl.html';
    });
    document.getElementById('btn-cancel-bottom').addEventListener('click', () => {
        window.location.href = 'clients-sl.html';
    });

    // Recalculate travel times button
    document.getElementById('btn-recalculate-travel-times').addEventListener('click', async () => {
        await recalculateTravelTimes();
    });
}

// Save client changes
async function saveClient() {
    try {
        // Collect form data
        const clientData = {
            knumber: document.getElementById('knumber').value.trim(),
            firstname: document.getElementById('firstname').value.trim(),
            lastname: document.getElementById('lastname').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            email: document.getElementById('email').value.trim(),
            civicaddress: document.getElementById('civicaddress').value.trim(),
            city: document.getElementById('city').value.trim(),
            prov: document.getElementById('prov').value,
            postalcode: document.getElementById('postalcode').value.trim(),
            mapaddress: document.getElementById('mapaddress').value.trim(),
            secondary_civic_address: document.getElementById('secondary_civic_address').value.trim(),
            secondary_city: document.getElementById('secondary_city').value.trim(),
            secondary_province: document.getElementById('secondary_province').value,
            secondary_postal_code: document.getElementById('secondary_postal_code').value.trim(),
            secondary_address_notes: document.getElementById('secondary_address_notes').value.trim(),
            notes: document.getElementById('notes').value.trim(),
            emergency_contact_name: document.getElementById('emergency_contact_name').value.trim(),
            emergency_contact_number: document.getElementById('emergency_contact_number').value.trim(),
            driver_gender_requirement: document.getElementById('driver_gender_requirement').value,
            preferred_driver: document.getElementById('preferred_driver').value || null,
            appointment_length: document.getElementById('appointment_length').value || null,
            active: document.getElementById('active').checked,
            status: document.getElementById('status').value,
            primary_clinic_id: document.getElementById('primary_clinic_id').value || null
        };

        // Admin-only fields
        if (userRole === 'admin') {
            clientData.openphone_contact_id = document.getElementById('openphone_contact_id').value.trim();

            // Parse clinic_travel_times if admin edited it
            const travelTimesRaw = document.getElementById('clinic_travel_times').value.trim();
            if (travelTimesRaw) {
                try {
                    clientData.clinic_travel_times = JSON.parse(travelTimesRaw);
                } catch (e) {
                    alert('Invalid JSON in Clinic Travel Times field');
                    return;
                }
            }
        }

        // Validate required fields
        if (!clientData.knumber || !clientData.firstname || !clientData.lastname ||
            !clientData.phone || !clientData.civicaddress || !clientData.city ||
            !clientData.prov || !clientData.postalcode) {
            alert('Please fill in all required fields');
            return;
        }

        // Show saving indicator
        const saveBtn = document.getElementById('btn-save');
        const saveBtnBottom = document.getElementById('btn-save-bottom');
        saveBtn.disabled = true;
        saveBtnBottom.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

        // Call update workflow
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.updateClient}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                knumber: currentClient.knumber,
                clientData: clientData
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            alert(data.message || 'Failed to save client');
            saveBtn.disabled = false;
            saveBtnBottom.disabled = false;
            saveBtn.innerHTML = 'Save Changes';
            return;
        }

        // Success
        alert('Client saved successfully');

        // Reload client data to reflect any backend changes
        await loadClient(clientData.knumber);

    } catch (error) {
        console.error('Error saving client:', error);
        alert('An error occurred while saving the client');
    } finally {
        // Re-enable buttons
        const saveBtn = document.getElementById('btn-save');
        const saveBtnBottom = document.getElementById('btn-save-bottom');
        saveBtn.disabled = false;
        saveBtnBottom.disabled = false;
        saveBtn.innerHTML = 'Save Changes';
    }
}

// Recalculate travel times (triggers workflow recalculation)
async function recalculateTravelTimes() {
    if (!confirm('This will recalculate travel times to all clinics. Continue?')) {
        return;
    }

    try {
        const btn = document.getElementById('btn-recalculate-travel-times');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Calculating...';

        // The update-client workflow should handle recalculation
        // We just need to trigger it without changing other data
        const response = await fetch(`${API_BASE_URL}${ENDPOINTS.updateClient}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                knumber: currentClient.knumber,
                clientData: {
                    // Send minimal data - workflow will recalculate travel times
                    recalculate_travel_times: true
                }
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            alert(data.message || 'Failed to recalculate travel times');
            return;
        }

        alert('Travel times recalculated successfully');

        // Reload to show updated travel times
        await loadClient(currentClient.knumber);

    } catch (error) {
        console.error('Error recalculating travel times:', error);
        alert('An error occurred while recalculating travel times');
    } finally {
        const btn = document.getElementById('btn-recalculate-travel-times');
        btn.disabled = false;
        btn.innerHTML = 'Recalculate';
    }
}

// UI state management
function showLoading() {
    document.getElementById('loading-state').classList.remove('d-none');
    document.getElementById('error-state').classList.add('d-none');
    document.getElementById('client-profile-form').classList.add('d-none');
}

function showForm() {
    document.getElementById('loading-state').classList.add('d-none');
    document.getElementById('error-state').classList.add('d-none');
    document.getElementById('client-profile-form').classList.remove('d-none');
}

function showError(message) {
    document.getElementById('loading-state').classList.add('d-none');
    document.getElementById('error-state').classList.remove('d-none');
    document.getElementById('client-profile-form').classList.add('d-none');
    document.getElementById('error-message').textContent = message;
}

// v1.0.0 - Client Profile Page Controller
```

---

## CSS Styling

### File: `css/client-profile.css`

```css
/* Client Profile Page Styles - v1.0.0 */

/* Sticky form actions footer */
.sticky-form-actions {
    position: sticky;
    bottom: 0;
    z-index: 100;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
}

/* Section headers */
.card-header h5 {
    font-weight: 600;
}

/* Read-only field styling */
input[readonly],
textarea[readonly],
select[readonly] {
    background-color: #f8f9fa !important;
    cursor: not-allowed;
}

/* Required field indicator */
.text-danger {
    font-weight: bold;
}

/* Form validation */
.was-validated .form-control:invalid {
    border-color: #dc3545;
}

.was-validated .form-control:valid {
    border-color: #198754;
}

/* Breadcrumb styling */
.breadcrumb {
    background-color: transparent;
    padding: 0;
    margin-bottom: 1rem;
}

/* Badge styling */
.badge {
    font-size: 0.875rem;
    padding: 0.5rem 1rem;
}

/* Button spacing */
.btn + .btn {
    margin-left: 0.5rem;
}

/* Responsive adjustments */
@media (max-width: 768px) {
    .sticky-form-actions {
        position: fixed;
    }

    .container-fluid {
        padding-bottom: 80px; /* Space for sticky footer */
    }
}
```

---

## Integration with clients-sl.html

### Update Client Cards

Add "View Profile" button to each client card:

```javascript
// In clients-sl.html - renderClientCard() function

function renderClientCard(client) {
    return `
        <div class="client-card">
            <!-- Existing card content -->

            <div class="client-actions mt-2">
                <button class="btn btn-sm btn-primary" onclick="viewClientProfile('${client.knumber}')">
                    View Profile
                </button>
                <!-- Existing Quick Edit button -->
            </div>
        </div>
    `;
}

// Add navigation function
function viewClientProfile(knumber) {
    window.location.href = `client-profile.html?knumber=${knumber}`;
}
```

---

## Workflow Requirements

### Existing Workflows to Use

1. **CLIENT - Get Single Client by K-Number** (already created)
   - Endpoint: `/webhook/get-client?knumber=K123`
   - Returns full client with primary_clinic_name

2. **CLIENT - Update Client** (needs update per instructions)
   - Endpoint: `/webhook/update-client`
   - Must accept all 29 client fields
   - Must handle `primary_clinic_id`
   - Must recalculate travel times if requested
   - Must return updated client with JOIN

3. **Clinic Locations** (existing)
   - Endpoint: `/webhook/clinic-locations`
   - Returns list of all clinics for dropdown

4. **Get All Drivers** (existing)
   - Endpoint: `/webhook/get-all-drivers`
   - Returns list of active drivers for dropdown

---

## Testing Checklist

### Page Load Testing
- [ ] Page loads with valid K-number parameter
- [ ] Page shows error with invalid K-number
- [ ] Page redirects to login if not authenticated
- [ ] Page blocks access for unauthorized roles (drivers, clients)

### Form Population Testing
- [ ] All 29 fields populate correctly from workflow
- [ ] Dropdowns populate from respective endpoints
- [ ] Dates format correctly (created_at, sync_date)
- [ ] Checkboxes reflect boolean values
- [ ] JSONB data displays formatted in textarea

### Role-Based Access Testing
- [ ] **Booking Agent**: Can edit all fields except system fields
- [ ] **Supervisor**: Can edit all fields except system fields
- [ ] **Admin**: Can edit ALL fields including system fields
- [ ] Read-only fields styled with gray background
- [ ] Recalculate button shows for non-admins

### Save Functionality Testing
- [ ] Required field validation works
- [ ] Save updates all editable fields
- [ ] Admin-only fields update for admin role
- [ ] Success message displays after save
- [ ] Form reloads with updated data

### Travel Times Testing
- [ ] Recalculate button triggers workflow
- [ ] Travel times update after recalculation
- [ ] Admin can edit JSONB directly
- [ ] Non-admins cannot edit, only recalculate

### Primary Clinic Testing
- [ ] Clinic dropdown populates from destinations
- [ ] Selected clinic displays correctly
- [ ] Can set to "No Primary Clinic" (NULL)
- [ ] Saves correctly to database

### Navigation Testing
- [ ] Cancel buttons return to clients-sl.html
- [ ] Breadcrumb links work correctly
- [ ] "View Profile" button from client list navigates correctly

---

## Implementation Order

1. **Create HTML file**: `client-profile.html`
2. **Create CSS file**: `css/client-profile.css`
3. **Create JS controller**: `js/client-profile.js`
4. **Update workflows**: Follow PRIMARY-CLINIC-IMPLEMENTATION-GUIDE.md
5. **Update clients-sl.html**: Add "View Profile" buttons
6. **Test with booking_agent role**
7. **Test with supervisor role**
8. **Test with admin role**
9. **Test all edge cases** (NULL values, invalid data, etc.)

---

## Notes

- **No tabs**: Single scrolling form with section headers for simplicity
- **Sticky footer**: Save/Cancel buttons stick to bottom for easy access
- **Role-based UI**: Fields automatically styled as read-only based on permissions
- **API integration**: Uses existing CLIENT - Update Client workflow
- **Primary clinic**: Integrated throughout (dropdown, save, display)
- **Travel times**: Recalculate button triggers backend calculation
- **Validation**: Client-side validation before submission
- **Error handling**: Comprehensive error states and messaging

---

**Version**: 1.0.0
**Created**: 2025-01-09
**Status**: Ready for Implementation
**Dependencies**:
- CLIENT - Get Single Client by K-Number workflow (created)
- CLIENT - Update Client workflow (needs update for primary_clinic_id)
- Database migration 001_add_primary_clinic_to_clients.sql (created)
