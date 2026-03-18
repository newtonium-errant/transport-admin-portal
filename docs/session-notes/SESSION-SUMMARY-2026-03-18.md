# Session Summary — 2026-03-18

## Overview
Payroll feature work session. Conducted comprehensive 4-agent audit of payroll readiness across frontend, n8n workflows, database, and end-to-end data flow. Fixed critical payroll calculation bugs, pay model alignment, data loading issues, and workflow fixes. Confirmed all DB migrations 30-34 applied to production.

## Team Structure
Multi-agent team ("rrts-dev") with specialized agents:
- **frontend** — Finance JS audit, payroll calculation fixes, pay model implementation
- **n8n-backend** — 19 finance workflow audit, unauthorized response doc, workflow reviews
- **supabase-db** — Migration status verification, travel distance queries
- **testing-qa** — End-to-end data flow audit, Submit Payroll payload fix

## Audit Findings (Pre-Fix)

### Critical Issues Found
1. **PayrollCalculator only read `customRate`** — standard appointments showed $0 pay (BillingCalculator never called)
2. **Submit Payroll payload mismatch** — frontend sent `period_start`/`driver_summaries`, workflow expected `pay_period_start`/`driver_ids`
3. **Payroll tab reused review tab's cached data** — `FinanceState.appointments` populated by review tab, payroll tab skipped its own API call
4. **Pay model mismatch** — frontend used `invoiceAmount × tierPercentage`, n8n used `hours × hourlyRate + mileage`

### High Issues Found
5. **Mark Driver Paid button never rendered** — handler existed but HTML element missing
6. **Mileage fallback used wrong field name** — `tripdistance` instead of `driver_total_distance`
7. **Mileage didn't check `approved_mileage`** — admin overrides ignored
8. **14-15 finance workflows** had non-standard unauthorized response format
9. **YTD mileage always 0** — `mileage_ytd` JSONB never populated by any workflow

### Confirmed OK
- All migrations 30-34 applied to production (verified via SQL check)
- `payroll_submissions` and `staff_mileage` tables exist
- All 19 finance workflow JSONs use Switch nodes, production webhook paths, `alwaysOutputData`
- Submit Payroll workflow has proper JWT v2.0.0 auth

## Changes Made

### 1. PayrollCalculator — Hours-Based Pay Model (Option A)
**File:** `js/pages/finance-core.js:295-337`
- Changed pay model from `invoiceAmount × tierPercentage` to `hours × hourlyRate + CRA mileage`
- Hours priority: `approved_hours > calculated_hours > driver_work_duration/60 > appointment_length/60 > default 4`
- `basePay = hours × tierConfig.hourlyRate`, `totalPay = basePay + mileageReimbursement`
- `invoiceAmount` kept via BillingCalculator for display only (client billing column)
- Matches n8n Submit Payroll workflow calculation model

### 2. Mileage Fallback Fix
**File:** `js/pages/finance-core.js:299-300`
- Added `approved_mileage` as first priority for admin overrides
- Added `driver_total_distance` as primary source (already in km)
- Removed `/1000` division from `tripdistance` fallback

### 3. Mark Driver Paid Button
**File:** `js/pages/finance-payroll.js:317-321`
- Added "Mark Paid" button with class `btn-mark-driver-paid` and `data-driver-id` for unpaid drivers
- Wires into existing handler at line 383 with `e.stopPropagation()`

### 4. Submit Payroll Payload Alignment
**File:** `js/pages/finance-payroll.js:639-659`
- `period_start` → `pay_period_start`
- `period_end` → `pay_period_end`
- `driver_summaries` (array of objects) → `driver_ids` (array of integers)
- `staff_summaries` → `staff_entries`
- Audit log fields updated to match (lines 656-659)
- Workflow computes payroll server-side — frontend just sends period + driver IDs

### 5. Payroll Tab Data Loading Fix
**File:** `js/pages/finance-payroll.js:30-51`
- Removed `if (!FinanceState.appointments || length === 0)` guard
- Payroll tab now always fetches its own data with `?tab=payroll`
- Previously reused review tab's cached data (which filtered out approved appointments)

### 6. Instruction Doc — Unauthorized Response Batch Fix
**File:** `docs/instructions/FIN_BATCH_FIX_UNAUTHORIZED_RESPONSE.md`
- Covers 15 affected finance workflows
- Documents exact node name, current (wrong) code, replacement (correct) code
- Step-by-step n8n UI instructions for each workflow

## Workflow Fixes Applied in n8n UI (by user)

### 7. OpenPhone defaultFields Fix — CLIENT - Update Client Async
- Two nodes: "Branch C: Build Create Body - Code" and "Branch C: Build Update Body - Code"
- Added `name: "Phone"` to phoneNumbers and `name: "Email"` to emails
- Required by OpenPhone API schema

### 8. JSONB Serialization Fix — DRIVER - Update Driver Async
- Node: "Branch B: Update Prefs - Supabase"
- Changed `={{ $json.clinic_preferences }}` to `={{ JSON.stringify($json.clinic_preferences) }}`
- Prevents `[object Object]` being written to JSONB column

## Workflow Audits

### Finance Workflows (19 total)
- **2 production-ready**: Submit Payroll, Auto Complete Cron
- **14 need unauthorized response fix**: All share same nested `error.message` pattern (instruction doc created)
- **3 legacy v1 (DO NOT DEPLOY)**: Mark Driver Paid v1, Mark Booking Agent Paid v1, Update Invoice Status v1

### Driver Workflows Reviewed
- **CALC - Batch Calculate All Distances**: Production-ready, manual trigger, correct tables/columns, placeholder credentials
- **DRIVER - Update Driver Async**: Production-ready with one fix (JSONB serialization — applied)

## Key Discoveries

### Payroll Tab Data Flow Issue
The finance page loads the review tab first (default). `FinanceState.appointments` was shared across tabs. When payroll tab activated, it saw the array was populated and skipped its own `?tab=payroll` API call — getting review-filtered data (which drops `review_status = 'approved'` appointments). Fix: payroll tab always fetches its own data.

### Pay Model Decision
User confirmed **Option A** (hours-based): `totalPay = hours × hourlyRate + CRA mileage`. This matches the n8n Submit Payroll workflow. The old model (`invoiceAmount × tierPercentage`) was incorrect for driver pay.

### Approved Hours/Mileage Override Gap
The frontend now checks `approved_hours` and `approved_mileage` first, but the Approve Appointments workflow may not be writing these values to the DB. Investigation pending — appointments show `approved_hours: null` even after being approved with override values entered.

## Pending / Next Steps
1. **Investigate Approve workflow** — verify it writes `approved_hours`/`approved_mileage` to DB when admin enters overrides
2. **Apply 15-workflow unauthorized response fix** — use instruction doc in n8n UI
3. **YTD mileage tracking** — no workflow populates `drivers.mileage_ytd`, CRA threshold always starts at 0
4. **Staff YTD CRA tracking** — hardcoded to 0 in `finance-payroll.js:233,259`
5. **`driver_work_duration` backfill SQL** — needs to be written for existing appointments
6. **Import remaining driver workflows** to n8n UI (Add Driver Async, batch calc)
7. **Review tab also needs separate data loading** — same shared cache issue may affect invoicing tab

## Files Modified
- `js/pages/finance-core.js` — Pay model (Option A), mileage priority with approved_mileage, BillingCalculator wiring
- `js/pages/finance-payroll.js` — Mark Paid button, Submit Payroll payload, always-fetch payroll data
- `docs/instructions/FIN_BATCH_FIX_UNAUTHORIZED_RESPONSE.md` — New instruction doc

## Files Reviewed (not modified)
- `Workflows/Review/FIN - Get Finance Page Data.json` — Active production workflow, tab-specific filtering confirmed correct
- `Workflows/Review/CLIENT - Update Client Async (2).json` — OpenPhone fix applied in n8n UI
- `Workflows/drivers/DRIVER - Update Driver Async.json` — JSONB fix applied in n8n UI
- `Workflows/drivers/CALC - Batch Calculate All Distances.json` — Reviewed, production-ready
