# Intent-aware questions — evidence vs. concepts

A screenshot showed a critical failure: the operator asked “What do you mean by Nonstop?” and the AI returned a technically cited but **unrelated** synthetic disk utilization event. Citation-ID allowlisting is not semantic answer relevance.

The backend now routes *explicit definitional questions* about a small, clearly labeled project-authored training glossary away from incident evidence and local Ollama. The glossary is for orientation, NOT verified HPE documentation. Unsupported definitions return `reference_required` (zero model calls). Incident-specific questions still reach Ollama with the registered synthetic evidence IDs. Obvious unrelated incident requests return `insufficient_relevant_evidence` before inference.

Frontend distinguishes non-model local reference notes, unsupported questions and evidence-ID-checked unverified model output. It never treats glossary text as authenticated HPE source material or cites disk events for the definition of HPE NonStop.

Regression tests specifically cover NonStop/ASAP/EMS/Knowledge Tree definitions, unrecognized concept refusal, off-topic question refusal and unchanged registered-ID incident investigation.

**Limitations**: The router and relevance filter are deterministic / lexical, not a semantic relevance or factuality engine; more general questions require authorized and independently reviewed documentation. An incident claim with registered citations still needs human verification. Release compatibility and enterprise tool connectivity are not certified. No production action is enabled.

Run after fetching branch: `./scripts/verify_operator_center.ps1 -RunsPerIncident 1`, then re-ask “What do you mean by Nonstop?” in Investigate and verify the response is clearly labeled non-model concept explanation rather than disk metrics.
