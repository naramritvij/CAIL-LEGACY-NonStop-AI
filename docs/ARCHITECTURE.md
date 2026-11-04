# CAIL / Nonstop AI Operations Assistant: architecture

The existing React/TypeScript/Vite frontend, FastAPI backend, SQLite volume and Ollama model now serve one assistant, one knowledge graph and one connection screen.

~~~mermaid
flowchart TD
    User["Operator"] --> UI["Single workspace"]
    UI --> API["Authenticated FastAPI"]
    API --> Memory["Conversation memory"]
    API --> Orchestrator["Agent orchestrator"]
    Memory --> Orchestrator
    Orchestrator --> Knowledge["Knowledge agent"]
    Orchestrator --> Telemetry["Telemetry agent"]
    Knowledge --> Reviewed["Approved source chunks"]
    Telemetry --> Gateway["Authorized read-only gateway"]
    Gateway --> Sources["Prognosis · ASAP · MOMI"]
    Knowledge --> Evaluator["Evidence evaluator"]
    Telemetry --> Evaluator
    Evaluator -->|Sufficient| Answer["Response agent"]
    Evaluator -->|Rewrite, at most 5 attempts| Knowledge
    Answer --> Saved["Saved answer and sources"]
    Saved --> UI
    API --> Graph["Ownership and access events"]
    Graph --> UI
~~~

This diagram describes responsibility and event flow. Workers cannot execute operating-system or NonStop commands. Qwen performs routing, relevance evaluation and synthesis. Access checks, source allowlisting, review transitions, retry bounds and citation checks are deterministic code.

## Records

- ws_people, ws_sessions: stable identity references and hashed browser sessions.
- ws_conversations, ws_messages: private complete history, answer metadata, idempotency and leases.
- ws_documents, ws_chunks: ownership, extracted content, topic, digest, review and citation chunks.
- ws_events: actual contribution, review, document-view, retrieval and source events.
- ws_snapshots, ws_connector_state: bounded telemetry history and latest success/failure.

Older lesson, corpus and audit tables remain unchanged and searchable when approved. Their aliases are not reassigned to authenticated employees.

## Boundaries

General questions use history without unrelated telemetry. Knowledge questions retrieve approved sources. Live status needs fresh authorized observations. Synthetic cases are explicit and labelled. No synthetic fallback masks a failed source.

The model sees bounded context and normalized evidence, never source credentials. It cannot grant access or approve its own evidence. The graph projects actual permitted records rather than inferring an organizational chart.

See [the workspace guide](AGENT_WORKSPACE.md) for integration configuration, schemas, permissions, API paths and verification limits.
