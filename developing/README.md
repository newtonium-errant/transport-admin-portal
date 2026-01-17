# RRTS Testing Environment

This folder contains all TEST versions of the RRTS Transport Admin Portal for safe testing before deploying to production.

## 📁 Directory Structure

```
testing/
├── README.md                           # This file
├── SECURITY_TESTING_CHECKLIST.md      # Security testing checklist
│
├── TEST-PRIMARY-CLINIC-SUMMARY.md     # Complete guide for Primary Clinic feature testing
├── TEST-API-ENDPOINTS-NEEDED.md       # Documentation of TEST API endpoints
│
├── TEST-clients-sl.html               # Client list with primary clinic display
├── TEST-client-modal.js               # Client quick edit modal with primary clinic
├── TEST-client-profile.html           # Full client profile editor
├── TEST-client-profile.js             # Client profile controller
│
├── TEST-add-appointments.html         # Single appointment creation with pre-selection
├── TEST-appointments-bulk-add.html    # Bulk appointment creation with pre-selection
│
├── TEST-finance.html                  # Finance dashboard for invoice/payment testing
└── TEST-finance.js                    # Finance dashboard controller
```

## 🎯 Purpose

All TEST files in this folder:
- Connect to the **Testing Branch Supabase** database
- Use **TEST API endpoints** (e.g., `TEST-getActiveClients`, `TEST-update-client`)
- Display **orange warning banners** to clearly indicate TEST mode
- Allow safe testing without affecting production data

## 🚀 Quick Start

### Primary Clinic Feature Testing

1. **Phase 1 - Client Quick Edit**:
   - Open `TEST-clients-sl.html`
   - Click "Quick Edit" on any client
   - Set/change primary clinic

2. **Phase 2 - Client Profile**:
   - Open `TEST-clients-sl.html`
   - Click "View Profile (TEST)" button
   - Edit all client fields including primary clinic

3. **Phase 3 - Appointment Pre-Selection**:
   - Open `TEST-add-appointments.html`
   - Select a client with primary clinic
   - Verify clinic dropdown auto-selects their primary clinic

### Finance Dashboard Testing

1. Open `TEST-finance.html`
2. Test invoice status updates
3. Test driver payment marking
4. Test booking agent payment marking

## 📋 Required TEST Endpoints

All endpoints are hosted at:
`https://webhook-processor-production-3bb8.up.railway.app/webhook/`

### ✅ Active Endpoints (Created by user):

**Client Management:**
- `TEST-new-client` - Create new client
- `TEST-update-client` - Update client details
- `TEST-getActiveClients` - Get all active clients
- `TEST-get-client` - Get single client by K-number

**Appointment Management:**
- `TEST-save-appointment` - Create appointment
- `TEST-update-appointment-complete` - Update appointment
- `TEST-cancel-appointment` - Cancel appointment
- `TEST-soft-delete-appointment` - Soft delete appointment
- `TEST-hard-delete-appointment` - Hard delete appointment with calendar cleanup
- `TEST-unarchive-appointment` - Restore soft-deleted appointment
- `TEST-get-appointments-page-data` - Get appointments for page view
- `TEST-get-all-appointments` - Get all appointments (historic data)

**Finance Management:**
- `TEST-update-invoice-status` - Update invoice status
- `TEST-mark-driver-paid` - Mark driver as paid
- `TEST-mark-agent-paid` - Mark booking agent as paid

### ⏳ Needed Endpoints:
- None - All required endpoints have been created!

## 📝 Testing Checklist

See `TEST-PRIMARY-CLINIC-SUMMARY.md` for complete testing checklists for:
- Client Quick Edit Modal
- Client Profile Page
- Single Appointment Creation
- Bulk Appointment Creation

## ⚠️ Important Notes

1. **All TEST files save to Testing Branch database only**
2. **Orange warning banners** appear on all TEST pages
3. **Console logging** enabled for debugging (check browser console)
4. **No production data** is affected during testing

## 🔄 Deploying to Production

Once testing is complete:

1. **Database Changes**: Apply any schema changes to production Supabase
2. **Workflows**: Create production versions of TEST workflows (remove TEST- prefix, use Production Supabase credential)
3. **Frontend Files**: Remove TEST- prefix from filenames, remove warning banners, update endpoints to production
4. **Verify**: Test production endpoints thoroughly before user access

## 📖 Documentation

- **Primary Clinic Implementation**: See `TEST-PRIMARY-CLINIC-SUMMARY.md`
- **API Endpoints**: See `TEST-API-ENDPOINTS-NEEDED.md`
- **Security Testing**: See `SECURITY_TESTING_CHECKLIST.md`

---

**Version**: 1.0.0
**Last Updated**: 2025-01-09
**Status**: Ready for Testing
