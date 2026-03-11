/**
 * Finance Review Tab - Appointment Review for finance approval
 * Version: 6.3.0
 */
(function() {
    'use strict';

    var filterState = {
        dateFrom: '',
        dateTo: '',
        driverId: '',
        clientKnumber: ''
    };
    var selectedCompletionAppointments = new Set();

    // =============================================
    // TAB LOADER (registered globally)
    // =============================================
    window.loadTab_review = async function() {
        console.log('[Finance Review] Loading tab...');
        showSkeleton(true);

        try {
            var response = await APIClient.get('/get-finance-appointments').catch(function(err) {
                console.warn('[Finance Review] Error loading appointments:', err);
                return { data: [] };
            });

            // n8n returns array-wrapped response: [{ success, data: { appointments: [] } }]
            // Handle that plus direct object and flat array formats
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

            populateFilterDropdowns();
            renderReviewTable(getFilteredAppointments());
            renderNeedsCompletionTable(getNeedsCompletionAppointments());
            updateReviewCount();

        } catch (error) {
            console.error('[Finance Review] Load error:', error);
            FinanceUtils.showToast('Failed to load appointment data', 'danger');
        } finally {
            showSkeleton(false);
        }
    };

    // =============================================
    // FILTERING
    // =============================================
    function getFilteredAppointments() {
        var pending = FinanceState.appointments.filter(function(apt) {
            var opStatus = apt.operationStatus || apt.operation_status;
            var invStatus = apt.invoiceStatus || apt.invoice_status;
            var deletedAt = apt.deletedAt || apt.deleted_at;
            return opStatus === 'completed' && (!invStatus || invStatus === 'not_ready') && !deletedAt;
        });

        // Apply filters
        if (filterState.dateFrom) {
            var from = new Date(filterState.dateFrom + 'T00:00:00');
            pending = pending.filter(function(apt) {
                return new Date(FinanceUtils.getAppointmentDate(apt)) >= from;
            });
        }
        if (filterState.dateTo) {
            var to = new Date(filterState.dateTo + 'T23:59:59.999');
            pending = pending.filter(function(apt) {
                return new Date(FinanceUtils.getAppointmentDate(apt)) <= to;
            });
        }
        if (filterState.driverId) {
            pending = pending.filter(function(apt) {
                return String(apt.driverAssigned || apt.driver_assigned) === String(filterState.driverId);
            });
        }
        if (filterState.clientKnumber) {
            pending = pending.filter(function(apt) {
                return (apt.knumber || apt.k_number) === filterState.clientKnumber;
            });
        }

        // Sort oldest first
        pending.sort(function(a, b) {
            return new Date(FinanceUtils.getAppointmentDate(a)) - new Date(FinanceUtils.getAppointmentDate(b));
        });

        return pending;
    }

    function getNeedsCompletionAppointments() {
        var now = new Date();
        var pending = FinanceState.appointments.filter(function(apt) {
            var opStatus = apt.operationStatus || apt.operation_status;
            var deletedAt = apt.deletedAt || apt.deleted_at;
            if (opStatus !== 'assigned' || deletedAt) return false;
            var aptDate = new Date(FinanceUtils.getAppointmentDate(apt));
            return aptDate < now;
        });

        // Apply same filters as review table
        if (filterState.dateFrom) {
            var from = new Date(filterState.dateFrom + 'T00:00:00');
            pending = pending.filter(function(apt) {
                return new Date(FinanceUtils.getAppointmentDate(apt)) >= from;
            });
        }
        if (filterState.dateTo) {
            var to = new Date(filterState.dateTo + 'T23:59:59.999');
            pending = pending.filter(function(apt) {
                return new Date(FinanceUtils.getAppointmentDate(apt)) <= to;
            });
        }
        if (filterState.driverId) {
            pending = pending.filter(function(apt) {
                return String(apt.driverAssigned || apt.driver_assigned) === String(filterState.driverId);
            });
        }
        if (filterState.clientKnumber) {
            pending = pending.filter(function(apt) {
                return (apt.knumber || apt.k_number) === filterState.clientKnumber;
            });
        }

        pending.sort(function(a, b) {
            return new Date(FinanceUtils.getAppointmentDate(a)) - new Date(FinanceUtils.getAppointmentDate(b));
        });

        return pending;
    }

    function populateFilterDropdowns() {
        // Driver dropdown
        var driverSelect = document.getElementById('reviewDriverFilter');
        if (driverSelect) {
            var currentVal = driverSelect.value;
            var html = '<option value="">All Drivers</option>';
            var drivers = Object.values(FinanceState.drivers);
            drivers.sort(function(a, b) {
                var na = a.name || (a.first_name + ' ' + a.last_name);
                var nb = b.name || (b.first_name + ' ' + b.last_name);
                return na.localeCompare(nb);
            });
            drivers.forEach(function(d) {
                var name = FinanceUtils.escapeHtml(d.name || ((d.first_name || '') + ' ' + (d.last_name || '')).trim());
                html += '<option value="' + d.id + '">' + name + '</option>';
            });
            driverSelect.innerHTML = html;
            if (currentVal) driverSelect.value = currentVal;
        }

        // Client dropdown
        var clientSelect = document.getElementById('reviewClientFilter');
        if (clientSelect) {
            var currentVal2 = clientSelect.value;
            var html2 = '<option value="">All Clients</option>';
            var clientKnumbers = new Set();
            FinanceState.appointments.forEach(function(apt) {
                var k = apt.knumber || apt.k_number;
                if (k) clientKnumbers.add(k);
            });
            var sortedK = Array.from(clientKnumbers).sort();
            sortedK.forEach(function(k) {
                var name = FinanceUtils.escapeHtml(FinanceUtils.getClientName(k));
                html2 += '<option value="' + FinanceUtils.escapeHtml(k) + '">' + FinanceUtils.escapeHtml(k) + ' - ' + name + '</option>';
            });
            clientSelect.innerHTML = html2;
            if (currentVal2) clientSelect.value = currentVal2;
        }
    }

    // =============================================
    // RENDERING
    // =============================================
    function renderReviewTable(appointments) {
        var tbody = document.getElementById('reviewTableBody');
        if (!tbody) return;

        var selected = FinanceState.selectedPendingAppointments;

        if (appointments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted">' +
                '<i class="bi bi-check-circle" style="font-size: 3rem; display: block; margin-bottom: 10px;"></i>' +
                'All completed appointments have been reviewed!</td></tr>';
            updateBulkBar();
            return;
        }

        var html = '';
        appointments.forEach(function(apt) {
            var aptId = apt.id;
            var aptDate = new Date(FinanceUtils.getAppointmentDate(apt));
            var knumber = FinanceUtils.escapeHtml(apt.knumber || apt.k_number || '');
            var clientName = apt.client_name || apt.clientName || '';
            if (!clientName) {
                var clientFirst = apt.clientFirstName || apt.client_first_name || '';
                var clientLast = apt.clientLastName || apt.client_last_name || '';
                clientName = (clientFirst + ' ' + clientLast).trim();
            }
            clientName = FinanceUtils.escapeHtml(clientName || 'Unknown');
            var driverName = FinanceUtils.escapeHtml(FinanceUtils.getDriverName(apt.driverAssigned || apt.driver_assigned));
            var appointmentType = apt.appointment_type || apt.appointmentType || 'round_trip';
            var typeLabel = appointmentType === 'one_way' ? 'One-Way' : appointmentType === 'support' ? 'Support' : 'Round Trip';

            var hours = parseFloat(apt.approved_hours || apt.driver_work_duration || apt.this_appointment_length || apt.appointmentLength || apt.appointment_length) || 0;
            var hoursDisplay = hours > 0 ? (hours / 60).toFixed(1) : '\u2014';

            var mileage = parseFloat(apt.driver_total_distance || apt.driverMileage || apt.driver_mileage ||
                          (parseFloat(apt.tripdistance || apt.trip_distance) / 1000)) || 0;
            var mileageDisplay = mileage > 0 ? mileage.toFixed(1) : '\u2014';

            var rate = parseFloat(apt.customRate || apt.custom_rate) || 0;
            var isSelected = selected.has(String(aptId));

            var dateStr = aptDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Halifax' });

            html += '<tr data-appointment-id="' + aptId + '">' +
                '<td>' +
                '<input type="checkbox" class="form-check-input review-checkbox" data-id="' + aptId + '"' +
                (isSelected ? ' checked' : '') + '>' +
                '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + FinanceUtils.escapeHtml(dateStr) + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '"><strong>' + knumber + '</strong> ' + clientName + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + driverName + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '"><span class="badge bg-secondary">' + FinanceUtils.escapeHtml(typeLabel) + '</span></td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + hoursDisplay + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + mileageDisplay + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + FinanceUtils.formatCurrency(rate) + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '"><span class="badge bg-warning text-dark">Pending</span></td>' +
                '<td>' +
                '<button class="btn btn-success btn-sm btn-approve-single" data-id="' + aptId + '" title="Approve">' +
                '<i class="bi bi-check-lg"></i></button>' +
                '</td></tr>';
        });

        tbody.innerHTML = html;
        updateBulkBar();
    }

    function renderNeedsCompletionTable(appointments) {
        var section = document.getElementById('needsCompletionSection');
        var tbody = document.getElementById('needsCompletionTableBody');
        var countBadge = document.getElementById('needsCompletionCount');
        if (!tbody || !section) return;

        if (appointments.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        if (countBadge) countBadge.textContent = appointments.length;

        var html = '';
        appointments.forEach(function(apt) {
            var aptId = apt.id;
            var aptDate = new Date(FinanceUtils.getAppointmentDate(apt));
            var knumber = FinanceUtils.escapeHtml(apt.knumber || apt.k_number || '');
            var clientName = apt.client_name || apt.clientName || '';
            if (!clientName) {
                var clientFirst = apt.clientFirstName || apt.client_first_name || '';
                var clientLast = apt.clientLastName || apt.client_last_name || '';
                clientName = (clientFirst + ' ' + clientLast).trim();
            }
            clientName = FinanceUtils.escapeHtml(clientName || 'Unknown');
            var driverName = FinanceUtils.escapeHtml(FinanceUtils.getDriverName(apt.driverAssigned || apt.driver_assigned));
            var appointmentType = apt.appointment_type || apt.appointmentType || 'round_trip';
            var typeLabel = appointmentType === 'one_way' ? 'One-Way' : appointmentType === 'support' ? 'Support' : 'Round Trip';

            var hours = parseFloat(apt.approved_hours || apt.driver_work_duration || apt.this_appointment_length || apt.appointmentLength || apt.appointment_length) || 0;
            var hoursDisplay = hours > 0 ? (hours / 60).toFixed(1) : '\u2014';

            var mileage = parseFloat(apt.driver_total_distance || apt.driverMileage || apt.driver_mileage ||
                          (parseFloat(apt.tripdistance || apt.trip_distance) / 1000)) || 0;
            var mileageDisplay = mileage > 0 ? mileage.toFixed(1) : '\u2014';

            var dateStr = aptDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Halifax' });
            var statusBadge = '<span class="badge bg-primary">Assigned</span>';
            var isSelected = selectedCompletionAppointments.has(String(aptId));

            html += '<tr data-appointment-id="' + aptId + '">' +
                '<td>' +
                '<input type="checkbox" class="form-check-input completion-checkbox" data-id="' + aptId + '"' +
                (isSelected ? ' checked' : '') + '>' +
                '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + FinanceUtils.escapeHtml(dateStr) + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '"><strong>' + knumber + '</strong> ' + clientName + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + driverName + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '"><span class="badge bg-secondary">' + FinanceUtils.escapeHtml(typeLabel) + '</span></td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + hoursDisplay + '</td>' +
                '<td class="review-clickable" data-apt-id="' + aptId + '">' + mileageDisplay + '</td>' +
                '<td>' + statusBadge + '</td>' +
                '<td>' +
                '<button class="btn btn-warning btn-sm btn-complete-single" data-id="' + aptId + '" title="Mark Completed">' +
                '<i class="bi bi-check2-circle"></i> Complete</button>' +
                '</td></tr>';
        });

        tbody.innerHTML = html;
        updateCompletionBulkBar();
    }

    function updateReviewCount() {
        var badge = document.getElementById('reviewCount');
        if (!badge) return;

        var now = new Date();
        var count = FinanceState.appointments.filter(function(apt) {
            var opStatus = apt.operationStatus || apt.operation_status;
            var invStatus = apt.invoiceStatus || apt.invoice_status;
            var deletedAt = apt.deletedAt || apt.deleted_at;
            if (deletedAt) return false;
            // Count completed appointments pending review
            if (opStatus === 'completed' && (!invStatus || invStatus === 'not_ready')) return true;
            // Count past assigned appointments needing completion
            if (opStatus === 'assigned' && new Date(FinanceUtils.getAppointmentDate(apt)) < now) return true;
            return false;
        }).length;

        badge.textContent = count > 0 ? count : '';
        badge.style.display = count > 0 ? 'inline' : 'none';
    }

    function updateBulkBar() {
        var bar = document.getElementById('bulkActionBar');
        var countSpan = document.getElementById('bulkSelectedCount');
        var count = FinanceState.selectedPendingAppointments.size;

        if (bar) {
            bar.style.display = count > 0 ? 'flex' : 'none';
        }
        if (countSpan) {
            countSpan.textContent = count;
        }
    }

    function updateCompletionBulkBar() {
        var bar = document.getElementById('completionBulkBar');
        var countSpan = document.getElementById('completionSelectedCount');
        var count = selectedCompletionAppointments.size;
        if (bar) bar.style.display = count > 0 ? 'flex' : 'none';
        if (countSpan) countSpan.textContent = count;
    }

    // =============================================
    // SKELETON
    // =============================================
    function showSkeleton(show) {
        var skeleton = document.getElementById('reviewSkeleton');
        var content = document.getElementById('reviewContent');
        var needsCompletion = document.getElementById('needsCompletionSection');
        if (skeleton) skeleton.style.display = show ? 'block' : 'none';
        if (content) content.style.display = show ? 'none' : 'block';
        if (needsCompletion && show) needsCompletion.style.display = 'none';
    }

    // =============================================
    // QUICK EDIT MODAL
    // =============================================
    var qeModal = null;

    function openQuickEdit(appointmentId) {
        var apt = FinanceState.appointments.find(function(a) { return String(a.id) === String(appointmentId); });
        if (!apt) {
            FinanceUtils.showToast('Appointment not found', 'danger');
            return;
        }

        document.getElementById('qeAppointmentId').value = apt.id;

        // Client info
        var clientName = apt.client_name || 'Unknown';
        var knumber = apt.knumber || apt.k_number || '';
        document.getElementById('qeClientInfo').textContent = knumber + ' — ' + clientName;

        // Date / Location
        var aptDate = new Date(FinanceUtils.getAppointmentDate(apt));
        var dateStr = aptDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Halifax' });
        var location = apt.location_name || apt.locationname || apt.location || '';
        document.getElementById('qeDateLocation').textContent = dateStr + ' — ' + location;

        // Type
        var apptType = apt.appointment_type || 'round_trip';
        var typeLabel = apptType === 'one_way' ? 'One-Way' : apptType === 'support' ? 'Support' : 'Round Trip';
        document.getElementById('qeAppointmentType').textContent = typeLabel;

        // Driver dropdown
        var driverSelect = document.getElementById('qeDriver');
        var currentDriver = String(apt.driver_assigned || apt.driverAssigned || '');
        var driverHtml = '<option value="">-- Select Driver --</option>';
        var drivers = FinanceState.drivers || {};
        Object.keys(drivers).forEach(function(dId) {
            var d = drivers[dId];
            var name = d.name || ((d.first_name || '') + ' ' + (d.last_name || '')).trim();
            var selected = String(dId) === currentDriver ? ' selected' : '';
            driverHtml += '<option value="' + dId + '"' + selected + '>' + FinanceUtils.escapeHtml(name) + '</option>';
        });
        driverSelect.innerHTML = driverHtml;

        // Hours — from driver_work_duration (minutes) or approved_hours
        // All hours rounded up to next whole hour for invoicing/payroll
        var rawMinutes = parseFloat(apt.driver_work_duration || apt.this_appointment_length || 0);
        var rawHours = rawMinutes > 0 ? rawMinutes / 60 : 0;
        var currentHours = apt.approved_hours ? parseFloat(apt.approved_hours) : (rawHours > 0 ? Math.ceil(rawHours) : 0);
        document.getElementById('qeHours').value = currentHours > 0 ? currentHours : '';
        document.getElementById('qeHoursCalc').textContent = rawMinutes > 0 ? '(actual: ' + rawHours.toFixed(1) + 'h / ' + rawMinutes + ' min)' : '';

        // Mileage
        var currentMileage = parseFloat(apt.approved_mileage || apt.driver_total_distance || 0);
        document.getElementById('qeMileage').value = currentMileage > 0 ? currentMileage.toFixed(1) : '';
        document.getElementById('qeMileageCalc').textContent = apt.driver_total_distance ? '(calc: ' + parseFloat(apt.driver_total_distance).toFixed(1) + ' km)' : '';

        if (!qeModal) {
            qeModal = new bootstrap.Modal(document.getElementById('financeQuickEditModal'));
        }
        qeModal.show();
    }

    async function saveQuickEdit() {
        var aptId = document.getElementById('qeAppointmentId').value;
        var newDriver = document.getElementById('qeDriver').value;
        var hoursVal = document.getElementById('qeHours').value;
        var mileageVal = document.getElementById('qeMileage').value;

        var apt = FinanceState.appointments.find(function(a) { return String(a.id) === String(aptId); });
        if (!apt) return;

        var btn = document.getElementById('btnQeApprove');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Approving...';
        }

        try {
            var currentDriver = String(apt.driver_assigned || apt.driverAssigned || '');
            var driverChanged = newDriver && newDriver !== currentDriver;

            // If driver changed, update appointment first via existing endpoint
            if (driverChanged) {
                await APIClient.post('/update-appointment-complete', {
                    id: aptId,
                    driver_assigned: parseInt(newDriver)
                });
            }

            // Build overrides for the approve workflow
            var overrides = {};
            var hours = hoursVal ? parseFloat(hoursVal) : null;
            var mileage = mileageVal ? parseFloat(mileageVal) : null;

            if (hours !== null || mileage !== null) {
                overrides[aptId] = {};
                if (hours !== null) overrides[aptId].hours = hours;
                if (mileage !== null) overrides[aptId].mileage = mileage;
            }

            await APIClient.post('/mark-appointment-ready', {
                appointmentIds: [aptId],
                overrides: overrides
            });

            await logFinanceAudit('mark_ready_for_invoice', 'appointment', aptId, {
                action_type: 'single_with_review',
                overrides: overrides[aptId] || null,
                driver_changed: driverChanged
            });

            if (qeModal) qeModal.hide();
            FinanceUtils.showToast('Appointment approved', 'success');
            FinanceState.selectedPendingAppointments.delete(aptId);
            await window.loadTab_review();
            TabManager.markStale('payroll');
            TabManager.markStale('invoicing');

        } catch (err) {
            console.error('[Finance Review] Error approving:', err);
            FinanceUtils.showToast('Failed to approve appointment', 'danger');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg"></i> Approve';
            }
        }
    }

    // =============================================
    // ACTIONS
    // =============================================
    async function approveAppointment(appointmentId) {
        var btn = document.querySelector('.btn-approve-single[data-id="' + appointmentId + '"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
        }

        try {
            await APIClient.post('/mark-appointment-ready', {
                appointmentIds: [appointmentId]
            });

            await logFinanceAudit('mark_ready_for_invoice', 'appointment', appointmentId, { action_type: 'single' });
            FinanceUtils.showToast('Appointment approved for invoicing', 'success');

            FinanceState.selectedPendingAppointments.delete(appointmentId);
            await window.loadTab_review();
            TabManager.markStale('payroll');
            TabManager.markStale('invoicing');

        } catch (error) {
            console.error('[Finance Review] Error approving appointment:', error);
            FinanceUtils.showToast('Failed to approve appointment', 'danger');
        }
    }

    async function bulkApprove() {
        var selected = FinanceState.selectedPendingAppointments;
        if (selected.size === 0) return;

        var btn = document.getElementById('btnBulkApprove');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Approving...';
        }

        try {
            var appointmentIds = Array.from(selected);
            await APIClient.post('/mark-appointment-ready', { appointmentIds: appointmentIds });

            await logFinanceAudit('mark_ready_for_invoice', 'appointment', appointmentIds.join(','), {
                action_type: 'bulk',
                count: appointmentIds.length
            });

            FinanceUtils.showToast(appointmentIds.length + ' appointment(s) approved', 'success');
            selected.clear();
            await window.loadTab_review();
            TabManager.markStale('payroll');
            TabManager.markStale('invoicing');

        } catch (error) {
            console.error('[Finance Review] Error bulk approving:', error);
            FinanceUtils.showToast('Failed to approve appointments', 'danger');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-all"></i> Approve Selected (<span id="bulkSelectedCount">' + selected.size + '</span>)';
            }
        }
    }

    async function completeAppointment(appointmentId) {
        var btn = document.querySelector('.btn-complete-single[data-id="' + appointmentId + '"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
        }

        try {
            await APIClient.post('/complete-appointment', {
                appointmentId: appointmentId
            });

            await logFinanceAudit('mark_completed', 'appointment', appointmentId, { action_type: 'manual' });
            FinanceUtils.showToast('Appointment marked as completed', 'success');

            await window.loadTab_review();
            TabManager.markStale('payroll');
            TabManager.markStale('invoicing');

        } catch (error) {
            console.error('[Finance Review] Error completing appointment:', error);
            FinanceUtils.showToast('Failed to complete appointment', 'danger');
        }
    }

    async function bulkComplete() {
        if (selectedCompletionAppointments.size === 0) return;

        var btn = document.getElementById('btnBulkComplete');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Completing...';
        }

        var ids = Array.from(selectedCompletionAppointments);
        var completed = 0;
        var failed = 0;

        for (var i = 0; i < ids.length; i++) {
            try {
                await APIClient.post('/complete-appointment', { appointmentId: ids[i] });
                completed++;
            } catch (error) {
                console.error('[Finance Review] Error completing appointment ' + ids[i] + ':', error);
                failed++;
            }
            if (btn) {
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ' +
                    (i + 1) + '/' + ids.length + '...';
            }
        }

        if (completed > 0) {
            await logFinanceAudit('mark_completed', 'appointment', ids.join(','), {
                action_type: 'bulk', count: completed
            });
        }

        if (failed > 0) {
            FinanceUtils.showToast(completed + ' completed, ' + failed + ' failed', 'warning');
        } else {
            FinanceUtils.showToast(completed + ' appointment(s) marked as completed', 'success');
        }

        selectedCompletionAppointments.clear();
        await window.loadTab_review();
        TabManager.markStale('payroll');
        TabManager.markStale('invoicing');
    }

    // =============================================
    // EVENT DELEGATION
    // =============================================
    document.addEventListener('DOMContentLoaded', function() {
        // Table click delegation
        var tableContainer = document.getElementById('pane-review');
        if (tableContainer) {
            tableContainer.addEventListener('click', function(e) {
                // Clickable row cells
                var clickableCell = e.target.closest('.review-clickable');
                if (clickableCell) {
                    var aptId = clickableCell.dataset.aptId;
                    if (aptId) openQuickEdit(aptId);
                    return;
                }

                // Approve button
                var approveBtn = e.target.closest('.btn-approve-single');
                if (approveBtn) {
                    var id = approveBtn.dataset.id;
                    if (id) approveAppointment(id);
                    return;
                }

                // Complete button (needs completion section)
                var completeBtn = e.target.closest('.btn-complete-single');
                if (completeBtn) {
                    var completeId = completeBtn.dataset.id;
                    if (completeId) completeAppointment(completeId);
                    return;
                }

                // Checkbox change (review table)
                var checkbox = e.target.closest('.review-checkbox');
                if (checkbox) {
                    var cbId = checkbox.dataset.id;
                    if (checkbox.checked) {
                        FinanceState.selectedPendingAppointments.add(cbId);
                    } else {
                        FinanceState.selectedPendingAppointments.delete(cbId);
                    }
                    updateBulkBar();
                    return;
                }

                // Checkbox change (needs completion table)
                var completionCb = e.target.closest('.completion-checkbox');
                if (completionCb) {
                    var ccId = completionCb.dataset.id;
                    if (completionCb.checked) {
                        selectedCompletionAppointments.add(ccId);
                    } else {
                        selectedCompletionAppointments.delete(ccId);
                    }
                    updateCompletionBulkBar();
                    return;
                }
            });

            // Select all checkbox
            var selectAll = document.getElementById('reviewSelectAll');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    var checked = selectAll.checked;
                    var checkboxes = document.querySelectorAll('.review-checkbox');
                    checkboxes.forEach(function(cb) {
                        cb.checked = checked;
                        var id = cb.dataset.id;
                        if (checked) {
                            FinanceState.selectedPendingAppointments.add(id);
                        } else {
                            FinanceState.selectedPendingAppointments.delete(id);
                        }
                    });
                    updateBulkBar();
                });
            }
        }

        // Quick edit modal button
        var btnQeApprove = document.getElementById('btnQeApprove');
        if (btnQeApprove) {
            btnQeApprove.addEventListener('click', function() { saveQuickEdit(); });
        }

        // Bulk approve button
        var bulkBtn = document.getElementById('btnBulkApprove');
        if (bulkBtn) {
            bulkBtn.addEventListener('click', bulkApprove);
        }

        // Clear selection
        var clearBtn = document.getElementById('btnClearSelection');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                FinanceState.selectedPendingAppointments.clear();
                document.querySelectorAll('.review-checkbox').forEach(function(cb) { cb.checked = false; });
                var selAll = document.getElementById('reviewSelectAll');
                if (selAll) selAll.checked = false;
                updateBulkBar();
            });
        }

        // Completion select-all checkbox
        var completionSelectAll = document.getElementById('completionSelectAll');
        if (completionSelectAll) {
            completionSelectAll.addEventListener('change', function() {
                var checked = completionSelectAll.checked;
                document.querySelectorAll('.completion-checkbox').forEach(function(cb) {
                    cb.checked = checked;
                    var id = cb.dataset.id;
                    if (checked) {
                        selectedCompletionAppointments.add(id);
                    } else {
                        selectedCompletionAppointments.delete(id);
                    }
                });
                updateCompletionBulkBar();
            });
        }

        // Bulk complete button
        var bulkCompleteBtn = document.getElementById('btnBulkComplete');
        if (bulkCompleteBtn) {
            bulkCompleteBtn.addEventListener('click', bulkComplete);
        }

        // Clear completion selection
        var clearCompletionBtn = document.getElementById('btnClearCompletionSelection');
        if (clearCompletionBtn) {
            clearCompletionBtn.addEventListener('click', function() {
                selectedCompletionAppointments.clear();
                document.querySelectorAll('.completion-checkbox').forEach(function(cb) { cb.checked = false; });
                var selAll = document.getElementById('completionSelectAll');
                if (selAll) selAll.checked = false;
                updateCompletionBulkBar();
            });
        }

        // Filter controls
        var filterBtn = document.getElementById('btnReviewFilter');
        if (filterBtn) {
            filterBtn.addEventListener('click', function() {
                filterState.dateFrom = document.getElementById('reviewDateFrom').value;
                filterState.dateTo = document.getElementById('reviewDateTo').value;
                filterState.driverId = document.getElementById('reviewDriverFilter').value;
                filterState.clientKnumber = document.getElementById('reviewClientFilter').value;
                renderReviewTable(getFilteredAppointments());
                renderNeedsCompletionTable(getNeedsCompletionAppointments());
            });
        }

        var clearFilterBtn = document.getElementById('btnReviewClearFilter');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function() {
                filterState = { dateFrom: '', dateTo: '', driverId: '', clientKnumber: '' };
                document.getElementById('reviewDateFrom').value = '';
                document.getElementById('reviewDateTo').value = '';
                document.getElementById('reviewDriverFilter').value = '';
                document.getElementById('reviewClientFilter').value = '';
                renderReviewTable(getFilteredAppointments());
                renderNeedsCompletionTable(getNeedsCompletionAppointments());
            });
        }
    });

    console.log('[Finance] Review v6.3.0 loaded');
})();
