/**
 * TEST Finance Dashboard v4 - Invoice Management
 * Features:
 * - Invoice grouping and lifecycle management (ready → created → sent → paid)
 * - QuickBooks Online sync status tracking
 * - Auto-grouping by client for invoice creation
 * - Comprehensive invoice actions (create, send, mark paid, void)
 *
 * TEST MODE - Uses Testing Branch Supabase database
 * Version: 4.0.0-TEST
 */

(function() {
    'use strict';

    console.log('[TEST Finance v4] Loading Finance Dashboard v4 - Invoice Management - 4.0.0-TEST');

    // =========================================================================
    // DATA CACHE (Performance Optimization)
    // =========================================================================
    class DataCache {
        constructor(prefix = 'rrts_finance_v4_') {
            this.prefix = prefix;
        }

        set(key, data, ttlMs = 5 * 60 * 1000) {
            const item = {
                data: data,
                expiry: Date.now() + ttlMs
            };
            try {
                localStorage.setItem(this.prefix + key, JSON.stringify(item));
            } catch (e) {
                console.warn('[Cache] localStorage full, clearing old items');
                this.clear();
            }
        }

        get(key) {
            try {
                const item = localStorage.getItem(this.prefix + key);
                if (!item) return null;

                const parsed = JSON.parse(item);
                if (Date.now() > parsed.expiry) {
                    this.remove(key);
                    return null;
                }
                return parsed.data;
            } catch (e) {
                return null;
            }
        }

        remove(key) {
            localStorage.removeItem(this.prefix + key);
        }

        clear() {
            Object.keys(localStorage)
                .filter(k => k.startsWith(this.prefix))
                .forEach(k => localStorage.removeItem(k));
        }
    }

    // =========================================================================
    // STATE
    // =========================================================================
    const cache = new DataCache();
    let currentUser = null;
    let currentPayPeriod = null;
    let allAppointments = [];
    let allInvoices = [];
    let drivers = [];
    let users = [];
    let clients = [];
    let selectedAppointmentsForInvoice = [];
    let invoiceConfig = null; // Invoice configuration from app_config

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    async function init() {
        console.log('[TEST Finance v4] Initializing...');

        try {
            // Get current user
            currentUser = await getCurrentUser();
            if (!currentUser) {
                console.error('[TEST Finance v4] No user found');
                window.location.href = '../login.html';
                return;
            }

            // Update UI with user info
            updateUserDisplay();

            // Calculate pay period
            calculatePayPeriod('previous');

            // Set up event listeners
            setupEventListeners();

            // Load all data in parallel
            await loadAllData();

            console.log('[TEST Finance v4] Initialization complete');

        } catch (error) {
            console.error('[TEST Finance v4] Initialization error:', error);
            showToast('Failed to initialize dashboard', 'error');
        }
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Pay period selector
        const payPeriodSelect = document.getElementById('payPeriodSelect');
        if (payPeriodSelect) {
            payPeriodSelect.addEventListener('change', handlePayPeriodChange);
        }

        // Create invoice modal confirm button
        const confirmBtn = document.getElementById('confirmCreateInvoice');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', handleCreateInvoice);
        }
    }

    /**
     * Update user display
     */
    function updateUserDisplay() {
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');

        if (userNameEl && currentUser) {
            const name = currentUser.fullName || currentUser.full_name || currentUser.username;
            userNameEl.textContent = name;

            if (userAvatarEl) {
                const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                userAvatarEl.textContent = initials;
            }
        }
    }

    /**
     * Calculate pay period based on selection
     */
    function calculatePayPeriod(period) {
        const today = new Date();
        const payPeriodStartDate = new Date('2025-10-26'); // Base date
        const payPeriodDays = 14;

        // Calculate days since base
        const daysSinceBase = Math.floor((today - payPeriodStartDate) / (1000 * 60 * 60 * 24));
        const currentPeriodNumber = Math.floor(daysSinceBase / payPeriodDays);

        let periodNumber;
        if (period === 'current') {
            periodNumber = currentPeriodNumber;
        } else if (period === 'previous') {
            periodNumber = currentPeriodNumber - 1;
        } else if (period === 'ytd') {
            // Year to date - from Jan 1 to today
            currentPayPeriod = {
                start: new Date(today.getFullYear(), 0, 1),
                end: today,
                label: 'Year to Date'
            };
            updateDateRangeDisplay();
            return;
        }

        // Calculate period start and end
        const start = new Date(payPeriodStartDate);
        start.setDate(start.getDate() + (periodNumber * payPeriodDays));

        const end = new Date(start);
        end.setDate(end.getDate() + payPeriodDays - 1);
        end.setHours(23, 59, 59, 999);

        currentPayPeriod = {
            start: start,
            end: end,
            label: period === 'current' ? 'Current Period' : 'Previous Period'
        };

        updateDateRangeDisplay();
    }

    /**
     * Update date range display
     */
    function updateDateRangeDisplay() {
        const displayEl = document.getElementById('dateRangeDisplay');
        if (displayEl && currentPayPeriod) {
            const startStr = currentPayPeriod.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = currentPayPeriod.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            displayEl.textContent = `${startStr} - ${endStr}`;
        }
    }

    /**
     * Handle pay period change
     */
    async function handlePayPeriodChange(e) {
        const value = e.target.value;
        const dropdown = e.target;

        dropdown.disabled = true;
        showToast('Updating data for selected period...', 'info');

        calculatePayPeriod(value);
        await loadAllData();

        dropdown.disabled = false;
    }

    // =========================================================================
    // DATA LOADING
    // =========================================================================
    async function loadAllData() {
        console.log('[TEST Finance v4] Loading all data...');

        try {
            // Load data individually to identify which endpoint fails
            console.log('[TEST Finance v4] Loading finance appointments...');
            let appointmentsResult = { appointments: [] };
            try {
                appointmentsResult = await APIClient.get('/TEST-get-finance-appointments');
                console.log('[TEST Finance v4] ✅ Appointments loaded');
            } catch (e) {
                console.error('[TEST Finance v4] ❌ Appointments failed:', e);
            }

            console.log('[TEST Finance v4] Loading invoices...');
            let invoicesResult = { invoices: [] };
            try {
                invoicesResult = await APIClient.get('/TEST-get-invoices');
                console.log('[TEST Finance v4] ✅ Invoices loaded');
            } catch (e) {
                console.error('[TEST Finance v4] ❌ Invoices failed:', e);
            }

            console.log('[TEST Finance v4] Loading drivers...');
            let driversResult = { drivers: [] };
            try {
                driversResult = await APIClient.get('/TEST-get-all-drivers');
                console.log('[TEST Finance v4] ✅ Drivers loaded');
            } catch (e) {
                console.error('[TEST Finance v4] ❌ Drivers failed:', e);
            }

            console.log('[TEST Finance v4] Loading users...');
            let usersResult = { users: [] };
            try {
                usersResult = await APIClient.get('/TEST-get-all-users');
                console.log('[TEST Finance v4] ✅ Users loaded');
            } catch (e) {
                console.error('[TEST Finance v4] ❌ Users failed:', e);
            }

            console.log('[TEST Finance v4] Loading clients...');
            let clientsResult = { clients: [] };
            try {
                clientsResult = await APIClient.get('/TEST-get-all-clients');
                console.log('[TEST Finance v4] ✅ Clients loaded');
            } catch (e) {
                console.error('[TEST Finance v4] ❌ Clients failed:', e);
            }

            console.log('[TEST Finance v4] Loading app config...');
            let configResult = { config: {} };
            try {
                configResult = await APIClient.get('/TEST-get-app-config');
                console.log('[TEST Finance v4] ✅ Config loaded');
            } catch (e) {
                console.error('[TEST Finance v4] ❌ Config failed:', e);
            }

            // Store data (handle both nested and flat response formats)
            allAppointments = appointmentsResult.data?.appointments || appointmentsResult.appointments || [];
            allInvoices = invoicesResult.data?.invoices || invoicesResult.invoices || [];
            drivers = driversResult.data?.drivers || driversResult.drivers || [];
            users = usersResult.data?.users || usersResult.users || [];
            clients = clientsResult.data?.clients || clientsResult.clients || [];
            invoiceConfig = configResult.data?.config || configResult.config || {};

            console.log('[TEST Finance v4] Data loaded:', {
                appointments: allAppointments.length,
                invoices: allInvoices.length,
                drivers: drivers.length,
                users: users.length,
                clients: clients.length,
                config: Object.keys(invoiceConfig).length
            });

            // Render all sections
            renderAllSections();

        } catch (error) {
            console.error('[TEST Finance v4] Error loading data:', error);
            showToast('Failed to load data', 'error');
        }
    }

    /**
     * Render all sections
     */
    function renderAllSections() {
        renderSummaryCards();
        renderPendingReview();
        renderReadyToInvoice();
        renderCreatedInvoices();
        renderSentInvoices();
        renderPaidInvoices();
    }

    // =========================================================================
    // PENDING REVIEW RENDERING (Human in the Loop)
    // =========================================================================
    function renderPendingReview() {
        const tbody = document.getElementById('pendingReviewTableBody');
        const loading = document.getElementById('pendingReviewLoading');
        const content = document.getElementById('pendingReviewContent');
        const bulkBtn = document.getElementById('bulkMarkReadyBtn');

        // Filter appointments: completed but NOT ready for invoicing
        const pendingAppts = allAppointments.filter(apt => {
            const opStatus = apt.operationStatus || apt.operation_status;
            const invStatus = apt.invoiceStatus || apt.invoice_status;
            const deleted = apt.deletedAt || apt.deleted_at;

            return opStatus === 'completed' && invStatus === 'not_ready' && !deleted;
        });

        console.log('[DEBUG] Pending review appointments found:', pendingAppts.length);
        document.getElementById('pendingReviewCount').textContent = pendingAppts.length;

        if (pendingAppts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><i class="bi bi-check-circle"></i><br>No appointments pending review</td></tr>';
            bulkBtn.style.display = 'none';
        } else {
            // Sort by date (newest first)
            const sortedAppts = pendingAppts.sort((a, b) => {
                const dateA = new Date(a.appointmentDateTime || a.appointmenttime);
                const dateB = new Date(b.appointmentDateTime || b.appointmenttime);
                return dateB - dateA;
            });

            tbody.innerHTML = sortedAppts.map(apt => {
                const aptDate = new Date(apt.appointmentDateTime || apt.appointmenttime);
                const dateStr = aptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = aptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                const clientName = `${apt.clientFirstName || ''} ${apt.clientLastName || ''}`.trim() || apt.knumber;
                const driverName = getDriverName(apt.driverAssigned);
                const agentName = getBookingAgentName(apt.managedBy);
                const rate = parseFloat(apt.customRate) || 0;

                return `
                    <tr data-appointment-id="${apt.id}">
                        <td>
                            <input type="checkbox" class="form-check-input pending-checkbox" data-id="${apt.id}" onchange="window.financeApp.updateBulkButtonVisibility()">
                        </td>
                        <td>
                            <div class="fw-bold">${dateStr}</div>
                            <div class="text-muted small">${timeStr}</div>
                        </td>
                        <td>
                            <div class="fw-bold">${apt.knumber}</div>
                            <div class="small">${clientName}</div>
                        </td>
                        <td>${apt.location || apt.locationName || 'N/A'}</td>
                        <td>
                            <span class="${apt.driverAssigned ? 'text-success' : 'text-danger'}">
                                <i class="bi bi-${apt.driverAssigned ? 'check-circle' : 'x-circle'}"></i>
                                ${driverName}
                            </span>
                        </td>
                        <td>
                            <span class="${apt.managedBy ? 'text-success' : 'text-muted'}">
                                ${agentName}
                            </span>
                        </td>
                        <td class="text-right fw-bold">${formatCurrency(rate)}</td>
                        <td class="text-center">
                            <button class="btn btn-success btn-sm" onclick="window.financeApp.markAppointmentReady('${apt.id}')" title="Mark as Ready for Invoicing">
                                <i class="bi bi-check-lg"></i> Ready
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Show/hide bulk button based on initial selection state
            updateBulkButtonVisibility();
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    /**
     * Get booking agent name from users array
     */
    function getBookingAgentName(managedById) {
        if (!managedById) return 'Not Assigned';
        const user = users.find(u => u.id === managedById);
        if (!user) return `Agent ${managedById}`;
        return user.full_name || user.fullName || user.username || `Agent ${managedById}`;
    }

    /**
     * Update bulk button visibility based on checkbox selection
     */
    function updateBulkButtonVisibility() {
        const checkboxes = document.querySelectorAll('.pending-checkbox:checked');
        const bulkBtn = document.getElementById('bulkMarkReadyBtn');
        if (bulkBtn) {
            bulkBtn.style.display = checkboxes.length > 0 ? 'inline-block' : 'none';
            if (checkboxes.length > 0) {
                bulkBtn.innerHTML = `<i class="bi bi-check2-all"></i> Mark ${checkboxes.length} Ready`;
            }
        }
    }

    /**
     * Toggle select all pending checkboxes
     */
    function toggleSelectAllPending(masterCheckbox) {
        const checkboxes = document.querySelectorAll('.pending-checkbox');
        checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
        updateBulkButtonVisibility();
    }

    /**
     * Mark a single appointment as ready for invoicing
     */
    async function markAppointmentReady(appointmentId) {
        try {
            showToast('Marking appointment as ready...', 'info');

            const response = await APIClient.post('/TEST-mark-appointment-ready', {
                appointmentIds: [appointmentId]
            });

            if (response.success) {
                showToast('Appointment marked as ready for invoicing', 'success');
                await loadAllData(); // Refresh data
            } else {
                showToast(response.message || 'Failed to update appointment', 'error');
            }
        } catch (error) {
            console.error('[TEST Finance v4] Error marking appointment ready:', error);
            showToast('Failed to update appointment', 'error');
        }
    }

    /**
     * Bulk mark selected appointments as ready for invoicing
     */
    async function bulkMarkReady() {
        const checkboxes = document.querySelectorAll('.pending-checkbox:checked');
        const appointmentIds = Array.from(checkboxes).map(cb => cb.dataset.id);

        if (appointmentIds.length === 0) {
            showToast('No appointments selected', 'error');
            return;
        }

        if (!confirm(`Mark ${appointmentIds.length} appointment(s) as ready for invoicing?`)) {
            return;
        }

        try {
            showToast(`Marking ${appointmentIds.length} appointments as ready...`, 'info');

            const response = await APIClient.post('/TEST-mark-appointment-ready', {
                appointmentIds: appointmentIds
            });

            if (response.success) {
                showToast(`${appointmentIds.length} appointment(s) marked as ready for invoicing`, 'success');
                await loadAllData(); // Refresh data
            } else {
                showToast(response.message || 'Failed to update appointments', 'error');
            }
        } catch (error) {
            console.error('[TEST Finance v4] Error bulk marking appointments ready:', error);
            showToast('Failed to update appointments', 'error');
        }
    }

    // =========================================================================
    // SUMMARY CARDS RENDERING
    // =========================================================================
    function renderSummaryCards() {
        // Filter period appointments
        const periodAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
            return apt.operationStatus === 'completed' &&
                   !apt.deletedAt &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Calculate totals
        let totalRevenue = 0;
        let totalDriverPayments = 0;
        let totalAgentCommissions = 0;

        periodAppointments.forEach(apt => {
            const invoiceAmount = parseFloat(apt.customRate) || 0;
            totalRevenue += invoiceAmount;

            // Driver pay (simplified - would need tier calculations from v3)
            if (apt.driverAssigned) {
                totalDriverPayments += invoiceAmount * 0.5; // Simplified
            }

            // Agent commission (5%)
            if (apt.managedBy) {
                totalAgentCommissions += invoiceAmount * 0.05;
            }
        });

        const netProfit = totalRevenue - totalDriverPayments - totalAgentCommissions;

        // Count invoices
        const invoicesPending = allInvoices.filter(inv => inv.invoiceStatus === 'created').length;
        const invoicesSent = allInvoices.filter(inv => inv.invoiceStatus === 'sent').length;

        // Update DOM
        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('totalDriverPayments').textContent = formatCurrency(totalDriverPayments);
        document.getElementById('totalAgentCommissions').textContent = formatCurrency(totalAgentCommissions);
        document.getElementById('netProfit').textContent = formatCurrency(netProfit);
        document.getElementById('invoicesPending').textContent = invoicesPending;
        document.getElementById('invoicesSent').textContent = invoicesSent;
    }

    // =========================================================================
    // READY TO INVOICE RENDERING
    // =========================================================================
    function renderReadyToInvoice() {
        const tbody = document.getElementById('readyInvoicesTableBody');
        const loading = document.getElementById('readyInvoicesLoading');
        const content = document.getElementById('readyInvoicesContent');

        // DEBUG: Log appointment status breakdown
        if (allAppointments.length > 0) {
            console.log('[DEBUG] First appointment sample:', allAppointments[0]);

            // Count by operationStatus
            const opStatusCounts = {};
            const invStatusCounts = {};
            allAppointments.forEach(apt => {
                const opStatus = apt.operationStatus || apt.operation_status || 'undefined';
                const invStatus = apt.invoiceStatus || apt.invoice_status || 'undefined';
                opStatusCounts[opStatus] = (opStatusCounts[opStatus] || 0) + 1;
                invStatusCounts[invStatus] = (invStatusCounts[invStatus] || 0) + 1;
            });
            console.log('[DEBUG] operationStatus breakdown:', opStatusCounts);
            console.log('[DEBUG] invoiceStatus breakdown:', invStatusCounts);
        }

        // Filter appointments: completed, ready status, not deleted
        // Handle both camelCase and snake_case field names
        const readyAppts = allAppointments.filter(apt => {
            const opStatus = apt.operationStatus || apt.operation_status;
            const invStatus = apt.invoiceStatus || apt.invoice_status;
            const deleted = apt.deletedAt || apt.deleted_at;

            return opStatus === 'completed' && invStatus === 'ready' && !deleted;
        });

        console.log('[DEBUG] Ready appointments found:', readyAppts.length);
        document.getElementById('readyCount').textContent = readyAppts.length;

        if (readyAppts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i><br>No appointments ready for invoicing</td></tr>';
        } else {
            // Group by client
            const groupedByClient = {};
            readyAppts.forEach(apt => {
                const clientKey = apt.knumber || 'Unknown';
                if (!groupedByClient[clientKey]) {
                    groupedByClient[clientKey] = {
                        knumber: clientKey,
                        clientName: `${apt.clientFirstName || ''} ${apt.clientLastName || ''}`.trim() || 'Unknown Client',
                        appointments: []
                    };
                }
                groupedByClient[clientKey].appointments.push(apt);
            });

            // Sort clients by K-number
            const clients = Object.values(groupedByClient).sort((a, b) =>
                a.knumber.localeCompare(b.knumber)
            );

            tbody.innerHTML = clients.map((client, idx) => {
                // Sort appointments by date
                const sortedAppts = client.appointments.sort((a, b) => {
                    const dateA = new Date(a.appointmenttime || a.appointmentDateTime);
                    const dateB = new Date(b.appointmenttime || b.appointmentDateTime);
                    return dateA - dateB;
                });

                let subtotal = 0;
                sortedAppts.forEach(apt => subtotal += parseFloat(apt.customRate) || 0);
                const totalWithHST = subtotal * 1.14;

                const appointmentIds = sortedAppts.map(a => a.id);
                const expandId = `ready-client-${idx}`;

                // Build appointment detail rows
                const appointmentRows = sortedAppts.map(apt => {
                    const aptDate = new Date(apt.appointmentDateTime || apt.appointmenttime);
                    const dateStr = aptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const timeStr = aptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    const driverName = getDriverName(apt.driverAssigned);
                    const rate = parseFloat(apt.customRate) || 0;

                    return `
                        <tr class="client-appointment-row expandable-row" data-expand="${expandId}">
                            <td></td>
                            <td class="ps-4">
                                <small class="text-muted">${dateStr} @ ${timeStr}</small>
                            </td>
                            <td>${apt.location || apt.locationName || 'N/A'}</td>
                            <td class="text-right">${formatCurrency(rate)}</td>
                            <td class="text-right text-muted small">${driverName}</td>
                            <td></td>
                        </tr>
                    `;
                }).join('');

                return `
                    <tr class="client-group-header" onclick="window.financeApp.toggleClientExpand('${expandId}', this)" style="cursor: pointer;">
                        <td>
                            <i class="bi bi-chevron-right expand-icon" id="icon-${expandId}"></i>
                        </td>
                        <td>
                            <strong><i class="bi bi-person-circle"></i> ${client.knumber} - ${client.clientName}</strong>
                        </td>
                        <td>${sortedAppts.length} appointment${sortedAppts.length > 1 ? 's' : ''}</td>
                        <td class="text-right"><strong>${formatCurrency(subtotal)}</strong></td>
                        <td class="text-right">
                            <div><strong>${formatCurrency(totalWithHST)}</strong></div>
                            <div class="text-muted" style="font-size: 0.85rem;">14% HST</div>
                        </td>
                        <td class="text-center" onclick="event.stopPropagation()">
                            <button class="btn btn-primary btn-sm" onclick="window.financeApp.openCreateInvoiceModal('${client.knumber}', ${JSON.stringify(appointmentIds).replace(/"/g, '&quot;')})">
                                <i class="bi bi-file-earmark-plus"></i> Create Invoice
                            </button>
                        </td>
                    </tr>
                    ${appointmentRows}
                `;
            }).join('');
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    // =========================================================================
    // CREATED INVOICES RENDERING
    // =========================================================================
    function renderCreatedInvoices() {
        const tbody = document.getElementById('createdInvoicesTableBody');
        const loading = document.getElementById('createdInvoicesLoading');
        const content = document.getElementById('createdInvoicesContent');

        const createdInvoices = allInvoices.filter(inv => inv.invoiceStatus === 'created');
        document.getElementById('createdCount').textContent = createdInvoices.length;

        if (createdInvoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i><br>No created invoices</td></tr>';
        } else {
            tbody.innerHTML = createdInvoices.map(invoice => {
                const client = clients.find(c => c.knumber === invoice.knumber);
                const clientName = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : invoice.knumber;

                return `
                    <tr class="invoice-group-header" onclick="window.financeApp.toggleInvoiceDetails('created-${invoice.id}', this)">
                        <td class="invoice-number">${invoice.invoiceNumber}</td>
                        <td>${invoice.knumber} - ${clientName}</td>
                        <td>${new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                        <td class="text-right">
                            <div>${formatCurrency(invoice.invoiceSubtotal)}</div>
                            <div class="text-muted" style="font-size: 0.85rem;">With HST: ${formatCurrency(invoice.invoiceTotal)}</div>
                        </td>
                        <td class="text-center">
                            ${getQBOStatusBadge(invoice.qboSyncStatus)}
                        </td>
                        <td class="text-center" onclick="event.stopPropagation()">
                            <button class="btn btn-primary btn-sm" onclick="window.financeApp.markInvoiceSent('${invoice.id}')">
                                <i class="bi bi-send"></i> Send
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="window.financeApp.voidInvoice('${invoice.id}')">
                                <i class="bi bi-x-circle"></i> Void
                            </button>
                        </td>
                    </tr>
                    <tr class="expandable-row" id="created-${invoice.id}">
                        <td colspan="6">
                            <div class="p-3">
                                <strong>Invoice Details:</strong>
                                <p>Appointments: ${invoice.appointmentCount || 0} | Created: ${new Date(invoice.invoiceCreatedAt).toLocaleString()}</p>
                                ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    // =========================================================================
    // SENT INVOICES RENDERING
    // =========================================================================
    function renderSentInvoices() {
        const tbody = document.getElementById('sentInvoicesTableBody');
        const loading = document.getElementById('sentInvoicesLoading');
        const content = document.getElementById('sentInvoicesContent');

        const sentInvoices = allInvoices.filter(inv => inv.invoiceStatus === 'sent');
        document.getElementById('sentCount').textContent = sentInvoices.length;

        if (sentInvoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="bi bi-inbox"></i><br>No sent invoices</td></tr>';
        } else {
            tbody.innerHTML = sentInvoices.map(invoice => {
                const client = clients.find(c => c.knumber === invoice.knumber);
                const clientName = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : invoice.knumber;

                return `
                    <tr>
                        <td class="invoice-number">${invoice.invoiceNumber}</td>
                        <td>${invoice.knumber} - ${clientName}</td>
                        <td>${new Date(invoice.invoiceSentAt).toLocaleDateString()}</td>
                        <td class="text-right">
                            <div>${formatCurrency(invoice.invoiceSubtotal)}</div>
                            <div class="text-muted" style="font-size: 0.85rem;">With HST: ${formatCurrency(invoice.invoiceTotal)}</div>
                        </td>
                        <td class="text-center">
                            <button class="btn btn-success btn-sm" onclick="window.financeApp.markInvoicePaid('${invoice.id}')">
                                <i class="bi bi-cash-coin"></i> Mark Paid
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="window.financeApp.voidInvoice('${invoice.id}')">
                                <i class="bi bi-x-circle"></i> Void
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    // =========================================================================
    // PAID INVOICES RENDERING
    // =========================================================================
    function renderPaidInvoices() {
        const tbody = document.getElementById('paidInvoicesTableBody');
        const loading = document.getElementById('paidInvoicesLoading');
        const content = document.getElementById('paidInvoicesContent');

        const paidInvoices = allInvoices.filter(inv => inv.invoiceStatus === 'paid');
        document.getElementById('paidCount').textContent = paidInvoices.length;

        if (paidInvoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="bi bi-inbox"></i><br>No paid invoices</td></tr>';
        } else {
            tbody.innerHTML = paidInvoices.map(invoice => {
                const client = clients.find(c => c.knumber === invoice.knumber);
                const clientName = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : invoice.knumber;

                return `
                    <tr>
                        <td class="invoice-number">${invoice.invoiceNumber}</td>
                        <td>${invoice.knumber} - ${clientName}</td>
                        <td>${new Date(invoice.paymentReceivedAt).toLocaleDateString()}</td>
                        <td class="text-right">
                            <div>${formatCurrency(invoice.invoiceSubtotal)}</div>
                            <div class="text-muted" style="font-size: 0.85rem;">With HST: ${formatCurrency(invoice.invoiceTotal)}</div>
                        </td>
                        <td class="text-center">
                            <span class="badge-paid">Paid</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    // =========================================================================
    // INVOICE ACTIONS
    // =========================================================================

    /**
     * Format invoice line item with exact format from config
     * Format: K[knumber] [Client Name]
     *         DD-MM-YYYY - Round trip from Client's home to [Clinic] to see Jamie Sweetland, NP, for ketamine treatment (Depression)
     */
    function formatInvoiceLineItem(appointment, client) {
        // Get client name (handle both field name formats)
        const clientFirstName = client.firstname || client.first_name || '';
        const clientLastName = client.lastname || client.last_name || '';

        // Get appointment date (handle both field name formats)
        const aptDateTime = appointment.appointmentDateTime || appointment.appointmenttime;

        // Get location (handle both field name formats)
        const locationName = appointment.location || appointment.locationname || 'Unknown Clinic';

        if (!invoiceConfig || !invoiceConfig.invoice_line_format) {
            // Fallback if config not loaded
            return {
                line1: `${appointment.knumber} ${clientFirstName} ${clientLastName}`,
                line2: `${new Date(aptDateTime).toLocaleDateString()} - ${locationName}`,
                amount: appointment.customRate
            };
        }

        // Format date as DD-MM-YYYY (matching user's example: 14-11-2025)
        const date = new Date(aptDateTime);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}-${month}-${year}`;

        // Replace {clinic} placeholder with actual clinic name
        const description = invoiceConfig.invoice_line_format.replace('{clinic}', locationName);

        return {
            line1: `${appointment.knumber} ${clientFirstName} ${clientLastName}`,
            line2: `${formattedDate} - ${description}`,
            amount: appointment.customRate
        };
    }

    /**
     * Open create invoice modal
     */
    function openCreateInvoiceModal(knumber, appointmentIds) {
        console.log('[TEST Finance v4] Opening create invoice modal for:', knumber, appointmentIds);

        // Get client details
        const client = clients.find(c => c.knumber === knumber);
        if (!client) {
            showToast('Client not found', 'error');
            return;
        }

        // Get appointments
        const appointments = allAppointments.filter(apt => appointmentIds.includes(apt.id));

        // Store selected appointments
        selectedAppointmentsForInvoice = appointments;

        // Populate modal
        const clientNameEl = document.getElementById('invoiceClientName');
        const invoiceDateEl = document.getElementById('invoiceDate');
        const appointmentsListEl = document.getElementById('invoiceAppointmentsList');

        const clientFirstName = client.firstname || client.first_name || '';
        const clientLastName = client.lastname || client.last_name || '';
        clientNameEl.value = `${knumber} - ${clientFirstName} ${clientLastName}`;

        // Set today's date
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        invoiceDateEl.value = dateStr;

        // List appointments with exact invoice format
        let subtotal = 0;
        appointmentsListEl.innerHTML = appointments.map(apt => {
            const amount = parseFloat(apt.customRate) || 0;
            subtotal += amount;

            // Format line item exactly as it will appear on invoice
            const lineItem = formatInvoiceLineItem(apt, client);

            return `
                <div class="invoice-line-item-preview mb-3 p-3 border rounded">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="fw-bold text-primary">${lineItem.line1}</div>
                            <div class="text-muted small mt-1">${lineItem.line2}</div>
                        </div>
                        <div class="fw-bold text-end ms-3">${formatCurrency(amount)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Update totals
        const tax = subtotal * 0.14;
        const total = subtotal + tax;

        document.getElementById('invoiceSubtotal').textContent = formatCurrency(subtotal);
        document.getElementById('invoiceTax').textContent = formatCurrency(tax);
        document.getElementById('invoiceTotal').textContent = formatCurrency(total);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('createInvoiceModal'));
        modal.show();
    }

    /**
     * Handle create invoice
     */
    async function handleCreateInvoice() {
        const invoiceDateEl = document.getElementById('invoiceDate');
        const invoiceNotesEl = document.getElementById('invoiceNotes');

        const invoiceDate = invoiceDateEl.value;
        const notes = invoiceNotesEl.value;

        if (!invoiceDate) {
            showToast('Please select an invoice date', 'error');
            return;
        }

        if (selectedAppointmentsForInvoice.length === 0) {
            showToast('No appointments selected', 'error');
            return;
        }

        const appointmentIds = selectedAppointmentsForInvoice.map(apt => apt.id);

        try {
            showToast('Creating invoice...', 'info');

            const response = await APIClient.post('/TEST-create-invoice', {
                appointmentIds: appointmentIds,
                invoiceDate: invoiceDate,
                notes: notes
            });

            if (response.success) {
                showToast('Invoice created successfully!', 'success');

                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal'));
                modal.hide();

                // Reload data
                await loadAllData();
            } else {
                showToast(response.message || 'Failed to create invoice', 'error');
            }
        } catch (error) {
            console.error('[TEST Finance v4] Error creating invoice:', error);
            showToast('Failed to create invoice', 'error');
        }
    }

    /**
     * Mark invoice as sent
     */
    async function markInvoiceSent(invoiceId) {
        if (!confirm('Mark this invoice as sent?')) return;

        try {
            const sentAt = new Date().toISOString();

            const response = await APIClient.post('/TEST-update-invoice-status-v2', {
                invoiceId: invoiceId,
                status: 'sent',
                sentAt: sentAt
            });

            if (response.success) {
                showToast('Invoice marked as sent', 'success');
                await loadAllData();
            } else {
                showToast(response.message || 'Failed to update invoice', 'error');
            }
        } catch (error) {
            console.error('[TEST Finance v4] Error updating invoice:', error);
            showToast('Failed to update invoice', 'error');
        }
    }

    /**
     * Mark invoice as paid
     */
    async function markInvoicePaid(invoiceId) {
        if (!confirm('Mark this invoice as paid?')) return;

        try {
            const paidAt = new Date().toISOString();

            const response = await APIClient.post('/TEST-update-invoice-status-v2', {
                invoiceId: invoiceId,
                status: 'paid',
                paidAt: paidAt
            });

            if (response.success) {
                showToast('Invoice marked as paid', 'success');
                await loadAllData();
            } else {
                showToast(response.message || 'Failed to update invoice', 'error');
            }
        } catch (error) {
            console.error('[TEST Finance v4] Error updating invoice:', error);
            showToast('Failed to update invoice', 'error');
        }
    }

    /**
     * Void invoice
     */
    async function voidInvoice(invoiceId) {
        const reason = prompt('Enter reason for voiding this invoice (optional):');
        if (reason === null) return; // User cancelled

        try {
            const response = await APIClient.post('/TEST-void-invoice', {
                invoiceId: invoiceId,
                reason: reason || 'Voided by user'
            });

            if (response.success) {
                showToast('Invoice voided successfully', 'success');
                await loadAllData();
            } else {
                showToast(response.message || 'Failed to void invoice', 'error');
            }
        } catch (error) {
            console.error('[TEST Finance v4] Error voiding invoice:', error);
            showToast('Failed to void invoice', 'error');
        }
    }

    /**
     * Toggle invoice details
     */
    function toggleInvoiceDetails(rowId, clickedRow) {
        const detailRow = document.getElementById(rowId);
        if (detailRow) {
            detailRow.classList.toggle('show');
        }
    }

    /**
     * Toggle client expand in Ready to Invoice section
     */
    function toggleClientExpand(expandId, headerRow) {
        const rows = document.querySelectorAll(`tr[data-expand="${expandId}"]`);
        const icon = document.getElementById(`icon-${expandId}`);

        rows.forEach(row => {
            row.classList.toggle('expanded');
        });

        if (icon) {
            icon.classList.toggle('bi-chevron-right');
            icon.classList.toggle('bi-chevron-down');
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Get QBO status badge HTML
     */
    function getQBOStatusBadge(status) {
        const badges = {
            'pending': '<span class="qbo-badge qbo-pending"><i class="bi bi-clock"></i> Pending Sync</span>',
            'synced': '<span class="qbo-badge qbo-synced"><i class="bi bi-check-circle"></i> Synced</span>',
            'error': '<span class="qbo-badge qbo-error"><i class="bi bi-exclamation-triangle"></i> Sync Error</span>',
            'disabled': '<span class="qbo-badge qbo-disabled">Manual Only</span>'
        };
        return badges[status] || badges['disabled'];
    }

    /**
     * Get driver name
     */
    function getDriverName(driverId) {
        if (!driverId) return 'Unassigned';
        const driver = drivers.find(d => d.id === driverId);
        if (!driver) return `Driver ${driverId}`;
        return driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || `Driver ${driverId}`;
    }

    /**
     * Format currency
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-CA', {
            style: 'currency',
            currency: 'CAD'
        }).format(amount || 0);
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toastId = `toast-${Date.now()}`;
        const bgClass = type === 'error' ? 'bg-danger' : type === 'success' ? 'bg-success' : 'bg-primary';

        const toastHtml = `
            <div id="${toastId}" class="toast ${bgClass} text-white" role="alert">
                <div class="toast-body d-flex justify-content-between align-items-center">
                    ${message}
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', toastHtml);
        const toastEl = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
        toast.show();

        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    }

    // =========================================================================
    // LOGOUT
    // =========================================================================
    window.handleLogout = function() {
        logout();
    };

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    window.financeApp = {
        // Pending Review functions
        markAppointmentReady,
        bulkMarkReady,
        toggleSelectAllPending,
        updateBulkButtonVisibility,
        // Ready to Invoice functions
        toggleClientExpand,
        // Invoice functions
        openCreateInvoiceModal,
        markInvoiceSent,
        markInvoicePaid,
        voidInvoice,
        toggleInvoiceDetails
    };

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', init);

})();
