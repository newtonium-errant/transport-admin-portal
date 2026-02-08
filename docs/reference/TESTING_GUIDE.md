# RRTS Testing Guide

## Overview

The RRTS application requires thorough testing across multiple user roles, browsers, and scenarios to ensure RBAC is enforced and functionality works correctly.

## Role-Based Testing Checklist

Test each feature with **all applicable roles** to verify permissions:

### Admin Role
- ✅ Full system access
- ✅ User management (create, update, delete users)
- ✅ All appointment operations
- ✅ All client operations
- ✅ All driver operations
- ✅ Driver assignment
- ✅ Cost field visibility
- ✅ Admin dashboard access
- ✅ Audit log access

### Supervisor Role
- ✅ Client management (create, update, delete)
- ✅ Appointment management (create, update, delete)
- ✅ Driver management (create, update)
- ✅ Driver assignment
- ✅ Cost field visibility
- ❌ User management (no access)
- ❌ Admin dashboard (no access)

### Booking Agent Role
- ✅ Client management (create, update only - no delete)
- ✅ Appointment management (create, update only)
- ❌ Driver assignment (fields hidden)
- ❌ Delete clients
- ❌ Delete appointments
- ❌ Cost field visibility (hidden)
- ❌ User management
- ❌ Admin dashboard

### Driver Role
- ✅ View own appointments only
- ❌ All other operations (read-only access)

### Client Role
- ✅ View own appointments only
- ❌ All other operations (read-only access)

## Page Load Testing

For each page, verify:

### 1. Authentication Check
```javascript
// Should redirect to login if not authenticated
// Should stay on page if authenticated with correct role
```

### 2. Data Loading
- [ ] Page loads without console errors
- [ ] Skeleton loaders display (for -sl pages)
- [ ] Data loads and populates correctly
- [ ] No infinite loading states
- [ ] Error handling for failed API calls

### 3. RBAC Enforcement
- [ ] Navigation menu shows correct links for role
- [ ] Unauthorized features hidden (buttons, links, sections)
- [ ] Cost fields hidden for booking_agent
- [ ] Driver assignment hidden for booking_agent
- [ ] Admin-only features hidden for non-admins

### 4. Session Management
- [ ] Session timeout works (role-based duration)
- [ ] Warning appears 5 min before timeout
- [ ] Activity resets timer
- [ ] Logout clears sessionStorage

## API Testing

### Happy Path Testing

**For each endpoint:**

#### 1. Valid Input Test
```javascript
// Test with all required fields
const validData = {
    knumber: "K1234",
    firstname: "John",
    lastname: "Doe",
    // ... all required fields
};

const result = await ClientsAPI.add(validData);
assert(result.success === true);
assert(result.data.knumber === "K1234");
```

#### 2. Response Format
- [ ] Returns `{ success: true, data: {...}, message: string }`
- [ ] HTTP status code 200 or 201
- [ ] Data structure matches expected format

### Validation Testing

**For each endpoint:**

#### 1. Missing Required Fields
```javascript
// Test with missing knumber
const invalidData = {
    firstname: "John",
    // knumber missing
};

try {
    await ClientsAPI.add(invalidData);
    assert.fail('Should have thrown error');
} catch (error) {
    assert(error.status === 400);
    assert(error.message.includes('knumber'));
}
```

#### 2. Invalid Data Types
- [ ] String where number expected
- [ ] Number where string expected
- [ ] Invalid format (email, phone, postal code)

#### 3. Business Rule Violations
- [ ] Duplicate K number
- [ ] Past appointment date
- [ ] Invalid status transition

### Error Handling Testing

#### 1. Network Failures
```javascript
// Simulate offline
window.navigator.onLine = false;

try {
    await ClientsAPI.getAll();
} catch (error) {
    assert(error.message.includes('network'));
}
```

#### 2. 401 Unauthorized
- [ ] Expired token → auto-logout
- [ ] Invalid token → redirect to login
- [ ] Missing token → redirect to login

#### 3. 403 Forbidden
- [ ] Role lacks permission → error message
- [ ] Limited token on wrong endpoint → error

#### 4. 500 Server Error
- [ ] Graceful error handling
- [ ] User-friendly error message
- [ ] Error logged to console

### RBAC Testing

**For each protected endpoint:**

#### 1. Authorized Access
```javascript
// Admin accessing user management
loginAs('admin');
const users = await UsersAPI.getAll();
assert(users.length > 0);
```

#### 2. Unauthorized Access
```javascript
// Booking agent trying to access user management
loginAs('booking_agent');

try {
    await UsersAPI.getAll();
    assert.fail('Should have rejected');
} catch (error) {
    assert(error.status === 403);
}
```

## Frontend Component Testing

### AppointmentModal Tests

#### 1. Add Mode
- [ ] Modal opens in add mode
- [ ] All fields empty
- [ ] Client dropdown populated
- [ ] Clinic dropdown populated
- [ ] Driver dropdown populated (if admin/supervisor)
- [ ] Driver fields hidden (if booking_agent)
- [ ] Save button enabled
- [ ] Delete button hidden

#### 2. Edit Mode
- [ ] Modal opens with appointment data
- [ ] All fields populated correctly
- [ ] Save button enabled
- [ ] Delete button visible (if admin/supervisor)
- [ ] Delete button hidden (if booking_agent)

#### 3. View Mode
- [ ] Modal opens with appointment data
- [ ] All fields readonly
- [ ] Save button hidden
- [ ] Delete button hidden

#### 4. Auto-Population
- [ ] Duration loads from client.default_appointment_length
- [ ] Transit time loads from client.clinic_travel_times
- [ ] Pickup address loads correctly

#### 5. Pre-Selection
- [ ] Client pre-selects after modal.open() completes
- [ ] No race condition errors

### ClientModal Tests

#### 1. Field Validation
- [ ] Phone number format validation
- [ ] Email format validation
- [ ] Postal code format validation (A1B 2C3)

#### 2. Address Handling
- [ ] Primary address saves correctly
- [ ] Secondary address saves correctly
- [ ] Address changes trigger travel time recalculation

## Common Test Scenarios

### Appointment Management

#### Create Appointment
1. Navigate to appointments-sl.html
2. Click "Add Appointment"
3. Select client from dropdown
4. Select clinic from dropdown
5. Verify duration auto-populates
6. Verify transit time auto-populates
7. Select date and time
8. Click "Save"
9. Verify success message
10. Verify appointment appears in list

#### Edit Appointment
1. Click appointment in list
2. Modal opens in edit mode
3. Change appointment time
4. Click "Save"
5. Verify success message
6. Verify time updated in list

#### Delete Appointment
1. Click appointment in list
2. Click "Delete" button
3. Confirm deletion
4. Verify success message
5. Verify appointment removed from list
6. Verify removed from Google Calendar

#### Assign Driver
1. Open appointment in edit mode
2. Select driver from dropdown (admin/supervisor only)
3. Click "Save"
4. Verify driver assigned
5. Verify Google Calendar event created/updated

### Client Management

#### Create Client
1. Navigate to clients-sl.html
2. Click "Add Client"
3. Fill all required fields
4. Click "Save"
5. Verify K number generated/assigned
6. Verify client appears in list

#### Update Client Address
1. Click client in list
2. Update primary address
3. Click "Save"
4. Verify travel times recalculated
5. Verify changes persist

#### Deactivate Client
1. Click client in list
2. Uncheck "Active" checkbox
3. Click "Save"
4. Filter to "Active Clients Only"
5. Verify client no longer appears

### User Management (Admin Only)

#### Create User
1. Navigate to admin.html
2. Click "Create User"
3. Fill username, password, role, full name
4. Click "Create"
5. Verify user created
6. Verify can login with credentials

#### Reset Password
1. Click user in list
2. Click "Reset Password"
3. Verify limited token generated
4. Login with limited token
5. Verify redirected to change-password
6. Change password
7. Verify full access granted

## Browser Compatibility Testing

Test in the following browsers:

- [ ] **Chrome** (latest) - Primary browser
- [ ] **Firefox** (latest)
- [ ] **Safari** (latest) - macOS and iOS
- [ ] **Edge** (latest)
- [ ] **Mobile Safari** (iOS) - Responsive design
- [ ] **Chrome Mobile** (Android) - Responsive design

**Key Areas for Browser Testing:**
- Date/time pickers
- Dropdown selects
- Modal dialogs
- LocalStorage/sessionStorage
- Fetch API

## Performance Testing

### 1. Page Load Time
- [ ] Initial load < 500ms (with amalgamated workflow)
- [ ] Cached load < 100ms (with LocalStorage)
- [ ] Skeleton loaders appear immediately

### 2. API Response Time
- [ ] Individual endpoint < 300ms
- [ ] Bulk operations < 1000ms
- [ ] No timeout errors

### 3. Memory Usage
- [ ] No memory leaks (check with DevTools)
- [ ] LocalStorage size reasonable (< 5MB)

### 4. Network Throttling
- [ ] Test with "Slow 3G" in DevTools
- [ ] Verify loading states appear
- [ ] Verify no timeouts

## QA Testing Workflow

### 1. Create Test Users
```sql
-- Create one user for each role
INSERT INTO users (username, password_hash, role, full_name, active)
VALUES
  ('admin@test.com', 'salt:hash', 'admin', 'Admin Test', true),
  ('supervisor@test.com', 'salt:hash', 'supervisor', 'Supervisor Test', true),
  ('agent@test.com', 'salt:hash', 'booking_agent', 'Agent Test', true);
```

### 2. Test Each Role Separately
- Log in as each role
- Navigate through all pages
- Attempt all operations (authorized + unauthorized)
- Document any issues

### 3. Test Core Workflows
- Create appointment end-to-end
- Update appointment
- Cancel appointment
- Create client
- Update client
- Create user (admin only)

### 4. Test Edge Cases
- Empty data sets
- Long strings (> 255 chars)
- Special characters in names
- Same-day appointments
- Past-date appointments
- Duplicate submissions

### 5. Document Results
- Screenshot any bugs
- Note browser and role
- Record steps to reproduce
- Check console for errors

## Regression Testing

**After Each Deployment:**

### 1. Smoke Tests (15 min)
- [ ] Login works
- [ ] Appointments page loads
- [ ] Clients page loads
- [ ] Can create appointment
- [ ] Can create client

### 2. Full Regression (1-2 hours)
- [ ] All role-based testing
- [ ] All common test scenarios
- [ ] Browser compatibility
- [ ] Performance benchmarks

## Automated Testing (Future)

**Recommended Tools:**
- **Playwright** or **Cypress** for E2E testing
- **Jest** for unit testing JavaScript functions
- **Postman** or **Insomnia** for API testing

**Priority Test Cases for Automation:**
1. User login flow
2. Create appointment with all roles
3. RBAC permission checks
4. API endpoint validation

## Test Data Management

**Best Practices:**
- Use K numbers K9000+ for test clients
- Prefix test users with "test_" in username
- Delete test data regularly (or use separate DB)
- Don't test with real client data (privacy)

**Sample Test Data:**
```javascript
const testClient = {
    knumber: "K9001",
    firstname: "Test",
    lastname: "Client",
    phone: "902-555-0000",
    civicaddress: "123 Test St",
    city: "Halifax",
    prov: "NS",
    postalcode: "B3H 1A1"
};
```

## Related Documentation

- **CLAUDE.md** - Project overview and architecture
- **API_CLIENT_REFERENCE.md** - API testing reference
- **COMPONENT_LIBRARY.md** - Component testing reference
