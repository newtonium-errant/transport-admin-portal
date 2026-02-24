# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RRTS (Rural Route Transportation Services) Transport Admin Portal is a static HTML/JavaScript web application for managing medical transportation appointments, clients, and drivers. The frontend is served as static files and communicates with a backend n8n workflow system running on Railway.app that interfaces with a Supabase PostgreSQL database.

## Quick Navigation

**Core Concepts:**
- [Architecture](#architecture) - Frontend/backend stack and data flow
- [Testing Branch Environment](#testing-branch-environment) - Safe testing setup with anonymized data
- [Authentication Architecture](#authentication-architecture) - JWT three-token system
- [API Client Library](#api-client-library) - Modern authenticated API wrapper
- [Performance Optimizations](#performance-optimizations) - 6-phase optimization achieving 76% faster loads
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac) - Permission system and roles

**Development:**
- [Development Commands](#development-commands) - Local server and git workflow
- [Project Structure](#project-structure) - Directory organization and file locations
- [API Endpoints](#api-endpoints) - Complete API reference
- [Key Implementation Patterns](#key-implementation-patterns) - Common code patterns
- [Component Library](#component-library) - Reusable modal components
- [Database Schema](#database-schema) - Tables, migrations, and conventions
- [n8n Workflow Development](#n8n-workflow-development) - Critical rules and limitations

**Deployment & Testing:**
- [Testing Guidelines](#testing-guidelines) - Comprehensive testing approach
- [Deployment & Environment](#deployment--environment) - Frontend, backend, database deployment
- [Common Gotchas](#common-gotchas) - Frequent issues and solutions
- [Security Considerations](#security-considerations) - Password hashing and security

**Reference Documentation:**
- [Related Documentation](#related-documentation) - Links to all detailed guides

## Architecture

### Frontend Stack
- **Pure HTML/CSS/JavaScript**: No build process required - all static files
- **Bootstrap 5**: UI components and responsive design
- **Vanilla JavaScript**: No frontend framework (React, Vue, etc.)
- **Session Storage**: User authentication state stored client-side

### Backend Stack
- **n8n Workflows**: Backend API hosted on Railway.app at `https://webhook-processor-production-3bb8.up.railway.app`
- **Supabase PostgreSQL**: Database for all data storage
- **OpenPhone API**: SMS notifications and contact management
- **Google Calendar API**: Driver calendar management

### Data Flow
```
Frontend (HTML/JS)
  → n8n Webhooks (Railway.app)
    → Supabase PostgreSQL Database
    → External APIs (OpenPhone, Google Calendar)
```

## Testing Branch Environment

**Testing Branch (git branch)**: Local copy of code about to be pushed to main branch. All validated work ready for production.

**developing/ folder (gitignored)**: Inside Testing branch, contains work currently in development - not validated yet, not ready for commit to Testing branch. Includes TEST HTML files (with TEST MODE banner), TEST n8n workflows (using `TEST-` prefix in webhook paths), and anonymized Supabase Testing Branch database (3 users: admin/booking_agent/supervisor, 12 anonymized clients K0000001-K0000011, 74 test appointments). Access TEST files by opening them directly in Chrome (e.g., `developing/TEST-dashboard.html`) using production credentials (password hashes copied).

**Key Practices:** Always use TEST- prefix for workflows/webhooks in developing/ folder, never commit developing/ folder to any branch (gitignored), preserve anonymization when exporting seed data, test changes in developing/ folder first, then move validated code to Testing branch root, merge Testing branch to main when ready for production.

**For complete setup, workflows, seed data management, and troubleshooting, see:** `docs/reference/TESTING_BRANCH_GUIDE.md`

## Authentication Architecture

The application uses a three-token JWT authentication system implemented across four core JavaScript files: **`jwt-manager.js`** (token storage, auto-refresh, rotation), **`jwt-auth.js`** (page protection with `requireAuth()`, user retrieval with `getCurrentUser()`), **`api-client.js`** (automated API wrapper with auto-token-inclusion and refresh), and **`session-manager.js`** (role-based inactivity timeouts: admin 30min, supervisor 60min, booking_agent/driver/client 120min).

**Token Types:** (1) **Access Token** (1hr expiration, stored in sessionStorage as `rrts_access_token`, auto-refreshed 5min before expiration), (2) **Refresh Token** (7 days, rotated on each refresh for security, endpoint: `POST /webhook/refresh-token`), (3) **Limited Token** (15min, issued after admin password reset, only allows `/change-password` endpoint access). All tokens use sessionStorage (cleared on browser close) never localStorage or cookies.

**Key Patterns:** Protect pages with `await requireAuth()` in DOMContentLoaded. Use `APIClient.get()/post()/put()/delete()` or convenience APIs (`AppointmentsAPI.getAll()`, `ClientsAPI.getActive()`) for all API calls - tokens handled automatically. n8n workflows must validate tokens: extract from Authorization header, verify with `jwt.verify(token, JWT_SECRET)`, check token_type, reject limited tokens except for `/change-password`. 401 responses trigger automatic logout and redirect.

**For complete authentication flow, code examples, and troubleshooting, see:** Related JWT implementation documentation

## API Client Library

The API Client Library (`api-client.js`) provides a modern, simplified interface for authenticated API calls with automatic JWT token management. It offers core methods (`get`, `post`, `put`, `delete`, `upload`, `batch`) and convenience APIs (`AppointmentsAPI`, `ClientsAPI`, `DriversAPI`, `UsersAPI`) that eliminate boilerplate code. Features include automatic token refresh before requests, standardized `APIError` class for error handling, automatic 401 logout/redirect, CSRF protection headers, and support for parallel batch requests.

**Key Usage Patterns:** Use convenience APIs when available (`await ClientsAPI.getAll()` instead of `APIClient.get('/get-all-clients')`), use `APIClient.batch([...])` for parallel requests, handle errors with try/catch, let APIClient handle 401 automatically (don't catch manually), validate data before sending.

**For complete API reference, all methods, error handling patterns, and migration examples, see:** `docs/reference/API_CLIENT_REFERENCE.md`

## Performance Optimizations

The RRTS application has undergone systematic performance optimization through six phases, achieving dramatic improvements: 76% faster initial load (1500ms → 350ms), 93% faster cached loads (100ms), 66% fewer HTTP requests, and 93% fewer re-renders during search/filter operations. The optimization techniques include parallel API loading, amalgamated workflows (single endpoint for multiple data sources), LocalStorage caching with TTL, skeleton loaders, debounced filters, and loading state indicators.

Optimized pages include `appointments-sl.html` + `appointments-sl.js` (full Phase 1-6 implementation) and `clients-sl.html` (Phases 1, 3, 4, 6). Key patterns: use `Promise.all()` for parallel requests, cache static data (clients/drivers) with 5-minute TTL, invalidate cache after mutations, use skeleton loaders for structured content, debounce search inputs with 300ms delay, and show button loading states during async operations. Reference implementation available in `appointments-sl.js` (DataCache class in lines 1-50).

**For complete implementation details, code examples, and migration guide, see:** `docs/instructions/PERFORMANCE_OPTIMIZATION_GUIDE.md`

## Development Commands

### Running Locally
```bash
# No build process or server required
# Simply open HTML files directly in Google Chrome
# Example: Open dashboard.html in Chrome
```

### Git Workflow
- **Main branch**: `main` (production)
- **Testing branch**: `Testing` (local copy of code about to be pushed to main)
- **developing/ folder**: Work in development (not validated, not ready for commit, included in .gitignore)
- Create pull requests from `Testing` to `main`

## Project Structure

The project follows a flat-root structure with HTML pages at root (for clean production URLs: `customdomainname.ca/appointments-sl.html`) and organized subdirectories for JavaScript (`js/core`, `js/auth`, `js/components`, `js/pages`), stylesheets (`css/`), n8n workflows (`workflows/` by module: appointments, clients, drivers, users, admin, reminders, clinics, finance), database files (`database/scripts`, `database/sql`, `database/docs`), documentation (`docs/instructions`, `docs/implementation`, `docs/workflows`, `docs/reference`, `docs/session-notes`), and local Supabase (`supabase/`).

**Key Pages:** `appointments-sl.html` (optimized, Phase 1-6), `clients-sl.html` (optimized), `dashboard.html` (main entry), `admin.html` (admin only), `operations.html`, `finance.html`, `index.html` (public landing).

**Key JavaScript:** `api-client.js` (recommended API wrapper), `jwt-manager.js` + `jwt-auth.js` (authentication), `session-manager.js` (timeouts), `permissions.js` (RBAC), `appointment-modal.js` (reusable component), `appointments-sl.js` (reference controller with DataCache).

**For complete directory structure, all file listings, path examples, and naming conventions, see:** `docs/reference/PROJECT_STRUCTURE.md`

## Role-Based Access Control (RBAC)

The application implements comprehensive RBAC defined in `permissions.js`:

### Roles
1. **admin**: Full system access including user management
2. **supervisor**: Client, appointment, driver management (no user/system admin)
3. **booking_agent**: Create/edit clients and appointments (no delete/driver assign)
4. **driver**: View own appointments only
5. **client**: View own appointments only

### Permission Functions
- `hasPageAccess(role, pageName)` - Check page access
- `hasFeaturePermission(role, feature)` - Check feature permission
- `getUserRole()` - Get current user role from session storage
- `enforcePageAccess()` - Redirect if unauthorized
- `filterNavigationByRole(role)` - Hide unauthorized nav links

### API Security
Use `api-security.js` functions for secure API calls:
- `secureApiRequest()` - Filters sensitive data based on permissions
- `validatePermission(action)` - Validate before making requests
- Cost information automatically filtered for non-admin roles
- Driver assignment restricted by `canAssignDrivers` permission

## API Endpoints

**⚠️ IMPORTANT: When working with API endpoints, ALWAYS check `docs/reference/API_ENDPOINTS.md` for complete request/response formats, authentication requirements, and usage examples.**

**Base URL:** `https://webhook-processor-production-3bb8.up.railway.app/webhook/`

**Standard Response Format:** All endpoints return `{ success: true/false, message: string, data: {...}, timestamp: string }`

**Key Endpoints by Category:**

**Authentication:** `/user-login`, `/password-reset`, `/change-password`, `/refresh-token` (JWT with 1hr access + 7day refresh tokens, both rotated for security)

**Appointments:** `/get-active-present-future-appointments` (recommended), `/save-appointment-v7` (array format required), `/update-appointment-complete`, `/delete-appointment-with-calendar`, `/soft-delete-appointment`, `/cancel-appointment`

**Clients:** `/get-active-clients` (recommended for dropdowns), `/get-all-clients`, `/add-client`, `/update-client`

**Drivers:** `/get-all-drivers`, `/add-driver-with-calendar` (auto-creates Google Calendar), `/update-driver`

**Clinics:** `/get-clinic-locations` (with coordinates for mapping)

**Users:** `/get-all-users` (admin only), `/get-booking-agents`, `/create-user`, `/update-user`, `/delete-user`

**Admin:** `/admin-dashboard` (stats + logs + alerts), `/store-audit-log`

**Testing:** All endpoints have `/TEST-{endpoint}` versions for Testing Branch (e.g., `/TEST-user-login`, `/TEST-get-all-appointments`)

**For complete endpoint documentation including full request/response schemas, authentication requirements, field validation, error responses, and code examples, see:** `docs/reference/API_ENDPOINTS.md`

## Key Implementation Patterns

### Appointment Array Format (v7 Standard)

**IMPORTANT**: All pages now send appointments in standardized array format to `/save-appointment-v7`:

```javascript
// Single appointment (wrapped in array)
const payload = {
  appointments: [{
    knumber: "K1234",
    appointmentDateTime: "2025-11-03T14:00:00.000Z",  // UTC ISO string
    appointmentLength: 90,                             // camelCase!
    status: "pending",
    notes: "",
    driver_instructions: null,
    scheduling_notes: "",
    transitTime: 30,
    pickup_address: "123 Main St, City, NS, A1B 2C3",
    customRate: null,
    location: "Clinic Name",
    clinic_id: 2,
    locationAddress: "456 Clinic St, City, NS, A1B 2C3",
    managed_by: 13,
    managed_by_name: "User Name"
  }]
};

// Multiple appointments (bulk add)
const payload = {
  appointments: [
    { /* appointment 1 */ },
    { /* appointment 2 */ },
    { /* appointment 3 */ }
  ]
};
```

**Field Name Requirements** (camelCase vs snake_case):
- ✅ `appointmentLength` (camelCase) - workflow expects this
- ✅ `appointmentDateTime` (camelCase)
- ✅ `transitTime` (camelCase)
- ❌ NOT `appointment_length` (snake_case) - will fail validation

**Required Fields**:
- `knumber`, `appointmentDateTime`, `location`, `locationAddress`
- `status`, `driver_instructions`, `scheduling_notes`, `customRate`
- `appointmentLength`, `transitTime`, `pickup_address`

**Pages Using Array Format**:
- `appointments-sl.html` (via `appointments-sl.js`) - Single appointment
- `clients-sl.html` - Single appointment with pre-filled client
- `appointments-bulk-add.html` - Multiple appointments
- `add-appointments.html` - Multiple appointments (legacy)

**n8n Workflow Requirements**:
- Validate Request node must return array of items
- Calculate Times and Combine Notes nodes use `$input.all()` and `.map()`
- Supabase Insert runs once per item automatically
- Format Success Response aggregates all results

### User Session Management
```javascript
// Get current user from session storage
const savedUser = sessionStorage.getItem('rrts_user');
const user = JSON.parse(savedUser);
const role = user.role;

// Check permissions before UI actions
if (!hasFeaturePermission(role, 'delete_clients')) {
    deleteBtn.style.display = 'none';
}
```

### Secure API Calls
```javascript
// Use secure wrapper for API calls
const response = await secureApiRequest(
    endpoint,
    { method: 'POST' },
    appointmentData
);

// Or use specific secure functions
await secureSaveAppointment(appointmentData);
await secureUpdateAppointment(appointmentData);
```

## Component Library

The application includes three reusable modal components: **AppointmentModal** (`appointment-modal.js`, v2.5.0) with three modes (add/edit/view), RBAC-aware field hiding, auto-population from `client.default_appointment_length` and `client.clinic_travel_times`, and array format support for save-appointment-v7; **ClientModal** (`client-modal.js`) for inline client editing with primary/secondary address support, phone/email validation, and auto-travel-time recalculation; **ClientQuickView** (`client-quick-view.js`) for read-only client details with addresses, travel times, and recent appointments.

**Key Patterns:** Always `await modal.open('add')` before calling `selectClient()` to avoid race conditions. Pass onSave/onDelete callbacks for data refresh. Use ClientModal for quick edits instead of full page navigation. Handle errors gracefully with try/catch around modal.open().

**For complete component API, initialization examples, data structures, troubleshooting, and best practices, see:** `docs/reference/COMPONENT_LIBRARY.md`

## Database Schema

The application uses Supabase PostgreSQL with 8 main tables: **users** (JWT auth with refresh tokens, account lockout, 5 roles), **clients** (K numbers, primary/secondary addresses, emergency contacts, JSONB `clinic_travel_times`), **appointments** (soft delete support, Google Calendar integration, status tracking: scheduled/completed/cancelled/no_show), **drivers** (auto-created Google Calendars), **clinic_locations** (coordinates for mapping), **audit_logs** (security events with old/new values), **driver_time_off** (availability tracking), **app_config** (system settings).

**Key Conventions:** All timestamps are `timestamp with time zone` (stored UTC, displayed Halifax time), new tables use uuid PKs (legacy use integer AUTO INCREMENT), K numbers format "K0001", password hashing uses custom `simpleHash()` (PBKDF2 not available in n8n), soft deletes preferred over hard deletes, JSONB for structured data (e.g., travel times, audit old/new values).

**Migrations:** 21 migration files in `database/sql/` directory run manually in Supabase SQL Editor (FK cleanup, JWT columns, travel times JSONB, audit logs, soft deletes, secondary addresses, pickup addresses, driver instructions, managed_by audit, invoices, driver pay/mileage, calendar iCal, finance config, driver travel times, driver scheduling, clinic preferences, background tasks, Google Maps config, appointment types, driver_time_off nullable reason).

**For complete table schemas, column definitions, JSONB structures, migration details, and database conventions, see:** `docs/reference/DATABASE_SCHEMA.md` and `database/docs/DATABASE_SCHEMA_STANDARDS.md`

## n8n Workflow Development

**CRITICAL Before Creating Workflows:** (1) Read `docs/instructions/AGENT_INSTRUCTIONS_N8N.md`, (2) Use `docs/instructions/N8N_WORKFLOW_TEMPLATE.json` as starting point, (3) Follow `docs/instructions/N8N_WORKFLOW_CHECKLIST.md`.

**Non-Negotiable Rules:** ❌ NEVER use IF nodes (use Switch with `typeValidation: "strict"`), ❌ NEVER log data/loops (Railway rate limits), ✅ ALWAYS convert booleans to strings for Switch, ✅ ALWAYS set `alwaysOutputData: true` on Supabase nodes, ✅ ALWAYS use standardized response structure (`{success, message, data, timestamp}`), ✅ ONLY log errors/critical warnings.

**Critical Limitations:** (1) **PBKDF2 NOT AVAILABLE** - use custom `simpleHash()` function for passwords (ALL auth workflows MUST use identical implementation, format: `salt:hash`), (2) **SQL JOINs NOT SUPPORTED** in Supabase nodes - fetch related data in separate nodes and merge in Code nodes, (3) **`executeQuery` NOT SUPPORTED** - use basic operations only (`get`, `getAll`, `create`, `update`, `delete`).

**For complete workflow patterns, code examples, environment details, and n8n best practices, see:** `docs/instructions/AGENT_INSTRUCTIONS_N8N.md`

## Common Gotchas

1. **Appointment Array Format**: All pages MUST send appointments in array format to `/save-appointment-v7`, even single appointments
2. **Field Name Casing**: Use `appointmentLength` (camelCase), NOT `appointment_length` (snake_case) - workflow validation will fail
3. **Modal Async Loading**: Always `await modal.open()` before calling `selectClient()` to avoid race conditions
4. **n8n Array Processing**: Code nodes must use `$input.all()` and `.map()` to process multiple appointments
5. **User Object Properties**: Always check multiple property variations: `currentUser.fullName || currentUser.full_name || currentUser.username` (not just `full_name`)
6. **Transit Time Data Structure**: Client travel times use nested structure: `clinic_travel_times[clinicName].primary.duration_minutes` (NOT `.minutes`)
7. **Session Storage**: User authentication is client-side only - no server-side validation
8. **Timezone Handling**: n8n runs in Halifax time (AST/ADT), but database stores UTC
9. **Cost Fields**: Automatically filtered for non-admin roles via `api-security.js`
10. **K Numbers**: Must be unique client identifiers - enforce in validation
11. **Password Security**: Passwords are hashed with PBKDF2 - use secure login workflow
12. **Google Calendar Sync**: Required for driver appointments - must create calendar on driver add
13. **Railway Rate Limits**: Minimize logging in n8n workflows to avoid rate limit issues
14. **Switch vs IF**: n8n workflows must use Switch nodes with string comparisons, not IF nodes

## Security Considerations

1. **Password Hashing**: All passwords stored using custom `simpleHash()` function with salt (PBKDF2 not available in n8n environment)
2. **Failed Login Tracking**: Account lockout after multiple failed attempts
3. **Data Filtering**: Cost and sensitive data filtered based on role permissions
4. **Audit Logging**: Security events logged via `logSecurityEvent()` function
5. **Session Management**: User sessions tracked with `last_login` and `last_activity`

## Testing Guidelines

The RRTS application requires thorough testing across multiple user roles (admin, supervisor, booking_agent, driver, client), browsers (Chrome, Firefox, Safari, Edge, Mobile), and scenarios to ensure RBAC enforcement and correct functionality. Testing categories include: role-based permission verification, page load testing (authentication, data loading, RBAC enforcement, session management), API testing (happy path, validation, error handling, RBAC), frontend component testing (AppointmentModal, ClientModal), common test scenarios (create/edit/delete appointments, client management, user management), browser compatibility, performance testing (load times, API response, memory, network throttling), and regression testing (smoke tests: 15min, full regression: 1-2hr).

**Key Testing Patterns:** Test each feature with all applicable roles, verify RBAC hides unauthorized features, test with valid/invalid/edge-case data, verify error handling (401 auto-logout, 403 permission denied, 500 graceful error), test component auto-population and pre-selection, use test data (K9000+ for clients, test_ prefix for users), run smoke tests after each deployment.

**For complete testing checklists, test scenarios, QA workflow, and automation recommendations, see:** `docs/reference/TESTING_GUIDE.md`

## Deployment & Environment

The RRTS Transport Admin Portal uses a split-stack architecture: **Frontend** (static HTML/CSS/JS, no build process, deployed to Cloudflare Pages/Netlify/Vercel/GitHub Pages), **Backend** (n8n workflows on Railway.app at `webhook-processor-production-3bb8.up.railway.app`, manually imported JSON workflows), **Database** (Supabase PostgreSQL in US East 1, pooled connection 6543 for n8n, direct 5432 for migrations). Local development uses Supabase local instance (Docker-based, ports 54321-54327) for safe testing without affecting production.

**Critical Environment Variables (Railway.app):** Never change `N8N_ENCRYPTION_KEY` (decrypts all credentials), `JWT_SECRET` (breaks auth), or database connection vars. See `docs/instructions/RAILWAY_DEPLOYMENT_CHECKLIST.md` for complete list.

**Key Workflows:** Frontend auto-deploys from main branch (test locally by opening HTML files directly in Chrome), n8n workflows manually imported via web interface (export JSON → edit → import → activate), database migrations run manually in Supabase SQL Editor (files in `database/sql/` directory), local Supabase for development (`supabase start/stop/reset`).

**For complete deployment guides, environment setup, workflows, and troubleshooting, see:**
- Frontend: `docs/deployment/FRONTEND_DEPLOYMENT.md`
- Backend (n8n): `docs/deployment/BACKEND_DEPLOYMENT.md`
- Database: `docs/deployment/DATABASE_DEPLOYMENT.md`
- Local Development: `docs/deployment/LOCAL_DEVELOPMENT.md`

## Related Documentation

### Reference Documentation (`docs/reference/`)

**Technical References:**
- `API_CLIENT_REFERENCE.md` - Complete API client library documentation (methods, error handling, migration examples)
- `COMPONENT_LIBRARY.md` - Reusable modal components (AppointmentModal, ClientModal, ClientQuickView)
- `DATABASE_SCHEMA.md` - Complete database table schemas, JSONB structures, and migrations
- `TESTING_GUIDE.md` - Comprehensive testing guidelines (role-based, API, component, browser compatibility)
- `TESTING_BRANCH_GUIDE.md` - Testing Branch setup, seed data management, and workflow

### n8n Workflow Development (`docs/instructions/`)

**CRITICAL - Read Before Creating Workflows:**
- `AGENT_INSTRUCTIONS_N8N.md` - **MUST READ** - Core n8n development rules and patterns
- `N8N_WORKFLOW_TEMPLATE.json` - Starting template for new workflows
- `N8N_WORKFLOW_CHECKLIST.md` - Workflow creation checklist

**n8n Best Practices:**
- `N8N_LOGGING_BEST_PRACTICES.md` - Minimal logging standards (Railway rate limits)
- `N8N_TIMEZONE_CONFIGURATION.md` - Halifax/AST/ADT timezone handling
- `N8N_WORKFLOW_PATTERNS_REFERENCE.md` - Common workflow patterns and solutions

### Database Documentation (`database/docs/`)

- `DATABASE_SCHEMA_STANDARDS.md` - Database conventions and column standards
- `SUPABASE_NODE_QUICK_REFERENCE.md` - Supabase query patterns for n8n workflows

### Implementation Guides (`docs/implementation/`)

- `ADMIN_DASHBOARD_IMPLEMENTATION.md` - Admin dashboard data integration
- `PASSWORD_SECURITY_IMPLEMENTATION.md` - Password hashing and reset implementation
- `SECURITY_IMPLEMENTATION_PLAN.md` - Security architecture overview

### Performance & Optimization (`docs/instructions/`)

- `PERFORMANCE_OPTIMIZATION_GUIDE.md` - Complete 6-phase optimization guide (DataCache, skeleton loaders, debouncing)

### Additional Documentation

- `README.md` - Project README and setup instructions
- `docs/session-notes/` - Development session summaries and progress tracking
- `docs/workflows/` - Detailed n8n workflow documentation
