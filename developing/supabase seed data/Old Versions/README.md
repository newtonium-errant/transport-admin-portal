# Old Versions - Archived SQL Scripts

This folder contains previous iterations of the production data extraction scripts. These files are kept for historical reference but are **not meant to be used**.

## Why These Were Replaced

These scripts had various issues that were fixed in subsequent versions:
- Missing or incorrect column names
- Schema mismatches between Production and Testing Branch
- Incomplete anonymization logic
- Window function errors in SQL aggregates
- Ambiguous column references

## Current Working Version

**Use this instead:** `../STEP 1 - Extract Production COMPLETE.sql`

This is the final, working version that:
- ✅ Uses exact column names from production schema
- ✅ Automatically anonymizes all PII (except K7807878)
- ✅ Uses CTEs to avoid window function conflicts
- ✅ Handles all table relationships correctly
- ✅ Preserves functional data (addresses, travel times) for accuracy

## Archived Files

1. **Copy Production Data to Testing.sql** - Original manual approach
2. **STEP 1 - Extract Production Data.sql** - First automated attempt
3. **STEP 1 - Extract Production Data - SIMPLE.sql** - Simplified version (incomplete)
4. **Quick Test Data - No Production Needed.sql** - Test data generator (not production data)
5. **STEP 2 - Import with Anonymization (Manual).sql** - Manual anonymization (replaced by auto)
6. **STEP 1B - Generate Import Script.sql** - Two-step process (replaced by single script)
7. **STEP 1 - Extract Production with Auto-Anonymization.sql** - Early auto-anonymization attempt
8. **STEP 1 - Extract Production (SAFE - Auto Detect Columns).sql** - Schema detection attempt
9. **STEP 1 - Extract Production (MINIMAL COLUMNS).sql** - Minimal column version (missing data)
10. **STEP 1 - Extract Production FIXED.sql** - Near-final version (superseded by COMPLETE)

## Do Not Use These Files

These files are kept for reference only. They will produce errors if run against the current database schemas.

---

**Last Updated:** November 9, 2025
**Superseded By:** `STEP 1 - Extract Production COMPLETE.sql`
