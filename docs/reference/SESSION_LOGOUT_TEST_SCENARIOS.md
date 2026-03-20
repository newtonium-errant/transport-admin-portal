# Session Logout Fix — Manual Browser Test Scenarios

These 5 manual test scenarios verify the 6 session logout bug fixes from the March 13, 2026 session (commit `0261b90`). Run these in Chrome with DevTools open (F12 > Console tab).

## Scenario 1: Token Refresh Before Expiry

**Related Fix:** #3 — Token refresh timer uses `setTimeout` scheduled 5min before expiry (replaced fixed 45-min `setInterval`).

**Prerequisites:**
- Logged in as any role (admin recommended for full access)
- DevTools Console open, filtered to `[Auth]` or `Token refresh`

**Steps:**
1. Log in to `dashboard.html`.
2. In DevTools Console, note the log: `Token refresh scheduled in X minutes`.
3. To test without waiting 55 minutes, override the expiry in Console:
   ```javascript
   // Set token to expire in 2 minutes (so refresh fires in ~0 seconds)
   sessionStorage.setItem('rrts_token_expiry', (Date.now() + 2 * 60 * 1000).toString());
   startTokenRefreshTimer();
   ```
4. Wait up to 2 minutes and watch the Console.

**Expected Result:**
- Console shows `Token refresh timer triggered` followed by `Access token refreshed successfully`.
- Console shows `Refresh token rotated successfully` (confirming new refresh token stored).
- Console shows a new `Token refresh scheduled in X minutes` (recursive re-schedule).
- User is NOT logged out. Dashboard remains visible and functional.

---

## Scenario 2: 401 Retry with Expired Token

**Related Fix:** #4 — APIClient 401 handler attempts `refreshAccessToken()` + retry before logout.

**Prerequisites:**
- Logged in as admin on `dashboard.html`
- DevTools Console open

**Steps:**
1. In DevTools Console, corrupt the access token:
   ```javascript
   sessionStorage.setItem('rrts_access_token', 'expired-invalid-token');
   ```
2. Navigate to `appointments-sl.html` (or any page that makes an API call on load).
3. Watch the Console for `[API]` prefixed messages.

**Expected Result:**
- Console shows `[API] Received 401, attempting token refresh...`
- Console shows `Access token refreshed successfully` (refresh token was still valid).
- The page loads data normally — appointments appear.
- User is NOT logged out.

**Failure case (if fix is missing):**
- User is immediately redirected to login screen on the 401 without any refresh attempt.

---

## Scenario 3: Dashboard Reload with Existing Session

**Related Fixes:** #1 — Shadow auth functions removed from `dashboard.html`. #2 — `requireAuth()` runs before `showDashboard()`.

**Prerequisites:**
- Logged in as admin on `dashboard.html`

**Steps:**
1. Verify the dashboard is showing (metrics, today's schedule visible).
2. Open DevTools Console and clear it.
3. Press F5 to reload the page (or close the tab and reopen `dashboard.html`).
4. Watch the Console during page load.

**Expected Result:**
- Console shows `[Auth] Inactivity check: X min inactive, 30 min timeout for admin` (proving `requireAuth()` ran).
- Dashboard loads normally with metrics and appointments.
- No duplicate `startTokenRefreshTimer` or `refreshAccessToken` function definitions appear (can verify with: type `startTokenRefreshTimer` in Console — should show the function from `jwt-auth.js`, not a local dashboard copy).

**Additional verification:**
1. In Console, run: `startTokenRefreshTimer.toString().substring(0, 80)`
2. Should show the function from `jwt-auth.js` (contains `window.tokenRefreshTimeout`), NOT a dashboard-local version.

---

## Scenario 4: Multi-Tab Session Behavior

**Related Fixes:** #5 — `expires_in` fallback (`|| 3600`). General token refresh stability.

**Prerequisites:**
- Logged in as admin

**Steps:**
1. Open `dashboard.html` in Tab 1.
2. Open `appointments-sl.html` in Tab 2 (right-click a nav link > Open in new tab).
3. Work in Tab 2 for a few minutes (filter appointments, open a modal, etc.).
4. Switch back to Tab 1.
5. Click a quick action or navigate to another page from Tab 1.
6. Repeat: switch between tabs several times over 5-10 minutes, interacting with each.

**Expected Result:**
- Both tabs maintain their session — neither logs out unexpectedly.
- API calls succeed in both tabs (data loads, modals populate).
- No `NaN` appears in Console logs related to token expiry (would indicate missing `expires_in` fallback).

**Verification:**
1. In either tab's Console, run: `sessionStorage.getItem('rrts_token_expiry')`
2. Result should be a valid numeric timestamp (not `NaN` or `null`).

---

## Scenario 5: profile.html SessionManager Start

**Related Fix:** #6 — `session-manager.js` loads after `jwt-auth.js` in `profile.html`.

**Prerequisites:**
- Logged in as any role (driver role is ideal since drivers redirect to profile.html)
- DevTools Console open

**Steps:**
1. Navigate to `profile.html`.
2. Watch the Console during page load for SessionManager-related messages.
3. In Console, verify SessionManager is running:
   ```javascript
   typeof SessionManager !== 'undefined' && SessionManager
   ```
4. Verify activity tracking is active by checking last activity timestamp:
   ```javascript
   sessionStorage.getItem('rrts_last_activity')
   ```
5. Click around the page (interact with form fields, buttons).
6. Re-check `rrts_last_activity` — it should have updated.

**Expected Result:**
- `SessionManager` is defined (not `undefined`).
- `rrts_last_activity` returns a valid timestamp string.
- After interaction, the timestamp updates to a more recent value.
- No console errors related to `SessionManager is not defined` or `jwt-auth` functions being undefined.

**Failure case (if fix is missing):**
- `session-manager.js` loads before `jwt-auth.js`, causing `SessionManager.start()` to fail silently because it depends on `JWTManager` which isn't defined yet.
