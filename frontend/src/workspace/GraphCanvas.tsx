import { useEffect, useRef, useState } from "react";
import { MultiDirectedGraph } from "graphology";
import Sigma from "sigma";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { CanvasNetwork } from "./CanvasNetwork";
import { PerspectiveNetwork } from "./PerspectiveNetwork";
import { Force3DLayout } from "./Force3DLayout";
import { graphLabelPriority, graphSelection } from "./graphReadability";
import { syncGraphEdges } from "./syncGraphEdges";
import { clusterTarget, CONCEPT_COLORS } from "./semanticPresentation";
import { Focus, Maximize2, Minus, Pause, Play, Plus, RotateCw } from "lucide-react";
import type { GraphAccessPath, GraphEdge, GraphNode } from "./types";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected: string | null;
  visible: Set<string>;
  focusOnly: boolean;
  onSelect: (id: string | null) => void;
  dimension?: "2d" | "3d";
  trailEdges?: string[];
  spotlight?: string | null;
  viewKey?: string;
  newDocumentIds?: string[];
  accessPath?: GraphAccessPath;
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
const EMPTY_TRAIL: string[] = [];

export function GraphCanvas({
  nodes,
  edges,
  selected,
  visible,
  focusOnly,
  onSelect,
  dimension = "3d",
  trailEdges = EMPTY_TRAIL,
  spotlight = null,
  viewKey = "",
  newDocumentIds = EMPTY_TRAIL,
  accessPath,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<MultiDirectedGraph | null>(null);
  const renderer = useRef<Sigma | null>(null);
  const fallback = useRef<CanvasNetwork | PerspectiveNetwork | null>(null);
  const layout = useRef<FA2Layout | Force3DLayout | null>(null);
  const onSelectRef = useRef(onSelect);
  const positionCache = useRef(new Map<string, { x: number; y: number; z: number }>());
  const animation = useRef<number>(0);
  const layoutTimer = useRef<number>(0);
  const [failure, setFailure] = useState("");
  const [canvasMode, setCanvasMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [selectionSummary, setSelectionSummary] = useState({
    shown: 0,
    total: 0,
  });
  const reduced = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [autoOrbit, setAutoOrbit] = useState(!reduced.current);
  const [reduceMotion, setReduceMotion] = useState(reduced.current);
  const accessEdgeId = accessPath?.edgeId;
  const contributorEdgeId = accessPath?.contributorEdgeId;
  const firstAccess = accessPath?.firstAccess;
  const showingAccessPath = dimension === "3d" && Boolean(accessPath);
  const highlightedRelationships = showingAccessPath ? 2 : selectionSummary.shown;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduced.current = media.matches;
      setReduceMotion(media.matches);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  onSelectRef.current = onSelect;

  function settle(milliseconds = 2200) {
    const data = graph.current;
    if (!data || data.order < 2 || reduced.current) return;
    window.clearTimeout(layoutTimer.current);
    layout.current?.kill();
    layout.current =
      dimension === "3d"
        ? new Force3DLayout(data, milliseconds, () => {
            fallback.current?.freezeFit();
            setRunning(false);
          })
        : new FA2Layout(data, {
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
    setFailure("");
    setCanvasMode(false);
    setRatio(1);
    try {
      if (dimension === "3d") {
        fallback.current = new PerspectiveNetwork(
          data,
          container.current,
          (id) => onSelectRef.current(id),
          setRatio,
          () => {
            layout.current?.stop();
            setRunning(false);
          },
          reduced.current,
        );
        setCanvasMode(false);
      } else {
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
          labelGridCellSize: 260,
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
      }
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
      data.forEachNode((id, attributes) =>
        positionCache.current.set(id, {
          x: Number(attributes.x),
          y: Number(attributes.y),
          z: Number(attributes.z || 0),
        }),
      );
      window.clearTimeout(layoutTimer.current);
      cancelAnimationFrame(animation.current);
      layout.current?.kill();
      renderer.current?.kill();
      fallback.current?.kill();
      fallback.current = null;
      renderer.current = null;
      graph.current = null;
    };
  }, [dimension]);

  useEffect(() => {
    const data = graph.current,
      sigma = renderer.current;
    if (!data) return;
    const nodeIds = new Set(nodes.map((node) => node.id));
    const existing = data.order;
    let changed = false;
    data.forEachNode((id, attributes) => {
      if (!nodeIds.has(id)) {
        positionCache.current.set(id, {
          x: attributes.x as number,
          y: attributes.y as number,
          z: Number(attributes.z || 0),
        });
        data.dropNode(id);
        changed = true;
      }
    });
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
      adjacency.get(edge.target)!.push(edge.source);
      adjacency.get(edge.source)!.push(edge.target);
    }
    const additions: string[] = [];
    const entitySize =
      SIZE.entity *
      Math.min(1, Math.pow(1500 / Math.max(1, nodes.length), 0.25));
    for (const [index, node] of nodes.entries()) {
      const size =
        node.entity_type === "subsystem"
          ? 11
          : node.entity_type === "expert_note"
            ? 8
            : node.entity_type === "command" || node.entity_type === "event"
              ? 5
              : node.kind === "entity"
                ? entitySize
                : SIZE[node.kind];
      const values = {
        label: node.status === "you" ? node.label + " (you)" : node.label,
        kind: node.kind,
        entity_type: node.entity_type,
        ...clusterTarget(node),
        color: node.stale
          ? "#b4b9b6"
          : CONCEPT_COLORS[node.entity_type || ""] ||
            (node.entity_type === "passage"
              ? "#94a8ba"
              : node.entity_type === "command_reference"
                ? "#b79b63"
                : node.entity_type === "mentioned_term"
                  ? "#9984ae"
                  : COLORS[node.kind]),
        size,
        baseSize: size,
        zIndex: node.kind === "entity" ? 0 : 1,
      };
      if (!data.hasNode(node.id)) {
        const neighbor = adjacency.get(node.id)?.find((id) => data.hasNode(id)),
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
        let hash = 2166136261;
        for (const character of node.id)
          hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
        const depth = ((hash >>> 0) % 1000) / 1000 - 0.5;
        const z =
          node.kind === "person"
            ? 160
            : node.kind === "document"
              ? -120 + depth * 100
              : node.kind === "topic"
                ? -150
                : depth * Math.max(150, Math.sqrt(nodes.length) * 8);
        data.addNode(node.id, { ...values, ...position, z: saved?.z ?? z });
        additions.push(node.id);
        changed = true;
      } else {
        const old = data.getNodeAttributes(node.id);
        if (
          old.label !== values.label ||
          old.entity_type !== values.entity_type ||
          old.color !== values.color ||
          old.baseSize !== values.baseSize
        )
          data.mergeNodeAttributes(node.id, values);
      }
    }
    const addedEdges = edges
      .filter((edge) => edge.kind !== "accessed" && !data.hasEdge(edge.id))
      .map((edge) => edge.id);
    changed = syncGraphEdges(data, edges) || changed;
    if (positionCache.current.size > 25000) positionCache.current.clear();
    sigma?.setSetting("hideEdgesOnMove", nodes.length > 5000);
    if (!existing && data.order)
      void sigma
        ?.getCamera()
        .animatedReset({ duration: reduced.current ? 0 : 300 });
    if (!existing && data.order) fallback.current?.fit();
    fallback.current?.refresh();
    if (existing && fallback.current instanceof PerspectiveNetwork) {
      fallback.current.arriveEdges(addedEdges);
      fallback.current.arrive(
        additions.filter((id) => newDocumentIds.includes(id)),
      );
    }
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
  }, [nodes, edges, dimension, newDocumentIds]);

  useEffect(() => {
    if (fallback.current instanceof PerspectiveNetwork) {
      fallback.current.setReducedMotion(reduceMotion);
      fallback.current.setAutoOrbit(autoOrbit);
    }
  }, [dimension, autoOrbit, reduceMotion]);

  useEffect(() => {
    graph.current?.setAttribute("trailEdges", trailEdges);
  }, [trailEdges, dimension]);
  useEffect(() => {
    const data = graph.current,
      sigma = renderer.current;
    if (!data) return;
    fallback.current?.setView(selected, visible, focusOnly);
    const selection = graphSelection(data, selected, visible);
    setSelectionSummary({
      shown: selection?.edges.size ?? 0,
      total: selection?.total ?? 0,
    });
    if (!sigma) return;
    const neighborhood = selection?.nodes;
    sigma.setSetting("nodeReducer", (id, attributes) => {
      const active = neighborhood?.has(id);
      const label = String(attributes.label);
      return {
        ...attributes,
        label:
          graphLabelPriority(
            id,
            attributes,
            selected,
            selection,
            sigma.getCamera().ratio,
          ) === null
            ? ""
            : label.length > 32
              ? label.slice(0, 31) + "…"
              : label,
        hidden:
          !visible.has(id) || Boolean(focusOnly && neighborhood && !active),
        color:
          neighborhood && !active ? "#e1e6e1" : (attributes.color as string),
        highlighted: selected === id,
        forceLabel: id === selected,
        size: (attributes.size as number) * (selected === id ? 1.5 : 1),
        zIndex: selected === id ? 3 : active ? 2 : 0,
      };
    });
    sigma.setSetting("edgeReducer", (id, attributes) => {
      const [source, target] = data.extremities(id);
      const incident = selection?.edges.has(id);
      return {
        ...attributes,
        hidden:
          !visible.has(source) ||
          !visible.has(target) ||
          Boolean(focusOnly && neighborhood && !incident),
        color: selected
          ? incident
            ? selection?.trail
              ? "#9073b1"
              : String(attributes.color)
            : "#edf0ec"
          : (attributes.color as string),
        size: incident ? 1.5 : (attributes.size as number),
        forceLabel: false,
      };
    });
    sigma.setSetting("renderEdgeLabels", false);
    sigma.refresh();
  }, [selected, visible, focusOnly, nodes, edges, dimension, trailEdges]);

  useEffect(() => {
    const perspective = fallback.current;
    if (!(perspective instanceof PerspectiveNetwork)) return;
    if (accessEdgeId && contributorEdgeId && firstAccess !== undefined) {
      window.clearTimeout(layoutTimer.current);
      layout.current?.stop();
      setRunning(false);
      perspective.showAccessPath({ edgeId: accessEdgeId, contributorEdgeId, firstAccess });
    } else perspective.showAccessPath();
  }, [accessEdgeId, contributorEdgeId, firstAccess, dimension]);

  useEffect(() => {
    if (!viewKey) return;
    fallback.current?.fit();
    void renderer.current
      ?.getCamera()
      .animatedReset({ duration: reduced.current ? 0 : 650 });
    if (!reduced.current)
      container.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 450,
      });
  }, [viewKey, dimension]);
  useEffect(() => {
    if (!spotlight || !graph.current?.hasNode(spotlight)) return;
    layout.current?.stop();
    setRunning(false);
    fallback.current?.focus(spotlight, reduced.current, true);
    const sigma = renderer.current;
    const point = sigma?.getNodeDisplayData(spotlight);
    if (point && sigma)
      void sigma
        .getCamera()
        .animate(
          { x: point.x, y: point.y, ratio: 0.3 },
          { duration: reduced.current ? 0 : 850 },
        );
  }, [spotlight, dimension]);

  function focus() {
    if (selected) fallback.current?.focus(selected, reduced.current);
    const sigma = renderer.current;
    if (!sigma || !selected) return;
    const selection = graphSelection(sigma.getGraph(), selected, visible);
    if (!selection) return;
    const points = [...selection.nodes]
      .map((id) => sigma.getNodeDisplayData(id)!)
      .filter(Boolean);
    const projected = points.map((point) => sigma.framedGraphToViewport(point));
    const dimensions = sigma.getDimensions();
    const spanX =
      Math.max(...projected.map((p) => p.x)) -
      Math.min(...projected.map((p) => p.x));
    const spanY =
      Math.max(...projected.map((p) => p.y)) -
      Math.min(...projected.map((p) => p.y));
    if (points.length)
      void sigma.getCamera().animate(
        {
          x:
            (Math.min(...points.map((p) => p.x)) +
              Math.max(...points.map((p) => p.x))) /
            2,
          y:
            (Math.min(...points.map((p) => p.y)) +
              Math.max(...points.map((p) => p.y))) /
            2,
          ratio: Math.max(
            0.025,
            sigma.getCamera().ratio *
              Math.max(
                (spanX + 100) / Math.max(100, dimensions.width - 100),
                (spanY + 100) / Math.max(100, dimensions.height - 160),
              ),
          ),
        },
        { duration: reduced.current ? 0 : 450 },
      );
  }
  return (
    <div className="network-stage" id="graph-network" data-dimension={dimension}>
      <div
        ref={container}
        className="network-webgl"
        aria-label={`Interactive ${dimension === "3d" ? "3D" : "2D"} network with ${nodes.length} nodes and ${edges.length} relationships. Use search and the node list for keyboard navigation.`}
        role="img"
      />
      {failure && (
        <div className="network-render-error" role="status">
          {failure}
        </div>
      )}
      {(canvasMode || dimension === "3d") && (
        <span className="network-render-mode">
          {dimension === "3d" ? "3D perspective" : "Canvas mode"}
        </span>
      )}
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
        {dimension === "3d" && (
          <button
            className={"icon-button orbit-toggle" + (autoOrbit && !reduceMotion ? " active" : "")}
            aria-label={autoOrbit && !reduceMotion ? "Pause auto orbit" : "Start auto orbit"}
            aria-pressed={autoOrbit && !reduceMotion}
            title={reduceMotion ? "Reduced motion is enabled" : "Auto orbit pauses while you interact with the graph"}
            disabled={reduceMotion}
            onClick={() => setAutoOrbit((enabled) => !enabled)}
          >
            <RotateCw size={16} />
          </button>
        )}
      </div>
      <div className="network-legend">
        {(Object.keys(COLORS) as GraphNode["kind"][]).map((kind) => (
          <span key={kind}>
            <i style={{ background: COLORS[kind] }} />
            {kind === "entity" ? "Evidence / source entity" : kind}
          </span>
        ))}
        {Object.entries(CONCEPT_COLORS)
          .filter(([type]) => nodes.some((node) => node.entity_type === type))
          .map(([type, color]) => (
            <span key={type}>
              <i style={{ background: color }} />
              {type.replaceAll("_", " ")}
            </span>
          ))}
      </div>
      <div className="network-help">
        {dimension === "3d"
          ? "Drag background to orbit · Shift + drag to pan · Scroll to zoom"
          : "Scroll to zoom · Drag to pan · Select a node to explore its connections"}
      </div>
      {selected && selectionSummary.total > 0 && (
        <div className="network-selection-summary" role="status">
          <strong>
            {showingAccessPath
              ? "Access path"
              : trailEdges.length
              ? "Evidence trail"
              : focusOnly
                ? "Connection focus"
                : "Selected connections"}
          </strong>
          <span>
            {highlightedRelationships.toLocaleString()} of{" "}
            {selectionSummary.total.toLocaleString()} loaded relationships
            highlighted
            {selectionSummary.total > highlightedRelationships
              ? " · Browse Connected nodes for all loaded relationships"
              : ""}
          </span>
        </div>
      )}
    </div>
  );
}
