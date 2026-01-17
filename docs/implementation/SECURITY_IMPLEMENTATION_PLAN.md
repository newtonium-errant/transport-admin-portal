# RRTS Security Implementation Plan

**Project:** Rural Route Transportation Services - Admin Portal
**Date:** January 2025
**Status:** Ready for Implementation

---

## Executive Summary

This document outlines the complete security implementation plan for the RRTS Admin Portal. The plan addresses critical security vulnerabilities identified in the security audit and provides a phased approach to implementing enterprise-grade authentication and authorization.

**Timeline:** 5 phases, estimated 2-3 days for full implementation and testing.

---

## Security Vulnerabilities Identified

### Critical Issues

1. **Weak Password Hashing** - Create User and Password Reset workflows use custom bit-shift hashing instead of industry-standard PBKDF2
2. **No JWT Authentication** - Backend doesn't verify user identity after initial login
3. **Client-Side Only RBAC** - User roles stored in sessionStorage can be manipulated
4. **No Session Expiry** - Sessions persist indefinitely with no timeout
5. **No HTTPS Enforcement** - Application accessible over insecure HTTP
6. **No Rate Limiting** - Vulnerable to brute force attacks
7. **No CSRF Protection** - Vulnerable to cross-site request forgery attacks

### Security Goals

- ✅ Implement JWT-based authentication with refresh tokens
- ✅ Standardize on PBKDF2 password hashing (100,000 iterations, SHA-512)
- ✅ Add role-based session timeouts (30/60/120 minutes)
- ✅ Enforce HTTPS with HSTS
- ✅ Implement rate limiting (Cloudflare + application-level)
- ✅ Add CSRF protection via custom headers
- ✅ Clean up test users and fix database constraints

---

## Implementation Phases

### Phase 1: Database Updates

**Objective:** Update database schema to support JWT authentication and fix foreign key constraints.

**Tasks:**
1. Fix `user_sessions` foreign key to allow CASCADE deletes
2. Delete test users from database
3. Add JWT/session columns to `user_sessions` table
4. Add password management columns to `users` table

**Files:**
- `sql/01_fix_foreign_key_and_delete_test_users.sql`
- `sql/02_add_jwt_session_columns.sql`
- `sql/README.md`

**Execution:**
1. Backup database (use ADMIN workflow backup feature)
2. Run SQL scripts in Supabase SQL Editor in order
3. Verify columns added successfully
4. Verify test users deleted

**Estimated Time:** 15 minutes

**See:** `sql/README.md` for detailed instructions

---

### Phase 2: n8n Workflow Updates

**Objective:** Update n8n workflows to use PBKDF2 hashing, generate/validate JWTs, and implement rate limiting.

**Workflows to Update:**

1. **USER - Create User** - Replace custom hash with PBKDF2
2. **USER - Password Reset** - Replace custom hash with PBKDF2
3. **USER - Login** - Add JWT generation and refresh token creation
4. **USER - Refresh Token** - NEW workflow to refresh access tokens
5. **All Protected Endpoints** - Add JWT validation (10+ workflows)

**Files:**
- `n8n-updates/PBKDF2_Hash_Function.js` - Reusable PBKDF2 code
- `n8n-updates/JWT_Generation_Code.js` - JWT creation logic
- `n8n-updates/JWT_Validation_Code.js` - JWT verification logic
- `n8n-updates/WORKFLOW_UPDATE_GUIDE.md` - Step-by-step instructions

**Key Changes:**
- Standardize password hashing across all workflows
- Generate JWT access tokens with role-based expiration
- Generate 64-char hex refresh tokens (7-day expiry)
- Store refresh tokens in database
- Validate JWT on all protected endpoints
- Check CSRF header (X-Requested-With) on all protected endpoints
- Enhanced login rate limiting (5 attempts → 15 min lockout)

**Estimated Time:** 2-3 hours

**See:** `n8n-updates/WORKFLOW_UPDATE_GUIDE.md` for detailed instructions

---

### Phase 3: Frontend Integration

**Objective:** Integrate JWT authentication and session management into frontend pages.

**New JavaScript Modules:**

1. **jwt-manager.js** (317 lines)
   - Store/retrieve JWT tokens from sessionStorage
   - Automatic token refresh before expiration
   - Token validation and decoding
   - User info management

2. **session-manager.js** (254 lines)
   - Role-based inactivity timeouts
   - Activity event monitoring (mouse, keyboard, touch)
   - Warning before timeout (5 minutes)
   - Auto-logout on timeout

3. **api-client.js** (344 lines)
   - Authenticated API request wrapper
   - Automatic JWT injection in headers
   - CSRF header inclusion
   - Convenience functions (AppointmentsAPI, ClientsAPI, etc.)

**Pages to Update:**
- dashboard.html (login page)
- appointments-new.html
- client-management.html
- appointment-management.html
- driver-management.html
- operations.html
- admin.html

**Key Changes:**
- Replace direct fetch() calls with APIClient methods
- Update login function to use JWTManager.storeTokens()
- Update logout function to clear tokens and stop session
- Add authentication check on page load
- Start SessionManager after successful login

**Estimated Time:** 2-3 hours

**See:** `frontend-updates/FRONTEND_INTEGRATION_GUIDE.md` for detailed instructions

---

### Phase 4: Cloudflare Setup

**Objective:** Configure Cloudflare for HTTPS enforcement, rate limiting, and DDoS protection.

**Configuration Steps:**

1. **Add Site to Cloudflare** (Free tier)
2. **Update DNS Records** - Point domain to GitHub Pages
3. **Change Nameservers** at domain registrar
4. **Configure SSL/TLS**
   - Encryption mode: Full (Strict)
   - Always Use HTTPS: ON
   - HSTS: Enabled (12 months)
   - Minimum TLS: 1.2

5. **Configure Rate Limiting**
   - Login endpoint: 10 requests/5 min per IP
   - API endpoints: 100 requests/1 min per IP

6. **Configure Firewall Rules** (optional)
   - Block bad bots (score < 30)
   - Challenge suspicious traffic (threat score > 10)
   - Geo-blocking (if applicable)

7. **Performance Settings**
   - Auto Minify: JS, CSS, HTML
   - Brotli compression: ON
   - Caching: Standard

8. **Update GitHub Pages Custom Domain**

**Estimated Time:** 1-2 hours (including DNS propagation)

**See:** `cloudflare-setup/CLOUDFLARE_SETUP_GUIDE.md` for detailed instructions

---

### Phase 5: Testing & Verification

**Objective:** Comprehensively test all security improvements to ensure they work correctly.

**Testing Categories:**

1. **Database Testing**
   - Verify CASCADE delete works
   - Verify new columns exist
   - Verify test users deleted

2. **n8n Workflow Testing**
   - Test PBKDF2 hashing in Create User
   - Test PBKDF2 hashing in Password Reset
   - Test JWT generation on login
   - Test JWT validation on protected endpoints
   - Test refresh token workflow
   - Test login rate limiting
   - Test CSRF header validation

3. **Frontend Testing**
   - Test JWT storage and retrieval
   - Test session timeout warnings
   - Test auto-logout on inactivity
   - Test token auto-refresh
   - Test API calls with JWT
   - Test logout (token clearing)
   - Test protected page access

4. **Cloudflare Testing**
   - Verify HTTPS enforcement
   - Verify SSL certificate valid
   - Test rate limiting rules
   - Check security headers
   - Test performance (PageSpeed, SecurityHeaders.com)

5. **Integration Testing**
   - Complete user journey (login → navigate → CRUD → timeout → logout)
   - Role-based access control
   - Token refresh during long session

6. **Security Testing (Penetration)**
   - Authentication bypass attempts
   - Authorization bypass attempts
   - CSRF attempts
   - SQL injection attempts
   - Rate limit bypass attempts

7. **Performance Testing**
   - Page load times
   - API response times
   - Token refresh impact

8. **Browser Compatibility**
   - Chrome/Edge
   - Firefox
   - Safari (desktop/mobile)
   - Mobile browsers

**Estimated Time:** 4-6 hours

**See:** `testing/SECURITY_TESTING_CHECKLIST.md` for comprehensive checklist (600+ test points)

---

## Implementation Order

Execute phases in this exact order:

```
1. Phase 1: Database ──→ 2. Phase 2: n8n Workflows ──→ 3. Phase 3: Frontend
                                                            │
                                                            ↓
                                        5. Phase 5: Testing ←── 4. Phase 4: Cloudflare
```

**Why This Order:**
- Database must be updated before workflows can use new columns
- Workflows must be updated before frontend can use JWT authentication
- Frontend and Cloudflare can be done in parallel if needed
- Testing must be last to verify entire system

---

## Rollback Plan

If issues arise during implementation:

### Phase 1 Rollback (Database)
```sql
-- Restore from backup
-- Or manually revert:
ALTER TABLE user_sessions DROP COLUMN refresh_token;
ALTER TABLE users DROP COLUMN must_change_password;
-- etc.
```

### Phase 2 Rollback (n8n)
1. Export current workflows (backup)
2. Import previous workflow versions
3. Test login still works

### Phase 3 Rollback (Frontend)
1. Remove new JavaScript files (jwt-manager.js, session-manager.js, api-client.js)
2. Revert dashboard.html login function to previous version
3. Revert API calls to direct fetch()

### Phase 4 Rollback (Cloudflare)
1. Remove custom domain from GitHub Pages
2. Change nameservers back to registrar defaults
3. Wait for DNS propagation

---

## Security Configuration Reference

### JWT Settings

```javascript
JWT_SECRET: '[64-char random string]' // Store in n8n environment variables
ACCESS_TOKEN_EXPIRATION: {
  admin: 30 minutes,
  supervisor: 60 minutes,
  booking_agent: 120 minutes,
  driver: 120 minutes,
  client: 120 minutes
}
REFRESH_TOKEN_EXPIRATION: 7 days
REFRESH_BUFFER: 5 minutes (auto-refresh before expiry)
```

### Password Security

```javascript
HASH_ALGORITHM: 'PBKDF2'
HASH_FUNCTION: 'SHA-512'
ITERATIONS: 100000
SALT_LENGTH: 16 bytes (32 hex chars)
HASH_LENGTH: 64 bytes (128 hex chars)
FORMAT: '<salt>:<hash>'
```

### Session Timeouts

| Role           | Timeout     | Warning Before |
|----------------|-------------|----------------|
| admin          | 30 minutes  | 5 minutes      |
| supervisor     | 60 minutes  | 5 minutes      |
| booking_agent  | 120 minutes | 5 minutes      |
| driver         | 120 minutes | 5 minutes      |
| client         | 120 minutes | 5 minutes      |

### Rate Limiting

**Cloudflare Rules:**
- Login endpoint: 10 requests per 5 minutes per IP
- API endpoints: 100 requests per minute per IP
- Action: Block for 15 minutes

**Application-Level (n8n):**
- Failed login attempts: 5 attempts → 15 minute account lockout
- Counter resets on successful login

### CSRF Protection

**Method:** Custom header validation
**Header:** `X-Requested-With: XMLHttpRequest`
**Applied to:** All protected endpoints
**Response if missing:** 403 Forbidden

---

## Post-Implementation Checklist

After completing all phases:

### Security Verification
- [ ] All passwords hashed with PBKDF2
- [ ] JWT tokens required for protected endpoints
- [ ] CSRF protection active
- [ ] Rate limiting active (Cloudflare + application)
- [ ] HTTPS enforced
- [ ] Session timeouts working
- [ ] Authorization checks working

### Functionality Verification
- [ ] Login works
- [ ] Logout works
- [ ] Session persists across page loads
- [ ] Session expires after inactivity
- [ ] Token refresh works automatically
- [ ] All API calls succeed with JWT
- [ ] No broken pages

### Performance Verification
- [ ] Page load times acceptable (< 3 seconds)
- [ ] API response times acceptable (< 2 seconds)
- [ ] No noticeable delay from JWT refresh

### User Experience Verification
- [ ] No unexpected logouts
- [ ] Timeout warnings give adequate notice
- [ ] Error messages are clear
- [ ] Mobile experience smooth

### Documentation
- [ ] Implementation completed as planned
- [ ] All code documented
- [ ] Testing results recorded
- [ ] Issues logged and resolved

---

## Monitoring & Maintenance

### Daily Monitoring (First Week)
- Check Cloudflare Analytics for blocked requests
- Monitor failed login attempts
- Check for 401/403 errors in browser console
- Verify no user complaints about timeouts

### Weekly Monitoring (First Month)
- Review Cloudflare analytics
- Check user_sessions table for orphaned sessions
- Verify refresh tokens being cleaned up (>7 days old)
- Review failed login attempts for patterns

### Monthly Maintenance
- Review and adjust rate limiting rules if needed
- Update JWT_SECRET if compromised (rare)
- Audit user accounts for inactive users
- Review security headers scores
- Update dependencies (n8n, Cloudflare config)

---

## Future Enhancements (Phase 6+)

Consider implementing in future iterations:

1. **Multi-Factor Authentication (MFA)**
   - TOTP-based (Google Authenticator, Authy)
   - SMS backup codes
   - Required for admin role

2. **Password Policies**
   - Minimum length: 12 characters
   - Complexity requirements
   - Password history (prevent reuse of last 5)
   - Expiration: 90 days for admin, 180 days for others

3. **Advanced Logging**
   - Log all authentication attempts
   - Log all authorization failures
   - Log all sensitive operations (delete user, etc.)
   - Store logs in separate table/service

4. **IP Whitelisting**
   - Restrict admin access to known IP ranges
   - Cloudflare Access for VPN-like protection

5. **API Key Management**
   - Generate API keys for third-party integrations
   - Key rotation and expiration

6. **Security Monitoring**
   - Integrate with SIEM (Security Information and Event Management)
   - Set up alerts for suspicious activity
   - Automated threat detection

---

## Support & Resources

### Documentation
- `sql/README.md` - Database update instructions
- `n8n-updates/WORKFLOW_UPDATE_GUIDE.md` - n8n workflow update instructions
- `frontend-updates/FRONTEND_INTEGRATION_GUIDE.md` - Frontend integration instructions
- `cloudflare-setup/CLOUDFLARE_SETUP_GUIDE.md` - Cloudflare setup instructions
- `testing/SECURITY_TESTING_CHECKLIST.md` - Comprehensive testing checklist

### Code Files
- `sql/01_fix_foreign_key_and_delete_test_users.sql`
- `sql/02_add_jwt_session_columns.sql`
- `n8n-updates/PBKDF2_Hash_Function.js`
- `n8n-updates/JWT_Generation_Code.js`
- `n8n-updates/JWT_Validation_Code.js`
- `jwt-manager.js`
- `session-manager.js`
- `api-client.js`

### External Resources
- JWT.io - Decode and verify JWTs
- SecurityHeaders.com - Check security headers
- PageSpeed Insights - Test performance
- Cloudflare Docs - https://developers.cloudflare.com/
- n8n Docs - https://docs.n8n.io/

---

## Sign-Off

**Implementation Started:** ___________________
**Implementation Completed:** ___________________
**Tested By:** ___________________
**Approved By:** ___________________
**Date:** ___________________

**Notes:**
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

---

## Implementation Status

| Phase | Status | Completed Date | Notes |
|-------|--------|----------------|-------|
| Phase 1: Database | ⏳ Pending | | |
| Phase 2: n8n Workflows | ⏳ Pending | | |
| Phase 3: Frontend | ⏳ Pending | | |
| Phase 4: Cloudflare | ⏳ Pending | | |
| Phase 5: Testing | ⏳ Pending | | |

**Legend:**
- ⏳ Pending - Not started
- 🚧 In Progress - Currently working on
- ✅ Completed - Finished and tested
- ❌ Blocked - Issue preventing progress

---

**End of Implementation Plan**

For questions or issues during implementation, refer to the detailed guides in each phase folder or create a documentation/issues log.
