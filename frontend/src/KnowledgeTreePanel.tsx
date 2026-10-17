import { useEffect, useState } from 'react';

type Node = {
  id: string; title: string; reasoning_preview: string;
  reviewed_at: string | null; revision_of: string | null;
  source_event_ids: string[]; synthetic_training_context: boolean;
};
type KnowledgeTree = {
  review_scope: string; synthetic: boolean; nodes: Node[];
  returned_node_count: number; reuse_metrics_available: boolean;
};

export default function KnowledgeTreePanel({ incidentId }: { incidentId: string }) {
  const [tree, setTree] = useState<KnowledgeTree | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setTree(null); setError('');
    const url = '/api/v1/knowledge/knowledge-tree?incident_id=' +
      encodeURIComponent(incidentId);
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('Approved tree unavailable'); return r.json(); })
      .then(data => { if (active) setTree(data as KnowledgeTree); })
      .catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [incidentId]);

  return <div className="knowledge-tree-panel">
    <h3>Knowledge Tree <span className="smalltag">Approved lessons only</span></h3>
    {error && <p role="alert">{error}</p>}
    {!tree && !error && <p>Loading reviewed knowledge…</p>}
    {tree && <>
      <p>{tree.returned_node_count} locally reviewed lesson node(s) for this scenario.</p>
      {tree.nodes.length === 0
        ? <p>No lesson is approved yet. An expert must submit evidence-backed
          Decision DNA and a separate reviewer must approve it before it appears.</p>
        : tree.nodes.map(node => <article key={node.id} className="knowledge-node">
            <strong>{node.title}</strong>
            <p>{node.reasoning_preview}</p>
            <small>Evidence: {node.source_event_ids.join(', ')}
              {node.revision_of ? ' · Revision of ' + node.revision_of : ''}
            </small>
          </article>)}
      <small>Only local demo approvals are represented; expert identity,
        live-system applicability and real-world reuse are not verified.
        Reviewed transcripts remain source material, not automatically expert-approved lessons.</small>
    </>}
  </div>;
}
