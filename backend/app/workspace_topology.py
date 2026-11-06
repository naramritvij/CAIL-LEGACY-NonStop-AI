"""Permission-scoped topology imports, live projections and document attachments.

Every visible node comes from a stored contribution or a source payload. No
sample network is seeded into the application and no missing links are inferred.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import csv
from datetime import datetime, timezone
import hashlib
from io import StringIO
import json
import math
import os
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import HTTPSHandler, Request, build_opener
from uuid import uuid4

from fastapi import HTTPException
from . import live_sources, workspace_store as store

VENDORS = ('prognosis', 'asap', 'momi')
MAX_BYTES = 16 * 1024 * 1024
MAX_NODES = 25000
MAX_EDGES = 100000
VIEW_NODES = 12000
VIEW_EDGES = 50000
PRIVATE_KEYS = ('password', 'secret', 'token', 'authorization', 'apikey', 'api_key', 'credential')


def bounded(value, field, maximum=200, default=None):
    if value is None and default is not None:
        value = default
    if isinstance(value, int) and not isinstance(value, bool):
        value = str(value)
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(f'{field} must contain 1–{maximum} characters')
    return value.strip()


def properties(raw):
    if raw is None:
        return {}
    if not isinstance(raw, dict) or len(raw) > 40:
        raise ValueError('Properties must be an object with at most 40 fields')
    result = {}
    for key, value in raw.items():
        if not isinstance(key, str) or len(key) > 80:
            raise ValueError('Invalid property name')
        if any(part in key.lower() for part in PRIVATE_KEYS):
            continue
        if value is None or isinstance(value, (str, bool, int, float)):
            if isinstance(value, str) and len(value) > 1000:
                raise ValueError('A property exceeds 1,000 characters')
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError('Non-finite property value')
            result[key] = value
        else:
            raise ValueError('Properties must be scalar values')
    return result


def normalize(raw):
    if not isinstance(raw, dict):
        raise ValueError('A topology must be a JSON object')
    nodes, edges = raw.get('nodes'), raw.get('edges', raw.get('links', []))
    if not isinstance(nodes, list) or not 1 <= len(nodes) <= MAX_NODES:
        raise ValueError(f'Provide 1–{MAX_NODES:,} nodes')
    if not isinstance(edges, list) or len(edges) > MAX_EDGES:
        raise ValueError(f'Provide at most {MAX_EDGES:,} relationships')
    found, normalized_nodes, normalized_edges = set(), [], []
    for item in nodes:
        if not isinstance(item, dict):
            raise ValueError('Each node must be an object')
        attributes = item.get('attributes', {})
        if not isinstance(attributes, dict):
            raise ValueError('Node attributes must be an object')
        identifier = bounded(item.get('id', item.get('key')), 'Node ID')
        if identifier in found:
            raise ValueError('Duplicate node ID: ' + identifier)
        found.add(identifier)
        normalized_nodes.append({'id': identifier,
            'label': bounded(item.get('label', attributes.get('label')), 'Node label', 240, identifier),
            'entity_type': bounded(item.get('type', item.get('entity_type', item.get('kind', attributes.get('type')))), 'Node type', 80, 'entity'),
            'status': bounded(item.get('status', attributes.get('status')), 'Node status', 80, 'observed'),
            'properties': properties(item.get('properties', {key: value for key, value in attributes.items() if key not in ('label', 'type', 'status', 'x', 'y', 'size', 'color')}))})
    edge_ids = set()
    for index, item in enumerate(edges):
        if not isinstance(item, dict):
            raise ValueError('Each relationship must be an object')
        source, target = bounded(item.get('source'), 'Relationship source'), bounded(item.get('target'), 'Relationship target')
        if source not in found or target not in found:
            raise ValueError('A relationship references a missing node')
        attributes = item.get('attributes', {})
        if not isinstance(attributes, dict):
            raise ValueError('Relationship attributes must be an object')
        label = bounded(item.get('label', item.get('relationship', attributes.get('label'))), 'Relationship label', 120, 'connected to')
        identifier = bounded(item.get('id', item.get('key')), 'Relationship ID', 200,
                             hashlib.sha256(f'{source}|{target}|{label}|{index}'.encode()).hexdigest()[:24])
        if identifier in edge_ids:
            raise ValueError('Duplicate relationship ID: ' + identifier)
        edge_ids.add(identifier)
        normalized_edges.append({'id': identifier, 'source': source, 'target': target, 'label': label,
                                 'properties': properties(item.get('properties', {}))})
    return {'nodes': normalized_nodes, 'edges': normalized_edges}


def parse_file(filename, content):
    if len(content) > MAX_BYTES:
        raise ValueError('Topology imports are limited to 16 MB')
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise ValueError('Use a UTF-8 JSON or CSV file') from None
    if filename.lower().endswith('.json'):
        try:
            return normalize(json.loads(text))
        except json.JSONDecodeError:
            raise ValueError('Invalid JSON file') from None
    if not filename.lower().endswith('.csv'):
        raise ValueError('Choose a JSON or CSV topology export')
    csv.field_size_limit(5000)
    reader = csv.DictReader(StringIO(text))
    fields = set(reader.fieldnames or [])
    nodes, edges = {}, []
    try:
        if {'source', 'target'} <= fields:
            for index, row in enumerate(reader):
                if index >= MAX_EDGES:
                    raise ValueError('CSV relationship limit exceeded')
                for endpoint in ('source', 'target'):
                    key = row.get(endpoint)
                    nodes.setdefault(key, {'id': key, 'label': row.get(endpoint + '_label') or key,
                                           'type': row.get(endpoint + '_type') or 'entity'})
                edges.append({'source': row['source'], 'target': row['target'], 'label': row.get('relationship') or row.get('label') or 'connected to'})
                if len(nodes) > MAX_NODES:
                    raise ValueError('CSV node limit exceeded')
        elif 'id' in fields:
            for index, row in enumerate(reader):
                if index >= MAX_NODES or row['id'] in nodes:
                    raise ValueError('CSV has duplicate IDs or exceeds the node limit')
                nodes[row['id']] = {'id': row['id'], 'label': row.get('label') or row['id'], 'type': row.get('type') or 'entity',
                                    'properties': {key: value for key, value in row.items() if key not in ('id', 'label', 'type')}}
        else:
            raise ValueError('CSV needs source,target relationship columns or id,label node columns')
    except csv.Error:
        raise ValueError('Invalid or oversized CSV field') from None
    return normalize({'nodes': list(nodes.values()), 'edges': edges})


def entity_id(dataset_id, system_id, local_id):
    digest = hashlib.sha256((system_id + '\0' + local_id).encode()).hexdigest()[:24]
    return f'entity:{dataset_id}:{digest}'


def write_payload(db, dataset_id, system_id, payload):
    db.execute('DELETE FROM ws_topology_edges WHERE dataset_id=?', (dataset_id,))
    db.execute('DELETE FROM ws_topology_nodes WHERE dataset_id=?', (dataset_id,))
    mapping = {node['id']: entity_id(dataset_id, system_id, node['id']) for node in payload['nodes']}
    db.executemany('INSERT INTO ws_topology_nodes VALUES (?,?,?,?,?,?,?)',
                   [(mapping[node['id']], dataset_id, node['id'], node['label'], node['entity_type'], node['status'], json.dumps(node['properties'])) for node in payload['nodes']])
    db.executemany('INSERT INTO ws_topology_edges VALUES (?,?,?,?,?,?,?)',
                   [(f'relation:{dataset_id}:' + hashlib.sha256(edge['id'].encode()).hexdigest()[:24], dataset_id,
                     mapping[edge['source']], mapping[edge['target']], 'source_relationship', edge['label'], json.dumps(edge['properties'])) for edge in payload['edges']])


def structure_digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def import_dataset(user, title, filename, content, *, supplied_payload=None, source_kind='imported_export'):
    try:
        payload = normalize(supplied_payload) if supplied_payload is not None else parse_file(filename, content)
        title = bounded(title, 'Dataset title', 160)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from None
    dataset_id, timestamp = 'import-' + str(uuid4()), store.now()
    digest = hashlib.sha256(content).hexdigest()
    summary = (f'User-supplied topology export: {title}. Contains {len(payload["nodes"])} nodes and {len(payload["edges"])} supplied relationships. '
               'Imported snapshot; not a verified live CAIL connection. Dataset digest: ' + digest)
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        doc_id = store.insert_document(db, user, title, filename, summary, 'Imported topology', build_network=False)
        db.execute('INSERT INTO ws_topology_datasets VALUES (?,?,?,?,?,?,?,?,?,?)',
                   (dataset_id, doc_id, title, source_kind, None, None, None, digest, structure_digest(payload), timestamp))
        write_payload(db, dataset_id, '', payload)
        store.event(db, user, 'topology_imported', doc_id, {'nodes': len(payload['nodes']), 'relationships': len(payload['edges'])})
        db.execute('COMMIT')
    return {'dataset_id': dataset_id, 'document_id': doc_id, 'node_count': len(payload['nodes']), 'edge_count': len(payload['edges']),
            'source_kind': source_kind, 'live': False, 'status': 'draft'}


def config(source_id):
    if source_id not in VENDORS or not live_sources._enabled():
        raise HTTPException(503, 'Live topology source is disabled or unknown')
    from urllib.parse import urlsplit
    url = os.getenv(f'CAIL_LIVE_{source_id.upper()}_TOPOLOGY_URL', '').strip()
    token = os.getenv(f'CAIL_LIVE_{source_id.upper()}_TOKEN', '').strip()
    parsed = urlsplit(url)
    allowed = {host.strip().lower() for host in os.getenv('CAIL_LIVE_ALLOWED_HOSTS', '').split(',') if host.strip()}
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.hostname.lower() not in allowed or
            parsed.username or parsed.password or parsed.fragment or len(token) < 24):
        raise HTTPException(503, 'Live topology endpoint is not securely configured')
    return url, token


def capabilities(user):
    items = []
    for source_id in VENDORS:
        from . import vendor_datasets
        try:
            if vendor_datasets.mode(source_id):
                vendor_datasets.configured(source_id)
            else:
                config(source_id)
            configured = True
        except HTTPException:
            configured = False
        items.append({'id': source_id, 'configured': configured, 'can_sync': configured and user['can_read_live'],
                      'mode': vendor_datasets.mode(source_id) or 'topology_gateway'})
    return items


def connection_states(user):
    result = {item['id']: {'topology_configured': item['configured'], 'topology_connected': False, 'topology_node_count': 0, 'topology_observed_at': None, 'topology_mode': item['mode']} for item in capabilities(user)}
    if user['can_read_live']:
        with store.database() as db:
            for dataset in visible_datasets(db, user):
                if dataset['source_kind'] != 'live_topology':
                    continue
                result[dataset['source_id']].update({'topology_connected': not dataset['stale'], 'topology_observed_at': dataset['observed_at'],
                    'topology_node_count': db.execute('SELECT COUNT(*) AS n FROM ws_topology_nodes WHERE dataset_id=?', (dataset['id'],)).fetchone()['n']})
    return result


def read_live(source_id):
    from . import vendor_datasets
    if vendor_datasets.mode(source_id):
        return vendor_datasets.read(source_id)
    url, token = config(source_id)
    request = Request(url, method='GET', headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
    try:
        opener = build_opener(live_sources._NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
        with opener.open(request, timeout=15) as response:
            if response.status != 200 or 'application/json' not in response.headers.get('Content-Type', ''):
                raise ValueError()
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError()
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get('source_id') != source_id:
            raise ValueError()
        system = bounded(data.get('system_id'), 'System ID', 120)
        observed = live_sources._timestamp(data.get('observed_at'))
        age = (datetime.now(timezone.utc) - observed).total_seconds()
        if not -60 <= age <= live_sources.MAX_AGE_SECONDS:
            raise ValueError()
        payload = normalize(data)
        return {'payload': payload, 'system_id': system, 'observed_at': observed.isoformat(), 'sha256': hashlib.sha256(raw).hexdigest()}
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError, KeyError):
        raise HTTPException(502, 'Topology source unavailable, stale or invalid. No sample data substituted.') from None


def sync(user, source_ids=None):
    if not user['can_read_live']:
        raise HTTPException(403, 'This operator does not have live read access.')
    configured = [item['id'] for item in capabilities(user) if item['can_sync'] and (source_ids is None or item['id'] in source_ids)]
    def fetch(source_id):
        try:
            data = read_live(source_id)
            payload, dataset_id = data['payload'], 'live-' + source_id
            shape = structure_digest(payload)
            with store.database() as db:
                db.execute('BEGIN IMMEDIATE')
                old = db.execute('SELECT structure_sha256,system_id FROM ws_topology_datasets WHERE id=?', (dataset_id,)).fetchone()
                db.execute('INSERT INTO ws_topology_datasets VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET system_id=excluded.system_id,observed_at=excluded.observed_at,sha256=excluded.sha256,structure_sha256=excluded.structure_sha256,updated_at=excluded.updated_at',
                           (dataset_id, None, source_id.upper(), 'live_topology', source_id, data['system_id'], data['observed_at'], data['sha256'], shape, store.now()))
                if not old or old['structure_sha256'] != shape or old['system_id'] != data['system_id']:
                    write_payload(db, dataset_id, data['system_id'], payload)
                db.execute('INSERT INTO ws_topology_sync VALUES (?,?,?) ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,attempted_at=excluded.attempted_at', (source_id, 'connected', store.now()))
                store.event(db, user, 'topology_synced', detail={'source_id': source_id, 'nodes': len(payload['nodes'])})
                db.execute('COMMIT')
            return {'id': source_id, 'status': 'connected', 'node_count': len(payload['nodes']), 'edge_count': len(payload['edges']), 'observed_at': data['observed_at']}
        except HTTPException as exc:
            with store.database() as db:
                db.execute('INSERT INTO ws_topology_sync VALUES (?,?,?) ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,attempted_at=excluded.attempted_at', (source_id, 'unavailable', store.now()))
                store.event(db, user, 'topology_unavailable', detail={'source_id': source_id})
            return {'id': source_id, 'status': 'unavailable', 'reason': str(exc.detail)}
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(fetch, configured))
    return {'sources': results, 'configured_sources': len(configured)}


def visible_datasets(db, user):
    from . import vendor_datasets
    allowed_live = {item['id'] for item in capabilities(user) if item['can_sync']}
    native_scopes = {source: vendor_datasets.canonical_system(os.getenv(f'CAIL_{source.upper()}_SYSTEM_ID', '')) for source in allowed_live if vendor_datasets.mode(source)}
    rows = db.execute('SELECT t.*,d.owner_id,d.status AS review_status FROM ws_topology_datasets t LEFT JOIN ws_documents d ON d.id=t.document_id').fetchall()
    visible = [dict(row) for row in rows if
            (row['source_kind'] == 'live_topology' and row['source_id'] in allowed_live and
             (row['source_id'] not in native_scopes or vendor_datasets.canonical_system(row['system_id']) == native_scopes[row['source_id']])) or
            (row['source_kind'] in ('imported_export', 'document_evidence', 'monitoring_export') and store.can_see({'status': row['review_status'], 'owner_id': row['owner_id']}, user))]
    for dataset in visible:
        if dataset['source_kind'] == 'live_topology':
            state = db.execute('SELECT status FROM ws_topology_sync WHERE source_id=?', (dataset['source_id'],)).fetchone()
            age = (datetime.now(timezone.utc) - live_sources._timestamp(dataset['observed_at'])).total_seconds()
            dataset['stale'] = not state or state['status'] != 'connected' or age > live_sources.MAX_AGE_SECONDS
    return visible


def require_node(db, user, node_id):
    if node_id.startswith('concept:'):
        from .semantic_graph import require_concept
        return require_concept(db, user, node_id)
    if node_id.startswith('entity:'):
        row = db.execute('SELECT * FROM ws_topology_nodes WHERE id=?', (node_id,)).fetchone()
        if row and row['dataset_id'] in {item['id'] for item in visible_datasets(db, user)}:
            return dict(row)
    elif node_id.startswith('document:'):
        row = db.execute('SELECT * FROM ws_documents WHERE id=?', (node_id[len('document:'):],)).fetchone()
        if row and store.can_see(row, user):
            return dict(row)
    elif node_id.startswith('person:'):
        from .semantic_graph import permitted, args
        pid = node_id[len('person:'):]
        allowed = pid == user['id'] or db.execute(
            f'SELECT 1 FROM ws_documents d WHERE d.owner_id=? AND {permitted()} LIMIT 1',
            (pid, *args(user))).fetchone() or db.execute(
                'SELECT 1 FROM ws_events e JOIN ws_documents d ON d.id=e.document_id '
                f"WHERE e.person_id=? AND e.kind IN ('viewed','retrieved') AND {permitted()} LIMIT 1",
                (pid, *args(user))).fetchone() or db.execute(
                'SELECT 1 FROM ws_learning_activity a JOIN ws_documents d ON d.id=a.document_id '
                'JOIN ws_learning_profiles p ON p.person_id=a.person_id '
                f'WHERE a.person_id=? AND a.shared=1 AND p.share_activity=1 AND {permitted()} LIMIT 1',
                (pid, *args(user))).fetchone()
        person = db.execute('SELECT * FROM ws_people WHERE id=?', (pid,)).fetchone()
        if allowed and person:
            return {'id': node_id, 'label': person['name']}
    elif node_id.startswith('source:') and node_id[len('source:'):] in {item['source_id'] for item in visible_datasets(db, user) if item['source_kind'] == 'live_topology'}:
        return {'id': node_id, 'label': node_id[len('source:'):].upper()}
    raise HTTPException(404, 'Graph node not found or not accessible')


def link_document(user, document_id, target_node_id):
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        doc = db.execute('SELECT * FROM ws_documents WHERE id=?', (document_id,)).fetchone()
        if not doc or doc['owner_id'] != user['id']:
            raise HTTPException(404, 'Owned document not found')
        require_node(db, user, target_node_id)
        db.execute('INSERT OR IGNORE INTO ws_graph_links VALUES (?,?,?,?,?)', (str(uuid4()), document_id, target_node_id, user['id'], store.now()))
        store.event(db, user, 'linked', document_id, {'target_node_id': target_node_id})
        db.execute('COMMIT')
    return {'linked': True, 'document_id': document_id, 'target_node_id': target_node_id}


def cursor(user):
    with store.database() as db:
        revision = db.execute('SELECT COALESCE(MAX(sequence),0) AS n FROM ws_events').fetchone()['n']
    scopes = [os.getenv('CAIL_PROGNOSIS_SYSTEM_ID', ''), os.getenv('CAIL_MOMI_SYSTEM_ID', '')]
    from .semantic_graph import VERSION
    view = [revision, VERSION, user['id'], user['can_review'], user['can_read_live'], capabilities(user), scopes, int(datetime.now(timezone.utc).timestamp() / 30)]
    return hashlib.sha256(json.dumps(view, sort_keys=True).encode()).hexdigest()[:24], revision


def graph(user, node_limit=VIEW_NODES, edge_limit=VIEW_EDGES):
    # Return the revision from BEFORE reading, so a write racing this projection
    # is picked up on the very next poll rather than cached as already seen.
    current_cursor, revision = cursor(user)
    base = store.knowledge_graph(user)
    base_sources = capabilities(user)
    nodes, edges = base['nodes'], base['edges']
    base_node_count = len(nodes)
    metadata = []
    with store.database() as db:
        db.execute('BEGIN')
        from . import semantic_graph as semantic
        from .graph_navigation import attachment_edge, collection_edge
        semantic_nodes, semantic_edges, semantic_meta = semantic.project(db, user)
        # Merge note/person metadata without dropping existing contributor fields.
        merged = {n['id']: n for n in nodes}
        for node in semantic_nodes:
            merged[node['id']] = {**merged.get(node['id'], {}), **node}
        nodes = list(merged.values())
        edges.extend(semantic_edges)
        base_node_count = len(nodes)
        profiles = semantic_meta.pop('profiles')
        base['events'] = [e for e in base['events'] if e['kind'] not in ('question_linked', 'knowledge_demonstrated', 'explanation_submitted', 'explanation_reviewed') or
                          e['person_id'] == user['id'] or (
                              profiles.get(e['person_id'], {}).get('share_activity') and db.execute(
                                  'SELECT 1 FROM ws_learning_activity WHERE person_id=? AND document_id=? AND shared=1 LIMIT 1',
                                  (e['person_id'], e['document_id'])).fetchone())]
        for node in nodes:
            if node['kind'] == 'person':
                node['person_role'] = profiles.get(node['entity_id'], {}).get('role', 'contributor')
        concept_ids = {n['id'] for n in semantic_nodes if n['id'].startswith('concept:')}
        datasets = visible_datasets(db, user)
        for dataset in datasets:
            if dataset['source_kind'] == 'live_topology':
                state = db.execute('SELECT status FROM ws_topology_sync WHERE source_id=?', (dataset['source_id'],)).fetchone()
                age = (datetime.now(timezone.utc) - live_sources._timestamp(dataset['observed_at'])).total_seconds()
                stale = not state or state['status'] != 'connected' or age > live_sources.MAX_AGE_SECONDS
                parent = 'source:' + dataset['source_id']
                nodes.append({'id': parent, 'entity_id': dataset['source_id'], 'kind': 'source', 'label': dataset['title'],
                              'status': 'stale' if stale else 'connected', 'source_kind': 'live_topology', 'dataset_id': dataset['id'], 'observed_at': dataset['observed_at']})
            else:
                stale = False
                parent = 'document:' + dataset['document_id']
                subjects = {m['subsystem'] for m in semantic.extract(dataset['title']) if m['kind'] == 'subsystem'}
                document_subsystem = next(iter(subjects)) if len(subjects) == 1 else ''
                for node in nodes:
                    if node['id'] == parent:
                        node['dataset_id'] = dataset['id']
                        node['source_kind'] = dataset['source_kind']
                        node['subsystem'] = document_subsystem
            count = db.execute('SELECT COUNT(*) AS n FROM ws_topology_nodes WHERE dataset_id=?', (dataset['id'],)).fetchone()['n']
            relation_count = db.execute('SELECT COUNT(*) AS n FROM ws_topology_edges WHERE dataset_id=?', (dataset['id'],)).fetchone()['n']
            metadata.append({'id': dataset['id'], 'title': dataset['title'], 'document_id': dataset['document_id'], 'source_kind': dataset['source_kind'],
                             'source_id': dataset['source_id'], 'system_id': dataset['system_id'], 'node_count': count, 'edge_count': relation_count, 'observed_at': dataset['observed_at'],
                             'stale': stale, 'status': dataset['review_status'] or ('stale' if stale else 'connected'), 'sha256': dataset['sha256']})
            remaining = max(0, node_limit - len(nodes))
            if not remaining:
                continue
            rows = db.execute('SELECT * FROM ws_topology_nodes WHERE dataset_id=? ORDER BY id LIMIT ?', (dataset['id'], remaining)).fetchall()
            for row in rows:
                nodes.append({'id': row['id'], 'entity_id': row['local_id'], 'kind': 'entity', 'label': row['label'],
                              'entity_type': row['entity_type'], 'status': 'stale' if stale else row['status'], 'dataset_id': dataset['id'],
                              'source_kind': dataset['source_kind'], 'observed_at': dataset['observed_at'], 'stale': stale,
                              'subsystem': document_subsystem if dataset['source_kind'] == 'document_evidence' else ''})
                if dataset['source_kind'] in ('live_topology', 'monitoring_export'):
                    text = row['label'] + ' ' + str(json.loads(row['properties']).get('message', ''))
                    edges.extend(semantic.observation_edges(row['id'], text, concept_ids, dataset))
                provenance = collection_edge(row, dataset, base_sources)
                if provenance:
                    edges.append(provenance)
            for row in db.execute('SELECT id,source_node,target_node,kind,label FROM ws_topology_edges WHERE dataset_id=? LIMIT ?', (dataset['id'], max(0, edge_limit - len(edges)))):
                edges.append({'id': row['id'], 'source': row['source_node'], 'target': row['target_node'], 'kind': row['kind'], 'label': row['label'], 'dataset_id': dataset['id'], 'stale': stale})
        allowed_ids = {node['id'] for node in nodes}
        for row in db.execute('SELECT l.*,l.id AS link_id,EXISTS (SELECT 1 FROM ws_expert_notes n WHERE n.document_id=l.document_id) AS guidance FROM ws_graph_links l ORDER BY l.created_at DESC'):
            source = 'document:' + row['document_id']
            if source in allowed_ids and row['target_node'] in allowed_ids:
                edges.append(attachment_edge(row))
    total_nodes = base_node_count + sum(item['node_count'] + int(item['source_kind'] == 'live_topology') for item in metadata)
    nodes = nodes[:node_limit]
    ids = {node['id'] for node in nodes}
    edges = [edge for edge in edges if edge['source'] in ids and edge['target'] in ids]
    total_edges = len(edges)
    edges = edges[:edge_limit]
    return {**base, 'nodes': nodes, 'edges': edges, 'datasets': metadata, 'sources': base_sources, 'semantic': semantic_meta,
            'cursor': current_cursor, 'revision': revision, 'total_nodes': total_nodes, 'total_edges': total_edges,
            'truncated': base['truncated'] or total_nodes > node_limit or total_edges > edge_limit,
            'node_limit': node_limit, 'edge_limit': edge_limit}


def detail(user, node_id):
    with store.database() as db:
        if node_id.startswith('concept:'):
            from .semantic_graph import detail as concept_detail
            return concept_detail(db, user, node_id)
        node = require_node(db, user, node_id)
        if node_id.startswith('entity:'):
            node['properties'] = json.loads(node['properties'])
            dataset = db.execute('SELECT * FROM ws_topology_datasets WHERE id=?', (node['dataset_id'],)).fetchone()
            node['source_kind'], node['observed_at'], node['sha256'] = dataset['source_kind'], dataset['observed_at'], dataset['sha256']
            node['system_id'] = dataset['system_id']
            if dataset['source_kind'] == 'document_evidence' and node['entity_type'] == 'passage':
                chunk = db.execute('SELECT content FROM ws_chunks WHERE id=? AND document_id=?', (node['properties'].get('citation_id'), dataset['document_id'])).fetchone()
                if chunk:
                    node['properties']['excerpt'] = chunk['content']
            datasets = {item['id']: item for item in visible_datasets(db, user)}
            state = datasets[dataset['id']]
            node['stale'] = state.get('stale', False)
            if node['stale']:
                node['status'] = 'stale'
            from .graph_navigation import entity_neighborhood
            node['relationship_count'] = entity_neighborhood(db, user, node, datasets, capabilities(user))['total_edges']
        return node


def project_node(row, dataset):
    stale = dataset.get('stale', False)
    from .semantic_graph import extract
    subjects = {match['subsystem'] for match in extract(dataset['title']) if match['kind'] == 'subsystem'} if dataset['source_kind'] == 'document_evidence' else set()
    return {'id': row['id'], 'entity_id': row['local_id'], 'kind': 'entity', 'label': row['label'],
            'entity_type': row['entity_type'], 'status': 'stale' if stale else row['status'],
            'dataset_id': dataset['id'], 'source_kind': dataset['source_kind'], 'observed_at': dataset['observed_at'], 'stale': stale,
            'subsystem': next(iter(subjects)) if len(subjects) == 1 else ''}


def search(user, query):
    with store.database() as db:
        from .semantic_graph import concept_rows
        semantic_nodes = [{'id': r['id'], 'entity_id': r['id'], 'kind': 'entity', 'entity_type': r['kind'],
                           'label': r['label'], 'subsystem': r['subsystem'], 'status': 'documented_concept',
                           'source_kind': 'semantic_knowledge', 'permission_dataset_ids': ['document-' + d for d in r['support_docs'].split(',')[:20]]} for r in concept_rows(db, user, query, 30)]
        datasets = {item['id']: item for item in visible_datasets(db, user)}
        if not datasets:
            return {'nodes': semantic_nodes}
        placeholders = ','.join('?' for _ in datasets)
        term = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        rows = db.execute(f"SELECT * FROM ws_topology_nodes WHERE dataset_id IN ({placeholders}) AND (label LIKE ? ESCAPE '\\' OR local_id LIKE ? ESCAPE '\\') ORDER BY label LIMIT 50", (*datasets, term, term)).fetchall()
        return {'nodes': semantic_nodes + [project_node(row, datasets[row['dataset_id']]) for row in rows][:50-len(semantic_nodes)]}


def neighborhood(user, node_id, limit=500):
    with store.database() as db:
        if node_id.startswith('concept:'):
            from .semantic_graph import neighborhood as semantic_neighborhood
            return semantic_neighborhood(db, user, node_id, limit)
        node = require_node(db, user, node_id)
        if not node_id.startswith('entity:'):
            base = graph(user)
            edges = [edge for edge in base['edges'] if edge['source'] == node_id or edge['target'] == node_id][:limit]
            ids = {node_id} | {edge['source'] for edge in edges} | {edge['target'] for edge in edges}
            return {'nodes': [row for row in base['nodes'] if row['id'] in ids], 'edges': edges, 'truncated': len(edges) == limit}
        from .graph_navigation import entity_neighborhood
        datasets = {item['id']: item for item in visible_datasets(db, user)}
        return entity_neighborhood(db, user, node, datasets, capabilities(user), limit)
