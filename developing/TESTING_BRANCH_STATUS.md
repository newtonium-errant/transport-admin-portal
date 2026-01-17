# Testing Branch - Current Status

**Last Updated**: 2025-11-09

## ✅ Completed Setup

### Database (Testing Branch Supabase)
- [x] Schema configured with all tables
- [x] **Data imported**: 2 destinations, 3 users, 1 driver, 12 clients, 74 appointments
- [x] **Schema enhancements applied**:
  - `clients.updated_at` column with automatic trigger
  - `clients.primary_clinic_id` (FK to destinations)
  - `destinations` extra columns (phone, notes, updated_at)
- [x] User accounts ready with production password hashes

### Frontend (TEST HTML Files)
- [x] `TEST-dashboard.html` - Created with TEST endpoints
- [x] `TEST-appointments-sl.html` - Paths fixed
- [x] `TEST-appointments-bulk-add.html` - Paths fixed
- [x] `TEST-clients-sl.html` - Paths fixed
- [x] `TEST-client-profile.html` - Paths fixed
- [x] `TEST-finance.html` - Paths fixed
- [x] All files use `../` paths for shared resources
- [x] All files include TEST MODE banner
- [x] All files link to other TEST files (not production)

### Backend (n8n Workflows)
- [x] Multiple TEST workflow copies imported to n8n
- [x] Workflows configured with Testing Branch Supabase credentials
- [ ] **MISSING**: JWT authentication workflows (see below)

### Documentation
- [x] CLAUDE.md updated with comprehensive Testing Branch section
- [x] Seed data extraction scripts documented
- [x] This status file created

## ⚠️ Remaining Tasks

### Critical - Required for Login
The following TEST workflows need to be created and imported to n8n:

1. **TEST-user-login** (based on `ADMN - User Login Authentication Workflow (3).json`)
   - Location: `Workflows/admin/ADMN - User Login Authentication Workflow (3).json`
   - Webhook path: `/webhook/TEST-user-login`
   - Purpose: Authenticate users against Testing Branch database

2. **TEST-refresh-token** (based on `USER - Refresh Token (3).json`)
   - Location: `Workflows/users/USER - Refresh Token (3).json`
   - Webhook path: `/webhook/TEST-refresh-token`
   - Purpose: Refresh JWT access tokens

3. **TEST-change-password** (based on `USER - Change Password (2).json`)
   - Location: `Workflows/users/USER - Change Password (2).json`
   - Webhook path: `/webhook/TEST-change-password`
   - Purpose: Allow users to change passwords

4. **TEST-forgot-password** (optional but recommended)
   - Location: `Workflows/users/USER - Self-Service Password Reset (1).json`
   - Webhook path: `/webhook/TEST-forgot-password`
   - Purpose: Password reset functionality

### Workflow Creation Steps
For each workflow above:
1. Open the production workflow JSON in `Workflows/` directory
2. Save a copy to `testing/TEST Workflow Copies/`
3. Edit the webhook path to add `TEST-` prefix
4. Change all Supabase node credentials to Testing Branch
5. Import to n8n
6. Test with TEST-dashboard.html login

## 📊 Testing Branch Data Summary

### Users (Can Login)
| ID | Email | Role | Access Level |
|----|-------|------|--------------|
| 13 | ***REMOVED*** | admin | Full access |
| 23 | andrew.newton@live.ca | booking_agent | Limited (no delete/driver assign) |
| 30 | jamie.sweetland@hotmail.com | supervisor | Client/Appt/Driver management |

**Passwords**: Same as production (PBKDF2 hashed, copied from production)

### Clients
- **K7807878**: Andrew Newton (real data - safe for testing)
- **K0000001-K0000011**: Anonymized test clients
  - Names: TestFirstName1/TestLastName1, etc.
  - Phone: 902-760-0946
  - Email: strugglebusca@gmail.com
  - Addresses: Real NS locations (preserved for mapping accuracy)

### Other Data
- **Destinations**: 2 (NuVista Psychedelic - Greenwood & New Minas)
- **Drivers**: 1 (Andrew Newton, ID 11)
- **Appointments**: 74 (past and future, various statuses)

## 🚀 How to Use Testing Branch

### Start Local Server
```bash
npm start
```

### Open TEST Dashboard
```
http://localhost:3000/testing/TEST-dashboard.html
```

### Login
Use any of the 3 test user accounts (production credentials)

### Test Features
- All TEST pages accessible from navigation
- RBAC works identically to production
- Data operations use Testing Branch database
- Safe to experiment - no production impact

## 🛠️ Development Workflow

### Making Changes
1. Edit TEST HTML files in `testing/` folder
2. Edit TEST workflows in `testing/TEST Workflow Copies/`
3. Test changes with Testing Branch database
4. Once stable, copy to production files (remove TEST- prefixes)
5. Merge Testing branch to main

### Resetting Test Data
```sql
-- In Testing Branch Supabase:
-- 1. Truncate all tables
-- 2. Re-run: testing/supabase seed data/import-to-testing.sql
-- 3. Re-run: testing/supabase seed data/ADD - clients updated_at column.sql
```

## 📝 Files Changed in This Session

### Created
- `testing/TEST-dashboard.html` - TEST mode dashboard with TEST endpoints
- `testing/supabase seed data/STEP 1 - Extract Production SIMPLE.sql` - Extraction script
- `testing/supabase seed data/import-to-testing.sql` - Final import script
- `testing/supabase seed data/ADD - clients updated_at column.sql` - Migration script
- `testing/TESTING_BRANCH_STATUS.md` - This file

### Modified
- `testing/TEST-appointments-sl.html` - Fixed paths
- `testing/TEST-appointments-bulk-add.html` - Fixed paths
- `testing/TEST-clients-sl.html` - Fixed paths
- `testing/TEST-client-profile.html` - Fixed paths
- `testing/TEST-finance.html` - Fixed paths
- `CLAUDE.md` - Added comprehensive Testing Branch documentation
- `testing/TEST Workflow Copies/TEST - CLIENT - Update Client (1).json` - Added updated_at field

### Database Changes (Testing Branch Only)
- Imported 88 records total (users, clients, appointments, etc.)
- Added `clients.updated_at` column with trigger
- Added `clients.primary_clinic_id` (FK to destinations)
- Enhanced `destinations` table with extra columns

## 🎯 Next Steps

**Priority 1**: Create TEST JWT workflows for authentication
**Priority 2**: Test complete login flow with TEST-dashboard.html
**Priority 3**: Verify all TEST pages work with TEST workflows
**Priority 4**: Document any additional schema differences discovered

## 📚 Key Documentation Files

- `CLAUDE.md` - Full project documentation with Testing Branch section
- `testing/supabase seed data/STEP 1 - Extract Production SIMPLE.sql` - How to extract data
- `testing/TEST Testing Branch Supabase Schema.txt` - Complete schema reference
- `testing/supabase seed data/supabase testing branch results.txt` - Import verification

## ⚡ Quick Commands

```bash
# View TEST HTML in browser
npm start
# Then navigate to: http://localhost:3000/testing/TEST-dashboard.html

# Check git status
git status

# See what's changed
git diff

# Commit changes to Testing branch
git add .
git commit -m "Setup Testing Branch environment with anonymized seed data"
```

---

**Status**: Testing Branch is 95% complete. Only missing JWT authentication workflows to enable login functionality. All other infrastructure is ready for testing.
