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
  const [mode, setMode] = useState<"file" | "text" | "reference">("file");
  const [topic, setTopic] = useState("NonStop operations");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [edition, setEdition] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [references, setReferences] = useState<
    { key: string; title: string; publisher_page: string }[]
  >([]);
  const [referenceKey, setReferenceKey] = useState("hpe-tacl-reference");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    if (mode !== "reference") return;
    let active = true;
    request<{ references: typeof references }>("/references")
      .then((result) => {
        if (active) setReferences(result.references);
      })
      .catch((error) => {
        if (active) onError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [mode, onError]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      let doc: KnowledgeDocument;
      if (mode === "reference") {
        doc = await request<KnowledgeDocument>("/references/import", {
          method: "POST",
          body: JSON.stringify({
            reference_key: referenceKey,
            target_node_id: target?.id,
          }),
        });
      } else if (mode === "file") {
        if (!file) throw new Error("Choose a document first.");
        if (file.size > (manual ? 32 : 4) * 1024 * 1024)
          throw new Error(`Choose a file smaller than ${manual ? 32 : 4} MB.`);
        const data = new FormData();
        data.append("file", file);
        data.append("topic", topic);
        if (title.trim()) data.append("title", title.trim());
        if (target) data.append("target_node_id", target.id);
        if (manual) {
          data.append("edition", edition || "Not specified");
          data.append("source_url", sourceUrl);
        }
        doc = await request<KnowledgeDocument>(
          manual ? "/documents/manual" : "/documents/upload",
          {
            method: "POST",
            body: data,
          },
        );
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
          <button
            className={mode === "reference" ? "active" : ""}
            onClick={() => setMode("reference")}
          >
            HPE references
          </button>
        </div>
        <form onSubmit={submit}>
          {mode !== "reference" && (
            <label>
              Topic
              <input
                required
                maxLength={60}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
            </label>
          )}
          {mode === "file" && (
            <label>
              Document title
              <input
                minLength={2}
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="A clear name for this document"
              />
            </label>
          )}
          {mode === "reference" ? (
            <div className="reference-fields">
              <label>
                Publisher document
                <select
                  aria-label="Publisher document"
                  value={referenceKey}
                  onChange={(event) => setReferenceKey(event.target.value)}
                >
                  {references.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="fine-print">
                Downloads the real publisher PDF into your private graph.
                Passage and reference nodes link to the actual text. This is
                public documentation, not customer monitoring data. Review is
                required before assistant use.
              </p>
              {references.find((entry) => entry.key === referenceKey) && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={
                    references.find((entry) => entry.key === referenceKey)!
                      .publisher_page
                  }
                >
                  View HPE publisher page
                </a>
              )}
            </div>
          ) : mode === "file" ? (
            <>
              <label className="reference-toggle">
                <input
                  type="checkbox"
                  checked={manual}
                  onChange={(event) => setManual(event.target.checked)}
                />
                <span>Reference manual · up to 32 MB</span>
              </label>
              {manual && (
                <div className="reference-fields">
                  <label>
                    Edition / release
                    <input
                      maxLength={240}
                      value={edition}
                      onChange={(event) => setEdition(event.target.value)}
                      placeholder="Use the edition printed on the manual"
                    />
                  </label>
                  <label>
                    Source URL (optional)
                    <input
                      type="url"
                      pattern="https://.*"
                      maxLength={1000}
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://support.hpe.com/…"
                    />
                  </label>
                  <p className="fine-print">
                    The manual becomes a network of passages and literal
                    references, with its edition attached. Upload a document you
                    have downloaded from the publisher.
                  </p>
                  <a
                    href="https://support.hpe.com/hpesc/public/docDisplay?docId=a00045541en_us&docLocale=en_US"
                    target="_blank"
                    rel="noreferrer"
                  >
                    HPE TMF documentation
                  </a>
                </div>
              )}
              <label className="file-drop">
                <Upload size={26} />
                <strong>{file ? file.name : "Choose a document"}</strong>
                <span>
                  {manual
                    ? "PDF, TXT or MD · Up to 32 MB / 1,000 pages"
                    : "PDF, DOCX, TXT, MD, CSV or LOG · Up to 4 MB"}
                </span>
                <input
                  required
                  type="file"
                  accept={
                    manual ? ".pdf,.txt,.md" : ".pdf,.docx,.txt,.md,.csv,.log"
                  }
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </label>
            </>
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
          <button
            className="primary full"
            disabled={busy || (mode === "reference" && !references.length)}
          >
            {busy
              ? mode === "reference"
                ? "Downloading and indexing…"
                : "Adding document…"
              : mode === "reference"
                ? "Import publisher PDF"
                : "Add knowledge"}
            <Plus size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}
