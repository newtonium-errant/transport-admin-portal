/**
 * Reusable Appointment Modal Component
 * Can be used on any page to add/edit/view appointments
 */

class AppointmentModal {
    constructor(options = {}) {
        this.onSave = options.onSave || null;
        this.onDelete = options.onDelete || null;
        this.mode = 'add'; // 'add', 'edit', or 'view'
        this.currentAppointment = null;
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
                            <form id="appointmentForm">
                                <!-- Client Selection -->
                                <div class="mb-3">
                                    <label for="appointmentClient" class="form-label">Client <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" id="appointmentClient" 
                                           placeholder="Search by name or K number..." required>
                                    <input type="hidden" id="appointmentClientId">
                                    <div id="clientSuggestions" class="list-group mt-2" style="display: none;"></div>
                                </div>

                                <!-- Appointment Details -->
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label for="appointmentDate" class="form-label">Appointment Date & Time <span class="text-danger">*</span></label>
                                        <input type="datetime-local" class="form-control" id="appointmentDate" required>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label for="pickupTime" class="form-label">Pickup Time <span class="text-danger">*</span></label>
                                        <input type="datetime-local" class="form-control" id="pickupTime" required>
                                    </div>
                                </div>

                                <!-- Location -->
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label for="appointmentLocation" class="form-label">Location Name <span class="text-danger">*</span></label>
                                        <input type="text" class="form-control" id="appointmentLocation" required>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label for="appointmentAddress" class="form-label">Location Address</label>
                                        <input type="text" class="form-control" id="appointmentAddress">
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
                                            <option value="confirmed">Confirmed</option>
                                            <option value="cancelled">Cancelled</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4 mb-3">
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

                                <!-- Notes -->
                                <div class="mb-3">
                                    <label for="appointmentNotes" class="form-label">Notes</label>
                                    <textarea class="form-control" id="appointmentNotes" rows="3"></textarea>
                                </div>

                                <!-- Appointment ID (hidden, for edit mode) -->
                                <input type="hidden" id="appointmentId">
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-danger" id="deleteAppointmentBtn" style="display: none;" onclick="appointmentModalInstance.deleteAppointment()">Delete</button>
                            <button type="button" class="btn btn-primary" id="saveAppointmentBtn" onclick="appointmentModalInstance.saveAppointment()">Save Appointment</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page if it doesn't exist
        if (!document.getElementById('appointmentModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        // Load drivers and clients
        this.loadDrivers();
        this.loadClients();

        // Setup client search
        this.setupClientSearch();

        // Apply role-based restrictions
        this.applyRoleRestrictions();
    }

    async loadDrivers() {
        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/driver-basic-info');
            if (response.ok) {
                const data = await response.json();
                const drivers = Array.isArray(data) && data.length > 0 ? data[0].drivers : (data.drivers || []);
                
                const select = document.getElementById('appointmentDriver');
                select.innerHTML = '<option value="">Not Assigned</option>';
                drivers.forEach(driver => {
                    const option = document.createElement('option');
                    option.value = driver.id;
                    option.textContent = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading drivers:', error);
        }
    }

    async loadClients() {
        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/getAllClients');
            if (response.ok) {
                const data = await response.json();
                const clientData = Array.isArray(data) && data.length > 0 ? data[0] : data;
                this.clients = clientData.clients || [];
            }
        } catch (error) {
            console.error('Error loading clients:', error);
            this.clients = [];
        }
    }

    setupClientSearch() {
        const input = document.getElementById('appointmentClient');
        const suggestions = document.getElementById('clientSuggestions');

        input.addEventListener('input', () => {
            const searchTerm = input.value.toLowerCase();
            if (searchTerm.length < 2) {
                suggestions.style.display = 'none';
                return;
            }

            const matches = this.clients.filter(client => 
                (client.firstname && client.firstname.toLowerCase().includes(searchTerm)) ||
                (client.lastname && client.lastname.toLowerCase().includes(searchTerm)) ||
                (client.knumber && client.knumber.toLowerCase().includes(searchTerm))
            ).slice(0, 5);

            if (matches.length > 0) {
                suggestions.innerHTML = matches.map(client => 
                    `<a href="#" class="list-group-item list-group-item-action" 
                        onclick="appointmentModalInstance.selectClient('${client.knumber}', '${client.firstname} ${client.lastname}'); return false;">
                        <strong>${client.knumber}</strong> - ${client.firstname} ${client.lastname}
                    </a>`
                ).join('');
                suggestions.style.display = 'block';
            } else {
                suggestions.style.display = 'none';
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !suggestions.contains(e.target)) {
                suggestions.style.display = 'none';
            }
        });
    }

    selectClient(knumber, fullName) {
        document.getElementById('appointmentClient').value = fullName;
        document.getElementById('appointmentClientId').value = knumber;
        document.getElementById('clientSuggestions').style.display = 'none';
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
                    // Add visual indicator that field is read-only
                    el.classList.add('bg-light');
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
    }

    open(mode = 'add', appointment = null) {
        this.mode = mode;
        this.currentAppointment = appointment;

        // Update modal title and buttons
        const title = document.getElementById('appointmentModalTitle');
        const deleteBtn = document.getElementById('deleteAppointmentBtn');
        const saveBtn = document.getElementById('saveAppointmentBtn');

        if (mode === 'view') {
            title.textContent = 'View Appointment';
            deleteBtn.style.display = 'none';
            saveBtn.textContent = 'Close';
            saveBtn.onclick = () => bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
        } else if (mode === 'edit') {
            title.textContent = 'Edit Appointment';
            const canDelete = getRolePermissions(getUserRole())?.canDeleteAppointments;
            deleteBtn.style.display = canDelete ? 'inline-block' : 'none';
            saveBtn.textContent = 'Update Appointment';
            saveBtn.onclick = () => this.saveAppointment();
        } else {
            title.textContent = 'Add Appointment';
            deleteBtn.style.display = 'none';
            saveBtn.textContent = 'Save Appointment';
            saveBtn.onclick = () => this.saveAppointment();
        }

        // Populate form if editing
        if (mode === 'edit' && appointment) {
            this.populateForm(appointment);
        } else {
            document.getElementById('appointmentForm').reset();
        }

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('appointmentModal'));
        modal.show();
    }

    populateForm(appointment) {
        document.getElementById('appointmentId').value = appointment.id;
        document.getElementById('appointmentClient').value = `${appointment.clientFirstName || ''} ${appointment.clientLastName || ''}`.trim();
        document.getElementById('appointmentClientId').value = appointment.knumber;
        
        if (appointment.appointmentDateTime) {
            const apptDate = new Date(appointment.appointmentDateTime);
            document.getElementById('appointmentDate').value = apptDate.toISOString().slice(0, 16);
        }
        
        if (appointment.pickupTime) {
            const pickupDate = new Date(appointment.pickupTime);
            document.getElementById('pickupTime').value = pickupDate.toISOString().slice(0, 16);
        }
        
        document.getElementById('appointmentLocation').value = appointment.location || '';
        document.getElementById('appointmentAddress').value = appointment.locationAddress || '';
        document.getElementById('appointmentLength').value = appointment.appointmentLength || 120;
        document.getElementById('appointmentStatus').value = appointment.status || 'pending';
        document.getElementById('appointmentDriver').value = appointment.driverAssigned || '';
        document.getElementById('appointmentNotes').value = appointment.notes || '';
    }

    async saveAppointment() {
        const form = document.getElementById('appointmentForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Check if user can assign drivers
        const userRole = getUserRole();
        const permissions = getRolePermissions(userRole);
        const canAssign = permissions?.canAssignDrivers;

        const appointmentData = {
            kNumber: document.getElementById('appointmentClientId').value,
            appointmentDateTime: document.getElementById('appointmentDate').value,
            pickupTime: document.getElementById('pickupTime').value,
            locationName: document.getElementById('appointmentLocation').value,
            locationAddress: document.getElementById('appointmentAddress').value,
            appointmentLength: parseInt(document.getElementById('appointmentLength').value) || 120,
            status: document.getElementById('appointmentStatus').value,
            // Only include driver assignment if user has permission
            ...(canAssign && { driverAssigned: document.getElementById('appointmentDriver').value || null }),
            notes: document.getElementById('appointmentNotes').value
        };

        if (this.mode === 'edit') {
            appointmentData.id = document.getElementById('appointmentId').value;
        }

        try {
            if (this.onSave) {
                await this.onSave(appointmentData, this.mode);
            }
            
            bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
        } catch (error) {
            console.error('Error saving appointment:', error);
            alert('Failed to save appointment. Please try again.');
        }
    }

    async deleteAppointment() {
        const id = document.getElementById('appointmentId').value;
        
        if (!confirm('Are you sure you want to delete this appointment?')) {
            return;
        }

        try {
            if (this.onDelete) {
                await this.onDelete(id);
            }
            
            bootstrap.Modal.getInstance(document.getElementById('appointmentModal')).hide();
        } catch (error) {
            console.error('Error deleting appointment:', error);
            alert('Failed to delete appointment. Please try again.');
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
