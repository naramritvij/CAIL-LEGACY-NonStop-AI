"""Literal document evidence networks, independently implemented for CAIL.

Contains/mentions are textual relationships, never inferred infrastructure or
causal links. The existing document review/identity rules gate every projection.
"""
from __future__ import annotations

import hashlib
import re

from fastapi import HTTPException
from . import workspace_store as store, workspace_topology as topology

VERSION = 'literal-evidence-v1'
PRODUCTS = re.compile(r'\b(?:TMFCOM|TMF|TACL|PATHCOM|SCF|FUP|MEASCOM|MEASURE|PEEK|ASAP|MOMI)\b|\b(?:Pathway|Prognosis|NonStop)\b')
COMMAND = re.compile(r'\b(?:TMFCOM|PATHCOM|SCF|TACL|FUP|MEASCOM)[ \t]+(?:STATUS|INFO|SHOW|LIST|HELP|DISPLAY|ADD|ALTER|DELETE|START|STOP|RUN|ABORT|FREEZE|THAW)(?:[ \t]+[A-Z][A-Z0-9_.$-]*){0,3}\b')


def payload(document, chunks):
    nodes, edges, terms = [], [], {}
    for chunk in chunks:
        text, citation = chunk['content'], chunk['id']
        local = 'passage:' + citation
        heading = next((line.strip(' #\t') for line in text.splitlines() if line.strip()), 'Text passage')[:75]
        nodes.append({'id': local, 'label': heading + f" · {chunk['ordinal'] + 1}", 'type': 'passage',
                      'properties': {'citation_id': citation, 'document_id': document['id'], 'ordinal': chunk['ordinal'] + 1,
                                     'excerpt': text[:900], 'text_sha256': hashlib.sha256(text.encode()).hexdigest(),
                                     'relationship_basis': 'stored_text_not_operational_topology'}})
        references = [(match.group(), 'mentioned_term') for match in PRODUCTS.finditer(text)]
        references += [(match.group().strip(), 'command_reference') for match in COMMAND.finditer(text)]
        for name, kind in references:
            key = kind + ':' + name.casefold()
            if key not in terms:
                terms[key] = {'id': 'reference:' + hashlib.sha256(key.encode()).hexdigest()[:20], 'label': name, 'type': kind,
                              'properties': {'basis': 'literal_occurrence', 'executable': False, 'release_applicability': 'not_inferred'}}
            target = terms[key]['id']
            if not any(edge['source'] == local and edge['target'] == target for edge in edges[-len(references)-1:]):
                edges.append({'id': citation + ':' + target, 'source': local, 'target': target, 'label': 'mentions',
                              'properties': {'citation_id': citation, 'quoted_reference': name[:240]}})
    # Bounded distinct literal references; passage count is separately bounded by
    # the knowledge upload limits (2 million characters for reference manuals).
    if len(terms) > 4000:
        raise HTTPException(422, 'This document contains too many distinct command references.')
    return topology.normalize({'nodes': nodes + list(terms.values()), 'edges': edges})


def index(db, document_id):
    document = db.execute('SELECT * FROM ws_documents WHERE id=?', (document_id,)).fetchone()
    if not document:
        raise HTTPException(404, 'Document not found')
    # Imported topology already represents a network, rather than prose to index.
    if db.execute("SELECT 1 FROM ws_topology_datasets WHERE document_id=? AND source_kind!='document_evidence'", (document_id,)).fetchone():
        return False
    dataset_id = 'document-' + document_id
    chunks = db.execute('SELECT * FROM ws_chunks WHERE document_id=? ORDER BY ordinal', (document_id,)).fetchall()
    from .semantic_graph import index_document
    semantic_changed = index_document(db, document, chunks)
    digest = hashlib.sha256((VERSION + document['sha256']).encode()).hexdigest()
    previous = db.execute('SELECT structure_sha256 FROM ws_topology_datasets WHERE id=?', (dataset_id,)).fetchone()
    if previous and previous['structure_sha256'] == digest:
        return semantic_changed
    data = payload(document, chunks)
    db.execute('INSERT INTO ws_topology_datasets VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET sha256=excluded.sha256,structure_sha256=excluded.structure_sha256,updated_at=excluded.updated_at',
               (dataset_id, document_id, document['title'], 'document_evidence', None, None, None, document['sha256'], digest, store.now()))
    topology.write_payload(db, dataset_id, '', data)
    db.executemany('INSERT INTO ws_topology_edges VALUES (?,?,?,?,?,?,?)',
                   [('contains:' + chunk['id'], dataset_id, 'document:' + document_id,
                     topology.entity_id(dataset_id, '', 'passage:' + chunk['id']), 'contains', 'contains passage',
                     '{"basis":"stored_document_chunk"}') for chunk in chunks])
    return True


def index_owned(user, document_id=None):
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        if document_id:
            rows = db.execute('SELECT id FROM ws_documents WHERE id=? AND owner_id=?', (document_id, user['id'])).fetchall()
            if not rows:
                raise HTTPException(404, 'Owned document not found')
        else:
            from .semantic_graph import VERSION as SEMANTIC_VERSION
            rows = db.execute("SELECT d.id FROM ws_documents d LEFT JOIN ws_topology_datasets t ON t.document_id=d.id "
                              "LEFT JOIN ws_semantic_indexes s ON s.document_id=d.id WHERE d.owner_id=? AND "
                              "(t.id IS NULL OR s.document_id IS NULL OR s.version!=? OR s.sha256!=d.sha256) "
                              "AND (t.source_kind IS NULL OR t.source_kind='document_evidence') ORDER BY d.updated_at DESC LIMIT 20",
                              (user['id'], SEMANTIC_VERSION)).fetchall()
        count = sum(int(index(db, row['id'])) for row in rows)
        if count:
            store.event(db, user, 'document_network_indexed', detail={'documents': count})
        db.execute('COMMIT')
    return {'indexed_documents': count, 'batch_limit': 20, 'basis': 'literal_document_evidence', 'live_monitoring': False}
