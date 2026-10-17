<#
Runs the Sprint 5 backend regression suite and a bounded live Ollama smoke test.
Synthetic data only. Does not alter application source or exercise NonStop commands.
Docker Compose rebuild preserves the named database volume.
Usage: .\scripts\verify_sprint5.ps1
#>
param(
    [ValidateRange(1, 10)]
    [int]$RunsPerIncident = 3
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$python = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "Missing backend virtual environment. Create backend\.venv and install requirements-dev.txt first."
}

Write-Host "[1/3] Running complete backend pytest suite..." -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
try {
    & $python -m pytest -q
    if ($LASTEXITCODE -ne 0) { throw "Backend pytest suite failed ($LASTEXITCODE)." }
}
finally { Pop-Location }

Write-Host "[2/3] Building and starting existing Docker services..." -ForegroundColor Cyan
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed." }

$base = "http://localhost:8000/api/v1"
$ready = $false
for ($i = 0; $i -lt 12; $i++) {
    try {
        $health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 5
        if ($health.status -eq "ok" -and $health.mode -eq "synthetic_read_only") {
            $ready = $true
            break
        }
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { throw "Backend did not pass health check." }

Write-Host "[3/3] Running bounded local-Ollama investigations..." -ForegroundColor Cyan
$scenarios = @(
    @{ Id = "INC-DISK-001"; Question = "What does the disk evidence show?" },
    @{ Id = "INC-PATH-002"; Question = "What do the Pathway events show?" }
)
$rows = @()
foreach ($scenario in $scenarios) {
    for ($run = 1; $run -le $RunsPerIncident; $run++) {
        $body = @{
            incident_id = $scenario.Id
            question = $scenario.Question
            release = "L23.08"
            max_chunks = 3
        } | ConvertTo-Json
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $data = Invoke-RestMethod -Uri "$base/investigate/grounded" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 90
            $watch.Stop()
            $accepted = $data.status -eq "generated_unverified_citation_ids_checked"
            $safe = ($data.state_change_executed -eq $false) -and ($data.operational_action_authorized -eq $false)
            $rows += [PSCustomObject]@{
                Incident = $scenario.Id
                Run = $run
                Status = $data.status
                Claims = @($data.claims).Count
                Attempts = $data.model_attempts
                Seconds = [math]::Round($watch.Elapsed.TotalSeconds, 2)
                Safe = $safe
                FailureReasons = (@($data.validation_attempt_reasons) -join ",")
                Accepted = $accepted
            }
        }
        catch {
            $watch.Stop()
            $rows += [PSCustomObject]@{
                Incident = $scenario.Id; Run = $run; Status = "http_error"
                Claims = 0; Attempts = 0
                Seconds = [math]::Round($watch.Elapsed.TotalSeconds, 2)
                Safe = $false; FailureReasons = $_.Exception.Message
                Accepted = $false
            }
        }
    }
}
$rows | Format-Table Incident, Run, Status, Claims, Attempts, Seconds, Safe, FailureReasons -AutoSize
$acceptedCount = @($rows | Where-Object Accepted).Count
$total = @($rows).Count
$safeCount = @($rows | Where-Object Safe).Count
Write-Host ("Accepted responses: {0}/{1}; reported safe responses: {2}/{1}" -f $acceptedCount, $total, $safeCount)
Write-Host "Evidence-ID acceptance is NOT claim entailment or source authentication."
Write-Host "Any failure needs review; this script does not execute production actions."
if ($acceptedCount -ne $total -or $safeCount -ne $total) {
    throw "Sprint 5 live acceptance target not met. Review table; safety rules were not bypassed."
}
Write-Host "Sprint 5 checks passed for this local sample." -ForegroundColor Green
