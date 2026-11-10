import { useEffect, useRef, useState, type FormEvent } from "react";
import { Database, FileJson, Upload, X } from "lucide-react";
import { errorMessage } from "./types";
import { useWorkspaceRequest } from "./workspaceRequest";

export function TopologyImport({
  onClose,
  onAdded,
  onError,
}: {
  onClose: () => void;
  onAdded: (documentId: string) => void;
  onError: (text: string) => void;
}) {
  const request = useWorkspaceRequest();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState("network");
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      onError("Choose an export smaller than 16 MB.");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("title", title);
      if (format !== "network") data.append("source_id", format);
      const result = await request<{ document_id: string }>(
        format === "network" ? "/graph/import" : "/graph/monitoring-import",
        {
          method: "POST",
          body: data,
        },
      );
      onAdded(result.document_id);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal topology-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topology-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header>
          <div className="icon-tile">
            <Database size={22} />
          </div>
          <button
            ref={close}
            className="icon-button"
            aria-label="Close topology import"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <h2 id="topology-title">Import a source network</h2>
        <p className="muted">
          Bring an authorized node-and-relationship export into the graph. Its
          provenance stays visible as an imported snapshot.
        </p>
        <form onSubmit={submit}>
          <label>
            Export format
            <select
              aria-label="Export format"
              value={format}
              onChange={(event) => {
                setFormat(event.target.value);
                setFile(null);
              }}
            >
              <option value="network">Network JSON / CSV / Graphology</option>
              <option value="prognosis">Prognosis dataset JSON</option>
              <option value="momi">MOMI alarm export (TXT / TSV / LOG)</option>
            </select>
          </label>
          <label>
            Dataset name
            <input
              key={format}
              required
              minLength={2}
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Authorized environment topology"
            />
          </label>
          <label className="file-drop">
            <Upload size={25} />
            <strong>{file?.name || "Choose a topology export"}</strong>
            <span>JSON or CSV · Up to 16 MB · 25,000 nodes</span>
            <input
              required
              type="file"
              accept={
                format === "momi"
                  ? ".txt,.tsv,.log"
                  : format === "prognosis"
                    ? ".json"
                    : ".json,.csv"
              }
              onChange={(event) => {
                const chosen = event.target.files?.[0] || null;
                setFile(chosen);
                if (chosen && !title)
                  setTitle(chosen.name.replace(/\.[^.]+$/, "").slice(0, 160));
              }}
            />
          </label>
          <p className="fine-print">
            Only use data shared with you for this project. Imports start as
            private drafts; independent approval enables team access. An import
            does not establish a live CAIL connection.
          </p>
          <button className="primary full" disabled={busy}>
            <FileJson size={17} />
            {busy ? "Validating and importing…" : "Import network"}
          </button>
        </form>
        {format !== "network" && (
          <p className="fine-print">
            Source rows create observations linked to their reported system and
            category. These links describe the export; they do not imply
            physical dependencies or current system health.
          </p>
        )}
        <details className="import-format">
          <summary>Accepted export formats</summary>
          <p>
            JSON with nodes and edges; Graphology-style keys and attributes are
            also accepted.
          </p>
          <pre>
            {
              '{\n  "nodes": [{"id":"A","label":"Node A","type":"system"},\n            {"id":"B","label":"Node B","type":"service"}],\n  "edges": [{"source":"A","target":"B","label":"hosts"}]\n}'
            }
          </pre>
          <p>
            Relationship CSV:
            source,target,relationship,source_label,target_label. Node-only CSV:
            id,label,type. Connections must be supplied by the source; none are
            invented.
          </p>
        </details>
      </section>
    </div>
  );
}
