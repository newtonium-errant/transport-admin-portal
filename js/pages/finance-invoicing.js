/**
 * Finance Invoicing Tab - Client invoicing, PDF generation, invoice management
 * Version: 6.0.0
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

    // =============================================
    // TAB LOADER
    // =============================================
    window.loadTab_invoicing = async function() {
        console.log('[Finance Invoicing] Loading tab...');
        showSkeleton(true);

        try {
            var results = await Promise.all([
                APIClient.get('/get-finance-appointments').catch(function(err) {
                    console.warn('[Finance Invoicing] Error loading appointments:', err);
                    return { data: [] };
                }),
                APIClient.get('/get-invoices').catch(function(err) {
                    console.warn('[Finance Invoicing] Error loading invoices:', err);
                    return { data: [] };
                })
            ]);

            // Update shared appointment state
            var apptData = results[0];
            var raw = apptData.data || apptData.appointments || apptData || [];
            if (!Array.isArray(raw)) raw = [];
            FinanceState.appointments = raw;

            // Parse invoices
            var invData = results[1];
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
                    clientName: ((apt.clientFirstName || apt.client_first_name || '') + ' ' +
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

        var html = '';
        groups.forEach(function(group, idx) {
            var subtotal = 0;
            group.appointments.forEach(function(apt) {
                subtotal += parseFloat(apt.customRate || apt.custom_rate) || 0;
            });
            var hst = subtotal * hstRate;
            var total = subtotal + hst;
            var expandId = 'client-group-' + idx;
            var apptCount = group.appointments.length;

            html += '<div class="card mb-2">' +
                '<div class="card-body py-2 px-3">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<div class="d-flex align-items-center gap-3 cursor-pointer flex-grow-1" data-bs-toggle="collapse" data-bs-target="#' + expandId + '">' +
                '<i class="bi bi-chevron-right collapse-icon"></i>' +
                '<div><strong>' + FinanceUtils.escapeHtml(group.knumber) + '</strong> \u2014 ' +
                FinanceUtils.escapeHtml(group.clientName) +
                '<span class="text-muted ms-2">(' + apptCount + ' appt' + (apptCount !== 1 ? 's' : '') + ')</span></div>' +
                '</div>' +
                '<div class="d-flex align-items-center gap-4">' +
                '<div class="text-end">' +
                '<div class="small text-muted">Subtotal: ' + FinanceUtils.formatCurrency(subtotal) + '</div>' +
                '<div class="small text-muted">HST (' + Math.round(hstRate * 100) + '%): ' + FinanceUtils.formatCurrency(hst) + '</div>' +
                '<div><strong>' + FinanceUtils.formatCurrency(total) + '</strong></div>' +
                '</div>' +
                '<button class="btn btn-primary btn-sm btn-create-invoice" ' +
                'data-knumber="' + FinanceUtils.escapeHtml(group.knumber) + '" ' +
                'data-client-name="' + FinanceUtils.escapeHtml(group.clientName) + '" ' +
                'data-group-idx="' + idx + '">' +
                '<i class="bi bi-file-earmark-plus"></i> Create Invoice</button>' +
                '</div></div>' +
                '<div class="collapse" id="' + expandId + '">' +
                '<table class="table table-sm table-bordered mt-2 mb-0">' +
                '<thead><tr><th>Date</th><th>Location</th><th>Type</th><th class="text-end">Amount</th></tr></thead>' +
                '<tbody>';

            group.appointments.forEach(function(apt) {
                var aptDate = FinanceUtils.formatDateShort(FinanceUtils.getAppointmentDate(apt));
                var location = apt.location || apt.clinic || 'Unknown';
                var apptType = apt.appointment_type || apt.appointmentType || 'round_trip';
                var typeLabel = apptType === 'one_way' ? 'One-Way' : apptType === 'support' ? 'Support' : 'Round Trip';
                var rate = parseFloat(apt.customRate || apt.custom_rate) || 0;

                html += '<tr>' +
                    '<td>' + FinanceUtils.escapeHtml(aptDate) + '</td>' +
                    '<td>' + FinanceUtils.escapeHtml(location) + '</td>' +
                    '<td>' + FinanceUtils.escapeHtml(typeLabel) + '</td>' +
                    '<td class="text-end">' + FinanceUtils.formatCurrency(rate) + '</td>' +
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
    }

    // =============================================
    // INVOICES LIST RENDERING
    // =============================================
    function renderInvoicesList() {
        var container = document.getElementById('invoicesListContainer');
        if (!container) return;

        var invoices = invoiceData.invoices;

        // Sort
        invoices = sortInvoices(invoices, invoiceSortState.column, invoiceSortState.direction);

        if (invoices.length === 0) {
            container.innerHTML = '<div class="text-center py-4 text-muted">' +
                '<i class="bi bi-file-earmark" style="font-size: 2rem; display: block; margin-bottom: 8px;"></i>' +
                'No invoices created yet</div>';
            return;
        }

        var html = '<table class="table table-hover">' +
            '<thead><tr>' +
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
            var location = apt.location || apt.clinic || 'Unknown';
            var rate = parseFloat(apt.customRate || apt.custom_rate) || 0;
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
                    appointmentIds: appointmentIds,
                    invoiceDate: invoiceDate,
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
        trySetField(form, 'clientCivic', client.address || client.primary_address || '');
        trySetField(form, 'clientCity', client.city || '');
        trySetField(form, 'clientProv', client.province || 'NS');
        trySetField(form, 'clientPostalCode', client.postal_code || '');
        trySetField(form, 'ClientPhone', client.phone || '');
        trySetField(form, 'formDate', invData.invoice_date || invData.invoiceDate || '');

        // Defaults from app_config
        var defaults = FinanceState.appConfig.insurance_form_defaults || {};
        var benefitCodes = FinanceState.appConfig.benefit_codes || {};
        var defaultBenefitCode = (benefitCodes['1'] && benefitCodes['1'].code) || '700409';
        var defaultPrescriber = defaults.prescriber || 'MD';
        var defaultAmountProv = parseFloat(defaults.amount_from_province) || 0;

        // Line items (max 10 per page)
        var billProgramTotal = 0;
        var maxRows = Math.min(appointments.length, 10);

        for (var i = 0; i < maxRows; i++) {
            var appt = appointments[i];
            var rowNum = i + 1;
            var billedAmount = parseFloat(appt.customRate || appt.custom_rate || appt.billed_amount) || 0;
            var billProgram = billedAmount - defaultAmountProv;

            trySetField(form, 'DateServiceRow' + rowNum,
                FinanceUtils.formatDateShort(FinanceUtils.getAppointmentDate(appt)));
            trySetField(form, 'BenefitCodeRow' + rowNum, defaultBenefitCode);
            trySetField(form, 'PrescriberRow' + rowNum, defaultPrescriber);
            trySetField(form, 'TotalRow' + rowNum, billedAmount.toFixed(2));
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

            // Pre-calculate grand BillProgramTotal across all appointments
            var defaultAmountProv = parseFloat((FinanceState.appConfig.insurance_form_defaults || {}).amount_from_province) || 0;
            var grandBillProgramTotal = 0;
            invoiceAppts.forEach(function(appt) {
                var billedAmount = parseFloat(appt.customRate || appt.custom_rate || appt.billed_amount) || 0;
                grandBillProgramTotal += billedAmount - defaultAmountProv;
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
