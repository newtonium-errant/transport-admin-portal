/**
 * TEST Finance Dashboard v2 - Controller
 * Handles driver mileage tracking, tiered payroll, and CRA-compliant reimbursements
 *
 * TEST MODE - Uses Testing Branch Supabase database
 * Version: 2.0.0-TEST
 */

(function() {
    'use strict';

    console.log('[TEST Finance v2] Loading Finance Dashboard v2 - 2.0.0-TEST');

    // =========================================================================
    // DATA CACHE (Performance Optimization)
    // =========================================================================
    class DataCache {
        constructor(prefix = 'rrts_finance_v2_') {
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
    let appConfig = {};

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
        pay_period_days: 14
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    async function init() {
        console.log('[TEST Finance v2] Initializing...');

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

        console.log('[TEST Finance v2] Initialization complete');
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
            console.warn('[TEST Finance v2] Failed to load app config, using defaults:', error);
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
    // PAY PERIOD MANAGEMENT
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

    // =========================================================================
    // DATA LOADING
    // =========================================================================
    async function loadAllData() {
        try {
            showLoading(true);

            // Load appointments and drivers in parallel
            const [appointmentsData, driversData] = await Promise.all([
                APIClient.get('/TEST-get-historic-appointments'),
                APIClient.get('/TEST-get-all-drivers')
            ]);

            allAppointments = appointmentsData.data || appointmentsData.appointments || appointmentsData || [];
            drivers = driversData.drivers || driversData.data || driversData || [];

            console.log(`[TEST Finance v2] Loaded ${allAppointments.length} appointments, ${drivers.length} drivers`);

            // Render UI
            renderDriverPayroll();
            renderSummaryCards();

            showLoading(false);

        } catch (error) {
            console.error('[TEST Finance v2] Error loading data:', error);
            showLoading(false);
            showToast('Failed to load finance data. Please refresh.', 'error');
        }
    }

    function showLoading(isLoading) {
        document.getElementById('driverTableSkeleton').style.display = isLoading ? 'block' : 'none';
        document.getElementById('driverTable').style.display = isLoading ? 'none' : 'table';
    }

    // =========================================================================
    // CALCULATION HELPERS
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

        // For current month, we'd need appointment-level tracking
        // For simplicity, we'll use the full month if it's before the appointment date
        // This is an approximation - real implementation would track per-appointment

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
        const customRate = parseFloat(appointment.custom_rate) || 0;

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
     * Calculate payroll for a single appointment
     */
    function calculateAppointmentPayroll(appointment, driver, ytdBefore) {
        const tierConfig = getTierConfig(driver.pay_tier);
        const tripType = getTripType(appointment);

        // Driver mileage (use stored value or estimate)
        const driverMileage = parseFloat(appointment.driver_mileage) ||
                              (parseFloat(appointment.tripdistance) / 1000) || 0; // Convert metres to km

        // Calculate mileage reimbursement
        const mileageCalc = calculateMileageReimbursement(driverMileage, ytdBefore);

        // Total pay = invoice × tier percentage
        const invoiceAmount = parseFloat(appointment.custom_rate) || 0;
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

    // =========================================================================
    // RENDERING
    // =========================================================================
    function renderDriverPayroll() {
        const tbody = document.getElementById('driverTableBody');

        // Filter appointments in current pay period, completed, with driver assigned
        const periodAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
            return apt.operation_status === 'completed' &&
                   apt.driver_assigned &&
                   !apt.deleted_at &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Group by driver
        const driverStats = {};

        periodAppointments.forEach(apt => {
            const driverId = apt.driver_assigned;
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
                    isPaid: !!apt.driver_paid_at
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
                : `<button class="btn-mark-paid" onclick="financeApp.markDriverPaid(${stats.driverId})">Mark Paid</button>`;

            // Main row
            const mainRow = `
                <tr class="expandable-row" onclick="financeApp.toggleRow('${expandedId}', this)">
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
                const clientName = apt.clientName || `${apt.clientFirstName || ''} ${apt.clientLastName || ''}`.trim() || 'Unknown';
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

    function renderSummaryCards() {
        // Filter period appointments
        const periodAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
            return apt.operation_status === 'completed' &&
                   !apt.deleted_at &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Calculate totals
        let totalRevenue = 0;
        let totalMileageReimbursement = 0;
        let totalHours = 0;

        periodAppointments.forEach(apt => {
            const invoiceAmount = parseFloat(apt.custom_rate) || 0;
            totalRevenue += invoiceAmount;

            if (apt.driver_assigned) {
                const driver = drivers.find(d => d.id === apt.driver_assigned) || { pay_tier: 2 };
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
                const ytdBefore = getDriverYTDMileageUpTo(apt.driver_assigned, aptDate);
                const payroll = calculateAppointmentPayroll(apt, driver, ytdBefore);

                totalMileageReimbursement += payroll.mileageReimbursement;
                totalHours += payroll.hoursToPay;
            }
        });

        const netProfit = totalRevenue - totalMileageReimbursement - (totalHours * 75); // Approximate labor cost

        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
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

    // =========================================================================
    // ACTIONS
    // =========================================================================
    async function markDriverPaid(driverId) {
        if (!confirm('Mark all appointments for this driver in this period as paid?')) return;

        try {
            // Get unpaid appointments for this driver in current period
            const unpaidAppts = allAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime);
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

            showToast(`Marked ${appointmentIds.length} appointments as paid`, 'success');
            await loadAllData();

        } catch (error) {
            console.error('[TEST Finance v2] Error marking driver paid:', error);
            showToast('Failed to mark driver as paid', 'error');
        }
    }

    // =========================================================================
    // LOGOUT
    // =========================================================================
    window.handleLogout = function() {
        if (confirm('Are you sure you want to logout?')) {
            logout();
        }
    };

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    window.financeApp = {
        toggleRow,
        markDriverPaid
    };

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', init);

})();
