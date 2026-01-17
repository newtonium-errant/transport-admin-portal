/**
 * TEST Finance Dashboard - Business Logic
 * Handles pay period calculations, invoice management, and payment tracking
 *
 * TEST MODE - Uses Testing Branch Supabase database
 * Endpoints: TEST-update-invoice-status, TEST-mark-driver-paid, TEST-mark-agent-paid
 */

(function() {
    'use strict';

    console.log('[TEST Finance] Loading TEST Finance Dashboard - v1.1.0-TEST');
    console.log('[TEST Finance] Using TEST-api-client.js with proper TEST redirects');

    // Pay period configuration
    const PAY_PERIOD_START_DATE = new Date('2025-10-26'); // First pay period start
    const PAY_PERIOD_DAYS = 14;

    // State
    let currentPayPeriod = null;
    let allAppointments = [];
    let drivers = [];
    let users = [];

    /**
     * Initialize page
     */
    async function init() {
        // Enforce RBAC - admin and supervisor only
        await requireAuth('TEST-dashboard.html');

        const user = getCurrentUser();
        if (!user) {
            alert('Authentication error. Please log in again.');
            window.location.href = 'TEST-dashboard.html';
            return;
        }

        if (!hasPageAccess(user.role, 'finance')) {
            alert('Access denied. Finance dashboard is for Admin and Supervisor roles only.');
            window.location.href = 'TEST-dashboard.html';
            return;
        }

        // Display user (currentDate element doesn't exist in TEST-finance.html)
        document.getElementById('userName').textContent = user.username;

        // Calculate current pay period
        currentPayPeriod = getCurrentPayPeriod();
        updateDateRangeDisplay();

        // Load data
        await loadAllData();

        // Setup event listeners
        document.getElementById('payPeriodSelect').addEventListener('change', handlePayPeriodChange);
    }

    /**
     * Calculate current pay period
     */
    function getCurrentPayPeriod() {
        const today = new Date();
        const daysSinceStart = Math.floor((today - PAY_PERIOD_START_DATE) / (1000 * 60 * 60 * 24));
        const periodsElapsed = Math.floor(daysSinceStart / PAY_PERIOD_DAYS);

        const periodStart = new Date(PAY_PERIOD_START_DATE);
        periodStart.setDate(periodStart.getDate() + (periodsElapsed * PAY_PERIOD_DAYS));

        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + PAY_PERIOD_DAYS - 1);
        periodEnd.setHours(23, 59, 59, 999);

        return { start: periodStart, end: periodEnd };
    }

    /**
     * Get previous pay period
     */
    function getPreviousPayPeriod() {
        const current = getCurrentPayPeriod();
        const prevStart = new Date(current.start);
        prevStart.setDate(prevStart.getDate() - PAY_PERIOD_DAYS);

        const prevEnd = new Date(prevStart);
        prevEnd.setDate(prevEnd.getDate() + PAY_PERIOD_DAYS - 1);
        prevEnd.setHours(23, 59, 59, 999);

        return { start: prevStart, end: prevEnd };
    }

    /**
     * Get year-to-date period
     */
    function getYearToDatePeriod() {
        return {
            start: new Date('2025-01-01'),
            end: new Date()
        };
    }

    /**
     * Update date range display
     */
    function updateDateRangeDisplay() {
        const period = currentPayPeriod;
        const startStr = period.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const endStr = period.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        document.getElementById('dateRangeDisplay').textContent = `${startStr} - ${endStr}`;
    }

    /**
     * Handle pay period selector change
     */
    async function handlePayPeriodChange(e) {
        const value = e.target.value;

        if (value === 'current') {
            currentPayPeriod = getCurrentPayPeriod();
        } else if (value === 'previous') {
            currentPayPeriod = getPreviousPayPeriod();
        } else if (value === 'ytd') {
            currentPayPeriod = getYearToDatePeriod();
        }

        updateDateRangeDisplay();
        await loadAllData();
    }

    /**
     * Load all required data
     */
    async function loadAllData() {
        try {
            // Load appointments, drivers, and users in parallel
            // ✅ Using TEST endpoints for Testing Branch database
            const [appointmentsData, driversData, usersData] = await Promise.all([
                APIClient.get('/TEST-get-historic-appointments'),  // Historic appointments endpoint
                APIClient.get('/TEST-get-all-drivers'),
                APIClient.get('/TEST-get-all-users')  // Create this workflow in n8n
            ]);

            allAppointments = appointmentsData.data || appointmentsData || [];
            drivers = driversData.data || driversData || [];
            users = usersData.data || usersData || [];

            // Render all sections
            renderReadyForInvoicing();
            renderNotReadyVerification();
            renderDriverStats();
            renderAgentStats();
            renderSummaryStats();

        } catch (error) {
            console.error('Error loading data:', error);
            alert('Failed to load finance data. Please refresh the page.');
        }
    }

    /**
     * Calculate hours worked for an appointment
     */
    function calculateHours(appointment) {
        // One-way trips (custom_rate = 250): 1 hour
        if (appointment.custom_rate === 250 || appointment.custom_rate === '250') {
            return 1;
        }

        // Standard or longer trips: max(4 hours, actual duration)
        if (appointment.pickup_time && appointment.drop_off_time) {
            const pickupTime = new Date(appointment.pickup_time);
            const dropOffTime = new Date(appointment.drop_off_time);
            const actualHours = (dropOffTime - pickupTime) / (1000 * 60 * 60); // milliseconds to hours

            return Math.max(4, actualHours);
        }

        // Default to 4 hours if times not available
        return 4;
    }

    /**
     * Calculate driver payment (33% of invoice amount)
     */
    function calculateDriverPayment(customRate) {
        const rate = parseFloat(customRate) || 0;
        return rate * 0.33;
    }

    /**
     * Calculate agent commission (5% of invoice amount)
     */
    function calculateAgentCommission(customRate) {
        const rate = parseFloat(customRate) || 0;
        return rate * 0.05;
    }

    /**
     * Format currency
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    /**
     * Render Ready for Invoicing table
     */
    function renderReadyForInvoicing() {
        const tbody = document.getElementById('readyInvoicesTableBody');
        const loading = document.getElementById('readyInvoicesLoading');
        const content = document.getElementById('readyInvoicesContent');

        // Filter appointments: completed, ready/created/sent status, not deleted
        const filteredAppts = allAppointments.filter(apt =>
            apt.operation_status === 'completed' &&
            ['ready', 'created', 'sent'].includes(apt.invoice_status) &&
            !apt.deleted_at
        );

        document.getElementById('readyCount').textContent = filteredAppts.length;

        if (filteredAppts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="bi bi-inbox"></i><br>No invoices ready</td></tr>';
        } else {
            let totalAmount = 0;
            tbody.innerHTML = filteredAppts.map(apt => {
                totalAmount += parseFloat(apt.custom_rate) || 0;
                return `
                    <tr>
                        <td>${new Date(apt.appointmenttime).toLocaleDateString()}</td>
                        <td>${apt.knumber || ''} ${apt.clientFirstName || ''} ${apt.clientLastName || ''}</td>
                        <td>${getDriverName(apt.driver_assigned)}</td>
                        <td>${apt.managed_by_name || 'N/A'}</td>
                        <td class="text-right">${formatCurrency(apt.custom_rate)}</td>
                        <td><span class="badge badge-${apt.invoice_status}">${apt.invoice_status}</span></td>
                        <td>
                            ${getInvoiceActions(apt)}
                        </td>
                    </tr>
                `;
            }).join('');

            // Add total row
            tbody.innerHTML += `
                <tr class="total-row">
                    <td colspan="4">Total</td>
                    <td class="text-right">${formatCurrency(totalAmount)}</td>
                    <td colspan="2"></td>
                </tr>
            `;
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    /**
     * Get appropriate invoice action buttons based on status
     */
    function getInvoiceActions(apt) {
        if (apt.invoice_status === 'ready') {
            return `<button class="btn btn-primary btn-sm" onclick="window.financeApp.markInvoiceCreated(${apt.id})">Mark Created</button>`;
        } else if (apt.invoice_status === 'created') {
            return `<button class="btn btn-primary btn-sm" onclick="window.financeApp.markInvoiceSent(${apt.id})">Mark Sent</button>`;
        } else if (apt.invoice_status === 'sent') {
            return `<button class="btn btn-success btn-sm" onclick="window.financeApp.markInvoicePaid(${apt.id})">Mark Paid</button>`;
        }
        return '';
    }

    /**
     * Render Not Ready Verification table
     */
    function renderNotReadyVerification() {
        const tbody = document.getElementById('notReadyInvoicesTableBody');
        const loading = document.getElementById('notReadyInvoicesLoading');
        const content = document.getElementById('notReadyInvoicesContent');

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Filter appointments: completed, not_ready status, older than 7 days, not deleted
        const filteredAppts = allAppointments.filter(apt =>
            apt.operation_status === 'completed' &&
            apt.invoice_status === 'not_ready' &&
            new Date(apt.appointmenttime) < sevenDaysAgo &&
            !apt.deleted_at
        );

        document.getElementById('notReadyCount').textContent = filteredAppts.length;

        if (filteredAppts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="bi bi-check-circle"></i><br>All completed appointments are ready for invoicing</td></tr>';
        } else {
            let totalAmount = 0;
            tbody.innerHTML = filteredAppts.map(apt => {
                totalAmount += parseFloat(apt.custom_rate) || 0;
                return `
                    <tr>
                        <td>${new Date(apt.appointmenttime).toLocaleDateString()}</td>
                        <td>${apt.knumber || ''} ${apt.clientFirstName || ''} ${apt.clientLastName || ''}</td>
                        <td>${getDriverName(apt.driver_assigned)}</td>
                        <td>${apt.managed_by_name || 'N/A'}</td>
                        <td class="text-right">${formatCurrency(apt.custom_rate)}</td>
                        <td>
                            <button class="btn btn-success btn-sm" onclick="window.financeApp.markInvoiceReady(${apt.id})">Mark Ready</button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Add total row
            tbody.innerHTML += `
                <tr class="total-row">
                    <td colspan="4">Total</td>
                    <td class="text-right">${formatCurrency(totalAmount)}</td>
                    <td></td>
                </tr>
            `;
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    /**
     * Render Driver Stats table
     */
    function renderDriverStats() {
        const tbody = document.getElementById('driverStatsTableBody');
        const loading = document.getElementById('driverStatsLoading');
        const content = document.getElementById('driverStatsContent');

        // Filter appointments in current pay period, completed, with driver assigned
        const filteredAppts = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime);
            return apt.operation_status === 'completed' &&
                   apt.driver_assigned &&
                   !apt.deleted_at &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Group by driver
        const driverStats = {};
        filteredAppts.forEach(apt => {
            const driverId = apt.driver_assigned;
            if (!driverStats[driverId]) {
                driverStats[driverId] = {
                    driverId,
                    driverName: getDriverName(driverId),
                    drives: 0,
                    hours: 0,
                    revenue: 0,
                    payment: 0,
                    appointments: [],
                    paid: apt.driver_paid_at ? new Date(apt.driver_paid_at).toLocaleDateString() : null
                };
            }

            const hours = calculateHours(apt);
            const revenue = parseFloat(apt.custom_rate) || 0;
            const payment = calculateDriverPayment(apt.custom_rate);

            driverStats[driverId].drives++;
            driverStats[driverId].hours += hours;
            driverStats[driverId].revenue += revenue;
            driverStats[driverId].payment += payment;
            driverStats[driverId].appointments.push({
                ...apt,
                hours,
                payment
            });
        });

        const driverStatsArray = Object.values(driverStats);

        if (driverStatsArray.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="bi bi-inbox"></i><br>No driver activity in this period</td></tr>';
        } else {
            let totalDrives = 0;
            let totalHours = 0;
            let totalRevenue = 0;
            let totalPayment = 0;

            tbody.innerHTML = driverStatsArray.map((stats, index) => {
                totalDrives += stats.drives;
                totalHours += stats.hours;
                totalRevenue += stats.revenue;
                totalPayment += stats.payment;

                const isPaid = stats.paid;
                const paidStatus = isPaid
                    ? `<span class="paid-indicator">✓ Paid ${stats.paid}</span>`
                    : `<span class="unpaid-indicator">✗ Unpaid</span>`;

                const action = isPaid
                    ? `<span class="text-muted">Paid</span>`
                    : `<button class="btn btn-success btn-sm" onclick="window.financeApp.markDriverPaid(${stats.driverId})">Mark Paid</button>`;

                const expandedId = `driver-details-${index}`;

                return `
                    <tr class="expandable-row" onclick="window.financeApp.toggleExpandedRow('${expandedId}')">
                        <td><i class="bi bi-chevron-right"></i> ${stats.driverName}</td>
                        <td class="text-center">${stats.drives}</td>
                        <td class="text-center">${stats.hours.toFixed(1)}</td>
                        <td class="text-right">${formatCurrency(stats.revenue)}</td>
                        <td class="text-right">${formatCurrency(stats.payment)}</td>
                        <td class="text-center">${paidStatus}</td>
                        <td class="text-center">${action}</td>
                    </tr>
                    <tr class="expanded-details" id="${expandedId}">
                        <td colspan="7">
                            <ul class="detail-list">
                                ${stats.appointments.map(apt => `
                                    <li>
                                        <span>
                                            ${new Date(apt.appointmenttime).toLocaleDateString()} -
                                            ${apt.knumber} ${apt.clientFirstName || ''} ${apt.clientLastName || ''} -
                                            ${apt.hours.toFixed(1)}h
                                        </span>
                                        <span>${formatCurrency(apt.custom_rate)} → ${formatCurrency(apt.payment)}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </td>
                    </tr>
                `;
            }).join('');

            // Add total row
            tbody.innerHTML += `
                <tr class="total-row">
                    <td>Total</td>
                    <td class="text-center">${totalDrives}</td>
                    <td class="text-center">${totalHours.toFixed(1)}</td>
                    <td class="text-right">${formatCurrency(totalRevenue)}</td>
                    <td class="text-right">${formatCurrency(totalPayment)}</td>
                    <td colspan="2"></td>
                </tr>
            `;
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    /**
     * Render Booking Agent Stats table
     */
    function renderAgentStats() {
        const tbody = document.getElementById('agentStatsTableBody');
        const loading = document.getElementById('agentStatsLoading');
        const content = document.getElementById('agentStatsContent');

        // Filter appointments in current pay period, completed, with booking agent
        const filteredAppts = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime);
            return apt.operation_status === 'completed' &&
                   apt.managed_by &&
                   !apt.deleted_at &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Group by agent
        const agentStats = {};
        filteredAppts.forEach(apt => {
            const agentId = apt.managed_by;
            if (!agentStats[agentId]) {
                agentStats[agentId] = {
                    agentId,
                    agentName: apt.managed_by_name || `Agent ${agentId}`,
                    appointments: 0,
                    revenue: 0,
                    commission: 0,
                    appointmentList: [],
                    paid: apt.booking_agent_paid_at ? new Date(apt.booking_agent_paid_at).toLocaleDateString() : null
                };
            }

            const revenue = parseFloat(apt.custom_rate) || 0;
            const commission = calculateAgentCommission(apt.custom_rate);

            agentStats[agentId].appointments++;
            agentStats[agentId].revenue += revenue;
            agentStats[agentId].commission += commission;
            agentStats[agentId].appointmentList.push({
                ...apt,
                commission
            });
        });

        const agentStatsArray = Object.values(agentStats);

        if (agentStatsArray.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i><br>No booking agent activity in this period</td></tr>';
        } else {
            let totalAppts = 0;
            let totalRevenue = 0;
            let totalCommission = 0;

            tbody.innerHTML = agentStatsArray.map((stats, index) => {
                totalAppts += stats.appointments;
                totalRevenue += stats.revenue;
                totalCommission += stats.commission;

                const isPaid = stats.paid;
                const paidStatus = isPaid
                    ? `<span class="paid-indicator">✓ Paid ${stats.paid}</span>`
                    : `<span class="unpaid-indicator">✗ Unpaid</span>`;

                const action = isPaid
                    ? `<span class="text-muted">Paid</span>`
                    : `<button class="btn btn-success btn-sm" onclick="window.financeApp.markAgentPaid(${stats.agentId})">Mark Paid</button>`;

                const expandedId = `agent-details-${index}`;

                return `
                    <tr class="expandable-row" onclick="window.financeApp.toggleExpandedRow('${expandedId}')">
                        <td><i class="bi bi-chevron-right"></i> ${stats.agentName}</td>
                        <td class="text-center">${stats.appointments}</td>
                        <td class="text-right">${formatCurrency(stats.revenue)}</td>
                        <td class="text-right">${formatCurrency(stats.commission)}</td>
                        <td class="text-center">${paidStatus}</td>
                        <td class="text-center">${action}</td>
                    </tr>
                    <tr class="expanded-details" id="${expandedId}">
                        <td colspan="6">
                            <ul class="detail-list">
                                ${stats.appointmentList.map(apt => `
                                    <li>
                                        <span>
                                            ${new Date(apt.appointmenttime).toLocaleDateString()} -
                                            ${apt.knumber} ${apt.clientFirstName || ''} ${apt.clientLastName || ''}
                                        </span>
                                        <span>${formatCurrency(apt.custom_rate)} → ${formatCurrency(apt.commission)}</span>
                                    </li>
                                `).join('')}
                            </ul>
                        </td>
                    </tr>
                `;
            }).join('');

            // Add total row
            tbody.innerHTML += `
                <tr class="total-row">
                    <td>Total</td>
                    <td class="text-center">${totalAppts}</td>
                    <td class="text-right">${formatCurrency(totalRevenue)}</td>
                    <td class="text-right">${formatCurrency(totalCommission)}</td>
                    <td colspan="2"></td>
                </tr>
            `;
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    /**
     * Render summary stats
     */
    function renderSummaryStats() {
        // Filter appointments in current pay period
        const filteredAppts = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime);
            return apt.operation_status === 'completed' &&
                   !apt.deleted_at &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        const totalRevenue = filteredAppts.reduce((sum, apt) => sum + (parseFloat(apt.custom_rate) || 0), 0);
        const totalDriverPayments = filteredAppts
            .filter(apt => apt.driver_assigned)
            .reduce((sum, apt) => sum + calculateDriverPayment(apt.custom_rate), 0);
        const totalAgentCommissions = filteredAppts
            .filter(apt => apt.managed_by)
            .reduce((sum, apt) => sum + calculateAgentCommission(apt.custom_rate), 0);
        const netProfit = totalRevenue - totalDriverPayments - totalAgentCommissions;

        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('totalDriverPayments').textContent = formatCurrency(totalDriverPayments);
        document.getElementById('totalAgentCommissions').textContent = formatCurrency(totalAgentCommissions);
        document.getElementById('netProfit').textContent = formatCurrency(netProfit);
    }

    /**
     * Get driver name by ID
     */
    function getDriverName(driverId) {
        if (!driverId) return 'Not Assigned';
        const driver = drivers.find(d => d.id === driverId);
        return driver ? `${driver.firstname} ${driver.lastname}` : `Driver ${driverId}`;
    }

    /**
     * Toggle expanded row details
     */
    function toggleExpandedRow(rowId) {
        const row = document.getElementById(rowId);
        if (row) {
            row.classList.toggle('show');
            const icon = row.previousElementSibling.querySelector('i');
            if (icon) {
                icon.classList.toggle('bi-chevron-right');
                icon.classList.toggle('bi-chevron-down');
            }
        }
    }

    /**
     * Mark invoice as ready
     */
    async function markInvoiceReady(appointmentId) {
        if (!confirm('Mark this invoice as ready?')) return;

        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'ready'
            });
            alert('Invoice marked as ready');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            alert('Failed to update invoice status');
        }
    }

    /**
     * Mark invoice as created
     */
    async function markInvoiceCreated(appointmentId) {
        if (!confirm('Mark this invoice as created?')) return;

        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'created',
                invoice_created_at: new Date().toISOString()
            });
            alert('Invoice marked as created');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            alert('Failed to update invoice status');
        }
    }

    /**
     * Mark invoice as sent
     */
    async function markInvoiceSent(appointmentId) {
        if (!confirm('Mark this invoice as sent?')) return;

        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'sent',
                invoice_sent_at: new Date().toISOString()
            });
            alert('Invoice marked as sent');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            alert('Failed to update invoice status');
        }
    }

    /**
     * Mark invoice as paid
     */
    async function markInvoicePaid(appointmentId) {
        if (!confirm('Mark this invoice as paid?')) return;

        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'paid',
                payment_received_at: new Date().toISOString()
            });
            alert('Invoice marked as paid');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            alert('Failed to update invoice status');
        }
    }

    /**
     * Mark driver as paid
     */
    async function markDriverPaid(driverId) {
        if (!confirm('Mark all appointments for this driver in this period as paid?')) return;

        try {
            // Get all unpaid appointments for this driver in the current period
            const unpaidAppts = allAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmenttime);
                return apt.operation_status === 'completed' &&
                       apt.driver_assigned === driverId &&
                       !apt.driver_paid_at &&
                       !apt.deleted_at &&
                       aptDate >= currentPayPeriod.start &&
                       aptDate <= currentPayPeriod.end;
            });

            const appointmentIds = unpaidAppts.map(apt => apt.id);

            await APIClient.post('/TEST-mark-driver-paid', {
                appointmentIds,
                driver_paid_at: new Date().toISOString()
            });

            alert(`Marked ${appointmentIds.length} appointments as paid for driver`);
            await loadAllData();
        } catch (error) {
            console.error('Error marking driver as paid:', error);
            alert('Failed to mark driver as paid');
        }
    }

    /**
     * Mark booking agent as paid
     */
    async function markAgentPaid(agentId) {
        if (!confirm('Mark all appointments for this booking agent in this period as paid?')) return;

        try {
            // Get all unpaid appointments for this agent in the current period
            const unpaidAppts = allAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmenttime);
                return apt.operation_status === 'completed' &&
                       apt.managed_by === agentId &&
                       !apt.booking_agent_paid_at &&
                       !apt.deleted_at &&
                       aptDate >= currentPayPeriod.start &&
                       aptDate <= currentPayPeriod.end;
            });

            const appointmentIds = unpaidAppts.map(apt => apt.id);

            await APIClient.post('/TEST-mark-agent-paid', {
                appointmentIds,
                booking_agent_paid_at: new Date().toISOString()
            });

            alert(`Marked ${appointmentIds.length} appointments as paid for booking agent`);
            await loadAllData();
        } catch (error) {
            console.error('Error marking agent as paid:', error);
            alert('Failed to mark agent as paid');
        }
    }

    // Export public API
    window.financeApp = {
        toggleExpandedRow,
        markInvoiceReady,
        markInvoiceCreated,
        markInvoiceSent,
        markInvoicePaid,
        markDriverPaid,
        markAgentPaid
    };

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', init);

})();
