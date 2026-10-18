# Local-only helper. No keys are committed, uploaded or copied into browser source.
# Run from any directory: .\scripts\setup_local_knowledge_demo.ps1
param([switch]$Regenerate)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $root '.env'
$existing = if (Test-Path -LiteralPath $envPath) { [System.IO.File]::ReadAllText($envPath) } else { '' }
$lines = [System.Collections.Generic.List[string]]::new()
if ($existing.Trim().Length -gt 0) {
    foreach ($line in ($existing -split "\r?\n")) {
        if ($line.Trim().Length -gt 0) { $lines.Add($line) }
    }
}

function New-DemoKey {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [System.BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

function Set-LocalKey([string]$keyName) {
    $indices = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ('^\s*' + [regex]::Escape($keyName) + '\s*=')) { $indices += $i }
    }
    $oldValue = if ($indices.Count -eq 1) { ($lines[$indices[0]] -split '=', 2)[1].Trim() } else { '' }
    if ($indices.Count -gt 1) { throw "Duplicate $keyName entries detected. Resolve them in .env before proceeding." }
    if ($oldValue.Length -ge 20 -and -not $Regenerate) {
        Write-Host "$keyName is already configured; preserving the existing value."
        return
    }
    $newValue = New-DemoKey
    $newLine = "$keyName=$newValue"
    if ($indices.Count -eq 1) { $lines[$indices[0]] = $newLine } else { $lines.Add($newLine) }
    Write-Host "$keyName generated in local .env." -ForegroundColor Green
}

Set-LocalKey 'LEGACY_EXPERT_KEY'
Set-LocalKey 'LEGACY_REVIEWER_KEY'
$expert = (($lines | Where-Object { $_ -match '^\s*LEGACY_EXPERT_KEY\s*=' } | Select-Object -First 1) -split '=', 2)[1].Trim()
$reviewer = (($lines | Where-Object { $_ -match '^\s*LEGACY_REVIEWER_KEY\s*=' } | Select-Object -First 1) -split '=', 2)[1].Trim()
if ($expert -eq $reviewer) { throw "Expert and reviewer keys must be different. Use -Regenerate to replace both." }
if ($expert.Length -lt 20 -or $reviewer.Length -lt 20) { throw "Both keys must contain at least 20 characters." }

$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, $utf8)
Write-Host ''
Write-Host 'Knowledge-demo credentials are configured locally. Store them privately.' -ForegroundColor Green
Write-Host 'The keys are in .env (ignored by Git). Copy the expert key only into the capture form, the reviewer key only into Mentor.'
Write-Host 'Do not paste your .env or either key into chat, screenshots, commits or a public demo.'
Write-Host 'Restart the backend with: docker compose up -d --force-recreate backend'
Write-Host 'Check readiness with: Invoke-RestMethod http://localhost:8000/api/v1/knowledge/workflow-readiness'
