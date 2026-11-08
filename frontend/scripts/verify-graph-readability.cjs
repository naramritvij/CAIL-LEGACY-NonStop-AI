"use strict";
// Exercise the actual display policy and both CPU renderers against a dense
// manual, rather than a low-degree tree that cannot reproduce the regression.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const { MultiDirectedGraph } = require("graphology");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cail-readability-"));
try {
  for (const name of [
    "graphReadability",
    "PerspectiveNetwork",
    "CanvasNetwork",
    "syncGraphEdges",
    "semanticPresentation",
    "graphSnapshot",
  ]) {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/workspace", name + ".ts"),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    fs.writeFileSync(path.join(tmp, name + ".js"), compiled.outputText);
  }
  const {
    graphSelection,
    placeGraphLabel,
    drawGraphLabels,
    graphLabelPriority,
    MAX_HIGHLIGHTED_CONNECTIONS,
    MAX_GRAPH_LABELS,
  } = require(path.join(tmp, "graphReadability.js"));
  const graph = new MultiDirectedGraph();
  const { mergeGraphSnapshot, reconcileExpansion, retainTrail } = require(path.join(tmp, "graphSnapshot.js"));
  const current = {
    nodes: [
      { id: "document:source", entity_id: "source", kind: "document", status: "approved" },
      { id: "document:note", entity_id: "note", kind: "document", status: "approved" },
      { id: "concept:command", kind: "entity", source_kind: "semantic_knowledge" },
    ],
    edges: [{ id: "citation", source: "document:note", target: "document:source", kind: "supports", document_id: "note", assertion_status: "independently_reviewed" }],
    datasets: [
      { id: "document-source", document_id: "source" },
      { id: "document-note", document_id: "note" },
      { id: "live", document_id: null, source_kind: "live_topology", stale: true, observed_at: "new timestamp" },
    ],
  };
  const cached = {
    nodes: [
      { ...current.nodes[0], status: "draft" },
      { id: "document:private", entity_id: "private", kind: "document", status: "draft" },
      { id: "concept:private", kind: "entity", source_kind: "semantic_knowledge", permission_dataset_ids: ["document-private"] },
      { id: "person:learner", kind: "person" },
      { id: "observation", kind: "entity", dataset_id: "live", status: "observed", stale: false },
      { id: "concept:extra", kind: "entity", source_kind: "semantic_knowledge", permission_dataset_ids: ["document-source"] },
    ],
    edges: [
      { ...current.edges[0], assertion_status: "awaiting_review" },
      { id: "learning", source: "person:learner", target: "document:note", kind: "knows", document_id: "note" },
      { id: "private-link", source: "document:private", target: "concept:command", kind: "about", document_id: "private" },
      { id: "observed-term", source: "observation", target: "concept:command", dataset_id: "live", kind: "mentions_concept", stale: false },
      { id: "extra-evidence", source: "document:source", target: "concept:extra", kind: "documents_concept", document_id: "source" },
      { id: "dangling", source: "absent", target: "concept:command", kind: "about" },
    ],
  };
  const merged = mergeGraphSnapshot(current, cached);
  assert.equal(merged.index.get("document:source").status, "approved", "A cached draft cannot overwrite the latest review state");
  assert.equal(merged.edges.find(e => e.id === "citation").assertion_status, "independently_reviewed");
  assert(!merged.edges.some(e => e.id === "dangling"));
  const reconciled = reconcileExpansion(current, cached);
  assert(!reconciled.nodes.some(n => ["document:private", "concept:private", "person:learner"].includes(n.id)), "Revoked evidence and unshared learners leave the cache");
  assert(!reconciled.edges.some(e => ["learning", "private-link", "dangling"].includes(e.id)));
  assert(reconciled.nodes.some(n => n.id === "concept:extra"), "Permitted concepts outside the overview remain expandable");
  assert.equal(reconciled.nodes.find(n => n.id === "observation").status, "stale");
  assert.equal(reconciled.edges.find(e => e.id === "observed-term").stale, true);
  const nextStep = { nodes: [current.nodes[0]], edges: [] };
  const retained = retainTrail(nextStep, { nodes: [cached.nodes[5]], edges: [cached.edges[4]] });
  assert(retained.nodes.some(n => n.id === "concept:extra"), "Loading a trail step cannot erase the remaining path");
  assert(retained.edges.some(e => e.id === "extra-evidence"));
  function node(id, kind, entity_type, index = 0) {
    graph.addNode(id, {
      label: id === "manual" ? "Large reference manual" : id,
      kind,
      entity_type,
      size: kind === "entity" ? 2 : 7,
      color: "#7a9e89",
      x: Math.cos(index * 2.4) * 160,
      y: Math.sin(index * 2.4) * 160,
      z: (index % 100) - 50,
    });
  }
  node("manual", "document");
  node("owner", "person");
  node("topic", "topic");
  node("attached-note", "document");
  node("source", "source");
  node("command", "entity", "command_reference");
  for (let i = 0; i < 1222; i++) {
    const id = "passage-" + String(i).padStart(4, "0");
    node(id, "entity", "passage", i);
    graph.addDirectedEdgeWithKey("contains-" + i, "manual", id, {
      label: "contains",
    });
  }
  for (const id of ["owner", "topic", "attached-note", "source"])
    graph.addDirectedEdgeWithKey("link-" + id, "manual", id, {
      label: "relationship",
    });
  graph.addDirectedEdgeWithKey("owner-access", "owner", "manual", {
    label: "accessed",
  });
  graph.addDirectedEdgeWithKey("mentions-command", "passage-0600", "command", {
    label: "mentions",
  });
  const visible = new Set(graph.nodes());
  const original = JSON.stringify(graph.export());
  const selection = graphSelection(graph, "manual", visible);
  assert.equal(selection.total, 1227);
  assert.equal(selection.edges.size, MAX_HIGHLIGHTED_CONNECTIONS);
  for (const id of ["owner", "topic", "attached-note", "source"])
    assert(selection.nodes.has(id));
  assert(
    selection.edges.has("owner-access"),
    "Parallel access relationship stays available",
  );
  assert(selection.nodes.size <= MAX_HIGHLIGHTED_CONNECTIONS + 1);
  assert.equal(
    JSON.stringify(graph.export()),
    original,
    "Source records must remain intact",
  );
  const reordered = new MultiDirectedGraph();
  for (const id of graph.nodes().reverse())
    reordered.addNode(id, graph.getNodeAttributes(id));
  for (const id of graph.edges().reverse())
    reordered.addDirectedEdgeWithKey(
      id,
      ...graph.extremities(id),
      graph.getEdgeAttributes(id),
    );
  assert.deepEqual(
    [...graphSelection(reordered, "manual", visible).edges],
    [...selection.edges],
  );
  const leaf = graphSelection(graph, "passage-0600", visible);
  assert.equal(leaf.edges.size, 2);
  assert(leaf.nodes.has("manual") && leaf.nodes.has("command"));
  assert.equal(graphSelection(graph, "missing", visible), null);
  assert.equal(graphSelection(graph, "manual", new Set(["owner"])), null);
  const filtered = new Set(["manual", "owner"]);
  assert.equal(graphSelection(graph, "manual", filtered).total, 2);
  assert.deepEqual(
    [...graphSelection(graph, "manual", filtered).nodes].sort(),
    ["manual", "owner"],
  );
  graph.setAttribute(
    "trailEdges",
    Array.from({ length: 12 }, (_, i) => "contains-" + i),
  );
  const trail = graphSelection(graph, null, visible);
  assert(
    trail.trail && trail.edges.size === 8,
    "Evidence trails retain their own eight-link budget",
  );
  assert.equal(
    graphSelection(graph, null, filtered).nodes.size,
    0,
    "Hidden endpoints cannot leak through a trail",
  );
  graph.setAttribute("trailEdges", []);
  assert.equal(
    graphLabelPriority(
      "passage-0000",
      graph.getNodeAttributes("passage-0000"),
      "manual",
      selection,
      3,
    ),
    null,
  );
  assert.equal(
    graphLabelPriority(
      "passage-0600",
      graph.getNodeAttributes("passage-0600"),
      "passage-0600",
      leaf,
      3,
    ),
    -1,
  );
  const { syncGraphEdges } = require(path.join(tmp, "syncGraphEdges.js"));
  const updated = new MultiDirectedGraph();
  for (const id of ["a", "b", "c"]) updated.addNode(id, { x: 123, y: 456 });
  assert(
    syncGraphEdges(updated, [
      {
        id: "stable",
        source: "a",
        target: "b",
        kind: "contains",
        label: "contains",
      },
    ]),
  );
  assert(
    syncGraphEdges(updated, [
      {
        id: "stable",
        source: "c",
        target: "a",
        kind: "documents",
        label: "documents",
      },
    ]),
  );
  assert.deepEqual(
    updated.extremities("stable"),
    ["c", "a"],
    "Reused IDs must not retain old endpoints",
  );
  assert.equal(updated.getEdgeAttribute("stable", "label"), "documents");
  assert(
    !syncGraphEdges(updated, [
      {
        id: "stable",
        source: "c",
        target: "a",
        kind: "documents",
        label: "documents",
      },
    ]),
  );
  assert(
    syncGraphEdges(updated, [
      {
        id: "stable",
        source: "c",
        target: "a",
        kind: "contains",
        label: "revised",
      },
    ]),
  );
  assert.equal(updated.getEdgeAttribute("stable", "label"), "revised");
  assert(syncGraphEdges(updated, []));
  assert.equal(updated.size, 0);
  syncGraphEdges(updated, [
    {
      id: "invalidated",
      source: "a",
      target: "b",
      kind: "contains",
      label: "contains",
    },
  ]);
  syncGraphEdges(updated, [
    {
      id: "invalidated",
      source: "a",
      target: "missing",
      kind: "contains",
      label: "contains",
    },
  ]);
  assert.equal(
    updated.size,
    0,
    "An omitted endpoint cannot retain an old relationship",
  );
  assert.deepEqual(
    updated.getNodeAttributes("a"),
    { x: 123, y: 456 },
    "Updates preserve node positions",
  );

  const viewport = { width: 900, height: 610 };
  const point = { x: 450, y: 300, size: 6 };
  const boxes = [];
  for (let i = 0; i < 100; i++) {
    const box = placeGraphLabel(point, 200, viewport, boxes);
    if (box) boxes.push(box);
  }
  assert(
    boxes.length > 0 && boxes.length < 5,
    "Crowded labels must be skipped",
  );
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      assert(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      );
    }
  assert.equal(
    placeGraphLabel({ x: -400, y: -400, size: 1 }, 100, viewport, []),
    null,
  );
  let labels = [],
    strokes = 0;
  const context = {
    measureText: (text) => ({ width: text.length * 6 }),
    fillText: (text, x, y) => labels.push({ text, x, y }),
    stroke: () => strokes++,
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  for (const name of [
    "clearRect",
    "setTransform",
    "beginPath",
    "moveTo",
    "lineTo",
    "arc",
    "fill",
    "fillRect",
    "closePath",
  ])
    context[name] = () => {};
  const points = new Map(graph.nodes().map((id) => [id, point]));
  drawGraphLabels(context, graph, points, "manual", selection, 0.1, viewport);
  assert.equal(
    labels[0].text,
    "Large reference manual",
    "Selection label takes precedence",
  );
  assert(labels.length <= MAX_GRAPH_LABELS);

  const canvas = {
    style: {},
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    getContext: () => context,
  };
  global.document = { createElement: () => canvas };
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
  const container = { appendChild() {} };
  const { PerspectiveNetwork } = require(
    path.join(tmp, "PerspectiveNetwork.js"),
  );
  const { CanvasNetwork } = require(path.join(tmp, "CanvasNetwork.js"));
  for (const Renderer of [PerspectiveNetwork, CanvasNetwork]) {
    const renderer = new Renderer(
      graph,
      container,
      () => {},
      () => {},
      () => {},
      false,
    );
    renderer.width = viewport.width;
    renderer.height = viewport.height;
    renderer.autoFit = false;
    renderer.fitDistance = 1200;
    renderer.scale = 1;
    renderer.center = { x: 0, y: 0, z: 0 };
    for (const ratio of [3, 1, 0.25]) {
      renderer.ratio = ratio;
      if (renderer.camera) renderer.camera = { x: 0, y: 0, ratio };
      labels = [];
      strokes = 0;
      renderer.setView("manual", visible, false);
      renderer.draw(1000);
      assert(
        strokes <= MAX_HIGHLIGHTED_CONNECTIONS + 2,
        Renderer.name + " must not draw 1,227 emphasized spokes",
      );
      assert(labels.length <= MAX_GRAPH_LABELS);
      assert(
        !labels.some((item) =>
          ["contains", "relationship", "accessed"].includes(item.text),
        ),
        "No overlapping edge-label layer",
      );
    }
    renderer.setView("manual", visible, true);
    renderer.draw(1000);
    assert(renderer.screen.size <= MAX_HIGHLIGHTED_CONNECTIONS + 1);
    // Apply the real focus target immediately, then check its projection.
    renderer.animate = (target, ratio) => {
      if (renderer.camera) renderer.camera = target;
      else {
        renderer.center = target;
        renderer.ratio = ratio;
      }
    };
    renderer.focus("manual", true);
    renderer.draw(1000);
    for (const p of renderer.screen.values()) {
      assert(
        p.x >= 12 && p.x <= viewport.width - 12,
        Renderer.name + " focus must frame connection width",
      );
      assert(
        p.y >= 64 && p.y <= viewport.height - 72,
        Renderer.name + " focus must frame connection height",
      );
    }
    if (renderer instanceof PerspectiveNetwork) {
      renderer.setView(null, visible, false);
      renderer.draw(performance.now());
      const settled = renderer.screen.get("manual");
      renderer.arrive(["manual"]);
      const start = renderer.arrivals.get("manual").at;
      renderer.draw(start);
      assert(renderer.screen.get("manual").x < 0, "The first document enters from the left");
      strokes = 0;
      renderer.draw(start + 800);
      assert(renderer.screen.get("manual").x > 0, "The document moves into the graph");
      assert(
        strokes <= MAX_HIGHLIGHTED_CONNECTIONS + 2,
        "Manual arrival must not animate every passage link",
      );
      renderer.draw(start + 1400);
      assert.deepEqual(renderer.screen.get("manual"), settled, "Arrival settles at the actual node position");
      renderer.arrive(["manual"]);
      renderer.draw(renderer.arrivals.get("manual").at);
      assert(renderer.screen.get("manual").x > viewport.width, "The next arrival enters from the right");
      renderer.setReducedMotion(true);
      renderer.draw(performance.now());
      assert.deepEqual(renderer.screen.get("manual"), settled, "Reduced motion settles the node immediately");
    }
  }
  console.log(
    "PASS: dense manual selection, ownership priority, complete source data, stable sampling, filtered visibility, passage navigation, label collisions, relationship updates, current review/stale metadata, cache permission revocation, trail retention, focus framing, arrival animation and 3D/2D renderer budgets at three zoom levels.",
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
