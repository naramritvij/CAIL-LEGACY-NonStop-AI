import type { GraphData, GraphEdge, GraphNode } from "./types";

export interface GraphNeighborhood {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated?: boolean;
  total_edges?: number;
}

// The latest overview owns every record it contains. A previous drill-down
// supplies only additional records, with current permission witnesses.
export function reconcileExpansion(
  graph: GraphData,
  expansion: GraphNeighborhood,
): GraphNeighborhood {
  const currentNodes = new Set(graph.nodes.map((node) => node.id));
  const currentEdges = new Set(graph.edges.map((edge) => edge.id));
  const datasets = new Map(
    graph.datasets.map((dataset) => [dataset.id, dataset]),
  );
  const documents = new Set(
    graph.datasets.map((dataset) => dataset.document_id).filter(Boolean),
  );
  let nodes = expansion.nodes.filter((node) => {
    if (currentNodes.has(node.id)) return false;
    if (node.dataset_id && !datasets.has(node.dataset_id)) return false;
    if (node.kind === "document" && !documents.has(node.entity_id)) return false;
    return (
      node.source_kind !== "semantic_knowledge" ||
      Boolean(node.permission_dataset_ids?.some((id) => datasets.has(id)))
    );
  });
  const allowed = new Set([...currentNodes, ...nodes.map((node) => node.id)]);
  nodes = nodes.map((node) => {
    const dataset = node.dataset_id ? datasets.get(node.dataset_id) : null;
    return dataset?.source_kind === "live_topology"
      ? {
          ...node,
          stale: dataset.stale,
          observed_at: dataset.observed_at || undefined,
          status: dataset.stale ? "stale" : node.status,
        }
      : node;
  });
  const edges = expansion.edges
    .filter(
      (edge) =>
        !currentEdges.has(edge.id) &&
        (!edge.dataset_id || datasets.has(edge.dataset_id)) &&
        (!edge.document_id || documents.has(edge.document_id)) &&
        // Shared learning can be revoked independently of document visibility.
        !["knows", "learned_from", "asked_about"].includes(edge.kind) &&
        allowed.has(edge.source) &&
        allowed.has(edge.target),
    )
    .map((edge) => {
      const dataset = edge.dataset_id ? datasets.get(edge.dataset_id) : null;
      return dataset?.source_kind === "live_topology"
        ? { ...edge, stale: dataset.stale }
        : edge;
    });
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  nodes = nodes.filter(
    (node) =>
      !["person", "topic", "source"].includes(node.kind) || connected.has(node.id),
  );
  return { ...expansion, nodes, edges };
}

export function retainTrail(
  neighborhood: GraphNeighborhood,
  trail: GraphNeighborhood | null,
): GraphNeighborhood {
  if (!trail) return neighborhood;
  return {
    ...neighborhood,
    nodes: [
      ...new Map(
        [...trail.nodes, ...neighborhood.nodes].map((node) => [node.id, node]),
      ).values(),
    ],
    edges: [
      ...new Map(
        [...trail.edges, ...neighborhood.edges].map((edge) => [edge.id, edge]),
      ).values(),
    ],
  };
}

export function mergeGraphSnapshot(
  graph: Pick<GraphData, "nodes" | "edges">,
  expansion: GraphNeighborhood,
) {
  const nodes = new Map(
    [...expansion.nodes, ...graph.nodes].map((node) => [node.id, node]),
  );
  const edges = new Map(
    [...expansion.edges, ...graph.edges].map((edge) => [edge.id, edge]),
  );
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter(
      (edge) => nodes.has(edge.source) && nodes.has(edge.target),
    ),
    index: nodes,
  };
}
