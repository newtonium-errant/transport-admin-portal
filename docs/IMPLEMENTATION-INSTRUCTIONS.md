# Async Workflow Implementation - Agent Instructions

## Context

We've designed an async workflow system to improve user experience by reducing wait times. Instead of users waiting 30+ seconds for workflows to complete, they get immediate responses while background tasks handle slow operations (drive time calculations, Quo API sync, notifications, etc.).

**Branch:** `claude/async-tasks-Sr2aC` (based on `staging`)

---

## What's Already Built

### 1. Database Schema (`sql/background_tasks_schema.sql`)
- `background_tasks` table - tracks async tasks (includes `audit_log_id` for linking to audit trail)
- `background_tasks_archive` table - stores tasks older than 7 days
- Helper functions: `create_background_task()`, `start_background_task()`, `complete_background_task()`, `fail_background_task()`, `dismiss_background_task()`, `dismiss_all_failed_tasks()`, `archive_old_tasks()`
- Views: `user_failed_tasks`, `all_failed_tasks`, `task_status_summary`, `failed_tasks_summary`, `failed_tasks_with_audit`
- RLS policies for user/admin access
- Realtime enabled for the table

### 2. Frontend Components (`js/`)
- `js/core/task-monitor.js` - Monitors for failed tasks via Supabase Realtime or polling
- `js/components/task-notifications.js` - Toast notifications, header indicator badge, slide-out panel
- `js/components/failed-tasks-widget.js` - Dashboard widget for supervisors/admins

### 3. Documentation (`docs/`)
- `docs/n8n-archive-cleanup-workflow.md` - How to set up daily archive job
- `docs/workflow-segmentation-guide.md` - Which workflows to segment and how

---

## What Needs to Be Done

### Step 1: Apply Database Schema

Run `sql/background_tasks_schema.sql` in Supabase SQL Editor. This creates all tables, functions, views, and policies.

**Verify by running:**
```sql
SELECT * FROM background_tasks LIMIT 1;
SELECT create_background_task('test', gen_random_uuid(), 'Test', 'test_task', NULL);
```

---

### Step 2: Create n8n Webhook Endpoints for Background Tasks

Create these new n8n webhooks:

#### `/process-drive-times`
**Trigger:** HTTP Webhook
**Input:** `{ task_id, client_id }`
**Steps:**
1. Call `start_background_task(task_id)`
2. Get client address from Supabase
3. Get all active drivers with home addresses
4. For each driver: Call Google Maps Distance Matrix API
5. Store results in `client_drive_times` table (or however you currently store them)
6. On success: Call `complete_background_task(task_id, result_json)`
7. On error: Call `fail_background_task(task_id, error_message)`

#### `/process-quo-sync`
**Trigger:** HTTP Webhook
**Input:** `{ task_id, entity_type, entity_id }`
**Steps:**
1. Call `start_background_task(task_id)`
2. Get entity data from Supabase (client or appointment)
3. Call Quo API to create/update contact
4. On success: Call `complete_background_task(task_id, result_json)`
5. On error: Call `fail_background_task(task_id, error_message)`

#### `/get-failed-tasks`
**Trigger:** HTTP Webhook (authenticated)
**Steps:**
1. Get user ID from JWT
2. Query `user_failed_tasks` view filtered by `created_by = user_id`
3. Return tasks array

#### `/get-all-failed-tasks`
**Trigger:** HTTP Webhook (authenticated, admin only)
**Steps:**
1. Verify user is admin/supervisor
2. Query `all_failed_tasks` view
3. Return tasks array

#### `/get-failed-tasks-summary`
**Trigger:** HTTP Webhook (authenticated, admin only)
**Steps:**
1. Query `failed_tasks_summary` view
2. Return summary object

#### `/dismiss-task`
**Trigger:** HTTP Webhook (authenticated)
**Input:** `{ task_id }`
**Steps:**
1. Get user ID from JWT
2. Call `dismiss_background_task(task_id, user_id)`
3. Return success

#### `/dismiss-all-tasks`
**Trigger:** HTTP Webhook (authenticated)
**Steps:**
1. Get user ID from JWT
2. Call `dismiss_all_failed_tasks(user_id)`
3. Return count dismissed

---

### Step 3: Modify Existing `/add-client` Workflow

**Current flow (slow):**
1. Validate → Insert client → Calculate drive times → Add to Quo → Return

**New flow (fast):**
1. Validate client data
2. Insert client into Supabase → get `client_id`
3. **CREATE AUDIT LOG** (captures user intent immediately):
```sql
INSERT INTO audit_logs (action, entity_type, entity_id, user_id, user_name, details)
VALUES ('create_client', 'client', client_id, user_id, user_name, '{"client_name": "John Smith", ...}')
RETURNING id AS audit_log_id;
```
4. Create background tasks (linked to audit log):
```sql
SELECT create_background_task('client', client_id, 'Client Name', 'calculate_drive_times', user_id, audit_log_id);
SELECT create_background_task('client', client_id, 'Client Name', 'sync_quo', user_id, audit_log_id);
```
5. Trigger background workflows (fire and forget):
```
HTTP Request to /process-drive-times { task_id, client_id } - Don't wait for response
HTTP Request to /process-quo-sync { task_id, entity_type: 'client', entity_id: client_id } - Don't wait
```
6. Return immediately: `{ success: true, client_id, message: "Client saved. Drive times and Quo sync processing in background." }`

**Key n8n setting:** When calling background webhooks, set "Continue On Fail" = true and don't wait for response.

**Why audit in sync phase?** The audit log captures who did what and when - this must happen immediately so it's never lost. Background tasks track whether the side effects succeeded or failed.

---

### Step 4: Add Frontend Scripts to Pages

Add these scripts to pages that need task notifications (dashboard, client management, etc.):

```html
<!-- Before closing </body> tag -->
<script src="js/core/api-client.js"></script>
<script src="js/core/task-monitor.js"></script>
<script src="js/components/task-notifications.js"></script>

<!-- For dashboard only (admin/supervisor widget) -->
<script src="js/components/failed-tasks-widget.js"></script>
```

The components auto-initialize on page load. No additional code needed.

**Optional Supabase Realtime (faster notifications):**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
    // Initialize with Supabase for realtime (otherwise falls back to polling)
    TaskMonitor.init({
        supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
        supabaseAnonKey: 'YOUR_ANON_KEY'
    });
</script>
```

---

### Step 5: Set Up Archive Cleanup Workflow

Create n8n workflow (see `docs/n8n-archive-cleanup-workflow.md`):
1. Schedule Trigger: Daily at 3 AM
2. Supabase node: `SELECT archive_old_tasks() as archived_count;`
3. Optional: Slack notification with count

---

### Step 6: Test the System

1. **Add a test client** - Should return quickly, check `background_tasks` table for pending tasks
2. **Simulate failure** - In `/process-drive-times`, temporarily add an error. Check that:
   - Task status becomes 'failed'
   - Error toast appears in frontend
   - Task shows in failed tasks panel
3. **Dismiss task** - Click dismiss, verify `dismissed_at` is set
4. **Archive test** - Run `SELECT archive_old_tasks();` manually

---

## Implementation Order

1. Apply SQL schema to Supabase
2. Create `/get-failed-tasks` and `/dismiss-task` endpoints (so frontend works)
3. Add frontend scripts to dashboard.html
4. Verify notifications appear when manually inserting failed tasks
5. Create `/process-drive-times` and `/process-quo-sync` background workflows
6. Modify `/add-client` to use async pattern
7. Test end-to-end
8. Repeat for other workflows (update-client, add-driver, save-appointment, etc.)

---

## Error Handling

Background workflows should catch all errors and call `fail_background_task()` with a helpful message:

```
Good: "Google Maps API returned 429: Rate limit exceeded. Try again in 1 minute."
Bad: "Error"
```

Include:
- What failed (API name, operation)
- Why it failed (error code, message)
- What to do (retry, check config, contact admin)

---

## Files Reference

| File | Purpose |
|------|---------|
| `sql/background_tasks_schema.sql` | Run in Supabase to create tables/functions |
| `js/core/task-monitor.js` | Monitors failed tasks, call `TaskMonitor.init()` |
| `js/components/task-notifications.js` | UI components, auto-initializes |
| `js/components/failed-tasks-widget.js` | Dashboard widget, auto-initializes for admin/supervisor |
| `docs/n8n-archive-cleanup-workflow.md` | Archive cleanup setup guide |
| `docs/workflow-segmentation-guide.md` | Full list of workflows to segment |

---

## Audit Trail Integration

### Why Audit Happens in Sync Phase

```
USER ACTION
    │
    ▼
┌─────────────────────────────────────────────────┐
│ SYNC PHASE (immediate)                          │
│                                                 │
│ 1. Validate data                                │
│ 2. Save to database                             │
│ 3. CREATE AUDIT LOG  ◄── User intent captured  │
│ 4. Create background tasks (linked to audit)   │
│ 5. Return success                               │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│ ASYNC PHASE (background)                        │
│                                                 │
│ • Task success/fail tracked in background_tasks │
│ • No separate audit needed                      │
└─────────────────────────────────────────────────┘
```

### What Gets Logged Where

| Question | Answer | Where to Look |
|----------|--------|---------------|
| Who created this client? | Sarah at 2:35 PM | `audit_logs` |
| Did drive times calculate? | Yes/No + error details | `background_tasks` |
| Why did Quo sync fail? | "API rate limited" | `background_tasks.error_message` |
| Full picture of a failure? | User action + task status | `failed_tasks_with_audit` view |

### Investigating Failures

Use the `failed_tasks_with_audit` view to see the complete picture:

```sql
SELECT
    task_type,
    error_message,
    entity_label,
    action_user_name,      -- Who initiated
    user_action_time,      -- When they clicked save
    task_failed_at         -- When background task failed
FROM failed_tasks_with_audit
WHERE entity_type = 'client'
ORDER BY task_failed_at DESC;
```

### Audit Log Pattern for Each Workflow

Every workflow that creates background tasks should:

1. **Insert/update the main entity** (client, appointment, etc.)
2. **Create audit log immediately** with:
   - `action`: 'create_client', 'update_appointment', etc.
   - `entity_type`: 'client', 'appointment', 'driver'
   - `entity_id`: The ID of the record
   - `user_id` + `user_name`: From JWT/session
   - `details`: JSON with relevant data (what changed)
3. **Link background tasks** to the audit log via `audit_log_id`

---

## User Profile Page

A user profile page has been created at `profile.html` that allows users to:
- View and edit their profile information (name, email, phone)
- Change their password

The username in the header of all pages now links to the profile page.

### Frontend Already Built

- `profile.html` - Complete profile page with forms
- Header links updated in all pages (dashboard, admin, appointments, clients, drivers, operations)

### n8n Endpoint Needed: `/update-user-profile`

**Trigger:** HTTP Webhook (authenticated)

**Input:**
```json
{
  "fullName": "John Smith",
  "email": "john@example.com",
  "phone": "(555) 123-4567"
}
```

**Workflow Steps:**

1. **Extract user from JWT**
   - Get `user_id` from the authentication token
   - Verify the token is valid

2. **Validate input**
   - `fullName` is required, non-empty string
   - `email` is required, valid email format
   - `phone` is optional, validate format if provided

3. **Check for email conflicts**
   - If email is being changed, verify no other user has this email
   - Query: `SELECT id FROM users WHERE email = :newEmail AND id != :userId`
   - If conflict found, return error: `{ success: false, message: "Email already in use" }`

4. **Update user record in Supabase**
   ```sql
   UPDATE users
   SET
       full_name = :fullName,
       email = :email,
       phone = :phone,
       updated_at = NOW()
   WHERE id = :userId;
   ```

5. **Create audit log entry**
   ```sql
   INSERT INTO audit_logs (action, entity_type, entity_id, user_id, user_name, details)
   VALUES (
       'update_profile',
       'user',
       :userId,
       :userId,
       :fullName,
       '{"fields_updated": ["fullName", "email", "phone"]}'
   );
   ```

6. **Return success response**
   ```json
   {
     "success": true,
     "message": "Profile updated successfully",
     "user": {
       "id": "...",
       "fullName": "John Smith",
       "email": "john@example.com",
       "phone": "(555) 123-4567"
     }
   }
   ```

**Error Responses:**
- `400` - Validation failed (missing required fields, invalid email format)
- `401` - Not authenticated
- `409` - Email already in use by another user
- `500` - Database error

### Existing Endpoint: `/change-password`

The password change functionality uses the existing `/change-password` endpoint.

**Input:**
```json
{
  "username": "jsmith",
  "currentPassword": "oldpass123",
  "newPassword": "newpass456"
}
```

**Expected behavior:**
1. Verify current password is correct
2. Validate new password meets requirements (min 8 chars)
3. Update password hash in database
4. Return `{ success: true }` or error message

---

## Security: Inactivity Auto-Logout

### Problem

Users could leave the browser open overnight and return the next day without needing to re-authenticate. The browser would automatically renew the expired JWT token, bypassing inactivity timeout protections for sensitive data.

### Solution Implemented

The system now tracks last user activity and enforces logout on page load if the user has been inactive too long.

**How it works:**

1. **Session Manager** (`js/auth/session-manager.js`) stores a `rrts_last_activity` timestamp in sessionStorage every time the user interacts with the page (mouse, keyboard, scroll, click, touch)

2. **JWT Auth** (`js/auth/jwt-auth.js`) checks this timestamp BEFORE attempting to refresh an expired token. If the user has been inactive longer than their role's timeout, they are forced to logout instead of getting a new token.

3. **Role-based timeouts** (must match between both files):

| Role | Timeout |
|------|---------|
| admin | 30 minutes |
| supervisor | 60 minutes |
| booking_agent | 120 minutes |
| driver | 120 minutes |
| client | 120 minutes |

### Flow Diagram

```
USER RETURNS AFTER EXTENDED ABSENCE
           │
           ▼
┌─────────────────────────────────────┐
│  requireAuth() on page load         │
├─────────────────────────────────────┤
│ 1. Check rrts_last_activity         │
│ 2. Compare to role timeout          │
│    │                                │
│    ├─► Inactive > timeout?          │
│    │      YES → Force logout        │
│    │      NO  → Continue below      │
│    │                                │
│ 3. Check if token expired           │
│ 4. Refresh token if needed          │
│ 5. Start session manager            │
└─────────────────────────────────────┘
```

### Key Code Changes

**`js/auth/jwt-auth.js`:**
- Added `SESSION_TIMEOUTS` constant (role-based)
- Added `LAST_ACTIVITY_KEY = 'rrts_last_activity'`
- Added `checkInactivityTimeout()` function
- Modified `requireAuth()` to call `checkInactivityTimeout()` before token refresh
- Modified `logout()` to clear `LAST_ACTIVITY_KEY`

**`js/auth/session-manager.js`:**
- Added `LAST_ACTIVITY_KEY` constant
- Modified `start()` to set initial activity timestamp
- Modified `resetTimer()` to update activity timestamp on user interaction
- Added `isInactiveForTooLong(userRole)` function (exported for external use)
- Added `clearLastActivity()` function
- Modified `handleTimeout()` and `logout()` to clear activity timestamp

### Testing

1. Log in as admin
2. Wait 31 minutes without activity (or modify timeout to 1 minute for testing)
3. Refresh the page
4. **Expected:** User sees "Your session has expired due to inactivity. Please log in again." and is redirected to login

### Future Enhancements (Optional)

If server-side enforcement is needed, the backend could:
1. Store `last_activity` timestamp in the database (not just sessionStorage)
2. Check this timestamp during token refresh endpoint
3. Reject refresh requests if user was inactive too long

This would add an extra layer of security but requires backend changes.

---

## Centralized Configuration System

### Problem

API endpoints are hardcoded throughout the codebase:
- `js/auth/jwt-auth.js` - JWT_API_ENDPOINTS
- `js/core/api-client.js` - Various endpoint URLs
- Individual page scripts - Direct URL references

This causes:
1. **Maintenance burden** - Changing an endpoint requires searching multiple files
2. **Environment issues** - Can't easily switch between dev/staging/production
3. **Risk of errors** - Easy to miss a URL when updating

### Solution: Create `js/config.js`

Create a centralized configuration file that all other scripts reference.

**File location:** `js/config.js`

**Implementation:**

```javascript
// js/config.js - Centralized Application Configuration
const APP_CONFIG = (function() {
    'use strict';

    // Detect environment from hostname
    const hostname = window.location.hostname;

    // Environment-specific configurations
    const ENVIRONMENTS = {
        production: {
            API_BASE: 'https://webhook-processor-production-3bb8.up.railway.app/webhook',
            SUPABASE_URL: 'https://[PROJECT_ID].supabase.co',
            SUPABASE_ANON_KEY: '[PRODUCTION_ANON_KEY]'
        },
        staging: {
            API_BASE: 'https://webhook-processor-staging.up.railway.app/webhook',
            SUPABASE_URL: 'https://[STAGING_PROJECT_ID].supabase.co',
            SUPABASE_ANON_KEY: '[STAGING_ANON_KEY]'
        },
        development: {
            API_BASE: 'http://localhost:3000/webhook',
            SUPABASE_URL: 'http://localhost:54321',
            SUPABASE_ANON_KEY: '[DEV_ANON_KEY]'
        }
    };

    // Auto-detect environment based on hostname
    function detectEnvironment() {
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        }
        if (hostname.includes('staging') || hostname.includes('test')) {
            return 'staging';
        }
        return 'production';
    }

    const env = detectEnvironment();
    const config = ENVIRONMENTS[env];

    console.log(`[Config] Environment detected: ${env}`);

    // Build all endpoint URLs from base
    const endpoints = {
        // Auth endpoints
        LOGIN: `${config.API_BASE}/user-login`,
        CHANGE_PASSWORD: `${config.API_BASE}/change-password`,
        REFRESH_TOKEN: `${config.API_BASE}/refresh-token`,
        UPDATE_USER_PROFILE: `${config.API_BASE}/update-user-profile`,

        // Client endpoints
        ADD_CLIENT: `${config.API_BASE}/add-client`,
        UPDATE_CLIENT: `${config.API_BASE}/update-client`,
        GET_CLIENTS: `${config.API_BASE}/get-clients`,

        // Appointment endpoints
        SAVE_APPOINTMENT: `${config.API_BASE}/save-appointment`,
        GET_APPOINTMENTS: `${config.API_BASE}/get-appointments`,

        // Driver endpoints
        ADD_DRIVER: `${config.API_BASE}/add-driver`,
        UPDATE_DRIVER: `${config.API_BASE}/update-driver`,

        // Background task endpoints
        GET_FAILED_TASKS: `${config.API_BASE}/get-failed-tasks`,
        GET_ALL_FAILED_TASKS: `${config.API_BASE}/get-all-failed-tasks`,
        DISMISS_TASK: `${config.API_BASE}/dismiss-task`,
        DISMISS_ALL_TASKS: `${config.API_BASE}/dismiss-all-tasks`,

        // Add other endpoints as needed...
    };

    return {
        ENV: env,
        API_BASE: config.API_BASE,
        SUPABASE_URL: config.SUPABASE_URL,
        SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY,
        endpoints: endpoints,

        // Helper to check environment
        isProduction: () => env === 'production',
        isDevelopment: () => env === 'development',
        isStaging: () => env === 'staging'
    };
})();
```

### Migration Steps

1. **Create `js/config.js`** with the code above (fill in actual values)

2. **Update HTML files** to load config.js first:
   ```html
   <!-- Load configuration FIRST -->
   <script src="js/config.js"></script>

   <!-- Then other scripts -->
   <script src="js/auth/jwt-auth.js"></script>
   <script src="js/auth/session-manager.js"></script>
   <script src="js/core/api-client.js"></script>
   ```

3. **Update `js/auth/jwt-auth.js`**:
   ```javascript
   // BEFORE (hardcoded):
   const JWT_API_ENDPOINTS = {
       LOGIN: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/user-login',
       // ...
   };

   // AFTER (centralized):
   const JWT_API_ENDPOINTS = {
       LOGIN: APP_CONFIG.endpoints.LOGIN,
       CHANGE_PASSWORD: APP_CONFIG.endpoints.CHANGE_PASSWORD,
       REFRESH_TOKEN: APP_CONFIG.endpoints.REFRESH_TOKEN
   };
   ```

4. **Update `js/core/api-client.js`** similarly

5. **Search and replace** all other hardcoded URLs:
   ```bash
   grep -r "webhook-processor" js/
   grep -r "supabase.co" js/
   ```

6. **Update Supabase initialization** (if used):
   ```javascript
   // BEFORE:
   const supabase = supabase.createClient('https://xxx.supabase.co', 'key');

   // AFTER:
   const supabase = supabase.createClient(
       APP_CONFIG.SUPABASE_URL,
       APP_CONFIG.SUPABASE_ANON_KEY
   );
   ```

### Files to Update

| File | What to Change |
|------|----------------|
| `js/auth/jwt-auth.js` | Replace `JWT_API_ENDPOINTS` values |
| `js/core/api-client.js` | Replace any hardcoded URLs |
| `js/core/task-monitor.js` | Update Supabase config references |
| `dashboard.html` | Add `<script src="js/config.js">` first |
| `admin.html` | Add config.js script |
| `clients-sl.html` | Add config.js script |
| `appointments-sl.html` | Add config.js script |
| `driver-management.html` | Add config.js script |
| `operations.html` | Add config.js script |
| `profile.html` | Add config.js script |
| Any other HTML files | Add config.js script |

### Testing

1. **Development**: Access via `localhost` - should use dev endpoints
2. **Staging**: Deploy to staging domain - should auto-detect staging config
3. **Production**: Deploy to production - should use production config
4. Check browser console for: `[Config] Environment detected: production`

### Security Notes

- The anon keys in config.js are safe to expose (they're public by design in Supabase)
- Never put service role keys or secrets in frontend code
- For sensitive configuration, use environment variables at build time

---

## Security: XSS Prevention

### Problem

The codebase has ~21 uses of `innerHTML` which can allow Cross-Site Scripting (XSS) attacks. If user-provided data (names, addresses, etc.) is inserted via innerHTML, an attacker could inject malicious JavaScript.

**Example vulnerability:**
```javascript
// If clientName contains: <script>stealCookies()</script>
element.innerHTML = clientName;  // DANGEROUS - script executes!
```

### Solution: Create `js/utils/safe-html.js`

```javascript
/**
 * SafeHTML - Utilities for preventing XSS attacks
 * Always use these methods instead of raw innerHTML with user data
 */
const SafeHTML = (function() {
    'use strict';

    /**
     * Escape HTML entities to prevent XSS
     * @param {string} str - Untrusted string
     * @returns {string} Safe string with HTML entities escaped
     */
    function escape(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Safely set text content of an element
     * @param {string|Element} target - CSS selector or element
     * @param {string} text - Text to display
     */
    function setText(target, text) {
        const el = typeof target === 'string'
            ? document.querySelector(target)
            : target;
        if (el) el.textContent = text;
    }

    /**
     * Tagged template literal for safe HTML building
     * All interpolated values are automatically escaped
     *
     * Usage: SafeHTML.template`<div class="user">${userName}</div>`
     */
    function template(strings, ...values) {
        return strings.reduce((result, str, i) => {
            const value = values[i] != null ? escape(values[i]) : '';
            return result + str + value;
        }, '');
    }

    /**
     * Create an element with safe text content
     * @param {string} tag - Element tag name
     * @param {string} text - Text content
     * @param {string} className - Optional CSS class
     * @returns {Element} The created element
     */
    function createElement(tag, text, className) {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (className) el.className = className;
        return el;
    }

    return {
        escape,
        setText,
        template,
        createElement
    };
})();
```

### Migration Guide

**Step 1: Add safe-html.js to all pages**
```html
<script src="js/utils/safe-html.js"></script>
```

**Step 2: Find all innerHTML usage**
```bash
grep -rn "innerHTML" js/ --include="*.js"
grep -rn "innerHTML" *.html
```

**Step 3: Replace based on use case**

| Original Code | Safe Replacement |
|---------------|------------------|
| `el.innerHTML = userName` | `el.textContent = userName` |
| `el.innerHTML = '<b>' + name + '</b>'` | `el.innerHTML = SafeHTML.template\`<b>${name}</b>\`` |
| `el.innerHTML = '<div class="x">' + data + '</div>'` | Use DOM methods (see below) |

**DOM method example:**
```javascript
// BEFORE (vulnerable):
container.innerHTML = `<div class="client-card">
    <h3>${client.name}</h3>
    <p>${client.address}</p>
</div>`;

// AFTER (safe):
const card = document.createElement('div');
card.className = 'client-card';

const title = document.createElement('h3');
title.textContent = client.name;

const addr = document.createElement('p');
addr.textContent = client.address;

card.appendChild(title);
card.appendChild(addr);
container.appendChild(card);

// OR using SafeHTML.template (simpler):
container.innerHTML = SafeHTML.template`<div class="client-card">
    <h3>${client.name}</h3>
    <p>${client.address}</p>
</div>`;
```

### Priority Files to Fix

Search and fix these patterns in order of risk:

| Risk | Pattern | Files to Check |
|------|---------|----------------|
| High | `innerHTML = ` + user input | All files with form handling |
| High | `innerHTML = ` + API response | Files that display client/driver data |
| Medium | `innerHTML = ` + template literal | Dashboard, list views |
| Low | `innerHTML = '<static>'` | Usually OK, but verify no variables |

### Testing

After fixing, test these scenarios:
1. Create a client with name: `<script>alert('xss')</script>`
2. The name should display as literal text, not execute
3. Check browser console for errors

### When HTML is Actually Needed

If you need to render actual HTML (like rich text from a trusted source), use DOMPurify:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>
```

```javascript
// Only for trusted HTML that must render as HTML
element.innerHTML = DOMPurify.sanitize(htmlContent);
```

---

## Notes

- Only error notifications are shown to users (no success toasts)
- Success is assumed and can be verified on dashboards
- Dismissed tasks are hidden but kept for history (dismissed_at field)
- Tasks auto-archive after 7 days
- Supervisors/admins see all users' failed tasks
- Regular users only see their own failed tasks
- Audit logs capture user intent immediately (sync phase)
- Background task status + audit log = complete picture of what happened
- Inactivity timeout prevents token renewal after extended absence
