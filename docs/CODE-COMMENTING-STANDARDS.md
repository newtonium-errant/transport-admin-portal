# RRTS Code Commenting Standards

This document defines commenting standards for the RRTS codebase to ensure consistency, maintainability, and clarity for both human developers and AI agents.

---

## Review Findings Summary

### Current State by File

| File | Rating | Issues |
|------|--------|--------|
| `js/core/api-client.js` | ✅ Good | Reference example - follow this pattern |
| `js/auth/session-manager.js` | ⚠️ Adequate | Missing some @throws, could add more context |
| `js/auth/permissions.js` | ⚠️ Adequate | Good JSDoc, missing complexity explanations |
| `js/auth/jwt-auth.js` | ❌ Poor | No JSDoc, magic numbers, minimal docs |
| `js/components/client-modal.js` | ⚠️ Adequate | Inconsistent JSDoc on methods |
| `dashboard.html` (inline JS) | ❌ Poor | No documentation, magic numbers |

---

## Standard 1: File Headers

Every JavaScript file MUST have a file header with:

```javascript
/**
 * @fileoverview Brief description of what this module does
 *
 * @description
 * More detailed explanation of the module's purpose, when to use it,
 * and any important architectural decisions.
 *
 * @requires dependency1.js - What it provides
 * @requires dependency2.js - What it provides
 *
 * @example
 * // Basic usage
 * ModuleName.init({ option: value });
 * ModuleName.doSomething();
 *
 * @version 1.0.0
 * @since 2024-01-15
 * @author RRTS Development Team
 */
```

### Good Example (from api-client.js):

```javascript
/**
 * API Client - Authenticated Request Wrapper
 *
 * Simplifies making authenticated API calls to n8n webhooks.
 * Uses jwt-auth.js functions for token management (no JWTManager dependency).
 *
 * Dependencies: jwt-auth.js (provides isTokenExpired, refreshAccessToken, logout)
 *
 * Usage:
 *   <script src="js/auth/jwt-auth.js"></script>
 *   <script src="js/core/api-client.js"></script>
 */
```

### Bad Example (from jwt-auth.js):

```javascript
// JWT Authentication Helper
// Shared across all RRTS frontend pages
// Version: 1.0.0
```

---

## Standard 2: Function Documentation

Every function MUST have JSDoc documentation:

```javascript
/**
 * Brief description of what the function does (imperative mood)
 *
 * @param {string} paramName - Description of the parameter
 * @param {Object} options - Configuration options
 * @param {string} options.property - Description of nested property
 * @param {number} [optionalParam=defaultValue] - Optional param with default
 * @returns {Promise<Object>} Description of return value
 * @throws {Error} When and why this error is thrown
 * @throws {APIError} When API call fails
 *
 * @example
 * const result = await functionName('value', { property: 'x' });
 */
async function functionName(paramName, options, optionalParam = 10) {
    // Implementation
}
```

### Good Example:

```javascript
/**
 * Make authenticated API request
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {object} options - Fetch options
 * @returns {Promise<object>} Response data
 * @throws {Error} If request fails
 */
async function request(endpoint, options = {}) {
```

### Bad Example:

```javascript
// Check if user is authenticated (call this on page load)
async function requireAuth(redirectUrl = 'dashboard.html') {
```

---

## Standard 3: Constants Documentation

Constants MUST be documented with purpose and units where applicable:

```javascript
/**
 * Session timeout durations by role
 * @constant {Object.<string, number>}
 * @property {number} admin - 30 minutes (sensitive operations)
 * @property {number} supervisor - 60 minutes (moderate access)
 * @property {number} booking_agent - 120 minutes (standard operations)
 */
const SESSION_TIMEOUTS = {
    admin: 30 * 60 * 1000,           // 30 minutes in milliseconds
    supervisor: 60 * 60 * 1000,       // 60 minutes in milliseconds
    booking_agent: 120 * 60 * 1000,   // 120 minutes in milliseconds
};

/**
 * Token refresh interval - refreshes 15 minutes before expiry
 * Token expires after 60 minutes, so refresh at 45 minutes
 * @constant {number} milliseconds
 */
const TOKEN_REFRESH_INTERVAL = 45 * 60 * 1000;
```

### Magic Numbers

NEVER use unexplained magic numbers:

```javascript
// BAD
setInterval(async () => {
    await refreshAccessToken();
}, 45 * 60 * 1000);

// GOOD
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes
setInterval(async () => {
    await refreshAccessToken();
}, TOKEN_REFRESH_INTERVAL_MS);
```

---

## Standard 4: Inline Comments

Use inline comments to explain WHY, not WHAT:

```javascript
// BAD - Describes what the code does (obvious from reading)
// Check if response is ok
if (!response.ok) {

// GOOD - Explains why this check exists
// API returns 200 with success:false for business logic errors,
// only throw on actual HTTP failures
if (!response.ok) {
```

### Complex Logic

Break down complex conditions:

```javascript
// BAD
if (user.role === 'admin' || (user.role === 'supervisor' && user.department === dept)) {

// GOOD
// Full access: admins always, supervisors only for their department
const hasFullAccess = user.role === 'admin';
const hasDepartmentAccess = user.role === 'supervisor' && user.department === dept;
if (hasFullAccess || hasDepartmentAccess) {
```

---

## Standard 5: Section Comments

Use section comments to organize large files:

```javascript
// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Login user with credentials
 */
async function login(username, password) { }

/**
 * Logout current user
 */
function logout() { }

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * Refresh access token
 */
async function refreshAccessToken() { }
```

---

## Standard 6: TODO Comments

Use consistent TODO format:

```javascript
// TODO(username): Description of what needs to be done
// TODO(#123): Reference to GitHub issue
// FIXME: Known bug that needs attention
// HACK: Temporary workaround, explain why and when to remove
// NOTE: Important information for future developers
```

---

## Standard 7: Class Documentation

```javascript
/**
 * Modal component for editing client information
 *
 * @class
 * @description
 * Provides a Bootstrap modal interface for quick-editing client records.
 * Handles validation, API calls, and user feedback.
 *
 * @example
 * const modal = new ClientModal({
 *     onSave: (data) => refreshClientList(),
 *     onClose: () => console.log('Modal closed')
 * });
 * modal.open(clientData);
 */
class ClientModal {
    /**
     * Create a ClientModal instance
     *
     * @param {Object} options - Configuration options
     * @param {Function} [options.onSave] - Callback when save succeeds
     * @param {Function} [options.onClose] - Callback when modal closes
     * @param {string} [options.apiBaseUrl] - API base URL override
     */
    constructor(options = {}) {
```

---

## Standard 8: Event Handlers

Document event handlers with what triggers them and their effects:

```javascript
/**
 * Handle user activity event
 * Resets the inactivity timer when user interacts with the page
 *
 * @listens document#mousedown
 * @listens document#keypress
 * @listens document#scroll
 * @private
 */
function handleActivity() {
```

---

## Standard 9: API Response Shapes

Document expected response structures:

```javascript
/**
 * Fetch appointments from API
 *
 * @returns {Promise<AppointmentsResponse>}
 *
 * @typedef {Object} AppointmentsResponse
 * @property {boolean} success - Whether request succeeded
 * @property {Appointment[]} appointments - Array of appointments
 * @property {number} total - Total count
 *
 * @typedef {Object} Appointment
 * @property {string} id - Unique identifier
 * @property {string} clientName - Client's full name
 * @property {string} appointmentDateTime - ISO 8601 datetime
 * @property {string} status - 'pending' | 'assigned' | 'completed'
 */
async function fetchAppointments() {
```

---

## Standard 10: Error Handling Comments

Document error scenarios:

```javascript
/**
 * Refresh access token using refresh token
 *
 * @returns {Promise<boolean>} True if refresh succeeded
 *
 * @throws {Error} Never throws - returns false on failure
 *
 * @description
 * Error scenarios:
 * - No refresh token: Returns false, user must re-login
 * - Network error: Returns false, logged to console
 * - Invalid refresh token: Returns false, triggers logout
 * - Token rotation: New refresh token stored automatically
 */
async function refreshAccessToken() {
```

---

## Files Requiring Updates

Based on the review, these files need commenting improvements:

### Priority 1 (Critical):

1. **`js/auth/jwt-auth.js`**
   - Add proper file header
   - Add JSDoc to all functions
   - Document magic numbers as constants
   - Add @throws documentation
   - Add usage examples

### Priority 2 (Important):

2. **`dashboard.html` inline JavaScript**
   - Extract to separate file or add comprehensive comments
   - Document all functions with JSDoc
   - Replace magic numbers with named constants
   - Add section organization

3. **`js/components/client-modal.js`**
   - Complete constructor JSDoc
   - Add @throws to async methods
   - Document private methods

### Priority 3 (Recommended):

4. **`js/auth/session-manager.js`**
   - Add @throws to handleTimeout
   - Document updateActivity better

5. **`js/auth/permissions.js`**
   - Add @typedef for permission objects
   - Document the ROLE_PERMISSIONS structure

---

## Quick Reference Checklist

Before committing code, verify:

- [ ] File has JSDoc header with @fileoverview
- [ ] All public functions have JSDoc with @param and @returns
- [ ] Magic numbers are named constants with comments
- [ ] Complex logic has explanatory comments (why, not what)
- [ ] Error scenarios are documented
- [ ] Dependencies are listed in file header
- [ ] Usage examples provided where helpful
- [ ] TODOs include author/issue reference
