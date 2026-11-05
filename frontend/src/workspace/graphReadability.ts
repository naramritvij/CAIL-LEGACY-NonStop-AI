import type { MultiDirectedGraph } from "graphology";

export const MAX_HIGHLIGHTED_CONNECTIONS = 24;
export const MAX_GRAPH_LABELS = 24;

export type GraphSelection = {
  nodes: Set<string>;
  edges: Set<string>;
  total: number;
  trail?: boolean;
};

function priority(attributes: Record<string, unknown>) {
  if (attributes.entity_type === "subsystem") return 2;
  switch (attributes.kind) {
    case "person":
      return 0;
    case "document":
      return 1;
    case "topic":
      return 2;
    case "source":
      return 3;
    default:
      return attributes.entity_type === "passage" ? 5 : 4;
  }
}

/** A display budget, never a mutation or truncation of the source graph.
 * Choose contributor/topic/attachment links before sampling passage leaves.
 * IDs break ties so polling and layout movement cannot reshuffle selection. */
export function graphSelection(
  graph: MultiDirectedGraph,
  selected: string | null,
  visible: Set<string>,
): GraphSelection | null {
  const trail: string[] = graph.getAttribute("trailEdges") || [];
  if (trail.length) {
    const edges = trail
      .slice(0, 8)
      .filter(
        (id) =>
          graph.hasEdge(id) &&
          graph.extremities(id).every((endpoint) => visible.has(endpoint)),
      );
    return {
      edges: new Set(edges),
      nodes: new Set(edges.flatMap((id) => graph.extremities(id))),
      total: edges.length,
      trail: true,
    };
  }
  if (!selected || !graph.hasNode(selected) || !visible.has(selected))
    return null;
  const candidates = graph
    .edges(selected)
    .filter((id) => {
      const [source, target] = graph.extremities(id);
      return visible.has(source) && visible.has(target);
    })
    .map((id) => {
      const [source, target] = graph.extremities(id);
      const other = source === selected ? target : source;
      return { id, other, rank: priority(graph.getNodeAttributes(other)) };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.other.localeCompare(b.other) ||
        a.id.localeCompare(b.id),
    );
  const chosen = candidates
    .filter((item) => item.rank < 5)
    .slice(0, MAX_HIGHLIGHTED_CONNECTIONS);
  const passages = candidates.filter((item) => item.rank === 5);
  const slots = Math.min(
    MAX_HIGHLIGHTED_CONNECTIONS - chosen.length,
    passages.length,
  );
  for (let i = 0; i < slots; i++)
    chosen.push(passages[Math.floor((i * passages.length) / slots)]);
  return {
    nodes: new Set([selected, ...chosen.map((item) => item.other)]),
    edges: new Set(chosen.map((item) => item.id)),
    total: candidates.length,
  };
}

export type LabelBox = { x: number; y: number; width: number; height: number };

/** Reject collisions instead of drawing after a fixed number of failed tries. */
export function placeGraphLabel(
  point: { x: number; y: number; size: number },
  width: number,
  viewport: { width: number; height: number },
  occupied: LabelBox[],
): LabelBox | null {
  const height = 18,
    gap = point.size + 7;
  const positions = [
    { x: point.x + gap, y: point.y - height / 2 },
    { x: point.x - gap - width, y: point.y - height / 2 },
    { x: point.x - width / 2, y: point.y - gap - height },
    { x: point.x - width / 2, y: point.y + gap },
  ];
  for (const position of positions) {
    const box = { ...position, width, height };
    if (
      box.x < 12 ||
      box.x + width > viewport.width - 12 ||
      box.y < 88 ||
      box.y + height > viewport.height - 72
    )
      continue;
    if (
      occupied.some(
        (other) =>
          box.x < other.x + other.width + 6 &&
          box.x + width + 6 > other.x &&
          box.y < other.y + other.height + 4 &&
          box.y + height + 4 > other.y,
      )
    )
      continue;
    return box;
  }
  return null;
}

export function graphLabelPriority(
  id: string,
  attributes: Record<string, unknown>,
  selected: string | null,
  selection: GraphSelection | null,
  ratio: number,
): number | null {
  if (id === selected) return -1;
  if (selection && !selection.nodes.has(id)) return null;
  const rank = priority(attributes);
  if (selection?.trail) return rank;
  if (rank < 4) return rank;
  if (
    ["command", "event"].includes(String(attributes.entity_type)) &&
    ratio < 1.3
  )
    return rank;
  // Passage excerpts belong in the inspector until the user zooms in.
  return selection && ratio < (rank === 5 ? 0.35 : 0.8) ? rank : null;
}

export function drawGraphLabels(
  ctx: CanvasRenderingContext2D,
  graph: MultiDirectedGraph,
  points: Map<string, { x: number; y: number; size: number; alpha?: number }>,
  selected: string | null,
  selection: GraphSelection | null,
  ratio: number,
  viewport: { width: number; height: number },
) {
  const candidates = [...points]
    .map(([id, point]) => ({
      id,
      point,
      rank: graphLabelPriority(
        id,
        graph.getNodeAttributes(id),
        selected,
        selection,
        ratio,
      ),
    }))
    .filter((item) => item.rank !== null)
    .sort((a, b) => a.rank! - b.rank! || a.id.localeCompare(b.id));
  const boxes: LabelBox[] = [];
  for (const { id, point } of candidates) {
    if (boxes.length >= MAX_GRAPH_LABELS) break;
    if (
      point.x < 0 ||
      point.x > viewport.width ||
      point.y < 88 ||
      point.y > viewport.height - 72
    )
      continue;
    ctx.font = `${id === selected ? 600 : 400} 12px Inter, sans-serif`;
    const label = String(graph.getNodeAttribute(id, "label")).replace(
      /\s+/g,
      " ",
    );
    let text = label.slice(0, 80);
    const maxWidth = Math.min(240, viewport.width - 40);
    while (
      text.length &&
      ctx.measureText(text + (text.length < label.length ? "…" : "")).width >
        maxWidth
    )
      text = text.slice(0, -1);
    if (!text) continue;
    if (text.length < label.length) text = text.trimEnd() + "…";
    const width = ctx.measureText(text).width + 8;
    const box = placeGraphLabel(point, width, viewport, boxes);
    if (!box) continue;
    boxes.push(box);
    ctx.globalAlpha = point.alpha ?? 1;
    ctx.fillStyle = "#fcfefbf2";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = "#395c49";
    ctx.fillText(text, box.x + 4, box.y + 13);
  }
  ctx.globalAlpha = 1;
}
