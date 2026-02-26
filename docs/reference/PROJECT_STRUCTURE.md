# Project Structure Reference

## Overview

The RRTS Transport Admin Portal follows a flat-root structure for HTML files (for clean production URLs) with organized subdirectories for JavaScript, CSS, workflows, documentation, and database files.

**Why HTML at Root?** Production URLs remain unchanged (e.g., `customdomainname.ca/appointments-sl.html`). All other files are organized in subdirectories for maintainability.

---

## Directory Organization

```
transport-admin-portal/
├── *.html              # All HTML pages at root for production URLs
│                       # (appointments-sl.html, clients-sl.html, dashboard.html, etc.)
│
├── js/                 # JavaScript modules organized by purpose
│   ├── core/           # Core utilities (api-client, api-security, finance)
│   ├── auth/           # Authentication & session (jwt-*, permissions, session-manager)
│   ├── components/     # Reusable UI components (modals, quick-views)
│   └── pages/          # Page-specific controllers (appointments-sl.js)
│
├── css/                # Stylesheets
│   └── shared-styles.css
│
├── workflows/          # n8n workflow definitions (JSON files)
│   ├── appointments/   # APPT - *.json
│   ├── clients/        # CLIENT - *.json
│   ├── drivers/        # DRIVER - *.json
│   ├── users/          # USER - *.json
│   ├── admin/          # ADMIN - *.json and ADMN - *.json
│   ├── reminders/      # RMDR - *.json
│   ├── clinics/        # CLINIC - *.json
│   ├── destinations/   # DEST - *.json
│   └── finance/        # FIN - *.json
│
├── database/           # Database-related files
│   ├── scripts/        # Seed data, migration scripts
│   ├── sql/            # SQL migration files
│   └── docs/           # Database schema documentation
│
├── docs/               # All documentation
│   ├── instructions/   # n8n workflow development guides
│   ├── implementation/ # Implementation guides and summaries
│   ├── workflows/      # n8n workflow documentation
│   ├── reference/      # Reference documentation (API, components, testing, etc.)
│   └── session-notes/  # Development session summaries
│
├── developing/         # TEST files (gitignored) - work in progress
│   ├── TEST-*.html     # TEST HTML files with TEST MODE banner
│   ├── js/pages/       # TEST JavaScript controllers
│   └── TEST Workflow Copies/  # TEST n8n workflows (TEST- prefix)
│
├── supabase/           # Supabase local development (DO NOT MODIFY manually)
│   ├── config.toml     # Local Supabase configuration
│   ├── migrations/     # Database migration history
│   └── seed.sql        # Test data seed file
│
├── CLAUDE.md           # AI assistant instructions
├── README.md           # Project README
├── package.json        # Node.js dependencies (for local dev server only)
└── .gitignore          # Git ignore rules
```

---

## Frontend Pages (Root Directory)

All HTML files are located at the project root for clean production URLs.

### Appointment Management

**Optimized (Recommended):**
- `appointments-sl.html` - **RECOMMENDED** - Optimized appointments page with skeleton loaders
  - **Features**: Phase 1-6 optimizations (parallel loading, caching, debouncing, loading states)
  - **Performance**: 76% faster initial load, 93% faster cached loads
  - **Controller**: `js/pages/appointments-sl.js`

**Baseline:**
- `appointments-new.html` - Baseline appointments page
  - **Features**: Phase 1-3 optimizations (parallel loading, some caching)
  - **Use Case**: Fallback if -sl version has issues

**Bulk Operations:**
- `appointments-bulk-add.html` - Bulk appointment creation interface
  - **Features**: Create multiple appointments at once
  - **Uses**: `/save-appointment-v7` endpoint with array format

**Legacy:**
- `add-appointments.html` - Legacy add appointments form
  - **Status**: Maintained for compatibility
- `appointment-management.html` - **DEPRECATED** - Legacy appointment calendar
  - **Status**: Do not use, will be removed

---

### Client Management

**Optimized (Recommended):**
- `clients-sl.html` - Optimized client management with skeleton loaders
  - **Features**: Phases 1, 3, 4, 6 optimizations
  - **Includes**: Client profile quick view modal, inline editing

**Baseline:**
- `client-management.html` - Baseline client management
  - **Use Case**: Fallback if -sl version has issues

**Profile Pages:**
- `client-profile.html` - Full client profile editor (production)
  - **Features**: All client fields, secondary address, emergency contacts
- `developing/TEST-client-profile.html` - Test version for safe testing
  - **Database**: Points to Supabase Testing database

---

### Driver Management

- `driver-management.html` - Driver management with Google Calendar integration
  - **Features**: Create/edit drivers, auto-create Google Calendars, manage availability

---

### Destination Management

- `destinations.html` - Destination/clinic management
  - **Auth**: Admin, Supervisor
  - **Features**: List all destinations, add/edit with modal, dynamic contacts (multiple phone/email per destination), search, active/inactive toggle
  - **API**: `/get-all-destinations`, `/add-destination`, `/update-destination`

---

### Admin & Operations

- `dashboard.html` - Main dashboard with statistics and quick actions
  - **Features**: Login page, system stats, quick links
  - **Roles**: All users land here after login

- `admin.html` - System administration and user management
  - **Auth**: Admin only
  - **Features**: User CRUD, role management, audit logs, system settings

- `operations.html` - Operations dashboard and reporting
  - **Auth**: Admin, Supervisor
  - **Features**: Driver assignment overview, scheduling, operations metrics

- `finance.html` - Financial reporting and invoice management
  - **Auth**: Admin
  - **Features**: Invoice tracking, payment processing, financial reports

---

### Public Pages

- `index.html` - Landing page with veteran transportation info and staff login link
  - **Auth**: Public (no login required)
  - **Features**: Information about RRTS services, link to dashboard for staff

---

## JavaScript Modules

All JavaScript files use simple paths from root (e.g., `src="js/auth/permissions.js"`).

### Core Utilities (`js/core/`)

- **`api-client.js`** - **RECOMMENDED** - Modern authenticated API wrapper
  - **Features**: Auto JWT token refresh, auto 401 logout, standardized error handling
  - **Methods**: `get()`, `post()`, `put()`, `delete()`, `upload()`, `batch()`
  - **Convenience APIs**: `AppointmentsAPI`, `ClientsAPI`, `DriversAPI`, `UsersAPI`
  - **Replaces**: `api-security.js` (legacy)
  - **See**: `docs/reference/API_CLIENT_REFERENCE.md`

- **`api-security.js`** - Legacy secure API wrapper
  - **Status**: Maintained for compatibility
  - **Migration**: Use `api-client.js` in new code

- **`finance.js`** - Financial calculations and utilities
  - **Features**: Invoice calculations, rate calculations, cost filtering by role

---

### Authentication & Session (`js/auth/`)

- **`jwt-manager.js`** - JWT token storage, refresh, and expiration management
  - **Features**: Auto-refresh before expiration, token rotation, sessionStorage management
  - **Key Functions**: `setTokens()`, `getAccessToken()`, `refreshToken()`, `clearTokens()`

- **`jwt-auth.js`** - Page protection helpers
  - **Features**: Redirect to login if unauthenticated, get current user
  - **Key Functions**: `requireAuth()`, `getCurrentUser()`, `getAuthHeaders()`
  - **Usage**: Call `await requireAuth()` at top of every protected page

- **`session-manager.js`** - Role-based session timeout and inactivity tracking
  - **Features**: Auto-logout on inactivity, warning dialog 5 min before timeout
  - **Timeouts**: Admin 30min, Supervisor 60min, Booking Agent/Driver/Client 120min

- **`permissions.js`** - RBAC system
  - **Roles**: admin, supervisor, booking_agent, driver, client
  - **Key Functions**: `hasPageAccess()`, `hasFeaturePermission()`, `getUserRole()`

---

### Reusable Components (`js/components/`)

- **`appointment-modal.js`** (v2.5.0) - Appointment create/edit/view modal
  - **Modes**: add, edit, view
  - **Features**: RBAC-aware, auto-population from client data, array format support
  - **See**: `docs/reference/COMPONENT_LIBRARY.md`

- **`client-modal.js`** - Client quick edit modal component
  - **Features**: Inline editing, address validation, travel time recalculation

- **`client-quick-view.js`** - Read-only client detail modal
  - **Features**: Fast display of client info, addresses, travel times, recent appointments

---

### Page Controllers (`js/pages/`)

- **`appointments-sl.js`** - **RECOMMENDED** - Optimized appointments controller
  - **Features**: DataCache class (lines 1-50), debouncing, Phase 1-6 optimizations
  - **Performance**: Reference implementation for optimization patterns

- **`TEST-client-profile.js`** - Test version of client profile controller
  - **Location**: `developing/js/pages/TEST-client-profile.js`
  - **Endpoints**: Uses TEST- prefixed endpoints
  - **Database**: Supabase Testing database

---

### Stylesheets (`css/`)

- **`shared-styles.css`** - Shared CSS across all pages
  - **Usage**: `<link href="css/shared-styles.css" rel="stylesheet">`
  - **Includes**: RRTS brand colors, button styles, form styles, utility classes

---

## n8n Workflows

Located in `workflows/` directory, organized by functional area. All workflows are JSON export files from n8n.

### Appointments (`workflows/appointments/`)

**Prefix:** `APPT -`

**Workflows:**
- Add, update, delete appointments
- Calendar sync operations
- Batch updates
- Soft delete / unarchive

**Examples:**
- `APPT - Save Appointment v7.json`
- `APPT - Update Appointment Complete.json`
- `APPT - Delete Appointment with Calendar.json`

---

### Clients (`workflows/clients/`)

**Prefix:** `CLIENT -`

**Workflows:**
- Client CRUD operations
- Travel time calculations
- Primary clinic management

**Examples:**
- `CLIENT - Add Client v5.json`
- `CLIENT - Update Client v2.json`
- `CLIENT - Recalculate Travel Times.json`

---

### Drivers (`workflows/drivers/`)

**Prefix:** `DRIVER -`

**Workflows:**
- Driver management
- Google Calendar integration

**Examples:**
- `DRIVER - Add Driver with Calendar.json`
- `DRIVER - Update Driver.json`
- `DRIVER - Get All Drivers.json`

---

### Users (`workflows/users/`)

**Prefix:** `USER -`

**Workflows:**
- Authentication workflows
- User management (CRUD)
- Password reset

**Examples:**
- `USER - Login.json`
- `USER - Create User.json`
- `USER - Password Reset.json`
- `USER - Change Password.json`
- `USER - Refresh Token.json`

---

### Admin (`workflows/admin/`)

**Prefix:** `ADMIN -` or `ADMN -`

**Workflows:**
- Dashboard data
- System logs
- Audit logging

**Examples:**
- `ADMIN - Dashboard.json`
- `ADMIN - Get All Users.json`
- `ADMN - Store Audit Log.json`

---

### Reminders (`workflows/reminders/`)

**Prefix:** `RMDR -`

**Workflows:**
- SMS reminder scheduling

---

### Clinics (`workflows/clinics/`)

**Prefix:** `CLINIC -`

**Workflows:**
- Clinic location management

**Examples:**
- `CLINIC - Get Clinic Locations.json`

---

### Finance (`workflows/finance/`)

**Prefix:** `FIN -`

**Workflows:**
- Invoice status tracking
- Payment processing

---

## Documentation (`docs/`)

### Workflow Development (`docs/instructions/`)

**Critical Files (Read Before Creating Workflows):**
- `AGENT_INSTRUCTIONS_N8N.md` - **MUST READ** - Core n8n development rules
- `N8N_WORKFLOW_TEMPLATE.json` - Starting template for new workflows
- `N8N_WORKFLOW_CHECKLIST.md` - Workflow creation checklist

**Best Practices:**
- `N8N_WORKFLOW_PATTERNS_REFERENCE.md` - Common patterns and solutions
- `N8N_LOGGING_BEST_PRACTICES.md` - Minimal logging standards (Railway rate limits)
- `N8N_TIMEZONE_CONFIGURATION.md` - Halifax/AST/ADT timezone handling
- `N8N_DATA_FLOW_REFERENCE.md` - Data flow patterns
- `WEBHOOK_DATA_STRUCTURE_REFERENCE.md` - Webhook input structures

**Additional Guides:**
- `JWT_IMPLEMENTATION.md` - JWT authentication in workflows
- `RAILWAY_DEPLOYMENT_CHECKLIST.md` - Deployment environment variables
- Performance optimization guides (Phase 1-6)

---

### Database Documentation (`database/docs/`)

- `DATABASE_SCHEMA_STANDARDS.md` - Database conventions and column standards
- `SUPABASE_NODE_QUICK_REFERENCE.md` - Supabase query patterns for n8n

---

### Implementation Guides (`docs/implementation/`)

- `ADMIN_DASHBOARD_IMPLEMENTATION.md` - Admin dashboard data integration
- `PASSWORD_SECURITY_IMPLEMENTATION.md` - Password hashing and reset
- `SECURITY_IMPLEMENTATION_PLAN.md` - Security architecture overview
- `PRIMARY-CLINIC-IMPLEMENTATION-GUIDE.md` - Primary clinic feature implementation
- `CLIENT-PROFILE-PAGE-IMPLEMENTATION-GUIDE.md` - Client profile page details
- Issue implementation summaries (ISSUE-2, ISSUE-3, 5-ISSUES-MASTER-SUMMARY, etc.)

---

### n8n Workflow Docs (`docs/workflows/`)

Detailed n8n workflow instructions and code node documentation:
- `N8N-BATCH-WORKFLOW-UPDATE-INSTRUCTIONS.md`
- `N8N-USER-GET-BOOKING-AGENTS-INSTRUCTIONS.md`
- `N8N-APPOINTMENT-MANAGED-BY-UPDATE-INSTRUCTIONS.md`
- `N8N-CLIENT-ADD-V5-INSTRUCTIONS.md`
- `N8N-CLIENT-UPDATE-V2-INSTRUCTIONS-OPTIMIZED.md`
- `UPDATE-CLIENT-ADD-WORKFLOW-PRIMARY-CLINIC.md`
- And more...

---

### Reference Documentation (`docs/reference/`)

**Technical References:**
- `API_CLIENT_REFERENCE.md` - Complete API client library documentation
- `API_ENDPOINTS.md` - **Complete API endpoint reference** ⚠️ **Check this when working with endpoints**
- `COMPONENT_LIBRARY.md` - Reusable modal components
- `DATABASE_SCHEMA.md` - Complete database table schemas
- `TESTING_GUIDE.md` - Comprehensive testing guidelines
- `TESTING_BRANCH_GUIDE.md` - Staging branch setup and usage
- `PROJECT_STRUCTURE.md` - This file

**Other References:**
- `QUICK-REFERENCE.md` - Quick reference guide
- `WHATS-LEFT-TODO.md` - Outstanding tasks
- Migration guides and checklists

---

### Session Notes (`docs/session-notes/`)

Development session summaries and progress tracking:
- `SESSION-SUMMARY-2025-11-04.md`
- `SESSION-SUMMARY-2025-11-05.md`
- `SESSION_SUMMARY_2025-11-07.md`

---

## Staging Branch Structure (`developing/`)

**Status:** ⚠️ Gitignored - not committed to repository

**Purpose:** Safe testing environment with anonymized data before pushing to main branch

**Contents:**
- `TEST-*.html` - HTML files with TEST MODE banner
- `js/pages/TEST-*.js` - JavaScript controllers using TEST- endpoints
- `TEST Workflow Copies/` - n8n workflows with TEST- webhook paths
- `supabase seed data/` - SQL scripts for anonymized test data

**Database:** Points to Supabase Testing database (separate from production)

**Access:** Open files directly in Chrome (e.g., `file:///F:/GitHub/Repos/transport-admin-portal/developing/TEST-dashboard.html`)

**For complete staging branch documentation, see:** `docs/reference/TESTING_BRANCH_GUIDE.md`

---

## Database Files (`database/`)

### Scripts (`database/scripts/`)
- Seed data generation
- Data anonymization scripts
- Migration scripts

### SQL (`database/sql/` or `sql/`)
- Migration files (run manually in Supabase SQL Editor)
- Schema updates
- Data fixes

**Migration Files:**
- `01_fix_foreign_key_and_delete_test_users.sql`
- `02_add_jwt_session_columns.sql`
- `03_add_clinic_travel_times.sql`
- `06_create_audit_logs_table.sql`
- `07_add_appointment_deletion_cancellation_fields.sql`
- `08_add_secondary_address_fields.sql`
- `09_add_pickup_address_field.sql`
- `09_add_driver_instructions_field.sql`
- `10_add_managed_by_field.sql`

### Documentation (`database/docs/`)
- `DATABASE_SCHEMA_STANDARDS.md`
- `SUPABASE_NODE_QUICK_REFERENCE.md`

---

## Supabase Local Development (`supabase/`)

**⚠️ DO NOT MODIFY FILES MANUALLY** - managed by Supabase CLI

**Key Files:**
- `config.toml` - Local Supabase configuration
- `migrations/` - Migration history (auto-generated)
- `seed.sql` - Test data for local development

**Local Service Ports:**
- API (PostgREST): `http://127.0.0.1:54321`
- PostgreSQL: `postgresql://127.0.0.1:54322`
- Studio (Web UI): `http://127.0.0.1:54323`

**CLI Commands:**
```bash
supabase start   # Start all services
supabase stop    # Stop all services
supabase status  # Check service status
supabase db push # Apply migrations
```

**For complete local development guide, see:** `CLAUDE.md` → Deployment & Environment → Supabase Local Development

---

## Configuration Files (Root)

- **`CLAUDE.md`** - AI assistant instructions
  - **Purpose**: Guidance for Claude Code when working in this repository
  - **Sections**: Architecture, authentication, API endpoints, testing, deployment

- **`README.md`** - Project README
  - **Purpose**: Project overview, setup instructions, getting started

- **`package.json`** - Node.js dependencies
  - **Purpose**: Local dev server only (no build process)
  - **Scripts**: `npm start` to run local server

- **`.gitignore`** - Git ignore rules
  - **Ignores**: `developing/`, `node_modules/`, `.env`, `supabase/.branches/`, etc.

---

## File Naming Conventions

### HTML Files
- **Production**: `feature-name.html` (e.g., `appointments-sl.html`)
- **Test**: `TEST-feature-name.html` (e.g., `TEST-dashboard.html`)
- **Optimized**: `-sl` suffix for skeleton loader versions

### JavaScript Files
- **Production**: `feature-name.js` (e.g., `appointments-sl.js`)
- **Test**: `TEST-feature-name.js` (e.g., `TEST-client-profile.js`)
- **Components**: `component-name.js` (e.g., `appointment-modal.js`)

### n8n Workflows
- **Format**: `MODULE - Action Description.json`
- **Examples**: `APPT - Save Appointment v7.json`, `CLIENT - Update Client v2.json`
- **Test**: `TEST - MODULE - Action Description.json` or `TEST - MODULE - Action Description copy.json`

### Documentation
- **ALL CAPS for guides**: `TESTING_GUIDE.md`, `API_ENDPOINTS.md`
- **Title Case for notes**: `SESSION-SUMMARY-2025-11-04.md`
- **Hyphens for multi-word**: `admin-dashboard-implementation.md`

---

## Path Examples

**HTML Page Includes:**
```html
<!-- CSS -->
<link href="css/shared-styles.css" rel="stylesheet">

<!-- JavaScript -->
<script src="js/auth/jwt-manager.js"></script>
<script src="js/auth/jwt-auth.js"></script>
<script src="js/core/api-client.js"></script>
<script src="js/components/appointment-modal.js"></script>
<script src="js/pages/appointments-sl.js"></script>
```

**TEST Page Includes:**
```html
<!-- CSS (uses ../ to go up from developing/ folder) -->
<link href="../css/shared-styles.css" rel="stylesheet">

<!-- JavaScript -->
<script src="../js/auth/jwt-manager.js"></script>
<script src="../js/auth/jwt-auth.js"></script>
<script src="../js/core/api-client.js"></script>
<script src="js/pages/TEST-client-profile.js"></script>
```

**JavaScript API Calls:**
```javascript
// Base URL
const apiBaseUrl = 'https://webhook-processor-production-3bb8.up.railway.app/webhook';

// Test Base URL (same, but different endpoints)
const apiBaseUrl = 'https://webhook-processor-production-3bb8.up.railway.app/webhook';

// Endpoints
const endpoint = '/get-all-appointments';      // Production
const endpoint = '/TEST-get-all-appointments'; // Test
```

---

## Migration Notes

### From api-security.js to api-client.js

**Old Pattern:**
```javascript
const response = await secureApiRequest(endpoint, options, data);
```

**New Pattern:**
```javascript
const response = await APIClient.post(endpoint, data);
// Or use convenience APIs:
const clients = await ClientsAPI.getAll();
```

### From Generic Pages to -sl Optimized Pages

**Old:** `appointments-new.html`
**New:** `appointments-sl.html` (76% faster)

**Key Differences:**
- DataCache for clients/drivers (5min TTL)
- Skeleton loaders instead of spinners
- Debounced search (300ms delay)
- Loading states on buttons
