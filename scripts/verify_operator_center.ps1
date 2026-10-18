<#
One-shot Windows verification for CAIL/Nonstop AI Operations Assistant.
Runs existing Sprint 5 suite (pytest, Docker, frontend, bounded local Ollama)
then verifies the new colored operator/source/command/Knowledge Tree contracts.
ALL synthetic. No actual NonStop connections and no production commands.
#>
param(
    [ValidateRange(1, 3)]
    [int]$RunsPerIncident = 1
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[CAIL] Running existing end-to-end backend, frontend and Ollama verification..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "verify_sprint5.ps1") -RunsPerIncident $RunsPerIncident

$base = "http://localhost:8000/api/v1"
$overview = Invoke-RestMethod -Uri "$base/operations/overview" -TimeoutSec 15
if ($overview.tools_connected -ne $false -or $overview.polling_live_tools -ne $false) {
    throw "Demo is improperly claiming live HPE tool connectivity."
}
$disk = @($overview.statuses | Where-Object { $_.incident_id -eq "INC-DISK-001" })
$path = @($overview.statuses | Where-Object { $_.incident_id -eq "INC-PATH-002" })
$normal = @($overview.statuses | Where-Object { $null -eq $_.incident_id })
if ($disk.Count -ne 1 -or $disk[0].color -ne "yellow") {
    throw "Disk caution indicator is not yellow."
}
if ($path.Count -ne 1 -or $path[0].color -ne "red") {
    throw "Pathway critical indicator is not red."
}
if ($normal.Count -ne 1 -or $normal[0].color -ne "green" -or
    $normal[0].source_mode -ne "synthetic_explicit_baseline") {
    throw "Normal baseline must be explicitly simulated and green."
}

$tools = Invoke-RestMethod -Uri "$base/operations/tools" -TimeoutSec 15
foreach ($tool in $tools.tools) {
    if ($tool.connected -ne $false -or $tool.can_execute_commands -ne $false) {
        throw "No source is allowed to claim live connectivity or execution."
    }
}
$scf = Invoke-RestMethod -Uri "$base/operations/incidents/INC-DISK-001/sources/scf" -TimeoutSec 15
if ($scf.health_signal -ne "unknown" -or @($scf.evidence).Count -ne 0) {
    throw "Missing SCF data must remain unknown, not green."
}
$ems = Invoke-RestMethod -Uri "$base/operations/incidents/INC-DISK-001/sources/ems" -TimeoutSec 15
if (@($ems.evidence).Count -lt 1 -or $ems.evidence[0].original_fixture_source -ne "disk-monitor") {
    throw "Original EMS-style source provenance missing."
}

$catalog = Invoke-RestMethod -Uri "$base/operations/incidents/INC-DISK-001/commands" -TimeoutSec 15
if (@($catalog.commands).Count -ne 6) {
    throw "Incomplete operator command catalog."
}
$unknownCommand = @{incident_id="INC-DISK-001";command_id="purge_files"} | ConvertTo-Json
$blocked = Invoke-RestMethod -Uri "$base/operations/commands/preview" -Method Post -ContentType "application/json" -Body $unknownCommand -TimeoutSec 15
if ($blocked.execution_allowed -ne $false -or $blocked.state_change_executed -ne $false) {
    throw "Unknown/dangerous command was not blocked."
}

$tree = Invoke-RestMethod -Uri "$base/knowledge/knowledge-tree" -TimeoutSec 15
if ($tree.review_scope -ne "approved_only" -or $tree.synthetic -ne $true) {
    throw "Knowledge Tree must remain approved-only and synthetic."
}
$workspace = Invoke-RestMethod -Uri "$base/incidents/INC-DISK-001/workspace" -TimeoutSec 15
if ($null -eq $workspace.knowledge_tree -or
    $workspace.knowledge_tree.returned_node_count -ne $workspace.legacy_tree.returned_node_count) {
    throw "Knowledge Tree new and compatibility contracts diverged."
}

# Screenshot regression: definition requests must not cite unrelated disk
# evidence, and unrelated incident questions must not reach local Ollama.
$conceptPayload = @{incident_id="INC-DISK-001";question="What do you mean by Nonstop?";release="L23.08";max_chunks=3} | ConvertTo-Json
$concept = Invoke-RestMethod -Uri "$base/investigate/grounded" -Method Post -ContentType "application/json" -Body $conceptPayload -TimeoutSec 20
if ($concept.status -ne "local_reference_explanation" -or $concept.model_attempts -ne 0 -or
    @($concept.claims).Count -ne 0 -or $concept.message -notmatch "fault-tolerant" -or
    $concept.message -like '*$DATA03*') {
    throw "General NonStop definition incorrectly fell back to incident evidence."
}

$unrelatedPayload = @{incident_id="INC-DISK-001";question="Why is Kubernetes scheduler offline?";release="L23.08";max_chunks=3} | ConvertTo-Json
$unrelated = Invoke-RestMethod -Uri "$base/investigate/grounded" -Method Post -ContentType "application/json" -Body $unrelatedPayload -TimeoutSec 20
if ($unrelated.status -ne "insufficient_relevant_evidence" -or
    $unrelated.model_attempts -ne 0 -or @($unrelated.claims).Count -ne 0) {
    throw "Unrelated question should fail closed before incident Qwen inference."
}
Write-Host "Concept routing and unrelated-evidence rejection verified." -ForegroundColor Green


# Guided command playbook: links HPE-documented STATUS syntax to simulated
# evidence without executing real SCF or PATHCOM commands.
$diskGuide = Invoke-RestMethod -Uri "$base/operations/incidents/INC-DISK-001/playbook" -TimeoutSec 15
$pathGuide = Invoke-RestMethod -Uri "$base/operations/incidents/INC-PATH-002/playbook" -TimeoutSec 15
if (@($diskGuide.steps).Count -ne 4 -or @($pathGuide.steps).Count -ne 5 -or
    $diskGuide.release_verified -ne $false -or $pathGuide.operator_authorized -ne $false) {
    throw "Command playbook requires 4 disk / 5 Pathway synthetic guidance steps with unverified target."
}
$scfReference = @($diskGuide.steps | Where-Object { $_.id -eq "disk-scf-status" })
$serverReference = @($pathGuide.steps | Where-Object { $_.id -eq "path-server" })
if ($scfReference.Count -ne 1 -or $scfReference[0].command -ne 'STATUS DISK $DATA03' -or
    $serverReference.Count -ne 1 -or $serverReference[0].command -ne 'STATUS SERVER <serverclass>, DETAIL') {
    throw "HPE-documented storage or Pathway status reference missing."
}
$manualPayload = @{incident_id="INC-DISK-001";step_id="disk-scf-status"} | ConvertTo-Json
$manual = Invoke-RestMethod -Uri "$base/operations/playbook/preview" -Method Post -ContentType "application/json" -Body $manualPayload -TimeoutSec 15
if ($manual.status -ne "manual_reference_only" -or $manual.execution_allowed -ne $false -or
    $manual.state_change_executed -ne $false -or $manual.source.health_signal -ne "unknown" -or
    @($manual.source.evidence).Count -ne 0) {
    throw "SCF reference fabricated live status or permission to execute."
}
$previewPayload = @{incident_id="INC-PATH-002";step_id="path-events"} | ConvertTo-Json
$syntheticPreview = Invoke-RestMethod -Uri "$base/operations/playbook/preview" -Method Post -ContentType "application/json" -Body $previewPayload -TimeoutSec 15
if ($syntheticPreview.status -ne "synthetic_preview" -or $syntheticPreview.state_change_executed -ne $false -or
    @($syntheticPreview.source.evidence).Count -ne 2) {
    throw "Pathway playbook event preview failed or used unregistered records."
}
$rejectPayload = @{incident_id="INC-DISK-001";step_id="purge_files"} | ConvertTo-Json
$rejectedStep = Invoke-RestMethod -Uri "$base/operations/playbook/preview" -Method Post -ContentType "application/json" -Body $rejectPayload -TimeoutSec 15
if ($rejectedStep.status -ne "blocked_unknown_step" -or $rejectedStep.state_change_executed -ne $false) {
    throw "Command playbook accepted an unsafe step."
}
Write-Host "Guided command playbooks, HPE reference-only statuses and no-execution gates VERIFIED." -ForegroundColor Green

Write-Host "CAIL Operator Command Center: status, provenance, safety, Knowledge Tree VERIFIED (local synthetic checks)." -ForegroundColor Green
Write-Host "NOTE: Passed checks do NOT establish true HPE connectivity, source authenticity or semantic accuracy." -ForegroundColor Yellow
