/**
 * Finance Core - Shared state, cache, utilities, and tab management
 * Version: 6.0.0
 */
(function() {
    'use strict';

    // =============================================
    // DATA CACHE
    // =============================================
    class DataCache {
        constructor(prefix = 'rrts_finance_v6_') {
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

    // =============================================
    // SHARED STATE
    // =============================================
    window.FinanceState = {
        cache: new DataCache(),
        currentUser: null,
        appointments: [],
        clients: {},
        drivers: {},
        users: [],
        appConfig: {},
        activeTab: 'review',
        staleTabs: new Set(),
        payPeriod: null,
        selectedPendingAppointments: new Set()
    };

    // Default config values
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
        billing_round_trip: 900,
        billing_one_way: 250,
        billing_support: 0,
        billing_standard_hours: 4,
        billing_overtime_hourly: 250
    };

    window.FINANCE_DEFAULT_CONFIG = DEFAULT_CONFIG;

    // =============================================
    // PAY PERIOD CALCULATIONS
    // =============================================
    function parseLocalDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day, 0, 0, 0, 0);
    }

    window.PayPeriodManager = {
        ANCHOR_DATE_STR: '2025-10-26',
        PERIOD_DAYS: 14,

        _getConfig() {
            const cfg = FinanceState.appConfig;
            return {
                startDate: cfg.pay_period_start_date || this.ANCHOR_DATE_STR,
                periodDays: cfg.pay_period_days || this.PERIOD_DAYS
            };
        },

        getCurrentPeriod() {
            const c = this._getConfig();
            const startDate = parseLocalDate(c.startDate);
            const periodDays = c.periodDays;
            const today = new Date();

            const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
            const periodsElapsed = Math.floor(daysSinceStart / periodDays);

            const periodStart = new Date(startDate);
            periodStart.setDate(periodStart.getDate() + (periodsElapsed * periodDays));

            const periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + periodDays - 1);
            periodEnd.setHours(23, 59, 59, 999);

            return { start: periodStart, end: periodEnd, label: 'Current' };
        },

        getPreviousPeriod() {
            const c = this._getConfig();
            const current = this.getCurrentPeriod();

            const prevStart = new Date(current.start);
            prevStart.setDate(prevStart.getDate() - c.periodDays);

            const prevEnd = new Date(prevStart);
            prevEnd.setDate(prevEnd.getDate() + c.periodDays - 1);
            prevEnd.setHours(23, 59, 59, 999);

            return { start: prevStart, end: prevEnd, label: 'Previous' };
        },

        getNextPeriod() {
            const c = this._getConfig();
            const current = this.getCurrentPeriod();

            const nextStart = new Date(current.start);
            nextStart.setDate(nextStart.getDate() + c.periodDays);

            const nextEnd = new Date(nextStart);
            nextEnd.setDate(nextEnd.getDate() + c.periodDays - 1);
            nextEnd.setHours(23, 59, 59, 999);

            return { start: nextStart, end: nextEnd, label: 'Next' };
        },

        getYTDPeriod() {
            const now = new Date();
            return {
                start: new Date(now.getFullYear(), 0, 1),
                end: now,
                label: 'YTD ' + now.getFullYear()
            };
        },

        getCustomPeriod(start, end) {
            return {
                start: new Date(start + 'T00:00:00'),
                end: new Date(end + 'T23:59:59.999'),
                label: 'Custom'
            };
        },

        formatPeriod(period) {
            const opts = { month: 'short', day: 'numeric', year: 'numeric' };
            return period.start.toLocaleDateString('en-CA', opts) + ' \u2014 ' + period.end.toLocaleDateString('en-CA', opts);
        }
    };

    // =============================================
    // CRA MILEAGE CALCULATION
    // =============================================
    window.CRACalculator = {
        calculate(mileageKm, ytdBeforeKm, year, craRates) {
            let rateUnder, rateOver;

            if (craRates && typeof craRates === 'object') {
                const yearRates = craRates[year.toString()] || craRates[Object.keys(craRates).pop()];
                if (yearRates) {
                    rateUnder = yearRates.under;
                    rateOver = yearRates.over;
                }
            }

            if (!rateUnder) rateUnder = FinanceState.appConfig.cra_mileage_rate_under_5000 || DEFAULT_CONFIG.cra_mileage_rate_under_5000;
            if (!rateOver) rateOver = FinanceState.appConfig.cra_mileage_rate_over_5000 || DEFAULT_CONFIG.cra_mileage_rate_over_5000;

            const threshold = FinanceState.appConfig.cra_mileage_threshold || DEFAULT_CONFIG.cra_mileage_threshold;
            const remainingUnder = Math.max(0, threshold - ytdBeforeKm);
            const kmUnder = Math.min(mileageKm, remainingUnder);
            const kmOver = Math.max(0, mileageKm - kmUnder);

            return {
                kmUnder,
                kmOver,
                rateUnder,
                rateOver,
                reimbursement: Math.round((kmUnder * rateUnder + kmOver * rateOver) * 100) / 100,
                newYtd: ytdBeforeKm + mileageKm
            };
        }
    };

    // =============================================
    // BILLING CALCULATOR
    // =============================================
    window.BillingCalculator = {
        calculate(appointmentType, hours, billingRates, customRate) {
            if (customRate != null && customRate !== '') return parseFloat(customRate);

            const cfg = FinanceState.appConfig;
            const rates = billingRates || {
                round_trip: cfg.billing_round_trip || DEFAULT_CONFIG.billing_round_trip,
                one_way: cfg.billing_one_way || DEFAULT_CONFIG.billing_one_way,
                support: cfg.billing_support || DEFAULT_CONFIG.billing_support,
                standard_hours: cfg.billing_standard_hours || DEFAULT_CONFIG.billing_standard_hours,
                overtime_hourly: cfg.billing_overtime_hourly || DEFAULT_CONFIG.billing_overtime_hourly
            };

            switch (appointmentType) {
                case 'one_way': return rates.one_way;
                case 'support': return rates.support;
                case 'round_trip':
                default:
                    if (hours > rates.standard_hours) {
                        return rates.round_trip + (hours - rates.standard_hours) * rates.overtime_hourly;
                    }
                    return rates.round_trip;
            }
        }
    };

    // =============================================
    // PAYROLL CALCULATORS (from finance.js v5)
    // =============================================
    window.PayrollCalculator = {
        getTierConfig(payTier) {
            const tier = payTier || 2;
            const cfg = FinanceState.appConfig;
            return {
                hourlyRate: cfg['pay_tier_' + tier + '_hourly'] || DEFAULT_CONFIG['pay_tier_' + tier + '_hourly'] || 75,
                percentage: cfg['pay_tier_' + tier + '_percentage'] || DEFAULT_CONFIG['pay_tier_' + tier + '_percentage'] || 0.33,
                label: 'Tier ' + tier
            };
        },

        getTripType(appointment) {
            var apptType = appointment.appointment_type || appointment.appointmentType;

            if (apptType === 'one_way') {
                return { type: 'One-Way', billedHours: 1, badge: 'trip-oneway' };
            }

            if (apptType === 'support') {
                return { type: 'Support', billedHours: 0, badge: 'trip-support' };
            }

            // For round_trip or unknown types, check actual hours for overtime
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
        },

        calculateAppointmentPayroll(appointment, driver, ytdBefore) {
            const tierConfig = this.getTierConfig(driver.pay_tier);
            const tripType = this.getTripType(appointment);

            const driverMileage = parseFloat(appointment.driverMileage || appointment.driver_mileage) ||
                                  (parseFloat(appointment.tripdistance || appointment.trip_distance) / 1000) || 0;

            const year = new Date(appointment.appointmenttime || appointment.appointmentDateTime || appointment.appointment_time).getFullYear();
            const mileageCalc = CRACalculator.calculate(driverMileage, ytdBefore, year);

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
                rateUnder: mileageCalc.rateUnder,
                rateOver: mileageCalc.rateOver,
                hoursToPay: Math.round(hoursToPay * 100) / 100,
                tripType: tripType.type,
                billedHours: tripType.billedHours,
                tripBadge: tripType.badge,
                tierConfig
            };
        },

        getDriverYTDMileageUpTo(driverId, upToDate) {
            const driver = FinanceState.drivers[driverId] ||
                           Object.values(FinanceState.drivers).find(d => d.id === driverId);
            if (!driver || !driver.mileage_ytd) return 0;

            const year = upToDate.getFullYear().toString();
            const yearData = driver.mileage_ytd[year];
            if (!yearData) return 0;

            var upToMonth = upToDate.getMonth(); // 0-indexed

            var ytdMileage = 0;
            for (var i = 0; i < upToMonth; i++) {
                var monthKey = String(i + 1).padStart(2, '0'); // '01'..'12'
                ytdMileage += yearData[monthKey] || 0;
            }
            return ytdMileage;
        }
    };

    // =============================================
    // FORMATTING UTILITIES
    // =============================================
    window.FinanceUtils = {
        formatCurrency(amount) {
            return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);
        },

        formatMileage(km) {
            return km != null ? parseFloat(km).toFixed(1) + ' km' : '\u2014';
        },

        formatHours(hours) {
            return hours != null ? parseFloat(hours).toFixed(1) + ' hrs' : '\u2014';
        },

        formatDate(dateStr) {
            if (!dateStr) return '\u2014';
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Halifax' });
        },

        formatDateShort(dateStr) {
            if (!dateStr) return '\u2014';
            return new Date(dateStr).toLocaleDateString('en-CA');
        },

        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        showToast(message, type) {
            if (type === undefined) type = 'success';
            const container = document.getElementById('toastContainer');
            if (!container) return;

            const toastId = 'toast-' + Date.now();
            var bgClass;
            if (type === 'error' || type === 'danger') bgClass = 'bg-danger';
            else if (type === 'success') bgClass = 'bg-success';
            else if (type === 'warning') bgClass = 'bg-warning text-dark';
            else bgClass = 'bg-primary';

            var toastHtml = '<div id="' + toastId + '" class="toast ' + bgClass + ' text-white" role="alert">' +
                '<div class="toast-body d-flex justify-content-between align-items-center">' +
                FinanceUtils.escapeHtml(message) +
                '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>' +
                '</div></div>';

            container.insertAdjacentHTML('beforeend', toastHtml);
            var toastEl = document.getElementById(toastId);
            var toast = new bootstrap.Toast(toastEl, { delay: 5000 });
            toast.show();
            toastEl.addEventListener('hidden.bs.toast', function() { toastEl.remove(); });
        },

        getDriverName(driverId) {
            if (!driverId) return 'Unassigned';
            var driver = FinanceState.drivers[driverId];
            if (!driver) return 'Driver ' + driverId;
            return driver.name || ((driver.first_name || '') + ' ' + (driver.last_name || '')).trim() || 'Driver ' + driverId;
        },

        getClientName(knumber) {
            if (!knumber) return 'Unknown';
            var client = FinanceState.clients[knumber];
            if (!client) return knumber;
            return ((client.firstname || client.first_name || '') + ' ' + (client.lastname || client.last_name || '')).trim() || knumber;
        },

        getClientDisplay(knumber) {
            if (!knumber) return 'Unknown';
            var client = FinanceState.clients[knumber];
            if (!client) return FinanceUtils.escapeHtml(knumber);
            var name = ((client.firstname || client.first_name || '') + ' ' + (client.lastname || client.last_name || '')).trim();
            return '<strong>' + FinanceUtils.escapeHtml(knumber) + '</strong> ' + FinanceUtils.escapeHtml(name);
        },

        getAgentName(agentId) {
            if (!agentId) return 'Unknown';
            var agent = FinanceState.users.find(function(u) { return u.id === agentId; });
            if (!agent) return 'Agent ' + agentId;
            return agent.full_name || agent.username || 'Agent ' + agentId;
        },

        getAppointmentDate(apt) {
            return apt.appointmenttime || apt.appointmentDateTime || apt.appointment_time;
        }
    };

    // =============================================
    // TAB MANAGEMENT
    // =============================================
    window.TabManager = {
        tabLoaded: { review: false, payroll: false, invoicing: false },

        init() {
            var self = this;
            var tabEls = document.querySelectorAll('#financeTabs button[data-bs-toggle="tab"]');
            tabEls.forEach(function(tab) {
                tab.addEventListener('shown.bs.tab', function(e) {
                    var tabName = e.target.id.replace('tab-', '');
                    FinanceState.activeTab = tabName;
                    self.clearStaleIndicator(tabName);

                    if (FinanceState.staleTabs.has(tabName) || !self.tabLoaded[tabName]) {
                        FinanceState.staleTabs.delete(tabName);
                        self.loadTab(tabName);
                    }
                });
            });
        },

        async loadTab(tabName) {
            if (window['loadTab_' + tabName]) {
                await window['loadTab_' + tabName]();
                this.tabLoaded[tabName] = true;
            }
        },

        markStale(tabName) {
            if (tabName !== FinanceState.activeTab) {
                FinanceState.staleTabs.add(tabName);
                var tabBtn = document.getElementById('tab-' + tabName);
                if (tabBtn && !tabBtn.querySelector('.stale-indicator')) {
                    tabBtn.insertAdjacentHTML('beforeend',
                        '<span class="stale-indicator ms-1" style="color: #e74c3c;">&#9679;</span>');
                }
            }
        },

        clearStaleIndicator(tabName) {
            var indicator = document.querySelector('#tab-' + tabName + ' .stale-indicator');
            if (indicator) indicator.remove();
        },

        invalidateAll() {
            this.tabLoaded = { review: false, payroll: false, invoicing: false };
            FinanceState.staleTabs.add('review');
            FinanceState.staleTabs.add('payroll');
            FinanceState.staleTabs.add('invoicing');
        }
    };

    // =============================================
    // DATA LOADING
    // =============================================
    window.FinanceDataLoader = {
        async loadAppConfig() {
            try {
                var cached = FinanceState.cache.get('appConfig');
                if (cached) {
                    FinanceState.appConfig = cached;
                    return;
                }

                var response = await APIClient.get('/get-app-config');
                var configArray = response.data || response || [];
                var config = Object.assign({}, DEFAULT_CONFIG);

                configArray.forEach(function(item) {
                    var value = parseFloat(item.config_value);
                    config[item.config_key] = isNaN(value) ? item.config_value : value;
                });

                FinanceState.appConfig = config;
                FinanceState.cache.set('appConfig', config, 10 * 60 * 1000);
            } catch (error) {
                console.warn('[Finance] Failed to load app config, using defaults:', error);
                FinanceState.appConfig = Object.assign({}, DEFAULT_CONFIG);
            }
        },

        async loadSharedData() {
            try {
                var results = await Promise.all([
                    APIClient.get('/get-all-drivers').catch(function(err) {
                        console.warn('[Finance] Error loading drivers:', err);
                        return { data: [] };
                    }),
                    APIClient.get('/get-all-clients').catch(function(err) {
                        console.warn('[Finance] Error loading clients:', err);
                        return { data: [] };
                    }),
                    APIClient.get('/get-all-users').catch(function(err) {
                        console.warn('[Finance] Error loading users:', err);
                        return { data: [] };
                    })
                ]);

                var driversData = results[0];
                var clientsData = results[1];
                var usersData = results[2];

                var driversArr = driversData.drivers || driversData.data || driversData || [];
                if (!Array.isArray(driversArr)) driversArr = [];
                FinanceState.drivers = {};
                driversArr.forEach(function(d) { FinanceState.drivers[d.id] = d; });

                var clientsArr = clientsData.data || clientsData.clients || clientsData || [];
                if (!Array.isArray(clientsArr)) clientsArr = [];
                FinanceState.clients = {};
                clientsArr.forEach(function(c) {
                    var k = c.knumber || c.k_number;
                    if (k) FinanceState.clients[k] = c;
                });

                var usersArr = usersData.data || usersData.users || usersData || [];
                if (!Array.isArray(usersArr)) usersArr = [];
                FinanceState.users = usersArr;

                console.log('[Finance] Loaded: ' + driversArr.length + ' drivers, ' + clientsArr.length + ' clients, ' + usersArr.length + ' users');
            } catch (error) {
                console.error('[Finance] Error loading shared data:', error);
            }
        }
    };

    // =============================================
    // AUDIT LOGGING
    // =============================================
    window.logFinanceAudit = async function(action, resourceType, resourceId, details) {
        if (!details) details = {};
        try {
            var user = FinanceState.currentUser;
            if (!user) {
                console.warn('[Audit] Cannot log event: no user context');
                return;
            }

            var auditData = {
                user_id: user.id || null,
                username: user.username,
                role: user.role,
                action: action,
                resource_type: resourceType,
                resource_id: resourceId,
                details: Object.assign({
                    timestamp: new Date().toISOString(),
                    page: 'finance-v6'
                }, details)
            };

            await APIClient.post('/store-audit-log', auditData);
        } catch (error) {
            console.error('[Audit] Error storing audit log:', error);
        }
    };

    // =============================================
    // SKELETON HELPERS
    // =============================================
    window.FinanceSkeleton = {
        showTableSkeleton(containerId, cols, rows) {
            if (!cols) cols = 6;
            if (!rows) rows = 5;
            var el = document.getElementById(containerId);
            if (!el) return;

            var html = '';
            for (var r = 0; r < rows; r++) {
                html += '<tr>';
                for (var c = 0; c < cols; c++) {
                    var w = (c === 0) ? '60%' : (c === cols - 1 ? '40%' : '50%');
                    html += '<td><div class="skeleton" style="height: 18px; width: ' + w + ';"></div></td>';
                }
                html += '</tr>';
            }
            el.innerHTML = html;
        },

        showCardSkeleton(containerId, count) {
            if (!count) count = 3;
            var el = document.getElementById(containerId);
            if (!el) return;

            var html = '';
            for (var i = 0; i < count; i++) {
                html += '<div class="card mb-3"><div class="card-body">' +
                    '<div class="skeleton" style="height: 20px; width: 40%; margin-bottom: 10px;"></div>' +
                    '<div class="skeleton" style="height: 14px; width: 70%; margin-bottom: 8px;"></div>' +
                    '<div class="skeleton" style="height: 14px; width: 55%;"></div>' +
                    '</div></div>';
            }
            el.innerHTML = html;
        }
    };

    // =============================================
    // DATE PICKER MODAL HELPER
    // =============================================
    window.showDatePickerModal = function(title, description) {
        return new Promise(function(resolve) {
            var resolved = false;
            var today = new Date().toISOString().split('T')[0];

            document.getElementById('datePickerTitle').textContent = title;
            document.getElementById('datePickerDescription').textContent = description;
            document.getElementById('datePickerInput').value = today;

            var modal = document.getElementById('datePickerModal');
            var bsModal = new bootstrap.Modal(modal);

            var confirmBtn = document.getElementById('datePickerConfirm');
            var newBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

            newBtn.addEventListener('click', function() {
                if (resolved) return;
                resolved = true;
                var val = document.getElementById('datePickerInput').value;
                var parts = val.split('-').map(Number);
                var dt = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
                resolve(dt.toISOString());
                bsModal.hide();
            });

            modal.addEventListener('hidden.bs.modal', function() {
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            }, { once: true });

            bsModal.show();
        });
    };

    // =============================================
    // PAGE INITIALIZATION
    // =============================================
    document.addEventListener('DOMContentLoaded', async function() {
        try {
            await requireAuth('dashboard.html');
            var user = getCurrentUser();
            if (!user) {
                window.location.href = 'dashboard.html';
                return;
            }
            FinanceState.currentUser = user;

            if (!hasPageAccess(user.role, 'finance')) {
                window.location.href = 'dashboard.html';
                return;
            }

            if (typeof initializeNavigation === 'function') initializeNavigation();
            if (typeof setupMobileMenu === 'function') setupMobileMenu();

            // Load config + shared data
            await FinanceDataLoader.loadAppConfig();
            await FinanceDataLoader.loadSharedData();

            // Default pay period
            FinanceState.payPeriod = PayPeriodManager.getPreviousPeriod();

            // Init tabs
            TabManager.init();

            // Load review tab immediately
            if (window.loadTab_review) {
                await window.loadTab_review();
                TabManager.tabLoaded.review = true;
            }

        } catch (error) {
            console.error('[Finance] Init error:', error);
        }
    });

    console.log('[Finance] Core v6.0.0 loaded');
})();
