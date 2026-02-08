# TEST to Production Migration Guide

## Overview

This guide outlines the complete process for migrating validated TEST pages and workflows from the `developing/` folder to the Testing git branch, and eventually to production (main branch).

**Important:** TEST files in `developing/` folder are gitignored and NOT tracked in version control. This migration process brings them into the repository.

---

## Migration Phases

### Phase 1: Pre-Migration Validation
### Phase 2: Frontend File Migration (HTML/JS)
### Phase 3: Backend Workflow Migration (n8n)
### Phase 4: Database Schema Sync
### Phase 5: Testing Branch Testing
### Phase 6: Production Deployment

---

## Phase 1: Pre-Migration Validation ✅

**Goal:** Ensure TEST files are fully functional and ready for production

### 1.1 Test All TEST Pages
- [ ] Login to TEST-dashboard.html with all roles (admin, supervisor, booking_agent)
- [ ] Navigate to each TEST page and verify it loads without errors
- [ ] Test all CRUD operations (Create, Read, Update, Delete)
- [ ] Verify RBAC permissions work correctly (features hidden based on role)
- [ ] Check browser console for errors on each page
- [ ] Test with multiple browsers (Chrome, Firefox, Safari)

### 1.2 Test All TEST Workflows
- [ ] Verify all TEST workflows are active in n8n
- [ ] Check n8n Executions tab for any failed TEST workflow runs
- [ ] Test each TEST endpoint manually (via browser or Postman)
- [ ] Verify workflows return correct data from Testing Branch Supabase
- [ ] Check workflow logs for errors or warnings

### 1.3 Document What's Being Migrated
Create a list of all files being migrated:

**HTML Files:**
- [ ] List all `developing/TEST-*.html` files
- [ ] Example: `TEST-dashboard.html`, `TEST-clients-sl.html`, `TEST-client-profile.html`, `TEST-finance.html`

**JavaScript Files:**
- [ ] List all `developing/js/**/*TEST-*.js` files
- [ ] Example: `TEST-client-profile.js`, `TEST-finance.js`

**n8n Workflows:**
- [ ] List all `developing/TEST Workflow Copies/TEST - *.json` files
- [ ] Example: `TEST - CLIENT - Update Client.json`, `TEST - CLINIC - Get Clinic Locations.json`

---

## Phase 2: Frontend File Migration (HTML/JS) 🔧

**Goal:** Convert TEST HTML/JS files to production versions in Testing branch

### 2.1 Rename Files (Remove TEST- Prefix)

**Before:**
```
developing/TEST-dashboard.html
developing/TEST-clients-sl.html
developing/TEST-client-profile.html
developing/TEST-finance.html
developing/js/pages/TEST-client-profile.js
developing/js/core/TEST-finance.js
```

**After (in Testing branch root):**
```
dashboard.html (if updating existing) OR new-page-name.html
clients-sl.html (if updating existing)
client-profile.html (NEW - doesn't exist in production yet)
finance.html (if updating existing)
js/pages/client-profile.js (NEW)
js/core/finance.js (if updating existing)
```

**Action Items:**
- [ ] Copy TEST files to Testing branch root/js directories
- [ ] Rename files (remove `TEST-` prefix)
- [ ] If file already exists in production, decide: replace entirely or merge changes?

### 2.2 Remove TEST MODE Banners

**Find and Remove:**
```html
<!-- ❌ REMOVE THIS -->
<!-- TESTING MODE BANNER -->
<div style="position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; text-align: center; padding: 10px; font-weight: bold; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">
    🧪 TESTING MODE - Using Testing Branch Database
</div>
```

**Also Remove:**
```html
<!-- ❌ REMOVE THIS -->
<span class="badge bg-warning text-dark me-2">TEST</span>
```

**Action Items:**
- [ ] Search for "TESTING MODE" in all HTML files
- [ ] Search for "TEST MODE" in all HTML files
- [ ] Search for `badge bg-warning` with "TEST" text
- [ ] Remove all TEST banners and badges
- [ ] Update `padding-top` in CSS to remove banner spacing (usually 130px → 90px)

### 2.3 Update Internal Links

**Find and Replace:**
```javascript
// ❌ BEFORE (TEST links)
window.location.href = 'TEST-dashboard.html';
<a href="TEST-clients-sl.html">Clients</a>
<a href="TEST-client-profile.html?knumber=...">View Profile</a>

// ✅ AFTER (Production links)
window.location.href = 'dashboard.html';
<a href="clients-sl.html">Clients</a>
<a href="client-profile.html?knumber=...">View Profile</a>
```

**Action Items:**
- [ ] Search and replace `TEST-dashboard.html` → `dashboard.html`
- [ ] Search and replace `TEST-clients-sl.html` → `clients-sl.html`
- [ ] Search and replace `TEST-client-profile.html` → `client-profile.html`
- [ ] Search and replace any other `TEST-*.html` links
- [ ] Check navigation menus for TEST links
- [ ] Check breadcrumb links for TEST links

### 2.4 Update Resource Paths (CSS/JS Includes)

**TEST files use `../` to reference shared resources:**
```html
<!-- ❌ BEFORE (TEST in developing/ folder) -->
<link href="../css/shared-styles.css" rel="stylesheet">
<script src="../js/auth/jwt-manager.js"></script>
<script src="../js/auth/jwt-auth.js"></script>
<script src="../js/core/api-client.js"></script>
<script src="js/pages/TEST-client-profile.js"></script>

<!-- ✅ AFTER (Production in root folder) -->
<link href="css/shared-styles.css" rel="stylesheet">
<script src="js/auth/jwt-manager.js"></script>
<script src="js/auth/jwt-auth.js"></script>
<script src="js/core/api-client.js"></script>
<script src="js/pages/client-profile.js"></script>
```

**Action Items:**
- [ ] Replace `../css/` → `css/`
- [ ] Replace `../js/` → `js/`
- [ ] Update local script references (remove TEST- prefix)

### 2.5 Remove Logout Overrides (JavaScript)

**Find and Remove:**
```javascript
// ❌ REMOVE THIS (TEST-specific override)
window.logout = function() {
    sessionStorage.removeItem('rrts_user');
    sessionStorage.removeItem('rrts_access_token');
    // ...
    window.location.href = 'TEST-dashboard.html';
};
```

**Production uses the default logout function from `jwt-auth.js` which redirects to `dashboard.html`.**

**Action Items:**
- [ ] Search for `window.logout = function` in all JavaScript files
- [ ] Remove logout override functions
- [ ] Verify logout now uses default from `jwt-auth.js`

### 2.6 Update API Endpoint Calls

**Find and Replace in JavaScript:**
```javascript
// ❌ BEFORE (TEST endpoints)
const ENDPOINTS = {
    getClient: '/TEST-get-client',
    updateClient: '/TEST-update-client',
    getClinics: '/TEST-clinic-locations',
    getDrivers: '/TEST-get-all-drivers'
};

// ✅ AFTER (Production endpoints)
const ENDPOINTS = {
    getClient: '/get-client',
    updateClient: '/update-client',
    getClinics: '/clinic-locations',
    getDrivers: '/get-all-drivers'
};
```

**Action Items:**
- [ ] Search for `/TEST-` in all JavaScript files
- [ ] Replace `/TEST-endpoint` → `/endpoint` for all endpoints
- [ ] Verify no TEST- prefixes remain in API calls
- [ ] Update any hardcoded TEST URLs

### 2.7 Update Console Log Messages

**Optional but recommended:**
```javascript
// ❌ BEFORE
console.log('[TEST Client Profile] Initializing page...');
console.log('[TEST Finance] Loading data...');

// ✅ AFTER
console.log('[Client Profile] Initializing page...');
console.log('[Finance] Loading data...');
```

**Action Items:**
- [ ] Search for `[TEST` in console.log statements
- [ ] Remove `TEST` from log prefixes
- [ ] Update version numbers if needed (e.g., `v1.0.0-TEST` → `v1.0.0`)

---

## Phase 3: Backend Workflow Migration (n8n) 🔧

**Goal:** Convert TEST workflows to production workflows that use production Supabase

### 3.1 Export TEST Workflows from n8n

**Action Items:**
- [ ] Open n8n web interface (Railway.app)
- [ ] For each TEST workflow:
  - [ ] Open workflow
  - [ ] Click **Settings** → **Export**
  - [ ] Download JSON file
  - [ ] Save to `workflows/` directory (organized by module)

### 3.2 Rename Workflow Files

**Before:**
```
developing/TEST Workflow Copies/TEST - CLIENT - Update Client copy.json
developing/TEST Workflow Copies/TEST - CLINIC - Get Clinic Locations copy (1).json
developing/TEST Workflow Copies/TEST - DRIVER - Get All Drivers.json
```

**After:**
```
workflows/clients/CLIENT - Update Client.json
workflows/clinics/CLINIC - Get Clinic Locations.json
workflows/drivers/DRIVER - Get All Drivers.json
```

**Action Items:**
- [ ] Remove `TEST -` prefix from workflow names
- [ ] Remove `copy` or `copy (1)` suffixes
- [ ] Move to appropriate subdirectory in `workflows/`

### 3.3 Update Workflow JSON (Before Importing)

**Open each workflow JSON file and make these changes:**

#### 3.3.1 Update Workflow Name
```json
{
  "name": "TEST - CLIENT - Update Client copy",  // ❌ BEFORE
  "name": "CLIENT - Update Client",              // ✅ AFTER
}
```

#### 3.3.2 Update Webhook Paths
```json
{
  "parameters": {
    "path": "TEST-update-client",  // ❌ BEFORE
    "path": "update-client",       // ✅ AFTER
  }
}
```

**Find all webhook nodes and update `path` parameter.**

#### 3.3.3 Update Supabase Credentials
```json
{
  "credentials": {
    "supabaseApi": {
      "id": "pHAY0PSxRTkwJnPE",              // ❌ BEFORE (Testing Branch)
      "name": "Testing Branch - Supabase"
    }
  }
}
```

Change to:
```json
{
  "credentials": {
    "supabaseApi": {
      "id": "[production-credential-id]",     // ✅ AFTER (Production)
      "name": "Supabase Production"           // Or whatever your prod credential is named
    }
  }
}
```

**Action Items:**
- [ ] Find production Supabase credential ID in n8n
  - Go to n8n → Credentials → Find "Supabase Production" or similar
  - Note the credential ID
- [ ] For each workflow JSON:
  - [ ] Search for `"supabaseApi"`
  - [ ] Replace Testing Branch credential ID with production credential ID
  - [ ] Replace credential name to production name

#### 3.3.4 Remove TEST References in Code Nodes

**Search for:**
- `console.log` statements with "TEST"
- Comments with "TEST"
- Version numbers with "-TEST"

```javascript
// ❌ BEFORE
console.log('[TEST Client Profile] Processing data...');
// Version: v1.0.0-TEST

// ✅ AFTER
console.log('[Client Profile] Processing data...');
// Version: v1.0.0
```

**Action Items:**
- [ ] Search workflow JSON for `"TEST"` (case-insensitive)
- [ ] Remove TEST references from logs and comments
- [ ] Update version numbers

### 3.4 Import Production Workflows to n8n

**Action Items:**
- [ ] Open n8n web interface
- [ ] Click **Workflows** → **Import from File**
- [ ] Select updated workflow JSON
- [ ] Verify workflow imported correctly
- [ ] Check webhook path is correct (no TEST- prefix)
- [ ] Check Supabase nodes use production credentials
- [ ] **DO NOT ACTIVATE YET** (wait until Testing branch validation)

### 3.5 Deactivate TEST Workflows

**After production workflows are imported and validated:**

**Action Items:**
- [ ] In n8n, find all TEST workflows
- [ ] Deactivate each TEST workflow
- [ ] Do NOT delete (keep for reference)
- [ ] Archive or move to "Archive" folder in n8n

---

## Phase 4: Database Schema Sync 🗄️

**Goal:** Ensure production database has all schema changes from Testing Branch

### 4.1 Identify Schema Differences

**Check Testing Branch database for new/modified:**
- [ ] Tables (e.g., new tables created during testing)
- [ ] Columns (e.g., `clients.primary_clinic_id`, `clients.updated_at`)
- [ ] Indexes
- [ ] Triggers (e.g., `updated_at` auto-update trigger)
- [ ] Constraints (e.g., foreign keys)

**How to Check:**
- Open Testing Branch Supabase → Table Editor
- Compare with Production Supabase → Table Editor
- Look for differences

### 4.2 Create/Run Production Migrations

**For each schema change:**

**Action Items:**
- [ ] Create SQL migration file in `sql/` directory
- [ ] Name: `XX_description.sql` (e.g., `11_add_primary_clinic_to_clients.sql`)
- [ ] Test migration on a copy of production data (if possible)
- [ ] Run migration on production Supabase:
  - Production Supabase → SQL Editor
  - Paste migration SQL
  - Review carefully
  - Execute
- [ ] Verify changes in Table Editor
- [ ] Commit migration file to git

**Example Migration:**
```sql
-- 11_add_primary_clinic_to_clients.sql
ALTER TABLE clients
ADD COLUMN primary_clinic_id integer REFERENCES destinations(id);

COMMENT ON COLUMN clients.primary_clinic_id IS 'FK to destinations table - primary clinic for this client';
```

### 4.3 Verify Data Compatibility

**Action Items:**
- [ ] Check that existing production data works with new schema
- [ ] Verify foreign key constraints don't break existing records
- [ ] Test queries used in workflows still work
- [ ] Run sample SELECT queries to verify data integrity

---

## Phase 5: Testing Branch Testing 🧪

**Goal:** Validate production versions in Testing git branch before merging to main

### 5.1 Commit Files to Testing Branch

**Action Items:**
- [ ] Ensure on Testing git branch: `git checkout Testing`
- [ ] Stage new/modified files: `git add [files]`
- [ ] Commit with descriptive message:
  ```bash
  git commit -m "Add client profile page and finance dashboard

  - Add client-profile.html with full client editor
  - Add finance.html with pay period tracking
  - Update client-profile.js for primary clinic support
  - Add finance.js for invoice management
  - Update CLIENT - Update Client workflow for primary_clinic_id
  - Add CLINIC - Get Clinic Locations workflow
  "
  ```
- [ ] Push to Testing branch: `git push origin Testing`

### 5.2 Test with Production Data

**CRITICAL: Test everything with production Supabase data**

**Action Items:**
- [ ] Open production HTML pages in Chrome (from Testing branch)
- [ ] Login with all roles:
  - [ ] Admin
  - [ ] Supervisor
  - [ ] Booking Agent
- [ ] Test CRUD operations:
  - [ ] Create new records
  - [ ] Read/view existing records
  - [ ] Update records
  - [ ] Delete records (if applicable)
- [ ] Verify RBAC:
  - [ ] Admin sees all features
  - [ ] Supervisor sees correct features
  - [ ] Booking Agent has limited features
  - [ ] Cost fields hidden for non-admin
- [ ] Check console for errors
- [ ] Test in multiple browsers

### 5.3 Activate Production Workflows

**After frontend testing passes:**

**Action Items:**
- [ ] In n8n, activate production workflows one at a time
- [ ] Test each workflow endpoint:
  - Use frontend page that calls endpoint
  - OR use Postman/Insomnia to test directly
- [ ] Check n8n Executions for success/errors
- [ ] Verify data returned is correct
- [ ] Monitor for 24 hours before proceeding

### 5.4 Monitor for Issues

**Action Items:**
- [ ] Check n8n Executions daily for errors
- [ ] Monitor browser console on pages
- [ ] Check Supabase logs for errors
- [ ] Test with real users (if available)
- [ ] Document any bugs found
- [ ] Fix bugs in Testing branch before merging

### 5.5 Final Testing Checklist

**Before merging to main, verify:**

- [ ] All pages load without errors
- [ ] All links work (no 404s)
- [ ] All forms submit correctly
- [ ] All data displays correctly
- [ ] RBAC works as expected
- [ ] No TEST- references remain
- [ ] No console errors
- [ ] Mobile responsive (if applicable)
- [ ] Performance acceptable (load times, API speed)
- [ ] Workflows all active and working
- [ ] Database migrations applied
- [ ] No regression bugs in existing features

---

## Phase 6: Production Deployment 🚀

**Goal:** Merge Testing branch to main and deploy to production

### 6.1 Create Pull Request

**Action Items:**
- [ ] Go to GitHub repository
- [ ] Create Pull Request: `Testing` → `main`
- [ ] Title: "Add [feature name] - Client Profile Page & Finance Dashboard"
- [ ] Description: Summarize changes, list new files, note testing completed
- [ ] Assign reviewers (if applicable)
- [ ] Link to any related issues

**Example PR Description:**
```markdown
## Summary
Adds client profile page with primary clinic support and finance dashboard with pay period tracking.

## New Features
- Client profile page with full editor (primary/secondary addresses, emergency contacts)
- Finance dashboard with automated pay period calculations
- Primary clinic field for clients (FK to destinations table)

## Files Added
- `client-profile.html` - Client profile editor
- `finance.html` - Finance dashboard
- `js/pages/client-profile.js` - Client profile controller
- `js/core/finance.js` - Finance business logic
- `workflows/clients/CLIENT - Update Client.json` - Updated for primary_clinic_id
- `workflows/clinics/CLINIC - Get Clinic Locations.json` - New workflow

## Testing Completed
- [x] Tested with admin, supervisor, booking_agent roles
- [x] Verified RBAC permissions
- [x] Tested all CRUD operations
- [x] Production workflows active and working
- [x] Database migrations applied to production
- [x] No console errors
- [x] No TEST references remain

## Database Changes
- Added `clients.primary_clinic_id` column (FK to destinations)
- Added `clients.updated_at` column with trigger
```

### 6.2 Merge to Main

**Action Items:**
- [ ] Review PR for any issues
- [ ] Get approval (if required)
- [ ] Merge PR to main branch
- [ ] Delete Testing branch merge commit (or keep for history)

### 6.3 Verify Production Deployment

**Frontend Auto-Deploys:**
- [ ] Wait for deployment to complete (Cloudflare Pages/Netlify/etc.)
- [ ] Check deployment status/logs
- [ ] Verify deployment succeeded

**Test Production Site:**
- [ ] Open production URL in browser
- [ ] Login and test new pages
- [ ] Verify everything works
- [ ] Check for any deployment-specific issues

### 6.4 Verify n8n Workflows

**Action Items:**
- [ ] Verify production workflows are active in n8n
- [ ] Test workflows via production site
- [ ] Check n8n Executions for any errors
- [ ] Monitor for first few hours/days

### 6.5 Monitor Production

**Action Items:**
- [ ] Monitor error logs (browser console, n8n, Supabase)
- [ ] Check for user reports of issues
- [ ] Monitor performance (page load times, API response times)
- [ ] Be ready to rollback if critical issues found

### 6.6 Rollback Plan (If Needed)

**If critical issues are found:**

**Action Items:**
- [ ] Revert merge commit in main branch
- [ ] Deactivate production workflows in n8n
- [ ] Re-activate old workflows (if applicable)
- [ ] Notify users of issues
- [ ] Fix issues in Testing branch
- [ ] Repeat testing process

---

## Quick Reference Checklist

### Files to Modify

**HTML Files:**
- [ ] Remove TEST- prefix from filename
- [ ] Remove TEST MODE banner
- [ ] Update internal links (TEST-*.html → *.html)
- [ ] Update resource paths (../ → direct paths)
- [ ] Remove TEST badges

**JavaScript Files:**
- [ ] Remove TEST- prefix from filename
- [ ] Remove logout override
- [ ] Update endpoint calls (/TEST-* → /*)
- [ ] Update console log messages
- [ ] Update version numbers (remove -TEST)

**n8n Workflow JSON Files:**
- [ ] Remove TEST- prefix from workflow name
- [ ] Update webhook path (TEST-* → *)
- [ ] Change Supabase credentials (Testing Branch → Production)
- [ ] Remove TEST references in code nodes
- [ ] Import to n8n
- [ ] Activate after testing

**Database:**
- [ ] Create migration SQL files for schema changes
- [ ] Run migrations on production Supabase
- [ ] Verify data compatibility

---

## Common Pitfalls to Avoid

### ❌ Don't Forget These:

1. **Logout Override** - MUST be removed or production will redirect incorrectly
2. **Resource Paths** - `../css/` works in developing/, but not in root
3. **Supabase Credentials** - Workflows MUST use production credentials
4. **Webhook Paths** - `/TEST-endpoint` won't work, must be `/endpoint`
5. **Internal Links** - `TEST-dashboard.html` links will 404 in production
6. **Database Schema** - Production MUST have same schema as Testing Branch before workflow activation
7. **Workflow Activation** - Don't activate production workflows until frontend is deployed
8. **Testing with Production Data** - Always test with production Supabase before merging
9. **Git Branch** - Make sure you're on Testing branch, not main
10. **Pull Request** - Don't merge directly to main, always use PR for review

---

## Search Patterns for Find & Replace

Use these patterns to find all instances that need updating:

**Find TEST References:**
```
TEST-
[TEST
v1.0.0-TEST
Testing Branch
TEST MODE
TEST endpoints
```

**Find Resource Paths:**
```
../css/
../js/
href="../
src="../
```

**Find Logout Overrides:**
```
window.logout = function
window.logout=function
```

**Find Endpoint Calls:**
```
/TEST-
'/TEST-
"/TEST-
`/TEST-
endpoint: '/TEST-
endpoint: "/TEST-
```

---

## Post-Migration Cleanup

**After successful production deployment:**

### Optional: Clean Up developing/ Folder
- [ ] Archive TEST files (move to `developing/archive/` or delete)
- [ ] Keep `developing/` folder structure for future testing
- [ ] Document any lessons learned

### Optional: Update Documentation
- [ ] Update CLAUDE.md if architecture changed
- [ ] Create session summary documenting migration
- [ ] Update README.md if new features added
- [ ] Update API_ENDPOINTS.md if new endpoints added

### Required: Deactivate TEST Workflows
- [ ] Deactivate all TEST workflows in n8n
- [ ] Keep for reference or delete after 30 days
- [ ] Document which workflows were replaced

---

## Timeline Estimate

**Assuming 3-5 TEST pages + 5-10 workflows:**

- **Phase 1 (Pre-Migration Validation):** 2-4 hours
- **Phase 2 (Frontend Migration):** 3-6 hours
- **Phase 3 (Workflow Migration):** 2-4 hours
- **Phase 4 (Database Sync):** 1-2 hours
- **Phase 5 (Testing Branch Testing):** 4-8 hours (includes monitoring)
- **Phase 6 (Production Deployment):** 1-2 hours

**Total:** 13-26 hours (spread over 2-5 days to allow for monitoring)

---

## Summary

**Migration Process:**
1. ✅ Validate TEST files work perfectly
2. 🔧 Remove TEST- prefixes and TEST-specific code
3. 🔧 Update endpoints, links, paths, credentials
4. 🗄️ Sync database schema to production
5. 🧪 Test in Testing branch with production data
6. 🚀 Merge to main and deploy

**Key Success Factors:**
- Test thoroughly in Testing branch before merging
- Use production data for testing
- Monitor production closely after deployment
- Have rollback plan ready
- Document everything

**Remember:** Better to take extra time in Testing branch than rush to production and break things!
