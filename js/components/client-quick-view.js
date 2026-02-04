/**
 * @fileoverview Client Quick View Modal Component
 *
 * @description
 * Lightweight modal for previewing client information without navigating
 * away from the current page. Shows key client details and upcoming
 * appointments with options to view full details, add appointment, or edit.
 *
 * @requires Bootstrap 5 - For modal functionality
 *
 * @example
 * // Initialize on page load
 * const quickView = new ClientQuickView({
 *     onViewFullDetails: (kNumber) => window.location.href = `client-details.html?knumber=${kNumber}`,
 *     onAddAppointment: (kNumber) => appointmentModal.open('add', { kNumber })
 * });
 *
 * // Open for a specific client
 * quickView.open('K12345');
 *
 * @version 2.0.0
 * @since 2024-01-01
 */

'use strict';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * @typedef {Object} ClientQuickViewOptions
 * @property {Function} [onViewFullDetails] - Called when "View Full Details" clicked, receives kNumber
 * @property {Function} [onAddAppointment] - Called when "Add Appointment" clicked, receives kNumber
 * @property {Function} [onEditClient] - Called when "Edit Client" clicked, receives kNumber
 */

/**
 * @typedef {Object} ClientData
 * @property {string} knumber - Client K-number
 * @property {string} name - Client full name
 * @property {string} [phone] - Phone number
 * @property {string} [address] - Street address
 * @property {string} [city] - City
 * @property {boolean} [isActive] - Whether client is active
 */

/**
 * @typedef {Object} AppointmentData
 * @property {string} knumber - Client K-number
 * @property {string} appointmentDateTime - ISO 8601 datetime
 * @property {string} [locationName] - Appointment location
 */

// =============================================================================
// CLIENT QUICK VIEW CLASS
// =============================================================================

/**
 * Quick preview modal for client information
 *
 * @class
 */
class ClientQuickView {
    /**
     * Create a ClientQuickView instance
     *
     * @param {ClientQuickViewOptions} [options={}] - Configuration options
     */
    constructor(options = {}) {
        /**
         * Callback for viewing full client details
         * @type {Function|null}
         * @private
         */
        this.onViewFullDetails = options.onViewFullDetails || null;

        /**
         * Callback for adding appointment
         * @type {Function|null}
         * @private
         */
        this.onAddAppointment = options.onAddAppointment || null;

        /**
         * Callback for editing client
         * @type {Function|null}
         * @private
         */
        this.onEditClient = options.onEditClient || null;

        this.init();
    }

    /**
     * Initialize modal DOM and event listeners
     *
     * @private
     * @returns {void}
     */
    init() {
        const modalHTML = `
            <div class="modal fade" id="clientQuickViewModal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="clientQuickViewTitle">Client Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="clientQuickViewBody">
                            <div class="text-center">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-outline-primary" id="editClientBtn" style="display: none;">Edit Client</button>
                            <button type="button" class="btn btn-primary" id="addAppointmentBtn" style="display: none;">Add Appointment</button>
                            <button type="button" class="btn btn-primary" id="viewFullDetailsBtn" style="display: none;">View Full Details</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Only add modal if not already in DOM
        if (!document.getElementById('clientQuickViewModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        this.setupListeners();
    }

    /**
     * Setup button click listeners
     *
     * @private
     * @returns {void}
     */
    setupListeners() {
        const modal = document.getElementById('clientQuickViewModal');

        // View Full Details button
        document.getElementById('viewFullDetailsBtn')?.addEventListener('click', () => {
            const kNumber = modal.dataset.kNumber;
            if (this.onViewFullDetails && kNumber) {
                this.onViewFullDetails(kNumber);
            }
            this._hideModal();
        });

        // Add Appointment button
        document.getElementById('addAppointmentBtn')?.addEventListener('click', () => {
            const kNumber = modal.dataset.kNumber;
            if (this.onAddAppointment && kNumber) {
                this.onAddAppointment(kNumber);
            }
            this._hideModal();
        });

        // Edit Client button
        document.getElementById('editClientBtn')?.addEventListener('click', () => {
            const kNumber = modal.dataset.kNumber;
            if (this.onEditClient && kNumber) {
                this.onEditClient(kNumber);
            }
            this._hideModal();
        });
    }

    /**
     * Hide the modal
     *
     * @private
     * @returns {void}
     */
    _hideModal() {
        const modal = document.getElementById('clientQuickViewModal');
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();
    }

    /**
     * Open modal for a specific client
     *
     * @param {string} kNumber - Client K-number to display
     * @returns {Promise<void>}
     */
    async open(kNumber) {
        const modal = document.getElementById('clientQuickViewModal');
        const body = document.getElementById('clientQuickViewBody');

        // Store kNumber for button handlers
        modal.dataset.kNumber = kNumber;

        // Show loading state
        body.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-3 text-muted">Loading client information...</p>
            </div>
        `;

        // Show modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Load and display client data
        try {
            const [clientData, appointments] = await Promise.all([
                this.loadClientData(kNumber),
                this.loadClientAppointments(kNumber)
            ]);

            this.render(clientData, appointments);

            // Show action buttons
            document.getElementById('viewFullDetailsBtn').style.display = 'inline-block';
            document.getElementById('addAppointmentBtn').style.display = 'inline-block';
            document.getElementById('editClientBtn').style.display = 'inline-block';
        } catch (error) {
            console.error('[ClientQuickView] Error loading client data:', error);
            body.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="bi bi-exclamation-triangle"></i>
                    Error loading client information. Please try again.
                </div>
            `;
        }
    }

    /**
     * Fetch client data from API
     *
     * @param {string} kNumber - Client K-number
     * @returns {Promise<ClientData>} Client data
     * @throws {Error} If client not found or API fails
     * @private
     */
    async loadClientData(kNumber) {
        const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-clients');
        if (!response.ok) throw new Error('Failed to load clients');

        const data = await response.json();
        const client = data.clients?.find(c => c.knumber === kNumber);

        if (!client) throw new Error('Client not found');

        return client;
    }

    /**
     * Fetch upcoming appointments for client
     *
     * @param {string} kNumber - Client K-number
     * @returns {Promise<AppointmentData[]>} Next 3 upcoming appointments
     * @private
     */
    async loadClientAppointments(kNumber) {
        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-appointments');
            if (!response.ok) throw new Error('Failed to load appointments');

            const data = await response.json();
            const now = new Date();

            // Filter to this client's future appointments, sorted by date
            const upcoming = (data.appointments || [])
                .filter(apt => apt.knumber === kNumber && new Date(apt.appointmentDateTime) >= now)
                .sort((a, b) => new Date(a.appointmentDateTime) - new Date(b.appointmentDateTime))
                .slice(0, 3); // Limit to next 3

            return upcoming;
        } catch (error) {
            console.error('[ClientQuickView] Error loading appointments:', error);
            return [];
        }
    }

    /**
     * Render client data in modal body
     *
     * @param {ClientData} client - Client data
     * @param {AppointmentData[]} appointments - Upcoming appointments
     * @private
     * @returns {void}
     */
    render(client, appointments) {
        const body = document.getElementById('clientQuickViewBody');

        // Format phone number for display
        const phoneFormatted = client.phone
            ? `(${client.phone.slice(0, 3)}) ${client.phone.slice(3, 6)}-${client.phone.slice(6)}`
            : 'Not provided';

        // Status badge HTML
        const statusBadge = client.isActive
            ? '<span class="badge bg-success">Active</span>'
            : '<span class="badge bg-secondary">Inactive</span>';

        // Appointments list HTML
        const appointmentsHTML = appointments.length > 0
            ? appointments.map(apt => {
                const date = new Date(apt.appointmentDateTime);
                const formattedDate = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
                return `
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <i class="bi bi-calendar3 text-primary"></i>
                            <strong>${formattedDate}</strong>
                        </div>
                        <div class="text-muted small">
                            ${apt.locationName || 'Location TBD'}
                        </div>
                    </div>
                `;
            }).join('')
            : '<p class="text-muted small">No upcoming appointments</p>';

        body.innerHTML = `
            <div class="row mb-3">
                <div class="col-12">
                    <h4>${client.name || 'Unknown Client'}</h4>
                    <p class="text-muted mb-2">K-Number: ${client.knumber}</p>
                    ${statusBadge}
                </div>
            </div>

            <hr>

            <div class="row mb-3">
                <div class="col-md-6 mb-3">
                    <div class="d-flex align-items-start">
                        <i class="bi bi-telephone-fill text-primary me-2 mt-1"></i>
                        <div>
                            <small class="text-muted d-block">Phone</small>
                            <div>${phoneFormatted}</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 mb-3">
                    <div class="d-flex align-items-start">
                        <i class="bi bi-geo-alt-fill text-primary me-2 mt-1"></i>
                        <div>
                            <small class="text-muted d-block">Address</small>
                            <div>${client.address || 'Not provided'}</div>
                            <div class="text-muted small">${client.city || ''}</div>
                        </div>
                    </div>
                </div>
            </div>

            <hr>

            <div class="mb-3">
                <h6 class="text-muted text-uppercase small mb-3">Upcoming Appointments</h6>
                ${appointmentsHTML}
            </div>
        `;
    }
}

// =============================================================================
// GLOBAL INSTANCE
// =============================================================================

/**
 * Global ClientQuickView instance
 * @type {ClientQuickView|null}
 */
let clientQuickViewInstance = null;

/**
 * Initialize global instance on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    clientQuickViewInstance = new ClientQuickView({
        onViewFullDetails: (kNumber) => {
            window.location.href = `client-details.html?knumber=${kNumber}`;
        },
        onAddAppointment: (kNumber) => {
            // Open appointment modal with pre-filled client
            if (typeof appointmentModalInstance !== 'undefined' && appointmentModalInstance) {
                appointmentModalInstance.open('add', { kNumber });
            }
        },
        onEditClient: (kNumber) => {
            // TODO: Implement client edit modal or navigation
            console.log('[ClientQuickView] Edit client:', kNumber);
        }
    });
});
