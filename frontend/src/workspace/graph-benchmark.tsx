// An explicit renderer QA entry, never seeded into the application or database.
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { GraphCanvas } from "./GraphCanvas";
import type { GraphNode, GraphEdge } from "./types";
import "../styles/workspace.css";

function Benchmark() {
  const [count, setCount] = useState(1000);
  const [selected, setSelected] = useState<string | null>(null);
  const [documents, setDocuments] = useState(0);
  const [focus, setFocus] = useState(false);
  const data = useMemo(() => {
    const nodes: GraphNode[] = Array.from({ length: count }, (_, index) => ({
      id: "fixture-" + index,
      entity_id: String(index),
      kind: "entity",
      label: "Synthetic node " + index,
      entity_type: index % 20 === 0 ? "system" : "service",
      status: "synthetic_fixture",
    }));
    const edges: GraphEdge[] = [];
    for (let index = 1; index < count; index++) {
      edges.push({
        id: "tree-" + index,
        source: "fixture-" + Math.floor((index - 1) / 4),
        target: "fixture-" + index,
        kind: "source_relationship",
        label: "test link",
      });
      if (index % 3 === 0)
        edges.push({
          id: "cross-" + index,
          source: "fixture-" + index,
          target: "fixture-" + ((index + 211) % count),
          kind: "source_relationship",
          label: "cross link",
        });
    }
    for (let index = 0; index < documents; index++) {
      const id = "test-document-" + index;
      nodes.push({
        id,
        entity_id: id,
        kind: "document",
        label: "Synthetic attachment " + (index + 1),
        status: "draft",
      });
      edges.push({
        id: "annotation-" + index,
        source: id,
        target: "fixture-0",
        kind: "documents",
        label: "documents",
      });
    }
    return { nodes, edges };
  }, [count, documents]);
  const visible = useMemo(
    () => new Set(data.nodes.map((node) => node.id)),
    [data],
  );
  return (
    <div className="renderer-benchmark">
      <header>
        <div>
          <h1>Graph renderer test</h1>
          <p>Explicit synthetic fixture · no CAIL data · no database writes</p>
        </div>
        <div className="qa-actions">
          <select
            aria-label="Fixture node count"
            value={count}
            onChange={(event) => {
              setCount(Number(event.target.value));
              setDocuments(0);
              setSelected(null);
            }}
          >
            <option value="1000">1,000 nodes</option>
            <option value="5000">5,000 nodes</option>
            <option value="12000">12,000 nodes</option>
          </select>
          <button
            className="secondary"
            onClick={() => setSelected("fixture-0")}
          >
            Select first node
          </button>
          <button
            className="secondary"
            onClick={() => setFocus((value) => !value)}
          >
            {focus ? "Show all nodes" : "Show connections only"}
          </button>
          <button
            className="primary"
            onClick={() => setDocuments((value) => value + 1)}
          >
            Add linked test document
          </button>
        </div>
      </header>
      <GraphCanvas
        nodes={data.nodes}
        edges={data.edges}
        selected={selected}
        visible={visible}
        focusOnly={focus}
        onSelect={setSelected}
      />
      <div className="qa-result" role="status">
        Loaded {data.nodes.length.toLocaleString()} nodes ·{" "}
        {data.edges.length.toLocaleString()} edges · Selected:{" "}
        {selected || "none"} · New documents: {documents}
      </div>
    </div>
  );
}
createRoot(document.getElementById("benchmark")!).render(<Benchmark />);
