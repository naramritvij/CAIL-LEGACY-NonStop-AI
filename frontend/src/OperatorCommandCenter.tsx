import { useEffect, useRef, useState } from 'react';
import './operator-command-center.css';

type Color = 'green' | 'yellow' | 'red' | 'unknown';
type Health = {
  incident_id: string | null;
  title: string; system: string; color: Color; meaning: string;
  evidence_ids: string[]; source_mode: string;
};
type Overview = {
  product_name: string; mode: string; tools_connected: boolean;
  statuses: Health[]; warning: string;
};
type OperatorCommand = {
  id: string; label: string; execution_allowed: boolean;
  source_href: string | null;
};
type Source = {
  tool_id: string; connected: boolean; mode: string; health_signal: Color;
  docs_url: string; evidence: Record<string, unknown>[]; note: string;
};

const API = '/api/v1';
const tools = ['asap', 'ems', 'scf'] as const;

export default function OperatorCommandCenter({ incidentId }: { incidentId: string }) {
  const selectedIncident = useRef(incidentId);
  selectedIncident.current = incidentId;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [commands, setCommands] = useState<OperatorCommand[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(API + '/operations/overview')
      .then(r => { if (!r.ok) throw new Error('Health view unavailable'); return r.json() as Promise<Overview>; })
      .then(data => { if (active) setOverview(data); })
      .catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSource(null); setPreview(null); setCommands([]);
    fetch(API + '/operations/incidents/' + encodeURIComponent(incidentId) + '/commands')
      .then(r => { if (!r.ok) throw new Error('Command catalog unavailable'); return r.json(); })
      .then(data => { if (active) setCommands(data.commands as OperatorCommand[]); })
      .catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [incidentId]);

  async function viewSource(tool: string) {
    setSource(null); setPreview(null); setError('');
    try {
      const response = await fetch(
        API + '/operations/incidents/' + encodeURIComponent(incidentId) +
        '/sources/' + encodeURIComponent(tool)
      );
      if (!response.ok) throw new Error('Evidence source unavailable');
      const data = await response.json() as Source;
      if (selectedIncident.current === incidentId) setSource(data);
    } catch (e) { if (selectedIncident.current === incidentId) setError(String(e)); }
  }

  async function runPreview(command: OperatorCommand) {
    setError(''); setPreview(null);
    try {
      const response = await fetch(API + '/operations/commands/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incidentId, command_id: command.id })
      });
      if (!response.ok) throw new Error('Safe preview unavailable');
      const result = await response.json();
      if (command.id.startsWith('open_')) {
        const tool = command.id.slice(5);
        if (tools.some(x => x === tool)) await viewSource(tool);
      }
      if (selectedIncident.current === incidentId) setPreview(result);
    } catch (e) { if (selectedIncident.current === incidentId) setError(String(e)); }
  }

  return <section className="operator-center" aria-label="Operator command center">
    <div className="operator-head">
      <div><h2>System Health Command Center</h2>
        <p>Verify the signal. Open the original evidence view. Use only reviewed diagnostics.</p></div>
      <span className="operator-mode">SIMULATED · NO LIVE HPE CONNECTION</span>
    </div>
    {error && <p className="operator-error" role="alert">{error}</p>}
    <div className="operator-statuses">
      {(overview?.statuses || []).map(item =>
        <div key={item.incident_id || 'normal-baseline'} className="operator-tile">
          <div className="operator-state">
            <span className={'operator-light ' + item.color} aria-hidden="true"></span>
            <strong>{item.color.toUpperCase()}</strong>
          </div>
          <b>{item.title}</b><small>{item.system}</small>
          <p>{item.meaning}</p>
          <small>{item.evidence_ids.length} synthetic evidence marker(s)</small>
        </div>
      )}
    </div>
    <div className="operator-controls">
      <div>
        <h3>Available operator commands</h3>
        <p>These commands are interface actions, not executable NonStop shell commands.</p>
        <div className="operator-buttons">
          {commands.map(command =>
            <button key={command.id} type="button" onClick={() => void runPreview(command)}>
              {command.label}
            </button>
          )}
        </div>
      </div>
      <div>
        <h3>Go to source</h3>
        <p>Inspect tool-specific projections of the original scenario evidence.</p>
        <div className="operator-buttons">
          {tools.map(tool =>
            <button type="button" key={tool} onClick={() => void viewSource(tool)}>
              {tool.toUpperCase()} evidence ↗
            </button>
          )}
        </div>
      </div>
    </div>
    {source && <div className="operator-evidence">
      <h3>{source.tool_id.toUpperCase()} · {source.health_signal.toUpperCase()}</h3>
      <p>{source.note}</p>
      <p>Live connection: No · Source mode: {source.mode}</p>
      <a href={source.docs_url} target="_blank" rel="noopener noreferrer">
        Open vendor documentation ↗
      </a>
      <pre>{JSON.stringify(source.evidence, null, 2)}</pre>
    </div>}
    {preview != null && <details className="operator-evidence">
      <summary>Display-only command preview</summary>
      <pre>{JSON.stringify(preview, null, 2)}</pre>
    </details>}
    <p className="operator-footnote">
      {overview?.warning || 'Waiting for local synthetic health evidence.'}
      {' '}Missing SCF data is UNKNOWN, not GREEN. No command can change a real system.
    </p>
  </section>;
}
