# CAIL Guided Command Playbook: verified source mapping

## Evidence reviewed

- The user-supplied HPE link `a00099017en_us` is reachable as a shell page, but the actual source text and command content could **not** be verified from its public HTML. Its identity is not an HPE operator command manual on the evidence available. It is **not** used to source a command.
- HPE **SCF Reference Manual for the Storage Subsystem**: an example shows status and path output for a disk; HPE support also shows `STATUS DISK $*`. Our `STATUS DISK $DATA03` entry is a **display-only syntax reference** for the invented `$DATA03` disk incident, not a command sent to HPE.
  https://support.hpe.com/hpesc/public/docDisplay?docId=a00022757en_us&page=GUID-D7147C7F-2016-0901-027E-000000000720.html
  https://support.hpe.com/hpesc/public/docDisplay?docId=sf000098023en_us&docLocale=en_US
- HPE **TS/MP 2.8 System Administrator Guide** lists `STATUS` for PATHWAY/SERVER and documents `STATUS PATHWAY` output. Public HPE support incident material uses `STATUS SERVER <serverclass>, DETAIL`. The actual Pathway serverclass and target product/version are **not known**.
  https://support.hpe.com/hpesc/public/docDisplay?docId=a00090085en_us&docLocale=en_US&page=GUID-D7147C7F-2016-0901-029E-000000000B58.html
  https://support.hpe.com/hpesc/public/docDisplay?docId=a00090085en_us&docLocale=en_US&page=GUID-D7147C7F-2016-0901-029E-000000000AF3.html
  https://support.hpe.com/hpesc/public/docDisplay?docId=ns102.0.31297146.4515804en_us&docLocale=en_US
- Previously implemented CAIL commands (`CHECK HEALTH`, `SHOW ALERTS`, `OPEN ASAP SOURCE`, `OPEN EMS SOURCE`, `OPEN SCF SOURCE`) are **CAIL synthetic UI intents**, not TACL, SCF or PATHCOM commands.
- `STATUS SUBSYS $ZZKRN` remains an **L-Series kernel SCF reference**, not a generic Pathway-service diagnostic. It is intentionally **not recommended** for the Pathway incident.
- HPE manuals also discuss state-changing commands such as START, STOP, ALTER, DELETE, CONTROL and SWITCH. These are intentionally **excluded** from the playbook and any execution APIs.

## Implemented incident mapping

`INC-DISK-001`: EMS event chronology → ASAP-style fixture metric comparison → HPE SCF disk-status syntax with **UNKNOWN synthetic SCF output** → owner/retention/dependency checklist.

`INC-PATH-002`: EMS events → PATHCOM STATUS PATHWAY (reference only) → PATHCOM STATUS SERVER <serverclass>, DETAIL (reference only) → ASAP-style metrics → dependency/escalation checklist.

The guided panel in **Investigate**, just below the incident title, explains command context, why to use it, observed/expected fields, how to interpret those fields, missing-information behavior and the next step. Evidence marker buttons open the real synthetic event view. Public HPE documentation links are visible per command. All preview requests are whitelisted backend IDs.

`POST /api/v1/operations/playbook/recommend` performs **bounded deterministic symptom-word routing**, NOT AI-generated command decisions. No recognized symptom term returns `needs_clarification`. The Ask CAIL button helps the trainee pose an evidence question to local Qwen; the model cannot select or execute an arbitrary command.

`GET /api/v1/operations/incidents/{incident_id}/playbook` provides the sequence.
`POST /api/v1/operations/playbook/preview` previews only registered local synthetic fixtures; manual references return no command output. Arbitrary command content is not accepted.

## Safety and demo integrity

The demo does not know the target HPE release, configured serverclass, privilege level or actual command output. The source links establish that the **syntax family exists in published HPE material**, not that it applies to every NonStop installation or to our synthetic system. A command displayed on a card is **not executed**. No shell, TACL, PATHCOM, SCF, live telemetry, or network transport is implemented. Synthetic markers are not real EMS events.

**Verification required**: run `./scripts/verify_operator_center.ps1 -RunsPerIncident 1` locally on this PR before merger, then open both incidents in Investigate and exercise command recommendation, synthetic previews, manual-reference/UNKNOWN state, evidence drilldowns and ASK CAIL handoff. Use no credentials or real operational commands.
