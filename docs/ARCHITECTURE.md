# Architecture — Initial vertical slice

Frontend (React / Vite, localhost:5173)
  |
  | /api proxy
  v
FastAPI (localhost:8000)
  +-- incident fixtures (synthetic scenarios)
  +-- safety policy (deterministic default deny)
  +-- knowledge seed (unverified example)
  +-- investigation adapter --> Ollama on Windows host

Docker Compose runs frontend and backend as separate containers. Native Ollama remains outside Docker. Neither component has an HPE NonStop connector. The API and browser are for single-machine demonstration; proper authentication, audit persistence and data protection are future phases.

## Roadmap
1. Ingest vetted operator message extracts, preserving provenance and licensing.
2. Build structured diagnostic command allowlist per tool/subsystem/release.
3. Create versioned Decision DNA records with reviewer sign-off and validity conditions.
4. Implement branch-based counterfactual replay and knowledge-transfer exercise.
5. Add resilient shift handover and mobile PWA installation.
6. Run measurable correctness, security and latency evaluation fixtures.
