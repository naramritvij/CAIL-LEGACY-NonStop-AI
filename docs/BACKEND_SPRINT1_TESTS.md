# Sprint 1 backend validation

This backend expansion was tested locally in an isolated Python environment on 17 Oct 2026. `21 passed in 0.70 s` on the development environment, which is not the user's Windows laptop.

Features under test: existing API compatibility, evidence-linked deterministic analysis, safe and unsafe replay, unknown branch refusal, keys-required writes, role-separated review, approved-only retrieval, fixed-evidence validation, version link constraints, local audit-chain alteration detection, failure fallback, and simulated shift summaries.

Run after pulling:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Make sure backend .env secrets are securely configured before manually testing write endpoints. Automated tests provide isolated secrets via fixtures.
