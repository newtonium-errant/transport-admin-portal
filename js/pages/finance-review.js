/**
 * Finance Review Tab - Appointment Review for finance approval
 * Version: 6.0.0
 */
(function() {
    'use strict';

    var appointmentModal = null;
    var filterState = {
        dateFrom: '',
        dateTo: '',
        driverId: '',
        clientKnumber: ''
    };

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

            var raw = response.data || response.appointments || response || [];
            if (!Array.isArray(raw)) raw = [];
            FinanceState.appointments = raw;

            populateFilterDropdowns();
            renderReviewTable(getFilteredAppointments());
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
            var clientFirst = apt.clientFirstName || apt.client_first_name || '';
            var clientLast = apt.clientLastName || apt.client_last_name || '';
            var clientName = FinanceUtils.escapeHtml((clientFirst + ' ' + clientLast).trim());
            var driverName = FinanceUtils.escapeHtml(FinanceUtils.getDriverName(apt.driverAssigned || apt.driver_assigned));
            var appointmentType = apt.appointment_type || apt.appointmentType || 'round_trip';
            var typeLabel = appointmentType === 'one_way' ? 'One-Way' : appointmentType === 'support' ? 'Support' : 'Round Trip';

            var hours = parseFloat(apt.approved_hours || apt.appointmentLength || apt.appointment_length) || 0;
            var hoursDisplay = hours > 0 ? (hours / 60).toFixed(1) : '\u2014';

            var mileage = parseFloat(apt.driverMileage || apt.driver_mileage ||
                          (parseFloat(apt.tripdistance || apt.trip_distance) / 1000)) || 0;
            var mileageDisplay = mileage > 0 ? mileage.toFixed(1) : '\u2014';

            var rate = parseFloat(apt.customRate || apt.custom_rate) || 0;
            var isSelected = selected.has(aptId);

            var dateStr = aptDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Halifax' });

            html += '<tr data-appointment-id="' + aptId + '">' +
                '<td onclick="event.stopPropagation()">' +
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
                '<td onclick="event.stopPropagation()">' +
                '<button class="btn btn-success btn-sm btn-approve-single" data-id="' + aptId + '" title="Approve">' +
                '<i class="bi bi-check-lg"></i></button>' +
                '</td></tr>';
        });

        tbody.innerHTML = html;
        updateBulkBar();
    }

    function updateReviewCount() {
        var badge = document.getElementById('reviewCount');
        if (!badge) return;

        var count = FinanceState.appointments.filter(function(apt) {
            var opStatus = apt.operationStatus || apt.operation_status;
            var invStatus = apt.invoiceStatus || apt.invoice_status;
            var deletedAt = apt.deletedAt || apt.deleted_at;
            return opStatus === 'completed' && (!invStatus || invStatus === 'not_ready') && !deletedAt;
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

    // =============================================
    // SKELETON
    // =============================================
    function showSkeleton(show) {
        var skeleton = document.getElementById('reviewSkeleton');
        var content = document.getElementById('reviewContent');
        if (skeleton) skeleton.style.display = show ? 'block' : 'none';
        if (content) content.style.display = show ? 'none' : 'block';
    }

    // =============================================
    // APPOINTMENT MODAL INTEGRATION
    // =============================================
    function getOrCreateModal() {
        if (appointmentModal) return appointmentModal;

        if (typeof AppointmentModal === 'undefined') {
            console.warn('[Finance Review] AppointmentModal not loaded');
            return null;
        }

        appointmentModal = new AppointmentModal({
            onSave: async function() {
                FinanceUtils.showToast('Appointment updated successfully', 'success');
                await window.loadTab_review();
                TabManager.markStale('payroll');
                TabManager.markStale('invoicing');
            },
            onDelete: async function() {
                FinanceUtils.showToast('Appointment deleted', 'warning');
                await window.loadTab_review();
                TabManager.markStale('payroll');
                TabManager.markStale('invoicing');
            }
        });

        window.appointmentModalInstance = appointmentModal;
        return appointmentModal;
    }

    async function openAppointmentForEdit(appointmentId) {
        var modal = getOrCreateModal();
        if (!modal) {
            FinanceUtils.showToast('Appointment editor not available', 'danger');
            return;
        }

        var appointment = FinanceState.appointments.find(function(a) { return a.id === appointmentId; });
        if (!appointment) {
            FinanceUtils.showToast('Appointment not found', 'danger');
            return;
        }

        var row = document.querySelector('tr[data-appointment-id="' + appointmentId + '"]');
        var originalContent = null;
        if (row) {
            originalContent = row.innerHTML;
            row.innerHTML = '<td colspan="10" class="text-center py-3">' +
                '<span class="spinner-border spinner-border-sm me-2"></span> Loading appointment...</td>';
        }

        try {
            var driversArr = Object.values(FinanceState.drivers);
            var clientsArr = Object.values(FinanceState.clients);

            if (!modal.driversLoaded) {
                await modal.loadDrivers(driversArr);
                modal.driversLoaded = true;
            }
            if (!modal.clientsLoaded) {
                modal.clients = clientsArr;
                modal.clientsLoaded = true;
            }
            if (!modal.clinicsLoaded) {
                await modal.loadClinics();
                modal.clinicsLoaded = true;
            }
            if (!modal.bookingAgentsLoaded) {
                await modal.loadBookingAgents();
            }

            if (row && originalContent) row.innerHTML = originalContent;
            await modal.open('edit', appointment);

        } catch (error) {
            console.error('[Finance Review] Error opening modal:', error);
            if (row && originalContent) row.innerHTML = originalContent;
            FinanceUtils.showToast('Failed to open appointment editor', 'danger');
        }
    }

    // =============================================
    // ACTIONS
    // =============================================
    async function approveAppointment(appointmentId) {
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
                    if (aptId) openAppointmentForEdit(aptId);
                    return;
                }

                // Approve button
                var approveBtn = e.target.closest('.btn-approve-single');
                if (approveBtn) {
                    var id = approveBtn.dataset.id;
                    if (id) approveAppointment(id);
                    return;
                }

                // Checkbox change
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

        // Filter controls
        var filterBtn = document.getElementById('btnReviewFilter');
        if (filterBtn) {
            filterBtn.addEventListener('click', function() {
                filterState.dateFrom = document.getElementById('reviewDateFrom').value;
                filterState.dateTo = document.getElementById('reviewDateTo').value;
                filterState.driverId = document.getElementById('reviewDriverFilter').value;
                filterState.clientKnumber = document.getElementById('reviewClientFilter').value;
                renderReviewTable(getFilteredAppointments());
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
            });
        }
    });

    console.log('[Finance] Review v6.0.0 loaded');
})();
