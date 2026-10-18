<#
 Stop only the public CAIL demo gateway, public backend and Tailscale Funnel.
 Your separate local compose.yaml services, private database and keys remain untouched.
#>
param([switch]$KeepDocker)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$exe = (Get-Command tailscale -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $exe) {
    $candidate = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
    if (Test-Path $candidate) { $exe = $candidate }
}
if ($exe) {
    & $exe funnel --https=443 off
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Could not stop Funnel automatically. Check tailscale funnel status and stop it manually.'
    } else {
        Write-Host 'Tailscale public Funnel on HTTPS 443 disabled.' -ForegroundColor Green
    }
}
if (-not $KeepDocker) {
    docker compose -f compose.funnel.yaml down
    if ($LASTEXITCODE -ne 0) { throw 'Unable to stop public demo containers' }
}
Write-Host 'Your private local project and knowledge database were not touched.' -ForegroundColor Cyan
