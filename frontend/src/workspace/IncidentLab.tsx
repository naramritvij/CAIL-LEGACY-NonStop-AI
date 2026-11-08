import { Activity, ArrowLeft, ArrowRight, CheckCircle2, Clock3, Download, MessageSquare, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, request, type Conversation } from "./types";
import "../styles/incident-lab.css";

type Case = { id: string; title: string; system: string; overview: string };
type SavedRun = { id: string; case_id: string; completed_checkpoints: number };
type Observation = { id: string; time: string; source: string; level: string; message: string };
type Decision = { checkpoint: number; label: string; action: string; evidence_ids: string[]; reason: string };
type Trend = { latest_value: number; threshold: number; rate: number; minutes_remaining: number };
type Run = {
  run_id: string;
  title: string;
  system: string;
  checkpoint: number;
  checkpoint_count: number;
  label: string;
  task: string;
  level: string;
  as_of: string;
  events: Observation[];
  options: { id: string; label: string }[];
  unknowns: string;
  trend: Trend | null;
  decisions: Decision[];
  complete: boolean;
};
type Debrief = { unresolved: string; next_authorized_check: string; case_sha256: string };

export function IncidentLab({ onConversation, onError }: {
  onConversation: (conversation: Conversation) => void;
  onError: (message: string) => void;
}) {
  const [catalogue, setCatalogue] = useState<{ cases: Case[]; runs: SavedRun[] } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [decision, setDecision] = useState("");
  const [feedback, setFeedback] = useState<{ passed: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [failure, setFailure] = useState("");
  const startRequests = useRef(new Map<string, string>());
  const load = useCallback(async (signal?: AbortSignal) => {
    setCatalogue(await request<NonNullable<typeof catalogue>>("/rehearsals", { signal }));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setFailure(errorMessage(error));
    });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!run?.complete) return;
    const controller = new AbortController();
    void request<Debrief>("/rehearsals/" + run.run_id + "/debrief", { signal: controller.signal })
      .then(setDebrief)
      .catch((error) => { if (!controller.signal.aborted) onError(errorMessage(error)); });
    return () => controller.abort();
  }, [run?.complete, run?.run_id, onError]);

  useEffect(() => {
    if (run?.run_id) document.getElementById("lab-title")?.scrollIntoView({ block: "start" });
  }, [run?.run_id, run?.checkpoint, run?.complete]);

  async function open(caseId: string, runId?: string) {
    setBusy(true);
    setFailure("");
    try {
      let result: Run;
      if (runId) {
        result = await request<Run>("/rehearsals/" + runId);
      } else {
        const requestId = startRequests.current.get(caseId) || crypto.randomUUID();
        startRequests.current.set(caseId, requestId);
        result = await request<Run>("/rehearsals", { method: "POST",
          body: JSON.stringify({ case_id: caseId, request_id: requestId }) });
        startRequests.current.delete(caseId);
      }
      setFeedback(null);
      setDecision("");
      setSelected([]);
      setDebrief(null);
      setRun(result);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function assess(event: FormEvent) {
    event.preventDefault();
    if (!run || !decision || busy) return;
    setBusy(true);
    try {
      const result = await request<{ passed: boolean; feedback: string; run: Run }>(
        "/rehearsals/" + run.run_id + "/decision",
        { method: "POST", body: JSON.stringify({
          checkpoint: run.checkpoint, action_id: decision, evidence_ids: selected,
        }) },
      );
      setRun(result.run);
      setFeedback({ passed: result.passed, text: result.feedback });
      if (result.passed) {
        setDecision("");
        setSelected([]);
      }
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    if (!run || busy) return;
    setBusy(true);
    try {
      onConversation(await request<Conversation>("/rehearsals/" + run.run_id + "/conversation", {
        method: "POST", body: JSON.stringify({ checkpoint: run.checkpoint }),
      }));
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!run || !debrief) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(debrief, null, 2) + "\n"], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "cail-rehearsal-" + run.run_id.slice(0, 8) + ".json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="incident-lab" aria-labelledby="lab-title">
      <header className="lab-header">
        <div>
          <div className="eyebrow">OPERATOR TRAINING</div>
          <h1 id="lab-title">{run?.title ?? "Incident lab"}</h1>
          <p>{run ? run.system + " · replay through " + run.as_of
            : "Investigate a staged NonStop incident, cite what you observed, and prepare a handoff."}</p>
        </div>
        <span className="lab-synthetic"><ShieldCheck size={16} /> Synthetic · Read only</span>
      </header>
      {!run && (
        <>
          {failure && <p role="alert" className="lab-feedback failed">{failure}</p>}
          {!catalogue && !failure && <p role="status">Loading rehearsal cases…</p>}
          <div className="lab-cases">
            {catalogue?.cases.map((item) => (
              <article key={item.id}>
                <span className="lab-case-id"><Activity size={16} /> {item.id}</span>
                <h2>{item.title}</h2>
                <p>{item.overview}</p>
                <button className="primary" disabled={busy} onClick={() => void open(item.id)}>
                  Start rehearsal <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
          {!!catalogue?.runs.length && (
            <section className="lab-saved" aria-label="Saved rehearsals">
              <h2>Saved rehearsals</h2>
              {catalogue.runs.map((item) => (
                <button className="secondary" key={item.id} disabled={busy} onClick={() => void open(item.case_id, item.id)}>
                  {catalogue.cases.find((entry) => entry.id === item.case_id)?.title || item.case_id}
                  <small>{item.completed_checkpoints}/3 checked · {item.id.slice(0, 8)}</small>
                  <ArrowRight size={14} />
                </button>
              ))}
            </section>
          )}
        </>
      )}
      {run && (
        <>
          <div className="lab-controls">
            <button className="secondary" onClick={() => {
              setRun(null);
              void load().catch((error) => onError(errorMessage(error)));
            }} disabled={busy}><ArrowLeft size={16} /> All cases</button>
            <button className="secondary" onClick={() => void ask()} disabled={busy}>
              <MessageSquare size={16} /> Ask CAIL at this checkpoint
            </button>
          </div>
          <div className="lab-progress" aria-label="Rehearsal progress">
            {Array.from({ length: run.checkpoint_count }, (_, index) => (
              <span key={index} aria-current={!run.complete && run.checkpoint === index + 1 ? "step" : undefined}>
                {run.decisions[index] ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
                Checkpoint {index + 1}
              </span>
            ))}
          </div>
          {feedback && <p role="status" className={"lab-feedback " + (feedback.passed ? "passed" : "failed")}>{feedback.text}</p>}
          <div className="lab-columns">
            <section className="lab-panel" aria-labelledby="lab-observations">
              <div className="lab-panel-heading">
                <h2 id="lab-observations">Observed timeline</h2>
                <span className={"lab-level " + run.level}>{run.level === "high" ? "High priority" : run.level === "warning" ? "Watch" : "Baseline"}</span>
              </div>
              <p>Evidence through {run.as_of}. {run.complete ? "Completed replay." : "Select the records supporting your decision."}</p>
              <ol className="lab-timeline">
                {run.events.map((event) => (
                  <li key={event.id}>
                    <label>
                      {!run.complete && <input type="checkbox" checked={selected.includes(event.id)} disabled={busy}
                        onChange={(change) => setSelected((previous) => change.target.checked
                          ? [...previous, event.id] : previous.filter((id) => id !== event.id))} />}
                      <span>
                        <small>{event.time} · {event.source}</small>
                        <strong>{event.message}</strong>
                        <code>{event.id}</code>
                      </span>
                    </label>
                  </li>
                ))}
              </ol>
              {run.trend && <aside className="lab-trend">
                <strong>Conditional trend watch</strong>
                <p>{run.trend.latest_value}% observed. At {run.trend.rate} percentage points per minute, the {run.trend.threshold}% exercise threshold is about {run.trend.minutes_remaining} minutes away if the rate continues.</p>
              </aside>}
            </section>
            <section className="lab-panel">
              {run.complete ? (
                <>
                  <div className="lab-panel-heading"><h2>Verified rehearsal debrief</h2><CheckCircle2 size={21} /></div>
                  <p>All {run.checkpoint_count} decisions met the evidence and read-only criteria.</p>
                  {run.decisions.map((item) => (
                    <article className="lab-decision" key={item.checkpoint}>
                      <strong>{item.label}</strong>
                      <p>{item.action}</p>
                      <small>{item.evidence_ids.join(" · ")}</small>
                      <p className="lab-decision-reason">{item.reason}</p>
                    </article>
                  ))}
                  {debrief && <>
                    <h3>Unresolved</h3><p>{debrief.unresolved}</p>
                    <button className="primary" onClick={download}><Download size={16} /> Download debrief</button>
                  </>}
                </>
              ) : (
                <form onSubmit={(event) => void assess(event)}>
                  <div className="eyebrow">CHECKPOINT {run.checkpoint} OF {run.checkpoint_count}</div>
                  <h2>{run.label}</h2>
                  <p>{run.task}</p>
                  <fieldset className="lab-options">
                    <legend>Choose the next action</legend>
                    {run.options.map((item) => (
                      <label key={item.id}>
                        <input type="radio" name="action" value={item.id} checked={decision === item.id}
                          onChange={() => setDecision(item.id)} disabled={busy} />
                        {item.label}
                      </label>
                    ))}
                  </fieldset>
                  <aside className="lab-unknown"><strong>Still unknown</strong><p>{run.unknowns}</p></aside>
                  <button className="primary" disabled={busy || !decision}>
                    {busy ? "Checking…" : "Assess decision"} <ArrowRight size={16} />
                  </button>
                </form>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
