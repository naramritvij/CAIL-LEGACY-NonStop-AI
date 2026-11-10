import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, FileText, KeyRound, Search, Users } from "lucide-react";
import { DEMO_ROLE_LABELS, errorMessage, request, type DemoRole, type Operator } from "./types";
import "../styles/transfer.css";

export interface Handoff {
  id: string;
  requester_id: string;
  requester_name: string;
  contributor_id: string;
  contributor_name: string;
  question: string;
  state: string;
  context: { id: string; title: string } | null;
  guidance: { id: string; title: string; status: string; review_notes?: string } | null;
  assessment: { state: string; reviewer_name?: string; reviewed_at?: string; feedback?: string } | null;
}

export type TransferAction =
  | { kind: "respond" | "explain"; handoff: Handoff }
  | { kind: "reviews" };

interface Contributor {
  id: string;
  name: string;
  role: string;
  documents: number;
  approved_guidance: number;
  accessed_documents: number;
  active: boolean;
  managed: boolean;
  can_review: boolean;
  demo_role?: DemoRole;
}

interface Contributions {
  person: { id: string; name: string; can_request: boolean };
  documents: { id: string; title: string; status: string; category?: string }[];
  total: number;
  next_offset: number | null;
}

interface Receipt {
  guidance_id: string;
  guidance: string;
  guidance_sha256: string;
  contributor: string;
  learner: string;
  explanation_reviewer: string;
  reviewed_at: string;
  criteria: string[];
  sources: { citation_id: string; title: string; edition?: string; source_hash: string }[];
}

const STAGES: Record<string, string> = {
  requested: "Waiting for contributor",
  drafting: "Guidance draft",
  guidance_review: "Independent guidance review",
  guidance_returned: "Guidance returned",
  ready_to_explain: "Ready for learner explanation",
  explanation_review: "Independent explanation review",
  explanation_returned: "Explanation returned",
  verified: "Learning verified",
  source_review: "Source changed · recheck required",
  closed: "Closed",
};

export function TransferDesk({
  operator,
  revision,
  personId,
  seniorOnly,
  onPerson,
  onOpenNode,
  onAction,
  onRefresh,
  onError,
}: {
  operator: Operator;
  revision?: number;
  personId: string | null;
  seniorOnly: boolean;
  onPerson: (id: string | null) => void;
  onOpenNode: (id: string) => void;
  onAction: (action: TransferAction) => void;
  onRefresh: () => Promise<void>;
  onError: (text: string) => void;
}) {
  const [people, setPeople] = useState<Contributor[]>([]);
  const [total, setTotal] = useState(0);
  const [nextPeople, setNextPeople] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Contributions | null>(null);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [nextRequests, setNextRequests] = useState<number | null>(null);
  const [reviewQueue, setReviewQueue] = useState<{ id: string; title: string; owner_name: string; category?: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("contributor");
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (offset = 0, signal?: AbortSignal) => {
    const result = await request<{ contributors: Contributor[]; total: number; next_offset: number | null }>(
      "/knowledge/contributors?q=" + encodeURIComponent(query) + "&offset=" + offset + (seniorOnly ? "&senior_only=true" : ""),
      { signal },
    );
    if (signal?.aborted) return;
    setPeople((previous) => offset ? [...previous, ...result.contributors] : result.contributors);
    setTotal(result.total);
    setNextPeople(result.next_offset);
  }, [query, seniorOnly]);

  const loadRequests = useCallback(async (offset = 0, signal?: AbortSignal) => {
    const result = await request<{ requests: Handoff[]; next_offset: number | null }>("/knowledge/handoffs?offset=" + offset, { signal });
    if (signal?.aborted) return;
    setHandoffs((previous) => offset ? [...previous, ...result.requests] : result.requests);
    setNextRequests(result.next_offset);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(0, controller.signal).catch((error) => { if (!controller.signal.aborted) onError(errorMessage(error)); });
    }, query ? 180 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [load, query, revision, onError]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      loadRequests(0, controller.signal),
      request<{ documents: typeof reviewQueue }>("/knowledge/review-queue", { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) setReviewQueue(result.documents);
      }),
    ]).then(() => { if (!controller.signal.aborted) setLoaded(true); })
      .catch((error) => { if (!controller.signal.aborted) onError(errorMessage(error)); });
    return () => controller.abort();
  }, [revision, loadRequests, onError]);

  useEffect(() => {
    setDetail(null);
    setQuestion("");
    setContext("");
    setRequestKey("");
  }, [personId]);
  useEffect(() => {
    if (!personId) return;
    const controller = new AbortController();
    void request<Contributions>("/knowledge/contributors/" + encodeURIComponent(personId) + "/documents", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setDetail(result); })
      .catch((error) => { if (!controller.signal.aborted) onError(errorMessage(error)); });
    return () => controller.abort();
  }, [personId, revision, onError]);

  async function moreDocuments() {
    if (!detail || detail.next_offset === null) return;
    const person = detail.person.id;
    try {
      const next = await request<Contributions>("/knowledge/contributors/" + encodeURIComponent(person) + "/documents?offset=" + detail.next_offset);
      setDetail((previous) => previous?.person.id === person
        ? { ...next, documents: [...previous.documents, ...next.documents] } : previous);
    } catch (error) { onError(errorMessage(error)); }
  }

  async function mutate(path: string, body?: object) {
    setBusy(true);
    if (path.startsWith("/knowledge/contributors")) setAccessKey("");
    try {
      const result = await request<{ access_key?: string }>(path, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (result.access_key) setAccessKey(result.access_key);
      await onRefresh();
      return true;
    } catch (error) {
      onError(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    // Keep the same request key through a retry after a network interruption.
    const key = requestKey || Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    setRequestKey(key);
    if (await mutate("/knowledge/handoffs", {
      contributor_id: detail.person.id, question: question.trim(), context_id: context || null, request_key: key,
    })) {
      setQuestion("");
      setContext("");
      setRequestKey("");
    }
  }

  async function openReceipt(id: string) {
    try {
      const receipt = await request<Receipt>("/knowledge/handoffs/" + id + "/receipt");
      setReceipts((previous) => ({ ...previous, [id]: receipt }));
    } catch (error) { onError(errorMessage(error)); }
  }

  return (
    <section className="transfer-desk" id="knowledge-transfer" aria-label="People and knowledge transfer">
      <header>
        <div>
          <span className="eyebrow">KNOWLEDGE TRANSFER</span>
          <h2>People &amp; handoffs</h2>
          <p>Find a contributor, request cited guidance and track independently reviewed learning.</p>
        </div>
        {operator.transfer_demo && <span className="status-badge">Synthetic transfer demonstration</span>}
      </header>
      {operator.local_demo && (
        <p className="transfer-notice">This workspace has one local identity. Configure separate contributor, reviewer and learner accounts to exchange guidance.</p>
      )}
      <div className="transfer-grid">
        <section aria-label="Contributor directory">
          <h3><Users size={17} /> {seniorOnly ? "Senior Contributors" : "Contributors"} · {total}</h3>
          <label className="transfer-search">
            <Search size={15} />
            <input aria-label="Search contributors" placeholder="Find a contributor" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="transfer-people">
            {people.map((person) => (
              <button key={person.id} className={personId === person.id ? "active" : ""} onClick={() => onPerson(person.id)}>
                <span><strong>{person.name}{person.id === operator.id ? " · You" : ""}</strong>
                  <small>{person.demo_role ? DEMO_ROLE_LABELS[person.demo_role] : person.role}{person.can_review ? " · can review" : ""} · {person.documents} visible documents · {person.approved_guidance} signed guidance</small>
                  <small>{person.accessed_documents ? "You accessed " + person.accessed_documents + " documents" : person.active ? "Available in the workspace" : "Archived contributor"}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
          {nextPeople !== null && <button className="text-button" onClick={() => void load(nextPeople).catch((error) => onError(errorMessage(error)))}>More contributors</button>}
          {operator.can_manage_members && (
            <details>
              <summary>Add a contributor</summary>
              <form className="transfer-form" onSubmit={async (event) => {
                event.preventDefault();
                if (await mutate("/knowledge/contributors", { name: newName.trim(), role: newRole })) setNewName("");
              }}>
                <label>Display name<input required minLength={2} maxLength={100} value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
                <label>Access role<select value={newRole} onChange={(event) => setNewRole(event.target.value)}>
                  <option value="contributor">Contributor or learner</option>
                  <option value="reviewer">Independent reviewer</option>
                </select></label>
                <button className="secondary" disabled={busy || newName.trim().length < 2}><KeyRound size={15} /> Create access key</button>
              </form>
            </details>
          )}
          {accessKey && (
            <div className="transfer-notice" role="status">
              <label>Copy this access key now<input readOnly value={accessKey} onFocus={(event) => event.target.select()} /></label>
              <p>Share it privately with the new operator. It is displayed once.</p>
              <button className="text-button" onClick={() => setAccessKey("")}>Hide key</button>
            </div>
          )}
          {detail && (
            <section className="transfer-detail" aria-label="Contributor documents">
              <h4>{detail.person.name} · {detail.total} visible documents</h4>
              {detail.documents.map((document) => (
                <button className="transfer-document" key={document.id} onClick={() => onOpenNode("document:" + document.id)}>
                  <FileText size={15} /><span>{document.title}<small>{document.status}</small></span><ArrowRight size={14} />
                </button>
              ))}
              {!detail.documents.length && <p className="muted">No visible contributions yet.</p>}
              {detail.next_offset !== null && <button className="text-button" onClick={() => void moreDocuments()}>More documents</button>}
              {detail.person.can_request && (
                <form className="transfer-form" onSubmit={(event) => void send(event)}>
                  <label>Request guidance from {detail.person.name}
                    <textarea required minLength={12} maxLength={2000} value={question} onChange={(event) => { setQuestion(event.target.value); setRequestKey(""); }} placeholder="Describe the decision or procedure you need to understand." />
                  </label>
                  <label>Optional approved document
                    <select value={context} onChange={(event) => { setContext(event.target.value); setRequestKey(""); }}>
                      <option value="">Choose context</option>
                      {detail.documents.filter((doc) => doc.status === "approved").map((doc) => <option value={doc.id} key={doc.id}>{doc.title}</option>)}
                    </select>
                  </label>
                  <small>Only you and this contributor can read the request.</small>
                  <button className="primary" disabled={busy || question.trim().length < 12}>Send guidance request</button>
                </form>
              )}
              {operator.can_manage_members && people.find((person) => person.id === detail.person.id)?.managed && (
                <details>
                  <summary>Manage contributor access</summary>
                  <p>Replacing or disabling a key ends this member’s current sessions.</p>
                  <div className="transfer-actions">
                    <button className="secondary" disabled={busy} onClick={() => void mutate("/knowledge/contributors/" + detail.person.id + "/access?action=rotate")}>Replace access key</button>
                    <button className="secondary" disabled={busy} onClick={() => void mutate("/knowledge/contributors/" + detail.person.id + "/access?action=revoke")}>Disable access</button>
                  </div>
                </details>
              )}
            </section>
          )}
        </section>
        <section aria-label="Guidance handoffs">
          <h3>Guidance requests</h3>
          {loaded && !handoffs.length && <p className="muted">Choose a contributor to start a knowledge handoff.</p>}
          {handoffs.map((handoff) => {
            const received = handoff.contributor_id === operator.id;
            const savedReceipt = receipts[handoff.id];
            const receipt = savedReceipt?.guidance_id === handoff.guidance?.id &&
              savedReceipt?.reviewed_at === handoff.assessment?.reviewed_at ? savedReceipt : undefined;
            return (
              <article className="handoff-card" key={handoff.id}>
                <div className="handoff-heading">
                  <strong>{received ? "From " + handoff.requester_name : "To " + handoff.contributor_name}</strong>
                  <span className={"handoff-state " + handoff.state}>{STAGES[handoff.state] || handoff.state}</span>
                </div>
                <p>{handoff.question}</p>
                {handoff.context && <button className="text-button" onClick={() => onOpenNode("document:" + handoff.context!.id)}>Read request context</button>}
                {handoff.guidance && <button className="transfer-document" onClick={() => onOpenNode("document:" + handoff.guidance!.id)}><FileText size={15} /><span>{handoff.guidance.title}<small>{handoff.guidance.status}</small></span><ArrowRight size={14} /></button>}
                {handoff.guidance?.review_notes && <p className="transfer-notice">{handoff.guidance.review_notes}</p>}
                {handoff.assessment?.feedback && <p className="transfer-notice">{handoff.assessment.feedback}</p>}
                <div className="transfer-actions">
                  {received && ["requested", "source_review", "guidance_returned"].includes(handoff.state) &&
                    <button className="primary" onClick={() => onAction({ kind: "respond", handoff })}>{handoff.guidance ? "Write revised guidance" : "Write guidance"}</button>}
                  {!received && handoff.guidance && ["ready_to_explain", "explanation_returned"].includes(handoff.state) &&
                    <button className="primary" onClick={() => onAction({ kind: "explain", handoff })}>Explain the guidance</button>}
                  {handoff.state === "verified" && <button className="secondary" onClick={() => void openReceipt(handoff.id)}><CheckCircle2 size={15} /> View learning receipt</button>}
                  {!["closed", "verified"].includes(handoff.state) && <button className="text-button" disabled={busy} onClick={() => void mutate("/knowledge/handoffs/" + handoff.id + "/close")}>Close request</button>}
                </div>
                {handoff.state === "verified" && receipt && (
                  <div className="transfer-receipt">
                    <strong>Verified learning for {receipt.learner}</strong>
                    <p>{receipt.guidance} · {receipt.contributor}</p>
                    <p>Reviewed by {receipt.explanation_reviewer} on {new Date(receipt.reviewed_at).toLocaleString()}</p>
                    <ul>{receipt.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
                    {receipt.sources.map((source) => <p key={source.citation_id}>{source.title} · {source.edition || "Uploaded edition"} · {source.citation_id}</p>)}
                    <details><summary>Guidance version</summary><code>{receipt.guidance_sha256}</code></details>
                  </div>
                )}
              </article>
            );
          })}
          {nextRequests !== null && <button className="text-button" onClick={() => void loadRequests(nextRequests).catch((error) => onError(errorMessage(error)))}>More requests</button>}
          {operator.can_review && (
            <div className="transfer-review">
              <h3>Independent review</h3>
              {reviewQueue.map((document) => <button className="transfer-document" key={document.id} onClick={() => onOpenNode("document:" + document.id)}><FileText size={15} /><span>{document.title}<small>{document.owner_name} · {document.category ? "Signed guidance" : "Source document"}</small></span><ArrowRight size={14} /></button>)}
              {!reviewQueue.length && <p className="muted">No documents awaiting review.</p>}
              <button className="secondary" onClick={() => onAction({ kind: "reviews" })}>Open explanation reviews</button>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
