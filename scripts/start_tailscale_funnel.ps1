<#
.SYNOPSIS
 Start CAIL's safe, isolated public synthetic demo; optionally enable Tailscale Funnel.
.EXAMPLE
 .\scripts\start_tailscale_funnel.ps1
 .\scripts\start_tailscale_funnel.ps1 -Publish
 .\scripts\start_tailscale_funnel.ps1 -Publish -CheckQwen
.DESCRIPTION
 The HTTP gateway is limited to 127.0.0.1:8787 on the Windows host.
 -Publish explicitly authorizes turning on a public Tailscale HTTPS URL.
 The private backend SQLite and reviewer/expert keys are never mounted.
#>
param(
    [switch]$Publish,
    [switch]$CheckQwen
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

Write-Host '[CAIL] Building isolated synthetic demo and local HTTPS gateway target...' -ForegroundColor Cyan
docker compose -f compose.funnel.yaml up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose public demo startup failed.' }

docker compose -f compose.funnel.yaml exec -T demo-gateway nginx -t
if ($LASTEXITCODE -ne 0) { throw 'Public Nginx gateway validation failed.' }

$uri = 'http://127.0.0.1:8787'
# /healthz only checks Nginx itself. Real readiness must traverse the
# Nginx -> synthetic FastAPI hop; it prevents transient 502 on Windows startup.
$ready = $false
$lastProbeError = ''
for ($i = 0; $i -lt 30; $i++) {
    try {
        $probe = Invoke-RestMethod -Uri "$uri/api/v1/health" -TimeoutSec 6
        if ($probe.status -eq 'ok' -and $probe.mode -eq 'synthetic_read_only') {
            $ready = $true
            break
        }
        $lastProbeError = 'Unexpected FastAPI health result.'
    } catch {
        $lastProbeError = $_.Exception.Message
    }
    if ($i -eq 0) {
        Write-Host '[CAIL] Waiting for the gateway to reach FastAPI (502 during cold startup can be transient)...' -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Write-Warning "[CAIL] Gateway-to-backend readiness failed: $lastProbeError"
    Write-Host '[CAIL] Container status:' -ForegroundColor Yellow
    docker compose -f compose.funnel.yaml ps
    Write-Host '[CAIL] Recent backend and gateway logs:' -ForegroundColor Yellow
    docker compose -f compose.funnel.yaml logs --tail=70 demo-backend demo-gateway
    throw 'The synthetic FastAPI backend was not reachable through Nginx. No Tailscale Funnel was published.'
}
Write-Host '[CAIL] Gateway and FastAPI health verified.' -ForegroundColor Green

try {
    $network = Invoke-RestMethod -Uri "$uri/api/v1/operations/atm/network" -TimeoutSec 15
} catch {
    Write-Warning "[CAIL] ATM network endpoint failed: $($_.Exception.Message)"
    docker compose -f compose.funnel.yaml ps
    docker compose -f compose.funnel.yaml logs --tail=70 demo-backend demo-gateway
    throw 'The ATM network API failed. Funnel was not published.'
}
if ($network.production_connectivity -ne $false -or
    @($network.sites).Count -ne 6 -or
    @($network.sites | Where-Object { $_.id -eq 'ATM-042' -and $_.status -eq 'attention' }).Count -ne 1) {
    throw 'Fictional ATM network response failed trust checks.'
}

$chatPayload = @{question='Which ATM is broken, and where is it?';audience_mode='auto'} | ConvertTo-Json
$chat = Invoke-RestMethod -Uri "$uri/api/v1/operations/atm/chat" -Method Post -ContentType 'application/json' -Body $chatPayload -TimeoutSec 15
if ($chat.status -ne 'atm_visual_response' -or $chat.map_triggered -ne $true -or
    $chat.selected_atm_id -ne 'ATM-042' -or $chat.execution_allowed -ne $false) {
    throw 'Interactive chatbot map did not pass gateway smoke test.'
}

# A knowledge submission must be rejected at the gateway, not merely fail
# because an expert key is absent from this demo-only backend.
$status = 0
try {
    $body = '{"incident_id":"INC-PATH-002"}'
    $res = Invoke-WebRequest -Uri "$uri/api/v1/knowledge/lessons" -UseBasicParsing -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 10
    $status = [int]$res.StatusCode
} catch {
    if ($_.Exception.Response -ne $null) {
        $status = [int]$_.Exception.Response.StatusCode
    } else {
        throw
    }
}
if ($status -ne 403) { throw "Public knowledge-write endpoint unexpectedly returned HTTP $status instead of 403." }

if ($CheckQwen) {
    Write-Host '[CAIL] Checking local Ollama/Qwen through the restricted public gateway...' -ForegroundColor Cyan
    $aiPayload = @{
        incident_id = 'INC-FIN-HW-003'
        question = 'What does the fictional Pathway latency observation establish?'
        release = 'L23.08'
        max_chunks = 3
    } | ConvertTo-Json
    $ai = Invoke-RestMethod -Uri "$uri/api/v1/operations/lab/ask" -Method Post -Body $aiPayload -ContentType 'application/json' -TimeoutSec 120
    if ($ai.synthetic -ne $true) { throw 'The model response did not affirm synthetic data.' }
    if ($ai.status -notmatch 'generated|accepted') {
        throw "Qwen status '$($ai.status)' is not accepted generation. Do not publish this as a working public AI demo yet."
    } else {
        Write-Host "[CAIL] Local Qwen gateway request completed: $($ai.status)" -ForegroundColor Green
    }
}

Write-Host '[CAIL] Local public-demo gateway is ready at http://127.0.0.1:8787/#/chat' -ForegroundColor Green

if (-not $Publish) {
    Write-Host 'Not public yet. To enable HTTPS link: .\scripts\start_tailscale_funnel.ps1 -Publish -CheckQwen' -ForegroundColor Yellow
    return
}

$exe = (Get-Command tailscale -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $exe) {
    $candidate = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
    if (Test-Path $candidate) { $exe = $candidate }
}
if (-not $exe) { throw 'Tailscale is not installed. Install/sign in at https://tailscale.com/download/windows and rerun with -Publish.' }

Write-Host '[CAIL] Opening Tailscale Funnel consent when required...' -ForegroundColor Cyan
& $exe status
if ($LASTEXITCODE -ne 0) { throw 'Sign in to the Tailscale desktop application, then rerun.' }

& $exe funnel --bg 'http://127.0.0.1:8787'
if ($LASTEXITCODE -ne 0) {
    throw 'Tailscale Funnel could not be enabled. Review the approval URL or enable MagicDNS/HTTPS in the Tailscale admin console.'
}
Write-Host '[CAIL] Share the HTTPS URL displayed by Tailscale below, plus /#/chat:' -ForegroundColor Green
& $exe funnel status
if ($LASTEXITCODE -ne 0) { throw 'Funnel status failed. Check Tailscale connectivity.' }
Write-Host 'IMPORTANT: This link is PUBLIC, not authenticated. Synthetic demo only; do not share expert/reviewer keys.' -ForegroundColor Yellow
