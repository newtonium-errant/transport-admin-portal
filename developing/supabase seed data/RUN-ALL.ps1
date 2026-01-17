# PowerShell Master Script: Complete Testing Branch Setup
# This script runs all setup steps in order
# Use this for a complete fresh setup

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RRTS - Complete Testing Branch Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will:" -ForegroundColor Yellow
Write-Host "1. Setup the database schema" -ForegroundColor White
Write-Host "2. Import production data (if ready)" -ForegroundColor White
Write-Host "3. Verify the setup" -ForegroundColor White
Write-Host ""

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check Supabase CLI
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
try {
    $supabaseVersion = supabase --version
    Write-Host "✅ Supabase CLI found: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Supabase CLI not found!" -ForegroundColor Red
    Write-Host "Please install: npm install -g supabase" -ForegroundColor Red
    exit 1
}

# Check Supabase is running
Write-Host "Checking Supabase status..." -ForegroundColor Yellow
$projectRoot = "F:\GitHub\Repos\transport-admin-portal"
Set-Location $projectRoot

try {
    $status = supabase status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Supabase is not running. Starting it now..." -ForegroundColor Yellow
        supabase start
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to start Supabase" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "✅ Supabase is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Error checking Supabase status" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============================================================================
# STEP 1: Setup Schema
# ============================================================================
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "STEP 1: Setting up database schema..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$step1Script = Join-Path $scriptDir "1-setup-schema.ps1"
if (-not (Test-Path $step1Script)) {
    Write-Host "❌ ERROR: 1-setup-schema.ps1 not found!" -ForegroundColor Red
    exit 1
}

# Run step 1 (non-interactive for this master script)
$schemaFile = Join-Path $scriptDir "Testing Branch Supabase Schema Setup.txt"
if (-not (Test-Path $schemaFile)) {
    Write-Host "❌ ERROR: Schema file not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Running schema setup..." -ForegroundColor Yellow
$sqlContent = Get-Content -Path $schemaFile -Raw
$sqlContent | supabase db execute --file -

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Schema setup completed!" -ForegroundColor Green
} else {
    Write-Host "❌ Schema setup failed!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============================================================================
# STEP 2: Import Data (Optional)
# ============================================================================
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "STEP 2: Import production data (optional)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$dataFile = Join-Path $scriptDir "Copy Production Data to Testing.sql"
if (-not (Test-Path $dataFile)) {
    Write-Host "⚠️  Data import file not found, skipping..." -ForegroundColor Yellow
    $importData = "no"
} else {
    # Check if data file has placeholders
    $fileContent = Get-Content -Path $dataFile -Raw
    if ($fileContent -match "PASTE PRODUCTION" -or $fileContent -match "placeholder") {
        Write-Host "⚠️  Data file contains placeholders" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To import production data:" -ForegroundColor Yellow
        Write-Host "1. Run 'STEP 1 - Extract Production Data.sql' in Production Supabase" -ForegroundColor White
        Write-Host "2. Copy the output" -ForegroundColor White
        Write-Host "3. Paste into 'Copy Production Data to Testing.sql'" -ForegroundColor White
        Write-Host "4. Run this script again, OR run: .\2-import-data.ps1" -ForegroundColor White
        Write-Host ""
        $importData = "no"
    } else {
        Write-Host "Data file appears ready. Import data now?" -ForegroundColor Yellow
        $importData = Read-Host "(yes/no)"
    }
}

if ($importData -eq "yes") {
    Write-Host ""
    Write-Host "Running data import..." -ForegroundColor Yellow
    Write-Host "This may take a few minutes..." -ForegroundColor Yellow

    $sqlContent = Get-Content -Path $dataFile -Raw
    $sqlContent | supabase db execute --file -

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Data import completed!" -ForegroundColor Green
    } else {
        Write-Host "❌ Data import failed!" -ForegroundColor Red
        Write-Host "You can retry later by running: .\2-import-data.ps1" -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️  Skipping data import" -ForegroundColor Yellow
    Write-Host "You can import data later by running: .\2-import-data.ps1" -ForegroundColor White
}
Write-Host ""

# ============================================================================
# STEP 3: Verify Setup
# ============================================================================
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "STEP 3: Verifying setup..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Running verification queries..." -ForegroundColor Yellow
Write-Host ""

# Check tables
Write-Host "=== TABLES ===" -ForegroundColor Cyan
"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;" | supabase db execute --file -
Write-Host ""

# Check primary_clinic_id field
Write-Host "=== PRIMARY_CLINIC_ID FIELD ===" -ForegroundColor Cyan
"SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'primary_clinic_id';" | supabase db execute --file -
Write-Host ""

# Check foreign key
Write-Host "=== FOREIGN KEY CONSTRAINT ===" -ForegroundColor Cyan
@"
SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'clients' AND kcu.column_name = 'primary_clinic_id';
"@ | supabase db execute --file -
Write-Host ""

# Check record counts
Write-Host "=== RECORD COUNTS ===" -ForegroundColor Cyan
@"
SELECT 'destinations' as table_name, COUNT(*) as record_count FROM destinations
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'appointments', COUNT(*) FROM appointments
ORDER BY table_name;
"@ | supabase db execute --file -
Write-Host ""

# ============================================================================
# COMPLETION
# ============================================================================
Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Get Supabase connection info
Write-Host "Your local Supabase connection details:" -ForegroundColor Cyan
supabase status
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host ""

if ($importData -ne "yes") {
    Write-Host "📤 Import Production Data:" -ForegroundColor Yellow
    Write-Host "   1. Run 'STEP 1 - Extract Production Data.sql' in Production Supabase" -ForegroundColor White
    Write-Host "   2. Update 'Copy Production Data to Testing.sql' with the output" -ForegroundColor White
    Write-Host "   3. Run: .\2-import-data.ps1" -ForegroundColor White
    Write-Host ""
}

Write-Host "🔧 Fix TEST Workflows:" -ForegroundColor Yellow
Write-Host "   - See: testing\TEST Workflow Copies\CRITICAL-ISSUES-REPORT.md" -ForegroundColor White
Write-Host "   - See: testing\TEST Workflow Copies\FIX-CHECKLIST.md" -ForegroundColor White
Write-Host ""

Write-Host "📦 Import Workflows to n8n:" -ForegroundColor Yellow
Write-Host "   - Import TEST workflows from: testing\TEST Workflow Copies\" -ForegroundColor White
Write-Host "   - Update n8n 'Testing Branch - Supabase' credential with local connection" -ForegroundColor White
Write-Host ""

Write-Host "🧪 Start Testing:" -ForegroundColor Yellow
Write-Host "   - Open: testing\TEST-clients-sl.html" -ForegroundColor White
Write-Host "   - Test Primary Clinic feature" -ForegroundColor White
Write-Host ""

Write-Host "🌐 View Data in Browser:" -ForegroundColor Yellow
Write-Host "   Run: supabase studio" -ForegroundColor White
Write-Host ""

Write-Host "Done! 🎉" -ForegroundColor Green
