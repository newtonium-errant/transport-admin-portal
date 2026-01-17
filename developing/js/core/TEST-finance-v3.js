/**
 * TEST Finance Dashboard v3 - Comprehensive Controller
 * Combines ALL features from v1 and v2:
 * - Invoice workflow management (ready → created → sent → paid)
 * - Booking agent commissions (5%)
 * - Tiered driver pay (Tier 1/2/3)
 * - CRA-compliant mileage (under/over 5000km rates)
 * - YTD mileage tracking per driver
 * - Expandable trip details
 *
 * TEST MODE - Uses Testing Branch Supabase database
 * Version: 3.0.0-TEST
 */

(function() {
    'use strict';

    console.log('[TEST Finance v3] Loading Finance Dashboard v3 - Comprehensive - 3.0.0-TEST');

    // =========================================================================
    // DATA CACHE (Performance Optimization)
    // =========================================================================
    class DataCache {
        constructor(prefix = 'rrts_finance_v3_') {
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
    let drivers = [];
    let users = [];
    let appConfig = {};
    let invoiceViewMode = 'client'; // 'date' or 'client' - default to client view

    // Default config values (overridden by app_config)
    const DEFAULT_CONFIG = {
        cra_mileage_rate_under_5000: 0.72,
        cra_mileage_rate_over_5000: 0.66,
        cra_mileage_threshold: 5000,
        pay_tier_1_hourly: 112.50,
        pay_tier_1_percentage: 0.50,
        pay_tier_2_hourly: 75.00,
        pay_tier_2_percentage: 0.33,
        pay_tier_3_hourly: 56.25,
        pay_tier_3_percentage: 0.25,
        pay_period_start_date: '2025-10-26',
        pay_period_days: 14,
        agent_commission_percentage: 0.05  // 5% for booking agents
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    async function init() {
        console.log('[TEST Finance v3] Initializing...');

        // RBAC Check - Admin and Supervisor only
        await requireAuth('TEST-dashboard.html');

        currentUser = getCurrentUser();
        if (!currentUser) {
            alert('Authentication error. Please log in again.');
            window.location.href = 'TEST-dashboard.html';
            return;
        }

        // Check role access
        if (!hasPageAccess(currentUser.role, 'finance')) {
            alert('Access denied. Finance dashboard is for Admin and Supervisor roles only.');
            window.location.href = 'TEST-dashboard.html';
            return;
        }

        // Update header
        updateUserDisplay();

        // Load app config first
        await loadAppConfig();

        // Default to previous pay period (most recent complete period)
        currentPayPeriod = getPreviousPayPeriod();
        updateDateRangeDisplay();

        // Load data
        await loadAllData();

        // Setup event listeners
        document.getElementById('payPeriodSelect').addEventListener('change', handlePayPeriodChange);

        console.log('[TEST Finance v3] Initialization complete');
    }

    // =========================================================================
    // USER DISPLAY
    // =========================================================================
    function updateUserDisplay() {
        const userName = currentUser.fullName || currentUser.full_name || currentUser.username;
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        document.getElementById('userName').textContent = userName;
        document.getElementById('userAvatar').textContent = initials;
        document.getElementById('userRole').textContent = currentUser.role;
    }

    // =========================================================================
    // APP CONFIG LOADING
    // =========================================================================
    async function loadAppConfig() {
        try {
            // Try cache first
            const cachedConfig = cache.get('appConfig');
            if (cachedConfig) {
                appConfig = cachedConfig;
                updateCRADisplay();
                return;
            }

            // Fetch from API
            const response = await APIClient.get('/TEST-get-app-config');
            const configArray = response.data || response || [];

            // Convert array to object
            appConfig = { ...DEFAULT_CONFIG };
            configArray.forEach(item => {
                const value = parseFloat(item.config_value);
                appConfig[item.config_key] = isNaN(value) ? item.config_value : value;
            });

            // Cache for 10 minutes
            cache.set('appConfig', appConfig, 10 * 60 * 1000);
            updateCRADisplay();

        } catch (error) {
            console.warn('[TEST Finance v3] Failed to load app config, using defaults:', error);
            appConfig = { ...DEFAULT_CONFIG };
            updateCRADisplay();
        }
    }

    function updateCRADisplay() {
        document.getElementById('craRateUnder').textContent =
            `$${appConfig.cra_mileage_rate_under_5000.toFixed(2)}/km`;
        document.getElementById('craRateOver').textContent =
            `$${appConfig.cra_mileage_rate_over_5000.toFixed(2)}/km`;
        document.getElementById('craThreshold').textContent =
            `${appConfig.cra_mileage_threshold.toLocaleString()} km`;
    }

    // =========================================================================
    // PAY PERIOD MANAGEMENT (Timezone-aware)
    // =========================================================================

    /**
     * Parse date string as local midnight (not UTC)
     * This prevents timezone shifts in pay period calculations
     */
    function parseLocalDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day, 0, 0, 0, 0); // month is 0-indexed
    }

    function getCurrentPayPeriod() {
        const startDate = parseLocalDate(appConfig.pay_period_start_date || '2025-10-26');
        const periodDays = appConfig.pay_period_days || 14;
        const today = new Date();

        const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
        const periodsElapsed = Math.floor(daysSinceStart / periodDays);

        const periodStart = new Date(startDate);
        periodStart.setDate(periodStart.getDate() + (periodsElapsed * periodDays));

        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + periodDays - 1);
        periodEnd.setHours(23, 59, 59, 999);

        return { start: periodStart, end: periodEnd };
    }

    function getPreviousPayPeriod() {
        const periodDays = appConfig.pay_period_days || 14;
        const current = getCurrentPayPeriod();

        const prevStart = new Date(current.start);
        prevStart.setDate(prevStart.getDate() - periodDays);

        const prevEnd = new Date(prevStart);
        prevEnd.setDate(prevEnd.getDate() + periodDays - 1);
        prevEnd.setHours(23, 59, 59, 999);

        return { start: prevStart, end: prevEnd };
    }

    function getYearToDatePeriod() {
        const year = new Date().getFullYear();
        return {
            start: parseLocalDate(`${year}-01-01`),
            end: new Date()
        };
    }

    function updateDateRangeDisplay() {
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        const startStr = currentPayPeriod.start.toLocaleDateString('en-US', options);
        const endStr = currentPayPeriod.end.toLocaleDateString('en-US', options);
        document.getElementById('dateRangeDisplay').textContent = `${startStr} - ${endStr}`;
    }

    async function handlePayPeriodChange(e) {
        const value = e.target.value;
        const dropdown = e.target;

        // Disable dropdown during loading
        dropdown.disabled = true;

        if (value === 'current') {
            currentPayPeriod = getCurrentPayPeriod();
        } else if (value === 'previous') {
            currentPayPeriod = getPreviousPayPeriod();
        } else if (value === 'ytd') {
            currentPayPeriod = getYearToDatePeriod();
        }

        updateDateRangeDisplay();
        await loadAllData();

        // Re-enable dropdown after loading
        dropdown.disabled = false;
    }

    // =========================================================================
    // DATA LOADING
    // =========================================================================
    async function loadAllData() {
        try {
            showLoading(true);

            // Load appointments, drivers, and users in parallel
            const [appointmentsData, driversData, usersData] = await Promise.all([
                APIClient.get('/TEST-get-historic-appointments'),
                APIClient.get('/TEST-get-all-drivers'),
                APIClient.get('/TEST-get-all-users').catch(() => ({ data: [] })) // Optional
            ]);

            allAppointments = appointmentsData.data || appointmentsData.appointments || appointmentsData || [];
            drivers = driversData.drivers || driversData.data || driversData || [];
            users = usersData.data || usersData.users || usersData || [];

            console.log(`[TEST Finance v3] Loaded ${allAppointments.length} appointments, ${drivers.length} drivers, ${users.length} users`);

            // Render all sections
            renderReadyForInvoicing();
            renderNotReadyVerification();
            renderDriverPayroll();
            renderAgentStats();
            renderSummaryCards();

            showLoading(false);

        } catch (error) {
            console.error('[TEST Finance v3] Error loading data:', error);
            showLoading(false);
            showToast('Failed to load finance data. Please refresh.', 'error');
        }
    }

    function showLoading(isLoading) {
        // Driver table skeleton
        document.getElementById('driverTableSkeleton').style.display = isLoading ? 'block' : 'none';
        document.getElementById('driverTable').style.display = isLoading ? 'none' : 'table';

        // Add loading overlay to sections that update
        const sectionsToUpdate = [
            document.querySelector('.summary-cards'),
            document.getElementById('agentStatsContent'),
            document.getElementById('driverPayrollSection')
        ];

        sectionsToUpdate.forEach(section => {
            if (section) {
                if (isLoading) {
                    section.style.opacity = '0.5';
                    section.style.pointerEvents = 'none';
                } else {
                    section.style.opacity = '1';
                    section.style.pointerEvents = 'auto';
                }
            }
        });

        // Show loading toast
        if (isLoading) {
            showToast('Updating data for selected period...', 'info');
        }
    }

    // =========================================================================
    // CALCULATION HELPERS (Tiered Pay + CRA Mileage)
    // =========================================================================

    /**
     * Get driver's YTD mileage up to (but not including) a specific date
     */
    function getDriverYTDMileageUpTo(driverId, upToDate) {
        const driver = drivers.find(d => d.id === driverId);
        if (!driver || !driver.mileage_ytd) return 0;

        const year = upToDate.getFullYear().toString();
        const yearData = driver.mileage_ytd[year];
        if (!yearData) return 0;

        // Sum months up to the appointment month
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const upToMonth = upToDate.getMonth(); // 0-indexed

        let ytdMileage = 0;
        for (let i = 0; i < upToMonth; i++) {
            ytdMileage += yearData[months[i]] || 0;
        }

        return ytdMileage;
    }

    /**
     * Calculate mileage reimbursement with CRA tiered rates
     */
    function calculateMileageReimbursement(driverMileage, ytdBefore) {
        const threshold = appConfig.cra_mileage_threshold;
        const rateUnder = appConfig.cra_mileage_rate_under_5000;
        const rateOver = appConfig.cra_mileage_rate_over_5000;

        // How much of the threshold is remaining?
        const remainingUnderThreshold = Math.max(0, threshold - ytdBefore);

        // Split mileage between under and over threshold
        const kmUnder = Math.min(driverMileage, remainingUnderThreshold);
        const kmOver = Math.max(0, driverMileage - kmUnder);

        const reimbursement = (kmUnder * rateUnder) + (kmOver * rateOver);

        return {
            kmUnder,
            kmOver,
            reimbursement
        };
    }

    /**
     * Get tier configuration for a driver
     */
    function getTierConfig(payTier) {
        const tier = payTier || 2; // Default to tier 2
        return {
            hourlyRate: appConfig[`pay_tier_${tier}_hourly`] || 75,
            percentage: appConfig[`pay_tier_${tier}_percentage`] || 0.33,
            label: `Tier ${tier}`
        };
    }

    /**
     * Determine trip type and billed hours
     */
    function getTripType(appointment) {
        const customRate = parseFloat(appointment.customRate) || 0;

        // One-way trips have custom_rate of 250
        if (customRate === 250) {
            return { type: 'One-Way', billedHours: 1, badge: 'trip-oneway' };
        }

        // Calculate actual hours if times available
        if (appointment.pickuptime && appointment.dropOffTime) {
            const pickup = new Date(appointment.pickuptime);
            const dropoff = new Date(appointment.dropOffTime);
            const actualHours = (dropoff - pickup) / (1000 * 60 * 60);

            if (actualHours > 4) {
                return {
                    type: 'Overtime',
                    billedHours: Math.round(actualHours * 10) / 10,
                    badge: 'trip-overtime'
                };
            }
        }

        // Standard 4-hour trip
        return { type: 'Standard', billedHours: 4, badge: 'trip-standard' };
    }

    /**
     * Calculate payroll for a single appointment (with tiered pay)
     */
    function calculateAppointmentPayroll(appointment, driver, ytdBefore) {
        const tierConfig = getTierConfig(driver.pay_tier);
        const tripType = getTripType(appointment);

        // Driver mileage (use stored value or estimate)
        const driverMileage = parseFloat(appointment.driverMileage) ||
                              (parseFloat(appointment.tripdistance) / 1000) || 0; // Convert metres to km

        // Calculate mileage reimbursement
        const mileageCalc = calculateMileageReimbursement(driverMileage, ytdBefore);

        // Total pay = invoice × tier percentage
        const invoiceAmount = parseFloat(appointment.customRate) || 0;
        const totalPay = invoiceAmount * tierConfig.percentage;

        // Hours to pay = (total pay - mileage reimbursement) / hourly rate
        const hoursToPay = Math.max(0, (totalPay - mileageCalc.reimbursement) / tierConfig.hourlyRate);

        return {
            invoiceAmount,
            totalPay,
            driverMileage,
            mileageReimbursement: mileageCalc.reimbursement,
            kmUnder: mileageCalc.kmUnder,
            kmOver: mileageCalc.kmOver,
            hoursToPay: Math.round(hoursToPay * 100) / 100,
            tripType: tripType.type,
            billedHours: tripType.billedHours,
            tripBadge: tripType.badge,
            tierConfig
        };
    }

    /**
     * Calculate driver payment (33% flat for v1 compatibility)
     */
    function calculateDriverPayment(customRate) {
        return (parseFloat(customRate) || 0) * 0.33;
    }

    /**
     * Calculate agent commission (5%)
     */
    function calculateAgentCommission(customRate) {
        return (parseFloat(customRate) || 0) * (appConfig.agent_commission_percentage || 0.05);
    }

    /**
     * Calculate hours from pickup/dropoff times
     */
    function calculateHours(appointment) {
        if (!appointment.pickuptime || !appointment.dropOffTime) {
            return 4; // Default
        }
        const pickup = new Date(appointment.pickuptime);
        const dropoff = new Date(appointment.dropOffTime);
        const hours = (dropoff - pickup) / (1000 * 60 * 60);
        return Math.round(hours * 10) / 10;
    }

    // =========================================================================
    // INVOICE MANAGEMENT RENDERING (v1 features)
    // =========================================================================

    /**
     * Render Ready for Invoicing table
     */
    function renderReadyForInvoicing() {
        const tbody = document.getElementById('readyInvoicesTableBody');
        const loading = document.getElementById('readyInvoicesLoading');
        const content = document.getElementById('readyInvoicesContent');

        // Filter appointments: completed, ready/created/sent status, not deleted
        const filteredAppts = allAppointments.filter(apt =>
            apt.operationStatus === 'completed' &&
            ['ready', 'created', 'sent'].includes(apt.invoiceStatus) &&
            !apt.deletedAt
        );

        document.getElementById('readyCount').textContent = filteredAppts.length;

        if (filteredAppts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i><br>No invoices ready</td></tr>';
        } else if (invoiceViewMode === 'date') {
            // BY DATE VIEW - Traditional list sorted by date
            const sortedAppts = [...filteredAppts].sort((a, b) => {
                const dateA = new Date(a.appointmenttime || a.appointmentDateTime);
                const dateB = new Date(b.appointmenttime || b.appointmentDateTime);
                return dateA - dateB;
            });

            let totalAmount = 0;
            tbody.innerHTML = sortedAppts.map(apt => {
                totalAmount += parseFloat(apt.customRate) || 0;
                const clientName = `${apt.knumber || ''} ${apt.clientFirstName || ''} ${apt.clientLastName || ''}`.trim();
                return `
                    <tr>
                        <td>${new Date(apt.appointmenttime || apt.appointmentDateTime).toLocaleDateString()}</td>
                        <td>${clientName}</td>
                        <td>${getDriverName(apt.driverAssigned)}</td>
                        <td class="text-right">${formatCurrency(apt.customRate)}</td>
                        <td><span class="badge-${apt.invoiceStatus}">${apt.invoiceStatus || 'ready'}</span></td>
                        <td class="text-center">
                            ${getInvoiceActions(apt)}
                        </td>
                    </tr>
                `;
            }).join('');

            // Add total row
            tbody.innerHTML += `
                <tr class="total-row">
                    <td colspan="3">Total</td>
                    <td class="text-right">${formatCurrency(totalAmount)}</td>
                    <td colspan="2"></td>
                </tr>
            `;
        } else {
            // BY CLIENT VIEW - Grouped by client
            const groupedByClient = {};
            filteredAppts.forEach(apt => {
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

            let grandTotal = 0;
            tbody.innerHTML = clients.map(client => {
                // Sort appointments within client by date
                const sortedAppts = client.appointments.sort((a, b) => {
                    const dateA = new Date(a.appointmenttime || a.appointmentDateTime);
                    const dateB = new Date(b.appointmenttime || b.appointmentDateTime);
                    return dateA - dateB;
                });

                let clientTotal = 0;
                sortedAppts.forEach(apt => clientTotal += parseFloat(apt.customRate) || 0);
                const clientTotalWithHST = clientTotal * 1.14; // 14% HST
                grandTotal += clientTotal;

                // Determine most common status for bulk action
                const statuses = sortedAppts.map(a => a.invoiceStatus);
                const mostCommonStatus = statuses.sort((a,b) =>
                    statuses.filter(v => v === a).length - statuses.filter(v => v === b).length
                ).pop();

                const appointmentIds = sortedAppts.map(a => a.id);

                // Client header row
                let html = `
                    <tr class="client-group-header">
                        <td colspan="3">
                            <strong><i class="bi bi-person-circle"></i> ${client.knumber} - ${client.clientName}</strong>
                            <span class="text-muted ms-2">(${sortedAppts.length} appointment${sortedAppts.length > 1 ? 's' : ''})</span>
                        </td>
                        <td class="text-right">
                            <div><strong>${formatCurrency(clientTotal)}</strong></div>
                            <div class="text-muted" style="font-size: 0.85rem;">With HST: ${formatCurrency(clientTotalWithHST)}</div>
                        </td>
                        <td><span class="badge-${mostCommonStatus}">${mostCommonStatus || 'ready'}</span></td>
                        <td class="text-center">
                            ${getBulkInvoiceActions(appointmentIds, mostCommonStatus)}
                        </td>
                    </tr>
                `;

                // Individual appointment rows
                sortedAppts.forEach(apt => {
                    const aptAmount = parseFloat(apt.customRate) || 0;
                    const aptAmountWithHST = aptAmount * 1.14; // 14% HST
                    html += `
                        <tr class="client-appointment-row">
                            <td class="ps-4">${new Date(apt.appointmenttime || apt.appointmentDateTime).toLocaleDateString()}</td>
                            <td>${getDriverName(apt.driverAssigned)}</td>
                            <td></td>
                            <td class="text-right">
                                <div>${formatCurrency(aptAmount)}</div>
                                <div class="text-muted" style="font-size: 0.8rem;">With HST: ${formatCurrency(aptAmountWithHST)}</div>
                            </td>
                            <td><span class="badge-${apt.invoiceStatus}">${apt.invoiceStatus || 'ready'}</span></td>
                            <td class="text-center">
                                ${getInvoiceActions(apt)}
                            </td>
                        </tr>
                    `;
                });

                return html;
            }).join('');

            // Add grand total row
            const grandTotalWithHST = grandTotal * 1.14; // 14% HST
            tbody.innerHTML += `
                <tr class="total-row">
                    <td colspan="3"><strong>GRAND TOTAL</strong></td>
                    <td class="text-right">
                        <div><strong>${formatCurrency(grandTotal)}</strong></div>
                        <div class="text-muted" style="font-size: 0.85rem; font-weight: 600;">With HST: ${formatCurrency(grandTotalWithHST)}</div>
                    </td>
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
        const aptId = typeof apt.id === 'string' ? `'${apt.id}'` : apt.id;

        if (apt.invoiceStatus === 'ready' || !apt.invoiceStatus) {
            return `<button class="btn btn-primary btn-sm" onclick="window.financeApp.markInvoiceCreated(${aptId})">Mark Created</button>`;
        } else if (apt.invoiceStatus === 'created') {
            return `<button class="btn btn-primary btn-sm" onclick="window.financeApp.markInvoiceSent(${aptId})">Mark Sent</button>`;
        } else if (apt.invoiceStatus === 'sent') {
            return `<button class="btn btn-success btn-sm" onclick="window.financeApp.markInvoicePaid(${aptId})">Mark Paid</button>`;
        }
        return '';
    }

    /**
     * Get bulk invoice action buttons for client group
     * @param {Array} appointmentIds - Array of appointment IDs
     * @param {string} status - Most common invoice status in the group
     */
    function getBulkInvoiceActions(appointmentIds, status) {
        // Convert array to JSON string for passing to onclick handler
        const idsJson = JSON.stringify(appointmentIds).replace(/"/g, '&quot;');

        if (status === 'ready' || !status) {
            return `<button class="btn btn-primary btn-sm" onclick="window.financeApp.markClientInvoicesCreated([${appointmentIds.map(id => typeof id === 'string' ? `'${id}'` : id).join(',')}])">
                <i class="bi bi-file-earmark-plus"></i> Mark All Created
            </button>`;
        } else if (status === 'created') {
            return `<button class="btn btn-primary btn-sm" onclick="window.financeApp.markClientInvoicesSent([${appointmentIds.map(id => typeof id === 'string' ? `'${id}'` : id).join(',')}])">
                <i class="bi bi-send"></i> Mark All Sent
            </button>`;
        } else if (status === 'sent') {
            return `<button class="btn btn-success btn-sm" onclick="window.financeApp.markClientInvoicesPaid([${appointmentIds.map(id => typeof id === 'string' ? `'${id}'` : id).join(',')}])">
                <i class="bi bi-cash-coin"></i> Mark All Paid
            </button>`;
        }
        return '';
    }

    /**
     * Toggle invoice view mode between 'date' and 'client'
     */
    function setInvoiceView(mode) {
        if (mode !== 'date' && mode !== 'client') return;

        invoiceViewMode = mode;

        // Update button states
        const dateBtn = document.getElementById('viewByDate');
        const clientBtn = document.getElementById('viewByClient');

        if (dateBtn && clientBtn) {
            if (mode === 'date') {
                dateBtn.classList.add('active');
                clientBtn.classList.remove('active');
            } else {
                dateBtn.classList.remove('active');
                clientBtn.classList.add('active');
            }
        }

        // Re-render the table
        renderReadyForInvoicing();
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
            apt.operationStatus === 'completed' &&
            apt.invoiceStatus === 'not_ready' &&
            new Date(apt.appointmenttime || apt.appointmentDateTime) < sevenDaysAgo &&
            !apt.deletedAt
        );

        document.getElementById('notReadyCount').textContent = filteredAppts.length;

        if (filteredAppts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="bi bi-check-circle"></i><br>All completed appointments are ready for invoicing</td></tr>';
        } else {
            let totalAmount = 0;
            tbody.innerHTML = filteredAppts.map(apt => {
                totalAmount += parseFloat(apt.customRate) || 0;
                const clientName = `${apt.knumber || ''} ${apt.clientFirstName || ''} ${apt.clientLastName || ''}`.trim();
                const aptId = typeof apt.id === 'string' ? `'${apt.id}'` : apt.id;

                return `
                    <tr>
                        <td>${new Date(apt.appointmenttime || apt.appointmentDateTime).toLocaleDateString()}</td>
                        <td>${clientName}</td>
                        <td>${getDriverName(apt.driverAssigned)}</td>
                        <td class="text-right">${formatCurrency(apt.customRate)}</td>
                        <td class="text-center">
                            <button class="btn btn-success btn-sm" onclick="window.financeApp.markInvoiceReady(${aptId})">Mark Ready</button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Add total row
            tbody.innerHTML += `
                <tr class="total-row">
                    <td colspan="3">Total</td>
                    <td class="text-right">${formatCurrency(totalAmount)}</td>
                    <td></td>
                </tr>
            `;
        }

        loading.style.display = 'none';
        content.style.display = 'block';
    }

    // =========================================================================
    // DRIVER PAYROLL RENDERING (v2 tiered pay + CRA mileage)
    // =========================================================================
    function renderDriverPayroll() {
        const tbody = document.getElementById('driverTableBody');

        // Filter appointments in current pay period, completed, with driver assigned
        const periodAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
            return apt.operationStatus === 'completed' &&
                   apt.driverAssigned &&
                   !apt.deletedAt &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Group by driver
        const driverStats = {};

        periodAppointments.forEach(apt => {
            const driverId = apt.driverAssigned;
            const driver = drivers.find(d => d.id === driverId) || { id: driverId, pay_tier: 2 };

            if (!driverStats[driverId]) {
                driverStats[driverId] = {
                    driverId,
                    driverName: getDriverName(driverId),
                    payTier: driver.pay_tier || 2,
                    trips: 0,
                    totalMileage: 0,
                    totalMileageReimbursement: 0,
                    totalHoursToPay: 0,
                    totalPay: 0,
                    appointments: [],
                    isPaid: !!apt.driverPaidAt
                };
            }

            // Calculate YTD mileage up to this appointment
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
            const ytdBefore = getDriverYTDMileageUpTo(driverId, aptDate);

            // Calculate payroll for this appointment
            const payroll = calculateAppointmentPayroll(apt, driver, ytdBefore);

            driverStats[driverId].trips++;
            driverStats[driverId].totalMileage += payroll.driverMileage;
            driverStats[driverId].totalMileageReimbursement += payroll.mileageReimbursement;
            driverStats[driverId].totalHoursToPay += payroll.hoursToPay;
            driverStats[driverId].totalPay += payroll.totalPay;
            driverStats[driverId].appointments.push({
                ...apt,
                payroll
            });
        });

        const driverStatsArray = Object.values(driverStats);
        document.getElementById('driverCount').textContent = `${driverStatsArray.length} Drivers`;

        if (driverStatsArray.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="empty-state">
                        <i class="bi bi-inbox"></i>
                        <p>No driver activity in this period</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Totals
        let grandTotalMileage = 0;
        let grandTotalMileageReimbursement = 0;
        let grandTotalHours = 0;
        let grandTotalPay = 0;

        // Render rows
        tbody.innerHTML = driverStatsArray.map((stats, index) => {
            grandTotalMileage += stats.totalMileage;
            grandTotalMileageReimbursement += stats.totalMileageReimbursement;
            grandTotalHours += stats.totalHoursToPay;
            grandTotalPay += stats.totalPay;

            const expandedId = `driver-details-${index}`;
            const tierLabel = `Tier ${stats.payTier}`;
            const statusBadge = stats.isPaid
                ? '<span class="badge-paid">Paid</span>'
                : '<span class="badge-unpaid">Unpaid</span>';
            const actionBtn = stats.isPaid
                ? '<span class="text-muted">-</span>'
                : `<button class="btn btn-success btn-sm" onclick="window.financeApp.markDriverPaid(${stats.driverId})">Mark Paid</button>`;

            // Main row
            const mainRow = `
                <tr class="expandable-row" onclick="window.financeApp.toggleRow('${expandedId}', this)">
                    <td><i class="bi bi-chevron-right"></i> ${stats.driverName}</td>
                    <td class="text-center"><span class="badge-tier">${tierLabel}</span></td>
                    <td class="text-center">${stats.trips}</td>
                    <td class="text-right">${stats.totalMileage.toFixed(1)} km</td>
                    <td class="text-right">${formatCurrency(stats.totalMileageReimbursement)}</td>
                    <td class="text-right">${stats.totalHoursToPay.toFixed(2)}</td>
                    <td class="text-right">${formatCurrency(stats.totalPay)}</td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-center" onclick="event.stopPropagation()">${actionBtn}</td>
                </tr>
            `;

            // Expanded details row
            const detailRows = stats.appointments.map(apt => {
                const p = apt.payroll;
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
                const clientName = `${apt.clientFirstName || ''} ${apt.clientLastName || ''}`.trim() || 'Unknown';
                const knumber = apt.knumber || '';

                return `
                    <tr>
                        <td>${aptDate.toLocaleDateString()}</td>
                        <td>${clientName} (${knumber})</td>
                        <td><span class="badge ${p.tripBadge}">${p.tripType}</span> ${p.billedHours}h</td>
                        <td class="text-right">${p.driverMileage.toFixed(1)} km</td>
                        <td class="text-right">${formatCurrency(p.mileageReimbursement)}</td>
                        <td class="text-right">${p.hoursToPay.toFixed(2)}</td>
                    </tr>
                `;
            }).join('');

            const expandedRow = `
                <tr class="expanded-details" id="${expandedId}">
                    <td colspan="9">
                        <table class="detail-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Client</th>
                                    <th>Type</th>
                                    <th class="text-right">Mileage</th>
                                    <th class="text-right">Mileage $</th>
                                    <th class="text-right">Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${detailRows}
                            </tbody>
                        </table>
                    </td>
                </tr>
            `;

            return mainRow + expandedRow;
        }).join('');

        // Add totals row
        tbody.innerHTML += `
            <tr class="total-row">
                <td colspan="3"><strong>TOTALS</strong></td>
                <td class="text-right"><strong>${grandTotalMileage.toFixed(1)} km</strong></td>
                <td class="text-right"><strong>${formatCurrency(grandTotalMileageReimbursement)}</strong></td>
                <td class="text-right"><strong>${grandTotalHours.toFixed(2)}</strong></td>
                <td class="text-right"><strong>${formatCurrency(grandTotalPay)}</strong></td>
                <td colspan="2"></td>
            </tr>
        `;
    }

    // =========================================================================
    // BOOKING AGENT STATS RENDERING (v1 feature)
    // =========================================================================
    function renderAgentStats() {
        const tbody = document.getElementById('agentStatsTableBody');
        const loading = document.getElementById('agentStatsLoading');
        const content = document.getElementById('agentStatsContent');

        // Filter appointments in current pay period, completed, with booking agent
        const filteredAppts = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
            return apt.operationStatus === 'completed' &&
                   apt.managedBy &&
                   !apt.deletedAt &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Group by agent
        const agentStats = {};
        filteredAppts.forEach(apt => {
            const agentId = apt.managedBy;
            if (!agentStats[agentId]) {
                agentStats[agentId] = {
                    agentId,
                    agentName: apt.managedBy_name || `Agent ${agentId}`,
                    appointments: 0,
                    revenue: 0,
                    commission: 0,
                    appointmentList: [],
                    paid: apt.bookingAgentPaidAt ? new Date(apt.bookingAgentPaidAt).toLocaleDateString() : null
                };
            }

            const revenue = parseFloat(apt.customRate) || 0;
            const commission = calculateAgentCommission(apt.customRate);

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
                    <tr class="expandable-row" onclick="window.financeApp.toggleRow('${expandedId}', this)">
                        <td><i class="bi bi-chevron-right"></i> ${stats.agentName}</td>
                        <td class="text-center">${stats.appointments}</td>
                        <td class="text-right">${formatCurrency(stats.revenue)}</td>
                        <td class="text-right">${formatCurrency(stats.commission)}</td>
                        <td class="text-center">${paidStatus}</td>
                        <td class="text-center" onclick="event.stopPropagation()">${action}</td>
                    </tr>
                    <tr class="expanded-details" id="${expandedId}">
                        <td colspan="6">
                            <ul class="detail-list">
                                ${stats.appointmentList.map(apt => `
                                    <li>
                                        <span>
                                            ${new Date(apt.appointmenttime || apt.appointmentDateTime).toLocaleDateString()} -
                                            ${apt.knumber} ${apt.clientFirstName || ''} ${apt.clientLastName || ''}
                                        </span>
                                        <span>${formatCurrency(apt.customRate)} → ${formatCurrency(apt.commission)}</span>
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
        let totalMileageReimbursement = 0;
        let totalHours = 0;

        periodAppointments.forEach(apt => {
            const invoiceAmount = parseFloat(apt.customRate) || 0;
            totalRevenue += invoiceAmount;

            // Driver pay with tiered system
            if (apt.driverAssigned) {
                const driver = drivers.find(d => d.id === apt.driverAssigned) || { pay_tier: 2 };
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
                const ytdBefore = getDriverYTDMileageUpTo(apt.driverAssigned, aptDate);
                const payroll = calculateAppointmentPayroll(apt, driver, ytdBefore);

                totalDriverPayments += payroll.totalPay;
                totalMileageReimbursement += payroll.mileageReimbursement;
                totalHours += payroll.hoursToPay;
            }

            // Agent commission
            if (apt.managedBy) {
                totalAgentCommissions += calculateAgentCommission(apt.customRate);
            }
        });

        const netProfit = totalRevenue - totalDriverPayments - totalAgentCommissions;

        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('totalDriverPayments').textContent = formatCurrency(totalDriverPayments);
        document.getElementById('totalAgentCommissions').textContent = formatCurrency(totalAgentCommissions);
        document.getElementById('totalMileage').textContent = formatCurrency(totalMileageReimbursement);
        document.getElementById('totalHours').textContent = totalHours.toFixed(1);
        document.getElementById('netProfit').textContent = formatCurrency(netProfit);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    function getDriverName(driverId) {
        if (!driverId) return 'Unassigned';
        const driver = drivers.find(d => d.id === driverId);
        if (!driver) return `Driver ${driverId}`;
        return driver.name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || `Driver ${driverId}`;
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-CA', {
            style: 'currency',
            currency: 'CAD'
        }).format(amount || 0);
    }

    function toggleRow(rowId, clickedRow) {
        const detailRow = document.getElementById(rowId);
        if (detailRow) {
            detailRow.classList.toggle('show');
            clickedRow.classList.toggle('expanded');
        }
    }

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

    /**
     * Show date picker modal for invoice actions
     * @param {string} title - Modal title
     * @param {string} description - Helper text
     * @returns {Promise<string|null>} - ISO timestamp or null if cancelled
     */
    function showDatePickerModal(title, description) {
        return new Promise((resolve) => {
            // Get today's date in LOCAL timezone (Halifax)
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const localDateString = `${year}-${month}-${day}`;

            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">${title}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Date</label>
                                <input type="date" class="form-control" id="selectedDate"
                                       value="${localDateString}">
                                <small class="text-muted">${description}</small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmDate">Confirm</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            const bsModal = new bootstrap.Modal(modal);

            // Focus on confirm button for quick Enter key confirmation
            modal.addEventListener('shown.bs.modal', () => {
                modal.querySelector('#confirmDate').focus();
            });

            modal.querySelector('#confirmDate').addEventListener('click', () => {
                const selectedDate = modal.querySelector('#selectedDate').value;

                // Convert to ISO timestamp at end of day (23:59:59) in LOCAL time
                const [year, month, day] = selectedDate.split('-').map(Number);
                const dateTime = new Date(year, month - 1, day, 23, 59, 59, 999);

                bsModal.hide();
                modal.remove();
                resolve(dateTime.toISOString());
            });

            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
                resolve(null); // User cancelled
            });

            bsModal.show();
        });
    }

    // =========================================================================
    // INVOICE WORKFLOW ACTIONS (v1 features)
    // =========================================================================
    async function markInvoiceReady(appointmentId) {
        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'ready'
            });
            showToast('Invoice marked as ready', 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            showToast('Failed to update invoice status', 'error');
        }
    }

    async function markInvoiceCreated(appointmentId) {
        const selectedDate = await showDatePickerModal(
            'Mark Invoice as Created',
            'When was this invoice created?'
        );

        if (!selectedDate) return; // User cancelled

        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'created',
                invoice_created_at: selectedDate
            });
            showToast('Invoice marked as created', 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            showToast('Failed to update invoice status', 'error');
        }
    }

    async function markInvoiceSent(appointmentId) {
        const selectedDate = await showDatePickerModal(
            'Mark Invoice as Sent',
            'When was this invoice sent to the client?'
        );

        if (!selectedDate) return; // User cancelled

        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'sent',
                invoice_sent_at: selectedDate
            });
            showToast('Invoice marked as sent', 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            showToast('Failed to update invoice status', 'error');
        }
    }

    async function markInvoicePaid(appointmentId) {
        const selectedDate = await showDatePickerModal(
            'Mark Invoice as Paid',
            'When did you receive payment for this invoice?'
        );

        if (!selectedDate) return; // User cancelled

        try {
            await APIClient.post('/TEST-update-invoice-status', {
                appointmentId,
                invoice_status: 'paid',
                payment_received_at: selectedDate
            });
            showToast('Invoice marked as paid', 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice status:', error);
            showToast('Failed to update invoice status', 'error');
        }
    }

    /**
     * Bulk mark all appointments for a client as invoice created
     * @param {Array} appointmentIds - Array of appointment IDs
     */
    async function markClientInvoicesCreated(appointmentIds) {
        const selectedDate = await showDatePickerModal(
            'Mark Client Invoices as Created',
            `When were these ${appointmentIds.length} invoice(s) created?`
        );

        if (!selectedDate) return; // User cancelled

        try {
            // Process each appointment
            const promises = appointmentIds.map(appointmentId =>
                APIClient.post('/TEST-update-invoice-status', {
                    appointmentId,
                    invoice_status: 'created',
                    invoice_created_at: selectedDate
                })
            );

            await Promise.all(promises);
            showToast(`Marked ${appointmentIds.length} invoice(s) as created`, 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice statuses:', error);
            showToast('Failed to update invoice statuses', 'error');
        }
    }

    /**
     * Bulk mark all appointments for a client as invoice sent
     * @param {Array} appointmentIds - Array of appointment IDs
     */
    async function markClientInvoicesSent(appointmentIds) {
        const selectedDate = await showDatePickerModal(
            'Mark Client Invoices as Sent',
            `When were these ${appointmentIds.length} invoice(s) sent to the client?`
        );

        if (!selectedDate) return; // User cancelled

        try {
            // Process each appointment
            const promises = appointmentIds.map(appointmentId =>
                APIClient.post('/TEST-update-invoice-status', {
                    appointmentId,
                    invoice_status: 'sent',
                    invoice_sent_at: selectedDate
                })
            );

            await Promise.all(promises);
            showToast(`Marked ${appointmentIds.length} invoice(s) as sent`, 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice statuses:', error);
            showToast('Failed to update invoice statuses', 'error');
        }
    }

    /**
     * Bulk mark all appointments for a client as invoice paid
     * @param {Array} appointmentIds - Array of appointment IDs
     */
    async function markClientInvoicesPaid(appointmentIds) {
        const selectedDate = await showDatePickerModal(
            'Mark Client Invoices as Paid',
            `When did you receive payment for these ${appointmentIds.length} invoice(s)?`
        );

        if (!selectedDate) return; // User cancelled

        try {
            // Process each appointment
            const promises = appointmentIds.map(appointmentId =>
                APIClient.post('/TEST-update-invoice-status', {
                    appointmentId,
                    invoice_status: 'paid',
                    payment_received_at: selectedDate
                })
            );

            await Promise.all(promises);
            showToast(`Marked ${appointmentIds.length} invoice(s) as paid`, 'success');
            await loadAllData();
        } catch (error) {
            console.error('Error updating invoice statuses:', error);
            showToast('Failed to update invoice statuses', 'error');
        }
    }

    // =========================================================================
    // PAYMENT TRACKING ACTIONS
    // =========================================================================
    async function markDriverPaid(driverId) {
        try {
            // Get unpaid appointments for this driver in current period
            const unpaidAppts = allAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
                return apt.operationStatus === 'completed' &&
                       apt.driverAssigned === driverId &&
                       !apt.driverPaidAt &&
                       !apt.deletedAt &&
                       aptDate >= currentPayPeriod.start &&
                       aptDate <= currentPayPeriod.end;
            });

            const appointmentIds = unpaidAppts.map(apt => apt.id);

            await APIClient.post('/TEST-mark-driver-paid', {
                appointmentIds,
                driver_paid_at: new Date().toISOString()
            });

            showToast(`Marked ${appointmentIds.length} appointments as paid for driver`, 'success');
            await loadAllData();

        } catch (error) {
            console.error('[TEST Finance v3] Error marking driver as paid:', error);
            showToast('Failed to mark driver as paid', 'error');
        }
    }

    async function markAgentPaid(agentId) {
        try {
            // Get unpaid appointments for this agent in current period
            const unpaidAppts = allAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
                return apt.operationStatus === 'completed' &&
                       apt.managedBy === agentId &&
                       !apt.bookingAgentPaidAt &&
                       !apt.deletedAt &&
                       aptDate >= currentPayPeriod.start &&
                       aptDate <= currentPayPeriod.end;
            });

            const appointmentIds = unpaidAppts.map(apt => apt.id);

            await APIClient.post('/TEST-mark-agent-paid', {
                appointmentIds,
                booking_agent_paid_at: new Date().toISOString()
            });

            showToast(`Marked ${appointmentIds.length} appointments as paid for booking agent`, 'success');
            await loadAllData();

        } catch (error) {
            console.error('[TEST Finance v3] Error marking agent as paid:', error);
            showToast('Failed to mark agent as paid', 'error');
        }
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
        toggleRow,
        setInvoiceView,
        markInvoiceReady,
        markInvoiceCreated,
        markInvoiceSent,
        markInvoicePaid,
        markClientInvoicesCreated,
        markClientInvoicesSent,
        markClientInvoicesPaid,
        markDriverPaid,
        markAgentPaid
    };

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', init);

})();
