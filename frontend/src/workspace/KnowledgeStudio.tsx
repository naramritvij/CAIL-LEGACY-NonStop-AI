import { useEffect, useState } from "react";
import type { Handoff, TransferAction } from "./TransferDesk";
import { ArrowRight, Check, GraduationCap, PenLine, X } from "lucide-react";
import {
  request,
  errorMessage,
  type GraphData,
  type GraphNode,
  type GraphEntityDetail,
  type KnowledgeDocument,
  type Operator,
} from "./types";

type Catalog = {
  concepts: { id: string; label: string; kind: string; subsystem: string }[];
  notes: {
    id: string;
    title: string;
    owner_id: string;
    owner_name: string;
    status: string;
    category: string;
    needs_review: boolean;
    superseded: boolean;
  }[];
  citations: {
    id: string;
    document_id: string;
    title: string;
    excerpt: string;
    status: string;
  }[];
  documents: { id: string; title: string; status: string }[];
  profile: { role: string; share_activity: number };
};
type Draft = {
  title: string;
  content: string;
  category: string;
  concept_ids: string[];
  citations: { citation_id: string; relation: string }[];
  previous?: string;
  target?: string;
  handoff_id?: string;
  handoff_question?: string;
};
type CheckSession = {
  id: string;
  document_id: string;
  prompt: string;
  meaning: string;
  assessment: string;
  guidance_excerpt?: string;
};
type ExplanationReview = {
  check_id: string;
  person_id: string;
  document_id: string;
  title: string;
  learner_name: string;
  answer: string;
  feedback: string;
  status: string;
  review_notes?: string;
  handoff_id?: string;
};
export interface EvidenceTrail {
  found: boolean;
  nodes: GraphNode[];
  edges: GraphData["edges"];
  meaning: string;
}

export function KnowledgeStudio({
  graph,
  selected,
  document,
  operator,
  onChoose,
  onRefresh,
  onError,
  initialCitation,
  transferAction,
  onTransferHandled,
}: {
  graph: GraphData | null;
  selected: GraphNode | null | undefined;
  document: KnowledgeDocument | null;
  operator: Operator;
  onChoose: (id: string) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  initialCitation?: string;
  transferAction?: TransferAction | null;
  onTransferHandled?: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("contributor");
  const [share, setShare] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [check, setCheck] = useState<CheckSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [previousEdition, setPreviousEdition] = useState("");
  const [checkMode, setCheckMode] = useState("reference_recall");
  const [reviews, setReviews] = useState<ExplanationReview[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewCriteria, setReviewCriteria] = useState<Record<string, string[]>>({});
  const [rubric, setRubric] = useState<Record<string, string>>({});
  const [showReviews, setShowReviews] = useState(false);
  const [pinnedCitations, setPinnedCitations] = useState<Catalog["citations"]>(
    [],
  );
  useEffect(() => {
    let current = true;
    request<{ checks: ExplanationReview[]; rubric: Record<string, string> }>("/knowledge/check-reviews")
      .then((result) => {
        if (current) {
          setReviews(result.checks);
          setRubric(result.rubric);
        }
      })
      .catch((error) => {
        if (current) onError(errorMessage(error));
      });
    return () => {
      current = false;
    };
  }, [graph?.cursor, onError]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(
      () => {
        request<Catalog>("/knowledge/catalog?q=" + encodeURIComponent(query))
          .then((result) => {
            if (!active) return;
            setCatalog(result);
            if (!profileLoaded) {
              setRole(result.profile.role);
              setShare(Boolean(result.profile.share_activity));
              setProfileLoaded(true);
            }
          })
          .catch((error) => {
            if (active) onError(errorMessage(error));
          });
      },
      query ? 200 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, graph?.cursor, onError, profileLoaded]);

  function editGuidance(revise = false, handoff?: Handoff) {
    setPinnedCitations([]);
    const original = revise && document?.expert_note ? document : null;
    setQuery(selected?.id.startsWith("concept:") ? selected.label : "");
    setDraft({
      title: handoff ? ("Guidance for " + handoff.requester_name).slice(0, 160) : original ? original.title + " · updated" : "",
      content: original?.content || "",
      category: original?.expert_note?.category || "guidance",
      concept_ids:
        original?.expert_note?.concept_ids ||
        (selected?.id.startsWith("concept:") ? [selected.id] : []),
      citations: original?.expert_note?.citations || [
        { citation_id: initialCitation || "", relation: "cites" },
      ],
      previous: handoff?.guidance?.id || original?.id,
      handoff_id: handoff?.id,
      handoff_question: handoff?.question,
      target:
        selected?.id.startsWith("entity:") || selected?.id.startsWith("source:")
          ? selected.id
          : undefined,
    });
    const scopes =
      original?.expert_note?.concept_ids ||
      (selected?.id.startsWith("concept:") ? [selected.id] : []);
    for (const id of scopes) void loadConceptEvidence(id);
  }
  async function loadConceptEvidence(id: string) {
    try {
      const detail = await request<GraphEntityDetail>(
        "/graph/node?node_id=" + encodeURIComponent(id),
      );
      const options = (detail.evidence || []).map((e) => ({
        id: e.citation_id,
        document_id: e.document_id,
        title: e.title,
        excerpt: e.quote,
        status: e.status || "source evidence",
      }));
      setPinnedCitations((previous) => [
        ...new Map([...previous, ...options].map((c) => [c.id, c])).values(),
      ]);
      if (options[0])
        setDraft((previous) =>
          previous && previous.concept_ids.includes(id)
            ? {
                ...previous,
                citations: previous.citations.map((c, index) =>
                  index === 0 && !c.citation_id
                    ? { ...c, citation_id: options[0].id }
                    : c,
                ),
              }
            : previous,
        );
    } catch (error) {
      onError(errorMessage(error));
    }
  }
  async function signGuidance() {
    if (
      !draft ||
      !draft.concept_ids.length ||
      draft.citations.some((c) => !c.citation_id)
    ) {
      onError(
        "Choose a documented concept and at least one exact source citation.",
      );
      return;
    }
    setBusy(true);
    try {
      const note = await request<KnowledgeDocument>("/knowledge/notes", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          topic: selected?.subsystem || "Expert guidance",
          supersedes_document_id: draft.previous,
          target_node_id: draft.target,
          sign_as_current_user: true,
        }),
      });
      setDraft(null);
      await onRefresh();
      onChoose("document:" + note.id);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function reuseGuidance(documentId: string) {
    if (!draft?.handoff_id || !documentId) return;
    setBusy(true);
    try {
      await request("/knowledge/handoffs/" + draft.handoff_id + "/guidance", {
        method: "POST",
        body: JSON.stringify({ document_id: documentId }),
      });
      setDraft(null);
      await onRefresh();
      onChoose("document:" + documentId);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function startCheck(id: string, handoffId?: string) {
    setBusy(true);
    setFeedback("");
    setAnswer("");
    try {
      setCheck(
        await request<CheckSession>("/knowledge/checks", {
          method: "POST",
          body: JSON.stringify({
            document_id: id,
            mode: handoffId ? "explanation" : checkMode,
            handoff_id: handoffId,
          }),
        }),
      );
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function submitCheck() {
    if (!check) return;
    setBusy(true);
    try {
      const result = await request<{
        passed: boolean;
        feedback: string;
        expected?: string;
      }>("/knowledge/checks/" + check.id + "/answer", {
        method: "POST",
        body: JSON.stringify({ answer }),
      });
      setFeedback(
        result.feedback +
          (result.expected ? " Documented command: " + result.expected : ""),
      );
      setCheck(null);
      await onRefresh();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile() {
    setBusy(true);
    try {
      await request("/knowledge/profile", {
        method: "POST",
        body: JSON.stringify({ role, share_activity: share }),
      });
      setFeedback(
        "Learning profile saved. Sharing controls visibility of learning activity; it does not change access permissions.",
      );
      await onRefresh();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function reviewExplanation(id: string, decision: string) {
    setBusy(true);
    try {
      await request("/knowledge/checks/" + id + "/review", {
        method: "POST",
        body: JSON.stringify({ decision, notes: reviewNotes[id] || "", criteria: reviewCriteria[id] || [] }),
      });
      setFeedback(
        decision === "approved"
          ? "Explanation approved. The learning relationship now records an independent source review."
          : "Explanation returned with review feedback.",
      );
      await onRefresh();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!transferAction) return;
    if (transferAction.kind === "respond") editGuidance(false, transferAction.handoff);
    if (transferAction.kind === "explain" && transferAction.handoff.guidance)
      void startCheck(transferAction.handoff.guidance.id, transferAction.handoff.id);
    if (transferAction.kind === "reviews") {
      setShowReviews(true);
      window.requestAnimationFrame(() => window.document.getElementById("explanation-review-queue")?.scrollIntoView({ block: "start" }));
    }
    onTransferHandled?.();
  }, [transferAction]);
  async function linkEdition() {
    if (!document || !previousEdition) return;
    setBusy(true);
    try {
      await request("/knowledge/editions", {
        method: "POST",
        body: JSON.stringify({
          newer_id: document.id,
          previous_id: previousEdition,
        }),
      });
      setPreviousEdition("");
      setFeedback(
        "Edition relationship saved. Approval of this edition flags dependent guidance for source review.",
      );
      await onRefresh();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const reusableNotes = draft?.handoff_id
    ? (catalog?.notes || []).filter((note) =>
      note.owner_id === operator.id && note.status === "approved" && !note.needs_review && !note.superseded)
    : [];
  const eligibleNotes = (catalog?.notes || []).filter(
    (n) =>
      n.status === "approved" &&
      n.owner_id !== operator.id &&
      !n.needs_review &&
      !n.superseded,
  );
  const scopeOptions = [
    ...new Map(
      [
        ...(graph?.nodes
          .filter((n) => draft?.concept_ids.includes(n.id))
          .map((n) => ({
            id: n.id,
            label: n.label,
            kind: n.entity_type || "concept",
            subsystem: n.subsystem || "",
          })) || []),
        ...(selected?.id.startsWith("concept:")
          ? [
              {
                id: selected.id,
                label: selected.label,
                kind: selected.entity_type || "concept",
                subsystem: selected.subsystem || "",
              },
            ]
          : []),
        ...(catalog?.concepts || []),
      ].map((c) => [c.id, c]),
    ).values(),
  ];
  const citationOptions = [
    ...new Map(
      [...pinnedCitations, ...(catalog?.citations || [])].map((c) => [c.id, c]),
    ).values(),
  ];
  return (
    <section className="knowledge-studio" aria-label="Knowledge transfer">
      <header>
        <div>
          <span className="eyebrow">PEOPLE + OPERATIONAL KNOWLEDGE</span>
          <h2>Make the connections meaningful.</h2>
          <p>
            Signed guidance, cited concepts and learning activity become part of
            the same graph.
          </p>
        </div>
        <button className="primary" onClick={() => editGuidance()}>
          <PenLine size={16} /> Capture expert guidance
        </button>
      </header>
      <div className="studio-columns">
        <section>
          <h3>
            Signed guidance <span>{catalog?.notes.length || 0}</span>
          </h3>
          <div className="guidance-list">
            {(catalog?.notes || []).slice(0, 8).map((n) => (
              <button key={n.id} onClick={() => onChoose("document:" + n.id)}>
                <PenLine size={16} />
                <span>
                  <strong>{n.title}</strong>
                  <small>
                    {n.owner_name} · {n.status}
                    {n.superseded
                      ? " · superseded"
                      : n.needs_review
                        ? " · source review needed"
                        : ""}
                  </small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {!catalog?.notes.length && (
              <p>
                No signed guidance yet. Select a command or subsystem, then
                capture the author’s guidance with its source citations.
              </p>
            )}
          </div>
          {document?.owner_id === operator.id && document.expert_note && (
            <button className="secondary" onClick={() => editGuidance(true)}>
              Revise selected guidance
            </button>
          )}
          {document?.owner_id === operator.id && (
            <details className="edition-controls">
              <summary>Connect a document edition</summary>
              <p>
                The selected document is the newer edition. Choose its
                predecessor from your own contributions.
              </p>
              <select
                aria-label="Previous document edition"
                value={previousEdition}
                onChange={(e) => setPreviousEdition(e.target.value)}
              >
                <option value="">Choose previous edition</option>
                {catalog?.documents
                  .filter((d) => d.id !== document.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} · {d.status}
                    </option>
                  ))}
              </select>
              <button
                className="secondary"
                disabled={busy || !previousEdition}
                onClick={() => void linkEdition()}
              >
                Link edition
              </button>
            </details>
          )}
        </section>
        <section>
          <h3>
            <GraduationCap size={18} /> Learning connections
          </h3>
          <p>
            Check a cited command, or explain the guidance for independent
            review. Each learning link records how it was assessed.
          </p>
          <label className="studio-field">
            Check type
            <select
              aria-label="Knowledge check type"
              value={checkMode}
              onChange={(e) => setCheckMode(e.target.value)}
            >
              <option value="reference_recall">
                Reference recall · documented command
              </option>
              <option value="explanation">
                Explain the guidance · independent review
              </option>
            </select>
          </label>
          <label className="studio-field">
            Approved guidance
            <select
              aria-label="Guidance for reference check"
              value=""
              onChange={(e) =>
                e.target.value && void startCheck(e.target.value)
              }
              disabled={busy}
            >
              <option value="">Choose guidance to check</option>
              {eligibleNotes.map((n) => (
                <option value={n.id} key={n.id}>
                  {n.title} · {n.owner_name}
                </option>
              ))}
            </select>
          </label>
          {!eligibleNotes.length && (
            <small className="muted">
              Checks become available for current, independently approved
              guidance written by another contributor.
            </small>
          )}
          <details className="learning-preferences">
            <summary>Your learning profile</summary>
            <label className="studio-field">
              How you contribute
              <select
                aria-label="Learning role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="contributor">Contributor</option>
                <option value="mentor">Mentor</option>
                <option value="learner">Learner</option>
              </select>
            </label>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
              />{" "}
              Share my learning links with people who can access the underlying
              guidance
            </label>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void saveProfile()}
            >
              Save profile
            </button>
          </details>
          {(!!reviews.length || operator.can_review) && (
            <details className="explanation-reviews" id="explanation-review-queue" open={showReviews} onToggle={(event) => setShowReviews(event.currentTarget.open)}>
              <summary>Explanation reviews · {reviews.length}</summary>
              {!reviews.length && <p className="muted">No explanations available for review.</p>}
              {reviews.map((item) => (
                <article key={item.check_id}>
                  <strong>{item.title}</strong>
                  <small>
                    {item.learner_name} · {item.status}
                  </small>
                  <blockquote>{item.answer}</blockquote>
                  <details>
                    <summary>{item.handoff_id ? "Assessment notes" : "Provisional automated feedback"}</summary>
                    <p>{item.feedback}</p>
                  </details>
                  {item.review_notes && <p>{item.review_notes}</p>}
                  <button
                    className="text-button"
                    onClick={() => onChoose("document:" + item.document_id)}
                  >
                    Read the approved guidance
                  </button>
                  {operator.can_review &&
                    item.person_id !== operator.id &&
                    item.status === "awaiting_review" && (
                      <>
                        {item.handoff_id && (
                          <fieldset className="transfer-rubric">
                            <legend>Confirm the evidence and safety criteria</legend>
                            {Object.entries(rubric).map(([key, label]) => (
                              <label className="studio-check" key={key}>
                                <input
                                  type="checkbox"
                                  checked={(reviewCriteria[item.check_id] || []).includes(key)}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setReviewCriteria((previous) => {
                                      const selected = previous[item.check_id] || [];
                                      return { ...previous, [item.check_id]: checked ? [...selected, key] : selected.filter((value) => value !== key) };
                                    });
                                  }}
                                />{label}
                              </label>
                            ))}
                          </fieldset>
                        )}
                        <label className="studio-field">
                          Review reasoning
                          <textarea
                            aria-label={
                              "Review reasoning for " + item.learner_name
                            }
                            minLength={10}
                            maxLength={2000}
                            value={reviewNotes[item.check_id] || ""}
                            onChange={(e) =>
                              setReviewNotes({
                                ...reviewNotes,
                                [item.check_id]: e.target.value,
                              })
                            }
                          />
                        </label>
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            (reviewNotes[item.check_id] || "").trim().length < 10 ||
                            (!!item.handoff_id && (reviewCriteria[item.check_id] || []).length !== Object.keys(rubric).length)
                          }
                          onClick={() =>
                            void reviewExplanation(item.check_id, "approved")
                          }
                        >
                          Approve demonstrated explanation
                        </button>
                        <button
                          className="secondary"
                          disabled={
                            busy ||
                            (reviewNotes[item.check_id] || "").length < 10
                          }
                          onClick={() =>
                            void reviewExplanation(item.check_id, "rejected")
                          }
                        >
                          Return with feedback
                        </button>
                      </>
                    )}
                </article>
              ))}
            </details>
          )}
        </section>
      </div>
      {feedback && (
        <p className="studio-feedback" role="status">
          <Check size={16} />
          {feedback}
        </p>
      )}
      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <section
            className="modal guidance-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guidance-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft(null);
            }}
          >
            <header>
              <div>
                <span className="eyebrow">SIGNED CONTRIBUTION</span>
                <h2 id="guidance-title">
                  {draft.previous
                    ? "Revise guidance"
                    : "Capture expert guidance"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close guidance editor"
                onClick={() => setDraft(null)}
              >
                <X size={20} />
              </button>
            </header>
            <p>
              Signed as <strong>{operator.name}</strong>. The draft appears
              under your name; independent approval enables shared guidance and
              expertise links.
            </p>
            {draft.handoff_question && <blockquote className="transfer-notice">{draft.handoff_question}</blockquote>}
            {reusableNotes.length > 0 && (
              <details className="learning-preferences">
                <summary>Reuse approved guidance</summary>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  void reuseGuidance(String(new FormData(event.currentTarget).get("guidance") || ""));
                }}>
                  <label>
                    Your current approved guidance
                    <select name="guidance" required defaultValue="">
                      <option value="">Choose guidance that answers the request</option>
                      {reusableNotes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
                    </select>
                  </label>
                  <button className="secondary" disabled={busy}>Use this guidance</button>
                </form>
              </details>
            )}
            {draft.target && (
              <p className="fine-print">
                Applies to selected source entity:{" "}
                {selected?.label || draft.target}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void signGuidance();
              }}
            >
              <label>
                Title
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Guidance
                <textarea
                  required
                  minLength={20}
                  maxLength={20000}
                  rows={5}
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                  placeholder="Describe the observation, command, decision and limits. Name commands exactly as the cited source does."
                />
              </label>
              <label>
                Type
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                >
                  <option value="guidance">Operational guidance</option>
                  <option value="procedure">Procedure</option>
                  <option value="incident_pattern">Incident pattern</option>
                  <option value="warning">Warning</option>
                </select>
              </label>
              <label>
                Find concepts and source citations
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search an exact command, message or subsystem"
                />
              </label>
              <fieldset>
                <legend>Documented concepts · choose up to 12</legend>
                <div className="concept-choices">
                  {scopeOptions.slice(0, 60).map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={draft.concept_ids.includes(c.id)}
                        disabled={
                          !draft.concept_ids.includes(c.id) &&
                          draft.concept_ids.length >= 12
                        }
                        onChange={(e) => {
                          setDraft({
                            ...draft,
                            concept_ids: e.target.checked
                              ? [...draft.concept_ids, c.id]
                              : draft.concept_ids.filter((id) => id !== c.id),
                          });
                          if (e.target.checked) void loadConceptEvidence(c.id);
                        }}
                      />
                      <span>
                        {c.label}
                        <small>
                          {c.kind} · {c.subsystem}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Exact source citations</legend>
                {draft.citations.map((c, index) => (
                  <div className="citation-choice" key={index}>
                    <select
                      required
                      aria-label={"Source citation " + (index + 1)}
                      value={c.citation_id}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          citations: draft.citations.map((item, i) =>
                            i === index
                              ? { ...item, citation_id: e.target.value }
                              : item,
                          ),
                        })
                      }
                    >
                      <option value="">Choose cited passage</option>
                      {c.citation_id &&
                        !citationOptions.some(
                          (s) => s.id === c.citation_id,
                        ) && (
                          <option value={c.citation_id}>{c.citation_id}</option>
                        )}
                      {citationOptions.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.id} · {s.title} · {s.status}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={"Citation relationship " + (index + 1)}
                      value={c.relation}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          citations: draft.citations.map((item, i) =>
                            i === index
                              ? { ...item, relation: e.target.value }
                              : item,
                          ),
                        })
                      }
                    >
                      <option value="cites">Cites</option>
                      <option value="supports">Author claims agreement</option>
                      <option value="contradicts">Author flags conflict</option>
                    </select>
                    {draft.citations.length > 1 && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"Remove citation " + (index + 1)}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            citations: draft.citations.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    )}
                    {citationOptions.find((s) => s.id === c.citation_id)
                      ?.excerpt && (
                      <blockquote>
                        {
                          citationOptions.find((s) => s.id === c.citation_id)!
                            .excerpt
                        }
                      </blockquote>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-button"
                  disabled={draft.citations.length >= 12}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      citations: [
                        ...draft.citations,
                        { citation_id: "", relation: "cites" },
                      ],
                    })
                  }
                >
                  Add another citation
                </button>
              </fieldset>
              <button
                className="primary full"
                disabled={busy || !draft.concept_ids.length}
              >
                {busy ? "Saving…" : "Sign and add guidance"}
              </button>
            </form>
          </section>
        </div>
      )}
      {check && (
        <div className="modal-backdrop" onClick={() => setCheck(null)}>
          <section
            className="modal reference-check"
            role="dialog"
            aria-modal="true"
            aria-labelledby="check-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2 id="check-title">
                {check.assessment === "source_based_explanation"
                  ? "Explain the guidance"
                  : "Reference recall check"}
              </h2>
              <button
                className="icon-button"
                aria-label="Close reference check"
                onClick={() => setCheck(null)}
              >
                <X size={20} />
              </button>
            </header>
            <p className="check-prompt">{check.prompt}</p>
            <p className="muted">{check.meaning}</p>
            {check.guidance_excerpt && (
              <details className="learning-preferences">
                <summary>Read the approved guidance</summary>
                <p className="guidance-excerpt">{check.guidance_excerpt}</p>
              </details>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitCheck();
              }}
            >
              <label>
                {check.assessment === "source_based_explanation" ? (
                  <>
                    Your explanation
                    <textarea
                      autoFocus
                      required
                      maxLength={6000}
                      minLength={20}
                      rows={6}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  </>
                ) : (
                  <>
                    Documented command
                    <input
                      autoFocus
                      required
                      maxLength={200}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  </>
                )}
              </label>
              <button
                className="primary full"
                disabled={busy || !answer.trim()}
              >
                {busy
                  ? "Checking…"
                  : check.assessment === "source_based_explanation"
                    ? "Submit explanation for review"
                    : "Check my answer"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
