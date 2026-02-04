/**
 * @fileoverview Client Quick Edit Modal Component
 *
 * @description
 * Reusable Bootstrap modal for quick editing of client information.
 * Provides a streamlined interface for updating client contact info,
 * addresses, and settings without navigating to the full client page.
 *
 * Features:
 * - Edit contact info (phone, email)
 * - Primary and secondary address management
 * - Appointment settings (default length, active status)
 * - Emergency contact and notes
 * - Automatic travel time recalculation on address change
 *
 * @requires Bootstrap 5 - For modal functionality
 * @requires jwt-auth.js - For authenticatedFetch()
 *
 * @example
 * // Initialize the modal
 * const modal = new ClientModal({
 *     onSave: (data) => {
 *         console.log('Client updated:', data);
 *         refreshClientList();
 *     },
 *     onClose: () => {
 *         console.log('Modal closed');
 *     }
 * });
 *
 * // Open with client data
 * modal.open(clientData);
 *
 * @version 2.0.0
 * @since 2024-01-01
 */

'use strict';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * @typedef {Object} ClientModalOptions
 * @property {Function} [onSave] - Callback when save succeeds, receives response data
 * @property {Function} [onClose] - Callback when modal closes
 * @property {string} [apiBaseUrl] - Override default API base URL
 */

/**
 * @typedef {Object} ClientData
 * @property {string} knumber - Client K-number (unique identifier)
 * @property {string} firstname - Client's first name
 * @property {string} lastname - Client's last name
 * @property {string} [phone] - Primary phone number
 * @property {string} [email] - Email address
 * @property {string} [civicaddress] - Primary street address
 * @property {string} [city] - Primary city
 * @property {string} [prov] - Primary province code
 * @property {string} [postalcode] - Primary postal code
 * @property {string} [secondary_civic_address] - Secondary street address
 * @property {string} [secondary_city] - Secondary city
 * @property {string} [secondary_province] - Secondary province code
 * @property {string} [secondary_postal_code] - Secondary postal code
 * @property {string} [secondary_address_notes] - Notes about secondary address
 * @property {number} [appointment_length] - Default appointment duration in minutes
 * @property {boolean} [active] - Whether client is active
 * @property {string} [emergency_contact_name] - Emergency contact name
 * @property {string} [emergency_contact_number] - Emergency contact phone
 * @property {string} [notes] - General notes about client
 * @property {string} [mapaddress] - Google Maps formatted address
 */

// =============================================================================
// CLIENT MODAL CLASS
// =============================================================================

/**
 * Modal component for quick editing of client information
 *
 * Creates and manages a Bootstrap modal for editing client data.
 * Handles form validation, API submission, and user feedback.
 *
 * @class
 */
class ClientModal {
    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * Create a ClientModal instance
     *
     * @param {ClientModalOptions} [options={}] - Configuration options
     *
     * @example
     * const modal = new ClientModal({
     *     onSave: (data) => refreshTable(),
     *     onClose: () => enableBackgroundUI()
     * });
     */
    constructor(options = {}) {
        /**
         * Callback function called when save succeeds
         * @type {Function}
         * @private
         */
        this.onSave = options.onSave || (() => {});

        /**
         * Callback function called when modal closes
         * @type {Function}
         * @private
         */
        this.onClose = options.onClose || (() => {});

        /**
         * Base URL for API endpoints
         * @type {string}
         * @private
         */
        this.apiBaseUrl = options.apiBaseUrl || 'https://webhook-processor-production-3bb8.up.railway.app/webhook';

        /**
         * Currently loaded client data
         * @type {ClientData|null}
         * @private
         */
        this.client = null;

        /**
         * Modal mode - currently only 'edit' is supported
         * @type {string}
         * @private
         */
        this.mode = 'edit';

        // Initialize the modal DOM
        this.init();
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /**
     * Initialize modal HTML and Bootstrap instance
     *
     * Creates modal DOM if it doesn't exist, otherwise reuses existing.
     * Sets up event listeners for close events.
     *
     * @private
     * @returns {void}
     */
    init() {
        // Reuse existing modal if already in DOM
        if (document.getElementById('clientQuickEditModal')) {
            this.modal = new bootstrap.Modal(document.getElementById('clientQuickEditModal'));
            return;
        }

        // Create modal HTML structure
        const modalHTML = this._createModalHTML();

        // Append to document body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Initialize Bootstrap modal
        this.modal = new bootstrap.Modal(document.getElementById('clientQuickEditModal'));

        // Handle modal close events
        document.getElementById('clientQuickEditModal').addEventListener('hidden.bs.modal', () => {
            this.onClose();
        });
    }

    /**
     * Generate modal HTML markup
     *
     * @private
     * @returns {string} HTML string for modal
     */
    _createModalHTML() {
        return `
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
                            ${this._createFormHTML()}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="bi bi-x-circle me-1"></i>
                                Cancel
                            </button>
                            <button type="button" class="btn btn-primary" id="saveClientBtn" onclick="clientModalInstance.save()">
                                <i class="bi bi-check-circle me-1"></i>
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Generate form fields HTML
     *
     * @private
     * @returns {string} HTML string for form fields
     */
    _createFormHTML() {
        return `
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
            ${this._createAddressSection('primary', true)}

            <!-- Secondary Address Section -->
            ${this._createAddressSection('secondary', false)}

            <!-- Appointment Settings -->
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
                                <label for="appointmentLength" class="form-label">Default Appointment Length (minutes) *</label>
                                <input type="number" class="form-control" id="appointmentLength" min="15" max="480" step="15" value="120" required>
                            </div>
                        </div>
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
        `;
    }

    /**
     * Generate address section HTML (primary or secondary)
     *
     * @private
     * @param {string} type - 'primary' or 'secondary'
     * @param {boolean} required - Whether fields are required
     * @returns {string} HTML string for address section
     */
    _createAddressSection(type, required) {
        const isPrimary = type === 'primary';
        const titleIcon = isPrimary ? 'bi-geo-alt-fill' : 'bi-house-fill';
        const titleText = isPrimary ? 'Primary Address' : 'Secondary Address';
        const reqMark = required ? '*' : '';
        const reqAttr = required ? 'required' : '';

        // Province options (Canadian provinces and territories)
        const provinceOptions = `
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
        `;

        // Secondary address is collapsible
        const collapseAttrs = isPrimary ? '' : `data-bs-toggle="collapse" data-bs-target="#secondaryAddressCollapse"`;
        const collapseClass = isPrimary ? '' : 'collapse';
        const cursorStyle = isPrimary ? '' : 'cursor: pointer;';
        const badge = isPrimary ? '' : '<span class="badge bg-secondary me-2">Optional</span><i class="bi bi-chevron-down"></i>';

        return `
            <div class="card mb-3">
                <div class="card-header bg-light d-flex justify-content-between align-items-center" style="${cursorStyle}" ${collapseAttrs}>
                    <strong>
                        <i class="${titleIcon} me-2"></i>
                        ${titleText}
                    </strong>
                    <div>${badge}</div>
                </div>
                <div id="${type}AddressCollapse" class="${collapseClass}">
                    <div class="card-body">
                        <div class="mb-3">
                            <label for="${type}CivicAddress" class="form-label">Street Address ${reqMark}</label>
                            <input type="text" class="form-control" id="${type}CivicAddress" ${reqAttr}>
                        </div>
                        <div class="row">
                            <div class="col-md-4">
                                <div class="mb-3">
                                    <label for="${type}City" class="form-label">City ${reqMark}</label>
                                    <input type="text" class="form-control" id="${type}City" ${reqAttr}>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="mb-3">
                                    <label for="${type}Province" class="form-label">Province ${reqMark}</label>
                                    <select class="form-select" id="${type}Province" ${reqAttr}>
                                        ${provinceOptions}
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="mb-3">
                                    <label for="${type}PostalCode" class="form-label">Postal Code ${reqMark}</label>
                                    <input type="text" class="form-control" id="${type}PostalCode" placeholder="A1A 1A1" ${reqAttr}>
                                </div>
                            </div>
                        </div>
                        ${!isPrimary ? `
                        <div class="mb-0">
                            <label for="secondaryAddressNotes" class="form-label">
                                Notes
                                <i class="bi bi-info-circle" title="e.g., 'Summer cottage - June to Sept only'"></i>
                            </label>
                            <input type="text" class="form-control" id="secondaryAddressNotes" placeholder="e.g., Summer cottage, Family member's house">
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // PUBLIC METHODS
    // =========================================================================

    /**
     * Open modal with client data for editing
     *
     * @param {ClientData} clientData - Client data to edit
     * @returns {Promise<void>}
     *
     * @example
     * const client = await fetchClient(clientId);
     * modal.open(client);
     */
    async open(clientData) {
        this.client = clientData;

        // Populate form fields with client data
        this.populateForm(clientData);

        // Show the modal
        this.modal.show();
    }

    /**
     * Close the modal
     *
     * @returns {void}
     */
    close() {
        this.modal.hide();
    }

    /**
     * Save client changes to server
     *
     * Validates form, sends update request, and handles response.
     *
     * @returns {Promise<void>}
     * @throws {Error} If save fails (displayed in UI, not thrown)
     */
    async save() {
        // Validate form data
        const validationResult = this.validate();
        if (validationResult) {
            this.showError(validationResult.errors.join('<br>'));
            return;
        }

        // Show loading state
        this.setLoading(true);

        try {
            // Build request body matching API expectations
            const requestBody = this._buildRequestBody();

            // Send update request
            const response = await authenticatedFetch(`${this.apiBaseUrl}/update-client-destinations`, {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to update client');
            }

            // Show success message
            const message = data.travelTimesRecalculated
                ? 'Client updated and travel times recalculated!'
                : 'Client updated successfully!';
            this.showSuccess(message);

            // Close modal and trigger callback after brief delay
            setTimeout(() => {
                this.modal.hide();
                this.onSave(data);
            }, 1500);

        } catch (error) {
            console.error('[ClientModal] Error updating client:', error);
            this.showError('Failed to save changes: ' + error.message);
        } finally {
            this.setLoading(false);
        }
    }

    // =========================================================================
    // FORM HANDLING
    // =========================================================================

    /**
     * Populate form fields with client data
     *
     * @param {ClientData} client - Client data to display
     * @private
     * @returns {void}
     */
    populateForm(client) {
        // Client name (read-only display)
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

        // Expand secondary address section if it has data
        const hasSecondaryAddress = client.secondary_civic_address && client.secondary_civic_address.trim() !== '';
        const secondaryCollapse = document.getElementById('secondaryAddressCollapse');
        if (hasSecondaryAddress) {
            secondaryCollapse.classList.add('show');
        } else {
            secondaryCollapse.classList.remove('show');
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

        // Clear any previous error messages
        document.getElementById('modalErrorMessages').innerHTML = '';
    }

    /**
     * Validate form data
     *
     * @returns {Object|null} Object with errors array if validation fails, null if valid
     * @private
     */
    validate() {
        const errors = [];

        // Phone is required
        const phone = document.getElementById('clientPhone').value.trim();
        if (!phone) {
            errors.push('Phone number is required');
        }

        // Primary address fields are required
        const primaryCivic = document.getElementById('primaryCivicAddress').value.trim();
        const primaryCity = document.getElementById('primaryCity').value.trim();
        const primaryProvince = document.getElementById('primaryProvince').value.trim();
        const primaryPostalCode = document.getElementById('primaryPostalCode').value.trim();

        if (!primaryCivic) errors.push('Primary street address is required');
        if (!primaryCity) errors.push('Primary city is required');
        if (!primaryProvince) errors.push('Primary province is required');
        if (!primaryPostalCode) errors.push('Primary postal code is required');

        // Canadian postal code format: A1A 1A1
        const postalCodeRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
        if (primaryPostalCode && !postalCodeRegex.test(primaryPostalCode)) {
            errors.push('Primary postal code must be in format: A1A 1A1');
        }

        // If secondary address started, require all fields
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
     * Build request body for API update
     *
     * @private
     * @returns {Object} Request body matching API schema
     */
    _buildRequestBody() {
        return {
            kNumber: this.client.knumber,
            clientData: {
                // Names (preserved from original - read-only in quick edit)
                firstName: this.client.firstname,
                lastName: this.client.lastname,

                // Contact info
                phone: document.getElementById('clientPhone').value.trim(),
                email: document.getElementById('clientEmail').value.trim() || null,

                // Primary address
                civicAddress: document.getElementById('primaryCivicAddress').value.trim(),
                city: document.getElementById('primaryCity').value.trim(),
                province: document.getElementById('primaryProvince').value.trim(),
                postalCode: document.getElementById('primaryPostalCode').value.trim(),

                // Secondary address
                secondary_civic_address: document.getElementById('secondaryCivicAddress').value.trim() || null,
                secondary_city: document.getElementById('secondaryCity').value.trim() || null,
                secondary_province: document.getElementById('secondaryProvince').value.trim() || null,
                secondary_postal_code: document.getElementById('secondaryPostalCode').value.trim() || null,
                secondary_address_notes: document.getElementById('secondaryAddressNotes').value.trim() || null,

                // Appointment settings
                appointmentLength: parseInt(document.getElementById('appointmentLength').value),
                active: document.getElementById('clientActive').value === 'true',

                // Additional info
                emergencyContactName: document.getElementById('emergencyContactName').value.trim() || null,
                emergencyContactNumber: document.getElementById('emergencyContactNumber').value.trim() || null,
                notes: document.getElementById('clientNotes').value.trim() || null,

                // Preserve existing map address
                mapaddress: this.client.mapaddress || null
            },
            recalculateTravelTimes: true, // Auto-recalculate if address changed
            selectedClinicIds: []          // Empty means all active clinics
        };
    }

    // =========================================================================
    // UI STATE METHODS
    // =========================================================================

    /**
     * Set loading state on save button
     *
     * @param {boolean} loading - Whether in loading state
     * @private
     * @returns {void}
     */
    setLoading(loading) {
        const saveBtn = document.getElementById('saveClientBtn');

        if (loading) {
            // Store original content for restoration
            if (!saveBtn.dataset.originalContent) {
                saveBtn.dataset.originalContent = saveBtn.innerHTML;
            }
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
        } else {
            saveBtn.disabled = false;
            if (saveBtn.dataset.originalContent) {
                saveBtn.innerHTML = saveBtn.dataset.originalContent;
            } else {
                saveBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Save Changes';
            }
        }
    }

    /**
     * Display error message in modal
     *
     * @param {string} message - Error message (can include HTML)
     * @returns {void}
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
     * Display success message in modal
     *
     * @param {string} message - Success message
     * @returns {void}
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
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

/**
 * Global ClientModal instance for onclick handlers
 *
 * Required because Bootstrap modals use onclick attributes that
 * need to reference a global function/object.
 *
 * @type {ClientModal|null}
 */
let clientModalInstance = null;
