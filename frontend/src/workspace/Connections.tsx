import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  Database,
  KeyRound,
  Plug,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  errorMessage,
  request,
  shortTime,
  type Connection,
  type Operator,
} from "./types";

function MetricChart({ source }: { source: Connection }) {
  const metrics = useMemo(
    () =>
      source.snapshot?.evidence.filter(
        (item) => typeof item.value === "number" && Number.isFinite(item.value),
      ) || [],
    [source.snapshot],
  );
  const [chosen, setChosen] = useState("");
  const metric = metrics.find((item) => item.id === chosen) || metrics[0];
  const points = useMemo(
    () =>
      metric
        ? source.history.flatMap((snapshot) => {
            const record = snapshot.evidence.find(
              (item) =>
                item.id === metric.id && item.component === metric.component,
            );
            return record &&
              typeof record.value === "number" &&
              Number.isFinite(record.value) &&
              snapshot.system_id === source.snapshot?.system_id
              ? [{ timestamp: snapshot.observed_at, value: record.value }]
              : [];
          })
        : [],
    [source.history, source.snapshot?.system_id, metric],
  );
  if (!metric || !points.length)
    return (
      <div className="chart-empty">
        <Activity size={22} />
        <span>
          {source.connected
            ? "No numeric observations in the latest snapshot."
            : "A verified source snapshot will appear here."}
        </span>
      </div>
    );
  const values = points.map((item) => item.value);
  const low = Math.min(...values),
    high = Math.max(...values);
  const start = Date.parse(points[0].timestamp),
    end = Date.parse(points[points.length - 1].timestamp);
  const coords = points.map((point) => ({
    x:
      40 +
      (500 * (Date.parse(point.timestamp) - start)) / Math.max(1, end - start),
    y: 120 - (85 * (point.value - low)) / Math.max(1, high - low),
  }));
  return (
    <div className="metric-chart">
      <div className="chart-heading">
        <select
          aria-label={`Metric for ${source.name}`}
          value={metric.id}
          onChange={(event) => setChosen(event.target.value)}
        >
          {metrics.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || item.id}
              {item.component ? ` · ${item.component}` : ""}
            </option>
          ))}
        </select>
        <strong>
          {points[points.length - 1].value.toLocaleString()}
          <small>{metric.unit}</small>
        </strong>
      </div>
      <svg
        viewBox="0 0 580 160"
        role="img"
        aria-label={`${metric.name || metric.id}: ${points.length} real recorded observations`}
      >
        <line x1="40" y1="125" x2="540" y2="125" className="chart-grid" />
        <line x1="40" y1="35" x2="540" y2="35" className="chart-grid" />
        <text x="2" y="39">
          {high.toLocaleString()}
        </text>
        <text x="2" y="129">
          {low.toLocaleString()}
        </text>
        <polyline
          points={coords.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke="#177c69"
          strokeWidth="2.5"
        />
        {coords.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="3" fill="#177c69">
            <title>
              {shortTime(points[index].timestamp)}: {points[index].value}
            </title>
          </circle>
        ))}
        <text x="40" y="150">
          {shortTime(points[0].timestamp)}
        </text>
        <text x="540" y="150" textAnchor="end">
          {shortTime(points[points.length - 1].timestamp)}
        </text>
      </svg>
      <div className="fine-print">
        {points.length} recorded observation
        {points.length === 1 ? " · Awaiting the next snapshot" : "s"} ·{" "}
        {source.snapshot?.system_id}
      </div>
    </div>
  );
}

export function Connections({
  operator,
  onSwitch,
}: {
  operator: Operator;
  onSwitch: () => void;
}) {
  const [sources, setSources] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string[]>([]);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [automatic, setAutomatic] = useState(false);
  const [model, setModel] = useState("");
  const refresh = useCallback(async () => {
    try {
      const data = await request<{ sources: Connection[]; model: string }>(
        "/connections",
      );
      setSources(data.sources);
      setModel(data.model);
      setError("");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const check = useCallback(
    async (id: string) => {
      setBusy((values) => [...values, id]);
      setFailures((values) => ({ ...values, [id]: "" }));
      try {
        await request(`/connections/${id}/check`, { method: "POST" });
        await refresh();
      } catch (error) {
        setFailures((values) => ({ ...values, [id]: errorMessage(error) }));
        await refresh();
      } finally {
        setBusy((values) => values.filter((value) => value !== id));
      }
    },
    [refresh],
  );
  useEffect(() => {
    if (!automatic) return;
    const timer = window.setInterval(() => {
      if (!document.hidden)
        sources
          .filter((source) => source.configured)
          .forEach((source) => {
            if (!busy.includes(source.id)) void check(source.id);
          });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [automatic, sources, busy, check]);
  return (
    <div className="connections-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">AUTHORIZED DATA SOURCES</div>
          <h1>Connected to the evidence.</h1>
          <p>
            Bring observations from your NonStop environment into the same
            investigation.
          </p>
        </div>
        <span className="readonly-badge">
          <ShieldCheck size={16} />
          Read access only
        </span>
      </div>
      <div className="connection-banner">
        <div className="icon-tile">
          <Plug size={20} />
        </div>
        <div>
          <strong>
            {sources.filter((source) => source.connected).length} of 3 sources
            verified
          </strong>
          <p>
            Connections are verified against real, timestamped responses.
            Missing access or stale data stays visible.
          </p>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={automatic}
            disabled={
              !operator.can_read_live ||
              !sources.some((source) => source.configured)
            }
            onChange={(event) => setAutomatic(event.target.checked)}
          />
          Refresh every 15s
        </label>
      </div>
      {error && (
        <div className="inline-error">
          {error}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {loading ? (
        <div className="loading-panel">Loading source configuration…</div>
      ) : (
        <div className="connection-grid">
          {sources.map((source) => (
            <section key={source.id} className="connection-card">
              <header>
                <span className="source-monogram">
                  {source.id === "prognosis"
                    ? "IR"
                    : source.id === "asap"
                      ? "AS"
                      : "MO"}
                </span>
                <span
                  className={`status-badge ${source.connected ? "approved" : "disconnected"}`}
                >
                  <i />
                  {source.connected
                    ? "Connected"
                    : source.configured
                      ? "Ready to verify"
                      : "Not connected"}
                </span>
              </header>
              <h2>{source.name}</h2>
              <div className="connection-interface">{source.interface}</div>
              <p className="muted">{source.description}</p>
              <MetricChart source={source} />
              <div className="source-check-detail">
                <span>
                  {source.last_observed_at
                    ? "Last observation"
                    : "Source status"}
                </span>
                <strong>
                  {source.last_observed_at
                    ? shortTime(source.last_observed_at)
                    : "No observations received"}
                </strong>
              </div>
              {failures[source.id] && (
                <div className="inline-error">{failures[source.id]}</div>
              )}
              <footer>
                <a href={source.documentation} target="_blank" rel="noreferrer">
                  Source documentation
                  <ArrowUpRight size={14} />
                </a>
                <button
                  className="secondary"
                  disabled={!operator.can_read_live || busy.includes(source.id)}
                  onClick={() => void check(source.id)}
                >
                  <RefreshCw
                    size={15}
                    className={busy.includes(source.id) ? "spin" : ""}
                  />
                  {busy.includes(source.id) ? "Checking…" : "Verify source"}
                </button>
              </footer>
            </section>
          ))}
        </div>
      )}
      <div className="settings-grid">
        <section className="settings-card">
          <div className="small-icon">
            <KeyRound size={20} />
          </div>
          <div>
            <h3>Operator access</h3>
            <p>
              {operator.name} ·{" "}
              {operator.local_demo
                ? "Local demonstration identity"
                : "Authenticated operator"}
            </p>
            <span className="fine-print">
              {operator.can_read_live
                ? "Authorized to read configured sources."
                : "Live source access requires an authorized operator account."}
            </span>
          </div>
          <button className="secondary" onClick={onSwitch}>
            {operator.local_demo ? "Operator sign-in" : "Switch operator"}
          </button>
        </section>
        <section className="settings-card">
          <div className="small-icon">
            <Database size={20} />
          </div>
          <div>
            <h3>Conversation memory</h3>
            <p>Messages, answers and evidence saved on the server.</p>
            <span className="fine-print">
              Local model: {model || "Checking configuration…"}
            </span>
          </div>
          <Check size={20} className="green" />
        </section>
      </div>
      <p className="connection-footnote">
        The administrator configures the licensed source endpoints and
        credentials. The assistant cannot change a NonStop system.
      </p>
    </div>
  );
}
