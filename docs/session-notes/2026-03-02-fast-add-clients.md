# Session Notes: 2026-03-02 — Fast-Add Clients & Async Workflow Fixes

## Summary

Continuation of async Add New Client workflow development. This session finalized bug fixes, added Fast-Add mode for quick client creation, updated the landing page copy, and wired the frontend to the new async endpoint.

---

## Completed Work

### 1. Async Add Client Workflow JSON — Final Fixes (DEPLOYED)
**File:** `Workflows/clients/CLIENT - Add New Client Async.json`
- Fixed Merge Task IDs node: changed `combineAll` to `append` mode
- Added explicit `numberInputs` to 3 Merge nodes (5, 5, 3) for import compatibility
- QA approved and published to production

### 2. Frontend → New Async Endpoint
**File:** `clients.html` (modified, uncommitted)
- Added `<script src="js/core/api-client.js"></script>`
- Replaced old `authenticatedFetch('/create-client-destinations')` with `ClientsAPI.add(requestData)`
- Success toast shows assigned K number from response

### 3. Fast-Add Checkbox in Add Client Modal
**File:** `clients.html` (modified, uncommitted)
- Fast Add toggle checkbox at top of Add Client modal
- `toggleFastAdd()` hides optional sections (email, emergency contact, secondary address, appointment length, clinics)
- Minimum required: first name, last name, phone, full address (civic, city, province, postal code)
- K number optional in fast-add mode
- Sends `mode: 'fast'` in payload when checked
- Orange "Incomplete" badge on client rows with `profile_status === 'incomplete'`
- "Incomplete Profiles" filter option in status dropdown

### 4. Edit Modal — Incomplete Profile Handling
**File:** `js/components/client-modal.js` (modified, uncommitted)
- Yellow "Incomplete Profile" alert banner for clients with `profile_status === 'incomplete'`
- `highlightIncompleteFields()` method highlights missing fields with amber border + "Required" badges
- T-prefixed K numbers detected with `/^T/` regex — field becomes editable with help text
- Auto-detect profile completeness on save — clears flag when all required fields filled
- Sends `originalKNumber` when K number is changed (for backend record lookup)

### 5. Landing Page Copy Update
**File:** `index.html` (modified, uncommitted)
- All text updated to match `docs/INDEX_PAGE_COPY.md`

### 6. Migration 27 — Fast-Add Columns (APPLIED)
**File:** `database/sql/27_fast_add_client_columns.sql` (new, uncommitted)
- `profile_status TEXT NOT NULL DEFAULT 'complete'` with CHECK constraint
- `created_via TEXT NOT NULL DEFAULT 'standard'` with CHECK constraint
- Partial index on `profile_status WHERE 'incomplete'`
- **Already run on both production and staging databases**

### 7. Fast-Add Instruction Doc for n8n Workflow Changes
**File:** `docs/workflows/N8N-CLIENT-ADD-ASYNC-FAST-ADD-INSTRUCTIONS.md` (new, uncommitted)
- 11-step instruction doc for manual changes in n8n UI
- **Part 1 (Steps 1-3):** Bug fixes for production failure (duplicate K check, null safety, delete-then-insert for distances)
- **Part 2 (Steps 4-11):** Fast-add mode feature (reduced validation, T-prefix temp K numbers, 6th background task, profile task tracking)
- Includes connection map, testing checklist, frontend request format examples
- "Requirements for Update Client Workflow" section at bottom

### 8. Split Get Failed Tasks Workflows (DEPLOYED)
**Files:** `workflows/admin/TASK - Get Failed Tasks.json`, `workflows/admin/TASK - Dismiss Task.json`
- Split from single multi-webhook into 2 single-webhook workflows
- QA approved and published

---

## Uncommitted Changes (on `wip` branch)

```
modified:   clients.html              (+117 lines — ClientsAPI.add, Fast Add checkbox, incomplete badges)
modified:   index.html                (+18/-18 — copy update)
modified:   js/components/client-modal.js  (+139 lines — incomplete profile handling, T-prefix detection)
modified:   docs/reference/DATABASE_SCHEMA.md  (+10 lines — profile_status, created_via docs)
modified:   docs/INDEX_PAGE_COPY.md   (minor edits)

untracked:  database/sql/27_fast_add_client_columns.sql
untracked:  docs/workflows/N8N-CLIENT-ADD-ASYNC-FAST-ADD-INSTRUCTIONS.md
```

---

## Key Design Decisions

### T-Prefix for Temporary K Numbers
- Fast-add clients without a K number get a temporary placeholder: `T` + 7 random hex chars (e.g., `T3A9F0B2`)
- Fits `varchar(10)` column, satisfies NOT NULL + UNIQUE constraints
- Visually distinct from real K numbers (`K` prefix)
- Frontend detects with `/^T/` regex — shows editable field with "Temporary — please update" help text
- Real K number assigned later via update-client workflow
- **Rejected alternatives:** K0100000 sequential range (too similar to real K numbers, requires DB lookup), nullable knumber (breaks FK constraints across appointments/invoices)

### Delete-Then-Insert for Distances
- n8n Supabase node does NOT support upsert
- Step 3 uses delete-then-insert pattern: delete existing rows by `client_id`, then re-insert fresh data
- Applies to both `client_destination_distances` and `driver_client_distances` tables

### No New Nodes for K Number Generation
- T-prefix is generated inline in the Validate Data - Code node (Step 4)
- No Supabase lookup or sequential generation needed — simpler workflow with fewer nodes

---

## Pending Work

### Must Do Before Deploy
1. **Apply n8n workflow changes** — Follow instruction doc `docs/workflows/N8N-CLIENT-ADD-ASYNC-FAST-ADD-INSTRUCTIONS.md` in the n8n UI (11 steps)
2. **Commit frontend changes** — `clients.html`, `client-modal.js`, `index.html`, migration file, instruction doc
3. **OpenPhone API error investigation** — The Add Quo Contact node fails with `400: defaultFields Expected object`. The request body structure may be sending `defaultFields` as wrong type. Not yet diagnosed.

### Future Work
4. **Build new Update Client workflow** — Must support:
   - Persisting `profile_status` to clients table
   - Handling K number changes via `originalKNumber` (for T→K replacement)
   - Cascading K number FK updates in appointments/invoices tables
   - Marking `complete_client_profile` background task as completed
   - See "Requirements for Update Client Workflow" section in instruction doc
5. **Background task dashboard** — `complete_client_profile` tasks with `max_retries: 0` appear as admin reminders

### Known Issues
- **OpenPhone `defaultFields` error** — Branch C: Add Quo Contact HTTP Request returns 400. Error path: `/defaultFields` — "Expected object", "Expected required property". May be request body structure issue (not phone format). Could also be duplicate contact. Not yet resolved.
- **Failed workflow diagnosis** — K0000007 duplicate caused silent cascade failure. Duplicate check (Step 1) addresses this.

---

## File Reference

| File | Status | Purpose |
|------|--------|---------|
| `clients.html` | Modified | Fast Add checkbox, ClientsAPI.add(), incomplete badges |
| `js/components/client-modal.js` | Modified | Incomplete profile alerts, T-prefix detection, auto-completeness check |
| `index.html` | Modified | Landing page copy update |
| `docs/reference/DATABASE_SCHEMA.md` | Modified | profile_status, created_via column docs |
| `database/sql/27_fast_add_client_columns.sql` | New | Migration 27 (already applied) |
| `docs/workflows/N8N-CLIENT-ADD-ASYNC-FAST-ADD-INSTRUCTIONS.md` | New | 11-step instruction doc for n8n changes |
| `Workflows/clients/CLIENT - Add New Client Async.json` | Committed | Published async workflow (Merge fixes) |
| `workflows/admin/TASK - Get Failed Tasks.json` | Committed | Split workflow (published) |
| `workflows/admin/TASK - Dismiss Task.json` | Committed | Split workflow (published) |
