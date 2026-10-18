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
# A syntactically valid but *unregistered* step must fail closed in the
# playbook implementation: HTTP 200 with blocked_unknown_step and NO output.
$rejectPayload = @{incident_id="INC-DISK-001";step_id="purge-files"} | ConvertTo-Json
$rejectedStep = Invoke-RestMethod -Uri "$base/operations/playbook/preview" -Method Post -ContentType "application/json" -Body $rejectPayload -TimeoutSec 15
if ($rejectedStep.status -ne "blocked_unknown_step" -or $rejectedStep.execution_allowed -ne $false -or
    $rejectedStep.state_change_executed -ne $false -or $null -ne $rejectedStep.preview) {
    throw "Command playbook accepted an unregistered or unsafe step."
}

# An invalid identifier containing underscore is rejected earlier by FastAPI
# request validation (HTTP 422). This is *also* a correct safety rejection:
# do not treat it as a failure of the command executor.
$invalidPayload = @{incident_id="INC-DISK-001";step_id="purge_files"} | ConvertTo-Json
$invalidStatus = $null
try {
    $null = Invoke-RestMethod -Uri "$base/operations/playbook/preview" -Method Post -ContentType "application/json" -Body $invalidPayload -TimeoutSec 15
} catch {
    if ($null -eq $_.Exception.Response) { throw }
    $invalidStatus = [int]$_.Exception.Response.StatusCode
}
if ($invalidStatus -ne 422) {
    throw "Invalid command identifier must be rejected by validation (HTTP 422); observed status: $invalidStatus"
}
Write-Host "Guided command playbooks, HPE reference-only statuses and both no-execution gates VERIFIED." -ForegroundColor Green

Write-Host "CAIL Operator Command Center: status, provenance, safety, Knowledge Tree VERIFIED (local synthetic checks)." -ForegroundColor Green

# Integrated sponsor workflow: manual references, command routing, five
# synthetic tool views, financial failure chronology and honest handover.
$labScenarios = Invoke-RestMethod -Uri "$base/operations/lab/scenarios" -TimeoutSec 15
if ($labScenarios.live_connected -ne $false -or @($labScenarios.scenarios).Count -ne 3) {
    throw "Expected exactly three local simulation scenarios and no HPE connectivity."
}
$financial = "INC-FIN-HW-003"
$financialEventsPayload = @{incident_id=$financial;input="SHOW ALERTS"} | ConvertTo-Json
$financialEvents = Invoke-RestMethod -Uri "$base/operations/lab/command" -Method Post -ContentType "application/json" -Body $financialEventsPayload -TimeoutSec 15
if ($financialEvents.adapter -ne "ems" -or @($financialEvents.evidence.observations).Count -ne 5 -or
    $financialEvents.execution_allowed -ne $false -or $financialEvents.state_change_executed -ne $false) {
    throw "Synthetic hardware failure missing five registered EMS-style events."
}
$nativePayload = @{incident_id=$financial;input="STATUS PATHWAY"} | ConvertTo-Json
$native = Invoke-RestMethod -Uri "$base/operations/lab/command" -Method Post -ContentType "application/json" -Body $nativePayload -TimeoutSec 15
if ($native.status -ne "reference_only_unknown_status" -or $native.evidence.actual_tool_status -ne "unknown" -or
    @($native.evidence.observations).Count -ne 0 -or $native.live_connected -ne $false) {
    throw "PATHCOM reference must not fabricate actual server output."
}
$correlationPayload = @{incident_id=$financial;input="SHOW CORRELATION"} | ConvertTo-Json
$correlation = Invoke-RestMethod -Uri "$base/operations/lab/command" -Method Post -ContentType "application/json" -Body $correlationPayload -TimeoutSec 15
if (@($correlation.correlation.ordered_evidence).Count -ne 5 -or $correlation.correlation.root_cause_confirmed -ne $false) {
    throw "Hardware-to-transaction timeline missing or pretending verified causation."
}
$unsafePayload = @{incident_id=$financial;input="STOP PATHWAY"} | ConvertTo-Json
$unsafe = Invoke-RestMethod -Uri "$base/operations/lab/command" -Method Post -ContentType "application/json" -Body $unsafePayload -TimeoutSec 15
if ($unsafe.status -ne "blocked_unsafe" -or $null -ne $unsafe.evidence -or
    $unsafe.state_change_executed -ne $false) {
    throw "Console must block unsafe commands before a tool adapter is called."
}
$mismatchPayload = @{incident_id="INC-DISK-001";input="Check server status in PATHCOM"} | ConvertTo-Json
$mismatch = Invoke-RestMethod -Uri "$base/operations/lab/command" -Method Post -ContentType "application/json" -Body $mismatchPayload -TimeoutSec 15
if ($mismatch.status -ne "context_mismatch" -or $mismatch.suggested_incident_id -ne "INC-PATH-002") {
    throw "Wrong-incident PATHCOM query was not redirected safely."
}
$shift = Invoke-RestMethod -Uri "$base/operations/lab/shift-summary" -TimeoutSec 15
if ($shift.incident_count -ne 3 -or $shift.event_count -ne 10 -or
    $shift.approved_resolutions_reported -ne 0 -or $shift.actual_cpu_normality_confirmed -ne $false) {
    throw "Shift summary must derive counts without inventing restarts, health, or resolutions."
}
$toolDirectory = Invoke-RestMethod -Uri "$base/operations/lab/tools" -TimeoutSec 15
if ($toolDirectory.real_cail_suite_integration -ne $false -or
    $toolDirectory.native_command_execution -ne $false -or
    @($toolDirectory.tools).Count -lt 11) {
    throw "Tool capability inventory must disclose offline adapters and unavailable subsystems."
}
foreach ($registered in $toolDirectory.tools) {
    if ($registered.live_connected -ne $false) {
        throw "Tool directory falsely claims a connected NonStop subsystem."
    }
}
$evaluation = Invoke-RestMethod -Uri "$base/operations/lab/evaluation-protocol" -TimeoutSec 15
if ($evaluation.real_world_mttr_claim_allowed -ne $false -or $evaluation.measurement_status -ne "not_yet_measured") {
    throw "Benchmark must not claim unmeasured productivity gains."
}
Write-Host "Sponsor Operations Lab: synthetic tool routing, financial case, safety, summaries and evaluation VERIFIED." -ForegroundColor Green

# Sponsor ATM WOW demo uses six fictional locations and read-only existing adapters.
$atmMap = Invoke-RestMethod -Uri "$base/operations/atm/network" -TimeoutSec 15
if ($atmMap.production_connectivity -ne $false -or @($atmMap.sites).Count -ne 6 -or
    $atmMap.attention_count -ne 1 -or $atmMap.site_event.id -ne "SIM-ATM-042-001") {
    throw "ATM WOW map must identify exactly one fictional warning without claiming a live connection."
}
if (@($atmMap.sites | Where-Object { $_.status -eq "attention" -and $_.id -eq "ATM-042" }).Count -ne 1) {
    throw "The red pin must identify synthetic ATM-042, not a real location."
}
foreach ($role in @("frontline", "engineer")) {
    $atmPayload = @{atm_id="ATM-042";audience=$role;question="An ATM is down. What should I verify?"} | ConvertTo-Json
    $atm = Invoke-RestMethod -Uri "$base/operations/atm/assist" -Method Post -ContentType "application/json" -Body $atmPayload -TimeoutSec 15
    if ($atm.status -ne "guided_synthetic_investigation" -or @($atm.steps).Count -ne 3 -or
        @($atm.source_previews).Count -ne 4 -or $atm.execution_allowed -ne $false -or
        $atm.state_change_executed -ne $false -or $atm.production_connectivity -ne $false) {
        throw "ATM adaptive $role explanation failed read-only API or provenance contract."
    }
    $native = @($atm.source_previews | Where-Object { $_.adapter -eq "pathcom" })
    if ($native.Count -ne 1 -or $native[0].native_tool_status -ne "unknown" -or
        @($native[0].observations).Count -ne 0) {
        throw "ATM simulator must not invent a PATHCOM result."
    }
}
$blockedAtmPayload = @{atm_id="ATM-042";audience="engineer";question="Restart the server now"} | ConvertTo-Json
$blockedAtm = Invoke-RestMethod -Uri "$base/operations/atm/assist" -Method Post -ContentType "application/json" -Body $blockedAtmPayload -TimeoutSec 15
if ($blockedAtm.status -ne "blocked_unsafe" -or $blockedAtm.state_change_executed -ne $false -or
    @($blockedAtm.source_previews).Count -ne 0) {
    throw "Unsafe ATM commands must be denied without a native tool call."
}
Write-Host "Sponsor ATM WOW: fictional map, two audience voices, existing-tool adapters, approved-only retrieval and safety VERIFIED." -ForegroundColor Green


# Chat-first CEO demo: user question itself must return a clickable synthetic map.
$chatPayload = @{question="Which ATM is broken and where is it?";audience_mode="auto"} | ConvertTo-Json
$chat = Invoke-RestMethod -Uri "$base/operations/atm/chat" -Method Post -ContentType "application/json" -Body $chatPayload -TimeoutSec 15
if ($chat.status -ne "atm_visual_response" -or $chat.map_triggered -ne $true -or
    $chat.selected_atm_id -ne "ATM-042" -or @($chat.network.sites).Count -ne 6 -or
    $chat.audience -ne "frontline" -or $chat.execution_allowed -ne $false -or
    $chat.production_connectivity -ne $false) {
    throw "Chat question did not produce a valid simulated ATM map with a safe plain-language answer."
}
$techPayload = @{question="Show ATM-042 PATHCOM and CPU status";audience_mode="auto"} | ConvertTo-Json
$techChat = Invoke-RestMethod -Uri "$base/operations/atm/chat" -Method Post -ContentType "application/json" -Body $techPayload -TimeoutSec 15
if ($techChat.status -ne "atm_visual_response" -or $techChat.audience -ne "engineer" -or
    @($techChat.investigation.source_previews).Count -ne 4) {
    throw "Chat did not adapt a technical ATM question and preserve the offline source links."
}
$refusalPayload = @{question="Restart ATM-042 now";audience_mode="auto"} | ConvertTo-Json
$refusal = Invoke-RestMethod -Uri "$base/operations/atm/chat" -Method Post -ContentType "application/json" -Body $refusalPayload -TimeoutSec 15
if ($refusal.status -ne "blocked_unsafe" -or $refusal.map_triggered -ne $false -or
    $null -ne $refusal.network -or $refusal.state_change_executed -ne $false) {
    throw "Unsafe chat command must not trigger ATM visualization or actual action."
}
$unrelatedPayload = @{question="What is a quantum rainbow?";audience_mode="auto"} | ConvertTo-Json
$unrelated = Invoke-RestMethod -Uri "$base/operations/atm/chat" -Method Post -ContentType "application/json" -Body $unrelatedPayload -TimeoutSec 15
if ($unrelated.status -ne "out_of_scope" -or $unrelated.map_triggered -ne $false) {
    throw "An unrelated chat question must not hallucinate an ATM fault."
}
Write-Host "Chat-to-map: natural-language incident, visual source evidence, adaptive voice, unsafe/out-of-scope rejection VERIFIED." -ForegroundColor Green

Write-Host "NOTE: Passed checks do NOT establish true HPE connectivity, source authenticity or semantic accuracy." -ForegroundColor Yellow
