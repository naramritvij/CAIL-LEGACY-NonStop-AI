import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Route,
  Play,
  Pause,
} from "lucide-react";
import { GraphCanvas } from "./GraphCanvas";
import { KnowledgeUpload } from "./KnowledgeUpload";
import { TopologyImport } from "./TopologyImport";
import {
  mergeGraphSnapshot,
  reconcileExpansion,
  retainTrail,
  type GraphNeighborhood as Neighborhood,
} from "./graphSnapshot";
import type { EvidenceTrail } from "./KnowledgeStudio";
import type { TransferAction } from "./TransferDesk";
const TransferDesk = lazy(() => import("./TransferDesk").then((module) => ({ default: module.TransferDesk })));
const KnowledgeStudio = lazy(() =>
  import("./KnowledgeStudio").then((module) => ({
    default: module.KnowledgeStudio,
  })),
);
import {
  DEMO_ROLE_LABELS,
  errorMessage,
  request,
  shortTime,
  type GraphData,
  type GraphEntityDetail,
  type GraphNode,
  type KnowledgeDocument,
  type Operator,
} from "./types";

const WALKTHROUGH_CASES = [
  { title: "Disk growth continued after the batch", contributor: "Priya Shah", label: "Open Priya’s case" },
  { title: "Disk growth reversed after the batch", contributor: "Miguel Torres", label: "Open Miguel’s case" },
];
const FICTIONAL_SAMPLE_PREFIX = "Fictional Knowledge Tree sample · ";

function SampleDetails({ content }: { content: string }) {
  const [sample, ...sections] = content.split("\n\n");
  return (
    <section className="tree-sample" aria-label="Fictional sample details">
      <strong>{sample}</strong>
      <dl>{sections.map((section) => {
        const line = section.indexOf("\n");
        return <div key={section.slice(0, line)}>
          <dt>{section.slice(0, line)}</dt>
          <dd>{section.slice(line + 1)}</dd>
        </div>;
      })}</dl>
    </section>
  );
}

function originLabel(kind: string) {
  return kind === "document_evidence"
    ? "Document evidence"
    : kind === "monitoring_export"
      ? "Monitoring export"
      : kind === "imported_export"
        ? "Imported snapshot"
        : "Read-only source snapshot";
}

export function KnowledgeGraph({
  operator,
  onError,
  onSwitch,
}: {
  operator: Operator;
  onError: (text: string) => void;
  onSwitch: () => void;
}) {
  const juniorCount = operator.demo_roles?.filter((role) => role.role === "junior").length || 0;
  const walkthrough = juniorCount > 1;
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
  const [reviewReason, setReviewReason] = useState("");
  const [citationPreview, setCitationPreview] = useState<{
    id: string; title: string; content: string; document_id: string; guidance_id: string;
  } | null>(null);
  const [transferOpen, setTransferOpen] = useState(Boolean(operator.transfer_demo) && !walkthrough);
  const [seniorOnly, setSeniorOnly] = useState(false);
  const [transferPerson, setTransferPerson] = useState<string | null>(null);
  const [transferAction, setTransferAction] = useState<TransferAction | null>(null);
  const [newDocumentIds, setNewDocumentIds] = useState<string[]>([]);
  const [documentAccess, setDocumentAccess] = useState<{
    documentId: string; ownerId: string; edgeId: string; firstAccess: boolean;
  } | null>(null);
  const [listLimit, setListLimit] = useState(80);
  const [connectionLimit, setConnectionLimit] = useState(40);
  const [dimension, setDimension] = useState<"2d" | "3d">("3d");
  const [indexBusy, setIndexBusy] = useState(false);
  const [scene, setScene] = useState("knowledge");
  const [showPassages, setShowPassages] = useState(false);
  const [pathStart, setPathStart] = useState<GraphNode | null>(null);
  const [trail, setTrail] = useState<EvidenceTrail | null>(null);
  const trailRef = useRef(trail);
  trailRef.current = trail;
  const [trailBusy, setTrailBusy] = useState(false);
  const [playingTrail, setPlayingTrail] = useState(false);
  const [trailStep, setTrailStep] = useState(0);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const attemptedIndexCounts = useRef(new Set<number>());
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
        const previous = graphRef.current;
        if (previous && previous.revision !== result.revision) {
          setNewDocumentIds(result.events.filter((event) =>
            event.sequence > previous.revision && event.kind === "uploaded" && event.document_id
          ).map((event) => "document:" + event.document_id));
        }
        graphRef.current = result;
        setGraph(result);
        setExpansion((previous) => reconcileExpansion(result, previous));
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
    return mergeGraphSnapshot(graph || { nodes: [], edges: [] }, expansion);
  }, [graph, expansion]);
  const node = selected ? view.index.get(selected) || (doc && selected === "document:" + doc.id ? {
    id: selected, entity_id: doc.id, kind: "document" as const, label: doc.title,
    status: doc.status, owner_name: doc.owner_name,
  } as GraphNode : null) : null;

  useEffect(() => {
    if (!graph) return;
    setTrail((previous) => {
      if (!previous?.found) return previous;
      const snapshot = mergeGraphSnapshot(
        graph,
        reconcileExpansion(graph, previous),
      );
      const edges = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
      if (
        previous.nodes.some((item) => !snapshot.index.has(item.id)) ||
        previous.edges.some((edge) => !edges.has(edge.id))
      ) {
        return null;
      }
      const updated = {
        ...previous,
        nodes: previous.nodes.map((item) => snapshot.index.get(item.id)!),
        edges: previous.edges.map((edge) => edges.get(edge.id)!),
      };
      return JSON.stringify(updated) === JSON.stringify(previous)
        ? previous
        : updated;
    });
  }, [graph]);

  useEffect(() => {
    let current = true;
    setDoc(null);
    setDocumentAccess(null);
    setEntity(null);
    setConnectionLimit(40);
    setReviewReason("");
    setCitationPreview(null);
    if (selected?.startsWith("document:")) {
      request<KnowledgeDocument>(
        "/documents/" + selected.slice("document:".length),
      )
        .then((document) => {
          if (current) {
            setDoc(document);
            if (document.access && document.owner_id !== operator.id) {
              setDocumentAccess({
                documentId: "document:" + document.id,
                ownerId: "person:" + document.owner_id,
                edgeId: document.access.edge_id,
                firstAccess: document.access.first_access,
              });
            }
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
  }, [selected, operator.id, onError, refresh]);
  useEffect(() => {
    if (!selected?.startsWith("document:") || !graph?.revision) return;
    const controller = new AbortController();
    void request<KnowledgeDocument>(
      "/documents/" + selected.slice("document:".length) + "?record_access=false",
      { signal: controller.signal },
    ).then(setDoc).catch((error) => {
      if (!controller.signal.aborted) {
        setDoc(null);
        onError(errorMessage(error));
      }
    });
    return () => controller.abort();
  }, [graph?.revision, selected, onError]);
  useEffect(() => {
    if (!selected?.startsWith("entity:") && !selected?.startsWith("concept:"))
      return;
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
      if (results[1].status === "fulfilled")
        setExpansion(retainTrail(results[1].value, trailRef.current?.found ? trailRef.current : null));
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
    setTrail(null);
    setPlayingTrail(false);
    setSpotlight(null);
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

  function openTransfer(personId: string | null = null, seniors = false) {
    setTransferPerson(personId);
    setSeniorOnly(seniors);
    setTransferOpen(true);
    window.requestAnimationFrame(() => window.document.getElementById("knowledge-transfer")?.scrollIntoView({ block: "start" }));
  }

  function openTransferDocument(id: string) {
    choose(id);
    window.requestAnimationFrame(() => window.document.getElementById(
      walkthrough ? "graph-network" : "graph-inspector",
    )?.scrollIntoView({ block: walkthrough ? "nearest" : "start" }));
  }

  const visible = useMemo(() => {
    const datasets = new Map(
      (graph?.datasets || []).map((dataset) => [dataset.id, dataset]),
    );
    const scopedDocumentIds = new Set(
      view.nodes
        .filter(
          (item) =>
            item.kind === "document" &&
            (reviewFilter === "all" || item.status === reviewFilter) &&
            (scope === "all" ||
              scope === "knowledge" ||
              item.dataset_id === scope ||
              datasets.get(scope)?.document_id === item.entity_id),
        )
        .map((item) => item.id),
    );
    const scopedConcepts = new Set(
      view.edges
        .filter(
          (edge) =>
            edge.kind === "documents_concept" &&
            scopedDocumentIds.has(edge.source),
        )
        .map((edge) => edge.target),
    );
    const initial = new Set(
      view.nodes
        .filter((node) => {
          const dataset = node.dataset_id
            ? datasets.get(node.dataset_id)
            : null;
          const matchesSource = node.id.startsWith("concept:")
            ? scopedConcepts.has(node.id)
            : scope === "all" ||
              (scope === "knowledge"
                ? node.source_kind === "document_evidence" ||
                  (!node.dataset_id &&
                    node.kind !== "entity" &&
                    node.kind !== "source")
                : node.dataset_id === scope ||
                  dataset?.document_id === node.entity_id);
          const status = dataset?.status || node.status;
          return (
            matchesSource &&
            (node.id.startsWith("concept:") ||
              reviewFilter === "all" ||
              status === reviewFilter)
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
    const pathIds = new Set(trail?.nodes.map((n) => n.id) || []);
    const peopleIds = new Set(
      view.edges
        .filter(
          (edge) =>
            [
              "expert_in",
              "asked_about",
              "knows",
              "learned_from",
              "guidance_requested",
              "wrote",
              "applies_to",
            ].includes(edge.kind) ||
            (edge.kind === "about" &&
              view.index.get(edge.source)?.entity_type === "expert_note"),
        )
        .flatMap((edge) => [edge.source, edge.target]),
    );
    for (const edge of view.edges)
      if (edge.kind === "belongs_to" && peopleIds.has(edge.source))
        peopleIds.add(edge.target);
    return new Set(
      [...keep].filter((id) => {
        const item = view.index.get(id)!;
        if (pathIds.has(id) || id === selected) return true;
        const type = item.entity_type || item.kind;
        if (type === "passage") return showPassages;
        if (scene === "all") return true;
        if (["mentioned_term", "command_reference"].includes(type))
          return scene === "evidence";
        if (scene === "people")
          return (
            item.kind === "person" ||
            type === "expert_note" ||
            peopleIds.has(id)
          );
        if (scene === "operations")
          return (
            item.kind === "source" ||
            item.kind === "entity" ||
            item.category === "warning"
          );
        if (scene === "evidence")
          return (
            ["person", "document", "topic"].includes(item.kind) ||
            item.source_kind === "document_evidence" ||
            item.source_kind === "semantic_knowledge"
          );
        return true;
      }),
    );
  }, [
    view,
    scope,
    reviewFilter,
    graph?.datasets,
    scene,
    showPassages,
    trail,
    selected,
  ]);
  const renderNodes = useMemo(
    () => view.nodes.filter((n) => visible.has(n.id)),
    [view.nodes, visible],
  );
  const renderEdges = useMemo(
    () =>
      view.edges.filter((e) => visible.has(e.source) && visible.has(e.target)),
    [view.edges, visible],
  );
  const accessEdge = documentAccess?.documentId === selected
    ? renderEdges.find((edge) => edge.id === documentAccess.edgeId)
    : undefined;
  const contributionEdge = accessEdge && renderEdges.find((edge) =>
    edge.kind === "contributed" && edge.target === selected && edge.source === documentAccess?.ownerId,
  );
  const accessPath = accessEdge && contributionEdge && documentAccess && !trail?.found
    ? { edgeId: accessEdge.id, contributorEdgeId: contributionEdge.id, firstAccess: documentAccess.firstAccess }
    : undefined;
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
            notes: decision === "submitted" ? "" : reviewReason.trim(),
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

  async function indexDocuments() {
    setIndexBusy(true);
    try {
      const result = await request<{ indexed_documents: number }>(
        "/graph/index-documents",
        { method: "POST", body: "{}" },
      );
      setSyncMessage(
        `${result.indexed_documents} existing document${result.indexed_documents === 1 ? "" : "s"} indexed. New uploads are indexed automatically.`,
      );
      await refresh(true);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setIndexBusy(false);
    }
  }

  useEffect(() => {
    const remaining = graph?.semantic?.needs_index || 0;
    if (!remaining || indexBusy || attemptedIndexCounts.current.has(remaining))
      return;
    attemptedIndexCounts.current.add(remaining);
    void indexDocuments();
  }, [graph?.semantic?.needs_index, indexBusy]);

  async function traceToSelected() {
    if (!pathStart || !selected) return;
    setTrailBusy(true);
    setPlayingTrail(false);
    try {
      const result = await request<EvidenceTrail>(
        "/graph/path?source=" +
          encodeURIComponent(pathStart.id) +
          "&target=" +
          encodeURIComponent(selected),
      );
      setTrail(result);
      if (result.found)
        setExpansion((previous) => ({
          nodes: [
            ...new Map(
              [...previous.nodes, ...result.nodes].map((n) => [n.id, n]),
            ).values(),
          ],
          edges: [
            ...new Map(
              [...previous.edges, ...result.edges].map((e) => [e.id, e]),
            ).values(),
          ],
        }));
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setTrailBusy(false);
    }
  }
  const trailKey = JSON.stringify(trail?.nodes.map((item) => item.id) || []);
  useEffect(() => {
    if (!playingTrail || !trail?.found) return;
    let index = 0;
    const show = () => {
      const id = trail.nodes[index].id;
      setSelected(id);
      setSpotlight(id);
      setTrailStep(index);
      index++;
      if (index >= trail.nodes.length) {
        window.clearInterval(timer);
        setPlayingTrail(false);
      }
    };
    const timer = window.setInterval(show, 1800);
    show();
    return () => window.clearInterval(timer);
  }, [playingTrail, trailKey]);

  return (
    <div className="graph-page network-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">KNOWLEDGE + SOURCE NETWORKS</div>
          <h1>{walkthrough ? "Knowledge Tree" : "Explore the connections."}</h1>
          <p>
            Zoom from the whole network into one system, relationship or
            contribution.
          </p>
        </div>
        <div className="network-actions">
          <button className="secondary" aria-expanded={transferOpen} onClick={() => transferOpen ? setTransferOpen(false) : openTransfer()}>
            <Users size={16} /> People &amp; handoffs
          </button>
          <button
            className="secondary"
            disabled={indexBusy}
            onClick={() => void indexDocuments()}
          >
            <GitBranch size={16} />
            {indexBusy ? "Indexing…" : "Index existing documents"}
          </button>
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
      {walkthrough && (
        <section className="tree-walkthrough" aria-label="Knowledge Tree walkthrough">
          <div className="tree-walkthrough-heading">
            <div>
              <div className="eyebrow">FICTIONAL WALKTHROUGH</div>
              <h2>One alert. Two different decisions.</h2>
            </div>
            <button className="secondary" onClick={onSwitch}>
              <Users size={16} /> Switch demo operator
            </button>
          </div>
          <p>
            You’re exploring as <strong>{operator.name}</strong>. Both cases start at 81% disk usage.
            Open either case to see what the senior checked and watch your access link appear.
            Switch to another of the {juniorCount} junior operators to try it with a separate history.
          </p>
          <div className="tree-walkthrough-actions">
            {WALKTHROUGH_CASES.map((sample) => {
              const item = graph?.nodes.find((node) => node.kind === "document" &&
                node.label === sample.title && node.owner_name === sample.contributor && node.status === "approved");
              return <button key={sample.title} className="secondary" disabled={!item}
                onClick={() => {
                  if (!item) return;
                  setScene("knowledge");
                  setDimension("3d");
                  choose(item.id, item);
                  window.requestAnimationFrame(() => window.document.getElementById("graph-network")?.scrollIntoView({ block: "nearest" }));
                }}>
                <FileText size={15} /> {sample.label}
              </button>;
            })}
            <button className="text-button" onClick={() => openTransfer(null, true)}>
              Browse Senior Contributors <ArrowRight size={14} />
            </button>
          </div>
        </section>
      )}
      {transferOpen && (
        <Suspense fallback={<p className="muted">Loading contributor directory…</p>}>
          <TransferDesk
            operator={operator}
            revision={graph?.revision}
            personId={transferPerson}
            seniorOnly={seniorOnly}
            onPerson={setTransferPerson}
            onOpenNode={openTransferDocument}
            onAction={setTransferAction}
            onRefresh={() => refresh(true)}
            onError={onError}
          />
        </Suspense>
      )}
      <div className="network-sourcebar">
        <Database size={16} />
        <div>
          <strong>
            {freshSources
              ? `${freshSources} connected read-only source${freshSources === 1 ? "" : "s"}`
              : graph?.datasets.some(
                    (dataset) => dataset.source_kind === "document_evidence",
                  )
                ? "Document evidence network"
                : "Knowledge and operational sources"}
          </strong>
          <span>
            {syncMessage ||
              (graph?.datasets.some(
                (dataset) => dataset.source_kind === "imported_export",
              )
                ? "Imported snapshots are labelled separately from live observations."
                : "Documents build evidence networks automatically. Monitoring reads use configured source access.")}
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
        <span>
          <strong>{graph?.semantic?.concepts || 0}</strong> documented concepts
        </span>
        <span>
          <strong>{graph?.semantic?.expert_notes || 0}</strong> signed guidance
        </span>
        <span><Users size={16} /><strong>{view.nodes.filter((item) => item.kind === "person").length}</strong> people in graph</span>
        <span>
          <strong>{renderNodes.length.toLocaleString()}</strong> visible in this
          view
        </span>
        {graph?.semantic?.bounded && (
          <span className="network-limit">
            Concept and evidence links are bounded. Search a concept to inspect
            its permitted neighborhood.
          </span>
        )}
        {graph?.truncated && (
          <span className="network-limit">
            Showing a bounded view of {graph.total_nodes.toLocaleString()} known
            nodes. Search to load another neighborhood.
          </span>
        )}
      </div>
      <div className="knowledge-lenses" aria-label="Knowledge graph views">
        {[
          ["knowledge", "Knowledge map"],
          ["people", "People & expertise"],
          ["operations", "Operational context"],
          ["evidence", "Source evidence"],
          ["all", "All relationships"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={scene === id}
            className={scene === id ? "active" : ""}
            onClick={() => {
              setScene(id);
              setShowPassages(id === "evidence" || id === "all");
            }}
          >
            {label}
          </button>
        ))}
        <label>
          <input
            type="checkbox"
            checked={showPassages}
            onChange={(event) => setShowPassages(event.target.checked)}
          />{" "}
          Manual passages
        </label>
      </div>
      <div className="network-workspace">
        <section className="network-panel">
          <div className="network-toolbar">
            <div
              className="segmented network-dimensions"
              aria-label="Graph dimensions"
            >
              <button
                aria-pressed={dimension === "3d"}
                className={dimension === "3d" ? "active" : ""}
                onClick={() => setDimension("3d")}
              >
                3D
              </button>
              <button
                aria-pressed={dimension === "2d"}
                className={dimension === "2d" ? "active" : ""}
                onClick={() => setDimension("2d")}
              >
                2D
              </button>
            </div>
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
                  {" · " + originLabel(dataset.source_kind)}
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
                newDocumentIds={newDocumentIds}
                dimension={dimension}
                nodes={renderNodes}
                edges={renderEdges}
                selected={selected}
                visible={visible}
                focusOnly={focusOnly}
                onSelect={choose}
                trailEdges={trail?.found ? trail.edges.map((e) => e.id) : []}
                spotlight={spotlight}
                viewKey={scene + ":" + showPassages}
                accessPath={accessPath}
              />
              {accessPath && (
                <p className="tree-access-note" role="status">
                  <GitBranch size={15} />
                  <span><strong>Accessed by {operator.name}</strong> · Contributed by {doc?.owner_name || node?.owner_name}</span>
                </p>
              )}
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
                ? "Connection focus · highlights are bounded; browse all loaded connections in the inspector"
                : "Positions and zoom stay in place when records update"}
            </span>
            <span>
              {checked
                ? "Checked " + shortTime(checked)
                : "Waiting for records"}
            </span>
          </footer>
          <div className="evidence-trail-bar">
            <Route size={17} />
            <span>
              {pathStart
                ? "Trace from: " + pathStart.label
                : "Select a node, then choose “Start evidence trail” in its details."}
            </span>
            {pathStart && (
              <button
                className="text-button"
                disabled={!selected || trailBusy}
                onClick={() => void traceToSelected()}
              >
                {trailBusy ? "Tracing…" : "Trace to selected node"}
              </button>
            )}
            {trail && (
              <>
                <span>
                  {trail.found
                    ? trail.edges.length + " stored relationships"
                    : trail.meaning}
                </span>
                {trail.found && (
                  <button
                    className="text-button"
                    onClick={() => setPlayingTrail((v) => !v)}
                  >
                    {playingTrail ? <Pause size={14} /> : <Play size={14} />}{" "}
                    {playingTrail ? "Pause trail" : "Play 3D trail"}
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    setTrail(null);
                    setPlayingTrail(false);
                    setSpotlight(null);
                  }}
                >
                  Clear trail
                </button>
              </>
            )}
          </div>
          {trail?.found && (
            <ol className="trail-itinerary" aria-label="Evidence trail steps">
              {trail.nodes.map((item, index) => (
                <li
                  key={item.id}
                  className={index === trailStep ? "active" : ""}
                >
                  <button
                    onClick={() => {
                      setSelected(item.id);
                      setSpotlight(item.id);
                      setTrailStep(index);
                    }}
                  >
                    {item.label}
                  </button>
                  {trail.edges[index] && (
                    <small>
                      {trail.edges[index].source === item.id ? "→ " : "← "}
                      {trail.edges[index].label}
                      {trail.edges[index].citation_id
                        ? " · " + trail.edges[index].citation_id
                        : ""}
                    </small>
                  )}
                </li>
              ))}
            </ol>
          )}
          {trail?.found && (
            <p className="trail-direction-note">
              Arrows retain the stored relationship direction. A trail can
              follow a link backwards without reversing its meaning.
            </p>
          )}
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
        <aside className="graph-inspector network-inspector" id="graph-inspector">
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
                        {dataset.stale
                          ? "Stale source"
                          : originLabel(dataset.source_kind)}
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
              <button
                className="text-button"
                onClick={() => {
                  setPathStart(node);
                  setTrail(null);
                  setPlayingTrail(false);
                }}
              >
                Start evidence trail here <Route size={14} />
              </button>
              {(node.demo_role || node.person_role) && (
                <p className="fine-print">
                  {node.demo_role ? DEMO_ROLE_LABELS[node.demo_role] : node.person_role + " · self-described contribution role"}
                  {node.status === "you" && " · You"}
                </p>
              )}
              {node.kind === "person" && (
                <button className="secondary full" onClick={() => openTransfer(node.entity_id)}>
                  <Users size={15} /> View contributions and request guidance
                </button>
              )}
              {(node.needs_review || node.superseded) && (
                <p className="studio-review-alert">
                  {node.superseded
                    ? "A reviewed newer edition is available."
                    : "The cited source needs review or has a newer approved edition."}
                </p>
              )}
              {selectedDataset && (
                <div className="network-provenance">
                  <strong>
                    {selectedDataset.stale
                      ? "Source unavailable or stale"
                      : originLabel(selectedDataset.source_kind)}
                  </strong>
                  <span>{selectedDataset.title}</span>
                  {selectedDataset.system_id && (
                    <span>System: {selectedDataset.system_id}</span>
                  )}
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
                          {typeof entity.properties.excerpt === "string" && (
                            <blockquote className="network-evidence-quote">
                              {entity.properties.excerpt}
                            </blockquote>
                          )}
                          {selectedDataset?.document_id && (
                            <button
                              className="secondary full"
                              onClick={() =>
                                choose(
                                  "document:" + selectedDataset.document_id,
                                )
                              }
                            >
                              <FileText size={15} />
                              Open source document
                            </button>
                          )}
                          <h4>Source properties</h4>
                          <dl className="entity-properties">
                            {Object.entries(entity.properties)
                              .filter(([key]) => key !== "excerpt")
                              .map(([key, value]) => (
                                <div key={key}>
                                  <dt>{key}</dt>
                                  <dd>
                                    {value === null ? "—" : String(value)}
                                  </dd>
                                </div>
                              ))}
                          </dl>
                        </>
                      )}
                      {entity.evidence?.length ? (
                        <div className="concept-evidence-list">
                          <h4>Cited documentation</h4>
                          {entity.evidence.map((item) => (
                            <article key={item.citation_id}>
                              <strong>{item.title}</strong>
                              <small>
                                {item.citation_id} ·{" "}
                                {item.method.replaceAll("_", " ")}
                              </small>
                              {item.edition && <small>{item.edition}</small>}
                              <blockquote>{item.quote}</blockquote>
                              <button
                                className="text-button"
                                onClick={() =>
                                  choose("document:" + item.document_id)
                                }
                              >
                                Open source document <ArrowRight size={13} />
                              </button>
                            </article>
                          ))}
                        </div>
                      ) : null}
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
                    {doc.reference && (
                      <div className="network-provenance">
                        <strong>Reference manual</strong>
                        <span>{doc.reference.edition}</span>
                        {doc.reference.source_url && (
                          <a
                            href={doc.reference.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open publisher reference
                          </a>
                        )}
                        <span>Release applicability requires review.</span>
                      </div>
                    )}
                    {doc.expert_note && (
                      <div className="network-provenance">
                        <strong>
                          Signed guidance ·{" "}
                          {doc.expert_note.category.replaceAll("_", " ")}
                        </strong>
                        <span>
                          {doc.owner_name} ·{" "}
                          {new Date(doc.expert_note.signed_at).toLocaleString()}
                        </span>
                        <span>
                          {doc.expert_note.citations.length} exact source
                          citations · {doc.expert_note.concept_ids.length}{" "}
                          scoped concepts
                        </span>
                        {doc.expert_note.citations.map((c) => (
                          <button key={c.citation_id} className="text-button" onClick={() => {
                            void request<Omit<NonNullable<typeof citationPreview>, "guidance_id">>(
                              "/knowledge/citations/" + encodeURIComponent(c.citation_id),
                            ).then((preview) => setCitationPreview({ ...preview, guidance_id: doc.id }))
                              .catch((error) => onError(errorMessage(error)));
                          }}>{c.relation} · {c.citation_id}</button>
                        ))}
                        {citationPreview?.guidance_id === doc.id && (
                          <div className="citation-preview">
                            <strong>{citationPreview.title}</strong>
                            <blockquote>{citationPreview.content}</blockquote>
                            <button className="text-button" onClick={() => choose("document:" + citationPreview.document_id)}>Open cited document</button>
                          </div>
                        )}
                      </div>
                    )}
                    {walkthrough && doc.content.startsWith(FICTIONAL_SAMPLE_PREFIX) ? (
                      <SampleDetails content={doc.content} />
                    ) : (
                      <details className="source-text-details">
                        <summary>Source text</summary>
                        <pre className="document-preview">{doc.content}</pre>
                      </details>
                    )}
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
                      <>
                      <label className="studio-field">
                        Review reasoning
                        <textarea maxLength={2000} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Explain how the source supports your decision." />
                      </label>
                      <div className="review-buttons">
                        <button
                          className="primary"
                          disabled={reviewBusy || reviewReason.trim().length < 10}
                          onClick={() => void review("approved")}
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          className="secondary"
                          disabled={reviewBusy || reviewReason.trim().length < 10}
                          onClick={() => void review("rejected")}
                        >
                          Request revision
                        </button>
                      </div>
                      </>
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
                            {edge.citation_id && " · " + edge.citation_id}
                            {edge.assertion_status === "awaiting_review" &&
                              " · author declaration, pending review"}
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
                  {expansion.total_edges
                    ? `${expansion.total_edges.toLocaleString()} permitted relationships; `
                    : ""}
                  this neighborhood shows up to 500.
                  Search a neighboring entity to continue exploring.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
      <section
        className="graph-change-journal"
        aria-label="Recent knowledge changes"
      >
        <header>
          <h3>Recent changes</h3>
          <button
            className="text-button"
            disabled={!graph?.events.length}
            onClick={() => {
              const event = graph?.events.find((e) =>
                view.index.has("document:" + e.document_id),
              );
              if (event) {
                choose("document:" + event.document_id);
                setSpotlight("document:" + event.document_id);
              }
            }}
          >
            Show latest change <ArrowRight size={14} />
          </button>
        </header>
        <div>
          {graph?.events.slice(0, 6).map((event) => (
            <button
              key={event.sequence}
              onClick={() => {
                const id =
                  event.detail?.concept_id || "document:" + event.document_id;
                if (view.index.has(id)) {
                  choose(id);
                  setSpotlight(id);
                }
              }}
            >
              <span>{event.kind.replaceAll("_", " ")}</span>
              <strong>
                {view.index.get("document:" + event.document_id)?.label ||
                  "Knowledge activity"}
              </strong>
              <small>{shortTime(event.created_at)}</small>
            </button>
          ))}
        </div>
      </section>
      <Suspense fallback={<p className="muted">Loading knowledge transfer…</p>}>
        <KnowledgeStudio
          graph={graph}
          selected={node}
          document={doc}
          operator={operator}
          onChoose={openTransferDocument}
          onRefresh={() => refresh(true)}
          onError={onError}
          transferAction={transferAction}
          onTransferHandled={() => setTransferAction(null)}
          initialCitation={
            entity?.evidence?.[0]?.citation_id ||
            (typeof entity?.properties.citation_id === "string"
              ? entity.properties.citation_id
              : undefined)
          }
        />
      </Suspense>
      {upload && (
        <KnowledgeUpload
          target={attach}
          onClose={() => setUpload(false)}
          onError={onError}
          onAdded={(id) => {
            setUpload(false);
            setSelected("document:" + id);
            setScope("all");
            setReviewFilter("all");
            window.requestAnimationFrame(() => window.document.getElementById("graph-network")?.scrollIntoView({ block: "nearest" }));
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
