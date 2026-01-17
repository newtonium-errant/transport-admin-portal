/**
 * TEST Finance Dashboard v5 - Complete Controller
 * Merges ALL features from v3 (payroll) and v4 (invoice management):
 *
 * FROM v4:
 * - Invoice lifecycle: not_ready → ready → created → sent → paid
 * - Proper invoices table with grouping
 * - Human-in-the-loop review (Pending Review section)
 * - Invoice creation with line items
 * - QuickBooks sync status tracking
 *
 * FROM v3:
 * - Driver payroll with tiered pay (Tier 1/2/3)
 * - CRA-compliant mileage (under/over 5000km rates)
 * - YTD mileage tracking per driver
 * - Booking agent commissions (5%)
 * - Expandable trip details
 * - Skeleton loaders
 * - RBAC enforcement
 * - Date picker for status changes
 *
 * NEW in v5:
 * - Appointment modal integration for editing in Pending Review
 * - Tabbed Invoices section (All, Created, Sent, Paid)
 * - Sortable invoice columns
 *
 * TEST MODE - Uses Testing Branch Supabase database
 * Version: 5.0.0-TEST
 */

(function() {
    'use strict';

    console.log('[TEST Finance v5] Loading Finance Dashboard v5 - Complete - 5.0.0-TEST');

    // =========================================================================
    // AUDIT LOGGING
    // =========================================================================
    async function logAuditEvent(action, resourceType, resourceId, details = {}) {
        try {
            const savedUser = sessionStorage.getItem('rrts_user');
            const user = savedUser ? JSON.parse(savedUser) : null;

            if (!user) {
                console.warn('[Audit] Cannot log event: no user context');
                return;
            }

            const auditData = {
                user_id: user.id || null,
                username: user.username,
                role: user.role,
                action: action,
                resource_type: resourceType,
                resource_id: resourceId,
                details: {
                    ...details,
                    timestamp: new Date().toISOString(),
                    page: 'finance-v5'
                }
            };

            console.log('[Audit]', action, resourceType, resourceId, details);

            await APIClient.post('/TEST-store-audit-log', auditData);
        } catch (error) {
            // Fail silently - don't block user actions if logging fails
            console.error('[Audit] Error storing audit log:', error);
        }
    }

    // =========================================================================
    // DATA CACHE (Performance Optimization)
    // =========================================================================
    class DataCache {
        constructor(prefix = 'rrts_finance_v5_') {
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
    let appConfig = {};
    let selectedPendingAppointments = new Set();

    // Sorting state for invoice tabs
    const invoiceSortState = {
        all: { column: 'invoiceNumber', direction: 'asc' },
        created: { column: 'invoiceNumber', direction: 'asc' },
        sent: { column: 'invoiceNumber', direction: 'asc' },
        paid: { column: 'invoiceNumber', direction: 'asc' },
        void: { column: 'invoiceNumber', direction: 'asc' }
    };

    // Appointment modal instance
    let appointmentModal = null;

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
        agent_commission_percentage: 0.05,
        hst_rate: 0.14,
        invoice_line_format: '{knumber} {clientName}\n{date} - Round trip from Client\'s home to {clinic}'
    };

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    async function init() {
        console.log('[TEST Finance v5] Initializing...');

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

        // Initialize appointment modal for editing
        initAppointmentModal();

        // Setup event listeners
        document.getElementById('payPeriodSelect').addEventListener('change', handlePayPeriodChange);
        setupSortableHeaders();

        // Load data
        await loadAllData();

        console.log('[TEST Finance v5] Initialization complete');
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
    // APPOINTMENT MODAL INTEGRATION
    // =========================================================================
    function initAppointmentModal() {
        // Initialize the appointment modal component
        appointmentModal = new AppointmentModal({
            onSave: async () => {
                showToast('Appointment updated successfully', 'success');
                await loadAllData(); // Refresh data after save
            },
            onDelete: async () => {
                showToast('Appointment deleted', 'info');
                await loadAllData();
            }
        });

        // Make appointmentModalInstance available globally for the modal component
        window.appointmentModalInstance = appointmentModal;
    }

    async function openAppointmentForEdit(appointmentId) {
        console.log('[Finance v5] Opening appointment for edit:', appointmentId);

        // Find the appointment in our data
        const appointment = allAppointments.find(apt => apt.id === appointmentId);
        if (!appointment) {
            showToast('Appointment not found', 'error');
            return;
        }

        // Show loading spinner on the clicked row
        const row = document.querySelector(`tr[data-appointment-id="${appointmentId}"]`);
        let originalRowContent = null;
        if (row) {
            originalRowContent = row.innerHTML;
            row.innerHTML = `<td colspan="8" class="text-center py-3">
                <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                Loading appointment...
            </td>`;
        }

        try {
            // Load drivers and clients data into modal if not already loaded
            if (!appointmentModal.driversLoaded) {
                await appointmentModal.loadDrivers(drivers);
                appointmentModal.driversLoaded = true;
            }

            if (!appointmentModal.clientsLoaded) {
                appointmentModal.clients = clients;
                appointmentModal.clientsLoaded = true;
            }

            if (!appointmentModal.clinicsLoaded) {
                await appointmentModal.loadClinics();
                appointmentModal.clinicsLoaded = true;
            }

            if (!appointmentModal.bookingAgentsLoaded) {
                await appointmentModal.loadBookingAgents();
            }

            // Restore row content before opening modal
            if (row && originalRowContent) {
                row.innerHTML = originalRowContent;
            }

            // Open the modal in edit mode with the appointment data
            await appointmentModal.open('edit', appointment);
        } catch (error) {
            console.error('[Finance v5] Error opening appointment modal:', error);
            // Restore row content on error
            if (row && originalRowContent) {
                row.innerHTML = originalRowContent;
            }
            showToast('Failed to open appointment editor', 'error');
        }
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
            console.warn('[TEST Finance v5] Failed to load app config, using defaults:', error);
            appConfig = { ...DEFAULT_CONFIG };
            updateCRADisplay();
        }
    }

    function updateCRADisplay() {
        const rateUnder = appConfig.cra_mileage_rate_under_5000 || DEFAULT_CONFIG.cra_mileage_rate_under_5000;
        const rateOver = appConfig.cra_mileage_rate_over_5000 || DEFAULT_CONFIG.cra_mileage_rate_over_5000;
        const threshold = appConfig.cra_mileage_threshold || DEFAULT_CONFIG.cra_mileage_threshold;

        document.getElementById('craRateUnder').textContent = `$${rateUnder.toFixed(2)}/km`;
        document.getElementById('craRateOver').textContent = `$${rateOver.toFixed(2)}/km`;
        document.getElementById('craThreshold').textContent = `${threshold.toLocaleString()} km`;
    }

    // =========================================================================
    // PAY PERIOD MANAGEMENT (Timezone-aware)
    // =========================================================================
    function parseLocalDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day, 0, 0, 0, 0);
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

        dropdown.disabled = false;
    }

    // =========================================================================
    // DATA LOADING
    // =========================================================================
    async function loadAllData() {
        try {
            showSkeletons(true);

            // Load all data in parallel
            const [appointmentsData, invoicesData, driversData, usersData, clientsData] = await Promise.all([
                APIClient.get('/TEST-get-finance-appointments').catch(err => {
                    console.warn('[Finance v5] Error loading appointments:', err);
                    return { data: [] };
                }),
                APIClient.get('/TEST-get-invoices').catch(err => {
                    console.warn('[Finance v5] Error loading invoices:', err);
                    return { data: [] };
                }),
                APIClient.get('/TEST-get-all-drivers').catch(err => {
                    console.warn('[Finance v5] Error loading drivers:', err);
                    return { data: [] };
                }),
                APIClient.get('/TEST-get-all-users').catch(err => {
                    console.warn('[Finance v5] Error loading users:', err);
                    return { data: [] };
                }),
                APIClient.get('/TEST-get-all-clients').catch(err => {
                    console.warn('[Finance v5] Error loading clients:', err);
                    return { data: [] };
                })
            ]);

            allAppointments = appointmentsData.data || appointmentsData.appointments || appointmentsData || [];
            if (!Array.isArray(allAppointments)) allAppointments = [];

            // Handle invoices - API returns { data: { invoices: [...], count: N } }
            // Need to check for nested data.invoices structure
            let invoicesRaw;
            if (invoicesData.data && invoicesData.data.invoices) {
                // Standard response: { data: { invoices: [...] } }
                invoicesRaw = invoicesData.data.invoices;
            } else if (invoicesData.invoices) {
                // Direct structure: { invoices: [...] }
                invoicesRaw = invoicesData.invoices;
            } else if (Array.isArray(invoicesData.data)) {
                // Array in data: { data: [...] }
                invoicesRaw = invoicesData.data;
            } else if (Array.isArray(invoicesData)) {
                // Raw array
                invoicesRaw = invoicesData;
            } else {
                invoicesRaw = [];
            }
            allInvoices = Array.isArray(invoicesRaw) ? invoicesRaw : [];
            console.log('[TEST Finance v5] Invoices parsed:', allInvoices.length, 'invoices', allInvoices);

            drivers = driversData.drivers || driversData.data || driversData || [];
            if (!Array.isArray(drivers)) drivers = [];

            users = usersData.data || usersData.users || usersData || [];
            if (!Array.isArray(users)) users = [];

            clients = clientsData.data || clientsData.clients || clientsData || [];
            if (!Array.isArray(clients)) clients = [];

            console.log(`[TEST Finance v5] Loaded: ${allAppointments.length} appointments, ${allInvoices.length} invoices, ${drivers.length} drivers, ${users.length} users, ${clients.length} clients`);

            // Render all sections
            renderPendingReview();
            renderReadyToInvoice();
            renderDriverPayroll();
            renderAgentStats();
            renderInvoicesTabs();
            renderSummaryCards();

            showSkeletons(false);

        } catch (error) {
            console.error('[TEST Finance v5] Error loading data:', error);
            showSkeletons(false);
            showToast('Failed to load finance data. Please refresh.', 'error');
        }
    }

    function showSkeletons(show) {
        const skeletons = [
            'pendingReviewSkeleton',
            'readyInvoicesSkeleton',
            'driverTableSkeleton',
            'agentStatsSkeleton',
            'invoicesSkeleton'
        ];

        const contents = [
            'pendingReviewContent',
            'readyInvoicesContent',
            'driverTable',
            'agentStatsContent',
            'invoiceTabsContent'
        ];

        skeletons.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? 'block' : 'none';
        });

        contents.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? 'none' : (id === 'driverTable' ? 'table' : 'block');
        });
    }

    // =========================================================================
    // CALCULATION HELPERS (Tiered Pay + CRA Mileage from v3)
    // =========================================================================
    function getDriverYTDMileageUpTo(driverId, upToDate) {
        const driver = drivers.find(d => d.id === driverId);
        if (!driver || !driver.mileage_ytd) return 0;

        const year = upToDate.getFullYear().toString();
        const yearData = driver.mileage_ytd[year];
        if (!yearData) return 0;

        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const upToMonth = upToDate.getMonth();

        let ytdMileage = 0;
        for (let i = 0; i < upToMonth; i++) {
            ytdMileage += yearData[months[i]] || 0;
        }

        return ytdMileage;
    }

    function calculateMileageReimbursement(driverMileage, ytdBefore) {
        const threshold = appConfig.cra_mileage_threshold || DEFAULT_CONFIG.cra_mileage_threshold;
        const rateUnder = appConfig.cra_mileage_rate_under_5000 || DEFAULT_CONFIG.cra_mileage_rate_under_5000;
        const rateOver = appConfig.cra_mileage_rate_over_5000 || DEFAULT_CONFIG.cra_mileage_rate_over_5000;

        const remainingUnderThreshold = Math.max(0, threshold - ytdBefore);
        const kmUnder = Math.min(driverMileage, remainingUnderThreshold);
        const kmOver = Math.max(0, driverMileage - kmUnder);

        const reimbursement = (kmUnder * rateUnder) + (kmOver * rateOver);

        return { kmUnder, kmOver, reimbursement };
    }

    function getTierConfig(payTier) {
        const tier = payTier || 2;
        return {
            hourlyRate: appConfig[`pay_tier_${tier}_hourly`] || DEFAULT_CONFIG[`pay_tier_${tier}_hourly`] || 75,
            percentage: appConfig[`pay_tier_${tier}_percentage`] || DEFAULT_CONFIG[`pay_tier_${tier}_percentage`] || 0.33,
            label: `Tier ${tier}`
        };
    }

    function getTripType(appointment) {
        const customRate = parseFloat(appointment.customRate || appointment.custom_rate) || 0;

        if (customRate === 250) {
            return { type: 'One-Way', billedHours: 1, badge: 'trip-oneway' };
        }

        const pickupTime = appointment.pickuptime || appointment.pickup_time;
        const dropOffTime = appointment.dropOffTime || appointment.drop_off_time;

        if (pickupTime && dropOffTime) {
            const pickup = new Date(pickupTime);
            const dropoff = new Date(dropOffTime);
            const actualHours = (dropoff - pickup) / (1000 * 60 * 60);

            if (actualHours > 4) {
                return {
                    type: 'Overtime',
                    billedHours: Math.round(actualHours * 10) / 10,
                    badge: 'trip-overtime'
                };
            }
        }

        return { type: 'Standard', billedHours: 4, badge: 'trip-standard' };
    }

    function calculateAppointmentPayroll(appointment, driver, ytdBefore) {
        const tierConfig = getTierConfig(driver.pay_tier);
        const tripType = getTripType(appointment);

        const driverMileage = parseFloat(appointment.driverMileage || appointment.driver_mileage) ||
                              (parseFloat(appointment.tripdistance || appointment.trip_distance) / 1000) || 0;

        const mileageCalc = calculateMileageReimbursement(driverMileage, ytdBefore);

        const invoiceAmount = parseFloat(appointment.customRate || appointment.custom_rate) || 0;
        const totalPay = invoiceAmount * tierConfig.percentage;
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

    function calculateAgentCommission(customRate) {
        const rate = appConfig.agent_commission_percentage || DEFAULT_CONFIG.agent_commission_percentage;
        return (parseFloat(customRate) || 0) * rate;
    }

    // =========================================================================
    // SECTION 0: PENDING REVIEW RENDERING
    // =========================================================================
    function renderPendingReview() {
        const tbody = document.getElementById('pendingReviewTableBody');

        // Filter: completed appointments with invoice_status = 'not_ready' or null
        const pendingAppointments = allAppointments.filter(apt => {
            const opStatus = apt.operationStatus || apt.operation_status;
            const invStatus = apt.invoiceStatus || apt.invoice_status;
            const deletedAt = apt.deletedAt || apt.deleted_at;

            return opStatus === 'completed' &&
                   (!invStatus || invStatus === 'not_ready') &&
                   !deletedAt;
        });

        // Sort by date, oldest first
        pendingAppointments.sort((a, b) => {
            const dateA = new Date(a.appointmenttime || a.appointmentDateTime || a.appointment_time);
            const dateB = new Date(b.appointmenttime || b.appointmentDateTime || b.appointment_time);
            return dateA - dateB;
        });

        document.getElementById('pendingReviewCount').textContent = pendingAppointments.length;

        // Show/hide bulk action button
        document.getElementById('bulkMarkReadyBtn').style.display =
            selectedPendingAppointments.size > 0 ? 'inline-block' : 'none';

        if (pendingAppointments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state">
                        <i class="bi bi-check-circle"></i>
                        <p>All completed appointments have been reviewed!</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pendingAppointments.map(apt => {
            const aptId = apt.id;
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
            const knumber = apt.knumber || apt.k_number || '';
            const clientName = `${apt.clientFirstName || apt.client_first_name || ''} ${apt.clientLastName || apt.client_last_name || ''}`.trim();
            const location = apt.location || apt.clinic || 'Unknown';
            const driverName = getDriverName(apt.driverAssigned || apt.driver_assigned);
            const agentName = apt.managedBy_name || apt.managed_by_name || getAgentName(apt.managedBy || apt.managed_by);
            const rate = parseFloat(apt.customRate || apt.custom_rate) || 0;
            const isSelected = selectedPendingAppointments.has(aptId);

            return `
                <tr class="clickable-row" data-appointment-id="${aptId}">
                    <td onclick="event.stopPropagation()">
                        <input type="checkbox" class="form-check-input pending-checkbox"
                               data-id="${aptId}" ${isSelected ? 'checked' : ''}
                               onchange="window.financeApp.togglePendingSelection('${aptId}', this.checked)">
                    </td>
                    <td onclick="window.financeApp.openAppointmentForEdit('${aptId}')">
                        ${aptDate.toLocaleDateString()} ${aptDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </td>
                    <td onclick="window.financeApp.openAppointmentForEdit('${aptId}')">
                        <strong>${knumber}</strong> ${clientName}
                    </td>
                    <td onclick="window.financeApp.openAppointmentForEdit('${aptId}')">${location}</td>
                    <td onclick="window.financeApp.openAppointmentForEdit('${aptId}')">${driverName || '<span class="text-danger">Not assigned</span>'}</td>
                    <td onclick="window.financeApp.openAppointmentForEdit('${aptId}')">${agentName || '<span class="text-danger">Not assigned</span>'}</td>
                    <td class="text-right" onclick="window.financeApp.openAppointmentForEdit('${aptId}')">${formatCurrency(rate)}</td>
                    <td class="text-center" onclick="event.stopPropagation()">
                        <button class="btn btn-success btn-sm" onclick="window.financeApp.markAppointmentReady('${aptId}')">
                            <i class="bi bi-check"></i> Ready
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function togglePendingSelection(appointmentId, isChecked) {
        if (isChecked) {
            selectedPendingAppointments.add(appointmentId);
        } else {
            selectedPendingAppointments.delete(appointmentId);
        }

        // Update bulk button visibility
        document.getElementById('bulkMarkReadyBtn').style.display =
            selectedPendingAppointments.size > 0 ? 'inline-block' : 'none';
    }

    function toggleSelectAllPending(checkbox) {
        const checkboxes = document.querySelectorAll('.pending-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checkbox.checked;
            const id = cb.dataset.id; // Keep as string (UUID)
            if (checkbox.checked) {
                selectedPendingAppointments.add(id);
            } else {
                selectedPendingAppointments.delete(id);
            }
        });

        document.getElementById('bulkMarkReadyBtn').style.display =
            selectedPendingAppointments.size > 0 ? 'inline-block' : 'none';
    }

    async function markAppointmentReady(appointmentId) {
        try {
            await APIClient.post('/TEST-mark-appointment-ready', {
                appointmentIds: [appointmentId]
            });
            showToast('Appointment marked ready for invoicing', 'success');

            // Audit log
            await logAuditEvent('mark_ready_for_invoice', 'appointment', appointmentId, {
                action_type: 'single'
            });

            await loadAllData();
        } catch (error) {
            console.error('[Finance v5] Error marking appointment ready:', error);
            showToast('Failed to mark appointment ready', 'error');
        }
    }

    async function bulkMarkReady() {
        if (selectedPendingAppointments.size === 0) return;

        // Get the button and show spinner
        const btn = document.getElementById('bulkMarkReadyBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Processing...';
        btn.disabled = true;

        try {
            const appointmentIds = Array.from(selectedPendingAppointments);
            await APIClient.post('/TEST-mark-appointment-ready', { appointmentIds });
            showToast(`${appointmentIds.length} appointment(s) marked ready for invoicing`, 'success');

            // Audit log
            await logAuditEvent('mark_ready_for_invoice', 'appointment', appointmentIds.join(','), {
                action_type: 'bulk',
                count: appointmentIds.length,
                appointment_ids: appointmentIds
            });

            selectedPendingAppointments.clear();
            await loadAllData();
        } catch (error) {
            console.error('[Finance v5] Error bulk marking ready:', error);
            showToast('Failed to mark appointments ready', 'error');
        } finally {
            // Restore button state
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // =========================================================================
    // SECTION 1: READY TO INVOICE RENDERING
    // =========================================================================
    function renderReadyToInvoice() {
        const tbody = document.getElementById('readyInvoicesTableBody');

        // Filter: completed with invoice_status = 'ready' and no invoice_id yet
        const readyAppointments = allAppointments.filter(apt => {
            const invStatus = apt.invoiceStatus || apt.invoice_status;
            const invoiceId = apt.invoiceId || apt.invoice_id;
            const deletedAt = apt.deletedAt || apt.deleted_at;

            return invStatus === 'ready' && !invoiceId && !deletedAt;
        });

        // Group by client
        const groupedByClient = {};
        readyAppointments.forEach(apt => {
            const knumber = apt.knumber || apt.k_number || 'Unknown';
            if (!groupedByClient[knumber]) {
                groupedByClient[knumber] = {
                    knumber,
                    clientName: `${apt.clientFirstName || apt.client_first_name || ''} ${apt.clientLastName || apt.client_last_name || ''}`.trim() || 'Unknown',
                    appointments: []
                };
            }
            groupedByClient[knumber].appointments.push(apt);
        });

        const clientGroups = Object.values(groupedByClient).sort((a, b) =>
            a.knumber.localeCompare(b.knumber)
        );

        document.getElementById('readyCount').textContent = readyAppointments.length;

        if (clientGroups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <i class="bi bi-inbox"></i>
                        <p>No appointments ready for invoicing</p>
                    </td>
                </tr>
            `;
            return;
        }

        const hstRate = appConfig.hst_rate || DEFAULT_CONFIG.hst_rate;
        let grandTotal = 0;

        tbody.innerHTML = clientGroups.map((group, idx) => {
            let subtotal = 0;
            group.appointments.forEach(apt => {
                subtotal += parseFloat(apt.customRate || apt.custom_rate) || 0;
            });
            grandTotal += subtotal;
            const withHST = subtotal * (1 + hstRate);

            const appointmentIds = group.appointments.map(a => a.id);
            // Use single quotes for array items to avoid HTML attribute conflicts
            const appointmentIdsStr = "['" + appointmentIds.join("','") + "']";
            const groupId = `ready-group-${idx}`;
            // Escape client name for use in onclick attribute
            const escapedClientName = group.clientName.replace(/'/g, "\\'");

            // Client header row
            let html = `
                <tr class="client-group-header" onclick="window.financeApp.toggleClientGroup('${groupId}')">
                    <td><i class="bi bi-chevron-right expand-icon" id="icon-${groupId}"></i></td>
                    <td>
                        <strong><i class="bi bi-person-circle"></i> ${group.knumber}</strong> - ${group.clientName}
                    </td>
                    <td>${group.appointments.length} appointment${group.appointments.length > 1 ? 's' : ''}</td>
                    <td class="text-right">${formatCurrency(subtotal)}</td>
                    <td class="text-right">${formatCurrency(withHST)}</td>
                    <td class="text-center" onclick="event.stopPropagation()">
                        <button class="btn btn-primary btn-sm" onclick="window.financeApp.openCreateInvoiceModal('${group.knumber}', '${escapedClientName}', ${appointmentIdsStr})">
                            <i class="bi bi-file-earmark-plus"></i> Create Invoice
                        </button>
                    </td>
                </tr>
            `;

            // Individual appointment rows (hidden by default)
            group.appointments.forEach(apt => {
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
                const location = apt.location || apt.clinic || 'Unknown';
                const rate = parseFloat(apt.customRate || apt.custom_rate) || 0;

                html += `
                    <tr class="client-appointment-row" data-group="${groupId}">
                        <td></td>
                        <td colspan="2" class="ps-4">
                            ${aptDate.toLocaleDateString()} - ${location}
                        </td>
                        <td class="text-right">${formatCurrency(rate)}</td>
                        <td class="text-right">${formatCurrency(rate * (1 + hstRate))}</td>
                        <td></td>
                    </tr>
                `;
            });

            return html;
        }).join('');

        // Grand total row
        tbody.innerHTML += `
            <tr class="total-row">
                <td colspan="3"><strong>TOTAL</strong></td>
                <td class="text-right"><strong>${formatCurrency(grandTotal)}</strong></td>
                <td class="text-right"><strong>${formatCurrency(grandTotal * (1 + hstRate))}</strong></td>
                <td></td>
            </tr>
        `;
    }

    function toggleClientGroup(groupId) {
        const rows = document.querySelectorAll(`tr[data-group="${groupId}"]`);
        const icon = document.getElementById(`icon-${groupId}`);

        rows.forEach(row => row.classList.toggle('expanded'));

        if (icon) {
            icon.style.transform = icon.style.transform === 'rotate(90deg)' ? '' : 'rotate(90deg)';
        }
    }

    // =========================================================================
    // SECTION 2: DRIVER PAYROLL RENDERING (from v3)
    // =========================================================================
    function renderDriverPayroll() {
        const tbody = document.getElementById('driverTableBody');

        // Filter appointments in current pay period, completed, with driver assigned
        const periodAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
            const opStatus = apt.operationStatus || apt.operation_status;
            const driverId = apt.driverAssigned || apt.driver_assigned;
            const deletedAt = apt.deletedAt || apt.deleted_at;

            return opStatus === 'completed' &&
                   driverId &&
                   !deletedAt &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        // Group by driver
        const driverStats = {};

        periodAppointments.forEach(apt => {
            const driverId = apt.driverAssigned || apt.driver_assigned;
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
                    isPaid: !!(apt.driverPaidAt || apt.driver_paid_at)
                };
            }

            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
            const ytdBefore = getDriverYTDMileageUpTo(driverId, aptDate);
            const payroll = calculateAppointmentPayroll(apt, driver, ytdBefore);

            driverStats[driverId].trips++;
            driverStats[driverId].totalMileage += payroll.driverMileage;
            driverStats[driverId].totalMileageReimbursement += payroll.mileageReimbursement;
            driverStats[driverId].totalHoursToPay += payroll.hoursToPay;
            driverStats[driverId].totalPay += payroll.totalPay;
            driverStats[driverId].appointments.push({ ...apt, payroll });
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

        let grandTotalMileage = 0;
        let grandTotalMileageReimbursement = 0;
        let grandTotalHours = 0;
        let grandTotalPay = 0;

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
                : `<button class="btn btn-success btn-sm" onclick="window.financeApp.markDriverPaid('${stats.driverId}')">Mark Paid</button>`;

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

            const detailRows = stats.appointments.map(apt => {
                const p = apt.payroll;
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
                const clientName = `${apt.clientFirstName || apt.client_first_name || ''} ${apt.clientLastName || apt.client_last_name || ''}`.trim() || 'Unknown';
                const knumber = apt.knumber || apt.k_number || '';

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
                            <tbody>${detailRows}</tbody>
                        </table>
                    </td>
                </tr>
            `;

            return mainRow + expandedRow;
        }).join('');

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
    // SECTION 3: BOOKING AGENT STATS RENDERING (from v3)
    // =========================================================================
    function renderAgentStats() {
        const tbody = document.getElementById('agentStatsTableBody');

        const filteredAppts = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
            const opStatus = apt.operationStatus || apt.operation_status;
            const managedBy = apt.managedBy || apt.managed_by;
            const deletedAt = apt.deletedAt || apt.deleted_at;

            return opStatus === 'completed' &&
                   managedBy &&
                   !deletedAt &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        const agentStats = {};
        filteredAppts.forEach(apt => {
            const agentId = apt.managedBy || apt.managed_by;
            const agentName = apt.managedBy_name || apt.managed_by_name || getAgentName(agentId);

            if (!agentStats[agentId]) {
                agentStats[agentId] = {
                    agentId,
                    agentName,
                    appointments: 0,
                    revenue: 0,
                    commission: 0,
                    appointmentList: [],
                    paid: apt.bookingAgentPaidAt || apt.booking_agent_paid_at
                        ? new Date(apt.bookingAgentPaidAt || apt.booking_agent_paid_at).toLocaleDateString()
                        : null
                };
            }

            const revenue = parseFloat(apt.customRate || apt.custom_rate) || 0;
            const commission = calculateAgentCommission(revenue);

            agentStats[agentId].appointments++;
            agentStats[agentId].revenue += revenue;
            agentStats[agentId].commission += commission;
            agentStats[agentId].appointmentList.push({ ...apt, commission });
        });

        const agentStatsArray = Object.values(agentStats);

        if (agentStatsArray.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="bi bi-inbox"></i><br>No booking agent activity in this period</td></tr>';
            return;
        }

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
                : `<button class="btn btn-success btn-sm" onclick="window.financeApp.markAgentPaid('${stats.agentId}')">Mark Paid</button>`;

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
                                        ${new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time).toLocaleDateString()} -
                                        ${apt.knumber || apt.k_number} ${apt.clientFirstName || apt.client_first_name || ''} ${apt.clientLastName || apt.client_last_name || ''}
                                    </span>
                                    <span>${formatCurrency(apt.customRate || apt.custom_rate)} → ${formatCurrency(apt.commission)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </td>
                </tr>
            `;
        }).join('');

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

    // =========================================================================
    // SECTION 4: INVOICES TABS RENDERING
    // =========================================================================
    function renderInvoicesTabs() {
        renderInvoicesTab('all');
        renderInvoicesTab('created');
        renderInvoicesTab('sent');
        renderInvoicesTab('paid');
        renderInvoicesTab('void');

        // Update tab badges
        const created = allInvoices.filter(inv => (inv.invoiceStatus || inv.invoice_status) === 'created');
        const sent = allInvoices.filter(inv => (inv.invoiceStatus || inv.invoice_status) === 'sent');
        const paid = allInvoices.filter(inv => (inv.invoiceStatus || inv.invoice_status) === 'paid');
        const voided = allInvoices.filter(inv => (inv.invoiceStatus || inv.invoice_status) === 'void');

        document.getElementById('allInvoicesCount').textContent = allInvoices.length;
        document.getElementById('createdInvoicesCount').textContent = created.length;
        document.getElementById('sentInvoicesCount').textContent = sent.length;
        document.getElementById('paidInvoicesCount').textContent = paid.length;
        document.getElementById('voidInvoicesCount').textContent = voided.length;
        document.getElementById('totalInvoicesCount').textContent = allInvoices.length;
    }

    function renderInvoicesTab(tabName) {
        let invoices = [];

        if (tabName === 'all') {
            invoices = [...allInvoices];
        } else {
            invoices = allInvoices.filter(inv => (inv.invoiceStatus || inv.invoice_status) === tabName);
        }

        // Apply sorting
        const sortState = invoiceSortState[tabName];
        invoices = sortInvoices(invoices, sortState.column, sortState.direction);

        const tbody = document.getElementById(`${tabName}InvoicesTableBody`);

        if (invoices.length === 0) {
            const colspan = tabName === 'all' ? 6 : 5;
            tbody.innerHTML = `
                <tr>
                    <td colspan="${colspan}" class="empty-state">
                        <i class="bi bi-inbox"></i>
                        <p>No ${tabName === 'all' ? '' : tabName + ' '}invoices</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = invoices.map(inv => {
            const invNumber = inv.invoiceNumber || inv.invoice_number || 'N/A';
            const status = inv.invoiceStatus || inv.invoice_status;
            const client = getClientDisplay(inv.knumber || inv.k_number);
            const total = parseFloat(inv.invoiceTotal || inv.invoice_total) || 0;

            let dateDisplay = '';
            if (status === 'paid') {
                dateDisplay = formatDate(inv.paymentReceivedAt || inv.payment_received_at);
            } else if (status === 'sent') {
                dateDisplay = formatDate(inv.invoiceSentAt || inv.invoice_sent_at);
            } else {
                dateDisplay = formatDate(inv.invoiceCreatedAt || inv.invoice_created_at || inv.created_at);
            }

            if (tabName === 'all') {
                return `
                    <tr>
                        <td><strong>${invNumber}</strong></td>
                        <td>${client}</td>
                        <td>${dateDisplay}</td>
                        <td><span class="badge-${status}">${status}</span></td>
                        <td class="text-right">${formatCurrency(total)}</td>
                        <td class="text-center">${getInvoiceActions(inv)}</td>
                    </tr>
                `;
            } else if (tabName === 'paid') {
                return `
                    <tr>
                        <td><strong>${invNumber}</strong></td>
                        <td>${client}</td>
                        <td>${dateDisplay}</td>
                        <td class="text-right">${formatCurrency(total)}</td>
                        <td class="text-center"><span class="badge-paid">Paid</span></td>
                    </tr>
                `;
            } else if (tabName === 'void') {
                // Get appointment IDs from the invoice
                const appointmentIds = inv.appointmentIds || inv.appointment_ids || [];
                const aptCount = Array.isArray(appointmentIds) ? appointmentIds.length : 0;
                return `
                    <tr>
                        <td><strong>${invNumber}</strong></td>
                        <td>${client}</td>
                        <td>${dateDisplay}</td>
                        <td class="text-right">${formatCurrency(total)}</td>
                        <td class="text-center">${aptCount} appointment${aptCount !== 1 ? 's' : ''}</td>
                    </tr>
                `;
            } else {
                return `
                    <tr>
                        <td><strong>${invNumber}</strong></td>
                        <td>${client}</td>
                        <td>${dateDisplay}</td>
                        <td class="text-right">${formatCurrency(total)}</td>
                        <td class="text-center">${getInvoiceActions(inv)}</td>
                    </tr>
                `;
            }
        }).join('');

        // Update sort indicators
        updateSortIndicators(tabName);
    }

    function sortInvoices(invoices, column, direction) {
        return invoices.sort((a, b) => {
            let valA, valB;

            switch (column) {
                case 'invoiceNumber':
                    valA = a.invoiceNumber || a.invoice_number || '';
                    valB = b.invoiceNumber || b.invoice_number || '';
                    break;
                case 'client':
                    valA = a.knumber || a.k_number || '';
                    valB = b.knumber || b.k_number || '';
                    break;
                case 'invoiceDate':
                    const statusA = a.invoiceStatus || a.invoice_status;
                    const statusB = b.invoiceStatus || b.invoice_status;
                    valA = new Date(getInvoiceDateForStatus(a, statusA) || 0);
                    valB = new Date(getInvoiceDateForStatus(b, statusB) || 0);
                    break;
                case 'status':
                    const statusOrder = { 'created': 1, 'sent': 2, 'paid': 3 };
                    valA = statusOrder[a.invoiceStatus || a.invoice_status] || 0;
                    valB = statusOrder[b.invoiceStatus || b.invoice_status] || 0;
                    break;
                default:
                    valA = a[column] || '';
                    valB = b[column] || '';
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function getInvoiceDateForStatus(invoice, status) {
        if (status === 'paid') {
            return invoice.paymentReceivedAt || invoice.payment_received_at;
        } else if (status === 'sent') {
            return invoice.invoiceSentAt || invoice.invoice_sent_at;
        } else {
            return invoice.invoiceCreatedAt || invoice.invoice_created_at || invoice.created_at;
        }
    }

    function setupSortableHeaders() {
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', () => {
                const column = header.dataset.sort;
                const tab = header.dataset.tab;

                // Toggle direction
                if (invoiceSortState[tab].column === column) {
                    invoiceSortState[tab].direction =
                        invoiceSortState[tab].direction === 'asc' ? 'desc' : 'asc';
                } else {
                    invoiceSortState[tab].column = column;
                    invoiceSortState[tab].direction = 'asc';
                }

                renderInvoicesTab(tab);
            });
        });
    }

    function updateSortIndicators(tabName) {
        const sortState = invoiceSortState[tabName];

        // Remove existing sort classes
        document.querySelectorAll(`[data-tab="${tabName}"].sortable`).forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });

        // Add current sort class
        const activeHeader = document.querySelector(`[data-tab="${tabName}"][data-sort="${sortState.column}"]`);
        if (activeHeader) {
            activeHeader.classList.add(`sort-${sortState.direction}`);
        }
    }

    function getInvoiceActions(invoice) {
        const status = invoice.invoiceStatus || invoice.invoice_status;
        const invId = invoice.id;

        if (status === 'created') {
            return `
                <button class="btn btn-primary btn-sm" onclick="window.financeApp.markInvoiceSent('${invId}')">
                    <i class="bi bi-send"></i> Mark Sent
                </button>
                <button class="btn btn-danger btn-sm ms-1" onclick="window.financeApp.voidInvoice('${invId}')">
                    <i class="bi bi-x-circle"></i> Void
                </button>
            `;
        } else if (status === 'sent') {
            return `
                <button class="btn btn-success btn-sm" onclick="window.financeApp.markInvoicePaid('${invId}')">
                    <i class="bi bi-cash-coin"></i> Mark Paid
                </button>
                <button class="btn btn-danger btn-sm ms-1" onclick="window.financeApp.voidInvoice('${invId}')">
                    <i class="bi bi-x-circle"></i> Void
                </button>
            `;
        } else if (status === 'paid') {
            return '<span class="text-muted">-</span>';
        }

        return '';
    }

    // =========================================================================
    // SUMMARY CARDS RENDERING
    // =========================================================================
    function renderSummaryCards() {
        const periodAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
            const opStatus = apt.operationStatus || apt.operation_status;
            const deletedAt = apt.deletedAt || apt.deleted_at;

            return opStatus === 'completed' &&
                   !deletedAt &&
                   aptDate >= currentPayPeriod.start &&
                   aptDate <= currentPayPeriod.end;
        });

        let totalRevenue = 0;
        let totalDriverPayments = 0;
        let totalAgentCommissions = 0;
        let totalMileageReimbursement = 0;

        periodAppointments.forEach(apt => {
            const invoiceAmount = parseFloat(apt.customRate || apt.custom_rate) || 0;
            totalRevenue += invoiceAmount;

            const driverId = apt.driverAssigned || apt.driver_assigned;
            if (driverId) {
                const driver = drivers.find(d => d.id === driverId) || { pay_tier: 2 };
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
                const ytdBefore = getDriverYTDMileageUpTo(driverId, aptDate);
                const payroll = calculateAppointmentPayroll(apt, driver, ytdBefore);

                totalDriverPayments += payroll.totalPay;
                totalMileageReimbursement += payroll.mileageReimbursement;
            }

            const managedBy = apt.managedBy || apt.managed_by;
            if (managedBy) {
                totalAgentCommissions += calculateAgentCommission(invoiceAmount);
            }
        });

        const netProfit = totalRevenue - totalDriverPayments - totalAgentCommissions;

        // Count pending invoices (ready but not yet created)
        const pendingCount = allAppointments.filter(apt => {
            const invStatus = apt.invoiceStatus || apt.invoice_status;
            return invStatus === 'ready' && !(apt.invoiceId || apt.invoice_id);
        }).length;

        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
        document.getElementById('totalDriverPayments').textContent = formatCurrency(totalDriverPayments);
        document.getElementById('totalAgentCommissions').textContent = formatCurrency(totalAgentCommissions);
        document.getElementById('totalMileage').textContent = formatCurrency(totalMileageReimbursement);
        document.getElementById('invoicesPending').textContent = pendingCount;
        document.getElementById('netProfit').textContent = formatCurrency(netProfit);
    }

    // =========================================================================
    // INVOICE ACTIONS
    // =========================================================================
    function openCreateInvoiceModal(knumber, clientName, appointmentIds) {
        const modal = document.getElementById('createInvoiceModal');
        const bsModal = new bootstrap.Modal(modal);

        // Populate modal
        document.getElementById('invoiceClientName').value = `${knumber} - ${clientName}`;

        // Set today's date
        const today = new Date();
        document.getElementById('invoiceDate').value = today.toISOString().split('T')[0];

        // Get appointments
        const appointments = allAppointments.filter(apt => appointmentIds.includes(apt.id));

        // Build appointment list
        const hstRate = appConfig.hst_rate || DEFAULT_CONFIG.hst_rate;
        let subtotal = 0;

        document.getElementById('invoiceAppointmentsList').innerHTML = appointments.map(apt => {
            const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
            const location = apt.location || apt.clinic || 'Unknown';
            const rate = parseFloat(apt.customRate || apt.custom_rate) || 0;
            subtotal += rate;

            return `
                <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                    <div>
                        <strong>${aptDate.toLocaleDateString()}</strong> - ${location}
                    </div>
                    <div>${formatCurrency(rate)}</div>
                </div>
            `;
        }).join('');

        const tax = subtotal * hstRate;
        const total = subtotal + tax;

        document.getElementById('invoiceSubtotal').textContent = formatCurrency(subtotal);
        document.getElementById('invoiceTax').textContent = formatCurrency(tax);
        document.getElementById('invoiceTotal').textContent = formatCurrency(total);

        // Setup confirm button
        const confirmBtn = document.getElementById('confirmCreateInvoice');
        confirmBtn.onclick = async () => {
            // Show spinner and disable button
            const originalText = confirmBtn.innerHTML;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Creating...';
            confirmBtn.disabled = true;

            try {
                await createInvoice(knumber, appointmentIds);
                bsModal.hide();
            } finally {
                // Restore button state
                confirmBtn.innerHTML = originalText;
                confirmBtn.disabled = false;
            }
        };

        bsModal.show();
    }

    async function createInvoice(knumber, appointmentIds) {
        const invoiceDate = document.getElementById('invoiceDate').value;
        const notes = document.getElementById('invoiceNotes').value;

        const payload = {
            knumber,
            appointmentIds,
            invoiceDate,
            notes
        };

        console.log('[Finance v5] Creating invoice with payload:', payload);

        const response = await APIClient.post('/TEST-create-invoice', payload);

        console.log('[Finance v5] Create invoice response:', response);

        // Audit log
        const invoiceNumber = response?.data?.invoice_number || response?.invoice_number || 'unknown';
        await logAuditEvent('create_invoice', 'invoice', invoiceNumber, {
            knumber,
            appointment_count: appointmentIds.length,
            appointment_ids: appointmentIds,
            invoice_date: invoiceDate
        });

        showToast('Invoice created successfully', 'success');
        await loadAllData();
    }

    async function markInvoiceSent(invoiceId) {
        const selectedDate = await showDatePickerModal(
            'Mark Invoice as Sent',
            'When was this invoice sent to the client?'
        );

        if (!selectedDate) return;

        try {
            await APIClient.post('/TEST-update-invoice-status-v2', {
                invoiceId,
                status: 'sent',
                invoiceSentAt: selectedDate
            });

            // Audit log
            await logAuditEvent('mark_invoice_sent', 'invoice', invoiceId, {
                sent_date: selectedDate
            });

            showToast('Invoice marked as sent', 'success');
            await loadAllData();
        } catch (error) {
            console.error('[Finance v5] Error updating invoice:', error);
            showToast('Failed to update invoice', 'error');
        }
    }

    async function markInvoicePaid(invoiceId) {
        const selectedDate = await showDatePickerModal(
            'Mark Invoice as Paid',
            'When was payment received for this invoice?'
        );

        if (!selectedDate) return;

        try {
            await APIClient.post('/TEST-update-invoice-status-v2', {
                invoiceId,
                status: 'paid',
                paymentReceivedAt: selectedDate
            });

            // Audit log
            await logAuditEvent('mark_invoice_paid', 'invoice', invoiceId, {
                payment_date: selectedDate
            });

            showToast('Invoice marked as paid', 'success');
            await loadAllData();
        } catch (error) {
            console.error('[Finance v5] Error updating invoice:', error);
            showToast('Failed to update invoice', 'error');
        }
    }

    async function voidInvoice(invoiceId) {
        if (!confirm('Are you sure you want to void this invoice? Appointments will return to "ready" status.')) {
            return;
        }

        try {
            await APIClient.post('/TEST-void-invoice', { invoiceId });

            // Audit log
            await logAuditEvent('void_invoice', 'invoice', invoiceId, {
                reason: 'User voided invoice'
            });

            showToast('Invoice voided', 'success');
            await loadAllData();
        } catch (error) {
            console.error('[Finance v5] Error voiding invoice:', error);
            showToast('Failed to void invoice', 'error');
        }
    }

    // =========================================================================
    // PAYMENT TRACKING ACTIONS (from v3)
    // =========================================================================
    async function markDriverPaid(driverId) {
        const selectedDate = await showDatePickerModal(
            'Mark Driver as Paid',
            'When was this driver paid?'
        );

        if (!selectedDate) return;

        try {
            const unpaidAppts = allAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
                const opStatus = apt.operationStatus || apt.operation_status;
                const driver = apt.driverAssigned || apt.driver_assigned;
                const paidAt = apt.driverPaidAt || apt.driver_paid_at;
                const deletedAt = apt.deletedAt || apt.deleted_at;

                return opStatus === 'completed' &&
                       driver === driverId &&
                       !paidAt &&
                       !deletedAt &&
                       aptDate >= currentPayPeriod.start &&
                       aptDate <= currentPayPeriod.end;
            });

            const appointmentIds = unpaidAppts.map(apt => apt.id);

            await APIClient.post('/TEST-mark-driver-paid', {
                appointmentIds,
                driver_paid_at: selectedDate
            });

            // Audit log
            const driverName = getDriverName(driverId);
            await logAuditEvent('mark_driver_paid', 'driver', driverId, {
                driver_name: driverName,
                payment_date: selectedDate,
                appointment_count: appointmentIds.length,
                appointment_ids: appointmentIds
            });

            showToast(`Marked ${appointmentIds.length} appointments as paid for driver`, 'success');
            await loadAllData();
        } catch (error) {
            console.error('[Finance v5] Error marking driver as paid:', error);
            showToast('Failed to mark driver as paid', 'error');
        }
    }

    async function markAgentPaid(agentId) {
        const selectedDate = await showDatePickerModal(
            'Mark Agent as Paid',
            'When was this agent paid?'
        );

        if (!selectedDate) return;

        try {
            const unpaidAppts = allAppointments.filter(apt => {
                const aptDate = new Date(apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time);
                const opStatus = apt.operationStatus || apt.operation_status;
                const agent = apt.managedBy || apt.managed_by;
                const paidAt = apt.bookingAgentPaidAt || apt.booking_agent_paid_at;
                const deletedAt = apt.deletedAt || apt.deleted_at;

                return opStatus === 'completed' &&
                       agent === agentId &&
                       !paidAt &&
                       !deletedAt &&
                       aptDate >= currentPayPeriod.start &&
                       aptDate <= currentPayPeriod.end;
            });

            const appointmentIds = unpaidAppts.map(apt => apt.id);

            await APIClient.post('/TEST-mark-agent-paid', {
                appointmentIds,
                booking_agent_paid_at: selectedDate
            });

            // Audit log
            const agentName = getAgentName(agentId);
            await logAuditEvent('mark_agent_paid', 'booking_agent', agentId, {
                agent_name: agentName,
                payment_date: selectedDate,
                appointment_count: appointmentIds.length,
                appointment_ids: appointmentIds
            });

            showToast(`Marked ${appointmentIds.length} appointments as paid for booking agent`, 'success');
            await loadAllData();
        } catch (error) {
            console.error('[Finance v5] Error marking agent as paid:', error);
            showToast('Failed to mark agent as paid', 'error');
        }
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

    function getAgentName(agentId) {
        if (!agentId) return 'Unknown';
        const agent = users.find(u => u.id === agentId);
        if (!agent) return `Agent ${agentId}`;
        return agent.full_name || agent.username || `Agent ${agentId}`;
    }

    function getClientDisplay(knumber) {
        if (!knumber) return 'Unknown';
        const client = clients.find(c => (c.knumber || c.k_number) === knumber);
        if (!client) return knumber;
        const name = `${client.firstname || client.first_name || ''} ${client.lastname || client.last_name || ''}`.trim();
        return `<strong>${knumber}</strong> ${name}`;
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-CA', {
            style: 'currency',
            currency: 'CAD'
        }).format(amount || 0);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-CA');
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

    function showDatePickerModal(title, description) {
        return new Promise((resolve) => {
            const today = new Date();
            const localDateString = today.toISOString().split('T')[0];

            document.getElementById('datePickerTitle').textContent = title;
            document.getElementById('datePickerDescription').textContent = description;
            document.getElementById('datePickerInput').value = localDateString;

            const modal = document.getElementById('datePickerModal');
            const bsModal = new bootstrap.Modal(modal);

            const confirmBtn = document.getElementById('datePickerConfirm');
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener('click', () => {
                const selectedDate = document.getElementById('datePickerInput').value;
                const [year, month, day] = selectedDate.split('-').map(Number);
                const dateTime = new Date(year, month - 1, day, 23, 59, 59, 999);
                bsModal.hide();
                resolve(dateTime.toISOString());
            });

            modal.addEventListener('hidden.bs.modal', () => {
                resolve(null);
            }, { once: true });

            bsModal.show();
        });
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
        toggleClientGroup,
        toggleSelectAllPending,
        togglePendingSelection,
        openAppointmentForEdit,
        markAppointmentReady,
        bulkMarkReady,
        openCreateInvoiceModal,
        markInvoiceSent,
        markInvoicePaid,
        voidInvoice,
        markDriverPaid,
        markAgentPaid
    };

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', init);

})();
