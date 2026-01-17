# TEST Files - Production Source Mapping

Complete list of TEST files and their production sources.

## ✅ Current TEST Files (in `testing/` folder)

### Client Management
| TEST File | Production Source | Status |
|-----------|------------------|--------|
| `TEST-clients-sl.html` | `clients-sl.html` | ✅ Ready |
| `TEST-client-modal.js` | `client-modal.js` | ✅ Ready |
| `TEST-client-profile.html` | *(new file)* | ✅ Ready |
| `TEST-client-profile.js` | *(new file)* | ✅ Ready |

### Appointment Management
| TEST File | Production Source | Status |
|-----------|------------------|--------|
| `TEST-appointments-sl.html` | `appointments-sl.html` | ✅ Ready - **CURRENT** |
| `TEST-appointments-sl.js` | `appointments-sl.js` | ✅ Ready - **CURRENT** |
| `TEST-appointments-bulk-add.html` | `appointments-bulk-add.html` | ✅ Ready |

### Finance Dashboard
| TEST File | Production Source | Status |
|-----------|------------------|--------|
| `TEST-finance.html` | `finance.html` | ✅ Ready |
| `TEST-finance.js` | `finance.js` | ✅ Ready |

### Documentation
| TEST File | Purpose | Status |
|-----------|---------|--------|
| `TEST-PRIMARY-CLINIC-SUMMARY.md` | Primary Clinic feature guide | ✅ Complete |
| `TEST-API-ENDPOINTS-NEEDED.md` | TEST endpoint documentation | ✅ Complete |
| `README.md` | Testing folder overview | ✅ Complete |
| `FILE-MAPPING.md` | This file | ✅ Complete |

---

## 🗑️ Deprecated Files (moved to `deprecated/` folder)

| File | Replaced By | Reason |
|------|-------------|--------|
| `add-appointments.html` | `appointments-sl.html` | Old appointment interface |
| `appointments-new.html` | `appointments-sl.html` | Intermediate appointment interface |
| `TEST-add-appointments.html` | `TEST-appointments-sl.html` | Based on deprecated source |

---

## 📋 TEST Endpoint Mappings

### Client Endpoints
- `TEST-getActiveClients` - Get all active clients
- `TEST-get-client` - Get single client by K-number
- `TEST-new-client` - Create new client
- `TEST-update-client` - Update existing client

### Appointment Endpoints (appointments-sl)
- `TEST-get-appointments-page-data` - Get appointments for list/calendar view
- `TEST-get-all-appointments` - Get all appointments (archives/history)
- `TEST-save-appointment-v7` - Create/update appointments
- `TEST-update-appointment-complete` - Mark appointment complete
- `TEST-cancel-appointment` - Cancel appointment
- `TEST-soft-delete-appointment` - Soft delete appointment
- `TEST-delete-appointment-with-calendar` - Hard delete with calendar cleanup
- `TEST-unarchive-appointment` - Restore archived appointment

### Finance Endpoints
- `TEST-update-invoice-status` - Update invoice status
- `TEST-mark-driver-paid` - Mark driver as paid
- `TEST-mark-agent-paid` - Mark booking agent as paid

---

## 🎯 Primary Clinic Feature

The Primary Clinic feature is implemented across multiple TEST files:

**Phase 1** - Client Quick Edit:
- TEST-clients-sl.html - Displays primary clinic
- TEST-client-modal.js - Edit primary clinic in modal

**Phase 2** - Full Profile:
- TEST-client-profile.html - Edit all client fields including primary clinic
- TEST-client-profile.js - Controller for profile page

**Phase 3** - Appointment Pre-Selection:
- TEST-appointments-sl.html - **Main appointments page** (current)
- TEST-appointments-bulk-add.html - Bulk appointment creation

---

## 📁 Directory Structure

```
transport-admin-portal/
│
├── testing/                           # All TEST files
│   ├── README.md
│   ├── FILE-MAPPING.md               # This file
│   ├── TEST-clients-sl.html
│   ├── TEST-client-modal.js
│   ├── TEST-client-profile.html
│   ├── TEST-client-profile.js
│   ├── TEST-appointments-sl.html     # ← CURRENT appointments page
│   ├── TEST-appointments-sl.js
│   ├── TEST-appointments-bulk-add.html
│   ├── TEST-finance.html
│   ├── TEST-finance.js
│   ├── TEST-PRIMARY-CLINIC-SUMMARY.md
│   └── TEST-API-ENDPOINTS-NEEDED.md
│
├── deprecated/                        # Deprecated files
│   ├── README.md
│   ├── add-appointments.html         # Replaced by appointments-sl.html
│   ├── appointments-new.html         # Replaced by appointments-sl.html
│   └── TEST-add-appointments.html    # Based on deprecated source
│
└── [production files]

```

---

## 🚀 Quick Start

1. **Test Client Management**:
   - Open `testing/TEST-clients-sl.html`
   - Quick edit or view full profile

2. **Test Appointments** (CURRENT):
   - Open `testing/TEST-appointments-sl.html`
   - Create, edit, cancel, delete appointments
   - Verify primary clinic pre-selection

3. **Test Finance**:
   - Open `testing/TEST-finance.html`
   - Manage invoices and payments

---

**Last Updated**: 2025-01-09
**Version**: 1.0.0
