# RRTS Transport Admin Portal - Prioritized TODO List

## CRITICAL (Do First) 🔴

### 1. Security & Authentication
- [ ] **Replace custom `simpleHash()` with proper PBKDF2**
  - Current implementation is weak (single-pass bitwise operations)
  - Move password hashing to external service or upgrade n8n environment
  - Migrate existing password hashes
  - **Risk**: Current hashing vulnerable to attacks

- [ ] **Create missing TEST authentication workflows**
  - `TEST-user-login` (currently missing, breaks developing/ environment)
  - `TEST-refresh-token` (JWT refresh in developing/)
  - `TEST-change-password` (password management in developing/)
  - `TEST-forgot-password` (password reset in developing/)
  - **Impact**: developing/ folder login doesn't work without these

- [ ] **Implement rate limiting on login endpoint**
  - Prevent brute force attacks beyond account lockout
  - Add IP-based rate limiting (n8n or Railway.app level)
  - Log suspicious activity to audit_logs

- [ ] **Add CSRF token validation**
  - Currently relying on JWT only
  - Implement CSRF tokens for state-changing operations
  - Add to api-client.js automatically

### 2. Data Integrity & Backup
- [ ] **Set up automated database backups**
  - Supabase daily backups to external storage
  - Document restore procedure
  - Test backup restoration process

- [ ] **Add database constraints validation**
  - Foreign key constraints review (some may be missing)
  - Add CHECK constraints for valid data (phone formats, postal codes)
  - Ensure referential integrity across all tables

- [ ] **Implement soft delete for clients table**
  - Currently only appointments have soft delete
  - Clients should preserve historical data (GDPR considerations)
  - Add `deleted` and `deleted_at` columns

## HIGH PRIORITY (Do Next) 🟠

### 3. Missing Core Features
- [ ] **Complete Google Calendar integration**
  - Currently creates calendars but sync may have gaps
  - Test appointment updates → calendar updates
  - Test appointment deletions → calendar deletions
  - Handle calendar API failures gracefully

- [ ] **Implement SMS reminder automation (OpenPhone)**
  - Currently planned but not fully automated
  - Create n8n workflows for scheduled reminders
  - Allow users to opt-in/opt-out
  - Track reminder delivery status

- [ ] **Add Google Maps API integration**
  - Auto-calculate travel times (currently manual/pre-calculated)
  - Update `client.clinic_travel_times` automatically when addresses change
  - Fallback to existing data if API fails
  - Cache results to minimize API costs

- [ ] **Create finance/invoicing module**
  - `finance.html` exists but incomplete
  - Generate invoices from completed appointments
  - Track payment status
  - Export to accounting software (CSV/PDF)

### 4. User Experience Improvements
- [ ] **Add skeleton loaders to all pages**
  - Currently only `appointments-sl.html` and `clients-sl.html` have them
  - Implement on: admin.html, driver-management.html, finance.html
  - Consistent loading experience across app

- [ ] **Implement toast notification system globally**
  - Currently inconsistent (alerts vs toasts)
  - Create shared `toast.js` in `js/core/`
  - Standardize success/error/warning messages
  - Auto-dismiss after configurable timeout

- [ ] **Add client profile page**
  - `client-profile.html` (view-only for non-admins)
  - Show appointment history, travel patterns
  - Display emergency contact, addresses
  - Quick actions (schedule appointment, edit info)

- [ ] **Improve mobile responsiveness**
  - Test all pages on mobile devices
  - Fix table overflow issues (likely on appointments-sl.html)
  - Optimize modals for small screens
  - Touch-friendly UI elements

### 5. Performance Optimizations
- [ ] **Apply Phase 1-6 optimizations to all pages**
  - Currently only appointments-sl.html is fully optimized
  - Migrate clients-sl.html to full Phase 1-6
  - Optimize admin.html, driver-management.html, finance.html
  - Document performance gains

- [ ] **Implement service worker for offline support**
  - Cache static assets (JS, CSS, Bootstrap)
  - Show offline indicator
  - Queue API requests when offline (sync when online)
  - Progressive Web App (PWA) potential

- [ ] **Optimize n8n workflows**
  - Amalgamated endpoints for remaining pages (admin, finance, drivers)
  - Reduce redundant database queries
  - Implement workflow-level caching where appropriate

## MEDIUM PRIORITY (Important but not urgent) 🟡

### 6. Code Quality & Maintenance
- [ ] **Remove deprecated files**
  - Clean up `deprecated/` folder
  - Remove `n8n-updates/` (old code snippets)
  - Archive `appointments-new.html` (use appointments-sl.html)
  - Archive `add-appointments.html` (use appointments-bulk-add.html)

- [ ] **Standardize on api-client.js**
  - Migrate all pages from `api-security.js` to `api-client.js`
  - Remove `api-security.js` once migration complete
  - Update all HTML files to use modern API wrapper

- [ ] **Add JSDoc comments to all JS files**
  - Document function parameters, return types
  - Add usage examples in comments
  - Generate API documentation from JSDoc

- [ ] **Implement error boundary pattern**
  - Global error handler for uncaught exceptions
  - User-friendly error messages
  - Auto-report errors to admin dashboard
  - Prevent white screen of death

### 7. Testing & Quality Assurance
- [ ] **Set up automated E2E testing (Playwright/Cypress)**
  - Test critical user flows (login, create appointment, assign driver)
  - Run on every commit to Testing branch
  - Test all 5 user roles
  - Generate test reports

- [ ] **Create unit tests for utility functions**
  - Test jwt-manager.js token handling
  - Test api-client.js request/response handling
  - Test permissions.js RBAC logic
  - Use Jest or Vitest

- [ ] **Implement integration tests for n8n workflows**
  - Test each workflow with sample data
  - Verify database state after workflow execution
  - Test error handling paths
  - Automate with Postman/Insomnia collections

- [ ] **Add data validation tests**
  - Test all form inputs (client creation, appointment creation)
  - Test phone number formats, postal codes, email addresses
  - Test K number uniqueness validation
  - Test date/time constraints (no past appointments, etc.)

### 8. Documentation Improvements
- [ ] **Create deployment guides** (referenced but not created)
  - `docs/deployment/FRONTEND_DEPLOYMENT.md`
  - `docs/deployment/BACKEND_DEPLOYMENT.md`
  - `docs/deployment/DATABASE_DEPLOYMENT.md`
  - `docs/deployment/LOCAL_DEVELOPMENT.md`

- [ ] **Create onboarding guide for new developers**
  - Getting started (clone repo, open files in Chrome)
  - Understanding the codebase structure
  - Making your first change
  - Testing and deploying changes

- [ ] **Document all n8n workflows**
  - Flow diagrams for each workflow
  - Input/output schemas
  - Error handling behavior
  - Move to `docs/workflows/`

- [ ] **Create API endpoint documentation**
  - Extract to `docs/reference/API_ENDPOINTS.md` (currently in CLAUDE.md)
  - Document request/response formats
  - Include authentication requirements
  - Add example requests (cURL, JavaScript)

### 9. Features & Enhancements
- [ ] **Add appointment recurrence**
  - Weekly appointments for regular clients
  - Monthly appointments
  - Edit single instance vs all instances
  - Generate multiple appointments at once

- [ ] **Implement driver scheduling optimization**
  - Route optimization (minimize total travel time)
  - Driver availability calendar view
  - Conflict detection (double-booking prevention)
  - Suggested driver based on location/availability

- [ ] **Add reporting & analytics**
  - Monthly appointment counts by clinic
  - Client transportation frequency reports
  - Driver utilization reports
  - Export to CSV/PDF

- [ ] **Create admin notification system**
  - Email/SMS alerts for critical events
  - Failed appointment assignments
  - Driver no-shows
  - System errors (workflow failures)

## LOW PRIORITY (Nice to have) 🟢

### 10. Developer Experience
- [ ] **Set up .gitignore improvements**
  - Currently excludes all .md files (may be too broad)
  - Review and refine exclusions
  - Ensure developing/ stays excluded

- [ ] **Add pre-commit hooks**
  - Lint JavaScript (ESLint)
  - Format code (Prettier)
  - Run basic tests
  - Prevent commits with TODO/FIXME

- [ ] **Create developer CLI tool**
  - Quick commands (create TEST user, seed database)
  - Reset developing/ environment
  - Generate workflow templates
  - Run tests

### 11. UI/UX Polish
- [ ] **Add dark mode**
  - Toggle in user settings
  - Persist preference in localStorage
  - Apply to all pages consistently
  - Respect OS dark mode preference

- [ ] **Improve table sorting/filtering**
  - Multi-column sorting
  - Advanced filters (date ranges, multiple statuses)
  - Save filter preferences
  - Export filtered results

- [ ] **Add keyboard shortcuts**
  - `N` - New appointment
  - `C` - New client
  - `/` - Focus search
  - `?` - Show keyboard shortcuts help

- [ ] **Implement bulk operations**
  - Bulk status updates (mark multiple as completed)
  - Bulk driver assignment
  - Bulk deletion (with confirmation)
  - Undo last bulk operation

### 12. Infrastructure
- [ ] **Set up staging environment**
  - Separate n8n instance on Railway.app
  - Separate Supabase project
  - Auto-deploy Testing branch to staging
  - Test before merging to main

- [ ] **Implement monitoring & alerting**
  - Uptime monitoring (UptimeRobot, Pingdom)
  - Error tracking (Sentry)
  - Performance monitoring (Google Analytics, Plausible)
  - Alert admin on critical failures

- [ ] **Add CI/CD pipeline**
  - GitHub Actions for automated testing
  - Auto-deploy to staging on Testing branch push
  - Auto-deploy to production on main branch push
  - Rollback mechanism

### 13. Compliance & Legal
- [ ] **GDPR compliance review**
  - Right to erasure (hard delete client data)
  - Data export (provide client data in machine-readable format)
  - Consent tracking (for SMS reminders, data processing)
  - Privacy policy page

- [ ] **Accessibility (WCAG 2.1 AA compliance)**
  - Screen reader testing
  - Keyboard navigation throughout
  - Color contrast fixes
  - ARIA labels for all interactive elements

- [ ] **Add terms of service & privacy policy**
  - Legal review
  - Display on login page
  - Require acceptance on first login
  - Track acceptance in database

## Quick Wins (Easy & High Impact) ⚡

### 14. Low-hanging Fruit
- [ ] **Update all HTML page titles** (currently generic)
  - `<title>Dashboard - RRTS Admin Portal</title>`
  - Helps with browser tabs, bookmarks, SEO

- [ ] **Add favicon** (currently missing)
  - Create RRTS logo icon
  - Add to all HTML files
  - Include multiple sizes (16x16, 32x32, 192x192)

- [ ] **Fix console errors** (if any)
  - Open each page in Chrome DevTools
  - Fix 404s, reference errors, warnings
  - Clean console output

- [ ] **Add loading spinners to all buttons**
  - Prevent double-clicks during saves
  - Visual feedback on all async operations
  - Use Bootstrap spinner classes

- [ ] **Standardize error messages**
  - User-friendly messages (avoid technical jargon)
  - Actionable suggestions ("Check your internet connection")
  - Consistent tone across app

---

## Recommended Execution Order

### Sprint 1 (Week 1-2): Security & Critical Fixes
1. Create missing TEST authentication workflows
2. Implement rate limiting on login
3. Set up automated database backups
4. Add database constraints validation

### Sprint 2 (Week 3-4): Core Features
5. Complete Google Calendar integration testing
6. Implement SMS reminder automation
7. Add Google Maps API integration
8. Apply skeleton loaders to all pages

### Sprint 3 (Week 5-6): Code Quality
9. Remove deprecated files
10. Migrate to api-client.js everywhere
11. Add JSDoc comments
12. Set up E2E testing framework

### Sprint 4 (Week 7-8): Documentation & DX
13. Create deployment guides
14. Create onboarding guide
15. Document all n8n workflows
16. Extract API endpoints documentation

### Sprint 5 (Week 9-10): Performance & UX
17. Apply Phase 1-6 optimizations to all pages
18. Add toast notification system globally
19. Create client profile page
20. Improve mobile responsiveness

### Ongoing: Polish & Enhancements
- Address items from Low Priority list
- Implement Quick Wins as time allows
- Continuously improve based on user feedback

---

## Summary Statistics

**Total Tasks**: ~70 identified

- **Critical**: 8 tasks 🔴
- **High Priority**: 13 tasks 🟠
- **Medium Priority**: 27 tasks 🟡
- **Low Priority**: 18 tasks 🟢
- **Quick Wins**: 5 tasks ⚡

**Estimated Timeline**: 10-12 weeks for Critical + High + Medium priorities (full-time work)

---

**Last Updated**: November 18, 2024
**Location**: `developing/Priority to do list.md`
**Status**: Living document - update as priorities shift
