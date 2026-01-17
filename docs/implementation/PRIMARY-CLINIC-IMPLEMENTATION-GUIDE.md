# Primary Clinic Feature - Implementation Guide

## Overview
This guide provides a complete checklist for implementing the Primary Clinic feature across database, workflows, and frontend.

---

## Implementation Checklist

### Phase 1: Database Migration

- [ ] **Run database migration**
  - File: `database/migrations/001_add_primary_clinic_to_clients.sql`
  - Run in Supabase Testing environment first
  - Verify column added: `primary_clinic_id INTEGER REFERENCES destinations(id)`
  - Verify index created: `idx_clients_primary_clinic`
  - Test on production after testing complete

---

### Phase 2: Workflows

#### New Workflow to Import
- [ ] **CLIENT - Get Single Client by K-Number**
  - File: `workflows/clients/CLIENT - Get Single Client by K-Number.json`
  - Import into n8n
  - Update credential to "Testing Branch - Supabase"
  - Test endpoint: `GET /webhook/get-client?knumber=K7807878`
  - Verify returns client with `primary_clinic_name` field
  - Switch to "Supabase Production" when ready
  - Activate workflow

#### Existing Workflows to Update
- [ ] **CLIENT - Add New Client**
  - Follow: `docs/workflows/UPDATE-CLIENT-ADD-WORKFLOW-PRIMARY-CLINIC.md`
  - Add `primary_clinic_id` to validation code
  - Add `primary_clinic_id` to Supabase INSERT
  - Test creating client with primary clinic

- [ ] **CLIENT - Update Client**
  - Follow: `docs/workflows/UPDATE-CLIENT-UPDATE-WORKFLOW-PRIMARY-CLINIC.md`
  - Add `primary_clinic_id` to validation code
  - Add `primary_clinic_id` to Supabase UPDATE
  - Update return query to JOIN with destinations table
  - Test updating client's primary clinic

---

### Phase 3: Frontend Updates

#### JavaScript Components

- [ ] **client-modal.js** (Quick Edit Modal)
  - Location: `js/components/client-modal.js`
  - Add clinic dropdown after "Preferred Driver" field
  - Fetch clinics from `/webhook/clinic-locations`
  - Set selected value from `client.primary_clinic_id`
  - Include in save payload as `primary_clinic_id`
  - Test: Open modal, select clinic, save, verify saved

- [ ] **appointment-modal.js** (Appointment Modal)
  - Location: `js/components/appointment-modal.js`
  - In `selectClient()` method, pre-select `client.primary_clinic_id`
  - Keep dropdown editable for user override
  - Test: Select client, verify clinic pre-selected

#### HTML Pages

- [ ] **clients-sl.html** (Client List)
  - Add display of `primary_clinic_name` in client cards
  - Add below emergency contact info
  - Test: Load client list, verify clinic name displays

- [ ] **add-appointments.html** (Add Appointments Form)
  - Pre-select client's primary clinic when client selected
  - Keep dropdown editable
  - Test: Select client, verify clinic pre-selected

- [ ] **appointments-bulk-add.html** (Bulk Add)
  - Pre-select client's primary clinic when client selected
  - Test: Select client in bulk add, verify clinic pre-selected

---

### Phase 4: Client Profile Page (Future)

This is part of the larger Client Profile Page feature. Primary clinic will be included as an editable field.

- [ ] Add primary clinic field to client profile page
- [ ] Make editable for all roles (booking agents, supervisors, admins)

---

## Testing Checklist

### Database Testing
- [ ] Verify column exists in clients table
- [ ] Verify foreign key constraint works (reject invalid clinic ID)
- [ ] Verify NULL values allowed (clinic is optional)
- [ ] Verify index exists and is used in queries

### Workflow Testing
- [ ] **Get Client**: Returns `primary_clinic_name` field
- [ ] **Add Client**: Accepts `primary_clinic_id`, stores correctly
- [ ] **Update Client**: Updates `primary_clinic_id`, returns clinic name
- [ ] **NULL handling**: Setting clinic to NULL works correctly
- [ ] **Invalid ID**: Rejects invalid clinic IDs with proper error

### Frontend Testing
- [ ] **Client Modal**: Dropdown loads clinics, saves selection
- [ ] **Client List**: Displays clinic name for clients with primary clinic
- [ ] **Appointment Modal**: Pre-selects client's primary clinic
- [ ] **Add Appointments**: Pre-selects client's primary clinic
- [ ] **Bulk Add**: Pre-selects client's primary clinic
- [ ] **NULL handling**: Clients without primary clinic don't break UI

### Integration Testing
- [ ] Create new client with primary clinic → verify in list
- [ ] Update client's primary clinic → verify update persists
- [ ] Create appointment for client → verify clinic pre-selected
- [ ] Change pre-selected clinic in appointment → verify saves correctly

---

## Rollback Plan

If issues arise:

1. **Frontend**: Comment out clinic dropdown code in modals
2. **Workflows**: Don't modify existing workflows until tested
3. **Database**: Column can be dropped with:
   ```sql
   ALTER TABLE clients DROP COLUMN primary_clinic_id;
   DROP INDEX idx_clients_primary_clinic;
   ```

---

## Files Created

### Database
- `database/migrations/001_add_primary_clinic_to_clients.sql`

### Workflows
- `workflows/clients/CLIENT - Get Single Client by K-Number.json` (NEW)
- `docs/workflows/UPDATE-CLIENT-ADD-WORKFLOW-PRIMARY-CLINIC.md` (Instructions)
- `docs/workflows/UPDATE-CLIENT-UPDATE-WORKFLOW-PRIMARY-CLINIC.md` (Instructions)

### Documentation
- `docs/implementation/PRIMARY-CLINIC-IMPLEMENTATION-GUIDE.md` (This file)

### Frontend (To Be Modified)
- `js/components/client-modal.js`
- `js/components/appointment-modal.js`
- `clients-sl.html`
- `add-appointments.html`
- `appointments-bulk-add.html`

---

## Next Steps After Implementation

1. Monitor error logs for foreign key violations
2. Gather user feedback on clinic selection UX
3. Consider adding "Most Used Clinics" to dropdown
4. Consider clinic-based reporting in operations dashboard

---

**Version**: 1.0.0
**Created**: 2025-01-08
**Status**: Ready for Implementation
