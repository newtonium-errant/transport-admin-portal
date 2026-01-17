# PowerShell Script: Setup Testing Branch Schema
# This script runs the schema setup SQL file using Supabase CLI
# Run this FIRST before importing data

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RRTS - Testing Branch Schema Setup" -ForegroundColor Cyan
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
$schemaFile = Join-Path $scriptDir "Testing Branch Supabase Schema Setup.txt"

# Verify schema file exists
if (-not (Test-Path $schemaFile)) {
    Write-Host "❌ ERROR: Schema file not found!" -ForegroundColor Red
    Write-Host "Expected location: $schemaFile" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Schema file found" -ForegroundColor Green
Write-Host ""

# Confirm before running
Write-Host "⚠️  WARNING: This will DROP and RECREATE all tables!" -ForegroundColor Yellow
Write-Host "⚠️  All existing data in Testing Branch will be DELETED!" -ForegroundColor Yellow
Write-Host ""
$confirmation = Read-Host "Are you sure you want to continue? (yes/no)"

if ($confirmation -ne "yes") {
    Write-Host "❌ Operation cancelled by user" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Running schema setup script..." -ForegroundColor Yellow
Write-Host ""

# Change to the transport-admin-portal directory (where supabase config should be)
$projectRoot = "F:\GitHub\Repos\transport-admin-portal"
Set-Location $projectRoot

# Run the SQL file using Supabase CLI
# The db execute command runs SQL against the local Supabase instance
try {
    Write-Host "Executing SQL file..." -ForegroundColor Yellow

    # Read the SQL file content
    $sqlContent = Get-Content -Path $schemaFile -Raw

    # Execute via Supabase CLI
    # Using pipe to pass SQL to supabase db execute
    $sqlContent | supabase db execute --file -

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "============================================" -ForegroundColor Green
        Write-Host "✅ Schema setup completed successfully!" -ForegroundColor Green
        Write-Host "============================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Run STEP 1 - Extract Production Data.sql in Production Supabase" -ForegroundColor White
        Write-Host "2. Copy the output data" -ForegroundColor White
        Write-Host "3. Paste into 'Copy Production Data to Testing.sql'" -ForegroundColor White
        Write-Host "4. Run: .\2-import-data.ps1" -ForegroundColor White
        Write-Host ""
        Write-Host "Or to verify schema now, run:" -ForegroundColor Cyan
        Write-Host "  supabase db diff" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "❌ ERROR: Schema setup failed!" -ForegroundColor Red
        Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: Failed to execute schema setup" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
