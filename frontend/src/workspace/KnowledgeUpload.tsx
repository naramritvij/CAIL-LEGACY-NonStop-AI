import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, Upload, X } from "lucide-react";
import {
  errorMessage,
  request,
  type GraphNode,
  type KnowledgeDocument,
} from "./types";

export function KnowledgeUpload({
  onClose,
  onAdded,
  onError,
  target,
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
  onError: (text: string) => void;
  target?: GraphNode | null;
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
        if (target) data.append("target_node_id", target.id);
        doc = await request<KnowledgeDocument>("/documents/upload", {
          method: "POST",
          body: data,
        });
      } else {
        doc = await request<KnowledgeDocument>("/documents", {
          method: "POST",
          body: JSON.stringify({
            title,
            content,
            topic,
            target_node_id: target?.id,
          }),
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
        <h2 id="upload-title">
          {target
            ? "Attach knowledge to this node"
            : "Add to your knowledge graph"}
        </h2>
        {target && (
          <div className="attachment-target">
            Linked to: <strong>{target.label}</strong>
          </div>
        )}
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
