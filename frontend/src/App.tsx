import { useEffect, useState } from 'react';

type Event = { id: string; time: string; source: string; level: string; message: string };
type Metric = { name: string; value: number; unit: string; baseline: number };
type Incident = {
  id: string; title: string; summary: string; severity: string; status: string;
  synthetic: boolean; events: Event[]; metrics: Metric[]; hypotheses: string[]; unknowns: string[]
};
type Preview = { title?: string; allowed: boolean; status: string; reason: string; simulation_only: boolean; output?: unknown };
type Answer = { status: string; answer: string; model: string | null; evidence_ids: string[] };

const API = '/api/v1';

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [active, setActive] = useState('INC-DISK-001');
  const [question, setQuestion] = useState('Why is disk $DATA03 approaching capacity, and what should I verify first?');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [knowledge, setKnowledge] = useState('');

  useEffect(() => {
    fetch(API + '/incidents').then(r => {
      if (!r.ok) throw new Error('API is not available');
      return r.json() as Promise<Incident[]>;
    }).then(setIncidents).catch(err => setError(String(err)));
    fetch(API + '/knowledge/example').then(r => r.json())
      .then(data => setKnowledge(data.lesson + ' (Unverified synthetic example)'))
      .catch(() => setKnowledge('Example knowledge currently unavailable'));
  }, []);

  const incident = incidents.find(item => item.id === active);

  async function investigate() {
    setBusy(true); setAnswer(null); setError('');
    try {
      const r = await fetch(API + '/investigate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: active, question })
      });
      if (!r.ok) throw new Error('Investigation failed');
      setAnswer(await r.json() as Answer);
    } catch (err) { setError(String(err)); }
    finally { setBusy(false); }
  }

  async function inspect(action_id: string) {
    setPreview(null); setError('');
    try {
      const r = await fetch(API + '/diagnostics/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: active, action_id })
      });
      if (!r.ok) throw new Error('Preview unavailable');
      setPreview(await r.json() as Preview);
    } catch (err) { setError(String(err)); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark">△</div><div><strong>LEGACY</strong><small>NONSTOP BLACK BOX</small></div></div>
      <div className="navlabel">MISSION CONTROL</div>
      <div className="navitem selected">◈ &nbsp; Incident Investigation</div>
      <div className="navitem">◇ &nbsp; Decision DNA <span className="smalltag">Seed</span></div>
      <div className="navitem">▤ &nbsp; Shift Passport <span className="smalltag">Soon</span></div>
      <div className="sidebottom">CAIL Catalyst 2026<br /><span>Training sandbox · No live systems</span></div>
    </aside>
    <main className="main">
      <header><div><div className="eyebrow">MISSION-CRITICAL OPERATIONS · PROTOTYPE</div>
        <h1>Incident Black Box</h1><p>Observe evidence. Challenge assumptions. Preserve judgment.</p></div>
        <div className="indicator"><span className="dot"></span> SIMULATED · READ ONLY</div>
      </header>
      {error && <div className="error" role="alert">{error}</div>}
      <section className="summary">
        <div className="sectionhead"><h2>Choose an incident</h2><span>Two repeatable scenarios</span></div>
        <div className="incidents">{incidents.map(item => <button key={item.id} className={'incidentselect ' + (active === item.id ? 'active' : '')} onClick={() => { setActive(item.id); setAnswer(null); setPreview(null); }}>
          <span>{item.id}</span><strong>{item.title}</strong><small>{item.severity.toUpperCase()} · {item.status}</small>
        </button>)}</div>
      </section>
      {incident && <>
        <div className="grid">
          <section className="panel">
            <div className="sectionhead"><h2>Health and context</h2><span className="chip">SYNTHETIC DATA</span></div>
            <p>{incident.summary}</p>
            <div className="metrics">{incident.metrics.map(metric => <div className="metric" key={metric.name}>
              <small>{metric.name}</small><strong>{metric.value}<em>{metric.unit}</em></strong>
              <span>Baseline: {metric.baseline}{metric.unit}</span>
            </div>)}</div>
            <h3>Important unknowns</h3><div className="pills">{incident.unknowns.map(x => <span key={x}>{x}</span>)}</div>
          </section>
          <section className="panel">
            <div className="sectionhead"><h2>Event timeline</h2><span>Evidence, not conclusions</span></div>
            <div className="timeline">{incident.events.map(evt => <div className="event" key={evt.id}>
              <span className="node"></span><time>{evt.time}</time>
              <div><strong>{evt.id}</strong><p>{evt.message}</p><small>{evt.source} · {evt.level}</small></div>
            </div>)}</div>
          </section>
        </div>
        <section className="panel wide">
          <div className="sectionhead"><h2>Ask LEGACY</h2><span>Local Ollama · Evidence-based explanation</span></div>
          <div className="askrow"><input aria-label="Investigation question" value={question} maxLength={500} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void investigate(); }} />
            <button className="primary" disabled={busy || question.length < 3} onClick={() => void investigate()}>{busy ? 'Investigating…' : 'Investigate →'}</button></div>
          {answer && <div className="result"><div className="sectionhead"><strong>Evidence-aware response</strong><span>{answer.status} · {answer.model || 'fallback'}</span></div>
            <p>{answer.answer}</p><small>Available source IDs: {answer.evidence_ids.join(', ')}. Model output is unverified; follow documented procedures.</small>
          </div>}
        </section>
        <div className="grid">
          <section className="panel">
            <div className="sectionhead"><h2>Sentinel safety gate</h2><span>Default deny</span></div>
            <p>Preview an action. This prototype never sends commands to a production environment.</p>
            <div className="buttonrow"><button onClick={() => void inspect('inspect_disk_growth')}>Preview read-only inspection</button><button className="danger" onClick={() => void inspect('purge_files')}>Try unsafe file purge</button></div>
            {preview && <div className={'result ' + (preview.allowed ? 'allowed' : 'blocked')}>
              <strong>{preview.allowed ? '✓ Allowed: simulated preview' : '⛔ Blocked by policy'}</strong>
              <p>{preview.reason}</p>
              <small>No operational commands executed.</small>
            </div>}
          </section>
          <section className="panel">
            <div className="sectionhead"><h2>Decision DNA</h2><span className="chip">DRAFT · UNVERIFIED</span></div>
            <p>{knowledge}</p>
            <h3>What this demonstrates</h3>
            <p>Expert judgment must include rejected alternatives, missing prerequisites, evidence provenance, and human approval before reuse.</p>
            <div className="notice">This is a seeded example, not a claim of captured real CAIL expertise.</div>
          </section>
        </div>
      </>}
      <footer>LEGACY · synthetic educational demo · no automatic remediation · <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">Open API documentation ↗</a></footer>
    </main>
  </div>;
}
