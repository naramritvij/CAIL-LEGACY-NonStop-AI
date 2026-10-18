# Knowledge Transfer & Operator Guidance — Integrated Demo

This module is included in the unified CAIL/Nonstop AI Operations Assistant on `main` (merged through PRs #14 and #15).

## What now works in Local API · Synthetic mode

1. **Library:** list approved local excerpts/lessons, search release-filtered source chunks, paste authorized HPE source excerpts or consented redacted transcripts. Sources are user-supplied; a plausible URL is NOT proof of exact HPE contents. No automatic downloads, OCR, audio recording, or bulk manual imports.
2. **Mentor:** requires a distinct reviewer key. View submitted source contents and Decision DNA records and approve or reject with written rationale. Approval never authenticates a real operator or vendor source. Unapproved records remain excluded from knowledge retrieval and the Knowledge Tree.
3. **Investigation:** an incident-derived deterministic operator brief explains observations/significance/next checks even if local Qwen fails. Existing synthetic event/ASAP citation checking and default-deny safety remain separate from model output.
4. **Capture:** draft+submit Decision DNA with selected event IDs and explicit author label. Separately approved lessons appear in the Knowledge Tree. No unreviewed claim becomes an approved lesson.
5. **Safe Checks:** the previous disabled button now calls only `POST /api/v1/diagnostics/preview` for individually policy-allowed actions. No commands run.
6. **Apprentice:** approved lessons unlock revised synthetic challenges. The existing deterministic scoring rubric checks safety, citations, prerequisites and reasoning. Scores are NOT persisted or evidence of competence.

## First-time demo setup (Windows PowerShell)

From the repository root and after review of changes:

```powershell
git fetch origin
git switch feat/cail-knowledge-transfer-v1
git pull --ff-only
.\scripts\enable_local_review.ps1
.\scripts\verify_operator_center.ps1 -RunsPerIncident 1
```

The key setup script creates *distinct random local demo credentials* in a private ignored `.env` only if the file is absent. It **will never overwrite existing secrets**, and neither key is printed. If existing `.env` values are blank/invalid, repair them manually. Enter the expert key in Library/Capture and the **different** reviewer key in Mentor. Credentials are held in transient component state, not localStorage. This is an opt-in local demonstration, not production identity management.

To obtain both keys on **your own machine only**, view `.env` privately; do not screenshot/share its values. Docker Compose reads the file automatically and the backend restarts with the configured credentials.

## Demo order

Open Home: yellow disk warning and red Pathway warning, view synthetic ASAP/EMS/SCF evidence.
Open Investigate: preview checks, ask about the incident, then Capture a lesson (write a meaningful reasoning and registered event IDs).
Open Mentor: load submitted lessons with the **reviewer** key, examine and approve.
Open Knowledge Tree: the approved node can now appear in the real approved-only view; Synthetic Showcase remains separate.
Open Apprentice: select that lesson and complete the changed scenario.
Open Library: paste an authorized excerpt or redacted transcript, submit with **expert** key, approve separately in Mentor, search approved chunks and ask CAIL a matching concept question.

## Honest limits

- Knowledge-source content and operator identity are not independently authenticated against HPE or CAIL internal documents. Release tags are submitted locally, not verified by a vendor.
- Concept Q&A uses a locally authored glossary until an approved matching excerpt exists. With matching approved excerpts, it can ask local Qwen to produce bounded claims citing DOC IDs; ID presence does NOT establish semantic entailment or factual accuracy.
- Live HPE/CAIL telemetry, production commands, real reviewer SSO, proof of impact, automatic transcription, automatic bulk PDF extraction, live speech/video, enterprise auditing and persistent apprentice XP are **not implemented**. They are not silently implied by the user interface.
- Data and approved lessons persist in a local SQLite Docker volume unless explicitly reset. Do not delete the volume when troubleshooting.
- No user data or credentials are sent to cloud model APIs. Docker/NPM installation may use package registries; inference is local.
