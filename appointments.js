/**
 * Appointments Page Controller
 * Handles all appointment management functionality with calendar and list views
 */

class AppointmentsPage {
    constructor() {
        this.currentView = 'calendar'; // 'calendar' or 'list'
        this.calendarView = 'week'; // 'week' or 'month'
        this.appointments = [];
        this.clients = [];
        this.drivers = [];
        this.filters = {
            status: '',
            driver: '',
            dateFrom: '',
            dateTo: ''
        };
        this.currentWeekStart = this.getCurrentWeekStart();
    }

    init() {
        this.setupViewToggles();
        this.setupButtons();
        this.enforcePageAccess();
        this.loadInitialData();
    }

    // Page Access Control
    enforcePageAccess() {
        const userRole = getUserRole();
        if (!userRole || !hasPageAccess(userRole, 'appointment-management')) {
            alert('You do not have permission to access this page.');
            window.location.href = 'dashboard.html';
            return;
        }
    }

    // Setup event listeners
    setupViewToggles() {
        // Main view toggle (Calendar/List)
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.closest('[data-view]').dataset.view;
                this.switchView(view);
            });
        });

        // Calendar sub-toggle (Week/Month)
        document.querySelectorAll('[data-calendar-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.closest('[data-calendar-view]').dataset.calendarView;
                this.switchCalendarView(view);
            });
        });
    }

    setupButtons() {
        // Add Appointment button
        document.getElementById('addAppointmentBtn').addEventListener('click', () => {
            if (typeof appointmentModalInstance !== 'undefined') {
                appointmentModalInstance.open('add');
            }
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadAppointments();
        });

        // Week navigation
        document.getElementById('prevWeekBtn').addEventListener('click', () => {
            this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
            this.updateWeekRange();
            this.render();
        });

        document.getElementById('nextWeekBtn').addEventListener('click', () => {
            this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
            this.updateWeekRange();
            this.render();
        });

        // Filter listeners
        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            if (this.currentView === 'list') this.render();
        });

        document.getElementById('driverFilter').addEventListener('change', (e) => {
            this.filters.driver = e.target.value;
            if (this.currentView === 'list') this.render();
        });

        document.getElementById('dateFromFilter').addEventListener('change', (e) => {
            this.filters.dateFrom = e.target.value;
            if (this.currentView === 'list') this.render();
        });

        document.getElementById('dateToFilter').addEventListener('change', (e) => {
            this.filters.dateTo = e.target.value;
            if (this.currentView === 'list') this.render();
        });
    }

    // Load initial data
    async loadInitialData() {
        try {
            await Promise.all([
                this.loadAppointments(),
                this.loadClients(),
                this.loadDrivers()
            ]);
            this.updateWeekRange();
            this.render();
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    // Load appointments from API
    async loadAppointments() {
        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-appointments');
            if (!response.ok) throw new Error('Failed to load appointments');

            const data = await response.json();
            this.appointments = data.appointments || [];
        } catch (error) {
            console.error('Error loading appointments:', error);
            this.showError('Failed to load appointments. Please try again.');
        }
    }

    // Load clients from API
    async loadClients() {
        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-clients');
            if (!response.ok) throw new Error('Failed to load clients');

            const data = await response.json();
            this.clients = data.clients || [];
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    }

    // Load drivers from API
    async loadDrivers() {
        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-drivers');
            if (!response.ok) throw new Error('Failed to load drivers');

            const data = await response.json();
            this.drivers = data.drivers || [];

            // Populate driver filter
            const driverFilter = document.getElementById('driverFilter');
            this.drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = driver.name;
                driverFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading drivers:', error);
        }
    }

    // Switch between Calendar and List view
    switchView(view) {
        this.currentView = view;

        // Update active button
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

        // Show/hide calendar sub-toggle
        const calendarSubToggle = document.getElementById('calendarSubToggle');
        calendarSubToggle.style.display = view === 'calendar' ? 'block' : 'none';

        // Render the selected view
        this.render();
    }

    // Switch calendar view (Week/Month)
    switchCalendarView(view) {
        this.calendarView = view;

        // Update active button
        document.querySelectorAll('[data-calendar-view]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-calendar-view="${view}"]`)?.classList.add('active');

        // Render the selected calendar view
        if (this.currentView === 'calendar') {
            this.render();
        }
    }

    // Main render method
    render() {
        // Hide loading view
        document.getElementById('loadingView').classList.add('hidden');

        // Hide all views
        document.getElementById('calendarWeekView').classList.add('hidden');
        document.getElementById('calendarMonthView').classList.add('hidden');
        document.getElementById('listView').classList.remove('list-view');

        // Show appropriate view based on current state
        if (this.currentView === 'calendar') {
            if (this.calendarView === 'week') {
                this.renderCalendarWeek();
            } else {
                this.renderCalendarMonth();
            }
        } else {
            this.renderListView();
        }
    }

    // Render Calendar Week View
    renderCalendarWeek() {
        const container = document.getElementById('calendarWeekView');
        container.classList.remove('hidden');

        const content = document.getElementById('calendarWeekContent');
        
        // Get the week's appointments
        const weekStart = new Date(this.currentWeekStart);
        const weekEnd = new Date(this.currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekAppointments = this.appointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDateTime);
            return aptDate >= weekStart && aptDate < weekEnd;
        });

        // Build week calendar
        let html = '<div class="calendar-header">';
        html += '<div class="time-column-header">Time</div>';
        
        // Day headers
        for (let i = 0; i < 7; i++) {
            const day = new Date(this.currentWeekStart);
            day.setDate(day.getDate() + i);
            const isToday = this.isToday(day);
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = day.getDate();
            
            html += `<div class="day-header${isToday ? ' today' : ''}">
                <div>${dayName}</div>
                <div style="font-size: 1.2em;">${dayNum}</div>
            </div>`;
        }
        html += '</div>';

        // Calendar body
        html += '<div class="calendar-body">';
        
        // Time column
        html += '<div class="time-column">';
        for (let hour = 5; hour <= 20; hour++) {
            const label = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
            html += `<div class="time-slot hour-mark">${label}</div>`;
            
            if (hour < 20) {
                html += '<div class="time-slot">30 min</div>';
            }
        }
        html += '</div>';

        // Day columns with appointments
        for (let i = 0; i < 7; i++) {
            const day = new Date(this.currentWeekStart);
            day.setDate(day.getDate() + i);
            
            html += '<div class="day-column">';
            
            // Get appointments for this day
            const dayAppointments = weekAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmentDateTime);
                return aptDate.toDateString() === day.toDateString();
            });

            // Render appointment blocks
            dayAppointments.forEach(apt => {
                html += this.renderAppointmentBlock(apt);
            });
            
            html += '</div>';
        }

        html += '</div>';
        content.innerHTML = html;

        // Add click listeners to appointment blocks
        document.querySelectorAll('.appointment-block').forEach(block => {
            block.addEventListener('click', (e) => {
                const appointmentId = e.currentTarget.dataset.appointmentId;
                this.editAppointment(appointmentId);
            });
        });
    }

    // Render a single appointment block in the calendar
    renderAppointmentBlock(appointment) {
        const startTime = new Date(appointment.appointmentDateTime);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + (appointment.appointmentLength || 120));

        // Calculate position from top (assuming 5 AM start, 60px per hour)
        const startHour = startTime.getHours();
        const startMin = startTime.getMinutes();
        const topPosition = ((startHour - 5) * 120) + (startMin / 60 * 120);

        // Calculate height
        const duration = appointment.appointmentLength || 120;
        const height = (duration / 60) * 120;

        const timeStr = startTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });

        const client = this.clients.find(c => c.knumber === appointment.knumber);
        const clientName = client ? `${client.firstname} ${client.lastname}` : appointment.knumber;

        const status = appointment.appointmentstatus || appointment.status || 'pending';

        return `
            <div class="appointment-block status-${status}" 
                 style="top: ${topPosition}px; height: ${height}px;"
                 data-appointment-id="${appointment.id}">
                <div class="appointment-time">${timeStr}</div>
                <div class="appointment-client">${clientName}</div>
            </div>
        `;
    }

    // Render Calendar Month View (placeholder)
    renderCalendarMonth() {
        const container = document.getElementById('calendarMonthView');
        container.classList.remove('hidden');
        // Month view implementation coming soon
    }

    // Render List View
    renderListView() {
        const container = document.getElementById('listView');
        container.classList.remove('list-view');

        const filtered = this.filterAppointments();
        const content = document.getElementById('listViewContent');
        
        if (filtered.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-calendar-x"></i>
                    <h4>No appointments found</h4>
                    <p class="text-muted">Try adjusting your filters or add a new appointment.</p>
                </div>
            `;
            return;
        }

        const tableHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Date/Time</th>
                            <th>Client</th>
                            <th>Location</th>
                            <th>Driver</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(apt => this.renderAppointmentRow(apt)).join('')}
                    </tbody>
                </table>
            </div>
        `;
        content.innerHTML = tableHTML;
    }

    // Render single appointment row in list view
    renderAppointmentRow(appointment) {
        const date = new Date(appointment.appointmentDateTime);
        const formattedDate = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        const client = this.clients.find(c => c.knumber === appointment.knumber);
        const driver = this.drivers.find(d => d.id === appointment.driverAssigned);

        const clientName = client ? `
            <a href="#" class="text-decoration-none" onclick="appointmentsPage.viewClient('${appointment.knumber}'); return false;">
                ${client.firstname} ${client.lastname}
            </a>
        ` : appointment.knumber;

        const statusBadge = this.getStatusBadge(appointment.appointmentstatus || appointment.status);
        const actions = this.getAppointmentActions(appointment);

        return `
            <tr>
                <td>${formattedDate}</td>
                <td>${clientName}</td>
                <td>${appointment.locationName || 'TBD'}</td>
                <td>${driver?.name || 'Unassigned'}</td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            </tr>
        `;
    }

    getStatusBadge(status) {
        const badges = {
            'pending': '<span class="badge bg-warning text-dark">Pending</span>',
            'confirmed': '<span class="badge bg-success">Confirmed</span>',
            'cancelled': '<span class="badge bg-secondary">Cancelled</span>',
            'completed': '<span class="badge bg-primary">Completed</span>'
        };
        return badges[status] || `<span class="badge bg-light text-dark">${status}</span>`;
    }

    getAppointmentActions(appointment) {
        const userRole = getUserRole();
        const permissions = getRolePermissions(userRole);

        let actions = `
            <button class="btn btn-sm btn-outline-primary me-1" onclick="appointmentsPage.editAppointment('${appointment.id}')">
                <i class="bi bi-pencil"></i> Edit
            </button>
        `;

        if (permissions?.canDeleteAppointments) {
            actions += `
                <button class="btn btn-sm btn-outline-danger" onclick="appointmentsPage.deleteAppointment('${appointment.id}')">
                    <i class="bi bi-trash"></i> Delete
                </button>
            `;
        }

        return actions;
    }

    filterAppointments() {
        let filtered = [...this.appointments];

        if (this.filters.status) {
            filtered = filtered.filter(apt => (apt.appointmentstatus || apt.status) === this.filters.status);
        }

        if (this.filters.driver) {
            filtered = filtered.filter(apt => apt.driverAssigned === this.filters.driver);
        }

        if (this.filters.dateFrom) {
            const fromDate = new Date(this.filters.dateFrom);
            filtered = filtered.filter(apt => new Date(apt.appointmentDateTime) >= fromDate);
        }

        if (this.filters.dateTo) {
            const toDate = new Date(this.filters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(apt => new Date(apt.appointmentDateTime) <= toDate);
        }

        filtered.sort((a, b) => new Date(a.appointmentDateTime) - new Date(b.appointmentDateTime));

        return filtered;
    }

    editAppointment(appointmentId) {
        const appointment = this.appointments.find(a => a.id === appointmentId);
        if (appointment && typeof appointmentModalInstance !== 'undefined') {
            appointmentModalInstance.open('edit', { appointment });
        }
    }

    async deleteAppointment(appointmentId) {
        if (!confirm('Are you sure you want to delete this appointment?')) {
            return;
        }

        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/delete-appointment-with-calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: appointmentId })
            });

            if (response.ok) {
                await this.loadAppointments();
                this.render();
            } else {
                throw new Error('Failed to delete appointment');
            }
        } catch (error) {
            console.error('Error deleting appointment:', error);
            alert('Failed to delete appointment. Please try again.');
        }
    }

    viewClient(knumber) {
        if (typeof clientQuickViewInstance !== 'undefined') {
            clientQuickViewInstance.open(knumber);
        }
    }

    // Helper methods
    getCurrentWeekStart() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(now.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday;
    }

    updateWeekRange() {
        const weekEnd = new Date(this.currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const rangeStr = `${this.currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        document.getElementById('weekRange').textContent = rangeStr;
    }

    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    showError(message) {
        alert(message); // TODO: Replace with better error UI
    }
}

// Initialize page when DOM is ready
let appointmentsPage;

document.addEventListener('DOMContentLoaded', () => {
    appointmentsPage = new AppointmentsPage();
    appointmentsPage.init();

    // Setup appointment modal save callback
    if (typeof appointmentModalInstance !== 'undefined') {
        appointmentModalInstance.onSave = async (data, mode) => {
            await appointmentsPage.loadAppointments();
            appointmentsPage.render();
        };
    }
});

// Helper function for logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = 'index.html';
    }
} 