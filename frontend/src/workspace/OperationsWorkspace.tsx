import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  LoaderCircle,
  Menu,
  MessageSquare,
  Network,
  PanelRightClose,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Unplug,
  X,
} from "lucide-react";
import { Connections } from "./Connections";
const KnowledgeGraph = lazy(() => import("./KnowledgeGraph").then((module) => ({ default: module.KnowledgeGraph })));
import {
  errorMessage,
  request,
  shortTime,
  WorkspaceError,
  type AnswerMeta,
  type Conversation,
  type Message,
  type Operator,
} from "./types";

type View = "assistant" | "graph" | "connections";
const AGENTS = [
  {
    name: "Memory",
    description: "Recovers relevant conversation turns",
    icon: Clock3,
  },
  {
    name: "Knowledge",
    description: "Retrieves reviewed operational knowledge",
    icon: FileText,
  },
  {
    name: "Telemetry",
    description: "Reads authorized source observations",
    icon: Activity,
  },
  {
    name: "Evaluator",
    description: "Checks evidence and citation identifiers",
    icon: ShieldCheck,
  },
];

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function Login({
  onSignedIn,
  onClose,
  error,
  demoRoles = [],
}: {
  onSignedIn: (operator: Operator) => void;
  onClose?: () => void;
  error?: string;
  demoRoles?: Operator["demo_roles"];
}) {
  const [key, setKey] = useState("");
  const [failure, setFailure] = useState(error || "");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await openSession("/session", { access_key: key });
    setKey("");
  }
  async function openSession(path: string, payload: object) {
    setBusy(true);
    setFailure("");
    try {
      onSignedIn(
        await request<Operator>(path, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={onClose ? "modal-backdrop" : "login-screen"}>
      <section
        className="modal login-card"
        role={onClose ? "dialog" : undefined}
        aria-modal={onClose ? "true" : undefined}
        aria-labelledby="login-title"
      >
        <header>
          <div className="brand">
            <Mark />
            <strong>CAIL</strong>
          </div>
          {onClose && (
            <button
              className="icon-button"
              onClick={onClose}
              aria-label="Close sign-in"
            >
              <X size={19} />
            </button>
          )}
        </header>
        <div className="eyebrow">NONSTOP AI OPERATIONS ASSISTANT</div>
        <h1 id="login-title">
          {demoRoles.length ? "Switch demo role" : <>
          Your operations.
          <br />
          Your context.
          </>}
        </h1>
        {demoRoles.length ? (
          <div className="demo-role-options">
            <p className="muted">Choose a role in this isolated synthetic walkthrough.</p>
            {demoRoles.map((role) => (
              <button className="secondary full" key={role.id} disabled={busy}
                onClick={() => void openSession("/session/demo-role", { person_id: role.id })}>{role.name}</button>
            ))}
            {failure && <p className="inline-error">{failure}</p>}
          </div>
        ) : <>
        <p className="muted">
          Sign in with the operator access key supplied by your administrator.
        </p>
        <form onSubmit={submit}>
          <label>
            Operator access key
            <input
              required
              autoFocus
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Enter your access key"
            />
          </label>
          {failure && (
            <div className="inline-error" role="alert">
              {failure}
            </div>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <KeyRound size={17} />
            )}
            Open workspace
          </button>
        </form>
        </>}
        <p className="fine-print">
          Your conversations are private to your operator identity. Team
          knowledge follows its review and access permissions.
        </p>
      </section>
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  function inline(line: string): ReactNode {
    return line
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .map((part, index) =>
        part.startsWith("**") ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      );
  }
  return (
    <div className="rich-text">
      {parts.map((part, index) =>
        part.startsWith("```") ? (
          <pre key={index}>{part.slice(3, -3).replace(/^\w*\n/, "")}</pre>
        ) : (
          part.split("\n").map((line, lineIndex) =>
            !line.trim() ? (
              <div key={`${index}-${lineIndex}`} className="paragraph-gap" />
            ) : /^[-*] /.test(line) ? (
              <div key={`${index}-${lineIndex}`} className="answer-bullet">
                <span>•</span>
                <span>{inline(line.slice(2))}</span>
              </div>
            ) : (
              <p key={`${index}-${lineIndex}`}>
                {inline(line.replace(/^#{1,4} /, ""))}
              </p>
            ),
          )
        ),
      )}
    </div>
  );
}

function ActivityPanel({
  metadata,
  messageCount,
  onClose,
}: {
  metadata: AnswerMeta | null;
  messageCount: number;
  onClose: () => void;
}) {
  const sources = metadata?.sources || [];
  const steps = metadata?.trace || [];
  return (
    <aside className="activity-panel">
      <header>
        <div>
          <Network size={16} />
          <strong>Behind the answer</strong>
        </div>
        <button
          className="icon-button"
          aria-label="Hide answer details"
          onClick={onClose}
        >
          <PanelRightClose size={17} />
        </button>
      </header>
      <section className="orchestration-section">
        <div className="eyebrow">ONE ASSISTANT. SPECIALIST AGENTS.</div>
        <div className="orchestrator-card">
          <div className="small-icon">
            <Network size={20} />
          </div>
          <div>
            <strong>CAIL Orchestrator</strong>
            <span>Plans, delegates and brings it together</span>
          </div>
        </div>
        <div className="agent-team">
          {AGENTS.map((agent) => {
            const step = [...steps]
              .reverse()
              .find((item) => item.agent === agent.name);
            const Icon = agent.icon;
            return (
              <div className="agent-item" key={agent.name}>
                <div className="agent-icon">
                  <Icon size={15} />
                </div>
                <div>
                  <strong>{agent.name}</strong>
                  <span>{step?.detail || agent.description}</span>
                </div>
                {step &&
                  (step.status === "complete" ? (
                    <Check size={14} className="green" />
                  ) : (
                    <span className="agent-status">{step.status}</span>
                  ))}
              </div>
            );
          })}
        </div>
        {steps.length > 0 && (
          <details className="run-details">
            <summary>
              View activity record
              <ChevronDown size={13} />
            </summary>
            {steps.map((step, index) => (
              <div className="run-step" key={index}>
                <strong>
                  {step.agent}
                  <small>{(step.elapsed_ms / 1000).toFixed(1)}s</small>
                </strong>
                <p>{step.detail}</p>
              </div>
            ))}
          </details>
        )}
      </section>
      <section className="memory-section">
        <div className="section-heading">
          <Clock3 size={16} />
          <strong>Conversation memory</strong>
          <CheckCheck size={16} className="green" />
        </div>
        <div className="memory-number">
          {messageCount}
          <span>saved turns</span>
        </div>
        <p>
          Questions and answers stay in this conversation, including when the
          topic changes.
        </p>
        {metadata?.memory && (
          <span className="fine-print">
            {metadata.memory.context_turns} relevant earlier turns used for this
            answer.
          </span>
        )}
      </section>
      <section className="evidence-section">
        <div className="section-heading">
          <FileText size={16} />
          <strong>Evidence</strong>
          <span className="count-chip">{sources.length}</span>
        </div>
        {!sources.length ? (
          <div className="evidence-empty">
            <span className="small-icon">
              <Search size={19} />
            </span>
            <p>Relevant source records appear here with each answer.</p>
            <span>Approved documents and verified observations.</span>
          </div>
        ) : (
          <div className="evidence-list">
            {sources.map((source) => (
              <details className="evidence-item" key={source.id}>
                <summary>
                  <span className="evidence-icon">
                    <FileText size={15} />
                  </span>
                  <span>
                    <strong>{source.title}</strong>
                    <small>
                      {source.synthetic
                        ? "Synthetic example"
                        : source.type === "live_telemetry"
                          ? "Live observation"
                          : "Reviewed knowledge"}
                    </small>
                  </span>
                  <ChevronDown size={14} />
                </summary>
                <div>
                  <code>{source.id}</code>
                  {source.owner_name && <p>Contributor: {source.owner_name}</p>}
                  {source.observed_at && (
                    <p>
                      Observed {shortTime(source.observed_at)} ·{" "}
                      {source.system_id}
                    </p>
                  )}
                  <pre>{source.text}</pre>
                  {source.source_url &&
                    /^https:\/\//.test(source.source_url) && (
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source reference
                        <ArrowUpRight size={13} />
                      </a>
                    )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
      <div className="activity-footnote">
        <ShieldCheck size={15} />
        <span>
          Evidence informs the answer.
          <br />
          The assistant cannot execute commands.
        </span>
      </div>
    </aside>
  );
}

function Assistant({
  conversations,
  activeId,
  onActive,
  onConversations,
  onError,
  detailsOpen,
  onDetails,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onActive: (id: string) => void;
  onConversations: () => Promise<void>;
  onError: (text: string) => void;
  detailsOpen: boolean;
  onDetails: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const currentId = useRef(activeId);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pending = messages.some((message) => message.status === "pending");
  const lastAnswer = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" && message.status === "complete",
    );
  const selected =
    messages.find((message) => message.id === selectedAnswer) || lastAnswer;
  useEffect(() => {
    if (activeId && currentId.current === activeId && sending) return;
    currentId.current = activeId;
    setMessages([]);
    setSelectedAnswer(null);
    if (!activeId) return;
    let live = true;
    setLoading(true);
    request<{ messages: Message[] }>(`/conversations/${activeId}`)
      .then((data) => {
        if (live) setMessages(data.messages);
      })
      .catch((error) => {
        if (live) onError(errorMessage(error));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [activeId]);
  useEffect(() => {
    if (!pending || !activeId) return;
    const timer = window.setInterval(() => {
      request<{ messages: Message[] }>(`/conversations/${activeId}`)
        .then((data) => {
          if (currentId.current === activeId) setMessages(data.messages);
        })
        .catch(() => {
          /* Keep the saved pending message visible for recovery. */
        });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pending, activeId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content]);
  async function send(event?: FormEvent, suggestion?: string) {
    event?.preventDefault();
    const question = (suggestion || draft).trim();
    if (!question || sending || pending || loading) return;
    setSending(true);
    setDraft("");
    let id = activeId;
    try {
      if (!id) {
        const created = await request<Conversation>("/conversations", {
          method: "POST",
        });
        id = created.id;
        currentId.current = id;
        onActive(id);
        await onConversations();
      }
      const targetId = id;
      const optimistic: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        status: "sending",
        created_at: new Date().toISOString(),
        metadata: {},
      };
      setMessages((values) => [...values, optimistic]);
      const answer = await request<Message>(
        `/conversations/${targetId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ question, request_id: crypto.randomUUID() }),
        },
      );
      const saved = await request<{ messages: Message[] }>(
        `/conversations/${targetId}`,
      );
      if (currentId.current === targetId) {
        setMessages(saved.messages);
        setSelectedAnswer(answer.id);
      }
      await onConversations();
    } catch (error) {
      onError(errorMessage(error));
      setDraft(question);
      if (id)
        try {
          const saved = await request<{ messages: Message[] }>(
            `/conversations/${id}`,
          );
          if (currentId.current === id) setMessages(saved.messages);
        } catch {
          /* Network state is already visible in the notification. */
        }
    } finally {
      setSending(false);
      textarea.current?.focus();
    }
  }
  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      onError(
        "Copy is unavailable in this browser. Select the response text to copy it.",
      );
    }
  }
  const suggestions = [
    {
      icon: Activity,
      title: "Investigate an observation",
      question:
        "What do the connected sources show about current system health?",
    },
    {
      icon: FileText,
      title: "Find operational knowledge",
      question: "Find approved guidance about NonStop incident investigation.",
    },
    {
      icon: GitBranch,
      title: "Understand the platform",
      question:
        "Explain the roles of Prognosis, ASAP and MOMI in a NonStop environment.",
    },
  ];
  return (
    <div className={`assistant-layout ${detailsOpen ? "" : "details-hidden"}`}>
      <section className="assistant-main">
        <div className="conversation-heading">
          <div>
            <span className="conversation-symbol">
              <MessageSquare size={17} />
            </span>
            <span>
              {conversations.find((item) => item.id === activeId)?.title ||
                "New conversation"}
            </span>
          </div>
          <div className="conversation-heading-right">
            <span>
              <ShieldCheck size={13} />
              Read only
            </span>
            {!detailsOpen && (
              <button
                className="icon-button"
                aria-label="Show answer details"
                onClick={() => onDetails(true)}
              >
                <Network size={18} />
              </button>
            )}
          </div>
        </div>
        <div className="conversation-scroll">
          {loading ? (
            <div className="loading-panel">
              <LoaderCircle className="spin" size={20} />
              Opening your conversation…
            </div>
          ) : !messages.length && !sending ? (
            <div className="assistant-welcome">
              <div className="welcome-emblem">
                <Mark />
                <span>
                  <Sparkles size={13} />
                </span>
              </div>
              <div className="eyebrow">
                CAIL / NONSTOP AI OPERATIONS ASSISTANT
              </div>
              <h1>
                What are we
                <br />
                <span>investigating today?</span>
              </h1>
              <p>
                Ask a question. Follow a thread. Keep the context.
                <br />
                One assistant, backed by your team's knowledge.
              </p>
              <div className="suggestion-grid">
                {suggestions.map((suggestion) => {
                  const Icon = suggestion.icon;
                  return (
                    <button
                      key={suggestion.title}
                      onClick={() => void send(undefined, suggestion.question)}
                    >
                      <Icon size={19} />
                      <strong>{suggestion.title}</strong>
                      <span>{suggestion.question}</span>
                      <ArrowUpRight size={16} />
                    </button>
                  );
                })}
              </div>
              <div className="welcome-note">
                <Clock3 size={15} />
                Your conversation is saved as you go.
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`message ${message.role} ${selected?.id === message.id ? "selected-answer" : ""}`}
                >
                  <div className="message-avatar">
                    {message.role === "assistant" ? <Mark small /> : "You"}
                  </div>
                  <div className="message-body">
                    <div className="message-author">
                      <strong>
                        {message.role === "assistant" ? "CAIL" : "You"}
                      </strong>
                      <time>{shortTime(message.created_at)}</time>
                      {message.metadata.route && (
                        <span className="answer-route">
                          {message.metadata.route}
                        </span>
                      )}
                    </div>
                    {message.status === "pending" ? (
                      <div className="pending-response">
                        <LoaderCircle size={16} className="spin" />
                        Your question is saved. The orchestrator is preparing a
                        response.
                      </div>
                    ) : (
                      <RichText text={message.content} />
                    )}
                    {message.role === "assistant" &&
                      message.status !== "pending" && (
                        <div className="answer-actions">
                          <button
                            onClick={() => void copy(message)}
                            aria-label="Copy response"
                          >
                            {copied === message.id ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                            {copied === message.id ? "Copied" : "Copy"}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAnswer(message.id);
                              onDetails(true);
                            }}
                          >
                            <FileText size={14} />
                            {message.metadata.sources?.length || 0} sources
                          </button>
                          <span>
                            <CheckCheck size={13} />
                            Saved
                          </span>
                        </div>
                      )}
                  </div>
                </article>
              ))}
              {sending && !pending && (
                <div className="working-indicator">
                  <Mark small />
                  <LoaderCircle size={15} className="spin" />
                  <span>Preparing your response…</span>
                </div>
              )}
              <div ref={bottom} />
            </div>
          )}
        </div>
        <div className="composer-wrap">
          <form className="composer" onSubmit={(event) => void send(event)}>
            <textarea
              ref={textarea}
              aria-label="Message CAIL"
              placeholder="Ask CAIL anything about your operations…"
              maxLength={6000}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-bottom">
              <span>
                <Clock3 size={14} />
                Context stays with this conversation
              </span>
              <button
                className="send-button"
                type="submit"
                aria-label="Send message"
                disabled={!draft.trim() || sending || pending || loading}
              >
                {sending || pending ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <ArrowUp size={20} />
                )}
              </button>
            </div>
          </form>
          <div className="composer-caption">
            Answers should be checked against their evidence.{" "}
            <span>Enter to send · Shift + Enter for a new line</span>
          </div>
        </div>
      </section>
      {detailsOpen && (
        <ActivityPanel
          metadata={selected?.metadata || null}
          messageCount={
            messages.filter((message) => message.status === "complete").length
          }
          onClose={() => onDetails(false)}
        />
      )}
    </div>
  );
}

function initialView(): View {
  const hash = window.location.hash.toLowerCase();
  return /graph|tree|library|mentor/.test(hash)
    ? "graph"
    : /connections/.test(hash)
      ? "connections"
      : "assistant";
}

export function OperationsWorkspace() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [authState, setAuthState] = useState<
    "loading" | "ready" | "login" | "offline"
  >("loading");
  const [failure, setFailure] = useState("");
  const [view, setView] = useState<View>(initialView);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(
    () => window.innerWidth > 1200,
  );
  const [switchLogin, setSwitchLogin] = useState(false);
  const [allThreads, setAllThreads] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [toast, setToast] = useState("");
  const notify = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const loadConversations = useCallback(async () => {
    setConversations(await request<Conversation[]>("/conversations"));
  }, []);
  const initialize = useCallback(async () => {
    setAuthState("loading");
    try {
      setOperator(await request<Operator>("/session"));
      setAuthState("ready");
    } catch (error) {
      setFailure(errorMessage(error));
      setAuthState(
        error instanceof WorkspaceError && error.status === 401
          ? "login"
          : "offline",
      );
    }
  }, []);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (!operator) return;
    void loadConversations().catch((error) => notify(errorMessage(error)));
    try {
      setActiveId(localStorage.getItem("cail:conversation:" + operator.id));
    } catch {
      setActiveId(null);
    }
  }, [operator, loadConversations, notify]);
  function chooseConversation(id: string | null) {
    setActiveId(id);
    setView("assistant");
    setMobileNav(false);
    window.location.hash = "/assistant";
    try {
      if (operator) {
        if (id) localStorage.setItem("cail:conversation:" + operator.id, id);
        else localStorage.removeItem("cail:conversation:" + operator.id);
      }
    } catch {
      /* Saving records does not depend on browser storage. */
    }
  }
  function navigate(next: View) {
    setView(next);
    setMobileNav(false);
    window.location.hash = "/" + next;
  }
  useEffect(() => {
    const listener = () => setView(initialView());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  function signedIn(user: Operator) {
    setOperator(user);
    setActiveId(null);
    setConversations([]);
    setAuthState("ready");
    setSwitchLogin(false);
  }
  if (authState === "login") return <Login onSignedIn={signedIn} />;
  if (authState === "offline")
    return (
      <div className="login-screen">
        <section className="modal">
          <div className="brand">
            <Mark />
            <strong>CAIL</strong>
          </div>
          <h1>Workspace unavailable</h1>
          <p className="muted">{failure}</p>
          <p className="muted">
            Start the CAIL backend, then reconnect to your saved workspace.
          </p>
          <button className="primary" onClick={() => void initialize()}>
            <Unplug size={17} />
            Reconnect
          </button>
        </section>
      </div>
    );
  if (authState === "loading" || !operator)
    return (
      <div className="login-screen">
        <div className="opening">
          <Mark />
          <LoaderCircle size={19} className="spin" />
          <span>Opening your workspace…</span>
        </div>
      </div>
    );
  const nav = [
    { id: "assistant" as const, label: "Assistant", icon: MessageSquare },
    { id: "graph" as const, label: "Knowledge graph", icon: Network },
    { id: "connections" as const, label: "Connections", icon: Database },
  ];
  return (
    <div className="workspace-shell">
      <a href="#workspace-main" className="skip-link">
        Skip to content
      </a>
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`workspace-sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand">
          <Mark />
          <div>
            <strong>
              CAIL<span>WORKSPACE</span>
            </strong>
            <small>Nonstop AI Operations Assistant</small>
          </div>
        </div>
        <button
          className="new-conversation"
          onClick={() => chooseConversation(null)}
        >
          <Plus size={17} />
          New conversation<span>↗</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} />
                {item.label}
                {view === item.id && <ChevronRight size={14} />}
              </button>
            );
          })}
        </nav>
        <div className="nav-label recent-label">
          RECENT CONVERSATIONS
          <button
            className="icon-button"
            aria-label="Find saved conversations"
            onClick={() => setAllThreads(true)}
          >
            <Search size={14} />
          </button>
        </div>
        <div className="recent-threads">
          {!conversations.length && (
            <p>
              Your saved conversations
              <br />
              will appear here.
            </p>
          )}
          {conversations.slice(0, 6).map((conversation) => (
            <button
              className={
                activeId === conversation.id && view === "assistant"
                  ? "selected"
                  : ""
              }
              key={conversation.id}
              onClick={() => chooseConversation(conversation.id)}
            >
              <MessageSquare size={14} />
              <span>{conversation.title}</span>
            </button>
          ))}
          {conversations.length > 6 && (
            <button className="all-threads" onClick={() => setAllThreads(true)}>
              View all conversations
              <ArrowDown size={13} />
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <ShieldCheck size={17} />
            <div>
              <strong>Observe. Understand. Decide.</strong>
              <span>Read-only access to your environment.</span>
            </div>
          </div>
          <button
            className="operator-profile"
            aria-label={operator.demo_roles?.length ? "Switch demo role" : "Operator settings"}
            onClick={() => operator.demo_roles?.length ? setSwitchLogin(true) : navigate("connections")}
          >
            <span className="operator-avatar">
              {operator.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{operator.name}</strong>
              <small>
                {operator.transfer_demo ? "Switch demo role" : operator.local_demo ? "Local workspace" : "Operator workspace"}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="workspace-topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              Workspace
              <ChevronRight size={13} />
              <strong>{nav.find((item) => item.id === view)?.label}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="environment-label">
              <i />
              {operator.local_demo
                ? "Local demonstration"
                : "Operator workspace"}
            </span>
            <button
              className="icon-button"
              aria-label="Workspace information"
              onClick={() =>
                notify(
                  "One assistant, persistent conversation memory, reviewed knowledge and authorized read-only telemetry. Open Connections to verify source access.",
                )
              }
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main
          id="workspace-main"
          className={view === "assistant" ? "chat-view" : "page-view"}
        >
          {view === "assistant" ? (
            <Assistant
              key={operator.id}
              conversations={conversations}
              activeId={activeId}
              onActive={chooseConversation}
              onConversations={loadConversations}
              onError={notify}
              detailsOpen={detailsOpen}
              onDetails={setDetailsOpen}
            />
          ) : view === "graph" ? (
            <Suspense fallback={<div className="loading-panel">Loading the knowledge graph…</div>}>
              <KnowledgeGraph key={operator.id} operator={operator} onError={notify} />
            </Suspense>
          ) : (
            <Connections
              key={operator.id}
              operator={operator}
              onSwitch={() => setSwitchLogin(true)}
            />
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {switchLogin && (
        <Login onSignedIn={signedIn} onClose={() => setSwitchLogin(false)} demoRoles={operator.demo_roles} />
      )}
      {allThreads && (
        <div className="modal-backdrop" onClick={() => setAllThreads(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Saved conversations"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>Saved conversations</h2>
              <button
                className="icon-button"
                aria-label="Close conversations"
                onClick={() => setAllThreads(false)}
              >
                <X size={19} />
              </button>
            </header>
            <label className="search-field">
              <Search size={17} />
              <input
                autoFocus
                placeholder="Find a conversation…"
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
              />
            </label>
            <div className="thread-picker">
              {conversations
                .filter((item) =>
                  item.title.toLowerCase().includes(threadSearch.toLowerCase()),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      chooseConversation(item.id);
                      setAllThreads(false);
                    }}
                  >
                    <MessageSquare size={17} />
                    <span>
                      {item.title}
                      <small>
                        {new Date(item.updated_at).toLocaleDateString()}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
