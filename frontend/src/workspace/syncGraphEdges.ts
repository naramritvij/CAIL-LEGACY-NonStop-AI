import type { MultiDirectedGraph } from "graphology";
import type { GraphEdge } from "./types";
import { relationshipColor } from "./semanticPresentation";

/** Preserve node positions while applying a source's current relationships. */
export function syncGraphEdges(graph: MultiDirectedGraph, edges: GraphEdge[]) {
  let changed = false;
  const ids = new Set(edges.map((edge) => edge.id));
  graph.forEachEdge((id) => {
    if (!ids.has(id)) {
      graph.dropEdge(id);
      changed = true;
    }
  });
  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
      if (graph.hasEdge(edge.id)) {
        graph.dropEdge(edge.id);
        changed = true;
      }
      continue;
    }
    if (
      graph.hasEdge(edge.id) &&
      (graph.source(edge.id) !== edge.source ||
        graph.target(edge.id) !== edge.target)
    ) {
      graph.dropEdge(edge.id);
      changed = true;
    }
    const attributes = {
      label: edge.label,
      kind: edge.kind,
      color: relationshipColor(edge.kind),
      size: edge.kind === "documents" ? 1.2 : 0.5,
    };
    if (!graph.hasEdge(edge.id)) {
      graph.addDirectedEdgeWithKey(
        edge.id,
        edge.source,
        edge.target,
        attributes,
      );
      changed = true;
    } else if (
      graph.getEdgeAttribute(edge.id, "label") !== edge.label ||
      graph.getEdgeAttribute(edge.id, "kind") !== edge.kind
    ) {
      graph.mergeEdgeAttributes(edge.id, attributes);
      changed = true;
    }
  }
  return changed;
}
