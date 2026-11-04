import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Database,
  FileText,
  GitBranch,
  Network,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import { GraphCanvas } from "./GraphCanvas";
import { KnowledgeUpload } from "./KnowledgeUpload";
import { TopologyImport } from "./TopologyImport";
import {
  errorMessage,
  request,
  shortTime,
  type GraphData,
  type GraphEdge,
  type GraphEntityDetail,
  type GraphNode,
  type KnowledgeDocument,
  type Operator,
} from "./types";

interface Neighborhood {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated?: boolean;
}

export function KnowledgeGraph({
  operator,
  onError,
}: {
  operator: Operator;
  onError: (text: string) => void;
}) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const graphRef = useRef<GraphData | null>(null);
  const [failure, setFailure] = useState("");
  const [checked, setChecked] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [expansion, setExpansion] = useState<Neighborhood>({
    nodes: [],
    edges: [],
  });
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [entity, setEntity] = useState<GraphEntityDetail | null>(null);
  const [search, setSearch] = useState("");
  const [remoteResults, setRemoteResults] = useState<GraphNode[]>([]);
  const [scope, setScope] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [focusOnly, setFocusOnly] = useState(false);
  const [live, setLive] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [upload, setUpload] = useState(false);
  const [attach, setAttach] = useState<GraphNode | null>(null);
  const [importing, setImporting] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [listLimit, setListLimit] = useState(80);
  const [connectionLimit, setConnectionLimit] = useState(40);
  const inFlight = useRef(false);
  const refreshSequence = useRef(0);
  const syncFlight = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (inFlight.current && !force) return;
    const sequence = ++refreshSequence.current;
    inFlight.current = true;
    try {
      const cursor = !force ? graphRef.current?.cursor : null;
      const result = await request<GraphData & { not_modified?: boolean }>(
        `/graph${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
      );
      if (sequence !== refreshSequence.current) return;
      if (!result.not_modified) {
        graphRef.current = result;
        setGraph(result);
        const allowed = new Set(result.datasets.map((item) => item.id));
        setExpansion((previous) => ({
          nodes: previous.nodes.filter(
            (node) => !node.dataset_id || allowed.has(node.dataset_id),
          ),
          edges: previous.edges.filter(
            (edge) => !edge.dataset_id || allowed.has(edge.dataset_id),
          ),
        }));
      }
      setChecked(result.updated_at);
      setFailure("");
    } catch (error) {
      if (sequence === refreshSequence.current) setFailure(errorMessage(error));
    } finally {
      if (sequence === refreshSequence.current) inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    if (!live) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [live, refresh]);

  const sync = useCallback(async () => {
    if (syncFlight.current) return;
    syncFlight.current = true;
    setSyncing(true);
    try {
      const result = await request<{
        sources: { id: string; status: string; reason?: string }[];
        configured_sources: number;
      }>("/graph/sync", { method: "POST" });
      setSyncMessage(
        result.sources.length
          ? result.sources
              .map((source) => `${source.id.toUpperCase()}: ${source.status}`)
              .join(" · ")
          : "No authorized topology endpoints are configured.",
      );
      await refresh(true);
    } catch (error) {
      setSyncMessage(errorMessage(error));
    } finally {
      syncFlight.current = false;
      setSyncing(false);
    }
  }, [refresh]);
  const canSync = Boolean(graph?.sources.some((source) => source.can_sync));
  useEffect(() => {
    if (!live || !canSync) return;
    void sync();
    const timer = window.setInterval(() => {
      if (!document.hidden) void sync();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [live, canSync, sync]);

  const view = useMemo(() => {
    const nodes = new Map((graph?.nodes || []).map((node) => [node.id, node]));
    const edges = new Map((graph?.edges || []).map((edge) => [edge.id, edge]));
    for (const node of expansion.nodes) nodes.set(node.id, node);
    for (const edge of expansion.edges)
      if (nodes.has(edge.source) && nodes.has(edge.target))
        edges.set(edge.id, edge);
    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      index: nodes,
    };
  }, [graph, expansion]);
  const node = selected ? view.index.get(selected) : null;

  useEffect(() => {
    let current = true;
    setDoc(null);
    setEntity(null);
    setConnectionLimit(40);
    if (selected?.startsWith("document:")) {
      request<KnowledgeDocument>(
        "/documents/" + selected.slice("document:".length),
      )
        .then((document) => {
          if (current) {
            setDoc(document);
            void refresh(true);
          }
        })
        .catch((error) => {
          if (current) onError(errorMessage(error));
        });
    }
    return () => {
      current = false;
    };
  }, [selected, onError, refresh]);
  useEffect(() => {
    if (!selected?.startsWith("entity:")) return;
    let current = true;
    Promise.allSettled([
      request<GraphEntityDetail>(
        "/graph/node?node_id=" + encodeURIComponent(selected),
      ),
      request<Neighborhood>(
        "/graph/neighborhood?node_id=" + encodeURIComponent(selected),
      ),
    ]).then((results) => {
      if (!current) return;
      if (results[0].status === "fulfilled") setEntity(results[0].value);
      else {
        onError(errorMessage(results[0].reason));
        setSelected(null);
        setExpansion({ nodes: [], edges: [] });
        return;
      }
      if (results[1].status === "fulfilled") setExpansion(results[1].value);
      else onError(errorMessage(results[1].reason));
    });
    return () => {
      current = false;
    };
  }, [selected, graph?.cursor, onError]);

  useEffect(() => {
    setRemoteResults([]);
    if (!search.trim()) return;
    let current = true;
    const timer = window.setTimeout(
      () =>
        request<{ nodes: GraphNode[] }>(
          "/graph/search?q=" + encodeURIComponent(search.trim()),
        )
          .then((result) => {
            if (current) setRemoteResults(result.nodes);
          })
          .catch(() => {
            /* Local search remains available. */
          }),
      250,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const term = search.toLowerCase();
    const local = view.nodes
      .filter((node) =>
        (node.label + " " + node.entity_id + " " + (node.owner_name || ""))
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 15);
    return [
      ...new Map(
        [...local, ...remoteResults].map((node) => [node.id, node]),
      ).values(),
    ].slice(0, 20);
  }, [search, view.nodes, remoteResults]);
  function choose(id: string | null, result?: GraphNode) {
    if (result && !view.index.has(result.id))
      setExpansion({ nodes: [result], edges: [] });
    setSelected(id);
    setSearch("");
    if (result) {
      setScope("all");
      setReviewFilter("all");
    }
    if (!id) {
      setExpansion({ nodes: [], edges: [] });
      setFocusOnly(false);
    }
  }

  const visible = useMemo(() => {
    if (scope === "all" && reviewFilter === "all")
      return new Set(view.nodes.map((node) => node.id));
    const datasets = new Map(
      (graph?.datasets || []).map((dataset) => [dataset.id, dataset]),
    );
    const initial = new Set(
      view.nodes
        .filter((node) => {
          const dataset = node.dataset_id
            ? datasets.get(node.dataset_id)
            : null;
          const matchesSource =
            scope === "all" ||
            (scope === "knowledge"
              ? !node.dataset_id &&
                node.kind !== "entity" &&
                node.kind !== "source"
              : node.dataset_id === scope ||
                dataset?.document_id === node.entity_id);
          const status = dataset?.status || node.status;
          return (
            matchesSource && (reviewFilter === "all" || status === reviewFilter)
          );
        })
        .map((node) => node.id),
    );
    const keep = new Set(initial);
    for (const edge of view.edges) {
      if (
        initial.has(edge.source) &&
        view.index.get(edge.target)?.kind !== "entity"
      )
        keep.add(edge.target);
      if (
        initial.has(edge.target) &&
        view.index.get(edge.source)?.kind !== "entity"
      )
        keep.add(edge.source);
    }
    return keep;
  }, [view, scope, reviewFilter, graph?.datasets]);
  const connections = useMemo(
    () =>
      selected
        ? view.edges.filter(
            (edge) => edge.source === selected || edge.target === selected,
          )
        : [],
    [selected, view.edges],
  );
  const selectedDataset = graph?.datasets.find(
    (dataset) =>
      dataset.id === node?.dataset_id ||
      dataset.document_id === node?.entity_id,
  );
  const freshSources =
    graph?.datasets.filter(
      (dataset) => dataset.source_kind === "live_topology" && !dataset.stale,
    ).length || 0;
  const canAttach =
    node &&
    (node.kind === "entity" ||
      node.kind === "document" ||
      node.kind === "source" ||
      node.id === "person:" + operator.id);

  async function review(decision: string) {
    if (!doc) return;
    setReviewBusy(true);
    try {
      setDoc(
        await request<KnowledgeDocument>(`/documents/${doc.id}/review`, {
          method: "POST",
          body: JSON.stringify({
            decision,
            notes:
              decision === "submitted" ? "" : "Reviewed by " + operator.name,
          }),
        }),
      );
      await refresh(true);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setReviewBusy(false);
    }
  }
  function download() {
    if (!doc) return;
    const url = URL.createObjectURL(
      new Blob([doc.content], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = doc.title + ".txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="graph-page network-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">KNOWLEDGE + SOURCE NETWORKS</div>
          <h1>Explore the connections.</h1>
          <p>
            Zoom from the whole network into one system, relationship or
            contribution.
          </p>
        </div>
        <div className="network-actions">
          <button className="secondary" onClick={() => setImporting(true)}>
            <Upload size={16} />
            Import dataset
          </button>
          <button
            className="primary"
            onClick={() => {
              setAttach(null);
              setUpload(true);
            }}
          >
            <Plus size={16} />
            Add knowledge
          </button>
        </div>
      </div>
      <div className="network-sourcebar">
        <Database size={16} />
        <div>
          <strong>
            {freshSources
              ? `${freshSources} verified topology source${freshSources === 1 ? "" : "s"}`
              : "Live CAIL sources are not connected"}
          </strong>
          <span>
            {syncMessage ||
              (graph?.datasets.some(
                (dataset) => dataset.source_kind === "imported_export",
              )
                ? "Imported snapshots are labelled separately from live observations."
                : "Import an authorized export, or configure a read-only topology endpoint in Connections.")}
          </span>
        </div>
        <button
          className="secondary"
          disabled={!canSync || syncing}
          onClick={() => void sync()}
        >
          <RefreshCw size={14} className={syncing ? "spin" : ""} />
          {syncing ? "Reading sources…" : "Refresh sources"}
        </button>
        <button
          className={`live-pill ${live && !failure ? "online" : ""}`}
          onClick={() => setLive(!live)}
        >
          <i />
          {live ? "Live updates on" : "Updates paused"}
        </button>
      </div>
      <div className="network-summary">
        <span>
          <Network size={16} />
          <strong>{view.nodes.length.toLocaleString()}</strong> nodes loaded
        </span>
        <span>
          <GitBranch size={16} />
          <strong>{view.edges.length.toLocaleString()}</strong> relationships
        </span>
        <span>
          <FileText size={16} />
          <strong>{graph?.total_documents || 0}</strong> documents
        </span>
        {graph?.truncated && (
          <span className="network-limit">
            Showing a bounded view of {graph.total_nodes.toLocaleString()} known
            nodes. Search to load another neighborhood.
          </span>
        )}
      </div>
      <div className="network-workspace">
        <section className="network-panel">
          <div className="network-toolbar">
            <div className="network-search">
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="Search graph nodes"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && results[0])
                      choose(results[0].id, results[0]);
                    if (event.key === "Escape") setSearch("");
                  }}
                  placeholder="Search a system, document, ID or contributor…"
                />
              </label>
              {search && (
                <div
                  className="network-search-results"
                  role="listbox"
                  aria-label="Matching graph nodes"
                >
                  {results.length ? (
                    results.map((result) => (
                      <button
                        role="option"
                        aria-selected={selected === result.id}
                        key={result.id}
                        onClick={() => choose(result.id, result)}
                      >
                        <span className={"kind-dot " + result.kind} />
                        <span>
                          {result.label}
                          <small>
                            {result.entity_type || result.kind} ·{" "}
                            {result.entity_id}
                          </small>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p>No permitted nodes match this search.</p>
                  )}
                </div>
              )}
            </div>
            <select
              aria-label="Graph data source"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="all">All sources</option>
              <option value="knowledge">Contributions</option>
              {graph?.datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.title}
                  {dataset.source_kind === "imported_export"
                    ? " · imported"
                    : " · source"}
                </option>
              ))}
            </select>
            <select
              aria-label="Knowledge review filter"
              value={reviewFilter}
              onChange={(event) => setReviewFilter(event.target.value)}
            >
              <option value="all">All review states</option>
              <option value="approved">Approved</option>
              <option value="submitted">Awaiting review</option>
              <option value="draft">My drafts</option>
            </select>
          </div>
          {failure && (
            <div className="inline-error">
              {failure}
              <button onClick={() => void refresh(true)}>Retry</button>
            </div>
          )}
          {!graph ? (
            <div className="loading-panel">Loading your network…</div>
          ) : (
            <>
              <GraphCanvas
                nodes={view.nodes}
                edges={view.edges}
                selected={selected}
                visible={visible}
                focusOnly={focusOnly}
                onSelect={choose}
              />
              {graph.nodes.length <= 1 && !graph.datasets.length && (
                <div className="network-empty">
                  <GitBranch size={25} />
                  <h3>Your network starts with a source.</h3>
                  <p>
                    Import a permitted topology export or add your first
                    contribution. Source relationships will appear as connected
                    nodes.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setImporting(true)}
                  >
                    Import an authorized dataset <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
          <footer className="graph-footer">
            <span>
              {focusOnly && selected
                ? "Showing the selected node and its connections"
                : "Positions and zoom stay in place when records update"}
            </span>
            <span>
              {checked
                ? "Checked " + shortTime(checked)
                : "Waiting for records"}
            </span>
          </footer>
          <details className="network-node-browser">
            <summary>Browse loaded nodes · keyboard-accessible list</summary>
            <div>
              {view.nodes
                .filter((item) => visible.has(item.id))
                .slice(0, listLimit)
                .map((item) => (
                  <button key={item.id} onClick={() => choose(item.id)}>
                    <span className={"kind-dot " + item.kind} />
                    <span>
                      {item.label}
                      <small>{item.entity_type || item.kind}</small>
                    </span>
                    <ArrowRight size={13} />
                  </button>
                ))}
            </div>
            {visible.size > listLimit && (
              <button
                className="text-button"
                onClick={() => setListLimit((value) => value + 100)}
              >
                Show 100 more nodes
              </button>
            )}
          </details>
        </section>
        <aside className="graph-inspector network-inspector">
          <div className="panel-heading">
            <span>NODE + CONNECTIONS</span>
            {selected && (
              <button
                className="icon-button"
                aria-label="Clear graph selection"
                onClick={() => choose(null)}
              >
                <X size={16} />
              </button>
            )}
          </div>
          {!node ? (
            <>
              <div className="inspector-illustration">
                <Network size={35} />
              </div>
              <h3>Follow a connection.</h3>
              <p className="muted">
                Select a node or search by name to see its source, properties
                and neighboring nodes.
              </p>
              <div className="quiet-note">
                <Users size={17} />
                <span>
                  Attach a document to a source entity to connect operational
                  context to its actual network position.
                </span>
              </div>
              <div className="network-dataset-list">
                {graph?.datasets.map((dataset) => (
                  <button
                    key={dataset.id}
                    onClick={() => {
                      setScope(dataset.id);
                      if (dataset.document_id)
                        choose("document:" + dataset.document_id);
                    }}
                  >
                    <Database size={15} />
                    <span>
                      {dataset.title}
                      <small>
                        {dataset.node_count.toLocaleString()} nodes ·{" "}
                        {dataset.source_kind === "imported_export"
                          ? "Imported snapshot"
                          : dataset.stale
                            ? "Stale source"
                            : "Source snapshot"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <span
                className={`status-badge ${node.stale ? "rejected" : node.status}`}
              >
                {node.entity_type || node.kind}
              </span>
              <h3>{node.label}</h3>
              {selectedDataset && (
                <div className="network-provenance">
                  <strong>
                    {selectedDataset.source_kind === "imported_export"
                      ? "Imported snapshot"
                      : selectedDataset.stale
                        ? "Source unavailable or stale"
                        : "Read-only source snapshot"}
                  </strong>
                  <span>{selectedDataset.title}</span>
                  {selectedDataset.observed_at && (
                    <span>
                      Observed{" "}
                      {new Date(selectedDataset.observed_at).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
              {node.kind === "entity" && (
                <>
                  {entity ? (
                    <>
                      <dl>
                        <div>
                          <dt>Source ID</dt>
                          <dd>{entity.local_id}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            {entity.stale
                              ? "Stale / unverified current state"
                              : entity.status}
                          </dd>
                        </div>
                        <div>
                          <dt>Source relationships</dt>
                          <dd>{entity.relationship_count.toLocaleString()}</dd>
                        </div>
                      </dl>
                      {Object.keys(entity.properties).length > 0 && (
                        <>
                          <h4>Source properties</h4>
                          <dl className="entity-properties">
                            {Object.entries(entity.properties).map(
                              ([key, value]) => (
                                <div key={key}>
                                  <dt>{key}</dt>
                                  <dd>
                                    {value === null ? "—" : String(value)}
                                  </dd>
                                </div>
                              ),
                            )}
                          </dl>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="muted">Loading node details…</p>
                  )}
                </>
              )}
              {node.kind === "document" &&
                (doc ? (
                  <>
                    <dl>
                      <div>
                        <dt>Contributor</dt>
                        <dd>{doc.owner_name}</dd>
                      </div>
                      <div>
                        <dt>Review</dt>
                        <dd>
                          <span className={`status-badge ${doc.status}`}>
                            {doc.status}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Topic</dt>
                        <dd>{doc.topic}</dd>
                      </div>
                    </dl>
                    <details className="source-text-details">
                      <summary>Source text</summary>
                      <pre className="document-preview">{doc.content}</pre>
                    </details>
                    <button className="secondary full" onClick={download}>
                      <ArrowDownToLine size={15} />
                      Download text
                    </button>
                    {doc.can_submit && (
                      <button
                        className="primary full"
                        disabled={reviewBusy}
                        onClick={() => void review("submitted")}
                      >
                        Submit for review
                      </button>
                    )}
                    {doc.can_review && (
                      <div className="review-buttons">
                        <button
                          className="primary"
                          disabled={reviewBusy}
                          onClick={() => void review("approved")}
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          className="secondary"
                          disabled={reviewBusy}
                          onClick={() => void review("rejected")}
                        >
                          Request revision
                        </button>
                      </div>
                    )}
                    {doc.status !== "approved" && (
                      <p className="fine-print">
                        Unapproved knowledge remains outside assistant
                        retrieval. Independent review enables sharing.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted">Loading document…</p>
                ))}
              {canAttach && (
                <button
                  className="secondary full attach-button"
                  onClick={() => {
                    setAttach(node);
                    setUpload(true);
                  }}
                >
                  <Plus size={15} />
                  Attach a document here
                </button>
              )}
              <div className="network-connection-heading">
                <h4>Connected nodes · {connections.length.toLocaleString()}</h4>
                <label>
                  <input
                    type="checkbox"
                    checked={focusOnly}
                    onChange={(event) => setFocusOnly(event.target.checked)}
                  />
                  Focus only
                </label>
              </div>
              <div className="connected-list">
                {connections.slice(0, connectionLimit).map((edge) => {
                  const other = view.index.get(
                    edge.source === selected ? edge.target : edge.source,
                  );
                  return (
                    other && (
                      <button key={edge.id} onClick={() => choose(other.id)}>
                        <span className={"kind-dot " + other.kind} />
                        <span>
                          {other.label}
                          <small>
                            {edge.source === selected ? "→ " : "← "}
                            {edge.label}
                          </small>
                        </span>
                        <ArrowRight size={12} />
                      </button>
                    )
                  );
                })}
                {!connections.length && (
                  <p className="muted">
                    No relationships were supplied for this node.
                  </p>
                )}
              </div>
              {connections.length > connectionLimit && (
                <button
                  className="text-button"
                  onClick={() => setConnectionLimit((value) => value + 60)}
                >
                  Show more connections
                </button>
              )}
              {expansion.truncated && (
                <p className="fine-print">
                  This neighborhood is limited to 500 source relationships.
                  Search a neighboring entity to continue exploring.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
      {upload && (
        <KnowledgeUpload
          target={attach}
          onClose={() => setUpload(false)}
          onError={onError}
          onAdded={(id) => {
            setUpload(false);
            setSelected("document:" + id);
            setScope("all");
            void refresh(true);
          }}
        />
      )}
      {importing && (
        <TopologyImport
          onClose={() => setImporting(false)}
          onError={onError}
          onAdded={(id) => {
            setImporting(false);
            setSelected("document:" + id);
            setScope("all");
            void refresh(true);
          }}
        />
      )}
    </div>
  );
}
