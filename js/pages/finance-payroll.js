/**
 * Finance Payroll Tab - Driver payroll and staff pay
 * Version: 6.0.0
 */
(function() {
    'use strict';

    var payrollData = {
        driverGroups: [],
        staffEntries: [],
        staffMileage: {}
    };

    // =============================================
    // TAB LOADER
    // =============================================
    window.loadTab_payroll = async function() {
        console.log('[Finance Payroll] Loading tab...');
        showSkeleton(true);

        try {
            var period = FinanceState.payPeriod;
            if (!period) {
                period = PayPeriodManager.getPreviousPeriod();
                FinanceState.payPeriod = period;
            }

            updatePeriodDisplay();

            // Ensure appointments loaded
            if (!FinanceState.appointments || FinanceState.appointments.length === 0) {
                var response = await APIClient.get('/get-finance-appointments?tab=payroll').catch(function(err) {
                    console.warn('[Finance Payroll] Error loading appointments:', err);
                    return { data: [] };
                });
                // Handle array-wrapped n8n responses
                var raw = [];
                if (Array.isArray(response) && response.length > 0 && response[0].data) {
                    raw = response[0].data.appointments || response[0].data || [];
                } else if (response && response.data && response.data.appointments) {
                    raw = response.data.appointments;
                } else if (response && response.data && Array.isArray(response.data)) {
                    raw = response.data;
                } else if (response && response.appointments) {
                    raw = response.appointments;
                } else if (Array.isArray(response)) {
                    raw = response;
                }
                if (!Array.isArray(raw)) raw = [];
                FinanceState.appointments = raw;
            }

            // Load staff mileage entries for period
            try {
                var mileageResp = await APIClient.get('/get-staff-mileage', {
                    period_start: period.start.toISOString(),
                    period_end: period.end.toISOString()
                });
                var entries = mileageResp.data || mileageResp || [];
                payrollData.staffMileage = {};
                if (Array.isArray(entries)) {
                    entries.forEach(function(e) {
                        var uid = e.user_id || e.userId;
                        if (!payrollData.staffMileage[uid]) payrollData.staffMileage[uid] = [];
                        payrollData.staffMileage[uid].push(e);
                    });
                }
            } catch (err) {
                console.warn('[Finance Payroll] Staff mileage endpoint not available:', err.message);
                payrollData.staffMileage = {};
            }

            calculateDriverPayroll();
            calculateStaffPay();
            renderDriverPayroll();
            renderStaffPay();

        } catch (error) {
            console.error('[Finance Payroll] Load error:', error);
            FinanceUtils.showToast('Failed to load payroll data', 'danger');
        } finally {
            showSkeleton(false);
        }
    };

    // =============================================
    // PAY PERIOD SELECTOR
    // =============================================
    function updatePeriodDisplay() {
        var period = FinanceState.payPeriod;
        var display = document.getElementById('payPeriodDisplay');
        if (display) {
            display.textContent = PayPeriodManager.formatPeriod(period);
        }

        // Highlight active button
        var buttons = document.querySelectorAll('.pay-period-btn');
        buttons.forEach(function(btn) { btn.classList.remove('active'); });

        var label = period.label || '';
        if (label === 'Previous') activatePeriodBtn('btnPeriodPrevious');
        else if (label === 'Current') activatePeriodBtn('btnPeriodCurrent');
        else if (label === 'Next') activatePeriodBtn('btnPeriodNext');
        else if (label.startsWith('YTD')) activatePeriodBtn('btnPeriodYTD');
        else if (label === 'Custom') activatePeriodBtn('btnPeriodCustom');
    }

    function activatePeriodBtn(id) {
        var btn = document.getElementById(id);
        if (btn) btn.classList.add('active');
    }

    async function handlePeriodChange(periodType) {
        var period;
        if (periodType === 'previous') period = PayPeriodManager.getPreviousPeriod();
        else if (periodType === 'current') period = PayPeriodManager.getCurrentPeriod();
        else if (periodType === 'next') period = PayPeriodManager.getNextPeriod();
        else if (periodType === 'ytd') period = PayPeriodManager.getYTDPeriod();
        else if (periodType === 'custom') {
            var startEl = document.getElementById('customPeriodStart');
            var endEl = document.getElementById('customPeriodEnd');
            if (!startEl.value || !endEl.value) {
                FinanceUtils.showToast('Please select both start and end dates', 'warning');
                return;
            }
            period = PayPeriodManager.getCustomPeriod(startEl.value, endEl.value);
        }

        FinanceState.payPeriod = period;
        await window.loadTab_payroll();
    }

    // =============================================
    // DRIVER PAYROLL CALCULATION
    // =============================================
    function calculateDriverPayroll() {
        var period = FinanceState.payPeriod;

        var periodAppointments = FinanceState.appointments.filter(function(apt) {
            var aptDate = new Date(FinanceUtils.getAppointmentDate(apt));
            var opStatus = apt.operationStatus || apt.operation_status;
            var driverId = apt.driverAssigned || apt.driver_assigned;
            var deletedAt = apt.deletedAt || apt.deleted_at;

            return opStatus === 'completed' && driverId && !deletedAt &&
                   aptDate >= period.start && aptDate <= period.end;
        });

        // Sort by date for running YTD
        periodAppointments.sort(function(a, b) {
            return new Date(FinanceUtils.getAppointmentDate(a)) - new Date(FinanceUtils.getAppointmentDate(b));
        });

        var driverStats = {};

        periodAppointments.forEach(function(apt) {
            var driverId = apt.driverAssigned || apt.driver_assigned;
            var driver = FinanceState.drivers[driverId] || { id: driverId, pay_tier: 2 };

            if (!driverStats[driverId]) {
                driverStats[driverId] = {
                    driverId: driverId,
                    driverName: FinanceUtils.getDriverName(driverId),
                    payTier: driver.pay_tier || 2,
                    trips: 0,
                    totalMileage: 0,
                    totalMileageReimbursement: 0,
                    totalHoursToPay: 0,
                    totalPay: 0,
                    runningYtd: PayrollCalculator.getDriverYTDMileageUpTo(driverId, period.start),
                    appointments: [],
                    isPaid: false
                };
            }

            var stats = driverStats[driverId];
            var payroll = PayrollCalculator.calculateAppointmentPayroll(apt, driver, stats.runningYtd);

            stats.trips++;
            stats.totalMileage += payroll.driverMileage;
            stats.totalMileageReimbursement += payroll.mileageReimbursement;
            stats.totalHoursToPay += payroll.hoursToPay;
            stats.totalPay += payroll.totalPay;
            stats.runningYtd += payroll.driverMileage;

            if (apt.driverPaidAt || apt.driver_paid_at) stats.isPaid = true;

            stats.appointments.push({
                id: apt.id,
                date: FinanceUtils.getAppointmentDate(apt),
                knumber: apt.knumber || apt.k_number || '',
                clientName: apt.client_name || apt.clientName || ((apt.clientFirstName || apt.client_first_name || '') + ' ' + (apt.clientLastName || apt.client_last_name || '')).trim() || 'Unknown',
                payroll: payroll,
                runningYtdAfter: stats.runningYtd
            });
        });

        payrollData.driverGroups = Object.values(driverStats).sort(function(a, b) {
            return a.driverName.localeCompare(b.driverName);
        });
    }

    // =============================================
    // STAFF PAY CALCULATION
    // =============================================
    function calculateStaffPay() {
        var period = FinanceState.payPeriod;
        var entries = [];

        // Booking agents: 2hrs per completed appointment they managed
        var agentAppts = {};
        FinanceState.appointments.forEach(function(apt) {
            var aptDate = new Date(FinanceUtils.getAppointmentDate(apt));
            var opStatus = apt.operationStatus || apt.operation_status;
            var managedBy = apt.managedBy || apt.managed_by;
            var deletedAt = apt.deletedAt || apt.deleted_at;

            if (opStatus === 'completed' && managedBy && !deletedAt &&
                aptDate >= period.start && aptDate <= period.end) {
                if (!agentAppts[managedBy]) agentAppts[managedBy] = 0;
                agentAppts[managedBy]++;
            }
        });

        FinanceState.users.forEach(function(user) {
            if (user.role === 'booking_agent' && user.is_active !== false && user.active !== false) {
                var apptCount = agentAppts[user.id] || 0;
                var hours = apptCount * 2;
                var mileageEntries = payrollData.staffMileage[user.id] || [];
                var totalMileage = 0;
                mileageEntries.forEach(function(e) { totalMileage += parseFloat(e.km || e.mileage_km) || 0; });

                var ytdBefore = 0; // TODO: sum mileage entries for same user earlier in the year for accurate CRA threshold tracking
                var craMileage = CRACalculator.calculate(totalMileage, ytdBefore, period.start.getFullYear());

                entries.push({
                    userId: user.id,
                    name: user.full_name || user.username,
                    role: 'Booking Agent',
                    hoursLabel: apptCount + ' appts \u00d7 2 hrs = ' + hours + ' hrs',
                    hours: hours,
                    mileageKm: totalMileage,
                    craReimbursement: craMileage.reimbursement,
                    mileageEntries: mileageEntries
                });
            }
        });

        // Supervisors: 8hr/day for business days in period
        var businessDays = countBusinessDays(period.start, period.end);

        FinanceState.users.forEach(function(user) {
            if (user.role === 'supervisor' && user.is_active !== false && user.active !== false) {
                var hours = businessDays * 8;
                var mileageEntries = payrollData.staffMileage[user.id] || [];
                var totalMileage = 0;
                mileageEntries.forEach(function(e) { totalMileage += parseFloat(e.km || e.mileage_km) || 0; });

                var ytdBefore = 0; // TODO: sum mileage entries for same user earlier in the year for accurate CRA threshold tracking
                var craMileage = CRACalculator.calculate(totalMileage, ytdBefore, period.start.getFullYear());

                entries.push({
                    userId: user.id,
                    name: user.full_name || user.username,
                    role: 'Supervisor',
                    hoursLabel: businessDays + ' days \u00d7 8 hrs = ' + hours + ' hrs',
                    hours: hours,
                    mileageKm: totalMileage,
                    craReimbursement: craMileage.reimbursement,
                    mileageEntries: mileageEntries
                });
            }
        });

        payrollData.staffEntries = entries;
    }

    function countBusinessDays(start, end) {
        var count = 0;
        var d = new Date(start);
        while (d <= end) {
            var dow = d.getDay();
            if (dow !== 0 && dow !== 6) count++;
            d.setDate(d.getDate() + 1);
        }
        return count;
    }

    // =============================================
    // DRIVER PAYROLL RENDERING
    // =============================================
    function renderDriverPayroll() {
        var container = document.getElementById('driverPayrollContainer');
        if (!container) return;

        var groups = payrollData.driverGroups;

        if (groups.length === 0) {
            container.innerHTML = '<div class="text-center py-5 text-muted">' +
                '<i class="bi bi-inbox" style="font-size: 3rem; display: block; margin-bottom: 10px;"></i>' +
                'No driver activity in this period</div>';
            return;
        }

        var html = '';
        var grandTotals = { trips: 0, mileage: 0, mileageReimb: 0, hours: 0, pay: 0 };

        groups.forEach(function(stats, idx) {
            grandTotals.trips += stats.trips;
            grandTotals.mileage += stats.totalMileage;
            grandTotals.mileageReimb += stats.totalMileageReimbursement;
            grandTotals.hours += stats.totalHoursToPay;
            grandTotals.pay += stats.totalPay;

            var expandId = 'driver-payroll-' + idx;
            var tierLabel = 'Tier ' + stats.payTier;
            var paidBadge = stats.isPaid
                ? '<span class="badge bg-success">Paid</span>'
                : '<span class="badge bg-warning text-dark">Unpaid</span>';

            html += '<div class="card mb-2 driver-payroll-card">' +
                '<div class="card-body py-2 px-3 d-flex align-items-center justify-content-between cursor-pointer" ' +
                'data-bs-toggle="collapse" data-bs-target="#' + expandId + '">' +
                '<div class="d-flex align-items-center gap-3 flex-grow-1">' +
                '<i class="bi bi-chevron-right collapse-icon"></i>' +
                '<strong>' + FinanceUtils.escapeHtml(stats.driverName) + '</strong>' +
                '<span class="badge bg-secondary">' + FinanceUtils.escapeHtml(tierLabel) + '</span>' +
                paidBadge +
                '</div>' +
                '<div class="d-flex align-items-center gap-4 text-end payroll-summary-nums">' +
                '<span title="Trips">' + stats.trips + ' trips</span>' +
                '<span title="Hours">' + stats.totalHoursToPay.toFixed(1) + ' hrs</span>' +
                '<span title="Mileage">' + stats.totalMileage.toFixed(1) + ' km</span>' +
                '<span title="Mileage $">' + FinanceUtils.formatCurrency(stats.totalMileageReimbursement) + '</span>' +
                '<strong title="Total Pay">' + FinanceUtils.formatCurrency(stats.totalPay) + '</strong>' +
                '</div></div>' +
                '<div class="collapse" id="' + expandId + '">' +
                '<div class="card-body pt-0 px-3">' +
                renderDriverDetailTable(stats) +
                '</div></div></div>';
        });

        // Grand totals
        html += '<div class="card bg-light mt-3"><div class="card-body py-2 px-3 d-flex justify-content-between">' +
            '<strong>TOTALS (' + groups.length + ' drivers)</strong>' +
            '<div class="d-flex gap-4 text-end payroll-summary-nums">' +
            '<span>' + grandTotals.trips + ' trips</span>' +
            '<span>' + grandTotals.hours.toFixed(1) + ' hrs</span>' +
            '<span>' + grandTotals.mileage.toFixed(1) + ' km</span>' +
            '<span>' + FinanceUtils.formatCurrency(grandTotals.mileageReimb) + '</span>' +
            '<strong>' + FinanceUtils.formatCurrency(grandTotals.pay) + '</strong>' +
            '</div></div></div>';

        // Submit payroll button (admin only)
        if (FinanceState.currentUser && FinanceState.currentUser.role === 'admin') {
            html += '<div class="mt-3 text-end">' +
                '<button class="btn btn-primary" id="btnSubmitPayroll">' +
                '<i class="bi bi-send"></i> Submit Payroll</button></div>';
        }

        container.innerHTML = html;

        // Collapse icon rotation
        container.querySelectorAll('[data-bs-toggle="collapse"]').forEach(function(el) {
            var target = document.querySelector(el.dataset.bsTarget);
            if (target) {
                target.addEventListener('show.bs.collapse', function() {
                    el.querySelector('.collapse-icon').style.transform = 'rotate(90deg)';
                });
                target.addEventListener('hide.bs.collapse', function() {
                    el.querySelector('.collapse-icon').style.transform = '';
                });
            }
        });

        // Submit payroll handler
        var submitBtn = document.getElementById('btnSubmitPayroll');
        if (submitBtn) {
            submitBtn.addEventListener('click', handleSubmitPayroll);
        }

        // Mark paid buttons
        container.querySelectorAll('.btn-mark-driver-paid').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                markDriverPaid(btn.dataset.driverId);
            });
        });
    }

    function renderDriverDetailTable(stats) {
        var threshold = FinanceState.appConfig.cra_mileage_threshold || 5000;

        var html = '<table class="table table-sm table-bordered mb-0">' +
            '<thead><tr>' +
            '<th>Date</th><th>Client</th><th>Type</th><th class="text-end">Hours</th>' +
            '<th class="text-end">Mileage</th><th class="text-end">Running YTD</th>' +
            '<th class="text-end">CRA Rate</th><th class="text-end">Mileage $</th>' +
            '</tr></thead><tbody>';

        stats.appointments.forEach(function(item) {
            var p = item.payroll;
            var dateStr = FinanceUtils.formatDateShort(item.date);
            var ytdCrossed = item.runningYtdAfter >= threshold && (item.runningYtdAfter - p.driverMileage) < threshold;
            var ytdClass = ytdCrossed ? ' class="text-danger fw-bold"' : '';

            var rateDisplay = '';
            if (p.kmUnder > 0 && p.kmOver > 0) {
                rateDisplay = '<span class="badge bg-success cra-badge">$' + p.rateUnder.toFixed(2) + '</span> + ' +
                    '<span class="badge bg-warning text-dark cra-badge">$' + p.rateOver.toFixed(2) + '</span>';
            } else if (p.kmOver > 0) {
                rateDisplay = '<span class="badge bg-warning text-dark cra-badge">$' + p.rateOver.toFixed(2) + '</span>';
            } else {
                rateDisplay = '<span class="badge bg-success cra-badge">$' + p.rateUnder.toFixed(2) + '</span>';
            }

            html += '<tr>' +
                '<td>' + FinanceUtils.escapeHtml(dateStr) + '</td>' +
                '<td>' + FinanceUtils.escapeHtml(item.knumber) + ' ' + FinanceUtils.escapeHtml(item.clientName) + '</td>' +
                '<td><span class="badge ' + p.tripBadge + '">' + FinanceUtils.escapeHtml(p.tripType) + '</span> ' + p.billedHours + 'h</td>' +
                '<td class="text-end">' + p.hoursToPay.toFixed(2) + '</td>' +
                '<td class="text-end">' + p.driverMileage.toFixed(1) + ' km</td>' +
                '<td class="text-end"' + ytdClass + '>' + item.runningYtdAfter.toFixed(1) + ' km</td>' +
                '<td class="text-end">' + rateDisplay + '</td>' +
                '<td class="text-end">' + FinanceUtils.formatCurrency(p.mileageReimbursement) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';

        // CRA split summary
        var totalUnder = 0, totalOver = 0, totalReimb = 0;
        stats.appointments.forEach(function(item) {
            totalUnder += item.payroll.kmUnder;
            totalOver += item.payroll.kmOver;
            totalReimb += item.payroll.mileageReimbursement;
        });

        if (stats.appointments.length > 0) {
            var firstP = stats.appointments[0].payroll;
            html += '<div class="mt-2 small text-muted">' +
                'CRA Split: ' + totalUnder.toFixed(1) + ' km @ $' + firstP.rateUnder.toFixed(2) +
                ' + ' + totalOver.toFixed(1) + ' km @ $' + firstP.rateOver.toFixed(2) +
                ' = ' + FinanceUtils.formatCurrency(totalReimb) + '</div>';
        }

        return html;
    }

    // =============================================
    // STAFF PAY RENDERING
    // =============================================
    function renderStaffPay() {
        var container = document.getElementById('staffPayContainer');
        if (!container) return;

        var entries = payrollData.staffEntries;

        if (entries.length === 0) {
            container.innerHTML = '<div class="text-center py-4 text-muted">' +
                '<i class="bi bi-people" style="font-size: 2rem; display: block; margin-bottom: 8px;"></i>' +
                'No staff data for this period</div>';
            return;
        }

        var html = '<table class="table table-hover">' +
            '<thead><tr>' +
            '<th>Staff Member</th><th>Role</th><th>Hours</th>' +
            '<th class="text-end">Mileage (km)</th><th class="text-end">CRA Reimbursement</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        entries.forEach(function(entry) {
            html += '<tr>' +
                '<td>' + FinanceUtils.escapeHtml(entry.name) + '</td>' +
                '<td><span class="badge bg-info text-dark">' + FinanceUtils.escapeHtml(entry.role) + '</span></td>' +
                '<td>' + FinanceUtils.escapeHtml(entry.hoursLabel) + '</td>' +
                '<td class="text-end">' + entry.mileageKm.toFixed(1) + ' km</td>' +
                '<td class="text-end">' + FinanceUtils.formatCurrency(entry.craReimbursement) + '</td>' +
                '<td><button class="btn btn-sm btn-outline-primary btn-add-mileage" data-user-id="' + entry.userId + '" data-user-name="' + FinanceUtils.escapeHtml(entry.name) + '">' +
                '<i class="bi bi-plus-circle"></i> Add Mileage</button></td>' +
                '</tr>';

            // Existing mileage entries
            if (entry.mileageEntries.length > 0) {
                html += '<tr><td colspan="6" class="ps-4 pt-0 pb-2">' +
                    '<div class="staff-mileage-list">';
                entry.mileageEntries.forEach(function(me) {
                    var meDate = FinanceUtils.formatDateShort(me.date || me.entry_date);
                    var meKm = parseFloat(me.km || me.mileage_km) || 0;
                    var meDesc = me.description || '';
                    html += '<div class="d-flex justify-content-between align-items-center py-1 border-bottom staff-mileage-entry">' +
                        '<span>' + FinanceUtils.escapeHtml(meDate) + ' \u2014 ' + meKm.toFixed(1) + ' km' +
                        (meDesc ? ' \u2014 ' + FinanceUtils.escapeHtml(meDesc) : '') + '</span>' +
                        '<button class="btn btn-sm btn-outline-danger btn-delete-mileage" data-mileage-id="' + me.id + '" title="Delete">' +
                        '<i class="bi bi-trash"></i></button></div>';
                });
                html += '</div></td></tr>';
            }
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Add mileage button handlers
        container.querySelectorAll('.btn-add-mileage').forEach(function(btn) {
            btn.addEventListener('click', function() {
                openAddMileageModal(btn.dataset.userId, btn.dataset.userName);
            });
        });

        // Delete mileage handlers
        container.querySelectorAll('.btn-delete-mileage').forEach(function(btn) {
            btn.addEventListener('click', function() {
                deleteStaffMileage(btn.dataset.mileageId);
            });
        });
    }

    // =============================================
    // STAFF MILEAGE MODAL
    // =============================================
    function openAddMileageModal(userId, userName) {
        var nameEl = document.getElementById('mileageStaffName');
        var dateEl = document.getElementById('mileageDate');
        var kmEl = document.getElementById('mileageKm');
        var descEl = document.getElementById('mileageDescription');

        if (nameEl) nameEl.textContent = userName;
        if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
        if (kmEl) kmEl.value = '';
        if (descEl) descEl.value = '';

        var modal = document.getElementById('addMileageModal');
        var bsModal = new bootstrap.Modal(modal);

        var saveBtn = document.getElementById('btnSaveMileage');
        var newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);

        newBtn.addEventListener('click', async function() {
            var km = parseFloat(kmEl.value);
            if (!km || km <= 0) {
                FinanceUtils.showToast('Please enter a valid mileage', 'warning');
                return;
            }

            newBtn.disabled = true;
            newBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving...';

            try {
                await APIClient.post('/add-staff-mileage', {
                    user_id: userId,
                    date: dateEl.value,
                    mileage_km: km,
                    description: descEl.value || ''
                });

                bsModal.hide();
                FinanceUtils.showToast('Mileage entry added', 'success');
                await window.loadTab_payroll();

            } catch (error) {
                console.error('[Finance Payroll] Error adding mileage:', error);
                FinanceUtils.showToast('Failed to add mileage entry', 'danger');
            } finally {
                newBtn.disabled = false;
                newBtn.innerHTML = 'Save';
            }
        });

        bsModal.show();
    }

    async function deleteStaffMileage(mileageId) {
        if (!confirm('Delete this mileage entry?')) return;

        try {
            await APIClient.post('/delete-staff-mileage', { id: mileageId });
            FinanceUtils.showToast('Mileage entry deleted', 'success');
            await window.loadTab_payroll();
        } catch (error) {
            console.error('[Finance Payroll] Error deleting mileage:', error);
            FinanceUtils.showToast('Failed to delete mileage entry', 'danger');
        }
    }

    // =============================================
    // ACTIONS
    // =============================================
    async function markDriverPaid(driverId) {
        var selectedDate = await showDatePickerModal('Mark Driver as Paid', 'When was this driver paid?');
        if (!selectedDate) return;

        try {
            var period = FinanceState.payPeriod;
            var unpaid = FinanceState.appointments.filter(function(apt) {
                var aptDate = new Date(FinanceUtils.getAppointmentDate(apt));
                var opStatus = apt.operationStatus || apt.operation_status;
                var driver = apt.driverAssigned || apt.driver_assigned;
                var paidAt = apt.driverPaidAt || apt.driver_paid_at;
                var deletedAt = apt.deletedAt || apt.deleted_at;

                return opStatus === 'completed' && String(driver) === String(driverId) && !paidAt && !deletedAt &&
                       aptDate >= period.start && aptDate <= period.end;
            });

            var appointmentIds = unpaid.map(function(a) { return a.id; });
            await APIClient.post('/mark-driver-paid', {
                appointmentIds: appointmentIds,
                driver_paid_at: selectedDate
            });

            await logFinanceAudit('mark_driver_paid', 'driver', driverId, {
                driver_name: FinanceUtils.getDriverName(driverId),
                payment_date: selectedDate,
                appointment_count: appointmentIds.length
            });

            FinanceUtils.showToast('Marked ' + appointmentIds.length + ' appointments as paid for driver', 'success');
            await window.loadTab_payroll();

        } catch (error) {
            console.error('[Finance Payroll] Error marking driver paid:', error);
            FinanceUtils.showToast('Failed to mark driver as paid', 'danger');
        }
    }

    async function handleSubmitPayroll() {
        var btn = document.getElementById('btnSubmitPayroll');
        if (!confirm('Submit payroll for this period? This will finalize all driver and staff payments.')) return;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Submitting...';
        }

        try {
            var period = FinanceState.payPeriod;
            await APIClient.post('/submit-payroll', {
                period_start: period.start.toISOString(),
                period_end: period.end.toISOString(),
                driver_summaries: payrollData.driverGroups.map(function(g) {
                    return {
                        driver_id: g.driverId,
                        trips: g.trips,
                        total_pay: g.totalPay,
                        total_mileage: g.totalMileage,
                        mileage_reimbursement: g.totalMileageReimbursement
                    };
                }),
                staff_summaries: payrollData.staffEntries.map(function(e) {
                    return {
                        user_id: e.userId,
                        role: e.role,
                        hours: e.hours,
                        mileage_km: e.mileageKm,
                        cra_reimbursement: e.craReimbursement
                    };
                })
            });

            await logFinanceAudit('submit_payroll', 'payroll', 'period', {
                period_start: period.start.toISOString(),
                period_end: period.end.toISOString()
            });

            FinanceUtils.showToast('Payroll submitted successfully', 'success');

        } catch (error) {
            console.error('[Finance Payroll] Error submitting payroll:', error);
            FinanceUtils.showToast('Failed to submit payroll', 'danger');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-send"></i> Submit Payroll';
            }
        }
    }

    // =============================================
    // SKELETON
    // =============================================
    function showSkeleton(show) {
        var skeleton = document.getElementById('payrollSkeleton');
        var content = document.getElementById('payrollContent');
        if (skeleton) skeleton.style.display = show ? 'block' : 'none';
        if (content) content.style.display = show ? 'none' : 'block';
    }

    // =============================================
    // EVENT DELEGATION
    // =============================================
    document.addEventListener('DOMContentLoaded', function() {
        // Period selector buttons
        ['previous', 'current', 'next', 'ytd'].forEach(function(type) {
            var btn = document.getElementById('btnPeriod' + type.charAt(0).toUpperCase() + type.slice(1));
            if (btn) {
                btn.addEventListener('click', function() { handlePeriodChange(type); });
            }
        });

        // Custom date range toggle
        var customBtn = document.getElementById('btnPeriodCustom');
        if (customBtn) {
            customBtn.addEventListener('click', function() {
                var customRange = document.getElementById('customPeriodRange');
                if (customRange) customRange.style.display = customRange.style.display === 'none' ? 'flex' : 'none';
            });
        }

        // Apply custom date range
        var applyCustomBtn = document.getElementById('btnApplyCustomPeriod');
        if (applyCustomBtn) {
            applyCustomBtn.addEventListener('click', function() {
                handlePeriodChange('custom');
            });
        }
    });

    console.log('[Finance] Payroll v6.0.0 loaded');
})();
