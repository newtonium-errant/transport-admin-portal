/**
 * TEST Client Quick Edit Modal Component - WITH PRIMARY CLINIC SUPPORT
 * Reusable modal for quick editing of client information
 * Version: v3.0.0-TEST
 *
 * Changes in v3.0.0:
 * - Added primary_clinic_id dropdown field
 * - Loads clinics from /webhook/clinic-locations
 * - Uses TEST-update-client endpoint for testing
 * - Pre-selects client's existing primary clinic
 */

class ClientModal {
    constructor(options = {}) {
        this.onSave = options.onSave || (() => {});
        this.onClose = options.onClose || (() => {});
        this.apiBaseUrl = options.apiBaseUrl || 'https://webhook-processor-production-3bb8.up.railway.app/webhook';
        this.client = null;
        this.mode = 'edit'; // Only edit mode for quick modal
        this.clinics = []; // Store available clinics

        this.init();
    }

    /**
     * Initialize modal HTML
     */
    init() {
        // Check if modal already exists
        if (document.getElementById('clientQuickEditModal')) {
            this.modal = new bootstrap.Modal(document.getElementById('clientQuickEditModal'));
            this.loadClinics(); // Load clinics when modal exists
            return;
        }

        // Create modal HTML
        const modalHTML = `
            <div class="modal fade" id="clientQuickEditModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%); color: #FFFFFF;">
                            <h5 class="modal-title">
                                <i class="bi bi-person-badge me-2"></i>
                                <span id="modalTitle">Quick Edit Client</span>
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Client Name (Read-only in quick edit) -->
                            <div class="mb-3">
                                <label class="form-label fw-bold">Client Name</label>
                                <input type="text" class="form-control bg-light" id="clientName" readonly>
                                <small class="text-muted">Full profile required to change name</small>
                            </div>

                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label for="clientPhone" class="form-label">
                                            Phone *
                                            <i class="bi bi-telephone-fill ms-1"></i>
                                        </label>
                                        <input type="tel" class="form-control" id="clientPhone" required>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label for="clientEmail" class="form-label">
                                            Email
                                            <i class="bi bi-envelope-fill ms-1"></i>
                                        </label>
                                        <input type="email" class="form-control" id="clientEmail">
                                    </div>
                                </div>
                            </div>

                            <!-- Primary Address Section -->
                            <div class="card mb-3">
                                <div class="card-header bg-light">
                                    <strong>
                                        <i class="bi bi-geo-alt-fill me-2"></i>
                                        Primary Address
                                    </strong>
                                </div>
                                <div class="card-body">
                                    <div class="mb-3">
                                        <label for="primaryCivicAddress" class="form-label">Street Address *</label>
                                        <input type="text" class="form-control" id="primaryCivicAddress" required>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-4">
                                            <div class="mb-3">
                                                <label for="primaryCity" class="form-label">City *</label>
                                                <input type="text" class="form-control" id="primaryCity" required>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="mb-3">
                                                <label for="primaryProvince" class="form-label">Province *</label>
                                                <select class="form-select" id="primaryProvince" required>
                                                    <option value="NS">Nova Scotia</option>
                                                    <option value="NB">New Brunswick</option>
                                                    <option value="PE">Prince Edward Island</option>
                                                    <option value="NL">Newfoundland and Labrador</option>
                                                    <option value="QC">Quebec</option>
                                                    <option value="ON">Ontario</option>
                                                    <option value="MB">Manitoba</option>
                                                    <option value="SK">Saskatchewan</option>
                                                    <option value="AB">Alberta</option>
                                                    <option value="BC">British Columbia</option>
                                                    <option value="YT">Yukon</option>
                                                    <option value="NT">Northwest Territories</option>
                                                    <option value="NU">Nunavut</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="mb-3">
                                                <label for="primaryPostalCode" class="form-label">Postal Code *</label>
                                                <input type="text" class="form-control" id="primaryPostalCode" placeholder="A1A 1A1" required>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Secondary Address Section -->
                            <div class="card mb-3">
                                <div class="card-header bg-light d-flex justify-content-between align-items-center" style="cursor: pointer;" data-bs-toggle="collapse" data-bs-target="#secondaryAddressCollapse">
                                    <strong>
                                        <i class="bi bi-house-fill me-2"></i>
                                        Secondary Address
                                    </strong>
                                    <div>
                                        <span class="badge bg-secondary me-2">Optional</span>
                                        <i class="bi bi-chevron-down"></i>
                                    </div>
                                </div>
                                <div id="secondaryAddressCollapse" class="collapse">
                                    <div class="card-body">
                                    <div class="mb-3">
                                        <label for="secondaryCivicAddress" class="form-label">Street Address</label>
                                        <input type="text" class="form-control" id="secondaryCivicAddress">
                                    </div>
                                    <div class="row">
                                        <div class="col-md-4">
                                            <div class="mb-3">
                                                <label for="secondaryCity" class="form-label">City</label>
                                                <input type="text" class="form-control" id="secondaryCity">
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="mb-3">
                                                <label for="secondaryProvince" class="form-label">Province</label>
                                                <select class="form-select" id="secondaryProvince">
                                                    <option value="">Select province...</option>
                                                    <option value="NS">Nova Scotia</option>
                                                    <option value="NB">New Brunswick</option>
                                                    <option value="PE">Prince Edward Island</option>
                                                    <option value="NL">Newfoundland and Labrador</option>
                                                    <option value="QC">Quebec</option>
                                                    <option value="ON">Ontario</option>
                                                    <option value="MB">Manitoba</option>
                                                    <option value="SK">Saskatchewan</option>
                                                    <option value="AB">Alberta</option>
                                                    <option value="BC">British Columbia</option>
                                                    <option value="YT">Yukon</option>
                                                    <option value="NT">Northwest Territories</option>
                                                    <option value="NU">Nunavut</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <div class="mb-3">
                                                <label for="secondaryPostalCode" class="form-label">Postal Code</label>
                                                <input type="text" class="form-control" id="secondaryPostalCode" placeholder="A1A 1A1">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-0">
                                        <label for="secondaryAddressNotes" class="form-label">
                                            Notes
                                            <i class="bi bi-info-circle" title="e.g., 'Summer cottage - June to Sept only'"></i>
                                        </label>
                                        <input type="text" class="form-control" id="secondaryAddressNotes" placeholder="e.g., Summer cottage, Family member's house">
                                    </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Appointment Settings Section (NEW: Primary Clinic) -->
                            <div class="card mb-3">
                                <div class="card-header bg-light">
                                    <strong>
                                        <i class="bi bi-clock-fill me-2"></i>
                                        Appointment Settings
                                    </strong>
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="primaryClinicId" class="form-label">
                                                    Primary Clinic
                                                    <span class="badge bg-info text-dark">New</span>
                                                </label>
                                                <select class="form-select" id="primaryClinicId">
                                                    <option value="">No Primary Clinic</option>
                                                    <!-- Will be populated from API -->
                                                </select>
                                                <small class="text-muted">Default clinic for new appointments</small>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="appointmentLength" class="form-label">Default Appointment Length (minutes) *</label>
                                                <input type="number" class="form-control" id="appointmentLength" min="15" max="480" step="15" value="120" required>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="clientActive" class="form-label">Status *</label>
                                                <select class="form-select" id="clientActive" required>
                                                    <option value="true">Active</option>
                                                    <option value="false">Inactive</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Emergency Contact & Notes -->
                            <div class="card mb-3">
                                <div class="card-header bg-light">
                                    <strong>
                                        <i class="bi bi-person-lines-fill me-2"></i>
                                        Additional Information
                                    </strong>
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="emergencyContactName" class="form-label">
                                                    Emergency Contact Name
                                                    <i class="bi bi-person-fill ms-1"></i>
                                                </label>
                                                <input type="text" class="form-control" id="emergencyContactName">
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label for="emergencyContactNumber" class="form-label">
                                                    Emergency Contact Phone
                                                    <i class="bi bi-telephone-fill ms-1"></i>
                                                </label>
                                                <input type="tel" class="form-control" id="emergencyContactNumber">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-0">
                                        <label for="clientNotes" class="form-label">
                                            Notes
                                            <i class="bi bi-sticky-fill ms-1"></i>
                                        </label>
                                        <textarea class="form-control" id="clientNotes" rows="2" placeholder="Additional notes about the client"></textarea>
                                    </div>
                                </div>
                            </div>

                            <!-- Error Messages -->
                            <div id="modalErrorMessages"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="bi bi-x-circle me-1"></i>
                                Cancel
                            </button>
                            <button type="button" class="btn btn-primary" id="saveClientBtn" onclick="clientModalInstance.save()" style="width: 160px;">
                                <i class="bi bi-check-circle me-1"></i>
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Append to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Initialize Bootstrap modal
        this.modal = new bootstrap.Modal(document.getElementById('clientQuickEditModal'));

        // Handle modal close events
        document.getElementById('clientQuickEditModal').addEventListener('hidden.bs.modal', () => {
            this.onClose();
        });

        // Load clinics for dropdown
        this.loadClinics();
    }

    /**
     * Load clinics for primary clinic dropdown
     */
    async loadClinics() {
        try {
            const response = await authenticatedFetch(`${this.apiBaseUrl}/clinic-locations`);
            const data = await response.json();

            this.clinics = data.destinations || data || [];

            // Populate dropdown
            const select = document.getElementById('primaryClinicId');
            if (select) {
                select.innerHTML = '<option value="">No Primary Clinic</option>';
                this.clinics.forEach(clinic => {
                    const option = document.createElement('option');
                    option.value = clinic.id;
                    option.textContent = `${clinic.name} - ${clinic.city}`;
                    select.appendChild(option);
                });
                console.log(`[TEST Modal] Loaded ${this.clinics.length} clinics for primary clinic dropdown`);
            }
        } catch (error) {
            console.error('[TEST Modal] Error loading clinics:', error);
        }
    }

    /**
     * Open modal with client data
     * @param {Object} clientData - Client data to edit
     */
    async open(clientData) {
        this.client = clientData;

        // Populate form
        this.populateForm(clientData);

        // Show modal
        this.modal.show();
    }

    /**
     * Populate form with client data
     * @param {Object} client - Client data
     */
    populateForm(client) {
        // Client name (read-only)
        document.getElementById('clientName').value =
            `${client.firstname || ''} ${client.lastname || ''} (${client.knumber || ''})`;

        // Contact info
        document.getElementById('clientPhone').value = client.phone || '';
        document.getElementById('clientEmail').value = client.email || '';

        // Primary address
        document.getElementById('primaryCivicAddress').value = client.civicaddress || '';
        document.getElementById('primaryCity').value = client.city || '';
        document.getElementById('primaryProvince').value = client.prov || client.province || 'NS';
        document.getElementById('primaryPostalCode').value = client.postalcode || '';

        // Secondary address
        document.getElementById('secondaryCivicAddress').value = client.secondary_civic_address || '';
        document.getElementById('secondaryCity').value = client.secondary_city || '';
        document.getElementById('secondaryProvince').value = client.secondary_province || '';
        document.getElementById('secondaryPostalCode').value = client.secondary_postal_code || '';
        document.getElementById('secondaryAddressNotes').value = client.secondary_address_notes || '';

        // Expand secondary address section if data exists
        const hasSecondaryAddress = client.secondary_civic_address && client.secondary_civic_address.trim() !== '';
        const secondaryCollapse = document.getElementById('secondaryAddressCollapse');
        if (hasSecondaryAddress) {
            secondaryCollapse.classList.add('show');
        } else {
            secondaryCollapse.classList.remove('show');
        }

        // Primary clinic (NEW)
        const primaryClinicSelect = document.getElementById('primaryClinicId');
        if (primaryClinicSelect) {
            primaryClinicSelect.value = client.primary_clinic_id || '';
            console.log(`[TEST Modal] Set primary clinic to: ${client.primary_clinic_id || 'none'}`);
        }

        // Appointment settings
        document.getElementById('appointmentLength').value =
            client.appointment_length || client.appointmentLength || 120;
        document.getElementById('clientActive').value =
            (client.active === false ? 'false' : 'true');

        // Emergency contact and notes
        document.getElementById('emergencyContactName').value = client.emergency_contact_name || '';
        document.getElementById('emergencyContactNumber').value = client.emergency_contact_number || '';
        document.getElementById('clientNotes').value = client.notes || '';

        // Clear error messages
        document.getElementById('modalErrorMessages').innerHTML = '';
    }

    /**
     * Validate form data
     * @returns {Object|null} - Returns error object if validation fails, null if passes
     */
    validate() {
        const errors = [];

        // Phone is required
        const phone = document.getElementById('clientPhone').value.trim();
        if (!phone) {
            errors.push('Phone number is required');
        }

        // Primary address fields required
        const primaryCivic = document.getElementById('primaryCivicAddress').value.trim();
        const primaryCity = document.getElementById('primaryCity').value.trim();
        const primaryProvince = document.getElementById('primaryProvince').value.trim();
        const primaryPostalCode = document.getElementById('primaryPostalCode').value.trim();

        if (!primaryCivic) errors.push('Primary street address is required');
        if (!primaryCity) errors.push('Primary city is required');
        if (!primaryProvince) errors.push('Primary province is required');
        if (!primaryPostalCode) errors.push('Primary postal code is required');

        // Validate postal code format (Canadian)
        const postalCodeRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
        if (primaryPostalCode && !postalCodeRegex.test(primaryPostalCode)) {
            errors.push('Primary postal code must be in format: A1A 1A1');
        }

        // If secondary address started, validate completeness
        const secondaryCivic = document.getElementById('secondaryCivicAddress').value.trim();
        if (secondaryCivic) {
            const secondaryCity = document.getElementById('secondaryCity').value.trim();
            const secondaryProvince = document.getElementById('secondaryProvince').value.trim();
            const secondaryPostalCode = document.getElementById('secondaryPostalCode').value.trim();

            if (!secondaryCity) errors.push('Secondary city is required if address is provided');
            if (!secondaryProvince) errors.push('Secondary province is required if address is provided');
            if (!secondaryPostalCode) errors.push('Secondary postal code is required if address is provided');

            if (secondaryPostalCode && !postalCodeRegex.test(secondaryPostalCode)) {
                errors.push('Secondary postal code must be in format: A1A 1A1');
            }
        }

        // Appointment length validation
        const appointmentLength = parseInt(document.getElementById('appointmentLength').value);
        if (!appointmentLength || appointmentLength < 15 || appointmentLength > 480) {
            errors.push('Appointment length must be between 15 and 480 minutes');
        }

        if (errors.length > 0) {
            return { errors };
        }

        return null;
    }

    /**
     * Save client changes
     */
    async save() {
        // Validate
        const validationResult = this.validate();
        if (validationResult) {
            this.showError(validationResult.errors.join('<br>'));
            return;
        }

        // Show loading state
        this.setLoading(true);

        try {
            // Get primary clinic value
            const primaryClinicValue = document.getElementById('primaryClinicId').value;
            const primaryClinicId = primaryClinicValue === '' ? null : parseInt(primaryClinicValue);

            // Prepare client data in the format the workflow expects
            const requestBody = {
                knumber: this.client.knumber,
                clientData: {
                    // Names (camelCase for workflow, keeps original since read-only)
                    firstname: this.client.firstname,
                    lastname: this.client.lastname,

                    // Contact info
                    phone: document.getElementById('clientPhone').value.trim(),
                    email: document.getElementById('clientEmail').value.trim() || null,

                    // Primary address (snake_case to match database)
                    civicaddress: document.getElementById('primaryCivicAddress').value.trim(),
                    city: document.getElementById('primaryCity').value.trim(),
                    prov: document.getElementById('primaryProvince').value.trim(),
                    postalcode: document.getElementById('primaryPostalCode').value.trim(),

                    // Secondary address (snake_case)
                    secondary_civic_address: document.getElementById('secondaryCivicAddress').value.trim() || null,
                    secondary_city: document.getElementById('secondaryCity').value.trim() || null,
                    secondary_province: document.getElementById('secondaryProvince').value.trim() || null,
                    secondary_postal_code: document.getElementById('secondaryPostalCode').value.trim() || null,
                    secondary_address_notes: document.getElementById('secondaryAddressNotes').value.trim() || null,

                    // Primary clinic (NEW)
                    primary_clinic_id: primaryClinicId,

                    // Appointment settings (snake_case)
                    appointment_length: parseInt(document.getElementById('appointmentLength').value),
                    active: document.getElementById('clientActive').value === 'true',

                    // Additional info (snake_case)
                    emergency_contact_name: document.getElementById('emergencyContactName').value.trim() || null,
                    emergency_contact_number: document.getElementById('emergencyContactNumber').value.trim() || null,
                    notes: document.getElementById('clientNotes').value.trim() || null
                }
            };

            console.log('[TEST Modal] Sending update request:', requestBody);

            // Send to TEST UPDATE workflow endpoint
            const response = await authenticatedFetch(`${this.apiBaseUrl}/TEST-update-client`, {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to update client');
            }

            // Success
            console.log('[TEST Modal] Update successful:', data);
            this.showSuccess('Client updated successfully!');

            // Wait a moment, then close and callback
            setTimeout(() => {
                this.modal.hide();
                this.onSave(data);
            }, 1500);

        } catch (error) {
            console.error('[TEST Modal] Error updating client:', error);
            this.showError('Failed to save changes: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Set loading state
     * @param {boolean} loading - Whether in loading state
     */
    setLoading(loading) {
        const saveBtn = document.getElementById('saveClientBtn');

        if (loading) {
            // Store original content
            saveBtn.dataset.originalContent = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 1rem; height: 1rem; margin-right: 0.25rem;"></span>Saving...';
        } else {
            saveBtn.disabled = false;
            // Restore original content
            if (saveBtn.dataset.originalContent) {
                saveBtn.innerHTML = saveBtn.dataset.originalContent;
                delete saveBtn.dataset.originalContent;
            } else {
                saveBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Save Changes';
            }
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        const errorDiv = document.getElementById('modalErrorMessages');
        errorDiv.innerHTML = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="bi bi-exclamation-triangle me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        const errorDiv = document.getElementById('modalErrorMessages');
        errorDiv.innerHTML = `
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                <i class="bi bi-check-circle me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
    }

    /**
     * Close modal
     */
    close() {
        this.modal.hide();
    }
}

// Global instance (for onclick handlers)
let clientModalInstance = null;

// Version: v3.0.0-TEST - Added primary_clinic_id support + TEST endpoints
