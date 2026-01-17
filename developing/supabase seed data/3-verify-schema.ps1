# PowerShell Script: Verify Testing Branch Schema
# This script checks that all tables and columns are set up correctly

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RRTS - Verify Testing Branch Schema" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "Checking Supabase CLI installation..." -ForegroundColor Yellow
try {
    $supabaseVersion = supabase --version
    Write-Host "✅ Supabase CLI found: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Supabase CLI not found!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Change to the transport-admin-portal directory
$projectRoot = "F:\GitHub\Repos\transport-admin-portal"
Set-Location $projectRoot

Write-Host "Running verification queries..." -ForegroundColor Yellow
Write-Host ""

# Check tables exist
Write-Host "=== TABLES ===" -ForegroundColor Cyan
$tablesSQL = @"
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
"@
$tablesSQL | supabase db execute --file -
Write-Host ""

# Check destinations table structure
Write-Host "=== DESTINATIONS TABLE ===" -ForegroundColor Cyan
$destinationsSQL = @"
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'destinations'
ORDER BY ordinal_position;
"@
$destinationsSQL | supabase db execute --file -
Write-Host ""

# Check primary_clinic_id field exists in clients
Write-Host "=== PRIMARY_CLINIC_ID FIELD ===" -ForegroundColor Cyan
$primaryClinicSQL = @"
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_name = 'primary_clinic_id';
"@
$primaryClinicSQL | supabase db execute --file -
Write-Host ""

# Check foreign key constraint
Write-Host "=== FOREIGN KEY CONSTRAINTS ===" -ForegroundColor Cyan
$fkSQL = @"
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'clients'
  AND kcu.column_name = 'primary_clinic_id';
"@
$fkSQL | supabase db execute --file -
Write-Host ""

# Check indexes
Write-Host "=== INDEXES ===" -ForegroundColor Cyan
$indexesSQL = @"
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename = 'clients' OR tablename = 'destinations')
ORDER BY tablename, indexname;
"@
$indexesSQL | supabase db execute --file -
Write-Host ""

# Check record counts
Write-Host "=== RECORD COUNTS ===" -ForegroundColor Cyan
$countsSQL = @"
SELECT 'destinations' as table_name, COUNT(*) as record_count FROM destinations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments
ORDER BY table_name;
"@
$countsSQL | supabase db execute --file -
Write-Host ""

Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ Verification complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Expected results:" -ForegroundColor Cyan
Write-Host "- 8 tables (app_config, appointments, clients, destinations, driver_time_off, drivers, system_logs, users)" -ForegroundColor White
Write-Host "- destinations table with 10 columns" -ForegroundColor White
Write-Host "- clients.primary_clinic_id field (integer, nullable)" -ForegroundColor White
Write-Host "- Foreign key: clients.primary_clinic_id -> destinations.id" -ForegroundColor White
Write-Host "- Index: idx_clients_primary_clinic" -ForegroundColor White
Write-Host ""
