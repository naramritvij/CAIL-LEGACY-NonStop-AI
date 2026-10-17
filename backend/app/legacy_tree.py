"""Read-only visual lineage of locally approved Decision DNA.

This is a revision-lineage *forest*, not evidence of real operator mentoring,
actual lesson reuse, real-world outcomes or HPE-verified instructions.
"""
from __future__ import annotations

from .scenarios import get_incident
from .storage import list_lessons

_MAX_NODES = 100


def build_legacy_tree(incident_id: str | None = None) -> dict:
    """Return only approved, event-registered synthetic lesson nodes.

    The existing storage listing is capped at 100 rows. Counts and edges
    therefore describe *returned nodes only*, never a complete history.
    """
    lessons = list_lessons(incident_id=incident_id, status='approved')
    nodes = []
    for lesson in lessons:
        incident = get_incident(lesson['incident_id'])
        if incident is None:
            continue
        allowed_events = {event['id'] for event in incident['events']}
        cited_events = lesson.get('evidence_ids', [])
        if not cited_events or not set(cited_events).issubset(allowed_events):
            # Never offer a corrupted or unregistered provenance as UI evidence.
            continue
        nodes.append({
            'id': lesson['id'],
            'kind': 'locally_approved_decision_dna',
            'incident_id': lesson['incident_id'],
            'incident_title': incident['title'],
            'title': lesson['symptoms'][:100],
            'author_alias': lesson['author_alias'],
            'author_identity_verified': False,
            'review_status': 'approved',
            'reviewed_at': lesson['reviewed_at'],
            'source_event_ids': cited_events,
            'evidence_validation': 'registered_synthetic_event_ids_only',
            'revision_of': lesson.get('previous_lesson_id'),
            'reasoning_preview': lesson['reasoning'][:280],
            'prerequisites': lesson['prerequisites'][:10],
            'rejected_action': lesson['rejected_action'],
            'synthetic_training_context': True,
        })

    nodes.sort(key=lambda item: (item['reviewed_at'] or '', item['id']))
    visible = {node['id']: node for node in nodes}
    edges = []
    for node in nodes:
        parent_id = node['revision_of']
        parent = visible.get(parent_id) if parent_id else None
        if parent and parent['incident_id'] == node['incident_id']:
            edges.append({
                'from': parent_id, 'to': node['id'],
                'kind': 'approved_revision_of',
            })

    return {
        'synthetic': True,
        'review_scope': 'approved_only',
        'incident_id': incident_id,
        'nodes': nodes,
        'edges': edges,
        'returned_node_count': len(nodes),
        'returned_edge_count': len(edges),
        'maximum_returned_nodes': _MAX_NODES,
        'may_be_truncated': len(lessons) >= _MAX_NODES,
        'reuse_metrics_available': False,
        'identity_or_source_authenticity_verified': False,
        'lineage_semantics': (
            'An edge links two separately approved revisions of a local demo lesson; '
            'it does not count an expert mentoring session, reuse or learning outcome.'
        ),
        'limitations': (
            'Only locally reviewed, synthetic demo records with registered event IDs '
            'are shown. Approval does not authenticate authors or certify HPE '
            'applicability. Counts refer only to returned records, not a '
            'complete historical knowledge graph.'
        ),
    }
