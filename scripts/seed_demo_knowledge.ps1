# One-time OPTIONAL synthetic demo seed. Must run locally from the repo root.
# This is NOT a record from a real CAIL/HPE senior operator.
param([switch]$ConfirmSynthetic)
$ErrorActionPreference = "Stop"
if (-not $ConfirmSynthetic) { throw "Use -ConfirmSynthetic to acknowledge this is invented training knowledge." }
$root = Split-Path -Parent $PSScriptRoot
$envfile = Join-Path $root ".env"
if (-not (Test-Path $envfile)) { throw "Missing private .env file. Configure local distinct expert and reviewer demo secrets." }
$vars = @{}
Get-Content $envfile | ForEach-Object {
  if ($_ -match '^\s*(LEGACY_EXPERT_KEY|LEGACY_REVIEWER_KEY)=(.*)$') {
    $vars[$Matches[1]] = $Matches[2].Trim()
  }
}
if (-not $vars["LEGACY_EXPERT_KEY"] -or -not $vars["LEGACY_REVIEWER_KEY"]) {
  throw "Both keys must be configured in private .env"
}
$base = "http://127.0.0.1:8000/api/v1"
$body = @{
 incident_id = "INC-DISK-001"
 author_alias = "Synthetic Demo Mentor $([char]0x2014) Not a Real Operator"
 symptoms = "A simulated disk rose from 72 percent to 81 percent during the shift."
 reasoning = "Review utilization chronology, file ownership, retention and dependencies before any corrective action. The increasing metric alone does not prove causation."
 rejected_action = "purge_files"
 prerequisites = @("Verify file ownership", "Check retention policy", "Inspect application dependencies")
 evidence_ids = @("SIM-EVT-101", "SIM-EVT-103")
} | ConvertTo-Json -Depth 5
$expertHeaders = @{"X-Legacy-Expert-Key" = $vars["LEGACY_EXPERT_KEY"]}
$reviewerHeaders = @{"X-Legacy-Reviewer-Key" = $vars["LEGACY_REVIEWER_KEY"]}

# Idempotent check: never silently multiply identical demo lessons in SQLite.
# Access to nonapproved lesson metadata requires an explicit local demo role.
$existingResponse = Invoke-RestMethod -Method Get -Uri "$base/knowledge/lessons?incident_id=INC-DISK-001&status=all" -Headers $expertHeaders -TimeoutSec 10
$existingLessons = @($existingResponse)
$matching = @($existingLessons | Where-Object {
  $_.author_alias -eq "Synthetic Demo Mentor $([char]0x2014) Not a Real Operator" -and
  $_.symptoms -eq "A simulated disk rose from 72 percent to 81 percent during the shift."
})
if ($matching.Count -gt 0) {
  $approved = @($matching | Where-Object { $_.status -eq "approved" })
  if ($approved.Count -gt 0) {
    Write-Host "Synthetic approved demo lesson already exists: $($approved[0].id)"
    Write-Host "Challenge endpoint: $base/training/challenges/$($approved[0].id)"
    Write-Host "Skipped duplicate seed. No new record was written."
    exit 0
  }
  throw "Matching synthetic lesson exists but is not approved; review the existing draft/submission instead of creating a duplicate."
}

$item = Invoke-RestMethod -Method Post -Uri "$base/knowledge/lessons" -Headers $expertHeaders -ContentType "application/json" -Body $body
Invoke-RestMethod -Method Post -Uri "$base/knowledge/lessons/$($item.id)/submit" -Headers $expertHeaders | Out-Null
$review = @{decision="approved";notes="Accepted for synthetic training demonstration only; no real senior operator verification."} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$base/knowledge/lessons/$($item.id)/review" -Headers $reviewerHeaders -ContentType "application/json" -Body $review | Out-Null
Write-Host "Synthetic approved demo lesson: $($item.id)"
Write-Host "Challenge endpoint: $base/training/challenges/$($item.id)"
Write-Host "Not real expert knowledge. This seed demonstrates API flow only."
