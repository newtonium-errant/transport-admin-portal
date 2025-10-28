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
        this.currentMonthStart = this.getCurrentMonthStart(); // For month view
        this.showingHistoricData = false;
    }

    init() {
        this.setupViewToggles();
        this.setupButtons();
        this.enforcePageAccess();
        this.initHeader();
        this.loadInitialData();
    }

    // Page Access Control
    enforcePageAccess() {
        const userRole = getUserRole();
        // Get current page name from URL
        const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'dashboard';

        if (!userRole || !hasPageAccess(userRole, currentPage)) {
            alert('You do not have permission to access this page.');
            window.location.href = 'dashboard.html';
            return;
        }
    }

    // Header Initialization
    initHeader() {
        this.displayUserInfo();
        this.buildNavigation();
        this.setupMobileMenu();
    }

    displayUserInfo() {
        try {
            const savedUser = sessionStorage.getItem('rrts_user');
            if (!savedUser) return;

            const user = JSON.parse(savedUser);
            const firstName = user.firstName || user.firstname || '';
            const lastName = user.lastName || user.lastname || '';
            const role = user.role || 'Guest';

            // Create initials for avatar
            const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || 'U';

            // Display user info
            document.getElementById('userAvatar').textContent = initials;
            document.getElementById('userName').textContent = `${firstName} ${lastName}`.trim() || 'User';
            document.getElementById('userRoleBadge').textContent = this.formatRoleName(role);
        } catch (error) {
            console.error('Error displaying user info:', error);
        }
    }

    formatRoleName(role) {
        const roleMap = {
            'admin': 'Admin',
            'supervisor': 'Supervisor',
            'booking_agent': 'Booking Agent',
            'driver': 'Driver',
            'client': 'Client'
        };
        return roleMap[role.toLowerCase()] || role;
    }

    buildNavigation() {
        const userRole = getUserRole();
        if (!userRole) return;

        const permissions = getRolePermissions(userRole);
        if (!permissions) return;

        const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'dashboard';

        // Define navigation items with their display names and icons
        const navItems = [
            { page: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
            { page: 'appointments-new', label: 'Appointments', icon: 'bi-calendar-event' },
            { page: 'client-management', label: 'Clients', icon: 'bi-people' },
            { page: 'driver-management', label: 'Drivers', icon: 'bi-person-badge' },
            { page: 'operations', label: 'Operations', icon: 'bi-kanban' },
            { page: 'admin', label: 'Admin', icon: 'bi-gear' }
        ];

        const navContainer = document.getElementById('mainNav');
        navContainer.innerHTML = ''; // Clear existing

        // Build navigation links based on permissions
        navItems.forEach(item => {
            if (permissions.pages.includes(item.page)) {
                const link = document.createElement('a');
                link.href = `${item.page}.html`;
                link.className = 'nav-link';
                if (item.page === currentPage) {
                    link.classList.add('active');
                }
                link.innerHTML = `<i class="bi ${item.icon}"></i> ${item.label}`;
                navContainer.appendChild(link);
            }
        });
    }

    setupMobileMenu() {
        const toggleBtn = document.getElementById('mobileMenuToggle');
        const nav = document.getElementById('mainNav');

        if (!toggleBtn || !nav) return;

        toggleBtn.addEventListener('click', () => {
            nav.classList.toggle('mobile-open');

            // Toggle icon between list and X
            const icon = toggleBtn.querySelector('i');
            if (nav.classList.contains('mobile-open')) {
                icon.className = 'bi bi-x-lg';
            } else {
                icon.className = 'bi bi-list';
            }
        });

        // Close mobile menu when clicking a nav link
        nav.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('mobile-open');
                const icon = toggleBtn.querySelector('i');
                icon.className = 'bi bi-list';
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (nav.classList.contains('mobile-open') &&
                !nav.contains(e.target) &&
                !toggleBtn.contains(e.target)) {
                nav.classList.remove('mobile-open');
                const icon = toggleBtn.querySelector('i');
                icon.className = 'bi bi-list';
            }
        });
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
        document.getElementById('refreshBtn').addEventListener('click', async () => {
            await this.loadAppointments(false);
            this.render();
        });

        // Load all historical data button
        document.getElementById('loadAllHistoricalBtn').addEventListener('click', async () => {
            if (confirm('Load all historical appointments? This may take a moment and load a large amount of data.')) {
                await this.loadAppointments(true);
                this.showingHistoricData = true;
                this.render();

                // Update button to show it's loaded
                const btn = document.getElementById('loadAllHistoricalBtn');
                btn.innerHTML = '<i class="bi bi-check-circle"></i> All Data Loaded';
                btn.classList.remove('btn-outline-info');
                btn.classList.add('btn-success');
                btn.disabled = true;
            }
        });

        // Week/Month navigation
        document.getElementById('prevWeekBtn').addEventListener('click', () => {
            if (this.calendarView === 'week') {
                this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
                this.updateWeekRange();
            } else {
                // Month view - go to previous month
                this.currentMonthStart.setMonth(this.currentMonthStart.getMonth() - 1);
            }
            this.render();
        });

        document.getElementById('nextWeekBtn').addEventListener('click', () => {
            if (this.calendarView === 'week') {
                this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
                this.updateWeekRange();
            } else {
                // Month view - go to next month
                this.currentMonthStart.setMonth(this.currentMonthStart.getMonth() + 1);
            }
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
    async loadAppointments(loadAllHistorical = false) {
        try {
            let endpoint = 'https://webhook-processor-production-3bb8.up.railway.app/webhook/get-operations-appointments';
            
            if (loadAllHistorical) {
                endpoint = 'https://webhook-processor-production-3bb8.up.railway.app/webhook/get-all-appointments';
            }
            
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Failed to load appointments');

            const data = await response.json();
            // Handle array response wrapping
            const result = Array.isArray(data) ? data[0] : data;
            this.appointments = result.appointments || [];
        } catch (error) {
            console.error('Error loading appointments:', error);
            this.showError('Failed to load appointments. Please try again.');
        }
    }

    // Load clients from API
    async loadClients() {
        try {
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/getActiveClients');
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
            const response = await fetch('https://webhook-processor-production-3bb8.up.railway.app/webhook/driver-basic-info');
            if (!response.ok) throw new Error('Failed to load drivers');

            const data = await response.json();
            
            // Handle the actual API response format: [{ success: true, drivers: [...] }]
            if (Array.isArray(data) && data.length > 0 && data[0].drivers) {
                this.drivers = data[0].drivers;
            } else if (data && data.drivers && Array.isArray(data.drivers)) {
                this.drivers = data.drivers;
            } else {
                console.warn('Unexpected drivers response format:', data);
                this.drivers = [];
            }
            
            console.log(`Loaded ${this.drivers.length} drivers`);

            // Populate driver filter
            const driverFilter = document.getElementById('driverFilter');
            this.drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
                driverFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading drivers:', error);
            this.drivers = [];
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
        document.getElementById('calendarNavigation').classList.add('hidden');

        // Show appropriate view based on current state
        if (this.currentView === 'calendar') {
            // Show navigation for calendar views
            document.getElementById('calendarNavigation').classList.remove('hidden');

            // Update navigation button text based on view
            if (this.calendarView === 'week') {
                document.getElementById('prevBtnText').textContent = 'Previous Week';
                document.getElementById('nextBtnText').textContent = 'Next Week';
                this.renderCalendarWeek();
            } else {
                document.getElementById('prevBtnText').textContent = 'Previous Month';
                document.getElementById('nextBtnText').textContent = 'Next Month';
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
        
        // Day headers (Monday-Friday only)
        for (let i = 0; i < 5; i++) {
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
        
        // Time column (9 AM to 9 PM)
        html += '<div class="time-column">';
        for (let hour = 9; hour <= 21; hour++) {
            const label = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
            html += `<div class="time-slot hour-mark">${label}</div>`;
            
            if (hour < 21) {
                html += '<div class="time-slot">30 min</div>';
            }
        }
        html += '</div>';

        // Day columns with appointments (Monday-Friday only)
        for (let i = 0; i < 5; i++) {
            const day = new Date(this.currentWeekStart);
            day.setDate(day.getDate() + i);
            
            html += '<div class="day-column">';
            
            // Get appointments for this day
            const dayAppointments = weekAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmentDateTime);
                return aptDate.toDateString() === day.toDateString();
            });

            // Sort appointments by time and handle overlaps
            dayAppointments.sort((a, b) => {
                const timeA = new Date(a.appointmentDateTime).getTime();
                const timeB = new Date(b.appointmentDateTime).getTime();
                return timeA - timeB;
            });

            // Render appointment blocks with overlap handling
            dayAppointments.forEach((apt, index) => {
                // Simple overlap detection: count appointments that overlap in time
                const aptStart = new Date(apt.appointmentDateTime).getTime();
                const aptEnd = aptStart + (apt.appointmentLength || 120) * 60000;
                
                const overlapping = dayAppointments.filter(apt2 => {
                    const apt2Start = new Date(apt2.appointmentDateTime).getTime();
                    const apt2End = apt2Start + (apt2.appointmentLength || 120) * 60000;
                    return (apt2Start < aptEnd && apt2End > aptStart);
                });

                const overlapIndex = overlapping.indexOf(apt);
                html += this.renderAppointmentBlock(apt, overlapIndex, overlapping.length);
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
    renderAppointmentBlock(appointment, overlapIndex = 0, totalOverlaps = 1) {
        const startTime = new Date(appointment.appointmentDateTime);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + (appointment.appointmentLength || 120));

        // Calculate position from top (9 AM start, 60px per 30min slot = 120px per hour)
        const startHour = startTime.getHours();
        const startMin = startTime.getMinutes();
        const topPosition = ((startHour - 9) * 120) + (startMin / 60 * 120);

        // Calculate height
        const duration = appointment.appointmentLength || 120;
        const height = (duration / 60) * 120;

        // Handle overlap positioning (side by side for overlapping appointments)
        const leftOffset = overlapIndex * (100 / totalOverlaps);
        const width = (100 / totalOverlaps) - 1;

        const timeStr = startTime.toLocaleTimeString('en-US', {
            timeZone: 'America/Halifax',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Use client data from appointment (already enriched by webhook)
        const clientName = appointment.clientName || 
                          (appointment.clientFirstName && appointment.clientLastName 
                            ? `${appointment.clientFirstName} ${appointment.clientLastName}` 
                            : 'Unknown Client');

        const locationName = appointment.locationName || appointment.location || 'No location';
        const driver = this.drivers.find(d => d.id === appointment.driverAssigned);
        const driverName = driver ? (driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim()) : (appointment.driverAssigned ? 'Unassigned' : 'No Driver');

        const status = appointment.appointmentstatus || appointment.status || 'pending';

        return `
            <div class="appointment-block status-${status}" 
                 style="top: ${topPosition}px; height: ${height}px; left: ${leftOffset}%; width: ${width}%;"
                 data-appointment-id="${appointment.id}"
                 data-knumber="${appointment.knumber}"
                 title="${clientName} - ${locationName} - ${driverName}">
                <div class="appointment-time">${timeStr}</div>
                <div class="appointment-client client-link" style="cursor: pointer; text-decoration: underline;" 
                     onclick="event.stopPropagation(); appointmentsPage.viewClient('${appointment.knumber}');">
                    ${clientName}
                </div>
                <div class="appointment-location">${locationName}</div>
                <div class="appointment-driver">${driverName}</div>
            </div>
        `;
    }

    // Render Calendar Month View
    renderCalendarMonth() {
        const container = document.getElementById('calendarMonthView');
        container.classList.remove('hidden');

        const content = document.getElementById('calendarMonthContent');

        // Update month header
        const monthYear = this.currentMonthStart.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
        document.getElementById('weekRange').textContent = monthYear;

        // Get all days for the month (including overflow days)
        const monthDays = this.getMonthDays();

        // Build calendar grid
        let html = '<div class="calendar-month-grid">';

        // Day headers (Sunday - Saturday)
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(day => {
            html += `<div class="month-day-header">${day}</div>`;
        });

        // Render each day cell
        monthDays.forEach(dayData => {
            html += this.renderMonthDayCell(dayData);
        });

        html += '</div>';
        content.innerHTML = html;

        // Add click handlers
        this.setupMonthViewHandlers();
    }

    // Get all days for the month including overflow days from previous/next month
    getMonthDays() {
        const year = this.currentMonthStart.getFullYear();
        const month = this.currentMonthStart.getMonth();

        // Get first day of month and its day of week
        const firstDay = new Date(year, month, 1);
        const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday

        // Get last day of month
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();

        const days = [];

        // Add overflow days from previous month
        const prevMonth = new Date(year, month, 0);
        const prevMonthDays = prevMonth.getDate();
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const date = new Date(year, month - 1, day);
            days.push({
                date: date,
                dayNumber: day,
                isCurrentMonth: false,
                appointments: this.getDayAppointments(date)
            });
        }

        // Add current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            days.push({
                date: date,
                dayNumber: day,
                isCurrentMonth: true,
                appointments: this.getDayAppointments(date)
            });
        }

        // Add overflow days from next month to complete the grid
        const lastDayOfWeek = lastDay.getDay();
        const daysToAdd = lastDayOfWeek === 6 ? 0 : 6 - lastDayOfWeek;
        for (let day = 1; day <= daysToAdd; day++) {
            const date = new Date(year, month + 1, day);
            days.push({
                date: date,
                dayNumber: day,
                isCurrentMonth: false,
                appointments: this.getDayAppointments(date)
            });
        }

        return days;
    }

    // Get appointments for a specific day
    getDayAppointments(date) {
        const dateStr = date.toDateString();
        return this.appointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDateTime);
            // Convert to Halifax timezone for comparison
            const aptDateHalifax = new Date(aptDate.toLocaleString('en-US', { timeZone: 'America/Halifax' }));
            return aptDateHalifax.toDateString() === dateStr;
        });
    }

    // Render a single day cell in month view
    renderMonthDayCell(dayData) {
        const { date, dayNumber, isCurrentMonth, appointments } = dayData;

        // Determine day classes
        const classes = ['month-day-cell'];
        if (!isCurrentMonth) classes.push('day-other-month');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cellDate = new Date(date);
        cellDate.setHours(0, 0, 0, 0);

        if (cellDate.toDateString() === today.toDateString()) {
            classes.push('day-today');
        } else if (cellDate < today) {
            classes.push('day-past');
        }

        // Format date for data attribute (YYYY-MM-DD)
        const dateStr = date.toISOString().split('T')[0];

        let html = `<div class="${classes.join(' ')}" data-date="${dateStr}">`;
        html += `<div class="month-day-number">${dayNumber}</div>`;

        // Show up to 3 appointments
        const visibleAppointments = appointments.slice(0, 3);
        visibleAppointments.forEach(apt => {
            const status = apt.appointmentstatus || apt.status || 'pending';
            const aptTime = new Date(apt.appointmentDateTime);
            const timeStr = aptTime.toLocaleTimeString('en-US', {
                timeZone: 'America/Halifax',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            const clientName = apt.clientName ||
                (apt.clientFirstName && apt.clientLastName
                    ? `${apt.clientFirstName} ${apt.clientLastName}`
                    : 'Unknown');

            html += `<div class="month-appointment-mini status-${status}" data-appointment-id="${apt.id}">
                <span class="month-appointment-time">${timeStr}</span> ${clientName}
            </div>`;
        });

        // Show "X more" link if there are more appointments
        if (appointments.length > 3) {
            const moreCount = appointments.length - 3;
            html += `<div class="month-more-link" data-date="${dateStr}">${moreCount} more</div>`;
        }

        html += '</div>';
        return html;
    }

    // Setup click handlers for month view
    setupMonthViewHandlers() {
        // Click on day cell (empty space) to add appointment
        document.querySelectorAll('.month-day-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                // Don't trigger if clicking on appointment or "more" link
                if (e.target.classList.contains('month-appointment-mini') ||
                    e.target.classList.contains('month-more-link') ||
                    e.target.closest('.month-appointment-mini') ||
                    e.target.closest('.month-more-link')) {
                    return;
                }

                const date = cell.dataset.date;
                if (typeof appointmentModalInstance !== 'undefined') {
                    appointmentModalInstance.open('add');
                    // Pre-fill the date (convert to datetime-local format)
                    const dateTime = new Date(date + 'T09:00:00');
                    document.getElementById('appointmentDate').value =
                        dateTime.toISOString().slice(0, 16);
                }
            });
        });

        // Click on appointment to edit
        document.querySelectorAll('.month-appointment-mini').forEach(block => {
            block.addEventListener('click', (e) => {
                e.stopPropagation();
                const appointmentId = block.dataset.appointmentId;
                this.editAppointment(appointmentId);
            });
        });

        // Click on "X more" to show popover
        document.querySelectorAll('.month-more-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                const date = link.dataset.date;
                this.showDayPopover(date, e.target);
            });
        });
    }

    // Show popover with all appointments for a day
    showDayPopover(dateStr, triggerElement) {
        // Remove any existing popover
        const existing = document.querySelector('.day-popover');
        if (existing) existing.remove();

        const date = new Date(dateStr + 'T12:00:00');
        const appointments = this.getDayAppointments(date);

        // Create popover
        const popover = document.createElement('div');
        popover.className = 'day-popover';

        const dateDisplay = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        let html = `
            <div class="day-popover-close" onclick="this.parentElement.remove()">×</div>
            <div class="day-popover-header">${dateDisplay}</div>
        `;

        appointments.forEach(apt => {
            const status = apt.appointmentstatus || apt.status || 'pending';
            const aptTime = new Date(apt.appointmentDateTime);
            const timeStr = aptTime.toLocaleTimeString('en-US', {
                timeZone: 'America/Halifax',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            const clientName = apt.clientName ||
                (apt.clientFirstName && apt.clientLastName
                    ? `${apt.clientFirstName} ${apt.clientLastName}`
                    : 'Unknown');

            const location = apt.locationName || apt.location || 'No location';
            const driver = this.drivers.find(d => d.id === apt.driverAssigned);
            const driverName = driver ? (driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim()) : 'Unassigned';

            html += `<div class="day-popover-appointment status-${status}" data-appointment-id="${apt.id}"
                style="border-color: ${status === 'confirmed' ? '#28a745' : status === 'cancelled' ? '#dc3545' : '#ffc107'}">
                <strong>${timeStr}</strong> - ${clientName}<br>
                <small>${location} • ${driverName}</small>
            </div>`;
        });

        popover.innerHTML = html;

        // Position popover near the trigger element
        document.body.appendChild(popover);

        const rect = triggerElement.getBoundingClientRect();
        popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
        popover.style.left = `${rect.left + window.scrollX}px`;

        // Add click handlers for appointments in popover
        popover.querySelectorAll('.day-popover-appointment').forEach(appt => {
            appt.addEventListener('click', () => {
                const id = appt.dataset.appointmentId;
                this.editAppointment(id);
                popover.remove();
            });
        });

        // Close popover when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closePopover(e) {
                if (!popover.contains(e.target) && e.target !== triggerElement) {
                    popover.remove();
                    document.removeEventListener('click', closePopover);
                }
            });
        }, 100);
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
            timeZone: 'America/Halifax',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        // Use client data from appointment (already enriched by webhook)
        const clientNameFromAppt = appointment.clientName || 
                                   (appointment.clientFirstName && appointment.clientLastName 
                                     ? `${appointment.clientFirstName} ${appointment.clientLastName}` 
                                     : appointment.knumber);
        
        const driver = this.drivers.find(d => d.id === appointment.driverAssigned);
        const driverName = driver ? (driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim()) : 'Unassigned';

        const clientName = `
            <a href="#" class="text-decoration-none" onclick="appointmentsPage.viewClient('${appointment.knumber}'); return false;">
                ${clientNameFromAppt}
            </a>
        `;

        const statusBadge = this.getStatusBadge(appointment.appointmentstatus || appointment.status);
        const actions = this.getAppointmentActions(appointment);

        return `
            <tr>
                <td>${formattedDate}</td>
                <td>${clientName}</td>
                <td>${appointment.locationName || appointment.location || 'TBD'}</td>
                <td>${driverName}</td>
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

        // Default: Only show future/present appointments unless viewing list with historic toggle
        if (this.currentView === 'list' && !this.showingHistoricData) {
            const now = new Date();
            filtered = filtered.filter(apt => new Date(apt.appointmentDateTime) >= now);
        }

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
            appointmentModalInstance.open('edit', appointment);
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

    getCurrentMonthStart() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
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

    // Setup appointment modal save callback - retry if modal not ready yet
    const setupModalCallback = () => {
        if (typeof appointmentModalInstance !== 'undefined' && appointmentModalInstance) {
            appointmentModalInstance.onSave = async (appointmentData, mode) => {
            try {
                let endpoint;
                let payload;

                if (mode === 'edit') {
                    endpoint = 'https://webhook-processor-production-3bb8.up.railway.app/webhook/update-appointment-with-calendar';
                    payload = appointmentData; // Edit uses existing format
                } else {
                    // ADD mode - needs to format for /save-appointment endpoint
                    endpoint = 'https://webhook-processor-production-3bb8.up.railway.app/webhook/save-appointment';

                    // Find the client from the loaded clients
                    const client = appointmentsPage.clients.find(c => c.knumber === appointmentData.knumber);

                    if (!client) {
                        console.error('Client not found. Looking for knumber:', appointmentData.knumber);
                        console.error('Available clients:', appointmentsPage.clients.length);
                        console.error('Sample knumbers:', appointmentsPage.clients.slice(0, 5).map(c => c.knumber));
                        throw new Error('Client not found. Please refresh and try again.');
                    }

                    console.log('Found client:', client.knumber, client.firstname, client.lastname);

                    // Extract date and time from appointmentDateTime
                    const apptDate = new Date(appointmentData.appointmentDateTime);
                    const dateStr = apptDate.toISOString().split('T')[0]; // YYYY-MM-DD
                    const hours = String(apptDate.getHours()).padStart(2, '0');
                    const minutes = String(apptDate.getMinutes()).padStart(2, '0');
                    const timeStr = `${hours}:${minutes}`; // HH:MM

                    // Format payload to match /save-appointment expectations
                    payload = {
                        kNumber: client.knumber,
                        clientData: {
                            kNumber: client.knumber,
                            firstName: client.firstname || '',
                            lastName: client.lastname || '',
                            civicAddress: client.civicaddress || '',
                            city: client.city || '',
                            province: client.prov || '',
                            postalCode: client.postalcode || '',
                            phone: client.phone || '',
                            email: client.email || ''
                        },
                        appointments: [{
                            date: dateStr,
                            time: timeStr,
                            appointmenttime: appointmentData.appointmentDateTime,
                            location: appointmentData.location,
                            locationId: appointmentData.locationId,
                            locationAddress: appointmentData.locationAddress,
                            notes: appointmentData.notes || '',
                            appointmentLength: appointmentData.appointmentLength || 120
                        }]
                    };
                }

                console.log('Sending to endpoint:', endpoint);
                console.log('Request payload:', JSON.stringify(payload, null, 2));

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                }).catch(error => {
                    console.error('Network error:', error);
                    throw new Error('Network error: ' + error.message);
                });

                console.log('Response status:', response.status, response.statusText);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Error response:', errorText);
                    throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
                }

                const result = await response.json();
                console.log('Save response:', result);

                if (result.success !== false) {
                    await appointmentsPage.loadAppointments();
                    appointmentsPage.render();
                    alert('Appointment saved successfully!');
                } else {
                    throw new Error(result.message || 'Failed to save appointment');
                }
            } catch (error) {
                console.error('Error saving appointment:', error);
                alert('Failed to save appointment: ' + error.message);
                throw error;
            }
        };
        
            appointmentModalInstance.onDelete = async (id) => {
                await appointmentsPage.deleteAppointment(id);
            };
        } else {
            // Modal not ready, try again shortly
            setTimeout(setupModalCallback, 100);
        }
    };
    
    // Try to setup immediately, and retry if needed
    setupModalCallback();
});

// Helper function for logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('rrts_user');
        window.location.href = 'index.html';
    }
} 