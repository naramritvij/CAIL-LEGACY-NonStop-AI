# Enables the existing opt-in localhost review workflow without printing secrets.
# Never overwrites an existing .env or commits credentials.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$envFile = Join-Path $root ".env"

if (Test-Path $envFile) {
    Write-Host "Existing private .env preserved. Confirm both role keys are 20+ characters and distinct."
} else {
    function New-LocalRoleKey {
        $buffer = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
        return [System.BitConverter]::ToString($buffer).Replace("-", "").ToLowerInvariant()
    }
    $expert = New-LocalRoleKey
    $reviewer = New-LocalRoleKey
    if ($expert -eq $reviewer) { throw "Key generation collision. Try again." }
    [System.IO.File]::WriteAllText(
        $envFile,
        "LEGACY_EXPERT_KEY=$expert" + [Environment]::NewLine +
        "LEGACY_REVIEWER_KEY=$reviewer" + [Environment]::NewLine,
        [System.Text.Encoding]::ASCII
    )
    Write-Host "Created .env with distinct random local review keys. The keys were not printed."
}
if (-not (Test-Path $envFile)) { throw "Missing .env" }
if ((git check-ignore .env) -ne ".env") {
    throw ".env is not ignored by git. Do not proceed or commit credentials."
}
docker compose up -d --force-recreate backend
if ($LASTEXITCODE -ne 0) { throw "Backend failed to restart with private keys." }
Write-Host "Local review is configured. Use private .env values only on your own machine."
Write-Host "Do not paste keys into chat, screenshots, GitHub, or production systems."
