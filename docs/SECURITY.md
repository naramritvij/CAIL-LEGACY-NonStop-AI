# Security boundary (prototype)

1. NEVER connect this demonstration to a real NonStop host or operate on customer information.
2. No arbitrary shell, network target, credential, or host command execution paths exist in the API.
3. POST /api/v1/diagnostics/preview returns only simulated output; default-deny for unknown actions and destructive actions.
4. The Ollama response is **untrusted advisory text**, cannot call diagnostics, and cannot authorize any state change.
5. No authentication or production RBAC yet. The service is explicitly **not production secure**. Run on localhost; host-published ports are loopback-only. Browser CORS restrictions are not authentication.
6. Synthetic notes must not be falsely attributed to senior experts or official HPE manuals. Expert approval and release applicability will require review states and audit history.
7. Security tests must include unknown action, destructive action, prompt injection, unsupported citations, incorrect privilege handling, API failures and dependency vulnerabilities.
8. Never commit .env files, access tokens, private documents or logs. Keep Ollama bound to local interfaces and do not expose the API to the public internet.
