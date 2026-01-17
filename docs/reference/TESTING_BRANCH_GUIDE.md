# Testing Branch Guide

## Overview

The project includes a complete Testing Branch setup that mirrors production for safe development and testing.

## Testing Branch Architecture

```
Testing Branch (local)
  ├── developing/ folder (TEST HTML files)
  ├── developing/TEST Workflow Copies/ (TEST n8n workflows)
  └── developing/supabase seed data/ (anonymized production data)
      ↓
  n8n TEST- workflows (Railway.app)
      ↓
  Supabase Testing Branch Database (cloud)
```

## Testing Branch Components

### 1. TEST HTML Files (`developing/` folder)
- `TEST-dashboard.html` - Login and dashboard (TEST endpoints)
- `TEST-appointments-sl.html` - Appointments list view
- `TEST-appointments-bulk-add.html` - Bulk appointment creation
- `TEST-clients-sl.html` - Clients list view
- `TEST-client-profile.html` - Individual client details
- `TEST-finance.html` - Finance dashboard
- All files include TEST MODE banner and use `../` paths for shared resources

### 2. TEST Workflows (`developing/TEST Workflow Copies/`)
- All TEST workflows use `TEST-` prefix in webhook paths
- Example: `TEST-user-login`, `TEST-get-active-clients`, etc.
- Configured with Testing Branch Supabase credentials
- **Required but not yet created**:
  - `TEST-user-login` (authentication)
  - `TEST-refresh-token` (JWT refresh)
  - `TEST-change-password` (password management)
  - `TEST-forgot-password` (password reset)

### 3. Testing Branch Database (Supabase)
- **2 Destinations** - NuVista Psychedelic locations
- **3 Users** (copied from production with password hashes):
  - ID 13: `***REMOVED***` (admin)
  - ID 23: `andrew.newton@live.ca` (booking_agent)
  - ID 30: `jamie.sweetland@hotmail.com` (supervisor)
- **1 Driver** (ID 11: Andrew Newton)
- **12 Clients**:
  - K7807878: Real client (Andrew Newton - safe test data)
  - K0000001-K0000011: Anonymized clients
    - Names: TestFirstName1/TestLastName1, etc.
    - Phone: 902-760-0946
    - Email: strugglebusca@gmail.com
    - Addresses: Real NS addresses preserved for mapping accuracy
- **74 Appointments** - Mix of past and future appointments
- **Schema Enhancements** (Testing Branch only):
  - `clients.updated_at` with automatic trigger
  - `clients.primary_clinic_id` (FK to destinations)
  - `destinations.phone`, `destinations.notes`, `destinations.updated_at`

## Seed Data Management

### Extracting Production Data for Testing
Location: `developing/supabase seed data/`

**STEP 1**: Run extraction queries in Production Supabase
```sql
-- Use: STEP 1 - Extract Production SIMPLE.sql
-- Runs 6 separate queries that generate INSERT statements
-- Includes anonymization for PII protection
```

**STEP 2**: Import extracted data to Testing Branch
```sql
-- Generated file: import-to-testing.sql
-- Run this file in Testing Branch Supabase SQL Editor
```

**STEP 3**: Apply Testing Branch-specific migrations
```sql
-- Run: ADD - clients updated_at column.sql
-- Adds updated_at column with automatic trigger
```

### Anonymization Strategy
- **Preserved**: K7807878 (Andrew Newton - confirmed safe test data)
- **Anonymized**: All other clients
  - K numbers: Sequential (K0000001, K0000002, etc.)
  - Names: TestFirstName/TestLastName + number
  - Contact: Shared test phone/email
  - Addresses: **Preserved** (needed for accurate mapping/routing)
  - Travel times: **Preserved** (clinic_travel_times JSON)

## Using Testing Branch

### Running TEST Environment Locally
```bash
# Start local server
npm start

# Open TEST dashboard
http://localhost:3000/developing/TEST-dashboard.html
```

### Login Credentials
Use production credentials (users copied with password hashes):
- **Admin**: ***REMOVED***
- **Booking Agent**: andrew.newton@live.ca
- **Supervisor**: jamie.sweetland@hotmail.com

**Note**: Passwords are the same as production (PBKDF2 hashed, copied directly)

### Navigation Between TEST Pages
- All TEST HTML files link to other TEST files
- Dashboard link: `TEST-dashboard.html`
- Resource paths: `../shared-styles.css`, `../permissions.js`, etc.
- TEST banner always visible at top of page

### API Endpoints
TEST HTML files use TEST- prefixed webhook endpoints:
```javascript
// TEST-dashboard.html example
const API_ENDPOINTS = {
    LOGIN: 'https://webhook-processor-production-3bb8.up.railway.app/webhook/TEST-user-login',
    REFRESH_TOKEN: '.../webhook/TEST-refresh-token',
    CHANGE_PASSWORD: '.../webhook/TEST-change-password'
};
```

## Testing Branch Workflow

### Making Changes
1. **Frontend**: Edit TEST HTML files in `developing/` folder
2. **Backend**: Update TEST workflow JSONs in `developing/TEST Workflow Copies/`
3. **Database**: Run migrations in Testing Branch Supabase
4. **Import Workflows**: Upload TEST workflows to n8n with TEST- webhook paths

### Testing Flow
1. Make changes in Testing Branch
2. Test with TEST HTML files and TEST workflows
3. Verify with Testing Branch database
4. Once stable, copy changes to production files (remove TEST- prefixes)
5. Merge Testing branch to main branch

### Resetting Test Data
To reset Testing Branch to fresh production data:
1. Truncate all tables in Testing Branch Supabase
2. Re-run `import-to-testing.sql`
3. Re-run `ADD - clients updated_at column.sql`

## Testing Branch Best Practices

1. **Always use TEST- prefix** for workflows and webhook paths
2. **Never commit TEST files to main branch** - keep in Testing branch
3. **Use TEST banner** on all TEST HTML files for visual distinction
4. **Preserve anonymization** when exporting data - never expose real PII
5. **Document schema changes** in Testing Branch before merging to production
6. **Test JWT workflows** thoroughly before using in production
7. **Verify RBAC** with all three test user roles

## Troubleshooting Testing Branch

### "Failed to load resource" errors
- Check that TEST HTML files use `../` for shared resources
- Verify paths: `../permissions.js`, `../jwt-auth.js`, `../shared-styles.css`

### "TEST workflow not found" (404 errors)
- Verify TEST workflow is imported to n8n
- Check webhook path includes `TEST-` prefix
- Confirm Testing Branch Supabase credentials configured

### Login fails
- Verify `TEST-user-login` workflow exists and is active
- Check Testing Branch database has users (IDs 13, 23, 30)
- Confirm password hashes were copied correctly

### Data inconsistencies
- Re-import seed data: `import-to-testing.sql`
- Verify sequence values are set correctly
- Check foreign key relationships (especially `primary_clinic_id`)

## Related Documentation

- **CLAUDE.md** - Project overview
- **TESTING_GUIDE.md** - Complete testing guidelines
- **LOCAL_DEVELOPMENT.md** - Local Supabase setup
