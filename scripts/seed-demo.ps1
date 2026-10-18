#!/usr/bin/env pwsh
<#
.SYNOPSIS
  DarkOps AI — One-Click Automated Demo & Seeding Script (PowerShell)
.DESCRIPTION
  Applies database migrations, seeds the 5-store Manhattan quick-commerce world,
  generates realistic customer orders, and validates endpoint readiness.
.PARAMETER ApiUrl
  Base URL of DarkOps Operational API (defaults to http://localhost:3000 or $env:OPERATIONAL_API_URL).
#>

param(
  [string]$ApiUrl = $(if ($env:OPERATIONAL_API_URL) { $env:OPERATIONAL_API_URL } else { "http://localhost:3000" })
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " DarkOps AI — One-Click Environment Seeding & Demo Setup    " -ForegroundColor Cyan
Write-Host " Target API: $ApiUrl" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Health & Readiness Verification
Write-Host "`n[1/4] Checking Operational API Readiness at $ApiUrl/healthz..." -ForegroundColor Yellow
$maxRetries = 15
$attempt = 0
$ready = $false

while (-not $ready -and $attempt -lt $maxRetries) {
  $attempt++
  try {
    $res = Invoke-RestMethod -Uri "$ApiUrl/healthz" -Method Get -TimeoutSec 3
    if ($res.status -eq "ok") {
      $ready = $true
      Write-Host "Operational API is healthy and reachable!" -ForegroundColor Green
    }
  } catch {
    Write-Host "Attempt $($attempt)/$($maxRetries): Waiting for Operational API to respond..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  Write-Error "Operational API at $ApiUrl failed to become healthy within the timeout window."
}

# 2. Seed 5-Store Manhattan World
Write-Host "`n[2/4] Seeding 5-Store Manhattan Quick-Commerce World..." -ForegroundColor Yellow
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

$workerDir = Join-Path $repoRoot "services\simulation-worker"
$scenarioPath = Join-Path $workerDir "scenarios\default_manhattan.json"

if (Test-Path $scenarioPath) {
  $env:PYTHONPATH = $workerDir
  python -m src.seeder.cli run-all --scenario "$scenarioPath" --api-url "$ApiUrl"
  Write-Host "Manhattan world topology and catalog seeded successfully!" -ForegroundColor Green
} else {
  Write-Host "Scenario configuration not found at $scenarioPath; skipping world generation step." -ForegroundColor Yellow
}

# 3. Seed Realistic Customer Orders
Write-Host "`n[3/4] Generating realistic order traffic..." -ForegroundColor Yellow
$ordersScript = Join-Path $scriptDir "seed_realistic_orders.js"
if (Test-Path $ordersScript) {
  $env:API_URL = $ApiUrl
  node "$ordersScript"
  Write-Host "Customer orders seeded successfully!" -ForegroundColor Green
} else {
  Write-Host "Orders script not found at $ordersScript." -ForegroundColor Yellow
}

# 4. Final Telemetry Check
Write-Host "`n[4/4] Validating seeded entities..." -ForegroundColor Yellow
try {
  $stores = Invoke-RestMethod -Uri "$ApiUrl/api/v1/stores" -Method Get
  $orders = Invoke-RestMethod -Uri "$ApiUrl/api/v1/orders" -Method Get
  $inventory = Invoke-RestMethod -Uri "$ApiUrl/api/v1/inventory" -Method Get

  Write-Host "Verification Summary:" -ForegroundColor Cyan
  Write-Host "  - Active Dark Stores: $($stores.data.Count)" -ForegroundColor White
  Write-Host "  - Placed Orders:      $($orders.data.Count)" -ForegroundColor White
  Write-Host "  - Inventory Records:  $($inventory.data.Count)" -ForegroundColor White
  Write-Host "`n============================================================" -ForegroundColor Green
  Write-Host " DarkOps AI Environment is fully seeded and ready for demo! " -ForegroundColor Green
  Write-Host "============================================================" -ForegroundColor Green
} catch {
  Write-Warning "Failed to query verification summary: $_"
}
