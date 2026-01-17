# RRTS Security Implementation Testing Checklist

Comprehensive testing checklist to verify all security improvements are working correctly.

---

## Pre-Testing Setup

Before starting tests:
- [ ] Backup current database (use ADMIN backup workflow)
- [ ] Backup n8n workflows (export all)
- [ ] Have test user credentials ready
- [ ] Have browser DevTools open (F12)
- [ ] Clear browser cache and sessionStorage
- [ ] Document any issues in separate file

---

## Phase 1: Database Testing

### Foreign Key CASCADE Delete
- [ ] Run query: `SELECT * FROM user_sessions;` (note count)
- [ ] Delete a test user: `DELETE FROM users WHERE username = 'test';`
- [ ] Run query: `SELECT * FROM user_sessions;` (verify sessions deleted)
- [ ] Verify no foreign key errors

### New Columns Exist
- [ ] Run: `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_sessions'`
- [ ] Verify columns: `refresh_token`, `user_id`, `role`, `created_at`
- [ ] Run: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
- [ ] Verify columns: `must_change_password`, `last_password_change`

### Test User Deletion
- [ ] Only legitimate users remain in `users` table
- [ ] Run: `SELECT username, email, role FROM users;`
- [ ] Verify your account exists
- [ ] Verify test accounts deleted

---

## Phase 2: n8n Workflow Testing

### USER - Create User (PBKDF2)
- [ ] Open workflow in n8n
- [ ] Test with data:
```json
{
  "username": "test.user@example.com",
  "email": "test.user@example.com",
  "password": "TestPassword123!",
  "full_name": "Test User",
  "role": "booking_agent",
  "is_active": true
}
```
- [ ] Verify success response
- [ ] Check database: `SELECT password_hash FROM users WHERE username = 'test.user@example.com';`
- [ ] Verify hash format: `<salt>:<hash>` (salt should be 32 chars hex)
- [ ] Verify `must_change_password = false`
- [ ] Verify `last_password_change` is set

### USER - Password Reset (PBKDF2)
- [ ] Open workflow in n8n
- [ ] Test with: `{"username": "test.user@example.com"}`
- [ ] Verify success response with temporary password
- [ ] Check database: `SELECT password_hash, must_change_password FROM users WHERE username = 'test.user@example.com';`
- [ ] Verify new hash format (different from before)
- [ ] Verify `must_change_password = true`

### USER - Login (JWT Generation)
- [ ] Open workflow in n8n
- [ ] Test with: `{"username": "your-username", "password": "your-password"}`
- [ ] Verify response includes:
  - `accessToken` (JWT format: `xxx.yyy.zzz`)
  - `refreshToken` (64-char hex string)
  - `expiresIn` (number in seconds)
  - `user` object (userId, username, role, email)
- [ ] Decode JWT at https://jwt.io
- [ ] Verify payload includes: userId, username, role, exp, iat
- [ ] Check database: `SELECT * FROM user_sessions WHERE username = 'your-username';`
- [ ] Verify refresh_token stored

### USER - Refresh Token
- [ ] Get refresh token from login response
- [ ] Test workflow with: `{"refreshToken": "xxx..."}`
- [ ] Verify response includes new `accessToken`
- [ ] Verify `expiresIn` matches role timeout
- [ ] Test with invalid token - should fail

### Login Rate Limiting
- [ ] Attempt login with wrong password 5 times
- [ ] Check database: `SELECT failed_login_attempts, locked_until FROM users WHERE username = 'test.user@example.com';`
- [ ] Verify `failed_login_attempts = 5`
- [ ] Verify `locked_until` is 15 minutes in future
- [ ] Attempt 6th login - should get "Account locked" error
- [ ] Wait 15 minutes (or manually clear: `UPDATE users SET locked_until = NULL WHERE...`)
- [ ] Login successfully
- [ ] Verify `failed_login_attempts` reset to 0

### JWT Validation (Protected Endpoints)
- [ ] Pick any protected workflow (e.g., APPT - Add New Appointments)
- [ ] Test WITHOUT Authorization header - expect 401
- [ ] Test WITH invalid JWT - expect 401
- [ ] Test WITH valid JWT - expect success
- [ ] Test WITH expired JWT - expect 401

### CSRF Header Validation
- [ ] Test protected endpoint without `X-Requested-With` header - expect 403
- [ ] Test with header: `X-Requested-With: XMLHttpRequest` - expect success

---

## Phase 3: Frontend Testing

### JWT Manager
- [ ] Open dashboard.html
- [ ] Open browser console (F12)
- [ ] Check: `typeof JWTManager` → should be "object"
- [ ] Login successfully
- [ ] Check sessionStorage:
```javascript
sessionStorage.getItem('rrts_access_token') // should have JWT
sessionStorage.getItem('rrts_refresh_token') // should have token
sessionStorage.getItem('rrts_token_expires') // should have timestamp
sessionStorage.getItem('rrts_user') // should have JSON
```
- [ ] Check: `JWTManager.isAuthenticated()` → should be `true`
- [ ] Check: `JWTManager.getCurrentUser()` → should return user object
- [ ] Navigate to another page (appointments-new.html)
- [ ] Verify no re-login required
- [ ] Logout
- [ ] Check: `JWTManager.isAuthenticated()` → should be `false`
- [ ] Verify all sessionStorage cleared

### Session Manager
- [ ] Login
- [ ] Check: `SessionManager.isActive()` → should be `true`
- [ ] Check timeout: `SessionManager.getCurrentTimeout() / 60000` → should match role (30/60/120 min)
- [ ] Wait for inactivity warning (5 min before timeout for admin)
- [ ] Verify warning appears
- [ ] Click "OK" to continue
- [ ] Verify timer reset
- [ ] OR wait for full timeout
- [ ] Verify auto-logout occurs
- [ ] Verify redirect to dashboard

### API Client
- [ ] Login
- [ ] Open browser console
- [ ] Test: `await APIClient.get('/get-operations-appointments')`
- [ ] Verify success (no errors)
- [ ] Check Network tab (DevTools)
- [ ] Verify request has:
  - `Authorization: Bearer xxx...`
  - `X-Requested-With: XMLHttpRequest`
- [ ] Logout
- [ ] Test: `await APIClient.get('/get-operations-appointments')`
- [ ] Should error: "No authentication token found"

### Dashboard Login Flow
- [ ] Clear sessionStorage
- [ ] Visit dashboard.html
- [ ] Verify login form shown
- [ ] Login with valid credentials
- [ ] Verify tokens stored (check sessionStorage)
- [ ] Verify dashboard shown (not login form)
- [ ] Verify session timer started
- [ ] Refresh page
- [ ] Verify still logged in (no re-login)

### Protected Page Access
- [ ] Logout completely
- [ ] Try to visit appointments-new.html directly
- [ ] Should redirect to dashboard.html
- [ ] Login
- [ ] Visit appointments-new.html
- [ ] Should load successfully

### API Calls with JWT
- [ ] Login
- [ ] Go to appointments-new.html
- [ ] Click "Refresh" or load appointments
- [ ] Open Network tab
- [ ] Find request to `/get-operations-appointments`
- [ ] Click request → Headers tab
- [ ] Verify `Authorization: Bearer xxx...` header present
- [ ] Verify `X-Requested-With: XMLHttpRequest` present
- [ ] Verify request succeeds (200 OK)

---

## Phase 4: Cloudflare Testing

### DNS & SSL
- [ ] Visit site: `http://your-domain.com` (no s)
- [ ] Verify auto-redirect to `https://`
- [ ] Click padlock in address bar
- [ ] Verify certificate valid
- [ ] Verify "Connection is secure"
- [ ] Check certificate issuer (Cloudflare or Let's Encrypt)

### Rate Limiting
Test login rate limiting:
```bash
# Run this command 11 times quickly
for i in {1..11}; do
  curl -X POST https://your-domain.com/webhook/user-login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n"
done
```
- [ ] Requests 1-10: HTTP 200 (or 400 if wrong password)
- [ ] Request 11: HTTP 429 or 403 (rate limited)
- [ ] Wait 15 minutes, try again - should work

Test API rate limiting:
```bash
# Make 101 requests quickly
for i in {1..101}; do
  curl https://your-domain.com/webhook/get-active-clients \
    -w "\nStatus: %{http_code}\n"
  sleep 0.1
done
```
- [ ] Request 101: Should be blocked (HTTP 429)

### Security Headers
- [ ] Visit: https://securityheaders.com
- [ ] Enter your domain
- [ ] Run scan
- [ ] Verify grade: B or higher
- [ ] Verify headers present:
  - Strict-Transport-Security (if HSTS enabled)
  - X-Content-Type-Options
  - X-Frame-Options

### Performance
- [ ] Visit: https://developers.google.com/speed/pagespeed/insights/
- [ ] Enter your domain
- [ ] Run test
- [ ] Verify mobile score: 80+
- [ ] Verify desktop score: 90+

---

## Integration Testing

### Complete User Journey
1. **Login**
   - [ ] Visit dashboard.html
   - [ ] Login with valid credentials
   - [ ] Verify JWT tokens stored
   - [ ] Verify session timer started
   - [ ] Verify dashboard loads

2. **Navigate to Appointments**
   - [ ] Click "Appointments" in header/navigation
   - [ ] Verify page loads without re-login
   - [ ] Verify appointments list loads (API call succeeds)

3. **Create Appointment**
   - [ ] Click "Add Appointment"
   - [ ] Fill form, submit
   - [ ] Verify appointment created (check Network tab for JWT header)

4. **Edit Appointment**
   - [ ] Click existing appointment
   - [ ] Modify details, save
   - [ ] Verify update succeeds

5. **Delete Appointment**
   - [ ] Click delete on appointment
   - [ ] Confirm deletion
   - [ ] Verify deletion succeeds

6. **Session Timeout**
   - [ ] Wait for inactivity (or manually set short timeout for testing)
   - [ ] Verify warning appears
   - [ ] Let it timeout OR click continue

7. **Logout**
   - [ ] Click logout button
   - [ ] Verify redirect to login
   - [ ] Verify tokens cleared
   - [ ] Try to access appointments page
   - [ ] Verify redirect back to login

### Role-Based Access Control
For each role (admin, supervisor, booking_agent):

- [ ] Login with that role
- [ ] Verify timeout matches role (30/60/120 min)
- [ ] Try to access allowed pages - should work
- [ ] Try to access forbidden pages - should redirect
- [ ] Try admin-only operations (e.g., delete user)
  - Admin: should work
  - Others: should fail with 403

### Token Refresh
- [ ] Login as admin (30 min timeout)
- [ ] Wait 26 minutes (or manually adjust token expiry in sessionStorage)
- [ ] Make API call (e.g., load appointments)
- [ ] Open Network tab
- [ ] Verify `/refresh-token` called automatically
- [ ] Verify new access token received
- [ ] Verify API call succeeds with new token

---

## Security Testing (Penetration)

### Authentication Bypass Attempts
- [ ] Try to access `/webhook/delete-appointment` without JWT
  - Expected: 401 Unauthorized
- [ ] Try with fake JWT: `Bearer fake.token.here`
  - Expected: 401 Unauthorized
- [ ] Try with expired JWT (modify `exp` claim)
  - Expected: 401 Unauthorized
- [ ] Try with tampered JWT (change role in payload)
  - Expected: 401 Unauthorized (signature invalid)

### Authorization Bypass Attempts
- [ ] Login as booking_agent
- [ ] Get JWT token
- [ ] Try to call `/delete-user` endpoint
  - Expected: 403 Forbidden (insufficient permissions)
- [ ] Try to call `/update-driver` endpoint
  - Expected: 403 Forbidden

### CSRF Attempts
- [ ] Create test HTML file on different domain
```html
<form action="https://your-domain.com/webhook/delete-appointment" method="POST">
  <input name="id" value="123">
  <button>Submit</button>
</form>
<script>document.forms[0].submit()</script>
```
- [ ] Open file in browser while logged into RRTS
- [ ] Expected: Request fails (no custom header)

### Session Hijacking Attempts
- [ ] Login, get JWT token
- [ ] Logout
- [ ] Try to use old token
  - Expected: 401 (token still valid until expiry, but refresh token deleted)
  - Note: Tokens remain valid until expiry (by design for stateless JWT)

### SQL Injection Attempts
- [ ] Try login with username: `admin' OR '1'='1`
  - Expected: Login fails (parameterized queries prevent injection)
- [ ] Try username: `'; DROP TABLE users; --`
  - Expected: Login fails safely

### Rate Limit Bypass Attempts
- [ ] Get rate limited on login endpoint
- [ ] Try from different IP address
  - Expected: Works (rate limit is per-IP)
- [ ] Try with VPN/proxy
  - Expected: Rate limit resets (new IP)
- [ ] Note: This is expected behavior (IP-based rate limiting)

---

## Performance Testing

### Load Times
- [ ] Clear browser cache
- [ ] Visit dashboard.html
- [ ] Open DevTools → Network tab
- [ ] Check "DOMContentLoaded" time
  - Target: < 2 seconds
- [ ] Check "Load" time
  - Target: < 3 seconds

### API Response Times
- [ ] Open Network tab
- [ ] Load appointments page
- [ ] Check `/get-operations-appointments` response time
  - Target: < 1 second
- [ ] Create appointment
- [ ] Check `/save-appointment` response time
  - Target: < 2 seconds

### Token Refresh Impact
- [ ] Trigger token refresh (wait near expiry)
- [ ] Measure refresh time in Network tab
  - Target: < 500ms
- [ ] Verify no user-visible delay

---

## Browser Compatibility Testing

Test in these browsers:

### Chrome/Edge
- [ ] Login works
- [ ] JWT stored correctly
- [ ] Session timeout works
- [ ] All API calls succeed
- [ ] HTTPS enforced

### Firefox
- [ ] Same tests as Chrome

### Safari (macOS/iOS)
- [ ] Same tests as Chrome
- [ ] Verify sessionStorage works (Safari has privacy restrictions)

### Mobile (Chrome/Safari)
- [ ] Login on mobile
- [ ] Navigate pages
- [ ] Create/edit appointment
- [ ] Session timeout warning shows correctly
- [ ] Responsive header menu works

---

## Error Handling Testing

### Network Errors
- [ ] Disconnect internet
- [ ] Try to login
- [ ] Verify error message shown
- [ ] Try to load appointments
- [ ] Verify error message shown

### Server Errors
- [ ] Temporarily disable n8n workflow
- [ ] Try to call endpoint
- [ ] Verify graceful error handling
- [ ] Verify user sees meaningful error message

### Token Expiry During Operation
- [ ] Start creating appointment
- [ ] Wait for token to expire (or manually delete)
- [ ] Submit form
- [ ] Verify either:
  - Auto-refresh works, submission succeeds
  - OR clear error message + redirect to login

---

## Rollback Testing (Disaster Recovery)

### Database Rollback
- [ ] Restore database from backup
- [ ] Verify users table restored
- [ ] Verify user_sessions table restored
- [ ] Login still works

### Workflow Rollback
- [ ] Export current workflows (backup)
- [ ] Import old workflow versions
- [ ] Test login (should work with old workflow)
- [ ] Re-import new workflows
- [ ] Test login (should work with new workflow)

### Frontend Rollback
- [ ] Remove jwt-manager.js, session-manager.js, api-client.js
- [ ] Revert dashboard.html login function
- [ ] Test login (should work with old code)
- [ ] Note: This tests that rollback is possible if needed

---

## Final Verification Checklist

Before declaring implementation complete:

**Security:**
- [ ] All passwords hashed with PBKDF2
- [ ] JWT tokens required for protected endpoints
- [ ] CSRF protection active
- [ ] Rate limiting active
- [ ] HTTPS enforced
- [ ] Session timeouts working
- [ ] Authorization checks working

**Functionality:**
- [ ] Login works
- [ ] Logout works
- [ ] Session persists across page loads
- [ ] Session expires after inactivity
- [ ] Token refresh works automatically
- [ ] All API calls succeed with JWT
- [ ] No broken pages

**Performance:**
- [ ] Page load times acceptable
- [ ] API response times acceptable
- [ ] No noticeable delay from JWT refresh

**User Experience:**
- [ ] No unexpected logouts
- [ ] Timeout warnings give adequate notice
- [ ] Error messages are clear
- [ ] Mobile experience smooth

**Documentation:**
- [ ] Implementation plan followed
- [ ] All code documented
- [ ] Testing results recorded
- [ ] Rollback procedures documented

---

## Issues Log Template

If you find issues, document them here:

```
Issue #1: [Title]
Date: [Date]
Severity: [Critical/High/Medium/Low]
Description: [What happened]
Steps to Reproduce:
  1. [Step 1]
  2. [Step 2]
Expected: [What should happen]
Actual: [What actually happened]
Fix Applied: [What you did to fix it]
Status: [Open/Fixed/Won't Fix]
```

---

## Sign-Off

When all tests pass:

**Tested by:** ___________________
**Date:** ___________________
**Result:** PASS / FAIL
**Notes:** ___________________

---

## Next Steps After Testing

- [ ] Document any deviations from plan
- [ ] Update CLAUDE.md with new patterns
- [ ] Train team on new login/session behavior
- [ ] Monitor for 1 week for issues
- [ ] Plan Phase 6: MFA implementation (future)

**Implementation Complete!** 🎉
