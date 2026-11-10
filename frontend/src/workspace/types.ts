export type DemoRole = "junior" | "senior" | "reviewer";

export const DEMO_ROLE_LABELS: Record<DemoRole, string> = {
  junior: "Junior Operator",
  senior: "Senior Contributor",
  reviewer: "Independent Reviewer",
};

export interface Operator {
  id: string;
  name: string;
  local_demo: boolean;
  can_review: boolean;
  can_read_live: boolean;
  can_manage_members?: boolean;
  transfer_demo?: boolean;
  demo_roles?: { id: string; name: string; role?: DemoRole }[];
  auth_method: string;
}
export interface Conversation {
  rehearsal_label?: string | null;
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
  subsystem?: string;
  person_role?: string;
  demo_role?: DemoRole;
  needs_review?: boolean;
  superseded?: boolean;
  category?: string;
  permission_dataset_ids?: string[];
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
  document_id?: string;
  citation_id?: string;
  basis?: string;
  assertion_status?: string;
  created_at?: string;
}
export interface GraphAccessPath {
  edgeId: string;
  contributorEdgeId: string;
  firstAccess: boolean;
}
export interface TopologyDataset {
  id: string;
  title: string;
  document_id: string | null;
  source_kind: string;
  source_id: string | null;
  system_id: string | null;
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
  mode?: string;
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
  system_id: string | null;
  sha256: string;
  relationship_count: number;
  stale?: boolean;
  evidence?: {
    citation_id: string;
    document_id: string;
    title: string;
    quote: string;
    method: string;
    edition?: string;
    source_url?: string;
    status?: string;
  }[];
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
  semantic?: {
    concepts: number;
    expert_notes: number;
    learning_records: number;
    needs_index: number;
    bounded: boolean;
  };
  events: {
    sequence: number;
    person_id: string;
    document_id: string;
    kind: string;
    created_at: string;
    detail?: {
      concept_id?: string;
      previous_id?: string;
      private_activity?: boolean;
    };
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
  access?: { edge_id: string; first_access: boolean };
  expert_note?: {
    category: string;
    signed_at: string;
    needs_review: boolean;
    superseded: boolean;
    concept_ids: string[];
    citations: { citation_id: string; relation: string }[];
  } | null;
  reference?: {
    source_url?: string;
    edition?: string;
    source_kind: string;
    file_sha256: string;
  } | null;
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
  last_checked_at?: string | null;
  id: string;
  name: string;
  interface: string;
  description: string;
  documentation: string;
  configured: boolean;
  topology_mode?: string;
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
  apiBase: string = import.meta.env.VITE_API_BASE || "/api/v1",
): Promise<T> {
  const base = apiBase.replace(/\/$/, "");
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
