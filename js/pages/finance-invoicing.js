/**
 * Finance Invoicing Tab - Client invoicing, PDF generation, invoice management
 * Version: 6.2.0
 */
(function() {
    'use strict';

    var pdfLibLoaded = false;
    var invoiceData = {
        clientGroups: [],
        invoices: [],
        currentPdfBytes: null,
        currentInvoiceId: null,
        currentInvoiceNumber: '',
        pdfPages: [],
        currentPdfPage: 0
    };

    var invoiceSortState = {
        column: 'invoiceNumber',
        direction: 'desc'
    };

    var invoiceStatusFilter = ['created', 'sent', 'paid'];

    // =============================================
    // TAB LOADER
    // =============================================
    window.loadTab_invoicing = async function() {
        console.log('[Finance Invoicing] Loading tab...');
        showSkeleton(true);

        try {
            // Fetch appointments (need fresh data for invoice_status) and invoices in parallel
            var results = await Promise.all([
                APIClient.get('/get-finance-appointments?tab=invoicing').catch(function(err) {
                    console.warn('[Finance Invoicing] Error loading appointments:', err);
                    return { data: [] };
                }),
                APIClient.get('/get-invoices-v5').catch(function(err) {
                    console.warn('[Finance Invoicing] Error loading invoices:', err);
                    return { data: [] };
                })
            ]);

            // Parse appointments (handle array-wrapped n8n responses)
            var apptData = results[0];
            var raw = [];
            if (Array.isArray(apptData) && apptData.length > 0 && apptData[0].data) {
                raw = apptData[0].data.appointments || apptData[0].data || [];
            } else if (apptData && apptData.data && apptData.data.appointments) {
                raw = apptData.data.appointments;
            } else if (apptData && apptData.data && Array.isArray(apptData.data)) {
                raw = apptData.data;
            } else if (apptData && apptData.appointments) {
                raw = apptData.appointments;
            } else if (Array.isArray(apptData)) {
                raw = apptData;
            }
            if (!Array.isArray(raw)) raw = [];
            FinanceState.appointments = raw;

            // Parse invoices (handle array-wrapped n8n responses)
            var invData = results[1];
            if (Array.isArray(invData) && invData.length > 0 && invData[0] && typeof invData[0] === 'object' && !Array.isArray(invData[0])) {
                invData = invData[0];
            }
            var invRaw;
            if (invData.data && invData.data.invoices) invRaw = invData.data.invoices;
            else if (invData.invoices) invRaw = invData.invoices;
            else if (Array.isArray(invData.data)) invRaw = invData.data;
            else if (Array.isArray(invData)) invRaw = invData;
            else invRaw = [];
            invoiceData.invoices = Array.isArray(invRaw) ? invRaw : [];

            buildClientGroups();
            renderClientGroups();
            renderInvoicesList();

        } catch (error) {
            console.error('[Finance Invoicing] Load error:', error);
            FinanceUtils.showToast('Failed to load invoicing data', 'danger');
        } finally {
            showSkeleton(false);
        }
    };

    // =============================================
    // CLIENT GROUP BUILDING
    // =============================================
    function buildClientGroups() {
        var readyAppts = FinanceState.appointments.filter(function(apt) {
            var invStatus = apt.invoiceStatus || apt.invoice_status;
            var invoiceId = apt.invoiceId || apt.invoice_id;
            var deletedAt = apt.deletedAt || apt.deleted_at;
            return invStatus === 'ready' && !invoiceId && !deletedAt;
        });

        var grouped = {};
        readyAppts.forEach(function(apt) {
            var k = apt.knumber || apt.k_number || 'Unknown';
            if (!grouped[k]) {
                grouped[k] = {
                    knumber: k,
                    clientName: apt.client_name || ((apt.clientFirstName || apt.client_first_name || '') + ' ' +
                                (apt.clientLastName || apt.client_last_name || '')).trim() || 'Unknown',
                    appointments: []
                };
            }
            grouped[k].appointments.push(apt);
        });

        invoiceData.clientGroups = Object.values(grouped).sort(function(a, b) {
            return a.knumber.localeCompare(b.knumber);
        });
    }

    // =============================================
    // CLIENT GROUPS RENDERING
    // =============================================
    function renderClientGroups() {
        var container = document.getElementById('uninvoicedContainer');
        if (!container) return;

        var groups = invoiceData.clientGroups;
        var hstRate = FinanceState.appConfig.hst_rate || 0.14;

        if (groups.length === 0) {
            container.innerHTML = '<div class="text-center py-5 text-muted">' +
                '<i class="bi bi-check-circle" style="font-size: 3rem; display: block; margin-bottom: 10px;"></i>' +
                'No approved appointments waiting for invoicing</div>';
            return;
        }

        // Calculate grand total across all groups
        var grandSubtotal = 0;
        var grandApptCount = 0;
        groups.forEach(function(g) {
            g.appointments.forEach(function(apt) {
                grandSubtotal += parseFloat(apt.billed_amount || apt.customRate || apt.custom_rate) || 0;
            });
            grandApptCount += g.appointments.length;
        });
        var grandHst = grandSubtotal * hstRate;
        var grandTotal = grandSubtotal + grandHst;

        var html = '<div class="alert alert-success d-flex justify-content-between align-items-center mb-3 py-2">' +
            '<div><i class="bi bi-cash-stack me-2"></i><strong>Ready to Invoice</strong>' +
            '<span class="text-muted ms-2">' + grandApptCount + ' appointment' + (grandApptCount !== 1 ? 's' : '') +
            ' across ' + groups.length + ' client' + (groups.length !== 1 ? 's' : '') + '</span></div>' +
            '<div class="d-flex align-items-center gap-3">' +
            '<span class="text-muted">Subtotal: ' + FinanceUtils.formatCurrency(grandSubtotal) +
            ' + HST: ' + FinanceUtils.formatCurrency(grandHst) + '</span>' +
            '<strong class="fs-5">' + FinanceUtils.formatCurrency(grandTotal) + '</strong></div></div>';

        html += '<div id="bulkInvoiceBar" class="alert alert-primary py-2 mb-2" style="display:none">' +
            '<div class="d-flex justify-content-between align-items-center">' +
            '<div><input type="checkbox" class="form-check-input me-2" id="clientGroupSelectAll">' +
            '<strong id="clientGroupBulkCount">0</strong> client(s) selected</div>' +
            '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-outline-warning" id="btnBulkUnapprove">' +
            '<i class="bi bi-arrow-counterclockwise"></i> Unapprove Selected</button>' +
            '<button class="btn btn-sm btn-primary" id="btnBulkCreateInvoices">' +
            '<i class="bi bi-file-earmark-plus"></i> Create Invoices for Selected</button>' +
            '</div></div></div>';

        groups.forEach(function(group, idx) {
            var subtotal = 0;
            group.appointments.forEach(function(apt) {
                subtotal += parseFloat(apt.billed_amount || apt.customRate || apt.custom_rate) || 0;
            });
            var hst = subtotal * hstRate;
            var total = subtotal + hst;
            var expandId = 'client-group-' + idx;
            var apptCount = group.appointments.length;

            html += '<div class="card mb-2">' +
                '<div class="card-body py-2 px-3">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<div class="d-flex align-items-center gap-3 flex-grow-1">' +
                '<input type="checkbox" class="form-check-input client-group-cb" data-group-idx="' + idx + '">' +
                '<div class="d-flex align-items-center gap-2 cursor-pointer flex-grow-1" data-bs-toggle="collapse" data-bs-target="#' + expandId + '">' +
                '<i class="bi bi-chevron-right collapse-icon"></i>' +
                '<div><strong>' + FinanceUtils.escapeHtml(group.knumber) + '</strong> \u2014 ' +
                FinanceUtils.escapeHtml(group.clientName) +
                '<span class="text-muted ms-2">(' + apptCount + ' appt' + (apptCount !== 1 ? 's' : '') + ')</span></div>' +
                '</div></div>' +
                '<div class="d-flex align-items-center gap-4">' +
                '<div class="text-end">' +
                '<div class="small text-muted">Subtotal: ' + FinanceUtils.formatCurrency(subtotal) + '</div>' +
                '<div class="small text-muted">HST (' + Math.round(hstRate * 100) + '%): ' + FinanceUtils.formatCurrency(hst) + '</div>' +
                '<div><strong>' + FinanceUtils.formatCurrency(total) + '</strong></div>' +
                '</div>' +
                '<button class="btn btn-outline-warning btn-sm me-1 btn-unapprove-group" ' +
                'data-group-idx="' + idx + '" title="Send back to Review">' +
                '<i class="bi bi-arrow-counterclockwise"></i> Unapprove</button>' +
                '<button class="btn btn-primary btn-sm btn-create-invoice" ' +
                'data-knumber="' + FinanceUtils.escapeHtml(group.knumber) + '" ' +
                'data-client-name="' + FinanceUtils.escapeHtml(group.clientName) + '" ' +
                'data-group-idx="' + idx + '">' +
                '<i class="bi bi-file-earmark-plus"></i> Create Invoice</button>' +
                '</div></div>' +
                '<div class="collapse" id="' + expandId + '">' +
                '<table class="table table-sm table-bordered mt-2 mb-0">' +
                '<thead><tr><th>Date</th><th>Location</th><th>Type</th><th class="text-end" style="width:120px">Amount</th><th style="width:40px"></th></tr></thead>' +
                '<tbody>';

            group.appointments.forEach(function(apt) {
                var aptDate = FinanceUtils.formatDateShort(FinanceUtils.getAppointmentDate(apt));
                var location = apt.location_name || apt.location || apt.clinic || 'Unknown';
                var apptType = apt.appointment_type || apt.appointmentType || 'round_trip';
                var typeLabel = apptType === 'one_way' ? 'One-Way' : apptType === 'support' ? 'Support' : 'Round Trip';
                var rate = parseFloat(apt.billed_amount || apt.customRate || apt.custom_rate) || 0;

                html += '<tr>' +
                    '<td>' + FinanceUtils.escapeHtml(aptDate) + '</td>' +
                    '<td>' + FinanceUtils.escapeHtml(location) + '</td>' +
                    '<td>' + FinanceUtils.escapeHtml(typeLabel) + '</td>' +
                    '<td class="text-end p-1"><input type="number" class="form-control form-control-sm text-end inv-amount-override" ' +
                    'data-apt-id="' + apt.id + '" data-group-idx="' + idx + '" ' +
                    'value="' + rate.toFixed(2) + '" step="0.01" min="0" style="width:100px;display:inline-block"></td>' +
                    '<td class="text-center p-1"><button class="btn btn-outline-warning btn-sm btn-unapprove-single py-0 px-1" ' +
                    'data-apt-id="' + apt.id + '" title="Send back to Review">' +
                    '<i class="bi bi-arrow-counterclockwise"></i></button></td>' +
                    '</tr>';
            });

            html += '</tbody></table></div></div></div>';
        });

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

        // Create invoice button handlers
        container.querySelectorAll('.btn-create-invoice').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var idx = parseInt(btn.dataset.groupIdx);
                var group = invoiceData.clientGroups[idx];
                if (group) openCreateInvoiceModal(group);
            });
        });

        // Amount override handlers
        container.querySelectorAll('.inv-amount-override').forEach(function(input) {
            input.addEventListener('change', function() {
                var aptId = input.dataset.aptId;
                var groupIdx = parseInt(input.dataset.groupIdx);
                var newVal = parseFloat(input.value) || 0;

                // Update the appointment's billed_amount in local state
                var apt = FinanceState.appointments.find(function(a) { return String(a.id) === String(aptId); });
                if (apt) apt.billed_amount = newVal;

                // Also update in the group
                var group = invoiceData.clientGroups[groupIdx];
                if (group) {
                    var gApt = group.appointments.find(function(a) { return String(a.id) === String(aptId); });
                    if (gApt) gApt.billed_amount = newVal;
                }

                // Recalculate group totals in the card header
                if (group) {
                    var hstRate = FinanceState.appConfig.hst_rate || 0.14;
                    var newSubtotal = 0;
                    group.appointments.forEach(function(a) {
                        newSubtotal += parseFloat(a.billed_amount || 0);
                    });
                    var newHst = newSubtotal * hstRate;
                    var newTotal = newSubtotal + newHst;

                    var card = input.closest('.card');
                    if (card) {
                        var totalsDiv = card.querySelector('.text-end');
                        if (totalsDiv && totalsDiv.querySelector('.small')) {
                            totalsDiv.innerHTML =
                                '<div class="small text-muted">Subtotal: ' + FinanceUtils.formatCurrency(newSubtotal) + '</div>' +
                                '<div class="small text-muted">HST (' + Math.round(hstRate * 100) + '%): ' + FinanceUtils.formatCurrency(newHst) + '</div>' +
                                '<div><strong>' + FinanceUtils.formatCurrency(newTotal) + '</strong></div>';
                        }
                    }
                }

                // Recalculate grand total banner
                recalcGrandTotal();
            });
        });

        // Client group checkboxes for bulk invoice creation
        container.querySelectorAll('.client-group-cb').forEach(function(cb) {
            cb.addEventListener('change', updateClientGroupBulkBar);
        });

        var cgSelectAll = document.getElementById('clientGroupSelectAll');
        if (cgSelectAll) {
            cgSelectAll.addEventListener('change', function() {
                container.querySelectorAll('.client-group-cb').forEach(function(cb) {
                    cb.checked = cgSelectAll.checked;
                });
                updateClientGroupBulkBar();
            });
        }

        var bulkCreateBtn = document.getElementById('btnBulkCreateInvoices');
        if (bulkCreateBtn) {
            bulkCreateBtn.addEventListener('click', bulkCreateInvoices);
        }

        // Per-appointment unapprove buttons
        container.querySelectorAll('.btn-unapprove-single').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var aptId = btn.dataset.aptId;
                if (aptId) unapproveAppointments([aptId]);
            });
        });

        // Per-group unapprove buttons
        container.querySelectorAll('.btn-unapprove-group').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var idx = parseInt(btn.dataset.groupIdx);
                var group = invoiceData.clientGroups[idx];
                if (!group) return;
                var count = group.appointments.length;
                if (!confirm('Unapprove all ' + count + ' appointment' + (count !== 1 ? 's' : '') +
                    ' for ' + group.knumber + ' \u2014 ' + group.clientName + '? They will return to the Review tab.')) return;
                var ids = group.appointments.map(function(a) { return a.id; });
                unapproveAppointments(ids);
            });
        });

        // Bulk unapprove button
        var bulkUnapproveBtn = document.getElementById('btnBulkUnapprove');
        if (bulkUnapproveBtn) {
            bulkUnapproveBtn.addEventListener('click', function() {
                var checkedBoxes = document.querySelectorAll('.client-group-cb:checked');
                if (checkedBoxes.length === 0) return;
                var allIds = [];
                checkedBoxes.forEach(function(cb) {
                    var idx = parseInt(cb.dataset.groupIdx);
                    var group = invoiceData.clientGroups[idx];
                    if (group) {
                        group.appointments.forEach(function(a) { allIds.push(a.id); });
                    }
                });
                if (allIds.length === 0) return;
                if (!confirm('Unapprove all appointments for ' + checkedBoxes.length + ' selected client' +
                    (checkedBoxes.length !== 1 ? 's' : '') + ' (' + allIds.length + ' appointment' +
                    (allIds.length !== 1 ? 's' : '') + ')? They will return to the Review tab.')) return;
                unapproveAppointments(allIds);
            });
        }

        // Show bulk bar if groups exist
        updateClientGroupBulkBar();
    }

    function updateClientGroupBulkBar() {
        var checked = document.querySelectorAll('.client-group-cb:checked');
        var bar = document.getElementById('bulkInvoiceBar');
        var countEl = document.getElementById('clientGroupBulkCount');
        if (bar) bar.style.display = checked.length > 0 ? 'block' : 'none';
        if (countEl) countEl.textContent = checked.length;
    }

    // =============================================
    // UNAPPROVE APPOINTMENTS
    // =============================================
    var isUnapproving = false;

    async function unapproveAppointments(appointmentIds) {
        if (isUnapproving) return;
        if (!appointmentIds || appointmentIds.length === 0) return;
        isUnapproving = true;

        try {
            await APIClient.post('/unapprove-appointments', {
                appointmentIds: appointmentIds
            });

            await logFinanceAudit('unapprove_appointments', 'appointment', appointmentIds.join(','), {
                action_type: appointmentIds.length === 1 ? 'single' : 'bulk',
                count: appointmentIds.length
            });

            FinanceUtils.showToast(appointmentIds.length + ' appointment' +
                (appointmentIds.length !== 1 ? 's' : '') + ' sent back to Review', 'success');

            await window.loadTab_invoicing();
            TabManager.markStale('review');
            TabManager.markStale('payroll');

        } catch (error) {
            console.error('[Finance Invoicing] Error unapproving appointments:', error);
            FinanceUtils.showToast('Failed to unapprove appointment' +
                (appointmentIds.length !== 1 ? 's' : ''), 'danger');
        } finally {
            isUnapproving = false;
        }
    }

    async function bulkCreateInvoices() {
        var checkedBoxes = document.querySelectorAll('.client-group-cb:checked');
        if (checkedBoxes.length === 0) return;

        var indices = [];
        checkedBoxes.forEach(function(cb) { indices.push(parseInt(cb.dataset.groupIdx)); });

        var btn = document.getElementById('btnBulkCreateInvoices');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Creating...'; }

        var created = 0;
        var failed = 0;
        var invoiceDate = new Date().toISOString().split('T')[0];

        for (var i = 0; i < indices.length; i++) {
            var group = invoiceData.clientGroups[indices[i]];
            if (!group) continue;

            if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ' + (i + 1) + '/' + indices.length;

            try {
                var appointmentIds = group.appointments.map(function(a) { return a.id; });
                await APIClient.post('/create-invoice', {
                    knumber: group.knumber,
                    appointment_ids: appointmentIds,
                    invoice_date: invoiceDate,
                    notes: ''
                });
                created++;
            } catch (err) {
                console.error('[Finance Invoicing] Error creating invoice for ' + group.knumber + ':', err);
                failed++;
            }
        }

        if (failed > 0) {
            FinanceUtils.showToast(created + ' invoice(s) created, ' + failed + ' failed', 'warning');
        } else {
            FinanceUtils.showToast(created + ' invoice(s) created', 'success');
        }

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-plus"></i> Create Invoices for Selected'; }
        await window.loadTab_invoicing();
        TabManager.markStale('review');
    }

    function recalcGrandTotal() {
        var hstRate = FinanceState.appConfig.hst_rate || 0.14;
        var grandSubtotal = 0;
        var grandApptCount = 0;
        invoiceData.clientGroups.forEach(function(g) {
            g.appointments.forEach(function(apt) {
                grandSubtotal += parseFloat(apt.billed_amount || 0);
            });
            grandApptCount += g.appointments.length;
        });
        var grandHst = grandSubtotal * hstRate;
        var grandTotal = grandSubtotal + grandHst;
        var groupCount = invoiceData.clientGroups.length;

        var container = document.getElementById('uninvoicedContainer');
        if (!container) return;
        var banner = container.querySelector('.alert-success');
        if (banner) {
            banner.innerHTML =
                '<div><i class="bi bi-cash-stack me-2"></i><strong>Ready to Invoice</strong>' +
                '<span class="text-muted ms-2">' + grandApptCount + ' appointment' + (grandApptCount !== 1 ? 's' : '') +
                ' across ' + groupCount + ' client' + (groupCount !== 1 ? 's' : '') + '</span></div>' +
                '<div class="text-end"><span class="me-3 text-muted">Subtotal: ' + FinanceUtils.formatCurrency(grandSubtotal) +
                ' + HST: ' + FinanceUtils.formatCurrency(grandHst) + '</span>' +
                '<strong class="fs-5">' + FinanceUtils.formatCurrency(grandTotal) + '</strong></div>';
        }
    }

    // =============================================
    // INVOICES LIST RENDERING
    // =============================================
    function renderInvoicesList() {
        var container = document.getElementById('invoicesListContainer');
        if (!container) return;

        var allInvoices = invoiceData.invoices;

        // Sort all invoices
        allInvoices = sortInvoices(allInvoices, invoiceSortState.column, invoiceSortState.direction);

        if (allInvoices.length === 0) {
            container.innerHTML = '<div class="text-center py-4 text-muted">' +
                '<i class="bi bi-file-earmark" style="font-size: 2rem; display: block; margin-bottom: 8px;"></i>' +
                'No invoices created yet</div>';
            return;
        }

        // Calculate unpaid total from ALL invoices (unfiltered)
        var unpaidTotal = 0;
        var unpaidCount = 0;
        allInvoices.forEach(function(inv) {
            var status = inv.invoiceStatus || inv.invoice_status || 'created';
            if (status !== 'paid' && status !== 'void') {
                unpaidTotal += parseFloat(inv.invoiceTotal || inv.invoice_total) || 0;
                unpaidCount++;
            }
        });

        // Apply status filter
        var invoices = allInvoices.filter(function(inv) {
            var status = inv.invoiceStatus || inv.invoice_status || 'created';
            return invoiceStatusFilter.indexOf(status) !== -1;
        });

        var html = '';
        if (unpaidCount > 0) {
            html += '<div class="alert alert-warning d-flex justify-content-between align-items-center mb-3 py-2">' +
                '<div><i class="bi bi-exclamation-triangle me-2"></i><strong>Outstanding</strong>' +
                '<span class="text-muted ms-2">' + unpaidCount + ' unpaid invoice' + (unpaidCount !== 1 ? 's' : '') + '</span></div>' +
                '<strong class="fs-5">' + FinanceUtils.formatCurrency(unpaidTotal) + '</strong></div>';
        }

        // Status filter bar
        var filterStatuses = [
            { key: 'created', label: 'Created', badge: 'invoice-badge-created' },
            { key: 'sent', label: 'Sent', badge: 'invoice-badge-sent' },
            { key: 'paid', label: 'Paid', badge: 'invoice-badge-paid' },
            { key: 'void', label: 'Voided', badge: 'invoice-badge-void' }
        ];
        html += '<div class="d-flex align-items-center gap-2 mb-2">' +
            '<small class="text-muted fw-bold me-1">Filter:</small>';
        filterStatuses.forEach(function(fs) {
            var isActive = invoiceStatusFilter.indexOf(fs.key) !== -1;
            var btnClass = isActive ? 'btn-sm btn ' + fs.badge : 'btn-sm btn btn-outline-secondary';
            html += '<button class="' + btnClass + ' inv-status-filter-btn" data-status="' + fs.key + '"' +
                ' style="opacity:' + (isActive ? '1' : '0.5') + '">' +
                FinanceUtils.escapeHtml(fs.label) + '</button>';
        });
        html += '</div>';

        if (invoices.length === 0) {
            html += '<div class="text-center py-4 text-muted">' +
                'No invoices match the current filter</div>';
            container.innerHTML = html;
            attachFilterHandlers(container);
            return;
        }

        html += '<div id="invoiceBulkBar" class="alert alert-info py-2 mb-2" style="display:none">' +
            '<div class="d-flex justify-content-between align-items-center">' +
            '<span><strong id="invoiceBulkCount">0</strong> invoice(s) selected</span>' +
            '<div>' +
            '<button class="btn btn-sm btn-primary me-1" id="btnBulkMarkSent"><i class="bi bi-send"></i> Mark Sent</button>' +
            '<button class="btn btn-sm btn-outline-secondary me-1" id="btnBulkPrint"><i class="bi bi-printer"></i> Print Selected</button>' +
            '<button class="btn btn-sm btn-outline-secondary me-1" id="btnBulkDownload"><i class="bi bi-download"></i> Download Selected</button>' +
            '<button class="btn btn-sm btn-outline-dark" id="btnBulkClear">Clear</button>' +
            '</div></div></div>';

        html += '<table class="table table-hover">' +
            '<thead><tr>' +
            '<th style="width:30px"><input type="checkbox" class="form-check-input" id="invoiceSelectAll"></th>' +
            '<th class="sortable" data-sort="invoiceNumber">Invoice # <i class="bi bi-arrow-down-up"></i></th>' +
            '<th class="sortable" data-sort="client">Client <i class="bi bi-arrow-down-up"></i></th>' +
            '<th class="sortable" data-sort="invoiceDate">Date <i class="bi bi-arrow-down-up"></i></th>' +
            '<th class="text-end">Subtotal</th>' +
            '<th class="text-end">Tax</th>' +
            '<th class="text-end sortable" data-sort="total">Total <i class="bi bi-arrow-down-up"></i></th>' +
            '<th>Status</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        invoices.forEach(function(inv) {
            var invNumber = inv.invoiceNumber || inv.invoice_number || 'N/A';
            var status = inv.invoiceStatus || inv.invoice_status || 'created';
            var knumber = inv.knumber || inv.k_number || '';
            var clientDisplay = FinanceUtils.getClientDisplay(knumber);
            var total = parseFloat(inv.invoiceTotal || inv.invoice_total) || 0;
            var subtotal = parseFloat(inv.invoiceSubtotal || inv.invoice_subtotal) || total / 1.14;
            var tax = total - subtotal;

            var dateDisplay = '';
            if (status === 'paid') dateDisplay = FinanceUtils.formatDateShort(inv.paymentReceivedAt || inv.payment_received_at);
            else if (status === 'sent') dateDisplay = FinanceUtils.formatDateShort(inv.invoiceSentAt || inv.invoice_sent_at);
            else dateDisplay = FinanceUtils.formatDateShort(inv.invoiceCreatedAt || inv.invoice_created_at || inv.created_at);

            var statusBadge = getStatusBadge(status);
            var actions = getInvoiceActions(inv);

            html += '<tr>' +
                '<td><input type="checkbox" class="form-check-input invoice-select-cb" data-invoice-id="' + inv.id + '"></td>' +
                '<td><strong>' + FinanceUtils.escapeHtml(invNumber) + '</strong></td>' +
                '<td>' + clientDisplay + '</td>' +
                '<td>' + FinanceUtils.escapeHtml(dateDisplay) + '</td>' +
                '<td class="text-end">' + FinanceUtils.formatCurrency(subtotal) + '</td>' +
                '<td class="text-end">' + FinanceUtils.formatCurrency(tax) + '</td>' +
                '<td class="text-end"><strong>' + FinanceUtils.formatCurrency(total) + '</strong></td>' +
                '<td>' + statusBadge + '</td>' +
                '<td>' + actions + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Sortable headers
        container.querySelectorAll('.sortable').forEach(function(th) {
            th.style.cursor = 'pointer';
            th.addEventListener('click', function() {
                var col = th.dataset.sort;
                if (invoiceSortState.column === col) {
                    invoiceSortState.direction = invoiceSortState.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    invoiceSortState.column = col;
                    invoiceSortState.direction = 'asc';
                }
                renderInvoicesList();
            });
        });

        // Select-all checkbox
        var selectAll = container.querySelector('#invoiceSelectAll');
        if (selectAll) {
            selectAll.addEventListener('change', function() {
                container.querySelectorAll('.invoice-select-cb').forEach(function(cb) {
                    cb.checked = selectAll.checked;
                });
                updateInvoiceBulkBar();
            });
        }

        // Individual checkboxes
        container.querySelectorAll('.invoice-select-cb').forEach(function(cb) {
            cb.addEventListener('change', updateInvoiceBulkBar);
        });

        // Bulk action buttons
        var bulkDownBtn = document.getElementById('btnBulkDownload');
        if (bulkDownBtn) bulkDownBtn.addEventListener('click', bulkDownloadPdfs);

        var bulkMarkSentBtn = document.getElementById('btnBulkMarkSent');
        if (bulkMarkSentBtn) bulkMarkSentBtn.addEventListener('click', bulkMarkSent);

        var bulkPrintBtn = document.getElementById('btnBulkPrint');
        if (bulkPrintBtn) bulkPrintBtn.addEventListener('click', bulkPrintPdfs);

        var bulkClearBtn = document.getElementById('btnBulkClear');
        if (bulkClearBtn) {
            bulkClearBtn.addEventListener('click', function() {
                container.querySelectorAll('.invoice-select-cb').forEach(function(cb) { cb.checked = false; });
                if (selectAll) selectAll.checked = false;
                updateInvoiceBulkBar();
            });
        }

        // Status filter button handlers
        attachFilterHandlers(container);
    }

    function attachFilterHandlers(container) {
        container.querySelectorAll('.inv-status-filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var status = btn.dataset.status;
                var idx = invoiceStatusFilter.indexOf(status);
                if (idx !== -1) {
                    if (invoiceStatusFilter.length === 1) {
                        FinanceUtils.showToast('At least one filter must be active', 'warning');
                        return;
                    }
                    invoiceStatusFilter.splice(idx, 1);
                } else {
                    invoiceStatusFilter.push(status);
                }
                renderInvoicesList();
            });
        });
    }

    function getSelectedInvoiceIds() {
        var ids = [];
        document.querySelectorAll('.invoice-select-cb:checked').forEach(function(cb) {
            ids.push(cb.dataset.invoiceId);
        });
        return ids;
    }

    function updateInvoiceBulkBar() {
        var selected = getSelectedInvoiceIds();
        var bar = document.getElementById('invoiceBulkBar');
        var countEl = document.getElementById('invoiceBulkCount');
        if (bar) bar.style.display = selected.length > 0 ? 'block' : 'none';
        if (countEl) countEl.textContent = selected.length;
    }

    function getStatusBadge(status) {
        var badges = {
            created: '<span class="badge invoice-badge-created"><i class="bi bi-file-earmark"></i> Created</span>',
            sent: '<span class="badge invoice-badge-sent"><i class="bi bi-send"></i> Sent</span>',
            paid: '<span class="badge invoice-badge-paid"><i class="bi bi-check-circle"></i> Paid</span>',
            void: '<span class="badge invoice-badge-void"><i class="bi bi-x-circle"></i> Void</span>'
        };
        return badges[status] || '<span class="badge bg-secondary">' + FinanceUtils.escapeHtml(status) + '</span>';
    }

    function getInvoiceActions(invoice) {
        var status = invoice.invoiceStatus || invoice.invoice_status;
        var invId = invoice.id;
        var html = '';

        html += '<button class="btn btn-sm btn-outline-secondary me-1" data-action="generate-pdf" data-invoice-id="' + invId + '" title="Generate PDF">' +
            '<i class="bi bi-file-pdf"></i></button>';

        if (status === 'created') {
            html += '<button class="btn btn-sm btn-primary me-1" data-action="mark-sent" data-invoice-id="' + invId + '">' +
                '<i class="bi bi-send"></i> Mark Sent</button>' +
                '<button class="btn btn-sm btn-outline-danger" data-action="void" data-invoice-id="' + invId + '">' +
                '<i class="bi bi-x-circle"></i></button>';
        } else if (status === 'sent') {
            html += '<button class="btn btn-sm btn-success me-1" data-action="mark-paid" data-invoice-id="' + invId + '">' +
                '<i class="bi bi-cash-coin"></i> Mark Paid</button>' +
                '<button class="btn btn-sm btn-outline-danger" data-action="void" data-invoice-id="' + invId + '">' +
                '<i class="bi bi-x-circle"></i></button>';
        }

        return html;
    }

    function sortInvoices(invoices, column, direction) {
        return invoices.slice().sort(function(a, b) {
            var valA, valB;
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
                    valA = new Date(getInvoiceDateForStatus(a) || 0);
                    valB = new Date(getInvoiceDateForStatus(b) || 0);
                    break;
                case 'total':
                    valA = parseFloat(a.invoiceTotal || a.invoice_total) || 0;
                    valB = parseFloat(b.invoiceTotal || b.invoice_total) || 0;
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

    function getInvoiceDateForStatus(invoice) {
        var status = invoice.invoiceStatus || invoice.invoice_status;
        if (status === 'paid') return invoice.paymentReceivedAt || invoice.payment_received_at;
        if (status === 'sent') return invoice.invoiceSentAt || invoice.invoice_sent_at;
        return invoice.invoiceCreatedAt || invoice.invoice_created_at || invoice.created_at;
    }

    // =============================================
    // CREATE INVOICE MODAL
    // =============================================
    function openCreateInvoiceModal(group) {
        var hstRate = FinanceState.appConfig.hst_rate || 0.14;

        document.getElementById('invoiceClientName').value = group.knumber + ' - ' + group.clientName;
        document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('invoiceNotes').value = '';

        var subtotal = 0;
        var listHtml = '';
        group.appointments.forEach(function(apt) {
            var aptDate = FinanceUtils.formatDateShort(FinanceUtils.getAppointmentDate(apt));
            var location = apt.location_name || apt.location || apt.clinic || 'Unknown';
            var rate = parseFloat(apt.billed_amount || apt.customRate || apt.custom_rate) || 0;
            subtotal += rate;

            listHtml += '<div class="d-flex justify-content-between align-items-center border-bottom py-2">' +
                '<div><strong>' + FinanceUtils.escapeHtml(aptDate) + '</strong> \u2014 ' + FinanceUtils.escapeHtml(location) + '</div>' +
                '<div>' + FinanceUtils.formatCurrency(rate) + '</div></div>';
        });

        document.getElementById('invoiceAppointmentsList').innerHTML = listHtml;
        document.getElementById('invoiceSubtotal').textContent = FinanceUtils.formatCurrency(subtotal);
        var hstLabel = document.getElementById('invoiceHstLabel');
        if (hstLabel) hstLabel.textContent = 'HST (' + Math.round(hstRate * 100) + '%):';
        document.getElementById('invoiceTax').textContent = FinanceUtils.formatCurrency(subtotal * hstRate);
        document.getElementById('invoiceTotal').textContent = FinanceUtils.formatCurrency(subtotal * (1 + hstRate));

        var modal = document.getElementById('createInvoiceModal');
        var bsModal = new bootstrap.Modal(modal);

        var confirmBtn = document.getElementById('confirmCreateInvoice');
        var newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        newBtn.addEventListener('click', async function() {
            newBtn.disabled = true;
            newBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Creating...';

            try {
                var appointmentIds = group.appointments.map(function(a) { return a.id; });
                var invoiceDate = document.getElementById('invoiceDate').value;
                var notes = document.getElementById('invoiceNotes').value;

                var response = await APIClient.post('/create-invoice', {
                    knumber: group.knumber,
                    appointment_ids: appointmentIds,
                    invoice_date: invoiceDate,
                    notes: notes
                });

                var invNum = (response.data && response.data.invoice_number) || response.invoice_number || 'unknown';
                await logFinanceAudit('create_invoice', 'invoice', invNum, {
                    knumber: group.knumber,
                    appointment_count: appointmentIds.length,
                    invoice_date: invoiceDate
                });

                bsModal.hide();
                FinanceUtils.showToast('Invoice created successfully', 'success');

                await window.loadTab_invoicing();
                TabManager.markStale('review');

            } catch (error) {
                console.error('[Finance Invoicing] Error creating invoice:', error);
                FinanceUtils.showToast('Failed to create invoice', 'danger');
            } finally {
                newBtn.disabled = false;
                newBtn.innerHTML = '<i class="bi bi-check-lg"></i> Create Invoice';
            }
        });

        bsModal.show();
    }

    // =============================================
    // INVOICE STATUS ACTIONS
    // =============================================
    async function markInvoiceSent(invoiceId) {
        var selectedDate = await showDatePickerModal('Mark Invoice as Sent', 'When was this invoice sent?');
        if (!selectedDate) return;

        try {
            await APIClient.post('/update-invoice-status-v2', {
                invoiceId: invoiceId,
                status: 'sent',
                invoiceSentAt: selectedDate
            });

            await logFinanceAudit('mark_invoice_sent', 'invoice', invoiceId, { sent_date: selectedDate });
            FinanceUtils.showToast('Invoice marked as sent', 'success');
            await window.loadTab_invoicing();

        } catch (error) {
            console.error('[Finance Invoicing] Error:', error);
            FinanceUtils.showToast('Failed to update invoice', 'danger');
        }
    }

    async function bulkMarkSent() {
        var ids = getSelectedInvoiceIds();
        if (ids.length === 0) return;

        // Filter to only "created" invoices
        var createdIds = ids.filter(function(id) {
            var inv = FinanceState.invoices.find(function(i) { return String(i.id) === String(id); });
            var status = inv && (inv.invoiceStatus || inv.invoice_status);
            return status === 'created';
        });

        if (createdIds.length === 0) {
            FinanceUtils.showToast('No selected invoices have "Created" status', 'warning');
            return;
        }

        var selectedDate = await showDatePickerModal('Bulk Mark as Sent',
            'When were these ' + createdIds.length + ' invoice(s) sent?');
        if (!selectedDate) return;

        var btn = document.getElementById('btnBulkMarkSent');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 0/' + createdIds.length;
        }

        var sent = 0;
        var failed = 0;

        for (var i = 0; i < createdIds.length; i++) {
            try {
                await APIClient.post('/update-invoice-status-v2', {
                    invoiceId: createdIds[i],
                    status: 'sent',
                    invoiceSentAt: selectedDate
                });
                sent++;
            } catch (error) {
                console.error('[Finance Invoicing] Error marking sent ' + createdIds[i] + ':', error);
                failed++;
            }
            if (btn) {
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ' + (i + 1) + '/' + createdIds.length;
            }
        }

        if (sent > 0) {
            await logFinanceAudit('bulk_mark_invoice_sent', 'invoice', createdIds.join(','), {
                count: sent, sent_date: selectedDate
            });
        }

        if (failed > 0) {
            FinanceUtils.showToast(sent + ' marked sent, ' + failed + ' failed', 'warning');
        } else {
            FinanceUtils.showToast(sent + ' invoice(s) marked as sent', 'success');
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-send"></i> Mark Sent';
        }

        await window.loadTab_invoicing();
    }

    async function markInvoicePaid(invoiceId) {
        var selectedDate = await showDatePickerModal('Mark Invoice as Paid', 'When was payment received?');
        if (!selectedDate) return;

        try {
            await APIClient.post('/update-invoice-status-v2', {
                invoiceId: invoiceId,
                status: 'paid',
                paymentReceivedAt: selectedDate
            });

            await logFinanceAudit('mark_invoice_paid', 'invoice', invoiceId, { payment_date: selectedDate });
            FinanceUtils.showToast('Invoice marked as paid', 'success');
            await window.loadTab_invoicing();

        } catch (error) {
            console.error('[Finance Invoicing] Error:', error);
            FinanceUtils.showToast('Failed to update invoice', 'danger');
        }
    }

    async function voidInvoice(invoiceId) {
        if (!confirm('Void this invoice? Appointments will return to "ready" status.')) return;

        try {
            await APIClient.post('/void-invoice', { invoiceId: invoiceId });
            await logFinanceAudit('void_invoice', 'invoice', invoiceId, { reason: 'User voided invoice' });
            FinanceUtils.showToast('Invoice voided', 'success');
            await window.loadTab_invoicing();
            TabManager.markStale('review');

        } catch (error) {
            console.error('[Finance Invoicing] Error:', error);
            FinanceUtils.showToast('Failed to void invoice', 'danger');
        }
    }

    // =============================================
    // PDF GENERATION WITH pdf-lib
    // =============================================
    async function loadPdfLib() {
        if (pdfLibLoaded) return;
        return new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
            script.onload = function() { pdfLibLoaded = true; resolve(); };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async function getTemplateBytes() {
        var cacheKey = 'rrts_insurance_template_v1';
        var cached = localStorage.getItem(cacheKey);
        if (cached) {
            return Uint8Array.from(atob(cached), function(c) { return c.charCodeAt(0); });
        }

        var response = await fetch('docs/reference/POC 02 Ambu Claim Form w Provider Info Addedv3_template.pdf');
        var bytes = new Uint8Array(await response.arrayBuffer());

        try {
            // Use chunked conversion to avoid call stack overflow for large PDFs
            var binary = '';
            var chunkSize = 8192;
            for (var i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            localStorage.setItem(cacheKey, btoa(binary));
        } catch (e) {
            console.warn('[Finance Invoicing] Template too large for localStorage cache');
        }

        return bytes;
    }

    async function fillInsuranceForm(invData, appointments, client, grandBillProgramTotal) {
        await loadPdfLib();
        var templateBytes = await getTemplateBytes();

        var pdfDoc = await PDFLib.PDFDocument.load(templateBytes);
        var form = pdfDoc.getForm();

        // Client header fields
        var clientName = ((client.firstname || client.first_name || '') + ' ' + (client.lastname || client.last_name || '')).trim();
        trySetField(form, 'ClientName', clientName);
        trySetField(form, 'kNumber', client.knumber || client.k_number || '');
        trySetField(form, 'clientCivic', client.civicaddress || client.address || client.primary_address || '');
        trySetField(form, 'clientCity', client.city || '');
        trySetField(form, 'clientProv', client.province || 'NS');
        trySetField(form, 'clientPostalCode', client.postalcode || client.postal_code || '');
        trySetField(form, 'ClientPhone', client.phone || '');
        trySetField(form, 'formDate', invData.invoice_date || invData.invoiceDate || '');

        // Defaults from app_config
        var defaults = FinanceState.appConfig.insurance_form_defaults || {};
        var benefitCodes = FinanceState.appConfig.benefit_codes || {};
        var defaultBenefitCode = (benefitCodes['1'] && benefitCodes['1'].code) || '700409';
        var defaultPrescriber = defaults.prescriber || 'MD';
        var defaultAmountProv = parseFloat(defaults.amount_from_province) || 0;

        // Line items (max 10 per page)
        var hstRate = FinanceState.appConfig.hst_rate || 0.14;
        var billProgramTotal = 0;
        var maxRows = Math.min(appointments.length, 10);

        for (var i = 0; i < maxRows; i++) {
            var appt = appointments[i];
            var rowNum = i + 1;
            var billedAmount = parseFloat(appt.billed_amount || appt.customRate || appt.custom_rate) || 0;
            var totalWithTax = Math.round(billedAmount * (1 + hstRate) * 100) / 100;
            var billProgram = totalWithTax - defaultAmountProv;

            trySetField(form, 'DateServiceRow' + rowNum,
                FinanceUtils.formatDateDMY(FinanceUtils.getAppointmentDate(appt)));
            trySetField(form, 'BenefitCodeRow' + rowNum, defaultBenefitCode);
            trySetField(form, 'PrescriberRow' + rowNum, defaultPrescriber);
            trySetField(form, 'TotalRow' + rowNum, totalWithTax.toFixed(2));
            trySetField(form, 'AmountProvRow' + rowNum, defaultAmountProv.toFixed(2));
            trySetField(form, 'BillProgramRow' + rowNum, billProgram.toFixed(2));

            billProgramTotal += billProgram;
        }

        var totalToDisplay = grandBillProgramTotal != null ? grandBillProgramTotal : billProgramTotal;
        trySetField(form, 'BillProgramTotal', totalToDisplay.toFixed(2));

        form.flatten();
        return await pdfDoc.save();
    }

    function trySetField(form, fieldName, value) {
        try {
            var field = form.getTextField(fieldName);
            if (field) field.setText(String(value || ''));
        } catch (e) {
            // Field not found in PDF, skip silently
        }
    }

    async function generatePdfForInvoice(invoiceId) {
        var invoice = invoiceData.invoices.find(function(inv) { return inv.id === invoiceId; });
        if (!invoice) {
            FinanceUtils.showToast('Invoice not found', 'danger');
            return;
        }

        var knumber = invoice.knumber || invoice.k_number;
        var client = FinanceState.clients[knumber];
        if (!client) {
            FinanceUtils.showToast('Client data not found for ' + knumber, 'danger');
            return;
        }

        // Get appointments for this invoice
        var appointmentIds = invoice.appointmentIds || invoice.appointment_ids || [];
        var invoiceAppts = FinanceState.appointments.filter(function(apt) {
            return appointmentIds.includes(apt.id);
        });

        // Sort by date
        invoiceAppts.sort(function(a, b) {
            return new Date(FinanceUtils.getAppointmentDate(a)) - new Date(FinanceUtils.getAppointmentDate(b));
        });

        // Show loading state on button
        var btn = document.querySelector('[data-action="generate-pdf"][data-invoice-id="' + invoiceId + '"]');
        var origBtnHtml = '';
        if (btn) {
            origBtnHtml = btn.innerHTML;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            btn.disabled = true;
        }

        try {
            // Generate PDFs (split into chunks of 10)
            invoiceData.pdfPages = [];
            var chunkSize = 10;
            var totalPages = Math.ceil(invoiceAppts.length / chunkSize) || 1;

            // Pre-calculate grand BillProgramTotal across all appointments (with tax)
            var defaultAmountProv = parseFloat((FinanceState.appConfig.insurance_form_defaults || {}).amount_from_province) || 0;
            var pdfHstRate = FinanceState.appConfig.hst_rate || 0.14;
            var grandBillProgramTotal = 0;
            invoiceAppts.forEach(function(appt) {
                var billedAmount = parseFloat(appt.billed_amount || appt.customRate || appt.custom_rate) || 0;
                var totalWithTax = Math.round(billedAmount * (1 + pdfHstRate) * 100) / 100;
                grandBillProgramTotal += totalWithTax - defaultAmountProv;
            });

            for (var p = 0; p < totalPages; p++) {
                var chunk = invoiceAppts.slice(p * chunkSize, (p + 1) * chunkSize);
                var isLastPage = (p === totalPages - 1);
                var pdfBytes = await fillInsuranceForm(invoice, chunk, client, isLastPage ? grandBillProgramTotal : null);
                invoiceData.pdfPages.push(pdfBytes);
            }

            invoiceData.currentPdfPage = 0;
            invoiceData.currentInvoiceId = invoiceId;
            invoiceData.currentInvoiceNumber = invoice.invoiceNumber || invoice.invoice_number || 'N/A';

            showPdfPreview();

        } catch (error) {
            console.error('[Finance Invoicing] PDF generation error:', error);
            FinanceUtils.showToast('Failed to generate PDF: ' + error.message, 'danger');
        } finally {
            if (btn) {
                btn.innerHTML = origBtnHtml;
                btn.disabled = false;
            }
        }
    }

    // =============================================
    // PDF PREVIEW MODAL
    // =============================================
    function showPdfPreview() {
        var pages = invoiceData.pdfPages;
        if (!pages || pages.length === 0) return;

        var currentPage = invoiceData.currentPdfPage;
        var totalPages = pages.length;

        // Set invoice number in header
        var numEl = document.getElementById('pdfPreviewInvoiceNumber');
        if (numEl) numEl.textContent = invoiceData.currentInvoiceNumber;

        // Page indicator
        var pageInfo = document.getElementById('pdfPageInfo');
        if (pageInfo) {
            pageInfo.textContent = totalPages > 1
                ? 'Page ' + (currentPage + 1) + ' of ' + totalPages
                : '';
        }

        // Navigation buttons
        var prevBtn = document.getElementById('btnPdfPrevPage');
        var nextBtn = document.getElementById('btnPdfNextPage');
        if (prevBtn) prevBtn.style.display = totalPages > 1 ? 'inline-block' : 'none';
        if (nextBtn) nextBtn.style.display = totalPages > 1 ? 'inline-block' : 'none';
        if (prevBtn) prevBtn.disabled = currentPage === 0;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;

        // Display PDF in iframe (revoke previous URL to prevent memory leak)
        var iframe = document.getElementById('pdfPreviewFrame');
        if (iframe) {
            if (iframe.src && iframe.src.startsWith('blob:')) {
                URL.revokeObjectURL(iframe.src);
            }
            var blob = new Blob([pages[currentPage]], { type: 'application/pdf' });
            iframe.src = URL.createObjectURL(blob);
        }

        // Show modal
        var modal = document.getElementById('pdfPreviewModal');
        var bsModal = bootstrap.Modal.getOrCreateInstance(modal);
        bsModal.show();
    }

    function handleDownloadPdf() {
        var pages = invoiceData.pdfPages;
        var currentPage = invoiceData.currentPdfPage;
        if (!pages || !pages[currentPage]) return;

        var blob = new Blob([pages[currentPage]], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'Invoice-' + invoiceData.currentInvoiceNumber +
            (pages.length > 1 ? '-Page' + (currentPage + 1) : '') + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
    }

    async function handleUploadPdf() {
        var pages = invoiceData.pdfPages;
        var currentPage = invoiceData.currentPdfPage;
        if (!pages || !pages[currentPage]) return;

        var btn = document.getElementById('btnUploadPdf');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Uploading...';
        }

        try {
            var blob = new Blob([pages[currentPage]], { type: 'application/pdf' });
            var formData = new FormData();
            formData.append('file', blob, 'Invoice-' + invoiceData.currentInvoiceNumber + '.pdf');
            formData.append('invoice_id', invoiceData.currentInvoiceId);

            await APIClient.upload('/upload-invoice-pdf', formData);
            FinanceUtils.showToast('PDF saved to storage', 'success');

        } catch (error) {
            console.error('[Finance Invoicing] Upload error:', error);
            FinanceUtils.showToast('Failed to upload PDF', 'danger');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-cloud-upload"></i> Save to Storage';
            }
        }
    }

    // =============================================
    // PRINT
    // =============================================
    function handlePrintPdf() {
        var iframe = document.getElementById('pdfPreviewFrame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        }
    }

    // =============================================
    // BULK PDF OPERATIONS
    // =============================================
    async function generatePdfBytesForInvoice(invoice) {
        var knumber = invoice.knumber || invoice.k_number;
        var client = FinanceState.clients[knumber];
        if (!client) return null;

        var appointmentIds = invoice.appointmentIds || invoice.appointment_ids || [];
        var invoiceAppts = FinanceState.appointments.filter(function(apt) {
            return appointmentIds.includes(apt.id);
        });
        invoiceAppts.sort(function(a, b) {
            return new Date(FinanceUtils.getAppointmentDate(a)) - new Date(FinanceUtils.getAppointmentDate(b));
        });

        var defaultAmountProv = parseFloat((FinanceState.appConfig.insurance_form_defaults || {}).amount_from_province) || 0;
        var pdfHstRate = FinanceState.appConfig.hst_rate || 0.14;
        var grandBillProgramTotal = 0;
        invoiceAppts.forEach(function(appt) {
            var billedAmount = parseFloat(appt.billed_amount || appt.customRate || appt.custom_rate) || 0;
            var totalWithTax = Math.round(billedAmount * (1 + pdfHstRate) * 100) / 100;
            grandBillProgramTotal += totalWithTax - defaultAmountProv;
        });

        var pages = [];
        var chunkSize = 10;
        var totalPages = Math.ceil(invoiceAppts.length / chunkSize) || 1;
        for (var p = 0; p < totalPages; p++) {
            var chunk = invoiceAppts.slice(p * chunkSize, (p + 1) * chunkSize);
            var isLastPage = (p === totalPages - 1);
            var pdfBytes = await fillInsuranceForm(invoice, chunk, client, isLastPage ? grandBillProgramTotal : null);
            pages.push(pdfBytes);
        }
        return pages;
    }

    async function bulkDownloadPdfs() {
        var ids = getSelectedInvoiceIds();
        if (ids.length === 0) return;

        var btn = document.getElementById('btnBulkDownload');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Generating...'; }

        try {
            for (var i = 0; i < ids.length; i++) {
                var inv = invoiceData.invoices.find(function(x) { return x.id === ids[i]; });
                if (!inv) continue;

                if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ' + (i + 1) + '/' + ids.length;

                var pages = await generatePdfBytesForInvoice(inv);
                if (!pages) continue;

                var invNum = inv.invoiceNumber || inv.invoice_number || 'N-A';
                for (var p = 0; p < pages.length; p++) {
                    var blob = new Blob([pages[p]], { type: 'application/pdf' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'Invoice-' + invNum + (pages.length > 1 ? '-Page' + (p + 1) : '') + '.pdf';
                    a.click();
                    URL.revokeObjectURL(url);
                }
            }
            FinanceUtils.showToast(ids.length + ' invoice PDF(s) downloaded', 'success');
        } catch (err) {
            console.error('[Finance Invoicing] Bulk download error:', err);
            FinanceUtils.showToast('Failed to generate PDFs', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-download"></i> Download Selected'; }
        }
    }

    async function bulkPrintPdfs() {
        var ids = getSelectedInvoiceIds();
        if (ids.length === 0) return;

        var btn = document.getElementById('btnBulkPrint');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Generating...'; }

        try {
            await loadPdfLib();

            // Generate individual PDF bytes for each invoice
            var pdfBytesList = [];
            for (var i = 0; i < ids.length; i++) {
                var inv = invoiceData.invoices.find(function(x) { return x.id === ids[i]; });
                if (!inv) continue;
                if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ' + (i + 1) + '/' + ids.length;
                var pages = await generatePdfBytesForInvoice(inv);
                if (pages) pdfBytesList = pdfBytesList.concat(pages);
            }

            if (pdfBytesList.length === 0) return;

            // Merge all PDFs into a single document using pdf-lib
            var mergedPdf = await PDFLib.PDFDocument.create();
            for (var j = 0; j < pdfBytesList.length; j++) {
                var srcDoc = await PDFLib.PDFDocument.load(pdfBytesList[j]);
                var copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
                copiedPages.forEach(function(page) { mergedPdf.addPage(page); });
            }

            var mergedBytes = await mergedPdf.save();
            var blob = new Blob([mergedBytes], { type: 'application/pdf' });
            var blobUrl = URL.createObjectURL(blob);
            var printWin = window.open(blobUrl, '_blank');
            if (printWin) {
                printWin.addEventListener('load', function() { printWin.print(); });
            }

            FinanceUtils.showToast('Print dialog opened for ' + ids.length + ' invoice(s)', 'success');
        } catch (err) {
            console.error('[Finance Invoicing] Bulk print error:', err);
            FinanceUtils.showToast('Failed to generate PDFs for printing', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-printer"></i> Print Selected'; }
        }
    }

    // =============================================
    // SKELETON
    // =============================================
    function showSkeleton(show) {
        var skeleton = document.getElementById('invoicingSkeleton');
        var content = document.getElementById('invoicingContent');
        if (skeleton) skeleton.style.display = show ? 'block' : 'none';
        if (content) content.style.display = show ? 'none' : 'block';
    }

    // =============================================
    // EVENT HANDLERS
    // =============================================
    document.addEventListener('DOMContentLoaded', function() {
        // Invoice list action delegation (set up once to avoid accumulation on re-render)
        var invListContainer = document.getElementById('invoicesListContainer');
        if (invListContainer) {
            invListContainer.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-action]');
                if (!btn) return;

                var action = btn.dataset.action;
                var invId = btn.dataset.invoiceId;

                if (action === 'mark-sent') markInvoiceSent(invId);
                else if (action === 'mark-paid') markInvoicePaid(invId);
                else if (action === 'void') voidInvoice(invId);
                else if (action === 'generate-pdf') generatePdfForInvoice(invId);
            });
        }

        // PDF preview buttons
        var printBtn = document.getElementById('btnPrintPdf');
        if (printBtn) printBtn.addEventListener('click', handlePrintPdf);

        var dlBtn = document.getElementById('btnDownloadPdf');
        if (dlBtn) dlBtn.addEventListener('click', handleDownloadPdf);

        var ulBtn = document.getElementById('btnUploadPdf');
        if (ulBtn) ulBtn.addEventListener('click', handleUploadPdf);

        var prevPageBtn = document.getElementById('btnPdfPrevPage');
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', function() {
                if (invoiceData.currentPdfPage > 0) {
                    invoiceData.currentPdfPage--;
                    showPdfPreview();
                }
            });
        }

        var nextPageBtn = document.getElementById('btnPdfNextPage');
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', function() {
                if (invoiceData.currentPdfPage < invoiceData.pdfPages.length - 1) {
                    invoiceData.currentPdfPage++;
                    showPdfPreview();
                }
            });
        }
    });

    console.log('[Finance] Invoicing v6.0.0 loaded');
})();
