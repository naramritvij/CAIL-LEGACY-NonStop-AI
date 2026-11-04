export interface Operator {
  id: string;
  name: string;
  local_demo: boolean;
  can_review: boolean;
  can_read_live: boolean;
  auth_method: string;
}
export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}
export interface Evidence {
  id: string;
  title: string;
  text: string;
  type: string;
  synthetic: boolean;
  document_id?: string;
  owner_name?: string;
  observed_at?: string;
  source_url?: string;
  source_id?: string;
  system_id?: string;
}
export interface AgentStep {
  agent: string;
  status: string;
  detail: string;
  elapsed_ms: number;
}
export interface AnswerMeta {
  answer?: string;
  status?: string;
  route?: string;
  sources?: Evidence[];
  citations?: string[];
  trace?: AgentStep[];
  memory?: { saved_turns_before: number; context_turns: number };
  model?: string | null;
}
export interface Message {
  id: string;
  role: string;
  content: string;
  status: string;
  created_at: string;
  metadata: AnswerMeta;
}
export interface GraphNode {
  id: string;
  entity_id: string;
  kind: "person" | "document" | "topic" | "entity" | "source";
  label: string;
  status: string;
  owner_name?: string;
  updated_at?: string;
  entity_type?: string;
  dataset_id?: string;
  source_kind?: string;
  observed_at?: string;
  stale?: boolean;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
  last_accessed?: string;
  count?: number;
  dataset_id?: string;
  stale?: boolean;
}
export interface TopologyDataset {
  id: string;
  title: string;
  document_id: string | null;
  source_kind: string;
  source_id: string | null;
  node_count: number;
  edge_count: number;
  observed_at: string | null;
  stale: boolean;
  status: string;
  sha256: string;
}
export interface TopologySource {
  id: string;
  configured: boolean;
  can_sync: boolean;
}
export interface GraphEntityDetail {
  id: string;
  label: string;
  local_id: string;
  entity_type: string;
  status: string;
  properties: Record<string, string | number | boolean | null>;
  source_kind: string;
  observed_at: string | null;
  sha256: string;
  relationship_count: number;
  stale?: boolean;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  revision: number;
  updated_at: string;
  total_documents: number;
  truncated: boolean;
  cursor: string;
  datasets: TopologyDataset[];
  sources: TopologySource[];
  total_nodes: number;
  total_edges: number;
  node_limit: number;
  edge_limit: number;
  events: {
    sequence: number;
    person_id: string;
    document_id: string;
    kind: string;
    created_at: string;
  }[];
}
export interface KnowledgeDocument {
  id: string;
  title: string;
  owner_name: string;
  owner_id: string;
  filename: string;
  content: string;
  topic: string;
  status: string;
  created_at: string;
  can_review: boolean;
  can_submit: boolean;
  review_notes?: string;
  sha256: string;
}
export interface Observation {
  id: string;
  name?: string;
  value?: number | string;
  unit?: string;
  component?: string;
  message?: string;
  state?: string;
  timestamp?: string;
}
export interface Snapshot {
  tool_id: string;
  observed_at: string;
  system_id: string;
  evidence: Observation[];
  health_signal: string;
  snapshot_sha256: string;
}
export interface Connection {
  id: string;
  name: string;
  interface: string;
  description: string;
  documentation: string;
  configured: boolean;
  connected: boolean;
  status: string;
  last_observed_at: string | null;
  snapshot: Snapshot | null;
  history: Snapshot[];
  metrics_configured?: boolean;
  metrics_connected?: boolean;
  topology_configured?: boolean;
  topology_connected?: boolean;
  topology_node_count?: number;
}

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = (import.meta.env.VITE_API_BASE || "/api/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/workspace${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* Preserve the readable status message. */
    }
    throw new WorkspaceError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}
export function shortTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
