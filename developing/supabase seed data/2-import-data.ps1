# PowerShell Script: Import Production Data to Testing Branch
# This script runs the data import SQL file using Supabase CLI
# Run this AFTER:
# 1. Running 1-setup-schema.ps1
# 2. Extracting production data and updating "Copy Production Data to Testing.sql"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RRTS - Import Production Data to Testing" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is installed
Write-Host "Checking Supabase CLI installation..." -ForegroundColor Yellow
try {
    $supabaseVersion = supabase --version
    Write-Host "✅ Supabase CLI found: $supabaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Supabase CLI not found!" -ForegroundColor Red
    Write-Host "Please install Supabase CLI: https://supabase.com/docs/guides/cli" -ForegroundColor Red
    exit 1
}

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataFile = Join-Path $scriptDir "Copy Production Data to Testing.sql"

# Verify data file exists
if (-not (Test-Path $dataFile)) {
    Write-Host "❌ ERROR: Data import file not found!" -ForegroundColor Red
    Write-Host "Expected location: $dataFile" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Data import file found" -ForegroundColor Green
Write-Host ""

# Check if the file still contains placeholder data
$fileContent = Get-Content -Path $dataFile -Raw
if ($fileContent -match "PASTE PRODUCTION" -or $fileContent -match "placeholder") {
    Write-Host "⚠️  WARNING: The data file appears to contain placeholder data!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Before running this script, you need to:" -ForegroundColor Yellow
    Write-Host "1. Run 'STEP 1 - Extract Production Data.sql' in Production Supabase" -ForegroundColor White
    Write-Host "2. Copy the production data output" -ForegroundColor White
    Write-Host "3. Replace placeholders in 'Copy Production Data to Testing.sql'" -ForegroundColor White
    Write-Host ""
    $continueAnyway = Read-Host "Continue anyway? (yes/no)"
    if ($continueAnyway -ne "yes") {
        Write-Host "❌ Operation cancelled" -ForegroundColor Red
        exit 0
    }
}

# Confirm before running
Write-Host "⚠️  WARNING: This will DELETE and REPLACE all data in Testing Branch!" -ForegroundColor Yellow
Write-Host ""
$confirmation = Read-Host "Are you sure you want to continue? (yes/no)"

if ($confirmation -ne "yes") {
    Write-Host "❌ Operation cancelled by user" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Running data import script..." -ForegroundColor Yellow
Write-Host "This may take a few minutes depending on data size..." -ForegroundColor Yellow
Write-Host ""

# Change to the transport-admin-portal directory
$projectRoot = "F:\GitHub\Repos\transport-admin-portal"
Set-Location $projectRoot

# Run the SQL file using Supabase CLI
try {
    Write-Host "Executing SQL file..." -ForegroundColor Yellow

    # Read the SQL file content
    $sqlContent = Get-Content -Path $dataFile -Raw

    # Execute via Supabase CLI
    $sqlContent | supabase db execute --file -

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================" -ForegroundColor Green
        Write-Host "✅ Data import completed successfully!" -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Running verification queries..." -ForegroundColor Cyan
        Write-Host ""

        # Run verification queries
        $verifySQL = @"
-- Record counts
SELECT 'destinations' as table_name, COUNT(*) as record_count FROM destinations
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'appointments', COUNT(*) FROM appointments;
"@

        Write-Host "Record counts:" -ForegroundColor Yellow
        $verifySQL | supabase db execute --file -

        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Fix TEST workflows (see testing/TEST Workflow Copies/FIX-CHECKLIST.md)" -ForegroundColor White
        Write-Host "2. Import TEST workflows to n8n" -ForegroundColor White
        Write-Host "3. Start testing with testing/TEST-clients-sl.html" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "❌ ERROR: Data import failed!" -ForegroundColor Red
        Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: Failed to execute data import" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
