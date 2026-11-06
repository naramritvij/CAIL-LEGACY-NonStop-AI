"""Bounded entity neighborhoods over stored relationships and readable evidence."""
from __future__ import annotations

import json

from . import semantic_graph as knowledge


def concept_nodes(db, user, identifiers):
    if not identifiers:
        return {}
    marks = ','.join('?' for _ in identifiers)
    rows = db.execute(
        'SELECT c.*,COUNT(DISTINCT m.document_id) AS evidence_documents,'
        'GROUP_CONCAT(DISTINCT m.document_id) AS support_docs FROM ws_concepts c '
        'JOIN ws_concept_mentions m ON m.concept_id=c.id JOIN ws_documents d ON d.id=m.document_id '
        f'WHERE c.id IN ({marks}) AND {knowledge.permitted()} GROUP BY c.id',
        (*sorted(identifiers), *knowledge.args(user))).fetchall()
    return {row['id']: {'id': row['id'], 'entity_id': row['id'], 'kind': 'entity',
        'entity_type': row['kind'], 'label': row['label'], 'subsystem': row['subsystem'],
        'status': 'documented_concept', 'source_kind': 'semantic_knowledge',
        'evidence_documents': row['evidence_documents'],
        'permission_dataset_ids': ['document-' + identifier for identifier in row['support_docs'].split(',')[:20]]}
        for row in rows}


def attachment_edge(row):
    guidance = bool(row['guidance'])
    return {'id': 'attachment:' + row['link_id'], 'source': 'document:' + row['document_id'],
            'target': row['target_node'], 'kind': 'applies_to' if guidance else 'documents',
            'label': 'applies to' if guidance else 'documents', 'created_at': row['created_at'],
            'document_id': row['document_id'], 'basis': 'author_selected_source_entity'}


def collection_edge(row, dataset, sources):
    native = dataset['source_kind'] == 'live_topology' and any(
        source['id'] == dataset['source_id'] and source.get('mode') != 'topology_gateway' for source in sources)
    if row['local_id'] != 'collection' or not (native or dataset['source_kind'] == 'monitoring_export'):
        return None
    parent = ('source:' + dataset['source_id'] if native else 'document:' + dataset['document_id'])
    return {'id': 'provenance:' + dataset['id'], 'source': parent, 'target': row['id'],
            'kind': 'provenance', 'label': 'supplied dataset', 'dataset_id': dataset['id'],
            'stale': dataset.get('stale', False)}


def entity_neighborhood(db, user, node, datasets, sources, limit=500):
    from .workspace_topology import project_node

    limit = max(1, min(500, limit))
    dataset = datasets[node['dataset_id']]
    identifier = node['id']
    properties = node['properties'] if isinstance(node['properties'], dict) else json.loads(node['properties'])
    candidates, total = [], 0

    # Prioritize canonical evidence and signed guidance before dense raw links.
    if dataset['source_kind'] == 'document_evidence' and node['entity_type'] == 'passage':
        citation_id = properties.get('citation_id')
        where = 'FROM ws_concept_mentions WHERE document_id=? AND citation_id=?'
        params = (dataset['document_id'], citation_id)
        total += db.execute('SELECT COUNT(*) ' + where, params).fetchone()[0]
        mentions = db.execute('SELECT * ' + where + ' ORDER BY id LIMIT ?', (*params, limit + 1)).fetchall()
        candidates.extend(knowledge.evidence_edge(mention) for mention in mentions)
        where = ('FROM ws_note_citations n JOIN ws_documents d ON d.id=n.document_id '
                 f'WHERE n.citation_id=? AND {knowledge.permitted()}')
        params = (citation_id, *knowledge.args(user))
        total += db.execute('SELECT COUNT(*) ' + where, params).fetchone()[0]
        citations = db.execute('SELECT n.*,d.status ' + where + ' ORDER BY n.document_id LIMIT ?',
                               (*params, limit + 1)).fetchall()
        candidates.extend(knowledge.citation_edge(row['document_id'], citation_id, dataset['document_id'],
                                                  row['relation'], row['status']) for row in citations)
    elif dataset['source_kind'] in ('monitoring_export', 'live_topology'):
        text = node['label'] + ' ' + str(properties.get('message', ''))
        available = concept_nodes(db, user, {match['id'] for match in knowledge.extract(text)})
        links = knowledge.observation_edges(identifier, text, available, dataset)
        candidates.extend(links)
        total += len(links)

    where = ('FROM ws_graph_links l JOIN ws_documents d ON d.id=l.document_id '
             f'WHERE l.target_node=? AND {knowledge.permitted()}')
    params = (identifier, *knowledge.args(user))
    total += db.execute('SELECT COUNT(*) ' + where, params).fetchone()[0]
    attachments = db.execute('SELECT l.*,l.id AS link_id,EXISTS '
        '(SELECT 1 FROM ws_expert_notes n WHERE n.document_id=d.id) AS guidance ' + where +
        ' ORDER BY l.created_at DESC,l.id LIMIT ?', (*params, limit + 1)).fetchall()
    candidates.extend(attachment_edge(row) for row in attachments)

    provenance = collection_edge(node, dataset, sources)
    if provenance:
        candidates.append(provenance)
        total += 1
    where = 'FROM ws_topology_edges WHERE dataset_id=? AND (source_node=? OR target_node=?)'
    params = (dataset['id'], identifier, identifier)
    total += db.execute('SELECT COUNT(*) ' + where, params).fetchone()[0]
    raw = db.execute('SELECT * ' + where + ' ORDER BY id LIMIT ?', (*params, limit + 1)).fetchall()
    candidates.extend({'id': row['id'], 'source': row['source_node'], 'target': row['target_node'],
        'kind': row['kind'], 'label': row['label'], 'dataset_id': dataset['id'],
        'stale': dataset.get('stale', False)} for row in raw)
    edges = list({edge['id']: edge for edge in candidates}.values())[:limit]
    ids = {identifier} | {edge['source'] for edge in edges} | {edge['target'] for edge in edges}
    marks = ','.join('?' for _ in ids)
    nodes = {row['id']: project_node(row, dataset) for row in db.execute(
        f'SELECT * FROM ws_topology_nodes WHERE dataset_id=? AND id IN ({marks})', (dataset['id'], *sorted(ids)))}
    nodes.update(concept_nodes(db, user, {item for item in ids if item.startswith('concept:')}))

    document_ids = sorted(item[len('document:'):] for item in ids if item.startswith('document:'))
    if document_ids:
        marks = ','.join('?' for _ in document_ids)
        documents = db.execute('SELECT d.*,p.name AS owner_name,n.category FROM ws_documents d '
            'JOIN ws_people p ON p.id=d.owner_id LEFT JOIN ws_expert_notes n ON n.document_id=d.id '
            f'WHERE d.id IN ({marks}) AND {knowledge.permitted()}', (*document_ids, *knowledge.args(user))).fetchall()
        by_document = {item['document_id']: item for item in datasets.values() if item['document_id']}
        for document in documents:
            linked_dataset = by_document.get(document['id'])
            display = {'id': 'document:' + document['id'], 'entity_id': document['id'], 'kind': 'document',
                       'label': document['title'], 'status': document['status'], 'owner_name': document['owner_name'],
                       'updated_at': document['updated_at']}
            if linked_dataset:
                display.update(dataset_id=linked_dataset['id'], source_kind=linked_dataset['source_kind'])
            if document['category']:
                display.update(entity_type='expert_note', category=document['category'],
                               **knowledge.note_state(db, document['id']))
            nodes[display['id']] = display
    if provenance and provenance['source'].startswith('source:'):
        parent = provenance['source']
        nodes[parent] = {'id': parent, 'entity_id': dataset['source_id'], 'kind': 'source', 'label': dataset['title'],
                        'status': 'stale' if dataset.get('stale') else 'connected', 'dataset_id': dataset['id'],
                        'source_kind': 'live_topology', 'observed_at': dataset['observed_at']}
    edges = [edge for edge in edges if edge['source'] in nodes and edge['target'] in nodes]
    return {'nodes': list(nodes.values()), 'edges': edges, 'total_edges': total, 'truncated': len(edges) < total}
