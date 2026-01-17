// TEST Client Profile Page Controller - v1.0.0-TEST
// For Primary Clinic Feature Testing

// Workflow endpoints
const API_BASE_URL = 'https://webhook-processor-production-3bb8.up.railway.app/webhook';

const ENDPOINTS = {
    getClient: '/TEST-get-client',
    updateClient: '/TEST-update-client',
    getClinics: '/TEST-clinic-locations',
    getDrivers: '/TEST-get-all-drivers'
};

// Global state
let currentClient = null;
let userRole = null;
let clinics = [];
let drivers = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[TEST Client Profile] Initializing page...');

    // Check authentication
    if (!(await requireAuth())) {
        return;
    }

    const savedUser = sessionStorage.getItem('rrts_user');
    if (!savedUser) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(savedUser);
    userRole = user.role;
    console.log('[TEST Client Profile] User role:', userRole);

    // Check page access
    if (!hasPageAccess(userRole, 'client-management')) {
        showToast('You do not have permission to access this page.', 'error');
        setTimeout(() => window.location.href = 'dashboard.html', 2000);
        return;
    }

    // Get K-number from URL
    const urlParams = new URLSearchParams(window.location.search);
    const knumber = urlParams.get('knumber');

    if (!knumber) {
        showError('No client K-number provided');
        return;
    }

    console.log('[TEST Client Profile] Loading client:', knumber);

    // Load data
    await loadDropdownData();
    await loadClient(knumber);

    // Setup event listeners
    setupEventListeners();
});

// Load clinics and drivers for dropdowns
async function loadDropdownData() {
    try {
        console.log('[TEST Client Profile] Loading dropdown data...');

        // Load clinics
        const clinicsResponse = await authenticatedFetch(`${API_BASE_URL}${ENDPOINTS.getClinics}`);
        const clinicsData = await clinicsResponse.json();
        if (clinicsData.success !== false && (clinicsData.clinics || clinicsData.destinations)) {
            clinics = clinicsData.clinics || clinicsData.destinations || [];
            populateClinicsDropdown();
            console.log('[TEST Client Profile] Loaded', clinics.length, 'clinics');
        }

        // Drivers not needed for this page (removed preferred_driver field)
    } catch (error) {
        console.error('[TEST Client Profile] Error loading dropdown data:', error);
    }
}

// Populate clinics dropdown
function populateClinicsDropdown() {
    const select = document.getElementById('primary_clinic_id');
    select.innerHTML = '<option value="">No Primary Clinic</option>';

    clinics.forEach(clinic => {
        const option = document.createElement('option');
        option.value = clinic.id;
        option.textContent = `${clinic.name} - ${clinic.city}`;
        select.appendChild(option);
    });

    console.log('[TEST Client Profile] Populated primary clinic dropdown');
}

// Load client data
async function loadClient(knumber) {
    try {
        showLoading();
        console.log('[TEST Client Profile] Fetching client data from TEST-get-client...');

        const response = await authenticatedFetch(`${API_BASE_URL}${ENDPOINTS.getClient}?knumber=${knumber}`);
        const data = await response.json();

        console.log('[TEST Client Profile] Response:', data);

        if (!response.ok || !data.success) {
            showError(data.message || 'Failed to load client');
            return;
        }

        currentClient = data.client;
        console.log('[TEST Client Profile] Client loaded:', currentClient);

        populateForm(currentClient);
        applyRoleBasedPermissions();
        showForm();

    } catch (error) {
        console.error('[TEST Client Profile] Error loading client:', error);
        showError('An error occurred while loading the client: ' + error.message);
    }
}

// Populate form with client data
function populateForm(client) {
    console.log('[TEST Client Profile] Populating form with client data');

    // Basic Information
    document.getElementById('knumber').value = client.knumber || '';
    document.getElementById('firstname').value = client.firstname || '';
    document.getElementById('lastname').value = client.lastname || '';
    document.getElementById('status').value = client.status || 'active';

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

    // Expand secondary address section if data exists
    const hasSecondaryAddress = client.secondary_civic_address || client.secondary_city ||
                                  client.secondary_province || client.secondary_postal_code ||
                                  client.secondary_address_notes;
    if (hasSecondaryAddress) {
        const collapseElement = document.getElementById('secondaryAddressCollapse');
        const bsCollapse = new bootstrap.Collapse(collapseElement, { show: true });
    }

    // Preferences & Notes
    document.getElementById('primary_clinic_id').value = client.primary_clinic_id || '';
    console.log('[TEST Client Profile] Set primary_clinic_id to:', client.primary_clinic_id);

    document.getElementById('appointment_length').value = client.appointment_length || '';
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
        try {
            const formatted = JSON.stringify(client.clinic_travel_times, null, 2);
            document.getElementById('clinic_travel_times').value = formatted;
        } catch (e) {
            document.getElementById('clinic_travel_times').value = client.clinic_travel_times;
        }
    }

    // Update page header
    const fullName = `${client.firstname} ${client.lastname}`;
    document.getElementById('page-title').innerHTML = `
        <span class="badge bg-warning text-dark me-2">TEST</span>
        ${fullName}
    `;
    document.getElementById('client-knumber').textContent = client.knumber;

    console.log('[TEST Client Profile] Form populated successfully');
}

// Apply role-based field permissions
function applyRoleBasedPermissions() {
    const isAdmin = userRole === 'admin';

    console.log('[TEST Client Profile] Applying permissions for role:', userRole);

    // For this TEST version, we'll keep it simple:
    // - All fields editable for booking_agent, supervisor, admin
    // - System fields (OpenPhone, created_at, travel_times) are always read-only

    // These are always read-only regardless of role
    const alwaysReadOnly = [
        'created_at',
        'openphone_sync_date',
        'clinic_travel_times'
    ];

    alwaysReadOnly.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.setAttribute('readonly', 'readonly');
            field.classList.add('read-only-field');
        }
    });

    // OpenPhone Contact ID - only admin can edit
    const openphoneField = document.getElementById('openphone_contact_id');
    if (openphoneField) {
        if (!isAdmin) {
            openphoneField.setAttribute('readonly', 'readonly');
            openphoneField.classList.add('read-only-field');
        }
    }

    console.log('[TEST Client Profile] Permissions applied');
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
        if (confirm('Are you sure you want to cancel? Unsaved changes will be lost.')) {
            window.location.href = 'TEST-clients-sl.html';
        }
    });
    document.getElementById('btn-cancel-bottom').addEventListener('click', () => {
        if (confirm('Are you sure you want to cancel? Unsaved changes will be lost.')) {
            window.location.href = 'TEST-clients-sl.html';
        }
    });

    console.log('[TEST Client Profile] Event listeners set up');
}

// Save client changes
async function saveClient() {
    try {
        console.log('[TEST Client Profile] Saving client...');

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
            appointment_length: document.getElementById('appointment_length').value || null,
            status: document.getElementById('status').value,
            active: document.getElementById('status').value === 'active', // Set active based on status
            primary_clinic_id: document.getElementById('primary_clinic_id').value || null
        };

        console.log('[TEST Client Profile] Client data to save:', clientData);

        // Admin-only fields
        if (userRole === 'admin') {
            clientData.openphone_contact_id = document.getElementById('openphone_contact_id').value.trim();
        }

        // Validate required fields
        if (!clientData.knumber || !clientData.firstname || !clientData.lastname ||
            !clientData.phone || !clientData.civicaddress || !clientData.city ||
            !clientData.prov || !clientData.postalcode) {
            showToast('Please fill in all required fields (marked with *)', 'warning');
            return;
        }

        // Show saving indicator
        const saveBtn = document.getElementById('btn-save');
        const saveBtnBottom = document.getElementById('btn-save-bottom');
        saveBtn.disabled = true;
        saveBtnBottom.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

        // Call TEST update workflow
        console.log('[TEST Client Profile] Calling TEST-update-client endpoint...');
        const response = await authenticatedFetch(`${API_BASE_URL}${ENDPOINTS.updateClient}`, {
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
        console.log('[TEST Client Profile] Update response:', data);

        if (!response.ok || !data.success) {
            showToast(data.message || 'Failed to save client', 'error');
            saveBtn.disabled = false;
            saveBtnBottom.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Save Changes (TEST)';
            return;
        }

        // Success
        showToast('Client saved successfully!', 'success');

        // Reload client data to reflect any backend changes
        await loadClient(clientData.knumber);

    } catch (error) {
        console.error('[TEST Client Profile] Error saving client:', error);
        showToast('An error occurred while saving the client: ' + error.message, 'error');
    } finally {
        // Re-enable buttons
        const saveBtn = document.getElementById('btn-save');
        const saveBtnBottom = document.getElementById('btn-save-bottom');
        saveBtn.disabled = false;
        saveBtnBottom.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Save Changes (TEST)';
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

// Toast Notification Function
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: '<i class="bi bi-check-circle-fill"></i>',
        error: '<i class="bi bi-x-circle-fill"></i>',
        warning: '<i class="bi bi-exclamation-triangle-fill"></i>',
        info: '<i class="bi bi-info-circle-fill"></i>'
    };

    const titles = {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.closest('.toast').classList.add('hiding'); setTimeout(() => this.closest('.toast').remove(), 300);">
            <i class="bi bi-x"></i>
        </button>
    `;

    container.appendChild(toast);

    // Trigger show animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// v1.0.0-TEST - Client Profile Page Controller for Primary Clinic Feature Testing
console.log('[TEST Client Profile] Controller loaded - v1.0.0-TEST');
