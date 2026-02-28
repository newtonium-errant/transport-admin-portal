/**
 * Reusable Appointment Modal Component
 * Can be used on any page to add/edit/view appointments
 *
 * Version: v3.1.0
 * Changes:
 * - v3.1.0: Replaced client search-only input with searchable dropdown list
 * - v3.1.0: Search filter input above dropdown for type-to-filter behavior
 * - v3.1.0: Dropdown pre-populated with all active clients on modal open
 * - v3.1.0: Client selection from dropdown triggers same auto-population as before
 * - v3.0.0: Added appointment type support (round_trip, one_way, support)
 * - v3.0.0: Bootstrap btn-group type selector with conditional field visibility
 * - v3.0.0: One-way: trip_direction (to_clinic/to_home), adjusted labels
 * - v3.0.0: Support: auto K0000 sentinel, event_name field, hidden transit/client
 * - v3.0.0: Type change restrictions in edit mode (round_trip <-> one_way only)
 * - v3.0.0: Validation per type (one_way requires direction, support requires event_name)
 * - v2.6.0: Auto-populate primary clinic when client selected (add mode only)
 * - v2.5.1: Reload clients data in edit mode to show latest secondary addresses
 * - v2.5.0: Auto-populate appointment duration from client.default_appointment_length (client-specific)
 * - v2.5.0: Initialize this.clients array in constructor to prevent filter() errors
 * - v2.4.0: Make all form fields read-only when viewing archived appointments
 * - v2.4.0: Hide "Update Appointment" button for archived appointments (only show Restore)
 * - v2.3.1: Fixed archived detection to check deleted_at field (not status fields)
 * - v2.3.0: Added Restore button for archived/soft-deleted appointments
 * - v2.3.0: Restore button shown in edit mode for archived appointments (yellow button)
 * - v2.3.0: Calls /unarchive-appointment endpoint to restore archived appointments
 * - v2.2.0: Fixed pickup time calculation cascade (call setupPickupTimeCalculation AFTER cloning)
 * - v2.2.0: Simplified scheduling notes format (removed pickup time, just appointment time + clinic)
 * - v2.1.2: Enhanced logging for clinic_travel_times debugging (loadClients, selectClient, populateForm)
 * - v2.1.2: Removed duplicate inline onchange handler from clinic dropdown
 * - v2.1.1: Added detailed logging for transit time auto-population debugging
 * - v2.1.1: Fixed clinic change to auto-populate transit time via dedicated listener
 * - v2.1.0: Fixed scheduling notes to preserve database values unless datetime/transit time changes
 * - v2.1.0: Fixed clinic loading to use authenticatedFetch (JWT required)
 * - v2.0.0: Added driver_instructions field for driver-specific notes
 * - v2.0.0: Transit time now visible and editable in add mode
 * - v2.0.0: Auto-populates transit time from client.clinic_travel_times
 * - v2.0.0: Stores selectedClient with clinic_travel_times for lookups
 * - v2.0.0: Scheduling notes made readonly (auto-generated)
 */

// Utility: escape HTML to prevent XSS in innerHTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

class AppointmentModal {
    constructor(options = {}) {
        this.onSave = options.onSave || null;
        this.onDelete = options.onDelete || null;
        this.mode = 'add'; // 'add', 'edit', or 'view'
        this.currentAppointment = null;
        this.clients = []; // Store client data
        this.clinics = []; // Store clinic locations
        this.selectedClient = null; // Store selected client data including clinic_travel_times
        this.appointmentType = 'round_trip'; // 'round_trip', 'one_way', 'support'
        this.originalAppointmentType = null; // For edit mode type change restrictions
        // Store original values for edit mode to detect changes
        this.originalSchedulingNotes = null;
        this.originalAppointmentDateTime = null;
        this.originalTransitTime = null;
        this.init();
    }

    init() {
        // Create modal HTML
        const modalHTML = `
            <div class="modal fade" id="appointmentModal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="appointmentModalTitle">Add Appointment</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <form id="appointmentForm" onsubmit="event.preventDefault(); appointmentModalInstance.saveAppointment();">
                                <!-- Appointment Type Selector -->
                                <div class="mb-3" id="appointmentTypeSelector">
                                    <label class="form-label">Appointment Type</label>
                                    <div class="btn-group w-100" role="group" aria-label="Appointment type">
                                        <input type="radio" class="btn-check" name="appointmentType" id="typeRoundTrip" value="round_trip" checked>
                                        <label class="btn btn-outline-primary" for="typeRoundTrip">
                                            <i class="bi bi-arrow-repeat"></i> Round Trip
                                        </label>
                                        <input type="radio" class="btn-check" name="appointmentType" id="typeOneWay" value="one_way">
                                        <label class="btn btn-outline-info" for="typeOneWay">
                                            <i class="bi bi-arrow-right"></i> One Way
                                        </label>
                                        <input type="radio" class="btn-check" name="appointmentType" id="typeSupport" value="support">
                                        <label class="btn btn-outline-secondary" for="typeSupport">
                                            <i class="bi bi-people-fill"></i> Support Event
                                        </label>
                                    </div>
                                </div>

                                <!-- Trip Direction (One Way only) -->
                                <div class="mb-3" id="tripDirectionRow" style="display: none;">
                                    <label for="tripDirection" class="form-label">Trip Direction <span class="text-danger">*</span></label>
                                    <select class="form-select" id="tripDirection">
                                        <option value="">Select direction...</option>
                                        <option value="to_clinic">To Clinic (Home &rarr; Clinic)</option>
                                        <option value="to_home">To Home (Clinic &rarr; Home)</option>
                                    </select>
                                </div>

                                <!-- Event Name (Support only) -->
                                <div class="mb-3" id="eventNameRow" style="display: none;">
                                    <label for="eventName" class="form-label">Event Name <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" id="eventName" placeholder="e.g., Community Health Fair, Vaccination Drive">
                                    <small class="text-muted">Name of the support event or shuttle service</small>
                                </div>

                                <!-- Client Selection -->
                                <div class="mb-3" id="clientSelectionRow">
                                    <label for="appointmentClientDropdown" class="form-label">Client <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control mb-1" id="clientSearchFilter"
                                           placeholder="Type to filter clients..." autocomplete="off">
                                    <select class="form-select" id="appointmentClientDropdown" required>
                                        <option value="">Choose a client...</option>
                                    </select>
                                    <input type="hidden" id="appointmentClient" value="">
                                    <input type="hidden" id="appointmentClientId">
                                </div>

                                <!-- Appointment Details -->
                                <div class="row">
                                    <div class="col-md-12 mb-3">
                                        <label for="appointmentDate" class="form-label">Appointment Date & Time <span class="text-danger">*</span></label>
                                        <input type="datetime-local" class="form-control" id="appointmentDate" required>
                                        <small class="text-muted">Pickup time will be calculated automatically based on travel distance</small>
                                    </div>
                                </div>

                                <!-- Transit Time (Now visible in all modes) -->
                                <div class="row" id="transitTimeRow">
                                    <div class="col-md-6 mb-3">
                                        <label for="transitTime" class="form-label">
                                            Transit Time (minutes)
                                            <span class="badge bg-info text-dark">Auto-filled</span>
                                        </label>
                                        <input type="number" class="form-control" id="transitTime" min="1" max="300">
                                        <small class="text-muted">Auto-populated from client travel times (editable)</small>
                                        <small class="text-info d-none" id="transitTimeCalculatingHint"><i class="bi bi-hourglass-split me-1"></i>Travel times are still being calculated for this client. You may need to enter transit time manually.</small>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label for="pickupTime" class="form-label">Pickup Time (Calculated)</label>
                                        <input type="datetime-local" class="form-control" id="pickupTime" disabled>
                                        <small class="text-muted">Auto-calculated from appointment time - transit time</small>
                                    </div>
                                </div>

                                <!-- Location -->
                                <div class="row">
                                    <div class="col-md-12 mb-3">
                                        <label for="appointmentClinic" class="form-label">Clinic Location <span class="text-danger">*</span></label>
                                        <select class="form-select" id="appointmentClinic" required>
                                            <option value="">Select a clinic...</option>
                                        </select>
                                        <input type="hidden" id="appointmentClinicId">
                                        <input type="hidden" id="appointmentAddress">
                                    </div>
                                </div>

                                <!-- Pickup Address Selection (Edit Mode Only) -->
                                <div class="row" id="pickupAddressRow" style="display: none;">
                                    <div class="col-md-12 mb-3">
                                        <label for="appointmentPickupAddress" class="form-label">
                                            Pickup Address <span class="text-danger">*</span>
                                        </label>
                                        <select class="form-select" id="appointmentPickupAddress">
                                            <option value="">Select pickup address...</option>
                                        </select>
                                        <div class="pickup-address-help text-muted mt-1">
                                            <small id="pickupAddressHelpText"></small>
                                        </div>
                                    </div>
                                </div>

                                <!-- Duration & Status -->
                                <div class="row">
                                    <div class="col-md-4 mb-3">
                                        <label for="appointmentLength" class="form-label">Duration (minutes)</label>
                                        <input type="number" class="form-control" id="appointmentLength" value="120" min="1">
                                    </div>
                                    <div class="col-md-4 mb-3">
                                        <label for="appointmentStatus" class="form-label">Status <span class="text-danger">*</span></label>
                                        <select class="form-select" id="appointmentStatus" required>
                                            <option value="pending">Pending</option>
                                            <option value="assigned">Assigned</option>
                                            <option value="cancelled">Cancelled</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4 mb-3" id="driverFieldContainer">
                                        <label for="appointmentDriver" class="form-label">Driver</label>
                                        <select class="form-select" id="appointmentDriver" data-driver-assignment>
                                            <option value="">Not Assigned</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- Cost Information (hidden for booking agents) -->
                                <div class="row" id="costInformation" data-cost-field>
                                    <div class="col-md-6 mb-3">
                                        <label for="appointmentCost" class="form-label">Cost</label>
                                        <div class="input-group">
                                            <span class="input-group-text">$</span>
                                            <input type="number" class="form-control" id="appointmentCost" step="0.01" min="0">
                                        </div>
                                    </div>
                                </div>

                                <!-- Managing Agent (only visible in edit mode) -->
                                <div class="mb-3" id="managingAgentContainer" style="display: none;">
                                    <label for="managingAgent" class="form-label">
                                        Managing Agent
                                        <i class="bi bi-info-circle" title="The staff member responsible for managing this appointment"></i>
                                    </label>
                                    <!-- For booking agents: read-only text -->
                                    <input type="text" class="form-control" id="managingAgentText" readonly style="display: none; background-color: #e9ecef;">
                                    <!-- For supervisors/admins: dropdown -->
                                    <select class="form-select" id="managingAgent" style="display: none;">
                                        <option value="">Loading agents...</option>
                                    </select>
                                    <input type="hidden" id="managingAgentId">
                                    <small class="text-muted">Staff member responsible for this appointment</small>
                                </div>

                                <!-- Notes -->
                                <div class="mb-3">
                                    <label for="appointmentNotes" class="form-label">General Notes</label>
                                    <textarea class="form-control" id="appointmentNotes" rows="2" placeholder="Additional information about the appointment"></textarea>
                                    <small class="text-muted">Internal notes for booking agents (client instructions, special requirements, etc.)</small>
                                </div>

                                <!-- Driver Instructions -->
                                <div class="mb-3">
                                    <label for="driverInstructions" class="form-label">
                                        Driver Instructions
                                        <span class="badge bg-secondary">Optional</span>
                                    </label>
                                    <input type="text" class="form-control" id="driverInstructions" placeholder="e.g., Ring the doorbell, Call upon arrival">
                                    <small class="text-muted">Special instructions for the driver (pickup location, access notes, etc.)</small>
                                </div>

                                <!-- Scheduling Notes -->
                                <div class="mb-3">
                                    <label for="schedulingNotes" class="form-label">
                                        Scheduling Notes
                                        <span class="badge bg-info text-dark">Auto-generated</span>
                                    </label>
                                    <input type="text" class="form-control" id="schedulingNotes" placeholder="Will auto-generate when date/time and clinic are selected" readonly>
                                    <small class="text-muted">Format: "10:30 AM appointment at Clinic Name" (combined with driver instructions on save)</small>
                                </div>

                                <!-- Appointment ID (hidden, for edit mode) -->
                                <input type="hidden" id="appointmentId">
                                <div class="modal-footer px-0 pb-0">
                                    <button type="button" class="btn btn-dark me-auto" id="hardDeleteAppointmentBtn" style="display: none;" onclick="appointmentModalInstance.hardDeleteAppointment()">
                                        <i class="bi bi-trash"></i> Hard Delete
                                    </button>
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                    <button type="button" class="btn btn-warning" id="restoreAppointmentBtn" style="display: none;" onclick="appointmentModalInstance.restoreAppointment()">
                                        <i class="bi bi-arrow-counterclockwise"></i> Restore
                                    </button>
                                    <button type="button" class="btn btn-warning" id="reactivateAppointmentBtn" style="display: none;" onclick="appointmentModalInstance.reactivateAppointment()">
                                        <i class="bi bi-arrow-clockwise"></i> Reactivate
                                    </button>
                                    <button type="button" class="btn btn-danger" id="archiveAppointmentBtn" style="display: none;" onclick="appointmentModalInstance.archiveAppointment()">
                                        <i class="bi bi-trash"></i> Delete
                                    </button>
                                    <button type="button" class="btn btn-danger" id="cancelAppointmentBtn" style="display: none;" onclick="appointmentModalInstance.cancelAppointment()">
                                        <i class="bi bi-x-circle"></i> Cancel Appointment
                                    </button>
                                    <button type="submit" class="btn btn-primary" id="saveAppointmentBtn">Save Appointment</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page if it doesn't exist
        if (!document.getElementById('appointmentModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        // Don't load data immediately - wait until modal is opened
        // This prevents duplicate API calls during page initialization
        this.driversLoaded = false;
        this.clientsLoaded = false;
        this.clinicsLoaded = false;
        this.bookingAgentsLoaded = false;

        // Setup client search
        this.setupClientSearch();

        // Apply role-based restrictions
        this.applyRoleRestrictions();

        // Setup auto-calculation of pickup time
        this.setupPickupTimeCalculation();

        // Setup appointment type selector
        this.setupTypeSelector();
    }
    
    setupPickupTimeCalculation() {
        // In edit mode, recalculate pickup time when appointment time or transit time changes
        const appointmentDateField = document.getElementById('appointmentDate');
        const transitTimeField = document.getElementById('transitTime');
        const pickupTimeField = document.getElementById('pickupTime');

        const calculatePickupTime = () => {
            const appointmentDateTime = appointmentDateField.value;
            const transitTime = parseInt(transitTimeField.value);

            if (appointmentDateTime && transitTime > 0) {
                // Convert the datetime-local value (Halifax time) to Date object
                const apptDate = new Date(appointmentDateTime);

                // Subtract transit time to get pickup time
                const pickupDate = new Date(apptDate.getTime() - (transitTime * 60000));

                // Format back to datetime-local format (YYYY-MM-DDTHH:mm)
                pickupTimeField.value = this.formatDateTimeForInput(pickupDate);
            }
        };

        // Add event listeners
        appointmentDateField.addEventListener('change', calculatePickupTime);
        transitTimeField.addEventListener('input', calculatePickupTime);
    }

    setupTypeSelector() {
        const typeRadios = document.querySelectorAll('input[name="appointmentType"]');
        typeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.appointmentType = e.target.value;
                this.applyTypeVisibility();
            });
        });
    }

    /**
     * Show/hide fields based on current appointment type.
     * Called when type changes and when modal opens.
     */
    applyTypeVisibility() {
        const type = this.appointmentType;
        const clientSelectionRow = document.getElementById('clientSelectionRow');
        const tripDirectionRow = document.getElementById('tripDirectionRow');
        const eventNameRow = document.getElementById('eventNameRow');
        const transitTimeRow = document.getElementById('transitTimeRow');
        const pickupAddressRow = document.getElementById('pickupAddressRow');
        const clinicLabel = document.querySelector('label[for="appointmentClinic"]');

        // Trip direction: only for one_way
        if (tripDirectionRow) {
            tripDirectionRow.style.display = type === 'one_way' ? 'block' : 'none';
        }

        // Event name: only for support
        if (eventNameRow) {
            eventNameRow.style.display = type === 'support' ? 'block' : 'none';
        }

        if (type === 'support') {
            // Support: hide client selection, auto-set K0000
            if (clientSelectionRow) clientSelectionRow.style.display = 'none';
            document.getElementById('appointmentClientId').value = 'K0000';
            document.getElementById('appointmentClient').value = 'Support Event';
            const clientDropdown = document.getElementById('appointmentClientDropdown');
            if (clientDropdown) clientDropdown.removeAttribute('required');

            // Hide transit time row in support mode
            if (transitTimeRow) transitTimeRow.style.display = 'none';

            // Hide pickup address row in support mode
            if (pickupAddressRow) pickupAddressRow.style.display = 'none';

            // Change clinic label to "Event Venue"
            if (clinicLabel) clinicLabel.innerHTML = 'Event Venue <span class="text-danger">*</span>';

            // Clear selected client
            this.selectedClient = null;
        } else {
            // Round trip or one way: show client selection
            if (clientSelectionRow) clientSelectionRow.style.display = 'block';
            const clientDropdown = document.getElementById('appointmentClientDropdown');
            if (clientDropdown) clientDropdown.setAttribute('required', '');

            // Restore clinic label
            if (clinicLabel) clinicLabel.innerHTML = 'Clinic Location <span class="text-danger">*</span>';

            // Show transit time in edit mode
            if (transitTimeRow && this.mode === 'edit') {
                transitTimeRow.style.display = 'block';
            }

            // If switching back from support, clear the auto-set K0000
            const currentClientId = document.getElementById('appointmentClientId').value;
            if (currentClientId === 'K0000' && this.mode === 'add') {
                document.getElementById('appointmentClient').value = '';
                document.getElementById('appointmentClientId').value = '';
                if (clientDropdown) clientDropdown.value = '';
            }
        }
    }

    /**
     * Apply type change restrictions in edit mode.
     * round_trip <-> one_way allowed, support cannot change type.
     */
    applyTypeRestrictions() {
        if (this.mode !== 'edit') return;

        const typeRoundTrip = document.getElementById('typeRoundTrip');
        const typeOneWay = document.getElementById('typeOneWay');
        const typeSupport = document.getElementById('typeSupport');

        if (!typeRoundTrip || !typeOneWay || !typeSupport) return;

        if (this.originalAppointmentType === 'support') {
            // Support: lock to support only
            typeRoundTrip.disabled = true;
            typeOneWay.disabled = true;
            typeSupport.disabled = false;
            document.querySelector('label[for="typeRoundTrip"]').classList.add('disabled');
            document.querySelector('label[for="typeOneWay"]').classList.add('disabled');
        } else {
            // round_trip or one_way: can switch between them, but not to support
            typeRoundTrip.disabled = false;
            typeOneWay.disabled = false;
            typeSupport.disabled = true;
            document.querySelector('label[for="typeRoundTrip"]').classList.remove('disabled');
            document.querySelector('label[for="typeOneWay"]').classList.remove('disabled');
            document.querySelector('label[for="typeSupport"]').classList.add('disabled');
        }
    }

    async loadDrivers(drivers = null) {
        try {
            // If drivers provided, use them (from parent page's amalgamated data)
            let driversList = drivers;

            // Otherwise, fetch from parent page if available
            if (!driversList && window.appointmentsPage && window.appointmentsPage.drivers) {
                driversList = window.appointmentsPage.drivers;
                console.log('[Modal] Using drivers from parent page:', driversList.length);
            }

            // Fallback: fetch from amalgamated endpoint (shouldn't happen normally)
            if (!driversList) {
                console.warn('[Modal] No drivers provided, fetching from amalgamated endpoint');
                const response = await authenticatedFetch(
                    'https://webhook-processor-production-3bb8.up.railway.app/webhook/get-appointments-page-data'
                );
                if (response.ok) {
                    const data = await response.json();
                    driversList = data.data.drivers || [];
                }
            }

            // Store drivers in instance for later lookup
            this.drivers = driversList || [];

            // Populate dropdown
            const select = document.getElementById('appointmentDriver');
            if (select) {
                select.innerHTML = '<option value="">Not Assigned</option>';
                this.drivers.forEach(driver => {
                    const option = document.createElement('option');
                    option.value = driver.id;
                    option.textContent = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
                    select.appendChild(option);
                });
                console.log(`[Modal] Populated ${this.drivers.length} drivers in dropdown`);
            }
        } catch (error) {
            console.error('Error loading drivers:', error);
        }
    }

    async loadClients() {
        try {
            // If clients are already loaded (e.g., from finance page), use them
            if (this.clients && this.clients.length > 0) {
                console.log('[Modal] Using pre-loaded clients:', this.clients.length);

                // Debug: Check if clients have clinic_travel_times
                const clientsWithTravelTimes = this.clients.filter(c => c.clinic_travel_times);
                const clientsWithoutTravelTimes = this.clients.filter(c => !c.clinic_travel_times);
                console.log(`[Modal] Clients with travel times: ${clientsWithTravelTimes.length}, without: ${clientsWithoutTravelTimes.length}`);
                return;
            }

            // Try to get clients from parent page first
            if (window.appointmentsPage && window.appointmentsPage.clients) {
                this.clients = window.appointmentsPage.clients;
                console.log('[Modal] Using clients from parent page:', this.clients.length);

                // Debug: Check if clients have clinic_travel_times
                const clientsWithTravelTimes = this.clients.filter(c => c.clinic_travel_times);
                const clientsWithoutTravelTimes = this.clients.filter(c => !c.clinic_travel_times);
                console.log(`[Modal] Clients with travel times: ${clientsWithTravelTimes.length}, without: ${clientsWithoutTravelTimes.length}`);

                // Debug: Log a sample client to see structure
                if (this.clients.length > 0) {
                    const sampleClient = this.clients.find(c => (c.knumber || c.k_number) === 'K7807878') || this.clients[0];
                    console.log('[Modal] Sample client data:', {
                        knumber: sampleClient.knumber || sampleClient.k_number,
                        hasClinicTravelTimes: !!sampleClient.clinic_travel_times,
                        clinic_travel_times: sampleClient.clinic_travel_times
                    });
                }
                return;
            }

            // Fallback: fetch from amalgamated endpoint
            console.warn('[Modal] No clients from parent page, fetching from amalgamated endpoint');
            const response = await authenticatedFetch(
                'https://webhook-processor-production-3bb8.up.railway.app/webhook/get-appointments-page-data'
            );
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    this.clients = data.data.clients || [];
                }
            }
        } catch (error) {
            console.error('Error loading clients:', error);
            this.clients = [];
        }
    }

    async loadClinics() {
        try {
            const response = await authenticatedFetch(
                'https://webhook-processor-production-3bb8.up.railway.app/webhook/clinic-locations'
            );
            const data = await response.json();

            // Handle different response structures
            this.clinics = data.data?.destinations || data.destinations || data.data || data;

            // Ensure clinics is an array
            if (!Array.isArray(this.clinics)) {
                console.warn('Clinics data is not an array:', this.clinics);
                this.clinics = [];
                return;
            }

            // Populate the clinic dropdown
            const select = document.getElementById('appointmentClinic');
            if (select) {
                select.innerHTML = '<option value="">Select a clinic...</option>';
                this.clinics.forEach(clinic => {
                    const option = document.createElement('option');
                    option.value = clinic.name;
                    option.dataset.clinicId = clinic.id;
                    option.dataset.address = clinic.address || '';
                    option.dataset.city = clinic.city || '';
                    option.dataset.province = clinic.province || '';
                    option.dataset.postalCode = clinic.postalCode || '';
                    option.textContent = clinic.name;
                    select.appendChild(option);
                });
            }
            console.log(`[Modal] Loaded ${this.clinics.length} clinics`);
        } catch (error) {
            console.error('Error loading clinics:', error);
            this.clinics = [];
        }
    }

    async loadBookingAgents() {
        try {
            const response = await authenticatedFetch(
                'https://webhook-processor-production-3bb8.up.railway.app/webhook/get-booking-agent-list'
            );
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.booking_agents) {
                    const agents = data.booking_agents;

                    // Populate dropdown
                    const select = document.getElementById('managingAgent');
                    if (select) {
                        select.innerHTML = '<option value="">Select agent...</option>';
                        agents.forEach(agent => {
                            const option = document.createElement('option');
                            option.value = agent.id;
                            // Use full_name from users table schema
                            const displayName = agent.full_name || agent.username;
                            option.textContent = displayName;
                            option.setAttribute('data-name', displayName);
                            select.appendChild(option);
                        });
                        console.log(`[Modal] Populated ${agents.length} booking agents in dropdown`);
                    }
                    this.bookingAgentsLoaded = true;
                }
            }
        } catch (error) {
            console.error('Error loading booking agents:', error);
            this.bookingAgentsLoaded = false;
        }
    }

    selectClinic(clinicName) {
        if (!clinicName) {
            document.getElementById('appointmentClinicId').value = '';
            document.getElementById('appointmentAddress').value = '';
            return;
        }

        const clinic = this.clinics.find(c => c.name === clinicName);
        if (clinic) {
            // Build complete address
            const addressParts = [];
            if (clinic.address) addressParts.push(clinic.address);
            if (clinic.city) addressParts.push(clinic.city);
            if (clinic.province) addressParts.push(clinic.province);

            let fullAddress = addressParts.join(', ');
            if (clinic.postalCode) {
                fullAddress += ` ${clinic.postalCode}`;
            }

            document.getElementById('appointmentClinicId').value = clinic.id || '';
            document.getElementById('appointmentAddress').value = fullAddress;

            // Auto-populate transit time from client's pre-calculated travel times
            const calculatingHint = document.getElementById('transitTimeCalculatingHint');
            if (this.selectedClient && this.selectedClient.clinic_travel_times) {
                const travelTimes = this.selectedClient.clinic_travel_times;
                console.log(`[Transit Time] Client travel times:`, travelTimes);

                // Hide the calculating hint since travel times are available
                if (calculatingHint) calculatingHint.classList.add('d-none');

                // Try to find travel time for this clinic (handle JSONB parsing if needed)
                let clinicTravelTime = null;
                if (typeof travelTimes === 'string') {
                    try {
                        const parsed = JSON.parse(travelTimes);
                        clinicTravelTime = parsed[clinicName];
                        console.log(`[Transit Time] Parsed travel times, found for ${clinicName}:`, clinicTravelTime);
                    } catch (e) {
                        console.error('[Transit Time] Error parsing clinic_travel_times:', e);
                    }
                } else {
                    clinicTravelTime = travelTimes[clinicName];
                    console.log(`[Transit Time] Direct lookup for ${clinicName}:`, clinicTravelTime);
                }

                if (clinicTravelTime) {
                    // Use primary address travel time by default, fallback to secondary
                    const transitMinutes = clinicTravelTime.primary?.duration_minutes ||
                                         clinicTravelTime.secondary?.duration_minutes;

                    console.log(`[Transit Time] Extracted transit minutes:`, transitMinutes);

                    if (transitMinutes) {
                        const transitField = document.getElementById('transitTime');
                        transitField.value = transitMinutes;
                        console.log(`[Transit Time] ✅ Set transit time field to ${transitMinutes} minutes for ${clinicName}`);

                        // Trigger pickup time recalculation by dispatching input event
                        transitField.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        console.warn(`[Transit Time] No duration_minutes found in travel time data`);
                    }
                } else {
                    console.warn(`[Transit Time] No travel time found for clinic: ${clinicName}`);
                    console.log(`[Transit Time] Available clinics in travel times:`, typeof travelTimes === 'string' ? 'string - needs parsing' : Object.keys(travelTimes));
                }
            } else {
                if (!this.selectedClient) {
                    console.warn(`[Transit Time] No client selected`);
                } else if (!this.selectedClient.clinic_travel_times) {
                    // Show hint that travel times may still be calculating
                    if (calculatingHint) calculatingHint.classList.remove('d-none');
                    console.warn(`[Transit Time] Client ${this.selectedClient.knumber} has no clinic_travel_times`);
                }
            }

            console.log(`[Clinic] Selected: ${clinicName}, Address: ${fullAddress}`);
        }
    }

    setupClientSearch() {
        const filterInput = document.getElementById('clientSearchFilter');
        const dropdown = document.getElementById('appointmentClientDropdown');

        if (!filterInput || !dropdown) return;

        // Filter dropdown options as user types
        filterInput.addEventListener('input', () => {
            const searchTerm = filterInput.value.toLowerCase().trim();
            const options = dropdown.querySelectorAll('option');

            options.forEach(option => {
                if (!option.value) {
                    // Always show the placeholder option
                    option.style.display = '';
                    return;
                }
                const text = option.textContent.toLowerCase();
                option.style.display = text.includes(searchTerm) ? '' : 'none';
            });

            // If search narrows to exactly one visible option (besides placeholder), auto-select it
            const visibleOptions = Array.from(options).filter(o => o.value && o.style.display !== 'none');
            if (visibleOptions.length === 1 && searchTerm.length >= 2) {
                dropdown.value = visibleOptions[0].value;
                // Do NOT auto-trigger change here; let user confirm by clicking
            }
        });

        // When a client is selected from dropdown, trigger selectClient
        dropdown.addEventListener('change', () => {
            const knumber = dropdown.value;
            if (!knumber) {
                // Reset client selection
                document.getElementById('appointmentClient').value = '';
                document.getElementById('appointmentClientId').value = '';
                this.selectedClient = null;
                return;
            }

            const selectedOption = dropdown.selectedOptions[0];
            const fullName = selectedOption ? selectedOption.dataset.fullname : '';
            this.selectClient(knumber, fullName);

            // Clear the search filter after selection
            filterInput.value = '';
            // Show all options again
            dropdown.querySelectorAll('option').forEach(o => o.style.display = '');
        });
    }

    /**
     * Populates the client dropdown with all active clients.
     * Called after clients are loaded (in open() method).
     */
    populateClientDropdown() {
        const dropdown = document.getElementById('appointmentClientDropdown');
        if (!dropdown) return;

        // Preserve current selection if any
        const currentValue = dropdown.value;

        dropdown.innerHTML = '<option value="">Choose a client...</option>';

        // Filter to active clients only, exclude K0000 sentinel in non-support mode
        const clientsToShow = this.clients.filter(client => {
            const knum = client.knumber || client.k_number || '';
            if (knum === 'K0000' && this.appointmentType !== 'support') return false;
            // Only show active clients (match bulk-add page pattern)
            if (client.active === false || client.status === 'inactive') return false;
            return true;
        });

        // Sort by last name, first name for easy browsing
        clientsToShow.sort((a, b) => {
            const lastA = (a.lastname || a.last_name || '').toLowerCase();
            const lastB = (b.lastname || b.last_name || '').toLowerCase();
            if (lastA !== lastB) return lastA.localeCompare(lastB);
            const firstA = (a.firstname || a.first_name || '').toLowerCase();
            const firstB = (b.firstname || b.first_name || '').toLowerCase();
            return firstA.localeCompare(firstB);
        });

        clientsToShow.forEach(client => {
            const knum = client.knumber || client.k_number || '';
            const firstName = client.firstname || client.first_name || '';
            const lastName = client.lastname || client.last_name || '';
            const option = document.createElement('option');
            option.value = knum;
            option.textContent = `${lastName}, ${firstName} - ${knum}`;
            option.dataset.fullname = `${firstName} ${lastName}`;
            dropdown.appendChild(option);
        });

        // Restore previous selection if it still exists
        if (currentValue) {
            dropdown.value = currentValue;
        }

        console.log(`[Modal] Populated client dropdown with ${clientsToShow.length} clients`);
    }

    selectClient(knumber, fullName) {
        document.getElementById('appointmentClient').value = fullName;
        document.getElementById('appointmentClientId').value = knumber;

        // Sync dropdown selection if it exists
        const dropdown = document.getElementById('appointmentClientDropdown');
        if (dropdown && dropdown.value !== knumber) {
            dropdown.value = knumber;
        }

        // Store the full client object including clinic_travel_times
        // Check both knumber and k_number field names for compatibility
        this.selectedClient = this.clients.find(c => (c.knumber || c.k_number) === knumber) || null;

        console.log(`[Client Selection] Selected client ${knumber}:`, {
            found: !!this.selectedClient,
            hasClinicTravelTimes: this.selectedClient?.clinic_travel_times ? true : false,
            clinic_travel_times: this.selectedClient?.clinic_travel_times
        });

        // If client has no clinic_travel_times, log a warning
        if (this.selectedClient && !this.selectedClient.clinic_travel_times) {
            console.warn(`[Client Selection] Client ${knumber} does not have clinic_travel_times calculated`);
        }

        // Auto-populate appointment duration from client's default duration
        if (this.selectedClient) {
            const clientDuration = this.selectedClient.default_appointment_length ||
                                 this.selectedClient.appointment_length ||
                                 this.selectedClient.appointmentLength;

            if (clientDuration) {
                const durationField = document.getElementById('appointmentLength');
                if (durationField) {
                    durationField.value = clientDuration;
                    console.log(`[Appointment Duration] ✅ Set duration to ${clientDuration} minutes for client ${knumber}`);
                }
            } else {
                console.log(`[Appointment Duration] Client ${knumber} uses default duration (120 minutes)`);
            }

            // Auto-populate primary clinic if client has one (add mode only)
            if (this.mode === 'add' && this.selectedClient.primary_clinic_id) {
                console.log(`[Primary Clinic] Client has primary_clinic_id: ${this.selectedClient.primary_clinic_id}`);
                console.log(`[Primary Clinic] Available clinics:`, this.clinics);
                console.log(`[Primary Clinic] Clinics loaded:`, this.clinicsLoaded);

                const primaryClinic = this.clinics.find(clinic => clinic.id === this.selectedClient.primary_clinic_id);
                console.log(`[Primary Clinic] Found clinic:`, primaryClinic);

                if (primaryClinic) {
                    const clinicDropdown = document.getElementById('appointmentClinic');
                    console.log(`[Primary Clinic] Clinic dropdown exists:`, !!clinicDropdown);

                    if (clinicDropdown) {
                        console.log(`[Primary Clinic] Dropdown current value:`, clinicDropdown.value);
                        console.log(`[Primary Clinic] Setting value to:`, primaryClinic.name);

                        clinicDropdown.value = primaryClinic.name;

                        console.log(`[Primary Clinic] Dropdown value after set:`, clinicDropdown.value);
                        console.log(`[Primary Clinic] ✅ Set clinic to "${primaryClinic.name}" (ID: ${this.selectedClient.primary_clinic_id}) for client ${knumber}`);

                        // Trigger change event to populate address and transit time
                        clinicDropdown.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        console.error(`[Primary Clinic] Clinic dropdown not found!`);
                    }
                } else {
                    console.warn(`[Primary Clinic] Clinic ID ${this.selectedClient.primary_clinic_id} not found in clinics list`);
                    console.log(`[Primary Clinic] Available clinic IDs:`, this.clinics.map(c => c.id));
                }
            } else {
                if (!this.selectedClient.primary_clinic_id) {
                    console.log(`[Primary Clinic] Client has no primary_clinic_id set`);
                }
                if (this.mode !== 'add') {
                    console.log(`[Primary Clinic] Mode is "${this.mode}", not "add" - skipping auto-populate`);
                }
            }
        }
    }

    /**
     * Determines which client address to use for pickup based on clinic travel times
     * Returns formatted address string: "123 Main St, City, NS, A1B 2C3"
     */
    getPickupAddress() {
        if (!this.selectedClient) {
            console.warn('[Pickup Address] No client selected');
            return null;
        }

        const clinicName = document.getElementById('appointmentClinic').value;
        if (!clinicName) {
            console.warn('[Pickup Address] No clinic selected');
            return null;
        }

        // Check if client has pre-calculated travel times for this clinic
        if (!this.selectedClient.clinic_travel_times) {
            console.log('[Pickup Address] No travel times available, defaulting to primary address');
            return this.formatAddress(
                this.selectedClient.civicaddress,
                this.selectedClient.city,
                this.selectedClient.prov,
                this.selectedClient.postalcode
            );
        }

        // Parse travel times (may be string or object)
        let travelTimes = this.selectedClient.clinic_travel_times;
        if (typeof travelTimes === 'string') {
            travelTimes = JSON.parse(travelTimes);
        }

        const clinicTravelTime = travelTimes[clinicName];
        if (!clinicTravelTime) {
            console.log(`[Pickup Address] No travel time for clinic "${clinicName}", defaulting to primary address`);
            return this.formatAddress(
                this.selectedClient.civicaddress,
                this.selectedClient.city,
                this.selectedClient.prov,
                this.selectedClient.postalcode
            );
        }

        // Determine which address has travel time data (primary takes precedence)
        if (clinicTravelTime.primary && clinicTravelTime.primary.duration_minutes) {
            console.log('[Pickup Address] Using primary address');
            return this.formatAddress(
                this.selectedClient.civicaddress,
                this.selectedClient.city,
                this.selectedClient.prov,
                this.selectedClient.postalcode
            );
        } else if (clinicTravelTime.secondary && clinicTravelTime.secondary.duration_minutes) {
            console.log('[Pickup Address] Using secondary address');
            return this.formatAddress(
                this.selectedClient.secondary_civic_address,
                this.selectedClient.secondary_city,
                this.selectedClient.secondary_province,
                this.selectedClient.secondary_postal_code
            );
        }

        // Fallback to primary if no valid travel times
        console.log('[Pickup Address] No valid travel times, defaulting to primary address');
        return this.formatAddress(
            this.selectedClient.civicaddress,
            this.selectedClient.city,
            this.selectedClient.prov,
            this.selectedClient.postalcode
        );
    }

    /**
     * Formats an address into the standard string format
     * @returns {string|null} "123 Main St, City, NS, A1B 2C3" or null if address incomplete
     */
    formatAddress(street, city, province, postal) {
        // Filter out null/empty values
        const parts = [street, city, province, postal].filter(p => p && p.trim());

        if (parts.length === 0) {
            return null;
        }

        return parts.join(', ');
    }

    /**
     * Builds array of available pickup addresses for the selected client
     * @returns {Array} Array of address objects with type, full, and display properties
     */
    buildPickupAddressOptions() {
        if (!this.selectedClient) return [];

        const addresses = [];

        // Primary address (always available)
        const primaryFull = this.formatAddress(
            this.selectedClient.civicaddress,
            this.selectedClient.city,
            this.selectedClient.prov,
            this.selectedClient.postalcode
        );

        if (primaryFull) {
            // Create shorter display version (no postal code)
            const primaryDisplay = this.formatAddress(
                this.selectedClient.civicaddress,
                this.selectedClient.city,
                this.selectedClient.prov
            );

            addresses.push({
                type: 'primary',
                full: primaryFull,
                display: primaryDisplay || primaryFull
            });
        }

        // Secondary address (if exists)
        if (this.selectedClient.secondary_civic_address &&
            this.selectedClient.secondary_civic_address.trim()) {
            const secondaryFull = this.formatAddress(
                this.selectedClient.secondary_civic_address,
                this.selectedClient.secondary_city,
                this.selectedClient.secondary_province,
                this.selectedClient.secondary_postal_code
            );

            if (secondaryFull) {
                // Create shorter display version (no postal code)
                const secondaryDisplay = this.formatAddress(
                    this.selectedClient.secondary_civic_address,
                    this.selectedClient.secondary_city,
                    this.selectedClient.secondary_province
                );

                addresses.push({
                    type: 'secondary',
                    full: secondaryFull,
                    display: secondaryDisplay || secondaryFull
                });
            }
        }

        return addresses;
    }

    /**
     * Populates the pickup address dropdown with available addresses
     */
    populatePickupAddressDropdown() {
        const dropdown = document.getElementById('appointmentPickupAddress');
        if (!dropdown) return;

        const addresses = this.buildPickupAddressOptions();

        dropdown.innerHTML = '<option value="">Select pickup address...</option>';

        addresses.forEach(addr => {
            const option = document.createElement('option');
            option.value = addr.type;
            option.textContent = addr.display;  // Shows actual address
            option.dataset.fullAddress = addr.full;
            dropdown.appendChild(option);
        });

        // Update help text
        const helpText = document.getElementById('pickupAddressHelpText');
        if (helpText) {
            if (addresses.length > 1) {
                helpText.textContent = 'Client has multiple addresses - choose which one to use for pickup';
            } else if (addresses.length === 1) {
                helpText.textContent = 'Using client address';
            } else {
                helpText.textContent = 'No address available for this client';
            }
        }
    }

    /**
     * Auto-selects pickup address based on clinic travel times
     */
    autoSelectPickupAddress() {
        const dropdown = document.getElementById('appointmentPickupAddress');
        const clinicName = document.getElementById('appointmentClinic').value;

        if (!dropdown || !this.selectedClient || !clinicName) return;

        // Check if client has pre-calculated travel times
        if (!this.selectedClient.clinic_travel_times) {
            dropdown.value = 'primary'; // Default to primary
            return;
        }

        // Parse travel times
        let travelTimes = this.selectedClient.clinic_travel_times;
        if (typeof travelTimes === 'string') {
            try {
                travelTimes = JSON.parse(travelTimes);
            } catch (e) {
                console.error('Error parsing travel times:', e);
                dropdown.value = 'primary';
                return;
            }
        }

        const clinicTravelTime = travelTimes[clinicName];
        if (!clinicTravelTime) {
            dropdown.value = 'primary'; // Default to primary
            return;
        }

        // Determine which address has travel time data
        if (clinicTravelTime.primary && clinicTravelTime.primary.duration_minutes) {
            dropdown.value = 'primary';
        } else if (clinicTravelTime.secondary && clinicTravelTime.secondary.duration_minutes) {
            dropdown.value = 'secondary';
        } else {
            dropdown.value = 'primary'; // Fallback
        }
    }

    /**
     * Sets up sync between pickup address selection and transit time
     */
    setupPickupAddressSync() {
        const addressDropdown = document.getElementById('appointmentPickupAddress');
        const transitTimeField = document.getElementById('transitTime');
        const clinicDropdown = document.getElementById('appointmentClinic');

        if (!addressDropdown || !transitTimeField || !clinicDropdown) return;

        addressDropdown.addEventListener('change', () => {
            const addressType = addressDropdown.value;
            const clinicName = clinicDropdown.value;

            if (!addressType || !clinicName || !this.selectedClient) return;

            // Update transit time based on selected address
            if (this.selectedClient.clinic_travel_times) {
                let travelTimes = this.selectedClient.clinic_travel_times;
                if (typeof travelTimes === 'string') {
                    try {
                        travelTimes = JSON.parse(travelTimes);
                    } catch (e) {
                        console.error('Error parsing travel times:', e);
                        return;
                    }
                }

                const clinicTravelTime = travelTimes[clinicName];
                if (clinicTravelTime && clinicTravelTime[addressType]) {
                    const transitMinutes = clinicTravelTime[addressType].duration_minutes;
                    if (transitMinutes) {
                        transitTimeField.value = transitMinutes;
                        console.log(`[Address Change] Updated transit time to ${transitMinutes} minutes for ${addressType} address`);

                        // Trigger pickup time recalculation
                        transitTimeField.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        });
    }

    applyRoleRestrictions() {
        const userRole = getUserRole();
        const permissions = getRolePermissions(userRole);

        // Handle driver assignment: show field but disable it if can't assign
        if (!permissions?.canAssignDrivers) {
            const driverFields = document.querySelectorAll('[data-driver-assignment]');
            driverFields.forEach(el => {
                // Check if user can view drivers (booking agents can see but not edit)
                if (permissions?.canViewDrivers) {
                    el.disabled = true;
                    el.title = 'You do not have permission to assign drivers';
                    // Add visual indicator that field is read-only (consistent with other disabled fields)
                    el.style.backgroundColor = '#e9ecef';
                } else {
                    // Hide completely if can't view drivers
                    el.style.display = 'none';
                }
            });
        }

        if (!permissions?.canViewCosts) {
            document.querySelectorAll('[data-cost-field]').forEach(el => {
                el.style.display = 'none';
            });
        }

        // Transit time: Read-only for booking agents in edit mode, editable for supervisors/admins
        const transitTimeField = document.getElementById('transitTime');
        if (transitTimeField && userRole === 'booking_agent' && this.mode === 'edit') {
            transitTimeField.disabled = true;
            transitTimeField.style.backgroundColor = '#e9ecef';
        } else if (transitTimeField && this.mode === 'edit') {
            transitTimeField.disabled = false;
            transitTimeField.style.backgroundColor = '';
        }

        // Status field: Read-only for booking agents and supervisors, editable ONLY for admins
        const statusField = document.getElementById('appointmentStatus');
        if (statusField && userRole !== 'admin') {
            statusField.disabled = true;
            statusField.style.backgroundColor = '#e9ecef';
        } else if (statusField) {
            statusField.disabled = false;
            statusField.style.backgroundColor = '';
        }
    }

    async open(mode = 'add', appointment = null) {
        this.mode = mode;
        this.currentAppointment = appointment;

        // Lazy load data on first open (after page has loaded)
        if (!this.driversLoaded) {
            await this.loadDrivers();
            this.driversLoaded = true;
        }
        // Always reload clients in edit mode to ensure we have latest address data
        if (!this.clientsLoaded || mode === 'edit') {
            await this.loadClients();
            this.clientsLoaded = true;
        }
        // Populate client dropdown with loaded clients
        this.populateClientDropdown();

        if (!this.clinicsLoaded) {
            await this.loadClinics();
            this.clinicsLoaded = true;
        }

        // Update modal title and buttons
        const title = document.getElementById('appointmentModalTitle');
        const hardDeleteBtn = document.getElementById('hardDeleteAppointmentBtn');
        const restoreBtn = document.getElementById('restoreAppointmentBtn');
        const reactivateBtn = document.getElementById('reactivateAppointmentBtn');
        const archiveBtn = document.getElementById('archiveAppointmentBtn');
        const cancelBtn = document.getElementById('cancelAppointmentBtn');
        const saveBtn = document.getElementById('saveAppointmentBtn');

        const transitTimeRow = document.getElementById('transitTimeRow');
        const transitTimeField = document.getElementById('transitTime');
        const driverFieldContainer = document.getElementById('driverFieldContainer');

        const userRole = getUserRole();
        const permissions = getRolePermissions(userRole);

        if (mode === 'view') {
            title.textContent = 'View Appointment';
            hardDeleteBtn.style.display = 'none';
            restoreBtn.style.display = 'none';
            reactivateBtn.style.display = 'none';
            archiveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            saveBtn.textContent = 'Close';
            saveBtn.onclick = () => bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
            transitTimeRow.style.display = 'block'; // Show in view mode
            transitTimeField.disabled = true; // Read-only in view mode
            if (driverFieldContainer) driverFieldContainer.style.display = 'block'; // Show driver in view mode
        } else if (mode === 'edit') {
            title.textContent = 'Edit Appointment';

            // Show hard delete only for admins
            const canHardDelete = permissions?.canHardDeleteAppointments;
            hardDeleteBtn.style.display = canHardDelete ? 'inline-block' : 'none';

            // Check if appointment is archived/soft deleted
            // Archived appointments have deleted_at field set (not null)
            const isArchived = appointment && appointment.deleted_at !== null && appointment.deleted_at !== undefined;

            // Check if appointment is cancelled
            const isCancelled = appointment && appointment.operation_status === 'cancelled';

            // Show appropriate buttons based on appointment state
            if (isArchived) {
                // Archived appointment: show restore button only, make all fields read-only
                restoreBtn.style.display = 'inline-block';
                reactivateBtn.style.display = 'none';
                archiveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                saveBtn.style.display = 'none'; // Hide Update button for archived appointments

                // Make all form fields read-only
                this.setFormFieldsDisabled(true);
            } else if (isCancelled) {
                // Cancelled appointment: show reactivate button only, make all fields read-only
                restoreBtn.style.display = 'none';
                reactivateBtn.style.display = 'inline-block';
                archiveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                saveBtn.style.display = 'none'; // Hide Update button for cancelled appointments

                // Make all form fields read-only
                this.setFormFieldsDisabled(true);
            } else {
                // Active appointment: show archive/cancel based on driver assignment
                restoreBtn.style.display = 'none';
                reactivateBtn.style.display = 'none';
                const hasDriver = appointment && appointment.driverAssigned;
                const canDelete = permissions?.canDeleteAppointments;

                if (canDelete) {
                    if (hasDriver) {
                        // Has driver: show cancel button
                        cancelBtn.style.display = 'inline-block';
                        archiveBtn.style.display = 'none';
                    } else {
                        // No driver: show archive button
                        archiveBtn.style.display = 'inline-block';
                        cancelBtn.style.display = 'none';
                    }
                } else {
                    // No delete permissions: hide both
                    archiveBtn.style.display = 'none';
                    cancelBtn.style.display = 'none';
                }

                saveBtn.style.display = 'inline-block';
                saveBtn.textContent = 'Update Appointment';
                saveBtn.onclick = () => this.saveAppointment();

                // Make form fields editable
                this.setFormFieldsDisabled(false);

                // Re-apply status field RBAC after enabling fields
                const statusField = document.getElementById('appointmentStatus');
                if (statusField && userRole !== 'admin') {
                    statusField.disabled = true;
                    statusField.style.backgroundColor = '#e9ecef';
                }
            }

            transitTimeRow.style.display = 'block'; // Show in edit mode
            if (driverFieldContainer) driverFieldContainer.style.display = 'block'; // Show driver in edit mode

            // Show pickup address selection in edit mode
            const pickupAddressRow = document.getElementById('pickupAddressRow');
            const pickupAddressSelect = document.getElementById('appointmentPickupAddress');
            if (pickupAddressRow) {
                pickupAddressRow.style.display = 'block';
                if (pickupAddressSelect) pickupAddressSelect.required = true; // Enable validation in edit mode
                // Note: populatePickupAddressDropdown() will be called in populateForm() after client data is loaded
            }
        } else {
            title.textContent = 'Add Appointment';
            hardDeleteBtn.style.display = 'none';
            restoreBtn.style.display = 'none';
            reactivateBtn.style.display = 'none';
            archiveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            saveBtn.textContent = 'Save Appointment';
            saveBtn.onclick = () => this.saveAppointment();
            transitTimeRow.style.display = 'none'; // Hide in add mode
            if (driverFieldContainer) driverFieldContainer.style.display = 'none'; // Hide driver in add mode

            // Hide pickup address selection in add mode (auto-determined)
            const pickupAddressRow = document.getElementById('pickupAddressRow');
            const pickupAddressSelect = document.getElementById('appointmentPickupAddress');
            if (pickupAddressRow) {
                pickupAddressRow.style.display = 'none';
                if (pickupAddressSelect) pickupAddressSelect.required = false; // Disable validation when hidden
            }

            // Ensure scheduling notes is read-only with gray background in add mode
            const schedulingNotesField = document.getElementById('schedulingNotes');
            if (schedulingNotesField) {
                schedulingNotesField.readOnly = true;
                schedulingNotesField.style.backgroundColor = '#e9ecef';
            }
        }

        // Re-enable buttons (they may have been disabled from previous operations)
        saveBtn.disabled = false;
        if (hardDeleteBtn) {
            hardDeleteBtn.disabled = false;
            hardDeleteBtn.innerHTML = '<i class="bi bi-trash"></i> Hard Delete';
        }
        if (restoreBtn) {
            restoreBtn.disabled = false;
            restoreBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Restore';
        }
        if (archiveBtn) {
            archiveBtn.disabled = false;
            archiveBtn.innerHTML = '<i class="bi bi-trash"></i> Delete';
        }
        if (cancelBtn) {
            cancelBtn.disabled = false;
            cancelBtn.innerHTML = '<i class="bi bi-x-circle"></i> Cancel Appointment';
        }

        // Setup driver change event listener (do this BEFORE populating form to avoid resetting values)
        this.setupDriverStatusSync();

        // Setup clinic change to auto-populate transit time
        this.setupClinicTransitTimeSync();

        // Setup pickup address sync to update transit time when address changes
        this.setupPickupAddressSync();

        // Setup scheduling notes auto-generation (clones fields, removes existing listeners)
        this.setupSchedulingNotesGeneration();

        // Setup pickup time calculation AFTER scheduling notes setup (which clones transit time field)
        this.setupPickupTimeCalculation();

        // Setup managing agent field
        const managingAgentContainer = document.getElementById('managingAgentContainer');
        const managingAgentDropdown = document.getElementById('managingAgent');
        const managingAgentText = document.getElementById('managingAgentText');

        // Check if user can reassign agents (supervisors and admins)
        const canReassignAgents = userRole === 'supervisor' || userRole === 'admin';

        if (canReassignAgents) {
            // Supervisors/Admins: Show managing agent field in both add and edit modes
            managingAgentContainer.style.display = 'block';
            managingAgentDropdown.style.display = 'block';
            managingAgentText.style.display = 'none';

            // Load booking agents for dropdown
            if (!this.bookingAgentsLoaded) {
                await this.loadBookingAgents();
            }

            // In add mode, pre-select current user
            if (mode === 'add') {
                const currentUser = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');
                if (currentUser.id) {
                    // Set dropdown to current user (will be populated after loadBookingAgents completes)
                    setTimeout(() => {
                        document.getElementById('managingAgent').value = String(currentUser.id);
                        document.getElementById('managingAgentId').value = String(currentUser.id);
                    }, 100);
                }
            }
        } else {
            // Booking agents: Only show in edit mode (read-only)
            if (mode === 'edit') {
                managingAgentContainer.style.display = 'block';
                managingAgentDropdown.style.display = 'none';
                managingAgentText.style.display = 'block';
            } else {
                // Hide in add mode for booking agents (will be auto-set to current user)
                managingAgentContainer.style.display = 'none';
            }
        }

        // Populate form if editing
        if (mode === 'edit' && appointment) {
            this.populateForm(appointment);

            // Lock client dropdown in edit mode - cannot change appointment's client
            const clientDropdown = document.getElementById('appointmentClientDropdown');
            const clientSearchFilter = document.getElementById('clientSearchFilter');
            if (clientDropdown) {
                clientDropdown.disabled = true;
                clientDropdown.style.backgroundColor = '#e9ecef';
                clientDropdown.title = 'Cannot change client for existing appointment. Archive this appointment and create a new one if needed.';
            }
            if (clientSearchFilter) {
                clientSearchFilter.style.display = 'none';
            }
        } else {
            document.getElementById('appointmentForm').reset();
            // Clear hidden fields
            document.getElementById('appointmentClientId').value = '';
            document.getElementById('appointmentClinicId').value = '';
            document.getElementById('appointmentAddress').value = '';
            document.getElementById('appointmentId').value = '';
            document.getElementById('transitTime').value = '';
            document.getElementById('pickupTime').value = '';
            document.getElementById('schedulingNotes').value = '';

            // Reset appointment type fields
            document.getElementById('tripDirection').value = '';
            document.getElementById('eventName').value = '';

            // Hide travel times calculating hint
            const calculatingHint = document.getElementById('transitTimeCalculatingHint');
            if (calculatingHint) calculatingHint.classList.add('d-none');

            // Reset original values (add mode - no originals to compare against)
            this.originalSchedulingNotes = null;
            this.originalAppointmentDateTime = null;
            this.originalTransitTime = null;

            // Ensure client dropdown is enabled in add mode
            const clientDropdown = document.getElementById('appointmentClientDropdown');
            const clientSearchFilter = document.getElementById('clientSearchFilter');
            if (clientDropdown) {
                clientDropdown.disabled = false;
                clientDropdown.style.backgroundColor = '';
                clientDropdown.title = '';
                clientDropdown.value = '';
            }
            if (clientSearchFilter) {
                clientSearchFilter.style.display = '';
                clientSearchFilter.value = '';
            }
            // Clear hidden client field
            document.getElementById('appointmentClient').value = '';
        }

        // Initialize appointment type for this open
        if (mode === 'add') {
            // Default to round_trip, all types selectable
            this.appointmentType = 'round_trip';
            this.originalAppointmentType = null;
            document.getElementById('typeRoundTrip').checked = true;
            document.getElementById('typeRoundTrip').disabled = false;
            document.getElementById('typeOneWay').disabled = false;
            document.getElementById('typeSupport').disabled = false;
            document.querySelector('label[for="typeRoundTrip"]').classList.remove('disabled');
            document.querySelector('label[for="typeOneWay"]').classList.remove('disabled');
            document.querySelector('label[for="typeSupport"]').classList.remove('disabled');
            document.getElementById('appointmentTypeSelector').style.display = 'block';
        } else if (mode === 'edit') {
            // Type and restrictions are set inside populateForm() which runs above
            document.getElementById('appointmentTypeSelector').style.display = 'block';
        } else {
            // View mode: show type selector but disable all
            document.getElementById('appointmentTypeSelector').style.display = 'block';
            document.getElementById('typeRoundTrip').disabled = true;
            document.getElementById('typeOneWay').disabled = true;
            document.getElementById('typeSupport').disabled = true;
        }
        this.applyTypeVisibility();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('appointmentModal'));

        // Ensure client dropdown state is correct after modal is shown
        document.getElementById('appointmentModal').addEventListener('shown.bs.modal', () => {
            const clientDropdown = document.getElementById('appointmentClientDropdown');
            const clientSearchFilter = document.getElementById('clientSearchFilter');
            if (mode === 'add' && this.appointmentType !== 'support') {
                if (clientDropdown) {
                    clientDropdown.disabled = false;
                    clientDropdown.style.backgroundColor = '';
                    clientDropdown.title = '';
                }
                if (clientSearchFilter) {
                    clientSearchFilter.style.display = '';
                    clientSearchFilter.focus(); // Focus the search filter for convenience
                }
            }
        }, { once: true }); // Use once: true to prevent duplicate listeners

        modal.show();
    }

    setupDriverStatusSync() {
        // Auto-update status when driver is selected/deselected
        const driverDropdown = document.getElementById('appointmentDriver');
        const statusDropdown = document.getElementById('appointmentStatus');

        if (!driverDropdown || !statusDropdown) return;

        // Preserve the current selected value before cloning
        const currentValue = driverDropdown.value;

        // Remove any existing listener to avoid duplicates
        const newDriverDropdown = driverDropdown.cloneNode(true);
        driverDropdown.parentNode.replaceChild(newDriverDropdown, driverDropdown);

        // Restore the selected value after replacing
        const restoredDropdown = document.getElementById('appointmentDriver');
        if (restoredDropdown && currentValue) {
            restoredDropdown.value = currentValue;
        }

        // Add the change event listener to the restored dropdown
        restoredDropdown.addEventListener('change', (e) => {
            const driverSelected = e.target.value;
            const currentStatus = statusDropdown.value;

            // If driver selected and status is pending, auto-set to assigned
            if (driverSelected && currentStatus === 'pending') {
                statusDropdown.value = 'assigned';
            }
            // If driver removed and status is assigned, revert to pending
            else if (!driverSelected && currentStatus === 'assigned') {
                statusDropdown.value = 'pending';
            }
        });
    }

    setupClinicTransitTimeSync() {
        // Auto-populate transit time when clinic changes
        const clinicDropdown = document.getElementById('appointmentClinic');
        if (!clinicDropdown) return;

        // Remove existing listener by cloning
        const newClinicDropdown = clinicDropdown.cloneNode(true);
        clinicDropdown.parentNode.replaceChild(newClinicDropdown, clinicDropdown);

        // Add change listener to auto-populate transit time
        document.getElementById('appointmentClinic').addEventListener('change', (e) => {
            const clinicName = e.target.value;
            if (clinicName) {
                this.selectClinic(clinicName);
                // selectClinic() will auto-populate transit time and trigger pickup time recalculation
            }
        }, { once: false }); // Explicit once: false for clarity
    }

    setupSchedulingNotesGeneration() {
        // Auto-generate scheduling notes when appointment time changes
        // Note: Clinic changes are handled by setupClinicTransitTimeSync() which updates transit time,
        // which then triggers this via the transit time listener
        const appointmentDateField = document.getElementById('appointmentDate');
        const clinicDropdown = document.getElementById('appointmentClinic');
        const transitTimeField = document.getElementById('transitTime');
        const schedulingNotesField = document.getElementById('schedulingNotes');

        if (!appointmentDateField || !clinicDropdown || !schedulingNotesField || !transitTimeField) return;

        const updateSchedulingNotes = () => {
            // Get current DOM elements (since they may have been cloned)
            const currentAppointmentDateField = document.getElementById('appointmentDate');
            const currentTransitTimeField = document.getElementById('transitTime');
            const currentClinicDropdown = document.getElementById('appointmentClinic');
            const currentSchedulingNotesField = document.getElementById('schedulingNotes');

            if (!currentAppointmentDateField || !currentTransitTimeField || !currentClinicDropdown || !currentSchedulingNotesField) {
                return;
            }

            // In edit mode, only regenerate if values have changed from original
            if (this.mode === 'edit') {
                const currentDateTime = currentAppointmentDateField.value;
                const currentTransitTime = currentTransitTimeField.value;

                // Check if appointment datetime or transit time changed
                const dateTimeChanged = currentDateTime !== this.originalAppointmentDateTime;
                const transitTimeChanged = currentTransitTime !== this.originalTransitTime;

                // If neither changed, keep original scheduling notes
                if (!dateTimeChanged && !transitTimeChanged) {
                    currentSchedulingNotesField.value = this.originalSchedulingNotes || '';
                    return;
                }
            }

            // Scheduling notes are now user-entered only, no auto-generation
            // This prevents redundant info like "2:30 PM appointment at Clinic"
            // since calendar already shows pickup time, appointment time, and location
        };
    }

    populateForm(appointment) {
        document.getElementById('appointmentId').value = appointment.id;
        const clientFullName = `${appointment.clientFirstName || ''} ${appointment.clientLastName || ''}`.trim();
        document.getElementById('appointmentClient').value = clientFullName;

        // Check both knumber and k_number field names for compatibility
        const aptKnumber = appointment.knumber || appointment.k_number;
        document.getElementById('appointmentClientId').value = aptKnumber;

        // Set the client dropdown to the correct client
        const clientDropdown = document.getElementById('appointmentClientDropdown');
        if (clientDropdown) {
            clientDropdown.value = aptKnumber;
            // If the client is not in the dropdown (e.g., inactive), add a temporary option
            if (clientDropdown.value !== aptKnumber) {
                const tempOption = document.createElement('option');
                tempOption.value = aptKnumber;
                tempOption.textContent = `${appointment.clientLastName || ''}, ${appointment.clientFirstName || ''} - ${aptKnumber}`;
                tempOption.dataset.fullname = clientFullName;
                clientDropdown.appendChild(tempOption);
                clientDropdown.value = aptKnumber;
            }
        }

        // Populate appointment type fields (default to round_trip for backward compat)
        this.appointmentType = appointment.appointment_type || 'round_trip';
        this.originalAppointmentType = this.appointmentType;

        // Set the correct radio button
        const typeRadio = document.getElementById(
            this.appointmentType === 'round_trip' ? 'typeRoundTrip' :
            this.appointmentType === 'one_way' ? 'typeOneWay' : 'typeSupport'
        );
        if (typeRadio) typeRadio.checked = true;

        // Populate one-way direction
        if (appointment.trip_direction) {
            document.getElementById('tripDirection').value = appointment.trip_direction;
        }

        // Populate support event name
        if (appointment.event_name) {
            document.getElementById('eventName').value = appointment.event_name;
        }

        // Apply type visibility and restrictions for edit mode
        this.applyTypeVisibility();
        this.applyTypeRestrictions();

        // For support events, show the event name as client display
        if (this.appointmentType === 'support') {
            document.getElementById('appointmentClient').value = appointment.event_name || 'Support Event';
        }

        // Store selected client for clinic travel times lookup
        this.selectedClient = this.clients.find(c => (c.knumber || c.k_number) === aptKnumber) || null;

        console.log(`[Populate Form] Looking for client ${aptKnumber}:`, {
            found: !!this.selectedClient,
            totalClients: this.clients.length,
            hasClinicTravelTimes: this.selectedClient?.clinic_travel_times ? true : false,
            clinic_travel_times: this.selectedClient?.clinic_travel_times
        });

        if (appointment.appointmentDateTime) {
            // Convert UTC time to Halifax time for datetime-local input
            const apptDate = new Date(appointment.appointmentDateTime);
            const formattedDateTime = this.formatDateTimeForInput(apptDate);
            document.getElementById('appointmentDate').value = formattedDateTime;
            // Store original for change detection
            this.originalAppointmentDateTime = formattedDateTime;
        }

        // Set transit time (in minutes)
        const transitTime = appointment.transitTime || 30;
        document.getElementById('transitTime').value = transitTime;
        // Store original for change detection
        this.originalTransitTime = String(transitTime);

        if (appointment.pickupTime) {
            // Convert UTC time to Halifax time for datetime-local input
            const pickupDate = new Date(appointment.pickupTime);
            document.getElementById('pickupTime').value = this.formatDateTimeForInput(pickupDate);
        }

        // Set clinic dropdown and hidden fields
        document.getElementById('appointmentClinic').value = appointment.location || '';
        document.getElementById('appointmentClinicId').value = appointment.clinic_id || '';
        document.getElementById('appointmentAddress').value = appointment.locationAddress || '';

        document.getElementById('appointmentLength').value = appointment.appointmentLength || 120;
        // Read from operation_status (new field) with fallback to old fields
        let statusValue = appointment.operation_status || appointment.appointmentstatus || appointment.status || 'pending';
        // Map old "confirmed" status to new "assigned" status
        if (statusValue === 'confirmed') {
            statusValue = 'assigned';
        }
        document.getElementById('appointmentStatus').value = statusValue;
        document.getElementById('appointmentDriver').value = appointment.driverAssigned ? String(appointment.driverAssigned) : '';
        document.getElementById('appointmentNotes').value = appointment.notes || '';
        document.getElementById('driverInstructions').value = appointment.driver_instructions || '';

        // Populate and store original scheduling notes
        const schedulingNotes = appointment.scheduling_notes || appointment.schedulingNotes || '';
        document.getElementById('schedulingNotes').value = schedulingNotes;
        this.originalSchedulingNotes = schedulingNotes;

        // Populate managing agent field (if in edit mode)
        if (this.mode === 'edit') {
            const userRole = getUserRole();
            const canReassignAgents = userRole === 'supervisor' || userRole === 'admin';

            if (canReassignAgents) {
                // Supervisor/Admin: Set dropdown value
                const managingAgentId = appointment.managed_by || appointment.managedBy;
                if (managingAgentId) {
                    document.getElementById('managingAgent').value = String(managingAgentId);
                    document.getElementById('managingAgentId').value = String(managingAgentId);
                }
            } else {
                // Booking agent: Set read-only text
                const managingAgentName = appointment.managed_by_name || appointment.managedByName || 'Not assigned';
                document.getElementById('managingAgentText').value = managingAgentName;
                document.getElementById('managingAgentId').value = appointment.managed_by || appointment.managedBy || '';
            }

            // Populate pickup address selector if addresses are available
            const pickupAddressDropdown = document.getElementById('appointmentPickupAddress');
            if (pickupAddressDropdown && this.selectedClient) {
                // First populate the dropdown with available addresses
                this.populatePickupAddressDropdown();

                // Determine current pickup address type from appointment data
                const currentPickupAddress = appointment.pickup_address;

                if (currentPickupAddress) {
                    const primaryAddress = this.formatAddress(
                        this.selectedClient.civicaddress,
                        this.selectedClient.city,
                        this.selectedClient.prov,
                        this.selectedClient.postalcode
                    );

                    const secondaryAddress = this.formatAddress(
                        this.selectedClient.secondary_civic_address,
                        this.selectedClient.secondary_city,
                        this.selectedClient.secondary_province,
                        this.selectedClient.secondary_postal_code
                    );

                    // Match current address to primary or secondary
                    if (currentPickupAddress === primaryAddress) {
                        pickupAddressDropdown.value = 'primary';
                    } else if (currentPickupAddress === secondaryAddress) {
                        pickupAddressDropdown.value = 'secondary';
                    } else {
                        // Fallback: auto-select based on travel times
                        this.autoSelectPickupAddress();
                    }
                } else {
                    // No pickup address in appointment, auto-select
                    this.autoSelectPickupAddress();
                }
            }
        }
    }

    // Helper function to format date for datetime-local input in Halifax timezone
    formatDateTimeForInput(date) {
        // Get the date/time string in Halifax timezone
        const halifaxString = date.toLocaleString('en-US', {
            timeZone: 'America/Halifax',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        // Parse the formatted string (MM/DD/YYYY, HH:mm)
        const parts = halifaxString.split(', ');
        const dateParts = parts[0].split('/'); // [MM, DD, YYYY]
        const timePart = parts[1]; // HH:mm

        // Format as YYYY-MM-DDTHH:mm for datetime-local input
        return `${dateParts[2]}-${dateParts[0]}-${dateParts[1]}T${timePart}`;
    }

    async saveAppointment() {
        const form = document.getElementById('appointmentForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Type-specific validation
        if (this.appointmentType === 'one_way') {
            const tripDirection = document.getElementById('tripDirection').value;
            if (!tripDirection) {
                document.getElementById('tripDirection').focus();
                alert('Please select a trip direction for one-way appointments.');
                return;
            }
        }
        if (this.appointmentType === 'support') {
            const eventName = document.getElementById('eventName').value.trim();
            if (!eventName) {
                document.getElementById('eventName').focus();
                alert('Please enter an event name for support events.');
                return;
            }
        }

        // Get save button for loading state (Phase 6)
        const saveBtn = document.getElementById('saveAppointmentBtn');
        const originalText = saveBtn.innerHTML;

        // Check if user can assign drivers
        const userRole = getUserRole();
        const permissions = getRolePermissions(userRole);
        const canAssign = permissions?.canAssignDrivers;

        // Convert datetime-local to ISO string
        const appointmentDateValue = document.getElementById('appointmentDate').value;
        const appointmentDateTime = appointmentDateValue ? new Date(appointmentDateValue).toISOString() : null;

        // Get driver assignment value (only in edit mode, never in add mode)
        const driverAssignedValue = (this.mode === 'edit' && canAssign) ? (document.getElementById('appointmentDriver').value || null) : null;
        const driverAssigned = driverAssignedValue ? parseInt(driverAssignedValue) : null;

        // Get current status
        let statusValue = document.getElementById('appointmentStatus').value;

        // Auto-set status to "assigned" if driver is selected and status is "pending"
        if (driverAssigned && statusValue === 'pending') {
            statusValue = 'assigned';
        }
        // If driver is removed and status is "assigned", revert to "pending"
        if (!driverAssigned && statusValue === 'assigned') {
            statusValue = 'pending';
        }

        // Get transit time (available in both add and edit modes now)
        const transitTimeValue = document.getElementById('transitTime').value;
        const transitTime = parseInt(transitTimeValue) || null;

        // Determine pickup address
        let pickupAddress;
        if (this.mode === 'edit') {
            // In edit mode: use selected address from dropdown
            const pickupAddressType = document.getElementById('appointmentPickupAddress')?.value;

            if (pickupAddressType && this.selectedClient) {
                if (pickupAddressType === 'primary') {
                    pickupAddress = this.formatAddress(
                        this.selectedClient.civicaddress,
                        this.selectedClient.city,
                        this.selectedClient.prov,
                        this.selectedClient.postalcode
                    );
                } else if (pickupAddressType === 'secondary') {
                    pickupAddress = this.formatAddress(
                        this.selectedClient.secondary_civic_address,
                        this.selectedClient.secondary_city,
                        this.selectedClient.secondary_province,
                        this.selectedClient.secondary_postal_code
                    );
                }
            }

            // Fallback to automatic selection if no address selected
            if (!pickupAddress) {
                pickupAddress = this.getPickupAddress();
            }
        } else {
            // In add mode: use automatic selection based on clinic travel times
            pickupAddress = this.getPickupAddress();
        }

        // Base appointment data
        const appointmentData = {
            knumber: document.getElementById('appointmentClientId').value,
            appointmentDateTime: appointmentDateTime,
            appointmentLength: parseInt(document.getElementById('appointmentLength').value) || 120,
            status: statusValue,
            notes: document.getElementById('appointmentNotes').value,
            driver_instructions: document.getElementById('driverInstructions').value.trim() || null,
            scheduling_notes: document.getElementById('schedulingNotes').value,
            transitTime: transitTime,
            pickup_address: pickupAddress, // Which client address is being used for pickup
            customRate: null,
            location: document.getElementById('appointmentClinic').value,
            clinic_id: parseInt(document.getElementById('appointmentClinicId').value) || null,
            locationAddress: document.getElementById('appointmentAddress').value,
            // Appointment type fields
            appointment_type: this.appointmentType,
            trip_direction: this.appointmentType === 'one_way' ? document.getElementById('tripDirection').value : null,
            event_name: this.appointmentType === 'support' ? document.getElementById('eventName').value.trim() : null
        };

        // Include driver assignment if user has permission
        if (canAssign && driverAssigned) {
            appointmentData.driver_assigned = driverAssigned;

            // Look up driver's first name from drivers array
            console.log('[Modal] Looking up driver:', {
                driverAssigned: driverAssigned,
                driverAssignedType: typeof driverAssigned,
                driversArrayExists: !!this.drivers,
                driversCount: this.drivers?.length,
                driverIds: this.drivers?.map(d => ({ id: d.id, type: typeof d.id, first_name: d.first_name }))
            });
            const driver = this.drivers ? this.drivers.find(d => d.id === driverAssigned) : null;
            console.log('[Modal] Found driver:', driver);
            appointmentData.driver_first_name = driver ? driver.first_name : null;
        } else if (canAssign) {
            appointmentData.driver_assigned = null;
            appointmentData.driver_first_name = null;
        }

        // Handle managing agent
        const currentUser = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');

        if (this.mode === 'add') {
            // Add mode: Auto-set to current user
            appointmentData.managed_by = currentUser.id || null;
            appointmentData.managed_by_name = currentUser.fullName || currentUser.full_name || currentUser.username || null;
        } else if (this.mode === 'edit') {
            // Edit mode: Include managing agent data
            appointmentData.id = document.getElementById('appointmentId').value;

            // Get pickup time (calculated from appointment time - transit time)
            const pickupTimeValue = document.getElementById('pickupTime').value;
            const pickupTime = pickupTimeValue ? new Date(pickupTimeValue).toISOString() : null;

            if (pickupTime) {
                appointmentData.pickupTime = pickupTime;
            }

            // Include managing agent (supervisors/admins can reassign, booking agents send their own ID)
            const canReassignAgents = userRole === 'supervisor' || userRole === 'admin';

            if (canReassignAgents) {
                // Get from dropdown
                const managingAgentId = document.getElementById('managingAgent').value;
                if (managingAgentId) {
                    appointmentData.managed_by = parseInt(managingAgentId);
                    // Get name from dropdown option
                    const selectedOption = document.getElementById('managingAgent').selectedOptions[0];
                    appointmentData.managed_by_name = selectedOption ? selectedOption.getAttribute('data-name') : null;
                } else {
                    // Send null if not selected
                    appointmentData.managed_by = null;
                    appointmentData.managed_by_name = null;
                }
            } else {
                // Booking agents: Send their current value (or null if not set)
                const managingAgentId = document.getElementById('managingAgentId').value;
                appointmentData.managed_by = managingAgentId ? parseInt(managingAgentId) : null;
                appointmentData.managed_by_name = document.getElementById('managingAgentText').value || null;
            }
        }

        try {
            // Show loading state on button (Phase 6)
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

            if (this.onSave) {
                await this.onSave(appointmentData, this.mode);
            }

            // Delay closing modal slightly so toast notification is visible (Phase 6)
            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
            }, 300);
        } catch (error) {
            console.error('Error saving appointment:', error);
            // Error toast is shown by parent callback, restore button
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }

    async deleteAppointment() {
        const id = document.getElementById('appointmentId').value;

        // Get delete button for loading state (Phase 6)
        const deleteBtn = document.getElementById('deleteAppointmentBtn');
        const originalText = deleteBtn.innerHTML;

        try {
            // Show loading state on button (Phase 6)
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Deleting...';

            if (this.onDelete) {
                await this.onDelete(id);
            }

            // Delay closing modal slightly so toast notification is visible (Phase 6)
            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
            }, 300);
        } catch (error) {
            console.error('Error deleting appointment:', error);
            // Error toast is shown by parent callback, restore button
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    }

    async hardDeleteAppointment() {
        const id = document.getElementById('appointmentId').value;

        // Close modal first
        bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();

        // Call the appointments page method (it handles confirmation and loading state)
        if (window.appointmentsPage) {
            await window.appointmentsPage.deleteAppointment(id, 'hard');
        }
    }

    setFormFieldsDisabled(disabled) {
        // Disable/enable all form input fields
        const fields = [
            'appointmentClientDropdown',
            'clientSearchFilter',
            'appointmentDate',
            'transitTime',
            'appointmentClinic',
            'appointmentLength',
            'appointmentStatus',
            'appointmentNotes',
            'driverInstructions',
            'appointmentCost',
            'appointmentDriver',
            'appointmentPickupAddress',
            'managingAgent',
            'tripDirection',
            'eventName'
        ];

        // Also disable type selector radios
        document.querySelectorAll('input[name="appointmentType"]').forEach(radio => {
            radio.disabled = disabled;
        });

        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.disabled = disabled;
                // Add gray background for disabled fields
                if (disabled) {
                    field.style.backgroundColor = '#e9ecef';
                } else {
                    field.style.backgroundColor = '';
                }
            }
        });

        // Always disable calculated/auto-generated fields
        const pickupTimeField = document.getElementById('pickupTime');
        if (pickupTimeField) {
            pickupTimeField.disabled = true;
            pickupTimeField.style.backgroundColor = '#e9ecef';
        }

        const schedulingNotesField = document.getElementById('schedulingNotes');
        if (schedulingNotesField) {
            schedulingNotesField.readOnly = true;
            schedulingNotesField.style.backgroundColor = '#e9ecef';
        }
    }

    async archiveAppointment() {
        const id = document.getElementById('appointmentId').value;

        // Close modal first
        bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();

        // Call the appointments page method (it handles confirmation and loading state)
        if (window.appointmentsPage) {
            await window.appointmentsPage.deleteAppointment(id, 'soft');
        }
    }

    async cancelAppointment() {
        const id = document.getElementById('appointmentId').value;

        // Close modal first
        bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();

        // Call the appointments page method (it shows cancel modal with reason)
        if (window.appointmentsPage) {
            window.appointmentsPage.showCancelModal(id);
        }
    }

    async restoreAppointment() {
        const id = document.getElementById('appointmentId').value;

        const restoreBtn = document.getElementById('restoreAppointmentBtn');
        if (restoreBtn) {
            restoreBtn.disabled = true;
            restoreBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Restoring...';
        }

        try {
            const apiBaseUrl = 'https://webhook-processor-production-3bb8.up.railway.app/webhook';
            const token = sessionStorage.getItem('rrts_access_token');

            const response = await fetch(`${apiBaseUrl}/unarchive-appointment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id: id })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to restore appointment');
            }

            // Log audit trail
            const currentUser = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');
            if (typeof logSecurityEvent === 'function') {
                await logSecurityEvent('appointment_unarchived', {
                    resource_type: 'appointment',
                    resource_id: id,
                    restored_by_user_id: currentUser.id,
                    success: true
                });
            }

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();

            // Show success message with toast
            if (window.appointmentsPage && window.appointmentsPage.showToast) {
                window.appointmentsPage.showToast('Appointment restored successfully', 'success');
            }

            // Refresh appointments list if the method exists
            if (window.appointmentsPage && window.appointmentsPage.loadInitialData) {
                await window.appointmentsPage.loadInitialData();
            } else if (window.appointmentsPage && window.appointmentsPage.loadAppointments) {
                await window.appointmentsPage.loadAppointments();
            } else if (typeof loadInitialData === 'function') {
                await loadInitialData();
            } else if (typeof loadAppointments === 'function') {
                await loadAppointments();
            } else {
                // Fallback: reload page
                location.reload();
            }

        } catch (error) {
            console.error('Error restoring appointment:', error);

            // Log failed restore attempt
            const currentUser = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');
            if (typeof logSecurityEvent === 'function') {
                await logSecurityEvent('appointment_unarchived', {
                    resource_type: 'appointment',
                    resource_id: id,
                    restored_by_user_id: currentUser.id,
                    success: false,
                    error_message: error.message
                });
            }

            if (window.appointmentsPage && window.appointmentsPage.showToast) {
                window.appointmentsPage.showToast(error.message || 'Failed to restore appointment', 'error');
            }

            // Re-enable button on error
            if (restoreBtn) {
                restoreBtn.disabled = false;
                restoreBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Restore';
            }
        }
    }

    async reactivateAppointment() {
        const id = document.getElementById('appointmentId').value;

        const reactivateBtn = document.getElementById('reactivateAppointmentBtn');
        if (reactivateBtn) {
            reactivateBtn.disabled = true;
            reactivateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Reactivating...';
        }

        try {
            const apiBaseUrl = 'https://webhook-processor-production-3bb8.up.railway.app/webhook';
            const token = sessionStorage.getItem('rrts_access_token');

            // Build complete appointment data (same structure as normal update)
            const appointmentDateValue = document.getElementById('appointmentDate').value;
            const appointmentDateTime = appointmentDateValue ? new Date(appointmentDateValue).toISOString() : null;

            const transitTimeValue = document.getElementById('transitTime').value;
            const transitTime = parseInt(transitTimeValue) || null;

            const pickupAddress = this.getPickupAddress();

            const pickupTimeValue = document.getElementById('pickupTime').value;
            const pickupTime = pickupTimeValue ? new Date(pickupTimeValue).toISOString() : null;

            // Build appointment data with all required fields
            const appointmentData = {
                id: id,
                knumber: document.getElementById('appointmentClientId').value,
                appointmentDateTime: appointmentDateTime,
                appointmentLength: parseInt(document.getElementById('appointmentLength').value) || 120,
                status: 'pending', // Set to pending when reactivating
                notes: document.getElementById('appointmentNotes').value,
                driver_instructions: document.getElementById('driverInstructions').value.trim() || null,
                scheduling_notes: document.getElementById('schedulingNotes').value,
                transitTime: transitTime,
                pickup_address: pickupAddress,
                customRate: null,
                location: document.getElementById('appointmentClinic').value,
                clinic_id: parseInt(document.getElementById('appointmentClinicId').value) || null,
                locationAddress: document.getElementById('appointmentAddress').value,
                driver_assigned: null, // Remove driver assignment
                driver_first_name: null,
                pickupTime: pickupTime,
                managed_by: null,
                managed_by_name: null,
                // Preserve appointment type fields
                appointment_type: this.appointmentType,
                trip_direction: this.appointmentType === 'one_way' ? document.getElementById('tripDirection').value : null,
                event_name: this.appointmentType === 'support' ? document.getElementById('eventName').value.trim() : null
            };

            // Use update appointment endpoint with complete data
            const response = await fetch(`${apiBaseUrl}/update-appointment-complete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(appointmentData)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to reactivate appointment');
            }

            // Log audit trail
            const currentUser = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');
            if (typeof logSecurityEvent === 'function') {
                await logSecurityEvent('appointment_reactivated', {
                    resource_type: 'appointment',
                    resource_id: id,
                    reactivated_by_user_id: currentUser.id,
                    success: true
                });
            }

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();

            // Show success message with toast
            if (window.appointmentsPage && window.appointmentsPage.showToast) {
                window.appointmentsPage.showToast('Appointment reactivated successfully', 'success');
            }

            // Refresh appointments list
            if (window.appointmentsPage && window.appointmentsPage.loadInitialData) {
                await window.appointmentsPage.loadInitialData();
            } else if (window.appointmentsPage && window.appointmentsPage.loadAppointments) {
                await window.appointmentsPage.loadAppointments();
            } else if (typeof loadInitialData === 'function') {
                await loadInitialData();
            } else if (typeof loadAppointments === 'function') {
                await loadAppointments();
            } else {
                // Fallback: reload page
                location.reload();
            }

        } catch (error) {
            console.error('Error reactivating appointment:', error);

            // Log failed reactivate attempt
            const currentUser = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');
            if (typeof logSecurityEvent === 'function') {
                await logSecurityEvent('appointment_reactivated', {
                    resource_type: 'appointment',
                    resource_id: id,
                    reactivated_by_user_id: currentUser.id,
                    success: false,
                    error_message: error.message
                });
            }

            if (window.appointmentsPage && window.appointmentsPage.showToast) {
                window.appointmentsPage.showToast(error.message || 'Failed to reactivate appointment', 'error');
            }

            // Re-enable button on error
            if (reactivateBtn) {
                reactivateBtn.disabled = false;
                reactivateBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reactivate';
            }
        }
    }
}

// Create global instance
let appointmentModalInstance = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    appointmentModalInstance = new AppointmentModal({
        onSave: async (appointmentData, mode) => {
            // This will be overridden by each page
            console.log('Saving appointment:', appointmentData, mode);
        },
        onDelete: async (id) => {
            // This will be overridden by each page
            console.log('Deleting appointment:', id);
        }
    });
});
