import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  Check,
  FileText,
  GitBranch,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  errorMessage,
  request,
  shortTime,
  type GraphData,
  type KnowledgeDocument,
  type Operator,
} from "./types";

interface Props {
  operator: Operator;
  onError: (text: string) => void;
}

function UploadDialog({
  onClose,
  onAdded,
  onError,
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
  onError: (text: string) => void;
}) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [topic, setTopic] = useState("NonStop operations");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      let doc: KnowledgeDocument;
      if (mode === "file") {
        if (!file) throw new Error("Choose a document first.");
        if (file.size > 4 * 1024 * 1024)
          throw new Error("Choose a file smaller than 4 MB.");
        const data = new FormData();
        data.append("file", file);
        data.append("topic", topic);
        doc = await request<KnowledgeDocument>("/documents/upload", {
          method: "POST",
          body: data,
        });
      } else {
        doc = await request<KnowledgeDocument>("/documents", {
          method: "POST",
          body: JSON.stringify({ title, content, topic }),
        });
      }
      onAdded(doc.id);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header>
          <div className="icon-tile">
            <Upload size={21} />
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            aria-label="Close upload"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <h2 id="upload-title">Add to your knowledge graph</h2>
        <p className="muted">
          Your contribution appears under your name immediately. Independent
          review makes it available to the assistant and your team.
        </p>
        <div className="segmented">
          <button
            className={mode === "file" ? "active" : ""}
            onClick={() => setMode("file")}
          >
            Upload document
          </button>
          <button
            className={mode === "text" ? "active" : ""}
            onClick={() => setMode("text")}
          >
            Write a note
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            Topic
            <input
              required
              maxLength={60}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
          {mode === "file" ? (
            <label className="file-drop">
              <Upload size={26} />
              <strong>{file ? file.name : "Choose a document"}</strong>
              <span>PDF, DOCX, TXT, MD, CSV or LOG · Up to 4 MB</span>
              <input
                required
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,.log"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </label>
          ) : (
            <>
              <label>
                Title
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Shift handover checklist"
                />
              </label>
              <label>
                Knowledge note
                <textarea
                  required
                  minLength={20}
                  maxLength={200000}
                  rows={7}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Capture the context, observations, reasoning and source references…"
                />
              </label>
            </>
          )}
          <p className="fine-print">
            Add material you are authorized to share. The searchable text is
            retained; scans need OCR first.
          </p>
          <button className="primary full" disabled={busy}>
            {busy ? "Adding document…" : "Add knowledge"}
            <Plus size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}

export function KnowledgeGraph({ operator, onError }: Props) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [failure, setFailure] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [upload, setUpload] = useState(false);
  const [live, setLive] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const svgRef = useRef<SVGSVGElement>(null);
  async function refresh() {
    try {
      setGraph(await request<GraphData>("/graph"));
      setFailure("");
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }
  useEffect(() => {
    void refresh();
    if (!live) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [live, reload]);
  const node = graph?.nodes.find((item) => item.id === selected);
  useEffect(() => {
    let active = true;
    setDoc(null);
    if (node?.kind === "document")
      request<KnowledgeDocument>(`/documents/${node.entity_id}`)
        .then((data) => {
          if (active) {
            setDoc(data);
            void refresh();
          }
        })
        .catch((error) => {
          if (active) onError(errorMessage(error));
        });
    return () => {
      active = false;
    };
  }, [node?.entity_id, node?.kind]);
  const visible = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const documents = new Set(
      graph.nodes
        .filter(
          (item) =>
            item.kind === "document" &&
            (filter === "all" || item.status === filter) &&
            (!search ||
              (item.label + " " + (item.owner_name || ""))
                .toLowerCase()
                .includes(search.toLowerCase())),
        )
        .map((item) => item.id),
    );
    const ids = new Set<string>(documents);
    graph.edges.forEach((edge) => {
      if (documents.has(edge.source) || documents.has(edge.target)) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    });
    if (!documents.size && !search && filter === "all")
      ids.add("person:" + operator.id);
    return {
      nodes: graph.nodes.filter((item) => ids.has(item.id)),
      edges: graph.edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    };
  }, [graph, filter, search, operator.id]);
  const layout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const groups = ["person", "document", "topic"];
    const height = Math.max(
      540,
      ...groups.map(
        (kind) =>
          visible.nodes.filter((item) => item.kind === kind).length * 100 + 80,
      ),
    );
    groups.forEach((kind, column) => {
      const nodes = visible.nodes.filter((item) => item.kind === kind);
      nodes.forEach((item, index) =>
        positions.set(item.id, {
          x: 150 + column * 330,
          y: 70 + ((height - 140) * (index + 0.5)) / Math.max(1, nodes.length),
        }),
      );
    });
    return { positions, height };
  }, [visible]);
  async function review(decision: string) {
    if (!doc) return;
    setReviewBusy(true);
    try {
      const changed = await request<KnowledgeDocument>(
        `/documents/${doc.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            notes:
              decision === "submitted" ? "" : "Reviewed by " + operator.name,
          }),
        },
      );
      setDoc(changed);
      await refresh();
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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = doc.title + ".txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="graph-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">CONNECTED EXPERTISE</div>
          <h1>Knowledge, with a living history.</h1>
          <p>
            See who contributed, what they know, and how knowledge moves through
            your team.
          </p>
        </div>
        <button className="primary" onClick={() => setUpload(true)}>
          <Plus size={17} />
          Add knowledge
        </button>
      </div>
      <div className="graph-summary">
        <span>
          <Users size={17} />
          <strong>
            {graph?.nodes.filter((item) => item.kind === "person").length ??
              "—"}
          </strong>{" "}
          people
        </span>
        <span>
          <FileText size={17} />
          <strong>{graph?.total_documents ?? "—"}</strong> documents
        </span>
        <span>
          <GitBranch size={17} />
          <strong>
            {graph?.edges.filter((edge) => edge.kind === "accessed").length ??
              "—"}
          </strong>{" "}
          access relationships
        </span>
        <button
          className={`live-pill ${live && !failure ? "online" : ""}`}
          onClick={() => setLive(!live)}
        >
          <i />
          {failure
            ? "Update unavailable"
            : live
              ? "Updating every 3s"
              : "Updates paused"}
        </button>
      </div>
      <div className="graph-workspace">
        <section className="graph-panel">
          <div className="graph-toolbar">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Search graph by document or owner"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a document or contributor…"
              />
            </label>
            <select
              aria-label="Filter documents by review status"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All visible knowledge</option>
              <option value="approved">Approved</option>
              <option value="submitted">Awaiting review</option>
              <option value="draft">My drafts</option>
              <option value="rejected">Needs revision</option>
            </select>
          </div>
          {failure && (
            <div className="inline-error">
              {failure}
              <button onClick={() => void refresh()}>
                <RefreshCw size={15} />
                Retry
              </button>
            </div>
          )}
          {!graph ? (
            <div className="loading-panel">Loading your knowledge graph…</div>
          ) : (
            <div className="graph-canvas">
              <div className="graph-lanes">
                <span>PEOPLE</span>
                <span>KNOWLEDGE</span>
                <span>TOPICS</span>
              </div>
              <svg
                ref={svgRef}
                className="knowledge-svg"
                viewBox={`0 0 1000 ${layout.height}`}
                aria-label="Knowledge ownership and access graph"
                role="group"
                onPointerDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  drag.current = {
                    x: event.clientX,
                    y: event.clientY,
                    px: pan.x,
                    py: pan.y,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!drag.current || !svgRef.current) return;
                  const scale =
                    1000 / svgRef.current.getBoundingClientRect().width;
                  setPan({
                    x:
                      drag.current.px +
                      (event.clientX - drag.current.x) * scale,
                    y:
                      drag.current.py +
                      (event.clientY - drag.current.y) * scale,
                  });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
              >
                <defs>
                  <marker
                    id="graph-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                  {visible.edges.map((edge) => {
                    const from = layout.positions.get(edge.source),
                      to = layout.positions.get(edge.target);
                    if (!from || !to) return null;
                    const dim =
                      selected &&
                      edge.source !== selected &&
                      edge.target !== selected;
                    const offset = edge.kind === "accessed" ? 20 : -8;
                    return (
                      <g
                        key={edge.id}
                        className={`graph-edge ${edge.kind} ${dim ? "dim" : ""}`}
                      >
                        <path
                          d={`M${from.x + 36},${from.y + offset} C${from.x + 150},${from.y + offset} ${to.x - 150},${to.y + offset} ${to.x - 40},${to.y + offset}`}
                          fill="none"
                          markerEnd="url(#graph-arrow)"
                        />
                        <text
                          x={(from.x + to.x) / 2}
                          y={(from.y + to.y) / 2 + offset - 7}
                          textAnchor="middle"
                        >
                          {edge.label}
                        </text>
                      </g>
                    );
                  })}
                  {visible.nodes.map((item) => {
                    const position = layout.positions.get(item.id)!;
                    return (
                      <g
                        key={item.id}
                        transform={`translate(${position.x} ${position.y})`}
                        className={`graph-node ${item.kind} ${selected === item.id ? "selected" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${item.label}, ${item.kind}, ${item.status}`}
                        aria-pressed={selected === item.id}
                        onClick={() => setSelected(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelected(item.id);
                          }
                        }}
                      >
                        <circle r="35" className="node-halo" />
                        <rect
                          className="node-shape"
                          x="-25"
                          y="-25"
                          width="50"
                          height="50"
                          rx={
                            item.kind === "person"
                              ? 25
                              : item.kind === "topic"
                                ? 12
                                : 10
                          }
                        />
                        {item.kind === "person" ? (
                          <text
                            className="person-initials"
                            textAnchor="middle"
                            y="6"
                          >
                            {item.label
                              .split(" ")
                              .map((part) => part[0])
                              .slice(0, 2)
                              .join("")}
                          </text>
                        ) : item.kind === "document" ? (
                          <FileText x={-11} y={-11} size={22} />
                        ) : (
                          <GitBranch x={-11} y={-11} size={22} />
                        )}
                        <text className="node-title" textAnchor="middle" y="48">
                          {item.label.length > 32
                            ? item.label.slice(0, 29) + "…"
                            : item.label}
                        </text>
                        <text
                          className="node-subtitle"
                          textAnchor="middle"
                          y="65"
                        >
                          {item.status === "you"
                            ? "You"
                            : item.status === "submitted"
                              ? "Awaiting review"
                              : item.status}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
              {graph.total_documents === 0 && (
                <div className="graph-onboarding">
                  <span className="small-icon">
                    <GitBranch size={20} />
                  </span>
                  <h3>Your knowledge starts here</h3>
                  <p>
                    Add your first document. Its owner, topic and access history
                    will appear as connected nodes.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setUpload(true)}
                  >
                    Add your first contribution <Plus size={16} />
                  </button>
                </div>
              )}
              {graph.total_documents > 0 && !visible.nodes.length && (
                <div className="graph-onboarding">
                  <h3>No matching knowledge</h3>
                  <p>Try another contributor, title or review status.</p>
                </div>
              )}
              <div className="graph-controls">
                <button
                  className="icon-button"
                  aria-label="Zoom out"
                  onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))}
                >
                  <Minus size={17} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  className="icon-button"
                  aria-label="Zoom in"
                  onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))}
                >
                  <Plus size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Reset graph view"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <Maximize2 size={17} />
                </button>
              </div>
              <div className="graph-legend">
                <span>
                  <i className="person-dot" />
                  Person
                </span>
                <span>
                  <i className="document-dot" />
                  Document
                </span>
                <span>
                  <i className="topic-dot" />
                  Topic
                </span>
              </div>
            </div>
          )}
          <footer className="graph-footer">
            <span>
              Solid: contribution · Dashed: access · Arrows show direction
            </span>
            <span>
              {graph
                ? `Updated ${shortTime(graph.updated_at)}`
                : "Waiting for records"}
            </span>
          </footer>
          {graph?.truncated && (
            <p className="fine-print">
              Showing the 150 most recently updated visible documents.
            </p>
          )}
        </section>
        <aside className="graph-inspector">
          <div className="panel-heading">
            <span>KNOWLEDGE DETAILS</span>
            {selected && (
              <button
                className="icon-button"
                aria-label="Clear graph selection"
                onClick={() => setSelected(null)}
              >
                <X size={16} />
              </button>
            )}
          </div>
          {!node ? (
            <>
              <div className="inspector-illustration">
                <GitBranch size={36} />
              </div>
              <h3>Every connection has a story.</h3>
              <p className="muted">
                Select a node to inspect its owner, review status and connected
                knowledge.
              </p>
              <div className="quiet-note">
                <Users size={17} />
                <span>
                  Opening a document records a real access relationship.
                  Ownership stays with its contributor.
                </span>
              </div>
            </>
          ) : (
            <>
              <span className={`status-badge ${node.status}`}>{node.kind}</span>
              <h3>{node.label}</h3>
              {node.kind === "document" ? (
                doc ? (
                  <>
                    <dl>
                      <div>
                        <dt>Contributed by</dt>
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
                      <div>
                        <dt>Added</dt>
                        <dd>{new Date(doc.created_at).toLocaleDateString()}</dd>
                      </div>
                    </dl>
                    <h4>Source text</h4>
                    <pre className="document-preview">{doc.content}</pre>
                    <button className="secondary full" onClick={download}>
                      <ArrowDownToLine size={16} />
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
                          <Check size={15} />
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
                        Visible according to permissions. The assistant
                        retrieves independently approved knowledge only.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted">Loading document…</p>
                )
              ) : (
                <>
                  <p className="muted">
                    {node.kind === "person"
                      ? "Contributions and real document access linked to this operator."
                      : "Documents connected to this knowledge topic."}
                  </p>
                  <div className="connected-list">
                    {visible.edges
                      .filter(
                        (edge) =>
                          edge.source === node.id || edge.target === node.id,
                      )
                      .map((edge) => {
                        const other = graph?.nodes.find(
                          (item) =>
                            item.id ===
                            (edge.source === node.id
                              ? edge.target
                              : edge.source),
                        );
                        return (
                          other && (
                            <button
                              key={edge.id}
                              onClick={() => setSelected(other.id)}
                            >
                              <FileText size={16} />
                              <span>
                                {other.label}
                                <small>{edge.label}</small>
                              </span>
                            </button>
                          )
                        );
                      })}
                  </div>
                </>
              )}
            </>
          )}
        </aside>
      </div>
      {upload && (
        <UploadDialog
          onClose={() => setUpload(false)}
          onError={onError}
          onAdded={(id) => {
            setUpload(false);
            setSelected("document:" + id);
            setReload((value) => value + 1);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
