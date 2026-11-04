import { useEffect, useRef, useState } from "react";
import { MultiDirectedGraph } from "graphology";
import Sigma from "sigma";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { CanvasNetwork } from "./CanvasNetwork";
import { Focus, Maximize2, Minus, Pause, Play, Plus } from "lucide-react";
import type { GraphEdge, GraphNode } from "./types";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: string | null;
  visible: Set<string>;
  focusOnly: boolean;
  onSelect: (id: string | null) => void;
}
const COLORS: Record<GraphNode["kind"], string> = {
  person: "#72a269",
  document: "#3a8a73",
  topic: "#c0aa63",
  entity: "#6e91ad",
  source: "#9c83ad",
};
const SIZE: Record<GraphNode["kind"], number> = {
  person: 8,
  document: 6,
  topic: 6,
  entity: 2.8,
  source: 9,
};

export function GraphCanvas({
  nodes,
  edges,
  selected,
  visible,
  focusOnly,
  onSelect,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<MultiDirectedGraph | null>(null);
  const renderer = useRef<Sigma | null>(null);
  const fallback = useRef<CanvasNetwork | null>(null);
  const layout = useRef<FA2Layout | null>(null);
  const onSelectRef = useRef(onSelect);
  const positionCache = useRef(new Map<string, { x: number; y: number }>());
  const animation = useRef<number>(0);
  const layoutTimer = useRef<number>(0);
  const [failure, setFailure] = useState("");
  const [canvasMode, setCanvasMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [ratio, setRatio] = useState(1);
  const reduced = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  onSelectRef.current = onSelect;

  function settle(milliseconds = 2200) {
    const data = graph.current;
    if (!data || data.order < 2 || reduced.current) return;
    window.clearTimeout(layoutTimer.current);
    layout.current?.kill();
    layout.current = new FA2Layout(data, {
      settings: {
        barnesHutOptimize: true,
        barnesHutTheta: 0.7,
        gravity: 1,
        scalingRatio: 12,
        slowDown: 6,
        adjustSizes: false,
      },
    });
    layout.current.start();
    setRunning(true);
    layoutTimer.current = window.setTimeout(() => {
      layout.current?.stop();
      fallback.current?.freezeFit();
      setRunning(false);
    }, milliseconds);
  }

  useEffect(() => {
    if (!container.current) return;
    const data = new MultiDirectedGraph();
    graph.current = data;
    try {
      const sigma = new Sigma(data, container.current, {
        defaultEdgeType: "arrow",
        defaultEdgeColor: "#dbe4df",
        minEdgeThickness: 0.3,
        renderLabels: true,
        renderEdgeLabels: false,
        labelFont: "Inter, sans-serif",
        labelSize: 12,
        labelColor: { color: "#435b4e" },
        labelDensity: 0.3,
        labelRenderedSizeThreshold: 5,
        labelGridCellSize: 120,
        hideLabelsOnMove: true,
        hideEdgesOnMove: nodes.length > 5000,
        minCameraRatio: 0.006,
        maxCameraRatio: 8,
        stagePadding: 60,
        enableCameraRotation: false,
        zIndex: true,
      });
      renderer.current = sigma;
      sigma.on("clickNode", ({ node }) => onSelectRef.current(node));
      sigma.on("clickStage", () => onSelectRef.current(null));
      sigma.getCamera().on("updated", (state) => setRatio(state.ratio));
      let dragged: string | null = null;
      sigma.on("downNode", ({ node }) => {
        dragged = node;
        layout.current?.stop();
        setRunning(false);
        data.setNodeAttribute(node, "fixed", true);
        if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
      });
      sigma.getMouseCaptor().on("mousemovebody", (event) => {
        if (!dragged) return;
        const position = sigma.viewportToGraph(event);
        data.mergeNodeAttributes(dragged, position);
        event.preventSigmaDefault();
        event.original.preventDefault();
        event.original.stopPropagation();
      });
      sigma.getMouseCaptor().on("mouseup", () => {
        dragged = null;
      });
    } catch {
      container.current.replaceChildren();
      try {
        fallback.current = new CanvasNetwork(
          data,
          container.current,
          (id) => onSelectRef.current(id),
          setRatio,
          () => {
            layout.current?.stop();
            setRunning(false);
          },
        );
        setCanvasMode(true);
      } catch {
        setFailure(
          "This browser cannot draw the network. Use the searchable node list and connection details, or open a browser with canvas support.",
        );
      }
    }
    return () => {
      window.clearTimeout(layoutTimer.current);
      cancelAnimationFrame(animation.current);
      layout.current?.kill();
      renderer.current?.kill();
      fallback.current?.kill();
      fallback.current = null;
      renderer.current = null;
      graph.current = null;
    };
  }, []);

  useEffect(() => {
    const data = graph.current,
      sigma = renderer.current;
    if (!data) return;
    const nodeIds = new Set(nodes.map((node) => node.id)),
      edgeIds = new Set(edges.map((edge) => edge.id));
    const existing = data.order;
    let changed = false;
    data.forEachEdge((id) => {
      if (!edgeIds.has(id)) {
        data.dropEdge(id);
        changed = true;
      }
    });
    data.forEachNode((id, attributes) => {
      if (!nodeIds.has(id)) {
        positionCache.current.set(id, {
          x: attributes.x as number,
          y: attributes.y as number,
        });
        data.dropNode(id);
        changed = true;
      }
    });
    const adjacency = new Map<string, string>();
    for (const edge of edges) {
      if (data.hasNode(edge.source)) adjacency.set(edge.target, edge.source);
      if (data.hasNode(edge.target)) adjacency.set(edge.source, edge.target);
    }
    const additions: string[] = [];
    const entitySize =
      SIZE.entity *
      Math.min(1, Math.pow(1500 / Math.max(1, nodes.length), 0.25));
    for (const [index, node] of nodes.entries()) {
      const size = node.kind === "entity" ? entitySize : SIZE[node.kind];
      const values = {
        label: node.label,
        kind: node.kind,
        color: node.stale ? "#b4b9b6" : COLORS[node.kind],
        size,
        baseSize: size,
        zIndex: node.kind === "entity" ? 0 : 1,
      };
      if (!data.hasNode(node.id)) {
        const neighbor = adjacency.get(node.id),
          saved = positionCache.current.get(node.id);
        const angle = index * 2.3999632297,
          radius = Math.sqrt(index + 1) * 12;
        const position =
          saved ||
          (neighbor && data.hasNode(neighbor)
            ? {
                x:
                  (data.getNodeAttribute(neighbor, "x") as number) +
                  Math.cos(angle) * 30,
                y:
                  (data.getNodeAttribute(neighbor, "y") as number) +
                  Math.sin(angle) * 30,
              }
            : { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        data.addNode(node.id, { ...values, ...position });
        additions.push(node.id);
        changed = true;
      } else {
        const old = data.getNodeAttributes(node.id);
        if (
          old.label !== values.label ||
          old.color !== values.color ||
          old.baseSize !== values.baseSize
        )
          data.mergeNodeAttributes(node.id, values);
      }
    }
    for (const edge of edges) {
      if (!data.hasNode(edge.source) || !data.hasNode(edge.target)) continue;
      if (!data.hasEdge(edge.id)) {
        data.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
          label: edge.label,
          kind: edge.kind,
          color: edge.kind === "documents" ? "#72ad97" : "#dce5df",
          size: edge.kind === "documents" ? 1.2 : 0.5,
        });
        changed = true;
      }
    }
    if (positionCache.current.size > 25000) positionCache.current.clear();
    sigma?.setSetting("hideEdgesOnMove", nodes.length > 5000);
    if (!existing && data.order)
      void sigma
        ?.getCamera()
        .animatedReset({ duration: reduced.current ? 0 : 300 });
    if (!existing && data.order) fallback.current?.fit();
    fallback.current?.refresh();
    if (changed && data.order > 1) settle();
    if (
      existing &&
      additions.length > 0 &&
      additions.length < 80 &&
      !reduced.current
    ) {
      const began = performance.now();
      cancelAnimationFrame(animation.current);
      const animate = (now: number) => {
        const progress = Math.min(1, (now - began) / 450);
        for (const id of additions)
          if (data.hasNode(id))
            data.setNodeAttribute(
              id,
              "size",
              Number(data.getNodeAttribute(id, "baseSize")) *
                (0.2 + 0.8 * progress),
            );
        if (progress < 1) animation.current = requestAnimationFrame(animate);
      };
      animation.current = requestAnimationFrame(animate);
    }
  }, [nodes, edges]);

  useEffect(() => {
    const data = graph.current,
      sigma = renderer.current;
    if (!data) return;
    fallback.current?.setView(selected, visible, focusOnly);
    if (!sigma) return;
    const neighborhood =
      selected && data.hasNode(selected)
        ? new Set([selected, ...data.neighbors(selected)])
        : null;
    sigma.setSetting("nodeReducer", (id, attributes) => {
      const active = neighborhood?.has(id);
      return {
        ...attributes,
        hidden:
          !visible.has(id) || Boolean(focusOnly && neighborhood && !active),
        color:
          neighborhood && !active ? "#e1e6e1" : (attributes.color as string),
        highlighted: selected === id,
        forceLabel: Boolean(active),
        size: (attributes.size as number) * (selected === id ? 1.5 : 1),
        zIndex: selected === id ? 3 : active ? 2 : 0,
      };
    });
    sigma.setSetting("edgeReducer", (id, attributes) => {
      const [source, target] = data.extremities(id);
      const incident = source === selected || target === selected;
      return {
        ...attributes,
        hidden:
          !visible.has(source) ||
          !visible.has(target) ||
          Boolean(focusOnly && neighborhood && !incident),
        color: selected
          ? incident
            ? "#78a78f"
            : "#edf0ec"
          : (attributes.color as string),
        size: incident ? 1.5 : (attributes.size as number),
        forceLabel: incident && focusOnly,
      };
    });
    sigma.setSetting("renderEdgeLabels", Boolean(selected && focusOnly));
    sigma.refresh();
  }, [selected, visible, focusOnly, nodes, edges]);

  function focus() {
    if (selected) fallback.current?.focus(selected, reduced.current);
    const sigma = renderer.current;
    if (!sigma || !selected) return;
    const point = sigma.getNodeDisplayData(selected);
    if (point)
      void sigma.getCamera().animate(
        {
          x: point.x,
          y: point.y,
          ratio: Math.min(0.3, sigma.getCamera().ratio),
        },
        { duration: reduced.current ? 0 : 450 },
      );
  }
  return (
    <div className="network-stage">
      <div
        ref={container}
        className="network-webgl"
        aria-label={`Interactive network with ${nodes.length} nodes and ${edges.length} relationships. Use search and the node list for keyboard navigation.`}
        role="img"
      />
      {failure && (
        <div className="network-render-error" role="status">
          {failure}
        </div>
      )}
      {canvasMode && <span className="network-render-mode">Canvas mode</span>}
      <div className="network-controls">
        <button
          className="icon-button"
          aria-label="Zoom out"
          onClick={() => {
            void renderer.current
              ?.getCamera()
              .animatedUnzoom({ duration: reduced.current ? 0 : 180 });
            fallback.current?.zoom(1.5);
          }}
        >
          <Minus size={17} />
        </button>
        <span>{Math.round(100 / ratio)}%</span>
        <button
          className="icon-button"
          aria-label="Zoom in"
          onClick={() => {
            void renderer.current
              ?.getCamera()
              .animatedZoom({ duration: reduced.current ? 0 : 180 });
            fallback.current?.zoom(1 / 1.5);
          }}
        >
          <Plus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Fit all graph nodes"
          onClick={() => {
            renderer.current?.setCustomBBox(null);
            void renderer.current?.getCamera().animatedReset({ duration: 300 });
            fallback.current?.fit();
          }}
        >
          <Maximize2 size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Focus selected node"
          disabled={!selected}
          onClick={focus}
        >
          <Focus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={running ? "Pause graph layout" : "Arrange graph"}
          onClick={() => {
            if (running) {
              layout.current?.stop();
              setRunning(false);
            } else settle(3500);
          }}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
        </button>
      </div>
      <div className="network-legend">
        {(Object.keys(COLORS) as GraphNode["kind"][]).map((kind) => (
          <span key={kind}>
            <i style={{ background: COLORS[kind] }} />
            {kind === "entity" ? "Source entity" : kind}
          </span>
        ))}
      </div>
      <div className="network-help">
        Scroll to zoom · Drag to pan · Select a node to explore its connections
      </div>
    </div>
  );
}
