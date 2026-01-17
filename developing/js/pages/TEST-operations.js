/**
 * TEST-operations.js - Operations Page Controller
 * Version: 1.0.0
 *
 * 2-week calendar view for driver assignment with:
 * - Overlap detection and side-by-side display
 * - Click-to-assign popover with clinic-based driver grouping
 * - Draft auto-save with "last edited by" tracking
 * - Submit workflow for finalizing assignments
 *
 * Uses TEST- API endpoints for developing/testing.
 */

// API Base URL for TEST endpoints
const TEST_API_BASE = 'https://webhook-processor-production-3bb8.up.railway.app/webhook';

/**
 * Debounce utility function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * OperationsPage Class
 * Main controller for the Operations 2-week calendar view
 */
class OperationsPage {
    constructor() {
        // Data stores
        this.appointments = [];
        this.drivers = [];
        this.clinics = [];
        this.driverClinicAssignments = [];
        this.draftAssignments = new Map(); // appointmentId -> driverId

        // UI state
        this.currentWeekStart = this.getWeekStart(new Date());
        this.selectedClinicFilter = '';
        this.activePopover = null;
        this.currentAppointmentId = null;

        // Debounced save function
        this.debouncedSaveDraft = debounce(this.saveDraft.bind(this), 500);

        // Hour range for display (7am to 11pm = 16 hours)
        this.startHour = 7;
        this.endHour = 23;
        this.hourHeight = 60; // pixels per hour
    }

    /**
     * Initialize the Operations page
     */
    async init() {
        console.log('Initializing Operations page...');

        // Generate time slots for both week grids
        this.generateTimeSlots('timeSlots1');
        this.generateTimeSlots('timeSlots2');

        // Set up event listeners
        this.setupEventListeners();

        // Load initial data
        await this.loadOperationsData();
    }

    /**
     * Get Monday of the week for a given date
     */
    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
        const monday = new Date(d.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    /**
     * Format date as YYYY-MM-DD
     */
    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Format date for display (e.g., "Jan 13")
     */
    formatDisplayDate(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /**
     * Generate time slots for the time column
     */
    generateTimeSlots(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        for (let hour = this.startHour; hour <= this.endHour; hour++) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            const displayHour = hour > 12 ? hour - 12 : hour;
            const ampm = hour >= 12 ? 'PM' : 'AM';
            slot.textContent = `${displayHour}${ampm}`;
            container.appendChild(slot);
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Clinic filter
        const clinicFilter = document.getElementById('clinicFilter');
        if (clinicFilter) {
            clinicFilter.addEventListener('change', (e) => {
                this.selectedClinicFilter = e.target.value;
                this.render();
            });
        }

        // Close popover on outside click
        document.addEventListener('click', (e) => {
            const popover = document.getElementById('driverPopover');
            if (popover && popover.classList.contains('show')) {
                if (!popover.contains(e.target) && !e.target.closest('.appointment-block-ops')) {
                    this.hideDriverPopover();
                }
            }
        });

        // Close popover on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideDriverPopover();
            }
        });
    }

    /**
     * Load operations data from API
     */
    async loadOperationsData() {
        console.log('Loading operations data...');
        this.showSkeleton(true);

        try {
            const token = sessionStorage.getItem('rrts_access_token');
            if (!token) {
                showToast('Authentication required', 'warning');
                window.location.href = '../index.html';
                return;
            }

            const response = await fetch(`${TEST_API_BASE}/TEST-get-operations-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    weekStart: this.formatDate(this.currentWeekStart)
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Failed to load operations data');
            }

            // Store data
            this.appointments = result.data.appointments || [];
            this.drivers = result.data.drivers || [];
            this.clinics = result.data.clinics || [];
            this.driverClinicAssignments = result.data.driverClinicAssignments || [];

            // Load draft assignments into Map
            this.draftAssignments.clear();
            (result.data.draftAssignments || []).forEach(draft => {
                this.draftAssignments.set(draft.appointment_id, draft.draft_driver_id);
            });

            // Update last edited display
            if (result.data.metadata?.lastDraftUpdate) {
                const lastEdit = result.data.metadata.lastDraftUpdate;
                const editedAt = new Date(lastEdit.editedAt).toLocaleString();
                document.getElementById('lastEditedDisplay').textContent =
                    `Last edited by ${lastEdit.editedBy} at ${editedAt}`;
            } else {
                document.getElementById('lastEditedDisplay').textContent = '';
            }

            // Populate clinic filter
            this.populateClinicFilter();

            // Render the calendar
            this.render();

            console.log(`Loaded ${this.appointments.length} appointments, ${this.drivers.length} drivers`);

        } catch (error) {
            console.error('Error loading operations data:', error);
            showToast(`Error: ${error.message}`, 'danger');
        } finally {
            this.showSkeleton(false);
        }
    }

    /**
     * Populate clinic filter dropdown
     */
    populateClinicFilter() {
        const select = document.getElementById('clinicFilter');
        if (!select) return;

        // Keep current selection
        const currentValue = select.value;

        select.innerHTML = '<option value="">All Clinics</option>';
        this.clinics.forEach(clinic => {
            const option = document.createElement('option');
            option.value = clinic.id;
            option.textContent = clinic.name;
            select.appendChild(option);
        });

        // Restore selection
        select.value = currentValue;
    }

    /**
     * Show/hide skeleton loader
     */
    showSkeleton(show) {
        const skeleton = document.getElementById('skeletonLoader');
        const week1 = document.getElementById('week1Container');
        const week2 = document.getElementById('week2Container');

        if (skeleton) skeleton.style.display = show ? 'grid' : 'none';
        if (week1) week1.style.display = show ? 'none' : 'block';
        if (week2) week2.style.display = show ? 'none' : 'block';
    }

    /**
     * Main render function
     */
    render() {
        // Update week display
        this.updateWeekDisplay();

        // Filter appointments by clinic if filter is set
        let filteredAppointments = this.appointments;
        if (this.selectedClinicFilter) {
            filteredAppointments = this.appointments.filter(
                apt => apt.clinic_id == this.selectedClinicFilter
            );
        }

        // Render both week grids
        this.renderWeekGrid(this.currentWeekStart, 'week1Grid', 'week1Label', filteredAppointments);

        const week2Start = new Date(this.currentWeekStart);
        week2Start.setDate(week2Start.getDate() + 7);
        this.renderWeekGrid(week2Start, 'week2Grid', 'week2Label', filteredAppointments);

        // Update stats
        this.updateStats(filteredAppointments);
    }

    /**
     * Update the week range display
     */
    updateWeekDisplay() {
        const week1End = new Date(this.currentWeekStart);
        week1End.setDate(week1End.getDate() + 4); // Friday of week 1

        const week2Start = new Date(this.currentWeekStart);
        week2Start.setDate(week2Start.getDate() + 7);
        const week2End = new Date(week2Start);
        week2End.setDate(week2End.getDate() + 4); // Friday of week 2

        const displayText = `${this.formatDisplayDate(this.currentWeekStart)} - ${this.formatDisplayDate(week2End)}, ${week2End.getFullYear()}`;
        document.getElementById('weekRangeDisplay').textContent = displayText;
    }

    /**
     * Render a single week grid
     */
    renderWeekGrid(weekStart, gridId, labelId, appointments) {
        const grid = document.getElementById(gridId);
        const label = document.getElementById(labelId);
        if (!grid) return;

        // Update week label
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 4);
        label.textContent = `Week of ${this.formatDisplayDate(weekStart)} - ${this.formatDisplayDate(weekEnd)}`;

        // Clear existing day columns (keep time column)
        const existingDayColumns = grid.querySelectorAll('.day-header, .day-column-ops');
        existingDayColumns.forEach(el => el.remove());

        // Create day columns for Mon-Fri
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        for (let i = 0; i < 5; i++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(dayDate.getDate() + i);
            const dateStr = this.formatDate(dayDate);

            // Day header
            const header = document.createElement('div');
            header.className = 'day-header';
            header.innerHTML = `
                <div class="day-name">${dayNames[i]}</div>
                <div class="day-date">${this.formatDisplayDate(dayDate)}</div>
            `;
            grid.appendChild(header);
        }

        // Create day columns with appointments
        for (let i = 0; i < 5; i++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(dayDate.getDate() + i);
            const dateStr = this.formatDate(dayDate);

            // Day column
            const column = document.createElement('div');
            column.className = 'day-column-ops';
            column.dataset.date = dateStr;

            // Add hour grid lines
            for (let hour = this.startHour; hour <= this.endHour; hour++) {
                const line = document.createElement('div');
                line.className = 'hour-line';
                line.style.top = `${(hour - this.startHour) * this.hourHeight}px`;
                column.appendChild(line);
            }

            // Get appointments for this day
            const dayAppointments = appointments.filter(apt => {
                const aptDate = apt.appointmentDate || apt.appt_date;
                return aptDate === dateStr;
            });

            // Calculate overlaps
            const overlapInfo = this.calculateOverlaps(dayAppointments);

            // Render appointment blocks
            dayAppointments.forEach(apt => {
                const block = this.renderAppointmentBlock(apt, overlapInfo.get(apt.id));
                column.appendChild(block);
            });

            grid.appendChild(column);
        }
    }

    /**
     * Calculate overlapping appointments
     * Returns Map<appointmentId, {index, total}>
     */
    calculateOverlaps(appointments) {
        const overlapInfo = new Map();

        // Sort by pickup time
        const sorted = [...appointments].sort((a, b) => {
            const aTime = this.getEffectiveStartTime(a);
            const bTime = this.getEffectiveStartTime(b);
            return aTime - bTime;
        });

        // Find overlap groups
        for (let i = 0; i < sorted.length; i++) {
            const apt = sorted[i];
            const aptRange = this.getEffectiveTimeRange(apt);

            // Find all appointments that overlap with this one
            const overlapping = sorted.filter((other, j) => {
                if (other.id === apt.id) return true;
                const otherRange = this.getEffectiveTimeRange(other);
                return aptRange.start < otherRange.end && aptRange.end > otherRange.start;
            });

            if (overlapping.length > 1) {
                // Sort overlapping group and find index
                overlapping.sort((a, b) => this.getEffectiveStartTime(a) - this.getEffectiveStartTime(b));
                const index = overlapping.findIndex(o => o.id === apt.id);
                overlapInfo.set(apt.id, { index: index + 1, total: overlapping.length });
            } else {
                overlapInfo.set(apt.id, { index: 1, total: 1 });
            }
        }

        return overlapInfo;
    }

    /**
     * Get effective start time (pickup time = appointment time - transit time)
     */
    getEffectiveStartTime(appointment) {
        const aptTime = new Date(appointment.appointmentDateTime || `${appointment.appointmentDate}T${appointment.appointmentTime}`);
        const transit = appointment.transitTime || 30;
        return aptTime.getTime() - (transit * 60000);
    }

    /**
     * Get effective time range for overlap detection
     */
    getEffectiveTimeRange(appointment) {
        const aptTime = new Date(appointment.appointmentDateTime || `${appointment.appointmentDate}T${appointment.appointmentTime}`);
        const transit = appointment.transitTime || 30;
        const length = appointment.appointmentLength || 120;

        return {
            start: aptTime.getTime() - (transit * 60000), // Pickup time
            end: aptTime.getTime() + ((length + transit) * 60000) // Return time
        };
    }

    /**
     * Render a single appointment block
     */
    renderAppointmentBlock(appointment, overlapInfo) {
        const block = document.createElement('div');
        block.className = 'appointment-block-ops';
        block.dataset.appointmentId = appointment.id;

        // Calculate position
        const aptTime = new Date(appointment.appointmentDateTime || `${appointment.appointmentDate}T${appointment.appointmentTime}`);
        const transit = appointment.transitTime || 30;
        const length = appointment.appointmentLength || 120;

        // Start from pickup time
        const pickupHour = aptTime.getHours() - (transit / 60);
        const pickupMinutes = aptTime.getMinutes();
        const top = ((pickupHour - this.startHour) * this.hourHeight) + ((pickupMinutes / 60) * this.hourHeight);

        // Height = transit + appointment + transit back
        const totalDuration = transit + length + transit;
        const height = (totalDuration / 60) * this.hourHeight;

        block.style.top = `${Math.max(0, top)}px`;
        block.style.height = `${height}px`;

        // Handle overlaps
        if (overlapInfo && overlapInfo.total > 1) {
            block.classList.add(`overlap-${overlapInfo.index}-of-${Math.min(overlapInfo.total, 3)}`);
        }

        // Determine status and color
        const draftDriverId = this.draftAssignments.get(appointment.id);
        const assignedDriverId = draftDriverId !== undefined ? draftDriverId : appointment.driver_assigned;

        let statusClass = 'status-pending';
        if (appointment.status === 'cancelled') {
            statusClass = 'status-cancelled';
        } else if (assignedDriverId) {
            statusClass = 'status-assigned';
        }
        block.classList.add(statusClass);

        // Get driver name
        let driverDisplay = '';
        if (assignedDriverId) {
            const driver = this.drivers.find(d => d.id === assignedDriverId);
            driverDisplay = driver ? driver.name : 'Driver #' + assignedDriverId;
        }

        // Format time
        const timeStr = aptTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        // Block content
        block.innerHTML = `
            <div class="apt-time">${timeStr}</div>
            <div class="apt-client">${appointment.knumber}</div>
            <div class="apt-location">${appointment.location || ''}</div>
            ${driverDisplay ? `<div class="apt-driver">${driverDisplay}</div>` : ''}
        `;

        // Click handler for popover
        block.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDriverPopover(appointment.id, block);
        });

        return block;
    }

    /**
     * Show driver assignment popover
     */
    showDriverPopover(appointmentId, anchorElement) {
        const appointment = this.appointments.find(a => a.id === appointmentId);
        if (!appointment) return;

        this.currentAppointmentId = appointmentId;

        // Get popover elements
        const popover = document.getElementById('driverPopover');
        const clientEl = document.getElementById('popoverClient');
        const timeEl = document.getElementById('popoverTime');
        const clinicEl = document.getElementById('popoverClinic');
        const selectEl = document.getElementById('popoverDriverSelect');
        const currentEl = document.getElementById('popoverCurrentDriver');

        // Populate info
        clientEl.textContent = appointment.knumber;
        const aptTime = new Date(appointment.appointmentDateTime || `${appointment.appointmentDate}T${appointment.appointmentTime}`);
        const transit = appointment.transitTime || 30;
        const length = appointment.appointmentLength || 120;
        const endTime = new Date(aptTime.getTime() + (length * 60000));
        timeEl.textContent = `${aptTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        clinicEl.textContent = appointment.location || 'N/A';

        // Build driver dropdown with clinic grouping
        this.buildDriverDropdown(selectEl, appointment.clinic_id);

        // Set current value
        const draftDriverId = this.draftAssignments.get(appointmentId);
        const currentDriverId = draftDriverId !== undefined ? draftDriverId : appointment.driver_assigned;
        selectEl.value = currentDriverId || '';

        // Update current driver display
        if (currentDriverId) {
            const driver = this.drivers.find(d => d.id === currentDriverId);
            currentEl.textContent = `Current: ${driver ? driver.name : 'Driver #' + currentDriverId}`;
        } else {
            currentEl.textContent = 'Current: Unassigned';
        }

        // Position popover
        this.positionPopover(popover, anchorElement);

        // Show popover
        popover.classList.add('show');
    }

    /**
     * Build driver dropdown with clinic-based grouping
     */
    buildDriverDropdown(selectEl, clinicId) {
        // Get drivers assigned to this clinic
        const clinicDriverIds = this.driverClinicAssignments
            .filter(dca => dca.clinic_id === clinicId)
            .map(dca => dca.driver_id);

        const clinicDrivers = this.drivers.filter(d => clinicDriverIds.includes(d.id));
        const otherDrivers = this.drivers.filter(d => !clinicDriverIds.includes(d.id));

        selectEl.innerHTML = '<option value="">-- Select Driver --</option>';

        // Clinic drivers group
        if (clinicDrivers.length > 0) {
            const clinicGroup = document.createElement('optgroup');
            clinicGroup.label = 'Assigned to This Clinic';
            clinicDrivers.forEach(d => {
                const option = document.createElement('option');
                option.value = d.id;
                option.textContent = d.name;
                clinicGroup.appendChild(option);
            });
            selectEl.appendChild(clinicGroup);
        }

        // Other drivers group
        if (otherDrivers.length > 0) {
            const otherGroup = document.createElement('optgroup');
            otherGroup.label = 'Other Drivers';
            otherDrivers.forEach(d => {
                const option = document.createElement('option');
                option.value = d.id;
                option.textContent = d.name;
                otherGroup.appendChild(option);
            });
            selectEl.appendChild(otherGroup);
        }
    }

    /**
     * Position popover near anchor element
     */
    positionPopover(popover, anchor) {
        const anchorRect = anchor.getBoundingClientRect();
        const popoverWidth = 350;
        const popoverHeight = 250;

        let left = anchorRect.right + 10;
        let top = anchorRect.top;

        // Adjust if going off screen
        if (left + popoverWidth > window.innerWidth) {
            left = anchorRect.left - popoverWidth - 10;
        }
        if (top + popoverHeight > window.innerHeight) {
            top = window.innerHeight - popoverHeight - 20;
        }
        if (top < 120) { // Below header
            top = 120;
        }

        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.style.position = 'fixed';
    }

    /**
     * Hide driver popover
     */
    hideDriverPopover() {
        const popover = document.getElementById('driverPopover');
        if (popover) {
            popover.classList.remove('show');
        }
        this.currentAppointmentId = null;
    }

    /**
     * Handle driver selection change
     */
    onDriverSelected() {
        const selectEl = document.getElementById('popoverDriverSelect');
        const driverId = selectEl.value ? parseInt(selectEl.value) : null;

        if (this.currentAppointmentId) {
            // Update local draft immediately
            this.draftAssignments.set(this.currentAppointmentId, driverId);

            // Update the appointment block visually
            this.updateAppointmentBlockVisual(this.currentAppointmentId, driverId);

            // Update current driver display
            const currentEl = document.getElementById('popoverCurrentDriver');
            if (driverId) {
                const driver = this.drivers.find(d => d.id === driverId);
                currentEl.textContent = `Current: ${driver ? driver.name : 'Driver #' + driverId}`;
            } else {
                currentEl.textContent = 'Current: Unassigned';
            }

            // Debounced save to server
            this.debouncedSaveDraft(this.currentAppointmentId, driverId);

            // Update stats
            this.updateStats(this.appointments);
        }
    }

    /**
     * Update appointment block visual after driver change
     */
    updateAppointmentBlockVisual(appointmentId, driverId) {
        const block = document.querySelector(`[data-appointment-id="${appointmentId}"]`);
        if (!block) return;

        // Update status class
        block.classList.remove('status-assigned', 'status-pending', 'status-cancelled');

        const appointment = this.appointments.find(a => a.id === appointmentId);
        if (appointment?.status === 'cancelled') {
            block.classList.add('status-cancelled');
        } else if (driverId) {
            block.classList.add('status-assigned');
        } else {
            block.classList.add('status-pending');
        }

        // Update driver display
        let driverEl = block.querySelector('.apt-driver');
        if (driverId) {
            const driver = this.drivers.find(d => d.id === driverId);
            const driverName = driver ? driver.name : 'Driver #' + driverId;
            if (driverEl) {
                driverEl.textContent = driverName;
            } else {
                driverEl = document.createElement('div');
                driverEl.className = 'apt-driver';
                driverEl.textContent = driverName;
                block.appendChild(driverEl);
            }
        } else if (driverEl) {
            driverEl.remove();
        }
    }

    /**
     * Save draft assignment to server
     */
    async saveDraft(appointmentId, driverId) {
        console.log(`Saving draft: appointment ${appointmentId} -> driver ${driverId}`);

        try {
            const token = sessionStorage.getItem('rrts_access_token');
            if (!token) return;

            const response = await fetch(`${TEST_API_BASE}/TEST-save-draft-assignment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    appointmentId: appointmentId,
                    driverId: driverId,
                    weekStart: this.formatDate(this.currentWeekStart)
                })
            });

            const result = await response.json();

            if (result.success) {
                // Update last edited display
                const now = new Date().toLocaleString();
                const user = JSON.parse(sessionStorage.getItem('rrts_user') || '{}');
                document.getElementById('lastEditedDisplay').textContent =
                    `Last edited by ${user.fullName || user.full_name || 'you'} at ${now}`;
            } else {
                console.error('Failed to save draft:', result.message);
                showToast('Failed to save draft assignment', 'warning');
            }

        } catch (error) {
            console.error('Error saving draft:', error);
        }
    }

    /**
     * Update statistics display
     */
    updateStats(appointments) {
        const nonCancelled = appointments.filter(a => a.status !== 'cancelled');
        const total = nonCancelled.length;

        let assigned = 0;
        let pending = 0;

        nonCancelled.forEach(apt => {
            const draftDriverId = this.draftAssignments.get(apt.id);
            const hasDriver = draftDriverId !== undefined ? draftDriverId : apt.driver_assigned;
            if (hasDriver) {
                assigned++;
            } else {
                pending++;
            }
        });

        // Detect conflicts (same driver, overlapping times)
        const conflicts = this.detectDriverConflicts(nonCancelled);

        document.getElementById('totalAppointments').textContent = total;
        document.getElementById('assignedCount').textContent = assigned;
        document.getElementById('pendingCount').textContent = pending;
        document.getElementById('conflictCount').textContent = conflicts.length;
    }

    /**
     * Detect driver conflicts (same driver assigned to overlapping appointments)
     */
    detectDriverConflicts(appointments) {
        const conflicts = [];

        // Group by driver
        const byDriver = new Map();
        appointments.forEach(apt => {
            const draftDriverId = this.draftAssignments.get(apt.id);
            const driverId = draftDriverId !== undefined ? draftDriverId : apt.driver_assigned;
            if (driverId) {
                if (!byDriver.has(driverId)) {
                    byDriver.set(driverId, []);
                }
                byDriver.get(driverId).push(apt);
            }
        });

        // Check each driver's appointments for overlaps
        byDriver.forEach((driverApts, driverId) => {
            for (let i = 0; i < driverApts.length; i++) {
                for (let j = i + 1; j < driverApts.length; j++) {
                    const range1 = this.getEffectiveTimeRange(driverApts[i]);
                    const range2 = this.getEffectiveTimeRange(driverApts[j]);

                    if (range1.start < range2.end && range1.end > range2.start) {
                        conflicts.push({
                            driverId,
                            appointments: [driverApts[i].id, driverApts[j].id]
                        });
                    }
                }
            }
        });

        return conflicts;
    }

    /**
     * Navigate weeks
     */
    navigateWeek(weeks) {
        const newStart = new Date(this.currentWeekStart);
        newStart.setDate(newStart.getDate() + (weeks * 7));
        this.currentWeekStart = newStart;
        this.loadOperationsData();
    }

    /**
     * Go to current week
     */
    goToToday() {
        this.currentWeekStart = this.getWeekStart(new Date());
        this.loadOperationsData();
    }

    /**
     * Submit weekly schedule
     */
    async submitWeeklySchedule() {
        const conflicts = this.detectDriverConflicts(
            this.appointments.filter(a => a.status !== 'cancelled')
        );

        if (conflicts.length > 0) {
            const confirm = window.confirm(
                `Warning: There are ${conflicts.length} driver conflict(s) (same driver assigned to overlapping appointments).\n\nDo you want to submit anyway?`
            );
            if (!confirm) return;
        }

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Submitting...';

        try {
            const token = sessionStorage.getItem('rrts_access_token');
            if (!token) {
                showToast('Authentication required', 'warning');
                return;
            }

            const response = await fetch(`${TEST_API_BASE}/TEST-submit-weekly-schedule`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    weekStart: this.formatDate(this.currentWeekStart)
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast(`Schedule submitted! ${result.data.processedCount} assignments processed.`, 'success');

                // Reload data to reflect changes
                await this.loadOperationsData();
            } else {
                throw new Error(result.message || 'Failed to submit schedule');
            }

        } catch (error) {
            console.error('Error submitting schedule:', error);
            showToast(`Error: ${error.message}`, 'danger');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-check-circle"></i> Submit Weekly Schedule';
        }
    }
}

// Export for use in HTML
window.OperationsPage = OperationsPage;
